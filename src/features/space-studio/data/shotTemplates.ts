// src/features/space-studio/data/shotTemplates.ts
// MANWAH Space Studio｜影棚实拍商业对齐版 A01~A08 标准镜头模版库 V3.0
import { ShotTemplate } from '../../../types/spaceStudio';

export const STANDARD_SHOT_TEMPLATES: ShotTemplate[] = [
  {
    id: 'tpl-a01',
    code: 'A01',
    name: '空间主大全景 (Grand Frontal Architectural Panorama)',
    alignmentSample: 'Studio Sample Ultra-Wide Architectural Grand Horizon / Living-Dining Flat',
    studioCategory: '正大视角·大平层建筑全景气场',
    workflowRole: '24mm 正大开阔全景两点透视全案',
    recommendedAspectRatio: '16:9',
    intent: {
      intentCode: 'SI-01',
      name: '空间与产品平衡 (Space/Product Balance)',
      productDominancePct: 40,
      backgroundSuppression: 'low',
      maxOcclusionPct: 5,
      description: '大平层客餐通透一体化大开间全貌 + 超广阔通透视野 + 全套客厅主沙发、单椅、茶几与远端配套餐厅全案入镜，交代大宅空间全局与开敞尺度'
    },
    defaultCamera: {
      lensMm: 24,
      heightCm: 118,
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      target: { type: 'zone', id: 'living_room' },
      framing: 'wide',
      mustInclude: [
        'breathtakingly_expansive_open_plan_grand_horizon',
        'strictly_straight_on_frontal_view',
        'centered_living_axis',
        'panoramic_floor_to_ceiling_window_wall',
        'soaring_cove_ceiling_architecture',
        'generous_area_rug_anchoring_foreground',
        'retracted_closed_showroom_footrests',
        'complete_furniture_suite'
      ],
      mustExclude: [
        'angled_side_perspective',
        'diagonal_camera_view',
        'tilted_off_center',
        'cramped_framing',
        'awkward_empty_corners',
        'excessive_empty_wooden_floor_in_foreground',
        'vast_barren_foreground_floor_void',
        'deployed_footrest_without_people',
        'blank_featureless_white_ceiling'
      ]
    },
    description: '焦段 24mm 超广角建筑镜头，机位高度 118cm 人眼平视中轴线（Yaw: 0°/Pitch: 0°），严苛横平竖直两点透视，极度开阔的大平层横厅大开间气场。艺术地毯向前舒展消除空旷地面，通透通顶落地窗与高级建筑暗藏灯槽天花一体延展，家具居中庄重恢弘，全套脚踏平整收起。'
  },
  {
    id: 'tpl-a02',
    code: 'A02',
    name: '45° 3+1 成套组合全景 (45° 3+1 Living Ensemble View)',
    alignmentSample: '1021.jpg / 45° 3+1 Ensemble',
    studioCategory: '45° 3+1 沙发组群生活方式',
    workflowRole: '38mm 45° 侧前方成套组群位',
    recommendedAspectRatio: '4:3',
    intent: {
      intentCode: 'SI-02',
      name: '45° 组群成套聚焦 (3+1 Ensemble Living Focus)',
      productDominancePct: 65,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 8,
      description: '35°~45° 侧前方大透视，同框展现 3 人位主沙发 + 单人椅 + 中岛茶几成套围合生活方式景，体现家庭组群空间的进深感与高级感'
    },
    defaultCamera: {
      lensMm: 38,
      heightCm: 115,
      yawDeg: 40,
      pitchDeg: -3,
      rollDeg: 0,
      target: { type: 'product', id: 'living_ensemble' },
      framing: 'wide',
      mustInclude: ['three_seater_sofa', 'matching_side_chair', 'center_coffee_table', 'ensemble_spatial_depth', 'stone_backdrop'],
      mustExclude: ['flat_frontal_mugshot', 'tight_single_product_crop', 'cropping_out_side_chair', 'cropping_out_main_sofa']
    },
    description: '焦段 38mm 组群视角，机位高度 115cm，侧前方 40°~45° 透视，同框展现 3人位主沙发、搭配单椅与中岛茶几成套围合氛围'
  },
  {
    id: 'tpl-a03',
    code: 'A03',
    name: '3人位主沙发组合焦点景 (Hero 3-Seater Living Focus)',
    alignmentSample: 'Hero 3-Seater Recline / Focus',
    studioCategory: '主位 3 人座功能聚焦/核心起居',
    workflowRole: '50mm 中景主沙发核心位',
    recommendedAspectRatio: '4:3',
    intent: {
      intentCode: 'SI-03',
      name: '主沙发核心聚焦 (Hero 3-Seater Focus)',
      productDominancePct: 75,
      backgroundSuppression: 'high',
      maxOcclusionPct: 5,
      description: '50mm 中景聚焦 3人位主沙发与茶几前景，自然裁切排除侧边独立单椅，无模特时功能位保持平整收起，展现核心沙发尊享质感'
    },
    defaultCamera: {
      lensMm: 50,
      heightCm: 110,
      yawDeg: 12,
      pitchDeg: -2,
      rollDeg: 0,
      target: { type: 'product', id: 'primary_sofa' },
      framing: 'product',
      mustInclude: ['three_seater_sofa', 'sofa_leather_texture', 'foreground_coffee_table'],
      mustExclude: ['separate_accent_single_chair', 'side_armchair', 'lounge_chair', 'deployed_footrests_when_no_human', 'wide_empty_room_panorama']
    },
    description: '焦段 50mm 标准中焦，高度 110cm，微侧 12° 视点，精细聚焦 3人位主沙发与茶几前景，严格排除单椅，无模特时脚托完全收起'
  },
  {
    id: 'tpl-a04',
    code: 'A04',
    name: '2/3主沙发亲子陪伴景 (2/3 Hero Sofa Companion View)',
    alignmentSample: 'Studio Sample 2/3 Hero Sofa Angle / Parent-Child Companion',
    studioCategory: '主沙发 2/3 角度亲子温情生活方式',
    workflowRole: '45mm 2/3 主沙发侧前角度',
    recommendedAspectRatio: '2:3',
    intent: {
      intentCode: 'SI-08',
      name: '主沙发 2/3 温情共鸣 (2/3 Hero Companion Resonance)',
      productDominancePct: 70,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 15,
      description: '呈现主沙发 2/3 产品形态与侧前角度（展示左侧外扶手、功能位与中间位），母女依偎放松/自拍温情互动，传递头等舱舒适包裹与家庭温度'
    },
    defaultCamera: {
      lensMm: 45,
      heightCm: 110,
      yawDeg: -28,
      pitchDeg: -3,
      rollDeg: 0,
      target: { type: 'product', id: 'primary_sofa' },
      framing: 'lifestyle',
      mustInclude: ['two_thirds_hero_sofa', 'outer_armrest_contour', 'deployed_footrest_with_occupants', 'luxury_architectural_backdrop', 'indoor_foliage_plant'],
      mustExclude: ['separate_accent_single_chair', 'isolated_armchair', 'full_sofa_100_percent_wide', 'flat_frontal_view', 'rigid_stiff_models']
    },
    description: '焦段 45mm 人文中焦，机位高度 110cm，侧前方 28° 透视，精细呈现主沙发 2/3 产品角度与侧翼线条，有模特时外侧功能位舒展依偎，无模特时脚托完全收起'
  },
  {
    id: 'tpl-a05',
    code: 'A05',
    name: '2/3主沙发私享休闲景 (2/3 Hero Sofa Private Lounge View)',
    alignmentSample: 'Studio Sample 2/3 Hero Sofa Angle / Wine Lounge Relaxation',
    studioCategory: '主沙发 2/3 角度私享微醺生活方式',
    workflowRole: '45mm 2/3 主沙发右侧前角度',
    recommendedAspectRatio: '2:3',
    intent: {
      intentCode: 'SI-05',
      name: '主沙发 2/3 私享休闲 (2/3 Hero Private Lounge)',
      productDominancePct: 70,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 15,
      description: '呈现主沙发 2/3 产品形态与右侧前角度（展示右侧绗缝扶手、展开功能位与中间位），优雅女主手持红酒杯倚靠放松，传递头等舱私享惬意'
    },
    defaultCamera: {
      lensMm: 45,
      heightCm: 110,
      yawDeg: 28,
      pitchDeg: -3,
      rollDeg: 0,
      target: { type: 'product', id: 'primary_sofa' },
      framing: 'lifestyle',
      mustInclude: ['two_thirds_hero_sofa_right', 'right_armrest_quilting', 'deployed_footrest_with_occupants', 'luxury_architectural_backdrop', 'wall_shelves_ambient_light'],
      mustExclude: ['separate_accent_single_chair', 'isolated_armchair', 'full_sofa_100_percent_wide', 'flat_frontal_view', 'rigid_stiff_models']
    },
    description: '焦段 45mm 人文中焦，机位高度 110cm，右侧前方 28° 透视，呈现主沙发 2/3 产品角度与侧翼线条，有模特时女主持红酒杯惬意倚靠，无模特时脚托完全收起'
  },
  {
    id: 'tpl-a06',
    code: 'A06',
    name: '零靠墙功能展开景 (Zero-Wall Motion Profile View)',
    alignmentSample: 'Studio Sample Zero-Wall Motion Profile / Lateral Lounge',
    studioCategory: '零靠墙核心技术与展开侧影展示 (靠墙展示)',
    workflowRole: '35mm 零靠墙侧向展开透视',
    recommendedAspectRatio: '16:9',
    intent: {
      intentCode: 'SI-07',
      name: '零靠墙技术展示 (Zero-Wall Clearance Profile)',
      productDominancePct: 75,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 15,
      description: '大侧向 80°~90° 侧平视低机位（参考图示4），精准展现客厅中“靠墙摆放”的 3人位主沙发——展示芝华仕核心“零靠墙”前滑机械技术：靠背完全下倾而贴墙零间隙（<5cm），底座向前平滑伸展，展示扶手侧面菱格绗缝高定工艺、圆形金属控制键与舒展展开流线'
    },
    defaultCamera: {
      lensMm: 35,
      heightCm: 90,
      yawDeg: 80,
      pitchDeg: -1,
      rollDeg: 0,
      target: { type: 'product', id: 'primary_sofa' },
      framing: 'lifestyle',
      mustInclude: ['zero_wall_back_clearance_against_wall', 'flush_wall_mounting', 'side_armrest_quilting_detail', 'circular_motion_button', 'fully_deployed_footrest', 'panoramic_window_backdrop'],
      mustExclude: ['gap_away_from_wall', 'detached_from_back_wall', 'flat_frontal_view', 'crooked_perspective', 'rigid_stiff_models']
    },
    description: '焦段 35mm，低视点机位高度 90cm（参考图示4坐姿眼平），侧向 80° 透视，直观呈现主沙发贴墙零距离前滑展开的零靠墙黑科技，侧面绗缝工艺与靠墙零间隙一览无余'
  },
  {
    id: 'tpl-a07',
    code: 'A07',
    name: '沙发茶几组群中景 (Ensemble Living Composition)',
    alignmentSample: 'Studio Sample 0939/0914 / Ensemble Living',
    studioCategory: '客厅核心起居生活方式',
    workflowRole: '40mm 经典会客中景',
    recommendedAspectRatio: '16:9',
    intent: {
      intentCode: 'SI-01',
      name: '经典组群围合 (Ensemble Harmony)',
      productDominancePct: 75,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 12,
      description: '宽屏全景中景，主沙发+奢石中岛双茶几+边几，侧翼微露单椅，展现起居会客区的层次感与高定奢石肌理'
    },
    defaultCamera: {
      lensMm: 40,
      heightCm: 115,
      yawDeg: -15,
      pitchDeg: -5,
      rollDeg: 0,
      target: { type: 'product', id: 'living_ensemble' },
      framing: 'product',
      mustInclude: ['hero_main_sofa', 'center_coffee_table', 'foreground_table_styling', 'carpet_pattern'],
      mustExclude: ['messy_foreground', 'wide_empty_edges', 'flat_frontal_mugshot']
    },
    description: '焦段 40mm，机位高度 115cm，微俯 -5°，16:9 宽屏中景，主沙发与奢石中岛双茶几亲密呼应，经典起居组群生活方式'
  },
  {
    id: 'tpl-a08',
    code: 'A08',
    name: '单椅五档功能状态景 (Recliner 5-Mode Function Showcase)',
    alignmentSample: 'Studio Sample Recliner 5 Postures / Multi-Mode Life',
    studioCategory: '单椅 5 档多功能状态展示 (空旷客厅位)',
    workflowRole: '45mm 35° 固定视角功能矩阵位',
    recommendedAspectRatio: '16:9',
    intent: {
      intentCode: 'SI-06',
      name: '单椅五档功能全态 (Recliner 5 Functional States)',
      productDominancePct: 80,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 15,
      description: '中景眼平高度 100cm（参考图示5），保持 35° 侧斜机位固定，单椅独立摆放在母版空旷开阔的客厅中央地毯区域（主沙发不入镜争夺焦点），呈现单人位头等舱沙发的 5 种功能状态：160°小憩沉睡、140°听歌仰躺、120°追剧观影、110°阅览书刊、110°智能冲浪'
    },
    defaultCamera: {
      lensMm: 45,
      heightCm: 100,
      yawDeg: 35,
      pitchDeg: -3,
      rollDeg: 0,
      target: { type: 'product', id: 'recliner' },
      framing: 'lifestyle',
      mustInclude: ['manwah_power_recliner_chair', 'open_spacious_living_room_placement', 'motion_mechanism_ergonomics', 'lifestyle_posture_interaction', 'ambient_living_rug'],
      mustExclude: ['distant_room_clutter', 'crooked_camera_shifts', 'three_seater_sofa_centered']
    },
    description: '焦段 45mm，机位高度 100cm（参考图示5中景眼平），固定 35° 侧斜角，单椅独立置于空旷开阔的客厅中央，展示单椅 5 种功能角度与舒展生活方式（沉睡/听歌/追剧/阅读/冲浪）'
  },
  {
    id: 'tpl-a09',
    code: 'A09',
    name: '餐桌配套展示景 (Dining Suite Ensemble View)',
    alignmentSample: 'Studio Sample Dining Suite / Luxury Dining Flat',
    studioCategory: '客餐一体化大平层奢华餐区全案 (餐桌椅配套)',
    workflowRole: '38mm 餐客一体餐区全景位',
    recommendedAspectRatio: '16:9',
    intent: {
      intentCode: 'SI-09',
      name: '餐客一体全案空间 (Integrated Dining Ensemble)',
      productDominancePct: 75,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 10,
      description: '大平层客餐一体化纵深全案（参考图示1）：站姿眼平高度 125cm，微侧 15° 视角。单独关联餐桌椅、餐边柜、移动餐车等配套产品资产录入生成（母版作为空间与摆放参考锁定）：天然奢石黑色大理石长餐桌 + 配套双拼皮革餐椅 + 艺术定制黑金餐边柜（含艺术画与台灯）+ 移动酒水餐车，呈现大平层奢华宴饮与用餐格调'
    },
    defaultCamera: {
      lensMm: 38,
      heightCm: 125,
      yawDeg: 15,
      pitchDeg: -4,
      rollDeg: 0,
      target: { type: 'product', id: 'dining_suite' },
      framing: 'wide',
      mustInclude: ['luxury_marble_dining_table', 'matching_dining_chairs', 'dining_credenza_sideboard', 'champagne_bar_cart', 'panoramic_window_light', 'indoor_foliage_plant'],
      mustExclude: ['three_seater_sofa_in_center', 'messy_kitchen_sink', 'cramped_space', 'crooked_verticals']
    },
    description: '焦段 38mm，机位高度 125cm（参考图示1站姿眼平微俯视），微侧 15° 视角，16:9 宽画幅完整呈现奢石长餐桌、配套餐椅、定制餐边柜与移动酒水餐车'
  }
];

/**
 * 依据镜头编号获取标准模版
 */
export function getShotTemplateByCode(code: string): ShotTemplate | undefined {
  return STANDARD_SHOT_TEMPLATES.find((t) => t.code.toUpperCase() === code.toUpperCase());
}
