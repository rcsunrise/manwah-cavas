// src/config/imageModelRegistry.ts
// MANWAH Space Studio｜统一生图模型能力注册表 (Client Capability Registry) V3.1

export interface ClientModelCapability {
  supportsImage: boolean;
  supportsEdit: boolean;
  supportsMultiReference: boolean;
  supportsSeed: boolean;
  supports4K: boolean;
  maxReferences: number;
}

export interface ClientImageModelItem {
  id: string;
  name: string;
  badge: string;
  provider: 'gemini' | 'openai' | 'routerhub' | 'vectorengine';
  tier: 'speed' | 'standard' | 'flagship';
  capabilities: ClientModelCapability;
  description: string;
}

export const SPACE_IMAGE_MODELS: readonly ClientImageModelItem[] = [
  {
    id: 'gemini-2.5-flash-image',
    name: '极速闪电 (Gemini 2.5 Flash)',
    badge: '极速推荐',
    provider: 'gemini',
    tier: 'speed',
    capabilities: {
      supportsImage: true,
      supportsEdit: true,
      supportsMultiReference: true,
      supportsSeed: true,
      supports4K: false,
      maxReferences: 8
    },
    description: '毫秒级响应，适合机位快速探索与大平层初稿预览'
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    name: '标准空间生图 (Gemini 3.1 Flash)',
    badge: '标准精度',
    provider: 'gemini',
    tier: 'standard',
    capabilities: {
      supportsImage: true,
      supportsEdit: true,
      supportsMultiReference: true,
      supportsSeed: true,
      supports4K: true,
      maxReferences: 16
    },
    description: '平衡速度与光影质感，忠实还原敏华半苯胺头层牛皮纹理'
  },
  {
    id: 'gemini-3-pro-image-preview',
    name: '旗舰商业超清 (Gemini 3 Pro)',
    badge: '商业母版',
    provider: 'gemini',
    tier: 'flagship',
    capabilities: {
      supportsImage: true,
      supportsEdit: true,
      supportsMultiReference: true,
      supportsSeed: true,
      supports4K: true,
      maxReferences: 16
    },
    description: '300DPI 极高质量印刷级输出，精准把控潘多拉奢石反光与金属脚五金'
  },
  {
    id: 'gpt-image-2',
    name: 'GPT 商业写实 (gpt-image-2)',
    badge: '高保真写实',
    provider: 'openai',
    tier: 'standard',
    capabilities: {
      supportsImage: true,
      supportsEdit: true,
      supportsMultiReference: true,
      supportsSeed: true,
      supports4K: true,
      maxReferences: 12
    },
    description: '真实建筑漫反射体系，精准契合都会收藏家高定质感'
  },
  {
    id: 'gpt-image-2-c',
    name: 'GPT 增强微调 (gpt-image-2-c)',
    badge: '局部微调',
    provider: 'openai',
    tier: 'standard',
    capabilities: {
      supportsImage: true,
      supportsEdit: true,
      supportsMultiReference: true,
      supportsSeed: true,
      supports4K: true,
      maxReferences: 8
    },
    description: '针对扶手五金细节、电动展开姿态与缝线特写增强'
  },
  {
    id: 'gpt-image-2-all',
    name: 'GPT 多图参考 (gpt-image-2-all)',
    badge: '多图融合',
    provider: 'vectorengine',
    tier: 'flagship',
    capabilities: {
      supportsImage: true,
      supportsEdit: true,
      supportsMultiReference: true,
      supportsSeed: false,
      supports4K: true,
      maxReferences: 16
    },
    description: '严格注入多张产品参考原图，最大化锁死敏华沙发结构外观'
  }
];

export function getModelById(modelId: string): ClientImageModelItem {
  return (
    SPACE_IMAGE_MODELS.find((m) => m.id === modelId) ||
    SPACE_IMAGE_MODELS[0]
  );
}
