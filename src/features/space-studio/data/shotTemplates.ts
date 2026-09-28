// src/features/space-studio/data/shotTemplates.ts
// MANWAH Space Studio｜A01~A08 标准镜头群组模版库与 Intent 规范
import { ShotTemplate } from '../../../types/spaceStudio';

export const STANDARD_SHOT_TEMPLATES: ShotTemplate[] = [
  {
    id: 'tpl-a01',
    code: 'A01',
    name: '空间主大全景 (Master Panoramic View)',
    intent: {
      intentCode: 'SI-01',
      name: '空间与产品平衡 (Space/Product Balance)',
      productDominancePct: 45,
      backgroundSuppression: 'low',
      maxOcclusionPct: 5,
      description: '展现大平层/挑高大宅会客厅通透大气的空间开扬感与全案视野'
    },
    defaultCamera: {
      lensMm: 28,
      heightCm: 140,
      yawDeg: 0,
      pitchDeg: -3,
      rollDeg: 0,
      target: { type: 'zone', id: 'living_room' },
      framing: 'wide',
      mustInclude: ['all_living_zone', 'floor_ceiling_relation'],
      mustExclude: ['kitchen_clutter', 'excessive_corridor']
    },
    description: '广角焦段交代核心产品与建筑落地窗、挑高吊顶的尺度张力'
  },
  {
    id: 'tpl-a02',
    code: 'A02',
    name: '产品 45° 黄金视角 (Hero Product 45°)',
    intent: {
      intentCode: 'SI-02',
      name: '核心产品聚焦 (Hero Product Focus)',
      productDominancePct: 68,
      backgroundSuppression: 'high',
      maxOcclusionPct: 8,
      description: '敏华核心主沙发黄金三分之一侧翼微仰，突出轮廓气度与饱满丰盈坐感'
    },
    defaultCamera: {
      lensMm: 45,
      heightCm: 125,
      yawDeg: 42,
      pitchDeg: -4,
      rollDeg: 0,
      target: { type: 'product', id: 'primary_sofa' },
      framing: 'product',
      mustInclude: ['sofa_armrest', 'seat_leather_curvature'],
      mustExclude: ['back_wall_excess']
    },
    description: '商业家具大画册标准 Hero 视角，光影沿皮革轮廓流动'
  },
  {
    id: 'tpl-a03',
    code: 'A03',
    name: '单椅功能位 (Recliner Power Function)',
    intent: {
      intentCode: 'SI-04',
      name: '功能机构展示 (Function Mechanism)',
      productDominancePct: 70,
      backgroundSuppression: 'high',
      maxOcclusionPct: 5,
      description: '展示头等舱电动功能单椅 110°-160° 超静音开合与脚托舒展姿态'
    },
    defaultCamera: {
      lensMm: 50,
      heightCm: 110,
      yawDeg: -25,
      pitchDeg: -2,
      rollDeg: 0,
      target: { type: 'product', id: 'recliner' },
      framing: 'product',
      mustInclude: ['footrest_open', 'headrest_angle', 'motion_gap_clearance'],
      mustExclude: ['distracting_wall_decor']
    },
    description: '聚焦敏华独家高碳钢电机机构与舒适支撑力学'
  },
  {
    id: 'tpl-a04',
    code: 'A04',
    name: '皮质特写 (Micro Leather Craftsmanship)',
    intent: {
      intentCode: 'SI-06',
      name: '材质工艺特写 (Material Craft Focus)',
      productDominancePct: 85,
      backgroundSuppression: 'high',
      maxOcclusionPct: 0,
      description: '微距级呈现头层半苯胺天然牛皮毛孔纹理、手工双针车线与圆润滚边'
    },
    defaultCamera: {
      lensMm: 85,
      heightCm: 90,
      yawDeg: 15,
      pitchDeg: -10,
      rollDeg: 0,
      target: { type: 'detail', id: 'leather_pore' },
      framing: 'detail',
      mustInclude: ['leather_pores', 'precision_stitching', 'soft_sheen'],
      mustExclude: ['distant_background']
    },
    description: '浅景深虚化背景，85mm 人像长焦捕捉触手可及的奢华肌理'
  },
  {
    id: 'tpl-a05',
    code: 'A05',
    name: '低角度仰拍 (Majestic Architectural Angle)',
    intent: {
      intentCode: 'SI-03',
      name: '空间巍峨气场 (Majestic Scale)',
      productDominancePct: 65,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 5,
      description: '贴地 60cm 低机位仰拍，拉伸空间纵深并强化家具稳健厚重的大气基座'
    },
    defaultCamera: {
      lensMm: 35,
      heightCm: 60,
      yawDeg: 10,
      pitchDeg: 6,
      rollDeg: 0,
      target: { type: 'product', id: 'primary_sofa' },
      framing: 'product',
      mustInclude: ['sofa_structure', 'ceiling_height_scale'],
      mustExclude: ['floor_dust_artifacts']
    },
    description: '低机位两点透视，竖向线条笔直刚劲'
  },
  {
    id: 'tpl-a06',
    code: 'A06',
    name: '沙发+茶几组合近景 (Ensemble Living Composition)',
    intent: {
      intentCode: 'SI-01',
      name: '经典组群围合 (Ensemble Harmony)',
      productDominancePct: 75,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 8,
      description: '呈现主沙发与潘多拉天然奢石微晶茶几的亲密呼应与会客动线'
    },
    defaultCamera: {
      lensMm: 40,
      heightCm: 115,
      yawDeg: -15,
      pitchDeg: -5,
      rollDeg: 0,
      target: { type: 'product', id: 'living_ensemble' },
      framing: 'product',
      mustInclude: ['sofa_front_apron', 'coffee_table_stone_veins'],
      mustExclude: ['messy_foreground']
    },
    description: '皮石相映，展现高定客厅的材质对冲美感'
  },
  {
    id: 'tpl-a07',
    code: 'A07',
    name: '生活方式互动景 (Lifestyle Family Scene)',
    intent: {
      intentCode: 'SI-08',
      name: '生活方式共鸣 (Lifestyle Resonance)',
      productDominancePct: 55,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 20,
      description: '为 03 HUMAN 阶段预留家庭成员交互与沉浸坐卧情景'
    },
    defaultCamera: {
      lensMm: 35,
      heightCm: 130,
      yawDeg: 0,
      pitchDeg: -2,
      rollDeg: 0,
      target: { type: 'zone', id: 'living_human_space' },
      framing: 'lifestyle',
      mustInclude: ['seating_zones', 'conversational_flow'],
      mustExclude: ['awkward_empty_corners']
    },
    description: '承载家庭温暖互动的生活方式大片'
  },
  {
    id: 'tpl-a08',
    code: 'A08',
    name: '空间特色立面 (Signature Architectural Feature)',
    intent: {
      intentCode: 'SI-01',
      name: '立面光影通透 (Architectural Illumination)',
      productDominancePct: 40,
      backgroundSuppression: 'low',
      maxOcclusionPct: 5,
      description: '全景落地窗外自然光线投射在木饰面与地面大理石上的光影韵律'
    },
    defaultCamera: {
      lensMm: 24,
      heightCm: 150,
      yawDeg: 12,
      pitchDeg: 0,
      rollDeg: 0,
      target: { type: 'zone', id: 'architectural_facade' },
      framing: 'wide',
      mustInclude: ['floor_to_ceiling_facade', 'natural_sunlight_angle'],
      mustExclude: ['overexposed_sky']
    },
    description: '超广角表现空间骨架与大自然光辉的交融'
  }
];
