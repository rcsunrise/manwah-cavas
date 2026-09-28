// src/features/space-studio/components/SpaceStudioCanvas.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera,
  Maximize2,
  Minimize2,
  Download,
  Sparkles,
  RefreshCw,
  ShieldCheck,
  Eye,
  Sliders,
  Ratio,
  CheckCircle2,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Scan,
  Maximize,
  AlertCircle,
  Move
} from 'lucide-react';
import {
  ShotInstance,
  SceneMaster,
  ImageAspectRatio,
  IMAGE_ASPECT_SPECS
} from '../../../types/spaceStudio';
import { UserBadge } from '../../../components/common/UserBadge';

interface SpaceStudioCanvasProps {
  activeShot: ShotInstance;
  sceneMaster: SceneMaster | null;
  aspectRatio: ImageAspectRatio;
  onChangeAspectRatio: (ratio: ImageAspectRatio) => void;
  isGenerating: boolean;
  onGenerateCurrent: () => void;
  onOpenCompareModal?: () => void;
  theme?: 'dark' | 'light';
}

export const SpaceStudioCanvas: React.FC<SpaceStudioCanvasProps> = ({
  activeShot,
  sceneMaster,
  aspectRatio,
  onChangeAspectRatio,
  isGenerating,
  onGenerateCurrent,
  onOpenCompareModal,
  theme = 'dark'
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRatioDropdownOpen, setIsRatioDropdownOpen] = useState(false);

  // 视口交互状态：自由缩放 (Zoom) 与光标平移 (Pan)
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');
  const [imageError, setImageError] = useState<boolean>(false);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [triedFallback, setTriedFallback] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const isLight = theme === 'light';

  // Active revision image or sceneMaster image if active shot is A00
  const currentRevision = activeShot.revisions.find(
    (r) => r.id === activeShot.currentRevisionId
  ) || activeShot.revisions[0];

  const primaryKey = currentRevision?.objectKey || (activeShot.templateCode === 'A00' ? sceneMaster?.objectKey : undefined);
  const localFileUrl = primaryKey ? `/api/space/storage/local-file?key=${encodeURIComponent(primaryKey)}` : undefined;

  // 智能首选地址：若试过外部失败或无直链，使用本地安全直通流
  const rawCandidateUrl =
    (!triedFallback && (currentRevision?.imageUrl || (activeShot.templateCode === 'A00' ? sceneMaster?.imageUrl : undefined))) ||
    localFileUrl;

  const currentImageUrl =
    typeof rawCandidateUrl === 'string' && rawCandidateUrl.trim().length > 0
      ? rawCandidateUrl.trim()
      : undefined;

  // 当切换镜头或图片重置时，平滑重设视口与状态
  useEffect(() => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
    setImageError(false);
    setImageLoaded(false);
    setTriedFallback(false);
  }, [activeShot.id, activeShot.currentRevisionId, currentImageUrl]);

  // 复位变换
  const handleResetTransform = useCallback(() => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  }, []);

  // 缩放步进
  const handleZoomChange = (delta: number) => {
    setZoom((prev) => {
      const next = Math.round(Math.min(4.0, Math.max(0.25, prev + delta)) * 100) / 100;
      if (next === 1.0) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  };

  // 滚轮缩放：根据光标位置与滚轮平滑缩放
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const zoomFactor = -e.deltaY * 0.0015;
    setZoom((prev) => {
      const newZoom = Math.min(4.0, Math.max(0.25, prev + zoomFactor));
      if (Math.abs(newZoom - 1.0) < 0.03) {
        setPan({ x: 0, y: 0 });
        return 1.0;
      }
      return Math.round(newZoom * 100) / 100;
    });
  };

  // 鼠标拖拽平移按下
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX - pan.x,
      y: e.clientY - pan.y
    });
  };

  // 全局鼠标移动与抬起监听，确保拖拽流畅不脱手
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPan({
        x: Math.round(e.clientX - dragStart.x),
        y: Math.round(e.clientY - dragStart.y)
      });
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  // 双击缩放：在 1.0x 全览与 2.0x 局部细节之间智能切换
  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (zoom > 1.1) {
      handleResetTransform();
    } else {
      setZoom(2.0);
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const offsetX = (e.clientX - (rect.left + rect.width / 2)) * -1;
        const offsetY = (e.clientY - (rect.top + rect.height / 2)) * -1;
        setPan({ x: Math.round(offsetX), y: Math.round(offsetY) });
      }
    }
  };

  // 移动端/触控板单指拖动平移
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging || e.touches.length !== 1) return;
    setPan({
      x: Math.round(e.touches[0].clientX - dragStart.x),
      y: Math.round(e.touches[0].clientY - dragStart.y)
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // 图像加载异常自动捕获与智能降级
  const handleImageError = () => {
    if (!triedFallback && localFileUrl && currentImageUrl !== localFileUrl) {
      console.warn('[SpaceStudioCanvas] External image URL failed, falling back to local storage proxy');
      setTriedFallback(true);
      setImageError(false);
    } else {
      console.error('[SpaceStudioCanvas] Image failed to load completely');
      setImageError(true);
      setImageLoaded(false);
    }
  };

  // Derive aspect ratio CSS classes
  const getAspectRatioClass = (ratio: ImageAspectRatio) => {
    switch (ratio) {
      case '3:4':
        return 'aspect-[3/4] max-w-[540px]';
      case '16:9':
        return 'aspect-[16/9] max-w-[860px]';
      case '1:1':
        return 'aspect-square max-w-[620px]';
      case '4:3':
        return 'aspect-[4/3] max-w-[760px]';
      case '9:16':
        return 'aspect-[9/16] max-w-[420px]';
      case '2:3':
        return 'aspect-[2/3] max-w-[480px]';
      case '3:2':
        return 'aspect-[3/2] max-w-[760px]';
      case '21:9':
        return 'aspect-[21/9] max-w-[900px]';
      case '4:5':
        return 'aspect-[4/5] max-w-[520px]';
      case '5:4':
        return 'aspect-[5/4] max-w-[700px]';
      case '1:4':
        return 'aspect-[1/4] max-w-[280px]';
      case '1:8':
        return 'aspect-[1/8] max-w-[180px]';
      case '4:1':
        return 'aspect-[4/1] max-w-[900px]';
      case '8:1':
        return 'aspect-[8/1] max-w-[960px]';
      default:
        return 'aspect-[3/4] max-w-[540px]';
    }
  };

  const handleDownload = () => {
    if (!currentImageUrl) return;
    const a = document.createElement('a');
    a.href = currentImageUrl;
    a.download = `MANWAH_${activeShot.templateCode}_${aspectRatio.replace(':', 'x')}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      id="space-studio-canvas-root"
      className={`flex-1 h-full flex flex-col relative overflow-hidden select-none transition-colors ${
        isLight ? 'bg-[#F2EFE9]' : 'bg-stone-950'
      } ${isFullscreen ? 'fixed inset-0 z-50 p-4' : ''}`}
    >
      {/* 1. TOP FLOATING HUD BAR */}
      <div
        id="space-studio-top-hud"
        className={`h-12 border-b backdrop-blur-md px-5 flex items-center justify-between z-20 shrink-0 transition-colors ${
          isLight ? 'bg-[#FAF8F5]/90 border-stone-200 text-stone-800' : 'bg-stone-950/80 border-stone-900 text-stone-100'
        }`}
      >
        {/* Left: Active Shot Tag */}
        <div className="flex items-center gap-2.5">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${
              isLight ? 'bg-white border-stone-200 text-stone-800' : 'bg-stone-900 border-stone-800 text-stone-200'
            }`}
          >
            <span className="font-mono font-bold text-amber-500">{activeShot.templateCode}</span>
            <span className={isLight ? 'text-stone-400' : 'text-stone-500'}>·</span>
            <span className="font-semibold">{activeShot.name}</span>
          </div>

          <span
            className={`hidden sm:inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded border ${
              isLight ? 'bg-white/80 border-stone-200 text-stone-600' : 'bg-stone-900/60 border-stone-800/80 text-stone-400'
            }`}
          >
            <span>{activeShot.camera.lensMm}mm</span>
            <span>·</span>
            <span>{activeShot.camera.heightCm}cm 黄金视高</span>
            <span>·</span>
            <span className="text-amber-600 dark:text-amber-400/90 font-medium">黄金分割构图</span>
          </span>

          {currentImageUrl && !imageError ? (
            <span
              className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
                isLight
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-300'
                  : 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60'
              }`}
            >
              <CheckCircle2 className="w-2.5 h-2.5" /> 渲染完成
            </span>
          ) : isGenerating ? (
            <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-300 bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded-full animate-pulse font-semibold">
              <RefreshCw className="w-2.5 h-2.5 animate-spin" /> AI 渲染中
            </span>
          ) : (
            <span
              className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${
                isLight ? 'text-stone-500 bg-stone-100 border-stone-200' : 'text-stone-400 bg-stone-900 border-stone-800'
              }`}
            >
              未生成
            </span>
          )}
        </div>

        {/* Right: Aspect Ratio Selector + Tools */}
        <div className="flex items-center gap-2">
          {/* Aspect Ratio Selector Dropdown */}
          <div className="relative">
            <button
              id="ratio-dropdown-trigger"
              onClick={() => setIsRatioDropdownOpen(!isRatioDropdownOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-stone-50 border-stone-200 text-stone-700'
                  : 'bg-stone-900 hover:bg-stone-800 border-stone-800 text-stone-300'
              }`}
              title="切换画幅比例"
            >
              <Ratio className="w-3.5 h-3.5 text-amber-500" />
              <span>{IMAGE_ASPECT_SPECS[aspectRatio]?.label || aspectRatio}</span>
            </button>

            {isRatioDropdownOpen && (
              <div
                className={`absolute right-0 top-full mt-1 w-56 border rounded-xl shadow-2xl p-1.5 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-150 ${
                  isLight ? 'bg-white border-stone-200 text-stone-800' : 'bg-stone-900 border-stone-800 text-stone-100'
                }`}
              >
                <div className={`px-2 py-1 text-[10px] font-semibold border-b ${isLight ? 'text-stone-500 border-stone-200' : 'text-stone-500 border-stone-800'}`}>
                  选择摄影画幅规格
                </div>
                <div className="max-h-60 overflow-y-auto space-y-0.5">
                  {Object.keys(IMAGE_ASPECT_SPECS).map((r) => {
                    const spec = IMAGE_ASPECT_SPECS[r];
                    const isSelected = r === aspectRatio;
                    return (
                      <button
                        key={r}
                        onClick={() => {
                          onChangeAspectRatio(r);
                          setIsRatioDropdownOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition cursor-pointer ${
                          isSelected
                            ? isLight
                              ? 'bg-amber-100 text-amber-900 font-semibold'
                              : 'bg-amber-500/20 text-amber-300 font-semibold'
                            : isLight
                            ? 'text-stone-700 hover:bg-stone-100'
                            : 'text-stone-300 hover:bg-stone-800'
                        }`}
                      >
                        <span className="font-mono">{spec.label}</span>
                        <span className="text-[10px] opacity-60 font-mono">{spec.sublabel.split(' ')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Compare Modal Button */}
          {onOpenCompareModal && currentImageUrl && !imageError && (
            <button
              onClick={onOpenCompareModal}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-stone-100 text-stone-600 border-stone-200'
                  : 'bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-stone-200 border-stone-800'
              }`}
              title="与母版基准对比"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}

          {/* Download JPEG Button */}
          {currentImageUrl && !imageError && (
            <button
              onClick={handleDownload}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-stone-100 text-stone-600 border-stone-200'
                  : 'bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-stone-200 border-stone-800'
              }`}
              title="下载当前高保真画册原图"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          {/* Fullscreen Button */}
          <button
            id="fullscreen-toggle-button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              isLight
                ? 'bg-white hover:bg-stone-100 text-stone-600 border-stone-200'
                : 'bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-stone-200 border-stone-800'
            }`}
            title={isFullscreen ? '退出全屏' : '全屏品鉴'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <div className={`h-4 w-px mx-0.5 ${isLight ? 'bg-stone-200' : 'bg-stone-800'}`} />
          <UserBadge theme={theme} variant="compact" />
        </div>
      </div>

      {/* 2. CENTER ARTWORK STAGE WITH INTERACTIVE VIEWPORT */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
        {/* Canvas Artwork Box */}
        <div
          ref={containerRef}
          className={`w-full ${getAspectRatioClass(
            aspectRatio
          )} max-h-[75vh] rounded-2xl border shadow-2xl relative overflow-hidden flex items-center justify-center transition-all duration-300 group ${
            isLight
              ? 'bg-white border-stone-200 shadow-stone-300/40'
              : 'bg-stone-900/90 border-stone-800/80 shadow-black/90'
          }`}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeShot.id}-${activeShot.currentRevisionId || 'rev0'}-${currentImageUrl ? 'img' : isGenerating ? 'gen' : 'empty'}`}
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.01 }}
              transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
              className="w-full h-full flex items-center justify-center relative overflow-hidden"
            >
              {/* A. If image exists and no fatal error: Render Interactive Viewport */}
              {currentImageUrl && !imageError ? (
                <div
                  id="canvas-interactive-viewport"
                  onWheel={handleWheel}
                  onMouseDown={handleMouseDown}
                  onDoubleClick={handleDoubleClick}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  className={`relative w-full h-full flex items-center justify-center overflow-hidden select-none ${
                    isDragging ? 'cursor-grabbing' : 'cursor-grab'
                  } ${isLight ? 'bg-[#FAF8F5]' : 'bg-stone-950'}`}
                  title="可随光标拖拽平移，滚轮自由缩放，双击2X放大"
                >
                  {/* Transformable Canvas Layer (随光标拖拽平移与放大缩小) */}
                  <div
                    style={{
                      transform: `translate3d(${pan.x}px, ${pan.y}px, 0px) scale(${zoom})`,
                      transformOrigin: 'center center',
                      transition: isDragging ? 'none' : 'transform 0.12s cubic-bezier(0.2, 0, 0, 1)'
                    }}
                    className="w-full h-full flex items-center justify-center pointer-events-none will-change-transform"
                  >
                    <img
                      src={currentImageUrl}
                      alt={activeShot.name}
                      onLoad={() => {
                        setImageLoaded(true);
                        setImageError(false);
                      }}
                      onError={handleImageError}
                      className={`w-full h-full select-none ${
                        fitMode === 'cover' ? 'object-cover' : 'object-contain'
                      } ${!imageLoaded ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer"
                      draggable={false}
                    />
                  </div>

                  {/* Loading Skeleton before image decode */}
                  {!imageLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-stone-900/30 backdrop-blur-xs">
                      <RefreshCw className="w-6 h-6 text-amber-500 animate-spin" />
                    </div>
                  )}

                  {/* Watermark in bottom right */}
                  <div
                    className={`absolute bottom-3 right-3 px-2.5 py-1 rounded-md backdrop-blur-md border text-[10px] font-mono pointer-events-none flex items-center gap-1.5 transition-opacity ${
                      zoom > 1.2 ? 'opacity-30' : 'opacity-90'
                    } ${
                      isLight
                        ? 'bg-white/80 border-stone-200 text-stone-700'
                        : 'bg-stone-950/70 border-stone-800/80 text-stone-400'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span>MANWAH · 摄影级画册母版</span>
                  </div>

                  {/* Top left overlay badge */}
                  <div
                    className={`absolute top-3 left-3 px-2.5 py-1 rounded-md backdrop-blur-md border text-[10px] font-mono pointer-events-none flex items-center gap-1.5 transition-opacity ${
                      zoom > 1.2 ? 'opacity-30' : 'opacity-90'
                    } ${
                      isLight
                        ? 'bg-white/80 border-stone-200 text-stone-800'
                        : 'bg-stone-950/70 border-stone-800/80 text-stone-300'
                    }`}
                  >
                    <span className="text-amber-500 font-bold">{activeShot.templateCode}</span>
                    <span>{activeShot.name}</span>
                    <span className={isLight ? 'text-stone-400' : 'text-stone-500'}>·</span>
                    <span>{IMAGE_ASPECT_SPECS[aspectRatio]?.sublabel || ''}</span>
                  </div>

                  {/* FLOATING INTERACTION HUD (放大、缩小、复位、填充模式与拖拽提示) */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2.5 py-1.5 rounded-full backdrop-blur-xl border shadow-xl transition-all duration-200 bg-stone-900/90 border-stone-700/80 text-white">
                    {/* Zoom Out */}
                    <button
                      id="canvas-zoom-out"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleZoomChange(-0.25);
                      }}
                      className="p-1.5 rounded-full hover:bg-stone-800 text-stone-300 hover:text-white transition cursor-pointer"
                      title="缩小 (-25%)"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>

                    {/* Current Zoom Indicator Badge */}
                    <button
                      id="canvas-zoom-indicator"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleResetTransform();
                      }}
                      className="px-2 py-0.5 rounded-md hover:bg-stone-800 text-[11px] font-mono font-bold text-amber-400 hover:text-amber-300 transition cursor-pointer min-w-[48px] text-center"
                      title="点击重置为 100% 原始大小"
                    >
                      {Math.round(zoom * 100)}%
                    </button>

                    {/* Zoom In */}
                    <button
                      id="canvas-zoom-in"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleZoomChange(0.25);
                      }}
                      className="p-1.5 rounded-full hover:bg-stone-800 text-stone-300 hover:text-white transition cursor-pointer"
                      title="放大 (+25%)"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>

                    <div className="w-px h-3.5 bg-stone-700/80 mx-0.5" />

                    {/* Fit Mode Toggle: Contain vs Cover */}
                    <button
                      id="canvas-fit-mode"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFitMode((prev) => (prev === 'contain' ? 'cover' : 'contain'));
                      }}
                      className={`px-2 py-1 rounded-md text-[10px] font-medium transition cursor-pointer flex items-center gap-1 ${
                        fitMode === 'cover'
                          ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
                          : 'hover:bg-stone-800 text-stone-300 hover:text-white'
                      }`}
                      title={fitMode === 'contain' ? '当前完整适应 (点击切换为填满裁切)' : '当前填满裁切 (点击切换为完整适应)'}
                    >
                      {fitMode === 'contain' ? (
                        <>
                          <Scan className="w-3 h-3 text-amber-400" />
                          <span>适应</span>
                        </>
                      ) : (
                        <>
                          <Maximize className="w-3 h-3 text-amber-400" />
                          <span>填满</span>
                        </>
                      )}
                    </button>

                    {/* Reset Transform */}
                    {(zoom !== 1.0 || pan.x !== 0 || pan.y !== 0) && (
                      <button
                        id="canvas-reset-transform"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResetTransform();
                        }}
                        className="p-1.5 rounded-full hover:bg-stone-800 text-amber-400 hover:text-amber-300 transition cursor-pointer"
                        title="复位视口 (100% 居中)"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <div className="w-px h-3.5 bg-stone-700/80 mx-0.5 hidden sm:block" />

                    {/* Subtle cursor drag tip */}
                    <div className="hidden sm:flex items-center gap-1 text-[10px] text-stone-400 font-mono px-1">
                      <Move className="w-2.5 h-2.5 text-stone-500" />
                      <span>按住拖移 · 滚轮缩放</span>
                    </div>
                  </div>
                </div>
              ) : imageError ? (
                /* B. Image Load Failed State (报错诊断与恢复) */
                <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-sm">
                  <div className="w-14 h-14 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-400 flex items-center justify-center shadow-lg">
                    <AlertCircle className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <h4 className={`text-sm font-bold ${isLight ? 'text-stone-900' : 'text-stone-200'}`}>
                      图像读取超时或链接未就绪
                    </h4>
                    <p className={`text-xs leading-relaxed ${isLight ? 'text-stone-500' : 'text-stone-400'}`}>
                      由于云端签名时效或网络波动，画面暂未正常渲染。点击下方按钮即可一键重试或重新生成。
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={() => {
                        setImageError(false);
                        setTriedFallback(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold border border-stone-700 transition cursor-pointer flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>重新加载</span>
                    </button>
                    <button
                      onClick={onGenerateCurrent}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white text-xs font-bold shadow-md transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                      <span>重新渲染</span>
                    </button>
                  </div>
                </div>
              ) : isGenerating ? (
                /* C. If Generating: Animated Shimmer Loader */
                <div
                  className={`w-full h-full flex flex-col items-center justify-center gap-4 p-8 text-center ${
                    isLight ? 'bg-white/95' : 'bg-stone-950/90'
                  }`}
                >
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-2 border-amber-500/30 border-t-amber-500 animate-spin" />
                    <Camera className="w-7 h-7 text-amber-500 absolute inset-0 m-auto animate-pulse" />
                  </div>
                  <div className="space-y-1.5">
                    <div className={`text-sm font-bold ${isLight ? 'text-amber-800' : 'text-amber-300'}`}>
                      AI 摄影级物理渲染中...
                    </div>
                    <p className={`text-xs max-w-xs leading-relaxed ${isLight ? 'text-stone-500' : 'text-stone-400'}`}>
                      正在严密锁定产品真实宽高比，遵循 115cm 黄金视高与黄金分割构图渲染
                    </p>
                  </div>
                </div>
              ) : (
                /* D. If Empty: Clean Minimal Placeholder */
                <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-sm">
                  <div
                    className={`w-14 h-14 rounded-2xl border flex items-center justify-center shadow-md ${
                      isLight ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    }`}
                  >
                    <Camera className="w-7 h-7 text-amber-500" />
                  </div>

                  <div className="space-y-1">
                    <h4 className={`text-sm font-bold ${isLight ? 'text-stone-900' : 'text-stone-200'}`}>
                      {activeShot.templateCode} · {activeShot.name}
                    </h4>
                    <p className={`text-xs leading-relaxed ${isLight ? 'text-stone-500' : 'text-stone-400'}`}>
                      当前画面尚未生成。点击右侧「生成当前画面」或一键生成全套画册。
                    </p>
                  </div>

                  <button
                    onClick={onGenerateCurrent}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white text-xs font-bold shadow-md transition active:scale-98 flex items-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-amber-200" />
                    <span>立即生成当前画面</span>
                  </button>

                  <div className={`pt-2 flex items-center gap-2 text-[11px] font-medium ${isLight ? 'text-emerald-700' : 'text-emerald-400/90'}`}>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>真值护航已激活 · 严禁产品形变拉伸与沉底</span>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

