// src/features/space-studio/engine/materialDnaTranslator.ts
// MANWAH Space Studio｜中英文色彩与复合材质 DNA 工业智能映射器 V2.0
// 职责：
// 1. 色系粒度与 Hex 工业色卡精准双轨绑定，在提示词中注入绝对物理色值锚点；
// 2. 复合工业材质深度约束（如黑金大理石纹茶几的高光石材倒角、金丝石纹脉络与金属底座复合工艺）；
// 3. 全面压制劣质贴皮、重复印花等负向瑕疵，保障商业级大平层大片质感。

export interface IndustrialColorStandard {
  code: string;
  nameZh: string;
  nameEn: string;
  hex: string;
  rgb: [number, number, number];
  descriptionEn: string;
  promptAnchor: string;
}

/**
 * 敏华家居权威工业标准色卡库 (精确 Hex + 物理光泽色彩锚点)
 */
export const MANWAH_INDUSTRIAL_COLOR_STANDARDS: Record<string, IndustrialColorStandard> = {
  polar_milk_white: {
    code: 'CLR-01',
    nameZh: '极地奶白',
    nameEn: 'Polar Milk White',
    hex: '#F5F3EF',
    rgb: [245, 243, 239],
    descriptionEn: 'pristine polar milk-white, soft off-white cream with warm natural undertones',
    promptAnchor: 'pristine polar milk-white (exact color anchor #F5F3EF, clean warm white with neutral undertones, strictly zero yellowing or dull grey)'
  },
  warm_greige: {
    code: 'CLR-02',
    nameZh: '云雾暖灰',
    nameEn: 'Warm Greige',
    hex: '#C8C2BA',
    rgb: [200, 194, 186],
    descriptionEn: 'ivory greige, soft warm pale grey with tactile neutral depth',
    promptAnchor: 'ivory greige, soft warm pale grey (exact color anchor #C8C2BA, neutral low-saturation luxury tone, balanced surface reflection)'
  },
  cognac_amber: {
    code: 'CLR-03',
    nameZh: '干邑暖橙',
    nameEn: 'Cognac Amber',
    hex: '#C26732',
    rgb: [194, 103, 50],
    descriptionEn: 'Cognac Amber, rich glowing caramel orange',
    promptAnchor: 'Cognac Amber, warm cognac amber, rich caramel (exact color anchor #C26732, deep radiant amber patina with subtle warm undertones)'
  },
  caramel_brown: {
    code: 'CLR-04',
    nameZh: '鞍褐焦糖',
    nameEn: 'Caramel Brown',
    hex: '#8D532E',
    rgb: [141, 83, 46],
    descriptionEn: 'rich warm saddle caramel brown, deep roasted tone',
    promptAnchor: 'rich warm saddle caramel brown (exact color anchor #8D532E, deep natural roasted chestnut undertones)'
  },
  deep_espresso: {
    code: 'CLR-05',
    nameZh: '深咖/浓缩咖啡',
    nameEn: 'Deep Espresso',
    hex: '#3D261C',
    rgb: [61, 38, 28],
    descriptionEn: 'rich dark espresso coffee brown, deep roast luxury dark tone',
    promptAnchor: 'rich dark espresso coffee brown (exact color anchor #3D261C, deep roast tone with warm micro-highlights, strictly distinct from black)'
  },
  obsidian_dark_grey: {
    code: 'CLR-06',
    nameZh: '曜石深灰',
    nameEn: 'Obsidian Deep Grey',
    hex: '#2A2B2D',
    rgb: [42, 43, 45],
    descriptionEn: 'obsidian deep charcoal graphite grey, architecturally tuned neutral tone',
    promptAnchor: 'obsidian deep charcoal grey (exact color anchor #2A2B2D, deep matte graphite, strictly neutral non-tinted, authentic rich mineral sheen)'
  },
  basalt_black: {
    code: 'CLR-07',
    nameZh: '玄武深黑',
    nameEn: 'Basalt Black',
    hex: '#18181A',
    rgb: [24, 24, 26],
    descriptionEn: 'obsidian deep black, velvet architectural dark finish',
    promptAnchor: 'obsidian deep black (exact color anchor #18181A, velvety deep carbon black, preserving tactile micro-shadows)'
  },
  emerald_forest: {
    code: 'CLR-08',
    nameZh: '复古祖母绿',
    nameEn: 'Vintage Emerald Green',
    hex: '#1D3B2E',
    rgb: [29, 59, 46],
    descriptionEn: 'deep vintage forest emerald green with aristocratic depth',
    promptAnchor: 'deep vintage forest emerald green (exact color anchor #1D3B2E, deep botanical jewel tone with soft refined luster)'
  },
  champagne_beige: {
    code: 'CLR-09',
    nameZh: '珍珠米金/香槟米',
    nameEn: 'Pearl Champagne Beige',
    hex: '#D6C6B0',
    rgb: [214, 198, 176],
    descriptionEn: 'creamy warm champagne beige, refined oatmeal sand tone',
    promptAnchor: 'creamy warm champagne beige (exact color anchor #D6C6B0, luminous silky oatmeal sand tone with delicate ambient reflection)'
  },
  midnight_navy: {
    code: 'CLR-10',
    nameZh: '藏青墨蓝',
    nameEn: 'Midnight Navy Blue',
    hex: '#1B2A38',
    rgb: [27, 42, 56],
    descriptionEn: 'sophisticated navy midnight blue, architectural executive tone',
    promptAnchor: 'sophisticated navy midnight blue (exact color anchor #1B2A38, deep nautical dark tone with refined matte finish)'
  },
  misty_glacier_blue: {
    code: 'CLR-11',
    nameZh: '雾霾灰蓝/冰川蓝',
    nameEn: 'Misty Glacier Blue',
    hex: '#5C6B73',
    rgb: [92, 107, 115],
    descriptionEn: 'muted misty slate glacier blue, serene architectural tone',
    promptAnchor: 'muted misty slate glacier blue (exact color anchor #5C6B73, refined low-saturation mineral blue, tranquil ambient balance)'
  },
  hazelnut_oat: {
    code: 'CLR-12',
    nameZh: '浅燕麦/奶咖米',
    nameEn: 'Hazelnut Oat Beige',
    hex: '#D2BBA0',
    rgb: [210, 187, 160],
    descriptionEn: 'soft hazelnut oat beige, warm gentle latte cream',
    promptAnchor: 'soft hazelnut oat beige (exact color anchor #D2BBA0, gentle warm latte cream undertone, natural textile balance)'
  },
  hermes_orange: {
    code: 'CLR-13',
    nameZh: '爱马仕橙/活力橙',
    nameEn: 'Classic Hermes Orange',
    hex: '#E65A1E',
    rgb: [230, 90, 30],
    descriptionEn: 'classic vibrant luxury hermes orange, energetic accent hue',
    promptAnchor: 'classic vibrant luxury orange (exact color anchor #E65A1E, rich vivid warm luxury accent tone)'
  },
  charcoal_slate: {
    code: 'CLR-14',
    nameZh: '板岩碳灰',
    nameEn: 'Charcoal Slate Grey',
    hex: '#34383B',
    rgb: [52, 56, 59],
    descriptionEn: 'refined architectural charcoal slate grey, muted stone tone',
    promptAnchor: 'refined architectural charcoal slate grey (exact color anchor #34383B, deep neutral architectural mineral tone)'
  },
  titanium_black: {
    code: 'CLR-15',
    nameZh: '黑钛金属',
    nameEn: 'Titanium Black',
    hex: '#1E1F21',
    rgb: [30, 31, 33],
    descriptionEn: 'dark brushed titanium alloy black, architectural satin luster',
    promptAnchor: 'dark brushed titanium alloy black (exact color anchor #1E1F21, satin anodized metallic reflection, deep hairline sheen)'
  },
  champagne_gold: {
    code: 'CLR-16',
    nameZh: '香槟金/拉丝金',
    nameEn: 'Brushed Champagne Gold',
    hex: '#C5A059',
    rgb: [197, 160, 89],
    descriptionEn: 'refined brushed champagne gold, soft warm metallic luster',
    promptAnchor: 'refined brushed champagne gold (exact color anchor #C5A059, elegant satin champagne metallic glow, strictly zero brassy yellow)'
  }
};

/**
 * 将任意中文、混合或 Hex 色彩标签解析为标准工业色卡物理读数与提示词
 */
export function resolveIndustrialColorDna(rawColor?: string): IndustrialColorStandard & { rawInput: string } {
  const fallback = {
    ...MANWAH_INDUSTRIAL_COLOR_STANDARDS.warm_greige,
    rawInput: rawColor || '云雾暖灰'
  };

  if (!rawColor || typeof rawColor !== 'string') return fallback;
  const trimmed = rawColor.trim();
  if (!trimmed) return fallback;

  // 1. 如果用户输入直接包含 6 位 Hex 码 (如 "#2A2B2D" 或 "#c8c2ba")
  const hexMatch = trimmed.match(/#([0-9a-fA-F]{6})/);
  if (hexMatch) {
    const customHex = `#${hexMatch[1].toUpperCase()}`;
    // 检查是否命中预设色卡
    const matchedPreset = Object.values(MANWAH_INDUSTRIAL_COLOR_STANDARDS).find(
      (c) => c.hex.toUpperCase() === customHex
    );
    if (matchedPreset) {
      return { ...matchedPreset, rawInput: trimmed };
    }
    // 未命中则生成自定义工业色值锚点
    return {
      code: 'CLR-CUSTOM',
      nameZh: trimmed,
      nameEn: `Custom Color (${customHex})`,
      hex: customHex,
      rgb: [
        parseInt(customHex.slice(1, 3), 16),
        parseInt(customHex.slice(3, 5), 16),
        parseInt(customHex.slice(5, 7), 16)
      ],
      descriptionEn: `custom curated architectural color with exact hex balance ${customHex}`,
      promptAnchor: `custom architectural color tone (exact color anchor ${customHex}, strict color balance)`,
      rawInput: trimmed
    };
  }

  // 提取括号内英文作为优先英文标签 (如 "干邑暖橙 (Cognac Amber)" -> "Cognac Amber")
  const englishInParentheses = trimmed.match(/\(([^)]+)\)/);
  const explicitEnName = (englishInParentheses && /[a-zA-Z]{3,}/.test(englishInParentheses[1]))
    ? englishInParentheses[1].trim()
    : null;

  const lower = trimmed.toLowerCase();

  const wrapWithExplicitEn = (preset: IndustrialColorStandard) => {
    if (!explicitEnName) return { ...preset, rawInput: trimmed };
    return {
      ...preset,
      nameEn: explicitEnName,
      promptAnchor: `${explicitEnName}, ${preset.promptAnchor}`,
      descriptionEn: `${explicitEnName}, ${preset.descriptionEn}`,
      rawInput: trimmed
    };
  };

  // 2. 匹配标准工业色卡映射表
  if (/奶白|雪山白|珍珠白|极地奶白|白|米白|纯白|milk|white/i.test(lower)) {
    return wrapWithExplicitEn(MANWAH_INDUSTRIAL_COLOR_STANDARDS.polar_milk_white);
  }
  if (/象牙灰|象牙|米灰|云雾暖灰/i.test(lower)) {
    return wrapWithExplicitEn(MANWAH_INDUSTRIAL_COLOR_STANDARDS.warm_greige);
  }
  if (/干邑|暖橙|爱马仕橙|琥珀|橙|cognac|amber|orange/i.test(lower)) {
    return wrapWithExplicitEn(MANWAH_INDUSTRIAL_COLOR_STANDARDS.cognac_amber);
  }
  if (/马鞍棕|鞍皮|鞍褐|焦糖|saddle|caramel/i.test(lower)) {
    return wrapWithExplicitEn(MANWAH_INDUSTRIAL_COLOR_STANDARDS.caramel_brown);
  }
  if (/深咖|咖|黑褐|浓缩咖啡|深栗|espresso|dark.*brown/i.test(lower)) {
    return wrapWithExplicitEn(MANWAH_INDUSTRIAL_COLOR_STANDARDS.deep_espresso);
  }
  if (/曜石|深灰|炭灰|碳灰|铁灰|charcoal|graphite/i.test(lower)) {
    return wrapWithExplicitEn(MANWAH_INDUSTRIAL_COLOR_STANDARDS.obsidian_dark_grey);
  }
  if (/玄武黑|曜石黑|墨黑|黑|black/i.test(lower)) {
    return wrapWithExplicitEn(MANWAH_INDUSTRIAL_COLOR_STANDARDS.basalt_black);
  }
  if (/墨绿|松石绿|复古绿|祖母绿|绿|green|emerald/i.test(lower)) {
    return wrapWithExplicitEn(MANWAH_INDUSTRIAL_COLOR_STANDARDS.emerald_forest);
  }
  if (/米黄|杏色|米色|浅驼|燕麦|香槟|beige|sand|khaki|oatmeal/i.test(lower)) {
    return wrapWithExplicitEn(MANWAH_INDUSTRIAL_COLOR_STANDARDS.champagne_beige);
  }
  if (/藏青|深蓝|海蓝|宝石蓝|蓝|navy|midnight/i.test(lower)) {
    return wrapWithExplicitEn(MANWAH_INDUSTRIAL_COLOR_STANDARDS.midnight_navy);
  }
  if (/灰|greige|grey|gray/i.test(lower)) {
    return wrapWithExplicitEn(MANWAH_INDUSTRIAL_COLOR_STANDARDS.warm_greige);
  }

  // 3. 提取括号内英文作为自定义英文标签
  if (explicitEnName) {
    return {
      code: 'CLR-DERIVED',
      nameZh: trimmed,
      nameEn: explicitEnName,
      hex: '#B0A8A0',
      rgb: [176, 168, 160],
      descriptionEn: `${explicitEnName}, authentic architectural color tone`,
      promptAnchor: `${explicitEnName} (strict color consistency, balanced luxury undertone)`,
      rawInput: trimmed
    };
  }

  return fallback;
}

/**
 * 将中文或混合色彩名称智能映射为纯视觉英文（支持注入 Hex 工业色值锚点）
 */
export function translateColorToEnglish(
  rawColor?: string,
  defaultColor = 'ivory greige, soft warm pale grey (exact color anchor #C8C2BA)',
  includeHexAnchor = true
): string {
  if (!rawColor || typeof rawColor !== 'string') return defaultColor;
  const trimmed = rawColor.trim();
  if (!trimmed) return defaultColor;

  const resolved = resolveIndustrialColorDna(trimmed);
  return includeHexAnchor ? resolved.promptAnchor : resolved.descriptionEn;
}

export interface CompositeMaterialResult {
  materialEn: string;
  craftsmanshipDirective: string;
  antiStickerNegative: string;
}

/**
 * 复合工业材质深度约束解析器：
 * 针对黑金大理石纹茶几、岩板、奢石、金属底座等复合材质，追加高光倒角、真石脉络与微观工艺约束，
 * 彻底避免大模型生成粗糙的劣质贴皮效果。
 */
export function resolveCompositeMaterialDna(rawMat?: string, contextRole?: string): CompositeMaterialResult {
  const isTable = contextRole === 'coffee_table' || contextRole === 'side_table' || contextRole === 'dining_table' || (typeof rawMat === 'string' && /茶几|边几|台面|餐桌|地台/.test(rawMat));

  const defaultResult: CompositeMaterialResult = isTable
    ? {
        materialEn: 'luxury Italian Laurent Black Gold marble (Nero Portoro), deep crystalline obsidian stone slab',
        craftsmanshipDirective: 'authentic geological lightning-vein gold and champagne-bronze natural striations organically traversing deep crystalline obsidian stone matrix with non-repeating branching (strictly NOT a flat printed graphic, repeating digital texture, or laminate foil sticker); polished crystalline high-gloss surface with realistic specular reflections and subtle translucent mineral depth; seamless 45-degree polished chamfered bevel edge profiling with micro-radius safety rounded corners; securely mounted upon an architectural hairline brushed dark titanium alloy metal subframe chassis with satin anodized finish and precision laser-welded joint lines',
        antiStickerNegative: 'fake marble sticker, printed marble foil, cheap laminate table, repeating stone pattern, vinyl sticker wrap, blurred inkjet veins, flat plastic surface, peeling sticker edges, dull melamine slab, low resolution stone print, faux stone paper'
      }
    : {
        materialEn: 'genuine top-grain semi-aniline cowhide leather',
        craftsmanshipDirective: 'authentic natural grain, micro-porous breathable finish, precision French double-stitching along outer seams',
        antiStickerNegative: 'cheap synthetic vinyl, faux leather texture, peeling coating, plastic sheen'
      };

  if (!rawMat || typeof rawMat !== 'string') return defaultResult;
  const lower = rawMat.toLowerCase();

  // 1. 黑金大理石 / 劳伦黑金 / 黑金大理石纹茶几 / 劳伦金石材 (用户核心工业茶几)
  if (/黑金|劳伦|portoro|laurent.*gold|black.*gold/i.test(lower) || (isTable && /黑.*大理石|金.*大理石|黑金|黑色大理石/i.test(lower))) {
    return {
      materialEn: 'luxury Italian Laurent Black Gold marble (Nero Portoro), deep crystalline obsidian stone slab',
      craftsmanshipDirective: 'authentic geological lightning-vein gold and champagne-bronze natural striations organically traversing deep crystalline obsidian stone matrix with non-repeating branching (strictly NOT a flat printed graphic, repeating digital texture, or laminate foil sticker); polished crystalline high-gloss surface with realistic specular reflections and subtle translucent mineral depth; seamless 45-degree polished chamfered bevel edge profiling with micro-radius safety rounded corners; securely mounted upon an architectural hairline brushed dark titanium alloy metal subframe chassis with satin anodized finish and precision laser-welded joint lines',
      antiStickerNegative: 'fake marble sticker, printed marble foil, cheap laminate table, repeating stone pattern, vinyl sticker wrap, blurred inkjet veins, flat plastic surface, peeling sticker edges, dull melamine slab, low resolution stone print, faux stone paper'
    };
  }

  // 2. 潘多拉奢石 / 潘多拉天然奢石 (Pandora Crystallite Luxury Stone)
  if (/潘多拉|pandora/i.test(lower)) {
    return {
      materialEn: 'polished Brazilian Pandora crystallite luxury marble slab',
      craftsmanshipDirective: 'authentic translucent crystalline quartz layers with dramatic non-repeating golden, charcoal, and ice-white geological mineral strata; seamless 45-degree polished chamfered edge profiling and smooth beveled safety corners; anchored on an architectural brushed dark titanium alloy metal subframe with hairline anodized finish and precision weldless joinery',
      antiStickerNegative: 'fake stone texture, printed marble sticker, cheap laminate, repeating stone pattern, plastic marble foil, dull flat slab, blurred stone veins, cheap vinyl wrap'
    };
  }

  // 3. 通用天然大理石 / 奢石 / 石材台面
  if (/奢石|天然大理石|大理石|天然石|石材|marble|quartzite/i.test(lower)) {
    return {
      materialEn: 'polished authentic luxury crystalline natural stone marble slab',
      craftsmanshipDirective: 'genuine organic geological veining with translucent crystalline depth and non-repeating mineral distribution, seamless 45-degree polished chamfered edge profiling, continuous micro-radius beveled edge finish, subtle ambient specular light reflections on polished stone, paired with precision dark brushed metal architectural chassis',
      antiStickerNegative: 'printed faux marble, repeating sticker texture, cheap laminate foil, peeling edge, flat plastic stone print, blurry inkjet marble'
    };
  }

  // 4. 哑光岩板 / 烧结岩板 (Sintered Porcelain Slab)
  if (/岩板|烧结石|porcelain.*stone|sintered/i.test(lower)) {
    return {
      materialEn: 'high-density sintered architectural porcelain stone slab',
      craftsmanshipDirective: 'refined micro-tactile matte honed finish, zero-porosity natural mineral surface, crisp CNC-machined chamfered edges with micro-radius safety beveling, supported by architectural structural metal frame with brushed dark finish',
      antiStickerNegative: 'glossy plastic imitation, peeling sticker, cheap melamine, fake woodgrain, blurry print pattern'
    };
  }

  // 5. 实木 / 黑胡桃木 / 橡木
  if (/黑胡桃|胡桃木|实木|木质|橡木|wood|walnut|oak/i.test(lower)) {
    return {
      materialEn: 'solid natural American black walnut hardwood',
      craftsmanshipDirective: 'authentic continuous open-pore wood grain, rich warm natural timber undertones, hand-rubbed organic natural oil finish, precision dovetail joinery with smooth rounded edge transitions',
      antiStickerNegative: 'fake wood sticker, melamine print, artificial woodgrain pattern, plastic wood foil, laminate edge banding'
    };
  }

  // 6. 金属 / 不锈钢 / 拉丝金属底座
  if (/金属|不锈钢|拉丝金|黄铜|黑钛|钛金|brass|gold|metal|titanium/i.test(lower)) {
    return {
      materialEn: 'champagne gold and dark titanium hairline brushed architectural alloy',
      craftsmanshipDirective: 'continuous longitudinal hairline brushed texture, satin anodized finish, seamless laser-welded corners with zero visible welding beads, subtle metallic specular rim lighting',
      antiStickerNegative: 'cheap spray paint, yellow plastic gold, flaking metallic paint, uneven brush marks, rusty corners'
    };
  }

  // 7. 科技布与亲肤面料
  if (/科技布|超纤布|亲肤.*布|科技.*布|科技面料|雪尼尔|绒布|布艺|织物|tweed|boucle|fabric/i.test(lower)) {
    return {
      materialEn: 'premium breathable high-tech performance microfiber upholstery fabric',
      craftsmanshipDirective: 'rich tactile woven weave with soft matte micro-texture, authentic fabric drape and gentle crease folds around cushion borders, tailored French double-stitch cord piping',
      antiStickerNegative: 'shiny plastic texture, flat CGI rendering, synthetic vinyl sheen, coarse rough canvas'
    };
  }

  // 8. 头层牛皮 / 半苯胺真皮 / 马鞍皮
  if (/头层牛皮|真皮|半苯胺|全苯胺|牛皮|小牛皮|leather|saddle/i.test(lower)) {
    return {
      materialEn: 'genuine top-grain semi-aniline cowhide leather',
      craftsmanshipDirective: 'authentic natural grain with delicate micro-porous texture, soft supple leather drape with natural ergonomic tension folds, artisanal French double-stitched piping running along outer contours',
      antiStickerNegative: 'fake bonded leather, synthetic pleather, peeling plastic finish, overly uniform artificial grain'
    };
  }

  return defaultResult;
}

/**
 * 将中文或混合材质名称智能映射为纯视觉英文
 */
export function translateMaterialToEnglish(
  rawMat?: string,
  defaultMat = 'genuine top-grain semi-aniline cowhide leather',
  contextRole?: string
): string {
  if (!rawMat || typeof rawMat !== 'string') return defaultMat;
  const trimmed = rawMat.trim();
  if (!trimmed) return defaultMat;

  // 1. 若为黑金大理石/岩板/奢石等复合工艺材质，调用高精度复合约束
  const composite = resolveCompositeMaterialDna(trimmed, contextRole);
  if (composite.materialEn && composite.materialEn !== defaultMat) {
    return `${composite.materialEn}, featuring ${composite.craftsmanshipDirective}`;
  }

  // 2. 如果已包含括号英文
  const englishInParentheses = trimmed.match(/\(([^)]+)\)/);
  if (englishInParentheses && /[a-zA-Z]{3,}/.test(englishInParentheses[1])) {
    return englishInParentheses[1].trim();
  }

  // 3. 如果本身包含英文单词
  const englishWords = trimmed.replace(/[\u4e00-\u9fa5\(\)]/g, '').trim();
  if (englishWords.length >= 4 && /[a-zA-Z]/.test(englishWords)) {
    return englishWords;
  }

  return defaultMat;
}
