// src/utils/thumbnailUrl.ts
// 画布节点用缩略图（服务端 /api/thumb 缩成 WebP），原图留给放大查看、编辑和下载。
// 只改写本站能取的图：本站画布资源、Supabase Storage、GCS；data:/blob:/svg/gif 原样返回。

export const CANVAS_THUMB_WIDTH = 768;

export function isThumbnailable(url: string | undefined | null): url is string {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('data:') || url.startsWith('blob:')) return false;
  if (url.startsWith('/api/thumb')) return false;
  const pathPart = url.split(/[?#]/)[0].toLowerCase();
  if (pathPart.endsWith('.svg') || pathPart.endsWith('.gif')) return false;
  if (/^\/api\/(creative-)?canvases\/assets\//.test(url)) return true;
  if (/^\/api\/supabase-proxy\/storage\/v1\/object\//.test(url)) return true;
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const u = new URL(url);
    if (/^\/api\/(creative-)?canvases\/assets\//.test(u.pathname)) return true;
    if (/^\/api\/supabase-proxy\/storage\/v1\/object\//.test(u.pathname)) return true;
    if (u.pathname.startsWith('/storage/v1/object/')) return true; // Supabase Storage
    if (u.host === 'storage.googleapis.com' || u.host.endsWith('.storage.googleapis.com')) return true;
  } catch {
    return false;
  }
  return false;
}

/** 返回缩略图地址；不适合缩略的原样返回。 */
export function toThumbnailUrl(url: string, width: number = CANVAS_THUMB_WIDTH): string {
  if (!isThumbnailable(url)) return url;
  return `/api/thumb?w=${width}&src=${encodeURIComponent(url)}`;
}

/** 原图真实尺寸（缩略图的 naturalWidth 不是原图尺寸，OCR、版本记录要用这个）。 */
export async function fetchOriginalSize(url: string): Promise<{ width: number; height: number } | null> {
  if (!isThumbnailable(url)) return null;
  try {
    const res = await fetch(`/api/thumb/meta?src=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.width > 0 && json?.height > 0 ? { width: json.width, height: json.height } : null;
  } catch {
    return null;
  }
}
