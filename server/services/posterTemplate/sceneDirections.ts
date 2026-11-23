/**
 * 海报场景方向库：开阔、有大场景感的海报背景。
 * 不指定方向时，模型几乎每次都回到“极简客厅 + 落地窗 + 远山”；早期只有 10 个方向，且多半是
 * “弧形建筑 / 海边 / 星际”，同一款产品连出几张看起来都一个样。
 * 现在按类别（family）分组，每次给模型 3 个最近没用过的类别里的候选，由模型按产品卖点挑最贴切的一个。
 */
export type SceneFamily =
  | 'architecture'
  | 'urban'
  | 'cosmic'
  | 'water'
  | 'desert'
  | 'mountain'
  | 'snow'
  | 'forest'
  | 'flower'
  | 'surreal';

export interface SceneDirection {
  id: string;
  label: string;
  family: SceneFamily;
  /** 给模型的方向说明：空间类型、远景、光线、能呼应命名的道具 */
  brief: string;
}

export const SCENE_DIRECTIONS: SceneDirection[] = [
  // ── 建筑 ──
  {
    id: 'future_arch',
    label: '未来弧形建筑',
    family: 'architecture',
    brief: '未来感建筑空间：大尺度弧形或螺旋结构、金属与石材饰面、天井或环形天窗透出蓝天白云，配金属弧形茶几与抽象雕塑（参考：银弧）。'
  },
  {
    id: 'art_gallery',
    label: '当代美术馆',
    family: 'architecture',
    brief: '当代建筑美术馆：清水混凝土或白色巨型体块，挑高十几米，顶部大天窗光柱洒下，尽头开向室外庭院或远山，旁边有大幅抽象雕塑，安静克制。'
  },
  {
    id: 'warm_arcade',
    label: '暖光拱廊',
    family: 'architecture',
    brief: '地中海或南欧风超长拱廊：连续拱窗外是湖景与山林，阳光斜照形成拱形光影，暖米色墙面，配石材圆几与陶罐植物（参考：煦岸）。'
  },
  {
    id: 'valley_window',
    label: '山谷落地窗',
    family: 'architecture',
    brief: '通高十米的大平层：整面落地玻璃外是山谷、湖面或日落远山，室内温润石材与木作（参考：栖谷）。这是最常见的方向，换别的方向更有辨识度。'
  },
  {
    id: 'glass_pavilion',
    label: '林间玻璃亭',
    family: 'architecture',
    brief: '极简钢构玻璃亭立在旷野或林间空地中央，四面无墙全透明，外面是一望无际的草原或树林，晨光穿透，地面是清水混凝土平台。'
  },
  // ── 城市 ──
  {
    id: 'night_city',
    label: '夜景城市',
    family: 'urban',
    brief: '摩天楼高层：整面玻璃外是城市天际线与江面灯火，室内环形灯带，冷暖对比，配金属或玻璃茶几（参考：弧光）。'
  },
  {
    id: 'rooftop_sky',
    label: '云端天台',
    family: 'urban',
    brief: '超高层开放式天台：无遮挡的 360° 城市全景与晚霞云层，玻璃护栏，风吹动纱帘，远处摩天楼尖顶没入云中，黄昏金粉色天光。'
  },
  // ── 星空 ──
  {
    id: 'cosmic',
    label: '星际窗景',
    family: 'cosmic',
    brief: '星际或月面基地：全景弧形舷窗外是月面山脉、星空与远处地球，室内深色石材与暖色灯光，配石材圆几与球形摆件（参考：月弧）。'
  },
  {
    id: 'aurora_tundra',
    label: '极光苔原',
    family: 'cosmic',
    brief: '北极圈苔原或冰岛熔岩原上的木平台，头顶是铺满天空的绿紫色极光与星河，远处雪山轮廓，地面有暖色篝火或灯笼光，冷暖强对比。'
  },
  {
    id: 'desert_stargaze',
    label: '沙漠观星',
    family: 'cosmic',
    brief: '沙漠营地夜晚：沙发放在沙丘之间的平台上，头顶是清晰的银河拱桥，远处沙丘剪影，脚边暖色地灯，适合表现躺姿与放松。'
  },
  // ── 水域 ──
  {
    id: 'seaside_platform',
    label: '海边弧形平台',
    family: 'water',
    brief: '海边弧形观景平台：落日海面、纱帘被海风吹起，蓝灰与暖金色调，配石材茶几与金属落地灯（参考：暮蓝）。'
  },
  {
    id: 'lakeside_terrace',
    label: '湖畔露台',
    family: 'water',
    brief: '山崖湖畔石材露台：背后是开阔湖面、远山与晨雾或暮色，旁边有低矮植物（参考：湖岚）。'
  },
  {
    id: 'salt_mirror',
    label: '天空之镜',
    family: 'water',
    brief: '盐湖“天空之镜”：浅水完美倒映整片天空与云朵，地平线无限延伸，沙发仿佛悬浮在天地之间，清晨或黄昏的柔和天光。'
  },
  {
    id: 'cliff_infinity_pool',
    label: '崖顶无边泳池',
    family: 'water',
    brief: '悬崖度假别墅平台：无边泳池的水面与远处海平线连成一线，石灰岩地面，白色遮阳帆，正午或午后的高亮天光，度假感。'
  },
  {
    id: 'waterfall_gorge',
    label: '峡谷瀑布',
    family: 'water',
    brief: '峡谷中的观景平台：对面是从高崖倾泻而下的巨型瀑布与水雾，彩虹横跨，苔藓岩壁，清新冷调与阳光穿透水雾。'
  },
  // ── 沙漠 ──
  {
    id: 'white_dunes',
    label: '白色沙丘',
    family: 'desert',
    brief: '连绵的白色或浅金沙丘：风吹出的流线纹理一路延伸到地平线，正午硬光或黄昏长影，极简、纯净，适合浅色产品。'
  },
  {
    id: 'red_canyon',
    label: '红岩峡谷',
    family: 'desert',
    brief: '红色砂岩峡谷或羚羊谷式的流线岩壁：巨大的层层岩纹，顶部一束光柱洒下，橙红与暖棕，适合焦糖、棕色与真皮质感。'
  },
  // ── 山野 ──
  {
    id: 'meadow_outdoor',
    label: '山野草地',
    family: 'mountain',
    brief: '开阔草地或艺术露台：远处湖泊与连绵山峦，自然天光（参考：云野舒境）。'
  },
  {
    id: 'cloud_peak',
    label: '云海之巅',
    family: 'mountain',
    brief: '高山之巅的岩石平台：脚下是翻涌的云海，远处一座座山尖刺出云层，日出金光从侧面照来，壮阔、静谧。'
  },
  {
    id: 'terraced_hills',
    label: '层叠梯田',
    family: 'mountain',
    brief: '层层叠叠的梯田或茶山：曲线一层层铺到远方山谷，晨雾在山腰流动，绿色与金色交错，节奏感与分段靠背呼应。'
  },
  // ── 冰雪 ──
  {
    id: 'glacier_lake',
    label: '冰川湖',
    family: 'snow',
    brief: '冰川湖畔：湖面漂着蓝白色浮冰，背后是巨大的冰川断面与雪峰，空气清冽，冷蓝与纯白，适合白色、灰色产品。'
  },
  {
    id: 'snowfield_lodge',
    label: '雪原木屋平台',
    family: 'snow',
    brief: '雪原上的木屋大平台：一望无际的雪野与雪松林，远处雪山，傍晚的暖色室内光从身后透出，冷暖对比，温暖包裹感。'
  },
  // ── 森林 ──
  {
    id: 'misty_pine',
    label: '雾中松林',
    family: 'forest',
    brief: '高大的松林或红杉林间空地：晨雾弥漫，光柱从树冠间斜射而下，林下苔藓与蕨类，深绿与暖光，安静而有纵深。'
  },
  {
    id: 'autumn_birch',
    label: '秋日白桦林',
    family: 'forest',
    brief: '金黄的秋日白桦林或枫林山谷：落叶铺满地面，林间小路延伸向远方，下午低角度暖光，金黄与橙红，温暖丰收感。'
  },
  {
    id: 'bamboo_grove',
    label: '竹海禅境',
    family: 'forest',
    brief: '无边竹海中的石材平台：高耸的竹林一层层延伸，绿色光线透过竹叶洒下，旁边一池静水倒映竹影，东方禅意。'
  },
  // ── 花田 ──
  {
    id: 'lavender_field',
    label: '薰衣草花海',
    family: 'flower',
    brief: '普罗旺斯式薰衣草花海：紫色花垄一行行延伸到地平线，远处石头农舍与橄榄树，黄昏暖金色侧光，浪漫柔和。'
  },
  {
    id: 'blossom_valley',
    label: '樱花山谷',
    family: 'flower',
    brief: '春日樱花或杏花山谷：粉白花树开满山坡，花瓣在风中飘落，远处雪山与蓝天，柔和明亮的春光，轻盈。'
  },
  // ── 超现实 ──
  {
    id: 'surreal_dream',
    label: '超现实梦境',
    family: 'surreal',
    brief: '超现实梦境空间：流动的白纱或拱形雕塑结构悬在水面与云海之上，浅色石材平台，光线柔和明亮（参考：昼梦）。'
  },
  {
    id: 'floating_isles',
    label: '悬浮岛屿',
    family: 'surreal',
    brief: '漂浮在云海中的巨大岩石岛屿：岛上有草地与瀑布垂落进云层，沙发在其中一座岛的平台上，远处还有更多悬浮岛，奇幻但光影真实。'
  }
];

/** 默认轮换时尽量少用的方向（太常见、模型自己就会往这里跑） */
const COMMON_DIRECTIONS = new Set(['valley_window']);

/**
 * 夜景 / 星空这类暗调方向：画面偏暗，沙发看不清，用户反馈要整体明亮。
 * 保留在库里（旧海报的记录还能查到名称），但不再参与自动轮换；用户自己要夜景时按用户要求来。
 */
export const DARK_DIRECTIONS = new Set(['night_city', 'cosmic', 'aurora_tundra', 'desert_stargaze']);
const ROTATION = SCENE_DIRECTIONS.filter(d => !DARK_DIRECTIONS.has(d.id));

export function findSceneDirection(id: unknown): SceneDirection | undefined {
  return typeof id === 'string' ? SCENE_DIRECTIONS.find(d => d.id === id) : undefined;
}

/**
 * 选一个本画布还没用过的方向；都用过了就从最久没用的里面选。
 * usedIds 按时间顺序（旧 → 新）。random 便于测试时固定结果。
 */
export function pickSceneDirection(usedIds: string[], random: () => number = Math.random): SceneDirection {
  const used = new Set(usedIds);
  let pool = ROTATION.filter(d => !used.has(d.id) && !COMMON_DIRECTIONS.has(d.id));
  if (pool.length === 0) {
    // 全用过了：排除最近用过的一半，从更早用过的里面挑
    const recent = new Set(usedIds.slice(-Math.ceil(SCENE_DIRECTIONS.length / 2)));
    pool = ROTATION.filter(d => !recent.has(d.id));
  }
  if (pool.length === 0) pool = ROTATION;
  return pool[Math.floor(random() * pool.length) % pool.length];
}

/**
 * 给模型挑的候选方向：n 个，彼此类别不同，且避开最近 4 张用过的类别和用过的方向。
 * 这样连出几张时，类别（建筑 / 水域 / 沙漠 / 森林……）一定在变，而不是在“弧形建筑、海边、星际”里打转。
 */
export function pickSceneCandidates(usedIds: string[], n = 3, random: () => number = Math.random): SceneDirection[] {
  const used = new Set(usedIds);
  const recentFamilies = new Set(
    usedIds
      .slice(-4)
      .map(id => findSceneDirection(id)?.family)
      .filter(Boolean)
  );
  const shuffled = [...ROTATION]
    .map(d => ({ d, k: random() }))
    .sort((a, b) => a.k - b.k)
    .map(x => x.d);

  const out: SceneDirection[] = [];
  const families = new Set<SceneFamily>();
  const tryAdd = (filter: (d: SceneDirection) => boolean) => {
    for (const d of shuffled) {
      if (out.length >= n) return;
      if (out.includes(d) || families.has(d.family) || !filter(d)) continue;
      out.push(d);
      families.add(d.family);
    }
  };
  // 1) 没用过的方向 + 最近没用过的类别 + 不是用滥的方向
  tryAdd(d => !used.has(d.id) && !recentFamilies.has(d.family) && !COMMON_DIRECTIONS.has(d.id));
  // 2) 放宽：最近没用过的类别
  tryAdd(d => !recentFamilies.has(d.family) && !COMMON_DIRECTIONS.has(d.id));
  // 3) 再放宽：没用过的方向
  tryAdd(d => !used.has(d.id));
  // 4) 兜底
  tryAdd(() => true);
  return out;
}

/** 两个命名算不算撞名：完全相同，或用字集合相同（云栖 / 栖云） */
export function namesCollide(a: string, b: string): boolean {
  const ca = Array.from(a.trim());
  const cb = Array.from(b.trim());
  if (ca.length === 0 || cb.length === 0) return false;
  if (ca.join('') === cb.join('')) return true;
  return ca.length === cb.length && [...ca].sort().join('') === [...cb].sort().join('');
}
