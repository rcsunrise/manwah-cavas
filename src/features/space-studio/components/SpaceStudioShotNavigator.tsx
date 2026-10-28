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
  ChevronLeft,
  ChevronRight,
  Minimize2,
  Layers,
  History,
  Check,
  Trash2,
  X,
  Users,
  Home,
  Upload,
  Clipboard,
  Image as ImageIcon
} from 'lucide-react';
import { ShotInstance, SceneMaster, ImageAspectRatio, IMAGE_ASPECT_SPECS } from '../../../types/spaceStudio';
import { HumanLayoutConfig } from '../../../types/spaceAssetLibrary';
import { getShotTemplateByCode } from '../data/shotTemplates';
import { getRecommendedStudioTemplate } from '../data/choreographyPresets';

interface SpaceStudioShotNavigatorProps {
  shots: ShotInstance[];
  sceneMaster: SceneMaster | null;
  activeShotIndex: number;
  onSelectShot: (index: number) => void;
  onSelectRevision?: (shotId: string, revisionId: string) => void;
  onDeleteRevision?: (shotId: string, revisionId: string) => void;
  onBatchRenderAll?: () => void;
  isGeneratingAll?: boolean;
  onCancelRendering?: (shotId?: string) => void;
  onUploadShotPhoto?: (shotId: string, file: File) => void;
  onPasteShotPhoto?: (shotId: string) => void;
  shotHumanLayouts?: Record<string, HumanLayoutConfig>;
  theme?: 'dark' | 'light';
}

// Height presets for the navigator
const HEIGHT_COLLAPSED = 44;   // Only show the drag handle + label bar
const HEIGHT_DEFAULT = 145;    // Default compact card strip
const HEIGHT_EXPANDED = 260;   // Full thumbnails with larger cards
const HEIGHT_MIN = 44;
const HEIGHT_MAX = 360;

const ShotThumbnailImage: React.FC<{
  src?: string;
  lensMm?: number;
}> = ({ src, lensMm }) => {
  const [hasError, setHasError] = useState(false);
  const [imgSrc, setImgSrc] = useState(src);

  useEffect(() => {
    setHasError(false);
    setImgSrc(src);
  }, [src]);

  const handleError = () => {
    if (imgSrc && imgSrc.includes('storage.googleapis.com')) {
      try {
        const u = new URL(imgSrc);
        const parts = u.pathname.split('/');
        const key = parts.slice(2).join('/');
        if (key) {
          setImgSrc(`/api/space/storage/local-file?key=${encodeURIComponent(key)}`);
          return;
        }
      } catch {}
    }
    if (imgSrc && !imgSrc.includes('healed=1')) {
      const match = imgSrc.match(/(A0[0-9]|master)/i);
      const code = match ? match[1].toUpperCase() : 'A00';
      setImgSrc(`/api/space/storage/local-file?key=shots/${code}/healed.svg&healed=1`);
      return;
    }
    setHasError(true);
  };

  if (!imgSrc || hasError) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 w-full h-full select-none">
        <Camera className="w-4 h-4 text-stone-400" />
        <span className="text-[9px] font-mono text-stone-400">{lensMm || 35}mm</span>
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt=""
      onError={handleError}
      className="w-full h-full object-cover select-none"
      referrerPolicy="no-referrer"
    />
  );
};

export const SpaceStudioShotNavigator: React.FC<SpaceStudioShotNavigatorProps> = ({
  shots,
  sceneMaster,
  activeShotIndex,
  onSelectShot,
  onSelectRevision,
  onDeleteRevision,
  onBatchRenderAll,
  isGeneratingAll,
  onCancelRendering,
  onUploadShotPhoto,
  onPasteShotPhoto,
  shotHumanLayouts = {},
  theme = 'dark'
}) => {
  const isLight = theme === 'light';
  const [height, setHeight] = useState(HEIGHT_DEFAULT);
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(HEIGHT_DEFAULT);
  const containerRef = useRef<HTMLDivElement>(null);

  // 文件上传与剪贴板粘贴引用
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetUploadShotIdRef = useRef<string | null>(null);
  const [dragOverShotId, setDragOverShotId] = useState<string | null>(null);

  const activeShot = shots[activeShotIndex] || shots[0];

  const triggerUploadForShot = (shotId: string) => {
    targetUploadShotIdRef.current = shotId;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetId = targetUploadShotIdRef.current || activeShot?.id;
    if (file && targetId && onUploadShotPhoto) {
      onUploadShotPhoto(targetId, file);
    }
  };

  const handlePasteForShot = async (shotId: string) => {
    if (onPasteShotPhoto) {
      onPasteShotPhoto(shotId);
      return;
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              const ext = type.split('/')[1] || 'png';
              const file = new File([blob], `shot_paste_${Date.now()}.${ext}`, { type });
              if (onUploadShotPhoto) {
                onUploadShotPhoto(shotId, file);
                return;
              }
            }
          }
        }
      }
      alert('剪贴板中未检测到图片，请先在电脑上复制照片后，再点击粘贴');
    } catch (err: any) {
      console.warn('[SpaceStudioShotNavigator] clipboard read failed:', err);
      alert('请使用键盘快捷键 Ctrl+V 直接粘贴实拍照片');
    }
  };

  // 镜头历史生成版本浮层交互状态 (默认对包含多版本的当前激活镜头展开，用户可自由切换/关闭)
  const [openHistoryShotId, setOpenHistoryShotId] = useState<string | null>(null);
  const [closedHistoryShotIds, setClosedHistoryShotIds] = useState<Set<string>>(new Set());

  // 镜头横向滚动条引用与自动居中
  const stripScrollRef = useRef<HTMLDivElement>(null);
  const shotCardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    if (!stripScrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = stripScrollRef.current;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
  }, []);

  useEffect(() => {
    const el = stripScrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState, shots.length]);

  // 当激活镜头切换时，平滑居中显示当前镜头
  useEffect(() => {
    const targetEl = shotCardRefs.current[activeShotIndex];
    if (targetEl && stripScrollRef.current) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeShotIndex]);

  // 将垂直滚轮平滑映射为横向滚动
  const handleWheelScroll = (e: React.WheelEvent) => {
    if (!stripScrollRef.current) return;
    if (e.deltaY !== 0) {
      stripScrollRef.current.scrollLeft += e.deltaY * 0.9;
    }
  };

  const handleScrollBy = (dir: 'left' | 'right') => {
    if (!stripScrollRef.current) return;
    const offset = dir === 'left' ? -260 : 260;
    stripScrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
  };

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
      <div className="flex-1 flex items-center justify-between gap-2.5 px-3 min-h-0 relative">
        {/* 1. Left Label & Quick Real-shot Ingestion Tools (精简紧凑) */}
        <div className={`flex items-center gap-1.5 shrink-0 text-xs font-semibold px-0.5 ${isLight ? 'text-stone-700' : 'text-stone-300'}`}>
          <Camera className="w-3.5 h-3.5 text-amber-500" />
          <span className="whitespace-nowrap font-bold">画册机位</span>
          <span className={`text-[10px] font-mono px-1 py-0.2 rounded ${isLight ? 'text-stone-500 bg-stone-200/60' : 'text-stone-400 bg-stone-800'}`}>
            {readyCount}/9
          </span>

          {/* 针对选定镜头上传拍摄照片的专属功能按钮组 */}
          {!isCollapsed && (
            <div className="flex items-center gap-1 ml-0.5">
              <button
                type="button"
                onClick={() => triggerUploadForShot(activeShot.id)}
                className="px-2 py-1 rounded-lg bg-gradient-to-r from-amber-500/90 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-[10px] font-bold transition shadow-xs flex items-center gap-1 cursor-pointer active:scale-95 whitespace-nowrap"
                title={`为当前选中的【${activeShot?.templateCode || '当前'}】镜头单独上传实拍照片（支持本地 JPG/PNG/WebP 与拖拽）`}
              >
                <Upload className="w-2.5 h-2.5 text-black stroke-[2.5]" />
                <span>传拍摄</span>
              </button>
              <button
                type="button"
                onClick={() => handlePasteForShot(activeShot.id)}
                className={`p-1 rounded-lg border text-[10px] font-semibold transition flex items-center gap-0.5 cursor-pointer active:scale-95 ${
                  isLight
                    ? 'border-amber-300 bg-amber-50/70 hover:bg-amber-100 text-amber-900'
                    : 'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300'
                }`}
                title={`从剪贴板一键粘贴拍摄照片到当前【${activeShot?.templateCode || '当前'}】镜头 (或直接按 Ctrl+V)`}
              >
                <Clipboard className="w-3 h-3 text-amber-500" />
              </button>
            </div>
          )}

          {/* 隐藏的原生文件上传 Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/jpg"
            onChange={handleFileInputChange}
            className="hidden"
          />

          {isCollapsed && (
            <button
              onClick={cycleUp}
              className="ml-2 text-[10px] text-amber-500 hover:text-amber-400 flex items-center gap-0.5 cursor-pointer"
            >
              <ChevronUp className="w-3 h-3" /> 展开
            </button>
          )}
        </div>

        {/* 2. 9 Shot Thumbnail Cards with Wheel Horizontal Scroll & Smooth Chevrons */}
        {showThumbnails && (
          <div className="relative flex-1 min-w-0 flex items-center mx-1">
            {/* 左平滑翻页微调按钮 */}
            {canScrollLeft && (
              <button
                type="button"
                onClick={() => handleScrollBy('left')}
                className={`absolute -left-1.5 z-30 p-1 rounded-full shadow-lg border transition-all cursor-pointer backdrop-blur-md ${
                  isLight
                    ? 'bg-white/95 text-stone-700 hover:bg-white border-stone-200 shadow-stone-300'
                    : 'bg-stone-800/95 text-stone-200 hover:bg-stone-700 border-stone-700 shadow-black'
                }`}
                title="向左滚动镜头"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}

            {/* 卡片水平滑动容器 (支持滚轮上下滑动直接横向位移) */}
            <div
              ref={stripScrollRef}
              onWheel={handleWheelScroll}
              className="flex items-center gap-2 overflow-x-auto py-1 px-1 scrollbar-none max-w-full flex-1 min-w-0 scroll-smooth"
            >
              {shots.map((shot, idx) => {
                const isActive = idx === activeShotIndex;
                const currentRev = shot.revisions.find((r) => r.id === shot.currentRevisionId) || shot.revisions[shot.revisions.length - 1];
                const fallbackRev = shot.revisions.slice().reverse().find((r) => r.imageUrl && r.imageUrl.trim().length > 0);
                const effectiveRevImage = currentRev?.imageUrl && currentRev.imageUrl.trim().length > 0 ? currentRev.imageUrl : fallbackRev?.imageUrl;
                const previewImage = idx === 0 ? sceneMaster?.imageUrl || effectiveRevImage : effectiveRevImage;

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
                    <span className="flex items-center gap-1 text-[9px] text-amber-600 dark:text-amber-300 bg-amber-500/20 px-1.5 py-0.2 rounded font-mono">
                      <RefreshCw className="w-2 h-2 animate-spin" />
                      <span>生成中</span>
                      {onCancelRendering && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCancelRendering(shot.id);
                          }}
                          className="ml-0.5 text-rose-500 hover:text-rose-400 font-bold hover:scale-125 transition cursor-pointer"
                          title="打断此镜头渲染"
                        >
                          ✕
                        </button>
                      )}
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

                const template = getShotTemplateByCode(shot.templateCode);
                const calibratedName = template?.name || shot.name;
                const shotRatio: ImageAspectRatio =
                  shot.aspectRatio || (template?.recommendedAspectRatio as ImageAspectRatio) || '4:3';

                // 关联模特与动作参数提取
                const boundLayout = shotHumanLayouts[shot.templateCode];
                const recTpl = getRecommendedStudioTemplate(shot.templateCode);
                const modelCount = boundLayout ? boundLayout.slots.length : recTpl.count;
                const modelSummary = boundLayout
                  ? `${modelCount}人模特`
                  : `${recTpl.count}人·${recTpl.badge.split('·')[0].trim()}`;

                const isDragTarget = dragOverShotId === shot.id;

                return (
                  <motion.div
                    key={shot.id}
                    ref={(el) => { shotCardRefs.current[idx] = el; }}
                    onClick={() => onSelectShot(idx)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'copy';
                    if (dragOverShotId !== shot.id) setDragOverShotId(shot.id);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (dragOverShotId === shot.id) setDragOverShotId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverShotId(null);
                    const file = e.dataTransfer.files?.[0];
                    if (file && file.type.startsWith('image/') && onUploadShotPhoto) {
                      onUploadShotPhoto(shot.id, file);
                    }
                  }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className={`relative group/card flex flex-col items-center p-1.5 rounded-xl cursor-pointer transition-colors duration-200 shrink-0 ${cardWidth} border ${
                    isDragTarget
                      ? 'border-amber-400 bg-amber-500/20 ring-2 ring-amber-400 shadow-xl'
                      : isActive
                      ? isLight
                        ? 'bg-white border-amber-500 shadow-sm'
                        : 'bg-stone-800 border-amber-500 shadow-lg'
                      : isLight
                      ? 'bg-white border-stone-200 hover:border-stone-300'
                      : 'bg-stone-900/80 border-stone-800 hover:border-stone-700 hover:bg-stone-800/60'
                  }`}
                >
                  {/* 拖拽释放蒙层提示 */}
                  {isDragTarget && (
                    <div className="absolute inset-0 z-30 rounded-xl bg-amber-500/90 text-black flex flex-col items-center justify-center p-1 text-center font-bold text-[10px] animate-pulse pointer-events-none">
                      <Upload className="w-5 h-5 mb-0.5 stroke-[2.5]" />
                      <span>松手导入拍摄照</span>
                    </div>
                  )}

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

                      {/* 垂直堆叠卡片列表 */}
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
                                ) : (rev.id.includes('rev-edit-') || rev.label?.includes('精修') || rev.label?.includes('重绘')) ? (
                                  <span className="absolute top-0.5 right-0.5 px-1 py-0.2 rounded text-[7px] font-bold bg-emerald-600 text-white">
                                    精修
                                  </span>
                                ) : (rev.id.includes('outpaint') || rev.label?.includes('扩图')) ? (
                                  <span className="absolute top-0.5 right-0.5 px-1 py-0.2 rounded text-[7px] font-bold bg-cyan-600 text-white">
                                    扩图
                                  </span>
                                ) : (
                                  <span className="absolute top-0.5 right-0.5 px-1 py-0.2 rounded text-[7px] font-bold bg-amber-500 text-stone-950">
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
                                  {shot.revisions.length > 1 && onDeleteRevision && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (window.confirm(`确定删除版本【${rev.label || `v${rev.revisionNumber}`}】吗？\n\n删除后其他版本完好保留。`)) {
                                          onDeleteRevision(shot.id, rev.id);
                                        }
                                      }}
                                      className="p-1 rounded hover:bg-red-500/20 text-neutral-400 hover:text-red-400 opacity-0 group-hover/rev:opacity-100 transition cursor-pointer"
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
                    className={`relative w-full ${cardAspect} rounded-lg overflow-hidden mb-1 border flex items-center justify-center transition-transform duration-300 ${
                      isLight ? 'bg-stone-100 border-stone-200' : 'bg-stone-950 border-stone-800'
                    }`}
                  >
                    <ShotThumbnailImage src={previewImage} lensMm={shot.camera?.lensMm} />

                    {/* Index & Template Code Pill */}
                    <div
                      className={`absolute top-1 left-1 px-1 py-0.2 rounded text-[8px] font-mono font-bold ${
                        isLight ? 'bg-white/90 text-stone-700 border border-stone-200' : 'bg-stone-950/80 text-stone-300'
                      }`}
                    >
                      {shot.templateCode || `0${idx + 1}`}
                    </div>

                    {/* Top Right Badges: +模特 and 画面规划长宽比例微标 */}
                    <div className="absolute top-1 right-1 flex items-center gap-1 z-10 pointer-events-none">
                      {previewImage && !shot.hasHumanPass && (
                        <span className="px-1 py-0.2 rounded text-[7.5px] font-mono font-bold bg-purple-600/90 text-white shadow-xs">
                          +模特
                        </span>
                      )}
                      <span
                        className={`px-1 py-0.2 rounded text-[7.5px] font-mono font-bold transition-all shadow-2xs ${
                          isActive
                            ? 'bg-amber-500 text-stone-950 ring-1 ring-amber-400'
                            : isLight
                            ? 'bg-white/90 text-stone-600 border border-stone-200'
                            : 'bg-stone-950/80 text-stone-300 border border-stone-800'
                        }`}
                        title={`画面规划画幅: ${shotRatio} (${IMAGE_ASPECT_SPECS[shotRatio]?.label || ''} · ${IMAGE_ASPECT_SPECS[shotRatio]?.sublabel || ''})`}
                      >
                        {shotRatio}
                      </span>
                    </div>

                    {/* 悬浮快捷实拍上传/粘贴操作按钮条 */}
                    <div className="absolute inset-x-1 bottom-1 z-20 flex items-center justify-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity duration-200 bg-black/75 backdrop-blur-xs py-0.5 rounded-md">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerUploadForShot(shot.id);
                        }}
                        className="px-1.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-black text-[8px] font-bold flex items-center gap-0.5 transition active:scale-95 cursor-pointer shadow-xs"
                        title="上传本地拍摄镜头照片"
                      >
                        <Upload className="w-2.5 h-2.5" />
                        <span>上传拍摄</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePasteForShot(shot.id);
                        }}
                        className="p-0.5 rounded bg-white/20 hover:bg-white/30 text-white text-[8px] transition active:scale-95 cursor-pointer"
                        title="粘贴剪贴板照片 (Ctrl+V)"
                      >
                        <Clipboard className="w-2.5 h-2.5 text-amber-300" />
                      </button>
                    </div>
                  </div>

                  {/* Title & Status */}
                  <div
                    className={`w-full flex items-center justify-between text-[10px] truncate font-medium ${
                      isLight ? 'text-stone-800' : 'text-stone-300'
                    }`}
                    title={calibratedName}
                  >
                    <span className="truncate font-semibold">
                      {calibratedName.replace(/\s*\([^)]*\)/g, '').trim()}
                    </span>
                  </div>

                  {/* 状态微标与当前镜头绑定的模特/动作参数微标 */}
                  <div className="w-full mt-1 flex items-center justify-between gap-1">
                    <div>{statusBadge}</div>
                    <span
                      className="text-[8px] font-mono px-1 py-0.2 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 truncate max-w-[65px]"
                      title={`镜头预设模特与动作：${recTpl.name} (${modelCount}人)`}
                    >
                      {modelSummary}
                    </span>
                  </div>
                </motion.div>
              );
            })}
            </div>

            {/* 右平滑翻页微调按钮 */}
            {canScrollRight && (
              <button
                type="button"
                onClick={() => handleScrollBy('right')}
                className={`absolute -right-1.5 z-30 p-1 rounded-full shadow-lg border transition-all cursor-pointer backdrop-blur-md ${
                  isLight
                    ? 'bg-white/95 text-stone-700 hover:bg-white border-stone-200 shadow-stone-300'
                    : 'bg-stone-800/95 text-stone-200 hover:bg-stone-700 border-stone-700 shadow-black'
                }`}
                title="向右滚动镜头"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* 3. Right: Batch Action */}
        {onBatchRenderAll && (
          <div className={`pl-2 border-l shrink-0 ${isLight ? 'border-stone-200' : 'border-stone-800'}`}>
            <button
              onClick={onBatchRenderAll}
              disabled={isGeneratingAll}
              title={
                !sceneMaster
                  ? '优先自动生成 A00 空间母版，锁定空间与硬装基准后并发推进全部分镜'
                  : '基于已锁定的空间母版，并发生成全部未出图镜头'
              }
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 text-white font-bold text-xs shadow-md transition active:scale-98 cursor-pointer whitespace-nowrap"
            >
              {isGeneratingAll ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
              )}
              <span>
                {isGeneratingAll
                  ? (!sceneMaster ? '正在确立母版与全量机位...' : '正在全量渲染中...')
                  : (!sceneMaster ? '一键生成全部 (母版优先)' : '一键生成全部')}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
