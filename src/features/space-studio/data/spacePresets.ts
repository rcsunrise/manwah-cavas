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
    ceilingHeight: 3.2,
    zones: [
      { id: 'living_zone', name: '客厅会客区', primaryAxis: 'x', coveragePercentage: 60 },
      { id: 'balcony_zone', name: '全景景观阳台区', primaryAxis: 'x', coveragePercentage: 20 },
      { id: 'transition_zone', name: '过道走廊过渡区', primaryAxis: 'y', coveragePercentage: 20 }
    ],
    signatureFeatures: [
      '开敞横向延展大横厅',
      '全画幅无遮挡落地窗',
      '极简无主灯悬浮吊顶',
      '大理石通铺地坪'
    ],
    referenceObjectKeys: [],
    promptFragments: [
      'architectural luxury open horizontal penthouse flat',
      '3.2m high ceiling with seamless warm linear cove lighting',
      'full-span floor-to-ceiling glass wall revealing skyline daylight',
      'polished light greige porcelain stone flooring'
    ]
  },
  {
    id: 'space-nr02',
    code: 'N-R02',
    name: '端厅双景都会平层 (Dual-Aspect Corner Flat)',
    propertyType: 'flat',
    layoutType: 'double_living',
    ceilingHeight: 3.4,
    zones: [
      { id: 'corner_living', name: '双面采光主客厅', primaryAxis: 'x', coveragePercentage: 55 },
      { id: 'dining_zone', name: '开放式奢石西厨餐区', primaryAxis: 'y', coveragePercentage: 30 },
      { id: 'foyer_zone', name: '独立艺术玄关', primaryAxis: 'y', coveragePercentage: 15 }
    ],
    signatureFeatures: [
      '270° 双向采光转角全景幕墙',
      '奢石岛台餐客一体化',
      '温润木饰面护墙板'
    ],
    referenceObjectKeys: [],
    promptFragments: [
      'corner high-rise residence with 270-degree dual-aspect panorama',
      'integrated open living and marble island dining area',
      'natural rift-cut white oak architectural wall paneling',
      'diffused volumetric morning sunlight pouring in'
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
      '室内绿意天井景观',
      '艺术旋转雕塑楼梯背景'
    ],
    referenceObjectKeys: [],
    promptFragments: [
      'majestic 6.2m double-height duplex architectural hall',
      'dramatic monumental limestone feature wall',
      'sculptural floating spiral staircase in subtle soft-focus background',
      'tall floor-to-ceiling glass looking out to private courtyard foliage'
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
      '下沉 45cm 环抱温馨社交沙龙区',
      '整面天然石灰华真火壁炉',
      '温润大地色微水泥与羊毛地毯'
    ],
    referenceObjectKeys: [],
    promptFragments: [
      'intimate architect-designed sunken conversation living pit',
      'honed travertine linear fireplace focal wall with soft ambient flame',
      'plush custom wool area rug framing the seating sanctuary',
      'warm recessed warm architectural lighting'
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
      '超宽无柱开间全景视野',
      '东方留白与西式现代家具融合',
      '室外松柏水镜微景观映衬'
    ],
    referenceObjectKeys: [],
    promptFragments: [
      'expansive luxury villa pavilion salon with column-free panorama',
      'seamless boundary between indoor living and tranquil water garden outside',
      'clean minimalist dark bronze metal profiles and serene limestone floors'
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
      'high-altitude penthouse salon above the city clouds',
      '4.2m ceiling with grand architectural proportions',
      'warm golden-hour afternoon light sweeping across the interior',
      'exclusive dark polished marble and brushed bronze accents'
    ]
  }
];
