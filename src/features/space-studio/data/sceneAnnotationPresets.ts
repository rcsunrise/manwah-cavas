// src/features/space-studio/data/sceneAnnotationPresets.ts
// MANWAH Space Studio｜典型客餐厅全案全景 1~14 号产品标注真值预设与解构模板
import { DisaggregatedProductItem, ProductAsset } from '../../../types/spaceStudio';

/**
 * 对应真实高定影棚客餐厅实拍样本中的 14 款家具与软装资产真值
 */
export const SAMPLE_SUITE_ANNOTATIONS_14: DisaggregatedProductItem[] = [
  {
    id: 'ann-01-sofa-2s',
    name: '左翼双人位电动功能沙发 (菱格绗缝)',
    sku: 'MW-S9821-2S-MOTION',
    role: 'sofa_2seat',
    priority: 'primary',
    dimensions: { width: 1980, depth: 1050, height: 960 },
    materials: ['南美半苯胺头层牛皮', '德国超静音高碳钢电机'],
    colors: ['马鞍棕 (Caramel Saddle Brown)'],
    functionCapable: true,
    boundingBox: { ymin: 56, xmin: 10, ymax: 76, xmax: 29 },
    roleTitle: '左翼双人功能位',
    dossierSummary: '带侧翼菱格纹定制绗缝，支持腿托 110°-160° 独立舒展'
  },
  {
    id: 'ann-02-sofa-3s',
    name: '客厅核心三人位直排主沙发 (主位舒享)',
    sku: 'MW-S9821-3S-MAIN',
    role: 'sofa_3seat',
    priority: 'primary',
    dimensions: { width: 3150, depth: 1080, height: 960 },
    materials: ['南美半苯胺头层牛皮', '高弹记忆海绵'],
    colors: ['马鞍棕 (Caramel Saddle Brown)'],
    functionCapable: true,
    boundingBox: { ymin: 52, xmin: 31, ymax: 67, xmax: 60 },
    roleTitle: '客厅主沙发',
    dossierSummary: '三座连排，宽大扶手与饱满靠包，全案视觉核心锚点'
  },
  {
    id: 'ann-03-recliner-1s',
    name: '右翼独立头等舱功能单椅 (零重力小憩)',
    sku: 'MW-RC-1108-AIR',
    role: 'recliner_1seat',
    priority: 'primary',
    dimensions: { width: 980, depth: 1000, height: 1050 },
    materials: ['南美半苯胺头层牛皮', '多角度无级伸展机构'],
    colors: ['马鞍棕 (Caramel Saddle Brown)'],
    functionCapable: true,
    boundingBox: { ymin: 56, xmin: 60, ymax: 74, xmax: 78 },
    roleTitle: '单椅功能位',
    dossierSummary: '160° 超大零重力仰角，独立活动式高定单人位'
  },
  {
    id: 'ann-04-carpet-living',
    name: '大平层客厅提花艺术羊毛地毯',
    sku: 'MW-DE-CPT-400',
    role: 'decor',
    priority: 'decor',
    dimensions: { width: 4000, depth: 3000, height: 20 },
    materials: ['新西兰精纺羊毛', '手工剪花'],
    colors: ['象牙暖白配极简几何纹 (Ivory Beige)'],
    functionCapable: false,
    boundingBox: { ymin: 66, xmin: 18, ymax: 80, xmax: 71 },
    roleTitle: '核心地毯',
    dossierSummary: '承托沙发与茶几围合动线，柔和吸音，定义核心会客区'
  },
  {
    id: 'ann-05-coffee-table',
    name: '意式双拼悬浮茶几 (劳伦黑金岩板+实木方几)',
    sku: 'MW-CT-8802-SET',
    role: 'coffee_table',
    priority: 'secondary',
    dimensions: { width: 1400, depth: 800, height: 420 },
    materials: ['劳伦黑金高光岩板', '黑橡木木作', '哑光金属底脚'],
    colors: ['黑金奢石纹理配沉稳炭黑'],
    functionCapable: false,
    boundingBox: { ymin: 64, xmin: 37, ymax: 74, xmax: 53 },
    roleTitle: '客厅茶几组',
    dossierSummary: '错层高低双拼，黑金石材光影对冲'
  },
  {
    id: 'ann-06-dining-chair',
    name: '高定餐厅软包马鞍皮餐椅组',
    sku: 'MW-DC-3301-SET',
    role: 'dining_chair',
    priority: 'secondary',
    dimensions: { width: 560, depth: 580, height: 820 },
    materials: ['硬质马鞍皮', '织物座垫', '黑钛合金椅脚'],
    colors: ['极地暖灰配深咖'],
    functionCapable: false,
    boundingBox: { ymin: 51, xmin: 63, ymax: 60, xmax: 75 },
    roleTitle: '餐厅餐椅组',
    dossierSummary: '弧形围合靠背，符合人体工学挺拔坐姿'
  },
  {
    id: 'ann-07-dining-table',
    name: '轻奢现代大理石圆餐桌',
    sku: 'MW-DT-5501-RND',
    role: 'dining_table',
    priority: 'secondary',
    dimensions: { width: 1500, depth: 1500, height: 750 },
    materials: ['雪山银狐天然大理石', '拉丝黑钛底座'],
    colors: ['雪山银狐灰白'],
    functionCapable: false,
    boundingBox: { ymin: 49, xmin: 59, ymax: 58, xmax: 76 },
    roleTitle: '餐厅主桌',
    dossierSummary: '圆融大器，承载 6~8 人社交聚餐'
  },
  {
    id: 'ann-08-tv-console',
    name: '现代极简悬浮岩板电视矮柜',
    sku: 'MW-TV-6603-BLK',
    role: 'tv_console',
    priority: 'secondary',
    dimensions: { width: 2800, depth: 450, height: 400 },
    materials: ['哑光黑金岩板', '黑色烤漆阻尼抽屉'],
    colors: ['曜石纯黑配金丝纹'],
    functionCapable: false,
    boundingBox: { ymin: 61, xmin: 82, ymax: 78, xmax: 99 },
    roleTitle: '电视地柜',
    dossierSummary: '贴地水平延伸，与右侧玻璃展示柜贯通'
  },
  {
    id: 'ann-09-glass-cabinet',
    name: '金属窄边框透明立式酒柜/展示柜',
    sku: 'MW-CB-7705-GLS',
    role: 'decor',
    priority: 'decor',
    dimensions: { width: 900, depth: 420, height: 2100 },
    materials: ['超白钢化玻璃', '暗藏式 3000K 线性射灯', '古铜金铝框'],
    colors: ['透光古铜金'],
    functionCapable: false,
    boundingBox: { ymin: 38, xmin: 79, ymax: 66, xmax: 87 },
    roleTitle: '玻璃酒柜',
    dossierSummary: '陈列奖杯与名酒，内嵌氛围背光'
  },
  {
    id: 'ann-10-wall-art',
    name: '餐厅背景墙现代当代艺术挂画',
    sku: 'MW-AC-ART-101',
    role: 'decor',
    priority: 'decor',
    dimensions: { width: 1000, depth: 50, height: 1200 },
    materials: ['油画肌理画布', '哑光黑木画框'],
    colors: ['复古绯红与深邃黑'],
    functionCapable: false,
    boundingBox: { ymin: 36, xmin: 62, ymax: 45, xmax: 68 },
    roleTitle: '艺术挂画',
    dossierSummary: '提升餐厅立面艺术格调与纵深感'
  },
  {
    id: 'ann-11-sideboard',
    name: '餐厅多功能餐边置物矮柜',
    sku: 'MW-SB-4402',
    role: 'side_table',
    priority: 'decor',
    dimensions: { width: 1600, depth: 400, height: 850 },
    materials: ['实木多层板', '黑钛拉手'],
    colors: ['深灰木纹'],
    functionCapable: false,
    boundingBox: { ymin: 48, xmin: 60, ymax: 54, xmax: 69 },
    roleTitle: '餐边柜',
    dossierSummary: '承托红酒杯、咖啡机与软装'
  },
  {
    id: 'ann-12-decor-lamp',
    name: '餐桌高定花艺与艺术台灯组合',
    sku: 'MW-AC-LMP-05',
    role: 'decor',
    priority: 'decor',
    dimensions: { width: 400, depth: 400, height: 600 },
    materials: ['吹制玻璃', '秋色干花花艺'],
    colors: ['暖白光配琥珀色'],
    functionCapable: false,
    boundingBox: { ymin: 41, xmin: 67, ymax: 51, xmax: 74 },
    roleTitle: '软装摆件',
    dossierSummary: '点缀就餐情调与生机'
  },
  {
    id: 'ann-13-pillow-left',
    name: '主沙发左翼定制提花羊绒抱枕',
    sku: 'MW-PLW-GEO-L',
    role: 'decor',
    priority: 'decor',
    dimensions: { width: 480, depth: 150, height: 480 },
    materials: ['提花羊绒', '天然羽绒填充'],
    colors: ['野性大地动物纹提花'],
    functionCapable: false,
    boundingBox: { ymin: 53, xmin: 34, ymax: 60, xmax: 39 },
    roleTitle: '主沙发靠枕左',
    dossierSummary: '打破深色皮质单一感，注入高奢织物层次'
  },
  {
    id: 'ann-14-pillow-right',
    name: '主沙发右翼定制提花羊绒抱枕',
    sku: 'MW-PLW-GEO-R',
    role: 'decor',
    priority: 'decor',
    dimensions: { width: 480, depth: 150, height: 480 },
    materials: ['提花羊绒', '天然羽绒填充'],
    colors: ['野性大地动物纹提花'],
    functionCapable: false,
    boundingBox: { ymin: 53, xmin: 52, ymax: 60, xmax: 58 },
    roleTitle: '主沙发靠枕右',
    dossierSummary: '与左侧抱枕对称呼应'
  }
];

/**
 * 将标注数据转为可注入产品资产库的标准 ProductAsset 集合
 */
export function convertAnnotationsToProductAssets(annotations: DisaggregatedProductItem[]): ProductAsset[] {
  return annotations.map((ann, idx) => ({
    id: `prod-${ann.id}`,
    name: ann.name,
    sku: ann.sku || `MW-AUTO-${idx + 1}`,
    role: ann.role,
    priority: ann.priority,
    identityLock: ann.priority === 'primary' ? ('strict' as const) : ('normal' as const),
    dimensions: ann.dimensions,
    materials: ann.materials,
    colors: ann.colors,
    adaptiveStyles: ['现代轻奢', '意式极简'],
    isEnsembleIncluded: true,
    functionCapable: ann.functionCapable ?? false,
    referenceImages: [],
    dossierSummary: ann.dossierSummary,
    boundingBox: ann.boundingBox
  }));
}
