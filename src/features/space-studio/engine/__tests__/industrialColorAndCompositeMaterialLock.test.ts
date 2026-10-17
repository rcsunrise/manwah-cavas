// src/features/space-studio/engine/__tests__/industrialColorAndCompositeMaterialLock.test.ts
import { describe, it, expect } from 'vitest';
import {
  MANWAH_INDUSTRIAL_COLOR_STANDARDS,
  resolveIndustrialColorDna,
  translateColorToEnglish,
  resolveCompositeMaterialDna,
  translateMaterialToEnglish
} from '../materialDnaTranslator';
import { ShootCompiler } from '../shootCompiler';
import { ProductAsset, ShotInstance } from '../../../../types/spaceStudio';
import { SPACE_PROTOTYPES } from '../../data/spacePresets';
import { STYLE_PRESETS } from '../../data/stylePresets';
import { PlacementEngine } from '../placementEngine';

describe('Industrial Color Standard & Composite Material Lock', () => {
  describe('色系粒度与 Hex 工业色卡精准联动', () => {
    it('正确将“曜石深灰”绑定到标准工业色卡 Hex #2A2B2D 并在提示词中增加精确色值基准', () => {
      const resolved = resolveIndustrialColorDna('曜石深灰');
      expect(resolved.hex).toBe('#2A2B2D');
      expect(resolved.nameZh).toBe('曜石深灰');
      expect(resolved.promptAnchor).toContain('#2A2B2D');
      expect(resolved.promptAnchor).toContain('obsidian deep charcoal grey');

      const promptClause = translateColorToEnglish('曜石深灰');
      expect(promptClause).toContain('#2A2B2D');
      expect(promptClause).toContain('obsidian deep charcoal grey');
      expect(promptClause.toLowerCase()).not.toContain('leather');
    });

    it('正确将“极地奶白”绑定到标准工业色卡 Hex #F5F3EF 并在提示词中增加精确色值基准', () => {
      const resolved = resolveIndustrialColorDna('极地奶白');
      expect(resolved.hex).toBe('#F5F3EF');
      expect(resolved.promptAnchor).toContain('#F5F3EF');
      expect(resolved.promptAnchor).toContain('polar milk-white');
    });

    it('支持直接输入或嵌入 Hex 颜色码自动生成精确物理色值基准', () => {
      // 匹配已知标准
      const resolvedPreset = resolveIndustrialColorDna('设计色 #2A2B2D');
      expect(resolvedPreset.hex).toBe('#2A2B2D');
      expect(resolvedPreset.promptAnchor).toContain('#2A2B2D');

      // 自定义色值基准
      const customResolved = resolveIndustrialColorDna('自定义科技青灰 #3A4B5C');
      expect(customResolved.hex).toBe('#3A4B5C');
      expect(customResolved.promptAnchor).toContain('#3A4B5C');
      expect(customResolved.promptAnchor).toContain('exact color anchor #3A4B5C');
    });

    it('正确将“复古深栗棕”绑定到标准工业色卡 Hex #4A2A1A 并注入防焦糖浅化漂移约束', () => {
      const resolved = resolveIndustrialColorDna('复古深栗棕');
      expect(resolved.hex).toBe('#4A2A1A');
      expect(resolved.nameZh).toContain('复古深栗棕');
      expect(resolved.promptAnchor).toContain('#4A2A1A');
      expect(resolved.promptAnchor).toContain('strictly NOT yellow caramel');
      expect(resolved.promptAnchor).toContain('strictly NOT light tan');

      const promptClause = translateColorToEnglish('复古深栗棕 (Vintage Chestnut)');
      expect(promptClause).toContain('#4A2A1A');
      expect(promptClause.toLowerCase()).not.toContain('leather');
    });

    it('确保深栗棕/深棕优先于焦糖黄被匹配，彻底防止深色皮质漂移为黄色', () => {
      const darkChestnut = resolveIndustrialColorDna('复古深栗棕');
      const deepEspresso = resolveIndustrialColorDna('浓缩深咖');
      const caramel = resolveIndustrialColorDna('暖阳焦糖黄');

      expect(darkChestnut.hex).toBe('#4A2A1A');
      expect(deepEspresso.hex).toBe('#3D261C');
      expect(caramel.hex).toBe('#8D532E');
      expect(darkChestnut.promptAnchor).not.toContain('warm saddle caramel');
    });

    it('色彩描述严格剥离皮革/材质等基质干扰，支持纯色彩视觉锚定', () => {
      const colors = ['焦糖棕', '曜石深灰', '极地奶白', '云雾暖灰', '干邑暖橙', '深咖', '复古深栗棕'];
      for (const c of colors) {
        const text = translateColorToEnglish(c);
        expect(text.toLowerCase()).not.toContain('leather');
      }
    });
  });

  describe('复合工业材质深度约束（黑金大理石纹茶几与奢石）', () => {
    it('针对“黑金大理石纹茶几”深度追加高光石材倒角、金丝石纹分布与金属底座复合材质约束', () => {
      const composite = resolveCompositeMaterialDna('黑金大理石纹茶几', 'coffee_table');

      // 1. 材质名称
      expect(composite.materialEn).toContain('Laurent Black Gold marble');
      expect(composite.materialEn).toContain('Nero Portoro');

      // 2. 高光石材 45° 倒角与微弧安全边
      expect(composite.craftsmanshipDirective).toContain('45-degree polished chamfered bevel');
      expect(composite.craftsmanshipDirective).toContain('micro-radius safety rounded corners');
      expect(composite.craftsmanshipDirective).toContain('specular reflections');

      // 3. 天然金丝矿脉分布与有机非重复生长走向
      expect(composite.craftsmanshipDirective).toContain('lightning-vein gold');
      expect(composite.craftsmanshipDirective).toContain('non-repeating branching');
      expect(composite.craftsmanshipDirective).toContain('translucent mineral depth');

      // 4. 金属拉丝底座与悬浮结构
      expect(composite.craftsmanshipDirective).toContain('hairline brushed dark titanium alloy metal subframe chassis');
      expect(composite.craftsmanshipDirective).toContain('satin anodized finish');

      // 5. 防劣质贴皮/印花贴纸负向约束
      expect(composite.antiStickerNegative).toContain('fake marble sticker');
      expect(composite.antiStickerNegative).toContain('cheap laminate');
      expect(composite.antiStickerNegative).toContain('repeating stone pattern');
      expect(composite.antiStickerNegative).toContain('vinyl sticker wrap');
      expect(composite.antiStickerNegative).toContain('blurred inkjet veins');
    });

    it('通过 ShootCompiler 将黑金大理石茶几的复合工艺与防贴皮负词完整编织入提示词', () => {
      const mockPrimarySofa: ProductAsset = {
        id: 'sofa-1',
        sku: 'MW-SOFA-01',
        name: '极地奶白功能沙发',
        role: 'sofa_3seat',
        priority: 'primary',
        isEnsembleIncluded: true,
        colors: ['极地奶白'],
        materials: ['头层牛皮'],
        identityLock: 'strict',
        referenceImages: []
      } as unknown as ProductAsset;

      const mockCoffeeTable: ProductAsset = {
        id: 'table-1',
        sku: 'MW-TBL-01',
        name: '黑金大理石纹茶几',
        role: 'coffee_table',
        priority: 'secondary',
        isEnsembleIncluded: true,
        colors: ['曜石深灰'],
        materials: ['黑金大理石纹'],
        identityLock: 'strict',
        referenceImages: []
      } as unknown as ProductAsset;

      const mockShot: ShotInstance = {
        id: 'shot-a02',
        templateCode: 'A02',
        name: '45度全景',
        camera: {
          lensMm: 35,
          heightCm: 110,
          yawDeg: 45,
          pitchDeg: 0,
          rollDeg: 0,
          target: { type: 'product', id: 'sofa-1' },
          framing: 'wide',
          mustInclude: ['sofa_3seat'],
          mustExclude: []
        },
        intent: {
          intentCode: 'SI-01',
          name: '全景呈现',
          productDominancePct: 60,
          backgroundSuppression: 'medium',
          maxOcclusionPct: 5,
          description: '客厅全景'
        },
        status: 'draft',
        revisions: [],
        hasHumanPass: false
      };

      const blueprint = PlacementEngine.generateStandardBlueprint({
        spacePreset: SPACE_PROTOTYPES[0],
        products: [mockPrimarySofa, mockCoffeeTable]
      });

      const compiled = ShootCompiler.compileShotPrompt({
        shot: mockShot,
        sceneMaster: {
          id: 'master-1',
          projectId: 'p1',
          objectKey: '',
          promptSnapshotId: 'rev-1',
          isLocked: true,
          locks: { productIdentity: true, placement: true, architecture: true, style: true, material: true, lighting: true, camera: true, human: false }
        },
        products: [mockPrimarySofa, mockCoffeeTable],
        spacePreset: SPACE_PROTOTYPES[0],
        stylePreset: STYLE_PRESETS[0],
        blueprint
      });

      // 正向提示词应包含精确色值 Hex 锚点及茶几复合材质指令
      expect(compiled.positivePrompt).toContain('#2A2B2D'); // 曜石深灰色值
      expect(compiled.positivePrompt).toContain('#F5F3EF'); // 极地奶白色值
      expect(compiled.positivePrompt).toContain('Laurent Black Gold marble');
      expect(compiled.positivePrompt).toContain('45-degree polished chamfered bevel');
      expect(compiled.positivePrompt).toContain('hairline brushed dark titanium alloy');

      // 负向提示词必须包含防贴皮与防粗糙贴图指令
      expect(compiled.negativePrompt).toContain('fake marble sticker');
      expect(compiled.negativePrompt).toContain('cheap laminate table');
      expect(compiled.negativePrompt).toContain('repeating stone pattern');
    });
  });
});
