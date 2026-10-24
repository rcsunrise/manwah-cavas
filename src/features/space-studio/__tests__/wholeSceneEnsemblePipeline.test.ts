// src/features/space-studio/__tests__/wholeSceneEnsemblePipeline.test.ts
import { describe, it, expect } from 'vitest';
import { WholeSceneEnsembleDossier, ProductAsset } from '../../../types/spaceStudio';
import { SceneMasterPromptCompiler } from '../engine/sceneMasterPromptCompiler';
import { ShootCompiler } from '../engine/shootCompiler';
import { STANDARD_SHOT_TEMPLATES } from '../data/shotTemplates';
import { SPACE_PROTOTYPES } from '../data/spacePresets';
import { STYLE_PRESETS } from '../data/stylePresets';
import { PlacementEngine } from '../engine/placementEngine';

describe('Whole Scene Ensemble Pipeline & Grand Architectural Master Verification', () => {
  const mockSceneEnsembleDossier: WholeSceneEnsembleDossier = {
    id: 'ens-mock-001',
    name: '敏华芝华仕·都会大平层奢华客餐厅全案全景套组',
    sku: 'MW-ENS-9801',
    ensembleCategory: '大平层现代轻奢全景客餐厅套组',
    readoutConfidence: 97,
    dossierSummary: '全套组合包含意式极简半苯胺牛皮主沙发、转角单人头等舱、天然大理石茶几几组、通铺水墨艺术地毯及全幅连续奢石木饰面主背景。',
    generatedAt: new Date().toISOString(),
    sofaSuite: {
      description: '3+2+1 围合式大尺度沙发布局',
      seatingConfiguration: '三人主位 + 双人侧位 + 单人电动头等舱',
      mainSofa: {
        name: '敏华头等舱主位沙发',
        seats: 3,
        dimensions: '3200*1080*950mm',
        material: '南美半苯胺头层牛皮',
        color: '云雾暖灰',
        features: ['双电机零重力伸展', '羽绒填充饱满扶手']
      },
      companionSofas: [{ name: '双人位侧羽绒沙发', type: 'side_sofa', material: '半苯胺真皮', color: '云雾暖灰' }],
      reclinerChairs: [{ name: '单人电动头等舱', type: 'recliner', material: '科技纳帕皮', color: '鞍褐焦糖' }]
    },
    coffeeTables: {
      description: '大理石主茶几搭配极简金属圆形边几',
      items: [
        { name: '中心岩板大茶几', role: 'center_table', material: '天然云雾白大理石', shape: '圆角长方台面', finish: '哑光防污' },
        { name: '极简角几', role: 'side_table', material: '拉丝黑钛金属', shape: '圆形悬挑', finish: '缎面金属' }
      ]
    },
    carpetRug: {
      description: '全域大尺度通铺艺术地毯',
      material: '新西兰羊毛与高密真丝混纺',
      pattern: '抽象水墨大理石流云肌理',
      coverageScope: '延伸至沙发组合外沿 450mm 全域通铺',
      colors: ['珍珠灰', '浅卡其', '隐约深炭金']
    },
    credenzaSideboard: {
      description: '靠墙贯通式低矮餐边地柜',
      presence: true,
      dimensions: '2400*450*550mm',
      material: '北美黑胡桃木饰面搭配哑光岩板台面',
      features: ['无把手反弹阻尼抽屉', '悬空离地 150mm']
    },
    displayCabinet: {
      description: '通顶立面壁龛展示柜',
      presence: true,
      material: '烟熏橡木与超白钢化玻璃',
      lightingStyle: '3000K 嵌入式无缝泛光线条灯槽'
    },
    diningSuite: {
      description: '客餐厅一体化岛台餐桌与餐椅',
      presence: true,
      table: { name: '岩板中岛餐台', material: '潘多拉奢石岩板', shape: '长方形圆弧边' },
      chairs: { name: '马鞍皮高背餐椅', material: '意大利真皮与金属脚', count: 6 }
    },
    softDecor: {
      description: '高定奢石背景墙与现代抽象挂画摆件',
      wallArt: '全幅贯通式连续奢石大板背景墙与当代几何肌理浮雕挂画',
      lighting: '磁吸极简轨道灯搭配线性洗墙地脚灯',
      greenery: '两米高罗汉松与日本大叶伞盆栽',
      tabletopOrnaments: ['北欧手工陶瓷花瓶', '金属雕塑托盘', '精装建筑画册']
    },
    placementDirectives: {
      holisticLayoutPrompt: 'Place the unified living room suite featuring the modular leather sofa ensemble, marble coffee table group, full-coverage ink-texture carpet, and low credenza naturally coordinated in a continuous wide-span grand room.',
      visualInvariants: ['云雾暖灰主沙发皮质肌理与零重力结构', '天然大理石茶几水墨纹理', '全幅贯通无孤立立柱主背景墙']
    },
    adaptiveStyles: ['现代轻奢', '意式大平层'],
    dominantColors: ['云雾暖灰', '鞍褐焦糖'],
    sourceImageUrl: 'https://example.com/source_ensemble.jpg'
  };

  const ensembleProductAsset: ProductAsset = {
    id: 'prod-ens-001',
    sku: mockSceneEnsembleDossier.sku,
    name: mockSceneEnsembleDossier.name,
    role: 'sofa_3seat',
    priority: 'primary',
    identityLock: 'strict',
    dimensions: { width: 3200, depth: 1080, height: 950 },
    materials: ['南美半苯胺头层牛皮', '天然大理石', '羊毛地毯'],
    colors: ['云雾暖灰', '鞍褐焦糖'],
    surfaceTexture: '半苯胺真皮、大理石冰裂肌理、高密羊毛短绒',
    functionCapable: true,
    referenceImages: [
      {
        id: 'ref-1',
        type: 'front',
        objectKey: 'mock/ref-1.webp',
        publicUrl: 'http://localhost/mock-ref-1.webp',
        verified: true
      }
    ],
    adaptiveStyles: ['意式轻奢', '现代极简'],
    isEnsembleIncluded: true,
    isSceneEnsembleSuite: true,
    sceneEnsembleDossier: mockSceneEnsembleDossier,
    readoutConfidence: 97,
    lockedRules: mockSceneEnsembleDossier.placementDirectives.visualInvariants,
    provenance: 'AI_ESTIMATED',
    productionTruth: false
  };

  const spacePreset = SPACE_PROTOTYPES[0];
  const stylePreset = STYLE_PRESETS[0];
  const products = [ensembleProductAsset];
  const placementBlueprint = PlacementEngine.generateStandardBlueprint({ spacePreset, products });

  it('compiles scene master prompt with 26mm ultra-wide lens and continuous full-span grand backdrop for whole scene ensemble', () => {
    const result = SceneMasterPromptCompiler.compile({
      products,
      spacePreset,
      stylePreset,
      placementBlueprint
    });

    // 1. 验证相机镜头升级为 26mm 建筑超广角
    expect(result.positivePrompt).toMatch(/(26mm|ultra-wide architectural prime lens)/i);
    expect(result.cameraSettings.lensMm).toBe(26);

    // 2. 验证户型大开间与全幅连续背景墙（无孤立立柱）
    expect(result.positivePrompt).toMatch(/(8-10 meters bay width|continuous full-span)/i);

    // 3. 验证负向提示词中严格禁止孤立隔断立柱
    expect(result.negativePrompt).toMatch(/(isolated center pillar|freestanding partition wall|narrow dividing post)/i);

    // 4. 验证成功注入全案套组专属协同 Prompt 与套组名称
    expect(result.positivePrompt).toContain(mockSceneEnsembleDossier.placementDirectives.holisticLayoutPrompt);
    expect(result.positivePrompt).toContain(mockSceneEnsembleDossier.name);
  });

  it('compiles shoot prompts with 26mm ultra-wide A01 master lens and ensemble cohesion', () => {
    const a01Template = STANDARD_SHOT_TEMPLATES.find((s) => s.code === 'A01');
    expect(a01Template).toBeDefined();

    const shotA01: any = {
      id: 'shot-inst-a01',
      templateCode: 'A01',
      name: a01Template!.name,
      camera: a01Template!.defaultCamera,
      intent: a01Template!.intent,
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };

    const sceneMaster: any = {
      id: 'master-01',
      projectId: 'test-project',
      objectKey: 'projects/test-project/masters/A00/master-01.webp',
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
        atmosphere: true
      },
      invariants: ['26mm ultra-wide framing', 'grand 8-10m wide span backdrop']
    };

    const shootResult = ShootCompiler.compileShotPrompt({
      shot: shotA01,
      sceneMaster,
      products,
      spacePreset,
      stylePreset,
      blueprint: placementBlueprint
    });

    expect(shootResult.positivePrompt).toMatch(/(26mm|ultra-wide architectural|expansive 8-10 meters bay width)/i);
    expect(shootResult.positivePrompt).toMatch(/(continuous full-span|全景连续贯通式)/i);
    expect(shootResult.negativePrompt).toMatch(/(isolated center pillar|freestanding partition wall)/i);
    expect(shootResult.positivePrompt).toContain(mockSceneEnsembleDossier.name);
  });
});
