// src/features/space-studio/engine/stylePaletteTranslator.ts
// MANWAH Space Studio｜美学硬装色彩系统与材质自然语言转换器
// 彻底打通“左侧风格调色板 (colorPalette) 与材质系统 (materialSystem)”到生图大模型的视觉通道

import { StylePreset } from '../../../types/spaceStudio';

export interface StyleDnaCompilation {
  dominantColorTone: string;
  materialFinishes: string;
  atmosphericLighting: string;
  styleMandateClause: string;
}

/**
 * 12 大国际美学预设的权威自然语言色彩与材质视觉光谱映射字典
 */
const STYLE_PALETTE_REGISTRY: Record<
  string,
  {
    dominantToneEn: string;
    materialsEn: string;
    lightingEn: string;
  }
> = {
  // ----------------------------------------------------
  // 欧美住宅 (Western Living - V1.0)
  // ----------------------------------------------------
  'US-01': {
    dominantToneEn: 'refined modern american metropolitan palette of warm oat greige (#E6DFD5), smoky chestnut brown (#5C4A3E), deep espresso walnut (#362B28), and brushed brass gold (#C5A059)',
    materialsEn: 'solid american dark walnut wood joinery, warm grey natural marble stone, top-grain pebble textured leather upholstery, brushed brass hardware',
    lightingEn: 'elegant gentle natural afternoon daylight passing through clean tailored linen sheers'
  },
  'US-02': {
    dominantToneEn: 'grand american manor estate palette of rich milk coffee latte (#D8CAB8), dark antiqued timber (#2C221E), warm architectural grey (#8A827A), and deep heritage spruce green (#38423B)',
    materialsEn: 'substantial carved natural stone fireplace mantel, dark wood wainscoting and wall paneling, heavy saddle full-grain leather, tweed upholstery',
    lightingEn: 'stately warm ambient chandelier illumination paired with warm fireside hearth glow'
  },
  'IT-01': {
    dominantToneEn: 'milanese architectural modern luxury palette of warm stone grey (#A8A29E), bone ivory white (#EDE8E1), deep espresso walnut (#3B312B), smoked taupe (#44403C), and patinated bronze (#785E48)',
    materialsEn: 'honed porous roman travertine stone, rich smoked dark walnut joinery, ultra-slim brushed titanium metal, smoked glass, thick wool textured rug, deep-toned semi-aniline leather',
    lightingEn: 'soft diffuse overcast daylight balancing with indirect 2700K warm architectural cove lighting, highlighting low-profile sculptural proportions'
  },
  'IT-02': {
    dominantToneEn: 'florentine classic elegance palette of warm bone ivory (#F4EFEA), rich caramel cognac tan (#A25828), warm umber brown (#6E5142), and muted olive ochre (#A89269)',
    materialsEn: 'natural porous architectural stone, warm fluted timber wall paneling, full-grain vegetable-tanned caramel leather, coarse woven raw linen, antique forged bronze',
    lightingEn: 'soft warm morning Italian daylight casting artistic museum-like gentle shadows'
  },
  'EU-01': {
    dominantToneEn: 'transitional european chic luminous palette of soft chantilly cream white (#FAF7F2), pale mineral grey (#D6D3D1), warm oat beige (#E7DEC8), and subtle champagne gold (#D4AF37)',
    materialsEn: 'pale calacatta white marble stone, delicate minimalist boiserie wall mouldings, pale oak herringbone parquet flooring, fine velvet fabrics',
    lightingEn: 'bright luminous Parisian natural daylight filling the tall airy room with delicate clarity'
  },
  'NC-01': {
    dominantToneEn: 'heritage neoclassical grandeur palette of warm ivory white (#F5F3EF), deep royal espresso brown (#2B211B), patinated bronze brass (#8B6B43), and deep imperial navy (#1E293B)',
    materialsEn: 'formal architectural wall paneling, carved limestone fireplace hearth, antique patinated brass details, deep rich full-grain leather upholstery',
    lightingEn: 'majestic balanced morning architectural light emphasizing strict symmetrical balance'
  },
  'UK-01': {
    dominantToneEn: 'british collector sanctuary palette of deep mahogany wood (#3A241D), rich hunter green (#1C3328), oxblood wine burgundy (#541A24), and antique warm parchment (#E0D5C1)',
    materialsEn: 'bespoke dark mahogany floor-to-ceiling bookcases, heavy wax-pull leather, vintage antique brass library lamps, wool tartan, heirloom rugs',
    lightingEn: 'cozy intimate fireside hearth glow and warm tungsten reading lamp highlights'
  },
  'MD-01': {
    dominantToneEn: 'contemporary mediterranean coast palette of lime-washed chalk white (#F8F5EE), sunbaked sand dune beige (#DECEBA), bleached drift wood (#B49A7D), and warm terracotta red (#B85D43)',
    materialsEn: 'organic textured lime plaster wash, rough-hewn natural stone fireplace, bleached pale timber beams, breathable coarse linen fabrics',
    lightingEn: 'golden afternoon coastal sunlight with warm natural breeze and soft organic shadows'
  },

  // ----------------------------------------------------
  // 国际现代 (Global Contemporary)
  // ----------------------------------------------------
  'LX-01': {
    dominantToneEn: 'metropolitan high-rise chic palette of warm slate grey (#9E978E), soft bone off-white (#F2EFEB), smoked chestnut brown (#4E3E37), and brushed champagne gold (#D1A960)',
    materialsEn: 'translucent veined luxury marble, brushed champagne gold stainless steel, smoked glass partitions, smooth architectural wood paneling',
    lightingEn: 'ambient evening cove lighting balancing with panoramic floor-to-ceiling urban twilight skyline views'
  },
  'LX-02': {
    dominantToneEn: 'international quiet luxury palette of warm stone alpine grey (#BAB2A9), pale sand stone (#D5CDC5), deep smoked wood (#3B3A36), and matte charcoal (#202020)',
    materialsEn: 'monolithic honed alpine stone, continuous seamless rift-cut wood millwork, plush heavyweight wool bouclé rug, matte semi-aniline leather',
    lightingEn: 'serene diffuse morning alpine daylight with high CRI pure clarity, completely devoid of glaring reflections'
  },
  'FR-01': {
    dominantToneEn: 'contemporary french haussmann palette of whipped cream ivory (#FBF6EE), pale dove grey (#D8D3CD), warm cognac caramel (#935B3B), and refined french brass (#B89758)',
    materialsEn: 'refined classic gypsum wall mouldings, natural oak chevron parquet flooring, honed light marble accents, champagne brass hardware',
    lightingEn: 'graceful romantic morning Parisian sunlight casting soft architectural shadows across sculpted wall paneling'
  },
  'CA-01': {
    dominantToneEn: 'california warm coastal modern palette of sun-drenched bleached ivory (#FAF6F0), natural pale oak (#C8B293), warm pebble grey (#9C968F), and coastal sage olive green (#4E5B4B)',
    materialsEn: 'bleached natural white oak ceilings, honed porous sandstone floors, floor-to-ceiling seamless sliding glass, raw textured linen drapery',
    lightingEn: 'abundant bright coastal California natural daylight streaming through open glass pavilions'
  },
  'ST-01': {
    dominantToneEn: 'curated modern metropolitan palette of deep smoked espresso charcoal (#2B2A29), warm taupe greige (#8C857B), soft oat cream (#DCD7D0), and brushed champagne bronze gold (#A67C52)',
    materialsEn: 'polished Pandora crystallite luxury marble, matte smoked dark oak architectural paneling, brushed antique bronze trims',
    lightingEn: 'subdued warm architectural interior lighting through sheer natural linen drapery with soft indirect 2700K cove light'
  },
  'ST-02': {
    dominantToneEn: 'italian architectural quiet luxury palette of warm bone ivory white (#EAE6E1), honed porous travertine stone greige (#BCB5AC), deep anthracite charcoal (#4A4643), and warm saddle tobacco leather (#8A6240)',
    materialsEn: 'natural porous travertine stone, continuous tumbled microcement walls, ultra-slim titanium black metal hardware, thick wool textured rug',
    lightingEn: 'soft diffused overcast daylight with warm low-contrast atmospheric glow, emphasizing sculptured negative space'
  },
  'ST-09': {
    dominantToneEn: 'bauhaus modernist high-contrast palette of industrial matte black (#1A1A1A), stark architectural off-white planes (#EFEFEF), bold mondrian cadmium red (#A31D1D), and bauhaus cobalt blue (#1D4ED8)',
    materialsEn: 'polished chrome tubular steel, black lacquered wood, flat optical architectural glass, black saddle leather',
    lightingEn: 'clean geometric architectural natural lighting with crisp graphic shadow gradients and sharp modernist planes'
  },

  // ----------------------------------------------------
  // 东方住宅 (Oriental Living)
  // ----------------------------------------------------
  'ST-03': {
    dominantToneEn: 'contemporary oriental zen palette of ink black ebony (#1C1B1A), smoked dark walnut timber (#5C554E), muted raw linen beige (#C2B8AA), and subtle moss forest green (#3E4F42)',
    materialsEn: 'dark ebony timber joinery, natural woven linen wallcovering, translucent ink-veined alabaster stone, matte tactile leather',
    lightingEn: 'serene architectural shadow play and gentle courtyard natural daylight filtering through minimalist wooden screens'
  },
  'OR-02': {
    dominantToneEn: 'contemporary oriental ink manor palette of ink stone charcoal (#212224), warm tea taupe (#7D756E), muted rice parchment (#C9C2B7), and aged amber teak (#8A6A4E)',
    materialsEn: 'translucent ink-veined alabaster stone, dark walnut wooden grilles, serene courtyard vistas, matte supple leather',
    lightingEn: 'diffused serene natural light with subtle warm focal spot lighting'
  },
  'OR-03': {
    dominantToneEn: 'oriental fusion luxury palette of haipai smoked dark wood (#3A3530), warm grey-beige (#A39587), soft silk ivory (#E4DCD3), and muted cinnabar crimson (#8C3E32)',
    materialsEn: 'refined dark wood joinery with brushed bronze detailing, warm ivory and muted crimson silk touches, fine top-grain leather',
    lightingEn: 'balanced architectural daylight and intimate warm lamps'
  },
  'OR-04': {
    dominantToneEn: 'modern neo-chinese minimalist palette of deep ink grey (#2F2E2C), warm bamboo earth (#68625B), pale rice white (#D5CEC5), and bamboo forest sage (#4C5D54)',
    materialsEn: 'seamless pale microcement, black titanium metal trims, natural bamboo joinery, frosted bamboo-shadow glass partitions',
    lightingEn: 'calm daylight casting bamboo shadows onto pale stone floors'
  }
};

/**
 * 将十六进制颜色代码 (Hex) 转换为具备视觉联想力的英文色彩修饰词
 */
export function translateHexColorToDescriptiveEnglish(hex: string): string {
  const cleanHex = hex.replace('#', '').trim();
  if (cleanHex.length !== 6 && cleanHex.length !== 3) {
    return 'neutral warm tone';
  }

  const r = parseInt(cleanHex.length === 3 ? cleanHex[0] + cleanHex[0] : cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.length === 3 ? cleanHex[1] + cleanHex[1] : cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.length === 3 ? cleanHex[2] + cleanHex[2] : cleanHex.slice(4, 6), 16);

  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  const isRedDominant = r > g + 30 && r > b + 30;
  const isBlueDominant = b > r + 30 && b > g + 30;
  const isGreenDominant = g > r + 30 && g > b + 30;
  const isWarm = r >= b + 5;

  if (brightness < 35) {
    if (isBlueDominant) return 'midnight dark navy blue';
    return 'obsidian deep charcoal black';
  } else if (brightness < 80) {
    if (isRedDominant) return 'deep burgundy oxblood tone';
    if (isGreenDominant) return 'dark forest olive green';
    if (isBlueDominant) return 'deep slate navy';
    return isWarm ? 'deep espresso brown' : 'dark graphite grey';
  } else if (brightness < 160) {
    if (isRedDominant) return 'warm terracotta amber';
    if (isGreenDominant) return 'sage moss green';
    if (isBlueDominant) return 'atmospheric muted steel blue';
    return isWarm ? 'warm taupe and saddle tan' : 'neutral medium grey';
  } else if (brightness < 220) {
    if (isWarm) return 'warm greige and soft oatmeal sand';
    return 'cool mineral silver grey';
  } else {
    if (isWarm) return 'warm bone ivory and cream off-white';
    return 'crisp architectural pure white';
  }
}

/**
 * 将中文材质数组转换为专业建筑室内设计英文词汇
 */
export function translateMaterialSystemToEnglish(materials: string[]): string {
  if (!materials || materials.length === 0) {
    return 'honed natural stone, warm architectural wood veneers, matte metallic hardware';
  }

  const translatedList: string[] = [];
  for (const mat of materials) {
    const lower = mat.toLowerCase();
    if (/潘多拉|微晶奢石|大理石|天然石|洞石|石灰华|石材/i.test(lower)) {
      if (/洞石|石灰华/i.test(lower)) translatedList.push('honed porous natural travertine stone');
      else if (/潘多拉/i.test(lower)) translatedList.push('polished Brazilian Pandora crystallite luxury marble');
      else if (/卡拉卡塔|白金/i.test(lower)) translatedList.push('calacatta gold polished marble');
      else translatedList.push('luxury polished architectural natural stone');
    } else if (/微水泥/i.test(lower)) {
      translatedList.push('continuous seamless tumbled microcement');
    } else if (/橡木|深烟熏|胡桃|实木|木纹|木质|木/i.test(lower)) {
      if (/深烟熏|烟熏/i.test(lower)) translatedList.push('matte smoked dark oak architectural paneling');
      else if (/黑胡桃|胡桃/i.test(lower)) translatedList.push('solid natural American black walnut wood joinery');
      else if (/白蜡|白橡/i.test(lower)) translatedList.push('bleached natural white oak millwork');
      else if (/柚木/i.test(lower)) translatedList.push('burmese teak slatted architectural woodwork');
      else translatedList.push('refined architectural hardwood millwork');
    } else if (/古铜|铜|钛|五金|金属|不锈钢|铝/i.test(lower)) {
      if (/拉丝古铜|古铜/i.test(lower)) translatedList.push('brushed antique bronze metal hardware');
      else if (/黄铜/i.test(lower)) translatedList.push('champagne brass architectural fixtures');
      else if (/黑钛/i.test(lower)) translatedList.push('ultra-slim titanium black metal hardware');
      else if (/铝/i.test(lower)) translatedList.push('precision milled matte architectural aluminum');
      else translatedList.push('refined architectural metal detailing');
    } else if (/地毯|羊毛/i.test(lower)) {
      translatedList.push('plush heavy-weight textured wool bouclé rug');
    } else if (/布艺|麻|棉麻|壁布/i.test(lower)) {
      translatedList.push('fine textured natural woven linen wallcovering');
    } else if (/真皮|牛皮|小牛皮|素皮|皮/i.test(lower)) {
      translatedList.push('genuine top-grain semi-aniline leather upholstery');
    } else {
      translatedList.push(mat);
    }
  }

  return translatedList.join(', ');
}

/**
 * 编译特定风格的美学与空间色调核心指令 (Style DNA Compilation)
 */
export function compileStyleDnaToEnglish(stylePreset?: StylePreset | null): StyleDnaCompilation {
  if (!stylePreset) {
    return {
      dominantColorTone: 'italian quiet luxury warm greige, soft off-white bone, and subtle dark charcoal accents',
      materialFinishes: 'honed porous natural travertine stone, warm oak paneling, and brushed bronze metals',
      atmosphericLighting: 'soft diffused natural daylight balancing with warm 2700K architectural indirect glow',
      styleMandateClause: ''
    };
  }

  const codeKey = stylePreset.code?.toUpperCase() || '';
  const registered = STYLE_PALETTE_REGISTRY[codeKey];

  let dominantColorTone = '';
  let materialFinishes = '';
  let atmosphericLighting = '';

  if (registered) {
    dominantColorTone = registered.dominantToneEn;
    materialFinishes = registered.materialsEn;
    atmosphericLighting = registered.lightingEn;
  } else {
    // 动态回退解析器：对未知或新增自定义风格进行语义合成
    if (stylePreset.colorPalette && stylePreset.colorPalette.length > 0) {
      const colorDescs = stylePreset.colorPalette.map(translateHexColorToDescriptiveEnglish);
      dominantColorTone = `${stylePreset.name} curated interior palette: ${colorDescs.join(', ')} (${stylePreset.colorPalette.join(', ')})`;
    } else {
      dominantColorTone = `${stylePreset.name} signature spatial color palette`;
    }

    materialFinishes = translateMaterialSystemToEnglish(stylePreset.materialSystem || []);
    atmosphericLighting = 'balanced architectural natural lighting paired with indirect 2700K warm interior ambient illumination';
  }

  // 组装具备最高约束力的空间色调与硬装材质指令 (Dominant Spatial Palette Mandate)
  const styleMandateClause = `[DOMINANT SPATIAL COLOR TONE & INTERIOR PALETTE MANDATE: ${stylePreset.name.toUpperCase()}]:
- ARCHITECTURAL COLOR ENVELOPE: The overall spatial shell (walls, flooring, ceiling, paneling, built-in cabinetry, and atmospheric room lighting) MUST be strictly dominated by the signature palette of ${stylePreset.name}: ${dominantColorTone}.
- ARCHITECTURAL SURFACE MATERIALITY: All walls, stone, and built-in architectural surfaces must strictly embody: ${materialFinishes}.
- ATMOSPHERIC ILLUMINATION BASELINE: ${atmosphericLighting}.
- STRICT PALETTE CONFLICT PREVENTION: Absolutely prohibit generic sterile white walls or random mismatched room colors. The background spatial color temperature, stone veining, and wall paneling must unmistakably express the ${stylePreset.name} aesthetic while maintaining clean visual contrast with the hero furniture.`;

  return {
    dominantColorTone,
    materialFinishes,
    atmosphericLighting,
    styleMandateClause
  };
}
