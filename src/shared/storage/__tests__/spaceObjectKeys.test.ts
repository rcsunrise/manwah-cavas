// src/shared/storage/__tests__/spaceObjectKeys.test.ts
import { describe, it, expect } from 'vitest';
import { SpaceObjectKeyBuilder } from '../spaceObjectKeys';

describe('SpaceObjectKeyBuilder (G1 Immutable Key Spec)', () => {
  const projectId = 'proj-manwah-001';

  it('generates immutable project root correctly', () => {
    expect(SpaceObjectKeyBuilder.projectRoot(projectId)).toBe('projects/proj-manwah-001');
  });

  it('rejects empty or whitespace projectId', () => {
    expect(() => SpaceObjectKeyBuilder.projectRoot('')).toThrow('projectId is required');
    expect(() => SpaceObjectKeyBuilder.projectRoot('   ')).toThrow('projectId is required');
  });

  it('generates immutable product reference key', () => {
    const key = SpaceObjectKeyBuilder.productReference({
      projectId,
      assetId: 'sofa-cheers-01',
      referenceId: 'ref-front-01',
      extension: 'webp'
    });
    expect(key).toBe('projects/proj-manwah-001/products/sofa-cheers-01/refs/ref-front-01/original.webp');
  });

  it('generates immutable A00 Scene Master key with revision id', () => {
    const key = SpaceObjectKeyBuilder.sceneMaster({
      projectId,
      sceneMasterId: 'master-living-01',
      revisionId: 'rev-v1',
      extension: 'webp'
    });
    expect(key).toBe('projects/proj-manwah-001/scene-masters/master-living-01/rev-v1/master.webp');
    // Ensure no mutable current.jpg is used
    expect(key).not.toContain('current.jpg');
  });

  it('generates immutable Shot Revision original and thumbnail keys', () => {
    const originalKey = SpaceObjectKeyBuilder.shotRevisionOriginal({
      projectId,
      shotId: 'shot-a02',
      revisionId: 'rev-03',
      extension: 'webp'
    });
    const thumbKey = SpaceObjectKeyBuilder.shotRevisionThumbnail({
      projectId,
      shotId: 'shot-a02',
      revisionId: 'rev-03',
      extension: 'webp'
    });

    expect(originalKey).toBe('projects/proj-manwah-001/shots/shot-a02/revisions/rev-03/original.webp');
    expect(thumbKey).toBe('projects/proj-manwah-001/shots/shot-a02/revisions/rev-03/thumb.webp');
  });

  it('generates immutable Human Pass composite key with revision', () => {
    const key = SpaceObjectKeyBuilder.humanComposite({
      projectId,
      compositeId: 'comp-story-01',
      revisionId: 'rev-v2',
      extension: 'webp'
    });
    expect(key).toBe('projects/proj-manwah-001/human-composites/comp-story-01/rev-v2/original.webp');
  });
});
