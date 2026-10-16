// src/features/space-studio/engine/__tests__/styleRecommendationEngine.test.ts
import { describe, it, expect } from 'vitest';
import { recommendStylesForProduct } from '../styleRecommendationEngine';
import { ProductAsset } from '../../../../types/spaceStudio';
import { STYLE_PRESETS } from '../../data/stylePresets';

describe('Style Recommendation Engine (欧美与东方空间风格智能推荐)', () => {
  it('correctly recommends UK-01 (94%), NC-01 (91%), US-01 (86%) for Greenwich classic deep brown leather sofa', () => {
    const greenwichProduct: ProductAsset = {
      id: 'prod-greenwich',
      name: 'Greenwich 格林威治经典真皮功能沙发',
      role: 'sofa_3seat',
      priority: 'primary',
      identityLock: 'strict',
      dimensions: { width: 3100, depth: 1050, height: 950 },
      materials: ['南美进口头层牛皮', '实木多层板', '高回弹海绵'],
      colors: ['深棕真皮', 'Dark Walnut Brown'],
      functionCapable: true,
      referenceImages: [],
      structuralFeatures: [{ name: '经典英伦厚扶手', description: '饱满卷边扶手' }]
    };

    const recommendations = recommendStylesForProduct(greenwichProduct, STYLE_PRESETS, 3);

    expect(recommendations.length).toBe(3);

    const top1 = recommendations[0];
    const top2 = recommendations[1];
    const top3 = recommendations[2];

    expect(top1.style.code).toBe('UK-01');
    expect(top1.score).toBeGreaterThanOrEqual(90);

    expect(top2.style.code).toBe('NC-01');
    expect(top2.score).toBeGreaterThanOrEqual(85);

    expect(top3.style.code).toBe('US-01');
    expect(top3.score).toBeGreaterThanOrEqual(80);
  });
});
