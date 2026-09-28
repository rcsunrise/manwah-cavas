import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getAuthHeaders } from '../../utils/apiUtils';
import {
  Paintbrush,
  Eraser,
  Square,
  Undo2,
  Redo2,
  Trash2,
  Eye,
  EyeOff,
  Sparkles,
  X,
  Check,
  ChevronRight,
  Loader2,
  Download,
  PlusCircle,
  RefreshCw,
  Sliders,
  ShieldCheck,
  Split,
  Layers,
  Wand2,
  AlertCircle
} from 'lucide-react';
import { downloadHighResImage } from '../../utils/downloadUtils';

export interface ImageInpaintModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  sceneIndex?: number;
  screenTitle?: string;
  coreSellingPoint?: string;
  initialPrompt?: string;
  aspectRatio?: string;
  selectedModel?: string;
  selectedResolution?: string;
  productDna?: any;
  currentVersionCode?: string;
  onApplyResult: (result: {
    imageUrl: string;
    prompt: string;
    model: string;
    action: 'add_new_node' | 'replace_current';
    maskPreviewUrl?: string;
  }) => void;
}

type ToolMode = 'brush' | 'box' | 'eraser';
type InpaintIntent = 'redraw' | 'erase';

const INPAINT_PRESETS = [
  { label: '🧹 彻底消除并平滑补全背景', text: '从画面中彻底消除标记区域的物体或杂物，根据周围木地板、地毯、背景墙的材质与漫反射光影，智能无缝补全背景，不留任何涂抹痕迹。' },
  { label: '🪑 更换为轻奢极简边几', text: '将标记的物体替换为极简意式轻奢圆形金属边几，台面为温润哑光黑金大理石，金属细腿纤细优雅，与主沙发风格和谐呼应。' },
  { label: '🪴 替换为现代室内绿植', text: '将标记区域替换为高株现代极简室内阔叶绿植盆栽（如千年木或琴叶榕），水泥哑光质感花盆，为空间增添自然生机与呼吸感。' },
  { label: '🛋️ 修正该局部扶手/造型', text: '保持沙发整体风格，将标记区域的扶手线条与靠背转角修整为流畅饱满的现代圆弧造型，皮革纹理细腻紧致，缝线平整高级。' },
  { label: '💡 优化此处光影与阴影', text: '优化该区域的光影投射，产生更柔和自然的电影级落地窗漫反射采光，地毯投下细腻通透的环境闭塞阴影（Ambient Occlusion）。' }
];

export const ImageInpaintModal: React.FC<ImageInpaintModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  sceneIndex = 1,
  screenTitle = '分镜画面',
  coreSellingPoint = '',
  initialPrompt = '',
  aspectRatio = '3:4',
  selectedModel = 'gpt-image-2-c',
  selectedResolution = '2K',
  productDna,
  currentVersionCode = 'V002',
  onApplyResult
}) => {
  // Tool state
  const [tool, setTool] = useState<ToolMode>('brush');
  const [brushSize, setBrushSize] = useState<number>(36);
  const [inpaintIntent, setInpaintIntent] = useState<InpaintIntent>('redraw');
  const [showMask, setShowMask] = useState<boolean>(true);
  const [prompt, setPrompt] = useState<string>('');
  const [modelToUse, setModelToUse] = useState<string>(
    selectedModel.includes('gpt') ? selectedModel : 'gpt-image-2-c'
  );
  const [resolutionToUse, setResolutionToUse] = useState<string>(selectedResolution || '2K');
  const [preserveDna, setPreserveDna] = useState<boolean>(true);

  // Generation & Results state
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [comparePosition, setComparePosition] = useState<number>(50); // 0-100 for slider
  const [hasDrawnMask, setHasDrawnMask] = useState<boolean>(false);

  // Canvas Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null);

  // Drawing state
  const isDrawingRef = useRef<boolean>(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const redoStackRef = useRef<ImageData[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Image natural dimensions
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imgNaturalDim, setImgNaturalDim] = useState({ width: 1024, height: 1024 });

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setGeneratedImageUrl(null);
      setGenError(null);
      setHasDrawnMask(false);
      undoStackRef.current = [];
      redoStackRef.current = [];
      setCanUndo(false);
      setCanRedo(false);
      setPrompt('');
      if (selectedModel && (selectedModel.includes('gpt') || selectedModel.includes('gemini'))) {
        setModelToUse(selectedModel);
      } else {
        setModelToUse('gpt-image-2-c');
      }
    }
  }, [isOpen, selectedModel]);

  // Sync mask canvas size with displayed image size
  const syncCanvasSize = useCallback(() => {
    const img = imageRef.current;
    const canvas = maskCanvasRef.current;
    const cursorCanvas = cursorCanvasRef.current;
    if (!img || !canvas || !cursorCanvas) return;

    const rect = img.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      if (canvas.width !== Math.round(rect.width) || canvas.height !== Math.round(rect.height)) {
        canvas.width = Math.round(rect.width);
        canvas.height = Math.round(rect.height);
        cursorCanvas.width = Math.round(rect.width);
        cursorCanvas.height = Math.round(rect.height);
      }
    }
  }, []);

  const handleImageLoaded = () => {
    if (imageRef.current) {
      setImgNaturalDim({
        width: imageRef.current.naturalWidth || 1024,
        height: imageRef.current.naturalHeight || 1024
      });
      setImageLoaded(true);
      setTimeout(syncCanvasSize, 50);
    }
  };

  useEffect(() => {
    window.addEventListener('resize', syncCanvasSize);
    return () => window.removeEventListener('resize', syncCanvasSize);
  }, [syncCanvasSize]);

  // Save undo snapshot
  const saveUndoState = () => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStackRef.current.push(data);
    if (undoStackRef.current.length > 20) undoStackRef.current.shift();
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
    setHasDrawnMask(true);
  };

  const handleUndo = () => {
    const canvas = maskCanvasRef.current;
    if (!canvas || undoStackRef.current.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    redoStackRef.current.push(current);

    const previous = undoStackRef.current.pop();
    if (previous) {
      ctx.putImageData(previous, 0, 0);
    }
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
  };

  const handleRedo = () => {
    const canvas = maskCanvasRef.current;
    if (!canvas || redoStackRef.current.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStackRef.current.push(current);

    const next = redoStackRef.current.pop();
    if (next) {
      ctx.putImageData(next, 0, 0);
    }
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
  };

  const handleClearMask = () => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    saveUndoState();
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasDrawnMask(false);
  };

  // Get pointer coordinates relative to mask canvas
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  // Render brush cursor circle on cursorCanvas
  const updateCursorCircle = (x: number, y: number) => {
    const cursorCanvas = cursorCanvasRef.current;
    if (!cursorCanvas) return;
    const ctx = cursorCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
    if (tool === 'brush' || tool === 'eraser') {
      ctx.beginPath();
      ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      ctx.strokeStyle = tool === 'eraser' ? '#FFFFFF' : '#EF4444';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Center dot
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fillStyle = tool === 'eraser' ? '#FFFFFF' : '#EF4444';
      ctx.fill();
    }
  };

  // Mouse interaction handlers for drawing mask
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (generatedImageUrl) return; // Don't draw if reviewing result
    saveUndoState();
    isDrawingRef.current = true;
    const { x, y } = getCanvasCoords(e);
    startPosRef.current = { x, y };

    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = brushSize;
      ctx.beginPath();
      ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (tool === 'brush') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(239, 68, 68, 0.45)'; // Translucent Red for high visibility
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
      ctx.lineWidth = brushSize;
      ctx.beginPath();
      ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);
    updateCursorCircle(x, y);

    if (!isDrawingRef.current) return;
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (tool === 'brush') {
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (tool === 'eraser') {
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (tool === 'box' && startPosRef.current) {
      // For box preview, redraw from the last undo snapshot + draw preview box
      const lastState = undoStackRef.current[undoStackRef.current.length - 1];
      if (lastState) {
        ctx.putImageData(lastState, 0, 0);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
      const bx = Math.min(startPosRef.current.x, x);
      const by = Math.min(startPosRef.current.y, y);
      const bw = Math.abs(x - startPosRef.current.x);
      const bh = Math.abs(y - startPosRef.current.y);
      ctx.fillRect(bx, by, bw, bh);
    }
  };

  const handleMouseUp = () => {
    isDrawingRef.current = false;
    startPosRef.current = null;
    const canvas = maskCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.closePath();
    }
  };

  const handleMouseLeave = () => {
    isDrawingRef.current = false;
    startPosRef.current = null;
    const cursorCanvas = cursorCanvasRef.current;
    if (cursorCanvas) {
      const ctx = cursorCanvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
    }
  };

  // Export binary mask PNG compliant with OpenAI and Gemini API standards
  // In OpenAI /v1/images/edits: transparent area (alpha = 0) represents the area to be edited!
  // And opaque area (alpha = 255) represents the area to keep unchanged!
  const generateExportMask = (): string | null => {
    const displayedCanvas = maskCanvasRef.current;
    const img = imageRef.current;
    if (!displayedCanvas || !img) return null;

    // Create an offscreen canvas at the original image's natural dimensions for pristine pixel accuracy
    const naturalW = img.naturalWidth || displayedCanvas.width;
    const naturalH = img.naturalHeight || displayedCanvas.height;

    const offscreen = document.createElement('canvas');
    offscreen.width = naturalW;
    offscreen.height = naturalH;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;

    // 1. Draw the user-painted mask scaled to natural dimensions
    ctx.drawImage(displayedCanvas, 0, 0, naturalW, naturalH);

    // 2. Read the pixel data
    const imgData = ctx.getImageData(0, 0, naturalW, naturalH);
    const data = imgData.data;
    let editPixelCount = 0;

    // 3. Convert mask so that:
    // User-marked pixels (where alpha > 20) -> transparent (alpha = 0) for inpainting
    // Untouched pixels -> opaque black or white (r=0, g=0, b=0, a=255)
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha > 20) {
        // This is the area user wants to EDIT/REPLACE
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0; // Transparent!
        editPixelCount++;
      } else {
        // This is the area to KEEP
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255; // Opaque!
      }
    }

    if (editPixelCount === 0) {
      return null;
    }

    ctx.putImageData(imgData, 0, 0);
    return offscreen.toDataURL('image/png');
  };

  // Trigger GPT / Model Inpainting
  const handleExecuteInpaint = async () => {
    const maskDataUrl = generateExportMask();
    if (!maskDataUrl) {
      setGenError('请在画面上先用画笔或矩形框涂抹出需要修改/删除的局部区域。');
      return;
    }

    setIsGenerating(true);
    setGenError(null);

    try {
      // Build inpainting prompt
      let instruction = prompt.trim();
      if (!instruction) {
        if (inpaintIntent === 'erase') {
          instruction = '彻底擦除并消除蒙版所标局部区域内的物体与杂物，根据周遭环境无缝补全背景。';
        } else {
          instruction = '对蒙版所标局部区域进行精细化重绘，保持光影氛围、材质与周边空间自然融合。';
        }
      }

      let fullPrompt = `[局部重绘编辑指令 (Inpainting / Image Edit)]:\n${instruction}`;
      if (inpaintIntent === 'erase') {
        fullPrompt += `\n- 任务目标: 消除擦除标记局部，利用周围地毯、地板、墙体材质纹理与光照智能无缝补全背景，严禁残留突兀杂色。`;
      } else {
        fullPrompt += `\n- 任务目标: 仅重绘替换标记区域内的内容，严禁改动未标记区域的家具本体、主视觉结构与既有空间构图。`;
      }

      if (preserveDna && productDna) {
        const mat = Array.isArray(productDna.materials) ? productDna.materials.join('、') : (productDna.materials || '');
        fullPrompt += `\n\n[产品核心主角 DNA 严格保持]:\n- 核心品类: ${productDna.category || '高端功能家居'}\n- 材质与触感: ${mat || '顶级真皮'}\n- 画面中产品主体的造型设计、包边线、主色调必须与参考原图严格一致。`;
      }

      fullPrompt += `\n- 影棚摄影规范: 50mm 商业大师级镜头，自然通透窗光与晚霞暖调，光影与地毯闭塞阴影完美平滑过渡。`;

      const payload = {
        model: modelToUse,
        generationIntent: 'image_edit',
        images: [imageUrl],
        mask: maskDataUrl,
        prompt: fullPrompt,
        aspectRatio: aspectRatio || '3:4',
        resolution: resolutionToUse || '2K'
      };

      const authHeaders = await getAuthHeaders();
      const response = await fetch('/api/gateway/generate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          ...payload,
          userUuid: authHeaders['x-user-uuid'] || undefined
        })
      });

      const textResp = await response.text();
      let data: any;
      try {
        data = JSON.parse(textResp.trim());
      } catch {
        throw new Error(`服务器返回异常响应 (${response.status}): ${textResp.slice(0, 100)}`);
      }

      if (!response.ok || data?.error) {
        const errMsg = data?.error?.message || data?.error || data?.message || `模型重绘生成失败 (HTTP ${response.status})`;
        throw new Error(errMsg);
      }

      let extractedUrl = data?.imageUrl;
      if (!extractedUrl && Array.isArray(data?.images) && data.images.length > 0) {
        const img = data.images[0];
        const rawData = typeof img === 'string' ? img : img.data;
        const mime = (typeof img === 'object' && img.mimeType) ? img.mimeType : 'image/png';
        extractedUrl = rawData.startsWith('data:') || rawData.startsWith('http') ? rawData : `data:${mime};base64,${rawData}`;
      } else if (!extractedUrl && data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
        const part = data.candidates[0].content.parts[0].inlineData;
        const mime = part.mimeType || 'image/png';
        extractedUrl = `data:${mime};base64,${part.data}`;
      }

      if (!extractedUrl) {
        throw new Error('模型未成功返回有效图像数据，请调整涂抹选区或提示词后重试。');
      }

      setGeneratedImageUrl(extractedUrl);
    } catch (err: any) {
      console.error('Inpainting failed:', err);
      setGenError(err?.message || '局部重绘请求异常，请检查网络或更换模型重试');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn select-none">
      <div className="w-full max-w-6xl h-[92vh] max-h-[920px] bg-[#1C1A18] text-white rounded-3xl shadow-2xl border border-stone-800 flex flex-col overflow-hidden relative">
        {/* Top Header */}
        <div className="h-14 px-6 border-b border-stone-800/80 bg-[#252220] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-[#B28C5A] text-white flex items-center justify-center shadow-md">
              <Paintbrush className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-stone-100">
                  画面局部标记重绘工作台 (Inpainting Studio)
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#B28C5A]/20 text-amber-300 border border-[#B28C5A]/40">
                  第 {sceneIndex} 屏 · {currentVersionCode}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono text-stone-400 bg-stone-800 border border-stone-700">
                  {aspectRatio} · {resolutionToUse}
                </span>
              </div>
              <p className="text-[11px] text-stone-400">
                涂抹或框选需要修改的局部区域，指定修改要求，调用 GPT 图像模型完成无缝消除或置换重绘
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 text-stone-400 hover:text-white rounded-full hover:bg-stone-800 transition-colors"
              title="关闭"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Body: Stage (Left) & Controls (Right) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Canvas Stage */}
          <div className="flex-1 bg-[#121110] relative flex flex-col items-center justify-center p-4 overflow-hidden">
            {/* Floating Canvas Toolbar (Top of Canvas) */}
            {!generatedImageUrl && (
              <div className="absolute top-4 z-20 flex items-center gap-2 bg-[#252220]/95 backdrop-blur-md px-3.5 py-1.5 rounded-2xl border border-stone-700/80 shadow-xl">
                {/* Tool selectors */}
                <div className="flex items-center gap-1 border-r border-stone-700 pr-2">
                  <button
                    onClick={() => setTool('brush')}
                    className={`p-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all ${
                      tool === 'brush'
                        ? 'bg-[#B28C5A] text-white shadow-sm font-bold'
                        : 'text-stone-400 hover:text-white hover:bg-stone-800'
                    }`}
                    title="画笔涂抹遮罩"
                  >
                    <Paintbrush className="w-4 h-4" />
                    <span>涂抹标记</span>
                  </button>

                  <button
                    onClick={() => setTool('box')}
                    className={`p-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all ${
                      tool === 'box'
                        ? 'bg-[#B28C5A] text-white shadow-sm font-bold'
                        : 'text-stone-400 hover:text-white hover:bg-stone-800'
                    }`}
                    title="矩形快速框选"
                  >
                    <Square className="w-4 h-4" />
                    <span>矩形框选</span>
                  </button>

                  <button
                    onClick={() => setTool('eraser')}
                    className={`p-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all ${
                      tool === 'eraser'
                        ? 'bg-[#B28C5A] text-white shadow-sm font-bold'
                        : 'text-stone-400 hover:text-white hover:bg-stone-800'
                    }`}
                    title="橡皮擦"
                  >
                    <Eraser className="w-4 h-4" />
                    <span>橡皮擦</span>
                  </button>
                </div>

                {/* Brush size slider */}
                {(tool === 'brush' || tool === 'eraser') && (
                  <div className="flex items-center gap-2 border-r border-stone-700 pr-2.5 pl-1">
                    <span className="text-[10px] text-stone-400 font-mono">粗细: {brushSize}px</span>
                    <input
                      type="range"
                      min={8}
                      max={90}
                      value={brushSize}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="w-20 accent-amber-500 cursor-pointer h-1.5 bg-stone-700 rounded-lg"
                    />
                  </div>
                )}

                {/* Undo / Redo / Clear */}
                <div className="flex items-center gap-1 border-r border-stone-700 pr-2">
                  <button
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    title="撤销 (Ctrl+Z)"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={!canRedo}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    title="重做 (Ctrl+Y)"
                  >
                    <Redo2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleClearMask}
                    disabled={!hasDrawnMask}
                    className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-900/30 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    title="清空标记"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Mask visibility toggle */}
                <button
                  onClick={() => setShowMask(!showMask)}
                  className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors ${
                    showMask ? 'text-amber-400 hover:bg-amber-950/40' : 'text-stone-500 hover:bg-stone-800'
                  }`}
                  title={showMask ? '隐藏遮罩显示' : '显示遮罩涂抹'}
                >
                  {showMask ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  <span className="text-[10px]">{showMask ? '显示标记' : '隐藏标记'}</span>
                </button>
              </div>
            )}

            {/* Canvas Stage Viewport */}
            <div
              ref={containerRef}
              className="relative max-w-full max-h-full flex items-center justify-center rounded-2xl overflow-hidden shadow-2xl border border-stone-800 bg-[#0A0908]"
              style={{
                aspectRatio: aspectRatio === '16:9' ? '16/9' : aspectRatio === '4:3' ? '4/3' : aspectRatio === '1:1' ? '1/1' : '3/4'
              }}
            >
              {/* 1. Base Image */}
              <img
                ref={imageRef}
                src={imageUrl}
                alt="原图"
                onLoad={handleImageLoaded}
                className="max-h-[76vh] max-w-full object-contain pointer-events-none select-none block"
              />

              {/* 2. Interactive Mask Canvas (overlaid exactly on top of image) */}
              {!generatedImageUrl && (
                <canvas
                  ref={maskCanvasRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseLeave}
                  className={`absolute inset-0 w-full h-full cursor-crosshair z-10 transition-opacity duration-150 ${
                    showMask ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                />
              )}

              {/* 3. Cursor Preview Canvas */}
              {!generatedImageUrl && (
                <canvas
                  ref={cursorCanvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none z-15"
                />
              )}

              {/* 4. Before / After Comparison Slider if inpainting generated successfully */}
              {generatedImageUrl && (
                <div className="absolute inset-0 z-25 overflow-hidden select-none">
                  {/* Result image on bottom */}
                  <img
                    src={generatedImageUrl}
                    alt="重绘结果"
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  />

                  {/* Original image clipped on top */}
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{ clipPath: `inset(0 ${100 - comparePosition}% 0 0)` }}
                  >
                    <img
                      src={imageUrl}
                      alt="原图对比"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    />
                    <div className="absolute top-3 left-3 px-2 py-1 bg-black/70 backdrop-blur-md rounded-lg text-[10px] font-bold text-stone-300">
                      原图 (Original)
                    </div>
                  </div>

                  <div className="absolute top-3 right-3 px-2 py-1 bg-emerald-950/80 border border-emerald-500/40 backdrop-blur-md rounded-lg text-[10px] font-bold text-emerald-300">
                    重绘后 ({modelToUse.replace('openai/', '')})
                  </div>

                  {/* Draggable Divider Line */}
                  <div
                    className="absolute top-0 bottom-0 w-1 bg-amber-400 cursor-ew-resize z-30 flex items-center justify-center shadow-lg"
                    style={{ left: `${comparePosition}%` }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const onMove = (moveEvt: MouseEvent) => {
                        if (!containerRef.current) return;
                        const rect = containerRef.current.getBoundingClientRect();
                        const pos = Math.max(0, Math.min(100, ((moveEvt.clientX - rect.left) / rect.width) * 100));
                        setComparePosition(pos);
                      };
                      const onUp = () => {
                        window.removeEventListener('mousemove', onMove);
                        window.removeEventListener('mouseup', onUp);
                      };
                      window.addEventListener('mousemove', onMove);
                      window.addEventListener('mouseup', onUp);
                    }}
                  >
                    <div className="w-7 h-7 rounded-full bg-amber-400 text-stone-900 flex items-center justify-center shadow-xl text-[10px] font-bold">
                      <Split className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              )}

              {/* Generating Overlay Indicator */}
              {isGenerating && (
                <div className="absolute inset-0 z-30 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-[#B28C5A] text-white flex items-center justify-center shadow-2xl animate-pulse">
                    <Wand2 className="w-7 h-7 animate-spin" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-stone-100 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                      正在调用 {modelToUse} 进行局部重绘生成...
                    </h4>
                    <p className="text-xs text-stone-400 mt-1">
                      AI 正在识别蒙版区域、融合周边环境并进行材质光影无缝重绘
                    </p>
                  </div>
                  <div className="px-3 py-1 bg-stone-800/90 rounded-full border border-stone-700 text-[10px] font-mono text-amber-300">
                    高画质工程渲染通道 · 请稍候
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Status Hint */}
            <div className="mt-3 text-[11px] text-stone-500 flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500/80 inline-block" />
                红半透明涂抹区为局部重绘受控范围
              </span>
              <span>·</span>
              <span>支持多段涂抹或框选合并</span>
              {generatedImageUrl && (
                <>
                  <span>·</span>
                  <span className="text-amber-400 font-bold">按住滑块左右拖动可对比重绘前后效果</span>
                </>
              )}
            </div>
          </div>

          {/* Right Control & Parameter Panel */}
          <div className="w-96 bg-[#211F1D] border-l border-stone-800/80 p-5 flex flex-col overflow-y-auto space-y-4 shrink-0">
            {/* Section 1: Intent Mode */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-300 block">局部重绘模式</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setInpaintIntent('redraw')}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    inpaintIntent === 'redraw'
                      ? 'border-amber-500/60 bg-amber-500/10 text-amber-300 font-bold'
                      : 'border-stone-800 bg-stone-900/60 text-stone-400 hover:border-stone-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs mb-0.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>局部重绘 / 替换</span>
                  </div>
                  <p className="text-[10px] font-normal opacity-80 leading-tight">
                    将标记区域替换为指定新家具或调整款式
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setInpaintIntent('erase')}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    inpaintIntent === 'erase'
                      ? 'border-amber-500/60 bg-amber-500/10 text-amber-300 font-bold'
                      : 'border-stone-800 bg-stone-900/60 text-stone-400 hover:border-stone-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs mb-0.5">
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>消除局部 / 补全</span>
                  </div>
                  <p className="text-[10px] font-normal opacity-80 leading-tight">
                    彻底移除标记物体并智能无缝填补背景
                  </p>
                </button>
              </div>
            </div>

            {/* Section 2: Inpaint Prompt Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-300">
                  修改说明与重绘提示词 (Prompt)
                </label>
                <span className="text-[10px] text-stone-500">
                  {inpaintIntent === 'erase' ? '消除说明' : '重绘指定'}
                </span>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  inpaintIntent === 'erase'
                    ? '例如：彻底移除此处杂物/单人椅，智能补齐地毯与木地板，保持平滑光影...'
                    : '例如：将标记的单人沙发替换为现代极简圆形黑色大理石边几，造型优雅奢华...'
                }
                rows={4}
                className="w-full bg-[#181615] border border-stone-700/80 rounded-xl p-2.5 text-xs text-stone-100 placeholder-stone-500 outline-none focus:border-amber-500/80 leading-relaxed font-sans"
              />

              {/* Quick Prompt Presets */}
              <div className="space-y-1 pt-1">
                <span className="text-[10px] text-stone-500 font-bold block">快捷修改灵感推荐：</span>
                <div className="flex flex-wrap gap-1.5">
                  {INPAINT_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPrompt(preset.text)}
                      className="px-2 py-1 rounded-lg text-[10px] bg-stone-800/80 hover:bg-stone-700 text-stone-300 border border-stone-700/60 transition-colors text-left"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 3: AI Engine Selection */}
            <div className="space-y-1.5 pt-2 border-t border-stone-800">
              <label className="text-xs font-bold text-stone-300 flex items-center justify-between">
                <span>生成引擎与模型</span>
                <span className="text-[10px] font-mono text-amber-400">已配置 VectorEngine API</span>
              </label>

              <select
                value={modelToUse}
                onChange={(e) => setModelToUse(e.target.value)}
                className="w-full bg-[#181615] border border-stone-700 rounded-xl px-2.5 py-2 text-xs text-stone-200 outline-none focus:border-amber-500 font-mono"
              >
                <optgroup label="OpenAI GPT 图像大模型 (支持极高保真重绘)">
                  <option value="gpt-image-2-c">gpt-image-2-c (推荐 · 商业级图像重绘旗舰)</option>
                  <option value="gpt-image-2">gpt-image-2 (标准生图与图像编辑)</option>
                  <option value="gpt-image-1.5">gpt-image-1.5 (极速图像编辑)</option>
                </optgroup>
                <optgroup label="Google Gemini 视觉多模态模型">
                  <option value="gemini-3.1-flash-image">gemini-3.1-flash-image (高速推理与无缝修补)</option>
                  <option value="google/gemini-3-pro-image-preview">gemini-3-pro-image-preview (专业级细节)</option>
                </optgroup>
              </select>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="text-[10px] text-stone-400 block mb-1">分辨率规格</span>
                  <select
                    value={resolutionToUse}
                    onChange={(e) => setResolutionToUse(e.target.value)}
                    className="w-full bg-[#181615] border border-stone-700 rounded-lg px-2 py-1.5 text-xs text-stone-200 outline-none"
                  >
                    <option value="1K">1K (标准速度)</option>
                    <option value="2K">2K (超高清商业级)</option>
                    <option value="4K">4K (巨幕精修)</option>
                  </select>
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 block mb-1">DNA 保护策略</span>
                  <label className="flex items-center gap-1.5 py-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preserveDna}
                      onChange={(e) => setPreserveDna(e.target.checked)}
                      className="accent-amber-500 rounded"
                    />
                    <span className="text-xs text-stone-300 font-medium">锁定核心产品DNA</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Error Message if any */}
            {genError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <span className="leading-tight">{genError}</span>
              </div>
            )}

            {/* Section 4: Primary Actions */}
            <div className="mt-auto pt-3 border-t border-stone-800 space-y-2">
              {!generatedImageUrl ? (
                <button
                  type="button"
                  onClick={handleExecuteInpaint}
                  disabled={isGenerating}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-[#B28C5A] to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-900 font-bold text-xs shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-stone-900" />
                      <span>正在调用模型进行重绘...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4 text-stone-900" />
                      <span>调用 GPT 模型开始局部重绘生成</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>局部重绘已就绪，请选择应用方式：</span>
                  </div>

                  {/* Option A: Add new node side-by-side on canvas (Cowart Canvas style) */}
                  <button
                    type="button"
                    onClick={() => {
                      onApplyResult({
                        imageUrl: generatedImageUrl,
                        prompt: prompt || '局部重绘',
                        model: modelToUse,
                        action: 'add_new_node'
                      });
                      onClose();
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-[#B28C5A] hover:bg-[#9E7A4A] text-white font-bold text-xs shadow-md flex items-center justify-center gap-1.5 transition-all"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>加入画布为新版本分镜 (如 V003)</span>
                  </button>

                  {/* Option B: Replace current node image */}
                  <button
                    type="button"
                    onClick={() => {
                      onApplyResult({
                        imageUrl: generatedImageUrl,
                        prompt: prompt || '局部重绘',
                        model: modelToUse,
                        action: 'replace_current'
                      });
                      onClose();
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium text-xs border border-stone-700 flex items-center justify-center gap-1.5 transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-stone-400" />
                    <span>直接覆盖当前节点画面</span>
                  </button>

                  {/* Direct download */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        if (generatedImageUrl) {
                          await downloadHighResImage(generatedImageUrl, `MW_重绘结果_第${sceneIndex}屏_${Date.now()}.png`);
                        }
                      }}
                      className="flex-1 py-1.5 rounded-lg bg-stone-800/80 hover:bg-stone-700 text-stone-300 text-[10px] font-bold border border-stone-700 flex items-center justify-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>直接下载重绘图</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setGeneratedImageUrl(null);
                        setGenError(null);
                      }}
                      className="py-1.5 px-2.5 rounded-lg bg-stone-800/80 hover:bg-stone-700 text-stone-400 hover:text-white text-[10px] font-medium border border-stone-700 flex items-center gap-1"
                    >
                      <span>继续微调标记</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
