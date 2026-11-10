import {
  ShotInstance,
  ProductAsset,
  SpacePreset,
  StylePreset,
  PlacementBlueprint,
  SceneMaster,
  GenerationSettings,
  ImageAspectRatio,
  RenderComputeConfig
} from '../../../types/spaceStudio';
import {
  HumanLayoutConfig,
  ModelAsset
} from '../../../types/spaceAssetLibrary';
import { ShootCompiler } from './shootCompiler';
import { nextRevisionNumber } from './revisionGraphEngine';

export interface BuildRenderCandidatesPayloadParams {
  projectId?: string;
  targetShot: ShotInstance;
  candidateCount?: number;
  activeSettings: GenerationSettings;
  selectedSpace: SpacePreset;
  selectedStyle: StylePreset;
  products: ProductAsset[];
  shots: ShotInstance[];
  sceneMaster?: SceneMaster | null;
  overrideSceneMaster?: SceneMaster;
  blueprint: PlacementBlueprint;
  computeConfig: RenderComputeConfig;
  isHumanPass?: boolean;
  baseShotImage?: string;
  isBaseUploaded?: boolean;
  activeTargetHumanLayout?: HumanLayoutConfig;
  allModels?: ModelAsset[];
  compiledHuman?: { positivePrompt: string; negativePrompt: string; slotBriefs?: string };
}

export const STUDIO_SWAP_ANGLE_GUARD_PREFIX = '[A02 角度源缺失]';

/**
 * A02 极简换景角度源校验：
 * studio_swap 下 A02 的提示词要求“拍摄角度保持不变”，视角完全由参考图 1 决定。
 * 当本镜头未上传专属实拍图、且主品既无 45_deg 视角参考图、名称也未标识为 45° 素材时，
 * 参考图 1 会回退为主品正面图，导致 A02 输出正面构图，故在此显式拦截并提示。
 */
export function assessStudioSwapAngleSource(params: {
  shotCode: string;
  isStudioSwapMode: boolean;
  isHumanPass?: boolean;
  hasShotSpecificPhoto: boolean;
  primaryProduct?: ProductAsset;
  bestViewType?: string;
}): { ok: boolean; message?: string } {
  const { shotCode, isStudioSwapMode, isHumanPass, hasShotSpecificPhoto, primaryProduct, bestViewType } = params;
  if (shotCode !== 'A02' || !isStudioSwapMode || isHumanPass || hasShotSpecificPhoto) {
    return { ok: true };
  }
  const has45View =
    bestViewType === '45_deg' ||
    Boolean(primaryProduct?.referenceImages?.some((r) => r.type === '45_deg' && (r.publicUrl || r.objectKey)));
  const nameIndicates45 = /45\s*(°|度|deg)|斜侧|三分之四|three[-\s]?quarter/i.test(primaryProduct?.name || '');
  if (has45View || nameIndicates45) {
    return { ok: true };
  }
  return {
    ok: false,
    message: `${STUDIO_SWAP_ANGLE_GUARD_PREFIX} 当前 A02 未导入 45° 实拍素材，参考图 1 将回退为主品「${primaryProduct?.name || '未命名'}」的正面图，生成结果会沿用正面角度。请先点击「导入本镜头专属素材 (如45°图)」上传 45° 3+1 实拍图，或将 45° 产品图设为核心主品后再生成。`
  };
}

/**
 * 统一构建 /api/space/shoot/render-candidates 的请求体
 * 消除 handleRenderShot 与 handleRenderHumanPass 两条渲染路径的冗余代码与逻辑漂移
 */
export function buildRenderCandidatesPayload(params: BuildRenderCandidatesPayloadParams): Record<string, any> {
  const {
    projectId = 'manwah-noble-space-01',
    targetShot,
    candidateCount = 1,
    activeSettings,
    selectedSpace,
    selectedStyle,
    products,
    shots,
    sceneMaster,
    overrideSceneMaster,
    blueprint,
    computeConfig,
    isHumanPass = false,
    baseShotImage,
    isBaseUploaded = false,
    activeTargetHumanLayout,
    allModels = [],
    compiledHuman
  } = params;

  const targetShotCode = targetShot.templateCode;
  const activeEnsemble = products.filter(
    (p) => p.priority === 'primary' || p.isEnsembleIncluded !== false
  );

  const effectiveSceneMaster = overrideSceneMaster || sceneMaster;
  const isStudioSwapMode = activeSettings.renderMode === 'studio_swap';

  // 1. 基础镜头编译
  const compiled = ShootCompiler.compileShotPrompt({
    shot: targetShot,
    sceneMaster: effectiveSceneMaster || {
      id: 'temp-master',
      projectId,
      objectKey: '',
      isLocked: true,
      lockedAt: new Date().toISOString(),
      locks: {
        productIdentity: true,
        placement: true,
        architecture: true,
        style: true,
        material: true,
        lighting: true,
        camera: true,
        human: false
      },
      promptSnapshotId: 'rev-01'
    },
    products: activeEnsemble,
    spacePreset: selectedSpace,
    stylePreset: selectedStyle,
    blueprint,
    aspectRatio: (targetShot.aspectRatio || computeConfig.aspectRatio || '4:3') as ImageAspectRatio,
    functionalPositionState: computeConfig.functionalPositionState || 'closed',
    renderMode: activeSettings.renderMode
  });

  // 2. 核心主品锚定与专属单品逻辑
  const isHeroSofaDedicatedShot = ['A03', 'A04', 'A05', 'A06'].includes(targetShotCode);
  const isReclinerDedicatedShot = ['A08'].includes(targetShotCode);
  const isDiningDedicatedShot = ['A09'].includes(targetShotCode);

  const hero3SeatSofa = activeEnsemble.find(
    (p) => p.role === 'sofa_3seat' || p.role === 'sofa_2seat' || /(三人|3人|主沙发|直排)/.test(p.name || '')
  );
  const reclinerChair = activeEnsemble.find(
    (p) => p.role === 'recliner_1seat' || p.role === 'lounge_chair' || /(单人|单椅|头等舱|单机位|大师|休闲椅|扶手椅)/.test(p.name || '')
  ) || activeEnsemble.find((p) => p.priority === 'secondary' || (p.role !== 'sofa_3seat' && p.role !== 'sofa_2seat' && p.role !== 'coffee_table' && p.role !== 'dining_table'));
  const diningTableProd = activeEnsemble.find(
    (p) => p.role === 'dining_table' || p.role === 'dining_chair' || /(餐桌|餐椅|餐边柜|餐台|餐车|餐厅)/.test(p.name || '')
  );

  const boundProd = targetShot.boundProductId
    ? products.find((p) => p.id === targetShot.boundProductId)
    : null;

  const primaryProd = boundProd
    || ((isHeroSofaDedicatedShot && hero3SeatSofa)
      ? hero3SeatSofa
      : (isReclinerDedicatedShot && reclinerChair)
      ? reclinerChair
      : (isDiningDedicatedShot && diningTableProd)
      ? diningTableProd
      : (activeEnsemble.find((p) => p.priority === 'primary') || activeEnsemble[0] || products[0]));

  // 3. 提取核心单品的独立参考图真值
  const currentRev =
    targetShot.revisions.find((r) => r.id === targetShot.currentRevisionId) ||
    (targetShot.revisions && targetShot.revisions[targetShot.revisions.length - 1]);

  const shotUploadedPhoto =
    targetShot.customReferenceImage
      ? targetShot.customReferenceImage
      : ((currentRev as any)?.isUserUploaded || currentRev?.provenance === 'PROVIDED')
      ? currentRev.imageUrl
      : (targetShot as any).isUserUploadedPhoto
      ? (targetShot.customReferenceImage || currentRev?.imageUrl)
      : undefined;

  const effectiveIsBaseUploaded = Boolean(isBaseUploaded || shotUploadedPhoto);
  const effectiveBaseShotImage = baseShotImage || shotUploadedPhoto;

  const shotCustomRef = targetShot.customReferenceImage;
  const bestPrimaryView = ShootCompiler.selectBestProductReferenceForShot(primaryProd, targetShot.templateCode);
  const hasSpecificAngleView = bestPrimaryView.viewType !== 'front' && Boolean(bestPrimaryView.reference?.publicUrl || bestPrimaryView.reference?.objectKey);
  const isStudioSwapFullPhotoPreferred = isStudioSwapMode;

  // A02 极简换景角度源守卫：A02 的 45° 视角 100% 来自参考图 1，若参考图 1 不是 45° 素材，模型会忠实沿用正面角度
  const angleSource = assessStudioSwapAngleSource({
    shotCode: targetShotCode,
    isStudioSwapMode,
    isHumanPass,
    hasShotSpecificPhoto: Boolean(shotUploadedPhoto || shotCustomRef || baseShotImage),
    primaryProduct: primaryProd,
    bestViewType: bestPrimaryView.viewType
  });
  if (!angleSource.ok) {
    throw new Error(angleSource.message);
  }
  const studioSwapA02AngleRef =
    isStudioSwapMode && targetShotCode === 'A02' && bestPrimaryView.viewType === '45_deg'
      ? (bestPrimaryView.reference?.publicUrl || bestPrimaryView.reference?.objectKey)
      : undefined;

  const primaryRef =
    shotCustomRef ||
    (isStudioSwapMode && shotUploadedPhoto) ||
    studioSwapA02AngleRef ||
    (isStudioSwapFullPhotoPreferred
      ? (
          primaryProd?.sourceMasterImageUrl ||
          (primaryProd as any)?.uploadedImageUrl ||
          bestPrimaryView.reference?.publicUrl ||
          bestPrimaryView.reference?.objectKey ||
          primaryProd?.referenceImages?.[0]?.publicUrl ||
          primaryProd?.referenceImages?.[0]?.objectKey ||
          primaryProd?.cropImageUrl ||
          primaryProd?.cropBase64
        )
      : (
          (hasSpecificAngleView ? (bestPrimaryView.reference?.publicUrl || bestPrimaryView.reference?.objectKey) : null) ||
          primaryProd?.cropImageUrl ||
          primaryProd?.cropBase64 ||
          bestPrimaryView.reference?.publicUrl ||
          bestPrimaryView.reference?.objectKey ||
          primaryProd?.referenceImages?.[0]?.publicUrl ||
          primaryProd?.referenceImages?.[0]?.objectKey ||
          (primaryProd as any)?.uploadedImageUrl
        )) ||
    (primaryProd as any)?.referenceImage ||
    products[0]?.sourceMasterImageUrl ||
    products[0]?.cropImageUrl ||
    products[0]?.cropBase64 ||
    products[0]?.referenceImages?.[0]?.publicUrl ||
    (products[0] as any)?.referenceImage;

  // 4. 搭配品过滤
  const filteredEnsemble = effectiveIsBaseUploaded ? [] : activeEnsemble.filter((p) => {
    if (['A04', 'A05', 'A06'].includes(targetShotCode)) {
      return p.id === primaryProd.id;
    }
    if (targetShotCode === 'A08') {
      const hasReclinerImage = Boolean(
        reclinerChair?.cropImageUrl ||
        reclinerChair?.cropBase64 ||
        reclinerChair?.referenceImages?.[0]?.publicUrl ||
        (reclinerChair as any)?.uploadedImageUrl ||
        (reclinerChair as any)?.referenceImage
      );
      if (hasReclinerImage && reclinerChair) {
        return p.id === reclinerChair.id;
      }
      return true;
    }
    if (targetShotCode === 'A03') {
      return p.id === primaryProd.id || p.role === 'coffee_table';
    }
    if (targetShotCode === 'A09' && diningTableProd) {
      return p.role !== 'sofa_3seat' && p.role !== 'sofa_2seat';
    }
    return true;
  });

  // 5. 空间母版参考图解析
  let sceneMasterReference: { objectKey?: string; imageUrl?: string; isEmptyPlate?: boolean } | undefined;
  let referenceShotCode: string | undefined;

  const shouldDecouple =
    targetShotCode === 'A00' ||
    Boolean(effectiveIsBaseUploaded && activeSettings.renderMode !== 'studio_swap') ||
    Boolean(targetShot.decoupleOldMaster && activeSettings.renderMode !== 'studio_swap');

  if (!shouldDecouple) {
    const a00Shot = shots.find((s) => s.templateCode === 'A00');
    const a00Rev =
      a00Shot?.revisions.find((r) => r.id === a00Shot.currentRevisionId) ||
      (a00Shot?.revisions && a00Shot.revisions[0]);
    const hasA00RevImage = Boolean(a00Rev?.imageUrl || a00Rev?.objectKey);
    const a00MasterRef = hasA00RevImage && a00Rev
      ? { objectKey: a00Rev.objectKey, imageUrl: a00Rev.imageUrl, ...(a00Rev.isEmptyPlate ? { isEmptyPlate: true } : {}) }
      : effectiveSceneMaster && (effectiveSceneMaster.imageUrl || effectiveSceneMaster.objectKey)
      ? { objectKey: effectiveSceneMaster.objectKey, imageUrl: effectiveSceneMaster.imageUrl }
      : undefined;

    const a01Shot = shots.find((s) => s.templateCode === 'A01');
    const a01Rev =
      a01Shot?.revisions.find((r) => r.id === a01Shot.currentRevisionId) ||
      (a01Shot?.revisions && a01Shot.revisions[0]);
    const hasA01Image = Boolean(a01Rev?.imageUrl || a01Rev?.objectKey);

    const a00Time = a00Rev?.createdAt ? new Date(a00Rev.createdAt).getTime() : 0;
    const a01Time = a01Rev?.createdAt ? new Date(a01Rev.createdAt).getTime() : 0;
    const preferA00Master =
      activeSettings.renderMode === 'studio_swap' || targetShotCode === 'A01' || (Boolean(a00MasterRef) && a00Time >= a01Time);

    // 用户在 A00 生成记录中指定的场景参考版本（如清除家具后的空场景）享有最高优先级，
    // 与 A00 当前展示哪一版无关，避免模型照搬带家具母版里的家具与构图
    const a00SceneRefRev = a00Shot?.sceneReferenceRevisionId
      ? a00Shot.revisions.find((r) => r.id === a00Shot.sceneReferenceRevisionId && (r.imageUrl || r.objectKey))
      : undefined;

    if (a00SceneRefRev) {
      sceneMasterReference = {
        objectKey: a00SceneRefRev.objectKey,
        imageUrl: a00SceneRefRev.imageUrl,
        ...(a00SceneRefRev.isEmptyPlate ? { isEmptyPlate: true } : {})
      };
      referenceShotCode = 'A00';
    } else if (preferA00Master && a00MasterRef) {
      sceneMasterReference = a00MasterRef;
      referenceShotCode = 'A00';
    } else if (targetShotCode !== 'A01' && hasA01Image && a01Rev) {
      sceneMasterReference = {
        objectKey: a01Rev.objectKey,
        imageUrl: a01Rev.imageUrl
      };
      referenceShotCode = 'A01';
    } else {
      sceneMasterReference = a00MasterRef;
      referenceShotCode = 'A00';
    }
  }

  // 6. 人物模特与提示词分支
  const hasBaseBaseline = Boolean(baseShotImage);
  let promptSnapshot: Record<string, any> = compiled;
  let selectedModelsPayload: ModelAsset[] | undefined;
  let characterRefImagesPayload: Array<{ modelId: string; name: string; imageUrl: string; role: string; slotNumber: number }> | undefined;

  if (isHumanPass && activeTargetHumanLayout) {
    // 记录每位模特所在的槽位号，服务端据此告诉模型“参考图 N 是第几号人物”，中间有空槽位也不会对错人
    const slotModels = activeTargetHumanLayout.slots
      .map((s, i) => ({ slotNumber: i + 1, model: allModels.find((m) => m.id === s.modelId) }))
      .filter((x): x is { slotNumber: number; model: ModelAsset } => Boolean(x.model));
    const targetModelList =
      slotModels.length > 0
        ? slotModels
        : allModels.slice(0, activeTargetHumanLayout.characterCount).map((model, i) => ({ slotNumber: i + 1, model }));

    selectedModelsPayload = targetModelList.map((x) => x.model);
    characterRefImagesPayload = targetModelList
      .map(({ slotNumber, model: m }) => ({
        modelId: m.id,
        name: m.nameZh || m.name,
        imageUrl: m.views?.portrait || m.views?.front || m.thumbnail || m.coverImage,
        role: 'person_reference',
        slotNumber
      }))
      .filter((c) => Boolean(c.imageUrl)) as Array<{ modelId: string; name: string; imageUrl: string; role: string; slotNumber: number }>;

    promptSnapshot = {
      ...compiled,
      positivePrompt: hasBaseBaseline
        ? `${compiledHuman?.positivePrompt || ''}, zero camera drift inpainting, strictly 100% preserve and freeze Reference Image 1 camera field of view, focal length, distance, optical horizon, and all surrounding furniture (including side chairs, coffee tables, and wall decor) completely untouched and uncropped, photorealistically seat real human model(s) into the sofa with realistic body weight and contact shadows`
        : `${compiledHuman?.positivePrompt || ''}, ${compiled.positivePrompt}`,
      negativePrompt: hasBaseBaseline
        ? `${compiledHuman?.negativePrompt || ''}, text, watermark, logo, font, writing, letters, chinese characters, labels, annotations, captions, altering background, modifying walls, changing wall color, changing floor, modifying furniture, shifting camera, perspective drift, re-framing, foreign style, zooming in, zoom in, cropped sofa, cropping furniture, displaced sofa, extra furniture, missing furniture`
        : `${compiledHuman?.negativePrompt || ''}, text, watermark, logo, font, writing, letters, chinese characters, labels, annotations, captions`,
      isHumanPass: true,
      preserveBasePhotoOnly: hasBaseBaseline,
      ...(hasBaseBaseline && compiledHuman?.slotBriefs ? { humanSlotBriefs: compiledHuman.slotBriefs } : {})
    };
  }

  // 7. 组装最终请求体
  // 关键修正：A00 空间母版（或尚未关联空间母版参考图的镜头）必须 100% 读取用户录入的户型 (spacePreset) 与美学风格 (stylePreset)
  const isDerivedStudioSwapWithMaster =
    isStudioSwapMode && targetShotCode !== 'A00' && Boolean(sceneMasterReference?.imageUrl || sceneMasterReference?.objectKey);

  return {
    projectId,
    shotId: targetShot.id,
    shotCode: targetShot.templateCode,
    revisionNumber: nextRevisionNumber(targetShot.revisions),
    candidateCount,
    resolution: activeSettings.resolution,
    autoModelFallback: activeSettings.autoModelFallback,
    renderMode: activeSettings.renderMode,
    preferredModel: activeSettings.model,
    generationSettings: {
      model: activeSettings.model,
      resolution: activeSettings.resolution,
      aspectRatio: activeSettings.aspectRatio,
      useRandomSeed: activeSettings.useRandomSeed,
      seed: activeSettings.seed,
      autoModelFallback: activeSettings.autoModelFallback,
      functionalPositionState: activeSettings.functionalPositionState,
      studioSwapRefinePass: activeSettings.studioSwapRefinePass
    },
    isHumanPass,
    preserveBasePhotoOnly: Boolean(isHumanPass && hasBaseBaseline),
    roomName: isDerivedStudioSwapWithMaster ? undefined : (isBaseUploaded ? '实拍原图环境' : selectedSpace.name.split(' (')[0]),
    spaceCode: isDerivedStudioSwapWithMaster ? undefined : (isBaseUploaded ? 'custom_photo' : selectedSpace.code),
    styleName: isDerivedStudioSwapWithMaster ? undefined : (isBaseUploaded ? '实拍原画质感' : selectedStyle.name.split(' (')[0]),
    styleCode: isDerivedStudioSwapWithMaster ? undefined : (isBaseUploaded ? 'custom_photo' : selectedStyle.code),
    spacePreset: isDerivedStudioSwapWithMaster || isBaseUploaded ? undefined : {
      id: selectedSpace.id,
      code: selectedSpace.code,
      name: selectedSpace.name,
      ceilingHeight: selectedSpace.ceilingHeight,
      signatureFeatures: selectedSpace.signatureFeatures,
      promptFragments: selectedSpace.promptFragments
    },
    stylePreset: isDerivedStudioSwapWithMaster || isBaseUploaded ? undefined : {
      id: selectedStyle.id,
      code: selectedStyle.code,
      name: selectedStyle.name,
      colorPalette: selectedStyle.colorPalette,
      materialSystem: selectedStyle.materialSystem,
      promptFragments: selectedStyle.promptFragments
    },
    ...(isHumanPass ? {
      baseShotReferenceImage: baseShotImage,
      currentShotReferenceImage: baseShotImage,
      humanLayout: activeTargetHumanLayout,
      selectedModels: selectedModelsPayload,
      characterReferenceImages: characterRefImagesPayload
    } : {
      ...(effectiveBaseShotImage ? { currentShotReferenceImage: effectiveBaseShotImage } : {})
    }),
    camera: isHumanPass ? targetShot.camera : compiled.cameraSpec,
    intent: targetShot.intent,
    productDNA: {
      modelNumber: primaryProd?.sku || primaryProd?.id,
      name: primaryProd?.name || (primaryProd?.role === 'recliner_1seat' ? 'ergonomic power motion recliner chair' : 'luxury power motion genuine leather sofa'),
      leatherType: primaryProd?.materials?.[0] || '真皮',
      colorCode: primaryProd?.colors?.[0] || '标准色',
      referenceImage: primaryRef,
      isSceneEnsembleSuite: (primaryProd as any)?.isSceneEnsembleSuite,
      sceneEnsembleDossier: (primaryProd as any)?.sceneEnsembleDossier
    },
    sceneMasterReference,
    referenceShotCode,
    productReferenceImage: primaryRef,
    ensembleProducts: filteredEnsemble.map((p) => {
      const bestView = ShootCompiler.selectBestProductReferenceForShot(p, targetShot.templateCode);
      const refImg =
        p.cropImageUrl ||
        p.cropBase64 ||
        bestView.reference?.publicUrl ||
        bestView.reference?.objectKey ||
        p.referenceImages?.[0]?.publicUrl ||
        p.referenceImages?.[0]?.objectKey ||
        (p as any)?.uploadedImageUrl ||
        (p as any)?.referenceImage;

      return {
        id: p.id,
        sku: p.sku,
        role: p.role,
        priority: p.priority,
        name: p.name,
        color: p.colors?.[0] || '标准色',
        colors: p.colors || [],
        material: p.materials?.[0] || '真皮',
        materials: p.materials || [],
        referenceImage: refImg,
        views: {
          front: p.referenceImages?.find(r => r.type === 'front')?.publicUrl || p.referenceImages?.find(r => r.type === 'front')?.objectKey,
          '45_deg': p.referenceImages?.find(r => r.type === '45_deg')?.publicUrl || p.referenceImages?.find(r => r.type === '45_deg')?.objectKey,
          side: p.referenceImages?.find(r => r.type === 'side')?.publicUrl || p.referenceImages?.find(r => r.type === 'side')?.objectKey,
          function_open: p.referenceImages?.find(r => r.type === 'function_open')?.publicUrl || p.referenceImages?.find(r => r.type === 'function_open')?.objectKey,
          detail: p.referenceImages?.find(r => r.type === 'detail')?.publicUrl || p.referenceImages?.find(r => r.type === 'detail')?.objectKey,
        },
        matchedViewType: bestView.viewType,
        sourceMasterImageUrl: p.sourceMasterImageUrl,
        sourceBoundingBox: p.sourceBoundingBox,
        cropImageUrl: p.cropImageUrl,
        dimensions: p.dimensions,
        functionCapable: p.functionCapable
      };
    }),
    promptSnapshot
  };
}
