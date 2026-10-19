// src/services/spaceStudioPersistenceService.ts
// 空间摄影工作台（Space Studio）全量作业状态本地持久化与快照管理服务
// 解决痛点：
// 1. 用户上传的产品素材、搭配库、工程规格本地持久化，刷新/离开不丢失；
// 2. A00 空间母版与 A01~A08 各镜头已生成素材/候选图/历史版本存入浏览器，跨页面/跨会话无缝复原；
// 3. 为“历史工程 / 云端存储中心”提供空间摄影工程索引与直达入口。

import {
  ProductAsset,
  ShotInstance,
  SceneMaster,
  PlacementBlueprint
} from '../types/spaceStudio';
import { ShotCandidateBatch } from '../types/spaceAssetLibrary';

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
   * 保存当前摄影工作台作业快照（自动落盘至当前浏览器）
   */
  static saveSnapshot(snapshot: Omit<SpaceStudioProjectSnapshot, 'schemaVersion' | 'updatedAt'>): void {
    if (typeof window === 'undefined' || !snapshot.projectId) return;

    try {
      const fullSnapshot: SpaceStudioProjectSnapshot = {
        ...snapshot,
        schemaVersion: 'space-studio-snapshot/v1',
        updatedAt: new Date().toISOString()
      };

      const serialized = JSON.stringify(fullSnapshot);
      const storageKey = `space_studio_project_${snapshot.projectId}`;

      // 1. 存入按 projectId 隔离的独立槽位
      localStorage.setItem(storageKey, serialized);

      // 2. 存入当前活跃作业槽位 (用于 /poster-studio/new 或无参返回时无缝继承)
      localStorage.setItem(ACTIVE_PROJECT_KEY, serialized);

      // 3. 独立缓存最近上传的真实产品列表 (非默认 Demo)
      const realProducts = (snapshot.products || []).filter(
        p => p.id && !['p1', 'p2', 'p3', 'p4'].includes(p.id)
      );
      if (realProducts.length > 0) {
        localStorage.setItem(RECENT_PRODUCTS_KEY, JSON.stringify(realProducts));
      }

      // 4. 更新工程目录索引
      this.updateIndexEntry(fullSnapshot, serialized.length);
    } catch (err: any) {
      console.warn('[SpaceStudioPersistence] LocalStorage save error (possibly quota):', err);
      // 若因图片 base64 过大触发 QuotaExceeded，尝试压缩剥离过大临时图后再保存
      this.saveSafeCompressedFallback(snapshot);
    }
  }

  /**
   * 配额超限时的降级存盘：剥离超大 base64 图像数据，保留 URL、DNA 规格与版本树
   */
  private static saveSafeCompressedFallback(snapshot: any) {
    try {
      const cleanProducts = (snapshot.products || []).map((p: any) => {
        const cleaned = { ...p };
        if (cleaned.referenceImage && cleaned.referenceImage.length > 200000) {
          cleaned.referenceImage = cleaned.referenceImage.slice(0, 100); // 截断超长 base64
        }
        return cleaned;
      });

      const cleanShots = (snapshot.shots || []).map((s: any) => ({
        ...s,
        revisions: (s.revisions || []).map((r: any) => ({
          ...r,
          imageUrl: r.imageUrl?.startsWith('data:') && r.imageUrl.length > 200000 ? '' : r.imageUrl
        }))
      }));

      const safePayload: SpaceStudioProjectSnapshot = {
        ...snapshot,
        products: cleanProducts,
        shots: cleanShots,
        schemaVersion: 'space-studio-snapshot/v1',
        updatedAt: new Date().toISOString()
      };

      const serialized = JSON.stringify(safePayload);
      localStorage.setItem(`space_studio_project_${snapshot.projectId}`, serialized);
      localStorage.setItem(ACTIVE_PROJECT_KEY, serialized);
      this.updateIndexEntry(safePayload, serialized.length);
    } catch (e) {
      console.error('[SpaceStudioPersistence] Safe compressed fallback also failed:', e);
    }
  }

  /**
   * 加载指定项目或最后活跃的摄影工作台快照
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

      // 从索引列表中移除
      const list = this.listAllProjectIndices().filter(item => item.projectId !== projectId);
      localStorage.setItem(INDEX_STORAGE_KEY, JSON.stringify(list));

      // 若恰好是当前活跃工程，清理
      const activeRaw = localStorage.getItem(ACTIVE_PROJECT_KEY);
      if (activeRaw && activeRaw.includes(`"projectId":"${projectId}"`)) {
        localStorage.removeItem(ACTIVE_PROJECT_KEY);
      }
    } catch (e) {
      console.error('[SpaceStudioPersistence] Delete error:', e);
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
        title: snapshot.title || `【摄影画册】${snapshot.summary.productName || '多镜头全案'}`,
        updatedAt: snapshot.updatedAt,
        sizeBytes,
        productName: snapshot.summary.productName || '功能沙发',
        generatedShotsCount: snapshot.summary.generatedShotsCount || 0,
        totalRevisionsCount: snapshot.summary.totalRevisionsCount || 0,
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
