// server/services/video/videoJobService.ts
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Response } from 'express';
import {
  VideoJob,
  VideoJobStatus,
  VideoSubmitPayload
} from '../../../src/types/creativeCanvasVideo';
import { VectorEngineVideoAdapter } from './providers/vectorEngineAdapter';
import { GcsVideoStorage } from '../storage/gcsVideoStorage';
import { AssetRepository } from '../../repositories/assetRepository';
import { supabaseAdmin } from '../../../src/lib/supabase';

const DATA_DIR = path.join(process.cwd(), '.data');
const STORAGE_FILE = path.join(DATA_DIR, 'video_jobs.json');

export class VideoJobService {
  private static instance: VideoJobService;
  private jobs = new Map<string, VideoJob>();
  private idempotencyStore = new Map<string, { job: VideoJob; requestHash: string }>();
  private sseListeners = new Map<string, Set<Response>>();
  private pollingTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.loadFromDisk();
    this.ensureStorageBucket().catch(e => console.warn('[VideoJobService] ensureStorageBucket failed:', e));
    this.startBackgroundWorker();
  }

  private async ensureStorageBucket(): Promise<void> {
    try {
      const { data: buckets } = await supabaseAdmin.storage.listBuckets();
      const existing = buckets?.find(b => b.name === 'creative-canvas-assets');
      if (!existing) {
        await supabaseAdmin.storage.createBucket('creative-canvas-assets', { public: true });
      } else if (!existing.public) {
        await supabaseAdmin.storage.updateBucket('creative-canvas-assets', { public: true });
      }
    } catch (e) {
      console.warn('[VideoJobService] ensureStorageBucket non-fatal exception:', e);
    }
  }

  public static getInstance(): VideoJobService {
    if (!VideoJobService.instance) {
      VideoJobService.instance = new VideoJobService();
    }
    return VideoJobService.instance;
  }

  private saveToDisk(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = {
        jobs: Array.from(this.jobs.entries()),
        idempotencyStore: Array.from(this.idempotencyStore.entries())
      };
      fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[VideoJobService] Failed to save jobs to disk:', err);
    }
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(STORAGE_FILE)) {
        const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.jobs) this.jobs = new Map(parsed.jobs);
        if (parsed.idempotencyStore) this.idempotencyStore = new Map(parsed.idempotencyStore);
        console.log(`[VideoJobService] Restored ${this.jobs.size} video jobs from disk.`);
      }
    } catch (err) {
      console.error('[VideoJobService] Failed to load video jobs from disk:', err);
    }
  }

  /**
   * Subscribes SSE response to canvas events
   */
  public subscribeCanvasEvents(canvasId: string, res: Response): () => void {
    if (!this.sseListeners.has(canvasId)) {
      this.sseListeners.set(canvasId, new Set());
    }
    const set = this.sseListeners.get(canvasId)!;
    set.add(res);

    return () => {
      set.delete(res);
      if (set.size === 0) {
        this.sseListeners.delete(canvasId);
      }
    };
  }

  /**
   * Broadcasts job update via SSE
   */
  private broadcastJobUpdate(job: VideoJob): void {
    const listeners = this.sseListeners.get(job.canvasId);
    if (listeners && listeners.size > 0) {
      const payload = `data: ${JSON.stringify({ type: 'video_job_updated', job })}\n\n`;
      for (const res of listeners) {
        try {
          res.write(payload);
        } catch {
          // ignore closed connections
        }
      }
    }
  }

  /**
   * Creates or returns existing video job with strict idempotency
   */
  public async submitJob(
    payload: VideoSubmitPayload,
    idempotencyKey: string,
    workspaceId: string = 'ws-default'
  ): Promise<{ job: VideoJob; isReused: boolean }> {
    const requestHash = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          canvasId: payload.canvasId,
          modelKey: payload.modelKey,
          prompt: payload.prompt,
          settings: payload.settings,
          shotId: payload.shotId,
          sourceAssetVersionId: payload.sourceAssetVersionId
        })
      )
      .digest('hex');

    const fullIdempKey = `${workspaceId}:${idempotencyKey}`;
    const existing = this.idempotencyStore.get(fullIdempKey);

    if (existing) {
      if (existing.requestHash !== requestHash) {
        const error: any = new Error('Idempotency key was previously used with a different request payload');
        error.statusCode = 409;
        error.code = 'IDEMPOTENCY_CONFLICT';
        throw error;
      }
      return { job: existing.job, isReused: true };
    }

    const jobId = `vjob-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const newJob: VideoJob = {
      id: jobId,
      workspaceId,
      canvasId: payload.canvasId,
      planVersionId: payload.planVersionId || 'default-plan',
      shotId: payload.shotId || 'shot-1',
      attempt: 1,
      modelKey: payload.modelKey,
      status: 'queued',
      idempotencyKey,
      requestHash,
      sourceAssetVersionId: payload.sourceAssetVersionId,
      sourceImageUrl: payload.sourceImageUrl || null,
      videoSettings: payload.settings,
      prompt: payload.prompt,
      progressPercent: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.jobs.set(jobId, newJob);
    this.idempotencyStore.set(fullIdempKey, { job: newJob, requestHash });
    this.saveToDisk();
    this.broadcastJobUpdate(newJob);

    // Trigger async submission
    this.processSubmission(newJob, fullIdempKey);

    return { job: newJob, isReused: false };
  }

  /**
   * Asynchronously submits job to provider
   */
  private async processSubmission(job: VideoJob, idempKey: string): Promise<void> {
    job.status = 'submitting';
    job.updatedAt = new Date().toISOString();
    this.saveToDisk();
    this.broadcastJobUpdate(job);

    try {
      const submitResult = await VectorEngineVideoAdapter.submit(
        {
          modelKey: job.modelKey,
          prompt: job.prompt,
          sourceImageUrl: job.sourceImageUrl || undefined,
          settings: job.videoSettings
        },
        idempKey
      );

      job.providerTaskId = submitResult.providerTaskId;
      if (submitResult.directVideoUrl) {
        (job as any).videoUrl = submitResult.directVideoUrl;
        // 标记为就绪（可即时播放，同时后台归档落盘）
        job.status = 'ready';
        job.progressPercent = 100;
        job.updatedAt = new Date().toISOString();
        this.saveToDisk();
        this.broadcastJobUpdate(job);
        this.transferVideoToStorage(job, submitResult.directVideoUrl);
        return;
      }

      job.status = 'running';
      job.progressPercent = 20;
      job.updatedAt = new Date().toISOString();
      this.saveToDisk();
      this.broadcastJobUpdate(job);
    } catch (err: any) {
      console.error(`[VideoJobService] Job ${job.id} submission failed:`, err);
      job.status = 'submission_unknown';
      job.errorMessage = err.message || 'Submission to video provider encountered an unknown network error';
      job.updatedAt = new Date().toISOString();
      this.saveToDisk();
      this.broadcastJobUpdate(job);
    }
  }

  /**
   * Background worker to poll running jobs and transfer results
   */
  private startBackgroundWorker(): void {
    if (this.pollingTimer) return;
    this.pollingTimer = setInterval(async () => {
      // 1. 查询正在运行和排队中的任务
      const activeJobs = Array.from(this.jobs.values()).filter(
        j => j.status === 'running' || j.status === 'queued'
      );

      for (const job of activeJobs) {
        if (!job.providerTaskId) continue;

        try {
          const providerStatus = await VectorEngineVideoAdapter.query(job.providerTaskId);
          job.providerStatus = providerStatus.status;
          job.progressPercent = providerStatus.progressPercent;
          job.updatedAt = new Date().toISOString();

          if (providerStatus.status === 'succeeded' && providerStatus.videoUrl) {
            (job as any).videoUrl = providerStatus.videoUrl;
            // 立即置为 ready，让前端第一时间呈现并可直接播放
            job.status = 'ready';
            job.progressPercent = 100;
            job.readyAt = new Date().toISOString();
            this.saveToDisk();
            this.broadcastJobUpdate(job);

            // 后台异步安全落盘至 GCS + Supabase Storage
            await this.transferVideoToStorage(job, providerStatus.videoUrl, providerStatus.posterUrl);
          } else if (providerStatus.status === 'failed') {
            job.status = 'failed';
            job.errorCode = providerStatus.errorCode || 'PROVIDER_FAILED';
            job.errorMessage = providerStatus.errorMessage || 'Provider generation failed';
            this.saveToDisk();
            this.broadcastJobUpdate(job);
          } else {
            this.saveToDisk();
            this.broadcastJobUpdate(job);
          }
        } catch (err) {
          console.warn(`[VideoJobService] Error querying task ${job.id}:`, err);
        }
      }

      // 2. 自动拯救卡在 transferring 状态的历史任务（避免前端无限转圈）
      const stuckJobs = Array.from(this.jobs.values()).filter(j => {
        if (j.status !== 'transferring') return false;
        const updatedTime = new Date(j.updatedAt || j.createdAt).getTime();
        return Date.now() - updatedTime > 15000;
      });

      for (const stuckJob of stuckJobs) {
        const directUrl = (stuckJob as any).videoUrl;
        if (directUrl) {
          console.log(`[VideoJobService] Auto-rescuing stuck transferring job ${stuckJob.id}...`);
          stuckJob.status = 'ready';
          stuckJob.progressPercent = 100;
          this.saveToDisk();
          this.broadcastJobUpdate(stuckJob);
          this.transferVideoToStorage(stuckJob, directUrl).catch(e => {
            console.warn(`[VideoJobService] Background rescue transfer error:`, e);
          });
        }
      }
    }, 2500);
  }

  /**
   * Transfers provider video to storage (GCS + Supabase Storage + local disk) and registers asset version
   */
  private async transferVideoToStorage(
    job: VideoJob,
    videoDownloadUrl: string,
    posterUrl?: string
  ): Promise<void> {
    try {
      // 1. Download video buffer with timeout protection
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);
      const resp = await fetch(videoDownloadUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        throw new Error(`Failed to download provider video (${resp.status}): ${resp.statusText}`);
      }
      const arrayBuf = await resp.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      const assetVersionId = `av-vid-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

      // 2. Multi-target Persistence: A) GCS Video Storage
      const storageResult = await GcsVideoStorage.getInstance().persistVideo({
        workspaceId: job.workspaceId,
        canvasId: job.canvasId,
        jobId: job.id,
        assetVersionId,
        buffer,
        fileName: 'original.mp4',
        contentType: 'video/mp4'
      });

      // 2. Multi-target Persistence: B) Supabase Storage (creative-canvas-assets/videos)
      let supabasePublicUrl: string | null = null;
      try {
        const sbPath = `videos/${job.workspaceId}/${job.canvasId}/${job.id}.mp4`;
        const { error: sbErr } = await supabaseAdmin.storage
          .from('creative-canvas-assets')
          .upload(sbPath, buffer, {
            contentType: 'video/mp4',
            upsert: true
          });
        if (!sbErr) {
          const { data: urlData } = supabaseAdmin.storage
            .from('creative-canvas-assets')
            .getPublicUrl(sbPath);
          if (urlData?.publicUrl) {
            supabasePublicUrl = urlData.publicUrl;
            console.log(`[VideoJobService] Supabase Storage upload success: ${supabasePublicUrl}`);
          }
        } else {
          console.warn('[VideoJobService] Supabase upload returned error:', sbErr.message);
        }
      } catch (sbEx) {
        console.warn('[VideoJobService] Supabase Storage upload exception (non-fatal):', sbEx);
      }

      // 3. Register asset version record
      try {
        const sku = await AssetRepository.getOrCreateAssetSku(
          job.canvasId,
          job.workspaceId,
          `video_${job.shotId}`,
          `视频镜头 ${job.shotId}`
        );

        await AssetRepository.insertAssetVersion({
          id: assetVersionId,
          asset_sku_id: sku.id,
          version_number: 1,
          status: 'ready',
          bucket: storageResult.bucket,
          object_key: storageResult.objectKey,
          mime_type: 'video/mp4',
          file_size_bytes: storageResult.bytes,
          checksum: storageResult.sha256,
          generation_provider: 'vectorengine',
          generation_model: job.modelKey,
          ready_at: new Date().toISOString()
        });
      } catch (dbErr) {
        console.warn('[VideoJobService] Supabase asset version registration skipped/fallback:', dbErr);
      }

      // 获取 GCS 签名播放直链作为高可用候选
      let gcsSignedUrl: string | null = null;
      try {
        const playback = await GcsVideoStorage.getInstance().createPlaybackUrl(storageResult.objectKey, 86400);
        if (playback?.url) {
          gcsSignedUrl = playback.url;
        }
      } catch (playErr) {
        // ignore
      }

      // 确定最终用于前端渲染的最佳播放 URL（优先使用 Supabase 公网 URL，其次使用 GCS 签名 URL，最后 fallback 到直出 URL）
      const definitivePlaybackUrl = supabasePublicUrl || gcsSignedUrl || videoDownloadUrl;
      (job as any).videoUrl = definitivePlaybackUrl;
      (job as any).supabaseVideoUrl = supabasePublicUrl;
      (job as any).gcsObjectKey = storageResult.objectKey;

      job.status = 'ready';
      job.assetVersionId = assetVersionId;
      job.readyAt = new Date().toISOString();
      job.progressPercent = 100;
      job.updatedAt = new Date().toISOString();
      this.saveToDisk();
      this.broadcastJobUpdate(job);
    } catch (err: any) {
      console.error(`[VideoJobService] Transfer exception for job ${job.id}:`, err);
      // 优雅降级：如果已有可播放视频地址，绝不让用户在前端看到死循环转圈
      if ((job as any).videoUrl || videoDownloadUrl) {
        (job as any).videoUrl = (job as any).videoUrl || videoDownloadUrl;
        job.status = 'ready';
        job.progressPercent = 100;
        (job as any).transferNotice = `云端持久化遇到延迟，已启用直链加速播放 (${err.message || '已自动切换直连'})`;
      } else {
        job.status = 'transfer_failed';
        job.errorMessage = err.message || 'Transfer to storage failed';
      }
      job.updatedAt = new Date().toISOString();
      this.saveToDisk();
      this.broadcastJobUpdate(job);
    }
  }

  /**
   * Retries transferring an already generated provider video
   */
  public async retryTransfer(jobId: string): Promise<VideoJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (job.status !== 'transfer_failed') {
      throw new Error(`Job ${jobId} is in status ${job.status}, not transfer_failed`);
    }

    if (!job.providerTaskId) {
      throw new Error(`Job ${jobId} does not have a providerTaskId`);
    }

    job.status = 'transferring';
    job.errorMessage = undefined;
    job.updatedAt = new Date().toISOString();
    this.saveToDisk();
    this.broadcastJobUpdate(job);

    const providerStatus = await VectorEngineVideoAdapter.query(job.providerTaskId);
    if (providerStatus.videoUrl) {
      await this.transferVideoToStorage(job, providerStatus.videoUrl, providerStatus.posterUrl);
    } else {
      job.status = 'transfer_failed';
      job.errorMessage = 'Provider video download URL is no longer available';
      this.saveToDisk();
      this.broadcastJobUpdate(job);
    }

    return job;
  }

  /**
   * Cancels a job
   */
  public async cancelJob(jobId: string): Promise<VideoJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (job.status === 'ready' || job.status === 'cancelled') {
      return job;
    }

    if (job.providerTaskId) {
      await VectorEngineVideoAdapter.cancel(job.providerTaskId);
    }

    job.status = 'cancelled';
    job.updatedAt = new Date().toISOString();
    this.saveToDisk();
    this.broadcastJobUpdate(job);

    return job;
  }

  public getJob(jobId: string): VideoJob | null {
    return this.jobs.get(jobId) || null;
  }

  public listJobsByCanvas(canvasId: string): VideoJob[] {
    return Array.from(this.jobs.values())
      .filter(j => j.canvasId === canvasId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}
