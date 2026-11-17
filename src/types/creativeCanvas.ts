import { ProductVisualDNA } from '../types';

export type WorkflowStage = 'planning' | 'generation' | 'results';

export interface CanvasNodeUIState {
  collapsed?: boolean;
  expandedWidth?: number;
  expandedHeight?: number;
}

export interface CanvasWorkspaceInfo {
  id: string;
  name: string;
  updatedAt: string;
  status: 'active' | 'archived';
}

export interface LocalAssetItem {
  id: string;
  name: string;
  path: string;
  size: number;
  formattedSize: string;
  type: 'image' | 'document' | 'video' | 'other';
  extension: string;
  lastModified: number;
  previewUrl?: string;
  fileHandle?: any;
  file?: File;
  /** 本机调试模式（服务端按路径读文件夹）：原文件地址，需要时 fetch 成 File */
  serverUrl?: string;
  /** 面料平均色缓存（挑配色时算出） */
  colorHex?: string;
}

export interface LocalAssetSearchCardData {
  query: string;
  matchedCount: number;
  assets: LocalAssetItem[];
}

/** 视频生成完成后回到对话里的成片卡片 */
/** 海报/画面成图：生成或修改完成后回传到对话 */
export interface AgentImageCard {
  imageUrl: string;
  title?: string;
  nodeId?: string;
  sceneIndex?: number;
  withText?: boolean;
  /** 本次是怎么来的：生成底图 / 生成带字海报 / 改字 / 按要求修改 */
  source?: 'clean' | 'poster' | 'text_edit' | 'instruction_edit';
  detail?: string;
}

export interface AgentStitchClip {
  id: string;
  /** 镜头序号（shot-N 的 N），0 表示不是分镜任务 */
  n: number;
  url: string;
  assetVersionId?: string;
  prompt: string;
  createdAt?: string;
}

export interface AgentStitchPicker {
  clips: AgentStitchClip[];
  transition?: 'cut' | 'fade';
}

export interface AgentVideoCard {
  jobId: string;
  videoUrl: string;
  title?: string;
  posterUrl?: string;
  modelKey?: string;
  durationSeconds?: number;
  resolution?: string;
  nodeId?: string;
}

export interface AgentMessage {
  id: string;
  sender: 'agent' | 'user';
  text: string;
  timestamp: string;
  status?: 'pending' | 'streaming' | 'completed' | 'failed';
  error_code?: string;
  conversation_id?: string;
  localAssetCard?: LocalAssetSearchCardData;
  posterDraftCard?: {
    nodeId: string;
    screenTitle: string;
    aspectRatio: string;
    dimensions: string;
    imageUrl: string;
    layersCount: number;
    reviewStatus: 'pendingReview' | 'approved' | 'rejected';
    textLayers?: CanvasTextLayer[];
  };
  /** 追问卡：执行前缺信息时先问用户 */
  clarifyCard?: AgentClarifyCard;
  /** 计划卡：花钱/耗时的操作先给方案，用户确认后才执行 */
  planCard?: AgentPlanCard;
  /** 任务卡：执行中的任务状态 */
  taskCard?: AgentTaskCard;
  /** 下一步可做：可直接点击的后续动作 */
  suggestions?: AgentSuggestion[];
  /** 视频成片：任务完成后回传到对话 */
  videoCard?: AgentVideoCard;
  /** 拼接选片卡：列出已生成的镜头，勾选并排序后拼接下载（仅当前会话内存里有） */
  stitchPicker?: AgentStitchPicker;
  /** 海报/画面成图 */
  imageCard?: AgentImageCard;
  /** 用户随消息发送的图片 */
  images?: string[];
  /** 实际作答的模型（可能因不可用而与所选模型不同） */
  model?: string;
  /** 会话所选的模型 */
  requestedModel?: string;
}

/** 对话中可触发的画布动作（第一期由前端分派，第二期由后端工具调用产生） */
export type AgentActionId =
  | 'upload_product'
  | 'generate_plan'
  | 'render_all'
  | 'search_market'
  | 'open_video'
  | 'video_submit_all'
  | 'group_lock'
  | 'open_poster'
  /** 模板海报（原型）：命名构思 → 主场景 → 细节裁切 + 排版 */
  | 'template_poster'
  | 'goto_setup'
  | 'goto_render'
  | 'replan_screen'
  | 'render_screen'
  | 'edit_image_text'
  | 'set_product_image'
  | 'edit_image'
  /** 把画布上各分镜视频按顺序拼成一条成片 */
  | 'stitch_video'
  /** 沙发面料海报（模板 B）：白底沙发 + 抱枕 + 氛围照拼贴 + 圆形细节与面料色卡 */
  | 'fabric_poster'
  /** 修改已生成的面料海报：换抱枕/氛围图、改型号与编号、调抱枕大小、换版式（复用已有素材，只重出改动的那几张） */
  | 'fabric_edit'
  /** 面料色卡海报（模板 C）：从本地面料素材里选一款做主色，其余配色做色卡，三种版式 */
  | 'textile_poster'
  /** 修改已生成的面料色卡海报：换版式、改名称/说明/型号、换底色、换主面料、增减色卡（不出图不扣点；氛围图 AI 重出才扣点） */
  | 'textile_edit';

/** 动作参数：由智能体在对话中给出（如“扩到 8 屏”“重做第 3 屏”） */
export interface AgentActionParams {
  /** 面料色卡海报：版式（slant 斜切 / hex 六边形 / circle 圆形） */
  textileLayout?: 'slant' | 'hex' | 'circle';
  /** 氛围图拼贴摆法变体（0 起；换一种组合 +1，只重新排版不扣点） */
  textileMoodVariant?: number;
  /** 重出氛围图时要求换人物/场景/机位 */
  textileMoodVariation?: boolean;
  /** 氛围图风格：cutout 人物抠图加白边压在拼贴上；collage 普通拼贴 */
  textileMoodStyle?: 'collage' | 'cutout';
  /** cutout 时用 AI 新出一张白底全身人物再抠（约 3000 点）；不填则从现有氛围图里抠 */
  textileCutoutAi?: boolean;
  /** 主面料：本地素材里的文件名或其中的关键字（如 DSC_8837）；不填用对话里选中的那一张 */
  textileMain?: string;
  /** 按颜色选主面料（如“绿色”“藏青”）；textileMain 没给时用 */
  textileMainColor?: string;
  /** 指定配色面料（文件名或关键字）；不填则按主色自动挑选配色 */
  textileSwatches?: string[];
  /** 色卡总数（含主面料），2~6 */
  textileSwatchCount?: number;
  textileName?: string;
  textileDesc?: string;
  /** 型号；空字符串表示不显示 */
  textileCode?: string;
  /** 海报底色 #RRGGBB */
  textileBg?: string;
  /** 让 AI 生成几张氛围图（每张扣点）；生成时不填默认 3 张，0 表示不生成（左侧用面料特写） */
  textileMoods?: number;
  /** 用户在对话里发的图当氛围图（给了就不再 AI 生成），最多 4 张 */
  textileMoodUrls?: string[];
  /** 面料海报：版式（collage4 参考图 1：4 张氛围照；hero3 参考图 2：1 大 + 2 小）、左上角型号、色卡编号 */
  fabricLayout?: 'collage4' | 'hero3';
  /** 修改面料海报：新的抱枕图案描述 / 不要抱枕 / 抱枕大小倍数（1 为基准，默认 1.25）/ 要换的氛围图（slot 为当前版式里从左到右、从上到下的第几格，1 起） */
  fabricPillow?: string;
  fabricNoPillow?: boolean;
  fabricPillowScale?: number;
  fabricMoods?: Array<{ slot: number; prompt: string }>;
  fabricCode?: string;
  fabricLabel?: string;
  /** 拼接成片：镜头之间的转场（cut 硬切 / fade 淡入淡出） */
  stitchTransition?: 'cut' | 'fade';
  /** 修改画面：对话里提的修改要求（换背景、调光线等） */
  instruction?: string;
  /** 设为产品主图：对话里用户发的图片地址 */
  imageUrl?: string;
  screenCount?: number;
  aspectRatio?: string;
  screenIndex?: number;
  hint?: string;
  keywords?: string;
  /** 修改图中文字：要改成的文字 / 被替换的原文 / 目标图片节点 */
  newText?: string;
  oldText?: string;
  /** edit_image_text 一次改多行：每项一行，逐行依次修改 */
  textEdits?: Array<{ oldText?: string; newText: string }>;
  nodeId?: string;
  /** 打开视频创作：对话中商定的视频创意要求（填入面板的创意描述，交给 AI 导演） */
  videoBrief?: string;
  /** 打开视频创作：要展示的重点 */
  focusPoints?: string[];
  /** 打开视频创作：AI 导演分镜（默认）或直接生成单条视频 */
  videoMode?: 'product_showcase' | 'generate_video';
  /** AI 导演运镜：smart_mix=多镜头混剪（按创意分段），single_take=一镜到底 */
  videoStyle?: 'smart_mix' | 'single_take' | 'outline';
  /** 视频分镜大纲：每个镜头的标题、时长、运镜与画面内容 */
  videoShots?: { title: string; durationSeconds: number; camera?: string; content: string }[];
  /** 视频画面比例，如 16:9 / 9:16 / 1:1 / 4:3 / 3:4 */
  videoRatio?: string;
  /** 参考图（对话里用户发的图片地址）：视频参考图（不填时用画布产品主图）；4/3 产品海报的场景参考（主场景按它出图，版式仍按 4/3） */
  referenceImageUrl?: string;
}

export interface AgentActionOption {
  label: string;
  actionId?: AgentActionId;
  params?: AgentActionParams;
  /** 不对应动作时，点击后作为一条用户消息发出 */
  prompt?: string;
}

export interface AgentClarifyCard {
  question: string;
  options: AgentActionOption[];
  answered?: string;
}

export interface AgentPlanCard {
  title: string;
  items: Array<{ label: string; value: string }>;
  actionId: AgentActionId;
  params?: AgentActionParams;
  status: 'pending' | 'confirmed' | 'cancelled';
}

export interface AgentTaskCard {
  title: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  detail?: string;
  /** 完成后可在画布上定位的结果节点 */
  locate?: AgentLocateTarget;
  /** 结果图（在对话里直接展示） */
  resultImageUrl?: string;
  /** 生成耗时统计（毫秒时间戳），见 src/utils/taskTiming.ts */
  startedAt?: number;
  stepStartedAt?: number;
  finishedAt?: number;
  /** 各步骤耗时 */
  steps?: { label: string; ms: number }[];
}

/** 画布定位目标：优先按节点 id，其次按节点类型 + 屏号查找 */
export interface AgentLocateTarget {
  nodeId?: string;
  nodeType?: string;
  screenIndex?: number;
}

export type AgentSuggestion = AgentActionOption;

export interface WelcomeNodeData extends Record<string, unknown> {
  title: string;
  description: string;
  status: string;
}

export interface ProductImageNodeData extends Record<string, unknown> {
  imageUrl?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: string;
  uploadedAt?: string;
  dimensions?: { width: number; height: number };
  status?: 'idle' | 'uploading' | 'analyzing' | 'completed' | 'error';
  errorMsg?: string;
  onReanalyze?: () => void;
  onUpload?: (file: File) => void;
  onRemove?: () => void;
  /** 用这张产品图生成模板 A 海报（多张产品图可各自同时生成） */
  onTemplatePoster?: () => void;
  templatePosterRunning?: boolean;
  /** 用这张沙发图生成沙发面料海报（模板 B） */
  onFabricPoster?: () => void;
  fabricPosterRunning?: boolean;
}

export interface ProductDnaNodeData extends Record<string, unknown> {
  dna?: ProductVisualDNA | null;
  status: 'analyzing' | 'completed' | 'error';
  errorMsg?: string;
  analyzedAt?: string;
  productDnaId?: string;
  dnaCode?: string;
  productDnaVersionId?: string;
  versionCode?: string;
  versions?: Array<{ id: string; version_code: string; version_number: number; created_at?: string }>;
  onViewFullDna?: () => void;
  onSelectDnaVersion?: (versionId: string) => void;
}

export interface SceneQueueItem {
  sceneId: string;
  sceneNumber: number;
  status: 'pending' | 'queued' | 'generating' | 'success' | 'failed' | 'paused' | 'cancelled';
  taskId?: string;
  requestId?: string;
  attempt: number;
  error?: {
    code?: string;
    httpStatus?: number;
    message: string;
  };
}

export interface GenerationBatch {
  batchId: string;
  sceneIds: string[];
  status: 'idle' | 'running' | 'paused' | 'completed' | 'partial_failed' | 'cancelled';
  total: number;
  pending: number;
  running: number;
  success: number;
  failed: number;
  cancelled: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface NineGridPlanNodeData extends Record<string, unknown> {
  runId: string;
  themeTitle: string;
  targetAudience: string;
  overallStyle: string;
  coreCreative: string;
  colorDirection: string;
  sceneDirection: string;
  screenCount: number;
  status: 'planning' | 'completed' | 'error';
  errorMsg?: string;
  generatedAt: string;
  onViewFullPlan?: () => void;
  onRegenerateAll?: () => void;
  onGenerateMissingImages?: (withText?: boolean) => void;
  onGeneratePosterImages?: () => void;
  batchProgress?: {
    completed: number;
    total: number;
    status: 'idle' | 'running' | 'paused' | 'completed' | 'partial_failed' | 'cancelled';
  };
}

export interface ScenePlanNodeData extends Record<string, unknown> {
  runId: string;
  screenIndex: number;
  screenTitle: string;
  coreSellingPoint: string;
  sceneDescription: string;
  visualComposition: string;
  lightingAndAtmosphere: string;
  productFocus: string;
  copySuggestion: string;
  promptSuggestion: string;
  aspectRatio: string;
  status: 'planning' | 'completed' | 'error';
  errorMsg?: string;
  assetSkuId?: string;
  assetSkuCode?: string;
  assetVersionId?: string;
  assetVersionCode?: string;
  parentVersionId?: string | null;
  productDnaVersionId?: string;
  productDnaVersionCode?: string;
  onViewDetail?: () => void;
  onReplanScene?: () => void;
  onGenerateImage?: () => void;
  onGeneratePoster?: () => void;
}

export interface ImageGenerationNodeData extends Record<string, unknown> {
  sceneIndex: number;
  screenTitle: string;
  model?: string;
  provider?: string;
  aspectRatio?: string;
  referenceCount?: number;
  status: 'queued' | 'preparing' | 'generating' | 'completed' | 'error' | 'cancelled';
  startTime?: string;
  taskId?: string;
  errorMsg?: string;
  onCancel?: () => void;
}

export interface CanvasTextLayer {
  id: string;
  text: string;
  x: number; // original source image pixels
  y: number; // original source image pixels
  width: number; // original source image pixels
  height: number; // original source image pixels
  fontSize: number; // original source image pixels
  fontWeight?: string | number;
  fontFamily?: string;
  color?: string;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: 'left' | 'center' | 'right';
  rotation?: number;
  confidence?: number;
}

export interface GeneratedImageNodeVersion {
  versionId: string;
  versionCode: string; // e.g. "V001", "V002"
  imageUrl: string;
  rawImageUrl?: string;
  cleanBackgroundUrl?: string;
  textLayers?: CanvasTextLayer[];
  sourceWidth?: number;
  sourceHeight?: number;
  generatedAt?: string;
  note?: string;
}

export interface GeneratedImageNodeData extends Record<string, unknown> {
  sceneIndex: number;
  screenTitle: string;
  imageUrl: string;
  rawImageUrl?: string;
  cleanBackgroundUrl?: string;
  textLayers?: CanvasTextLayer[];
  withText?: boolean;
  versionHistory?: GeneratedImageNodeVersion[];
  activeVersionCode?: string;
  dimensions?: string;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceAspectRatio?: string;
  checksum?: string;
  aspectRatio?: string;
  model?: string;
  provider?: string;
  generatedAt?: string;
  version?: number;
  assetSkuId?: string;
  assetSkuCode?: string;
  assetVersionId?: string;
  assetVersionCode?: string;
  parentVersionId?: string | null;
  productDnaVersionId?: string;
  productDnaVersionCode?: string;
  reviewStatus: 'pendingReview' | 'approved' | 'rejected';
  reviewFeedback?: string;
  prompt: string;
  negativePrompt?: string;
  onViewDetail?: () => void;
  onRegenerate?: () => void;
  onGeneratePoster?: () => void;
  onApprove?: () => void;
  onReject?: (feedback: string) => void;
  onOpenAssetVersions?: () => void;
}

export type CreativeCanvasNodeType =
  | 'welcome'
  | 'productImage'
  | 'productDna'
  | 'nineGridPlan'
  | 'scenePlan'
  | 'imageGeneration'
  | 'generatedImage'
  | 'welcomeNode'
  | 'productImageNode'
  | 'productDnaNode'
  | 'nineGridPlanNode'
  | 'scenePlanNode'
  | 'imageGenerationNode'
  | 'generatedImageNode';

export type SaveStatus = 
  | 'saving' 
  | 'saved' 
  | 'error' 
  | 'unsynced' 
  | 'cloud_saved' 
  | 'cloud_loading'
  | 'local_saved' 
  | 'memory_only' 
  | 'save_failed' 
  | 'restore_failed'
  | 'version_conflict'
  | 'offline_pending'
  | 'syncing_assets';

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface SerializableNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: Record<string, any>;
}

export interface SerializableEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  animated?: boolean;
  style?: Record<string, any>;
}

export interface CanvasRecord {
  id?: string;
  canvasId?: string;
  projectId?: string;
  project_id?: string;
  canvasName?: string;
  canvas_name?: string;
  canvasStatus?: 'draft' | 'active' | 'archived';
  nodesDraft?: SerializableNode[];
  nodes_draft?: SerializableNode[];
  edgesDraft?: SerializableEdge[];
  edges_draft?: SerializableEdge[];
  viewportDraft?: ViewportState;
  viewport_draft?: ViewportState;
  currentRevision?: number;
  current_revision?: number;
  layoutVersion?: number;
  layout_version?: number;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  lastSavedAt?: string;
  last_saved_at?: string;
  createdBy?: string;
  created_by?: string;
}

export interface CanvasRevisionRecord {
  id?: string;
  revisionId?: string;
  canvasId?: string;
  canvas_id?: string;
  revisionNumber?: number;
  revision_number?: number;
  versionName?: string;
  version_name?: string;
  changeSummary?: string;
  change_summary?: string;
  versionTag?: string;
  version_tag?: string;
  nodesSnapshot?: SerializableNode[];
  nodes_snapshot?: SerializableNode[];
  edgesSnapshot?: SerializableEdge[];
  edges_snapshot?: SerializableEdge[];
  viewportSnapshot?: ViewportState;
  viewport_snapshot?: ViewportState;
  createdAt?: string;
  created_at?: string;
  createdBy?: string;
  created_by?: string;
}

export interface StructuredCopyContent {
  eyebrow: string;
  headline: string;
  subheadline: string;
  body: string;
  sellingPoints: string[];
  featureLabels: string[];
  specs: Array<{ label: string; value: string }>;
  cta: string;
  disclaimer: string;
}

export interface CopySkuRecord {
  id: string;
  user_id?: string;
  project_id: string;
  canvas_id: string;
  scene_key: string;
  sku_code: string;
  name: string;
  status: 'active' | 'archived';
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CopyVersionRecord {
  id: string;
  copy_sku_id: string;
  version_number: number;
  version_code: string;
  parent_version_id: string | null;
  source_type: 'ai_generated' | 'manual_edit';
  product_dna_version_id?: string | null;
  asset_version_id?: string | null;
  content_json: StructuredCopyContent;
  content_hash?: string | null;
  contentHash?: string | null;
  generation_provider?: string | null;
  generation_model?: string | null;
  prompt_snapshot?: string | null;
  status: 'active' | 'archived';
  created_by?: string;
  created_at: string;
  isCurrent?: boolean;
}

// C4B-3: Typography Spec Data Types
export type TypographySemanticRole =
  | 'eyebrow'
  | 'headline'
  | 'subheadline'
  | 'body'
  | 'selling_point'
  | 'feature_label'
  | 'spec'
  | 'cta'
  | 'disclaimer';

export type TypographyOverflowPolicy =
  | 'truncate'
  | 'shrink'
  | 'hide_low_priority'
  | 'manual_review';

export interface TypographySlotSpec {
  slotKey: string;
  semanticRole: TypographySemanticRole;
  sourceField: string;
  content: string;
  enabled: boolean;
  priority: number; // 1 = highest priority
  maxCharacters: number;
  maxLines: number;
  overflowPolicy: TypographyOverflowPolicy;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  containerStyle?: {
    backgroundColor?: string;
    borderRadius?: number;
    padding?: number;
    border?: string;
    boxShadow?: string;
  };
}

export interface TypographySpecV1 {
  id: string;
  userId?: string;
  user_id?: string;
  projectId: string;
  project_id?: string;
  canvasId: string;
  canvas_id?: string;
  sceneKey: string;
  scene_key?: string;
  copySkuId: string;
  copy_sku_id?: string;
  copyVersionId: string;
  copy_version_id?: string;
  productDnaVersionId?: string | null;
  product_dna_version_id?: string | null;
  assetVersionId?: string | null;
  asset_version_id?: string | null;
  slots: TypographySlotSpec[];
  status: 'valid' | 'overflow_warning' | 'manual_review' | 'archived';
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

// ==============================================================================
// G0-1: Agent Continuous Dialogue & Conversation Persistence Types
// ==============================================================================
export interface AgentContextSnapshot {
  projectId: string;
  canvasId: string;
  activeSceneKey?: string;
  selectedNodeIds?: string[];
  productDnaVersionId?: string | null;
  assetVersionId?: string | null;
  copyVersionId?: string | null;
  typographySpecId?: string | null;
  /** 画布状态摘要（DNA、企划分镜、引用素材等），供智能体判断能做什么 */
  canvasSummary?: string;
  /** 画布上已生成的视频（最新在前），用户问视频效果时服务端据此抽帧给模型看 */
  videoNodes?: AgentVideoNodeRef[];
}

export interface AgentVideoNodeRef {
  nodeId: string;
  jobId?: string;
  title?: string;
  videoUrl?: string;
  assetVersionId?: string;
  prompt?: string;
  modelKey?: string;
  durationSeconds?: number;
  resolution?: string;
}

export interface AgentConversationRecord {
  id: string;
  user_id: string;
  project_id: string;
  canvas_id: string;
  title: string | null;
  status: 'active' | 'archived';
  provider: string;
  model: string;
  provider_conversation_id?: string | null;
  previous_response_id?: string | null;
  created_at: string;
  updated_at: string;
  /** 列表接口附带：会话里的消息条数 */
  message_count?: number;
  /** 列表接口附带：默认标题的会话用第一条消息作显示标题 */
  display_title?: string;
}

export interface AgentChatMessageRecord {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: {
    text: string;
    [key: string]: any;
  };
  status: 'pending' | 'streaming' | 'completed' | 'failed';
  provider_response_id?: string | null;
  parent_message_id?: string | null;
  context_snapshot?: AgentContextSnapshot | null;
  error_code?: string | null;
  created_at: string;
  updated_at: string;
}

export type AgentErrorCode =
  | 'AGENT_AUTH_ERROR'
  | 'CONVERSATION_NOT_FOUND'
  | 'CONVERSATION_FORBIDDEN'
  | 'CANVAS_FORBIDDEN'
  | 'INVALID_AGENT_CONTEXT'
  | 'MESSAGE_TOO_LONG'
  | 'PROVIDER_CONFIGURATION_ERROR'
  | 'PROVIDER_AUTH_ERROR'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_PROTOCOL_ERROR'
  | 'STREAM_INTERRUPTED'
  | 'MESSAGE_PERSISTENCE_ERROR'
  | 'CANVAS_PERSISTENCE_UNAVAILABLE'
  | 'API_ROUTE_NOT_FOUND'
  | 'AGENT_API_NON_JSON_RESPONSE'
  | 'UNKNOWN_AGENT_ERROR';


