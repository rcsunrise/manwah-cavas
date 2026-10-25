// src/features/space-studio/engine/sceneMasterPromptCompiler.ts
// MANWAH Space Studio｜A00 空间母版 Prompt 编译与锁定状态机 V3.1
import {
  ProductAsset,
  SpacePreset,
  StylePreset,
  PlacementBlueprint,
  ImageAspectRatio
} from '../../../types/spaceStudio';
import {
  translateColorToEnglish,
  translateMaterialToEnglish
} from './materialDnaTranslator';
import { compileStyleDnaToEnglish } from './stylePaletteTranslator';
import {
  compileSpaceTopology,
  compileStyleArchitecturalFinishes
} from './spaceTopologyEngine';

export interface CompileSceneMasterInput {
  products: ProductAsset[];
  spacePreset: SpacePreset;
  stylePreset: StylePreset;
  placementBlueprint: PlacementBlueprint;
  aspectRatio?: ImageAspectRatio;
}

export interface CompiledSceneMasterPrompt {
  positivePrompt: string;
  negativePrompt: string;
  aspectRatio?: ImageAspectRatio;
  cameraSettings: {
    lensMm: number;
    heightCm: number;
    yawDeg: number;
    pitchDeg: number;
    framing: string;
  };
  productDNAKeywords: string[];
  architecturalConstraints: string[];
}

export class SceneMasterPromptCompiler {
  /**
   * 严谨编译 A00 空间母版提示词结构
   * 遵循：真实建筑空间 + 敏华产品绝对真值 + 风格材质系 + 黄金分割摄影构图 (防下沉)
   */
  public static compile(input: CompileSceneMasterInput): CompiledSceneMasterPrompt {
    const { products, spacePreset, stylePreset, placementBlueprint, aspectRatio = '4:3' } = input;

    // 仅编译已勾选关联至当前场景套组的产品
    const activeProducts = products.filter((p) => p.priority === 'primary' || p.isEnsembleIncluded !== false);
    const primaryProduct = activeProducts.find((p) => p.priority === 'primary') || activeProducts[0];
    const secondaryProducts = activeProducts.filter((p) => p.id !== primaryProduct?.id);

    // 1. 核心产品真值描述 (按产品真实品类动态生成，杜绝把边几或茶几写死为三人沙发)
    const productClauses: string[] = [];
    const productDNAKeywords: string[] = [];

    if (primaryProduct) {
      productDNAKeywords.push(primaryProduct.name);
      if (primaryProduct.materials) productDNAKeywords.push(...primaryProduct.materials);
      if (primaryProduct.colors) productDNAKeywords.push(...primaryProduct.colors);

      const mainColor = translateColorToEnglish(primaryProduct.colors?.[0], 'ivory greige, soft pale grey');
      const mainMaterial = translateMaterialToEnglish(primaryProduct.materials?.[0], 'genuine top-grain semi-aniline cowhide leather');
      const mainTexture = primaryProduct.surfaceTexture || 'subtle soft natural leather grain pores, precision tailored stitching';
      const rules = primaryProduct.lockedRules?.join('. ') || '';
      const dims = primaryProduct.dimensions
        ? `${primaryProduct.dimensions.width}×${primaryProduct.dimensions.depth}×${primaryProduct.dimensions.height}mm`
        : '';

      let roleSpecificDesc = '';
      if (primaryProduct.isSceneEnsembleSuite && primaryProduct.sceneEnsembleDossier) {
        const ens = primaryProduct.sceneEnsembleDossier;
        const rawMain = ens.sofaSuite?.mainSofa?.color || primaryProduct.colors?.[0];
        const rawRecliner = ens.sofaSuite?.reclinerChairs?.[0]?.color;
        const mainSofaColor = translateColorToEnglish(rawMain, mainColor);
        const hasRecliner = Boolean(ens.sofaSuite?.reclinerChairs && ens.sofaSuite.reclinerChairs.length > 0);
        const reclinerColor = rawRecliner ? translateColorToEnglish(rawRecliner) : mainSofaColor;
        const isDualTone = hasRecliner && rawRecliner && rawMain && rawRecliner.trim() !== rawMain.trim();
        const layoutDesc = ens.placementDirectives?.holisticLayoutPrompt || ens.dossierSummary;

        const seatingDesc = isDualTone
          ? `[Seating: Main 3-seater sofa in ${mainSofaColor} paired with single accent armchair on left flank in contrasting ${reclinerColor}]`
          : `[Seating: Cohesive sofa and matching single chair suite in ${mainSofaColor}]`;

        roleSpecificDesc = `authentic complete luxury living room ensemble (${ens.name}, SKU: ${ens.sku || 'MW-ENS-SUITE'}). ${layoutDesc}. Coordinated architectural elements: ${seatingDesc}; [Tables: ${ens.coffeeTables?.description || 'natural marble center table and side tables'}]; [Rug: ${ens.carpetRug?.description || 'expansive plush wool area rug'}]; [Cabinetry: ${ens.credenzaSideboard?.presence ? ens.credenzaSideboard.description : 'curated low-profile credenza'}]; [Styling Decors: ${ens.softDecor?.description || 'designer sconces and curated botanicals'}]. Dimensions: ${dims}.`;
      } else {
        switch (primaryProduct.role) {
          case 'sofa_2seat':
            roleSpecificDesc = `authentic MANWAH first-class generous wide-body two-seater power motion sofa (${primaryProduct.name}, SKU: ${primaryProduct.sku || 'MW-CH-7588-2S'}). STATED SEATING CAPACITY: EXACTLY TWO SEATS (2 individual expansive seating cushions and 2 backrest sections only, wide horizontal stance, low-profile deep proportions, contrasting brown welt cord piping trim along seat front and armrest edges, twin-cushion division, strictly NOT a three-seater sofa, strictly NO middle seat cushion). Power reclining mechanism on outer seats. Dimensions: ${dims}.`;
            break;
          case 'sofa_3seat':
            roleSpecificDesc = `authentic MANWAH first-class luxury three-seater power motion sofa ensemble (${primaryProduct.name}, SKU: ${primaryProduct.sku || 'MW-CH-9866-3S'}). Features signature ergonomic contoured backrest, three distinct seating cushions, power reclining footrest mechanism. Dimensions: ${dims}.`;
            break;
          case 'lounge_chair':
            roleSpecificDesc = `authentic modern minimalist armless lounge chair (${primaryProduct.name}, SKU: ${primaryProduct.sku || 'MW-CH-3011-LC'}). Low-profile block silhouette, armless design, textured fabric upholstery, sleek swivel or stationary base, strictly NO footrest mechanism, strictly NO bulky armrests. Dimensions: ${dims}.`;
            break;
          case 'recliner_1seat':
            roleSpecificDesc = `authentic MANWAH first-class single power recliner armchair (${primaryProduct.name}, SKU: ${primaryProduct.sku || 'MW-CH-1028-1S'}). Zero-gravity aerospace-grade wrapping contour, power motorized footrest. Dimensions: ${dims}.`;
            break;
          case 'side_table':
            roleSpecificDesc = `authentic MANWAH luxury accent side table (${primaryProduct.name}, SKU: ${primaryProduct.sku || 'MW-SD-3301'}). Handcrafted Italian saddle leather wrap, champagne gold brushed stainless steel geometric base. Dimensions: ${dims}.`;
            break;
          case 'coffee_table':
            roleSpecificDesc = `authentic MANWAH center living table (${primaryProduct.name}, SKU: ${primaryProduct.sku || 'MW-TB-8802'}). Low-slung natural Pandora crystallite luxury marble top with polished organic stone veining and matte dark metallic base. Dimensions: ${dims}.`;
            break;
          default:
            roleSpecificDesc = `authentic MANWAH luxury furniture piece (${primaryProduct.name}, SKU: ${primaryProduct.sku || 'MW-PROD-01'}). Dimensions: ${dims}.`;
            break;
        }
      }

      const rawColorStr = (primaryProduct.colors || []).join(' ');
      const isDarkLeather = /深|栗|黑巧|咖啡|espresso|chestnut|dark.*brown/i.test(rawColorStr) || /chestnut|espresso|dark/i.test(mainColor);
      const colorAntiDriftDirective = isDarkLeather
        ? 'Visual Invariants: strictly preserve authentic deep dark roasted leather richness from reference image; strictly forbid color lightening, pale caramel shift, or washed-out yellow tones; preserve exact design lines and materials.'
        : 'Visual Invariants: do not shift color to unintended dark red or burgundy; preserve exact design lines and materials.';

      if (primaryProduct.isSceneEnsembleSuite && primaryProduct.sceneEnsembleDossier) {
        const ens = primaryProduct.sceneEnsembleDossier;
        const rawMain = ens.sofaSuite?.mainSofa?.color || primaryProduct.colors?.[0];
        const rawRecliner = ens.sofaSuite?.reclinerChairs?.[0]?.color;
        const mainSofaColor = translateColorToEnglish(rawMain, mainColor);
        const hasRecliner = Boolean(ens.sofaSuite?.reclinerChairs && ens.sofaSuite.reclinerChairs.length > 0);
        const reclinerColor = rawRecliner ? translateColorToEnglish(rawRecliner) : mainSofaColor;
        const isDualTone = hasRecliner && rawRecliner && rawMain && rawRecliner.trim() !== rawMain.trim();

        if (isDualTone) {
          productClauses.push(
            `MANDATORY HERO FURNITURE SPECIFICATION: ${roleSpecificDesc} DUAL-TONE SEATING COLOR FIDELITY: The 3-seater main sofa is crafted in authentic ${mainSofaColor}, whereas the single accent armchair on the left flank is STRICTLY finished in contrasting ${reclinerColor} upholstery, preserving its distinct modern profile. Surface details: ${mainTexture}. DO NOT paint the single chair in the main sofa's color (${mainSofaColor})! ${rules ? rules + '.' : ''}`
          );
        } else {
          productClauses.push(
            `MANDATORY HERO FURNITURE SPECIFICATION: ${roleSpecificDesc} COHESIVE SEATING COLOR FIDELITY: Finished in authentic ${mainSofaColor}. Surface details: ${mainTexture}. ${rules ? rules + '.' : ''}`
          );
        }
      } else {
        productClauses.push(
          `MANDATORY HERO FURNITURE SPECIFICATION: ${roleSpecificDesc} STRICT COLOR AND MATERIAL FIDELITY: Finished in exact authentic ${mainColor}, crafted in ${mainMaterial}. Surface details: ${mainTexture}. ${colorAntiDriftDirective} ${rules ? rules + '.' : ''}`
        );
      }
    }

    // 次要家具配搭（仅包含已勾选关联的产品，支持动态名称/材质/色彩纯视觉英文翻译）
    for (const sec of secondaryProducts) {
      const secColor = translateColorToEnglish(sec.colors?.[0], 'pristine polar milk-white');
      const secMat = translateMaterialToEnglish(sec.materials?.[0], 'genuine top-grain semi-aniline leather');
      if (sec.role === 'lounge_chair' || sec.name?.includes('无扶手') || sec.name?.includes('休闲单椅')) {
        productClauses.push(
          `angled side accent: modern minimalist armless lounge chair (${sec.name}) in ${secColor} with ${secMat}, sleek armless profile, strictly NO bulky footrest, positioned closely in intimate 45-degree conversational cluster alongside the hero sofa around the center coffee table, forming a cohesive tight-knit living room conversation circle on the central rug, strictly NOT drifting apart or pushed against the window edge`
        );
      } else if (sec.role === 'recliner_1seat') {
        productClauses.push(
          `angled side lounge: matching MANWAH power recliner armchair (${sec.name}) in ${secColor} with ${secMat}, positioned closely in intimate conversational cluster alongside the hero sofa around the center coffee table on the central rug, strictly NOT pushed against the window edge`
        );
      } else if (sec.role === 'coffee_table') {
        productClauses.push(
          `center living table: harmonious proportioned living coffee table (${sec.name}) featuring ${secMat} in ${secColor} placed neatly in front of the sofa`
        );
      } else if (sec.role === 'side_table') {
        productClauses.push(
          `beside accent: minimalist side table (${sec.name}) in ${secColor} with refined ${secMat} finish`
        );
      } else {
        productClauses.push(
          `harmonious matching piece: (${sec.name}) in ${secColor}`
        );
      }
    }

    // 2. 美学硬装空间色调与材质采光系统 (Interior Dominant Palette & High-End Photography Lighting)
    const styleDna = compileStyleDnaToEnglish(stylePreset);
    const styleFinishes = compileStyleArchitecturalFinishes(stylePreset);
    const spaceTopology = compileSpaceTopology(spacePreset);

    // 3. 空间户型描述与建筑轴线对齐 (Architectural Space & Distinct Typology Topology)
    const architecturalClauses = [
      `luxury interior architecture: ${spacePreset.name} (${spacePreset.code})`,
      `${spacePreset.ceilingHeight}m high ceiling`,
      spaceTopology.topologyDirective,
      `focal wall architecture: continuous full-span architectural feature wall, ${spaceTopology.architecturalFocalWall}`,
      `flooring & elevation topology: ${spaceTopology.flooringTopology}`,
      `ceiling architecture: ${spaceTopology.ceilingStructure}`,
      `window & landscape aperture: ${spaceTopology.windowAndOutdoorView}`,
      'capacious open living layout with deep floor plane perspective, effortlessly accommodating an entire luxury furniture ensemble: hero sofa, companion seating, swivel lounge recliner, center marble coffee table, accent side tables, and expansive plush area rug with ample breathing room',
      'strict orthogonal architectural grid alignment: all furniture pieces, area rug, and wall planes share unified vanishing points with floor tiles and perspective axes'
    ];

    const styleClauses = [
      styleDna.styleMandateClause,
      `interior design aesthetic: ${stylePreset.name}`,
      styleFinishes.styleWallMoldingDirective,
      `spatial color harmony: ${styleDna.dominantColorTone}`,
      `curated architectural materiality: ${styleFinishes.styleMaterialPalette}`,
      `lighting: ${styleFinishes.styleAtmosphericLighting}, pure soft natural daylight, subtle natural light falloff creating deep organic leather modeling, muted ambient ceiling without glaring yellow cove strips, authentic ambient-occlusion contact shadows grounding furniture`
    ];

    // 4. 摄影机与构图约定 (经典大平层 26mm 超广角平视构图，视野开阔通透，严防沉底与局促小盒)
    const cameraClauses = [
      'shot on Hasselblad H6D-100c medium format architectural camera with 26mm ultra-wide architectural prime lens at eye level (height 130cm)',
      'expansive 26mm field of view capturing monumental horizontal room width and majestic depth without wide-angle fisheye distortion, vertical lines strictly plumb without keystone convergence',
      `proportional ${aspectRatio} composition`,
      'masterful commercial luxury furniture catalog benchmark: expansive living room ensemble comfortably grounded in mid-ground against the full-span feature wall, generous panoramic vista and balanced headroom, completely free of claustrophobic crowding',
      'neutral straight-on architectural perspective angle (yaw 0 deg, pitch -1 deg), sofa aligned squarely with camera axis and backdrop elevation'
    ];

    const positivePrompt = [
      styleDna.styleMandateClause,
      ...productClauses,
      ...architecturalClauses,
      ...styleClauses,
      ...cameraClauses,
      'masterpiece, ultra-high resolution, architectural digest award-winning interior photography, commercial luxury furniture catalog benchmark, pure clean photograph, completely free of any text, words, Chinese characters, watermark, or labels, 8k crisp details'
    ].join(', ');

    const isPrimaryFabric = /fabric|cloth|microfiber|woven|linen|textile|麻|布/i.test(
      `${primaryProduct?.materials?.join(' ') || ''} ${primaryProduct?.name || ''}`
    );

    const negativePrompt = [
      'unrealistic cartoon, 3d render plastic look, CGI artifacts, lowres, distorted sofa cushions',
      primaryProduct?.role === 'sofa_2seat' ? 'three-seater sofa, 3 seating cushions, 3 backrest cushions, sectional couch, middle seat cushion, extra seating unit' : '',
      isPrimaryFabric ? 'glossy leather, shiny patent leather, cowhide texture' : '',
      'isolated center pillar, freestanding partition wall, floating divider column, narrow dividing post, claustrophobic narrow room, cramped small room, boxy enclosed room, narrow bay width, blocked vista, cut-off backdrop, awkward room divider in middle of room, split room partition',
      ...spaceTopology.negativeConstraints,
      ...styleFinishes.styleNegativeRules,
      'excessive empty rug void in foreground, cut-off ceiling, missing ceiling structure, lonely drifting side chair, disconnected furniture grouping, accent chair pushed against window, lopsided dark wall imbalance, crooked vertical lines, ground-level low shot, furniture squeezed or cut off at bottom edge',
      'sofa overlapping window and wall seam, sofa blocking window glass, discontinuous backdrop behind sofa, crooked sofa angle, mismatched perspective alignment, sofa floating off floor grid, sofa angled awkwardly against walls, obstructed window frame, half wall half window background, conflicting vanishing points, floating furniture angle, mismatched ground plane vanishing lines, sofa placed sideways against room perspective, sofa cut in half by background wall seam, asymmetrical split backdrop behind sofa',
      'mismatched wall colors, wrong architectural palette, generic sterile white room without intended style color tone, garish neon colors',
      'wrong product color, unintended dark burgundy or maroon shift, deformed furniture legs, mutated seams, messy clutter',
      'cheap melamine laminate, garish neon colors, harsh flash glare, overblown highlights',
      'people, human, faces, extra hands',
      'text, watermark, logo, letters, chinese characters, words, subtitles, labels, annotations, captions, tags, price tags, graphic overlays, typography, font, UI elements',
      ...(stylePreset.negativeRules || [])
    ].filter(Boolean).join(', ');

    return {
      positivePrompt,
      negativePrompt,
      aspectRatio,
      cameraSettings: {
        lensMm: 26,
        heightCm: 130,
        yawDeg: 0,
        pitchDeg: -1,
        framing: 'wide'
      },
      productDNAKeywords,
      architecturalConstraints: spacePreset.signatureFeatures
    };
  }
}
