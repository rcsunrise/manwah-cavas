// server/services/spaceHumanChoreographyService.ts
// MANWAH Space Studio｜AI 多模态人物编排构思与角色资产匹配引擎 V1.0
import { z } from 'zod';
import sharp from 'sharp';
import { createServerGenAI } from '../utils/aiClient';
import { GcsAssetStorage } from './storage/gcsAssetStorage';
import { resolveAndValidateImage } from '../ai/imageInputSecurity';

/** 结构化座位类型：生成阶段据此锚定人物所在家具，不再从中文描述里猜 */
export const CHOREOGRAPHY_SEAT_TYPES = [
  'main_sofa_power',
  'main_sofa_middle',
  'main_sofa_end',
  'chaise',
  'single_chair',
  'rug_floor',
  'standing'
] as const;
export type ChoreographySeatType = typeof CHOREOGRAPHY_SEAT_TYPES[number];
export type ChoreographyFootrestState = 'extended' | 'retracted';

// 实测（2026-11-03，两张 1280px 图）：3.8 Flash 21s、3.1 Pro 24s、2.5 Flash 25s、3.7 Flash 34s；
// 3.8 Flash 识别最细，默认用它，3.1 Pro 备用
export const DEFAULT_CHOREOGRAPHY_MODEL = 'gemini-3.8-flash';
const BACKUP_CHOREOGRAPHY_MODEL = 'gemini-3.1-pro-preview';
const MODEL_TIMEOUT_MS = 90_000;
// 原图直接送模型会大幅拖慢识别（之前 45 秒超时的主因），识别座位与人物 1280px 足够
const MAX_IMAGE_EDGE = 1280;

export const ChoreographLayoutRequestSchema = z.object({
  projectId: z.string().optional().default('manwah-space-default'),
  prompt: z.string().optional(),
  imageUrl: z.string().optional(),
  imageBase64: z.string().optional(),
  /** 人物参考图（含人物的实景效果图）：按它的人物组合与姿态复刻到目标空间 */
  referenceImageUrl: z.string().optional(),
  referenceImageBase64: z.string().optional(),
  characterCount: z.number().optional(),
  /** 产品分析识别出的画面家具清单，例如 ['三人位电动沙发', '单人功能椅', '圆形茶几'] */
  furnitureInventory: z.array(z.string()).optional(),
  model: z.string().optional().default(DEFAULT_CHOREOGRAPHY_MODEL),
  availableModels: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      nameZh: z.string().optional(),
      roleType: z.string().optional(),
      ageGroup: z.string().optional(),
      positioning: z.string().optional(),
      gender: z.string().optional(),
      tags: z.array(z.string()).optional(),
      thumbnail: z.string().optional(),
      coverImage: z.string().optional()
    })
  ).optional().default([])
});

export interface ChoreographedSlotItem {
  id: string;
  targetRole: string;
  roleLabel: string;
  positionDesc: string;
  actionDesc: string;
  matchedModelId?: string;
  matchedModelName?: string;
  matchReason?: string;
  seatType?: ChoreographySeatType;
  footrestState?: ChoreographyFootrestState;
}

export interface ChoreographedLayoutResult {
  theme: string;
  spatialSummary: string;
  recommendedCount: number;
  slots: ChoreographedSlotItem[];
  source: 'ai_vision' | 'ai_prompt' | 'heuristic_engine';
  modelUsed?: string;
  /** 兜底或图片读取失败时给用户的明确提示 */
  notice?: string;
  /** 是否按人物参考图复刻了编排 */
  referenceApplied?: boolean;
}

const normalizeSeatType = (value: unknown): ChoreographySeatType | undefined =>
  (CHOREOGRAPHY_SEAT_TYPES as readonly string[]).includes(String(value)) ? (value as ChoreographySeatType) : undefined;

const normalizeFootrest = (value: unknown, seatType?: ChoreographySeatType): ChoreographyFootrestState | undefined => {
  if (seatType === 'rug_floor' || seatType === 'standing') return undefined;
  if (value === 'extended' || value === 'retracted') return value;
  return seatType ? 'retracted' : undefined;
};

/** 把前端传来的图片（data URL / 本地存储链接 / 远程链接）解析成模型可读的 inlineData */
async function loadChoreographyImage(source: string): Promise<{ data: string; mimeType: string }> {
  const raw = await readChoreographyImage(source);
  const buffer = await sharp(Buffer.from(raw.data, 'base64'))
    .rotate()
    .resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { data: buffer.toString('base64'), mimeType: 'image/jpeg' };
}

async function readChoreographyImage(source: string): Promise<{ data: string; mimeType: string }> {
  const dataUrl = source.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (dataUrl) return { mimeType: dataUrl[1], data: dataUrl[2] };

  const keyMatch = source.match(/[?&]key=([^&#]+)/);
  if (source.startsWith('/api/space/storage') && keyMatch) {
    const storage = GcsAssetStorage.getInstance();
    const key = decodeURIComponent(keyMatch[1]);
    const buffer = (await storage.getBuffer(key, 'generated')) || (await storage.getBuffer(key, 'source'));
    if (!buffer) throw new Error(`存储中找不到图片：${key}`);
    const resolved = await resolveAndValidateImage({ source: buffer.toString('base64'), role: 'style_reference', order: 0 });
    return { data: resolved.cleanB64, mimeType: resolved.mimeType };
  }

  if (/^https?:\/\//i.test(source)) {
    const resolved = await resolveAndValidateImage({ source, role: 'style_reference', order: 0 }, { timeoutMs: 30_000 });
    return { data: resolved.cleanB64, mimeType: resolved.mimeType };
  }

  throw new Error('不支持的图片地址格式');
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} 超过 ${Math.round(ms / 1000)} 秒未响应`)), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

export class SpaceHumanChoreographyService {
  /**
   * 核心方法：结合图像识别与提示词进行 AI 构思，并智能匹配角色资产库
   */
  public static async choreograph(
    input: z.input<typeof ChoreographLayoutRequestSchema>,
    userId: string = 'system'
  ): Promise<ChoreographedLayoutResult> {
    const {
      prompt = '',
      imageUrl,
      imageBase64,
      referenceImageUrl,
      referenceImageBase64,
      characterCount,
      furnitureInventory = [],
      availableModels = [],
      model = DEFAULT_CHOREOGRAPHY_MODEL
    } = input;

    // 0. 先把选中的空间图读成模型可见的图片；读不到就直接报错，不能假装做了视觉识别
    const imageSource = imageBase64 || imageUrl;
    const referenceSource = referenceImageBase64 || referenceImageUrl;
    let inlineImage: { data: string; mimeType: string } | null = null;
    let referenceImage: { data: string; mimeType: string } | null = null;
    try {
      if (imageSource) inlineImage = await loadChoreographyImage(imageSource);
    } catch (imgErr: any) {
      throw new Error(`无法读取当前镜头图，未进行识别：${imgErr?.message || imgErr}`);
    }
    try {
      if (referenceSource) referenceImage = await loadChoreographyImage(referenceSource);
    } catch (imgErr: any) {
      throw new Error(`无法读取人物参考图，未进行识别：${imgErr?.message || imgErr}`);
    }
    // 只有参考图、没有目标镜头图时，参考图本身就是要编排的空间
    if (!inlineImage && referenceImage) {
      inlineImage = referenceImage;
    }
    const sameImage = Boolean(referenceImage && inlineImage === referenceImage);

    const failures: string[] = [];

    // 1. Gemini 多模态构思：首选模型 + 一个备用模型，每个限时 45 秒
    try {
      const { ai, isValidKey } = await createServerGenAI(userId);

      if (ai && isValidKey) {
        const preferredModel = (model || '').trim() || DEFAULT_CHOREOGRAPHY_MODEL;
        const normalizedPreferred =
          (preferredModel === 'gemini-4-argon' || preferredModel === 'argon' || preferredModel === 'gemini-4')
            ? 'gemini-3.1-pro-preview'
            : preferredModel;
        const backupModel = normalizedPreferred === BACKUP_CHOREOGRAPHY_MODEL ? DEFAULT_CHOREOGRAPHY_MODEL : BACKUP_CHOREOGRAPHY_MODEL;
        const candidateModels = [normalizedPreferred, backupModel];

        const modelsSummary = availableModels.map(m => ({
          id: m.id,
          name: m.nameZh || m.name,
          roleType: m.roleType,
          ageGroup: m.ageGroup,
          positioning: m.positioning,
          gender: m.gender
        }));

        const systemPrompt = `你是一名敏华家居（CHEERS 芝华仕）高定大平层空间陈设导演与家庭生活方式总监。
你的任务是根据传入的【空间家具图像】和/或【用户场景提示词/生活构思】，为画面中的敏华头等舱沙发及空间，进行极其专业生动、富有生活质感的【人物空间就座编排、细腻动作姿态构思，并从给定的角色资产库中匹配最契合的人物】。

【空间与家具核心规范】
1. 敏华头等舱沙发核心特征：
   - 电动功能主座（支持 110°-160° 舒展倾角、展开双脚托、无线充电/杯托控制屏）；
   - 贵妃榻/躺位（适合侧倚浅笑、依偎、品茗翻阅）；
   - 单人真皮功能单椅（常作为长辈专座或独立阅读位）；
   - 茶几地毯留白区（适合孩子盘腿席地玩耍、亲子互动）。
${inlineImage ? `   - 已附上${referenceImage && !sameImage ? '图1（目标镜头空间）' : '空间图'}：只能安排在图中真实存在的家具上，图中没有的家具（例如没有贵妃榻）不得使用。` : ''}
${furnitureInventory.length > 0 ? `   - 产品分析识别出的画面家具清单：${furnitureInventory.join('、')}。` : ''}
2. 人物动作描述规范：
   - 动作必须细腻自然、充满电影感与真实家庭烟火气；
   - 严禁假人僵硬站立或突兀漂移；
   - 角色之间有自然的视线交汇、温情互动或独立松弛专注；
   - 必须结合沙发的触控按键、脚托舒展、真皮靠包等物理接触面。
3. 座位与脚托必须结构化输出：
   - seatType 只能取：main_sofa_power（主沙发电动功能位）、main_sofa_middle（主沙发中间座）、main_sofa_end（主沙发另一端座位）、chaise（贵妃位）、single_chair（单人椅）、rug_floor（地毯席地）、standing（站立）；
   - footrestState 只能取 extended 或 retracted；只有动作里明确半躺/展开脚托的人才填 extended，同一个座位不能安排两个人。
4. 角色资产库匹配：
   - 给定的角色资产库如下：
${JSON.stringify(modelsSummary, null, 2)}
   - 必须根据每个人物角色的家庭定位（grandfather, grandmother, father, mother, daughter, son 等），从角色资产库中挑选最合适的一个，填入 matchedModelId 与 matchedModelName，不同人物不得重复使用同一个角色。

${referenceImage ? (sameImage
  ? `【首要任务·按图复刻人物编排】：附图中已有人物。逐一识别图中每个人物的身份（年龄、性别、家庭角色）、所坐家具与座位、姿态动作、手持物、视线互动和脚托状态，原样输出为编排方案，人数与图中一致，不得增删或改动人物关系。`
  : `【首要任务·按参考图复刻人物编排】：图2是人物参考效果图。逐一识别图2中每个人物的身份（年龄、性别、家庭角色）、所坐家具与座位、姿态动作、手持物、视线互动和脚托状态，然后映射到图1中同类型的家具上（图2坐单椅的人仍坐图1的单椅，坐主沙发左/中/右的人对应图1主沙发同一位置）。人数与图2一致，人物关系和动作保持一致；若图1缺少对应家具，就近安排并在 matchReason 中说明。positionDesc 必须描述图1中的位置。`) : ''}
${prompt ? `【用户构思意图与情景描述】：${prompt}${referenceImage ? '（作为补充要求，与参考图冲突时以参考图的人物编排为准）' : ''}` : ''}
${characterCount ? `【期望人物数量】：${characterCount} 人` : referenceImage ? '' : '【人物数量建议】：根据空间座次容量与情景，合理推荐 2~6 人'}

必须输出严格合法的纯 JSON 对象（禁止输出 markdown 代码块反引号，禁止包含其他任何文字）：
{
  "theme": "三代同堂·头等舱周末慢生活",
  "spatialSummary": "画面中为典型大平层客厅，主沙发带电动双功能位，左侧配备单人功能椅，地毯区宽敞通透...",
  "recommendedCount": 4,
  "slots": [
    {
      "id": "slot-1",
      "targetRole": "grandfather",
      "roleLabel": "睿智儒雅爷爷",
      "seatType": "main_sofa_power",
      "footrestState": "extended",
      "positionDesc": "主沙发一号电动功能主座（展开脚托）",
      "actionDesc": "45°半躺于头等舱展开脚托，目光沉稳温和，右手轻搭在扶手触控面板上，安享天伦",
      "matchedModelId": "...",
      "matchedModelName": "...",
      "matchReason": "长辈气质沉稳，坐镇电动功能主位"
    }
  ]
}`;

        const contents: any[] = [{ text: systemPrompt }];
        if (inlineImage) contents.push({ inlineData: inlineImage });
        if (referenceImage && !sameImage) contents.push({ inlineData: referenceImage });

        for (const modelToUse of candidateModels) {
          try {
            const response = await withTimeout(
              ai.models.generateContent({ model: modelToUse, contents }),
              MODEL_TIMEOUT_MS,
              modelToUse
            );

            const cleanedJson = (response.text || '')
              .replace(/```json/gi, '')
              .replace(/```/g, '')
              .trim();

            const parsed = JSON.parse(cleanedJson);
            if (parsed && Array.isArray(parsed.slots) && parsed.slots.length > 0) {
              const usedModelIds = new Set<string>();
              const pickUnused = (predicate: (m: typeof availableModels[number]) => boolean) =>
                availableModels.find(m => !usedModelIds.has(m.id) && predicate(m));

              const slots: ChoreographedSlotItem[] = parsed.slots.map((s: any, idx: number) => {
                const matched =
                  pickUnused(m => m.id === s.matchedModelId) ||
                  pickUnused(m => m.roleType === s.targetRole) ||
                  pickUnused(() => true);
                if (matched) usedModelIds.add(matched.id);
                const seatType = normalizeSeatType(s.seatType);

                return {
                  id: s.id || `slot-${idx + 1}`,
                  targetRole: s.targetRole || 'family_member',
                  roleLabel: s.roleLabel || (matched?.nameZh || matched?.name || `角色 ${idx + 1}`),
                  positionDesc: s.positionDesc || '沙发功能主座',
                  actionDesc: s.actionDesc || '舒展就座，目光温和自然',
                  matchedModelId: matched?.id,
                  matchedModelName: matched ? (matched.nameZh || matched.name) : s.matchedModelName,
                  matchReason: s.matchReason || '根据家庭定位与气质契合',
                  seatType,
                  footrestState: normalizeFootrest(s.footrestState, seatType)
                };
              });

              return {
                theme: parsed.theme || '空间人物情景编排',
                spatialSummary: parsed.spatialSummary || '基于空间家具结构与生活情景构思',
                recommendedCount: slots.length,
                slots,
                source: inlineImage ? 'ai_vision' : 'ai_prompt',
                referenceApplied: Boolean(referenceImage),
                modelUsed: modelToUse,
                notice: failures.length > 0 ? `首选模型未成功（${failures.join('；')}），已由 ${modelToUse} 完成构思。` : undefined
              };
            }
            failures.push(`${modelToUse} 返回内容缺少人物编排`);
          } catch (modelErr: any) {
            failures.push(`${modelToUse}: ${String(modelErr?.message || modelErr).slice(0, 120)}`);
            console.warn(`[SpaceHumanChoreographyService] Model ${modelToUse} failed:`, modelErr);
          }
        }
      } else {
        failures.push('未配置可用的 Gemini 密钥');
      }
    } catch (aiErr: any) {
      failures.push(String(aiErr?.message || aiErr).slice(0, 120));
      console.warn('[SpaceHumanChoreographyService] AI model call fallback:', aiErr);
    }

    // 2. AI 全部失败：用固定模板兜底，并明确告诉用户这不是 AI 看图的结果
    const fallback = this.runHeuristicChoreography(prompt, characterCount, availableModels);
    return {
      ...fallback,
      notice: `AI 构思失败（${failures.join('；') || '未知原因'}），以下是固定模板方案，${inlineImage ? '并未分析所选图片' : '仅按关键词匹配'}，请核对后再应用或重试。`
    };
  }

  /**
   * 确定性启发式规则与资产库智能匹配兜底
   */
  private static runHeuristicChoreography(
    userPrompt: string = '',
    requestedCount?: number,
    availableModels: any[] = []
  ): ChoreographedLayoutResult {
    const p = userPrompt.toLowerCase();

    // 智能推断场景意图
    let theme = '三代同堂·头等舱温馨家庭日';
    let spatialSummary = '主沙发配置双电动功能位，左侧单人位静谧品茗，中央地毯区亲子互动。';
    let count = requestedCount || (p.includes('2') || p.includes('二人') || p.includes('夫妻') ? 2 : p.includes('4') || p.includes('四人') ? 4 : 6);

    // 预设高拟真人物角色模版
    const roleTemplates = [
      {
        roleKey: 'grandfather',
        seatType: 'main_sofa_power' as ChoreographySeatType,
        footrestState: 'extended' as ChoreographyFootrestState,
        label: '睿智儒雅爷爷',
        position: '主沙发一号电动功能主座（展开脚托）',
        action: '45°半躺于头等舱展开脚托，目光沉稳温和，右手轻触扶手控制屏，安然自得',
        reason: '一家之主专享头等舱电动位，体现长辈尊贵舒适'
      },
      {
        roleKey: 'grandmother',
        seatType: 'single_chair' as ChoreographySeatType,
        footrestState: 'retracted' as ChoreographyFootrestState,
        label: '优雅慈祥奶奶',
        position: '单人真皮功能单椅',
        action: '端坐品茗，手捧白瓷盖碗，神态安详从容，展现长者风范',
        reason: '独立单人真皮单椅，品茗静思，舒适尊享'
      },
      {
        roleKey: 'father',
        seatType: 'main_sofa_middle' as ChoreographySeatType,
        footrestState: 'retracted' as ChoreographyFootrestState,
        label: '沉稳儒雅男主人',
        position: '主沙发中央功能位',
        action: '从容端坐，左手轻搭沙发靠背，面带微笑侧首与身旁妻子倾心交谈',
        reason: '坐镇客厅中央中枢位，兼顾与长者与妻儿沟通'
      },
      {
        roleKey: 'mother',
        seatType: 'chaise' as ChoreographySeatType,
        footrestState: 'retracted' as ChoreographyFootrestState,
        label: '优雅知性女主人',
        position: '沙发贵妃榻休闲位',
        action: '身姿优雅侧倚，手捧花草茶，目光慈爱注视地毯上玩耍的孩子',
        reason: '贵妃榻松弛从容，彰显生活美学女主人的知性温润'
      },
      {
        roleKey: 'daughter',
        seatType: 'chaise' as ChoreographySeatType,
        footrestState: undefined as ChoreographyFootrestState | undefined,
        label: '灵动纯真女儿',
        position: '贵妃位身侧软垫依偎处',
        action: '依偎在母亲身侧，双手翻阅精美绘本立体书，神情天真专注',
        reason: '紧邻母亲依偎，体现母女亲密温馨'
      },
      {
        roleKey: 'son',
        seatType: 'rug_floor' as ChoreographySeatType,
        footrestState: undefined as ChoreographyFootrestState | undefined,
        label: '机敏活泼男孩',
        position: '茶几旁羊毛厚绒地毯上',
        action: '盘腿席地而坐，专注拼装积木模型，抬头向家人展示成果',
        reason: '地毯开阔留白区，展现儿童爱探索的天性'
      }
    ];

    if (p.includes('独处') || p.includes('一人') || p.includes('阅读')) {
      theme = '静谧独享·头等舱沉浸式阅读时光';
      spatialSummary = '单人位深包覆支撑，暖光漫反射，享受零重力松弛。';
      count = 1;
    } else if (p.includes('情侣') || p.includes('夫妻') || p.includes('双人') || p.includes('二人') || p.includes('浪漫')) {
      theme = '轻奢二人世界·微醺与温馨对谈';
      spatialSummary = '主沙发双座并列，功能脚托展开，手持红酒杯闲话家常。';
      count = 2;
    } else if (p.includes('亲子') || p.includes('三口') || p.includes('四口')) {
      theme = '核心家庭·周末亲子欢乐时光';
      spatialSummary = '男女主人分坐主位与贵妃榻，孩子围绕茶几地毯互动。';
      count = 4;
    }

    const selectedTemplates = roleTemplates.slice(0, Math.min(count, roleTemplates.length));

    // 智能匹配已导入的模型资产
    const usedModelIds = new Set<string>();
    const slots: ChoreographedSlotItem[] = selectedTemplates.map((tpl, idx) => {
      // 优先根据 roleType 匹配
      let matched = availableModels.find(m => !usedModelIds.has(m.id) && m.roleType === tpl.roleKey);
      if (!matched) {
        // 次级按名称关键词模糊匹配
        matched = availableModels.find(m => !usedModelIds.has(m.id) && (
          (m.nameZh || m.name || '').includes(tpl.roleKey) ||
          (tpl.roleKey === 'grandfather' && (m.nameZh || '').includes('爷')) ||
          (tpl.roleKey === 'grandmother' && (m.nameZh || '').includes('奶')) ||
          (tpl.roleKey === 'father' && ((m.nameZh || '').includes('男') || (m.nameZh || '').includes('父'))) ||
          (tpl.roleKey === 'mother' && ((m.nameZh || '').includes('女') || (m.nameZh || '').includes('母'))) ||
          (tpl.roleKey === 'daughter' && (m.nameZh || '').includes('女')) ||
          (tpl.roleKey === 'son' && (m.nameZh || '').includes('儿'))
        ));
      }
      if (!matched && availableModels.length > 0) {
        // 兜底顺序使用
        matched = availableModels.find(m => !usedModelIds.has(m.id)) || availableModels[idx % availableModels.length];
      }

      if (matched) {
        usedModelIds.add(matched.id);
      }

      return {
        id: `slot-${idx + 1}`,
        targetRole: tpl.roleKey,
        roleLabel: matched ? (matched.nameZh || matched.name) : tpl.label,
        positionDesc: tpl.position,
        actionDesc: tpl.action,
        matchedModelId: matched?.id,
        matchedModelName: matched ? (matched.nameZh || matched.name) : tpl.label,
        matchReason: tpl.reason,
        seatType: tpl.seatType,
        footrestState: tpl.footrestState
      };
    });

    return {
      theme,
      spatialSummary,
      recommendedCount: slots.length,
      slots,
      source: 'heuristic_engine'
    };
  }
}
