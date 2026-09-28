import {
  RawModelConsistencyResult,
  ConsistencyPolicy,
  ProductFeatureSpec,
  DetailScreenRole,
  ConsistencyDimensionScore,
  ConsistencyViolation,
  ConsistencyDecision
} from '../../src/types/consistencySchema';

export interface CalculatedConsistencyResult {
  totalScore: number;
  confidence: number;
  decision: ConsistencyDecision;
  dimensionScores: ConsistencyDimensionScore[];
  hardViolations: ConsistencyViolation[];
  warnings: ConsistencyViolation[];
  repairDirective: Record<string, unknown> | null;
}

export function calculateConsistencyScore(
  rawModelResult: RawModelConsistencyResult,
  policy: ConsistencyPolicy,
  applicableFeatures: ProductFeatureSpec[],
  screenRole: DetailScreenRole
): CalculatedConsistencyResult {
  const dimensionWeights = policy.dimensionWeights;

  // Screen role override rules for applicable dimensions
  const roleApplicableDimensionsMap: Record<DetailScreenRole, string[]> = {
    PRODUCT_HERO: ["silhouette", "module_structure", "armrest", "backrest_headrest", "seat_leg", "material_color", "decoration_function", "accessories"],
    LIFESTYLE_SCENE: ["silhouette", "module_structure", "armrest", "backrest_headrest", "seat_leg", "material_color", "decoration_function", "accessories"],
    FUNCTION_DEMO: ["module_structure", "armrest", "backrest_headrest", "seat_leg", "decoration_function"],
    DETAIL_CALLOUT: ["armrest", "backrest_headrest", "seat_leg", "material_color", "decoration_function"],
    MATERIAL_ONLY: ["material_color"],
    INSPIRATION_ONLY: ["material_color", "accessories"],
    PARAMETER_SUMMARY: ["silhouette", "module_structure", "armrest", "backrest_headrest", "seat_leg", "material_color", "decoration_function"]
  };

  const allowedDims = roleApplicableDimensionsMap[screenRole] || roleApplicableDimensionsMap.PRODUCT_HERO;

  // Process dimensions
  const processedDimensions: ConsistencyDimensionScore[] = rawModelResult.dimensions.map(rawDim => {
    const isRoleAllowed = allowedDims.includes(rawDim.dimension);
    const isApplicable = rawDim.applicable && isRoleAllowed;

    return {
      dimension: rawDim.dimension,
      score: isApplicable ? Math.min(100, Math.max(0, rawDim.rawScore)) : 0,
      maxScore: 100,
      applicable: isApplicable,
      confidence: rawDim.confidence ?? 0.9,
      evidence: rawDim.evidence || [],
      violations: rawDim.violations || []
    };
  });

  // Calculate sum of policy weights for applicable dimensions
  let applicableWeightTotal = 0;
  for (const dimScore of processedDimensions) {
    if (dimScore.applicable) {
      const weight = (dimensionWeights as any)[dimScore.dimension] || 0;
      applicableWeightTotal += weight;
    }
  }

  // Fallback if no applicable weights sum to > 0
  if (applicableWeightTotal <= 0) applicableWeightTotal = 100;

  // Calculate normalized total score
  let totalScore = 0;
  for (const dimScore of processedDimensions) {
    if (dimScore.applicable) {
      const rawWeight = (dimensionWeights as any)[dimScore.dimension] || 0;
      const normalizedWeight = (rawWeight / applicableWeightTotal) * 100;
      const weightedContrib = (dimScore.score / 100) * normalizedWeight;
      totalScore += weightedContrib;
    }
  }

  totalScore = Math.round(totalScore * 100) / 100;

  // Collect violations & hard violations
  const hardViolations: ConsistencyViolation[] = [];
  const warnings: ConsistencyViolation[] = [];

  // Add global violations
  if (Array.isArray(rawModelResult.globalViolations)) {
    for (const v of rawModelResult.globalViolations) {
      if (v.severity === 'hard') {
        // Special check: Do not enforce missing sofa body for MATERIAL_ONLY or INSPIRATION_ONLY
        if ((screenRole === 'MATERIAL_ONLY' || screenRole === 'INSPIRATION_ONLY') && v.code === 'MISSING_PRODUCT') {
          warnings.push({ ...v, severity: 'minor' });
        } else {
          hardViolations.push(v);
        }
      } else {
        warnings.push(v);
      }
    }
  }

  // Add dimension violations
  for (const dimScore of processedDimensions) {
    if (dimScore.applicable) {
      for (const v of dimScore.violations) {
        if (v.severity === 'hard') {
          hardViolations.push(v);
        } else {
          warnings.push(v);
        }
      }
    }
  }

  // Determine Gate Decision
  let decision: ConsistencyDecision;
  if (hardViolations.length > 0) {
    decision = "FAIL";
  } else if (totalScore >= policy.passThreshold) {
    decision = "PASS";
  } else if (totalScore >= policy.reviewThreshold) {
    decision = "REVIEW";
  } else {
    decision = "FAIL";
  }

  // Build repair directive if FAIL or REVIEW
  let repairDirective: Record<string, unknown> | null = null;
  if (decision === "FAIL" || decision === "REVIEW") {
    repairDirective = {
      targetScreenRole: screenRole,
      recommendedPromptAdjustments: hardViolations.map(h => h.description || h.title),
      violationsToFix: [...hardViolations, ...warnings.filter(w => w.repairable)],
      suggestedAspectsToPreserve: applicableFeatures.filter(f => f.mustPreserve).map(f => f.name)
    };
  }

  return {
    totalScore,
    confidence: rawModelResult.modelConfidence ?? 0.9,
    decision,
    dimensionScores: processedDimensions,
    hardViolations,
    warnings,
    repairDirective
  };
}
