// src/features/space-studio/engine/shootCompiler.ts
// MANWAH Space Studio｜SHOOT 阶段镜头群组编译器 (Camera DNA + Intent -> Prompt)
import {
  ShotInstance,
  SceneMaster,
  ProductAsset,
  ProductReference,
  SpacePreset,
  StylePreset,
  PlacementBlueprint,
  ImageAspectRatio
} from '../../../types/spaceStudio';
import {
  translateColorToEnglish,
  translateMaterialToEnglish,
  resolveCompositeMaterialDna
} from './materialDnaTranslator';
import { compileStyleDnaToEnglish } from './stylePaletteTranslator';
import { STANDARD_SHOT_TEMPLATES } from '../data/shotTemplates';

export interface CompileShotPromptInput {
  shot: ShotInstance;
  sceneMaster: SceneMaster;
  products: ProductAsset[];
  spacePreset: SpacePreset;
  stylePreset: StylePreset;
  blueprint: PlacementBlueprint;
  aspectRatio?: ImageAspectRatio;
  functionalPositionState?: 'closed' | 'open';
}

export interface CompiledShotPrompt {
  shotCode: string;
  roomName?: string;
  spaceCode?: string;
  styleName?: string;
  styleCode?: string;
  aspectRatio: ImageAspectRatio;
  positivePrompt: string;
  negativePrompt: string;
  shotSpecificMandate?: string;
  negativeFramingConstraints?: string[];
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
   * 打通多视角真值锁定：依据机位代码（shotCode）智能挑选最匹配的产品视角参考图
   * 彻底解决过去前端录入了 45度/侧面/展开视角，但生图调度层盲取第 1 张图的断层 Bug
   */
  public static selectBestProductReferenceForShot(
    product?: ProductAsset,
    shotCode?: string
  ): { reference?: ProductReference; viewType: string; matchedRationale: string } {
    if (!product || !product.referenceImages || product.referenceImages.length === 0) {
      return { viewType: 'front', matchedRationale: 'Default fallback (no reference images)' };
    }

    const refs = product.referenceImages;
    const code = (shotCode || 'A00').toUpperCase();

    // 优先视角期望队列映射 (依照机位工业意图由强至弱排序)
    let preferredTypes: Array<'front' | '45_deg' | 'side' | 'back' | 'function_open' | 'detail' | 'material'> = ['front'];

    if (code === 'A02' || code.includes('45')) {
      // A02: 45度斜侧透视全景，优先 45_deg，其次 front
      preferredTypes = ['45_deg', 'front', 'side'];
    } else if (code === 'A06' || code.includes('PROFILE') || code.includes('ZERO_WALL')) {
      // A06: 零靠墙闭合侧面剪影，优先 side (正侧面)，其次 45_deg，绝不优先 function_open
      preferredTypes = ['side', '45_deg', 'front'];
    } else if (code === 'A08' || code.includes('RECLINER') || code.includes('FUNCTION') || code.includes('DETAIL')) {
      // A08: 单椅展示，优先 front / 45_deg / side
      preferredTypes = ['front', '45_deg', 'side', 'detail'];
    } else if (code === 'A04' || code.includes('COMPANION') || code === 'A05') {
      // A04/A05: 2/3透视侧景，优先 45_deg，其次 side，再次 front
      preferredTypes = ['45_deg', 'front', 'side'];
    } else {
      // A00 / A01 / A03 / A07: 默认正面全景或主品特写
      preferredTypes = ['front', '45_deg', 'side'];
    }

    // 在产品已有的参考图中依次寻找最佳匹配（必须具备有效 URL 或 Key）
    for (const t of preferredTypes) {
      const match = refs.find((r) => r.type === t && (r.publicUrl || r.objectKey));
      if (match) {
        return {
          reference: match,
          viewType: t,
          matchedRationale: `机位 ${code} 智能命中产品【${t}】视角工业真值图`
        };
      }
    }

    // 若无特定视角，优先使用独立切片特写图 (如 id 包含 crop 或 isCrop)
    const cropMatch = refs.find((r) => (r.id?.includes('crop') || (r as any).isCrop) && (r.publicUrl || r.objectKey));
    if (cropMatch) {
      return {
        reference: cropMatch,
        viewType: cropMatch.type || 'front',
        matchedRationale: `机位 ${code} 选用产品独立高清切片真值图`
      };
    }

    // 若仍无匹配，回退到第一张有效图
    const fallback = refs.find((r) => r.publicUrl || r.objectKey) || refs[0];
    return {
      reference: fallback,
      viewType: fallback?.type || 'front',
      matchedRationale: `机位 ${code} 未找到专属视角，使用首选参考图`
    };
  }

  /**
   * 将数值化机位参数（焦距、高度、偏角、俯仰角、景别）精准翻译为生图大模型最敏感的高权重专业摄影语义词
   */
  public static translateCameraToDirectives(camera: ShotInstance['camera']): {
    semanticClauses: string[];
    framingDirective: string;
    negativeExclusions: string[];
  } {
    const clauses: string[] = [];
    const negativeExclusions: string[] = [];

    // 1. 焦距语义翻译 (Lens Focal Length)
    if (camera.lensMm <= 24) {
      clauses.push(`captured on professional Hasselblad camera with ultra-wide ${camera.lensMm}mm architectural lens, expansive monumental perspective, vertical lines strictly plumb`);
    } else if (camera.lensMm <= 30) {
      clauses.push(`captured on professional Hasselblad camera equipped with precision ${camera.lensMm}mm architectural prime lens, expansive panoramic depth of field, full architectural room context`);
    } else if (camera.lensMm <= 40) {
      clauses.push(`captured on professional Hasselblad camera with classic ${camera.lensMm}mm environmental lens, natural human-eye perspective, distortion-free elegant geometry`);
    } else if (camera.lensMm <= 55) {
      clauses.push(`captured on professional Hasselblad camera with precision ${camera.lensMm}mm prime lens, true-to-life human eye proportion, focused subject emphasis`);
    } else {
      clauses.push(`captured on professional Hasselblad camera with telephoto ${camera.lensMm}mm macro lens, ultra-shallow depth of field, creamy background blur bokeh, razor-sharp edge focus`);
      negativeExclusions.push('wide room panorama', 'distant room view', 'deep depth of field');
    }

    // 2. 视高语义翻译 (Camera Height)
    if (camera.heightCm <= 80) {
      clauses.push(`ground-level low-angle camera vantage at ${camera.heightCm}cm above finished floor looking upward, monumental low-slung base stability`);
      negativeExclusions.push('high angle', 'overhead shot', 'eye-level flat view');
    } else if (camera.heightCm <= 115) {
      clauses.push(`intimate seated lounge eye-level vantage at ${camera.heightCm}cm above finished floor, inviting comfortable perspective`);
    } else if (camera.heightCm <= 145) {
      clauses.push(`standing architectural eye-level vantage at ${camera.heightCm}cm above finished floor, balanced commercial presentation`);
    } else {
      clauses.push(`elevated high-angle overview at ${camera.heightCm}cm above finished floor, clear architectural spatial layout`);
      negativeExclusions.push('ground level angle');
    }

    // 3. 偏角与透视 (Yaw Angle)
    if (Math.abs(camera.yawDeg) <= 5) {
      clauses.push('one-point symmetrical frontal perspective, architectural alignment with room grid');
    } else if (camera.yawDeg >= 25) {
      clauses.push(`dynamic 45-degree three-quarters angled isometric view from the right (${camera.yawDeg}° yaw), emphasizing 3D volume, 45-degree silhouette, side wing curvature, and seating depth`);
      negativeExclusions.push('flat frontal shot', 'straight-on view');
    } else if (camera.yawDeg <= -25) {
      clauses.push(`dynamic 45-degree three-quarters angled isometric view from the left (${camera.yawDeg}° yaw), emphasizing 3D volume, 45-degree silhouette, side wing curvature, and seating depth`);
      negativeExclusions.push('flat frontal shot', 'straight-on view');
    } else {
      clauses.push(`subtle oblique vantage (${camera.yawDeg}° yaw angle)`);
    }

    // 4. 俯仰角 (Pitch Angle)
    if (camera.pitchDeg >= 3) {
      clauses.push(`camera tilted upward (+${camera.pitchDeg}° pitch tilt) looking up toward ceiling structure and upper architectural volumes`);
      negativeExclusions.push('looking down', 'bird eye');
    } else if (camera.pitchDeg <= -3) {
      clauses.push(`camera tilted downward (${camera.pitchDeg}° pitch tilt) looking down on sofa seating surface, cushion tufting, and coffee table top`);
      negativeExclusions.push('upward tilt');
    } else {
      clauses.push('camera level with horizon (0° pitch), plumb vertical architectural lines');
    }

    // 5. 景别语义翻译 (Framing Composition)
    let framingDirective = 'medium framing';
    if (camera.framing === 'detail') {
      framingDirective = 'extreme macro close-up framing tightly cropped on texture and seams, background completely blurred';
      negativeExclusions.push('wide angle panorama', 'full room view', 'entire sofa', 'distant objects');
    } else if (camera.framing === 'product') {
      framingDirective = 'hero product framing tightly focused on the furniture silhouette, cutting off unnecessary distant room periphery';
      negativeExclusions.push('wide empty room', 'far distant vantage');
    } else {
      framingDirective = 'wide architectural framing capturing full living space relation';
    }

    return {
      semanticClauses: clauses,
      framingDirective,
      negativeExclusions
    };
  }

  /**
   * 基于 A00 母版基准与特定镜头 Camera DNA，精准编译镜头渲染提示词
   * 严格确立“机位与景别第一性原则 (Camera & Framing First Mandate)”
   */
  public static compileShotPrompt(input: CompileShotPromptInput): CompiledShotPrompt {
    const { shot, products, spacePreset, stylePreset } = input;
    const { camera, intent } = shot;

    // 仅编译已激活/勾选的产品套组
    const activeProducts = products.filter((p) => p.priority === 'primary' || p.isEnsembleIncluded !== false);

    // 核心工业逻辑：针对专属镜头：
    // 1. A03/A04/A05/A06：3人位主沙发专属镜头（物理主体锚定单独 3人位资产）
    // 2. A08：单椅专属镜头（物理主体锚定单独单人位资产，摆放于空旷客厅）
    // 3. A09：餐桌配套展示景（物理主体锚定餐桌椅、餐边柜、餐车等配套资产，严格杜绝主沙发抢戏）
    const isHeroSofaDedicatedShot = ['A03', 'A04', 'A05', 'A06'].includes(shot.templateCode);
    const isReclinerDedicatedShot = ['A08'].includes(shot.templateCode);
    const isDiningSuiteDedicatedShot = ['A09'].includes(shot.templateCode);

    const hero3SeatCandidate = activeProducts.find(
      (p) => p.role === 'sofa_3seat' || p.role === 'sofa_2seat' || /(三人|3人|主沙发|直排)/.test(p.name || '')
    );
    const reclinerCandidate = activeProducts.find(
      (p) => p.role === 'recliner_1seat' || p.role === 'lounge_chair' || /(单人|单椅|头等舱|单机位|大师|休闲椅|扶手椅)/.test(p.name || '')
    ) || activeProducts.find((p) => p.priority === 'secondary' || (p.role !== 'sofa_3seat' && p.role !== 'sofa_2seat' && p.role !== 'coffee_table' && p.role !== 'dining_table'));
    const diningCandidate = activeProducts.find(
      (p) => p.role === 'dining_table' || p.role === 'dining_chair' || /(餐桌|餐椅|餐边柜|餐台|餐车|餐厅|配套)/.test(p.name || '')
    );

    const primaryProduct = (isHeroSofaDedicatedShot && hero3SeatCandidate)
      ? hero3SeatCandidate
      : (isReclinerDedicatedShot && reclinerCandidate)
      ? reclinerCandidate
      : (isDiningSuiteDedicatedShot && diningCandidate)
      ? diningCandidate
      : (activeProducts.find((p) => p.priority === 'primary') || activeProducts[0]);

    // 搭配品精准过滤：
    // 1. A04 / A05 / A06 (2/3 主沙发亲子/私享/侧景) 以及 A08 (单椅功能特写)：严格剔除所有搭配品，提示词 100% 专属于核心单品独立资产！
    // 2. A03 (3人位主沙发组合焦点景)：仅保留中心茶几，严格剔除侧边单椅！
    // 3. A09 (餐桌配套展示景)：仅当录入了餐区配套产品时才排除主沙发；若未录入餐桌，平滑自适应为客餐通透景保留主沙发！
    const secondaryProducts = ['A04', 'A05', 'A06', 'A08'].includes(shot.templateCode)
      ? []
      : (shot.templateCode === 'A03'
          ? activeProducts.filter((p) => p.id !== primaryProduct?.id && p.role === 'coffee_table')
          : (shot.templateCode === 'A09' && diningCandidate
              ? activeProducts.filter((p) => p.id !== primaryProduct?.id && p.role !== 'sofa_3seat' && p.role !== 'sofa_2seat')
              : activeProducts.filter((p) => p.id !== primaryProduct?.id)));

    const primaryColorEn = translateColorToEnglish(primaryProduct?.colors?.[0], 'ivory greige, soft warm pale grey');
    const primaryMaterialEn = translateMaterialToEnglish(primaryProduct?.materials?.[0], 'genuine top-grain semi-aniline cowhide leather', primaryProduct?.role);

    const isFabricOrMicrofiber = /fabric|cloth|microfiber|woven|linen|textile|麻|布/i.test(
      `${primaryProduct?.materials?.join(' ') || ''} ${primaryProduct?.name || ''}`
    );

    let cleanProductName = '';
    if (primaryProduct?.role === 'sofa_2seat') {
      cleanProductName = `generous wide-body two-seater power motion sofa in ${primaryColorEn} (${primaryMaterialEn}), featuring a wide horizontal stance and low-profile deep cushions with EXACTLY TWO wide seating cushions, contrasting brown piping trim along front edge and armrest contours, and TWO backrest sections (twin 2-unit seating division, strictly NOT a three-seater sofa, strictly NOT tall or narrow)`;
    } else if (primaryProduct?.role === 'sofa_3seat' || isHeroSofaDedicatedShot) {
      cleanProductName = `luxury three-seater power motion sofa in ${primaryColorEn} (${primaryMaterialEn})`;
    } else if (primaryProduct?.role === 'recliner_1seat') {
      cleanProductName = `ergonomic power motion recliner chair in ${primaryColorEn} (${primaryMaterialEn})`;
    } else if (primaryProduct?.role === 'lounge_chair' || primaryProduct?.name?.includes('无扶手') || primaryProduct?.name?.includes('休闲单椅')) {
      cleanProductName = `modern armless lounge accent chair in ${primaryColorEn} (${primaryMaterialEn}), low-profile armless silhouette, strictly NO footrest`;
    } else if (isDiningSuiteDedicatedShot || primaryProduct?.role === 'dining_table' || primaryProduct?.role === 'dining_chair') {
      cleanProductName = diningCandidate
        ? `luxury Italian black marble dining table with coordinated designer leather dining chairs, credenza sideboard, and mobile bar cart ensemble`
        : `grand open-plan living-dining vista showcasing the luxury power motion sofa`;
    } else {
      cleanProductName = `luxury power motion sofa in ${primaryColorEn} (${primaryMaterialEn})`;
    }

    // 1. 机位语义翻译器
    const cameraDirectives = ShootCompiler.translateCameraToDirectives(camera);

    // 2. 检测机位是否被用户微调自定义
    const defaultTemplate = STANDARD_SHOT_TEMPLATES.find((t) => t.code === shot.templateCode);
    const isCameraCustomized = Boolean(
      defaultTemplate &&
      (
        defaultTemplate.defaultCamera.lensMm !== camera.lensMm ||
        defaultTemplate.defaultCamera.heightCm !== camera.heightCm ||
        defaultTemplate.defaultCamera.yawDeg !== camera.yawDeg ||
        defaultTemplate.defaultCamera.pitchDeg !== camera.pitchDeg ||
        defaultTemplate.defaultCamera.framing !== camera.framing
      )
    );

    // 3. 针对各镜头模板构建“强约束置顶拍摄任务 (Shot Mandate)”
    let shotMandate = '';
    const negativeFramingConstraints: string[] = [...cameraDirectives.negativeExclusions];

    // 针对 2 人位沙发施加绝对排他约束：坚决杜绝大模型画成 3 人位或缩小成瘦高紧凑型
    if (primaryProduct?.role === 'sofa_2seat') {
      negativeFramingConstraints.push(
        'three-seater sofa',
        '3 seating cushions',
        '3 backrest cushions',
        'sectional couch',
        'middle seat cushion',
        'extra seating unit',
        'triple cushion sofa',
        'tall and narrow sofa',
        'vertically stretched couch',
        'squished proportions',
        'cramped seating width',
        'miniature sofa',
        'small sofa out of scale',
        'compressed width',
        'oversized vertical backrest',
        'missing contrasting piping cord'
      );
    }
    if (isFabricOrMicrofiber) {
      negativeFramingConstraints.push('glossy leather', 'shiny patent leather', 'cowhide texture');
    }

    // 全局功能位闭合状态铁律（每一组镜头严格执行）：
    // 所有镜头（每一组机位）无论是否有模特，默认产品功能位置（电动脚踏、展开位、后仰机械结构）必须保持关闭收起形态！
    // 坚决杜绝脚踏弹开、伸展或后仰展开。
    const isHumanPassActive = Boolean(shot.hasHumanPass);
    const isFunctionalClosed = input.functionalPositionState !== 'open';
    const functionalPostureMandate = isFunctionalClosed
      ? 'CRITICAL MANDATE (EVERY SHOT): ALL SOFA AND CHAIR FUNCTIONAL MOTION MECHANISMS STRICTLY REMAIN CLOSED, fully retracted, and neatly tucked flush under the base in standard upright seated configuration. Motorized footrests are completely closed and flush. Absolutely NO deployed footrest, NO extended leg rest, NO open recliner, NO reclining backrest'
      : 'FUNCTIONAL MOTION DIRECTIVE: Functional recliners and footrests may be opened if appropriate.';

    if (isFunctionalClosed) {
      negativeFramingConstraints.push(
        'deployed footrest',
        'extended footrest',
        'popped leg rest',
        'open recliner mechanism',
        'unretracted leg rest',
        'open motorized mechanism',
        'unfolded footrest',
        'reclining sofa',
        'extended foot stool',
        'deployed recliner',
        'popped-out foot support',
        'feet support deployed',
        'unfolded mechanism',
        'footrest sticking out',
        'reclined backrest',
        '展开的脚踏',
        '伸出的脚托',
        '功能位展开',
        '靠背倾斜后仰展开',
        '伸展的脚垫',
        '脚托弹出'
      );
    }

    if (shot.templateCode === 'A00') {
      const ceilingStr = spacePreset.ceilingHeight ? `${spacePreset.ceilingHeight}m high soaring ceiling volume` : 'grand architectural ceiling headroom';

      // 提取全部搭配单品（茶几、单人位功能椅、休闲单椅、边几），强制注入 A00 母版任务，坚决杜绝搭配品在全景中丢失
      const secondaryEnsembleDesc = secondaryProducts.map((p) => {
        const cEn = translateColorToEnglish(p.colors?.[0]);
        const mEn = translateMaterialToEnglish(p.materials?.[0], '', p.role);
        if (p.role === 'coffee_table') {
          return `center coffee table (${p.name || 'luxury coffee table'}) in ${mEn} (${cEn}) placed in front of sofa`;
        } else if (p.role === 'recliner_1seat') {
          return `matching power recliner armchair in ${cEn} (${mEn}) positioned on the flank`;
        } else if (p.role === 'lounge_chair') {
          return `matching armless accent lounge chair in ${cEn} (${mEn}) positioned on the side`;
        } else if (p.role === 'side_table') {
          return `matching side table in ${cEn}`;
        }
        return `${p.name} in ${cEn}`;
      }).filter(Boolean).join(', ');
      const ensembleClause = secondaryEnsembleDesc ? `, alongside the coordinated ensemble suite: [${secondaryEnsembleDesc}]` : '';

      if (isCameraCustomized) {
        shotMandate = `[SHOT MANDATE - A00 SCENE MASTER FOUNDATION (Adjusted ${camera.lensMm}mm/${camera.heightCm}cm)]: ${camera.lensMm}mm architectural baseline at ${camera.heightCm}cm height establishing the full spatial envelope of ${spacePreset.name} with ${ceilingStr}. Unify ${stylePreset.name} luxury interior finishes with the hero ${cleanProductName} anchored securely parallel against a continuous solid backdrop wall${ensembleClause}, side daylight windows, establishing authoritative visual ground truth.`;
      } else {
        shotMandate = `[SHOT MANDATE - A00 SCENE MASTER FOUNDATION]: 35mm architectural baseline at ${camera.heightCm}cm standing eye-level height establishing the full spatial envelope of ${spacePreset.name} with ${ceilingStr}. Unify ${stylePreset.name} luxury interior finishes with the hero ${cleanProductName} anchored securely parallel against a continuous solid backdrop wall${ensembleClause}, side daylight windows, establishing the authoritative visual ground truth for all subsequent shots.`;
      }
    } else if (shot.templateCode === 'A01') {
      const footrestMandate = isHumanPassActive
        ? 'with primary motion seat deployed for relaxed human occupancy'
        : 'with all motorized footrests on BOTH main sofa AND accent single chair strictly 100% CLOSED, RETRACTED FLUSH, and locked in pristine showroom condition';
      if (isCameraCustomized) {
        shotMandate = `[SHOT MANDATE - A01 GRAND FRONTAL ARCHITECTURAL PANORAMA (Customized ${camera.lensMm}mm/${camera.heightCm}cm)]: ${camera.lensMm}mm environmental architectural lens at ${camera.heightCm}cm eye-level height with STRICT 0-DEGREE STRAIGHT-ON FRONTAL AXIS in 4:3 horizontal aspect ratio. Two-point perspective with vertical plumb lines strictly straight. Architectural panorama capturing expansive open-plan horizontal living-dining flow: soaring cove-lit ceiling volume, full-span floor-to-ceiling panoramic glass windows on the left flank flooding space with 6000K cool daylight strictly preserving spatial master A00 daylight orientation, centered marble backdrop wall axis, complete 3+1 hero furniture suite (${cleanProductName}, designer coffee table, side chair, ${footrestMandate}), and generous luxury area rug anchoring the living ensemble into foreground alongside the white matte cylindrical planter coordinate origin. The vista extends smoothly into integrated dining area on right without empty foreground barrenness.`;
      } else {
        shotMandate = `[SHOT MANDATE - A01 GRAND FRONTAL ARCHITECTURAL PANORAMA (Studio Sample 35mm Grand Horizon)]: 35mm humanistic wide prime lens at 115cm eye-level standing/seated height with STRICT 0-DEGREE STRAIGHT-ON FRONTAL AXIS in 4:3 horizontal aspect ratio. Two-point perspective with perfectly vertical plumb lines. Centered architectural panorama capturing expansive open-plan living-dining flow: soaring cove-lit ceiling volume, full floor-to-ceiling panoramic glass window wall on left flank flooding space with 6000K cool daylight strictly matching spatial master A00 daylight orientation, centered marble backdrop wall axis, complete 3+1 hero furniture suite (${cleanProductName}, designer coffee table, side chair, ${footrestMandate}), and generous luxury area rug anchoring foreground alongside the white matte cylindrical planter coordinate origin. The open horizon extends seamlessly to right-side luxury dining suite with majestic spatial balance.`;
      }
      negativeFramingConstraints.push(
        'angled side shot',
        'diagonal camera view',
        'tilted perspective',
        'off-center vantage',
        'side isometric angle',
        'oblique camera',
        'corner view',
        'cramped room',
        'narrow field of view',
        'excessive empty wooden floor in foreground',
        'vast barren foreground floor void',
        'tiny distant furniture',
        'blank featureless white ceiling',
        'deployed footrest without people',
        'open recliner mechanism in empty room',
        'popped leg rest',
        'flipped room layout',
        'mirrored window position',
        'reversed daylight direction',
        'different room background',
        'altered wall finishes'
      );
    } else if (shot.templateCode === 'A02') {
      const sofaPostureMandate = isHumanPassActive
        ? 'luxury three-seater main sofa with family relaxation posture'
        : 'luxury three-seater main sofa with all motorized footrests completely closed and retracted in showroom posture';
      const perspectiveShiftDirective = `[MANDATORY PERSPECTIVE SHIFT: 45° THREE-QUARTERS OBLIQUE ANGLE]
Reference Image 2 (A00 Master) is a frontal view, BUT FOR SHOT A02 YOU MUST PHYSICALLY SWING THE CAMERA 40-45 DEGREES TO THE SIDE FOR A THREE-QUARTERS ISOMETRIC VIEW!
DO NOT RENDER A STRAIGHT-ON FRONTAL VIEW.`;

      if (isCameraCustomized) {
        shotMandate = `[SHOT MANDATE - A02 45-DEGREE 3+1 ENSEMBLE VIEW (Customized ${camera.lensMm}mm/${camera.heightCm}cm)]:
${perspectiveShiftDirective}
${camera.lensMm}mm lens at ${camera.heightCm}cm height, angled ${camera.yawDeg} degrees in 4:3 horizontal aspect ratio. Capture complete 3+1 furniture ensemble: ${sofaPostureMandate}, matching accent side chair, and center coffee table together in one cohesive living environment with dynamic diagonal perspective depth, floor diagonal vanishing lines, left-side window daylight sheen, and white matte cylindrical planter anchor.`;
      } else {
        shotMandate = `[SHOT MANDATE - A02 45-DEGREE 3+1 ENSEMBLE VIEW (Studio Sample 45mm 3+1 Living Ensemble)]:
${perspectiveShiftDirective}
45mm standard-wide prime lens at 115cm height with dynamic 40-to-45 degree side isometric perspective in 4:3 horizontal aspect ratio. Capture complete 3+1 furniture ensemble: ${sofaPostureMandate}, matching accent side chair, and center coffee table together in one unified spatial composition with rich perspective depth against architectural luxury backdrop, floor diagonal vanishing lines, left-side window daylight sheen, and white matte cylindrical planter anchor.`;
      }
      negativeFramingConstraints.push(
        'flat frontal mugshot',
        'straight-on camera',
        'symmetrical center sofa',
        'facing directly forward',
        'tight single product crop',
        'cropping out matching side chair',
        'cropping out main sofa',
        'isolated single chair'
      );
    } else if (shot.templateCode === 'A03') {
      const footrestMandate = isHumanPassActive
        ? 'with outer motorized footrests gently deployed and backrest reclined supporting parents and daughter relaxing in genuine warm family leisure'
        : 'with all motorized footrests and recliners completely RETRACTED AND CLOSED flush in pristine showroom condition';
      
      const linkageDirective = `[DUAL-TRACK LINKAGE: INDEPENDENT 3-SEATER ASSET RE-CREATION WITHIN MASTER SPATIAL ANCHOR]
- HERO SEATING ASSET: Strictly construct the hero sofa from the isolated 3-seater product asset ground truth (3 seating cushions, horizontal division, supple leather, flared comfort armrests). DO NOT inpaint or clone downscaled sofa pixels from any master panoramic image.
- SPATIAL & PLACEMENT ANCHOR: Lock the exact architectural room envelope, wall finishes, natural window daylight, and placement grid strictly from the spatial scene master A00. Maintain 100% architectural continuity with zero newly invented background elements!`;

      if (isCameraCustomized) {
        shotMandate = `[SHOT MANDATE - A03 HERO 3-SEATER LIVING FOCUS (Customized ${camera.lensMm}mm/${camera.heightCm}cm)]:
${linkageDirective}
Camera: ${camera.lensMm}mm lens at ${camera.heightCm}cm height with STRICT 0-DEGREE SYMMETRICAL FRONTAL AXIS in 4:3 horizontal aspect ratio. Centered directly on hero three-seater main sofa ${footrestMandate}, accompanied by center coffee table in foreground, aligned with symmetrical marble backdrop wall axis and dual curved sconces midline. STRICTLY FOCUS ON THE THREE-SEATER MAIN SOFA ALONE: completely crop out and exclude any separate side accent chair, lounge chair, or 3+1 ensemble arrangement!`;
      } else {
        shotMandate = `[SHOT MANDATE - A03 HERO 3-SEATER LIVING FOCUS (Studio Sample 50mm Standard Focus)]:
${linkageDirective}
Camera: 50mm portrait standard prime lens at 95cm eye-level height (level with sofa backrest, 0° tilt) with STRICT 0-DEGREE SYMMETRICAL FRONTAL AXIS in 4:3 horizontal aspect ratio. Frame tightly and comfortably ONLY around hero three-seater main sofa ${footrestMandate}, accompanied by center coffee table in foreground, aligned with symmetrical marble backdrop wall axis and dual curved sconces midline. Deep contact AO shadows ground the sofa and table. STRICTLY FOCUS ON THE THREE-SEATER MAIN SOFA ALONE: completely crop out, bypass, and exclude any separate side accent chair, single chair, or 3+1 ensemble! The three-seater sofa is the ONLY hero seating piece in this shot.`;
      }
      negativeFramingConstraints.push(
        'side chair',
        'accent chair',
        'armchair',
        'lounge chair',
        'single chair',
        '3+1 ensemble',
        'extra chair',
        'additional seating',
        'angled view',
        'wide empty room panorama',
        'far distant vantage',
        'camera centered on single accent chair',
        'framing the separate single chair',
        'cloning low-res sofa from master image',
        'inpainting distant sofa',
        'different room background',
        'altered wall finish'
      );
    } else if (shot.templateCode === 'A04') {
      const footrestMandate = isHumanPassActive
        ? 'with outer motion seat motorized footrest fully deployed supporting mother and daughter relaxing in heartwarming companion posture taking selfie or reading'
        : 'with all motorized footrests completely retracted and closed flush in pristine showroom condition (strictly unoccupied, empty room, zero human presence)';

      const lifestyleMoment = isHumanPassActive
        ? 'and intimate parent-child companion lifestyle moment with mother and daughter'
        : 'and pristine architectural interior harmony (strictly unoccupied showroom posture, zero humans, empty living room)';

      const footrestAction = isHumanPassActive ? 'deployed footrest' : 'retracted flush footrest';

      const linkageDirective = `[DUAL-TRACK LINKAGE: INDEPENDENT 3-SEATER ASSET RE-CREATION WITHIN MASTER SPATIAL ANCHOR]
- HERO 2/3 ASSET CROP: Strictly construct 2/3 of the hero motion sofa from the isolated 3-seater product asset ground truth (outer wide armrest, deep leather seating cushion, ${footrestAction}). DO NOT clone or stretch distant low-res master sofa pixels.
- SPATIAL & ORIENTATION ANCHOR: Lock the exact architectural background, wall finishes, window lighting direction, and floor texture strictly from the spatial scene master A00. Absolutely DO NOT reverse or mirror window positions, DO NOT flip room layout! Maintain 100% spatial environment continuity!`;

      if (isCameraCustomized) {
        shotMandate = `[SHOT MANDATE - A04 2/3 HERO SOFA COMPANION VIEW (Customized ${camera.lensMm}mm/${camera.heightCm}cm)]:
${linkageDirective}
Camera: ${camera.lensMm}mm portrait environmental lens at ${camera.heightCm}cm height with ${camera.pitchDeg} degree downward pitch and ${camera.yawDeg} degree oblique angle in 3:4 vertical aspect ratio. Frame approximately 2/3 of the hero motion sofa (${footrestMandate}), capturing wide seating depth, outer armrest contour, foreground play rug stage bathed in left window sheer curtain daylight, and white matte cylindrical planter anchor. ZERO side chair, ZERO coffee table obstruction.`;
      } else {
        shotMandate = `[SHOT MANDATE - A04 2/3 HERO SOFA COMPANION VIEW (Studio Sample 45mm Micro-Downward)]:
${linkageDirective}
Camera: 45mm portrait environmental prime lens at 140cm standing eye-level height with -15 degree downward pitch looking down onto the living area rug stage in 3:4 vertical aspect ratio. Frame approximately 2/3 of hero motion sofa (${footrestMandate}), capturing wide seating depth, outer armrest contour, ${footrestAction}, foreground play rug stage bathed in left window sheer curtain daylight, ${lifestyleMoment}, and white matte cylindrical planter anchor. ZERO side chair, ZERO coffee table obstruction!`;
      }
      negativeFramingConstraints.push(
        'flat frontal view',
        'full sofa 100% wide panorama',
        'isolated single chair',
        'separate recliner chair',
        'coffee table blocking foreground',
        'stiff emotionless posing',
        'wide empty room',
        'cloning low-res sofa from master image',
        'inpainting distant sofa',
        'different room background',
        'altered wall finish',
        'flipped room layout',
        'mirrored window position',
        'reversed daylight direction'
      );
    } else if (shot.templateCode === 'A05') {
      const footrestMandate = isHumanPassActive
        ? 'with the right motion seat motorized footrest smoothly deployed supporting an elegant lady in light dress holding a red wine glass in private lounge relaxation posture'
        : 'with all motorized footrests completely retracted and closed flush in pristine showroom condition (strictly unoccupied, empty room, zero human presence)';

      const lifestyleMoment = isHumanPassActive
        ? 'and private luxury lounge moment with elegant lady'
        : 'and sophisticated architectural living ambiance (strictly unoccupied showroom posture, zero humans, empty living room)';

      const footrestAction = isHumanPassActive ? 'deployed footrest' : 'retracted flush footrest';

      const linkageDirective = `[DUAL-TRACK LINKAGE: INDEPENDENT 3-SEATER ASSET RE-CREATION WITHIN MASTER SPATIAL ANCHOR]
- HERO 2/3 ASSET CROP: Strictly construct 2/3 of the hero motion sofa from the isolated 3-seater product asset ground truth (right outer armrest featuring diamond-quilted leather craftsmanship with flush circular metal motion buttons, deep leather seating cushion, ${footrestAction}). DO NOT clone or stretch distant low-res master sofa pixels.
- SPATIAL & WALL FINISH ANCHOR: Lock the architectural background, feature wall materials, cove lighting, and tailored carpet strictly from the spatial scene master A00. Zero tolerance for background drift! Strictly DO NOT invent unreferenced wall niches, built-in bookcases, or arched display shelves!`;

      if (isCameraCustomized) {
        shotMandate = `[SHOT MANDATE - A05 2/3 HERO SOFA PRIVATE LOUNGE VIEW (Customized ${camera.lensMm}mm/${camera.heightCm}cm)]:
${linkageDirective}
Camera: ${camera.lensMm}mm portrait environmental lens at ${camera.heightCm}cm height with ${camera.yawDeg} degree right angle in 3:4 vertical aspect ratio. Frame approximately 2/3 of the hero motion sofa (${footrestMandate}), capturing right armrest with diamond quilting detail, metal trim accent, brass closure strip anchor, and warm 3000K ambient wall sconce. ZERO side chair, ZERO coffee table obstruction.`;
      } else {
        shotMandate = `[SHOT MANDATE - A05 2/3 HERO SOFA PRIVATE LOUNGE VIEW (Studio Sample 50mm Private Lounge)]:
${linkageDirective}
Camera: 50mm portrait environmental prime lens at 95cm height (seated eye-level slightly low, 0° tilt) with 28 degree right oblique perspective in 3:4 vertical aspect ratio. Frame approximately 2/3 of hero motion sofa (${footrestMandate}), capturing right armrest with diamond quilting detail, flush metal trim, brass closure strip anchor, ${footrestAction}, deep seating cushion, ${lifestyleMoment}, and warm 3000K ambient wall sconce from A00. ZERO side chair, ZERO coffee table obstruction!`;
      }
      negativeFramingConstraints.push(
        'flat frontal view',
        'full sofa 100% wide panorama',
        'isolated single chair',
        'separate recliner chair',
        'coffee table blocking foreground',
        'stiff emotionless posing',
        'wide empty room',
        'cloning low-res sofa from master image',
        'inpainting distant sofa',
        'different room background',
        'altered wall finish',
        'arched shelves',
        'bookshelf',
        'bookcase',
        'wall niche',
        'built-in shelving',
        'library wall'
      );
    } else if (shot.templateCode === 'A06') {
      const closedZeroWallMandate =
        'hero sofa strictly remains in standard pristine CLOSED upright configuration: motorized footrests are completely retracted and tucked underneath the base, backrest upright in standard closed form, ZERO deployed footrest, strictly closed showroom posture flush against the solid backdrop wall (<5cm gap)';

      const linkageDirective = `[DUAL-TRACK LINKAGE: INDEPENDENT 3-SEATER ASSET RE-CREATION WITHIN MASTER SPATIAL ANCHOR]
- HERO MECHANISM ASSET (FLUSH-TO-WALL CLOSED POSTURE): Strictly construct the hero sofa from the isolated 3-seater product asset ground truth. Showcase MANWAH signature ZERO-WALL CLEARANCE architecture IN LIVING ROOM DISPLAY: the sofa is positioned flush against the EXACT SAME continuous solid architectural backdrop feature wall from A00 with virtually ZERO gap (<5cm flush alignment) against the wall! This is strictly the living room feature wall, strictly NOT a study room or library! The functional positions strictly remain CLOSED with footrests fully tucked in and backrest upright in standard closed showroom posture. Full side profile highlights the exterior armrest covered in diamond-quilted leather craftsmanship with circular metal buttons and neat bottom trim. DO NOT clone low-res master sofa pixels.
- SPATIAL & PLACEMENT ANCHOR: Lock the architectural background wall, window lighting direction, and floor finishes strictly from the spatial scene master A00.`;

      if (isCameraCustomized) {
        shotMandate = `[SHOT MANDATE - A06 ZERO-WALL CLEARANCE PROFILE VIEW (Customized ${camera.lensMm}mm/${camera.heightCm}cm)]:
${linkageDirective}
Camera: ${camera.lensMm}mm lens at ${camera.heightCm}cm seated eye-level height with ${camera.yawDeg} degree lateral profile angle in 4:3 horizontal aspect ratio. Showcase MANWAH signature ZERO-WALL CLEARANCE in living room setting: hero sofa flush against the backdrop wall with zero gap (<5cm) (${closedZeroWallMandate}), highlighting full side armrest diamond-quilted craftsmanship, circular metal button, vertical plumb lines, and window daylight backdrop from A00.`;
      } else {
        shotMandate = `[SHOT MANDATE - A06 ZERO-WALL CLEARANCE PROFILE VIEW (Studio Sample 60mm Pure Lateral Profile)]:
${linkageDirective}
Camera: 60mm telephoto lateral profile lens at 90cm seated eye-level height with 85-to-90 degree side profile perspective in 4:3 horizontal aspect ratio. Two-point perspective with vertical plumb lines strictly perpendicular. Showcase MANWAH signature ZERO-WALL CLEARANCE in living room setting: hero sofa flush against the solid backdrop wall with zero gap (<5cm) (${closedZeroWallMandate}), highlighting full side armrest diamond-quilted craftsmanship, circular metal button, and window daylight backdrop from A00.`;
      }
      negativeFramingConstraints.push(
        'flat frontal angle',
        'sofa gap away from wall',
        'large gap between sofa backrest and wall',
        'detached from back wall',
        'floating sofa off wall',
        'wide angle perspective distortion',
        'deployed footrest',
        'extended footrest',
        'open recliner mechanism',
        'reclined backrest',
        'popped leg rest',
        'stiff emotionless posing',
        'crooked perspective',
        'cloning low-res sofa from master image',
        'inpainting distant sofa',
        'different room background',
        'altered wall finish',
        'bookshelf',
        'bookcase',
        'library wall',
        'study room',
        'office',
        'books',
        'wooden wall of shelves'
      );
    } else if (shot.templateCode === 'A07') {
      if (isCameraCustomized) {
        shotMandate = `[SHOT MANDATE - A07 ENSEMBLE LIVING COMPOSITION (Customized ${camera.lensMm}mm/${camera.heightCm}cm)]: ${camera.lensMm}mm lens at ${camera.heightCm}cm height with ${camera.pitchDeg} degree tilt in 4:3 horizontal aspect ratio. Medium living ensemble grouping capturing hero sofa in midground, luxury marble center coffee table and dark side accent table in foreground highlighting the golden height drop between the 450mm marble table and 400mm sofa seat, carpet geometric pattern anchor, foliage shadow falloff anchor, and deep contact AO shadows, bathed in natural daytime window daylight and soft 3000K ceiling cove ambient illumination from A00.`;
      } else {
        shotMandate = `[SHOT MANDATE - A07 ENSEMBLE LIVING COMPOSITION (Studio Sample 55mm Medium Ensemble)]: 55mm medium telephoto prime lens at 95cm height with -35 degree oblique angle and -5 degree downward tilt in 4:3 horizontal aspect ratio. Medium living ensemble grouping capturing hero sofa in midground, luxury marble center coffee table and dark side accent table in foreground highlighting the golden height drop between the 450mm marble table and 400mm sofa seat, carpet geometric pattern anchor, foliage shadow falloff anchor, and deep contact AO shadows, bathed in natural daytime window daylight and soft 3000K ceiling cove ambient illumination from A00, creating a warm cohesive conversation living space with rich material layering.`;
      }
      negativeFramingConstraints.push(
        'far distance view',
        'wide empty room',
        'messy foreground',
        'flat frontal mugshot',
        'night',
        'nighttime',
        'dark room',
        'evening shadows',
        'moody night lighting'
      );
    } else if (shot.templateCode === 'A08') {
      const postureMandate = isHumanPassActive
        ? 'with motorized footrest gently deployed supporting lady comfortably browsing a tablet/iPad in 110-120 degree ergonomic reading posture'
        : (isFunctionalClosed
            ? 'with motorized footrest completely retracted, closed, and tucked flush under base in pristine showroom upright configuration (strictly zero deployed footrest, closed flush)'
            : 'with motorized footrest fully deployed showcasing ergonomic 5-mode contour in pristine unoccupied showroom condition (strictly empty room, zero human presence)');

      const lifestyleMomentA08 = isHumanPassActive
        ? 'and personal sanctuary lifestyle'
        : 'and personal luxury sanctuary in an unoccupied living space (strictly zero humans)';

      const linkageDirective = `[DUAL-TRACK LINKAGE: INDEPENDENT RECLINER ASSET RE-CREATION WITHIN MASTER SPATIAL ANCHOR]
- HERO RECLINER CHAIR ASSET: Strictly construct the power recliner chair from the isolated product asset ground truth (genuine leather, diamond-quilted exterior armrest panels, circular metallic control buttons, high-resilience ergonomic headrest and fully deployed motorized footrest). DO NOT clone or stretch distant low-res master pixels.
- SPATIAL & PLACEMENT ANCHOR: Lock the architectural background, natural daylight direction, and tailored area rug strictly from the spatial scene master A00. Positioned comfortably in the master open living room zone of A00 on the area rug, with the three-seater main sofa off-frame or non-intrusive. Strictly FORBID moving the chair into a hallway, corridor, or entry foyer!`;

      if (isCameraCustomized) {
        shotMandate = `[SHOT MANDATE - A08 RECLINER 5-MODE FUNCTION SHOWCASE (Adjusted ${camera.lensMm}mm/${camera.heightCm}cm)]:
${linkageDirective}
Camera: ${camera.lensMm}mm lens at ${camera.heightCm}cm height with fixed ${camera.yawDeg} degree three-quarters angle in 4:3 horizontal aspect ratio. Dedicated single power recliner motion showcase in the open living room of A00 on area rug, demonstrating MANWAH multi-mode ergonomics (${postureMandate}), window daylight shadow boundary, and deep contact AO shadows grounding the recliner.`;
      } else {
        shotMandate = `[SHOT MANDATE - A08 RECLINER 5-MODE FUNCTION SHOWCASE (Studio Sample 50mm Golden Diagonal)]:
${linkageDirective}
Camera: 50mm environmental portrait prime lens at 95cm eye-level seated height with fixed 35-to-40 degree golden diagonal perspective in 4:3 horizontal aspect ratio. Dedicated single power recliner motion showcase in the open spacious living room of A00 on the area rug, demonstrating MANWAH multi-mode ergonomics (${postureMandate}), window daylight shadow boundary, and deep contact AO shadows grounding the recliner against consistent window daylight and architectural finishes.`;
      }
      negativeFramingConstraints.push(
        'shifting camera angle',
        'distant room clutter',
        'different recliner chair',
        'three-seater sofa centered in frame',
        'three-seater sofa blocking recliner',
        'cloning low-res sofa from master image',
        'inpainting distant sofa',
        'different room background',
        'altered wall finish',
        'hallway',
        'corridor',
        'doorway',
        'foyer',
        'door frame',
        'passageway',
        'entryway',
        'white door frame'
      );
    } else if (shot.templateCode === 'A09') {
      if (diningCandidate) {
        const linkageDirective = `[DUAL-TRACK LINKAGE: INDEPENDENT DINING SUITE ASSET RE-CREATION WITHIN MASTER SPATIAL ANCHOR]
- HERO DINING SUITE ASSETS: Strictly construct the dining ensemble from the isolated dining suite product asset ground truth (luxurious rectangular dining table with matching tailored leather dining chairs, coordinating credenza sideboard, and modern bar cart). DO NOT clone low-res master sofa pixels, and STRICTLY EXCLUDE three-seater main sofa from center frame!
- SPATIAL & PLACEMENT ANCHOR: Lock the architectural background, flooring, and natural window lighting direction strictly from the spatial scene master A00 open-plan layout.`;

        if (isCameraCustomized) {
          shotMandate = `[SHOT MANDATE - A09 DINING SUITE ENSEMBLE VIEW (Customized ${camera.lensMm}mm/${camera.heightCm}cm)]:
${linkageDirective}
Camera: ${camera.lensMm}mm architectural lens at ${camera.heightCm}cm standing eye-level height with STRICT 0-DEGREE SYMMETRICAL FRONTAL AXIS in 4:3 horizontal aspect ratio. Capture grand integrated dining suite: expansive luxury dining table with matching tailored leather dining chairs, architectural credenza sideboard, bathed in natural window daylight, showcasing complete open-plan living-dining high-end lifestyle from A00.`;
        } else {
          shotMandate = `[SHOT MANDATE - A09 DINING SUITE ENSEMBLE VIEW (Studio Sample 40mm Frontal Dining Flat)]:
${linkageDirective}
Camera: 40mm architectural prime lens at 115cm standing eye-level height with STRICT 0-DEGREE SYMMETRICAL FRONTAL AXIS in 4:3 horizontal aspect ratio. Capture grand integrated dining suite: expansive luxury dining table with matching tailored leather chairs, architectural credenza sideboard with lamp and art painting against consistent right wall from A00, elegant champagne bar cart, bathed in natural window daylight, showcasing complete open-plan living-dining luxury lifestyle.`;
        }
        negativeFramingConstraints.push(
          'three-seater sofa centered in frame',
          'main sofa taking center stage',
          'living room sofa occupying dining table position',
          'kitchen sink',
          'cramped room',
          'messy clutter',
          'distorted chair legs'
        );
      } else {
        // 未录入餐桌套系：自适应为客餐贯通大平层全景，以主沙发为视觉核心，严禁凭空造物！
        shotMandate = `[SHOT MANDATE - A09 OPEN-PLAN LIVING-DINING VISTA (Integrated Architecture Perspective)]:
[DUAL-TRACK LINKAGE: CONTINUOUS OPEN-PLAN SPATIAL PERSPECTIVE]
- HERO SOFA IN DEEP VISTA: Reference Image 1 provides the primary MANWAH sofa asset. In this grand continuous living-dining architectural vista, the primary sofa remains the grounded visual anchor across the open lifestyle floor plan.
- SPATIAL CONTINUITY: Camera is positioned along the dining-living axis with strict 0-degree frontal view in 4:3 horizontal aspect ratio, looking through the generous open-plan layout towards the main living salon of A00.
- ABSOLUTE PROHIBITION ON HALLUCINATED DINING SETS: DO NOT invent random non-MANWAH dining tables, DO NOT generate generic dining chairs, and DO NOT obstruct the open architectural living vista with unreferenced furniture!`;
        negativeFramingConstraints.push(
          'hallucinated dining table',
          'invented dining chairs',
          'random dinner table cluttering the room',
          'kitchen sink',
          'cramped room',
          'disconnected room',
          'altered wall finish'
        );
      }
    } else {
      shotMandate = `[SHOT MANDATE - ${shot.templateCode} CUSTOM FOCUS]: Dedicated commercial catalog shot with ${cameraDirectives.framingDirective}, camera positioned at ${camera.heightCm}cm height, ${camera.lensMm}mm lens, ${camera.yawDeg}° yaw angle.`;
    }

    // 4. 镜头意图描述 (Shot Intent)
    const intentClauses: string[] = [
      `shot aesthetic goal: ${intent.name}`,
      `subject emphasis: ${intent.productDominancePct}% visual prominence on ${cleanProductName}`,
      `background treatment: ${intent.backgroundSuppression} background suppression`
    ];

    // 5. 必须包含与材质真值 (若未激活模特通道，严格过滤掉涉及人员/乘坐者的词条)
    const filteredMustInclude = (camera.mustInclude || []).filter((item) => {
      if (!isHumanPassActive) {
        return !/(occupants|occupant|people|person|human|lifestyle_posture)/i.test(item);
      }
      return true;
    });

    const mustIncludeClauses: string[] = [
      ...filteredMustInclude,
      primaryColorEn,
      primaryMaterialEn
    ];

    // 6. 搭配产品覆盖指令
    const secondaryClauses: string[] = [];
    for (const sec of secondaryProducts) {
      const secColorEn = translateColorToEnglish(sec.colors?.[0], 'pristine polar milk-white');
      const secMatEn = translateMaterialToEnglish(sec.materials?.[0], 'genuine top-grain semi-aniline leather', sec.role);
      const compositeInfo = resolveCompositeMaterialDna(sec.materials?.[0] || sec.name, sec.role);
      mustIncludeClauses.push(secColorEn, secMatEn);

      const isChairFabric = /fabric|cloth|microfiber|woven|linen|textile|麻|布/i.test(
        `${sec.materials?.join(' ') || ''} ${sec.name || ''}`
      );
      const chairUpholsteryClause = isChairFabric
        ? 'textured upholstery fabric'
        : `genuine top-grain semi-aniline cowhide leather in ${secColorEn}`;

      const isNonFunctionalOrArmless =
        (sec.role === 'lounge_chair' || sec.functionCapable === false) &&
        !/(功能|电动|头等舱|展开|太空舱|大师)/.test(sec.name || '');

      if (isNonFunctionalOrArmless) {
        secondaryClauses.push(
          `MANDATORY MATCHING ACCENT CHAIR: authentic modern armless lounge chair (${sec.name}) in ${secColorEn} (${secMatEn}), low-profile minimalist block seating, ${chairUpholsteryClause}, sleek swivel or stationary base, strictly NO armrests, strictly NO extended footrest, strictly NO electric motion mechanism`
        );
        negativeFramingConstraints.push(
          'bulky recliner footrest on lounge chair',
          'bulky recliner footrest',
          'deployed footrest',
          'extended footrest',
          'thick armrests on armless chair',
          'power recliner buttons',
          'motorized reclining mechanism',
          'floral pattern armchair',
          'patterned fabric chair',
          'patchwork chair',
          'mismatched printed fabric'
        );
      } else if (sec.role === 'recliner_1seat' || /(大师|单人|单椅|头等舱)/.test(sec.name || '')) {
        secondaryClauses.push(
          `MANDATORY MATCHING ARMCHAIR: authentic MANWAH power recliner armchair in ${secColorEn} ${secMatEn} matching secondary product reference${sec.sourceMasterImageUrl ? ' with lighting directly harmonized from master suite ensemble' : ''}`
        );
        negativeFramingConstraints.push(
          'floral pattern armchair',
          'patterned fabric chair',
          'patchwork armchair',
          'mismatched printed fabric'
        );
      } else if (sec.role === 'coffee_table') {
        secondaryClauses.push(
          `MANDATORY CENTER TABLE: authentic luxury center coffee table (${sec.name || 'center coffee table'}) in ${secMatEn} (${secColorEn}). CRAFTSMANSHIP & COMPOSITE MATERIAL DIRECTIVES: ${compositeInfo.craftsmanshipDirective}${sec.sourceMasterImageUrl ? ' coordinated with suite master design' : ''}`
        );
        if (compositeInfo.antiStickerNegative) {
          negativeFramingConstraints.push(compositeInfo.antiStickerNegative);
        }
      } else if (sec.role === 'side_table') {
        secondaryClauses.push(
          `MANDATORY ACCENT SIDE TABLE: architectural side table (${sec.name || 'side table'}) in ${secMatEn} (${secColorEn}). CRAFTSMANSHIP DIRECTIVES: ${compositeInfo.craftsmanshipDirective}`
        );
        if (compositeInfo.antiStickerNegative) {
          negativeFramingConstraints.push(compositeInfo.antiStickerNegative);
        }
      } else if (sec.ensembleRoleTitle || sec.sourceMasterImageUrl) {
        secondaryClauses.push(
          `COHERENT SUITE ENSEMBLE COMPONENT: ${sec.ensembleRoleTitle || sec.name} in ${secColorEn} ${secMatEn} anchoring spatial hierarchy derived from master reference image`
        );
      }
    }

    // 7. 空间与风格基准
    const placementClauses = input.blueprint?.items
      ? input.blueprint.items.map((item) => {
          const matchingProd = activeProducts.find((p) => p.role === item.role);
          const cEn = matchingProd ? translateColorToEnglish(matchingProd.colors?.[0]) : '';
          const isChairNonFunc =
            matchingProd?.role === 'lounge_chair' ||
            matchingProd?.functionCapable === false ||
            (matchingProd?.name && /(休闲|无扶手|矮椅|旋转|单椅|焦糖)/.test(matchingProd.name) && !/(功能|电动|头等舱|展开|太空舱)/.test(matchingProd.name));

          const itemTag = item.role === 'sofa_3seat'
            ? `hero sectional sofa in ${primaryColorEn}`
            : (item.role === 'recliner_1seat' || item.role === 'lounge_chair')
            ? (isChairNonFunc
                ? `accent armless lounge chair in ${cEn || 'caramel brown'}`
                : `accent power recliner chair in ${cEn || 'pristine polar milk-white'}`)
            : item.role === 'coffee_table'
            ? `natural stone coffee table`
            : 'furniture element';
          return `${itemTag} securely anchored at zone ${item.zoneId}`;
        })
      : [];

    // 空间户型建筑特征全面解构 (Architecture DNA)
    const spaceFragments = spacePreset.promptFragments || [];
    const spaceArchitectureClauses = [
      `space prototype anchor: ${spacePreset.name} (${spacePreset.code})`,
      spacePreset.ceilingHeight ? `${spacePreset.ceilingHeight}m soaring architectural ceiling headroom` : '',
      ...spaceFragments,
      ...(spacePreset.signatureFeatures ? spacePreset.signatureFeatures.map((f) => `architectural feature: ${f}`) : [])
    ].filter(Boolean);

    // 美学硬装真实材质与空间色调解构 (Interior Material System & Dominant Palette)
    const styleDna = compileStyleDnaToEnglish(stylePreset);
    const styleFragments = stylePreset.promptFragments || [];
    const styleClauses = [
      `design style harmony: ${stylePreset.name} aesthetic`,
      ...styleFragments,
      `spatial color harmony: ${styleDna.dominantColorTone}`,
      `architectural finishes: ${styleDna.materialFinishes}`,
      `ambient lighting: ${styleDna.atmosphericLighting}`
    ].filter(Boolean);

    const sceneMasterHeritage = [
      ...spaceArchitectureClauses,
      ...styleClauses,
      ...placementClauses
    ];

    // 空间一致性四大金科玉律 (Four Spatial Invariance Pillars)
    const fourInvariancePillars = [
      'SPATIAL INVARIANCE ANCHOR: white matte cylindrical planter with indoor foliage plant serving as immutable physical coordinate origin (constant height and distance from window and backdrop wall)',
      'DUAL-TEMPERATURE LIGHTING CONSISTENCY: dominant cool daylight (6000K) streaming exclusively from the left panoramic window flank, paired with warm ambient cove lighting and wall sconces (3000K) illuminating the interior, casting consistent soft eastward diagonal contact shadows',
      'CONTACT SHADOW & AO: deep physical ambient occlusion contact shadows grounding all furniture legs, metal table frames, and recliner chassis firmly onto the area rug, completely eliminating floating sticker artifact',
      'TWO-POINT ARCHITECTURAL PERSPECTIVE: plumb vertical architectural lines with vertical shift correction (tilt angle = 0 degrees), window mullions and wall corners strictly parallel to vertical frame edges'
    ];

    // 8. 画幅比例构图强化指令 (Aspect Ratio Composition Mandate)
    const activeAspectRatio: ImageAspectRatio = input.aspectRatio || shot.aspectRatio || '4:3';
    const aspectDirective = activeAspectRatio === '16:9'
      ? 'cinematic 16:9 widescreen composition, expansive panoramic horizontal balance'
      : activeAspectRatio === '3:4'
      ? 'proportional 3:4 vertical editorial composition, elegant vertical framing'
      : activeAspectRatio === '1:1'
      ? 'harmonious 1:1 square architectural composition'
      : activeAspectRatio === '9:16'
      ? 'vertical 9:16 mobile story portrait composition'
      : activeAspectRatio === '2:3'
      ? 'proportional 2:3 vertical catalog composition'
      : 'proportional 4:3 classic commercial catalog composition';

    // 核心组合：机位景别 + 构图画幅 + 空间主色调强约束置顶 + 产品与空间搭配 + 空间一致性四大定律
    const positivePrompt = [
      shotMandate,
      ...cameraDirectives.semanticClauses,
      cameraDirectives.framingDirective,
      aspectDirective,
      functionalPostureMandate,
      styleDna.styleMandateClause,
      ...fourInvariancePillars,
      ...intentClauses,
      ...mustIncludeClauses,
      ...secondaryClauses,
      ...sceneMasterHeritage,
      !isHumanPassActive ? 'pure unoccupied architectural space, pristine showroom furniture presentation, zero human presence, clean empty sofa seat cushions strictly without decorative throw pillows or loose cushions' : '',
      'commercial furniture catalog masterpiece, authentic luxury materiality, razor sharp optical clarity, clean composition, completely free of any text, words, Chinese characters, watermark, or labels, 8k crisp resolution'
    ].filter(Boolean).join(', ');

    const humanExclusionNegative = !isHumanPassActive
      ? [
          'people, human, person, man, woman, lady, girl, boy, child, children, baby, human model, models, occupants, crowd, face, hands, human body, human silhouette, distorted limbs'
        ]
      : [];

    const negativePrompt = [
      ...humanExclusionNegative,
      ...negativeFramingConstraints,
      'throw pillow, throw pillows, decorative pillow, decorative pillows, sofa pillow, accent pillow, patterned cushion, floral cushion, cloth pillow, extra cushions on sofa, geometric patterned cushions, blanket on sofa, loose fabric on sofa, clutter on seating',
      'different room background, altered architectural layout, flipped room orientation, mirrored window, window on wrong side, reversed daylight direction, invented wall shelves, arched bookshelf, unreferenced bookcase, hallway or corridor view, doorway framing, nighttime dark atmosphere in daytime space',
      'physically moved furniture positions, shifted sofa coordinates',
      'deformed sofa structure, distorted perspective distortion, warped straight lines',
      'sofa overlapping window and wall seam, sofa blocking window glass, discontinuous backdrop behind sofa, crooked sofa angle, mismatched perspective alignment, sofa floating off floor grid, sofa angled awkwardly against walls',
      'fake marble sticker, printed marble foil, cheap laminate table, repeating stone pattern, vinyl sticker wrap, blurred inkjet veins, flat plastic surface, peeling sticker edges, dull melamine slab, plastic textures, cheap laminate, cartoon CGI rendering, overexposed highlights',
      'mismatched wall colors, wrong architectural palette, generic sterile white room without intended style color tone, garish neon colors',
      'text, watermark, logo, letters, chinese characters, words, subtitles, labels, annotations, captions, tags, price tags, graphic overlays, typography, font, UI elements',
      ...(camera.mustExclude || []),
      ...(stylePreset.negativeRules || [])
    ].filter(Boolean).join(', ');

    return {
      shotCode: shot.templateCode,
      roomName: spacePreset.name.split(' (')[0],
      spaceCode: spacePreset.code,
      styleName: stylePreset.name.split(' (')[0],
      styleCode: stylePreset.code,
      aspectRatio: activeAspectRatio,
      positivePrompt,
      negativePrompt,
      shotSpecificMandate: shotMandate,
      negativeFramingConstraints,
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
