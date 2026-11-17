// server/routes/thumbnailRoutes.ts
// 画布缩略图：画布节点只需要几百像素宽的图，原图（2048 PNG，几 MB）留给放大/下载。
// 服务端从 Supabase / GCS 取原图（机房网络快），缩成 WebP 返回给浏览器（用户网络只走几十 KB）。
//   GET /api/thumb?src=<原图地址>&w=768   → image/webp，长缓存；失败时 302 回原图
//   GET /api/thumb/meta?src=<原图地址>     → { width, height }（原图真实尺寸，OCR/版本记录要用）
// 只允许取本站的图：/api/canvases/assets/*、/api/supabase-proxy/storage/*、本项目 Supabase Storage、本项目 GCS 桶。

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getAssetFromStore } from './canvasRoutes';

const router = Router();

export const THUMB_WIDTHS = [256, 512, 768, 1024] as const;
const DEFAULT_WIDTH = 768;
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_CACHE_FILES = 3000; // Cloud Run 的磁盘在内存里，缩略图约 50KB/张，3000 张 ≈ 150MB
const CACHE_DIR = path.join(process.cwd(), '.data', 'thumb_cache');

// fallbackUrl：缩略图失败时 302 回去的原图地址（本站路径一律改成相对路径，避免被拿来跳转到别的站）
type ResolvedSource =
  | { kind: 'buffer'; cacheKey: string; fallbackUrl: string; load: () => Promise<Buffer> }
  | { kind: 'url'; cacheKey: string; fallbackUrl: string; fetchUrl: string };

export function pickThumbWidth(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_WIDTH;
  return THUMB_WIDTHS.find(w => w >= n) ?? THUMB_WIDTHS[THUMB_WIDTHS.length - 1];
}

function supabaseBase(): URL | null {
  const raw = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  try {
    return raw ? new URL(raw) : null;
  } catch {
    return null;
  }
}

function allowedGcsBuckets(): Set<string> {
  const base =
    process.env.GCS_GENERATED_BUCKET ||
    process.env.GCS_ASSET_BUCKET ||
    process.env.GCS_VIDEO_BUCKET ||
    'manwah-space-generated-prod';
  return new Set(
    [base, process.env.GCS_ASSET_BUCKET, process.env.GCS_GENERATED_BUCKET, process.env.GCS_EXPORT_BUCKET].filter(
      (b): b is string => !!b
    )
  );
}

const isStoragePath = (p: string) => p.startsWith('/storage/v1/object/') && !p.includes('..');

/** 把前端给的图片地址解析成服务端能取的来源；不在白名单里的返回 null。 */
export function resolveThumbSource(src: string): ResolvedSource | null {
  if (!src || src.length > 4096) return null;

  let url: URL;
  try {
    // 相对路径按本站解析，只用来拿 pathname
    url = new URL(src, 'http://self.local');
  } catch {
    return null;
  }
  const isRelative = url.host === 'self.local' && !/^[a-z]+:/i.test(src);

  // 1) 本站缓存的画布资源
  const assetMatch = url.pathname.match(/^\/api\/(?:creative-)?canvases\/assets\/([^/]+)$/);
  if (assetMatch && (isRelative || url.protocol === 'http:' || url.protocol === 'https:')) {
    const objectKey = decodeURIComponent(assetMatch[1]);
    if (objectKey.includes('..') || objectKey.includes('/')) return null;
    const asset = getAssetFromStore(objectKey);
    if (!asset?.dataUrl) return null;
    if (asset.dataUrl.startsWith('data:')) {
      const m = asset.dataUrl.match(/^data:[^;,]+;base64,(.+)$/);
      if (!m) return null;
      return {
        kind: 'buffer',
        cacheKey: `asset:${objectKey}`,
        fallbackUrl: url.pathname,
        load: async () => Buffer.from(m[1], 'base64')
      };
    }
    // 本站资源重定向到云存储地址：按云存储地址再校验一遍（不允许再套一层本站资源）
    if (/\/api\/(?:creative-)?canvases\/assets\//.test(asset.dataUrl)) return null;
    const inner = resolveThumbSource(asset.dataUrl);
    return inner ? { ...inner, fallbackUrl: url.pathname } : null;
  }

  // 2) 经本站代理的 Supabase Storage
  const sb = supabaseBase();
  const proxyMatch = url.pathname.match(/^\/api\/supabase-proxy(\/storage\/v1\/object\/.+)$/);
  if (proxyMatch && (isRelative || url.protocol === 'http:' || url.protocol === 'https:')) {
    if (!sb || !isStoragePath(proxyMatch[1])) return null;
    const fetchUrl = `${sb.origin}${sb.pathname.replace(/\/$/, '')}${proxyMatch[1]}${url.search}`;
    return { kind: 'url', cacheKey: `sb:${proxyMatch[1]}${url.search}`, fallbackUrl: `${url.pathname}${url.search}`, fetchUrl };
  }

  if (isRelative || url.protocol !== 'https:') {
    // 允许本地 http 的 Supabase（自建/开发），其余必须 https
    if (!(sb && url.protocol === 'http:' && url.host === sb.host)) return null;
  }

  // 3) 本项目的 Supabase Storage
  if (sb && url.host === sb.host) {
    if (!isStoragePath(url.pathname)) return null;
    return { kind: 'url', cacheKey: `sb:${url.pathname}${url.search}`, fallbackUrl: url.toString(), fetchUrl: url.toString() };
  }

  // 4) 本项目的 GCS 桶（签名地址每次参数不同，缓存键去掉查询串）
  const buckets = allowedGcsBuckets();
  if (url.host === 'storage.googleapis.com') {
    const bucket = url.pathname.split('/')[1];
    if (!bucket || !buckets.has(bucket) || url.pathname.includes('..')) return null;
    return { kind: 'url', cacheKey: `gcs:${url.pathname}`, fallbackUrl: url.toString(), fetchUrl: url.toString() };
  }
  const vhost = url.host.match(/^(.+)\.storage\.googleapis\.com$/);
  if (vhost) {
    if (!buckets.has(vhost[1]) || url.pathname.includes('..')) return null;
    return { kind: 'url', cacheKey: `gcs:/${vhost[1]}${url.pathname}`, fallbackUrl: url.toString(), fetchUrl: url.toString() };
  }

  return null;
}

async function fetchSource(fetchUrl: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(fetchUrl, { signal: controller.signal, redirect: 'error' });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > MAX_SOURCE_BYTES) throw new Error('source too large');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_SOURCE_BYTES) throw new Error('source too large');
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

interface ThumbResult {
  webp: Buffer;
  width: number; // 原图宽
  height: number; // 原图高
}

const inflight = new Map<string, Promise<ThumbResult>>();
let writesSinceSweep = 0;

function cachePaths(cacheKey: string, width: number) {
  const hash = crypto.createHash('sha1').update(cacheKey).digest('hex');
  return {
    img: path.join(CACHE_DIR, `${hash}_${width}.webp`),
    meta: path.join(CACHE_DIR, `${hash}.json`)
  };
}

function sweepCache() {
  try {
    const files = fs.readdirSync(CACHE_DIR);
    if (files.length <= MAX_CACHE_FILES) return;
    const stats = files
      .map(f => {
        try {
          return { f, t: fs.statSync(path.join(CACHE_DIR, f)).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter((x): x is { f: string; t: number } => !!x)
      .sort((a, b) => a.t - b.t);
    for (const { f } of stats.slice(0, stats.length - Math.floor(MAX_CACHE_FILES * 0.8))) {
      try {
        fs.unlinkSync(path.join(CACHE_DIR, f));
      } catch {}
    }
  } catch {}
}

async function buildThumb(source: ResolvedSource, width: number): Promise<ThumbResult> {
  const paths = cachePaths(source.cacheKey, width);
  try {
    if (fs.existsSync(paths.img) && fs.existsSync(paths.meta)) {
      const meta = JSON.parse(fs.readFileSync(paths.meta, 'utf-8'));
      if (meta?.width > 0 && meta?.height > 0) {
        return { webp: fs.readFileSync(paths.img), width: meta.width, height: meta.height };
      }
    }
  } catch {}

  const original = source.kind === 'buffer' ? await source.load() : await fetchSource(source.fetchUrl);
  const image = sharp(original, { failOn: 'none' }).rotate(); // 按 EXIF 摆正，和浏览器显示一致
  const meta = await image.metadata();
  const swap = (meta.orientation ?? 1) >= 5; // EXIF 5-8 宽高互换
  const width0 = (swap ? meta.height : meta.width) || 0;
  const height0 = (swap ? meta.width : meta.height) || 0;
  if (!width0 || !height0) throw new Error('not an image');

  const webp = await image
    .resize({ width, height: width * 4, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 })
    .toBuffer();

  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(paths.img, webp);
    fs.writeFileSync(paths.meta, JSON.stringify({ width: width0, height: height0 }));
    if (++writesSinceSweep >= 100) {
      writesSinceSweep = 0;
      sweepCache();
    }
  } catch {}

  return { webp, width: width0, height: height0 };
}

function getThumb(source: ResolvedSource, width: number): Promise<ThumbResult> {
  const key = `${source.cacheKey}|${width}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = buildThumb(source, width).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

const srcParam = (req: Request) => (typeof req.query.src === 'string' ? req.query.src : '');

router.get('/meta', async (req: Request, res: Response) => {
  const source = resolveThumbSource(srcParam(req));
  if (!source) return res.status(400).json({ success: false, error: 'unsupported src' });
  try {
    const thumb = await getThumb(source, DEFAULT_WIDTH);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.json({ success: true, width: thumb.width, height: thumb.height });
  } catch (e: any) {
    return res.status(502).json({ success: false, error: e?.message || 'thumbnail failed' });
  }
});

router.get('/', async (req: Request, res: Response) => {
  const source = resolveThumbSource(srcParam(req));
  if (!source) return res.status(400).json({ success: false, error: 'unsupported src' });
  const width = pickThumbWidth(req.query.w);
  try {
    const thumb = await getThumb(source, width);
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Original-Width', String(thumb.width));
    res.setHeader('X-Original-Height', String(thumb.height));
    return res.send(thumb.webp);
  } catch (e: any) {
    console.warn(`[thumb] fallback to original (${e?.message || e})`);
    // 缩略图失败不影响显示：退回原图（只跳本站路径或白名单里的云存储，不是开放跳转）
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, source.fallbackUrl);
  }
});

export default router;
