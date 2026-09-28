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
  Ratio,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Scan,
  Maximize,
  AlertCircle,
  Move,
  Star,
  Check,
  User,
  Activity,
  Layers,
  Sparkle
} from 'lucide-react';
import {
  ShotInstance,
  SceneMaster,
  ImageAspectRatio,
  IMAGE_ASPECT_SPECS
} from '../../../types/spaceStudio';
import { CandidateItem, ShotCandidateBatch } from '../../../types/spaceAssetLibrary';
import { UserBadge } from '../../../components/common/UserBadge';

interface SpaceStudioCanvasProps {
  activeShot: ShotInstance;
  sceneMaster: SceneMaster | null;
  aspectRatio: ImageAspectRatio;
  onChangeAspectRatio: (ratio: ImageAspectRatio) => void;
  isGenerating: boolean;
  onGenerateCurrent: () => void;
  onOpenCompareModal?: () => void;

  // New Phase 2 Candidate Batch Props
  candidateBatch?: ShotCandidateBatch | null;
  selectedCandidateId?: string;
  onSelectCandidate?: (candidate: CandidateItem) => void;
  onApplyCandidateAsFinal?: (candidate: CandidateItem) => void;
  onRegenerateBatch?: () => void;
  onKeepSpaceRefreshModel?: () => void;
  onKeepModelRefreshPose?: () => void;
  onKeepProductRefreshScene?: () => void;
  onToggleFavoriteCandidate?: (candidateId: string) => void;

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
  candidateBatch,
  selectedCandidateId,
  onSelectCandidate,
  onApplyCandidateAsFinal,
  onRegenerateBatch,
  onKeepSpaceRefreshModel,
  onKeepModelRefreshPose,
  onKeepProductRefreshScene,
  onToggleFavoriteCandidate,
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
  ) || activeShot.revisions[activeShot.revisions.length - 1];

  const primaryKey = currentRevision?.objectKey || (activeShot.templateCode === 'A00' ? sceneMaster?.objectKey : undefined);
  const localFileUrl = primaryKey ? `/api/space/storage/local-file?key=${encodeURIComponent(primaryKey)}` : undefined;

  // Selected candidate or default revision image
  const activeCandidate = candidateBatch?.candidates.find(c => c.id === selectedCandidateId) || candidateBatch?.candidates[0];

  const rawCandidateUrl =
    activeCandidate?.imageUrl ||
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

  // 滚轮缩放
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

  // 双击缩放
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
        return 'aspect-[3/4] max-w-[500px]';
      case '16:9':
        return 'aspect-[16/9] max-w-[800px]';
      case '1:1':
        return 'aspect-square max-w-[560px]';
      case '4:3':
        return 'aspect-[4/3] max-w-[700px]';
      case '9:16':
        return 'aspect-[9/16] max-w-[380px]';
      case '2:3':
        return 'aspect-[2/3] max-w-[440px]';
      case '3:2':
        return 'aspect-[3/2] max-w-[700px]';
      default:
        return 'aspect-[3/4] max-w-[500px]';
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
        isLight ? 'bg-[#F2EFE9]' : 'bg-[#0f1118]'
      } ${isFullscreen ? 'fixed inset-0 z-50 p-4' : ''}`}
    >
      {/* 1. TOP FLOATING HUD BAR */}
      <div
        id="space-studio-top-hud"
        className={`h-12 border-b backdrop-blur-md px-5 flex items-center justify-between z-20 shrink-0 transition-colors ${
          isLight ? 'bg-[#FAF8F5]/90 border-stone-200 text-stone-800' : 'bg-[#161822]/90 border-white/10 text-stone-100'
        }`}
      >
        {/* Left: Active Shot Tag */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 bg-black/40 text-xs text-white">
            <span className="font-mono font-bold text-amber-400">{activeShot.templateCode}</span>
            <span className="text-neutral-500">·</span>
            <span className="font-semibold">{activeShot.name}</span>
          </div>

          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded border border-white/5 bg-black/20 text-neutral-400">
            <span>{activeShot.camera.lensMm}mm</span>
            <span>·</span>
            <span>{activeShot.camera.heightCm}cm 黄金机位</span>
            <span>·</span>
            <span className="text-amber-400 font-medium">黄金分割构图</span>
          </span>

          {currentImageUrl && !imageError ? (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border text-emerald-400 bg-emerald-950/60 border-emerald-800/60 font-semibold">
              <CheckCircle2 className="w-2.5 h-2.5" /> 渲染完成
            </span>
          ) : isGenerating ? (
            <span className="flex items-center gap-1 text-[10px] text-amber-300 bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 rounded-full animate-pulse font-semibold">
              <RefreshCw className="w-2.5 h-2.5 animate-spin" /> 正在生成 4 候选...
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border text-neutral-400 bg-black/30 border-white/10">
              待渲染
            </span>
          )}
        </div>

        {/* Right: Tools & Aspect Ratio */}
        <div className="flex items-center gap-2">
          {/* Aspect Ratio Selector */}
          <div className="relative">
            <button
              onClick={() => setIsRatioDropdownOpen(!isRatioDropdownOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 bg-black/40 hover:bg-black/60 text-xs font-mono text-neutral-200 transition"
              title="切换画幅比例"
            >
              <Ratio className="w-3.5 h-3.5 text-amber-400" />
              <span>{IMAGE_ASPECT_SPECS[aspectRatio]?.label || aspectRatio}</span>
            </button>

            {isRatioDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 border border-white/15 rounded-xl shadow-2xl p-1.5 z-50 bg-[#161822] text-neutral-200 space-y-1">
                <div className="px-2 py-1 text-[10px] font-semibold border-b border-white/10 text-neutral-400">
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
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition ${
                          isSelected
                            ? 'bg-amber-500/20 text-amber-300 font-semibold'
                            : 'text-neutral-300 hover:bg-white/5'
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

          {/* Download Button */}
          {currentImageUrl && !imageError && (
            <button
              onClick={handleDownload}
              className="p-1.5 rounded-lg border border-white/10 bg-black/40 hover:bg-black/60 text-neutral-300 hover:text-white transition"
              title="下载高保真画册原图"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          {/* Fullscreen Button */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg border border-white/10 bg-black/40 hover:bg-black/60 text-neutral-300 hover:text-white transition"
            title={isFullscreen ? '退出全屏' : '全屏品鉴'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <div className="h-4 w-px mx-0.5 bg-white/10" />
          <UserBadge theme={theme} variant="compact" />
        </div>
      </div>

      {/* 2. CENTER ARTWORK STAGE */}
      <main className="flex-1 flex flex-col items-center justify-center p-3 relative overflow-hidden">
        {/* Canvas Artwork Box */}
        <div
          ref={containerRef}
          className={`w-full ${getAspectRatioClass(
            aspectRatio
          )} max-h-[60vh] rounded-2xl border border-white/10 shadow-2xl relative overflow-hidden flex items-center justify-center bg-black/60 group`}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeShot.id}-${activeShot.currentRevisionId || 'rev0'}-${currentImageUrl ? 'img' : isGenerating ? 'gen' : 'empty'}`}
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.01 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full flex items-center justify-center relative overflow-hidden"
            >
              {/* Interactive Viewport */}
              {currentImageUrl && !imageError ? (
                <div
                  onWheel={handleWheel}
                  onMouseDown={handleMouseDown}
                  onDoubleClick={handleDoubleClick}
                  className={`relative w-full h-full flex items-center justify-center overflow-hidden select-none ${
                    isDragging ? 'cursor-grabbing' : 'cursor-grab'
                  }`}
                >
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

                  {!imageLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-xs">
                      <RefreshCw className="w-6 h-6 text-amber-400 animate-spin" />
                    </div>
                  )}

                  {/* Watermark in bottom right */}
                  <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-md backdrop-blur-md border border-white/10 bg-black/70 text-[10px] font-mono pointer-events-none flex items-center gap-1.5 text-neutral-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span>MANWAH · 视觉驱动摄影母版</span>
                  </div>

                  {/* FLOATING INTERACTION HUD */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2.5 py-1 rounded-full backdrop-blur-xl border border-white/15 bg-black/80 shadow-2xl text-white">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleZoomChange(-0.25);
                      }}
                      className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 transition"
                      title="缩小 (-25%)"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleResetTransform();
                      }}
                      className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold text-amber-400 min-w-[48px] text-center"
                    >
                      {Math.round(zoom * 100)}%
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleZoomChange(0.25);
                      }}
                      className="p-1.5 rounded-full hover:bg-white/10 text-neutral-300 transition"
                      title="放大 (+25%)"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>

                    <div className="w-px h-3.5 bg-white/20 mx-0.5" />

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFitMode((prev) => (prev === 'contain' ? 'cover' : 'contain'));
                      }}
                      className={`px-2 py-1 rounded-md text-[10px] font-medium transition flex items-center gap-1 ${
                        fitMode === 'cover'
                          ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
                          : 'hover:bg-white/10 text-neutral-300'
                      }`}
                    >
                      {fitMode === 'contain' ? <Scan className="w-3 h-3" /> : <Maximize className="w-3 h-3" />}
                      <span>{fitMode === 'contain' ? '适应' : '填满'}</span>
                    </button>

                    {(zoom !== 1.0 || pan.x !== 0 || pan.y !== 0) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResetTransform();
                        }}
                        className="p-1.5 rounded-full hover:bg-white/10 text-amber-400 transition"
                        title="复位视口"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ) : imageError ? (
                <div className="flex flex-col items-center justify-center p-8 text-center space-y-3 max-w-sm">
                  <div className="w-12 h-12 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-400 flex items-center justify-center">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h4 className="text-xs font-bold text-white">图像读取异常</h4>
                  <button
                    onClick={onGenerateCurrent}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>重新生成当前画面</span>
                  </button>
                </div>
              ) : isGenerating ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-8 text-center bg-black/80">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-full border-2 border-amber-500/30 border-t-amber-500 animate-spin" />
                    <Camera className="w-6 h-6 text-amber-400 absolute inset-0 m-auto animate-pulse" />
                  </div>
                  <div className="text-xs font-bold text-amber-300">
                    AI 摄影大模型正在计算 4 张候选渲染图...
                  </div>
                  <p className="text-[10px] text-neutral-400 max-w-xs">
                    正在执行空间几何锁定、模特面容对齐与落座物理真值护航
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center space-y-3 max-w-sm">
                  <div className="w-12 h-12 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400 flex items-center justify-center">
                    <Camera className="w-6 h-6" />
                  </div>
                  <h4 className="text-xs font-bold text-white">
                    {activeShot.templateCode} · {activeShot.name}
                  </h4>
                  <p className="text-[11px] text-neutral-400">
                    当前镜头未生成。点击右侧「生成 4 张候选」开启视觉资产驱动渲染。
                  </p>
                  <button
                    onClick={onGenerateCurrent}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-xs font-bold shadow-lg shadow-amber-500/20 transition flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>生成 4 张候选</span>
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 3. BOTTOM CANDIDATE GALLERY & DIRECTOR VARIATIONS BAR */}
        {candidateBatch && candidateBatch.candidates.length > 0 && (
          <div className="w-full max-w-4xl mt-3 p-3 rounded-2xl bg-[#14161f]/90 border border-white/10 backdrop-blur-md shadow-2xl flex flex-col gap-2.5 animate-in fade-in duration-200">
            {/* Top Bar: Batch Header & Fast Variations Actions */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkle className="w-3.5 h-3.5 text-amber-400" />
                  <span>4 张候选方案</span>
                </span>
                <span className="text-[10px] text-neutral-400 font-mono">
                  (已选 #{activeCandidate?.variantIndex || 1})
                </span>
              </div>

              {/* Director Fast Variations Actions */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={onRegenerateBatch}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-neutral-300 hover:text-white flex items-center gap-1 transition"
                  title="重新生成一套全新 4 张方案"
                >
                  <RefreshCw className="w-3 h-3 text-amber-400" />
                  <span>换一批</span>
                </button>

                <button
                  onClick={onKeepSpaceRefreshModel}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-purple-500/20 border border-white/10 hover:border-purple-500/40 text-[11px] text-neutral-300 hover:text-purple-300 flex items-center gap-1 transition"
                  title="空间与产品不变，换不同模特出镜"
                >
                  <User className="w-3 h-3 text-purple-400" />
                  <span>保持空间换人物</span>
                </button>

                <button
                  onClick={onKeepModelRefreshPose}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/40 text-[11px] text-neutral-300 hover:text-emerald-300 flex items-center gap-1 transition"
                  title="模特不变，换不同姿态与落座"
                >
                  <Activity className="w-3 h-3 text-emerald-400" />
                  <span>保持人物换姿态</span>
                </button>

                <button
                  onClick={onKeepProductRefreshScene}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-amber-500/20 border border-white/10 hover:border-amber-500/40 text-[11px] text-neutral-300 hover:text-amber-300 flex items-center gap-1 transition"
                  title="产品主体不变，尝试不同空间硬装风格"
                >
                  <Layers className="w-3 h-3 text-amber-400" />
                  <span>保持产品换场景</span>
                </button>

                {activeCandidate && (
                  <button
                    onClick={() => onApplyCandidateAsFinal?.(activeCandidate)}
                    className="px-3 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-[11px] flex items-center gap-1 shadow-md transition"
                  >
                    <Check className="w-3 h-3 stroke-[3]" />
                    <span>设为当前镜头结果</span>
                  </button>
                )}
              </div>
            </div>

            {/* 4 Candidate Thumbnails Strip */}
            <div className="grid grid-cols-4 gap-3">
              {candidateBatch.candidates.map((cand) => {
                const isSelected = (activeCandidate?.id === cand.id);
                return (
                  <div
                    key={cand.id}
                    onClick={() => onSelectCandidate?.(cand)}
                    className={`group relative rounded-xl overflow-hidden border cursor-pointer transition-all duration-150 flex flex-col bg-black/40 ${
                      isSelected
                        ? 'border-amber-500 ring-2 ring-amber-500/40 shadow-lg'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <div className="relative aspect-[16/10] bg-black/60 overflow-hidden">
                      <img
                        src={cand.imageUrl}
                        alt={`Candidate ${cand.variantIndex}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      
                      {/* Candidate Badge */}
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur text-[9px] font-mono text-amber-300 border border-white/10">
                        方案 #{cand.variantIndex}
                      </span>

                      {/* Favorite Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavoriteCandidate?.(cand.id);
                        }}
                        className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center transition ${
                          cand.isFavorite
                            ? 'bg-amber-500 text-black'
                            : 'bg-black/50 hover:bg-black/80 text-white/60 hover:text-amber-400'
                        }`}
                      >
                        <Star className="w-3 h-3 fill-current" />
                      </button>

                      {isSelected && (
                        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.2 bg-amber-500 text-black rounded">
                          <Check className="w-2.5 h-2.5 stroke-[3]" /> 正在品鉴
                        </div>
                      )}
                    </div>

                    <div className="p-1.5 text-[10px] text-neutral-300 font-medium truncate">
                      {cand.summaryTag || `候选微调方案 ${cand.variantIndex}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
