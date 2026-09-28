// src/hooks/useCanvasVideo.ts
import { useState, useEffect, useCallback } from 'react';
import {
  VideoCapability,
  VideoDirectorPlan,
  VideoJob,
  VideoPlaybackInfo,
  VideoCreationMode,
  VideoStyle,
  VideoSettings
} from '../types/creativeCanvasVideo';
import { VideoGenerationService } from '../services/videoGenerationService';

export function useCanvasVideo(canvasId: string) {
  const [capabilities, setCapabilities] = useState<VideoCapability[]>([]);
  const [defaultModelKey, setDefaultModelKey] = useState<string>('sd-2.0-fast');
  const [storageInfo, setStorageInfo] = useState<{ provider: string; bucket: string | null } | null>(null);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [directorPlan, setDirectorPlan] = useState<VideoDirectorPlan | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isSubmittingJob, setIsSubmittingJob] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load capabilities & existing jobs
  useEffect(() => {
    if (!canvasId) return;

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

    // Active Jobs fallback polling (in case SSE disconnected or backgrounded)
    const pollInterval = setInterval(() => {
      setJobs(currentJobs => {
        const hasActive = currentJobs.some(j => j.status === 'running' || j.status === 'transferring');
        if (hasActive) {
          VideoGenerationService.fetchCanvasJobs(canvasId).then(newJobs => {
            setJobs(newJobs);
          }).catch(() => {});
        }
        return currentJobs;
      });
    }, 3000);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, [canvasId]);

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
      planVersionId?: string;
      shotId?: string;
      mode: VideoCreationMode;
      style?: VideoStyle;
      modelKey: string;
      settings: VideoSettings;
      prompt: string;
      inputAssetVersionIds?: string[];
    }) => {
      setIsSubmittingJob(true);
      setError(null);
      try {
        const { job } = await VideoGenerationService.submitGeneration({
          canvasId,
          ...params
        });
        setJobs(prev => [job, ...prev.filter(j => j.id !== job.id)]);
        return job;
      } catch (err: any) {
        setError(err.message || '提交视频生成失败');
        throw err;
      } finally {
        setIsSubmittingJob(false);
      }
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
