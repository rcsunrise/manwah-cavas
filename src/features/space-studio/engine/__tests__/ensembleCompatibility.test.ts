// src/features/space-studio/engine/__tests__/ensembleCompatibility.test.ts
import { describe, it, expect } from 'vitest';
import { PlacementEngine } from '../placementEngine';
import { SceneMasterPromptCompiler } from '../sceneMasterPromptCompiler';
import { ShootCompiler } from '../shootCompiler';
import { ProductAsset, SpacePreset, StylePreset, ShotInstance } from '../../../../types/spaceStudio';

describe('Product Ensemble & Smart Compatibility Engine', () => {
  const dummySpace: SpacePreset = {
    id: 'space-01',
    code: 'N-R01',
    name: '雅致大平层',
    propertyType: 'flat',
    layoutType: 'horizontal',
    zones: [{ id: 'living_zone', name: '主客厅区', primaryAxis: 'x', coveragePercentage: 60 }],
    signatureFeatures: ['大面宽采光'],
    referenceObjectKeys: [],
    promptFragments: ['expansive living space']
  };

  const dummyStyle: StylePreset = {
    id: 'style-01',
    name: '意式轻奢',
    code: 'ITALIAN_LUX',
    category: 'modern',
    colorPalette: ['Warm Greige', 'Obsidian Grey'],
    materialSystem: ['Semi-aniline Leather', 'Brushed Metal'],
    lifestyleTags: ['Luxury'],
    recommendedProductTypes: ['sofa_3seat'],
    promptFragments: ['italian luxury aesthetics'],
    negativeRules: []
  };

  const products: ProductAsset[] = [
    {
      id: 'prod-sofa',
      name: '三人位真皮主沙发',
      role: 'sofa_3seat',
      priority: 'primary',
      identityLock: 'strict',
      dimensions: { width: 3100, depth: 1080, height: 950 },
      materials: ['南美半苯胺牛皮'],
      colors: ['云雾暖灰'],
      adaptiveStyles: ['意式轻奢', '现代极简'],
      isEnsembleIncluded: true,
      referenceImages: []
    },
    {
      id: 'prod-recliner',
      name: '单人电动功能躺椅',
      role: 'recliner_1seat',
      priority: 'secondary',
      identityLock: 'strict',
      dimensions: { width: 920, depth: 980, height: 1040 },
      materials: ['头层黄牛皮'],
      colors: ['劳斯莱斯橙'],
      adaptiveStyles: ['意式轻奢', '轻奢高定'],
      isEnsembleIncluded: true,
      referenceImages: []
    },
    {
      id: 'prod-table',
      name: '奢石双拼茶几',
      role: 'coffee_table',
      priority: 'secondary',
      identityLock: 'normal',
      dimensions: { width: 1200, depth: 1200, height: 380 },
      materials: ['天然奢石'],
      colors: ['透光奢石纹'],
      adaptiveStyles: ['意式轻奢'],
      isEnsembleIncluded: false, // 模拟未勾选关联
      referenceImages: []
    }
  ];

  it('excludes unchecked products from PlacementBlueprint', () => {
    const bp = PlacementEngine.generateStandardBlueprint({
      spacePreset: dummySpace,
      products
    });

    // 应该只有 sofa 和 recliner，未勾选关联的 table 不会出现在蓝图中
    expect(bp.items.length).toBe(2);
    expect(bp.items.some((i) => i.assetId === 'prod-sofa')).toBe(true);
    expect(bp.items.some((i) => i.assetId === 'prod-recliner')).toBe(true);
    expect(bp.items.some((i) => i.assetId === 'prod-table')).toBe(false);
  });

  it('excludes unchecked products from SceneMasterPromptCompiler output', () => {
    const bp = PlacementEngine.generateStandardBlueprint({
      spacePreset: dummySpace,
      products
    });

    const compiled = SceneMasterPromptCompiler.compile({
      products,
      spacePreset: dummySpace,
      stylePreset: dummyStyle,
      placementBlueprint: bp
    });

    // 正向提示词应包含已关联的主沙发与单人躺椅，不应包含未关联的茶几
    expect(compiled.positivePrompt).toContain('三人位真皮主沙发');
    expect(compiled.positivePrompt).toContain('单人电动功能躺椅');
    expect(compiled.positivePrompt).not.toContain('奢石双拼茶几');
  });

  it('includes table when it is checked (isEnsembleIncluded = true)', () => {
    const updatedProducts = products.map((p) =>
      p.id === 'prod-table' ? { ...p, isEnsembleIncluded: true } : p
    );

    const bp = PlacementEngine.generateStandardBlueprint({
      spacePreset: dummySpace,
      products: updatedProducts
    });

    expect(bp.items.length).toBe(3);
    expect(bp.items.some((i) => i.assetId === 'prod-table')).toBe(true);
  });
});
