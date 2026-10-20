// src/services/storageManagementService.ts

export interface StorageAssetItem {
  id: string;
  bucket: string;
  name: string;
  fullPath: string;
  sizeBytes: number;
  mimeType?: string;
  updatedAt?: string;
  publicUrl?: string;
  category: 'space_studio' | 'composition' | 'export' | 'upload' | 'mask' | 'video' | 'other';
}

export interface CanvasRecordItem {
  id: string;
  title: string;
  projectId?: string;
  nodeCount: number;
  edgeCount: number;
  updatedAt: string;
  createdAt?: string;
  source: 'supabase' | 'disk';
  sizeBytes?: number;
  type?: 'canvas' | 'space_studio';
  shotCount?: number;
  coverImageUrl?: string;
  thumbnailUrl?: string;
}

export interface RevisionRecordItem {
  id: string;
  canvasId: string;
  versionName: string;
  revisionNumber: number;
  createdAt?: string;
  source: 'supabase' | 'disk';
}

export interface LocalDiskItem {
  fileName: string;
  folder: string;
  fullPath: string;
  sizeBytes: number;
  updatedAt: string;
}

export interface StorageOverview {
  totalCanvases: number;
  totalRevisions: number;
  totalStorageFiles: number;
  totalStorageBytes: number;
  totalLocalDiskFiles: number;
  totalLocalDiskBytes: number;
  supabaseConnected: boolean;
}

export interface StorageScanResult {
  overview: StorageOverview;
  canvases: CanvasRecordItem[];
  revisions: RevisionRecordItem[];
  storageAssets: StorageAssetItem[];
  localDiskItems: LocalDiskItem[];
}

export interface LocalBrowserDraftItem {
  key: string;
  title: string;
  sizeBytes: number;
  updatedAt: string;
  type?: 'canvas' | 'space_studio';
  projectId?: string;
  productName?: string;
  generatedShotsCount?: number;
  coverImageUrl?: string;
}

export class StorageManagementService {
  /**
   * Scan Supabase and server-side storage
   */
  static async scanStorage(): Promise<StorageScanResult> {
    const res = await fetch('/api/storage-management/scan');
    if (!res.ok) {
      throw new Error(`扫描失败: HTTP ${res.status}`);
    }
    const json = await res.json();
    if (!json.success || !json.data) {
      throw new Error(json.error || '扫描返回异常');
    }
    return json.data;
  }

  /**
   * Delete specified items
   */
  static async deleteItems(options: {
    canvasIds?: string[];
    revisionIds?: string[];
    storageFiles?: Array<{ bucket: string; path: string }>;
    diskFiles?: Array<{ folder: string; fileName: string }>;
  }): Promise<{
    deletedCanvasesCount: number;
    deletedRevisionsCount: number;
    deletedStorageFilesCount: number;
    deletedDiskFilesCount: number;
    freedBytesEstimate: number;
  }> {
    const res = await fetch('/api/storage-management/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });
    if (!res.ok) {
      throw new Error(`删除失败: HTTP ${res.status}`);
    }
    const json = await res.json();
    if (!json.success || !json.data) {
      throw new Error(json.error || '删除操作返回异常');
    }
    return json.data;
  }

  /**
   * Purge all items in a given scope
   */
  static async purgeAll(scope: 'all' | 'canvases' | 'revisions' | 'storage_assets' | 'disk' | 'space_studio'): Promise<{
    message: string;
    details: any;
  }> {
    const res = await fetch('/api/storage-management/purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, confirm: true })
    });
    if (!res.ok) {
      throw new Error(`清除失败: HTTP ${res.status}`);
    }
    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error || '一键清空操作失败');
    }
    return json.data;
  }

  /**
   * Scan browser localStorage for cached canvas records
   */
  static getLocalBrowserDrafts(): LocalBrowserDraftItem[] {
    if (typeof localStorage === 'undefined') return [];
    const items: LocalBrowserDraftItem[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // 1. 摄影画册工作台 (Space Studio) 本地持久化快照
      if (key.startsWith('space_studio_project_') || key === 'space_studio_active_project') {
        const value = localStorage.getItem(key) || '';
        let title = '【摄影画册工作台】空间摄影工程';
        let updatedAt = new Date().toISOString();
        let projectId = key.replace('space_studio_project_', '');
        if (key === 'space_studio_active_project') projectId = 'active';
        let productName = '多功能沙发';
        let generatedShotsCount = 0;
        let coverImageUrl: string | undefined = undefined;

        try {
          const parsed = JSON.parse(value);
          if (parsed && typeof parsed === 'object') {
            if (parsed.projectId) projectId = parsed.projectId;
            if (parsed.updatedAt) updatedAt = parsed.updatedAt;
            productName = parsed.summary?.productName || parsed.products?.[0]?.name || productName;
            generatedShotsCount = parsed.summary?.generatedShotsCount || 0;
            title = parsed.title || `【摄影画册】${productName} (${generatedShotsCount > 0 ? `${generatedShotsCount}镜头已生成` : '草稿'})`;
            coverImageUrl = parsed.sceneMaster?.imageUrl || parsed.shots?.[0]?.revisions?.[0]?.imageUrl || parsed.products?.[0]?.referenceImage;
          }
        } catch (e) {}

        items.push({
          key,
          title,
          sizeBytes: new Blob([value]).size,
          updatedAt,
          type: 'space_studio',
          projectId,
          productName,
          generatedShotsCount,
          coverImageUrl
        });
        continue;
      }

      // 2. 无限视觉画布草稿
      if (
        key.startsWith('manwah_canvas_') ||
        key.startsWith('canvas_workspace_') ||
        key.startsWith('manwah_revisions_') ||
        key.startsWith('manwah_sb_mock_creative_canvases')
      ) {
        const value = localStorage.getItem(key) || '';
        let title = key;
        let updatedAt = new Date().toISOString();

        try {
          const parsed = JSON.parse(value);
          if (parsed && typeof parsed === 'object') {
            title = parsed.title || parsed.canvas_name || parsed.workspaceName || key;
            if (parsed.last_saved_at || parsed.updated_at || parsed.timestamp) {
              updatedAt = parsed.last_saved_at || parsed.updated_at || parsed.timestamp;
            }
          }
        } catch (e) {}

        items.push({
          key,
          title,
          sizeBytes: new Blob([value]).size,
          updatedAt,
          type: 'canvas'
        });
      }
    }

    return items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /**
   * Clear specified or all browser canvas local drafts
   */
  static clearLocalBrowserDrafts(keys?: string[]): { count: number; freedBytes: number } {
    if (typeof localStorage === 'undefined') return { count: 0, freedBytes: 0 };
    let count = 0;
    let freedBytes = 0;

    const targetKeys = keys && keys.length > 0 ? keys : this.getLocalBrowserDrafts().map(d => d.key);

    for (const key of targetKeys) {
      const val = localStorage.getItem(key);
      if (val !== null) {
        freedBytes += new Blob([val]).size;
        localStorage.removeItem(key);
        count++;
      }
    }

    return { count, freedBytes };
  }
}
