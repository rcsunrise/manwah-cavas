import sharp from 'sharp';
import { chatCompletionText } from './chatFallback';
import { analyzeFabric, colorNameZh, cropFabric } from './textilePoster';

/**
 * 面料色卡海报（模板 C）的文案构思：看一眼面料照片，给出面料名、一段说明、标签上的型号，
 * 以及 3 条氛围图描述（只有用户要求 AI 出氛围图时才会用到，出图要扣点）。
 * 版式是固定的（textilePoster.ts），这里只决定“内容”。
 */
export interface TextileConcept {
  /** 面料名，2~5 个字，如 苔原绒、安贝儿 */
  name: string;
  /** 说明文案，两三句，90~130 字 */
  description: string;
  /** 面料标签上的 Item No，读不出来就是空 */
  code: string;
  /** 主面料的中文色名 */
  colorName: string;
  /** 氛围图出图描述 */
  moodPrompts: string[];
}

/** 人像这张做拼贴底图，小图会叠在一侧：人物要完整、偏在画面一侧，另一侧留出背景 */
const PORTRAIT_FRAMING = '，人物完整入画（头顶到膝盖以下都在画面内，不要裁掉头部），人物站在画面左侧约三分之一处，右侧留出干净的背景空间';
const MOOD_SUFFIX = '，高级时尚杂志大片质感，细腻胶片颗粒，自然柔和光线，整体色调与面料协调，不要出现任何文字、标志、水印、边框';

function clean(value: unknown, max: number, fallback: string): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return (text || fallback).slice(0, max);
}

export function defaultMoodPrompts(colorName: string, hint?: string): string[] {
  const tone = hint?.trim() ? `，整体氛围参考：${hint.trim().slice(0, 60)}` : '';
  return [
    `欧美模特时尚大片，穿${colorName}色系的外套，造型简洁有质感，浅色建筑背景${tone}${PORTRAIT_FRAMING}${MOOD_SUFFIX}`,
    `没有人物的家居软装静物：${colorName}色系的沙发一角与陶器、干枝，侧光，安静的室内氛围${tone}${MOOD_SUFFIX}`,
    `没有人物的氛围静物：与${colorName}协调的织物褶皱、香水瓶或金属小物件，柔和光影${tone}${MOOD_SUFFIX}`
  ];
}

export function defaultTextileConcept(colorHex: string, hint?: string): TextileConcept {
  const colorName = colorNameZh(colorHex);
  return {
    name: colorName,
    description: `以${colorName}为主调，肌理细腻、层次自然，面料手感柔软亲肤，兼顾质感与耐用，适用于沙发、软包与家居软装。`,
    code: '',
    colorName,
    moodPrompts: defaultMoodPrompts(colorName, hint)
  };
}

export function sanitizeTextileConcept(raw: any, colorHex = '#888888'): TextileConcept {
  const base = defaultTextileConcept(colorHex);
  const code = typeof raw?.code === 'string' ? raw.code.trim() : '';
  const prompts = Array.isArray(raw?.moodPrompts) ? raw.moodPrompts : [];
  const colorName = clean(raw?.colorName, 12, base.colorName);
  return {
    name: clean(raw?.name, 8, base.name),
    description: clean(raw?.description, 160, base.description),
    code: /^[A-Za-z0-9][A-Za-z0-9\-_.#]{1,19}$/.test(code) ? code : '',
    colorName,
    moodPrompts: [0, 1, 2].map(i => {
      const p = clean(prompts[i], 240, '');
      return p ? `${p}${i === 0 ? PORTRAIT_FRAMING : ''}${MOOD_SUFFIX}` : defaultMoodPrompts(colorName)[i];
    })
  };
}

export function buildTextileConceptPrompt(hint?: string, current?: { name?: string }): string {
  return `你是家居面料品牌的视觉策划。图中是一块面料样品（可能带白色标签纸）。要为它做一张“面料色卡海报”：大面积面料特写 + 面料名 + 一段说明 + 同系列配色色卡 + 氛围图。
请只输出 JSON（不要说明文字）：
{
  "name": "面料名，2~4 个字，有诗意、贴合面料的颜色与肌理（如 苔原绒、星点粗花呢、安贝儿），不要带品牌名",
  "description": "说明文案 90~120 字，分两三句：先写创意来源或灵感意象，再写肌理与颜色特点，最后写手感与用途；中文，书面但不堆砌",
  "code": "如果图里有标签，读出 Item No 后面的型号（如 NH30425），读不清或没有标签就给空字符串",
  "colorName": "面料主色的中文色名，如 橄榄绿、藏青、驼色",
  "moodPrompts": [
    "欧美模特的时尚大片（人物完整、偏在画面一侧），服装与场景色调贴近面料色",
    "没有人物的家居软装静物（沙发一角、陶器、干枝），色调与面料协调",
    "没有人物的氛围静物（织物褶皱、香水瓶、金属小物件），色调与面料协调"
  ]
}
要求：颜色、肌理必须来自图中真实面料，不要编造成分、克重、幅宽这类标签里没写清的数据；说明里不要出现“海报”“色卡”这类词；每条 moodPrompts 60 字以内，不要出现品牌名、文字。${
    current?.name ? `\n面料名沿用“${current.name}”，只写说明与其他字段。` : ''
  }${hint ? `\n用户补充：${hint.slice(0, 200)}` : ''}`;
}

export async function generateTextileConcept(
  image: Buffer,
  hint: string | undefined,
  userId = 'system',
  current?: { name?: string }
): Promise<{ concept: TextileConcept; fromModel: boolean; mainColor: string }> {
  const analysis = await analyzeFabric(image);
  try {
    // 标签要读得清：给模型整张图（缩到 1280），再给一张干净面料特写看色彩肌理
    const whole = await sharp(image, { failOn: 'none' }).rotate().resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const close = await sharp(await cropFabric(image, analysis, 640, 640)).jpeg({ quality: 85 }).toBuffer();
    const { text } = await chatCompletionText({
      prompt: buildTextileConceptPrompt(hint, current),
      images: [
        { mimeType: 'image/jpeg', data: whole.toString('base64') },
        { mimeType: 'image/jpeg', data: close.toString('base64') }
      ],
      temperature: 0.7,
      userId
    });
    const match = text.replace(/```json|```/g, '').match(/\{[\s\S]*\}/);
    if (!match) throw new Error('模型没有返回 JSON');
    const concept = sanitizeTextileConcept(JSON.parse(match[0]), analysis.color);
    if (current?.name) concept.name = current.name.slice(0, 8);
    return { concept, fromModel: true, mainColor: analysis.color };
  } catch (err: any) {
    console.warn('[TextileConcept] 构思失败，改用默认文案:', err?.message || err);
    const concept = defaultTextileConcept(analysis.color, hint);
    if (current?.name) concept.name = current.name.slice(0, 8);
    return { concept, fromModel: false, mainColor: analysis.color };
  }
}
