import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Camera,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Sparkles,
  GripHorizontal,
  ChevronUp,
  ChevronDown,
  Minimize2,
  Layers,
  History,
  Check,
  Trash2,
  X,
  Users,
  Home
} from 'lucide-react';
import { ShotInstance, SceneMaster } from '../../../types/spaceStudio';

interface SpaceStudioShotNavigatorProps {
  shots: ShotInstance[];
  sceneMaster: SceneMaster | null;
  activeShotIndex: number;
  onSelectShot: (index: number) => void;
  onSelectRevision?: (shotId: string, revisionId: string) => void;
  onDeleteRevision?: (shotId: string, revisionId: string) => void;
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
  onSelectRevision,
  onDeleteRevision,
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

  // 镜头历史生成版本浮层交互状态 (默认对包含多版本的当前激活镜头展开，用户可自由切换/关闭)
  const [openHistoryShotId, setOpenHistoryShotId] = useState<string | null>(null);
  const [closedHistoryShotIds, setClosedHistoryShotIds] = useState<Set<string>>(new Set());

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
      const delta = startYRef.current - clientY;
      const newHeight = Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, startHeightRef.current + delta));
      setHeight(newHeight);
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
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
      className={`w-full border-t flex flex-col select-none backdrop-blur-md z-40 shrink-0 transition-colors relative overflow-visible ${
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
      <div className="flex-1 flex items-center justify-between gap-3 px-4 min-h-0 relative">
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

              // 是否对当前 Shot 展开垂直向上历史版本面板
              const shouldShowHistory = shot.revisions.length > 1 && (
                openHistoryShotId === shot.id || (isActive && !closedHistoryShotIds.has(shot.id) && openHistoryShotId === null)
              );

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
              } else if (previewImage && shot.hasHumanPass) {
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

                  {/* 历史版本指示徽标 (点击展开/折叠历史堆叠面板) */}
                  {shot.revisions.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (shouldShowHistory) {
                          setClosedHistoryShotIds(prev => new Set(prev).add(shot.id));
                          setOpenHistoryShotId(null);
                        } else {
                          setClosedHistoryShotIds(prev => {
                            const next = new Set(prev);
                            next.delete(shot.id);
                            return next;
                          });
                          setOpenHistoryShotId(shot.id);
                        }
                        onSelectShot(idx);
                      }}
                      className="absolute -top-1.5 -right-1.5 z-20 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-md flex items-center gap-0.5 hover:scale-105 transition cursor-pointer"
                      title={`此镜头已沉淀 ${shot.revisions.length} 个历史生成版本 (点击查看/对比)`}
                    >
                      <Layers className="w-2.5 h-2.5" />
                      <span>v{shot.revisions.length}</span>
                    </button>
                  )}

                  {/* ═════════════════════════════════════════════════════════════
                      垂直向上延伸的历史版本堆叠面板 (完全契合用户图 3 手绘红框形态)
                  ═════════════════════════════════════════════════════════════ */}
                  {shouldShowHistory && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 p-2.5 rounded-2xl bg-[#141622]/98 border border-amber-500/40 backdrop-blur-xl shadow-2xl w-[230px] animate-in fade-in zoom-in-95 duration-200 text-left"
                    >
                      {/* 面板头部 */}
                      <div className="flex items-center justify-between pb-1.5 border-b border-white/10 text-[10px]">
                        <span className="font-bold text-amber-300 flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5 text-amber-400" />
                          <span>{shot.templateCode} 镜头历史 ({shot.revisions.length}版)</span>
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setClosedHistoryShotIds(prev => new Set(prev).add(shot.id));
                            setOpenHistoryShotId(null);
                          }}
                          className="p-0.5 rounded text-neutral-400 hover:text-white hover:bg-white/10 cursor-pointer"
                          title="收起历史面板"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>

                      {/* 垂直堆叠卡片列表 (用户手绘的两个向上方框) */}
                      <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-0.5 scrollbar-thin">
                        {shot.revisions.map((rev, revIdx) => {
                          const isCurrentActive = rev.id === shot.currentRevisionId || (!shot.currentRevisionId && revIdx === 0);
                          const isHuman = rev.revisionType === 'human' || rev.id.includes('human');
                          return (
                            <div
                              key={rev.id}
                              onClick={() => onSelectRevision?.(shot.id, rev.id)}
                              className={`group/rev relative rounded-xl p-1.5 border transition-all cursor-pointer flex items-center gap-2 ${
                                isCurrentActive
                                  ? 'bg-amber-500/15 border-amber-500 ring-2 ring-amber-500/30 shadow-md'
                                  : 'bg-black/40 border-white/10 hover:border-white/30 hover:bg-white/5'
                              }`}
                            >
                              {/* 缩略图 */}
                              <div className="relative w-16 h-12 rounded-lg overflow-hidden bg-black/60 shrink-0 border border-white/10">
                                {rev.imageUrl ? (
                                  <img
                                    src={rev.imageUrl}
                                    alt={rev.label || `Rev ${revIdx + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[9px] text-neutral-500">
                                    无图
                                  </div>
                                )}
                                {isHuman ? (
                                  <span className="absolute top-0.5 right-0.5 px-1 py-0.2 rounded text-[7px] font-bold bg-purple-600 text-white">
                                    模特
                                  </span>
                                ) : (
                                  <span className="absolute top-0.5 right-0.5 px-1 py-0.2 rounded text-[7px] font-bold bg-emerald-600 text-white">
                                    空间
                                  </span>
                                )}
                              </div>

                              {/* 信息说明 */}
                              <div className="flex-1 min-w-0 flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold text-white truncate">
                                    {rev.label || (isHuman ? `v${rev.revisionNumber} 模特入座` : `v${rev.revisionNumber} 空间场景`)}
                                  </span>
                                </div>
                                <span className="text-[9px] text-neutral-400 truncate">
                                  {rev.metaSummary || (isHuman ? '模特自然落座' : '空间硬装基准')}
                                </span>
                                <div className="flex items-center justify-between mt-1">
                                  {isCurrentActive ? (
                                    <span className="text-[9px] text-amber-300 font-bold flex items-center gap-0.5">
                                      <Check className="w-2.5 h-2.5 stroke-[3]" /> 当前主选
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-neutral-400 group-hover/rev:text-amber-400">
                                      点击切换
                                    </span>
                                  )}
                                  {shot.revisions.length > 1 && !isCurrentActive && onDeleteRevision && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteRevision(shot.id, rev.id);
                                      }}
                                      className="p-1 rounded hover:bg-red-500/20 text-neutral-500 hover:text-red-400 opacity-0 group-hover/rev:opacity-100 transition cursor-pointer"
                                      title="删除此版本"
                                    >
                                      <Trash2 className="w-2.5 h-2.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* 底部小尖角指示器指向宿主卡片 */}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-3 h-3 bg-[#141622] border-r border-b border-amber-500/40 rotate-45 -mt-1.5" />
                    </div>
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
