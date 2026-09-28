import { DetailPageScreenPlan } from '../../src/types';

export const DETAIL_PLAN_INSTRUCTIONS = `你是一名国际顶级家居与家具电商品牌的首席视觉策划导演与艺术总监。
你的任务是根据产品视觉 DNA、用户输入的企划方向、风格参考图及参考企划文档，为品牌策划一套兼具艺术感染力与爆款商业转化的详情页全案分屏计划。

【策划核心指令与美学导向】
1. **打破固化套路，拒绝机械陈词**：
   - 严禁输出千篇一律、枯燥刻板的套路文案。必须根据产品的独特造型（如扶手倾角、背靠拉皱拉点工艺、方形/金属沙发脚、面料肌理）和用户企划方向定制有灵魂的标题与构图。
2. **电影级空间美学与光影层次**：
   - 构图视角需兼顾艺术感与空间纵深（电影级远景、富含故事感的中景、微距质感特写、解构透视图）。
   - 场景色调要与产品主色调调和，营造高雅温润、自然光影溢出的家居氛围。
3. **关键细节与品类解构标注**：
   - 企划中需涵盖家具的核心设计解析（例如：扶手饱满弧线、拉皱背靠人体工学支撑、方形沙发脚稳固美学等），并注重软装搭衬（如沙发上陈列两只款式相同且带有细腻图案的靠枕）。
4. **主图与视觉排版**：
   - 为首屏或重点分屏策划醒目的中文主标题、设计灵感来源（如自然褶皱、几何包豪斯、建筑线形等）、调性色盘与高级排版建议。

【输出规则】
- 忠实保留产品实际结构与锁定规则，不虚构未确认的检测报告或年限。
- 输出必须完全符合指定的 JSON Schema，确保 JSON 结构无缝可解析。`;

export const getDetailPlanSchema = (count: number) => ({
  type: 'object',
  additionalProperties: false,
  properties: {
    themeTitle: { type: 'string' },
    targetAudience: { type: 'string' },
    overallStyle: { type: 'string' },
    screens: {
      type: 'array',
      minItems: count,
      maxItems: count,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          screenIndex: { type: 'integer', minimum: 1, maximum: count },
          screenTitle: { type: 'string' },
          coreSellingPoint: { type: 'string' },
          visualComposition: { type: 'string' },
          lightingAndAtmosphere: { type: 'string' },
          promptSuggestion: { type: 'string' },
          aspectRatio: { type: 'string' },
          lockedRules: { type: 'array', items: { type: 'string' } }
        },
        required: [
          'screenIndex',
          'screenTitle',
          'coreSellingPoint',
          'visualComposition',
          'lightingAndAtmosphere',
          'promptSuggestion',
          'aspectRatio',
          'lockedRules'
        ]
      }
    }
  },
  required: ['themeTitle', 'targetAudience', 'overallStyle', 'screens']
} as const);

export function parseStructuredDetailPlan(text: string, count: number): {
  themeTitle: string;
  targetAudience: string;
  overallStyle: string;
  screens: DetailPageScreenPlan[];
} {
  let parsed: any;
  let cleanText = (text || '').trim();
  if (cleanText.startsWith('```')) {
    cleanText = cleanText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  try {
    parsed = JSON.parse(cleanText);
  } catch {
    throw new TypeError('模型返回的企划计划不是有效 JSON。');
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.screens) || parsed.screens.length !== count) {
    throw new TypeError(`模型返回的计划必须恰好包含 ${count} 个分屏。`);
  }

  const indexes = new Set<number>();
  for (const screen of parsed.screens) {
    const index = Number(screen?.screenIndex);
    if (!Number.isInteger(index) || index < 1 || index > count || indexes.has(index)) {
      throw new TypeError(`企划计划的 screenIndex 必须为不重复的 1–${count}。`);
    }
    indexes.add(index);
    for (const key of [
      'screenTitle',
      'coreSellingPoint',
      'visualComposition',
      'lightingAndAtmosphere',
      'promptSuggestion',
      'aspectRatio'
    ]) {
      if (typeof screen[key] !== 'string' || !screen[key].trim()) {
        throw new TypeError(`企划计划字段 ${key} 不能为空。`);
      }
    }
    if (!Array.isArray(screen.lockedRules) || screen.lockedRules.some((rule: unknown) => typeof rule !== 'string')) {
      throw new TypeError('企划计划 lockedRules 必须为字符串数组。');
    }
  }
  parsed.screens.sort((a: any, b: any) => a.screenIndex - b.screenIndex);
  return parsed;
}
