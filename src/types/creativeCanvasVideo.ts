// src/types/creativeCanvasVideo.ts
/**
 * Creative Canvas Video V1 Types
 */

export type VideoCreationMode =
  | 'product_showcase' // 产品展示 (策划商品运镜与展示动作)
  | 'generate_video'   // 生成视频 (自由控制模型、镜头与声音)
  | 'commerce_video'   // 带货视频 (策划剧情、口播与投放内容)
  | 'viral_replicate'; // 爆款复刻 (参考爆款结构并替换为商品)

export type VideoStyle = 'smart_mix' | 'single_take'; // 智能混剪 | 一镜到底

export type VideoAudioMode = 'none' | 'native';

export type VideoJobStatus =
  | 'queued'
  | 'submitting'
  | 'running'
  | 'transferring'
  | 'ready'
  | 'submission_unknown'
  | 'failed'
  | 'transfer_failed'
  | 'cancel_requested'
  | 'cancelled';

export interface VideoSettings {
  durationSeconds: number; // e.g. 5, 10
  resolution: string;      // '480p' | '720p' | '1080p'
  ratio: string;           // '16:9' | '9:16' | '1:1' | '3:4'
  audioMode: VideoAudioMode;
}

export interface VideoShotPlan {
  shotId: string;
  order: number;
  title: string;
  composition: string;
  cameraMotion: string;
  subjectMotion: string;
  durationSeconds: number;
  prompt: string;
  negativeConstraints?: string[];
  referenceAssetVersionIds?: string[];
  keyframeImageUrl?: string;
  transition?: 'cut' | 'dissolve' | 'fade_black';
}

export interface VideoDirectorPlan {
  planVersionId: string;
  summary: string;
  lockedRules: string[];
  shots: VideoShotPlan[];
  estimatedDurationSeconds: number;
  directorModel: string;
  createdAt: string;
}

export interface VideoCapability {
  key: string;                 // e.g. 'doubao-seedance-1-0-pro-fast'
  displayName: string;         // e.g. 'Seedance 1.0 Pro Fast'
  exactModelId: string;        // Upstream model ID verified from VectorEngine /v1/models
  enabled: boolean;
  tested: boolean;
  modes: ('image_to_video' | 'first_last_frame' | 'multi_reference')[];
  variants: Array<{
    mode: string;
    durationSeconds: number;
    resolution: string;
    ratios: string[];
    maxImages: number;
    audioModes: VideoAudioMode[];
  }>;
  supportsCancel: boolean;
  supportsIdempotency: boolean;
  supportsLookupByClientKey: boolean;
  evidenceUrl: string;
  verifiedAt: string;
}

export interface VideoJob {
  id: string;
  workspaceId: string;
  userId?: string | null;
  canvasId: string;
  planVersionId: string;
  shotId: string;
  attempt: number;
  modelKey: string;
  providerTaskId?: string | null;
  status: VideoJobStatus;
  providerStatus?: string | null;
  idempotencyKey: string;
  requestHash: string;
  sourceAssetVersionId?: string | null;
  sourceImageUrl?: string | null;
  assetVersionId?: string | null;
  posterAssetVersionId?: string | null;
  videoSettings: VideoSettings;
  prompt: string;
  progressPercent?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryable?: boolean;
  createdAt: string;
  updatedAt: string;
  readyAt?: string | null;
}

export interface VideoPlaybackInfo {
  assetVersionId: string;
  playbackUrl: string;
  expiresAt: string;
  storageProvider: 'gcs' | 'local_fallback' | 'none';
  rangeSupported: boolean;
  width?: number;
  height?: number;
  durationMs?: number;
  posterUrl?: string | null;
}

export interface VideoSubmitPayload {
  canvasId: string;
  workspaceId?: string;
  userId?: string;
  sourceNodeId: string;
  sourceAssetVersionId?: string | null;
  sourceImageUrl?: string;
  planVersionId?: string;
  shotId?: string;
  mode: VideoCreationMode;
  style?: VideoStyle;
  modelKey: string;
  inputAssetVersionIds?: string[];
  settings: VideoSettings;
  prompt: string;
  negativePrompt?: string;
}

export interface VideoDirectorBriefRequest {
  canvasId: string;
  workspaceId?: string;
  sourceAssetVersionId?: string | null;
  sourceImageUrl?: string;
  mode: VideoCreationMode;
  style: VideoStyle;
  userPrompt: string;
  focusPoint?: string;
  focusPoints?: string[];
  dnaSummary?: string;
  directorModelKey?: string;
  referenceImages?: Array<{ url: string; title?: string }>;
  productTitle?: string;
  productCategory?: string;
  productDetails?: string;
}
