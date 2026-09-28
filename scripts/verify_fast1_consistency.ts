import { runConsistencyPreflight } from '../server/services/consistencyPreflightService';
import { calculateConsistencyScore } from '../server/services/consistencyScoringService';
import { buildConsistencyEvaluationPrompt } from '../server/services/consistencyPromptService';
import { evaluateProductConsistency } from '../server/services/consistencyService';
import { ConsistencyPolicy, ProductFeatureSpec, RawModelConsistencyResult } from '../src/types/consistencySchema';

async function runTests() {
  console.log('=== FAST-1 Product Consistency System Automated Verification ===\n');
  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passCount++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failCount++;
    }
  }

  // T1: Preflight input check
  const preflightRes = await runConsistencyPreflight({
    workspaceId: 'ws_test_001',
    canvasId: 'cv_test_001',
    screenId: 'screen-01',
    screenRole: 'PRODUCT_HERO',
    productDnaVersionId: 'dna-v001',
    consistencyPolicyId: 'default-policy-v1',
    referenceAssetVersionIds: ['ref-001'],
    candidateAssetVersionId: 'cand-001',
    idempotencyKey: 'idemp_test_001',
    requestedBy: 'user_test'
  });
  assert(preflightRes.ok === true, 'T1: Preflight executes successfully for valid input');

  // T2: Preflight feature filtering for HERO
  if (preflightRes.ok) {
    assert(preflightRes.applicableFeatures.length > 0, 'T2: Applicable features populated for PRODUCT_HERO');
  }

  // T3: Preflight feature filtering for MATERIAL_ONLY
  const matPreflight = await runConsistencyPreflight({
    workspaceId: 'ws_test_001',
    canvasId: 'cv_test_001',
    screenId: 'screen-05',
    screenRole: 'MATERIAL_ONLY',
    productDnaVersionId: 'dna-v001',
    consistencyPolicyId: 'default-policy-v1',
    referenceAssetVersionIds: ['ref-001'],
    candidateAssetVersionId: 'cand-005',
    idempotencyKey: 'idemp_test_005',
    requestedBy: 'user_test'
  });
  assert(matPreflight.ok === true, 'T3: Preflight executes for MATERIAL_ONLY');

  // T4: Policy threshold validation
  const testPolicy: ConsistencyPolicy = {
    schemaVersion: "1.0",
    policyId: "test-pol",
    workspaceId: "ws_test_001",
    name: "Test Policy",
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

  const dummyFeatures: ProductFeatureSpec[] = [{
    featureId: "f1",
    featureKey: "armrest",
    category: "armrest",
    name: "Armrest",
    description: "Armrest shape",
    importance: "hard",
    mustPreserve: true,
    applicableScreenRoles: ["PRODUCT_HERO"],
    expectedValue: {},
    confidence: 1,
    manuallyConfirmed: true,
    sortOrder: 0
  }];

  // T5: Score calculation with high scores -> PASS
  const passModelResult: RawModelConsistencyResult = {
    schemaVersion: "1.0",
    screenRole: "PRODUCT_HERO",
    summary: "Perfect match",
    dimensions: [
      { dimension: "silhouette", applicable: true, rawScore: 95, confidence: 0.9, evidence: [], violations: [] },
      { dimension: "module_structure", applicable: true, rawScore: 92, confidence: 0.9, evidence: [], violations: [] },
      { dimension: "armrest", applicable: true, rawScore: 95, confidence: 0.9, evidence: [], violations: [] },
      { dimension: "backrest_headrest", applicable: true, rawScore: 94, confidence: 0.9, evidence: [], violations: [] },
      { dimension: "seat_leg", applicable: true, rawScore: 90, confidence: 0.9, evidence: [], violations: [] },
      { dimension: "material_color", applicable: true, rawScore: 96, confidence: 0.9, evidence: [], violations: [] },
      { dimension: "decoration_function", applicable: true, rawScore: 92, confidence: 0.9, evidence: [], violations: [] },
      { dimension: "accessories", applicable: true, rawScore: 90, confidence: 0.9, evidence: [], violations: [] }
    ],
    globalViolations: [],
    modelConfidence: 0.92
  };

  const calculatedPass = calculateConsistencyScore(passModelResult, testPolicy, dummyFeatures, "PRODUCT_HERO");
  assert(calculatedPass.decision === 'PASS', 'T5: High score yields PASS decision');
  assert(calculatedPass.totalScore >= 90, 'T6: Total score >= 90');

  // T7: Hard Violation forces FAIL decision regardless of high scores
  const hardFailModelResult: RawModelConsistencyResult = {
    ...passModelResult,
    globalViolations: [{
      code: "ARMREST_DRIFT",
      severity: "hard",
      title: "Hard Armrest Structural Drift",
      description: "Armrest shape drastically changed from square to cylinder",
      repairable: true
    }]
  };

  const calculatedHardFail = calculateConsistencyScore(hardFailModelResult, testPolicy, dummyFeatures, "PRODUCT_HERO");
  assert(calculatedHardFail.decision === 'FAIL', 'T7: Hard Violation forces FAIL decision');
  assert(calculatedHardFail.repairDirective !== null, 'T8: Repair directive generated on FAIL');

  // T9: MATERIAL_ONLY sofa missing is exempted from hard violation
  const matOnlyModelResult: RawModelConsistencyResult = {
    ...passModelResult,
    screenRole: "MATERIAL_ONLY",
    globalViolations: [{
      code: "MISSING_PRODUCT",
      severity: "hard",
      title: "No sofa body in macro view",
      description: "Macro texture view does not show full sofa",
      repairable: false
    }]
  };

  const calculatedMatOnly = calculateConsistencyScore(matOnlyModelResult, testPolicy, dummyFeatures, "MATERIAL_ONLY");
  assert(calculatedMatOnly.decision === 'PASS', 'T9: MATERIAL_ONLY macro texture exempt from sofa body requirement');

  // T10: Full Service Evaluation Execution
  const serviceReport = await evaluateProductConsistency({
    workspaceId: 'ws_test_001',
    canvasId: 'cv_test_001',
    screenId: 'screen-01',
    screenRole: 'PRODUCT_HERO',
    productDnaVersionId: 'dna-v001',
    consistencyPolicyId: 'default-policy-v1',
    referenceAssetVersionIds: ['ref-001'],
    candidateAssetVersionId: 'cand-001',
    idempotencyKey: 'idemp_service_eval_001',
    requestedBy: 'user_test'
  });

  assert(serviceReport.status === 'completed', 'T10: Evaluate product consistency service completes report');
  assert(serviceReport.reportId.startsWith('rep_'), 'T11: Report ID properly generated');
  assert(serviceReport.idempotencyKey === 'idemp_service_eval_001', 'T12: Idempotency key preserved');

  console.log(`\n=== Verification Complete: ${passCount} PASSED, ${failCount} FAILED ===`);
  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Verification script crashed:', err);
  process.exit(1);
});
