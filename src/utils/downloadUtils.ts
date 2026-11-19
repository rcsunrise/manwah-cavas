/**
 * Utility for downloading high-resolution images/posters directly from Canvas
 * Preserves exact original pixel dimensions and prevents browser compression.
 */

export async function downloadHighResImage(url: string, filename: string): Promise<void> {
  if (!url) {
    console.error('Download failed: URL is empty');
    return;
  }

  try {
    // If it's a data URL, download directly via blob
    if (url.startsWith('data:')) {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // Fetch the raw image blob to avoid browser CORS/canvas compression
    const response = await fetch(url, {
      headers: {
        'Accept': 'image/jpeg,image/png,image/webp,image/*;q=0.9'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();

    // Clean up
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }, 100);
  } catch (err) {
    console.warn('Direct fetch download failed, falling back to window opening:', err);
    // 取不到图片（网络/跨域）：抛出让调用方提示，不再用链接导航——在桌面应用里会把整个窗口带走
    throw err instanceof Error ? err : new Error('图片下载失败');
  }
}

/**
 * 画布图片下载的文件名主体：类型 + 名称（含“· 修改 / · 换细节”等版本后缀）+ 生成时间。
 * 同一张海报的各个修改版 screenTitle 相同，以前只用 screenTitle 命名，下载下来会重名、被浏览器加 (1)(2) 或覆盖。
 */
export function canvasImageFileBase(nodeId: string | undefined, data: any): string {
  const d = data || {};
  const tp = d.templatePoster;
  const kind =
    tp?.template === 'A' ? '4-3海报' : tp?.template === 'B' ? '氛围海报' : tp?.template === 'C' ? '色卡海报' : `分镜${d.sceneIndex || d.screenIndex || 1}`;
  const name = String(d.title || d.screenTitle || tp?.concept?.name || tp?.name || '画面');
  const safe = name.replace(/\s*·\s*/g, '-').replace(/[\s/\?%*:|"<>]/g, '_').replace(/_+/g, '_').slice(0, 40);
  // 节点 id 里带生成时的毫秒时间戳（template-poster-a-1795057171560、image-edit-…）：转成 月日-时分秒，各版本必不相同
  const ms = Number(String(nodeId || '').match(/(\d{12,})/)?.[1] || 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  let stamp = '';
  if (ms > 1e12) {
    const t = new Date(ms);
    stamp = `${pad(t.getMonth() + 1)}${pad(t.getDate())}-${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}`;
  } else if (nodeId) {
    stamp = String(nodeId).replace(/[^a-zA-Z0-9]/g, '').slice(-6);
  }
  return ['MW', kind, safe, stamp].filter(Boolean).join('_');
}
