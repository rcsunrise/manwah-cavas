import { LocalAssetItem, LocalAssetSearchCardData } from '../types/creativeCanvas';

// Allowed file extensions for furniture visual workflow
const SUPPORTED_EXTENSIONS = {
  image: ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'bmp', 'tiff'],
  document: ['pdf', 'doc', 'docx', 'txt', 'md', 'xlsx', 'xls', 'ppt', 'pptx'],
  design: ['psd', 'ai', 'sketch', 'fig', 'blend', 'obj', 'fbx', '3dm'],
  video: ['mp4', 'mov', 'webm', 'mkv', 'avi']
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAssetType(ext: string): 'image' | 'document' | 'video' | 'other' {
  if (SUPPORTED_EXTENSIONS.image.includes(ext)) return 'image';
  if (SUPPORTED_EXTENSIONS.document.includes(ext) || SUPPORTED_EXTENSIONS.design.includes(ext)) return 'document';
  if (SUPPORTED_EXTENSIONS.video.includes(ext)) return 'video';
  return 'other';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export class LocalAssetService {
  private static instance: LocalAssetService | null = null;
  private currentDirHandle: any = null;
  private directoryName: string = '';
  private indexedAssets: LocalAssetItem[] = [];
  private isScanning: boolean = false;
  /** 本机调试模式：服务端按路径读文件夹（浏览器授权不可用时的兜底） */
  private serverRoot: { rootId: string; dir: string } | null = null;
  private serverAvailable: boolean | null = null;

  private constructor() {}

  public static getInstance(): LocalAssetService {
    if (!LocalAssetService.instance) {
      LocalAssetService.instance = new LocalAssetService();
    }
    return LocalAssetService.instance;
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  public getDirectoryName(): string {
    return this.directoryName;
  }

  public isConnected(): boolean {
    return (!!this.currentDirHandle || !!this.serverRoot) && this.indexedAssets.length > 0;
  }

  /** 当前是不是“服务端按路径读取”模式 */
  public isServerMode(): boolean {
    return !!this.serverRoot;
  }

  /** 本地服务是否开放了按路径读文件夹（只有本机调试、非生产环境才有；云端部署永远是 false） */
  public async isServerFolderAvailable(): Promise<boolean> {
    if (this.serverAvailable !== null) return this.serverAvailable;
    try {
      const res = await fetch('/api/local-folder/status');
      const json = res.ok ? await res.json() : null;
      this.serverAvailable = Boolean(json?.enabled);
    } catch {
      this.serverAvailable = false;
    }
    return this.serverAvailable;
  }

  /**
   * 本机调试兜底：让本地服务直接按路径读素材文件夹。
   * 用在 showDirectoryPicker 不可用（内嵌浏览器、企业策略）或所选目录被浏览器拒绝的时候。
   */
  public async authorizeServerFolder(dir: string): Promise<{ success: boolean; dirName?: string; count?: number; error?: string }> {
    const res = await this.scanServerFolder(dir.trim());
    if (!res.success) return res;
    return { success: true, dirName: this.directoryName, count: res.count };
  }

  private async scanServerFolder(dir: string): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
      this.isScanning = true;
      const post = () =>
        fetch('/api/local-folder/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir }) });
      // 本地服务刚重启/热重载的几秒里会连不上，等一下再试一次
      let res: Response;
      try {
        res = await post();
      } catch {
        await new Promise(r => setTimeout(r, 2000));
        res = await post();
      }
      const json = await res.json().catch(() => null);
      if (json?.error?.code === 'API_ROUTE_NOT_FOUND' || res.status === 404) {
        return { success: false, error: '本地服务还是旧版本，没有「按路径读取」功能：请在终端重启 npx tsx server.ts 后再点读取。' };
      }
      if (!res.ok || !json?.success) {
        return { success: false, error: json?.error?.message || `读取失败 (${res.status})，请确认路径存在` };
      }
      const urlOf = (p: string, w?: number) =>
        `/api/local-folder/file?root=${encodeURIComponent(json.rootId)}&p=${encodeURIComponent(p)}${w ? `&w=${w}` : ''}`;
      const assets: LocalAssetItem[] = (json.items as any[]).map((it, i) => {
        const type = getAssetType(it.extension);
        return {
          id: `asset_srv_${json.rootId}_${i}`,
          name: it.name,
          path: it.path,
          size: it.size,
          formattedSize: formatFileSize(it.size),
          type,
          extension: it.extension,
          lastModified: it.lastModified,
          previewUrl: type === 'image' ? (it.extension === 'svg' ? urlOf(it.path) : urlOf(it.path, 320)) : undefined,
          serverUrl: urlOf(it.path)
        };
      });
      this.currentDirHandle = null;
      this.serverRoot = { rootId: json.rootId, dir };
      this.directoryName = json.dirName;
      this.indexedAssets = assets;
      return { success: true, count: assets.length };
    } catch (e: any) {
      const failed = /failed to fetch|networkerror|load failed/i.test(String(e?.message));
      return { success: false, error: failed ? '连不上本地服务（可能没在运行或正在重启）：请确认 npx tsx server.ts 已启动，页面地址的端口和它一致，再点读取。' : e?.message || '读取本机文件夹失败' };
    } finally {
      this.isScanning = false;
    }
  }

  public getIndexedCount(): number {
    return this.indexedAssets.length;
  }

  public getAssets(): LocalAssetItem[] {
    return this.indexedAssets;
  }

  /**
   * Request directory authorization from user via native File System Access API
   */
  public async authorizeDirectory(): Promise<{ success: boolean; dirName?: string; count?: number; error?: string }> {
    if (!this.isSupported()) {
      return { success: false, error: '当前浏览器不支持本地文件夹授权 API，建议使用 Chrome 或 Edge 浏览器；本机调试时也可以用下方「输入路径读取」。' };
    }

    try {
      // @ts-ignore - showDirectoryPicker is supported in modern Chromium
      const dirHandle = await window.showDirectoryPicker({
        id: 'manwah_local_assets',
        mode: 'read'
      });

      this.currentDirHandle = dirHandle;
      this.serverRoot = null;
      this.directoryName = dirHandle.name;
      this.isScanning = true;

      // Scan and build local in-memory index
      const assets = await this.scanDirectory(dirHandle, '');
      this.indexedAssets = assets;
      this.isScanning = false;

      return {
        success: true,
        dirName: this.directoryName,
        count: assets.length
      };
    } catch (err: any) {
      this.isScanning = false;
      console.warn('[LocalAsset] 文件夹授权失败:', err?.name, err?.message);
      if (err.name === 'AbortError') {
        // 浏览器对“取消选择”和“所选文件夹被禁止授权”给的都是 AbortError，无法区分，两种可能都说清楚
        return {
          success: false,
          error:
            '没有选中文件夹：可能是你取消了选择，也可能是所选文件夹被浏览器禁止授权。桌面、文档、下载、用户主目录和磁盘根目录本身不能授权，请先建一个素材子文件夹（如 D:\\素材）再选它。若文件夹确实合规仍反复失败，请用 Chrome / Edge 打开，或改用「配对桌面」。本机调试时也可以用下方「输入路径读取」。'
        };
      }
      if (err.name === 'SecurityError') {
        return { success: false, error: '浏览器要求在点击按钮后直接选择文件夹，请重新点一次「授权文件夹」。' };
      }
      return { success: false, error: err.message || '获取本地文件夹失败' };
    }
  }

  /**
   * Rescan currently connected directory
   */
  public async rescanDirectory(): Promise<{ success: boolean; count?: number; error?: string }> {
    if (this.serverRoot) return this.scanServerFolder(this.serverRoot.dir);
    if (!this.currentDirHandle) {
      return { success: false, error: '未连接任何本地文件夹' };
    }
    try {
      this.isScanning = true;
      const assets = await this.scanDirectory(this.currentDirHandle, '');
      this.indexedAssets = assets;
      this.isScanning = false;
      return { success: true, count: assets.length };
    } catch (e: any) {
      this.isScanning = false;
      return { success: false, error: e.message || '重新扫描失败' };
    }
  }

  /**
   * Disconnect authorized directory
   */
  public disconnect(): void {
    // Revoke cached preview object URLs
    for (const asset of this.indexedAssets) {
      if (asset.previewUrl && asset.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(asset.previewUrl);
      }
    }
    this.currentDirHandle = null;
    this.serverRoot = null;
    this.directoryName = '';
    this.indexedAssets = [];
    this.isScanning = false;
  }

  /**
   * Search local assets by keywords and categories
   */
  public searchAssets(query: string, category: 'all' | 'image' | 'document' | 'video' = 'all', limit = 8): LocalAssetSearchCardData {
    if (!this.indexedAssets.length) {
      return { query, matchedCount: 0, assets: [] };
    }

    const cleanQuery = query.trim().toLowerCase();
    const queryTokens = cleanQuery.split(/[\s,，、_-]+/).filter(Boolean);

    let candidates = this.indexedAssets;
    if (category !== 'all') {
      candidates = candidates.filter(a => a.type === category);
    }

    if (queryTokens.length === 0) {
      return {
        query,
        matchedCount: candidates.length,
        assets: candidates.slice(0, limit)
      };
    }

    // Scored fuzzy matching
    const scored = candidates.map(asset => {
      let score = 0;
      const nameLower = asset.name.toLowerCase();
      const pathLower = asset.path.toLowerCase();

      for (const token of queryTokens) {
        if (nameLower.includes(token)) score += 10;
        if (pathLower.includes(token)) score += 5;
        if (nameLower.startsWith(token)) score += 5;
        if (asset.extension.toLowerCase() === token) score += 3;
      }

      // Bonus for recent / large files or specific furniture hints
      if (nameLower.includes('主图') || nameLower.includes('渲染') || nameLower.includes('render')) score += 3;
      if (nameLower.includes('4k') || nameLower.includes('2k')) score += 2;

      return { asset, score };
    });

    const matched = scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.asset);

    return {
      query,
      matchedCount: matched.length,
      assets: matched.slice(0, limit)
    };
  }

  /**
   * Get File object for a local asset item (for uploading to Canvas)
   */
  public async getFileForAsset(asset: LocalAssetItem): Promise<File | null> {
    try {
      if (asset.file) return asset.file;
      if (asset.serverUrl) {
        const res = await fetch(asset.serverUrl);
        if (!res.ok) return null;
        const blob = await res.blob();
        const file = new File([blob], asset.name, { type: blob.type || 'application/octet-stream', lastModified: asset.lastModified });
        asset.file = file;
        return file;
      }
      if (asset.fileHandle && typeof asset.fileHandle.getFile === 'function') {
        const file = await asset.fileHandle.getFile();
        asset.file = file;
        return file;
      }
      return null;
    } catch (e) {
      console.error('Failed to get file handle for asset:', asset.name, e);
      return null;
    }
  }

  /**
   * 把一张本地图片缩到长边 maxEdge 以内，返回 JPEG data URL（面料海报取样、上传到服务端前用）。
   * 服务端模式下直接让服务端缩（十几 MB 的原图也很快），浏览器授权模式用 canvas 缩。
   */
  public async getImageDataUrl(asset: LocalAssetItem, maxEdge: number, quality = 0.88): Promise<string | null> {
    try {
      if (asset.serverUrl && !asset.file) {
        const res = await fetch(`${asset.serverUrl}&w=${Math.min(6000, Math.round(maxEdge))}`);
        if (!res.ok) return null;
        return await blobToDataUrl(await res.blob());
      }
      const file = await this.getFileForAsset(asset);
      if (!file) return null;
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const k = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * k));
      const h = Math.max(1, Math.round(bitmap.height * k));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close?.();
      return canvas.toDataURL('image/jpeg', quality);
    } catch (e) {
      console.warn('[LocalAsset] 读取图片失败:', asset.name, e);
      return null;
    }
  }

  /**
   * 面料平均色（#RRGGBB），用于挑配色：缩成小图，取中间 60%，忽略标签纸/桌面那种近白像素。结果缓存在素材上。
   */
  public async getFabricColor(asset: LocalAssetItem): Promise<string | null> {
    if (asset.colorHex) return asset.colorHex;
    const url = await this.getImageDataUrl(asset, 96, 0.8);
    if (!url) return null;
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('图片解码失败'));
        el.src = url;
      });
      const w = 48;
      const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(Math.round(w * 0.2), Math.round(h * 0.2), Math.round(w * 0.6), Math.round(h * 0.6));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        const mn = Math.min(data[i], data[i + 1], data[i + 2]);
        const mx = Math.max(data[i], data[i + 1], data[i + 2]);
        if (mn >= 205 && mx - mn <= 24) continue;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n++;
      }
      if (n === 0) return null;
      const hex = `#${[r / n, g / n, b / n].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
      asset.colorHex = hex;
      return hex;
    } catch {
      return null;
    }
  }

  /**
   * Helper to recursively scan DirectoryHandle
   */
  private async scanDirectory(dirHandle: any, currentPath: string): Promise<LocalAssetItem[]> {
    const results: LocalAssetItem[] = [];
    const IGNORED_DIRS = new Set(['node_modules', '.git', '.svn', '$recycle.bin', '.vscode', '.idea', 'dist', 'build']);

    try {
      // @ts-ignore
      for await (const entry of dirHandle.values()) {
        const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

        if (entry.kind === 'directory') {
          if (!IGNORED_DIRS.has(entry.name.toLowerCase()) && !entry.name.startsWith('.')) {
            const subItems = await this.scanDirectory(entry, entryPath);
            results.push(...subItems);
          }
        } else if (entry.kind === 'file') {
          const parts = entry.name.split('.');
          const ext = parts.length > 1 ? parts.pop()!.toLowerCase() : '';

          const isImage = SUPPORTED_EXTENSIONS.image.includes(ext);
          const isDoc = SUPPORTED_EXTENSIONS.document.includes(ext) || SUPPORTED_EXTENSIONS.design.includes(ext);
          const isVideo = SUPPORTED_EXTENSIONS.video.includes(ext);

          if (isImage || isDoc || isVideo) {
            try {
              const file = await entry.getFile();
              let previewUrl: string | undefined = undefined;

              // Generate zero-upload blob preview for images under 25MB
              if (isImage && file.size <= 25 * 1024 * 1024) {
                previewUrl = URL.createObjectURL(file);
              }

              results.push({
                id: `asset_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
                name: entry.name,
                path: entryPath,
                size: file.size,
                formattedSize: formatFileSize(file.size),
                type: getAssetType(ext),
                extension: ext,
                lastModified: file.lastModified,
                previewUrl,
                fileHandle: entry,
                file
              });
            } catch (err) {
              console.warn(`Failed to inspect file ${entry.name}:`, err);
            }
          }
        }
      }
    } catch (e) {
      console.error(`Error scanning path ${currentPath}:`, e);
    }

    return results;
  }
}

export const localAssetService = LocalAssetService.getInstance();
