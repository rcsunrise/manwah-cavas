// server/services/layoutManifestService.ts
import crypto from 'crypto';
import { AppError } from '../types';
import { POSTER_SPEC } from '../../src/config/posterSpec';
import {
  NinePosterLayoutManifest,
  PosterScreenLayout,
  NineScreenLayoutManifest,
  LayoutSlotSpec,
  LayoutValidationResult,
  migrateLegacyManifestToPosterV2
} from '../../src/types/layoutManifest';
import {
  computeLayoutTransform,
  validateNinePosterLayoutManifest,
  calculateManifestChecksum,
  simplifyAspectRatio,
  DEFAULT_POSTER_SCREENS
} from '../../src/lib/layoutGeometry';
import { LayoutManifestRepository } from '../repositories/layoutManifestRepository';
import { supabaseAdmin } from '../../src/lib/supabase';

export class LayoutManifestService {
  /**
   * Create or Save Draft Manifest for a Canvas (9 Posters, 2100x2800 each)
   */
  static async createDraftManifest(params: {
    canvasId: string;
    projectId: string;
    screens?: Partial<PosterScreenLayout>[];
    slots?: (Partial<LayoutSlotSpec> & { sceneKey?: any })[];
    widthPx?: number;
    userId?: string;
  }): Promise<NinePosterLayoutManifest> {
    const {
      canvasId,
      projectId,
      screens,
      slots,
      userId = 'system'
    } = params;

    if (!canvasId || !projectId) {
      throw new AppError('canvasId 和 projectId 不能为空', 400, 'PARAM_REQUIRED');
    }

    const rawScreens = screens || slots || [];
    if (!Array.isArray(rawScreens) || rawScreens.length === 0) {
      throw new AppError('screens 数组不能为空', 400, 'SCREENS_REQUIRED');
    }

    // Verify existing manifests to determine version number
    const existingList = await LayoutManifestRepository.getManifestsByCanvasId(canvasId);
    const versionNumber = existingList.length + 1;
    const versionCode = `V${String(versionNumber).padStart(3, '0')}`;
    const manifestId = `manifest_${canvasId}_${versionCode}_${Date.now()}`;

    // Process and enrich screens
    const enrichedScreens: PosterScreenLayout[] = rawScreens.map((rawScreen, idx) => {
      const screenIndex = idx + 1;
      const sceneKey = `scene-${String(screenIndex).padStart(2, '0')}`;

      const sourceWidth = Number((rawScreen as any).sourceWidth) || POSTER_SPEC.width;
      const sourceHeight = Number((rawScreen as any).sourceHeight) || POSTER_SPEC.height;
      const sourceAspectRatio = (rawScreen as any).sourceAspectRatio || simplifyAspectRatio(sourceWidth, sourceHeight);

      const targetWidth = POSTER_SPEC.width;
      const targetHeight = POSTER_SPEC.height;

      const fitMode = rawScreen.fitMode || 'cover';
      const focalPoint = rawScreen.focalPoint || { x: 0.5, y: 0.5 };
      const safeArea = rawScreen.safeArea || { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 };
      const reservedZones = (rawScreen.reservedZones || []).map((z: any, zIdx: number) => ({
        id: z.id || `zone_${zIdx + 1}`,
        label: z.label || `Zone ${zIdx + 1}`,
        x: z.x ?? 0,
        y: z.y ?? 0,
        width: z.width ?? 0.2,
        height: z.height ?? 0.2
      }));
      const subjectBounds = (rawScreen as any).subjectBounds || null;
      const backgroundColor = rawScreen.backgroundColor || '#FAF8F5';

      const renderTransform = computeLayoutTransform({
        slotWidth: targetWidth,
        slotHeight: targetHeight,
        sourceWidth,
        sourceHeight,
        fitMode,
        focalPoint,
        subjectBounds,
        reservedZones
      });

      return {
        sceneKey,
        screenIndex,
        targetWidth: POSTER_SPEC.width,
        targetHeight: POSTER_SPEC.height,
        assetVersionId: rawScreen.assetVersionId || `asset-ver-${sceneKey}-v001`,
        assetBucket: rawScreen.assetBucket,
        assetObjectKey: rawScreen.assetObjectKey,
        fitMode,
        focalPoint,
        safeArea,
        reservedZones,
        backgroundColor,
        validationStatus: (renderTransform.warnings.length > 0 ? 'warning' : 'valid') as 'valid' | 'warning' | 'invalid',
        warnings: renderTransform.warnings,
        sourceWidth,
        sourceHeight,
        sourceAspectRatio,
        renderTransform
      };
    });

    const draftManifest: NinePosterLayoutManifest = {
      schemaVersion: 'poster-layout-manifest/v2',
      manifestId,
      projectId,
      canvasId,
      versionNumber,
      versionCode,
      screenCount: 9,
      screenWidth: POSTER_SPEC.width,
      screenHeight: POSTER_SPEC.height,
      screens: enrichedScreens,
      status: 'draft',
      checksum: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    draftManifest.checksum = await calculateManifestChecksum(draftManifest);

    await LayoutManifestRepository.saveManifest(draftManifest as any, userId);

    return draftManifest;
  }

  /**
   * Get Manifest by ID
   */
  static async getManifestById(manifestId: string): Promise<NinePosterLayoutManifest> {
    const manifest = await LayoutManifestRepository.getManifestById(manifestId);
    if (!manifest) {
      throw new AppError(`找不到 Manifest ID: ${manifestId}`, 404, 'MANIFEST_NOT_FOUND');
    }
    if ((manifest as any).schemaVersion === 'layout-manifest/v1' || !(manifest as any).screens) {
      return migrateLegacyManifestToPosterV2(manifest);
    }
    return manifest as unknown as NinePosterLayoutManifest;
  }

  /**
   * Get Current Manifest for Canvas
   */
  static async getCurrentManifest(canvasId: string): Promise<NinePosterLayoutManifest | null> {
    const manifest = await LayoutManifestRepository.getCurrentManifest(canvasId);
    if (!manifest) return null;
    if ((manifest as any).schemaVersion === 'layout-manifest/v1' || !(manifest as any).screens) {
      return migrateLegacyManifestToPosterV2(manifest);
    }
    return manifest as unknown as NinePosterLayoutManifest;
  }

  /**
   * Run Deterministic Validation on a Manifest
   */
  static async validateManifest(manifestId: string): Promise<{
    manifest: NinePosterLayoutManifest;
    validation: LayoutValidationResult;
  }> {
    const manifest = await this.getManifestById(manifestId);
    const validation = validateNinePosterLayoutManifest(manifest);

    return {
      manifest,
      validation
    };
  }

  /**
   * Approve Manifest (Locks it immutably for downstream 9-poster composition & rendering)
   */
  static async approveManifest(manifestId: string, userId: string = 'system'): Promise<NinePosterLayoutManifest> {
    const manifest = await this.getManifestById(manifestId);

    if (manifest.status === 'approved') {
      return manifest; // Idempotent
    }

    const validation = validateNinePosterLayoutManifest(manifest);
    if (!validation.canApprove) {
      const errorMsg = validation.globalErrors.join('; ') || '存在未通过的非法海报分镜配置';
      throw new AppError(`无法批准该 Manifest: ${errorMsg}`, 400, 'MANIFEST_VALIDATION_FAILED');
    }

    manifest.status = 'approved';
    manifest.updatedAt = new Date().toISOString();

    // Recompute stable checksum
    manifest.checksum = await calculateManifestChecksum(manifest);

    await LayoutManifestRepository.saveManifest(manifest as any, userId);
    return manifest;
  }

  /**
   * Derive New Draft Manifest from an existing (approved or draft) Manifest
   */
  static async deriveDraftManifest(manifestId: string, userId: string = 'system'): Promise<NinePosterLayoutManifest> {
    const parentManifest = await this.getManifestById(manifestId);

    const existingList = await LayoutManifestRepository.getManifestsByCanvasId(parentManifest.canvasId);
    const nextVersionNumber = existingList.length + 1;
    const nextVersionCode = `V${String(nextVersionNumber).padStart(3, '0')}`;
    const newManifestId = `manifest_${parentManifest.canvasId}_${nextVersionCode}_${Date.now()}`;

    // Clone screens with clean state
    const clonedScreens: PosterScreenLayout[] = parentManifest.screens.map(s => ({
      ...s,
      targetWidth: POSTER_SPEC.width,
      targetHeight: POSTER_SPEC.height,
      renderTransform: computeLayoutTransform({
        slotWidth: POSTER_SPEC.width,
        slotHeight: POSTER_SPEC.height,
        sourceWidth: s.sourceWidth || POSTER_SPEC.width,
        sourceHeight: s.sourceHeight || POSTER_SPEC.height,
        fitMode: s.fitMode,
        focalPoint: s.focalPoint,
        reservedZones: s.reservedZones
      })
    }));

    const newDraft: NinePosterLayoutManifest = {
      schemaVersion: 'poster-layout-manifest/v2',
      manifestId: newManifestId,
      projectId: parentManifest.projectId,
      canvasId: parentManifest.canvasId,
      versionNumber: nextVersionNumber,
      versionCode: nextVersionCode,
      screenCount: 9,
      screenWidth: POSTER_SPEC.width,
      screenHeight: POSTER_SPEC.height,
      screens: clonedScreens,
      status: 'draft',
      checksum: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    newDraft.checksum = await calculateManifestChecksum(newDraft);

    await LayoutManifestRepository.saveManifest(newDraft as any, userId);
    return newDraft;
  }

  /**
   * Alias for deriveDraftManifest
   */
  static async deriveNewManifestVersion(manifestId: string, userId: string = 'system'): Promise<NinePosterLayoutManifest> {
    return this.deriveDraftManifest(manifestId, userId);
  }

  /**
   * Get all manifest versions for a canvas
   */
  static async getManifestVersions(canvasId: string): Promise<NinePosterLayoutManifest[]> {
    const list = await LayoutManifestRepository.getManifestsByCanvasId(canvasId);
    return list.map(m => {
      if ((m as any).schemaVersion === 'layout-manifest/v1' || !(m as any).screens) {
        return migrateLegacyManifestToPosterV2(m);
      }
      return m as unknown as NinePosterLayoutManifest;
    });
  }
}
