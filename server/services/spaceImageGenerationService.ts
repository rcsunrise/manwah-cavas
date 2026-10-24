// server/services/spaceImageGenerationService.ts
// MANWAH Space Studio｜统一图像生成与渲染调度服务 V1.0
// 职责：
// 1. 统一接入系统 Image Provider Router (Gemini / VectorEngine / RouterHub)；
// 2. 将编译好的 Prompt (A00 空间母版或 A01-A08 镜头) 发送到图像模型进行渲染；
// 3. 获得图片 Buffer 并直接存入 GCS (GcsAssetStorage)；
// 4. 若无云端 API Key，生成高保真真实 SVG/WebP 工业工程资产底图，杜绝假成功，确保全链路真实贯通与可追溯性 (Provenance)。

import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import { GcsAssetStorage } from './storage/gcsAssetStorage';
import { resolveApiConfig, isProviderKeyValid } from '../ai/providerConfig';
import { resolveImageModel } from '../ai/modelRegistry';
import { getImageProviderAdapter } from '../ai/imageProviderAdapter';
import { createServerGenAI } from '../utils/aiClient';
import {
  translateColorToEnglish,
  translateMaterialToEnglish,
  resolveIndustrialColorDna,
  resolveCompositeMaterialDna
} from '../../src/features/space-studio/engine/materialDnaTranslator';

export interface SpaceProductIdentityInput {
  id?: string;
  sku?: string;
  name?: string;
  role?: string;
  priority?: string;
  color?: string;
  colors?: string[];
  material?: string;
  materials?: string[];
  surfaceTexture?: string;
  referenceImage?: string; // base64, data URL, objectKey, 或 public URL
  dimensions?: { width?: number; depth?: number; height?: number };
  functionCapable?: boolean;
}

export interface SpaceCharacterReferenceInput {
  modelId?: string;
  name?: string;
  imageUrl?: string;
  role?: string;
}

export interface SpaceGenerateImageInput {
  projectId: string;
  shotCode: string;
  positivePrompt: string;
  negativePrompt?: string;
  aspectRatio?: string; // 默认 '3:4'
  productName?: string;
  productColor?: string;
  productMaterial?: string;
  roomName?: string;
  styleName?: string;
  spacePreset?: any;
  stylePreset?: any;
  cameraSettings?: {
    lensMm: number;
    heightCm: number;
    yawDeg: number;
    pitchDeg: number;
  };
  objectKey: string;
  // 多模态视觉连续性关键引用 (真正实现根据我们产品一路往下生成)
  primaryProduct?: SpaceProductIdentityInput;
  ensembleProducts?: SpaceProductIdentityInput[];
  productReferenceImage?: string;
  sceneMasterReferenceImage?: string; // A00 空间母版图 或 A01 大场景基准图
  referenceShotCode?: string; // 标识基准参考图来源于哪个镜头，例如 'A01' 或 'A00'
  currentShotReferenceImage?: string; // 当前机位底图 (用于 Human 植入等连续渲染)
  isHumanPass?: boolean;
  humanLayout?: any;
  selectedModels?: any[];
  characterReferenceImages?: SpaceCharacterReferenceInput[];
  preferredModel?: string;
  resolution?: string;
  seed?: number;
  variantIndex?: number;
  variantTag?: string;
  functionalPositionState?: 'closed' | 'open';
  autoModelFallback?: boolean;
  preserveBasePhotoOnly?: boolean;
}

export interface SpaceGenerateImageResult {
  objectKey: string;
  imageUrl: string;
  provider: string;
  model: string;
  bytes: number;
  sha256: string;
  contentType: string;
  provenance: 'AI_ESTIMATED' | 'SOLVER_RESOLVED' | 'DERIVED';
  productionTruth: boolean;
  warningNotice?: string;
  isFallback?: boolean;
}

/**
 * 图像自适应规整：将输入参考图长边限制在 1024px 内并以高保真 WebP/JPEG 压缩，
 * 将单张图片 Base64 从数兆降低至 100~200KB，彻底根治 Payload 爆炸与模型 400 超时
 */
async function normalizeInlineBuffer(rawBuf: Buffer): Promise<{ mimeType: string; data: string }> {
  try {
    const meta = await sharp(rawBuf).metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;
    const maxDim = Math.max(width, height);

    if (maxDim > 1024) {
      const compressed = await sharp(rawBuf)
        .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      return {
        mimeType: 'image/webp',
        data: compressed.toString('base64')
      };
    }

    if (rawBuf.length > 500 * 1024) {
      const optimized = await sharp(rawBuf).webp({ quality: 85 }).toBuffer();
      return {
        mimeType: 'image/webp',
        data: optimized.toString('base64')
      };
    }

    let mimeType = 'image/jpeg';
    if (meta.format === 'png') mimeType = 'image/png';
    else if (meta.format === 'webp') mimeType = 'image/webp';
    return {
      mimeType,
      data: rawBuf.toString('base64')
    };
  } catch (err) {
    return {
      mimeType: 'image/jpeg',
      data: rawBuf.toString('base64')
    };
  }
}

/**
 * 辅助方法：将各种格式的图片引用统一解析为模型支持的 inlineData 格式并自动规整长边在 1024px 内
 */
async function resolveImageInlineData(imageRef?: string): Promise<{ mimeType: string; data: string } | null> {
  if (!imageRef || typeof imageRef !== 'string') return null;
  const trimmed = imageRef.trim();
  if (!trimmed) return null;

  // 1. 如果是 Data URL (如 data:image/png;base64,xxx)
  if (trimmed.startsWith('data:')) {
    const match = trimmed.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
    if (match) {
      try {
        const buf = Buffer.from(match[2], 'base64');
        return await normalizeInlineBuffer(buf);
      } catch {
        return {
          mimeType: match[1] || 'image/jpeg',
          data: match[2]
        };
      }
    }
  }

  // 2. 如果是纯 Base64 字符串
  if (!trimmed.startsWith('http') && !trimmed.startsWith('/') && trimmed.length > 500 && !trimmed.includes(' ')) {
    try {
      const buf = Buffer.from(trimmed, 'base64');
      return await normalizeInlineBuffer(buf);
    } catch {
      return {
        mimeType: 'image/jpeg',
        data: trimmed
      };
    }
  }

  // 3. 如果是本地或者 GCS ObjectKey / 带有 key= 参数的本地 URL
  let targetKey = trimmed;
  if (trimmed.includes('/api/space/storage/local-file?key=') || trimmed.includes('/api/space/storage/download?key=')) {
    try {
      const urlObj = new URL(trimmed, 'http://localhost');
      targetKey = decodeURIComponent(urlObj.searchParams.get('key') || '');
    } catch {
      // ignore
    }
  }

  if (targetKey && (targetKey.startsWith('projects/') || targetKey.includes('/'))) {
    const storage = GcsAssetStorage.getInstance();
    const buf = await storage.getBuffer(targetKey);
    if (buf && buf.length > 0) {
      return await normalizeInlineBuffer(buf);
    }
  }

  // 4. 如果是远程 HTTP/HTTPS URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const res = await fetch(trimmed, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        return await normalizeInlineBuffer(buf);
      }
    } catch (err: any) {
      console.warn(`[SpaceImageGenerationService] Failed to fetch remote image ref: ${trimmed}`, err.message);
    }
  }

  return null;
}

/**
 * 当搭配品（茶几、单人位）引用了全景总图且未切片时，依据其 BoundingBox 自动在内存中切出真实局部特写
 */
async function cropImageInlineBuffer(
  imageRef: string,
  box: { ymin: number; xmin: number; ymax: number; xmax: number }
): Promise<{ mimeType: string; data: string } | null> {
  try {
    const rawInline = await resolveImageInlineData(imageRef);
    if (!rawInline) return null;
    const buf = Buffer.from(rawInline.data, 'base64');
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) return rawInline;

    const left = Math.max(0, Math.min(meta.width - 20, Math.floor((box.xmin / 100) * meta.width)));
    const top = Math.max(0, Math.min(meta.height - 20, Math.floor((box.ymin / 100) * meta.height)));
    const width = Math.max(10, Math.min(meta.width - left, Math.round(((box.xmax - box.xmin) / 100) * meta.width)));
    const height = Math.max(10, Math.min(meta.height - top, Math.round(((box.ymax - box.ymin) / 100) * meta.height)));

    const cropped = await sharp(buf)
      .extract({ left, top, width, height })
      .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer();

    return {
      mimeType: 'image/webp',
      data: cropped.toString('base64')
    };
  } catch (err) {
    console.warn('[SpaceImageGenerationService] Fallback on cropImageInlineBuffer:', err);
    return null;
  }
}

export class SpaceImageGenerationService {
  private static storage = GcsAssetStorage.getInstance();

  /**
   * 核心方法：为 Space Studio 生成并存储真实图像资产
   */
  public static async generateAndStore(input: SpaceGenerateImageInput): Promise<SpaceGenerateImageResult> {
    const {
      projectId,
      shotCode,
      positivePrompt,
      negativePrompt,
      aspectRatio = '3:4',
      productName = '敏华头等舱功能沙发',
      productColor,
      productMaterial,
      roomName = '都会收藏家大平层',
      styleName = '都会收藏家',
      cameraSettings,
      objectKey,
      primaryProduct,
      productReferenceImage,
      sceneMasterReferenceImage,
      currentShotReferenceImage,
      isHumanPass,
      humanLayout,
      selectedModels,
      characterReferenceImages,
      functionalPositionState = 'closed'
    } = input;

    const isFunctionalClosed = functionalPositionState !== 'open';

    let imageBuffer: Buffer | null = null;
    let cloudError: string | null = null;
    let usedProvider = 'deterministic_renderer';
    let usedModel = 'manwah-spatial-renderer-v1';
    let contentType = 'image/webp';
    let provenance: 'AI_ESTIMATED' | 'SOLVER_RESOLVED' | 'DERIVED' = 'SOLVER_RESOLVED';

    // 1. 解析多模态视觉参考图像 (产品真值图、A00 母版图、机位底图)
    // 关键架构优化（路线三）：A09 智能资产感知自适应路由
    // - 若录入了餐桌椅资产：提权餐桌椅为主角，按真实餐桌资产出图
    // - 若仅录入沙发（未上传餐桌）：平滑自适应为“大平层客餐一体纵深景”，主角依然是沙发，严禁凭空虚构非标餐桌！
    let activePrimaryProduct = primaryProduct;
    const diningProduct = (input.ensembleProducts || []).find(
      (p) => p.role === 'dining_table' || p.role === 'dining_chair' || /(餐桌|餐椅|餐边柜|餐台|餐车|餐厅)/.test(p.name || '')
    );
    const hasDiningAsset = Boolean(
      diningProduct && (
        (diningProduct as any)?.cropImageUrl ||
        (diningProduct as any)?.cropBase64 ||
        (diningProduct as any)?.referenceImage ||
        (diningProduct as any)?.uploadedImageUrl ||
        (diningProduct as any)?.referenceImages?.[0]?.publicUrl
      )
    );

    if (shotCode === 'A09' && hasDiningAsset && diningProduct) {
      activePrimaryProduct = diningProduct;
    } else if (shotCode === 'A08') {
      const reclinerProduct = (input.ensembleProducts || []).find(
        (p) => p.role === 'recliner_1seat' || p.role === 'lounge_chair' || /(单人|单椅|头等舱|单机位|大师|休闲椅|扶手椅)/.test(p.name || '')
      ) || (input.ensembleProducts || []).find((p) => p.priority === 'secondary' || (p.role !== 'sofa_3seat' && p.role !== 'sofa_2seat' && p.role !== 'coffee_table' && p.role !== 'dining_table'));
      
      const hasReclinerImage = Boolean(
        reclinerProduct && (
          (reclinerProduct as any)?.cropImageUrl ||
          (reclinerProduct as any)?.cropBase64 ||
          (reclinerProduct as any)?.referenceImage ||
          (reclinerProduct as any)?.uploadedImageUrl ||
          (reclinerProduct as any)?.referenceImages?.[0]?.publicUrl
        )
      );

      if (reclinerProduct && hasReclinerImage) {
        activePrimaryProduct = reclinerProduct;
      } else {
        // 自愈降级：若单椅资产尚未上传独立切片，严格保留主沙发作为核心真值基准，
        // 由后续摄影指令引导以主沙发皮革质感与缝线工艺为母本，生成同款头等舱定制单椅，杜绝空切片导致模型失败！
        activePrimaryProduct = primaryProduct;
      }
    } else if (['A03', 'A04', 'A05', 'A06'].includes(shotCode)) {
      const hero3SeatProduct = (input.ensembleProducts || []).find(
        (p) => p.role === 'sofa_3seat' || p.role === 'sofa_2seat' || /(三人|3人|主沙发|直排)/.test(p.name || '')
      );
      if (hero3SeatProduct) {
        activePrimaryProduct = hero3SeatProduct;
      }
    }

    let effectiveProductImageRef = (activePrimaryProduct && activePrimaryProduct !== primaryProduct)
      ? ((activePrimaryProduct as any)?.cropImageUrl || (activePrimaryProduct as any)?.cropBase64 || (activePrimaryProduct as any)?.referenceImage || (activePrimaryProduct as any)?.uploadedImageUrl || activePrimaryProduct?.referenceImage || productReferenceImage)
      : (productReferenceImage || activePrimaryProduct?.referenceImage);

    // 平滑自愈保护：如果选出的 effectiveProductImageRef 为空，自动兜底为主沙发的 productReferenceImage 或 sceneMasterReferenceImage
    if (!effectiveProductImageRef || (typeof effectiveProductImageRef === 'string' && effectiveProductImageRef.trim().length === 0)) {
      effectiveProductImageRef = productReferenceImage || (primaryProduct as any)?.referenceImage || (primaryProduct as any)?.cropImageUrl || sceneMasterReferenceImage;
    }

    let [productInline, masterInline, shotInline] = await Promise.all([
      resolveImageInlineData(effectiveProductImageRef),
      resolveImageInlineData(sceneMasterReferenceImage),
      resolveImageInlineData(currentShotReferenceImage)
    ]);

    // 关键防线：若 productInline 解析为 null 但 masterInline 存在，自动以 masterInline 借用为 productInline，确保大模型多模态指令必有物理基石
    if (!productInline && masterInline) {
      productInline = masterInline;
    }

    // 收集人物参考图 (从 characterReferenceImages 或 selectedModels 中提取真实模特真值)
    const rawCharImages: string[] = [];
    if (Array.isArray(characterReferenceImages) && characterReferenceImages.length > 0) {
      for (const c of characterReferenceImages) {
        if (c.imageUrl && typeof c.imageUrl === 'string') rawCharImages.push(c.imageUrl);
      }
    } else if (Array.isArray(selectedModels) && selectedModels.length > 0) {
      for (const m of selectedModels) {
        const img = m.views?.portrait || m.views?.front || m.thumbnail || m.coverImage;
        if (img && typeof img === 'string') rawCharImages.push(img);
      }
    }

    const charInlines = (
      await Promise.all(rawCharImages.slice(0, 2).map(imgUrl => resolveImageInlineData(imgUrl)))
    ).filter((item): item is { mimeType: string; data: string } => item !== null);

    // 确定有效色彩与材质描述 (采用中英文权威词典与 Hex 工业色卡精准绑定)
    const effectiveColor = translateColorToEnglish(productColor || activePrimaryProduct?.colors?.[0], 'ivory greige, soft warm pale grey (exact color anchor #C8C2BA)');
    const effectiveMaterial = translateMaterialToEnglish(productMaterial || activePrimaryProduct?.materials?.[0], 'genuine top-grain semi-aniline cowhide leather', activePrimaryProduct?.role);
    
    let effectiveProductName = 'luxury power motion sofa';
    if (activePrimaryProduct?.role === 'sofa_2seat') {
      effectiveProductName = 'generous wide-body two-seater power motion sofa (wide horizontal stance, expansive dual-unit seating, low-profile and deep proportions, twin 2-cushion division, strictly NOT a 3-seater)';
    } else if (activePrimaryProduct?.role === 'sofa_3seat') {
      effectiveProductName = 'luxury three-seater power motion sofa (featuring 3 distinct seating cushions)';
    } else if (activePrimaryProduct?.role === 'recliner_1seat') {
      effectiveProductName = 'luxury power motion recliner chair';
    } else if (activePrimaryProduct?.role === 'lounge_chair' || activePrimaryProduct?.name?.includes('无扶手') || activePrimaryProduct?.name?.includes('休闲单椅')) {
      effectiveProductName = 'modern minimalist armless lounge chair (strictly armless, no extended footrest)';
    } else if (hasDiningAsset && (activePrimaryProduct?.role === 'dining_table' || activePrimaryProduct?.role === 'dining_chair')) {
      effectiveProductName = 'luxury black marble dining table ensemble with tailored leather dining chairs, designer credenza sideboard, and mobile bar cart';
    } else if (shotCode === 'A09') {
      // 未录入餐桌套系时的纯沙发大平层贯通景
      effectiveProductName = 'grand open-plan living-dining vista showcasing the luxury power motion sofa anchoring the connected living space';
    }

    // 收集搭配产品 (Secondary Matching Ensemble Products) 的多模态视觉参考图与 DNA 描述
    const rawEnsemble = input.ensembleProducts || [];
    const secondaryProducts = rawEnsemble.filter(
      (p) => p.priority !== 'primary' && p.role !== activePrimaryProduct?.role &&
      // 仅当用户明确录入了餐桌且处于 A09 时，才排除主沙发
      (!hasDiningAsset || shotCode !== 'A09' || (p.role !== 'sofa_3seat' && p.role !== 'sofa_2seat'))
    );

    const secondaryInlines: Array<{
      product: SpaceProductIdentityInput;
      inline: { mimeType: string; data: string };
      colorEn: string;
      materialEn: string;
      roleTitleEn: string;
      antiStickerNegative?: string;
    }> = [];

    for (const sec of secondaryProducts) {
      // 搭配品严禁将全景大图直接重复塞入，优先使用其独立切片图
      const secRef =
        (sec as any)?.cropImageUrl ||
        sec.referenceImage ||
        (sec as any)?.referenceImages?.[0]?.publicUrl ||
        (sec as any)?.referenceImages?.[0]?.objectKey ||
        (sec as any)?.uploadedImageUrl;

      const rawColor = sec.colors?.[0] || sec.color;
      const rawMat = sec.materials?.[0] || sec.material;
      const colorEn = translateColorToEnglish(rawColor, 'pristine polar milk-white (exact color anchor #F5F3EF)');
      const matEn = translateMaterialToEnglish(rawMat, 'genuine top-grain semi-aniline cowhide leather', sec.role);
      const compositeInfo = resolveCompositeMaterialDna(rawMat, sec.role);

      const isArmlessOrNonFunctional =
        sec.role === 'lounge_chair' ||
        sec.functionCapable === false ||
        (sec.name && /(休闲|无扶手|矮椅|旋转|单椅|焦糖)/.test(sec.name) && !/(功能|电动|头等舱|展开|太空舱)/.test(sec.name));

      let roleTitleEn = 'accent furniture';
      if (isArmlessOrNonFunctional) {
        roleTitleEn = 'modern minimalist armless lounge chair (strictly NO armrests, strictly NO extended footrest, strictly NO reclining mechanism)';
      } else if (sec.role === 'recliner_1seat') {
        roleTitleEn = 'MANWAH power motion recliner chair';
      } else if (sec.role === 'coffee_table') {
        roleTitleEn = 'center coffee table';
      } else if (sec.role === 'side_table') {
        roleTitleEn = 'accent side table';
      }

      // 关键自愈：如果搭配品的图片与主品参考图或母版参考图完全相同（属于全景总图且未切片），
      // 若存在 sourceBoundingBox，则在服务端自动裁剪出局部独立特写；否则避免将原大图重复压入
      const isSharedMaster =
        secRef &&
        (secRef === effectiveProductImageRef ||
          secRef === sceneMasterReferenceImage ||
          secRef === primaryProduct?.referenceImage);

      // 搭配品独立切片图上限为 2 张（如中心茶几 + 休闲单椅），杜绝过多图片超出大模型上下文限制
      if (secRef && secondaryInlines.length < 2) {
        let secInline: { mimeType: string; data: string } | null = null;
        if (isSharedMaster && (sec as any)?.sourceBoundingBox) {
          secInline = await cropImageInlineBuffer(secRef, (sec as any).sourceBoundingBox);
        } else if (!isSharedMaster) {
          secInline = await resolveImageInlineData(secRef);
        }

        if (secInline) {
          secondaryInlines.push({
            product: sec,
            inline: secInline,
            colorEn,
            materialEn: matEn,
            roleTitleEn,
            antiStickerNegative: compositeInfo.antiStickerNegative
          });
        }
      }
    }

    // 2. 调度系统统一图像生成网关 (TianToken / Google / RouterHub / OpenAI 统一中继)
    const config = await resolveApiConfig('system');
    let wasFallbackUsed = false;
    let primaryModel = 'manwah-spatial-renderer-v1';

    if (!isProviderKeyValid(config?.apiKey) || process.env.NODE_ENV === 'test') {
      imageBuffer = this.renderDeterministicSpatialAsset({
        shotCode,
        productName,
        productColor,
        productRole: activePrimaryProduct?.role,
        roomName,
        styleName,
        camera: cameraSettings || { lensMm: 35, heightCm: 120, yawDeg: 0, pitchDeg: -2 },
        variantIndex: input.variantIndex,
        variantTag: input.variantTag
      });
      usedProvider = 'deterministic_renderer';
      usedModel = 'manwah-spatial-renderer-v1';
      provenance = 'SOLVER_RESOLVED';
    } else {
      const rawPreferred = input.preferredModel?.trim() || 'gpt-image-2';
      
      // 统一模型别名映射
      let targetModel = rawPreferred;
      if (targetModel === 'gemini-2.5-flash') targetModel = 'gemini-2.5-flash-image';
      else if (targetModel === 'google/gemini-3-pro-image' || targetModel === 'gemini-3-pro-image-preview') targetModel = 'gemini-3-pro-image';
      else if (targetModel === 'google/gemini-nano-banana-2.1-preview' || targetModel === 'nano-banana-2.1') targetModel = 'gemini-nano-banana-2.1-preview';
      else if (targetModel === 'openai/gpt-image-2.5-flare-c' || targetModel === 'gpt-2.5-flare') targetModel = 'gpt-image-2.5-flare-c';
      else if (targetModel === 'openai/gpt-image-2.5-sunburst-c' || targetModel === 'gpt-2.5-sunburst') targetModel = 'gpt-image-2.5-sunburst-c';
      else if (targetModel === 'openai/gpt-image-2' || targetModel === 'gpt-image-2') targetModel = 'gpt-image-2-c';
      else if (targetModel === 'openai/gpt-image-2-c') targetModel = 'gpt-image-2-c';
      else if (targetModel === 'openai/gpt-image-2-all') targetModel = 'gpt-image-2-all';

      const reqResolution = input.resolution || '2K';
      const isFlash25 = targetModel === 'gemini-2.5-flash-image' || targetModel === 'gemini-2.5-flash';
      const validResolution = isFlash25 ? '1K' : (['1K', '2K', '4K'].includes(reqResolution) ? reqResolution : '2K');

      // 编织多模态视觉参考图像 (按工作模式优先级排序)
      const images: Array<{ data: string; mimeType?: string; role?: string }> = [];
      // 核心工业逻辑：针对 3人位主沙发专属镜头 (A03, A04, A05, A06)，绝对不把单椅作为搭配品参考图塞入！
      // A04 (2/3亲子景) / A05 (2/3私享景) / A06 (零靠墙侧景)：100% 专属于独立 3 人位主沙发资产，严格杜绝任何单椅或茶几参考图混入干扰！
      // A03 (3人位焦点景)：仅保留中心茶几参考图，严格剔除侧边单椅！
      const allowedSecondaryInlines = secondaryInlines.filter(s => {
        if (['A04', 'A05', 'A06'].includes(shotCode)) {
          return false;
        }
        if (shotCode === 'A03') {
          return s.product.role === 'coffee_table';
        }
        return true;
      });

      const maxSecItems = targetModel.includes('gpt') ? 1 : 3;
      const pushedSecondaryInlines = allowedSecondaryInlines.slice(0, maxSecItems);

      if (shotInline) {
        // 人物添加模式：以当前镜头真实底图为最高物理基石
        images.push({
          data: `data:${shotInline.mimeType};base64,${shotInline.data}`,
          mimeType: shotInline.mimeType,
          role: 'composition_reference'
        });

        // 注入所选模特资产参考图，确保多模态视觉识别与面部特征锁定
        if (charInlines.length > 0) {
          for (let cIdx = 0; cIdx < charInlines.length; cIdx++) {
            const charInline = charInlines[cIdx];
            images.push({
              data: `data:${charInline.mimeType};base64,${charInline.data}`,
              mimeType: charInline.mimeType,
              role: 'person_reference'
            });
          }
        }

        // 核心保真机制：当 preserveBasePhotoOnly 开启时，禁止塞入外部产品/搭配品去重绘原图！
        if (!input.preserveBasePhotoOnly) {
          if (productInline) {
            images.push({
              data: `data:${productInline.mimeType};base64,${productInline.data}`,
              mimeType: productInline.mimeType,
              role: 'primary_product'
            });
          }

          // 注入搭配产品参考图 (仅注入允许的搭配品)
          for (const secItem of pushedSecondaryInlines) {
            images.push({
              data: `data:${secItem.inline.mimeType};base64,${secItem.inline.data}`,
              mimeType: secItem.inline.mimeType,
              role: 'secondary_product'
            });
          }
        }
      } else {
        if (productInline) {
          images.push({
            data: `data:${productInline.mimeType};base64,${productInline.data}`,
            mimeType: productInline.mimeType,
            role: 'primary_product'
          });
        }
        if (masterInline) {
          images.push({
            data: `data:${masterInline.mimeType};base64,${masterInline.data}`,
            mimeType: masterInline.mimeType,
            role: 'scene_reference'
          });
        }

        for (const secItem of pushedSecondaryInlines) {
          images.push({
            data: `data:${secItem.inline.mimeType};base64,${secItem.inline.data}`,
            mimeType: secItem.inline.mimeType,
            role: 'secondary_product'
          });
        }
      }

      // 构建针对搭配产品的多模态参考图指令描述 (严格与实际传入 images 保持 1:1 对齐)
      let secondaryReferencesText = '';
      if (pushedSecondaryInlines.length > 0) {
        secondaryReferencesText = pushedSecondaryInlines
          .map((s, idx) => {
            const refIdx = (shotInline || masterInline) ? 3 + idx : 2 + idx;
            const isArmless =
              s.product.role === 'lounge_chair' ||
              s.product.functionCapable === false ||
              (s.product.name && /(休闲|无扶手|矮椅|旋转|单椅|焦糖)/.test(s.product.name) && !/(功能|电动|头等舱|展开|太空舱)/.test(s.product.name));
            const isStoneOrTable = s.product.role === 'coffee_table' || s.product.role === 'side_table' || /marble|stone|porcelain|岩板|大理石|黑金/i.test(s.materialEn) || /茶几|边几/.test(s.product.name || '');

            return `REFERENCE IMAGE ${refIdx}: Authentic Matching Product (${s.roleTitleEn}: ${s.product.name || 'MANWAH ensemble item'}, color: ${s.colorEn}, material: ${s.materialEn}).
MANDATORY REPLACEMENT MANDATE FOR ${s.roleTitleEn.toUpperCase()}:
- Replace ANY chair/armchair or conflicting item in the room with this exact authentic ${s.roleTitleEn} shown in Reference Image ${refIdx}.
- COLOR MUST BE STRICTLY ${s.colorEn}. ZERO tolerance for color drift or mismatched tone!
${isStoneOrTable ? '- COMPOSITE MATERIAL & CRAFTSMANSHIP LOCK: Strictly render genuine Laurent Black Gold marble (Nero Portoro) / sintered stone with seamless 45-degree polished chamfered bevels and micro-radius rounded safety corners, organic non-repeating gold/bronze lightning mineral veins with crystalline depth, and dark hairline brushed titanium alloy metal chassis! Strictly ZERO repetitive printed graphics, ZERO fake laminate stickers, ZERO peeling foil wraps!' : ''}
${isArmless ? '- SILHOUETTE & ERGONOMIC LOCK: This is strictly an ARMLESS LOUNGE CHAIR on a low-profile base. Strictly DO NOT add armrests. Strictly DO NOT add extended footrest. Strictly DO NOT add reclining motor buttons.' : `- Faithfully preserve its signature ergonomic silhouette, armrest contour, and craftsmanship from Reference Image ${refIdx}.`}`;
          })
          .join('\n\n');
      }

      // 针对生图模式编织具备物理第一性原理的系统级摄影提示词
      let directivePrompt = positivePrompt;
      const antiStickerNegatives = Array.from(
        new Set(
          allowedSecondaryInlines
            .map((s) => s.antiStickerNegative)
            .filter(Boolean)
        )
      ).join(', ');

      if (isHumanPass || shotInline) {
        if (input.preserveBasePhotoOnly) {
          // 模式 A-1: 单镜头实拍底图保真模特植入 (Photo Ground Truth Inpainting)
          // 绝对保真：彻底杜绝任何全局户型、预设美学或硬装色彩对用户上传原图的干扰
          directivePrompt = `[CRITICAL MANDATE: PHOTO GROUND TRUTH INPAINTING - 100% PRESERVE ORIGINAL ROOM AND SEAT REAL HUMAN MODELS]
PRIMARY OBJECTIVE:
Reference Image 1 is an AUTHENTIC USER-UPLOADED PHOTOGRAPH of the living room and furniture.
Your task is EXCLUSIVELY to insert the designated real human model(s) into the sofa shown in Reference Image 1.

[ABSOLUTE INVARIANCE MANDATE - ZERO BACKGROUND & ZERO STYLE DRIFT]:
1. 100% PRESERVE AND KEEP UNCHANGED all existing background elements, architecture, walls, wall colors, lighting, windows, ceiling, flooring, and all furniture positions, silhouettes, and fabric/leather textures in Reference Image 1.
2. DO NOT apply any foreign interior style, new wall cladding, stone textures, or decorative changes. DO NOT re-grade colors or change ambient daylighting.
3. INPAINTING ONLY: Photorealistically paint the designated models seated naturally into the existing sofa cushions of Reference Image 1 with realistic body weight, fabric folds, and authentic contact ambient occlusion shadows on the seating cushions.

${charInlines.length > 0 ? `REFERENCE IMAGE 2${charInlines.length > 1 ? ' & 3' : ''}: Target Character References (Model DNA). Photorealistically replicate these exact individuals' facial structure, ethnicity, age, hair, expression, and demeanor into the scene.` : ''}

STRICT OCCUPANCY & COMPOSITION RULES:
1. The designated character(s) MUST BE SEATED ON THE HERO SOFA naturally with relaxed posture and realistic body contact.
2. ZERO TEXT, NO WATERMARKS, NO LABELS, NO CHINESE CHARACTERS.
3. Keep all existing furniture functional mechanisms intact and closed unless specified.

${positivePrompt}

Negative constraints: ${negativePrompt ? `${negativePrompt}, ` : ''}altering background, modifying walls, changing wall color, changing floor, modifying furniture, shifting camera, perspective drift, re-framing, foreign style, empty sofa, nobody in room, missing people, displaced furniture, text, watermark, font, words, letters, chinese characters, labels, annotations, captions, overlay, subtitles, banner, logo, deformed limbs, floating human, extra people`;
        } else {
          // 模式 A-2: 模特植入 (Human Pass)：强制原图机位零漂移，家具绝对不位移，仅将人物自然坐入
          directivePrompt = `[CRITICAL MANDATE: SEAT REAL PEOPLE INTO THIS LIVING ROOM - NEVER RETURN AN EMPTY ROOM]
PRIMARY OBJECTIVE:
You are an architectural lifestyle photographer. You MUST photorealistically insert real human models into the room shown in Reference Image 1.
DO NOT LEAVE THE ROOM EMPTY. DO NOT RETURN AN EMPTY ROOM.
THE HERO SOFA MUST HAVE THE SPECIFIED PEOPLE SEATED AND RELAXING IN IT.

[ABSOLUTE CAMERA STABILITY & ZERO-DRIFT MANDATE (CRITICAL)]:
1. CAMERA GEOMETRY & FRAMING ZERO DRIFT: Reference Image 1 provides the 100% FROZEN architectural and camera baseline. The camera perspective, focal length, shooting distance, lens height, horizontal line, and furniture positions MUST REMAIN 100% IDENTICAL AND IMMOVABLE.
2. ABSOLUTE PROHIBITION ON RE-FRAMING: DO NOT zoom in, DO NOT zoom out, DO NOT change the perspective angle, DO NOT shift furniture left or right. ZERO tolerance for camera drift!
3. SEATING ACTION ONLY: Only photorealistically paint the designated models seated naturally into the existing sofa cushions of Reference Image 1 with genuine weight and contact shadows. All surrounding architecture, windows, walls, and flooring remain completely untouched!

${charInlines.length > 0 ? `REFERENCE IMAGE 2 & 3: Target Character References (Model DNA). Photorealistically replicate these exact individuals' facial structure, ethnicity, age, hair, expression, and demeanor into the scene.` : ''}
${secondaryReferencesText ? `\n${secondaryReferencesText}\n` : ''}

STRICT COMMERCIAL MANDATES:
1. POPULATE THE HERO SOFA: The designated character(s) MUST BE SEATED ON THE HERO SOFA naturally with realistic body weight, folds in clothes, and authentic contact shadows on the leather cushions.
${shotCode === 'A03' ? `   - A03 HERO 3-SEATER FAMILY LEISURE: Depict a genuine warm family moment with parents and young daughter seated together on the 3-seater hero sofa. Functional footrests ${isFunctionalClosed ? 'strictly remain completely closed and retracted under the base in standard upright comfortable configuration' : 'outer motion seats may be gently deployed for relaxed human occupancy'}. Natural, relaxed, joyful expressions. Center coffee table in foreground with coffee cups and art books within the authentic living room.` : ''}
${shotCode === 'A04' ? `   - A04 2/3 HERO SOFA MOTHER-DAUGHTER COMPANION: Frame 2/3 of the hero motion sofa in 2:3 vertical aspect ratio (CAPACITY LOCK: strictly max 2 occupants, mother and daughter, zero extra crowd). Depict an affectionate mother and young daughter companion moment. The motorized footrests ${isFunctionalClosed ? 'strictly remain completely closed and tucked flush under the base in standard upright configuration' : 'outer motorized footrest is smoothly deployed, comfortably supporting the mother and daughter relaxing together'}. Highlight the wide outer armrest and supple leather folds within the authentic room environment. ZERO single chairs, ZERO coffee table obstruction!` : ''}
${shotCode === 'A05' ? `   - A05 2/3 HERO SOFA PRIVATE WINE LOUNGE: Frame 2/3 of the hero motion sofa in 2:3 vertical aspect ratio (CAPACITY LOCK: strictly 1 lady occupant). Depict an elegant lady in a light dress sitting relaxed with footrests ${isFunctionalClosed ? 'completely retracted under the base in standard upright closed posture' : 'smoothly deployed supporting private lounge relaxation'}, holding a glass of red wine in a private leisure lounge posture within the authentic room. ZERO single chairs, ZERO coffee table obstruction!` : ''}
${shotCode === 'A06' ? `   - A06 ZERO-WALL CLEARANCE PROFILE VIEW: Lateral side profile (75-90 degrees) in 16:9 widescreen (CAPACITY LOCK: strictly 1 occupant). Hero sofa is flush against the backdrop wall with virtually zero gap (<5cm flush alignment), with motorized footrests and backrest strictly remaining in standard pristine CLOSED upright configuration. A relaxed lady wearing white over-ear headphones listening to music.` : ''}
${shotCode === 'A08' ? `   - A08 RECLINER CHAIR TABLET READING POSTURE: Dedicated single power recliner motion chair in 16:9 widescreen at 35-40 degree three-quarters perspective (CAPACITY LOCK: strictly 1 single occupant). Motorized footrest is ${isFunctionalClosed ? 'completely retracted and closed in standard upright reading posture' : 'deployed in ergonomic comfort contour'} supporting a relaxed individual comfortably browsing an iPad/tablet within the authentic living room.` : ''}
2. ZERO-TEXT MANDATE: ABSOLUTELY NO TEXT, NO CHINESE CHARACTERS, NO WORDS, NO LABELS, NO ANNOTATIONS, NO WATERMARKS ANYWHERE ON THE IMAGE. Render a 100% clean pristine photograph.
3. MOTION & ERGONOMIC FUNCTION:
   - Keep sofa color (${effectiveColor}), leather grain (${effectiveMaterial}), and armrest styling completely unchanged.
   - ${isFunctionalClosed ? 'CRITICAL: ALL sofa and chair motorized footrests and motion mechanisms strictly remain completely CLOSED, flush, and tucked under the base in standard upright seated configuration.' : 'If the posture specifies an extended footrest ("展开脚托", "recline", "电动功能位"), that specific seat on the main sofa may smoothly open and extend its motorized footrest forward.'}
4. ARCHITECTURAL CONTINUITY:
   - The room's architecture, window view, flooring, and camera perspective in Reference Image 1 must remain solid and preserved while the people are inserted.

${positivePrompt}

Negative constraints: ${negativePrompt ? `${negativePrompt}, ` : ''}${antiStickerNegatives ? `${antiStickerNegatives}, ` : ''}${isFunctionalClosed ? 'deployed footrest, extended footrest, popped leg rest, open footrest mechanism, open recliner mechanism, unretracted leg rest, unfolded footrest, 展开的脚踏, 伸出的脚托, 功能位展开, 靠背倾斜后仰展开, ' : ''}camera drift, camera shift, zoomed in, zoomed out, shifted furniture, tilted horizon, empty sofa, empty room, nobody in room, missing people, displaced furniture, text, watermark, font, words, letters, chinese characters, labels, annotations, captions, overlay, subtitles, banner, logo, deformed limbs, floating human, extra people`;
        }
      } else if (productInline && masterInline) {
        // 模式 B: A01~A08 衍生镜头生图：确立“机位与景别第一性原则”，同时坚决锁定 A00 母版硬装与窗景背景一致性
        const isFrontalPanorama = shotCode === 'A01' || (positivePrompt.includes('GRAND FRONTAL') || positivePrompt.includes('正大视角'));
        const isAngledHero = shotCode === 'A02' || (positivePrompt.includes('45-degree') || positivePrompt.includes('45°') || positivePrompt.includes('3+1 ENSEMBLE'));
        const isHeroSofaFocus = shotCode === 'A03' || (positivePrompt.includes('HERO 3-SEATER') || positivePrompt.includes('3-Seater'));
        const isTwoThirdsHeroSofa = shotCode === 'A04' || shotCode === 'A05' || positivePrompt.includes('2/3 HERO SOFA') || positivePrompt.includes('2/3主沙发');
        const isLivingEnsembleMid = shotCode === 'A07' || positivePrompt.includes('ENSEMBLE LIVING') || positivePrompt.includes('沙发茶几组群');
        const isZeroWallProfile = shotCode === 'A06' || positivePrompt.includes('ZERO-WALL') || positivePrompt.includes('零靠墙');
        const isReclinerMultiMode = shotCode === 'A08' || positivePrompt.includes('RECLINER 5-MODE') || positivePrompt.includes('单椅五档');
        const isDiningSuite = shotCode === 'A09' || positivePrompt.includes('DINING SUITE') || positivePrompt.includes('餐桌配套');
        const isDetailOrMacro = shotCode === 'A08' || positivePrompt.includes('CRAFTSMANSHIP') || positivePrompt.includes('特写') || positivePrompt.includes('DETAIL');
        const isReclinerFocus = isReclinerMultiMode || (!isHeroSofaFocus && !isTwoThirdsHeroSofa && !isZeroWallProfile && !isDiningSuite && !isLivingEnsembleMid && positivePrompt.toUpperCase().includes('RECLINER ARMCHAIR') && !isAngledHero);
        const isLowAngle = positivePrompt.toLowerCase().includes('low-angle') || (cameraSettings && cameraSettings.heightCm <= 80);
        const hasHumanOccupant = Boolean(isHumanPass);
        const isHeroSofaDedicatedShot = ['A03', 'A04', 'A05', 'A06'].includes(shotCode);
        const isReclinerDedicatedShot = ['A08'].includes(shotCode);

        const isArmlessLoungeChair = allowedSecondaryInlines.some(sec => 
          sec.product.role === 'lounge_chair' ||
          sec.product.functionCapable === false ||
          (sec.product.name && /(休闲|无扶手|矮椅|旋转|单椅|焦糖)/.test(sec.product.name) && !/(功能|电动|头等舱|展开|太空舱)/.test(sec.product.name))
        );
        const hasBrownSecondary = allowedSecondaryInlines.some(sec => /brown|caramel|amber|espresso/i.test(sec.colorEn));
        const brownNegativeFilter = hasBrownSecondary ? '' : 'brown recliner, brown armchair, ';

        const isReferenceA01 = input.referenceShotCode === 'A01';
        const a02PerspectiveShiftClause = (shotCode === 'A02' || isAngledHero)
          ? `[MANDATORY PERSPECTIVE SHIFT & 3+1 CHOREOGRAPHY: 45° THREE-QUARTERS OBLIQUE ANGLE]
${isReferenceA01 ? 'Reference Image 2 is Shot A01 (Grand Frontal Living Scene Master).' : 'Reference Image 2 is the frontal baseline.'}
FOR SHOT A02, YOU MUST PHYSICALLY SWING THE CAMERA 40-45 DEGREES TO THE FRONT-LEFT VANTAGE POINT (standing near the panoramic window, shooting diagonally across to the back-right)!
DO NOT RENDER A STRAIGHT-ON FRONTAL VIEW!
DO NOT CENTER THE SOFA SYMMETRICALLY!

[MANDATORY 3+1 CONVERSATIONAL LIVING ENSEMBLE CHOREOGRAPHY]:
Capture the cohesive conversational salon layout matching the luxury lifestyle reference:
1. THREE-SEATER MAIN SOFA: Located at midground right, backed against the luxury stone/wood focal wall, oriented at 45° diagonal angle. Supple genuine leather, three distinct seating cushions, with 1-2 curated throw cushions.
2. MATCHING 1-SEATER POWER MOTION RECLINER ARMCHAIR: Located at foreground left near the panoramic window flank, angled inward toward the main sofa in a 90-degree conversational L-shape. COMFORT ERGONOMIC POSTURE: Its motorized footrest is gracefully deployed into a relaxed comfort contour (as shown in reference design), highlighting peak First-Class relaxation!
3. DUAL NESTING CENTER COFFEE TABLES: Positioned on the area rug between sofa and armchair. Featuring a higher black square side pedestal nested with a lower dark marble/glass table, styled with an artisan wooden box and minimal greenery.
4. CONTEMPORARY GEOMETRIC AREA RUG: Expansive light ivory/warm greige geometric wool rug cleanly anchoring both sofas and coffee table on the warm wood plank flooring.
5. INDOOR BOTANICAL: An elegant tall fiddle-leaf fig tree stands between the recliner armchair and the panoramic window.
6. OPEN-PLAN VISTA: The vista to the right extends smoothly into the deep background open-plan dining zone (dark marble dining table and leather dining chairs), establishing majestic architectural depth.\n\n`
          : '';

        const a03PerspectiveClause = (shotCode === 'A03' || isHeroSofaFocus)
          ? `[MANDATORY HERO 3-SEATER PERSPECTIVE & COMPOSITION: SUBTLE THREE-QUARTERS OBLIQUE ANGLE]
${isReferenceA01 ? 'Reference Image 2 is Shot A01 (Grand Frontal Living Scene Master).' : 'Reference Image 2 is the scene baseline.'}
CRITICAL VANTAGE DIRECTIVE FOR SHOT A03:
- SUBTLE 15-25 DEGREE OBLIQUE PERSPECTIVE: The camera is stationed at the front-left vantage point (near the panoramic window), shooting toward the 3-seater hero sofa with a subtle 15-to-25 degree three-quarters oblique perspective. DO NOT RENDER A FLAT STRAIGHT-ON FRONTAL MUGSHOT! Show the dynamic 3D depth, the flare of the left armrest, and the deep seating cushion volume.
- 100% FOCUS ON HERO 3-SEATER SOFA: Completely crop out, exclude, and bypass ANY separate single armchair, recliner chair, or 3+1 ensemble arrangement. The 3-seater sofa is the ONLY seating piece in the frame!
- PRISTINE LEATHER SURFACE: Zero cluttered oversized cushions or furry pillows. The seating cushions and backrests remain clean, smooth, and uncluttered, showcasing the pure luxury of genuine semi-aniline leather.
- FOREGROUND NESTING COFFEE TABLES: The dual nesting coffee table ensemble (black square pedestal + lower dark marble/glass table with artisan wooden box and subtle greenery) sits in the foreground on the geometric area rug, angled naturally without blocking the main sofa seating cushions.
- LEFT-SIDE FLANK: An elegant side table and tall fiddle-leaf fig tree stand near the left panoramic window flank.
- BACKGROUND ENVELOPE: Hero sofa is backed against the luxury marble/wood accent feature wall with its signature dual tiered curved luminous floating shelves. The space to the right opens smoothly into the deep background open-plan dining area.\n\n`
          : '';

        const a04PerspectiveClause = (shotCode === 'A04')
          ? `[MANDATORY 2/3 HERO SOFA COMPANION PERSPECTIVE & COMPOSITION: 3:4 VERTICAL PORTRAIT]
${isReferenceA01 ? 'Reference Image 2 is Shot A01 (Grand Frontal Living Scene Master).' : 'Reference Image 2 is the scene baseline.'}
CRITICAL VANTAGE DIRECTIVE FOR SHOT A04:
- 3:4 VERTICAL COMPOSITION & -15° DOWNWARD TILT: The camera is stationed at 140cm standing eye-level height with a -15 degree downward pitch looking down onto the living area rug stage in 3:4 vertical portrait aspect ratio.
- 2/3 SOFA LIFESTYLE CROP: Frame approximately 2/3 of the three-seater hero motion sofa (focusing on the outer left armrest and deep seating cushions). The remaining 1/3 of the sofa and the rest of the room are naturally cropped out. DO NOT zoom out or shrink the sofa to fit the entire width into the vertical frame!
- NATURAL PLAY STAGE: Foreground play rug stage bathed in left window sheer curtain daylight, white matte cylindrical planter anchor.
- ZERO SIDE CHAIR: Completely crop out, exclude, and bypass any separate single armchair or recliner chair.\n\n`
          : '';

        const a05PerspectiveClause = (shotCode === 'A05')
          ? `[MANDATORY 2/3 HERO SOFA PRIVATE LOUNGE PERSPECTIVE & COMPOSITION: 3:4 VERTICAL PORTRAIT]
${isReferenceA01 ? 'Reference Image 2 is Shot A01 (Grand Frontal Living Scene Master).' : 'Reference Image 2 is the scene baseline.'}
CRITICAL VANTAGE DIRECTIVE FOR SHOT A05:
- 3:4 VERTICAL COMPOSITION & +28° RIGHT ANGLE: The camera is positioned at 95cm seated eye-level height (0° tilt) with a +28 degree right oblique perspective in 3:4 vertical portrait aspect ratio.
- 2/3 SOFA CRAFTSMANSHIP CROP: Frame approximately 2/3 of the three-seater hero motion sofa, tightly capturing the right outer armrest with signature diamond quilting, circular metal motion buttons, brass closure strip anchor, and warm 3000K ambient wall sconce from Reference Image 2.
- EXCLUDE SEPARATE CHAIRS: Strictly crop out any separate single armchair or distant room clutter. Strictly DO NOT invent unreferenced bookcases or wall niches!\n\n`
          : '';

        const a06PerspectiveClause = (shotCode === 'A06' || isZeroWallProfile)
          ? `[MANDATORY ZERO-WALL CLEARANCE LATERAL PROFILE: 88° PURE SIDE PROFILE]
${isReferenceA01 ? 'Reference Image 2 is Shot A01 (Grand Frontal Living Scene Master).' : 'Reference Image 2 is the scene baseline.'}
CRITICAL VANTAGE DIRECTIVE FOR SHOT A06:
- 88° PURE LATERAL SIDE PROFILE: The camera is stationed on the side flank (85-to-90 degree orthogonal profile) at 90cm seated eye-level height in 4:3 horizontal aspect ratio. Two-point perspective with strictly plumb vertical lines.
- ZERO-WALL CLEARANCE FUNCTION: Showcase MANWAH signature ZERO-WALL CLEARANCE technology in living room setting: hero sofa is positioned flush against the solid architectural feature wall with virtually zero gap (<5cm flush alignment)!
- PRISTINE CLOSED POSTURE: Motorized footrests strictly retracted and tucked flush under the base; backrest upright in standard closed showroom posture. Full side armrest profile highlights diamond quilting craftsmanship.\n\n`
          : '';

        const a07PerspectiveClause = (shotCode === 'A07' || isLivingEnsembleMid)
          ? `[MANDATORY ENSEMBLE LIVING PERSPECTIVE & DEPTH COMPRESSION: 55mm MEDIUM GROUPING]
${isReferenceA01 ? 'Reference Image 2 is Shot A01 (Grand Frontal Living Scene Master).' : 'Reference Image 2 is the scene baseline.'}
CRITICAL VANTAGE DIRECTIVE FOR SHOT A07:
- 55mm MEDIUM TELEPHOTO COMPRESSION: Camera at 95cm height with -35 degree oblique angle and -5 degree downward tilt in 4:3 horizontal aspect ratio.
- INTIMATE CONVERSATIONAL GROUPING: Medium living ensemble grouping tightly framing hero sofa in midground, luxury marble center coffee table and dark side accent table in foreground, highlighting the golden height drop between 450mm marble table and 400mm sofa seat.
- DEEP GROUNDING: Strong contact AO shadows ground furniture on the geometric area rug with soft side window daylight and 3000K ambient ceiling glow.\n\n`
          : '';

        const a08PerspectiveClause = (shotCode === 'A08' || isReclinerMultiMode)
          ? `[MANDATORY RECLINER 5-MODE PERSPECTIVE & HERO INVERSION: 50mm GOLDEN DIAGONAL]
${isReferenceA01 ? 'Reference Image 2 is Shot A01 (Grand Frontal Living Scene Master).' : 'Reference Image 2 is the scene baseline.'}
CRITICAL VANTAGE DIRECTIVE FOR SHOT A08:
- 100% FOCUS ON SINGLE POWER RECLINER ARMCHAIR: The single power motion recliner armchair is the 80% HERO PRODUCT in this shot! The 3-seater main sofa must be completely removed from center stage (pushed off-frame or distant background blur).
- 50mm GOLDEN DIAGONAL PERSPECTIVE: Camera at 95cm seated eye-level height with fixed 35-to-40 degree golden diagonal perspective in 4:3 horizontal aspect ratio.
- DEDICATED LIVING ROOM SANCTUARY: Positioned comfortably on the tailored geometric area rug in the open, spacious living room from Reference Image 2, capturing window daylight shadow boundary, leather sheen, and deep contact AO shadows. Strictly FORBID moving the chair into a hallway or door frame!\n\n`
          : '';

        const a09PerspectiveClause = (shotCode === 'A09' || isDiningSuite)
          ? `[MANDATORY DINING SUITE PERSPECTIVE & SPATIAL PIVOT: 40mm ARCHITECTURAL VISTA]
${isReferenceA01 ? 'Reference Image 2 is Shot A01 (Grand Frontal Living Scene Master).' : 'Reference Image 2 is the scene baseline.'}
CRITICAL VANTAGE DIRECTIVE FOR SHOT A09:
- SPATIAL PIVOT TO DINING SUITE: Camera axis is shifted to center on the luxury dining zone with 0-degree symmetrical frontal axis in 4:3 horizontal aspect ratio at 115cm standing eye-level height.
- HERO DINING SUITE: Expansive luxury Italian dining table with matching tailored leather dining chairs, architectural credenza sideboard, and modern bar cart, bathed in authentic natural window daylight.
- LIVING SOFA OFF-CENTER: The three-seater living room sofa MUST NOT occupy center stage; dining suite takes 75%+ visual prominence.\n\n`
          : '';

        let ref2EnsembleDirective = `2. REFERENCE IMAGE 2 IS THE 100% EXCLUSIVE TRUTH FOR THE ROOM ENVELOPE:
   - Inherit the architectural walls, background geometry and finishes, floor tiles, and window daylight direction strictly from Reference Image 2. Zero background drift!`;

        if (isReferenceA01) {
          if (shotCode === 'A02' || isAngledHero) {
            ref2EnsembleDirective = `2. REFERENCE IMAGE 2 IS SHOT A01 (MATERIAL & FINISH DNA ONLY - STRICTLY DO NOT COPY CAMERA ANGLE):
   - Reference Image 2 provides the authentic room materials (marble focal wall, ceiling lighting, floor tiles, daylight color) and furniture leather color tone.
   - PERSPECTIVE ANGLE DECOUPLING: Reference Image 2 is a 0-degree straight-on frontal view. FOR SHOT A02, YOU MUST COMPLETELY DISCARD THE FRONTAL CAMERA ANGLE OF REFERENCE IMAGE 2 and rotate the camera 45° to the front-left corner! Render the exact same room and furniture ensemble, but seen from a dynamic 45-degree three-quarters diagonal vantage point!`;
          } else if (shotCode === 'A03' || isHeroSofaFocus) {
            ref2EnsembleDirective = `2. REFERENCE IMAGE 2 IS SHOT A01 (GRAND LIVING SCENE MASTER - AUTHORITATIVE GROUND TRUTH - STRICTLY EXCLUDE SINGLE CHAIR):
   - Reference Image 2 establishes the absolute visual ground truth for the room architecture (marble/wood feature wall, dual curved sconces/shelves, floor tiles, window daylight) AND the exact genuine leather grade and color tone for the 3-seater sofa.
   - CAMERA & COMPOSITION DECOUPLING: Reference Image 2 is a 0-degree frontal 3+1 panorama. In Shot A03, you are framing the EXACT SAME 3-seater hero sofa from Reference Image 2 from a subtle 15-25 degree front-left three-quarters angle, with 100% focus on the 3-seater sofa alone! Completely crop out and exclude the single chair!`;
          } else if (shotCode === 'A04') {
            ref2EnsembleDirective = `2. REFERENCE IMAGE 2 IS SHOT A01 (MATERIAL DNA ONLY - STRICTLY DO NOT COPY HORIZONTAL WIDE FRAMING):
   - Reference Image 2 provides authentic room finishes and sofa leather color tone.
   - FRAMING DECOUPLING: Reference Image 2 is an ultra-wide horizontal landscape. FOR SHOT A04, YOU MUST RENDER A 3:4 VERTICAL PORTRAIT CROPPED ON 2/3 OF THE SOFA AT A -15° DOWNWARD TILT! Completely discard the wide horizontal perspective of Reference Image 2!`;
          } else if (shotCode === 'A05') {
            ref2EnsembleDirective = `2. REFERENCE IMAGE 2 IS SHOT A01 (MATERIAL DNA ONLY - STRICTLY DO NOT COPY HORIZONTAL WIDE FRAMING):
   - Reference Image 2 provides authentic room finishes and sofa leather color tone.
   - FRAMING DECOUPLING: Reference Image 2 is an ultra-wide horizontal landscape. FOR SHOT A05, YOU MUST RENDER A 3:4 VERTICAL PORTRAIT CROPPED ON 2/3 OF THE RIGHT SOFA ARMREST AT A +28° RIGHT ANGLE! Completely discard the frontal landscape composition of Reference Image 2!`;
          } else if (shotCode === 'A06' || isZeroWallProfile) {
            ref2EnsembleDirective = `2. REFERENCE IMAGE 2 IS SHOT A01 (ROOM WALL FINISHES ONLY - STRICTLY DO NOT COPY 0-DEGREE FRONTAL ANGLE):
   - Reference Image 2 shows the room from the front.
   - PERSPECTIVE DECOUPLING: FOR SHOT A06, YOU MUST PHYSICALLY ROTATE THE CAMERA 88° TO CAPTURE A PURE LATERAL PROFILE showing the sofa flush against the backdrop wall with <5cm zero-wall clearance! Discard the 0° frontal view of Reference Image 2!`;
          } else if (shotCode === 'A07' || isLivingEnsembleMid) {
            ref2EnsembleDirective = `2. REFERENCE IMAGE 2 IS SHOT A01 (ROOM FINISHES & COFFEE TABLE REFERENCE - COMPRESS DEPTH):
   - Inherit room finishes, area rug, and coffee table designs from Reference Image 2.
   - PERSPECTIVE DECOUPLING: Use 55mm medium telephoto compression to bring the coffee table and sofa into a tight, cohesive conversational group, eliminating wide empty gaps from Reference Image 2!`;
          } else if (shotCode === 'A08' || isReclinerMultiMode) {
            ref2EnsembleDirective = `2. REFERENCE IMAGE 2 IS SHOT A01 (ROOM ENVIRONMENT ONLY - COMPLETE HERO INVERSION):
   - Reference Image 2 provides the luxury room architecture, flooring, and window daylight.
   - HERO SUBJECT INVERSION: In Reference Image 2, the 3-seater sofa was centered. FOR SHOT A08, YOU MUST REMOVE THE 3-SEATER SOFA FROM CENTER STAGE AND FRAME THE SINGLE RECLINER ARMCHAIR AS THE 80% HERO PRODUCT in golden diagonal perspective!`;
          } else if (shotCode === 'A09' || isDiningSuite) {
            ref2EnsembleDirective = `2. REFERENCE IMAGE 2 IS SHOT A01 (OPEN-PLAN ARCHITECTURAL GROUND TRUTH - CAMERA SHIFT):
   - Reference Image 2 provides open-plan room finishes and daylight.
   - CAMERA SHIFT: In Reference Image 2, the camera was centered on the living room sofa. FOR SHOT A09, SHIFT THE CAMERA AXIS TO CENTER ON THE INTEGRATED DINING SUITE, without the living sofa blocking center frame!`;
          }
        }

        let specificShotTopMandate = '';
        if (shotCode === 'A02' || isAngledHero) {
          specificShotTopMandate = `[CRITICAL CAMERA ROTATION MANDATE FOR SHOT A02: 45° THREE-QUARTERS OBLIQUE ANGLE]
ATTENTION GENERATOR: DO NOT COPY THE STRAIGHT-ON FRONTAL ANGLE OR SYMMETRICAL COMPOSITION OF REFERENCE IMAGE 2!
Reference Image 2 is a straight-on frontal view, but SHOT A02 MUST BE A DRAMATIC 45-DEGREE CORNER THREE-QUARTERS OBLIQUE PERSPECTIVE!
The camera is physically stationed at the front-left corner near the panoramic window, shooting diagonally 40-45 degrees toward the back-right.
1. THREE-SEATER MAIN SOFA: MUST NOT BE HORIZONTAL TO THE SCREEN! It must be oriented along the 45-degree diagonal receding into the depth of the room. Show the deep dimensional volume of the front armrest, cushion depth, and side contour.
2. SINGLE RECLINER ARMCHAIR: Positioned prominently in the FOREGROUND-LEFT near the window, facing inward towards the 3-seater sofa at a 90-degree conversational angle.
3. DUAL NESTING COFFEE TABLES: Located between sofa and armchair on the rug, showing clear diagonal perspective foreshortening.
4. BACKGROUND FOCAL WALL: MUST RECEDE DIAGONALLY with strong two-point perspective vanishing lines from left to right, NOT a flat wall parallel to the frame!
STRICTLY FORBIDDEN: Any straight-on, flat, frontal view, or symmetrical sofa placement!\n\n`;
        } else if (shotCode === 'A03' || isHeroSofaFocus) {
          specificShotTopMandate = `[CRITICAL CAMERA & COMPOSITION MANDATE FOR SHOT A03: 15°-25° SUBTLE OBLIQUE & 100% THREE-SEATER SOLO FOCUS]
ATTENTION GENERATOR: DO NOT COPY THE 0-DEGREE STRAIGHT-ON FRONTAL ANGLE OR THE 3+1 ENSEMBLE LAYOUT OF REFERENCE IMAGE 2!
Reference Image 2 is a wide frontal 3+1 panorama containing a separate single chair, but SHOT A03 MUST BE A TIGHT 50mm COMMERCIAL FOCUS ON THE 3-SEATER HERO SOFA ALONE!
1. THREE-SEATER MAIN SOFA IS THE SOLE HERO SEATING PIECE: Completely crop out, bypass, and EXCLUDE any separate single armchair, recliner chair, or 3+1 ensemble arrangement from Reference Image 2! The 3-seater sofa must occupy 75%+ of the frame.
2. SUBTLE 15-25 DEGREE OBLIQUE PERSPECTIVE: The camera is stationed at the front-left vantage point with a subtle 15-to-25 degree three-quarters oblique perspective. DO NOT RENDER A FLAT STRAIGHT-ON FRONTAL MUGSHOT! Show the dynamic 3D depth, the flare of the front-left armrest, and cushion depth.
3. FOREGROUND DUAL COFFEE TABLES: Black square pedestal nested with dark lower marble/glass table sits in foreground on geometric rug without blocking sofa seating cushions.
STRICTLY FORBIDDEN: Rendering any side single armchair, rendering flat 0° frontal mugshot, or centering a symmetrical horizontal sofa!\n\n`;
        } else if (shotCode === 'A04') {
          specificShotTopMandate = `[CRITICAL FRAMING & ORIENTATION MANDATE FOR SHOT A04: 3:4 VERTICAL PORTRAIT & 2/3 SOFA LIFESTYLE CROP]
ATTENTION GENERATOR: DO NOT COPY THE HORIZONTAL LANDSCAPE ORIENTATION OR FULL ROOM COMPOSITION OF REFERENCE IMAGE 2!
Reference Image 2 is an ultra-wide horizontal landscape (A01). DO NOT SQUEEZE THE ENTIRE LIVING ROOM INTO THIS VERTICAL 3:4 FRAME!
1. 3:4 VERTICAL ASPECT RATIO & MICRO-DOWNWARD TILT: The camera is stationed at 140cm standing eye-level height with a -15 degree downward pitch looking down onto the living area rug stage in 3:4 vertical portrait aspect ratio.
2. TIGHT 2/3 SOFA CROP: Frame approximately 2/3 of the three-seater hero motion sofa (outer left armrest and wide seating cushion depth). The remaining 1/3 of the sofa and the rest of the room are naturally cropped out! DO NOT shrink or zoom out to fit the whole sofa.
3. EXCLUDE SECONDARY FURNITURE: Completely crop out any separate single armchair, and ensure the foreground coffee table does NOT block the front seating stage.
STRICTLY FORBIDDEN: Squeezing the entire room or entire sofa into the 3:4 vertical frame, horizontal wide-angle perspectives, or flat frontal views!\n\n`;
        } else if (shotCode === 'A05') {
          specificShotTopMandate = `[CRITICAL FRAMING & CRAFTSMANSHIP MANDATE FOR SHOT A05: 3:4 VERTICAL PORTRAIT & 2/3 SOFA LUXURY CROP]
ATTENTION GENERATOR: DO NOT COPY THE HORIZONTAL LANDSCAPE ORIENTATION OR FULL ROOM COMPOSITION OF REFERENCE IMAGE 2!
Reference Image 2 is an ultra-wide horizontal landscape (A01). DO NOT SQUEEZE THE ENTIRE LIVING ROOM INTO THIS VERTICAL 3:4 FRAME!
1. 3:4 VERTICAL ASPECT RATIO & RIGHT-FLANK ANGLE: The camera is positioned at 95cm seated eye-level height with a +28 degree right oblique perspective in 3:4 vertical portrait aspect ratio.
2. TIGHT 2/3 SOFA CROP: Frame approximately 2/3 of the three-seater hero motion sofa, tightly capturing the right outer armrest with signature diamond quilting, circular metal motion buttons, brass closure strip anchor, and warm 3000K ambient wall sconce from Reference Image 2.
3. EXCLUDE SECONDARY FURNITURE: Completely crop out any separate single armchair or distant room clutter. Strictly DO NOT invent unreferenced bookcases or wall niches!
STRICTLY FORBIDDEN: Squeezing the entire room or entire sofa into the 3:4 vertical frame, or flat frontal mugshot views!\n\n`;
        } else if (shotCode === 'A06' || isZeroWallProfile) {
          specificShotTopMandate = `[CRITICAL ORTHOGONAL ROTATION MANDATE FOR SHOT A06: 88° PURE LATERAL PROFILE & ZERO-WALL CLEARANCE]
ATTENTION GENERATOR: DO NOT COPY THE 0-DEGREE STRAIGHT-ON FRONTAL ANGLE OF REFERENCE IMAGE 2!
Reference Image 2 is a 0-degree straight-on frontal view, but SHOT A06 MUST BE AN 88-DEGREE PURE LATERAL SIDE PROFILE VIEW!
The camera is stationed on the side flank (85° to 90° orthogonal profile) at 90cm seated eye-level height.
1. ZERO-WALL CLEARANCE ARCHITECTURE: The hero sofa is backed flush against the continuous solid living room marble/wood feature wall from Reference Image 2 with virtually ZERO gap (<5cm flush alignment), demonstrating MANWAH signature zero-wall space-saving technology!
2. STRICTLY CLOSED SHOWROOM POSTURE: All motorized footrests are completely retracted and tucked underneath the base; the backrest is upright in standard closed form.
3. PURE SIDE PROFILE: Showcase full side armrest silhouette with diamond-quilted craftsmanship and neat bottom chassis.
STRICTLY FORBIDDEN: Frontal angle, 45-degree angle, sofa detached from back wall with large gap, or deployed footrests!\n\n`;
        } else if (shotCode === 'A07' || isLivingEnsembleMid) {
          specificShotTopMandate = `[CRITICAL DEPTH COMPRESSION MANDATE FOR SHOT A07: 55mm MEDIUM ENSEMBLE COMPOSITION]
ATTENTION GENERATOR: DO NOT COPY THE DISTANT ULTRA-WIDE-ANGLE PERSPECTIVE OF REFERENCE IMAGE 2!
Reference Image 2 is an ultra-wide panoramic vista (26-35mm) where the coffee table and sofa appear far apart and surrounded by empty floor space.
1. 55mm TELEPHOTO DEPTH COMPRESSION: The camera uses a 55mm medium telephoto lens at 95cm height with a -35 degree oblique angle and -5 degree downward tilt in 4:3 horizontal aspect ratio.
2. INTIMATE LIVING CONVERSATION GROUPING: Compress depth to bring the dual nesting marble coffee tables into an intimate, cohesive foreground relationship with the hero sofa in the midground, clearly showcasing the golden height drop (450mm table vs 400mm sofa seat).
3. GEOMETRIC RUG & AO SHADOWS: Strong contact AO shadows ground the furniture tightly on the geometric area rug.
STRICTLY FORBIDDEN: Far distant wide-angle views, empty barren foregrounds, or flat frontal 0-degree mugshots!\n\n`;
        } else if (shotCode === 'A08' || isReclinerMultiMode) {
          specificShotTopMandate = `[CRITICAL HERO INVERSION MANDATE FOR SHOT A08: DEDICATED SINGLE POWER RECLINER SHOWCASE]
ATTENTION GENERATOR: DO NOT COPY THE THREE-SEATER CENTERED COMPOSITION OF REFERENCE IMAGE 2!
In Reference Image 2 (A01), the three-seater sofa dominates the center of the frame, while the single recliner is a minor side accent.
FOR SHOT A08, THE HERO SUBJECT IS 100% INVERTED: THE SINGLE POWER RECLINER ARMCHAIR IS THE 80% HERO PRODUCT!
1. THREE-SEATER MAIN SOFA MUST VACATE CENTER STAGE: The 3-seater sofa must be completely out of frame or pushed to distant soft background blur. IT MUST NOT BE IN THE CENTER!
2. DEDICATED RECLINER SHOWCASE: The matching single power recliner armchair sits majestically in the spacious, open living room of Reference Image 2 on the tailored area rug, framed at a 35-to-40 degree golden diagonal perspective.
3. INHERIT LEATHER & FINISH DNA: 100% inherit the genuine leather grade, color tone, and welt piping craftsmanship from Reference Image 1, set against the authentic living room finishes and window daylight of Reference Image 2.
STRICTLY FORBIDDEN: Centering the three-seater sofa, blocking the recliner with other furniture, or moving the recliner into a narrow hallway/corridor!\n\n`;
        } else if (shotCode === 'A09' || isDiningSuite) {
          specificShotTopMandate = `[CRITICAL SPATIAL PIVOT MANDATE FOR SHOT A09: DINING SUITE INTEGRATED LIFESTYLE VISTA]
ATTENTION GENERATOR: DO NOT COPY THE LIVING ROOM SOFA CENTERED COMPOSITION OF REFERENCE IMAGE 2!
In Reference Image 2 (A01), the camera is centered on the living room sofa, while the dining area is in the far right background.
FOR SHOT A09, PIVOT THE CAMERA AXIS TO CENTER ON THE INTEGRATED DINING SUITE:
1. HERO DINING SUITE IS THE VISUAL CENTER: The camera axis is centered on the luxury dining table ensemble (luxury Italian black marble dining table, coordinated leather dining chairs, credenza sideboard, and mobile bar cart).
2. LIVING ROOM SOFA MUST NOT OCCUPY CENTER STAGE: The living room sofa is shifted out of the central axis, allowing the dining suite to take 75%+ visual dominance.
3. OPEN-PLAN ARCHITECTURAL HARMONY: Bathed in the authentic window daylight and architectural finishes strictly continuous with Reference Image 2.
STRICTLY FORBIDDEN: Keeping the three-seater living sofa in the center of the frame, or copying the living room centered framing of Reference Image 2!\n\n`;
        }

        directivePrompt = `${specificShotTopMandate}[MANWAH COMMERCIAL FURNITURE PHOTOGRAPHY: SHOT ${shotCode}]
MULTI-VIEW ASSET ANCHOR:
1. REFERENCE IMAGE 1 IS THE 100% EXCLUSIVE VISUAL TRUTH FOR THE HERO FURNITURE:
${(shotCode === 'A08' && activePrimaryProduct === primaryProduct)
  ? `   - [A08 SINGLE POWER RECLINER DERIVATION MANDATE]: Reference Image 1 provides the master genuine leather material (${effectiveMaterial}), precise color anchor (${effectiveColor}), and signature welt-piping craftsmanship for this suite. FOR THIS A08 SHOT, RENDER A MATCHING SINGLE-SEATER LUXURY POWER MOTION RECLINER ARMCHAIR in the three-quarters composition, 100% inheriting the exact leather grade, color tone, tufted pleating, and stitching DNA from Reference Image 1!`
  : `   - Faithfully replicate the exact furniture silhouette from Reference Image 1: precise seating cushion division, signature armrest contour, ergonomic backrest volume, supple genuine leather texture (${effectiveMaterial}), authentic color tone (${effectiveColor}), and precision welt stitching.`}
${(shotCode === 'A02' || isAngledHero)
  ? `   - MANDATORY PERSPECTIVE RE-ORIENTATION: Reference Image 2 shows the sofa from a 0-degree straight-on frontal view. For Shot A02, you MUST re-render the sofa and living room from a 45-degree diagonal three-quarters perspective, NOT from the flat frontal angle of Reference Image 2!`
  : (shotCode === 'A03' && isReferenceA01)
  ? `   - MANDATORY SUBTLE ANGLE ADJUSTMENT: Re-render from a subtle 15-25 degree oblique angle, 100% focusing on the 3-seater sofa and completely excluding the single chair.`
  : (shotCode === 'A04' && isReferenceA01)
  ? `   - MANDATORY 2/3 VERTICAL CROPPING: Re-crop tightly to frame 2/3 of the hero sofa in 3:4 vertical composition at a -15° downward tilt.`
  : (shotCode === 'A05' && isReferenceA01)
  ? `   - MANDATORY 2/3 VERTICAL CROPPING: Re-crop tightly to frame 2/3 of the right sofa armrest in 3:4 vertical composition at a +28° right angle.`
  : (shotCode === 'A06' && isReferenceA01)
  ? `   - MANDATORY 88° LATERAL ROTATION: Rotate camera 88° to capture the sofa's pure side profile flush against the back wall (<5cm gap).`
  : (shotCode === 'A07' && isReferenceA01)
  ? `   - MANDATORY 55mm MEDIUM GROUPING: Frame the sofa and coffee table in tight medium composition with depth compression.`
  : (shotCode === 'A08' && isReferenceA01)
  ? `   - MANDATORY RECLINER HERO FOCUS: Center and frame the matching single power recliner armchair as the hero piece, removing the 3-seater sofa from center stage.`
  : (shotCode === 'A09' && isReferenceA01)
  ? `   - MANDATORY DINING VISTA ALIGNMENT: Focus on dining suite or open-plan continuous vista.`
  : '   - MANDATORY SOFA OVERWRITE: Reference Image 2 contains a previous sofa from an earlier angle. You MUST COMPLETELY IGNORE, ERASE, AND OVERWRITE any sofa shown in Reference Image 2! DO NOT blend, morph, or take proportions from the old sofa in Reference Image 2!'}
${ref2EnsembleDirective}

CAMERA PERSPECTIVE & COMPOSITION DIRECTIVE:
${a02PerspectiveShiftClause}${a03PerspectiveClause}${a04PerspectiveClause}${a05PerspectiveClause}${a06PerspectiveClause}${a07PerspectiveClause}${a08PerspectiveClause}${a09PerspectiveClause}${positivePrompt}
${secondaryReferencesText ? `\nMATCHING ENSEMBLE:\n${secondaryReferencesText}\n` : ''}
CORE INVARIANTS:
- FOUR INVARIANCE PILLARS:
  1. Coordinate origin: white matte cylindrical planter with indoor foliage plant (constant position and height relative to window and wall).
  2. Dual curved wall sconces on marble backdrop with consistent curvature and spacing.
  3. Left panoramic window 6000K cool daylight paired with interior 3000K warm ambient glow, soft eastward contact shadow falloff.
  4. Deep physical contact AO grounding all furniture legs and chassis firmly onto the area rug.
- OPTICS & LIGHTING: Two-point architectural perspective with plumb vertical lines (tilt = 0°). Natural soft side daylight streaming through panoramic window flank matching Reference Image 2, with gentle organic shadow falloff and genuine ambient occlusion. Zero 3D CGI look, zero plastic render sheen.
- ZERO TEXT: Clean pristine commercial catalog photograph, completely free of any text, letters, Chinese characters, labels, or watermarks.
- SHOWROOM POSTURE: ${shotCode === 'A02' ? 'Main sofa motorized footrests strictly remain closed and flush. The matching single recliner armchair may have its motorized footrest comfortably extended into ergonomic contour as in reference.' : (isFunctionalClosed ? 'All sofa and chair motorized footrests and motion mechanisms strictly remain 100% CLOSED and retracted flush under base.' : 'Motion mechanism may be deployed as specified.')}`;

        const cleanNegativeConstraints = [
          negativePrompt,
          antiStickerNegatives,
          (shotCode === 'A02' || isAngledHero) ? 'flat frontal view, straight-on camera, straight-on frontal view, symmetrical center sofa, horizontal sofa parallel to screen, front-facing sofa, flat 1-point perspective, mugshot view, zero perspective depth, copying frontal composition of reference 2, boxy closed small room, missing coffee table, missing rug, cramped narrow space, center dividing pillar' : '',
          (shotCode === 'A03' || isHeroSofaFocus) ? 'flat frontal mugshot, straight-on camera, symmetrical center sofa, facing directly forward, stiff mugshot view, side chair, accent chair, armchair, lounge chair, single chair, 3+1 ensemble, extra chair, additional seating, cluttered throw pillows, giant fuzzy cushions, boxy closed small room, missing coffee table, center dividing pillar' : '',
          shotCode === 'A04' ? 'full horizontal panorama, entire living room in frame, wide angle vista, isolated single chair, coffee table blocking front, 1-point perspective frontal view, miniature sofa squeezed in frame, flipped room' : '',
          shotCode === 'A05' ? 'full horizontal panorama, entire room in frame, distant furniture, wide angle panorama, isolated single chair, built-in bookshelf, bookcase, library wall, flat frontal view, arched shelves' : '',
          (shotCode === 'A06' || isZeroWallProfile) ? 'flat frontal view, 0-degree straight-on view, front-facing sofa, 45-degree corner view, detached sofa from wall, large gap between sofa and wall, deployed footrest, open recliner mechanism, office, library shelves, bookshelf' : '',
          (shotCode === 'A07' || isLivingEnsembleMid) ? 'wide empty room panorama, tiny distant coffee table, flat frontal mugshot, vast empty foreground, floating furniture, disconnected coffee table' : '',
          (shotCode === 'A08' || isReclinerMultiMode) ? 'three-seater sofa centered in frame, three-seater sofa blocking recliner, flat frontal living room view, copying A01 composition, hallway, corridor, entryway, door frame, white door frame' : '',
          (shotCode === 'A09' || isDiningSuite) ? 'three-seater sofa centered in frame, living room sofa dominating image, kitchen sink, cramped room, copying A01 living room composition' : '',
          'CGI, 3D render, low-poly, clay model, plastic texture, oversaturated, amateur render',
          'double sofas, ghost sofa, overlapping couches, morphing furniture',
          'different room, altered architecture, newly invented wall niches, arched shelves, bookshelf, bookcase, library shelves, study room, hallway, corridor, foyer, doorway, mirrored window, reversed daylight, flipped room',
          'crooked vertical lines, tilted camera, crooked perspective, floating furniture, mismatched vanishing lines',
          'deformed sofa, generic boxy sofa, distorted proportions, wrong color',
          (isFunctionalClosed && shotCode !== 'A02') ? 'deployed footrest, extended footrest, popped leg rest, open footrest mechanism, open recliner mechanism, unretracted leg rest, unfolded footrest, 展开的脚踏, 伸出的脚托' : '',
          !hasHumanOccupant ? 'people, human, person, man, woman, lady, girl, boy, child, human model, occupants, crowd, human face, human hands, distorted limbs' : '',
          brownNegativeFilter,
          'text, watermark, font, words, letters, chinese characters, labels, annotations, captions, logo'
        ].filter(Boolean).join(', ');

        directivePrompt += `\n\nNegative constraints: ${cleanNegativeConstraints}`;
      } else if (productInline) {
        // A00 空间母版初创：以产品实拍图与搭配套组为最高基石，结构化提纯
        const isArmlessLoungeChairA00 = secondaryInlines.some(sec => 
          sec.product.role === 'lounge_chair' ||
          sec.product.functionCapable === false ||
          (sec.product.name && /(休闲|无扶手|矮椅|旋转|单椅|焦糖)/.test(sec.product.name) && !/(功能|电动|头等舱|展开|太空舱)/.test(sec.product.name))
        );

        const combinedContext = `${input.roomName || ''} ${input.spacePreset?.code || ''} ${input.spacePreset?.name || ''} ${input.styleName || ''} ${input.stylePreset?.code || ''} ${input.stylePreset?.name || ''} ${positivePrompt}`;

        const isSunken = /下沉|sunken|N-R04/i.test(combinedContext);
        const isDuplex = /挑空|复式|duplex|double.*height|N-R03/i.test(combinedContext);
        const isPavilion = /山水|宽厅|pavilion|water.*garden|松柏|N-R05/i.test(combinedContext);
        const isPenthouse = /顶层|天际|会所|penthouse|skyline|N-R06/i.test(combinedContext);

        const isAmerican = /美式|american|US-01|US-02/i.test(combinedContext);
        const isFrench = /法式|parisian|haussmann|EU-01/i.test(combinedContext);
        const isItalian = /意式|italian|milanese|IT-01/i.test(combinedContext);

        let topologyMandateA00 = '';
        const topologyNegativesA00: string[] = [];

        if (isSunken) {
          topologyMandateA00 = `[MANDATORY ARCHITECTURAL TOPOLOGY: 45CM SUNKEN CONVERSATION PIT WITH PERIMETER STEPS & FIREPLACE]
1. SUNKEN CONVERSATION PIT: The central living lounge seating zone MUST BE CLEARLY STEPPED DOWN 40-45CM BELOW THE SURROUNDING UPPER FLOOR LEVEL. Visible, clean perimeter stone steps wrap around the sunken lounge area. The sofa, carpet, and coffee table sit recessed inside this conversation sanctuary.
2. TRAVERTINE STONE FIREPLACE: In the center background feature wall, there MUST be a monumental natural honed travertine limestone wall with an integrated horizontal modern linear fireplace hearth showing visible dancing live orange fire flames.
3. ABSOLUTE TOPOLOGY MANDATE: STRICTLY FORBID flat one-level floor without steps! STRICTLY FORBID room without fireplace!`;
          topologyNegativesA00.push(
            'flat floor without steps',
            'flat single-level floor',
            'absence of sunken pit',
            'no steps around living room',
            'missing fireplace',
            'no fireplace',
            'missing fire hearth'
          );
        } else if (isDuplex) {
          topologyMandateA00 = `[MANDATORY ARCHITECTURAL TOPOLOGY: MONUMENTAL 6.2M DOUBLE-HEIGHT SOARING VOID]
1. SOARING 6.2M DOUBLE HEIGHT: Dramatic double-height vertical volume with a two-story continuous feature wall.
2. CHANDELIER & SCULPTURAL STAIRS: High-altitude modern sculptural pendant chandelier hanging in the void, with background revealing interior glass zen garden and floating curved stairs.`;
          topologyNegativesA00.push('low ceiling', 'standard 3m ceiling', 'flat standard apartment', 'missing double height ceiling void');
        } else if (isPavilion) {
          topologyMandateA00 = `[MANDATORY ARCHITECTURAL TOPOLOGY: ORIENTAL ZEN WATER GARDEN VILLA PAVILION]
1. WATER MIRROR & PINE VIEW: Full-span uninterrupted panoramic glass wall looking out directly to an outdoor serene water mirror reflection pool with a sculptural Japanese pine bonsai tree and limestone boulders.`;
          topologyNegativesA00.push('urban skyscraper view', 'street level view', 'blocked garden view');
        } else if (isPenthouse) {
          topologyMandateA00 = `[MANDATORY ARCHITECTURAL TOPOLOGY: HIGH-ALTITUDE SKYLINE PENTHOUSE SALON]
1. METROPOLIS SKYLINE: Majestic 4.2m ceiling with soaring floor-to-ceiling panoramic glass curtain wall overlooking high-altitude metropolis skyscraper skyline and sunset golden hour clouds.`;
          topologyNegativesA00.push('ground floor view', 'street level view', 'garden outside window');
        }

        let styleMandateA00 = '';
        const styleNegativesA00: string[] = [];

        if (isAmerican) {
          styleMandateA00 = `[MANDATORY INTERIOR ARCHITECTURAL STYLE: MODERN AMERICAN METROPOLITAN]
1. PICTURE-FRAME WALL PANEL MOLDINGS & WAINSCOTING: The background and side walls MUST feature authentic classic modern American picture-frame wall moldings and elegant wainscoting (crisp rectangular architectural wall frames with shadow relief moldings in warm oat greige #E6DFD5 and rich dark walnut millwork).
2. FINISHES: Warm brushed brass wall sconces, plaster ceiling crown moldings, and solid American dark walnut joinery.
3. ABSOLUTE PROHIBITION: STRICTLY FORBID modern flat sterile drywall, strictly forbid flat featureless white slabs without wall moldings!`;
          styleNegativesA00.push(
            'cold flat sterile drywall',
            'modern plain white slab without moldings',
            'sterile white clinic walls',
            'flat bare drywall without panel frames'
          );
        } else if (isFrench) {
          styleMandateA00 = `[MANDATORY INTERIOR ARCHITECTURAL STYLE: PARISIAN HAUSSMANNIAN BOISERIE]
1. FRENCH BOISERIE & CARVED MOLDINGS: Walls feature delicate French boiserie panel moldings, carved plaster wall cornices, and pale oak herringbone parquet flooring.`;
          styleNegativesA00.push('dark heavy industrial concrete', 'flat modern drywall without moldings');
        } else if (isItalian) {
          styleMandateA00 = `[MANDATORY INTERIOR ARCHITECTURAL STYLE: MILANESE ARCHITECTURAL LUXURY]
1. ROMAN TRAVERTINE & SMOKED WALNUT: Continuous full-span honed porous Roman travertine stone slabs and rich smoked dark walnut joinery, ultra-slim dark brushed titanium metal profiles, minimalist recessed reveal shadow gaps.`;
          styleNegativesA00.push('traditional decorative moldings', 'rustic country wood', 'cheap plastic laminate');
        }

        directivePrompt = `[MANWAH SCENE MASTER GROUND TRUTH: A00]
${topologyMandateA00 ? `${topologyMandateA00}\n` : ''}
${styleMandateA00 ? `${styleMandateA00}\n` : ''}
VISUAL ASSET ANCHOR:
- REFERENCE IMAGE 1: Authentic ground truth product asset for ${effectiveProductName} (color: ${effectiveColor}, material: ${effectiveMaterial}). Faithfully reproduce its exact silhouette, armrest contour, cushion tufting, and leather texture.
${primaryProduct?.role === 'sofa_2seat' ? `   - TWO-SEATER PROPORTIONS: Strictly a TWO-SEATER sofa (exactly 2 seating cushions and 2 backrest units, twin-cushion division, strictly NOT a three-seater sofa, NO middle cushion). Generously wide horizontal proportion and low-slung stance (2.1m wide presence). Tailored contrasting welt cord piping along front edge and armrest contours.` : ''}
${secondaryReferencesText ? `${secondaryReferencesText}\n` : ''}
SPATIAL & CAMERA DIRECTIVE:
${positivePrompt}

CORE INVARIANTS:
- PERSPECTIVE & ARCHITECTURE: Ultra-wide architectural camera perspective with plumb vertical lines (26mm field of view). Faithfully manifest the distinctive architectural room topology, ceiling headroom, lighting atmosphere, and tailored interior wall materiality specified in the Spatial & Camera Directive.
- SHOWROOM POSTURE: All sofa and chair motorized footrests strictly remain 100% CLOSED and retracted flush under base.
- ZERO CLUTTER OR PILLOWS: Clean pristine commercial catalog sofa presentation. Strictly ZERO decorative throw pillows, NO loose cushions, NO patterned or floral pillows on sofa. Clean empty luxury leather seating surfaces.
- COMPOSITE CRAFTSMANSHIP: Genuine luxury stone/wood materiality with organic veining, chamfered bevels, and realistic ambient occlusion contact shadows. Zero plastic CGI sheen.
- ZERO TEXT: Clean pristine commercial catalog photograph, completely free of any text, letters, Chinese characters, labels, or watermarks.`;

        const cleanNegativeConstraintsA00 = [
          negativePrompt,
          antiStickerNegatives,
          ...topologyNegativesA00,
          ...styleNegativesA00,
          'throw pillow, throw pillows, decorative pillow, decorative pillows, sofa pillow, patterned cushion, floral cushion, cloth pillow, extra cushions on sofa, geometric pillow, blanket, clutter, floral armchair, patterned fabric chair, patchwork armchair',
          'CGI, 3D render, low-poly, clay model, plastic texture, oversaturated, amateur render',
          'fake marble sticker, printed marble foil, cheap laminate table, repeating stone pattern, vinyl sticker wrap',
          primaryProduct?.role === 'sofa_2seat' ? 'three-seater sofa, 3 seating cushions, middle cushion, extra seat cushion, tall and narrow sofa, squished proportions' : '',
          isArmlessLoungeChairA00 ? 'bulky recliner footrest, deployed footrest on lounge chair, thick armrests on armless chair, power motion buttons' : '',
          'sofa overlapping window and wall seam, sofa blocking window glass, discontinuous backdrop behind sofa, crooked sofa angle, mismatched perspective alignment, sofa floating off floor grid, crooked vertical lines, ground-level low shot',
          'deployed footrest, extended footrest, open recliner mechanism, excessive empty rug void in foreground, cut-off ceiling',
          'lonely drifting side chair, disconnected furniture, chair pushed against window, lopsided dark wall imbalance',
          'text, watermark, font, words, letters, chinese characters, labels, annotations, captions, overlay, subtitles, banner, logo, generic sofa, wrong color, cheap furniture, cartoon, people, human, faces'
        ].filter(Boolean).join(', ');

        directivePrompt += `\n\nNegative constraints: ${cleanNegativeConstraintsA00}`;
      }

      const mappedAspectRatio =
        aspectRatio === '3:4' ? '3:4' :
        aspectRatio === '16:9' ? '16:9' :
        aspectRatio === '1:1' ? '1:1' :
        aspectRatio === '4:3' ? '4:3' :
        aspectRatio === '9:16' ? '9:16' :
        aspectRatio === '2:3' ? '2:3' :
        aspectRatio === '3:2' ? '3:2' :
        aspectRatio || '4:3';

      const isAutoFallback = input.autoModelFallback !== false;
      primaryModel = targetModel;
      const candidateModels: string[] = [primaryModel];

      if (isAutoFallback) {
        const fallbacks = [
          'gemini-3.1-flash-image-preview',
          'openai/gpt-image-2.5-flare-c',
          'gpt-image-2-c'
        ];
        for (const fb of fallbacks) {
          if (!candidateModels.includes(fb)) {
            candidateModels.push(fb);
          }
        }
      }

      const attemptErrors: Array<{ model: string; error: string }> = [];
      let rawImageBuffer: Buffer | null = null;
      wasFallbackUsed = false;

      const gatewayUrl = `http://127.0.0.1:${process.env.PORT || 3000}/api/gateway/generate-image`;
      const generationIntent = images.length > 0 ? 'image_edit' : 'text_to_image';

      for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
        const currentModelToAttempt = candidateModels[mIdx];
        const currentResolution =
          currentModelToAttempt === 'gemini-2.5-flash-image' || currentModelToAttempt === 'gemini-2.5-flash'
            ? '1K'
            : validResolution;

        console.log(
          `[SpaceImageGenerationService] Dispatching ${shotCode} to unified gateway (尝试 ${mIdx + 1}/${candidateModels.length}): model=${currentModelToAttempt}, res=${currentResolution}, ratio=${mappedAspectRatio}, refs=${images.length}`
        );

        const timeoutMs = process.env.NODE_ENV === 'test' ? 1200 : (currentModelToAttempt.includes('gpt') ? 120000 : 75000);

        try {
          const gatewayRes = await fetch(gatewayUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-uuid': 'system'
            },
            body: JSON.stringify({
              prompt: directivePrompt,
              model: currentModelToAttempt,
              aspectRatio: mappedAspectRatio,
              resolution: currentResolution,
              seed: typeof input.seed === 'number' ? input.seed : undefined,
              images,
              generationIntent
            }),
            signal: AbortSignal.timeout(timeoutMs)
          });

          const gatewayData = await gatewayRes.json();

          if (gatewayRes.ok && !gatewayData.error && gatewayData.success !== false) {
            const imgUrlOrBase64 =
              gatewayData.imageUrl ||
              gatewayData.data?.[0]?.url ||
              gatewayData.data?.[0]?.b64_json ||
              gatewayData.images?.[0]?.data ||
              gatewayData.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

            if (typeof imgUrlOrBase64 === 'string' && imgUrlOrBase64.length > 0) {
              if (imgUrlOrBase64.startsWith('data:')) {
                const base64Clean = imgUrlOrBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
                rawImageBuffer = Buffer.from(base64Clean, 'base64');
              } else if (imgUrlOrBase64.startsWith('http://') || imgUrlOrBase64.startsWith('https://')) {
                const fetched = await fetch(imgUrlOrBase64, { signal: AbortSignal.timeout(60000) });
                if (fetched.ok) {
                  rawImageBuffer = Buffer.from(await fetched.arrayBuffer());
                }
              } else if (imgUrlOrBase64.length > 500) {
                rawImageBuffer = Buffer.from(imgUrlOrBase64, 'base64');
              }
            }
          }

          if (rawImageBuffer && rawImageBuffer.length > 0) {
            wasFallbackUsed = currentModelToAttempt !== primaryModel;
            usedProvider = gatewayData.provider || config.provider || 'tiantoken';
            usedModel = gatewayData.model || currentModelToAttempt;
            provenance = 'AI_ESTIMATED';
            console.log(`[SpaceImageGenerationService] Successfully generated via ${usedProvider} (${usedModel}), bytes: ${rawImageBuffer.length}`);
            break;
          } else {
            const errDetail = typeof gatewayData?.error === 'object'
              ? (gatewayData.error?.message || JSON.stringify(gatewayData.error))
              : (gatewayData?.error || gatewayData?.message || '上游接口未返回有效图像数据');
            attemptErrors.push({ model: currentModelToAttempt, error: String(errDetail) });
            console.warn(`[SpaceImageGenerationService] Model ${currentModelToAttempt} gateway error:`, errDetail);
          }
        } catch (apiErr: any) {
          const errMsg = apiErr?.name === 'AbortError' ? '上游请求网络超时' : (apiErr?.message || '云端网络请求异常');
          attemptErrors.push({ model: currentModelToAttempt, error: errMsg });
          console.warn(`[SpaceImageGenerationService] Model ${currentModelToAttempt} deferred: ${errMsg}`);
        }
      }

      if (rawImageBuffer && rawImageBuffer.length > 0) {
        if (objectKey.endsWith('.webp')) {
          imageBuffer = await sharp(rawImageBuffer).webp({ quality: 90 }).toBuffer();
          contentType = 'image/webp';
        } else if (objectKey.endsWith('.jpg') || objectKey.endsWith('.jpeg')) {
          imageBuffer = await sharp(rawImageBuffer).jpeg({ quality: 90 }).toBuffer();
          contentType = 'image/jpeg';
        } else {
          imageBuffer = rawImageBuffer;
          contentType = 'image/png';
        }
      } else {
        const errorText = attemptErrors.length > 0
          ? attemptErrors.map(e => `[${e.model}]: ${e.error}`).join('； ')
          : (cloudError || '上游生图接口未响应');

        if (!isAutoFallback) {
          throw new Error(`云端生图受阻 (${primaryModel}): ${attemptErrors[0]?.error || errorText}。请在控制面板开启【多模型故障自动轮换】开关以自动切换备选可用模型重试。`);
        } else {
          throw new Error(`全部候选模型均受阻 (已尝试: ${candidateModels.join(' -> ')}): ${errorText}。请检查网络或稍后重新生成。`);
        }
      }
    }

    const sha256 = crypto.createHash('sha256').update(imageBuffer).digest('hex');

      // 4. 严格持久化写入 GCS 对象存储系统 (GcsAssetStorage)
      await this.storage.put({
        bucketType: 'generated',
        objectKey,
        buffer: imageBuffer,
        contentType,
        metadata: {
          projectId,
          shotCode,
          sha256,
          provider: usedProvider,
          model: usedModel,
          provenance,
          productColor: effectiveColor
        }
      });

      // 5. 优先使用受控同源代理 URL，确保客户端在任何网络环境下（包括无外网代理的国内浏览器）100% 畅通稳定加载
      const proxyUrl = `/api/space/storage/local-file?key=${encodeURIComponent(objectKey)}`;

      const warningNotice = wasFallbackUsed
        ? `主选模型 (${primaryModel}) 响应受阻，已自动故障转移至 (${usedModel}) 成功生成真实大图！`
        : undefined;

      return {
        objectKey,
        imageUrl: proxyUrl,
        provider: usedProvider,
        model: usedModel,
        bytes: imageBuffer.length,
        sha256,
        contentType,
        provenance,
        productionTruth: true,
        isFallback: wasFallbackUsed,
        warningNotice
      };
  }

  /**
   * 确定性高保真空间母版底图渲染器
   * 动态映射产品的色彩真值 (干邑橙/暖灰/深鞍褐等)，输出真实符合 3:4 比例、摄影机光心、两点透视与敏华材质调性的工程底图
   */
  public static renderDeterministicSpatialAsset(params: {
    shotCode: string;
    productName: string;
    productColor?: string;
    productRole?: string;
    roomName: string;
    styleName: string;
    camera: { lensMm: number; heightCm: number; yawDeg: number; pitchDeg: number };
    variantIndex?: number;
    variantTag?: string;
  }): Buffer {
    const { shotCode, productName, productColor = '', productRole = '', roomName, styleName, camera, variantIndex = 1, variantTag = '' } = params;

    // 根据产品色彩真值动态映射皮质高定渐变色 (100% 保持产品色彩与材质真值不变量)
    const isWarmAmberOrOrange =
      /橙|琥珀|黄|干邑|caramel|amber|orange|cognac/i.test(productColor);
    const isWhiteOrCream =
      /白|奶|极地|ivory|cream|white|polar|milk|vanilla|chalk|雪/i.test(productColor);
    const isGreige =
      /灰|greige|gray|grey|米/i.test(productColor);
    const isDarkBrown =
      /黑|褐|深|saddle|brown|dark|chocolate|咖啡/i.test(productColor);

    let leatherStop0 = '#B2875C';
    let leatherStop40 = '#91653B';
    let leatherStop80 = '#704A26';
    let leatherStop100 = '#4A3018';
    let leatherHighlight = '#E2B88F';
    let leatherStroke = '#45230C';
    let leatherSeam = '#381D09';

    if (isWhiteOrCream) {
      leatherStop0 = '#FCFBF9';
      leatherStop40 = '#F3EFEA';
      leatherStop80 = '#E2DCD4';
      leatherStop100 = '#C8BFB3';
      leatherHighlight = '#FFFFFF';
      leatherStroke = '#B5ACA0';
      leatherSeam = '#A3998C';
    } else if (isWarmAmberOrOrange) {
      leatherStop0 = '#D97706';
      leatherStop40 = '#B45309';
      leatherStop80 = '#92400E';
      leatherStop100 = '#65290A';
      leatherHighlight = '#FBBF24';
      leatherStroke = '#45230C';
      leatherSeam = '#381D09';
    } else if (isGreige) {
      leatherStop0 = '#D4CECA';
      leatherStop40 = '#B0AAA2';
      leatherStop80 = '#8C857D';
      leatherStop100 = '#5A544F';
      leatherHighlight = '#EDE9E5';
      leatherStroke = '#68625B';
      leatherSeam = '#48433E';
    } else if (isDarkBrown) {
      leatherStop0 = '#804D2D';
      leatherStop40 = '#60381E';
      leatherStop80 = '#422412';
      leatherStop100 = '#2B160A';
      leatherHighlight = '#AB6E47';
      leatherStroke = '#251206';
      leatherSeam = '#1A0C04';
    }

    // 根据席位与角色自适应沙发构件 (双人位严格渲染 2 靠背，单人位渲染 1 靠背，三人位渲染 3 靠背)
    const is2Seat = productRole === 'sofa_2seat' || /2seat|two-seater|双人/i.test(productName);
    const is1Seat = productRole === 'recliner_1seat' || productRole === 'lounge_chair' || /1seat|single|单人|单椅/i.test(productName);

    let backrestsSvg = '';
    let cushionsSvg = '';
    let footrestLinesSvg = '';

    if (is1Seat) {
      backrestsSvg = `
        <rect x="440" y="845" width="320" height="235" rx="28" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
        <rect x="446" y="851" width="308" height="60" rx="20" fill="url(#leatherHighlightGrad)"/>
      `;
      cushionsSvg = `
        <rect x="450" y="1060" width="300" height="90" rx="20" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
      `;
      footrestLinesSvg = `
        <line x1="450" y1="1135" x2="750" y2="1135" stroke="${leatherSeam}" stroke-width="2" stroke-dasharray="4,3"/>
      `;
    } else if (is2Seat) {
      backrestsSvg = `
        <rect x="290" y="845" width="300" height="235" rx="26" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
        <rect x="296" y="851" width="288" height="60" rx="18" fill="url(#leatherHighlightGrad)"/>
        <rect x="610" y="845" width="300" height="235" rx="26" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
        <rect x="616" y="851" width="288" height="60" rx="18" fill="url(#leatherHighlightGrad)"/>
      `;
      cushionsSvg = `
        <rect x="300" y="1060" width="280" height="90" rx="18" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
        <rect x="620" y="1060" width="280" height="90" rx="18" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
      `;
      footrestLinesSvg = `
        <line x1="300" y1="1135" x2="580" y2="1135" stroke="${leatherSeam}" stroke-width="2" stroke-dasharray="4,3"/>
        <line x1="620" y1="1135" x2="900" y2="1135" stroke="${leatherSeam}" stroke-width="2" stroke-dasharray="4,3"/>
      `;
    } else {
      backrestsSvg = `
        <rect x="250" y="850" width="220" height="230" rx="24" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
        <rect x="254" y="854" width="212" height="60" rx="16" fill="url(#leatherHighlightGrad)"/>
        <rect x="490" y="845" width="220" height="235" rx="24" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
        <rect x="494" y="849" width="212" height="60" rx="16" fill="url(#leatherHighlightGrad)"/>
        <rect x="730" y="850" width="220" height="230" rx="24" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
        <rect x="734" y="854" width="212" height="60" rx="16" fill="url(#leatherHighlightGrad)"/>
      `;
      cushionsSvg = `
        <rect x="280" y="1060" width="200" height="90" rx="18" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
        <rect x="500" y="1060" width="200" height="90" rx="18" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
        <rect x="720" y="1060" width="200" height="90" rx="18" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
      `;
      footrestLinesSvg = `
        <line x1="280" y1="1135" x2="480" y2="1135" stroke="${leatherSeam}" stroke-width="2" stroke-dasharray="4,3"/>
        <line x1="500" y1="1135" x2="700" y2="1135" stroke="${leatherSeam}" stroke-width="2" stroke-dasharray="4,3"/>
        <line x1="720" y1="1135" x2="920" y2="1135" stroke="${leatherSeam}" stroke-width="2" stroke-dasharray="4,3"/>
      `;
    }

    // Camera DNA 物理镜头光心映射 (单变量原则: 仅相机动，家具与空间世界绝对不动)
    // 1. 焦距缩放比例 (以 35mm 为基准: 28mm 广角视角更宽, 45mm 黄金视角更饱满, 85mm 特写微距)
    const baseLens = 35;
    let cameraScale = camera.lensMm > 0 ? (camera.lensMm / baseLens) : 1.0;
    if (camera.lensMm <= 28) cameraScale = 0.82; // A01 大平层主全景，视域开阔
    else if (camera.lensMm >= 80) cameraScale = 1.65; // A04 特写微距

    // 2. 偏角 yaw 平移与透视偏转
    const yawOffset = (camera.yawDeg || 0) * 4.5;

    // 3. 机位高度与仰俯角对视平线的影响 (基准 130cm)
    const heightDelta = (130 - (camera.heightCm || 130)) * 1.5;
    const pitchOffset = (camera.pitchDeg || 0) * 8.0;
    const horizonShiftY = heightDelta + pitchOffset;

    // 4. 变体方案差异化光效与景深图层 (Variant 1~4)
    let ambientOverlay = '';
    let variantDescription = '标称物理机位 · 通透白昼漫射光';

    if (variantIndex === 2) {
      variantDescription = '高光暖阳微调 · 3200K 斜阳穿透与皮革金光';
      ambientOverlay = `
        <linearGradient id="warmSunRays" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.35"/>
          <stop offset="40%" stop-color="#FBBF24" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
        </linearGradient>
        <polygon points="1200,0 700,0 200,1600 1200,1600" fill="url(#warmSunRays)"/>
      `;
    } else if (variantIndex === 3) {
      variantDescription = '黄金微距景深 · f/1.8 大光圈柔焦与精工车线';
      ambientOverlay = `
        <radialGradient id="dofMask" cx="50%" cy="72%" r="48%">
          <stop offset="60%" stop-color="#FFFFFF" stop-opacity="0"/>
          <stop offset="100%" stop-color="#3C332A" stop-opacity="0.28"/>
        </radialGradient>
        <rect x="0" y="0" width="1200" height="1600" fill="url(#dofMask)"/>
      `;
    } else if (variantIndex === 4) {
      variantDescription = '建筑透视纵深 · 强化落地窗横梁与地面石材反差';
      ambientOverlay = `
        <linearGradient id="architecturalContrast" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1E293B" stop-opacity="0.22"/>
          <stop offset="50%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#0F172A" stop-opacity="0.3"/>
        </linearGradient>
        <rect x="0" y="0" width="1200" height="1600" fill="url(#architecturalContrast)"/>
      `;
    }

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1600" width="1200" height="1600">
  <defs>
    <!-- 空间建筑穹顶与天光渐变 -->
    <linearGradient id="skyCeiling" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#E8E4DF"/>
      <stop offset="60%" stop-color="#DAD4CC"/>
      <stop offset="100%" stop-color="#C5BEB4"/>
    </linearGradient>

    <!-- 地面天然灰微晶石 / 哑光木地板渐变 (保持 A00 材质不变量) -->
    <linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8E8880"/>
      <stop offset="40%" stop-color="#6F6961"/>
      <stop offset="100%" stop-color="#4C4740"/>
    </linearGradient>

    <!-- 敏华南美头层牛皮高定质感渐变 (严格遵循产品色彩真值: ${productColor}) -->
    <linearGradient id="leatherGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${leatherStop0}"/>
      <stop offset="40%" stop-color="${leatherStop40}"/>
      <stop offset="80%" stop-color="${leatherStop80}"/>
      <stop offset="100%" stop-color="${leatherStop100}"/>
    </linearGradient>

    <linearGradient id="leatherHighlightGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${leatherHighlight}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${leatherStop40}" stop-opacity="0.1"/>
    </linearGradient>

    <!-- 潘多拉微晶奢石茶几 (保持 A00 摆位与材质不变量) -->
    <linearGradient id="marbleGrad" x1="0" y1="0" x2="1" y2="0.5">
      <stop offset="0%" stop-color="#EFECE6"/>
      <stop offset="35%" stop-color="#D7CEBF"/>
      <stop offset="70%" stop-color="#C0B29D"/>
      <stop offset="100%" stop-color="#8F7E66"/>
    </linearGradient>

    <!-- 阴影与柔光扩散 -->
    <radialGradient id="ambientOcclusion" cx="50%" cy="85%" r="65%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.45"/>
      <stop offset="60%" stop-color="#000000" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>

    <!-- 窗外天际线散射光 -->
    <linearGradient id="windowLight" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.88"/>
      <stop offset="50%" stop-color="#F5EFE6" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- 1. 背景层：大平层建筑结构与挑高挑空 (A00 空间世界继承) -->
  <rect x="0" y="0" width="1200" height="1600" fill="url(#skyCeiling)"/>

  <!-- 2. 远景：落地全景落地窗与采光幕墙 (按视平线平移) -->
  <g transform="translate(0, ${horizonShiftY * 0.3})">
    <rect x="160" y="170" width="880" height="680" fill="#E2DDDA" rx="8"/>
    <rect x="170" y="180" width="860" height="660" fill="url(#windowLight)" rx="6"/>
    <line x1="450" y1="180" x2="450" y2="840" stroke="#78716C" stroke-width="4"/>
    <line x1="750" y1="180" x2="750" y2="840" stroke="#78716C" stroke-width="4"/>
  </g>

  <!-- 3. 地面微晶石地坪 (视平线基线) -->
  <polygon points="0,${960 + horizonShiftY} 1200,${960 + horizonShiftY} 1200,1600 0,1600" fill="url(#floorGrad)"/>

  <!-- 4. 镜头空间透视组合 (以中心原点 600, 1150 执行 Camera DNA 缩放与平移偏角) -->
  <g transform="translate(${600 - yawOffset}, ${1150 + horizonShiftY}) scale(${cameraScale}) translate(-600, -1150)">
    <!-- 4.1 高定羊毛手工地毯 -->
    <ellipse cx="600" cy="1260" rx="460" ry="170" fill="#CCC5BA" stroke="#B8B0A2" stroke-width="2"/>

    <!-- 4.2 产品主环境阴影 -->
    <ellipse cx="600" cy="1280" rx="420" ry="110" fill="url(#ambientOcclusion)"/>

    <!-- 4.3 敏华主件头等舱功能沙发 (物理真值不变量: ${productName} · 色系: ${productColor}) -->
    <!-- 底座骨架 -->
    <rect x="230" y="1040" width="740" height="150" rx="28" fill="url(#leatherGrad)"/>
    
    <!-- 人体工学靠背 (自适应席位) -->
    ${backrestsSvg}

    <!-- 左厚实扶手 -->
    <rect x="200" y="960" width="90" height="210" rx="36" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
    <rect x="205" y="965" width="80" height="80" rx="24" fill="url(#leatherHighlightGrad)"/>

    <!-- 右厚实扶手 -->
    <rect x="910" y="960" width="90" height="210" rx="36" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
    <rect x="915" y="965" width="80" height="80" rx="24" fill="url(#leatherHighlightGrad)"/>

    <!-- 座垫加厚承托层与精工车缝线 (自适应席位) -->
    ${cushionsSvg}

    <!-- 电动脚托缝线指示线 (自适应席位) -->
    ${footrestLinesSvg}

    <!-- 4.4 潘多拉天然微晶奢石茶几 (位置拓扑对齐锁死) -->
    <ellipse cx="600" cy="1330" rx="190" ry="60" fill="url(#marbleGrad)" stroke="#9C8B77" stroke-width="2"/>
    <ellipse cx="600" cy="1330" rx="160" ry="40" fill="#F8F6F2" opacity="0.6"/>
  </g>

  <!-- 5. 变体差异化光效与景深遮罩层 -->
  ${ambientOverlay}

  <!-- 6. 统一工程铭牌与 A00 继承物理真值水印 -->
  <rect x="30" y="30" width="460" height="106" rx="14" fill="#1C1917" opacity="0.88"/>
  <text x="50" y="58" fill="#F59E0B" font-size="14" font-weight="bold" font-family="sans-serif">MANWAH SPATIAL CAMERA · ${shotCode} [工程矢量底模 · 待配生图API]</text>
  <text x="50" y="80" fill="#E7E5E4" font-size="11" font-family="sans-serif">${productName.slice(0, 22)} · ${productColor || '真值锁定'}</text>
  <text x="50" y="98" fill="#A8A29E" font-size="10" font-family="monospace">DNA: ${camera.lensMm}mm | H: ${camera.heightCm}cm | YAW: ${camera.yawDeg}° | PITCH: ${camera.pitchDeg}°</text>
  <text x="50" y="118" fill="#10B981" font-size="9.5" font-family="sans-serif">✓ 空间与家具世界锁定 (A00 Master Invariance Enforced)</text>
</svg>`;

    return Buffer.from(svg, 'utf-8');
  }
}
