// src/services/spaceHumanChoreographyService.ts
// MANWAH Space Studio｜AI 人物编排构思与角色资产匹配前端服务 V1.0
import { ModelAsset, HumanSlotAssignment } from '../types/spaceAssetLibrary';

export interface ChoreographedSlotItem {
  id: string;
  targetRole: string;
  roleLabel: string;
  positionDesc: string;
  actionDesc: string;
  matchedModelId?: string;
  matchedModelName?: string;
  matchReason?: string;
}

export interface ChoreographedLayoutResult {
  theme: string;
  spatialSummary: string;
  recommendedCount: number;
  slots: ChoreographedSlotItem[];
  source: 'ai_vision' | 'ai_prompt' | 'heuristic_engine';
}

export interface ChoreographLayoutPayload {
  projectId?: string;
  prompt?: string;
  imageUrl?: string;
  imageBase64?: string;
  characterCount?: number;
  availableModels?: ModelAsset[];
}

export const CHOREOGRAPHY_PRESET_SCENARIOS = [
  {
    title: '三代同堂 · 芝华仕头等舱天伦之乐',
    tag: '6人尊享',
    count: 6,
    prompt: '三代同堂其乐融融，爷爷在主沙发一号电动位展开脚托半躺小憩，奶奶在单人真皮单椅品茗，男主人在主位中央与妻子交谈，女主人在贵妃榻侧倚，小女儿依偎在身旁翻画册，小男孩在地毯上拼装积木。'
  },
  {
    title: '温馨四口之家 · 周末亲子陪伴',
    tag: '4人亲子',
    count: 4,
    prompt: '年轻夫妇带着一儿一女的周末客厅温馨时光，男主人从容坐镇主沙发看平板，女主人在贵妃榻手捧咖啡注视孩子，两名萌娃围绕在茶几羊毛地毯上玩互动桌游。'
  },
  {
    title: '长辈颐养 · 晨间静思品茗',
    tag: '2人长辈',
    count: 2,
    prompt: '两位银发长辈的静谧早晨，爷爷坐在头等舱功能位展开脚托阅读晨报，奶奶在单人功能椅端坐品茶，神情安详从容，享受宁静慢生活。'
  },
  {
    title: '轻奢二人世界 · 浪漫微醺对谈',
    tag: '2人夫妻',
    count: 2,
    prompt: '年轻高智夫妇在现代大平层客厅的松弛夜晚，两人并肩就座于主沙发功能位，展开零重力倾角，手持红酒杯轻语倾听，享受松弛浪漫。'
  },
  {
    title: '商务精英 · 会客洽谈与前瞻对谈',
    tag: '3人商务',
    count: 3,
    prompt: '大平层高规格会客交流，男主人在主位从容交谈，客人在贵妃位与单人椅就座，身姿挺拔端庄，展现成功人士风范与奢华气场。'
  }
];

export class SpaceHumanChoreographyClientService {
  /**
   * 请求后端 AI 构思与角色资产库匹配
   */
  public static async choreographLayout(payload: ChoreographLayoutPayload): Promise<ChoreographedLayoutResult> {
    const response = await fetch('/api/space/human/choreograph-layout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        projectId: payload.projectId || 'manwah-space-default',
        prompt: payload.prompt,
        imageUrl: payload.imageUrl,
        imageBase64: payload.imageBase64,
        characterCount: payload.characterCount,
        availableModels: (payload.availableModels || []).map(m => ({
          id: m.id,
          name: m.name,
          nameZh: m.nameZh,
          roleType: m.roleType,
          ageGroup: m.ageGroup,
          positioning: m.positioning,
          gender: m.gender,
          tags: m.tags,
          thumbnail: m.thumbnail,
          coverImage: m.coverImage
        }))
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI 编排构思请求失败 (${response.status}): ${errText}`);
    }

    const json = await response.json();
    if (!json.success || !json.data) {
      throw new Error(json.error || 'AI 编排构思未返回有效数据');
    }

    return json.data as ChoreographedLayoutResult;
  }
}
