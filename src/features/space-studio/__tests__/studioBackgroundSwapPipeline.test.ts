import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as providerConfigModule from '../../../../server/ai/providerConfig';
import { SpaceImageGenerationService } from '../../../../server/services/spaceImageGenerationService';
import { GcsAssetStorage } from '../../../../server/services/storage/gcsAssetStorage';

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
    expect(capturedBody.prompt).toContain('raised headrest');

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
});
