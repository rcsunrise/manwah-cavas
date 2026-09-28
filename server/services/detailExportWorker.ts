import { processFullCanvasExport } from './detailExportService';

export interface LocalRenderJob {
  id: string;
  workspace_id?: string;
  canvas_id: string;
  job_type?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  input_payload?: any;
  output_result?: any;
  error_message?: string;
  idempotency_key?: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  heartbeat_at?: string;
}

// In-memory reliable local queue and state store for jobs
const localJobsStore = new Map<string, LocalRenderJob>();

export function saveLocalJob(job: LocalRenderJob): void {
  localJobsStore.set(job.id, { ...job });
}

export function getLocalJob(jobId: string): LocalRenderJob | null {
  return localJobsStore.get(jobId) || null;
}

export function findLocalJobByIdempotency(key: string): LocalRenderJob | null {
  for (const job of localJobsStore.values()) {
    if (job.idempotency_key === key) return job;
  }
  return null;
}

export function updateLocalJob(jobId: string, updates: Partial<LocalRenderJob>): LocalRenderJob | null {
  const existing = localJobsStore.get(jobId);
  if (!existing) return null;
  const updated = {
    ...existing,
    ...updates,
    updated_at: new Date().toISOString()
  };
  localJobsStore.set(jobId, updated);
  return updated;
}

// In-memory local async worker (no DB polling on detail_render_jobs)
class DetailExportWorker {
  public start(_intervalMs = 4000) {
    // No-op: DB polling on detail_render_jobs is completely disabled/removed
  }

  public stop() {
    // No-op
  }

  public async processLocalJob(jobId: string): Promise<void> {
    const job = localJobsStore.get(jobId);
    if (!job || job.status !== 'queued') return;

    updateLocalJob(jobId, { status: 'processing', progress: 20 });

    const payload = job.input_payload || {};
    const exportId = payload.exportId || `exp_${job.canvas_id}_${Date.now()}`;
    const workspaceId = job.workspace_id || payload.workspaceId || 'default_workspace';
    const canvasId = job.canvas_id;

    try {
      updateLocalJob(jobId, { progress: 40 });
      const exportResult = await processFullCanvasExport({
        exportId,
        workspaceId,
        canvasId,
        createdBy: job.created_by || null,
        idempotencyKey: job.idempotency_key
      });

      updateLocalJob(jobId, {
        status: 'completed',
        progress: 100,
        output_result: exportResult
      });
    } catch (err: any) {
      console.error(`[DetailExportWorker] Local Job ${jobId} failed:`, err?.message || err);
      updateLocalJob(jobId, {
        status: 'failed',
        progress: 0,
        error_message: err?.message || 'Long canvas render process failed'
      });
    }
  }

  public async pollAndProcessNextJob() {
    // Process queued local jobs in memory
    for (const [id, job] of localJobsStore.entries()) {
      if (job.status === 'queued') {
        await this.processLocalJob(id);
      }
    }
  }
}

export const detailExportWorker = new DetailExportWorker();

export async function claimStaleRenderJobs(timeoutMs = 300000): Promise<any[]> {
  const cutoff = new Date(Date.now() - timeoutMs).toISOString();
  const result: any[] = [];
  for (const [id, job] of localJobsStore.entries()) {
    if (job.status === 'processing' && job.updated_at && job.updated_at < cutoff) {
      job.status = 'queued';
      result.push(job);
    }
  }
  return result;
}

export async function updateJobHeartbeat(jobId: string): Promise<boolean> {
  const local = localJobsStore.get(jobId);
  if (local) {
    local.heartbeat_at = new Date().toISOString();
    local.updated_at = new Date().toISOString();
    return true;
  }
  return true;
}
