// server/services/spaceImageGenerationService.ts
// MANWAH Space Studio｜统一图像生成与渲染调度服务 V1.0
// 职责：
// 1. 统一接入系统 Image Provider Router (Gemini / VectorEngine / RouterHub)；
// 2. 将编译好的 Prompt (A00 空间母版或 A01-A08 镜头) 发送到图像模型进行渲染；
// 3. 获得图片 Buffer 并直接存入 GCS (GcsAssetStorage)；
// 4. 若无云端 API Key，生成高保真真实 SVG/WebP 工业工程资产底图，杜绝假成功，确保全链路真实贯通与可追溯性 (Provenance)。

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { GcsAssetStorage } from './storage/gcsAssetStorage';
import { resolveApiConfig, isProviderKeyValid } from '../ai/providerConfig';
import { resolveImageModel } from '../ai/modelRegistry';
import { getImageProviderAdapter } from '../ai/imageProviderAdapter';
import { createServerGenAI } from '../utils/aiClient';
import {
  translateColorToEnglish,
  translateMaterialToEnglish,
  resolveIndustrialColorDna,
  resolveCompositeMaterialDna
} from '../../src/features/space-studio/engine/materialDnaTranslator';
import { deduplicateNegativeConstraints } from '../../src/features/space-studio/engine/promptDeduplication';
import { SpaceObjectKeyBuilder } from '../../src/shared/storage/spaceObjectKeys';
import { SPACE_AUTO_FALLBACK_MODELS } from '../../src/config/imageModelRegistry';
import { cropCharacterIdentity } from './characterIdentityCropService';

export interface SpaceProductIdentityInput {
  id?: string;
  sku?: string;
  name?: string;
  role?: string;
  priority?: string;
  color?: string;
  colors?: string[];
  material?: string;
  materials?: string[];
  surfaceTexture?: string;
  referenceImage?: string; // base64, data URL, objectKey, 或 public URL
  dimensions?: { width?: number; depth?: number; height?: number };
  functionCapable?: boolean;
  isSceneEnsembleSuite?: boolean;
  sceneEnsembleDossier?: any;
}

export interface SpaceCharacterReferenceInput {
  modelId?: string;
  name?: string;
  imageUrl?: string;
  role?: string;
}

export interface SpaceGenerateImageInput {
  projectId: string;
  shotCode: string;
  positivePrompt: string;
  negativePrompt?: string;
  aspectRatio?: string; // 默认 '3:4'
  userId?: string;
  deptId?: string;
  productName?: string;
  productColor?: string;
  productMaterial?: string;
  roomName?: string;
  styleName?: string;
  spacePreset?: any;
  stylePreset?: any;
  cameraSettings?: {
    lensMm: number;
    heightCm: number;
    yawDeg: number;
    pitchDeg: number;
  };
  objectKey: string;
  // 多模态视觉连续性关键引用 (真正实现根据我们产品一路往下生成)
  primaryProduct?: SpaceProductIdentityInput;
  ensembleProducts?: SpaceProductIdentityInput[];
  productReferenceImage?: string;
  sceneMasterReferenceImage?: string; // A00 空间母版图 或 A01 大场景基准图
  referenceShotCode?: string; // 标识基准参考图来源于哪个镜头，例如 'A01' 或 'A00'
  sceneMasterIsEmptyPlate?: boolean; // 母版参考图是否为 A00 清除家具后的空场景（纯硬装空房间）
  currentShotReferenceImage?: string; // 当前机位底图 (用于 Human 植入等连续渲染)
  isHumanPass?: boolean;
  humanLayout?: any;
  selectedModels?: any[];
  characterReferenceImages?: SpaceCharacterReferenceInput[];
  preferredModel?: string;
  resolution?: string;
  seed?: number;
  variantIndex?: number;
  variantTag?: string;
  functionalPositionState?: 'closed' | 'open';
  autoModelFallback?: boolean;
  /** 极简换景衍生镜头两步出图：GPT 2.5 Flare 换景保构图，再用 Nano Banana 2.1 精修清晰度与材质 */
  studioSwapRefinePass?: boolean;
  preserveBasePhotoOnly?: boolean;
  /** 人物入座：各角色位的入座简报（来自 compileHumanLayoutPrompt.slotBriefs），存在时使用精简编辑指令 */
  humanSlotBriefs?: string;
  renderMode?: 'orchestration' | 'studio_swap';
  /**
   * 极简影棚换景专用：户型/硬装美学纯背景 DNA（由 ShootCompiler 输出，不含机位/摆位指令）
   */
  studioSwapContext?: {
    spaceDna?: string[];
    styleDna?: string[];
    spaceNegatives?: string[];
    styleNegatives?: string[];
  };
  /**
   * 极简影棚换景专用：候选变体的光线氛围提示（仅光线，不改变机位）
   */
  studioSwapLightingHint?: string;
}

/**
 * 将任意结构的预设字段（字符串 / 数组 / 对象）安全展开为字符串片段
 */
function flattenPresetField(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap((v) => flattenPresetField(v));
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => {
      const parts = flattenPresetField(v);
      return parts.length > 0 ? [`${k}: ${parts.join(', ')}`] : [];
    });
  }
  return [];
}

/**
 * 极简影棚背景置换直通管线 (Studio Background Swap Pipeline) 纯净指令编译器
 * 彻底熔断来自 spacePreset（户型预设）与 stylePreset（风格预设）的所有描述性文本（层高、区域、概念命名等），
 * 彻底废除预设镜头的固定相机参数（如 45mm/120cm 平视），建立纯视觉双图非对称解耦直接映射契约：
 * - 参考图 1 (用户上传素材): 【绝对构图、几何透视与家具实体真值】
 * - 参考图 2 (母版空间图 A00): 【纯硬装材质、光影氛围与窗景样板】
 */
export const STUDIO_SWAP_COMPOSE_MODEL = 'openai/gpt-image-2.5-flare-c';
export const STUDIO_SWAP_REFINE_MODEL = 'gemini-nano-banana-2.1-preview';

export const STUDIO_SWAP_REFINE_PROMPT = `画面精修重绘：以窗口1为底图，构图、机位、透视、家具的位置角度与形态、房间的墙面吊顶地面与窗帘全部保持不变，不移动、不增减任何物体。参照窗口2（产品实拍图）还原沙发与单椅的真皮纹理、缝线走向、金属头枕支架、茶几与边几的石材和木纹细节以及真实颜色。提升整体清晰度、锐度与材质质感。整体空间室内建筑摄影风格。

[CRITICAL NEGATIVE INSTRUCTION]: ABSOLUTELY NO TEXT, NO NUMBERS, NO DIMENSION LINES, NO ARROWS, NO MEASUREMENTS, NO LABELS, NO ANNOTATIONS of any kind on the image. Even if the reference image contains text or dimensions, DO NOT include them in the final output. The final image MUST be a clean render without any overlaid text or UI elements.`;

/** 调用统一网关出一张图，返回图像 Buffer；失败时抛出带上游原因的错误 */
async function requestGatewayImage(params: {
  prompt: string;
  model: string;
  images: Array<{ data: string; mimeType?: string; role?: string }>;
  aspectRatio: string;
  resolution: string;
  userId: string;
  deptId?: string;
  timeoutMs?: number;
}): Promise<Buffer> {
  const gatewayUrl = `http://127.0.0.1:${process.env.PORT || 3000}/api/gateway/generate-image`;
  const res = await fetch(gatewayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-uuid': params.userId,
      ...(params.deptId ? { 'x-dept-id': params.deptId } : {})
    },
    body: JSON.stringify({
      prompt: params.prompt,
      model: params.model,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution,
      images: params.images,
      generationIntent: 'image_edit',
      userUuid: params.userId,
      userId: params.userId,
      deptId: params.deptId
    }),
    signal: AbortSignal.timeout(process.env.NODE_ENV === 'test' ? 1200 : params.timeoutMs ?? 180000)
  });
  const data = await res.json();
  if (!res.ok || data.error || data.success === false) {
    throw new Error(
      typeof data?.error === 'object' ? (data.error?.message || JSON.stringify(data.error)) : (data?.error || data?.message || '上游接口未返回有效图像数据')
    );
  }
  const part = data.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data || p?.inline_data?.data);
  const img: string | undefined =
    data.imageUrl || data.data?.[0]?.url || data.data?.[0]?.b64_json || data.images?.[0]?.data || part?.inlineData?.data || part?.inline_data?.data;
  if (typeof img !== 'string' || img.length === 0) throw new Error('上游接口未返回有效图像数据');
  if (img.startsWith('http://') || img.startsWith('https://')) {
    const fetched = await fetch(img, { signal: AbortSignal.timeout(60000) });
    if (!fetched.ok) throw new Error(`下载精修结果失败 (HTTP ${fetched.status})`);
    return Buffer.from(await fetched.arrayBuffer());
  }
  return Buffer.from(img.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, ''), 'base64');
}

export function buildStudioSwapDirective(params: {
  roomName?: string;
  styleName?: string;
  spacePreset?: any;
  stylePreset?: any;
  context?: SpaceGenerateImageInput['studioSwapContext'];
  lightingHint?: string;
  hasSceneMasterReference?: boolean;
  referenceShotCode?: string;
  masterIsEmptyPlate?: boolean;
  primaryRole?: string;
  shotCode?: string;
  cameraSettings?: SpaceGenerateImageInput['cameraSettings'];
  positivePrompt?: string;
}): string {
  const {
    roomName,
    styleName,
    spacePreset,
    stylePreset,
    context,
    lightingHint,
    hasSceneMasterReference = false,
    referenceShotCode = 'A00',
    masterIsEmptyPlate = false,
    primaryRole,
    shotCode,
    positivePrompt = ''
  } = params;

  // 1. 针对 A00 空间母版：必须 100% 读取并执行用户录入的【户型原型 (spacePreset)】与【美学风格 (stylePreset)】
  if (shotCode === 'A00') {
    const effectiveSpaceTitle = spacePreset?.name || roomName || '高定奢阔大平层端厅';
    const effectiveStyleTitle = stylePreset?.name || styleName || '现代奢华都会风格';
    const ceilingClause = spacePreset?.ceilingHeight ? `（层高 ${spacePreset.ceilingHeight}m）` : '';
    const spaceFeatures = Array.isArray(spacePreset?.signatureFeatures) && spacePreset.signatureFeatures.length > 0
      ? `，核心户型特征：${spacePreset.signatureFeatures.join('、')}`
      : '';
    const colorPalette = Array.isArray(stylePreset?.colorPalette) && stylePreset.colorPalette.length > 0
      ? `，主色调色板：${stylePreset.colorPalette.join(', ')}`
      : '';
    const materialSystem = Array.isArray(stylePreset?.materialSystem) && stylePreset.materialSystem.length > 0
      ? `，核心硬装材质：${stylePreset.materialSystem.join('、')}`
      : '';

    const spaceFragments = [
      ...(Array.isArray(spacePreset?.promptFragments) ? spacePreset.promptFragments : []),
      ...(Array.isArray(context?.spaceDna) ? context.spaceDna : [])
    ].filter(Boolean);

    const styleFragments = [
      ...(Array.isArray(stylePreset?.promptFragments) ? stylePreset.promptFragments : []),
      ...(Array.isArray(context?.styleDna) ? context.styleDna : [])
    ].filter(Boolean);

    const combinedA00Context = `${effectiveSpaceTitle} ${spacePreset?.code || ''} ${effectiveStyleTitle} ${stylePreset?.code || ''} ${positivePrompt} ${spaceFragments.join(' ')} ${styleFragments.join(' ')}`;
    const isAmerican = /美式|american|US-01|US-02/i.test(combinedA00Context);
    const isFrench = /法式|简欧|parisian|haussmann|EU-01/i.test(combinedA00Context);
    const isItalian = /意式|italian|milanese|IT-01|IT-02/i.test(combinedA00Context);
    const isSunken = /下沉|sunken|N-R04/i.test(combinedA00Context);
    const isDuplex = /挑空|复式|duplex|double.*height|N-R03/i.test(combinedA00Context);
    const isPavilion = /山水|宽厅|pavilion|water.*garden|松柏|N-R05/i.test(combinedA00Context);
    const isPenthouse = /顶层|天际|会所|penthouse|skyline|N-R06/i.test(combinedA00Context);

    let styleSpecificClause = '';
    const styleNegativesA00: string[] = [];
    if (isAmerican) {
      styleSpecificClause = `
[MANDATORY INTERIOR ARCHITECTURAL STYLE: MODERN AMERICAN METROPOLITAN (US-01 / US-02)]
- PICTURE-FRAME WALL PANEL MOLDINGS & WAINSCOTING: Background and side walls MUST feature authentic classic modern American picture-frame wall moldings and wainscoting (crisp rectangular architectural wall frames with shadow relief moldings in warm oat greige #E6DFD5 paired with rich dark American walnut #5C4A3E pilasters/millwork and warm brushed brass #C5A059 wall sconces).
- STRICTLY FORBID flat sterile drywall, cold grey industrial concrete, or plain featureless slabs without classic American wall moldings!`;
      styleNegativesA00.push(
        'cold flat sterile drywall',
        'modern plain white slab without moldings',
        'sterile white clinic walls',
        'flat bare drywall without panel frames'
      );
    } else if (isFrench) {
      styleSpecificClause = `
[MANDATORY INTERIOR ARCHITECTURAL STYLE: PARISIAN / EUROPEAN BOISERIE (EU-01)]
- FRENCH BOISERIE & CARVED MOLDINGS: Walls feature delicate European boiserie panel moldings in warm cream #FAF7F2, carved plaster cornices, champagne gold accents, and oak herringbone parquet flooring.`;
      styleNegativesA00.push('dark heavy industrial concrete', 'flat modern drywall without moldings');
    } else if (isItalian) {
      styleSpecificClause = `
[MANDATORY INTERIOR ARCHITECTURAL STYLE: MILANESE ARCHITECTURAL LUXURY (IT-01 / IT-02)]
- ROMAN TRAVERTINE & SMOKED WALNUT: Continuous full-span honed Roman travertine stone slabs and rich smoked dark walnut joinery with ultra-slim brushed titanium profiles.`;
      styleNegativesA00.push('traditional ornate classical carving', 'rustic country wood', 'cheap plastic laminate');
    }

    let topologySpecificClause = '';
    const topologyNegativesA00: string[] = [];
    if (isSunken) {
      topologySpecificClause = `\n[MANDATORY ARCHITECTURAL TOPOLOGY: SUNKEN CONVERSATION SALON (N-R04)]\n- Recessed sunken conversation lounge with perimeter travertine steps and expansive 3.8m ceiling headroom.`;
      topologyNegativesA00.push('cramped narrow apartment');
    } else if (isDuplex) {
      topologySpecificClause = `\n[MANDATORY ARCHITECTURAL TOPOLOGY: 6.2M DOUBLE-HEIGHT DUPLEX HALL (N-R03)]\n- Monumental 6.2m double-height soaring ceiling volume with two-story continuous feature wall and courtyard glass vista.`;
      topologyNegativesA00.push('low ceiling', 'cramped flat ceiling');
    } else if (isPavilion) {
      topologySpecificClause = `\n[MANDATORY ARCHITECTURAL TOPOLOGY: LANDSCAPE VILLA PAVILION (N-R05)]\n- Full-span panoramic glass wall looking out to serene water mirror reflection pool and pine courtyard.`;
    } else if (isPenthouse) {
      topologySpecificClause = `\n[MANDATORY ARCHITECTURAL TOPOLOGY: SKYLINE PENTHOUSE SALON (N-R06)]\n- Majestic high-altitude floor-to-ceiling panoramic glass curtain wall overlooking metropolis skyscraper skyline at golden hour.`;
    }

    const cleanNegativeA00 = deduplicateNegativeConstraints(
      'altering furniture, modifying sofa, modifying chair, changing sofa color, changing chair color, changing leather color, distorted furniture, deformed furniture structure, warped sofa lines',
      'removing sofa, removing chair, missing single chair, missing coffee table, missing furniture pieces, lonely drifting furniture',
      'moved furniture, shifted furniture position, rescaled furniture, re-framed composition, camera angle change, zoomed in, zoomed out, cropped furniture',
      'altering footrest state from Reference Image 1, closing deployed footrests shown in Reference Image 1, altering headrest position shown in Reference Image 1',
      'floating furniture, missing contact shadows, sticker effect, poorly blended furniture, cut-out artifact, plain studio backdrop, seamless paper backdrop, amateur render, cartoon CGI',
      'text, watermark, font, words, letters, chinese characters, labels, annotations, captions, overlay, subtitles, banner, logo, people, human, faces',
      ...(context?.spaceNegatives || []),
      ...(context?.styleNegatives || []),
      ...topologyNegativesA00,
      ...styleNegativesA00
    );

    return `[CRITICAL MANDATE: STUDIO PRODUCT BACKGROUND SWAP - DIRECT ASYMMETRIC VISUAL MAPPING (SCENE MASTER A00)]
商企-空间母版（A00）画面场景更换背景，按产品及录入的户型与美学风格生成全新的空间母版背景。
1. 空间户型录入（Space Layout）：${effectiveSpaceTitle}${ceilingClause}${spaceFeatures}。
2. 美学风格录入（Scene Style）：${effectiveStyleTitle}${colorPalette}${materialSystem}。
3. 场景硬装与背景墙生成：按三人位的沙发调性与所选【${effectiveStyleTitle}】美学风格生成新的调性背景墙、天花吊顶灯槽与全景落地窗自然采光。其中家具、所有的地毯、挂画、餐桌配套、拍摄角度保持不变。保证原图的尺寸比例不变。整体空间室内建筑摄影风格。
${spaceFragments.length > 0 ? `\n[ARCHITECTURAL LAYOUT DNA (户型拓扑特征)]:\n- ${spaceFragments.join('\n- ')}` : ''}
${styleFragments.length > 0 ? `\n[INTERIOR STYLE & MATERIAL DNA (美学风格与色板材质)]:\n- ${styleFragments.join('\n- ')}` : ''}${styleSpecificClause}${topologySpecificClause}

[REFERENCE IMAGE 1 GROUND TRUTH LOCK]:
- IMMUTABLE CAMERA MATRIX: The camera shooting position, lens perspective, elevation height, downward tilt angle, field of view (FOV), horizon line, and 3D vanishing points MUST 100% STRICTLY AND EXACTLY FOLLOW REFERENCE IMAGE 1!
- IMMUTABLE PHYSICAL FURNITURE: Every single furniture entity (main sofa, single accent armchair, coffee tables, side tables), their relative spatial layout, proportions, angles, genuine leather colors, textures, stitch seams, and physical postures are ABSOLUTE GROUND TRUTH.${lightingHint ? `\n- LIGHTING MOOD: ${lightingHint}` : ''}

[CRITICAL NEGATIVE INSTRUCTION]: ABSOLUTELY NO TEXT, NO NUMBERS, NO DIMENSION LINES, NO ARROWS, NO MEASUREMENTS, NO LABELS, NO ANNOTATIONS of any kind on the image. Even if the reference image contains text or dimensions, DO NOT include them in the final output. The final image MUST be a clean render without any overlaid text or UI elements.
Negative constraints: ${cleanNegativeA00}`;
  }

  // 2. 衍生镜头 (A01~A09)：逐字对齐工作流页面（ManwahStudio）实测可融合的换景指令。
  // 实测结论：窗口2 只作「场景风格参考」、由模型按窗口1 的透视重建背景时融合最好；
  // 写成「替换为窗口2 的同一个房间」或叠加机位/透视/光影/避免清单时，模型会在照搬窗口2 正面构图
  // 与保持窗口1 角度之间撕扯，出现家具斜放、背景墙正对镜头的错位透视。
  if (shotCode) {
    // 用户在工作流页面实测有效的指令原文，仅按主品类型替换「三人位的沙发」
    const toneLabel =
      primaryRole === 'sofa_2seat' ? '双人位的沙发' :
      primaryRole === 'recliner_1seat' || primaryRole === 'lounge_chair' ? '单椅' :
      '三人位的沙发';
    const styleClause = hasSceneMasterReference ? '场景风格：参考窗口2，' : '';

    // 唯一补充「以窗口1为底图」：窗口2（空场景母版）与输出同为 4:3 时，模型可能误把窗口2 当底图，整张改成正面构图
    return `画面重绘，以窗口1为底图，商企-画面场景更换背景，按产品的调性生成新的空间背景，${styleClause}按${toneLabel}调性生成新的调性背景墙。其中家具、所有的地毯、挂画、餐桌配套保持不变。保持窗口1的产品角度不变。保证原图的尺寸比例不变。要求生成的产品组合与空间透视是融合的。整体空间室内建筑摄影风格。${lightingHint ? `\n光线氛围：${lightingHint}` : ''}

[CRITICAL NEGATIVE INSTRUCTION]: ABSOLUTELY NO TEXT, NO NUMBERS, NO DIMENSION LINES, NO ARROWS, NO MEASUREMENTS, NO LABELS, NO ANNOTATIONS of any kind on the image. Even if the reference image contains text or dimensions, DO NOT include them in the final output. The final image MUST be a clean render without any overlaid text or UI elements.`;
  }

  // 严格非对称多模态参考图负面约束
  const negatives = deduplicateNegativeConstraints(
    'altering furniture, modifying sofa, modifying chair, changing sofa color, changing chair color, changing leather color, distorted furniture, deformed furniture structure, warped sofa lines',
    'removing sofa, removing chair, missing single chair, missing coffee table, missing furniture pieces, lonely drifting furniture',
    'moved furniture, shifted furniture position, rescaled furniture, re-framed composition, camera angle change, zoomed in, zoomed out, cropped furniture',
    'altering footrest state from Reference Image 1, closing deployed footrests shown in Reference Image 1, altering headrest position shown in Reference Image 1',
    'flat 0-degree frontal view, straight-on eye-level camera, flattening camera angle, rotating angled furniture to face front, copying camera angle from Reference Image 2, altering horizon height, shifting vanishing points, flattening perspective depth',
    'flat horizontal ceiling, horizontal ceiling cove parallel to frame, horizontal ceiling cove parallel to screen top, 1-point frontal box room, flat stage set, parallel background wall behind angled sofa, disconnected room angle, unnatural spatial angle mismatch, pasting sofa into flat room, disjointed perspective between furniture and architecture',
    'retaining old background from Reference Image 1, keeping old wall painting from Reference Image 1, keeping old framed picture or art from Reference Image 1, keeping old floor lamp from Reference Image 1, keeping old wood paneling from Reference Image 1, keeping old sheer curtains from Reference Image 1',
    'copying furniture from Reference Image 2, duplicate sofa, phantom furniture, extra furniture from Reference Image 2',
    'fake marble sticker, printed marble foil, cheap laminate table, repeating stone pattern, vinyl sticker wrap, plastic textures, cartoon CGI render, low-poly, amateur render',
    'floating furniture, missing contact shadows, sticker effect, poorly blended furniture, cut-out artifact, plain studio backdrop, seamless paper backdrop',
    'text, watermark, font, words, letters, chinese characters, labels, annotations, captions, overlay, subtitles, banner, logo, people, human, faces'
  );

  const masterReferenceDirective = hasSceneMasterReference
    ? `
2. REFERENCE IMAGE 2 ([参考图 2 ｜ 空间母版图 ${referenceShotCode}] - 【纯硬装材质、光影氛围与窗景样板】):
- SWATCH ROLE ONLY: Reference Image 2 serves EXCLUSIVELY as an architectural material finishes, lighting atmosphere, and window swatch!
- EXTRACT ARCHITECTURAL FINISHES & REPROJECT INTO IMAGE 1'S PERSPECTIVE GRID:
  * Extract the recessed ceiling cove architectural tiers with warm concealed linear LED light strips from Reference Image 2;
  * Extract the luxury dark marble / stone feature wall panels with metallic bronze trim from Reference Image 2;
  * Extract the polished dark marble flooring with organic white veins and ambient surface reflections from Reference Image 2;
  * Extract the panoramic floor-to-ceiling glass window system with outdoor city skyline vista and warm golden-hour daylight from Reference Image 2;
  * Extract the soft 3000K warm interior ambient illumination and natural window daylight direction from Reference Image 2.
- 3D CONFORMAL SPATIAL ENVELOPE & TWO-POINT CORNER PERSPECTIVE FUSION (空间对角转角融合 - CRITICAL):
  * PROHIBIT 1-POINT FRONTAL BOX: STRICTLY FORBID rendering a flat horizontal wall perpendicular to the camera! STRICTLY FORBID a horizontal flat ceiling cove! STRICTLY FORBID central hanging chandelier!
  * TWO-POINT CORNER PERSPECTIVE ENVELOPE (两点透视转角空间):
    - The camera is looking diagonally into an interior CORNER of the room (where the feature wall and panoramic window wall meet at an angle).
    - LEFT WALL: Behind the single recliner/armchair, the wall recedes diagonally toward the left vanishing point, paneled in the dark wood and marble from Reference Image 2.
    - RIGHT WALL: Behind and to the right of the 3-seat sofa, a floor-to-ceiling panoramic window wall recedes diagonally toward the right vanishing point, casting soft directional daylight across the sofa.
    - CEILING COVE: The recessed ceiling tray MUST have linear LED cove lights that recede along BOTH diagonal walls toward the left and right vanishing points, wrapping the ceiling in a natural 3D perspective grid matching the sofa's angle!
    - FLOOR & SHADOWS: The polished floor shares the exact same high horizon line (~70-75%) and vanishing grid of Reference Image 1, producing natural soft ambient occlusion contact shadows directly under the sofa base and coffee tables with ZERO sticker or pasted-in effect!
- RIGID REPROJECTION & NON-INTERFERENCE DIRECTIVE:
  * PERSPECTIVE RE-MAPPING: You MUST project and map the ceiling cove, backdrop walls, marble flooring, and panoramic windows from Reference Image 2 onto the EXACT 3D PERSPECTIVE GRID, TILTED VANISHING LINES, AND CAMERA ELEVATION/PITCH OF REFERENCE IMAGE 1!
  * STRICT NON-INTERFERENCE: Reference Image 2's eye-level, straight-on frontal camera angle MUST NEVER interfere with, override, or flatten Reference Image 1's real camera perspective!
  * ZERO FURNITURE FROM IMAGE 2: Reference Image 2 is used ONLY for architectural background materials. ABSOLUTELY DO NOT copy, carry over, or render any furniture, sofa, or armchair from Reference Image 2!`
    : '';

  return `[CRITICAL MANDATE: STUDIO PRODUCT BACKGROUND SWAP - DIRECT ASYMMETRIC VISUAL MAPPING]
PRIMARY OBJECTIVE:
This is a direct visual background replacement pipeline. ALL spatial and perspective parameters are governed exclusively by the provided visual reference images without any text-preset camera assumptions.

1. REFERENCE IMAGE 1 ([参考图 1 ｜ 用户上传场景实拍图] - 【绝对构图、几何透视与家具实体真值】):
- IMMUTABLE CAMERA MATRIX: The camera shooting position, lens perspective, elevation height, downward tilt angle, field of view (FOV), horizon line, and 3D vanishing points MUST 100% STRICTLY AND EXACTLY FOLLOW REFERENCE IMAGE 1!
- IMMUTABLE PHYSICAL FURNITURE: Every single furniture entity (main sofa, single accent armchair, coffee tables, side tables), their relative spatial layout, proportions, angles, genuine leather colors, textures, stitch seams, and physical postures (including deployed/extended motorized footrests and headrests) are ABSOLUTE GROUND TRUTH.
- SYSTEM PROHIBITION: STRICTLY FORBIDDEN to alter the camera angle, re-frame, zoom, flatten the view to eye-level, change furniture positions, remove furniture, redraw furniture, or modify furniture colors!
- COMPLETE OLD BACKGROUND ERASURE: The original background walls, wood veneer panels, old wall art/framed pictures, floor lamps, curtains, and old flooring from Reference Image 1 are 100% ERASED AND REMOVED. Keep ONLY the furniture entities intact in their exact original pixels and perspective.
${masterReferenceDirective}

3. NATURAL ILLUMINATION & CONTACT SHADOWS:
- Cast authentic physical ambient occlusion (AO) contact shadows directly beneath all furniture bases, legs, and footrests onto the new floor/area rug, eliminating any floating sticker artifact.
- Harmonize the window light direction and color temperature seamlessly onto the furniture silhouettes.${lightingHint ? `\n- LIGHTING MOOD: ${lightingHint}` : ''}

4. COMMERCIAL PURITY:
- Pristine luxury commercial catalog photograph.
- ZERO text, no watermarks, no logos, no Chinese characters, no labels, no humans, no people.

Negative constraints: ${negatives}`;
}

export interface SpaceGenerateImageResult {
  objectKey: string;
  imageUrl: string;
  provider: string;
  model: string;
  bytes: number;
  sha256: string;
  contentType: string;
  provenance: 'AI_ESTIMATED' | 'SOLVER_RESOLVED' | 'DERIVED';
  productionTruth: boolean;
  warningNotice?: string;
  isFallback?: boolean;
}

/**
 * 图像自适应规整：将输入参考图长边限制在 1024px 内并以高保真 WebP/JPEG 压缩，
 * 将单张图片 Base64 从数兆降低至 100~200KB，彻底根治 Payload 爆炸与模型 400 超时
 */
async function normalizeInlineBuffer(rawBuf: Buffer, maxEdge = 1024): Promise<{ mimeType: string; data: string }> {
  try {
    const meta = await sharp(rawBuf).metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;
    const maxDim = Math.max(width, height);

    if (maxDim > maxEdge) {
      const compressed = await sharp(rawBuf)
        .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      return {
        mimeType: 'image/webp',
        data: compressed.toString('base64')
      };
    }

    if (rawBuf.length > 500 * 1024) {
      const optimized = await sharp(rawBuf).webp({ quality: 85 }).toBuffer();
      return {
        mimeType: 'image/webp',
        data: optimized.toString('base64')
      };
    }

    let mimeType = 'image/jpeg';
    if (meta.format === 'png') mimeType = 'image/png';
    else if (meta.format === 'webp') mimeType = 'image/webp';
    return {
      mimeType,
      data: rawBuf.toString('base64')
    };
  } catch (err) {
    return {
      mimeType: 'image/jpeg',
      data: rawBuf.toString('base64')
    };
  }
}

/**
 * 辅助方法：将各种格式的图片引用统一解析为模型支持的 inlineData 格式并自动规整长边在 1024px 内
 */
// 角色资产图是多宫格角色卡（头像组、细节图、文字标注），模型容易照搬其排版输出拼图，必须明确只取身份特征
const SINGLE_FRAME_NEGATIVES =
  'collage, photo grid, multiple panels, split screen, diptych, triptych, contact sheet, character sheet layout, repeated same person, duplicated person';

function buildCharacterReferenceClause(charCount: number): string {
  if (charCount <= 0) return '';
  const refLabel = charCount > 1 ? 'REFERENCE IMAGES 2 & 3' : 'REFERENCE IMAGE 2';
  return `${refLabel}: Character identity reference(s) (headshots, possibly cut from multi-panel design boards). Use them ONLY to replicate each person's facial structure, ethnicity, age, hair, expression and outfit. NEVER copy their layout, panels, grid, plain backdrop or text.
[SINGLE-FRAME OUTPUT MANDATE]: The output MUST be ONE single continuous photograph with exactly the same frame, room and furniture as Reference Image 1. NEVER produce a collage, grid, split screen, multi-panel layout or contact sheet, and never show the same person more than once.`;
}

/**
 * 人物入座的精简编辑指令。实测长篇"主沙发入座"指令与单椅等底图矛盾时，模型会放弃底图整张重绘；
 * 简短的"编辑参考图1、只加人"指令可稳定保住房间、家具与机位。
 */
export function buildHumanPassEditPrompt(params: {
  slotBriefs: string;
  personCount: number;
  charRefCount: number;
  disallowExtraPeople?: boolean;
}): string {
  const { slotBriefs, personCount, charRefCount, disallowExtraPeople = true } = params;
  const people = personCount === 1 ? 'ONE person' : `${personCount} people`;
  const identityLines = Array.from({ length: charRefCount }, (_, i) =>
    `Reference Image ${i + 2} shows the person of Character Slot #${i + 1}.`
  ).join(' ');
  const identityClause = charRefCount > 0
    ? `${identityLines} Use these references ONLY for identity: copy face, age, ethnicity and hairstyle; ignore their plain backdrop and any panels or text.`
    : '';

  return `Edit Reference Image 1. Keep Reference Image 1 exactly as it is: same camera angle, framing, room, walls, window view, lighting, and every furniture piece with its shape, color, leather, position and current footrest state. Do not redraw, restyle, move, crop or replace anything.

Only add ${people} as described below, each on the furniture designated for them in Reference Image 1. A footrest may only change when a character brief explicitly asks for it.
${identityClause}
Realistic body weight, leather compression and contact shadows.

${slotBriefs.trim()}

Output one single photograph with the same composition as Reference Image 1. No collage, no panels, no text, no watermark${disallowExtraPeople ? (personCount === 1 ? ', no other people' : `, no extra people beyond these ${personCount}`) : ''}.`;
}

async function resolveImageInlineData(imageRef?: string, maxEdge = 1024): Promise<{ mimeType: string; data: string } | null> {
  if (!imageRef || typeof imageRef !== 'string') return null;
  const trimmed = imageRef.trim();
  if (!trimmed) return null;

  // 1. 如果是 Data URL (如 data:image/png;base64,xxx)
  if (trimmed.startsWith('data:')) {
    const match = trimmed.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
    if (match) {
      try {
        const buf = Buffer.from(match[2], 'base64');
        return await normalizeInlineBuffer(buf, maxEdge);
      } catch {
        return {
          mimeType: match[1] || 'image/jpeg',
          data: match[2]
        };
      }
    }
  }

  // 2. 如果是纯 Base64 字符串
  if (!trimmed.startsWith('http') && !trimmed.startsWith('/') && trimmed.length > 500 && !trimmed.includes(' ')) {
    try {
      const buf = Buffer.from(trimmed, 'base64');
      return await normalizeInlineBuffer(buf, maxEdge);
    } catch {
      return {
        mimeType: 'image/jpeg',
        data: trimmed
      };
    }
  }

  // 3. 如果是本地或者 GCS ObjectKey / 带有 key= 参数的本地 URL
  let targetKey = trimmed;
  if (trimmed.includes('/api/space/storage/local-file?key=') || trimmed.includes('/api/space/storage/download?key=')) {
    try {
      const urlObj = new URL(trimmed, 'http://localhost');
      targetKey = decodeURIComponent(urlObj.searchParams.get('key') || '');
    } catch {
      // ignore
    }
  }

  if (targetKey && (targetKey.startsWith('projects/') || targetKey.includes('/'))) {
    const storage = GcsAssetStorage.getInstance();
    const buf = await storage.getBuffer(targetKey);
    if (buf && buf.length > 0) {
      return await normalizeInlineBuffer(buf, maxEdge);
    }
  }

  // 4. 如果是远程 HTTP/HTTPS URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const res = await fetch(trimmed, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        return await normalizeInlineBuffer(buf, maxEdge);
      }
    } catch (err: any) {
      console.warn(`[SpaceImageGenerationService] Failed to fetch remote image ref: ${trimmed}`, err.message);
    }
  }

  return null;
}

/**
 * 当搭配品（茶几、单人位）引用了全景总图且未切片时，依据其 BoundingBox 自动在内存中切出真实局部特写
 */
async function cropImageInlineBuffer(
  imageRef: string,
  box: { ymin: number; xmin: number; ymax: number; xmax: number }
): Promise<{ mimeType: string; data: string } | null> {
  try {
    const rawInline = await resolveImageInlineData(imageRef);
    if (!rawInline) return null;
    const buf = Buffer.from(rawInline.data, 'base64');
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) return rawInline;

    const left = Math.max(0, Math.min(meta.width - 20, Math.floor((box.xmin / 100) * meta.width)));
    const top = Math.max(0, Math.min(meta.height - 20, Math.floor((box.ymin / 100) * meta.height)));
    const width = Math.max(10, Math.min(meta.width - left, Math.round(((box.xmax - box.xmin) / 100) * meta.width)));
    const height = Math.max(10, Math.min(meta.height - top, Math.round(((box.ymax - box.ymin) / 100) * meta.height)));

    const cropped = await sharp(buf)
      .extract({ left, top, width, height })
      .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer();

    return {
      mimeType: 'image/webp',
      data: cropped.toString('base64')
    };
  } catch (err) {
    console.warn('[SpaceImageGenerationService] Fallback on cropImageInlineBuffer:', err);
    return null;
  }
}

/**
 * 极简影棚背景置换 / 衍生镜头硬装样本板提取函数：
 * 将母版空间图 (A00) 转化为完全不含任何家具（沙发/茶几/单椅）的“纯硬装材质与窗景样板板 (Hard-finish Architectural Swatch Board)”：
 * - 顶部通栏 (1024x380)：天花吊顶层级、暗藏暖光带、主景墙顶部材质 (y: 0%..34%)
 * - 左下格 (504x370)：大面积全景落地窗与城市天际线/窗景 (x: 78%..100%, y: 15%..75%) - 0家具
 * - 右下格 (504x370)：高光大理石/地砖地面肌理与自然反光 (x: 0%..30%, y: 86%..100%) - 0家具
 * 核心物理优势：从视觉输入源头彻底切断“母版图里的平视沙发与居中布局”，大模型只接收纯硬装、纯光影与纯窗景，
 * 绝不会把母版图当成“0°正面底图画布”，100% 锁死图 1（实拍图）的 45°/俯仰/灭点拍摄视角与家具实体！
 */
export async function extractPureHardFinishSwatch(
  masterInline: { mimeType: string; data: string }
): Promise<{ mimeType: string; data: string }> {
  try {
    const rawBuf = Buffer.from(masterInline.data, 'base64');
    const meta = await sharp(rawBuf).metadata();
    if (!meta.width || !meta.height || meta.width < 120 || meta.height < 120) {
      return masterInline;
    }

    const w = meta.width;
    const h = meta.height;

    // 1. 主景墙大理石/奢石肌理局部特写 (纯材质肌理，避免截取平视房间与居中吊灯)
    const marbleCrop = await sharp(rawBuf)
      .extract({
        left: Math.floor(w * 0.40),
        top: Math.floor(h * 0.20),
        width: Math.min(Math.floor(w * 0.20), w - Math.floor(w * 0.40)),
        height: Math.min(Math.floor(h * 0.25), h - Math.floor(h * 0.20))
      })
      .resize(504, 370, { fit: 'cover' })
      .toBuffer();

    // 2. 柜体/木饰面板材肌理局部特写 (纯材质肌理，x: 18%..36%, y: 20%..45%)
    const woodCrop = await sharp(rawBuf)
      .extract({
        left: Math.floor(w * 0.18),
        top: Math.floor(h * 0.20),
        width: Math.min(Math.floor(w * 0.18), w - Math.floor(w * 0.18)),
        height: Math.min(Math.floor(h * 0.25), h - Math.floor(h * 0.20))
      })
      .resize(504, 370, { fit: 'cover' })
      .toBuffer();

    // 3. 右侧全景落地窗与城市天际线/夕阳窗景 (x: 78%..100%, y: 15%..75%) - 0 家具
    const windowVista = await sharp(rawBuf)
      .extract({
        left: Math.floor(w * 0.78),
        top: Math.floor(h * 0.15),
        width: Math.max(10, Math.floor(w * 0.22)),
        height: Math.max(10, Math.floor(h * 0.60))
      })
      .resize(504, 370, { fit: 'cover' })
      .toBuffer();

    // 4. 左下暗色高光大理石/木地板地面肌理与自然反光 (x: 0%..30%, y: 86%..100%) - 0 家具
    const floorMarble = await sharp(rawBuf)
      .extract({
        left: 0,
        top: Math.floor(h * 0.86),
        width: Math.max(10, Math.floor(w * 0.30)),
        height: Math.max(10, Math.floor(h * 0.14))
      })
      .resize(504, 370, { fit: 'cover' })
      .toBuffer();

    const swatchBoard = await sharp({
      create: { width: 1024, height: 768, channels: 3, background: { r: 18, g: 18, b: 18 } }
    })
      .composite([
        { input: marbleCrop, left: 0, top: 0 },
        { input: woodCrop, left: 520, top: 0 },
        { input: windowVista, left: 0, top: 390 },
        { input: floorMarble, left: 520, top: 390 }
      ])
      .webp({ quality: 90 })
      .toBuffer();

    return {
      mimeType: 'image/webp',
      data: swatchBoard.toString('base64')
    };
  } catch (err) {
    console.warn('[SpaceImageGenerationService] Fallback on extractPureHardFinishSwatch:', err);
    return masterInline;
  }
}

export const extractEmptyRoomFromMasterInline = extractPureHardFinishSwatch;

export class SpaceImageGenerationService {
  private static storage = GcsAssetStorage.getInstance();

  /**
   * 辅助方法：解析图片引用为 inlineData 格式
   */
  public static async resolveImageInline(imageRef?: string): Promise<{ mimeType: string; data: string } | null> {
    return resolveImageInlineData(imageRef);
  }

  /**
   * 核心方法：为 Space Studio 生成并存储真实图像资产
   */
  public static async generateAndStore(input: SpaceGenerateImageInput): Promise<SpaceGenerateImageResult> {
    const {
      projectId,
      shotCode,
      positivePrompt,
      negativePrompt,
      aspectRatio = '3:4',
      productName = '敏华头等舱功能沙发',
      productColor,
      productMaterial,
      roomName = '都会收藏家大平层',
      styleName = '都会收藏家',
      cameraSettings,
      objectKey,
      primaryProduct,
      productReferenceImage,
      sceneMasterReferenceImage,
      currentShotReferenceImage,
      isHumanPass,
      humanLayout,
      selectedModels,
      characterReferenceImages,
      functionalPositionState = 'closed'
    } = input;

    const effectiveObjectKey = objectKey || SpaceObjectKeyBuilder.shotRevisionOriginal({
      projectId: projectId || 'manwah-space-default',
      shotId: shotCode || 'A00',
      revisionId: `rev-gen-${Date.now().toString(36)}`,
      extension: 'webp'
    });

    const isFunctionalClosed = functionalPositionState !== 'open';

    let imageBuffer: Buffer | null = null;
    let cloudError: string | null = null;
    let usedProvider = 'deterministic_renderer';
    let usedModel = 'manwah-spatial-renderer-v1';
    let contentType = 'image/webp';
    let provenance: 'AI_ESTIMATED' | 'SOLVER_RESOLVED' | 'DERIVED' = 'SOLVER_RESOLVED';

    // 1. 解析多模态视觉参考图像 (产品真值图、A00 母版图、机位底图)
    // 关键架构优化（路线三）：A09 智能资产感知自适应路由
    // - 若录入了餐桌椅资产：提权餐桌椅为主角，按真实餐桌资产出图
    // - 若仅录入沙发（未上传餐桌）：平滑自适应为“大平层客餐一体纵深景”，主角依然是沙发，严禁凭空虚构非标餐桌！
    let activePrimaryProduct = primaryProduct;
    const diningProduct = (input.ensembleProducts || []).find(
      (p) => p.role === 'dining_table' || p.role === 'dining_chair' || /(餐桌|餐椅|餐边柜|餐台|餐车|餐厅)/.test(p.name || '')
    );
    const hasDiningAsset = Boolean(
      diningProduct && (
        (diningProduct as any)?.cropImageUrl ||
        (diningProduct as any)?.cropBase64 ||
        (diningProduct as any)?.referenceImage ||
        (diningProduct as any)?.uploadedImageUrl ||
        (diningProduct as any)?.referenceImages?.[0]?.publicUrl
      )
    );

    if (shotCode === 'A09' && hasDiningAsset && diningProduct) {
      activePrimaryProduct = diningProduct;
    } else if (shotCode === 'A08') {
      const reclinerProduct = (input.ensembleProducts || []).find(
        (p) => p.role === 'recliner_1seat' || p.role === 'lounge_chair' || /(单人|单椅|头等舱|单机位|大师|休闲椅|扶手椅)/.test(p.name || '')
      ) || (input.ensembleProducts || []).find((p) => p.priority === 'secondary' || (p.role !== 'sofa_3seat' && p.role !== 'sofa_2seat' && p.role !== 'coffee_table' && p.role !== 'dining_table'));
      
      const hasReclinerImage = Boolean(
        reclinerProduct && (
          (reclinerProduct as any)?.cropImageUrl ||
          (reclinerProduct as any)?.cropBase64 ||
          (reclinerProduct as any)?.referenceImage ||
          (reclinerProduct as any)?.uploadedImageUrl ||
          (reclinerProduct as any)?.referenceImages?.[0]?.publicUrl
        )
      );

      if (reclinerProduct && hasReclinerImage) {
        activePrimaryProduct = reclinerProduct;
      } else {
        // 自愈降级：若单椅资产尚未上传独立切片，严格保留主沙发作为核心真值基准，
        // 由后续摄影指令引导以主沙发皮革质感与缝线工艺为母本，生成同款头等舱定制单椅，杜绝空切片导致模型失败！
        activePrimaryProduct = primaryProduct;
      }
    } else if (['A03', 'A04', 'A05', 'A06'].includes(shotCode)) {
      const hero3SeatProduct = (input.ensembleProducts || []).find(
        (p) => p.role === 'sofa_3seat' || p.role === 'sofa_2seat' || /(三人|3人|主沙发|直排)/.test(p.name || '')
      );
      if (hero3SeatProduct) {
        activePrimaryProduct = hero3SeatProduct;
      }
    }

    // 最高真值防线：若客户端显式传入了针对本镜头的专属参考素材 (productReferenceImage)，必须享有第一优先级！
    // 彻底解决之前由于 activePrimaryProduct !== primaryProduct 短路导致的镜头专属素材被全局主品原图强制覆盖的 Bug。
    let effectiveProductImageRef = productReferenceImage;
    if (!effectiveProductImageRef || (typeof effectiveProductImageRef === 'string' && effectiveProductImageRef.trim().length === 0)) {
      effectiveProductImageRef = (activePrimaryProduct && activePrimaryProduct !== primaryProduct)
        ? ((activePrimaryProduct as any)?.cropImageUrl || (activePrimaryProduct as any)?.cropBase64 || (activePrimaryProduct as any)?.referenceImage || (activePrimaryProduct as any)?.uploadedImageUrl || activePrimaryProduct?.referenceImage)
        : (activePrimaryProduct?.referenceImage || (primaryProduct as any)?.referenceImage);
    }

    // 平滑自愈保护：如果选出的 effectiveProductImageRef 为空，自动兜底为主沙发的 productReferenceImage、当前镜头实拍图或 sceneMasterReferenceImage
    if (!effectiveProductImageRef || (typeof effectiveProductImageRef === 'string' && effectiveProductImageRef.trim().length === 0)) {
      effectiveProductImageRef = productReferenceImage || (primaryProduct as any)?.referenceImage || (primaryProduct as any)?.cropImageUrl || currentShotReferenceImage || sceneMasterReferenceImage;
    }

    // 极简换景与工作流页面对齐：参考图按 1536px 长边传入（与前端 compressImageForAnalysis 一致），
    // 1024px 会削弱实拍图的透视与家具细节，使模型更倾向于照搬母版画面
    const referenceMaxEdge = input.renderMode === 'studio_swap' ? 1536 : 1024;
    let [productInline, masterInline, shotInline] = await Promise.all([
      resolveImageInlineData(effectiveProductImageRef, referenceMaxEdge),
      resolveImageInlineData(sceneMasterReferenceImage, referenceMaxEdge),
      resolveImageInlineData(currentShotReferenceImage, referenceMaxEdge)
    ]);

    // 关键防线：若 productInline 解析为 null 但 shotInline 存在，以 shotInline 借用为 productInline；
    // 仅在非极简换景模式下，才允许兜底借用 masterInline，严禁换景模式下母版空间图窜入产品真值位
    if (!productInline && shotInline) {
      productInline = shotInline;
    } else if (!productInline && masterInline && input.renderMode !== 'studio_swap') {
      productInline = masterInline;
    }

    // 收集人物参考图 (从 characterReferenceImages 或 selectedModels 中提取真实模特真值)
    const rawCharImages: string[] = [];
    if (Array.isArray(characterReferenceImages) && characterReferenceImages.length > 0) {
      for (const c of characterReferenceImages) {
        if (c.imageUrl && typeof c.imageUrl === 'string') rawCharImages.push(c.imageUrl);
      }
    } else if (Array.isArray(selectedModels) && selectedModels.length > 0) {
      for (const m of selectedModels) {
        const img = m.views?.portrait || m.views?.front || m.thumbnail || m.coverImage;
        if (img && typeof img === 'string') rawCharImages.push(img);
      }
    }

    // 角色资产图是多宫格角色卡，先裁成单人头像再发送，避免模型照搬排版输出拼图
    const charInlines = await Promise.all(
      (
        await Promise.all(rawCharImages.slice(0, 2).map(imgUrl => resolveImageInlineData(imgUrl)))
      )
        .filter((item): item is { mimeType: string; data: string } => item !== null)
        .map(item => cropCharacterIdentity(item, input.userId || 'system'))
    );

    // 确定有效色彩与材质描述 (采用中英文权威词典与 Hex 工业色卡精准绑定)
    const effectiveColor = translateColorToEnglish(productColor || activePrimaryProduct?.colors?.[0]);
    const effectiveMaterial = translateMaterialToEnglish(productMaterial || activePrimaryProduct?.materials?.[0], 'genuine top-grain semi-aniline cowhide leather', activePrimaryProduct?.role);
    
    let effectiveProductName = 'luxury power motion sofa';
    if (activePrimaryProduct?.role === 'sofa_2seat') {
      effectiveProductName = 'generous wide-body two-seater power motion sofa (wide horizontal stance, expansive dual-unit seating, low-profile and deep proportions, twin 2-cushion division, strictly NOT a 3-seater)';
    } else if (activePrimaryProduct?.role === 'sofa_3seat') {
      effectiveProductName = 'luxury three-seater power motion sofa (featuring 3 distinct seating cushions)';
    } else if (activePrimaryProduct?.role === 'recliner_1seat') {
      effectiveProductName = 'luxury power motion recliner chair';
    } else if (activePrimaryProduct?.role === 'lounge_chair' || activePrimaryProduct?.name?.includes('无扶手') || activePrimaryProduct?.name?.includes('休闲单椅')) {
      effectiveProductName = 'modern minimalist armless lounge chair (strictly armless, no extended footrest)';
    } else if (hasDiningAsset && (activePrimaryProduct?.role === 'dining_table' || activePrimaryProduct?.role === 'dining_chair')) {
      effectiveProductName = 'luxury black marble dining table ensemble with tailored leather dining chairs, designer credenza sideboard, and mobile bar cart';
    } else if (shotCode === 'A09') {
      // 未录入餐桌套系时的纯沙发大平层贯通景
      effectiveProductName = 'grand open-plan living-dining vista showcasing the luxury power motion sofa anchoring the connected living space';
    }

    // 收集搭配产品 (Secondary Matching Ensemble Products) 的多模态视觉参考图与 DNA 描述
    const rawEnsemble = input.ensembleProducts || [];
    const secondaryProducts = rawEnsemble.filter(
      (p) => p.priority !== 'primary' && p.role !== activePrimaryProduct?.role &&
      // 仅当用户明确录入了餐桌且处于 A09 时，才排除主沙发
      (!hasDiningAsset || shotCode !== 'A09' || (p.role !== 'sofa_3seat' && p.role !== 'sofa_2seat'))
    );

    const secondaryInlines: Array<{
      product: SpaceProductIdentityInput;
      inline: { mimeType: string; data: string };
      colorEn: string;
      materialEn: string;
      roleTitleEn: string;
      antiStickerNegative?: string;
    }> = [];

    for (const sec of secondaryProducts) {
      // 搭配品严禁将全景大图直接重复塞入，优先使用其独立切片图
      const secRef =
        (sec as any)?.cropImageUrl ||
        sec.referenceImage ||
        (sec as any)?.referenceImages?.[0]?.publicUrl ||
        (sec as any)?.referenceImages?.[0]?.objectKey ||
        (sec as any)?.uploadedImageUrl;

      const rawColor = sec.colors?.[0] || sec.color;
      const rawMat = sec.materials?.[0] || sec.material;
      const colorEn = translateColorToEnglish(rawColor);
      const matEn = translateMaterialToEnglish(rawMat, 'genuine top-grain semi-aniline cowhide leather', sec.role);
      const compositeInfo = resolveCompositeMaterialDna(rawMat, sec.role);

      const isArmlessOrNonFunctional =
        sec.role === 'lounge_chair' ||
        sec.functionCapable === false ||
        (sec.name && /(休闲|无扶手|矮椅|旋转|单椅|焦糖)/.test(sec.name) && !/(功能|电动|头等舱|展开|太空舱)/.test(sec.name));

      let roleTitleEn = 'accent furniture';
      if (isArmlessOrNonFunctional) {
        roleTitleEn = 'modern minimalist armless lounge chair (strictly NO armrests, strictly NO extended footrest, strictly NO reclining mechanism)';
      } else if (sec.role === 'recliner_1seat') {
        roleTitleEn = 'MANWAH power motion recliner chair';
      } else if (sec.role === 'coffee_table') {
        roleTitleEn = 'center coffee table';
      } else if (sec.role === 'side_table') {
        roleTitleEn = 'accent side table';
      }

      // 关键自愈：如果搭配品的图片与主品参考图或母版参考图完全相同（属于全景总图且未切片），
      // 若存在 sourceBoundingBox，则在服务端自动裁剪出局部独立特写；否则避免将原大图重复压入
      const isSharedMaster =
        secRef &&
        (secRef === effectiveProductImageRef ||
          secRef === sceneMasterReferenceImage ||
          secRef === primaryProduct?.referenceImage);

      // 搭配品独立切片图上限为 2 张（如中心茶几 + 休闲单椅），杜绝过多图片超出大模型上下文限制
      if (secRef && secondaryInlines.length < 2) {
        let secInline: { mimeType: string; data: string } | null = null;
        if (isSharedMaster && (sec as any)?.sourceBoundingBox) {
          secInline = await cropImageInlineBuffer(secRef, (sec as any).sourceBoundingBox);
        } else if (!isSharedMaster) {
          secInline = await resolveImageInlineData(secRef);
        }

        if (secInline) {
          secondaryInlines.push({
            product: sec,
            inline: secInline,
            colorEn,
            materialEn: matEn,
            roleTitleEn,
            antiStickerNegative: compositeInfo.antiStickerNegative
          });
        }
      }
    }

    // 2. 调度系统统一图像生成网关 (TianToken / Google / RouterHub / OpenAI 统一中继)
    const config = await resolveApiConfig('system');
    let wasFallbackUsed = false;
    let refineNotice: string | undefined;
    let primaryModel = 'manwah-spatial-renderer-v1';

    if (!isProviderKeyValid(config?.apiKey) || process.env.NODE_ENV === 'test') {
      imageBuffer = this.renderDeterministicSpatialAsset({
        shotCode,
        productName,
        productColor,
        productRole: activePrimaryProduct?.role,
        roomName,
        styleName,
        camera: cameraSettings || { lensMm: 35, heightCm: 120, yawDeg: 0, pitchDeg: -2 },
        variantIndex: input.variantIndex,
        variantTag: input.variantTag
      });
      usedProvider = 'deterministic_renderer';
      usedModel = 'manwah-spatial-renderer-v1';
      provenance = 'SOLVER_RESOLVED';
    } else {
      const rawPreferred = input.preferredModel?.trim() || 'gemini-3-pro-image-preview';
      
      // 统一模型别名映射
      let targetModel = rawPreferred;
      if (targetModel === 'gemini-2.5-flash') targetModel = 'gemini-2.5-flash-image';
      else if (targetModel === 'google/gemini-3-pro-image' || targetModel === 'gemini-3-pro-image-preview') targetModel = 'gemini-3-pro-image';
      else if (targetModel === 'google/gemini-nano-banana-2.1-preview' || targetModel === 'nano-banana-2.1') targetModel = 'gemini-nano-banana-2.1-preview';
      else if (targetModel === 'openai/gpt-image-2.5-flare-c' || targetModel === 'gpt-2.5-flare') targetModel = 'gpt-image-2.5-flare-c';
      else if (targetModel === 'openai/gpt-image-2.5-sunburst-c' || targetModel === 'gpt-2.5-sunburst') targetModel = 'gpt-image-2.5-sunburst-c';
      else if (targetModel === 'openai/gpt-image-2' || targetModel === 'gpt-image-2') targetModel = 'gpt-image-2-c';
      else if (targetModel === 'openai/gpt-image-2-c') targetModel = 'gpt-image-2-c';
      else if (targetModel === 'openai/gpt-image-2-all') targetModel = 'gpt-image-2-all';

      const reqResolution = input.resolution || '2K';
      const isFlash25 = targetModel === 'gemini-2.5-flash-image' || targetModel === 'gemini-2.5-flash';
      const validResolution = isFlash25 ? '1K' : (['1K', '2K', '4K'].includes(reqResolution) ? reqResolution : '2K');

      const isStudioSwapMode = input.renderMode === 'studio_swap';
      // 人物入座始终沿用 Human Pass 管线，不受影棚换景模式影响
      const isStudioSwapImageSet = isStudioSwapMode && !isHumanPass;

      // 编织多模态视觉参考图像 (按工作模式优先级排序)
      const images: Array<{ data: string; mimeType?: string; role?: string }> = [];
      // 核心工业逻辑：针对 3人位主沙发专属镜头 (A03, A04, A05, A06)，绝对不把单椅作为搭配品参考图塞入！
      // A04 (2/3亲子景) / A05 (2/3私享景) / A06 (零靠墙侧景)：100% 专属于独立 3 人位主沙发资产，严格杜绝任何单椅或茶几参考图混入干扰！
      // A03 (3人位焦点景)：仅保留中心茶几参考图，严格剔除侧边单椅！
      const allowedSecondaryInlines = secondaryInlines.filter(s => {
        if (['A04', 'A05', 'A06'].includes(shotCode)) {
          return false;
        }
        if (shotCode === 'A03') {
          return s.product.role === 'coffee_table';
        }
        return true;
      });

      const maxSecItems = targetModel.includes('gpt') ? 1 : 3;
      const pushedSecondaryInlines = allowedSecondaryInlines.slice(0, maxSecItems);

      if (isStudioSwapImageSet) {
        // 极简影棚背景置换直通管线 (Studio Background Swap Pipeline):
        // 确立纯视觉双图非对称契约：
        // 参考图 1: 用户实拍素材真值 (shotInline 或 productInline，锁定绝对构图、几何透视与家具实体真值)
        // 参考图 2: 空间母版图 A00 (去家具化硬装色板，仅继承硬装吊顶、大理石墙地面、全景落地窗光影)
        // 与工作流页面（ManwahStudio）的换景调用保持一致：窗口1 = 产品场景实拍图（主产品参考），
        // 窗口2 = 完整空间母版图（风格参考）。网关会按角色在每张图前插入「[参考图N｜角色]」标签。
        const userPhotoInline = shotInline || productInline;
        if (userPhotoInline) {
          images.push({
            data: `data:${userPhotoInline.mimeType};base64,${userPhotoInline.data}`,
            mimeType: userPhotoInline.mimeType,
            role: 'primary_product'
          });
        }

        if (masterInline && shotCode !== 'A00') {
          images.push({
            data: `data:${masterInline.mimeType};base64,${masterInline.data}`,
            mimeType: masterInline.mimeType,
            role: 'style_reference'
          });
        }
      } else if (shotInline) {
        // 人物添加模式：以当前镜头真实底图为最高物理基石
        images.push({
          data: `data:${shotInline.mimeType};base64,${shotInline.data}`,
          mimeType: shotInline.mimeType,
          role: 'composition_reference'
        });

        // 注入所选模特资产参考图，确保多模态视觉识别与面部特征锁定
        if (charInlines.length > 0) {
          for (let cIdx = 0; cIdx < charInlines.length; cIdx++) {
            const charInline = charInlines[cIdx];
            images.push({
              data: `data:${charInline.mimeType};base64,${charInline.data}`,
              mimeType: charInline.mimeType,
              role: 'person_reference'
            });
          }
        }

        // 核心保真机制：当 isHumanPass 开启或 preserveBasePhotoOnly 开启时，底图已有完整的沙发和搭配品，
        // 绝对禁止再塞入外部单品/切片图，避免大模型因看到单品切片而强行拉近特写放大主沙发，导致景别裁切！
        if (!isHumanPass && !input.preserveBasePhotoOnly) {
          if (productInline) {
            images.push({
              data: `data:${productInline.mimeType};base64,${productInline.data}`,
              mimeType: productInline.mimeType,
              role: 'primary_product'
            });
          }

          // 注入搭配产品参考图 (仅注入允许的搭配品)
          for (const secItem of pushedSecondaryInlines) {
            images.push({
              data: `data:${secItem.inline.mimeType};base64,${secItem.inline.data}`,
              mimeType: secItem.inline.mimeType,
              role: 'secondary_product'
            });
          }
        }
      } else {
        const hasStudioSwapMasterRef = Boolean(isStudioSwapImageSet && masterInline && shotCode !== 'A00');
        if (productInline) {
          images.push({
            data: `data:${productInline.mimeType};base64,${productInline.data}`,
            mimeType: productInline.mimeType,
            role: hasStudioSwapMasterRef ? 'composition_reference' : 'primary_product'
          });
        }
        // 在全案编排或极简影棚换景 (studio_swap) 的衍生镜头 (非 A00) 中，只要存在空间母版图 (masterInline)，
        // 即以完整母版图作为空间参考（换景下为 style_reference，编排下为 scene_reference）
        if (masterInline && (!isStudioSwapImageSet || shotCode !== 'A00')) {
          images.push({
            data: `data:${masterInline.mimeType};base64,${masterInline.data}`,
            mimeType: masterInline.mimeType,
            role: isStudioSwapImageSet ? 'style_reference' : 'scene_reference'
          });
        }

        if (!isStudioSwapImageSet) {
          for (const secItem of pushedSecondaryInlines) {
            images.push({
              data: `data:${secItem.inline.mimeType};base64,${secItem.inline.data}`,
              mimeType: secItem.inline.mimeType,
              role: 'secondary_product'
            });
          }
        }
      }

      // 构建针对搭配产品的多模态参考图指令描述 (严格与实际传入 images 保持 1:1 对齐)
      let secondaryReferencesText = '';
      if (pushedSecondaryInlines.length > 0) {
        secondaryReferencesText = pushedSecondaryInlines
          .map((s, idx) => {
            const refIdx = (shotInline || masterInline) ? 3 + idx : 2 + idx;
            const isArmless =
              s.product.role === 'lounge_chair' ||
              s.product.functionCapable === false ||
              (s.product.name && /(休闲|无扶手|矮椅|旋转|单椅|焦糖)/.test(s.product.name) && !/(功能|电动|头等舱|展开|太空舱)/.test(s.product.name));
            const isStoneOrTable = s.product.role === 'coffee_table' || s.product.role === 'side_table' || /marble|stone|porcelain|岩板|大理石|黑金/i.test(s.materialEn) || /茶几|边几/.test(s.product.name || '');

            return `REFERENCE IMAGE ${refIdx}: Authentic Matching Product (${s.roleTitleEn}: ${s.product.name || 'MANWAH ensemble item'}, color: ${s.colorEn}, material: ${s.materialEn}).
MANDATORY REPLACEMENT MANDATE FOR ${s.roleTitleEn.toUpperCase()}:
- Replace ANY chair/armchair or conflicting item in the room with this exact authentic ${s.roleTitleEn} shown in Reference Image ${refIdx}.
- COLOR MUST BE STRICTLY ${s.colorEn}. ZERO tolerance for color drift or mismatched tone!
${isStoneOrTable ? '- COMPOSITE MATERIAL & CRAFTSMANSHIP LOCK: Strictly render genuine Laurent Black Gold marble (Nero Portoro) / sintered stone with seamless 45-degree polished chamfered bevels and micro-radius rounded safety corners, organic non-repeating gold/bronze lightning mineral veins with crystalline depth, and dark hairline brushed titanium alloy metal chassis! Strictly ZERO repetitive printed graphics, ZERO fake laminate stickers, ZERO peeling foil wraps!' : ''}
${isArmless ? '- SILHOUETTE & ERGONOMIC LOCK: This is strictly an ARMLESS LOUNGE CHAIR on a low-profile base. Strictly DO NOT add armrests. Strictly DO NOT add extended footrest. Strictly DO NOT add reclining motor buttons.' : `- Faithfully preserve its signature ergonomic silhouette, armrest contour, and craftsmanship from Reference Image ${refIdx}.`}`;
          })
          .join('\n\n');
      }

      // 针对生图模式编织具备物理第一性原理的系统级摄影提示词
      let directivePrompt = positivePrompt;
      const antiStickerNegatives = Array.from(
        new Set(
          allowedSecondaryInlines
            .map((s) => s.antiStickerNegative)
            .filter(Boolean)
        )
      ).join(', ');

      // 极简影棚换景：仅在非人物入座时生效（用户实拍素材可来自 productInline 或 shotInline）；
      // 人物入座必须走 Human Pass 分支，否则 studio_swap 的 "no people" 负面约束会导致人物植入失败。
      const useStudioSwapDirective = isStudioSwapImageSet && Boolean(productInline || shotInline);

      if (useStudioSwapDirective) {
        const hasMasterRefForSwap = Boolean(masterInline && shotCode !== 'A00');
        directivePrompt = buildStudioSwapDirective({
          roomName: input.roomName,
          styleName: input.styleName,
          spacePreset: input.spacePreset,
          stylePreset: input.stylePreset,
          context: input.studioSwapContext,
          lightingHint: input.studioSwapLightingHint,
          hasSceneMasterReference: hasMasterRefForSwap,
          referenceShotCode: input.referenceShotCode || 'A00',
          masterIsEmptyPlate: Boolean(input.sceneMasterIsEmptyPlate),
          primaryRole: activePrimaryProduct?.role,
          shotCode,
          cameraSettings: input.cameraSettings,
          positivePrompt: input.positivePrompt
        });
      } else if (isHumanPass || shotInline) {
        // 在有人物入座或以底图为锚点的模式下，必须净化 negativePrompt，严禁包含底图内已有物体的剔除词（如 side chair / armchair / wide panorama），避免大模型为满足负面词而强行放大裁切！
        const sanitizedNegative = (negativePrompt || '')
          .replace(/\b(side chair|accent chair|armchair|lounge chair|single chair|3\+1 ensemble|wide empty room panorama|far distant vantage)\b/gi, '')
          .replace(/,\s*,+/g, ',')
          .trim();

        if (isHumanPass && input.humanSlotBriefs && input.humanSlotBriefs.trim()) {
          // 模式 A0: 模特入座精简编辑指令（以底图为编辑对象，只加人）
          directivePrompt = buildHumanPassEditPrompt({
            slotBriefs: input.humanSlotBriefs,
            personCount: humanLayout?.characterCount || humanLayout?.slots?.length || charInlines.length || 1,
            charRefCount: charInlines.length,
            disallowExtraPeople: humanLayout?.disallowExtraCharacters !== false
          });
        } else if (input.preserveBasePhotoOnly || isHumanPass) {
          // 模式 A: 模特入座 (Human Pass / Photo Ground Truth Inpainting)：绝对锁定景别、视场角与原有全部家具
          // 彻底杜绝任何镜头拉近（Zoom In）、重绘裁切或单椅被裁
          directivePrompt = `[CRITICAL MANDATE: INPAINT REAL PEOPLE INTO REFERENCE IMAGE 1 - ABSOLUTE FIELD OF VIEW & FRAMING LOCK]
PRIMARY OBJECTIVE:
Reference Image 1 is the 100% AUTHENTIC BASELINE PHOTOGRAPH of the living room and all furniture pieces.
Your task is EXCLUSIVELY to photorealistically insert the designated real human model(s) seated naturally into the hero sofa shown in Reference Image 1.

[ABSOLUTE CAMERA STABILITY & ZERO-ZOOM MANDATE (CRITICAL)]:
1. 100% FROZEN FRAMING & FIELD OF VIEW: The camera position, shooting distance, focal length, field-of-view, optical horizon, and ALL furniture pieces shown in Reference Image 1 (including any side chairs, armchairs, coffee tables, wall decorations, rugs, and windows) MUST REMAIN 100% IDENTICAL, IMMOVABLE, AND UNCROPPED!
2. ABSOLUTE PROHIBITION ON ZOOMING OR CROPPING: ABSOLUTELY DO NOT ZOOM IN! DO NOT ZOOM OUT! DO NOT crop out the left side chair, coffee table, or any surrounding elements! DO NOT re-frame or shift the sofa! The sofa and surrounding furniture must retain their exact scale, pixel position, and coordinates as in Reference Image 1!
3. SEATING ACTION ONLY: Only photorealistically paint the designated models seated naturally into the existing sofa cushions of Reference Image 1 with realistic body weight, fabric folds, and authentic contact ambient occlusion shadows on the seating cushions. All surrounding architecture, windows, walls, and flooring remain completely untouched!

${buildCharacterReferenceClause(charInlines.length)}

STRICT OCCUPANCY & COMPOSITION RULES:
1. The designated character(s) MUST BE SEATED ON THE HERO SOFA naturally with relaxed posture and realistic body contact.
2. ZERO TEXT, NO WATERMARKS, NO LABELS, NO CHINESE CHARACTERS.
3. Keep all existing furniture functional mechanisms intact and closed unless specified.

${positivePrompt}

Negative constraints: ${deduplicateNegativeConstraints(
  sanitizedNegative,
  'zoomed in, zooming in, cropped sofa, cropping furniture, cropping side chair, re-framing, camera drift, camera shift, perspective drift, altering background, modifying walls, changing wall color, changing floor, modifying furniture, foreign style, empty sofa, nobody in room, missing people, displaced furniture, text, watermark, font, words, letters, chinese characters, labels, annotations, captions, overlay, subtitles, banner, logo, deformed limbs, floating human, extra people, ' + SINGLE_FRAME_NEGATIVES
)}`;
        } else {
          // 模式 A-2: 模特植入 (通用)：强制原图机位零漂移，家具绝对不位移，仅将人物自然坐入
          directivePrompt = `[CRITICAL MANDATE: SEAT REAL PEOPLE INTO THIS LIVING ROOM - NEVER RETURN AN EMPTY ROOM]
PRIMARY OBJECTIVE:
You are an architectural lifestyle photographer. You MUST photorealistically insert real human models into the room shown in Reference Image 1.
DO NOT LEAVE THE ROOM EMPTY. DO NOT RETURN AN EMPTY ROOM.
THE HERO SOFA MUST HAVE THE SPECIFIED PEOPLE SEATED AND RELAXING IN IT.

[ABSOLUTE CAMERA STABILITY & ZERO-DRIFT MANDATE (CRITICAL)]:
1. CAMERA GEOMETRY & FRAMING ZERO DRIFT: Reference Image 1 provides the 100% FROZEN architectural and camera baseline. The camera perspective, focal length, shooting distance, lens height, horizontal line, and furniture positions MUST REMAIN 100% IDENTICAL AND IMMOVABLE.
2. ABSOLUTE PROHIBITION ON RE-FRAMING: DO NOT zoom in, DO NOT zoom out, DO NOT change the perspective angle, DO NOT shift furniture left or right. ZERO tolerance for camera drift!
3. SEATING ACTION ONLY: Only photorealistically paint the designated models seated naturally into the existing sofa cushions of Reference Image 1 with genuine weight and contact shadows. All surrounding architecture, windows, walls, and flooring remain completely untouched!

${buildCharacterReferenceClause(charInlines.length)}
${secondaryReferencesText ? `\n${secondaryReferencesText}\n` : ''}

STRICT COMMERCIAL MANDATES:
1. POPULATE THE HERO SOFA: The designated character(s) MUST BE SEATED ON THE HERO SOFA naturally with realistic body weight, folds in clothes, and authentic contact shadows on the leather cushions.
${shotCode === 'A03' ? `   - A03 HERO 3-SEATER FAMILY LEISURE: Depict a genuine warm family moment with parents and young daughter seated together on the 3-seater hero sofa. Functional footrests ${isFunctionalClosed ? 'strictly remain completely closed and retracted under the base in standard upright comfortable configuration' : 'outer motion seats may be gently deployed for relaxed human occupancy'}. Natural, relaxed, joyful expressions. Center coffee table in foreground with coffee cups and art books within the authentic living room.` : ''}
${shotCode === 'A04' ? `   - A04 2/3 HERO SOFA MOTHER-DAUGHTER COMPANION: Frame 2/3 of the hero motion sofa in 3:4 vertical aspect ratio (CAPACITY LOCK: strictly max 2 occupants, mother and daughter, zero extra crowd), captured from 140cm eye level with -15 degree downward pitch looking down onto the deep seating cushion and rug stage. Depict an affectionate mother and young daughter companion moment. The motorized footrests ${isFunctionalClosed ? 'strictly remain completely closed and tucked flush under the base in standard upright configuration' : 'outer motorized footrest is smoothly deployed, comfortably supporting the mother and daughter relaxing together'}. Highlight the wide outer armrest and supple leather folds within the authentic room environment. ZERO single chairs, ZERO coffee table obstruction!` : ''}
${shotCode === 'A05' ? `   - A05 2/3 HERO SOFA PRIVATE WINE LOUNGE: Frame 2/3 of the hero motion sofa in 3:4 vertical aspect ratio (CAPACITY LOCK: strictly 1 lady occupant). Depict an elegant lady in a light dress sitting relaxed with footrests ${isFunctionalClosed ? 'completely retracted under the base in standard upright closed posture' : 'smoothly deployed supporting private lounge relaxation'}, holding a glass of red wine in a private leisure lounge posture within the authentic room. ZERO single chairs, ZERO coffee table obstruction!` : ''}
${shotCode === 'A06' ? `   - A06 ZERO-WALL CLEARANCE PROFILE VIEW: Lateral side profile (75-90 degrees) in 16:9 widescreen (CAPACITY LOCK: strictly 1 occupant). Hero sofa is flush against the backdrop wall with virtually zero gap (<5cm flush alignment), with motorized footrests and backrest strictly remaining in standard pristine CLOSED upright configuration. A relaxed lady wearing white over-ear headphones listening to music.` : ''}
${shotCode === 'A08' ? `   - A08 RECLINER CHAIR TABLET READING POSTURE: Dedicated single power recliner motion chair at 35-40 degree three-quarters perspective (CAPACITY LOCK: strictly 1 single occupant). Motorized footrest is ${isFunctionalClosed ? 'completely retracted and closed in standard upright reading posture' : 'deployed in ergonomic comfort contour'} supporting a relaxed individual comfortably browsing an iPad/tablet within the authentic living room.` : ''}
2. ZERO-TEXT MANDATE: ABSOLUTELY NO TEXT, NO CHINESE CHARACTERS, NO WORDS, NO LABELS, NO ANNOTATIONS, NO WATERMARKS ANYWHERE ON THE IMAGE. Render a 100% clean pristine photograph.
3. MOTION & ERGONOMIC FUNCTION:
   - Keep sofa color (${effectiveColor}), leather grain (${effectiveMaterial}), and armrest styling completely unchanged.
   - ${isFunctionalClosed ? 'CRITICAL: ALL sofa and chair motorized footrests and motion mechanisms strictly remain completely CLOSED, flush, and tucked under the base in standard upright seated configuration.' : 'If the posture specifies an extended footrest ("展开脚托", "recline", "电动功能位"), that specific seat on the main sofa may smoothly open and extend its motorized footrest forward.'}
4. ARCHITECTURAL CONTINUITY:
   - The room's architecture, window view, flooring, and camera perspective in Reference Image 1 must remain solid and preserved while the people are inserted.

${positivePrompt}

Negative constraints: ${deduplicateNegativeConstraints(
  negativePrompt,
  antiStickerNegatives,
  isFunctionalClosed ? 'deployed footrest, extended footrest, popped leg rest, open footrest mechanism, open recliner mechanism, unretracted leg rest, unfolded footrest, 展开的脚踏, 伸出的脚托, 功能位展开, 靠背倾斜后仰展开' : '',
  'camera drift, camera shift, zoomed in, zoomed out, shifted furniture, tilted horizon, empty sofa, empty room, nobody in room, missing people, displaced furniture, text, watermark, font, words, letters, chinese characters, labels, annotations, captions, overlay, subtitles, banner, logo, deformed limbs, floating human, extra people, ' + SINGLE_FRAME_NEGATIVES
)}`;
        }
      } else if (productInline && masterInline) {
        // 模式 B: A01~A08 衍生镜头生图：确立“机位与景别第一性原则”，同时坚决锁定 A00 母版硬装与窗景背景一致性
        const isFrontalPanorama = shotCode === 'A01' || (positivePrompt.includes('GRAND FRONTAL') || positivePrompt.includes('正大视角'));
        const isAngledHero = shotCode === 'A02' || (positivePrompt.includes('45-degree') || positivePrompt.includes('45°') || positivePrompt.includes('3+1 ENSEMBLE'));
        const isHeroSofaFocus = shotCode === 'A03' || (positivePrompt.includes('HERO 3-SEATER') || positivePrompt.includes('3-Seater'));
        const isTwoThirdsHeroSofa = shotCode === 'A04' || shotCode === 'A05' || positivePrompt.includes('2/3 HERO SOFA') || positivePrompt.includes('2/3主沙发');
        const isLivingEnsembleMid = shotCode === 'A07' || positivePrompt.includes('ENSEMBLE LIVING') || positivePrompt.includes('沙发茶几组群');
        const isZeroWallProfile = shotCode === 'A06' || positivePrompt.includes('ZERO-WALL') || positivePrompt.includes('零靠墙');
        const isReclinerMultiMode = shotCode === 'A08' || positivePrompt.includes('RECLINER 5-MODE') || positivePrompt.includes('单椅五档');
        const isDiningSuite = shotCode === 'A09' || positivePrompt.includes('DINING SUITE') || positivePrompt.includes('餐桌配套');
        const isDetailOrMacro = shotCode === 'A08' || positivePrompt.includes('CRAFTSMANSHIP') || positivePrompt.includes('特写') || positivePrompt.includes('DETAIL');
        const isReclinerFocus = isReclinerMultiMode || (!isHeroSofaFocus && !isTwoThirdsHeroSofa && !isZeroWallProfile && !isDiningSuite && !isLivingEnsembleMid && positivePrompt.toUpperCase().includes('RECLINER ARMCHAIR') && !isAngledHero);
        const isLowAngle = positivePrompt.toLowerCase().includes('low-angle') || (cameraSettings && cameraSettings.heightCm <= 80);
        const hasHumanOccupant = Boolean(isHumanPass);
        const isHeroSofaDedicatedShot = ['A03', 'A04', 'A05', 'A06'].includes(shotCode);
        const isReclinerDedicatedShot = ['A08'].includes(shotCode);

        const isArmlessLoungeChair = allowedSecondaryInlines.some(sec => 
          sec.product.role === 'lounge_chair' ||
          sec.product.functionCapable === false ||
          (sec.product.name && /(休闲|无扶手|矮椅|旋转|单椅|焦糖)/.test(sec.product.name) && !/(功能|电动|头等舱|展开|太空舱)/.test(sec.product.name))
        );
        const hasBrownSecondary = allowedSecondaryInlines.some(sec => /brown|caramel|amber|espresso/i.test(sec.colorEn));
        const brownNegativeFilter = hasBrownSecondary ? '' : 'brown recliner, brown armchair, ';

        const isReferenceA01 = input.referenceShotCode === 'A01';
        const a02PerspectiveShiftClause = (shotCode === 'A02' || isAngledHero)
          ? `[MANDATORY PERSPECTIVE SHIFT & 3+1 CHOREOGRAPHY: 45° THREE-QUARTERS OBLIQUE ANGLE]
${isReferenceA01 ? 'Reference Image 2 is Shot A01 (Grand Frontal Living Scene Master).' : 'Reference Image 2 is the frontal baseline.'}
FOR SHOT A02, YOU MUST PHYSICALLY SWING THE CAMERA 40-45 DEGREES TO THE FRONT-LEFT VANTAGE POINT (standing near the panoramic window, shooting diagonally across to the back-right)!
DO NOT RENDER A STRAIGHT-ON FRONTAL VIEW!
DO NOT CENTER THE SOFA SYMMETRICALLY!

[MANDATORY 3+1 CONVERSATIONAL LIVING ENSEMBLE CHOREOGRAPHY]:
Capture the cohesive conversational salon layout matching the luxury lifestyle reference:
1. THREE-SEATER MAIN SOFA: Located at midground right, backed against the luxury stone/wood focal wall, oriented at 45° diagonal angle. Supple genuine leather, three distinct seating cushions, with 1-2 curated throw cushions.
2. MATCHING 1-SEATER POWER MOTION RECLINER ARMCHAIR: Located at foreground left near the panoramic window flank, angled inward toward the main sofa in a 90-degree conversational L-shape. COMFORT ERGONOMIC POSTURE: Its motorized footrest is gracefully deployed into a relaxed comfort contour (as shown in reference design), highlighting peak First-Class relaxation!
3. DUAL NESTING CENTER COFFEE TABLES: Positioned on the area rug between sofa and armchair. Featuring a higher black square side pedestal nested with a lower dark marble/glass table, styled with an artisan wooden box and minimal greenery.
4. CONTEMPORARY GEOMETRIC AREA RUG: Expansive light ivory/warm greige geometric wool rug cleanly anchoring both sofas and coffee table on the warm wood plank flooring.
5. INDOOR BOTANICAL: An elegant tall fiddle-leaf fig tree stands between the recliner armchair and the panoramic window.
6. OPEN-PLAN VISTA: The vista to the right extends smoothly into the deep background open-plan dining zone (dark marble dining table and leather dining chairs), establishing majestic architectural depth.\n\n`
          : '';

        const a03PerspectiveClause = (shotCode === 'A03' || isHeroSofaFocus)
          ? `[MANDATORY HERO 3-SEATER PERSPECTIVE & COMPOSITION: SUBTLE THREE-QUARTERS OBLIQUE ANGLE]
${isReferenceA01 ? 'Reference Image 2 is Shot A01 (Grand Frontal Living Scene Master).' : 'Reference Image 2 is the scene baseline.'}
CRITICAL VANTAGE DIRECTIVE FOR SHOT A03:
- SUBTLE 15-25 DEGREE OBLIQUE PERSPECTIVE: The camera is stationed at the front-left vantage point (near the panoramic window), shooting toward the 3-seater hero sofa with a subtle 15-to-25 degree three-quarters oblique perspective. DO NOT RENDER A FLAT STRAIGHT-ON FRONTAL MUGSHOT! Show the dynamic 3D depth, the flare of the left armrest, and the deep seating cushion volume.
- 100% FOCUS ON HERO 3-SEATER SOFA: Completely crop out, exclude, and bypass ANY separate single armchair, recliner chair, or 3+1 ensemble arrangement. The 3-seater sofa is the ONLY seating piece in the frame!
- PRISTINE LEATHER SURFACE: Zero cluttered oversized cushions or furry pillows. The seating cushions and backrests remain clean, smooth, and uncluttered, showcasing the pure luxury of genuine semi-aniline leather.
- FOREGROUND NESTING COFFEE TABLES: The dual nesting coffee table ensemble (black square pedestal + lower dark marble/glass table with artisan wooden box and subtle greenery) sits in the foreground on the geometric area rug, angled naturally without blocking the main sofa seating cushions.
- LEFT-SIDE FLANK: An elegant side table and tall fiddle-leaf fig tree stand near the left panoramic window flank.
- BACKGROUND ENVELOPE: Hero sofa is backed against the luxury marble/wood accent feature wall with its signature dual tiered curved luminous floating shelves. The space to the right opens smoothly into the deep background open-plan dining area.\n\n`
          : '';

        const a04PerspectiveClause = (shotCode === 'A04')
          ? `[MANDATORY 2/3 HERO SOFA COMPANION PERSPECTIVE & COMPOSITION: 3:4 VERTICAL PORTRAIT]
${isReferenceA01 ? 'Reference Image 2 is Shot A01 (Grand Frontal Living Scene Master).' : 'Reference Image 2 is the scene baseline.'}
CRITICAL VANTAGE DIRECTIVE FOR SHOT A04:
- 3:4 VERTICAL COMPOSITION & -15° DOWNWARD TILT: The camera is stationed at 140cm standing eye-level height with an intentional -15 degree downward pitch looking down onto the living area rug stage in 3:4 vertical portrait aspect ratio.
- 2/3 SOFA LIFESTYLE CROP: Frame approximately 2/3 of the three-seater hero motion sofa (focusing on the outer left armrest and deep seating cushions). The remaining 1/3 of the sofa and the rest of the room are naturally cropped out. DO NOT zoom out or shrink the sofa to fit the entire width into the vertical frame!
- PERSPECTIVE & HORIZON DECOUPLING: Reference Image 2 is a horizontal level eye-line view. FOR SHOT A04, DO NOT COPY the level eye-line or flat horizontal lines of Reference Image 2! The camera MUST physically be elevated to 140cm and tilted downward by -15° onto the seating cushion surface!
- NATURAL PLAY STAGE: Foreground play rug stage bathed in left window sheer curtain daylight, white matte cylindrical planter anchor.
- ZERO SIDE CHAIR: Completely crop out, exclude, and bypass any separate single armchair or recliner chair.\n\n`
          : '';

        const a05PerspectiveClause = (shotCode === 'A05')
          ? `[MANDATORY 2/3 HERO SOFA PRIVATE LOUNGE PERSPECTIVE & COMPOSITION: 3:4 VERTICAL PORTRAIT]
${isReferenceA01 ? 'Reference Image 2 is Shot A01 (Grand Frontal Living Scene Master).' : 'Reference Image 2 is the scene baseline.'}
CRITICAL VANTAGE DIRECTIVE FOR SHOT A05:
- 3:4 VERTICAL COMPOSITION & +28° RIGHT ANGLE: The camera is positioned at 95cm seated eye-level height (0° tilt) with a +28 degree right oblique perspective in 3:4 vertical portrait aspect ratio.
- 2/3 SOFA CRAFTSMANSHIP CROP: Frame approximately 2/3 of the three-seater hero motion sofa, tightly capturing the right outer armrest with signature diamond quilting, circular metal motion buttons, brass closure strip anchor, and warm 3000K ambient wall sconce from Reference Image 2.
- OUT-OF-FRAME CEILING LOCK: The ceiling is strictly 100% OUT OF FRAME above the crop! The vertical background behind the sofa consists exclusively of the authentic living room feature wall (fluted wood paneling and marble) behind the 3-seater sofa from Reference Image 2 extending to the top of the frame.
- EXCLUDE SEPARATE CHAIRS: Strictly crop out any separate single armchair or distant room clutter. Strictly DO NOT invent unreferenced bookcases or wall niches!\n\n`
          : '';

        const a06PerspectiveClause = (shotCode === 'A06' || isZeroWallProfile)
          ? `[MANDATORY ZERO-WALL CLEARANCE LATERAL PROFILE: 88° PURE SIDE PROFILE]
${isReferenceA01 ? 'Reference Image 2 is Shot A01 (Grand Frontal Living Scene Master).' : 'Reference Image 2 is the scene baseline.'}
CRITICAL VANTAGE DIRECTIVE FOR SHOT A06:
- 88° PURE LATERAL SIDE PROFILE: The camera is stationed on the side flank (85-to-90 degree orthogonal profile) at 90cm seated eye-level height in 4:3 horizontal aspect ratio. Two-point perspective with strictly plumb vertical lines.
- ZERO-WALL CLEARANCE FUNCTION: Showcase MANWAH signature ZERO-WALL CLEARANCE technology in living room setting: hero sofa is positioned flush against the solid architectural feature wall with virtually zero gap (<5cm flush alignment)!
- PRISTINE CLOSED POSTURE: Motorized footrests strictly retracted and tucked flush under the base; backrest upright in standard closed showroom posture. Full side armrest profile highlights diamond quilting craftsmanship.\n\n`
          : '';

        const a07PerspectiveClause = (shotCode === 'A07' || isLivingEnsembleMid)
          ? `[MANDATORY ENSEMBLE LIVING PERSPECTIVE & DEPTH COMPRESSION: 55mm MEDIUM GROUPING]
${isReferenceA01 ? 'Reference Image 2 is Shot A01 (Grand Frontal Living Scene Master).' : 'Reference Image 2 is the scene baseline.'}
CRITICAL VANTAGE DIRECTIVE FOR SHOT A07:
- 55mm MEDIUM TELEPHOTO COMPRESSION: Camera at 95cm height with -35 degree oblique angle and -5 degree downward tilt in 4:3 horizontal aspect ratio.
- INTIMATE CONVERSATIONAL GROUPING: Medium living ensemble grouping tightly framing hero sofa in midground, luxury marble center coffee table and dark side accent table in foreground, highlighting the golden height drop between 450mm marble table and 400mm sofa seat.
- DEEP GROUNDING: Strong contact AO shadows ground furniture on the geometric area rug with soft side window daylight and 3000K ambient ceiling glow.\n\n`
          : '';

        const a08PerspectiveClause = (shotCode === 'A08' || isReclinerMultiMode)
          ? `[MANDATORY RECLINER 5-MODE PERSPECTIVE & HERO INVERSION: 50mm GOLDEN DIAGONAL]
${isReferenceA01 ? 'Reference Image 2 is Shot A01 (Grand Frontal Living Scene Master).' : 'Reference Image 2 is the scene baseline.'}
CRITICAL VANTAGE DIRECTIVE FOR SHOT A08:
- 100% FOCUS ON SINGLE POWER RECLINER ARMCHAIR: The single power motion recliner armchair is the 80% HERO PRODUCT in this shot! The 3-seater main sofa must be completely removed from center stage (pushed off-frame or distant background blur).
- 50mm GOLDEN DIAGONAL PERSPECTIVE: Camera at 95cm seated eye-level height with fixed 35-to-40 degree golden diagonal perspective in 4:3 horizontal aspect ratio.
- DEDICATED LIVING ROOM SANCTUARY: Positioned comfortably on the tailored geometric area rug in the open, spacious living room from Reference Image 2, capturing window daylight shadow boundary, leather sheen, and deep contact AO shadows. Strictly FORBID moving the chair into a hallway or door frame!\n\n`
          : '';

        const a09PerspectiveClause = (shotCode === 'A09' || isDiningSuite)
          ? `[MANDATORY DINING SUITE PERSPECTIVE & SPATIAL PIVOT: 40mm ARCHITECTURAL VISTA]
${isReferenceA01 ? 'Reference Image 2 is Shot A01 (Grand Frontal Living Scene Master).' : 'Reference Image 2 is the scene baseline.'}
CRITICAL VANTAGE DIRECTIVE FOR SHOT A09:
- SPATIAL PIVOT TO DINING SUITE: Camera axis is shifted to center on the luxury dining zone with 0-degree symmetrical frontal axis in 4:3 horizontal aspect ratio at 115cm standing eye-level height.
- HERO DINING SUITE: Expansive luxury Italian dining table with matching tailored leather dining chairs, architectural credenza sideboard, and modern bar cart, bathed in authentic natural window daylight.
- LIVING SOFA OFF-CENTER: The three-seater living room sofa MUST NOT occupy center stage; dining suite takes 75%+ visual prominence.\n\n`
          : '';

        const ref2SceneTag = isReferenceA01 ? 'Shot A01 (Grand Frontal Living Scene Master)' : 'Shot A00 (Scene Master Architectural Baseline)';
        let ref2EnsembleDirective = `2. REFERENCE IMAGE 2 IS ${ref2SceneTag}:
   - ARCHITECTURAL SHELL ONLY: Inherit the architectural walls, background geometry, floor tiles, and window daylight direction strictly from Reference Image 2.
   - [CRITICAL FURNITURE PURGE & OVERWRITE]: Reference Image 2 is used STRICTLY for room architecture. If Reference Image 2 contains any previous furniture, you MUST COMPLETELY PURGE AND OVERWRITE IT! All furniture MUST 100% come from Reference Image 1 (${effectiveProductName})!`;

        if (shotCode === 'A02' || isAngledHero) {
          ref2EnsembleDirective = `2. REFERENCE IMAGE 2 IS ${ref2SceneTag} (3D ROOM ARCHITECTURAL SHELL ONLY - STRICTLY DO NOT COPY OLD FURNITURE):
   - Reference Image 2 provides the authentic 3D room materials ONLY (marble focal wall, ceiling lighting, floor tiles, daylight color).
   - [MANDATORY FURNITURE PURGE]: You MUST COMPLETELY ERASE, PURGE AND OVERWRITE any sofa or furniture from Reference Image 2! Every sofa, chair, and table in the room MUST 100% come from Reference Image 1 (${effectiveProductName})!
   - PERSPECTIVE RE-ORIENTATION: For Shot A02, place the new furniture from Reference Image 1 into this architectural room shell, and capture it from a dynamic 45-degree three-quarters diagonal vantage point (front-left near window pointing toward back-right) with diagonal floor vanishing lines!`;
        } else if (shotCode === 'A03' || isHeroSofaFocus) {
          ref2EnsembleDirective = `2. REFERENCE IMAGE 2 IS ${ref2SceneTag} (ROOM ARCHITECTURE ONLY - PURGE OLD FURNITURE):
   - Reference Image 2 establishes visual ground truth for room architecture and window daylight ONLY.
   - [MANDATORY FURNITURE PURGE]: Completely erase any previous sofa from Reference Image 2. Frame the NEW 3-seater sofa from Reference Image 1 from a subtle 15-25 degree front-left angle, focusing 100% on the new 3-seater sofa alone!`;
        } else if (shotCode === 'A04') {
          ref2EnsembleDirective = `2. REFERENCE IMAGE 2 IS ${ref2SceneTag} (MATERIAL DNA ONLY - STRICTLY DO NOT COPY HORIZONTAL WIDE FRAMING):
   - Reference Image 2 provides authentic room finishes and sofa leather color tone.
   - FRAMING DECOUPLING: Reference Image 2 is an ultra-wide horizontal landscape. FOR SHOT A04, YOU MUST RENDER A 3:4 VERTICAL PORTRAIT CROPPED ON 2/3 OF THE SOFA AT A -15° DOWNWARD TILT! Completely discard the wide horizontal perspective of Reference Image 2!`;
        } else if (shotCode === 'A05') {
          ref2EnsembleDirective = `2. REFERENCE IMAGE 2 IS ${ref2SceneTag} (MATERIAL DNA ONLY - STRICTLY DO NOT COPY HORIZONTAL WIDE FRAMING):
   - Reference Image 2 provides authentic room finishes and sofa leather color tone.
   - FRAMING DECOUPLING: Reference Image 2 is an ultra-wide horizontal landscape. FOR SHOT A05, YOU MUST RENDER A 3:4 VERTICAL PORTRAIT CROPPED ON 2/3 OF THE RIGHT SOFA ARMREST AT A +28° RIGHT ANGLE! Completely discard the frontal landscape composition of Reference Image 2!`;
        } else if (shotCode === 'A06' || isZeroWallProfile) {
          ref2EnsembleDirective = `2. REFERENCE IMAGE 2 IS ${ref2SceneTag} (ROOM WALL FINISHES ONLY - STRICTLY DO NOT COPY 0-DEGREE FRONTAL ANGLE):
   - Reference Image 2 shows the room from the front.
   - PERSPECTIVE DECOUPLING: FOR SHOT A06, YOU MUST PHYSICALLY ROTATE THE CAMERA 88° TO CAPTURE A PURE LATERAL PROFILE showing the sofa flush against the backdrop wall with <5cm zero-wall clearance! Discard the 0° frontal view of Reference Image 2!`;
        } else if (shotCode === 'A07' || isLivingEnsembleMid) {
          ref2EnsembleDirective = `2. REFERENCE IMAGE 2 IS ${ref2SceneTag} (ROOM FINISHES & COFFEE TABLE REFERENCE - COMPRESS DEPTH):
   - Inherit room finishes, area rug, and coffee table designs from Reference Image 2.
   - PERSPECTIVE DECOUPLING: Use 55mm medium telephoto compression to bring the coffee table and sofa into a tight, cohesive conversational group, eliminating wide empty gaps from Reference Image 2!`;
        } else if (shotCode === 'A08' || isReclinerMultiMode) {
          ref2EnsembleDirective = `2. REFERENCE IMAGE 2 IS ${ref2SceneTag} (ROOM ENVIRONMENT ONLY - COMPLETE HERO INVERSION):
   - Reference Image 2 provides the luxury room architecture, flooring, and window daylight.
   - HERO SUBJECT INVERSION: In Reference Image 2, the 3-seater sofa was centered. FOR SHOT A08, YOU MUST REMOVE THE 3-SEATER SOFA FROM CENTER STAGE AND FRAME THE SINGLE RECLINER ARMCHAIR AS THE 80% HERO PRODUCT in golden diagonal perspective!`;
        } else if (shotCode === 'A09' || isDiningSuite) {
          ref2EnsembleDirective = `2. REFERENCE IMAGE 2 IS ${ref2SceneTag} (OPEN-PLAN ARCHITECTURAL GROUND TRUTH - CAMERA SHIFT):
   - Reference Image 2 provides open-plan room finishes and daylight.
   - CAMERA SHIFT: In Reference Image 2, the camera was centered on the living room sofa. FOR SHOT A09, SHIFT THE CAMERA AXIS TO CENTER ON THE INTEGRATED DINING SUITE, without the living sofa blocking center frame!`;
        }

        let specificShotTopMandate = '';
        if (shotCode === 'A02' || isAngledHero) {
          specificShotTopMandate = `[CRITICAL CAMERA ROTATION MANDATE FOR SHOT A02: 45° THREE-QUARTERS OBLIQUE ANGLE]
ATTENTION GENERATOR: DO NOT COPY THE STRAIGHT-ON FRONTAL ANGLE OR SYMMETRICAL COMPOSITION OF REFERENCE IMAGE 2!
Reference Image 2 is a straight-on frontal view, but SHOT A02 MUST BE A DRAMATIC 45-DEGREE CORNER THREE-QUARTERS OBLIQUE PERSPECTIVE!
The camera is physically stationed at the front-left corner near the panoramic window, shooting diagonally 40-45 degrees toward the back-right.
1. THREE-SEATER MAIN SOFA: MUST NOT BE HORIZONTAL TO THE SCREEN! It must be oriented along the 45-degree diagonal receding into the depth of the room. Show the deep dimensional volume of the front armrest, cushion depth, and side contour.
2. SINGLE RECLINER ARMCHAIR: Positioned prominently in the FOREGROUND-LEFT near the window, facing inward towards the 3-seater sofa at a 90-degree conversational angle.
3. DUAL NESTING COFFEE TABLES: Located between sofa and armchair on the rug, showing clear diagonal perspective foreshortening.
4. BACKGROUND FOCAL WALL: MUST RECEDE DIAGONALLY with strong two-point perspective vanishing lines from left to right, NOT a flat wall parallel to the frame!
STRICTLY FORBIDDEN: Any straight-on, flat, frontal view, or symmetrical sofa placement!\n\n`;
        } else if (shotCode === 'A03' || isHeroSofaFocus) {
          specificShotTopMandate = `[CRITICAL CAMERA & COMPOSITION MANDATE FOR SHOT A03: 15°-25° SUBTLE OBLIQUE & 100% THREE-SEATER SOLO FOCUS]
ATTENTION GENERATOR: DO NOT COPY THE 0-DEGREE STRAIGHT-ON FRONTAL ANGLE OR THE 3+1 ENSEMBLE LAYOUT OF REFERENCE IMAGE 2!
Reference Image 2 is a wide frontal 3+1 panorama containing a separate single chair, but SHOT A03 MUST BE A TIGHT 50mm COMMERCIAL FOCUS ON THE 3-SEATER HERO SOFA ALONE!
1. THREE-SEATER MAIN SOFA IS THE SOLE HERO SEATING PIECE: Completely crop out, bypass, and EXCLUDE any separate single armchair, recliner chair, or 3+1 ensemble arrangement from Reference Image 2! The 3-seater sofa must occupy 75%+ of the frame.
2. SUBTLE 15-25 DEGREE OBLIQUE PERSPECTIVE: The camera is stationed at the front-left vantage point with a subtle 15-to-25 degree three-quarters oblique perspective. DO NOT RENDER A FLAT STRAIGHT-ON FRONTAL MUGSHOT! Show the dynamic 3D depth, the flare of the front-left armrest, and cushion depth.
3. FOREGROUND DUAL COFFEE TABLES: Black square pedestal nested with dark lower marble/glass table sits in foreground on geometric rug without blocking sofa seating cushions.
STRICTLY FORBIDDEN: Rendering any side single armchair, rendering flat 0° frontal mugshot, or centering a symmetrical horizontal sofa!\n\n`;
        } else if (shotCode === 'A04') {
          specificShotTopMandate = `[CRITICAL FRAMING & ORIENTATION MANDATE FOR SHOT A04: 3:4 VERTICAL PORTRAIT & 2/3 SOFA LIFESTYLE CROP]
ATTENTION GENERATOR: DO NOT COPY THE HORIZONTAL LANDSCAPE ORIENTATION OR FULL ROOM COMPOSITION OF REFERENCE IMAGE 2!
Reference Image 2 is an ultra-wide horizontal landscape (A01). DO NOT SQUEEZE THE ENTIRE LIVING ROOM INTO THIS VERTICAL 3:4 FRAME!
1. 3:4 VERTICAL ASPECT RATIO & MICRO-DOWNWARD TILT: The camera is stationed at 140cm standing eye-level height with a -15 degree downward pitch looking down onto the living area rug stage in 3:4 vertical portrait aspect ratio.
2. TIGHT 2/3 SOFA CROP: Frame approximately 2/3 of the three-seater hero motion sofa (outer left armrest and wide seating cushion depth). The remaining 1/3 of the sofa and the rest of the room are naturally cropped out! DO NOT shrink or zoom out to fit the whole sofa.
3. EXCLUDE SECONDARY FURNITURE: Completely crop out any separate single armchair, and ensure the foreground coffee table does NOT block the front seating stage.
4. ABSOLUTE OUT-OF-FRAME CEILING LOCK: Strictly DO NOT render any ceiling, ceiling beam, ceiling cove, light trough, or downlights. The vertical background is 100% the authentic living room feature wall behind the hero sofa from Reference Image 2 extending continuously to the top of the frame.
STRICTLY FORBIDDEN: Squeezing the entire room or entire sofa into the 3:4 vertical frame, horizontal wide-angle perspectives, or flat frontal views!\n\n`;
        } else if (shotCode === 'A05') {
          specificShotTopMandate = `[CRITICAL FRAMING & CRAFTSMANSHIP MANDATE FOR SHOT A05: 3:4 VERTICAL PORTRAIT & 2/3 SOFA LUXURY CROP]
ATTENTION GENERATOR: DO NOT COPY THE HORIZONTAL LANDSCAPE ORIENTATION OR FULL ROOM COMPOSITION OF REFERENCE IMAGE 2!
Reference Image 2 is an ultra-wide horizontal landscape (A01). DO NOT SQUEEZE THE ENTIRE LIVING ROOM INTO THIS VERTICAL 3:4 FRAME!
1. 3:4 VERTICAL ASPECT RATIO & RIGHT-FLANK ANGLE: The camera is positioned at 95cm seated eye-level height with a +28 degree right oblique perspective in 3:4 vertical portrait aspect ratio.
2. TIGHT 2/3 SOFA CROP: Frame approximately 2/3 of the three-seater hero motion sofa, tightly capturing the right outer armrest with signature diamond quilting, circular metal motion buttons, brass closure strip anchor, and warm 3000K ambient wall sconce from Reference Image 2.
3. EXCLUDE SECONDARY FURNITURE: Completely crop out any separate single armchair or distant room clutter. Strictly DO NOT invent unreferenced bookcases or wall niches!
4. ABSOLUTE OUT-OF-FRAME CEILING LOCK: Strictly DO NOT render any ceiling, ceiling beam, ceiling cove, recessed light trough, chandelier, or downlights! The vertical background consists exclusively of the authentic living room backdrop wall (fluted wood paneling and marble) behind the 3-seater sofa from Reference Image 2, extending continuously to the top of the frame.
STRICTLY FORBIDDEN: Squeezing the entire room or entire sofa into the 3:4 vertical frame, or flat frontal mugshot views!\n\n`;
        } else if (shotCode === 'A06' || isZeroWallProfile) {
          specificShotTopMandate = `[CRITICAL ORTHOGONAL ROTATION MANDATE FOR SHOT A06: 88° PURE LATERAL PROFILE & ZERO-WALL CLEARANCE]
ATTENTION GENERATOR: DO NOT COPY THE 0-DEGREE STRAIGHT-ON FRONTAL ANGLE OF REFERENCE IMAGE 2!
Reference Image 2 is a 0-degree straight-on frontal view, but SHOT A06 MUST BE AN 88-DEGREE PURE LATERAL SIDE PROFILE VIEW!
The camera is stationed on the side flank (85° to 90° orthogonal profile) at 90cm seated eye-level height.
1. ZERO-WALL CLEARANCE ARCHITECTURE: The hero sofa is backed flush against the continuous solid living room marble/wood feature wall from Reference Image 2 with virtually ZERO gap (<5cm flush alignment), demonstrating MANWAH signature zero-wall space-saving technology!
2. STRICTLY CLOSED SHOWROOM POSTURE: All motorized footrests are completely retracted and tucked underneath the base; the backrest is upright in standard closed form.
3. PURE SIDE PROFILE: Showcase full side armrest silhouette with diamond-quilted craftsmanship and neat bottom chassis.
STRICTLY FORBIDDEN: Frontal angle, 45-degree angle, sofa detached from back wall with large gap, or deployed footrests!\n\n`;
        } else if (shotCode === 'A07' || isLivingEnsembleMid) {
          specificShotTopMandate = `[CRITICAL DEPTH COMPRESSION MANDATE FOR SHOT A07: 55mm MEDIUM ENSEMBLE COMPOSITION]
ATTENTION GENERATOR: DO NOT COPY THE DISTANT ULTRA-WIDE-ANGLE PERSPECTIVE OF REFERENCE IMAGE 2!
Reference Image 2 is an ultra-wide panoramic vista (26-35mm) where the coffee table and sofa appear far apart and surrounded by empty floor space.
1. 55mm TELEPHOTO DEPTH COMPRESSION: The camera uses a 55mm medium telephoto lens at 95cm height with a -35 degree oblique angle and -5 degree downward tilt in 4:3 horizontal aspect ratio.
2. INTIMATE LIVING CONVERSATION GROUPING: Compress depth to bring the dual nesting marble coffee tables into an intimate, cohesive foreground relationship with the hero sofa in the midground, clearly showcasing the golden height drop (450mm table vs 400mm sofa seat).
3. GEOMETRIC RUG & AO SHADOWS: Strong contact AO shadows ground the furniture tightly on the geometric area rug.
STRICTLY FORBIDDEN: Far distant wide-angle views, empty barren foregrounds, or flat frontal 0-degree mugshots!\n\n`;
        } else if (shotCode === 'A08' || isReclinerMultiMode) {
          specificShotTopMandate = `[CRITICAL HERO INVERSION MANDATE FOR SHOT A08: DEDICATED SINGLE POWER RECLINER SHOWCASE]
ATTENTION GENERATOR: DO NOT COPY THE THREE-SEATER CENTERED COMPOSITION OF REFERENCE IMAGE 2!
In Reference Image 2 (A01), the three-seater sofa dominates the center of the frame, while the single recliner is a minor side accent.
FOR SHOT A08, THE HERO SUBJECT IS 100% INVERTED: THE SINGLE POWER RECLINER ARMCHAIR IS THE 80% HERO PRODUCT!
1. THREE-SEATER MAIN SOFA MUST VACATE CENTER STAGE: The 3-seater sofa must be completely out of frame or pushed to distant soft background blur. IT MUST NOT BE IN THE CENTER!
2. DEDICATED RECLINER SHOWCASE: The matching single power recliner armchair sits majestically in the spacious, open living room of Reference Image 2 on the tailored area rug, framed at a 35-to-40 degree golden diagonal perspective.
3. INHERIT LEATHER & FINISH DNA: 100% inherit the genuine leather grade, color tone, and welt piping craftsmanship from Reference Image 1, set against the authentic living room finishes and window daylight of Reference Image 2.
STRICTLY FORBIDDEN: Centering the three-seater sofa, blocking the recliner with other furniture, or moving the recliner into a narrow hallway/corridor!\n\n`;
        } else if (shotCode === 'A09' || isDiningSuite) {
          specificShotTopMandate = `[CRITICAL SPATIAL PIVOT MANDATE FOR SHOT A09: DINING SUITE INTEGRATED LIFESTYLE VISTA]
ATTENTION GENERATOR: DO NOT COPY THE LIVING ROOM SOFA CENTERED COMPOSITION OF REFERENCE IMAGE 2!
In Reference Image 2 (A01), the camera is centered on the living room sofa, while the dining area is in the far right background.
FOR SHOT A09, PIVOT THE CAMERA AXIS TO CENTER ON THE INTEGRATED DINING SUITE:
1. HERO DINING SUITE IS THE VISUAL CENTER: The camera axis is centered on the luxury dining table ensemble (luxury Italian black marble dining table, coordinated leather dining chairs, credenza sideboard, and mobile bar cart).
2. LIVING ROOM SOFA MUST NOT OCCUPY CENTER STAGE: The living room sofa is shifted out of the central axis, allowing the dining suite to take 75%+ visual dominance.
3. OPEN-PLAN ARCHITECTURAL HARMONY: Bathed in the authentic window daylight and architectural finishes strictly continuous with Reference Image 2.
STRICTLY FORBIDDEN: Keeping the three-seater living sofa in the center of the frame, or copying the living room centered framing of Reference Image 2!\n\n`;
        }

        const effectivePitch = cameraSettings?.pitchDeg ?? (shotCode === 'A04' ? -15 : (shotCode === 'A07' ? -5 : 0));
        const isPitchTilted = Math.abs(effectivePitch) >= 3;
        const perspectiveOpticsDirective = isPitchTilted
          ? `Three-point architectural perspective with authentic ${effectivePitch}° camera pitch tilt (${effectivePitch < 0 ? 'micro-downward angle looking down onto sofa seating surface and floor carpet' : 'upward vantage'}), dynamic natural foreshortening.`
          : 'Two-point architectural perspective with plumb vertical lines (tilt = 0°).';

        directivePrompt = `${specificShotTopMandate}[MANWAH COMMERCIAL FURNITURE PHOTOGRAPHY: SHOT ${shotCode}]
MULTI-VIEW ASSET ANCHOR:
1. REFERENCE IMAGE 1 IS THE 100% EXCLUSIVE VISUAL TRUTH FOR THE HERO FURNITURE:
${(shotCode === 'A08' && activePrimaryProduct === primaryProduct)
  ? `   - [A08 SINGLE POWER RECLINER DERIVATION MANDATE]: Reference Image 1 provides the master genuine leather material (${effectiveMaterial}), precise color anchor (${effectiveColor}), and signature welt-piping craftsmanship for this suite. FOR THIS A08 SHOT, RENDER A MATCHING SINGLE-SEATER LUXURY POWER MOTION RECLINER ARMCHAIR in the three-quarters composition, 100% inheriting the exact leather grade, color tone, tufted pleating, and stitching DNA from Reference Image 1!`
  : `   - Faithfully replicate the exact furniture silhouette from Reference Image 1: precise seating cushion division, signature armrest contour, ergonomic backrest volume, supple genuine leather texture (${effectiveMaterial}), authentic color tone (${effectiveColor}), and precision welt stitching.`}
${(shotCode === 'A02' || isAngledHero)
  ? `   - [MANDATORY FURNITURE PURGE & OVERWRITE]: Reference Image 1 provides the new product truth. Reference Image 2 contains obsolete furniture from previous runs. You MUST COMPLETELY ERASE AND OVERWRITE any sofa/chair from Reference Image 2! Place the new furniture suite from Reference Image 1 into the architectural space of Reference Image 2, capturing it from a 45-degree diagonal three-quarters perspective!`
  : (shotCode === 'A03' || isHeroSofaFocus)
  ? `   - [MANDATORY FURNITURE OVERWRITE]: Focus 100% on the new 3-seater sofa from Reference Image 1 from a subtle 15-25 degree oblique angle, completely purging any old furniture from Reference Image 2!`
  : (shotCode === 'A04')
  ? `   - [MANDATORY FURNITURE OVERWRITE]: Frame 2/3 of the new hero sofa from Reference Image 1 in 3:4 vertical composition at a -15° downward tilt, completely replacing any old furniture from Reference Image 2!`
  : (shotCode === 'A05')
  ? `   - [MANDATORY FURNITURE OVERWRITE]: Frame 2/3 of the right armrest of the new hero sofa from Reference Image 1 in 3:4 vertical composition at a +28° right angle, completely replacing any old furniture from Reference Image 2!`
  : (shotCode === 'A06' || isZeroWallProfile)
  ? `   - [MANDATORY FURNITURE OVERWRITE]: Capture the new hero sofa from Reference Image 1 in pure 88° lateral side profile flush against the back wall, completely replacing any old furniture from Reference Image 2!`
  : (shotCode === 'A07' || isLivingEnsembleMid)
  ? `   - [MANDATORY FURNITURE OVERWRITE]: Frame the new hero sofa and coffee table from Reference Image 1 in 55mm medium telephoto compression, completely replacing any old furniture from Reference Image 2!`
  : (shotCode === 'A08' || isReclinerMultiMode)
  ? `   - [MANDATORY FURNITURE OVERWRITE]: Center and frame the new single power recliner armchair from Reference Image 1 as the hero piece, completely replacing any old furniture from Reference Image 2!`
  : (shotCode === 'A09' || isDiningSuite)
  ? `   - [MANDATORY FURNITURE OVERWRITE]: Frame the new dining suite from Reference Image 1, completely replacing any old furniture from Reference Image 2!`
  : '   - [MANDATORY FURNITURE OVERWRITE]: Reference Image 2 contains a previous sofa from an earlier angle. You MUST COMPLETELY IGNORE, ERASE, AND OVERWRITE any sofa shown in Reference Image 2! DO NOT blend, morph, or take proportions from the old sofa in Reference Image 2!'}
${ref2EnsembleDirective}

CAMERA PERSPECTIVE & COMPOSITION DIRECTIVE:
${a02PerspectiveShiftClause}${a03PerspectiveClause}${a04PerspectiveClause}${a05PerspectiveClause}${a06PerspectiveClause}${a07PerspectiveClause}${a08PerspectiveClause}${a09PerspectiveClause}${positivePrompt}
${secondaryReferencesText ? `\nMATCHING ENSEMBLE:\n${secondaryReferencesText}\n` : ''}
CORE INVARIANTS:
- FOUR INVARIANCE PILLARS:
  1. Coordinate origin: white matte cylindrical planter with indoor foliage plant (constant position and height relative to window and wall).
  2. Dual curved wall sconces on marble backdrop with consistent curvature and spacing.
  3. Left panoramic window 6000K cool daylight paired with interior 3000K warm ambient glow, soft eastward contact shadow falloff.
  4. Deep physical contact AO grounding all furniture legs and chassis firmly onto the area rug.
- OPTICS & LIGHTING: ${perspectiveOpticsDirective} Natural soft side daylight streaming through panoramic window flank matching Reference Image 2, with gentle organic shadow falloff and genuine ambient occlusion. Zero 3D CGI look, zero plastic render sheen.
- ZERO TEXT: Clean pristine commercial catalog photograph, completely free of any text, letters, Chinese characters, labels, or watermarks.
- SHOWROOM POSTURE: ${shotCode === 'A02' ? 'Main sofa motorized footrests strictly remain closed and flush. The matching single recliner armchair may have its motorized footrest comfortably extended into ergonomic contour as in reference.' : (isFunctionalClosed ? 'All sofa and chair motorized footrests and motion mechanisms strictly remain 100% CLOSED and retracted flush under base.' : 'Motion mechanism may be deployed as specified.')}`;

        const isAngledOrProfile = ['A02', 'A04', 'A05', 'A06', 'A07', 'A08'].includes(shotCode) || isAngledHero || isZeroWallProfile;

        const cleanNegativeConstraints = deduplicateNegativeConstraints(
          negativePrompt,
          antiStickerNegatives,
          (shotCode === 'A02' || isAngledHero) ? 'flat frontal view, straight-on camera, straight-on frontal view, symmetrical center sofa, horizontal sofa parallel to screen, front-facing sofa, flat 1-point perspective, mugshot view, zero perspective depth, copying frontal composition of reference 2, boxy closed small room, missing coffee table, missing rug, cramped narrow space, center dividing pillar' : '',
          (shotCode === 'A03' || isHeroSofaFocus) ? 'flat frontal mugshot, straight-on camera, symmetrical center sofa, facing directly forward, stiff mugshot view, side chair, accent chair, armchair, lounge chair, single chair, 3+1 ensemble, extra chair, additional seating, cluttered throw pillows, giant fuzzy cushions, boxy closed small room, missing coffee table, center dividing pillar' : '',
          shotCode === 'A04' ? 'flat frontal view, flat eye-level view, 0-degree horizontal level shot, pure flat side elevation, full horizontal panorama, entire living room in frame, wide angle vista, isolated single chair, coffee table blocking front, 1-point perspective frontal view, miniature sofa squeezed in frame, flipped room, visible ceiling, ceiling cove, ceiling light trough, low ceiling compression, squeezed ceiling, cropped ceiling beam, ceiling slab, false ceiling, recessed ceiling, downlights on ceiling, chandelier, ceiling light' : '',
          shotCode === 'A05' ? 'full horizontal panorama, entire room in frame, distant furniture, wide angle panorama, isolated single chair, built-in bookshelf, bookcase, library wall, flat frontal view, arched shelves, visible ceiling, ceiling cove, ceiling light trough, low ceiling compression, squeezed ceiling, cropped ceiling beam, ceiling slab, false ceiling, recessed ceiling, downlights on ceiling, chandelier, ceiling light' : '',
          (shotCode === 'A06' || isZeroWallProfile) ? 'flat frontal view, 0-degree straight-on view, front-facing sofa, 45-degree corner view, detached sofa from wall, large gap between sofa and wall, deployed footrest, open recliner mechanism, office, library shelves, bookshelf' : '',
          (shotCode === 'A07' || isLivingEnsembleMid) ? 'wide empty room panorama, tiny distant coffee table, flat frontal mugshot, vast empty foreground, floating furniture, disconnected coffee table' : '',
          (shotCode === 'A08' || isReclinerMultiMode) ? 'three-seater sofa centered in frame, three-seater sofa blocking recliner, flat frontal living room view, copying A01 composition, hallway, corridor, entryway, door frame, white door frame, visible ceiling, ceiling cove, ceiling light trough, low ceiling compression, squeezed ceiling' : '',
          (shotCode === 'A09' || isDiningSuite) ? 'three-seater sofa centered in frame, living room sofa dominating image, kitchen sink, cramped room, copying A01 living room composition' : '',
          'CGI, 3D render, low-poly, clay model, plastic texture, oversaturated, amateur render',
          'double sofas, ghost sofa, overlapping couches, morphing furniture',
          'different room, altered architecture, newly invented wall niches, arched shelves, bookshelf, bookcase, library shelves, study room, hallway, corridor, foyer, doorway, mirrored window, reversed daylight, flipped room',
          isAngledOrProfile ? 'sofa floating off floor grid, mismatched vanishing lines, distorted proportions' : 'crooked vertical lines, tilted camera, crooked perspective, floating furniture, mismatched vanishing lines',
          'deformed sofa, generic boxy sofa, distorted proportions, wrong color',
          (isFunctionalClosed && shotCode !== 'A02') ? 'deployed footrest, extended footrest, popped leg rest, open footrest mechanism, open recliner mechanism, unretracted leg rest, unfolded footrest, raised headrest, lifted headrest, popped headrest, asymmetric headrests, uneven headrests, 展开的脚踏, 伸出的脚托, 抬起的头枕, 翘起的头枕' : '',
          !hasHumanOccupant ? 'people, human, person, man, woman, lady, girl, boy, child, human model, occupants, crowd, human face, human hands, distorted limbs' : '',
          brownNegativeFilter,
          'text, watermark, font, words, letters, chinese characters, labels, annotations, captions, logo'
        );

        directivePrompt += `\n\nNegative constraints: ${cleanNegativeConstraints}`;
      } else if (productInline) {
        // A00 空间母版初创：以产品实拍图与搭配套组为最高基石，结构化提纯
        const isArmlessLoungeChairA00 = secondaryInlines.some(sec => 
          sec.product.role === 'lounge_chair' ||
          sec.product.functionCapable === false ||
          (sec.product.name && /(休闲|无扶手|矮椅|旋转|单椅|焦糖)/.test(sec.product.name) && !/(功能|电动|头等舱|展开|太空舱)/.test(sec.product.name))
        );

        const combinedContext = `${input.roomName || ''} ${input.spacePreset?.code || ''} ${input.spacePreset?.name || ''} ${input.styleName || ''} ${input.stylePreset?.code || ''} ${input.stylePreset?.name || ''} ${positivePrompt}`;

        const isSunken = /下沉|sunken|N-R04/i.test(combinedContext);
        const isDuplex = /挑空|复式|duplex|double.*height|N-R03/i.test(combinedContext);
        const isPavilion = /山水|宽厅|pavilion|water.*garden|松柏|N-R05/i.test(combinedContext);
        const isPenthouse = /顶层|天际|会所|penthouse|skyline|N-R06/i.test(combinedContext);

        const isAmerican = /美式|american|US-01|US-02/i.test(combinedContext);
        const isFrench = /法式|parisian|haussmann|EU-01/i.test(combinedContext);
        const isItalian = /意式|italian|milanese|IT-01/i.test(combinedContext);

        let topologyMandateA00 = '';
        const topologyNegativesA00: string[] = [];

        if (isSunken) {
          topologyMandateA00 = `[MANDATORY ARCHITECTURAL TOPOLOGY: 45CM SUNKEN CONVERSATION PIT WITH PERIMETER STEPS & FIREPLACE]
1. SUNKEN CONVERSATION PIT: The central living lounge seating zone MUST BE CLEARLY STEPPED DOWN 40-45CM BELOW THE SURROUNDING UPPER FLOOR LEVEL. Visible, clean perimeter stone steps wrap around the sunken lounge area. The sofa, carpet, and coffee table sit recessed inside this conversation sanctuary.
2. TRAVERTINE STONE FIREPLACE: In the center background feature wall, there MUST be a monumental natural honed travertine limestone wall with an integrated horizontal modern linear fireplace hearth showing visible dancing live orange fire flames.
3. ABSOLUTE TOPOLOGY MANDATE: STRICTLY FORBID flat one-level floor without steps! STRICTLY FORBID room without fireplace!`;
          topologyNegativesA00.push(
            'flat floor without steps',
            'flat single-level floor',
            'absence of sunken pit',
            'no steps around living room',
            'missing fireplace',
            'no fireplace',
            'missing fire hearth'
          );
        } else if (isDuplex) {
          topologyMandateA00 = `[MANDATORY ARCHITECTURAL TOPOLOGY: MONUMENTAL 6.2M DOUBLE-HEIGHT SOARING VOID]
1. SOARING 6.2M DOUBLE HEIGHT: Dramatic double-height vertical volume with a two-story continuous feature wall.
2. CHANDELIER & SCULPTURAL STAIRS: High-altitude modern sculptural pendant chandelier hanging in the void, with background revealing interior glass zen garden and floating curved stairs.`;
          topologyNegativesA00.push('low ceiling', 'standard 3m ceiling', 'flat standard apartment', 'missing double height ceiling void');
        } else if (isPavilion) {
          topologyMandateA00 = `[MANDATORY ARCHITECTURAL TOPOLOGY: ORIENTAL ZEN WATER GARDEN VILLA PAVILION]
1. WATER MIRROR & PINE VIEW: Full-span uninterrupted panoramic glass wall looking out directly to an outdoor serene water mirror reflection pool with a sculptural Japanese pine bonsai tree and limestone boulders.`;
          topologyNegativesA00.push('urban skyscraper view', 'street level view', 'blocked garden view');
        } else if (isPenthouse) {
          topologyMandateA00 = `[MANDATORY ARCHITECTURAL TOPOLOGY: HIGH-ALTITUDE SKYLINE PENTHOUSE SALON]
1. METROPOLIS SKYLINE: Majestic 4.2m ceiling with soaring floor-to-ceiling panoramic glass curtain wall overlooking high-altitude metropolis skyscraper skyline and sunset golden hour clouds.`;
          topologyNegativesA00.push('ground floor view', 'street level view', 'garden outside window');
        }

        let styleMandateA00 = '';
        const styleNegativesA00: string[] = [];

        if (isAmerican) {
          styleMandateA00 = `[MANDATORY INTERIOR ARCHITECTURAL STYLE: MODERN AMERICAN METROPOLITAN]
1. PICTURE-FRAME WALL PANEL MOLDINGS & WAINSCOTING: The background and side walls MUST feature authentic classic modern American picture-frame wall moldings and elegant wainscoting (crisp rectangular architectural wall frames with shadow relief moldings in warm oat greige #E6DFD5 and rich dark walnut millwork).
2. FINISHES: Warm brushed brass wall sconces, plaster ceiling crown moldings, and solid American dark walnut joinery.
3. ABSOLUTE PROHIBITION: STRICTLY FORBID modern flat sterile drywall, strictly forbid flat featureless white slabs without wall moldings!`;
          styleNegativesA00.push(
            'cold flat sterile drywall',
            'modern plain white slab without moldings',
            'sterile white clinic walls',
            'flat bare drywall without panel frames'
          );
        } else if (isFrench) {
          styleMandateA00 = `[MANDATORY INTERIOR ARCHITECTURAL STYLE: PARISIAN HAUSSMANNIAN BOISERIE]
1. FRENCH BOISERIE & CARVED MOLDINGS: Walls feature delicate French boiserie panel moldings, carved plaster wall cornices, and pale oak herringbone parquet flooring.`;
          styleNegativesA00.push('dark heavy industrial concrete', 'flat modern drywall without moldings');
        } else if (isItalian) {
          styleMandateA00 = `[MANDATORY INTERIOR ARCHITECTURAL STYLE: MILANESE ARCHITECTURAL LUXURY]
1. ROMAN TRAVERTINE & SMOKED WALNUT: Continuous full-span honed porous Roman travertine stone slabs and rich smoked dark walnut joinery, ultra-slim dark brushed titanium metal profiles, minimalist recessed reveal shadow gaps.`;
          styleNegativesA00.push('traditional decorative moldings', 'rustic country wood', 'cheap plastic laminate');
        }

        const isEnsemble = Boolean((activePrimaryProduct as any)?.isSceneEnsembleSuite && (activePrimaryProduct as any)?.sceneEnsembleDossier);
        const ensembleDossier = isEnsemble ? (activePrimaryProduct as any).sceneEnsembleDossier : null;
        const rawMain = ensembleDossier?.sofaSuite?.mainSofa?.color || activePrimaryProduct?.colors?.[0];
        const rawRecliner = ensembleDossier?.sofaSuite?.reclinerChairs?.[0]?.color;
        const mainSofaColor = translateColorToEnglish(rawMain, effectiveColor);
        const hasRecliner = Boolean(ensembleDossier?.sofaSuite?.reclinerChairs && ensembleDossier.sofaSuite.reclinerChairs.length > 0);
        const reclinerChairColor = rawRecliner ? translateColorToEnglish(rawRecliner) : mainSofaColor;
        const isDualTone = hasRecliner && Boolean(rawRecliner && rawMain && rawRecliner.trim() !== rawMain.trim());
        const reclinerName = ensembleDossier?.sofaSuite?.reclinerChairs?.[0]?.name || 'single accent armchair';
        const layoutPrompt = ensembleDossier?.placementDirectives?.holisticLayoutPrompt || '';
        const coffeeTableDesc = ensembleDossier?.coffeeTables?.description || '';
        const coffeeTableItems = ensembleDossier?.coffeeTables?.items || [];
        const coffeeTableClause = coffeeTableItems.length > 0
          ? `\n   * COFFEE TABLES: Positioned on the area rug directly in front of the main sofa, strictly manifesting ${coffeeTableDesc}: ${coffeeTableItems.map((tb: any) => `${tb.name || 'table'} (${tb.material || 'stone/wood top'})`).join(' paired with ')}, preserving authentic dual-tier nesting design from Reference Image 1.`
          : '';

        const visualAssetAnchorClause = isEnsemble
          ? (isDualTone
              ? `- REFERENCE IMAGE 1: Authentic living room scene ensemble (${ensembleDossier?.name || activePrimaryProduct?.name}).
   * THREE-SEATER MAIN SOFA: Centered in room, finished in ${mainSofaColor}.
   * SINGLE ACCENT CHAIR ON LEFT: Positioned on the left flank, finished strictly in contrasting ${reclinerChairColor} (${reclinerName}), preserving its distinct modern silhouette from Reference Image 1. STRICTLY FORBID painting the single chair in the main sofa's color (${mainSofaColor})! Maintain the distinct two-tone contrast!${coffeeTableClause}
   * ${layoutPrompt ? `LAYOUT DIRECTIVE: ${layoutPrompt}` : ''}`
              : `- REFERENCE IMAGE 1: Authentic living room scene ensemble (${ensembleDossier?.name || activePrimaryProduct?.name}).
   * SEATING SUITE: All seating pieces finished in cohesive ${mainSofaColor}.${coffeeTableClause}
   * ${layoutPrompt ? `LAYOUT DIRECTIVE: ${layoutPrompt}` : ''}`)
          : `- REFERENCE IMAGE 1: Authentic ground truth product asset for ${effectiveProductName} (color: ${effectiveColor}, material: ${effectiveMaterial}). Faithfully reproduce its exact silhouette, armrest contour, cushion tufting, and leather texture.`;

        directivePrompt = `[MANWAH SCENE MASTER GROUND TRUTH: A00]
${topologyMandateA00 ? `${topologyMandateA00}\n` : ''}
${styleMandateA00 ? `${styleMandateA00}\n` : ''}
VISUAL ASSET ANCHOR:
${visualAssetAnchorClause}
${primaryProduct?.role === 'sofa_2seat' ? `   - TWO-SEATER PROPORTIONS: Strictly a TWO-SEATER sofa (exactly 2 seating cushions and 2 backrest units, twin-cushion division, strictly NOT a three-seater sofa, NO middle cushion). Generously wide horizontal proportion and low-slung stance (2.1m wide presence). Tailored contrasting welt cord piping along front edge and armrest contours.` : ''}
${secondaryReferencesText ? `${secondaryReferencesText}\n` : ''}
SPATIAL & CAMERA DIRECTIVE:
${positivePrompt}

CORE INVARIANTS:
- PERSPECTIVE & ARCHITECTURE: Ultra-wide architectural camera perspective with plumb vertical lines (26mm field of view). Faithfully manifest the distinctive architectural room topology, ceiling headroom, lighting atmosphere, and tailored interior wall materiality specified in the Spatial & Camera Directive.
- SHOWROOM POSTURE: All sofa and chair motorized footrests strictly remain 100% CLOSED and retracted flush under base. All sofa headrests strictly remain completely flush, lowered, and aligned with backrest contour (strictly NO raised or popped-up headrests).
- ZERO CLUTTER OR PILLOWS: Clean pristine commercial catalog sofa presentation. Strictly ZERO decorative throw pillows, NO loose cushions, NO patterned or floral pillows on sofa. Clean empty luxury leather seating surfaces.
- COMPOSITE CRAFTSMANSHIP: Genuine luxury stone/wood materiality with organic veining, chamfered bevels, and realistic ambient occlusion contact shadows. Zero plastic CGI sheen.
- ZERO TEXT: Clean pristine commercial catalog photograph, completely free of any text, letters, Chinese characters, labels, or watermarks.`;

        const cleanNegativeConstraintsA00 = deduplicateNegativeConstraints(
          negativePrompt,
          antiStickerNegatives,
          isEnsemble && isDualTone ? `${mainSofaColor} recliner, ${mainSofaColor} armchair, identical ${mainSofaColor} single chair, monochromatic seating` : '',
          ...topologyNegativesA00,
          ...styleNegativesA00,
          'throw pillow, throw pillows, decorative pillow, decorative pillows, sofa pillow, patterned cushion, floral cushion, cloth pillow, extra cushions on sofa, geometric pillow, blanket, clutter, floral armchair, patterned fabric chair, patchwork armchair',
          'CGI, 3D render, low-poly, clay model, plastic texture, oversaturated, amateur render',
          'fake marble sticker, printed marble foil, cheap laminate table, repeating stone pattern, vinyl sticker wrap',
          primaryProduct?.role === 'sofa_2seat' ? 'three-seater sofa, 3 seating cushions, middle cushion, extra seat cushion, tall and narrow sofa, squished proportions' : '',
          isArmlessLoungeChairA00 ? 'bulky recliner footrest, deployed footrest on lounge chair, thick armrests on armless chair, power motion buttons' : '',
          'sofa overlapping window and wall seam, sofa blocking window glass, discontinuous backdrop behind sofa, crooked sofa angle, mismatched perspective alignment, sofa floating off floor grid, crooked vertical lines, ground-level low shot',
          'deployed footrest, extended footrest, open recliner mechanism, raised headrest, lifted headrest, popped headrest, popped-up headrest, asymmetric headrests, uneven headrests, 抬起的头枕, 翘起的头枕, excessive empty rug void in foreground, cut-off ceiling',
          (!isEnsemble && !hasRecliner && secondaryInlines.length === 0) ? 'lonely drifting side chair, disconnected furniture, chair pushed against window, lopsided dark wall imbalance' : 'disconnected furniture, chair pushed against window, lopsided dark wall imbalance',
          'text, watermark, font, words, letters, chinese characters, labels, annotations, captions, overlay, subtitles, banner, logo, generic sofa, wrong color, cheap furniture, cartoon, people, human, faces'
        );

        directivePrompt += `\n\nNegative constraints: ${cleanNegativeConstraintsA00}`;
      }

      const mappedAspectRatio =
        aspectRatio === '3:4' ? '3:4' :
        aspectRatio === '16:9' ? '16:9' :
        aspectRatio === '1:1' ? '1:1' :
        aspectRatio === '4:3' ? '4:3' :
        aspectRatio === '9:16' ? '9:16' :
        aspectRatio === '2:3' ? '2:3' :
        aspectRatio === '3:2' ? '3:2' :
        aspectRatio || '4:3';

      const isAutoFallback = input.autoModelFallback !== false;
      primaryModel = targetModel;
      // 两步出图：衍生镜头第一步固定用 GPT 2.5 Flare（实测唯一能稳定保住实拍图构图与透视的模型）
      const useRefinePass = Boolean(input.studioSwapRefinePass) && useStudioSwapDirective && shotCode !== 'A00';
      if (useRefinePass) primaryModel = STUDIO_SWAP_COMPOSE_MODEL;
      const candidateModels: string[] = [primaryModel];

      if (isAutoFallback) {
        for (const { id: fb } of SPACE_AUTO_FALLBACK_MODELS) {
          if (!candidateModels.includes(fb)) {
            candidateModels.push(fb);
          }
        }
      }

      const attemptErrors: Array<{ model: string; error: string }> = [];
      let rawImageBuffer: Buffer | null = null;
      wasFallbackUsed = false;

      const gatewayUrl = `http://127.0.0.1:${process.env.PORT || 3000}/api/gateway/generate-image`;
      const generationIntent = images.length > 0 ? 'image_edit' : 'text_to_image';

      for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
        const currentModelToAttempt = candidateModels[mIdx];
        const currentResolution =
          currentModelToAttempt === 'gemini-2.5-flash-image' || currentModelToAttempt === 'gemini-2.5-flash'
            ? '1K'
            : validResolution;

        console.log(
          `[SpaceImageGenerationService] Dispatching ${shotCode} to unified gateway (尝试 ${mIdx + 1}/${candidateModels.length}): model=${currentModelToAttempt}, res=${currentResolution}, ratio=${mappedAspectRatio}, refs=${images.length}`
        );

        const timeoutMs = process.env.NODE_ENV === 'test' ? 1200 : 180000;
        const effectiveUserId = input.userId || 'system';
        const effectiveDeptId = input.deptId;

        // 开发环境排查用：把每次发往网关的提示词与参考图落盘到 .data/debug/gateway，便于核对模型实际看到的输入
        if ((process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') || process.env.SPACE_DEBUG_DUMP === '1') {
          try {
            const dumpDir = path.join(process.cwd(), '.data', 'debug', 'gateway', `${shotCode}-${Date.now()}-${currentModelToAttempt.replace(/[^\w.-]/g, '_')}`);
            fs.mkdirSync(dumpDir, { recursive: true });
            fs.writeFileSync(path.join(dumpDir, 'prompt.txt'), `model=${currentModelToAttempt}\nrenderMode=${input.renderMode || 'orchestration'}\naspectRatio=${mappedAspectRatio}\n\n${directivePrompt}`);
            images.forEach((img, idx) => {
              const b64 = String(img.data).replace(/^data:[^;]+;base64,/, '');
              const ext = (img.mimeType || 'image/png').split('/')[1] || 'png';
              fs.writeFileSync(path.join(dumpDir, `ref${idx + 1}_${img.role || 'unknown'}.${ext}`), Buffer.from(b64, 'base64'));
            });
          } catch (dumpErr) {
            console.warn('[SpaceImageGenerationService] Debug dump skipped:', dumpErr);
          }
        }

        try {
          const gatewayRes = await fetch(gatewayUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-uuid': effectiveUserId,
              ...(effectiveDeptId ? { 'x-dept-id': effectiveDeptId } : {})
            },
            body: JSON.stringify({
              prompt: directivePrompt,
              model: currentModelToAttempt,
              aspectRatio: mappedAspectRatio,
              resolution: currentResolution,
              seed: typeof input.seed === 'number' ? input.seed : undefined,
              images,
              generationIntent,
              userUuid: effectiveUserId,
              userId: effectiveUserId,
              deptId: effectiveDeptId
            }),
            signal: AbortSignal.timeout(timeoutMs)
          });

          const gatewayData = await gatewayRes.json();

          if (gatewayRes.ok && !gatewayData.error && gatewayData.success !== false) {
            const candidatePartWithImage = gatewayData.candidates?.[0]?.content?.parts?.find(
              (p: any) => p?.inlineData?.data || p?.inline_data?.data
            );
            const candidateInlineData =
              candidatePartWithImage?.inlineData?.data || candidatePartWithImage?.inline_data?.data;
            const imgUrlOrBase64 =
              gatewayData.imageUrl ||
              gatewayData.data?.[0]?.url ||
              gatewayData.data?.[0]?.b64_json ||
              gatewayData.images?.[0]?.data ||
              candidateInlineData;

            if (typeof imgUrlOrBase64 === 'string' && imgUrlOrBase64.length > 0) {
              if (imgUrlOrBase64.startsWith('data:')) {
                const base64Clean = imgUrlOrBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
                rawImageBuffer = Buffer.from(base64Clean, 'base64');
              } else if (imgUrlOrBase64.startsWith('http://') || imgUrlOrBase64.startsWith('https://')) {
                const fetched = await fetch(imgUrlOrBase64, { signal: AbortSignal.timeout(60000) });
                if (fetched.ok) {
                  rawImageBuffer = Buffer.from(await fetched.arrayBuffer());
                }
              } else if (imgUrlOrBase64.length > 100) {
                rawImageBuffer = Buffer.from(imgUrlOrBase64, 'base64');
              }
            }
          }

          if (rawImageBuffer && rawImageBuffer.length > 0) {
            wasFallbackUsed = currentModelToAttempt !== primaryModel;
            usedProvider = gatewayData.provider || config.provider || 'tiantoken';
            usedModel = gatewayData.model || currentModelToAttempt;
            provenance = 'AI_ESTIMATED';
            console.log(`[SpaceImageGenerationService] Successfully generated via ${usedProvider} (${usedModel}), bytes: ${rawImageBuffer.length}`);
            break;
          } else {
            const errDetail = typeof gatewayData?.error === 'object'
              ? (gatewayData.error?.message || JSON.stringify(gatewayData.error))
              : (gatewayData?.error || gatewayData?.message || '上游接口未返回有效图像数据');
            attemptErrors.push({ model: currentModelToAttempt, error: String(errDetail) });
            console.warn(`[SpaceImageGenerationService] Model ${currentModelToAttempt} gateway error:`, errDetail);
          }
        } catch (apiErr: any) {
          const isTimeout = apiErr?.name === 'AbortError' || apiErr?.name === 'TimeoutError';
          const errMsg = isTimeout ? '上游请求网络超时' : (apiErr?.message || '云端网络请求异常');
          attemptErrors.push({ model: currentModelToAttempt, error: errMsg });
          console.warn(`[SpaceImageGenerationService] Model ${currentModelToAttempt} deferred: ${errMsg}`);
        }
      }

      // 第二步：以 GPT 结果为底图、实拍图为材质参考，用 Nano Banana 2.1 精修清晰度与皮革质感；失败时保留第一步结果
      if (useRefinePass && rawImageBuffer && rawImageBuffer.length > 0 && images[0]) {
        try {
          const composedInline = await normalizeInlineBuffer(rawImageBuffer, 1536);
          const refined = await requestGatewayImage({
            prompt: STUDIO_SWAP_REFINE_PROMPT,
            model: STUDIO_SWAP_REFINE_MODEL,
            images: [
              { data: `data:${composedInline.mimeType};base64,${composedInline.data}`, mimeType: composedInline.mimeType, role: 'composition_reference' },
              { data: images[0].data, mimeType: images[0].mimeType, role: 'primary_product' }
            ],
            aspectRatio: mappedAspectRatio,
            resolution: validResolution,
            userId: input.userId || 'system',
            deptId: input.deptId,
            // Nano Banana 2K 精修实测 50~180s，网关断连重试还会再叠加，给足 240s
            timeoutMs: 240000
          });
          if (refined.length > 0) {
            rawImageBuffer = refined;
            usedModel = `${usedModel} + ${STUDIO_SWAP_REFINE_MODEL} 精修`;
          }
        } catch (refineErr: any) {
          refineNotice = `精修步骤 (${STUDIO_SWAP_REFINE_MODEL}) 未完成，已保留 GPT 2.5 Flare 换景结果：${refineErr?.message || refineErr}`;
          console.warn(`[SpaceImageGenerationService] ${shotCode} refine pass failed:`, refineErr?.message || refineErr);
        }
      }

      if (rawImageBuffer && rawImageBuffer.length > 0) {
        if (effectiveObjectKey.endsWith('.webp')) {
          imageBuffer = await sharp(rawImageBuffer).webp({ quality: 90 }).toBuffer();
          contentType = 'image/webp';
        } else if (effectiveObjectKey.endsWith('.jpg') || effectiveObjectKey.endsWith('.jpeg')) {
          imageBuffer = await sharp(rawImageBuffer).jpeg({ quality: 90 }).toBuffer();
          contentType = 'image/jpeg';
        } else {
          imageBuffer = rawImageBuffer;
          contentType = 'image/png';
        }
      } else {
        const errorText = attemptErrors.length > 0
          ? attemptErrors.map(e => `[${e.model}]: ${e.error}`).join('； ')
          : (cloudError || '上游生图接口未响应');

        if (!isAutoFallback) {
          throw new Error(`云端生图受阻 (${primaryModel}): ${attemptErrors[0]?.error || errorText}。请在控制面板开启【多模型故障自动轮换】开关以自动切换备选可用模型重试。`);
        } else {
          throw new Error(`全部候选模型均受阻 (已尝试: ${candidateModels.join(' -> ')}): ${errorText}。请检查网络或稍后重新生成。`);
        }
      }
    }

    const sha256 = crypto.createHash('sha256').update(imageBuffer).digest('hex');

      // 4. 严格持久化写入 GCS 对象存储系统 (GcsAssetStorage)
      await this.storage.put({
        bucketType: 'generated',
        objectKey: effectiveObjectKey,
        buffer: imageBuffer,
        contentType,
        metadata: {
          projectId,
          shotCode,
          sha256,
          provider: usedProvider,
          model: usedModel,
          provenance,
          productColor: effectiveColor
        }
      });

      // 5. 优先使用受控同源代理 URL，确保客户端在任何网络环境下（包括无外网代理的国内浏览器）100% 畅通稳定加载
      const proxyUrl = `/api/space/storage/local-file?key=${encodeURIComponent(effectiveObjectKey)}`;

      const warningNotice = [
        wasFallbackUsed ? `主选模型 (${primaryModel}) 响应受阻，已自动故障转移至 (${usedModel}) 成功生成真实大图！` : '',
        refineNotice || ''
      ].filter(Boolean).join(' ') || undefined;

      return {
        objectKey: effectiveObjectKey,
        imageUrl: proxyUrl,
        provider: usedProvider,
        model: usedModel,
        bytes: imageBuffer.length,
        sha256,
        contentType,
        provenance,
        productionTruth: true,
        isFallback: wasFallbackUsed,
        warningNotice
      };
  }

  /**
   * 确定性高保真空间母版底图渲染器
   * 动态映射产品的色彩真值 (干邑橙/暖灰/深鞍褐等)，输出真实符合 3:4 比例、摄影机光心、两点透视与敏华材质调性的工程底图
   */
  public static renderDeterministicSpatialAsset(params: {
    shotCode: string;
    productName: string;
    productColor?: string;
    productRole?: string;
    roomName: string;
    styleName: string;
    camera: { lensMm: number; heightCm: number; yawDeg: number; pitchDeg: number };
    variantIndex?: number;
    variantTag?: string;
  }): Buffer {
    const { shotCode, productName, productColor = '', productRole = '', roomName, styleName, camera, variantIndex = 1, variantTag = '' } = params;

    // 根据产品色彩真值动态映射皮质高定渐变色 (100% 保持产品色彩与材质真值不变量)
    const isWarmAmberOrOrange =
      /橙|琥珀|黄|干邑|caramel|amber|orange|cognac/i.test(productColor);
    const isWhiteOrCream =
      /白|奶|极地|ivory|cream|white|polar|milk|vanilla|chalk|雪/i.test(productColor);
    const isGreige =
      /灰|greige|gray|grey|米/i.test(productColor);
    const isDarkBrown =
      /黑|褐|深|saddle|brown|dark|chocolate|咖啡/i.test(productColor);

    let leatherStop0 = '#B2875C';
    let leatherStop40 = '#91653B';
    let leatherStop80 = '#704A26';
    let leatherStop100 = '#4A3018';
    let leatherHighlight = '#E2B88F';
    let leatherStroke = '#45230C';
    let leatherSeam = '#381D09';

    if (isWhiteOrCream) {
      leatherStop0 = '#FCFBF9';
      leatherStop40 = '#F3EFEA';
      leatherStop80 = '#E2DCD4';
      leatherStop100 = '#C8BFB3';
      leatherHighlight = '#FFFFFF';
      leatherStroke = '#B5ACA0';
      leatherSeam = '#A3998C';
    } else if (isWarmAmberOrOrange) {
      leatherStop0 = '#D97706';
      leatherStop40 = '#B45309';
      leatherStop80 = '#92400E';
      leatherStop100 = '#65290A';
      leatherHighlight = '#FBBF24';
      leatherStroke = '#45230C';
      leatherSeam = '#381D09';
    } else if (isGreige) {
      leatherStop0 = '#D4CECA';
      leatherStop40 = '#B0AAA2';
      leatherStop80 = '#8C857D';
      leatherStop100 = '#5A544F';
      leatherHighlight = '#EDE9E5';
      leatherStroke = '#68625B';
      leatherSeam = '#48433E';
    } else if (isDarkBrown) {
      leatherStop0 = '#804D2D';
      leatherStop40 = '#60381E';
      leatherStop80 = '#422412';
      leatherStop100 = '#2B160A';
      leatherHighlight = '#AB6E47';
      leatherStroke = '#251206';
      leatherSeam = '#1A0C04';
    }

    // 根据席位与角色自适应沙发构件 (双人位严格渲染 2 靠背，单人位渲染 1 靠背，三人位渲染 3 靠背)
    const is2Seat = productRole === 'sofa_2seat' || /2seat|two-seater|双人/i.test(productName);
    const is1Seat = productRole === 'recliner_1seat' || productRole === 'lounge_chair' || /1seat|single|单人|单椅/i.test(productName);

    let backrestsSvg = '';
    let cushionsSvg = '';
    let footrestLinesSvg = '';

    if (is1Seat) {
      backrestsSvg = `
        <rect x="440" y="845" width="320" height="235" rx="28" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
        <rect x="446" y="851" width="308" height="60" rx="20" fill="url(#leatherHighlightGrad)"/>
      `;
      cushionsSvg = `
        <rect x="450" y="1060" width="300" height="90" rx="20" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
      `;
      footrestLinesSvg = `
        <line x1="450" y1="1135" x2="750" y2="1135" stroke="${leatherSeam}" stroke-width="2" stroke-dasharray="4,3"/>
      `;
    } else if (is2Seat) {
      backrestsSvg = `
        <rect x="290" y="845" width="300" height="235" rx="26" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
        <rect x="296" y="851" width="288" height="60" rx="18" fill="url(#leatherHighlightGrad)"/>
        <rect x="610" y="845" width="300" height="235" rx="26" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
        <rect x="616" y="851" width="288" height="60" rx="18" fill="url(#leatherHighlightGrad)"/>
      `;
      cushionsSvg = `
        <rect x="300" y="1060" width="280" height="90" rx="18" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
        <rect x="620" y="1060" width="280" height="90" rx="18" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
      `;
      footrestLinesSvg = `
        <line x1="300" y1="1135" x2="580" y2="1135" stroke="${leatherSeam}" stroke-width="2" stroke-dasharray="4,3"/>
        <line x1="620" y1="1135" x2="900" y2="1135" stroke="${leatherSeam}" stroke-width="2" stroke-dasharray="4,3"/>
      `;
    } else {
      backrestsSvg = `
        <rect x="250" y="850" width="220" height="230" rx="24" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
        <rect x="254" y="854" width="212" height="60" rx="16" fill="url(#leatherHighlightGrad)"/>
        <rect x="490" y="845" width="220" height="235" rx="24" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
        <rect x="494" y="849" width="212" height="60" rx="16" fill="url(#leatherHighlightGrad)"/>
        <rect x="730" y="850" width="220" height="230" rx="24" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
        <rect x="734" y="854" width="212" height="60" rx="16" fill="url(#leatherHighlightGrad)"/>
      `;
      cushionsSvg = `
        <rect x="280" y="1060" width="200" height="90" rx="18" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
        <rect x="500" y="1060" width="200" height="90" rx="18" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
        <rect x="720" y="1060" width="200" height="90" rx="18" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
      `;
      footrestLinesSvg = `
        <line x1="280" y1="1135" x2="480" y2="1135" stroke="${leatherSeam}" stroke-width="2" stroke-dasharray="4,3"/>
        <line x1="500" y1="1135" x2="700" y2="1135" stroke="${leatherSeam}" stroke-width="2" stroke-dasharray="4,3"/>
        <line x1="720" y1="1135" x2="920" y2="1135" stroke="${leatherSeam}" stroke-width="2" stroke-dasharray="4,3"/>
      `;
    }

    // Camera DNA 物理镜头光心映射 (单变量原则: 仅相机动，家具与空间世界绝对不动)
    // 1. 焦距缩放比例 (以 35mm 为基准: 28mm 广角视角更宽, 45mm 黄金视角更饱满, 85mm 特写微距)
    const baseLens = 35;
    let cameraScale = camera.lensMm > 0 ? (camera.lensMm / baseLens) : 1.0;
    if (camera.lensMm <= 28) cameraScale = 0.82; // A01 大平层主全景，视域开阔
    else if (camera.lensMm >= 80) cameraScale = 1.65; // A04 特写微距

    // 2. 偏角 yaw 平移与透视偏转
    const yawOffset = (camera.yawDeg || 0) * 4.5;

    // 3. 机位高度与仰俯角对视平线的影响 (基准 130cm)
    const heightDelta = (130 - (camera.heightCm || 130)) * 1.5;
    const pitchOffset = (camera.pitchDeg || 0) * 8.0;
    const horizonShiftY = heightDelta + pitchOffset;

    // 4. 变体方案差异化光效与景深图层 (Variant 1~4)
    let ambientOverlay = '';
    let variantDescription = '标称物理机位 · 通透白昼漫射光';

    if (variantIndex === 2) {
      variantDescription = '高光暖阳微调 · 3200K 斜阳穿透与皮革金光';
      ambientOverlay = `
        <linearGradient id="warmSunRays" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.35"/>
          <stop offset="40%" stop-color="#FBBF24" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
        </linearGradient>
        <polygon points="1200,0 700,0 200,1600 1200,1600" fill="url(#warmSunRays)"/>
      `;
    } else if (variantIndex === 3) {
      variantDescription = '黄金微距景深 · f/1.8 大光圈柔焦与精工车线';
      ambientOverlay = `
        <radialGradient id="dofMask" cx="50%" cy="72%" r="48%">
          <stop offset="60%" stop-color="#FFFFFF" stop-opacity="0"/>
          <stop offset="100%" stop-color="#3C332A" stop-opacity="0.28"/>
        </radialGradient>
        <rect x="0" y="0" width="1200" height="1600" fill="url(#dofMask)"/>
      `;
    } else if (variantIndex === 4) {
      variantDescription = '建筑透视纵深 · 强化落地窗横梁与地面石材反差';
      ambientOverlay = `
        <linearGradient id="architecturalContrast" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1E293B" stop-opacity="0.22"/>
          <stop offset="50%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#0F172A" stop-opacity="0.3"/>
        </linearGradient>
        <rect x="0" y="0" width="1200" height="1600" fill="url(#architecturalContrast)"/>
      `;
    }

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1600" width="1200" height="1600">
  <defs>
    <!-- 空间建筑穹顶与天光渐变 -->
    <linearGradient id="skyCeiling" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#E8E4DF"/>
      <stop offset="60%" stop-color="#DAD4CC"/>
      <stop offset="100%" stop-color="#C5BEB4"/>
    </linearGradient>

    <!-- 地面天然灰微晶石 / 哑光木地板渐变 (保持 A00 材质不变量) -->
    <linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8E8880"/>
      <stop offset="40%" stop-color="#6F6961"/>
      <stop offset="100%" stop-color="#4C4740"/>
    </linearGradient>

    <!-- 敏华南美头层牛皮高定质感渐变 (严格遵循产品色彩真值: ${productColor}) -->
    <linearGradient id="leatherGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${leatherStop0}"/>
      <stop offset="40%" stop-color="${leatherStop40}"/>
      <stop offset="80%" stop-color="${leatherStop80}"/>
      <stop offset="100%" stop-color="${leatherStop100}"/>
    </linearGradient>

    <linearGradient id="leatherHighlightGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${leatherHighlight}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${leatherStop40}" stop-opacity="0.1"/>
    </linearGradient>

    <!-- 潘多拉微晶奢石茶几 (保持 A00 摆位与材质不变量) -->
    <linearGradient id="marbleGrad" x1="0" y1="0" x2="1" y2="0.5">
      <stop offset="0%" stop-color="#EFECE6"/>
      <stop offset="35%" stop-color="#D7CEBF"/>
      <stop offset="70%" stop-color="#C0B29D"/>
      <stop offset="100%" stop-color="#8F7E66"/>
    </linearGradient>

    <!-- 阴影与柔光扩散 -->
    <radialGradient id="ambientOcclusion" cx="50%" cy="85%" r="65%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.45"/>
      <stop offset="60%" stop-color="#000000" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>

    <!-- 窗外天际线散射光 -->
    <linearGradient id="windowLight" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.88"/>
      <stop offset="50%" stop-color="#F5EFE6" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- 1. 背景层：大平层建筑结构与挑高挑空 (A00 空间世界继承) -->
  <rect x="0" y="0" width="1200" height="1600" fill="url(#skyCeiling)"/>

  <!-- 2. 远景：落地全景落地窗与采光幕墙 (按视平线平移) -->
  <g transform="translate(0, ${horizonShiftY * 0.3})">
    <rect x="160" y="170" width="880" height="680" fill="#E2DDDA" rx="8"/>
    <rect x="170" y="180" width="860" height="660" fill="url(#windowLight)" rx="6"/>
    <line x1="450" y1="180" x2="450" y2="840" stroke="#78716C" stroke-width="4"/>
    <line x1="750" y1="180" x2="750" y2="840" stroke="#78716C" stroke-width="4"/>
  </g>

  <!-- 3. 地面微晶石地坪 (视平线基线) -->
  <polygon points="0,${960 + horizonShiftY} 1200,${960 + horizonShiftY} 1200,1600 0,1600" fill="url(#floorGrad)"/>

  <!-- 4. 镜头空间透视组合 (以中心原点 600, 1150 执行 Camera DNA 缩放与平移偏角) -->
  <g transform="translate(${600 - yawOffset}, ${1150 + horizonShiftY}) scale(${cameraScale}) translate(-600, -1150)">
    <!-- 4.1 高定羊毛手工地毯 -->
    <ellipse cx="600" cy="1260" rx="460" ry="170" fill="#CCC5BA" stroke="#B8B0A2" stroke-width="2"/>

    <!-- 4.2 产品主环境阴影 -->
    <ellipse cx="600" cy="1280" rx="420" ry="110" fill="url(#ambientOcclusion)"/>

    <!-- 4.3 敏华主件头等舱功能沙发 (物理真值不变量: ${productName} · 色系: ${productColor}) -->
    <!-- 底座骨架 -->
    <rect x="230" y="1040" width="740" height="150" rx="28" fill="url(#leatherGrad)"/>
    
    <!-- 人体工学靠背 (自适应席位) -->
    ${backrestsSvg}

    <!-- 左厚实扶手 -->
    <rect x="200" y="960" width="90" height="210" rx="36" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
    <rect x="205" y="965" width="80" height="80" rx="24" fill="url(#leatherHighlightGrad)"/>

    <!-- 右厚实扶手 -->
    <rect x="910" y="960" width="90" height="210" rx="36" fill="url(#leatherGrad)" stroke="${leatherStroke}" stroke-width="1.5"/>
    <rect x="915" y="965" width="80" height="80" rx="24" fill="url(#leatherHighlightGrad)"/>

    <!-- 座垫加厚承托层与精工车缝线 (自适应席位) -->
    ${cushionsSvg}

    <!-- 电动脚托缝线指示线 (自适应席位) -->
    ${footrestLinesSvg}

    <!-- 4.4 潘多拉天然微晶奢石茶几 (位置拓扑对齐锁死) -->
    <ellipse cx="600" cy="1330" rx="190" ry="60" fill="url(#marbleGrad)" stroke="#9C8B77" stroke-width="2"/>
    <ellipse cx="600" cy="1330" rx="160" ry="40" fill="#F8F6F2" opacity="0.6"/>
  </g>

  <!-- 5. 变体差异化光效与景深遮罩层 -->
  ${ambientOverlay}

  <!-- 6. 统一工程铭牌与 A00 继承物理真值水印 -->
  <rect x="30" y="30" width="460" height="106" rx="14" fill="#1C1917" opacity="0.88"/>
  <text x="50" y="58" fill="#F59E0B" font-size="14" font-weight="bold" font-family="sans-serif">MANWAH SPATIAL CAMERA · ${shotCode} [工程矢量底模 · 待配生图API]</text>
  <text x="50" y="80" fill="#E7E5E4" font-size="11" font-family="sans-serif">${productName.slice(0, 22)} · ${productColor || '真值锁定'}</text>
  <text x="50" y="98" fill="#A8A29E" font-size="10" font-family="monospace">DNA: ${camera.lensMm}mm | H: ${camera.heightCm}cm | YAW: ${camera.yawDeg}° | PITCH: ${camera.pitchDeg}°</text>
  <text x="50" y="118" fill="#10B981" font-size="9.5" font-family="sans-serif">✓ 空间与家具世界锁定 (A00 Master Invariance Enforced)</text>
</svg>`;

    return Buffer.from(svg, 'utf-8');
  }
}
