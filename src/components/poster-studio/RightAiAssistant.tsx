// src/components/poster-studio/RightAiAssistant.tsx
import React, { useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  Zap,
  CheckCircle,
  FileText,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Layout,
  Sliders,
  Maximize,
  HelpCircle
} from 'lucide-react';
import { PlanScreenItem } from '../../services/posterStudioService';
import { PosterCompositionSnapshot } from '../../types/posterTemplate';

interface RightAiAssistantProps {
  activeScreen: PlanScreenItem;
  activeComposition: PosterCompositionSnapshot;
  isGeneratingCurrent: boolean;
  isGeneratingAll: boolean;
  onGenerateCurrentScreen: () => void;
  onGenerateAllScreens: () => void;
  onAiRewriteCopy: () => void;
  onAutoLayout: () => void;
  onUpdatePlan: (updates: Partial<PlanScreenItem>) => void;
}

export const RightAiAssistant: React.FC<RightAiAssistantProps> = ({
  activeScreen,
  activeComposition,
  isGeneratingCurrent,
  isGeneratingAll,
  onGenerateCurrentScreen,
  onGenerateAllScreens,
  onAiRewriteCopy,
  onAutoLayout,
  onUpdatePlan
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="w-80 bg-stone-900 border-l border-stone-800 flex flex-col h-full select-none z-30">
      {/* Header */}
      <div className="px-4 py-3 border-b border-stone-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
          <Sparkles className="w-4 h-4" />
          <span>AI 企划与智能调控</span>
        </div>
        <span className="text-[10px] text-stone-500 font-mono">
          0{activeScreen.screenIndex}/09
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* High Frequency Actions Group */}
        <div className="space-y-2">
          <button
            onClick={onGenerateCurrentScreen}
            disabled={isGeneratingCurrent || isGeneratingAll}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-amber-950/40 transition active:scale-98"
          >
            {isGeneratingCurrent ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            <span>重新生成当前屏画面</span>
          </button>

          <button
            onClick={onGenerateAllScreens}
            disabled={isGeneratingCurrent || isGeneratingAll}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-stone-200 font-semibold rounded-xl border border-stone-700 transition"
          >
            {isGeneratingAll ? (
              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
            ) : (
              <Sparkles className="w-4 h-4 text-amber-400" />
            )}
            <span>一键生成全部画面</span>
          </button>
        </div>

        {/* AI Fine Tuning Actions */}
        <div className="pt-2 border-t border-stone-800/80 space-y-2">
          <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-1">
            智能优化
          </div>

          <button
            onClick={onAiRewriteCopy}
            className="w-full flex items-center justify-between p-2.5 bg-stone-950 hover:bg-stone-800 rounded-lg border border-stone-800 text-stone-300 transition text-left"
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <div>
                <div className="font-semibold text-stone-200">AI 润色文案与卖点</div>
                <div className="text-[10px] text-stone-500">依据沙发特点重构标题与卖点</div>
              </div>
            </div>
          </button>

          <button
            onClick={onAutoLayout}
            className="w-full flex items-center justify-between p-2.5 bg-stone-950 hover:bg-stone-800 rounded-lg border border-stone-800 text-stone-300 transition text-left"
          >
            <div className="flex items-center gap-2">
              <Layout className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="font-semibold text-stone-200">AI 智能版式探索</div>
                <div className="text-[10px] text-stone-500">一键探索更多先锋版式与黄金比例</div>
              </div>
            </div>
          </button>
        </div>

        {/* Safe Area & Consistency Guarantee */}
        <div className="p-3 bg-stone-950/80 rounded-xl border border-stone-800 space-y-2">
          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
            <ShieldCheck className="w-4 h-4" />
            <span>产品比例与一致性护航</span>
          </div>
          <div className="text-[11px] text-stone-400 leading-relaxed space-y-1">
            <p>✓ 锁定真实产品宽高比 (无拉伸形变)</p>
            <p>✓ 严格无文字纯净底图 (排版层单独渲染)</p>
            <p>✓ 当前屏留白导向：<span className="text-amber-300">{activeScreen.safeAreaFocus}</span></p>
          </div>
        </div>

        {/* Collapsible Advanced Prompt Settings */}
        <div className="pt-2 border-t border-stone-800/80">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full text-stone-400 hover:text-stone-200 py-1"
          >
            <span className="font-semibold text-[11px]">高级出图提示词微调</span>
            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-3 animate-in fade-in duration-150">
              <div>
                <label className="block text-stone-400 mb-1 font-semibold">正向提示词 (Positive)</label>
                <textarea
                  value={activeScreen.prompt}
                  onChange={(e) => onUpdatePlan({ prompt: e.target.value })}
                  rows={4}
                  className="w-full bg-stone-950 border border-stone-700 rounded px-2 py-1.5 text-white font-mono text-[10px] outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-stone-400 mb-1 font-semibold">负向提示词 (Negative)</label>
                <textarea
                  value={activeScreen.negativePrompt}
                  onChange={(e) => onUpdatePlan({ negativePrompt: e.target.value })}
                  rows={3}
                  className="w-full bg-stone-950 border border-stone-700 rounded px-2 py-1.5 text-stone-400 font-mono text-[10px] outline-none"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
