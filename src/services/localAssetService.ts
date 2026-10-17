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

export class LocalAssetService {
  private static instance: LocalAssetService | null = null;
  private currentDirHandle: any = null;
  private directoryName: string = '';
  private indexedAssets: LocalAssetItem[] = [];
  private isScanning: boolean = false;

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
    return !!this.currentDirHandle && this.indexedAssets.length > 0;
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
      return { success: false, error: '当前浏览器不支持本地文件夹授权 API，建议使用 Chrome 或 Edge 浏览器' };
    }

    try {
      // @ts-ignore - showDirectoryPicker is supported in modern Chromium
      const dirHandle = await window.showDirectoryPicker({
        id: 'manwah_local_assets',
        mode: 'read'
      });

      this.currentDirHandle = dirHandle;
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
      if (err.name === 'AbortError') {
        return { success: false, error: '用户取消了文件夹授权' };
      }
      return { success: false, error: err.message || '获取本地文件夹失败' };
    }
  }

  /**
   * Rescan currently connected directory
   */
  public async rescanDirectory(): Promise<{ success: boolean; count?: number; error?: string }> {
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
