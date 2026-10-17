import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  X,
  Maximize2,
  RefreshCw,
  Sliders,
  Check,
  ChevronRight,
  Info,
  Ratio,
  XCircle,
  Scan,
  Compass
} from 'lucide-react';
import { ImageAspectRatio, RenderResolution, StylePreset, SpacePreset } from '../../../types/spaceStudio';

export interface OutpaintParams {
  mode: 'uniform' | 'horizontal' | 'vertical' | 'custom';
  scale: number;
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
  promptSupplement: string;
  paddedImageDataUrl: string;
  maskDataUrl: string;
  targetAspectRatio: ImageAspectRatio;
}

interface CanvasOutpaintOverlayProps {
  currentImageUrl: string;
  imageAspect?: number;
  shotCode: string;
  roomName?: string;
  styleName?: string;
  stylePreset?: StylePreset;
  spacePreset?: SpacePreset;
  currentPositivePrompt?: string;
  productName?: string;
  productMaterial?: string;
  isGenerating?: boolean;
  onConfirmOutpaint: (params: OutpaintParams) => Promise<void>;
  onCancel: () => void;
  onCancelRendering?: () => void;
  theme?: 'dark' | 'light';
}

export const CanvasOutpaintOverlay: React.FC<CanvasOutpaintOverlayProps> = ({
  currentImageUrl,
  imageAspect,
  shotCode,
  roomName = '都会收藏家大宅',
  styleName = '都会收藏家',
  stylePreset,
  spacePreset,
  currentPositivePrompt,
  productName,
  productMaterial,
  isGenerating = false,
  onConfirmOutpaint,
  onCancel,
  onCancelRendering,
  theme = 'dark'
}) => {
  const isLight = theme === 'light';

  // 原图真实宽高比（默认 16:9，优先从 imageAspect 或实际加载中获取）
  const [sourceAspect, setSourceAspect] = useState<number>(imageAspect && imageAspect > 0 ? imageAspect : 16 / 9);

  useEffect(() => {
    if (imageAspect && !isNaN(imageAspect) && imageAspect > 0) {
      setSourceAspect(imageAspect);
    }
  }, [imageAspect]);

  // 扩展比例：0 代表不扩展，0.25 代表单侧扩展 25% 原图尺寸
  const [padTop, setPadTop] = useState<number>(0.25);
  const [padBottom, setPadBottom] = useState<number>(0.25);
  const [padLeft, setPadLeft] = useState<number>(0.25);
  const [padRight, setPadRight] = useState<number>(0.25);
  const [activeMode, setActiveMode] = useState<'uniform' | 'horizontal' | 'vertical' | 'custom'>('uniform');

  // 基于当前图像实时空间、风格与材质 DNA 智能生成专属延展引导词
  const dynamicInitialPrompt = useMemo(() => {
    const materials = stylePreset?.materialSystem || [];
    const signatures = spacePreset?.signatureFeatures || [];
    const fragments = stylePreset?.promptFragments || [];

    // 天花/顶面延展
    const ceilingKey =
      signatures.find(s => /天花|吊顶|顶部|大梁|挑高/.test(s)) ||
      fragments.find(f => /天花|吊顶|顶面|漫反射|吊灯/.test(f)) ||
      '天花板石膏线条与顶面环境漫反射灯光';

    // 墙面/两侧立面采光延展
    const wallKey =
      materials.find(m => /窗|墙|木饰|石材|格栅|护墙板|大理石/.test(m)) ||
      signatures.find(s => /落地窗|采光|庭院|横厅|立面/.test(s)) ||
      '两侧大落地窗通透采光与背景墙饰面';

    // 地面/地毯延展
    const floorKey =
      materials.find(m => /地毯|地板|地台|地砖|石材/.test(m)) ||
      '下方完整复古羊毛地毯全貌与地面透视';

    const prodDesc = productName ? `${productName}${productMaterial ? `(${productMaterial})` : ''}` : '';
    return `自然延展${ceilingKey}、${wallKey}、${floorKey}${prodDesc ? `，严密锁定中心${prodDesc}与既有空间陈列一致` : ''}`;
  }, [stylePreset, spacePreset, productName, productMaterial]);

  // 延展提示词输入状态
  const [promptSupplement, setPromptSupplement] = useState<string>(dynamicInitialPrompt);

  useEffect(() => {
    if (dynamicInitialPrompt) {
      setPromptSupplement(dynamicInitialPrompt);
    }
  }, [dynamicInitialPrompt]);

  // 拖拽手柄交互状态
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; padT: number; padB: number; padL: number; padR: number }>({
    x: 0,
    y: 0,
    padT: 0.25,
    padB: 0.25,
    padL: 0.25,
    padR: 0.25
  });

  const workspaceRef = useRef<HTMLDivElement>(null);
  const [workspaceSize, setWorkspaceSize] = useState<{ width: number; height: number }>({ width: 900, height: 500 });

  useEffect(() => {
    if (!workspaceRef.current) return;
    const updateSize = () => {
      if (workspaceRef.current) {
        const rect = workspaceRef.current.getBoundingClientRect();
        if (rect.width > 50 && rect.height > 50) {
          setWorkspaceSize({ width: rect.width, height: rect.height });
        }
      }
    };
    updateSize();
    const ro = new ResizeObserver(() => updateSize());
    ro.observe(workspaceRef.current);
    window.addEventListener('resize', updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // 快捷预设切换
  const handleApplyPreset = (mode: 'uniform_125' | 'uniform_150' | 'uniform_200' | 'horizontal_150' | 'vertical_150' | 'reset') => {
    switch (mode) {
      case 'uniform_125':
        setActiveMode('uniform');
        setPadTop(0.125);
        setPadBottom(0.125);
        setPadLeft(0.125);
        setPadRight(0.125);
        break;
      case 'uniform_150':
        setActiveMode('uniform');
        setPadTop(0.25);
        setPadBottom(0.25);
        setPadLeft(0.25);
        setPadRight(0.25);
        break;
      case 'uniform_200':
        setActiveMode('uniform');
        setPadTop(0.5);
        setPadBottom(0.5);
        setPadLeft(0.5);
        setPadRight(0.5);
        break;
      case 'horizontal_150':
        setActiveMode('horizontal');
        setPadTop(0);
        setPadBottom(0);
        setPadLeft(0.25);
        setPadRight(0.25);
        break;
      case 'vertical_150':
        setActiveMode('vertical');
        setPadTop(0.25);
        setPadBottom(0.25);
        setPadLeft(0);
        setPadRight(0);
        break;
      case 'reset':
        setActiveMode('custom');
        setPadTop(0);
        setPadBottom(0);
        setPadLeft(0);
        setPadRight(0);
        break;
    }
  };

  // 拖拽手柄处理
  const handleMouseDownHandle = (e: React.MouseEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveHandle(handle);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      padT: padTop,
      padB: padBottom,
      padL: padLeft,
      padR: padRight
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!activeHandle) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const sensitivity = 0.0025; // 鼠标位移转换为 padding 百分比的灵敏度

      setActiveMode('custom');

      if (activeHandle === 'top') {
        const next = Math.max(0, Math.min(0.75, dragStartRef.current.padT - dy * sensitivity));
        setPadTop(next);
      } else if (activeHandle === 'bottom') {
        const next = Math.max(0, Math.min(0.75, dragStartRef.current.padB + dy * sensitivity));
        setPadBottom(next);
      } else if (activeHandle === 'left') {
        const next = Math.max(0, Math.min(0.75, dragStartRef.current.padL - dx * sensitivity));
        setPadLeft(next);
      } else if (activeHandle === 'right') {
        const next = Math.max(0, Math.min(0.75, dragStartRef.current.padR + dx * sensitivity));
        setPadRight(next);
      } else if (activeHandle === 'nw' || activeHandle === 'ne' || activeHandle === 'sw' || activeHandle === 'se') {
        // 四角对角手柄：等比四周扩展
        const dist = Math.hypot(dx, dy) * (dx < 0 || dy < 0 ? 1 : 1) * sensitivity;
        const delta = (Math.abs(dx) + Math.abs(dy)) * sensitivity * 0.5;
        const base = dragStartRef.current.padT;
        const next = Math.max(0, Math.min(0.75, base + (dy < 0 || dx < 0 ? delta : -delta * 0.5)));
        setPadTop(next);
        setPadBottom(next);
        setPadLeft(next);
        setPadRight(next);
      }
    };

    const handleMouseUp = () => {
      setActiveHandle(null);
    };

    if (activeHandle) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeHandle]);

  // 计算综合扩图倍率与预期画幅
  const totalScale = Number((1 + (padLeft + padRight + padTop + padBottom) / 2).toFixed(2));

  // 目标延展画幅真实宽高比：原图比例 * (宽扩展倍率 / 高扩展倍率)
  const targetAspect = sourceAspect * ((1 + padLeft + padRight) / (1 + padTop + padBottom));

  // 根据真实 targetAspect 自适应匹配最接近的标准画幅代码
  const getClosestAspectRatio = (ratio: number): ImageAspectRatio => {
    const candidates: { label: ImageAspectRatio; val: number }[] = [
      { label: '21:9', val: 21 / 9 },
      { label: '16:9', val: 16 / 9 },
      { label: '3:2', val: 3 / 2 },
      { label: '4:3', val: 4 / 3 },
      { label: '1:1', val: 1 / 1 },
      { label: '4:5', val: 4 / 5 },
      { label: '3:4', val: 3 / 4 },
      { label: '2:3', val: 2 / 3 },
      { label: '9:16', val: 9 / 16 }
    ];
    let closest = candidates[0];
    let minDiff = Math.abs(ratio - candidates[0].val);
    for (const c of candidates) {
      const diff = Math.abs(ratio - c.val);
      if (diff < minDiff) {
        minDiff = diff;
        closest = c;
      }
    }
    return closest.label;
  };
  const estimatedAspect: ImageAspectRatio = getClosestAspectRatio(targetAspect);

  // 点击确定：离屏 Canvas 绘制原图与遮罩
  const handleConfirm = async () => {
    if (isGenerating) return;

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('无法读取当前图片用于扩图'));
        img.src = currentImageUrl;
      });

      const origW = img.naturalWidth || 1536;
      const origH = img.naturalHeight || 2048;

      const pL = Math.round(origW * padLeft);
      const pR = Math.round(origW * padRight);
      const pT = Math.round(origH * padTop);
      const pB = Math.round(origH * padBottom);

      const targetW = origW + pL + pR;
      const targetH = origH + pT + pB;

      // 1. 生成带透明延展边框的底图
      const padCanvas = document.createElement('canvas');
      padCanvas.width = targetW;
      padCanvas.height = targetH;
      const ctx = padCanvas.getContext('2d');
      if (!ctx) throw new Error('无法初始化 Canvas 2D 上下文');

      // 清空为透明底并居中绘制原图
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(img, pL, pT, origW, origH);
      const paddedImageDataUrl = padCanvas.toDataURL('image/png');

      // 2. 生成黑白蒙版 (原图区域为黑 0，扩展外延区域为白 255)
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = targetW;
      maskCanvas.height = targetH;
      const maskCtx = maskCanvas.getContext('2d');
      if (!maskCtx) throw new Error('无法初始化 Mask Canvas 上下文');

      maskCtx.fillStyle = '#FFFFFF';
      maskCtx.fillRect(0, 0, targetW, targetH);
      maskCtx.fillStyle = '#000000';
      maskCtx.fillRect(pL, pT, origW, origH);
      const maskDataUrl = maskCanvas.toDataURL('image/png');

      await onConfirmOutpaint({
        mode: activeMode,
        scale: totalScale,
        paddingTop: padTop,
        paddingBottom: padBottom,
        paddingLeft: padLeft,
        paddingRight: padRight,
        promptSupplement,
        paddedImageDataUrl,
        maskDataUrl,
        targetAspectRatio: estimatedAspect
      });
    } catch (err: any) {
      console.error('Outpaint canvas composition failed:', err);
      alert(`扩图底图准备失败: ${err?.message || err}`);
    }
  };

  // 计算展示区中心内缩百分比
  // padding 会转化为内侧原图相对于外围扩展框的视觉占比
  const innerWidthPct = 100 / (1 + padLeft + padRight);
  const innerHeightPct = 100 / (1 + padTop + padBottom);
  const innerLeftPct = (padLeft / (1 + padLeft + padRight)) * 100;
  const innerTopPct = (padTop / (1 + padTop + padBottom)) * 100;

  // 按照可用空间与 targetAspect 计算外框绝对像素尺寸，确保 100% 居中、自适应且绝对不塌陷
  const paddingMargin = 32;
  const availW = Math.max(200, workspaceSize.width - paddingMargin * 2);
  const availH = Math.max(150, workspaceSize.height - paddingMargin * 2);
  const availRatio = availW / availH;

  let frameW = availW;
  let frameH = availH;
  if (availRatio > targetAspect) {
    // 高度受限
    frameH = availH;
    frameW = frameH * targetAspect;
  } else {
    // 宽度受限
    frameW = availW;
    frameH = frameW / targetAspect;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between pointer-events-auto select-none bg-stone-950/92 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-150">
      {/* 1. 顶部控制与倍率参数读数条 */}
      <div className={`flex items-center justify-between gap-3 px-4 py-2 rounded-2xl border shadow-xl backdrop-blur-md max-w-2xl w-full ${
        isLight ? 'bg-white/95 border-amber-400/40 text-stone-800' : 'bg-stone-900/90 border-amber-500/40 text-amber-200'
      }`}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Maximize2 className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <span>智能扩图视窗调节</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">
                {totalScale}x
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-stone-800 text-stone-300 border border-white/10 font-mono">
                {estimatedAspect}
              </span>
            </h4>
            <p className={`text-[10px] ${isLight ? 'text-stone-500' : 'text-stone-400'}`}>
              按住外框手柄自由外拉，或点击下方预设一键四周扩图
            </p>
          </div>
        </div>

        {/* 快捷方向预设药丸 */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleApplyPreset('uniform_125')}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
              padTop === 0.125 && padLeft === 0.125
                ? 'bg-amber-500 text-black border-amber-400 shadow-xs'
                : isLight ? 'bg-stone-100 text-stone-600 border-stone-200 hover:text-stone-900' : 'bg-black/40 text-neutral-300 border-white/10 hover:text-white'
            }`}
          >
            四周 1.25x
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset('uniform_150')}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
              padTop === 0.25 && padLeft === 0.25
                ? 'bg-amber-500 text-black border-amber-400 shadow-xs'
                : isLight ? 'bg-stone-100 text-stone-600 border-stone-200 hover:text-stone-900' : 'bg-black/40 text-neutral-300 border-white/10 hover:text-white'
            }`}
          >
            四周 1.5x (推荐)
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset('horizontal_150')}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
              padTop === 0 && padLeft === 0.25
                ? 'bg-amber-500 text-black border-amber-400 shadow-xs'
                : isLight ? 'bg-stone-100 text-stone-600 border-stone-200 hover:text-stone-900' : 'bg-black/40 text-neutral-300 border-white/10 hover:text-white'
            }`}
          >
            左右外延
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset('vertical_150')}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
              padTop === 0.25 && padLeft === 0
                ? 'bg-amber-500 text-black border-amber-400 shadow-xs'
                : isLight ? 'bg-stone-100 text-stone-600 border-stone-200 hover:text-stone-900' : 'bg-black/40 text-neutral-300 border-white/10 hover:text-white'
            }`}
          >
            上下拉高
          </button>
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={isGenerating}
          className="p-1 rounded-lg text-stone-400 hover:text-white transition cursor-pointer"
          title="退出扩图"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 2. 交互式画框与手柄拖拽工作区 (Canvas Crop & Expand Handles) */}
      <div ref={workspaceRef} className="flex-1 w-full min-h-0 flex items-center justify-center p-3 relative overflow-hidden">
        {/* 外围即将延展的新视窗虚线边框 - 严格约束为 targetAspect 宽高比 */}
        <div
          style={{
            width: `${Math.round(frameW)}px`,
            height: `${Math.round(frameH)}px`
          }}
          className="relative border-2 border-dashed border-amber-400/90 rounded-xl overflow-visible flex items-center justify-center bg-amber-500/10 shadow-2xl transition-all duration-150"
        >
          {/* 延展网格纹理提示背景 */}
          <div
            className="absolute inset-0 opacity-25 pointer-events-none rounded-xl"
            style={{
              backgroundImage: `radial-gradient(circle, #f59e0b 1.2px, transparent 1.2px)`,
              backgroundSize: '16px 16px'
            }}
          />

          {/* 顶部延展提示 (当 padTop > 0 时显示) */}
          {padTop > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: `${innerLeftPct}%`,
                width: `${innerWidthPct}%`,
                height: `${innerTopPct}%`
              }}
              className="flex items-center justify-center pointer-events-none z-20"
            >
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/30 border border-amber-400/50 text-[10px] font-bold text-amber-300 backdrop-blur-md flex items-center gap-1 shadow-md">
                <span>⬆ 顶部延展</span>
                <span className="font-mono">+{Math.round(padTop * 100)}%</span>
                <span className="text-amber-200/70 text-[9px]">(天花板/吊顶)</span>
              </span>
            </div>
          )}

          {/* 底部延展提示 (当 padBottom > 0 时显示) */}
          {padBottom > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: `${innerLeftPct}%`,
                width: `${innerWidthPct}%`,
                height: `${(padBottom / (1 + padTop + padBottom)) * 100}%`
              }}
              className="flex items-center justify-center pointer-events-none z-20"
            >
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/30 border border-amber-400/50 text-[10px] font-bold text-amber-300 backdrop-blur-md flex items-center gap-1 shadow-md">
                <span>⬇ 底部延展</span>
                <span className="font-mono">+{Math.round(padBottom * 100)}%</span>
                <span className="text-amber-200/70 text-[9px]">(地面/地毯)</span>
              </span>
            </div>
          )}

          {/* 左侧延展提示 (当 padLeft > 0 时显示) */}
          {padLeft > 0 && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: `${innerTopPct}%`,
                width: `${innerLeftPct}%`,
                height: `${innerHeightPct}%`
              }}
              className="flex items-center justify-center pointer-events-none z-20"
            >
              <span className="px-2 py-0.5 rounded-full bg-amber-500/30 border border-amber-400/50 text-[10px] font-bold text-amber-300 backdrop-blur-md flex items-center gap-1 shadow-md">
                <span>⬅ 左侧延展</span>
                <span className="font-mono">+{Math.round(padLeft * 100)}%</span>
              </span>
            </div>
          )}

          {/* 右侧延展提示 (当 padRight > 0 时显示) */}
          {padRight > 0 && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: `${innerTopPct}%`,
                width: `${(padRight / (1 + padLeft + padRight)) * 100}%`,
                height: `${innerHeightPct}%`
              }}
              className="flex items-center justify-center pointer-events-none z-20"
            >
              <span className="px-2 py-0.5 rounded-full bg-amber-500/30 border border-amber-400/50 text-[10px] font-bold text-amber-300 backdrop-blur-md flex items-center gap-1 shadow-md">
                <span>➡ 右侧延展</span>
                <span className="font-mono">+{Math.round(padRight * 100)}%</span>
              </span>
            </div>
          )}

          {/* 内层保持区域：原始真实摄影图 (比例与原图 100% 吻合，严丝合缝无黑边) */}
          <div
            style={{
              width: `${innerWidthPct}%`,
              height: `${innerHeightPct}%`,
              left: `${innerLeftPct}%`,
              top: `${innerTopPct}%`
            }}
            className="absolute border-2 border-emerald-400 rounded-lg overflow-hidden shadow-2xl transition-all duration-75 flex items-center justify-center bg-stone-900"
          >
            <img
              src={currentImageUrl}
              alt="Source Image"
              onLoad={(e) => {
                const { naturalWidth, naturalHeight } = e.currentTarget;
                if (naturalWidth && naturalHeight) {
                  setSourceAspect(naturalWidth / naturalHeight);
                }
              }}
              className="w-full h-full object-cover pointer-events-none block"
            />
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/85 text-emerald-300 border border-emerald-400/50 text-[10px] font-bold flex items-center gap-1.5 backdrop-blur-md shadow-md pointer-events-none z-10 whitespace-nowrap">
              <Check className="w-3 h-3 text-emerald-400" />
              <span>原图保护区 (保持不变)</span>
            </div>
          </div>

          {/* 8 个方向交互手柄 (8 Expand Handles) */}
          {/* 1. 顶部手柄 */}
          <div
            onMouseDown={(e) => handleMouseDownHandle(e, 'top')}
            className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-4 rounded-full bg-amber-500 border-2 border-stone-900 shadow-md cursor-ns-resize hover:scale-125 transition flex items-center justify-center z-30"
            title="按住上下拖拽调节顶部延展"
          >
            <div className="w-2.5 h-0.5 bg-black rounded-full" />
          </div>

          {/* 2. 底部手柄 */}
          <div
            onMouseDown={(e) => handleMouseDownHandle(e, 'bottom')}
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-4 rounded-full bg-amber-500 border-2 border-stone-900 shadow-md cursor-ns-resize hover:scale-125 transition flex items-center justify-center z-30"
            title="按住上下拖拽调节底部延展"
          >
            <div className="w-2.5 h-0.5 bg-black rounded-full" />
          </div>

          {/* 3. 左侧手柄 */}
          <div
            onMouseDown={(e) => handleMouseDownHandle(e, 'left')}
            className="absolute top-1/2 -left-2 -translate-y-1/2 w-4 h-8 rounded-full bg-amber-500 border-2 border-stone-900 shadow-md cursor-ew-resize hover:scale-125 transition flex items-center justify-center z-30"
            title="按住左右拖拽调节左侧延展"
          >
            <div className="w-0.5 h-2.5 bg-black rounded-full" />
          </div>

          {/* 4. 右侧手柄 */}
          <div
            onMouseDown={(e) => handleMouseDownHandle(e, 'right')}
            className="absolute top-1/2 -right-2 -translate-y-1/2 w-4 h-8 rounded-full bg-amber-500 border-2 border-stone-900 shadow-md cursor-ew-resize hover:scale-125 transition flex items-center justify-center z-30"
            title="按住左右拖拽调节右侧延展"
          >
            <div className="w-0.5 h-2.5 bg-black rounded-full" />
          </div>

          {/* 5. 四个对角手柄 (等比向外外扩) */}
          <div
            onMouseDown={(e) => handleMouseDownHandle(e, 'nw')}
            className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-amber-400 border-2 border-stone-900 shadow-md cursor-nwse-resize hover:scale-125 transition z-30"
            title="按住四角拖拽四周等比外扩"
          />
          <div
            onMouseDown={(e) => handleMouseDownHandle(e, 'ne')}
            className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-amber-400 border-2 border-stone-900 shadow-md cursor-nesw-resize hover:scale-125 transition z-30"
            title="按住四角拖拽四周等比外扩"
          />
          <div
            onMouseDown={(e) => handleMouseDownHandle(e, 'sw')}
            className="absolute -bottom-2 -left-2 w-4 h-4 rounded-full bg-amber-400 border-2 border-stone-900 shadow-md cursor-nesw-resize hover:scale-125 transition z-30"
            title="按住四角拖拽四周等比外扩"
          />
          <div
            onMouseDown={(e) => handleMouseDownHandle(e, 'se')}
            className="absolute -bottom-2 -right-2 w-4 h-4 rounded-full bg-amber-400 border-2 border-stone-900 shadow-md cursor-nwse-resize hover:scale-125 transition z-30"
            title="按住四角拖拽四周等比外扩"
          />
        </div>
      </div>

      {/* 3. 底部延展提示词输入与操作执行条 */}
      <div className={`p-3 rounded-2xl border shadow-2xl max-w-2xl w-full space-y-2 backdrop-blur-xl ${
        isLight ? 'bg-white/95 border-stone-200 text-stone-800' : 'bg-stone-900/95 border-white/10 text-stone-100'
      }`}>
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-amber-500 flex items-center gap-1">
              <Compass className="w-3.5 h-3.5" />
              <span>空间延展引导词 (基于 {styleName} · {roomName}):</span>
            </span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium flex items-center gap-1">
              <Check className="w-2.5 h-2.5" />
              <span>已实时继承原图DNA与光影</span>
            </span>
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            <button
              type="button"
              onClick={() => setPromptSupplement((prev) => `${prev}，延展两侧全景落地窗大视野采光`)}
              className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 cursor-pointer"
            >
              + 落地窗
            </button>
            <button
              type="button"
              onClick={() => setPromptSupplement((prev) => `${prev}，延展天花板吊顶与环境漫射灯带`)}
              className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 cursor-pointer"
            >
              + 天花吊顶
            </button>
            <button
              type="button"
              onClick={() => setPromptSupplement((prev) => `${prev}，完整展现下方高端地毯全貌与地面光影`)}
              className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 cursor-pointer"
            >
              + 地毯全貌
            </button>
          </div>
        </div>

        <input
          type="text"
          value={promptSupplement}
          onChange={(e) => setPromptSupplement(e.target.value)}
          placeholder="可在此微调扩图引导词，AI 将在严格继承原图家具与光影的基础上向外延展..."
          className={`w-full px-3 py-1.5 rounded-xl border text-xs outline-none transition ${
            isLight
              ? 'bg-stone-50 border-stone-300 text-stone-800 focus:border-amber-500'
              : 'bg-black/40 border-white/15 text-stone-200 focus:border-amber-400'
          }`}
        />

        <div className="flex items-center justify-between pt-1 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isGenerating}
            className={`px-4 py-2 rounded-xl text-xs font-medium border transition cursor-pointer ${
              isLight ? 'border-stone-200 hover:bg-stone-100 text-stone-600' : 'border-white/10 hover:bg-white/10 text-neutral-300'
            }`}
          >
            退出扩图
          </button>

          <div className="flex items-center gap-2">
            {isGenerating && onCancelRendering && (
              <button
                type="button"
                onClick={onCancelRendering}
                className="px-3 py-2 rounded-xl border border-rose-500/40 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-lg"
              >
                <XCircle className="w-3.5 h-3.5 text-rose-400" />
                <span>打断扩图</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleConfirm}
              disabled={isGenerating}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-xs font-bold shadow-lg shadow-amber-500/20 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>AI 大模型正在扩图延展中...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>确认生成扩图 ({totalScale}x)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
