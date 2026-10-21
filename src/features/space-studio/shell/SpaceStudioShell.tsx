import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  SpaceProject,
  SpaceWorkflowStep,
  ShotInstance,
  SpaceStudioMode,
  ProductAsset,
  SpacePreset,
  StylePreset,
  PlacementBlueprint,
  SceneMaster,
  ShotRevision,
  GenerationJob,
  GenerationSettings,
  ImageAspectRatio,
  IMAGE_ASPECT_SPECS,
  RenderComputeConfig,
  RenderResolution,
  UIThemeMode,
  DisaggregatedProductItem
} from '../../../types/spaceStudio';
import { SAMPLE_SUITE_ANNOTATIONS_14 } from '../data/sceneAnnotationPresets';
import { dbService } from '../../../services/dbService';
import {
  Box,
  Camera,
  Users,
  Palette,
  Layers,
  Lock,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  RotateCw,
  Plus,
  Sliders,
  CheckCircle2,
  AlertCircle,
  GitBranch,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PanelBottomClose,
  PanelBottomOpen,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  RotateCcw,
  Building2,
  Home,
  Package,
  Wand2,
  Eye,
  Download,
  Image as ImageIcon
} from 'lucide-react';
import { ProductUploadModal, UploadedImageItem } from '../components/ProductUploadModal';
import { SpaceStudioLeftDrawer } from '../components/SpaceStudioLeftDrawer';
import { SpaceStudioCanvas } from '../components/SpaceStudioCanvas';
import { OutpaintParams } from '../components/CanvasOutpaintOverlay';
import { SpaceStudioShotNavigator } from '../components/SpaceStudioShotNavigator';
import { SpaceStudioRightPanel } from '../components/SpaceStudioRightPanel';
import {
  ActivePhotographyAssets,
  ShotCandidateBatch,
  CandidateItem,
  HumanLayoutConfig,
  DEFAULT_4_HUMAN_SLOTS,
  ModelAsset,
  SceneStyleAsset
} from '../../../types/spaceAssetLibrary';
import { spaceAssetLibraryService } from '../../../services/spaceAssetLibraryService';
import { BuildPhasePanel } from '../components/BuildPhasePanel';
import { INITIAL_MANWAH_PRODUCTS, isInitialDemoProduct, isOnlyDemoProducts } from '../data/productAssets';
import { SPACE_PROTOTYPES } from '../data/spacePresets';
import { STYLE_PRESETS } from '../data/stylePresets';
import { recommendStylesForProduct } from '../engine/styleRecommendationEngine';
import { PlacementEngine } from '../engine/placementEngine';
import { SceneMasterPromptCompiler } from '../engine/sceneMasterPromptCompiler';
import { ShootPhasePanel } from '../components/ShootPhasePanel';
import { ShootPhaseWorkspace } from '../components/ShootPhaseWorkspace';
import { STANDARD_SHOT_TEMPLATES, getShotTemplateByCode } from '../data/shotTemplates';
import { ShootCompiler } from '../engine/shootCompiler';
import { ValidationEngine } from '../engine/validationEngine';
import { RevisionGraphModal } from '../components/RevisionGraphModal';
import { RevisionGraphEngine } from '../engine/revisionGraphEngine';
import { HumanPhasePanel } from '../components/HumanPhasePanel';
import { InteractiveViewport } from '../components/InteractiveViewport';
import { DesignPhasePanel } from '../components/DesignPhasePanel';
import { SpaceToPosterAdapter } from '../adapters/spaceToPosterAdapter';
import { PlanScreenItem } from '../../../services/posterStudioService';
import { TemplateId } from '../../../types/posterTemplate';
import { SeatAssignment } from '../../../types/spaceStudio';
import { SpaceStudioPersistenceService } from '../../../services/spaceStudioPersistenceService';
import { ClearRecordsModal } from '../components/modals/ClearRecordsModal';

interface SpaceStudioShellProps {
  projectId?: string;
  onSwitchMode: (mode: SpaceStudioMode) => void;
  onBackToCanvas?: () => void;
  onHandoffToPoster?: (screenItem: PlanScreenItem) => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

const DEFAULT_SHOTS: ShotInstance[] = [
  {
    id: 'shot-a00',
    templateCode: 'A00',
    name: '空间母版 (Scene Master)',
    aspectRatio: '4:3',
    camera: {
      lensMm: 35,
      heightCm: 135,
      yawDeg: 0,
      pitchDeg: -1,
      rollDeg: 0,
      target: { type: 'product', id: 'p1' },
      framing: 'wide',
      mustInclude: ['hero_sofa', 'coffee_table', 'ceiling_architecture', 'balanced_living_ensemble'],
      mustExclude: ['human', 'drifting_isolated_chair', 'excessive_empty_rug']
    },
    intent: {
      intentCode: 'SI-01',
      name: '空间与产品平衡 (Space/Product Balance)',
      productDominancePct: 60,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 5,
      description: '全景展示空间户型、建筑结构与敏华主产品的平衡关系'
    },
    status: 'draft',
    revisions: [],
    hasHumanPass: false
  },
  {
    id: 'shot-a01',
    templateCode: 'A01',
    name: '空间主大场景 (Grand Frontal Architectural Panorama)',
    aspectRatio: '4:3',
    camera: {
      lensMm: 35,
      heightCm: 115,
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      target: { type: 'zone', id: 'living_room' },
      framing: 'wide',
      mustInclude: ['strictly_straight_on_frontal_view', 'centered_marble_backdrop_wall_axis', 'panoramic_full_height_left_window', 'open_right_corridor_and_dining_flow', 'complete_3_plus_1_sofa_ensemble', 'designer_coffee_table', 'generous_living_area_rug', 'white_matte_cylindrical_planter_anchor'],
      mustExclude: ['angled_side_perspective', 'diagonal_camera_view', 'tilted_off_center', 'cramped_framing', 'excessive_empty_wooden_floor_in_foreground', 'vast_barren_foreground_floor_void', 'deployed_footrest_without_people', 'blank_featureless_white_ceiling']
    },
    intent: {
      intentCode: 'SI-01',
      name: '空间主大场景 (Grand Frontal Horizon)',
      productDominancePct: 45,
      backgroundSuppression: 'low',
      maxOcclusionPct: 5,
      description: '客餐厅一体全案大平层生活方式；展示 3+1 沙发组、茶几、地毯与右侧餐厅的整体空间流动感。锚定居中背景墙、左侧通高落地窗、右侧开阔过道与餐厅区。'
    },
    status: 'draft',
    revisions: [],
    hasHumanPass: false
  },
  {
    id: 'shot-a02',
    templateCode: 'A02',
    name: '45° 3+1 组合大全景 (45° 3+1 Living Ensemble View)',
    aspectRatio: '4:3',
    camera: {
      lensMm: 45,
      heightCm: 115,
      yawDeg: 40,
      pitchDeg: -3,
      rollDeg: 0,
      target: { type: 'product', id: 'living_ensemble' },
      framing: 'wide',
      mustInclude: ['three_seater_sofa', 'matching_side_chair', 'center_coffee_table', 'ensemble_spatial_depth', 'left_side_daylight_sheen', 'floor_diagonal_vanishing_lines', 'white_matte_cylindrical_planter_anchor'],
      mustExclude: ['flat_frontal_mugshot', 'straight_on_camera', 'symmetrical_center_sofa', 'facing_directly_forward', 'tight_single_product_crop', 'cropping_out_side_chair', 'cropping_out_main_sofa']
    },
    intent: {
      intentCode: 'SI-02',
      name: '45° 3+1 组合全景聚焦 (3+1 Ensemble Living Focus)',
      productDominancePct: 65,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 8,
      description: '展示“3人位+单人位”围合布局与开阔度；呈现左侧自然采光下皮质的光泽度与落座动线。锚定地板对角线灭点、地毯铺设基准区、窗帘垂坠边界。'
    },
    status: 'draft',
    revisions: [],
    hasHumanPass: false
  },
  {
    id: 'shot-a03',
    templateCode: 'A03',
    name: '三人位主沙发场景 (Hero 3-Seater Living Focus)',
    aspectRatio: '4:3',
    camera: {
      lensMm: 50,
      heightCm: 95,
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      target: { type: 'product', id: 'primary_sofa' },
      framing: 'product',
      mustInclude: ['three_seater_sofa', 'symmetrical_marble_backdrop_axis', 'dual_curved_sconce_midline', 'sofa_leather_texture', 'foreground_coffee_table'],
      mustExclude: ['separate_accent_single_chair', 'side_armchair', 'lounge_chair', 'angled_view', 'deployed_footrests_when_no_human']
    },
    intent: {
      intentCode: 'SI-03',
      name: '三人位主沙发场景 (Hero 3-Seater Focus)',
      productDominancePct: 75,
      backgroundSuppression: 'high',
      maxOcclusionPct: 5,
      description: '主推核心单品（C位三人位）；展示靠背饱满支撑感、双向扶手体量与背景墙的对称高级感。锚定大理石背景墙中轴对称线、双弧形壁灯高度中线。'
    },
    status: 'draft',
    revisions: [],
    hasHumanPass: false
  },
  {
    id: 'shot-a04',
    templateCode: 'A04',
    name: '三分之二主沙亲子陪伴场景 (2/3 Hero Sofa Companion View)',
    aspectRatio: '3:4',
    camera: {
      lensMm: 45,
      heightCm: 140,
      yawDeg: -28,
      pitchDeg: -15,
      rollDeg: 0,
      target: { type: 'product', id: 'primary_sofa_left_two_thirds' },
      framing: 'lifestyle',
      mustInclude: ['two_thirds_hero_sofa', 'wide_seating_depth', 'foreground_play_rug_stage', 'sheer_curtain_window_light', 'white_matte_cylindrical_planter_anchor'],
      mustExclude: ['flat_frontal_view', 'full_100_percent_wide_sofa_panorama', 'isolated_single_chair', 'separate_recliner_chair', 'stiff_emotionless_posing']
    },
    intent: {
      intentCode: 'SI-08',
      name: '三分之二主沙亲子陪伴 (2/3 Hero Companion View)',
      productDominancePct: 70,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 15,
      description: '情感化/家庭生活方式：聚焦 2/3 座面与前沿地毯，突出宽大座深供亲子互动、地毯玩耍的温馨感。锚定地板光影渐变区、左侧落地窗白色纱帘透光处、固定绿植。'
    },
    status: 'draft',
    revisions: [],
    hasHumanPass: false
  },
  {
    id: 'shot-a05',
    templateCode: 'A05',
    name: '三分之二主沙私享休闲景 (2/3 Hero Sofa Private Lounge View)',
    aspectRatio: '3:4',
    camera: {
      lensMm: 50,
      heightCm: 95,
      yawDeg: 28,
      pitchDeg: 0,
      rollDeg: 0,
      target: { type: 'product', id: 'primary_sofa_right_two_thirds' },
      framing: 'lifestyle',
      mustInclude: ['two_thirds_hero_sofa_right', 'right_armrest_quilting', 'metal_trim_accent', 'brass_closure_strip_anchor', 'warm_ambient_wall_sconce'],
      mustExclude: ['flat_frontal_view', 'full_100_percent_wide_sofa_panorama', 'isolated_single_chair', 'separate_recliner_chair', 'casual_messy_elements']
    },
    intent: {
      intentCode: 'SI-05',
      name: '三分之二主沙私享休闲 (2/3 Hero Private Lounge)',
      productDominancePct: 70,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 12,
      description: '品质感/工艺细节：聚焦扶手立体菱格纹压花、金属收边、皮质微距触感与后方温暖壁灯。锚定背景墙右侧铜条收口线、悬浮发光层板下边缘。'
    },
    status: 'draft',
    revisions: [],
    hasHumanPass: false
  },
  {
    id: 'shot-a06',
    templateCode: 'A06',
    name: '零靠墙功能闭合侧景 (Zero-Wall Clearance Profile View)',
    aspectRatio: '4:3',
    camera: {
      lensMm: 60,
      heightCm: 90,
      yawDeg: 88,
      pitchDeg: 0,
      rollDeg: 0,
      target: { type: 'product', id: 'zero_wall_mechanism' },
      framing: 'lifestyle',
      mustInclude: ['zero_wall_back_clearance_against_wall', 'flush_wall_placement', 'pure_lateral_profile_60mm', 'side_armrest_quilting_detail', 'fully_retracted_closed_footrest', 'vertical_plumb_lines'],
      mustExclude: ['flat_frontal_mugshot', 'three_quarters_generic_angle', 'deployed_footrest', 'extended_footrest', 'reclined_backrest', 'unfolded_mechanism', 'crowded_foreground']
    },
    intent: {
      intentCode: 'SI-07',
      name: '零靠墙功能闭合侧景 (Zero-Wall Clearance Profile)',
      productDominancePct: 75,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 15,
      description: '核心硬核卖点：直观量化“零靠墙”省空间功能；展现沙发背部贴墙极小距离（<5cm）与侧面紧凑线条。锚定背景墙侧面厚度基准、窗框竖柱与地平线垂直线。'
    },
    status: 'draft',
    revisions: [],
    hasHumanPass: false
  },
  {
    id: 'shot-a07',
    templateCode: 'A07',
    name: '沙发茶几组群中景 (Ensemble Living Composition)',
    aspectRatio: '4:3',
    camera: {
      lensMm: 55,
      heightCm: 95,
      yawDeg: -35,
      pitchDeg: -5,
      rollDeg: 0,
      target: { type: 'product', id: 'living_ensemble' },
      framing: 'product',
      mustInclude: ['hero_main_sofa', 'natural_marble_coffee_table', 'golden_height_drop_450mm_vs_400mm', 'carpet_geometric_pattern_anchor', 'foliage_shadow_falloff_anchor', 'deep_contact_ao_shadow'],
      mustExclude: ['messy_foreground', 'extreme_close_up', 'isolated_single_furniture_item', 'empty_room_void']
    },
    intent: {
      intentCode: 'SI-01',
      name: '沙发茶几组群中景 (Ensemble Living)',
      productDominancePct: 75,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 10,
      description: '配套材质与围合感：展示大理石茶几、深色方几、绿植与主沙发的黄金高低差（450mm vs 400mm）。锚定地毯中央几何图案定位区、绿植阴影投射区。'
    },
    status: 'draft',
    revisions: [],
    hasHumanPass: false
  },
  {
    id: 'shot-a08',
    templateCode: 'A08',
    name: '单椅五档功能状态景 (Single Recliner 5-Mode Function Matrix)',
    aspectRatio: '4:3',
    camera: {
      lensMm: 50,
      heightCm: 95,
      yawDeg: 38,
      pitchDeg: -3,
      rollDeg: 0,
      target: { type: 'product', id: 'power_recliner_modes' },
      framing: 'lifestyle',
      mustInclude: ['manwah_power_recliner_chair', 'golden_diagonal_perspective_50mm', 'open_spacious_living_room_placement', 'window_daylight_shadow_boundary', 'deep_contact_ao_shadow'],
      mustExclude: ['camera_angle_drift', 'three_seater_sofa_dominant', 'flat_frontal_view', 'distorted_vanishing_lines']
    },
    intent: {
      intentCode: 'SI-06',
      name: '单椅五档功能状态景 (Recliner 5-Mode Showcase)',
      productDominancePct: 80,
      backgroundSuppression: 'high',
      maxOcclusionPct: 15,
      description: '单人位核心功能体验：五档调节、电动脚踏展开、后仰舒适弧度；搭配雪茄盒/红酒杯营造个人私享角。锚定大落地窗明暗分界线、左下角地毯边缘留白区。'
    },
    status: 'draft',
    revisions: [],
    hasHumanPass: false
  },
  {
    id: 'shot-a09',
    templateCode: 'A09',
    name: '餐桌配套展示景 (Dining Suite Ensemble View)',
    aspectRatio: '4:3',
    camera: {
      lensMm: 40,
      heightCm: 115,
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      target: { type: 'zone', id: 'dining_room' },
      framing: 'wide',
      mustInclude: ['luxury_marble_dining_table', 'matching_leather_dining_chairs', 'dining_credenza_sideboard', 'champagne_bar_cart', 'right_wall_panel_anchor', 'art_painting_axis_anchor'],
      mustExclude: ['cramped_table_crop', 'living_room_sofa_dominant', 'cluttered_dirty_dishes', 'harsh_shadows']
    },
    intent: {
      intentCode: 'SI-09',
      name: '餐厅配套展示组 (Dining Suite Ensemble)',
      productDominancePct: 75,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 10,
      description: '整家配套延伸：展现同色系大理石餐桌、皮革餐椅、餐边柜与酒水推车，强化“买全屋配齐”的客单拉力。锚定右侧背景墙壁板、独立艺术挂画中轴线。'
    },
    status: 'draft',
    revisions: [],
    hasHumanPass: false
  }
];

export const SpaceStudioShell: React.FC<SpaceStudioShellProps> = ({
  projectId = 'manwah-noble-space-01',
  onSwitchMode,
  onBackToCanvas,
  onHandoffToPoster,
  theme: externalTheme,
  onToggleTheme: externalOnToggleTheme
}) => {
  // 1. 初次尝试从浏览器本地持久化快照中恢复上一次作业记录 (支持离开工作台后返回无损恢复)
  const initialSnapshot = useMemo(() => {
    return SpaceStudioPersistenceService.loadSnapshot(projectId);
  }, [projectId]);

  const [currentStep, setCurrentStep] = useState<SpaceWorkflowStep>('build');
  const [shots, setShots] = useState<ShotInstance[]>(() => {
    if (initialSnapshot?.shots && initialSnapshot.shots.length > 0) {
      return initialSnapshot.shots;
    }
    return DEFAULT_SHOTS;
  });
  const [activeShotId, setActiveShotId] = useState<string>(() => {
    return initialSnapshot?.activeShotId || 'shot-a00';
  });

  // BUILD 阶段核心工程状态：优先使用已持久化的真实上传产品或最近上传素材，杜绝刷新后被系统内置 demo 覆盖
  const [products, setProducts] = useState<ProductAsset[]>(() => {
    if (initialSnapshot?.products && initialSnapshot.products.length > 0) {
      return initialSnapshot.products;
    }
    const recent = SpaceStudioPersistenceService.getRecentUploadedProducts();
    if (recent && recent.length > 0) {
      return recent;
    }
    return INITIAL_MANWAH_PRODUCTS;
  });

  const [selectedSpace, setSelectedSpace] = useState<SpacePreset>(() => {
    if (initialSnapshot?.selectedSpaceId) {
      const found = SPACE_PROTOTYPES.find(s => s.id === initialSnapshot.selectedSpaceId);
      if (found) return found;
    }
    return SPACE_PROTOTYPES[0];
  });

  const [selectedStyle, setSelectedStyle] = useState<StylePreset>(() => {
    if (initialSnapshot?.selectedStyleId) {
      const found = STYLE_PRESETS.find(s => s.id === initialSnapshot.selectedStyleId);
      if (found) return found;
    }
    return STYLE_PRESETS[0];
  });

  const [blueprint, setBlueprint] = useState<PlacementBlueprint>(() => {
    if (initialSnapshot?.blueprint) {
      return initialSnapshot.blueprint;
    }
    return PlacementEngine.generateStandardBlueprint({
      spacePreset: SPACE_PROTOTYPES[0],
      products: INITIAL_MANWAH_PRODUCTS
    });
  });

  // 视窗两翼折叠与自由宽度状态
  const [leftDrawerWidth, setLeftDrawerWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = Number(localStorage.getItem('space_studio_left_width'));
      if (saved >= 240 && saved <= 520) return saved;
    }
    return 336;
  });
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = Number(localStorage.getItem('space_studio_right_width'));
      if (saved >= 280 && saved <= 560) return saved;
    }
    return 368;
  });
  const [isLeftCollapsed, setIsLeftCollapsed] = useState<boolean>(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState<boolean>(false);
  const [isBottomCollapsed, setIsBottomCollapsed] = useState<boolean>(false);

  // 空间母版 1~14 多产品交互打标状态 (支持真实产品动态映射与大平层拓扑锁定，默认关闭)
  const [sceneAnnotations, setSceneAnnotations] = useState<DisaggregatedProductItem[]>(SAMPLE_SUITE_ANNOTATIONS_14);
  const [showAnnotations, setShowAnnotations] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('space_studio_show_annotations');
      if (saved !== null) return saved === 'true';
    }
    return false;
  });
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);

  // 清除当前页面生成记录与开启新作业弹窗状态
  const [isClearRecordsModalOpen, setIsClearRecordsModalOpen] = useState<boolean>(false);
  const [feedbackNotice, setFeedbackNotice] = useState<{ type: 'success' | 'info'; text: string } | null>(null);

  // 动态同步画布打标与当前场景关联的真实产品套组 (告别静态假数据坐标偏离)
  useEffect(() => {
    if (!products || products.length === 0) return;

    // 若当前仍是系统内置 4 款 Demo，保留全景演示 14 点预设
    if (isOnlyDemoProducts(products)) {
      setSceneAnnotations(SAMPLE_SUITE_ANNOTATIONS_14);
      return;
    }

    // 提取当前场景已关联的产品 (主品 + 搭配单品)
    const activeEnsemble = products.filter(
      (p) => p.priority === 'primary' || p.isEnsembleIncluded !== false
    );

    if (activeEnsemble.length === 0) {
      setSceneAnnotations([]);
      return;
    }

    // 根据当前大平层实景摄影拓扑，为真实产品分配高精度空间锚点
    const dynamicItems: DisaggregatedProductItem[] = activeEnsemble.map((p, idx) => {
      let box = (p as any).sourceBoundingBox || (p as any).boundingBox;
      const isTable = p.role === 'coffee_table' || /(茶几|几组|方几|圆几|大理石|岩板)/.test(p.name || '');
      const isSideTable = p.role === 'side_table' || /(边几|角几)/.test(p.name || '');
      const isRecliner = p.role === 'recliner_1seat' || /(功能|电动|头等舱|太空舱)/.test(p.name || '');
      const isLoungeChair = p.role === 'lounge_chair' || /(单椅|休闲)/.test(p.name || '');
      const isMainSofa = p.priority === 'primary' || p.role === 'sofa_2seat' || p.role === 'sofa_3seat' || /(三人|主沙发)/.test(p.name || '');

      let resolvedRole = p.role;
      if (isTable) resolvedRole = 'coffee_table';
      else if (isSideTable) resolvedRole = 'side_table';
      else if (isRecliner && !isMainSofa) resolvedRole = 'recliner_1seat';
      else if (isLoungeChair && !isMainSofa) resolvedRole = 'lounge_chair';

      if (!box) {
        if (isTable) {
          // 中岛茶几：位于画面中央下部核心区
          box = { ymin: 62, xmin: 33, ymax: 78, xmax: 67 };
        } else if (isSideTable) {
          // 边几：单椅侧翼
          box = { ymin: 58, xmin: 78, ymax: 72, xmax: 88 };
        } else if (isRecliner) {
          // 单人功能位/躺椅：位于画面左翼或右侧
          box = idx === 1 ? { ymin: 48, xmin: 4, ymax: 76, xmax: 27 } : { ymin: 52, xmin: 74, ymax: 76, xmax: 95 };
        } else if (isLoungeChair) {
          // 独立单椅：画面右侧偏中
          box = { ymin: 52, xmin: 74, ymax: 76, xmax: 95 };
        } else if (isMainSofa) {
          // 核心主沙发：画面中心基线
          box = { ymin: 46, xmin: 24, ymax: 66, xmax: 75 };
        } else {
          const xStart = Math.min(75, 20 + idx * 18);
          box = { ymin: 54, xmin: xStart, ymax: 70, xmax: xStart + 16 };
        }
      }

      return {
        id: `ann-prod-${p.id}`,
        name: p.name,
        sku: p.sku || `MW-${resolvedRole.toUpperCase()}-${idx + 1}`,
        role: resolvedRole,
        priority: p.priority,
        dimensions: p.dimensions || { width: 2100, depth: 1050, height: 960 },
        materials: p.materials || ['科技超纤布'],
        colors: p.colors || ['极地奶白'],
        surfaceTexture: p.materials?.[0] || '科技面料',
        functionCapable: p.functionCapable ?? true,
        boundingBox: box,
        roleTitle: p.priority === 'primary' ? '核心主位' : '搭配副品',
        dossierSummary: `已关联场景真实产品，规格: ${p.dimensions?.width || 2100}×${p.dimensions?.depth || 1050}mm`
      };
    });

    setSceneAnnotations(dynamicItems);
  }, [products]);

  // 标点自由拖拽校准与隐藏处理
  const handleUpdateAnnotationPosition = (
    id: string,
    newBoundingBox: { ymin: number; xmin: number; ymax: number; xmax: number }
  ) => {
    setSceneAnnotations((prev) =>
      prev.map((item) => (item.id === id ? { ...item, boundingBox: newBoundingBox } : item))
    );
  };

  const handleHideAnnotation = (id: string) => {
    setSceneAnnotations((prev) => prev.filter((item) => item.id !== id));
  };

  // 自动将当前镜头列表对齐至最新的实拍标准校对名称与推荐画幅 (强制纠偏旧快照中的画幅错位)
  // 标准画幅映射：A01(16:9), A02(4:3), A03(4:3), A04(2:3), A05(2:3), A06~A09(16:9)
  useEffect(() => {
    setShots((prevShots) => {
      let changed = false;
      const updated = prevShots.map((s) => {
        const tpl = getShotTemplateByCode(s.templateCode);
        if (!tpl) return s;
        const needsNameUpdate = Boolean(tpl.name && s.name !== tpl.name);
        const standardAspect = tpl.recommendedAspectRatio as ImageAspectRatio | undefined;
        const needsAspectUpdate = Boolean(standardAspect && s.aspectRatio !== standardAspect);
        if (needsNameUpdate || needsAspectUpdate) {
          changed = true;
          return {
            ...s,
            name: tpl.name,
            aspectRatio: standardAspect || s.aspectRatio
          };
        }
        return s;
      });

      if (changed) {
        // 同步校准当前激活镜头的顶部画幅状态与计算配置
        const currentActive = updated.find((s) => s.id === activeShotId);
        if (currentActive && currentActive.aspectRatio) {
          setAspectRatio(currentActive.aspectRatio);
          setComputeConfig((prev) => ({ ...prev, aspectRatio: currentActive.aspectRatio }));
          if (typeof window !== 'undefined') {
            localStorage.setItem('space_studio_aspect_ratio', currentActive.aspectRatio);
          }
        }
      }

      return changed ? updated : prevShots;
    });
  }, [activeShotId]);

  const isDraggingLeftRef = React.useRef(false);
  const startXLeftRef = React.useRef(0);
  const startWidthLeftRef = React.useRef(336);

  const handleStartResizeLeft = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingLeftRef.current = true;
    startXLeftRef.current = e.clientX;
    startWidthLeftRef.current = leftDrawerWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingLeftRef.current) return;
      const delta = moveEvent.clientX - startXLeftRef.current;
      const newWidth = Math.max(240, Math.min(520, startWidthLeftRef.current + delta));
      setLeftDrawerWidth(newWidth);
    };

    const handleMouseUp = () => {
      isDraggingLeftRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      localStorage.setItem('space_studio_left_width', String(leftDrawerWidth));
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const isDraggingRightRef = React.useRef(false);
  const startXRightRef = React.useRef(0);
  const startWidthRightRef = React.useRef(368);

  const handleStartResizeRight = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRightRef.current = true;
    startXRightRef.current = e.clientX;
    startWidthRightRef.current = rightPanelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRightRef.current) return;
      const delta = startXRightRef.current - moveEvent.clientX;
      const newWidth = Math.max(280, Math.min(560, startWidthRightRef.current + delta));
      setRightPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isDraggingRightRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      localStorage.setItem('space_studio_right_width', String(rightPanelWidth));
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleSyncFromCanvas = async () => {
    try {
      const draft: any = await dbService.getDraft('manwah_canvas_latest');
      if (!draft) return;

      const imageUrl = draft.uploadedImageUrl || draft.uploadedBase64;
      const dna = draft.activeDna;

      const primaryName =
        dna?.primaryProduct?.name ||
        dna?.productCategory ||
        '芝华仕头等舱现代功能沙发组合 (15019)';
      const primaryColors =
        dna?.colors && Array.isArray(dna.colors) && dna.colors.length > 0
          ? dna.colors
          : ['极地米白', '温暖米灰'];
      const primaryMaterials =
        dna?.materials && Array.isArray(dna.materials) && dna.materials.length > 0
          ? dna.materials
          : ['粗呢织物/科技布面料', '高回弹海绵', '优质高碳钢一体多功能伸展骨架'];
      const primaryWidth = dna?.primaryProduct?.dimensions?.width || 3150;
      const primaryDepth = dna?.primaryProduct?.dimensions?.depth || 1080;
      const primaryHeight = dna?.primaryProduct?.dimensions?.height || 960;

      const canvasPrimaryAsset: ProductAsset = {
        id: 'prod-canvas-15019-3s',
        sku: 'MW-15019-3S',
        name: primaryName,
        role: 'sofa_3seat',
        priority: 'primary',
        identityLock: 'strict',
        dimensions: {
          width: primaryWidth,
          depth: primaryDepth,
          height: primaryHeight
        },
        materials: primaryMaterials,
        colors: primaryColors,
        surfaceTexture: '细腻立体科技布面料，高透气微孔，原厂法式精工双包线',
        functionCapable: true,
        referenceImages: imageUrl
          ? [
              {
                id: 'ref-canvas-15019-front',
                type: 'front',
                objectKey: 'projects/canvas/products/15019/front.webp',
                publicUrl: imageUrl,
                verified: true
              }
            ]
          : [],
        structuralFeatures: [
          { name: '主位电动无极调节', description: '支持110°-160°零重力展开' },
          { name: '扶手立体双包线', description: '原厂微弧流线造型' }
        ],
        lockedRules:
          dna?.lockedRules && Array.isArray(dna.lockedRules) && dna.lockedRules.length > 0
            ? dna.lockedRules
            : [
                '严格锁定原图主沙发的米白色彩度与粗呢科技布肌理',
                '严格保持原图中扶手造型与座包分缝比例'
              ],
        readoutConfidence: 97,
        provenance: 'AI_ESTIMATED',
        productionTruth: false,
        sourceType: 'canvas_dna'
      };

      const newProducts: ProductAsset[] = [canvasPrimaryAsset];

      if (dna?.hasSecondaryRecliner || dna?.secondaryProduct) {
        newProducts.push({
          id: 'prod-canvas-15019-1s',
          sku: 'MW-15019-1S',
          name: dna?.secondaryProduct?.name || '头等舱电动单人休闲单椅',
          role: 'recliner_1seat',
          priority: 'secondary',
          identityLock: 'normal',
          dimensions: { width: 960, depth: 980, height: 1020 },
          materials: ['科技面料/头层牛皮', '独立电动伸缩骨架'],
          colors: dna?.secondaryProduct?.colors || ['焦糖棕', '暖米白'],
          surfaceTexture: '微光泽科技皮质',
          functionCapable: true,
          referenceImages: imageUrl
            ? [
                {
                  id: 'ref-canvas-15019-sec',
                  type: '45_deg',
                  objectKey: 'projects/canvas/products/15019/sec.webp',
                  publicUrl: imageUrl,
                  verified: true
                }
              ]
            : [],
          structuralFeatures: [
            { name: '单椅包裹靠背', description: '一体式微倾护脊腰枕' }
          ],
          lockedRules: ['保持单椅与主沙发成套配搭调性'],
          readoutConfidence: 95,
          provenance: 'AI_ESTIMATED',
          productionTruth: false,
          sourceType: 'canvas_dna'
        });
      }

      setProducts(newProducts);
      try {
        const newBp = PlacementEngine.generateStandardBlueprint({
          spacePreset: selectedSpace,
          products: newProducts
        });
        setBlueprint(newBp);
      } catch (e) {
        console.warn('Blueprint update on sync failed:', e);
      }
    } catch (e) {
      console.warn('handleSyncFromCanvas error:', e);
    }
  };

  // 挂载时自动检查是否有画布草稿，自动升级为当前空间产品
  useEffect(() => {
    const autoInitFromCanvas = async () => {
      try {
        const draft: any = await dbService.getDraft('manwah_canvas_latest');
        if (draft && (draft.uploadedImageUrl || draft.activeDna)) {
          // 仅在当前还是默认示例产品时自动载入画布真实产品
          setProducts((currentProds) => {
            const hasDefault = currentProds.some((p) => p.id === 'prod-sofa-001');
            if (hasDefault) {
              handleSyncFromCanvas();
            }
            return currentProds;
          });
        }
      } catch (e) {
        console.warn('Auto init from canvas check warning:', e);
      }
    };
    autoInitFromCanvas();
  }, []);

  const handleAddProduct = (newProduct: ProductAsset) => {
    setProducts((prev) => {
      const updated =
        newProduct.priority === 'primary'
          ? [newProduct, ...prev.filter((p) => p.id !== newProduct.id)]
          : [...prev.filter((p) => p.id !== newProduct.id), newProduct];

      const activeEnsemble = updated.filter(
        (p) => p.priority === 'primary' || p.isEnsembleIncluded !== false
      );

      try {
        const newBp = PlacementEngine.generateStandardBlueprint({
          spacePreset: selectedSpace,
          products: activeEnsemble
        });
        setBlueprint(newBp);
      } catch (e: unknown) {
        console.warn('Blueprint update error:', e);
      }
      return updated;
    });
  };

  const handleUpdateProduct = (updatedProduct: ProductAsset) => {
    setProducts((prev) => {
      const updated = prev.map((p) => (p.id === updatedProduct.id ? updatedProduct : p));
      const activeEnsemble = updated.filter(
        (p) => p.priority === 'primary' || p.isEnsembleIncluded !== false
      );

      try {
        const newBp = PlacementEngine.generateStandardBlueprint({
          spacePreset: selectedSpace,
          products: activeEnsemble
        });
        setBlueprint(newBp);
      } catch (e: unknown) {
        console.warn('Blueprint update error:', e);
      }
      return updated;
    });
  };

  const handleRemoveProduct = (productId: string) => {
    setProducts((prev) => {
      const updated = prev.filter((p) => p.id !== productId);
      const activeEnsemble = updated.filter(
        (p) => p.priority === 'primary' || p.isEnsembleIncluded !== false
      );

      try {
        const newBp = PlacementEngine.generateStandardBlueprint({
          spacePreset: selectedSpace,
          products: activeEnsemble
        });
        setBlueprint(newBp);
      } catch (e: unknown) {
        console.warn('Blueprint update error:', e);
      }
      return updated;
    });
  };

  const handleSetPrimaryProduct = (productId: string) => {
    setProducts((prev) => {
      const target = prev.find((p) => p.id === productId);
      if (!target) return prev;
      const others = prev
        .filter((p) => p.id !== productId)
        .map((p) => ({
          ...p,
          priority: (p.priority === 'primary' ? 'secondary' : p.priority) as
            | 'primary'
            | 'secondary'
            | 'decor'
        }));
      const updated = [
        { ...target, priority: 'primary' as const, identityLock: 'strict' as const, isEnsembleIncluded: true },
        ...others
      ];
      const activeEnsemble = updated.filter(
        (p) => p.priority === 'primary' || p.isEnsembleIncluded !== false
      );

      try {
        const newBp = PlacementEngine.generateStandardBlueprint({
          spacePreset: selectedSpace,
          products: activeEnsemble
        });
        setBlueprint(newBp);
      } catch (e: unknown) {
        console.warn('Blueprint update error:', e);
      }
      return updated;
    });
  };

  // 勾选 / 取消勾选某件产品是否关联到当前场景套组
  const handleToggleEnsembleInclude = (productId: string) => {
    setProducts((prev) => {
      const updated = prev.map((p) => {
        if (p.id === productId) {
          const current = p.isEnsembleIncluded ?? true;
          return { ...p, isEnsembleIncluded: !current };
        }
        return p;
      });

      const activeEnsemble = updated.filter(
        (p) => p.priority === 'primary' || p.isEnsembleIncluded !== false
      );

      try {
        const newBp = PlacementEngine.generateStandardBlueprint({
          spacePreset: selectedSpace,
          products: activeEnsemble
        });
        setBlueprint(newBp);
      } catch (e: unknown) {
        console.warn('Blueprint update on toggle ensemble error:', e);
      }
      return updated;
    });
  };

  // 批量全选或仅留主品
  const handleBatchToggleEnsemble = (allIncluded: boolean) => {
    setProducts((prev) => {
      const updated = prev.map((p) => {
        if (p.priority === 'primary') return { ...p, isEnsembleIncluded: true };
        return { ...p, isEnsembleIncluded: allIncluded };
      });

      const activeEnsemble = updated.filter(
        (p) => p.priority === 'primary' || p.isEnsembleIncluded !== false
      );

      try {
        const newBp = PlacementEngine.generateStandardBlueprint({
          spacePreset: selectedSpace,
          products: activeEnsemble
        });
        setBlueprint(newBp);
      } catch (e: unknown) {
        console.warn('Blueprint update on batch toggle error:', e);
      }
      return updated;
    });
  };
  const [sceneMaster, setSceneMaster] = useState<SceneMaster | null>(() => {
    return initialSnapshot?.sceneMaster || null;
  });
  const sceneMasterRef = useRef<SceneMaster | null>(null);
  useEffect(() => {
    sceneMasterRef.current = sceneMaster;
  }, [sceneMaster]);
  const [isGeneratingMaster, setIsGeneratingMaster] = useState<boolean>(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState<boolean>(false);
  const [isOutpainting, setIsOutpainting] = useState<boolean>(false);

  // 多机位并发渲染调度状态引擎 (Multi-Shot Concurrent Generation Pool)
  const [renderingShotIds, setRenderingShotIds] = useState<string[]>([]);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const renderTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [isGraphModalOpen, setIsGraphModalOpen] = useState<boolean>(false);
  const [currentJob, setCurrentJob] = useState<GenerationJob | null>(null);

  // 兼容旧属性，保障现有子组件无缝工作
  const isRenderingShot = renderingShotIds.length > 0;
  const renderingShotId = renderingShotIds[0] || null;
  const renderingShot = shots.find((s) => s.id === renderingShotId) || null;
  const renderingShotCode = renderingShot?.templateCode || (isGeneratingMaster ? 'A00' : undefined);

  // 挂载初次检查：如果本地草稿或上次异常残留了 generating 状态（如刷新前挂起），自动纠偏复位，防止永久死锁
  useEffect(() => {
    setShots((prev) =>
      prev.map((s) => {
        if (s.status === 'generating') {
          return {
            ...s,
            status: s.revisions && s.revisions.length > 0 ? 'passed' : 'draft'
          };
        }
        return s;
      })
    );
  }, []);

  // 主动打断/取消渲染任务 (支持按镜头单独精准取消，互不影响)
  const handleCancelRendering = (targetShotId?: string) => {
    // 优先取消指定的镜头；未指定则取消当前激活镜头；若当前激活镜头未在渲染则全量安全复位
    const shotIdToCancel = targetShotId || (activeShotId && renderingShotIds.includes(activeShotId) ? activeShotId : undefined);

    if (shotIdToCancel) {
      console.log('[SpaceStudioShell] 收到单镜头打断指令, shotId:', shotIdToCancel);
      const timer = renderTimeoutsRef.current.get(shotIdToCancel);
      if (timer) {
        clearTimeout(timer);
        renderTimeoutsRef.current.delete(shotIdToCancel);
      }
      const controller = abortControllersRef.current.get(shotIdToCancel);
      if (controller) {
        try {
          controller.abort('User cancelled rendering');
        } catch (e) {
          console.warn('Abort error:', e);
        }
        abortControllersRef.current.delete(shotIdToCancel);
      }
      setRenderingShotIds((prev) => prev.filter((id) => id !== shotIdToCancel));

      const targetShot = shots.find((s) => s.id === shotIdToCancel);
      if (targetShot?.templateCode === 'A00') {
        setIsGeneratingMaster(false);
      }
      if (renderingShotIds.length <= 1) {
        setCurrentJob(null);
      }

      setShots((prev) =>
        prev.map((s) => {
          if (s.id === shotIdToCancel) {
            return {
              ...s,
              status: s.revisions && s.revisions.length > 0 ? 'passed' : 'draft'
            };
          }
          return s;
        })
      );
    } else {
      console.log('[SpaceStudioShell] 收到全量打断指令');
      renderTimeoutsRef.current.forEach((t) => clearTimeout(t));
      renderTimeoutsRef.current.clear();
      abortControllersRef.current.forEach((c) => {
        try { c.abort('User cancelled rendering'); } catch (e) {}
      });
      abortControllersRef.current.clear();
      setRenderingShotIds([]);
      setIsGeneratingMaster(false);
      setIsRenderingHuman(false);
      setIsOutpainting(false);
      setIsGeneratingAll(false);
      setCurrentJob(null);

      setShots((prev) =>
        prev.map((s) => ({
          ...s,
          status: s.status === 'generating' ? (s.revisions && s.revisions.length > 0 ? 'passed' : 'draft') : s.status
        }))
      );
    }
  };

  // 摄影画册工作台全新交互状态 (主次分明、折叠抽屉、画幅选择与智能护航)
  const [activeRailTab, setActiveRailTab] = useState<'space' | 'product' | 'style' | 'camera' | 'human'>('space');
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState<boolean>(true);
  const [isProductUploadModalOpen, setIsProductUploadModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<ProductAsset | null>(null);
  const [initialUploadImages, setInitialUploadImages] = useState<UploadedImageItem[]>([]);
  const [isAdvancedAccordionOpen, setIsAdvancedAccordionOpen] = useState<boolean>(false);
  const [isRefiningPrompt, setIsRefiningPrompt] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('space_studio_aspect_ratio') as ImageAspectRatio;
      if (saved && ['4:3', '16:9', '3:4', '1:1', '9:16', '2:3'].includes(saved)) {
        return saved;
      }
    }
    return '4:3';
  });

  // 全局剪贴板粘贴监听：支持系统截图、富文本 HTML 多图提取、网络图片 URL 及产品规格文案直接入库
  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      if (isProductUploadModalOpen) return;

      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.getAttribute('contenteditable') === 'true');

      if (isInput) return;

      const items = e.clipboardData?.items;
      const loadedItems: UploadedImageItem[] = [];

      // 1. 优先提取文件流中的图片 (截图 / 复制的文件)
      if (items && items.length > 0) {
        const imageFiles: File[] = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            if (blob) {
              const ext = item.type.split('/')[1] || 'png';
              imageFiles.push(
                new File(
                  [blob],
                  `工作台截图-${Date.now().toString().slice(-4)}.${ext}`,
                  { type: item.type }
                )
              );
            }
          }
        }

        if (imageFiles.length > 0) {
          e.preventDefault();
          e.stopPropagation();

          let count = 0;
          imageFiles.forEach((file) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const base64 = ev.target?.result as string;
              if (base64) {
                loadedItems.push({
                  id: `img-clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  file,
                  base64,
                  type: loadedItems.length === 0 ? 'front' : loadedItems.length === 1 ? '45_deg' : 'detail',
                  name: file.name
                });
              }
              count++;
              if (count === imageFiles.length && loadedItems.length > 0) {
                setInitialUploadImages(loadedItems);
                setEditingProduct(null);
                setIsProductUploadModalOpen(true);
              }
            };
            reader.readAsDataURL(file);
          });
          return;
        }
      }

      // 2. 富文本 HTML 提取 (支持从网页、飞书、微信等复制的多图)
      const htmlText = e.clipboardData?.getData('text/html');
      if (htmlText) {
        const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
        let match;
        const htmlImgUrls: string[] = [];
        while ((match = imgRegex.exec(htmlText)) !== null) {
          const src = match[1];
          if (src && !htmlImgUrls.includes(src)) {
            htmlImgUrls.push(src);
          }
        }

        if (htmlImgUrls.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          const htmlItems: UploadedImageItem[] = htmlImgUrls.map((url, idx) => ({
            id: `html-img-${Date.now()}-${idx}`,
            base64: url,
            type: idx === 0 ? 'front' : idx === 1 ? '45_deg' : 'detail',
            name: `富文本图-${idx + 1}`
          }));
          setInitialUploadImages(htmlItems);
          setEditingProduct(null);
          setIsProductUploadModalOpen(true);
          return;
        }
      }

      // 3. 纯文本检查 (网络图片链接或尺寸规格)
      const rawText = e.clipboardData?.getData('text')?.trim();
      if (rawText) {
        const isUrl = /^https?:\/\/.+\.(png|jpe?g|webp|gif|bmp)(\?.*)?$/i.test(rawText) || rawText.startsWith('data:image/');
        const isSpecText = /(\d{3,4})\s*[*xX×/]\s*(\d{3,4})/.test(rawText) || /(沙发|茶几|单椅|真皮|面料|尺寸|宽|深|高)/.test(rawText);

        if (isUrl || isSpecText) {
          e.preventDefault();
          e.stopPropagation();
          if (isUrl) {
            setInitialUploadImages([
              {
                id: `url-img-${Date.now()}`,
                base64: rawText,
                type: 'front',
                name: '剪贴板网络图片'
              }
            ]);
          }
          setEditingProduct(null);
          setIsProductUploadModalOpen(true);
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [isProductUploadModalOpen]);

  // UI Theme Mode: dark / light
  const [internalTheme, setInternalTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('space_studio_theme') as 'dark' | 'light';
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'light';
  });

  const theme = externalTheme || internalTheme;

  const handleToggleTheme = () => {
    if (externalOnToggleTheme) {
      externalOnToggleTheme();
    } else {
      setInternalTheme((prev) => {
        const next = prev === 'dark' ? 'light' : 'dark';
        if (typeof window !== 'undefined') {
          localStorage.setItem('space_studio_theme', next);
        }
        return next;
      });
    }
  };

  // 渲染引擎配置选项 (系统默认使用 Nano Banana 2.1 极速响应·轻量多图融合，默认 4:3 空间透视画幅，默认开启多模型故障自动轮换)
  const [computeConfig, setComputeConfig] = useState<RenderComputeConfig & { candidateCount?: number }>(() => {
    let initialAspect: ImageAspectRatio = '4:3';
    let initialModel = 'gemini-3.1-flash-image-preview';
    let initialRes: RenderResolution = '2K';
    let initialFuncPos: 'closed' | 'open' = 'closed';
    let initialAutoFallback = true;
    if (typeof window !== 'undefined') {
      const savedAspect = localStorage.getItem('space_studio_aspect_ratio') as ImageAspectRatio;
      if (savedAspect && ['4:3', '16:9', '3:4', '1:1', '9:16', '2:3'].includes(savedAspect)) {
        initialAspect = savedAspect;
      }
      const savedModel = localStorage.getItem('space_studio_model');
      if (savedModel) {
        initialModel = savedModel;
      }
      const savedRes = localStorage.getItem('space_studio_resolution') as RenderResolution;
      if (savedRes && ['1K', '2K', '4K'].includes(savedRes)) {
        initialRes = savedRes;
      }
      const savedFuncPos = localStorage.getItem('space_studio_functional_position') as 'closed' | 'open';
      if (savedFuncPos && ['closed', 'open'].includes(savedFuncPos)) {
        initialFuncPos = savedFuncPos;
      }
      const savedAutoFallback = localStorage.getItem('space_studio_auto_model_fallback');
      if (savedAutoFallback !== null) {
        initialAutoFallback = savedAutoFallback === 'true';
      }
    }
    return {
      model: initialModel,
      resolution: initialRes,
      aspectRatio: initialAspect,
      customAspectRatio: '',
      seed: undefined,
      namingPreset: 'detailed',
      customPrefix: '',
      candidateCount: 1,
      functionalPositionState: initialFuncPos,
      autoModelFallback: initialAutoFallback
    };
  });

  const handleUpdateComputeConfig = (updater: Partial<RenderComputeConfig & { candidateCount?: number }>) => {
    setComputeConfig((prev) => {
      const next = { ...prev, ...updater };
      if (typeof window !== 'undefined' && updater.model) {
        localStorage.setItem('space_studio_model', updater.model);
      }
      if (typeof window !== 'undefined' && updater.resolution) {
        localStorage.setItem('space_studio_resolution', updater.resolution);
      }
      if (typeof window !== 'undefined' && updater.functionalPositionState) {
        localStorage.setItem('space_studio_functional_position', updater.functionalPositionState);
      }
      if (typeof window !== 'undefined' && typeof updater.autoModelFallback === 'boolean') {
        localStorage.setItem('space_studio_auto_model_fallback', String(updater.autoModelFallback));
      }
      if (updater.aspectRatio) {
        if (updater.aspectRatio !== aspectRatio) {
          setAspectRatio(updater.aspectRatio);
        }
        if (typeof window !== 'undefined') {
          localStorage.setItem('space_studio_aspect_ratio', updater.aspectRatio);
        }
        setShots((prevShots) =>
          prevShots.map((s) => (s.id === activeShotId ? { ...s, aspectRatio: updater.aspectRatio } : s))
        );
      }
      return next;
    });
  };

  const handleShotAspectRatioChange = (newRatio: ImageAspectRatio) => {
    setAspectRatio(newRatio);
    handleUpdateComputeConfig({ aspectRatio: newRatio });
    setShots((prevShots) =>
      prevShots.map((s) => (s.id === activeShotId ? { ...s, aspectRatio: newRatio } : s))
    );
  };

  const handleOpenUploadModal = (prod?: ProductAsset | null) => {
    setEditingProduct(prod || null);
    setInitialUploadImages([]);
    setIsProductUploadModalOpen(true);
  };

  const handleSaveProductFromModal = (savedProd: ProductAsset) => {
    if (editingProduct) {
      handleUpdateProduct(savedProd);
    } else {
      setProducts((prev) => {
        // 1. 如果当前库中全都是系统初始 Demo 产品，且新保存的是主品：
        if (isOnlyDemoProducts(prev)) {
          const updated = [{ ...savedProd, priority: 'primary' as const, isEnsembleIncluded: true }];
          try {
            const newBp = PlacementEngine.generateStandardBlueprint({
              spacePreset: selectedSpace,
              products: updated
            });
            setBlueprint(newBp);
          } catch (e) {
            console.warn('Blueprint update on single save error:', e);
          }
          return updated;
        }

        // 2. 过滤掉 Demo 示例产品
        const userProducts = prev.filter((p) => !isInitialDemoProduct(p) && p.id !== savedProd.id);

        // 如果新保存的是主品，自动将旧主品降级并不再默认勾选（避免 2 款主沙发冲突）
        const updated = savedProd.priority === 'primary'
          ? [
              savedProd,
              ...userProducts.map((p) =>
                p.priority === 'primary'
                  ? { ...p, priority: 'secondary' as const, isEnsembleIncluded: false }
                  : p
              )
            ]
          : [...userProducts, savedProd];

        const activeEnsemble = updated.filter(
          (p) => p.priority === 'primary' || p.isEnsembleIncluded !== false
        );

        try {
          const newBp = PlacementEngine.generateStandardBlueprint({
            spacePreset: selectedSpace,
            products: activeEnsemble
          });
          setBlueprint(newBp);
        } catch (e) {
          console.warn('Blueprint update on single save error:', e);
        }
        return updated;
      });

      // 如果更新或保存的是核心主品，联动推荐 Top 1 风格
      if (savedProd.priority === 'primary') {
        const topRec = recommendStylesForProduct(savedProd, STYLE_PRESETS, 1);
        if (topRec.length > 0 && topRec[0].style) {
          setSelectedStyle(topRec[0].style);
        }
      }
    }
    setIsProductUploadModalOpen(false);
    setEditingProduct(null);
    setInitialUploadImages([]);
  };

  const handleBatchSaveProductsFromModal = (savedProds: ProductAsset[]) => {
    if (!savedProds || savedProds.length === 0) return;

    setProducts((prev) => {
      // 1. 如果当前库里全都是系统内置 Demo 产品：直接完整替换为用户切片入库的新套组！
      if (isOnlyDemoProducts(prev)) {
        const cleanSuite = savedProds.map((p, idx) => ({
          ...p,
          priority: (idx === 0 ? 'primary' : 'secondary') as 'primary' | 'secondary',
          isEnsembleIncluded: true
        }));

        try {
          const newBp = PlacementEngine.generateStandardBlueprint({
            spacePreset: selectedSpace,
            products: cleanSuite
          });
          setBlueprint(newBp);
        } catch (e) {
          console.warn('Blueprint update on clean suite error:', e);
        }
        return cleanSuite;
      }

      // 2. 如果用户之前已上传录入过真实产品：
      // 过滤掉所有内置 Demo 产品，保留用户的旧真实产品
      const existingUserProducts = prev.filter((p) => !isInitialDemoProduct(p));

      // 新切片入库的整套产品作为当前场景聚焦套组（isEnsembleIncluded: true）
      // 旧产品保留在搭配库中作为历史资产，但将它们的当前场景关联取消（isEnsembleIncluded: false），
      // 彻底消除“关联 6 款产品”以及“2款主沙发冲突”的误导性提示！
      const deactivatedOldProducts = existingUserProducts.map((p) => ({
        ...p,
        priority: 'secondary' as const,
        isEnsembleIncluded: false
      }));

      const newPrimary = savedProds.find((p) => p.priority === 'primary') || savedProds[0];
      const newSecondary = savedProds.filter((p) => p.id !== newPrimary.id);

      const updated = [
        { ...newPrimary, priority: 'primary' as const, isEnsembleIncluded: true },
        ...newSecondary.map((p) => ({ ...p, isEnsembleIncluded: true })),
        ...deactivatedOldProducts.filter((p) => !savedProds.some((np) => np.id === p.id))
      ];

      const activeEnsemble = updated.filter(
        (p) => p.priority === 'primary' || p.isEnsembleIncluded !== false
      );

      try {
        const newBp = PlacementEngine.generateStandardBlueprint({
          spacePreset: selectedSpace,
          products: activeEnsemble
        });
        setBlueprint(newBp);
      } catch (e) {
        console.warn('Blueprint update on batch suite error:', e);
      }
      return updated;
    });

    // 智能联动：录入新产品套组后，自动将最匹配的 Top 1 风格设为默认选中风格
    const primaryProd = savedProds.find((p) => p.priority === 'primary') || savedProds[0];
    if (primaryProd) {
      const topRec = recommendStylesForProduct(primaryProd, STYLE_PRESETS, 1);
      if (topRec.length > 0 && topRec[0].style) {
        setSelectedStyle(topRec[0].style);
        console.log(`[SpaceStudio] 录入产品「${primaryProd.name}」自动匹配选中风格: ${topRec[0].style.code} ${topRec[0].style.name} (${topRec[0].percentageLabel})`);
      }
    }

    setIsProductUploadModalOpen(false);
    setEditingProduct(null);
    setInitialUploadImages([]);
  };

  const activeShot = shots.find((s) => s.id === activeShotId) || shots[0];

  // 当前活跃镜头是否处于生成渲染状态
  const isGeneratingCurrentShot = Boolean(
    renderingShotIds.includes(activeShot.id) ||
    (activeShot.templateCode === 'A00' && isGeneratingMaster)
  );

  // 后台正在并发渲染的其他机位（排除当前视口激活的机位）
  const backgroundRenderingShots = shots.filter(
    (s) => renderingShotIds.includes(s.id) && s.id !== activeShot.id
  );

  // 核心产品资产与当前机位正向提示词实时编译 (供画板扩图、局部重绘等下游深度使用)
  const primaryProductForCanvas = useMemo(() => {
    const activeEnsemble = products.filter((p: any) => p.included !== false);
    return (
      activeEnsemble.find((p) => p.priority === 'primary') ||
      activeEnsemble.find((p) => p.role === 'sofa_3seat' || p.role === 'sofa_2seat' || /(三人|3人|主沙发|直排)/.test(p.name || '')) ||
      activeEnsemble[0] ||
      products[0]
    );
  }, [products]);

  const currentPositivePrompt = useMemo(() => {
    if (!activeShot) return '';
    try {
      const activeEnsemble = products.filter((p: any) => p.included !== false);
      const effectiveSceneMaster = sceneMasterRef.current || sceneMaster;
      const compiled = ShootCompiler.compileShotPrompt({
        shot: activeShot,
        sceneMaster: effectiveSceneMaster || {
          id: 'temp-master',
          projectId: 'manwah-noble-space-01',
          objectKey: '',
          isLocked: true,
          lockedAt: new Date().toISOString(),
          locks: {
            productIdentity: true,
            placement: true,
            architecture: true,
            style: true,
            material: true,
            lighting: true,
            camera: true,
            human: false
          },
          promptSnapshotId: 'rev-01'
        },
        products: activeEnsemble,
        spacePreset: selectedSpace,
        stylePreset: selectedStyle,
        blueprint,
        aspectRatio: (activeShot.aspectRatio || computeConfig.aspectRatio || '4:3') as ImageAspectRatio,
        functionalPositionState: computeConfig.functionalPositionState || 'closed'
      });
      return compiled.positivePrompt;
    } catch (err) {
      console.warn('[SpaceStudioShell] 实时编译镜头正向提示词异常:', err);
      return '';
    }
  }, [activeShot, products, sceneMaster, selectedSpace, selectedStyle, blueprint, computeConfig.aspectRatio, computeConfig.functionalPositionState]);

  // 视觉资产驱动工作台状态 (Style, Model, Pose, Lighting)
  const [activeAssets, setActiveAssets] = useState<ActivePhotographyAssets>(() => {
    const defaultStyles = spaceAssetLibraryService.getSceneStyles();
    const defaultModels = spaceAssetLibraryService.getModels();
    const defaultPoses = spaceAssetLibraryService.getPoses();
    return {
      style: defaultStyles[0] || undefined,
      model: defaultModels[0] || undefined,
      pose: defaultPoses[0] || undefined,
      lighting: '天然通透漫射光'
    };
  });

  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [negativePrompt, setNegativePrompt] = useState<string>(
    'nsfw, low quality, deformed anatomy, blurry, distorted furniture, extra limbs, watermark'
  );

  // 人物编排器 Human Layout 状态 (4人 / 6人 / 自定义) - 支持管理员标准持久化保存
  const [humanLayout, setHumanLayout] = useState<HumanLayoutConfig>(() => {
    const savedStandard = spaceAssetLibraryService.getStandardHumanLayout();
    return savedStandard || {
      mode: '4',
      characterCount: 4,
      disallowExtraCharacters: true,
      slots: DEFAULT_4_HUMAN_SLOTS
    };
  });
  const [isRenderingHuman, setIsRenderingHuman] = useState<boolean>(false);
  const [availableModels, setAvailableModels] = useState<ModelAsset[]>(() =>
    spaceAssetLibraryService.getModels()
  );

  // 异步加载 IndexedDB 中的标准人物编排与资产变更监听
  useEffect(() => {
    let isMounted = true;
    spaceAssetLibraryService.loadStandardHumanLayoutAsync().then((std) => {
      if (isMounted && std) {
        setHumanLayout(std);
      }
    });

    const handleAssetsChange = () => {
      setAvailableModels(spaceAssetLibraryService.getModels());
    };

    window.addEventListener('manwah_space_assets_changed', handleAssetsChange);
    return () => {
      isMounted = false;
      window.removeEventListener('manwah_space_assets_changed', handleAssetsChange);
    };
  }, []);

  // 更新并持久化保存人物编排标准配置
  const handleUpdateHumanLayout = (next: HumanLayoutConfig) => {
    setHumanLayout(next);
    spaceAssetLibraryService.saveStandardHumanLayout(next);
  };

  // 4 候选方案字典 (按镜头 ID 与按历史版本 ID 双向索引，确保切换纯空间与人物版时底栏抽屉和画布方案精准对应)
  const [candidateBatches, setCandidateBatches] = useState<Record<string, ShotCandidateBatch>>(() => {
    return initialSnapshot?.candidateBatches || {};
  });
  const [revisionCandidateBatches, setRevisionCandidateBatches] = useState<Record<string, ShotCandidateBatch>>({});
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Record<string, string>>(() => {
    return initialSnapshot?.selectedCandidateIds || {};
  });

  // 自动将用户在生成后产生的素材、上传的产品及作业进度实时持久化到浏览器当前环境
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSaveSnapshot = useCallback(() => {
    const primaryProduct = products.find((p) => p.priority === 'primary') || products[0];
    const productName = primaryProduct?.name || '功能沙发';
    const generatedShotsCount = shots.filter((s) => s.revisions && s.revisions.length > 0).length;
    const totalRevisionsCount = shots.reduce((acc, s) => acc + (s.revisions?.length || 0), 0);

    SpaceStudioPersistenceService.saveSnapshot({
      projectId,
      title: `【摄影画册】${productName}`,
      products,
      shots,
      sceneMaster,
      candidateBatches,
      selectedCandidateIds,
      activeShotId,
      selectedSpaceId: selectedSpace?.id,
      selectedStyleId: selectedStyle?.id,
      blueprint,
      summary: {
        productName,
        productColor: primaryProduct?.colors?.[0],
        uploadedProductsCount: products.length,
        generatedShotsCount,
        hasMaster: Boolean(sceneMaster?.imageUrl),
        totalRevisionsCount
      }
    });
  }, [
    projectId,
    products,
    shots,
    sceneMaster,
    candidateBatches,
    selectedCandidateIds,
    activeShotId,
    selectedSpace,
    selectedStyle,
    blueprint
  ]);

  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      flushSaveSnapshot();
    }, 800);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [flushSaveSnapshot]);

  // 离开工作台或刷新页面时，立即强制落盘保存，杜绝 800ms 防抖尚未触发导致的进度丢失
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushSaveSnapshot();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushSaveSnapshot();
    };
  }, [flushSaveSnapshot]);

  // 初次挂载时，异步从 IndexedDB 检索更高清的无损快照并平滑增量补齐
  useEffect(() => {
    SpaceStudioPersistenceService.loadSnapshotAsync(projectId).then((asyncSnapshot) => {
      if (!asyncSnapshot) return;

      // 1. 增量补全产品的高清 base64 切片与参考图
      if (asyncSnapshot.products && asyncSnapshot.products.length > 0) {
        setProducts((prev) => {
          if (isOnlyDemoProducts(prev)) return asyncSnapshot.products;
          return prev.map((p) => {
            const asyncP = asyncSnapshot.products?.find((ap) => ap.id === p.id);
            if (asyncP) {
              return {
                ...p,
                cropBase64: p.cropBase64 || asyncP.cropBase64,
                cropImageUrl: p.cropImageUrl || asyncP.cropImageUrl,
                sourceMasterImageUrl: p.sourceMasterImageUrl || asyncP.sourceMasterImageUrl,
                referenceImages: (p.referenceImages && p.referenceImages.length > 0)
                  ? p.referenceImages.map((ref, idx) => {
                      const asyncRef = asyncP.referenceImages?.[idx];
                      return {
                        ...ref,
                        publicUrl: ref.publicUrl || asyncRef?.publicUrl,
                        objectKey: ref.objectKey || asyncRef?.objectKey || ''
                      };
                    })
                  : (asyncP.referenceImages || p.referenceImages)
              };
            }
            return p;
          });
        });
      }

      // 2. 增量补全 Shots 中被 localStorage 剥离的 imageUrl 与完整历史版本
      if (asyncSnapshot.shots && asyncSnapshot.shots.some((s) => s.revisions && s.revisions.length > 0)) {
        setShots((prev) => {
          const hasGenerations = prev.some((s) => s.revisions && s.revisions.length > 0);
          if (!hasGenerations) return asyncSnapshot.shots;

          // 若 prev 已有 revisions，但部分 revision 的 imageUrl 在 localStorage 阶段被置空，用 IndexedDB 完整还原
          return prev.map((s) => {
            const asyncShot = asyncSnapshot.shots.find((as) => as.id === s.id);
            if (!asyncShot) return s;
            return {
              ...s,
              revisions: s.revisions.map((rev) => {
                const asyncRev = asyncShot.revisions.find((ar) => ar.id === rev.id);
                if (asyncRev && asyncRev.imageUrl && (!rev.imageUrl || rev.imageUrl.trim() === '')) {
                  return { ...rev, imageUrl: asyncRev.imageUrl };
                }
                return rev;
              })
            };
          });
        });
      }

      // 3. 增量补全母版 SceneMaster 图像
      if (asyncSnapshot.sceneMaster) {
        setSceneMaster((prev) => {
          if (!prev) return asyncSnapshot.sceneMaster;
          if (!prev.imageUrl && asyncSnapshot.sceneMaster?.imageUrl) {
            return { ...prev, imageUrl: asyncSnapshot.sceneMaster.imageUrl };
          }
          return prev;
        });
      }

      // 4. 增量补全候选方案批次 CandidateBatches
      if (asyncSnapshot.candidateBatches && Object.keys(asyncSnapshot.candidateBatches).length > 0) {
        setCandidateBatches((prev) => {
          const merged = { ...asyncSnapshot.candidateBatches };
          for (const [key, batch] of Object.entries(prev)) {
            if (!merged[key]) {
              merged[key] = batch;
            } else {
              merged[key] = {
                ...merged[key],
                ...batch,
                candidates: batch.candidates.map((c) => {
                  const asyncC = merged[key].candidates.find((ac) => ac.id === c.id);
                  if (asyncC && asyncC.imageUrl && (!c.imageUrl || c.imageUrl.trim() === '')) {
                    return { ...c, imageUrl: asyncC.imageUrl };
                  }
                  return c;
                })
              };
            }
          }
          return merged;
        });
      }
    }).catch((e) => {
      console.warn('[SpaceStudioShell] loadSnapshotAsync notice:', e);
    });
  }, [projectId]);

  useEffect(() => {
    (window as any).__setCandidateBatch = (shotId: string, batch: ShotCandidateBatch) => {
      setCandidateBatches((prev) => ({ ...prev, [shotId]: batch }));
      setSelectedCandidateIds((prev) => ({ ...prev, [shotId]: batch.candidates[0].id }));
    };
  }, []);

  // 清除当前页面生成记录与开启新作业核心逻辑
  const handleClearCurrentRecords = useCallback((keepProducts: boolean = true) => {
    // 1. 重置 shots 为初始干净模版 (深度拷贝，彻底抹除 revisions 与生成状态)
    const cleanShots: ShotInstance[] = DEFAULT_SHOTS.map((s) => ({
      ...s,
      revisions: [],
      status: 'draft',
      currentRevisionId: undefined,
      hasHumanPass: false
    }));
    setShots(cleanShots);
    setActiveShotId('shot-a00');

    // 2. 清空空间母版与引用
    setSceneMaster(null);
    sceneMasterRef.current = null;

    // 3. 清空方案候选池与历史批次
    setCandidateBatches({});
    setRevisionCandidateBatches({});
    setSelectedCandidateIds({});

    // 4. 重置正在进行的任务与渲染队列
    setCurrentJob(null);
    setRenderingShotIds([]);
    setIsGeneratingAll(false);
    setIsGeneratingMaster(false);
    setIsRenderingHuman(false);
    setIsOutpainting(false);

    // 5. 若选择彻底清空，同时移除已上传产品
    let targetProducts = products;
    let targetSpace = selectedSpace;
    let targetStyle = selectedStyle;
    let targetBlueprint = blueprint;

    if (!keepProducts) {
      targetProducts = INITIAL_MANWAH_PRODUCTS;
      targetSpace = SPACE_PROTOTYPES[0];
      targetStyle = STYLE_PRESETS[0];
      targetBlueprint = PlacementEngine.generateStandardBlueprint({
        spacePreset: SPACE_PROTOTYPES[0],
        products: INITIAL_MANWAH_PRODUCTS
      });

      setProducts(targetProducts);
      setSelectedSpace(targetSpace);
      setSelectedStyle(targetStyle);
      setBlueprint(targetBlueprint);
    }

    // 6. 清理浏览器持久化存储（localStorage & IndexedDB & 活跃母版）
    SpaceStudioPersistenceService.clearActiveProjectSnapshot(projectId, { keepProducts });

    // 7. 立即落盘干净的初始快照，防止防抖定时器复写
    const primaryProduct = targetProducts.find((p) => p.priority === 'primary') || targetProducts[0];
    const productName = primaryProduct?.name || '功能沙发';

    SpaceStudioPersistenceService.saveSnapshot({
      projectId,
      title: `【摄影画册】${productName}`,
      products: targetProducts,
      shots: cleanShots,
      sceneMaster: null,
      candidateBatches: {},
      selectedCandidateIds: {},
      activeShotId: 'shot-a00',
      selectedSpaceId: targetSpace?.id,
      selectedStyleId: targetStyle?.id,
      blueprint: targetBlueprint,
      summary: {
        productName,
        productColor: primaryProduct?.colors?.[0],
        uploadedProductsCount: targetProducts.length,
        generatedShotsCount: 0,
        hasMaster: false,
        totalRevisionsCount: 0
      }
    });

    // 8. 给予明确的操作反馈
    setFeedbackNotice({
      type: 'success',
      text: keepProducts
        ? '已清空全部镜头生成记录与候选方案，已为您保留上传的产品素材。可立即开始新作业！'
        : '已彻底重置工作台，清空全部出图记录与素材，工程已恢复为全新初始状态。'
    });

    setTimeout(() => {
      setFeedbackNotice(null);
    }, 4500);
  }, [projectId, products, selectedSpace, selectedStyle, blueprint]);

  // 全局事件监听：支持外层顶栏（如 PosterStudioPage）统一触发重置弹窗或直接清除
  useEffect(() => {
    const handleOpenModal = () => setIsClearRecordsModalOpen(true);
    const handleDirectReset = (e: any) => {
      const keepProducts = e.detail?.keepProducts !== false;
      handleClearCurrentRecords(keepProducts);
    };

    window.addEventListener('space_studio_open_reset_modal', handleOpenModal);
    window.addEventListener('space_studio_reset_request', handleDirectReset);

    return () => {
      window.removeEventListener('space_studio_open_reset_modal', handleOpenModal);
      window.removeEventListener('space_studio_reset_request', handleDirectReset);
    };
  }, [handleClearCurrentRecords]);

  // 构造并保存单候选方案（纯真实结果，杜绝混入与产品无关的样板假图）
  const buildAndSetCandidateBatch = (targetShot: ShotInstance, primaryUrl: string, primaryKey?: string) => {
    const styleName = activeAssets.style?.name || '现代意式极简';
    const lighting = activeAssets.lighting || '天然通透漫射光';

    const candidates: CandidateItem[] = [
      {
        id: `cand-${targetShot.id}-1`,
        variantIndex: 1,
        imageUrl: primaryUrl,
        objectKey: primaryKey,
        summaryTag: `${styleName} · ${lighting}`,
        promptFragment: `${styleName}, 标称镜头`,
        isFavorite: false,
        createdAt: new Date().toISOString()
      }
    ];

    const batch: ShotCandidateBatch = {
      shotId: targetShot.id,
      batchId: `batch-${Date.now()}`,
      activeCandidateId: candidates[0].id,
      candidates,
      createdAt: new Date().toISOString()
    };

    setCandidateBatches(prev => ({ ...prev, [targetShot.id]: batch }));
    setSelectedCandidateIds(prev => ({ ...prev, [targetShot.id]: candidates[0].id }));
  };

  // 保持空间重生人物 (锁定当前空间与机位，生成 4 张全新人物候选)
  const handleKeepSpaceRefreshModel = () => {
    handleRenderHumanPass(activeShot);
  };

  // 替换角色重生 (轮换角色并生成 4 张全新候选)
  const handleKeepModelRefreshPose = () => {
    const models = spaceAssetLibraryService.getModels();
    if (models.length > 1) {
      setHumanLayout((prev) => {
        const rotated = prev.slots.map((s, idx) => {
          const nextM = models[(idx + 1) % models.length];
          return {
            ...s,
            modelId: nextM.id,
            modelName: nextM.nameZh || nextM.name
          };
        });
        return { ...prev, slots: rotated };
      });
    }
    handleRenderHumanPass(activeShot);
  };

  // 保持产品刷新场景
  const handleKeepProductRefreshScene = () => {
    const allStyles = spaceAssetLibraryService.getSceneStyles();
    if (allStyles.length > 0) {
      const currentIdx = allStyles.findIndex(s => s.id === activeAssets.style?.id);
      const nextStyle = allStyles[(currentIdx + 1) % allStyles.length];
      setActiveAssets(prev => ({ ...prev, style: nextStyle }));
    }
    handleRenderShot(activeShot);
  };

  // 设为当前镜头结果 (确权固化选中的候选图，并写入 ShotInstance)
  const handleApplyCandidateAsFinal = (candidate: CandidateItem) => {
    // 若当前为 A00 空间母版，同步固化全局 SceneMaster 物理基准，确保后续镜头全部继承选中的真实母版
    if (activeShot.templateCode === 'A00') {
      setSceneMaster((prev) =>
        prev
          ? {
              ...prev,
              imageUrl: candidate.imageUrl,
              objectKey: candidate.objectKey || prev.objectKey
            }
          : {
              id: `master-${selectedSpace.code.toLowerCase()}`,
              projectId: 'manwah-noble-space-01',
              objectKey: candidate.objectKey || `scene-masters/master-${selectedSpace.code.toLowerCase()}/master.webp`,
              imageUrl: candidate.imageUrl,
              isLocked: true,
              lockedAt: new Date().toISOString(),
              locks: {
                productIdentity: true,
                placement: true,
                architecture: true,
                style: true,
                material: true,
                lighting: true,
                camera: true,
                human: false
              },
              promptSnapshotId: candidate.id
            }
      );
    }

    const isHuman = Boolean(
      activeShot.hasHumanPass ||
      candidate.summaryTag?.includes('人物') ||
      candidate.summaryTag?.includes('模特') ||
      candidate.id?.includes('human')
    );
    const newRevId = `rev-${activeShot.templateCode.toLowerCase()}-${Date.now().toString(36)}`;

    // 绑定该定稿版本与当前候选批次
    const currentActiveBatch = candidateBatches[activeShot.id];
    if (currentActiveBatch) {
      setRevisionCandidateBatches(prev => ({ ...prev, [newRevId]: currentActiveBatch }));
    }

    setShots(prev =>
      prev.map(s => {
        if (s.id !== activeShot.id) return s;
        const nextRevNum = (s.revisions.length || 0) + 1;
        const newRev: ShotRevision = {
          id: newRevId,
          shotId: s.id,
          revisionNumber: nextRevNum,
          revisionType: isHuman ? 'human' : 'scene',
          label: isHuman ? `v${nextRevNum} · 人物入座方案` : `纯空间 (v${nextRevNum})`,
          objectKey: candidate.objectKey || `shots/${candidate.id}.webp`,
          imageUrl: candidate.imageUrl,
          thumbnailUrl: candidate.imageUrl,
          promptSnapshotId: candidate.id,
          status: 'approved',
          score: {
            productIdentity: 95,
            placement: 96,
            sceneContinuity: 94,
            shotIntent: 96,
            overall: 95
          },
          provenance: 'MANUAL_CONFIRMED',
          productionTruth: true,
          createdAt: new Date().toISOString()
        };
        return {
          ...s,
          status: 'passed',
          currentRevisionId: newRev.id,
          revisions: [newRev, ...s.revisions.filter(r => r.id !== newRev.id)]
        };
      })
    );
  };

  // 收藏候选图
  const handleToggleFavoriteCandidate = (candidateId: string) => {
    setCandidateBatches(prev => {
      const batch = prev[activeShot.id];
      if (!batch) return prev;
      return {
        ...prev,
        [activeShot.id]: {
          ...batch,
          candidates: batch.candidates.map(c =>
            c.id === candidateId ? { ...c, isFavorite: !c.isFavorite } : c
          )
        }
      };
    });
  };

  // AI 润色空间光影与描述
  const handleAiRefinePrompt = async () => {
    setIsRefiningPrompt(true);
    try {
      const primaryProd = products.find((p) => p.priority === 'primary') || products[0];
      const refinedText = `[AI 摄影级润色] 空间采用自然漫射落地窗柔光与隐形悬浮泛光，地平线平稳，视高115cm黄金平视角度。主品 ${primaryProd?.name || '敏华真皮沙发'} 严格保持 1:1 工业真值宽高比，材质反光细腻，彻底杜绝下沉压抑感与空天花板。`;
      setShots((prev) =>
        prev.map((s) =>
          s.id === activeShot.id
            ? {
                ...s,
                intent: {
                  ...s.intent,
                  description: `${s.intent.description || ''} ${refinedText}`.trim()
                }
              }
            : s
        )
      );
    } finally {
      setIsRefiningPrompt(false);
    }
  };

  // 渲染单个镜头候选方案 (SHOOT + 继承 A00 空间与家具世界 + 单变量 Camera DNA 驱动)
  const handleRenderShot = async (
    targetShot: ShotInstance,
    customSettings?: GenerationSettings & { candidateCount?: number },
    overrideSceneMaster?: SceneMaster
  ): Promise<{ success: boolean; sceneMaster?: SceneMaster | null; revision?: ShotRevision; error?: string }> => {
    // 渲染中防重入拦截：若同一镜头正在执行，拦截重复点击
    if (renderingShotIds.includes(targetShot.id)) {
      console.warn('[SpaceStudioShell] 该镜头正在渲染执行中，拦截重复触发:', targetShot.templateCode);
      return { success: false, error: 'ALREADY_RENDERING' };
    }

    // 为每个镜头分配独立的 AbortController，支持独立精准取消
    const controller = new AbortController();
    abortControllersRef.current.set(targetShot.id, controller);

    const timeout = setTimeout(() => {
      console.warn(`[SpaceStudioShell] 镜头 ${targetShot.templateCode} 渲染 300s 超时，触发主动超时打断`);
      controller.abort('Render timeout after 300s');
    }, 300000);
    renderTimeoutsRef.current.set(targetShot.id, timeout);

    // 将镜头加入并发队列，支持用户切换查看其他镜头
    setRenderingShotIds((prev) => Array.from(new Set([...prev, targetShot.id])));
    if (targetShot.templateCode === 'A00') {
      setIsGeneratingMaster(true);
    }

    const jobId = `job-shoot-${targetShot.templateCode.toLowerCase()}-${Date.now()}`;
    const activeSettings: GenerationSettings = {
      model: customSettings?.model || computeConfig.model,
      resolution: (customSettings as any)?.resolution || computeConfig.resolution || '2K',
      aspectRatio: (customSettings as any)?.aspectRatio || targetShot.aspectRatio || computeConfig.aspectRatio,
      autoModelFallback: (customSettings as any)?.autoModelFallback ?? computeConfig.autoModelFallback,
      ...(computeConfig.seed !== undefined ? { seed: computeConfig.seed } : {}),
      useRandomSeed: computeConfig.seed === undefined,
      ...customSettings
    };

    const initialJob: GenerationJob = {
      jobId,
      phase: 'shoot',
      targetCode: targetShot.templateCode,
      status: 'compiling',
      progress: 15,
      provider: activeSettings.model || 'gemini-nano-banana-2.1-preview',
      settings: activeSettings,
      createdAt: new Date().toISOString()
    };
    setCurrentJob(initialJob);

    // 状态置为 generating 并重置历史 error
    setShots((prev) =>
      prev.map((s) => (s.id === targetShot.id ? { ...s, status: 'generating', error: undefined } : s))
    );

    try {
      const activeEnsemble = products.filter(
        (p) => p.priority === 'primary' || p.isEnsembleIncluded !== false
      );

      const effectiveSceneMaster = overrideSceneMaster || sceneMasterRef.current || sceneMaster;

      const compiled = ShootCompiler.compileShotPrompt({
        shot: targetShot,
        sceneMaster: effectiveSceneMaster || {
          id: 'temp-master',
          projectId: 'manwah-noble-space-01',
          objectKey: '',
          isLocked: true,
          lockedAt: new Date().toISOString(),
          locks: {
            productIdentity: true,
            placement: true,
            architecture: true,
            style: true,
            material: true,
            lighting: true,
            camera: true,
            human: false
          },
          promptSnapshotId: 'rev-01'
        },
        products: activeEnsemble,
        spacePreset: selectedSpace,
        stylePreset: selectedStyle,
        blueprint,
        aspectRatio: (targetShot.aspectRatio || computeConfig.aspectRatio || '4:3') as ImageAspectRatio,
        functionalPositionState: computeConfig.functionalPositionState || 'closed'
      });

      setCurrentJob((j) => (j ? { ...j, status: 'generating', progress: 40, promptSnapshot: compiled } : null));

      // 核心工业逻辑：针对专属镜头 (A03 主焦点景, A04 2/3亲子景, A05 2/3私享景, A06 零靠墙侧景, A08 单椅五档景)，
      // 必须精准锁定关联的单独产品资产（如三人位.png、单人位.png），优先提取其独立切片/原图，绝不允许拿错单椅或大图
      const targetShotCode = targetShot.templateCode;
      const isHeroSofaDedicatedShot = ['A03', 'A04', 'A05', 'A06'].includes(targetShotCode);
      const isReclinerDedicatedShot = ['A08'].includes(targetShotCode);
      const isDiningDedicatedShot = ['A09'].includes(targetShotCode);

      const hero3SeatSofa = activeEnsemble.find(
        (p) => p.role === 'sofa_3seat' || p.role === 'sofa_2seat' || /(三人|3人|主沙发|直排)/.test(p.name || '')
      );
      const reclinerChair = activeEnsemble.find(
        (p) => p.role === 'recliner_1seat' || p.role === 'lounge_chair' || /(单人|单椅|头等舱|单机位|大师|休闲椅|扶手椅)/.test(p.name || '')
      ) || activeEnsemble.find((p) => p.priority === 'secondary' || (p.role !== 'sofa_3seat' && p.role !== 'sofa_2seat' && p.role !== 'coffee_table' && p.role !== 'dining_table'));
      const diningTableProd = activeEnsemble.find(
        (p) => p.role === 'dining_table' || p.role === 'dining_chair' || /(餐桌|餐椅|餐边柜|餐台|餐车|餐厅)/.test(p.name || '')
      );

      const primaryProd = (isHeroSofaDedicatedShot && hero3SeatSofa)
        ? hero3SeatSofa
        : (isReclinerDedicatedShot && reclinerChair)
        ? reclinerChair
        : (isDiningDedicatedShot && diningTableProd)
        ? diningTableProd
        : (activeEnsemble.find((p) => p.priority === 'primary') || activeEnsemble[0] || products[0]);

      // 提取该核心单品的独立真值资产：优先使用独立切片原图 (如 cropBase64, cropImageUrl)
      const bestPrimaryView = ShootCompiler.selectBestProductReferenceForShot(primaryProd, targetShot.templateCode);
      const primaryRef =
        primaryProd?.cropImageUrl ||
        primaryProd?.cropBase64 ||
        bestPrimaryView.reference?.publicUrl ||
        bestPrimaryView.reference?.objectKey ||
        primaryProd?.referenceImages?.[0]?.publicUrl ||
        primaryProd?.referenceImages?.[0]?.objectKey ||
        (primaryProd as any)?.uploadedImageUrl ||
        (primaryProd as any)?.referenceImage ||
        products[0]?.cropImageUrl ||
        products[0]?.cropBase64 ||
        products[0]?.referenceImages?.[0]?.publicUrl ||
        (products[0] as any)?.referenceImage;

      // 搭配品精准过滤：
      // 1. A04 / A05 / A06 (主沙发特写/侧剖)：严格剔除所有搭配品，只保留独立单品资产，确保 100% 聚焦！
      // 2. A08 (单椅功能特写)：若录入了带切片图的单椅，聚焦单椅；若单椅未切片，保留主沙发母本以自愈派生
      // 3. A03 (3人位主沙发组合焦点景)：只保留主沙发与中岛茶几，严格剔除侧边单椅！
      // 4. A09 (餐桌展示景)：若上传了餐桌，严格剔除主沙发，防止双家具冲突！
      const filteredEnsemble = activeEnsemble.filter((p) => {
        if (['A04', 'A05', 'A06'].includes(targetShotCode)) {
          return p.id === primaryProd.id;
        }
        if (targetShotCode === 'A08') {
          const hasReclinerImage = Boolean(
            reclinerChair?.cropImageUrl ||
            reclinerChair?.cropBase64 ||
            reclinerChair?.referenceImages?.[0]?.publicUrl ||
            (reclinerChair as any)?.uploadedImageUrl ||
            (reclinerChair as any)?.referenceImage
          );
          if (hasReclinerImage && reclinerChair) {
            return p.id === reclinerChair.id;
          }
          return true;
        }
        if (targetShotCode === 'A03') {
          return p.id === primaryProd.id || p.role === 'coffee_table';
        }
        if (targetShotCode === 'A09' && diningTableProd) {
          return p.role !== 'sofa_3seat' && p.role !== 'sofa_2seat';
        }
        return true;
      });

      // 调用后端 4 候选方案生成接口 (严格继承 A00 空间与家具世界，单变量改变 Camera DNA)
      const res = await fetch('/api/space/shoot/render-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          projectId: 'manwah-noble-space-01',
          shotId: targetShot.id,
          shotCode: targetShot.templateCode,
          revisionNumber: (targetShot.revisions.length || 0) + 1,
          candidateCount: (customSettings as any)?.candidateCount || (computeConfig as any).candidateCount || 1,
          resolution: activeSettings.resolution,
          autoModelFallback: activeSettings.autoModelFallback,
          roomName: selectedSpace.name.split(' (')[0],
          spaceCode: selectedSpace.code,
          styleName: selectedStyle.name.split(' (')[0],
          styleCode: selectedStyle.code,
          spacePreset: {
            id: selectedSpace.id,
            code: selectedSpace.code,
            name: selectedSpace.name,
            ceilingHeight: selectedSpace.ceilingHeight,
            signatureFeatures: selectedSpace.signatureFeatures,
            promptFragments: selectedSpace.promptFragments
          },
          stylePreset: {
            id: selectedStyle.id,
            code: selectedStyle.code,
            name: selectedStyle.name,
            colorPalette: selectedStyle.colorPalette,
            materialSystem: selectedStyle.materialSystem,
            promptFragments: selectedStyle.promptFragments
          },
          camera: compiled.cameraSpec,
          intent: targetShot.intent,
          productDNA: {
            modelNumber: primaryProd?.sku || primaryProd?.id,
            name: primaryProd?.role === 'recliner_1seat' ? 'ergonomic power motion recliner chair' : 'luxury power motion genuine leather sofa',
            leatherType: primaryProd?.materials?.[0] || '真皮',
            colorCode: primaryProd?.colors?.[0] || '标准色',
            referenceImage: primaryRef
          },
          sceneMasterReference: effectiveSceneMaster
            ? {
                objectKey: effectiveSceneMaster.objectKey,
                imageUrl: effectiveSceneMaster.imageUrl
              }
            : undefined,
          productReferenceImage: primaryRef,
          ensembleProducts: filteredEnsemble.map((p) => {
            const bestView = ShootCompiler.selectBestProductReferenceForShot(p, targetShot.templateCode);
            const refImg =
              p.cropImageUrl ||
              p.cropBase64 ||
              bestView.reference?.publicUrl ||
              bestView.reference?.objectKey ||
              p.referenceImages?.[0]?.publicUrl ||
              p.referenceImages?.[0]?.objectKey ||
              (p as any)?.uploadedImageUrl ||
              (p as any)?.referenceImage;

            return {
              id: p.id,
              sku: p.sku,
              role: p.role,
              priority: p.priority,
              name: p.name,
              color: p.colors?.[0] || '标准色',
              colors: p.colors || [],
              material: p.materials?.[0] || '真皮',
              materials: p.materials || [],
              referenceImage: refImg,
              views: {
                front: p.referenceImages?.find(r => r.type === 'front')?.publicUrl || p.referenceImages?.find(r => r.type === 'front')?.objectKey,
                '45_deg': p.referenceImages?.find(r => r.type === '45_deg')?.publicUrl || p.referenceImages?.find(r => r.type === '45_deg')?.objectKey,
                side: p.referenceImages?.find(r => r.type === 'side')?.publicUrl || p.referenceImages?.find(r => r.type === 'side')?.objectKey,
                function_open: p.referenceImages?.find(r => r.type === 'function_open')?.publicUrl || p.referenceImages?.find(r => r.type === 'function_open')?.objectKey,
                detail: p.referenceImages?.find(r => r.type === 'detail')?.publicUrl || p.referenceImages?.find(r => r.type === 'detail')?.objectKey,
              },
              matchedViewType: bestView.viewType,
              sourceMasterImageUrl: p.sourceMasterImageUrl,
              sourceBoundingBox: p.sourceBoundingBox,
              cropImageUrl: p.cropImageUrl,
              dimensions: p.dimensions,
              functionCapable: p.functionCapable
            };
          }),
          generationSettings: activeSettings,
          promptSnapshot: compiled
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || `PROVIDER UNAVAILABLE: ${res.statusText}`);
      }

      setCurrentJob((j) => (j ? { ...j, status: 'judging', progress: 85 } : null));

      const batchData: ShotCandidateBatch = data.data;
      const initialCandidate = batchData.candidates[0];

      // 若触发了自愈降级，控制台输出清晰提示
      if ((batchData as any).warningNotice) {
        console.warn('[SpaceStudioShell] 候选方案包含服务端自愈保障标记:', (batchData as any).warningNotice);
      }

      // 保存完整的 4 候选方案字典并默认激活候选 1
      setCandidateBatches((prev) => ({
        ...prev,
        [targetShot.id]: batchData
      }));
      setSelectedCandidateIds((prev) => ({
        ...prev,
        [targetShot.id]: initialCandidate.id
      }));

      // 以候选 1 建立首发 Revision，确保视口与导航缩略图即刻展示
      const parentRevId = targetShot.currentRevisionId || (targetShot.revisions.length > 0 ? targetShot.revisions[0].id : undefined);
      const nextRevNum = (targetShot.revisions.length || 0) + 1;
      const newRevision: ShotRevision = {
        id: `rev-${targetShot.templateCode.toLowerCase()}-${Date.now().toString(36)}`,
        shotId: targetShot.id,
        revisionNumber: nextRevNum,
        revisionType: 'scene',
        label: `纯空间 (v${nextRevNum})`,
        metaSummary: '空间架构与家具基准 · 纯场景母版图',
        parentRevisionId: parentRevId,
        objectKey: initialCandidate.objectKey || `shots/${initialCandidate.id}.webp`,
        imageUrl: initialCandidate.imageUrl,
        thumbnailUrl: initialCandidate.imageUrl,
        promptSnapshotId: initialCandidate.id,
        status: 'approved',
        score: {
          productIdentity: 94,
          placement: 95,
          sceneContinuity: 93,
          shotIntent: 95,
          overall: 94
        },
        provenance: 'SOLVER_RESOLVED',
        productionTruth: false,
        createdAt: new Date().toISOString()
      };

      setRevisionCandidateBatches((prev) => ({ ...prev, [newRevision.id]: batchData }));

      setShots((prev) =>
        prev.map((s) => {
          if (s.id !== targetShot.id) return s;
          return {
            ...s,
            status: 'passed',
            currentRevisionId: newRevision.id,
            revisions: [newRevision, ...s.revisions.filter((r) => r.id !== newRevision.id)]
          };
        })
      );

      let createdSceneMaster: SceneMaster | null = null;
      // 若当前渲染的是 A00 空间母版，自动初始化并锁定 SceneMaster 全局物理基准
      if (targetShot.templateCode === 'A00') {
        const sm: SceneMaster = {
          id: `master-${selectedSpace.code.toLowerCase()}`,
          projectId: 'manwah-noble-space-01',
          objectKey: initialCandidate.objectKey || `scene-masters/master-${selectedSpace.code.toLowerCase()}/master.webp`,
          imageUrl: initialCandidate.imageUrl,
          isLocked: true,
          lockedAt: new Date().toISOString(),
          locks: {
            productIdentity: true,
            placement: true,
            architecture: true,
            style: true,
            material: true,
            lighting: true,
            camera: true,
            human: false
          },
          promptSnapshotId: initialCandidate.id
        };
        sceneMasterRef.current = sm;
        setSceneMaster(sm);
        createdSceneMaster = sm;
      }

      setCurrentJob((j) => (j ? { ...j, status: 'completed', progress: 100, finishedAt: new Date().toISOString() } : null));
      return { success: true, sceneMaster: createdSceneMaster || effectiveSceneMaster, revision: newRevision };
    } catch (err: unknown) {
      const isAborted =
        (err as any)?.name === 'AbortError' ||
        (err as any)?.message?.includes('aborted') ||
        controller.signal.aborted;

      if (isAborted) {
        console.log('[SpaceStudioShell] 镜头渲染已被打断或超时中止');
        setCurrentJob(null);
        setShots((prev) =>
          prev.map((s) =>
            s.id === targetShot.id
              ? { ...s, status: s.revisions && s.revisions.length > 0 ? 'passed' : 'draft' }
              : s
          )
        );
        return { success: false, error: 'ABORTED' };
      } else {
        const errorMessage = err instanceof Error ? err.message : 'PROVIDER UNAVAILABLE / FAILED';
        console.error('Failed to render shot:', err);
        setCurrentJob((j) =>
          j
            ? {
                ...j,
                status: 'failed',
                error: errorMessage,
                progress: 100,
                finishedAt: new Date().toISOString()
              }
            : null
        );
        setShots((prev) =>
          prev.map((s) => (s.id === targetShot.id ? { ...s, status: 'failed', error: errorMessage } : s))
        );
        return { success: false, error: errorMessage };
      }
    } finally {
      const timer = renderTimeoutsRef.current.get(targetShot.id);
      if (timer) {
        clearTimeout(timer);
        renderTimeoutsRef.current.delete(targetShot.id);
      }
      abortControllersRef.current.delete(targetShot.id);
      setRenderingShotIds((prev) => prev.filter((id) => id !== targetShot.id));
      if (targetShot.templateCode === 'A00') {
        setIsGeneratingMaster(false);
      }
    }
  };

  // 摄影机 DNA 实时更新与调控
  const handleUpdateCamera = (shotId: string, updates: Partial<ShotInstance['camera']>) => {
    setShots((prev) =>
      prev.map((s) => (s.id === shotId ? { ...s, camera: { ...s.camera, ...updates } } : s))
    );
  };

  // 重置摄影机为当前镜头的推荐工业设定（并联动恢复推荐画幅）
  const handleResetCamera = (shotId: string) => {
    const defaultTemplate = STANDARD_SHOT_TEMPLATES.find((t) => t.code === activeShot.templateCode);
    if (defaultTemplate) {
      handleUpdateCamera(shotId, defaultTemplate.defaultCamera);
      if (defaultTemplate.recommendedAspectRatio) {
        handleShotAspectRatioChange(defaultTemplate.recommendedAspectRatio as ImageAspectRatio);
      }
    }
  };

  // 一键快速过审当前镜头（为 03 模特工作台解耦门禁）
  const handleQuickApproveCurrentShot = () => {
    setShots((prev) =>
      prev.map((s) => {
        if (s.id !== activeShot.id) return s;
        const currentRev = s.revisions[0];
        const validation = ValidationEngine.evaluateShot({
          shot: s,
          candidateImageKey: currentRev?.objectKey || 'approved-baseline',
          baselineMasterKey: sceneMaster?.objectKey || '',
          productDNA: products[0]
        });
        const approvedRev: ShotRevision = currentRev
          ? {
              ...currentRev,
              status: 'approved',
              validationReport: { ...validation, pass: true }
            }
          : {
              id: `rev-${s.templateCode.toLowerCase()}-init-pass`,
              shotId: s.id,
              revisionNumber: 1,
              objectKey: sceneMaster?.objectKey || 'shots/baseline-pass.webp',
              promptSnapshotId: `prompt-${s.templateCode.toLowerCase()}-baseline`,
              status: 'approved',
              validationReport: { ...validation, pass: true },
              provenance: 'MANUAL_CONFIRMED',
              productionTruth: true,
              createdAt: new Date().toISOString()
            };
        return {
          ...s,
          status: 'passed',
          currentRevisionId: approvedRev.id,
          revisions: currentRev ? [approvedRev, ...s.revisions.slice(1)] : [approvedRev]
        };
      })
    );
  };

  // 人工确权签发生产真值
  const handleConfirmProductionTruth = async (rev: ShotRevision) => {
    try {
      const res = await fetch('/api/space/shoot/confirm-production-truth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'manwah-noble-space-01',
          shotCode: activeShot.templateCode,
          revisionId: rev.id
        })
      });
      const data = await res.json();
      if (data.success) {
        setShots((prev) =>
          prev.map((s) => {
            if (s.id !== activeShot.id) return s;
            return {
              ...s,
              revisions: s.revisions.map((r) =>
                r.id === rev.id
                  ? { ...r, provenance: 'MANUAL_CONFIRMED', productionTruth: true }
                  : r
              )
            };
          })
        );
      }
    } catch (e) {
      console.error('Failed to confirm production truth:', e);
    }
  };

  // 批量渲染全部镜头 (空间母版约束流水线：A00母版优先 -> 锁定基准 -> A01~A09并发池调度)
  const handleBatchRenderAll = async () => {
    if (isGeneratingAll) {
      console.warn('[SpaceStudioShell] 批量渲染全量镜头正在执行中，拦截重复触发');
      return;
    }
    setIsGeneratingAll(true);

    try {
      const a00Shot = shots.find((s) => s.templateCode === 'A00') || shots[0];
      let currentMaster = sceneMasterRef.current || sceneMaster;
      const a00HasPassed = a00Shot && a00Shot.revisions && a00Shot.revisions.length > 0;

      // 1. 母版前置约束门禁：若当前未生成空间母版，必须第一阶段强制优先生成 A00 空间母版！
      if (!currentMaster || !a00HasPassed) {
        console.log('[SpaceStudioShell] 空间母版未就绪，一键生成流水线优先启动 A00 空间母版渲染...');
        if (!a00Shot) {
          console.error('[SpaceStudioShell] 未找到 A00 镜头配置，无法生成空间母版');
          return;
        }
        // 自动将视窗聚焦于 A00 母版
        setActiveShotId(a00Shot.id);
        const renderRes = await handleRenderShot(a00Shot);
        if (!renderRes || !renderRes.success) {
          console.error('[SpaceStudioShell] A00 空间母版渲染失败，已安全终止后续批量流程');
          return;
        }
        currentMaster = renderRes.sceneMaster || sceneMasterRef.current;
      }

      if (!currentMaster) {
        console.error('[SpaceStudioShell] 无法获取有效的空间母版基准，终止批量衍生镜头生成');
        return;
      }

      // 2. 母版已确立并锁定，继续调度后续衍生镜头 (A01~A09)
      // 筛选所有未出图或非生成态的衍生镜头
      const candidateShots = shots.filter(
        (s) => s.templateCode !== 'A00' && s.status !== 'generating' && (!s.revisions || s.revisions.length === 0)
      );
      if (candidateShots.length === 0) {
        console.log('[SpaceStudioShell] 所有衍生镜头均已有方案或正在渲染，无需重复生成');
        return;
      }

      const concurrency = 2; // 自适应平滑并发，防止瞬间并发过高打穿上游限流
      const queue = [...candidateShots];
      const executing: Promise<any>[] = [];

      for (const shot of queue) {
        const renderWithRetry = async () => {
          let res = await handleRenderShot(shot, undefined, currentMaster);
          if (!res || !res.success) {
            console.warn(`[SpaceStudioShell] 镜头 ${shot.templateCode} 首次渲染未完成，启动退避重试 (1.5s 后)...`);
            await new Promise((resolve) => setTimeout(resolve, 1500));
            res = await handleRenderShot(shot, undefined, currentMaster);
          }
          return res;
        };

        const p = renderWithRetry().then(() => {
          const idx = executing.indexOf(p);
          if (idx !== -1) executing.splice(idx, 1);
        });
        executing.push(p);
        if (executing.length >= concurrency) {
          await Promise.race(executing);
        }
      }
      await Promise.all(executing);
    } catch (err) {
      console.error('[SpaceStudioShell] 批量生成全部分镜失败:', err);
    } finally {
      setIsGeneratingAll(false);
    }
  };

  // 增加定制新镜头 (A09+)
  const handleAddCustomShot = () => {
    const nextIndex = shots.length;
    const nextCode = nextIndex < 10 ? `A0${nextIndex}` : `A${nextIndex}`;
    const newShot: ShotInstance = {
      id: `shot-${nextCode.toLowerCase()}-${Date.now()}`,
      templateCode: nextCode,
      name: `定制空间视角 (${nextCode})`,
      intent: {
        intentCode: 'SI-01',
        name: '高定视角聚焦 (Custom Focus)',
        productDominancePct: 55,
        backgroundSuppression: 'medium',
        maxOcclusionPct: 10,
        description: '高定室内镜头，强调光影与家具空间层次'
      },
      camera: {
        lensMm: 35,
        heightCm: 130,
        yawDeg: 15,
        pitchDeg: -2,
        rollDeg: 0,
        target: { type: 'product', id: 'primary_sofa' },
        framing: 'product',
        mustInclude: ['primary_sofa', 'architectural_light'],
        mustExclude: ['clutter']
      },
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };

    setShots((prev) => [...prev, newShot]);
    setActiveShotId(newShot.id);
  };

  // 03 HUMAN 阶段：基于当前镜头生成人物版 (锁空间、锁产品、锁家具摆位、锁风格、锁 Camera，只新增人物)
  const handleRenderHumanPass = async (targetShot: ShotInstance = activeShot) => {
    if (isRenderingHuman) {
      console.warn('[SpaceStudioShell] 人物合成正在执行中，拦截重复触发');
      return;
    }
    setIsRenderingHuman(true);
    const controller = new AbortController();
    abortControllersRef.current.set(targetShot.id, controller);

    const timeout = setTimeout(() => {
      console.warn(`[SpaceStudioShell] 镜头 ${targetShot.templateCode} 人物渲染 300s 超时，触发主动超时打断`);
      controller.abort('Human pass timeout after 300s');
    }, 300000);
    renderTimeoutsRef.current.set(targetShot.id, timeout);
    setRenderingShotIds((prev) => Array.from(new Set([...prev, targetShot.id])));

    const jobId = `job-human-${Date.now()}`;
    const activeSettings: GenerationSettings = {
      model: computeConfig.model,
      resolution: computeConfig.resolution,
      aspectRatio: aspectRatio,
      seed: computeConfig.seed,
      useRandomSeed: computeConfig.seed === undefined
    };

    const initialJob: GenerationJob = {
      jobId,
      phase: 'shoot',
      targetCode: targetShot.templateCode,
      status: 'compiling',
      progress: 15,
      provider: activeSettings.model || 'gemini-nano-banana-2.1-preview',
      settings: activeSettings,
      createdAt: new Date().toISOString()
    };
    setCurrentJob(initialJob);

    try {
      const allModels = spaceAssetLibraryService.getModels();
      setAvailableModels(allModels);
      const compiledHuman = spaceAssetLibraryService.compileHumanLayoutPrompt(humanLayout, allModels);

      const activeEnsemble = products.filter(
        (p) => p.priority === 'primary' || p.isEnsembleIncluded !== false
      );

      const baseCompiled = ShootCompiler.compileShotPrompt({
        shot: targetShot,
        sceneMaster: sceneMaster || {
          id: 'temp-master',
          projectId: 'manwah-noble-space-01',
          objectKey: '',
          isLocked: true,
          lockedAt: new Date().toISOString(),
          locks: {
            productIdentity: true,
            placement: true,
            architecture: true,
            style: true,
            material: true,
            lighting: true,
            camera: true,
            human: false
          },
          promptSnapshotId: 'rev-01'
        },
        products: activeEnsemble,
        spacePreset: selectedSpace,
        stylePreset: selectedStyle,
        blueprint,
        aspectRatio: (targetShot.aspectRatio || computeConfig.aspectRatio || '4:3') as ImageAspectRatio
      });

      setCurrentJob((j) => (j ? { ...j, status: 'generating', progress: 40 } : null));

      const primaryProd =
        activeEnsemble.find((p) => p.priority === 'primary') || activeEnsemble[0] || products[0];
      const primaryRef =
        primaryProd?.cropImageUrl ||
        primaryProd?.cropBase64 ||
        primaryProd?.referenceImages?.[0]?.publicUrl ||
        primaryProd?.referenceImages?.[0]?.objectKey ||
        (primaryProd as any)?.uploadedImageUrl ||
        (primaryProd as any)?.referenceImage ||
        products[0]?.cropImageUrl ||
        products[0]?.cropBase64 ||
        products[0]?.referenceImages?.[0]?.publicUrl ||
        (products[0] as any)?.referenceImage;

      // 获取当前机位的底图基准（若未生成母版，自动使用当前风格或户型资产作为高可靠视觉基准）
      const currentRev = targetShot.revisions.find((r) => r.id === targetShot.currentRevisionId) || targetShot.revisions[0];
      const baseShotImage = currentRev?.imageUrl || 
        (targetShot.templateCode === 'A00' ? sceneMaster?.imageUrl : undefined) || 
        sceneMaster?.imageUrl ||
        activeAssets.style?.thumbnail ||
        activeAssets.style?.coverImage ||
        'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85';

      const activeSettings = {
        model: computeConfig.model,
        resolution: computeConfig.resolution,
        aspectRatio: (targetShot.aspectRatio || aspectRatio || '4:3') as ImageAspectRatio,
        seed: computeConfig.seed
      };

      const res = await fetch('/api/space/shoot/render-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          projectId: 'manwah-noble-space-01',
          shotId: targetShot.id,
          shotCode: targetShot.templateCode,
          revisionNumber: (targetShot.revisions.length || 0) + 1,
          candidateCount: 1,
          isHumanPass: true,
          roomName: selectedSpace.name.split(' (')[0],
          spaceCode: selectedSpace.code,
          styleName: selectedStyle.name.split(' (')[0],
          styleCode: selectedStyle.code,
          spacePreset: {
            id: selectedSpace.id,
            code: selectedSpace.code,
            name: selectedSpace.name,
            ceilingHeight: selectedSpace.ceilingHeight,
            signatureFeatures: selectedSpace.signatureFeatures,
            promptFragments: selectedSpace.promptFragments
          },
          stylePreset: {
            id: selectedStyle.id,
            code: selectedStyle.code,
            name: selectedStyle.name,
            colorPalette: selectedStyle.colorPalette,
            materialSystem: selectedStyle.materialSystem,
            promptFragments: selectedStyle.promptFragments
          },
          baseShotReferenceImage: baseShotImage,
          currentShotReferenceImage: baseShotImage,
          humanLayout,
          selectedModels: (() => {
            const assignedIds = humanLayout.slots.map(s => s.modelId).filter(Boolean) as string[];
            const matched = assignedIds.map(id => allModels.find(m => m.id === id)).filter(Boolean) as ModelAsset[];
            return matched.length > 0 ? matched : allModels.slice(0, humanLayout.characterCount);
          })(),
          characterReferenceImages: (() => {
            const assignedIds = humanLayout.slots.map(s => s.modelId).filter(Boolean) as string[];
            const matched = assignedIds.map(id => allModels.find(m => m.id === id)).filter(Boolean) as ModelAsset[];
            const targetList = matched.length > 0 ? matched : allModels.slice(0, humanLayout.characterCount);
            return targetList
              .map((m) => ({
                modelId: m.id,
                name: m.nameZh || m.name,
                imageUrl: m.views?.portrait || m.views?.front || m.thumbnail || m.coverImage,
                role: 'person_reference'
              }))
              .filter((c) => Boolean(c.imageUrl));
          })(),
          camera: targetShot.camera,
          intent: targetShot.intent,
          productDNA: {
            modelNumber: primaryProd?.sku || primaryProd?.id,
            name: primaryProd?.role === 'recliner_1seat' ? 'ergonomic power motion recliner chair' : 'luxury power motion genuine leather sofa',
            leatherType: primaryProd?.materials?.[0] || '真皮',
            colorCode: primaryProd?.colors?.[0] || '标准色',
            referenceImage: primaryRef
          },
          sceneMasterReference: sceneMaster
            ? {
                objectKey: sceneMaster.objectKey,
                imageUrl: sceneMaster.imageUrl
              }
            : undefined,
          productReferenceImage: primaryRef,
          ensembleProducts: activeEnsemble.map((p) => ({
            id: p.id,
            sku: p.sku,
            role: p.role,
            priority: p.priority,
            name: p.name,
            color: p.colors?.[0] || '标准色',
            colors: p.colors || [],
            material: p.materials?.[0] || '真皮',
            materials: p.materials || [],
            referenceImage: p.referenceImages?.[0]?.publicUrl || p.referenceImages?.[0]?.objectKey || (p as any)?.uploadedImageUrl,
            dimensions: p.dimensions,
            functionCapable: p.functionCapable
          })),
          generationSettings: activeSettings,
          promptSnapshot: {
            ...baseCompiled,
            positivePrompt: `${compiledHuman.positivePrompt}, ${baseCompiled.positivePrompt}`,
            negativePrompt: `${compiledHuman.negativePrompt}, text, watermark, logo, font, writing, letters, chinese characters, labels, annotations, captions`,
            isHumanPass: true
          }
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || `FAILED: ${res.statusText}`);
      }

      setCurrentJob((j) => (j ? { ...j, status: 'judging', progress: 85 } : null));

      const batchData: ShotCandidateBatch = data.data;
      const initialCandidate = batchData.candidates[0];

      setCandidateBatches((prev) => ({
        ...prev,
        [targetShot.id]: batchData
      }));
      setSelectedCandidateIds((prev) => ({
        ...prev,
        [targetShot.id]: initialCandidate.id
      }));

      // 1. 如果当前镜头还没有任何基础场景 Revision，将先前的基准底图自动归档为 v1 空间家具纯场景
      const existingRevs = [...targetShot.revisions];
      if (existingRevs.length === 0 && baseShotImage) {
        const baseRevId = `rev-${targetShot.templateCode.toLowerCase()}-base-${Date.now().toString(36)}`;
        existingRevs.push({
          id: baseRevId,
          shotId: targetShot.id,
          revisionNumber: 1,
          objectKey: sceneMaster?.objectKey || `shots/${targetShot.templateCode.toLowerCase()}/base.webp`,
          imageUrl: baseShotImage,
          thumbnailUrl: baseShotImage,
          promptSnapshotId: 'base-spatial-ground-truth',
          status: 'approved',
          revisionType: 'scene',
          label: 'v1 · 空间家具纯场景',
          metaSummary: '空间硬装与沙发骨架基准 (无人物)',
          score: {
            productIdentity: 98,
            placement: 98,
            sceneContinuity: 98,
            shotIntent: 98,
            overall: 98
          },
          provenance: 'PROVIDED',
          productionTruth: true,
          createdAt: new Date(Date.now() - 60000).toISOString()
        });
      }

      // 2. 以候选 1 建立新一代人物版 Revision (v2 或递增版本)
      const nextRevNum = existingRevs.length + 1;
      const parentRevId = targetShot.currentRevisionId || (existingRevs.length > 0 ? existingRevs[0].id : undefined);
      const newRevision: ShotRevision = {
        id: `rev-${targetShot.templateCode.toLowerCase()}-human-${Date.now().toString(36)}`,
        shotId: targetShot.id,
        revisionNumber: nextRevNum,
        parentRevisionId: parentRevId,
        objectKey: initialCandidate.objectKey || `shots/${initialCandidate.id}.webp`,
        imageUrl: initialCandidate.imageUrl,
        thumbnailUrl: initialCandidate.imageUrl,
        promptSnapshotId: initialCandidate.id,
        status: 'approved',
        revisionType: 'human',
        label: `v${nextRevNum} · ${humanLayout.characterCount}人模特入座方案`,
        metaSummary: `模特自然落座 · 零形变商用精修`,
        score: {
          productIdentity: 96,
          placement: 97,
          sceneContinuity: 95,
          shotIntent: 97,
          overall: 96
        },
        provenance: 'DERIVED',
        productionTruth: false,
        createdAt: new Date().toISOString()
      };

      setRevisionCandidateBatches((prev) => ({ ...prev, [newRevision.id]: batchData }));

      setShots((prev) =>
        prev.map((s) => {
          if (s.id !== targetShot.id) return s;
          const mergedRevisions = [newRevision, ...existingRevs.filter((r) => r.id !== newRevision.id)];
          return {
            ...s,
            status: 'passed',
            hasHumanPass: true,
            currentRevisionId: newRevision.id,
            revisions: mergedRevisions
          };
        })
      );

      setCurrentJob((j) => (j ? { ...j, status: 'completed', progress: 100, finishedAt: new Date().toISOString() } : null));
    } catch (err: unknown) {
      const isAborted =
        (err as any)?.name === 'AbortError' ||
        (err as any)?.message?.includes('aborted') ||
        controller.signal.aborted;

      if (isAborted) {
        console.log('[SpaceStudioShell] 人物版合成任务已被打断或超时中止');
        setCurrentJob(null);
      } else {
        const errorMessage = err instanceof Error ? err.message : 'FAILED';
        console.error('Failed to render human pass candidates:', err);
        alert(`生成人物版方案提示: ${errorMessage}`);
        setCurrentJob((j) =>
          j
            ? {
                ...j,
                status: 'failed',
                error: errorMessage,
                progress: 100,
                finishedAt: new Date().toISOString()
              }
            : null
        );
      }
    } finally {
      const timer = renderTimeoutsRef.current.get(targetShot.id);
      if (timer) {
        clearTimeout(timer);
        renderTimeoutsRef.current.delete(targetShot.id);
      }
      abortControllersRef.current.delete(targetShot.id);
      setRenderingShotIds((prev) => prev.filter((id) => id !== targetShot.id));
      setIsRenderingHuman(false);
    }
  };

  // 智能扩图处理管线：四周外扩、左右延展、上下拉高，生成新全景 Revision
  const handleOutpaintShot = async (params: OutpaintParams) => {
    const targetShot = activeShot;
    if (isOutpainting || isRenderingShot) {
      console.warn('[SpaceStudioShell] 扩图或生图任务正在执行中，拦截重复触发');
      return;
    }

    setIsOutpainting(true);
    const controller = new AbortController();
    abortControllersRef.current.set(targetShot.id, controller);

    const timeout = setTimeout(() => {
      console.warn('[SpaceStudioShell] 扩图 180s 超时，触发主动超时打断');
      controller.abort('Outpaint timeout after 180s');
    }, 180000);
    renderTimeoutsRef.current.set(targetShot.id, timeout);
    setRenderingShotIds((prev) => Array.from(new Set([...prev, targetShot.id])));

    const jobId = `job-outpaint-${targetShot.templateCode.toLowerCase()}-${Date.now()}`;
    const initialJob: GenerationJob = {
      jobId,
      phase: 'shoot',
      targetCode: targetShot.templateCode,
      status: 'generating',
      progress: 30,
      provider: computeConfig.model || 'gemini-nano-banana-2.1-preview',
      settings: {
        model: computeConfig.model,
        resolution: computeConfig.resolution,
        aspectRatio: params.targetAspectRatio,
        useRandomSeed: true
      },
      createdAt: new Date().toISOString()
    };
    setCurrentJob(initialJob);

    try {
      const res = await fetch('/api/space/shoot/outpaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          projectId: 'manwah-noble-space-01',
          shotId: targetShot.id,
          shotCode: targetShot.templateCode,
          baseRevisionId: targetShot.currentRevisionId,
          paddedImage: params.paddedImageDataUrl,
          maskImage: params.maskDataUrl,
          outpaintMode: params.mode,
          scale: params.scale,
          promptSupplement: params.promptSupplement,
          roomName: selectedSpace.name.split(' (')[0],
          styleName: selectedStyle.name.split(' (')[0],
          preferredModel: computeConfig.model || 'gemini-nano-banana-2.1-preview',
          aspectRatio: params.targetAspectRatio,
          resolution: computeConfig.resolution || '2K',
          originalScenePrompt: currentPositivePrompt,
          productName: primaryProductForCanvas?.name,
          productMaterial: primaryProductForCanvas?.materials?.[0] || (primaryProductForCanvas as any)?.materialDescription,
          productColor: (primaryProductForCanvas as any)?.color || primaryProductForCanvas?.colors?.[0],
          cameraSettings: targetShot.camera
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        const errorMsg =
          data.error?.message ||
          (typeof data.error === 'string' ? data.error : '') ||
          data.message ||
          '智能扩图生成失败';
        throw new Error(errorMsg);
      }

      const nextRevNum = (targetShot.revisions.length || 0) + 1;
      const newRevision: ShotRevision = {
        id: data.data.revisionId,
        shotId: targetShot.id,
        revisionNumber: nextRevNum,
        revisionType: 'scene',
        label: data.data.label || `扩图 (${params.scale}x) v${nextRevNum}`,
        metaSummary: data.data.metaSummary || `视野向四周延展 ${params.scale}x · 保留主沙发与摆位`,
        parentRevisionId: targetShot.currentRevisionId,
        objectKey: data.data.objectKey,
        imageUrl: data.data.imageUrl,
        thumbnailUrl: data.data.imageUrl,
        promptSnapshotId: `outpaint-${data.data.revisionId}`,
        status: 'approved',
        score: {
          productIdentity: 96,
          placement: 96,
          sceneContinuity: 95,
          shotIntent: 96,
          overall: 96
        },
        provenance: 'SOLVER_RESOLVED',
        productionTruth: false,
        createdAt: new Date().toISOString()
      };

      setShots((prev) =>
        prev.map((s) => {
          if (s.id !== targetShot.id) return s;
          return {
            ...s,
            status: 'passed',
            currentRevisionId: newRevision.id,
            revisions: [newRevision, ...s.revisions.filter((r) => r.id !== newRevision.id)]
          };
        })
      );

      // 若扩图的是 A00 空间母版，同步更新母版图
      if (targetShot.templateCode === 'A00') {
        setSceneMaster((prev) =>
          prev
            ? {
                ...prev,
                imageUrl: data.data.imageUrl,
                objectKey: data.data.objectKey
              }
            : null
        );
      }

      setCurrentJob((j) => (j ? { ...j, status: 'completed', progress: 100, finishedAt: new Date().toISOString() } : null));
    } catch (err: unknown) {
      const isAborted =
        (err as any)?.name === 'AbortError' ||
        (err as any)?.name === 'TimeoutError' ||
        (err as any)?.message?.includes('aborted') ||
        controller.signal.aborted;

      if (isAborted) {
        console.log('[SpaceStudioShell] 扩图任务已被打断或超时中止');
        setCurrentJob(null);
      } else {
        const errorMessage =
          err instanceof Error
            ? err.message
            : typeof err === 'object' && err !== null && 'message' in err
            ? (err as any).message
            : typeof err === 'string'
            ? err
            : '智能扩图生成失败，请重试';
        console.error('Failed to outpaint shot:', err);
        alert(`智能扩图提示: ${errorMessage}`);
        setCurrentJob((j) =>
          j
            ? {
                ...j,
                status: 'failed',
                error: errorMessage,
                progress: 100,
                finishedAt: new Date().toISOString()
              }
            : null
        );
      }
    } finally {
      const timer = renderTimeoutsRef.current.get(targetShot.id);
      if (timer) {
        clearTimeout(timer);
        renderTimeoutsRef.current.delete(targetShot.id);
      }
      abortControllersRef.current.delete(targetShot.id);
      setRenderingShotIds((prev) => prev.filter((id) => id !== targetShot.id));
      setIsOutpainting(false);
    }
  };

  // 镜头历史生成版本快速切换与选择 (让同一个镜头多版本在中心画布与底栏秒级响应)
  const handleSelectRevision = (shotId: string, revisionId: string) => {
    setShots((prev) =>
      prev.map((s) => {
        if (s.id !== shotId) return s;
        const targetRev = s.revisions.find((r) => r.id === revisionId);
        if (!targetRev) return s;
        const isHuman = Boolean(
          targetRev.revisionType === 'human' ||
          targetRev.id.includes('human') ||
          targetRev.label?.includes('模特') ||
          targetRev.label?.includes('人物')
        );
        return {
          ...s,
          currentRevisionId: revisionId,
          hasHumanPass: isHuman
        };
      })
    );

    // 同步切换选中的候选 ID：若该版本有专属匹配批次，优先匹配该批次首选项；若无专属批次，清空候选选中态，使画布强制展示定稿大图！
    if (revisionCandidateBatches[revisionId]?.candidates?.[0]) {
      setSelectedCandidateIds((prev) => ({
        ...prev,
        [shotId]: revisionCandidateBatches[revisionId].candidates[0].id
      }));
    } else {
      setSelectedCandidateIds((prev) => {
        const next = { ...prev };
        delete next[shotId];
        return next;
      });
    }

    // 若切换的是 A00 空间母版的版本，同步更新全局 SceneMaster 物理基准，确保后续镜头继承选中的特定母版
    const targetShot = shots.find((s) => s.id === shotId);
    if (targetShot?.templateCode === 'A00') {
      const selectedRev = targetShot.revisions.find((r) => r.id === revisionId);
      if (selectedRev) {
        setSceneMaster((prev) => {
          const updated: SceneMaster = prev
            ? { ...prev, imageUrl: selectedRev.imageUrl || prev.imageUrl, objectKey: selectedRev.objectKey || prev.objectKey }
            : {
                id: `master-${selectedSpace.code.toLowerCase()}`,
                projectId: 'manwah-noble-space-01',
                objectKey: selectedRev.objectKey || `scene-masters/master-${selectedSpace.code.toLowerCase()}/master.webp`,
                imageUrl: selectedRev.imageUrl,
                isLocked: true,
                lockedAt: new Date().toISOString(),
                locks: {
                  productIdentity: true,
                  placement: true,
                  architecture: true,
                  style: true,
                  material: true,
                  lighting: true,
                  camera: true,
                  human: false
                },
                promptSnapshotId: selectedRev.id
              };
          sceneMasterRef.current = updated;
          return updated;
        });
      }
    }
  };

  // 清除指定镜头的全部生成画面结果（恢复未出图状态）
  const handleClearShotImage = useCallback((shotId: string) => {
    setShots((prev) =>
      prev.map((s) => {
        if (s.id !== shotId) return s;
        if (s.templateCode === 'A00') {
          setSceneMaster(null);
          sceneMasterRef.current = null;
          if (typeof window !== 'undefined') {
            localStorage.removeItem('manwah_space_active_master');
          }
        }
        return {
          ...s,
          currentRevisionId: undefined,
          hasHumanPass: false,
          status: 'draft',
          revisions: []
        };
      })
    );

    // 同步清空该镜头的候选方案
    setCandidateBatches((prev) => {
      const copy = { ...prev };
      delete copy[shotId];
      return copy;
    });
    setSelectedCandidateIds((prev) => {
      const copy = { ...prev };
      delete copy[shotId];
      return copy;
    });

    setFeedbackNotice({
      type: 'info',
      text: '已清除该镜头的生成画面结果，画面已恢复为待出图状态。'
    });
    setTimeout(() => setFeedbackNotice(null), 3000);
  }, []);

  // 删除指定的镜头历史生成版本（允许删除最后一个版本恢复未渲染状态）
  const handleDeleteRevision = useCallback((shotId: string, revisionId: string) => {
    setShots((prev) =>
      prev.map((s) => {
        if (s.id !== shotId) return s;
        const remaining = s.revisions.filter((r) => r.id !== revisionId);
        if (remaining.length === 0) {
          if (s.templateCode === 'A00') {
            setSceneMaster(null);
            sceneMasterRef.current = null;
            if (typeof window !== 'undefined') {
              localStorage.removeItem('manwah_space_active_master');
            }
          }
          return {
            ...s,
            currentRevisionId: undefined,
            hasHumanPass: false,
            status: 'draft',
            revisions: []
          };
        }
        const nextCurrentId = s.currentRevisionId === revisionId ? remaining[0].id : s.currentRevisionId;
        const currentRev = remaining.find((r) => r.id === nextCurrentId);
        const isHuman = currentRev?.revisionType === 'human' || currentRev?.id.includes('human');
        return {
          ...s,
          currentRevisionId: nextCurrentId,
          hasHumanPass: isHuman,
          revisions: remaining
        };
      })
    );
  }, []);

  // 户型切换联动：自动重新适配空间蓝图并保持固定
  const handleSelectSpace = (space: SpacePreset) => {
    setSelectedSpace(space);
    setBlueprint(
      PlacementEngine.generateStandardBlueprint({
        spacePreset: space,
        products
      })
    );
  };

  // 切换蓝图锁定
  const handleToggleLockBlueprint = () => {
    setBlueprint((prev) => ({
      ...prev,
      isLocked: !prev.isLocked
    }));
  };

  // 生成并锁定 A00 空间母版（直接驱动真实 4 候选方案生成管线，彻底告别样板假图）
  const handleGenerateSceneMaster = async () => {
    setIsGeneratingMaster(true);
    try {
      const a00Shot = shots.find((s) => s.templateCode === 'A00') || shots[0];
      await handleRenderShot(a00Shot);
    } catch (e) {
      console.error('Failed to generate scene master candidates:', e);
    } finally {
      setIsGeneratingMaster(false);
    }
  };

  // 风格资产直接设为空间母版（免二次生成，100%保留原图大视野与开阔感）
  const handleApplyStyleAsSceneMasterDirectly = (style: SceneStyleAsset) => {
    if (!style) return;

    // 1. 设置当前活跃空间风格
    setActiveAssets((prev) => ({ ...prev, style }));

    // 2. 提取该风格的高清母版实景图（优先封面/缩略图/首张参考图）
    const masterImageUrl = style.coverImage || style.thumbnail || style.referenceImages?.[0] || '';
    if (!masterImageUrl) return;

    const a00Shot = shots.find((s) => s.templateCode === 'A00') || shots[0];

    // 3. 构建规范化的 SceneMaster 对象并立即加锁，彻底杜绝多余的后台重新生成
    const newMaster: SceneMaster = {
      id: `master-${style.id || Date.now()}`,
      projectId: 'manwah-noble-space-01',
      objectKey: `styles/${style.id || 'custom'}/master.webp`,
      imageUrl: masterImageUrl,
      isLocked: true,
      lockedAt: new Date().toISOString(),
      aspectRatio: (computeConfig.aspectRatio || '4:3') as any,
      locks: {
        productIdentity: true,
        placement: true,
        architecture: true,
        style: true,
        material: true,
        lighting: true,
        camera: true,
        human: false
      },
      promptSnapshotId: `style-snapshot-${style.id || Date.now()}`
    };

    setSceneMaster(newMaster);

    // 4. 将该大图直接设为 A00 镜头的候选方案，立即在画布中以 100% 原始大视野无裁切呈现！
    buildAndSetCandidateBatch(a00Shot, masterImageUrl, newMaster.objectKey);

    // 5. 更新 A00 镜头状态为已通过，导航缩略图同步为该大图
    setShots((prev) =>
      prev.map((s) => {
        if (s.templateCode === 'A00') {
          const revId = `rev-master-${Date.now()}`;
          const newRevision: ShotRevision = {
            id: revId,
            shotId: s.id,
            revisionNumber: (s.revisions.length || 0) + 1,
            objectKey: newMaster.objectKey,
            imageUrl: masterImageUrl,
            thumbnailUrl: masterImageUrl,
            promptSnapshotId: newMaster.promptSnapshotId,
            status: 'approved',
            provenance: 'MANUAL_CONFIRMED',
            productionTruth: true,
            createdAt: new Date().toISOString()
          };
          return {
            ...s,
            status: 'passed',
            currentRevisionId: revId,
            thumbnailUrl: masterImageUrl,
            revisions: [newRevision, ...s.revisions]
          };
        }
        return s;
      })
    );

    // 6. 切换当前活跃镜头至 A00 空间母版
    setActiveShotId(a00Shot.id);

    // 7. 持久化存盘
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('manwah_space_active_master', JSON.stringify(newMaster));
      }
    } catch (e) {
      console.warn('saveSceneMaster notice:', e);
    }
  };

  // 风格资产库一键跳转：直接绑定新风格并设为空间母版（避免二次生成）
  const handleApplyStyleAndGenerateMaster = (style: SceneStyleAsset) => {
    handleApplyStyleAsSceneMasterDirectly(style);
  };

  // 衔接进入 Poster Studio 营销排版
  const handleHandoffToPoster = (targetScreenIndex?: number, customTemplateId?: TemplateId) => {
    const screenItem = SpaceToPosterAdapter.convertShotToScreenItem({
      shot: activeShot,
      product: products[0],
      spacePreset: selectedSpace,
      screenIndex: targetScreenIndex
    });
    if (customTemplateId) {
      screenItem.templateId = customTemplateId;
    }

    if (!screenItem.sourceImageUrl && activeShot.templateCode === 'A00' && sceneMaster?.imageUrl) {
      screenItem.sourceImageUrl = sceneMaster.imageUrl;
      screenItem.status = 'approved';
    }

    if (onHandoffToPoster) {
      onHandoffToPoster(screenItem);
    } else {
      // 回退直接切换模式
      onSwitchMode('poster');
    }
  };

  return (
    <div
      className={`flex-1 flex flex-col h-full overflow-hidden select-none font-sans relative transition-colors ${
        theme === 'light' ? 'bg-[#F2EFE9] text-stone-900' : 'bg-stone-950 text-stone-100'
      }`}
    >
      {/* Top Main Work Area: Left Drawer + Center Canvas + Right Control Panel */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 1. Left Drawer with Icon Dock + Collapsible Sub-panel */}
        <SpaceStudioLeftDrawer
          spaces={SPACE_PROTOTYPES}
          selectedSpace={selectedSpace}
          onSelectSpace={handleSelectSpace}
          styles={STYLE_PRESETS}
          selectedStyle={selectedStyle}
          onSelectStyle={setSelectedStyle}
          products={products}
          onSyncFromCanvas={handleSyncFromCanvas}
          onOpenUploadModal={handleOpenUploadModal}
          onAddProduct={handleAddProduct}
          onBatchAddProducts={handleBatchSaveProductsFromModal}
          onUpdateProduct={handleUpdateProduct}
          onRemoveProduct={handleRemoveProduct}
          onSetPrimaryProduct={handleSetPrimaryProduct}
          onToggleEnsembleInclude={handleToggleEnsembleInclude}
          onBatchToggleEnsemble={handleBatchToggleEnsemble}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          shots={shots}
          activeShotIndex={shots.findIndex((s) => s.id === activeShot.id)}
          onSelectShot={(idx) => setActiveShotId(shots[idx].id)}
          drawerWidth={leftDrawerWidth}
          isCollapsed={isLeftCollapsed}
          onToggleCollapse={() => setIsLeftCollapsed(!isLeftCollapsed)}
        />

        {/* Left Resizer Handle */}
        {!isLeftCollapsed && (
          <div
            onMouseDown={handleStartResizeLeft}
            className={`relative w-2 -mx-1 cursor-col-resize z-30 group transition-all shrink-0 flex items-center justify-center ${
              theme === 'light' ? 'hover:bg-amber-400/20' : 'hover:bg-amber-500/20'
            }`}
            title="按住鼠标左右拖拽调节左侧栏宽度，双击折叠"
            onDoubleClick={() => setIsLeftCollapsed(true)}
          >
            <div className={`w-0.5 h-10 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${
              theme === 'light' ? 'bg-amber-500' : 'bg-amber-400'
            }`} />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsLeftCollapsed(true);
              }}
              className={`absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-4 h-8 rounded-r-md border border-l-0 shadow-xs opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all cursor-pointer z-40 ${
                theme === 'light'
                  ? 'bg-white border-stone-300 text-stone-600 hover:text-amber-700 hover:bg-stone-50'
                  : 'bg-stone-800 border-stone-700 text-stone-300 hover:text-amber-400 hover:bg-stone-700'
              }`}
              title="一键收起左侧面板"
            >
              <ChevronLeft className="w-3 h-3 -ml-0.5" />
            </button>
          </div>
        )}

        {/* 2. Center Cinematic Canvas Stage */}
        <SpaceStudioCanvas
          activeShot={activeShot}
          sceneMaster={sceneMaster}
          aspectRatio={aspectRatio}
          onChangeAspectRatio={handleShotAspectRatioChange}
          resolution={computeConfig.resolution || '2K'}
          onChangeResolution={(res) => handleUpdateComputeConfig({ resolution: res })}
          isGenerating={isGeneratingCurrentShot || (isRenderingHuman && renderingShotIds.includes(activeShot.id)) || isOutpainting}
          onCancelRendering={() => handleCancelRendering(activeShot.id)}
          renderingShotCode={renderingShotCode}
          onOutpaint={handleOutpaintShot}
          isOutpainting={isOutpainting}
          stylePreset={selectedStyle}
          spacePreset={selectedSpace}
          styleName={selectedStyle.name.split(' (')[0]}
          roomName={selectedSpace.name.split(' (')[0]}
          productName={primaryProductForCanvas?.name}
          productMaterial={primaryProductForCanvas?.materials?.[0] || (primaryProductForCanvas as any)?.materialDescription}
          currentPositivePrompt={currentPositivePrompt}
          onGenerateCurrent={
            activeShot.templateCode === "A00"
              ? handleGenerateSceneMaster
              : () => handleRenderShot(activeShot)
          }
          onOpenCompareModal={() => setIsGraphModalOpen(true)}
          candidateBatch={(() => {
            const currentRev = activeShot.revisions.find((r) => r.id === activeShot.currentRevisionId) || activeShot.revisions[0];
            const currentRevId = currentRev?.id;
            const isHumanRev = Boolean(
              currentRev?.revisionType === 'human' ||
              currentRev?.id?.includes('human') ||
              currentRev?.label?.includes('模特') ||
              currentRev?.label?.includes('人物')
            );

            // 1. 若当前选中的历史版本有明确绑定的专属候选批次，进行同构校验后返回
            if (currentRevId && revisionCandidateBatches[currentRevId]) {
              const revBatch = revisionCandidateBatches[currentRevId];
              const isBatchHuman = Boolean(
                revBatch.candidates?.some((c) =>
                  c.summaryTag?.includes('人物') ||
                  c.summaryTag?.includes('模特') ||
                  c.summaryTag?.toLowerCase().includes('human') ||
                  c.id?.includes('human') ||
                  (c as any)?.isHumanPass
                )
              );
              if (isHumanRev === isBatchHuman) {
                return revBatch;
              }
            }

            // 2. 校验镜头当前活跃的通用候选批次
            const rawBatch = candidateBatches[activeShot.id];
            if (!rawBatch || !currentRev) return null;

            const isRawBatchHuman = Boolean(
              rawBatch.candidates?.some((c) =>
                c.summaryTag?.includes('人物') ||
                c.summaryTag?.includes('模特') ||
                c.summaryTag?.toLowerCase().includes('human') ||
                c.id?.includes('human') ||
                (c as any)?.isHumanPass
              )
            );

            // 严格同构校验：若当前查看纯空间而通用批次为人物版（或反之），绝对不传递，杜绝“查看纯空间依然显示人物卡片”
            if (isHumanRev !== isRawBatchHuman) {
              return null;
            }

            return rawBatch;
          })()}
          selectedCandidateId={selectedCandidateIds[activeShot.id]}
          onSelectCandidate={(cand) => setSelectedCandidateIds(prev => ({ ...prev, [activeShot.id]: cand.id }))}
          onApplyCandidateAsFinal={handleApplyCandidateAsFinal}
          onRegenerateBatch={() => {
            if (activeShot.hasHumanPass) {
              handleRenderHumanPass(activeShot);
            } else {
              handleRenderShot(activeShot);
            }
          }}
          onKeepSpaceRefreshModel={handleKeepSpaceRefreshModel}
          onKeepModelRefreshPose={handleKeepModelRefreshPose}
          onKeepProductRefreshScene={handleKeepProductRefreshScene}
          onToggleFavoriteCandidate={handleToggleFavoriteCandidate}
          onRenderHumanPass={() => handleRenderHumanPass(activeShot)}
          onSelectRevision={handleSelectRevision}
          onDeleteRevision={handleDeleteRevision}
          annotations={sceneAnnotations}
          showAnnotations={showAnnotations}
          onToggleShowAnnotations={() => {
            setShowAnnotations((prev) => {
              const next = !prev;
              if (typeof window !== 'undefined') {
                localStorage.setItem('space_studio_show_annotations', String(next));
              }
              return next;
            });
          }}
          currentJob={currentJob}
          selectedAnnotationId={selectedAnnotationId}
          onSelectAnnotation={(item) => setSelectedAnnotationId(item ? item.id : null)}
          onUpdateAnnotationPosition={handleUpdateAnnotationPosition}
          onHideAnnotation={handleHideAnnotation}
          onLocateInDrawer={(annotationId) => {
            setIsLeftCollapsed(false);
            // 1. 优先按产品 ID 直接匹配
            let targetProd = products.find(
              (p) => p.id === annotationId || `ann-prod-${p.id}` === annotationId
            );

            // 2. 容错匹配：通过当前标注项的 SKU / 名称 / 角色查找匹配真实资产
            const matchedAnn = sceneAnnotations.find((a) => a.id === annotationId);
            if (!targetProd && matchedAnn) {
              targetProd = products.find(
                (p) =>
                  (p.sku && matchedAnn.sku && p.sku === matchedAnn.sku) ||
                  (p.name && matchedAnn.name && p.name === matchedAnn.name) ||
                  p.role === matchedAnn.role
              );
            }

            if (targetProd) {
              // 关键突破：真正弹出该产品的编辑/定位弹窗，允许用户立即修改规格、材质并保存！
              handleOpenUploadModal(targetProd);
            } else if (matchedAnn) {
              // 若为解构预设标注品，自动转换为标准 ProductAsset 并打开编辑入库
              const fallbackProd: ProductAsset = {
                id: `prod-ann-${Date.now()}`,
                sku: matchedAnn.sku || `MW-${matchedAnn.role.toUpperCase()}`,
                name: matchedAnn.name,
                role: matchedAnn.role as any,
                priority: matchedAnn.priority || 'secondary',
                identityLock: 'strict',
                dimensions: matchedAnn.dimensions || { width: 900, depth: 950, height: 900 },
                materials: matchedAnn.materials || ['半苯胺头层牛皮'],
                colors: matchedAnn.colors || ['极地米白'],
                surfaceTexture: '精致皮革纹理',
                functionCapable: matchedAnn.functionCapable ?? false,
                referenceImages: [],
                structuralFeatures: [],
                lockedRules: [],
                readoutConfidence: 95,
                provenance: 'AI_ESTIMATED',
                productionTruth: false
              };
              handleOpenUploadModal(fallbackProd);
            }
          }}
          theme={theme}
          onOpenResetModal={() => setIsClearRecordsModalOpen(true)}
          onClearCurrentShotImage={() => handleClearShotImage(activeShot.id)}
          hasGenerations={Boolean(sceneMaster || shots.some((s) => s.revisions && s.revisions.length > 0))}
        />

        {/* Right Resizer Handle */}
        {!isRightCollapsed && (
          <div
            onMouseDown={handleStartResizeRight}
            className={`relative w-2 -mx-1 cursor-col-resize z-30 group transition-all shrink-0 flex items-center justify-center ${
              theme === 'light' ? 'hover:bg-amber-400/20' : 'hover:bg-amber-500/20'
            }`}
            title="按住鼠标左右拖拽调节右侧栏宽度，双击折叠"
            onDoubleClick={() => setIsRightCollapsed(true)}
          >
            <div className={`w-0.5 h-10 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${
              theme === 'light' ? 'bg-amber-500' : 'bg-amber-400'
            }`} />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsRightCollapsed(true);
              }}
              className={`absolute top-1/2 -translate-y-1/2 right-1/2 translate-x-1/2 w-4 h-8 rounded-l-md border border-r-0 shadow-xs opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all cursor-pointer z-40 ${
                theme === 'light'
                  ? 'bg-white border-stone-300 text-stone-600 hover:text-amber-700 hover:bg-stone-50'
                  : 'bg-stone-800 border-stone-700 text-stone-300 hover:text-amber-400 hover:bg-stone-700'
              }`}
              title="一键收起右侧控制台"
            >
              <ChevronRight className="w-3 h-3 -mr-0.5" />
            </button>
          </div>
        )}

        {/* 3. Right Control & AI Panel (整理为 Scene Style → Model DNA → Human Layout → Lighting → 添加模特) */}
        <SpaceStudioRightPanel
          activeShot={activeShot}
          activeShotIndex={shots.findIndex((s) => s.id === activeShot.id)}
          totalShots={shots.length}
          sceneMaster={sceneMaster}
          aspectRatio={aspectRatio}
          onChangeAspectRatio={handleShotAspectRatioChange}
          computeConfig={computeConfig}
          onChangeComputeConfig={handleUpdateComputeConfig}
          isGeneratingCurrent={isGeneratingCurrentShot}
          onCancelRendering={() => handleCancelRendering(activeShot.id)}
          renderingShotCode={renderingShotCode}
          backgroundRenderingShotCodes={backgroundRenderingShots.map((s) => s.templateCode)}
          isGeneratingAll={isGeneratingAll}
          onGenerateSceneMaster={handleGenerateSceneMaster}
          onGenerateCurrentShot={
            activeShot.templateCode === "A00"
              ? handleGenerateSceneMaster
              : () => handleRenderShot(activeShot)
          }
          onGenerateAllShots={handleBatchRenderAll}
          isGeneratingHuman={isRenderingHuman}
          onRenderHumanPass={() => handleRenderHumanPass(activeShot)}
          humanLayout={humanLayout}
          onChangeHumanLayout={handleUpdateHumanLayout}
          availableModels={availableModels}
          onOptimizeLightingAndPrompt={handleAiRefinePrompt}
          onUpdateCamera={handleUpdateCamera}
          onResetCamera={handleResetCamera}
          activeAssets={activeAssets}
          onUpdateActiveAssets={(updater) => setActiveAssets(prev => ({ ...prev, ...updater }))}
          onApplyStyleAndGenerateMaster={handleApplyStyleAndGenerateMaster}
          onApplyStyleAsMasterDirectly={handleApplyStyleAsSceneMasterDirectly}
          customPrompt={customPrompt}
          onChangeCustomPrompt={setCustomPrompt}
          negativePrompt={negativePrompt}
          onChangeNegativePrompt={setNegativePrompt}
          theme={theme}
          width={rightPanelWidth}
          isCollapsed={isRightCollapsed}
          onToggleCollapse={() => setIsRightCollapsed(!isRightCollapsed)}
        />

        {/* Floating Expand button for Right Panel */}
        {isRightCollapsed && (
          <button
            onClick={() => setIsRightCollapsed(false)}
            className={`absolute right-3 top-16 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-l-xl rounded-r-md border shadow-md transition-all cursor-pointer font-bold text-xs ${
              theme === 'light'
                ? 'bg-white/95 border-stone-300 text-stone-700 hover:text-amber-800 hover:bg-stone-50'
                : 'bg-stone-900/95 border-stone-700 text-stone-200 hover:text-amber-400 hover:bg-stone-800'
            }`}
            title="展开右侧 AI 摄影导演控制面板"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[11px]">展开控制面板</span>
          </button>
        )}
      </div>

      {/* 4. Bottom Lookbook Shot Navigator (01 ~ 09) */}
      <SpaceStudioShotNavigator
        shots={shots}
        sceneMaster={sceneMaster}
        activeShotIndex={shots.findIndex((s) => s.id === activeShot.id)}
        onCancelRendering={handleCancelRendering}
        onSelectShot={(idx) => {
          const target = shots[idx];
          if (!target) return;
          setActiveShotId(target.id);
          // 影棚实拍商业对齐：全量镜头（A00~A09）按画面规划与商业构图意图自动自适应长宽比例
          const tpl = getShotTemplateByCode(target.templateCode);
          const plannedRatio: ImageAspectRatio =
            (tpl?.recommendedAspectRatio as ImageAspectRatio) || target.aspectRatio || '4:3';

          if (target.aspectRatio !== plannedRatio) {
            setShots((prev) => prev.map((s) => (s.id === target.id ? { ...s, aspectRatio: plannedRatio } : s)));
          }

          if (aspectRatio !== plannedRatio) {
            setAspectRatio(plannedRatio);
            handleUpdateComputeConfig({ aspectRatio: plannedRatio });
            if (typeof window !== 'undefined') {
              localStorage.setItem('space_studio_aspect_ratio', plannedRatio);
            }
          }
        }}
        onSelectRevision={handleSelectRevision}
        onDeleteRevision={handleDeleteRevision}
        onBatchRenderAll={handleBatchRenderAll}
        isGeneratingAll={isGeneratingAll}
        theme={theme}
      />

      {/* 5. Product Upload / Replace / Readings Modal */}
      {isProductUploadModalOpen && (
        <ProductUploadModal
          isOpen={isProductUploadModalOpen}
          onClose={() => {
            setIsProductUploadModalOpen(false);
            setEditingProduct(null);
            setInitialUploadImages([]);
          }}
          onSaveProduct={handleSaveProductFromModal}
          onBatchSaveProducts={handleBatchSaveProductsFromModal}
          initialProduct={editingProduct}
          initialImages={initialUploadImages}
        />
      )}

      {/* 6. Revision Graph Modal */}
      {isGraphModalOpen && activeShot && (
        <RevisionGraphModal
          shot={activeShot}
          onClose={() => setIsGraphModalOpen(false)}
          onSelectRevision={(revId) => {
            setShots((prev) =>
              prev.map((s) => (s.id === activeShot.id ? { ...s, currentRevisionId: revId } : s))
            );
          }}
          onConfirmProductionTruth={handleConfirmProductionTruth}
        />
      )}

      {/* 7. Clear Records / Reset Session Modal */}
      {isClearRecordsModalOpen && (
        <ClearRecordsModal
          isOpen={isClearRecordsModalOpen}
          onClose={() => setIsClearRecordsModalOpen(false)}
          onConfirmClear={handleClearCurrentRecords}
          summary={{
            productName: products.find((p) => p.priority === 'primary')?.name || products[0]?.name,
            productsCount: products.length,
            generatedShotsCount: shots.filter((s) => s.revisions && s.revisions.length > 0).length,
            totalShotsCount: shots.length,
            totalRevisionsCount: shots.reduce((acc, s) => acc + (s.revisions?.length || 0), 0),
            hasMaster: Boolean(sceneMaster?.imageUrl)
          }}
          theme={theme}
        />
      )}

      {/* 8. Top Toast Notification */}
      {feedbackNotice && (
        <div
          className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-xs font-bold border shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-3 duration-200 ${
            feedbackNotice.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-950/40'
              : 'bg-stone-800 text-stone-100 border-stone-700 shadow-black/50'
          }`}
          role="status"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
          <span>{feedbackNotice.text}</span>
          <button
            onClick={() => setFeedbackNotice(null)}
            className="ml-2 hover:opacity-80 cursor-pointer text-white/90 text-sm"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};
