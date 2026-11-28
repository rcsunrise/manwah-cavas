/**
 * 豆包 Seedream（4.5 / 5.x）出图尺寸。
 * 网关文档（tokenmarket Doubao 生图 /api/v3/images/generations）：size 可传 "2k" / "4k" 或 "宽x高"。
 * 总像素 [2560×1440, 3840×2160]（5.5 实测上游报错：image area must be at most 8294400 pixels），宽高比 [1/16, 16]——没有 1K 档。
 * 常用比例用方舟推荐的宽高；其余比例按像素预算推算，宽高取 16 的倍数，再夹到上下限内。
 */

export const SEEDREAM_MIN_PIXELS = 2560 * 1440;
export const SEEDREAM_MAX_PIXELS = 3840 * 2160; // 8294400

type Tier = '2K' | '4K';

/** 推荐尺寸（宽x高）：2K 用方舟推荐值；4K 按 8294400 像素上限取，宽高为 16 的倍数 */
const RECOMMENDED: Record<string, Record<Tier, [number, number]>> = {
  '1:1': { '2K': [2048, 2048], '4K': [2880, 2880] },
  '4:3': { '2K': [2304, 1728], '4K': [3264, 2448] },
  '3:4': { '2K': [1728, 2304], '4K': [2448, 3264] },
  '16:9': { '2K': [2848, 1600], '4K': [3840, 2160] },
  '9:16': { '2K': [1600, 2848], '4K': [2160, 3840] },
  '3:2': { '2K': [2496, 1664], '4K': [3504, 2336] },
  '2:3': { '2K': [1664, 2496], '4K': [2336, 3504] },
  '21:9': { '2K': [3136, 1344], '4K': [4368, 1872] }
};

const TIER_PIXELS: Record<Tier, number> = { '2K': 2048 * 2048, '4K': SEEDREAM_MAX_PIXELS };

const round16 = (v: number) => Math.max(16, Math.round(v / 16) * 16);

/** 按比例和像素预算推算宽高，结果落在上下限内 */
export function fitSeedreamSize(ratio: number, pixels: number): [number, number] {
  const r = Math.min(16, Math.max(1 / 16, ratio));
  const target = Math.min(SEEDREAM_MAX_PIXELS, Math.max(SEEDREAM_MIN_PIXELS, pixels));
  let w = round16(Math.sqrt(target * r));
  let h = round16(w / r);
  // 取整后可能略超出范围，按 16 步进收回
  while (w * h > SEEDREAM_MAX_PIXELS) { if (w >= h) w -= 16; else h -= 16; }
  while (w * h < SEEDREAM_MIN_PIXELS) { if (w <= h) w += 16; else h += 16; }
  return [w, h];
}

function parseRatio(ratioStr?: string): number | null {
  if (!ratioStr || ratioStr === 'Auto' || ratioStr === 'auto') return null;
  const [a, b] = String(ratioStr).split(':').map(Number);
  return a > 0 && b > 0 ? a / b : null;
}

/**
 * 计算请求里的 size。
 * - resolution：1K 没有对应档，按 2K 出；4K 用 4K 推荐尺寸；
 * - explicitSize（调用方指定了 "宽x高"，如海报 2048x1536）：保持它的比例，像素不够下限就放大、超了就缩小。
 */
export function computeSeedreamSize(aspectRatio?: string, resolution?: string, explicitSize?: string): string {
  const m = typeof explicitSize === 'string' ? explicitSize.match(/^(\d+)\s*x\s*(\d+)$/i) : null;
  if (m) {
    const w = Number(m[1]);
    const h = Number(m[2]);
    const px = w * h;
    if (px >= SEEDREAM_MIN_PIXELS && px <= SEEDREAM_MAX_PIXELS && w % 16 === 0 && h % 16 === 0) return `${w}x${h}`;
    const [fw, fh] = fitSeedreamSize(w / h, px);
    return `${fw}x${fh}`;
  }
  const tier: Tier = resolution === '4K' ? '4K' : '2K';
  const ratio = parseRatio(aspectRatio) ?? 1;
  const key = Object.keys(RECOMMENDED).find(k => {
    const [a, b] = k.split(':').map(Number);
    return Math.abs(a / b - ratio) < 0.02;
  });
  const [w, h] = key ? RECOMMENDED[key][tier] : fitSeedreamSize(ratio, TIER_PIXELS[tier]);
  return `${w}x${h}`;
}
