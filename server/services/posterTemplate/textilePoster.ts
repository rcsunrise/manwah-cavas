import sharp from 'sharp';
import { renderText } from './posterFonts';

/**
 * 面料色卡海报（模板 C）排版。参考图里有三种版式，位置都是固定比例，画布 A4 横版 2000×1414：
 *
 *   slant（苔原绒）：右侧大面料被一条斜线切开，底部一条半透明文字带；左上氛围图，左下 2×3 圆角色卡
 *   hex（安贝儿）  ：右侧大面料是向左突出的六边形，外面套一圈白描边；左侧氛围图，右下一排圆角色卡
 *   circle（星点粗花呢）：左侧大圆形面料横穿文字带；右上氛围图，右下圆形色卡
 *
 * 背景色取自主面料（降低饱和、压到中间明度），文字是真实字体，图片全部来自用户的面料照片/氛围图。
 */
export const TEXTILE_SIZE = { width: 2000, height: 1414 } as const;
export type TextileLayoutId = 'slant' | 'hex' | 'circle';
export const TEXTILE_LAYOUT_IDS: TextileLayoutId[] = ['slant', 'hex', 'circle'];
/** 氛围图用规整格子拼块的版式（竖框） */
const usesMosaic = (l: TextileLayoutId) => l === 'hex';
export const TEXTILE_MAX_SWATCHES = 6;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
type Pt = [number, number];

interface TextileLayout {
  hero: { polygon?: Pt[]; circle?: { cx: number; cy: number; r: number } };
  /** 白描边：折线（不闭合）或圆 */
  outline: { points?: Pt[]; circle?: { cx: number; cy: number; r: number }; width: number };
  band: { y: number; h: number };
  title: { x: number; y: number; size: number };
  desc: { x: number; y: number; size: number; maxWidth: number; lineGap: number; maxBottom: number; letterSpacingEm: number };
  code: { x: number; y: number; size: number; align: 'left' | 'right' };
  moodFrame: Rect;
  swatch: { shape: 'round' | 'circle'; size: number; slots: Array<{ x: number; y: number }> };
}

function rowRight(count: number, size: number, gap: number, right: number, y: number) {
  return Array.from({ length: count }, (_, i) => ({ x: right - size - (count - 1 - i) * (size + gap), y }));
}

export const TEXTILE_LAYOUTS: Record<TextileLayoutId, TextileLayout> = {
  slant: {
    hero: { polygon: [[1245, 0], [2000, 0], [2000, 1414], [1640, 1414], [845, 1178]] },
    outline: { points: [[1245, 0], [845, 1178], [1640, 1414]], width: 9 },
    band: { y: 905, h: 310 },
    title: { x: 945, y: 925, size: 60 },
    desc: { x: 945, y: 1012, size: 24, maxWidth: 1000, lineGap: 20, maxBottom: 1200, letterSpacingEm: 0.08 },
    code: { x: 1990, y: 1352, size: 36, align: 'right' },
    moodFrame: { x: 85, y: 68, w: 960, h: 822 },
    swatch: {
      shape: 'round',
      size: 198,
      slots: [
        { x: 80, y: 935 }, { x: 313, y: 935 }, { x: 545, y: 935 },
        { x: 80, y: 1162 }, { x: 313, y: 1162 }, { x: 545, y: 1162 }
      ]
    }
  },
  hex: {
    hero: { polygon: [[1035, 60], [2000, 60], [2000, 1050], [1045, 1050], [785, 632]] },
    outline: { points: [[2000, 157], [1040, 157], [787, 632], [1040, 1112], [2000, 1112]], width: 7 },
    band: { y: 722, h: 268 },
    title: { x: 975, y: 733, size: 42 },
    desc: { x: 985, y: 795, size: 27, maxWidth: 940, lineGap: 34, maxBottom: 985, letterSpacingEm: 0.12 },
    code: { x: 60, y: 1255, size: 40, align: 'left' },
    moodFrame: { x: 35, y: 120, w: 700, h: 970 },
    swatch: { shape: 'round', size: 172, slots: rowRight(6, 172, 45, 1968, 1185) }
  },
  circle: {
    hero: { circle: { cx: 350, cy: 760, r: 790 } },
    outline: { circle: { cx: 350, cy: 760, r: 790 }, width: 7 },
    band: { y: 278, h: 322 },
    title: { x: 30, y: 322, size: 52 },
    desc: { x: 24, y: 400, size: 22, maxWidth: 990, lineGap: 22, maxBottom: 545, letterSpacingEm: 0.06 },
    code: { x: 1030, y: 560, size: 26, align: 'right' },
    moodFrame: { x: 855, y: 55, w: 1130, h: 835 },
    swatch: {
      shape: 'circle',
      size: 235,
      slots: [
        { x: 1190, y: 905 }, { x: 1450, y: 905 }, { x: 1710, y: 905 },
        { x: 1030, y: 1145 }, { x: 1290, y: 1145 }, { x: 1550, y: 1145 }
      ]
    }
  }
};

export function textileLayoutOf(value: unknown): TextileLayoutId {
  return TEXTILE_LAYOUT_IDS.includes(value as TextileLayoutId) ? (value as TextileLayoutId) : 'slant';
}

/** 氛围图在对应版式里的槽位数（用于决定出几张图、每张什么画幅） */
/**
 * 氛围图拼贴（按参考图）：第一张铺满整个白框做底图，其余作为带白边的小图叠放在上面。
 *   slant（苔原绒）：右侧两张竖图上下错开叠放
 *   circle（星点粗花呢）：左侧两张竖图错开叠放，右上一张
 *   hex（安贝儿）：竖框，规整的田字/上下拼块（参考图就是格子拼贴）
 * 返回顺序就是绘制顺序。
 */
/** 归一化框（0~1，相对图片） */
export interface PersonBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

type CollageRect = Rect & { inset?: boolean };

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** 每种版式的小图摆法候选（相对底图的比例：x, y, w, h）。按参考图：小图贴着框边叠放，不压在中间 */
const INSET_CANDIDATES: Record<'slant' | 'circle', number[][][]> = {
  slant: [
    [[0.56, 0.05, 0.3, 0.54], [0.64, 0.38, 0.31, 0.56], [0.04, 0.62, 0.24, 0.32]],
    [[0.68, 0.04, 0.28, 0.45], [0.68, 0.52, 0.28, 0.44], [0.4, 0.64, 0.25, 0.32]],
    [[0.14, 0.05, 0.3, 0.54], [0.05, 0.38, 0.31, 0.56], [0.72, 0.62, 0.24, 0.32]],
    [[0.04, 0.04, 0.28, 0.45], [0.04, 0.52, 0.28, 0.44], [0.35, 0.64, 0.25, 0.32]],
    [[0.74, 0.04, 0.22, 0.36], [0.74, 0.6, 0.22, 0.36], [0.04, 0.04, 0.22, 0.36]]
  ],
  // 圆形版：大圆压住框的左下，小图只能放在大圆右边
  circle: [
    [[0.25, 0.06, 0.2, 0.5], [0.31, 0.43, 0.18, 0.5], [0.72, 0.06, 0.24, 0.4]],
    [[0.74, 0.05, 0.22, 0.44], [0.74, 0.52, 0.22, 0.43], [0.27, 0.05, 0.2, 0.42]],
    [[0.26, 0.05, 0.21, 0.44], [0.5, 0.05, 0.21, 0.44], [0.74, 0.05, 0.22, 0.44]],
    [[0.78, 0.04, 0.18, 0.3], [0.78, 0.66, 0.18, 0.3], [0.27, 0.04, 0.18, 0.3]]
  ]
};

/**
 * 氛围图拼贴（按参考图）：第一张铺满整个白框做底图，其余作为带白边的小图叠放在上面。
 *   slant（苔原绒）/ circle（星点粗花呢）：小图贴边叠放；有人物时从候选摆法里挑压住人物最少的一种，
 *     实在避不开就把小图缩小、再不行就少放一张——人物不被遮挡优先于多放图（参考图里人物都是完整的）
 *   hex（安贝儿）：竖框，规整的格子拼块（参考图就是格子拼贴）
 * avoid 是底图上人物所在的画布矩形。返回顺序就是绘制顺序。
 */
export function moodCollage(layout: TextileLayoutId, count: number, avoid?: Rect[], variant = 0): CollageRect[] {
  const frame = TEXTILE_LAYOUTS[layout].moodFrame;
  const n = Math.max(1, Math.min(4, count));
  if (usesMosaic(layout)) return mosaic(frame, n, variant);
  const p = 6;
  const inner = { x: frame.x + p, y: frame.y + p, w: frame.w - p * 2, h: frame.h - p * 2 };
  const rel = (f: number[], k = 1): CollageRect => {
    const w = inner.w * f[2] * k;
    const h = inner.h * f[3] * k;
    // 缩小时向最近的框边靠
    const cx = inner.x + inner.w * (f[0] + f[2] / 2);
    const cy = inner.y + inner.h * (f[1] + f[3] / 2);
    const toRight = cx > inner.x + inner.w / 2;
    const toBottom = cy > inner.y + inner.h / 2;
    const x = toRight ? inner.x + inner.w * (f[0] + f[2]) - w : inner.x + inner.w * f[0];
    const y = toBottom ? inner.y + inner.h * (f[1] + f[3]) - h : inner.y + inner.h * f[1];
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), inset: true };
  };
  const want = n - 1;
  const all = INSET_CANDIDATES[layout as 'slant' | 'circle'];
  const shift = ((variant % all.length) + all.length) % all.length;
  const cands = [...all.slice(shift), ...all.slice(0, shift)];
  const people = (avoid || []).filter(a => a.w > 0 && a.h > 0);
  if (!people.length || want === 0) return [inner, ...cands[0].slice(0, want).map(f => rel(f))];
  // 人物框外扩一点，留出呼吸空间
  const grow = people.map(a => ({ x: a.x - a.w * 0.06, y: a.y - a.h * 0.04, w: a.w * 1.12, h: a.h * 1.08 }));
  const personArea = grow.reduce((t, a) => t + a.w * a.h, 0);
  const cover = (rects: CollageRect[]) => rects.reduce((t, r) => t + grow.reduce((u, a) => u + overlapArea(r, a), 0), 0) / personArea;
  let best: { rects: CollageRect[]; score: number } | null = null;
  for (const k of [1, 0.82]) {
    for (const c of cands) {
      const rects = c.slice(0, want).map(f => rel(f, k));
      const score = cover(rects) + (1 - k) * 0.05; // 同样不遮挡时优先大图
      if (!best || score < best.score) best = { rects, score };
    }
    if (best && best.score < 0.02) break;
  }
  // 人物占满大半个画面、小图怎么摆都会压到人：改成并排拼贴（参考图常见做法）——人物单独占一大格，其余图在旁边一列
  if (best!.score >= 0.02) {
    const pc = grow.reduce((t, a) => t + (a.x + a.w / 2) * a.w * a.h, 0) / personArea;
    const g = 6;
    if (layout === 'circle') {
      // 左侧被大圆压住：人物在右，小图在大圆右边那一窄列
      const colX = inner.x + inner.w * 0.25;
      const colW = inner.w * 0.23;
      const baseX = colX + colW + g;
      const baseR: CollageRect = { x: Math.round(baseX), y: inner.y, w: Math.round(inner.x + inner.w - baseX), h: inner.h };
      const cellH = (inner.h - g * (want - 1)) / want;
      return [baseR, ...Array.from({ length: want }, (_, i) => ({ x: Math.round(colX), y: Math.round(inner.y + i * (cellH + g)), w: Math.round(colW), h: Math.round(cellH) }))];
    }
    const baseW = inner.w * 0.6;
    const onLeft = pc < inner.x + inner.w / 2;
    const baseR: CollageRect = { x: onLeft ? inner.x : Math.round(inner.x + inner.w - baseW), y: inner.y, w: Math.round(baseW), h: inner.h };
    const colX = onLeft ? inner.x + baseW + g : inner.x;
    const colW = inner.w - baseW - g;
    const cellH = (inner.h - g * (want - 1)) / want;
    return [baseR, ...Array.from({ length: want }, (_, i) => ({ x: Math.round(colX), y: Math.round(inner.y + i * (cellH + g)), w: Math.round(colW), h: Math.round(cellH) }))];
  }
  // 少量压到人：去掉压得最多的小图，直到基本不遮挡
  let rects = best!.rects;
  while (rects.length && cover(rects) > 0.04) {
    const worst = rects.reduce((wi, r, i) => (grow.reduce((u, a) => u + overlapArea(r, a), 0) > grow.reduce((u, a) => u + overlapArea(rects[wi], a), 0) ? i : wi), 0);
    rects = rects.filter((_, i) => i !== worst);
  }
  return [inner, ...rects];
}

/**
 * 人物抠图（不依赖模型）：
 *  - 图片本身带透明通道 → 直接用；
 *  - 否则取四周边缘的主色当背景，从边缘泛洪（纯白影棚背景、素色秀场背景都行）；
 *  - 边缘颜色太杂（真实街景/室内）→ 返回 null，调用方改用普通拼贴。
 * box 是视觉模型框出的人物位置（归一化），给了就先裁到人物附近再抠。
 * 返回裁掉空白边的 RGBA PNG。
 */
export async function cutoutPersonByBorder(input: Buffer, box?: PersonBox | null): Promise<Buffer | null> {
  const base = await sharp(input, { failOn: 'none' }).rotate().png().toBuffer();
  const meta0 = await sharp(base).metadata();
  const sw = meta0.width || 0;
  const sh = meta0.height || 0;
  if (!sw || !sh) return null;
  let img = sharp(base);
  if (box) {
    const gx = box.width * 0.06;
    const gy = box.height * 0.04;
    const l = Math.max(0, Math.floor((box.left - gx) * sw));
    const t = Math.max(0, Math.floor((box.top - gy) * sh));
    const r = Math.min(sw, Math.ceil((box.left + box.width + gx) * sw));
    const b = Math.min(sh, Math.ceil((box.top + box.height + gy) * sh));
    if (r - l > 16 && b - t > 16) img = img.extract({ left: l, top: t, width: r - l, height: b - t });
  }
  const { data: rgba, info } = await img
    .resize({ width: 1500, height: 1500, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const N = w * h;
  const fg = new Uint8Array(N);
  let hasAlpha = false;
  for (let i = 0; i < N; i++) {
    if (rgba[i * 4 + 3] < 250) {
      hasAlpha = true;
      break;
    }
  }
  if (hasAlpha) {
    for (let i = 0; i < N; i++) fg[i] = rgba[i * 4 + 3] > 40 ? 1 : 0;
  } else {
    const border: number[] = [];
    for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
    const med = (c: number) => {
      const v = border.map(i => rgba[i * 4 + c]).sort((a, b) => a - b);
      return v[Math.floor(v.length / 2)];
    };
    const bgc = [med(0), med(1), med(2)];
    const TOL = 46;
    const near = (i: number) => Math.hypot(rgba[i * 4] - bgc[0], rgba[i * 4 + 1] - bgc[1], rgba[i * 4 + 2] - bgc[2]) < TOL;
    const okShare = border.filter(near).length / border.length;
    if (okShare < 0.72) return null; // 边缘不是素色背景
    const bg = new Uint8Array(N);
    const q = new Uint32Array(N);
    let head = 0;
    let tail = 0;
    const push = (i: number) => {
      if (!bg[i] && near(i)) {
        bg[i] = 1;
        q[tail++] = i;
      }
    };
    border.forEach(push);
    while (head < tail) {
      const i = q[head++];
      const x = i % w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (i >= w) push(i - w);
      if (i < N - w) push(i + w);
    }
    for (let i = 0; i < N; i++) fg[i] = bg[i] ? 0 : 1;
  }
  // 只留最大的一块主体（去掉零星色块）
  const label = new Int32Array(N);
  let best = 0;
  let bestId = 0;
  let id = 0;
  const stack = new Uint32Array(N);
  for (let s0 = 0; s0 < N; s0++) {
    if (!fg[s0] || label[s0]) continue;
    id++;
    let sp = 0;
    let size = 0;
    stack[sp++] = s0;
    label[s0] = id;
    while (sp) {
      const i = stack[--sp];
      size++;
      const x = i % w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < N - w ? i + w : -1];
      for (const j of nb) {
        if (j >= 0 && fg[j] && !label[j]) {
          label[j] = id;
          stack[sp++] = j;
        }
      }
    }
    if (size > best) {
      best = size;
      bestId = id;
    }
  }
  const ratio = best / N;
  if (ratio < 0.1 || ratio > 0.88) return null; // 抠出来太小/几乎整张图：不是干净的人物图
  const alpha = Buffer.alloc(N);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < N; i++) {
    if (label[i] !== bestId) continue;
    alpha[i] = 255;
    const x = i % w;
    const y = (i - x) / w;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  // 边缘柔化并略收一圈，去掉背景色的毛边
  const soft = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } }).blur(1.4).linear(3, -256).extractChannel(0).raw().toBuffer();
  const out = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    out[i * 4] = rgba[i * 4];
    out[i * 4 + 1] = rgba[i * 4 + 1];
    out[i * 4 + 2] = rgba[i * 4 + 2];
    out[i * 4 + 3] = soft[i];
  }
  const pad = 3;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  return sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left, top, width: Math.min(w - left, maxX - minX + 1 + pad * 2), height: Math.min(h - top, maxY - minY + 1 + pad * 2) })
    .png()
    .toBuffer();
}

/** 贴纸效果：抠好的人物 + 白色描边 + 柔和投影，返回带透明边距的 PNG 和边距 */
export async function stickerizePerson(cutout: Buffer, w: number, h: number, outline: number, shadowAlpha = 0.34): Promise<{ buffer: Buffer; pad: number }> {
  const pad = Math.round(outline * 2 + 22);
  const person = await sharp(cutout).resize(Math.round(w), Math.round(h), { fit: 'fill' }).ensureAlpha().png().toBuffer();
  const padded = await sharp(person).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
  const W = Math.round(w) + pad * 2;
  const H = Math.round(h) + pad * 2;
  const alphaOnly = await sharp(padded).extractChannel(3).raw().toBuffer();
  // 白边：把透明度向外“膨胀”outline 像素（模糊后取低阈值）
  const dil = await sharp(alphaOnly, { raw: { width: W, height: H, channels: 1 } }).blur(Math.max(1, outline * 0.8)).threshold(14).blur(1.1).extractChannel(0).raw().toBuffer();
  const white = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .joinChannel(dil, { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toBuffer();
  const shadowA = await sharp(dil, { raw: { width: W, height: H, channels: 1 } }).blur(outline * 1.1).linear(shadowAlpha, 0).extractChannel(0).raw().toBuffer();
  const shadow = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .joinChannel(shadowA, { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toBuffer();
  const buffer = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: shadow, left: 0, top: Math.round(outline * 0.7) },
      { input: white, left: 0, top: 0 },
      { input: padded, left: 0, top: 0 }
    ])
    .png()
    .toBuffer();
  return { buffer, pad };
}

/**
 * 按“保住人物”的方式铺满 w×h：等比放大到盖满，裁切窗口以人物为中心（水平居中、垂直尽量保住头部），
 * 返回裁好的图和人物在输出图里的位置（像素）。没有人物框时用 sharp 的 attention 策略。
 */
export async function coverKeep(image: Buffer, w: number, h: number, person?: PersonBox | null): Promise<{ buffer: Buffer; person: Rect | null }> {
  const W = Math.max(1, Math.round(w));
  const H = Math.max(1, Math.round(h));
  if (!person) return { buffer: await coverTo(image, W, H), person: null };
  const meta = await sharp(image, { failOn: 'none' }).rotate().metadata();
  const swap = (meta.orientation || 1) >= 5;
  const iw = (swap ? meta.height : meta.width) || 1;
  const ih = (swap ? meta.width : meta.height) || 1;
  const sc = Math.max(W / iw, H / ih);
  const cw = Math.min(iw, Math.round(W / sc));
  const ch = Math.min(ih, Math.round(H / sc));
  const px = person.left * iw;
  const py = person.top * ih;
  const pw = person.width * iw;
  const ph = person.height * ih;
  let left = Math.round(px + pw / 2 - cw / 2);
  // 人比窗口高：保住头部（从人物顶部往上留 4%）；否则人物垂直居中
  let top = ph > ch ? Math.round(py - ch * 0.04) : Math.round(py + ph / 2 - ch / 2);
  left = Math.max(0, Math.min(iw - cw, left));
  top = Math.max(0, Math.min(ih - ch, top));
  const buffer = await sharp(image, { failOn: 'none' }).rotate().extract({ left, top, width: cw, height: ch }).resize(W, H, { fit: 'fill' }).png().toBuffer();
  const k = W / cw;
  const rx = Math.max(0, (px - left) * k);
  const ry = Math.max(0, (py - top) * k);
  const rr = Math.min(W, (px + pw - left) * k);
  const rb = Math.min(H, (py + ph - top) * k);
  return { buffer, person: rr > rx && rb > ry ? { x: rx, y: ry, w: rr - rx, h: rb - ry } : null };
}

export function textileMoodAspectFor(layout: TextileLayoutId, count: number, index: number): string {
  const rects = moodCollage(layout, Math.max(1, Math.min(4, count)));
  const r = rects[Math.min(index, rects.length - 1)];
  const ratio = r.w / r.h;
  if (ratio < 0.62) return '9:16';
  if (ratio < 0.72) return '2:3';
  if (ratio < 0.85) return '3:4';
  if (ratio < 1.15) return '1:1';
  if (ratio < 1.45) return '4:3';
  return '16:9';
}

/* ───────── 颜色 ───────── */

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h *= 60;
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}

export function luminanceOf(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * 海报底色：取主面料色，降低饱和、把明度拉到中间段——深色面料底色略提亮，浅色面料底色压深，
 * 这样白色描边、白色文字都读得清（对照参考图：藏青→灰蓝、橄榄→深橄榄、驼色→棕褐）。
 */
export function deriveBackground(mainHex: string): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(mainHex));
  const s2 = Math.max(0.04, Math.min(0.5, s * 0.6));
  const l2 = Math.max(0.22, Math.min(0.55, 0.2 + 0.5 * l));
  return rgbToHex(...hslToRgb(h, s2, l2));
}

export function darkenHex(hex: string, k: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - k), g * (1 - k), b * (1 - k));
}

/** 粗略的中文色名，用于默认文案和出图描述 */
export function colorNameZh(hex: string): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  if (l < 0.13) return '墨黑';
  if (l > 0.9 && s < 0.25) return '米白';
  if (s < 0.1) return l < 0.35 ? '炭灰' : l < 0.65 ? '中灰' : '浅灰';
  if (h < 15 || h >= 345) return l > 0.65 ? '粉' : l < 0.3 ? '酒红' : '红';
  if (h < 40) return l > 0.7 ? '杏色' : l < 0.35 ? '咖啡棕' : s > 0.6 ? '橙' : '驼色';
  if (h < 50) return l > 0.75 ? '奶油黄' : l < 0.3 ? '橄榄褐' : '芥黄';
  if (h < 75) return l > 0.75 ? '奶油黄' : l < 0.45 ? '橄榄绿' : '芥黄';
  if (h < 100) return l < 0.4 ? '橄榄绿' : '苔绿';
  if (h < 160) return l < 0.3 ? '墨绿' : '草绿';
  if (h < 200) return l < 0.35 ? '孔雀蓝绿' : '青绿';
  if (h < 250) return l < 0.3 ? '藏青' : l < 0.55 ? '蓝' : '雾蓝';
  if (h < 300) return l < 0.35 ? '深紫' : '紫';
  return '玫红';
}

/* ───────── 面料分析：避开标签纸，取干净的面料区域和主色 ───────── */

export interface FabricAnalysis {
  /** 面料平均色（取自干净区域） */
  color: string;
  /** 干净面料区域，原图（已按 EXIF 转正）像素坐标 */
  region: { left: number; top: number; width: number; height: number };
  srcWidth: number;
  srcHeight: number;
  /** 照片里是否有白色标签纸（Item No / Col No 那种） */
  hasLabel: boolean;
}

function maxRectangle(mask: Uint8Array, w: number, h: number): Rect & { area: number } {
  const heights = new Int32Array(w);
  let best = { x: 0, y: 0, w: 0, h: 0, area: 0 };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) heights[x] = mask[y * w + x] ? heights[x] + 1 : 0;
    const stack: number[] = [];
    for (let x = 0; x <= w; x++) {
      const cur = x === w ? 0 : heights[x];
      while (stack.length && heights[stack[stack.length - 1]] >= cur) {
        const hh = heights[stack.pop()!];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const ww = x - left;
        if (hh * ww > best.area) best = { x: left, y: y - hh + 1, w: ww, h: hh, area: hh * ww };
      }
      stack.push(x);
    }
  }
  return best;
}

function maxSquare(mask: Uint8Array, w: number, h: number): Rect & { area: number } {
  const dp = new Int32Array(w * h);
  let best = { x: 0, y: 0, w: 0, h: 0, area: 0 };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      const v = x > 0 && y > 0 ? Math.min(dp[y * w + x - 1], dp[(y - 1) * w + x], dp[(y - 1) * w + x - 1]) + 1 : 1;
      dp[y * w + x] = v;
      if (v * v > best.area) best = { x: x - v + 1, y: y - v + 1, w: v, h: v, area: v * v };
    }
  }
  return best;
}

function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  // mask 为 1 的位置向外扩 r 像素（先横后竖，近似方形）
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -1e9;
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) last = x;
      if (x - last <= r) tmp[y * w + x] = 1;
    }
    last = 1e9;
    for (let x = w - 1; x >= 0; x--) {
      if (mask[y * w + x]) last = x;
      if (last - x <= r) tmp[y * w + x] = 1;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let last = -1e9;
    for (let y = 0; y < h; y++) {
      if (tmp[y * w + x]) last = y;
      if (y - last <= r) out[y * w + x] = 1;
    }
    last = 1e9;
    for (let y = h - 1; y >= 0; y--) {
      if (tmp[y * w + x]) last = y;
      if (last - y <= r) out[y * w + x] = 1;
    }
  }
  return out;
}

/** 窗口里至少 frac 的像素为 1 才保留（去掉零星噪点） */
function despeckle(mask: Uint8Array, w: number, h: number, frac: number, r = 2): Uint8Array {
  const I = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += mask[y * w + x];
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      const x0 = Math.max(0, x - r);
      const y0 = Math.max(0, y - r);
      const x1 = Math.min(w, x + r + 1);
      const y1 = Math.min(h, y + r + 1);
      const cnt = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      if (cnt >= (x1 - x0) * (y1 - y0) * frac) out[y * w + x] = 1;
    }
  }
  return out;
}

/**
 * 在面料样卡照片里找“干净的主色面料区域”。
 * 样卡照片上常有：白色标签纸、吊牌/衬卡、桌面，以及并排的好几个色带。做法：
 *  1. 定锚点颜色：标签纸旁边的颜色（标签贴在哪个色上就是哪个色）→ 调用方给的 hintColor → 照片正中间的颜色；
 *  2. 不属于面料的像素一律挡掉：与锚点明显是另一块颜色的、近白的纸张/标签、以及“平整无纹理”的东西（标签纸、衬卡、桌面；面料有纹理）；
 *  3. 在剩下的像素里取最大的矩形。
 * 白色面料的照片整体是白的，不能按“近白”挡，只按平整度挡。
 */
export async function analyzeFabric(input: Buffer, hintColor?: string): Promise<FabricAnalysis> {
  const meta = await sharp(input, { failOn: 'none' }).metadata();
  const swap = (meta.orientation || 1) >= 5;
  const srcWidth = (swap ? meta.height : meta.width) || 1;
  const srcHeight = (swap ? meta.width : meta.height) || 1;
  const small = await sharp(input, { failOn: 'none' }).rotate().resize({ width: 400, withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = small.info.width;
  const h = small.info.height;
  const n = w * h;
  const raw = small.data;
  const blurred = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).blur(1.2).raw().toBuffer();
  const px = (i: number) => [blurred[i * 3], blurred[i * 3 + 1], blurred[i * 3 + 2]] as const;

  // 近白：按曝光自适应门槛
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[Math.min(blurred[i * 3], blurred[i * 3 + 1], blurred[i * 3 + 2])]++;
  let acc = 0;
  let p995 = 255;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= n * 0.005) {
      p995 = v;
      break;
    }
  }
  const whiteMin = Math.max(170, Math.min(205, Math.round(p995 * 0.9)));
  const white = new Uint8Array(n);
  let whiteCount = 0;
  for (let i = 0; i < n; i++) {
    const [r, g, b] = px(i);
    if (Math.min(r, g, b) >= whiteMin && Math.max(r, g, b) - Math.min(r, g, b) <= 24) {
      white[i] = 1;
      whiteCount++;
    }
  }

  // 平整度：局部亮度标准差（3×3，未模糊的原图），低于整张图中位数 35% 视为平整（标签纸、衬卡、桌面）
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = 0.299 * raw[i * 3] + 0.587 * raw[i * 3 + 1] + 0.114 * raw[i * 3 + 2];
  const sd = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let s = 0;
      let s2 = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const v = lum[(y + dy) * w + x + dx];
          s += v;
          s2 += v * v;
        }
      }
      sd[y * w + x] = Math.sqrt(Math.max(0, s2 / 9 - (s / 9) * (s / 9)));
    }
  }
  const sorted = Float32Array.from(sd).sort();
  const medianSd = sorted[Math.floor(n / 2)] || 1;
  const flatRaw = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (sd[i] < medianSd * 0.35) flatRaw[i] = 1;
  // 零星的平整像素（面料里的高光）不算，要成片才算
  // 整张图都没有纹理（纯色图、过度磨皮）时平整度没有区分力，不用它挡
  const flat = medianSd < 1.5 ? new Uint8Array(n) : despeckle(flatRaw, w, h, 0.6);
  // 白色面料 = 近白且有纹理的像素很多；标签纸/桌面虽然白，但是平整的，不算
  let whiteTextured = 0;
  for (let i = 0; i < n; i++) if (white[i] && !flat[i]) whiteTextured++;

  const toSrc = (r: Rect) => {
    const left = Math.max(0, Math.min(srcWidth - 1, Math.round((r.x / w) * srcWidth)));
    const top = Math.max(0, Math.min(srcHeight - 1, Math.round((r.y / h) * srcHeight)));
    return {
      left,
      top,
      width: Math.max(1, Math.min(srcWidth - left, Math.round((r.w / w) * srcWidth))),
      height: Math.max(1, Math.min(srcHeight - top, Math.round((r.h / h) * srcHeight)))
    };
  };
  const avgOf = (r: Rect) => {
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let c = 0;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const [pr, pg, pb] = px(y * w + x);
        sr += pr;
        sg += pg;
        sb += pb;
        c++;
      }
    }
    return c ? rgbToHex(sr / c, sg / c, sb / c) : '#808080';
  };
  const centerBox = (f: number): Rect => ({ x: Math.round((w * (1 - f)) / 2), y: Math.round((h * (1 - f)) / 2), w: Math.round(w * f), h: Math.round(h * f) });

  // 标签纸：不碰图像边缘的最大近白连通块；白色面料的照片里还要求块内是平整的（白面料有纹理）
  const findLabel = (requireFlat: boolean) => {
    const seen = new Uint8Array(n);
    let best: { minX: number; minY: number; maxX: number; maxY: number; count: number } | null = null;
    const stack: number[] = [];
    for (let s = 0; s < n; s++) {
      if (!white[s] || seen[s]) continue;
      seen[s] = 1;
      stack.push(s);
      let minX = w;
      let minY = h;
      let maxX = 0;
      let maxY = 0;
      let count = 0;
      let touches = false;
      let flatCount = 0;
      while (stack.length) {
        const i = stack.pop()!;
        const x = i % w;
        const y = (i - x) / w;
        count++;
        if (flat[i]) flatCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
        if (x > 0 && white[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
        if (x < w - 1 && white[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
        if (y > 0 && white[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); }
        if (y < h - 1 && white[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); }
      }
      const boxArea = (maxX - minX + 1) * (maxY - minY + 1);
      const isFlat = flatCount / count > 0.5;
      if (!touches && count / n >= 0.006 && count / boxArea >= 0.6 && (!requireFlat || isFlat) && (!best || count > best.count)) best = { minX, minY, maxX, maxY, count };
    }
    return best;
  };
  // 白色面料的照片：近白且有纹理的像素多，并且白色不是集中在一块标签纸上（标签照片里大块的白是那张纸，虽然字多不“平整”）
  const labelLoose = findLabel(false);
  const whiteFabric = whiteTextured / n > 0.25 && !(labelLoose && labelLoose.count >= whiteCount * 0.6);
  // 白面料照片里的标签：块不大、块里有深色文字（面料没有），就认它是标签
  const darkIn = (b: { minX: number; minY: number; maxX: number; maxY: number }) => {
    let dark = 0;
    for (let y = b.minY; y <= b.maxY; y++) for (let x = b.minX; x <= b.maxX; x++) if (lum[y * w + x] < 110) dark++;
    return dark / Math.max(1, (b.maxX - b.minX + 1) * (b.maxY - b.minY + 1));
  };
  const bboxFrac = (b: { minX: number; minY: number; maxX: number; maxY: number }) => ((b.maxX - b.minX + 1) * (b.maxY - b.minY + 1)) / n;
  const textLabel = labelLoose && bboxFrac(labelLoose) <= 0.35 && darkIn(labelLoose) >= 0.01 ? labelLoose : null;
  const label = whiteFabric ? textLabel || findLabel(true) : labelLoose;

  // 锚点颜色
  let anchor: [number, number, number] | null = null;
  if (label) {
    const pad = 3;
    const ring: number[] = [];
    for (let y = Math.max(0, label.minY - 14); y <= Math.min(h - 1, label.maxY + 14); y++) {
      for (let x = Math.max(0, label.minX - 14); x <= Math.min(w - 1, label.maxX + 14); x++) {
        const inside = x >= label.minX - pad && x <= label.maxX + pad && y >= label.minY - pad && y <= label.maxY + pad;
        if (!inside && !white[y * w + x] && !flat[y * w + x]) ring.push(y * w + x);
      }
    }
    if (ring.length > 20) anchor = [0, 1, 2].map(c => ring.reduce((a, i) => a + blurred[i * 3 + c], 0) / ring.length) as [number, number, number];
  }
  if (!anchor && hintColor && /^#[0-9a-fA-F]{6}$/.test(hintColor)) anchor = hexToRgb(hintColor);
  if (!anchor) anchor = hexToRgb(avgOf(centerBox(0.2)));
  const [aH, aS] = rgbToHsl(anchor[0], anchor[1], anchor[2]);

  // 挡掉：另一块颜色、纸张/标签（白面料照片除外）、平整物
  const diffOnly = new Uint8Array(n);
  const solidBlock = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const [r, g, b] = px(i);
    const [ph, ps] = rgbToHsl(r, g, b);
    const dh = Math.min(Math.abs(ph - aH), 360 - Math.abs(ph - aH));
    const hueDifferent = aS > 0.1 && ps > 0.15 && dh > 50;
    const farAway = Math.hypot(r - anchor[0], g - anchor[1], b - anchor[2]) > (whiteFabric ? 140 : 85);
    // 平整物只在“颜色和锚点不同”时才挡：短绒面料本身也可能很平整，不能整块误伤
    const dist = Math.hypot(r - anchor[0], g - anchor[1], b - anchor[2]);
    if ((flat[i] && dist > 45) || (!whiteFabric && white[i])) solidBlock[i] = 1;
    else if (hueDifferent || farAway) diffOnly[i] = 1;
  }
  if (label && bboxFrac(label) <= 0.4) {
    for (let y = Math.max(0, label.minY - 2); y <= Math.min(h - 1, label.maxY + 2); y++) {
      for (let x = Math.max(0, label.minX - 2); x <= Math.min(w - 1, label.maxX + 2); x++) solidBlock[y * w + x] = 1;
    }
  }
  // 零星的“另一种颜色”是纹理里的深色绒点，成片才算
  const diffKept = despeckle(diffOnly, w, h, 0.4);
  const blocked = new Uint8Array(n);
  for (let i = 0; i < n; i++) blocked[i] = diffKept[i] || solidBlock[i] ? 1 : 0;
  const grown = dilate(blocked, w, h, 2);
  const clean = new Uint8Array(n);
  for (let i = 0; i < n; i++) clean[i] = grown[i] ? 0 : 1;

  let r = maxRectangle(clean, w, h);
  if (Math.min(r.w, r.h) < 0.2 * Math.min(w, h)) r = maxSquare(clean, w, h);
  let ok: Rect | null = r.area >= n * 0.06 ? r : null;
  if (!ok) {
    // 平整物/异色一挡就碎成小块（短绒面料本身比较平整）：只保留“标签纸 + 近白”这两个最确定的遮挡再取一次
    const sure = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (!whiteFabric && white[i]) sure[i] = 1;
    if (label && bboxFrac(label) <= 0.4) {
      for (let y = Math.max(0, label.minY - 2); y <= Math.min(h - 1, label.maxY + 2); y++) {
        for (let x = Math.max(0, label.minX - 2); x <= Math.min(w - 1, label.maxX + 2); x++) sure[y * w + x] = 1;
      }
    }
    const sureGrown = dilate(sure, w, h, 2);
    const clean2 = new Uint8Array(n);
    for (let i = 0; i < n; i++) clean2[i] = sureGrown[i] ? 0 : 1;
    let r2 = maxRectangle(clean2, w, h);
    if (Math.min(r2.w, r2.h) < 0.2 * Math.min(w, h)) r2 = maxSquare(clean2, w, h);
    ok = r2.area >= n * 0.04 ? r2 : null;
  }
  if (!ok) ok = centerBox(0.5);
  return { color: avgOf(ok), region: toSrc(ok), srcWidth, srcHeight, hasLabel: Boolean(label) };
}


/** 在分析出的干净区域里，按目标宽高比取最大的一块并缩放（cover） */
export async function cropFabric(input: Buffer, a: FabricAnalysis, outW: number, outH: number): Promise<Buffer> {
  const { left, top, width, height } = a.region;
  const target = outW / outH;
  let cw = width;
  let ch = Math.round(width / target);
  if (ch > height) {
    ch = height;
    cw = Math.round(height * target);
  }
  const cl = left + Math.round((width - cw) / 2);
  const ct = top + Math.round((height - ch) / 2);
  const pipeline = sharp(input, { failOn: 'none' })
    .rotate()
    .extract({ left: Math.max(0, cl), top: Math.max(0, ct), width: Math.max(1, Math.min(cw, a.srcWidth - cl)), height: Math.max(1, Math.min(ch, a.srcHeight - ct)) })
    .resize(Math.round(outW), Math.round(outH), { fit: 'cover', kernel: 'lanczos3' });
  // 缩小后补一点锐化，绒毛/纱线的轮廓和参考图一样利落
  return pipeline.sharpen({ sigma: 0.7, m1: 0.6, m2: 1.2 }).png().toBuffer();
}

/**
 * 按“纹理尺度”填充：让目标宽度里大约能看到 span 倍照片宽度的面料（参考图的颗粒大小就是这个尺度：
 * 大图约 0.9 张照片宽、色卡约 0.25 张），而不是从干净区域里抠一块再放大（那样颗粒会大一倍、偏软）。
 * 干净区域在这个尺度下不够填满时，做成无缝贴片平铺补足（交叉渐变接缝，不是镜像，不会出现对称花纹），
 * 最多比“刚好填满”再缩小 maxZoomOut 倍，避免重复太明显。
 */
export async function textureFill(input: Buffer, a: FabricAnalysis, outW: number, outH: number, span: number, maxZoomOut = 2): Promise<Buffer> {
  const W = Math.max(1, Math.round(outW));
  const H = Math.max(1, Math.round(outH));
  const { left, top, width, height } = a.region;
  const sTarget = W / Math.max(1, a.srcWidth * span);
  const sCover = Math.max(W / width, H / height);
  // 区域够大：直接按目标尺度裁；不够大：在 sCover/maxZoomOut ~ sCover 之间取最接近目标的
  const s = sTarget >= sCover ? sTarget : Math.max(sTarget, sCover / maxZoomOut);
  const finish = (p: sharp.Sharp) => p.sharpen({ sigma: 0.8, m1: 0.7, m2: 1.6 }).linear(1.06, -128 * 0.06).png().toBuffer();
  if (s >= sCover) {
    const cw = Math.min(width, Math.round(W / s));
    const ch = Math.min(height, Math.round(H / s));
    const cl = left + Math.round((width - cw) / 2);
    const ct = top + Math.round((height - ch) / 2);
    return finish(sharp(input, { failOn: 'none' }).rotate().extract({ left: cl, top: ct, width: cw, height: ch }).resize(W, H, { fit: 'cover', kernel: 'lanczos3' }));
  }
  // 平铺：整块干净区域按 s 缩放，留出 overlap 做交叉渐变，得到上下左右都能无缝衔接的贴片
  const sw = Math.max(8, Math.round(width * s));
  const sh = Math.max(8, Math.round(height * s));
  const { data: S } = await sharp(input, { failOn: 'none' })
    .rotate()
    .extract({ left, top, width, height })
    .resize(sw, sh, { fit: 'fill', kernel: 'lanczos3' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const o = Math.max(4, Math.round(Math.min(sw, sh) * 0.22));
  const tw = sw - o;
  const th = sh - o;
  // 横向：x<o 的部分由“尾部 S(x+tw)”渐变到“头部 S(x)”，于是 R(tw-1)=S(tw-1) 与下一片的 R(0)=S(tw) 在原图里相邻
  const R1 = Buffer.alloc(tw * sh * 3);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < tw; x++) {
      const di = (y * tw + x) * 3;
      const si = (y * sw + x) * 3;
      if (x < o) {
        const t = x / o;
        const ti = (y * sw + x + tw) * 3;
        for (let c = 0; c < 3; c++) R1[di + c] = Math.round(S[ti + c] * (1 - t) + S[si + c] * t);
      } else {
        for (let c = 0; c < 3; c++) R1[di + c] = S[si + c];
      }
    }
  }
  const R2 = Buffer.alloc(tw * th * 3);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const di = (y * tw + x) * 3;
      const si = (y * tw + x) * 3;
      if (y < o) {
        const t = y / o;
        const ti = ((y + th) * tw + x) * 3;
        for (let c = 0; c < 3; c++) R2[di + c] = Math.round(R1[ti + c] * (1 - t) + R1[si + c] * t);
      } else {
        for (let c = 0; c < 3; c++) R2[di + c] = R1[si + c];
      }
    }
  }
  const tiled = await sharp(R2, { raw: { width: tw, height: th, channels: 3 } })
    .extend({ right: Math.max(0, W - tw), bottom: Math.max(0, H - th), extendWith: 'repeat' })
    .png()
    .toBuffer();
  return finish(sharp(tiled).extract({ left: 0, top: 0, width: W, height: H }));
}

/** 干净区域裁到目标宽高比后，放大到目标尺寸的倍数；大于 1 说明被放大（颗粒变粗、发糊） */
export function upscaleFactor(a: FabricAnalysis, outW: number, outH: number): number {
  const { width, height } = a.region;
  const cw = Math.min(width, Math.round(height * (outW / outH)));
  return outW / Math.max(1, cw);
}

/* ───────── 排版 ───────── */

/** 氛围图拼块：在 frame 内按张数切分（竖框上下排，横框左右排） */
export function mosaic(frame: Rect, count: number, variant = 0): Rect[] {
  const p = 6;
  const g = 6;
  const inner = { x: frame.x + p, y: frame.y + p, w: frame.w - p * 2, h: frame.h - p * 2 };
  const tall = inner.h > inner.w;
  const half = (len: number, ratio = 0.5) => [Math.round((len - g) * ratio), len - g - Math.round((len - g) * ratio)] as const;
  if (count <= 1) return [inner];
  if (count === 2) {
    if (tall) {
      const [a, b] = half(inner.h, variant % 2 === 1 ? 0.42 : 0.58);
      return [{ ...inner, h: a }, { x: inner.x, y: inner.y + a + g, w: inner.w, h: b }];
    }
    const [a, b] = half(inner.w, 0.58);
    return [{ ...inner, w: a }, { x: inner.x + a + g, y: inner.y, w: b, h: inner.h }];
  }
  const flip = variant % 2 === 1;
  if (count === 3) {
    if (tall) {
      const [a, b] = half(inner.h, flip ? 0.4 : 0.6);
      const [c, d] = half(inner.w, flip ? 0.4 : 0.5);
      if (flip) {
        // 变体：上面两张小图，下面一张大图
        return [
          { x: inner.x, y: inner.y + a + g, w: inner.w, h: b },
          { x: inner.x, y: inner.y, w: c, h: a },
          { x: inner.x + c + g, y: inner.y, w: d, h: a }
        ];
      }
      return [
        { x: inner.x, y: inner.y, w: inner.w, h: a },
        { x: inner.x, y: inner.y + a + g, w: c, h: b },
        { x: inner.x + c + g, y: inner.y + a + g, w: d, h: b }
      ];
    }
    const [a, b] = half(inner.w, 0.58);
    const [c, d] = half(inner.h);
    return [
      { x: inner.x, y: inner.y, w: a, h: inner.h },
      { x: inner.x + a + g, y: inner.y, w: b, h: c },
      { x: inner.x + a + g, y: inner.y + c + g, w: b, h: d }
    ];
  }
  const [cw1, cw2] = half(inner.w, flip ? 0.42 : 0.5);
  const [rh1, rh2] = half(inner.h, flip ? 0.6 : 0.5);
  return [
    { x: inner.x, y: inner.y, w: cw1, h: rh1 },
    { x: inner.x + cw1 + g, y: inner.y, w: cw2, h: rh1 },
    { x: inner.x, y: inner.y + rh1 + g, w: cw1, h: rh2 },
    { x: inner.x + cw1 + g, y: inner.y + rh1 + g, w: cw2, h: rh2 }
  ];
}

async function coverTo(image: Buffer, w: number, h: number, position: any = sharp.strategy.attention): Promise<Buffer> {
  return sharp(image, { failOn: 'none' }).rotate().resize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), { fit: 'cover', position }).png().toBuffer();
}

function svgBuf(w: number, h: number, body: string): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);
}

async function fitText(text: string, style: Parameters<typeof renderText>[1], maxH: number) {
  let size = style.size;
  let out = await renderText(text, { ...style, size });
  for (let i = 0; i < 5 && out.height > maxH && size > 12; i++) {
    size = Math.round(size * 0.9);
    out = await renderText(text, { ...style, size });
  }
  return out;
}

export interface TextilePosterInput {
  layout: TextileLayoutId;
  /** 主面料照片（原图，会自动避开标签纸） */
  main: Buffer;
  /** 与主面料同色的其他照片（可选）：大图优先用其中干净区域更大的，色卡和底色仍取主面料 */
  heroAlternatives?: Buffer[];
  /** 其余配色面料照片，加上主面料一共最多 6 块色卡 */
  swatches: Buffer[];
  /** 氛围图，最多 4 张；没有就用面料特写代替 */
  moods: Buffer[];
  /** 每张氛围图里人物的位置（与 moods 一一对应，没有人物为 null）；有了就不让小图压住人物 */
  moodPersons?: Array<PersonBox | null>;
  name: string;
  description: string;
  code?: string;
  /** 指定底色（#RRGGBB）；不给就取自主面料 */
  bgColor?: string;
  outputScale?: 1 | 2;
  /** 氛围图拼贴摆法变体（0 起，换一种组合时 +1） */
  moodVariant?: number;
  /** 氛围图风格：cutout 时人物抠图加白边压在拼贴上 */
  moodStyle?: 'collage' | 'cutout';
  /** 现成的人物图（白底/素色底/透明底均可）；不给就尝试从氛围图里抠 */
  cutoutPerson?: Buffer;
}

export interface TextilePosterResult {
  buffer: Buffer;
  width: number;
  height: number;
  bgColor: string;
  mainColor: string;
  swatchColors: string[];
  warnings: string[];
}

export async function composeTextilePoster(input: TextilePosterInput): Promise<TextilePosterResult> {
  const S = input.outputScale === 2 ? 2 : 1;
  const L = TEXTILE_LAYOUTS[input.layout];
  const W = TEXTILE_SIZE.width * S;
  const H = TEXTILE_SIZE.height * S;
  const warnings: string[] = [];
  const layers: sharp.OverlayOptions[] = [];
  const sc = (r: Rect): Rect => ({ x: r.x * S, y: r.y * S, w: r.w * S, h: r.h * S });
  const at = (x: number, y: number) => ({ left: Math.round(x * S), top: Math.round(y * S) });

  const mainA = await analyzeFabric(input.main);
  const otherA = await Promise.all(input.swatches.slice(0, TEXTILE_MAX_SWATCHES - 1).map(async b => ({ buf: b, a: await analyzeFabric(b) })));
  const bg = /^#[0-9a-fA-F]{6}$/.test(input.bgColor || '') ? (input.bgColor as string).toUpperCase() : deriveBackground(mainA.color);
  const lightBg = luminanceOf(bg) > 0.62;
  const textColor = '#FFFFFF';
  const bandRgb = hexToRgb(darkenHex(bg, 0.6));

  // 0) 人物抠图叠压（可选）：优先用给定的人物图，否则从人物最大的那张氛围图里抠
  let cutoutBuf: Buffer | null = null;
  let moodInputs: Buffer[] = input.moods.slice(0, 4);
  let moodPersonsIn: Array<PersonBox | null> = input.moodPersons || [];
  if (input.moodStyle === 'cutout') {
    if (input.cutoutPerson) {
      cutoutBuf = await cutoutPersonByBorder(input.cutoutPerson);
      if (!cutoutBuf) warnings.push('人物图的背景不够干净，没抠出来，已改用普通拼贴');
    } else {
      const area = (b: PersonBox | null | undefined) => (b ? b.width * b.height : 0);
      let pi = -1;
      moodInputs.forEach((_, i) => {
        if (area(moodPersonsIn[i]) > (pi >= 0 ? area(moodPersonsIn[pi]) : 0)) pi = i;
      });
      if (pi >= 0) {
        cutoutBuf = await cutoutPersonByBorder(moodInputs[pi], moodPersonsIn[pi]);
        if (cutoutBuf) {
          moodInputs = moodInputs.filter((_, i) => i !== pi);
          moodPersonsIn = moodPersonsIn.filter((_, i) => i !== pi);
        } else warnings.push('氛围图的背景太杂，人物抠不干净，已改用普通拼贴；可以选「AI 新出人物」，会生成纯白底的全身人物再抠');
      } else warnings.push('氛围图里没找到人物，已改用普通拼贴；可以选「AI 新出人物」');
    }
  }

  // 1) 氛围图拼块（白框）；没有氛围图时用面料特写代替，避免大块空白
  let moodSources: Buffer[] = moodInputs;
  if (moodSources.length === 0) {
    warnings.push('没有氛围图，左侧用面料特写代替；可以在对话里让我生成氛围图，或把喜欢的图发给我');
    // 特写要大而清晰：优先用干净区域最大的几张，不用只能放大才够尺寸的
    const byArea = [...otherA].sort((a, b) => b.a.region.width * b.a.region.height - a.a.region.width * a.a.region.height);
    // 颜色要拉开：和已选的几乎同色就跳过（同一款面料常有缩略版、原片两张）
    const alt: typeof otherA = [];
    // 先挑分辨率够、不用放大的（按 0.5 张照片宽铺 800px），不够 3 张再放宽
    const sharpEnough = (o: (typeof otherA)[number]) => 800 / (o.a.srcWidth * 0.5) <= 1.05;
    for (const o of [...byArea.filter(sharpEnough), ...byArea.filter(o => !sharpEnough(o))]) {
      const [r1, g1, b1] = hexToRgb(o.a.color);
      if (alt.some(x => { const [r2, g2, b2] = hexToRgb(x.a.color); return Math.hypot(r1 - r2, g1 - g2, b1 - b2) < 30; })) continue;
      alt.push(o);
      if (alt.length === 3) break;
    }
    moodSources = alt.length
      ? await Promise.all(alt.map(o => textureFill(o.buf, o.a, 800, 800, 0.5)))
      : [await textureFill(input.main, mainA, 1000, 1000, 0.5)];
  }
  // 有人物的图做底图（人物最大的那张），人物完整、不被小图压住
  // 面料特写代替氛围图时没有人物
  let persons: Array<PersonBox | null> = moodSources.map((_, i) => (moodInputs.length ? moodPersonsIn[i] ?? null : null));
  const baseIdx = persons.reduce((bi, b, i) => (b && (!persons[bi] || b.width * b.height > persons[bi]!.width * persons[bi]!.height) ? i : bi), 0);
  if (baseIdx > 0) {
    moodSources = [moodSources[baseIdx], ...moodSources.filter((_, i) => i !== baseIdx)];
    persons = [persons[baseIdx], ...persons.filter((_, i) => i !== baseIdx)];
  }
  const mv = Math.max(0, Math.floor(Number(input.moodVariant) || 0));
  const baseRect = moodCollage(input.layout, 1, undefined, mv)[0];
  const base = usesMosaic(input.layout) || cutoutBuf ? null : await coverKeep(moodSources[0], baseRect.w * S, baseRect.h * S, persons[0]);
  const avoid = base?.person ? [{ x: baseRect.x + base.person.x / S, y: baseRect.y + base.person.y / S, w: base.person.w / S, h: base.person.h / S }] : [];
  // 抠图叠压：底下是规整的格子拼块（圆形版只用大圆右侧那一块），人物压在上面
  const cutFrame = (() => {
    const f = TEXTILE_LAYOUTS[input.layout].moodFrame;
    return input.layout === 'circle' ? { x: f.x + f.w * 0.3, y: f.y, w: f.w * 0.7, h: f.h } : f;
  })();
  const frameRects = cutoutBuf ? mosaic(cutFrame, Math.max(1, Math.min(3, moodSources.length)), mv) : moodCollage(input.layout, moodSources.length, avoid, mv);
  // 并排拼贴时底图变窄了：按新格子重新裁一次（仍以人物为中心）
  const baseCell = frameRects[0];
  const baseImg = base && (baseCell.w !== baseRect.w || baseCell.x !== baseRect.x) ? (await coverKeep(moodSources[0], baseCell.w * S, baseCell.h * S, persons[0])).buffer : base?.buffer;
  if (avoid.length && frameRects.length < moodSources.length) warnings.push(`为了不遮挡人物，氛围拼贴少放了 ${moodSources.length - frameRects.length} 张小图`);
  // 白框只包住实际用到的格子（并排拼贴时不留空白）
  const fx0 = Math.min(...frameRects.map(r => r.x)) - 6;
  const fy0 = Math.min(...frameRects.map(r => r.y)) - 6;
  const usedFrame = { x: fx0, y: fy0, w: Math.max(...frameRects.map(r => r.x + r.w)) + 6 - fx0, h: Math.max(...frameRects.map(r => r.y + r.h)) + 6 - fy0 };
  const frame = sc(usedFrame);
  layers.push({
    input: svgBuf(Math.round(frame.w + 24 * S), Math.round(frame.h + 24 * S), `<defs><filter id="s" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${8 * S}"/></filter></defs><rect x="${12 * S}" y="${16 * S}" width="${frame.w}" height="${frame.h}" fill="#000" opacity="0.28" filter="url(#s)"/>`),
    ...at(usedFrame.x - 12, usedFrame.y - 12)
  });
  layers.push({
    input: svgBuf(Math.round(frame.w), Math.round(frame.h), `<rect width="${frame.w}" height="${frame.h}" fill="#fff"/>`),
    left: Math.round(frame.x),
    top: Math.round(frame.y)
  });
  for (let i = 0; i < frameRects.length; i++) {
    const r = sc(frameRects[i]);
    const inset = (frameRects[i] as CollageRect).inset;
    if (inset) {
      // 叠放的小图：白边 + 柔和投影，压在大图上（参考图的拼贴手法）
      const b = 6 * S;
      const pad = 18 * S;
      layers.push({
        input: svgBuf(Math.round(r.w + b * 2 + pad * 2), Math.round(r.h + b * 2 + pad * 2), `<defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${7 * S}"/></filter></defs><rect x="${pad}" y="${pad + 5 * S}" width="${r.w + b * 2}" height="${r.h + b * 2}" fill="#000" opacity="0.32" filter="url(#s)"/>`),
        left: Math.round(r.x - b - pad),
        top: Math.round(r.y - b - pad)
      });
      layers.push({ input: svgBuf(Math.round(r.w + b * 2), Math.round(r.h + b * 2), `<rect width="${r.w + b * 2}" height="${r.h + b * 2}" fill="#fff"/>`), left: Math.round(r.x - b), top: Math.round(r.y - b) });
    }
    const img = i === 0 && baseImg ? baseImg : (await coverKeep(moodSources[i], r.w, r.h, persons[i])).buffer;
    layers.push({ input: img, left: Math.round(r.x), top: Math.round(r.y) });
  }
  if (cutoutBuf) {
    // 人物压在拼块上：头和脚略微探出白框（参考图的做法），贴左下；变体奇数时往里挪一些
    const meta = await sharp(cutoutBuf).metadata();
    const aspect = (meta.width || 1) / (meta.height || 1);
    const topY = Math.max(10, usedFrame.y - 34);
    let ph = Math.min(usedFrame.h + 70, TEXTILE_SIZE.height - topY - 10);
    let pw = ph * aspect;
    const maxW = usedFrame.w * 0.62;
    if (pw > maxW) {
      pw = maxW;
      ph = pw / aspect;
    }
    const px = usedFrame.x + usedFrame.w * (mv % 2 === 1 ? 0.3 : 0.05);
    const py = Math.min(TEXTILE_SIZE.height - ph - 10, topY + (usedFrame.h + 70 - ph));
    const st = await stickerizePerson(cutoutBuf, pw * S, ph * S, 12 * S);
    layers.push({ input: st.buffer, left: Math.max(0, Math.round(px * S - st.pad)), top: Math.max(0, Math.round(py * S - st.pad)) });
  }

  // 2) 主面料：按外形裁成多边形/圆，放进包围盒（与画布求交）
  const shapeBox = (() => {
    if (L.hero.circle) {
      const c = L.hero.circle;
      return { x: c.cx - c.r, y: c.cy - c.r, w: c.r * 2, h: c.r * 2 };
    }
    const xs = L.hero.polygon!.map(p => p[0]);
    const ys = L.hero.polygon!.map(p => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  })();
  const vis = {
    x: Math.max(0, shapeBox.x),
    y: Math.max(0, shapeBox.y),
    w: Math.min(TEXTILE_SIZE.width, shapeBox.x + shapeBox.w) - Math.max(0, shapeBox.x),
    h: Math.min(TEXTILE_SIZE.height, shapeBox.y + shapeBox.h) - Math.max(0, shapeBox.y)
  };
  const vw = Math.round(vis.w * S);
  const vh = Math.round(vis.h * S);
  const shapeSvg = (extra: string) => {
    if (L.hero.circle) {
      const c = L.hero.circle;
      return `<circle cx="${(c.cx - vis.x) * S}" cy="${(c.cy - vis.y) * S}" r="${c.r * S}" ${extra}/>`;
    }
    return `<polygon points="${L.hero.polygon!.map(([x, y]) => `${(x - vis.x) * S},${(y - vis.y) * S}`).join(' ')}" ${extra}/>`;
  };
  // 大图来源：主面料照片带标签、干净区域小时，如果还有同色的无标签/更大干净区域的照片（调用方挑出的同色候选），改用它
  let heroBuf = input.main;
  let heroA = mainA;
  for (const alt of (input.heroAlternatives || []).slice(0, 3)) {
    const a = await analyzeFabric(alt);
    const score = (x: FabricAnalysis) => x.region.width * x.region.height * (x.hasLabel ? 0.7 : 1);
    if (score(a) > score(heroA) * 1.15) {
      heroBuf = alt;
      heroA = a;
    }
  }
  // 大图约展示 0.9 张照片宽的面料（与参考图颗粒一致）
  const heroCrop = await textureFill(heroBuf, heroA, vw, vh, 0.9 * (vw / (TEXTILE_SIZE.width * S * 0.6)));
  const up = vw / (heroA.srcWidth * 0.9 * (vw / (TEXTILE_SIZE.width * S * 0.6)));
  if (up > 1.3) {
    warnings.push(`主面料照片里没被标签遮挡的干净区域偏小，放大了 ${up.toFixed(1)} 倍，颗粒会偏粗、偏糊；请换一张没有标签的面料特写，或用更高分辨率的原图做主面料`);
  }
  const heroMasked = await sharp(heroCrop)
    .ensureAlpha()
    .composite([{ input: svgBuf(vw, vh, shapeSvg('fill="#fff"')), blend: 'dest-in' }])
    .png()
    .toBuffer();
  layers.push({ input: heroMasked, ...at(vis.x, vis.y) });

  // 3) 文字带：半透明深色，只覆盖在主面料形状内
  const bandTop = (L.band.y - vis.y) * S;
  layers.push({
    input: svgBuf(
      vw,
      vh,
      `<defs><clipPath id="c">${shapeSvg('')}</clipPath></defs><rect x="0" y="${bandTop}" width="${vw}" height="${L.band.h * S}" fill="rgb(${bandRgb.join(',')})" fill-opacity="0.74" clip-path="url(#c)"/>`
    ),
    ...at(vis.x, vis.y)
  });

  // 4) 白描边（折线或圆，画在整张画布上，超出部分自动裁掉）
  const strokeW = L.outline.width * S;
  const outlineBody = L.outline.circle
    ? `<circle cx="${L.outline.circle.cx * S}" cy="${L.outline.circle.cy * S}" r="${L.outline.circle.r * S}" fill="none" stroke="#fff" stroke-width="${strokeW}"/>`
    : `<polyline points="${L.outline.points!.map(([x, y]) => `${x * S},${y * S}`).join(' ')}" fill="none" stroke="#fff" stroke-width="${strokeW}" stroke-linejoin="miter" stroke-miterlimit="10"/>`;
  layers.push({ input: svgBuf(W, H, outlineBody), left: 0, top: 0 });

  // 5) 色卡：主面料 + 其余，按明度从浅到深排；白边 + 柔和投影
  const swatchSrc = [
    { buf: input.main, a: mainA, isMain: true },
    ...otherA.map(o => ({ buf: o.buf, a: o.a, isMain: false }))
  ].sort((x, y) => luminanceOf(y.a.color) - luminanceOf(x.a.color));
  const slots = swatchSlotsFor(input.layout, swatchSrc.length);
  const size = L.swatch.size * S;
  const border = 6 * S;
  const radius = L.swatch.shape === 'circle' ? size / 2 : 30 * S;
  for (let i = 0; i < swatchSrc.length && i < slots.length; i++) {
    const tile = await textureFill(swatchSrc[i].buf, swatchSrc[i].a, size - border * 2, size - border * 2, 0.25 * (L.swatch.size / 198));
    const px = slots[i].x * S;
    const py = slots[i].y * S;
    const pad = 16 * S;
    layers.push({
      input: svgBuf(Math.round(size + pad * 2), Math.round(size + pad * 2), `<defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${6 * S}"/></filter></defs><rect x="${pad}" y="${pad + 6 * S}" width="${size}" height="${size}" rx="${radius}" fill="#000" opacity="0.3" filter="url(#s)"/>`),
      left: Math.round(px - pad),
      top: Math.round(py - pad)
    });
    layers.push({
      input: svgBuf(Math.round(size), Math.round(size), `<rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/>`),
      left: Math.round(px),
      top: Math.round(py)
    });
    const inner = size - border * 2;
    const innerMask = svgBuf(Math.round(inner), Math.round(inner), `<rect width="${inner}" height="${inner}" rx="${Math.max(2, radius - border)}" fill="#fff"/>`);
    layers.push({
      input: await sharp(tile).ensureAlpha().composite([{ input: innerMask, blend: 'dest-in' }]).png().toBuffer(),
      left: Math.round(px + border),
      top: Math.round(py + border)
    });
  }

  // 6) 文字：面料名、说明（真实字体）；型号
  const name = input.name.trim();
  if (name) {
    const t = await renderText(name, { role: 'serif', size: L.title.size * S, weight: 600, color: textColor, letterSpacingEm: 0.12 });
    layers.push({ input: t.buffer, ...at(L.title.x, L.title.y) });
  }
  const desc = input.description.trim();
  if (desc) {
    const maxH = (L.desc.maxBottom - L.desc.y) * S;
    const t = await fitText(
      desc,
      { role: 'serif', size: L.desc.size * S, weight: 400, color: textColor, letterSpacingEm: L.desc.letterSpacingEm, maxWidth: L.desc.maxWidth * S, lineGap: L.desc.lineGap * S },
      maxH
    );
    layers.push({ input: t.buffer, ...at(L.desc.x, L.desc.y) });
  }
  const code = (input.code || '').trim();
  if (code) {
    const codeColor = input.layout === 'slant' ? (luminanceOf(mainA.color) > 0.6 ? '#1A1A1A' : '#FFFFFF') : lightBg ? '#1A1A1A' : '#FFFFFF';
    const t = await renderText(code, { role: 'sans', size: L.code.size * S, weight: 700, color: codeColor, letterSpacingEm: 0.02 });
    const left = L.code.align === 'right' ? L.code.x * S - t.width : L.code.x * S;
    layers.push({ input: t.buffer, left: Math.round(left), top: Math.round(L.code.y * S) });
  }

  const buffer = await sharp({ create: { width: W, height: H, channels: 3, background: bg } })
    .composite(layers.map(l => clampLayer(l, W, H)))
    .jpeg({ quality: 92 })
    .toBuffer();
  return {
    buffer,
    width: W,
    height: H,
    bgColor: bg,
    mainColor: mainA.color,
    swatchColors: swatchSrc.map(s => s.a.color),
    warnings
  };
}

/** 色卡槽位：圆形版式先填第一排；一排式版式靠右对齐 */
export function swatchSlotsFor(layout: TextileLayoutId, count: number): Array<{ x: number; y: number }> {
  const L = TEXTILE_LAYOUTS[layout];
  const n = Math.max(0, Math.min(count, L.swatch.slots.length));
  if (layout === 'hex') return rowRight(n, L.swatch.size, 45, 1968, 1185);
  return L.swatch.slots.slice(0, n);
}

/** sharp 的叠加层不能有负偏移；本版式里的叠加层都在画布内，这里只做兜底 */
function clampLayer(l: sharp.OverlayOptions, W: number, H: number): sharp.OverlayOptions {
  return { ...l, left: Math.max(0, Math.min(W - 1, l.left || 0)), top: Math.max(0, Math.min(H - 1, l.top || 0)) };
}
