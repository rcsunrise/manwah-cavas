// src/components/poster-studio/NineScreenNavigator.tsx
import React from 'react';
import { PlanScreenItem } from '../../services/posterStudioService';
import { PosterCompositionSnapshot } from '../../types/posterTemplate';
import { CheckCircle2, Clock, AlertCircle, RefreshCw, Layers } from 'lucide-react';

interface NineScreenNavigatorProps {
  screens: PlanScreenItem[];
  compositions: Record<number, PosterCompositionSnapshot>;
  activeScreenIndex: number;
  onSelectScreen: (index: number) => void;
  onRegenerateScreen?: (index: number) => void;
}

export const NineScreenNavigator: React.FC<NineScreenNavigatorProps> = ({
  screens,
  compositions,
  activeScreenIndex,
  onSelectScreen,
  onRegenerateScreen
}) => {
  return (
    <div className="w-full bg-stone-900/95 border-t border-stone-800 px-4 py-2.5 flex items-center justify-between gap-3 select-none backdrop-blur-md z-40">
      {/* Left Label */}
      <div className="flex items-center gap-2 text-stone-400 shrink-0 text-xs font-semibold px-2">
        <Layers className="w-4 h-4 text-amber-500" />
        <span>海报导航</span>
      </div>

      {/* 9 Screen Cards */}
      <div className="flex items-center gap-2.5 overflow-x-auto py-1 scrollbar-none max-w-full">
        {screens.map((screen) => {
          const comp = compositions[screen.screenIndex];
          const isActive = screen.screenIndex === activeScreenIndex;
          const previewImage = comp?.imageLayers?.[0]?.imageUrl || screen.sourceImageUrl;

          let statusBadge = (
            <span className="flex items-center gap-1 text-[10px] text-stone-400 bg-stone-800 px-1.5 py-0.5 rounded">
              <Clock className="w-2.5 h-2.5" /> 未生成
            </span>
          );

          if (screen.status === 'generating') {
            statusBadge = (
              <span className="flex items-center gap-1 text-[10px] text-amber-300 bg-amber-900/40 px-1.5 py-0.5 rounded animate-pulse">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" /> 生成中
              </span>
            );
          } else if (screen.status === 'approved' || (previewImage && screen.status !== 'failed')) {
            statusBadge = (
              <span className="flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded">
                <CheckCircle2 className="w-2.5 h-2.5" /> 已就绪
              </span>
            );
          } else if (screen.status === 'failed') {
            statusBadge = (
              <span className="flex items-center gap-1 text-[10px] text-red-300 bg-red-950/60 px-1.5 py-0.5 rounded">
                <AlertCircle className="w-2.5 h-2.5" /> 需重试
              </span>
            );
          }

          return (
            <div
              key={screen.screenIndex}
              onClick={() => onSelectScreen(screen.screenIndex)}
              className={`relative flex flex-col items-center p-1.5 rounded-lg cursor-pointer transition-all shrink-0 w-28 border ${
                isActive
                  ? 'bg-stone-800 border-amber-500 ring-2 ring-amber-500/40 shadow-lg'
                  : 'bg-stone-900/80 border-stone-800 hover:border-stone-700 hover:bg-stone-800/60'
              }`}
            >
              {/* Thumbnail Container 3:4 */}
              <div className="relative w-full aspect-[3/4] bg-stone-950 rounded overflow-hidden mb-1.5 border border-stone-800 flex items-center justify-center">
                {previewImage ? (
                  <img
                    src={previewImage}
                    alt={screen.screenTitle}
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center p-1">
                    <span className="text-xs font-mono font-bold text-stone-600">
                      0{screen.screenIndex}
                    </span>
                  </div>
                )}

                {/* Index Pill */}
                <div className="absolute top-1 left-1 bg-black/70 backdrop-blur-sm text-stone-300 text-[10px] font-mono px-1 rounded">
                  0{screen.screenIndex}
                </div>
              </div>

              {/* Title & Status */}
              <div className="w-full text-center truncate">
                <div
                  className={`text-xs font-medium truncate ${
                    isActive ? 'text-amber-400 font-bold' : 'text-stone-300'
                  }`}
                  title={screen.screenTitle}
                >
                  {screen.screenTitle}
                </div>
                <div className="mt-1 flex justify-center">{statusBadge}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Right spacer */}
      <div className="w-4 shrink-0" />
    </div>
  );
};
