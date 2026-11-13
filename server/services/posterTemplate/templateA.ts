import sharp from 'sharp';
import { renderText, RenderedText, TextStyle } from './posterFonts';

/**
 * 模板 A：上方主场景 + 左上（或右上）标题区 + 底部三栏细节解析。
 * 对应参考海报：银弧、自然之境、弧光、月弧、暮蓝、昼梦、隽境、栖谷。
 *
 * 画面里的文字全部用真实字体排版，不交给生图模型画；细节格用主场景的真实裁切，
 * 保证特写和主图是同一件产品。
 */

export const TEMPLATE_A_SIZE = { width: 2048, height: 1536 } as const;
/** 主场景占画面高度的比例（底部 23.5% 留给细节栏） */
export const TEMPLATE_A_HERO_RATIO = 0.765;
/** 细节格图片的宽高比（裁切时按这个比例取景） */
export const TEMPLATE_A_DETAIL_ASPECT = 1.05;

export type TitleSide = 'left' | 'right';

export interface TemplateATitle {
  /** 2–4 字命名，如“银弧” */
  name: string;
  /** 副标题，如“柔和之间，自有锋芒” */
  subtitle?: string;
  /** 一行灵感小字，如“灵感源于柔和弧面与未来建筑的对话” */
  inspiration?: string;
}

export interface TemplateADetail {
  image: Buffer;
  /** 4–6 字，如“弧面扶手” */
  title: string;
  /** 一到两行短句，如“圆润包覆 · 分割缝线” */
  desc?: string;
}

export interface TemplateAInput {
  hero: Buffer;
  /** 成品倍率：1 = 2048×1536，2 = 4096×3072。所有字号、间距、留白同比放大，版式不变 */
  outputScale?: 1 | 2;
  title: TemplateATitle;
  titleSide?: TitleSide | 'auto';
  /** 标题下短横线与细节栏点缀色 */
  accentColor?: string;
  /** 底部细节栏底色：深色场景用深色栏（如夜景配藏蓝），文字自动换成浅色 */
  stripColor?: string;
  details: TemplateADetail[];
  /** 主角产品在 hero 原图中的位置（归一化 0–1），标题文字会避开它 */
  productBox?: NormRect;
}

export interface NormRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 像素坐标的矩形（排版画面坐标系） */
export interface PixelRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TemplateAResult {
  buffer: Buffer;
  width: number;
  height: number;
  layout: {
    titleSide: TitleSide;
    textScheme: TextScheme;
    titleRegion: RegionStats;
    scrim: boolean;
  };
}

export type TextScheme = 'dark' | 'light';

export interface RegionStats {
  /** 平均亮度 0–255 */
  luminance: number;
  /** 亮度标准差：越大画面越杂，越不适合直接压字 */
  busyness: number;
}

const DEFAULT_ACCENT = '#A8743F';

const SCHEMES: Record<TextScheme, { name: string; subtitle: string; inspiration: string }> = {
  dark: { name: '#2A2019', subtitle: '#3A2E25', inspiration: '#4F4237' },
  light: { name: '#FFFFFF', subtitle: '#F6F0E8', inspiration: '#EFE6DA' }
};

/** 两侧哪边更“干净”就把标题放哪边；差别不大时默认左侧（阅读习惯） */
export function chooseTitleSide(left: RegionStats, right: RegionStats): TitleSide {
  return right.busyness + 6 < left.busyness ? 'right' : 'left';
}

/** 底色偏亮用深色字，偏暗用浅色字 */
export function pickTextScheme(region: RegionStats): TextScheme {
  return region.luminance >= 140 ? 'dark' : 'light';
}

/** 背景太杂或亮度处在中间带（深浅字都不够清楚）时，加一层渐变衬底 */
export function needsScrim(region: RegionStats): boolean {
  return region.busyness > 40 || (region.luminance > 115 && region.luminance < 165);
}

/**
 * 标题某一行可用的最大宽度：这一行的纵向范围与产品重叠时，宽度收到产品边缘之前；
 * 太窄（< 280px）时不再收，宁可压一点产品也不把字挤成一列。
 */
export function availableTitleWidth(
  side: TitleSide,
  top: number,
  height: number,
  product: PixelRect | null,
  marginX: number,
  maxWidth: number,
  canvasWidth: number,
  gap = 48,
  minWidth = 280
): number {
  if (!product) return maxWidth;
  if (top + height < product.top - gap / 2 || top > product.bottom) return maxWidth;
  const room = side === 'left' ? product.left - gap - marginX : canvasWidth - marginX - (product.right + gap);
  return Math.round(Math.max(minWidth, Math.min(maxWidth, room)));
}

/** 把 hero 原图里的归一化框换算到 cover 缩放裁切后的排版坐标 */
async function mapBoxToCover(image: Buffer, box: NormRect, width: number, height: number): Promise<PixelRect | null> {
  const meta = await sharp(image, { failOn: 'none' }).rotate().metadata();
  const hw = meta.autoOrient?.width || meta.width || 0;
  const hh = meta.autoOrient?.height || meta.height || 0;
  if (!hw || !hh) return null;
  const scale = Math.max(width / hw, height / hh);
  const offX = (hw * scale - width) / 2;
  const offY = (hh * scale - height) / 2;
  return {
    left: box.left * hw * scale - offX,
    top: box.top * hh * scale - offY,
    right: (box.left + box.width) * hw * scale - offX,
    bottom: (box.top + box.height) * hh * scale - offY
  };
}

/** 细节栏配色：按底色亮度决定文字与分隔线用深色还是浅色 */
export function stripPalette(stripColor: string | undefined): { bg: string; title: string; desc: string; divider: string } {
  const bg = normalizeHexColor(stripColor, '#F7F3EE');
  const r = parseInt(bg.slice(1, 3), 16);
  const g = parseInt(bg.slice(3, 5), 16);
  const b = parseInt(bg.slice(5, 7), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 110
    ? { bg, title: '#F4EDE2', desc: '#C9BFB1', divider: 'rgba(255,255,255,0.22)' }
    : { bg, title: '#2E241C', desc: '#6B5E52', divider: '#DCD2C5' };
}

export function normalizeHexColor(value: string | undefined, fallback = DEFAULT_ACCENT): string {
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim())) return value.trim();
  return fallback;
}

async function regionStats(image: Buffer, left: number, top: number, width: number, height: number): Promise<RegionStats> {
  const { channels } = await sharp(image)
    .extract({ left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) })
    .greyscale()
    .stats();
  return { luminance: channels[0].mean, busyness: channels[0].stdev };
}

function solidRect(width: number, height: number, color: string): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${color}"/></svg>`
  );
}

/** 标题区渐变衬底：从标题一侧向画面中间、从上向下双向淡出 */
function scrimSvg(width: number, height: number, side: TitleSide, scheme: TextScheme): Buffer {
  const color = scheme === 'dark' ? '#FFFFFF' : '#000000';
  const strength = scheme === 'dark' ? 0.62 : 0.42;
  const [x1, x2] = side === 'left' ? ['0', '1'] : ['1', '0'];
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="h" x1="${x1}" y1="0" x2="${x2}" y2="0">
      <stop offset="0" stop-color="${color}" stop-opacity="${strength}"/>
      <stop offset="0.55" stop-color="${color}" stop-opacity="${strength * 0.45}"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="1"/>
      <stop offset="0.7" stop-color="#fff" stop-opacity="0.8"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="m"><rect width="${width}" height="${height}" fill="url(#v)"/></mask>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#h)" mask="url(#m)"/>
</svg>`);
}

/** 浅色字的柔和投影：同一段字渲染成半透明黑色再模糊 */
async function textShadow(text: string, style: TextStyle): Promise<{ buffer: Buffer; pad: number }> {
  const pad = Math.round(style.size * 0.25);
  const shadow = await renderText(text, { ...style, color: '#000000', opacity: 0.45 });
  const buffer = await sharp(shadow.buffer)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .blur(Math.max(1, style.size * 0.08))
    .png()
    .toBuffer();
  return { buffer, pad };
}

export async function composeTemplateA(input: TemplateAInput): Promise<TemplateAResult> {
  const S = input.outputScale === 2 ? 2 : 1;
  const W = TEMPLATE_A_SIZE.width * S;
  const H = TEMPLATE_A_SIZE.height * S;
  const HERO_H = Math.round(H * TEMPLATE_A_HERO_RATIO);
  const accent = normalizeHexColor(input.accentColor);

  const hero = await sharp(input.hero, { failOn: 'none' }).rotate().resize(W, HERO_H, { fit: 'cover', position: 'centre' }).png().toBuffer();

  // ---------- 标题区 ----------
  const regionW = W * 0.42;
  const regionH = HERO_H * 0.46;
  const [leftStats, rightStats] = await Promise.all([
    regionStats(hero, 0, 0, regionW, regionH),
    regionStats(hero, W - regionW, 0, regionW, regionH)
  ]);
  const titleSide: TitleSide =
    input.titleSide === 'left' || input.titleSide === 'right' ? input.titleSide : chooseTitleSide(leftStats, rightStats);
  const titleRegion = titleSide === 'left' ? leftStats : rightStats;
  const scheme = pickTextScheme(titleRegion);
  const colors = SCHEMES[scheme];
  const scrim = needsScrim(titleRegion);

  const marginX = Math.round(W * 0.07);
  const textMaxW = Math.round(W * 0.38);
  const nameStyle: TextStyle = { role: 'serif', size: 128 * S, weight: 600, color: colors.name, letterSpacingEm: 0.12 };
  const subtitleStyle: TextStyle = { role: 'serif', size: 46 * S, weight: 500, color: colors.subtitle, letterSpacingEm: 0.14, maxWidth: textMaxW };
  const inspirationStyle: TextStyle = {
    role: 'sans',
    size: 25 * S,
    weight: 400,
    color: colors.inspiration,
    letterSpacingEm: 0.3,
    maxWidth: textMaxW,
    lineGap: 10 * S
  };

  // 主角产品在排版画面中的位置：标题文字遇到它就收窄换行，避免压到产品上
  const productRect = input.productBox ? await mapBoxToCover(input.hero, input.productBox, W, HERO_H) : null;

  const ACCENT_LINE = { width: 84 * S, height: 4 * S, gapBefore: 30, gapAfter: 34 };
  const blocks: Array<{ text: string; style: TextStyle; gapBefore: number; isName?: boolean }> = [];
  const name = (input.title.name || '').trim();
  if (name) blocks.push({ text: name, style: nameStyle, gapBefore: 0, isName: true });
  const subtitle = (input.title.subtitle || '').trim();
  if (subtitle) blocks.push({ text: subtitle, style: subtitleStyle, gapBefore: 0 });
  const inspiration = (input.title.inspiration || '').trim();
  if (inspiration) blocks.push({ text: inspiration, style: inspirationStyle, gapBefore: 22 });

  const overlays: sharp.OverlayOptions[] = [];
  const alignX = (width: number) => (titleSide === 'left' ? marginX : W - marginX - width);
  const titleTop = Math.round(HERO_H * 0.09);
  const productGap = 40 * S;

  /**
   * 按比例 scale 排一遍标题区。narrow=false 时每行都用满宽度（标题整体放在产品上方）；
   * narrow=true 时与产品纵向重叠的行收窄换行（产品太高、上方放不下时的退路）。
   */
  const layoutTitle = async (scale: number, narrow: boolean) => {
    const layers: sharp.OverlayOptions[] = [];
    let cursorY = titleTop;
    for (const block of blocks) {
      cursorY += Math.round(block.gapBefore * scale * S);
      let style: TextStyle = { ...block.style, size: Math.round(block.style.size * scale) };
      let rendered: RenderedText;
      if (block.isName || !narrow) {
        rendered = await renderText(block.text, style);
      } else {
        // 收窄时字距也收一点，避免窄栏里每行只剩几个字
        style = { ...style, letterSpacingEm: Math.min(style.letterSpacingEm || 0, 0.16) };
        const estimate = Math.round(style.size * 1.45);
        style = { ...style, maxWidth: availableTitleWidth(titleSide, cursorY, estimate, productRect, marginX, textMaxW, W, 48 * S, 280 * S) };
        rendered = await renderText(block.text, style);
        const recheck = availableTitleWidth(titleSide, cursorY, rendered.height, productRect, marginX, textMaxW, W, 48 * S, 280 * S);
        if (recheck < (style.maxWidth || textMaxW)) {
          style = { ...style, maxWidth: recheck };
          rendered = await renderText(block.text, style);
        }
      }
      const x = alignX(rendered.width);
      if (scheme === 'light') {
        const shadow = await textShadow(block.text, style);
        layers.push({ input: shadow.buffer, left: x - shadow.pad, top: cursorY - shadow.pad + 3 * S });
      }
      layers.push({ input: rendered.buffer, left: x, top: cursorY });
      cursorY += rendered.height;
      // 命名下面的短横线
      if (block.isName) {
        cursorY += Math.round(ACCENT_LINE.gapBefore * scale * S);
        layers.push({ input: solidRect(ACCENT_LINE.width, ACCENT_LINE.height, accent), left: alignX(ACCENT_LINE.width), top: cursorY });
        cursorY += ACCENT_LINE.height + Math.round(ACCENT_LINE.gapAfter * scale * S);
      }
    }
    return { layers, bottom: cursorY };
  };

  // 优先整块放在产品上方（参考海报的做法），放不下就逐级缩小；都不行再收窄换行
  let titleLayout = await layoutTitle(1, false);
  if (productRect) {
    const limit = productRect.top - productGap;
    for (const scale of [1, 0.88, 0.78]) {
      const attempt = scale === 1 ? titleLayout : await layoutTitle(scale, false);
      titleLayout = attempt;
      if (attempt.bottom <= limit) break;
    }
    if (titleLayout.bottom > limit) titleLayout = await layoutTitle(0.88, true);
  }
  const titleLayers = titleLayout.layers;
  const cursorY = titleLayout.bottom;

  if (scrim && blocks.length > 0) {
    const scrimW = Math.round(W * 0.6);
    const scrimH = Math.min(HERO_H, cursorY + Math.round(HERO_H * 0.14));
    overlays.push({ input: scrimSvg(scrimW, scrimH, titleSide, scheme), left: titleSide === 'left' ? 0 : W - scrimW, top: 0 });
  }
  overlays.push(...titleLayers);

  // ---------- 底部三栏细节 ----------
  const stripTop = HERO_H;
  const stripH = H - HERO_H;
  const padX = 64 * S;
  const padY = 42 * S;
  const cells = input.details.slice(0, 3);
  const cellW = (W - padX * 2) / Math.max(1, cells.length);
  const imgH = stripH - padY * 2;
  const imgW = Math.round(imgH * TEMPLATE_A_DETAIL_ASPECT);
  const innerPad = 28 * S;
  const textGap = 32 * S;

  const strip = stripPalette(input.stripColor);
  overlays.push({ input: solidRect(W, stripH, strip.bg), left: 0, top: stripTop });

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const cellX = Math.round(padX + i * cellW);
    const imgX = cellX + innerPad;
    const imgY = stripTop + padY;
    const tile = await sharp(cell.image, { failOn: 'none' }).rotate().resize(imgW, imgH, { fit: 'cover', position: 'centre' }).png().toBuffer();
    overlays.push({ input: tile, left: imgX, top: imgY });

    if (i > 0) {
      overlays.push({ input: solidRect(2 * S, stripH - padY * 2 - 48 * S, strip.divider), left: cellX - S, top: stripTop + padY + 24 * S });
    }

    const textX = imgX + imgW + textGap;
    const textW = Math.round(cellX + cellW - innerPad - textX);
    const titleR = await renderText(cell.title, { role: 'serif', size: 40 * S, weight: 600, color: strip.title, letterSpacingEm: 0.06, maxWidth: textW });
    const lineW = 36 * S;
    const lineH = 2 * S;
    const descR = cell.desc
      ? await renderText(cell.desc, { role: 'sans', size: 23 * S, weight: 400, color: strip.desc, letterSpacingEm: 0.08, maxWidth: textW, lineGap: 10 * S })
      : null;
    const blockH = titleR.height + 18 * S + lineH + (descR ? 18 * S + descR.height : 0);
    let ty = Math.round(imgY + (imgH - blockH) / 2);
    overlays.push({ input: titleR.buffer, left: textX, top: ty });
    ty += titleR.height + 18 * S;
    overlays.push({ input: solidRect(lineW, lineH, accent), left: textX + 2 * S, top: ty });
    ty += lineH + 18 * S;
    if (descR) overlays.push({ input: descR.buffer, left: textX, top: ty });
  }

  const buffer = await sharp({ create: { width: W, height: H, channels: 3, background: '#F7F3EE' } })
    .composite([{ input: hero, left: 0, top: 0 }, ...overlays])
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();

  return { buffer, width: W, height: H, layout: { titleSide, textScheme: scheme, titleRegion, scrim } };
}
