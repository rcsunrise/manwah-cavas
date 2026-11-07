import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';
import * as providerConfigModule from '../../../../server/ai/providerConfig';
import { SpaceImageGenerationService, extractPureHardFinishSwatch } from '../../../../server/services/spaceImageGenerationService';
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
    // 1. Prompt should contain the dedicated Studio Swap Direct Asymmetric Mandate and read A00 space/style inputs
    expect(capturedBody.prompt).toContain('STUDIO PRODUCT BACKGROUND SWAP - DIRECT ASYMMETRIC VISUAL MAPPING');
    expect(capturedBody.prompt).toContain('Every single furniture entity');
    expect(capturedBody.prompt).toContain('IMMUTABLE CAMERA MATRIX: The camera shooting position, lens perspective, elevation height, downward tilt angle, field of view (FOV), horizon line, and 3D vanishing points MUST 100% STRICTLY AND EXACTLY FOLLOW REFERENCE IMAGE 1');
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

  it('fuses and strips space/style preset descriptive text and camera coordinates in studio_swap mode', async () => {
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
    // 1. Purified prompt: strictly does NOT contain preset descriptions or ceiling height
    expect(capturedBody.prompt).not.toContain('3.8m soaring architectural ceiling headroom');
    expect(capturedBody.prompt).not.toContain('sunken conversation salon with perimeter travertine steps');
    expect(capturedBody.prompt).not.toContain('下沉式围合私享厅');
    expect(capturedBody.prompt).not.toContain('现代美式都会宅');
    expect(capturedBody.prompt).toContain('warm golden hour afternoon sunlight entering through the windows');

    // 2. Does NOT leak orchestration camera / prop / zone placement instructions
    expect(capturedBody.prompt).not.toContain('A02 45-degree angled hero');
    expect(capturedBody.prompt).not.toContain('white matte cylindrical planter');
    expect(capturedBody.prompt).not.toContain('sofa securely anchored at zone center');
    expect(capturedBody.prompt).not.toContain('polished floor tiles');

    // 3. 与工作流页面一致的机位锁：家具与拍摄角度保持不变，严禁复制窗口2的正面平视角度
    expect(capturedBody.prompt).toContain('其中家具、所有的地毯、挂画、餐桌配套保持不变');
    expect(capturedBody.prompt).toContain('要求生成的产品组合与空间透视是融合的');
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
      // 衍生镜头首个候选与工作流页面指令一致，不附加光线氛围；额外候选才用光线变体区分
      if (call.variantIndex === 1 && call.shotCode !== 'A00') {
        expect(call.studioSwapLightingHint).toBeUndefined();
      } else {
        expect(call.studioSwapLightingHint).toBeTruthy();
      }
      // Camera settings must be abolished in studio_swap mode so FOV and pitch strictly follow Reference Image 1
      expect(call.cameraSettings).toBeUndefined();
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
      shotCode: 'A01',
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
    // 1. 与工作流页面一致：窗口1 = 产品场景实拍图 (primary_product)，窗口2 = 完整 A00 母版 (style_reference)
    expect(capturedBody.images).toHaveLength(2);
    expect(capturedBody.images[0].role).toBe('primary_product');
    expect(capturedBody.images[1].role).toBe('style_reference');

    // 2. Prompt must lock background continuity to Reference Image 2 while locking furniture & camera to Reference Image 1
    expect(capturedBody.prompt).toContain('场景风格：参考窗口2（母版空间的硬装样板拼图');
    expect(capturedBody.prompt).toContain('空间结构与拍摄机位以窗口1为准），按三人位的沙发调性生成新的调性背景墙');
    expect(capturedBody.prompt).toContain('保持窗口1的产品角度不变');
    expect(capturedBody.prompt).not.toContain('45mm lens at 115cm height');
    expect(capturedBody.prompt).toContain('要求生成的产品组合与空间透视是融合的');
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
    // 极简换景模式下：统一遵循直接非对称映射契约，镜头严格跟随参考图 1，无固定相机参数污染
    expect(capturedBody.prompt).toContain('商企-画面场景更换背景');
    expect(capturedBody.prompt).toContain('保持窗口1的产品角度不变');
    expect(capturedBody.prompt).toContain('场景风格：参考窗口2（母版空间的硬装样板拼图');
    expect(capturedBody.prompt).toContain('空间结构与拍摄机位以窗口1为准），按三人位的沙发调性生成新的调性背景墙');
    expect(capturedBody.prompt).not.toContain('50mm lens at 95cm height');
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

  it('A06 零靠墙侧景：在 studio_swap 下确立纯视觉直接映射，彻底废除固定相机参数', async () => {
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
    expect(capturedBody.prompt).toContain('商企-画面场景更换背景');
    expect(capturedBody.prompt).toContain('保持窗口1的产品角度不变');
    expect(capturedBody.prompt).toContain('场景风格：参考窗口2（母版空间的硬装样板拼图');
    expect(capturedBody.prompt).toContain('空间结构与拍摄机位以窗口1为准），按三人位的沙发调性生成新的调性背景墙');
    expect(capturedBody.prompt).not.toContain('60mm lens at 90cm height');
  });

  it('A07 沙发茶几组群中景：在 studio_swap 下确立纯视觉直接映射，严禁固定相机参数污染', async () => {
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
    expect(capturedBody.prompt).toContain('商企-画面场景更换背景');
    expect(capturedBody.prompt).toContain('保持窗口1的产品角度不变');
    expect(capturedBody.prompt).toContain('场景风格：参考窗口2（母版空间的硬装样板拼图');
    expect(capturedBody.prompt).toContain('空间结构与拍摄机位以窗口1为准），按三人位的沙发调性生成新的调性背景墙');
    expect(capturedBody.prompt).not.toContain('55mm lens at 95cm height');
  });

  it('extractPureHardFinishSwatch extracts zero-sofa architectural swatch board and falls back gracefully', async () => {
    // 1. Fallback for tiny image
    const tinyResult = await extractPureHardFinishSwatch({
      mimeType: 'image/png',
      data: dummyBase64
    });
    expect(tinyResult.data).toBe(dummyBase64);

    // 2. Synthesizes 1024x768 swatch board for valid room image
    const validImg = await sharp({
      create: { width: 300, height: 200, channels: 3, background: { r: 50, g: 50, b: 50 } }
    })
      .png()
      .toBuffer();

    const swatchResult = await extractPureHardFinishSwatch({
      mimeType: 'image/png',
      data: validImg.toString('base64')
    });

    expect(swatchResult.mimeType).toBe('image/webp');
    expect(swatchResult.data).toBeDefined();

    const swatchMeta = await sharp(Buffer.from(swatchResult.data, 'base64')).metadata();
    expect(swatchMeta.width).toBe(1024);
    expect(swatchMeta.height).toBe(768);
  });

  it('passes the full scene master as Reference Image 2 for derived shot A03 in studio_swap mode, matching the workflow page', async () => {
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

    const validMaster = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 60, g: 60, b: 60 } }
    })
      .png()
      .toBuffer();

    await SpaceImageGenerationService.generateAndStore({
      projectId: 'test-studio-swap-swatch-injection',
      shotCode: 'A03',
      referenceShotCode: 'A00',
      positivePrompt: '',
      negativePrompt: '',
      aspectRatio: '4:3',
      preferredModel: 'gemini-nano-banana-2.1-preview',
      resolution: '2K',
      autoModelFallback: false,
      renderMode: 'studio_swap',
      productName: '芝华仕沙发',
      productReferenceImage: `data:image/png;base64,${dummyBase64}`,
      sceneMasterReferenceImage: `data:image/png;base64,${validMaster.toString('base64')}`,
      objectKey: 'test/studio_swap_swatch_test.webp'
    });

    expect(capturedBody).toBeDefined();
    expect(capturedBody.images).toHaveLength(2);
    // 窗口1：产品场景实拍图 (primary_product)，与工作流页面一致
    expect(capturedBody.images[0].role).toBe('primary_product');
    // 窗口2：母版裁成的 硬装样板拼图（上方主背景墙大图 + 下方三张细节小图）（不再给整张房间，避免模型照搬母版机位）
    expect(capturedBody.images[1].role).toBe('style_reference');
    const masterMeta = await sharp(Buffer.from(capturedBody.images[1].data.split(',')[1], 'base64')).metadata();
    expect(masterMeta.width).toBe(420 * 3 + 28 * 4);
    expect(masterMeta.height).toBe(28 * 2 + 560 + 315 + 28);
    // 简短换景指令：不写死背景材质，不堆砌负面词，非 A02 镜头不出现 45° 字样
    expect(capturedBody.prompt).toContain('保持窗口1的产品角度不变');
    expect(capturedBody.prompt).not.toContain('dark marble');
    expect(capturedBody.prompt).not.toContain('Negative constraints:');
    expect(capturedBody.prompt).not.toContain('45度斜侧视角');
  });

  const runRefineScenario = async (refineFails: boolean) => {
    const gatewayBodies: any[] = [];
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      if (String(url).includes('/api/gateway/generate-image')) {
        const body = JSON.parse(init.body);
        gatewayBodies.push(body);
        if (refineFails && gatewayBodies.length === 2) {
          return { ok: false, json: async () => ({ error: { message: 'fetch failed' } }) } as any;
        }
        return { ok: true, json: async () => ({ success: true, imageUrl: 'data:image/webp;base64,' + dummyBase64 }) } as any;
      }
      return { ok: true, arrayBuffer: async () => Buffer.from(dummyBase64, 'base64') } as any;
    });
    const master = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 60, g: 60, b: 60 } } }).png().toBuffer();
    const result = await SpaceImageGenerationService.generateAndStore({
      projectId: 'test-refine-pass',
      shotCode: 'A03',
      referenceShotCode: 'A00',
      positivePrompt: '',
      negativePrompt: '',
      aspectRatio: '4:3',
      preferredModel: 'gemini-nano-banana-2.1-preview',
      resolution: '2K',
      autoModelFallback: false,
      renderMode: 'studio_swap',
      studioSwapRefinePass: true,
      productName: '芝华仕沙发',
      productReferenceImage: `data:image/png;base64,${dummyBase64}`,
      sceneMasterReferenceImage: `data:image/png;base64,${master.toString('base64')}`,
      objectKey: 'test/refine_pass.webp'
    });
    return { gatewayBodies, result };
  };

  it('two-step pass: GPT 2.5 Flare composes, then Nano Banana 2.1 refines on top of the composed image', async () => {
    const { gatewayBodies, result } = await runRefineScenario(false);
    expect(gatewayBodies).toHaveLength(2);
    // 第一步：无论右侧选了哪个模型，衍生镜头都用 GPT 2.5 Flare 换景
    expect(gatewayBodies[0].model).toBe('openai/gpt-image-2.5-flare-c');
    expect(gatewayBodies[0].prompt).toContain('保持窗口1的产品角度不变');
    // 第二步：Nano Banana 2.1 以第一步结果为底图（窗口1）、实拍图为材质参考（窗口2）精修
    expect(gatewayBodies[1].model).toBe('gemini-nano-banana-2.1-preview');
    expect(gatewayBodies[1].prompt).toContain('画面精修重绘：以窗口1为底图');
    expect(gatewayBodies[1].images).toHaveLength(2);
    expect(gatewayBodies[1].images[0].role).toBe('composition_reference');
    expect(gatewayBodies[1].images[1].role).toBe('primary_product');
    expect(gatewayBodies[1].images[1].data).toBe(gatewayBodies[0].images[0].data);
    expect(result.model).toContain('精修');
    expect(result.warningNotice).toBeUndefined();
  });

  it('two-step pass keeps the GPT result with a notice when the refine step fails', async () => {
    const { gatewayBodies, result } = await runRefineScenario(true);
    expect(gatewayBodies).toHaveLength(2);
    expect(result.model).not.toContain('精修');
    expect(result.warningNotice).toContain('已保留 GPT 2.5 Flare 换景结果');
  });

  it('aligns derived shot A02 in studio_swap mode directly with ManwahStudio full scene master reference and clean prompt', async () => {
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

    const validMaster = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 60, g: 60, b: 60 } }
    })
      .png()
      .toBuffer();

    await SpaceImageGenerationService.generateAndStore({
      projectId: 'test-studio-swap-a02-aligned',
      shotCode: 'A02',
      referenceShotCode: 'A00',
      positivePrompt: '',
      negativePrompt: '',
      aspectRatio: '4:3',
      preferredModel: 'gemini-nano-banana-2.1-preview',
      resolution: '2K',
      autoModelFallback: false,
      renderMode: 'studio_swap',
      productName: '芝华仕沙发',
      productReferenceImage: `data:image/png;base64,${dummyBase64}`,
      sceneMasterReferenceImage: `data:image/png;base64,${validMaster.toString('base64')}`,
      objectKey: 'test/studio_swap_a02_aligned.webp'
    });

    expect(capturedBody).toBeDefined();
    expect(capturedBody.images).toHaveLength(2);
    expect(capturedBody.images[0].role).toBe('primary_product');
    // A02 preserves full scene master directly without swatch slicing
    expect(capturedBody.images[1].role).toBe('style_reference');
    // Prompt follows streamlined ManwahStudio commercial replacement directive
    expect(capturedBody.prompt).toContain('画面重绘，以窗口1为底图，商企-画面场景更换背景，按产品的调性生成新的空间背景');
    expect(capturedBody.prompt).toContain('场景风格：参考窗口2（母版空间的硬装样板拼图');
    expect(capturedBody.prompt).toContain('空间结构与拍摄机位以窗口1为准），按三人位的沙发调性生成新的调性背景墙');
    expect(capturedBody.prompt).toContain('保证原图的尺寸比例不变。');
    expect(capturedBody.prompt).toContain('保持窗口1的产品角度不变');
    expect(capturedBody.prompt).toContain('要求生成的产品组合与空间透视是融合的');
  });

  it('forwards userId and deptId to unified gateway for user billing and audit log recording', async () => {
    let capturedHeaders: any = null;
    let capturedBody: any = null;

    vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/gateway/generate-image')) {
        capturedHeaders = init.headers;
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
      projectId: 'test-billing-trace',
      shotCode: 'A00',
      userId: 'user-emp-12345',
      deptId: 'dept-design-01',
      positivePrompt: 'luxury living room',
      aspectRatio: '4:3',
      preferredModel: 'gemini-nano-banana-2.1-preview',
      resolution: '2K',
      autoModelFallback: false,
      renderMode: 'studio_swap',
      productName: '芝华仕沙发',
      productReferenceImage: `data:image/png;base64,${dummyBase64}`,
      objectKey: 'test/studio_swap_billing.webp'
    });

    expect(capturedHeaders).toBeDefined();
    expect(capturedHeaders['x-user-uuid']).toBe('user-emp-12345');
    expect(capturedHeaders['x-dept-id']).toBe('dept-design-01');
    expect(capturedBody.userUuid).toBe('user-emp-12345');
    expect(capturedBody.deptId).toBe('dept-design-01');
  });

  it('promotes Gemini 3 Pro as the top flagship model in registry and generates via gateway', async () => {
    const { SPACE_IMAGE_MODELS, getModelById } = await import('../../../config/imageModelRegistry');
    
    // 验证首选模型为商业旗舰 Gemini 3 Pro
    expect(SPACE_IMAGE_MODELS[0].id).toBe('gemini-3-pro-image-preview');
    expect(SPACE_IMAGE_MODELS[0].tier).toBe('flagship');
    expect(SPACE_IMAGE_MODELS[0].badge).toContain('旗舰');
    
    // 验证未识别模型安全兜底至 Gemini 3 Pro
    expect(getModelById('unknown-model-xyz').id).toBe('gemini-3-pro-image-preview');

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
      projectId: 'test-gemini-3-pro-pipeline',
      shotCode: 'A02',
      userId: 'user-flagship-pro',
      deptId: 'dept-flagship-pro',
      positivePrompt: 'luxury corner perspective living room',
      aspectRatio: '4:3',
      preferredModel: 'gemini-3-pro-image-preview',
      resolution: '2K',
      autoModelFallback: false,
      renderMode: 'studio_swap',
      productName: '芝华仕功能沙发',
      productReferenceImage: `data:image/png;base64,${dummyBase64}`,
      objectKey: 'test/gemini_3_pro_studio_swap.webp'
    });

    expect(capturedBody).toBeDefined();
    expect(capturedBody.model).toBe('gemini-3-pro-image');
    expect(capturedBody.userUuid).toBe('user-flagship-pro');
  });
});
