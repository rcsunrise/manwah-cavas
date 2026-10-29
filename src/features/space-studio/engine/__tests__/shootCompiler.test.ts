// src/features/space-studio/engine/__tests__/shootCompiler.test.ts
import { describe, it, expect } from 'vitest';
import { ShootCompiler } from '../shootCompiler';
import { STANDARD_SHOT_TEMPLATES } from '../../data/shotTemplates';
import { SPACE_PROTOTYPES } from '../../data/spacePresets';
import { STYLE_PRESETS } from '../../data/stylePresets';
import { INITIAL_MANWAH_PRODUCTS } from '../../data/productAssets';
import { PlacementEngine } from '../placementEngine';
import { ShotInstance, SceneMaster } from '../../../../types/spaceStudio';

describe('ShootCompiler (G3 Shoot Phase Core)', () => {
  const spacePreset = SPACE_PROTOTYPES[0];
  const stylePreset = STYLE_PRESETS[0];
  const products = INITIAL_MANWAH_PRODUCTS;
  const blueprint = PlacementEngine.generateStandardBlueprint({ spacePreset, products });

  const sceneMaster: SceneMaster = {
    id: 'master-01',
    projectId: 'test-project',
    objectKey: 'projects/test-project/masters/A00/master-01.webp',
    isLocked: true,
    lockedAt: new Date().toISOString(),
    locks: {
      productIdentity: true,
      placement: true,
      architecture: true,
      style: true,
      material: true,
      lighting: true,
      camera: true,
      human: false
    },
    promptSnapshotId: 'rev-01'
  };

  it('compiles A02 Hero shot prompt with camera DNA and material highlights', () => {
    const shotA02: ShotInstance = {
      id: 'shot-a02',
      templateCode: 'A02',
      name: STANDARD_SHOT_TEMPLATES[1].name,
      camera: STANDARD_SHOT_TEMPLATES[1].defaultCamera,
      intent: STANDARD_SHOT_TEMPLATES[1].intent,
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };

    const compiled = ShootCompiler.compileShotPrompt({
      shot: shotA02,
      sceneMaster,
      products,
      spacePreset,
      stylePreset,
      blueprint
    });

    expect(compiled.shotCode).toBe('A02');
    expect(compiled.positivePrompt).toContain('45mm');
    expect(compiled.positivePrompt).toContain('Hasselblad');
    expect(compiled.positivePrompt).toContain('45-DEGREE 3+1 ENSEMBLE VIEW');
    expect(compiled.positivePrompt).toContain('MANDATORY PERSPECTIVE SHIFT: 45° THREE-QUARTERS OBLIQUE ANGLE');
    expect(compiled.negativePrompt).toContain('flat frontal mugshot');
    expect(compiled.negativePrompt).toContain('straight-on camera');
    expect(compiled.negativePrompt).toContain('symmetrical center sofa');
    expect(compiled.negativePrompt).toContain('facing directly forward');
    expect(compiled.invarianceChecks.furnitureFixed).toBe(true);
    expect(compiled.invarianceChecks.productLocked).toBe(true);
  });

  it('compiles A08 Craftsmanship & Material Focus with high-detail cues', () => {
    const shotA08: ShotInstance = {
      id: 'shot-a08',
      templateCode: 'A08',
      name: '皮质工艺/高定特写 (Craftsmanship & Elegant Portrait)',
      camera: STANDARD_SHOT_TEMPLATES[7].defaultCamera,
      intent: STANDARD_SHOT_TEMPLATES[7].intent,
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };

    const compiled = ShootCompiler.compileShotPrompt({
      shot: shotA08,
      sceneMaster,
      products,
      spacePreset,
      stylePreset,
      blueprint
    });

    expect(compiled.shotCode).toBe('A08');
    expect(compiled.positivePrompt).toContain('50mm');
    expect(compiled.positivePrompt).toContain('RECLINER 5-MODE FUNCTION SHOWCASE');
    expect(compiled.negativePrompt).toContain('shifted sofa coordinates');
  });

  it('verifies A00 to A01 master inheritance: space & furniture invariant, only Camera DNA changes', () => {
    const shotA01: ShotInstance = {
      id: 'shot-a01',
      templateCode: 'A01',
      name: '空间主大场景',
      camera: STANDARD_SHOT_TEMPLATES[0].defaultCamera, // 35mm, 115cm, yaw: 0, pitch: 0, framing: 'wide'
      intent: STANDARD_SHOT_TEMPLATES[0].intent,
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };

    const compiled = ShootCompiler.compileShotPrompt({
      shot: shotA01,
      sceneMaster,
      products,
      spacePreset,
      stylePreset,
      blueprint
    });

    // 1. 验证镜源码
    expect(compiled.shotCode).toBe('A01');

    // 2. 验证 Camera DNA 单变量改变
    expect(compiled.cameraSpec.lensMm).toBe(35);
    expect(compiled.cameraSpec.heightCm).toBe(115);
    expect(compiled.cameraSpec.yawDeg).toBe(0);
    expect(compiled.cameraSpec.pitchDeg).toBe(0);
    expect(compiled.cameraSpec.framing).toBe('wide');
    expect(compiled.positivePrompt).toContain('35mm');
    expect(compiled.positivePrompt).toContain('115cm above finished floor');

    // 3. 验证空间世界与家具物理不变量严格继承
    expect(compiled.positivePrompt).toContain(`space prototype anchor: ${spacePreset.name}`);
    expect(compiled.positivePrompt).toContain(`design style harmony: ${stylePreset.name}`);
    expect(compiled.invarianceChecks.furnitureFixed).toBe(true);
    expect(compiled.invarianceChecks.productLocked).toBe(true);
    expect(compiled.invarianceChecks.lightingConsistent).toBe(true);

    // 4. 验证负向约束严格杜绝家具漂移
    expect(compiled.negativePrompt).toContain('physically moved furniture positions');
    expect(compiled.negativePrompt).toContain('shifted sofa coordinates');
  });

  it('validates entire A01-A08 shot suite inheritance with distinct Camera DNAs', () => {
    STANDARD_SHOT_TEMPLATES.forEach((tpl) => {
      const shot: ShotInstance = {
        id: `shot-${tpl.code.toLowerCase()}`,
        templateCode: tpl.code,
        name: tpl.name,
        camera: tpl.defaultCamera,
        intent: tpl.intent,
        status: 'draft',
        revisions: [],
        hasHumanPass: false
      };

      const result = ShootCompiler.compileShotPrompt({
        shot,
        sceneMaster,
        products,
        spacePreset,
        stylePreset,
        blueprint
      });

      expect(result.shotCode).toBe(tpl.code);
      expect(result.cameraSpec.lensMm).toBe(tpl.defaultCamera.lensMm);
      expect(result.cameraSpec.heightCm).toBe(tpl.defaultCamera.heightCm);
      expect(result.invarianceChecks.furnitureFixed).toBe(true);
      expect(result.invarianceChecks.productLocked).toBe(true);
    });
  });

  it('strictly prevents architectural hallucinations across shots (no unreferenced shelves, no hallway drift, no flipped window, no wall-mounted study room)', () => {
    // 1. A01: 不应硬编码写死窗户在左侧，且必须负向防御镜像翻转
    const shotA01: ShotInstance = {
      id: 'shot-a01-anti-hallucination',
      templateCode: 'A01',
      name: '空间主大全景',
      camera: STANDARD_SHOT_TEMPLATES[0].defaultCamera,
      intent: STANDARD_SHOT_TEMPLATES[0].intent,
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };
    const compiledA01 = ShootCompiler.compileShotPrompt({
      shot: shotA01,
      sceneMaster,
      products,
      spacePreset,
      stylePreset,
      blueprint
    });
    expect(compiledA01.positivePrompt).not.toContain('windows on the left');
    expect(compiledA01.negativePrompt).toContain('flipped room layout');
    expect(compiledA01.negativePrompt).toContain('mirrored window position');

    // 2. A05: 必须彻底剔除 wall_shelves，且负向阻断拱形置物架和书架
    const tplA05 = STANDARD_SHOT_TEMPLATES.find((t) => t.code === 'A05')!;
    const shotA05: ShotInstance = {
      id: 'shot-a05-anti-hallucination',
      templateCode: 'A05',
      name: tplA05.name,
      camera: tplA05.defaultCamera,
      intent: tplA05.intent,
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };
    const compiledA05 = ShootCompiler.compileShotPrompt({
      shot: shotA05,
      sceneMaster,
      products,
      spacePreset,
      stylePreset,
      blueprint
    });
    expect(compiledA05.positivePrompt).not.toContain('wall_shelves');
    expect(compiledA05.positivePrompt).not.toContain('cove lighting');
    expect(compiledA05.positivePrompt).not.toContain('ceiling structure');
    expect(compiledA05.positivePrompt).toContain('The ceiling is strictly 100% OUT OF FRAME');
    expect(compiledA05.negativePrompt).toContain('arched shelves');
    expect(compiledA05.negativePrompt).toContain('bookshelf');
    expect(compiledA05.negativePrompt).toContain('visible ceiling');
    expect(compiledA05.negativePrompt).toContain('squeezed ceiling');

    // 3. A06: 严禁包含误导为挂墙书架的 wall-mounted，且负向阻断书房与书架
    const tplA06 = STANDARD_SHOT_TEMPLATES.find((t) => t.code === 'A06')!;
    const shotA06: ShotInstance = {
      id: 'shot-a06-anti-hallucination',
      templateCode: 'A06',
      name: tplA06.name,
      camera: tplA06.defaultCamera,
      intent: tplA06.intent,
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };
    const compiledA06 = ShootCompiler.compileShotPrompt({
      shot: shotA06,
      sceneMaster,
      products,
      spacePreset,
      stylePreset,
      blueprint
    });
    expect(compiledA06.positivePrompt).not.toContain('WALL-MOUNTED');
    expect(compiledA06.negativePrompt).toContain('bookshelf');
    expect(compiledA06.negativePrompt).toContain('study room');

    // 4. A08: 强制在客厅地毯区域，负向阻断走廊和门框
    const tplA08 = STANDARD_SHOT_TEMPLATES.find((t) => t.code === 'A08')!;
    const shotA08: ShotInstance = {
      id: 'shot-a08-anti-hallucination',
      templateCode: 'A08',
      name: tplA08.name,
      camera: tplA08.defaultCamera,
      intent: tplA08.intent,
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };
    const compiledA08 = ShootCompiler.compileShotPrompt({
      shot: shotA08,
      sceneMaster,
      products,
      spacePreset,
      stylePreset,
      blueprint
    });
    expect(compiledA08.positivePrompt).toContain('open living room zone');
    expect(compiledA08.negativePrompt).toContain('hallway');
    expect(compiledA08.negativePrompt).toContain('corridor');
    expect(compiledA08.negativePrompt).toContain('doorway');
  });

  it('verifies prompt compactness, high-signal density, and head-weighted attention', () => {
    // 验证 A00 及典型镜头 A01/A03 的提示词信噪比与注意力集中度
    const a00Shot: ShotInstance = {
      id: 'shot-a00-test',
      templateCode: 'A00',
      name: '空间母版',
      camera: { lensMm: 35, heightCm: 135, yawDeg: 0, pitchDeg: 0, rollDeg: 0, target: { type: 'product', id: 'primary_sofa' }, framing: 'wide', mustInclude: [], mustExclude: [] },
      intent: { intentCode: 'SI-01', name: '空间母版', description: '空间母版', productDominancePct: 60, backgroundSuppression: 'low', maxOcclusionPct: 5 },
      status: 'draft',
      revisions: [],
      hasHumanPass: false
    };

    const compiledA00 = ShootCompiler.compileShotPrompt({
      shot: a00Shot,
      sceneMaster,
      products,
      spacePreset,
      stylePreset,
      blueprint
    });

    // 1. 核心指令前置检验（相机的核心焦段与机位高度必须位于前半段黄金注意力窗口中）
    const firstHalfWords = compiledA00.positivePrompt.split(/\s+/).slice(0, 100).join(' ');
    expect(firstHalfWords).toContain('26mm');
    expect(firstHalfWords).toContain('135cm');

    // 2. 负向词去噪与长度健康度检验（确保负向词不过度膨胀，避免引发粉色大象逆向激活效应）
    expect(compiledA00.negativePrompt.length).toBeGreaterThan(100);
    expect(compiledA00.negativePrompt).toContain('shifted sofa coordinates');
    expect(compiledA00.negativePrompt).toContain('physically moved furniture positions');
  });
});
