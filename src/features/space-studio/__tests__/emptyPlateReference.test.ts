import { describe, it, expect } from 'vitest';
import { buildRenderCandidatesPayload } from '../engine/renderPayloadBuilder';
import { STANDARD_SHOT_TEMPLATES, SCENE_MASTER_TEMPLATE } from '../data/shotTemplates';
import { SPACE_PROTOTYPES } from '../data/spacePresets';
import { STYLE_PRESETS } from '../data/stylePresets';
import { INITIAL_MANWAH_PRODUCTS } from '../data/productAssets';
import { PlacementEngine } from '../engine/placementEngine';
import { ShotInstance, ShotRevision } from '../../../types/spaceStudio';
import { buildStudioSwapDirective } from '../../../../server/services/spaceImageGenerationService';

describe('A00 清除家具空场景作为衍生镜头空间参考', () => {
  const spacePreset = SPACE_PROTOTYPES[0];
  const stylePreset = STYLE_PRESETS[0];
  const products = INITIAL_MANWAH_PRODUCTS;
  const blueprint = PlacementEngine.generateStandardBlueprint({ spacePreset, products });

  const masterRev: ShotRevision = {
    id: 'rev-a00-1',
    shotId: 'shot-a00',
    revisionNumber: 1,
    objectKey: 'projects/p/shots/A00/master.webp',
    imageUrl: '/api/space/storage/local-file?key=master',
    promptSnapshotId: 'snap',
    status: 'approved',
    provenance: 'AI_ESTIMATED',
    productionTruth: true,
    createdAt: new Date().toISOString()
  };
  const plateRev: ShotRevision = {
    ...masterRev,
    id: 'rev-empty-plate-1',
    revisionNumber: 2,
    objectKey: 'plate-key',
    imageUrl: '/plate.webp',
    parentRevisionId: 'rev-a00-1',
    isEmptyPlate: true
  };

  const buildShots = (opts: { withPlate?: boolean; sceneRefId?: string; currentId?: string } = {}): ShotInstance[] =>
    [SCENE_MASTER_TEMPLATE, ...STANDARD_SHOT_TEMPLATES].map((tpl) => {
      const isA00 = tpl.code === 'A00';
      const revisions = isA00 ? (opts.withPlate ? [plateRev, masterRev] : [masterRev]) : [];
      return {
        id: `shot-${tpl.code.toLowerCase()}`,
        templateCode: tpl.code,
        name: tpl.name,
        aspectRatio: tpl.recommendedAspectRatio as any,
        camera: { ...tpl.defaultCamera },
        intent: { ...tpl.intent },
        status: isA00 ? 'passed' : 'draft',
        currentRevisionId: isA00 ? opts.currentId || masterRev.id : undefined,
        revisions,
        hasHumanPass: false,
        sceneReferenceRevisionId: isA00 ? opts.sceneRefId : undefined
      };
    });

  const build = (shots: ShotInstance[], renderMode: 'studio_swap' | 'orchestration') =>
    buildRenderCandidatesPayload({
      projectId: 'p',
      targetShot: shots.find((s) => s.templateCode === 'A03')!,
      candidateCount: 1,
      activeSettings: {
        model: 'gemini-nano-banana-2.1-preview',
        resolution: '2K',
        aspectRatio: '4:3',
        useRandomSeed: true,
        autoModelFallback: false,
        renderMode
      },
      selectedSpace: spacePreset,
      selectedStyle: stylePreset,
      products,
      shots,
      sceneMaster: null,
      blueprint,
      computeConfig: {
        model: 'gemini-nano-banana-2.1-preview',
        resolution: '2K',
        aspectRatio: '4:3',
        namingPreset: 'standard',
        autoModelFallback: false
      }
    });

  it('设为场景参考的空场景版本优先于 A00 当前展示的带家具母版', () => {
    const payload = build(buildShots({ withPlate: true, sceneRefId: plateRev.id }), 'studio_swap');
    expect(payload.sceneMasterReference).toEqual({ objectKey: 'plate-key', imageUrl: '/plate.webp', isEmptyPlate: true });
  });

  it('空场景只是生成在记录里、未设为场景参考时，仍使用 A00 当前版本', () => {
    const payload = build(buildShots({ withPlate: true }), 'studio_swap');
    expect(payload.sceneMasterReference?.imageUrl).toBe('/api/space/storage/local-file?key=master');
    expect(payload.sceneMasterReference?.isEmptyPlate).toBeUndefined();
  });

  it('A00 当前展示的就是空场景时，也按空场景处理', () => {
    const payload = build(buildShots({ withPlate: true, currentId: plateRev.id }), 'studio_swap');
    expect(payload.sceneMasterReference).toEqual({ objectKey: 'plate-key', imageUrl: '/plate.webp', isEmptyPlate: true });
  });

  it('场景参考指向已删除的版本时回退到 A00 当前版本', () => {
    const payload = build(buildShots({ sceneRefId: 'rev-deleted' }), 'studio_swap');
    expect(payload.sceneMasterReference?.imageUrl).toBe('/api/space/storage/local-file?key=master');
  });

  it('衍生镜头提示词逐字使用工作流页面实测有效的指令', () => {
    const prompt = buildStudioSwapDirective({ shotCode: 'A02', hasSceneMasterReference: true, masterIsEmptyPlate: true });
    expect(prompt.startsWith(
      '画面重绘，以窗口1为底图，商企-画面场景更换背景，按产品的调性生成新的空间背景，场景风格：参考窗口2，按三人位的沙发调性生成新的调性背景墙。其中家具、所有的地毯、挂画、餐桌配套保持不变。保持窗口1的产品角度不变。保证原图的尺寸比例不变。要求生成的产品组合与空间透视是融合的。整体空间室内建筑摄影风格。'
    )).toBe(true);
    // 不再写「同一个房间」或叠加材质/机位/透视/光影规则，避免模型照搬窗口2 的正面构图
    expect(prompt).not.toContain('同一个房间');
    expect(prompt).not.toContain('配色材质与窗口2一致');
  });

  it('主品为双人位沙发时替换调性描述', () => {
    const prompt = buildStudioSwapDirective({ shotCode: 'A03', hasSceneMasterReference: true, primaryRole: 'sofa_2seat' });
    expect(prompt).toContain('按双人位的沙发调性生成新的调性背景墙');
  });
});
