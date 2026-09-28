// server/routes/spaceBuildRoutes.ts
// MANWAH Space Studio｜BUILD 阶段核心服务端 API 路由 V3.0
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { GcsAssetStorage } from '../services/storage/gcsAssetStorage';
import { SpaceObjectKeyBuilder } from '../../src/shared/storage/spaceObjectKeys';
import { SpaceImageGenerationService } from '../services/spaceImageGenerationService';
import {
  SpaceProductAnalysisService,
  AnalyzeProductRequestSchema
} from '../services/spaceProductAnalysisService';
import { resolveApiConfig, isProviderKeyValid } from '../ai/providerConfig';

const router = Router();
const storage = GcsAssetStorage.getInstance();

/**
 * POST /api/space/build/extract-product-dna
 * 产品图片资产上传、GCS持久化与多模态AI深度物理读数
 */
router.post('/extract-product-dna', async (req: Request, res: Response) => {
  try {
    const parsed = AnalyzeProductRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid product analysis payload',
        details: parsed.error.issues
      });
    }

    const userId = (req as any).user?.id || 'system';
    const result = await SpaceProductAnalysisService.analyzeAndExtract(parsed.data, userId);

    return res.json({
      success: true,
      data: result
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to analyze product DNA';
    return res.status(500).json({
      success: false,
      error: message
    });
  }
});

/**
 * POST /api/space/build/analyze-product
 * 别名路由，兼容历史调用
 */
router.post('/analyze-product', async (req: Request, res: Response) => {
  try {
    const parsed = AnalyzeProductRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid product analysis payload',
        details: parsed.error.issues
      });
    }

    const userId = (req as any).user?.id || 'system';
    const result = await SpaceProductAnalysisService.analyzeAndExtract(parsed.data, userId);

    return res.json({
      success: true,
      data: result
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to analyze product DNA';
    return res.status(500).json({
      success: false,
      error: message
    });
  }
});


const LockSceneMasterSchema = z.object({
  projectId: z.string().min(1),
  sceneMasterId: z.string().min(1),
  revisionId: z.string().min(1),
  aspectRatio: z.string().optional(),
  generationSettings: z.record(z.string(), z.any()).optional(),
  promptSnapshot: z.record(z.string(), z.any()),
  primaryProduct: z
    .object({
      id: z.string().optional(),
      sku: z.string().optional(),
      name: z.string().optional(),
      materials: z.array(z.string()).optional(),
      colors: z.array(z.string()).optional(),
      surfaceTexture: z.string().optional(),
      referenceImage: z.string().optional(),
      referenceImageUrl: z.string().optional(),
      referenceImages: z.array(z.any()).optional()
    })
    .passthrough()
    .optional(),
  locks: z.object({
    productIdentity: z.boolean().default(true),
    placement: z.boolean().default(true),
    architecture: z.boolean().default(true),
    style: z.boolean().default(true),
    material: z.boolean().default(true),
    lighting: z.boolean().default(true),
    camera: z.boolean().default(true),
    human: z.boolean().default(false)
  })
});

/**
 * POST /api/space/build/lock-master
 * 严格锁定 A00 空间母版状态基准并生成真实可追溯工程资产
 */
router.post('/lock-master', async (req: Request, res: Response) => {
  try {
    const parsed = LockSceneMasterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid scene master payload',
        details: parsed.error.issues
      });
    }

    const { projectId, sceneMasterId, revisionId, promptSnapshot, primaryProduct, locks, generationSettings } = parsed.data;

    const objectKey = SpaceObjectKeyBuilder.sceneMaster({
      projectId,
      sceneMasterId,
      revisionId,
      extension: 'webp'
    });

    const metaObjectKey = SpaceObjectKeyBuilder.sceneMaster({
      projectId,
      sceneMasterId,
      revisionId,
      extension: 'json'
    });

    // 1. 提取产品真值与视觉参考基准
    const effectiveProductName = primaryProduct?.name || promptSnapshot?.productName || '敏华芝华仕头等舱功能真皮沙发';
    const effectiveProductColor = primaryProduct?.colors?.[0] || '干邑暖橙 (Cognac Amber)';
    const effectiveProductMaterial = primaryProduct?.materials?.[0] || '南美进口头层牛皮 (半苯胺)';
    const effectiveRefImage =
      primaryProduct?.referenceImage ||
      primaryProduct?.referenceImageUrl ||
      primaryProduct?.referenceImages?.[0]?.publicUrl ||
      primaryProduct?.referenceImages?.[0]?.objectKey;

    const positivePrompt = promptSnapshot?.positivePrompt || `MANWAH luxury ${effectiveProductName} in ${effectiveProductColor} in metropolitan collector penthouse`;
    const negativePrompt = promptSnapshot?.negativePrompt || '';
    const cameraSettings = promptSnapshot?.cameraSettings || {
      lensMm: 35,
      heightCm: 130,
      yawDeg: 0,
      pitchDeg: -2
    };

    const effectiveAspectRatio = parsed.data.aspectRatio || promptSnapshot?.aspectRatio || '3:4';

    // 2. 触发真实工程资产生成 (注入产品真实视觉真值与多模态参考图)
    const imageResult = await SpaceImageGenerationService.generateAndStore({
      projectId,
      shotCode: 'A00',
      positivePrompt,
      negativePrompt,
      aspectRatio: effectiveAspectRatio,
      productName: effectiveProductName,
      productColor: effectiveProductColor,
      productMaterial: effectiveProductMaterial,
      primaryProduct: {
        id: primaryProduct?.id,
        sku: primaryProduct?.sku,
        name: effectiveProductName,
        colors: primaryProduct?.colors,
        materials: primaryProduct?.materials,
        surfaceTexture: primaryProduct?.surfaceTexture,
        referenceImage: effectiveRefImage
      },
      productReferenceImage: effectiveRefImage,
      roomName: promptSnapshot?.roomName || '都会大平层客厅',
      styleName: promptSnapshot?.styleName || '都会收藏家 (ST-01)',
      cameraSettings,
      objectKey,
      preferredModel: generationSettings?.model,
      resolution: generationSettings?.resolution,
      seed: generationSettings?.seed
    });

    // 2. 保存空间母版元数据快照到对象存储中
    const metaBuffer = Buffer.from(
      JSON.stringify(
        {
          sceneMasterId,
          revisionId,
          lockedAt: new Date().toISOString(),
          locks,
          promptSnapshot,
          imageAsset: {
            objectKey: imageResult.objectKey,
            provider: imageResult.provider,
            model: imageResult.model,
            bytes: imageResult.bytes,
            sha256: imageResult.sha256,
            contentType: imageResult.contentType,
            provenance: imageResult.provenance,
            productionTruth: imageResult.productionTruth
          }
        },
        null,
        2
      ),
      'utf-8'
    );

    await storage.put({
      bucketType: 'generated',
      objectKey: metaObjectKey,
      buffer: metaBuffer,
      contentType: 'application/json'
    });

    res.json({
      success: true,
      data: {
        sceneMasterId,
        revisionId,
        aspectRatio: effectiveAspectRatio,
        objectKey: imageResult.objectKey,
        imageUrl: imageResult.imageUrl,
        metaObjectKey,
        isLocked: true,
        lockedAt: new Date().toISOString(),
        locks,
        imageAsset: {
          bytes: imageResult.bytes,
          sha256: imageResult.sha256,
          provider: imageResult.provider,
          model: imageResult.model,
          provenance: imageResult.provenance,
          productionTruth: imageResult.productionTruth
        }
      }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to lock scene master'
    });
  }
});

/**
 * GET /api/space/build/pipeline-health
 * 实时检查生图线路、存储后端与多模态网关连通性
 */
router.get('/pipeline-health', async (req: Request, res: Response) => {
  try {
    const config = await resolveApiConfig('system');
    const isKeyConfigured = isProviderKeyValid(config.apiKey);
    const storageInstance = GcsAssetStorage.getInstance();
    const storageMeta = storageInstance.getStatus();

    res.json({
      success: true,
      data: {
        status: isKeyConfigured ? 'connected' : 'key_missing',
        provider: config.provider || 'gemini',
        gateway: config.baseUrl || 'direct',
        storage: storageMeta.isGcsAvailable ? 'gcs_connected' : 'local_fallback',
        storageProvider: storageMeta.effectiveProvider,
        models: [
          'gemini-3.1-flash-image',
          'gemini-2.5-flash-image',
          'gemini-3-pro-image-preview'
        ],
        timestamp: new Date().toISOString()
      }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Pipeline health check failed'
    });
  }
});

export default router;

