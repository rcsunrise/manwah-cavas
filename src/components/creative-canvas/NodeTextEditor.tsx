import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Type,
  Plus,
  Trash2,
  Save,
  X,
  Bold,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Move,
  Download,
  AlertTriangle,
  Sparkles,
  Layers,
  Check,
  Eye,
  EyeOff,
  Wand2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ExternalLink,
  Image as ImageIcon,
  Palette,
  Sliders,
  ShieldCheck,
  RefreshCw,
  Upload,
  Layers as LayersIcon,
  Cpu,
  Compass,
  Activity
} from 'lucide-react';
import { CanvasTextLayer } from '../../types/creativeCanvas';
import { downloadHighResImage } from '../../utils/downloadUtils';

interface NodeTextEditorProps {
  imageUrl: string;
  cleanBackgroundUrl?: string;
  repairSuccess?: boolean;
  repairMessage?: string;
  naturalWidth: number;
  naturalHeight: number;
  initialTextLayers: CanvasTextLayer[];
  screenTitle?: string;
  sceneIndex?: number;
  coreSellingPoint?: string;
  onSaveVersion: (newImageUrl: string, cleanBgUrl: string, updatedLayers: CanvasTextLayer[]) => void;
  onOpenPosterStudio?: () => void;
  onClose: () => void;
}

const COMMON_FONTS = [
  { name: '方正宋体 / 奢品衬线 (Songti SC / Serif)', value: '"Songti SC", "Source Han Serif SC", "Noto Serif SC", "Playfair Display", SimSun, serif' },
  { name: '思源黑体 / 现代无衬线 (Noto Sans SC)', value: '"Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif' },
  { name: '默认无衬线 (System UI)', value: 'system-ui, -apple-system, sans-serif' },
  { name: '华文楷体 / 东方书法 (KaiTi)', value: 'STKaiti, KaiTi, "KaiTi SC", serif' },
  { name: '精工大标宋 / 奢华雕版', value: '"STSong", "Songti SC", serif' },
  { name: '粗体展棒 / 压感重体', value: '"Impact", "Arial Black", sans-serif' }
];

const PRESET_COLORS = [
  { label: '极夜曜黑', value: '#1C1917' },
  { label: '暖木深咖', value: '#382E26' },
  { label: '雅致灰棕', value: '#5A524A' },
  { label: '敏华奢金', value: '#B28C5A' },
  { label: '纯粹雪白', value: '#FFFFFF' },
  { label: '羊脂米白', value: '#F7F4EF' },
  { label: '温润暖沙', value: '#E5E0D8' },
  { label: '琥珀金棕', value: '#D97706' }
];

function isDarkColor(hex?: string): boolean {
  if (!hex) return false;
  const clean = hex.replace('#', '');
  let r = 255, g = 255, b = 255;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else if (clean.length === 6) {
    r = parseInt(clean.substring(0, 2), 16);
    g = parseInt(clean.substring(2, 4), 16);
    b = parseInt(clean.substring(4, 6), 16);
  }
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum < 150;
}

const LUXURY_COPY_PRESETS = [
  '敏华头等舱 · 意式奢品美学',
  '人体工学减压 · 德国静音双电机',
  '进口头层牛皮 · 45D高回弹海绵',
  '160°无级随心躺 · 尊享云端坐感',
  '限时特惠 · 尊享全国免费入户安装'
];

export const NodeTextEditor: React.FC<NodeTextEditorProps> = ({
  imageUrl,
  cleanBackgroundUrl,
  repairSuccess: initialRepairSuccess = true,
  repairMessage: initialRepairMessage,
  naturalWidth: propNaturalWidth,
  naturalHeight: propNaturalHeight,
  initialTextLayers,
  screenTitle = '敏华海报设计',
  sceneIndex = 1,
  coreSellingPoint,
  onSaveVersion,
  onOpenPosterStudio,
  onClose
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const naturalWidth = propNaturalWidth || 1024;
  const naturalHeight = propNaturalHeight || 1365;

  // Background states
  const [customCleanBg, setCustomCleanBg] = useState<string | undefined>(cleanBackgroundUrl);
  const [useCleanBg, setUseCleanBg] = useState<boolean>(true);
  const [isErasingBg, setIsErasingBg] = useState(false);
  const [repairSuccess, setRepairSuccess] = useState(initialRepairSuccess);
  const [repairMessage, setRepairMessage] = useState(initialRepairMessage);

  // VectorEngine Layer 1 & 2 Decoupled Intelligence States
  const [aestheticSpec, setAestheticSpec] = useState<any>(null);
  const [telemetry, setTelemetry] = useState<any>(null);
  const [isReplicating, setIsReplicating] = useState(false);
  const [showReplicateMenu, setShowReplicateMenu] = useState(false);

  // Zoom & Pan state
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 600, height: 800 });

  // Effective Background URL
  const effectiveCleanBg = customCleanBg || cleanBackgroundUrl;
  const activeBgUrl = useCleanBg && effectiveCleanBg ? effectiveCleanBg : imageUrl;
  const isTrulySeparated = Boolean(effectiveCleanBg && effectiveCleanBg !== imageUrl);

  // Layers state
  const [layers, setLayers] = useState<CanvasTextLayer[]>(() => {
    if (initialTextLayers && initialTextLayers.length > 0) {
      return initialTextLayers.map(l => ({ ...l }));
    }
    // 关键防重影门禁：若当前底图不是真正的纯净无字底图（即底图已包含 AI 烘焙文字），
    // 严禁自动生成默认的「把美好留给每一次独处」等额外图层，避免与原图叠字粘连！
    if (!isTrulySeparated) {
      return [];
    }
    // 仅在纯净底图下提供意式高奢模板文字
    const w = naturalWidth;
    const h = naturalHeight;
    return [
      {
        id: `layer-${Date.now()}-1`,
        text: screenTitle || '把美好留给每一次独处',
        x: Math.round(w * 0.08),
        y: Math.round(h * 0.14),
        width: Math.round(w * 0.55),
        height: Math.round(h * 0.09),
        fontSize: Math.round(w * 0.052),
        fontWeight: 'bold',
        fontFamily: '"Songti SC", "Source Han Serif SC", "Noto Serif SC", "Playfair Display", SimSun, serif',
        color: '#1C1917',
        lineHeight: 1.2,
        letterSpacing: 1,
        textAlign: 'left'
      },
      {
        id: `layer-${Date.now()}-2`,
        text: coreSellingPoint || '从自然线条到身体支撑的意式设计',
        x: Math.round(w * 0.08),
        y: Math.round(h * 0.25),
        width: Math.round(w * 0.55),
        height: Math.round(h * 0.06),
        fontSize: Math.round(w * 0.026),
        fontWeight: 'normal',
        fontFamily: '"Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif',
        color: '#5A524A',
        lineHeight: 1.2,
        letterSpacing: 0,
        textAlign: 'left'
      }
    ];
  });

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(layers[0]?.id || null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [export3To4, setExport3To4] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState(false);

  // Measure container dimensions for responsive canvas display
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setContainerSize({ width: rect.width, height: rect.height });
        }
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Compute uniform fit scale
  const aspect = naturalWidth / naturalHeight;
  const padding = 48;
  const availableW = Math.max(300, containerSize.width - padding);
  const availableH = Math.max(400, containerSize.height - padding);

  let baseRenderW = availableW;
  let baseRenderH = availableW / aspect;

  if (baseRenderH > availableH) {
    baseRenderH = availableH;
    baseRenderW = availableH * aspect;
  }

  const currentW = baseRenderW * zoomLevel;
  const currentH = baseRenderH * zoomLevel;
  const scaleX = currentW / naturalWidth;
  const scaleY = currentH / naturalHeight;

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  // Update layer
  const updateSelectedLayer = (updates: Partial<CanvasTextLayer>) => {
    if (!selectedLayerId) return;
    setLayers(prev =>
      prev.map(l => (l.id === selectedLayerId ? { ...l, ...updates } : l))
    );
  };

  // Add layer
  const handleAddLayer = () => {
    const w = naturalWidth;
    const h = naturalHeight;
    const newLayer: CanvasTextLayer = {
      id: `layer-${Date.now()}`,
      text: '点击修改文案',
      x: Math.round(w * 0.15),
      y: Math.round(h * 0.45),
      width: Math.round(w * 0.7),
      height: Math.round(h * 0.08),
      fontSize: Math.round(w * 0.04),
      fontWeight: 'bold',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#FFFFFF',
      lineHeight: 1.2,
      letterSpacing: 0,
      textAlign: 'center'
    };
    setLayers(prev => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
  };

  // Delete layer
  const handleDeleteLayer = (id: string) => {
    setLayers(prev => prev.filter(l => l.id !== id));
    if (selectedLayerId === id) {
      setSelectedLayerId(null);
    }
  };

  // Dragging & Resizing Layer Logic
  type ResizeDirection = 'e' | 'w' | 's' | 'n' | 'se' | 'sw' | 'ne' | 'nw';

  const draggingRef = useRef<{
    layerId: string;
    startPointerX: number;
    startPointerY: number;
    startX: number;
    startY: number;
  } | null>(null);

  const resizingRef = useRef<{
    layerId: string;
    direction: ResizeDirection;
    startPointerX: number;
    startPointerY: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  const [activeResizeDirection, setActiveResizeDirection] = useState<ResizeDirection | null>(null);

  const handlePointerDownLayer = (e: React.PointerEvent, layer: CanvasTextLayer) => {
    if (resizingRef.current) return;
    if (editingLayerId === layer.id) return;
    e.stopPropagation();
    setSelectedLayerId(layer.id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    draggingRef.current = {
      layerId: layer.id,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startX: layer.x,
      startY: layer.y
    };
  };

  const handlePointerMoveLayer = (e: React.PointerEvent) => {
    if (resizingRef.current) return;
    if (!draggingRef.current) return;
    const { layerId, startPointerX, startPointerY, startX, startY } = draggingRef.current;

    const deltaPointerX = e.clientX - startPointerX;
    const deltaPointerY = e.clientY - startPointerY;

    const deltaSourceX = Math.round(deltaPointerX / scaleX);
    const deltaSourceY = Math.round(deltaPointerY / scaleY);

    const newSourceX = Math.max(0, Math.min(naturalWidth - 20, startX + deltaSourceX));
    const newSourceY = Math.max(0, Math.min(naturalHeight - 20, startY + deltaSourceY));

    setLayers(prev =>
      prev.map(l => (l.id === layerId ? { ...l, x: newSourceX, y: newSourceY } : l))
    );
  };

  const handlePointerUpLayer = (e: React.PointerEvent) => {
    if (draggingRef.current) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {}
      draggingRef.current = null;
    }
  };

  // Interactive 8-Point Bounding Box Resize Logic
  const handlePointerDownResize = (e: React.PointerEvent, layer: CanvasTextLayer, direction: ResizeDirection) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedLayerId(layer.id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const defaultH = layer.height || Math.round(layer.fontSize * 1.5);
    resizingRef.current = {
      layerId: layer.id,
      direction,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startX: layer.x,
      startY: layer.y,
      startWidth: layer.width,
      startHeight: defaultH
    };
    setActiveResizeDirection(direction);
  };

  const handlePointerMoveResize = (e: React.PointerEvent) => {
    if (!resizingRef.current) return;
    const { layerId, direction, startPointerX, startPointerY, startX, startY, startWidth, startHeight } = resizingRef.current;

    const deltaPointerX = e.clientX - startPointerX;
    const deltaPointerY = e.clientY - startPointerY;

    const deltaSourceX = Math.round(deltaPointerX / scaleX);
    const deltaSourceY = Math.round(deltaPointerY / scaleY);

    let newX = startX;
    let newY = startY;
    let newWidth = startWidth;
    let newHeight = startHeight;

    const minWidth = 80;
    const minHeight = 24;

    // Horizontal adjustments
    if (direction === 'e' || direction === 'se' || direction === 'ne') {
      newWidth = Math.max(minWidth, Math.min(naturalWidth - startX, startWidth + deltaSourceX));
    } else if (direction === 'w' || direction === 'sw' || direction === 'nw') {
      const maxDeltaLeft = startWidth - minWidth;
      const clampedDeltaX = Math.min(maxDeltaLeft, Math.max(-startX, deltaSourceX));
      newX = startX + clampedDeltaX;
      newWidth = startWidth - clampedDeltaX;
    }

    // Vertical adjustments
    if (direction === 's' || direction === 'se' || direction === 'sw') {
      newHeight = Math.max(minHeight, Math.min(naturalHeight - startY, startHeight + deltaSourceY));
    } else if (direction === 'n' || direction === 'ne' || direction === 'nw') {
      const maxDeltaTop = startHeight - minHeight;
      const clampedDeltaY = Math.min(maxDeltaTop, Math.max(-startY, deltaSourceY));
      newY = startY + clampedDeltaY;
      newHeight = startHeight - clampedDeltaY;
    }

    setLayers(prev =>
      prev.map(l => (l.id === layerId ? {
        ...l,
        x: Math.round(newX),
        y: Math.round(newY),
        width: Math.round(newWidth),
        height: Math.round(newHeight)
      } : l))
    );
  };

  const handlePointerUpResize = (e: React.PointerEvent) => {
    if (resizingRef.current) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {}
      resizingRef.current = null;
      setActiveResizeDirection(null);
    }
  };

  // AI Inpainting & Background Text Eraser (Powered by VectorEngine Layered Intelligence)
  const handleTriggerAIEraser = async () => {
    setIsErasingBg(true);
    try {
      const res = await fetch('/api/poster/ocr-and-erase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          naturalWidth,
          naturalHeight,
          screenTitle,
          coreSellingPoint
        })
      });
      const json = await res.json();
      if (json && json.success) {
        setRepairSuccess(true);
        setRepairMessage(json.message || '底图文字已消除');
        if (json.cleanBackgroundUrl) {
          setCustomCleanBg(json.cleanBackgroundUrl);
          setUseCleanBg(true);
        }
        if (Array.isArray(json.textLayers) && json.textLayers.length > 0) {
          setLayers(json.textLayers);
          setSelectedLayerId(json.textLayers[0]?.id || null);
        }
        if (json.aestheticSpec) setAestheticSpec(json.aestheticSpec);
        if (json.telemetry) setTelemetry(json.telemetry);
      } else {
        throw new Error(json?.error || 'AI 擦除未能生成纯净底图');
      }
    } catch (err: any) {
      console.error('AI Erase failed:', err);
      alert('AI 消除底图文字失败: ' + (err?.message || '网络超时或服务不可用'));
    } finally {
      setIsErasingBg(false);
    }
  };

  // One-Click Poster Replication & Brand Assetization (由前AI 式一键复刻)
  const handleReplicatePoster = async (mode: 'manwah_luxury' | 'manwah_ergonomics' | 'faithful') => {
    setIsReplicating(true);
    setShowReplicateMenu(false);
    try {
      const res = await fetch('/api/poster/replicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          mode,
          category: '敏华意式真皮功能沙发',
          targetAudience: '追求空间美学的高净值家庭'
        })
      });
      const json = await res.json();
      if (json && json.success) {
        setRepairSuccess(true);
        setRepairMessage(json.message || '一键海报复刻完成');
        if (json.cleanBackgroundUrl) {
          setCustomCleanBg(json.cleanBackgroundUrl);
          setUseCleanBg(true);
        }
        if (Array.isArray(json.textLayers) && json.textLayers.length > 0) {
          setLayers(json.textLayers);
          setSelectedLayerId(json.textLayers[0]?.id || null);
        }
        if (json.aestheticSpec) setAestheticSpec(json.aestheticSpec);
        if (json.telemetry) setTelemetry(json.telemetry);
      } else {
        throw new Error(json?.error || '复刻失败');
      }
    } catch (err: any) {
      console.error('Replicate failed:', err);
      alert('一键海报复刻失败: ' + (err?.message || '请求超时'));
    } finally {
      setIsReplicating(false);
    }
  };

  // Custom Local Background Upload
  const handleUploadCleanBg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (dataUrl) {
        setCustomCleanBg(dataUrl);
        setUseCleanBg(true);
        setRepairSuccess(true);
        setRepairMessage('已成功加载本地纯净无字底图');
      }
    };
    reader.readAsDataURL(file);
  };

  // Helper to split text by explicit newlines and wrap lines that exceed maxWidth
  const getCanvasWrappedTextLines = (
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
  ): string[] => {
    if (!text) return [];
    const paragraphs = text.split('\n');
    const lines: string[] = [];

    for (const para of paragraphs) {
      if (!para) {
        lines.push('');
        continue;
      }
      let currentLine = '';
      for (let i = 0; i < para.length; i++) {
        const char = para[i];
        const testLine = currentLine + char;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = char;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }
    }
    return lines;
  };

  // Composite High-Res Canvas Rendering (支持无损超清 PNG 与 98% 超清 JPG)
  const generateCompositeDataUrl = async (
    format: 'png' | 'jpeg' = 'png',
    quality: number = 0.98
  ): Promise<string> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建 Canvas 2D 上下文');

    let targetW = naturalWidth;
    let targetH = naturalHeight;

    if (export3To4) {
      targetW = 2100;
      targetH = 2800;
    }

    canvas.width = targetW;
    canvas.height = targetH;

    const bgImg = new Image();
    bgImg.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      bgImg.onload = resolve;
      bgImg.onerror = reject;
      bgImg.src = activeBgUrl;
    });

    if (export3To4) {
      const imgAspect = bgImg.naturalWidth / bgImg.naturalHeight;
      const targetAspect = 2100 / 2800;

      let renderW = 2100;
      let renderH = 2800;
      let offsetX = 0;
      let offsetY = 0;

      if (imgAspect > targetAspect) {
        renderH = 2100 / imgAspect;
        offsetY = (2800 - renderH) / 2;
      } else {
        renderW = 2800 * imgAspect;
        offsetX = (2100 - renderW) / 2;
      }

      ctx.fillStyle = '#1A1818';
      ctx.fillRect(0, 0, 2100, 2800);
      ctx.drawImage(bgImg, offsetX, offsetY, renderW, renderH);

      const fitScaleX = renderW / bgImg.naturalWidth;
      const fitScaleY = renderH / bgImg.naturalHeight;

      layers.forEach(layer => {
        ctx.save();
        const lx = offsetX + layer.x * fitScaleX;
        const ly = offsetY + layer.y * fitScaleY;
        const lw = layer.width * fitScaleX;
        const fontPx = Math.round(layer.fontSize * fitScaleX);
        const lineH = Math.round(fontPx * (layer.lineHeight || 1.25));

        ctx.font = `${layer.fontWeight || 'bold'} ${fontPx}px ${layer.fontFamily || '"Songti SC", serif'}`;
        ctx.textAlign = (layer.textAlign as CanvasTextAlign) || 'left';
        ctx.textBaseline = 'top';

        const lines = getCanvasWrappedTextLines(ctx, layer.text, lw);
        const totalH = Math.max(1, lines.length) * lineH;

        // Smart Backdrop Plate (if enabled or background protection is active)
        if ((layer as any).backdropEnabled) {
          ctx.fillStyle = (layer as any).backdropColor || 'rgba(0,0,0,0.65)';
          ctx.beginPath();
          ctx.roundRect(lx - 12, ly - 8, lw + 24, totalH + 16, 8);
          ctx.fill();
        }

        ctx.fillStyle = layer.color || '#1C1917';

        const darkText = isDarkColor(layer.color);
        const textShadowMode = (layer as any).textShadow;
        if (textShadowMode === false || (textShadowMode !== 'deep' && darkText)) {
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        } else if (textShadowMode === 'deep') {
          ctx.shadowColor = 'rgba(0,0,0,0.85)';
          ctx.shadowBlur = Math.round(fontPx * 0.25);
        } else {
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = Math.round(fontPx * 0.12);
        }

        let drawX = lx;
        if (layer.textAlign === 'center') drawX = lx + lw / 2;
        else if (layer.textAlign === 'right') drawX = lx + lw;

        lines.forEach((line, index) => {
          ctx.fillText(line, drawX, ly + index * lineH);
        });
        ctx.restore();
      });
    } else {
      ctx.drawImage(bgImg, 0, 0, targetW, targetH);

      layers.forEach(layer => {
        ctx.save();
        const fontPx = Math.round(layer.fontSize);
        const lineH = Math.round(fontPx * (layer.lineHeight || 1.25));

        ctx.font = `${layer.fontWeight || 'bold'} ${fontPx}px ${layer.fontFamily || '"Songti SC", serif'}`;
        ctx.textAlign = (layer.textAlign as CanvasTextAlign) || 'left';
        ctx.textBaseline = 'top';

        const lines = getCanvasWrappedTextLines(ctx, layer.text, layer.width);
        const totalH = Math.max(1, lines.length) * lineH;

        if ((layer as any).backdropEnabled) {
          ctx.fillStyle = (layer as any).backdropColor || 'rgba(0,0,0,0.65)';
          ctx.beginPath();
          ctx.roundRect(layer.x - 12, layer.y - 8, layer.width + 24, totalH + 16, 8);
          ctx.fill();
        }

        ctx.fillStyle = layer.color || '#1C1917';

        const darkText = isDarkColor(layer.color);
        const textShadowMode = (layer as any).textShadow;
        if (textShadowMode === false || (textShadowMode !== 'deep' && darkText)) {
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        } else if (textShadowMode === 'deep') {
          ctx.shadowColor = 'rgba(0,0,0,0.85)';
          ctx.shadowBlur = Math.round(fontPx * 0.25);
        } else {
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = Math.round(fontPx * 0.12);
        }

        let drawX = layer.x;
        if (layer.textAlign === 'center') drawX = layer.x + layer.width / 2;
        else if (layer.textAlign === 'right') drawX = layer.x + layer.width;

        lines.forEach((line, index) => {
          ctx.fillText(line, drawX, layer.y + index * lineH);
        });
        ctx.restore();
      });
    }

    if (format === 'png') {
      return canvas.toDataURL('image/png');
    }
    return canvas.toDataURL('image/jpeg', quality);
  };

  // Save composite version (使用无损高保真 PNG 保存版本，避免二次压缩劣化)
  const handleSaveCompositeVersion = async () => {
    setIsSaving(true);
    try {
      const compositedDataUrl = await generateCompositeDataUrl('png');
      onSaveVersion(compositedDataUrl, activeBgUrl, layers);
      onClose();
    } catch (err: any) {
      console.error('Save version failed:', err);
      alert('合成新版本失败: ' + (err?.message || '未知错误'));
    } finally {
      setIsSaving(false);
    }
  };

  // Export full poster as lossless PNG (推荐: 解决 500KB 模糊噪点)
  const handleExportDownloadPng = async () => {
    try {
      const compositedDataUrl = await generateCompositeDataUrl('png');
      const fn = `敏华海报-第${sceneIndex}屏-${export3To4 ? '3-4-2100x2800' : `${naturalWidth}x${naturalHeight}`}_无损超清.png`;
      await downloadHighResImage(compositedDataUrl, fn);
    } catch (err: any) {
      console.error('Export PNG download failed:', err);
      alert('导出无损海报失败: ' + (err?.message || '未知错误'));
    }
  };

  // Export full poster as ultra-quality JPG (98% 质量)
  const handleExportDownloadJpg = async () => {
    try {
      const compositedDataUrl = await generateCompositeDataUrl('jpeg', 0.98);
      const fn = `敏华海报-第${sceneIndex}屏-${export3To4 ? '3-4-2100x2800' : `${naturalWidth}x${naturalHeight}`}_超清JPG.jpg`;
      await downloadHighResImage(compositedDataUrl, fn);
    } catch (err: any) {
      console.error('Export JPG download failed:', err);
      alert('导出超清海报失败: ' + (err?.message || '未知错误'));
    }
  };

  // Export full poster (保留默认入口，优先使用无损 PNG)
  const handleExportDownload = async () => {
    await handleExportDownloadPng();
  };

  // Export clean background alone
  const handleExportCleanBackground = async () => {
    try {
      const fn = `敏华纯净底图-第${sceneIndex}屏-${naturalWidth}x${naturalHeight}.jpg`;
      await downloadHighResImage(activeBgUrl, fn);
    } catch (err: any) {
      console.error('Export background failed:', err);
      alert('导出纯净底图失败: ' + (err?.message || '未知错误'));
    }
  };

  // Render directly into document.body as a dedicated full-screen Studio Workspace
  return createPortal(
    <div className="fixed inset-0 z-[9999] w-screen h-screen bg-[#11100F] text-stone-100 flex flex-col select-none overflow-hidden font-sans animate-fadeIn">
      {/* 1. Top Universal Studio Header */}
      <header className="h-14 bg-[#1C1A19] border-b border-stone-800 px-5 flex items-center justify-between gap-4 shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#B28C5A] to-[#8C6F43] text-white flex items-center justify-center shadow-md">
            <Type className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-stone-100 tracking-wide">海报文字排版工坊</span>
              <span className="text-xs text-[#B28C5A] bg-[#B28C5A]/15 px-2 py-0.5 rounded-full font-semibold border border-[#B28C5A]/30">
                第 {sceneIndex} 屏分镜独立操作
              </span>
              <span className="text-[11px] font-mono text-stone-400 bg-stone-800 px-2 py-0.5 rounded border border-stone-700">
                {naturalWidth} × {naturalHeight} px
              </span>
            </div>
          </div>
          <div className="h-4 w-px bg-stone-800 mx-1 hidden sm:block" />
          {isTrulySeparated ? (
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-800/50">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>图文已彻底解耦分离（纯净无字底图 + 独立矢量图层）</span>
            </div>
          ) : (
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-amber-400 bg-amber-950/40 px-2.5 py-1 rounded-full border border-amber-800/50">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>当前包含烘焙文字，建议点击“AI 一键消除底图文字”生成纯净底图</span>
            </div>
          )}
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-2.5">
          {/* VectorEngine Gateway Telemetry status if active */}
          {telemetry && (
            <a
              href={telemetry.logConsoleUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 bg-stone-900 hover:bg-stone-800 text-stone-300 rounded-lg text-[11px] border border-stone-700/80 transition"
              title="点击在 VectorEngine 向量路由控制台查看端到端请求日志与 Token 消耗"
            >
              <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
              <span className="font-mono text-emerald-400">VE-Gateway</span>
              <span className="text-stone-500">|</span>
              <span>{telemetry.spatialModel}</span>
              {telemetry.aestheticModel && (
                <>
                  <span className="text-stone-500">+</span>
                  <span className="text-amber-300">{telemetry.aestheticModel}</span>
                </>
              )}
              <span className="font-mono text-stone-400">({telemetry.totalLatencyMs}ms)</span>
              <ExternalLink className="w-2.5 h-2.5 text-stone-500" />
            </a>
          )}

          {/* 由前AI式 一键海报复刻与版式资产化 */}
          <div className="relative">
            <button
              onClick={() => setShowReplicateMenu(!showReplicateMenu)}
              disabled={isReplicating}
              className="px-3 py-1.5 bg-gradient-to-r from-purple-700 to-indigo-600 hover:brightness-110 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition-all active:scale-95 disabled:opacity-50"
              title="参考由前AI：一键提取海报版式、消除底图并套用敏华高奢全案文案"
            >
              {isReplicating ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              )}
              <span>{isReplicating ? '正在复刻海报资产...' : '一键海报复刻'}</span>
            </button>

            {showReplicateMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-64 bg-[#1C1A19] border border-stone-700 rounded-xl shadow-2xl p-2 z-50 flex flex-col gap-1 text-xs">
                <div className="px-2.5 py-1.5 text-[11px] font-semibold text-stone-400 border-b border-stone-800">
                  由前AI式 · 一键版式解构与文案套用
                </div>
                <button
                  onClick={() => handleReplicatePoster('manwah_luxury')}
                  className="w-full text-left px-2.5 py-2 hover:bg-stone-800 rounded-lg flex flex-col transition text-stone-200"
                >
                  <span className="font-bold text-amber-300 flex items-center gap-1">
                    👑 敏华意式高奢全案
                  </span>
                  <span className="text-[10px] text-stone-400 mt-0.5">
                    提取排版并自动装填真皮、意境、奢品卖点
                  </span>
                </button>
                <button
                  onClick={() => handleReplicatePoster('manwah_ergonomics')}
                  className="w-full text-left px-2.5 py-2 hover:bg-stone-800 rounded-lg flex flex-col transition text-stone-200"
                >
                  <span className="font-bold text-cyan-300 flex items-center gap-1">
                    ⚡ 敏华工学电动科技
                  </span>
                  <span className="text-[10px] text-stone-400 mt-0.5">
                    提取排版并装填 110°-160°、零重力减压卖点
                  </span>
                </button>
                <button
                  onClick={() => handleReplicatePoster('faithful')}
                  className="w-full text-left px-2.5 py-2 hover:bg-stone-800 rounded-lg flex flex-col transition text-stone-200"
                >
                  <span className="font-bold text-stone-300 flex items-center gap-1">
                    📐 纯净原版排版保留
                  </span>
                  <span className="text-[10px] text-stone-400 mt-0.5">
                    保留原图全部文字内容与位置，彻底剥离底图
                  </span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleTriggerAIEraser}
            disabled={isErasingBg}
            className="px-3 py-1.5 bg-gradient-to-r from-amber-600 to-[#B28C5A] hover:brightness-110 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition-all active:scale-95 disabled:opacity-50"
            title="利用 AI Vision 与精密 Inpainting 智能抹去底图旧文字，获得纯净底图"
          >
            {isErasingBg ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wand2 className="w-3.5 h-3.5" />
            )}
            <span>{isErasingBg ? 'AI 正在消除底图文字...' : 'AI 智能消除底图文字'}</span>
          </button>

          {onOpenPosterStudio && (
            <button
              onClick={() => {
                onClose();
                onOpenPosterStudio();
              }}
              className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-stone-700 transition"
              title="切换到敏华全案 9 屏联排海报工坊"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#B28C5A]" />
              <span>全案 9 屏工作台</span>
            </button>
          )}

          {/* 3:4 商业印刷 2100x2800 规格切换 */}
          <button
            onClick={() => setExport3To4(!export3To4)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition ${
              export3To4
                ? 'bg-[#B28C5A] text-white border-[#B28C5A] shadow-xs'
                : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border-stone-700'
            }`}
            title="切换电商 3:4 (2100×2800) 印刷级超清分辨率"
          >
            <span>{export3To4 ? '3:4 商业印刷 (2100×2800)' : '原图像素比例'}</span>
          </button>

          <button
            onClick={handleExportCleanBackground}
            className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-stone-700 transition"
            title="单独导出纯净无字的家居实拍大片"
          >
            <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
            <span>导出纯净底图</span>
          </button>

          {/* 直接下载 AI 生成的原始海报（杜绝任何二次合成文字粘连） */}
          <button
            onClick={async () => {
              try {
                const fn = `敏华海报-第${sceneIndex}屏-原始画质.png`;
                await downloadHighResImage(imageUrl, fn);
              } catch (err: any) {
                console.error('Download original failed:', err);
                alert('下载失败: ' + (err?.message || '未知错误'));
              }
            }}
            className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-stone-700 transition"
            title="直接下载 AI 原始生成图 (不叠印任何排版工坊文字，彻底防止双重文案)"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>下载原始海报</span>
          </button>

          {/* 无损超清 PNG 导出 (核心解决 500KB 压缩质量问题) */}
          <button
            onClick={handleExportDownloadPng}
            className="px-3 py-1.5 bg-[#B28C5A]/20 hover:bg-[#B28C5A]/35 text-[#E6CAA4] hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 border border-[#B28C5A]/40 transition shadow-xs"
            title="导出无损超清 PNG 格式海报 (约 3~8MB，文字 100% 锐利无失真，推荐商业印刷)"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#B28C5A]" />
            <span>导出排版 PNG</span>
          </button>

          {/* 超清 JPG 导出 */}
          <button
            onClick={handleExportDownloadJpg}
            className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-stone-700 transition"
            title="导出 98% 质量超清 JPG 海报 (约 2~4MB)"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>导出超清 JPG</span>
          </button>

          <button
            onClick={handleSaveCompositeVersion}
            disabled={isSaving}
            className="px-4 py-1.5 bg-[#B28C5A] hover:bg-[#8C6F43] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition-all active:scale-95 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? '正在合成新版本...' : '保存新版本回画布'}</span>
          </button>

          <div className="h-5 w-px bg-stone-800 mx-1" />

          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 rounded-xl transition"
            title="返回画布"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 2. Main 3-Column Studio Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Layers & Background Controller (Width: 320px) */}
        <aside className="w-80 bg-[#161514] border-r border-stone-800 flex flex-col shrink-0 overflow-y-auto">
          {/* Section: Background Layer Control */}
          <div className="p-4 border-b border-stone-800 bg-[#1A1817]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#B28C5A]" />
                <span className="text-xs font-bold text-stone-200">底图层 (Background)</span>
              </div>
              {isTrulySeparated ? (
                <span className="text-[10px] bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-800 font-bold">
                  纯净无字
                </span>
              ) : (
                <span className="text-[10px] bg-amber-950 text-amber-400 px-2 py-0.5 rounded-full border border-amber-800 font-bold">
                  原图待消除
                </span>
              )}
            </div>

            {/* Thumbnail and view switch */}
            <div className="relative rounded-xl overflow-hidden border border-stone-700/80 bg-stone-900 group mb-3 aspect-video">
              <img
                src={activeBgUrl}
                alt="底图预览"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-2.5">
                <span className="text-[11px] text-stone-300 font-medium">
                  {useCleanBg && effectiveCleanBg ? '当前使用：纯净消除底图' : '当前使用：原始生成图'}
                </span>
              </div>
            </div>

            {/* Background Controls */}
            <div className="space-y-2">
              {effectiveCleanBg && (
                <div className="flex items-center justify-between bg-stone-900/80 px-3 py-2 rounded-xl border border-stone-800">
                  <span className="text-xs text-stone-300">使用纯净无字底图</span>
                  <input
                    type="checkbox"
                    checked={useCleanBg}
                    onChange={e => setUseCleanBg(e.target.checked)}
                    className="accent-[#B28C5A] w-4 h-4 cursor-pointer"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleTriggerAIEraser}
                  disabled={isErasingBg}
                  className="px-2 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1 border border-stone-700 transition"
                >
                  <Wand2 className="w-3 h-3 text-[#B28C5A]" />
                  <span>AI 擦除底图文字</span>
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1 border border-stone-700 transition"
                >
                  <Upload className="w-3 h-3 text-sky-400" />
                  <span>上传无字底图</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUploadCleanBg}
              />
            </div>
          </div>

          {/* Section: Typography Layer Stack */}
          <div className="p-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <LayersIcon className="w-4 h-4 text-[#B28C5A]" />
                <span className="text-xs font-bold text-stone-200">文字图层列表 ({layers.length})</span>
              </div>
              <div className="flex items-center gap-1.5">
                {layers.length > 0 && (
                  <button
                    onClick={() => {
                      if (window.confirm('确认清空所有叠加图层？清空后将直接导出底图，彻底杜绝双重文案粘连。')) {
                        setLayers([]);
                        setSelectedLayerId(null);
                      }
                    }}
                    className="px-2 py-1 bg-stone-800 hover:bg-rose-950/60 text-stone-400 hover:text-rose-400 rounded-lg text-[11px] border border-stone-700 transition"
                    title="一键清空所有额外文字图层，避免与底图文字发生叠影冲突"
                  >
                    清空图层
                  </button>
                )}
                <button
                  onClick={handleAddLayer}
                  className="px-2 py-1 bg-[#B28C5A]/20 hover:bg-[#B28C5A]/30 text-[#B28C5A] rounded-lg text-xs font-bold flex items-center gap-1 border border-[#B28C5A]/40 transition"
                >
                  <Plus className="w-3 h-3" />
                  <span>添加文案</span>
                </button>
              </div>
            </div>

            {/* Layers List */}
            <div className="space-y-2 flex-1 overflow-y-auto">
              {layers.map((layer, idx) => {
                const isSelected = selectedLayerId === layer.id;
                return (
                  <div
                    key={layer.id}
                    onClick={() => setSelectedLayerId(layer.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                      isSelected
                        ? 'bg-[#2A2624] border-[#B28C5A] shadow-md ring-1 ring-[#B28C5A]/50'
                        : 'bg-stone-900/60 border-stone-800 hover:border-stone-700 hover:bg-stone-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                        isSelected ? 'bg-[#B28C5A] text-white' : 'bg-stone-800 text-stone-400'
                      }`}>
                        T{idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-stone-200 truncate">
                          {layer.text || '空文案'}
                        </p>
                        <p className="text-[10px] text-stone-400 font-mono mt-0.5">
                          {Math.round(layer.fontSize)}px · {layer.textAlign || 'center'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteLayer(layer.id);
                        }}
                        className="p-1.5 text-stone-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition"
                        title="删除此文字图层"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {layers.length === 0 && (
                <div className="text-center py-6 px-3 rounded-xl bg-stone-900/50 border border-dashed border-stone-800 space-y-2">
                  <p className="text-xs text-stone-300 font-medium">
                    {isTrulySeparated
                      ? '暂无文字图层，点击上方「添加文案」创建独立排版'
                      : '当前底图已自带 AI 海报文字'}
                  </p>
                  <p className="text-[11px] text-stone-400 leading-relaxed">
                    {isTrulySeparated
                      ? '已就绪纯净底图，可自由叠印排版。'
                      : '已为您自动清空多余图层，导出时将直接输出原画，彻底杜绝双重文字重叠。若需更换文字，请点击上方「AI 智能消除底图文字」。'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Section: Layer 2 Aesthetic Spec (VectorEngine Cognitive Layer) */}
          {aestheticSpec && (
            <div className="p-4 border-t border-stone-800 bg-[#141312] text-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-stone-200 font-bold">
                  <Compass className="w-3.5 h-3.5 text-amber-400" />
                  <span>排版美学 Spec 鉴定</span>
                </div>
                <span className="text-[10px] text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-800 font-mono">
                  {aestheticSpec.overallStyle || 'italian_luxury'}
                </span>
              </div>
              <p className="text-[11px] text-stone-400 leading-relaxed mb-2.5">
                {aestheticSpec.aestheticSummary || '意式留白极简排版，主副标比例协调'}
              </p>
              {aestheticSpec.colorPalette && (
                <div className="flex items-center gap-2 bg-stone-900/90 p-2 rounded-xl border border-stone-800">
                  <span className="text-[10px] text-stone-400">推荐色盘:</span>
                  <div className="flex items-center gap-1.5">
                    {aestheticSpec.colorPalette.primaryText && (
                      <span
                        className="w-4 h-4 rounded-full border border-stone-700 shadow-sm"
                        style={{ backgroundColor: aestheticSpec.colorPalette.primaryText }}
                        title={`主文字色: ${aestheticSpec.colorPalette.primaryText}`}
                      />
                    )}
                    {aestheticSpec.colorPalette.accent && (
                      <span
                        className="w-4 h-4 rounded-full border border-stone-700 shadow-sm"
                        style={{ backgroundColor: aestheticSpec.colorPalette.accent }}
                        title={`高光金色: ${aestheticSpec.colorPalette.accent}`}
                      />
                    )}
                    {aestheticSpec.colorPalette.backgroundBase && (
                      <span
                        className="w-4 h-4 rounded-full border border-stone-700 shadow-sm"
                        style={{ backgroundColor: aestheticSpec.colorPalette.backgroundBase }}
                        title={`底色: ${aestheticSpec.colorPalette.backgroundBase}`}
                      />
                    )}
                  </div>
                  {aestheticSpec.hierarchyRatio && (
                    <span className="ml-auto text-[10px] text-stone-400 font-mono">
                      阶梯: {aestheticSpec.hierarchyRatio}x
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Center Column: High-Res Interactive Canvas Workspace */}
        <main
          ref={containerRef}
          className="flex-1 bg-[#0D0C0B] relative flex items-center justify-center p-6 overflow-hidden select-none"
        >
          {/* Floating Zoom & Preset Controls */}
          <div className="absolute top-4 left-6 z-20 flex items-center gap-1.5 bg-stone-900/90 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-stone-800 shadow-xl">
            <button
              onClick={() => setZoomLevel(prev => Math.max(0.4, prev - 0.1))}
              className="p-1 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition"
              title="缩小"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono text-stone-300 px-1 font-semibold">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => setZoomLevel(prev => Math.min(2.5, prev + 0.1))}
              className="p-1 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition"
              title="放大"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <div className="h-3.5 w-px bg-stone-800 mx-1" />
            <button
              onClick={() => setZoomLevel(1)}
              className="px-2 py-0.5 text-[11px] text-stone-300 hover:text-white hover:bg-stone-800 rounded-lg font-medium transition"
            >
              自适应
            </button>
          </div>

          {/* Canvas Wrapper */}
          <div
            className="relative shadow-2xl transition-transform duration-75 ease-out rounded-xl overflow-hidden border border-stone-800 bg-stone-950 select-none"
            style={{
              width: `${currentW}px`,
              height: `${currentH}px`
            }}
            onPointerMove={(e) => {
              if (resizingRef.current) handlePointerMoveResize(e);
              else if (draggingRef.current) handlePointerMoveLayer(e);
            }}
            onPointerUp={(e) => {
              if (resizingRef.current) handlePointerUpResize(e);
              if (draggingRef.current) handlePointerUpLayer(e);
            }}
          >
            {/* Background Image: Either Clean Photographic Background OR Original */}
            <img
              src={activeBgUrl}
              alt="海报纯净底图"
              className="w-full h-full object-cover pointer-events-none"
            />

            {/* Vector Typography Layers Overlay */}
            {layers.map((layer) => {
              const isSelected = selectedLayerId === layer.id;
              const isEditing = editingLayerId === layer.id;

              const left = layer.x * scaleX;
              const top = layer.y * scaleY;
              const width = layer.width * scaleX;
              const height = (layer.height || Math.round(layer.fontSize * 1.5)) * scaleY;
              const fontSizePx = Math.max(12, layer.fontSize * scaleX);

              return (
                <div
                  key={layer.id}
                  onPointerDown={(e) => handlePointerDownLayer(e, layer)}
                  onPointerMove={handlePointerMoveLayer}
                  onPointerUp={handlePointerUpLayer}
                  onDoubleClick={() => {
                    setEditingLayerId(layer.id);
                    setEditingText(layer.text);
                  }}
                  className={`absolute transition-shadow touch-none select-none ${
                    isSelected
                      ? 'ring-2 ring-[#B28C5A] ring-offset-2 ring-offset-black/40 rounded-lg z-20 cursor-move'
                      : 'hover:ring-1 hover:ring-white/50 rounded z-10 cursor-pointer'
                  }`}
                  style={{
                    left: `${left}px`,
                    top: `${top}px`,
                    width: `${width}px`,
                    minHeight: `${height}px`,
                    height: layer.height ? `${height}px` : 'auto',
                    padding: '6px'
                  }}
                >
                  {/* Selected Tag & Live Dimension Badges */}
                  {isSelected && !isEditing && (
                    <div className="absolute -top-8 left-0 bg-[#241F1B]/95 text-white px-2.5 py-1 rounded-lg text-[10px] font-mono border border-[#B28C5A]/70 shadow-2xl pointer-events-none flex items-center gap-2 whitespace-nowrap z-40 backdrop-blur-xs">
                      <div className="flex items-center gap-1 text-amber-300 font-bold">
                        <Move className="w-3 h-3 text-[#B28C5A]" />
                        <span>{activeResizeDirection ? '拖拽调整排版框尺寸' : '拖动位置 · 边缘拉动尺寸'}</span>
                      </div>
                      <span className="text-stone-400">({Math.round(layer.x)}, {Math.round(layer.y)})</span>
                      <span className="text-stone-500">|</span>
                      <span className="text-amber-200 font-bold">{Math.round(layer.width)} × {Math.round(layer.height || 60)} px</span>
                    </div>
                  )}

                  {/* 8-Point Interactive Bounding Box Resize Handles */}
                  {isSelected && !isEditing && (
                    <>
                      {/* East Handle (Right - Width) */}
                      <div
                        onPointerDown={(e) => handlePointerDownResize(e, layer, 'e')}
                        onPointerMove={handlePointerMoveResize}
                        onPointerUp={handlePointerUpResize}
                        onPointerCancel={handlePointerUpResize}
                        title="拖动拉伸排版框宽度 (解决折行)"
                        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3.5 h-8 bg-white hover:bg-amber-100 active:bg-amber-200 border-2 border-[#B28C5A] rounded-full shadow-lg cursor-ew-resize z-30 flex items-center justify-center transition-transform hover:scale-110 touch-none select-none"
                      >
                        <div className="w-0.5 h-3 bg-[#B28C5A] rounded-full" />
                      </div>

                      {/* West Handle (Left - Width & X) */}
                      <div
                        onPointerDown={(e) => handlePointerDownResize(e, layer, 'w')}
                        onPointerMove={handlePointerMoveResize}
                        onPointerUp={handlePointerUpResize}
                        onPointerCancel={handlePointerUpResize}
                        title="拖动拉伸左边框与宽度"
                        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-8 bg-white hover:bg-amber-100 active:bg-amber-200 border-2 border-[#B28C5A] rounded-full shadow-lg cursor-ew-resize z-30 flex items-center justify-center transition-transform hover:scale-110 touch-none select-none"
                      >
                        <div className="w-0.5 h-3 bg-[#B28C5A] rounded-full" />
                      </div>

                      {/* South Handle (Bottom - Height) */}
                      <div
                        onPointerDown={(e) => handlePointerDownResize(e, layer, 's')}
                        onPointerMove={handlePointerMoveResize}
                        onPointerUp={handlePointerUpResize}
                        onPointerCancel={handlePointerUpResize}
                        title="拖动拉伸排版框高度"
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-8 h-3.5 bg-white hover:bg-amber-100 active:bg-amber-200 border-2 border-[#B28C5A] rounded-full shadow-lg cursor-ns-resize z-30 flex items-center justify-center transition-transform hover:scale-110 touch-none select-none"
                      >
                        <div className="h-0.5 w-3 bg-[#B28C5A] rounded-full" />
                      </div>

                      {/* North Handle (Top - Height & Y) */}
                      <div
                        onPointerDown={(e) => handlePointerDownResize(e, layer, 'n')}
                        onPointerMove={handlePointerMoveResize}
                        onPointerUp={handlePointerUpResize}
                        onPointerCancel={handlePointerUpResize}
                        title="拖动拉伸上边框与高度"
                        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-3.5 bg-white hover:bg-amber-100 active:bg-amber-200 border-2 border-[#B28C5A] rounded-full shadow-lg cursor-ns-resize z-30 flex items-center justify-center transition-transform hover:scale-110 touch-none select-none"
                      >
                        <div className="h-0.5 w-3 bg-[#B28C5A] rounded-full" />
                      </div>

                      {/* South-East (Bottom-Right Corner) */}
                      <div
                        onPointerDown={(e) => handlePointerDownResize(e, layer, 'se')}
                        onPointerMove={handlePointerMoveResize}
                        onPointerUp={handlePointerUpResize}
                        onPointerCancel={handlePointerUpResize}
                        title="双向缩放排版框"
                        className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 w-4 h-4 bg-white hover:bg-amber-100 active:bg-amber-200 border-2 border-[#B28C5A] rounded-xs shadow-lg cursor-nwse-resize z-30 transition-transform hover:scale-125 touch-none select-none"
                      />

                      {/* South-West (Bottom-Left Corner) */}
                      <div
                        onPointerDown={(e) => handlePointerDownResize(e, layer, 'sw')}
                        onPointerMove={handlePointerMoveResize}
                        onPointerUp={handlePointerUpResize}
                        onPointerCancel={handlePointerUpResize}
                        title="双向缩放排版框"
                        className="absolute bottom-0 left-0 -translate-x-1/2 translate-y-1/2 w-4 h-4 bg-white hover:bg-amber-100 active:bg-amber-200 border-2 border-[#B28C5A] rounded-xs shadow-lg cursor-nesw-resize z-30 transition-transform hover:scale-125 touch-none select-none"
                      />

                      {/* North-East (Top-Right Corner) */}
                      <div
                        onPointerDown={(e) => handlePointerDownResize(e, layer, 'ne')}
                        onPointerMove={handlePointerMoveResize}
                        onPointerUp={handlePointerUpResize}
                        onPointerCancel={handlePointerUpResize}
                        title="双向缩放排版框"
                        className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white hover:bg-amber-100 active:bg-amber-200 border-2 border-[#B28C5A] rounded-xs shadow-lg cursor-nesw-resize z-30 transition-transform hover:scale-125 touch-none select-none"
                      />

                      {/* North-West (Top-Left Corner) */}
                      <div
                        onPointerDown={(e) => handlePointerDownResize(e, layer, 'nw')}
                        onPointerMove={handlePointerMoveResize}
                        onPointerUp={handlePointerUpResize}
                        onPointerCancel={handlePointerUpResize}
                        title="双向缩放排版框"
                        className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white hover:bg-amber-100 active:bg-amber-200 border-2 border-[#B28C5A] rounded-xs shadow-lg cursor-nwse-resize z-30 transition-transform hover:scale-125 touch-none select-none"
                      />
                    </>
                  )}

                  {isEditing ? (
                    <textarea
                      autoFocus
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onBlur={() => {
                        updateSelectedLayer({ text: editingText });
                        setEditingLayerId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          updateSelectedLayer({ text: editingText });
                          setEditingLayerId(null);
                        }
                      }}
                      className="w-full bg-black/90 text-white p-2 rounded-lg outline-none border border-[#B28C5A] shadow-2xl resize-none"
                      style={{
                        fontSize: `${fontSizePx}px`,
                        fontFamily: layer.fontFamily || 'system-ui',
                        textAlign: layer.textAlign || 'center',
                        lineHeight: layer.lineHeight || 1.2
                      }}
                    />
                  ) : (
                    <div
                      className="w-full h-full select-none"
                      style={{
                        fontSize: `${fontSizePx}px`,
                        fontFamily: layer.fontFamily || '"Songti SC", "Source Han Serif SC", "Noto Serif SC", serif',
                        fontWeight: layer.fontWeight || 'bold',
                        color: layer.color || '#1C1917',
                        textAlign: layer.textAlign || 'left',
                        lineHeight: layer.lineHeight || 1.2,
                        letterSpacing: `${(layer.letterSpacing || 0) * scaleX}px`,
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                        whiteSpace: 'pre-wrap',
                        textShadow: (layer as any).textShadow === false || ((layer as any).textShadow !== 'deep' && isDarkColor(layer.color))
                          ? 'none'
                          : (layer as any).textShadow === 'deep'
                          ? '0 3px 12px rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,0.95)'
                          : '0 2px 8px rgba(0,0,0,0.65), 0 0 2px rgba(0,0,0,0.7)'
                      }}
                    >
                      {layer.text}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </main>

        {/* Right Column: Typography & Style Inspector (Width: 350px) */}
        <aside className="w-[350px] bg-[#161514] border-l border-stone-800 flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 border-b border-stone-800 bg-[#1A1817] flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#B28C5A]" />
            <span className="text-xs font-bold text-stone-200">排版属性检查器 (Typography Inspector)</span>
          </div>

          {selectedLayer ? (
            <div className="p-4 space-y-5">
              {/* Text Content Editor */}
              <div>
                <label className="text-xs font-semibold text-stone-300 block mb-1.5">
                  文案内容
                </label>
                <textarea
                  rows={2}
                  value={selectedLayer.text}
                  onChange={e => updateSelectedLayer({ text: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-700 rounded-xl p-2.5 text-xs text-stone-100 outline-none focus:border-[#B28C5A] transition resize-none"
                  placeholder="请输入海报文案内容..."
                />

                {/* Quick Luxury Presets */}
                <div className="mt-2 space-y-1">
                  <span className="text-[10px] text-stone-400">敏华高奢文案灵感：</span>
                  <div className="flex flex-wrap gap-1">
                    {LUXURY_COPY_PRESETS.map((txt) => (
                      <button
                        key={txt}
                        onClick={() => updateSelectedLayer({ text: txt })}
                        className="text-[10px] bg-stone-800 hover:bg-stone-700 text-stone-300 px-2 py-0.5 rounded-full border border-stone-700 text-left transition"
                      >
                        {txt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Font Family */}
              <div>
                <label className="text-xs font-semibold text-stone-300 block mb-1.5">
                  字体选择
                </label>
                <select
                  value={selectedLayer.fontFamily || COMMON_FONTS[0].value}
                  onChange={e => updateSelectedLayer({ fontFamily: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-700 rounded-xl p-2 text-xs text-stone-100 outline-none focus:border-[#B28C5A] transition"
                >
                  {COMMON_FONTS.map(f => (
                    <option key={f.value} value={f.value}>{f.name}</option>
                  ))}
                </select>
              </div>

              {/* Font Size & Weight */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-stone-300">字号</label>
                    <span className="text-xs font-mono text-[#B28C5A]">{Math.round(selectedLayer.fontSize)} px</span>
                  </div>
                  <input
                    type="range"
                    min={18}
                    max={240}
                    value={Math.round(selectedLayer.fontSize)}
                    onChange={e => updateSelectedLayer({ fontSize: Number(e.target.value) || 24 })}
                    className="w-full accent-[#B28C5A] cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-stone-300 block mb-1.5">字重</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => updateSelectedLayer({ fontWeight: 'normal' })}
                      className={`py-1.5 rounded-lg text-xs font-medium border transition ${
                        selectedLayer.fontWeight === 'normal'
                          ? 'bg-[#B28C5A] text-white border-[#B28C5A]'
                          : 'bg-stone-800 text-stone-400 border-stone-700'
                      }`}
                    >
                      常规体
                    </button>
                    <button
                      onClick={() => updateSelectedLayer({ fontWeight: 'bold' })}
                      className={`py-1.5 rounded-lg text-xs font-bold border transition ${
                        selectedLayer.fontWeight === 'bold'
                          ? 'bg-[#B28C5A] text-white border-[#B28C5A]'
                          : 'bg-stone-800 text-stone-400 border-stone-700'
                      }`}
                    >
                      粗体
                    </button>
                  </div>
                </div>
              </div>

              {/* Alignment */}
              <div>
                <label className="text-xs font-semibold text-stone-300 block mb-1.5">对齐方式</label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => updateSelectedLayer({ textAlign: 'left' })}
                    className={`py-1.5 rounded-lg flex items-center justify-center border transition ${
                      selectedLayer.textAlign === 'left' ? 'bg-[#B28C5A] text-white border-[#B28C5A]' : 'bg-stone-800 text-stone-400 border-stone-700'
                    }`}
                  >
                    <AlignLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => updateSelectedLayer({ textAlign: 'center' })}
                    className={`py-1.5 rounded-lg flex items-center justify-center border transition ${
                      selectedLayer.textAlign === 'center' ? 'bg-[#B28C5A] text-white border-[#B28C5A]' : 'bg-stone-800 text-stone-400 border-stone-700'
                    }`}
                  >
                    <AlignCenter className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => updateSelectedLayer({ textAlign: 'right' })}
                    className={`py-1.5 rounded-lg flex items-center justify-center border transition ${
                      selectedLayer.textAlign === 'right' ? 'bg-[#B28C5A] text-white border-[#B28C5A]' : 'bg-stone-800 text-stone-400 border-stone-700'
                    }`}
                  >
                    <AlignRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Precise Position & Box Dimensions */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-stone-300">
                    排版框尺寸与坐标 (X / Y / 宽 / 高)
                  </label>
                  <span className="text-[10px] text-amber-400/80 font-mono">
                    画布: {naturalWidth} × {naturalHeight}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <div>
                    <span className="text-[10px] text-stone-400 block mb-0.5">X 像素</span>
                    <input
                      type="number"
                      value={Math.round(selectedLayer.x)}
                      onChange={e => updateSelectedLayer({ x: Number(e.target.value) || 0 })}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg p-1.5 text-xs text-stone-100 outline-none focus:border-[#B28C5A]"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-400 block mb-0.5">Y 像素</span>
                    <input
                      type="number"
                      value={Math.round(selectedLayer.y)}
                      onChange={e => updateSelectedLayer({ y: Number(e.target.value) || 0 })}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg p-1.5 text-xs text-stone-100 outline-none focus:border-[#B28C5A]"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-400 block mb-0.5">宽度 (W)</span>
                    <input
                      type="number"
                      value={Math.round(selectedLayer.width)}
                      onChange={e => updateSelectedLayer({ width: Math.max(60, Number(e.target.value) || 100) })}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg p-1.5 text-xs text-stone-100 outline-none focus:border-[#B28C5A]"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-400 block mb-0.5">高度 (H)</span>
                    <input
                      type="number"
                      value={Math.round(selectedLayer.height || 60)}
                      onChange={e => updateSelectedLayer({ height: Math.max(24, Number(e.target.value) || 60) })}
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg p-1.5 text-xs text-stone-100 outline-none focus:border-[#B28C5A]"
                    />
                  </div>
                </div>

                {/* Quick Box Sizing Shortcuts */}
                <div className="grid grid-cols-3 gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const charCount = (selectedLayer.text || '').length;
                      const estimatedWidth = Math.min(
                        naturalWidth - selectedLayer.x - 20,
                        Math.max(240, Math.round(charCount * selectedLayer.fontSize * 1.18 + 60))
                      );
                      updateSelectedLayer({ width: estimatedWidth });
                    }}
                    className="px-2 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-lg text-[11px] font-medium border border-stone-700 transition flex items-center justify-center gap-1"
                    title="自动撑宽排版框以避免文字折行"
                  >
                    <span>单行铺展</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const halfWidth = Math.round(naturalWidth * 0.65);
                      updateSelectedLayer({ width: halfWidth });
                    }}
                    className="px-2 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-lg text-[11px] font-medium border border-stone-700 transition flex items-center justify-center"
                    title="排版框宽度设为 65% 画幅"
                  >
                    <span>65% 画幅宽</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const fullWidth = Math.round(naturalWidth * 0.9);
                      const centeredX = Math.round((naturalWidth - fullWidth) / 2);
                      updateSelectedLayer({ x: centeredX, width: fullWidth });
                    }}
                    className="px-2 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-lg text-[11px] font-medium border border-stone-700 transition flex items-center justify-center"
                    title="居中并撑开为 90% 宽画幅"
                  >
                    <span>居中 90% 宽</span>
                  </button>
                </div>
              </div>

              {/* Text Shadow Mode */}
              <div>
                <label className="text-xs font-semibold text-stone-300 block mb-1.5">
                  文字阴影 (Text Shadow)
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => updateSelectedLayer({ textShadow: false } as any)}
                    className={`py-1.5 rounded-lg text-xs font-medium border transition ${
                      (selectedLayer as any).textShadow === false || ((selectedLayer as any).textShadow === undefined && isDarkColor(selectedLayer.color))
                        ? 'bg-[#B28C5A] text-white border-[#B28C5A]'
                        : 'bg-stone-800 text-stone-400 border-stone-700'
                    }`}
                  >
                    纯净无阴影
                  </button>
                  <button
                    onClick={() => updateSelectedLayer({ textShadow: 'soft' } as any)}
                    className={`py-1.5 rounded-lg text-xs font-medium border transition ${
                      (selectedLayer as any).textShadow === 'soft' || ((selectedLayer as any).textShadow === undefined && !isDarkColor(selectedLayer.color))
                        ? 'bg-[#B28C5A] text-white border-[#B28C5A]'
                        : 'bg-stone-800 text-stone-400 border-stone-700'
                    }`}
                  >
                    柔和微光
                  </button>
                  <button
                    onClick={() => updateSelectedLayer({ textShadow: 'deep' } as any)}
                    className={`py-1.5 rounded-lg text-xs font-medium border transition ${
                      (selectedLayer as any).textShadow === 'deep'
                        ? 'bg-[#B28C5A] text-white border-[#B28C5A]'
                        : 'bg-stone-800 text-stone-400 border-stone-700'
                    }`}
                  >
                    立体浓影
                  </button>
                </div>
              </div>

              {/* Colors */}
              <div>
                <label className="text-xs font-semibold text-stone-300 block mb-1.5">
                  奢品色系预设
                </label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => updateSelectedLayer({ color: c.value })}
                      className={`h-8 rounded-xl border flex items-center justify-center transition-all ${
                        selectedLayer.color === c.value
                          ? 'scale-105 ring-2 ring-[#B28C5A] border-white'
                          : 'border-stone-700'
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 bg-stone-900 px-3 py-2 rounded-xl border border-stone-700">
                  <input
                    type="color"
                    value={selectedLayer.color || '#FFFFFF'}
                    onChange={e => updateSelectedLayer({ color: e.target.value })}
                    className="w-6 h-6 bg-transparent border-0 cursor-pointer rounded"
                  />
                  <span className="text-xs font-mono text-stone-300 uppercase">
                    {selectedLayer.color || '#FFFFFF'}
                  </span>
                </div>
              </div>

              {/* Letter Spacing & Line Height */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-stone-300 block mb-1">
                    字间距 ({selectedLayer.letterSpacing || 0}px)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    value={selectedLayer.letterSpacing || 0}
                    onChange={e => updateSelectedLayer({ letterSpacing: Number(e.target.value) || 0 })}
                    className="w-full accent-[#B28C5A] cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-stone-300 block mb-1">
                    行高 ({selectedLayer.lineHeight || 1.2})
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={2}
                    step={0.1}
                    value={selectedLayer.lineHeight || 1.2}
                    onChange={e => updateSelectedLayer({ lineHeight: Number(e.target.value) || 1.2 })}
                    className="w-full accent-[#B28C5A] cursor-pointer"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-stone-500 text-xs">
              <Type className="w-8 h-8 mx-auto mb-2 text-stone-600" />
              <p>请在画布中点击选中任意文字图层，以启用精细排版属性设置</p>
            </div>
          )}
        </aside>
      </div>
    </div>,
    document.body
  );
};
