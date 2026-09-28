// server/routes/spaceStorageRoutes.ts
// MANWAH Space Studio｜统一存储管理与签名访问路由 V3.0
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs';
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

export default router;
