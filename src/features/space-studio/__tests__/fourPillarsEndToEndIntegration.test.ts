import { describe, it, expect } from 'vitest';
import { ShootCompiler } from '../engine/shootCompiler';
import { PlacementEngine } from '../engine/placementEngine';
import { SPACE_PROTOTYPES } from '../data/spacePresets';
import { STYLE_PRESETS } from '../data/stylePresets';
import { STANDARD_SHOT_TEMPLATES } from '../data/shotTemplates';
import { ProductAsset, ShotInstance, SceneMaster } from '../../../types/spaceStudio';

describe('四要素全链路闭环 (Space Preset --- Style Preset --- Product Ensemble --- Camera Rig)', () => {
  const spaceNR06 = SPACE_PROTOTYPES.find((s) => s.code === 'N-R06')!;
  const styleMetropolitan = STYLE_PRESETS.find((st) => st.code === 'ST-01')!;

  const primarySofa: ProductAsset = {
    id: 'prod-sofa-mw-01',
    sku: 'MW-CH-2023-3S',
    name: '芝华仕现代轻奢实木点缀三人位真皮沙发',
    role: 'sofa_3seat',
    priority: 'primary',
    identityLock: 'strict',
    dimensions: { width: 2950, depth: 1050, height: 940 },
    materials: ['优质头层牛皮 (半苯胺)'],
    colors: ['象牙浅米灰'],
    surfaceTexture: '细腻平纹半苯胺牛皮，手工双缝线',
    functionCapable: true,
    referenceImages: [
      { id: 'ref-1', type: 'front', objectKey: 'uploads/sofa.webp', verified: true }
    ],
    lockedRules: ['锁定 1:1 工业真值宽高比'],
    provenance: 'MANUAL_CONFIRMED',
    productionTruth: true,
    sourceType: 'preset'
  };

  const secondaryRecliner: ProductAsset = {
    id: 'prod-rec-01',
    sku: 'MW-REC-01',
    name: '头等舱电动休闲单椅',
    role: 'recliner_1seat',
    priority: 'secondary',
    isEnsembleIncluded: true, // 已关联场景
    identityLock: 'strict',
    dimensions: { width: 950, depth: 980, height: 1020 },
    materials: ['头层半苯胺牛皮'],
    colors: ['极地奶白'],
    functionCapable: true,
    referenceImages: [
      { id: 'ref-2', type: 'front', objectKey: 'uploads/recliner.webp', verified: true }
    ],
    provenance: 'MANUAL_CONFIRMED',
    productionTruth: true,
    sourceType: 'preset'
  };

  const dummyMaster: SceneMaster = {
    id: 'master-01',
    projectId: 'test-project',
    objectKey: 'master/a00.webp',
    isLocked: true,
    lockedAt: new Date().toISOString(),
    aspectRatio: '3:4',
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
    promptSnapshotId: 'snap-01'
  };

  it('1. 空间户型与产品拓扑 (Placement Engine) 严格绑定', () => {
    const blueprint = PlacementEngine.generateStandardBlueprint({
      spacePreset: spaceNR06,
      products: [primarySofa, secondaryRecliner]
    });

    expect(blueprint.isLocked).toBe(true);
    expect(blueprint.spacePresetId).toBe(spaceNR06.id);

    // 校验沙发布局在天际主会客厅 zone 中
    const sofaItem = blueprint.items.find((i) => i.role === 'sofa_3seat');
    expect(sofaItem).toBeDefined();
    expect(sofaItem?.zoneId).toBe(spaceNR06.zones[0].id); // sky_salon

    // 校验单椅处于 35 度黄金围合夹角
    const reclinerItem = blueprint.items.find((i) => i.role === 'recliner_1seat');
    expect(reclinerItem).toBeDefined();
    expect(reclinerItem?.rotationDeg).toBe(35);
  });

  it('2. A00 空间母版统领编译：融合 4.2m 层高、都会收藏家硬装奢石、主副产品与基准机位', () => {
    const a00Shot: ShotInstance = {
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
        mustInclude: ['sofa_3seat', 'coffee_table'],
        mustExclude: []
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
    };

    const blueprint = PlacementEngine.generateStandardBlueprint({
      spacePreset: spaceNR06,
      products: [primarySofa, secondaryRecliner]
    });

    const compiled = ShootCompiler.compileShotPrompt({
      shot: a00Shot,
      sceneMaster: dummyMaster,
      products: [primarySofa, secondaryRecliner],
      spacePreset: spaceNR06,
      stylePreset: styleMetropolitan,
      blueprint
    });

    // 校验 A00 专有空间母版 Shot Mandate
    expect(compiled.positivePrompt).toContain('[SHOT MANDATE - A00 SCENE MASTER FOUNDATION]');
    expect(compiled.positivePrompt).toContain('4.2m high soaring ceiling volume');

    // 校验户型核心特征
    expect(compiled.positivePrompt).toContain('high-altitude penthouse salon above the city clouds');
    expect(compiled.positivePrompt).toContain('architectural feature: 4.2米净高顶层云端会客厅');

    // 校验美学硬装材质体系与 Prompt 碎片 (已升级为专业英文视觉材质与空间主色调)
    expect(compiled.positivePrompt).toContain('metropolitan art collector interior style');
    expect(compiled.positivePrompt).toContain('architectural finishes: polished Pandora crystallite luxury marble, matte smoked dark oak architectural paneling, brushed antique bronze trims');
    expect(compiled.positivePrompt).toContain('[DOMINANT SPATIAL COLOR TONE & INTERIOR PALETTE MANDATE: 都会收藏家');

    // 校验美学硬装负向规则
    expect(compiled.negativePrompt).toContain('cheap laminate');
    expect(compiled.negativePrompt).toContain('vibrant neon colors');

    // 校验导出元数据字段
    expect(compiled.roomName).toBe('顶层天际会所大宅');
    expect(compiled.spaceCode).toBe('N-R06');
    expect(compiled.styleName).toBe('都会收藏家');
    expect(compiled.styleCode).toBe('ST-01');
  });

  it('3. 衍生镜头 A02 (主位舒享生活) 继承空间与硬装同时严格执行机位第一性原则', () => {
    const a02Template = STANDARD_SHOT_TEMPLATES.find((t) => t.code === 'A02')!;
    const a02Shot: ShotInstance = {
      id: 'shot-a02',
      templateCode: 'A02',
      name: a02Template.name,
      camera: { ...a02Template.defaultCamera },
      intent: { ...a02Template.intent },
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };

    const blueprint = PlacementEngine.generateStandardBlueprint({
      spacePreset: spaceNR06,
      products: [primarySofa, secondaryRecliner]
    });

    const compiledA02 = ShootCompiler.compileShotPrompt({
      shot: a02Shot,
      sceneMaster: dummyMaster,
      products: [primarySofa, secondaryRecliner],
      spacePreset: spaceNR06,
      stylePreset: styleMetropolitan,
      blueprint
    });

    // A02 置顶机位 Mandate 与 45mm 45° 组合摄影词
    expect(compiledA02.positivePrompt).toContain('[SHOT MANDATE - A02 45-DEGREE 3+1 ENSEMBLE VIEW');
    expect(compiledA02.positivePrompt).toContain('45mm standard-wide prime lens at 115cm height');
    expect(compiledA02.positivePrompt).toContain('dynamic 40-to-45 degree side isometric perspective');
    expect(compiledA02.negativePrompt).toContain('flat frontal mugshot');

    // 空间硬装背景继承
    expect(compiledA02.positivePrompt).toContain('顶层天际会所大宅');
    expect(compiledA02.positivePrompt).toContain('都会收藏家');
  });

  it('4. 搭配副产品勾选与解绑，动态影响拓扑与提示词编译', () => {
    // 场景 A: 包含副单椅
    const bpWithRecliner = PlacementEngine.generateStandardBlueprint({
      spacePreset: spaceNR06,
      products: [primarySofa, secondaryRecliner]
    });
    expect(bpWithRecliner.items.some((i) => i.role === 'recliner_1seat')).toBe(true);

    // 场景 B: 取消副单椅勾选 (isEnsembleIncluded = false)
    const unselectedRecliner: ProductAsset = { ...secondaryRecliner, isEnsembleIncluded: false };
    const bpWithoutRecliner = PlacementEngine.generateStandardBlueprint({
      spacePreset: spaceNR06,
      products: [primarySofa, unselectedRecliner]
    });
    expect(bpWithoutRecliner.items.some((i) => i.role === 'recliner_1seat')).toBe(false);

    const a01Template = STANDARD_SHOT_TEMPLATES.find((t) => t.code === 'A01')!;
    const a01Shot: ShotInstance = {
      id: 'shot-a01',
      templateCode: 'A01',
      name: a01Template.name,
      camera: { ...a01Template.defaultCamera },
      intent: { ...a01Template.intent },
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };

    const compiledNoRecliner = ShootCompiler.compileShotPrompt({
      shot: a01Shot,
      sceneMaster: dummyMaster,
      products: [primarySofa, unselectedRecliner],
      spacePreset: spaceNR06,
      stylePreset: styleMetropolitan,
      blueprint: bpWithoutRecliner
    });

    // 提示词中不再出现强制匹配单椅指令
    expect(compiledNoRecliner.positivePrompt).not.toContain('MANDATORY MATCHING ARMCHAIR');
  });
});
