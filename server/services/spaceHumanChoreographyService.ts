// server/services/spaceHumanChoreographyService.ts
// MANWAH Space Studio｜AI 多模态人物编排构思与角色资产匹配引擎 V1.0
import { z } from 'zod';
import { createServerGenAI } from '../utils/aiClient';

export const ChoreographLayoutRequestSchema = z.object({
  projectId: z.string().optional().default('manwah-space-default'),
  prompt: z.string().optional(),
  imageUrl: z.string().optional(),
  imageBase64: z.string().optional(),
  characterCount: z.number().optional(),
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
}

export interface ChoreographedLayoutResult {
  theme: string;
  spatialSummary: string;
  recommendedCount: number;
  slots: ChoreographedSlotItem[];
  source: 'ai_vision' | 'ai_prompt' | 'heuristic_engine';
}

export class SpaceHumanChoreographyService {
  /**
   * 核心方法：结合图像识别与提示词进行 AI 构思，并智能匹配角色资产库
   */
  public static async choreograph(
    input: z.input<typeof ChoreographLayoutRequestSchema>,
    userId: string = 'system'
  ): Promise<ChoreographedLayoutResult> {
    const { prompt = '', imageUrl, imageBase64, characterCount, availableModels = [] } = input;

    // 1. 尝试使用 Gemini 多模态大模型进行智能分析
    try {
      const { ai, isValidKey } = await createServerGenAI(userId);

      if (ai && isValidKey) {
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
2. 人物动作描述规范：
   - 动作必须细腻自然、充满电影感与真实家庭烟火气；
   - 严禁假人僵硬站立或突兀漂移；
   - 角色之间有自然的视线交汇、温情互动或独立松弛专注；
   - 必须结合沙发的触控按键、脚托舒展、真皮靠包等物理接触面。
3. 角色资产库匹配：
   - 给定的角色资产库如下：
${JSON.stringify(modelsSummary, null, 2)}
   - 必须根据每个人物角色的家庭定位（grandfather, grandmother, father, mother, daughter, son 等），从角色资产库中挑选最合适的一个，填入 matchedModelId 与 matchedModelName。

${prompt ? `【用户构思意图与情景描述】：${prompt}` : ''}
${characterCount ? `【期望人物数量】：${characterCount} 人` : '【人物数量建议】：根据空间座次容量与情景，合理推荐 2~6 人'}

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
      "positionDesc": "主沙发一号电动功能主座（展开脚托）",
      "actionDesc": "45°半躺于头等舱展开脚托，目光沉稳温和，右手轻搭在扶手触控面板上，安享天伦",
      "matchedModelId": "...",
      "matchedModelName": "...",
      "matchReason": "长辈气质沉稳，坐镇电动功能主位"
    }
  ]
}`;

        const contents: any[] = [{ text: systemPrompt }];

        // 如果提供了图片，注入多模态图像
        if (imageBase64) {
          let cleanBase64 = imageBase64;
          let mimeType = 'image/jpeg';
          const match = imageBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
          if (match) {
            mimeType = match[1];
            cleanBase64 = match[2];
          }
          contents.push({
            inlineData: {
              data: cleanBase64,
              mimeType
            }
          });
        }

        const modelToUse = 'gemini-2.5-flash';
        const response = await ai.models.generateContent({
          model: modelToUse,
          contents
        });

        const textOutput = response.text || '';
        const cleanedJson = textOutput
          .replace(/```json/gi, '')
          .replace(/```/g, '')
          .trim();

        const parsed = JSON.parse(cleanedJson);
        if (parsed && Array.isArray(parsed.slots) && parsed.slots.length > 0) {
          // 确保 slots 结构完整且与资产库绑定
          const slots = parsed.slots.map((s: any, idx: number) => {
            const matched = availableModels.find(m => m.id === s.matchedModelId) ||
              availableModels.find(m => m.roleType === s.targetRole) ||
              availableModels[idx % availableModels.length];

            return {
              id: s.id || `slot-${idx + 1}`,
              targetRole: s.targetRole || 'family_member',
              roleLabel: s.roleLabel || (matched?.nameZh || matched?.name || `角色 ${idx + 1}`),
              positionDesc: s.positionDesc || '沙发功能主座',
              actionDesc: s.actionDesc || '舒展就座，目光温和自然',
              matchedModelId: matched?.id || s.matchedModelId,
              matchedModelName: matched ? (matched.nameZh || matched.name) : s.matchedModelName,
              matchReason: s.matchReason || '根据家庭定位与气质契合'
            };
          });

          return {
            theme: parsed.theme || '空间人物情景编排',
            spatialSummary: parsed.spatialSummary || '基于空间家具结构与生活情景构思',
            recommendedCount: slots.length,
            slots,
            source: imageBase64 || imageUrl ? 'ai_vision' : 'ai_prompt'
          };
        }
      }
    } catch (aiErr) {
      console.warn('[SpaceHumanChoreographyService] AI model call fallback:', aiErr);
    }

    // 2. 启发式确定性高可用引擎（支持关键词与资产库深度匹配兜底）
    return this.runHeuristicChoreography(prompt, characterCount, availableModels);
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
        label: '睿智儒雅爷爷',
        position: '主沙发一号电动功能主座（展开脚托）',
        action: '45°半躺于头等舱展开脚托，目光沉稳温和，右手轻触扶手控制屏，安然自得',
        reason: '一家之主专享头等舱电动位，体现长辈尊贵舒适'
      },
      {
        roleKey: 'grandmother',
        label: '优雅慈祥奶奶',
        position: '单人真皮功能单椅',
        action: '端坐品茗，手捧白瓷盖碗，神态安详从容，展现长者风范',
        reason: '独立单人真皮单椅，品茗静思，舒适尊享'
      },
      {
        roleKey: 'father',
        label: '沉稳儒雅男主人',
        position: '主沙发中央功能位',
        action: '从容端坐，左手轻搭沙发靠背，面带微笑侧首与身旁妻子倾心交谈',
        reason: '坐镇客厅中央中枢位，兼顾与长者与妻儿沟通'
      },
      {
        roleKey: 'mother',
        label: '优雅知性女主人',
        position: '沙发贵妃榻休闲位',
        action: '身姿优雅侧倚，手捧花草茶，目光慈爱注视地毯上玩耍的孩子',
        reason: '贵妃榻松弛从容，彰显生活美学女主人的知性温润'
      },
      {
        roleKey: 'daughter',
        label: '灵动纯真女儿',
        position: '贵妃位身侧软垫依偎处',
        action: '依偎在母亲身侧，双手翻阅精美绘本立体书，神情天真专注',
        reason: '紧邻母亲依偎，体现母女亲密温馨'
      },
      {
        roleKey: 'son',
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
        matchReason: tpl.reason
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
