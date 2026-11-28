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
    id: 'gemini-3-pro-image-preview',
    name: '旗舰商业超清 (Gemini 3 Pro)',
    badge: '官方推荐 · 旗舰',
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
    description: '商业旗舰级 3D 几何与空间透视融合，精准掌控大平层斜向进深、奢石反光与金属脚五金'
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    name: '标准空间生图 (Gemini 3.1 Flash)',
    badge: '高精主力',
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
    description: '平衡速度与光影质感，极速出图，忠实还原敏华半苯胺头层牛皮纹理'
  },
  {
    id: 'gemini-nano-banana-2.1-preview',
    name: 'Nano Banana 2.1 (极速响应 · 轻量多图融合)',
    badge: '极速草图',
    provider: 'gemini',
    tier: 'speed',
    capabilities: {
      supportsImage: true,
      supportsEdit: true,
      supportsMultiReference: true,
      supportsSeed: true,
      supports4K: true,
      maxReferences: 16
    },
    description: '极速响应、轻量计算与多图融合，适合大平层空间机位初稿快速探索'
  },
  {
    id: 'gpt-image-2',
    name: 'GPT 图像生成 (gpt-image-2)',
    badge: '官方推荐',
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
    description: '系统默认 GPT 图像生成模型，真实建筑漫反射体系，精准契合都会高定质感'
  },
  {
    id: 'gpt-image-2-c',
    name: 'GPT 增强微调 (gpt-image-2-c)',
    badge: '母版一致性',
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
    description: '针对扶手五金细节、电动展开姿态与缝线特写增强，母版高一致性'
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
  },
  {
    id: 'gpt-image-2.6-flare-c',
    name: 'GPT 2.6 Flare (精细视觉创作与编辑)',
    badge: '2.6 原画创作',
    provider: 'openai',
    tier: 'flagship',
    capabilities: {
      supportsImage: true,
      supportsEdit: true,
      supportsMultiReference: true,
      supportsSeed: true,
      supports4K: true,
      maxReferences: 16
    },
    description: '默认出图模型：精细视觉创作与编辑，产品保真与中文排版准确，速度快 (/v1/images)'
  },
  {
    id: 'gpt-image-2.6-sunburst-c',
    name: 'GPT 2.6 Sunburst (复杂构图与标注编辑旗舰)',
    badge: '2.6 旗舰高光',
    provider: 'openai',
    tier: 'flagship',
    capabilities: {
      supportsImage: true,
      supportsEdit: true,
      supportsMultiReference: true,
      supportsSeed: true,
      supports4K: true,
      maxReferences: 16
    },
    description: '高质量出图：光影与质感更细腻，适合终稿，耗时约为 Flare 的两倍 (/v1/images)'
  },
  {
    id: 'gpt-image-2.5-flare-c',
    name: 'GPT 2.5 Flare (高保真原画)',
    badge: '原画重绘',
    provider: 'openai',
    tier: 'standard',
    capabilities: {
      supportsImage: true,
      supportsEdit: true,
      supportsMultiReference: true,
      supportsSeed: true,
      supports4K: true,
      maxReferences: 16
    },
    description: '支持文生图、图生图与局部 Mask 重绘，高保真还原真实家具原画'
  },
  {
    id: 'gpt-image-2.5-sunburst-c',
    name: 'GPT 2.5 Sunburst (高光细节旗舰)',
    badge: '高光细节',
    provider: 'openai',
    tier: 'flagship',
    capabilities: {
      supportsImage: true,
      supportsEdit: true,
      supportsMultiReference: true,
      supportsSeed: true,
      supports4K: true,
      maxReferences: 16
    },
    description: '旗舰级高光细节与皮革质感，全幅光影深度与精工缝线呈现'
  },
  {
    id: 'doubao-seedream-5-5',
    name: '豆包 Seedream 5.5 (多参考图生图)',
    badge: '豆包生图',
    provider: 'vectorengine',
    tier: 'flagship',
    capabilities: {
      supportsImage: true,
      supportsEdit: true,
      supportsMultiReference: true,
      supportsSeed: false,
      supports4K: true,
      maxReferences: 14
    },
    description: '字节豆包生图：文生图、单图/多参考图生图，2K/4K 出图（没有 1K 档，选 1K 按 2K 出），不支持局部 Mask'
  },
  {
    id: 'gemini-2.5-flash-image',
    name: '极速闪电 (Gemini 2.5 Flash)',
    badge: '超低延迟',
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
  }
];

export function getModelById(modelId: string): ClientImageModelItem {
  return (
    SPACE_IMAGE_MODELS.find((m) => m.id === modelId || m.id === String(modelId || '').replace(/^(openai|google)\//, '')) ||
    SPACE_IMAGE_MODELS[0]
  );
}

/**
 * 多模型故障自动轮换顺序（前后端共用的唯一真值）：
 * 主模型失败后按此顺序顺延重试，已作为主模型的条目自动跳过。
 */
export const SPACE_AUTO_FALLBACK_MODELS: readonly { id: string; label: string }[] = [
  { id: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1' },
  { id: 'openai/gpt-image-2.5-flare-c', label: 'GPT 2.5 Flare' },
  { id: 'openai/gpt-image-2.6-flare-c', label: 'GPT 2.6 Flare' },
  { id: 'gpt-image-2-c', label: 'GPT 2-c' }
];

export function describeFallbackChain(primaryModel: string): string {
  return SPACE_AUTO_FALLBACK_MODELS
    .filter((m) => m.id !== primaryModel)
    .map((m) => m.label)
    .join(' ➔ ');
}

const GENERATION_MODEL_LABELS: Array<[RegExp, string]> = [
  [/^fallback-original$/, '未出图·保留底图'],
  [/^manwah-spatial-renderer/, '本地示意图'],
  [/gemini-3-pro-image/, 'Gemini 3 Pro'],
  [/gemini-3\.1-flash-image/, 'Gemini 3.1 Flash'],
  [/nano-banana-2\.1/, 'Nano Banana 2.1'],
  [/gemini-2\.5-flash-image/, 'Gemini 2.5 Flash'],
  [/gpt-image-2\.6-flare/, 'GPT 2.6 Flare'],
  [/gpt-image-2\.6-sunburst/, 'GPT 2.6 Sunburst'],
  [/gpt-image-2\.5-flare/, 'GPT 2.5 Flare'],
  [/gpt-image-2\.5-sunburst/, 'GPT 2.5 Sunburst'],
  [/gpt-image-2-all/, 'GPT Image 2 All'],
  [/seedream-5-5/, 'Seedream 5.5'],
  [/gpt-image-2/, 'GPT Image 2']
];

/** 把网关返回的模型 ID 转为简短可读名称；两步出图（"A + B 精修"）两段分别转换 */
export function formatGenerationModelLabel(modelId?: string): string {
  if (!modelId) return '';
  return modelId
    .split(/\s*\+\s*/)
    .map((part) => {
      const refine = /精修$/.test(part);
      const id = part.replace(/\s*精修$/, '').replace(/^(openai|google)\//, '').trim();
      const hit = GENERATION_MODEL_LABELS.find(([re]) => re.test(id));
      return `${hit ? hit[1] : id}${refine ? ' 精修' : ''}`;
    })
    .join(' + ');
}

/** 出图信息摘要，例如 "Gemini 3 Pro · 11-04 10:30 · 36秒" */
export function formatGenerationMeta(params: { model?: string; createdAt?: string; durationMs?: number }): string {
  const parts: string[] = [];
  const label = formatGenerationModelLabel(params.model);
  if (label) parts.push(label);
  if (params.createdAt) {
    const d = new Date(params.createdAt);
    if (!isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      parts.push(`${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`);
    }
  }
  if (typeof params.durationMs === 'number' && params.durationMs > 0) {
    parts.push(`${Math.round(params.durationMs / 1000)}秒`);
  }
  return parts.join(' · ');
}
