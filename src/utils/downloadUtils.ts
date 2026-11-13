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
