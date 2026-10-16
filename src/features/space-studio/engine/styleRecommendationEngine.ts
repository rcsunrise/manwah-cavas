// src/features/space-studio/engine/styleRecommendationEngine.ts
// MANWAH Space Studio｜智能风格推荐矩阵引擎 V1.0
// 根据产品的名称、材质、主色、体量、功能属性及自适应风格标签，
// 自动计算产品与风格库 (欧美住宅 / 国际现代 / 东方住宅) 的亲和度匹配得分 (0~100%)

import { ProductAsset, StylePreset } from '../../../types/spaceStudio';
import { STYLE_PRESETS } from '../data/stylePresets';

export interface StyleRecommendationScore {
  style: StylePreset;
  score: number; // 0 - 100
  percentageLabel: string; // e.g. "94%"
  matchedTraits: string[];
}

/**
 * 计算单个产品与特定风格的加权匹配度得分
 */
export function calculateProductStyleMatch(
  product: ProductAsset,
  style: StylePreset
): { score: number; matchedTraits: string[] } {
  let score = 45; // 基准中立分数
  const matchedTraits: string[] = [];

  const productName = (product.name || '').toLowerCase();
  const productMaterials = (product.materials || []).join(' ').toLowerCase();
  const productColors = (product.colors || []).join(' ').toLowerCase();
  const styleCode = style.code.toUpperCase();
  const styleName = style.name.toLowerCase();
  const isFunctionCapable = Boolean(product.functionCapable);

  // 1. 显式自适应风格标记匹配 (Adaptive Styles Explicit Match)
  if (product.adaptiveStyles && product.adaptiveStyles.length > 0) {
    for (const adStyle of product.adaptiveStyles) {
      const adLower = adStyle.toLowerCase();
      if (
        styleName.includes(adLower) ||
        style.lifestyleTags.some(t => t.toLowerCase().includes(adLower)) ||
        (style.cityCharacter && style.cityCharacter.toLowerCase().includes(adLower))
      ) {
        score += 15;
        matchedTraits.push(`显式风格标记: ${adStyle}`);
        break;
      }
    }
  }

  // 2. 材质匹配 (Material Match)
  const isLeather = /皮|leather|牛皮|摔纹|马鞍|鞍褐|全粒面/.test(productMaterials + ' ' + productName);
  const isFabric = /布|fabric|亚麻|linen|织物|棉麻/.test(productMaterials + ' ' + productName);

  if (isLeather) {
    if (['UK-01', 'NC-01', 'US-01', 'US-02', 'IT-01', 'IT-02', 'LX-01', 'LX-02', 'ST-01'].includes(styleCode)) {
      score += 12;
      matchedTraits.push('高级真皮饰面契合');
    }
  }
  if (isFabric) {
    if (['EU-01', 'MD-01', 'CA-01', 'ST-03', 'OR-04'].includes(styleCode)) {
      score += 12;
      matchedTraits.push('布艺/亚麻质感契合');
    }
  }

  // 3. 色系亲和度 (Color Affinity)
  const isDarkBrownOrBurgundy = /棕|brown|深棕|黑|深木|酒红|burgundy|焦糖|cognac/.test(productColors + ' ' + productName);
  const isLightOrOatmeal = /米|白|cream|ivory|浅灰|燕麦|oat|沙色|beige/.test(productColors + ' ' + productName);

  if (isDarkBrownOrBurgundy) {
    if (['UK-01', 'NC-01', 'US-01', 'US-02', 'IT-02', 'ST-01'].includes(styleCode)) {
      score += 14;
      matchedTraits.push('深棕/沉稳经典色系吻合');
    }
  }
  if (isLightOrOatmeal) {
    if (['EU-01', 'IT-01', 'CA-01', 'MD-01', 'LX-02', 'FR-01', 'ST-02'].includes(styleCode)) {
      score += 14;
      matchedTraits.push('米白/明亮温润色系吻合');
    }
  }

  // 4. 体量与功能适配 (Volume & Power Function)
  const isLargeOrGrand = (product.dimensions && product.dimensions.width >= 2800) || /大体量|3人|三人|位|庄园|都会|3\+2|master/.test(productName);
  if (isLargeOrGrand) {
    if (styleCode === 'UK-01') {
      score += 10;
      matchedTraits.push('大体量气场宅邸');
    } else if (styleCode === 'NC-01') {
      score += 10;
      matchedTraits.push('大体量古典对称');
    } else if (styleCode === 'US-02') {
      score += 11;
      matchedTraits.push('庄园大体量');
    } else if (styleCode === 'US-01') {
      score += 8;
      matchedTraits.push('都会大平层尺度');
    }
  }

  if (isFunctionCapable) {
    if (['US-01', 'LX-01', 'IT-01', 'LX-02', 'CA-01'].includes(styleCode)) {
      score += 7;
      matchedTraits.push('智能/功能款适配');
    } else if (styleCode === 'UK-01') {
      score += 3;
    }
  }

  // 5. 关键词与特征联想 (Keyword & Product Traits Affinity)
  const structuralStr = (product.structuralFeatures || []).map(f => f.name + ' ' + f.description).join(' ').toLowerCase();
  const allText = `${productName} ${structuralStr}`;

  if (/greenwich|格林威治|英伦|oxford|london/i.test(allText)) {
    if (styleCode === 'UK-01') {
      score += 10;
      matchedTraits.push('英伦命名联想高度吻合');
    } else if (styleCode === 'NC-01') {
      score += 6;
      matchedTraits.push('欧美古典轴线契合');
    } else if (styleCode === 'US-01') {
      score += 4;
      matchedTraits.push('美式都会体面感');
    }
  }

  if (/厚扶手|卷边|chesterfield|拉扣|大体量厚皮/i.test(allText)) {
    if (styleCode === 'UK-01') {
      score += 4;
      matchedTraits.push('经典厚扶手/艺术收藏宅');
    } else if (styleCode === 'NC-01') {
      score += 4;
      matchedTraits.push('新古典对称厚重');
    }
  }

  // 归一化限制在 40 ~ 98 之间
  const finalScore = Math.min(98, Math.max(40, score));
  return {
    score: finalScore,
    matchedTraits: Array.from(new Set(matchedTraits))
  };
}

/**
 * 为指定产品推荐 Top N 最匹配的风格方案
 */
export function recommendStylesForProduct(
  product: ProductAsset,
  styles: StylePreset[] = STYLE_PRESETS,
  limit: number = 3
): StyleRecommendationScore[] {
  const ranked = styles.map((style) => {
    const { score, matchedTraits } = calculateProductStyleMatch(product, style);
    return {
      style,
      score,
      percentageLabel: `${score}%`,
      matchedTraits
    };
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}
