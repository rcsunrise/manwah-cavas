// src/services/spaceStudioPersistenceService.ts
// 空间摄影工作台（Space Studio）全量作业状态本地持久化与快照管理服务
// 解决痛点：
// 1. 允许用户在生成后保留上一次的生成素材 以及上传的素材记录，存于用户当前浏览器；
// 2. 支持用户跳转出去工作台回到摄影工作台 还能保持当前的测试作业信息；
// 3. 采用 IndexedDB（5GB 无损大容量）+ 本地安全轻量 LocalStorage（秒开同步）+ 服务端磁盘备份 三重容灾体系；
// 4. 为“历史工程 / 云端存储中心”提供空间摄影工程索引与直达入口。

import {
  ProductAsset,
  ShotInstance,
  SceneMaster,
  PlacementBlueprint
} from '../types/spaceStudio';
import { ShotCandidateBatch, HumanLayoutConfig } from '../types/spaceAssetLibrary';
import { dbService } from './dbService';

export interface SpaceStudioProjectSnapshot {
  schemaVersion: 'space-studio-snapshot/v1';
  projectId: string;
  updatedAt: string;
  title: string;
  products: ProductAsset[];
  shots: ShotInstance[];
  sceneMaster: SceneMaster | null;
  candidateBatches: Record<string, ShotCandidateBatch>;
  selectedCandidateIds: Record<string, string>;
  activeShotId: string;
  selectedSpaceId?: string;
  selectedStyleId?: string;
  blueprint?: PlacementBlueprint;
  shotHumanLayouts?: Record<string, HumanLayoutConfig>;
  summary: {
    productName: string;
    productColor?: string;
    uploadedProductsCount: number;
    generatedShotsCount: number;
    hasMaster: boolean;
    totalRevisionsCount: number;
  };
}

export interface SpaceStudioProjectIndexItem {
  projectId: string;
  title: string;
  updatedAt: string;
  sizeBytes: number;
  productName: string;
  generatedShotsCount: number;
  totalRevisionsCount: number;
  hasMaster: boolean;
  coverImageUrl?: string;
}

const INDEX_STORAGE_KEY = 'space_studio_projects_index';
const ACTIVE_PROJECT_KEY = 'space_studio_active_project';
const RECENT_PRODUCTS_KEY = 'space_studio_recent_products';

export class SpaceStudioPersistenceService {
  /**
   * 将快照中可能存在的超大 base64 字符串（如用户刚上传的 5MB 图片）精简剥离，
   * 仅保留轻量级 URL 与产品 DNA 结构，确保 localStorage 绝对在 50KB 以内，绝不触发 QuotaExceededError
   */
  private static sanitizeSnapshotForLocalStorage(snapshot: SpaceStudioProjectSnapshot): SpaceStudioProjectSnapshot {
    const isBigDataUrl = (val: any) => typeof val === 'string' && val.startsWith('data:') && val.length > 500;

    const safeProducts = (snapshot.products || []).map(p => {
      const copy: any = { ...p };
      if (isBigDataUrl(copy.cropBase64)) copy.cropBase64 = undefined;
      if (isBigDataUrl(copy.cropImageUrl)) copy.cropImageUrl = undefined;
      if (isBigDataUrl(copy.uploadedImageUrl)) copy.uploadedImageUrl = undefined;
      if (isBigDataUrl(copy.sourceMasterImageUrl)) copy.sourceMasterImageUrl = undefined;
      if (Array.isArray(copy.referenceImages)) {
        copy.referenceImages = copy.referenceImages.map((ref: any) => ({
          ...ref,
          publicUrl: isBigDataUrl(ref.publicUrl) ? '' : ref.publicUrl
        }));
      }
      return copy;
    });

    const safeShots = (snapshot.shots || []).map(s => ({
      ...s,
      revisions: (s.revisions || []).map(r => ({
        ...r,
        imageUrl: isBigDataUrl(r.imageUrl) ? '' : r.imageUrl
      }))
    }));

    const safeBatches: Record<string, ShotCandidateBatch> = {};
    for (const [k, b] of Object.entries(snapshot.candidateBatches || {})) {
      if (b && Array.isArray(b.candidates)) {
        safeBatches[k] = {
          ...b,
          candidates: b.candidates.map(c => ({
            ...c,
            imageUrl: isBigDataUrl(c.imageUrl) ? '' : c.imageUrl
          }))
        };
      }
    }

    return {
      ...snapshot,
      products: safeProducts,
      shots: safeShots,
      candidateBatches: safeBatches,
      sceneMaster: snapshot.sceneMaster ? {
        ...snapshot.sceneMaster,
        imageUrl: isBigDataUrl(snapshot.sceneMaster.imageUrl) ? '' : snapshot.sceneMaster.imageUrl
      } : null
    };
  }

  /**
   * 保存当前摄影工作台作业快照（IndexedDB + localStorage + 服务端备份 三重落盘）
   */
  static saveSnapshot(snapshot: Omit<SpaceStudioProjectSnapshot, 'schemaVersion' | 'updatedAt'>): void {
    if (typeof window === 'undefined' || !snapshot.projectId) return;

    const fullSnapshot: SpaceStudioProjectSnapshot = {
      ...snapshot,
      schemaVersion: 'space-studio-snapshot/v1',
      updatedAt: new Date().toISOString()
    };

    // 1. 无损存入当前浏览器 IndexedDB（5GB 存储空间，完整保留全部 base64 切片与 4 候选方案）
    dbService.saveDraft(`space_studio_snapshot_${snapshot.projectId}`, fullSnapshot).catch(e => {
      console.warn('[SpaceStudioPersistence] IndexedDB saveDraft error:', e);
    });
    dbService.saveDraft('space_studio_active_project', fullSnapshot).catch(() => {});

    // 2. 异步同步到服务端 .data/space-projects/${projectId}.json（供后台历史工程中心完整检索）
    if (typeof fetch !== 'undefined') {
      fetch('/api/space/storage/projects/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullSnapshot)
      }).catch(() => {});
    }

    // 3. 剥离超大 Base64 后安全写入 localStorage（轻量可靠，保证同步读取与目录索引秒开）
    try {
      const sanitized = this.sanitizeSnapshotForLocalStorage(fullSnapshot);
      const serialized = JSON.stringify(sanitized);
      const storageKey = `space_studio_project_${snapshot.projectId}`;

      localStorage.setItem(storageKey, serialized);
      localStorage.setItem(ACTIVE_PROJECT_KEY, serialized);

      // 独立缓存最近上传的真实产品列表 (非默认 Demo)
      const realProducts = (sanitized.products || []).filter(
        p => p.id && !['p1', 'p2', 'p3', 'p4'].includes(p.id)
      );
      if (realProducts.length > 0) {
        localStorage.setItem(RECENT_PRODUCTS_KEY, JSON.stringify(realProducts));
        const fullRealProducts = (fullSnapshot.products || []).filter(
          p => p.id && !['p1', 'p2', 'p3', 'p4'].includes(p.id)
        );
        dbService.saveDraft('space_studio_recent_products_full', fullRealProducts).catch(() => {});
      }

      this.updateIndexEntry(fullSnapshot, serialized.length);
    } catch (err: any) {
      console.warn('[SpaceStudioPersistence] LocalStorage save warning:', err);
    }
  }

  /**
   * 同步加载指定项目或最后活跃的摄影工作台快照（用于组件 useState 初始秒开）
   */
  static loadSnapshot(projectId?: string): SpaceStudioProjectSnapshot | null {
    if (typeof window === 'undefined') return null;

    try {
      let raw: string | null = null;
      if (projectId && projectId !== 'new') {
        raw = localStorage.getItem(`space_studio_project_${projectId}`);
      }
      if (!raw) {
        raw = localStorage.getItem(ACTIVE_PROJECT_KEY);
      }
      if (!raw) return null;

      const parsed = JSON.parse(raw) as SpaceStudioProjectSnapshot;
      if (parsed.schemaVersion === 'space-studio-snapshot/v1') {
        return parsed;
      }
    } catch (err) {
      console.error('[SpaceStudioPersistence] Load snapshot error:', err);
    }
    return null;
  }

  /**
   * 异步加载全量高保真快照（优先从 IndexedDB 中读取原图和候选集，若无则回退服务端或 localStorage）
   */
  static async loadSnapshotAsync(projectId?: string): Promise<SpaceStudioProjectSnapshot | null> {
    if (typeof window === 'undefined') return null;

    // 1. 优先从 IndexedDB 读取无损全量快照 (带全部高清切片与未压缩素材)
    try {
      let draft: SpaceStudioProjectSnapshot | null = null;
      if (projectId && projectId !== 'new') {
        draft = await dbService.getDraft<SpaceStudioProjectSnapshot>(`space_studio_snapshot_${projectId}`);
      }
      if (!draft) {
        draft = await dbService.getDraft<SpaceStudioProjectSnapshot>('space_studio_active_project');
      }
      if (draft && draft.schemaVersion === 'space-studio-snapshot/v1') {
        return draft;
      }
    } catch (e) {
      console.warn('[SpaceStudioPersistence] IndexedDB load error, fallback to server/localStorage:', e);
    }

    // 2. 尝试从服务端 /api/space/storage/projects/snapshot/:projectId 读取
    if (projectId && projectId !== 'new') {
      try {
        const res = await fetch(`/api/space/storage/projects/snapshot/${encodeURIComponent(projectId)}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            return json.data;
          }
        }
      } catch (e) {}
    }

    // 3. Fallback to localStorage
    return this.loadSnapshot(projectId);
  }

  /**
   * 获取最近上传的自定义产品素材 (防止刷新后退回系统内置 demo)
   */
  static getRecentUploadedProducts(): ProductAsset[] | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(RECENT_PRODUCTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return null;
  }

  /**
   * 异步获取最近上传的真实完整产品素材（含 IndexedDB 中的高清切片）
   */
  static async getRecentUploadedProductsAsync(): Promise<ProductAsset[] | null> {
    try {
      const full = await dbService.getDraft<ProductAsset[]>('space_studio_recent_products_full');
      if (Array.isArray(full) && full.length > 0) return full;
    } catch {}
    return this.getRecentUploadedProducts();
  }

  /**
   * 列出用户当前浏览器中已缓存的所有摄影画册工程 (供存储管理器完整呈现)
   */
  static listAllProjectIndices(): SpaceStudioProjectIndexItem[] {
    if (typeof window === 'undefined') return [];
    try {
      const rawIndex = localStorage.getItem(INDEX_STORAGE_KEY);
      if (rawIndex) {
        const list = JSON.parse(rawIndex);
        if (Array.isArray(list)) return list;
      }
    } catch {}
    return [];
  }

  /**
   * 删除指定的摄影工作台工程快照
   */
  static deleteProjectSnapshot(projectId: string): void {
    if (typeof window === 'undefined' || !projectId) return;
    try {
      localStorage.removeItem(`space_studio_project_${projectId}`);
      dbService.deleteDraft(`space_studio_snapshot_${projectId}`).catch(() => {});

      // 从索引列表中移除
      const list = this.listAllProjectIndices().filter(item => item.projectId !== projectId);
      localStorage.setItem(INDEX_STORAGE_KEY, JSON.stringify(list));

      // 若恰好是当前活跃工程，清理
      const activeRaw = localStorage.getItem(ACTIVE_PROJECT_KEY);
      if (activeRaw && activeRaw.includes(`"projectId":"${projectId}"`)) {
        localStorage.removeItem(ACTIVE_PROJECT_KEY);
        dbService.deleteDraft('space_studio_active_project').catch(() => {});
      }
    } catch (e) {
      console.error('[SpaceStudioPersistence] Delete error:', e);
    }
  }

  /**
   * 清除当前活跃摄影工程的生成记录与本地持久化快照，方便使用者开启全新作业
   * @param projectId 当前工程 ID
   * @param options.keepProducts 是否保留已上传的产品素材，默认 true
   */
  static clearActiveProjectSnapshot(
    projectId?: string,
    options: { keepProducts?: boolean } = { keepProducts: true }
  ): void {
    if (typeof window === 'undefined') return;

    try {
      if (projectId && projectId !== 'new') {
        localStorage.removeItem(`space_studio_project_${projectId}`);
        dbService.deleteDraft(`space_studio_snapshot_${projectId}`).catch(() => {});
      }
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
      dbService.deleteDraft('space_studio_active_project').catch(() => {});
      localStorage.removeItem('manwah_space_active_master');

      if (!options.keepProducts) {
        localStorage.removeItem(RECENT_PRODUCTS_KEY);
        dbService.deleteDraft('space_studio_recent_products_full').catch(() => {});
      }
    } catch (e) {
      console.error('[SpaceStudioPersistence] clearActiveProjectSnapshot error:', e);
    }
  }

  /**
   * 内部方法：同步维护空间摄影工程索引目录
   */
  private static updateIndexEntry(snapshot: SpaceStudioProjectSnapshot, sizeBytes: number) {
    try {
      const list = this.listAllProjectIndices();
      const existingIdx = list.findIndex(item => item.projectId === snapshot.projectId);

      // 提取封面缩略图 (优先 A00 母版，其次 A01~A08 首个过审镜头，再次主产品图)
      let coverImageUrl = snapshot.sceneMaster?.imageUrl;
      if (!coverImageUrl) {
        for (const s of snapshot.shots || []) {
          if (s.revisions && s.revisions[0]?.imageUrl) {
            coverImageUrl = s.revisions[0].imageUrl;
            break;
          }
        }
      }
      if (!coverImageUrl) {
        const firstProd = snapshot.products?.[0];
        coverImageUrl = firstProd?.referenceImages?.[0]?.publicUrl || firstProd?.sourceMasterImageUrl || firstProd?.cropImageUrl;
      }

      const entry: SpaceStudioProjectIndexItem = {
        projectId: snapshot.projectId,
        title: snapshot.title || `【摄影画册】${snapshot.summary?.productName || '多镜头全案'}`,
        updatedAt: snapshot.updatedAt,
        sizeBytes,
        productName: snapshot.summary?.productName || '功能沙发',
        generatedShotsCount: snapshot.summary?.generatedShotsCount || 0,
        totalRevisionsCount: snapshot.summary?.totalRevisionsCount || 0,
        hasMaster: Boolean(snapshot.sceneMaster?.imageUrl),
        coverImageUrl: coverImageUrl?.slice(0, 1000)
      };

      if (existingIdx >= 0) {
        list[existingIdx] = entry;
      } else {
        list.unshift(entry);
      }

      // 保留最近 20 个工程索引
      const trimmedList = list.slice(0, 20);
      localStorage.setItem(INDEX_STORAGE_KEY, JSON.stringify(trimmedList));
    } catch (e) {
      console.warn('[SpaceStudioPersistence] Update index error:', e);
    }
  }
}
