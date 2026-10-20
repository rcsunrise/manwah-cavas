// src/types/spaceStudio.ts
// MANWAH Space Studio｜贵族空间资产工作台 核心类型与工程规范 V3.0

export type SpaceStudioMode = 'poster' | 'space';

export type SpaceWorkflowStep = 'build' | 'shoot' | 'human' | 'design';

// 1. PRODUCT ASSETS (BUILD)
export type ProductRole =
  | 'sofa_3seat'
  | 'sofa_2seat'
  | 'recliner_1seat'
  | 'lounge_chair'
  | 'coffee_table'
  | 'dining_table'
  | 'dining_chair'
  | 'tv_console'
  | 'side_table'
  | 'decor';

export interface ProductReference {
  id: string;
  type: 'front' | '45_deg' | 'side' | 'back' | 'function_open' | 'detail' | 'material';
  objectKey: string;
  publicUrl?: string;
  verified: boolean;
}

export interface DisaggregatedProductItem {
  id: string;
  name: string;
  sku?: string;
  role: ProductRole;
  priority: 'primary' | 'secondary' | 'decor';
  dimensions: { width: number; depth: number; height: number };
  materials: string[];
  colors: string[];
  adaptiveStyles?: string[];
  surfaceTexture?: string;
  functionCapable?: boolean;
  boundingBox: {
    ymin: number; // 0..100
    xmin: number; // 0..100
    ymax: number; // 0..100
    xmax: number; // 0..100
  };
  cropImageUrl?: string;
  cropBase64?: string;
  sourceMasterImageUrl?: string;
  ensembleId?: string;
  roleTitle?: string;
  lockedRules?: string[];
  dossierSummary?: string;
}

export interface ProductAsset {
  id: string;
  sku?: string;
  name: string;
  role: ProductRole;
  priority: 'primary' | 'secondary' | 'decor';
  identityLock: 'strict' | 'normal' | 'loose';
  dimensions?: { width: number; depth: number; height: number };
  materials?: string[];
  colors?: string[];
  surfaceTexture?: string;
  functionCapable?: boolean;
  referenceImages: ProductReference[];
  structuralFeatures?: Array<{ name: string; description: string }>;
  lockedRules?: string[];
  readoutConfidence?: number;
  dossierSummary?: string;
  dossierGeneratedAt?: string;
  provenance?: 'PROVIDED' | 'AI_ESTIMATED' | 'SOLVER_RESOLVED' | 'DERIVED' | 'MANUAL_CONFIRMED';
  productionTruth?: boolean;
  sourceType?: 'upload' | 'canvas_dna' | 'preset';
  adaptiveStyles?: string[];
  isEnsembleIncluded?: boolean;
  // 多产品识别与来源总图索引 (Multi-Product Disaggregation & Source Master Index)
  sourceMasterImageUrl?: string;
  sourceBoundingBox?: { ymin: number; xmin: number; ymax: number; xmax: number };
  ensembleId?: string;
  ensembleRoleTitle?: string;
  cropImageUrl?: string;
  cropBase64?: string;
  detectedProducts?: DisaggregatedProductItem[];
}

// 2. SPACE PROTOTYPE & PRESET (BUILD)
export interface SpaceZone {
  id: string;
  name: string;
  primaryAxis: 'x' | 'y';
  coveragePercentage: number;
}

export interface SpacePreset {
  id: string;
  code: string; // e.g. N-R01 ~ N-R06
  name: string;
  propertyType: 'penthouse' | 'villa' | 'duplex' | 'flat';
  layoutType: 'horizontal' | 'vertical' | 'split_level' | 'sunken' | 'double_living';
  ceilingHeight?: number;
  zones: SpaceZone[];
  signatureFeatures: string[];
  referenceObjectKeys: string[];
  promptFragments: string[];
}

// 3. STYLE LIBRARY (BUILD)
export type StyleCollectionCategory = '东方住宅' | '欧美住宅' | '国际现代' | string;

export interface StylePreset {
  id: string;
  name: string;
  code: string;
  category: StyleCollectionCategory;
  cityCharacter?: string;
  colorPalette: string[];
  materialSystem: string[];
  lifestyleTags: string[];
  recommendedProductTypes: string[];
  typicalLayout?: string;
  promptFragments: string[];
  negativeRules: string[];
  referenceImages?: string[];
  thumbnailUrl?: string;
}

// 4. PLACEMENT BLUEPRINT (BUILD)
export interface PlacementItem {
  assetId: string;
  assetName: string;
  role: ProductRole;
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  rotationDeg: number;
  scale: number;
  zoneId: string;
}

export interface PlacementBlueprint {
  id: string;
  spacePresetId: string;
  items: PlacementItem[];
  isLocked: boolean;
}

// 5. A00 SCENE MASTER (BUILD)
export interface SceneMaster {
  id: string;
  projectId: string;
  objectKey: string;
  imageUrl?: string;
  isLocked: boolean;
  lockedAt?: string;
  aspectRatio?: ImageAspectRatio;
  dimensions?: { width: number; height: number };
  locks: {
    productIdentity: boolean;
    placement: boolean;
    architecture: boolean;
    style: boolean;
    material: boolean;
    lighting: boolean;
    camera: boolean;
    human: boolean;
  };
  promptSnapshotId: string;
  generationJobId?: string;
}

// 5.5 IMAGE DIMENSION & ASPECT RATIO SPECS
export type ImageAspectRatio =
  | '3:4'
  | '16:9'
  | '1:1'
  | '4:3'
  | '9:16'
  | '2:3'
  | 'Auto'
  | 'Custom'
  | '3:2'
  | '21:9'
  | '4:5'
  | '5:4'
  | '1:4'
  | '1:8'
  | '4:1'
  | '8:1'
  | string;

export interface ImageSizeSpec {
  aspectRatio: string;
  label: string;
  sublabel: string;
  width: number;
  height: number;
  useCase: string;
}

export const IMAGE_ASPECT_SPECS: Record<string, ImageSizeSpec> = {
  '4:3': {
    aspectRatio: '4:3',
    label: '4:3 空间透视',
    sublabel: '2560 × 1920 px',
    width: 2560,
    height: 1920,
    useCase: '建筑室内经典画幅 · 画册标准 · 空间摄影默认'
  },
  '16:9': {
    aspectRatio: '16:9',
    label: '16:9 宽屏全案',
    sublabel: '2560 × 1440 px',
    width: 2560,
    height: 1440,
    useCase: '大平层宽画幅 · 4K 大屏展示'
  },
  '3:4': {
    aspectRatio: '3:4',
    label: '3:4 商业海报',
    sublabel: '2100 × 2800 px',
    width: 2100,
    height: 2800,
    useCase: '电商详情主图 · 商业竖版海报'
  },
  '1:1': {
    aspectRatio: '1:1',
    label: '1:1 经典方图',
    sublabel: '2048 × 2048 px',
    width: 2048,
    height: 2048,
    useCase: '平台方形主图 · 材质精修'
  },
  '9:16': {
    aspectRatio: '9:16',
    label: '9:16 移动竖屏',
    sublabel: '1440 × 2560 px',
    width: 1440,
    height: 2560,
    useCase: '手机全屏短视频封面 · 小红书画报'
  },
  '2:3': {
    aspectRatio: '2:3',
    label: '2:3 高奢画册',
    sublabel: '2000 × 3000 px',
    width: 2000,
    height: 3000,
    useCase: '高奢品牌精装年鉴 · 展会大画幅'
  },
  'Auto': {
    aspectRatio: 'Auto',
    label: 'Auto 自动契合',
    sublabel: '智能适配家具原图',
    width: 2560,
    height: 1920,
    useCase: '智能依据产品比例自动推荐'
  },
  'Custom': {
    aspectRatio: 'Custom',
    label: 'Custom 自定义',
    sublabel: '自定义长宽比',
    width: 2560,
    height: 1440,
    useCase: '按需自由设定输入像素与比例'
  },
  '3:2': {
    aspectRatio: '3:2',
    label: '3:2 全幅单反',
    sublabel: '2400 × 1600 px',
    width: 2400,
    height: 1600,
    useCase: '传统全画幅单反标准构图'
  },
  '21:9': {
    aspectRatio: '21:9',
    label: '21:9 电影宽幅',
    sublabel: '2560 × 1080 px',
    width: 2560,
    height: 1080,
    useCase: '超宽画幅电影级通栏展布'
  },
  '4:5': {
    aspectRatio: '4:5',
    label: '4:5 社交竖幅',
    sublabel: '2000 × 2500 px',
    width: 2000,
    height: 2500,
    useCase: '高端摄影画册与社交媒体竖屏'
  },
  '5:4': {
    aspectRatio: '5:4',
    label: '5:4 胶片大画幅',
    sublabel: '2500 × 2000 px',
    width: 2500,
    height: 2000,
    useCase: '传统 8x10 大画幅胶片质感'
  },
  '1:4': {
    aspectRatio: '1:4',
    label: '1:4 细长立柱',
    sublabel: '800 × 3200 px',
    width: 800,
    height: 3200,
    useCase: '垂直灯箱与展厅立柱导览图'
  },
  '1:8': {
    aspectRatio: '1:8',
    label: '1:8 极窄竖条',
    sublabel: '400 × 3200 px',
    width: 400,
    height: 3200,
    useCase: '商场巨幅垂幅挂幕'
  },
  '4:1': {
    aspectRatio: '4:1',
    label: '4:1 展厅横幅',
    sublabel: '3200 × 800 px',
    width: 3200,
    height: 800,
    useCase: '门店门头与宽屏通栏横幅'
  },
  '8:1': {
    aspectRatio: '8:1',
    label: '8:1 超长全景',
    sublabel: '3200 × 400 px',
    width: 3200,
    height: 400,
    useCase: '全景展示与横向长图卷轴'
  }
};

// 5.6 COMPUTE & RENDER ENGINE CONFIGURATION
export type ComputeModelTier =
  | 'gemini-2.5-flash'
  | 'gemini-3.1-flash-image'
  | 'google/gemini-3-pro-image'
  | 'gemini-nano-banana-2.1-preview'
  | 'openai/gpt-image-2'
  | 'openai/gpt-image-2-c'
  | 'openai/gpt-image-2-all'
  | 'openai/gpt-image-2.5-flare-c'
  | 'openai/gpt-image-2.5-sunburst-c';

export type RenderResolution = '1K' | '2K' | '4K';

export interface RenderDimensionInfo {
  width: number;
  height: number;
  text: string;
}

/**
 * 计算任意画幅比例和指定分辨率(1K/2K/4K)下的实际渲染物理尺寸
 */
export function calculateRenderDimensions(ratioStr: string, resolution: RenderResolution = '2K'): RenderDimensionInfo {
  const is1K = resolution === '1K';
  const is4K = resolution === '4K';

  if (!ratioStr || ratioStr === 'Auto' || ratioStr === '1:1') {
    const dim = is4K ? 4096 : is1K ? 1024 : 2048;
    return { width: dim, height: dim, text: `${dim} × ${dim} px` };
  }

  const parts = String(ratioStr).trim().split(':');
  if (parts.length === 2) {
    const w = parseFloat(parts[0]);
    const h = parseFloat(parts[1]);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      const ratio = w / h;
      // 16:9
      if (Math.abs(ratio - 16 / 9) < 0.05) {
        const width = is4K ? 4096 : is1K ? 1792 : 2560;
        const height = is4K ? 2304 : is1K ? 1024 : 1440;
        return { width, height, text: `${width} × ${height} px` };
      }
      // 9:16
      if (Math.abs(ratio - 9 / 16) < 0.05) {
        const width = is4K ? 2304 : is1K ? 1024 : 1440;
        const height = is4K ? 4096 : is1K ? 1792 : 2560;
        return { width, height, text: `${width} × ${height} px` };
      }
      // 4:3
      if (Math.abs(ratio - 4 / 3) < 0.05) {
        const width = is4K ? 4096 : is1K ? 1472 : 2560;
        const height = is4K ? 3072 : is1K ? 1104 : 1920;
        return { width, height, text: `${width} × ${height} px` };
      }
      // 3:4
      if (Math.abs(ratio - 3 / 4) < 0.05) {
        const width = is4K ? 3072 : is1K ? 1104 : 1536;
        const height = is4K ? 4096 : is1K ? 1472 : 2048;
        return { width, height, text: `${width} × ${height} px` };
      }
      // 3:2
      if (Math.abs(ratio - 1.5) < 0.05) {
        const width = is4K ? 4096 : is1K ? 1536 : 2048;
        const height = is4K ? 2730 : is1K ? 1024 : 1365;
        return { width, height, text: `${width} × ${height} px` };
      }
      // 2:3
      if (Math.abs(ratio - 2 / 3) < 0.05) {
        const width = is4K ? 2730 : is1K ? 1024 : 1365;
        const height = is4K ? 4096 : is1K ? 1536 : 2048;
        return { width, height, text: `${width} × ${height} px` };
      }
      // 21:9
      if (Math.abs(ratio - 21 / 9) < 0.05 || ratio >= 2.0) {
        const width = is4K ? 4096 : is1K ? 1792 : 2560;
        const height = is4K ? 1728 : is1K ? 768 : 1080;
        return { width, height, text: `${width} × ${height} px` };
      }
    }
  }

  const base = is4K ? 4096 : is1K ? 1024 : 2048;
  return { width: base, height: base, text: `${base} × ${base} px` };
}


export type NamingPreset = 'standard' | 'detailed' | 'custom';

export interface RenderComputeConfig {
  model: ComputeModelTier | string;
  resolution: RenderResolution;
  aspectRatio: string;
  customAspectRatio?: string;
  seed?: number;
  namingPreset: NamingPreset;
  customPrefix?: string;
  functionalPositionState?: 'closed' | 'open';
  autoModelFallback?: boolean; // 多模型故障自动轮换开关 (开启时主模型失败自动轮试 Gemini 3.1 ➔ GPT 2.5 ➔ GPT 2)
}

export type UIThemeMode = 'dark' | 'light';

// 6. CAMERA & SHOT INTENT (SHOOT)
export type ShotIntentType =
  | 'SI-01' // Space / Product Balance
  | 'SI-02' // Hero Product Focus
  | 'SI-03' // Product Structure
  | 'SI-04' // Function Focus
  | 'SI-05' // Comfort Experience
  | 'SI-06' // Material Focus
  | 'SI-07' // Detail Focus
  | 'SI-08' // Lifestyle / Family Story
  | 'SI-09'; // Dining Suite / Companion Ensemble

export interface ShotIntentDNA {
  intentCode: ShotIntentType;
  name: string;
  productDominancePct: number; // e.g. 55%~70%
  backgroundSuppression: 'low' | 'medium' | 'high';
  maxOcclusionPct: number;
  description: string;
}

export interface CameraDNA {
  lensMm: number; // 24, 35, 50, 85 etc.
  heightCm: number; // e.g. 125~135 cm
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  target: { type: 'product' | 'zone' | 'detail'; id: string };
  framing: 'wide' | 'product' | 'detail' | 'lifestyle';
  mustInclude: string[];
  mustExclude: string[];
}

export interface ShotTemplate {
  id: string;
  code: string; // A01 ~ A08
  name: string;
  intent: ShotIntentDNA;
  defaultCamera: CameraDNA;
  description: string;
  alignmentSample?: string; // 影棚实拍对齐样张编号，例如 '1021.jpg'、'0647.jpg / 0692.jpg'
  recommendedAspectRatio?: ImageAspectRatio; // 推荐画幅，例如 A02 推荐 '3:4'
  studioCategory?: string; // 影棚核心镜头分类
  workflowRole?: string; // 流程图角色定位，例如 '45mm 竖版/横版核心位'
}

// 7. SHOT INSTANCE & REVISION (SHOOT)
export type ProvenanceLevel =
  | 'PROVIDED'
  | 'AI_ESTIMATED'
  | 'SOLVER_RESOLVED'
  | 'DERIVED'
  | 'MANUAL_CONFIRMED';

export interface MultimodalScoreDetail {
  productIdentity: number;   // 0~100 (皮纹质感、拉扣绗缝、扶手曲线、金属脚五金)
  placement: number;         // 0~100 (家具位置不变性、相对拓扑对齐、绝对禁止平移漂移)
  sceneContinuity: number;   // 0~100 (硬装墙体、窗外光照色温、地板材质一致性)
  shotIntent: number;        // 0~100 (焦距景深、机位仰俯偏角、主体占比与意图)
  overall: number;           // 加权总分
}

export interface MultimodalValidationReport {
  reportId: string;
  shotCode: string;
  revisionId: string;
  pass: boolean;
  gateLevel: 'L0' | 'L1' | 'L2';
  evaluatorModel: string;
  isDecoupledReferee: boolean;
  provenance: ProvenanceLevel;
  productionTruth: boolean;
  score: MultimodalScoreDetail;
  dimensionDetails: {
    productIdentityDetail: string;
    placementDetail: string;
    sceneContinuityDetail: string;
    shotIntentDetail: string;
  };
  reasons: string[];
  evaluatedAt: string;
}

export interface ShotRevision {
  id: string;
  shotId: string;
  revisionNumber: number;
  parentRevisionId?: string;
  objectKey: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  promptSnapshotId: string;
  generationJobId?: string;
  status: 'candidate' | 'current' | 'approved' | 'rejected';
  revisionType?: 'scene' | 'human' | 'custom' | 'variation';
  label?: string;
  metaSummary?: string;
  score?: MultimodalScoreDetail;
  validationReport?: MultimodalValidationReport;
  provenance: ProvenanceLevel;
  productionTruth: boolean;
  createdAt: string;
}

export interface ShotInstance {
  id: string;
  templateCode: string; // e.g. A01, A02 ...
  name: string;
  camera: CameraDNA;
  intent: ShotIntentDNA;
  status: 'draft' | 'generating' | 'needs_review' | 'passed' | 'failed';
  currentRevisionId?: string;
  revisions: ShotRevision[];
  hasHumanPass: boolean;
  aspectRatio?: ImageAspectRatio;
  error?: string; // 记录最近一次生成失败的显式异常原因（网络超时/上游接口异常等）
}

// 8. HUMAN MODEL & PASS (HUMAN)
export interface HumanAsset {
  id: string;
  name: string;
  role: 'father' | 'mother' | 'grandfather' | 'grandmother' | 'boy' | 'girl' | 'individual';
  ageRange?: string;
  heightCm?: number;
  wardrobeTags: string[];
  referenceObjectKeys: string[];
}

export interface PosePreset {
  id: string;
  name: string;
  seatRule: {
    hipsOnSeat: boolean;
    backSupported: boolean;
    legsSupported: boolean;
    requiresFootrest: boolean;
  };
  promptFragment: string;
}

export type FunctionSeatState = 'closed' | 'open' | 'recline';

export type FootrestMechanicalState = 'retracted' | 'elevating' | 'fully_extended' | 'zero_gravity';

export interface FamilyPreset {
  id: string;
  name: string;
  category: 'single' | 'couple' | 'trio_family' | 'multigen_family';
  description: string;
  recommendedHumans: string[]; // humanAssetIds
  defaultAssignments: {
    seatId: string;
    humanAssetId: string;
    poseId: string;
    functionState: FunctionSeatState;
    footrestState: FootrestMechanicalState;
  }[];
}

export interface ErgonomicsCheckIssue {
  type: 'footrest_mismatch' | 'penetration_risk' | 'unsupported_weight' | 'seat_capacity_exceeded' | 'view_occlusion';
  severity: 'warning' | 'error';
  seatId: string;
  humanName: string;
  message: string;
}

export interface HumanErgonomicsReport {
  passed: boolean;
  score: number; // 0~100
  totalHumans: number;
  hipsContactRatio: number;      // 0~1
  backSupportScore: number;      // 0~100
  footrestAlignmentScore: number;// 0~100
  issues: ErgonomicsCheckIssue[];
  evaluatedAt: string;
}

export interface SeatAssignment {
  humanAssetId: string;
  seatId: string; // e.g. sofa_3s.left, sofa_3s.center, sofa_3s.right, armchair_1s.main
  poseId: string;
  functionState: FunctionSeatState;
  footrestState: FootrestMechanicalState;
  headrestAngleDeg?: number;     // 0~35度
  lumbarSupportMm?: number;      // 0~50mm
}

export interface HumanOnlyRevisionMeta {
  parentRevisionId: string;      // 必须指向过审的无人物母版镜头
  baseShotCode: string;          // 例如 A01
  isHumanOnlyPass: true;
  keepFurnitureFixed: true;      // 强制不变量
  assignments: SeatAssignment[];
  ergonomicsReport: HumanErgonomicsReport;
  footrestStates: Record<string, FootrestMechanicalState>;
}

// 9. GENERATION JOB PIPELINE
export type GenerationJobStatus =
  | 'queued'
  | 'compiling'
  | 'generating'
  | 'storing'
  | 'judging'
  | 'completed'
  | 'failed';

export interface GenerationSettings {
  templateId?: string;
  model: string;
  resolution: '1K' | '2K' | '4K';
  aspectRatio: string;
  seed?: number;
  useRandomSeed: boolean;
  functionalPositionState?: 'closed' | 'open';
  autoModelFallback?: boolean;
}

export interface GenerationJob {
  jobId: string;
  phase: SpaceWorkflowStep;
  targetCode: string; // e.g. 'A00', 'A01'...'A08'
  status: GenerationJobStatus;
  provider: string;
  model?: string;
  promptSnapshot?: Record<string, any>;
  settings?: GenerationSettings;
  progress: number; // 0..100
  error?: string;
  resultObjectKey?: string;
  resultImageUrl?: string;
  validationReport?: MultimodalValidationReport;
  createdAt: string;
  finishedAt?: string;
}

// 10. SPACE PROJECT ROOT
export interface SpaceProject {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  currentStep: SpaceWorkflowStep;
  products: ProductAsset[];
  spacePreset?: SpacePreset;
  stylePreset?: StylePreset;
  placementBlueprint: PlacementBlueprint;
  sceneMaster?: SceneMaster;
  shots: ShotInstance[];
  activeShotId?: string;
  jobs?: GenerationJob[];
}
