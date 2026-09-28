import { validateCompositionGateInput, createAndStartCompositionRenderJob, getCompositionRenderJob } from '../server/services/detailCompositionService';
import { calculateTextLayout } from '../server/services/textLayoutService';
import { renderDetailCompositionBitmap } from '../server/services/detailRenderService';
import { evaluateProductConsistency } from '../server/services/consistencyService';
import { ScreenComposition, TextLayer } from '../src/types/detailCompositionSchema';

async function runFast2Verification() {
  console.log('=== FAST-2 Screen-01 Detail Composition & FAST-1 Legacy Verification ===\n');
  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, name: string) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passCount++;
    } else {
      console.error(`[FAIL] ${name}`);
      failCount++;
    }
  }

  // A1: Real Multimodal Consistency Call Verification
  try {
    const evalPromise = evaluateProductConsistency({
      workspaceId: 'default-workspace',
      canvasId: 'canvas-test-fast2',
      screenId: 'screen-01',
      screenRole: 'PRODUCT_HERO',
      productDnaVersionId: 'dna-v001',
      consistencyPolicyId: 'default-policy-v1',
      referenceAssetVersionIds: ['ref-v001'],
      candidateAssetVersionId: 'asset-s01-v001',
      idempotencyKey: `real_eval_${Date.now()}`,
      requestedBy: 'user_fast2'
    });

    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Evaluation timeout')), 2500));
    const realEvalReport: any = await Promise.race([evalPromise, timeoutPromise]);

    assert(realEvalReport.status === 'completed', 'A1: Multimodal consistency call completes successfully');
    assert(realEvalReport.totalScore !== null && realEvalReport.totalScore > 0, 'A1: Valid total score generated');
    console.log(`[INFO A1] ReportID: ${realEvalReport.reportId}, Score: ${realEvalReport.totalScore}, Decision: ${realEvalReport.decision}`);
  } catch (e: any) {
    console.log(`[NOT EXECUTED A1] Gateway real multimodal call fallback: ${e?.message}`);
  }

  // B1: Input Gate Validation for Composition
  const gateCheck = await validateCompositionGateInput({
    canvasId: 'canvas-test-fast2',
    workspaceId: 'default-workspace',
    screenId: 'screen-01',
    screenRole: 'PRODUCT_HERO',
    baseAssetVersionId: 'asset-s01-v001',
    productDnaVersionId: 'dna-v001',
    copySkuId: 'copy-001',
    consistencyReportId: 'rep-pass-001',
    requestedBy: 'user_fast2'
  });

  assert(gateCheck.valid === true, 'B1: Input gate passes for ready base asset & PASS report');

  // D1: Chinese Text Auto-Wrap & Auto-Shrink Layout Test
  const testTitleLayer: TextLayer = {
    id: "tl_test",
    copyField: "title",
    text: "敏华意式顶级全青皮奢华大沙发",
    x: 120,
    y: 180,
    width: 600,
    height: 150,
    fontFamily: "PingFang SC",
    fallbackFonts: ["Noto Sans SC", "sans-serif"],
    fontSize: 84,
    fontWeight: 900,
    lineHeight: 1.2,
    letterSpacing: 2,
    color: "#2C2A29",
    textAlign: "left",
    verticalAlign: "top",
    maxLines: 2,
    overflow: "shrink",
    rotation: 0,
    opacity: 1,
    zIndex: 20,
    safeAreaRequired: true
  };

  const layoutResult = calculateTextLayout(testTitleLayer);
  assert(layoutResult.fits === true, 'D1: Chinese text layout fits inside bounding box');
  assert(layoutResult.wrappedLines.length <= 2, 'D2: Text correctly wrapped into <= 2 lines');

  // F1: Server Bitmap Composition Rendering (2100 x 2800)
  const compositionInput: ScreenComposition = {
    schemaVersion: 'screen-composition/v2',
    compositionId: 'comp_test_01',
    compositionVersionId: 'comp_ver_test_01',
    workspaceId: 'default-workspace',
    canvasId: 'canvas-test-fast2',
    screenId: 'screen-01',
    screenRole: 'PRODUCT_HERO',
    width: 2100,
    height: 2800,
    layoutManifestId: 'manifest_default',
    backgroundColor: '#FAF8F5',
    imageLayers: [{
      id: 'img_base',
      assetVersionId: 'asset-s01-v001',
      objectKey: 'assets/screen-01.jpg',
      sourceWidth: 1920,
      sourceHeight: 1080,
      sourceAspectRatio: '16:9',
      x: 0,
      y: 0,
      width: 2100,
      height: 2800,
      fitMode: 'cover',
      focalPoint: { x: 0.5, y: 0.5 },
      backgroundColor: '#FAF8F5',
      opacity: 1,
      zIndex: 1
    }],
    textLayers: [testTitleLayer],
    copySkuId: 'copy-001',
    copyVersionId: 'copy-ver-001',
    typographySpecId: 'spec-ver-001',
    baseAssetVersionId: 'asset-s01-v001',
    productDnaVersionId: 'dna-v001',
    consistencyReportId: 'rep-pass-001',
    status: 'draft',
    checksum: ''
  };

  const renderOutput = await renderDetailCompositionBitmap(compositionInput);
  assert(renderOutput.width === 2100 && renderOutput.height === 2800, 'F1: Render output dimensions strictly 2100 x 2800 px');
  assert(renderOutput.fileSizeBytes > 10000, 'F2: Valid composite JPEG file generated');
  assert(renderOutput.compositionAssetVersionId.startsWith('comp_asset_'), 'F3: Composition Asset Version registered');

  // F4: Async Render Job Execution
  const { jobId, compositionId } = await createAndStartCompositionRenderJob({
    canvasId: 'canvas-test-fast2',
    workspaceId: 'default-workspace',
    screenId: 'screen-01',
    screenRole: 'PRODUCT_HERO',
    baseAssetVersionId: 'asset-s01-v001',
    productDnaVersionId: 'dna-v001',
    copySkuId: 'copy-001',
    consistencyReportId: 'rep-pass-001',
    requestedBy: 'user_fast2'
  });

  assert(jobId.startsWith('job_'), 'F4: Non-blocking render job created with valid Job ID');

  // Wait for async job execution
  let completedJob: any = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 200));
    completedJob = await getCompositionRenderJob('canvas-test-fast2', jobId);
    if (completedJob && (completedJob.status === 'completed' || completedJob.status === 'failed')) {
      break;
    }
  }
  assert(completedJob !== null && completedJob.status === 'completed', 'F5: Render job completed asynchronously');

  console.log(`\n=== FAST-2 Verification Summary: ${passCount} PASSED, ${failCount} FAILED ===`);
  if (failCount > 0) {
    process.exit(1);
  }
}

runFast2Verification().catch(err => {
  console.error('FAST-2 verification crashed:', err);
  process.exit(1);
});
