// 面料海报的配色挑选：以一款面料为主色，从同一批素材里挑出若干块“既不重复、又彼此协调”的配色做色卡。
// 纯函数，不碰 DOM，便于单测。

export type Lab = [number, number, number];

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

export function hexToLab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex).map(v => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIE76 色差：约 2.3 是肉眼刚能分辨，10 以内基本算同一个颜色 */
export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = hexToLab(a);
  const [l2, a2, b2] = hexToLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

export interface PaletteCandidate {
  id: string;
  hex: string;
}

/**
 * 从候选里挑 count 块配色（不含主面料本身）：
 *  1. 去掉和主色几乎一样的（同一颜色的另一张照片）以及彼此几乎一样的；
 *  2. 先取一个和主色最接近的“邻近色”，让色卡里有一块和主色呼应；
 *  3. 之后每次取“离已选各块都最远”的，保证色卡颜色拉开，但太远的（色差超过上限后一视同仁）优先选离主色近的，避免突兀。
 */
export function pickPaletteSwatches(mainHex: string, candidates: PaletteCandidate[], count: number, minGap = 10): PaletteCandidate[] {
  const pool: PaletteCandidate[] = [];
  for (const c of candidates) {
    if (!/^#[0-9a-fA-F]{6}$/.test(c.hex)) continue;
    if (deltaE(mainHex, c.hex) < minGap) continue;
    if (pool.some(p => deltaE(p.hex, c.hex) < minGap)) continue;
    pool.push(c);
  }
  const want = Math.max(0, Math.min(count, pool.length));
  if (want === 0) return [];
  const chosen: PaletteCandidate[] = [];
  const nearest = [...pool].sort((a, b) => deltaE(mainHex, a.hex) - deltaE(mainHex, b.hex))[0];
  chosen.push(nearest);
  const CAP = 45;
  while (chosen.length < want) {
    let best: { c: PaletteCandidate; score: number } | null = null;
    for (const c of pool) {
      if (chosen.includes(c)) continue;
      const minD = Math.min(deltaE(mainHex, c.hex), ...chosen.map(s => deltaE(s.hex, c.hex)));
      const score = Math.min(minD, CAP) - 0.08 * deltaE(mainHex, c.hex);
      if (!best || score > best.score) best = { c, score };
    }
    if (!best) break;
    chosen.push(best.c);
  }
  return chosen;
}

/**
 * 按文件名/路径里的关键字找素材：先完全相同，再包含（不区分大小写、忽略扩展名），
 * 唯一命中才返回；多个命中返回 null 让调用方追问，避免悄悄选错面料。
 */
export function findAssetByKeyword<T extends { name: string; path: string }>(assets: T[], keyword: string): { match: T | null; ambiguous: T[] } {
  const strip = (s: string) => s.toLowerCase().replace(/\.[a-z0-9]{2,5}$/, '');
  const k = strip(keyword.trim());
  if (!k) return { match: null, ambiguous: [] };
  const exact = assets.filter(a => strip(a.name) === k || a.path.toLowerCase() === keyword.trim().toLowerCase());
  if (exact.length === 1) return { match: exact[0], ambiguous: [] };
  const hits = exact.length > 1 ? exact : assets.filter(a => strip(a.name).includes(k) || a.path.toLowerCase().includes(k));
  if (hits.length === 1) return { match: hits[0], ambiguous: [] };
  return { match: null, ambiguous: hits.slice(0, 6) };
}

/** 中文色名 → 代表色，用于“用绿色那款做主色”这类说法按颜色找面料 */
const COLOR_TARGETS: Array<[RegExp, string]> = [
  [/藏青|深蓝|海军蓝/, '#1B2A4A'],
  [/墨绿|深绿/, '#1F3D2B'],
  [/橄榄|军绿|苔|绿/, '#6B6B3A'],
  [/青|蓝绿|孔雀/, '#2F7F7F'],
  [/蓝/, '#2F4F8F'],
  [/酒红|枣红/, '#6E1F2A'],
  [/红/, '#A03030'],
  [/粉/, '#E0A8B0'],
  [/橙|橘/, '#C86A2A'],
  [/芥|黄/, '#D4A93A'],
  [/驼|卡其|杏/, '#B08A62'],
  [/咖啡|棕|褐/, '#6B4A35'],
  [/紫/, '#6B4A7A'],
  [/米白|奶白|白/, '#EEE8DA'],
  [/黑|炭/, '#25272A'],
  [/灰/, '#808080']
];

export function textileColorTarget(name: string): string | null {
  const text = name.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toUpperCase();
  return COLOR_TARGETS.find(([re]) => re.test(text))?.[1] ?? null;
}

/** 同名文件取体积最大的那个（文件夹里常有缩略版和原片两份，如 3000px 与 6880px），用于读图 */
export function pickBestSource<T extends { name: string; size: number; type?: string }>(asset: T, all: T[]): T {
  const key = asset.name.toLowerCase();
  return all.filter(a => a.name.toLowerCase() === key && (a.type ?? 'image') === (asset.type ?? 'image')).reduce((best, a) => (a.size > best.size ? a : best), asset);
}
