// src/features/space-studio/components/SpaceStudioShotNavigator.tsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'motion/react';
import { Camera, CheckCircle2, Clock, AlertCircle, RefreshCw, Sparkles, GripHorizontal, ChevronUp, ChevronDown, Minimize2 } from 'lucide-react';
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

// Height presets for the navigator
const HEIGHT_COLLAPSED = 44;   // Only show the drag handle + label bar
const HEIGHT_DEFAULT = 145;    // Default compact card strip
const HEIGHT_EXPANDED = 260;   // Full thumbnails with larger cards
const HEIGHT_MIN = 44;
const HEIGHT_MAX = 360;

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
  const [height, setHeight] = useState(HEIGHT_DEFAULT);
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(HEIGHT_DEFAULT);
  const containerRef = useRef<HTMLDivElement>(null);

  const isCollapsed = height <= HEIGHT_COLLAPSED + 10;

  const readyCount = shots.filter((s, idx) => {
    const rev = s.revisions.find((r) => r.id === s.currentRevisionId) || s.revisions[s.revisions.length - 1];
    return idx === 0 ? !!sceneMaster?.imageUrl || !!rev?.imageUrl : !!rev?.imageUrl;
  }).length;

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startYRef.current = clientY;
    startHeightRef.current = height;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [height]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      if (!isDraggingRef.current) return;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      // Dragging UP increases height (negative delta), dragging DOWN decreases
      const delta = startYRef.current - clientY;
      const newHeight = Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, startHeightRef.current + delta));
      setHeight(newHeight);
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Free drag without forced snap: allows user to release at any desired height!
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleMouseMove, { passive: false });
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, []);

  // Preset toggle (click on chevrons)
  const cycleUp = useCallback(() => {
    setHeight(prev => {
      if (prev <= HEIGHT_COLLAPSED + 10) return HEIGHT_DEFAULT;
      if (prev <= HEIGHT_DEFAULT + 10) return HEIGHT_EXPANDED;
      return HEIGHT_EXPANDED;
    });
  }, []);

  const cycleDown = useCallback(() => {
    setHeight(prev => {
      if (prev >= HEIGHT_EXPANDED - 10) return HEIGHT_DEFAULT;
      if (prev >= HEIGHT_DEFAULT - 10) return HEIGHT_COLLAPSED;
      return HEIGHT_COLLAPSED;
    });
  }, []);

  // Determine card layout based on height
  const showThumbnails = height > HEIGHT_COLLAPSED + 20;
  const cardAspect = height >= HEIGHT_EXPANDED - 20 ? 'aspect-[3/4]' : 'aspect-[4/3]';
  const cardWidth = height >= HEIGHT_EXPANDED - 20 ? 'w-32' : 'w-24';

  return (
    <div
      ref={containerRef}
      style={{ height: `${height}px`, transition: isDraggingRef.current ? 'none' : 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}
      className={`w-full border-t flex flex-col select-none backdrop-blur-md z-40 shrink-0 transition-colors overflow-hidden ${
        isLight ? 'bg-[#FAF8F5]/95 border-stone-200 text-stone-800' : 'bg-stone-900/95 border-stone-800 text-stone-100'
      }`}
    >
      {/* Drag Handle Bar */}
      <div
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        className={`flex items-center justify-center gap-2 cursor-ns-resize shrink-0 group py-1 ${
          isLight ? 'hover:bg-stone-100/80' : 'hover:bg-stone-800/80'
        } transition-colors`}
      >
        {/* Up arrow */}
        <button
          onClick={(e) => { e.stopPropagation(); cycleUp(); }}
          className={`p-0.5 rounded transition-all opacity-0 group-hover:opacity-100 cursor-pointer ${
            isLight ? 'hover:bg-stone-200 text-stone-500' : 'hover:bg-stone-700 text-stone-400'
          } ${height >= HEIGHT_EXPANDED - 10 ? 'invisible' : ''}`}
        >
          <ChevronUp className="w-3 h-3" />
        </button>

        {/* Drag grip */}
        <div className={`flex items-center gap-1 ${isLight ? 'text-stone-400' : 'text-stone-600'} group-hover:text-amber-500 transition-colors`}>
          <GripHorizontal className="w-5 h-3.5" />
        </div>

        {/* Down arrow */}
        <button
          onClick={(e) => { e.stopPropagation(); cycleDown(); }}
          className={`p-0.5 rounded transition-all opacity-0 group-hover:opacity-100 cursor-pointer ${
            isLight ? 'hover:bg-stone-200 text-stone-500' : 'hover:bg-stone-700 text-stone-400'
          } ${height <= HEIGHT_COLLAPSED + 10 ? 'invisible' : ''}`}
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      {/* Main Content Row */}
      <div className="flex-1 flex items-center justify-between gap-3 px-4 overflow-hidden min-h-0">
        {/* 1. Left Label */}
        <div className={`flex items-center gap-2 shrink-0 text-xs font-semibold px-2 ${isLight ? 'text-stone-700' : 'text-stone-300'}`}>
          <Camera className="w-4 h-4 text-amber-500" />
          <span className="whitespace-nowrap">画册镜头导航</span>
          <span className={`text-[10px] font-mono ${isLight ? 'text-stone-400' : 'text-stone-500'}`}>
            ({readyCount}/09 镜头就绪)
          </span>
          {isCollapsed && (
            <button
              onClick={cycleUp}
              className="ml-2 text-[10px] text-amber-500 hover:text-amber-400 flex items-center gap-0.5 cursor-pointer"
            >
              <ChevronUp className="w-3 h-3" /> 展开
            </button>
          )}
        </div>

        {/* 2. 9 Shot Thumbnail Cards */}
        {showThumbnails && (
          <div className="flex items-center gap-2.5 overflow-x-auto py-1 scrollbar-none max-w-full flex-1 min-w-0">
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
              } else if (shot.hasHumanPass) {
                statusBadge = (
                  <span className="flex items-center gap-1 text-[9px] text-purple-400 bg-purple-500/20 px-1.5 py-0.2 rounded font-mono font-semibold">
                    <CheckCircle2 className="w-2 h-2" /> 已添模特
                  </span>
                );
              } else if (previewImage) {
                statusBadge = (
                  <span className="flex items-center gap-1 text-[9px] text-emerald-600 dark:text-emerald-300 bg-emerald-500/20 px-1.5 py-0.2 rounded font-mono font-semibold">
                    <CheckCircle2 className="w-2 h-2" /> 待添模特
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
                  className={`relative flex flex-col items-center p-1.5 rounded-xl cursor-pointer transition-colors duration-200 shrink-0 ${cardWidth} border ${
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

                  {/* Thumbnail Container */}
                  <div
                    className={`relative w-full ${cardAspect} rounded-lg overflow-hidden mb-1.5 border flex items-center justify-center transition-transform duration-300 ${
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

                    {/* Index & Template Code Pill */}
                    <div
                      className={`absolute top-1 left-1 px-1 py-0.2 rounded text-[8px] font-mono font-bold ${
                        isLight ? 'bg-white/90 text-stone-700 border border-stone-200' : 'bg-stone-950/80 text-stone-300'
                      }`}
                    >
                      {shot.templateCode || `0${idx + 1}`}
                    </div>
                    {previewImage && !shot.hasHumanPass && (
                      <div className="absolute top-1 right-1 px-1 py-0.2 rounded text-[8px] font-mono font-bold bg-purple-600/90 text-white shadow-xs">
                        +模特
                      </div>
                    )}
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
        )}

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
    </div>
  );
};
