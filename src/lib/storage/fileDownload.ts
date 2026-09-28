/**
 * Resilient File Download Utility
 * Handles short-lived signed URLs, direct Blob downloads, streaming links,
 * and distinct error messages for not ready, missing objects, permission errors.
 */

export interface DownloadDescriptor {
  url: string;
  fileName: string;
  mimeType: string;
  byteSize?: number;
  expiresIn?: number;
}

export type DownloadErrorCode =
  | 'FILE_RECORD_NOT_FOUND'
  | 'FILE_NOT_READY'
  | 'STORAGE_OBJECT_MISSING'
  | 'DOWNLOAD_PERMISSION_DENIED'
  | 'SIGNED_URL_CREATE_FAILED'
  | 'SIGNED_URL_EXPIRED'
  | 'DOWNLOAD_EMPTY_FILE'
  | 'FILE_INTEGRITY_MISMATCH'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export class DownloadError extends Error {
  constructor(
    public readonly code: DownloadErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'DownloadError';
  }
}

export function getHumanReadableErrorMessage(code: DownloadErrorCode): string {
  switch (code) {
    case 'FILE_NOT_READY':
      return '导出文件尚未生成完成，请稍后再试。';
    case 'STORAGE_OBJECT_MISSING':
      return '文件记录存在，但存储对象缺失，请尝试重新导出。';
    case 'SIGNED_URL_EXPIRED':
      return '下载地址已过期，正在重新获取安全凭证...';
    case 'DOWNLOAD_PERMISSION_DENIED':
      return '您没有访问或下载该文件的权限。';
    case 'DOWNLOAD_EMPTY_FILE':
      return '下载文件内容为空，请重新生成。';
    case 'FILE_RECORD_NOT_FOUND':
      return '指定的文件记录不存在或已被清除。';
    default:
      return '下载失败，请检查网络后重试。';
  }
}

export async function downloadBlob(url: string, fallbackFileName: string): Promise<void> {
  const cleanUrl = url.includes('?') ? `${url}&download=1` : `${url}?download=1`;
  const res = await fetch(cleanUrl);

  if (!res.ok) {
    if (res.status === 404) {
      throw new DownloadError('STORAGE_OBJECT_MISSING', '文件不存在或存储对象丢失');
    }
    if (res.status === 401 || res.status === 403) {
      throw new DownloadError('DOWNLOAD_PERMISSION_DENIED', '无权下载该文件');
    }
    if (res.status === 409 || res.status === 425) {
      throw new DownloadError('FILE_NOT_READY', '文件仍在生成处理中');
    }
    throw new DownloadError('NETWORK_ERROR', `下载响应异常 (HTTP ${res.status})`);
  }

  const blob = await res.blob();
  if (!blob || blob.size === 0) {
    throw new DownloadError('DOWNLOAD_EMPTY_FILE', '文件内容为空 (0 bytes)');
  }

  const blobUrl = window.URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fallbackFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    window.URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Direct download trigger for browser navigation (for large files)
 */
export function triggerDirectDownload(url: string, fileName?: string) {
  const cleanUrl = url.includes('?') ? `${url}&download=1` : `${url}?download=1`;
  const a = document.createElement('a');
  a.href = cleanUrl;
  if (fileName) a.download = fileName;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Resilient multi-candidate downloader
 */
export async function downloadFileWithFallback(urls: string[], fileName: string): Promise<boolean> {
  const validUrls = urls.filter(Boolean);
  if (validUrls.length === 0) return false;

  for (const url of validUrls) {
    try {
      await downloadBlob(url, fileName);
      return true;
    } catch (e) {
      console.warn(`[FileDownload] Failed on candidate url: ${url}`, e);
    }
  }

  // Fallback to browser direct download on first URL
  try {
    triggerDirectDownload(validUrls[0], fileName);
    return true;
  } catch (err) {
    console.error('[FileDownload] Direct fallback failed:', err);
    return false;
  }
}
