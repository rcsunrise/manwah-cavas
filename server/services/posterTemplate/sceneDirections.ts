/**
 * 海报场景方向库：取自参考海报的几类大胆场景。
 * 不指定方向时，模型几乎每次都回到“极简客厅 + 落地窗 + 远山”，同一款产品连出几张都一个样；
 * 所以每次先按轮换选定一个方向，再让模型在这个方向里构思命名与场景。
 */
export interface SceneDirection {
  id: string;
  label: string;
  /** 给模型的方向说明：空间类型、光线、能呼应命名的道具 */
  brief: string;
}

export const SCENE_DIRECTIONS: SceneDirection[] = [
  {
    id: 'future_arch',
    label: '未来弧形建筑',
    brief: '未来感建筑空间：大尺度弧形或螺旋结构、金属与石材饰面、天井或环形天窗透出蓝天白云，配金属弧形茶几与抽象雕塑（参考：银弧）。'
  },
  {
    id: 'night_city',
    label: '夜景城市',
    brief: '高层夜景：落地玻璃外是城市天际线与江面灯火，室内有环形或线性灯带，冷暖对比，配金属或玻璃茶几（参考：弧光）。'
  },
  {
    id: 'cosmic',
    label: '星际窗景',
    brief: '星际或月面基地：全景弧形舷窗外是月面山脉、星空与远处地球，室内深色石材与暖色灯光，配石材圆几与球形摆件（参考：月弧）。'
  },
  {
    id: 'surreal_dream',
    label: '超现实梦境',
    brief: '超现实梦境空间：流动的白纱或拱形雕塑结构悬在水面与云海之上，浅色石材平台，光线柔和明亮（参考：昼梦）。'
  },
  {
    id: 'lakeside_terrace',
    label: '湖畔露台',
    brief: '户外湖畔或山崖露台：沙发放在石材露台上，背后是湖面、远山与晨雾或暮色，旁边有低矮植物与石材圆几（参考：湖岚、自然之境）。'
  },
  {
    id: 'meadow_outdoor',
    label: '山野草地',
    brief: '户外山野：沙发直接摆在开阔草地或艺术露台上，远处湖泊与连绵山峦，自然天光，可以有人物在沙发上放松（参考：云野舒境）。'
  },
  {
    id: 'seaside_platform',
    label: '海边弧形平台',
    brief: '海边弧形观景平台：落日海面、纱帘被海风吹起，蓝灰与暖金色调，配石材茶几与金属落地灯（参考：暮蓝）。'
  },
  {
    id: 'warm_arcade',
    label: '暖光拱廊',
    brief: '地中海或南欧风拱廊空间：连续拱窗外是湖景与山林，阳光斜照形成拱形光影，暖米色墙面，配石材圆几与陶罐植物（参考：煦岸、云舒）。'
  },
  {
    id: 'art_gallery',
    label: '当代美术馆',
    brief: '当代建筑美术馆或艺术画廊：清水混凝土或白色体块空间，顶部天光洒下，墙上或旁边有大幅抽象艺术品或雕塑，安静克制。'
  },
  {
    id: 'valley_window',
    label: '山谷落地窗',
    brief: '室内大平层：通高落地窗外是山谷、湖面或日落远山，室内温润石材与木作，配石材圆几（参考：栖谷）。这是最常见的方向，换别的方向更有辨识度。'
  }
];

/** 默认轮换时尽量少用的方向（太常见、模型自己就会往这里跑） */
const COMMON_DIRECTIONS = new Set(['valley_window']);

export function findSceneDirection(id: unknown): SceneDirection | undefined {
  return typeof id === 'string' ? SCENE_DIRECTIONS.find(d => d.id === id) : undefined;
}

/**
 * 选一个本画布还没用过的方向；都用过了就从最久没用的里面选。
 * usedIds 按时间顺序（旧 → 新）。random 便于测试时固定结果。
 */
export function pickSceneDirection(usedIds: string[], random: () => number = Math.random): SceneDirection {
  const used = new Set(usedIds);
  let pool = SCENE_DIRECTIONS.filter(d => !used.has(d.id) && !COMMON_DIRECTIONS.has(d.id));
  if (pool.length === 0) {
    // 全用过了：排除最近用过的一半，从更早用过的里面挑
    const recent = new Set(usedIds.slice(-Math.ceil(SCENE_DIRECTIONS.length / 2)));
    pool = SCENE_DIRECTIONS.filter(d => !recent.has(d.id));
  }
  if (pool.length === 0) pool = SCENE_DIRECTIONS;
  return pool[Math.floor(random() * pool.length) % pool.length];
}

/** 两个命名算不算撞名：完全相同，或用字集合相同（云栖 / 栖云） */
export function namesCollide(a: string, b: string): boolean {
  const ca = Array.from(a.trim());
  const cb = Array.from(b.trim());
  if (ca.length === 0 || cb.length === 0) return false;
  if (ca.join('') === cb.join('')) return true;
  return ca.length === cb.length && [...ca].sort().join('') === [...cb].sort().join('');
}
