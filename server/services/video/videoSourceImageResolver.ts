// server/services/video/videoSourceImageResolver.ts
// 视频底图标准化公网解析器：负责将相对路径、本地asset、base64转换为外部AI模型可秒级读取的公网HTTPS直链

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { GcsAssetStorage } from '../storage/gcsAssetStorage';

const LOCAL_ASSETS_DIR = path.join(process.cwd(), '.data', 'canvas_assets');

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

    // 3. 将图片上传至公网可直接访问的 GCS 存储桶，并生成临时公网只读签名链接 (有效期 4 小时)
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    const objectKey = `video-sources/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;

    try {
      const gcs = GcsAssetStorage.getInstance();
      await gcs.put({
        objectKey,
        buffer,
        contentType: mimeType,
        bucketType: 'source'
      });

      const signed = await gcs.getSignedReadUrl(objectKey, 14400, 'source'); // 4 hours
      if (signed && signed.url) {
        console.log(`[VideoSourceImageResolver] Successfully resolved internal image to GCS public URL: ${objectKey}`);
        return signed.url;
      }
    } catch (err: any) {
      console.warn(`[VideoSourceImageResolver] Failed to upload image to GCS:`, err?.message);
    }

    // 4. 降级备选：如果 GCS 暂时不可达，检查是否有已配置的外部域名 (如 Cloud Run APP_URL)
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
  private static async extractBufferAndMime(
    input: string
  ): Promise<{ buffer: Buffer; mimeType: string }> {
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
        const localFetchUrl = `http://127.0.0.1:3000${input}`;
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
