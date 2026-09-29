// src/types/spaceAssetLibrary.ts
// MANWAH Space Studio｜统一视觉资产库类型定义与协议 V3.5

export type SpaceAssetType = 'scene_style' | 'material' | 'model' | 'pose' | 'prop';

export interface BaseSpaceAsset {
  id: string;
  type: SpaceAssetType;
  name: string;
  code?: string;
  description?: string;
  tags: string[];
  coverImage?: string;
  thumbnail?: string; // 便捷别名
  isSystem: boolean;  // 系统资产 / 用户自建资产
  isFavorite?: boolean;
  favorite?: boolean; // 便捷别名
  refCount?: number;
  author?: string;
  createdAt: string;
  updatedAt: string;
}

// 1. 场景风格资产 (SceneStyleAsset)
export interface SceneStyleAsset extends BaseSpaceAsset {
  type: 'scene_style';
  category: '现代极简' | '意式轻奢' | '法式复古' | '奶油原木' | '东方禅意' | '暗调先锋' | string;
  colorPalette?: string[];
  materialSystem?: string[];
  lifestyleTags?: string[];
  referenceImages: string[]; // 多张参考图
  promptFragment: string;
  promptFragments?: string[];
  negativeRules?: string[];
  lightingPreset?: string;
  lightingTone?: string;
}

// 2. 材质资产 (MaterialAsset)
export interface MaterialAsset extends BaseSpaceAsset {
  type: 'material';
  category: '皮革' | '布艺' | '木质' | '金属' | '石材' | '玻璃' | string;
  materialType: string; // e.g. 半苯胺头层牛皮
  colorName: string;    // e.g. 云雾暖灰
  textureDescription: string;
  referenceImages: string[];
  promptFragment: string;
  specularGloss?: 'matte' | 'satin' | 'glossy';
}

// 3. 模特资产 (ModelAsset) - 固定家庭角色资产与 Model DNA
export type FamilyRoleType = 
  | 'father'        // 家庭男主人
  | 'mother'        // 家庭女主人
  | 'grandfather'   // 爷爷
  | 'grandmother'   // 奶奶
  | 'daughter'      // 混血女儿
  | 'son'           // 混血男孩
  | 'couple'        // 夫妻组合
  | 'family';       // 全家福

export interface ModelMultiViews {
  front?: string;           // 正面 full body
  frontFullBody?: string;
  side?: string;            // 侧面 full body
  sideFullBody?: string;
  back?: string;            // 背面 full body
  backFullBody?: string;
  portrait?: string;        // 头像特写
  portraitCloseUp?: string;
  angle45?: string;         // 45度
  threeQuarter?: string;    // 45度别名
  fullBody?: string;        // 全身
  wardrobeRef?: string;     // 服装参考
  outfitRef?: string;       // 服装参考别名
  accessoryRef?: string;    // 配饰参考
}

export interface ModelDnaData {
  identitySeed?: number;
  roleType?: FamilyRoleType;
  gender: 'female' | 'male' | 'couple' | 'family' | 'elder' | 'child';
  ageRange?: string;
  ageGroup?: string;
  ethnicity?: '东亚' | '欧美' | '欧亚混血' | '泛亚' | string;
  height?: string;
  heightCm?: number;
  bodyBuild?: string;
  positioning?: string;           // 人物定位
  temperamentKeywords?: string[]; // 气质关键词
  bio?: string;                   // 人物简介
  appearanceDesc?: string;        // 外貌描述
  appearanceSummary?: string;     // 别名
  facialFeatures?: string;        // 五官特征
  hairDesc?: string;              // 发型描述
  hairStyle?: string;
  hairStyleAndColor?: string;
  clothingDesc?: string;          // 服装描述
  wardrobeStyle?: string;
  outfitStyle?: string;
  materialsColorsDesc?: string;   // 材质与色系描述
  identityDesc?: string;          // 家庭身份描述
  behaviorTags?: string[];        // 行为偏好标签
  sceneTags?: string[];           // 适配场景标签
  poseTags?: string[];            // 可用姿态标签
  negativeConstraints?: string[]; // 负面约束 (不能乱变脸、不能年龄漂移、不能换错误服装风格)
  skinTone?: string;
  features?: string[];
}

export interface ModelAsset extends BaseSpaceAsset {
  type: 'model';
  code: string;
  nameZh: string;                 // 中文名称
  nameEn: string;                 // 英文名称
  roleType: FamilyRoleType;       // 角色类型 (father / mother / grandfather / grandmother / daughter / son)
  gender: 'female' | 'male' | 'couple' | 'family';
  ageGroup: string;               // 年龄段
  height: string;                 // 身高
  positioning: string;            // 人物定位
  temperamentKeywords: string[];  // 气质关键词
  bio: string;                    // 人物简介
  
  // 形象参考
  views: ModelMultiViews;
  multiViews: ModelMultiViews;
  expressionRefs: string[];       // 表情参考 (至少2~3张)
  wardrobeRefs: string[];         // 服装参考
  accessoryRefs: string[];        // 配饰参考
  detailRefs: string[];           // 细节图 (面料/发饰/鞋子/饰品等)
  lifestyleRefs: string[];        // 生活场景图 (阅读/陪伴/喝茶/平板/家庭互动 等)
  
  // Prompt / DNA
  modelDna: ModelDnaData;
  promptFragment?: string;
  negativeConstraints?: string[];
}

// 4. 人物场景模板库 (FamilySceneTemplate)
export interface RolePositionRule {
  role: FamilyRoleType;
  roleName: string;
  position: string;               // 空间就座/站立位置
  action: string;                 // 动作与姿态
  interaction?: string;          // 与其他角色的互动关系
  referencePoseTag?: string;
}

export interface FamilySceneTemplate {
  templateId: string;
  templateType: '贵族尊享' | '商企精英' | '现代大宅' | string;
  templateName: string;
  sceneCategory: '大平层客厅' | '轻奢餐厅' | '高端会客厅' | '露台庭院' | string;
  cameraLens: string;             // 使用镜头 (e.g. 35mm 广角全景 / 50mm 标准 / 85mm 浅景深)
  spaceType: string;              // 适用空间
  characterCount: number;         // 人物数量 (4人 / 6人)
  roleBindings: FamilyRoleType[]; // 角色绑定
  characterPositionRules: RolePositionRule[]; // 人物位置规则
  characterActionRules: string;   // 人物动作规则
  sceneDesc: string;              // 场景描述
  furnitureDesc: string;          // 家具描述
  lightingDesc: string;           // 光线描述
  propsDesc: string;              // 道具描述
  atmosphereDesc: string;         // 高级氛围描述
  styleDesc: string;              // 输出风格描述
  negativeConstraints: string[];  // 负面约束
  disallowExtraCharacters: boolean; // 是否禁止新增人物
  forceLockPositionMap: boolean;  // 是否强制按位置图锁定
  
  // 双窗口参考
  window1SceneRef: {
    title: string;
    imageUrl: string;
    description: string;
  };
  window2WireframeRef: {
    title: string;
    imageUrl: string;
    description: string;
    positionMapUrl?: string;
  };
  
  coverImage: string;
  thumbnail: string;
  tags: string[];
  isSystem?: boolean;
  isFavorite?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// 4. 人物编排器 (Human Layout) 核心规范
export interface HumanSlotAssignment {
  id: string;
  modelId?: string;          // 绑定的 ModelAsset id
  modelName?: string;        // 模特显示名称
  positionDesc: string;      // 空间位置描述，例如：主沙发一号电动功能位
  actionDesc: string;        // 姿态动作描述，例如：舒展半躺，手持杂志
}

export interface HumanLayoutConfig {
  characterCount: number;           // 人数 (4 / 6 / 自定义)
  mode: '4' | '6' | 'custom';
  disallowExtraCharacters: boolean; // 禁止新增额外人物
  slots: HumanSlotAssignment[];
}

export const DEFAULT_4_HUMAN_SLOTS: HumanSlotAssignment[] = [
  {
    id: 'slot-1',
    positionDesc: '主沙发一号电动功能位（展开脚托）',
    actionDesc: '从容就座，左手搭扶手，右手握持画册与家人交谈'
  },
  {
    id: 'slot-2',
    positionDesc: '沙发贵妃榻休闲位',
    actionDesc: '优雅侧倚，手捧暖白瓷杯，身体微倾倾听'
  },
  {
    id: 'slot-3',
    positionDesc: '紧贴贵妃位内侧软垫',
    actionDesc: '依偎在身旁，双手翻阅立体画册，神情纯真专注'
  },
  {
    id: 'slot-4',
    positionDesc: '沙发前羊毛地毯，倚靠茶几边缘',
    actionDesc: '席地而坐，操作平板电脑，姿态轻松机敏'
  }
];

export const DEFAULT_6_HUMAN_SLOTS: HumanSlotAssignment[] = [
  {
    id: 'slot-1',
    positionDesc: '主沙发一号电动功能主座',
    actionDesc: '45°半躺于头等舱展开脚托，目光沉稳温和'
  },
  {
    id: 'slot-2',
    positionDesc: '单人真皮功能单椅',
    actionDesc: '端坐品茗，神态安详从容，展现长者风范'
  },
  {
    id: 'slot-3',
    positionDesc: '沙发贵妃榻休闲位',
    actionDesc: '优雅侧倚浅笑，身姿端庄知性'
  },
  {
    id: 'slot-4',
    positionDesc: '单椅身侧沙发位',
    actionDesc: '慈爱注视家人，双手温和交叠，雍容祥和'
  },
  {
    id: 'slot-5',
    positionDesc: '贵妃位身侧依偎处',
    actionDesc: '依偎在母亲怀侧，天真翻书，甜美灵动'
  },
  {
    id: 'slot-6',
    positionDesc: '茶几旁厚绒地毯上',
    actionDesc: '盘腿席地玩耍探索，神情专注好奇'
  }
];

// 5. 姿态资产 (PoseAsset)
export type PoseCategory =
  | 'sitting' | 'sit'         // 坐姿
  | 'lying' | 'lie'           // 躺姿
  | 'reading' | 'read'        // 阅读
  | 'chatting' | 'talk'       // 交谈
  | 'drinking' | 'tea'        // 喝茶 / 休闲
  | 'family'                  // 家庭互动
  | 'standing' | 'stand';     // 站立

export interface PoseDnaData {
  bodyOrientation?: string;   // 身体朝向
  bodyDirection?: string;     // 别名
  seatingContact?: string;    // 臀部落座关系
  seatContact?: string;       // 别名
  backSupport?: string;       // 背部支撑状态
  armPlacements?: string;     // 手臂位置
  armPosition?: string;       // 别名
  footPlacements?: string;    // 脚部位置
  legPosition?: string;       // 别名
  personCount?: number;       // 人物数量
  humanCount?: number;        // 别名
  occlusionRules?: string;    // 遮挡规则
  occlusionRule?: string;     // 别名
}

export interface PoseAsset extends BaseSpaceAsset {
  type: 'pose';
  category: PoseCategory;
  poseDna: PoseDnaData;
  promptFragment?: string;
  referenceImages?: string[];
}

// 6. 道具资产 (PropAsset)
export interface PropAsset extends BaseSpaceAsset {
  type: 'prop';
  category: '灯具' | '地毯' | '茶几饰品' | '挂画' | '绿植' | '书籍器皿' | string;
  placementZone?: string;
  dimensions?: { width?: number; depth?: number; height?: number };
  promptFragment?: string;
}

// 综合资产联合类型
export type UnifiedSpaceAsset =
  | SceneStyleAsset
  | MaterialAsset
  | ModelAsset
  | PoseAsset
  | PropAsset;

// 摄影配置选中的视觉资产组
export interface ActivePhotographyAssets {
  style?: SceneStyleAsset | null;
  selectedSceneStyle?: SceneStyleAsset | null;
  material?: MaterialAsset | null;
  selectedMaterial?: MaterialAsset | null;
  model?: ModelAsset | null;
  selectedModel?: ModelAsset | null;
  selectedModels?: ModelAsset[]; // 多角色资产支持
  humanLayout?: HumanLayoutConfig; // 人物编排器
  selectedTemplate?: FamilySceneTemplate | null; // 兼容旧模板字段
  pose?: PoseAsset | null;
  selectedPose?: PoseAsset | null;
  props?: PropAsset[];
  selectedProps?: PropAsset[];
  lighting?: string;
  lightingMood?: string;
}

// 4 张候选生成结果规范
export interface CandidateItem {
  id: string;
  index?: number;
  variantIndex?: number;
  imageUrl: string;
  objectKey?: string;
  thumbnailUrl?: string;
  summaryTag?: string;
  promptSnapshot?: string;
  promptFragment?: string;
  seed?: number;
  isFavorite?: boolean;
  score?: number;
  createdAt: string;
}

export interface ShotCandidateBatch {
  shotId: string;
  batchId: string;
  mainSelectedCandidateId?: string;
  activeCandidateId?: string;
  candidates: CandidateItem[];
  generationSettings?: Record<string, any>;
  createdAt: string;
}
