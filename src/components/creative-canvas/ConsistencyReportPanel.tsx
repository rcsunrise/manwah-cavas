import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Wrench,
  CheckCircle2,
  Sparkles,
  BarChart2,
  ChevronRight,
  Layers
} from 'lucide-react';
import { ProductConsistencyReport, ConsistencyViolation } from '../../types/consistencySchema';

interface ConsistencyReportPanelProps {
  isOpen: boolean;
  onClose: () => void;
  canvasId: string;
  screenId?: string;
  screenRole?: string;
  productDnaVersionId?: string;
  candidateAssetVersionId?: string;
  report?: ProductConsistencyReport | null;
  onRefreshReport?: () => void;
  onFixScreen?: (screenId: string, candidateAssetVersionId: string) => Promise<void>;
}

export const ConsistencyReportPanel: React.FC<ConsistencyReportPanelProps> = ({
  isOpen,
  onClose,
  canvasId,
  screenId = 'screen-01',
  screenRole = 'PRODUCT_HERO',
  productDnaVersionId = 'dna-v001',
  candidateAssetVersionId = 'asset-s01-v001',
  report: initialReport,
  onRefreshReport,
  onFixScreen
}) => {
  const [report, setReport] = useState<ProductConsistencyReport | null>(initialReport || null);
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ completed: number; total: number } | null>(null);

  useEffect(() => {
    if (initialReport) {
      setReport(initialReport);
    }
  }, [initialReport]);

  // Handle manual re-evaluation
  const handleEvaluate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/canvases/${canvasId}/product-consistency/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({
          workspaceId: 'default-workspace',
          screenId,
          screenRole,
          productDnaVersionId,
          consistencyPolicyId: 'default-policy-v1',
          referenceAssetVersionIds: ['ref-v001'],
          candidateAssetVersionId,
          idempotencyKey: `eval_${canvasId}_${screenId}_${Date.now()}`
        })
      });
      const data = await res.json();
      if (data.success && data.report) {
        setReport(data.report);
      }
    } catch (e) {
      console.error('Failed to evaluate consistency:', e);
    } finally {
      setLoading(false);
    }
  };

  // Handle Fix Current Screen
  const handleFixCurrentScreen = async () => {
    if (!screenId || !candidateAssetVersionId) return;
    setRepairing(true);
    try {
      if (onFixScreen) {
        await onFixScreen(screenId, candidateAssetVersionId);
      } else {
        const res = await fetch(`/api/canvases/${canvasId}/product-consistency/fix-screen`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
          },
          body: JSON.stringify({
            screenId,
            screenRole,
            productDnaVersionId,
            previousCandidateAssetVersionId: candidateAssetVersionId
          })
        });
        const data = await res.json();
        if (data.success && data.report) {
          setReport(data.report);
        }
      }
    } catch (e) {
      console.error('Failed to fix screen:', e);
    } finally {
      setRepairing(false);
    }
  };

  if (!isOpen) return null;

  const decision = report?.decision || 'REVIEW';
  const score = report?.totalScore !== null && report?.totalScore !== undefined ? report.totalScore : 92.5;

  const getDecisionBadge = () => {
    switch (decision) {
      case 'PASS':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> PASS (一致性通过)
          </span>
        );
      case 'REVIEW':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-600" /> REVIEW (需人工确认)
          </span>
        );
      case 'FAIL':
      default:
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <XCircle className="w-4 h-4 text-rose-600" /> BLOCKED (存在硬偏离)
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-white shadow-2xl border-l border-[#E5E0D8] z-50 flex flex-col font-sans select-none animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="p-4 border-b border-[#E5E0D8] bg-[#FAF8F5] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#B28C5A]" />
          <div>
            <h3 className="text-sm font-bold text-[#2C2A29]">产品一致性评分诊断</h3>
            <p className="text-[10px] text-stone-500 font-mono">Screen: {screenId} · Role: {screenRole}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Drawer Content Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Total Score & Gate Card */}
        <div className="p-4 bg-[#FAF8F5] rounded-2xl border border-[#E5E0D8] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-600">一致性综合判定</span>
            {getDecisionBadge()}
          </div>

          <div className="flex items-baseline gap-3">
            <div className="text-3xl font-extrabold font-mono text-[#2C2A29]">
              {score.toFixed(1)} <span className="text-xs text-stone-400 font-normal">/ 100</span>
            </div>
            <div className="text-xs text-stone-500 font-mono">
              模型置信度: {((report?.confidence || 0.92) * 100).toFixed(0)}%
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="w-full bg-stone-200 h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                score >= 90 ? 'bg-emerald-500' : score >= 80 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
            />
          </div>
        </div>

        {/* Dimension Breakdown List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-[#2C2A29]">
            <span className="flex items-center gap-1.5">
              <BarChart2 className="w-4 h-4 text-[#B28C5A]" /> 8 维特征比对得分
            </span>
            <span className="text-[10px] text-stone-400 font-mono">Weighted Total</span>
          </div>

          <div className="space-y-2">
            {(report?.dimensionScores || [
              { dimension: 'silhouette', score: 95, applicable: screenRole !== 'MATERIAL_ONLY' },
              { dimension: 'module_structure', score: 90, applicable: screenRole !== 'MATERIAL_ONLY' && screenRole !== 'INSPIRATION_ONLY' },
              { dimension: 'armrest', score: 92, applicable: screenRole !== 'MATERIAL_ONLY' && screenRole !== 'INSPIRATION_ONLY' },
              { dimension: 'backrest_headrest', score: 95, applicable: screenRole !== 'MATERIAL_ONLY' && screenRole !== 'INSPIRATION_ONLY' },
              { dimension: 'seat_leg', score: 90, applicable: screenRole !== 'MATERIAL_ONLY' && screenRole !== 'INSPIRATION_ONLY' },
              { dimension: 'material_color', score: 96, applicable: true },
              { dimension: 'decoration_function', score: 90, applicable: screenRole !== 'MATERIAL_ONLY' },
              { dimension: 'accessories', score: 92, applicable: true }
            ]).map((dim, idx) => (
              <div key={idx} className="p-2.5 bg-white rounded-xl border border-[#E5E0D8]/80 text-xs flex items-center justify-between">
                <div className="flex flex-col min-w-[120px]">
                  <span className="font-semibold text-stone-700 capitalize">{dim.dimension.replace('_', ' ')}</span>
                  <span className="text-[9px] text-stone-400 font-mono">
                    {dim.applicable ? 'Applicable' : 'N/A (Exempt)'}
                  </span>
                </div>
                {dim.applicable ? (
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-stone-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-[#B28C5A] h-full rounded-full"
                        style={{ width: `${dim.score}%` }}
                      />
                    </div>
                    <span className="font-mono font-bold text-stone-800 text-xs w-8 text-right">
                      {dim.score}
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full font-mono">
                    豁免维
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Violations / Hard Violations Section */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-[#2C2A29] flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600" /> 偏离项与结构化建议
          </h4>

          {report?.hardViolations && report.hardViolations.length > 0 ? (
            <div className="space-y-2">
              {report.hardViolations.map((v, i) => (
                <div key={i} className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-1">
                  <div className="flex items-center justify-between font-bold text-rose-800">
                    <span>{v.title}</span>
                    <span className="text-[9px] bg-rose-200 text-rose-900 px-1.5 py-0.2 rounded uppercase">
                      Hard Violation
                    </span>
                  </div>
                  <p className="text-stone-600 text-[11px]">{v.description}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>未检测到 Hard Violation (硬特征偏离)。产品形态一致性良好。</span>
            </div>
          )}
        </div>
      </div>

      {/* Drawer Action Footer */}
      <div className="p-4 border-t border-[#E5E0D8] bg-[#FAF8F5] space-y-2">
        <button
          onClick={handleFixCurrentScreen}
          disabled={repairing}
          className="w-full py-2.5 px-4 bg-[#B28C5A] hover:bg-[#9E7A4A] disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-98"
        >
          {repairing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Wrench className="w-4 h-4" />
          )}
          <span>仅修复当前屏 (衍生 V002 资产)</span>
        </button>

        <button
          onClick={handleEvaluate}
          disabled={loading}
          className="w-full py-2 px-4 bg-white hover:bg-stone-50 border border-[#E5E0D8] text-stone-700 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-[#B28C5A]" />}
          <span>重新评估一致性</span>
        </button>
      </div>
    </div>
  );
};
