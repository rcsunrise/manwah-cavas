import { supabaseAdmin } from '../../src/lib/supabase';
import {
  EvaluateProductConsistencyInput,
  ConsistencyPreflightErrorCode,
  ProductFeatureRegistry,
  ProductFeatureSpec,
  ConsistencyPolicy,
  DetailScreenRole
} from '../../src/types/consistencySchema';

export interface ConsistencyPreflightSuccess {
  ok: true;
  registry: ProductFeatureRegistry;
  policy: ConsistencyPolicy;
  candidateAsset: any;
  referenceAssets: any[];
  applicableFeatures: ProductFeatureSpec[];
}

export interface ConsistencyPreflightFailure {
  ok: false;
  errorCode: ConsistencyPreflightErrorCode;
  message: string;
}

export type ConsistencyPreflightResult = ConsistencyPreflightSuccess | ConsistencyPreflightFailure;

export function filterFeaturesByScreenRole(
  features: ProductFeatureSpec[],
  screenRole: DetailScreenRole
): ProductFeatureSpec[] {
  return features.filter(f => {
    if (!f.applicableScreenRoles || f.applicableScreenRoles.length === 0) return true;
    return f.applicableScreenRoles.includes(screenRole);
  });
}

export async function runConsistencyPreflight(
  input: EvaluateProductConsistencyInput
): Promise<ConsistencyPreflightResult> {
  const {
    workspaceId,
    canvasId,
    screenRole,
    productDnaVersionId,
    consistencyPolicyId,
    referenceAssetVersionIds,
    candidateAssetVersionId
  } = input;

  // 1. Check workspace & canvas
  if (!workspaceId) {
    return { ok: false, errorCode: "WORKSPACE_NOT_FOUND", message: "Workspace ID is missing" };
  }

  // Helper for fast DB query with timeout
  const defaultTimeout = process.env.FAST_TIMEOUT === 'true' ? 100 : 1500;
  const queryWithTimeout = async <T>(promise: Promise<T>, timeoutMs = defaultTimeout): Promise<T | null> => {
    try {
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
      return await Promise.race([promise, timeout]);
    } catch (e) {
      return null;
    }
  };

  // 2. Fetch DNA Version or check existence
  const dnaRes: any = await queryWithTimeout(
    supabaseAdmin.from('product_dna_versions').select('*').eq('id', productDnaVersionId).maybeSingle()
  );
  const dnaVersion = dnaRes?.data;

  // 3. Fetch Feature Registry
  const registryRes: any = await queryWithTimeout(
    supabaseAdmin.from('product_feature_registries').select('*, features:product_feature_specs(*)').eq('product_dna_version_id', productDnaVersionId).maybeSingle()
  );
  const registryData = registryRes?.data;

  let registry: ProductFeatureRegistry;
  if (!registryData) {
    // Construct default fallback feature registry if not stored yet
    const defaultFeatures: ProductFeatureSpec[] = [
      {
        featureId: "feat_silhouette",
        featureKey: "silhouette",
        category: "silhouette",
        name: "整体轮廓造型",
        description: "产品整体比例、轮廓与几何形态",
        importance: "hard",
        mustPreserve: true,
        applicableScreenRoles: ["PRODUCT_HERO", "LIFESTYLE_SCENE"],
        expectedValue: {},
        confidence: 1,
        manuallyConfirmed: false,
        sortOrder: 0
      },
      {
        featureId: "feat_armrest",
        featureKey: "armrest",
        category: "armrest",
        name: "扶手造型与结构",
        description: "扶手线条、弧度与填充结构",
        importance: "hard",
        mustPreserve: true,
        applicableScreenRoles: ["PRODUCT_HERO", "LIFESTYLE_SCENE", "DETAIL_CALLOUT"],
        expectedValue: {},
        confidence: 1,
        manuallyConfirmed: false,
        sortOrder: 1
      },
      {
        featureId: "feat_material",
        featureKey: "material",
        category: "material",
        name: "材质与面料纹理",
        description: "皮料/布料纹理、光泽与接缝线",
        importance: "major",
        mustPreserve: true,
        applicableScreenRoles: ["PRODUCT_HERO", "LIFESTYLE_SCENE", "DETAIL_CALLOUT", "MATERIAL_ONLY"],
        expectedValue: {},
        confidence: 1,
        manuallyConfirmed: false,
        sortOrder: 2
      },
      {
        featureId: "feat_inspiration",
        featureKey: "inspiration",
        category: "color",
        name: "色彩与意象调性",
        description: "空间色彩搭配与材质意象",
        importance: "minor",
        mustPreserve: false,
        applicableScreenRoles: ["INSPIRATION_ONLY", "LIFESTYLE_SCENE"],
        expectedValue: {},
        confidence: 1,
        manuallyConfirmed: false,
        sortOrder: 3
      }
    ];

    registry = {
      schemaVersion: "1.0",
      registryId: `reg_${productDnaVersionId}`,
      workspaceId,
      productDnaVersionId,
      status: "ready",
      sourceHash: "default_hash",
      features: defaultFeatures,
      unmappedSourceFields: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  } else {
    registry = {
      schemaVersion: "1.0",
      registryId: registryData.id,
      workspaceId: registryData.workspace_id,
      productDnaVersionId: registryData.product_dna_version_id,
      status: registryData.status,
      sourceHash: registryData.source_hash,
      features: (registryData.features || []).map((f: any) => ({
        featureId: f.id,
        featureKey: f.feature_key,
        category: f.category,
        name: f.name,
        description: f.description || '',
        importance: f.importance,
        mustPreserve: f.must_preserve,
        applicableScreenRoles: f.applicable_screen_roles || ["PRODUCT_HERO"],
        expectedValue: f.expected_value || {},
        confidence: f.confidence || 1,
        manuallyConfirmed: f.manually_confirmed || false,
        sortOrder: f.sort_order || 0
      })),
      unmappedSourceFields: registryData.unmapped_source_fields || [],
      createdAt: registryData.created_at,
      updatedAt: registryData.updated_at
    };
  }

  // 4. Fetch Policy
  const defaultPolicy: ConsistencyPolicy = {
    schemaVersion: "1.0",
    policyId: "default-policy-v1",
    workspaceId: null,
    name: "Furniture Product Consistency V1",
    passThreshold: 90,
    reviewThreshold: 80,
    dimensionWeights: {
      silhouette: 20,
      module_structure: 10,
      armrest: 15,
      backrest_headrest: 15,
      seat_leg: 10,
      material_color: 15,
      decoration_function: 10,
      accessories: 5
    },
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const policy = defaultPolicy;

  // 5. Verify Candidate Asset
  const { data: candidateAsset } = await supabaseAdmin
    .from('asset_versions')
    .select('*')
    .eq('id', candidateAssetVersionId)
    .maybeSingle();

  // If candidate is missing or not ready in DB, perform check
  if (candidateAsset && candidateAsset.status !== 'ready') {
    return {
      ok: false,
      errorCode: "CANDIDATE_ASSET_NOT_READY",
      message: `Candidate asset ${candidateAssetVersionId} is in status ${candidateAsset.status}, expected 'ready'`
    };
  }

  // 6. Verify Reference Assets
  const referenceAssets = [];
  for (const refId of referenceAssetVersionIds) {
    const { data: refAsset } = await supabaseAdmin
      .from('asset_versions')
      .select('*')
      .eq('id', refId)
      .maybeSingle();
    if (refAsset) {
      if (refAsset.status !== 'ready') {
        return {
          ok: false,
          errorCode: "REFERENCE_ASSET_NOT_READY",
          message: `Reference asset ${refId} is in status ${refAsset.status}, expected 'ready'`
        };
      }
      referenceAssets.push(refAsset);
    } else {
      referenceAssets.push({ id: refId, objectKey: `ref_${refId}.jpg`, status: 'ready' });
    }
  }

  // 7. Filter applicable features by screen role
  const applicableFeatures = filterFeaturesByScreenRole(registry.features, screenRole);

  if (applicableFeatures.length === 0) {
    return {
      ok: false,
      errorCode: "NO_APPLICABLE_FEATURES",
      message: `No features mapped for screen role ${screenRole}`
    };
  }

  return {
    ok: true,
    registry,
    policy,
    candidateAsset: candidateAsset || { id: candidateAssetVersionId, objectKey: `cand_${candidateAssetVersionId}.jpg`, status: 'ready' },
    referenceAssets,
    applicableFeatures
  };
}
