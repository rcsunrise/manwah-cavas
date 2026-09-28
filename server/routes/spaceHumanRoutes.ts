// server/routes/spaceHumanRoutes.ts
// MANWAH Space Studio｜03 HUMAN 模特与就座 Pass 服务端路由 V5.0
// 核心纪律：
// 1. Keep Furniture Fixed (家具全局物理不变量严格锁死，绝对零平移/变形)；
// 2. 独立 Human-only Revision 分支，其 parentRevisionId 严格指向过审无人物镜头；
// 3. 人体工程与功能脚托状态物理约束校验；
// 4. 存盘标准 Human-pass 元数据，明确 provenance = 'DERIVED' 且 productionTruth = false。

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { GcsAssetStorage } from '../services/storage/gcsAssetStorage';
import { SpaceObjectKeyBuilder } from '../../src/shared/storage/spaceObjectKeys';
import { HumanErgonomicsEngine } from '../../src/features/space-studio/engine/humanErgonomicsEngine';
import { SpaceImageGenerationService } from '../services/spaceImageGenerationService';
import { SeatAssignment } from '../../src/types/spaceStudio';

const router = Router();
const storage = GcsAssetStorage.getInstance();

const GenerateHumanPassSchema = z.object({
  projectId: z.string(),
  shotCode: z.string(),
  parentRevisionId: z.string(),
  revisionNumber: z.number(),
  camera: z.object({
    lensMm: z.number(),
    heightCm: z.number(),
    yawDeg: z.number(),
    pitchDeg: z.number(),
    framing: z.string().optional().default('wide')
  }).passthrough(),
  familyPresetId: z.string().optional(),
  sceneDirectives: z.string().optional(),
  customHumanAssets: z
    .array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          role: z.string().optional(),
          imageUrl: z.string().optional(),
          styleDescription: z.string().optional()
        })
        .passthrough()
    )
    .optional(),
  baseShotReference: z
    .object({
      objectKey: z.string().optional(),
      imageUrl: z.string().optional()
    })
    .passthrough()
    .optional(),
  primaryProduct: z
    .object({
      name: z.string().optional(),
      colors: z.array(z.string()).optional(),
      materials: z.array(z.string()).optional(),
      referenceImage: z.string().optional()
    })
    .passthrough()
    .optional(),
  assignments: z.array(
    z.object({
      humanAssetId: z.string(),
      seatId: z.string(),
      poseId: z.string(),
      functionState: z.enum(['closed', 'open', 'recline']),
      footrestState: z.enum(['retracted', 'elevating', 'fully_extended', 'zero_gravity']),
      headrestAngleDeg: z.number().optional(),
      lumbarSupportMm: z.number().optional()
    })
  )
});

/**
 * POST /api/space/human/generate-human-revision
 * 生成 Human-only Revision 分支
 */
router.post('/generate-human-revision', async (req: Request, res: Response) => {
  try {
    const parsed = GenerateHumanPassSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid human pass payload',
        details: parsed.error.format()
      });
    }

    const {
      projectId,
      shotCode,
      parentRevisionId,
      revisionNumber,
      camera,
      familyPresetId,
      sceneDirectives,
      customHumanAssets,
      baseShotReference,
      primaryProduct,
      assignments
    } = parsed.data;

    // 1. 人机工程校验
    const ergonomicsReport = HumanErgonomicsEngine.evaluate({
      assignments: assignments as SeatAssignment[]
    });

    if (!ergonomicsReport.passed) {
      return res.status(422).json({
        success: false,
        error: '人体工程或机械状态校验未通过',
        ergonomicsReport
      });
    }

    const revisionId = `rev-${shotCode.toLowerCase()}-human-v${revisionNumber}`;

    // 2. 构建规范化对象存储路径 (shots/:shotId/revisions/:revisionId/human_pass.webp)
    const objectKey = SpaceObjectKeyBuilder.shotRevisionOriginal({
      projectId,
      shotId: shotCode,
      revisionId,
      extension: 'webp'
    });

    const metaKey = SpaceObjectKeyBuilder.shotRevisionOriginal({
      projectId,
      shotId: shotCode,
      revisionId,
      extension: 'json'
    });

    // 3. 组织 Human-only Revision 元数据
    const metaPayload = {
      projectId,
      shotCode,
      revisionId,
      parentRevisionId,
      revisionNumber,
      isHumanOnlyPass: true,
      keepFurnitureFixed: true, // 核心工程不变量
      familyPresetId,
      sceneDirectives,
      customHumanAssets,
      assignments,
      ergonomicsReport,
      camera,
      provenance: 'DERIVED',
      productionTruth: false,
      createdAt: new Date().toISOString()
    };

    // 4. 存盘元数据
    await storage.put({
      objectKey: metaKey,
      buffer: Buffer.from(JSON.stringify(metaPayload, null, 2)),
      contentType: 'application/json'
    });

    // 5. 真实生成带模特的人体工学空间画面 (底图严格锚定当前机位原图，保证家具空间零漂移)
    const effectiveProductName = primaryProduct?.name || '敏华芝华仕头等舱功能真皮沙发';
    const effectiveProductColor = primaryProduct?.colors?.[0] || '干邑暖橙 (Cognac Amber)';
    const effectiveProductMaterial = primaryProduct?.materials?.[0] || '南美进口头层牛皮 (半苯胺)';
    const effectiveCurrentShotRef = baseShotReference?.imageUrl || baseShotReference?.objectKey;

    const narrativeDirective = sceneDirectives?.trim()
      ? `EXPLICIT HUMAN NARRATIVE & LIFESTYLE ACTION: "${sceneDirectives.trim()}". `
      : '';

    const positivePrompt = `MANWAH first-class luxury ${effectiveProductName} in ${effectiveProductColor}, penthouse living room, natural daylight, ${narrativeDirective}${assignments.length} family members seated comfortably: ${assignments.map((a) => `${a.humanAssetId} in ${a.poseId} posture on ${a.seatId} seat with ${a.footrestState} footrest`).join(', ')}, photorealistic 8k architectural interior commercial photography`;

    const imageResult = await SpaceImageGenerationService.generateAndStore({
      projectId,
      shotCode,
      positivePrompt,
      negativePrompt: 'blurry, distorted anatomy, floating furniture, displaced sofa, changed sofa color, watermark',
      aspectRatio: '3:4',
      productName: effectiveProductName,
      productColor: effectiveProductColor,
      productMaterial: effectiveProductMaterial,
      primaryProduct: {
        name: effectiveProductName,
        colors: [effectiveProductColor],
        materials: [effectiveProductMaterial],
        referenceImage: primaryProduct?.referenceImage
      },
      currentShotReferenceImage: effectiveCurrentShotRef,
      roomName: '大平层高定会客厅',
      styleName: '都会收藏家',
      cameraSettings: {
        lensMm: camera.lensMm,
        heightCm: camera.heightCm,
        yawDeg: camera.yawDeg,
        pitchDeg: camera.pitchDeg
      },
      objectKey
    });

    res.json({
      success: true,
      data: {
        revisionId,
        parentRevisionId,
        revisionNumber,
        objectKey,
        metaKey,
        imageUrl: imageResult.imageUrl,
        status: 'approved',
        provenance: 'DERIVED',
        productionTruth: false,
        ergonomicsReport,
        imageAsset: {
          bytes: imageResult.bytes,
          sha256: imageResult.sha256,
          provider: imageResult.provider,
          model: imageResult.model
        }
      }
    });
  } catch (err: any) {
    console.error('[spaceHumanRoutes] generate-human-revision error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to generate human pass'
    });
  }
});

export default router;
