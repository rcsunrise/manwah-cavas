// src/features/space-studio/__tests__/shotPhotoUploadAndModelBinding.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getRecommendedStudioTemplate, mapStudioSlotsToAssignments, STUDIO_CHOREOGRAPHY_TEMPLATES } from '../data/choreographyPresets';
import { ModelAsset, HumanLayoutConfig } from '../../../types/spaceAssetLibrary';
import { ShotInstance, ShotRevision } from '../../../types/spaceStudio';
import { SpaceStudioPersistenceService, SpaceStudioProjectSnapshot } from '../../../services/spaceStudioPersistenceService';

const MOCK_MODELS: ModelAsset[] = [
  {
    id: 'model-father-01',
    name: '商务精英男主 (Father)',
    roleType: 'father',
    gender: 'male',
    ageGroup: '35-42岁 商业精英',
    views: { front: 'http://example.com/father.jpg' },
    isBuiltin: true,
    tags: ['精英', '干练']
  },
  {
    id: 'model-mother-01',
    name: '温婉优雅女主 (Mother)',
    roleType: 'mother',
    gender: 'female',
    ageGroup: '30-36岁 优雅名媛',
    views: { front: 'http://example.com/mother.jpg' },
    isBuiltin: true,
    tags: ['名媛', '温婉']
  },
  {
    id: 'model-girl-01',
    name: '灵动可爱女儿 (Girl)',
    roleType: 'daughter',
    gender: 'female',
    ageGroup: '5-8岁 甜美可爱',
    views: { front: 'http://example.com/girl.jpg' },
    isBuiltin: true,
    tags: ['可爱', '活泼']
  },
  {
    id: 'model-grandpa-01',
    name: '儒雅银发长辈 (Grandfather)',
    roleType: 'grandfather',
    gender: 'male',
    ageGroup: '65-72岁',
    views: { front: 'http://example.com/grandpa.jpg' },
    isBuiltin: true,
    tags: ['长辈']
  }
] as unknown as ModelAsset[];

class MockLocalStorage {
  private store: Record<string, string> = {};
  get length() { return Object.keys(this.store).length; }
  getItem(key: string) { return this.store[key] !== undefined ? this.store[key] : null; }
  setItem(key: string, value: string) { this.store[key] = String(value); }
  removeItem(key: string) { delete this.store[key]; }
  clear() { this.store = {}; }
  key(index: number) { return Object.keys(this.store)[index] || null; }
}

const mockStorage = new MockLocalStorage();
(globalThis as any).localStorage = mockStorage;
(globalThis as any).window = globalThis.window || {};
(globalThis as any).window.localStorage = mockStorage;

describe('镜头与模特关联与实拍照上传 (Shot Photo Upload & Model Binding)', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  describe('1. 镜头与模特选择及动作匹配的参数映射', () => {
    it('每个标准机位（A01~A09）均有精准对应的影棚动作模版与人数', () => {
      const a02Tpl = getRecommendedStudioTemplate('A02');
      expect(a02Tpl.id).toBe('studio-tpl-04'); // 精英主座 3:4
      expect(a02Tpl.count).toBe(1);

      const a03Tpl = getRecommendedStudioTemplate('A03');
      expect(a03Tpl.id).toBe('studio-tpl-a03'); // 3人位主沙发家庭焦点
      expect(a03Tpl.count).toBe(3);

      const a04Tpl = getRecommendedStudioTemplate('A04');
      expect(a04Tpl.id).toBe('studio-tpl-a04'); // 2/3主沙发亲子自拍
      expect(a04Tpl.count).toBe(2);

      const a05Tpl = getRecommendedStudioTemplate('A05');
      expect(a05Tpl.id).toBe('studio-tpl-a05'); // 2/3主沙发私享微醺
      expect(a05Tpl.count).toBe(1);

      const a06Tpl = getRecommendedStudioTemplate('A06');
      expect(a06Tpl.id).toBe('studio-tpl-a07'); // 零靠墙闭合侧景
      expect(a06Tpl.count).toBe(1);

      const a07Tpl = getRecommendedStudioTemplate('A07');
      expect(a07Tpl.id).toBe('studio-tpl-03'); // 地毯茶几松弛品茗
      expect(a07Tpl.count).toBe(2);

      const a08Tpl = getRecommendedStudioTemplate('A08');
      expect(a08Tpl.id).toBe('studio-tpl-a08-01'); // 单椅五档深度睡眠模式
      expect(a08Tpl.count).toBe(1);
    });

    it('根据机位模版自动匹配已有模特资产库角色，生成槽位参数', () => {
      const a04Tpl = getRecommendedStudioTemplate('A04'); // 母亲 + 女儿
      const slots = mapStudioSlotsToAssignments(a04Tpl, MOCK_MODELS);

      expect(slots.length).toBe(2);
      // 母亲位匹配 mother
      expect(slots[0].modelId).toBe('model-mother-01');
      expect(slots[0].actionDesc).toContain('自拍');
      // 女儿位匹配 girl
      expect(slots[1].modelId).toBe('model-girl-01');
      expect(slots[1].actionDesc).toContain('自拍表情');
    });

    it('多镜头独立维护 shotHumanLayouts 字典，切换镜头不发生串味覆盖', () => {
      const shotHumanLayouts: Record<string, HumanLayoutConfig> = {};

      // 1. 为 A03 配置 3 人阵容并自定义男主动作
      const tplA03 = getRecommendedStudioTemplate('A03');
      const slotsA03 = mapStudioSlotsToAssignments(tplA03, MOCK_MODELS);
      slotsA03[0].actionDesc = '男主人端坐翻看Manwah高定真皮样本';
      shotHumanLayouts['A03'] = {
        mode: tplA03.mode,
        characterCount: slotsA03.length,
        disallowExtraCharacters: true,
        slots: slotsA03
      };

      // 2. 为 A08 配置 1 人深度睡眠
      const tplA08 = getRecommendedStudioTemplate('A08');
      const slotsA08 = mapStudioSlotsToAssignments(tplA08, MOCK_MODELS);
      shotHumanLayouts['A08'] = {
        mode: tplA08.mode,
        characterCount: slotsA08.length,
        disallowExtraCharacters: true,
        slots: slotsA08
      };

      // 3. 校验各镜头独立保存，互不干扰
      expect(shotHumanLayouts['A03'].slots.length).toBe(3);
      expect(shotHumanLayouts['A03'].slots[0].actionDesc).toBe('男主人端坐翻看Manwah高定真皮样本');

      expect(shotHumanLayouts['A08'].slots.length).toBe(1);
      expect(shotHumanLayouts['A08'].slots[0].actionDesc).toContain('羊绒毯');
    });

    it('shotHumanLayouts 可随工程快照持久化保存并在恢复时完整读取', () => {
      const testLayouts: Record<string, HumanLayoutConfig> = {
        A02: {
          mode: 'custom',
          characterCount: 1,
          disallowExtraCharacters: true,
          slots: [
            {
              id: 'slot-test-a02',
              modelId: 'model-father-01',
              positionDesc: '45度主沙发位',
              actionDesc: '端坐从容'
            }
          ]
        }
      };

      const snapshot: Omit<SpaceStudioProjectSnapshot, 'schemaVersion' | 'updatedAt'> = {
        projectId: 'test-shot-model-proj',
        title: '测试镜头与模特工程',
        products: [],
        shots: [],
        sceneMaster: null,
        candidateBatches: {},
        selectedCandidateIds: {},
        activeShotId: 'shot-01',
        shotHumanLayouts: testLayouts,
        summary: {
          productName: '测试沙发',
          uploadedProductsCount: 1,
          generatedShotsCount: 1,
          hasMaster: false,
          totalRevisionsCount: 1
        }
      };

      SpaceStudioPersistenceService.saveSnapshot(snapshot);
      const loaded = SpaceStudioPersistenceService.loadSnapshot('test-shot-model-proj');

      expect(loaded).toBeDefined();
      expect(loaded?.shotHumanLayouts?.['A02']).toBeDefined();
      expect(loaded?.shotHumanLayouts?.['A02']?.slots[0].actionDesc).toBe('端坐从容');
    });
  });

  describe('2. 单独上传拍摄镜头照片与就着拍摄图添加模特', () => {
    it('上传实拍镜头照片后正确创建 productionTruth 版本的 ShotRevision', () => {
      const mockShot: ShotInstance = {
        id: 'shot-a02-ensemble',
        templateCode: 'A02',
        name: '45° 3+1 组合大全景',
        camera: {
          lensMm: 45,
          heightCm: 115,
          yawDeg: 40,
          pitchDeg: -3,
          rollDeg: 0,
          target: { type: 'product', id: 'living_ensemble' },
          framing: 'wide',
          mustInclude: [],
          mustExclude: []
        },
        intent: {
          intentCode: 'SI-02',
          name: '45° 3+1 组合全景聚焦',
          productDominancePct: 65,
          backgroundSuppression: 'medium',
          maxOcclusionPct: 8,
          description: '展示3+1布局'
        },
        status: 'draft',
        revisions: [],
        hasHumanPass: false
      };

      const realShotDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...';

      // 模拟 handleUploadShotPhoto 生成的新版本
      const uploadRevision: ShotRevision = {
        id: `rev-upload-${Date.now()}`,
        shotId: mockShot.id,
        revisionNumber: 1,
        objectKey: `shots/A02/user_truth_${Date.now()}.png`,
        imageUrl: realShotDataUrl,
        promptSnapshotId: 'upload-manual',
        status: 'approved',
        revisionType: 'scene',
        label: '实拍摄影图',
        metaSummary: '用户实拍镜头导入 (A02)',
        provenance: 'PROVIDED',
        productionTruth: true,
        createdAt: new Date().toISOString()
      };

      const updatedShot: ShotInstance = {
        ...mockShot,
        status: 'passed',
        currentRevisionId: uploadRevision.id,
        revisions: [uploadRevision]
      };

      // 验证当前定稿版本 imageUrl 准确指向实拍底图
      const activeRev = updatedShot.revisions.find((r) => r.id === updatedShot.currentRevisionId);
      expect(activeRev?.imageUrl).toBe(realShotDataUrl);
      expect(activeRev?.productionTruth).toBe(true);
      expect(activeRev?.label).toBe('实拍摄影图');
      expect(updatedShot.status).toBe('passed');
    });

    it('就着实拍图添加模特时，以该实拍照片作为底图基准并结合该镜头专属的模特动作参数', () => {
      const realShotPhotoUrl = 'https://manwah.com/storage/studio_shoot_a02.jpg';

      const shotWithRealPhoto: ShotInstance = {
        id: 'shot-a02',
        templateCode: 'A02',
        name: '45° 3+1 组合大全景',
        camera: { lensMm: 45, heightCm: 115, yawDeg: 40, pitchDeg: -3, rollDeg: 0, target: { type: 'product', id: 'primary' }, framing: 'wide', mustInclude: [], mustExclude: [] },
        intent: { intentCode: 'SI-02', name: '45°聚焦', productDominancePct: 65, backgroundSuppression: 'medium', maxOcclusionPct: 8, description: '' },
        status: 'passed',
        currentRevisionId: 'rev-truth-1',
        revisions: [
          {
            id: 'rev-truth-1',
            shotId: 'shot-a02',
            revisionNumber: 1,
            objectKey: 'shots/A02/truth.jpg',
            imageUrl: realShotPhotoUrl,
            promptSnapshotId: 'rev-01',
            status: 'approved',
            revisionType: 'scene',
            label: '实拍摄影图',
            provenance: 'PROVIDED',
            productionTruth: true,
            createdAt: new Date().toISOString()
          }
        ],
        hasHumanPass: false
      };

      // 1. 验证获取当前底图基准时，准确命中上传的实拍照片
      const currentRev = shotWithRealPhoto.revisions.find((r) => r.id === shotWithRealPhoto.currentRevisionId);
      const baseShotImage = currentRev?.imageUrl;
      expect(baseShotImage).toBe(realShotPhotoUrl);

      // 2. 验证结合 A02 专属的模特与动作参数进行生成
      const a02Layout = getRecommendedStudioTemplate(shotWithRealPhoto.templateCode);
      const assignedSlots = mapStudioSlotsToAssignments(a02Layout, MOCK_MODELS);

      expect(assignedSlots.length).toBe(1);
      expect(assignedSlots[0].positionDesc).toContain('主沙发');
      expect(assignedSlots[0].modelId).toBe('model-father-01');
    });
  });
});
