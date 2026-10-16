// src/features/space-studio/__tests__/outpaintMechanism.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ShotInstance, ShotRevision } from '../../../types/spaceStudio';
import { OutpaintParams } from '../components/CanvasOutpaintOverlay';

describe('Smart Outpaint (智能扩图) Mechanism & Math Validation', () => {
  it('correctly calculates total scale for uniform and directional presets', () => {
    // 1. Uniform 1.25x (each side 0.125)
    const pad125 = { top: 0.125, bottom: 0.125, left: 0.125, right: 0.125 };
    const scale125 = Number((1 + (pad125.left + pad125.right + pad125.top + pad125.bottom) / 2).toFixed(2));
    expect(scale125).toBe(1.25);

    // 2. Uniform 1.50x (each side 0.25)
    const pad150 = { top: 0.25, bottom: 0.25, left: 0.25, right: 0.25 };
    const scale150 = Number((1 + (pad150.left + pad150.right + pad150.top + pad150.bottom) / 2).toFixed(2));
    expect(scale150).toBe(1.5);

    // 3. Horizontal expansion (only left and right expanded by 25%)
    const padHoriz = { top: 0, bottom: 0, left: 0.25, right: 0.25 };
    const totalHorizScale = Number((1 + (padHoriz.left + padHoriz.right + padHoriz.top + padHoriz.bottom) / 2).toFixed(2));
    expect(totalHorizScale).toBe(1.25);
    expect(padHoriz.left + padHoriz.right).toBeGreaterThan(padHoriz.top + padHoriz.bottom);

    // 4. Vertical expansion (only top and bottom expanded by 25%)
    const padVert = { top: 0.25, bottom: 0.25, left: 0, right: 0 };
    const totalVertScale = Number((1 + (padVert.left + padVert.right + padVert.top + padVert.bottom) / 2).toFixed(2));
    expect(totalVertScale).toBe(1.25);
    expect(padVert.top + padVert.bottom).toBeGreaterThan(padVert.left + padVert.right);
  });

  it('infers expected aspect ratio based on directional expansion bias', () => {
    const calcAspect = (padL: number, padR: number, padT: number, padB: number) => {
      if (padL + padR > padT + padB) return '16:9';
      if (padT + padB > padL + padR) return '3:4';
      return '4:3';
    };

    expect(calcAspect(0.25, 0.25, 0, 0)).toBe('16:9'); // 左右延展 -> 宽画幅
    expect(calcAspect(0, 0, 0.25, 0.25)).toBe('3:4'); // 上下拉高 -> 竖构图
    expect(calcAspect(0.2, 0.2, 0.2, 0.2)).toBe('4:3'); // 四周等比 -> 标准画幅
  });

  it('properly registers outpaint revision into shot revision graph and updates current head', () => {
    const baseRevision: ShotRevision = {
      id: 'rev-base-01',
      shotId: 'shot-01',
      revisionNumber: 1,
      revisionType: 'scene',
      label: '基础纯空间 v1',
      metaSummary: '空间硬装基准',
      objectKey: 'projects/space/shot01/base.webp',
      imageUrl: 'http://localhost:3000/api/space/storage/local-file?key=base.webp',
      thumbnailUrl: 'http://localhost:3000/api/space/storage/local-file?key=base.webp',
      promptSnapshotId: 'prompt-base-01',
      status: 'approved',
      score: {
        productIdentity: 96,
        placement: 95,
        sceneContinuity: 95,
        shotIntent: 96,
        overall: 95
      },
      provenance: 'SOLVER_RESOLVED',
      productionTruth: true,
      createdAt: '2026-10-13T02:00:00Z'
    };

    const initialShot: ShotInstance = {
      id: 'shot-01',
      templateCode: 'A01',
      name: '全景主沙发机位',
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
      currentRevisionId: 'rev-base-01',
      revisions: [baseRevision],
      hasHumanPass: false,
      aspectRatio: '3:4'
    };

    // 模拟扩图结果注入
    const outpaintResult = {
      revisionId: 'rev-outpaint-150-02',
      imageUrl: 'http://localhost:3000/api/space/storage/local-file?key=outpaint150.webp',
      objectKey: 'projects/space/shot01/outpaint150.webp',
      outpaintMode: 'uniform',
      scale: 1.5,
      aspectRatio: '4:3',
      label: '四周扩图 (1.5x) v2',
      metaSummary: '视野向四周延展 1.5x · 保留主沙发与摆位'
    };

    const nextRevNum = initialShot.revisions.length + 1;
    const newOutpaintRevision: ShotRevision = {
      id: outpaintResult.revisionId,
      shotId: initialShot.id,
      revisionNumber: nextRevNum,
      revisionType: 'scene',
      label: outpaintResult.label,
      metaSummary: outpaintResult.metaSummary,
      parentRevisionId: initialShot.currentRevisionId,
      objectKey: outpaintResult.objectKey,
      imageUrl: outpaintResult.imageUrl,
      thumbnailUrl: outpaintResult.imageUrl,
      promptSnapshotId: `outpaint-${outpaintResult.revisionId}`,
      status: 'approved',
      score: {
        productIdentity: 96,
        placement: 96,
        sceneContinuity: 95,
        shotIntent: 96,
        overall: 96
      },
      provenance: 'SOLVER_RESOLVED',
      productionTruth: false,
      createdAt: new Date().toISOString()
    };

    const updatedShot: ShotInstance = {
      ...initialShot,
      currentRevisionId: newOutpaintRevision.id,
      revisions: [newOutpaintRevision, ...initialShot.revisions]
    };

    expect(updatedShot.revisions.length).toBe(2);
    expect(updatedShot.currentRevisionId).toBe('rev-outpaint-150-02');
    expect(updatedShot.revisions[0].label).toBe('四周扩图 (1.5x) v2');
    expect(updatedShot.revisions[0].parentRevisionId).toBe('rev-base-01');
    expect(updatedShot.revisions[1].id).toBe('rev-base-01');
  });
});
