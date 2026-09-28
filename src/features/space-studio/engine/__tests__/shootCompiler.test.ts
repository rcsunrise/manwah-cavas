// src/features/space-studio/engine/__tests__/shootCompiler.test.ts
import { describe, it, expect } from 'vitest';
import { ShootCompiler } from '../shootCompiler';
import { STANDARD_SHOT_TEMPLATES } from '../../data/shotTemplates';
import { SPACE_PROTOTYPES } from '../../data/spacePresets';
import { STYLE_PRESETS } from '../../data/stylePresets';
import { INITIAL_MANWAH_PRODUCTS } from '../../data/productAssets';
import { PlacementEngine } from '../placementEngine';
import { ShotInstance, SceneMaster } from '../../../../types/spaceStudio';

describe('ShootCompiler (G3 Shoot Phase Core)', () => {
  const spacePreset = SPACE_PROTOTYPES[0];
  const stylePreset = STYLE_PRESETS[0];
  const products = INITIAL_MANWAH_PRODUCTS;
  const blueprint = PlacementEngine.generateStandardBlueprint({ spacePreset, products });

  const sceneMaster: SceneMaster = {
    id: 'master-01',
    projectId: 'test-project',
    objectKey: 'projects/test-project/masters/A00/master-01.webp',
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
    promptSnapshotId: 'rev-01'
  };

  it('compiles A02 Hero shot prompt with camera DNA and material highlights', () => {
    const shotA02: ShotInstance = {
      id: 'shot-a02',
      templateCode: 'A02',
      name: '产品 45° 黄金视角',
      camera: STANDARD_SHOT_TEMPLATES[1].defaultCamera,
      intent: STANDARD_SHOT_TEMPLATES[1].intent,
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };

    const compiled = ShootCompiler.compileShotPrompt({
      shot: shotA02,
      sceneMaster,
      products,
      spacePreset,
      stylePreset,
      blueprint
    });

    expect(compiled.shotCode).toBe('A02');
    expect(compiled.positivePrompt).toContain('45mm');
    expect(compiled.positivePrompt).toContain('Hasselblad');
    expect(compiled.positivePrompt).toContain('45-degree silhouette');
    expect(compiled.invarianceChecks.furnitureFixed).toBe(true);
    expect(compiled.invarianceChecks.productLocked).toBe(true);
  });

  it('compiles A04 Macro Leather Craftsmanship with high-detail cues', () => {
    const shotA04: ShotInstance = {
      id: 'shot-a04',
      templateCode: 'A04',
      name: '皮质特写',
      camera: STANDARD_SHOT_TEMPLATES[3].defaultCamera,
      intent: STANDARD_SHOT_TEMPLATES[3].intent,
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };

    const compiled = ShootCompiler.compileShotPrompt({
      shot: shotA04,
      sceneMaster,
      products,
      spacePreset,
      stylePreset,
      blueprint
    });

    expect(compiled.shotCode).toBe('A04');
    expect(compiled.positivePrompt).toContain('85mm');
    expect(compiled.positivePrompt).toContain('microscopic genuine semi-aniline leather pores');
    expect(compiled.negativePrompt).toContain('shifted sofa coordinates');
  });
});
