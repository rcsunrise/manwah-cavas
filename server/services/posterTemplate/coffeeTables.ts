/**
 * 4/3 产品海报的茶几款式库：现代轻奢、以大理石为主。
 * 依据用户给的参考（Pinterest“茶几 · 现代 · 大理石 · 轻奢”）：厚实圆润的天然石材台面、
 * 卵石/肾形或圆角矩形，底座是黄铜/古铜/香槟金圆柱、哑光黑或深色胡桃木雕塑底座、石材一体曲面或圆球脚，
 * 常以两三个高低错落的组合出现。不要金属细框、朴素木板、玻璃台面这类。
 * 每张海报给模型 3 个本产品最近没用过的款式，由模型按场景配色挑一个。
 */
export interface CoffeeTableStyle {
  id: string;
  label: string;
  /** 给模型的款式说明：台面材质与形状、底座造型、组合方式 */
  brief: string;
}

export const COFFEE_TABLE_STYLES: CoffeeTableStyle[] = [
  {
    id: 'pebble_nesting_brass',
    label: '卵石形大理石组合几 · 黄铜圆柱腿',
    brief: '两到三个卵石形（不规则圆润轮廓）大理石或洞石台面高低错落地组合在一起，台面厚实、边缘圆润，每个下面是拉丝黄铜或古铜色的粗圆柱腿'
  },
  {
    id: 'layered_bronze_plinth',
    label: '大理石嵌古铜托盘 · 香槟金圆柱底座',
    brief: '卵石形卡拉拉白大理石台面，嵌在稍大一圈的古铜金属托盘上，形成层叠的金属包边，下面是单根粗圆柱香槟金底座，悬浮轻盈'
  },
  {
    id: 'viola_walnut',
    label: '紫罗兰大理石 · 胡桃木方柱腿',
    brief: '厚边紫罗兰大理石（白底酒红紫纹）圆角方形台面，四只厚实的深色胡桃木方柱腿，大气稳重'
  },
  {
    id: 'sculpt_curve_marble',
    label: '一体弧形大理石茶几',
    brief: '整块白色大理石做成的茶几，台面与下方弧形曲面底座连成一体（像一条柔和的 S 形曲线），简洁而有雕塑感，纹理连贯'
  },
  {
    id: 'marble_drum',
    label: '厚实圆鼓大理石圆几',
    brief: '鱼肚白大理石的厚实圆鼓形圆几，台面和底座一体，边缘做圆润倒角，纹理清晰'
  },
  {
    id: 'marble_spheres',
    label: '大理石圆台 · 石球脚',
    brief: '灰黑色大理石圆形台面，下面用三四颗同色大理石圆球做脚，稳重又有趣味'
  },
  {
    id: 'dark_sculpt_base',
    label: '白大理石 · 深色雕塑底座 + 小边几',
    brief: '圆角长方形白色大理石台面，下方是哑光深色木或黑色的雕塑感镂空底座，旁边配一个略高的小方形边几（深色台面），意式轻奢'
  },
  {
    id: 'green_marble_organic',
    label: '墨绿大理石不规则台面 · 深木圆柱腿',
    brief: '墨绿色天然大理石不规则卵石形台面（带金色细纹），深色木圆柱腿，旁边配一个更高的小圆边几，层次错落'
  },
  {
    id: 'oval_ball_c_base',
    label: '椭圆大理石 · 金球与黑色 C 形底座',
    brief: '椭圆形白色大理石台面，下方由一颗香槟金金属球和一个黑色哑光 C 形底座共同支撑，旁边配一个金属腿小圆边几'
  },
  {
    id: 'travertine_layered',
    label: '洞石双层错落几 · 哑光黑底座',
    brief: '两块米白洞石圆角台面上下错落叠放（一高一低、部分重叠），下面是哑光黑金属弧形底座，温润又现代'
  },
  {
    id: 'walnut_ball_pedestal',
    label: '胡桃木圆几 · 木球金属盘底座',
    brief: '胡桃木圆形台面（边缘斜切），中间一颗胡桃木圆球立在金属圆盘底座上，旁边配一个小玻璃圆边几，暖木点缀'
  }
];

export function findCoffeeTableStyle(id: unknown): CoffeeTableStyle | undefined {
  return typeof id === 'string' ? COFFEE_TABLE_STYLES.find(s => s.id === id) : undefined;
}

/** 给模型挑的候选：n 个这款产品最近没用过的款式（都用过就从最久没用的一半里挑） */
export function pickCoffeeTableCandidates(usedIds: string[], n = 3, random: () => number = Math.random): CoffeeTableStyle[] {
  const used = new Set(usedIds);
  let pool = COFFEE_TABLE_STYLES.filter(s => !used.has(s.id));
  if (pool.length < n) {
    const recent = new Set(usedIds.slice(-Math.ceil(COFFEE_TABLE_STYLES.length / 2)));
    pool = COFFEE_TABLE_STYLES.filter(s => !recent.has(s.id));
  }
  if (pool.length < n) pool = COFFEE_TABLE_STYLES;
  return [...pool]
    .map(s => ({ s, k: random() }))
    .sort((a, b) => a.k - b.k)
    .slice(0, n)
    .map(x => x.s);
}

const PLACEMENT = [
  '摆放：在沙发正前方、离沙发约一臂距离（像客厅里正常摆放），茶几高度低于沙发坐面，整体长度约为沙发的一半到三分之二，不要离沙发很远，不要挡住沙发的扶手和底部。',
  '风格：现代轻奢，天然大理石或洞石的纹理清晰真实，台面厚实、边缘圆润，金属部分是拉丝黄铜、古铜或香槟金（不要亮黄色），做工精致。',
  '茶几上最多一两件小摆件（花器、书、托盘），不要堆满；不要细金属框架、朴素厚木板、玻璃台面那类普通款，也不要怪石或艺术装置。'
].join('\n');

/** 出图用：已经定下的那一款 */
export function coffeeTableRule(style?: CoffeeTableStyle): string {
  return [
    style
      ? `茶几用这一款：${style.label}——${style.brief}。石材颜色可以按场景微调，和沙发、场景配色协调。`
      : '茶几：现代轻奢大理石茶几（卵石形或圆角台面、厚实石材、黄铜或深色底座，可以是两三个高低错落的组合）。',
    PLACEMENT
  ].join('\n');
}

/** 构思用：从候选里按场景配色挑一款，写进 tableStyle */
export function coffeeTableCandidatesRule(candidates: CoffeeTableStyle[]): string {
  return [
    '从下面几款里挑一款和场景配色、命名最协调的，tableStyle 填它的 id：',
    ...candidates.map(s => `- ${s.id}｜${s.label}：${s.brief}`),
    PLACEMENT
  ].join('\n');
}
