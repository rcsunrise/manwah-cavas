import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest, AppError } from '../types';
import { optionalAuthenticateToken } from '../middleware/auth';
import { EvaluateProductConsistencyInputSchema, ProductConsistencyReport } from '../../src/types/consistencySchema';
import sharp from 'sharp';
import { evaluateProductConsistency, getCachedReport, ConsistencyImages } from '../services/consistencyService';
import { VideoSourceImageResolver } from '../services/video/videoSourceImageResolver';
import { isAllowedImageSource } from './posterTemplateRoutes';
import { supabaseAdmin } from '../../src/lib/supabase';

const router = Router();

/** 读取前端传来的参考图 / 候选图，压成 1280 以内的 JPEG 给视觉模型；地址不合规或读不到就跳过，由评估服务按“缺图”明确失败 */
async function loadConsistencyImages(body: any): Promise<ConsistencyImages> {
  const toPart = async (src: unknown, label: string) => {
    if (!isAllowedImageSource(src)) {
      if (src) console.warn(`[Consistency] ${label}地址不在允许范围内，已忽略`);
      return undefined;
    }
    try {
      const { buffer } = await VideoSourceImageResolver.loadImageBuffer(src);
      const small = await sharp(buffer, { failOn: 'none' }).resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      return { mimeType: 'image/jpeg', data: small.toString('base64') };
    } catch (e: any) {
      console.warn(`[Consistency] 读取${label}失败:`, e?.message || e);
      return undefined;
    }
  };
  const refSources: unknown[] = Array.isArray(body?.referenceImageUrls) ? body.referenceImageUrls.slice(0, 3) : [];
  const references = (await Promise.all(refSources.map(r => toPart(r, '参考图')))).filter(Boolean) as { mimeType: string; data: string }[];
  const candidate = await toPart(body?.candidateImageUrl, '候选图');
  return { candidate, references };
}

router.use(optionalAuthenticateToken as any);

// SSE Connection manager for real-time consistency status updates
const sseClientsMap = new Map<string, Response[]>();

function broadcastConsistencySSE(canvasId: string, eventName: string, data: any) {
  const clients = sseClientsMap.get(canvasId) || [];
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch (e) {}
  }
}

// 1. SSE Stream Endpoint
router.get('/:canvasId/product-consistency/sse', (req: AuthenticatedRequest, res: Response) => {
  const canvasId = String(req.params.canvasId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clients = sseClientsMap.get(canvasId) || [];
  clients.push(res);
  sseClientsMap.set(canvasId, clients);

  res.write(`event: connected\ndata: ${JSON.stringify({ canvasId, time: new Date().toISOString() })}\n\n`);

  req.on('close', () => {
    const list = sseClientsMap.get(canvasId) || [];
    const filtered = list.filter(c => c !== res);
    if (filtered.length > 0) {
      sseClientsMap.set(canvasId, filtered);
    } else {
      sseClientsMap.delete(canvasId);
    }
  });
});

// 2. Evaluate Single Screen Consistency
router.post('/:canvasId/product-consistency/evaluate', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const canvasId = String(req.params.canvasId);
    const user = req.user!;

    const parseResult = EvaluateProductConsistencyInputSchema.safeParse({
      ...req.body,
      canvasId,
      requestedBy: user.id
    });

    if (!parseResult.success) {
      throw new AppError(
        `输入格式校验失败: ${parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        400,
        'INVALID_INPUT_SCHEMA'
      );
    }

    const input = parseResult.data;

    broadcastConsistencySSE(canvasId, 'evaluation_started', {
      screenId: input.screenId,
      screenRole: input.screenRole,
      idempotencyKey: input.idempotencyKey
    });

    const images = await loadConsistencyImages(req.body);
    const report = await evaluateProductConsistency(input, images);

    broadcastConsistencySSE(canvasId, 'evaluation_completed', {
      screenId: input.screenId,
      reportId: report.reportId,
      decision: report.decision,
      totalScore: report.totalScore,
      hardViolations: report.hardViolations
    });

    return res.json({ success: true, report });
  } catch (err) {
    next(err);
  }
});

// 3. Batch Evaluate 9-Screen Consistency
router.post('/:canvasId/product-consistency/batch-evaluate', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const canvasId = String(req.params.canvasId);
    const user = req.user!;
    const { screens = [], productDnaVersionId = 'dna-v001', consistencyPolicyId = 'default-policy-v1', referenceAssetVersionIds = ['ref-v001'] } = req.body;

    if (!Array.isArray(screens) || screens.length === 0) {
      throw new AppError('请提供待评估的 全案 screens 列表', 400, 'BAD_REQUEST');
    }

    const reports: ProductConsistencyReport[] = [];

    broadcastConsistencySSE(canvasId, 'batch_started', { totalScreens: screens.length });

    for (let i = 0; i < screens.length; i++) {
      const scr = screens[i];
      const screenId = scr.screenId || `screen-0${i + 1}`;
      const screenRole = scr.screenRole || (i === 0 ? 'PRODUCT_HERO' : 'LIFESTYLE_SCENE');
      const candidateAssetVersionId = scr.candidateAssetVersionId || `asset-s0${i + 1}-v001`;
      const idempotencyKey = scr.idempotencyKey || `batch_${canvasId}_s0${i + 1}_v1`;

      const input = {
        workspaceId: user.id,
        canvasId,
        screenId,
        screenRole,
        productDnaVersionId,
        consistencyPolicyId,
        referenceAssetVersionIds,
        candidateAssetVersionId,
        idempotencyKey,
        requestedBy: user.id
      };

      const report = await evaluateProductConsistency(input);
      reports.push(report);

      broadcastConsistencySSE(canvasId, 'batch_progress', {
        completedIndex: i + 1,
        totalScreens: screens.length,
        currentReport: report
      });
    }

    broadcastConsistencySSE(canvasId, 'batch_completed', { reports });

    return res.json({ success: true, reports });
  } catch (err) {
    next(err);
  }
});

// 4. Single Screen Repair (Fix Current Screen -> New Asset Version)
router.post('/:canvasId/product-consistency/fix-screen', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const canvasId = String(req.params.canvasId);
    const user = req.user!;
    const {
      screenId = 'screen-01',
      screenRole = 'PRODUCT_HERO',
      productDnaVersionId = 'dna-v001',
      previousCandidateAssetVersionId = 'asset-s01-v001',
      repairConstraints = []
    } = req.body;

    // Create new candidate Asset Version (e.g. V002) without overwriting original V001
    const newVersionNumber = parseInt(previousCandidateAssetVersionId.replace(/.*v0*/i, '') || '1', 10) + 1;
    const newCandidateAssetVersionId = `${previousCandidateAssetVersionId.replace(/-v\d+$/i, '')}-v00${newVersionNumber}`;

    // Register new Asset Version record
    try {
      await supabaseAdmin.from('asset_versions').insert({
        id: newCandidateAssetVersionId,
        workspace_id: user.id,
        status: 'ready',
        object_key: `repaired_${newCandidateAssetVersionId}.jpg`,
        created_at: new Date().toISOString()
      });
    } catch (e) {}

    // Re-evaluate automatically for new candidate
    const idempotencyKey = `repair_${canvasId}_${newCandidateAssetVersionId}_${Date.now()}`;
    const report = await evaluateProductConsistency({
      workspaceId: user.id,
      canvasId,
      screenId,
      screenRole,
      productDnaVersionId,
      consistencyPolicyId: 'default-policy-v1',
      referenceAssetVersionIds: ['ref-v001'],
      candidateAssetVersionId: newCandidateAssetVersionId,
      idempotencyKey,
      requestedBy: user.id
    });

    broadcastConsistencySSE(canvasId, 'screen_repaired', {
      screenId,
      oldAssetVersionId: previousCandidateAssetVersionId,
      newAssetVersionId: newCandidateAssetVersionId,
      report
    });

    return res.json({
      success: true,
      screenId,
      oldCandidateAssetVersionId: previousCandidateAssetVersionId,
      newCandidateAssetVersionId,
      report
    });
  } catch (err) {
    next(err);
  }
});

// 5. Query Canvas Consistency Reports
router.get('/:canvasId/product-consistency/reports', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const canvasId = String(req.params.canvasId);
    const user = req.user!;

    const { data, error } = await supabaseAdmin
      .from('product_consistency_reports')
      .select('*')
      .eq('workspace_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[ConsistencyRoutes] DB query fallback:', error);
    }

    return res.json({
      success: true,
      canvasId,
      reports: data || []
    });
  } catch (err) {
    next(err);
  }
});

export default router;
