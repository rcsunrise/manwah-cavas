// src/types/creativeCanvasVideo.ts
/**
 * Creative Canvas Video V1 Types
 */

export type VideoCreationMode =
  | 'product_showcase' // 产品展示 (策划商品运镜与展示动作)
  | 'generate_video'   // 生成视频 (自由控制模型、镜头与声音)
  | 'commerce_video'   // 带货视频 (策划剧情、口播与投放内容)
  | 'viral_replicate'; // 爆款复刻 (参考爆款结构并替换为商品)

export type VideoStyle = 'smart_mix' | 'single_take' | 'outline'; // 智能混剪 | 一镜到底 | 按构思分镜（镜头数、顺序、时长按对话里定的大纲）

/** 对话里定好的分镜大纲：一个镜头一条 */
export interface VideoShotOutline {
  title: string;
  durationSeconds: number;
  camera?: string;
  content: string;
}

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

/** 仍在进行中、需要轮询跟进状态的任务 */
export const ACTIVE_VIDEO_JOB_STATUSES: ReadonlySet<VideoJobStatus> = new Set<VideoJobStatus>([
  'queued',
  'submitting',
  'running',
  'transferring',
  'cancel_requested'
]);

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
  /** 镜头类型：全景亮相 / 功能演示 / 材质细节 / 收尾 */
  shotType?: VideoShotType;
  /** 机位锁定：产品自身在动（功能演示）时镜头必须静止 */
  cameraLocked?: boolean;
  /** 功能动作镜头需要一张“动作完成态”的实拍尾帧，否则模型会凭空想象机构 */
  needsEndFrame?: boolean;
  /** 首帧素材建议（如：用原图裁出控制面板局部） */
  firstFrameHint?: string;
  /** 尾帧素材建议（如：躺平状态的正侧面实拍图） */
  endFrameHint?: string;
  /** 用户为该镜头上传的尾帧图 */
  endFrameImageUrl?: string;
}

export type VideoShotType = 'hero' | 'function' | 'detail' | 'closing';

/** 导演从参考图中识别出的产品事实，提示词中的材质/颜色以此为准 */
export interface VideoProductFacts {
  category: string;
  material: string;
  color: string;
  keyFeatures: string[];
  functions: string[];
  /** 拼在每条英文提示词开头的产品锚定短语（颜色 + 材质 + 品类 + 关键特征） */
  anchorEn?: string;
}

export interface VideoDirectorPlan {
  planVersionId: string;
  summary: string;
  lockedRules: string[];
  shots: VideoShotPlan[];
  estimatedDurationSeconds: number;
  directorModel: string;
  createdAt: string;
  productFacts?: VideoProductFacts;
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
  /** 当前全站令牌是否开通该模型（来自 GET /v1/models 探测；undefined 表示未能探测） */
  available?: boolean;
  availabilityNote?: string;
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
  /** 首尾帧模式下的尾帧图 */
  lastFrameImageUrl?: string | null;
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
  storageProvider: 'gcs' | 'local_fallback' | 'none' | 'direct_stream';
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
  /** 首尾帧模式下的尾帧图（仅支持 first_last_frame 的模型生效） */
  lastFrameImageUrl?: string;
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
  /** 面板所选的单镜头视频时长（秒），方案中每个镜头按此时长生成 */
  targetDurationSeconds?: number;
  /** 面板所选的视频生成模型名称，供导演了解生成端 */
  videoModelName?: string;
  /** 所选视频模型是否支持首尾帧；为 false 时导演不安排依赖尾帧的功能镜头 */
  supportsLastFrame?: boolean;
  /** 按构思分镜：严格按此大纲出镜头（数量、顺序、每镜时长） */
  shotOutline?: VideoShotOutline[];
}
