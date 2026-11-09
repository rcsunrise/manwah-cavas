// 业主身份库：画面先回答“谁住在这里”，窗景、空间规划和硬装取向都由业主决定
export type OutdoorViewId =
  | 'city_skyline'
  | 'river_cbd'
  | 'park_canopy'
  | 'private_garden'
  | 'lake_landscape'
  | 'historic_street'
  | 'ocean'
  | 'mountain';

export type SpaceElevation = 'high' | 'low';

export interface OutdoorView {
  id: OutdoorViewId;
  label: string;
  elevations: SpaceElevation[];
  directive: string;
}

export interface OwnerPersona {
  id: string;
  name: string;
  summary: string;
  location: string;
  /** 这类业主明确偏向的楼层；不写表示高低都合理 */
  preferredElevation?: SpaceElevation;
  views: OutdoorViewId[];
  identityDirective: string;
  livingPlanDirective: string;
  finishDirective: string;
  lifeTracesDirective: string;
  styleCodes: string[];
  styleKeywords: RegExp;
}

export const OUTDOOR_VIEWS: OutdoorView[] = [
  {
    id: 'city_skyline',
    label: '高层城市天际线',
    elevations: ['high'],
    directive: 'a high-floor view across a believable modern Chinese city skyline in soft natural daytime haze, buildings at realistic distance and scale'
  },
  {
    id: 'river_cbd',
    label: '城市核心江景',
    elevations: ['high'],
    directive: 'a high-floor view over a wide urban river with the CBD on the far bank, bridges and riverside greenery in clear natural daylight'
  },
  {
    id: 'park_canopy',
    label: '俯瞰城市公园',
    elevations: ['high'],
    directive: 'a mid-to-high-floor view looking down over the green tree canopy of a large city park, with low neighbourhoods beyond'
  },
  {
    id: 'private_garden',
    label: '私家庭院',
    elevations: ['low'],
    directive: 'a ground-level view into a mature private garden with lawn, layered trees and a low boundary wall, in soft natural daylight'
  },
  {
    id: 'lake_landscape',
    label: '湖景园林',
    elevations: ['low', 'high'],
    directive: 'a calm lake with planted shoreline and distant low hills, in gentle natural daylight'
  },
  {
    id: 'historic_street',
    label: '老城历史街区',
    elevations: ['low'],
    directive: 'a low-floor view of a quiet historic city street with mature plane trees and old brick or stucco facades across the road'
  },
  {
    id: 'ocean',
    label: '海景',
    elevations: ['low', 'high'],
    directive: 'an open sea horizon with a natural coastline and clear coastal daylight'
  },
  {
    id: 'mountain',
    label: '山景',
    elevations: ['low', 'high'],
    directive: 'layered forested mountains at a natural distance with soft atmospheric depth and daylight'
  }
];

export const OWNER_PERSONAS: OwnerPersona[] = [
  {
    id: 'entrepreneur_family',
    name: '企业家家庭',
    summary: '事业稳定的一代创业者，家也是接待重要客人的地方',
    location: '一线城市核心区的江景或 CBD 高层大宅',
    views: ['river_cbd', 'city_skyline', 'private_garden'],
    identityDirective: 'a successful first-generation entrepreneur and his family, who regularly receive important guests at home',
    livingPlanDirective: 'a generous hosting living room connected to a formal dining area, clear guest circulation, with private family areas kept out of sight',
    finishDirective: 'composed, substantial natural materials in large calm surfaces; quality shown through material and craftsmanship rather than decoration',
    lifeTracesDirective: 'a few business and history books, a quality tea or wine set on the console, restrained framed family photographs',
    styleCodes: ['IT-01', 'LX-02', 'ST-02', 'OR-02', 'NC-01', 'US-01'],
    styleKeywords: /沉稳|大宅|静奢|商务|heritage|quiet luxury/i
  },
  {
    id: 'finance_tech',
    name: '金融 / 科技新贵',
    summary: '年轻高收入，审美当代，家里人少、动线开放',
    location: '金融区或科技新区的超高层公寓',
    preferredElevation: 'high',
    views: ['city_skyline', 'river_cbd'],
    identityDirective: 'a young finance or technology professional living in a contemporary high-rise home',
    livingPlanDirective: 'an open, lightly divided plan where living, dining and study flow together, with concealed storage and integrated technology',
    finishDirective: 'minimal, precise detailing with few materials; one contemporary artwork acts as the point of focus',
    lifeTracesDirective: 'design monographs, a quality audio speaker, one contemporary sculpture or print on the shelves',
    styleCodes: ['LX-01', 'ST-09', 'LX-02', 'IT-01', 'ST-01', 'ST-02'],
    styleKeywords: /极简|都会|当代|包豪斯|minimal|contemporary/i
  },
  {
    id: 'professional_family',
    name: '专业人士二孩家庭',
    summary: '医生、律师等专业人士，改善型住房，孩子是生活中心',
    location: '公园或优质学区旁的中高层住宅',
    views: ['park_canopy', 'river_cbd', 'private_garden'],
    identityDirective: 'a dual-professional couple such as a doctor and a lawyer raising two school-age children',
    livingPlanDirective: 'a family living room with a full book wall, generous closed storage and an easy route between living, dining and study',
    finishDirective: 'warm, durable and easy-to-live-with surfaces; rounded practical details, nothing fragile or precious',
    lifeTracesDirective: 'many well-used books on the shelves, children’s books and a board game on a lower shelf, family photographs',
    styleCodes: ['CA-01', 'US-01', 'LX-02', 'FR-01', 'OR-03'],
    styleKeywords: /温润|家庭|亲子|自然|warm|family/i
  },
  {
    id: 'three_generation',
    name: '三代同堂改善',
    summary: '长辈同住，看重舒适、安全和家庭团聚',
    location: '低层或别墅，临庭院或湖景',
    preferredElevation: 'low',
    views: ['private_garden', 'lake_landscape', 'park_canopy'],
    identityDirective: 'a three-generation Chinese family with grandparents living at home',
    livingPlanDirective: 'a level, step-free living area with wide circulation, an adjoining tea corner and comfortable seating for family gatherings',
    finishDirective: 'quiet Chinese sensibility in warm wood and matte stone; comfortable and dignified, without slippery high-gloss floors',
    lifeTracesDirective: 'a tea set and a potted orchid on the console, calligraphy or an ink painting, framed multi-generation family photographs',
    styleCodes: ['OR-04', 'ST-03', 'OR-03', 'OR-02', 'US-02'],
    styleKeywords: /东方|新中式|禅|中式|oriental|chinese/i
  },
  {
    id: 'collector_designer',
    name: '收藏家 / 设计师',
    summary: '有明确个人审美，家是收藏和创作的延伸',
    location: '老城历史街区或带小院的住宅',
    preferredElevation: 'low',
    views: ['historic_street', 'private_garden'],
    identityDirective: 'an art collector or designer whose home is an extension of a personal collection',
    livingPlanDirective: 'display walls with proper art lighting, a study connected to the living room, an informal and deliberately asymmetrical arrangement',
    finishDirective: 'characterful materials with visible age such as limewash, aged timber and honed stone; deliberately not uniform',
    lifeTracesDirective: 'stacked art books, ceramics and small sculptures of different periods, artwork leaning on a shelf',
    styleCodes: ['ST-01', 'UK-01', 'FR-01', 'OR-02', 'NC-01', 'ST-09'],
    styleKeywords: /收藏|艺术|collector|gallery|art/i
  },
  {
    id: 'vacation_home',
    name: '度假第二居所',
    summary: '假期使用，放松和亲近自然最重要',
    location: '海边或山中的度假住宅',
    views: ['ocean', 'mountain', 'lake_landscape'],
    identityDirective: 'a family using this as a relaxed holiday home close to nature',
    livingPlanDirective: 'living space opening directly to a terrace, a casual layout that blurs indoors and outdoors',
    finishDirective: 'natural, lightly finished timber, linen and textured plaster; relaxed and unpretentious',
    lifeTracesDirective: 'a few holiday books, woven baskets, natural objects collected on walks',
    styleCodes: ['MD-01', 'CA-01', 'ST-03', 'LX-02'],
    styleKeywords: /海|度假|地中海|加州|自然|coastal|mediterranean|resort/i
  }
];

export const getOwnerPersona = (id?: string | null): OwnerPersona | null =>
  OWNER_PERSONAS.find((persona) => persona.id === id) || null;

export const getOutdoorView = (id?: string | null): OutdoorView | undefined =>
  OUTDOOR_VIEWS.find((view) => view.id === id);
