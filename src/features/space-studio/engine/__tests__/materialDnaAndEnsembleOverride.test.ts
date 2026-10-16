import { describe, it, expect } from 'vitest';
import { translateColorToEnglish, translateMaterialToEnglish } from '../materialDnaTranslator';
import { ShootCompiler } from '../shootCompiler';
import { SceneMasterPromptCompiler } from '../sceneMasterPromptCompiler';
import {
  ProductAsset,
  ShotInstance,
  SpacePreset,
  StylePreset,
  PlacementBlueprint,
  SceneMaster
} from '../../../../types/spaceStudio';

describe('Material DNA Translator and Ensemble Matching Override', () => {
  it('correctly translates Chinese furniture colors without empty string erasure', () => {
    // 极地奶白
    const milkWhite = translateColorToEnglish('极地奶白');
    expect(milkWhite).toContain('polar milk-white');
    expect(milkWhite).not.toContain('warm cognac amber');

    // 象牙灰
    const ivoryGreige = translateColorToEnglish('象牙灰');
    expect(ivoryGreige).toContain('ivory greige');
    expect(ivoryGreige).not.toContain('warm cognac amber');

    // 干邑暖橙
    const cognac = translateColorToEnglish('干邑暖橙 (Cognac Amber)');
    expect(cognac).toContain('Cognac Amber');

    // 默认兜底
    const emptyFallback = translateColorToEnglish('', 'default-greige');
    expect(emptyFallback).toBe('default-greige');
  });

  it('correctly translates Chinese materials', () => {
    const leather = translateMaterialToEnglish('头层牛皮');
    expect(leather).toContain('genuine top-grain');

    const marble = translateMaterialToEnglish('潘多拉天然奢石');
    expect(marble).toContain('Pandora');
  });

  it('ShootCompiler injects secondary matched product into mustInclude and override clauses', () => {
    const mockProducts: ProductAsset[] = [
      {
        id: 'sofa-1',
        sku: 'MW-SOFA-01',
        name: '芝华仕三人位真皮沙发',
        role: 'sofa_3seat',
        priority: 'primary',
        isEnsembleIncluded: true,
        colors: ['象牙灰'],
        materials: ['头层牛皮'],
        identityLock: 'strict',
        referenceImages: []
      } as unknown as ProductAsset,
      {
        id: 'chair-1',
        sku: 'MW-CHAIR-01',
        name: '芝华仕头等舱电动单椅',
        role: 'recliner_1seat',
        priority: 'secondary',
        isEnsembleIncluded: true,
        colors: ['极地奶白'],
        materials: ['头层牛皮'],
        identityLock: 'normal',
        referenceImages: [{ id: 'ref-1', publicUrl: 'https://example.com/chair.jpg', type: 'front', objectKey: 'key', verified: true }]
      } as unknown as ProductAsset
    ];

    const mockShot: ShotInstance = {
      id: 'shot-a01',
      templateCode: 'A01',
      name: '空间主大全景',
      camera: {
        lensMm: 28,
        heightCm: 140,
        yawDeg: 0,
        pitchDeg: -3,
        rollDeg: 0,
        framing: 'wide',
        target: { type: 'zone', id: 'living_room' },
        mustInclude: [],
        mustExclude: []
      },
      intent: {
        intentCode: 'SI-01',
        name: '空间与产品平衡',
        productDominancePct: 45,
        backgroundSuppression: 'low',
        maxOcclusionPct: 5,
        description: '空间全景'
      },
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };

    const mockSpace: SpacePreset = {
      id: 'sp-01',
      code: 'SP-01',
      name: '都会大平层',
      promptFragments: ['modern open floor plan']
    } as unknown as SpacePreset;

    const mockStyle: StylePreset = {
      id: 'st-01',
      name: '意式轻奢',
      negativeRules: ['clutter']
    } as unknown as StylePreset;

    const mockBlueprint: PlacementBlueprint = {
      id: 'bp-01',
      spaceId: 'sp-01',
      isLocked: true,
      items: [
        {
          role: 'sofa_3seat',
          zoneId: 'Z01',
          dimensions: { width: 2200, depth: 950, height: 920 },
          boundingRadius: 1200,
          isHero: true,
          anchorState: 'grounded'
        },
        {
          role: 'recliner_1seat',
          zoneId: 'Z02',
          dimensions: { width: 1020, depth: 980, height: 1050 },
          boundingRadius: 600,
          isHero: false,
          anchorState: 'grounded'
        }
      ]
    } as unknown as PlacementBlueprint;

    const mockMaster: SceneMaster = {
      id: 'm-1',
      projectId: 'p-1',
      objectKey: '',
      isLocked: true,
      lockedAt: '',
      promptSnapshotId: '',
      locks: {
        productIdentity: true,
        placement: true,
        architecture: true,
        style: true,
        material: true,
        lighting: true,
        camera: true,
        human: false
      }
    };

    const compiled = ShootCompiler.compileShotPrompt({
      shot: mockShot,
      sceneMaster: mockMaster,
      products: mockProducts,
      spacePreset: mockSpace,
      stylePreset: mockStyle,
      blueprint: mockBlueprint
    });

    // 检查提示词：必须包含奶白色单椅覆盖条款，不能只包含主沙发
    expect(compiled.positivePrompt).toContain('polar milk-white');
    expect(compiled.positivePrompt).toContain('MANDATORY MATCHING ARMCHAIR');
    expect(compiled.positivePrompt).toContain('accent power recliner chair in pristine polar milk-white');
  });

  it('guarantees 2-seater sofa is strictly locked to 2 cushions with 3-seater negative exclusions', () => {
    const sofa2s: ProductAsset = {
      id: 'sofa-2s',
      sku: 'MW-CH-7588-2S',
      name: '极地奶白双人位电动功能沙发',
      role: 'sofa_2seat',
      priority: 'primary',
      isEnsembleIncluded: true,
      colors: ['极地奶白'],
      materials: ['亲肤科技超纤布'],
      identityLock: 'strict',
      referenceImages: []
    } as unknown as ProductAsset;

    const mockShot: ShotInstance = {
      id: 'shot-a01',
      templateCode: 'A01',
      name: '空间主大全景',
      camera: {
        lensMm: 28,
        heightCm: 140,
        yawDeg: 0,
        pitchDeg: -3,
        rollDeg: 0,
        framing: 'wide',
        target: { type: 'zone', id: 'living_room' },
        mustInclude: [],
        mustExclude: []
      },
      intent: {
        intentCode: 'SI-01',
        name: '空间与产品平衡',
        productDominancePct: 45,
        backgroundSuppression: 'low',
        maxOcclusionPct: 5,
        description: '空间全景'
      },
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };

    const mockSpace: SpacePreset = {
      id: 'sp-01',
      code: 'SP-01',
      name: '极简大平层',
      promptFragments: ['minimalist open plan']
    } as unknown as SpacePreset;

    const mockStyle: StylePreset = {
      id: 'st-01',
      name: '现代极简',
      negativeRules: []
    } as unknown as StylePreset;

    // 1. 测试 ShootCompiler
    const compiled = ShootCompiler.compileShotPrompt({
      shot: mockShot,
      products: [sofa2s],
      spacePreset: mockSpace,
      stylePreset: mockStyle
    } as any);

    expect(compiled.positivePrompt).toContain('generous wide-body two-seater power motion sofa');
    expect(compiled.positivePrompt).toContain('EXACTLY TWO wide seating cushions');
    expect(compiled.positivePrompt).toContain('strictly NOT a three-seater sofa');
    expect(compiled.negativePrompt).toContain('three-seater sofa');
    expect(compiled.negativePrompt).toContain('3 seating cushions');
    expect(compiled.negativePrompt).toContain('middle seat cushion');
    // 布艺科技布不漂移为真皮
    expect(compiled.negativePrompt).toContain('glossy leather');

    // 2. 测试 SceneMasterPromptCompiler
    const masterCompiled = SceneMasterPromptCompiler.compile({
      products: [sofa2s],
      spacePreset: mockSpace,
      stylePreset: mockStyle
    } as any);

    expect(masterCompiled.positivePrompt).toContain('generous wide-body two-seater power motion sofa');
    expect(masterCompiled.positivePrompt).toContain('EXACTLY TWO SEATS (2 individual expansive seating cushions');
    expect(masterCompiled.positivePrompt).toContain('strictly NOT a three-seater sofa');
    expect(masterCompiled.negativePrompt).toContain('three-seater sofa');
    expect(masterCompiled.negativePrompt).toContain('3 seating cushions');
  });

  it('preserves high-tech microfiber fabric and caramel brown armless lounge chair without leather or footrest mutation', () => {
    // 材质翻译断言
    const matEn = translateMaterialToEnglish('亲肤科技超纤布');
    expect(matEn).toContain('microfiber upholstery fabric');
    expect(matEn.toLowerCase()).not.toContain('leather');

    // 焦糖棕色彩断言：绝不携带 leather
    const colEn = translateColorToEnglish('焦糖棕');
    expect(colEn).toContain('caramel brown');
    expect(colEn.toLowerCase()).not.toContain('leather');

    const primarySofa: ProductAsset = {
      id: 'sofa-2s',
      sku: 'MW-CH-7588-2S',
      name: '极地奶白双人位电动功能沙发',
      role: 'sofa_2seat',
      priority: 'primary',
      isEnsembleIncluded: true,
      colors: ['极地奶白'],
      materials: ['亲肤科技超纤布'],
      referenceImages: []
    } as unknown as ProductAsset;

    const armlessChair: ProductAsset = {
      id: 'chair-armless',
      sku: 'MW-CHAIR-LC',
      name: '焦糖棕无扶手休闲单椅',
      role: 'lounge_chair',
      priority: 'secondary',
      isEnsembleIncluded: true,
      colors: ['焦糖棕'],
      materials: ['粗花呢/麻感织物'],
      referenceImages: [{ id: 'ref-2', publicUrl: 'https://example.com/chair.jpg' }]
    } as unknown as ProductAsset;

    const mockShot: ShotInstance = {
      id: 'shot-a01',
      templateCode: 'A01',
      name: '空间主大全景',
      camera: {
        lensMm: 28,
        heightCm: 140,
        yawDeg: 0,
        pitchDeg: -3,
        rollDeg: 0,
        framing: 'wide',
        target: { type: 'zone', id: 'living_room' },
        mustInclude: [],
        mustExclude: []
      },
      intent: {
        intentCode: 'SI-01',
        name: '空间与产品平衡',
        productDominancePct: 45,
        backgroundSuppression: 'low',
        maxOcclusionPct: 5,
        description: '空间全景'
      },
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };

    const mockSpace: SpacePreset = {
      id: 'sp-01',
      code: 'SP-01',
      name: '极简大平层',
      promptFragments: ['minimalist open plan']
    } as unknown as SpacePreset;

    const mockStyle: StylePreset = {
      id: 'st-01',
      name: '现代极简',
      negativeRules: []
    } as unknown as StylePreset;

    const compiled = ShootCompiler.compileShotPrompt({
      shot: mockShot,
      products: [primarySofa, armlessChair],
      spacePreset: mockSpace,
      stylePreset: mockStyle
    } as any);

    // 验证无扶手单椅指令
    expect(compiled.positivePrompt).toContain('MANDATORY MATCHING ACCENT CHAIR: authentic modern armless lounge chair');
    expect(compiled.positivePrompt).toContain('strictly NO armrests, strictly NO extended footrest');
    // 验证负向约束：排斥大扶手和展开脚托
    expect(compiled.negativePrompt).toContain('bulky recliner footrest on lounge chair');
    expect(compiled.negativePrompt).toContain('thick armrests on armless chair');
    // 验证焦糖棕不被误判为负向封杀
    expect(compiled.negativePrompt).not.toContain('brown armchair');
  });
});
