import { describe, it, expect } from 'vitest';
import { STYLE_PRESETS } from '../../data/stylePresets';
import {
  compileStyleDnaToEnglish,
  translateHexColorToDescriptiveEnglish,
  translateMaterialSystemToEnglish
} from '../stylePaletteTranslator';
import { ShootCompiler } from '../shootCompiler';
import { SPACE_PROTOTYPES } from '../../data/spacePresets';
import { INITIAL_MANWAH_PRODUCTS } from '../../data/productAssets';
import { PlacementEngine } from '../placementEngine';
import { ShotInstance } from '../../../../types/spaceStudio';

describe('Style Palette & Spatial Tone Translation Engine', () => {
  it('translates all 12 preset styles into rich natural visual palettes and materials', () => {
    for (const style of STYLE_PRESETS) {
      const compilation = compileStyleDnaToEnglish(style);

      expect(compilation.dominantColorTone).toBeTruthy();
      expect(compilation.materialFinishes).toBeTruthy();
      expect(compilation.atmosphericLighting).toBeTruthy();
      expect(compilation.styleMandateClause).toContain('[DOMINANT SPATIAL COLOR TONE & INTERIOR PALETTE MANDATE');
      expect(compilation.styleMandateClause).toContain(style.name.toUpperCase());
    }
  });

  it('correctly maps Italian Quiet Luxury and Bauhaus Geometric to radically distinct color tones', () => {
    const italianStyle = STYLE_PRESETS.find(s => s.code === 'ST-02')!;
    const bauhausStyle = STYLE_PRESETS.find(s => s.code === 'ST-09')!;

    const italianDna = compileStyleDnaToEnglish(italianStyle);
    const bauhausDna = compileStyleDnaToEnglish(bauhausStyle);

    // Italian should emphasize warm bone ivory and porous travertine
    expect(italianDna.dominantColorTone).toContain('travertine');
    expect(italianDna.dominantColorTone).toContain('ivory');
    expect(italianDna.materialFinishes).toContain('travertine');

    // Bauhaus should emphasize high-contrast black, white, cadmium red, cobalt blue
    expect(bauhausDna.dominantColorTone).toContain('matte black');
    expect(bauhausDna.dominantColorTone).toContain('cadmium red');
    expect(bauhausDna.dominantColorTone).toContain('cobalt blue');
    expect(bauhausDna.materialFinishes).toContain('chrome tubular steel');
  });

  it('translates arbitrary hex codes into descriptive natural English color words', () => {
    expect(translateHexColorToDescriptiveEnglish('#FFFFFF')).toContain('white');
    expect(translateHexColorToDescriptiveEnglish('#000000')).toContain('black');
    expect(translateHexColorToDescriptiveEnglish('#DCD7D0')).toContain('oatmeal');
  });

  it('translates Chinese interior materials into professional architectural terminology', () => {
    const rawMaterials = ['潘多拉微晶奢石', '哑光深烟熏橡木', '拉丝古铜'];
    const translated = translateMaterialSystemToEnglish(rawMaterials);

    expect(translated).toContain('Pandora');
    expect(translated).toContain('smoked dark oak');
    expect(translated).toContain('antique bronze');
  });

  it('ensures ShootCompiler prioritizes styleMandateClause in compiled prompt', () => {
    const italianStyle = STYLE_PRESETS.find(s => s.code === 'ST-02')!;
    const mockShot: ShotInstance = {
      id: 'shot-a00',
      templateCode: 'A00',
      name: '空间母版',
      camera: {
        lensMm: 35,
        heightCm: 115,
        yawDeg: 0,
        pitchDeg: 0,
        rollDeg: 0,
        target: { type: 'product', id: 'p1' },
        framing: 'wide',
        mustInclude: ['sofa_3seat'],
        mustExclude: ['clutter']
      },
      intent: {
        intentCode: 'SI-01',
        name: '空间与产品平衡',
        productDominancePct: 60,
        backgroundSuppression: 'medium',
        maxOcclusionPct: 5,
        description: '母版空间'
      },
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };

    const blueprint = PlacementEngine.generateStandardBlueprint({
      spacePreset: SPACE_PROTOTYPES[0],
      products: INITIAL_MANWAH_PRODUCTS
    });

    const compiled = ShootCompiler.compileShotPrompt({
      shot: mockShot,
      sceneMaster: {
        id: 'master-01',
        projectId: 'test',
        objectKey: '',
        promptSnapshotId: 'rev-01',
        isLocked: true,
        locks: { productIdentity: true, placement: true, architecture: true, style: true, material: true, lighting: true, camera: true, human: false }
      },
      products: INITIAL_MANWAH_PRODUCTS,
      spacePreset: SPACE_PROTOTYPES[0],
      stylePreset: italianStyle,
      blueprint
    });

    // The compiled positivePrompt MUST contain the high-priority spatial tone mandate
    expect(compiled.positivePrompt).toContain('[DOMINANT SPATIAL COLOR TONE & INTERIOR PALETTE MANDATE');
    expect(compiled.positivePrompt).toContain('travertine');
    expect(compiled.positivePrompt).toContain('bone ivory');

    // Negative prompt must forbid mismatched wall colors and generic sterile white
    expect(compiled.negativePrompt).toContain('mismatched wall colors');
    expect(compiled.negativePrompt).toContain('generic sterile white');
  });
});
