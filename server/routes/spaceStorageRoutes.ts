// server/routes/spaceStorageRoutes.ts
// MANWAH Space Studio｜统一存储管理与签名访问路由 V3.0
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { GcsAssetStorage } from '../services/storage/gcsAssetStorage';
import { SpaceImageGenerationService } from '../services/spaceImageGenerationService';
import crypto from 'crypto';

const router = Router();
const storage = GcsAssetStorage.getInstance();

const SignedUploadSchema = z.object({
  objectKey: z.string().min(3).max(512),
  bucketType: z.enum(['source', 'generated', 'export']).optional(),
  contentType: z.string().min(3).max(128).optional(),
  ttlSeconds: z.number().min(60).max(86400).optional()
});

const SignedReadSchema = z.object({
  key: z.string().min(3).max(512),
  bucketType: z.enum(['source', 'generated', 'export']).optional(),
  ttlSeconds: z.coerce.number().min(60).max(86400).optional()
});

/**
 * GET /api/space/storage/status
 * 查询当前 GCS 存储核心状态与可用性
 */
router.get('/status', (_req: Request, res: Response) => {
  try {
    const status = storage.getStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve storage status'
    });
  }
});

/**
 * POST /api/space/storage/signed-upload
 * 请求签名上传凭证
 */
router.post('/signed-upload', async (req: Request, res: Response) => {
  try {
    const parsed = SignedUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request payload',
        details: parsed.error.issues
      });
    }

    const result = await storage.getSignedUploadUrl({
      objectKey: parsed.data.objectKey,
      bucketType: parsed.data.bucketType,
      contentType: parsed.data.contentType,
      ttlSeconds: parsed.data.ttlSeconds
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate signed upload URL'
    });
  }
});

/**
 * GET /api/space/storage/signed-read
 * 请求签名读取凭证
 */
router.get('/signed-read', async (req: Request, res: Response) => {
  try {
    const parsed = SignedReadSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: parsed.error.issues
      });
    }

    const result = await storage.getSignedReadUrl(
      parsed.data.key,
      parsed.data.ttlSeconds || 900,
      parsed.data.bucketType
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate signed read URL'
    });
  }
});

/**
 * GET /api/space/storage/local-file
 * GET /api/space/storage/download
 * 空间对象资产预览与直链读取 (支持 GCS 签名重定向与受控流式直通)
 */
router.get(['/local-file', '/download'], async (req: Request, res: Response) => {
  try {
    const key = req.query.key as string;
    if (!key || key.includes('..')) {
      return res.status(400).send('Invalid objectKey');
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const resolveAndSendBuffer = async (data: Buffer, fallbackKey: string) => {
      const sample = data.subarray(0, 120).toString('utf-8').trimStart();
      const isSvg = sample.startsWith('<svg') || sample.startsWith('<?xml');

      // 若内容为 SVG 但请求 key 要求位图格式（.webp / .png / .jpg），优先通过 sharp 转换为真实位图
      if (isSvg && (fallbackKey.endsWith('.webp') || fallbackKey.endsWith('.png') || fallbackKey.endsWith('.jpg'))) {
        try {
          const converted = await sharp(data).webp({ quality: 90 }).toBuffer();
          res.setHeader('Content-Type', 'image/webp');
          return res.end(converted);
        } catch {
          // sharp 转换失败时，回退到正确的 svg 格式
          res.setHeader('Content-Type', 'image/svg+xml');
          return res.end(data);
        }
      }

      if (isSvg) {
        res.setHeader('Content-Type', 'image/svg+xml');
      } else if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
        res.setHeader('Content-Type', 'image/webp');
      } else if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
        res.setHeader('Content-Type', 'image/jpeg');
      } else if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x4e && data[2] === 0x47) {
        res.setHeader('Content-Type', 'image/png');
      } else if (fallbackKey.endsWith('.webp')) {
        res.setHeader('Content-Type', 'image/webp');
      } else if (fallbackKey.endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
      } else if (fallbackKey.endsWith('.jpg') || fallbackKey.endsWith('.jpeg')) {
        res.setHeader('Content-Type', 'image/jpeg');
      } else if (fallbackKey.endsWith('.svg')) {
        res.setHeader('Content-Type', 'image/svg+xml');
      } else {
        res.setHeader('Content-Type', 'application/octet-stream');
      }
      return res.end(data);
    };

    const filePath = storage.getLocalFilePath(key);
    if (filePath && fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath);
      return await resolveAndSendBuffer(data, key);
    }

    // 若本地文件未就绪，尝试从 GCS/Object Storage 读取 Buffer 并流式直通响应 (避免重定向跨域与 NoSuchKey)
    try {
      const buf = await storage.getBuffer(key);
      if (buf && buf.length > 0) {
        return await resolveAndSendBuffer(buf, key);
      }
    } catch (streamErr: any) {
      console.warn(`[spaceStorageRoutes] Direct buffer stream error for ${key}:`, streamErr.message);
    }

    // 若流式读取无果，尝试最后从 GCS 获取签名重定向
    try {
      const signed = await storage.getSignedReadUrl(key, 900, 'generated');
      if (signed && signed.url && signed.url !== `/api/space/storage/local-file?key=${encodeURIComponent(key)}`) {
        return res.redirect(signed.url);
      }
    } catch {}

    // 尝试从本地/云端工程快照中恢复产品内联 Base64 参考图（例如 ref_1.webp 在容器重启后未单独落盘但快照中保有 publicUrl data:image/...）
    try {
      const projectsDir = path.join(process.cwd(), '.data', 'space-projects');
      if (fs.existsSync(projectsDir)) {
        const files = fs.readdirSync(projectsDir).filter((f) => f.endsWith('.json'));
        for (const f of files) {
          const snapRaw = fs.readFileSync(path.join(projectsDir, f), 'utf-8');
          if (!snapRaw.includes(key)) continue;
          const snap = JSON.parse(snapRaw);
          for (const prod of snap?.products || []) {
            for (const ref of prod?.referenceImages || []) {
              if (ref?.objectKey === key && typeof ref?.publicUrl === 'string' && ref.publicUrl.startsWith('data:image/')) {
                const b64Match = ref.publicUrl.match(/^data:([^;]+);base64,(.+)$/);
                if (b64Match) {
                  const rawBuf = Buffer.from(b64Match[2], 'base64');
                  const finalBuf = key.endsWith('.webp') ? await sharp(rawBuf).webp({ quality: 92 }).toBuffer() : rawBuf;
                  await storage.put({
                    bucketType: 'source',
                    objectKey: key,
                    buffer: finalBuf,
                    contentType: key.endsWith('.webp') ? 'image/webp' : b64Match[1]
                  });
                  return await resolveAndSendBuffer(finalBuf, key);
                }
              }
            }
          }
        }
      }
    } catch {}

    // 仅在自动化测试环境下保留确定性 SVG 响应（且严禁覆写存储），生产环境真实返回 404 + no-store，杜绝将卡通 SVG 占位图伪装成真实生图结果并强缓存
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    if (process.env.NODE_ENV === 'test') {
      const shotMatch = key.match(/(A0[0-9]|master)/i);
      const shotCode = shotMatch ? shotMatch[1].toUpperCase() : 'A00';
      const fallbackBuf = SpaceImageGenerationService.renderDeterministicSpatialAsset({
        shotCode: shotCode === 'MASTER' ? 'A00' : shotCode,
        productName: '敏华芝华仕头等舱功能真皮沙发',
        productColor: '干邑暖橙 (Cognac Amber)',
        productRole: shotCode === 'A08' ? 'recliner_1seat' : (shotCode === 'A09' ? 'dining_table' : undefined),
        roomName: '顶层天际会所大宅',
        styleName: '都会收藏家',
        camera: { lensMm: 35, heightCm: 120, yawDeg: 0, pitchDeg: -2 },
        variantIndex: 1,
        variantTag: '测试底图'
      });
      return await resolveAndSendBuffer(fallbackBuf, key);
    }

    return res.status(404).send('File not found in storage');
  } catch (error: any) {
    res.status(500).send(error.message);
  }
});

/**
 * GET /api/space/storage/export-image
 * 工业级摄影画册高保真原画导出（支持 4K/2K/1K，Sharp Lanczos3 超采样，标准 JPEG 98% 4:4:4 或无损 PNG）
 * 携带标准 Content-Disposition attachment 头，确保客户端原生下载带合法文件名和真实数兆字节体积
 */
router.get('/export-image', async (req: Request, res: Response) => {
  try {
    const key = req.query.key as string;
    const format = (req.query.format as string) === 'png' ? 'png' : 'jpg';
    const resolution = (req.query.resolution as string) || '4K';
    const templateCode = (req.query.shotCode as string) || 'A00';
    const customName = req.query.fileName as string;

    if (!key || key.includes('..')) {
      return res.status(400).send('Invalid objectKey');
    }

    let sourceBuf: Buffer | null = null;
    const filePath = storage.getLocalFilePath(key);
    if (filePath && fs.existsSync(filePath)) {
      sourceBuf = fs.readFileSync(filePath);
    } else {
      sourceBuf = await storage.getBuffer(key);
    }

    if (!sourceBuf || sourceBuf.length === 0) {
      return res.status(404).send('Source image not found in storage');
    }

    // 检查原图尺寸
    const meta = await sharp(sourceBuf).metadata();
    const origW = meta.width || 2400;
    const origH = meta.height || 1800;
    const ratio = origW / origH;

    // 根据期望分辨率计算目标物理尺寸
    let targetW = origW;
    let targetH = origH;

    if (resolution === '4K') {
      if (Math.abs(ratio - 4 / 3) < 0.1) {
        targetW = 4096;
        targetH = 3072;
      } else if (Math.abs(ratio - 16 / 9) < 0.1) {
        targetW = 4096;
        targetH = 2304;
      } else if (Math.abs(ratio - 1) < 0.1) {
        targetW = 4096;
        targetH = 4096;
      } else if (Math.abs(ratio - 3 / 4) < 0.1) {
        targetW = 3072;
        targetH = 4096;
      } else if (Math.abs(ratio - 9 / 16) < 0.1) {
        targetW = 2304;
        targetH = 4096;
      } else {
        targetW = 4096;
        targetH = Math.round(4096 / ratio);
      }
    } else if (resolution === '1K') {
      if (Math.abs(ratio - 4 / 3) < 0.1) {
        targetW = 1472;
        targetH = 1104;
      } else {
        targetW = 1280;
        targetH = Math.round(1280 / ratio);
      }
    } else {
      // 2K
      if (Math.abs(ratio - 4 / 3) < 0.1) {
        targetW = 2400;
        targetH = 1800;
      } else {
        targetW = 2560;
        targetH = Math.round(2560 / ratio);
      }
    }

    let pipeline = sharp(sourceBuf);
    // 若原图小于目标尺寸或不一致，采用工业级 Lanczos3 算法进行平滑重采样
    if (origW !== targetW || origH !== targetH) {
      pipeline = pipeline.resize(targetW, targetH, {
        kernel: sharp.kernel.lanczos3,
        fit: 'fill'
      });
    }

    let outputBuf: Buffer;
    let contentType: string;
    let ext: string;

    if (format === 'png') {
      outputBuf = await pipeline.png({ compressionLevel: 6 }).toBuffer();
      contentType = 'image/png';
      ext = 'png';
    } else {
      outputBuf = await pipeline
        .jpeg({ quality: 98, chromaSubsampling: '4:4:4' })
        .toBuffer();
      contentType = 'image/jpeg';
      ext = 'jpg';
    }

    const downloadFileName = customName || `MANWAH_${templateCode}_${resolution}_${targetW}x${targetH}.${ext}`;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', outputBuf.length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(downloadFileName)}"; filename*=UTF-8''${encodeURIComponent(downloadFileName)}`
    );

    return res.end(outputBuf);
  } catch (err: any) {
    console.error('[spaceStorageRoutes] Export image failed:', err);
    res.status(500).send(`Image export failed: ${err.message}`);
  }
});

/**
 * PUT /api/space/storage/local-upload
 * 本地回退模式下的文件写入
 */
router.put('/local-upload', (req: Request, res: Response) => {
  try {
    const key = req.query.key as string;
    if (!key || key.includes('..')) {
      return res.status(400).send('Invalid objectKey');
    }

    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      const buffer = Buffer.concat(chunks);
      await storage.put({
        objectKey: key,
        buffer,
        contentType: req.headers['content-type'] || 'image/webp'
      });
      res.json({ success: true, bytes: buffer.length });
    });
  } catch (error: any) {
    res.status(500).send(error.message);
  }
});

// ════════════════════════════════════════════════════════════════════════
// 核心资产长期存储与服务端磁盘双向同步 (跨设备/跨浏览器/防清理数据)
// ════════════════════════════════════════════════════════════════════════
// 核心资产长期存储与云端 GCS / 本地磁盘 / 静态种子三层全员持久化
// ════════════════════════════════════════════════════════════════════════
const DATA_DIR = path.join(process.cwd(), '.data');
const MODELS_FILE = path.join(DATA_DIR, 'space_model_assets.json');
const MODELS_BACKUP_FILE = path.join(DATA_DIR, 'space_model_assets.backup.json');
const STYLES_FILE = path.join(DATA_DIR, 'space_scene_styles.json');
const STYLES_BACKUP_FILE = path.join(DATA_DIR, 'space_scene_styles.backup.json');

// 静态内置种子资产（受 Git 版本控制，部署后永不丢失，开箱即用）
const SEEDS_DIR = path.join(process.cwd(), 'server', 'data', 'seeds');
const SEED_MODELS_FILE = path.join(SEEDS_DIR, 'space_model_assets.json');
const SEED_STYLES_FILE = path.join(SEEDS_DIR, 'space_scene_styles.json');

// GCS 云端统一持久化存储 Key
const GCS_MODELS_KEY = 'assets/space_model_assets.json';
const GCS_STYLES_KEY = 'assets/space_scene_styles.json';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * 递归提取对象中引用的存储 key，例如 key=projects%2Fmanwah-space-default%2Fmodels%2F...
 */
function extractObjectKeysFromData(obj: any, keys: Set<string> = new Set()): Set<string> {
  if (!obj) return keys;
  if (typeof obj === 'string') {
    const m = obj.match(/key=([^&#]+)/);
    if (m) keys.add(decodeURIComponent(m[1]));
  } else if (Array.isArray(obj)) {
    obj.forEach((item) => extractObjectKeysFromData(item, keys));
  } else if (typeof obj === 'object') {
    Object.values(obj).forEach((val) => extractObjectKeysFromData(val, keys));
  }
  return keys;
}

/**
 * 后台异步将资产引用的关键切片图同步持久化至 GCS 存储桶
 */
async function syncReferencedImagesToGcs(data: any): Promise<number> {
  const keys = extractObjectKeysFromData(data);
  if (keys.size === 0) return 0;

  let synced = 0;
  for (const key of keys) {
    try {
      // 检查 GCS 是否已存在该文件
      const meta = await storage.getMetadata(key, 'source').catch(() => null);
      if (meta && meta.exists) continue;

      // 从本地热缓存或静态种子读取二进制数据写入 GCS
      const buf = await storage.getBuffer(key, 'source');
      if (buf && buf.length > 0) {
        await storage.put({
          bucketType: 'source',
          objectKey: key,
          buffer: buf,
          contentType: key.endsWith('.webp') ? 'image/webp' : key.endsWith('.png') ? 'image/png' : 'image/jpeg',
          metadata: {
            isSeedAsset: 'true',
            uploadedAt: new Date().toISOString()
          }
        });
        synced++;
      }
    } catch (err: any) {
      console.warn(`[spaceStorageRoutes] sync image to GCS notice for ${key}:`, err.message);
    }
  }
  return synced;
}

/**
 * GET /api/space/storage/models
 * 获取服务端持久化保存的模特资产列表
 * 读取顺序：① GCS 云端存储桶 ➔ ② 本地磁盘缓存 ➔ ③ 静态种子资产 (保证部署绝无空状态)
 */
router.get('/models', async (_req: Request, res: Response) => {
  try {
    ensureDataDir();

    // 1. 优先尝试从 GCS 云端存储读取最权威全员资产
    try {
      const gcsBuf = await storage.getBuffer(GCS_MODELS_KEY, 'generated');
      if (gcsBuf && gcsBuf.length > 2) {
        const parsed = JSON.parse(gcsBuf.toString('utf-8'));
        if (Array.isArray(parsed) && parsed.length > 0) {
          // 写入本地热缓存加速后续访问
          fs.writeFileSync(MODELS_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
          return res.json({ success: true, data: parsed, source: 'gcs' });
        }
      }
    } catch (gcsErr: any) {
      console.warn('[spaceStorageRoutes] GCS read models notice:', gcsErr.message);
    }

    // 2. 次选本地磁盘缓存 (.data/space_model_assets.json)
    if (fs.existsSync(MODELS_FILE)) {
      try {
        const content = fs.readFileSync(MODELS_FILE, 'utf-8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return res.json({ success: true, data: parsed, source: 'local_disk' });
        }
      } catch (e) {}
    }

    // 3. 终极兜底：加载内置受版本控制的静态种子资产 (保证部署上线开箱即用，绝无空状态)
    if (fs.existsSync(SEED_MODELS_FILE)) {
      try {
        const seedContent = fs.readFileSync(SEED_MODELS_FILE, 'utf-8');
        const seedModels = JSON.parse(seedContent);
        if (Array.isArray(seedModels) && seedModels.length > 0) {
          console.log(`[spaceStorageRoutes] Loaded ${seedModels.length} seed model assets (built-in fallback)`);
          // 回写本地热缓存
          fs.writeFileSync(MODELS_FILE, JSON.stringify(seedModels, null, 2), 'utf-8');
          // 异步自动同步到 GCS 存储桶，实现首次启动的无感云端持久化
          (async () => {
            try {
              await storage.put({
                bucketType: 'generated',
                objectKey: GCS_MODELS_KEY,
                buffer: Buffer.from(JSON.stringify(seedModels, null, 2), 'utf-8'),
                contentType: 'application/json',
                metadata: { isSeed: 'true', seededAt: new Date().toISOString() }
              });
              await syncReferencedImagesToGcs(seedModels);
              console.log(`[spaceStorageRoutes] ✓ Auto initialized GCS with ${seedModels.length} seed models`);
            } catch (err: any) {
              console.warn('[spaceStorageRoutes] Auto seed models GCS sync notice:', err.message);
            }
          })();

          return res.json({ success: true, data: seedModels, source: 'seed_builtin' });
        }
      } catch (seedErr: any) {
        console.error('[spaceStorageRoutes] Read seed models error:', seedErr);
      }
    }

    return res.json({ success: true, data: [], source: 'empty' });
  } catch (err: any) {
    console.error('[spaceStorageRoutes] read models error:', err);
    return res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

/**
 * POST /api/space/storage/models/sync
 * 客户端将录入好的模特资产同步固化到服务端：同步写本地磁盘缓存 + GCS 统一存储桶 + 异步同步关键切片图
 */
router.post('/models/sync', async (req: Request, res: Response) => {
  try {
    ensureDataDir();
    const models = req.body?.models;
    if (!Array.isArray(models)) {
      return res.status(400).json({ success: false, error: 'Models payload must be an array' });
    }

    // 1. 本地磁盘热缓存与历史轮转备份
    if (fs.existsSync(MODELS_FILE)) {
      try {
        fs.copyFileSync(MODELS_FILE, MODELS_BACKUP_FILE);
      } catch (backupErr) {
        console.warn('[spaceStorageRoutes] backup error:', backupErr);
      }
    }

    fs.writeFileSync(MODELS_FILE, JSON.stringify(models, null, 2), 'utf-8');
    console.log(`[spaceStorageRoutes] Successfully persisted ${models.length} model assets to disk at ${MODELS_FILE}`);

    // 2. 长期统一架构：同步写入 GCS 存储桶，实现跨容器实例共享与永久云端持久化
    let gcsSynced = false;
    try {
      const jsonBuf = Buffer.from(JSON.stringify(models, null, 2), 'utf-8');
      await storage.put({
        bucketType: 'generated',
        objectKey: GCS_MODELS_KEY,
        buffer: jsonBuf,
        contentType: 'application/json',
        metadata: {
          updatedAt: new Date().toISOString(),
          modelCount: String(models.length)
        }
      });
      gcsSynced = true;
      console.log(`[spaceStorageRoutes] ✓ Persisted ${models.length} model assets to GCS at ${GCS_MODELS_KEY}`);
    } catch (gcsErr: any) {
      console.warn('[spaceStorageRoutes] Persist models to GCS notice:', gcsErr.message);
    }

    // 3. 异步确保所有引用的切片图片全部持久化至 GCS
    syncReferencedImagesToGcs(models).catch((imgErr) => {
      console.warn('[spaceStorageRoutes] Background sync model slice images notice:', imgErr.message);
    });

    return res.json({
      success: true,
      count: models.length,
      gcsSynced,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[spaceStorageRoutes] sync models error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/space/storage/styles
 * 获取服务端持久化保存的场景风格资产列表
 * 读取顺序：① GCS 云端存储桶 ➔ ② 本地磁盘缓存 ➔ ③ 静态种子风格 (7款经典风格兜底)
 */
router.get('/styles', async (_req: Request, res: Response) => {
  try {
    ensureDataDir();

    // 1. 优先尝试从 GCS 云端读取
    try {
      const gcsBuf = await storage.getBuffer(GCS_STYLES_KEY, 'generated');
      if (gcsBuf && gcsBuf.length > 2) {
        const parsed = JSON.parse(gcsBuf.toString('utf-8'));
        if (Array.isArray(parsed) && parsed.length > 0) {
          fs.writeFileSync(STYLES_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
          return res.json({ success: true, data: parsed, source: 'gcs' });
        }
      }
    } catch (gcsErr: any) {
      console.warn('[spaceStorageRoutes] GCS read styles notice:', gcsErr.message);
    }

    // 2. 本地磁盘缓存
    if (fs.existsSync(STYLES_FILE)) {
      try {
        const content = fs.readFileSync(STYLES_FILE, 'utf-8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return res.json({ success: true, data: parsed, source: 'local_disk' });
        }
      } catch (e) {}
    }

    // 3. 静态种子风格资产 (从 server/data/seeds/space_scene_styles.json 读取 7 款预设风格)
    if (fs.existsSync(SEED_STYLES_FILE)) {
      try {
        const seedContent = fs.readFileSync(SEED_STYLES_FILE, 'utf-8');
        const seedStyles = JSON.parse(seedContent);
        if (Array.isArray(seedStyles) && seedStyles.length > 0) {
          console.log(`[spaceStorageRoutes] Loaded ${seedStyles.length} seed scene styles (built-in fallback)`);
          fs.writeFileSync(STYLES_FILE, JSON.stringify(seedStyles, null, 2), 'utf-8');
          (async () => {
            try {
              await storage.put({
                bucketType: 'generated',
                objectKey: GCS_STYLES_KEY,
                buffer: Buffer.from(JSON.stringify(seedStyles, null, 2), 'utf-8'),
                contentType: 'application/json',
                metadata: { isSeed: 'true', seededAt: new Date().toISOString() }
              });
              await syncReferencedImagesToGcs(seedStyles);
            } catch {}
          })();
          return res.json({ success: true, data: seedStyles, source: 'seed_builtin' });
        }
      } catch (seedErr: any) {
        console.error('[spaceStorageRoutes] Read seed styles error:', seedErr);
      }
    }

    return res.json({ success: true, data: [], source: 'empty' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

/**
 * POST /api/space/storage/styles/sync
 * 客户端将场景风格资产同步并固化到服务端磁盘与 GCS
 */
router.post('/styles/sync', async (req: Request, res: Response) => {
  try {
    ensureDataDir();
    const styles = req.body?.styles;
    if (!Array.isArray(styles)) {
      return res.status(400).json({ success: false, error: 'Styles payload must be an array' });
    }

    if (fs.existsSync(STYLES_FILE)) {
      try {
        fs.copyFileSync(STYLES_FILE, STYLES_BACKUP_FILE);
      } catch {}
    }

    fs.writeFileSync(STYLES_FILE, JSON.stringify(styles, null, 2), 'utf-8');
    console.log(`[spaceStorageRoutes] ✓ 成功将 ${styles.length} 个场景风格资产持久化保存至服务端磁盘`);

    // 同步到 GCS
    let gcsSynced = false;
    try {
      const jsonBuf = Buffer.from(JSON.stringify(styles, null, 2), 'utf-8');
      await storage.put({
        bucketType: 'generated',
        objectKey: GCS_STYLES_KEY,
        buffer: jsonBuf,
        contentType: 'application/json',
        metadata: {
          updatedAt: new Date().toISOString(),
          styleCount: String(styles.length)
        }
      });
      gcsSynced = true;
      console.log(`[spaceStorageRoutes] ✓ Persisted ${styles.length} styles to GCS at ${GCS_STYLES_KEY}`);
    } catch (gcsErr: any) {
      console.warn('[spaceStorageRoutes] Persist styles to GCS notice:', gcsErr.message);
    }

    syncReferencedImagesToGcs(styles).catch(() => {});

    return res.json({
      success: true,
      count: styles.length,
      gcsSynced,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});


/**
 * 快照瘦身：把快照里的内联 base64 大图（产品主图、参考图、场景档案原图等）存成文件，快照里只留同源地址。
 * 同一张图按内容哈希只存一份（以前同一张 3MB 产品图在快照里重复三遍），快照从几 MB~几十 MB 降到百 KB 级。
 * 地址格式 /api/space/storage/local-file?key=…，前端显示、服务端出图解析（spaceImageGenerationService）都已支持。
 * 本地文件同步写入（storage.put 第一步就同步写本地热缓存），云端上传在后台进行，不拖慢保存。
 */
const INLINE_IMAGE_MIN_CHARS = 20_000;
const INLINE_DATA_URL_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/;

function safeProjectSegment(projectId: string): string {
  return String(projectId || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'unknown';
}

export function externalizeSnapshotImages(projectId: string, root: any): { replaced: number; bytes: number } {
  const stats = { replaced: 0, bytes: 0 };
  const seen = new Map<string, string>(); // 同一个 base64 字符串只处理一次
  const visit = (node: any, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 40) return;
    const keys = Array.isArray(node) ? node.map((_: any, i: number) => i) : Object.keys(node);
    for (const k of keys as any[]) {
      const v = node[k];
      if (typeof v === 'string') {
        if (v.length < INLINE_IMAGE_MIN_CHARS || !v.startsWith('data:image/')) continue;
        const cached = seen.get(v);
        if (cached) {
          node[k] = cached;
          stats.replaced++;
          continue;
        }
        const m = v.match(INLINE_DATA_URL_RE);
        if (!m) continue;
        try {
          const buf = Buffer.from(m[2], 'base64');
          if (buf.length === 0) continue;
          const mime = m[1].toLowerCase();
          const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('gif') ? 'gif' : 'jpg';
          const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 24);
          const key = `projects/${safeProjectSegment(projectId)}/inline/${hash}.${ext}`;
          const localPath = path.join(process.cwd(), '.data', 'space-storage', key);
          if (!fs.existsSync(localPath)) {
            // put 第一步同步写本地热缓存，之后的云端上传在后台完成
            void storage.put({ bucketType: 'source', objectKey: key, buffer: buf, contentType: mime }).catch((err: any) =>
              console.warn('[spaceStorageRoutes] inline image cloud upload notice:', err?.message || err)
            );
          }
          const url = `/api/space/storage/local-file?key=${encodeURIComponent(key)}`;
          seen.set(v, url);
          node[k] = url;
          stats.replaced++;
          stats.bytes += v.length;
        } catch (err: any) {
          console.warn('[spaceStorageRoutes] externalize inline image failed (kept inline):', err?.message || err);
        }
      } else if (v && typeof v === 'object') {
        visit(v, depth + 1);
      }
    }
  };
  visit(root, 0);
  return stats;
}

/** 本机没有云端凭据（不在 Cloud Run、也没配密钥文件）时，云端备份必然失败，直接跳过，只存本地 */
function cloudBackupAvailable(): boolean {
  return Boolean(process.env.K_SERVICE || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCS_KEY_FILE);
}

/**
 * 工程快照的云端备份：同一工程同时只跑一个备份，备份期间来的新快照只保留最新一份，跑完再备份一次。
 * 以前每次保存都起一个后台任务，每个都持有整份快照（几十 MB）再解析、再缩进序列化后上传；
 * 上传 Supabase 卡住或失败时，任务越堆越多，几分钟就把 Node 内存打满（8GB 也只撑了 19 分钟）。
 */
const snapshotBackupState = new Map<string, { running: boolean; next: string | null }>();

function scheduleSnapshotBackup(projectId: string, jsonStr: string) {
  if (!cloudBackupAvailable()) return;
  const state = snapshotBackupState.get(projectId) || { running: false, next: null };
  snapshotBackupState.set(projectId, state);
  if (state.running) {
    state.next = jsonStr; // 只留最新的一份，中间版本丢掉（本地磁盘已经写了最新版）
    return;
  }
  state.running = true;
  void (async () => {
    let current: string | null = jsonStr;
    while (current) {
      try {
        await backupSnapshotNow(projectId, current);
      } catch (bgErr: any) {
        console.warn('[spaceStorageRoutes] Snapshot cloud backup notice:', bgErr?.message);
      }
      current = state.next;
      state.next = null;
    }
    state.running = false;
    snapshotBackupState.delete(projectId);
  })();
}

async function backupSnapshotNow(projectId: string, jsonStr: string) {
  // 只解析一次：先把内联的产品参考图存到对象存储，再把快照里的 base64 换成同源地址后上传
  const compactPayload = JSON.parse(jsonStr);
  for (const prod of compactPayload?.products || []) {
    for (const ref of prod?.referenceImages || []) {
      if (ref?.objectKey && typeof ref?.publicUrl === 'string' && ref.publicUrl.startsWith('data:image/')) {
        const existing = await storage.getBuffer(ref.objectKey, 'source');
        if (!existing || existing.length === 0) {
          const b64Match = ref.publicUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (b64Match) {
            const rawBuf = Buffer.from(b64Match[2], 'base64');
            const finalBuf = ref.objectKey.endsWith('.webp') ? await sharp(rawBuf).webp({ quality: 92 }).toBuffer() : rawBuf;
            await storage.put({
              bucketType: 'source',
              objectKey: ref.objectKey,
              buffer: finalBuf,
              contentType: ref.objectKey.endsWith('.webp') ? 'image/webp' : b64Match[1]
            });
          }
        }
        ref.publicUrl = `/api/space/storage/local-file?key=${encodeURIComponent(ref.objectKey)}`;
      }
    }
  }
  await storage.put({
    bucketType: 'generated',
    objectKey: `projects/snapshots/${projectId}.json`,
    buffer: Buffer.from(JSON.stringify(compactPayload), 'utf-8'),
    contentType: 'application/json',
    metadata: { projectId, updatedAt: new Date().toISOString() }
  });
}

/**
 * POST /api/space/storage/projects/snapshot
 * 将摄影画册作业快照持久化备份至服务端磁盘 .data/space-projects/ 及云存储 (GCS / Supabase Storage)
 */
router.post('/projects/snapshot', async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    if (!payload || !payload.projectId) {
      return res.status(400).json({ success: false, error: 'Missing projectId in snapshot' });
    }
    const projectsDir = path.join(process.cwd(), '.data', 'space-projects');
    if (!fs.existsSync(projectsDir)) {
      fs.mkdirSync(projectsDir, { recursive: true });
    }
    const filePath = path.join(projectsDir, `${payload.projectId}.json`);
    // 内联大图存成文件、快照只留地址（同一张图只存一份）
    const slim = externalizeSnapshotImages(String(payload.projectId), payload);
    if (slim.replaced > 0) {
      console.info(`[spaceStorageRoutes] snapshot ${payload.projectId}: externalized ${slim.replaced} inline images (${(slim.bytes / 1e6).toFixed(1)}MB)`);
    }
    const jsonStr = JSON.stringify(payload);
    fs.writeFileSync(filePath, jsonStr, 'utf-8');

    // 异步持久化快照与内联产品参考图至云端存储（同一工程同时只跑一个，见 scheduleSnapshotBackup）
    scheduleSnapshotBackup(String(payload.projectId), jsonStr);

    return res.json({ success: true, projectId: payload.projectId, path: filePath });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/space/storage/projects/snapshot/:projectId
 * 读取服务端磁盘或云存储中缓存的摄影画册工程快照
 */
router.get('/projects/snapshot/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const projectsDir = path.join(process.cwd(), '.data', 'space-projects');
    const filePath = path.join(projectsDir, `${projectId}.json`);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      // 旧快照里还嵌着 base64 大图：读的时候顺手瘦身并回写，以后保存、读取都快
      if (raw.length > 1_000_000 && raw.includes('data:image/')) {
        const slim = externalizeSnapshotImages(String(projectId), parsed);
        if (slim.replaced > 0) {
          try {
            fs.writeFileSync(filePath, JSON.stringify(parsed), 'utf-8');
            console.info(`[spaceStorageRoutes] migrated snapshot ${projectId}: externalized ${slim.replaced} inline images (${(slim.bytes / 1e6).toFixed(1)}MB)`);
          } catch {}
        }
      }
      return res.json({ success: true, data: parsed });
    }

    // 若容器本地无缓存，尝试从云端存储恢复快照
    const cloudBuf = await storage.getBuffer(`projects/snapshots/${projectId}.json`, 'generated');
    if (cloudBuf && cloudBuf.length > 2) {
      const parsed = JSON.parse(cloudBuf.toString('utf-8'));
      externalizeSnapshotImages(String(projectId), parsed);
      try {
        if (!fs.existsSync(projectsDir)) fs.mkdirSync(projectsDir, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(parsed), 'utf-8');
      } catch {}
      return res.json({ success: true, data: parsed });
    }

    return res.status(404).json({ success: false, error: 'Project snapshot not found' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
