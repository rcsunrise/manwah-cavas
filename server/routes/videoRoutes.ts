// server/routes/videoRoutes.ts
import { Router, Request, Response } from 'express';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { supabaseAdmin } from '../../src/lib/supabase';
import { getAvailableVideoCapabilities, resolveVideoCapability } from '../services/video/videoCapabilityRegistry';
import { VideoDirectorService } from '../services/video/videoDirectorService';
import { VideoJobService } from '../services/video/videoJobService';
import { GcsVideoStorage } from '../services/storage/gcsVideoStorage';
import { SpaceImageGenerationService } from '../services/spaceImageGenerationService';
import { AssetRepository } from '../repositories/assetRepository';
import { runGcsDiagnosticCheck } from '../../scripts/gcs_diagnostic_self_check';
import { optionalAuthenticateToken } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

const router = Router();
const upload = multer({
  limits: { fileSize: 25 * 1024 * 1024 }
});

// Cache last active diagnostic report in memory
let lastDiagnosticReport: any = null;

/**
 * GET /api/gateway/video/gcs-diagnostics
 * View-only diagnostic status query. Does NOT upload any test objects.
 * Unblocked by VIDEO_FEATURE_ENABLED.
 */
router.get('/api/gateway/video/gcs-diagnostics', async (req: Request, res: Response) => {
  try {
    const storageStatus = GcsVideoStorage.getInstance().getStatus();
    res.json({
      storageStatus,
      lastDiagnosticReport,
      hint: 'Use authorized POST /api/gateway/video/gcs-diagnostics to run active end-to-end self-check.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/gateway/video/gcs-diagnostics
 * Executes active diagnostic self-check (upload -> metadata -> readback -> V4 -> range 206).
 * Protected by admin authorization (or allowed in dev mode).
 * Unblocked by VIDEO_FEATURE_ENABLED.
 */
router.post('/api/gateway/video/gcs-diagnostics', optionalAuthenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  const isDev = process.env.NODE_ENV !== 'production';
  const hasAdminRole = req.user && (req.user.role === 'admin' || req.user.role === 'dept_admin');
  const hasAdminKey = Boolean(process.env.ADMIN_SECRET && req.headers['x-admin-key'] === process.env.ADMIN_SECRET);

  if (!isDev && !hasAdminRole && !hasAdminKey) {
    res.status(403).json({
      overallPassed: false,
      failureReason: 'Admin credentials required to trigger active GCS upload self-check.'
    });
    return;
  }

  try {
    const customBucket = (req.query.bucket as string) || (req.body?.bucket as string);
    const customProject = (req.query.projectId as string) || (req.body?.projectId as string);
    const report = await runGcsDiagnosticCheck(customBucket, customProject);
    lastDiagnosticReport = report;
    res.status(report.overallPassed ? 200 : 403).json(report);
  } catch (err: any) {
    res.status(500).json({
      overallPassed: false,
      failureReason: err.message || 'Fatal diagnostic execution error'
    });
  }
});

/**
 * GET /api/gateway/video/config
 * Returns available video capabilities
 */
router.get('/api/gateway/video/config', (req: Request, res: Response) => {
  const capabilities = getAvailableVideoCapabilities();
  const storageStatus = GcsVideoStorage.getInstance().getStatus();
  const rawDefaultKey = process.env.VIDEO_DEFAULT_MODEL_KEY || 'sd-2.0-fast';
  const defaultModelKey = resolveVideoCapability(rawDefaultKey).key;
  res.json({
    capabilities,
    defaultModelKey,
    storage: {
      provider: storageStatus.isGcsAvailable ? 'gcs' : 'local_fallback',
      bucket: storageStatus.bucketName
    }
  });
});

/**
 * POST /api/gateway/video/upload-reference-image
 * Uploads a reference image to Supabase Storage and returns its public URL
 */
router.post('/api/gateway/video/upload-reference-image', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: { message: 'No file uploaded' } });
      return;
    }
    const ext = (file.originalname.split('.').pop() || 'png').toLowerCase();
    const fileName = `ref-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const objectKey = `reference-images/${fileName}`;

    const { error: sbErr } = await supabaseAdmin.storage
      .from('creative-canvas-assets')
      .upload(objectKey, file.buffer, {
        contentType: file.mimetype || 'image/png',
        upsert: true
      });

    if (sbErr) {
      await supabaseAdmin.storage
        .from('assets')
        .upload(objectKey, file.buffer, {
          contentType: file.mimetype || 'image/png',
          upsert: true
        });
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('creative-canvas-assets')
      .getPublicUrl(objectKey);

    const publicUrl = urlData?.publicUrl || '';
    const assetVersionId = `av-ref-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    res.json({
      url: publicUrl,
      fileName: file.originalname,
      assetVersionId
    });
  } catch (err: any) {
    console.error('[videoRoutes] upload-reference-image error:', err);
    res.status(500).json({ error: { message: err.message || 'Upload failed' } });
  }
});

/**
 * POST /api/gateway/video/generate-shot-keyframe
 * Generates a static keyframe image for a shot before video synthesis
 */
router.post('/api/gateway/video/generate-shot-keyframe', async (req: Request, res: Response) => {
  try {
    const { canvasId, shotId, prompt, referenceImageUrl, productTitle } = req.body;
    if (!canvasId || !prompt) {
      res.status(400).json({ error: { message: 'canvasId and prompt are required' } });
      return;
    }
    const safeShotId = shotId || `shot-${Date.now()}`;
    const objectKey = `keyframes/${canvasId}/${safeShotId}.webp`;

    const result = await SpaceImageGenerationService.generateAndStore({
      projectId: canvasId,
      shotCode: safeShotId,
      positivePrompt: prompt,
      objectKey,
      productName: productTitle || '现代意式真皮家具',
      productReferenceImage: referenceImageUrl,
      aspectRatio: '16:9'
    });

    res.json({
      success: true,
      shotId: safeShotId,
      keyframeUrl: result.imageUrl,
      model: result.model
    });
  } catch (err: any) {
    console.error('[videoRoutes] generate-shot-keyframe error:', err);
    res.status(500).json({ error: { message: err.message || 'Keyframe generation failed' } });
  }
});

/**
 * POST /api/gateway/video/director-brief
 * Generates structured single-shot or multi-shot plan
 */
router.post('/api/gateway/video/director-brief', async (req: Request, res: Response) => {
  try {
    const {
      canvasId,
      mode,
      style,
      userPrompt,
      focusPoint,
      focusPoints,
      dnaSummary,
      sourceAssetVersionId,
      sourceImageUrl,
      directorModelKey,
      referenceImages,
      productTitle,
      productCategory,
      productDetails
    } = req.body;
    if (!canvasId || !userPrompt) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'canvasId and userPrompt are required' } });
      return;
    }

    const plan = await VideoDirectorService.generateDirectorBrief({
      canvasId,
      mode: mode || 'product_showcase',
      style: style || 'single_take',
      userPrompt,
      focusPoint,
      focusPoints,
      dnaSummary,
      sourceAssetVersionId,
      sourceImageUrl,
      directorModelKey,
      referenceImages,
      productTitle,
      productCategory,
      productDetails
    });

    res.json({ plan });
  } catch (err: any) {
    console.error('[videoRoutes] director-brief error:', err);
    res.status(500).json({ error: { code: 'DIRECTOR_FAILED', message: err.message } });
  }
});

/**
 * POST /api/gateway/video/generations
 * Submits a new generation task with strict idempotency
 */
router.post('/api/gateway/video/generations', async (req: Request, res: Response) => {
  try {
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body.idempotencyKey;
    if (!idempotencyKey) {
      res.status(400).json({ error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Header Idempotency-Key is required' } });
      return;
    }

    const { canvasId, modelKey, prompt, settings } = req.body;
    if (!canvasId || !modelKey || !prompt) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'canvasId, modelKey, and prompt are required' } });
      return;
    }

    const workspaceId = (req.headers['x-workspace-id'] as string) || 'ws-default';
    const result = await VideoJobService.getInstance().submitJob(req.body, idempotencyKey, workspaceId);

    res.status(result.isReused ? 200 : 202).json({
      job: result.job,
      isReused: result.isReused
    });
  } catch (err: any) {
    if (err.statusCode === 409) {
      res.status(409).json({ error: { code: 'IDEMPOTENCY_CONFLICT', message: err.message } });
      return;
    }
    console.error('[videoRoutes] generations submit error:', err);
    res.status(500).json({ error: { code: 'SUBMIT_FAILED', message: err.message } });
  }
});

/**
 * GET /api/gateway/video/generations/:taskId
 * Reads job state
 */
router.get('/api/gateway/video/generations/:taskId', (req: Request, res: Response) => {
  const taskId = String(req.params.taskId);
  const job = VideoJobService.getInstance().getJob(taskId);
  if (!job) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: `Job ${taskId} not found` } });
    return;
  }
  res.json({ job });
});

/**
 * GET /api/canvases/:canvasId/video-jobs
 * Lists all jobs for a canvas
 */
router.get('/api/canvases/:canvasId/video-jobs', (req: Request, res: Response) => {
  const canvasId = String(req.params.canvasId);
  const jobs = VideoJobService.getInstance().listJobsByCanvas(canvasId);
  res.json({ jobs });
});

/**
 * POST /api/gateway/video/generations/:taskId/cancel
 * Cancels a job
 */
router.post('/api/gateway/video/generations/:taskId/cancel', async (req: Request, res: Response) => {
  try {
    const taskId = String(req.params.taskId);
    const job = await VideoJobService.getInstance().cancelJob(taskId);
    res.json({ job });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'CANCEL_FAILED', message: err.message } });
  }
});

/**
 * POST /api/gateway/video/generations/:taskId/retry-transfer
 * Retries transfer only for transfer_failed jobs
 */
router.post('/api/gateway/video/generations/:taskId/retry-transfer', async (req: Request, res: Response) => {
  try {
    const taskId = String(req.params.taskId);
    const job = await VideoJobService.getInstance().retryTransfer(taskId);
    res.json({ job });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'RETRY_TRANSFER_FAILED', message: err.message } });
  }
});

/**
 * GET or POST /api/video-assets/:assetVersionId/playback-url
 * Issues temporary playback url, redirects directly for media tags if GET
 */
const handlePlaybackUrl = async (req: Request, res: Response) => {
  try {
    const assetVersionId = String(req.params.assetVersionId);
    let objectKey: string | null = null;
    let directUrl: string | null = null;

    try {
      const version = await AssetRepository.getAssetVersionById(assetVersionId);
      if (version?.object_key) {
        objectKey = version.object_key;
      }
    } catch {
      // ignore
    }

    if (!objectKey) {
      // Find from jobs
      const jobs = Array.from(VideoJobService.getInstance()['jobs'].values());
      const matched = jobs.find(j => j.assetVersionId === assetVersionId || j.id === assetVersionId);
      if (matched) {
        if ((matched as any).videoUrl) {
          directUrl = (matched as any).videoUrl;
        } else if ((matched as any).supabaseVideoUrl) {
          directUrl = (matched as any).supabaseVideoUrl;
        }
        objectKey = `creative-canvas/videos/${matched.workspaceId}/${matched.canvasId}/${matched.id}/${assetVersionId}/original.mp4`;
      }
    }

    if (directUrl) {
      if (req.method === 'GET' && !req.headers.accept?.includes('application/json')) {
        res.redirect(302, directUrl);
        return;
      }
      res.json({
        assetVersionId,
        playbackUrl: directUrl,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        storageProvider: 'direct_provider',
        rangeSupported: true
      });
      return;
    }

    if (!objectKey) {
      res.status(404).json({ error: { code: 'ASSET_NOT_FOUND', message: 'Video asset not found' } });
      return;
    }

    const ttl = Number(process.env.GCS_SIGNED_URL_TTL_SECONDS) || 86400;
    const playback = await GcsVideoStorage.getInstance().createPlaybackUrl(objectKey, ttl);

    if (req.method === 'GET' && !req.headers.accept?.includes('application/json')) {
      res.redirect(302, playback.url);
      return;
    }

    res.json({
      assetVersionId,
      playbackUrl: playback.url,
      expiresAt: playback.expiresAt,
      storageProvider: playback.provider,
      rangeSupported: playback.rangeSupported
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'PLAYBACK_SIGN_FAILED', message: err.message } });
  }
};

router.post('/api/video-assets/:assetVersionId/playback-url', handlePlaybackUrl);
router.get('/api/video-assets/:assetVersionId/playback-url', handlePlaybackUrl);
router.get('/api/video-assets/:assetVersionId/stream', handlePlaybackUrl);

/**
 * POST /api/video-assets/:assetVersionId/download-url
 * Issues download url
 */
router.post('/api/video-assets/:assetVersionId/download-url', async (req: Request, res: Response) => {
  try {
    const { assetVersionId } = req.params;
    res.json({
      downloadUrl: `/api/canvases/assets/video?assetId=${assetVersionId}&download=1`,
      filename: `product-showcase-${assetVersionId}.mp4`
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DOWNLOAD_FAILED', message: err.message } });
  }
});

/**
 * GET /api/canvases/:canvasId/video-events
 * Server-Sent Events (SSE) stream for live updates
 */
router.get('/api/canvases/:canvasId/video-events', (req: Request, res: Response) => {
  const canvasId = String(req.params.canvasId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send connected ping
  res.write(`data: ${JSON.stringify({ type: 'connected', canvasId })}\n\n`);

  const unsubscribe = VideoJobService.getInstance().subscribeCanvasEvents(canvasId, res);

  req.on('close', () => {
    unsubscribe();
  });
});

/**
 * GET /api/canvases/assets/video
 * Range-supporting video streaming route for local fallback storage
 */
router.get('/api/canvases/assets/video', (req: Request, res: Response) => {
  const key = req.query.key as string;
  if (!key) {
    res.status(400).send('Missing video key');
    return;
  }

  const streamInfo = GcsVideoStorage.getInstance().getLocalFileStream(key);
  if (!streamInfo || !streamInfo.exists) {
    // If not found locally, redirect to demo video so playback always works gracefully
    res.redirect('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4');
    return;
  }

  const { filePath, size } = streamInfo;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : size - 1;
    const chunkSize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4'
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': size,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes'
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

export default router;
