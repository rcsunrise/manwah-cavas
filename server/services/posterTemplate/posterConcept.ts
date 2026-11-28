import { createServerGenAI } from '../../utils/aiClient';
import type { DetailTarget } from './detailCrop';
import type { TitleSide } from './templateA';
import { chatCompletionText } from './chatFallback';
import { findSceneDirection, namesCollide, pickSceneCandidates, SceneDirection } from './sceneDirections';
import { CreativeAngle, findCreativeAngle, pickCreativeAngle } from './creativeAngles';
import { coffeeTableCandidatesRule, coffeeTableRule, CoffeeTableStyle, findCoffeeTableStyle, pickCoffeeTableCandidates } from './coffeeTables';
import { CatalogCoffeeTable, catalogCandidatesRule, catalogTableHeroRule, CoffeeTableSeries, findCatalogTable } from './coffeeTableCatalog';


/** 抱枕颜色要和沙发区分开：同色同明度的抱枕会和沙发糊成一片，看不出层次 */
export const PILLOW_RULE =
  '一对同款带图案的抱枕，颜色必须和沙发面料明显区分开（不要和沙发同色系、同明度），用和场景配色呼应的点缀色或对比色，如米白、燕麦、驼色、焦糖、陶土、雾蓝、墨绿与金色等，图案清晰（几何、线条、植物纹等）；和沙发放在一起要协调、有层次。';
/**
 * 海报概念：命名 → 意象 → 场景 / 道具 / 配色 → 细节部位 → 文案。
 * 参考海报好看的关键是整张图都在呼应名字（银弧 → 银色弧形建筑与不锈钢茶几，月弧 → 月球基地窗景），
 * 所以先单独把这条链想清楚，再拿去出图和排版。
 */

export interface PosterDetailConcept extends DetailTarget {
  /** 4–6 字，如“弧面扶手” */
  title: string;
  /** “A · B”，如“圆润包覆 · 分割缝线”；用户给了设计要求时可以是一两句更详细的工艺解读 */
  desc: string;
  /** 用户附图里拍的就是这个部位时，填附图序号（从 1 起）：细节格直接用这张实拍，不从生成图里裁 */
  photo?: number;
}

/** 用户随消息附的图各自是什么：detail=产品局部实拍，product=同款整图其他角度，scene=参考海报/场景图 */
export type AttachmentRole = 'detail' | 'product' | 'scene' | 'ignore';

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
  /** 本次采用的场景方向（见 sceneDirections.ts），由模型从候选里按卖点挑选 */
  /** 本次茶几：文字款式库的 id（见 coffeeTables.ts），或产品选了配套系列时素材库里的真实商品 ct-商品编码（见 coffeeTableCatalog.ts） */
  tableStyle?: string;
  sceneDirection?: string;
  /** 本次创意切入角度（见 creativeAngles.ts） */
  angle?: string;
  /** 这张海报围绕的产品卖点，一句话 */
  sellingPoint?: string;
  /** 画面的主要视觉元素（3–5 个名词），给下一张避免重复 */
  keyElements?: string[];
  /** 产品图里功能位是打开的（脚踏伸出 / 靠背后仰 / 头枕升起） */
  functionOpen?: boolean;
  /** 画面里的人物（功能位打开时安排一位在使用）；没有人物为空串 */
  person?: string;
  /** 用户附图的角色，顺序与附图一致 */
  attachmentRoles?: AttachmentRole[];
}

/** 同一产品已经出过的海报概念：新概念要避开这些命名、角度、卖点与视觉元素 */
export interface UsedPosterConcept {
  name: string;
  idea?: string;
  tableStyle?: string;
  sceneDirection?: string;
  angle?: string;
  sellingPoint?: string;
  keyElements?: string[];
}

export interface PosterConceptInput {
  dna?: any;
  /** 产品图（data URL 或纯 base64），让模型看得到真实造型 */
  productImage?: { data: string; mimeType: string };
  /** 用户给的参考海报 / 参考图：场景、光线、配色、氛围按它来，版式仍按 4/3 固定版式 */
  referenceImage?: { data: string; mimeType: string };
  /** 用户随消息附的图（产品局部实拍、其他角度、参考图都可能），由模型逐张判断用途 */
  attachments?: Array<{ data: string; mimeType: string }>;
  /** 用户补充要求，如“偏未来感”“用湖景” */
  hint?: string;
  /** 已有企划的主题或卖点，作为参考 */
  planContext?: string;
  /** 同一产品已出过的概念（旧 → 新），用于避免重名、重复场景 */
  used?: UsedPosterConcept[];
  /** 本次指定的场景方向（指定了就只用它） */
  sceneDirection?: SceneDirection;
  /** 本次茶几款式；不传时按这款产品用过的款式轮换（用户要求里提到茶几时不强加） */
  tableStyle?: CoffeeTableStyle;
  /** 给模型挑的茶几候选（按场景配色挑一款）；指定了 tableStyle 时不用 */
  tableCandidates?: CoffeeTableStyle[];
  /** 产品节点选了茶几配套系列：从这个系列的真实茶几里挑（sheet 是带编号的目录图），优先于 tableStyle / tableCandidates */
  tableCatalog?: { series: CoffeeTableSeries; items: CatalogCoffeeTable[]; sheet: { data: string; mimeType: string } };
  /** 给模型挑选的候选场景方向（不同类别）；不传时按轮换自动选 */
  sceneCandidates?: SceneDirection[];
  /** 本次创意切入角度；不传时按轮换自动选 */
  angle?: CreativeAngle;
  /** 底部细节格数（3–6），默认 3 */
  detailCount?: number;
  /** attachments 里前几张是用户在产品节点“细节图”窗口上传的细节实拍 */
  detailPhotoCount?: number;
  /** 用户在产品节点里录入的文案：原样使用，没录入的部分才由模型写 */
  fixedCopy?: PosterFixedCopy;
}

/**
 * 用户在产品节点录入的海报文案（上传素材时一起填）。原样上海报，不改写；空着的由模型按规则写。
 * photoDetails 按细节实拍的序号（与 attachments 前 detailPhotoCount 张一一对应）；
 * otherDetails 给没有实拍、由主场景裁切的格子，按顺序用。
 */
export interface PosterFixedCopy {
  name?: string;
  subtitle?: string;
  inspiration?: string;
  photoDetails?: Array<{ photo: number; title?: string; desc?: string }>;
  otherDetails?: Array<{ title?: string; desc?: string }>;
}

const FIXED_LIMITS = { name: 4, subtitle: 16, inspiration: 32, title: 7, desc: 40 };

/** 清洗前端传来的录入文案：去空白、截上限、丢掉空项 */
export function sanitizeFixedCopy(raw: any): PosterFixedCopy | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const t = (v: unknown, max: number) => (typeof v === 'string' ? Array.from(v.replace(/\s+/g, ' ').trim()).slice(0, max).join('') : '');
  const pair = (d: any) => ({ title: t(d?.title, FIXED_LIMITS.title), desc: t(d?.desc, FIXED_LIMITS.desc) });
  const out: PosterFixedCopy = {};
  const name = t(raw.name, FIXED_LIMITS.name);
  const subtitle = t(raw.subtitle, FIXED_LIMITS.subtitle);
  const inspiration = t(raw.inspiration, FIXED_LIMITS.inspiration);
  if (name) out.name = name;
  if (subtitle) out.subtitle = subtitle;
  if (inspiration) out.inspiration = inspiration;
  const photoDetails = (Array.isArray(raw.photoDetails) ? raw.photoDetails : [])
    .map((d: any) => ({ photo: Math.round(Number(d?.photo)), ...pair(d) }))
    .filter((d: any) => d.photo >= 1 && d.photo <= MAX_DETAIL_CELLS && (d.title || d.desc))
    .slice(0, MAX_DETAIL_CELLS);
  const otherDetails = (Array.isArray(raw.otherDetails) ? raw.otherDetails : []).map(pair).filter((d: any) => d.title || d.desc).slice(0, MAX_DETAIL_CELLS);
  if (photoDetails.length) out.photoDetails = photoDetails;
  if (otherDetails.length) out.otherDetails = otherDetails;
  return Object.keys(out).length ? out : undefined;
}

/**
 * 把录入文案盖到模型结果上（模型偶尔会改写，这里兜底保证原样）。
 * 实拍格按 details[].photo 对应；模型没给 photo 时，前 detailPhotoCount 格按顺序当实拍格。
 */
export function applyFixedCopy(concept: PosterConcept, fixed: PosterFixedCopy | undefined, detailPhotoCount = 0): void {
  if (!fixed) return;
  if (fixed.name) concept.name = fixed.name;
  if (fixed.subtitle) concept.subtitle = fixed.subtitle;
  if (fixed.inspiration) concept.inspiration = fixed.inspiration;
  const byPhoto = new Map((fixed.photoDetails || []).map(d => [d.photo, d]));
  const others = [...(fixed.otherDetails || [])];
  concept.details.forEach((d, i) => {
    const photo = d.photo || (i < detailPhotoCount ? i + 1 : 0);
    const copy = photo ? byPhoto.get(photo) : others.shift();
    if (!copy) return;
    if (copy.title) d.title = copy.title;
    if (copy.desc) d.desc = copy.desc;
  });
}

function fixedCopyBlock(input: PosterConceptInput): string {
  const f = input.fixedCopy;
  if (!f) return '';
  const lines: string[] = [];
  if (f.name) lines.push(`- 命名（name）：「${f.name}」——场景、意象、道具都围绕这个名字来构思`);
  if (f.subtitle) lines.push(`- 副标题（subtitle）：「${f.subtitle}」`);
  if (f.inspiration) lines.push(`- 灵感小字（inspiration）：「${f.inspiration}」`);
  for (const d of f.photoDetails || []) {
    lines.push(`- 附图${d.photo}那一格：${d.title ? `标题「${d.title}」` : '标题你来写'}；${d.desc ? `正文「${d.desc}」` : '正文你来写'}`);
  }
  (f.otherDetails || []).forEach((d, i) => {
    lines.push(`- 没有实拍的第 ${i + 1} 个细节格：${d.title ? `标题「${d.title}」` : '标题你来写'}；${d.desc ? `正文「${d.desc}」` : '正文你来写'}（部位按这段文字选）`);
  });
  if (!lines.length) return '';
  return ['', '[用户已录入的文案（一字不改，原样填进对应字段；其余没录入的按下面的规则写，风格和它们统一）]', ...lines, ''].join('\n');
}

export const MIN_DETAIL_CELLS = 3;
export const MAX_DETAIL_CELLS = 6;
export function clampDetailCount(n: unknown): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(MAX_DETAIL_CELLS, Math.max(MIN_DETAIL_CELLS, v)) : MIN_DETAIL_CELLS;
}

// 路由平台目前只开通 gemini-3.6-flash，放最前面省掉两次失败往返
const CONCEPT_MODELS = ['gemini-3.6-flash'];

const DEFAULT_DETAILS: PosterDetailConcept[] = [
  { key: 'armrest', locate: '沙发离镜头最近一侧的完整扶手（从扶手顶面到落地处、从前端到与靠背相接处，整只扶手都在框内）', title: '臂弯有度', desc: '宽厚承托 · 圆润包覆 · 倚靠从容' },
  { key: 'backrest', locate: '离镜头最近的一个座位的靠背，含缝线与分段结构', title: '层叠承托', desc: '分区支撑 · 分段车缝 · 贴合背脊' },
  { key: 'foot', locate: '沙发底部一个完整露出的沙发脚（能看到从底座到地面的完整形状，前面没有茶几、摆件、地毯边遮挡），连带一小段沙发底座', title: '轻托离地', desc: '稳固支撑 · 利落收边 · 安定从容' },
  { key: 'seat', locate: '离镜头最近的一个座包，含座面与前沿的缝线', title: '饱满坐享', desc: '厚实回弹 · 精细包覆 · 久坐舒展' },
  { key: 'side', locate: '沙发离镜头最近一侧的侧面整体轮廓', title: '利落侧影', desc: '轮廓分明 · 比例协调 · 干净从容' },
  { key: 'stitch', locate: '靠背或座包上一段清晰的缝线与面料纹理特写', title: '细密匠心', desc: '平整车缝 · 细密走线 · 触感温润' }
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

/** 发给模型的图片顺序：产品图 → 参考图 → 用户附图 */
function imageOrderBlock(input: PosterConceptInput): string {
  const lines: string[] = [];
  let n = 0;
  if (input.productImage) lines.push(`第${++n}张：产品图（要做海报的这款沙发，造型、颜色、面料以它为准）`);
  if (input.referenceImage) lines.push(`第${++n}张：用户指定的参考图（只学场景与氛围）`);
  (input.attachments || []).forEach((_, i) => lines.push(`第${++n}张：用户附图${i + 1}`));
  if (input.tableCatalog) lines.push(`第${++n}张：茶几目录（${input.tableCatalog.items.length} 款真实茶几商品，只用来挑茶几）`);
  if (lines.length < 2) return '';
  return `\n[图片顺序]\n${lines.join('\n')}\n`;
}

function attachmentBlock(input: PosterConceptInput): string {
  const k = (input.attachments || []).length;
  if (k === 0) return '';
  return [
    '',
    `[用户附图（共 ${k} 张，逐张看清楚再用）]`,
    '逐张判断用途，写进 attachmentRoles（顺序与附图一致）：',
    '- "detail"：这款产品某个部位的实拍特写（扶手、靠背、拉点、沙发脚、侧面、面料纹理等）。用户常因为整图生成后造型会变形才补拍细节：用它读懂真实造型、结构和工艺，文案按它写；底部细节格如果正好是这个部位，details[].photo 填这张附图的序号（从 1 起），细节格会直接用这张实拍。',
    '- "product"：同一款产品的其他角度整图，只用来理解造型。',
    '- "scene"：参考海报、场景或氛围图（里面的沙发不是这款产品），主场景的空间、光线、配色按它来。',
    '- "ignore"：和这次海报无关的图。',
    ...(input.detailPhotoCount
      ? [`- 其中附图1～附图${Math.min(input.detailPhotoCount, k)} 是用户在“细节图”窗口专门上传的产品细节实拍：attachmentRoles 一律填 "detail"，每张各对应底部一格（details[].photo 填它的序号），文案按实拍里的部位写。`]
      : []),
    '先逐张写清每张附图实际拍到的是哪个部位，写进 attachmentParts（如 ["整只扶手","拉点分段靠背","扶手与沙发脚"]），再据此填 details[].photo：只按图片内容对应，用户文字里的“图二 / 图四”可能写错，不能按图号硬套；同一张附图最多给一格，没有哪张附图拍到这个部位就填 0。',
    ''
  ].join('\n');
}

function hintBlock(hint: string | undefined): string {
  if (!hint) return '';
  return [
    '',
    '[用户要求（逐条满足，优先级最高，和下面的通用规则冲突时以用户为准）]',
    hint,
    '落实方式：',
    '- 命名：用户规定了字数或命名方式（如“四字以内”“参考顾家、乐至宝的产品命名，如赫兹、云舒”）就照做，名字要贴合沙发和场景；用户举的例子只是风格参考，不要直接用。',
    '- 用户点名要展示的部位（如“完整扶手”“拉点分段式靠背”“沙发角”），底部细节格就是这几个部位，顺序按用户说的；要求“完整”的部位，locate 里写明整个部位都要框进去。',
    '- 用户给了设计 / 工艺解读要求时，desc 不再限于两个短语：写 20–32 字的一句话（硬性上限 32 字，含标点；一句写完，用句号结尾，不要“不仅…还…”“…的同时…”这种长句），具体解读这个部位的造型和工艺（如包覆方式、缝线、拉点、分段、弧度、脚的材质与形状），只写图里看得见的，不编参数。',
    '- 用户对场景、色调、道具、抱枕的要求（如“两个相同的带图案抱枕”）都要写进 scene / props。',
    ''
  ].join('\n');
}

function tableRuleFor(input: PosterConceptInput): string {
  if (input.tableCatalog) {
    const used = (input.used || []).map(u => u.tableStyle).filter((x): x is string => Boolean(x));
    return catalogCandidatesRule(input.tableCatalog.series, input.tableCatalog.items, used);
  }
  return input.tableStyle || !input.tableCandidates?.length ? coffeeTableRule(input.tableStyle) : coffeeTableCandidatesRule(input.tableCandidates);
}

export function buildConceptPrompt(input: PosterConceptInput): string {
  return `你是家具品牌的电商海报创意总监。请为下面这款产品构思一张 4:3 单屏产品主视觉海报的概念。
${imageOrderBlock(input)}
[产品 DNA]
${describeDna(input.dna)}
${input.productImage ? '（DNA 可能是旧的或不准：颜色、材质、结构凡与产品图不一致的，一律以产品图为准，文案里的颜色词也要按图里真实看到的颜色写。）' : ''}
${input.planContext ? `\n[已有企划参考]\n${input.planContext}\n` : ''}${hintBlock(input.hint)}${fixedCopyBlock(input)}${attachmentBlock(input)}${
    input.angle
      ? `\n[本次创意切入角度（必须采用）]\n${input.angle.label}：${input.angle.brief}\n`
      : ''
  }${sceneBlock(input)}${usedBlock(input.used)}
[版式（固定，不用你设计）]
上方是产品主场景大图，左上角（或右上角）放标题区：两字命名 + 一句副标题 + 一行灵感小字；底部一栏 ${clampDetailCount(input.detailCount)} 格，每格是一个产品部位的真实特写 + 标题 + 一句短说明。

[怎么构思：先挖卖点，再选大场景，再让整张图呼应名字]
0. 挖卖点：看产品图和 DNA，找出这款产品最打动人的 1 个卖点（功能、坐感、材质、颜色、造型、情绪里选最突出、最具体的一个，如“电动头等舱躺姿”“米白头层真皮”“分段饱满靠背”）。
1. 选场景：按“创意切入角度”，从上面的候选场景里挑一个和这个卖点最有关系的，并想清楚卖点和场景的联系（一句话能说出来）。
2. 命名：两个汉字（用户另有要求时按用户的，最多四个字），有画面感和情绪，从卖点和场景出发。避开“云栖、栖云、云舒、暖阳”这类用滥了的词。
3. 意象：名字对应的画面意象，一句话。
4. 场景：这是一张大场景海报，背景是灵魂，必须开阔、壮观、有纵深，不能是封闭的室内房间或“一间好看的客厅”。从意象推出下面五样，缺一不可：
   - 标志性主体：一个大尺度、一眼能记住的主体，占据画面上半部——可以是建筑结构（巨型弧形天井、连续拱廊、悬挑露台），也可以是壮阔的自然地貌（沙丘风纹、峡谷岩壁、冰川断面、层叠梯田、云海山尖、银河极光）。
   - 远景：一直延伸到地平线或天空的风景，提供纵深。
   - 配色：场景 2–3 个主色，说明和产品色是“呼应”还是“对比”。
   - 时间与光线：整体明亮通透，选白天的明亮时段（清晨柔光、上午或正午天光、午后斜光、日落前的暖光），主光要照亮沙发，要有光斑、倒影、轮廓光这类光效。不要夜景、星空、暗黑或低调光的画面，沙发必须是画面里最清楚的主体。
   - 道具呼应：茶几（按下面的茶几要求）、一件摆件、地毯或地面材质、一对同款抱枕的图案，都要和名字、场景同一套语言；props 里写清茶几的材质和造型，以及抱枕的颜色和图案。
   - 抱枕：${PILLOW_RULE}
   - 茶几：${tableRuleFor(input).split('\n').join('\n     ')}
   - 人物：默认画面里不要人物，person 输出空字符串（功能位打开也不加人）。只有用户要求里明确要人物 / 模特时，才安排一位人物正在使用沙发（半躺放松，穿着简洁，姿态自然），写进 person。
5. 标杆案例（学方法，不要照抄）：
   - 银弧（造型呼应）：取自柔和弧面 → 弧形银色未来建筑天井、蓝天白云、不锈钢弧形茶几
   - 晴岚（情绪意境）：取自柔和的浅灰绿色 → 清晨山谷的玻璃平台，薄雾散开，阳光照亮草坡
   - 悠眠（功能演绎）：取自电动躺与头枕 → 午后阳光下的海边露台，打开的功能位迎着海风
   - 沙纹（造型呼应）：取自分段靠背的起伏 → 白色沙丘的风纹延伸到地平线，正午硬光
   - 赤岩（材质呼应）：取自焦糖色真皮的光泽 → 红岩峡谷流线岩壁，顶部光柱洒下
   - 镜湖（色彩呼应）：取自米白色 → 天空之镜盐湖，倒映云朵，沙发如悬浮于天地之间
6. 画面分三层：前景（地面、地毯边缘或道具，可有少量虚化的植物、水面、沙砾）、中景（沙发）、远景（标志性主体与风景）。可以大胆、可以超现实，但光影和材质要像真实摄影。
7. 标题压在画面一侧的上方：那里是天空、远景或主体的大曲面，明暗均匀、没有密集的小物件即可，不要画成一面空墙。

[细节 ${clampDetailCount(input.detailCount)} 格]
details 必须正好 ${clampDetailCount(input.detailCount)} 项，部位互不重复。
只能选产品上真实存在、图里看得见的部位（通常是扶手、靠背、沙发脚，也可以是侧面分割、金属饰条等），不要编造功能、参数、检测或材质承诺。
扶手一定要完整展示：locate 写成“整只扶手（从扶手顶面到落地处、从前端到与靠背相接处）”，不要只框扶手的一部分。
细节文案（用户已录入的除外）：
- title（4–6 字）：要有语言艺术，用意象或感受点出这个部位的功能，像产品文案的小标题，而不是部位名称。如 宽厚扶手→「臂弯有度」、分段靠背→「层叠承托」、低矮沙发脚→「轻托离地」、隐藏拉链→「隐线藏锋」、皮面纹理→「肌理温存」。读者仍要能看出说的是哪个部位；不要直白的“XX扶手 / XX靠背 / 沙发脚”，也不要空泛的“匠心之选 / 品质生活”。
- desc：${clampDetailCount(input.detailCount) >= 6
  ? '两个 4 字短语用“ · ”连接：先功能或工艺，再情绪感受，如“分段车缝 · 倚靠随心”（底部 6 格太窄，只写两个）。'
  : '三个 4 字短语用“ · ”连接，依次写 功能 · 工艺 · 情绪，如“可调头枕 · 精密车缝 · 倚靠随心”“宽厚承托 · 圆润包覆 · 臂弯从容”。功能写这个部位能做什么、带来什么支撑；工艺写看得见的做法（车缝、包覆、分段、收边、材质）；情绪写坐上去的感受。'}只写图里看得见的，不编参数和材质承诺；功能只写图里能直接看出来的（如头枕翻起、分段、包覆、收边），看不出来的不要写：吊牌 / 标签 / 芯片不要写成“防伪、溯源、智能”，扶手翻起不要写成“储物”，除非用户录入或要求里明确说了。

[输出]
只输出一个 JSON 对象，不要 Markdown、不要解释：
{
  "sellingPoint": "这张海报讲的卖点，一句话，如“电动头等舱躺姿，一键半躺看星空”",
  "keyElements": ["画面主要视觉元素 3–5 个名词，如 玻璃观星房、银河、羊毛毯"],
  "name": "两个汉字",
  "subtitle": "副标题，8–12 字（硬性上限 12 字，含标点），用一个逗号分成两个短句，如“柔和之间，自有锋芒”",
  "inspiration": "灵感小字，12–20 字，如“灵感源于柔和弧面与未来建筑的对话”",
  "idea": "名字对应的意象，一句话",
  "sceneDirection": "从候选场景里选中的 id（如 white_dunes）",
  "signature": "标志性主体，20–50 字：是什么建筑结构或自然地貌、什么材质、在画面什么位置、有多大",
  "vista": "远景，15–40 字",
  "palette": "场景配色，20–50 字：2–3 个主色 + 与产品色的关系（呼应或对比）",
  "lighting": "时间与光线，20–50 字：时刻、主光方向、光效",
  "props": "道具呼应，30–70 字：边几或茶几（形状与材质）、摆件、地毯或地面、一对同款抱枕的颜色与图案（颜色要和沙发明显区分）",
  "scene": "把上面五项连成一段完整的画面描述，180–300 字，给摄影师看。不要描述沙发本身的造型（以产品图为准），不要出现任何文字或标牌。",
  "tableStyle": "从茶几候选或茶几目录里挑中的 id（没有候选时输出空字符串）",
  "functionOpen": "产品图里功能位是否打开（脚踏伸出 / 靠背后仰 / 头枕升起），true 或 false",
  "person": "只有用户明确要求人物时才写，20–40 字，如“一位穿浅色针织衫的年轻女性半躺在打开的功能位上看书”；默认空字符串",
  "attachmentParts": ["每张用户附图实际拍到的部位或内容，按附图顺序；没有附图就输出空数组"],
  "attachmentRoles": ["每张用户附图的用途：detail / product / scene / ignore；没有附图就输出空数组"],
  "packaging": "只看产品图：沙发上如果真实带有包装膜或品牌标识（例如底部透明包装膜上印着红蓝色品牌字样），用一句话写明位置、颜色和图案，如“沙发底部座位正面有透明包装膜，印红色飞机图标和蓝色 CHEERS 字样”；图里没有就输出空字符串 \\"\\"，不要猜、不要编",
  "stripColor": "#RRGGBB，海报底部细节栏的底色：一般用暖白 #F7F3EE；只有用户明确要深色场景时才用与场景同色系的深色",
  "accentColor": "#RRGGBB，与产品主色和场景协调的点缀色，用于标题下的短横线",
  "titleSide": "left 或 right，标题放哪一侧（这一侧上方是天空、远景或结构的大曲面，明暗均匀）",
  "details": [
    {"key": "armrest", "locate": "给视觉定位用的部位描述，只指一个局部（靠背只指一个座位的靠背），扶手要整只框进，如：沙发离镜头最近一侧的整只扶手（从顶面到落地处）", "title": "4–6 字，有文采的小标题，如“臂弯有度”", "desc": "按上面细节文案规则：功能 · 工艺 · 情绪，如“宽厚承托 · 圆润包覆 · 臂弯从容”；用户要求详细解读时写 20–36 字", "photo": 0},
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

/**
 * 细节说明超长时优先在句末（。；！？）断开；只能在逗号处断时，去掉断下来后还挂着的半截连接词
 * （“…的同时”“不仅…”），避免海报上出现半句话。最后补一个句号。
 */
export function cutDetailDesc(text: unknown, max: number, fallback = ''): string {
  const s = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (!s) return fallback;
  const chars = Array.from(s);
  if (chars.length <= max) return s;
  const head = chars.slice(0, max);
  for (let i = head.length - 1; i >= Math.floor(max / 3); i--) {
    if ('。；！？'.includes(head[i])) return head.slice(0, i).join('') + '。';
  }
  let cut = cutAtPunctuation(s, max, fallback);
  // 断在逗号后，最后一小句若是“…的同时 / 不仅… / 并且…”这种没说完的连接，整句去掉
  const clauses = cut.split(/[，,]/);
  if (clauses.length > 1 && /(的同时|同时|不仅|并且|而且|以及|既|让|使)$|^(不仅|并且|而且|同时)/.test(clauses[clauses.length - 1])) {
    cut = clauses.slice(0, -1).join('，');
  }
  return cut.replace(/[，,、；]$/, '') + '。';
}

function sceneBlock(input: PosterConceptInput): string {
  if (input.referenceImage) {
    return [
      '',
      '[参考图（最重要，必须照着它来）]',
      `${input.productImage ? '第二张图' : '附上的图'}是用户给的参考海报 / 参考图。主场景要按它来：空间与地貌、远景、构图与机位、时间与光线、配色、氛围、道具风格都尽量贴近参考图，让人一眼看出是照着它做的。`,
      '但只学场景和氛围：参考图里的沙发 / 家具、文字、Logo、排版一律不要照搬，画面里唯一的沙发是第一张图的产品；命名与文案按这款产品和参考图的意境重新构思。',
      '下面关于“候选场景”“创意角度”“避开已做过的元素”的要求，与参考图冲突时以参考图为准。',
      ''
    ].join('\n');
  }
  if (input.sceneDirection) {
    return `\n[本次场景方向（必须采用，命名、意象、道具都要和它呼应）]\n${input.sceneDirection.label}：${input.sceneDirection.brief}\n`;
  }
  const list = input.sceneCandidates || [];
  if (list.length === 0) return '';
  return `\n[候选场景（从中选一个和卖点最相关的，sceneDirection 填它的 id）]\n${list.map(d => `- ${d.id}｜${d.label}：${d.brief}`).join('\n')}\n`;
}

function usedBlock(used: UsedPosterConcept[] | undefined): string {
  const list = (used || []).filter(u => u?.name).slice(-8);
  if (list.length === 0) return '';
  const lines = list.map(u => {
    const tags = [findCreativeAngle(u.angle)?.label, findSceneDirection(u.sceneDirection)?.label].filter(Boolean).join(' · ');
    return [
      `- ${u.name}${tags ? `（${tags}）` : ''}${u.idea ? `：${u.idea}` : ''}`,
      u.sellingPoint ? `卖点：${u.sellingPoint}` : '',
      u.keyElements?.length ? `元素：${u.keyElements.join('、')}` : ''
    ]
      .filter(Boolean)
      .join('；');
  });
  const elements = Array.from(new Set(list.flatMap(u => u.keyElements || []))).slice(0, 24);
  return [
    '',
    '[这款产品已经做过的海报，这次必须明显不同]',
    ...lines,
    '命名不能重复，也不能是同样的字换个顺序或只换一个字（做过“云栖”就不能叫“栖云”“云憩”）；卖点尽量换一个（同一卖点也要换完全不同的表现）；意象、空间、光线、配色都要换。',
    elements.length ? `这些视觉元素已经用过，这次不要再作为画面主体：${elements.join('、')}。` : '',
    ''
  ]
    .filter((line, i, arr) => line || i === 0 || i === arr.length - 1)
    .join('\n');
}

function cut(text: unknown, max: number, fallback = ''): string {
  const s = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (!s) return fallback;
  return Array.from(s).slice(0, max).join('');
}

/** 模型输出不一定守规矩：截断超长字段、补齐细节格、颜色与方向做兜底 */
/** 细节格补足 / 截到指定格数，补的格子挑还没用过的部位 */
export function fitDetailCount(concept: PosterConcept, count: number): void {
  const n = clampDetailCount(count);
  if (concept.details.length > n) concept.details = concept.details.slice(0, n);
  const keys = new Set(concept.details.map(d => d.key));
  for (const d of DEFAULT_DETAILS) {
    if (concept.details.length >= n) break;
    if (!keys.has(d.key)) { concept.details.push({ ...d }); keys.add(d.key); }
  }
}

/** 用户要求里是否明确要人物（“不要人物 / 无人物”不算） */
export function wantsPerson(hint: string | undefined): boolean {
  if (!hint) return false;
  const text = hint.replace(/(不要|不需要|不用|去掉|去除|删掉|无|没有|别)(出现)?(任何)?(人物|模特|真人|人像|人)/g, '');
  return /人物|模特|真人|人像|有人|一位|一个人|男士|女士|女性|男性|小孩|孩子|一家/.test(text);
}

/** GB2312 收录的 6763 个规范汉字；海报文案里出现这之外的汉字（繁体、生僻字）基本是模型吐出的乱码 */
let GB2312_HAN: Set<string> | null = null;
function gb2312Han(): Set<string> {
  if (GB2312_HAN) return GB2312_HAN;
  const set = new Set<string>();
  const dec = new TextDecoder('gb18030');
  for (let hi = 0xb0; hi <= 0xf7; hi++) {
    for (let lo = 0xa1; lo <= 0xfe; lo++) set.add(dec.decode(Uint8Array.from([hi, lo])));
  }
  GB2312_HAN = set;
  return set;
}

/** 文案含非规范汉字时视为乱码，返回 undefined（交给各字段的兜底） */
export function rejectGarbled(text: unknown): unknown {
  if (typeof text !== 'string') return text;
  const set = gb2312Han();
  for (const ch of text) {
    if (/\p{Script=Han}/u.test(ch) && !set.has(ch)) return undefined;
  }
  return text;
}

export function sanitizeConcept(raw: any): PosterConcept {
  const details: PosterDetailConcept[] = Array.isArray(raw?.details)
    ? raw.details
        .filter((d: any) => d && typeof d === 'object')
        .slice(0, MAX_DETAIL_CELLS)
        .map((d: any, i: number) => {
          const fallback = DEFAULT_DETAILS[i] || DEFAULT_DETAILS[0];
          const key = cut(d.key, 24, fallback.key).replace(/[^a-zA-Z0-9_-]/g, '') || `detail_${i + 1}`;
          const photo = Number(d.photo);
          return {
            key,
            locate: cut(d.locate, 80, fallback.locate),
            title: cut(rejectGarbled(d.title), 7, fallback.title),
            desc: cutDetailDesc(rejectGarbled(d.desc), 40, fallback.desc),
            ...(Number.isInteger(photo) && photo > 0 && photo <= 10 ? { photo } : {})
          };
        })
    : [];
  // key 重复会导致定位结果互相覆盖
  const seen = new Set<string>();
  for (const d of details) {
    if (seen.has(d.key)) d.key = `${d.key}_${seen.size + 1}`;
    seen.add(d.key);
  }
  while (details.length < MIN_DETAIL_CELLS) details.push({ ...DEFAULT_DETAILS[details.length] });

  return {
    name: cut(rejectGarbled(raw?.name), 4, '舒境'),
    subtitle: cutAtPunctuation(rejectGarbled(raw?.subtitle), 13, ''),
    inspiration: cutAtPunctuation(rejectGarbled(raw?.inspiration), 32, ''),
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
    sceneDirection: findSceneDirection(raw?.sceneDirection)?.id,
    angle: findCreativeAngle(raw?.angle)?.id,
    tableStyle: findCoffeeTableStyle(raw?.tableStyle)?.id || findCatalogTable(raw?.tableStyle)?.id,
    sellingPoint: cut(raw?.sellingPoint, 40, ''),
    keyElements: Array.isArray(raw?.keyElements)
      ? raw.keyElements.filter((x: any) => typeof x === 'string' && x.trim()).slice(0, 5).map((x: string) => cut(x, 12))
      : [],
    functionOpen: raw?.functionOpen === true || raw?.functionOpen === 'true',
    person: cut(raw?.person, 80, ''),
    attachmentRoles: Array.isArray(raw?.attachmentRoles)
      ? raw.attachmentRoles.slice(0, 10).map((r: any): AttachmentRole => (r === 'detail' || r === 'product' || r === 'scene' ? r : 'ignore'))
      : []
  };
}

export async function generatePosterConcept(input: PosterConceptInput, userId = 'system'): Promise<PosterConcept> {
  const { ai, isValidKey } = await createServerGenAI(userId);
  if (!ai || !isValidKey) throw new Error('POSTER_CONCEPT_UNAVAILABLE: 未配置可用的模型凭据');

  // 用户自己提了场景要求时不强加方向；否则按这款产品用过的方向轮换
  const used = (input.used || []).filter(u => u && typeof u.name === 'string' && u.name.trim());
  // 按这款产品用过的角度与场景轮换：角度决定从哪个卖点出发，候选场景来自最近没用过的类别，由模型按卖点挑一个
  const hasSceneSource = Boolean(input.hint || input.referenceImage);
  const angle = input.angle || (hasSceneSource ? undefined : pickCreativeAngle(used.map(u => u.angle).filter((x): x is string => Boolean(x))));
  const direction = input.sceneDirection;
  // 茶几款式按这款产品用过的轮换；用户要求里自己说了茶几就按用户的
  // 选了配套系列：从系列素材库里挑，不再用文字款式库
  const tableCatalog = input.tableCatalog?.items.length ? input.tableCatalog : undefined;
  const tableStyle = tableCatalog ? undefined : input.tableStyle;
  const tableCandidates = tableCatalog || tableStyle || /茶几/.test(input.hint || '')
    ? undefined
    : input.tableCandidates || pickCoffeeTableCandidates(used.map(u => u.tableStyle).filter((x): x is string => Boolean(x)));
  const candidates =
    input.sceneCandidates ||
    (direction || hasSceneSource ? undefined : pickSceneCandidates(used.map(u => u.sceneDirection).filter((x): x is string => Boolean(x))));

  const orderedImages = [input.productImage, input.referenceImage, ...(input.attachments || []), tableCatalog?.sheet].filter(
    (img): img is { data: string; mimeType: string } => Boolean(img?.data)
  );
  const imageParts: any[] = orderedImages.map(img => ({ inlineData: { mimeType: img.mimeType || 'image/jpeg', data: img.data.replace(/^data:[^;]+;base64,/, '') } }));

  let lastErr: any = null;
  let collided: PosterConcept | null = null;
  // 撞名时把撞到的名字也列进“已做过”再试一次；仍撞名就接受，不让整个流程失败
  for (let attempt = 0; attempt < 2; attempt++) {
    const avoid = collided
      ? [...used, { name: collided.name, idea: collided.idea, sceneDirection: collided.sceneDirection, angle: collided.angle, sellingPoint: collided.sellingPoint, keyElements: collided.keyElements }]
      : used;
    const parts = [...imageParts, { text: buildConceptPrompt({ ...input, used: avoid, sceneDirection: direction, sceneCandidates: candidates, angle, tableStyle, tableCandidates, tableCatalog }) }];
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
          prompt: buildConceptPrompt({ ...input, used: avoid, sceneDirection: direction, sceneCandidates: candidates, angle, tableStyle, tableCandidates, tableCatalog }),
          images: orderedImages.map(img => ({ mimeType: img.mimeType || 'image/jpeg', data: img.data.replace(/^data:[^;]+;base64,/, '') })),
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
    // 模型选的方向必须在候选里；没选或选了别的，按第一个候选记
    concept.sceneDirection =
      direction?.id ||
      (candidates?.some(c => c.id === concept!.sceneDirection) ? concept.sceneDirection : candidates?.[0]?.id);
    concept.angle = angle?.id;
    // 默认不要人物：用户要求里没明确提人物 / 模特时，模型写了也清掉
    if (!wantsPerson(input.hint)) concept.person = '';
    fitDetailCount(concept, clampDetailCount(input.detailCount));
    applyFixedCopy(concept, input.fixedCopy, input.detailPhotoCount || 0);
    // 模型挑的款式必须在候选里；没挑或挑了别的，按第一个候选
    concept.tableStyle = tableCatalog
      ? pickCatalogTable(tableCatalog.items, concept.tableStyle, used.map(u => u.tableStyle))
      : tableStyle?.id || (tableCandidates?.some(c => c.id === concept!.tableStyle) ? concept.tableStyle : tableCandidates?.[0]?.id);
    // 名字是用户录入的：撞名也照用，不重新构思
    const clash = input.fixedCopy?.name ? undefined : avoid.find(u => namesCollide(u.name, concept!.name));
    if (!clash) return concept;
    console.warn(`[PosterConcept] 命名「${concept.name}」与已做过的「${clash.name}」重复，重新构思`);
    collided = concept;
  }
  if (collided) return collided;
  throw new Error(`POSTER_CONCEPT_FAILED: ${lastErr?.message || '模型未返回可用结果'}`);
}

/** 模型挑的茶几必须在系列素材库里；没挑或挑错，随机给一款这款产品没用过的 */
export function pickCatalogTable(items: CatalogCoffeeTable[], chosen: unknown, usedIds: Array<string | undefined> = [], random: () => number = Math.random): string | undefined {
  if (typeof chosen === 'string' && items.some(i => i.id === chosen)) return chosen;
  const used = new Set(usedIds.filter(Boolean));
  const pool = items.filter(i => !used.has(i.id));
  const from = pool.length ? pool : items;
  return from.length ? from[Math.floor(random() * from.length)].id : undefined;
}

/** 模板 A 主场景的出图提示词：只画主场景，给标题留白，不画文字和细节小窗 */
export function buildTemplateAHeroPrompt(
  concept: PosterConcept,
  dna?: any,
  opts: { hasReference?: boolean; detailPhotos?: number } = {}
): string {
  const side = concept.titleSide === 'right' ? '右' : '左';
  const catalogTable = findCatalogTable(concept.tableStyle);
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
    concept.sellingPoint ? `要表现的卖点：${concept.sellingPoint}` : '',
    concept.signature ? `标志性主体：${concept.signature}` : '',
    concept.vista ? `远景：${concept.vista}` : '',
    concept.palette ? `配色：${concept.palette}` : '',
    concept.lighting ? `光线：${concept.lighting}` : '',
    concept.props ? `道具：${concept.props}` : ''
  ].filter(Boolean);

  return `高端家具品牌商业海报的主场景摄影，主题「${concept.name}」：${concept.idea}

${
    opts.hasReference
      ? `[参考图]
标为“场景参考”的图是用户给的参考图：场景按它来——空间与地貌、远景、构图与机位、时间与光线、配色、氛围、道具风格都尽量贴近它。
只学场景：参考图里的沙发 / 家具、人物、文字、Logo、排版和边框一律不要画进来；画面里唯一的沙发是第一张图的产品。

`
      : ''
  }${
    opts.detailPhotos
      ? `[产品细节实拍]
标为“材质参考”的 ${opts.detailPhotos} 张图是这款沙发的局部实拍（用户补拍的扶手、靠背、拉点、脚等）：造型、结构、缝线、面料纹理和颜色都按这些实拍还原，和主产品图冲突时以实拍为准。实拍里的背景、地面不要画进来。

`
      : ''
  }[场景]
${concept.scene}
${sceneLines.length ? '\n' + sceneLines.join('\n') + '\n' : ''}
[背景是这张图的重点]
这是一张开阔的大场景海报：背景不能是一面平墙、封闭的室内房间或普通客厅。标志性主体（建筑结构或自然地貌）要大、要占据画面上半部，并向远处延伸出纵深；一直能看到地平线或天空。
画面分三层：前景（地面、地毯边缘或道具，可有少量虚化的植物、水面、沙砾）、中景（沙发）、远景（标志性主体与风景）。
整体明亮通透：白天的明亮光线，主光照亮沙发，沙发是画面里最清楚、最亮眼的主体，细节一眼看得清；不要夜景、星空、暗黑或低调光，不要让沙发陷在阴影里。
色彩饱满、有主次和冷暖对比，不要整张图一个灰调；光线有方向、有层次，带光斑、倒影或轮廓光。

[构图]
横幅 16:9，广角镜头（约 24–28mm）、机位略低，空间显得开阔高大。
参考图中的沙发是画面唯一主角，三分之四侧前方视角，整体完整入画、不裁切，位于画面中部略偏${other}，宽度约占画面的 50%–58%；沙发顶部不高于画面高度的 42%，底边在 72%–80% 处，上方留出足够的空间展示结构与远景。沙发下有地毯或与场景相配的地面，沙发上摆一对同款抱枕。
[抱枕]
${PILLOW_RULE}
[茶几]
${catalogTable ? catalogTableHeroRule(catalogTable) : coffeeTableRule(findCoffeeTableStyle(concept.tableStyle))}
茶几上的花器、绿植要低矮，放在茶几远离扶手的一侧；画面里任何花瓶、绿植、枝叶都不能挡在沙发两侧扶手前面，两只扶手要完整露出。
${concept.person ? `[人物] ${concept.person}。人物比例真实、姿态自然放松，正在使用沙发打开的功能位；不要挡住扶手和沙发的整体轮廓。` : '画面里不要出现人物。'}
画面${side}上方（约画面宽度 40%、高度 40% 的区域）后期要排版标题：这里是天空、远景或结构的大曲面，明暗均匀，不放植物、树枝、灯具、密集的小物件和强高光点（植物只能放在画面另一侧或前景角落）；但不要画成一面空墙。
商业中画幅相机质感，材质和光影像真实摄影。

[产品一致性，最重要]
沙发必须与参考图完全一致：造型、扶手、靠背分段与拉点、缝线走向、脚型、面料质感和颜色都不能改。
面料要和产品图一样真实：纱线颗粒、色点、编织起伏都清楚可见，不要画成平滑的纯色布面或塑料感；颜色不偏色、不发灰、不变深。${concept.functionOpen ? '\n功能位保持和产品图一样的打开状态（脚踏伸出 / 靠背后仰）。' : ''}
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
