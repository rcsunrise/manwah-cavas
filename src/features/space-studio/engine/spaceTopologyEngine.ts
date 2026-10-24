// src/features/space-studio/engine/spaceTopologyEngine.ts
// MANWAH Space Studio｜空间户型拓扑与美学风格深度映射引擎 V2.0
// 职责：
// 1. 彻底解决“户型与美学风格在渲染中名存实亡”的顽疾；
// 2. 将 6 大户型（如 N-R04 下沉式壁炉、N-R03 6.2米挑高复式天井、N-R06 天际云端等）转化为具备高强度约束的真实建筑物理拓扑；
// 3. 将美学风格（如 US-01 现代美式护墙线框、EU-01 法式雕花线条、IT-01 意式奢石洞石等）深度渗透入天花、墙面与地面硬装。

import { SpacePreset, StylePreset } from '../../../types/spaceStudio';

export interface SpaceTopologyCompilation {
  topologyDirective: string;
  architecturalFocalWall: string;
  flooringTopology: string;
  ceilingStructure: string;
  windowAndOutdoorView: string;
  negativeConstraints: string[];
}

export interface StyleArchitecturalCompilation {
  styleWallMoldingDirective: string;
  styleMaterialPalette: string;
  styleAtmosphericLighting: string;
  styleNegativeRules: string[];
}

/**
 * 编译空间户型拓扑指令 (严格契合 N-R01 ~ N-R06 的真实建筑空间第一性原理)
 */
export function compileSpaceTopology(spacePreset: SpacePreset): SpaceTopologyCompilation {
  const code = (spacePreset.code || '').toUpperCase();

  // 1. N-R04 下沉式围合私享厅 (Sunken Conversation Villa)
  if (code === 'N-R04' || /下沉|sunken/i.test(spacePreset.name)) {
    return {
      topologyDirective:
        'ARCHITECTURAL SUNKEN CONVERSATION LIVING LOUNGE: authentic architect-designed sunken conversation pit where the central seating zone is cleanly stepped down 40-45cm below the surrounding main floor plane with smooth continuous perimeter architectural stone steps. The entire sofa ensemble, coffee table, and plush wool area rug sit recessed inside this conversation sanctuary, creating a luxurious architectural feeling of enveloping intimacy without claustrophobic walls.',
      architecturalFocalWall:
        'monumental floor-to-ceiling honed natural travertine limestone focal wall integrated with a sleek continuous horizontal ribbon of real dancing flame in an architectural recessed fire hearth',
      flooringTopology:
        'clean architectural stepped-down floor plane (dropping 40-45cm) bordered by honed stone perimeter steps, with warm earthy micro-cement and a seamless custom plush wool area rug anchoring the sunken conversation pit',
      ceilingStructure:
        '3.8m tall architectural ceiling with soft perimeter recessed warm indirect cove lighting wash',
      windowAndOutdoorView:
        'generous floor-to-ceiling panoramic glass windows looking out to a private tranquil courtyard terrace',
      negativeConstraints: [
        'flat floor without steps',
        'flat single-level floor',
        'absence of sunken pit',
        'no steps around living room',
        'missing fireplace',
        'no fireplace',
        'missing fire hearth'
      ]
    };
  }

  // 2. N-R03 挑空复式庭院豪宅 (Double-Height Duplex Villa)
  if (code === 'N-R03' || /挑空|复式|duplex|double.*height/i.test(spacePreset.name)) {
    return {
      topologyDirective:
        'MONUMENTAL 6.2M DOUBLE-HEIGHT SOARING ARCHITECTURAL VOID: dramatic double-height duplex architectural hall with soaring 6.2m vertical volume; monumental limestone and dark wood architectural feature wall soaring across two tiers; a high-altitude modern sculptural chandelier hanging gracefully through the void; background reveals an interior glass courtyard bringing lush bamboo and zen greenery, and a subtle sculptural floating curved spiral staircase visible in the background.',
      architecturalFocalWall:
        'monumental 6.2-meter tall continuous limestone and vertical dark timber architectural wall soaring across two levels',
      flooringTopology:
        'large-format polished architectural light stone flooring with deep floor plane perspective',
      ceilingStructure:
        'majestic 6.2m soaring double-height duplex ceiling with architectural suspended linear pendant chandelier',
      windowAndOutdoorView:
        'monumental double-height full-span glass curtain wall looking out to lush private courtyard greenery and sky',
      negativeConstraints: [
        'low ceiling',
        'standard 3m ceiling',
        'flat standard apartment',
        'missing double height ceiling void',
        'cramped vertical headroom'
      ]
    };
  }

  // 3. N-R05 山水墅境独栋宽厅 (Landscape Villa Pavilion)
  if (code === 'N-R05' || /山水|宽厅|pavilion|landscape/i.test(spacePreset.name)) {
    return {
      topologyDirective:
        'ORIENTAL ZEN WATER GARDEN VILLA PAVILION: expansive 8-10 meters column-free horizontal pavilion with wall-to-wall uninterrupted floor-to-ceiling panoramic glass doors framing an outdoor serene water mirror reflection pool and majestic sculpted Japanese pine bonsai tree garden; smooth honed limestone floors and clean minimalist dark bronze profiles seamlessly merging indoor luxury living with exterior tranquil landscape.',
      architecturalFocalWall:
        'continuous minimalist dark bronze and natural textured stone feature wall embodying oriental modern tranquility',
      flooringTopology:
        'serene honed natural limestone floor tiles sharing subtle reflection with the outdoor water mirror pool',
      ceilingStructure:
        '4.0m grand flat architectural ceiling with concealed flush linear lighting channels',
      windowAndOutdoorView:
        'uninterrupted panoramic floor-to-ceiling glass wall framing an authentic outdoor tranquil water mirror reflection pool with sculptural Japanese pine bonsai tree and limestone garden boulders',
      negativeConstraints: [
        'urban city skyscraper view',
        'cluttered modern room',
        'blocked garden view',
        'isolated center pillar'
      ]
    };
  }

  // 4. N-R06 顶层天际会所大宅 (Skyline Penthouse Salon)
  if (code === 'N-R06' || /天际|顶层|会所|penthouse|skyline/i.test(spacePreset.name)) {
    return {
      topologyDirective:
        'TOP-FLOOR HIGH-ALTITUDE SKYLINE PENTHOUSE SALON: majestic 4.2m high ceiling with soaring panoramic floor-to-ceiling glass curtain wall overlooking high-altitude metropolis skyscraper skyline and sunset golden hour clouds; dark polished marble slabs, brushed champagne gold metal trim, aristocratic penthouse atmosphere.',
      architecturalFocalWall:
        'continuous full-span dark polished bookmatched marble wall with recessed brushed champagne brass metal profiles and concealed 2700K linear wash',
      flooringTopology:
        'high-gloss deep charcoal and grey crystalline stone tile flooring reflecting the panoramic city skyline daylight',
      ceilingStructure:
        '4.2m majestic ceiling height with muted architectural recessed coffer and indirect amber perimeter illumination',
      windowAndOutdoorView:
        'soaring floor-to-ceiling panoramic glass curtain wall overlooking dramatic high-altitude urban skyline skyscrapers, sunset golden hour clouds above the city',
      negativeConstraints: [
        'ground floor view',
        'street level view',
        'garden outside window',
        'standard residential view',
        'isolated center pillar'
      ]
    };
  }

  // 5. N-R02 端厅双景都会平层 (Dual-Aspect Corner Flat)
  if (code === 'N-R02' || /端厅|双景|corner/i.test(spacePreset.name)) {
    return {
      topologyDirective:
        '270-DEGREE DUAL-ASPECT CORNER LUXURY FLAT: corner high-rise luxury residence with dramatic 270-degree wraparound floor-to-ceiling glass curtain walls meeting at the room corner, flooding the expansive 8-10 meter open salon with volumetric morning daylight; grand continuous architectural wall paneling combining bookmatched luxury stone and warm rift-cut oak.',
      architecturalFocalWall:
        'continuous architectural feature wall paneling combining bookmatched luxury stone and warm rift-cut oak spanning across the horizontal axis without dividing columns',
      flooringTopology:
        'expansive polished light greige stone tile flooring with deep perspective',
      ceilingStructure:
        '3.6m ceiling with seamless warm linear cove reveals and recessed spotlights',
      windowAndOutdoorView:
        '270-degree dual-aspect corner floor-to-ceiling glass walls meeting at room corner, revealing sweeping open city horizon',
      negativeConstraints: [
        'single window on one side only',
        'solid corner without glass',
        'isolated center pillar',
        'freestanding partition wall'
      ]
    };
  }

  // 默认 & N-R01 通透横厅大平层 (Open Horizontal Flat)
  return {
    topologyDirective:
      'EXPANSIVE 8-10M WIDE OPEN HORIZONTAL FLAT: monumental 8 to 10-meter bay width open-plan living salon with generous floor-to-ceiling panoramic glass curtain wall and continuous full-span grand architectural backdrop wall without any center dividing pillar, generous open living flow effortlessly accommodating complete luxury furniture ensemble.',
    architecturalFocalWall:
      'continuous full-span architectural feature wall with wide horizontal balance spanning across the entire backdrop without isolated columns or split partitions',
    flooringTopology:
      'large-format polished light greige architectural porcelain stone flooring with deep room perspective',
    ceilingStructure:
      '3.5m high ceiling with seamless warm linear cove lighting and generous headroom',
    windowAndOutdoorView:
      'full-span floor-to-ceiling glass wall on the flank revealing soft natural skyline daylight',
    negativeConstraints: [
      'isolated center pillar',
      'freestanding partition wall',
      'narrow dividing post',
      'cramped small room',
      'boxy enclosed room'
    ]
  };
}

/**
 * 编译美学风格硬装塑造指令 (将美式、法式、意式等标志性硬装立面深入天花与墙面)
 */
export function compileStyleArchitecturalFinishes(stylePreset: StylePreset): StyleArchitecturalCompilation {
  const code = (stylePreset.code || '').toUpperCase();

  // 1. US-01 现代美式都会宅 (Modern American Metropolitan)
  if (code === 'US-01' || /美式都会|modern.*american/i.test(stylePreset.name)) {
    return {
      styleWallMoldingDirective:
        'REFINED MODERN AMERICAN ARCHITECTURAL WAINSCOTING & WALL MOLDINGS: wall architecture MUST feature classic modern American tailored picture-frame wall panel moldings and elegant wainscoting (refined rectangular wall frames with crisp architectural shadow-lines in warm oat greige and rich dark walnut millwork), paired with a dignified architectural stone or wood mantel focal design, warm brushed brass wall sconces, and tailored architectural plaster ceiling crown moldings. Strictly NOT flat sterile drywall!',
      styleMaterialPalette:
        'solid american dark walnut wood joinery, warm oat greige wall paneling (#E6DFD5), warm grey natural marble stone accents, brushed brass hardware, tailored linen sheers',
      styleAtmosphericLighting:
        'elegant gentle natural afternoon daylight passing through tailored linen sheers, paired with warm 2700K ambient brass sconces',
      styleNegativeRules: [
        'cold flat sterile drywall',
        'modern plain white slab without moldings',
        'sterile white clinic walls',
        'cheap laminate',
        'rustic farmhouse'
      ]
    };
  }

  // 2. US-02 美式庄园大宅 (American Grand Manor Estate)
  if (code === 'US-02' || /庄园|manor/i.test(stylePreset.name)) {
    return {
      styleWallMoldingDirective:
        'AMERICAN GRAND MANOR ESTATE ARCHITECTURE: substantial carved natural stone fireplace mantel as central architectural hearth, rich dark antiqued wood wainscoting and full-height dark timber wall paneling, heavy coffered timber ceiling beams, formal stately family gathering ambiance with warm ambient chandelier illumination.',
      styleMaterialPalette:
        'substantial carved natural stone fireplace mantel, dark antiqued wood wainscoting and wall paneling (#2C221E), rich milk coffee latte accents (#D8CAB8), brushed bronze hardware',
      styleAtmosphericLighting:
        'stately warm ambient chandelier illumination paired with warm fireside hearth glow',
      styleNegativeRules: [
        'ultra-modern glass box',
        'flat drywall minimalism',
        'cheap faux leather',
        'bare industrial concrete'
      ]
    };
  }

  // 3. EU-01 法式巴黎都会公寓 (Parisian Haussmannian Apartment)
  if (code === 'EU-01' || /法式|parisian|haussmann/i.test(stylePreset.name)) {
    return {
      styleWallMoldingDirective:
        'CLASSIC PARISIAN HAUSSMANNIAN BOISERIE: walls feature authentic delicate French boiserie panel moldings, carved plaster wall cornices, a classic pale Calacatta white marble carved fireplace mantel, and pale oak chevron/herringbone parquet flooring with luminous Parisian daylight.',
      styleMaterialPalette:
        'soft chantilly cream white boiserie (#FAF7F2), delicate plaster moldings, pale calacatta white marble fireplace, pale oak herringbone parquet flooring, subtle champagne gold accents',
      styleAtmosphericLighting:
        'bright luminous Parisian natural daylight filling the tall airy room with delicate clarity',
      styleNegativeRules: [
        'dark heavy industrial concrete',
        'rustic log cabin',
        'cheap vinyl floor',
        'flat modern drywall without moldings'
      ]
    };
  }

  // 4. IT-01 意式极简奢宅 (Italian Architectural Luxury)
  if (code === 'IT-01' || /意式|milanese|italian/i.test(stylePreset.name)) {
    return {
      styleWallMoldingDirective:
        'MILANESE ARCHITECTURAL MODERN LUXURY: continuous full-span honed porous Roman travertine stone slabs and rich smoked dark walnut joinery, ultra-slim dark brushed titanium metal profiles, minimalist recessed shadow reveal gaps without traditional moldings, serene low-profile sculptural aesthetic.',
      styleMaterialPalette:
        'honed porous roman travertine stone, rich smoked dark walnut joinery, ultra-slim brushed titanium metal, warm stone grey and bone ivory white',
      styleAtmosphericLighting:
        'soft diffuse overcast daylight balancing with indirect 2700K warm architectural cove lighting, highlighting low-profile sculptural proportions',
      styleNegativeRules: [
        'traditional decorative moldings',
        'rustic country wood',
        'cheap plastic laminate',
        'ornate floral carvings'
      ]
    };
  }

  // 默认：现代极简与通用高定
  return {
    styleWallMoldingDirective:
      `ARCHITECTURAL FINISHES FOR ${stylePreset.name.toUpperCase()}: walls, paneling, and cabinetry embody curated architectural surfaces with tailored material finishes and refined ambient illumination matching ${stylePreset.name}.`,
    styleMaterialPalette:
      (stylePreset.materialSystem || ['natural stone', 'wood paneling', 'brushed metal']).join(', '),
    styleAtmosphericLighting:
      'balanced architectural natural lighting paired with indirect 2700K warm interior ambient illumination',
    styleNegativeRules: [
      'mismatched wall colors',
      'generic sterile white room without intended style color tone',
      'garish neon colors'
    ]
  };
}
