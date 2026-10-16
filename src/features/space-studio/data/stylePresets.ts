// src/features/space-studio/data/stylePresets.ts
// MANWAH Space Studio｜全球住宅空间风格标准化体系 (Style Library V4.0)
// 架构：东方住宅 / 欧美住宅 (V1.0) / 国际现代 三大体系并行不替换
// 每个 Style Preset 严格标准化承载 8 类核心数据

import { StylePreset } from '../../../types/spaceStudio';

export const STYLE_PRESETS: StylePreset[] = [
  // ==========================================
  // 一、 欧美住宅 (Western Living - V1.0)
  // ==========================================
  {
    id: 'style-us-01',
    code: 'US-01',
    name: '现代美式都会宅 (Modern American Metropolitan)',
    category: '欧美住宅',
    cityCharacter: 'New York / Boston / Chicago ｜ 稳重、家庭化、体面、都市高净值',
    colorPalette: ['#E6DFD5', '#5C4A3E', '#362B28', '#C5A059'], // 暖米、烟棕、深胡桃、黄铜
    materialSystem: ['深胡桃木', '暖灰大理石', '头层摔纹真皮', '拉丝黄铜', '羊毛地毯'],
    lifestyleTags: ['家庭聚会', '稳重体面', '都会精英', '温暖品质'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'coffee_table'],
    typicalLayout: '城市大平层 / 都会复式',
    promptFragments: [
      'refined modern american metropolitan residence living room',
      'stately and familial warmth, rich walnut millwork, warm greige textured stone, brushed brass accents',
      'deep leather seating and elegant natural afternoon daylight through tailored linen sheers'
    ],
    negativeRules: [
      'no rustic farmhouse',
      'no barn doors',
      'no cheap laminate',
      'no neon colors',
      'no cold stark white clinic vibe'
    ],
    referenceImages: []
  },
  {
    id: 'style-us-02',
    code: 'US-02',
    name: '美式庄园宅 (American Grand Manor Estate)',
    category: '欧美住宅',
    cityCharacter: 'Dallas / Houston / Atlanta ｜ 大体量、正式会客、家族住宅、庄重',
    colorPalette: ['#D8CAB8', '#2C221E', '#8A827A', '#38423B'], // 奶咖、深木、暖灰、深青
    materialSystem: ['石材壁炉', '深木护墙', '重磅马鞍真皮', '花呢织物', '古铜金属'],
    lifestyleTags: ['家族会客', '壁炉仪式', '名门宅邸', '庄重大体量'],
    recommendedProductTypes: ['sofa_3seat', 'sofa_2seat', 'recliner_1seat', 'coffee_table'],
    typicalLayout: '独栋庄园别墅 / 挑高竖厅',
    promptFragments: [
      'grand american manor estate living salon with soaring ceiling',
      'substantial carved stone fireplace mantel, rich dark wood wainscoting and wall paneling',
      'formal family gathering layout, 3+2+1 seating arrangement with heavy thick leather sofas, warm ambient chandelier glow'
    ],
    negativeRules: [
      'no ultra-modern glass box',
      'no flat drywall minimalism',
      'no cheap faux leather',
      'no bare industrial concrete'
    ],
    referenceImages: []
  },
  {
    id: 'style-it-01',
    code: 'IT-01',
    name: '意式现代奢居 (Italian Architectural Luxury)',
    category: '欧美住宅',
    cityCharacter: 'Milan / Turin ｜ 建筑感、低调奢华、成熟时尚、克制',
    colorPalette: ['#A8A29E', '#EDE8E1', '#3B312B', '#44403C', '#785E48'], // 灰棕、暖灰、米白、深木、古铜
    materialSystem: ['罗马洞石', '深色胡桃木', '拉丝钛金金属', '烟熏玻璃', '厚织羊毛地毯', '深色半苯胺真皮'],
    lifestyleTags: ['建筑构图', '低重心', '静谧隐奢', '画廊风貌'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'coffee_table', 'lounge_chair'],
    typicalLayout: '环幕大平层 / 顶层复式 Penthouse',
    promptFragments: [
      'milanese architectural modern luxury salon, open-plan architectural layout',
      'honed porous roman travertine stone, rich smoked dark walnut joinery, ultra-slim brushed titanium metal',
      'floor-to-ceiling clean glass, diffuse overcast daylight, low-profile quiet sophistication, gallery-like space'
    ],
    negativeRules: [
      'no hotel lobby',
      'no excessive gold',
      'no ornate classical carving',
      'no showroom feeling',
      'no cold white marble palace'
    ],
    referenceImages: []
  },
  {
    id: 'style-it-02',
    code: 'IT-02',
    name: '意式经典雅宅 (Italian Timeless Classic Elegance)',
    category: '欧美住宅',
    cityCharacter: 'Florence / Rome ｜ 优雅、艺术底蕴、经典文艺、适度复古',
    colorPalette: ['#F4EFEA', '#A25828', '#6E5142', '#A89269'], // 米白、焦糖、暖褐、橄榄暖黄
    materialSystem: ['天然石材', '暖调木饰面', '全粒面焦糖真皮', '天然粗织亚麻', '锻铁古铜'],
    lifestyleTags: ['艺术典雅', '经典传承', '匠心手作', '文艺沙龙'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'side_table', 'coffee_table'],
    typicalLayout: '古典别墅 / 庭院大平层',
    promptFragments: [
      'florentine elegant timeless residence, classic italian bespoke craftsmanship',
      'subtle architectural cornices, warm caramel and cognac saddle leather sofa, fluted natural timber paneling',
      'soft warm morning daylight with artistic museum shadows, refined cultured atmosphere'
    ],
    negativeRules: [
      'no gaudy rococo gilding',
      'no industrial rust',
      'no sterile high-gloss tiles',
      'no cheap acrylic'
    ],
    referenceImages: []
  },
  {
    id: 'style-eu-01',
    code: 'EU-01',
    name: '简欧雅奢 (Transitional European Chic)',
    category: '欧美住宅',
    cityCharacter: 'Paris / Brussels / Vienna ｜ 明亮、优雅、精致、住宅温馨感',
    colorPalette: ['#FAF7F2', '#D6D3D1', '#E7DEC8', '#D4AF37'], // 奶油白、浅灰、暖米、香槟金
    materialSystem: ['浅色鱼肚白石材', '简洁线板护墙', '橡木鱼骨拼木地板', '高级织物天鹅绒'],
    lifestyleTags: ['明亮精致', '轻盈优雅', '都市法式调', '通透温馨'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'coffee_table'],
    typicalLayout: '城市大平层 / 都会复式',
    promptFragments: [
      'refined transitional european modern apartment living room, luminous and soft ambiance',
      'delicate minimalist boiserie wall moldings, pale herringbone parquet flooring, light honed marble accents',
      'light cream or warm beige leather seating, crisp linen drapery, serene daylight'
    ],
    negativeRules: [
      'no heavy golden rococo',
      'no dark gothic tones',
      'no cold metallic factory aesthetic',
      'no gaudy crystal chandeliers'
    ],
    referenceImages: []
  },
  {
    id: 'style-nc-01',
    code: 'NC-01',
    name: '欧美新古典 (Heritage Neoclassical Grandeur)',
    category: '欧美住宅',
    cityCharacter: 'Vienna / Geneva / London ｜ 对称、秩序、文化感、家族传承',
    colorPalette: ['#F5F3EF', '#2B211B', '#8B6B43', '#1E293B'], // 暖白、深棕、古铜、深蓝
    materialSystem: ['立面护墙板', '石材壁炉', '古铜黄铜', '名贵木饰面', '贵族深色真皮'],
    lifestyleTags: ['轴线对称', '家族传承', '名流聚会', '古典秩序'],
    recommendedProductTypes: ['sofa_3seat', 'sofa_2seat', 'recliner_1seat', 'coffee_table'],
    typicalLayout: '庄园别墅 / 顶层大宅',
    promptFragments: [
      'neoclassical grand heritage salon with strict architectural symmetry',
      'grand fluted pilasters and refined classical wall paneling, carved limestone fireplace, antique patinated brass details',
      'stately deep brown leather chesterfield-inspired seating, soft majestic morning light'
    ],
    negativeRules: [
      'no plastic furniture',
      'no asymmetrical jagged shapes',
      'no harsh neon lighting',
      'no raw industrial concrete'
    ],
    referenceImages: []
  },
  {
    id: 'style-uk-01',
    code: 'UK-01',
    name: '英伦收藏家 (British Collector Sanctuary)',
    category: '欧美住宅',
    cityCharacter: 'London / Oxford / Cambridge / Greenwich ｜ 阅读、艺术收藏、成熟家族宅',
    colorPalette: ['#3A241D', '#1C3328', '#541A24', '#E0D5C1'], // 深木、墨绿、酒红、米色
    materialSystem: ['深木书柜', '复古重磅真皮', '黄铜阅读灯', '羊毛苏格兰毛呢', '羊毛手工毯'],
    lifestyleTags: ['艺术策展', '私享书房', '深邃壁炉', '雪茄品酒'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'coffee_table', 'side_table'],
    typicalLayout: '城市复式 / 独栋别墅书房沙龙',
    promptFragments: [
      'british collector grand study and salon interior',
      'floor-to-ceiling bespoke dark mahogany bookcases filled with curated literature and art',
      'deep hunter green and oxblood burgundy accents, antique brass library lamps, rich oxblood or espresso thick leather sofa, cozy fireplace hearth glow'
    ],
    negativeRules: [
      'no minimalist white drywall boxes',
      'no bare industrial walls',
      'no cheap paper veneer',
      'no futuristic cold LEDs'
    ],
    referenceImages: []
  },
  {
    id: 'style-md-01',
    code: 'MD-01',
    name: '地中海现代宅 (Contemporary Mediterranean Coast)',
    category: '欧美住宅',
    cityCharacter: 'Barcelona / Nice / Marseille ｜ 阳光、松弛、度假高级、天然质朴',
    colorPalette: ['#F8F5EE', '#DECEBA', '#B49A7D', '#B85D43'], // 米白、沙色、浅木、陶土
    materialSystem: ['质感灰泥抹灰', '天然毛石', '浅色原木横梁', '透气亚麻织物', '手工陶艺'],
    lifestyleTags: ['海景度假', '松弛惬意', '有机质感', '日光倾洒'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'coffee_table'],
    typicalLayout: '海景 / 湖景别墅 / 横厅大宅',
    promptFragments: [
      'contemporary mediterranean coastal villa living space',
      'soft off-white lime wash textured walls, bleached pale timber beams, rough-hewn natural stone accents',
      'open terrace facing sea breeze, caramel or oatmeal linen-textured leather seating, warm golden afternoon sun'
    ],
    negativeRules: [
      'no dark claustrophobic colors',
      'no high-gloss mirror chrome',
      'no heavy baroque velour',
      'no commercial office glass vibe'
    ],
    referenceImages: []
  },

  // ==========================================
  // 二、 国际现代 (Global Contemporary)
  // ==========================================
  {
    id: 'style-lx-01',
    code: 'LX-01',
    name: '欧美都会轻奢 (Metropolitan High-Rise Chic)',
    category: '国际现代',
    cityCharacter: 'Manhattan / Los Angeles ｜ 都市、精致、社交、年轻高净值',
    colorPalette: ['#9E978E', '#F2EFEB', '#4E3E37', '#D1A960'], // 暖灰、米白、烟棕、香槟金
    materialSystem: ['透光大理石', '香槟金金属', '烟熏玻璃', '木饰面护墙', '高光半苯胺真皮'],
    lifestyleTags: ['天际夜景', '社交沙龙', '都市名流', '科技智享'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'coffee_table'],
    typicalLayout: '顶层大平层 / 城市复式 Penthouse',
    promptFragments: [
      'high-rise modern luxury penthouse salon with floor-to-ceiling glass wall',
      'panoramic city skyline view, polished marble wall feature, brushed champagne gold trims, smoked glass partition',
      'streamlined modern leather functional sofa with motorized recliners, chic ambient cove lighting'
    ],
    negativeRules: [
      'no rustic farmhouse',
      'no cluttered folk arts',
      'no peeling paint',
      'no dim gloomy tavern lighting'
    ],
    referenceImages: []
  },
  {
    id: 'style-02',
    code: 'ST-02',
    name: '意式极简静奢 (Italian Quiet Luxury)',
    category: '欧美住宅',
    cityCharacter: 'Milan / Turin ｜ 极简留白、雕塑感、低调奢华',
    colorPalette: ['#EAE6E1', '#BCB5AC', '#4A4643', '#8A6240'],
    materialSystem: ['天然石灰华洞石', '细腻摔纹半苯胺皮', '极细黑钛五金', '厚织羊毛地毯'],
    lifestyleTags: ['极简留白', '雕塑感', '低调奢华'],
    recommendedProductTypes: ['sofa_3seat', 'sofa_2seat', 'coffee_table'],
    typicalLayout: '环幕大平层 / 顶层复式 Penthouse',
    promptFragments: [
      'italian architectural quiet luxury aesthetic',
      'minimalist proportioned furniture, honed porous travertine coffee table',
      'sculptural negative space and soft diffused overcast daylight'
    ],
    negativeRules: ['ornate baroque moldings', 'overly glossy floors', 'bright saturated colors'],
    referenceImages: []
  },
  {
    id: 'style-lx-02',
    code: 'LX-02',
    name: '国际静奢 (International Quiet Luxury)',
    category: '国际现代',
    cityCharacter: 'Zurich / Geneva / Munich ｜ 克制、安静、高品质、低炫耀感',
    colorPalette: ['#BAB2A9', '#D5CDC5', '#3B3A36', '#202020'], // 暖灰、沙色、深木、炭黑
    materialSystem: ['天然原石', '无缝木饰面', '厚织羊毛地毯', '极简微水泥', '低调厚皮'],
    lifestyleTags: ['纯粹克制', '无痕工艺', '静修避世', '隐贵气质'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'coffee_table'],
    typicalLayout: '大平层 / 山景住宅',
    promptFragments: [
      'international quiet luxury alpine retreat living room, understated pure architecture',
      'continuous seamless monolithic stone walls, refined rift-sawn timber paneling, bespoke minimalist craftsmanship',
      'diffuse morning alpine daylight, ultra-serene atmosphere, low-profile premium leather seating'
    ],
    negativeRules: [
      'no logos',
      'no flashy gilded trims',
      'no glossy polished marble',
      'no busy complex patterns',
      'no loud vibrant colors'
    ],
    referenceImages: []
  },
  {
    id: 'style-fr-01',
    code: 'FR-01',
    name: '法式当代雅宅 (Contemporary French Haussmann)',
    category: '国际现代',
    cityCharacter: 'Paris / Lyon ｜ 优雅、艺术、柔和、不宫廷化',
    colorPalette: ['#FBF6EE', '#D8D3CD', '#935B3B', '#B89758'], // 奶油白、浅灰、焦糖、黄铜
    materialSystem: ['轻法式石膏线', '人字拼橡木地板', '浅石材', '法式黄铜五金', '圆润羊绒真皮'],
    lifestyleTags: ['艺术策展', '法式浪漫', '弧形线条', '午后暖光'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'side_table', 'coffee_table'],
    typicalLayout: '城市大平层 / 挑高艺术跃层',
    promptFragments: [
      'contemporary parisian haussmann salon, classic delicate wall moulding with clean modern sensibility',
      'traditional oak chevron floor, soft arched doorways, sculptural contemporary furniture',
      'warm morning golden daylight through tall casement windows, artistic chic mood'
    ],
    negativeRules: [
      'no heavy gilded baroque frames',
      'no gaudy palace chandeliers',
      'no dark claustrophobic walls',
      'no cheap laminate floor'
    ],
    referenceImages: []
  },
  {
    id: 'style-ca-01',
    code: 'CA-01',
    name: '加州现代宅 (California Warm Coastal Modern)',
    category: '国际现代',
    cityCharacter: 'Los Angeles / San Diego ｜ 开放、阳光、轻松、现代家庭',
    colorPalette: ['#FAF6F0', '#C8B293', '#9C968F', '#4E5B4B'], // 米白、浅木、暖灰、鼠尾草绿
    materialSystem: ['浅白橡木', '天然砂岩', '无框大落地玻璃', '亚麻布艺', '细腻透气牛皮'],
    lifestyleTags: ['无界自然', '阳光通透', '加州生活', '家庭休闲'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'coffee_table'],
    typicalLayout: '独栋别墅 / 大开间横厅',
    promptFragments: [
      'california warm modern architectural pavilion, seamless indoor-outdoor pocket sliding glass doors',
      'sunlit patio opening, bleached white oak ceilings, honed sandstone floor, architectural potted olive greenery',
      'bright natural coastal daylight, comfortable warm leather deep-seat sectional sofa'
    ],
    negativeRules: [
      'no dark moody rooms',
      'no cold industrial metal pipes',
      'no heavy baroque drapery',
      'no small cramped windows'
    ],
    referenceImages: []
  },
  {
    id: 'style-01',
    code: 'ST-01',
    name: '都会收藏家 (Metropolitan Collector)',
    category: '国际现代',
    cityCharacter: 'New York / Milan ｜ 艺术策展、静谧内敛、高精质感',
    colorPalette: ['#2B2A29', '#8C857B', '#DCD7D0', '#A67C52'],
    materialSystem: ['南美进口头层牛皮', '潘多拉微晶奢石', '哑光深烟熏橡木', '拉丝古铜'],
    lifestyleTags: ['艺术策展', '静谧内敛', '高精质感'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'coffee_table'],
    typicalLayout: '顶层豪宅 / 城市大平层',
    promptFragments: [
      'metropolitan art collector interior style',
      'subdued palette of warm greige, espresso smoked oak, and subtle brushed champagne brass',
      'refined architectural natural lighting through clean linen sheers'
    ],
    negativeRules: ['cheap laminate', 'vibrant neon colors', 'chaotic plastic items'],
    referenceImages: []
  },
  {
    id: 'style-09',
    code: 'ST-09',
    name: '当代建筑包豪斯 (Bauhaus Geometric Modernism)',
    category: '国际现代',
    cityCharacter: 'Berlin / Dessau ｜ 建筑大师、几何构成、工业美学',
    colorPalette: ['#1A1A1A', '#EFEFEF', '#A31D1D', '#1D4ED8'],
    materialSystem: ['马鞍真皮', '抛光镜面不锈钢管', '黑漆实木', '平板光学玻璃'],
    lifestyleTags: ['建筑大师', '几何构成', '工业美学'],
    recommendedProductTypes: ['recliner_1seat', 'sofa_3seat', 'coffee_table'],
    typicalLayout: '挑高平层 / 艺术工坊式大厅',
    promptFragments: [
      'bauhaus inspired modernist living pavilion',
      'clean structural chrome steel tubular elements paired with rich tactile leather',
      'bold precise architectural planes and crisp shadow gradients'
    ],
    negativeRules: ['curvy baroque flourishes', 'heavy rustic textiles'],
    referenceImages: []
  },

  // ==========================================
  // 三、 东方住宅 (Oriental Living)
  // ==========================================
  {
    id: 'style-03',
    code: 'ST-03',
    name: '温润东方 · 禅意雅境 (Oriental Warm Serenity)',
    category: '东方住宅',
    cityCharacter: 'Hangzhou / Kyoto ｜ 品茗雅集、天人合一、书香隐奢',
    colorPalette: ['#1C1B1A', '#5C554E', '#C2B8AA', '#3E4F42'],
    materialSystem: ['哑光磨砂软牛皮', '黑檀黑金木', '天然麻布壁布', '水墨透光云石'],
    lifestyleTags: ['品茗雅集', '天人合一', '书香隐奢'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'side_table'],
    typicalLayout: '庭院别墅 / 观景横厅',
    promptFragments: [
      'contemporary oriental zen luxury sanctuary',
      'harmonious blend of clean modern leather seating and subtle dark ebony wood joinery',
      'soft shadow play from minimalist bamboo or garden courtyard outside'
    ],
    negativeRules: ['cluttered traditional red wood carvings', 'gilded shiny gold', 'disjointed colors'],
    referenceImages: []
  },
  {
    id: 'style-or-02',
    code: 'OR-02',
    name: '当代东方 · 墨韵大宅 (Contemporary Oriental Ink Manor)',
    category: '东方住宅',
    cityCharacter: 'Suzhou / Beijing ｜ 水墨意境、中轴秩序、大家风范',
    colorPalette: ['#212224', '#7D756E', '#C9C2B7', '#8A6A4E'],
    materialSystem: ['透光水墨云石', '深色胡桃木格栅', '山水奢石台面', '磨砂牛皮'],
    lifestyleTags: ['墨韵留白', '世家气度', '东方意境'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'coffee_table'],
    typicalLayout: '中式大平层 / 独栋院落',
    promptFragments: [
      'contemporary oriental ink residence with majestic spatial balance',
      'translucent ink-veined alabaster stone, dark walnut wooden grilles, serene courtyard vistas',
      'diffused serene natural light with subtle warm focal lighting'
    ],
    negativeRules: ['cluttered red mahogany antique carvings', 'gaudy plastic ornaments'],
    referenceImages: []
  },
  {
    id: 'style-or-03',
    code: 'OR-03',
    name: '东方融合 · 雅奢居所 (Oriental Fusion Harmony)',
    category: '东方住宅',
    cityCharacter: 'Shanghai / Taipei ｜ 海派雅致、东西合璧、现代包容',
    colorPalette: ['#3A3530', '#A39587', '#E4DCD3', '#8C3E32'],
    materialSystem: ['海派深木饰面', '拉丝古铜', '东方刺绣纹样织物', '进口头层真皮'],
    lifestyleTags: ['海派风韵', '东西合璧', '现代典雅'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'coffee_table'],
    typicalLayout: '都会大平层 / 老洋房跃层',
    promptFragments: [
      'sophisticated oriental fusion luxury living room, blend of eastern serenity and modern international comfort',
      'refined dark wood joinery with brushed bronze detailing, warm ivory and muted crimson silk touches',
      'balanced architectural daylight and intimate warm lamps'
    ],
    negativeRules: ['harsh neon lighting', 'cheap reproduction antique bric-a-brac'],
    referenceImages: []
  },
  {
    id: 'style-or-04',
    code: 'OR-04',
    name: '现代新中式 (Modern Neo-Chinese Residence)',
    category: '东方住宅',
    cityCharacter: 'Shenzhen / Chengdu ｜ 东方神韵、现代极简、年轻国潮',
    colorPalette: ['#2F2E2C', '#68625B', '#D5CEC5', '#4C5D54'],
    materialSystem: ['浅灰微水泥', '黑钛金属', '天然竹木', '竹影玻璃', '素色牛皮'],
    lifestyleTags: ['极简禅意', '竹影自然', '当代国风'],
    recommendedProductTypes: ['sofa_3seat', 'recliner_1seat', 'coffee_table'],
    typicalLayout: '大平层 / 竖厅观景宅',
    promptFragments: [
      'modern neo-chinese minimalist living space with clean linear design',
      'natural bamboo accents, subtle black titanium hardware, soft rice-paper textured glass partitions',
      'calm daylight casting bamboo shadows onto pale stone floors'
    ],
    negativeRules: ['overly ornamental wood carving', 'gaudy red lacquer furniture'],
    referenceImages: []
  }
];
