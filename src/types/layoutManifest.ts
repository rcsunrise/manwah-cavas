// src/types/layoutManifest.ts
import { POSTER_SPEC } from '../config/posterSpec';

export type FitMode = 'contain' | 'cover' | 'smart_crop';

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
  id?: string;
  label?: string;
}

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface RenderTransform {
  scale: number;
  displayWidth: number;
  displayHeight: number;
  offsetX: number;
  offsetY: number;
  cropRect: NormalizedRect | null;
  isCropped: boolean;
  warnings: string[];
}

export interface PosterScreenLayout {
  sceneKey: string;
  screenIndex: number;
  targetWidth: 2100;
  targetHeight: 2800;
  assetVersionId: string;
  assetBucket?: string;
  assetObjectKey?: string;
  fitMode: 'contain' | 'cover' | 'smart_crop';
  focalPoint: {
    x: number;
    y: number;
  };
  safeArea: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  reservedZones: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  backgroundColor: string;
  validationStatus: 'valid' | 'warning' | 'invalid';
  warnings: string[];
  sourceWidth?: number;
  sourceHeight?: number;
  sourceAspectRatio?: string;
  renderTransform?: RenderTransform;
}

export interface NinePosterLayoutManifest {
  schemaVersion: 'poster-layout-manifest/v2';
  manifestId: string;
  projectId: string;
  canvasId: string;
  versionNumber: number;
  versionCode: string;
  screenCount: 9;
  screenWidth: 2100;
  screenHeight: 2800;
  screens: PosterScreenLayout[];
  status: 'draft' | 'approved';
  checksum: string;
  createdAt: string;
  updatedAt: string;
}

// Backward compatibility slot interface
export interface LayoutSlotSpec {
  sceneKey: `scene-${string}` | string;
  screenIndex?: number;
  assetVersionId: string;
  assetBucket?: string;
  assetObjectKey?: string;
  sourceWidth: number;
  sourceHeight: number;
  sourceAspectRatio: string;
  targetWidth: number;
  slotHeight: number;
  layoutSlotRatio: string;
  fitMode: FitMode;
  focalPoint: NormalizedPoint;
  safeArea: SafeAreaInsets;
  reservedZones: NormalizedRect[];
  subjectBounds?: NormalizedRect | null;
  backgroundColor: string;
  validationStatus: 'valid' | 'warning' | 'invalid';
  warnings: string[];
  renderTransform?: RenderTransform;
}

// Backward compatibility alias for manifests
export interface NineScreenLayoutManifest {
  schemaVersion: 'poster-layout-manifest/v2' | 'layout-manifest/v1';
  manifestId: string;
  projectId: string;
  canvasId: string;
  versionNumber?: number;
  versionCode?: string;
  screenCount?: 9;
  screenWidth?: 2100;
  screenHeight?: 2800;
  widthPx?: 2100;
  screens?: PosterScreenLayout[];
  slots?: LayoutSlotSpec[];
  status: 'draft' | 'valid' | 'approved' | 'superseded';
  checksum: string;
  parentManifestId?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function migrateLegacyManifestToPosterV2(
  legacy: any
): NinePosterLayoutManifest {
  const sourceSlots = Array.isArray(legacy.screens)
    ? legacy.screens
    : Array.isArray(legacy.slots)
    ? legacy.slots
    : [];

  if (sourceSlots.length !== 9) {
    throw new Error('LEGACY_MANIFEST_SCREEN_COUNT_INVALID');
  }

  return {
    schemaVersion: 'poster-layout-manifest/v2',
    manifestId: legacy.manifestId || `manifest_${Date.now()}`,
    projectId: legacy.projectId || 'default_project',
    canvasId: legacy.canvasId || 'default_canvas',
    versionNumber: legacy.versionNumber || 1,
    versionCode: legacy.versionCode || 'V001',
    screenCount: 9,
    screenWidth: 2100,
    screenHeight: 2800,
    screens: sourceSlots.map((slot: any, index: number) => ({
      sceneKey: `scene-${String(index + 1).padStart(2, '0')}`,
      screenIndex: index + 1,
      targetWidth: 2100,
      targetHeight: 2800,
      assetVersionId: slot.assetVersionId || '',
      assetBucket: slot.assetBucket,
      assetObjectKey: slot.assetObjectKey,
      fitMode: slot.fitMode || 'cover',
      focalPoint: slot.focalPoint || { x: 0.5, y: 0.5 },
      safeArea: slot.safeArea || { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 },
      reservedZones: slot.reservedZones || [],
      backgroundColor: slot.backgroundColor || '#FAF8F5',
      validationStatus: slot.validationStatus || 'valid',
      warnings: slot.warnings || []
    })),
    status: legacy.status === 'approved' ? 'approved' : 'draft',
    checksum: legacy.checksum || '',
    createdAt: legacy.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export type LayoutErrorCode =
  | 'SOURCE_DIMENSIONS_MISSING'
  | 'SOURCE_RATIO_MISMATCH'
  | 'INVALID_FOCAL_POINT'
  | 'INVALID_SAFE_AREA'
  | 'SLOT_HEIGHT_INVALID'
  | 'SCENE_SET_INCOMPLETE'
  | 'ASSET_NOT_PRODUCTION_READY'
  | 'ASSET_VERSION_STALE'
  | 'SMART_CROP_SUBJECT_MISSING'
  | 'SUBJECT_CROPPED'
  | 'SUBJECT_OUTSIDE_SAFE_CONTENT'
  | 'SAFE_ZONE_CONFLICT'
  | 'MANIFEST_IMMUTABLE';

export interface LayoutValidationResult {
  valid: boolean;
  canApprove: boolean;
  screenResults: Array<{
    sceneKey: string;
    screenIndex: number;
    validationStatus: 'valid' | 'warning' | 'invalid';
    warnings: string[];
    errors: string[];
    renderTransform?: RenderTransform;
  }>;
  slotResults?: Array<{
    sceneKey: string;
    validationStatus: 'valid' | 'warning' | 'invalid';
    warnings: string[];
    errors: string[];
    renderTransform?: RenderTransform;
  }>;
  globalErrors: string[];
  globalWarnings: string[];
}
