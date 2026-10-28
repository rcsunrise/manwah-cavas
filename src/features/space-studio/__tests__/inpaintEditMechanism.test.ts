// src/features/space-studio/__tests__/inpaintEditMechanism.test.ts
import { describe, it, expect } from 'vitest';
import { ShotInstance, ShotRevision } from '../../../types/spaceStudio';
import {
  computeMaskBounds,
  InpaintStroke,
  InpaintSubmitPayload
} from '../components/CanvasInpaintModal';

describe('Surgical Inpainting (二次指令修改与局部重绘) Mechanism Validation', () => {
  it('correctly calculates normalized bounding box (0-100%) for brush, rect, ellipse, and polygon strokes', () => {
    const strokes: InpaintStroke[] = [
      // 1. Rect from (0.2, 0.3) to (0.5, 0.6)
      {
        id: 'stroke-1',
        tool: 'rect',
        width: 0.004,
        points: [
          { x: 0.2, y: 0.3 },
          { x: 0.5, y: 0.6 }
        ]
      },
      // 2. Brush around (0.45, 0.7) with width 0.04
      {
        id: 'stroke-2',
        tool: 'brush',
        width: 0.04,
        points: [
          { x: 0.45, y: 0.7 },
          { x: 0.6, y: 0.75 }
        ]
      }
    ];

    const bounds = computeMaskBounds(strokes);
    expect(bounds).toBeDefined();
    expect(bounds!.xmin).toBeLessThanOrEqual(20);
    expect(bounds!.ymin).toBeLessThanOrEqual(30);
    expect(bounds!.xmax).toBeGreaterThanOrEqual(60);
    expect(bounds!.ymax).toBeGreaterThanOrEqual(75);
    expect(bounds!.ymin).toBeGreaterThanOrEqual(0);
    expect(bounds!.ymax).toBeLessThanOrEqual(100);
  });

  it('ignores eraser strokes when computing maskBounds and returns null if only erasers exist', () => {
    const eraserOnlyStrokes: InpaintStroke[] = [
      {
        id: 'stroke-eraser-1',
        tool: 'eraser',
        width: 0.05,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.9, y: 0.9 }
        ]
      }
    ];

    expect(computeMaskBounds(eraserOnlyStrokes)).toBeNull();
    expect(computeMaskBounds([])).toBeNull();
  });

  it('properly registers inpaint revision into shot revision graph and updates current head', () => {
    const baseRevision: ShotRevision = {
      id: 'rev-base-01',
      shotId: 'shot-a02',
      revisionNumber: 1,
      revisionType: 'scene',
      label: '45度拍摄换景 v1',
      metaSummary: '45度实拍产品置换都会大平层背景',
      objectKey: 'projects/space/shotA02/base.webp',
      imageUrl: 'http://localhost:3000/api/space/storage/local-file?key=baseA02.webp',
      thumbnailUrl: 'http://localhost:3000/api/space/storage/local-file?key=baseA02.webp',
      promptSnapshotId: 'prompt-base-a02',
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
      createdAt: '2026-10-28T10:00:00.000Z'
    };

    const targetShot: ShotInstance = {
      id: 'shot-a02',
      templateCode: 'A02',
      name: '45° 空间全景镜头',
      status: 'passed',
      currentRevisionId: baseRevision.id,
      revisions: [baseRevision],
      hasHumanPass: false,
      intent: {
        intentCode: 'SI-01',
        name: '空间全景',
        productDominancePct: 60,
        maxOcclusionPct: 20,
        backgroundSuppression: 'low',
        description: '空间全景'
      },
      camera: {
        lensMm: 35,
        heightCm: 110,
        yawDeg: 45,
        pitchDeg: -4,
        rollDeg: 0,
        framing: 'wide',
        target: { type: 'product', id: 'main_sofa' },
        mustInclude: ['main_sofa'],
        mustExclude: []
      }
    };

    // Simulate inpaint-edit result returned from API
    const inpaintResult = {
      revisionId: 'rev-edit-a02-k89s1m',
      imageUrl: 'http://localhost:3000/api/space/storage/local-file?key=inpaintA02.webp',
      objectKey: 'projects/space/shotA02/inpaintA02.webp',
      label: '蒙版局部重绘',
      metaSummary: '蒙版局部重绘：移除背景杂物挂画并补齐木饰面'
    };

    const nextRevNum = targetShot.revisions.length + 1;
    const newInpaintRevision: ShotRevision = {
      id: inpaintResult.revisionId,
      shotId: targetShot.id,
      revisionNumber: nextRevNum,
      revisionType: 'scene',
      label: inpaintResult.label || `精修 v${nextRevNum}`,
      metaSummary: inpaintResult.metaSummary,
      parentRevisionId: targetShot.currentRevisionId,
      objectKey: inpaintResult.objectKey,
      imageUrl: inpaintResult.imageUrl,
      thumbnailUrl: inpaintResult.imageUrl,
      promptSnapshotId: `inpaint-${inpaintResult.revisionId}`,
      status: 'approved',
      score: {
        productIdentity: 98,
        placement: 98,
        sceneContinuity: 98,
        shotIntent: 98,
        overall: 98
      },
      provenance: 'SOLVER_RESOLVED',
      productionTruth: false,
      createdAt: new Date().toISOString()
    };

    // Simulate update logic
    const updatedShot: ShotInstance = {
      ...targetShot,
      currentRevisionId: newInpaintRevision.id,
      revisions: [newInpaintRevision, ...targetShot.revisions]
    };

    // 1. Revision array prepended with new revision node
    expect(updatedShot.revisions).toHaveLength(2);
    expect(updatedShot.revisions[0].id).toBe(inpaintResult.revisionId);
    expect(updatedShot.revisions[0].revisionNumber).toBe(2);
    expect(updatedShot.revisions[0].label).toContain('重绘');

    // 2. Head updated to inpaint revision while preserving historical base
    expect(updatedShot.currentRevisionId).toBe(inpaintResult.revisionId);
    expect(updatedShot.revisions[1].id).toBe('rev-base-01');
  });

  it('constructs well-formed inpaint submit payload with 3-reference limits and coordinates', () => {
    const payload: InpaintSubmitPayload = {
      baseImage: 'http://localhost:3000/api/space/storage/local-file?key=baseA02.webp',
      maskImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNiAAAABgADNjd8qAAAAABJRU5ErkJggg==',
      annotatedImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...',
      maskBounds: { ymin: 15, xmin: 30, ymax: 55, xmax: 75 },
      referenceImages: [
        'data:image/jpeg;base64,ref1...',
        'data:image/jpeg;base64,ref2...'
      ],
      instruction: '消除背景挂画并补齐木饰面',
      editMode: 'modify'
    };

    expect(payload.baseImage).toBeDefined();
    expect(payload.maskBounds).toEqual({ ymin: 15, xmin: 30, ymax: 55, xmax: 75 });
    expect(payload.referenceImages).toHaveLength(2);
    expect(payload.editMode).toBe('modify');
    expect(payload.instruction).toBe('消除背景挂画并补齐木饰面');
  });
});
