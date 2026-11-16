import crypto from 'crypto';
import { supabaseAdmin } from '../../src/lib/supabase';
import { createServerGenAI } from '../utils/aiClient';
import {
  EvaluateProductConsistencyInput,
  ProductConsistencyReport,
  RawModelConsistencyResultSchema,
  RawModelConsistencyResult
} from '../../src/types/consistencySchema';
import { runConsistencyPreflight } from './consistencyPreflightService';
import { buildConsistencyEvaluationPrompt, CONSISTENCY_PROMPT_VERSION } from './consistencyPromptService';
import { calculateConsistencyScore } from './consistencyScoringService';

// In-memory cache for reports to ensure fallback dual-write durability
const memoryReportStore = new Map<string, ProductConsistencyReport>();

/** 送给视觉模型的图：参考图（真实产品原图）+ 候选图（待评估的生成图），已压缩为 JPEG base64 */
export interface ConsistencyImages {
  candidate?: { mimeType: string; data: string };
  references: { mimeType: string; data: string }[];
}

// 实测 3.7 带图请求常超时 / 断连，3.8、3.6 能稳定返回，所以 3.7 排最后
const CONSISTENCY_VISION_MODELS = ['gemini-3.6-flash'];

export async function evaluateProductConsistency(
  input: EvaluateProductConsistencyInput,
  images?: ConsistencyImages
): Promise<ProductConsistencyReport> {
  const startTime = Date.now();
  const reportVersion = 1;

  // 1. Calculate idempotency input hash
  const inputHashStr = [
    input.productDnaVersionId,
    input.candidateAssetVersionId,
    input.referenceAssetVersionIds.join(','),
    input.screenRole,
    input.consistencyPolicyId,
    CONSISTENCY_PROMPT_VERSION
  ].join('::');

  const inputHash = crypto.createHash('sha256').update(inputHashStr).digest('hex');

  // Check existing completed report with same idempotencyKey
  if (memoryReportStore.has(input.idempotencyKey)) {
    return memoryReportStore.get(input.idempotencyKey)!;
  }

  // 2. Run Preflight
  const preflight = await runConsistencyPreflight(input);
  if (preflight.ok === false) {
    const failedReport: ProductConsistencyReport = {
      schemaVersion: "1.0",
      reportId: `rep_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      reportVersion,
      workspaceId: input.workspaceId,
      screenId: input.screenId,
      screenRole: input.screenRole,
      productDnaVersionId: input.productDnaVersionId,
      candidateAssetVersionId: input.candidateAssetVersionId,
      consistencyPolicyId: input.consistencyPolicyId,
      status: "failed",
      decision: null,
      totalScore: null,
      confidence: null,
      dimensionScores: [],
      hardViolations: [],
      warnings: [{
        code: preflight.errorCode,
        severity: "hard",
        title: "Preflight Check Failed",
        description: preflight.message,
        repairable: false
      }],
      repairDirective: null,
      provider: null,
      model: null,
      requestId: null,
      latencyMs: Date.now() - startTime,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };

    memoryReportStore.set(input.idempotencyKey, failedReport);
    return failedReport;
  }

  const { registry, policy, applicableFeatures } = preflight;

  // 4. 没有图就不评估：模型看不到图只能凭文字描述编分数，宁可明确失败
  if (!images?.candidate || !images.references?.length) {
    const missing = [!images?.candidate ? '待评估的生成图' : '', !images?.references?.length ? '参考的产品原图' : ''].filter(Boolean).join('、');
    const failedReport: ProductConsistencyReport = {
      schemaVersion: "1.0",
      reportId: `rep_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      reportVersion,
      workspaceId: input.workspaceId,
      screenId: input.screenId,
      screenRole: input.screenRole,
      productDnaVersionId: input.productDnaVersionId,
      candidateAssetVersionId: input.candidateAssetVersionId,
      consistencyPolicyId: input.consistencyPolicyId,
      status: "failed",
      decision: null,
      totalScore: null,
      confidence: null,
      dimensionScores: [],
      hardViolations: [],
      warnings: [{
        code: "IMAGES_MISSING",
        severity: "hard",
        title: "缺少对比图片",
        description: `没有拿到${missing}，无法对比，已拒绝给出分数。请确认画布上有产品原图，且这张图已保存成功后重试。`,
        repairable: false
      }],
      repairDirective: null,
      provider: null,
      model: null,
      requestId: null,
      latencyMs: Date.now() - startTime,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };
    memoryReportStore.set(input.idempotencyKey, failedReport);
    return failedReport;
  }

  // 5. Prompt + 视觉模型（参考图在前、候选图在后，与提示词里的“第一张/第二张”对应）
  const { systemInstruction, userPrompt } = buildConsistencyEvaluationPrompt(input.screenRole, applicableFeatures);
  const parts: any[] = [
    { text: '【参考图片】（真实产品原图）：' },
    ...images.references.map(r => ({ inlineData: { mimeType: r.mimeType, data: r.data } })),
    { text: '【待评估候选图片】（AI 生成图）：' },
    { inlineData: { mimeType: images.candidate.mimeType, data: images.candidate.data } },
    { text: userPrompt }
  ];

  let rawModelResult: RawModelConsistencyResult | null = null;
  let providerName = "gemini";
  let modelName = CONSISTENCY_VISION_MODELS[0];
  let requestId = `req_${Date.now()}`;
  let modelAttempts = 1;
  let modelError: string | null = null;

  try {
    const { ai, config, isValidKey } = await createServerGenAI(input.requestedBy);
    if (config?.provider) providerName = config.provider;

    if (ai && isValidKey) {
      // 单个模型 45 秒：网关偶尔挂住，别让一次评估等几分钟
      const timeoutMs = process.env.FAST_TIMEOUT === 'true' ? 100 : 45000;
      for (const model of CONSISTENCY_VISION_MODELS) {
        try {
          modelName = model;
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`AI Gateway 请求超时 (${timeoutMs}ms)`)), timeoutMs)
          );
          const response: any = await Promise.race([
            ai.models.generateContent({
              model,
              contents: [{ role: 'user', parts }],
              config: { systemInstruction, responseMimeType: 'application/json', temperature: 0.1 }
            }),
            timeoutPromise
          ]);

          if (!response.text) throw new Error('模型未返回文本内容');
          let cleanText = response.text.trim();
          if (cleanText.startsWith('```')) {
            cleanText = cleanText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
          }
          const parsed = JSON.parse(cleanText);
          // 模型常把置信度写成 0–100 的百分数（如 72），而 schema 要 0–1：先归一，不改变它给的实际数值含义
          const toUnit = (v: unknown) => (typeof v === 'number' && v > 1 && v <= 100 ? v / 100 : v);
          if (Array.isArray(parsed?.dimensions)) {
            for (const d of parsed.dimensions) if (d && typeof d === 'object') d.confidence = toUnit(d.confidence);
          }
          if (parsed && typeof parsed === 'object') parsed.modelConfidence = toUnit(parsed.modelConfidence);
          const validation = RawModelConsistencyResultSchema.safeParse(parsed);
          if (validation.success) {
            rawModelResult = validation.data;
          } else {
            // 只修结构，不补分数：缺少数值分的维度直接丢掉，不能替模型编一个 90
            modelAttempts = 2;
            const dims = Array.isArray(parsed.dimensions)
              ? parsed.dimensions
                  .filter((d: any) => d && typeof d.rawScore === 'number' && Number.isFinite(d.rawScore))
                  .map((d: any) => ({
                    dimension: d.dimension || "silhouette",
                    applicable: Boolean(d.applicable),
                    rawScore: Math.min(100, Math.max(0, d.rawScore)),
                    confidence: typeof d.confidence === 'number' ? d.confidence : 0.5,
                    evidence: d.evidence || [],
                    violations: d.violations || []
                  }))
              : [];
            const repaired = dims.length
              ? RawModelConsistencyResultSchema.safeParse({
                  schemaVersion: "1.0",
                  screenRole: input.screenRole,
                  summary: parsed.summary || "模型输出不规范，已按可用部分整理",
                  dimensions: dims,
                  globalViolations: parsed.globalViolations || [],
                  modelConfidence: typeof parsed.modelConfidence === 'number' ? parsed.modelConfidence : 0.5
                })
              : null;
            if (repaired?.success) rawModelResult = repaired.data;
            else {
              console.warn(
                `[ConsistencyService] ${model} 输出不符合结构：`,
                validation.error.issues.slice(0, 4).map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
                '| 原文：',
                cleanText.slice(0, 500)
              );
              throw new Error('模型响应解析失败');
            }
          }
          modelError = null;
          break;
        } catch (e: any) {
          modelError = e?.message || 'AI Gateway 调用超时或网络异常';
          console.warn(`[ConsistencyService] ${model} 评估失败:`, modelError);
        }
      }
    } else {
      modelError = "AI Gateway Key 无效或未配置";
    }
  } catch (e: any) {
    modelError = e?.message || "AI Client 初始化失败";
    console.warn('[ConsistencyService] AI client creation exception:', modelError);
  }

  // Model Timeout / Error Handling: Strict MODEL_UNAVAILABLE report (NO fake PASS, NO false scores)
  if (!rawModelResult) {
    const failedReport: ProductConsistencyReport = {
      schemaVersion: "1.0",
      reportId: `rep_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      reportVersion,
      workspaceId: input.workspaceId,
      screenId: input.screenId,
      screenRole: input.screenRole,
      productDnaVersionId: input.productDnaVersionId,
      candidateAssetVersionId: input.candidateAssetVersionId,
      consistencyPolicyId: input.consistencyPolicyId,
      status: "failed",
      decision: null,
      totalScore: null,
      confidence: null,
      dimensionScores: [],
      hardViolations: [],
      warnings: [{
        code: "MODEL_UNAVAILABLE",
        severity: "hard",
        title: "模型服务不可用",
        description: `模型超时或调用失败 (${modelError || 'MODEL_UNAVAILABLE'})，导出一致性已被阻断。需要人工确认方可放行。`,
        repairable: false
      }],
      repairDirective: null,
      provider: providerName,
      model: modelName,
      requestId,
      latencyMs: Date.now() - startTime,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };

    memoryReportStore.set(input.idempotencyKey, failedReport);
    return failedReport;
  }

  // 5. Server Weighted Score & Gate Determination
  const calculated = calculateConsistencyScore(rawModelResult, policy, applicableFeatures, input.screenRole);

  const reportId = `rep_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const completedAt = new Date().toISOString();

  const report: ProductConsistencyReport = {
    schemaVersion: "1.0",
    reportId,
    reportVersion,
    workspaceId: input.workspaceId,
    screenId: input.screenId,
    screenRole: input.screenRole,
    productDnaVersionId: input.productDnaVersionId,
    candidateAssetVersionId: input.candidateAssetVersionId,
    consistencyPolicyId: input.consistencyPolicyId,
    status: "completed",
    decision: calculated.decision,
    totalScore: calculated.totalScore,
    confidence: calculated.confidence,
    dimensionScores: calculated.dimensionScores,
    hardViolations: calculated.hardViolations,
    warnings: calculated.warnings,
    repairDirective: calculated.repairDirective,
    provider: providerName,
    model: modelName,
    requestId,
    latencyMs: Date.now() - startTime,
    inputTokens: 1250,
    outputTokens: 480,
    estimatedCost: 0.002,
    idempotencyKey: input.idempotencyKey,
    createdAt: new Date().toISOString(),
    completedAt
  };

  // Cache in memory
  memoryReportStore.set(input.idempotencyKey, report);

  // Persist into Supabase database (ignore if fails in offline/mock env)
  try {
    await supabaseAdmin.from('product_consistency_reports').insert({
      id: report.reportId,
      workspace_id: report.workspaceId,
      screen_id: report.screenId,
      screen_role: report.screenRole,
      product_dna_version_id: report.productDnaVersionId,
      candidate_asset_version_id: report.candidateAssetVersionId,
      consistency_policy_id: report.consistencyPolicyId,
      schema_version: report.schemaVersion,
      report_version: report.reportVersion,
      status: report.status,
      decision: report.decision,
      total_score: report.totalScore,
      confidence: report.confidence,
      dimension_scores: report.dimensionScores,
      hard_violations: report.hardViolations,
      warnings: report.warnings,
      repair_directive: report.repairDirective,
      provider: report.provider,
      model: report.model,
      request_id: report.requestId,
      latency_ms: report.latencyMs,
      input_tokens: report.inputTokens,
      output_tokens: report.outputTokens,
      estimated_cost: report.estimatedCost,
      idempotency_key: report.idempotencyKey,
      created_at: report.createdAt,
      completed_at: report.completedAt
    });

    // Save references
    for (let i = 0; i < input.referenceAssetVersionIds.length; i++) {
      await supabaseAdmin.from('product_consistency_report_references').insert({
        report_id: report.reportId,
        asset_version_id: input.referenceAssetVersionIds[i],
        reference_role: "master_reference",
        sort_order: i
      }).maybeSingle();
    }
  } catch (e) {
    console.warn('[ConsistencyService] Supabase insert non-fatal warning:', e);
  }

  return report;
}

export function getCachedReport(idempotencyKey: string): ProductConsistencyReport | null {
  return memoryReportStore.get(idempotencyKey) || null;
}
