// src/features/space-studio/engine/__tests__/shotMultiViewTruthLock.test.ts
import { describe, it, expect } from 'vitest';
import { ShootCompiler } from '../shootCompiler';
import { ProductAsset, ProductReference } from '../../../../types/spaceStudio';

describe('产品多视角工业真值联动与机位自适应锁定 (Multi-View Angle Truth Locking & Camera DNA Binding)', () => {
  const mockProductWithMultiViews: ProductAsset = {
    id: 'prod-test-sofa-001',
    sku: 'MW-TEST-3S',
    name: '敏华头等舱多视角真皮沙发',
    role: 'sofa_3seat',
    priority: 'primary',
    identityLock: 'strict',
    dimensions: { width: 3150, depth: 1080, height: 950 },
    materials: ['南美半苯胺头层牛皮'],
    colors: ['云雾暖灰 (Warm Greige)'],
    referenceImages: [
      {
        id: 'ref-front',
        type: 'front',
        objectKey: 'projects/p1/refs/front.webp',
        publicUrl: 'https://storage.googleapis.com/test/front.webp',
        verified: true
      },
      {
        id: 'ref-45deg',
        type: '45_deg',
        objectKey: 'projects/p1/refs/45deg.webp',
        publicUrl: 'https://storage.googleapis.com/test/45deg.webp',
        verified: true
      },
      {
        id: 'ref-side',
        type: 'side',
        objectKey: 'projects/p1/refs/side.webp',
        publicUrl: 'https://storage.googleapis.com/test/side.webp',
        verified: true
      },
      {
        id: 'ref-open',
        type: 'function_open',
        objectKey: 'projects/p1/refs/open.webp',
        publicUrl: 'https://storage.googleapis.com/test/open.webp',
        verified: true
      },
      {
        id: 'ref-detail',
        type: 'detail',
        objectKey: 'projects/p1/refs/detail.webp',
        publicUrl: 'https://storage.googleapis.com/test/detail.webp',
        verified: true
      }
    ],
    productionTruth: true,
    provenance: 'MANUAL_CONFIRMED'
  };

  it('A02 镜头 (45度斜侧透视全景) 严格优选 45_deg 斜侧视角参考图', () => {
    const matched = ShootCompiler.selectBestProductReferenceForShot(mockProductWithMultiViews, 'A02');
    expect(matched.viewType).toBe('45_deg');
    expect(matched.reference?.id).toBe('ref-45deg');
    expect(matched.reference?.publicUrl).toContain('45deg.webp');
  });

  it('A06 镜头 (零靠墙极限侧截面) 严格优选 side 正侧面剪影参考图', () => {
    const matched = ShootCompiler.selectBestProductReferenceForShot(mockProductWithMultiViews, 'A06');
    expect(matched.viewType).toBe('side');
    expect(matched.reference?.id).toBe('ref-side');
    expect(matched.reference?.publicUrl).toContain('side.webp');
  });

  it('A08 镜头 (五档电动展开与工艺特写) 严格优选 function_open 展开态参考图', () => {
    const matched = ShootCompiler.selectBestProductReferenceForShot(mockProductWithMultiViews, 'A08');
    expect(matched.viewType).toBe('function_open');
    expect(matched.reference?.id).toBe('ref-open');
    expect(matched.reference?.publicUrl).toContain('open.webp');
  });

  it('A00 空间母版与 A01 正大视角默认优选 front 正视图', () => {
    const matchedA00 = ShootCompiler.selectBestProductReferenceForShot(mockProductWithMultiViews, 'A00');
    expect(matchedA00.viewType).toBe('front');
    expect(matchedA00.reference?.id).toBe('ref-front');

    const matchedA01 = ShootCompiler.selectBestProductReferenceForShot(mockProductWithMultiViews, 'A01');
    expect(matchedA01.viewType).toBe('front');
    expect(matchedA01.reference?.id).toBe('ref-front');
  });

  it('当单品缺少 45 度视角时，平滑回退到 front 或第一张有效切片，绝不中断抛错', () => {
    const productWithout45: ProductAsset = {
      ...mockProductWithMultiViews,
      referenceImages: [
        {
          id: 'ref-crop-only',
          type: 'front',
          objectKey: 'projects/p1/refs/crop.webp',
          publicUrl: 'https://storage.googleapis.com/test/crop.webp',
          verified: true
        }
      ]
    };
    const matched = ShootCompiler.selectBestProductReferenceForShot(productWithout45, 'A02');
    expect(matched.reference?.id).toBe('ref-crop-only');
    expect(matched.viewType).toBe('front');
  });
});
