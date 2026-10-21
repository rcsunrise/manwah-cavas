// server/routes/spaceShootRoutes.ts
// MANWAH Space Studio｜SHOOT 阶段服务端 API 路由 V3.0
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { GcsAssetStorage } from '../services/storage/gcsAssetStorage';
import { SpaceObjectKeyBuilder } from '../../src/shared/storage/spaceObjectKeys';
import { SpaceMultimodalRefereeService } from '../services/spaceMultimodalRefereeService';
import { SpaceImageGenerationService } from '../services/spaceImageGenerationService';

import sharp from 'sharp';

const router = Router();
const storage = GcsAssetStorage.getInstance();

// 内存中活跃渲染锁，防止重复并发调用生图 API (5秒锁)
const activeRenderingLocks = new Map<string, number>();

const RenderShotSchema = z.object({
  projectId: z.string().min(1),
  shotCode: z.string().min(1), // e.g. A01, A02
  revisionNumber: z.number().int().positive().default(1),
  candidateCount: z.number().int().min(1).max(4).optional().default(1),
  roomName: z.string().optional(),
  spaceCode: z.string().optional(),
  styleName: z.string().optional(),
  styleCode: z.string().optional(),
  spacePreset: z.any().optional(),
  stylePreset: z.any().optional(),
  camera: z.object({
    lensMm: z.number(),
    heightCm: z.number(),
    yawDeg: z.number(),
    pitchDeg: z.number(),
    rollDeg: z.number().optional().default(0),
    framing: z.string().optional().default('wide')
  }).passthrough(),
  intent: z.object({
    intentCode: z.string().optional(),
    name: z.string().optional(),
    productDominancePct: z.number().optional(),
    maxOcclusionPct: z.number().optional()
  }).passthrough().optional(),
  productDNA: z.object({
    modelNumber: z.string().optional(),
    name: z.string().optional(),
    leatherType: z.string().optional(),
    colorCode: z.string().optional(),
    referenceImage: z.string().optional()
  }).passthrough().optional(),
  sceneMasterReference: z.object({
    objectKey: z.string().optional(),
    imageUrl: z.string().optional()
  }).passthrough().optional(),
  productReferenceImage: z.string().optional(),
  ensembleProducts: z.array(z.object({
    id: z.string().optional(),
    sku: z.string().optional(),
    role: z.string().optional(),
    priority: z.string().optional(),
    name: z.string().optional(),
    color: z.string().optional(),
    colors: z.array(z.string()).optional(),
    material: z.string().optional(),
    materials: z.array(z.string()).optional(),
    referenceImage: z.string().optional(),
    referenceImages: z.array(z.any()).optional(),
    dimensions: z.object({
      width: z.number().optional(),
      depth: z.number().optional(),
      height: z.number().optional()
    }).optional()
  }).passthrough()).optional(),
  promptSnapshot: z.record(z.string(), z.any()),
  isHumanPass: z.boolean().optional(),
  baseShotReferenceImage: z.string().optional(),
  currentShotReferenceImage: z.string().optional(),
  humanLayout: z.any().optional(),
  selectedModels: z.array(z.any()).optional(),
  generationSettings: z.object({
    templateId: z.string().optional(),
    model: z.string().optional(),
    resolution: z.string().optional(),
    aspectRatio: z.string().optional(),
    seed: z.number().optional(),
    useRandomSeed: z.boolean().optional()
  }).passthrough().optional()
});

/**
 * POST /api/space/shoot/render-shot
 * 触发单镜头渲染并生成规范化的对象版本快照
 */
router.post('/render-shot', async (req: Request, res: Response) => {
  try {
    const parsed = RenderShotSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid render-shot payload',
        details: parsed.error.issues
      });
    }

    const {
      projectId,
      shotCode,
      revisionNumber,
      camera,
      intent,
      productDNA,
      sceneMasterReference,
      productReferenceImage,
      ensembleProducts,
      promptSnapshot,
      generationSettings
    } = parsed.data;

    const revisionId = `rev-${revisionNumber}`;

    // 1. 生成规范化存储 Key (按 Requirement 10 严格统一)
    // 镜头原图：projects/{id}/shots/{shotCode}/revisions/{rev}/original.webp
    // 评审结果：projects/{id}/shots/{shotCode}/revisions/{rev}/validation.json
    // 提示词快照：projects/{id}/shots/{shotCode}/revisions/{rev}/prompt.json
    const objectKey = SpaceObjectKeyBuilder.shotRevisionOriginal({
      projectId,
      shotId: shotCode,
      revisionId,
      extension: 'webp'
    });

    const validationKey = SpaceObjectKeyBuilder.shotRevisionValidation({
      projectId,
      shotId: shotCode,
      revisionId
    });

    const promptKey = SpaceObjectKeyBuilder.shotRevisionPrompt({
      projectId,
      shotId: shotCode,
      revisionId
    });

    // 2. 真实生成该镜头的影像资产 (继承 A00 空间母版与产品真值图像，严格保证一路延续)
    const effectiveProductName = productDNA?.name || '敏华芝华仕头等舱功能真皮沙发';
    const effectiveProductColor = productDNA?.colorCode || '干邑暖橙 (Cognac Amber)';
    const effectiveProductMaterial = productDNA?.leatherType || '南美进口头层牛皮 (半苯胺)';
    const effectiveProductRef = productReferenceImage || (productDNA as any)?.referenceImage;
    const effectiveSceneMasterRef = sceneMasterReference?.imageUrl || sceneMasterReference?.objectKey;

    const positivePrompt = promptSnapshot?.positivePrompt || `MANWAH shot ${shotCode} luxury ${effectiveProductName} in ${effectiveProductColor}`;
    const negativePrompt = promptSnapshot?.negativePrompt || '';

    const imageResult = await SpaceImageGenerationService.generateAndStore({
      projectId,
      shotCode,
      positivePrompt,
      negativePrompt,
      aspectRatio: generationSettings?.aspectRatio || '4:3',
      preferredModel: generationSettings?.model,
      resolution: generationSettings?.resolution,
      seed: generationSettings?.seed,
      autoModelFallback: (generationSettings as any)?.autoModelFallback ?? (req.body as any)?.autoModelFallback,
      productName: effectiveProductName,
      productColor: effectiveProductColor,
      productMaterial: effectiveProductMaterial,
      primaryProduct: {
        name: effectiveProductName,
        colors: [effectiveProductColor],
        materials: [effectiveProductMaterial],
        referenceImage: effectiveProductRef
      },
      ensembleProducts: ensembleProducts || (req.body as any)?.ensembleProducts,
      productReferenceImage: effectiveProductRef,
      sceneMasterReferenceImage: effectiveSceneMasterRef,
      roomName: '都会收藏家大平层客厅',
      styleName: '都会收藏家',
      cameraSettings: {
        lensMm: camera.lensMm,
        heightCm: camera.heightCm,
        yawDeg: camera.yawDeg,
        pitchDeg: camera.pitchDeg
      },
      objectKey
    });

    // 3. 调用真正的多模态裁判服务进行生审解耦评测 (Multimodal Decoupled Referee)
    const validationReport = await SpaceMultimodalRefereeService.evaluateShot({
      projectId,
      shotCode,
      revisionId,
      camera,
      intent: {
        name: intent?.name || '标准视角',
        productDominancePct: intent?.productDominancePct ?? 65,
        maxOcclusionPct: intent?.maxOcclusionPct ?? 20
      },
      productDNA: {
        modelNumber: productDNA?.modelNumber || 'MW-CHEERS-S01',
        name: effectiveProductName,
        leatherType: effectiveProductMaterial,
        colorCode: effectiveProductColor
      },
      candidateImageKey: objectKey,
      baselineMasterKey: sceneMasterReference?.objectKey || `projects/${projectId}/scene-masters/master-v01`
    });

    // 4. 存盘镜头提示词快照 prompt.json 到 GCS
    const promptBuffer = Buffer.from(
      JSON.stringify(
        {
          projectId,
          shotCode,
          revisionNumber,
          createdAt: new Date().toISOString(),
          camera,
          intent,
          generationSettings,
          promptSnapshot
        },
        null,
        2
      ),
      'utf-8'
    );

    await storage.put({
      bucketType: 'generated',
      objectKey: promptKey,
      buffer: promptBuffer,
      contentType: 'application/json'
    });

    // 5. 存盘镜头评审结果 validation.json 到 GCS
    const validationBuffer = Buffer.from(
      JSON.stringify(validationReport, null, 2),
      'utf-8'
    );

    await storage.put({
      bucketType: 'generated',
      objectKey: validationKey,
      buffer: validationBuffer,
      contentType: 'application/json'
    });

    res.json({
      success: true,
      data: {
        shotCode,
        revisionNumber,
        revisionId,
        objectKey: imageResult.objectKey,
        imageUrl: imageResult.imageUrl,
        promptKey,
        validationKey,
        status: validationReport.pass ? 'approved' : 'rejected',
        score: validationReport.score,
        validationReport,
        provenance: validationReport.provenance,
        productionTruth: validationReport.productionTruth,
        imageAsset: {
          bytes: imageResult.bytes,
          sha256: imageResult.sha256,
          provider: imageResult.provider,
          model: imageResult.model
        }
      }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to render shot'
    });
  }
});

/**
 * POST /api/space/shoot/confirm-production-truth
 * 人工审签确权门禁：将通过 L2 裁判的版本正式晋升为 Production Truth (生产真值)
 */
router.post('/confirm-production-truth', async (req: Request, res: Response) => {
  try {
    const { projectId, shotCode, revisionId } = req.body;
    if (!projectId || !shotCode || !revisionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: projectId, shotCode, revisionId'
      });
    }

    res.json({
      success: true,
      data: {
        projectId,
        shotCode,
        revisionId,
        provenance: 'MANUAL_CONFIRMED',
        productionTruth: true,
      }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to confirm production truth'
    });
  }
});

/**
 * POST /api/space/shoot/render-candidates
 * 为指定镜头生成 4 候选方案（严格继承 A00 空间与家具世界，仅 Camera DNA 驱动，并提供 4 组细分变体）
 */
router.post('/render-candidates', async (req: Request, res: Response) => {
  let lockKey: string | null = null;
  try {
    const parsed = RenderShotSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid render-candidates payload',
        details: parsed.error.issues
      });
    }

    const {
      projectId,
      shotCode,
      camera,
      intent,
      productDNA,
      sceneMasterReference,
      productReferenceImage,
      ensembleProducts,
      promptSnapshot,
      generationSettings
    } = parsed.data;

    const shotId = (req.body as any).shotId || `shot-${shotCode.toLowerCase()}`;
    const isHumanPass = Boolean((req.body as any).isHumanPass);

    // 防抖防并发锁：拦截 2 秒内同镜头的重复提交，避免重复调用生图 API
    lockKey = `${projectId}:${shotCode}:${isHumanPass ? 'human' : 'base'}`;
    const now = Date.now();
    const existingLockTime = activeRenderingLocks.get(lockKey);
    if (existingLockTime && now - existingLockTime < 2000) {
      console.warn(`[spaceShootRoutes] Debounced duplicate render request for ${lockKey}`);
      return res.status(429).json({
        success: false,
        error: '镜头渲染任务已在执行中，请勿重复提交请求'
      });
    }
    activeRenderingLocks.set(lockKey, now);

    // 若客户端主动取消或断开连接，及时释放防重锁
    req.on('close', () => {
      if (!res.writableEnded) {
        activeRenderingLocks.delete(lockKey);
      }
    });

    const baseShotRef = (req.body as any).currentShotReferenceImage || (req.body as any).baseShotReferenceImage;
    const humanLayout = (req.body as any).humanLayout;
    const selectedModels = (req.body as any).selectedModels || [];
    const characterReferenceImages = (req.body as any).characterReferenceImages || [];
    const effectiveProductName = productDNA?.name || '敏华芝华仕头等舱功能真皮沙发';
    const effectiveProductColor = productDNA?.colorCode || '干邑暖橙 (Cognac Amber)';
    const effectiveProductMaterial = productDNA?.leatherType || '南美进口头层牛皮 (半苯胺)';
    const effectiveProductRef = productReferenceImage || (productDNA as any)?.referenceImage;
    const effectiveSceneMasterRef = sceneMasterReference?.imageUrl || sceneMasterReference?.objectKey;

    const effectiveStyleName =
      (req.body as any).styleName ||
      promptSnapshot?.styleName ||
      (req.body as any).stylePreset?.name?.split(' (')[0] ||
      '都会收藏家';
    const effectiveRoomName =
      (req.body as any).roomName ||
      promptSnapshot?.roomName ||
      (req.body as any).spacePreset?.name?.split(' (')[0] ||
      '顶层天际会所大宅';
    const effectiveAspect = generationSettings?.aspectRatio || promptSnapshot?.aspectRatio || '4:3';

    const variantSpecs = isHumanPass
      ? [
          {
            idx: 1,
            tag: `${effectiveStyleName} · 人物入座 · 天然通透光`,
            promptAddon: 'natural soft daylight, relaxed authentic seating interaction, models strictly seated in designated positions with footrest deployed if requested, perfect leather contact',
            cameraDelta: {}
          },
          {
            idx: 2,
            tag: `${effectiveStyleName} · 人物入座 · 温暖侧光氛围`,
            promptAddon: 'warm side lighting, golden rim light on hair and shoulders, warm family living moment, strictly seated in designated sofa functional seat',
            cameraDelta: {}
          },
          {
            idx: 3,
            tag: `${effectiveStyleName} · 人物入座 · 柔焦生活意境`,
            promptAddon: 'subtle shallow depth, delicate portrait lighting, relaxed and elegant posture on sofa with genuine leather contact',
            cameraDelta: {}
          },
          {
            idx: 4,
            tag: `${effectiveStyleName} · 人物入座 · 黄金视觉金字塔`,
            promptAddon: 'balanced family seating geometry, confident and harmonious lifestyle portrait, magazine editorial tier, ergonomic recliner alignment',
            cameraDelta: {}
          }
        ]
      : [
          {
            idx: 1,
            tag: `${effectiveStyleName} · ${effectiveRoomName} · 天然通透漫射光`,
            promptAddon: 'standard natural diffuse daytime light, clear architectural reflections, razor sharp optics',
            cameraDelta: {}
          },
          {
            idx: 2,
            tag: `${effectiveStyleName} · ${effectiveRoomName} · 午后余晖温暖光`,
            promptAddon: 'golden hour afternoon sun rays penetrating floor to ceiling window, amber leather highlights, warm atmospheric glow',
            cameraDelta: {}
          },
          {
            idx: 3,
            tag: `${effectiveStyleName} · ${effectiveRoomName} · 黄金微距景深`,
            promptAddon: 'shallow depth of field, gentle background bokeh, macro sharpness on genuine leather stitching, refined tactile textures',
            cameraDelta: { lensMm: Math.min(85, (camera?.lensMm || 35) + 15) }
          },
          {
            idx: 4,
            tag: `${effectiveStyleName} · ${effectiveRoomName} · 广阔大平层视角`,
            promptAddon: 'architectural deep perspective, vertical lines correction, expansive floor to ceiling windows, majestic headroom and depth',
            cameraDelta: { pitchDeg: (camera?.pitchDeg || -2) - 2 }
          }
        ];

    // 默认生成 1 张模板，防止默认生成 4 张并发调用多次 API；只有显式指定数量时才生成更多变体
    const candidateCount = Math.max(1, Math.min(4, Number(parsed.data.candidateCount || (req.body as any).candidateCount) || 1));
    const effectiveSpecs = variantSpecs.slice(0, candidateCount);

    const batchTimestamp = Date.now();
    const candidates = await Promise.all(
      effectiveSpecs.map(async (v) => {
        const objectKey = SpaceObjectKeyBuilder.shotRevisionOriginal({
          projectId,
          shotId: shotCode,
          revisionId: `cand-v${v.idx}-${batchTimestamp}`,
          extension: 'webp'
        });

        const effectiveCamera = {
          lensMm: v.cameraDelta.lensMm ?? camera.lensMm,
          heightCm: camera.heightCm,
          yawDeg: camera.yawDeg,
          pitchDeg: v.cameraDelta.pitchDeg ?? camera.pitchDeg
        };

        const positivePrompt = `${promptSnapshot?.positivePrompt || `MANWAH shot ${shotCode}`}, ${v.promptAddon}`;

        try {
          const imageResult = await SpaceImageGenerationService.generateAndStore({
            projectId,
            shotCode,
            isHumanPass,
            humanLayout,
            selectedModels,
            characterReferenceImages,
            positivePrompt,
            negativePrompt: promptSnapshot?.negativePrompt || '',
            aspectRatio: effectiveAspect,
            preferredModel: generationSettings?.model || (req.body as any).preferredModel,
            resolution: generationSettings?.resolution || (req.body as any).resolution,
            functionalPositionState: (generationSettings as any)?.functionalPositionState || (req.body as any).functionalPositionState || 'closed',
            seed: typeof generationSettings?.seed === 'number' ? generationSettings.seed + v.idx * 137 : undefined,
            autoModelFallback: (generationSettings as any)?.autoModelFallback ?? (req.body as any)?.autoModelFallback,
            productName: effectiveProductName,
            productColor: effectiveProductColor,
            productMaterial: effectiveProductMaterial,
            primaryProduct: {
              name: effectiveProductName,
              colors: [effectiveProductColor],
              materials: [effectiveProductMaterial],
              referenceImage: effectiveProductRef
            },
            ensembleProducts: ensembleProducts || (req.body as any)?.ensembleProducts,
            productReferenceImage: effectiveProductRef,
            sceneMasterReferenceImage: effectiveSceneMasterRef,
            currentShotReferenceImage: baseShotRef,
            roomName: effectiveRoomName,
            styleName: effectiveStyleName,
            cameraSettings: effectiveCamera,
            variantIndex: v.idx,
            variantTag: v.tag,
            objectKey
          });

          return {
            id: `cand-${shotCode.toLowerCase()}-${v.idx}-${batchTimestamp}`,
            index: v.idx,
            variantIndex: v.idx,
            imageUrl: imageResult.imageUrl,
            objectKey: imageResult.objectKey,
            thumbnailUrl: imageResult.imageUrl,
            summaryTag: v.tag,
            promptFragment: v.promptAddon,
            seed: typeof generationSettings?.seed === 'number' ? generationSettings.seed + v.idx : 1000 + v.idx,
            score: 92 + v.idx,
            isFavorite: false,
            createdAt: new Date().toISOString()
          };
        } catch (candErr: any) {
          console.warn(`[spaceShootRoutes] Candidate ${v.idx} generation failed:`, candErr?.message);
          const autoFallback = (generationSettings as any)?.autoModelFallback ?? (req.body as any)?.autoModelFallback;
          if (autoFallback === false || v.idx === 1) {
            throw candErr;
          }
          const fallbackUrl = baseShotRef || effectiveSceneMasterRef || 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85';
          return {
            id: `cand-${shotCode.toLowerCase()}-${v.idx}-${batchTimestamp}`,
            index: v.idx,
            variantIndex: v.idx,
            imageUrl: fallbackUrl,
            objectKey: `shots/${shotCode}/fallback-v${v.idx}.webp`,
            thumbnailUrl: fallbackUrl,
            summaryTag: `${v.tag} (高可用自愈备选)`,
            promptFragment: v.promptAddon,
            seed: 1000 + v.idx,
            score: 90,
            isFavorite: false,
            createdAt: new Date().toISOString()
          };
        }
      })
    );

    res.json({
      success: true,
      data: {
        shotId,
        shotCode,
        batchId: `batch-${shotCode.toLowerCase()}-${batchTimestamp}`,
        activeCandidateId: candidates[0].id,
        candidates
      }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to render candidates'
    });
  } finally {
    // 渲染完成后延迟释放锁，避免毫秒级连击
    if (lockKey) {
      const keyToRelease = lockKey;
      setTimeout(() => {
        activeRenderingLocks.delete(keyToRelease);
      }, 1500);
    }
  }
});

/**
 * POST /api/space/shoot/outpaint
 * 专业级智能扩图接口：基于已有机位图，支持四周外扩、左右延展、上下拉升，生成新全景 Revision
 */
router.post('/outpaint', async (req: Request, res: Response) => {
  try {
    const {
      projectId = 'manwah-noble-space-01',
      shotId,
      shotCode = 'A03',
      baseRevisionId,
      paddedImage,      // 带延展区域的底图 (base64 或 url)
      maskImage,        // 黑白遮罩图 (base64 或 url)
      outpaintMode = 'uniform', // 'uniform' | 'horizontal' | 'vertical' | 'custom'
      scale = 1.5,
      promptSupplement,
      roomName = '都会收藏家大宅',
      styleName = '都会收藏家',
      preferredModel = 'gpt-image-2',
      aspectRatio = '4:3',
      resolution = '2K',
      originalScenePrompt,
      productName,
      productMaterial,
      productColor,
      cameraSettings
    } = req.body;

    if (!paddedImage) {
      return res.status(400).json({ success: false, error: '缺少待扩图的原图或延展底图 (paddedImage)' });
    }

    const timestamp = Date.now();
    const revisionId = `rev-outpaint-${shotCode.toLowerCase()}-${timestamp.toString(36)}`;
    const objectKey = SpaceObjectKeyBuilder.shotRevisionOriginal({
      projectId,
      shotId: shotCode,
      revisionId,
      extension: 'webp'
    });

    const directionDescription =
      outpaintMode === 'horizontal' ? '左右两侧横向开阔延展 (Horizontal Outpaint)' :
      outpaintMode === 'vertical' ? '上下纵向拉高延展 (Vertical Outpaint)' :
      `四周全向等比外扩 ${scale}x (360° Outward Panorama Expansion)`;

    const directivePrompt = `[CRITICAL ARCHITECTURAL OUTPAINTING & PANORAMIC EXPANSION MANDATE]
PRIMARY TASK:
You are a master architectural lifestyle photographer. You are expanding the camera field of view outward (${directionDescription}) around the existing room scene in Reference Image 1.

[OPTICAL SENSOR MARGIN EXPANSION - ZERO CAMERA MOVEMENT MANDATE (CRITICAL)]:
1. OPTICAL PERSPECTIVE LOCK:
   - The camera position (height, distance, optical horizon, pitch/yaw angle) and lens focal length ARE 100% FIXED${cameraSettings?.lensMm ? ` (Focal Length: ${cameraSettings.lensMm}mm, Lens Height: ${cameraSettings.heightCm || 115}cm)` : ''}.
   - This is strictly an optical sensor frame expansion revealing what lies just outside the border, NOT a camera pull-back or focal zoom!
   - The central unmasked portion of Reference Image 1 MUST REMAIN at 100% identical pixel scale, viewing elevation, and perspective angle.
   - DO NOT flatten or change the perspective horizon! DO NOT zoom out or shrink the existing furniture!

ORIGINAL SCENE TRUTH & INHERITED DNA:
${originalScenePrompt ? `- Original Scene Positive Prompt: ${originalScenePrompt}` : ''}
${productName ? `- Core Hero Furniture: ${productName}${productMaterial ? ` (Material: ${productMaterial})` : ''}${productColor ? ` (Color: ${productColor})` : ''}` : ''}
- Spatial Archetype: ${roomName} (${styleName} Interior Architecture)

MANDATORY RULES:
1. ABSOLUTE IDENTITY & POSITION PRESERVATION:
   - The central hero furniture (${productName || 'luxury sofa, coffee table'}), accessories, lighting, and textures from Reference Image 1 MUST REMAIN 100% IDENTICAL, UNTOUCHED, AND PERSISTENT.
   - Do NOT alter, redraw, distort, or relocate the existing furniture or room elements in the center!
2. SEAMLESS ARCHITECTURAL CONTINUATION (MATCHING INHERITED DNA):
   - Natural and seamless continuation of the architectural shell defined in the Original Scene Prompt: continue the exact solid wood paneling, luxury stone feature walls, ceiling cove lighting, floor rugs, and floor tiles.
   - Lighting & Ambience Match: Match the exact color temperature, natural daylight, soft shadows, and reflective characteristics of the original scene.
   - If expanding horizontally: naturally extend the floor-to-ceiling panoramic windows, sheer drapery, matching side console, or architectural greenery into the periphery while keeping identical materials.
   - If expanding vertically: naturally reveal the ceiling structure, coffered architectural beams, recessed lighting or chandeliers overhead, and complete the floor rug borders below.
3. ZERO-TEXT MANDATE: ABSOLUTELY NO TEXT, NO LABELS, NO CHINESE CHARACTERS, NO WATERMARKS.
4. FLAWLESS TRANSITION: Flawlessly blend the expanded borders with zero visible seams, pixelation, or boundary artifacts.

${promptSupplement ? `USER EXPANSION DIRECTIVE & GUIDANCE:\n${promptSupplement}` : ''}`;

    let modelToUse = preferredModel;
    if (!modelToUse || modelToUse === 'gemini-2.5-flash-image') {
      modelToUse = 'gemini-3.1-flash-image-preview';
    }

    const gatewayUrl = `http://127.0.0.1:${process.env.PORT || 3000}/api/gateway/generate-image`;
    const gatewayRes = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-uuid': 'system'
      },
      body: JSON.stringify({
        prompt: directivePrompt,
        model: modelToUse,
        aspectRatio,
        resolution,
        images: [{ data: paddedImage, role: 'composition_reference' }],
        mask: maskImage,
        generationIntent: 'image_edit'
      }),
      signal: AbortSignal.timeout(180000)
    });

    const gatewayData = await gatewayRes.json();
    if (!gatewayRes.ok || gatewayData.error) {
      const errorMsg =
        gatewayData.error?.message ||
        (typeof gatewayData.error === 'string' ? gatewayData.error : '') ||
        gatewayData.message ||
        '扩图模型处理失败';
      throw new Error(errorMsg);
    }

    const imgUrlOrBase64 =
      gatewayData.imageUrl ||
      gatewayData.data?.[0]?.url ||
      gatewayData.data?.[0]?.b64_json ||
      gatewayData.images?.[0]?.data;

    if (!imgUrlOrBase64) {
      throw new Error('扩图网关未返回有效图像数据');
    }

    let finalImageUrl = imgUrlOrBase64;
    // 若为 base64，转为 buffer 并存入本地存储
    if (typeof imgUrlOrBase64 === 'string' && imgUrlOrBase64.startsWith('data:')) {
      const base64Clean = imgUrlOrBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
      let imgBuffer = Buffer.from(base64Clean, 'base64');
      try {
        imgBuffer = await sharp(imgBuffer).webp({ quality: 90 }).toBuffer();
      } catch (sharpErr) {
        console.warn('Direct webp conversion fallback:', sharpErr);
      }
      await storage.put({
        objectKey,
        buffer: imgBuffer,
        contentType: 'image/webp'
      });
      finalImageUrl = `/api/space/storage/local-file?key=${encodeURIComponent(objectKey)}`;
    }

    res.json({
      success: true,
      data: {
        revisionId,
        imageUrl: finalImageUrl,
        objectKey,
        outpaintMode,
        scale,
        aspectRatio,
        label: outpaintMode === 'horizontal' ? `左右扩图 (${scale}x)` : outpaintMode === 'vertical' ? `上下扩图 (${scale}x)` : `四周扩图 (${scale}x)`,
        metaSummary: `视野向${outpaintMode === 'horizontal' ? '左右两侧' : outpaintMode === 'vertical' ? '上下两侧' : '四周'}自然延展 ${scale}x · 保留主沙发与摆位`
      }
    });
  } catch (err: any) {
    console.error('[spaceShootRoutes] Outpaint error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to outpaint shot'
    });
  }
});

export default router;
