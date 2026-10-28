import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Undo2,
  Trash2,
  PenTool,
  Square,
  Circle,
  Shapes,
  Eraser,
  Eye,
  EyeOff,
  Sparkles,
  Upload,
  Plus,
  Loader2,
  Image as ImageIcon,
  Check,
  Tag,
  Wand2
} from 'lucide-react';

export type InpaintTool = 'brush' | 'rect' | 'ellipse' | 'polygon' | 'eraser';
export type InpaintEditMode = 'modify' | 'erase' | 'replace_with_ref';

export interface InpaintPoint {
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
}

export interface InpaintStroke {
  id: string;
  tool: InpaintTool;
  points: InpaintPoint[];
  width: number; // normalized stroke width (e.g. 0.03 = 3% of width)
  closed?: boolean;
}

export interface InpaintSubmitPayload {
  baseImage: string;
  maskImage?: string;
  annotatedImage?: string;
  maskBounds?: { ymin: number; xmin: number; ymax: number; xmax: number };
  referenceImages: string[];
  instruction: string;
  editMode: InpaintEditMode;
}

export interface CanvasInpaintModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentImageUrl: string;
  shotCode: string;
  roomName?: string;
  styleName?: string;
  productName?: string;
  isSubmitting?: boolean;
  onSubmit: (payload: InpaintSubmitPayload) => Promise<void>;
  theme?: 'dark' | 'light';
}

/**
 * 计算非橡皮擦动作的归一化包围盒 (0-100 百分比)
 */
export function computeMaskBounds(strokes: InpaintStroke[]): { ymin: number; xmin: number; ymax: number; xmax: number } | null {
  const activeStrokes = strokes.filter((s) => s.tool !== 'eraser');
  if (activeStrokes.length === 0) return null;

  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;

  for (const s of activeStrokes) {
    const pad = s.width / 2;
    for (const p of s.points) {
      minX = Math.min(minX, Math.max(0, p.x - pad));
      minY = Math.min(minY, Math.max(0, p.y - pad));
      maxX = Math.max(maxX, Math.min(1, p.x + pad));
      maxY = Math.max(maxY, Math.min(1, p.y + pad));
    }
  }

  if (minX > maxX || minY > maxY) return null;

  return {
    ymin: Math.max(0, Math.min(100, Math.round(minY * 100))),
    xmin: Math.max(0, Math.min(100, Math.round(minX * 100))),
    ymax: Math.max(0, Math.min(100, Math.round(maxY * 100))),
    xmax: Math.max(0, Math.min(100, Math.round(maxX * 100)))
  };
}

/**
 * 绘制笔触集合到目标 Context
 */
export function renderStrokesToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  strokes: InpaintStroke[],
  mode: 'mask' | 'overlay'
) {
  const isMask = mode === 'mask';

  if (isMask) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const s of strokes) {
    if (s.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = isMask ? '#FFFFFF' : 'rgba(239, 68, 68, 0.7)';
      ctx.fillStyle = isMask ? '#FFFFFF' : 'rgba(239, 68, 68, 0.5)';
    }

    const strokePx = Math.max(2, s.width * width);
    ctx.lineWidth = strokePx;

    if (s.tool === 'brush') {
      if (s.points.length === 1) {
        ctx.beginPath();
        ctx.arc(s.points[0].x * width, s.points[0].y * height, strokePx / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (s.points.length > 1) {
        ctx.beginPath();
        s.points.forEach((p, idx) => {
          const px = p.x * width;
          const py = p.y * height;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }
    } else if (s.tool === 'rect' && s.points.length >= 2) {
      const p1 = s.points[0];
      const p2 = s.points[s.points.length - 1];
      const x = Math.min(p1.x, p2.x) * width;
      const y = Math.min(p1.y, p2.y) * height;
      const w = Math.abs(p2.x - p1.x) * width;
      const h = Math.abs(p2.y - p1.y) * height;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    } else if (s.tool === 'ellipse' && s.points.length >= 2) {
      const p1 = s.points[0];
      const p2 = s.points[s.points.length - 1];
      const cx = ((p1.x + p2.x) / 2) * width;
      const cy = ((p1.y + p2.y) / 2) * height;
      const rx = (Math.abs(p2.x - p1.x) / 2) * width;
      const ry = (Math.abs(p2.y - p1.y) / 2) * height;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (s.tool === 'polygon' && s.points.length > 0) {
      ctx.beginPath();
      s.points.forEach((p, idx) => {
        const px = p.x * width;
        const py = p.y * height;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      if (s.closed) {
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();
    }
  }

  ctx.globalCompositeOperation = 'source-over';
}

const PRESET_MATERIALS = [
  { label: '白金天然大理石', url: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=400&q=80' },
  { label: '温润胡桃木饰面', url: 'https://images.unsplash.com/photo-1540518614846-7ede433c4ef0?auto=format&fit=crop&w=400&q=80' },
  { label: '焦糖半苯胺真皮', url: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=400&q=80' },
  { label: '哑光拉丝黑钛金', url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=400&q=80' }
];

const PRESET_PROMPTS = [
  '彻底消除标记区域的杂物/挂画，并根据周围墙面与光影自然平滑补全背景。',
  '将标记物体替换为参考图材质与造型，保持透视、漫反射光影与环境阴影完美融合。',
  '优化此处皮革转角与缝线细节，呈现饱满平整的意式高定工艺质感。',
  '修整该区域地毯与地板接缝，消除浮空感，投射细腻逼真的接触阴影。'
];

export const CanvasInpaintModal: React.FC<CanvasInpaintModalProps> = ({
  isOpen,
  onClose,
  currentImageUrl,
  shotCode,
  roomName = '都会收藏家大宅',
  styleName = '现代美式',
  productName = '主沙发',
  isSubmitting = false,
  onSubmit,
  theme = 'dark'
}) => {
  const isLight = theme === 'light';

  // Canvas refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Drawing state
  const [baseImageElement, setBaseImageElement] = useState<HTMLImageElement | null>(null);
  const [strokes, setStrokes] = useState<InpaintStroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<InpaintStroke | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedTool, setSelectedTool] = useState<InpaintTool>('brush');
  const [brushWidth, setBrushWidth] = useState<number>(0.035); // 3.5%
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [isPreviewMask, setIsPreviewMask] = useState(false);

  // Form / Prompt state
  const [editMode, setEditMode] = useState<InpaintEditMode>('modify');
  const [instruction, setInstruction] = useState<string>('');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);

  // Load Base Image
  useEffect(() => {
    if (!isOpen || !currentImageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setBaseImageElement(img);
    };
    img.src = currentImageUrl;
  }, [isOpen, currentImageUrl]);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setStrokes([]);
      setCurrentStroke(null);
      setIsPreviewMask(false);
      setInstruction('');
      setReferenceImages([]);
    }
  }, [isOpen]);

  // Clipboard paste support for reference images
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (uploadEvt) => {
              const res = uploadEvt.target?.result as string;
              if (res) {
                setReferenceImages((prev) => (prev.length < 3 ? [...prev, res] : prev));
              }
            };
            reader.readAsDataURL(file);
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  // Main Canvas Rendering Loop
  useEffect(() => {
    if (!baseImageElement || !canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = containerRef.current;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const imgW = baseImageElement.naturalWidth || baseImageElement.width || 1024;
    const imgH = baseImageElement.naturalHeight || baseImageElement.height || 768;
    const imgAspect = imgW / imgH;
    const containerAspect = containerW / containerH;

    let targetW = containerW;
    let targetH = containerH;
    if (imgAspect > containerAspect) {
      targetW = containerW;
      targetH = Math.round(containerW / imgAspect);
    } else {
      targetH = containerH;
      targetW = Math.round(containerH * imgAspect);
    }

    canvas.width = targetW;
    canvas.height = targetH;

    ctx.clearRect(0, 0, targetW, targetH);

    if (isPreviewMask) {
      // 蒙版预览模式：黑底白标
      const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;
      renderStrokesToCanvas(ctx, targetW, targetH, allStrokes, 'mask');
    } else {
      // 正常编辑模式：底图 + 半透明红标
      ctx.drawImage(baseImageElement, 0, 0, targetW, targetH);
      const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;
      renderStrokesToCanvas(ctx, targetW, targetH, allStrokes, 'overlay');
    }
  }, [baseImageElement, strokes, currentStroke, isPreviewMask]);

  // Pointer position helper
  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent): InpaintPoint | null => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (isPreviewMask) return;
    const pt = getCanvasCoords(e);
    if (!pt) return;

    if (selectedTool === 'polygon') {
      if (!currentStroke) {
        setIsDrawing(true);
        setCurrentStroke({
          id: `stroke-${Date.now()}`,
          tool: 'polygon',
          points: [pt],
          width: 0.003,
          closed: false
        });
      } else {
        const startPt = currentStroke.points[0];
        const dist = Math.hypot(pt.x - startPt.x, pt.y - startPt.y);
        // 如果点击起点附近（距离 < 2%），自动闭合多边形
        if (currentStroke.points.length >= 3 && dist < 0.03) {
          setStrokes([...strokes, { ...currentStroke, closed: true }]);
          setCurrentStroke(null);
          setIsDrawing(false);
        } else {
          setCurrentStroke({
            ...currentStroke,
            points: [...currentStroke.points, pt]
          });
        }
      }
      return;
    }

    setIsDrawing(true);
    setCurrentStroke({
      id: `stroke-${Date.now()}`,
      tool: selectedTool,
      points: [pt],
      width: selectedTool === 'brush' || selectedTool === 'eraser' ? brushWidth : 0.004
    });
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    const pt = getCanvasCoords(e);
    if (pt) {
      setCursorPos({ x: pt.x, y: pt.y });
    }

    if (!isDrawing || !currentStroke || selectedTool === 'polygon') return;
    if (!pt) return;

    if (selectedTool === 'brush' || selectedTool === 'eraser') {
      setCurrentStroke({
        ...currentStroke,
        points: [...currentStroke.points, pt]
      });
    } else if (selectedTool === 'rect' || selectedTool === 'ellipse') {
      // 保持起点，替换终点
      const startPt = currentStroke.points[0];
      setCurrentStroke({
        ...currentStroke,
        points: [startPt, pt]
      });
    }
  };

  const handlePointerUp = () => {
    if (selectedTool === 'polygon') return;
    if (!isDrawing || !currentStroke) return;
    setIsDrawing(false);
    if (currentStroke.points.length > 0) {
      setStrokes([...strokes, currentStroke]);
    }
    setCurrentStroke(null);
  };

  const handlePolygonDoubleClick = () => {
    if (selectedTool === 'polygon' && currentStroke && currentStroke.points.length >= 3) {
      setStrokes([...strokes, { ...currentStroke, closed: true }]);
      setCurrentStroke(null);
      setIsDrawing(false);
    }
  };

  const handleUndo = () => {
    if (currentStroke) {
      setCurrentStroke(null);
      setIsDrawing(false);
      return;
    }
    setStrokes((prev) => prev.slice(0, -1));
  };

  const handleClearAll = () => {
    setStrokes([]);
    setCurrentStroke(null);
    setIsDrawing(false);
  };

  // Image Upload Handler
  const handleUploadFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, 3 - referenceImages.length);
    fileArray.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const res = e.target?.result as string;
        if (res) {
          setReferenceImages((prev) => (prev.length < 3 ? [...prev, res] : prev));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Export Offscreen Images & Submit
  const handleConfirmSubmit = async () => {
    if (!baseImageElement || isSubmitting) return;

    const imgW = baseImageElement.naturalWidth || 1024;
    const imgH = baseImageElement.naturalHeight || 768;

    // 限制导出长边最大 1536px，既保证大模型空间定位精度，又防止数兆超大 Base64 导致浏览器 Fetch 异常
    const maxDim = 1536;
    let exportW = imgW;
    let exportH = imgH;
    if (exportW > maxDim || exportH > maxDim) {
      if (exportW > exportH) {
        exportH = Math.round(exportH * (maxDim / exportW));
        exportW = maxDim;
      } else {
        exportW = Math.round(exportW * (maxDim / exportH));
        exportH = maxDim;
      }
    }

    // 1. 生成黑白二值蒙版 PNG
    let maskDataUrl: string | undefined = undefined;
    let annotatedDataUrl: string | undefined = undefined;
    const hasStrokes = strokes.length > 0;

    if (hasStrokes) {
      try {
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = exportW;
        maskCanvas.height = exportH;
        const maskCtx = maskCanvas.getContext('2d');
        if (maskCtx) {
          renderStrokesToCanvas(maskCtx, exportW, exportH, strokes, 'mask');
          maskDataUrl = maskCanvas.toDataURL('image/png');
        }
      } catch (err) {
        console.warn('[CanvasInpaintModal] Mask canvas export warning:', err);
      }

      try {
        // 2. 生成带半透明红色涂抹标记的原图定位合成图 (Annotated Guide)
        const guideCanvas = document.createElement('canvas');
        guideCanvas.width = exportW;
        guideCanvas.height = exportH;
        const guideCtx = guideCanvas.getContext('2d');
        if (guideCtx) {
          guideCtx.drawImage(baseImageElement, 0, 0, exportW, exportH);
          renderStrokesToCanvas(guideCtx, exportW, exportH, strokes, 'overlay');
          annotatedDataUrl = guideCanvas.toDataURL('image/jpeg', 0.85);
        }
      } catch (err) {
        console.warn('[CanvasInpaintModal] Annotated guide export warning (e.g. cross-origin tainted canvas fallback):', err);
      }
    }

    const maskBounds = hasStrokes ? computeMaskBounds(strokes) || undefined : undefined;

    await onSubmit({
      baseImage: currentImageUrl,
      maskImage: maskDataUrl,
      annotatedImage: annotatedDataUrl,
      maskBounds,
      referenceImages,
      instruction,
      editMode
    });
  };

  if (!isOpen) return null;

  const activeRegionsCount = strokes.filter((s) => s.tool !== 'eraser').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 select-none">
      <div className={`w-full max-w-7xl h-[94vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden transition-colors ${
        isLight ? 'bg-white border-stone-200 text-stone-900' : 'bg-[#13151f] border-white/10 text-white'
      }`}>
        {/* 1. TOP HEADER */}
        <div className={`h-14 px-5 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'bg-stone-50 border-stone-200' : 'bg-[#181a26] border-white/10'
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm tracking-wide">
                蒙版主体指定与局部重绘 (Mask Target Isolation & Inpainting)
              </h3>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                红色标记 = 待修改/重绘区域
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono px-2 py-1 rounded border ${
              isLight ? 'bg-stone-100 border-stone-200 text-stone-600' : 'bg-black/30 border-white/10 text-neutral-400'
            }`}>
              镜头 {shotCode} · {productName}
            </span>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className={`p-1.5 rounded-xl border transition cursor-pointer ${
                isLight ? 'hover:bg-stone-200 border-stone-300' : 'hover:bg-white/10 border-white/10'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. BODY SPLIT (LEFT: CANVAS STAGE, RIGHT: INSTRUCTION & REFS PANEL) */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* LEFT: CANVAS STAGE */}
          <div className="flex-1 flex flex-col min-w-0 relative bg-black/90 overflow-hidden">
            <div
              ref={containerRef}
              className="flex-1 relative flex items-center justify-center p-3 overflow-hidden cursor-crosshair"
              onDoubleClick={handlePolygonDoubleClick}
            >
              <canvas
                ref={canvasRef}
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
                className="max-w-full max-h-full rounded-xl shadow-2xl border border-white/10"
              />

              {/* Freehand Brush / Eraser Size Ring Cursor */}
              {cursorPos && (selectedTool === 'brush' || selectedTool === 'eraser') && canvasRef.current && (
                <div
                  className="fixed pointer-events-none rounded-full z-50"
                  style={{
                    left: canvasRef.current.getBoundingClientRect().left + cursorPos.x * canvasRef.current.clientWidth,
                    top: canvasRef.current.getBoundingClientRect().top + cursorPos.y * canvasRef.current.clientHeight,
                    width: canvasRef.current.clientWidth * brushWidth,
                    height: canvasRef.current.clientWidth * brushWidth,
                    transform: 'translate(-50%, -50%)',
                    mixBlendMode: 'difference',
                    border: '1.5px solid white'
                  }}
                />
              )}
            </div>

            {/* BOTTOM FLOATING DRAWING TOOLBAR */}
            <div className="p-3 shrink-0 flex items-center justify-center">
              <div className={`flex items-center gap-2 p-1.5 px-3 rounded-2xl border backdrop-blur-xl shadow-2xl ${
                isLight ? 'bg-white/95 border-stone-200' : 'bg-[#181a26]/95 border-white/10'
              }`}>
                {/* Tools */}
                <div className="flex items-center gap-1 pr-2 border-r border-white/10">
                  <button
                    onClick={() => setSelectedTool('brush')}
                    className={`p-2 rounded-xl transition cursor-pointer flex items-center gap-1 text-xs font-bold ${
                      selectedTool === 'brush' ? 'bg-amber-500 text-stone-950 shadow-xs' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                    }`}
                    title="自由涂抹画笔"
                  >
                    <PenTool className="w-3.5 h-3.5" />
                    <span>画笔</span>
                  </button>

                  <button
                    onClick={() => setSelectedTool('rect')}
                    className={`p-2 rounded-xl transition cursor-pointer flex items-center gap-1 text-xs font-bold ${
                      selectedTool === 'rect' ? 'bg-amber-500 text-stone-950 shadow-xs' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                    }`}
                    title="矩形框选"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>矩形</span>
                  </button>

                  <button
                    onClick={() => setSelectedTool('ellipse')}
                    className={`p-2 rounded-xl transition cursor-pointer flex items-center gap-1 text-xs font-bold ${
                      selectedTool === 'ellipse' ? 'bg-amber-500 text-stone-950 shadow-xs' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                    }`}
                    title="椭圆框选"
                  >
                    <Circle className="w-3.5 h-3.5" />
                    <span>椭圆</span>
                  </button>

                  <button
                    onClick={() => setSelectedTool('polygon')}
                    className={`p-2 rounded-xl transition cursor-pointer flex items-center gap-1 text-xs font-bold ${
                      selectedTool === 'polygon' ? 'bg-amber-500 text-stone-950 shadow-xs' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                    }`}
                    title="多边形点选闭合 (点击顶点，双击闭合)"
                  >
                    <Shapes className="w-3.5 h-3.5" />
                    <span>多边形</span>
                  </button>

                  <button
                    onClick={() => setSelectedTool('eraser')}
                    className={`p-2 rounded-xl transition cursor-pointer flex items-center gap-1 text-xs font-bold ${
                      selectedTool === 'eraser' ? 'bg-amber-500 text-stone-950 shadow-xs' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                    }`}
                    title="橡皮擦"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    <span>橡皮擦</span>
                  </button>
                </div>

                {/* Brush Size Slider */}
                <div className="flex items-center gap-2 px-2 text-xs text-neutral-400">
                  <span>画笔大小</span>
                  <input
                    type="range"
                    min="0.005"
                    max="0.12"
                    step="0.005"
                    value={brushWidth}
                    onChange={(e) => setBrushWidth(parseFloat(e.target.value))}
                    className="w-20 accent-amber-500 cursor-pointer"
                  />
                </div>

                <div className="w-px h-4 bg-white/10" />

                {/* Undo & Clear */}
                <button
                  onClick={handleUndo}
                  disabled={strokes.length === 0 && !currentStroke}
                  className="px-2.5 py-1.5 rounded-xl border border-white/10 hover:bg-white/5 disabled:opacity-40 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                  title="撤销上一步操作"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>撤销</span>
                </button>

                <button
                  onClick={handleClearAll}
                  disabled={strokes.length === 0 && !currentStroke}
                  className="p-1.5 rounded-xl border border-white/10 hover:bg-rose-500/20 text-neutral-400 hover:text-rose-400 disabled:opacity-40 transition cursor-pointer"
                  title="清空所有标记"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                <div className="w-px h-4 bg-white/10" />

                {/* Count Badge */}
                <span className="text-xs font-mono font-bold text-amber-400 px-2">
                  已绘制 {activeRegionsCount} 个区域
                </span>

                {/* Mask Preview Toggle */}
                <button
                  onClick={() => setIsPreviewMask(!isPreviewMask)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                    isPreviewMask
                      ? 'bg-purple-600 text-white border-purple-400'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-neutral-200'
                  }`}
                  title="切换黑白二值蒙版预览"
                >
                  {isPreviewMask ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{isPreviewMask ? '关闭预览' : '预览蒙版'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: CONFIGURATION & PROMPT ENGINE */}
          <div className={`w-96 border-l flex flex-col justify-between p-4 overflow-y-auto shrink-0 ${
            isLight ? 'bg-stone-50 border-stone-200' : 'bg-[#181a26] border-white/10'
          }`}>
            <div className="space-y-4">
              {/* Section 1: Edit Mode */}
              <div>
                <label className="text-xs font-bold text-neutral-400 block mb-2">1. 重绘模式选择 (Edit Mode)</label>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/30 border border-white/10">
                  <button
                    onClick={() => setEditMode('modify')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                      editMode === 'modify' ? 'bg-amber-500 text-stone-950 shadow-xs' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    局部修改
                  </button>
                  <button
                    onClick={() => setEditMode('erase')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                      editMode === 'erase' ? 'bg-amber-500 text-stone-950 shadow-xs' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    智能消除
                  </button>
                  <button
                    onClick={() => setEditMode('replace_with_ref')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                      editMode === 'replace_with_ref' ? 'bg-amber-500 text-stone-950 shadow-xs' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    参考替换
                  </button>
                </div>
              </div>

              {/* Section 2: Reference Image Upload (0~3 images) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-neutral-400 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-amber-500" />
                    <span>2. 场景/材质参考图录入</span>
                  </label>
                  <span className="text-[10px] font-mono text-neutral-400">{referenceImages.length} / 3</span>
                </div>

                {/* Upload Box / Thumbnails */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingUpload(true);
                  }}
                  onDragLeave={() => setIsDraggingUpload(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingUpload(false);
                    if (e.dataTransfer.files) handleUploadFiles(e.dataTransfer.files);
                  }}
                  className={`p-3 rounded-2xl border-2 border-dashed transition flex flex-col gap-2.5 ${
                    isDraggingUpload
                      ? 'border-amber-500 bg-amber-500/10'
                      : isLight
                      ? 'border-stone-300 bg-white'
                      : 'border-white/10 bg-black/20'
                  }`}
                >
                  <div className="grid grid-cols-3 gap-2">
                    {referenceImages.map((imgUrl, idx) => (
                      <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-white/15 group">
                        <img src={imgUrl} alt={`Ref ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => setReferenceImages(referenceImages.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white hover:bg-rose-600 transition cursor-pointer"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}

                    {referenceImages.length < 3 && (
                      <label className="aspect-square rounded-xl border border-dashed border-white/20 hover:border-amber-500/50 flex flex-col items-center justify-center gap-1 text-neutral-400 hover:text-amber-400 transition cursor-pointer">
                        <Upload className="w-4 h-4" />
                        <span className="text-[10px]">批量上传</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files) handleUploadFiles(e.target.files);
                          }}
                        />
                      </label>
                    )}
                  </div>
                  <div className="text-[10px] text-neutral-400 leading-tight">
                    💡 支持拖拽或截图直接粘贴（Ctrl/Cmd+V）
                  </div>
                </div>

                {/* Preset Material Badges */}
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="text-[10px] text-neutral-400 py-0.5">内置库:</span>
                  {PRESET_MATERIALS.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        if (referenceImages.length < 3 && !referenceImages.includes(preset.url)) {
                          setReferenceImages([...referenceImages, preset.url]);
                        }
                      }}
                      className="px-2 py-0.5 rounded-full text-[10px] bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white transition cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 3: Prompt Engine */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-neutral-400 flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-amber-500" />
                    <span>3. 设计逻辑指令 (Prompt Engine)</span>
                  </label>
                  <span className="text-[10px] text-neutral-400">选区微调</span>
                </div>

                <textarea
                  rows={4}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder={
                    editMode === 'erase'
                      ? '输入消除说明，例如：彻底消除选区中的挂画与落地灯，智能无缝补全背景墙面与光影...'
                      : '输入局部重绘指令，例如：将标记区域沙发扶手线条修整为圆弧饱满造型，保持原材质皮革纹理...'
                  }
                  className={`w-full p-3 rounded-xl border text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none leading-relaxed ${
                    isLight
                      ? 'bg-white border-stone-300 text-stone-900 placeholder:text-stone-400'
                      : 'bg-black/30 border-white/10 text-white placeholder:text-neutral-500'
                  }`}
                />

                {/* Quick Instruction Pills */}
                <div className="mt-2 space-y-1">
                  <span className="text-[10px] text-neutral-400 block">快捷指令预设：</span>
                  <div className="flex flex-col gap-1">
                    {PRESET_PROMPTS.map((promptText, idx) => (
                      <button
                        key={idx}
                        onClick={() => setInstruction(promptText)}
                        className="text-left p-1.5 rounded-lg text-[11px] bg-white/5 hover:bg-white/10 border border-white/5 text-neutral-300 hover:text-white transition cursor-pointer line-clamp-1"
                      >
                        {promptText}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ACTION FOOTER */}
            <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-3">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-xs font-bold text-neutral-300 transition cursor-pointer"
              >
                取消
              </button>

              <button
                onClick={handleConfirmSubmit}
                disabled={isSubmitting || (!instruction.trim() && strokes.length === 0 && referenceImages.length === 0)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>AI 正在执行局部重绘...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>保存并开始局部重绘</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
