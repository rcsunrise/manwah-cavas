// src/features/space-studio/engine/sceneMasterPromptCompiler.ts
// MANWAH Space Studio｜A00 空间母版 Prompt 编译与锁定状态机 V3.1
import {
  ProductAsset,
  SpacePreset,
  StylePreset,
  PlacementBlueprint,
  ImageAspectRatio
} from '../../../types/spaceStudio';

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
    const { products, spacePreset, stylePreset, placementBlueprint, aspectRatio = '3:4' } = input;

    const primaryProduct = products.find((p) => p.priority === 'primary') || products[0];
    const secondaryProducts = products.filter((p) => p.id !== primaryProduct?.id);

    // 1. 核心产品真值描述 (按产品真实品类动态生成，杜绝把边几或茶几写死为三人沙发)
    const productClauses: string[] = [];
    const productDNAKeywords: string[] = [];

    if (primaryProduct) {
      productDNAKeywords.push(primaryProduct.name);
      if (primaryProduct.materials) productDNAKeywords.push(...primaryProduct.materials);
      if (primaryProduct.colors) productDNAKeywords.push(...primaryProduct.colors);

      const mainColor = primaryProduct.colors?.[0] || 'Warm Greige';
      const mainMaterial = primaryProduct.materials?.[0] || 'genuine top-grain semi-aniline cowhide leather';
      const mainTexture = primaryProduct.surfaceTexture || 'subtle soft natural leather grain pores, precision tailored stitching';
      const rules = primaryProduct.lockedRules?.join('. ') || '';
      const dims = primaryProduct.dimensions
        ? `${primaryProduct.dimensions.width}×${primaryProduct.dimensions.depth}×${primaryProduct.dimensions.height}mm`
        : '';

      let roleSpecificDesc = '';
      switch (primaryProduct.role) {
        case 'sofa_3seat':
        case 'sofa_2seat':
          roleSpecificDesc = `authentic MANWAH first-class luxury power motion sofa ensemble (${primaryProduct.name}, SKU: ${primaryProduct.sku || 'MW-CH-9866-3S'}). Features signature ergonomic contoured backrest, multi-split seating cushions, power reclining footrest mechanism. Dimensions: ${dims}.`;
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

      productClauses.push(
        `MANDATORY HERO FURNITURE SPECIFICATION: ${roleSpecificDesc} STRICT COLOR AND MATERIAL FIDELITY: Finished in exact authentic ${mainColor}, crafted in ${mainMaterial}. Surface details: ${mainTexture}. Visual Invariants: do not shift color to unintended dark red or burgundy; preserve exact design lines and materials. ${rules ? rules + '.' : ''}`
      );
    }

    // 次要家具配搭
    for (const sec of secondaryProducts) {
      if (sec.role === 'recliner_1seat') {
        productClauses.push(
          `angled side lounge: matching MANWAH power recliner armchair in ${
            sec.colors?.[0] || 'heritage amber leather'
          }, positioned in conversational 35-degree angle`
        );
      } else if (sec.role === 'coffee_table') {
        productClauses.push(
          `center living table: low-slung Brazilian Pandora crystallite natural luxury marble coffee table with polished organic stone veining and matte dark metallic base`
        );
      } else if (sec.role === 'side_table') {
        productClauses.push(
          `beside accent: minimalist saddle leather side table in ${sec.colors?.[0] || 'caramel & champagne gold'}`
        );
      }
    }

    // 2. 空间户型描述
    const architecturalClauses = [
      `luxury interior architecture: ${spacePreset.name}`,
      ...spacePreset.promptFragments,
      `grand open layout, ${spacePreset.ceilingHeight || 3.5}m high structural ceiling with recessed ambient shadow gaps and architectural floor-to-ceiling glass windows`
    ];

    // 3. 风格材质与采光系统
    const styleClauses = [
      `interior design aesthetic: ${stylePreset.name}`,
      ...stylePreset.promptFragments,
      `color harmony: ${stylePreset.colorPalette.join(', ')}`,
      `curated material palette: ${stylePreset.materialSystem.join(', ')}`,
      'lighting: diffused natural architectural daylight balancing with soft 2700k indirect warm cove illumination, raytraced photorealistic interior global illumination'
    ];

    // 4. 摄影机与构图约定 (黄金分割构图，杜绝天花板占大半、家具挤底部的沉底缺陷)
    const cameraClauses = [
      'shot on Hasselblad H6D-100c medium format architectural camera',
      '35mm architectural prime lens at eye level (height 115cm)',
      'perfect two-point architectural perspective, clean vertical straight lines without keystone distortion',
      `proportional ${aspectRatio} composition`,
      'masterful rule-of-thirds spatial balance: hero furniture ensemble is solidly and comfortably anchored in the lower-middle golden ratio with generous floor rug breathing space',
      'eye-level camera elevation ensuring the furniture is never squeezed or clipped against the bottom frame edge, balanced floor-to-ceiling height ratio without empty ceiling void',
      'neutral straight-on architectural elevation angle (yaw 0 deg, pitch 0 deg)'
    ];

    const positivePrompt = [
      ...productClauses,
      ...architecturalClauses,
      ...styleClauses,
      ...cameraClauses,
      'masterpiece, ultra-high resolution, architectural digest award-winning interior photography, commercial luxury furniture catalog benchmark, 8k crisp details'
    ].join(', ');

    const negativePrompt = [
      'unrealistic cartoon, 3d render plastic look, CGI artifacts, lowres, distorted sofa cushions, blurry leather texture',
      'furniture squeezed or cut off at bottom edge, excessive empty ceiling void, tilted perspective lines, crooked horizon',
      'wrong product color, unintended dark burgundy or maroon shift, deformed furniture legs, mutated seams, messy clutter',
      'cheap melamine laminate, garish neon colors, harsh flash glare, overblown highlights',
      'people, human, faces, extra hands, text, watermark, logo, typography overlay',
      ...stylePreset.negativeRules
    ].join(', ');

    return {
      positivePrompt,
      negativePrompt,
      aspectRatio,
      cameraSettings: {
        lensMm: 35,
        heightCm: 115,
        yawDeg: 0,
        pitchDeg: 0,
        framing: 'wide'
      },
      productDNAKeywords,
      architecturalConstraints: spacePreset.signatureFeatures
    };
  }
}
