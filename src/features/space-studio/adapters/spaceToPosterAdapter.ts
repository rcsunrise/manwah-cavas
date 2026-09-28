// src/features/space-studio/adapters/spaceToPosterAdapter.ts
// MANWAH Space Studio ➔ Poster Studio 营销排版资产桥接适配器 V6.0
// 职责：
// 1. 将 Space Studio 的空间摄影镜头资产（空景过审镜头或带模特 Human Pass）与家具产品 DNA，
//    无损转换为 Poster Studio 的 PlanScreenItem 与 PosterCompositionSnapshot。
// 2. 映射镜头意图到海报角色（例如 A01 全景对应 01_brand_hero，A02 黄金角对应 02_core_selling_point，A03 舒展深躺对应 04_function_demo）。
// 3. 复用成熟的文案生成、排版层（TextLayers、ImageLayers）与品牌徽标，实现即开即排。

import { ShotInstance, ProductAsset, SpacePreset } from '../../../types/spaceStudio';
import { PlanScreenItem, buildPosterComposition } from '../../../services/posterStudioService';
import { PosterRole, TemplateId, PosterCompositionSnapshot } from '../../../types/posterTemplate';
import { ROLE_TO_TEMPLATE_MAP, POSTER_TEMPLATES } from '../../../config/posterTemplates';

export interface SpaceToPosterConvertOptions {
  shot: ShotInstance;
  product: ProductAsset;
  spacePreset?: SpacePreset;
  screenIndex?: number;
  canvasAspect?: string; // 默认 '3:4'
}

export class SpaceToPosterAdapter {
  /**
   * 将镜头代码与摄影意图映射到标准九屏海报角色与模版
   */
  public static mapShotToPosterRole(shot: ShotInstance): { role: PosterRole; templateId: TemplateId; defaultIndex: number } {
    const code = shot.templateCode.toUpperCase();

    if (code === 'A00' || code === 'A01') {
      return {
        role: '01_brand_hero',
        templateId: 'hero-editorial',
        defaultIndex: 1
      };
    }

    if (code === 'A02') {
      return {
        role: '02_core_selling_point',
        templateId: 'feature-cards',
        defaultIndex: 2
      };
    }

    if (code === 'A03' || code.includes('RECLINE') || code.includes('FUNCTION')) {
      return {
        role: '04_function_demo',
        templateId: 'function-sequence',
        defaultIndex: 4
      };
    }

    if (code === 'A04' || shot.hasHumanPass) {
      return {
        role: '03_lifestyle_scene',
        templateId: 'lifestyle-story',
        defaultIndex: 3
      };
    }

    if (code === 'A05' || code === 'A06') {
      return {
        role: '06_material_detail',
        templateId: 'material-detail',
        defaultIndex: 6
      };
    }

    // 默认回退
    return {
      role: '01_brand_hero',
      templateId: 'hero-editorial',
      defaultIndex: 1
    };
  }

  /**
   * 将当前空间镜头转化为海报画板所需的单屏计划 (PlanScreenItem)
   */
  public static convertShotToScreenItem(options: SpaceToPosterConvertOptions): PlanScreenItem {
    const { shot, product, spacePreset, screenIndex, canvasAspect = '3:4' } = options;
    const { role, templateId, defaultIndex } = this.mapShotToPosterRole(shot);
    const targetIndex = screenIndex || defaultIndex;

    // 获取当前最高优先级的图像 (如果有 Human Pass 则取 Human Pass 修订版本，否则取当前审核通过或最新版本)
    let imageUrl = '';
    if (shot.revisions && shot.revisions.length > 0) {
      const activeRev =
        shot.revisions.find((r) => r.id === shot.currentRevisionId) || shot.revisions[0];
      imageUrl =
        activeRev.imageUrl ||
        (activeRev.objectKey ? `/api/space/storage/download?key=${encodeURIComponent(activeRev.objectKey)}` : '');
    }

    const template = POSTER_TEMPLATES[templateId] || POSTER_TEMPLATES['hero-editorial'];

    // 针对敏华产品 DNA 组装精准文案
    const primaryMaterial = product.materials?.[0] || '进口头层真皮';
    const primaryColor = product.colors?.[0] || '经典云雾暖灰';
    const dims = product.dimensions || { width: 3100, depth: 1080, height: 950 };

    let headline = `${product.name} · 头等舱尊享`;
    let subheadline = `${primaryMaterial} · ${primaryColor}`;
    let body = `全景呈现${spacePreset?.name || '大平层'}高定空间尺度，融合零重力电动机械系统与精湛手工皮艺。`;

    if (shot.hasHumanPass) {
      headline = `${product.name} · 温馨居家私享`;
      subheadline = `全家人的头等舱舒适体验 · 人体工学精准承托`;
      body = `搭载敏华新一代电动舒展功能机构，110°-160°自由调节，打造高品质家庭聚会与静谧休憩领地。`;
    } else if (role === '04_function_demo') {
      headline = `110°~160° 太空零重力升维`;
      subheadline = `超静音强劲电机 · 小腿与脊椎零压力承托`;
      body = `一键启动舒展功能脚托，心脏与脚踝保持平行悬浮体验，释放全身疲劳。`;
    }

    return {
      screenIndex: targetIndex,
      screenTitle: `${shot.templateCode} - ${shot.name}`,
      role,
      templateId,
      prompt: `High-end commercial poster of ${product.name}, ${shot.intent.name}, 35mm lens architecture luxury lighting`,
      negativePrompt: 'No low quality, No watermark, No blur, Keep realistic product scale',
      safeAreaFocus: 'top-left-safe',
      headline,
      subheadline,
      body,
      points: [
        `头等舱功能位：${product.role.includes('sofa') ? '左右双独立电动躺位' : '单人独立深躺'}`,
        `奢选材质：${primaryMaterial}`,
        `工学尺寸：${dims.width} × ${dims.depth} × ${dims.height} mm`
      ],
      sourceImageUrl: imageUrl,
      sourceWidth: 2100,
      sourceHeight: 2800,
      sourceAspectRatio: 3 / 4,
      status: imageUrl ? 'approved' : 'review'
    };
  }

  /**
   * 将当前镜头无损打包为完整的海报排版合成快照
   */
  public static convertToPosterComposition(options: SpaceToPosterConvertOptions): PosterCompositionSnapshot {
    const screenItem = this.convertShotToScreenItem(options);
    return buildPosterComposition(screenItem, screenItem.sourceImageUrl, 2100, 2800, '3:4');
  }
}
