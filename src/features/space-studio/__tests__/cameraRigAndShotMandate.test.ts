import { describe, it, expect } from 'vitest';
import { ShootCompiler } from '../engine/shootCompiler';
import { STANDARD_SHOT_TEMPLATES } from '../data/shotTemplates';
import type { ShotInstance, SceneMaster, ProductAsset, SpacePreset, StylePreset, PlacementBlueprint } from '../../../types/spaceStudio';

describe('SpaceStudio - 机位调试与镜头专属 Mandate 效用测试', () => {
  const dummySceneMaster: SceneMaster = {
    id: 'master-01',
    projectId: 'manwah-01',
    objectKey: 'masters/master.webp',
    imageUrl: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0',
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
    promptSnapshotId: 'master-snap-01'
  };

  const dummyProducts: ProductAsset[] = [
    {
      id: 'prod-01',
      sku: 'MW-SOFA-01',
      name: '敏华芝华仕头等舱功能真皮沙发',
      role: 'sofa_3seat',
      priority: 'primary',
      identityLock: 'strict',
      referenceImages: []
    },
    {
      id: 'prod-02',
      sku: 'MW-CHAIR-01',
      name: '头等舱电动休闲单椅',
      role: 'recliner_1seat',
      priority: 'secondary',
      identityLock: 'strict',
      colors: ['极地奶白'],
      materials: ['南美进口头层牛皮'],
      referenceImages: []
    }
  ];

  const dummySpace: SpacePreset = {
    id: 'space-01',
    code: 'N-R01',
    name: '通透横厅大平层',
    propertyType: 'penthouse',
    layoutType: 'horizontal',
    zones: [],
    signatureFeatures: [],
    referenceObjectKeys: [],
    promptFragments: []
  };

  const dummyStyle: StylePreset = {
    id: 'style-01',
    name: '都会收藏家',
    code: 'METRO',
    category: 'luxury',
    colorPalette: [],
    materialSystem: [],
    lifestyleTags: [],
    recommendedProductTypes: [],
    promptFragments: [],
    negativeRules: []
  };

  const dummyBlueprint: PlacementBlueprint = {
    id: 'bp-01',
    spacePresetId: 'space-01',
    items: [],
    isLocked: true
  };

  it('1. A08 单椅五档功能状态景：精准生成 45mm 35° 侧角五档功能展示 Mandate，并锁定固定机位', () => {
    const tplA08 = STANDARD_SHOT_TEMPLATES.find(t => t.code === 'A08')!;
    const shotA08: ShotInstance = {
      id: 'shot-a08',
      templateCode: 'A08',
      name: tplA08.name,
      camera: tplA08.defaultCamera,
      intent: tplA08.intent,
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };

    const compiled = ShootCompiler.compileShotPrompt({
      shot: shotA08,
      sceneMaster: dummySceneMaster,
      products: dummyProducts,
      spacePreset: dummySpace,
      stylePreset: dummyStyle,
      blueprint: dummyBlueprint
    });

    // 验证置顶 Mandate 强行约束五档状态展示且机位固定
    expect(compiled.positivePrompt).toContain('[SHOT MANDATE - A08 RECLINER 5-MODE FUNCTION SHOWCASE');
    expect(compiled.positivePrompt).toContain('45mm');
    expect(compiled.positivePrompt).toContain('35-degree');
    expect(compiled.negativePrompt).toContain('shifting camera angle');
  });

  it('2. A02 45° 3+1 成套组合全景：同框展现 3人位主沙发 + 单椅 + 茶几', () => {
    const tplA02 = STANDARD_SHOT_TEMPLATES.find(t => t.code === 'A02')!;
    const shotA02: ShotInstance = {
      id: 'shot-a02',
      templateCode: 'A02',
      name: tplA02.name,
      camera: tplA02.defaultCamera,
      intent: tplA02.intent,
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };

    const compiled = ShootCompiler.compileShotPrompt({
      shot: shotA02,
      sceneMaster: dummySceneMaster,
      products: dummyProducts,
      spacePreset: dummySpace,
      stylePreset: dummyStyle,
      blueprint: dummyBlueprint
    });

    expect(compiled.positivePrompt).toContain('[SHOT MANDATE - A02 45-DEGREE 3+1 ENSEMBLE VIEW');
    expect(compiled.positivePrompt).toContain('38mm prime lens at 115cm height');
    expect(compiled.positivePrompt).toContain('dynamic 40-to-45 degree side isometric perspective');
    expect(compiled.positivePrompt).toContain('complete 3+1 furniture ensemble');
    expect(compiled.negativePrompt).toContain('flat frontal mugshot');
    expect(compiled.negativePrompt).toContain('cropping out matching side chair');
  });

  it('3. A03 3人位主沙发组合焦点景：聚焦 3人位主沙发，严格收起功能位，自然裁切单椅', () => {
    const tplA03 = STANDARD_SHOT_TEMPLATES.find(t => t.code === 'A03')!;
    const shotA03: ShotInstance = {
      id: 'shot-a03',
      templateCode: 'A03',
      name: tplA03.name,
      camera: tplA03.defaultCamera,
      intent: tplA03.intent,
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };

    const compiled = ShootCompiler.compileShotPrompt({
      shot: shotA03,
      sceneMaster: dummySceneMaster,
      products: dummyProducts,
      spacePreset: dummySpace,
      stylePreset: dummyStyle,
      blueprint: dummyBlueprint
    });

    expect(compiled.positivePrompt).toContain('[SHOT MANDATE - A03 HERO 3-SEATER LIVING FOCUS');
    expect(compiled.positivePrompt).toContain('50mm portrait standard prime lens at 110cm eye-level height');
    expect(compiled.positivePrompt).toContain('hero three-seater main sofa');
    expect(compiled.positivePrompt).toContain('all motorized footrests and recliners completely RETRACTED AND CLOSED');
    expect(compiled.positivePrompt).toContain('STRICTLY FOCUS ON THE THREE-SEATER MAIN SOFA ALONE');
    expect(compiled.negativePrompt).toContain('camera centered on single accent chair');
    expect(compiled.negativePrompt).toContain('deployed footrest');
    expect(compiled.negativePrompt).toContain('side chair');
    expect(compiled.negativePrompt).not.toContain('closed footrest');
  });

  it('4. 机位动态调试联动：当用户修改滑块调节焦距与视高时，编译指令即时无缝传导', () => {
    const tplA01 = STANDARD_SHOT_TEMPLATES.find(t => t.code === 'A01')!;
    const customShot: ShotInstance = {
      id: 'shot-a01-custom',
      templateCode: 'A01',
      name: '自定义调试视角',
      camera: {
        ...tplA01.defaultCamera,
        lensMm: 24, // 调节至超广角 24mm
        heightCm: 60, // 调节至贴地 60cm 仰拍
        yawDeg: 42 // 调节至右侧 42° 偏角
      },
      intent: tplA01.intent,
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };

    const compiled = ShootCompiler.compileShotPrompt({
      shot: customShot,
      sceneMaster: dummySceneMaster,
      products: dummyProducts,
      spacePreset: dummySpace,
      stylePreset: dummyStyle,
      blueprint: dummyBlueprint
    });

    // 验证用户调试的机位参数被 100% 传导到专业摄影语义词中
    expect(compiled.positivePrompt).toContain('ultra-wide 24mm architectural lens');
    expect(compiled.positivePrompt).toContain('60cm above finished floor looking upward');
    expect(compiled.positivePrompt).toContain('42° yaw');
  });

  it('5. 真实用户微调场景 (图3 A08 调为 28mm/155cm/3:4)：彻底打通机位与画幅，杜绝硬编码 85mm 冲突', () => {
    const tplA08 = STANDARD_SHOT_TEMPLATES.find(t => t.code === 'A08')!;
    const userModifiedShotA08: ShotInstance = {
      id: 'shot-a08-user-tweaked',
      templateCode: 'A08',
      name: tplA08.name,
      aspectRatio: '3:4',
      camera: {
        ...tplA08.defaultCamera,
        lensMm: 28, // 用户在高级面板拖至 28mm 广角/人文
        heightCm: 155, // 用户在高级面板拖至 155cm 俯瞰大视野
        yawDeg: -6, // 用户在高级面板调至 -6° 水平偏角
        pitchDeg: 5, // 用户在高级面板调至 +5° 仰角
        framing: 'detail' // 保持 detail 构图
      },
      intent: tplA08.intent,
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };

    const compiled = ShootCompiler.compileShotPrompt({
      shot: userModifiedShotA08,
      sceneMaster: dummySceneMaster,
      products: dummyProducts,
      spacePreset: dummySpace,
      stylePreset: dummyStyle,
      blueprint: dummyBlueprint,
      aspectRatio: '3:4'
    });

    // 1. 验证动态自适应 Mandate，绝不能出现写死的冲突
    expect(compiled.positivePrompt).toContain('[SHOT MANDATE - A08 RECLINER 5-MODE FUNCTION SHOWCASE (Adjusted 28mm/155cm)]');
    expect(compiled.positivePrompt).not.toContain('Studio Sample Recliner 5 Postures');

    // 2. 验证机位高级参数被 100% 转换为高权重专业摄影语义词
    expect(compiled.positivePrompt).toContain('28mm architectural prime lens');
    expect(compiled.positivePrompt).toContain('elevated high-angle overview at 155cm above finished floor');
    expect(compiled.positivePrompt).toContain('-6° yaw angle');
    expect(compiled.positivePrompt).toContain('+5° pitch tilt');

    // 3. 验证画幅比例构图指令被 100% 深度融合进 prompt
    expect(compiled.positivePrompt).toContain('proportional 3:4 vertical editorial composition');
    expect(compiled.aspectRatio).toBe('3:4');

    // 4. 验证负向词智能自适应：因为焦距是 28mm 广角，绝对不能误杀排除 wide room panorama
    expect(compiled.negativePrompt).not.toContain('wide room panorama');

    // 5. 验证编译输出的 cameraSpec 精准匹配用户设定的数值
    expect(compiled.cameraSpec).toEqual({
      lensMm: 28,
      heightCm: 155,
      yawDeg: -6,
      pitchDeg: 5,
      framing: 'detail'
    });
  });
});
