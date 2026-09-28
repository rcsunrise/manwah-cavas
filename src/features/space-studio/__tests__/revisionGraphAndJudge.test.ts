// src/features/space-studio/__tests__/revisionGraphAndJudge.test.ts
// MANWAH Space Studio｜G4 Revision Graph & Multimodal Referee 独立自动化测试
import { describe, it, expect } from 'vitest';
import { RevisionGraphEngine } from '../engine/revisionGraphEngine';
import { ValidationEngine } from '../engine/validationEngine';
import { ShotInstance, ShotRevision, ProductAsset } from '../../../types/spaceStudio';
import { SpaceMultimodalRefereeService } from '../../../../server/services/spaceMultimodalRefereeService';

describe('G4: Revision Graph & Multimodal Judge Suite', () => {
  const dummyProduct: ProductAsset = {
    id: 'p1',
    sku: 'MW-CHEERS-S01',
    name: '敏华奢华头等舱功能沙发',
    role: 'sofa_3seat',
    priority: 'primary',
    identityLock: 'strict',
    dimensions: { width: 3100, depth: 1050, height: 980 },
    materials: ['Nappa特级头层皮'],
    colors: ['暖灰原野 (Warm Greige)'],
    functionCapable: true,
    referenceImages: []
  };

  const dummyShot: ShotInstance = {
    id: 'shot-a01',
    templateCode: 'A01',
    name: '客厅核心全景视角',
    camera: {
      lensMm: 35,
      heightCm: 120,
      yawDeg: 15,
      pitchDeg: -3,
      rollDeg: 0,
      target: { type: 'product', id: 'p1' },
      framing: 'wide',
      mustInclude: ['sofa_3s', 'living_center'],
      mustExclude: ['distortion']
    },
    intent: {
      intentCode: 'SI-01',
      name: '空间与产品平衡',
      productDominancePct: 65,
      backgroundSuppression: 'medium',
      maxOcclusionPct: 10,
      description: '全景展示空间户型、建筑结构与敏华主产品的平衡关系'
    },
    status: 'draft',
    revisions: [],
    hasHumanPass: false
  };

  it('Validation Referee correctly evaluates shot with decoupled 4-dimension scoring', () => {
    const report = ValidationEngine.evaluateShot({
      shot: dummyShot,
      candidateImageKey: 'projects/p1/shots/A01/rev-01.webp',
      baselineMasterKey: 'projects/p1/scene-masters/master-v01',
      productDNA: dummyProduct
    });

    expect(report.pass).toBe(true);
    expect(report.gateLevel).toBe('L2');
    expect(report.isDecoupledReferee).toBe(true);
    expect(report.score.productIdentity).toBeGreaterThanOrEqual(85);
    expect(report.score.placement).toBeGreaterThanOrEqual(90);
    expect(report.score.overall).toBeGreaterThanOrEqual(85);
    expect(report.provenance).toBe('DERIVED');
    expect(report.productionTruth).toBe(false); // 绝不自动成为真值
  });

  it('Revision Graph Engine builds DAG topology correctly with head and lineage', () => {
    // 派生 v1
    const rev1 = RevisionGraphEngine.createRevision({
      shot: dummyShot,
      objectKey: 'projects/p1/shots/A01/rev-01.webp',
      promptSnapshotId: 'prompt-A01-v1',
      validationReport: ValidationEngine.evaluateShot({
        shot: dummyShot,
        candidateImageKey: 'projects/p1/shots/A01/rev-01.webp',
        baselineMasterKey: 'projects/p1/scene-masters/master-v01',
        productDNA: dummyProduct
      })
    });

    // 基于 v1 派生 v2 (例如微调机位或叠加 Human Pass)
    const rev2 = RevisionGraphEngine.createRevision({
      shot: { ...dummyShot, revisions: [rev1] },
      parentRevisionId: rev1.id,
      objectKey: 'projects/p1/shots/A01/rev-02.webp',
      promptSnapshotId: 'prompt-A01-v2',
      validationReport: ValidationEngine.evaluateShot({
        shot: dummyShot,
        candidateImageKey: 'projects/p1/shots/A01/rev-02.webp',
        baselineMasterKey: 'projects/p1/scene-masters/master-v01',
        productDNA: dummyProduct
      })
    });

    const shotWithRevs: ShotInstance = {
      ...dummyShot,
      currentRevisionId: rev2.id,
      revisions: [rev2, rev1]
    };

    const topology = RevisionGraphEngine.buildTopology(shotWithRevs);

    expect(topology.shotCode).toBe('A01');
    expect(topology.nodes.length).toBe(2);
    expect(topology.edges.length).toBe(1);
    expect(topology.edges[0].from).toBe(rev1.id);
    expect(topology.edges[0].to).toBe(rev2.id);
    expect(topology.headRevisionId).toBe(rev2.id);
  });

  it('Human Confirmation promotes candidate to Production Truth while unconfirmed remains false', () => {
    const rev = RevisionGraphEngine.createRevision({
      shot: dummyShot,
      objectKey: 'projects/p1/shots/A01/rev-01.webp',
      promptSnapshotId: 'prompt-A01-v1',
      validationReport: ValidationEngine.evaluateShot({
        shot: dummyShot,
        candidateImageKey: 'projects/p1/shots/A01/rev-01.webp',
        baselineMasterKey: 'projects/p1/scene-masters/master-v01',
        productDNA: dummyProduct
      })
    });

    expect(rev.productionTruth).toBe(false);
    expect(rev.provenance).toBe('DERIVED');

    const confirmed = RevisionGraphEngine.promoteToProductionTruth(rev);
    expect(confirmed.productionTruth).toBe(true);
    expect(confirmed.provenance).toBe('MANUAL_CONFIRMED');
    expect(confirmed.status).toBe('approved');
  });
});
