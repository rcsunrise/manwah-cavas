// src/features/space-studio/data/stylePresets.ts
// MANWAH Space Studio｜12 大贵族空间风格系统 (Style Library V3.0)
import { StylePreset } from '../../../types/spaceStudio';

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'style-01',
    code: 'ST-01',
    name: '都会收藏家 (Metropolitan Collector)',
    category: '现代奢华',
    colorPalette: ['#2B2A29', '#8C857B', '#DCD7D0', '#A67C52'],
    materialSystem: ['南美进口头层牛皮', '潘多拉微晶奢石', '哑光深烟熏橡木', '拉丝古铜'],
    lifestyleTags: ['艺术策展', '静谧内敛', '高精质感'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'coffee_table'],
    promptFragments: [
      'metropolitan art collector interior style',
      'subdued palette of warm greige, espresso smoked oak, and subtle brushed champagne brass',
      'refined architectural natural lighting through clean linen sheers'
    ],
    negativeRules: ['cheap laminate', 'vibrant neon colors', 'chaotic plastic items']
  },
  {
    id: 'style-02',
    code: 'ST-02',
    name: '意式极简静奢 (Italian Quiet Luxury)',
    category: '意式极简',
    colorPalette: ['#EAE6E1', '#BCB5AC', '#4A4643', '#8A6240'],
    materialSystem: ['细腻摔纹半苯胺皮', '天然石灰华洞石', '极细黑钛五金', '厚织羊毛地毯'],
    lifestyleTags: ['极简留白', '雕塑感', '低调奢华'],
    recommendedProductTypes: ['sofa_3seat', 'sofa_2seat', 'coffee_table'],
    promptFragments: [
      'italian architectural quiet luxury aesthetic',
      'minimalist proportioned furniture, honed porous travertine coffee table',
      'sculptural negative space and soft diffused overcast daylight'
    ],
    negativeRules: ['ornate baroque moldings', 'overly glossy floors', 'bright saturated colors']
  },
  {
    id: 'style-03',
    code: 'ST-03',
    name: '东方禅意雅境 (Oriental Zen Serenity)',
    category: '新中式/禅意',
    colorPalette: ['#1C1B1A', '#5C554E', '#C2B8AA', '#3E4F42'],
    materialSystem: ['哑光磨砂软牛皮', '黑檀黑金木', '天然麻布壁布', '水墨透光云石'],
    lifestyleTags: ['品茗雅集', '天人合一', '书香隐奢'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'side_table'],
    promptFragments: [
      'contemporary oriental zen luxury sanctuary',
      'harmonious blend of clean modern leather seating and subtle dark ebony wood joinery',
      'soft shadow play from minimalist bamboo or garden courtyard outside'
    ],
    negativeRules: ['cluttered traditional red wood carvings', 'gilded shiny gold', 'disjointed colors']
  },
  {
    id: 'style-04',
    code: 'ST-04',
    name: '法式现代新经典 (French Modern Elegance)',
    category: '法式新古典',
    colorPalette: ['#F7F5F0', '#D3C8B8', '#594A3C', '#9E7E52'],
    materialSystem: ['珍珠光泽小牛皮', '卡拉卡塔白金大理石', '法式石膏线条', '黄铜法式壁灯'],
    lifestyleTags: ['优雅浪漫', '仪式感', '复古摩登'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'coffee_table'],
    promptFragments: [
      'parisian modern luxury residence with refined classic wall mouldings',
      'calacatta gold marble floor accents and soft ivory linen window drapery',
      'graceful romantic morning Parisian sunlight'
    ],
    negativeRules: ['heavy baroque gold leafing', 'crude rustic elements', 'cold industrial pipes']
  },
  {
    id: 'style-05',
    code: 'ST-05',
    name: '南加州自然暖意 (Californian Warm Modern)',
    category: '自然现代',
    colorPalette: ['#EADBC8', '#A9927D', '#5E503F', '#223322'],
    materialSystem: ['暖驼色油蜡皮', '天然白蜡原木', '粗纺亚麻棉', '绿植橄榄树'],
    lifestyleTags: ['阳光海岸', '有机质感', '松弛惬意'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'coffee_table'],
    promptFragments: [
      'warm modern coastal California pavilion interior',
      'sun-drenched architectural space with bleached white oak and organic clay plaster walls',
      'potted architectural fiddle leaf fig or olive tree in gentle natural breeze'
    ],
    negativeRules: ['dark moody tones', 'harsh chrome metals', 'artificial gloss']
  },
  {
    id: 'style-06',
    code: 'ST-06',
    name: '北欧高保真原木 (Nordic Organic Sanctuary)',
    category: '北欧静谧',
    colorPalette: ['#F2EFEB', '#D4CDC3', '#736B5E', '#2F3E46'],
    materialSystem: ['亲肤磨砂牛皮', '山核桃实木', '手工羊毛粗毯', '纯白水洗布'],
    lifestyleTags: ['治愈温馨', '人本工学', '自然森系'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'side_table'],
    promptFragments: [
      'nordic organic architectural sanctuary',
      'soothing pale timber cladding, clean geometric lines, cozy woven textures',
      'high CRI pure daylight filtering through sheer minimalist windows'
    ],
    negativeRules: ['clashing patterns', 'cheap plastic', 'high saturation']
  },
  {
    id: 'style-07',
    code: 'ST-07',
    name: '暗夜天际锋芒 (Midnight Skyline Club)',
    category: '暗调奢华',
    colorPalette: ['#141414', '#2C2B2A', '#8F7E6D', '#B58E58'],
    materialSystem: ['黑曜石色全粒面牛皮', '劳伦黑金奢石', '古铜金细拉丝', '灰玻氛围光'],
    lifestyleTags: ['私享酒廊', '天际夜景', '锋芒毕露'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'coffee_table'],
    promptFragments: [
      'dramatic dark luxury penthouse lounge at dusk',
      'deep charcoal and bronze architectural finishes, illuminated backlit onyx stone bar',
      'panoramic twilight cityscape bokeh lights outside through clean glass'
    ],
    negativeRules: ['pastel baby colors', 'rustic wood', 'excessive white drywall']
  },
  {
    id: 'style-08',
    code: 'ST-08',
    name: '大地微水泥侘寂 (Earthy Wabi-Sabi Sanctuary)',
    category: '质朴侘寂',
    colorPalette: ['#DFD7CE', '#B3A698', '#665C53', '#3F3B36'],
    materialSystem: ['自然摔纹素皮', '无缝微水泥', '老木横梁', '陶艺手工器皿'],
    lifestyleTags: ['纯粹本真', '沉浸呼吸', '冥想庇护'],
    recommendedProductTypes: ['sofa_3seat', 'coffee_table', 'side_table'],
    promptFragments: [
      'architectural wabi-sabi sanctuary with continuous microcement floor and walls',
      'handcrafted primitive clay vessels and raw natural tactile textures',
      'raking natural side lighting catching the textured plaster surfaces'
    ],
    negativeRules: ['mirrored surfaces', 'glossy tiles', 'garish neon lighting']
  },
  {
    id: 'style-09',
    code: 'ST-09',
    name: '包豪斯几何理性 (Bauhaus Geometric Modernism)',
    category: '现代设计',
    colorPalette: ['#1A1A1A', '#EFEFEF', '#A31D1D', '#1D4ED8'],
    materialSystem: ['马鞍真皮', '抛光镜面不锈钢管', '黑漆实木', '平板光学玻璃'],
    lifestyleTags: ['建筑大师', '几何构成', '工业美学'],
    recommendedProductTypes: ['recliner_1seat', 'sofa_3seat', 'coffee_table'],
    promptFragments: [
      'bauhaus inspired modernist living pavilion',
      'clean structural chrome steel tubular elements paired with rich tactile leather',
      'bold precise architectural planes and crisp shadow gradients'
    ],
    negativeRules: ['curvy baroque flourishes', 'heavy rustic textiles']
  },
  {
    id: 'style-10',
    code: 'ST-10',
    name: '纽约上东区典雅 (Manhattan Classic Chic)',
    category: '经典都会',
    colorPalette: ['#23282B', '#7A8489', '#E5E1DA', '#C5A059'],
    materialSystem: ['鞍褐色马鞍皮', '千鸟格精纺羊毛', '黑胡桃木', '缎面复古铜'],
    lifestyleTags: ['名流聚会', '精英品味', '经典传承'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'coffee_table'],
    promptFragments: [
      'manhattan upper east side grand apartment interior',
      'rich saddle leather, tailored houndstooth wool cushions, bespoke dark walnut millwork',
      'majestic fireplace mantel and warm tungsten architectural picture lights'
    ],
    negativeRules: ['cheap faux fur', 'neon lighting', 'cluttered bohemian']
  },
  {
    id: 'style-11',
    code: 'ST-11',
    name: '热带雨林私邸 (Tropical Modern Estate)',
    category: '热带奢华',
    colorPalette: ['#1F2421', '#4D5B4F', '#DCE2BD', '#997B66'],
    materialSystem: ['深森林绿复古牛皮', '缅甸柚木', '热带芭蕉水景', '火山岩石板'],
    lifestyleTags: ['度假避世', '热带雨林', '自然无界'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'coffee_table'],
    promptFragments: [
      'tropical modern luxury pavilion with seamless indoor-outdoor sliding glass panels',
      'lush exotic green palms and architectural foliage framed perfectly',
      'warm teak wood slatted ceiling and natural lava stone walls'
    ],
    negativeRules: ['cold sterile hospital white', 'heavy winter furs']
  },
  {
    id: 'style-12',
    code: 'ST-12',
    name: '未来感星舰隐奢 (Futuristic Aerospace Haven)',
    category: '未来先锋',
    colorPalette: ['#0F1115', '#2A303C', '#8892B0', '#00F0FF'],
    materialSystem: ['航天级纳米防污皮', '航空铝合金', '碳纤维编织板', '隐形曲面导光板'],
    lifestyleTags: ['科技美学', '未来出行', '先锋智享'],
    recommendedProductTypes: ['recliner_1seat', 'sofa_3seat', 'coffee_table'],
    promptFragments: [
      'futuristic aerospace luxury lounge interior',
      'ultra-smooth continuous fluid curves, precision milled matte aluminum details',
      'subtle concealed 4000k linear architectural accent lighting seamlessly integrated'
    ],
    negativeRules: ['aged antique distressed wood', 'classical floral prints']
  }
];
