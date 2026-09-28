import { supabaseAdmin } from '../../src/lib/supabase';
import fs from 'fs';
import path from 'path';

export interface StorageAssetItem {
  id: string;
  bucket: string;
  name: string;
  fullPath: string;
  sizeBytes: number;
  mimeType?: string;
  updatedAt?: string;
  publicUrl?: string;
  category: 'composition' | 'export' | 'upload' | 'mask' | 'video' | 'other';
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

export interface StorageScanResult {
  overview: {
    totalCanvases: number;
    totalRevisions: number;
    totalStorageFiles: number;
    totalStorageBytes: number;
    totalLocalDiskFiles: number;
    totalLocalDiskBytes: number;
    supabaseConnected: boolean;
  };
  canvases: CanvasRecordItem[];
  revisions: RevisionRecordItem[];
  storageAssets: StorageAssetItem[];
  localDiskItems: LocalDiskItem[];
}

export class StorageManagementService {
  private static DATA_DIR = path.join(process.cwd(), '.data');

  /**
   * Recursively list files inside a Supabase Storage bucket
   */
  private static async listAllFilesRecursively(
    bucket: string,
    currentPath = '',
    maxDepth = 4
  ): Promise<StorageAssetItem[]> {
    if (maxDepth <= 0) return [];
    const results: StorageAssetItem[] = [];

    try {
      const { data, error } = await supabaseAdmin.storage.from(bucket).list(currentPath, {
        limit: 100,
        sortBy: { column: 'updated_at', order: 'desc' }
      });

      if (error || !data) {
        return results;
      }

      for (const item of data) {
        const itemFullPath = currentPath ? `${currentPath}/${item.name}` : item.name;

        // In Supabase Storage, folders typically have id === null or no metadata
        const isFolder = item.id === null && (!item.metadata || Object.keys(item.metadata).length === 0);

        if (isFolder) {
          const subFiles = await this.listAllFilesRecursively(bucket, itemFullPath, maxDepth - 1);
          results.push(...subFiles);
        } else {
          // File
          let category: StorageAssetItem['category'] = 'other';
          const isVideoFile = item.name.endsWith('.mp4') || item.name.endsWith('.mov') || item.name.endsWith('.webm');
          if (itemFullPath.includes('composition')) category = 'composition';
          else if (itemFullPath.includes('export')) category = 'export';
          else if (itemFullPath.includes('user_upload') || itemFullPath.includes('upload')) category = 'upload';
          else if (itemFullPath.includes('mask')) category = 'mask';
          else if (itemFullPath.includes('video') || isVideoFile) category = 'video';

          let publicUrl = '';
          try {
            const { data: urlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(itemFullPath);
            if (urlData?.publicUrl) publicUrl = urlData.publicUrl;
          } catch (e) {}

          const sizeBytes = item.metadata?.size || item.metadata?.contentLength || 0;

          results.push({
            id: item.id || `${bucket}_${itemFullPath}`,
            bucket,
            name: item.name,
            fullPath: itemFullPath,
            sizeBytes,
            mimeType: isVideoFile ? 'video/mp4' : (item.metadata?.mimetype || 'image/png'),
            updatedAt: item.updated_at || item.created_at || new Date().toISOString(),
            publicUrl,
            category
          });
        }
      }
    } catch (err) {
      console.warn(`[StorageManagement] Warning listing files in bucket ${bucket} path "${currentPath}":`, err);
    }

    return results;
  }

  /**
   * Scan all storage, canvas data and revisions from Supabase & Local Disk
   */
  static async scanAll(): Promise<StorageScanResult> {
    let supabaseConnected = false;
    const canvases: CanvasRecordItem[] = [];
    const revisions: RevisionRecordItem[] = [];
    const storageAssets: StorageAssetItem[] = [];
    const localDiskItems: LocalDiskItem[] = [];

    // 1. Fetch Canvases from Supabase
    try {
      const { data: sbCanvases, error: canvasErr } = await supabaseAdmin
        .from('creative_canvases')
        .select('id, title, project_id, nodes_draft, edges_draft, created_at, updated_at')
        .order('updated_at', { ascending: false });

      if (!canvasErr && sbCanvases) {
        supabaseConnected = true;
        for (const c of sbCanvases) {
          const nodeCount = Array.isArray(c.nodes_draft) ? c.nodes_draft.length : 0;
          const edgeCount = Array.isArray(c.edges_draft) ? c.edges_draft.length : 0;
          const jsonLen = JSON.stringify(c.nodes_draft || []).length + JSON.stringify(c.edges_draft || []).length;
          canvases.push({
            id: c.id,
            title: c.title || '未命名视觉企划案',
            projectId: c.project_id,
            nodeCount,
            edgeCount,
            updatedAt: c.updated_at || c.created_at || new Date().toISOString(),
            createdAt: c.created_at,
            source: 'supabase',
            sizeBytes: jsonLen
          });
        }
      }
    } catch (e) {
      console.warn('[StorageManagement] Failed to query creative_canvases from Supabase:', e);
    }

    // 2. Fetch Revisions from Supabase
    try {
      const { data: sbRevs, error: revErr } = await supabaseAdmin
        .from('canvas_revisions')
        .select('id, canvas_id, version_name, revision_number, created_at')
        .order('created_at', { ascending: false });

      if (!revErr && sbRevs) {
        for (const r of sbRevs) {
          revisions.push({
            id: r.id,
            canvasId: r.canvas_id,
            versionName: r.version_name || `V${String(r.revision_number || 1).padStart(3, '0')}`,
            revisionNumber: r.revision_number || 1,
            createdAt: r.created_at,
            source: 'supabase'
          });
        }
      }
    } catch (e) {
      console.warn('[StorageManagement] Failed to query canvas_revisions from Supabase:', e);
    }

    // 3. Scan Supabase Storage Buckets
    try {
      const bucketsToScan = ['creative-canvas-assets', 'assets', 'masks'];
      for (const bucket of bucketsToScan) {
        const files = await this.listAllFilesRecursively(bucket);
        storageAssets.push(...files);
      }
    } catch (e) {
      console.warn('[StorageManagement] Failed to scan Supabase storage buckets:', e);
    }

    // 3.5 Include registered video generations from video jobs
    try {
      const storageFile = path.join(this.DATA_DIR, 'video_jobs.json');
      if (fs.existsSync(storageFile)) {
        const raw = fs.readFileSync(storageFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.jobs && Array.isArray(parsed.jobs)) {
          for (const [, j] of parsed.jobs) {
            if (j.status === 'ready' && (j.videoUrl || j.supabaseVideoUrl)) {
              const videoId = `vjob_${j.id}`;
              if (!storageAssets.some(s => s.id === videoId || s.fullPath.includes(j.id))) {
                storageAssets.push({
                  id: videoId,
                  bucket: 'creative-canvas-assets',
                  name: `${j.shotId || '视频'}-${j.id.slice(-8)}.mp4`,
                  fullPath: `videos/${j.workspaceId || 'ws-default'}/${j.canvasId || 'canvas-default'}/${j.id}.mp4`,
                  sizeBytes: 3145728,
                  mimeType: 'video/mp4',
                  updatedAt: j.readyAt || j.updatedAt || new Date().toISOString(),
                  publicUrl: j.supabaseVideoUrl || j.videoUrl,
                  category: 'video'
                });
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[StorageManagement] Failed to scan video jobs:', e);
    }

    // 4. Scan Local Server Disk .data/
    try {
      if (fs.existsSync(this.DATA_DIR)) {
        const subDirs = ['canvases', 'revisions', 'projects', 'product_dnas', 'canvas_assets', 'videos'];
        for (const sub of subDirs) {
          const folderPath = path.join(this.DATA_DIR, sub);
          if (fs.existsSync(folderPath)) {
            const scanDirRecursive = (dir: string) => {
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const entry of entries) {
                const fullF = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                  scanDirRecursive(fullF);
                } else if (entry.isFile()) {
                  try {
                    const stat = fs.statSync(fullF);
                    localDiskItems.push({
                      fileName: entry.name,
                      folder: sub,
                      fullPath: fullF,
                      sizeBytes: stat.size,
                      updatedAt: stat.mtime.toISOString()
                    });

                    // If it's a disk canvas not yet recorded in supabase list, add it
                    if (sub === 'canvases' && entry.name.endsWith('.json')) {
                      const idFromF = entry.name.replace('.json', '');
                      if (!canvases.some(c => c.id === idFromF)) {
                        canvases.push({
                          id: idFromF,
                          title: `本地备份草稿 (${entry.name})`,
                          nodeCount: 0,
                          edgeCount: 0,
                          updatedAt: stat.mtime.toISOString(),
                          source: 'disk',
                          sizeBytes: stat.size
                        });
                      }
                    }

                    // If it's a disk revision
                    if (sub === 'revisions' && entry.name.endsWith('.json')) {
                      const idFromF = entry.name.replace('.json', '');
                      if (!revisions.some(r => r.id === idFromF)) {
                        revisions.push({
                          id: idFromF,
                          canvasId: 'local_disk',
                          versionName: entry.name,
                          revisionNumber: 1,
                          createdAt: stat.mtime.toISOString(),
                          source: 'disk'
                        });
                      }
                    }
                  } catch (e) {}
                }
              }
            };
            scanDirRecursive(folderPath);
          }
        }
      }
    } catch (e) {
      console.warn('[StorageManagement] Failed to scan local .data directory:', e);
    }

    // Total Storage calculations
    const totalStorageBytes = storageAssets.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
    const totalLocalDiskBytes = localDiskItems.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);

    return {
      overview: {
        totalCanvases: canvases.length,
        totalRevisions: revisions.length,
        totalStorageFiles: storageAssets.length,
        totalStorageBytes,
        totalLocalDiskFiles: localDiskItems.length,
        totalLocalDiskBytes,
        supabaseConnected
      },
      canvases,
      revisions,
      storageAssets,
      localDiskItems
    };
  }

  /**
   * Delete specified items across Supabase and disk
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
    let deletedCanvasesCount = 0;
    let deletedRevisionsCount = 0;
    let deletedStorageFilesCount = 0;
    let deletedDiskFilesCount = 0;
    let freedBytesEstimate = 0;

    // 1. Delete canvases from Supabase and local disk
    if (options.canvasIds && options.canvasIds.length > 0) {
      for (const cid of options.canvasIds) {
        try {
          const { error } = await supabaseAdmin
            .from('creative_canvases')
            .delete()
            .eq('id', cid);
          if (!error) deletedCanvasesCount++;
        } catch (e) {}

        // Remove disk backup
        try {
          const diskPath = path.join(this.DATA_DIR, 'canvases', `${cid}.json`);
          if (fs.existsSync(diskPath)) {
            const stat = fs.statSync(diskPath);
            freedBytesEstimate += stat.size;
            fs.unlinkSync(diskPath);
            deletedDiskFilesCount++;
          }
        } catch (e) {}
      }
    }

    // 2. Delete revisions
    if (options.revisionIds && options.revisionIds.length > 0) {
      for (const rid of options.revisionIds) {
        try {
          const { error } = await supabaseAdmin
            .from('canvas_revisions')
            .delete()
            .eq('id', rid);
          if (!error) deletedRevisionsCount++;
        } catch (e) {}

        try {
          const diskPath = path.join(this.DATA_DIR, 'revisions', `${rid}.json`);
          if (fs.existsSync(diskPath)) {
            const stat = fs.statSync(diskPath);
            freedBytesEstimate += stat.size;
            fs.unlinkSync(diskPath);
            deletedDiskFilesCount++;
          }
        } catch (e) {}
      }
    }

    // 3. Delete Supabase Storage files
    if (options.storageFiles && options.storageFiles.length > 0) {
      // Group by bucket
      const bucketMap = new Map<string, string[]>();
      for (const item of options.storageFiles) {
        const list = bucketMap.get(item.bucket) || [];
        list.push(item.path);
        bucketMap.set(item.bucket, list);
      }

      for (const [bucket, paths] of bucketMap.entries()) {
        try {
          // Batch remove in chunks of 50
          for (let i = 0; i < paths.length; i += 50) {
            const chunk = paths.slice(i, i + 50);
            const { data, error } = await supabaseAdmin.storage.from(bucket).remove(chunk);
            if (!error && data) {
              deletedStorageFilesCount += data.length;
            } else if (!error) {
              deletedStorageFilesCount += chunk.length;
            }
          }
        } catch (e) {
          console.warn(`[StorageManagement] Error removing files from bucket ${bucket}:`, e);
        }
      }
    }

    // 4. Delete specific disk files
    if (options.diskFiles && options.diskFiles.length > 0) {
      for (const df of options.diskFiles) {
        try {
          const fullP = path.join(this.DATA_DIR, df.folder, df.fileName);
          if (fs.existsSync(fullP)) {
            const stat = fs.statSync(fullP);
            freedBytesEstimate += stat.size;
            fs.unlinkSync(fullP);
            deletedDiskFilesCount++;
          }
        } catch (e) {}
      }
    }

    return {
      deletedCanvasesCount,
      deletedRevisionsCount,
      deletedStorageFilesCount,
      deletedDiskFilesCount,
      freedBytesEstimate
    };
  }

  /**
   * Purge data by scope
   */
  static async purgeAll(scope: 'all' | 'canvases' | 'revisions' | 'storage_assets' | 'disk'): Promise<{
    message: string;
    details: any;
  }> {
    const scan = await this.scanAll();

    const toDelete: {
      canvasIds?: string[];
      revisionIds?: string[];
      storageFiles?: Array<{ bucket: string; path: string }>;
      diskFiles?: Array<{ folder: string; fileName: string }>;
    } = {};

    if (scope === 'all' || scope === 'canvases') {
      toDelete.canvasIds = scan.canvases.map(c => c.id);
    }
    if (scope === 'all' || scope === 'revisions') {
      toDelete.revisionIds = scan.revisions.map(r => r.id);
    }
    if (scope === 'all' || scope === 'storage_assets') {
      toDelete.storageFiles = scan.storageAssets.map(s => ({ bucket: s.bucket, path: s.fullPath }));
    }
    if (scope === 'all' || scope === 'disk') {
      toDelete.diskFiles = scan.localDiskItems.map(d => ({ folder: d.folder, fileName: d.fileName }));
    }

    const res = await this.deleteItems(toDelete);

    return {
      message: `已成功清空所选范围 (${scope}) 的存储与历史数据`,
      details: res
    };
  }
}
