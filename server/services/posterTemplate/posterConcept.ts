import { createServerGenAI } from '../../utils/aiClient';
import type { DetailTarget } from './detailCrop';
import type { TitleSide } from './templateA';
import { chatCompletionText } from './chatFallback';
import { findSceneDirection, namesCollide, pickSceneDirection, SceneDirection } from './sceneDirections';

/**
 * 海报概念：命名 → 意象 → 场景 / 道具 / 配色 → 细节部位 → 文案。
 * 参考海报好看的关键是整张图都在呼应名字（银弧 → 银色弧形建筑与不锈钢茶几，月弧 → 月球基地窗景），
 * 所以先单独把这条链想清楚，再拿去出图和排版。
 */

export interface PosterDetailConcept extends DetailTarget {
  /** 4–6 字，如“弧面扶手” */
  title: string;
  /** “A · B”，如“圆润包覆 · 分割缝线” */
  desc: string;
}

export interface PosterConcept {
  name: string;
  subtitle: string;
  inspiration: string;
  /** 名字背后的意象，一句话 */
  idea: string;
  /** 主场景画面描述（给生图模型） */
  scene: string;
  /** 标志性空间结构：占据画面上半部、一眼能记住的大尺度造型 */
  signature: string;
  /** 场景配色：2–3 个主色，以及它们和产品色的关系（呼应 / 对比） */
  palette: string;
  /** 远景：窗外或空间尽头看到什么 */
  vista: string;
  /** 时间与光线 */
  lighting: string;
  /** 茶几、摆件、地毯、抱枕等如何呼应命名 */
  props: string;
  /** 产品图上真实带有的包装膜 / 品牌标识（位置、颜色、图案）；图里没有就是空串，出图时据此决定保留还是不画 */
  packaging: string;
  /** 底部细节栏底色：深色场景配深色栏（如弧光的藏蓝），否则用浅色 */
  stripColor: string;
  accentColor: string;
  titleSide: TitleSide;
  details: PosterDetailConcept[];
  /** 本次采用的场景方向（见 sceneDirections.ts）；用户自己给了场景要求时为空 */
  sceneDirection?: string;
}

/** 同一产品已经出过的海报概念：新概念要避开这些命名与场景 */
export interface UsedPosterConcept {
  name: string;
  idea?: string;
  sceneDirection?: string;
}

export interface PosterConceptInput {
  dna?: any;
  /** 产品图（data URL 或纯 base64），让模型看得到真实造型 */
  productImage?: { data: string; mimeType: string };
  /** 用户补充要求，如“偏未来感”“用湖景” */
  hint?: string;
  /** 已有企划的主题或卖点，作为参考 */
  planContext?: string;
  /** 同一产品已出过的概念（旧 → 新），用于避免重名、重复场景 */
  used?: UsedPosterConcept[];
  /** 本次指定的场景方向；不传时按轮换自动选 */
  sceneDirection?: SceneDirection;
}

const CONCEPT_MODELS = ['gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.6-flash'];

const DEFAULT_DETAILS: PosterDetailConcept[] = [
  { key: 'armrest', locate: '沙发离镜头最近一侧的扶手（正面与顶部）', title: '扶手设计', desc: '饱满造型 · 圆润包覆' },
  { key: 'backrest', locate: '离镜头最近的一个座位的靠背，含缝线与分段结构', title: '分段式靠背', desc: '分区承托 · 柔和贴合' },
  { key: 'foot', locate: '沙发底部离镜头最近、清晰可见的一个沙发脚，连带一小段沙发底座', title: '沙发脚', desc: '稳固支撑 · 简洁利落' }
];

function describeDna(dna: any): string {
  if (!dna) return '（无 DNA 数据，请以产品图为准）';
  const list = (v: any) => (Array.isArray(v) ? v.map((x: any) => (typeof x === 'string' ? x : `${x?.name || ''}：${x?.description || x?.rule || ''}`)).join('；') : String(v || ''));
  return [
    `品类：${dna.subcategory || dna.category || '沙发'}`,
    `主色：${dna.primaryColor || '以图为准'}；辅色：${list(dna.secondaryColors) || '无'}`,
    `材质：${list(dna.materials) || '以图为准'}`,
    `风格：${list(dna.style) || '以图为准'}`,
    `结构特征：${list(dna.structuralFeatures) || '以图为准'}`,
    `锁定规则：${list(dna.lockedFeatures) || '无'}`
  ].join('\n');
}

export function buildConceptPrompt(input: PosterConceptInput): string {
  return `你是家具品牌的电商海报创意总监。请为下面这款产品构思一张 4:3 单屏产品主视觉海报的概念。

[产品 DNA]
${describeDna(input.dna)}
${input.productImage ? '（DNA 可能是旧的或不准：颜色、材质、结构凡与产品图不一致的，一律以产品图为准，文案里的颜色词也要按图里真实看到的颜色写。）' : ''}
${input.planContext ? `\n[已有企划参考]\n${input.planContext}\n` : ''}${input.hint ? `\n[用户要求，优先满足]\n${input.hint}\n` : ''}${
    input.sceneDirection
      ? `\n[本次场景方向（必须采用，命名、意象、道具都要和它呼应）]\n${input.sceneDirection.label}：${input.sceneDirection.brief}\n`
      : ''
  }${usedBlock(input.used)}
[版式（固定，不用你设计）]
上方是产品主场景大图，左上角（或右上角）放标题区：两字命名 + 一句副标题 + 一行灵感小字；底部一栏三格，每格是一个产品部位的真实特写 + 标题 + 一句短说明。

[怎么构思：先有名字，再让整张图呼应名字]
1. 命名：两个汉字，有画面感和情绪，从产品最突出的造型、颜色或材质出发，并和场景方向呼应。避开“云栖、栖云、云舒、暖阳”这类用滥了的词。
2. 意象：名字对应的画面意象，一句话。
3. 场景：背景是这张海报的灵魂，不能只是“一间好看的客厅”。从意象推出下面五样，缺一不可：
   - 标志性空间结构：一个大尺度、一眼能记住的造型，占据画面上半部（巨型螺旋天井、环形灯带穹顶、流动的拱形薄壳、连续拱廊、弧形全景舷窗、悬挑的崖顶露台……）。不要平墙、不要普通方盒子房间。
   - 远景：结构之外能看到的风景（云海、海面落日、城市夜景、雪山湖泊、月面与地球……），提供纵深。
   - 配色：场景 2–3 个主色，并说明和产品色是“呼应”还是“对比”。例：焦糖色沙发配铜色墙面 + 银色金属 + 蓝天（呼应 + 冷暖对比）；棕色沙发配蓝灰空间与暮色天空（对比）；黑色沙发配暖金灯光与冷白月面（明暗对比）。色彩要饱满、有主次，不要整张图一个灰调。
   - 时间与光线：明确时刻和主光方向（清晨逆光、正午天光、黄昏侧逆光、夜晚灯带与城市光），要有明暗层次和光斑、倒影、轮廓光这类光效。
   - 道具呼应：茶几的形状和材质、一件雕塑或摆件、地毯、一对同款抱枕的图案，都要和名字或结构同一套造型语言（弧形结构配弧形茶几与弧线雕塑）。
4. 标杆案例（学方法，不要照抄）：
   - 银弧：取自柔和弧面 → 弧形银色未来建筑天井、蓝天白云、不锈钢弧形茶几、弧形金属雕塑
   - 月弧：取自弧形扶手与黑色皮面 → 月球基地全景窗、远处地球、石材圆几、黑金拱形纹样抱枕
   - 昼梦：取自柔软披覆的扶手 → 流动白纱般的拱形结构、水面与云海、浅色石材平台
   - 弧光：取自弧线与皮革光泽 → 夜晚都市江景、环形灯带建筑、扭曲金属茶几
   - 湖岚：取自米白色调 → 湖畔山崖露台、晨曦薄雾、石材圆几
   - 栖谷：取自两种面料拼接 → 山谷落地窗、日落湖面、石材圆几、暖光
5. 画面分三层：前景（茶几、地毯边缘，可有少量虚化的植物或水面）、中景（沙发）、远景（标志性结构与风景）。可以大胆、可以超现实，但光影和材质要像真实摄影。
6. 标题压在画面一侧的上方：那里不要画成一面空墙，而是天空、远景或结构的大曲面，只要明暗均匀、没有密集的小物件即可。

[细节三格]
只能选产品上真实存在、图里看得见的部位（通常是扶手、靠背、沙发脚，也可以是侧面分割、金属饰条等），不要编造功能、参数、检测或材质承诺。

[输出]
只输出一个 JSON 对象，不要 Markdown、不要解释：
{
  "name": "两个汉字",
  "subtitle": "副标题，8–12 字（硬性上限 12 字，含标点），用一个逗号分成两个短句，如“柔和之间，自有锋芒”",
  "inspiration": "灵感小字，12–20 字，如“灵感源于柔和弧面与未来建筑的对话”",
  "idea": "名字对应的意象，一句话",
  "signature": "标志性空间结构，20–50 字：是什么造型、什么材质、在画面什么位置、有多大",
  "vista": "远景，15–40 字",
  "palette": "场景配色，20–50 字：2–3 个主色 + 与产品色的关系（呼应或对比）",
  "lighting": "时间与光线，20–50 字：时刻、主光方向、光效",
  "props": "道具呼应，30–70 字：茶几（形状与材质）、雕塑或摆件、地毯、一对同款抱枕的图案",
  "scene": "把上面五项连成一段完整的画面描述，180–300 字，给摄影师看。不要描述沙发本身的造型（以产品图为准），不要出现任何文字或标牌。",
  "packaging": "只看产品图：沙发上如果真实带有包装膜或品牌标识（例如底部透明包装膜上印着红蓝色品牌字样），用一句话写明位置、颜色和图案，如“沙发底部座位正面有透明包装膜，印红色飞机图标和蓝色 CHEERS 字样”；图里没有就输出空字符串 \\"\\"，不要猜、不要编",
  "stripColor": "#RRGGBB，海报底部细节栏的底色：夜景、星际等深色场景用与场景同色系的深色（如藏蓝 #14213A、炭黑 #1C1A19）；其余用暖白 #F7F3EE",
  "accentColor": "#RRGGBB，与产品主色和场景协调的点缀色，用于标题下的短横线",
  "titleSide": "left 或 right，标题放哪一侧（这一侧上方是天空、远景或结构的大曲面，明暗均匀）",
  "details": [
    {"key": "armrest", "locate": "给视觉定位用的部位描述，只指一个局部（靠背只指一个座位的靠背），如：沙发离镜头最近一侧的扶手（正面与顶部）", "title": "4–6 字，如“弧面扶手”", "desc": "两个 4 字短语用“ · ”连接，如“圆润包覆 · 分割缝线”"},
    {"key": "backrest", "locate": "...", "title": "...", "desc": "..."},
    {"key": "foot", "locate": "...", "title": "...", "desc": "..."}
  ]
}`;
}

/** 超长时在上限内最后一个标点处断开（去掉断处的逗号），没有标点才硬截，避免留下半句话 */
export function cutAtPunctuation(text: unknown, max: number, fallback = ''): string {
  const s = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (!s) return fallback;
  const chars = Array.from(s);
  if (chars.length <= max) return s;
  const head = chars.slice(0, max);
  for (let i = head.length - 1; i >= Math.floor(max / 2); i--) {
    if ('，。；！？、,.;!?'.includes(head[i])) return head.slice(0, i).join('');
  }
  return head.join('');
}

function usedBlock(used: UsedPosterConcept[] | undefined): string {
  const list = (used || []).filter(u => u?.name).slice(-8);
  if (list.length === 0) return '';
  const lines = list.map(u => {
    const dir = findSceneDirection(u.sceneDirection);
    return `- ${u.name}${dir ? `（${dir.label}）` : ''}${u.idea ? `：${u.idea}` : ''}`;
  });
  return `\n[这款产品已经做过的海报，这次必须明显不同]\n${lines.join('\n')}\n命名不能重复，也不能是同样的字换个顺序或只换一个字（做过“云栖”就不能叫“栖云”“云憩”）；意象、空间、光线和道具都要换一个思路。\n`;
}

function cut(text: unknown, max: number, fallback = ''): string {
  const s = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (!s) return fallback;
  return Array.from(s).slice(0, max).join('');
}

/** 模型输出不一定守规矩：截断超长字段、补齐细节格、颜色与方向做兜底 */
export function sanitizeConcept(raw: any): PosterConcept {
  const details: PosterDetailConcept[] = Array.isArray(raw?.details)
    ? raw.details
        .filter((d: any) => d && typeof d === 'object')
        .slice(0, 3)
        .map((d: any, i: number) => {
          const fallback = DEFAULT_DETAILS[i] || DEFAULT_DETAILS[0];
          const key = cut(d.key, 24, fallback.key).replace(/[^a-zA-Z0-9_-]/g, '') || `detail_${i + 1}`;
          return {
            key,
            locate: cut(d.locate, 60, fallback.locate),
            title: cut(d.title, 7, fallback.title),
            desc: cut(d.desc, 24, fallback.desc)
          };
        })
    : [];
  // key 重复会导致定位结果互相覆盖
  const seen = new Set<string>();
  for (const d of details) {
    if (seen.has(d.key)) d.key = `${d.key}_${seen.size + 1}`;
    seen.add(d.key);
  }
  while (details.length < 3) details.push({ ...DEFAULT_DETAILS[details.length] });

  return {
    name: cut(raw?.name, 4, '舒境'),
    subtitle: cutAtPunctuation(raw?.subtitle, 13, ''),
    inspiration: cutAtPunctuation(raw?.inspiration, 32, ''),
    idea: cut(raw?.idea, 60, ''),
    scene: cut(raw?.scene, 520, '现代简约客厅，大面积落地窗引入柔和自然光，浅色石材圆几与羊毛地毯，一对同款抱枕，整体色调温润干净。'),
    signature: cut(raw?.signature, 90, ''),
    vista: cut(raw?.vista, 70, ''),
    palette: cut(raw?.palette, 90, ''),
    lighting: cut(raw?.lighting, 90, ''),
    props: cut(raw?.props, 120, ''),
    packaging: cut(raw?.packaging, 100, ''),
    stripColor: typeof raw?.stripColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.stripColor.trim()) ? raw.stripColor.trim() : '#F7F3EE',
    accentColor: typeof raw?.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.accentColor.trim()) ? raw.accentColor.trim() : '#A8743F',
    titleSide: raw?.titleSide === 'right' ? 'right' : 'left',
    details,
    sceneDirection: findSceneDirection(raw?.sceneDirection)?.id
  };
}

export async function generatePosterConcept(input: PosterConceptInput, userId = 'system'): Promise<PosterConcept> {
  const { ai, isValidKey } = await createServerGenAI(userId);
  if (!ai || !isValidKey) throw new Error('POSTER_CONCEPT_UNAVAILABLE: 未配置可用的模型凭据');

  // 用户自己提了场景要求时不强加方向；否则按这款产品用过的方向轮换
  const used = (input.used || []).filter(u => u && typeof u.name === 'string' && u.name.trim());
  const direction =
    input.sceneDirection ||
    (input.hint ? undefined : pickSceneDirection(used.map(u => u.sceneDirection).filter((x): x is string => Boolean(x))));

  const imageParts: any[] = input.productImage?.data
    ? [{ inlineData: { mimeType: input.productImage.mimeType || 'image/jpeg', data: input.productImage.data.replace(/^data:[^;]+;base64,/, '') } }]
    : [];

  let lastErr: any = null;
  let collided: PosterConcept | null = null;
  // 撞名时把撞到的名字也列进“已做过”再试一次；仍撞名就接受，不让整个流程失败
  for (let attempt = 0; attempt < 2; attempt++) {
    const avoid = collided ? [...used, { name: collided.name, idea: collided.idea, sceneDirection: collided.sceneDirection }] : used;
    const parts = [...imageParts, { text: buildConceptPrompt({ ...input, used: avoid, sceneDirection: direction }) }];
    let concept: PosterConcept | null = null;
    for (const model of CONCEPT_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts }],
          config: { temperature: 1, responseMimeType: 'application/json' }
        });
        const text = String(response.text || '').replace(/```json|```/g, '');
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('模型未返回 JSON');
        concept = sanitizeConcept(JSON.parse(match[0]));
        break;
      } catch (err: any) {
        lastErr = err;
        console.warn(`[PosterConcept] ${model} 生成海报概念失败:`, err?.message || err);
        // 通道不可用 / 网络不通时不再逐个等超时，直接走对话模型兜底
        if (/model_not_found|no available channel|unknown provider|fetch failed/i.test(String(err?.message || err))) break;
      }
    }
    if (!concept) {
      // gemini 原生通道全部不可用时，改走 chat/completions 的对话模型
      try {
        const fb = await chatCompletionText({
          prompt: buildConceptPrompt({ ...input, used: avoid, sceneDirection: direction }),
          images: input.productImage?.data
            ? [{ mimeType: input.productImage.mimeType || 'image/jpeg', data: input.productImage.data.replace(/^data:[^;]+;base64,/, '') }]
            : [],
          temperature: 1,
          userId
        });
        const m = fb.text.replace(/```json|```/g, '').match(/\{[\s\S]*\}/);
        if (!m) throw new Error('模型未返回 JSON');
        concept = sanitizeConcept(JSON.parse(m[0]));
        console.info(`[PosterConcept] gemini 通道不可用，已改用 ${fb.model} 生成概念`);
      } catch (fbErr: any) {
        lastErr = fbErr;
      }
    }
    if (!concept) break;
    concept.sceneDirection = direction?.id;
    const clash = avoid.find(u => namesCollide(u.name, concept!.name));
    if (!clash) return concept;
    console.warn(`[PosterConcept] 命名「${concept.name}」与已做过的「${clash.name}」重复，重新构思`);
    collided = concept;
  }
  if (collided) return collided;
  throw new Error(`POSTER_CONCEPT_FAILED: ${lastErr?.message || '模型未返回可用结果'}`);
}

/** 模板 A 主场景的出图提示词：只画主场景，给标题留白，不画文字和细节小窗 */
export function buildTemplateAHeroPrompt(concept: PosterConcept, dna?: any): string {
  const side = concept.titleSide === 'right' ? '右' : '左';
  const other = concept.titleSide === 'right' ? '左' : '右';
  const dnaLines: string[] = [];
  if (dna?.primaryColor) dnaLines.push(`主色：${dna.primaryColor}`);
  if (Array.isArray(dna?.materials) && dna.materials.length) dnaLines.push(`材质：${dna.materials.join('、')}`);
  if (Array.isArray(dna?.structuralFeatures) && dna.structuralFeatures.length) {
    dnaLines.push(`结构：${dna.structuralFeatures.map((f: any) => (typeof f === 'string' ? f : `${f?.name || ''}：${f?.description || ''}`)).join('；')}`);
  }
  if (Array.isArray(dna?.lockedFeatures) && dna.lockedFeatures.length) {
    dnaLines.push(`锁定：${dna.lockedFeatures.map((f: any) => (typeof f === 'string' ? f : `${f?.name || ''}（${f?.rule || ''}）`)).join('；')}`);
  }

  const sceneLines = [
    concept.signature ? `标志性空间结构：${concept.signature}` : '',
    concept.vista ? `远景：${concept.vista}` : '',
    concept.palette ? `配色：${concept.palette}` : '',
    concept.lighting ? `光线：${concept.lighting}` : '',
    concept.props ? `道具：${concept.props}` : ''
  ].filter(Boolean);

  return `高端家具品牌商业海报的主场景摄影，主题「${concept.name}」：${concept.idea}

[场景]
${concept.scene}
${sceneLines.length ? '\n' + sceneLines.join('\n') + '\n' : ''}
[背景是这张图的重点]
背景不能是一面平墙或普通房间：标志性空间结构要大、要占据画面上半部，并向远处延伸出纵深；结构之外能看到远景。
画面分三层：前景（茶几与地毯，可有少量虚化的植物、水面或台阶）、中景（沙发）、远景（结构与风景）。
色彩饱满、有主次和冷暖或明暗对比，不要整张图一个灰调；光线有方向、有层次，带光斑、倒影或轮廓光。

[构图]
横幅 16:9，广角镜头（约 24–28mm）、机位略低，空间显得开阔高大。
参考图中的沙发是画面唯一主角，三分之四侧前方视角，整体完整入画、不裁切，位于画面中部略偏${other}，宽度约占画面的 50%–58%；沙发顶部不高于画面高度的 42%，底边在 72%–80% 处，上方留出足够的空间展示结构与远景。前方有茶几，沙发下有地毯，沙发上摆一对同款抱枕。
画面${side}上方（约画面宽度 40%、高度 40% 的区域）后期要排版标题：这里是天空、远景或结构的大曲面，明暗均匀，不放植物、树枝、灯具、密集的小物件和强高光点（植物只能放在画面另一侧或前景角落）；但不要画成一面空墙。
商业中画幅相机质感，材质和光影像真实摄影。

[产品一致性，最重要]
沙发必须与参考图完全一致：造型、扶手、靠背分段与拉点、缝线走向、脚型、面料质感和颜色都不能改。
${dnaLines.length ? dnaLines.join('\n') + '\n' : ''}${
    concept.packaging
      ? `参考图里的产品自带包装膜与品牌标识（${concept.packaging}）：这是产品的一部分，必须原样保留——位置、大小、颜色、图案都和参考图一致，标识按原样画出，不要改字、不要重排字母、不要虚化掉。除此之外的保护膜、贴纸、吊牌仍然去掉。`
      : '参考图里的产品没有包装膜和品牌标识：不要给沙发添加任何包装膜、贴纸、标签、吊牌或 Logo；参考图里若有保护膜、贴纸、吊牌，一律去掉。'
  }

[禁止]
${
    concept.packaging
      ? '除沙发上原有的包装标识外，画面里不要出现任何文字、字母、数字、Logo、水印；'
      : '画面里不要出现任何文字、字母、数字、Logo、水印；'
  }不要拼图、分格、画中画、细节小窗或边框，只要一张完整的场景照片。`;
}
