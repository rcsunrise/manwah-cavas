// server/services/imageTextEditService.ts
// 图中文字修改：OCR 定位目标文字行 → 遮罩局部重绘 → 只回贴新文字外框（颜色对齐）→ 放大裁切严格校验。
// 原型实测：Nano Banana 2.1 / Gemini 3 Pro 中文改字准确且风格一致；GPT Image 2 中文易写错字，不用于此场景。
// 文字框以外的像素一律保留原图，产品与场景不会因改字而走样。
import crypto from 'crypto';
import sharp from 'sharp';
import { resolveApiConfig } from '../ai/providerConfig';
import { supabaseAdmin } from '../../src/lib/supabase';
import { VideoSourceImageResolver } from './video/videoSourceImageResolver';
import { persistAssetToDisk } from '../routes/canvasRoutes';

const EDIT_MODELS = ['gpt-image-2.5-sunburst-c', 'gemini-nano-banana-2.1-preview'];
/** 按要求整体修改画面：默认 GPT 2.6 Flare（产品保真、出图快），失败时回落 Nano Banana 2.1 */
const INSTRUCTION_EDIT_MODELS = ['gpt-image-2.6-flare-c', 'gemini-nano-banana-2.1-preview'];
/** 改字尝试顺序：GPT 2.5 Sunburst（支持原生遮罩）先试两次（结果有随机性），仍不行再换 Nano Banana 2.1 */
const ATTEMPT_PLAN = [EDIT_MODELS[0], EDIT_MODELS[0], EDIT_MODELS[1]];
/** 对齐后编辑带以外的平均灰度差上限；正常局部改字约 4~6，超过说明模型重新构图了整张图 */
const MAX_ALIGN_ERR = 12;
const OCR_MODEL = 'gemini-3.7-flash';
const MAX_EDGE = 2048;
const ASSET_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'creative-canvas-assets';

export interface ImageTextEditInput {
  imageUrl: string;
  newText: string;
  /** 要替换的原文；省略时替换画面中最大的一行文字（通常是主标题） */
  oldText?: string;
  userId?: string;
}

export interface ImageTextEditResult {
  imageUrl: string;
  objectKey: string;
  model: string;
  /** 被修改的整行原文与修改后的整行文字 */
  originalLine: string;
  expectedLine: string;
  /** 放大裁切后的逐字校验是否通过 */
  verified: boolean;
  recognizedLine: string;
  attempts: number;
}

interface OcrLine {
  text: string;
  /** 像素坐标 */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Rect { left: number; top: number; width: number; height: number }

const normalizeText = (s: string) => s.replace(/[\s·・•.,，。、:：!！?？'"“”‘’「」『』()（）\-—_]/g, '');

function isNetworkError(err: any): boolean {
  const text = `${err?.message || ''} ${err?.cause?.code || ''}`;
  return /fetch failed|ECONNRESET|ETIMEDOUT|socket|UND_ERR|timeout/i.test(text);
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: any;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isNetworkError(err) || i === attempts) throw err;
      await new Promise(r => setTimeout(r, 1500 * i));
    }
  }
  throw lastErr;
}

/** 视觉模型 OCR；strict 模式要求逐字照抄、不纠正错别字（用于校验） */
async function ocrLines(image: Buffer, strict = false): Promise<Array<{ text: string; box: number[] }>> {
  const config = await resolveApiConfig('system');
  if (!config.apiKey) throw new Error('未配置模型 API 凭证，无法识别图中文字');
  const base = config.baseUrl.replace(/\/+$/, '').replace(/\/(v1beta|v1)$/, '');
  const small = await sharp(image).resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
  const instruction = strict
    ? '逐字照抄图片中的文字，严格按看到的字形输出：不要纠正错别字、不要根据语义猜测，看不清或字形不规范的字用"？"代替。只输出 JSON：{"lines":[{"text":"原文","left":0,"top":0,"right":0,"bottom":0}]}，坐标归一化到 0~1000。'
    : '识别图片中所有排版文字（海报标题、副标题、卖点文案等，忽略画中画、书本、屏幕上的小字）。只输出 JSON：{"lines":[{"text":"原文","left":0,"top":0,"right":0,"bottom":0}]}，left/right 为该行文字左右边缘的横坐标，top/bottom 为上下边缘的纵坐标，均归一化到 0~1000（横坐标相对图片宽度，纵坐标相对图片高度）。';

  const json: any = await withRetry(async () => {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OCR_MODEL,
        temperature: 0,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: instruction },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${small.toString('base64')}` } }
          ]
        }]
      }),
      signal: AbortSignal.timeout(120_000)
    });
    if (!res.ok) throw new Error(`OCR 请求失败 HTTP ${res.status}`);
    return res.json();
  });
  const content: string = json?.choices?.[0]?.message?.content || '';
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return [];
  const lines = JSON.parse(match[0]).lines || [];
  return lines
    .map((l: any) => ({ text: String(l.text || ''), box: [Number(l.left), Number(l.top), Number(l.right), Number(l.bottom)] }))
    .filter((l: any) => l.text && l.box.every((v: number) => Number.isFinite(v)));
}

function toPixelLines(lines: Array<{ text: string; box: number[] }>, W: number, H: number): OcrLine[] {
  return lines.map(l => ({
    text: l.text,
    left: Math.round((Math.min(l.box[0], l.box[2]) / 1000) * W),
    right: Math.round((Math.max(l.box[0], l.box[2]) / 1000) * W),
    top: Math.round((Math.min(l.box[1], l.box[3]) / 1000) * H),
    bottom: Math.round((Math.max(l.box[1], l.box[3]) / 1000) * H)
  }));
}

/** 按新旧整行字数比例横向放宽编辑区域，上下不越过相邻文字行 */
export function computeEditRect(target: OcrLine, lines: OcrLine[], expectedLine: string, W: number, H: number): Rect {
  const boxW = Math.max(8, target.right - target.left);
  const boxH = Math.max(8, target.bottom - target.top);
  const ratio = Math.max(1, normalizeText(expectedLine).length / Math.max(1, normalizeText(target.text).length));
  const left = Math.max(0, target.left - Math.round(boxW * 0.08));
  let top = Math.max(0, target.top - Math.round(boxH * 0.25));
  let bottom = Math.min(H, target.bottom + Math.round(boxH * 0.25));
  const right = Math.min(W, target.left + Math.round(boxW * ratio + boxW * 0.2));

  for (const other of lines) {
    if (other === target) continue;
    const overlapsX = other.left < right && other.right > left;
    if (!overlapsX) continue;
    if (other.top >= target.bottom) bottom = Math.min(bottom, other.top - 6);
    if (other.bottom <= target.top) top = Math.max(top, other.bottom + 6);
  }
  return { left, top, width: Math.max(8, right - left), height: Math.max(8, bottom - top) };
}

/** 图像模型支持的画幅比例 */
const ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

/** 取与原图最接近的画幅比例。不传时网关会用默认比例，模型会把整张图重新构图到那个比例，局部回贴就会错位 */
export function closestAspectRatio(W: number, H: number): string {
  const target = Math.log(W / H);
  let best = ASPECT_RATIOS[0], bestDiff = Infinity;
  for (const r of ASPECT_RATIOS) {
    const [a, b] = r.split(':').map(Number);
    const diff = Math.abs(Math.log(a / b) - target);
    if (diff < bestDiff) { bestDiff = diff; best = r; }
  }
  return best;
}

async function callImageEdit(params: { model: string; prompt: string; image: Buffer; mask?: Buffer; userId: string; aspectRatio: string; timeoutMs?: number }): Promise<Buffer> {
  const gatewayUrl = `http://127.0.0.1:${process.env.PORT || 3000}/api/gateway/generate-image`;
  const res = await fetch(gatewayUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-uuid': params.userId },
    body: JSON.stringify({
      model: params.model,
      prompt: params.prompt,
      generationIntent: 'image_edit',
      aspectRatio: params.aspectRatio,
      resolution: '2K',
      images: [{ data: `data:image/png;base64,${params.image.toString('base64')}`, role: 'composition_reference' }],
      ...(params.mask ? { mask: { data: params.mask.toString('base64'), mimeType: 'image/png' } } : {}),
      userUuid: params.userId,
      userId: params.userId
    }),
    signal: AbortSignal.timeout(params.timeoutMs ?? 240_000)
  });
  const data: any = await res.json();
  if (!res.ok || data.error || data.success === false) {
    const msg = data.error?.message || (typeof data.error === 'string' ? data.error : '') || data.message || `HTTP ${res.status}`;
    throw new Error(`${params.model} 改字失败：${msg}`);
  }
  const part = data.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data || p?.inline_data?.data);
  const out: string | undefined =
    data.imageUrl || data.data?.[0]?.url || data.data?.[0]?.b64_json || data.images?.[0]?.data || part?.inlineData?.data || part?.inline_data?.data;
  if (!out) throw new Error(`${params.model} 未返回图片`);
  if (out.startsWith('http')) return Buffer.from(await (await fetch(out, { signal: AbortSignal.timeout(60_000) })).arrayBuffer());
  return Buffer.from(out.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, ''), 'base64');
}

/**
 * 估计模型输出相对原图的缩放与平移。图像编辑模型经常返回比例略有不同、整体偏移几像素的画面，
 * 不对齐直接回贴就会出现错位色块。做法：两图缩到 256 宽的灰度图，排除编辑带后，
 * 在缩放 0.94~1.06、平移 ±10 像素的范围内找差异最小的组合，再换算回原尺寸。
 */
async function estimateAlignment(base: Buffer, edited: Buffer, band: Rect, W: number, H: number) {
  const SW = 256;
  const k = SW / W;
  const SH = Math.max(1, Math.round(H * k));
  const g = async (buf: Buffer) => sharp(buf).resize(SW, SH, { fit: 'fill' }).grayscale().raw().toBuffer();
  const [ga, gb] = await Promise.all([g(base), g(edited)]);
  const bx0 = band.left * k - 4, bx1 = (band.left + band.width) * k + 4;
  const by0 = band.top * k - 4, by1 = (band.top + band.height) * k + 4;
  const score = (s: number, dx: number, dy: number) => {
    let sum = 0, n = 0;
    for (let y = 2; y < SH - 2; y += 2) {
      for (let x = 2; x < SW - 2; x += 2) {
        if (x >= bx0 && x <= bx1 && y >= by0 && y <= by1) continue;
        // aligned(x, y) = edited((x - dx) / s, (y - dy) / s)
        const sx = Math.round((x - dx) / s), sy = Math.round((y - dy) / s);
        if (sx < 0 || sy < 0 || sx >= SW || sy >= SH) continue;
        sum += Math.abs(ga[y * SW + x] - gb[sy * SW + sx]);
        n++;
      }
    }
    return n > 0 ? sum / n : Infinity;
  };
  let best = { s: 1, dx: 0, dy: 0, err: score(1, 0, 0) };
  const identityErr = best.err;
  for (let s = 0.94; s <= 1.0601; s += 0.01) {
    for (let dx = -10; dx <= 10; dx++) {
      for (let dy = -10; dy <= 10; dy++) {
        const err = score(s, dx, dy);
        if (err < best.err) best = { s, dx, dy, err };
      }
    }
  }
  // 粗搜后在最优点附近做亚像素细化（缩放步长 0.002、平移 0.25）
  const coarse = best;
  for (let s = coarse.s - 0.01; s <= coarse.s + 0.0101; s += 0.002) {
    for (let dx = coarse.dx - 1; dx <= coarse.dx + 1; dx += 0.25) {
      for (let dy = coarse.dy - 1; dy <= coarse.dy + 1; dy += 0.25) {
        const err = score(s, dx, dy);
        if (err < best.err) best = { s, dx, dy, err };
      }
    }
  }
  return { scale: best.s, dx: best.dx / k, dy: best.dy / k, err: best.err, identityErr };
}

/**
 * 回贴：先把模型输出对齐到原图，再找出编辑带内真正发生变化的区域（新旧文字及模型顺带重画的背景），
 * 做闭运算与大半径羽化后作为蒙版，只把这部分贴回原图。变化区域以外保留原图像素，
 * 因此画面其他部分（产品、家具）不会被模型的整体重绘带偏，也不会出现矩形色块。
 * 返回 null 表示编辑带内没有明显变化。
 */
export async function compositeAligned(
  base: Buffer,
  edited: Buffer,
  rect: Rect,
  W: number,
  H: number
): Promise<{ buffer: Buffer; box: Rect; alignment: { scale: number; dx: number; dy: number; err: number; identityErr: number } } | null> {
  // 编辑带：原编辑区域在同一水平带内向右放宽一倍，容纳写得更宽的新文字；上下不越过编辑区域（已避开相邻文字行）
  const band: Rect = { left: rect.left, top: rect.top, width: Math.min(W - rect.left, rect.width * 2), height: rect.height };

  const editedFill = await sharp(edited).resize(W, H, { fit: 'fill' }).removeAlpha().png().toBuffer();
  const alignment = await estimateAlignment(base, editedFill, band, W, H);
  const { scale, dx, dy } = alignment;

  const a = await sharp(base).removeAlpha().raw().toBuffer();
  const RW = Math.round(W * scale), RH = Math.round(H * scale);
  const r = await sharp(editedFill).resize(RW, RH, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const ox = Math.round(dx), oy = Math.round(dy);
  // 对齐后的模型输出：超出范围的像素用原图补
  const b = Buffer.from(a);
  for (let y = 0; y < H; y++) {
    const sy = y - oy;
    if (sy < 0 || sy >= RH) continue;
    for (let x = 0; x < W; x++) {
      const sx = x - ox;
      if (sx < 0 || sx >= RW) continue;
      const i = (y * W + x) * 3, j = (sy * RW + sx) * 3;
      b[i] = r[j]; b[i + 1] = r[j + 1]; b[i + 2] = r[j + 2];
    }
  }

  // 编辑带内的变化像素
  const DIFF = 28;
  const changed = new Uint8Array(W * H * 3);
  let minX = W, maxX = -1, minY = H, maxY = -1, hits = 0;
  for (let y = band.top; y < band.top + band.height; y++) {
    for (let x = band.left; x < band.left + band.width; x++) {
      const p = y * W + x, i = p * 3;
      const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
      if (d > DIFF) {
        changed[i] = changed[i + 1] = changed[i + 2] = 255;
        hits++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (hits < 30) return null;

  // 闭运算把笔画连成块（盖住抗锯齿边缘与旧字残影），再大半径羽化消除边界
  const R = Math.max(6, Math.round(rect.height * 0.08));
  const maskImg = await sharp(changed, { raw: { width: W, height: H, channels: 3 } })
    .erode(R) // 注意：sharp 的 erode 对白色前景是扩张（dilate 反而会收缩白色区域）
    .blur(R * 0.8)
    .extractChannel(0)
    .raw()
    .toBuffer();
  // 蒙版在编辑带内侧渐隐到 0，带外完全保留原图（避免羽化溢出到相邻文字行产生重影）
  const FADE = R;
  const out = Buffer.alloc(a.length);
  for (let y = 0, p = 0; y < H; y++) {
    for (let x = 0; x < W; x++, p++) {
      const i = p * 3;
      let t = maskImg[p] / 255;
      if (t > 0) {
        const inside = Math.min(x - band.left, band.left + band.width - 1 - x, y - band.top, band.top + band.height - 1 - y);
        t = inside < 0 ? 0 : t * Math.min(1, (inside + 1) / FADE);
      }
      out[i] = Math.round(a[i] * (1 - t) + b[i] * t);
      out[i + 1] = Math.round(a[i + 1] * (1 - t) + b[i + 1] * t);
      out[i + 2] = Math.round(a[i + 2] * (1 - t) + b[i + 2] * t);
    }
  }
  const PAD = 6;
  const box: Rect = {
    left: Math.max(0, minX - PAD),
    top: Math.max(0, minY - PAD),
    width: Math.min(W, maxX + PAD + 1) - Math.max(0, minX - PAD),
    height: Math.min(H, maxY + PAD + 1) - Math.max(0, minY - PAD)
  };
  return { buffer: await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer(), box, alignment };
}

/** 放大裁切新文字区域后逐字识别，避免整图识别把错字“自动纠正”为正确字 */
async function verifyText(image: Buffer, box: Rect, W: number, H: number, expectedLine: string): Promise<{ ok: boolean; recognized: string }> {
  const pad = Math.round(box.height * 0.3);
  const crop = {
    left: Math.max(0, box.left - pad),
    top: Math.max(0, box.top - pad),
    width: Math.min(W - Math.max(0, box.left - pad), box.width + pad * 2),
    height: Math.min(H - Math.max(0, box.top - pad), box.height + pad * 2)
  };
  const zoomed = await sharp(image).extract(crop).resize({ height: 480, withoutEnlargement: false }).png().toBuffer();
  const lines = await ocrLines(zoomed, true);
  const recognized = lines.map(l => l.text).join('');
  return { ok: normalizeText(recognized).includes(normalizeText(expectedLine)), recognized };
}

async function saveResultImage(image: Buffer): Promise<{ imageUrl: string; objectKey: string }> {
  const webp = await sharp(image).webp({ quality: 93 }).toBuffer();
  const objectKey = `text-edit-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.webp`;
  persistAssetToDisk(objectKey, `data:image/webp;base64,${webp.toString('base64')}`, 'image/webp');
  try {
    const { error } = await supabaseAdmin.storage.from(ASSET_BUCKET).upload(`canvas-edits/${objectKey}`, webp, { contentType: 'image/webp', upsert: true });
    if (!error) {
      const { data } = supabaseAdmin.storage.from(ASSET_BUCKET).getPublicUrl(`canvas-edits/${objectKey}`);
      if (data?.publicUrl) return { imageUrl: data.publicUrl, objectKey };
    }
  } catch {
    // 云端不可用时使用本地资源地址
  }
  return { imageUrl: `/api/canvases/assets/${objectKey}`, objectKey };
}

export async function editImageText(input: ImageTextEditInput): Promise<ImageTextEditResult> {
  const newText = input.newText?.trim();
  if (!newText) throw new Error('缺少要改成的文字');
  const userId = input.userId || 'system';

  const { buffer: rawBuffer } = await VideoSourceImageResolver.loadImageBuffer(input.imageUrl);
  // 统一为不超过 2048 的 PNG：模型输入与回贴都在这个尺寸上进行
  const base = await sharp(rawBuffer).rotate().resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true }).removeAlpha().png().toBuffer();
  const meta = await sharp(base).metadata();
  const W = meta.width!, H = meta.height!;

  const lines = toPixelLines(await ocrLines(base), W, H);
  if (lines.length === 0) throw new Error('图中没有识别到可修改的文字');

  const oldText = input.oldText?.trim();
  const target = oldText
    ? lines
        .filter(l => normalizeText(l.text).includes(normalizeText(oldText)))
        .sort((p, q) => (q.bottom - q.top) - (p.bottom - p.top))[0]
    : [...lines].sort((p, q) => (q.bottom - q.top) - (p.bottom - p.top))[0];
  if (!target) {
    throw new Error(`图中没有找到文字「${oldText}」，识别到的文字有：${lines.map(l => `「${l.text}」`).join('、')}`);
  }
  const expectedLine = oldText ? target.text.replace(oldText, newText) : newText;
  const rect = computeEditRect(target, lines, expectedLine, W, H);

  // 遮罩（OpenAI 约定：透明 = 允许修改）；Gemini 系列作为提示图使用
  const hole = await sharp({ create: { width: rect.width, height: rect.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const mask = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite([{ input: hole, left: rect.left, top: rect.top, blend: 'dest-in' as any }])
    .png()
    .toBuffer();

  const otherLines = lines.filter(l => l !== target).map(l => `「${l.text}」`).join('、');
  const prompt =
    `只修改画面中的这一行文字：把「${target.text}」改为「${expectedLine}」。` +
    `新文字沿用原文字完全相同的字体风格、字重、颜色和对齐起点，每个字的高度与宽度都和原文字一致（不要放大或缩小），字数增加时只向右延伸，自然融入原有背景。` +
    (otherLines ? `其他文字${otherLines}保持不变。` : '') +
    `画面中所有其他内容（产品、家具、墙面、光线、构图）必须与原图完全一致，不得改动。第二张图是修改区域遮罩：透明区域为允许修改的位置。`;

  const aspectRatio = closestAspectRatio(W, H);
  let best: { buffer: Buffer; model: string; recognized: string } | null = null;
  let attempts = 0;
  let recomposed = 0;
  let lastError: any = null;
  for (const model of ATTEMPT_PLAN) {
    attempts++;
    try {
      const edited = await callImageEdit({ model, prompt, image: base, mask, userId, aspectRatio });
      const composed = await compositeAligned(base, edited, rect, W, H);
      if (!composed) {
        console.warn(`[ImageTextEdit] ${model} made no visible change in the edit region`);
        continue;
      }
      const al = composed.alignment;
      console.log(`[ImageTextEdit] ${model} alignment scale=${al.scale.toFixed(3)} dx=${al.dx.toFixed(1)} dy=${al.dy.toFixed(1)} err=${al.err.toFixed(2)} (identity ${al.identityErr.toFixed(2)})`);
      // 对齐后编辑带以外仍差异很大：模型重新构图了整张画面，局部回贴会出现重影，这一版不能用
      if (al.err > MAX_ALIGN_ERR) {
        recomposed++;
        console.warn(`[ImageTextEdit] ${model} recomposed the whole image (err ${al.err.toFixed(2)} > ${MAX_ALIGN_ERR}), retrying`);
        continue;
      }
      const check = await verifyText(composed.buffer, composed.box, W, H, expectedLine);
      console.log(`[ImageTextEdit] ${model}: expected "${expectedLine}", recognized "${check.recognized}", ok=${check.ok}`);
      if (check.ok) {
        const saved = await saveResultImage(composed.buffer);
        return { ...saved, model, originalLine: target.text, expectedLine, verified: true, recognizedLine: check.recognized, attempts };
      }
      if (!best) best = { buffer: composed.buffer, model, recognized: check.recognized };
    } catch (err: any) {
      lastError = err;
      console.warn(`[ImageTextEdit] ${model} attempt failed:`, err?.message || err);
    }
  }

  if (!best && recomposed > 0) throw new Error('模型多次重绘了整张画面，无法只改这行文字，请稍后重试');
  if (!best && lastError) throw lastError;
  if (!best) throw new Error('两个模型都未能完成改字，请稍后重试');
  // 都没通过逐字校验：仍返回最接近的一版，由界面提示用户核对
  const saved = await saveResultImage(best.buffer);
  return { ...saved, model: best.model, originalLine: target.text, expectedLine, verified: false, recognizedLine: best.recognized, attempts };
}

export interface ImageInstructionEditResult {
  imageUrl: string;
  objectKey: string;
  model: string;
  attempts: number;
}

/**
 * 按对话里的要求整体修改一张图（换背景、调光线、改氛围、加减道具等），产品本身必须保持不变。
 * 改字请用 editImageText（只重绘文字区域，更精确）。
 */
export async function editImageByInstruction(input: { imageUrl: string; instruction: string; userId?: string }): Promise<ImageInstructionEditResult> {
  const instruction = input.instruction?.trim();
  if (!instruction) throw new Error('缺少修改要求');
  const userId = input.userId || 'system';
  const { buffer: rawBuffer } = await VideoSourceImageResolver.loadImageBuffer(input.imageUrl);
  const base = await sharp(rawBuffer).rotate().resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true }).removeAlpha().png().toBuffer();
  const meta = await sharp(base).metadata();
  const W = meta.width!, H = meta.height!;
  const aspectRatio = closestAspectRatio(W, H);
  const prompt =
    `按以下要求修改这张电商海报：${instruction}。` +
    `必须遵守：画面中的家具产品（造型、比例、颜色、材质、缝线与结构细节）与原图完全一致，不得重画或变形；` +
    `要求里没有提到的内容（构图、机位、文字、其余道具）保持原样；保持原图画幅比例，写实摄影质感。`;

  let lastError: any = null;
  let attempts = 0;
  // Cloud Run 单次请求最多 300 秒：两个模型总共不能超过，否则前端只会收到 504「upstream request timeout」。
  // 第一个模型最多给 170 秒，剩下的时间留给备用模型；剩余不足 40 秒就不再试了。
  const startedAt = Date.now();
  const BUDGET_MS = 270_000;
  for (const [i, model] of INSTRUCTION_EDIT_MODELS.entries()) {
    const remaining = BUDGET_MS - (Date.now() - startedAt);
    if (remaining < 40_000) break;
    attempts++;
    const timeoutMs = i === 0 && INSTRUCTION_EDIT_MODELS.length > 1 ? Math.min(170_000, remaining - 20_000) : remaining - 20_000;
    try {
      const edited = await callImageEdit({ model, prompt, image: base, userId, aspectRatio, timeoutMs });
      // 统一回原尺寸，便于在画布上与原图对比
      const resized = await sharp(edited).resize(W, H, { fit: 'cover' }).png().toBuffer();
      const saved = await saveResultImage(resized);
      return { ...saved, model, attempts };
    } catch (err: any) {
      lastError = err;
      console.warn(`[ImageInstructionEdit] ${model} attempt failed:`, err?.message || err);
    }
  }
  const timedOut = /timeout|aborted|TimeoutError/i.test(String(lastError?.message || lastError?.name || ''));
  throw lastError
    ? timedOut
      ? new Error('图片模型响应太慢（超过 4 分钟），这次没有改成。请稍后重试；如果连续超时，可能是网关繁忙。')
      : lastError
    : new Error('修改失败，请稍后重试');
}
