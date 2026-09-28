// src/features/space-studio/components/SpaceStudioShotNavigator.tsx
import React from 'react';
import { motion } from 'motion/react';
import { Camera, CheckCircle2, Clock, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import { ShotInstance, SceneMaster } from '../../../types/spaceStudio';

interface SpaceStudioShotNavigatorProps {
  shots: ShotInstance[];
  sceneMaster: SceneMaster | null;
  activeShotIndex: number;
  onSelectShot: (index: number) => void;
  onBatchRenderAll?: () => void;
  isGeneratingAll?: boolean;
  theme?: 'dark' | 'light';
}

export const SpaceStudioShotNavigator: React.FC<SpaceStudioShotNavigatorProps> = ({
  shots,
  sceneMaster,
  activeShotIndex,
  onSelectShot,
  onBatchRenderAll,
  isGeneratingAll,
  theme = 'dark'
}) => {
  const isLight = theme === 'light';

  const readyCount = shots.filter((s, idx) => {
    const rev = s.revisions.find((r) => r.id === s.currentRevisionId) || s.revisions[s.revisions.length - 1];
    return idx === 0 ? !!sceneMaster?.imageUrl || !!rev?.imageUrl : !!rev?.imageUrl;
  }).length;

  return (
    <div
      className={`w-full border-t px-4 py-2.5 flex items-center justify-between gap-3 select-none backdrop-blur-md z-40 shrink-0 transition-colors ${
        isLight ? 'bg-[#FAF8F5]/95 border-stone-200 text-stone-800' : 'bg-stone-900/95 border-stone-800 text-stone-100'
      }`}
    >
      {/* 1. Left Label */}
      <div className={`flex items-center gap-2 shrink-0 text-xs font-semibold px-2 ${isLight ? 'text-stone-700' : 'text-stone-300'}`}>
        <Camera className="w-4 h-4 text-amber-500" />
        <span className="whitespace-nowrap">画册镜头导航</span>
        <span className={`text-[10px] font-mono ${isLight ? 'text-stone-400' : 'text-stone-500'}`}>
          ({readyCount}/09 镜头就绪)
        </span>
      </div>

      {/* 2. 9 Shot Thumbnail Cards */}
      <div className="flex items-center gap-2.5 overflow-x-auto py-1 scrollbar-none max-w-full">
        {shots.map((shot, idx) => {
          const isActive = idx === activeShotIndex;
          const currentRev = shot.revisions.find((r) => r.id === shot.currentRevisionId) || shot.revisions[shot.revisions.length - 1];
          const previewImage = idx === 0 ? sceneMaster?.imageUrl || currentRev?.imageUrl : currentRev?.imageUrl;

          let statusBadge = (
            <span
              className={`flex items-center gap-1 text-[9px] px-1.5 py-0.2 rounded font-mono ${
                isLight ? 'text-stone-500 bg-stone-100' : 'text-stone-400 bg-stone-800'
              }`}
            >
              <Clock className="w-2 h-2" /> 未生成
            </span>
          );

          if (shot.status === 'generating') {
            statusBadge = (
              <span className="flex items-center gap-1 text-[9px] text-amber-600 dark:text-amber-300 bg-amber-500/20 px-1.5 py-0.2 rounded animate-pulse font-mono">
                <RefreshCw className="w-2 h-2 animate-spin" /> 生成中
              </span>
            );
          } else if (previewImage) {
            statusBadge = (
              <span className="flex items-center gap-1 text-[9px] text-emerald-600 dark:text-emerald-300 bg-emerald-500/20 px-1.5 py-0.2 rounded font-mono font-semibold">
                <CheckCircle2 className="w-2 h-2" /> 已就绪
              </span>
            );
          }

          return (
            <motion.div
              key={shot.id}
              onClick={() => onSelectShot(idx)}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`relative flex flex-col items-center p-1.5 rounded-xl cursor-pointer transition-colors duration-200 shrink-0 w-28 border ${
                isActive
                  ? isLight
                    ? 'bg-white border-amber-500 shadow-sm'
                    : 'bg-stone-800 border-amber-500 shadow-lg'
                  : isLight
                  ? 'bg-white border-stone-200 hover:border-stone-300'
                  : 'bg-stone-900/80 border-stone-800 hover:border-stone-700 hover:bg-stone-800/60'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeShotNodeIndicator"
                  className="absolute -inset-0.5 rounded-xl border-2 border-amber-500 ring-2 ring-amber-400/30 pointer-events-none z-10"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}

              {/* Thumbnail Container 3:4 */}
              <div
                className={`relative w-full aspect-[3/4] rounded-lg overflow-hidden mb-1.5 border flex items-center justify-center transition-transform duration-300 ${
                  isLight ? 'bg-stone-100 border-stone-200' : 'bg-stone-950 border-stone-800'
                }`}
              >
                {previewImage ? (
                  <img
                    src={previewImage}
                    alt={shot.name}
                    className="w-full h-full object-cover select-none"
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-1">
                    <Camera className="w-4 h-4 text-stone-400" />
                    <span className="text-[9px] font-mono text-stone-400">{shot.camera.lensMm}mm</span>
                  </div>
                )}

                {/* Index Pill */}
                <div
                  className={`absolute top-1 left-1 px-1 py-0.2 rounded text-[8px] font-mono font-bold ${
                    isLight ? 'bg-white/90 text-stone-700 border border-stone-200' : 'bg-stone-950/80 text-stone-300'
                  }`}
                >
                  0{idx + 1}
                </div>
              </div>

              {/* Title & Status */}
              <div
                className={`w-full flex items-center justify-between text-[10px] truncate font-medium ${
                  isLight ? 'text-stone-800' : 'text-stone-300'
                }`}
              >
                <span className="truncate">{shot.name.split(' ')[0]}</span>
              </div>

              <div className="w-full mt-1 flex justify-start">
                {statusBadge}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* 3. Right: Batch Action */}
      {onBatchRenderAll && (
        <div className={`pl-2 border-l shrink-0 ${isLight ? 'border-stone-200' : 'border-stone-800'}`}>
          <button
            onClick={onBatchRenderAll}
            disabled={isGeneratingAll}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 text-white font-bold text-xs shadow-md transition active:scale-98 cursor-pointer whitespace-nowrap"
          >
            {isGeneratingAll ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-amber-200" />
            )}
            <span>一键生成全部</span>
          </button>
        </div>
      )}
    </div>
  );
};
