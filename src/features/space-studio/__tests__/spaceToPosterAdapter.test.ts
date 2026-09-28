// src/features/space-studio/__tests__/spaceToPosterAdapter.test.ts
import { describe, it, expect } from 'vitest';
import { SpaceToPosterAdapter } from '../adapters/spaceToPosterAdapter';
import { ShotInstance, ProductAsset } from '../../../types/spaceStudio';
import { SPACE_PROTOTYPES } from '../data/spacePresets';

describe('SpaceToPosterAdapter (G6 Phase)', () => {
  const mockProduct: ProductAsset = {
    id: 'sofa-001',
    sku: 'MW-001',
    name: 'MANWAH 智能头等舱真皮电动功能沙发',
    role: 'sofa_3seat',
    priority: 'primary',
    identityLock: 'strict',
    dimensions: { width: 3200, depth: 1050, height: 980 },
    materials: ['南美进口头层牛皮'],
    colors: ['雅致暖灰'],
    functionCapable: true,
    referenceImages: []
  };

  const mockShotA01: ShotInstance = {
    id: 'shot-a01',
    templateCode: 'A01',
    name: '空间全景 (Living Wide)',
    camera: {
      lensMm: 28,
      heightCm: 140,
      yawDeg: 0,
      pitchDeg: -4,
      rollDeg: 0,
      target: { type: 'zone', id: 'living' },
      framing: 'wide',
      mustInclude: ['sofa_front'],
      mustExclude: []
    },
    intent: {
      intentCode: 'SI-01',
      name: 'Space/Product Balance',
      productDominancePct: 55,
      backgroundSuppression: 'low',
      maxOcclusionPct: 5,
      description: '全景展示空间户型与产品平衡'
    },
    status: 'passed',
    hasHumanPass: false,
    revisions: [
      {
        id: 'rev-001',
        shotId: 'shot-a01',
        revisionNumber: 1,
        objectKey: 'spaces/shot-a01/rev-001.jpg',
        promptSnapshotId: 'prompt-a01',
        status: 'approved',
        score: { productIdentity: 98, placement: 97, sceneContinuity: 95, shotIntent: 96, overall: 96 },
        validationReport: {
          reportId: 'rep-01',
          shotCode: 'A01',
          revisionId: 'rev-001',
          pass: true,
          gateLevel: 'L2',
          evaluatorModel: 'referee-v2',
          isDecoupledReferee: true,
          provenance: 'DERIVED',
          productionTruth: false,
          reasons: [],
          score: { productIdentity: 98, placement: 97, sceneContinuity: 95, shotIntent: 96, overall: 96 },
          dimensionDetails: {
            productIdentityDetail: 'ok',
            placementDetail: 'ok',
            sceneContinuityDetail: 'ok',
            shotIntentDetail: 'ok'
          },
          evaluatedAt: new Date().toISOString()
        },
        provenance: 'DERIVED',
        productionTruth: false,
        createdAt: new Date().toISOString()
      }
    ]
  };

  const mockShotA03Recline: ShotInstance = {
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
      mustInclude: ['footrest_open'],
      mustExclude: []
    },
    intent: {
      intentCode: 'SI-04',
      name: 'Function Focus',
      productDominancePct: 70,
      backgroundSuppression: 'high',
      maxOcclusionPct: 5,
      description: '电动功能展开'
    },
    status: 'passed',
    hasHumanPass: false,
    revisions: []
  };

  const mockShotHumanPass: ShotInstance = {
    ...mockShotA01,
    id: 'shot-a04',
    templateCode: 'A04',
    hasHumanPass: true
  };

  it('correctly maps A01 wide shot to 01_brand_hero and hero-editorial template', () => {
    const roleMapping = SpaceToPosterAdapter.mapShotToPosterRole(mockShotA01);
    expect(roleMapping.role).toBe('01_brand_hero');
    expect(roleMapping.templateId).toBe('hero-editorial');
    expect(roleMapping.defaultIndex).toBe(1);
  });

  it('correctly maps functional shot A03 to 04_function_demo and function-sequence template', () => {
    const roleMapping = SpaceToPosterAdapter.mapShotToPosterRole(mockShotA03Recline);
    expect(roleMapping.role).toBe('04_function_demo');
    expect(roleMapping.templateId).toBe('function-sequence');
    expect(roleMapping.defaultIndex).toBe(4);
  });

  it('correctly maps human pass shot to 03_lifestyle_scene and lifestyle-story template', () => {
    const roleMapping = SpaceToPosterAdapter.mapShotToPosterRole(mockShotHumanPass);
    expect(roleMapping.role).toBe('03_lifestyle_scene');
    expect(roleMapping.templateId).toBe('lifestyle-story');
    expect(roleMapping.defaultIndex).toBe(3);
  });

  it('converts shot to PlanScreenItem with customized copywriting and image layer parameters', () => {
    const screenItem = SpaceToPosterAdapter.convertShotToScreenItem({
      shot: mockShotA01,
      product: mockProduct,
      spacePreset: SPACE_PROTOTYPES[0]
    });

    expect(screenItem.screenIndex).toBe(1);
    expect(screenItem.headline).toContain('MANWAH 智能头等舱真皮电动功能沙发');
    expect(screenItem.sourceImageUrl).toContain('shot-a01');
    expect(screenItem.points?.length).toBeGreaterThan(0);
    expect(screenItem.sourceAspectRatio).toBe(0.75);
  });

  it('builds a full PosterCompositionSnapshot with non-empty textLayers and imageLayers', () => {
    const composition = SpaceToPosterAdapter.convertToPosterComposition({
      shot: mockShotA01,
      product: mockProduct,
      spacePreset: SPACE_PROTOTYPES[0]
    });

    expect(composition).toBeDefined();
    expect(composition.textLayers.length).toBeGreaterThan(0);
    expect(composition.imageLayers.length).toBeGreaterThan(0);
    expect(composition.width).toBeGreaterThanOrEqual(2100);
    expect(composition.height).toBeGreaterThanOrEqual(2800);
  });
});
