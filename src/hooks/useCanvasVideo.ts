// src/hooks/useCanvasVideo.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  VideoCapability,
  VideoDirectorPlan,
  VideoJob,
  VideoPlaybackInfo,
  VideoCreationMode,
  VideoStyle,
  VideoSettings,
  ACTIVE_VIDEO_JOB_STATUSES
} from '../types/creativeCanvasVideo';
import { VideoGenerationService } from '../services/videoGenerationService';

// enabled=false 时不建立 SSE 也不轮询（面板关闭时由画布页统一同步任务状态）
export function useCanvasVideo(canvasId: string, enabled = true) {
  const [capabilities, setCapabilities] = useState<VideoCapability[]>([]);
  const [defaultModelKey, setDefaultModelKey] = useState<string>('sd-2.0-fast');
  const [storageInfo, setStorageInfo] = useState<{ provider: string; bucket: string | null } | null>(null);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [directorPlan, setDirectorPlan] = useState<VideoDirectorPlan | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isSubmittingJob, setIsSubmittingJob] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 相同参数的提交在途时复用同一个请求（防双击重复建任务，并保证幂等键一致）
  const inFlightSubmitsRef = useRef(new Map<string, Promise<VideoJob>>());

  // Load capabilities & existing jobs
  useEffect(() => {
    if (!canvasId || !enabled) return;

    VideoGenerationService.fetchConfig()
      .then(config => {
        setCapabilities(config.capabilities);
        setDefaultModelKey(config.defaultModelKey);
        setStorageInfo(config.storage);
      })
      .catch(err => {
        console.warn('[useCanvasVideo] Failed to fetch video config:', err);
      });

    VideoGenerationService.fetchCanvasJobs(canvasId)
      .then(canvasJobs => {
        setJobs(canvasJobs);
      })
      .catch(err => {
        console.warn('[useCanvasVideo] Failed to fetch canvas jobs:', err);
      });

    // Subscribe to SSE
    const unsubscribe = VideoGenerationService.subscribeVideoEvents(canvasId, updatedJob => {
      setJobs(prev => {
        const idx = prev.findIndex(j => j.id === updatedJob.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updatedJob;
          return next;
        }
        return [updatedJob, ...prev];
      });
    });

    // Active Jobs fallback polling：有进行中任务 2.5s，否则 15s
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      let hasActiveJob = false;
      try {
        const currentJobs = await VideoGenerationService.fetchCanvasJobs(canvasId);
        if (currentJobs && currentJobs.length > 0) {
          setJobs(currentJobs);
          hasActiveJob = currentJobs.some(j => ACTIVE_VIDEO_JOB_STATUSES.has(j.status));
        }
      } catch (pollErr) {
        // quiet fallback
      }
      if (!cancelled) {
        pollTimer = setTimeout(poll, hasActiveJob ? 2500 : 15000);
      }
    };
    pollTimer = setTimeout(poll, 2500);

    return () => {
      cancelled = true;
      unsubscribe();
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [canvasId, enabled]);

  const refreshJobs = useCallback(async () => {
    try {
      const refreshed = await VideoGenerationService.fetchCanvasJobs(canvasId);
      setJobs(refreshed);
      return refreshed;
    } catch (e) {
      console.warn('[useCanvasVideo] Manual refresh jobs failed:', e);
      return [];
    }
  }, [canvasId]);

  // Generate Director Plan
  const generatePlan = useCallback(
    async (params: {
      mode: VideoCreationMode;
      style: VideoStyle;
      userPrompt: string;
      focusPoint?: string;
      focusPoints?: string[];
      dnaSummary?: string;
      sourceAssetVersionId?: string | null;
      sourceImageUrl?: string;
      directorModelKey?: string;
      referenceImages?: Array<{ url: string; title?: string }>;
      productTitle?: string;
      productCategory?: string;
      productDetails?: string;
      targetDurationSeconds?: number;
    }) => {
      setIsGeneratingPlan(true);
      setError(null);
      try {
        const plan = await VideoGenerationService.generateDirectorBrief({
          canvasId,
          ...params
        });
        setDirectorPlan(plan);
        return plan;
      } catch (err: any) {
        setError(err.message || '生成导演分镜方案失败');
        throw err;
      } finally {
        setIsGeneratingPlan(false);
      }
    },
    [canvasId]
  );

  // Submit Video Generation
  const submitVideo = useCallback(
    async (params: {
      sourceNodeId: string;
      sourceAssetVersionId?: string | null;
      sourceImageUrl?: string;
      lastFrameImageUrl?: string;
      planVersionId?: string;
      shotId?: string;
      mode: VideoCreationMode;
      style?: VideoStyle;
      modelKey: string;
      settings: VideoSettings;
      prompt: string;
      inputAssetVersionIds?: string[];
    }) => {
      const submitKey = JSON.stringify([canvasId, params]);
      const inFlight = inFlightSubmitsRef.current.get(submitKey);
      if (inFlight) return inFlight;

      const idempotencyKey = `idem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const request = (async () => {
        setIsSubmittingJob(true);
        setError(null);
        try {
          const { job } = await VideoGenerationService.submitGeneration(
            { canvasId, ...params },
            idempotencyKey
          );
          setJobs(prev => [job, ...prev.filter(j => j.id !== job.id)]);
          return job;
        } catch (err: any) {
          setError(err.message || '提交视频生成失败');
          throw err;
        } finally {
          inFlightSubmitsRef.current.delete(submitKey);
          setIsSubmittingJob(inFlightSubmitsRef.current.size > 0);
        }
      })();
      inFlightSubmitsRef.current.set(submitKey, request);
      return request;
    },
    [canvasId]
  );

  // Cancel Job
  const cancelJob = useCallback(async (taskId: string) => {
    try {
      const updated = await VideoGenerationService.cancelJob(taskId);
      setJobs(prev => prev.map(j => (j.id === taskId ? updated : j)));
    } catch (err: any) {
      setError(err.message || '取消任务失败');
    }
  }, []);

  // Retry Transfer
  const retryTransfer = useCallback(async (taskId: string) => {
    try {
      const updated = await VideoGenerationService.retryTransfer(taskId);
      setJobs(prev => prev.map(j => (j.id === taskId ? updated : j)));
    } catch (err: any) {
      setError(err.message || '重试转存失败');
    }
  }, []);

  // Playback URL
  const getPlaybackUrl = useCallback(async (assetVersionId: string): Promise<VideoPlaybackInfo> => {
    return VideoGenerationService.getPlaybackUrl(assetVersionId);
  }, []);

  return {
    capabilities,
    defaultModelKey,
    storageInfo,
    jobs,
    directorPlan,
    setDirectorPlan,
    isGeneratingPlan,
    isSubmittingJob,
    error,
    generatePlan,
    submitVideo,
    cancelJob,
    retryTransfer,
    getPlaybackUrl,
    refreshJobs
  };
}
