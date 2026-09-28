import { supabaseAdmin } from '../../src/lib/supabase';
import {
  CompositionAssembleInput,
  ScreenCompositionV2,
  CompositionRenderJob
} from '../../src/types/detailCompositionSchema';
import {
  assembleScreenComposition,
  getMemoryComposition
} from './compositionAssemblerService';
import { renderDetailCompositionBitmap } from './detailRenderService';

// In-memory job store for async job polling
const jobStore = new Map<string, CompositionRenderJob>();
const compositionStore = new Map<string, ScreenCompositionV2>();

export interface GateValidationResult {
  valid: boolean;
  errorCode?: string;
  message?: string;
}

export async function validateCompositionGateInput(
  input: CompositionAssembleInput
): Promise<GateValidationResult> {
  // 1. Check Base Asset Version status if specified
  if (input.baseAssetVersionId) {
    const { data: baseAsset } = await supabaseAdmin
      .from('asset_versions')
      .select('*')
      .eq('id', input.baseAssetVersionId)
      .maybeSingle();

    if (baseAsset && baseAsset.status !== 'ready') {
      return {
        valid: false,
        errorCode: 'BASE_ASSET_NOT_READY',
        message: `Base asset version ${input.baseAssetVersionId} is in status ${baseAsset.status}, expected 'ready'`
      };
    }
  }

  // 2. Check Consistency Report decision if specified
  if (input.consistencyReportId) {
    const { data: reportData } = await supabaseAdmin
      .from('product_consistency_reports')
      .select('*')
      .eq('id', input.consistencyReportId)
      .maybeSingle();

    if (reportData && reportData.decision !== 'PASS') {
      return {
        valid: false,
        errorCode: 'CONSISTENCY_GATE_BLOCKED',
        message: `Consistency report ${input.consistencyReportId} decision is ${reportData.decision}, must be 'PASS' to composite`
      };
    }
  }

  return { valid: true };
}

export async function createAndStartCompositionRenderJob(
  input: CompositionAssembleInput,
  providedComposition?: ScreenCompositionV2
): Promise<{ jobId: string; compositionId: string; composition: ScreenCompositionV2 }> {
  // Assemble full composition with real CopyVersion and TypographySpec
  const composition = providedComposition || await assembleScreenComposition(input);
  const compositionId = composition.compositionId;
  const jobId = `job_${compositionId}_${Date.now()}`;

  compositionStore.set(compositionId, composition);

  const job: CompositionRenderJob = {
    jobId,
    workspaceId: input.workspaceId || composition.workspaceId || 'default_workspace',
    canvasId: input.canvasId,
    compositionId,
    status: 'queued',
    progressPercent: 10,
    createdAt: new Date().toISOString()
  };

  jobStore.set(jobId, job);

  // Trigger non-blocking async rendering execution
  setImmediate(async () => {
    try {
      job.status = 'processing';
      job.progressPercent = 40;

      const output = await renderDetailCompositionBitmap(composition);

      job.status = 'completed';
      job.progressPercent = 100;
      job.compositionAssetVersionId = output.compositionAssetVersionId;
      job.outputObjectKey = output.objectKey;
      job.outputUrl = output.publicUrl;
      job.completedAt = new Date().toISOString();

      // Update composition status
      composition.status = 'rendered';
      composition.renderAssetVersionId = output.compositionAssetVersionId;

      try {
        await supabaseAdmin
          .from('detail_compositions')
          .update({
            status: 'rendered',
            updated_at: new Date().toISOString()
          })
          .eq('id', compositionId);
      } catch (e) {}
    } catch (err: any) {
      console.error('[DetailCompositionService] Render job failed:', err);
      job.status = 'failed';
      job.error = err?.message || 'Render job failed';
    }
  });

  return { jobId, compositionId, composition };
}

export async function getCompositionRenderJob(canvasId: string | undefined, jobId: string): Promise<CompositionRenderJob | null> {
  // Check in-memory cache for fast response
  const cached = jobStore.get(jobId);
  if (cached && (!canvasId || cached.canvasId === canvasId)) {
    return cached;
  }
  return cached || null;
}

export async function getScreenComposition(canvasId: string | undefined, compositionId: string): Promise<ScreenCompositionV2 | null> {
  const cached = compositionStore.get(compositionId) || getMemoryComposition(compositionId);
  if (cached && (!canvasId || cached.canvasId === canvasId)) {
    return cached;
  }

  try {
    let query = supabaseAdmin
      .from('detail_compositions')
      .select('*')
      .eq('id', compositionId);

    if (canvasId) {
      query = query.eq('canvas_id', canvasId);
    }

    const { data: compData } = await query.maybeSingle();

    if (compData) {
      // Fetch latest version
      const { data: verData } = await supabaseAdmin
        .from('detail_composition_versions')
        .select('*')
        .eq('composition_id', compositionId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (verData) {
        const comp: ScreenCompositionV2 = {
          schemaVersion: 'screen-composition/v2',
          compositionId: compData.id,
          compositionVersionId: verData.id,
          workspaceId: compData.workspace_id || 'default_workspace',
          canvasId: compData.canvas_id,
          screenId: compData.screen_id,
          screenRole: compData.screen_role,
          width: 2100,
          height: 2800,
          layoutManifestId: verData.layout_schema?.layoutManifestId || 'manifest_default',
          backgroundColor: verData.layout_schema?.backgroundColor || '#FAF8F5',
          imageLayers: verData.image_layers || [],
          textLayers: verData.text_layers || [],
          copySkuId: verData.layout_schema?.copySkuId || '',
          copyVersionId: verData.layout_schema?.copyVersionId || '',
          typographySpecId: verData.layout_schema?.typographySpecId || '',
          baseAssetVersionId: verData.asset_version_id || '',
          productDnaVersionId: verData.layout_schema?.productDnaVersionId || '',
          consistencyReportId: verData.layout_schema?.consistencyReportId || '',
          status: compData.status || 'draft',
          checksum: verData.checksum || ''
        };
        compositionStore.set(compositionId, comp);
        return comp;
      }
    }
  } catch (e) {
    console.warn('[DetailCompositionService] DB query composition error:', e);
  }

  return cached || null;
}

