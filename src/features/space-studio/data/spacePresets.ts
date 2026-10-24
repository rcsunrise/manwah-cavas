// src/features/space-studio/data/spacePresets.ts
// MANWAH Space Studio｜6 大核心空间户型原型 (N-R01 ~ N-R06)
import { SpacePreset } from '../../../types/spaceStudio';

export const SPACE_PROTOTYPES: SpacePreset[] = [
  {
    id: 'space-nr01',
    code: 'N-R01',
    name: '通透横厅大平层 (Open Horizontal Flat)',
    propertyType: 'flat',
    layoutType: 'horizontal',
    ceilingHeight: 3.5,
    zones: [
      { id: 'living_zone', name: '客厅会客区', primaryAxis: 'x', coveragePercentage: 60 },
      { id: 'balcony_zone', name: '全景景观阳台区', primaryAxis: 'x', coveragePercentage: 20 },
      { id: 'transition_zone', name: '过道走廊过渡区', primaryAxis: 'y', coveragePercentage: 20 }
    ],
    signatureFeatures: [
      '超宽 8~10 米开间横向延展大横厅',
      '全景连续贯通式奢石与木饰面主背景墙',
      '全画幅无遮挡落地大窗',
      '大理石通铺地坪与宏大开阔视野'
    ],
    referenceObjectKeys: [],
    promptFragments: [
      'architectural luxury grand open horizontal penthouse salon with expansive 8-10 meters bay width',
      '3.5m high ceiling with seamless warm linear cove lighting and generous headroom',
      'continuous full-span bookmatched marble and natural wood architectural backdrop wall spanning the full horizontal width, strictly NO center dividing pillar',
      'full-span floor-to-ceiling glass wall revealing soft natural skyline daylight',
      'polished light greige porcelain stone flooring with deep room perspective'
    ]
  },
  {
    id: 'space-nr02',
    code: 'N-R02',
    name: '端厅双景都会平层 (Dual-Aspect Corner Flat)',
    propertyType: 'flat',
    layoutType: 'double_living',
    ceilingHeight: 3.6,
    zones: [
      { id: 'corner_living', name: '双面采光主客厅', primaryAxis: 'x', coveragePercentage: 55 },
      { id: 'dining_zone', name: '开放式奢石西厨餐区', primaryAxis: 'y', coveragePercentage: 30 },
      { id: 'foyer_zone', name: '独立艺术玄关', primaryAxis: 'y', coveragePercentage: 15 }
    ],
    signatureFeatures: [
      '270° 双向采光转角全景幕墙',
      '超宽大横厅大平层全开间视野',
      '温润木饰面与贯通奢石护墙板'
    ],
    referenceObjectKeys: [],
    promptFragments: [
      'corner high-rise luxury residence with 270-degree dual-aspect panorama and expansive 8-meter open salon width',
      'grand continuous architectural wall paneling combining bookmatched luxury stone and warm rift-cut oak',
      'capacious open living floor plane effortlessly hosting a complete multi-piece seating arrangement',
      'diffused volumetric morning sunlight pouring in through floor-to-ceiling glass'
    ]
  },
  {
    id: 'space-nr03',
    code: 'N-R03',
    name: '挑空复式庭院豪宅 (Double-Height Duplex Villa)',
    propertyType: 'duplex',
    layoutType: 'double_living',
    ceilingHeight: 6.2,
    zones: [
      { id: 'double_height_living', name: '6.2米双层挑空挑空客厅', primaryAxis: 'y', coveragePercentage: 65 },
      { id: 'courtyard_zone', name: '玻璃天井下沉庭院', primaryAxis: 'x', coveragePercentage: 25 },
      { id: 'stair_feature', name: '悬浮雕塑旋转楼梯', primaryAxis: 'y', coveragePercentage: 10 }
    ],
    signatureFeatures: [
      '6.2米挑高通天竖厅与大型艺术吊灯',
      '超宽 8~10 米开间与开阔庭院全景',
      '艺术旋转雕塑楼梯背景'
    ],
    referenceObjectKeys: [],
    promptFragments: [
      'majestic 6.2m double-height duplex architectural hall with expansive 8-10 meters panoramic bay width',
      'continuous full-span dramatic monumental limestone feature wall across the wide backdrop, strictly uninterrupted and pillar-free',
      'sculptural floating spiral staircase in subtle soft-focus side background',
      'soaring floor-to-ceiling glass wall looking out to expansive private courtyard greenery and sky'
    ]
  },
  {
    id: 'space-nr04',
    code: 'N-R04',
    name: '下沉式围合私享厅 (Sunken Conversation Villa)',
    propertyType: 'villa',
    layoutType: 'sunken',
    ceilingHeight: 3.8,
    zones: [
      { id: 'sunken_lounge', name: '下沉环抱式交流会客区', primaryAxis: 'x', coveragePercentage: 70 },
      { id: 'fireplace_zone', name: '真火壁炉背景立面', primaryAxis: 'y', coveragePercentage: 20 },
      { id: 'terrace_zone', name: '水景露台过渡区', primaryAxis: 'x', coveragePercentage: 10 }
    ],
    signatureFeatures: [
      '超宽 8~10 米开间大尺度奢阔下沉社交沙龙',
      '整面连续贯通天然石灰华与木饰面主背景',
      '全画幅落地景观窗与温润大地色微水泥羊毛地毯'
    ],
    referenceObjectKeys: [],
    promptFragments: [
      'expansive architect-designed luxury sunken conversation salon with generous 8-10 meters bay width and deep perspective',
      'continuous full-span honed travertine and rift-cut oak architectural feature wall spanning the entire horizontal backdrop, strictly uninterrupted and free of dividing pillars or narrow alcoves',
      'soaring full-height panoramic glass curtain wall bringing in abundant soft natural daylight',
      'plush custom seamless wool area rug grounding the expansive seating ensemble with ample spatial breathing room',
      'warm linear recessed architectural cove reveals'
    ]
  },
  {
    id: 'space-nr05',
    code: 'N-R05',
    name: '山水墅境独栋宽厅 (Landscape Villa Pavilion)',
    propertyType: 'villa',
    layoutType: 'horizontal',
    ceilingHeight: 4.0,
    zones: [
      { id: 'grand_salon', name: '宽幅全景社交大沙龙', primaryAxis: 'x', coveragePercentage: 60 },
      { id: 'tea_zen_zone', name: '禅意品茗雅叙区', primaryAxis: 'y', coveragePercentage: 25 },
      { id: 'garden_veranda', name: '无边水景连廊', primaryAxis: 'x', coveragePercentage: 15 }
    ],
    signatureFeatures: [
      '超宽 8~10 米无柱开间全景视野',
      '东方留白与西式现代家具融合',
      '室外松柏水镜微景观映衬'
    ],
    referenceObjectKeys: [],
    promptFragments: [
      'monumental luxury villa pavilion salon with expansive 8-10 meters column-free horizontal panorama',
      'continuous full-span architectural feature wall with clean minimalist dark bronze profiles and serene natural stone',
      'seamless boundary between expansive indoor living and tranquil water garden outside through uninterrupted floor-to-ceiling glass',
      'deep room perspective effortlessly hosting full luxury furniture ensemble'
    ]
  },
  {
    id: 'space-nr06',
    code: 'N-R06',
    name: '顶层天际会所大宅 (Skyline Penthouse Salon)',
    propertyType: 'penthouse',
    layoutType: 'double_living',
    ceilingHeight: 4.2,
    zones: [
      { id: 'sky_salon', name: '天际云端主会客厅', primaryAxis: 'x', coveragePercentage: 65 },
      { id: 'cigar_wine_zone', name: '雪茄红酒恒温品鉴区', primaryAxis: 'y', coveragePercentage: 20 },
      { id: 'observation_deck', name: '云端景观观景台', primaryAxis: 'x', coveragePercentage: 15 }
    ],
    signatureFeatures: [
      '4.2米净高顶层云端会客厅',
      '俯瞰都会天际线日落金辉',
      '暗调奢石与黄铜金属收边'
    ],
    referenceObjectKeys: [],
    promptFragments: [
      'high-altitude penthouse salon above the city clouds with grand 8-10 meters horizontal room span',
      '4.2m ceiling with grand architectural proportions and deep floor plane vista',
      'continuous full-span dark polished marble and brushed bronze architectural wall design across the background',
      'warm golden-hour afternoon light sweeping across the grand expansive interior',
      'exclusive dark polished marble and brushed bronze accents'
    ]
  }
];
