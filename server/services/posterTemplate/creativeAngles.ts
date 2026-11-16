/**
 * 海报创意切入角度：决定“产品卖点怎么和大场景发生关系”。
 * 所有角度都落在开阔的大场景里（场景候选见 sceneDirections.ts），角度只决定从哪个卖点出发、
 * 用什么逻辑把卖点和场景连起来，这样画面既保持海报的大场景感，又不会每张都是同一种套路。
 */
export interface CreativeAngle {
  id: string;
  label: string;
  /** 给模型的说明：怎么从卖点推出大场景，以及举例 */
  brief: string;
}

export const CREATIVE_ANGLES: CreativeAngle[] = [
  {
    id: 'function',
    label: '功能演绎',
    brief:
      '从这款产品的功能或坐感体验出发，选一个能让人想“就在这里躺下 / 坐下”的大场景。例：电动躺/头枕 → 沙漠观星或极光下半躺仰望星空；宽大坐深 → 云海之巅一家人窝着看日出；高回弹 → 天空之镜上轻盈得像浮在云里。'
  },
  {
    id: 'material',
    label: '材质呼应',
    brief:
      '从面料与材质的质感出发，选质感相通的大场景。例：头层真皮的温润光泽 → 红岩峡谷的暖色岩壁、秋日白桦林的金色光；科技布/绒面的柔软 → 白色沙丘的细沙、雾中松林的苔藓；金属脚的利落 → 未来建筑的金属与石材。'
  },
  {
    id: 'color',
    label: '色彩呼应',
    brief:
      '从产品主色出发，选同色系或强对比色的大场景，让整张图的色调围绕产品。例：米白/奶油 → 白色沙丘、天空之镜、樱花山谷（同色系）；灰色 → 冰川湖、雾中松林（同色系）或薰衣草花海（对比）；焦糖/棕色 → 红岩峡谷、秋日林谷。'
  },
  {
    id: 'form',
    label: '造型呼应',
    brief:
      '从产品最有辨识度的线条出发（扶手弧度、分段靠背的节奏、纤细金属脚、方正轮廓），选造型语言相通的大场景。例：分段饱满靠背 → 层叠梯田、沙丘风纹；圆润扶手 → 弧形建筑、悬浮岛屿；纤细金属脚 → 极简玻璃亭、美术馆体块。'
  },
  {
    id: 'mood',
    label: '情绪意境',
    brief:
      '从产品给人的情绪出发（安静、松弛、尊贵、浪漫、自由），选最能放大这种情绪的大场景和时刻。例：松弛 → 崖顶无边泳池的午后；尊贵 → 云端天台的黄昏城市；浪漫 → 薰衣草花海的日落；自由 → 山野草地的清晨。'
  }
];

export function findCreativeAngle(id: unknown): CreativeAngle | undefined {
  return typeof id === 'string' ? CREATIVE_ANGLES.find(a => a.id === id) : undefined;
}

/**
 * 选一个这款产品还没用过的角度；都用过了，避开最近 2 次。
 * usedIds 按时间顺序（旧 → 新），random 便于测试。
 */
export function pickCreativeAngle(usedIds: string[], random: () => number = Math.random): CreativeAngle {
  const used = new Set(usedIds);
  let pool = CREATIVE_ANGLES.filter(a => !used.has(a.id));
  if (pool.length === 0) {
    const recent = new Set(usedIds.slice(-2));
    pool = CREATIVE_ANGLES.filter(a => !recent.has(a.id));
  }
  if (pool.length === 0) pool = CREATIVE_ANGLES;
  return pool[Math.floor(random() * pool.length) % pool.length];
}
