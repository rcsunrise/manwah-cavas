// src/services/spaceAssetLibraryService.ts
// MANWAH Space Studio｜统一视觉资产库服务与持久化 V3.5
import {
  SpaceAssetType,
  UnifiedSpaceAsset,
  SceneStyleAsset,
  MaterialAsset,
  ModelAsset,
  PoseAsset,
  PropAsset,
  ModelMultiViews,
  ModelDnaData,
  PoseDnaData
} from '../types/spaceAssetLibrary';

const STORAGE_KEY_PREFIX = 'manwah_space_asset_';

// 1. 默认精选场景风格资产
export const DEFAULT_SCENE_STYLES: SceneStyleAsset[] = [
  {
    id: 'style-italian-luxury',
    type: 'scene_style',
    name: '意式轻奢 · 雅致大平层',
    code: 'STYLE-01',
    category: '意式轻奢',
    description: '大理石悬空背景墙、无主灯线性磁吸轨道、落地全景窗与低饱和度暖灰调',
    tags: ['大平层', '极简石材', '暖灰调', '全景窗'],
    coverImage: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80',
    referenceImages: [
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80'
    ],
    colorPalette: ['#EFECE6', '#C7B299', '#2C2B29', '#D4AF37'],
    materialSystem: ['雪花白大理石', '微水泥哑光地坪', '黑胡桃木饰面', '拉丝香槟金五金'],
    lifestyleTags: ['私享酒廊', '艺术品鉴', '沉浸式家庭影院'],
    promptFragment: 'high-end modern Italian luxury living room, calacatta marble feature wall, ambient architectural cove lighting, floor-to-ceiling panoramic glass windows',
    promptFragments: [
      'high-end modern Italian luxury living room',
      'calacatta marble feature wall',
      'ambient architectural cove lighting',
      'floor-to-ceiling panoramic glass windows'
    ],
    lightingTone: '通透漫射自然光',
    lightingPreset: '通透漫射自然光',
    isSystem: true,
    isFavorite: true,
    favorite: true,
    refCount: 28,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  },
  {
    id: 'style-modern-minimal',
    type: 'scene_style',
    name: '现代极简 · 悬浮光影',
    code: 'STYLE-02',
    category: '现代极简',
    description: '大面积留白、几何块面分割、微水泥无缝墙面与柔和漫反射晨光',
    tags: ['纯粹留白', '微水泥', '漫射柔光', '几何美学'],
    coverImage: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1200&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1200&q=80',
    referenceImages: [
      'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=80'
    ],
    colorPalette: ['#F9F9F8', '#E3E0D8', '#8A8780', '#1C1B1A'],
    materialSystem: ['细纹微水泥', '极窄边框落地铝合金', '哑光羊毛绒面地毯'],
    lifestyleTags: ['慢生活', '禅思冥想', '自然晨光'],
    promptFragment: 'pure minimalist penthouse living room, seamless micro-cement walls and floors, soft daylight diffusing through sheer linen curtains',
    promptFragments: [
      'pure minimalist penthouse living room',
      'seamless micro-cement walls and floors',
      'soft daylight diffusing through sheer linen curtains'
    ],
    lightingTone: '清晨柔白漫射光',
    lightingPreset: '清晨柔白漫射光',
    isSystem: true,
    isFavorite: false,
    favorite: false,
    refCount: 19,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  },
  {
    id: 'style-creamy-nordic',
    type: 'scene_style',
    name: '奶油原木 · 治愈温润',
    code: 'STYLE-03',
    category: '奶油原木',
    description: '暖白奶油色艺术涂料、天然橡木木格栅、圆润弧形吊顶与温润治愈氛围',
    tags: ['奶油风', '原木格栅', '弧形转角', '治愈温馨'],
    coverImage: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=80',
    referenceImages: [
      'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1616046229478-9901c5536a45?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1618219908412-a29a1bb7b86e?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1617806118233-18e1de247200?auto=format&fit=crop&w=1200&q=80'
    ],
    colorPalette: ['#F7F3E9', '#DFD3C3', '#C7B198', '#594A42'],
    materialSystem: ['暖白艺术肌理漆', '白橡木直纹木皮', '棉麻羊羔绒', '洞石茶几台面'],
    lifestyleTags: ['下午茶', '温馨阅读', '疗愈居家'],
    promptFragment: 'warm creamy aesthetic modern living space, curved ceiling details, organic travertine coffee table, cozy soft daylight',
    promptFragments: [
      'warm creamy aesthetic modern living space',
      'curved ceiling details',
      'organic travertine coffee table',
      'cozy soft daylight'
    ],
    lightingTone: '午后3200K暖阳',
    lightingPreset: '午后3200K暖阳',
    isSystem: true,
    isFavorite: false,
    favorite: false,
    refCount: 14,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  },
  {
    id: 'style-french-vintage',
    type: 'scene_style',
    name: '法式复古 · 浪漫线条',
    code: 'STYLE-04',
    category: '法式复古',
    description: '经典法式石膏线条、鱼骨拼橡木地板、法式落地双开窗与古典浪漫',
    tags: ['法式线条', '鱼骨拼地板', '古典优雅', '雕花吊顶'],
    coverImage: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=80',
    referenceImages: [
      'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=80'
    ],
    colorPalette: ['#FAF6F0', '#E4D5B7', '#4A3B32', '#9E8A78'],
    materialSystem: ['法式石膏雕花线', '法式鱼骨拼橡木地板', '复古黄铜把手'],
    lifestyleTags: ['艺术沙龙', '红酒品鉴', '复古浪漫'],
    promptFragment: 'classic French Parisian chic living room, herringbone wood parquet floor, delicate wall moldings',
    promptFragments: [
      'classic French Parisian chic living room',
      'herringbone wood parquet floor',
      'delicate wall moldings'
    ],
    lightingTone: '柔和漫射天光',
    lightingPreset: '柔和漫射天光',
    isSystem: true,
    isFavorite: true,
    favorite: true,
    refCount: 22,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  },
  {
    id: 'style-oriental-zen',
    type: 'scene_style',
    name: '东方禅意 · 幽微意境',
    code: 'STYLE-05',
    category: '东方禅意',
    description: '水墨意境留白、深色胡桃木与格栅屏风、枯山水微景观与茶道空间',
    tags: ['新中式', '格栅光影', '茶道静谧', '水墨留白'],
    coverImage: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&q=80',
    referenceImages: [
      'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80'
    ],
    colorPalette: ['#1C1B1A', '#5A544B', '#C9BA9B', '#F2EFE9'],
    materialSystem: ['黑胡桃木', '粗陶茶具', '和纸漫射吊灯', '青石板'],
    lifestyleTags: ['品茗闻香', '琴棋书画', '禅修静思'],
    promptFragment: 'modern oriental Zen interior architecture, wooden lattice screens, minimalist tea corner',
    promptFragments: [
      'modern oriental Zen interior architecture',
      'wooden lattice screens',
      'minimalist tea corner'
    ],
    lightingTone: '幽微侧逆光',
    lightingPreset: '幽微侧逆光',
    isSystem: true,
    isFavorite: false,
    favorite: false,
    refCount: 16,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  }
];

// 2. 默认精选真实模特资产 (Model DNA 与 Pose 彻底解耦)
export const DEFAULT_MODELS: ModelAsset[] = [
  {
    id: 'model-sophia-lin',
    type: 'model',
    name: 'Lin (林依晨同款气质 · 青年女主)',
    code: 'MDL-01',
    gender: 'female',
    ageGroup: '28-35岁 青年精英',
    tags: ['东亚温婉', '高知女主', '真丝私服', '知性优雅'],
    coverImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
    views: {
      front: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
      angle45: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      threeQuarter: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      side: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80',
      fullBody: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
      wardrobeRef: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80',
      outfitRef: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80'
    },
    multiViews: {
      front: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
      threeQuarter: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      side: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80',
      fullBody: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
      outfitRef: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80'
    },
    modelDna: {
      identitySeed: 882910,
      gender: 'female',
      ageRange: '28-35岁',
      ageGroup: '28-35岁',
      ethnicity: '东亚',
      heightCm: 168,
      bodyBuild: 'slender',
      skinTone: '自然清透象牙白',
      facialFeatures: '东亚温婉鹅蛋脸，对称五官，清透微裸妆，双眸明澈',
      hairStyle: '黑茶色微卷锁骨发',
      hairStyleAndColor: '黑茶色微卷锁骨发',
      wardrobeStyle: '极简米白羊绒针织开衫与垂感阔腿裤',
      outfitStyle: '极简米白羊绒针织开衫与垂感阔腿裤',
      appearanceSummary: '知性优雅高智感，举手投足尽显从容居家生活质感',
      features: ['自然呼吸感', '温润神态', '高挑柔和身形']
    },
    promptFragment: 'one elegant 30-year-old East Asian female model, natural graceful demeanor, dressed in premium beige cashmere loungewear',
    isSystem: true,
    isFavorite: true,
    favorite: true,
    refCount: 35,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  },
  {
    id: 'model-david-chen',
    type: 'model',
    name: 'Chen (现代高管男主 · 沉稳儒雅)',
    code: 'MDL-02',
    gender: 'male',
    ageGroup: '32-40岁 商业领袖',
    tags: ['精英男主', '沉稳儒雅', '深灰羊毛', '高智感'],
    coverImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80',
    views: {
      front: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80',
      angle45: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80',
      threeQuarter: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80',
      side: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=800&q=80',
      fullBody: 'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?auto=format&fit=crop&w=800&q=80',
      wardrobeRef: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80',
      outfitRef: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80'
    },
    multiViews: {
      front: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80',
      threeQuarter: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80',
      side: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=800&q=80',
      fullBody: 'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?auto=format&fit=crop&w=800&q=80',
      outfitRef: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80'
    },
    modelDna: {
      identitySeed: 771029,
      gender: 'male',
      ageRange: '32-40岁',
      ageGroup: '32-40岁',
      ethnicity: '东亚',
      heightCm: 182,
      bodyBuild: 'athletic',
      skinTone: '健康自然小麦白皙色',
      facialFeatures: '东亚下颌线清晰坚毅，眉宇深邃，从容微笑',
      hairStyle: '利落短发三七分',
      hairStyleAndColor: '利落短发三七分',
      wardrobeStyle: '炭灰细羊毛高领毛衣与深蓝直筒西裤',
      outfitStyle: '炭灰细羊毛高领毛衣与深蓝直筒西裤',
      appearanceSummary: '沉稳儒雅睿智领袖，兼具家庭温情与事业成功魅力',
      features: ['深邃眼神', '利落身形', '优雅举止']
    },
    promptFragment: 'one refined 35-year-old East Asian male executive, intelligent handsome demeanor, dressed in dark grey merino wool sweater',
    isSystem: true,
    isFavorite: false,
    favorite: false,
    refCount: 20,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  },
  {
    id: 'model-golden-couple',
    type: 'model',
    name: '金领夫妻组合 (高端精英家庭生活)',
    code: 'MDL-03',
    gender: 'couple',
    ageGroup: '30-36岁 精英夫妇',
    tags: ['双人互动', '夫妻同框', '默契温馨', '高奢家庭'],
    coverImage: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
    views: {
      front: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
      angle45: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
      threeQuarter: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80'
    },
    multiViews: {
      front: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80'
    },
    modelDna: {
      identitySeed: 994012,
      gender: 'couple',
      ageRange: '30-36岁',
      ageGroup: '30-36岁',
      ethnicity: '东亚',
      heightCm: 175,
      bodyBuild: 'balanced',
      skinTone: '自然温润肤色',
      facialFeatures: '东亚俊朗与温婉面容，和谐默契',
      hairStyle: '精致打理发型',
      wardrobeStyle: '同色系米灰与燕麦色奢华家居服',
      outfitStyle: '同色系米灰与燕麦色奢华家居服',
      appearanceSummary: '高知精英家庭和谐互动',
      features: ['默契笑容', '温馨眼神交流']
    },
    promptFragment: 'one attractive East Asian couple in their early 30s enjoying tranquil luxury home time together',
    isSystem: true,
    isFavorite: true,
    favorite: true,
    refCount: 18,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  }
];

// 3. 默认 7 大分类姿态资产 (Pose DNA 与沙发产品严格防遮挡)
export const DEFAULT_POSES: PoseAsset[] = [
  {
    id: 'pose-reading-relax',
    type: 'pose',
    name: '翻阅艺术画册 · 半倚扶手',
    code: 'POSE-01',
    category: 'reading',
    tags: ['阅读', '半倚扶手', '翻页互动', '优雅静止'],
    coverImage: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
    poseDna: {
      bodyOrientation: '身体微侧45度面向茶几与落地窗',
      bodyDirection: '身体微侧45度面向茶几与落地窗',
      seatingContact: '臀部深落于主座包中央偏右1/3，大腿水平承托',
      seatContact: '臀部深落于主座包中央偏右1/3，大腿水平承托',
      backSupport: '背部轻靠主靠包，腰椎自然贴合人体工学支撑区',
      armPlacements: '左手优雅搭在沙发宽边扶手，右手轻轻翻阅硬壳精装画册',
      armPosition: '左手优雅搭在沙发宽边扶手，右手轻轻翻阅硬壳精装画册',
      footPlacements: '双脚自然踩在羊毛地毯上，脚尖微交叠',
      legPosition: '双脚自然踩在羊毛地毯上，脚尖微交叠',
      personCount: 1,
      humanCount: 1,
      occlusionRules: '严禁身体遮挡沙发主扶手双针缝线与靠包金属点缀徽标',
      occlusionRule: '严禁身体遮挡沙发主扶手双针缝线与靠包金属点缀徽标'
    },
    promptFragment: 'elegantly seated on the right third of the luxury leather sofa, browsing an art book gracefully, arms resting softly on armrest',
    isSystem: true,
    isFavorite: true,
    favorite: true,
    refCount: 32,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  },
  {
    id: 'pose-tea-leisure',
    type: 'pose',
    name: '轻捧手冲咖啡 · 侧身凝望',
    code: 'POSE-02',
    category: 'drinking',
    tags: ['喝茶', '手捧咖啡杯', '侧身放松', '慢时光'],
    coverImage: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=800&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=800&q=80',
    poseDna: {
      bodyOrientation: '侧身转向全景落地窗方向，面部微扬享受晨光',
      bodyDirection: '侧身转向全景落地窗方向，面部微扬享受晨光',
      seatingContact: '深入座包2/3，重心后移至靠背支撑点',
      seatContact: '深入座包2/3，重心后移至靠背支撑点',
      backSupport: '背部完全沉浸倚靠于高弹海绵靠包',
      armPlacements: '双手端持精美陶瓷咖啡杯，手肘微悬于膝上',
      armPosition: '双手端持精美陶瓷咖啡杯，手肘微悬于膝上',
      footPlacements: '双脚斜向伸展，脚跟轻着地',
      legPosition: '双脚斜向伸展，脚跟轻着地',
      personCount: 1,
      humanCount: 1,
      occlusionRules: '避开沙发中缝拉扣区域，保持皮质饱满起伏清晰可见',
      occlusionRule: '避开沙发中缝拉扣区域，保持皮质饱满起伏清晰可见'
    },
    promptFragment: 'holding a minimalist ceramic coffee cup with both hands, gently leaning back on the sofa cushions',
    isSystem: true,
    isFavorite: false,
    favorite: false,
    refCount: 24,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  },
  {
    id: 'pose-recliner-lying',
    type: 'pose',
    name: '功能位 140° 零重力全舒展',
    code: 'POSE-03',
    category: 'lying',
    tags: ['躺姿', '功能位展开', '零重力舒展', '极度放松'],
    coverImage: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=800&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=800&q=80',
    poseDna: {
      bodyOrientation: '正向舒展平躺，头部轻仰枕于电动头枕',
      bodyDirection: '正向舒展平躺，头部轻仰枕于电动头枕',
      seatingContact: '全身贴合零重力人体工学曲面',
      seatContact: '全身贴合零重力人体工学曲面',
      backSupport: '后倾140度背部全承托',
      armPlacements: '双臂自然平放于两侧加宽软包扶手',
      armPosition: '双臂自然平放于两侧加宽软包扶手',
      footPlacements: '双腿平直搭在抬升展开的电动脚踏板上',
      legPosition: '双腿平直搭在抬升展开的电动脚踏板上',
      personCount: 1,
      humanCount: 1,
      occlusionRules: '必须完全展现电动伸展脚踏机构与头枕角度',
      occlusionRule: '必须完全展现电动伸展脚踏机构与头枕角度'
    },
    promptFragment: 'reclining comfortably on the motorized recliner section, footrest fully extended, total relaxation posture',
    isSystem: true,
    isFavorite: true,
    favorite: true,
    refCount: 29,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  },
  {
    id: 'pose-couple-chat',
    type: 'pose',
    name: '对坐谈笑 · 温情倾听',
    code: 'POSE-04',
    category: 'chatting',
    tags: ['交谈', '情侣对视', '亲密互动', '温馨会客'],
    coverImage: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
    poseDna: {
      bodyOrientation: '两人分别坐于主沙发两侧，身体微微相对朝向中心',
      bodyDirection: '两人分别坐于主沙发两侧，身体微微相对朝向中心',
      seatingContact: '稳重落座于两端，中间保留适度透气空间',
      seatContact: '稳重落座于两端，中间保留适度透气空间',
      backSupport: '自然微倾靠背，姿态松弛从容',
      armPlacements: '一手手势生动交谈，一手自然搭扶手',
      armPosition: '一手手势生动交谈，一手自然搭扶手',
      footPlacements: '双脚平落，膝盖自然朝向斜前方',
      legPosition: '双脚平落，膝盖自然朝向斜前方',
      personCount: 2,
      humanCount: 2,
      occlusionRules: '两人不可遮挡沙发中央主靠背轮廓与靠枕摆位',
      occlusionRule: '两人不可遮挡沙发中央主靠背轮廓与靠枕摆位'
    },
    promptFragment: 'two people seated at each side of the sofa, turned slightly towards each other in warm conversation',
    isSystem: true,
    isFavorite: false,
    favorite: false,
    refCount: 15,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  },
  {
    id: 'pose-standing-living',
    type: 'pose',
    name: '步入客厅 · 驻足回眸',
    code: 'POSE-05',
    category: 'standing',
    tags: ['站立', '步入空间', '回眸互动', '大景深尺度'],
    coverImage: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
    poseDna: {
      bodyOrientation: '站立于主沙发后方侧面 1.5 米处，侧身微回眸',
      bodyDirection: '站立于主沙发后方侧面 1.5 米处，侧身微回眸',
      seatingContact: '无落座，站立姿态',
      seatContact: '无落座，站立姿态',
      backSupport: '直立自然曲线',
      armPlacements: '一手轻插裤袋，一手自然垂落',
      armPosition: '一手轻插裤袋，一手自然垂落',
      footPlacements: '一前一后自然站立步幅',
      legPosition: '一前一后自然站立步幅',
      personCount: 1,
      humanCount: 1,
      occlusionRules: '人物位于后景，绝不遮挡前景沙发的完整轮廓',
      occlusionRule: '人物位于后景，绝不遮挡前景沙发的完整轮廓'
    },
    promptFragment: 'standing gracefully in the background behind the sofa near the window, looking back with a soft smile',
    isSystem: true,
    isFavorite: false,
    favorite: false,
    refCount: 12,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  }
];

// 统一资产管理类 (SpaceAssetLibraryService)
class SpaceAssetLibraryService {
  private customAssets: Map<string, UnifiedSpaceAsset> = new Map();
  private initialized: boolean = false;

  private init() {
    if (this.initialized) return;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}custom_all`);
        if (stored) {
          const list: UnifiedSpaceAsset[] = JSON.parse(stored);
          list.forEach((item) => this.customAssets.set(item.id, item));
        }
      }
    } catch (e) {
      console.warn('[AssetLibraryService] LocalStorage load warning:', e);
    }
    this.initialized = true;
  }

  private persist() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const list = Array.from(this.customAssets.values());
        localStorage.setItem(`${STORAGE_KEY_PREFIX}custom_all`, JSON.stringify(list));
      }
    } catch (e) {
      console.warn('[AssetLibraryService] LocalStorage save warning:', e);
    }
  }

  /**
   * 获取场景风格资产
   */
  public getSceneStyles(filter?: { search?: string; category?: string; onlyFavorite?: boolean }): SceneStyleAsset[] {
    return this.getAssetsByType<SceneStyleAsset>('scene_style', filter);
  }

  /**
   * 获取模特资产
   */
  public getModels(filter?: { search?: string; category?: string; onlyFavorite?: boolean }): ModelAsset[] {
    return this.getAssetsByType<ModelAsset>('model', filter);
  }

  /**
   * 获取姿态资产
   */
  public getPoses(filter?: { search?: string; category?: string; onlyFavorite?: boolean }): PoseAsset[] {
    return this.getAssetsByType<PoseAsset>('pose', filter);
  }

  /**
   * 获取指定类型的所有资产（合并系统预设 + 用户自建）
   */
  public getAssetsByType<T extends UnifiedSpaceAsset = UnifiedSpaceAsset>(
    type: SpaceAssetType,
    filter?: { search?: string; category?: string; onlyFavorite?: boolean }
  ): T[] {
    this.init();

    let systemItems: UnifiedSpaceAsset[] = [];
    if (type === 'scene_style') systemItems = DEFAULT_SCENE_STYLES;
    else if (type === 'model') systemItems = DEFAULT_MODELS;
    else if (type === 'pose') systemItems = DEFAULT_POSES;

    const userItems = Array.from(this.customAssets.values()).filter((a) => a.type === type);
    let all = [...systemItems, ...userItems] as T[];

    if (filter?.search) {
      const q = filter.search.toLowerCase().trim();
      all = all.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q)) ||
          (a.description && a.description.toLowerCase().includes(q))
      );
    }

    if (filter?.category && filter.category !== 'all' && filter.category !== '全部') {
      all = all.filter((a: any) => a.category === filter.category);
    }

    if (filter?.onlyFavorite) {
      all = all.filter((a) => !!(a.isFavorite || a.favorite));
    }

    return all;
  }

  /**
   * 创建场景风格资产
   */
  public createSceneStyle(params: Partial<SceneStyleAsset> & { name: string }): SceneStyleAsset {
    const id = `style-custom-${Date.now().toString(36)}`;
    const asset: SceneStyleAsset = {
      id,
      type: 'scene_style',
      name: params.name,
      code: `STYLE-U${Math.floor(100 + Math.random() * 900)}`,
      category: params.category || '现代极简',
      tags: params.tags || ['用户自建'],
      coverImage: params.coverImage || params.thumbnail || 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80',
      thumbnail: params.thumbnail || params.coverImage || 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80',
      referenceImages: params.referenceImages || [params.coverImage || params.thumbnail || ''],
      promptFragment: params.promptFragment || params.name,
      lightingTone: params.lightingTone || '天然通透漫射光',
      isSystem: false,
      isFavorite: true,
      favorite: true,
      refCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.saveAsset(asset);
    return asset;
  }

  /**
   * 创建模特资产
   */
  public createModel(params: Partial<ModelAsset> & { name: string }): ModelAsset {
    const id = `model-custom-${Date.now().toString(36)}`;
    const asset: ModelAsset = {
      id,
      type: 'model',
      name: params.name,
      code: `MDL-U${Math.floor(100 + Math.random() * 900)}`,
      gender: params.gender || 'female',
      ageGroup: params.ageGroup || '28-35岁 青年精英',
      tags: params.tags || ['用户模特'],
      coverImage: params.coverImage || params.thumbnail || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
      thumbnail: params.thumbnail || params.coverImage || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
      views: params.views || params.multiViews || {},
      multiViews: params.multiViews || params.views || {},
      modelDna: params.modelDna || {
        gender: params.gender || 'female',
        ageRange: params.ageGroup || '28-35岁',
        ethnicity: '东亚',
        appearanceSummary: '高雅从容',
        wardrobeStyle: '极简私服',
        features: ['自然清透']
      },
      promptFragment: params.promptFragment || params.name,
      isSystem: false,
      isFavorite: true,
      favorite: true,
      refCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.saveAsset(asset);
    return asset;
  }

  /**
   * 创建姿态资产
   */
  public createPose(params: Partial<PoseAsset> & { name: string }): PoseAsset {
    const id = `pose-custom-${Date.now().toString(36)}`;
    const asset: PoseAsset = {
      id,
      type: 'pose',
      name: params.name,
      code: `POSE-U${Math.floor(100 + Math.random() * 900)}`,
      category: params.category || 'sitting',
      tags: params.tags || ['自定义姿态'],
      coverImage: params.coverImage || params.thumbnail || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      thumbnail: params.thumbnail || params.coverImage || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      poseDna: params.poseDna || {
        bodyOrientation: '正面微侧',
        seatingContact: '深入座包1/2',
        backSupport: '背部贴合',
        armPlacements: '自然搭扶手',
        personCount: 1,
        occlusionRules: '避开沙发主体五金'
      },
      promptFragment: params.promptFragment || params.name,
      isSystem: false,
      isFavorite: true,
      favorite: true,
      refCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.saveAsset(asset);
    return asset;
  }

  /**
   * 删除模特资产
   */
  public deleteModel(id: string): boolean {
    return this.deleteAsset(id);
  }

  /**
   * 删除姿态资产
   */
  public deletePose(id: string): boolean {
    return this.deleteAsset(id);
  }

  /**
   * 保存或更新资产
   */
  public saveAsset(asset: UnifiedSpaceAsset): void {
    this.init();
    this.customAssets.set(asset.id, {
      ...asset,
      updatedAt: new Date().toISOString()
    });
    this.persist();
  }

  /**
   * 删除用户自建资产
   */
  public deleteAsset(id: string): boolean {
    this.init();
    if (this.customAssets.has(id)) {
      this.customAssets.delete(id);
      this.persist();
      return true;
    }
    return false;
  }

  /**
   * 切换资产收藏状态
   */
  public toggleFavorite(typeOrId: string, maybeId?: string): boolean {
    this.init();
    const targetId = maybeId || typeOrId;

    if (this.customAssets.has(targetId)) {
      const existing = this.customAssets.get(targetId)!;
      existing.isFavorite = !existing.isFavorite;
      existing.favorite = existing.isFavorite;
      this.persist();
      return !!existing.isFavorite;
    }

    const allSystem: UnifiedSpaceAsset[] = [
      ...DEFAULT_SCENE_STYLES,
      ...DEFAULT_MODELS,
      ...DEFAULT_POSES
    ];
    const sys = allSystem.find((s) => s.id === targetId);
    if (sys) {
      sys.isFavorite = !sys.isFavorite;
      sys.favorite = sys.isFavorite;
      return !!sys.isFavorite;
    }
    return false;
  }

  /**
   * AI 刷新风格 4 张参考图变体
   */
  public async generateStyleVariants(styleId: string): Promise<SceneStyleAsset> {
    const list = this.getSceneStyles();
    const style = list.find(s => s.id === styleId) || list[0];
    
    const candidatePool = [
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1616046229478-9901c5536a45?auto=format&fit=crop&w=1200&q=80'
    ];

    const shuffled = [...candidatePool].sort(() => 0.5 - Math.random()).slice(0, 4);
    const updatedStyle: SceneStyleAsset = {
      ...style,
      referenceImages: shuffled,
      thumbnail: shuffled[0],
      coverImage: shuffled[0]
    };

    if (!style.isSystem) {
      this.saveAsset(updatedStyle);
    }
    return updatedStyle;
  }
}

export const spaceAssetLibraryService = new SpaceAssetLibraryService();
