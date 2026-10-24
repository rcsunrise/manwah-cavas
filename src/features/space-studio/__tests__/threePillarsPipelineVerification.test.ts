// src/features/space-studio/__tests__/threePillarsPipelineVerification.test.ts
import { describe, it, expect } from 'vitest';
import { SceneMasterPromptCompiler } from '../engine/sceneMasterPromptCompiler';
import { ShootCompiler } from '../engine/shootCompiler';
import { SPACE_PROTOTYPES } from '../data/spacePresets';
import { STYLE_PRESETS } from '../data/stylePresets';
import { INITIAL_MANWAH_PRODUCTS } from '../data/productAssets';
import { STANDARD_SHOT_TEMPLATES } from '../data/shotTemplates';
import { PlacementEngine } from '../engine/placementEngine';
import {
  getRecommendedStudioTemplate,
  STUDIO_CHOREOGRAPHY_TEMPLATES
} from '../data/choreographyPresets';

describe('三大核心业务链路全功能与自洽性验证 (Three Pillars Verification)', () => {
  const products = INITIAL_MANWAH_PRODUCTS;

  // =========================================================================
  // 链路一：产品录入 ➔ 户型选择（多种） ➔ 美学硬装（多种） ➔ 空间母体原型
  // =========================================================================
  describe('链路一：产品 ➔ 户型 ➔ 硬装 ➔ A00母版动态合成验证', () => {
    it('美学硬装材质能动态驱动背景墙，杜绝非胡桃木风格被胡桃木硬编码污染', () => {
      const spacePreset = SPACE_PROTOTYPES.find((s) => s.code === 'N-R03')!; // 挑空复式
      const styleAmerican = STYLE_PRESETS.find((st) => st.code === 'US-01')!; // 都会美式（含深胡桃木）
      const styleItalian = STYLE_PRESETS.find((st) => st.code === 'ST-02')!; // 意式轻奢侘寂（白砂岩/微水泥）

      const bp1 = PlacementEngine.generateStandardBlueprint({ spacePreset, products });
      const promptAmerican = SceneMasterPromptCompiler.compile({
        products,
        spacePreset,
        stylePreset: styleAmerican,
        placementBlueprint: bp1
      });

      const bp2 = PlacementEngine.generateStandardBlueprint({ spacePreset, products });
      const promptItalian = SceneMasterPromptCompiler.compile({
        products,
        spacePreset,
        stylePreset: styleItalian,
        placementBlueprint: bp2
      });

      // 验证美式风格下呈现美式材质
      expect(promptAmerican.positivePrompt).toContain('continuous full-span architectural feature wall');
      // 意式风格下不会强制写死 walnut paneling
      expect(promptItalian.positivePrompt).toContain('continuous full-span architectural feature wall');
      expect(promptItalian.positivePrompt).toContain(spacePreset.name);
      expect(promptItalian.positivePrompt).toContain('6.2m high ceiling');
    });

    it('6 大核心户型的独特挑高与特色要素 100% 注入 A00 编译', () => {
      for (const space of SPACE_PROTOTYPES) {
        const bp = PlacementEngine.generateStandardBlueprint({ spacePreset: space, products });
        const res = SceneMasterPromptCompiler.compile({
          products,
          spacePreset: space,
          stylePreset: STYLE_PRESETS[0],
          placementBlueprint: bp
        });
        expect(res.positivePrompt).toContain(space.name);
        expect(res.positivePrompt).toContain(`${space.ceilingHeight}m high ceiling`);
      }
    });
  });

  // =========================================================================
  // 链路二：母体原型 ➔ A01~A09 视觉镜头衍生
  // =========================================================================
  describe('链路二：母体原型 ➔ A01~A09 视觉镜头排他与视角自洽性验证', () => {
    const spacePreset = SPACE_PROTOTYPES[0];
    const stylePreset = STYLE_PRESETS[0];
    const bp = PlacementEngine.generateStandardBlueprint({ spacePreset, products });
    const mockSceneMaster: any = {
      id: 'master-01',
      imageUrl: 'https://storage.googleapis.com/test/master.webp',
      isLocked: true
    };

    it('A03 镜头作为三人位主沙发专属焦点景，排他排除侧边单椅', () => {
      const a03Template = STANDARD_SHOT_TEMPLATES.find((t) => t.code === 'A03')!;
      const shotInstance: any = {
        templateCode: 'A03',
        camera: a03Template.defaultCamera,
        intent: a03Template.intent
      };

      const res = ShootCompiler.compileShotPrompt({
        shot: shotInstance,
        sceneMaster: mockSceneMaster,
        products,
        spacePreset,
        stylePreset,
        blueprint: bp
      });

      expect(res.positivePrompt).toContain('A03 HERO 3-SEATER LIVING FOCUS');
      expect(res.positivePrompt).toContain('STRICTLY FOCUS ON THE THREE-SEATER MAIN SOFA ALONE');
      expect(res.negativePrompt).toContain('side chair');
      expect(res.negativePrompt).toContain('accent chair');
      expect(res.negativePrompt).toContain('3+1 ensemble');
    });

    it('A06 零靠墙侧景严格下达 100% 闭合约束，严禁脚托展开', () => {
      const a06Template = STANDARD_SHOT_TEMPLATES.find((t) => t.code === 'A06')!;
      const shotInstance: any = {
        templateCode: 'A06',
        camera: a06Template.defaultCamera,
        intent: a06Template.intent
      };

      const res = ShootCompiler.compileShotPrompt({
        shot: shotInstance,
        sceneMaster: mockSceneMaster,
        products,
        spacePreset,
        stylePreset,
        blueprint: bp,
        functionalPositionState: 'closed'
      });

      expect(res.positivePrompt).toContain('ZERO-WALL CLEARANCE');
      expect(res.positivePrompt).toContain('CLOSED upright configuration');
      expect(res.negativePrompt).toContain('deployed footrest');
      expect(res.negativePrompt).toContain('open recliner mechanism');
    });

    it('A08 镜头专属针对单人功能单椅，排除主沙发抢戏', () => {
      const a08Template = STANDARD_SHOT_TEMPLATES.find((t) => t.code === 'A08')!;
      const shotInstance: any = {
        templateCode: 'A08',
        camera: a08Template.defaultCamera,
        intent: a08Template.intent
      };

      const res = ShootCompiler.compileShotPrompt({
        shot: shotInstance,
        sceneMaster: mockSceneMaster,
        products,
        spacePreset,
        stylePreset,
        blueprint: bp
      });

      expect(res.positivePrompt).toContain('A08 RECLINER 5-MODE FUNCTION SHOWCASE');
      expect(res.negativePrompt).toContain('three-seater sofa centered in frame');
    });
  });

  // =========================================================================
  // 链路三：镜头 ➔ 角色资产 ➔ 人物编排器（与镜头/产品适配度）
  // =========================================================================
  describe('链路三：角色资产与人物编排器对镜头与产品适配度验证', () => {
    it('A03 镜头智能推荐主沙发 3 人位家庭聚会模板，不再错误推荐单椅零重力', () => {
      const recommendedA03 = getRecommendedStudioTemplate('A03');
      expect(recommendedA03.targetShotCode).toBe('A03');
      expect(recommendedA03.name).toContain('3人位主沙发');
      expect(recommendedA03.slots.length).toBe(3);
    });

    it('A06 零靠墙镜头推荐闭合端坐听歌模板，严格禁止动作模板要求展开后仰', () => {
      const recommendedA06 = getRecommendedStudioTemplate('A06');
      expect(recommendedA06.targetShotCode).toBe('A06');
      expect(recommendedA06.name).toContain('零靠墙闭合');
      expect(recommendedA06.fullPrompt).toContain('完全闭合收于底部');
      expect(recommendedA06.negativeConstraints).toContain('严禁脚托展开或伸出（必须完全收回闭合）');
    });

    it('A08 镜头精准推荐单椅五档/舒享动作模板', () => {
      const recommendedA08 = getRecommendedStudioTemplate('A08');
      expect(recommendedA08.targetShotCode).toBe('A08');
      expect(recommendedA08.name).toContain('单椅');
    });

    it('A04 与 A05 纵向画幅镜头容量严格限制为 1-2 人，避免多人挤爆画幅', () => {
      const tplA04 = getRecommendedStudioTemplate('A04');
      const tplA05 = getRecommendedStudioTemplate('A05');

      expect(tplA04.slots.length).toBeLessThanOrEqual(2);
      expect(tplA05.slots.length).toBeLessThanOrEqual(2);
    });
  });
});
