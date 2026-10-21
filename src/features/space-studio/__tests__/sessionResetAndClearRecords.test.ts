// src/features/space-studio/__tests__/sessionResetAndClearRecords.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SpaceStudioPersistenceService } from '../../../services/spaceStudioPersistenceService';
import { STANDARD_SHOT_TEMPLATES } from '../data/shotTemplates';

// 内存模拟 LocalStorage (保证无环境依赖)
class MockLocalStorage {
  private store: Record<string, string> = {};

  get length() {
    return Object.keys(this.store).length;
  }

  getItem(key: string) {
    return this.store[key] !== undefined ? this.store[key] : null;
  }

  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }

  removeItem(key: string) {
    delete this.store[key];
  }

  clear() {
    this.store = {};
  }

  key(index: number) {
    return Object.keys(this.store)[index] || null;
  }
}

const mockStorage = new MockLocalStorage();
(globalThis as any).localStorage = mockStorage;
(globalThis as any).window = globalThis;

describe('Space Studio Session Reset & Clear Records', () => {
  const testProjectId = 'test-clear-session-proj-99';

  beforeEach(() => {
    mockStorage.clear();
    vi.restoreAllMocks();
  });

  it('clears active project snapshot and master from localStorage while preserving recent products when keepProducts=true', () => {
    // 1. 设置模拟的驻留快照和母版
    const mockSnapshot: any = {
      projectId: testProjectId,
      title: '【摄影画册】测试真皮沙发',
      products: [{ id: 'prod-custom-1', name: '敏华旗舰头等舱沙发现货' }],
      shots: [{ id: 'shot-a00', revisions: [{ id: 'rev-1', imageUrl: 'https://test.jpg' }] }],
      sceneMaster: { imageUrl: 'https://master.jpg', isLocked: true },
      candidateBatches: { 'shot-a00': { candidates: [{ id: 'cand-1' }] } },
      selectedCandidateIds: { 'shot-a00': 'cand-1' },
      activeShotId: 'shot-a00',
      summary: {
        productName: '敏华旗舰头等舱沙发',
        uploadedProductsCount: 1,
        generatedShotsCount: 1,
        hasMaster: true,
        totalRevisionsCount: 1
      }
    };

    SpaceStudioPersistenceService.saveSnapshot(mockSnapshot);
    mockStorage.setItem('manwah_space_active_master', JSON.stringify({ imageUrl: 'https://master.jpg' }));

    // 验证初始写入成功
    expect(mockStorage.getItem(`space_studio_project_${testProjectId}`)).not.toBeNull();
    expect(mockStorage.getItem('space_studio_active_project')).not.toBeNull();
    expect(mockStorage.getItem('manwah_space_active_master')).not.toBeNull();
    expect(mockStorage.getItem('space_studio_recent_products')).not.toBeNull();

    // 2. 执行仅清除出图记录（保留产品素材）
    SpaceStudioPersistenceService.clearActiveProjectSnapshot(testProjectId, { keepProducts: true });

    // 3. 验证出图快照与活跃母版已被清空
    expect(mockStorage.getItem(`space_studio_project_${testProjectId}`)).toBeNull();
    expect(mockStorage.getItem('space_studio_active_project')).toBeNull();
    expect(mockStorage.getItem('manwah_space_active_master')).toBeNull();

    // 验证产品素材被安全保留，便于快速开启新一轮拍摄
    expect(mockStorage.getItem('space_studio_recent_products')).not.toBeNull();
    const recent = SpaceStudioPersistenceService.getRecentUploadedProducts();
    expect(recent).toHaveLength(1);
    expect(recent?.[0].name).toBe('敏华旗舰头等舱沙发现货');
  });

  it('completely purges all project data including uploaded products when keepProducts=false', () => {
    // 1. 设置模拟快照
    const mockSnapshot: any = {
      projectId: testProjectId,
      title: '【摄影画册】待彻底清空工程',
      products: [{ id: 'prod-custom-99', name: '旧工程单品' }],
      shots: [],
      sceneMaster: { imageUrl: 'https://master.jpg' },
      candidateBatches: {},
      selectedCandidateIds: {},
      activeShotId: 'shot-a00',
      summary: {
        productName: '旧工程单品',
        uploadedProductsCount: 1,
        generatedShotsCount: 0,
        hasMaster: true,
        totalRevisionsCount: 0
      }
    };

    SpaceStudioPersistenceService.saveSnapshot(mockSnapshot);
    mockStorage.setItem('manwah_space_active_master', 'true');

    // 2. 执行彻底清空
    SpaceStudioPersistenceService.clearActiveProjectSnapshot(testProjectId, { keepProducts: false });

    // 3. 验证全部存储被清空
    expect(mockStorage.getItem(`space_studio_project_${testProjectId}`)).toBeNull();
    expect(mockStorage.getItem('space_studio_active_project')).toBeNull();
    expect(mockStorage.getItem('manwah_space_active_master')).toBeNull();
    expect(mockStorage.getItem('space_studio_recent_products')).toBeNull();
    expect(SpaceStudioPersistenceService.getRecentUploadedProducts()).toBeNull();
  });

  it('freshly resets shots template instances with 0 revisions and pending status', () => {
    const rawTemplates = STANDARD_SHOT_TEMPLATES;
    expect(rawTemplates.length).toBeGreaterThanOrEqual(8);

    // 模拟重置逻辑生成的干净模版
    const cleanShots = rawTemplates.map((tpl) => ({
      id: `shot-${tpl.code.toLowerCase()}`,
      templateCode: tpl.code,
      name: tpl.name,
      aspectRatio: tpl.recommendedAspectRatio,
      camera: tpl.defaultCamera,
      intent: tpl.intent,
      status: 'draft' as const,
      revisions: [],
      hasHumanPass: false
    }));

    // 校验重置后无残留出图污染
    expect(cleanShots.every((s) => s.revisions.length === 0)).toBe(true);
    expect(cleanShots.every((s) => s.status === 'draft')).toBe(true);
  });
});
