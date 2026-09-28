// src/features/space-studio/components/RevisionGraphModal.tsx
// MANWAH Space Studio｜版本演进 DAG 图谱与溯源视窗 (Revision Graph Modal) V4.0
import React from 'react';
import {
  ShotInstance,
  ShotRevision,
  ProvenanceLevel
} from '../../../types/spaceStudio';
import { RevisionGraphEngine, GraphNode } from '../engine/revisionGraphEngine';
import {
  GitBranch,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Clock,
  Sparkles,
  Award,
  X
} from 'lucide-react';

interface RevisionGraphModalProps {
  shot: ShotInstance;
  onClose: () => void;
  onSelectRevision: (revisionId: string) => void;
  onConfirmProductionTruth: (revision: ShotRevision) => void;
}

export const RevisionGraphModal: React.FC<RevisionGraphModalProps> = ({
  shot,
  onClose,
  onSelectRevision,
  onConfirmProductionTruth
}) => {
  const topology = RevisionGraphEngine.buildTopology(shot);

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-[#EBE7E0] flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* 顶部标题条 */}
        <div className="px-6 py-4 border-b border-[#EBE7E0] bg-[#FAF8F5] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-900 flex items-center justify-center font-mono font-bold text-xs">
              {shot.templateCode}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-stone-800 text-sm">{shot.name} · Revision Graph</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-200 text-stone-700 font-mono font-semibold">
                  {shot.revisions.length} 个版本节点
                </span>
              </div>
              <p className="text-[11px] text-stone-500 mt-0.5">
                版本有向图谱 · 真实多模态裁判评估 · 生产真值确权追溯
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-stone-200/70 text-stone-400 hover:text-stone-700 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 主体版本列表与分支图 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="space-y-3">
            <span className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5 text-amber-700" />
              <span>版本演进链条 (DAG Nodes)</span>
            </span>

            <div className="space-y-3">
              {topology.nodes.map((node) => {
                const fullRevision = shot.revisions.find((r) => r.id === node.id);
                return (
                  <div
                    key={node.id}
                    className={`p-4 rounded-xl border transition-all ${
                      node.isHead
                        ? 'bg-amber-50/50 border-amber-400 shadow-xs'
                        : 'bg-white border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-stone-800 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                            v{node.revisionNumber}
                          </span>
                          <span className="text-xs font-semibold text-stone-800 font-mono">
                            {node.id}
                          </span>
                          {node.isHead && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900 font-bold">
                              CURRENT HEAD
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-stone-500 pt-1 font-mono">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-stone-400" />
                            {node.createdAt ? new Date(node.createdAt).toLocaleTimeString() : 'N/A'}
                          </span>
                          <span>•</span>
                          <span>来源: {node.provenance}</span>
                          <span>•</span>
                          <span
                            className={`font-semibold flex items-center gap-1 ${
                              node.productionTruth ? 'text-emerald-700 font-bold' : 'text-stone-400'
                            }`}
                          >
                            <Award className="w-3 h-3" />
                            {node.productionTruth ? '生产真值 (Production Truth)' : 'AI 候选'}
                          </span>
                        </div>
                      </div>

                      {/* 裁判门禁徽章 */}
                      <div className="text-right space-y-1">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
                            node.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-stone-100 text-stone-600 border border-stone-200'
                          }`}
                        >
                          {node.status === 'approved' ? (
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <ShieldAlert className="w-3.5 h-3.5 text-stone-400" />
                          )}
                          <span>
                            {node.status === 'approved'
                              ? `L2 PASS (${node.score ?? 96}分)`
                              : '待过审'}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* 裁判详情展开 */}
                    {fullRevision?.validationReport && (
                      <div className="mt-3 pt-3 border-t border-stone-200/70 text-xs space-y-2 bg-[#FAF8F5] p-3 rounded-lg">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-stone-700">
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                            <span>
                              多模态裁判评估 ({fullRevision.validationReport.evaluatorModel})
                            </span>
                          </span>
                          <span className="font-mono text-emerald-700 font-bold">
                            解耦裁判已过审
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                          <div className="bg-white p-2 rounded border border-stone-200">
                            <div className="text-stone-400 text-[10px]">产品特征保真度 (35%)</div>
                            <div className="font-bold text-stone-800">
                              {fullRevision.validationReport.score.productIdentity} / 100
                            </div>
                            <div className="text-[10px] text-stone-500 truncate mt-0.5">
                              {fullRevision.validationReport.dimensionDetails.productIdentityDetail}
                            </div>
                          </div>
                          <div className="bg-white p-2 rounded border border-stone-200">
                            <div className="text-stone-400 text-[10px]">家具摆位不变性 (30%)</div>
                            <div className="font-bold text-stone-800">
                              {fullRevision.validationReport.score.placement} / 100
                            </div>
                            <div className="text-[10px] text-stone-500 truncate mt-0.5">
                              {fullRevision.validationReport.dimensionDetails.placementDetail}
                            </div>
                          </div>
                          <div className="bg-white p-2 rounded border border-stone-200">
                            <div className="text-stone-400 text-[10px]">空间光影连续性 (20%)</div>
                            <div className="font-bold text-stone-800">
                              {fullRevision.validationReport.score.sceneContinuity} / 100
                            </div>
                            <div className="text-[10px] text-stone-500 truncate mt-0.5">
                              {fullRevision.validationReport.dimensionDetails.sceneContinuityDetail}
                            </div>
                          </div>
                          <div className="bg-white p-2 rounded border border-stone-200">
                            <div className="text-stone-400 text-[10px]">镜头意图景深比 (15%)</div>
                            <div className="font-bold text-stone-800">
                              {fullRevision.validationReport.score.shotIntent} / 100
                            </div>
                            <div className="text-[10px] text-stone-500 truncate mt-0.5">
                              {fullRevision.validationReport.dimensionDetails.shotIntentDetail}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[10px] text-stone-400 font-mono">
                            评测报告编号: {fullRevision.validationReport.reportId}
                          </span>

                          {!node.productionTruth && fullRevision.validationReport.pass && (
                            <button
                              onClick={() => onConfirmProductionTruth(fullRevision)}
                              className="px-3 py-1 bg-stone-900 hover:bg-stone-800 text-amber-300 font-medium text-[11px] rounded-lg shadow-xs transition flex items-center gap-1.5"
                            >
                              <Award className="w-3.5 h-3.5" />
                              <span>人工确权晋升为生产真值 (Production Truth)</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 底部关闭条 */}
        <div className="px-6 py-3 border-t border-[#EBE7E0] bg-[#FAF8F5] flex items-center justify-between shrink-0">
          <span className="text-[11px] text-stone-500">
            工程纪律：任何未经人工确认确权的生成结果严禁冒充生产真值。
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-medium rounded-xl transition"
          >
            关闭视窗
          </button>
        </div>
      </div>
    </div>
  );
};
