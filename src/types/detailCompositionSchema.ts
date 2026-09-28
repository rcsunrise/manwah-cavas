// src/types/detailCompositionSchema.ts
import { z } from 'zod';
import { POSTER_SPEC } from '../config/posterSpec';
import { DetailScreenRoleSchema } from './consistencySchema';

// ==============================================================================
// 1. Text Layer Schema
// ==============================================================================

export const TextCopyFieldSchema = z.enum([
  "eyebrow",
  "headline",
  "subheadline",
  "body",
  "selling_point",
  "feature_label",
  "spec",
  "cta",
  "disclaimer",
  "title",
  "subtitle",
  "parameter"
]);

export type TextCopyField = z.infer<typeof TextCopyFieldSchema>;

export const TextLayerSchema = z.object({
  id: z.string().min(1),
  slotKey: z.string().optional(),
  copyField: TextCopyFieldSchema,
  text: z.string(),
  x: z.number().min(0).max(POSTER_SPEC.width),
  y: z.number().min(0).max(POSTER_SPEC.height),
  width: z.number().gt(0).max(POSTER_SPEC.width),
  height: z.number().gt(0).max(POSTER_SPEC.height),
  fontFamily: z.string().min(1).default("PingFang SC"),
  fallbackFonts: z.array(z.string()).default(["Noto Sans SC", "Microsoft YaHei", "sans-serif"]),
  fontSize: z.number().gt(0).max(300).default(48),
  fontWeight: z.number().min(100).max(900).default(700),
  lineHeight: z.number().gt(0).default(1.3),
  letterSpacing: z.number().default(0),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).default("#2C2A29"),
  textAlign: z.enum(["left", "center", "right"]).default("left"),
  verticalAlign: z.enum(["top", "middle", "bottom"]).default("top"),
  maxLines: z.number().int().positive().default(3),
  overflow: z.enum(["shrink", "ellipsis", "error", "hide_low_priority", "truncate"]).default("shrink"),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  zIndex: z.number().int().default(10),
  safeAreaRequired: z.boolean().default(true)
});

export type TextLayer = z.infer<typeof TextLayerSchema>;

// ==============================================================================
// 2. Image Layer Schema
// ==============================================================================

export const ImageLayerSchema = z.object({
  id: z.string().min(1),
  assetVersionId: z.string().min(1),
  bucket: z.string().optional(),
  objectKey: z.string().min(1),
  sourceWidth: z.number().gt(0).default(2100),
  sourceHeight: z.number().gt(0).default(2800),
  sourceAspectRatio: z.string().default("3:4"),
  x: z.number().min(0).max(POSTER_SPEC.width).default(0),
  y: z.number().min(0).max(POSTER_SPEC.height).default(0),
  width: z.number().gt(0).max(POSTER_SPEC.width).default(POSTER_SPEC.width),
  height: z.number().gt(0).max(POSTER_SPEC.height).default(POSTER_SPEC.height),
  fitMode: z.enum(["contain", "cover", "smart_crop"]).default("cover"),
  focalPoint: z.object({
    x: z.number().min(0).max(1).default(0.5),
    y: z.number().min(0).max(1).default(0.5)
  }).default({ x: 0.5, y: 0.5 }),
  subjectBounds: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
  }).nullable().optional(),
  safeArea: z.object({
    top: z.number().default(0.08),
    right: z.number().default(0.08),
    bottom: z.number().default(0.08),
    left: z.number().default(0.08)
  }).optional(),
  backgroundColor: z.string().default("#FAF8F5"),
  opacity: z.number().min(0).max(1).default(1),
  zIndex: z.number().int().default(1)
});

export type ImageLayer = z.infer<typeof ImageLayerSchema>;

// ==============================================================================
// 3. Unified Poster Composition Snapshot (PosterCompositionSnapshot)
// ==============================================================================

export interface PosterCompositionSnapshot {
  schemaVersion: 'poster-composition/v1';

  compositionId: string;
  compositionVersionId: string;

  projectId: string;
  workspaceId: string;
  canvasId: string;
  sceneKey: string;
  screenId: string;
  screenIndex: number;

  width: 2100;
  height: 2800;

  assetVersionId: string;
  assetBucket: string;
  assetObjectKey: string;
  assetChecksum?: string;

  copySkuId: string;
  copyVersionId: string;
  copyContentHash: string;

  typographySpecId: string;
  typographySpecVersion?: string;

  backgroundColor: string;
  imageLayers: ImageLayer[];
  textLayers: TextLayer[];

  status:
    | 'draft'
    | 'ready'
    | 'rendering'
    | 'rendered'
    | 'failed'
    | 'stale';

  checksum: string;
  createdAt: string;
  updatedAt: string;
}

export function validateCompositionForRender(
  composition: PosterCompositionSnapshot
): void {
  if (composition.width !== POSTER_SPEC.width || composition.height !== POSTER_SPEC.height) {
    throw new Error('COMPOSITION_DIMENSION_INVALID');
  }

  if (!composition.assetVersionId) {
    throw new Error('BASE_ASSET_VERSION_REQUIRED');
  }

  if (!composition.assetBucket || !composition.assetObjectKey) {
    throw new Error('BASE_ASSET_LOCATION_REQUIRED');
  }

  if (!composition.copyVersionId) {
    throw new Error('COPY_VERSION_REQUIRED');
  }

  if (!composition.typographySpecId) {
    throw new Error('TYPOGRAPHY_SPEC_REQUIRED');
  }

  if (!Array.isArray(composition.imageLayers) || composition.imageLayers.length === 0) {
    throw new Error('IMAGE_LAYER_REQUIRED');
  }

  if (!Array.isArray(composition.textLayers)) {
    throw new Error('TEXT_LAYERS_INVALID');
  }
}

// ==============================================================================
// 4. Legacy Composition Schemas for backward compatibility
// ==============================================================================

export const ScreenCompositionStatusSchema = z.enum([
  'draft',
  'dirty',
  'approved',
  'rendered',
  'blocked'
]);

export type ScreenCompositionStatus = z.infer<typeof ScreenCompositionStatusSchema>;

export const ScreenCompositionSchema = z.object({
  schemaVersion: z.literal("screen-composition/v2").default("screen-composition/v2"),
  compositionId: z.string().min(1),
  compositionVersionId: z.string().min(1),
  workspaceId: z.string().min(1).default("default_workspace"),
  canvasId: z.string().min(1),
  screenId: z.string().min(1),
  screenRole: DetailScreenRoleSchema.default("PRODUCT_HERO"),
  width: z.literal(2100).default(2100),
  height: z.literal(2800).default(2800),
  layoutManifestId: z.string().default("manifest_default"),
  baseAssetVersionId: z.string().min(1),
  productDnaVersionId: z.string().min(1),
  copySkuId: z.string().min(1),
  copyVersionId: z.string().min(1),
  typographySpecId: z.string().min(1),
  consistencyReportId: z.string().min(1),
  backgroundColor: z.string().default("#FAF8F5"),
  imageLayers: z.array(ImageLayerSchema).min(1),
  textLayers: z.array(TextLayerSchema),
  status: ScreenCompositionStatusSchema.default("draft"),
  renderAssetVersionId: z.string().nullable().optional(),
  checksum: z.string().default("")
});

export type ScreenComposition = z.infer<typeof ScreenCompositionSchema>;
export type ScreenCompositionV2 = ScreenComposition;

export const CompositionAssembleInputSchema = z.object({
  canvasId: z.string().min(1),
  workspaceId: z.string().min(1).default("default_workspace"),
  screenId: z.string().min(1).default("screen-01"),
  sceneKey: z.string().optional(),
  screenRole: DetailScreenRoleSchema.optional(),
  slotHeight: z.number().optional(),
  layoutManifestId: z.string().optional(),
  baseAssetVersionId: z.string().optional(),
  productDnaVersionId: z.string().optional(),
  copySkuId: z.string().optional(),
  copyVersionId: z.string().optional(),
  typographySpecId: z.string().optional(),
  consistencyReportId: z.string().optional(),
  requestedBy: z.string().optional()
});

export type CompositionAssembleInput = z.infer<typeof CompositionAssembleInputSchema>;
export const Screen01CompositionInputSchema = CompositionAssembleInputSchema;
export type Screen01CompositionInput = CompositionAssembleInput;

export const RenderJobStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed"
]);

export type RenderJobStatus = z.infer<typeof RenderJobStatusSchema>;

export const CompositionRenderJobSchema = z.object({
  jobId: z.string().min(1),
  workspaceId: z.string().min(1),
  canvasId: z.string().min(1),
  compositionId: z.string().min(1),
  status: RenderJobStatusSchema,
  compositionAssetVersionId: z.string().nullable().optional(),
  outputObjectKey: z.string().nullable().optional(),
  outputUrl: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  progressPercent: z.number().min(0).max(100).default(0),
  createdAt: z.string(),
  completedAt: z.string().nullable().optional()
});

export type CompositionRenderJob = z.infer<typeof CompositionRenderJobSchema>;
