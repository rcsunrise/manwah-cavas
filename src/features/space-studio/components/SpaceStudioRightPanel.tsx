// src/features/space-studio/components/SpaceStudioRightPanel.tsx
import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Sparkles,
  RefreshCw,
  Zap,
  CheckCircle,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Sliders,
  Camera,
  Layers,
  FileCode,
  Undo2,
  Ratio,
  Cpu,
  Settings2,
  SlidersHorizontal
} from 'lucide-react';
import {
  ShotInstance,
  SceneMaster,
  ImageAspectRatio,
  IMAGE_ASPECT_SPECS,
  CameraDNA,
  RenderComputeConfig,
  ComputeModelTier,
  RenderResolution,
  NamingPreset
} from '../../../types/spaceStudio';

interface SpaceStudioRightPanelProps {
  activeShot: ShotInstance;
  activeShotIndex: number;
  totalShots: number;
  sceneMaster: SceneMaster | null;
  aspectRatio: ImageAspectRatio;
  onChangeAspectRatio: (ratio: ImageAspectRatio) => void;

  computeConfig?: RenderComputeConfig;
  onChangeComputeConfig?: (updater: Partial<RenderComputeConfig>) => void;

  isGeneratingCurrent: boolean;
  isGeneratingAll: boolean;
  onGenerateCurrentShot: () => void;
  onGenerateAllShots: () => void;

  onOptimizeLightingAndPrompt: () => void;
  onUpdateCamera: (shotId: string, updates: Partial<CameraDNA>) => void;

  theme?: 'dark' | 'light';
}

const DEFAULT_COMPUTE_CONFIG: RenderComputeConfig = {
  model: 'gemini-3.1-flash-image',
  resolution: '2K',
  aspectRatio: '3:4',
  customAspectRatio: '',
  seed: undefined,
  namingPreset: 'detailed',
  customPrefix: ''
};

export const SpaceStudioRightPanel: React.FC<SpaceStudioRightPanelProps> = ({
  activeShot,
  activeShotIndex,
  totalShots,
  sceneMaster,
  aspectRatio,
  onChangeAspectRatio,
  computeConfig = DEFAULT_COMPUTE_CONFIG,
  onChangeComputeConfig,
  isGeneratingCurrent,
  isGeneratingAll,
  onGenerateCurrentShot,
  onGenerateAllShots,
  onOptimizeLightingAndPrompt,
  onUpdateCamera,
  theme = 'dark'
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isComputeCollapsed, setIsComputeCollapsed] = useState(false);

  const isLight = theme === 'light';

  const cfg = computeConfig || DEFAULT_COMPUTE_CONFIG;

  const handleUpdate = (updates: Partial<RenderComputeConfig>) => {
    if (onChangeComputeConfig) {
      onChangeComputeConfig(updates);
    }
    if (updates.aspectRatio) {
      onChangeAspectRatio(updates.aspectRatio);
    }
  };

  const ratioList = [
    'Auto', 'Custom', '1:1', '3:2', '4:3', '3:4',
    '16:9', '9:16', '21:9', '2:3', '4:5', '5:4',
    '1:4', '1:8', '4:1', '8:1'
  ];

  return (
    <div
      className={`w-84 border-l flex flex-col h-full select-none z-30 shrink-0 transition-colors ${
        isLight ? 'bg-white border-stone-200 text-stone-800' : 'bg-stone-900 border-stone-800 text-stone-200'
      }`}
    >
      {/* 1. Header */}
      <div
        className={`px-4 py-3 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'border-stone-200 bg-[#FAF8F5]' : 'border-stone-800 bg-stone-900'
        }`}
      >
        <div className={`flex items-center gap-2 font-bold text-xs ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>
          <Sparkles className="w-4 h-4" />
          <span>AI 摄影与引擎调控</span>
        </div>
        <span className={`text-[10px] font-mono ${isLight ? 'text-stone-500' : 'text-stone-400'}`}>
          0{activeShotIndex + 1}/0{totalShots}
        </span>
      </div>

      {/* 2. Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 text-xs">
        <motion.div
          key={activeShot.id}
          initial={{ opacity: 0.85, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="space-y-3.5"
        >
          {/* High Frequency Actions Group */}
        <div className="space-y-2">
          {/* Primary Action 1: 重新生成当前画面 */}
          <button
            onClick={onGenerateCurrentShot}
            disabled={isGeneratingCurrent || isGeneratingAll}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 text-white font-bold rounded-xl shadow-md transition active:scale-98 cursor-pointer"
          >
            {isGeneratingCurrent ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4 text-amber-200" />
            )}
            <span>{isGeneratingCurrent ? '正在执行摄影渲染...' : '重新生成当前画面'}</span>
          </button>

          {/* Primary Action 2: 一键生成全部画面 */}
          <button
            onClick={onGenerateAllShots}
            disabled={isGeneratingCurrent || isGeneratingAll}
            className={`w-full flex items-center justify-center gap-2 py-2 px-3 disabled:opacity-50 font-semibold rounded-xl border transition cursor-pointer ${
              isLight
                ? 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-300'
                : 'bg-stone-800 hover:bg-stone-700 text-stone-200 border-stone-700'
            }`}
          >
            {isGeneratingAll ? (
              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
            ) : (
              <Sparkles className="w-4 h-4 text-amber-500" />
            )}
            <span>{isGeneratingAll ? '正在批量生成全套画册 (请稍候)...' : '一键生成全部画面 (A00-A08)'}</span>
          </button>
        </div>

        {/* ======================= 渲染引擎配置 COMPUTE (完全保留原版选项) ======================= */}
        <div
          className={`p-3 rounded-xl border transition-all ${
            isLight ? 'bg-[#FAF8F5] border-stone-200' : 'bg-stone-950/90 border-stone-800'
          }`}
        >
          <div
            className="flex items-center justify-between cursor-pointer group select-none"
            onClick={() => setIsComputeCollapsed(!isComputeCollapsed)}
          >
            <div className="flex items-center gap-2">
              <div
                className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${
                  isLight ? 'bg-amber-100 text-amber-800' : 'bg-amber-500/20 text-amber-400'
                }`}
              >
                <Cpu className="w-3 h-3" />
              </div>
              <h3 className={`font-bold text-xs ${isLight ? 'text-stone-900' : 'text-stone-100'}`}>
                渲染引擎配置 <span className={`font-mono text-[10px] ml-1 ${isLight ? 'text-stone-400' : 'text-stone-500'}`}>Compute</span>
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                天工专线
              </span>
              {isComputeCollapsed ? (
                <ChevronDown className="w-4 h-4 text-stone-400 group-hover:text-amber-500" />
              ) : (
                <ChevronUp className="w-4 h-4 text-stone-400 group-hover:text-amber-500" />
              )}
            </div>
          </div>

          {!isComputeCollapsed && (
            <div className="mt-3 space-y-3.5 pt-2 border-t border-stone-700/20">
              {/* 1. 算力与画质档位 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold">
                  <span className={isLight ? 'text-stone-600' : 'text-stone-400'}>算力与画质档位</span>
                  <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">
                    {cfg.model.split('/').pop()}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {/* v2.5 Flash */}
                  <button
                    type="button"
                    onClick={() => handleUpdate({ model: 'gemini-2.5-flash' })}
                    className={`p-1.5 rounded-lg text-center border transition-all cursor-pointer ${
                      cfg.model === 'gemini-2.5-flash'
                        ? isLight
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm font-bold'
                          : 'bg-amber-600 text-white border-amber-500 shadow-md font-bold'
                        : isLight
                        ? 'bg-white border-stone-200 text-stone-700 hover:border-amber-400'
                        : 'bg-stone-900 border-stone-800 text-stone-300 hover:border-stone-700'
                    }`}
                  >
                    <div className="text-sm mb-0.5">🚀</div>
                    <div className="text-[10px] font-bold">极速</div>
                    <div className="text-[8px] opacity-70">v2.5 Flash</div>
                  </button>

                  {/* v3.1 Flash */}
                  <button
                    type="button"
                    onClick={() => handleUpdate({ model: 'gemini-3.1-flash-image' })}
                    className={`p-1.5 rounded-lg text-center border transition-all cursor-pointer ${
                      cfg.model.includes('3.1-flash')
                        ? isLight
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm font-bold'
                          : 'bg-amber-600 text-white border-amber-500 shadow-md font-bold'
                        : isLight
                        ? 'bg-white border-stone-200 text-stone-700 hover:border-amber-400'
                        : 'bg-stone-900 border-stone-800 text-stone-300 hover:border-stone-700'
                    }`}
                  >
                    <div className="text-sm mb-0.5">⚡</div>
                    <div className="text-[10px] font-bold">标准</div>
                    <div className="text-[8px] opacity-70">v3.1 Flash</div>
                  </button>

                  {/* v3.0 Pro */}
                  <button
                    type="button"
                    onClick={() => handleUpdate({ model: 'google/gemini-3-pro-image' })}
                    className={`p-1.5 rounded-lg text-center border transition-all cursor-pointer ${
                      cfg.model.includes('3-pro')
                        ? isLight
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm font-bold'
                          : 'bg-amber-600 text-white border-amber-500 shadow-md font-bold'
                        : isLight
                        ? 'bg-white border-stone-200 text-stone-700 hover:border-amber-400'
                        : 'bg-stone-900 border-stone-800 text-stone-300 hover:border-stone-700'
                    }`}
                  >
                    <div className="text-sm mb-0.5">✨</div>
                    <div className="text-[10px] font-bold">旗舰</div>
                    <div className="text-[8px] opacity-70">v3.0 Pro</div>
                  </button>

                  {/* GPT image-2 */}
                  <button
                    type="button"
                    onClick={() => handleUpdate({ model: 'openai/gpt-image-2' })}
                    className={`p-1.5 rounded-lg text-center border transition-all cursor-pointer ${
                      cfg.model === 'openai/gpt-image-2'
                        ? isLight
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm font-bold'
                          : 'bg-amber-600 text-white border-amber-500 shadow-md font-bold'
                        : isLight
                        ? 'bg-white border-stone-200 text-stone-700 hover:border-amber-400'
                        : 'bg-stone-900 border-stone-800 text-stone-300 hover:border-stone-700'
                    }`}
                  >
                    <div className="text-sm mb-0.5">🌌</div>
                    <div className="text-[10px] font-bold">GPT</div>
                    <div className="text-[8px] opacity-70">image-2</div>
                  </button>

                  {/* GPT image-2-c */}
                  <button
                    type="button"
                    onClick={() => handleUpdate({ model: 'openai/gpt-image-2-c' })}
                    className={`p-1.5 rounded-lg text-center border transition-all cursor-pointer ${
                      cfg.model === 'openai/gpt-image-2-c'
                        ? isLight
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm font-bold'
                          : 'bg-amber-600 text-white border-amber-500 shadow-md font-bold'
                        : isLight
                        ? 'bg-white border-stone-200 text-stone-700 hover:border-amber-400'
                        : 'bg-stone-900 border-stone-800 text-stone-300 hover:border-stone-700'
                    }`}
                  >
                    <div className="text-sm mb-0.5">🪐</div>
                    <div className="text-[10px] font-bold">GPT 增强</div>
                    <div className="text-[8px] opacity-70">image-2-c</div>
                  </button>

                  {/* GPT image-2-all */}
                  <button
                    type="button"
                    onClick={() => handleUpdate({ model: 'openai/gpt-image-2-all' })}
                    className={`p-1.5 rounded-lg text-center border transition-all cursor-pointer ${
                      cfg.model === 'openai/gpt-image-2-all'
                        ? isLight
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm font-bold'
                          : 'bg-amber-600 text-white border-amber-500 shadow-md font-bold'
                        : isLight
                        ? 'bg-white border-stone-200 text-stone-700 hover:border-amber-400'
                        : 'bg-stone-900 border-stone-800 text-stone-300 hover:border-stone-700'
                    }`}
                    title="仅支持已保存为公网 HTTPS URL 的多参考图"
                  >
                    <div className="text-sm mb-0.5">🧩</div>
                    <div className="text-[10px] font-bold">GPT 多图</div>
                    <div className="text-[8px] opacity-70">image-2-all</div>
                  </button>
                </div>
              </div>

              {/* 2. 渲染精度 (Resolution) */}
              <div className="space-y-1.5">
                <div className={`text-[11px] font-semibold ${isLight ? 'text-stone-600' : 'text-stone-400'}`}>
                  渲染精度 (Resolution)
                </div>
                <div className="flex gap-2">
                  {(['1K', '2K', '4K'] as const).map((r) => {
                    const isV25 = cfg.model.includes('2.5');
                    const isDisabled = isV25 && (r === '2K' || r === '4K');
                    const isSel = cfg.resolution === r;

                    return (
                      <button
                        key={r}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => {
                          handleUpdate({ resolution: r });
                          if ((r === '2K' || r === '4K') && cfg.model.includes('2.5')) {
                            handleUpdate({ model: 'gemini-3.1-flash-image' });
                          }
                        }}
                        className={`flex-1 relative py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          isDisabled
                            ? 'opacity-40 cursor-not-allowed bg-stone-100 dark:bg-stone-900 border-stone-300 dark:border-stone-800 text-stone-400'
                            : isSel
                            ? isLight
                              ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                              : 'bg-amber-600 text-white border-amber-500 shadow-xs'
                            : isLight
                            ? 'bg-white border-stone-200 text-stone-600 hover:border-amber-400'
                            : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        {r}
                        {isDisabled && (
                          <span className="absolute -top-1 -right-1 bg-stone-500 text-[8px] text-white px-1 rounded scale-75">
                            锁定
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. 图片比例 (Ratio) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold">
                  <span className={isLight ? 'text-stone-600' : 'text-stone-400'}>图片比例 (Ratio)</span>
                  <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">
                    {IMAGE_ASPECT_SPECS[cfg.aspectRatio]?.sublabel || cfg.aspectRatio}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {ratioList.map((r) => {
                    const isSel = cfg.aspectRatio === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => handleUpdate({ aspectRatio: r })}
                        className={`py-1 rounded-lg text-center font-mono text-xs transition cursor-pointer border ${
                          isSel
                            ? isLight
                              ? 'bg-amber-600 text-white border-amber-600 font-bold shadow-2xs'
                              : 'bg-amber-600 text-white border-amber-500 font-bold shadow-2xs'
                            : isLight
                            ? 'bg-white border-stone-200 text-stone-600 hover:border-amber-400'
                            : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>

                {cfg.aspectRatio === 'Custom' && (
                  <input
                    type="text"
                    placeholder="如: 16:10 或 1920:1080"
                    value={cfg.customAspectRatio || ''}
                    onChange={(e) => handleUpdate({ customAspectRatio: e.target.value })}
                    className={`w-full p-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 mt-1 ${
                      isLight ? 'bg-white border-stone-300 text-stone-900' : 'bg-stone-900 border-stone-700 text-stone-100'
                    }`}
                  />
                )}
              </div>

              {/* 4. 随机种子 (Seed) */}
              <div className="flex items-center gap-2 pt-1 border-t border-stone-700/20">
                <label className={`text-[10px] font-bold uppercase w-12 shrink-0 ${isLight ? 'text-stone-500' : 'text-stone-400'}`}>
                  Seed
                </label>
                <input
                  type="number"
                  placeholder="随机 Random"
                  value={cfg.seed === undefined ? '' : cfg.seed}
                  onChange={(e) =>
                    handleUpdate({
                      seed: e.target.value ? parseInt(e.target.value, 10) : undefined
                    })
                  }
                  className={`flex-1 py-1 px-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                    isLight ? 'bg-white border-stone-300 text-stone-900' : 'bg-stone-900 border-stone-700 text-stone-100'
                  }`}
                />
              </div>

              {/* 5. 命名生成预设 (Preset) */}
              <div className="pt-1 border-t border-stone-700/20 space-y-1.5">
                <label className={`text-[11px] font-semibold ${isLight ? 'text-stone-600' : 'text-stone-400'}`}>
                  命名生成预设 (Preset)
                </label>
                <div className="flex gap-1.5">
                  {(
                    [
                      { key: 'standard', label: '标准' },
                      { key: 'detailed', label: '详细 (推荐)' },
                      { key: 'custom', label: '自定义' }
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => handleUpdate({ namingPreset: p.key })}
                      className={`flex-1 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        cfg.namingPreset === p.key
                          ? isLight
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-amber-600 text-white border-amber-500'
                          : isLight
                          ? 'bg-white border-stone-200 text-stone-600 hover:border-amber-400'
                          : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {cfg.namingPreset === 'custom' && (
                  <input
                    type="text"
                    placeholder="输入自定义前缀 (如: 敏华摄影画册_)"
                    value={cfg.customPrefix || ''}
                    onChange={(e) => handleUpdate({ customPrefix: e.target.value })}
                    className={`w-full py-1 px-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                      isLight ? 'bg-white border-stone-300 text-stone-900' : 'bg-stone-900 border-stone-700 text-stone-100'
                    }`}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Smart Optimization Section */}
        <div className="pt-1 space-y-2">
          {/* Card 1: AI 润色空间光影与构图 */}
          <button
            onClick={onOptimizeLightingAndPrompt}
            className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition text-left cursor-pointer group ${
              isLight
                ? 'bg-[#FAF8F5] hover:bg-white border-stone-200 text-stone-800'
                : 'bg-stone-950 hover:bg-stone-800/80 border-stone-800 text-stone-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition ${
                  isLight
                    ? 'bg-amber-100 border-amber-300 text-amber-800 group-hover:bg-amber-200'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400 group-hover:bg-amber-500/20'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className={`font-semibold ${isLight ? 'text-stone-900' : 'text-stone-200'}`}>
                  AI 润色空间描述与光影
                </div>
                <div className={`text-[10px] ${isLight ? 'text-stone-500' : 'text-stone-500'}`}>
                  依据空间结构与家具特质重构光影
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* Product Ratio & Consistency Guarantee */}
        <div
          className={`p-3 rounded-xl border space-y-1.5 ${
            isLight ? 'bg-emerald-50/70 border-emerald-200 text-stone-700' : 'bg-stone-950/80 border-stone-800 text-stone-400'
          }`}
        >
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
            <ShieldCheck className="w-4 h-4" />
            <span>产品比例与一致性护航</span>
          </div>
          <div className="text-[10px] leading-relaxed space-y-1 pl-0.5">
            <p className="flex items-center gap-1.5">
              <span className="text-emerald-500">✓</span> 锁定真实产品宽高比 (杜绝拉伸形变)
            </p>
            <p className="flex items-center gap-1.5">
              <span className="text-emerald-500">✓</span> 摄影黄金分割构图 (杜绝沉底空顶)
            </p>
            <p className="flex items-center gap-1.5">
              <span className="text-emerald-500">✓</span> 严格无文字纯净底图 (排版层分离)
            </p>
            <p className="flex items-center gap-1.5">
              <span className="text-emerald-500">✓</span> 品牌真值色彩保持 (杜绝偏色泛紫)
            </p>
          </div>
        </div>

        {/* Collapsible Advanced Camera Parameters */}
        <div className="pt-1">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`flex items-center justify-between w-full py-1 cursor-pointer transition ${
              isLight ? 'text-stone-600 hover:text-stone-900' : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <span className="font-semibold text-[11px] flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-amber-500" />
              <span>高级出图提示词与机位微调</span>
            </span>
            {showAdvanced ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {showAdvanced && (
            <div
              className={`mt-2 space-y-3 p-2.5 rounded-xl border animate-in fade-in duration-150 ${
                isLight ? 'bg-[#FAF8F5] border-stone-200' : 'bg-stone-950 border-stone-800'
              }`}
            >
              {/* Focal Length Lens Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className={isLight ? 'text-stone-600 font-medium' : 'text-stone-400 font-medium'}>
                    镜头焦距 (Lens)
                  </span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                    {activeShot.camera.lensMm} mm
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1 pt-0.5">
                  {[24, 35, 50, 85].map((mm) => (
                    <button
                      key={mm}
                      type="button"
                      onClick={() => onUpdateCamera(activeShot.id, { lensMm: mm })}
                      className={`py-1 rounded text-center text-xs font-mono font-semibold transition border cursor-pointer ${
                        activeShot.camera.lensMm === mm
                          ? isLight
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-amber-500 text-stone-950 border-amber-500'
                          : isLight
                          ? 'bg-white text-stone-600 border-stone-200 hover:border-amber-400'
                          : 'bg-stone-900 text-stone-400 border-stone-800 hover:bg-stone-800'
                      }`}
                    >
                      {mm}mm
                    </button>
                  ))}
                </div>
              </div>

              {/* Camera Height Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className={isLight ? 'text-stone-600 font-medium' : 'text-stone-400 font-medium'}>
                    机位高度 (Height)
                  </span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                    {activeShot.camera.heightCm} cm
                  </span>
                </div>
                <input
                  type="range"
                  min={60}
                  max={180}
                  step={5}
                  value={activeShot.camera.heightCm}
                  onChange={(e) =>
                    onUpdateCamera(activeShot.id, { heightCm: parseInt(e.target.value, 10) })
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className={`flex justify-between text-[9px] font-mono ${isLight ? 'text-stone-500' : 'text-stone-500'}`}>
                  <span>80cm 低机位</span>
                  <span className="text-amber-600 dark:text-amber-400 font-bold">115cm 黄金视高</span>
                  <span>180cm 平视</span>
                </div>
              </div>

              {/* Camera Yaw Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className={isLight ? 'text-stone-600 font-medium' : 'text-stone-400 font-medium'}>
                    水平偏角 (Camera Yaw)
                  </span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                    {activeShot.camera.yawDeg}°
                  </span>
                </div>
                <input
                  type="range"
                  min={-90}
                  max={90}
                  step={1}
                  value={activeShot.camera.yawDeg}
                  onChange={(e) =>
                    onUpdateCamera(activeShot.id, { yawDeg: parseInt(e.target.value, 10) })
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Camera Pitch Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className={isLight ? 'text-stone-600 font-medium' : 'text-stone-400 font-medium'}>
                    俯仰角度 (Camera Pitch)
                  </span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                    {activeShot.camera.pitchDeg}°
                  </span>
                </div>
                <input
                  type="range"
                  min={-25}
                  max={25}
                  step={1}
                  value={activeShot.camera.pitchDeg}
                  onChange={(e) =>
                    onUpdateCamera(activeShot.id, { pitchDeg: parseInt(e.target.value, 10) })
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>
        </motion.div>
      </div>
    </div>
  );
};
