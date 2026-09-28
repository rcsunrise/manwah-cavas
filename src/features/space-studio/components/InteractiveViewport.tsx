// src/features/space-studio/components/InteractiveViewport.tsx
// MANWAH Space Studio｜专业级交互式渲染视窗 (Zoom & Pan Viewport Engine)
// 宇宙物理法则 & 工业第一性原理：
// 1. 忠实还原 3:4 摄影画幅比例，默认采用完整画幅 (object-contain) 呈现场景全部真值 (天花板、真火壁炉、整套沙发、茶几、地毯)；
// 2. 支持自由平移拖拽 (Pan)、鼠标滚轮与多级缩放 (Zoom: 50% ~ 400%)；
// 3. 支持自适应 (Fit) 与填满 (Cover) 自由切换，支持一键居中复位与全屏品鉴模式。

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Scan,
  Maximize,
  Move,
  CheckCircle2,
  Sparkles,
  Palette,
  GitBranch,
  Camera,
  Info
} from 'lucide-react';
import { ShotInstance, SceneMaster, ShotRevision } from '../../../types/spaceStudio';

interface InteractiveViewportProps {
  activeShot: ShotInstance;
  sceneMaster: SceneMaster | null;
  selectedSpaceCode: string;
  isGeneratingMaster: boolean;
  isRenderingShot: boolean;
  isLeftCollapsed: boolean;
  isRightCollapsed: boolean;
  isBottomCollapsed?: boolean;
  onGenerateSceneMaster: () => void;
  onRenderShot: (shot: ShotInstance) => void;
  onConfirmProductionTruth: (revision: ShotRevision) => void;
  onHandoffToPoster: () => void;
  onOpenGraphModal: () => void;
}

export const InteractiveViewport: React.FC<InteractiveViewportProps> = ({
  activeShot,
  sceneMaster,
  selectedSpaceCode,
  isGeneratingMaster,
  isRenderingShot,
  isLeftCollapsed,
  isRightCollapsed,
  isBottomCollapsed = false,
  onGenerateSceneMaster,
  onRenderShot,
  onConfirmProductionTruth,
  onHandoffToPoster,
  onOpenGraphModal
}) => {
  // 视口变换状态
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain'); // 默认完整展示不裁切
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showHelpHint, setShowHelpHint] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // 获取当前图片链接
  const currentRev = activeShot.revisions.length > 0 ? activeShot.revisions[0] : null;
  const displayImageUrl =
    currentRev?.imageUrl ||
    (currentRev?.objectKey ? `/api/space/storage/local-file?key=${encodeURIComponent(currentRev.objectKey)}` : null) ||
    (activeShot.templateCode === 'A00' && sceneMaster?.imageUrl ? sceneMaster.imageUrl : null) ||
    (activeShot.templateCode === 'A00' && sceneMaster?.objectKey ? `/api/space/storage/local-file?key=${encodeURIComponent(sceneMaster.objectKey)}` : null);

  // 当切换镜头或图片变化时，自动复位视口
  useEffect(() => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  }, [activeShot.id, displayImageUrl]);

  // 复位缩放与居中
  const handleResetTransform = useCallback(() => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  }, []);

  // 缩放步进调整
  const handleZoomChange = (delta: number) => {
    setZoom((prev) => {
      const next = Math.round(Math.min(4.0, Math.max(0.5, prev + delta)) * 100) / 100;
      if (next === 1.0) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  };

  // 鼠标滚轮自由缩放
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const zoomFactor = -e.deltaY * 0.0015;
    setZoom((prev) => {
      const newZoom = Math.min(4.0, Math.max(0.5, prev + zoomFactor));
      if (Math.abs(newZoom - 1.0) < 0.05) {
        return 1.0;
      }
      return Math.round(newZoom * 100) / 100;
    });
  };

  // 鼠标拖拽平移
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // 仅响应鼠标主键
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

  // 双击智能切换：在 1.0 倍自适应与 1.6 倍细节放大之间平滑切换
  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (zoom > 1.1) {
      handleResetTransform();
    } else {
      setZoom(1.6);
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const offsetX = (e.clientX - (rect.left + rect.width / 2)) * -0.6;
        const offsetY = (e.clientY - (rect.top + rect.height / 2)) * -0.6;
        setPan({ x: Math.round(offsetX), y: Math.round(offsetY) });
      }
    }
  };

  // 切换全屏模式
  const handleToggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
    handleResetTransform();
  };

  // ESC 键退出全屏
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
        handleResetTransform();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, handleResetTransform]);

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center justify-center transition-all duration-300 ${
        isFullscreen
          ? 'fixed inset-0 z-50 bg-stone-950 p-6 flex flex-col items-center justify-center'
          : 'w-full h-full flex items-center justify-center'
      }`}
    >
      {/* 核心摄影画幅容器：以高度为基准智能自适应，确保无论横屏如何扩展，始终保持 3:4 挺拔画幅 */}
      <div
        ref={viewportRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        className={`bg-stone-900 rounded-2xl shadow-2xl border border-stone-800 hover:border-amber-500/30 transition-colors relative overflow-hidden group flex flex-col items-center justify-center select-none ${
          isFullscreen
            ? 'w-full h-full max-w-[1200px] max-h-[92vh] aspect-[3/4]'
            : isBottomCollapsed
            ? isLeftCollapsed && isRightCollapsed
              ? 'h-[96%] max-h-[900px] aspect-[3/4] max-w-[calc(100vw-80px)]'
              : isLeftCollapsed || isRightCollapsed
              ? 'h-[95%] max-h-[850px] aspect-[3/4] max-w-[calc(100vw-380px)]'
              : 'h-[94%] max-h-[800px] aspect-[3/4] max-w-[calc(100vw-680px)]'
            : isLeftCollapsed && isRightCollapsed
            ? 'h-[92%] max-h-[820px] aspect-[3/4] max-w-[calc(100vw-80px)]'
            : isLeftCollapsed || isRightCollapsed
            ? 'h-[90%] max-h-[760px] aspect-[3/4] max-w-[calc(100vw-380px)]'
            : 'h-[88%] max-h-[700px] aspect-[3/4] max-w-[calc(100vw-680px)]'
        } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        {/* 顶部镜头铭牌 & 排版入口 */}
        <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between z-20 pointer-events-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-stone-950/85 backdrop-blur-md text-white text-xs font-medium border border-stone-800/80 shadow-md">
            <span className="text-amber-400 font-mono font-bold">{activeShot.templateCode}</span>
            <span>{activeShot.name}</span>
            {activeShot.hasHumanPass && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-300 font-bold text-[9px] border border-amber-400/40">
                HUMAN PASS
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {activeShot.revisions.length > 0 && (
              <button
                type="button"
                onClick={onOpenGraphModal}
                className="px-2.5 py-1 rounded-full text-[10px] font-mono bg-white/95 shadow-xs border border-amber-300 text-amber-900 hover:bg-amber-50 font-bold transition flex items-center gap-1 cursor-pointer"
                title="查看版本演化图谱与历史修订"
              >
                <GitBranch className="w-3 h-3 text-amber-600" />
                <span>v{activeShot.revisions[0].revisionNumber}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onHandoffToPoster}
              className="px-2.5 py-1 rounded-full text-[10px] bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-xs border border-amber-600 font-bold transition flex items-center gap-1 cursor-pointer"
              title="将当前镜头送入 Poster Studio 进行文案排版与导出"
            >
              <Palette className="w-3 h-3 text-stone-950" />
              <span>排版此镜</span>
            </button>

            <div className="px-2.5 py-1 rounded-full text-[10px] font-mono bg-stone-950/85 text-stone-200 shadow-xs border border-stone-800 backdrop-blur-md">
              2100 × 2800 (3:4)
            </div>
          </div>
        </div>

        {/* 悬浮品质指示条 */}
        {displayImageUrl && (
          <div className="absolute top-14 left-3.5 right-3.5 flex items-center justify-between z-10 pointer-events-none">
            <div className="px-2.5 py-1 rounded-lg bg-stone-950/85 backdrop-blur-md border border-stone-800 text-white text-[10px] flex items-center gap-1.5 font-mono shadow-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{currentRev?.productionTruth ? 'PRODUCTION TRUTH (物理真值)' : 'AI REFERENCE MESH / PHOTOREAL'}</span>
            </div>

            {currentRev?.score && (
              <div className="px-2.5 py-1 rounded-lg bg-stone-950/85 backdrop-blur-md border border-amber-500/40 text-amber-300 text-[10px] font-bold font-mono flex items-center gap-1 shadow-md">
                <span>SCORE {currentRev.score.overall}</span>
              </div>
            )}
          </div>
        )}

        {/* 视口内容渲染区：根据图片状态展示图像或待渲染指引 */}
        {displayImageUrl ? (
          <div className="w-full h-full relative overflow-hidden flex items-center justify-center bg-stone-950">
            {/* 真正承载图像的 Transform 图层：响应平移与缩放 */}
            <div
              className="w-full h-full flex items-center justify-center transition-transform ease-out duration-75"
              style={{
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                transformOrigin: 'center center'
              }}
            >
              <img
                src={displayImageUrl}
                alt={activeShot.name}
                draggable={false}
                className={`max-w-full max-h-full ${
                  fitMode === 'contain' ? 'object-contain' : 'w-full h-full object-cover'
                }`}
                referrerPolicy="no-referrer"
              />
            </div>

            {/* 图像悬浮操作工具条 (重新渲染 & 签发生产真值) */}
            <div className="absolute bottom-16 left-4 right-4 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-auto">
              <button
                type="button"
                onClick={
                  activeShot.templateCode === 'A00'
                    ? onGenerateSceneMaster
                    : () => onRenderShot(activeShot)
                }
                disabled={isGeneratingMaster || isRenderingShot}
                className="px-3 py-1.5 rounded-xl bg-stone-950/90 hover:bg-stone-900 text-amber-300 border border-stone-700 text-[11px] font-medium transition flex items-center gap-1.5 shadow-xl backdrop-blur-md cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>重新渲染</span>
              </button>

              {currentRev && !currentRev.productionTruth && (
                <button
                  type="button"
                  onClick={() => onConfirmProductionTruth(currentRev)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition flex items-center gap-1.5 shadow-xl cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>人工签发生产真值</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* 待生成占位区 */
          <div className="text-center p-8 space-y-3 z-10">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 shadow-lg">
              <Camera className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-200">
                {activeShot.templateCode === 'A00'
                  ? sceneMaster?.isLocked
                    ? 'A00 空间母版已锁定'
                    : '空间母版待生成'
                  : activeShot.status === 'passed'
                  ? `${activeShot.name} (已通过 L2 裁判门禁)`
                  : `${activeShot.name} 待渲染`}
              </h3>
              <p className="text-xs text-stone-400 mt-1 max-w-sm mx-auto">
                {activeShot.templateCode === 'A00'
                  ? sceneMaster?.isLocked
                    ? `已锁定母版参数快照 (${sceneMaster.promptSnapshotId})，保持家具不动，可继续生成后续镜头。`
                    : '配置好户型原型、风格与摆位蓝图后，点击生成并锁定 A00 空间母版。'
                  : activeShot.status === 'passed'
                  ? `生审分离解耦通过：产品保真分 ${activeShot.revisions[0]?.score?.productIdentity || 96}，摆位保真分 ${activeShot.revisions[0]?.score?.placement || 98}。`
                  : '已继承 A00 空间母版与固定摆位，将基于特定 Camera DNA 与产品聚焦技能生成。'}
              </p>
            </div>

            {/* 实时摄影机参数读数徽章 */}
            <div className="flex items-center justify-center gap-2 text-[10px] font-mono text-amber-300 bg-amber-950/40 px-3 py-1 rounded-lg border border-amber-500/30 mx-auto w-fit">
              <span>焦距 {activeShot.camera.lensMm}mm</span>
              <span>•</span>
              <span>机高 {activeShot.camera.heightCm}cm</span>
              <span>•</span>
              <span>偏角 {activeShot.camera.yawDeg}°</span>
              <span>•</span>
              <span>俯仰 {activeShot.camera.pitchDeg}°</span>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={
                  activeShot.templateCode === 'A00'
                    ? onGenerateSceneMaster
                    : () => onRenderShot(activeShot)
                }
                disabled={isGeneratingMaster || isRenderingShot}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs rounded-xl shadow-lg transition flex items-center gap-2 mx-auto cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                <span>
                  {activeShot.templateCode === 'A00'
                    ? sceneMaster?.isLocked
                      ? '重新合成 A00 空间母版'
                      : '执行 A00 空间母版生成'
                    : isRenderingShot
                    ? '正在渲染与过审...'
                    : activeShot.status === 'passed'
                    ? '重新渲染该镜头'
                    : '执行当前镜头渲染'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* 底部户型与镜头规格参数条 */}
        <div className="absolute bottom-3.5 left-3.5 right-3.5 flex items-center justify-between text-[11px] text-stone-300 bg-stone-950/85 backdrop-blur-md px-3.5 py-2 rounded-xl border border-stone-800/80 shadow-md z-20 pointer-events-auto">
          <div className="flex items-center gap-2">
            <span className="font-medium text-stone-400">户型与意图：</span>
            <span className="font-mono text-amber-400 font-bold">{selectedSpaceCode}</span>
            <span className="text-stone-600">•</span>
            <span className="text-stone-200 truncate max-w-[200px]">{activeShot.intent.name}</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] text-stone-400">
            <span>{activeShot.camera.lensMm}mm</span>
            <span className="text-stone-600">•</span>
            <span>H: {activeShot.camera.heightCm}cm</span>
            <span className="text-stone-600">•</span>
            <span>Yaw: {activeShot.camera.yawDeg}°</span>
          </div>
        </div>

        {/* 专业级交互控制浮条 (Zoom, Pan, Fit, Fullscreen 控制中枢) */}
        <div className="absolute top-14 right-3.5 flex flex-col gap-1.5 z-30 pointer-events-auto">
          <div className="bg-stone-950/90 backdrop-blur-md rounded-xl border border-stone-800 shadow-xl p-1 flex flex-col items-center gap-1 text-stone-300">
            {/* 放大 */}
            <button
              type="button"
              onClick={() => handleZoomChange(0.25)}
              className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-300 hover:text-amber-400 transition cursor-pointer"
              title="放大画面 (支持滚轮)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            {/* 当前比例 / 点击重置 100% */}
            <button
              type="button"
              onClick={handleResetTransform}
              className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold hover:bg-stone-800 text-stone-300 hover:text-amber-400 transition cursor-pointer"
              title="点击复位至自适应比例 (双击画面亦可复位)"
            >
              {Math.round(zoom * 100)}%
            </button>

            {/* 缩小 */}
            <button
              type="button"
              onClick={() => handleZoomChange(-0.25)}
              className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-300 hover:text-amber-400 transition cursor-pointer"
              title="缩小画面 (支持滚轮)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            <div className="w-4 h-[1px] bg-stone-800 my-0.5" />

            {/* 模式切换：自适应完整 (Fit) vs 填满裁切 (Cover) */}
            <button
              type="button"
              onClick={() => setFitMode((m) => (m === 'contain' ? 'cover' : 'contain'))}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                fitMode === 'contain'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'hover:bg-stone-800 text-stone-400'
              }`}
              title={
                fitMode === 'contain'
                  ? '当前：自适应全景展示 (完整无裁切，呈现全部沙发与地面)'
                  : '当前：铺满裁切展示 (填充整个画框)'
              }
            >
              {fitMode === 'contain' ? <Scan className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
            </button>

            {/* 一键复位平移与缩放 */}
            <button
              type="button"
              onClick={handleResetTransform}
              className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-amber-400 transition cursor-pointer"
              title="一键居中复位 (Reset Pan & Zoom)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* 全屏沉浸模式 */}
            <button
              type="button"
              onClick={handleToggleFullscreen}
              className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-amber-400 transition cursor-pointer"
              title={isFullscreen ? '退出全屏 (ESC)' : '进入全屏大图预览'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* 交互说明悬浮微标 */}
          <div className="relative">
            <button
              type="button"
              onMouseEnter={() => setShowHelpHint(true)}
              onMouseLeave={() => setShowHelpHint(false)}
              className="p-1 rounded-full bg-stone-950/80 border border-stone-800 text-stone-400 hover:text-stone-200 transition text-[10px] flex items-center justify-center w-6 h-6 mx-auto cursor-help"
            >
              <Info className="w-3 h-3" />
            </button>
            {showHelpHint && (
              <div className="absolute right-8 top-0 w-48 p-2.5 rounded-xl bg-stone-950/95 text-stone-200 border border-stone-800 text-[10px] shadow-2xl backdrop-blur-md leading-relaxed z-40">
                <div className="font-bold text-amber-400 mb-1 flex items-center gap-1">
                  <Move className="w-3 h-3" />
                  <span>交互式摄影视窗操作</span>
                </div>
                <ul className="space-y-1 text-stone-300 list-disc list-inside">
                  <li>鼠标左键按住拖拽：平移画面</li>
                  <li>鼠标滚轮滑动：平滑放大/缩小</li>
                  <li>双击画面：快速在自适应与放大间切换</li>
                  <li>默认为【全景无裁切】展示</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
