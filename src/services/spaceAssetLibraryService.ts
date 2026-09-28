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
  PoseDnaData,
  FamilyRoleType,
  FamilySceneTemplate
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

// 2. 6 类核心固定家庭角色资产卡 (作为摄影工作台的人物真值资产库)
export const DEFAULT_MODELS: ModelAsset[] = [
  // 1. 家庭男主人 / Father (40-45岁)
  {
    id: 'role-father-01',
    type: 'model',
    code: 'ROLE-FATHER-01',
    name: '家庭男主人 · 沉稳儒雅',
    nameZh: '家庭男主人 · 沉稳儒雅',
    nameEn: 'Father / Edward',
    roleType: 'father',
    gender: 'male',
    ageGroup: '40-45岁 黄金成熟期',
    height: '182cm 沉稳挺拔',
    positioning: '家庭支柱 / 事业有成高管 / 温厚父亲',
    temperamentKeywords: ['沉稳儒雅', '亲和威严', '高智感', '从容温润'],
    bio: '42岁精英男主人，目光坚定且温和，具备深厚生活沉淀与儒雅修养，身着深灰细羊毛高领衫与定制深蓝直筒西裤，举手投足尽显从容风度与家庭担当。',
    tags: ['男主人', '精英高管', '40-45岁', '美利奴羊毛', '高智感'],
    coverImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80',
    views: {
      front: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80',
      frontFullBody: 'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?auto=format&fit=crop&w=800&q=80',
      side: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=800&q=80',
      sideFullBody: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
      back: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80',
      backFullBody: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
      portrait: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80',
      portraitCloseUp: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80',
      angle45: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80',
      threeQuarter: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80',
      fullBody: 'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?auto=format&fit=crop&w=800&q=80',
      wardrobeRef: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80',
      outfitRef: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80',
      accessoryRef: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=800&q=80'
    },
    multiViews: {
      front: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80',
      threeQuarter: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80',
      side: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=800&q=80',
      fullBody: 'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?auto=format&fit=crop&w=800&q=80',
      outfitRef: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80'
    },
    expressionRefs: [
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=800&q=80'
    ],
    wardrobeRefs: [
      'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?auto=format&fit=crop&w=800&q=80'
    ],
    accessoryRefs: [
      'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=800&q=80'
    ],
    detailRefs: [
      'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=800&q=80'
    ],
    lifestyleRefs: [
      'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80'
    ],
    modelDna: {
      identitySeed: 88401,
      roleType: 'father',
      gender: 'male',
      ageRange: '40-45岁',
      ageGroup: '40-45岁 黄金成熟期',
      ethnicity: '东亚',
      height: '182cm 沉稳挺拔',
      heightCm: 182,
      bodyBuild: 'athletic_slender',
      positioning: '家庭支柱 / 事业有成高管 / 温厚父亲',
      temperamentKeywords: ['沉稳儒雅', '亲和威严', '高智感', '从容温润'],
      bio: '42岁精英男主人，目光坚定且温和，具备深厚生活沉淀与儒雅修养。',
      appearanceDesc: '42岁东亚成熟精英男性，五官立体深邃，剑眉星目，下颌线清晰坚毅，鬓角利落，神态沉稳自信',
      facialFeatures: '东亚端正骨相，高挺鼻梁，眼角带温厚笑意，目光深邃专注',
      skinTone: '健康自然小麦白皙色',
      hairDesc: '深黑微带棕调三七分短发，利落梳理有自然蓬松层次',
      clothingDesc: '极简深炭灰细针织美利奴羊毛高领衫，搭配深海蓝高垂感直筒西裤与深咖色手工皮鞋',
      materialsColorsDesc: '炭黑灰与海军蓝顶级天然羊毛面料，质感细腻哑光',
      identityDesc: '家庭男主人兼顶层商业高管，居室核心决策者',
      behaviorTags: ['专注阅读', '沉稳品茗', '温和伴读', '深情凝视'],
      sceneTags: ['挑高大平层客厅', '独立书房', '开放式西厨岛台', '影音视听室'],
      poseTags: ['头等舱功能位45°半躺', '主沙发端坐翻书', '靠背单手扶靠', '与家庭成员倾谈'],
      negativeConstraints: ['严禁面部变形', '严禁年龄漂移超过40-45岁', '严禁更换为花哨廉价服装', '严禁肢体异化']
    },
    promptFragment: 'one refined 42-year-old East Asian father figure, handsome mature executive charisma, wearing dark charcoal merino wool turtleneck and navy tailored trousers',
    negativeConstraints: ['face distortion', 'age drifting outside 40-45', 'cheap casual clothing', 'deformed hands', 'extra limbs'],
    isSystem: true,
    isFavorite: true,
    favorite: true,
    refCount: 42,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  },

  // 2. 爷爷 / Grandfather (68-72岁)
  {
    id: 'role-grandfather-01',
    type: 'model',
    code: 'ROLE-GRANDFATHER-01',
    name: '爷爷 · 慈祥泰斗',
    nameZh: '爷爷 · 慈祥泰斗',
    nameEn: 'Grandfather / Arthur',
    roleType: 'grandfather',
    gender: 'male',
    ageGroup: '68-72岁 德高望重',
    height: '173cm 精神矍铄',
    positioning: '家族精神长辈 / 阅历丰厚 / 慈祥睿智',
    temperamentKeywords: ['慈眉善目', '长者风度', '泰然自若', '温和宽厚'],
    bio: '70岁长辈爷爷，银发自然梳理，眼角含笑，面容安详，身着浅灰中式极简棉麻开衫与软呢裤，尽显大家长风度与岁月沉淀。',
    tags: ['长辈爷爷', '德高望重', '68-72岁', '棉麻开衫', '慈眉善目'],
    coverImage: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
    views: {
      front: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
      frontFullBody: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
      side: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      sideFullBody: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
      back: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
      backFullBody: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
      portrait: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
      portraitCloseUp: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
      angle45: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
      threeQuarter: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
      fullBody: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
      wardrobeRef: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80',
      outfitRef: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80',
      accessoryRef: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=800&q=80'
    },
    multiViews: {
      front: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
      threeQuarter: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
      side: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      fullBody: 'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
      outfitRef: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80'
    },
    expressionRefs: [
      'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80'
    ],
    wardrobeRefs: [
      'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80'
    ],
    accessoryRefs: [
      'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=800&q=80'
    ],
    detailRefs: [
      'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80'
    ],
    lifestyleRefs: [
      'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80'
    ],
    modelDna: {
      identitySeed: 88402,
      roleType: 'grandfather',
      gender: 'elder',
      ageRange: '68-72岁',
      ageGroup: '68-72岁 德高望重',
      ethnicity: '东亚',
      height: '173cm 精神矍铄',
      heightCm: 173,
      bodyBuild: 'balanced_elder',
      positioning: '家族精神长辈 / 阅历丰厚 / 慈祥睿智',
      temperamentKeywords: ['慈眉善目', '长者风度', '泰然自若', '温和宽厚'],
      bio: '70岁长辈爷爷，银发自然梳理，眼角含笑，面容安详，身着浅灰中式极简棉麻开衫。',
      appearanceDesc: '70岁东亚慈祥长辈，银白发丝梳理整齐，眼神温和，面容安详泰然，散发长者沉淀风度',
      facialFeatures: '慈眉善目，眼角带温和笑纹，神情和善慈爱',
      skinTone: '自然温润健康老年肤色',
      hairDesc: '整洁自然的银白短发，梳理服帖有精神',
      clothingDesc: '浅云灰中式改良极简亚麻开衫，内搭米白棉麻圆领衫与深灰微弹直筒软呢长裤',
      materialsColorsDesc: '天然棉麻与高支亚麻，浅云灰与燕麦米白柔和色系',
      identityDesc: '家族最受尊敬的祖辈，温厚宽容的精神支柱',
      behaviorTags: ['静心品茶', '翻看家庭老相册', '慈爱抚摸孙辈', '安详小憩'],
      sceneTags: ['单人功能沙发区', '中式茶歇区', '阳光阳台花园', '三代同堂客厅'],
      poseTags: ['单人位展开脚托安详倚坐', '端握紫砂茶杯', '倾身微笑听孙儿讲述'],
      negativeConstraints: ['严禁年轻化漂移', '严禁面容失真', '严禁穿着违和现代潮服', '严禁手部畸变']
    },
    promptFragment: 'one venerable 70-year-old East Asian grandfather, dignified warm smile, silver hair, wearing soft cloud-grey linen cardigan and dark tailored trousers',
    negativeConstraints: ['age drifting below 65', 'face distortion', 'deformed hands', 'unnatural clothing'],
    isSystem: true,
    isFavorite: true,
    favorite: true,
    refCount: 38,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  },

  // 3. 家庭女主人 / Mother (36-42岁)
  {
    id: 'role-mother-01',
    type: 'model',
    code: 'ROLE-MOTHER-01',
    name: '家庭女主人 · 知性典雅',
    nameZh: '家庭女主人 · 知性典雅',
    nameEn: 'Mother / Claire',
    roleType: 'mother',
    gender: 'female',
    ageGroup: '36-42岁 优雅风华',
    height: '168cm 曼妙知性',
    positioning: '现代知性女主人 / 美学主理人 / 温柔母亲',
    temperamentKeywords: ['知性优雅', '东方骨相', '温润明媚', '松弛贵气'],
    bio: '38岁知性女主人，东亚温婉骨相，五官清秀立体，微裸妆容，身着米白羊绒针织衫与真丝垂坠阔腿裤，从容举止散发居家的松弛美学。',
    tags: ['女主人', '知性典雅', '36-42岁', '双面羊绒', '温润明媚'],
    coverImage: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
    views: {
      front: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
      frontFullBody: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
      side: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80',
      sideFullBody: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
      back: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      backFullBody: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
      portrait: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
      portraitCloseUp: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
      angle45: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      threeQuarter: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      fullBody: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
      wardrobeRef: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80',
      outfitRef: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80',
      accessoryRef: 'https://images.unsplash.com/photo-1535295972055-1c762f4483e5?auto=format&fit=crop&w=800&q=80'
    },
    multiViews: {
      front: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
      threeQuarter: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      side: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80',
      fullBody: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
      outfitRef: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80'
    },
    expressionRefs: [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80'
    ],
    wardrobeRefs: [
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80'
    ],
    accessoryRefs: [
      'https://images.unsplash.com/photo-1535295972055-1c762f4483e5?auto=format&fit=crop&w=800&q=80'
    ],
    detailRefs: [
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80'
    ],
    lifestyleRefs: [
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80'
    ],
    modelDna: {
      identitySeed: 88403,
      roleType: 'mother',
      gender: 'female',
      ageRange: '36-42岁',
      ageGroup: '36-42岁 优雅风华',
      ethnicity: '东亚',
      height: '168cm 曼妙知性',
      heightCm: 168,
      bodyBuild: 'slender_graceful',
      positioning: '现代知性女主人 / 美学主理人 / 温柔母亲',
      temperamentKeywords: ['知性优雅', '东方骨相', '温润明媚', '松弛贵气'],
      bio: '38岁知性女主人，东亚温婉骨相，五官清秀立体，从容举止散发居家的松弛美学。',
      appearanceDesc: '38岁东亚优雅知性女性，天鹅颈，温婉鹅蛋脸，对称清秀五官，清透裸妆，眼神温和明澈',
      facialFeatures: '东亚温婉骨相，双眸明亮清透，双唇自然红润，微浅笑意',
      skinTone: '自然清透象牙白皙肌',
      hairDesc: '黑茶色微卷及肩锁骨发，蓬松自然有光泽',
      clothingDesc: '极简高级燕麦米白羊绒针织衫，搭配香槟金真丝垂感阔腿裤与羊皮软底鞋',
      materialsColorsDesc: '顶级双面羊绒与真丝混纺，暖调燕麦色与香槟金',
      identityDesc: '家庭女主人与生活美学主理，情感与品位核心',
      behaviorTags: ['品鉴手冲咖啡', '亲子共读', '花艺插花', '温柔微笑交谈'],
      sceneTags: ['客厅贵妃榻', '开放式吧台', '主卧私享休闲角', '餐厅长桌'],
      poseTags: ['贵妃位侧身优雅斜倚', '双手捧白瓷杯', '微倾身体抚慰孩子'],
      negativeConstraints: ['严禁面部僵硬或整容脸', '严禁过度年轻化或老化', '严禁服装材质塑料廉价感', '严禁肢体变形']
    },
    promptFragment: 'one graceful 38-year-old East Asian mother figure, natural intellectual elegance, wearing cream beige cashmere cardigan and champagne silk palazzo trousers',
    negativeConstraints: ['face distortion', 'age drifting outside 36-42', 'deformed hands', 'cheap polyester texture'],
    isSystem: true,
    isFavorite: true,
    favorite: true,
    refCount: 45,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  },

  // 4. 奶奶 / Grandmother (62-68岁)
  {
    id: 'role-grandmother-01',
    type: 'model',
    code: 'ROLE-GRANDMOTHER-01',
    name: '奶奶 · 端庄和蔼',
    nameZh: '奶奶 · 端庄和蔼',
    nameEn: 'Grandmother / Eleanor',
    roleType: 'grandmother',
    gender: 'female',
    ageGroup: '62-68岁 端庄仁厚',
    height: '162cm 雍容和善',
    positioning: '慈爱长者 / 家族温情纽带 / 端庄和蔼',
    temperamentKeywords: ['端庄慈爱', '温润祥和', '知书达礼', '雍容从容'],
    bio: '65岁长辈奶奶，银白微卷短发，神态安详仁厚，面容整洁和悦，身着云灰淡雅香云纱上衣与柔棉长裙，目光满载对家庭的爱与关怀。',
    tags: ['长辈奶奶', '端庄和蔼', '62-68岁', '香云纱', '家族纽带'],
    coverImage: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
    views: {
      front: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      frontFullBody: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      side: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      sideFullBody: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      back: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      backFullBody: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      portrait: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      portraitCloseUp: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      angle45: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      threeQuarter: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      fullBody: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      wardrobeRef: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80',
      outfitRef: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80',
      accessoryRef: 'https://images.unsplash.com/photo-1535295972055-1c762f4483e5?auto=format&fit=crop&w=800&q=80'
    },
    multiViews: {
      front: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      threeQuarter: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      side: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      fullBody: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      outfitRef: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80'
    },
    expressionRefs: [
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80'
    ],
    wardrobeRefs: [
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80'
    ],
    accessoryRefs: [
      'https://images.unsplash.com/photo-1535295972055-1c762f4483e5?auto=format&fit=crop&w=800&q=80'
    ],
    detailRefs: [
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80'
    ],
    lifestyleRefs: [
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80'
    ],
    modelDna: {
      identitySeed: 88404,
      roleType: 'grandmother',
      gender: 'elder',
      ageRange: '62-68岁',
      ageGroup: '62-68岁 端庄仁厚',
      ethnicity: '东亚',
      height: '162cm 雍容和善',
      heightCm: 162,
      bodyBuild: 'balanced_graceful',
      positioning: '慈爱长者 / 家族温情纽带 / 端庄和蔼',
      temperamentKeywords: ['端庄慈爱', '温润祥和', '知书达礼', '雍容从容'],
      bio: '65岁长辈奶奶，银白微卷短发，神态安详仁厚，面容整洁和悦。',
      appearanceDesc: '65岁东亚端庄老妇人，微卷蓬松银发，眉眼慈祥和蔼，皱纹自然优雅，神态雍容安详',
      facialFeatures: '慈祥和煦面容，温润眼眸，面带自然和善微笑',
      skinTone: '温润自然老年肤色',
      hairDesc: '整齐微卷短发，自然银白微灰发色',
      clothingDesc: '淡烟灰香云纱改良中袖上衣，搭配米灰柔棉长裙与羊绒刺绣披肩',
      materialsColorsDesc: '高定香云纱与柔软真丝羊绒，典雅灰与珍珠白',
      identityDesc: '家族最温厚慈爱的女长辈，团聚的温情凝聚点',
      behaviorTags: ['陪伴孙女讲故事', '分发水果点心', '合掌欣慰微笑', '品尝花草茶'],
      sceneTags: ['客厅主沙发位', '全家福就餐区', '阳光阅读茶座'],
      poseTags: ['端坐于沙发舒适位', '单手扶膝另一手轻拍孙儿', '安详靠背小憩'],
      negativeConstraints: ['严禁面部扭曲', '严禁年轻化漂移', '严禁换成违和服装', '严禁肢体畸变']
    },
    promptFragment: 'one gracious 65-year-old East Asian grandmother, benevolent warm expression, silver short hair, wearing muted cloud-grey silk blouse and soft cashmere shawl',
    negativeConstraints: ['age drifting below 60', 'face distortion', 'deformed limbs', 'unnatural clothing'],
    isSystem: true,
    isFavorite: true,
    favorite: true,
    refCount: 36,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  },

  // 5. 混血女儿 / Young Daughter (6-8岁)
  {
    id: 'role-daughter-01',
    type: 'model',
    code: 'ROLE-DAUGHTER-01',
    name: '混血女儿 · 灵动甜美',
    nameZh: '混血女儿 · 灵动甜美',
    nameEn: 'Young Daughter / Mia',
    roleType: 'daughter',
    gender: 'female',
    ageGroup: '6-8岁 纯真烂漫',
    height: '122cm 玲珑灵动',
    positioning: '全家掌上明珠 / 灵动小天使 / 活泼好奇',
    temperamentKeywords: ['混血灵动', '双眸清澈', '纯真甜美', '活泼可爱'],
    bio: '7岁欧亚混血女孩，五官精致如洋娃娃，琥珀色明亮大眼，栗色微卷长发系着奶白蝴蝶结，身着莫兰迪粉棉麻背带裙与纯白荷叶领衬衫。',
    tags: ['混血女儿', '灵动甜美', '6-8岁', '莫兰迪粉背带裙', '双眸清澈'],
    coverImage: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
    views: {
      front: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      frontFullBody: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      side: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      sideFullBody: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      back: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      backFullBody: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      portrait: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      portraitCloseUp: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      angle45: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      threeQuarter: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      fullBody: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      wardrobeRef: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80',
      outfitRef: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80',
      accessoryRef: 'https://images.unsplash.com/photo-1535295972055-1c762f4483e5?auto=format&fit=crop&w=800&q=80'
    },
    multiViews: {
      front: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      threeQuarter: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      side: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      fullBody: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      outfitRef: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80'
    },
    expressionRefs: [
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80'
    ],
    wardrobeRefs: [
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80'
    ],
    accessoryRefs: [
      'https://images.unsplash.com/photo-1535295972055-1c762f4483e5?auto=format&fit=crop&w=800&q=80'
    ],
    detailRefs: [
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80'
    ],
    lifestyleRefs: [
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80'
    ],
    modelDna: {
      identitySeed: 88405,
      roleType: 'daughter',
      gender: 'child',
      ageRange: '6-8岁',
      ageGroup: '6-8岁 纯真烂漫',
      ethnicity: '欧亚混血',
      height: '122cm 玲珑灵动',
      heightCm: 122,
      bodyBuild: 'petite_child',
      positioning: '全家掌上明珠 / 灵动小天使 / 活泼好奇',
      temperamentKeywords: ['混血灵动', '双眸清澈', '纯真甜美', '活泼可爱'],
      bio: '7岁欧亚混血女孩，五官精致如洋娃娃，琥珀色明亮大眼，栗色微卷长发系着奶白蝴蝶结。',
      appearanceDesc: '7岁欧亚混血小女孩，白皙红润肌肤，大而灵动的琥珀色眼眸，微卷栗色长发，苹果肌饱满可爱',
      facialFeatures: '精致欧亚混血面庞，大眼清澈，笑容甜美纯真',
      skinTone: '自然白嫩通透粉白童颜',
      hairDesc: '栗色微卷长发，头顶系有奶白丝绒蝴蝶结发带',
      clothingDesc: '莫兰迪粉质感棉麻背带裙，内搭白色纯棉娃娃领衬衫，白色棉袜配酒红小皮鞋',
      materialsColorsDesc: '有机纯棉与亚麻混纺，莫兰迪粉与乳白色',
      identityDesc: '家庭掌上明珠小女儿，活泼温情的氛围中心',
      behaviorTags: ['抱玩偶依偎', '阅读立体童话书', '拼插积木', '拉父母衣角撒娇'],
      sceneTags: ['客厅羊毛地毯区', '三人位沙发父母身旁', '儿童游乐角'],
      poseTags: ['双膝盘坐于地毯上', '依偎在母亲手臂旁', '高举童话书展示'],
      negativeConstraints: ['严禁成人化或违和表情', '严禁年龄漂移超龄', '严禁面容怪异', '严禁多指或肢体穿模']
    },
    promptFragment: 'one adorable 7-year-old Eurasian mixed-race young daughter, sweet crystal eyes, wavy chestnut hair with white ribbon, wearing dusty pink linen pinafore dress and white cotton blouse',
    negativeConstraints: ['adult look', 'age drifting outside 6-8', 'face distortion', 'deformed limbs', 'extra fingers'],
    isSystem: true,
    isFavorite: true,
    favorite: true,
    refCount: 40,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  },

  // 6. 混血男孩 / Young Son (8-10岁)
  {
    id: 'role-son-01',
    type: 'model',
    code: 'ROLE-SON-01',
    name: '混血男孩 · 阳光机敏',
    nameZh: '混血男孩 · 阳光机敏',
    nameEn: 'Young Son / Leo',
    roleType: 'son',
    gender: 'male',
    ageGroup: '8-10岁 阳光少年',
    height: '135cm 挺拔阳光',
    positioning: '活力长子 / 机敏好学 / 阳光小暖男',
    temperamentKeywords: ['阳光机敏', '混血五官', '英气清秀', '探索好奇'],
    bio: '9岁欧亚混血男孩，眼眸深邃明亮，蓬松浅棕短发，身着深藏青纯棉Polo衫与浅卡其休闲短裤，身形挺拔匀称，充满求知欲与探索精神。',
    tags: ['混血男孩', '阳光机敏', '8-10岁', '纯棉Polo', '科技探索'],
    coverImage: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
    views: {
      front: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
      frontFullBody: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
      side: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
      sideFullBody: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
      back: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
      backFullBody: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
      portrait: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
      portraitCloseUp: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
      angle45: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
      threeQuarter: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
      fullBody: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
      wardrobeRef: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80',
      outfitRef: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80',
      accessoryRef: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=800&q=80'
    },
    multiViews: {
      front: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
      threeQuarter: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
      side: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
      fullBody: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
      outfitRef: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80'
    },
    expressionRefs: [
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80'
    ],
    wardrobeRefs: [
      'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80'
    ],
    accessoryRefs: [
      'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=800&q=80'
    ],
    detailRefs: [
      'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80'
    ],
    lifestyleRefs: [
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80'
    ],
    modelDna: {
      identitySeed: 88406,
      roleType: 'son',
      gender: 'child',
      ageRange: '8-10岁',
      ageGroup: '8-10岁 阳光少年',
      ethnicity: '欧亚混血',
      height: '135cm 挺拔阳光',
      heightCm: 135,
      bodyBuild: 'athletic_boy',
      positioning: '活力长子 / 机敏好学 / 阳光小暖男',
      temperamentKeywords: ['阳光机敏', '混血五官', '英气清秀', '探索好奇'],
      bio: '9岁欧亚混血男孩，眼眸深邃明亮，蓬松浅棕短发，身着深藏青纯棉Polo衫与浅卡其休闲短裤。',
      appearanceDesc: '9岁欧亚混血男孩，立体清秀五官，阳光自信明亮眼眸，浅棕色蓬松短发，小麦白皙肤色',
      facialFeatures: '英气挺拔少年面相，剑眉清目，神采飞扬',
      skinTone: '健康自然白皙微麦肤色',
      hairDesc: '蓬松自然浅棕短发，清爽利落',
      clothingDesc: '深藏青高织透气纯棉Polo衫，浅卡其直筒短裤，搭配白色短袜与运动鞋',
      materialsColorsDesc: '高支纯棉与卡其斜纹布，深藏青与浅卡其色系',
      identityDesc: '家庭长子，活泼聪敏有担当的小小男子汉',
      behaviorTags: ['操控平板电脑', '组装航模', '专注听讲', '与父亲探讨科技'],
      sceneTags: ['茶几地毯区', '沙发扶手侧座', '餐桌学习区'],
      poseTags: ['地毯上盘腿扶茶几操作平板', '挺直坐姿手持航模', '侧身倾听爷爷讲故事'],
      negativeConstraints: ['严禁成人化或怪异神态', '严禁年龄漂移超龄', '严禁面部扭曲', '严禁肢体变形']
    },
    promptFragment: 'one handsome 9-year-old Eurasian mixed-race young son, intelligent bright eyes, fluffy light brown short hair, wearing navy cotton polo shirt and beige khaki shorts',
    negativeConstraints: ['adult facial structure', 'age drifting outside 8-10', 'face distortion', 'deformed limbs', 'extra fingers'],
    isSystem: true,
    isFavorite: true,
    favorite: true,
    refCount: 39,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  }
];

// 3. 结构化人物场景模板库 (Template Library)
export const DEFAULT_FAMILY_TEMPLATES: FamilySceneTemplate[] = [
  // 模板 1: 贵族｜姿态1｜客厅家庭组合4人
  {
    templateId: 'tpl-noble-living-4p',
    templateType: '贵族尊享',
    templateName: '贵族｜姿态1｜客厅家庭组合4人',
    sceneCategory: '大平层客厅',
    cameraLens: '35mm 广角全景 (Hasselblad H6D-100c)',
    spaceType: '奢华大平层挑高客厅',
    characterCount: 4,
    roleBindings: ['father', 'mother', 'daughter', 'son'],
    characterPositionRules: [
      {
        role: 'father',
        roleName: '家庭男主人',
        position: '沙发左侧一号电动功能主座',
        action: '45°半躺于头等舱展开脚托，左手搭在皮质扶手，右手握持精装财经画册，目光从容温和',
        interaction: '与身侧妻子眼神交汇，从容享受居家时光',
        referencePoseTag: '头等舱电动脚托舒展态'
      },
      {
        role: 'mother',
        roleName: '家庭女主人',
        position: '沙发右侧贵妃榻休闲位',
        action: '优雅侧倚于真皮贵妃位，手捧白瓷咖啡杯，身体微倾注视依偎身旁的女儿',
        interaction: '一手轻抚女儿后背，满眼温柔慈爱',
        referencePoseTag: '贵妃位侧身倾谈品茗'
      },
      {
        role: 'daughter',
        roleName: '混血女儿',
        position: '紧贴母亲身侧的沙发软垫上',
        action: '双膝收拢坐于沙发垫，头靠母亲手臂，小手指向立体童话书中的城堡',
        interaction: '依偎母亲怀中，娇憨甜美',
        referencePoseTag: '亲子依偎阅读'
      },
      {
        role: 'son',
        roleName: '混血男孩',
        position: '沙发前方顶级羊毛地毯，背靠大理石茶几下沿',
        action: '盘腿坐于地毯上，双手操作平板电脑，神情专注机敏',
        interaction: '偶尔抬头与父亲分享屏幕内容',
        referencePoseTag: '地毯盘腿科技互动'
      }
    ],
    characterActionRules: '四人动静结合，男主人舒展深躺，女主人优雅侧倚，女儿依偎母亲，男孩地毯自主探索，构成经典的家庭黄金视觉金字塔。',
    sceneDesc: '顶奢大平层挑高挑空大客厅，巨幅落地窗映入午后温暖斜射阳光，现代意式极简硬装线条，微水泥与浅灰大理石地面铺设手工纯羊毛地毯。',
    furnitureDesc: '芝华仕头等舱意式奢华组合真皮沙发，云雾暖灰半苯胺头层牛皮，电动功能位平稳展开，极简黑色哑光金属底架，搭配意大利天然白大理石茶几。',
    lightingDesc: '午后45度柔和暖金自然侧逆光，漫反射补光，真皮表面泛出丝缎般细腻高光，无刺眼杂光。',
    propsDesc: '大理石茶几上摆放精装建筑画册、白瓷咖啡杯、极简透明玻璃花瓶与洋桔梗鲜花。',
    atmosphereDesc: '尊贵从容的当代豪宅生活方式，宁静、温馨、秩序井然的家庭天伦之乐。',
    styleDesc: '高端商业摄影级质感，8K超高解析度，哈苏中画幅浅景深与胶片级细腻质感。',
    negativeConstraints: [
      '禁止新增任何未指定人物',
      '严禁人物脱离沙发与地毯锚点',
      '严禁面容变形与年龄漂移',
      '严禁肢体畸变或多余手指',
      '严格服从窗口2骨骼与位置线稿'
    ],
    disallowExtraCharacters: true,
    forceLockPositionMap: true,
    window1SceneRef: {
      title: '窗口 1：基础场景与家具产品真值图',
      imageUrl: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80',
      description: '大平层客厅基准空间、芝华仕真皮转角沙发与大理石茶几硬装空间'
    },
    window2WireframeRef: {
      title: '窗口 2：4人动态骨骼线稿与空间位置锁定图',
      imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
      description: '严格定义男主/女主/女儿/男孩4人空间坐标 [x,y,z] 与身体朝向动线',
      positionMapUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80'
    },
    coverImage: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=80',
    tags: ['贵族尊享', '4人家庭', '客厅场景', '头等舱真皮', '黄金构图'],
    isSystem: true,
    isFavorite: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  },

  // 模板 2: 贵族｜姿态1｜客厅家庭组合6人 (三代同堂)
  {
    templateId: 'tpl-noble-living-6p',
    templateType: '贵族尊享',
    templateName: '贵族｜姿态1｜客厅家庭组合6人',
    sceneCategory: '大平层客厅',
    cameraLens: '28mm 超广角全景 (Hasselblad H6D-100c)',
    spaceType: '双层挑空现代墅级客厅',
    characterCount: 6,
    roleBindings: ['grandfather', 'grandmother', 'father', 'mother', 'son', 'daughter'],
    characterPositionRules: [
      {
        role: 'grandfather',
        roleName: '爷爷',
        position: '左侧尊享单人位功能转椅',
        action: '电动脚托舒适展开，安详微笑，单手轻端紫砂品茗杯',
        interaction: '慈爱注视地毯上玩耍的孙子孙女',
        referencePoseTag: '长者尊享单人位品茗'
      },
      {
        role: 'grandmother',
        roleName: '奶奶',
        position: '靠近爷爷的单人座或三人位左侧靠背处',
        action: '端庄侧坐，双手轻放于膝上披肩，面容慈祥和悦',
        interaction: '欣慰注视全家人，温厚凝视',
        referencePoseTag: '端庄仁厚陪伴'
      },
      {
        role: 'father',
        roleName: '家庭男主人',
        position: '三人主位沙发中央',
        action: '沉稳端坐，手臂自然搭在靠背上，身姿挺拔微向妻子倾听',
        interaction: '与妻子轻声交流，目光坚定有担当',
        referencePoseTag: '沉稳中枢主位'
      },
      {
        role: 'mother',
        roleName: '家庭女主人',
        position: '三人主位沙发右侧',
        action: '优雅倾斜倚坐，手搭在女儿肩膀上，神情温婉明媚',
        interaction: '护着身旁欢笑的女儿',
        referencePoseTag: '知性优雅护持'
      },
      {
        role: 'daughter',
        roleName: '混血女儿',
        position: '母亲与父亲之间的沙发坐垫',
        action: '双手举起毛绒玩偶，天真欢笑，小脚欢快踢动',
        interaction: '向全家展示新玩具',
        referencePoseTag: '童真欢笑互动'
      },
      {
        role: 'son',
        roleName: '混血男孩',
        position: '地毯中央靠近爷爷膝旁',
        action: '半跪在羊毛地毯上，双手托着刚拼好的航模飞机仰头展示',
        interaction: '向爷爷自豪展示模型，眼神充满崇拜与期待',
        referencePoseTag: '三代天伦探究展示'
      }
    ],
    characterActionRules: '六人三代同堂构成分层空间：长辈居尊位安详品茶，年轻夫妇居主位从容谈笑，儿女居中心与地毯活泼互动，画面极富生机与豪门温情。',
    sceneDesc: '奢华双层挑空别墅客厅，全景落地玻璃幕墙外是私人庭院绿植，室内木饰面与古铜金属收边，高级定制羊毛地毯。',
    furnitureDesc: '芝华仕旗舰款超长组合转角真皮沙发，配独立单人电动头等舱多功能椅，半苯胺进口头层牛皮，大理石组合双茶几。',
    lightingDesc: '天光与侧逆柔和午后日光交融，营造温暖舒适的漫射大宅光感，皮质反光柔和细腻。',
    propsDesc: '紫砂茶具组、航模零件、毛绒玩偶、精装画册、高定香氛蜡烛。',
    atmosphereDesc: '盛世同堂、尊荣华贵又充满人间烟火温情的中国顶级家庭画卷。',
    styleDesc: '大师级宽画幅家族肖像摄影，超高动态范围，细腻光影渐变。',
    negativeConstraints: [
      '严禁新增第7个人物',
      '严禁人物角色与位置颠倒混乱',
      '严禁面容模糊变形',
      '严禁肢体异化或多余肢体',
      '强制服从窗口2空间拓扑定位'
    ],
    disallowExtraCharacters: true,
    forceLockPositionMap: true,
    window1SceneRef: {
      title: '窗口 1：墅级挑空客厅全景与超长组合功能沙发',
      imageUrl: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80',
      description: '挑高挑空客厅、超长芝华仕真皮转角沙发与单人功能椅空间'
    },
    window2WireframeRef: {
      title: '窗口 2：6人全景空间拓扑线稿与位置锁定图',
      imageUrl: 'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1200&q=80',
      description: '严格锚定爷爷/奶奶/父亲/母亲/女儿/男孩6人空间三维坐标与视线焦点',
      positionMapUrl: 'https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1200&q=80'
    },
    coverImage: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80',
    tags: ['贵族尊享', '6人全家福', '三代同堂', '挑空墅级客厅', '顶级奢华'],
    isSystem: true,
    isFavorite: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  },

  // 模板 3: 商企｜餐桌添加模特｜三代同堂6人
  {
    templateId: 'tpl-biz-dining-6p',
    templateType: '商企精英',
    templateName: '商企｜餐桌添加模特｜三代同堂6人',
    sceneCategory: '轻奢餐厅',
    cameraLens: '50mm 电影级标准镜头 (Leica Summilux-C)',
    spaceType: '开放式奢华餐厨岛台与长餐桌',
    characterCount: 6,
    roleBindings: ['grandfather', 'grandmother', 'father', 'mother', 'son', 'daughter'],
    characterPositionRules: [
      {
        role: 'grandfather',
        roleName: '爷爷',
        position: '长餐桌正中首位 (主座)',
        action: '手执晶莹玻璃公道杯，笑容宽厚安详，目光慈爱环顾全桌',
        interaction: '主位主持温馨家宴，德高望重',
        referencePoseTag: '餐桌长者主位'
      },
      {
        role: 'grandmother',
        roleName: '奶奶',
        position: '坐在爷爷右手边主宾位',
        action: '双手轻叠在桌旁亚麻餐巾上，神态雍容慈祥，笑意盈盈',
        interaction: '欣喜注视孙辈品尝美食',
        referencePoseTag: '主宾位端庄就坐'
      },
      {
        role: 'father',
        roleName: '家庭男主人',
        position: '餐桌左侧长边位',
        action: '身体微微前倾，面带笑容向爷爷举起香槟酒杯致敬',
        interaction: '孝敬长辈，谈笑风生',
        referencePoseTag: '绅士举杯致意'
      },
      {
        role: 'mother',
        roleName: '家庭女主人',
        position: '父亲身侧，紧邻女儿',
        action: '优雅侧身，手拿银质餐夹为女儿盘中添上一块精致甜点',
        interaction: '温柔照顾女儿，母爱溢于言表',
        referencePoseTag: '知性分餐互动'
      },
      {
        role: 'daughter',
        roleName: '混血女儿',
        position: '母亲身旁的高定儿童真皮餐椅',
        action: '双手拿着小叉子，看着盘中小蛋糕雀跃欢笑',
        interaction: '向妈妈甜美道谢',
        referencePoseTag: '欢快就餐姿态'
      },
      {
        role: 'son',
        roleName: '混血男孩',
        position: '父亲身侧餐椅',
        action: '坐姿挺拔规整，双手规矩放于餐桌边缘，专注倾听长辈讲话',
        interaction: '表现出受过良好教养的少年绅士风度',
        referencePoseTag: '挺拔聆听就餐'
      }
    ],
    characterActionRules: '餐桌入座层次分明，举杯致意、分餐照拂、欢笑品尝自然融合，充满高端商企家庭的高尚生活教养与温暖亲情。',
    sceneDesc: '开放式轻奢西厨与长餐桌，背景为定制木饰面酒窖恒温展示柜与现代大理石料理岛台，上方悬挂极简线型艺术吊灯。',
    furnitureDesc: '意大利奢华整块天然雪花白岩板长餐桌，搭配芝华仕高定人体工学真皮软包餐椅，细黑钛合金桌腿。',
    lightingDesc: '餐桌上方3000K暖白艺术吊灯聚光，配合背景氛围灯带与侧面柔和窗光，餐具与皮椅反光晶莹剔透。',
    propsDesc: '精美西式骨瓷餐盘、银质刀叉、水晶高脚香槟杯、新鲜无花果与蓝莓烘焙点心、白瓷花瓶与插花。',
    atmosphereDesc: '高知商企家族温馨丰盛的周末盛宴，精致、从容、高雅而满溢温情。',
    styleDesc: '商业大片级质感，微距食物与人物皮肤细节真实生动，色彩还原精准。',
    negativeConstraints: [
      '严禁多加或漏掉人物',
      '严禁餐具穿模或手部拿取姿态扭曲',
      '严禁人物面容变形与年龄漂移',
      '强制按窗口2就餐席位锁定'
    ],
    disallowExtraCharacters: true,
    forceLockPositionMap: true,
    window1SceneRef: {
      title: '窗口 1：岩板长餐桌、真皮餐椅与轻奢餐厨空间真值图',
      imageUrl: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=80',
      description: '雪花白岩板餐桌、真皮餐椅、酒柜与西厨岛台基准空间'
    },
    window2WireframeRef: {
      title: '窗口 2：6人就餐席位动线与身体朝向锁定线稿图',
      imageUrl: 'https://images.unsplash.com/photo-1616046229478-9901c5536a45?auto=format&fit=crop&w=1200&q=80',
      description: '严格锁定主座爷爷/主宾奶奶/左长边父亲/右长边母亲/儿女席位',
      positionMapUrl: 'https://images.unsplash.com/photo-1616046229478-9901c5536a45?auto=format&fit=crop&w=1200&q=80'
    },
    coverImage: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=800&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=800&q=80',
    tags: ['商企精英', '6人餐桌', '三代同堂', '家宴聚会', '岩板真皮'],
    isSystem: true,
    isFavorite: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-28T00:00:00.000Z'
  }
];

// 4. 默认 7 大分类姿态资产 (Pose DNA 与沙发产品严格防遮挡)
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
   * 获取人物场景模板库
   */
  public getFamilyTemplates(filter?: { search?: string; category?: string; type?: string }): FamilySceneTemplate[] {
    let list = [...DEFAULT_FAMILY_TEMPLATES];
    if (filter) {
      if (filter.search) {
        const q = filter.search.toLowerCase();
        list = list.filter(
          t => t.templateName.toLowerCase().includes(q) ||
               t.sceneCategory.toLowerCase().includes(q) ||
               t.spaceType.toLowerCase().includes(q) ||
               t.tags.some(tag => tag.toLowerCase().includes(q))
        );
      }
      if (filter.category && filter.category !== 'all') {
        list = list.filter(t => t.sceneCategory === filter.category);
      }
      if (filter.type && filter.type !== 'all') {
        list = list.filter(t => t.templateType === filter.type);
      }
    }
    return list;
  }

  /**
   * 根据 ID 获取人物场景模板
   */
  public getFamilyTemplateById(id: string): FamilySceneTemplate | undefined {
    return DEFAULT_FAMILY_TEMPLATES.find(t => t.templateId === id);
  }

  /**
   * 拼装人物场景模板 7 段结构化提示词
   */
  public compileFamilyScenePrompt(
    template: FamilySceneTemplate,
    selectedModels: Record<string, ModelAsset> | ModelAsset[] = []
  ): {
    positivePrompt: string;
    negativePrompt: string;
    sections: {
      baseScene: string;
      roleBindings: string;
      posesAndActions: string;
      spatialConstraints: string;
      lightingAndProps: string;
      renderStyle: string;
      negativeConstraints: string;
    };
  } {
    // 1. 基础场景描述 (Window 1)
    const baseScene = `[MANWAH Master Scene - Spatial Environment]: ${template.sceneDesc}. Key furniture: ${template.furnitureDesc}. Spatial dimension: ${template.spaceType}, camera optic: ${template.cameraLens}. (Strictly aligned with Window 1 baseline visual truth)`;

    // 2. 角色绑定描述 (Model DNA)
    const modelMap: Record<string, ModelAsset> = Array.isArray(selectedModels)
      ? selectedModels.reduce((acc, m) => {
          acc[m.roleType || m.id] = m;
          return acc;
        }, {} as Record<string, ModelAsset>)
      : selectedModels;

    const roleBindingsDesc = template.roleBindings.map((roleKey, idx) => {
      const boundModel = modelMap[roleKey] || DEFAULT_MODELS.find(m => m.roleType === roleKey) || DEFAULT_MODELS[idx % DEFAULT_MODELS.length];
      return `[Actor ${idx + 1} - ${boundModel.nameZh} (${boundModel.nameEn})]: ${boundModel.modelDna.appearanceDesc || boundModel.name}, ${boundModel.modelDna.clothingDesc || boundModel.modelDna.wardrobeStyle || ''}, Age: ${boundModel.ageGroup}, DNA Seed #${boundModel.modelDna.identitySeed || 88000 + idx}. (Strict biometric and facial feature preservation)`;
    }).join('\n');

    // 3. 姿态与动作描述 (Window 2 线稿)
    const posesAndActions = `[Human Poses & Dynamic Gestures - Window 2 Blueprint]: Prioritize Window 2 skeleton wireframe. ${template.characterActionRules}. Specific actor poses: ${template.characterPositionRules.map(r => `${r.roleName}: ${r.action}${r.interaction ? ` (Interaction: ${r.interaction})` : ''}`).join('; ')}.`;

    // 4. 人物位置约束
    const spatialConstraints = `[Spatial Anchoring & Zero-Drift Constraint]: ${template.forceLockPositionMap ? 'MANDATORY COORD LOCK TO WINDOW 2 POSITION MAP. ' : ''}Coordinates: ${template.characterPositionRules.map(r => `${r.roleName} strictly anchored at [${r.position}]`).join(' | ')}. ${template.disallowExtraCharacters ? `EXACT CHARACTER COUNT: ${template.characterCount} PERSONS ONLY. STRICTLY PROHIBIT EXTRA OR HALLUCINATED CHARACTERS.` : ''}`;

    // 5. 空间光线与道具描述
    const lightingAndProps = `[Illumination & Set Props]: Lighting: ${template.lightingDesc}. Scene props: ${template.propsDesc}. Atmosphere: ${template.atmosphereDesc}.`;

    // 6. 输出风格描述
    const renderStyle = `[Photography Spec & Lens Craft]: ${template.styleDesc}, shot on medium format ${template.cameraLens}, 8K photorealistic UHD, subsurface skin scattering, pristine texture fidelity, zero chromatic aberration.`;

    // 7. 严格负面约束
    const negativeConstraints = [
      ...template.negativeConstraints,
      'hallucinated extra people',
      'unbound floating characters',
      'deformed facial features',
      'age drifting',
      'mutated limbs',
      'bad hands',
      'missing fingers',
      'dislocated furniture',
      'mismatched family roles',
      'low quality',
      'jpeg artifacts'
    ].join(', ');

    const positivePrompt = [
      baseScene,
      roleBindingsDesc,
      posesAndActions,
      spatialConstraints,
      lightingAndProps,
      renderStyle
    ].join('\n\n');

    return {
      positivePrompt,
      negativePrompt: negativeConstraints,
      sections: {
        baseScene,
        roleBindings: roleBindingsDesc,
        posesAndActions,
        spatialConstraints,
        lightingAndProps,
        renderStyle,
        negativeConstraints
      }
    };
  }

  /**
   * AI 识别人物资产卡大图 / 智能拆解资料
   */
  public async aiAnalyzeModelCard(
    imageSrc: string
  ): Promise<{
    nameZh: string;
    nameEn: string;
    roleType: any;
    gender: 'male' | 'female';
    ageGroup: string;
    height: string;
    positioning: string;
    temperamentKeywords: string[];
    bio: string;
    views: any;
    expressionRefs: string[];
    detailRefs: string[];
    lifestyleRefs: string[];
    modelDna: any;
  }> {
    // 模拟 1.2s 高精度多模态 AI 扫描
    await new Promise(r => setTimeout(r, 1200));

    return {
      nameZh: '定制角色 · AI 识别导入',
      nameEn: 'Custom Role / Imported',
      roleType: 'father',
      gender: 'male',
      ageGroup: '40-45岁 精英成熟期',
      height: '180cm 挺拔匀称',
      positioning: '家庭中枢 / 事业精英 / 沉稳男主',
      temperamentKeywords: ['沉稳儒雅', '亲和威严', '高智感', '从容温润'],
      bio: '通过 AI 资产卡扫描识别的人物真值资产，五官骨骼比例严谨，包含多视角与私服穿搭。',
      views: {
        front: imageSrc,
        frontFullBody: imageSrc,
        side: imageSrc,
        sideFullBody: imageSrc,
        back: imageSrc,
        backFullBody: imageSrc,
        portrait: imageSrc,
        portraitCloseUp: imageSrc,
        angle45: imageSrc,
        threeQuarter: imageSrc,
        fullBody: imageSrc,
        wardrobeRef: imageSrc,
        outfitRef: imageSrc,
        accessoryRef: imageSrc
      },
      expressionRefs: [imageSrc, imageSrc],
      detailRefs: [imageSrc],
      lifestyleRefs: [imageSrc],
      modelDna: {
        identitySeed: Math.floor(100000 + Math.random() * 900000),
        roleType: 'father',
        gender: 'male',
        ageRange: '40-45岁',
        ageGroup: '40-45岁 精英成熟期',
        ethnicity: '东亚',
        height: '180cm',
        heightCm: 180,
        bodyBuild: 'athletic_slender',
        positioning: '家庭中枢 / 事业精英 / 沉稳男主',
        temperamentKeywords: ['沉稳儒雅', '亲和威严', '高智感', '从容温润'],
        appearanceDesc: '五官端正对称，下颌线清晰，目光温和深邃',
        facialFeatures: '东亚端正骨相，高挺鼻梁，从容笑意',
        skinTone: '自然白皙健康光泽',
        hairDesc: '利落商务短发，整洁自然',
        clothingDesc: '极简高级针织毛衫配深色休闲长裤',
        materialsColorsDesc: '天然羊毛面料与棉麻混纺，低饱和高级灰',
        identityDesc: '家庭核心男主人，温和睿智',
        behaviorTags: ['专注阅读', '沉稳品茗', '陪伴家人'],
        sceneTags: ['大平层客厅', '独立书房'],
        poseTags: ['功能位半躺', '沙发端坐'],
        negativeConstraints: ['严禁面部变形', '严禁年龄漂移', '严禁肢体畸变']
      }
    };
  }

  /**
   * 创建模特资产
   */
  public createModel(params: Partial<ModelAsset> & { name: string }): ModelAsset {
    const id = `model-custom-${Date.now().toString(36)}`;
    const roleType = params.roleType || 'father';
    const nameZh = params.nameZh || params.name;
    const nameEn = params.nameEn || `Custom / ${roleType}`;
    const primaryImg = params.coverImage || params.thumbnail || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80';
    
    const asset: ModelAsset = {
      id,
      type: 'model',
      code: params.code || `ROLE-CUST-${Math.floor(100 + Math.random() * 900)}`,
      name: nameZh,
      nameZh: nameZh,
      nameEn: nameEn,
      roleType: roleType as any,
      gender: params.gender || (['mother', 'grandmother', 'daughter'].includes(roleType) ? 'female' : 'male'),
      ageGroup: params.ageGroup || '35-45岁 成熟期',
      height: params.height || '175cm',
      positioning: params.positioning || '核心家庭成员',
      temperamentKeywords: params.temperamentKeywords || ['从容', '自然', '高智感'],
      bio: params.bio || '自定义录入的人物真值资产卡。',
      tags: params.tags || ['自定义角色', nameZh],
      coverImage: primaryImg,
      thumbnail: primaryImg,
      views: {
        front: primaryImg,
        portrait: primaryImg,
        ...params.views,
        ...params.multiViews
      },
      multiViews: {
        front: primaryImg,
        ...params.multiViews,
        ...params.views
      },
      expressionRefs: params.expressionRefs || [primaryImg],
      wardrobeRefs: params.wardrobeRefs || [primaryImg],
      accessoryRefs: params.accessoryRefs || [primaryImg],
      detailRefs: params.detailRefs || [primaryImg],
      lifestyleRefs: params.lifestyleRefs || [primaryImg],
      modelDna: params.modelDna || {
        identitySeed: Math.floor(100000 + Math.random() * 900000),
        roleType: roleType as any,
        gender: params.gender || 'male',
        ageGroup: params.ageGroup || '35-45岁',
        appearanceDesc: '定制五官轮廓与身材比例',
        clothingDesc: '简约现代私服',
        materialsColorsDesc: '高质感天然面料',
        identityDesc: '家庭成员',
        behaviorTags: ['居家放松'],
        sceneTags: ['客厅', '书房'],
        poseTags: ['坐姿', '站姿'],
        negativeConstraints: ['严禁面部变形', '严禁年龄漂移']
      },
      promptFragment: params.promptFragment || `${nameZh}, ${nameEn}`,
      negativeConstraints: params.negativeConstraints || ['face distortion', 'deformed limbs'],
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
