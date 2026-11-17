// src/utils/imageCompress.ts
// 上传前在浏览器里压缩：手机/相机原图常见 5–15MB、4000px 以上，模型和海报排版用不到这么大，
// 用户网络上传慢就卡在这一步。缩到长边 2560（面料纹理、2048 海报画布都够用），JPEG 0.9。
// 带透明的 PNG/WebP（抠图产品）保留 PNG，只缩尺寸；压完没变小就用原文件。

export const UPLOAD_MAX_EDGE = 2560;
export const UPLOAD_JPEG_QUALITY = 0.9;
/** 小于这个大小且尺寸不超限的图不动，避免无谓的二次压缩损失 */
export const UPLOAD_SKIP_BYTES = 1.5 * 1024 * 1024;

const COMPRESSIBLE = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
/** 已经压过的文件不再压第二次（同一张图可能经过两层上传函数） */
const processed = new WeakSet<File>();

export interface CompressionPlan {
  action: 'keep' | 'compress';
  targetWidth: number;
  targetHeight: number;
}

/** 纯函数：决定要不要压、压到多大（方便测试） */
export function planCompression(input: { width: number; height: number; size: number; type: string }): CompressionPlan {
  const { width, height, size, type } = input;
  const keep = { action: 'keep' as const, targetWidth: width, targetHeight: height };
  if (!COMPRESSIBLE.has(type) || width <= 0 || height <= 0) return keep;
  const longEdge = Math.max(width, height);
  if (longEdge <= UPLOAD_MAX_EDGE && size <= UPLOAD_SKIP_BYTES) return keep;
  const scale = Math.min(1, UPLOAD_MAX_EDGE / longEdge);
  return {
    action: 'compress',
    targetWidth: Math.max(1, Math.round(width * scale)),
    targetHeight: Math.max(1, Math.round(height * scale))
  };
}

function replaceExt(name: string, ext: string): string {
  const base = name.replace(/\.[^./\\]+$/, '');
  return `${base || 'image'}.${ext}`;
}

function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(b => resolve(b), type, quality));
}

/**
 * 上传前压缩图片。任何一步失败都返回原文件，不阻断上传。
 * 方向按 EXIF 摆正后输出（输出文件不再带 EXIF）。
 */
export async function compressImageForUpload(file: File): Promise<File> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file;
  if (!COMPRESSIBLE.has(file.type) || processed.has(file)) return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const plan = planCompression({ width: bitmap.width, height: bitmap.height, size: file.size, type: file.type });
    if (plan.action === 'keep') {
      processed.add(file);
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = plan.targetWidth;
    canvas.height = plan.targetHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: file.type !== 'image/jpeg' && file.type !== 'image/jpg' });
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, plan.targetWidth, plan.targetHeight);

    const mayHaveAlpha = file.type === 'image/png' || file.type === 'image/webp';
    const keepPng = mayHaveAlpha && hasTransparency(ctx, plan.targetWidth, plan.targetHeight);

    const blob = keepPng
      ? await canvasToBlob(canvas, 'image/png')
      : await canvasToBlob(canvas, 'image/jpeg', UPLOAD_JPEG_QUALITY);
    if (!blob || blob.size === 0 || blob.size >= file.size) {
      processed.add(file);
      return file;
    }

    const outType = keepPng ? 'image/png' : 'image/jpeg';
    const out = new File([blob], replaceExt(file.name, keepPng ? 'png' : 'jpg'), {
      type: outType,
      lastModified: file.lastModified
    });
    processed.add(out);
    return out;
  } catch (e) {
    console.warn('[upload] 压缩失败，使用原图上传', e);
    return file;
  } finally {
    bitmap?.close();
  }
}
