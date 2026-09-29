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
  FamilySceneTemplate,
  HumanLayoutConfig
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

// 2. 模特资产库 (纯用户自建与AI导入，无默认固定家庭角色预设)
export const DEFAULT_MODELS: ModelAsset[] = [];

// 3. 人物场景模板预设库 (已清空，人物由 Human Layout 动态编排器驱动)
export const DEFAULT_FAMILY_TEMPLATES: FamilySceneTemplate[] = [];

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
      const boundModel = modelMap[roleKey] || (DEFAULT_MODELS.length > 0 ? (DEFAULT_MODELS.find(m => m.roleType === roleKey) || DEFAULT_MODELS[idx % DEFAULT_MODELS.length]) : null);
      if (!boundModel) {
        return `[Actor ${idx + 1} - ${roleKey}]: High quality authentic lifestyle model, natural seating posture and refined attire.`;
      }
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
  /**
   * 拼装 Human Layout 人物编排器结构化提示词
   * 严格锁定空间架构、主沙发产品、家具摆位、光线与 Camera，只新增指定角色
   */
  public compileHumanLayoutPrompt(
    layout: HumanLayoutConfig,
    availableModels: ModelAsset[] = []
  ): {
    positivePrompt: string;
    negativePrompt: string;
    humanDirectives: string;
  } {
    const slots = layout.slots || [];
    const count = layout.characterCount || slots.length;

    const slotDirectives = slots.map((slot, index) => {
      const boundModel = slot.modelId ? availableModels.find(m => m.id === slot.modelId) : null;
      const modelDesc = boundModel
        ? `${boundModel.nameZh || boundModel.name} (${boundModel.ageGroup || '40岁精英'}, ${boundModel.modelDna?.outfitStyle || 'Quiet Luxury'})`
        : (slot.modelName || `角色位 ${index + 1}`);

      return `[Character Slot #${index + 1} - ${modelDesc}]:\n- Designated Position: ${slot.positionDesc || '客厅主沙发人体工学功能位'}\n- Designated Action / Posture: ${slot.actionDesc || '从容就座，自然融入居室环境'}`;
    }).join('\n\n');

    const humanDirectives = `[IN-PLACE ERGONOMIC HUMAN INTEGRATION - EXACT ${count} PERSONS ONLY]
COMMERCIAL MANDATE:
1. Living room architecture, hero sofa, and all existing furnishings MUST REMAIN 100% UNCHANGED.
2. Photorealistically integrate exactly ${count} individuals into designated seats without altering furniture placement:
${slotDirectives}
${layout.disallowExtraCharacters ? '3. STRICT LIMIT: EXACTLY ' + count + ' PERSONS. STRICTLY PROHIBIT ANY EXTRA BACKGROUND PEOPLE, BYSTANDERS, OR STRANGERS.' : ''}`;

    const positivePrompt = `commercial photorealistic architectural lifestyle photography, seamless in-place human integration.
${humanDirectives}`;

    const negativePrompt = [
      'displaced furniture',
      'changed sofa color',
      'deformed limbs',
      'floating human',
      'bad anatomy',
      'mutated hands',
      'missing fingers',
      'extra limbs',
      ...(layout.disallowExtraCharacters ? [
        'extra people',
        'additional people',
        'bystanders',
        'crowd',
        'random stranger',
        'unexpected person'
      ] : [])
    ].join(', ');

    return {
      positivePrompt,
      negativePrompt,
      humanDirectives
    };
  }

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
