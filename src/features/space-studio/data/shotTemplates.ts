// src/features/space-studio/data/shotTemplates.ts
// MANWAH Space Studio｜影棚实拍商业对齐版 A01~A09 标准镜头模版库 V4.0
// 严格对齐 18 张实拍真值素材：7 个横构图（4:3） + 2 个竖构图（3:4）
import { ShotTemplate } from '../../../types/spaceStudio';

export const STANDARD_SHOT_TEMPLATES: ShotTemplate[] = [
  {
    id: 'tpl-a01',
    code: 'A01',
    name: '空间主大场景 (Grand Frontal Architectural Panorama)',
    alignmentSample: 'Studio Sample Ultra-Wide Architectural Grand Horizon / Living-Dining Flat',
    studioCategory: '正大视角·大平层建筑全景气场',
    workflowRole: '35mm 广角人文客餐一体全案',
    recommendedAspectRatio: '4:3',
    intent: {
      intentCode: 'SI-01',
      name: '空间主大场景 (Grand Frontal Horizon)',
      productDominancePct: 45,
      backgroundSuppression: 'low',
      maxOcclusionPct: 5,
      description: '客餐厅一体全案大平层生活方式；展示 3+1 沙发组、茶几、地毯与右侧餐厅的整体空间流动感。锚定居中背景墙、左侧通高落地窗、右侧开阔过道与餐厅区。'
    },
    defaultCamera: {
      lensMm: 35,
      heightCm: 115,
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      target: { type: 'zone', id: 'living_room' },
      framing: 'wide',
      mustInclude: [
        'strictly_straight_on_frontal_view',
        'centered_marble_backdrop_wall_axis',
        'panoramic_full_height_left_window',
        'open_right_corridor_and_dining_flow',
        'complete_3_plus_1_sofa_ensemble',
        'designer_coffee_table',
        'generous_living_area_rug',
        'white_matte_cylindrical_planter_anchor'
      ],
      mustExclude: [
        'angled_side_perspective',
        'diagonal_camera_view',
        'tilted_off_center',
        'excessive_ceiling_void',
        'deployed_footrests_when_no_human',
        'flipped_room',
        'mirrored_window'
      ]
    },
    description: '焦段 35mm 广角人文镜头，机位高度 115cm 人眼站姿微低平视中轴线（Yaw: 0°/Pitch: 0°），严苛横平竖直两点透视，4:3 横构图，展现客餐厅一体全案大平层生活方式，居中背景墙、左侧通高落地窗、右侧开阔过道与餐厅区。'
  },
  {
    id: 'tpl-a02',
    code: 'A02',
    name: '45° 3+1 组合大全景 (45° 3+1 Living Ensemble View)',
    alignmentSample: '1021.jpg / 45° 3+1 Ensemble',
    studioCategory: '45° 3+1 沙发组群生活方式',
    workflowRole: '45mm 45° 侧前方成套组群位',
    recommendedAspectRatio: '4:3',
    intent: {
      intentCode: 'SI-02',
      name: '45° 3+1 组合全景聚焦 (3+1 Ensemble Living Focus)',
      productDominancePct: 65,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 8,
      description: '展示“3人位+单人位”围合布局与开阔度；呈现左侧自然采光下皮质的光泽度与落座动线。锚定地板对角线灭点、地毯铺设基准区、窗帘垂坠边界。'
    },
    defaultCamera: {
      lensMm: 45,
      heightCm: 115,
      yawDeg: 40,
      pitchDeg: -3,
      rollDeg: 0,
      target: { type: 'product', id: 'living_ensemble' },
      framing: 'wide',
      mustInclude: [
        'three_seater_sofa',
        'matching_side_chair',
        'center_coffee_table',
        'ensemble_spatial_depth',
        'left_side_daylight_sheen',
        'floor_diagonal_vanishing_lines',
        'white_matte_cylindrical_planter_anchor'
      ],
      mustExclude: [
        'flat_frontal_mugshot',
        'straight_on_camera',
        'symmetrical_center_sofa',
        'facing_directly_forward',
        'tight_single_product_crop',
        'cropping_out_side_chair',
        'cropping_out_main_sofa'
      ]
    },
    description: '焦段 45mm 标准偏广镜头，机位高度 115cm，侧前方 40° 斜侧透视，4:3 横构图，展现 3人位主沙发+搭配单椅与中岛茶几成套围合布局与开阔动线。'
  },
  {
    id: 'tpl-a03',
    code: 'A03',
    name: '三人位主沙发场景 (Hero 3-Seater Living Focus)',
    alignmentSample: 'Hero 3-Seater Recline / Focus',
    studioCategory: '主位 3 人座核心聚焦',
    workflowRole: '50mm 中景主沙发核心位',
    recommendedAspectRatio: '4:3',
    intent: {
      intentCode: 'SI-03',
      name: '三人位主沙发场景 (Hero 3-Seater Focus)',
      productDominancePct: 75,
      backgroundSuppression: 'high',
      maxOcclusionPct: 5,
      description: '主推核心单品（C位三人位）；展示靠背饱满支撑感、双向扶手体量与背景墙的对称高级感。锚定大理石背景墙中轴对称线、双弧形壁灯高度中线。'
    },
    defaultCamera: {
      lensMm: 50,
      heightCm: 95,
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      target: { type: 'product', id: 'primary_sofa' },
      framing: 'product',
      mustInclude: [
        'three_seater_sofa',
        'symmetrical_marble_backdrop_axis',
        'dual_curved_sconce_midline',
        'sofa_leather_texture',
        'foreground_coffee_table'
      ],
      mustExclude: [
        'separate_accent_single_chair',
        'side_armchair',
        'lounge_chair',
        'angled_view',
        'deployed_footrests_when_no_human'
      ]
    },
    description: '焦段 50mm 标准视平，机位高度 95cm（与靠背齐平略低，仰角 0°），纯 0° 正视对称中轴，4:3 横构图，展现 C位三人位主沙发的挺拔体量感与对称高级感，严格排除侧边单椅。'
  },
  {
    id: 'tpl-a04',
    code: 'A04',
    name: '三分之二主沙亲子陪伴场景 (2/3 Hero Sofa Companion View)',
    alignmentSample: 'Studio Sample 2/3 Hero Sofa Angle / Parent-Child Companion',
    studioCategory: '主沙发 2/3 亲子温情生活方式',
    workflowRole: '45mm 微俯亲子生活舞台',
    recommendedAspectRatio: '3:4',
    intent: {
      intentCode: 'SI-08',
      name: '三分之二主沙亲子陪伴 (2/3 Hero Companion View)',
      productDominancePct: 70,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 15,
      description: '情感化/家庭生活方式：聚焦 2/3 座面与前沿地毯，突出宽大座深供亲子互动、地毯玩耍的温馨感。锚定地板光影渐变区、左侧落地窗白色纱帘透光处、白色圆柱盆绿植。'
    },
    defaultCamera: {
      lensMm: 45,
      heightCm: 140,
      yawDeg: -28,
      pitchDeg: -15,
      rollDeg: 0,
      target: { type: 'product', id: 'primary_sofa' },
      framing: 'lifestyle',
      mustInclude: [
        'two_thirds_hero_sofa',
        'wide_seating_depth',
        'foreground_play_rug_stage',
        'sheer_curtain_window_light',
        'white_matte_cylindrical_planter_anchor'
      ],
      mustExclude: [
        'separate_accent_single_chair',
        'isolated_armchair',
        'flat_frontal_view',
        'flipped_room'
      ]
    },
    description: '焦段 45mm 微俯视镜头，机位高度 140cm，俯角 -15°，侧偏 -28°，纵向 3:4 画幅，聚焦 2/3 主沙发座面与前沿地毯生活舞台。'
  },
  {
    id: 'tpl-a05',
    code: 'A05',
    name: '三分之二主沙私享休闲景 (2/3 Hero Sofa Private Lounge View)',
    alignmentSample: 'Studio Sample 2/3 Hero Sofa Angle / Wine Lounge Relaxation',
    studioCategory: '主沙发 2/3 角度品质与工艺细节',
    workflowRole: '50mm 平视略低高定细节位',
    recommendedAspectRatio: '3:4',
    intent: {
      intentCode: 'SI-05',
      name: '三分之二主沙私享休闲 (2/3 Hero Private Lounge)',
      productDominancePct: 70,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 15,
      description: '品质感/工艺细节：聚焦扶手立体菱格纹压花、金属收边、皮质微距触感与后方温暖壁灯。锚定背景墙右侧铜条收口线、悬浮发光层板下边缘。'
    },
    defaultCamera: {
      lensMm: 50,
      heightCm: 95,
      yawDeg: 28,
      pitchDeg: 0,
      rollDeg: 0,
      target: { type: 'product', id: 'primary_sofa' },
      framing: 'lifestyle',
      mustInclude: [
        'two_thirds_hero_sofa_right',
        'right_armrest_quilting',
        'metal_trim_accent',
        'brass_closure_strip_anchor',
        'warm_ambient_wall_sconce'
      ],
      mustExclude: [
        'separate_accent_single_chair',
        'isolated_armchair',
        'arched_shelves',
        'bookshelf',
        'bookcase'
      ]
    },
    description: '焦段 50mm 标准中焦，机位高度 95cm 平视略低（仰角 0°），右侧偏 28°，纵向 3:4 画幅，聚焦扶手高定菱格压花、金属收边与微距皮革质感。'
  },
  {
    id: 'tpl-a06',
    code: 'A06',
    name: '零靠墙功能闭合侧景 (Zero-Wall Clearance Profile View)',
    alignmentSample: 'Studio Sample Zero-Wall Profile / Lateral View',
    studioCategory: '零靠墙技术与侧影展示',
    workflowRole: '60mm 纯侧视硬核功能位',
    recommendedAspectRatio: '4:3',
    intent: {
      intentCode: 'SI-07',
      name: '零靠墙功能闭合侧景 (Zero-Wall Clearance Profile)',
      productDominancePct: 75,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 15,
      description: '核心硬核卖点：直观量化“零靠墙”省空间功能；展现沙发背部贴墙极小距离（<5cm）与侧面紧凑线条。锚定背景墙侧面厚度基准、窗框竖柱与地平线垂直线。'
    },
    defaultCamera: {
      lensMm: 60,
      heightCm: 90,
      yawDeg: 88,
      pitchDeg: 0,
      rollDeg: 0,
      target: { type: 'product', id: 'primary_sofa' },
      framing: 'lifestyle',
      mustInclude: [
        'zero_wall_back_clearance_against_wall',
        'flush_wall_placement',
        'pure_lateral_profile_60mm',
        'side_armrest_quilting_detail',
        'fully_retracted_closed_footrest',
        'vertical_plumb_lines'
      ],
      mustExclude: [
        'gap_away_from_wall',
        'detached_from_back_wall',
        'deployed_footrest',
        'wide_angle_distortion',
        'bookshelf',
        'bookcase'
      ]
    },
    description: '焦段 60mm 纯侧视长焦镜头，机位高度 90cm，大侧偏 88°（85°~90°纯侧切），横向 4:3 画幅，严苛两点透视垂直线锁定，量化主沙发贴墙零间隙（<5cm）与紧凑侧面线条。'
  },
  {
    id: 'tpl-a07',
    code: 'A07',
    name: '沙发茶几组群中景 (Ensemble Living Composition)',
    alignmentSample: 'Studio Sample 0939/0914 / Ensemble Living',
    studioCategory: '客厅核心起居生活方式',
    workflowRole: '55mm 中焦经典起居中景',
    recommendedAspectRatio: '4:3',
    intent: {
      intentCode: 'SI-01',
      name: '沙发茶几组群中景 (Ensemble Living)',
      productDominancePct: 75,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 12,
      description: '配套材质与围合感：展示大理石茶几、深色方几、绿植与主沙发的黄金高低差（450mm vs 400mm）。锚定地毯中央几何图案定位区、绿植阴影投射区。'
    },
    defaultCamera: {
      lensMm: 55,
      heightCm: 95,
      yawDeg: -35,
      pitchDeg: -5,
      rollDeg: 0,
      target: { type: 'product', id: 'living_ensemble' },
      framing: 'product',
      mustInclude: [
        'hero_main_sofa',
        'natural_marble_coffee_table',
        'golden_height_drop_450mm_vs_400mm',
        'carpet_geometric_pattern_anchor',
        'foliage_shadow_falloff_anchor',
        'deep_contact_ao_shadow'
      ],
      mustExclude: [
        'wide_empty_edges',
        'flat_frontal_mugshot',
        'floating_furniture',
        'sticker_marble_foil'
      ]
    },
    description: '焦段 55mm 中焦镜头，机位高度 95cm，侧偏 -35°，微俯 -5°，横向 4:3 画幅，压缩景深强化奢石中岛双茶几与主沙发的亲密呼应与黄金高低落差。'
  },
  {
    id: 'tpl-a08',
    code: 'A08',
    name: '单椅五档功能状态景 (Recliner 5-Mode Function Showcase)',
    alignmentSample: 'Studio Sample Recliner 5 Postures / Multi-Mode Life',
    studioCategory: '单椅五档功能状态景',
    workflowRole: '50mm 黄金对角单椅私享景',
    recommendedAspectRatio: '4:3',
    intent: {
      intentCode: 'SI-06',
      name: '单椅五档功能状态景 (Recliner 5-Mode Showcase)',
      productDominancePct: 80,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 15,
      description: '单人位核心功能体验：五档调节、电动脚踏展开、后仰舒适弧度；搭配雪茄盒/红酒杯营造个人私享角。锚定大落地窗明暗分界线、左下角地毯边缘留白区。'
    },
    defaultCamera: {
      lensMm: 50,
      heightCm: 95,
      yawDeg: 38,
      pitchDeg: -3,
      rollDeg: 0,
      target: { type: 'product', id: 'recliner' },
      framing: 'lifestyle',
      mustInclude: [
        'manwah_power_recliner_chair',
        'golden_diagonal_perspective_50mm',
        'open_spacious_living_room_placement',
        'window_daylight_shadow_boundary',
        'deep_contact_ao_shadow'
      ],
      mustExclude: [
        'three_seater_sofa_centered',
        'hallway',
        'corridor',
        'doorway',
        'door_frame'
      ]
    },
    description: '焦段 50mm 黄金对角镜头，机位高度 95cm，侧斜 38°，横向 4:3 画幅，单椅独立置于空旷开阔的客厅中央地毯区，展示单人位多功能舒适角度与私享角质感。'
  },
  {
    id: 'tpl-a09',
    code: 'A09',
    name: '餐厅配套展示组 (Dining Suite Ensemble View)',
    alignmentSample: 'Studio Sample Dining Suite / Luxury Dining Flat',
    studioCategory: '餐厅配套展示组',
    workflowRole: '40mm 平视全景整家配套',
    recommendedAspectRatio: '4:3',
    intent: {
      intentCode: 'SI-09',
      name: '餐厅配套展示组 (Dining Suite Ensemble)',
      productDominancePct: 75,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 10,
      description: '整家配套延伸：展现同色系大理石餐桌、皮革餐椅、餐边柜与酒水推车，强化“买全屋配齐”的客单拉力。锚定右侧背景墙壁板、独立艺术挂画中轴线。'
    },
    defaultCamera: {
      lensMm: 40,
      heightCm: 115,
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      target: { type: 'product', id: 'dining_suite' },
      framing: 'wide',
      mustInclude: [
        'luxury_marble_dining_table',
        'matching_leather_dining_chairs',
        'dining_credenza_sideboard',
        'champagne_bar_cart',
        'right_wall_panel_anchor',
        'art_painting_axis_anchor'
      ],
      mustExclude: [
        'three_seater_sofa_in_center',
        'messy_kitchen_sink',
        'cramped_space',
        'crooked_verticals'
      ]
    },
    description: '焦段 40mm 平视全景镜头，机位高度 115cm，0° 正视对称轴线，横向 4:3 画幅，完整呈现同色系天然奢石长餐桌、皮革餐椅、定制餐边柜与移动酒水餐车。'
  }
];

/**
 * 依据镜头编号获取标准模版
 */
export function getShotTemplateByCode(code: string): ShotTemplate | undefined {
  return STANDARD_SHOT_TEMPLATES.find((t) => t.code.toUpperCase() === code.toUpperCase());
}
