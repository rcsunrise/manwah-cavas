// server/services/video/videoSourceImageResolver.ts
// 视频底图标准化公网解析器：负责将相对路径、本地asset、base64转换为外部AI模型可秒级读取的公网HTTPS直链

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { GcsAssetStorage } from '../storage/gcsAssetStorage';
import { supabaseAdmin } from '../../../src/lib/supabase';

const SUPABASE_PUBLIC_BUCKET = 'creative-canvas-assets';

const LOCAL_ASSETS_DIR = path.join(process.cwd(), '.data', 'canvas_assets');

// 首帧长边上限：原图常见 4000px+ / 10MB，上游拉取慢且容易超时，2048px 已超过视频输出分辨率
const MAX_FRAME_EDGE = 2048;
// 画幅偏差在该比例内视为一致，不补边
const RATIO_TOLERANCE = 0.03;
const VISION_MAX_EDGE = 768;

function parseRatio(ratio?: string): number | null {
  const match = ratio?.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const value = Number(match[1]) / Number(match[2]);
  return value > 0 ? value : null;
}

export class VideoSourceImageResolver {
  /**
   * 将任何形式的底图（公网URL、相对路径、本地对象key、base64 Data URI）转换为公网可访问的合法HTTPS直链
   */
  public static async resolveToPublicUrl(rawUrlOrData: string): Promise<string> {
    if (!rawUrlOrData || typeof rawUrlOrData !== 'string') {
      throw new Error('INVALID_IMAGE_INPUT: 必须提供有效的图片地址或数据');
    }

    const trimmed = rawUrlOrData.trim();

    // 1. 如果已经是真正的公网 HTTPS/HTTP 链接（非 localhost、非私有 IP、非内部相对路径）
    if (
      (trimmed.startsWith('https://') || trimmed.startsWith('http://')) &&
      !trimmed.includes('localhost') &&
      !trimmed.includes('127.0.0.1') &&
      !trimmed.includes('0.0.0.0') &&
      !trimmed.includes('metadata.google.internal')
    ) {
      return trimmed;
    }

    // 2. 提取图片二进制 Buffer 与 MIME 类型
    const { buffer, mimeType } = await this.extractBufferAndMime(trimmed);
    return this.uploadToPublicUrl(buffer, mimeType, trimmed);
  }

  /**
   * 视频首/尾帧专用：缩到合理尺寸，并按目标画幅补边（原图居中）。
   * 白底棚拍图用边缘底色延展；场景图用边缘拉伸再虚化，不会像裁切那样切掉产品。
   * 任一处理步骤失败都退回原样解析，不阻断提交。
   */
  public static async resolveFrameForRatio(rawUrlOrData: string, ratio?: string): Promise<string> {
    const targetRatio = parseRatio(ratio);
    try {
      const { buffer } = await this.extractBufferAndMime(rawUrlOrData.trim());
      const image = sharp(buffer, { failOn: 'none' }).rotate();
      const meta = await image.metadata();
      const width = meta.autoOrient?.width || meta.width;
      const height = meta.autoOrient?.height || meta.height;
      if (!width || !height) throw new Error('无法读取图片尺寸');

      const sourceRatio = width / height;
      const needsPad = targetRatio !== null && Math.abs(sourceRatio / targetRatio - 1) > RATIO_TOLERANCE;
      const needsShrink = Math.max(width, height) > MAX_FRAME_EDGE;
      const isPublic = /^https?:\/\//.test(rawUrlOrData) && !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(rawUrlOrData);
      if (!needsPad && !needsShrink && isPublic) return rawUrlOrData.trim();

      // 先把原图缩到长边上限内
      const scale = Math.min(1, MAX_FRAME_EDGE / Math.max(width, height));
      const fgWidth = Math.round(width * scale);
      const fgHeight = Math.round(height * scale);
      const foreground = await sharp(buffer, { failOn: 'none' }).rotate().resize(fgWidth, fgHeight).toBuffer();

      let output: Buffer;
      if (needsPad && targetRatio) {
        const canvasWidth = sourceRatio < targetRatio ? Math.round(fgHeight * targetRatio) : fgWidth;
        const canvasHeight = sourceRatio < targetRatio ? fgHeight : Math.round(fgWidth / targetRatio);
        const padX = canvasWidth - fgWidth;
        const padY = canvasHeight - fgHeight;
        const extend = {
          left: Math.floor(padX / 2),
          right: Math.ceil(padX / 2),
          top: Math.floor(padY / 2),
          bottom: Math.ceil(padY / 2)
        };
        const edgeColor = await this.uniformEdgeColor(foreground, fgWidth, fgHeight, padX > 0);
        if (edgeColor) {
          // 棚拍纯色底：直接用边缘底色延展，补出来与原图无缝
          output = await sharp(foreground)
            .extend({ ...extend, background: edgeColor })
            .jpeg({ quality: 92 })
            .toBuffer();
        } else {
          // 场景图：边缘像素拉伸延展后整体虚化作底（镜像会复制出半个产品的虚影），再把清晰原图盖回中间
          const stretched = await sharp(foreground)
            .extend({ ...extend, extendWith: 'copy' })
            .toBuffer();
          const background = await sharp(stretched).blur(40).toBuffer();
          output = await sharp(background)
            .composite([{ input: foreground, left: extend.left, top: extend.top }])
            .jpeg({ quality: 92 })
            .toBuffer();
        }
        console.log(`[VideoSourceImageResolver] Padded frame ${width}x${height} -> ${canvasWidth}x${canvasHeight} for ratio ${ratio}`);
      } else {
        output = await sharp(foreground).jpeg({ quality: 92 }).toBuffer();
      }
      return await this.uploadToPublicUrl(output, 'image/jpeg', rawUrlOrData.trim());
    } catch (err: any) {
      console.warn('[VideoSourceImageResolver] Frame preprocessing failed, using original image:', err?.message || err);
      return this.resolveToPublicUrl(rawUrlOrData);
    }
  }

  /**
   * 给导演多模态模型看的小图：缩到 768px 内并内联为 data URL，无需上传，也不受原图 10MB 体积拖累
   */
  public static async toVisionDataUrl(rawUrlOrData: string): Promise<string> {
    const { buffer } = await this.extractBufferAndMime(rawUrlOrData.trim());
    const small = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize(VISION_MAX_EDGE, VISION_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${small.toString('base64')}`;
  }

  /**
   * 将要补边的两条边（左右或上下）若是近乎纯色（棚拍底），返回该底色；否则返回 null
   */
  private static async uniformEdgeColor(
    image: Buffer,
    width: number,
    height: number,
    horizontal: boolean
  ): Promise<{ r: number; g: number; b: number } | null> {
    const strip = 8;
    const regions = horizontal
      ? [{ left: 0, top: 0, width: strip, height }, { left: width - strip, top: 0, width: strip, height }]
      : [{ left: 0, top: 0, width, height: strip }, { left: 0, top: height - strip, width, height: strip }];
    const means: number[][] = [];
    for (const region of regions) {
      // stats() 统计的是输入图而非处理结果，需先把边缘条带裁出成独立图片
      const stripBuffer = await sharp(image).extract(region).toBuffer();
      const { channels } = await sharp(stripBuffer).stats();
      if (channels.slice(0, 3).some(c => c.stdev > 12)) return null;
      means.push(channels.slice(0, 3).map(c => c.mean));
    }
    const [r, g, b] = [0, 1, 2].map(i => Math.round((means[0][i] + means[1][i]) / 2));
    return { r, g, b };
  }

  private static async uploadToPublicUrl(buffer: Buffer, mimeType: string, original: string): Promise<string> {
    const trimmed = original;
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    const objectKey = `video-sources/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;

    // 3. 优先上传 Supabase 公开桶：得到短而干净的公网直链。
    //    GCS V4 签名链接很长且带签名参数，网关兼容接口会以 Invalid URL 拒绝，国内上游也可能拉取不到
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      try {
        const { error } = await supabaseAdmin.storage
          .from(SUPABASE_PUBLIC_BUCKET)
          .upload(objectKey, buffer, { contentType: mimeType, upsert: true });
        if (error) throw error;
        const { data } = supabaseAdmin.storage.from(SUPABASE_PUBLIC_BUCKET).getPublicUrl(objectKey);
        if (data?.publicUrl) {
          console.log(`[VideoSourceImageResolver] Resolved internal image to Supabase public URL: ${objectKey}`);
          return data.publicUrl;
        }
      } catch (err: any) {
        console.warn(`[VideoSourceImageResolver] Supabase upload failed (attempt ${attempt}):`, err?.message || err);
      }
    }

    // 4. 降级：上传 GCS 并生成临时公网只读签名链接 (有效期 4 小时)

    try {
      const gcs = GcsAssetStorage.getInstance();
      await gcs.put({
        objectKey,
        buffer,
        contentType: mimeType,
        bucketType: 'source'
      });

      const signed = await gcs.getSignedReadUrl(objectKey, 14400, 'source'); // 4 hours
      // GCS 写入失败时存储层会退化为本机相对地址，上游无法访问，不能当作公网直链返回
      if (signed?.url && /^https?:\/\//.test(signed.url) && !/localhost|127\.0\.0\.1/.test(signed.url)) {
        console.log(`[VideoSourceImageResolver] Successfully resolved internal image to GCS public URL: ${objectKey}`);
        return signed.url;
      }
    } catch (err: any) {
      console.warn(`[VideoSourceImageResolver] Failed to upload image to GCS:`, err?.message);
    }

    // 5. 降级备选：如果 GCS 暂时不可达，检查是否有已配置的外部域名 (如 Cloud Run APP_URL)
    const publicAppUrl = process.env.APP_URL || process.env.PUBLIC_URL || process.env.VITE_APP_URL;
    if (publicAppUrl && trimmed.startsWith('/')) {
      const fullUrl = `${publicAppUrl.replace(/\/+$/, '')}${trimmed}`;
      console.log(`[VideoSourceImageResolver] Fallback to configured APP_URL: ${fullUrl}`);
      return fullUrl;
    }

    throw new Error('RESOLVE_IMAGE_FAILED: 无法将底图解析为公网可下载的URL，请确认网络连接或重新上传图片');
  }

  /**
   * 内部方法：从相对路径、磁盘、Store 或 Base64 中解析 Buffer 与 Mime
   */
  /** 读取任意形式的图片（公网链接、站内相对路径、本地资源 key、base64）为二进制 */
  public static async loadImageBuffer(input: string): Promise<{ buffer: Buffer; mimeType: string }> {
    return this.extractBufferAndMime(input.trim());
  }

  private static async extractBufferAndMime(
    input: string
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    // 0. 公网图片：直接下载（代理抖动时重试）
    if (/^https?:\/\//.test(input) && !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(input)) {
      let lastError: any;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const resp = await fetch(input, { signal: AbortSignal.timeout(30_000) });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          return {
            buffer: Buffer.from(await resp.arrayBuffer()),
            mimeType: resp.headers.get('content-type') || 'image/jpeg'
          };
        } catch (err: any) {
          lastError = err;
          if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
      throw new Error(`RESOLVE_IMAGE_FAILED: 公网图片下载失败: ${lastError?.message || lastError}`);
    }

    // A. Base64 Data URI (e.g. data:image/png;base64,xxxx)
    if (input.startsWith('data:image/')) {
      const matches = input.match(/^data:([a-zA-Z0-9-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        return { buffer, mimeType };
      }
    }

    // B. 相对路径 /api/canvases/assets/:objectKey 或纯 objectKey (e.g. asset_1789971200460_lol68m)
    let objectKey = '';
    if (input.includes('/api/canvases/assets/')) {
      const parts = input.split('/api/canvases/assets/');
      objectKey = parts[1]?.split('?')[0] || '';
    } else if (input.startsWith('asset_') || input.startsWith('obj_')) {
      objectKey = input.split('?')[0];
    }

    if (objectKey) {
      // 尝试从本地磁盘 .data/canvas_assets/${objectKey}.json 读取
      try {
        const filePath = path.join(LOCAL_ASSETS_DIR, `${objectKey}.json`);
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed && parsed.dataUrl && parsed.dataUrl.startsWith('data:image/')) {
            const matches = parsed.dataUrl.match(/^data:([a-zA-Z0-9-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
              return {
                buffer: Buffer.from(matches[2], 'base64'),
                mimeType: matches[1] || 'image/png'
              };
            }
          }
        }
      } catch (err: any) {
        console.warn(`[VideoSourceImageResolver] Failed to read asset JSON from disk: ${err.message}`);
      }
    }

    // C. 如果是以 '/' 开头的内部相对路径，向本地服务发起 fetch 读取
    if (input.startsWith('/')) {
      try {
        const localFetchUrl = `http://127.0.0.1:${process.env.PORT || 3000}${input}`;
        const resp = await fetch(localFetchUrl);
        if (resp.ok) {
          const arrayBuf = await resp.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);
          const mimeType = resp.headers.get('content-type') || 'image/png';
          return { buffer, mimeType };
        }
      } catch (fetchErr: any) {
        console.warn(`[VideoSourceImageResolver] Local fetch failed for ${input}: ${fetchErr.message}`);
      }
    }

    throw new Error(`UNSUPPORTED_IMAGE_FORMAT: 不支持的图片输入格式或本地资源已过期: ${input.slice(0, 100)}`);
  }
}
