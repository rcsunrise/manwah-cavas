import { describe, it, expect } from 'vitest';
import { buildRenderCandidatesPayload } from '../engine/renderPayloadBuilder';
import { STANDARD_SHOT_TEMPLATES, SCENE_MASTER_TEMPLATE } from '../data/shotTemplates';
import { SPACE_PROTOTYPES } from '../data/spacePresets';
import { STYLE_PRESETS } from '../data/stylePresets';
import { INITIAL_MANWAH_PRODUCTS } from '../data/productAssets';
import { PlacementEngine } from '../engine/placementEngine';
import { ShotInstance } from '../../../types/spaceStudio';

describe('renderPayloadBuilder (Unified Render Candidate Payload Engine)', () => {
  const spacePreset = SPACE_PROTOTYPES[0];
  const stylePreset = STYLE_PRESETS[0];
  const products = INITIAL_MANWAH_PRODUCTS;
  const blueprint = PlacementEngine.generateStandardBlueprint({ spacePreset, products });

  const shots: ShotInstance[] = [SCENE_MASTER_TEMPLATE, ...STANDARD_SHOT_TEMPLATES].map((tpl) => ({
    id: `shot-${tpl.code.toLowerCase()}`,
    templateCode: tpl.code,
    name: tpl.name,
    aspectRatio: tpl.recommendedAspectRatio as any,
    camera: { ...tpl.defaultCamera },
    intent: { ...tpl.intent },
    status: 'draft',
    revisions: [],
    hasHumanPass: false
  }));

  it('builds canonical payload for base shot rendering (A02 45° ensemble)', () => {
    const targetShot = shots.find((s) => s.templateCode === 'A02')!;
    const payload = buildRenderCandidatesPayload({
      projectId: 'test-project',
      targetShot,
      candidateCount: 4,
      activeSettings: {
        model: 'gemini-nano-banana-2.1-preview',
        resolution: '2K',
        aspectRatio: '4:3',
        useRandomSeed: true,
        autoModelFallback: true,
        renderMode: 'orchestration'
      },
      selectedSpace: spacePreset,
      selectedStyle: stylePreset,
      products,
      shots,
      sceneMaster: {
        id: 'master-01',
        projectId: 'test-project',
        objectKey: 'projects/test-project/masters/A00/master-01.webp',
        imageUrl: 'https://example.com/master.webp',
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
      },
      blueprint,
      computeConfig: {
        model: 'gemini-nano-banana-2.1-preview',
        resolution: '2K',
        aspectRatio: '4:3',
        namingPreset: 'standard',
        autoModelFallback: true
      }
    });

    expect(payload.projectId).toBe('test-project');
    expect(payload.shotCode).toBe('A02');
    expect(payload.candidateCount).toBe(4);
    expect(payload.isHumanPass).toBe(false);
    expect(payload.preserveBasePhotoOnly).toBe(false);
    expect(payload.productDNA).toBeDefined();
    expect(payload.productDNA.name).toContain('沙发');
    expect(payload.sceneMasterReference).toBeDefined();
    expect(payload.sceneMasterReference.imageUrl).toBe('https://example.com/master.webp');
    expect(payload.referenceShotCode).toBe('A00');
    expect(payload.promptSnapshot).toBeDefined();
    expect(payload.promptSnapshot.positivePrompt).toContain('MANWAH');
  });

  it('builds canonical payload for human pass rendering (A05 private lounge)', () => {
    const targetShot = shots.find((s) => s.templateCode === 'A05')!;
    const dummyBaseUrl = 'https://example.com/base-shot.webp';

    const payload = buildRenderCandidatesPayload({
      projectId: 'test-project',
      targetShot,
      candidateCount: 1,
      activeSettings: {
        model: 'gemini-nano-banana-2.1-preview',
        resolution: '2K',
        aspectRatio: '3:4',
        useRandomSeed: true,
        autoModelFallback: false,
        renderMode: 'orchestration'
      },
      selectedSpace: spacePreset,
      selectedStyle: stylePreset,
      products,
      shots,
      sceneMaster: null,
      blueprint,
      computeConfig: {
        model: 'gemini-nano-banana-2.1-preview',
        resolution: '2K',
        aspectRatio: '3:4',
        namingPreset: 'standard'
      },
      isHumanPass: true,
      baseShotImage: dummyBaseUrl,
      activeTargetHumanLayout: {
        characterCount: 1,
        mode: 'custom',
        disallowExtraCharacters: true,
        slots: [
          {
            id: 'slot-1',
            modelId: 'model-01',
            modelName: 'Elena',
            positionDesc: '主沙发右侧休闲位',
            actionDesc: '手持红酒杯优雅小憩'
          }
        ]
      },
      allModels: [
        {
          id: 'model-01',
          name: 'Elena',
          nameZh: '艾琳娜',
          views: { portrait: 'https://example.com/model-elena.webp' }
        } as any
      ],
      compiledHuman: {
        positivePrompt: 'elegant lady Elena seated on right sofa cushion relaxing with wine glass',
        negativePrompt: 'deformed hands, ugly face'
      }
    });

    expect(payload.shotCode).toBe('A05');
    expect(payload.isHumanPass).toBe(true);
    expect(payload.preserveBasePhotoOnly).toBe(true);
    expect(payload.baseShotReferenceImage).toBe(dummyBaseUrl);
    expect(payload.characterReferenceImages).toHaveLength(1);
    expect(payload.characterReferenceImages[0].modelId).toBe('model-01');
    expect(payload.promptSnapshot.positivePrompt).toContain('zero camera drift inpainting');
    expect(payload.promptSnapshot.positivePrompt).toContain('strictly 100% preserve and freeze Reference Image 1');
    expect(payload.promptSnapshot.isHumanPass).toBe(true);
  });

  describe('A02 studio_swap angle source guard (A02 极简换景 45° 角度源守卫)', () => {
    const swapSettings = {
      model: 'gemini-nano-banana-2.1-preview',
      resolution: '2K',
      aspectRatio: '4:3',
      useRandomSeed: true,
      autoModelFallback: false,
      renderMode: 'studio_swap'
    } as any;
    const computeConfig = { model: 'gemini-nano-banana-2.1-preview', resolution: '2K', aspectRatio: '4:3', namingPreset: 'standard' } as any;
    const a00WithImage = {
      ...shots.find((s) => s.templateCode === 'A00')!,
      currentRevisionId: 'rev-a00',
      revisions: [{ id: 'rev-a00', imageUrl: 'https://example.com/a00.webp', createdAt: new Date().toISOString() } as any]
    };
    const makeProduct = (overrides: Record<string, any>) => ({
      id: 'prod-swap',
      sku: 'MW-DIRECT-6518',
      name: '1 正大角度_gemini-nano-banana-2.1-preview_2K',
      role: 'sofa_3seat',
      priority: 'primary',
      identityLock: 'strict',
      dimensions: { width: 3100, depth: 1080, height: 950 },
      materials: ['头层牛皮'],
      colors: ['云雾暖灰'],
      functionCapable: true,
      sourceMasterImageUrl: 'https://example.com/frontal.webp',
      referenceImages: [{ id: 'ref-front-1', type: 'front', publicUrl: 'https://example.com/frontal.webp' }],
      ...overrides
    }) as any;
    const build = (targetShot: ShotInstance, product: any) =>
      buildRenderCandidatesPayload({
        projectId: 'swap-guard',
        targetShot,
        activeSettings: swapSettings,
        selectedSpace: spacePreset,
        selectedStyle: stylePreset,
        products: [product],
        shots: [a00WithImage, ...shots.filter((s) => s.templateCode !== 'A00')],
        sceneMaster: null,
        blueprint,
        computeConfig
      });
    const a02 = shots.find((s) => s.templateCode === 'A02')!;

    it('blocks A02 when only a frontal product photo is available and no 45° shot asset is imported', () => {
      expect(() => build(a02, makeProduct({}))).toThrow(/A02 角度源缺失/);
    });

    it('allows A02 when a shot-specific 45° photo is imported and uses it as Reference Image 1', () => {
      const payload = build({ ...a02, customReferenceImage: 'https://example.com/shot-45.webp' }, makeProduct({}));
      expect(payload.productDNA.referenceImage).toBe('https://example.com/shot-45.webp');
    });

    it('allows A02 when the main product photo is identified as a 45° asset by name', () => {
      const payload = build(a02, makeProduct({ name: '2 45度 3+1_gemini-nano-banana-2.1-preview', sourceMasterImageUrl: 'https://example.com/45.webp' }));
      expect(payload.productDNA.referenceImage).toBe('https://example.com/45.webp');
    });

    it('prefers the product 45_deg reference view over the frontal master photo for A02', () => {
      const payload = build(a02, makeProduct({
        referenceImages: [
          { id: 'ref-front-1', type: 'front', publicUrl: 'https://example.com/frontal.webp' },
          { id: 'ref-45-1', type: '45_deg', publicUrl: 'https://example.com/view-45.webp' }
        ]
      }));
      expect(payload.productDNA.referenceImage).toBe('https://example.com/view-45.webp');
    });

    it('does not affect other shots (A00) with frontal-only products', () => {
      expect(() => build(a00WithImage, makeProduct({}))).not.toThrow();
    });
  });
});
