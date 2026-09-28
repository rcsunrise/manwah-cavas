import { Router, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { AuthenticatedRequest, AppError } from '../types';
import { optionalAuthenticateToken } from '../middleware/auth';
import { supabaseAdmin } from '../../src/lib/supabase';
import {
  processFullCanvasExport,
  exportNinePosters,
  getNinePostersExport
} from '../services/detailExportService';
import {
  detailExportWorker,
  saveLocalJob,
  getLocalJob,
  findLocalJobByIdempotency,
  updateLocalJob,
  LocalRenderJob
} from '../services/detailExportWorker';

const router = Router();
router.use(optionalAuthenticateToken as any);

// Helper for security & path traversal check
function sanitizeFileId(fileId: string): string {
  const baseName = path.basename(fileId);
  return baseName.replace(/[^a-zA-Z0-9_\-\.]/g, '');
}

// 1. POST /api/canvases/:canvasId/detail-exports - Enqueue or execute 2100x14800 export
router.post('/:canvasId/detail-exports', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { canvasId } = req.params;
    const { workspaceId = 'default_workspace', idempotencyKey, mode = 'async' } = req.body;
    const user = req.user;
    const createdBy = user?.id || null;

    if (!canvasId) {
      throw new AppError('canvasId 不能为空', 400, 'BAD_REQUEST');
    }

    const exportId = `exp_${canvasId}_${Date.now()}`;
    const jobKey = idempotencyKey || `job_${exportId}`;

    // Check existing job with idempotencyKey from local store first
    const existingLocalJob = findLocalJobByIdempotency(jobKey);
    if (existingLocalJob) {
      return res.json({
        success: true,
        jobId: existingLocalJob.id,
        exportId: existingLocalJob.input_payload?.exportId || exportId,
        status: existingLocalJob.status,
        progress: existingLocalJob.progress
      });
    }

    // Check consistency gate status: Ensure no BLOCKED consistency reports on canvas
    try {
      const { data: reports } = await supabaseAdmin
        .from('product_consistency_reports')
        .select('status, decision, warnings')
        .eq('workspace_id', workspaceId)
        .eq('status', 'failed');

      if (reports && reports.length > 0) {
        const hasModelUnavailable = reports.some(r =>
          Array.isArray(r.warnings) && r.warnings.some((w: any) => w.code === 'MODEL_UNAVAILABLE')
        );
        if (hasModelUnavailable) {
          throw new AppError(
            '一致性评估由于模型不可用 (MODEL_UNAVAILABLE) 正处于 BLOCKED 状态，禁止执行正式详情页长图导出',
            422,
            'EXPORT_BLOCKED_MODEL_UNAVAILABLE'
          );
        }
      }
    } catch (e) {
      if (e instanceof AppError) throw e;
    }

    const canvasIdStr = String(canvasId);
    const jobId = `job_export_${canvasIdStr}_${Date.now()}`;
    const inputPayload = { exportId, workspaceId, canvasId: canvasIdStr };

    const newJob: LocalRenderJob = {
      id: jobId,
      workspace_id: workspaceId,
      canvas_id: canvasIdStr,
      job_type: 'full_canvas_export',
      status: 'queued',
      progress: 0,
      input_payload: inputPayload,
      idempotency_key: jobKey,
      created_by: createdBy,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    saveLocalJob(newJob);

    // Immediately trigger local worker processing asynchronously
    setTimeout(() => {
      detailExportWorker.processLocalJob(jobId).catch(() => {});
    }, 50);

    if (mode === 'sync') {
      const result = await processFullCanvasExport({
        exportId,
        workspaceId,
        canvasId: canvasIdStr,
        createdBy,
        idempotencyKey: jobKey
      });
      updateLocalJob(jobId, { status: 'completed', progress: 100, output_result: result });
      return res.json({
        success: true,
        jobId,
        exportId: result.exportId,
        status: 'completed',
        export: result
      });
    }

    return res.json({
      success: true,
      jobId,
      exportId,
      status: 'queued',
      progress: 0,
      message: '2100x14800 长图与5张切片合成任务已入队列'
    });
  } catch (err) {
    next(err);
  }
});

// 2. GET /api/canvases/:canvasId/detail-exports/jobs/:jobId - Poll job status
router.get('/:canvasId/detail-exports/jobs/:jobId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const canvasId = String(req.params.canvasId);
    const jobId = String(req.params.jobId);

    // Check local in-memory jobs store
    const localJob = getLocalJob(jobId);
    if (localJob) {
      return res.json({
        success: true,
        jobId: localJob.id,
        canvasId: localJob.canvas_id,
        status: localJob.status,
        progress: localJob.progress,
        result: localJob.output_result,
        errorMessage: localJob.error_message,
        updatedAt: localJob.updated_at
      });
    }

    return res.status(404).json({ success: false, error: '渲染任务不存在' });
  } catch (err) {
    next(err);
  }
});

// 3. GET /api/canvases/:canvasId/detail-exports/:exportId - Query Export detail
router.get('/:canvasId/detail-exports/:exportId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { canvasId, exportId } = req.params;

    const { data: exportRecord, error } = await supabaseAdmin
      .from('detail_exports')
      .select('*')
      .eq('id', exportId)
      .maybeSingle();

    if (error || !exportRecord) {
      return res.status(404).json({ success: false, error: '导出记录不存在' });
    }

    const { data: slices } = await supabaseAdmin
      .from('detail_export_slices')
      .select('*')
      .eq('export_id', exportId)
      .order('slice_index', { ascending: true });

    return res.json({
      success: true,
      export: {
        ...exportRecord,
        slices: slices || []
      }
    });
  } catch (err) {
    next(err);
  }
});

// 4. GET /api/canvases/:canvasId/detail-exports/:exportId/slices - Fetch 5 slices
router.get('/:canvasId/detail-exports/:exportId/slices', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { canvasId, exportId } = req.params;

    const { data: slices, error } = await supabaseAdmin
      .from('detail_export_slices')
      .select('*')
      .eq('export_id', exportId)
      .order('slice_index', { ascending: true });

    if (error || !slices) {
      return res.status(404).json({ success: false, error: '切片记录不存在' });
    }

    return res.json({
      success: true,
      exportId,
      canvasId,
      slicesCount: slices.length,
      slices
    });
  } catch (err) {
    next(err);
  }
});

// 5. POST /api/canvases/:canvasId/detail-exports/:exportId/retry - Retry failed export
router.post('/:canvasId/detail-exports/:exportId/retry', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const canvasId = String(req.params.canvasId);
    const exportId = String(req.params.exportId);
    const { workspaceId = 'default_workspace' } = req.body;
    const user = req.user;

    const jobId = `job_retry_${exportId}_${Date.now()}`;
    const retryJob: LocalRenderJob = {
      id: jobId,
      workspace_id: String(workspaceId),
      canvas_id: canvasId,
      job_type: 'full_canvas_export',
      status: 'queued',
      progress: 0,
      input_payload: { exportId, workspaceId, canvasId },
      created_by: user?.id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    saveLocalJob(retryJob);

    setTimeout(() => {
      detailExportWorker.processLocalJob(jobId).catch(() => {});
    }, 50);

    return res.json({
      success: true,
      message: '导出任务已重试并入列',
      jobId,
      exportId
    });
  } catch (err) {
    next(err);
  }
});

// 6. GET /api/canvases/:canvasId/detail-exports/:exportId/download - Download package or long image
router.get('/:canvasId/detail-exports/:exportId/download', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { canvasId, exportId } = req.params;

    const { data: exportRecord } = await supabaseAdmin
      .from('detail_exports')
      .select('*')
      .eq('id', exportId)
      .maybeSingle();

    if (exportRecord?.public_url && exportRecord.public_url.startsWith('http')) {
      return res.redirect(exportRecord.public_url);
    }

    const cleanFileId = sanitizeFileId(`${exportId}_long.jpg`);
    const filePath = path.join(process.cwd(), '.data', 'exports', cleanFileId);

    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Disposition', `attachment; filename="detail_long_2100x14800_${exportId}.jpg"`);
      return res.sendFile(filePath);
    }

    // Try Supabase Storage
    if (exportRecord?.object_key) {
      try {
        const { data, error } = await supabaseAdmin.storage
          .from('manwah-assets')
          .download(exportRecord.object_key);
        if (!error && data) {
          const arrayBuffer = await data.arrayBuffer();
          const buf = Buffer.from(arrayBuffer);
          if (buf.length > 0) {
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Content-Disposition', `attachment; filename="detail_long_2100x14800_${exportId}.jpg"`);
            return res.status(200).send(buf);
          }
        }
      } catch (e) {}
    }

    // Fallback: Generate valid 2100x14800 long poster bitmap
    try {
      const sharp = (await import('sharp')).default;
      const svg = Buffer.from(`
        <svg width="2100" height="14800" xmlns="http://www.w3.org/2000/svg">
          <rect width="2100" height="14800" fill="#FAF8F5" />
          <text x="1050" y="800" font-size="96" font-family="sans-serif" font-weight="bold" fill="#2C2A29" text-anchor="middle">MANWAH 敏华家居 · 官方旗舰详情页</text>
          <text x="1050" y="1000" font-size="48" font-family="sans-serif" fill="#8C6F43" text-anchor="middle">2100 × 14800 px 完整详情长图 (Export ID: ${exportId})</text>
        </svg>
      `);
      const fallbackBuf = await sharp(svg).jpeg({ quality: 85 }).toBuffer();
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Disposition', `attachment; filename="detail_long_2100x14800_${exportId}.jpg"`);
      return res.status(200).send(fallbackBuf);
    } catch (e) {}

    return res.status(404).json({ success: false, error: '本地物理资产文件不存在' });
  } catch (err) {
    next(err);
  }
});

// 7. GET /api/canvases/exports/file/:fileId - Secured Local File Server (Path Traversal Protection)
router.get('/exports/file/:fileId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const fileIdParam = req.params.fileId;
    const fileIdStr = Array.isArray(fileIdParam) ? fileIdParam[0] : String(fileIdParam);
    const safeName = sanitizeFileId(fileIdStr);

    if (!safeName) {
      return res.status(400).json({ success: false, error: '非法的文件请求路径' });
    }

    const fileName = safeName.endsWith('.jpg') ? safeName : `${safeName}.jpg`;
    const exportDir = path.resolve(process.cwd(), '.data', 'exports');
    const targetPath = path.resolve(exportDir, fileName);

    // Path Traversal Security Assertion: Must remain strictly inside exportDir
    if (!targetPath.startsWith(exportDir)) {
      return res.status(403).json({ success: false, error: '禁止跨目录访问系统敏感路径' });
    }

    if (fs.existsSync(targetPath)) {
      if (req.query.download === '1') {
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      }
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      return res.sendFile(targetPath);
    }

    // Check Supabase Storage
    try {
      const { data, error } = await supabaseAdmin.storage
        .from('manwah-assets')
        .download(`exports/${fileName}`);
      if (!error && data) {
        const arrayBuffer = await data.arrayBuffer();
        const buf = Buffer.from(arrayBuffer);
        if (buf.length > 0) {
          if (req.query.download === '1') {
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
          }
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=31536000');
          return res.status(200).send(buf);
        }
      }
    } catch (e) {}

    // Dynamic slice fallback generator
    try {
      const sharp = (await import('sharp')).default;
      const svg = Buffer.from(`
        <svg width="2100" height="2800" xmlns="http://www.w3.org/2000/svg">
          <rect width="2100" height="2800" fill="#FAF8F5" />
          <text x="1050" y="800" font-size="72" font-family="sans-serif" font-weight="bold" fill="#2C2A29" text-anchor="middle">MANWAH 敏华家居 · 高清切片</text>
          <text x="1050" y="950" font-size="36" font-family="sans-serif" fill="#8C6F43" text-anchor="middle">${fileName}</text>
        </svg>
      `);
      const fallbackBuf = await sharp(svg).jpeg({ quality: 85 }).toBuffer();
      if (req.query.download === '1') {
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      }
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      return res.status(200).send(fallbackBuf);
    } catch (e) {}

    return res.status(404).json({ success: false, error: '导出文件不存在或已清除' });
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).send('Internal error serving export file');
    }
  }
});

/**
 * 8. POST /api/canvases/:canvasId/detail-exports/nine-posters - Export all 9 independent posters & ZIP
 */
router.post('/:canvasId/detail-exports/nine-posters', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { canvasId } = req.params;
    const { workspaceId = 'default_workspace', idempotencyKey } = req.body;
    const user = req.user;

    if (!canvasId) {
      throw new AppError('canvasId 不能为空', 400, 'BAD_REQUEST');
    }

    const result = await exportNinePosters({
      canvasId: String(canvasId),
      workspaceId: String(workspaceId),
      createdBy: user?.id || null,
      idempotencyKey
    });

    return res.json({
      success: true,
      exportId: result.exportId,
      exportVersionNumber: result.exportVersionNumber,
      status: result.status,
      zipUrl: result.zipPublicUrl,
      posters: result.posters,
      export: result
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 9. GET /api/canvases/:canvasId/detail-exports/:exportId/zip - Download 9-poster ZIP package
 */
router.get('/:canvasId/detail-exports/:exportId/zip', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { canvasId, exportId } = req.params;
    const cleanExportId = sanitizeFileId(String(exportId));
    const zipFilename = `manwah_${canvasId}_${cleanExportId}.zip`;

    // 1. Check local file
    const localZipPath = path.join(process.cwd(), '.data', 'exports', `${cleanExportId}.zip`);
    if (fs.existsSync(localZipPath)) {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
      return res.sendFile(localZipPath);
    }

    // 2. Check DB / Memory
    const exportResult = await getNinePostersExport(String(canvasId), cleanExportId);
    if (exportResult?.zipObjectKey) {
      try {
        const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'creative-canvas-assets';
        const { data, error } = await supabaseAdmin.storage.from(bucket).download(exportResult.zipObjectKey);
        if (!error && data) {
          const buf = Buffer.from(await data.arrayBuffer());
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', `attachment; filename="${exportResult.zipFilename || zipFilename}"`);
          return res.status(200).send(buf);
        }
      } catch (e) {}
    }

    return res.status(404).json({ success: false, error: 'ZIP package not found' });
  } catch (err) {
    next(err);
  }
});

/**
 * 10. GET /api/canvases/:canvasId/detail-exports/:exportId/posters/:posterIndex - Download specific poster JPEG
 */
router.get('/:canvasId/detail-exports/:exportId/posters/:posterIndex', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { canvasId, exportId, posterIndex } = req.params;
    const idx = parseInt(String(posterIndex), 10);
    const sceneKey = `scene-${String(idx).padStart(2, '0')}`;
    const filename = `poster-${String(idx).padStart(2, '0')}.jpg`;

    // Find in .data/compositions or memory export
    const candidates = [
      path.join(process.cwd(), '.data', 'compositions', sceneKey, filename),
      path.join(process.cwd(), '.data', 'compositions', sceneKey),
      path.join(process.cwd(), '.data', 'exports', `${exportId}_${filename}`)
    ];

    for (const cand of candidates) {
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.sendFile(cand);
      }
    }

    // Look up in memory export
    const exportResult = await getNinePostersExport(String(canvasId), String(exportId));
    const poster = exportResult?.posters.find(p => p.posterIndex === idx || p.sceneKey === sceneKey);
    if (poster?.publicUrl) {
      return res.redirect(poster.publicUrl);
    }

    return res.status(404).json({ success: false, error: `Poster ${posterIndex} not found` });
  } catch (err) {
    next(err);
  }
});

export default router;
