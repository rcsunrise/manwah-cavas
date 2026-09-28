import { z } from "zod";

// ==============================================================================
// 1. Core Enums
// ==============================================================================

export const DetailScreenRoleSchema = z.enum([
  "PRODUCT_HERO",
  "LIFESTYLE_SCENE",
  "FUNCTION_DEMO",
  "DETAIL_CALLOUT",
  "MATERIAL_ONLY",
  "INSPIRATION_ONLY",
  "PARAMETER_SUMMARY"
]);

export type DetailScreenRole = z.infer<typeof DetailScreenRoleSchema>;

export const ProductFeatureCategorySchema = z.enum([
  "silhouette",
  "module",
  "armrest",
  "backrest",
  "headrest",
  "seat",
  "leg",
  "material",
  "color",
  "decoration",
  "function",
  "accessory"
]);

export type ProductFeatureCategory = z.infer<typeof ProductFeatureCategorySchema>;

export const ProductFeatureImportanceSchema = z.enum([
  "hard",
  "major",
  "minor"
]);

export type ProductFeatureImportance = z.infer<typeof ProductFeatureImportanceSchema>;

export const FeatureRegistryStatusSchema = z.enum([
  "draft",
  "ready",
  "needs_review",
  "stale"
]);

export type FeatureRegistryStatus = z.infer<typeof FeatureRegistryStatusSchema>;

// ==============================================================================
// 2. Product Feature Registry Schema
// ==============================================================================

export const ReferenceCropSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().gt(0).max(1),
  height: z.number().gt(0).max(1)
}).refine(
  value =>
    value.x + value.width <= 1 &&
    value.y + value.height <= 1,
  "Reference crop must remain inside image bounds"
);

export type ReferenceCrop = z.infer<typeof ReferenceCropSchema>;

export const ProductFeatureSpecSchema = z.object({
  featureId: z.string().min(1),
  featureKey: z.string().min(1),
  category: ProductFeatureCategorySchema,
  name: z.string().min(1),
  description: z.string().default(""),
  importance: ProductFeatureImportanceSchema,
  mustPreserve: z.boolean(),
  applicableScreenRoles: z.array(DetailScreenRoleSchema).min(1),
  expectedValue: z.record(z.string(), z.unknown()).default({}),
  referenceAssetVersionId: z.string().nullable().optional(),
  referenceCrop: ReferenceCropSchema.nullable().optional(),
  sourcePath: z.string().nullable().optional(),
  sourceValueHash: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(1),
  manuallyConfirmed: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0)
});

export type ProductFeatureSpec = z.infer<typeof ProductFeatureSpecSchema>;

export const ProductFeatureRegistrySchema = z.object({
  schemaVersion: z.literal("1.0"),
  registryId: z.string(),
  workspaceId: z.string(),
  productDnaVersionId: z.string(),
  status: FeatureRegistryStatusSchema,
  sourceHash: z.string(),
  features: z.array(ProductFeatureSpecSchema),
  unmappedSourceFields: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type ProductFeatureRegistry = z.infer<typeof ProductFeatureRegistrySchema>;

// ==============================================================================
// 3. Consistency Policy Schema
// ==============================================================================

export const ConsistencyPolicySchema = z.object({
  schemaVersion: z.literal("1.0"),
  policyId: z.string(),
  workspaceId: z.string().nullable(),
  name: z.string(),
  passThreshold: z.number().min(0).max(100),
  reviewThreshold: z.number().min(0).max(100),
  dimensionWeights: z.object({
    silhouette: z.number(),
    module_structure: z.number(),
    armrest: z.number(),
    backrest_headrest: z.number(),
    seat_leg: z.number(),
    material_color: z.number(),
    decoration_function: z.number(),
    accessories: z.number()
  }),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
}).refine(
  value => value.passThreshold > value.reviewThreshold,
  "PASS threshold must be greater than REVIEW threshold"
).refine(
  value =>
    Object.values(value.dimensionWeights)
      .reduce((sum: number, weight: number) => sum + weight, 0) === 100,
  "Dimension weights must total 100"
);

export type ConsistencyPolicy = z.infer<typeof ConsistencyPolicySchema>;

// ==============================================================================
// 4. Consistency Report Schema
// ==============================================================================

export const ConsistencyReportStatusSchema = z.enum([
  "queued",
  "evaluating",
  "completed",
  "failed",
  "stale"
]);

export type ConsistencyReportStatus = z.infer<typeof ConsistencyReportStatusSchema>;

export const ConsistencyDecisionSchema = z.enum([
  "PASS",
  "REVIEW",
  "FAIL"
]);

export type ConsistencyDecision = z.infer<typeof ConsistencyDecisionSchema>;

export const ConsistencyViolationSchema = z.object({
  code: z.string(),
  severity: z.enum(["hard", "major", "minor"]),
  featureId: z.string().nullable().optional(),
  title: z.string(),
  description: z.string(),
  expected: z.string().nullable().optional(),
  observed: z.string().nullable().optional(),
  repairable: z.boolean()
});

export type ConsistencyViolation = z.infer<typeof ConsistencyViolationSchema>;

export const ConsistencyDimensionScoreSchema = z.object({
  dimension: z.enum([
    "silhouette",
    "module_structure",
    "armrest",
    "backrest_headrest",
    "seat_leg",
    "material_color",
    "decoration_function",
    "accessories"
  ]),
  score: z.number().min(0),
  maxScore: z.number().gt(0),
  applicable: z.boolean(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.record(z.string(), z.unknown())),
  violations: z.array(ConsistencyViolationSchema)
});

export type ConsistencyDimensionScore = z.infer<typeof ConsistencyDimensionScoreSchema>;

export const ProductConsistencyReportSchema = z.object({
  schemaVersion: z.literal("1.0"),
  reportId: z.string(),
  reportVersion: z.number().int().positive(),
  workspaceId: z.string(),
  screenId: z.string(),
  screenRole: DetailScreenRoleSchema,
  productDnaVersionId: z.string(),
  candidateAssetVersionId: z.string(),
  consistencyPolicyId: z.string(),
  status: ConsistencyReportStatusSchema,
  decision: ConsistencyDecisionSchema.nullable(),
  totalScore: z.number().min(0).max(100).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  dimensionScores: z.array(ConsistencyDimensionScoreSchema),
  hardViolations: z.array(ConsistencyViolationSchema),
  warnings: z.array(ConsistencyViolationSchema),
  repairDirective: z.record(z.string(), z.unknown()).nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  requestId: z.string().nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  estimatedCost: z.number().nonnegative().nullable(),
  idempotencyKey: z.string(),
  createdAt: z.string(),
  completedAt: z.string().nullable()
});

export type ProductConsistencyReport = z.infer<typeof ProductConsistencyReportSchema>;

// ==============================================================================
// 5. Input & Raw Model Evaluation Schemas
// ==============================================================================

export const EvaluateProductConsistencyInputSchema = z.object({
  workspaceId: z.string().min(1),
  canvasId: z.string().min(1),
  screenId: z.string().min(1),
  screenRole: DetailScreenRoleSchema,
  productDnaVersionId: z.string().min(1),
  consistencyPolicyId: z.string().min(1),
  referenceAssetVersionIds: z.array(z.string().min(1)).min(1),
  candidateAssetVersionId: z.string().min(1),
  scenePlanVersionId: z.string().nullable().optional(),
  idempotencyKey: z.string().min(8),
  requestedBy: z.string().min(1)
});

export type EvaluateProductConsistencyInput = z.infer<typeof EvaluateProductConsistencyInputSchema>;

export const RawConsistencyEvidenceSchema = z.object({
  featureId: z.string().nullable().optional(),
  source: z.enum(["reference", "candidate", "product_dna"]),
  description: z.string().min(1),
  boundingBox: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1)
  }).nullable().optional()
});

export type RawConsistencyEvidence = z.infer<typeof RawConsistencyEvidenceSchema>;

export const RawConsistencyDimensionEvaluationSchema = z.object({
  dimension: z.enum([
    "silhouette",
    "module_structure",
    "armrest",
    "backrest_headrest",
    "seat_leg",
    "material_color",
    "decoration_function",
    "accessories"
  ]),
  applicable: z.boolean(),
  rawScore: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  evidence: z.array(RawConsistencyEvidenceSchema),
  violations: z.array(ConsistencyViolationSchema)
});

export type RawConsistencyDimensionEvaluation = z.infer<typeof RawConsistencyDimensionEvaluationSchema>;

export const RawModelConsistencyResultSchema = z.object({
  schemaVersion: z.literal("1.0"),
  screenRole: DetailScreenRoleSchema,
  summary: z.string(),
  dimensions: z.array(RawConsistencyDimensionEvaluationSchema),
  globalViolations: z.array(ConsistencyViolationSchema),
  modelConfidence: z.number().min(0).max(1)
});

export type RawModelConsistencyResult = z.infer<typeof RawModelConsistencyResultSchema>;

export const ConsistencyPreflightErrorCodeSchema = z.enum([
  "WORKSPACE_NOT_FOUND",
  "CANVAS_NOT_FOUND",
  "ACCESS_DENIED",
  "DNA_VERSION_NOT_FOUND",
  "DNA_WORKSPACE_MISMATCH",
  "FEATURE_REGISTRY_NOT_FOUND",
  "FEATURE_REGISTRY_NOT_READY",
  "POLICY_NOT_FOUND",
  "POLICY_INACTIVE",
  "POLICY_WEIGHT_INVALID",
  "CANDIDATE_ASSET_NOT_FOUND",
  "CANDIDATE_ASSET_NOT_READY",
  "CANDIDATE_OBJECT_MISSING",
  "REFERENCE_ASSET_NOT_FOUND",
  "REFERENCE_ASSET_NOT_READY",
  "REFERENCE_OBJECT_MISSING",
  "CROSS_WORKSPACE_REFERENCE",
  "INVALID_SCREEN_ROLE",
  "NO_APPLICABLE_FEATURES",
  "MODEL_CAPABILITY_UNSUPPORTED"
]);

export type ConsistencyPreflightErrorCode = z.infer<typeof ConsistencyPreflightErrorCodeSchema>;

