/**
 * 4/3 产品海报的真实茶几素材库：贵族 / 绅士 / 美居三个配套系列的茶几商品图。
 * 素材在 assets/coffee-tables（由 scripts/import_coffee_tables.py 从“08_纯茶几素材”导入），
 * catalog.json 记每款的系列、名称、规格材质和图片。
 *
 * 用法：产品节点选了系列 → 构思时把这个系列全部茶几拼成一张带编号的目录图给模型，
 * 模型按沙发的款式和场景挑一款（tableStyle 填 ct-商品编码）→ 出主场景时把这款茶几图作为第二件产品交给生图模型还原。
 * 没选系列时仍走 coffeeTables.ts 的文字款式库。
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export type CoffeeTableSeries = 'noble' | 'gentleman' | 'meiju';

export interface CatalogCoffeeTable {
  id: string;
  series: CoffeeTableSeries;
  name: string;
  spec: string;
  retailPrice: number | null;
  file: string;
}

interface CatalogFile {
  series: Array<{ id: CoffeeTableSeries; label: string }>;
  items: CatalogCoffeeTable[];
}

export const COFFEE_TABLE_SERIES_LABEL: Record<CoffeeTableSeries, string> = {
  noble: '贵族',
  gentleman: '绅士',
  meiju: '美居'
};

const CATALOG_DIR = path.join(process.cwd(), 'assets', 'coffee-tables');
let cached: CatalogFile | null = null;

function loadCatalog(): CatalogFile {
  if (cached) return cached;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, 'catalog.json'), 'utf8'));
    cached = { series: Array.isArray(raw?.series) ? raw.series : [], items: Array.isArray(raw?.items) ? raw.items : [] };
  } catch (err: any) {
    console.warn('[CoffeeTableCatalog] 读取茶几素材库失败，按无素材处理:', err?.message || err);
    cached = { series: [], items: [] };
  }
  return cached;
}

export function isCoffeeTableSeries(v: unknown): v is CoffeeTableSeries {
  return v === 'noble' || v === 'gentleman' || v === 'meiju';
}

export function catalogTablesOf(series: CoffeeTableSeries): CatalogCoffeeTable[] {
  return loadCatalog().items.filter(i => i.series === series);
}

export function findCatalogTable(id: unknown): CatalogCoffeeTable | undefined {
  if (typeof id !== 'string' || !id.startsWith('ct-')) return undefined;
  return loadCatalog().items.find(i => i.id === id);
}

export async function loadCatalogTableImage(table: CatalogCoffeeTable): Promise<Buffer> {
  const file = path.resolve(CATALOG_DIR, table.file);
  if (!file.startsWith(CATALOG_DIR)) throw new Error('茶几素材路径无效');
  return fs.promises.readFile(file);
}

const SHEET_COLS = 6;
const CELL_W = 240;
const CELL_H = 180;
const sheetCache = new Map<CoffeeTableSeries, Buffer>();

/** 把一个系列的全部茶几拼成一张带编号的目录图（编号从 1 起，和 catalogTablesOf 的顺序一致），构思时给视觉模型看 */
export async function buildCatalogSheet(series: CoffeeTableSeries): Promise<Buffer> {
  const hit = sheetCache.get(series);
  if (hit) return hit;
  const items = catalogTablesOf(series);
  if (!items.length) throw new Error(`茶几素材库里没有「${COFFEE_TABLE_SERIES_LABEL[series]}」系列`);
  const rows = Math.ceil(items.length / SHEET_COLS);
  const pad = 10;
  const labelH = 26;
  const tiles = await Promise.all(
    items.map(async (item, i) => {
      const img = await sharp(await loadCatalogTableImage(item), { failOn: 'none' })
        .rotate()
        .flatten({ background: '#ffffff' })
        .resize(CELL_W - pad * 2, CELL_H - pad - labelH, { fit: 'contain', background: '#ffffff' })
        .toBuffer();
      const label = Buffer.from(
        `<svg width="${CELL_W}" height="${labelH}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#ffffff"/>` +
          `<text x="${pad}" y="20" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#c0392b">${i + 1}</text></svg>`
      );
      const col = i % SHEET_COLS;
      const row = Math.floor(i / SHEET_COLS);
      return [
        { input: label, left: col * CELL_W, top: row * CELL_H },
        { input: img, left: col * CELL_W + pad, top: row * CELL_H + labelH }
      ];
    })
  );
  // 格子之间画浅灰分隔线，编号不至于和相邻的图混在一起
  const grid = Buffer.from(
    `<svg width="${SHEET_COLS * CELL_W}" height="${rows * CELL_H}" xmlns="http://www.w3.org/2000/svg">` +
      Array.from({ length: SHEET_COLS - 1 }, (_, c) => `<line x1="${(c + 1) * CELL_W}" y1="0" x2="${(c + 1) * CELL_W}" y2="${rows * CELL_H}" stroke="#dddddd" stroke-width="2"/>`).join('') +
      Array.from({ length: rows - 1 }, (_, r) => `<line x1="0" y1="${(r + 1) * CELL_H}" x2="${SHEET_COLS * CELL_W}" y2="${(r + 1) * CELL_H}" stroke="#dddddd" stroke-width="2"/>`).join('') +
      '</svg>'
  );
  const sheet = await sharp({ create: { width: SHEET_COLS * CELL_W, height: rows * CELL_H, channels: 3, background: '#ffffff' } })
    .composite([...tiles.flat(), { input: grid, left: 0, top: 0 }])
    .jpeg({ quality: 85 })
    .toBuffer();
  sheetCache.set(series, sheet);
  return sheet;
}

/** 构思用：告诉模型从目录图里按沙发款式挑一款 */
export function catalogCandidatesRule(series: CoffeeTableSeries, items: CatalogCoffeeTable[], usedIds: string[] = []): string {
  const used = new Set(usedIds);
  const recent = items.filter(i => used.has(i.id)).map(i => i.name);
  return [
    `这款沙发属于「${COFFEE_TABLE_SERIES_LABEL[series]}」配套系列，茶几必须从“茶几目录”图里的真实商品中挑一款（图里每格左上角的红色数字是编号，对应下面的清单）。`,
    '挑选标准：先看沙发的款式、线条、颜色和材质，挑造型语言和风格最搭的一款（圆润沙发配圆润茶几，利落直线配方正茶几，颜色深浅与沙发、场景协调），再兼顾场景配色。tableStyle 填它的 id（ct- 开头），props 里按目录图写清这款茶几的真实造型和材质，不要改款。',
    ...(recent.length ? [`这款产品最近已用过：${recent.join('、')}；同样合适时优先换一款。`] : []),
    ...items.map((t, i) => `${i + 1}｜${t.id}｜${t.name}｜${t.spec}`),
    CATALOG_PLACEMENT
  ].join('\n');
}

const CATALOG_PLACEMENT =
  '摆放：在沙发正前方、离沙发约一臂距离（像客厅里正常摆放），茶几高度低于沙发坐面，不要离沙发很远，不要挡住沙发的扶手和底部；茶几上最多一两件小摆件（花器、书、托盘），不要堆满。';

/** 出图用：已经定下的这款真实茶几（图标为“搭配产品参考”交给生图模型） */
export function catalogTableHeroRule(table: CatalogCoffeeTable): string {
  const withStools = /凳/.test(table.name);
  return [
    `茶几是我们的真实商品「${table.name}」（规格材质：${table.spec}），标为“搭配产品参考”的那张图就是它：造型、台面形状、台面材质与纹理、颜色、底座/桌腿结构都必须和参考图一致，不要换款、不要改颜色、不要加减结构；参考图里的白底、阴影和其他东西不要画进来。${withStools ? '这款茶几带配套凳子，凳子按参考图一起摆在茶几旁。' : ''}`,
    '茶几按规格尺寸和沙发保持真实比例（茶几比沙发矮、长度明显小于沙发），透视、光影与场景一致，像真实拍摄时摆在那里。',
    CATALOG_PLACEMENT
  ].join('\n');
}
