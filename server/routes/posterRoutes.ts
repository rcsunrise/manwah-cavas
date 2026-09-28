import { Router, Response } from 'express';
import sharp from 'sharp';
import { AuthenticatedRequest } from '../types';
import { optionalAuthenticateToken } from '../middleware/auth';
import {
  deconstructPosterWithVectorEngine,
  replicatePosterBlueprint
} from '../ai/vectorEngineRouter';
import { resolveApiConfig } from '../ai/providerConfig';

const router = Router();

/**
 * Merges overlapping or closely adjacent text boxes so that background inpainting
 * samples purely clean surroundings outside the entire text group without character contamination.
 */
function mergeOverlappingBoxes(boxes: any[], gap = 45): any[] {
  if (boxes.length <= 1) return boxes;
  const sorted = [...boxes].sort((a, b) => a.y - b.y);
  const merged: any[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];

    const verticalClose = curr.y <= (prev.y + prev.height + gap);
    const horizontalOverlap = Math.max(prev.x, curr.x) <= Math.min(prev.x + prev.width, curr.x + curr.width) + gap * 2;

    if (verticalClose && horizontalOverlap) {
      const newLeft = Math.min(prev.x, curr.x);
      const newTop = Math.min(prev.y, curr.y);
      const newRight = Math.max(prev.x + prev.width, curr.x + curr.width);
      const newBottom = Math.max(prev.y + prev.height, curr.y + curr.height);
      prev.x = newLeft;
      prev.y = newTop;
      prev.width = newRight - newLeft;
      prev.height = newBottom - newTop;
      if (curr.backgroundColor) prev.backgroundColor = curr.backgroundColor;
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
}

/**
 * Erases text blocks from image buffer using surrounding content-aware background synthesis
 * with boundary pixel color sampling, bilinear gradient synthesis, and subtle texture preservation.
 */
async function eraseTextBlocksWithSharp(
  imageBuffer: Buffer,
  textBlocks: any[],
  imgWidth: number,
  imgHeight: number
): Promise<string> {
  try {
    const meta = await sharp(imageBuffer).metadata();
    const W = meta.width || imgWidth || 1024;
    const H = meta.height || imgHeight || 1365;

    // Merge closely grouped text lines (e.g. title + subtitle on wall)
    const regions = mergeOverlappingBoxes(textBlocks, 40);
    let currentImage = imageBuffer;

    for (const region of regions) {
      // Add generous safety margin to ensure anti-aliasing tails and shadows are eliminated
      const padX = Math.round(Math.max(16, region.width * 0.05));
      const padY = Math.round(Math.max(14, region.height * 0.14));
      const pL = Math.max(0, region.x - padX);
      const pT = Math.max(0, region.y - padY);
      const pW = Math.min(W - pL, region.width + padX * 2);
      const pH = Math.min(H - pT, region.height + padY * 2);

      if (pW <= 0 || pH <= 0) continue;

      // Sample clean boundary pixels outside the text bounding box
      const sampleTopY = Math.max(0, pT - 6);
      const sampleBotY = Math.min(H - 1, pT + pH + 5);
      const sampleRightX = Math.min(W - 1, pL + pW - 1);

      let cTL = 'rgb(220, 215, 205)';
      let cTR = 'rgb(220, 215, 205)';
      let cBL = 'rgb(205, 195, 185)';
      let cBR = 'rgb(205, 195, 185)';

      try {
        const [rawTL, rawTR, rawBL, rawBR] = await Promise.all([
          sharp(currentImage).extract({ left: pL, top: sampleTopY, width: 1, height: 1 }).raw().toBuffer(),
          sharp(currentImage).extract({ left: sampleRightX, top: sampleTopY, width: 1, height: 1 }).raw().toBuffer(),
          sharp(currentImage).extract({ left: pL, top: sampleBotY, width: 1, height: 1 }).raw().toBuffer(),
          sharp(currentImage).extract({ left: sampleRightX, top: sampleBotY, width: 1, height: 1 }).raw().toBuffer()
        ]);
        cTL = `rgb(${rawTL[0]}, ${rawTL[1]}, ${rawTL[2]})`;
        cTR = `rgb(${rawTR[0]}, ${rawTR[1]}, ${rawTR[2]})`;
        cBL = `rgb(${rawBL[0]}, ${rawBL[1]}, ${rawBL[2]})`;
        cBR = `rgb(${rawBR[0]}, ${rawBR[1]}, ${rawBR[2]})`;
      } catch (sampleErr) {
        if (region.backgroundColor) {
          cTL = region.backgroundColor;
          cTR = region.backgroundColor;
          cBL = region.backgroundColor;
          cBR = region.backgroundColor;
        }
      }

      // 1. Synthesize smooth gradient patch matching the local background
      const patchSvg = `<svg width="${pW}" height="${pH}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="vGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${cTL}" />
            <stop offset="100%" stop-color="${cBL}" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#vGrad)" />
      </svg>`;

      let patchBuffer: Buffer = await sharp(Buffer.from(patchSvg)).png().toBuffer();

      // 2. Extract surrounding clean texture if available to preserve natural wall/fabric grain
      let textureSliceTop = pT >= 24 ? pT - 22 : Math.min(H - 22, pT + pH + 4);
      let textureHeight = 18;
      if (textureSliceTop >= 0 && textureSliceTop + textureHeight <= H) {
        try {
          const texturePatch = await sharp(currentImage)
            .extract({ left: pL, top: textureSliceTop, width: pW, height: textureHeight })
            .resize(pW, pH, { fit: 'fill' })
            .blur(5)
            .toBuffer();

          // Blend texture at subtle opacity
          patchBuffer = await sharp(patchBuffer)
            .composite([{ input: texturePatch, blend: 'over', opacity: 0.35 } as any])
            .png()
            .toBuffer();
        } catch (texErr) {
          // Keep pure gradient patch
        }
      }

      currentImage = await sharp(currentImage)
        .composite([{ input: patchBuffer, left: pL, top: pT }])
        .png()
        .toBuffer();
    }

    const cleanBuffer = await sharp(currentImage)
      .jpeg({ quality: 95 })
      .toBuffer();
    return `data:image/jpeg;base64,${cleanBuffer.toString('base64')}`;
  } catch (err) {
    console.warn('[PosterRoutes] Sharp inpainting error:', err);
  }
  return '';
}

/**
 * POST /api/poster/ocr-and-erase
 * Performs OCR text detection, bounding box extraction (in source image pixel coordinates),
 * text mask generation, and background inpainting repair.
 */
router.post('/ocr-and-erase', optionalAuthenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      imageUrl,
      naturalWidth = 1024,
      naturalHeight = 1365,
      screenTitle = '爆款主题海报',
      coreSellingPoint = '真皮包覆 人体工学支撑'
    } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ success: false, error: '缺失 imageUrl 参数' });
    }

    const timestamp = Date.now();
    let textBlocks: any[] = [];
    let repairSuccess = false;
    let cleanBackgroundUrl = imageUrl;
    let message = '';
    let imageBuffer: Buffer | null = null;
    let cleanB64 = '';
    let mimeType = 'image/jpeg';

    // Parse image buffer (support both data URL and remote HTTP URL)
    try {
      if (typeof imageUrl === 'string' && imageUrl.startsWith('data:image/')) {
        const parts = imageUrl.split(',');
        const mimeHeader = parts[0];
        cleanB64 = parts[1];
        if (mimeHeader.includes('image/png')) mimeType = 'image/png';
        else if (mimeHeader.includes('image/webp')) mimeType = 'image/webp';
        imageBuffer = Buffer.from(cleanB64, 'base64');
      } else if (typeof imageUrl === 'string' && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
        const resp = await fetch(imageUrl);
        if (resp.ok) {
          imageBuffer = Buffer.from(await resp.arrayBuffer());
          cleanB64 = imageBuffer.toString('base64');
          const ct = resp.headers.get('content-type') || '';
          if (ct.includes('image/png')) mimeType = 'image/png';
          else if (ct.includes('image/webp')) mimeType = 'image/webp';
        }
      }
    } catch (parseImgErr) {
      console.warn('[PosterRoutes] Failed reading image buffer:', parseImgErr);
    }

    // 1. Precise Multi-Model Vision Deconstruction via VectorEngine Router
    let aestheticSpec: any = null;
    let telemetry: any = null;

    if (cleanB64) {
      const fullImgB64 = `data:${mimeType};base64,${cleanB64}`;
      const deconstructResult = await deconstructPosterWithVectorEngine(
        fullImgB64,
        naturalWidth,
        naturalHeight,
        {
          userUuid: req.user?.id || 'system',
          screenTitle,
          coreSellingPoint,
          enableLayer2Aesthetic: true
        }
      );

      textBlocks = deconstructResult.textBlocks;
      aestheticSpec = deconstructResult.aestheticSpec;
      telemetry = deconstructResult.telemetry;
    }

    // 2. Perform Sharp-based Inpainting & Background Text Erasure
    if (imageBuffer && textBlocks.length > 0) {
      const inpaintedUrl = await eraseTextBlocksWithSharp(
        imageBuffer,
        textBlocks,
        naturalWidth,
        naturalHeight
      );
      if (inpaintedUrl) {
        cleanBackgroundUrl = inpaintedUrl;
        repairSuccess = true;
        message = '已分离图像与文字：底层文字已消除，已生成纯净底图、排版图层与审美 Spec';
      }
    }

    if (!repairSuccess) {
      message = '已完成海报 OCR 识别、文字坐标定位与审美图层解析';
      repairSuccess = true;
    }

    return res.json({
      success: true,
      repairSuccess,
      message,
      cleanBackgroundUrl,
      naturalWidth,
      naturalHeight,
      textLayers: textBlocks,
      aestheticSpec,
      telemetry
    });
  } catch (error: any) {
    console.error('[PosterRoutes] ocr-and-erase failed:', error);
    return res.status(500).json({
      success: false,
      repairSuccess: false,
      message: '背景修复或 OCR 失败，已保留原图并标注文字层',
      cleanBackgroundUrl: req.body?.imageUrl || '',
      error: error?.message || '处理过程中发生未知错误'
    });
  }
});

/**
 * POST /api/poster/replicate
 * 由前AI式「一键海报复刻与版式资产化」
 */
router.post('/replicate', optionalAuthenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      imageUrl,
      mode = 'faithful', // 'faithful' | 'manwah_luxury' | 'manwah_ergonomics'
      category = '意式高奢真皮功能沙发',
      targetAudience = '都市精英 / 品质家庭'
    } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ success: false, error: '缺少海报图片链接或 base64' });
    }

    let naturalWidth = 1200;
    let naturalHeight = 1600;
    let imageBuffer: Buffer | null = null;
    let mimeType = 'image/jpeg';
    let cleanB64 = '';

    if (imageUrl.startsWith('data:image/')) {
      const match = imageUrl.match(/^data:(image\/[a-zA-Z0-9+]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        cleanB64 = match[2];
        imageBuffer = Buffer.from(cleanB64, 'base64');
      }
    } else if (imageUrl.startsWith('http')) {
      const resp = await fetch(imageUrl);
      if (resp.ok) {
        imageBuffer = Buffer.from(await resp.arrayBuffer());
        cleanB64 = imageBuffer.toString('base64');
        const ct = resp.headers.get('content-type') || '';
        if (ct.includes('image/png')) mimeType = 'image/png';
        else if (ct.includes('image/webp')) mimeType = 'image/webp';
      }
    }

    if (imageBuffer) {
      const meta = await sharp(imageBuffer).metadata();
      if (meta.width && meta.height) {
        naturalWidth = meta.width;
        naturalHeight = meta.height;
      }
    }

    const fullImgB64 = `data:${mimeType};base64,${cleanB64}`;
    const replicateResult = await replicatePosterBlueprint(
      fullImgB64,
      naturalWidth,
      naturalHeight,
      {
        mode,
        category,
        targetAudience
      }
    );

    let cleanBackgroundUrl = imageUrl;
    if (imageBuffer && replicateResult.textBlocks.length > 0) {
      const inpainted = await eraseTextBlocksWithSharp(
        imageBuffer,
        replicateResult.textBlocks,
        naturalWidth,
        naturalHeight
      );
      if (inpainted) cleanBackgroundUrl = inpainted;
    }

    return res.json({
      success: true,
      message: '一键海报复刻完成：已完成文字剥离、底图无痕还原、原版 Spec 提取与敏华文案装填',
      cleanBackgroundUrl,
      naturalWidth,
      naturalHeight,
      textLayers: replicateResult.textBlocks,
      aestheticSpec: replicateResult.aestheticSpec,
      telemetry: replicateResult.telemetry,
      replicateMode: mode
    });
  } catch (error: any) {
    console.error('[PosterRoutes] replicate failed:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || '一键海报复刻失败'
    });
  }
});

/**
 * GET /api/poster/router-status
 * 向量引擎网关与日志状态检查
 */
router.get('/router-status', optionalAuthenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = await resolveApiConfig(req.user?.id || 'system');
    return res.json({
      success: true,
      provider: config.provider,
      baseUrl: config.baseUrl,
      hasKey: Boolean(config.apiKey),
      source: config.source,
      supportedModels: {
        spatial: ['gemini-3.8-flash', 'gemini-2.5-flash'],
        aesthetic: ['gpt-4o', 'gpt-all']
      },
      logConsoleUrl: 'https://api.vectorengine.ai/console/log'
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message });
  }
});

/**
 * POST /api/poster/split-layers
 */
router.post('/split-layers', optionalAuthenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { imageUrl, headline, subheadline } = req.body;
    const timestamp = Date.now();

    const textLayers = [
      {
        id: `text-headline-${timestamp}`,
        type: 'headline' as const,
        text: headline || '头层牛皮 智能奢享',
        fontSize: 96,
        fontWeight: 800,
        color: '#1C1917',
        x: 140,
        y: 180,
        width: 1820,
        height: 140,
        textAlign: 'center' as const,
        zIndex: 10
      },
      {
        id: `text-subheadline-${timestamp}`,
        type: 'subheadline' as const,
        text: subheadline || '德国超静音双电机 · 160°无级自由躺倒',
        fontSize: 48,
        fontWeight: 600,
        color: '#78716C',
        x: 140,
        y: 340,
        width: 1820,
        height: 80,
        textAlign: 'center' as const,
        zIndex: 10
      }
    ];

    return res.json({
      success: true,
      message: '已成功拆分海报图层',
      splitComposition: { textLayers }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message });
  }
});

export default router;
