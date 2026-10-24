// src/features/space-studio/engine/__tests__/sceneMasterPromptCompiler.test.ts
import { describe, it, expect } from 'vitest';
import { SceneMasterPromptCompiler } from '../sceneMasterPromptCompiler';
import { SPACE_PROTOTYPES } from '../../data/spacePresets';
import { STYLE_PRESETS } from '../../data/stylePresets';
import { INITIAL_MANWAH_PRODUCTS } from '../../data/productAssets';
import { PlacementEngine } from '../placementEngine';

describe('SceneMasterPromptCompiler (G2 A00 Master Spec)', () => {
  const spacePreset = SPACE_PROTOTYPES[0];
  const stylePreset = STYLE_PRESETS[0];
  const products = INITIAL_MANWAH_PRODUCTS;
  const placementBlueprint = PlacementEngine.generateStandardBlueprint({ spacePreset, products });

  it('compiles rich and deterministic A00 prompt combining all 4 pillars', () => {
    const result = SceneMasterPromptCompiler.compile({
      products,
      spacePreset,
      stylePreset,
      placementBlueprint
    });

    expect(result.positivePrompt).toContain('MANWAH');
    expect(result.positivePrompt).toContain('26mm');
    expect(result.positivePrompt).toContain('Hasselblad');
    expect(result.positivePrompt).toContain(spacePreset.name);
    expect(result.positivePrompt).toContain(stylePreset.name);

    // Ensure camera DNA is eye-level ultra-wide lens
    expect(result.cameraSettings.lensMm).toBe(26);
    expect(result.cameraSettings.heightCm).toBe(130);
    expect(result.cameraSettings.yawDeg).toBe(0);

    // Negative prompt must suppress plastic CGI and people in master pass
    expect(result.negativePrompt).toContain('plastic');
    expect(result.negativePrompt).toContain('human');
    expect(result.negativePrompt).toContain('watermark');

    // Architectural sofa-to-wall continuous backdrop and orthogonal perspective
    expect(result.positivePrompt).toContain('continuous full-span architectural feature wall');
    expect(result.positivePrompt).toContain('panoramic glass curtain wall');
    expect(result.positivePrompt).toContain('strict orthogonal architectural grid alignment');
    expect(result.negativePrompt).toContain('isolated center pillar');
    expect(result.negativePrompt).toContain('sofa overlapping window and wall seam');
    expect(result.negativePrompt).toContain('crooked sofa angle');
    expect(result.negativePrompt).toContain('mismatched perspective alignment');
  });
});
