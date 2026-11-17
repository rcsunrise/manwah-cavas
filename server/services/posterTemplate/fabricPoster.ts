import sharp from 'sharp';
import { renderText } from './posterFonts';

/**
 * 沙发面料海报（模板 B）排版：严格按参考图 1、2 的版式，所有位置都是固定比例，
 * 图片是 AI/素材，文字是真实字体。画布 A4 横版 2000×1414。
 *
 *   collage4（参考图 1）：右侧 4 张氛围照拼贴，沙发在左，氛围照在沙发上方不盖住它
 *   hero3（参考图 2）：右侧 1 张大竖图 + 2 张小图，大图压在沙发右半部分之下
 */
export const FABRIC_SIZE = { width: 2000, height: 1414 } as const;

export type FabricLayoutId = 'collage4' | 'hero3';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface FabricLayout {
  /** 氛围照槽位，顺序对应 photoOrder */
  photos: Rect[];
  /** 每个槽位用哪一张氛围照（对应 MOOD_SHOT_ORDER 的下标） */
  photoOrder: number[];
  /** 沙发（含抱枕）可占用的区域，等比缩放后左对齐、垂直居中 */
  sofaBox: Rect;
  code: { x: number; y: number; size: number };
  circles: Rect[];
  swatches: Rect[];
  label: { cx: number; y: number; size: number };
}

export const FABRIC_LAYOUTS: Record<FabricLayoutId, FabricLayout> = {
  collage4: {
    photos: [
      { x: 1147, y: 0, w: 432, h: 768 },
      { x: 1587, y: 0, w: 411, h: 540 },
      { x: 1142, y: 777, w: 436, h: 313 },
      { x: 1585, y: 549, w: 413, h: 548 }
    ],
    photoOrder: [0, 1, 2, 3],
    sofaBox: { x: 88, y: 380, w: 1170, h: 640 },
    code: { x: 65, y: 56, size: 36 },
    circles: [
      { x: 64, y: 1110, w: 245, h: 245 },
      { x: 336, y: 1110, w: 245, h: 245 }
    ],
    swatches: [
      { x: 667, y: 1105, w: 211, h: 211 },
      { x: 905, y: 1105, w: 211, h: 211 }
    ],
    label: { cx: 772, y: 1334, size: 22 }
  },
  hero3: {
    photos: [
      { x: 963, y: 25, w: 605, h: 1080 },
      { x: 1587, y: 25, w: 373, h: 540 },
      { x: 1590, y: 580, w: 362, h: 530 }
    ],
    photoOrder: [0, 2, 3],
    sofaBox: { x: 85, y: 420, w: 1150, h: 640 },
    code: { x: 48, y: 68, size: 36 },
    circles: [
      { x: 48, y: 1122, w: 245, h: 245 },
      { x: 320, y: 1122, w: 245, h: 245 }
    ],
    swatches: [
      { x: 618, y: 1127, w: 212, h: 212 },
      { x: 857, y: 1127, w: 212, h: 212 }
    ],
    label: { cx: 724, y: 1355, size: 22 }
  }
};

/** 各槽位出图时的画幅，贴近槽位比例，裁切时损失最小 */
export function moodAspectFor(layout: FabricLayoutId, shotIndex: number): string {
  const L = FABRIC_LAYOUTS[layout];
  const slot = L.photoOrder.indexOf(shotIndex);
  if (slot < 0) return '3:4';
  const r = L.photos[slot].w / L.photos[slot].h;
  if (r < 0.62) return '9:16';
  if (r < 0.72) return '2:3';
  if (r < 0.85) return '3:4';
  if (r < 1.15) return '1:1';
  if (r < 1.45) return '4:3';
  return '16:9';
}

/** 版式实际用到哪几张氛围照（下标对应 MOOD_SHOT_ORDER） */
export function moodIndexesFor(layout: FabricLayoutId): number[] {
  return FABRIC_LAYOUTS[layout].photoOrder;
}

/**
 * 白底图抠成透明底：只把“与边缘相连的近白色”当背景，沙发里的高光不会被误抠。
 * 返回裁掉空白边的 PNG。
 */
export interface CutoutResult {
  buffer: Buffer;
  /** 裁掉空白边后，主体在原图里的位置（像素）与原图尺寸 */
  box: { left: number; top: number; width: number; height: number; srcWidth: number; srcHeight: number };
}

export async function cutoutWhiteBackground(input: Buffer): Promise<Buffer> {
  return (await cutoutWhiteBackgroundWithBox(input)).buffer;
}

export async function cutoutWhiteBackgroundWithBox(input: Buffer): Promise<CutoutResult> {
  const { data, info } = await sharp(input, { failOn: 'none' }).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const isNearWhite = (i: number, strict: number) => {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    return Math.min(r, g, b) >= strict && Math.max(r, g, b) - Math.min(r, g, b) <= 14;
  };
  const bg = new Uint8Array(w * h);
  const queue = new Uint32Array(w * h);
  let head = 0;
  let tail = 0;
  const push = (i: number) => {
    if (!bg[i] && isNearWhite(i, 244)) {
      bg[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  // 沙发脚下的地面阴影是浅灰（215~243），不算纯白，留着叠到氛围照上会变成白斑。
  // 从背景向外有限步数地扩一圈“偏白低饱和”的像素：步数限制住了，不会吃进沙发本体（沙发高光一般更深或带色）。
  const SHADOW_STEPS = 36;
  let frontier: number[] = [];
  for (let i = 0; i < w * h; i++) if (bg[i]) frontier.push(i);
  const grow = (j: number, next: number[]) => {
    if (bg[j]) return;
    const r = data[j * 3];
    const g = data[j * 3 + 1];
    const b = data[j * 3 + 2];
    const mn = Math.min(r, g, b);
    if (mn >= 216 && Math.max(r, g, b) - mn <= 12) {
      bg[j] = 1;
      next.push(j);
    }
  };
  for (let step = 0; step < SHADOW_STEPS && frontier.length; step++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % w;
      const y = (i - x) / w;
      if (x > 0) grow(i - 1, next);
      if (x < w - 1) grow(i + 1, next);
      if (y > 0) grow(i - w, next);
      if (y < h - 1) grow(i + w, next);
    }
    frontier = next;
  }
  // 沙发底部那一段（沙发脚、地面）：浅灰阴影更大一片，步数限制吃不完，放开步数但只限底部区域，
  // 这一段只有沙发脚和地面，沙发本体的亮部都在上面，不会误吃。
  const bottomFrom = Math.floor(h * 0.66);
  const lowFrontier: number[] = [];
  for (let i = bottomFrom * w; i < w * h; i++) if (bg[i]) lowFrontier.push(i);
  while (lowFrontier.length) {
    const i = lowFrontier.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    const tryAdd = (j: number, jy: number) => {
      if (bg[j] || jy < bottomFrom) return;
      const mn = Math.min(data[j * 3], data[j * 3 + 1], data[j * 3 + 2]);
      if (mn >= 206 && Math.max(data[j * 3], data[j * 3 + 1], data[j * 3 + 2]) - mn <= 10) {
        bg[j] = 1;
        lowFrontier.push(j);
      }
    };
    if (x > 0) tryAdd(i - 1, y);
    if (x < w - 1) tryAdd(i + 1, y);
    if (y > 0) tryAdd(i - w, y - 1);
    if (y < h - 1) tryAdd(i + w, y + 1);
  }
  // 贴着背景的一圈偏白像素也算背景，去掉白边
  const edge: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (bg[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    const touches = (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w]);
    if (touches && isNearWhite(i, 230)) edge.push(i);
  }
  for (const i of edge) bg[i] = 1;

  const alpha = Buffer.alloc(w * h);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < w * h; i++) {
    if (bg[i]) continue;
    alpha[i] = 255;
    const x = i % w;
    const y = (i - x) / w;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) throw new Error('没有识别到主体，请确认图片是白底沙发图');
  // blur 之后输出可能不是单通道，明确取第一个通道，避免按错步长读出横条纹
  const softAlpha = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } })
    .blur(0.8)
    .extractChannel(0)
    .raw()
    .toBuffer();
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = data[i * 3];
    rgba[i * 4 + 1] = data[i * 3 + 1];
    rgba[i * 4 + 2] = data[i * 3 + 2];
    rgba[i * 4 + 3] = softAlpha[i];
  }
  const pad = 4;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const cropW = Math.min(w - left, maxX - minX + 1 + pad * 2);
  const cropH = Math.min(h - top, maxY - minY + 1 + pad * 2);
  const buffer = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left, top, width: cropW, height: cropH })
    .png()
    .toBuffer();
  return { buffer, box: { left, top, width: cropW, height: cropH, srcWidth: w, srcHeight: h } };
}

/** 取图中间的正方形区域（fraction 为占短边的比例），用于面料色卡取样 */
export async function centerSquare(image: Buffer, fraction: number): Promise<Buffer> {
  const meta = await sharp(image, { failOn: 'none' }).metadata();
  const w = meta.width || 1;
  const h = meta.height || 1;
  const side = Math.max(1, Math.round(Math.min(w, h) * fraction));
  return sharp(image, { failOn: 'none' })
    .extract({ left: Math.round((w - side) / 2), top: Math.round((h - side) / 2), width: side, height: side })
    .png()
    .toBuffer();
}

/**
 * 在沙发抠图上找一块最“平”的正方形区域（梯度最小，避开缝线、接缝、褶皱、边缘和暗部），
 * 用作皮革色卡的取样。不依赖视觉模型定位，视觉框常常框到接缝上。
 * fraction 是边长占沙发宽度的比例。
 */
export async function flattestSquare(sofaCutout: Buffer, fraction = 0.07): Promise<Buffer> {
  const meta = await sharp(sofaCutout).metadata();
  const fullW = meta.width || 1;
  const fullH = meta.height || 1;
  const W = Math.min(480, fullW);
  const H = Math.max(1, Math.round((fullH * W) / fullW));
  const { data } = await sharp(sofaCutout).resize(W, H).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const gray = new Float32Array(W * H);
  const solid = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    solid[i] = data[i * 4 + 3] > 250 ? 1 : 0;
  }
  // 积分图：梯度、亮度、不透明像素数
  const iw = W + 1;
  const gradI = new Float64Array(iw * (H + 1));
  const lumI = new Float64Array(iw * (H + 1));
  const solidI = new Float64Array(iw * (H + 1));
  for (let y = 0; y < H; y++) {
    let rg = 0;
    let rl = 0;
    let rs = 0;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const gx = x + 1 < W ? Math.abs(gray[i + 1] - gray[i]) : 0;
      const gy = y + 1 < H ? Math.abs(gray[i + W] - gray[i]) : 0;
      rg += gx + gy;
      rl += gray[i];
      rs += solid[i];
      const j = (y + 1) * iw + (x + 1);
      gradI[j] = gradI[y * iw + (x + 1)] + rg;
      lumI[j] = lumI[y * iw + (x + 1)] + rl;
      solidI[j] = solidI[y * iw + (x + 1)] + rs;
    }
  }
  const sum = (I: Float64Array, x: number, y: number, s: number) => I[(y + s) * iw + (x + s)] - I[y * iw + (x + s)] - I[(y + s) * iw + x] + I[y * iw + x];
  const side = Math.max(12, Math.round(W * fraction));
  // 沙发整体的亮度中位水平，用来避开阴影里的暗区和高光
  const lums: number[] = [];
  for (let i = 0; i < W * H; i += 7) if (solid[i]) lums.push(gray[i]);
  lums.sort((a, b) => a - b);
  const median = lums.length ? lums[Math.floor(lums.length / 2)] : 128;
  let best: { x: number; y: number; score: number } | null = null;
  const step = Math.max(2, Math.round(side / 10));
  for (let y = 0; y + side <= H; y += step) {
    for (let x = 0; x + side <= W; x += step) {
      if (sum(solidI, x, y, side) < side * side) continue; // 整块必须都是沙发
      const area = side * side;
      const grad = sum(gradI, x, y, side) / area;
      const lum = sum(lumI, x, y, side) / area;
      const score = grad + Math.abs(lum - median) * 0.05;
      if (!best || score < best.score) best = { x, y, score };
    }
  }
  if (!best) return centerSquare(sofaCutout, 0.3);
  const k = fullW / W;
  const left = Math.max(0, Math.min(fullW - 1, Math.round(best.x * k)));
  const top = Math.max(0, Math.min(fullH - 1, Math.round(best.y * k)));
  const s = Math.max(1, Math.min(Math.round(side * k), fullW - left, fullH - top));
  return sharp(sofaCutout).extract({ left, top, width: s, height: s }).png().toBuffer();
}

/**
 * 皮革色卡：去掉座垫弧度带来的明暗渐变，只留均匀的底色和细颗粒（参考图的色卡是纯平的）。
 * 做法：原图 - 大半径模糊 + 模糊后的整体均值。
 */
export async function flattenSwatch(image: Buffer, size = 400): Promise<Buffer> {
  const base = await sharp(image, { failOn: 'none' }).rotate().removeAlpha().resize(size, size, { fit: 'cover' }).raw().toBuffer({ resolveWithObject: true });
  const blur = await sharp(base.data, { raw: { width: size, height: size, channels: 3 } }).blur(size / 6).raw().toBuffer();
  const mean = [0, 0, 0];
  for (let i = 0; i < size * size; i++) for (let c = 0; c < 3; c++) mean[c] += blur[i * 3 + c];
  for (let c = 0; c < 3; c++) mean[c] /= size * size;
  const out = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    for (let c = 0; c < 3; c++) {
      const v = base.data[i * 3 + c] - blur[i * 3 + c] + mean[c];
      out[i * 3 + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return sharp(out, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}

async function coverTo(image: Buffer, w: number, h: number, position: any = sharp.strategy.attention): Promise<Buffer> {
  return sharp(image, { failOn: 'none' }).rotate().resize(Math.round(w), Math.round(h), { fit: 'cover', position }).png().toBuffer();
}

async function circleOf(image: Buffer, d: number): Promise<Buffer> {
  const square = await coverTo(image, d, d, 'centre');
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="#fff"/></svg>`);
  return sharp(square).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

export interface FabricPosterInput {
  layout: FabricLayoutId;
  /** 已抠好的沙发（透明底 PNG） */
  sofa: Buffer;
  /** 已抠好的抱枕（透明底 PNG），可空 */
  pillows?: Buffer;
  /** 与 layout.photos 一一对应，缺的槽位留白 */
  photos: Array<Buffer | undefined>;
  /** 两个圆形细节（任意比例，会居中裁成正方形） */
  circles: Buffer[];
  /** 两块色卡：皮革、抱枕面料 */
  swatches: Array<Buffer | undefined>;
  code: string;
  label: string;
  /** 最右侧座位的座面（可以坐的水平面），相对裁剪后沙发图的 0~1 比例；有了它抱枕就落在座面上，没有就按版式比例放 */
  seat?: { x: number; y: number; w: number; h: number };
  /** 最右侧座位“靠背与座垫交界折缝”的中心点（相对裁剪后沙发图 0~1）；有了它抱枕底边就落在折缝上，比座面框更准 */
  seatCrease?: { x: number; y: number };
  /** 抱枕大小倍数，1 为按沙发宽度 22% 的基准；默认 0.8（参考图里抱枕都比较小，且两个大幅重叠） */
  pillowScale?: number;
  outputScale?: 1 | 2;
}

export interface FabricPosterResult {
  buffer: Buffer;
  width: number;
  height: number;
  layout: { sofa: Rect; pillows?: Rect };
}

export async function composeFabricPoster(input: FabricPosterInput): Promise<FabricPosterResult> {
  const S = input.outputScale === 2 ? 2 : 1;
  const L = FABRIC_LAYOUTS[input.layout];
  const W = FABRIC_SIZE.width * S;
  const H = FABRIC_SIZE.height * S;
  const layers: sharp.OverlayOptions[] = [];
  const sc = (r: Rect): Rect => ({ x: r.x * S, y: r.y * S, w: r.w * S, h: r.h * S });

  // 1) 氛围照
  for (let i = 0; i < L.photos.length; i++) {
    const photo = input.photos[i];
    if (!photo) continue;
    const r = sc(L.photos[i]);
    layers.push({ input: await coverTo(photo, r.w, r.h), left: Math.round(r.x), top: Math.round(r.y) });
  }

  // 2) 沙发：等比放进 sofaBox，左对齐、垂直居中
  const box = sc(L.sofaBox);
  const sofaMeta = await sharp(input.sofa).metadata();
  const sofaScale = Math.min(box.w / (sofaMeta.width || 1), box.h / (sofaMeta.height || 1));
  const sofaW = Math.max(1, Math.round((sofaMeta.width || 1) * sofaScale));
  const sofaH = Math.max(1, Math.round((sofaMeta.height || 1) * sofaScale));
  const sofaLeft = Math.round(box.x);
  const sofaTop = Math.round(box.y + (box.h - sofaH) / 2);
  layers.push({ input: await sharp(input.sofa).resize(sofaW, sofaH).png().toBuffer(), left: sofaLeft, top: sofaTop });
  const result: FabricPosterResult['layout'] = { sofa: { x: sofaLeft, y: sofaTop, w: sofaW, h: sofaH } };

  // 3) 抱枕：放在沙发右侧座位的座面上，并保证落在沙发实体内（不悬在沙发外、不掉到前立面下面）
  if (input.pillows) {
    const pMeta = await sharp(input.pillows).metadata();
    const ratio = (pMeta.height || 1) / (pMeta.width || 1);
    const scale = Math.min(1.8, Math.max(0.5, Number(input.pillowScale) || 0.8));
    // 沙发缩放后的不透明区域，用来做“不出轮廓”的兜底
    const sofaPng = await sharp(input.sofa).resize(sofaW, sofaH).ensureAlpha().raw().toBuffer();
    const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < sofaW && y < sofaH && sofaPng[(Math.round(y) * sofaW + Math.round(x)) * 4 + 3] > 128;

    const baseW = sofaW * 0.22;
    // 以沙发图左上角为原点的坐标：cx 水平中心，bottom 底边
    let cx = sofaW * 0.79;
    let bottom = sofaH * 0.13 + baseW * ratio;
    let pw = baseW * scale;
    if (input.seat) {
      const s = { x: input.seat.x * sofaW, y: input.seat.y * sofaH, w: input.seat.w * sofaW, h: input.seat.h * sofaH };
      // 抱枕靠着靠背立在座面后部：底边落在座面框上部（座垫与靠背交界附近），水平放在座位中间略偏内侧，
      // 不贴扶手。以前底边取 72%（座垫前沿）、中心取 55%（偏扶手），抱枕像立在座垫前角、悬空。
      cx = s.x + s.w * 0.45;
      bottom = s.y + s.h * 0.42;
      pw = Math.min(pw, s.w * 0.75);
    }
    // 折缝更准：座面框有时连座垫前立面一起框进来（抱枕就会偏低、悬在座垫中间），
    // 折缝就是抱枕靠着靠背时底边该落的位置；底边略压过折缝一点点，看起来是坐进去而不是悬着
    // 折缝框常常只框到座位的一端，水平位置仍取座面框（座位中间略偏内侧），高度取折缝
    if (input.seatCrease) {
      if (!input.seat) cx = input.seatCrease.x * sofaW;
      bottom = input.seatCrease.y * sofaH + pw * ratio * 0.08;
    }
    // 底边那一行：从水平中心向两侧找出连续的沙发实体范围；底边下面不是沙发就往上抬
    let by = Math.min(sofaH - 2, Math.max(2, Math.round(bottom)));
    for (let k = 0; k < 120 && !opaque(cx, by + 3); k++) by -= 2;
    bottom = by;
    let lo = Math.round(cx);
    let hi = Math.round(cx);
    while (lo > 0 && opaque(lo - 1, by)) lo--;
    while (hi < sofaW - 1 && opaque(hi + 1, by)) hi++;
    const room = hi - lo - 16;
    if (room > 20 && pw > room) pw = room;
    pw = Math.max(20, Math.round(pw));
    const ph = Math.round(pw * ratio);
    const left = Math.max(lo + 8, Math.min(hi - 8 - pw, cx - pw / 2));
    const top = Math.max(0, bottom - ph);
    const pillowRect = { x: Math.round(sofaLeft + left), y: Math.round(sofaTop + top), w: pw, h: Math.round(Math.min(ph, bottom - top)) };
    // 接触阴影：抱枕底部一条压扁的柔和暗影，让抱枕“压”在座垫上而不是贴上去的
    const shW = Math.round(pillowRect.w * 0.9);
    const shH = Math.max(6, Math.round(pillowRect.w * 0.12));
    const blur = Math.max(2, Math.round(shH * 0.35));
    const shadow = await sharp({
      create: { width: shW + blur * 4, height: shH + blur * 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .composite([
        {
          input: Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${shW + blur * 4}" height="${shH + blur * 4}"><ellipse cx="${(shW + blur * 4) / 2}" cy="${(shH + blur * 4) / 2}" rx="${shW / 2}" ry="${shH / 2}" fill="rgba(30,28,26,0.24)"/></svg>`
          )
        }
      ])
      .blur(blur)
      .png()
      .toBuffer();
    layers.push({
      input: shadow,
      left: Math.max(0, Math.round(pillowRect.x + (pillowRect.w - shW) / 2 - blur * 2)),
      top: Math.max(0, Math.round(pillowRect.y + pillowRect.h - shH * 0.8 - blur * 2))
    });
    layers.push({ input: await sharp(input.pillows).resize(pillowRect.w, pillowRect.h, { fit: 'fill' }).png().toBuffer(), left: pillowRect.x, top: pillowRect.y });
    result.pillows = pillowRect;
  }

  // 4) 底部：两个圆形细节 + 两块色卡
  for (let i = 0; i < L.circles.length; i++) {
    const src = input.circles[i];
    if (!src) continue;
    const r = sc(L.circles[i]);
    layers.push({ input: await circleOf(src, Math.round(r.w)), left: Math.round(r.x), top: Math.round(r.y) });
  }
  for (let i = 0; i < L.swatches.length; i++) {
    const src = input.swatches[i];
    if (!src) continue;
    const r = sc(L.swatches[i]);
    layers.push({ input: await coverTo(src, r.w, r.h, 'centre'), left: Math.round(r.x), top: Math.round(r.y) });
  }

  // 5) 文字：型号（左上）、色卡编号（第一块色卡下方居中）
  const code = input.code.trim();
  if (code) {
    const t = await renderText(code, { role: 'sans', size: L.code.size * S, weight: 500, color: '#111111', letterSpacingEm: 0.02 });
    layers.push({ input: t.buffer, left: Math.round(L.code.x * S), top: Math.round(L.code.y * S) });
  }
  const label = input.label.trim();
  if (label) {
    const t = await renderText(label, { role: 'serif', size: L.label.size * S, weight: 500, color: '#111111', letterSpacingEm: 0.03 });
    layers.push({ input: t.buffer, left: Math.round(L.label.cx * S - t.width / 2), top: Math.round(L.label.y * S) });
  }

  const buffer = await sharp({ create: { width: W, height: H, channels: 3, background: '#FFFFFF' } })
    .composite(layers)
    .jpeg({ quality: 92 })
    .toBuffer();
  return { buffer, width: W, height: H, layout: result };
}
