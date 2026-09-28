// src/lib/layoutGeometry.ts
import { POSTER_SPEC } from '../config/posterSpec';
import {
  FitMode,
  NormalizedPoint,
  NormalizedRect,
  SafeAreaInsets,
  RenderTransform,
  LayoutSlotSpec,
  PosterScreenLayout,
  NinePosterLayoutManifest,
  NineScreenLayoutManifest,
  LayoutValidationResult,
  LayoutErrorCode
} from '../types/layoutManifest';

/**
 * Helper to round floats to 6 decimal places for deterministic precision
 */
export function round6(val: number): number {
  return Math.round(val * 1000000) / 1000000;
}

/**
 * Greatest Common Divisor
 */
function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/**
 * Simplify width & height into standard ratio string (e.g. "3:4", "16:9", "1:1")
 */
export function simplifyAspectRatio(w: number, h: number): string {
  if (!w || !h || w <= 0 || h <= 0) return '3:4';
  
  const ratio = w / h;
  if (Math.abs(ratio - 3 / 4) < 0.02) return '3:4';
  if (Math.abs(ratio - 16 / 9) < 0.02) return '16:9';
  if (Math.abs(ratio - 9 / 16) < 0.02) return '9:16';
  if (Math.abs(ratio - 4 / 3) < 0.02) return '4:3';
  if (Math.abs(ratio - 1 / 1) < 0.02) return '1:1';

  const g = gcd(w, h);
  const sw = Math.round(w / g);
  const sh = Math.round(h / g);
  
  if (sw > 1000 || sh > 1000) {
    return `${Math.round(ratio * 100)}:100`;
  }
  return `${sw}:${sh}`;
}

/**
 * Compute Contain Transform
 */
export function computeContainTransform(
  slotWidth: number,
  slotHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  focalPoint: NormalizedPoint = { x: 0.5, y: 0.5 }
): RenderTransform {
  const scale = Math.min(slotWidth / sourceWidth, slotHeight / sourceHeight);
  const displayWidth = round6(sourceWidth * scale);
  const displayHeight = round6(sourceHeight * scale);
  const offsetX = round6((slotWidth - displayWidth) * focalPoint.x);
  const offsetY = round6((slotHeight - displayHeight) * focalPoint.y);

  return {
    scale: round6(scale),
    displayWidth,
    displayHeight,
    offsetX,
    offsetY,
    cropRect: null,
    isCropped: false,
    warnings: []
  };
}

/**
 * Compute Cover Transform
 */
export function computeCoverTransform(
  slotWidth: number,
  slotHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  focalPoint: NormalizedPoint = { x: 0.5, y: 0.5 },
  subjectBounds?: NormalizedRect | null
): RenderTransform {
  const scale = Math.max(slotWidth / sourceWidth, slotHeight / sourceHeight);
  const displayWidth = round6(sourceWidth * scale);
  const displayHeight = round6(sourceHeight * scale);
  const overflowX = displayWidth - slotWidth;
  const overflowY = displayHeight - slotHeight;
  const offsetX = round6(-overflowX * focalPoint.x);
  const offsetY = round6(-overflowY * focalPoint.y);

  let cropRect: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };
  const isCropped = overflowX > 0.5 || overflowY > 0.5;
  const warnings: string[] = [];

  if (displayWidth > slotWidth) {
    const visibleWidthInSource = slotWidth / scale;
    const cropSourceX = (sourceWidth - visibleWidthInSource) * focalPoint.x;
    cropRect = {
      x: round6(cropSourceX / sourceWidth),
      y: 0,
      width: round6(visibleWidthInSource / sourceWidth),
      height: 1
    };
  } else if (displayHeight > slotHeight) {
    const visibleHeightInSource = slotHeight / scale;
    const cropSourceY = (sourceHeight - visibleHeightInSource) * focalPoint.y;
    cropRect = {
      x: 0,
      y: round6(cropSourceY / sourceHeight),
      width: 1,
      height: round6(visibleHeightInSource / sourceHeight)
    };
  }

  // Check if subject is cropped in cover mode
  if (subjectBounds && isCropped) {
    const subjLeft = subjectBounds.x;
    const subjTop = subjectBounds.y;
    const subjRight = subjectBounds.x + subjectBounds.width;
    const subjBottom = subjectBounds.y + subjectBounds.height;

    const cropLeft = cropRect.x;
    const cropTop = cropRect.y;
    const cropRight = cropRect.x + cropRect.width;
    const cropBottom = cropRect.y + cropRect.height;

    if (
      subjLeft < cropLeft - 0.01 ||
      subjRight > cropRight + 0.01 ||
      subjTop < cropTop - 0.01 ||
      subjBottom > cropBottom + 0.01
    ) {
      warnings.push('SUBJECT_CROPPED: Cover mode crop boundary clips detected subject');
    }
  }

  return {
    scale: round6(scale),
    displayWidth,
    displayHeight,
    offsetX,
    offsetY,
    cropRect: isCropped ? cropRect : null,
    isCropped,
    warnings
  };
}

/**
 * Compute Smart Crop Transform
 */
export function computeSmartCropTransform(
  slotWidth: number,
  slotHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  subjectBounds?: NormalizedRect | null,
  focalPoint: NormalizedPoint = { x: 0.5, y: 0.5 },
  safeArea?: SafeAreaInsets
): RenderTransform {
  const warnings: string[] = [];

  let effectiveFocalPoint = { ...focalPoint };
  if (subjectBounds) {
    effectiveFocalPoint = {
      x: round6(subjectBounds.x + subjectBounds.width / 2),
      y: round6(subjectBounds.y + subjectBounds.height / 2)
    };
  } else {
    warnings.push('SMART_CROP_SUBJECT_MISSING: Subject bounds missing, falling back to focal point');
  }

  const coverResult = computeCoverTransform(
    slotWidth,
    slotHeight,
    sourceWidth,
    sourceHeight,
    effectiveFocalPoint,
    subjectBounds
  );

  return {
    ...coverResult,
    warnings: [...warnings, ...coverResult.warnings]
  };
}

/**
 * High-level layout transform calculation based on fitMode
 */
export function computeLayoutTransform(params: {
  slotWidth: number;
  slotHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  fitMode: FitMode;
  focalPoint?: NormalizedPoint;
  subjectBounds?: NormalizedRect | null;
  reservedZones?: NormalizedRect[];
}): RenderTransform {
  const {
    slotWidth,
    slotHeight,
    sourceWidth,
    sourceHeight,
    fitMode,
    focalPoint = { x: 0.5, y: 0.5 },
    subjectBounds = null
  } = params;

  if (fitMode === 'contain') {
    return computeContainTransform(slotWidth, slotHeight, sourceWidth, sourceHeight, focalPoint);
  } else if (fitMode === 'smart_crop') {
    return computeSmartCropTransform(slotWidth, slotHeight, sourceWidth, sourceHeight, subjectBounds, focalPoint);
  } else {
    return computeCoverTransform(slotWidth, slotHeight, sourceWidth, sourceHeight, focalPoint, subjectBounds);
  }
}

/**
 * Checks safe area and reserved zone conflicts for a slot
 */
export function checkSlotSafetyAndConflicts(params: {
  slotWidth: number;
  slotHeight: number;
  renderTransform: RenderTransform;
  safeArea: SafeAreaInsets;
  reservedZones?: NormalizedRect[];
  subjectBounds?: NormalizedRect | null;
}): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];
  const { slotWidth, slotHeight, renderTransform, safeArea, reservedZones = [], subjectBounds } = params;

  // Safe area checks
  if (
    safeArea.top < 0 || safeArea.top > 0.5 ||
    safeArea.right < 0 || safeArea.right > 0.5 ||
    safeArea.bottom < 0 || safeArea.bottom > 0.5 ||
    safeArea.left < 0 || safeArea.left > 0.5
  ) {
    errors.push('INVALID_SAFE_AREA: Safe area insets exceed 50% boundary');
  }

  // Safe area content bounds in screen pixels
  const safeLeft = slotWidth * safeArea.left;
  const safeTop = slotHeight * safeArea.top;
  const safeRight = slotWidth * (1 - safeArea.right);
  const safeBottom = slotHeight * (1 - safeArea.bottom);

  // If subject exists, check whether subject mapped to screen is inside safe content
  if (subjectBounds) {
    const scale = renderTransform.scale;
    const subjScreenX = renderTransform.offsetX + (subjectBounds.x * (params.renderTransform.displayWidth / scale)) * scale;
    const subjScreenY = renderTransform.offsetY + (subjectBounds.y * (params.renderTransform.displayHeight / scale)) * scale;
    const subjScreenWidth = subjectBounds.width * (params.renderTransform.displayWidth / scale) * scale;
    const subjScreenHeight = subjectBounds.height * (params.renderTransform.displayHeight / scale) * scale;

    // Check reserved zones conflict
    for (const rz of reservedZones) {
      const rzX = rz.x * slotWidth;
      const rzY = rz.y * slotHeight;
      const rzW = rz.width * slotWidth;
      const rzH = rz.height * slotHeight;

      // Overlap check
      const overlaps = !(
        subjScreenX + subjScreenWidth <= rzX ||
        subjScreenX >= rzX + rzW ||
        subjScreenY + subjScreenHeight <= rzY ||
        subjScreenY >= rzY + rzH
      );

      if (overlaps) {
        warnings.push(`SAFE_ZONE_CONFLICT: Subject overlaps reserved zone '${rz.label || rz.id || 'unnamed'}'`);
      }
    }
  }

  return { warnings, errors };
}

/**
 * Validate an entire NinePosterLayoutManifest or NineScreenLayoutManifest deterministically
 */
export function validateNinePosterLayoutManifest(
  manifest: NinePosterLayoutManifest | NineScreenLayoutManifest,
  productionAssetsMap?: Map<string, { width: number; height: number; checksum?: string; status?: string }>
): LayoutValidationResult {
  const globalErrors: string[] = [];
  const globalWarnings: string[] = [];
  const screenResults: LayoutValidationResult['screenResults'] = [];

  const requiredScenes = [
    'scene-01', 'scene-02', 'scene-03', 'scene-04', 'scene-05',
    'scene-06', 'scene-07', 'scene-08', 'scene-09'
  ];
  const presentScenes = new Set<string>();

  const screensOrSlots = (manifest as any).screens || (manifest as any).slots || [];

  for (let idx = 0; idx < screensOrSlots.length; idx++) {
    const screen = screensOrSlots[idx];
    const sceneKey = screen.sceneKey || `scene-${String(idx + 1).padStart(2, '0')}`;
    const screenIndex = screen.screenIndex || idx + 1;
    presentScenes.add(sceneKey);

    const screenErrors: string[] = [];
    let screenWarnings: string[] = [];

    const targetWidth = screen.targetWidth || POSTER_SPEC.width;
    const targetHeight = screen.targetHeight || (screen.slotHeight) || POSTER_SPEC.height;

    // Check width and height
    if (targetWidth !== POSTER_SPEC.width || targetHeight !== POSTER_SPEC.height) {
      screenErrors.push(`POSTER_DIMENSION_INVALID: Expected ${POSTER_SPEC.width}x${POSTER_SPEC.height}, got ${targetWidth}x${targetHeight}`);
    }

    // Check focalPoint
    if (screen.focalPoint) {
      if (
        screen.focalPoint.x < 0 || screen.focalPoint.x > 1 ||
        screen.focalPoint.y < 0 || screen.focalPoint.y > 1
      ) {
        screenErrors.push('INVALID_FOCAL_POINT');
      }
    }

    // Source dimensions
    const srcWidth = screen.sourceWidth || 2100;
    const srcHeight = screen.sourceHeight || 2800;

    const transform = computeLayoutTransform({
      slotWidth: targetWidth,
      slotHeight: targetHeight,
      sourceWidth: srcWidth,
      sourceHeight: srcHeight,
      fitMode: screen.fitMode || 'cover',
      focalPoint: screen.focalPoint || { x: 0.5, y: 0.5 },
      subjectBounds: screen.subjectBounds || null,
      reservedZones: screen.reservedZones || []
    });

    const safetyCheck = checkSlotSafetyAndConflicts({
      slotWidth: targetWidth,
      slotHeight: targetHeight,
      renderTransform: transform,
      safeArea: screen.safeArea || { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 },
      reservedZones: screen.reservedZones || [],
      subjectBounds: screen.subjectBounds || null
    });

    screenWarnings = [...screenWarnings, ...safetyCheck.warnings];
    screenErrors.push(...safetyCheck.errors);

    let status: 'valid' | 'warning' | 'invalid' = 'valid';
    if (screenErrors.length > 0 || screenWarnings.includes('SUBJECT_CROPPED')) {
      status = 'invalid';
    } else if (screenWarnings.length > 0) {
      status = 'warning';
    }

    screenResults.push({
      sceneKey,
      screenIndex,
      validationStatus: status,
      warnings: Array.from(new Set(screenWarnings)),
      errors: Array.from(new Set(screenErrors)),
      renderTransform: transform
    });
  }

  // Check all 9 scenes present
  for (const s of requiredScenes) {
    if (!presentScenes.has(s)) {
      globalErrors.push(`SCENE_SET_INCOMPLETE: missing ${s}`);
    }
  }
  if (screensOrSlots.length !== POSTER_SPEC.screenCount) {
    globalErrors.push(`SCENE_SET_INCOMPLETE: expected exactly ${POSTER_SPEC.screenCount} screens, got ${screensOrSlots.length}`);
  }

  const hasInvalidScreens = screenResults.some(r => r.validationStatus === 'invalid' || r.errors.length > 0);
  const isValid = globalErrors.length === 0 && !hasInvalidScreens;
  const canApprove = isValid;

  return {
    valid: isValid,
    canApprove,
    screenResults,
    slotResults: screenResults,
    globalErrors,
    globalWarnings
  };
}

// Backward compatibility alias
export const validateNineScreenLayoutManifest = validateNinePosterLayoutManifest;

/**
 * Compute canonical SHA-256 Checksum for Manifest
 */
export async function calculateManifestChecksum(manifest: NinePosterLayoutManifest | NineScreenLayoutManifest): Promise<string> {
  const screensOrSlots = (manifest as any).screens || (manifest as any).slots || [];
  const sortedScreens = [...screensOrSlots].sort((a, b) => String(a.sceneKey).localeCompare(String(b.sceneKey)));

  const canonicalObj = {
    schemaVersion: manifest.schemaVersion || 'poster-layout-manifest/v2',
    screenCount: POSTER_SPEC.screenCount,
    screenWidth: POSTER_SPEC.width,
    screenHeight: POSTER_SPEC.height,
    screens: sortedScreens.map((s, idx) => ({
      sceneKey: s.sceneKey || `scene-${String(idx + 1).padStart(2, '0')}`,
      screenIndex: s.screenIndex || idx + 1,
      assetVersionId: s.assetVersionId || '',
      targetWidth: POSTER_SPEC.width,
      targetHeight: POSTER_SPEC.height,
      fitMode: s.fitMode || 'cover',
      focalPoint: { x: round6(s.focalPoint?.x ?? 0.5), y: round6(s.focalPoint?.y ?? 0.5) },
      safeArea: {
        top: round6(s.safeArea?.top ?? 0.08),
        right: round6(s.safeArea?.right ?? 0.08),
        bottom: round6(s.safeArea?.bottom ?? 0.08),
        left: round6(s.safeArea?.left ?? 0.08)
      },
      reservedZones: (s.reservedZones || []).map((z: any) => ({
        x: round6(z.x),
        y: round6(z.y),
        width: round6(z.width),
        height: round6(z.height)
      })),
      backgroundColor: s.backgroundColor || '#FAF8F5'
    }))
  };

  const jsonStr = JSON.stringify(canonicalObj);

  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(jsonStr);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    let hash = 0;
    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }
}

/**
 * Standard 9-Poster Template (Each 2100x2800)
 */
export const DEFAULT_POSTER_SCREENS: Array<{ sceneKey: `scene-${string}`; screenIndex: number; width: 2100; height: 2800; label: string }> = [
  { sceneKey: 'scene-01', screenIndex: 1, width: 2100, height: 2800, label: '首屏主视觉海报' },
  { sceneKey: 'scene-02', screenIndex: 2, width: 2100, height: 2800, label: '核心设计理念海报' },
  { sceneKey: 'scene-03', screenIndex: 3, width: 2100, height: 2800, label: '面料触感细节海报' },
  { sceneKey: 'scene-04', screenIndex: 4, width: 2100, height: 2800, label: '人体工学坐姿海报' },
  { sceneKey: 'scene-05', screenIndex: 5, width: 2100, height: 2800, label: '核心功能演示海报' },
  { sceneKey: 'scene-06', screenIndex: 6, width: 2100, height: 2800, label: '内部材质工艺海报' },
  { sceneKey: 'scene-07', screenIndex: 7, width: 2100, height: 2800, label: '多角度空间适配海报' },
  { sceneKey: 'scene-08', screenIndex: 8, width: 2100, height: 2800, label: '细节质感海报' },
  { sceneKey: 'scene-09', screenIndex: 9, width: 2100, height: 2800, label: '品牌服务与收尾海报' }
];

export const DEFAULT_SUGGESTED_SLOT_HEIGHTS = DEFAULT_POSTER_SCREENS.map(s => ({
  sceneKey: s.sceneKey,
  slotHeight: s.height,
  label: s.label
}));
