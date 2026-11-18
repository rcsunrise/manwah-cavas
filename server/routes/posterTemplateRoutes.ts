import { Router, Response } from 'express';
import sharp from 'sharp';
import { AuthenticatedRequest } from '../types';
import { optionalAuthenticateToken } from '../middleware/auth';
import { VideoSourceImageResolver } from '../services/video/videoSourceImageResolver';
import { requestGatewayImage } from '../services/spaceImageGenerationService';
import { buildTemplateAHeroPrompt, generatePosterConcept, sanitizeConcept, UsedPosterConcept } from '../services/posterTemplate/posterConcept';
import { cropDetail, locateDetails, refineDetails } from '../services/posterTemplate/detailCrop';
import { composeTemplateA, TEMPLATE_A_DETAIL_ASPECT } from '../services/posterTemplate/templateA';
import { buildFabricPillowPrompt, FABRIC_SOFA_PROMPT, generateFabricConcept, sanitizeFabricConcept } from '../services/posterTemplate/fabricConcept';
import { generateTextileConcept, sanitizeTextileConcept } from '../services/posterTemplate/textileConcept';
import { composeTextilePoster, deriveBackground, TEXTILE_MAX_SWATCHES, textileLayoutOf, textileMoodAspectFor } from '../services/posterTemplate/textilePoster';
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

/** 用户随消息附的图（最多 4 张）：按需缩放成 JPEG；读不了的跳过但保留位置，序号和概念里的 photo 对得上 */
const MAX_ATTACHMENTS = 4;
async function loadAttachments(input: unknown, maxEdge: number, quality: number): Promise<Array<Buffer | null>> {
  const list = Array.isArray(input) ? input.filter(x => typeof x === 'string' && x).slice(0, MAX_ATTACHMENTS) : [];
  return Promise.all(
    list.map(async (src, i) => {
      try {
        const buf = await loadImage(src, `附图${i + 1}`);
        return await sharp(buf, { failOn: 'none' }).rotate().resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality, chromaSubsampling: '4:4:4' }).toBuffer();
      } catch (err: any) {
        console.warn(`[PosterTemplate] 附图${i + 1} 读取失败，跳过:`, err?.message || err);
        return null;
      }
    })
  );
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
    const { productImage, referenceImage, dna, hint, planContext, used } = req.body || {};
    // 同一产品已出过的海报（只取需要的字段，最多 12 条）
    const usedConcepts: UsedPosterConcept[] = Array.isArray(used)
      ? used
          .filter((u: any) => u && typeof u.name === 'string' && u.name.trim())
          .slice(-12)
          .map((u: any) => ({
            name: String(u.name).slice(0, 8),
            idea: typeof u.idea === 'string' ? u.idea.slice(0, 80) : undefined,
            sceneDirection: typeof u.sceneDirection === 'string' ? u.sceneDirection.slice(0, 40) : undefined,
            angle: typeof u.angle === 'string' ? u.angle.slice(0, 40) : undefined,
            sellingPoint: typeof u.sellingPoint === 'string' ? u.sellingPoint.slice(0, 60) : undefined,
            keyElements: Array.isArray(u.keyElements)
              ? u.keyElements.filter((x: any) => typeof x === 'string').slice(0, 5).map((x: string) => x.slice(0, 16))
              : undefined
          }))
      : [];
    let product: { data: string; mimeType: string } | undefined;
    if (productImage) {
      const buf = await loadImage(productImage, '产品图');
      const small = await sharp(buf, { failOn: 'none' }).rotate().resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      product = { data: small.toString('base64'), mimeType: 'image/jpeg' };
    }
    // 参考海报 / 参考图：构思时按它的场景与氛围来（版式仍是 4/3 固定版式）
    let reference: { data: string; mimeType: string } | undefined;
    if (referenceImage) {
      const buf = await loadImage(referenceImage, '参考图');
      const small = await sharp(buf, { failOn: 'none' }).rotate().resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      reference = { data: small.toString('base64'), mimeType: 'image/jpeg' };
    }
    const concept = await generatePosterConcept(
      {
        dna,
        productImage: product,
        referenceImage: reference,
        attachments: (await loadAttachments(req.body?.attachments, 1280, 85)).map(b => ({ data: b ? b.toString('base64') : '', mimeType: 'image/jpeg' })),
        hint: typeof hint === 'string' ? hint.slice(0, 1500) : undefined,
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
    const { concept: rawConcept, productImage, referenceImage, dna, model, resolution, attachments } = req.body || {};
    if (!rawConcept) return res.status(400).json({ success: false, error: { message: '缺少海报概念 concept' } });
    const concept = sanitizeConcept(rawConcept);
    // 用户附图按概念里判断的用途分：场景参考 / 产品细节实拍（帮生图还原造型与面料）
    const attachmentBufs = await loadAttachments(attachments, 2048, 92);
    const roles = concept.attachmentRoles || [];
    const sceneAttachments = attachmentBufs.filter((b, i): b is Buffer => Boolean(b) && roles[i] === 'scene');
    const detailAttachments = attachmentBufs.filter((b, i): b is Buffer => Boolean(b) && (roles[i] === 'detail' || roles[i] === 'product'));
    const product = await loadImage(productImage, '产品图');
    const productJpeg = await sharp(product, { failOn: 'none' }).rotate().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
    // 参考图作为第二张图交给生图模型，只参考场景、光线、配色与氛围
    let referenceJpeg: Buffer | undefined;
    if (referenceImage) {
      const ref = await loadImage(referenceImage, '参考图');
      referenceJpeg = await sharp(ref, { failOn: 'none' }).rotate().resize(1536, 1536, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    }
    const prompt = buildTemplateAHeroPrompt(concept, dna, {
      hasReference: Boolean(referenceJpeg) || sceneAttachments.length > 0,
      detailPhotos: detailAttachments.length
    });
    const usedModel = typeof model === 'string' && model.trim() ? model.trim() : DEFAULT_HERO_MODEL;
    const image = await requestGatewayImage({
      prompt,
      model: usedModel,
      images: [
        { data: `data:image/jpeg;base64,${productJpeg.toString('base64')}`, mimeType: 'image/jpeg', role: 'primary_product' },
        ...(referenceJpeg ? [{ data: `data:image/jpeg;base64,${referenceJpeg.toString('base64')}`, mimeType: 'image/jpeg', role: 'scene_reference' }] : []),
        ...sceneAttachments.map(b => ({ data: `data:image/jpeg;base64,${b.toString('base64')}`, mimeType: 'image/jpeg', role: 'scene_reference' })),
        ...detailAttachments.map(b => ({ data: `data:image/jpeg;base64,${b.toString('base64')}`, mimeType: 'image/jpeg', role: 'material_reference' }))
      ],
      aspectRatio: '16:9',
      resolution: resolution === '1K' || resolution === '4K' ? resolution : '2K',
      userId: userIdOf(req),
      deptId: req.headers['x-dept-id'] as string | undefined,
      timeoutMs: 300000
    });
    // 主场景底图用高质量 JPEG 传输（PNG 约 3.7MB → JPEG 约 0.5MB）：浏览器下载、上传存储、排版时再下载，三趟都省
    const jpg = await sharp(image, { failOn: 'none' }).rotate().jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
    const meta = await sharp(jpg).metadata();
    res.json({
      success: true,
      imageDataUrl: `data:image/jpeg;base64,${jpg.toString('base64')}`,
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
    const { heroImage, concept: rawConcept, outputScale, attachments } = req.body || {};
    if (!rawConcept) return res.status(400).json({ success: false, error: { message: '缺少海报概念 concept' } });
    const concept = sanitizeConcept(rawConcept);
    const hero = await loadImage(heroImage, '主场景底图');
    const attachmentBufs = await loadAttachments(attachments, 2048, 92);

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
    const crops = await Promise.all(
      located.map(async (d, i) => {
        // 用户补拍了这个部位：细节格直接用实拍（在实拍里框出部位再裁，框不出就整张居中裁），比从生成图里裁更真实
        const spec = concept.details[i];
        const role = spec?.photo ? (concept.attachmentRoles || [])[spec.photo - 1] : undefined;
        const photo = spec?.photo && role !== 'scene' && role !== 'ignore' ? attachmentBufs[spec.photo - 1] : null;
        if (photo) {
          try {
            const { details } = await locateDetails(photo, [{ key: spec.key, locate: spec.locate }], userIdOf(req));
            // 实拍里找不到这个部位（附图对错了格），宁可从主图裁，也不放一张对不上的图
            // 实拍本身就是特写：不限制框的大小，整个部位都放进来
            if (details[0]?.source === 'vision') {
              return await cropDetail(photo, details[0].box, TEMPLATE_A_DETAIL_ASPECT, { maxBoxWidthRatio: 1, maxBoxHeightRatio: 1, minWidthRatio: 0.3 });
            }
            console.warn(`[PosterTemplate] 附图${spec.photo} 里没找到「${spec.title}」，改从主图裁`);
          } catch (err: any) {
            console.warn(`[PosterTemplate] 附图${spec.photo} 做细节格失败，改从主图裁:`, err?.message || err);
          }
        }
        return cropDetail(hero, d.box, TEMPLATE_A_DETAIL_ASPECT);
      })
    );
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
  // 高质量 JPEG（不做色度抽样，白底抠图边缘不受影响）：PNG 一张 6–9MB，上传、回传、排版读入都慢；JPEG 约小 5–10 倍
  const jpg = await sharp(image, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
  const meta = await sharp(jpg).metadata();
  return { imageDataUrl: `data:image/jpeg;base64,${jpg.toString('base64')}`, width: meta.width, height: meta.height, model };
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
    sendError(res, err, '生成氛围海报概念失败');
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
    const CREASE_KEY = '__crease';
    const detailTargets = concept.details.map(d => ({ key: d.key, locate: d.locate }));
    const { details: firstPass, warnings } = await locateDetails(
      sofaRaw,
      [
        ...detailTargets,
        { key: SEAT_KEY, locate: '沙发最右侧那个座位的座面（人坐的那块水平面，只框座垫上表面，不要框靠背、扶手和座垫前侧的竖直立面）' },
        {
          key: CREASE_KEY,
          locate: '沙发最右侧那个座位上，靠背底部与座垫后缘相接的那条折缝（抱枕靠着靠背放时底边落在这里）；只框这条交界线附近的一个扁长窄条，不要框整个靠背或座垫'
        }
      ],
      userIdOf(req)
    );
    // 细节格二次精定位：近景里再框一次，避免部位落在圆形特写边上
    const refined = await refineDetails(
      sofaRaw,
      firstPass.filter(d => d.key !== SEAT_KEY && d.key !== CREASE_KEY),
      detailTargets,
      userIdOf(req)
    );
    const located = [...refined, ...firstPass.filter(d => d.key === SEAT_KEY || d.key === CREASE_KEY)];
    const circles = await Promise.all(refined.map(d => cropDetail(sofaRaw, d.box, 1)));
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

    // 靠背与座垫的折缝：取框中心，换算到裁剪后沙发图的 0~1 坐标；抱枕底边落在这里
    const creaseLoc = located.find(d => d.key === CREASE_KEY);
    const crease =
      creaseLoc && creaseLoc.source === 'vision'
        ? (() => {
            const cx = (creaseLoc.box.left + creaseLoc.box.width / 2) * sofaBox.srcWidth - sofaBox.left;
            const cy = (creaseLoc.box.top + creaseLoc.box.height / 2) * sofaBox.srcHeight - sofaBox.top;
            const p = { x: cx / sofaBox.width, y: cy / sofaBox.height };
            return p.x > 0.3 && p.x < 1 && p.y > 0.1 && p.y < 0.9 ? p : undefined;
          })()
        : undefined;

    const result = await composeFabricPoster({
      layout,
      sofa,
      seat,
      seatCrease: crease,
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
      details: located.filter(d => d.key !== SEAT_KEY && d.key !== CREASE_KEY),
      seat: seat || null,
      warnings
    });
  } catch (err: any) {
    sendError(res, err, '氛围海报合成失败');
  }
});

/* ───────── 模板 C：面料色卡海报（三种版式见 textilePoster.ts） ─────────
 *   POST /textile/concept  看主面料照片，给面料名、说明、标签型号、氛围图描述（失败回退默认文案）
 *   POST /textile/mood     按版式槽位生成一张氛围图（出图，耗点数；用户要求才调用）
 *   POST /textile/compose  避开标签取面料、取底色、排版合成（不出图、不扣点）
 */
router.post('/textile/concept', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { mainImage, hint, currentName } = req.body || {};
    const buf = await loadImage(mainImage, '主面料图');
    const { concept, fromModel, mainColor } = await generateTextileConcept(
      buf,
      typeof hint === 'string' ? hint : undefined,
      userIdOf(req),
      typeof currentName === 'string' && currentName.trim() ? { name: currentName.trim() } : undefined
    );
    res.json({ success: true, concept, fromModel, mainColor, bgColor: deriveBackground(mainColor) });
  } catch (err: any) {
    sendError(res, err, '生成面料色卡海报文案失败');
  }
});

router.post('/textile/mood', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { concept: rawConcept, index, count, layout, mainColor, model, resolution, variation, kind } = req.body || {};
    if (!rawConcept) return res.status(400).json({ success: false, error: { message: '缺少海报概念 concept' } });
    const concept = sanitizeTextileConcept(rawConcept, typeof mainColor === 'string' ? mainColor : undefined);
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i > 3) return res.status(400).json({ success: false, error: { message: 'index 无效' } });
    const total = Math.max(1, Math.min(4, Number(count) || 1));
    if (kind === 'cutout') {
      // 抠图用的人物：纯白无缝背景的全身像，方便后面干净地抠出来
      const style = concept.moodPrompts[0] || '';
      const cut = await fabricImage(req, {
        prompt: `${style}。画面主体是一位时装模特的全身像，从头到脚完整入镜，站姿自然，服装与面料的色调协调；背景必须是纯白色（#FFFFFF）无缝影棚背景，没有任何道具、家具、地面投影和阴影，不要文字和水印；竖构图。`,
        aspectRatio: '2:3',
        model,
        resolution
      });
      return res.json({ success: true, index: 0, kind: 'cutout', ...cut });
    }
    const out = await fabricImage(req, {
      prompt:
        concept.moodPrompts[i % concept.moodPrompts.length] +
        (Number(variation) > 0 ? '。请换一个与常见构图明显不同的人物、场景和机位，色调仍与面料协调，不要出现文字和水印。' : ''),
      aspectRatio: textileMoodAspectFor(textileLayoutOf(layout), total, i),
      model,
      resolution
    });
    res.json({ success: true, index: i, ...out });
  } catch (err: any) {
    sendError(res, err, '生成氛围图失败');
  }
});

router.post('/textile/compose', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { mainImage, heroImages, swatchImages, moodImages, layout, name, description, code, bgColor, outputScale, moodVariant, moodStyle, cutoutImage } = req.body || {};
    const main = await loadImage(mainImage, '主面料图');
    const heroAlternatives = await Promise.all((Array.isArray(heroImages) ? heroImages.slice(0, 3) : []).map((u: unknown, i: number) => loadImage(u, `同色面料图${i + 1}`)));
    const swatchList: unknown[] = Array.isArray(swatchImages) ? swatchImages.slice(0, TEXTILE_MAX_SWATCHES - 1) : [];
    const moodList: unknown[] = Array.isArray(moodImages) ? moodImages.slice(0, 4) : [];
    const swatches = await Promise.all(swatchList.map((u, i) => loadImage(u, `配色面料${i + 1}`)));
    const moods = await Promise.all(moodList.filter(isAllowedImageSource).map((u, i) => loadImage(u, `氛围图${i + 1}`)));
    // 定位每张氛围图里的人物（视觉模型，不出图不扣点），排版时让小图避开人物、裁切时保住人物
    const moodPersons = await Promise.all(
      moods.map(async buf => {
        try {
          const { details } = await locateDetails(
            buf,
            [{ key: 'person', locate: '画面里的人物，框住整个人（头部、身体和衣服都要框进来）；画面里没有人就框左上角很小的一点' }],
            userIdOf(req)
          );
          const d = details[0];
          if (!d || d.source !== 'vision') return null;
          // 太小的框是“没有人”的占位
          return d.box.width * d.box.height < 0.02 ? null : d.box;
        } catch {
          return null;
        }
      })
    );
    const cutoutPerson = moodStyle === 'cutout' && isAllowedImageSource(cutoutImage) ? await loadImage(cutoutImage, '人物图') : undefined;
    const result = await composeTextilePoster({
      layout: textileLayoutOf(layout),
      main,
      heroAlternatives,
      swatches,
      moods,
      moodPersons,
      name: typeof name === 'string' ? name.slice(0, 12) : '',
      description: typeof description === 'string' ? description.slice(0, 200) : '',
      code: typeof code === 'string' ? code.slice(0, 24) : '',
      bgColor: typeof bgColor === 'string' ? bgColor : undefined,
      outputScale: Number(outputScale) === 2 ? 2 : 1,
      moodVariant: Number.isFinite(Number(moodVariant)) ? Number(moodVariant) : 0,
      moodStyle: moodStyle === 'cutout' ? 'cutout' : 'collage',
      cutoutPerson
    });
    res.json({
      success: true,
      imageDataUrl: `data:image/jpeg;base64,${result.buffer.toString('base64')}`,
      width: result.width,
      height: result.height,
      bgColor: result.bgColor,
      mainColor: result.mainColor,
      swatchColors: result.swatchColors,
      warnings: result.warnings
    });
  } catch (err: any) {
    sendError(res, err, '面料色卡海报合成失败');
  }
});

export default router;
