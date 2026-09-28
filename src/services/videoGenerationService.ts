// src/services/videoGenerationService.ts
import {
  VideoCapability,
  VideoDirectorPlan,
  VideoJob,
  VideoPlaybackInfo,
  VideoSubmitPayload,
  VideoDirectorBriefRequest
} from '../types/creativeCanvasVideo';

export interface VideoConfigResponse {
  capabilities: VideoCapability[];
  defaultModelKey: string;
  storage: {
    provider: 'gcs' | 'local_fallback';
    bucket: string | null;
  };
}

export class VideoGenerationService {
  /**
   * Fetch configured video capabilities and storage status
   */
  public static async fetchConfig(): Promise<VideoConfigResponse> {
    const res = await fetch('/api/gateway/video/config');
    if (!res.ok) {
      throw new Error(`Failed to fetch video config (${res.status})`);
    }
    return res.json();
  }

  /**
   * Uploads a reference image for video generation
   */
  public static async uploadReferenceImage(file: File): Promise<{ url: string; fileName: string; assetVersionId: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/gateway/video/upload-reference-image', {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Upload reference image failed (${res.status})`);
    }
    return res.json();
  }

  /**
   * Generates a static keyframe image for a shot
   */
  public static async generateShotKeyframe(params: {
    canvasId: string;
    shotId: string;
    prompt: string;
    referenceImageUrl?: string;
    productTitle?: string;
  }): Promise<{ success: boolean; shotId: string; keyframeUrl: string; model: string }> {
    const res = await fetch('/api/gateway/video/generate-shot-keyframe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Keyframe generation failed (${res.status})`);
    }
    return res.json();
  }

  /**
   * Generates a director brief
   */
  public static async generateDirectorBrief(
    request: VideoDirectorBriefRequest
  ): Promise<VideoDirectorPlan> {
    const res = await fetch('/api/gateway/video/director-brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Director brief failed (${res.status})`);
    }
    const data = await res.json();
    return data.plan;
  }

  /**
   * Submits a video generation task with idempotency
   */
  public static async submitGeneration(
    payload: VideoSubmitPayload,
    idempotencyKey?: string
  ): Promise<{ job: VideoJob; isReused: boolean }> {
    const idempKey = idempotencyKey || `idem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const res = await fetch('/api/gateway/video/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempKey
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Generation submission failed (${res.status})`);
    }

    return res.json();
  }

  /**
   * Fetches single job status
   */
  public static async fetchJob(taskId: string): Promise<VideoJob> {
    const res = await fetch(`/api/gateway/video/generations/${taskId}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch job (${res.status})`);
    }
    const data = await res.json();
    return data.job;
  }

  /**
   * Lists all video jobs for a canvas
   */
  public static async fetchCanvasJobs(canvasId: string): Promise<VideoJob[]> {
    const res = await fetch(`/api/canvases/${canvasId}/video-jobs`);
    if (!res.ok) {
      throw new Error(`Failed to fetch canvas video jobs (${res.status})`);
    }
    const data = await res.json();
    return data.jobs || [];
  }

  /**
   * Requests job cancellation
   */
  public static async cancelJob(taskId: string): Promise<VideoJob> {
    const res = await fetch(`/api/gateway/video/generations/${taskId}/cancel`, {
      method: 'POST'
    });
    if (!res.ok) {
      throw new Error(`Failed to cancel job (${res.status})`);
    }
    const data = await res.json();
    return data.job;
  }

  /**
   * Retries storage transfer for a transfer_failed job
   */
  public static async retryTransfer(taskId: string): Promise<VideoJob> {
    const res = await fetch(`/api/gateway/video/generations/${taskId}/retry-transfer`, {
      method: 'POST'
    });
    if (!res.ok) {
      throw new Error(`Failed to retry transfer (${res.status})`);
    }
    const data = await res.json();
    return data.job;
  }

  /**
   * Obtains signed playback URL for an asset version
   */
  public static async getPlaybackUrl(assetVersionId: string): Promise<VideoPlaybackInfo> {
    const res = await fetch(`/api/video-assets/${assetVersionId}/playback-url`, {
      method: 'POST'
    });
    if (!res.ok) {
      throw new Error(`Failed to obtain playback URL (${res.status})`);
    }
    return res.json();
  }

  /**
   * Subscribes to real-time SSE stream for canvas video jobs
   */
  public static subscribeVideoEvents(
    canvasId: string,
    onJobUpdate: (job: VideoJob) => void
  ): () => void {
    const sse = new EventSource(`/api/canvases/${canvasId}/video-events`);

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'video_job_updated' && data.job) {
          onJobUpdate(data.job);
        }
      } catch (e) {
        console.warn('[SSE] Failed to parse video event:', e);
      }
    };

    sse.onerror = () => {
      // EventSource reconnect or transient stream close - handled gracefully
    };

    return () => {
      sse.close();
    };
  }
}
