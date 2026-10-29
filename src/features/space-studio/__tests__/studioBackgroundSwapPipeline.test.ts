import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as providerConfigModule from '../../../../server/ai/providerConfig';
import { SpaceImageGenerationService } from '../../../../server/services/spaceImageGenerationService';
import { GcsAssetStorage } from '../../../../server/services/storage/gcsAssetStorage';
import spaceShootRoutes from '../../../../server/routes/spaceShootRoutes';
import { ShootCompiler } from '../engine/shootCompiler';
import { SPACE_PROTOTYPES } from '../data/spacePresets';
import { STYLE_PRESETS } from '../data/stylePresets';
import { STANDARD_SHOT_TEMPLATES } from '../data/shotTemplates';

describe('Studio Background Swap Pipeline (极简影棚背景置换直通模式)', () => {
  const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  let origEnv: string | undefined;

  beforeEach(() => {
    origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    vi.spyOn(GcsAssetStorage.prototype, 'put').mockResolvedValue({
      storageProvider: 'local_fallback',
      bucket: 'local-disk',
      objectKey: 'mock-key',
      bytes: 100,
      sha256: 'mock-sha',
      contentType: 'image/webp'
    });
    vi.spyOn(providerConfigModule, 'resolveApiConfig').mockResolvedValue({
      apiKey: 'sk-mock-valid-key-for-test-pipeline',
      baseUrl: 'https://api.tiantoken.com',
      deptId: null,
      provider: 'tiantoken',
      source: 'global'
    });
    vi.spyOn(providerConfigModule, 'isProviderKeyValid').mockReturnValue(true);
  });

  afterEach(() => {
    process.env.NODE_ENV = origEnv;
    vi.restoreAllMocks();
  });

  it('correctly constructs the Studio Swap zero-drift prompt and cleans negatives when renderMode="studio_swap"', async () => {
    let capturedBody: any = null;

    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/gateway/generate-image')) {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            success: true,
            imageUrl: 'data:image/webp;base64,' + dummyBase64
          })
        } as any;
      }
      return { ok: true, arrayBuffer: async () => Buffer.from(dummyBase64, 'base64') } as any;
    });

    const result = await SpaceImageGenerationService.generateAndStore({
      projectId: 'test-studio-swap-project',
      shotCode: 'A00',
      positivePrompt: 'luxurious living room, soft ambient sunlight',
      negativePrompt: '',
      aspectRatio: '4:3',
      preferredModel: 'gemini-nano-banana-2.1-preview',
      resolution: '2K',
      autoModelFallback: false,
      renderMode: 'studio_swap',
      productName: '芝华仕·意式极简真皮沙发套组',
      productColor: '焦糖棕',
      productMaterial: '头层牛皮',
      primaryProduct: {
        name: '芝华仕·意式极简真皮沙发套组',
        colors: ['焦糖棕'],
        materials: ['头层牛皮'],
        referenceImage: `data:image/png;base64,${dummyBase64}`
      },
      productReferenceImage: `data:image/png;base64,${dummyBase64}`,
      roomName: '都会大平层端厅',
      styleName: '意式轻奢',
      objectKey: 'test/studio_swap_result.webp'
    });

    expect(capturedBody).toBeDefined();
    // 1. Prompt should contain the dedicated Studio Swap Mandate
    expect(capturedBody.prompt).toContain('STUDIO PRODUCT BACKGROUND SWAP - ZERO FURNITURE DRIFT');
    expect(capturedBody.prompt).toContain('ALL furniture pieces, seating units, main sofas, accent single chairs, coffee tables');
    expect(capturedBody.prompt).toContain('MUST REMAIN 100% IMMOVABLE, IDENTICAL, AND ZERO-DRIFT');
    expect(capturedBody.prompt).toContain('都会大平层端厅');
    expect(capturedBody.prompt).toContain('意式轻奢');

    // 2. Negative prompt should forbid altering furniture or removing chairs/sofas
    expect(capturedBody.prompt).toContain('altering furniture');
    expect(capturedBody.prompt).toContain('removing chair');
    expect(capturedBody.prompt).toContain('missing single chair');
    expect(capturedBody.prompt).toContain('altering headrest position shown in Reference Image 1');

    // 3. Should only send the primary product inline image
    expect(capturedBody.images.length).toBe(1);
    expect(capturedBody.generationIntent).toBe('image_edit');

    // 4. Result should be valid
    expect(result.objectKey).toBe('test/studio_swap_result.webp');
    expect(result.imageUrl).toContain('test%2Fstudio_swap_result.webp');
  });

  it('preserves standard orchestration pipeline when renderMode is undefined or "orchestration"', async () => {
    let capturedBody: any = null;

    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/gateway/generate-image')) {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            success: true,
            imageUrl: 'data:image/webp;base64,' + dummyBase64
          })
        } as any;
      }
      return { ok: true, arrayBuffer: async () => Buffer.from(dummyBase64, 'base64') } as any;
    });

    await SpaceImageGenerationService.generateAndStore({
      projectId: 'test-orchestration-project',
      shotCode: 'A00',
      positivePrompt: 'luxurious living room',
      negativePrompt: '',
      aspectRatio: '4:3',
      preferredModel: 'gemini-nano-banana-2.1-preview',
      resolution: '2K',
      autoModelFallback: false,
      renderMode: 'orchestration',
      productName: '芝华仕功能沙发',
      productColor: '干邑橙',
      productMaterial: '头层牛皮',
      primaryProduct: {
        name: '芝华仕功能沙发',
        colors: ['干邑橙'],
        materials: ['头层牛皮'],
        referenceImage: `data:image/png;base64,${dummyBase64}`
      },
      productReferenceImage: `data:image/png;base64,${dummyBase64}`,
      roomName: '都会大平层',
      styleName: '意式经典',
      objectKey: 'test/orchestration_result.webp'
    });

    expect(capturedBody).toBeDefined();
    // Orchestration mode should contain A00 Master Ground Truth instead of Studio Swap Mandate
    expect(capturedBody.prompt).toContain('MANWAH SCENE MASTER GROUND TRUTH: A00');
    expect(capturedBody.prompt).not.toContain('STUDIO PRODUCT BACKGROUND SWAP');
  });

  it('injects pure floor-plan & style DNA without orchestration camera/prop pollution and merges style negatives', async () => {
    let capturedBody: any = null;

    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/gateway/generate-image')) {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            success: true,
            imageUrl: 'data:image/webp;base64,' + dummyBase64
          })
        } as any;
      }
      return { ok: true, arrayBuffer: async () => Buffer.from(dummyBase64, 'base64') } as any;
    });

    await SpaceImageGenerationService.generateAndStore({
      projectId: 'test-studio-swap-dna',
      shotCode: 'A02',
      positivePrompt: '[SHOT MANDATE - A02 45-degree angled hero], SPATIAL INVARIANCE ANCHOR: white matte cylindrical planter, sofa securely anchored at zone center',
      negativePrompt: '',
      aspectRatio: '4:3',
      preferredModel: 'gemini-nano-banana-2.1-preview',
      resolution: '2K',
      autoModelFallback: false,
      renderMode: 'studio_swap',
      productName: '芝华仕美式真皮套组',
      productColor: '焦糖棕',
      productMaterial: '头层牛皮',
      primaryProduct: {
        name: '芝华仕美式真皮套组',
        colors: ['焦糖棕'],
        materials: ['头层牛皮'],
        referenceImage: `data:image/png;base64,${dummyBase64}`
      },
      productReferenceImage: `data:image/png;base64,${dummyBase64}`,
      roomName: '下沉式围合私享厅',
      styleName: '现代美式都会宅',
      studioSwapContext: {
        spaceDna: [
          'space prototype anchor: 下沉式围合私享厅 (N-R04)',
          '3.8m soaring architectural ceiling headroom',
          'sunken conversation salon with perimeter travertine steps'
        ],
        styleDna: [
          'classic American picture-frame wall panel moldings and dark walnut wainscoting',
          'warm oat greige #E6DFD5 wall tone'
        ],
        spaceNegatives: ['flat single-level floor without steps'],
        styleNegatives: ['flat bare drywall without panel frames', 'cold sterile hospital wall']
      },
      studioSwapLightingHint: 'warm golden hour afternoon sunlight entering through the windows',
      objectKey: 'test/studio_swap_dna.webp'
    });

    expect(capturedBody).toBeDefined();
    // 1. Contains pure space & style DNA
    expect(capturedBody.prompt).toContain('sunken conversation salon with perimeter travertine steps');
    expect(capturedBody.prompt).toContain('classic American picture-frame wall panel moldings and dark walnut wainscoting');
    expect(capturedBody.prompt).toContain('TOPOLOGY ADAPTATION');
    expect(capturedBody.prompt).toContain('warm golden hour afternoon sunlight entering through the windows');

    // 2. Does NOT leak orchestration camera / prop / zone placement instructions
    expect(capturedBody.prompt).not.toContain('A02 45-degree angled hero');
    expect(capturedBody.prompt).not.toContain('white matte cylindrical planter');
    expect(capturedBody.prompt).not.toContain('sofa securely anchored at zone center');
    expect(capturedBody.prompt).not.toContain('polished floor tiles');

    // 3. Merges space & style negative rules
    expect(capturedBody.prompt).toContain('flat single-level floor without steps');
    expect(capturedBody.prompt).toContain('flat bare drywall without panel frames');
  });

  it('prioritizes Human Pass over studio_swap when isHumanPass=true so people are not blocked by negative constraints', async () => {
    let capturedBody: any = null;

    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/gateway/generate-image')) {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            success: true,
            imageUrl: 'data:image/webp;base64,' + dummyBase64
          })
        } as any;
      }
      return { ok: true, arrayBuffer: async () => Buffer.from(dummyBase64, 'base64') } as any;
    });

    await SpaceImageGenerationService.generateAndStore({
      projectId: 'test-studio-swap-human',
      shotCode: 'A01',
      positivePrompt: 'family seated naturally on the sofa',
      negativePrompt: '',
      aspectRatio: '4:3',
      preferredModel: 'gemini-nano-banana-2.1-preview',
      resolution: '2K',
      autoModelFallback: false,
      renderMode: 'studio_swap',
      isHumanPass: true,
      currentShotReferenceImage: `data:image/png;base64,${dummyBase64}`,
      productReferenceImage: `data:image/png;base64,${dummyBase64}`,
      roomName: '通透横厅大平层',
      styleName: '现代美式都会宅',
      objectKey: 'test/studio_swap_human.webp'
    });

    expect(capturedBody).toBeDefined();
    expect(capturedBody.prompt).toContain('INPAINT REAL PEOPLE INTO REFERENCE IMAGE 1');
    expect(capturedBody.prompt).not.toContain('STUDIO PRODUCT BACKGROUND SWAP');
  });

  it('forwards renderMode="studio_swap" and studioSwapContext through POST /render-candidates with zero cameraDelta', async () => {
    const spacePreset = SPACE_PROTOTYPES[0];
    const stylePreset = STYLE_PRESETS[0];
    const tpl = STANDARD_SHOT_TEMPLATES[0];

    const compiled = ShootCompiler.compileShotPrompt({
      shot: {
        id: 'shot-a01',
        templateCode: 'A01',
        name: tpl.name,
        category: tpl.studioCategory,
        status: 'pending',
        aspectRatio: '4:3',
        camera: tpl.defaultCamera,
        intent: tpl.intent,
        revisions: []
      } as any,
      sceneMaster: {
        id: 'temp-master',
        projectId: 'proj-route-test',
        objectKey: '',
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
      products: [
        {
          id: 'prod-1',
          sku: 'MW-001',
          name: '芝华仕沙发套组',
          role: 'sofa_3seat',
          priority: 'primary',
          identityLock: 'strict',
          dimensions: { width: 3200, depth: 1050, height: 950 },
          materials: ['头层牛皮'],
          colors: ['焦糖棕'],
          functionCapable: true,
          referenceImages: []
        } as any
      ],
      spacePreset,
      stylePreset,
      blueprint: { zones: [], items: [] } as any,
      aspectRatio: '4:3',
      functionalPositionState: 'closed'
    });

    expect(compiled.studioSwapContext).toBeDefined();
    expect(compiled.studioSwapContext!.spaceDna.length).toBeGreaterThan(0);
    expect(compiled.studioSwapContext!.styleDna.length).toBeGreaterThan(0);

    const capturedInputs: any[] = [];
    vi.spyOn(SpaceImageGenerationService, 'generateAndStore').mockImplementation(async (input: any) => {
      capturedInputs.push(input);
      return {
        objectKey: input.objectKey,
        imageUrl: `data:image/webp;base64,${dummyBase64}`,
        provider: 'tiantoken',
        model: 'gemini-nano-banana-2.1-preview',
        bytes: 100,
        sha256: `sha-${input.variantIndex}`,
        contentType: 'image/webp',
        provenance: 'AI_ESTIMATED',
        productionTruth: true
      };
    });

    // Find the /render-candidates handler on the router stack
    const layer = (spaceShootRoutes as any).stack.find(
      (l: any) => l.route?.path === '/render-candidates' && l.route?.methods?.post
    );
    expect(layer).toBeDefined();
    const handler = layer.route.stack[0].handle;

    let responseStatus = 200;
    let responseJson: any = null;
    const req: any = {
      body: {
        projectId: 'proj-route-test',
        shotId: 'shot-a01',
        shotCode: 'A01',
        revisionNumber: 1,
        candidateCount: 4,
        renderMode: 'studio_swap',
        roomName: spacePreset.name,
        styleName: stylePreset.name,
        spacePreset,
        stylePreset,
        camera: compiled.cameraSpec,
        intent: tpl.intent,
        productDNA: {
          modelNumber: 'MW-001',
          name: '芝华仕沙发套组',
          leatherType: '头层牛皮',
          colorCode: '焦糖棕',
          referenceImage: `data:image/png;base64,${dummyBase64}`
        },
        productReferenceImage: `data:image/png;base64,${dummyBase64}`,
        generationSettings: {
          model: 'gemini-nano-banana-2.1-preview',
          resolution: '2K',
          aspectRatio: '4:3',
          renderMode: 'studio_swap'
        },
        promptSnapshot: compiled
      },
      on: vi.fn()
    };
    const res: any = {
      writableEnded: false,
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(payload: any) {
        this.writableEnded = true;
        responseJson = payload;
        return this;
      }
    };

    await handler(req, res, () => {});

    expect(responseStatus).toBe(200);
    expect(responseJson?.success).toBe(true);
    expect(capturedInputs).toHaveLength(4);

    for (const call of capturedInputs) {
      expect(call.renderMode).toBe('studio_swap');
      expect(call.studioSwapContext).toEqual(compiled.studioSwapContext);
      expect(call.studioSwapLightingHint).toBeTruthy();
      // Camera lensMm and pitchDeg must NOT be mutated by candidate variants in studio_swap mode
      expect(call.cameraSettings.lensMm).toBe(compiled.cameraSpec.lensMm);
      expect(call.cameraSettings.pitchDeg).toBe(compiled.cameraSpec.pitchDeg);
    }
  });

  it('passes Scene Master (A00) as Reference Image 2 for derived shots (A01~A08) in studio_swap mode to lock cross-shot background consistency', async () => {
    let capturedBody: any = null;

    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/gateway/generate-image')) {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            success: true,
            imageUrl: 'data:image/webp;base64,' + dummyBase64
          })
        } as any;
      }
      return { ok: true, arrayBuffer: async () => Buffer.from(dummyBase64, 'base64') } as any;
    });

    await SpaceImageGenerationService.generateAndStore({
      projectId: 'test-studio-swap-master-lock',
      shotCode: 'A02',
      referenceShotCode: 'A00',
      positivePrompt: '45 degree ensemble view',
      negativePrompt: '',
      aspectRatio: '4:3',
      preferredModel: 'gemini-nano-banana-2.1-preview',
      resolution: '2K',
      autoModelFallback: false,
      renderMode: 'studio_swap',
      productName: '芝华仕·现代美式沙发套组',
      productColor: '焦糖棕',
      productMaterial: '头层牛皮',
      primaryProduct: {
        name: '芝华仕·现代美式沙发套组',
        colors: ['焦糖棕'],
        materials: ['头层牛皮'],
        referenceImage: `data:image/png;base64,${dummyBase64}`
      },
      productReferenceImage: `data:image/png;base64,${dummyBase64}`,
      sceneMasterReferenceImage: `data:image/png;base64,${dummyBase64}`,
      roomName: '挑空复式庭院豪宅',
      styleName: '现代美式都会宅',
      objectKey: 'test/studio_swap_a02_master_lock.webp'
    });

    expect(capturedBody).toBeDefined();
    // 1. Both Reference Image 1 (composition_reference) and Reference Image 2 (style_reference = empty-room A00 master) must be passed!
    expect(capturedBody.images).toHaveLength(2);
    expect(capturedBody.images[0].role).toBe('composition_reference');
    expect(capturedBody.images[1].role).toBe('style_reference');

    // 2. Prompt must lock background continuity to Reference Image 2 while locking furniture & camera to Reference Image 1
    expect(capturedBody.prompt).toContain('SCENE MASTER BACKGROUND LOCK - 100% CAMERA & FURNITURE FROM IMAGE 1 + ROOM TOPOLOGY & MATERIALS FROM IMAGE 2');
    expect(capturedBody.prompt).toContain('REFERENCE IMAGE 2 ([参考图2｜风格参考] - Panoramic Room Layout & Material Swatch Board from A00)');
    expect(capturedBody.prompt).toContain('COMPLETE OLD BACKGROUND ERASURE');
    expect(capturedBody.prompt).toContain('different room from Reference Image 2');
    expect(capturedBody.prompt).toContain('newly invented staircase');

    // 3. For A02 45° angled shot, must inject 45° 2-point perspective anchors and forbid flat frontal locks
    expect(capturedBody.prompt).toContain('45-DEGREE CORNER PERSPECTIVE ANCHOR');
    expect(capturedBody.prompt).toContain('45-DEGREE CAMERA PERSPECTIVE & 2-POINT DEPTH LOCK');
    expect(capturedBody.prompt).not.toContain('STRICT LEFT-TO-RIGHT SPATIAL ORDER LOCK');
    expect(capturedBody.prompt).toContain('flat frontal mugshot');
    expect(capturedBody.prompt).toContain('copying 0-degree frontal camera angle from Reference Image 2');
  });

  it('A05 2/3主沙发休闲景：锁定天花板 100% 出画，严禁在画框顶部压缩塞入天花板', async () => {
    let capturedBody: any = null;

    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/gateway/generate-image')) {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            success: true,
            imageUrl: 'data:image/webp;base64,' + dummyBase64
          })
        } as any;
      }
      return { ok: true, arrayBuffer: async () => Buffer.from(dummyBase64, 'base64') } as any;
    });

    await SpaceImageGenerationService.generateAndStore({
      projectId: 'test-studio-swap-a05',
      shotCode: 'A05',
      referenceShotCode: 'A00',
      positivePrompt: '2/3 HERO SOFA PRIVATE WINE LOUNGE',
      negativePrompt: '',
      aspectRatio: '3:4',
      preferredModel: 'gemini-nano-banana-2.1-preview',
      resolution: '2K',
      autoModelFallback: false,
      renderMode: 'studio_swap',
      productName: '芝华仕·现代美式沙发套组',
      productColor: '焦糖棕',
      productMaterial: '头层牛皮',
      primaryProduct: {
        name: '芝华仕·现代美式沙发套组',
        referenceImage: `data:image/png;base64,${dummyBase64}`
      },
      productReferenceImage: `data:image/png;base64,${dummyBase64}`,
      sceneMasterReferenceImage: `data:image/png;base64,${dummyBase64}`,
      roomName: '顶层天际会所大宅',
      styleName: '都会收藏家',
      cameraSettings: { lensMm: 50, heightCm: 95, yawDeg: 28, pitchDeg: 0 },
      objectKey: 'test/studio_swap_a05_out_of_frame_ceiling.webp'
    });

    expect(capturedBody).toBeDefined();
    // 必须包含天花板完全出画与防压缩锁
    expect(capturedBody.prompt).toContain('OUT-OF-FRAME CEILING');
    expect(capturedBody.prompt).toContain('ZERO CEILING COMPRESSION LOCK');
    expect(capturedBody.prompt).toContain('visible ceiling');
    expect(capturedBody.prompt).toContain('low ceiling compression');
    expect(capturedBody.prompt).not.toContain('45-DEGREE CORNER PERSPECTIVE ANCHOR');
  });

  it('A05 2/3主沙发私享景（全案编排 Mode B）：强力锁定天花板出画，阻断吊顶灯带', async () => {
    let capturedBody: any = null;

    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/gateway/generate-image')) {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            success: true,
            imageUrl: 'data:image/webp;base64,' + dummyBase64
          })
        } as any;
      }
      return { ok: true, arrayBuffer: async () => Buffer.from(dummyBase64, 'base64') } as any;
    });

    await SpaceImageGenerationService.generateAndStore({
      projectId: 'test-orchestration-a05',
      shotCode: 'A05',
      referenceShotCode: 'A00',
      positivePrompt: '2/3 HERO SOFA PRIVATE WINE LOUNGE',
      negativePrompt: '',
      aspectRatio: '3:4',
      preferredModel: 'gemini-nano-banana-2.1-preview',
      resolution: '2K',
      autoModelFallback: false,
      renderMode: 'orchestration',
      productName: '芝华仕头等舱功能沙发三人位',
      productColor: '焦糖棕',
      productMaterial: '头层牛皮',
      primaryProduct: {
        name: '芝华仕头等舱功能沙发三人位',
        referenceImage: `data:image/png;base64,${dummyBase64}`
      },
      productReferenceImage: `data:image/png;base64,${dummyBase64}`,
      sceneMasterReferenceImage: `data:image/png;base64,${dummyBase64}`,
      roomName: '顶层天际会所大宅',
      styleName: '都会收藏家',
      cameraSettings: { lensMm: 50, heightCm: 95, yawDeg: 28, pitchDeg: 0 },
      objectKey: 'test/orchestration_a05_ceiling_lock.webp'
    });

    expect(capturedBody).toBeDefined();
    expect(capturedBody.prompt).toContain('ABSOLUTE OUT-OF-FRAME CEILING LOCK');
    expect(capturedBody.prompt).toContain('visible ceiling');
    expect(capturedBody.prompt).toContain('ceiling cove');
    expect(capturedBody.prompt).toContain('squeezed ceiling');
  });

  it('A06 零靠墙侧景：锁定沙发背部贴靠 A00 客厅主立面贯通大墙，严禁发明任何隔断假墙', async () => {
    let capturedBody: any = null;

    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/gateway/generate-image')) {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            success: true,
            imageUrl: 'data:image/webp;base64,' + dummyBase64
          })
        } as any;
      }
      return { ok: true, arrayBuffer: async () => Buffer.from(dummyBase64, 'base64') } as any;
    });

    await SpaceImageGenerationService.generateAndStore({
      projectId: 'test-studio-swap-a06',
      shotCode: 'A06',
      referenceShotCode: 'A00',
      positivePrompt: 'A06 ZERO-WALL CLEARANCE PROFILE VIEW',
      negativePrompt: '',
      aspectRatio: '4:3',
      preferredModel: 'gemini-nano-banana-2.1-preview',
      resolution: '2K',
      autoModelFallback: false,
      renderMode: 'studio_swap',
      productName: '芝华仕·现代美式沙发套组',
      productColor: '焦糖棕',
      productMaterial: '头层牛皮',
      primaryProduct: {
        name: '芝华仕·现代美式沙发套组',
        referenceImage: `data:image/png;base64,${dummyBase64}`
      },
      productReferenceImage: `data:image/png;base64,${dummyBase64}`,
      sceneMasterReferenceImage: `data:image/png;base64,${dummyBase64}`,
      roomName: '顶层天际会所大宅',
      styleName: '都会收藏家',
      cameraSettings: { lensMm: 60, heightCm: 90, yawDeg: 88, pitchDeg: 0 },
      objectKey: 'test/studio_swap_a06_continuous_wall.webp'
    });

    expect(capturedBody).toBeDefined();
    // 必须包含连续客厅大墙锁定与严禁隔断假墙
    expect(capturedBody.prompt).toContain('PURE LATERAL PROFILE & CONTINUOUS LIVING ROOM MAIN WALL LOCK');
    expect(capturedBody.prompt).toContain('ZERO-WALL CLEARANCE LOCK');
    expect(capturedBody.prompt).toContain('partition wall');
    expect(capturedBody.prompt).toContain('freestanding wall');
    expect(capturedBody.prompt).not.toContain('45-DEGREE CORNER PERSPECTIVE ANCHOR');
  });

  it('A07 沙发茶几组群中景：自适应继承正面素材视角，严禁强制注入对角透视与反正面负向词', async () => {
    let capturedBody: any = null;

    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/gateway/generate-image')) {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          json: async () => ({
            success: true,
            imageUrl: 'data:image/webp;base64,' + dummyBase64
          })
        } as any;
      }
      return { ok: true, arrayBuffer: async () => Buffer.from(dummyBase64, 'base64') } as any;
    });

    await SpaceImageGenerationService.generateAndStore({
      projectId: 'test-studio-swap-a07',
      shotCode: 'A07',
      referenceShotCode: 'A00',
      positivePrompt: 'A07 ENSEMBLE LIVING COMPOSITION 正大角度全家欢聚',
      negativePrompt: '',
      aspectRatio: '4:3',
      preferredModel: 'gemini-nano-banana-2.1-preview',
      resolution: '2K',
      autoModelFallback: false,
      renderMode: 'studio_swap',
      productName: '芝华仕·现代美式沙发茶几套组',
      productColor: '焦糖棕',
      productMaterial: '头层牛皮',
      primaryProduct: {
        name: '芝华仕·现代美式沙发茶几套组 (1 正大角度)',
        referenceImage: `data:image/png;base64,${dummyBase64}`
      },
      productReferenceImage: `data:image/png;base64,${dummyBase64}`,
      sceneMasterReferenceImage: `data:image/png;base64,${dummyBase64}`,
      roomName: '顶层天际会所大宅',
      styleName: '都会收藏家',
      cameraSettings: { lensMm: 55, heightCm: 95, yawDeg: 0, pitchDeg: -5 },
      objectKey: 'test/studio_swap_a07_frontal_ensemble.webp'
    });

    expect(capturedBody).toBeDefined();
    // 保持正面平视秩序，绝不能被强行扭转为 45 度对角透视
    expect(capturedBody.prompt).toContain('STRICT LEFT-TO-RIGHT SPATIAL ORDER LOCK');
    expect(capturedBody.prompt).not.toContain('45-DEGREE CORNER PERSPECTIVE ANCHOR');
    expect(capturedBody.prompt).not.toContain('flat frontal mugshot');
  });
});
