// src/features/space-studio/components/modals/ClearRecordsModal.tsx
import React, { useState } from 'react';
import {
  RotateCcw,
  Sparkles,
  Trash2,
  Package,
  Layers,
  Camera,
  ShieldCheck,
  AlertTriangle,
  X,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

export interface ClearRecordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmClear: (keepProducts: boolean) => void;
  summary: {
    productName?: string;
    productsCount: number;
    generatedShotsCount: number;
    totalShotsCount: number;
    totalRevisionsCount: number;
    hasMaster: boolean;
  };
  theme?: 'dark' | 'light';
}

export const ClearRecordsModal: React.FC<ClearRecordsModalProps> = ({
  isOpen,
  onClose,
  onConfirmClear,
  summary,
  theme = 'light'
}) => {
  const [selectedOption, setSelectedOption] = useState<'keep_products' | 'clear_all'>('keep_products');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const isLight = theme === 'light';

  const handleExecute = (option: 'keep_products' | 'clear_all') => {
    setIsSubmitting(true);
    try {
      onConfirmClear(option === 'keep_products');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`relative w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden transition-all duration-200 ${
          isLight
            ? 'bg-white border-stone-200 text-stone-800'
            : 'bg-[#181920] border-white/10 text-stone-100'
        }`}
      >
        {/* Header */}
        <div
          className={`px-6 py-5 border-b flex items-start justify-between ${
            isLight ? 'border-stone-200 bg-stone-50/70' : 'border-white/10 bg-white/5'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-xs shrink-0 ${
                isLight ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>清除页面生成画面结果</span>
              </h2>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-stone-500' : 'text-neutral-400'}`}>
                清空当前页面上驻留的全部镜头出图与渲染画面，方便使用者开启全新的作业
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              isLight
                ? 'border-stone-200 text-stone-400 hover:text-stone-700 hover:bg-stone-100'
                : 'border-white/10 text-neutral-400 hover:text-white hover:bg-white/10'
            }`}
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Diagnostic Snapshot Bar */}
        <div className="px-6 pt-5 pb-2">
          <div
            className={`p-3.5 rounded-xl border text-xs grid grid-cols-2 sm:grid-cols-4 gap-3 ${
              isLight ? 'bg-[#FBF9F5] border-stone-200/90' : 'bg-black/30 border-white/5'
            }`}
          >
            <div className="flex flex-col">
              <span className={`text-[11px] ${isLight ? 'text-stone-500' : 'text-neutral-400'}`}>
                当前核心产品
              </span>
              <span className="font-bold truncate mt-0.5" title={summary.productName || '未命名产品'}>
                {summary.productName || '功能沙发'}
              </span>
            </div>

            <div className="flex flex-col">
              <span className={`text-[11px] ${isLight ? 'text-stone-500' : 'text-neutral-400'}`}>
                镜头出图进度
              </span>
              <span className="font-bold mt-0.5 font-mono">
                {summary.generatedShotsCount} / {summary.totalShotsCount} 镜头
              </span>
            </div>

            <div className="flex flex-col">
              <span className={`text-[11px] ${isLight ? 'text-stone-500' : 'text-neutral-400'}`}>
                累计历史版本
              </span>
              <span className="font-bold mt-0.5 font-mono text-amber-600">
                {summary.totalRevisionsCount} 个出图版本
              </span>
            </div>

            <div className="flex flex-col">
              <span className={`text-[11px] ${isLight ? 'text-stone-500' : 'text-neutral-400'}`}>
                已载入产品素材
              </span>
              <span className="font-bold mt-0.5 font-mono">
                {summary.productsCount} 种产品资产
              </span>
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="px-6 py-4 space-y-3">
          <p className={`text-xs font-semibold ${isLight ? 'text-stone-600' : 'text-neutral-300'}`}>
            请选择清除模式：
          </p>

          {/* Option 1: Keep Products (Recommended) */}
          <div
            onClick={() => setSelectedOption('keep_products')}
            className={`p-4 rounded-xl border-2 transition cursor-pointer relative ${
              selectedOption === 'keep_products'
                ? isLight
                  ? 'border-amber-500 bg-amber-50/50 shadow-xs'
                  : 'border-amber-500 bg-amber-500/10 shadow-xs'
                : isLight
                ? 'border-stone-200 hover:border-stone-300 hover:bg-stone-50/50'
                : 'border-white/10 hover:border-white/20 hover:bg-white/5'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    isLight ? 'bg-amber-100 text-amber-800' : 'bg-amber-500/20 text-amber-400'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">清空全部生成画面结果（保留产品素材）</span>
                    <span
                      className={`text-[10px] px-2 py-0.2 rounded-full font-bold ${
                        isLight ? 'bg-amber-200/80 text-amber-900' : 'bg-amber-400/20 text-amber-300'
                      }`}
                    >
                      推荐 · 重新出图
                    </span>
                  </div>
                  <p className={`text-xs mt-1 leading-relaxed ${isLight ? 'text-stone-600' : 'text-neutral-300'}`}>
                    清空 A00 母版及全部 A01~A09 镜头在页面上渲染出的<b>生成图像、历史版本与 4 方案候选池</b>，让页面完全恢复为干净的未出图状态。您已上传的沙发切片、色彩与材质参数将<b>完整保留</b>，方便立即开启全新一组拍摄。
                  </p>
                </div>
              </div>
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition ${
                  selectedOption === 'keep_products'
                    ? 'border-amber-500 bg-amber-500 text-white'
                    : isLight
                    ? 'border-stone-300'
                    : 'border-white/20'
                }`}
              >
                {selectedOption === 'keep_products' && <CheckCircle2 className="w-3.5 h-3.5" />}
              </div>
            </div>
          </div>

          {/* Option 2: Full Purge */}
          <div
            onClick={() => setSelectedOption('clear_all')}
            className={`p-4 rounded-xl border-2 transition cursor-pointer relative ${
              selectedOption === 'clear_all'
                ? isLight
                  ? 'border-rose-500 bg-rose-50/50 shadow-xs'
                  : 'border-rose-500 bg-rose-950/20 shadow-xs'
                : isLight
                ? 'border-stone-200 hover:border-stone-300 hover:bg-stone-50/50'
                : 'border-white/10 hover:border-white/20 hover:bg-white/5'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    isLight ? 'bg-rose-100 text-rose-800' : 'bg-rose-950/60 text-rose-400'
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">彻底清空（清空画面 + 移除产品素材）</span>
                    <span
                      className={`text-[10px] px-2 py-0.2 rounded-full font-bold ${
                        isLight ? 'bg-rose-100 text-rose-800' : 'bg-rose-900/40 text-rose-300'
                      }`}
                    >
                      全新工程
                    </span>
                  </div>
                  <p className={`text-xs mt-1 leading-relaxed ${isLight ? 'text-stone-600' : 'text-neutral-300'}`}>
                    清空页面全部镜头生成画面结果，并<b>移除已上传的产品素材</b>（恢复为系统初始标准模版），彻底重置为崭新未作业状态，适合为完全不同的一款全新家具开展作业。
                  </p>
                </div>
              </div>
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition ${
                  selectedOption === 'clear_all'
                    ? 'border-rose-500 bg-rose-500 text-white'
                    : isLight
                    ? 'border-stone-300'
                    : 'border-white/20'
                }`}
              >
                {selectedOption === 'clear_all' && <CheckCircle2 className="w-3.5 h-3.5" />}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`px-6 py-4 border-t flex items-center justify-between gap-3 ${
            isLight ? 'border-stone-200 bg-stone-50/50' : 'border-white/10 bg-white/5'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs text-stone-500">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>执行后页面将即刻更新，历史版本可通过存储中心找回</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer disabled:opacity-50 ${
                isLight
                  ? 'border-stone-200 hover:bg-stone-100 text-stone-700'
                  : 'border-white/10 hover:bg-white/10 text-neutral-300'
              }`}
            >
              取消
            </button>

            <button
              onClick={() => handleExecute(selectedOption)}
              disabled={isSubmitting}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50 ${
                selectedOption === 'keep_products'
                  ? 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white shadow-amber-950/20'
                  : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-950/20'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>正在清理...</span>
                </>
              ) : selectedOption === 'keep_products' ? (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>确认清空生成画面 (保留产品)</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>确认彻底清空 (画面+素材)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
