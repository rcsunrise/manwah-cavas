// src/features/space-studio/shell/SpaceStudioShell.tsx
import React, { useState, useEffect } from 'react';
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
  UIThemeMode
} from '../../../types/spaceStudio';
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
import { ProductUploadModal } from '../components/ProductUploadModal';
import { SpaceStudioLeftDrawer } from '../components/SpaceStudioLeftDrawer';
import { SpaceStudioCanvas } from '../components/SpaceStudioCanvas';
import { SpaceStudioShotNavigator } from '../components/SpaceStudioShotNavigator';
import { SpaceStudioRightPanel } from '../components/SpaceStudioRightPanel';
import {
  ActivePhotographyAssets,
  ShotCandidateBatch,
  CandidateItem,
  HumanLayoutConfig,
  DEFAULT_4_HUMAN_SLOTS,
  ModelAsset
} from '../../../types/spaceAssetLibrary';
import { spaceAssetLibraryService } from '../../../services/spaceAssetLibraryService';
import { BuildPhasePanel } from '../components/BuildPhasePanel';
import { INITIAL_MANWAH_PRODUCTS } from '../data/productAssets';
import { SPACE_PROTOTYPES } from '../data/spacePresets';
import { STYLE_PRESETS } from '../data/stylePresets';
import { PlacementEngine } from '../engine/placementEngine';
import { SceneMasterPromptCompiler } from '../engine/sceneMasterPromptCompiler';
import { ShootPhasePanel } from '../components/ShootPhasePanel';
import { ShootPhaseWorkspace } from '../components/ShootPhaseWorkspace';
import { STANDARD_SHOT_TEMPLATES } from '../data/shotTemplates';
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

interface SpaceStudioShellProps {
  onSwitchMode: (mode: SpaceStudioMode) => void;
  onBackToCanvas?: () => void;
  onHandoffToPoster?: (screenItem: PlanScreenItem) => void;
}

const DEFAULT_SHOTS: ShotInstance[] = [
  {
    id: 'shot-a00',
    templateCode: 'A00',
    name: '空间母版 (Scene Master)',
    camera: {
      lensMm: 35,
      heightCm: 130,
      yawDeg: 0,
      pitchDeg: -2,
      rollDeg: 0,
      target: { type: 'product', id: 'p1' },
      framing: 'wide',
      mustInclude: ['sofa_3seat', 'coffee_table', 'window_view'],
      mustExclude: ['human']
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
    name: '空间主大全景',
    camera: {
      lensMm: 28,
      heightCm: 140,
      yawDeg: 0,
      pitchDeg: -3,
      rollDeg: 0,
      target: { type: 'zone', id: 'living_room' },
      framing: 'wide',
      mustInclude: ['all_living_zone'],
      mustExclude: ['kitchen_clutter']
    },
    intent: {
      intentCode: 'SI-01',
      name: '全案通透视野',
      productDominancePct: 45,
      backgroundSuppression: 'low',
      maxOcclusionPct: 5,
      description: '展现大平层/别墅核心会客大厅的大气尺度'
    },
    status: 'draft',
    revisions: [],
    hasHumanPass: false
  },
  {
    id: 'shot-a02',
    templateCode: 'A02',
    name: '产品 45° 黄金视角',
    camera: {
      lensMm: 45,
      heightCm: 125,
      yawDeg: 42,
      pitchDeg: -4,
      rollDeg: 0,
      target: { type: 'product', id: 'p1' },
      framing: 'product',
      mustInclude: ['sofa_armrest', 'seat_leather'],
      mustExclude: ['back_wall_excess']
    },
    intent: {
      intentCode: 'SI-02',
      name: 'Hero Product Focus',
      productDominancePct: 68,
      backgroundSuppression: 'high',
      maxOcclusionPct: 8,
      description: '敏华核心主沙发 45° 黄金视角，彰显头层牛皮与饱满轮廓'
    },
    status: 'draft',
    revisions: [],
    hasHumanPass: false
  },
  {
    id: 'shot-a03',
    templateCode: 'A03',
    name: '单椅功能位 (Recliner Focus)',
    camera: {
      lensMm: 50,
      heightCm: 110,
      yawDeg: -25,
      pitchDeg: -2,
      rollDeg: 0,
      target: { type: 'product', id: 'recliner_1' },
      framing: 'product',
      mustInclude: ['footrest_open', 'headrest_angle'],
      mustExclude: []
    },
    intent: {
      intentCode: 'SI-04',
      name: 'Function Focus',
      productDominancePct: 70,
      backgroundSuppression: 'high',
      maxOcclusionPct: 5,
      description: '电动功能单椅展开状态，展示 110°-160° 超静音开合姿态'
    },
    status: 'draft',
    revisions: [],
    hasHumanPass: false
  },
  {
    id: 'shot-a04',
    templateCode: 'A04',
    name: '皮质特写 (Material Focus)',
    camera: {
      lensMm: 85,
      heightCm: 90,
      yawDeg: 15,
      pitchDeg: -10,
      rollDeg: 0,
      target: { type: 'detail', id: 'leather_pore' },
      framing: 'detail',
      mustInclude: ['leather_stitching', 'grain_texture'],
      mustExclude: []
    },
    intent: {
      intentCode: 'SI-06',
      name: 'Material Focus',
      productDominancePct: 85,
      backgroundSuppression: 'high',
      maxOcclusionPct: 0,
      description: '微距级呈现头层半苯胺真皮毛孔、双针车线工艺'
    },
    status: 'draft',
    revisions: [],
    hasHumanPass: false
  },
  {
    id: 'shot-a05',
    templateCode: 'A05',
    name: '低角度仰拍 (Majestic Angle)',
    camera: {
      lensMm: 35,
      heightCm: 60,
      yawDeg: 10,
      pitchDeg: 6,
      rollDeg: 0,
      target: { type: 'product', id: 'p1' },
      framing: 'product',
      mustInclude: ['sofa_structure', 'ceiling_height'],
      mustExclude: []
    },
    intent: {
      intentCode: 'SI-03',
      name: 'Product Structure',
      productDominancePct: 65,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 5,
      description: '低机位仰拍展现家具与挑高空间的宏大巍峨气度'
    },
    status: 'draft',
    revisions: [],
    hasHumanPass: false
  },
  {
    id: 'shot-a06',
    templateCode: 'A06',
    name: '沙发+茶几近景',
    camera: {
      lensMm: 40,
      heightCm: 115,
      yawDeg: -15,
      pitchDeg: -5,
      rollDeg: 0,
      target: { type: 'product', id: 'living_ensemble' },
      framing: 'product',
      mustInclude: ['sofa_front', 'coffee_table_marble'],
      mustExclude: []
    },
    intent: {
      intentCode: 'SI-01',
      name: 'Ensemble Balance',
      productDominancePct: 75,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 8,
      description: '沙发与潘多拉奢石茶几的经典围合'
    },
    status: 'draft',
    revisions: [],
    hasHumanPass: false
  },
  {
    id: 'shot-a07',
    templateCode: 'A07',
    name: '生活方式全家福',
    camera: {
      lensMm: 35,
      heightCm: 130,
      yawDeg: 0,
      pitchDeg: -2,
      rollDeg: 0,
      target: { type: 'zone', id: 'living_human' },
      framing: 'wide',
      mustInclude: ['family_interaction', 'all_seats'],
      mustExclude: []
    },
    intent: {
      intentCode: 'SI-08',
      name: 'Lifestyle Story',
      productDominancePct: 55,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 20,
      description: '家庭成员多坐区分布交互，情感共鸣'
    },
    status: 'draft',
    revisions: [],
    hasHumanPass: true
  },
  {
    id: 'shot-a08',
    templateCode: 'A08',
    name: '空间特色建筑立面',
    camera: {
      lensMm: 24,
      heightCm: 150,
      yawDeg: 10,
      pitchDeg: 0,
      rollDeg: 0,
      target: { type: 'zone', id: 'architecture' },
      framing: 'wide',
      mustInclude: ['floor_to_ceiling_window', 'ceiling_beam'],
      mustExclude: []
    },
    intent: {
      intentCode: 'SI-01',
      name: 'Architecture Balance',
      productDominancePct: 40,
      backgroundSuppression: 'low',
      maxOcclusionPct: 5,
      description: '全景落地窗外景与挑高横梁的光影交织'
    },
    status: 'draft',
    revisions: [],
    hasHumanPass: false
  }
];

export const SpaceStudioShell: React.FC<SpaceStudioShellProps> = ({
  onSwitchMode,
  onBackToCanvas,
  onHandoffToPoster
}) => {
  const [currentStep, setCurrentStep] = useState<SpaceWorkflowStep>('build');
  const [shots, setShots] = useState<ShotInstance[]>(DEFAULT_SHOTS);
  const [activeShotId, setActiveShotId] = useState<string>('shot-a00');

  // 视窗两翼折叠状态：支持折叠左右侧窗口，最大化呈现中央渲染画幅
  const [isLeftCollapsed, setIsLeftCollapsed] = useState<boolean>(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState<boolean>(false);
  const [isBottomCollapsed, setIsBottomCollapsed] = useState<boolean>(false);

  // BUILD 阶段核心工程状态
  const [products, setProducts] = useState<ProductAsset[]>(INITIAL_MANWAH_PRODUCTS);
  const [selectedSpace, setSelectedSpace] = useState<SpacePreset>(SPACE_PROTOTYPES[0]);
  const [selectedStyle, setSelectedStyle] = useState<StylePreset>(STYLE_PRESETS[0]);
  const [blueprint, setBlueprint] = useState<PlacementBlueprint>(() =>
    PlacementEngine.generateStandardBlueprint({
      spacePreset: SPACE_PROTOTYPES[0],
      products: INITIAL_MANWAH_PRODUCTS
    })
  );

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

      try {
        const newBp = PlacementEngine.generateStandardBlueprint({
          spacePreset: selectedSpace,
          products: updated
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
      try {
        const newBp = PlacementEngine.generateStandardBlueprint({
          spacePreset: selectedSpace,
          products: updated
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
      try {
        const newBp = PlacementEngine.generateStandardBlueprint({
          spacePreset: selectedSpace,
          products: updated
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
        { ...target, priority: 'primary' as const, identityLock: 'strict' as const },
        ...others
      ];
      try {
        const newBp = PlacementEngine.generateStandardBlueprint({
          spacePreset: selectedSpace,
          products: updated
        });
        setBlueprint(newBp);
      } catch (e: unknown) {
        console.warn('Blueprint update error:', e);
      }
      return updated;
    });
  };
  const [sceneMaster, setSceneMaster] = useState<SceneMaster | null>(null);
  const [isGeneratingMaster, setIsGeneratingMaster] = useState<boolean>(false);
  const [isRenderingShot, setIsRenderingShot] = useState<boolean>(false);
  const [isGraphModalOpen, setIsGraphModalOpen] = useState<boolean>(false);
  const [currentJob, setCurrentJob] = useState<GenerationJob | null>(null);

  // 摄影画册工作台全新交互状态 (主次分明、折叠抽屉、画幅选择与智能护航)
  const [activeRailTab, setActiveRailTab] = useState<'space' | 'product' | 'style' | 'camera' | 'human'>('space');
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState<boolean>(true);
  const [isProductUploadModalOpen, setIsProductUploadModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<ProductAsset | null>(null);
  const [isAdvancedAccordionOpen, setIsAdvancedAccordionOpen] = useState<boolean>(false);
  const [isRefiningPrompt, setIsRefiningPrompt] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('4:3');

  // UI Theme Mode: dark / light
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('space_studio_theme') as 'dark' | 'light';
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark';
  });

  const handleToggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      if (typeof window !== 'undefined') {
        localStorage.setItem('space_studio_theme', next);
      }
      return next;
    });
  };

  // 渲染引擎配置选项 (默认 4:3 画幅)
  const [computeConfig, setComputeConfig] = useState<RenderComputeConfig>({
    model: 'gemini-3.1-flash-image',
    resolution: '2K',
    aspectRatio: '4:3',
    customAspectRatio: '',
    seed: undefined,
    namingPreset: 'detailed',
    customPrefix: ''
  });

  const handleUpdateComputeConfig = (updater: Partial<RenderComputeConfig>) => {
    setComputeConfig((prev) => {
      const next = { ...prev, ...updater };
      if (updater.aspectRatio && updater.aspectRatio !== aspectRatio) {
        setAspectRatio(updater.aspectRatio);
      }
      return next;
    });
  };

  const handleOpenUploadModal = (prod?: ProductAsset | null) => {
    setEditingProduct(prod || null);
    setIsProductUploadModalOpen(true);
  };

  const handleSaveProductFromModal = (savedProd: ProductAsset) => {
    if (editingProduct) {
      handleUpdateProduct(savedProd);
    } else {
      handleAddProduct(savedProd);
    }
    setIsProductUploadModalOpen(false);
    setEditingProduct(null);
  };

  const activeShot = shots.find((s) => s.id === activeShotId) || shots[0];

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

  // 人物编排器 Human Layout 状态 (4人 / 6人 / 自定义)
  const [humanLayout, setHumanLayout] = useState<HumanLayoutConfig>({
    mode: '4',
    characterCount: 4,
    disallowExtraCharacters: true,
    slots: DEFAULT_4_HUMAN_SLOTS
  });
  const [isRenderingHuman, setIsRenderingHuman] = useState<boolean>(false);
  const [availableModels, setAvailableModels] = useState<ModelAsset[]>(() =>
    spaceAssetLibraryService.getModels()
  );

  // 4 候选方案字典
  const [candidateBatches, setCandidateBatches] = useState<Record<string, ShotCandidateBatch>>({});
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Record<string, string>>({});

  useEffect(() => {
    (window as any).__setCandidateBatch = (shotId: string, batch: ShotCandidateBatch) => {
      setCandidateBatches((prev) => ({ ...prev, [shotId]: batch }));
      setSelectedCandidateIds((prev) => ({ ...prev, [shotId]: batch.candidates[0].id }));
    };
  }, []);

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

    setShots(prev =>
      prev.map(s => {
        if (s.id !== activeShot.id) return s;
        const newRev: ShotRevision = {
          id: `rev-${s.templateCode.toLowerCase()}-${Date.now().toString(36)}`,
          shotId: s.id,
          revisionNumber: (s.revisions.length || 0) + 1,
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

  // 渲染单个镜头的 4 候选方案 (SHOOT + 继承 A00 空间与家具世界 + 单变量 Camera DNA 驱动)
  const handleRenderShot = async (targetShot: ShotInstance, customSettings?: GenerationSettings) => {
    // 门禁：A00 没有真实生成结果并由用户执行 LOCK 时，自动先触发生成并锁定 A00 空间母版真值以保证物理不变量
    if (targetShot.templateCode !== 'A00' && (!sceneMaster || !sceneMaster.isLocked)) {
      console.log('正在优先生成并锁定 A00 空间母版真值...');
      await handleGenerateSceneMaster();
    }

    setIsRenderingShot(true);
    const jobId = `job-shoot-${targetShot.templateCode.toLowerCase()}-${Date.now()}`;
    const activeSettings: GenerationSettings = {
      model: customSettings?.model || computeConfig.model,
      aspectRatio: (customSettings as any)?.aspectRatio || computeConfig.aspectRatio,
      ...(computeConfig.seed !== undefined ? { seed: computeConfig.seed } : {}),
      ...customSettings
    };

    const initialJob: GenerationJob = {
      jobId,
      phase: 'shoot',
      targetCode: targetShot.templateCode,
      status: 'compiling',
      progress: 15,
      provider: activeSettings.model || 'gemini-3.1-flash-image',
      settings: activeSettings,
      createdAt: new Date().toISOString()
    };
    setCurrentJob(initialJob);

    // 状态置为 generating
    setShots((prev) =>
      prev.map((s) => (s.id === targetShot.id ? { ...s, status: 'generating' } : s))
    );

    try {
      const compiled = ShootCompiler.compileShotPrompt({
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
        products,
        spacePreset: selectedSpace,
        stylePreset: selectedStyle,
        blueprint
      });

      setCurrentJob((j) => (j ? { ...j, status: 'generating', progress: 40, promptSnapshot: compiled } : null));

      const primaryProd = products.find((p) => p.priority === 'primary') || products[0];
      const primaryRef =
        primaryProd?.referenceImages?.[0]?.publicUrl ||
        primaryProd?.referenceImages?.[0]?.objectKey ||
        (primaryProd as any)?.uploadedImageUrl;

      // 调用后端 4 候选方案生成接口 (严格继承 A00 空间与家具世界，单变量改变 Camera DNA)
      const res = await fetch('/api/space/shoot/render-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'manwah-noble-space-01',
          shotId: targetShot.id,
          shotCode: targetShot.templateCode,
          revisionNumber: (targetShot.revisions.length || 0) + 1,
          camera: compiled.cameraSpec,
          intent: targetShot.intent,
          productDNA: {
            modelNumber: primaryProd?.sku || primaryProd?.id,
            name: primaryProd?.name,
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
      const newRevision: ShotRevision = {
        id: `rev-${targetShot.templateCode.toLowerCase()}-${Date.now().toString(36)}`,
        shotId: targetShot.id,
        revisionNumber: (targetShot.revisions.length || 0) + 1,
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
        setSceneMaster(sm);
      }

      setCurrentJob((j) => (j ? { ...j, status: 'completed', progress: 100, finishedAt: new Date().toISOString() } : null));
    } catch (err: unknown) {
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
        prev.map((s) => (s.id === targetShot.id ? { ...s, status: 'failed' } : s))
      );
    } finally {
      setIsRenderingShot(false);
    }
  };

  // 摄影机 DNA 实时更新与调控
  const handleUpdateCamera = (shotId: string, updates: Partial<ShotInstance['camera']>) => {
    setShots((prev) =>
      prev.map((s) => (s.id === shotId ? { ...s, camera: { ...s.camera, ...updates } } : s))
    );
  };

  // 重置摄影机为当前镜头的推荐工业设定
  const handleResetCamera = (shotId: string) => {
    const defaultTemplate = STANDARD_SHOT_TEMPLATES.find((t) => t.code === activeShot.templateCode);
    if (defaultTemplate) {
      handleUpdateCamera(shotId, defaultTemplate.defaultCamera);
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

  // 批量渲染全部镜头 (A01~A08)
  const handleBatchRenderAll = async () => {
    if (!sceneMaster || !sceneMaster.isLocked) {
      await handleGenerateSceneMaster();
    }
    const candidateShots = shots.filter((s) => s.templateCode !== 'A00');
    for (const s of candidateShots) {
      await handleRenderShot(s);
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
    setIsRenderingHuman(true);
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
      provider: activeSettings.model || 'gemini-3.1-flash-image',
      settings: activeSettings,
      createdAt: new Date().toISOString()
    };
    setCurrentJob(initialJob);

    try {
      const allModels = spaceAssetLibraryService.getModels();
      setAvailableModels(allModels);
      const compiledHuman = spaceAssetLibraryService.compileHumanLayoutPrompt(humanLayout, allModels);

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
        products,
        spacePreset: selectedSpace,
        stylePreset: selectedStyle,
        blueprint
      });

      setCurrentJob((j) => (j ? { ...j, status: 'generating', progress: 40 } : null));

      const primaryProd = products.find((p) => p.priority === 'primary') || products[0];
      const primaryRef =
        primaryProd?.referenceImages?.[0]?.publicUrl ||
        primaryProd?.referenceImages?.[0]?.objectKey ||
        (primaryProd as any)?.uploadedImageUrl;

      // 获取当前机位的底图基准
      const currentRev = targetShot.revisions.find((r) => r.id === targetShot.currentRevisionId) || targetShot.revisions[0];
      const baseShotImage = currentRev?.imageUrl || (targetShot.templateCode === 'A00' ? sceneMaster?.imageUrl : undefined) || sceneMaster?.imageUrl;

      const activeSettings = {
        model: computeConfig.model,
        resolution: computeConfig.resolution,
        aspectRatio: aspectRatio,
        seed: computeConfig.seed
      };

      const res = await fetch('/api/space/shoot/render-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'manwah-noble-space-01',
          shotId: targetShot.id,
          shotCode: targetShot.templateCode,
          revisionNumber: (targetShot.revisions.length || 0) + 1,
          isHumanPass: true,
          baseShotReferenceImage: baseShotImage,
          currentShotReferenceImage: baseShotImage,
          humanLayout,
          selectedModels: allModels,
          camera: targetShot.camera,
          intent: targetShot.intent,
          productDNA: {
            modelNumber: primaryProd?.sku || primaryProd?.id,
            name: primaryProd?.name,
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
          generationSettings: activeSettings,
          promptSnapshot: {
            ...baseCompiled,
            positivePrompt: `${baseCompiled.positivePrompt}, ${compiledHuman.humanDirectives}`,
            negativePrompt: compiledHuman.negativePrompt,
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

      // 以候选 1 建立人物版 Revision
      const parentRevId = targetShot.currentRevisionId || (targetShot.revisions.length > 0 ? targetShot.revisions[0].id : undefined);
      const newRevision: ShotRevision = {
        id: `rev-${targetShot.templateCode.toLowerCase()}-human-${Date.now().toString(36)}`,
        shotId: targetShot.id,
        revisionNumber: (targetShot.revisions.length || 0) + 1,
        parentRevisionId: parentRevId,
        objectKey: initialCandidate.objectKey || `shots/${initialCandidate.id}.webp`,
        imageUrl: initialCandidate.imageUrl,
        thumbnailUrl: initialCandidate.imageUrl,
        promptSnapshotId: initialCandidate.id,
        status: 'approved',
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

      setShots((prev) =>
        prev.map((s) => {
          if (s.id !== targetShot.id) return s;
          return {
            ...s,
            status: 'passed',
            hasHumanPass: true,
            currentRevisionId: newRevision.id,
            revisions: [newRevision, ...s.revisions.filter((r) => r.id !== newRevision.id)]
          };
        })
      );

      setCurrentJob((j) => (j ? { ...j, status: 'completed', progress: 100, finishedAt: new Date().toISOString() } : null));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'FAILED';
      console.error('Failed to render human pass candidates:', err);
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
    } finally {
      setIsRenderingHuman(false);
    }
  };

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
          onUpdateProduct={handleUpdateProduct}
          onRemoveProduct={handleRemoveProduct}
          onSetPrimaryProduct={handleSetPrimaryProduct}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          shots={shots}
          activeShotIndex={shots.findIndex((s) => s.id === activeShot.id)}
          onSelectShot={(idx) => setActiveShotId(shots[idx].id)}
        />

        {/* 2. Center Cinematic Canvas Stage */}
        <SpaceStudioCanvas
          activeShot={activeShot}
          sceneMaster={sceneMaster}
          aspectRatio={aspectRatio}
          onChangeAspectRatio={(r) => {
            setAspectRatio(r);
            handleUpdateComputeConfig({ aspectRatio: r });
          }}
          isGenerating={isGeneratingMaster || isRenderingShot || isRenderingHuman}
          onGenerateCurrent={
            activeShot.templateCode === "A00"
              ? handleGenerateSceneMaster
              : () => handleRenderShot(activeShot)
          }
          onOpenCompareModal={() => setIsGraphModalOpen(true)}
          candidateBatch={candidateBatches[activeShot.id] || null}
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
          theme={theme}
        />

        {/* 3. Right Control & AI Panel (整理为 Scene Style → Model DNA → Human Layout → Lighting → 添加模特) */}
        <SpaceStudioRightPanel
          activeShot={activeShot}
          activeShotIndex={shots.findIndex((s) => s.id === activeShot.id)}
          totalShots={shots.length}
          sceneMaster={sceneMaster}
          aspectRatio={aspectRatio}
          onChangeAspectRatio={(r) => {
            setAspectRatio(r);
            handleUpdateComputeConfig({ aspectRatio: r });
          }}
          computeConfig={computeConfig}
          onChangeComputeConfig={handleUpdateComputeConfig}
          isGeneratingCurrent={isGeneratingMaster || isRenderingShot}
          isGeneratingAll={false}
          onGenerateCurrentShot={
            activeShot.templateCode === "A00"
              ? handleGenerateSceneMaster
              : () => handleRenderShot(activeShot)
          }
          onGenerateAllShots={handleBatchRenderAll}
          isGeneratingHuman={isRenderingHuman}
          onRenderHumanPass={() => handleRenderHumanPass(activeShot)}
          humanLayout={humanLayout}
          onChangeHumanLayout={setHumanLayout}
          availableModels={availableModels}
          onOptimizeLightingAndPrompt={handleAiRefinePrompt}
          onUpdateCamera={handleUpdateCamera}
          activeAssets={activeAssets}
          onUpdateActiveAssets={(updater) => setActiveAssets(prev => ({ ...prev, ...updater }))}
          customPrompt={customPrompt}
          onChangeCustomPrompt={setCustomPrompt}
          negativePrompt={negativePrompt}
          onChangeNegativePrompt={setNegativePrompt}
          theme={theme}
        />
      </div>

      {/* 4. Bottom Lookbook Shot Navigator (01 ~ 09) */}
      <SpaceStudioShotNavigator
        shots={shots}
        sceneMaster={sceneMaster}
        activeShotIndex={shots.findIndex((s) => s.id === activeShot.id)}
        onSelectShot={(idx) => setActiveShotId(shots[idx].id)}
        onBatchRenderAll={handleBatchRenderAll}
        isGeneratingAll={false}
        theme={theme}
      />

      {/* 5. Product Upload / Replace / Readings Modal */}
      {isProductUploadModalOpen && (
        <ProductUploadModal
          isOpen={isProductUploadModalOpen}
          onClose={() => {
            setIsProductUploadModalOpen(false);
            setEditingProduct(null);
          }}
          onSaveProduct={handleSaveProductFromModal}
          initialProduct={editingProduct}
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
    </div>
  );
};
