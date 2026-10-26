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
  modelUsed?: string;
}

export interface ChoreographLayoutPayload {
  projectId?: string;
  prompt?: string;
  imageUrl?: string;
  imageBase64?: string;
  characterCount?: number;
  model?: string;
  availableModels?: ModelAsset[];
}

export const CHOREOGRAPHY_PRESET_SCENARIOS = [
  // ─── 影棚实拍商业对齐 5 套核心动作模版 ───
  {
    title: '单椅舒享 · 零重力深度小憩',
    tag: 'A03 专拍 / 1人零重力',
    targetShotCode: 'A03',
    count: 1,
    prompt: '女主人身着丝绸居家服，深度靠在芝华仕单人功能单椅上。电动脚托 100% 展开平稳托举双腿，靠背倾斜至 150° 零重力姿态。模特头枕贴合颈部微仰，一手搭在真皮扶手，一手轻抚脸侧微仰闭目小憩。单椅边几放骨瓷咖啡，窗外漫射侧光洒在皮革缝线与脚托轮廓上。严禁身体僵硬端坐，严禁脚托未展开。'
  },
  {
    title: '单椅温情 · 亲子探身伴读',
    tag: 'A04 专拍 / 2人情感',
    targetShotCode: 'A04',
    count: 2,
    prompt: '温婉知性的女主人坐于展开 120° 角度的单人皮质功能椅中，身侧扶手旁，灵动活泼的小女儿站在单椅侧后方，双手轻扶椅背及扶手边缘，身体前倾探头。母亲侧头微笑注视孩子并轻扶其手臂，孩子开朗好奇地与母亲对视，高低错落生动，传递头等舱安心陪伴。'
  },
  {
    title: '地毯松弛 · 席地微醺/品茗',
    tag: 'A05 专拍 / 2人席地',
    targetShotCode: 'A05',
    count: 2,
    prompt: '贴地 75cm 低角度生活方式近景。女主人身着丝绸居家服，席地坐在沙发前的厚实羊毛地毯上，背靠沙发底座，双腿侧屈微放，单手持红酒杯，一手轻搭茶几边沿。男主人坐在主沙发外侧位身体前倾，手肘撑在膝上，两人目光交汇低语谈笑，极度慵懒松弛。'
  },
  {
    title: '精英主座 · 竖版气场舒展',
    tag: 'A02 专拍 / 1人跨页Hero',
    targetShotCode: 'A02',
    count: 1,
    prompt: '3:4 竖构图画册跨页视角。商界精英坐镇主沙发 1 号电动功能位，电动脚托展开 80%，靠背微后仰 115°。坐姿挺拔但放松，单手握持轻薄智能平板，一手自然平置于宽厚真皮扶手，眼神从容注视前方。背景透出大平层定制奢石背景墙，凸显主人翁掌控力与大宅高奢品质。'
  },
  {
    title: '三代同堂 · 芝华仕全景天伦之乐',
    tag: 'A01/A07 / 6人全家福',
    targetShotCode: 'A01',
    count: 6,
    prompt: '大平层客厅三代同堂天伦之乐。主沙发左侧电动功能位爷爷展开脚托半靠闭目养神；沙发中央位男主人前倾端坐手持茶杯与身旁交谈；贵妃榻上女主人优雅侧倚侧坐手抚靠垫；独立单椅上奶奶端坐品茗；小女儿依偎在身旁翻看绘本；小男孩席地在茶几前地毯上专注摆弄乐高积木。错落有致，各享动线。'
  },
  // ─── 经典辅助场景 ───
  {
    title: '温馨四口之家 · 周末亲子陪伴',
    tag: '4人亲子',
    targetShotCode: 'A06',
    count: 4,
    prompt: '年轻夫妇带着一儿一女的周末客厅温馨时光，男主人从容坐镇主沙发看平板，女主人在贵妃榻手捧咖啡注视孩子，两名萌娃围绕在茶几羊毛地毯上玩互动桌游。'
  },
  {
    title: '商务精英 · 会客洽谈与前瞻对谈',
    tag: '3人商务',
    targetShotCode: 'A06',
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
        model: payload.model || 'gemini-3.7-flash',
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
