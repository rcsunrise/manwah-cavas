// src/features/space-studio/engine/__tests__/placementEngine.test.ts
import { describe, it, expect } from 'vitest';
import { PlacementEngine } from '../placementEngine';
import { SPACE_PROTOTYPES } from '../../data/spacePresets';
import { INITIAL_MANWAH_PRODUCTS } from '../../data/productAssets';

describe('PlacementEngine (G2 Fixed Furniture Blueprint)', () => {
  const spacePreset = SPACE_PROTOTYPES[0];
  const products = INITIAL_MANWAH_PRODUCTS;

  it('generates deterministic standard blueprint with locked state', () => {
    const blueprint = PlacementEngine.generateStandardBlueprint({
      spacePreset,
      products
    });

    expect(blueprint.isLocked).toBe(true);
    expect(blueprint.spacePresetId).toBe(spacePreset.id);
    expect(blueprint.items.length).toBeGreaterThanOrEqual(3);

    // Primary sofa must be centered
    const sofa = blueprint.items.find((i) => i.role === 'sofa_3seat');
    expect(sofa).toBeDefined();
    expect(sofa?.x).toBe(0.5);
    expect(sofa?.y).toBe(0.42);

    // Coffee table must be in front of sofa
    const table = blueprint.items.find((i) => i.role === 'coffee_table');
    expect(table).toBeDefined();
    expect(table?.x).toBe(0.5);
    expect(table?.y).toBeGreaterThan(sofa!.y);

    // Recliner must have conversational angle
    const recliner = blueprint.items.find((i) => i.role === 'recliner_1seat');
    expect(recliner).toBeDefined();
    expect(recliner?.rotationDeg).toBe(35);
  });

  it('validates placement invariance successfully when items stay fixed', () => {
    const blueprint = PlacementEngine.generateStandardBlueprint({
      spacePreset,
      products
    });

    const candidateItems = JSON.parse(JSON.stringify(blueprint.items));
    const result = PlacementEngine.validatePlacementInvariance(blueprint, candidateItems);

    expect(result.pass).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('detects violations when furniture physically drifts between shots', () => {
    const blueprint = PlacementEngine.generateStandardBlueprint({
      spacePreset,
      products
    });

    const candidateItems = JSON.parse(JSON.stringify(blueprint.items));
    // Violate: move the sofa by 15%
    candidateItems[0].x = 0.65;

    const result = PlacementEngine.validatePlacementInvariance(blueprint, candidateItems);
    expect(result.pass).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]).toContain('发生违规物理位移漂移');
  });
});
