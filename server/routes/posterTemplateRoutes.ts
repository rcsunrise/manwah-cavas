import { Router, Response } from 'express';
import sharp from 'sharp';
import { AuthenticatedRequest } from '../types';
import { optionalAuthenticateToken } from '../middleware/auth';
import { VideoSourceImageResolver } from '../services/video/videoSourceImageResolver';
import { requestGatewayImage } from '../services/spaceImageGenerationService';
import { buildTemplateAHeroPrompt, generatePosterConcept, sanitizeConcept, UsedPosterConcept } from '../services/posterTemplate/posterConcept';
import { cropDetail, locateDetails } from '../services/posterTemplate/detailCrop';
import { composeTemplateA, TEMPLATE_A_DETAIL_ASPECT } from '../services/posterTemplate/templateA';
import { buildFabricPillowPrompt, FABRIC_SOFA_PROMPT, generateFabricConcept, sanitizeFabricConcept } from '../services/posterTemplate/fabricConcept';
import {
  centerSquare,
  composeFabricPoster,
  cutoutWhiteBackground,
  cutoutWhiteBackgroundWithBox,
  FabricLayoutId,
  flattenSwatch,
  flattestSquare,
  moodAspectFor,
  moodIndexesFor
} from '../services/posterTemplate/fabricPoster';

/**
 * 模板海报（原型）：概念 → 主场景底图 → 细节裁切 + 真实字体排版。
 * 三步分开调用，前端可以逐步显示进度，也可以只换文案重新排版而不重新出图。
 *
 *   POST /api/poster-templates/concept           生成命名、场景、细节三格与文案
 *   POST /api/poster-templates/template-a/hero   按概念出主场景底图（只画场景，留出标题位）
 *   POST /api/poster-templates/template-a/compose 定位细节部位、裁切、排版合成
 */
const router = Router();
router.use(optionalAuthenticateToken as any);

const DEFAULT_HERO_MODEL = 'gpt-image-2.6-flare-c';

function userIdOf(req: AuthenticatedRequest): string {
  return req.user?.id || (req.headers['x-user-uuid'] as string) || 'system';
}

/** 服务端会去读这些图：只接受 data URL、本服务画布资产、本项目 Supabase 公开桶，防止被用来探测内网 */
export function isAllowedImageSource(input: unknown): input is string {
  if (typeof input !== 'string') return false;
  const u = input.trim();
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(u)) return true;
  if (u.length > 2000) return false;
  if (u.startsWith('/api/canvases/assets/') && !u.includes('..')) return true;
  try {
    const storageHost = new URL(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').host;
    const parsed = new URL(u);
    return parsed.protocol === 'https:' && Boolean(storageHost) && parsed.host === storageHost && parsed.pathname.startsWith('/storage/v1/object/public/');
  } catch {
    return false;
  }
}

async function loadImage(input: unknown, label: string): Promise<Buffer> {
  if (!isAllowedImageSource(input)) {
    const err: any = new Error(`${label}地址无效或不在允许范围内`);
    err.statusCode = 400;
    throw err;
  }
  const { buffer } = await VideoSourceImageResolver.loadImageBuffer(input);
  return buffer;
}

function sendError(res: Response, err: any, fallback: string) {
  const status = err?.statusCode || 500;
  console.warn(`[PosterTemplateRoutes] ${fallback}:`, err?.message || err);
  res.status(status).json({ success: false, error: { message: err?.message || fallback } });
}

router.post('/concept', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { productImage, dna, hint, planContext, used } = req.body || {};
    // 同一产品已出过的海报（只取需要的字段，最多 12 条）
    const usedConcepts: UsedPosterConcept[] = Array.isArray(used)
      ? used
          .filter((u: any) => u && typeof u.name === 'string' && u.name.trim())
          .slice(-12)
          .map((u: any) => ({
            name: String(u.name).slice(0, 8),
            idea: typeof u.idea === 'string' ? u.idea.slice(0, 80) : undefined,
            sceneDirection: typeof u.sceneDirection === 'string' ? u.sceneDirection.slice(0, 40) : undefined
          }))
      : [];
    let product: { data: string; mimeType: string } | undefined;
    if (productImage) {
      const buf = await loadImage(productImage, '产品图');
      const small = await sharp(buf, { failOn: 'none' }).rotate().resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      product = { data: small.toString('base64'), mimeType: 'image/jpeg' };
    }
    const concept = await generatePosterConcept(
      {
        dna,
        productImage: product,
        hint: typeof hint === 'string' ? hint.slice(0, 500) : undefined,
        planContext: typeof planContext === 'string' ? planContext.slice(0, 1500) : undefined,
        used: usedConcepts
      },
      userIdOf(req)
    );
    res.json({ success: true, concept });
  } catch (err: any) {
    sendError(res, err, '生成海报概念失败');
  }
});

router.post('/template-a/hero', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { concept: rawConcept, productImage, dna, model, resolution } = req.body || {};
    if (!rawConcept) return res.status(400).json({ success: false, error: { message: '缺少海报概念 concept' } });
    const concept = sanitizeConcept(rawConcept);
    const product = await loadImage(productImage, '产品图');
    const productJpeg = await sharp(product, { failOn: 'none' }).rotate().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
    const prompt = buildTemplateAHeroPrompt(concept, dna);
    const usedModel = typeof model === 'string' && model.trim() ? model.trim() : DEFAULT_HERO_MODEL;
    const image = await requestGatewayImage({
      prompt,
      model: usedModel,
      images: [{ data: `data:image/jpeg;base64,${productJpeg.toString('base64')}`, mimeType: 'image/jpeg', role: 'primary_product' }],
      aspectRatio: '16:9',
      resolution: resolution === '1K' || resolution === '4K' ? resolution : '2K',
      userId: userIdOf(req),
      deptId: req.headers['x-dept-id'] as string | undefined,
      timeoutMs: 300000
    });
    const png = await sharp(image, { failOn: 'none' }).rotate().png().toBuffer();
    const meta = await sharp(png).metadata();
    res.json({
      success: true,
      imageDataUrl: `data:image/png;base64,${png.toString('base64')}`,
      width: meta.width,
      height: meta.height,
      model: usedModel,
      prompt
    });
  } catch (err: any) {
    sendError(res, err, '生成主场景底图失败');
  }
});

router.post('/template-a/compose', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { heroImage, concept: rawConcept, outputScale } = req.body || {};
    if (!rawConcept) return res.status(400).json({ success: false, error: { message: '缺少海报概念 concept' } });
    const concept = sanitizeConcept(rawConcept);
    const hero = await loadImage(heroImage, '主场景底图');

    // 同一次视觉调用里顺带框出产品整体，排版时标题避开它
    const PRODUCT_KEY = '__product';
    const { details: allLocated, warnings } = await locateDetails(
      hero,
      [
        ...concept.details.map(d => ({ key: d.key, locate: d.locate })),
        { key: PRODUCT_KEY, locate: '画面中的主角沙发整体（从靠背顶部到沙发脚、从一侧扶手外沿到另一侧扶手外沿）' }
      ],
      userIdOf(req)
    );
    const productLocated = allLocated.find(d => d.key === PRODUCT_KEY);
    const located = allLocated.filter(d => d.key !== PRODUCT_KEY);
    const crops = await Promise.all(located.map(d => cropDetail(hero, d.box, TEMPLATE_A_DETAIL_ASPECT)));
    const result = await composeTemplateA({
      hero,
      outputScale: Number(outputScale) === 2 ? 2 : 1,
      title: { name: concept.name, subtitle: concept.subtitle, inspiration: concept.inspiration },
      titleSide: concept.titleSide,
      accentColor: concept.accentColor,
      stripColor: concept.stripColor,
      details: concept.details.map((d, i) => ({ image: crops[i], title: d.title, desc: d.desc })),
      productBox: productLocated?.source === 'vision' ? productLocated.box : undefined
    });
    res.json({
      success: true,
      imageDataUrl: `data:image/jpeg;base64,${result.buffer.toString('base64')}`,
      width: result.width,
      height: result.height,
      layout: result.layout,
      details: located,
      productBox: productLocated?.source === 'vision' ? productLocated.box : null,
      warnings: warnings.filter(w => !w.includes('主角沙发整体'))
    });
  } catch (err: any) {
    sendError(res, err, '模板排版合成失败');
  }
});

/* ───────── 模板 B：沙发面料海报（版式见 fabricPoster.ts，参考图 1、2） ─────────
 *   POST /fabric/concept  看沙发图，给出皮革色、抱枕图案、4 条氛围照描述（失败回退默认方案）
 *   POST /fabric/sofa     沙发改成纯白底（出图，耗点数）
 *   POST /fabric/pillow   生成一对同色系抱枕（出图，耗点数）
 *   POST /fabric/mood     生成第 shotIndex 张氛围照（出图，耗点数）
 *   POST /fabric/compose  抠图、定位细节、取色卡、排版合成
 */
const FABRIC_LAYOUT_IDS: FabricLayoutId[] = ['collage4', 'hero3'];
function layoutOf(value: unknown): FabricLayoutId {
  return FABRIC_LAYOUT_IDS.includes(value as FabricLayoutId) ? (value as FabricLayoutId) : 'collage4';
}

async function fabricImage(
  req: AuthenticatedRequest,
  opts: { prompt: string; aspectRatio: string; model?: unknown; resolution?: unknown; images?: Buffer[] }
) {
  const model = typeof opts.model === 'string' && opts.model.trim() ? opts.model.trim() : DEFAULT_HERO_MODEL;
  const image = await requestGatewayImage({
    prompt: opts.prompt,
    model,
    images: (opts.images || []).map(b => ({ data: `data:image/jpeg;base64,${b.toString('base64')}`, mimeType: 'image/jpeg', role: 'primary_product' })),
    aspectRatio: opts.aspectRatio,
    resolution: opts.resolution === '1K' || opts.resolution === '4K' ? (opts.resolution as string) : '2K',
    userId: userIdOf(req),
    deptId: req.headers['x-dept-id'] as string | undefined,
    timeoutMs: 300000
  });
  const png = await sharp(image, { failOn: 'none' }).rotate().png().toBuffer();
  const meta = await sharp(png).metadata();
  return { imageDataUrl: `data:image/png;base64,${png.toString('base64')}`, width: meta.width, height: meta.height, model };
}

router.post('/fabric/concept', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { productImage, hint, used } = req.body || {};
    const buf = await loadImage(productImage, '沙发图');
    // 同一沙发已出过的氛围照方向 id，新海报避开它们
    const usedIds: string[] = Array.isArray(used) ? used.filter((x: unknown) => typeof x === 'string').slice(-30).map((x: string) => x.slice(0, 24)) : [];
    const { concept, fromModel } = await generateFabricConcept(buf, typeof hint === 'string' ? hint : undefined, userIdOf(req), usedIds);
    res.json({ success: true, concept, fromModel });
  } catch (err: any) {
    sendError(res, err, '生成面料海报概念失败');
  }
});

router.post('/fabric/sofa', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { productImage, model, resolution } = req.body || {};
    const product = await loadImage(productImage, '沙发图');
    const jpeg = await sharp(product, { failOn: 'none' }).rotate().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
    const out = await fabricImage(req, { prompt: FABRIC_SOFA_PROMPT, aspectRatio: '3:2', model, resolution, images: [jpeg] });
    res.json({ success: true, ...out });
  } catch (err: any) {
    sendError(res, err, '沙发改白底失败');
  }
});

router.post('/fabric/pillow', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { concept: rawConcept, model, resolution } = req.body || {};
    if (!rawConcept) return res.status(400).json({ success: false, error: { message: '缺少海报概念 concept' } });
    const concept = sanitizeFabricConcept(rawConcept);
    const out = await fabricImage(req, { prompt: buildFabricPillowPrompt(concept), aspectRatio: '1:1', model, resolution });
    res.json({ success: true, ...out });
  } catch (err: any) {
    sendError(res, err, '生成抱枕失败');
  }
});

router.post('/fabric/mood', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { concept: rawConcept, shotIndex, layout, model, resolution } = req.body || {};
    if (!rawConcept) return res.status(400).json({ success: false, error: { message: '缺少海报概念 concept' } });
    const concept = sanitizeFabricConcept(rawConcept);
    const index = Number(shotIndex);
    if (!Number.isInteger(index) || index < 0 || index >= concept.moodShots.length) {
      return res.status(400).json({ success: false, error: { message: 'shotIndex 无效' } });
    }
    const out = await fabricImage(req, {
      prompt: concept.moodShots[index].prompt,
      aspectRatio: moodAspectFor(layoutOf(layout), index),
      model,
      resolution
    });
    res.json({ success: true, shotIndex: index, ...out });
  } catch (err: any) {
    sendError(res, err, '生成氛围照失败');
  }
});

router.post('/fabric/compose', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sofaImage, pillowImage, moodImages, concept: rawConcept, layout: rawLayout, code, label, outputScale, pillowScale } = req.body || {};
    if (!rawConcept) return res.status(400).json({ success: false, error: { message: '缺少海报概念 concept' } });
    const concept = sanitizeFabricConcept(rawConcept);
    const layout = layoutOf(rawLayout);
    const sofaRaw = await loadImage(sofaImage, '白底沙发图');
    const { buffer: sofa, box: sofaBox } = await cutoutWhiteBackgroundWithBox(sofaRaw);
    const pillows = pillowImage ? await cutoutWhiteBackground(await loadImage(pillowImage, '抱枕图')) : undefined;

    // moodImages 按 MOOD_SHOT_ORDER 的下标给，版式只取自己需要的几张
    const moodList: unknown[] = Array.isArray(moodImages) ? moodImages : [];
    const photos = await Promise.all(
      moodIndexesFor(layout).map(async i => (isAllowedImageSource(moodList[i]) ? loadImage(moodList[i], `氛围照${i + 1}`) : undefined))
    );

    // 细节与色卡都取自沙发本体（在沙发图上定位，不带抱枕）
    const SEAT_KEY = '__seat';
    const { details: located, warnings } = await locateDetails(
      sofaRaw,
      [
        ...concept.details.map(d => ({ key: d.key, locate: d.locate })),
        { key: SEAT_KEY, locate: '沙发最右侧那个座位的座面（人坐的那块水平面，只框座垫上表面，不要框靠背、扶手和座垫前侧的竖直立面）' }
      ],
      userIdOf(req)
    );
    const circles = await Promise.all(
      located.filter(d => d.key !== SEAT_KEY).map(d => cropDetail(sofaRaw, d.box, 1))
    );
    // 皮革色卡：在沙发抠图上找最平的一块（避开缝线和接缝），去掉明暗后做纯平底色
    const leather = await flattenSwatch(await flattestSquare(sofa));
    const pillowSwatch = pillows ? await centerSquare(pillows, 0.4) : undefined;

    // 座面框换算到“裁掉空白边后的沙发图”坐标；视觉没找到（兜底框）就不用，改按版式比例 + 轮廓兜底
    const seatLoc = located.find(d => d.key === SEAT_KEY);
    const seat =
      seatLoc && seatLoc.source === 'vision'
        ? (() => {
            const px = seatLoc.box.left * sofaBox.srcWidth - sofaBox.left;
            const py = seatLoc.box.top * sofaBox.srcHeight - sofaBox.top;
            const pw = seatLoc.box.width * sofaBox.srcWidth;
            const ph = seatLoc.box.height * sofaBox.srcHeight;
            const r = { x: px / sofaBox.width, y: py / sofaBox.height, w: pw / sofaBox.width, h: ph / sofaBox.height };
            const ok = r.x > -0.05 && r.y > -0.05 && r.w > 0.04 && r.h > 0.03 && r.x + r.w < 1.05 && r.y + r.h < 1.05;
            return ok ? { x: Math.max(0, r.x), y: Math.max(0, r.y), w: Math.min(1, r.w), h: Math.min(1, r.h) } : undefined;
          })()
        : undefined;

    const result = await composeFabricPoster({
      layout,
      sofa,
      seat,
      pillows,
      photos,
      circles,
      swatches: [leather, pillowSwatch],
      code: typeof code === 'string' ? code.slice(0, 24) : '',
      label: typeof label === 'string' ? label.slice(0, 24) : '',
      pillowScale: Number.isFinite(Number(pillowScale)) ? Number(pillowScale) : undefined,
      outputScale: Number(outputScale) === 2 ? 2 : 1
    });
    res.json({
      success: true,
      imageDataUrl: `data:image/jpeg;base64,${result.buffer.toString('base64')}`,
      width: result.width,
      height: result.height,
      layout: result.layout,
      details: located.filter(d => d.key !== SEAT_KEY),
      seat: seat || null,
      warnings
    });
  } catch (err: any) {
    sendError(res, err, '面料海报合成失败');
  }
});

export default router;
