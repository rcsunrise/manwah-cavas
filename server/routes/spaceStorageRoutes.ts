// server/routes/spaceStorageRoutes.ts
// MANWAH Space Studio｜统一存储管理与签名访问路由 V3.0
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { GcsAssetStorage } from '../services/storage/gcsAssetStorage';

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

    const filePath = storage.getLocalFilePath(key);
    if (filePath && fs.existsSync(filePath)) {
      if (key.endsWith('.svg')) {
        res.setHeader('Content-Type', 'image/svg+xml');
      } else if (key.endsWith('.webp')) {
        res.setHeader('Content-Type', 'image/webp');
      } else if (key.endsWith('.jpg') || key.endsWith('.jpeg')) {
        res.setHeader('Content-Type', 'image/jpeg');
      } else if (key.endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
      }
      const data = fs.readFileSync(filePath);
      return res.end(data);
    }

    // 若本地文件未就绪，尝试从 GCS/Object Storage 读取 Buffer 并流式直通响应 (避免重定向跨域与 NoSuchKey)
    try {
      const buf = await storage.getBuffer(key);
      if (buf && buf.length > 0) {
        if (key.endsWith('.svg')) {
          res.setHeader('Content-Type', 'image/svg+xml');
        } else if (key.endsWith('.webp')) {
          res.setHeader('Content-Type', 'image/webp');
        } else if (key.endsWith('.jpg') || key.endsWith('.jpeg')) {
          res.setHeader('Content-Type', 'image/jpeg');
        } else if (key.endsWith('.png')) {
          res.setHeader('Content-Type', 'image/png');
        } else {
          res.setHeader('Content-Type', 'application/octet-stream');
        }
        return res.send(buf);
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

    res.status(404).send('File not found in storage');
  } catch (error: any) {
    res.status(500).send(error.message);
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
const DATA_DIR = path.join(process.cwd(), '.data');
const MODELS_FILE = path.join(DATA_DIR, 'space_model_assets.json');
const MODELS_BACKUP_FILE = path.join(DATA_DIR, 'space_model_assets.backup.json');
const STYLES_FILE = path.join(DATA_DIR, 'space_scene_styles.json');
const STYLES_BACKUP_FILE = path.join(DATA_DIR, 'space_scene_styles.backup.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * GET /api/space/storage/models
 * 获取服务端持久化保存的模特资产列表
 */
router.get('/models', (_req: Request, res: Response) => {
  try {
    ensureDataDir();
    if (!fs.existsSync(MODELS_FILE)) {
      return res.json({ success: true, data: [] });
    }
    const content = fs.readFileSync(MODELS_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    return res.json({ success: true, data: Array.isArray(parsed) ? parsed : [] });
  } catch (err: any) {
    console.error('[spaceStorageRoutes] read models error:', err);
    return res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

/**
 * POST /api/space/storage/models/sync
 * 客户端将录入好的模特资产同步并固化到服务端磁盘
 */
router.post('/models/sync', (req: Request, res: Response) => {
  try {
    ensureDataDir();
    const models = req.body?.models;
    if (!Array.isArray(models)) {
      return res.status(400).json({ success: false, error: 'Models payload must be an array' });
    }

    // 若旧文件存在，自动生成轮转备份，确保任何情况下历史录入永不损坏
    if (fs.existsSync(MODELS_FILE)) {
      try {
        fs.copyFileSync(MODELS_FILE, MODELS_BACKUP_FILE);
      } catch (backupErr) {
        console.warn('[spaceStorageRoutes] backup error:', backupErr);
      }
    }

    fs.writeFileSync(MODELS_FILE, JSON.stringify(models, null, 2), 'utf-8');
    console.log(`[spaceStorageRoutes] Successfully persisted ${models.length} model assets to disk at ${MODELS_FILE}`);

    return res.json({
      success: true,
      count: models.length,
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
 */
router.get('/styles', (_req: Request, res: Response) => {
  try {
    ensureDataDir();
    if (!fs.existsSync(STYLES_FILE)) {
      return res.json({ success: true, data: [] });
    }
    const content = fs.readFileSync(STYLES_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    return res.json({ success: true, data: Array.isArray(parsed) ? parsed : [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

/**
 * POST /api/space/storage/styles/sync
 * 客户端将场景风格资产同步并固化到服务端磁盘
 */
router.post('/styles/sync', (req: Request, res: Response) => {
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
    console.log(`[spaceStorageRoutes] ✓ 成功将 ${styles.length} 个场景风格资产持久化保存至服务端磁盘:`, styles.map((s: any) => s.name || s.id));
    return res.json({
      success: true,
      count: styles.length,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
