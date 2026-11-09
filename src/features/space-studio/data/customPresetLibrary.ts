// AI 户型智能体生成的户型与美学：存在本机资产库，跨工程可复用；选中的那个同时写进工程快照
import { SpacePreset, StylePreset } from '../../../types/spaceStudio';

const SPACES_KEY = 'manwah_space_ai_spaces_v1';
const STYLES_KEY = 'manwah_space_ai_styles_v1';

export interface AgentLayoutResult {
  name: string;
  nameEn: string;
  propertyType: SpacePreset['propertyType'];
  layoutType: SpacePreset['layoutType'];
  ceilingHeight: number;
  zones: Array<{ name: string; primaryAxis: 'x' | 'y'; coveragePercentage: number }>;
  signatureFeatures: string[];
  promptFragments: string[];
  topology: NonNullable<SpacePreset['topology']>;
  basis: string;
  elevation?: SpacePreset['elevation'];
}

export interface AgentStyleResult {
  name: string;
  nameEn: string;
  category: string;
  cityCharacter: string;
  colorPalette: string[];
  materialSystem: string[];
  lifestyleTags: string[];
  typicalLayout: string;
  promptFragments: string[];
  negativeRules: string[];
  architecture: NonNullable<StylePreset['architecture']>;
  reason: string;
}

function read<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, items: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch (err) {
    console.warn('[customPresetLibrary] 保存失败', err);
  }
}

export const loadAiSpaces = () => read<SpacePreset>(SPACES_KEY);
export const loadAiStyles = () => read<StylePreset>(STYLES_KEY);
export const saveAiSpaces = (items: SpacePreset[]) => write(SPACES_KEY, items);
export const saveAiStyles = (items: StylePreset[]) => write(STYLES_KEY, items);

export function nextAiCode(prefix: 'AI-R' | 'AI-S', items: Array<{ code: string }>): string {
  let max = 0;
  for (const item of items) {
    if (item.code.startsWith(prefix)) {
      const n = Number(item.code.slice(prefix.length));
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}

const displayName = (name: string, nameEn: string) => (nameEn ? `${name} (${nameEn})` : name);

export function buildAiSpace(layout: AgentLayoutResult, existing: SpacePreset[], idSuffix: string): SpacePreset {
  return {
    id: `space-ai-${idSuffix}`,
    code: nextAiCode('AI-R', existing),
    name: displayName(layout.name, layout.nameEn),
    propertyType: layout.propertyType,
    layoutType: layout.layoutType,
    ceilingHeight: layout.ceilingHeight,
    zones: (layout.zones.length > 0 ? layout.zones : [{ name: '客厅会客区', primaryAxis: 'x' as const, coveragePercentage: 100 }]).map((z, i) => ({
      id: i === 0 ? 'living_zone' : `zone_${i + 1}`,
      name: z.name,
      primaryAxis: z.primaryAxis,
      coveragePercentage: z.coveragePercentage
    })),
    signatureFeatures: layout.signatureFeatures,
    referenceObjectKeys: [],
    promptFragments: layout.promptFragments,
    topology: layout.topology,
    elevation: layout.elevation,
    isAiGenerated: true
  };
}

export function buildAiStyle(style: AgentStyleResult, existing: StylePreset[], idSuffix: string): StylePreset {
  return {
    id: `style-ai-${idSuffix}`,
    code: nextAiCode('AI-S', existing),
    name: displayName(style.name, style.nameEn),
    category: style.category,
    cityCharacter: style.cityCharacter,
    colorPalette: style.colorPalette,
    materialSystem: style.materialSystem,
    lifestyleTags: style.lifestyleTags,
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'coffee_table'],
    typicalLayout: style.typicalLayout,
    promptFragments: style.promptFragments,
    negativeRules: style.negativeRules,
    referenceImages: [],
    architecture: style.architecture,
    isAiGenerated: true
  };
}
