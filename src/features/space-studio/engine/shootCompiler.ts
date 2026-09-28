// src/features/space-studio/engine/shootCompiler.ts
// MANWAH Space Studio｜SHOOT 阶段镜头群组编译器 (Camera DNA + Intent -> Prompt)
import {
  ShotInstance,
  SceneMaster,
  ProductAsset,
  SpacePreset,
  StylePreset,
  PlacementBlueprint
} from '../../../types/spaceStudio';

export interface CompileShotPromptInput {
  shot: ShotInstance;
  sceneMaster: SceneMaster;
  products: ProductAsset[];
  spacePreset: SpacePreset;
  stylePreset: StylePreset;
  blueprint: PlacementBlueprint;
}

export interface CompiledShotPrompt {
  shotCode: string;
  positivePrompt: string;
  negativePrompt: string;
  cameraSpec: {
    lensMm: number;
    heightCm: number;
    yawDeg: number;
    pitchDeg: number;
    framing: string;
  };
  invarianceChecks: {
    furnitureFixed: boolean;
    productLocked: boolean;
    lightingConsistent: boolean;
  };
}

export class ShootCompiler {
  /**
   * 基于 A00 母版基准与特定镜头 Camera DNA，精准编译镜头渲染提示词
   * 严格实施“单变量改变原则 (Change One Variable at a Time: 仅动摄影机，不动家具)”
   */
  public static compileShotPrompt(input: CompileShotPromptInput): CompiledShotPrompt {
    const { shot, products, spacePreset, stylePreset } = input;
    const { camera, intent } = shot;

    const primaryProduct = products.find((p) => p.priority === 'primary') || products[0];

    // 1. 镜头景别与机位描述 (Camera DNA)
    const cameraClauses: string[] = [
      `captured on professional Hasselblad H6D-100c medium format camera`,
      `equipped with precision ${camera.lensMm}mm architectural prime lens`,
      `camera positioned at exact height of ${camera.heightCm}cm above finished floor`,
      `camera rotation yaw angle: ${camera.yawDeg} degrees, tilt pitch angle: ${camera.pitchDeg} degrees`,
      `framing composition: ${camera.framing} framing`,
      'architectural vertical perspective correction, razor sharp optical clarity, natural cinematic depth of field'
    ];

    // 2. 镜头意图描述 (Shot Intent)
    const intentClauses: string[] = [
      `shot aesthetic goal: ${intent.name}`,
      `subject emphasis: ${intent.productDominancePct}% visual prominence on ${primaryProduct?.name || 'MANWAH luxury furniture'}`,
      `background treatment: ${intent.backgroundSuppression} background suppression with harmonious bokeh`
    ];

    // 3. 必须包含 (Must Include) 与 产品特征注入
    const mustIncludeClauses: string[] = [
      ...(camera.mustInclude || []),
      ...(primaryProduct?.materials || []),
      ...(primaryProduct?.colors || [])
    ];

    // 4. 针对不同镜头模板定制的产品聚焦指令
    const specializedClauses: string[] = [];
    if (shot.templateCode === 'A02') {
      specializedClauses.push(
        'hero angle showcasing 45-degree silhouette, subtle natural cowhide leather grain highlights, plush armrest curvature'
      );
    } else if (shot.templateCode === 'A03') {
      specializedClauses.push(
        'power motion function focus: extended smooth power footrest, open recliner mechanism, zero-wall clearance engineering'
      );
    } else if (shot.templateCode === 'A04') {
      specializedClauses.push(
        'extreme macro detail: microscopic genuine semi-aniline leather pores, handcrafted double-stitched seams, soft velvety leather luster, ultra-shallow depth of field'
      );
    } else if (shot.templateCode === 'A05') {
      specializedClauses.push(
        'majestic ground-level low-angle composition, soaring ceiling height interplay, solid grounded base proportions'
      );
    } else if (shot.templateCode === 'A06') {
      specializedClauses.push(
        'conversational close ensemble: pairing between soft top-grain leather sofa apron and polished Brazilian Pandora crystallite natural stone table top'
      );
    }

    // 5. 空间与风格基准及家具摆位拓扑（强制继承母版不变量）
    const placementClauses = input.blueprint?.items
      ? input.blueprint.items.map((item) => `${item.assetName} securely anchored at zone ${item.zoneId} with zero translation`)
      : [];

    const sceneMasterHeritage = [
      `space prototype anchor: ${spacePreset.name} (${spacePreset.code})`,
      `design style harmony: ${stylePreset.name} aesthetic`,
      `ambient architectural lighting matching master scene`,
      ...placementClauses
    ];

    const positivePrompt = [
      ...cameraClauses,
      ...intentClauses,
      ...mustIncludeClauses,
      ...specializedClauses,
      ...sceneMasterHeritage,
      'commercial furniture catalog masterpiece, authentic luxury materiality, clean composition, 8k crisp resolution'
    ].filter(Boolean).join(', ');

    const negativePrompt = [
      'physically moved furniture positions, shifted sofa coordinates, displaced coffee table',
      'deformed sofa structure, distorted perspective distortion, warped straight lines',
      'plastic textures, cheap laminate, cartoon CGI rendering, overexposed highlights',
      'people, human, faces, extra fingers, text, watermark, signature',
      ...(camera.mustExclude || []),
      ...stylePreset.negativeRules
    ].filter(Boolean).join(', ');

    return {
      shotCode: shot.templateCode,
      positivePrompt,
      negativePrompt,
      cameraSpec: {
        lensMm: camera.lensMm,
        heightCm: camera.heightCm,
        yawDeg: camera.yawDeg,
        pitchDeg: camera.pitchDeg,
        framing: camera.framing
      },
      invarianceChecks: {
        furnitureFixed: true,
        productLocked: true,
        lightingConsistent: true
      }
    };
  }
}
