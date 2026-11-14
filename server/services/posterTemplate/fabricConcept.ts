import sharp from 'sharp';
import { chatCompletionText } from './chatFallback';

/**
 * 沙发面料海报（模板 B）的构思：
 * 看一眼沙发图，给出皮革色、抱枕图案，以及 4 张与沙发色系协调的氛围照的出图描述。
 * 版式是固定的（参考图 1、2），这里只决定“内容”，不决定位置。
 */
export interface FabricMoodShot {
  key: 'tall' | 'closeup' | 'ambient' | 'street';
  prompt: string;
}

export interface FabricDetailTarget {
  key: string;
  locate: string;
}

export interface FabricDirection {
  id: string;
  label: string;
  /** 出图描述的种子，写进该格氛围照的提示词里 */
  seed: string;
}

export interface FabricConcept {
  /** 本次用到的氛围照方向，用于下次避开已出过的（同一沙发连出几张不重样） */
  tags?: { scene: FabricDirection; portrait: FabricDirection; street: FabricDirection };
  /** 皮革主色，如 #D9B99B */
  leatherColor: string;
  /** 色名，用在抱枕/氛围照的描述里，如 浅牛油果绿 */
  leatherName: string;
  /** 抱枕图案描述 */
  pillowPattern: string;
  moodShots: FabricMoodShot[];
  /** 两个圆形细节特写 */
  details: FabricDetailTarget[];
  /** 皮革色卡取样位置 */
  swatchLocate: string;
}

export const SCENE_DIRECTIONS: FabricDirection[] = [
  { id: 'sunset-coast', label: '落日海岸', seed: '落日时分的海岸沙滩，暖橙色天光与波光，竖幅风景大片，没有人物' },
  { id: 'warm-lamps', label: '暖光灯具', seed: '深色背景下点亮的暖色褶皱纸灯球，暖橙光晕的氛围静物，没有人物' },
  { id: 'light-wall', label: '光影墙面', seed: '斑驳树影洒在暖色墙面上的安静光影特写，没有人物' },
  { id: 'floral-still', label: '花艺静物', seed: '陶瓶中的干枝与花放在木质边几上，侧光静物，没有人物' },
  { id: 'cafe-corner', label: '咖啡馆一角', seed: '窗边小圆桌、咖啡杯与报纸，暖调午后光线，没有人物' },
  { id: 'arcade', label: '建筑拱廊', seed: '暖色石材拱廊的光影与透视，空无一人的建筑摄影' },
  { id: 'textile-detail', label: '织物肌理', seed: '亚麻与羊毛织物的褶皱特写，柔和侧光，材质静物，没有人物' },
  { id: 'forest-light', label: '林间光束', seed: '清晨林间穿过树叶的光束与薄雾，无人风景' }
];

export const PORTRAIT_SETTINGS: FabricDirection[] = [
  { id: 'stone-wall', label: '石墙靠拍', seed: '侧身靠在暖色石材墙边' },
  { id: 'window', label: '窗边侧光', seed: '站在落地窗边，柔和侧光' },
  { id: 'staircase', label: '弧形楼梯', seed: '倚着弧形楼梯的扶手' },
  { id: 'courtyard', label: '植物庭院', seed: '站在有绿植的庭院里' },
  { id: 'gallery', label: '极简画廊', seed: '站在极简的白墙画廊里' }
];

export const STREET_SETTINGS: FabricDirection[] = [
  { id: 'fruit-stall', label: '水果摊', seed: '秋日街头水果摊前低头看报纸' },
  { id: 'crosswalk', label: '老城斑马线', seed: '走过老城区的斑马线' },
  { id: 'bookstore', label: '书店门口', seed: '在街角书店门口翻看一本书' },
  { id: 'flower-market', label: '花市', seed: '在花市里挑选花束' },
  { id: 'cafe-street', label: '街边咖啡座', seed: '在街边露天咖啡座旁' }
];

function pickFrom(pool: FabricDirection[], used: string[], random: () => number): FabricDirection {
  const fresh = pool.filter(d => !used.includes(d.id));
  const list = fresh.length > 0 ? fresh : pool; // 全用过了就重新开始
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

/** 为一张新海报挑三个方向（场景图、人像背景、街拍），避开同一沙发已出过的 */
export function pickDirections(used: string[] = [], random: () => number = Math.random): NonNullable<FabricConcept['tags']> {
  return {
    scene: pickFrom(SCENE_DIRECTIONS, used, random),
    portrait: pickFrom(PORTRAIT_SETTINGS, used, random),
    street: pickFrom(STREET_SETTINGS, used, random)
  };
}

export const MOOD_SHOT_ORDER: FabricMoodShot['key'][] = ['tall', 'closeup', 'ambient', 'street'];

const HEX = /^#[0-9a-fA-F]{6}$/;

const DEFAULT_DETAILS: FabricDetailTarget[] = [
  { key: 'detail1', locate: '沙发一侧的扶手及侧面结构（如有电动控制按钮或金属装饰条，要包含进来）' },
  { key: 'detail2', locate: '沙发脚与底部边缘的缝线转角（要看到沙发脚和皮面缝线）' }
];
const DEFAULT_SWATCH = '沙发座垫或靠背上一块平整、光线均匀、无缝线无褶皱的皮革表面（只框很小一块纯皮革）';

const MOOD_SUFFIX = '，高级时尚杂志大片质感，细腻胶片颗粒，自然柔和光线，整体色调与沙发协调，不要出现任何文字、标志、水印、边框';

function cleanText(value: unknown, max: number, fallback: string): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return (text || fallback).slice(0, max);
}

/** 取沙发图中间区域的平均色，作为模型没返回可用色值时的皮革主色 */
export async function dominantHex(image: Buffer): Promise<string> {
  try {
    const meta = await sharp(image, { failOn: 'none' }).rotate().metadata();
    const w = meta.autoOrient?.width || meta.width || 0;
    const h = meta.autoOrient?.height || meta.height || 0;
    if (!w || !h) return '#C9B8A3';
    const { data } = await sharp(image, { failOn: 'none' })
      .rotate()
      .extract({ left: Math.round(w * 0.35), top: Math.round(h * 0.4), width: Math.max(1, Math.round(w * 0.3)), height: Math.max(1, Math.round(h * 0.25)) })
      .resize(1, 1)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return `#${[data[0], data[1], data[2]].map(v => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  } catch {
    return '#C9B8A3';
  }
}

export function defaultFabricConcept(color: string, hint?: string, directions: NonNullable<FabricConcept['tags']> = pickDirections()): FabricConcept {
  const tone = hint?.trim() ? `，整体氛围参考：${hint.trim().slice(0, 60)}` : '';
  return {
    tags: directions,
    leatherColor: color,
    leatherName: '与沙发同色系',
    pillowPattern: '大圆与半圆拼接的复古几何图案，使用沙发同色系的深浅两种颜色加奶白色，图案单元重复排布、对比鲜明',
    moodShots: [
      { key: 'tall', prompt: `欧美模特的半身时尚大片，竖幅，${directions.portrait.seed}，穿与沙发同色系的外套，佩戴金色首饰${tone}${MOOD_SUFFIX}` },
      { key: 'closeup', prompt: `欧美女模特的面部与肩部特写，手指轻触嘴唇，戴耳环和戒指，穿与沙发同色系的西装外套，暖色石墙背景${tone}${MOOD_SUFFIX}` },
      { key: 'ambient', prompt: `${directions.scene.seed}，色调与沙发协调${tone}${MOOD_SUFFIX}` },
      { key: 'street', prompt: `欧美模特的生活方式街拍，${directions.street.seed}，穿与沙发同色系的风衣或外套${tone}${MOOD_SUFFIX}` }
    ],
    details: DEFAULT_DETAILS,
    swatchLocate: DEFAULT_SWATCH
  };
}

export function sanitizeFabricConcept(raw: any, fallbackColor = '#C9B8A3'): FabricConcept {
  const base = defaultFabricConcept(HEX.test(String(raw?.leatherColor || '')) ? String(raw.leatherColor).toUpperCase() : fallbackColor);
  const shots = Array.isArray(raw?.moodShots) ? raw.moodShots : [];
  const moodShots = MOOD_SHOT_ORDER.map((key, i) => {
    const found = shots.find((s: any) => s?.key === key) || shots[i];
    const prompt = cleanText(found?.prompt, 260, '');
    // 场景图是配角：不能出现人，也不能出现沙发等大件家具，否则会和海报主角打架
    const noClash = key === 'ambient' ? '，画面里不出现沙发、座椅等大件家具，也不出现人物' : '';
    return { key, prompt: prompt ? `${prompt}${noClash}${MOOD_SUFFIX}` : base.moodShots[i].prompt };
  });
  const rawDetails = Array.isArray(raw?.details) ? raw.details : [];
  const details = DEFAULT_DETAILS.map((d, i) => ({
    key: d.key,
    locate: cleanText(rawDetails[i]?.locate, 120, d.locate)
  }));
  const tag = (v: any, fb: FabricDirection): FabricDirection =>
    v && typeof v.id === 'string' && typeof v.label === 'string'
      ? { id: v.id.slice(0, 24), label: v.label.slice(0, 24), seed: typeof v.seed === 'string' ? v.seed.slice(0, 120) : fb.seed }
      : fb;
  const rawTags = raw?.tags;
  const tags = rawTags ? { scene: tag(rawTags.scene, base.tags!.scene), portrait: tag(rawTags.portrait, base.tags!.portrait), street: tag(rawTags.street, base.tags!.street) } : undefined;
  return {
    ...(tags ? { tags } : {}),
    leatherColor: base.leatherColor,
    leatherName: cleanText(raw?.leatherName, 20, base.leatherName),
    pillowPattern: cleanText(raw?.pillowPattern, 120, base.pillowPattern),
    moodShots,
    details,
    swatchLocate: cleanText(raw?.swatchLocate, 120, DEFAULT_SWATCH)
  };
}

export function buildFabricConceptPrompt(hint?: string, directions?: FabricConcept['tags']): string {
  const dir = directions
    ? `
本次三个氛围照的方向已经定好，请照此展开，不要换成别的：
- tall（大人像）：${directions.portrait.label}——${directions.portrait.seed}
- ambient（场景图）：${directions.scene.label}——${directions.scene.seed}
- street（街拍）：${directions.street.label}——${directions.street.seed}
- closeup（特写）：自由发挥，但人物形象与 tall 不同。`
    : '';
  return `你是家具品牌的视觉策划。图中是一件沙发产品。要为它做一张“沙发面料海报”：左侧是沙发和两个同色系抱枕，右侧是 4 张与沙发配色协调的时尚氛围照，底部是 2 个圆形细节特写和 2 块面料色卡。
请只输出 JSON（不要说明文字），字段如下：
{
  "leatherColor": "沙发皮革主色，#RRGGBB",
  "leatherName": "中文色名，如 浅灰、焦糖橘、燕麦米",
  "pillowPattern": "抱枕图案描述（一句话）：几何图案，由重复的小单元铺满（单元尺寸约为抱枕宽度的四分之一），对比鲜明，配色取沙发同色系的深浅加奶白，不要写字",
  "moodShots": [
    {"key": "tall", "prompt": "欧美女模特竖幅半身时尚大片，靠着石墙或建筑，服装与场景色调贴近沙发色，要有金饰、耳环这类造型细节"},
    {"key": "closeup", "prompt": "欧美女模特面部与肩部特写，姿态自然，服装色与沙发协调，有耳环或戒指"},
    {"key": "ambient", "prompt": "没有人物的氛围场景图（落日海岸、暖光灯具、光影斑驳的墙面一角等），暖色调，画面里不能出现人，和人像照形成差别"},
    {"key": "street", "prompt": "欧美女模特的生活方式街拍，服装与场景色调协调"}
  ],
  "details": [
    {"key": "detail1", "locate": "沙发上最有特点的一处结构（如带按钮的扶手、金属饰条），描述要能让视觉模型在图上框出来"},
    {"key": "detail2", "locate": "沙发脚与皮面缝线的转角"}
  ],
  "swatchLocate": "一块平整无缝线的皮革表面位置描述"
}
要求：四条 moodShots 的人物、场景互不重复；人物写“欧美模特”，每次的发型、年龄感、性别尽量不一样，不必都是长发女性（用户补充里有要求时以用户为准），风格是高级时尚杂志大片，不要写成棚拍证件照；ambient 一条必须是没有任何人物的场景或静物（风景、灯具、光影），不能出现人，也不能出现沙发、座椅等家具（室内场景只写灯具、光影、器物这类局部）；描述里不要出现品牌名、文字、水印；每条 60 字以内；颜色要真实来自图中沙发，不要编造。${dir}${hint ? `\n用户补充：${hint.slice(0, 200)}` : ''}`;
}

export async function generateFabricConcept(
  image: Buffer,
  hint: string | undefined,
  userId = 'system',
  used: string[] = []
): Promise<{ concept: FabricConcept; fromModel: boolean }> {
  const color = await dominantHex(image);
  const directions = pickDirections(used);
  try {
    const small = await sharp(image, { failOn: 'none' }).rotate().resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const { text } = await chatCompletionText({
      prompt: buildFabricConceptPrompt(hint, directions),
      images: [{ mimeType: 'image/jpeg', data: small.toString('base64') }],
      temperature: 0.6,
      userId
    });
    const match = text.replace(/```json|```/g, '').match(/\{[\s\S]*\}/);
    if (!match) throw new Error('模型没有返回 JSON');
    return { concept: { ...sanitizeFabricConcept(JSON.parse(match[0]), color), tags: directions }, fromModel: true };
  } catch (err: any) {
    console.warn('[FabricConcept] 构思失败，改用默认方案:', err?.message || err);
    return { concept: defaultFabricConcept(color, hint, directions), fromModel: false };
  }
}

export const FABRIC_SOFA_PROMPT =
  '保持图中这件沙发的造型、尺寸比例、颜色、皮革质感、缝线、扶手细节和沙发脚完全不变，保持当前的拍摄视角；' +
  '把背景（墙面、地面、插座、线缆、地面污渍）全部去掉，换成纯白色 #FFFFFF 背景；沙发完整入画，四周留出白边；背景必须是纯净的纯白，不要任何地面阴影、倒影、反光或渐变；' +
  '不要添加任何其他物品、文字或水印，不要给沙发换色或改款。';

export function buildFabricPillowPrompt(concept: FabricConcept): string {
  return (
    `两个方形抱枕，同款，一前一后大幅重叠（前面的抱枕遮住后面那个的一半，后面的只露出右侧约一半），并略微倾斜，产品摄影；图案：${concept.pillowPattern}，图案由重复单元整面铺满、边缘清晰、对比鲜明；` +
    `配色与${concept.leatherName}（${concept.leatherColor}）的皮革沙发协调；面料有细腻的织物或皮革质感；` +
    '纯白色 #FFFFFF 背景，柔和棚拍光，抱枕完整入画，四周留白；不要文字、不要水印、不要其他物品。'
  );
}
