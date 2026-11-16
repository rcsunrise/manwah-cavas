/**
 * 海报创意切入角度：先从产品挖一个卖点，再按角度把卖点变成场景。
 * 以前只有“奇观场景方向”（弧形建筑、星际舷窗、海边平台……），每张都是“大弧形结构 + 远景 + 圆石几”，
 * 同一款产品连出几张很像。现在按产品轮换角度，奇观空间只是其中一种。
 */
export interface CreativeAngle {
  id: string;
  label: string;
  /** 给模型的说明：怎么从卖点推出场景，以及举例 */
  brief: string;
}

export const CREATIVE_ANGLES: CreativeAngle[] = [
  {
    id: 'function',
    label: '功能演绎',
    brief:
      '把这款产品最核心的功能或坐感体验直接变成场景本身，让人一看就知道“坐上去是什么感觉”。例：电动躺/头等舱功能 → 夜航头等舱般的私密包厢、屋顶观星露台上半躺看银河、家庭影院的观影之夜；高靠背头枕 → 午后小憩的安静书房；超宽坐深 → 一家人窝在一起的周末早晨。场景要真实可信，不必是奇观建筑。'
  },
  {
    id: 'material',
    label: '材质溯源',
    brief:
      '从面料与材质的来源、工艺或触感找画面。例：头层真皮 → 皮具工坊的温暖木作与工具墙、马术俱乐部的鞍具房、老派绅士书房；科技布/绒面 → 柔软羊毛与织物的工作室、雪后小木屋；金属脚 → 工业感精工车间改造的 loft。用材质的纹理、光泽和工艺细节做道具，而不是靠宏大建筑。'
  },
  {
    id: 'color',
    label: '色彩溯源',
    brief:
      '从产品主色在自然或生活里的来源找场景，让整张图就是这个颜色的“故乡”。例：米白/奶油 → 燕麦田与晨雾、盐湖与白色沙丘、棉田；焦糖/橙棕 → 秋日枫林、沙漠黄昏、威士忌酒窖；灰色 → 雨后石板街、雾中松林；深色 → 黑色火山岩海岸。主色呼应产品，再用一个对比色点睛。'
  },
  {
    id: 'lifestyle',
    label: '生活时刻',
    brief:
      '一个具体、真实的生活瞬间：谁、什么时刻、在做什么（如周日早晨读报配咖啡、雨夜窝着看电影、和猫一起午睡、朋友来家里小聚）。场景是一个有生活气息、可居住的家或度假居所，有书、毛毯、咖啡杯、绿植、宠物等真实道具，可以有人物背影或局部。不要奇观建筑、不要超现实。'
  },
  {
    id: 'form',
    label: '造型同构',
    brief:
      '从产品最有辨识度的线条（扶手弧度、分段靠背的节奏、纤细金属脚、方正轮廓）找同一造型语言的自然地貌、器物或艺术品，让背景和产品“长得像”。例：分段饱满靠背 → 层层叠叠的梯田或沙丘纹理；圆润扶手 → 被海浪磨圆的卵石滩；纤细黑色金属脚 → 极简黑色线条装置。'
  },
  {
    id: 'spectacle',
    label: '奇观空间',
    brief: '大胆的奇观空间（具体方向见下方“场景方向”），用一个大尺度、一眼能记住的空间结构占据画面上半部。'
  }
];

export function findCreativeAngle(id: unknown): CreativeAngle | undefined {
  return typeof id === 'string' ? CREATIVE_ANGLES.find(a => a.id === id) : undefined;
}

/**
 * 选一个这款产品还没用过的角度；都用过了，避开最近 3 次。
 * 奇观空间排在最后：其他角度都没用过时不选它（模型自己就容易往奇观跑）。
 * usedIds 按时间顺序（旧 → 新），random 便于测试。
 */
export function pickCreativeAngle(usedIds: string[], random: () => number = Math.random): CreativeAngle {
  const used = new Set(usedIds);
  const nonSpectacle = CREATIVE_ANGLES.filter(a => a.id !== 'spectacle');
  let pool = nonSpectacle.filter(a => !used.has(a.id));
  if (pool.length === 0) {
    const recent = new Set(usedIds.slice(-3));
    pool = CREATIVE_ANGLES.filter(a => !recent.has(a.id));
  }
  if (pool.length === 0) pool = CREATIVE_ANGLES;
  return pool[Math.floor(random() * pool.length) % pool.length];
}
