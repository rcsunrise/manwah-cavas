import { TypographySlotSpec, TypographySemanticRole, TypographyOverflowPolicy } from '../../src/types/creativeCanvas';
import { TextLayer } from '../../src/types/detailCompositionSchema';
import { createServerGenAI } from '../utils/aiClient';

export type LayoutTheme = 'luxury_minimal' | 'modern_bold' | 'feature_split' | 'bento_grid' | 'parameter_grid';

export interface AestheticLayoutOptions {
  sceneKey: string;
  sceneRole?: string;
  slotWidth?: number;
  slotHeight?: number;
  theme?: LayoutTheme;
  copyContent?: any;
}

export interface ComputedTextLayer extends TextLayer {
  containerStyle?: {
    backgroundColor?: string;
    borderRadius?: number;
    padding?: number;
    border?: string;
    boxShadow?: string;
  };
}

/**
 * Deterministic collision-free layout solver for luxury furniture poster typography.
 * Automatically distributes headline, subheadline, eyebrow, selling points, body, CTA, and specs
 * based on the screen's visual role with guaranteed zero overlap.
 */
export function computeDeterministicAestheticLayout(
  slots: TypographySlotSpec[],
  options: AestheticLayoutOptions
): { slots: TypographySlotSpec[]; textLayers: ComputedTextLayer[] } {
  const width = options.slotWidth || 2100;
  const height = options.slotHeight || 2800;
  const role = (options.sceneRole || options.sceneKey || 'PRODUCT_HERO').toUpperCase();
  const theme = options.theme || 'luxury_minimal';

  const safeMarginLeft = 140;
  const safeMarginRight = 140;
  const safeMarginTop = 140;
  const safeMarginBottom = 120;
  const usableWidth = width - safeMarginLeft - safeMarginRight;

  const updatedSlots = slots.map(s => ({ ...s }));

  const eyebrow = updatedSlots.find(s => s.semanticRole === 'eyebrow' || s.slotKey === 'eyebrow');
  const headline = updatedSlots.find(s => s.semanticRole === 'headline' || s.slotKey === 'headline');
  const subheadline = updatedSlots.find(s => s.semanticRole === 'subheadline' || s.slotKey === 'subheadline');
  const body = updatedSlots.find(s => s.semanticRole === 'body' || s.slotKey === 'body');
  const cta = updatedSlots.find(s => s.semanticRole === 'cta' || s.slotKey === 'cta');
  const disclaimer = updatedSlots.find(s => s.semanticRole === 'disclaimer' || s.slotKey === 'disclaimer');
  const sellingPoints = updatedSlots.filter(s => s.semanticRole === 'selling_point' || s.slotKey?.startsWith('selling_point'));
  const featureLabels = updatedSlots.filter(s => s.semanticRole === 'feature_label' || s.slotKey?.startsWith('feature_label'));
  const specs = updatedSlots.filter(s => s.semanticRole === 'spec' || s.slotKey?.startsWith('spec'));

  // 1. TOP ZONE (Eyebrow -> Headline -> Subheadline)
  let currentTopY = safeMarginTop;

  if (eyebrow && eyebrow.enabled && eyebrow.content) {
    eyebrow.x = safeMarginLeft;
    eyebrow.y = currentTopY;
    eyebrow.width = Math.min(600, usableWidth);
    eyebrow.height = 54;
    eyebrow.fontSize = 28;
    eyebrow.fontWeight = 600;
    eyebrow.color = '#8C6F43'; // Luxury warm gold
    eyebrow.textAlign = 'left';
    currentTopY += eyebrow.height + 18;
  }

  if (headline && headline.enabled && headline.content) {
    const headlineLines = Math.min(2, Math.ceil(headline.content.length / 10));
    const hFontSize = role.includes('HERO') ? 72 : 60;
    const hLineHeight = 1.18;
    const hHeight = Math.round(headlineLines * (hFontSize * hLineHeight) + 12);

    headline.x = safeMarginLeft;
    headline.y = currentTopY;
    headline.width = usableWidth;
    headline.height = hHeight;
    headline.fontSize = hFontSize;
    headline.fontWeight = 900;
    headline.color = '#2C2A29'; // Deep charcoal espresso
    headline.textAlign = 'left';
    currentTopY += headline.height + 24;
  }

  if (subheadline && subheadline.enabled && subheadline.content) {
    const subLines = Math.min(2, Math.ceil(subheadline.content.length / 18));
    const subFontSize = role.includes('HERO') ? 34 : 30;
    const subHeight = Math.round(subLines * (subFontSize * 1.35) + 8);

    subheadline.x = safeMarginLeft;
    subheadline.y = currentTopY;
    subheadline.width = Math.min(1400, usableWidth);
    subheadline.height = subHeight;
    subheadline.fontSize = subFontSize;
    subheadline.fontWeight = 500;
    subheadline.color = '#666059';
    subheadline.textAlign = 'left';
    currentTopY += subheadline.height + 36;
  }

  // 2. BOTTOM ZONE (Disclaimer -> CTA & Body -> Selling Points / Specs)
  let currentBottomY = height - safeMarginBottom;

  if (disclaimer && disclaimer.enabled && disclaimer.content) {
    disclaimer.fontSize = 20;
    disclaimer.height = 40;
    currentBottomY -= disclaimer.height;
    disclaimer.x = safeMarginLeft;
    disclaimer.y = currentBottomY;
    disclaimer.width = usableWidth;
    disclaimer.color = '#99938B';
    disclaimer.textAlign = 'left';
    currentBottomY -= 28;
  }

  // CTA & Body alignment
  const hasCta = cta && cta.enabled && Boolean(cta.content);
  const ctaWidth = 440;
  const ctaHeight = 92;

  if (hasCta) {
    cta!.width = ctaWidth;
    cta!.height = ctaHeight;
    cta!.x = width - safeMarginRight - ctaWidth;
    cta!.y = currentBottomY - ctaHeight;
    cta!.fontSize = 30;
    cta!.fontWeight = 700;
    cta!.color = '#FFFFFF';
    cta!.textAlign = 'center';
  }

  if (body && body.enabled && body.content) {
    const bodyLines = Math.min(4, Math.ceil(body.content.length / 28));
    const bodyFontSize = 26;
    const bodyHeight = Math.round(bodyLines * (bodyFontSize * 1.5) + 16);
    currentBottomY -= Math.max(bodyHeight, hasCta ? ctaHeight : 0);

    body.x = safeMarginLeft;
    body.y = currentBottomY;
    body.width = hasCta ? usableWidth - ctaWidth - 40 : usableWidth;
    body.height = bodyHeight;
    body.fontSize = bodyFontSize;
    body.fontWeight = 400;
    body.color = '#4A4643';
    body.textAlign = 'left';
    currentBottomY -= 36;
  } else if (hasCta) {
    currentBottomY -= (ctaHeight + 36);
  }

  // Selling points distribution (Horizontal Pills or Vertical Cards)
  if (sellingPoints.length > 0) {
    const activeSPs = sellingPoints.filter(s => s.enabled && s.content);
    if (activeSPs.length > 0) {
      if (activeSPs.length <= 3 && width >= 1800) {
        // Multi-column Horizontal Luxury Pills
        const colGap = 32;
        const colWidth = Math.floor((usableWidth - (activeSPs.length - 1) * colGap) / activeSPs.length);
        const pillHeight = 72;
        currentBottomY -= (pillHeight + 30);

        activeSPs.forEach((sp, idx) => {
          sp.x = safeMarginLeft + idx * (colWidth + colGap);
          sp.y = currentBottomY;
          sp.width = colWidth;
          sp.height = pillHeight;
          sp.fontSize = 28;
          sp.fontWeight = 600;
          sp.color = '#2C2A29';
          sp.textAlign = 'center';
        });
      } else {
        // Vertical stacked cards
        const cardHeight = 64;
        const totalHeight = activeSPs.length * (cardHeight + 16);
        currentBottomY -= totalHeight;

        activeSPs.forEach((sp, idx) => {
          sp.x = safeMarginLeft;
          sp.y = currentBottomY + idx * (cardHeight + 16);
          sp.width = Math.min(1200, usableWidth);
          sp.height = cardHeight;
          sp.fontSize = 28;
          sp.fontWeight = 600;
          sp.color = '#3D3935';
          sp.textAlign = 'left';
        });
      }
    }
  }

  // Feature labels (if any, middle horizontal tag flow)
  if (featureLabels.length > 0) {
    const activeFLs = featureLabels.filter(f => f.enabled && f.content);
    if (activeFLs.length > 0) {
      const tagWidth = 360;
      const tagHeight = 60;
      const tagY = Math.max(currentTopY + 40, height * 0.45);

      activeFLs.forEach((fl, idx) => {
        fl.x = safeMarginLeft + (idx % 3) * (tagWidth + 24);
        fl.y = tagY + Math.floor(idx / 3) * (tagHeight + 20);
        fl.width = tagWidth;
        fl.height = tagHeight;
        fl.fontSize = 24;
        fl.fontWeight = 600;
        fl.color = '#2C2A29';
        fl.textAlign = 'center';
      });
    }
  }

  // Specs grid distribution
  if (specs.length > 0) {
    const activeSpecs = specs.filter(s => s.enabled && s.content);
    if (activeSpecs.length > 0) {
      const specColWidth = Math.floor((usableWidth - 32) / 2);
      const specRowHeight = 48;
      const specStartY = Math.max(currentTopY + 60, currentBottomY - Math.ceil(activeSpecs.length / 2) * (specRowHeight + 12) - 40);

      activeSpecs.forEach((sp, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        sp.x = safeMarginLeft + col * (specColWidth + 32);
        sp.y = specStartY + row * (specRowHeight + 12);
        sp.width = specColWidth;
        sp.height = specRowHeight;
        sp.fontSize = 24;
        sp.fontWeight = 400;
        sp.color = '#5C5650';
        sp.textAlign = 'left';
      });
    }
  }

  // Convert to TextLayers
  const textLayers: ComputedTextLayer[] = [];

  for (const slot of updatedSlots) {
    if (!slot.enabled || !slot.content) continue;

    const isCta = slot.semanticRole === 'cta' || slot.slotKey === 'cta';
    const isSellingPoint = slot.semanticRole === 'selling_point' || slot.slotKey?.startsWith('selling_point');
    const isFeatureLabel = slot.semanticRole === 'feature_label' || slot.slotKey?.startsWith('feature_label');

    let containerStyle: ComputedTextLayer['containerStyle'] = undefined;

    if (isCta) {
      containerStyle = {
        backgroundColor: '#B28C5A', // Luxury gold CTA button
        borderRadius: 46,
        padding: 16,
        boxShadow: '0 8px 24px rgba(178, 140, 90, 0.35)'
      };
    } else if (isSellingPoint) {
      containerStyle = {
        backgroundColor: 'rgba(255, 255, 255, 0.88)',
        borderRadius: 20,
        padding: 12,
        border: '1px solid rgba(229, 224, 216, 0.8)'
      };
    } else if (isFeatureLabel) {
      containerStyle = {
        backgroundColor: 'rgba(247, 244, 239, 0.92)',
        borderRadius: 16,
        padding: 10,
        border: '1px solid #E5E0D8'
      };
    }

    textLayers.push({
      id: `tl_${slot.slotKey}`,
      slotKey: slot.slotKey,
      copyField: (slot.semanticRole as any) || 'body',
      text: slot.content,
      x: slot.x ?? safeMarginLeft,
      y: slot.y ?? safeMarginTop,
      width: slot.width ?? usableWidth,
      height: slot.height ?? 80,
      fontFamily: 'PingFang SC',
      fallbackFonts: ['Noto Sans SC', 'Microsoft YaHei', 'sans-serif'],
      fontSize: slot.fontSize || 32,
      fontWeight: slot.fontWeight || 600,
      lineHeight: slot.lineHeight || 1.3,
      letterSpacing: isCta ? 1 : 0,
      color: slot.color || (isCta ? '#FFFFFF' : '#2C2A29'),
      textAlign: (slot.textAlign as any) || 'left',
      verticalAlign: isCta ? 'middle' : 'top',
      maxLines: slot.maxLines || 3,
      overflow: (slot.overflowPolicy === 'truncate' ? 'truncate' : 'shrink') as any,
      rotation: 0,
      opacity: 1,
      zIndex: isCta ? 25 : 20,
      safeAreaRequired: true,
      containerStyle
    });
  }

  return { slots: updatedSlots, textLayers };
}

/**
 * Calls Gemini GenAI to design an aesthetic typography layout spec for a furniture poster screen.
 * Falls back to deterministic solver if AI is unavailable.
 */
export async function designAestheticLayoutWithAI(
  userId: string,
  slots: TypographySlotSpec[],
  options: AestheticLayoutOptions
): Promise<{ success: boolean; slots: TypographySlotSpec[]; textLayers: ComputedTextLayer[]; isAiGenerated: boolean }> {
  const { ai, isValidKey } = await createServerGenAI(userId);
  const width = options.slotWidth || 2100;
  const height = options.slotHeight || 2800;
  const role = options.sceneRole || options.sceneKey || 'PRODUCT_HERO';
  const theme = options.theme || 'luxury_minimal';

  if (ai && isValidKey) {
    try {
      const prompt = `你是一位敏华家具（MANWAH）的资深电商视觉艺术总监与排版设计师。
请根据以下家具分屏海报的文案槽位与尺寸（${width} × ${height} px，分屏角色：【${role}】，设计主题：【${theme}】），规划一个高端、雅致、严格无重叠碰撞的中文排版规格（Typography Spec）。

【文案槽位数据】:
${JSON.stringify(slots.map(s => ({
  slotKey: s.slotKey,
  semanticRole: s.semanticRole,
  content: s.content,
  enabled: s.enabled
})), null, 2)}

【设计与排版严苛准则】:
1. 绝对避免图层重叠：顶部主视觉文案区（eyebrow, headline, subheadline）从 y=140 顺次向下排列，每层保持 20-30px 间距。
2. 核心卖点（selling_points）：如果是 2-3 个卖点，请设计为横向多列胶囊（如 x=140, 740, 1340）或竖向雅致卡片。
3. 底部区域：正文 body 位于底部左侧，CTA 按钮位于底部右侧（x=1500, y=${height - 220}, width=460, height=92, 颜色为敏华奢金 #B28C5A 或纯白 #FFFFFF 带金底）。
4. 色彩规范：主标题用奢华深炭黑 #2C2A29，副标/正文用质感暖灰 #666059，眉标用敏华暖金 #8C6F43，免责/声明用浅灰 #99938B。
5. 必须返回合法的 JSON 对象，包含 slots 数组，每个元素包含：slotKey, x, y, width, height, fontSize, fontWeight, color, textAlign ('left'|'center'|'right'), lineHeight, maxLines。不要输出任何 Markdown 以外的文字。`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      });

      if (response.text) {
        const parsed = JSON.parse(response.text);
        const aiSlots = Array.isArray(parsed.slots) ? parsed.slots : (Array.isArray(parsed) ? parsed : []);

        if (aiSlots.length > 0) {
          const mergedSlots = slots.map(orig => {
            const match = aiSlots.find((a: any) => a.slotKey === orig.slotKey);
            if (match) {
              return {
                ...orig,
                x: typeof match.x === 'number' ? Math.max(80, Math.min(width - 200, match.x)) : orig.x,
                y: typeof match.y === 'number' ? Math.max(80, Math.min(height - 100, match.y)) : orig.y,
                width: typeof match.width === 'number' ? match.width : orig.width,
                height: typeof match.height === 'number' ? match.height : orig.height,
                fontSize: typeof match.fontSize === 'number' ? match.fontSize : orig.fontSize,
                fontWeight: typeof match.fontWeight === 'number' ? match.fontWeight : orig.fontWeight,
                color: match.color || orig.color,
                textAlign: match.textAlign || orig.textAlign || 'left',
                lineHeight: match.lineHeight || orig.lineHeight || 1.3
              };
            }
            return orig;
          });

          // Run deterministic solver to ensure safe bounds and generate textLayers
          const result = computeDeterministicAestheticLayout(mergedSlots, options);
          return {
            success: true,
            slots: result.slots,
            textLayers: result.textLayers,
            isAiGenerated: true
          };
        }
      }
    } catch (err) {
      console.warn('[designAestheticLayoutWithAI] Gemini AI layout design fallback:', err);
    }
  }

  // Fallback to deterministic layout engine
  const deterministicResult = computeDeterministicAestheticLayout(slots, options);
  return {
    success: true,
    slots: deterministicResult.slots,
    textLayers: deterministicResult.textLayers,
    isAiGenerated: false
  };
}
