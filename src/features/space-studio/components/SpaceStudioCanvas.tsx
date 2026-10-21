// src/features/space-studio/components/SpaceStudioCanvas.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera,
  Maximize2,
  Minimize2,
  Download,
  Loader2,
  FileImage,
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
  Sparkle,
  History,
  Columns,
  Users,
  Home,
  ChevronUp,
  ChevronDown,
  GripHorizontal,
  Tag,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import {
  ShotInstance,
  SceneMaster,
  ImageAspectRatio,
  IMAGE_ASPECT_SPECS,
  RenderResolution,
  calculateRenderDimensions,
  DisaggregatedProductItem,
  StylePreset,
  SpacePreset,
  GenerationJob
} from '../../../types/spaceStudio';
import { CandidateItem, ShotCandidateBatch } from '../../../types/spaceAssetLibrary';
import { SceneProductAnnotationOverlay } from './SceneProductAnnotationOverlay';
import { CanvasOutpaintOverlay, OutpaintParams } from './CanvasOutpaintOverlay';

/**
 * 健壮的原生 Blob 下载辅助函数，确保规范挂载 DOM 且遵循用户手势，避免 Edge/Chrome 丢弃文件名或降级为 UUID
 */
function safeDownloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) {
      a.parentNode.removeChild(a);
    }
    URL.revokeObjectURL(url);
  }, 2000);
}

interface SpaceStudioCanvasProps {
  activeShot: ShotInstance;
  sceneMaster: SceneMaster | null;
  aspectRatio: ImageAspectRatio;
  onChangeAspectRatio: (ratio: ImageAspectRatio) => void;
  resolution?: RenderResolution;
  onChangeResolution?: (res: RenderResolution) => void;
  isGenerating: boolean;
  onGenerateCurrent: () => void;
  onCancelRendering?: () => void;
  renderingShotCode?: string;
  onOutpaint?: (params: OutpaintParams) => Promise<void>;
  isOutpainting?: boolean;
  onOpenCompareModal?: () => void;
  onRenderHumanPass?: () => void;
  onSelectRevision?: (shotId: string, revisionId: string) => void;
  onDeleteRevision?: (shotId: string, revisionId: string) => void;

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

  // 全案产品 1~14 交互打标与镜头视锥联动
  annotations?: DisaggregatedProductItem[];
  showAnnotations?: boolean;
  onToggleShowAnnotations?: () => void;
  onSelectAnnotation?: (item: DisaggregatedProductItem | null) => void;
  onUpdateAnnotationPosition?: (
    id: string,
    newBoundingBox: { ymin: number; xmin: number; ymax: number; xmax: number }
  ) => void;
  onHideAnnotation?: (id: string) => void;
  // 空间场景与产品实时生图上下文 (支持智能扩图等下游工具实时继承)
  stylePreset?: StylePreset;
  spacePreset?: SpacePreset;
  styleName?: string;
  roomName?: string;
  productName?: string;
  productMaterial?: string;
  currentPositivePrompt?: string;
  selectedAnnotationId?: string | null;
  onLocateInDrawer?: (id: string) => void;
  currentJob?: GenerationJob | null;

  theme?: 'dark' | 'light';
  onOpenResetModal?: () => void;
  hasGenerations?: boolean;
}

export const SpaceStudioCanvas: React.FC<SpaceStudioCanvasProps> = ({
  activeShot,
  sceneMaster,
  aspectRatio,
  onChangeAspectRatio,
  resolution = '2K',
  onChangeResolution,
  isGenerating,
  onGenerateCurrent,
  onCancelRendering,
  renderingShotCode,
  onOutpaint,
  isOutpainting = false,
  onOpenCompareModal,
  onRenderHumanPass,
  onSelectRevision,
  onDeleteRevision,
  candidateBatch,
  selectedCandidateId,
  onSelectCandidate,
  onApplyCandidateAsFinal,
  onRegenerateBatch,
  onKeepSpaceRefreshModel,
  onKeepModelRefreshPose,
  onKeepProductRefreshScene,
  onToggleFavoriteCandidate,
  annotations,
  showAnnotations = false,
  onToggleShowAnnotations,
  onSelectAnnotation,
  onUpdateAnnotationPosition,
  onHideAnnotation,
  currentJob,
  selectedAnnotationId,
  onLocateInDrawer,
  stylePreset,
  spacePreset,
  styleName,
  roomName,
  productName,
  productMaterial,
  currentPositivePrompt,
  theme = 'dark',
  onOpenResetModal,
  hasGenerations
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRatioDropdownOpen, setIsRatioDropdownOpen] = useState(false);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [isResDropdownOpen, setIsResDropdownOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [isOutpaintingMode, setIsOutpaintingMode] = useState(false);
  const [imageAspect, setImageAspect] = useState<number | null>(null);

  // 视口交互状态：自由缩放 (Zoom) 与光标平移 (Pan)
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');
  const [imageError, setImageError] = useState<boolean>(false);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [triedFallback, setTriedFallback] = useState<boolean>(false);

  // 底部精修方案候选区：可折叠与自由拖拽调节高度
  const [isBatchDrawerCollapsed, setIsBatchDrawerCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('space_batch_drawer_collapsed') === 'true';
    }
    return false;
  });

  const [batchDrawerHeight, setBatchDrawerHeight] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('space_batch_drawer_height');
      const val = parseInt(saved || '200', 10);
      return !isNaN(val) && val >= 110 && val <= 450 ? val : 200;
    }
    return 200;
  });

  const [isResizingDrawer, setIsResizingDrawer] = useState<boolean>(false);
  const resizeStartY = useRef<number>(0);
  const resizeStartHeight = useRef<number>(200);

  const handleStartResizeDrawer = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingDrawer(true);
    resizeStartY.current = e.clientY;
    resizeStartHeight.current = batchDrawerHeight;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingDrawer) return;
      const deltaY = resizeStartY.current - e.clientY;
      const nextHeight = Math.max(110, Math.min(450, resizeStartHeight.current + deltaY));
      setBatchDrawerHeight(nextHeight);
    };

    const handleMouseUp = () => {
      if (isResizingDrawer) {
        setIsResizingDrawer(false);
        if (typeof window !== 'undefined') {
          localStorage.setItem('space_batch_drawer_height', String(batchDrawerHeight));
        }
      }
    };

    if (isResizingDrawer) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingDrawer, batchDrawerHeight]);

  const toggleCollapseBatchDrawer = () => {
    setIsBatchDrawerCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('space_batch_drawer_collapsed', String(next));
      }
      return next;
    });
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const isLight = theme === 'light';

  // Active revision image or sceneMaster image if active shot is A00
  const currentRevision = activeShot.revisions.find(
    (r) => r.id === activeShot.currentRevisionId
  ) || activeShot.revisions[activeShot.revisions.length - 1];

  // Base revision for comparison (prefer scene revision without human, or first revision)
  const baseRevision = activeShot.revisions.find(
    (r) => r.revisionType === 'scene' || (!r.id.includes('human') && r.id !== currentRevision?.id)
  ) || activeShot.revisions[activeShot.revisions.length - 1];

  const primaryKey = currentRevision?.objectKey || (activeShot.templateCode === 'A00' ? sceneMaster?.objectKey : undefined);
  const localFileUrl = primaryKey ? `/api/space/storage/local-file?key=${encodeURIComponent(primaryKey)}` : undefined;

  // 1. 严格版本类型与批次语义提取（判定是否包含人物/模特）
  const isRevisionHuman = Boolean(
    currentRevision?.revisionType === 'human' ||
    currentRevision?.id?.includes('human') ||
    currentRevision?.label?.includes('模特') ||
    currentRevision?.label?.includes('人物')
  );

  const isBatchHuman = Boolean(
    candidateBatch?.candidates?.some((c) =>
      Boolean(
        c.summaryTag?.includes('人物') ||
        c.summaryTag?.includes('模特') ||
        c.summaryTag?.toLowerCase().includes('human') ||
        c.id?.includes('human') ||
        (c as any)?.isHumanPass
      )
    )
  );

  // 2. 校验当前候选批次（candidateBatch）是否与当前选中的版本（currentRevision）匹配：
  // 严格同构校验：纯空间版本只能匹配纯空间批次，绝不匹配人物批次；人物版本同理
  const isCandidateBatchMatchingCurrentRevision = Boolean(
    candidateBatch &&
    currentRevision &&
    isRevisionHuman === isBatchHuman &&
    (
      candidateBatch.candidates.some((c) => c.id === currentRevision.promptSnapshotId) ||
      (!isBatchHuman && !isRevisionHuman) ||
      (isBatchHuman && isRevisionHuman)
    )
  );

  // 3. 提取候选首选项（仅在批次同构匹配时生效）
  const activeCandidate = isCandidateBatchMatchingCurrentRevision
    ? (candidateBatch?.candidates.find((c) => c.id === selectedCandidateId) || candidateBatch?.candidates[0])
    : undefined;

  // 4. 定稿版本图片：当前选中的版本已有明确定稿图片时优先
  const revisionFinalUrl = !triedFallback
    ? (currentRevision?.imageUrl || (activeShot.templateCode === 'A00' ? sceneMaster?.imageUrl : undefined))
    : undefined;

  // 5. 核心图片优先级校正：
  // 当用户在顶栏显式点击切换历史版本（如 纯空间 (v1)）时，画布强制优先展示当前选中版本的 currentRevision.imageUrl；
  // 仅在候选批次严格匹配、且用户在底部明确选择品鉴某张候选卡片时，才展示该候选卡片；
  // 异构候选方案（如查看纯空间时残存的人物卡片）绝不遮蔽画布！
  const isExplicitCandidateSelected = Boolean(
    selectedCandidateId &&
    isCandidateBatchMatchingCurrentRevision &&
    candidateBatch?.candidates?.some((c) => c.id === selectedCandidateId)
  );

  const rawCandidateUrl =
    (isExplicitCandidateSelected ? activeCandidate?.imageUrl : undefined) ||
    revisionFinalUrl ||
    (isCandidateBatchMatchingCurrentRevision ? activeCandidate?.imageUrl : undefined) ||
    localFileUrl;

  const currentImageUrl =
    typeof rawCandidateUrl === 'string' && rawCandidateUrl.trim().length > 0
      ? rawCandidateUrl.trim()
      : undefined;

  const isFailed = !isGenerating && (
    activeShot.status === 'failed' ||
    (currentJob?.status === 'failed' && currentJob?.targetCode === activeShot.templateCode)
  );

  const failureError =
    activeShot.error ||
    (currentJob?.status === 'failed' && currentJob?.targetCode === activeShot.templateCode ? currentJob.error : '') ||
    '上游模型调用异常或网络连接超时 (300s)';

  // 当切换镜头或图片重置时，平滑重设视口与状态
  useEffect(() => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
    setImageError(false);
    setImageLoaded(false);
    setImageAspect(null);
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

  // Derive aspect ratio CSS classes (without hardcoded max-width barriers)
  const getAspectRatioClass = (ratio: ImageAspectRatio) => {
    switch (ratio) {
      case '3:4':
        return 'aspect-[3/4]';
      case '16:9':
        return 'aspect-[16/9]';
      case '1:1':
        return 'aspect-square';
      case '4:3':
        return 'aspect-[4/3]';
      case '9:16':
        return 'aspect-[9/16]';
      case '2:3':
        return 'aspect-[2/3]';
      case '3:2':
        return 'aspect-[3/2]';
      default:
        return 'aspect-[4/3]';
    }
  };

  const getAspectRatioNumeric = (ratio: ImageAspectRatio): number => {
    switch (ratio) {
      case '16:9': return 16 / 9;
      case '4:3': return 4 / 3;
      case '3:2': return 3 / 2;
      case '1:1': return 1;
      case '3:4': return 3 / 4;
      case '2:3': return 2 / 3;
      case '9:16': return 9 / 16;
      default: return 4 / 3;
    }
  };

  const handleDownloadFullResolution = async (format: 'jpg' | 'png' = 'jpg') => {
    if (!currentImageUrl || isDownloading) return;
    setIsDownloading(true);
    setIsDownloadMenuOpen(false);

    try {
      // 1. 若当前图具备服务端存储 Key，优先直连服务端 Lanczos3 超采样导出接口（保证 3MB~12MB 纯正画质与规范文件名）
      if (primaryKey) {
        const exportUrl = `/api/space/storage/export-image?key=${encodeURIComponent(
          primaryKey
        )}&format=${format}&resolution=${encodeURIComponent(
          resolution || '4K'
        )}&shotCode=${encodeURIComponent(activeShot.templateCode)}`;

        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = exportUrl;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          if (a.parentNode) {
            a.parentNode.removeChild(a);
          }
          setIsDownloading(false);
        }, 1500);
        return;
      }

      // 2. 若无服务端 Key（纯临时/第三方 URL），启动前端离屏 Canvas 高保真渲染
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = currentImageUrl;
      });

      // 计算期望的输出物理分辨率（若当前指定了 4K，确保导出像素不低于 4096）
      const dimInfo = calculateRenderDimensions(aspectRatio, resolution || '2K');
      let targetW = img.naturalWidth || dimInfo.width;
      let targetH = img.naturalHeight || dimInfo.height;

      // 如果用户当前设定了 4K，且原图小于 4K，执行高精超采样导出
      if (resolution === '4K' && targetW < 3800) {
        targetW = dimInfo.width; // 4096
        targetH = dimInfo.height; // 3072
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法初始化离屏渲染上下文');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      if (format === 'jpg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetW, targetH);
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      const quality = format === 'png' ? undefined : 0.98; // 98% 工业级摄影画册无损高保真

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            fallbackDirectDownload(format);
            return;
          }
          const fileName = `MANWAH_${activeShot.templateCode}_${resolution || '2K'}_${targetW}x${targetH}.${format}`;
          safeDownloadBlob(blob, fileName);
          setIsDownloading(false);
        },
        mimeType,
        quality
      );
    } catch (e) {
      console.warn('高保真导出受限，启动保真直链下载:', e);
      fallbackDirectDownload(format);
    }
  };

  const fallbackDirectDownload = async (format: 'jpg' | 'png') => {
    if (!currentImageUrl) return;
    const fileName = `MANWAH_${activeShot.templateCode}_${aspectRatio.replace(':', 'x')}.${format}`;
    try {
      const response = await fetch(currentImageUrl);
      const blob = await response.blob();
      safeDownloadBlob(blob, fileName);
    } catch {
      const a = document.createElement('a');
      a.href = currentImageUrl;
      a.setAttribute('download', fileName);
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (a.parentNode) {
          a.parentNode.removeChild(a);
        }
      }, 1500);
    } finally {
      setIsDownloading(false);
    }
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
          isLight ? 'bg-white/95 border-stone-200 text-stone-800 shadow-2xs' : 'bg-[#161822]/90 border-white/10 text-stone-100'
        }`}
      >
        {/* Left: Active Shot Tag */}
        <div className="flex items-center gap-2.5">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${
            isLight ? 'bg-stone-50 border-stone-200 text-stone-900 shadow-2xs font-medium' : 'bg-black/40 border-white/10 text-white'
          }`}>
            <span className={`font-mono font-bold ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>{activeShot.templateCode}</span>
            <span className={isLight ? 'text-stone-300' : 'text-neutral-500'}>·</span>
            <span className="font-semibold">{activeShot.name}</span>
          </div>

          <span className={`hidden sm:inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded border ${
            isLight ? 'bg-stone-100/90 border-stone-200 text-stone-600' : 'bg-black/20 border-white/5 text-neutral-400'
          }`}>
            <span>{activeShot.camera.lensMm}mm</span>
            <span>·</span>
            <span>{activeShot.camera.heightCm}cm 黄金机位</span>
            <span>·</span>
            <span className={`font-semibold ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>黄金分割构图</span>
          </span>

          {activeShot.templateCode !== 'A00' && sceneMaster?.isLocked && (
            <span className={`hidden md:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${
              isLight ? 'text-emerald-800 bg-emerald-50 border-emerald-300' : 'text-emerald-300 bg-emerald-950/60 border-emerald-800/60'
            }`}>
              <ShieldCheck className={`w-3 h-3 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`} />
              <span>A00 空间与家具世界已锁定</span>
            </span>
          )}

          {isFailed ? (
            <span className={`flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full border font-semibold ${
              isLight ? 'text-rose-800 bg-rose-50 border-rose-300' : 'text-rose-400 bg-rose-950/60 border-rose-800/60'
            }`}>
              <AlertCircle className="w-2.5 h-2.5" /> 生成失败/异常
            </span>
          ) : currentImageUrl && !imageError ? (
            <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
              isLight ? 'text-emerald-800 bg-emerald-50 border-emerald-300' : 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60'
            }`}>
              <CheckCircle2 className="w-2.5 h-2.5" /> 渲染完成
            </span>
          ) : isGenerating ? (
            <span className={`flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full animate-pulse font-semibold border ${
              isLight ? 'text-amber-900 bg-amber-100 border-amber-300' : 'text-amber-300 bg-amber-500/20 border-amber-500/40'
            }`}>
              <RefreshCw className="w-2.5 h-2.5 animate-spin" /> 正在生成 4 候选...
            </span>
          ) : (
            <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${
              isLight ? 'text-stone-500 bg-stone-100 border-stone-200' : 'text-neutral-400 bg-black/30 border-white/10'
            }`}>
              待渲染
            </span>
          )}

          {/* 镜头生成历史版本快速切换条 (同镜头多版本秒级切换对比) */}
          {activeShot.revisions.length > 1 && (
            <div className={`hidden md:flex items-center gap-1 px-1.5 py-0.5 rounded-lg border text-xs ${
              isLight ? 'bg-stone-100/90 border-stone-200 shadow-2xs' : 'bg-black/40 border-white/10'
            }`}>
              <span className="text-[10px] text-amber-500 font-bold flex items-center gap-0.5 px-1">
                <History className="w-3 h-3" />
                <span>历史版本({activeShot.revisions.length}):</span>
              </span>
              {activeShot.revisions.map((rev, revIdx) => {
                const isSelected = rev.id === activeShot.currentRevisionId || (!activeShot.currentRevisionId && revIdx === 0);
                const isHuman = rev.revisionType === 'human' || rev.id.includes('human');
                const isOutpaint = rev.id.includes('outpaint') || rev.label?.includes('扩图');
                return (
                  <button
                    key={rev.id}
                    onClick={() => onSelectRevision?.(activeShot.id, rev.id)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition flex items-center gap-1 cursor-pointer ${
                      isSelected
                        ? isHuman
                          ? 'bg-purple-600 text-white shadow-xs'
                          : isOutpaint
                          ? 'bg-cyan-600 text-white shadow-xs'
                          : 'bg-amber-500 text-black shadow-xs'
                        : isLight ? 'text-stone-600 hover:bg-stone-200' : 'text-neutral-400 hover:text-white hover:bg-white/10'
                    }`}
                    title={`${rev.label || `版本 ${rev.revisionNumber}`} (点击切换当前视图)`}
                  >
                    {isOutpaint ? <Maximize2 className="w-2.5 h-2.5" /> : isHuman ? <Users className="w-2.5 h-2.5" /> : <Layers className="w-2.5 h-2.5" />}
                    <span>{isOutpaint ? '扩图版' : isHuman ? '人物版' : '纯空间'} (v{rev.revisionNumber || (activeShot.revisions.length - revIdx)})</span>
                  </button>
                );
              })}
              {/* 前后对比按钮 */}
              <button
                onClick={() => setIsCompareMode(!isCompareMode)}
                className={`ml-1 px-2 py-0.5 rounded text-[10px] font-bold border transition flex items-center gap-1 cursor-pointer ${
                  isCompareMode
                    ? 'bg-amber-500 text-black border-amber-400 shadow-xs'
                    : isLight ? 'border-stone-300 text-stone-700 hover:bg-stone-200' : 'border-white/10 text-neutral-300 hover:bg-white/10'
                }`}
                title="同镜头前后版本对比模式（纯空间 vs 人物入座）"
              >
                <Columns className="w-2.5 h-2.5" />
                <span>{isCompareMode ? '退出对比' : '前后对比'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Right: Tools & Aspect Ratio */}
        <div className="flex items-center gap-2">
          {/* 清除记录 / 新建作业 快捷入口 */}
          {onOpenResetModal && (
            <button
              onClick={onOpenResetModal}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition cursor-pointer shadow-2xs ${
                isLight
                  ? 'border-amber-300/80 bg-amber-50/90 hover:bg-amber-100/90 text-amber-900'
                  : 'border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300'
              }`}
              title="清除当前页面生成记录，方便开始新作业"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="hidden sm:inline">新建作业 / 清空记录</span>
            </button>
          )}

          {/* Resolution Badge & Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsResDropdownOpen(!isResDropdownOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition cursor-pointer ${
                isLight
                  ? 'border-stone-200 bg-white hover:bg-stone-50 text-stone-800 shadow-2xs'
                  : 'border-white/10 bg-black/40 hover:bg-black/60 text-neutral-200'
              }`}
              title="切换当前镜头出图精度 (Resolution)"
            >
              <span className="font-bold text-amber-500 font-mono">{resolution}</span>
              <span className={`text-[10px] ${isLight ? 'text-stone-500' : 'text-neutral-400'}`}>
                {calculateRenderDimensions(aspectRatio, resolution).text.replace(' px', '')}
              </span>
            </button>

            {isResDropdownOpen && (
              <div className={`absolute right-0 top-full mt-1 w-52 border rounded-xl shadow-2xl p-1.5 z-50 space-y-1 ${
                isLight ? 'bg-white border-stone-200 text-stone-800' : 'bg-[#161822] border-white/15 text-neutral-200'
              }`}>
                <div className={`px-2 py-1 text-[10px] font-semibold border-b ${isLight ? 'border-stone-100 text-stone-400' : 'border-white/10 text-neutral-400'}`}>
                  选择出图精度 (Resolution)
                </div>
                {(['1K', '2K', '4K'] as const).map((r) => {
                  const isSelected = r === resolution;
                  const dim = calculateRenderDimensions(aspectRatio, r);
                  const title = r === '1K' ? '1K 快速预览' : r === '2K' ? '2K 旗舰超清' : '4K 展厅大片';
                  return (
                    <button
                      key={r}
                      onClick={() => {
                        onChangeResolution?.(r);
                        setIsResDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition cursor-pointer ${
                        isSelected
                          ? isLight ? 'bg-amber-100 text-amber-900 font-semibold' : 'bg-amber-500/20 text-amber-300 font-semibold'
                          : isLight ? 'text-stone-700 hover:bg-stone-100' : 'text-neutral-300 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-mono font-bold">{title}</span>
                        <span className="text-[10px] opacity-60 font-mono">{dim.text}</span>
                      </div>
                      {isSelected && <span className="text-[10px] text-amber-500 font-bold font-mono">当前</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Aspect Ratio Selector */}
          <div className="relative">
            <button
              onClick={() => setIsRatioDropdownOpen(!isRatioDropdownOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition cursor-pointer ${
                isLight
                  ? 'border-stone-200 bg-white hover:bg-stone-50 text-stone-800 shadow-2xs'
                  : 'border-white/10 bg-black/40 hover:bg-black/60 text-neutral-200'
              }`}
              title="切换画幅比例"
            >
              <Ratio className={`w-3.5 h-3.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
              <span>{IMAGE_ASPECT_SPECS[aspectRatio]?.label || aspectRatio}</span>
            </button>

            {isRatioDropdownOpen && (
              <div className={`absolute right-0 top-full mt-1 w-56 border rounded-xl shadow-2xl p-1.5 z-50 space-y-1 ${
                isLight ? 'bg-white border-stone-200 text-stone-800' : 'bg-[#161822] border-white/15 text-neutral-200'
              }`}>
                <div className={`px-2 py-1 text-[10px] font-semibold border-b ${isLight ? 'border-stone-100 text-stone-400' : 'border-white/10 text-neutral-400'}`}>
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
                            ? isLight ? 'bg-amber-100 text-amber-900 font-semibold' : 'bg-amber-500/20 text-amber-300 font-semibold'
                            : isLight ? 'text-stone-700 hover:bg-stone-100' : 'text-neutral-300 hover:bg-white/5'
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

          {/* Download Button with Format Options */}
          {currentImageUrl && !imageError && (
            <div className="relative">
              <div className="flex items-center">
                <button
                  onClick={() => handleDownloadFullResolution('jpg')}
                  disabled={isDownloading}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-l-lg border transition cursor-pointer text-xs font-medium disabled:opacity-50 ${
                    isLight
                      ? 'border-stone-200 bg-white hover:bg-stone-50 text-stone-700 hover:text-stone-900 shadow-2xs'
                      : 'border-white/10 bg-black/40 hover:bg-black/60 text-neutral-300 hover:text-white'
                  }`}
                  title="下载高保真画册原图 (JPEG 98% 超清品质)"
                >
                  {isDownloading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-amber-500" />
                  )}
                  <span className="hidden sm:inline font-mono text-[11px]">导出原图</span>
                </button>

                <button
                  onClick={() => setIsDownloadMenuOpen(!isDownloadMenuOpen)}
                  disabled={isDownloading}
                  className={`px-1.5 py-1 rounded-r-lg border-y border-r transition cursor-pointer text-xs disabled:opacity-50 ${
                    isLight
                      ? 'border-stone-200 bg-white hover:bg-stone-50 text-stone-600 hover:text-stone-900 shadow-2xs'
                      : 'border-white/10 bg-black/40 hover:bg-black/60 text-neutral-300 hover:text-white'
                  }`}
                  title="选择导出格式与品质"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {isDownloadMenuOpen && (
                <div className={`absolute right-0 top-full mt-1 w-64 border rounded-xl shadow-2xl p-1.5 z-50 space-y-1 ${
                  isLight ? 'bg-white border-stone-200 text-stone-800' : 'bg-[#161822] border-white/15 text-neutral-200'
                }`}>
                  <div className={`px-2 py-1 text-[10px] font-semibold border-b ${isLight ? 'border-stone-100 text-stone-400' : 'border-white/10 text-neutral-400'}`}>
                    选择原图导出规格
                  </div>

                  <button
                    onClick={() => handleDownloadFullResolution('jpg')}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between transition cursor-pointer ${
                      isLight ? 'hover:bg-amber-50 text-stone-800' : 'hover:bg-amber-500/10 text-neutral-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FileImage className="w-4 h-4 text-amber-500 shrink-0" />
                      <div>
                        <div className="font-bold flex items-center gap-1">
                          <span>超清 JPEG (推荐)</span>
                          <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-500 font-mono">98% 质量</span>
                        </div>
                        <div className="text-[10px] opacity-60">体积约 3~6 MB · 保持真实物理尺寸</div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleDownloadFullResolution('png')}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between transition cursor-pointer ${
                      isLight ? 'hover:bg-amber-50 text-stone-800' : 'hover:bg-amber-500/10 text-neutral-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div>
                        <div className="font-bold flex items-center gap-1">
                          <span>无损原画 PNG</span>
                          <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-500 font-mono">100% 无损</span>
                        </div>
                        <div className="text-[10px] opacity-60">体积约 8~18 MB · 工业印刷级无损</div>
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Maximize Canvas / Toggle Candidates Button */}
          {candidateBatch && candidateBatch.candidates.length > 0 && (
            <button
              onClick={toggleCollapseBatchDrawer}
              className={`px-2 py-1 rounded-lg border transition cursor-pointer flex items-center gap-1.5 text-xs ${
                isBatchDrawerCollapsed
                  ? isLight
                    ? 'border-amber-400 bg-amber-100 text-amber-900 font-bold shadow-xs'
                    : 'border-amber-500/50 bg-amber-500/20 text-amber-300 font-bold shadow-xs'
                  : isLight
                  ? 'border-stone-200 bg-white hover:bg-stone-50 text-stone-700 shadow-2xs'
                  : 'border-white/10 bg-black/40 hover:bg-black/60 text-neutral-300 hover:text-white'
              }`}
              title={isBatchDrawerCollapsed ? '展开精修方案抽屉' : '收起方案抽屉以最大化主视窗'}
            >
              {isBatchDrawerCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline text-[11px]">
                {isBatchDrawerCollapsed ? '展开方案' : '最大化主图'}
              </span>
            </button>
          )}

          {/* Product Annotations 1~14 Toggle Button */}
          {annotations && annotations.length > 0 && (
            <button
              onClick={onToggleShowAnnotations}
              className={`px-2 py-1 rounded-lg border transition cursor-pointer flex items-center gap-1.5 text-xs ${
                showAnnotations
                  ? isLight
                    ? 'border-rose-400 bg-rose-50 text-rose-900 font-bold shadow-xs'
                    : 'border-rose-500/50 bg-rose-950/40 text-rose-300 font-bold shadow-xs'
                  : isLight
                  ? 'border-stone-200 bg-white hover:bg-stone-50 text-stone-700 shadow-2xs'
                  : 'border-white/10 bg-black/40 hover:bg-black/60 text-neutral-300 hover:text-white'
              }`}
              title={showAnnotations ? '隐藏 1~14 产品标注' : '显示 1~14 全案产品交互标注与视锥联动'}
            >
              <Tag className={`w-3.5 h-3.5 ${showAnnotations ? 'text-rose-500' : 'text-amber-500'}`} />
              <span className="hidden sm:inline text-[11px]">
                空间打标 ({annotations.length})
              </span>
            </button>
          )}

          {/* Fullscreen Button */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              isLight
                ? 'border-stone-200 bg-white hover:bg-stone-50 text-stone-700 hover:text-stone-900 shadow-2xs'
                : 'border-white/10 bg-black/40 hover:bg-black/60 text-neutral-300 hover:text-white'
            }`}
            title={isFullscreen ? '退出全屏' : '全屏品鉴'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 2. CENTER ARTWORK STAGE (Adaptive Full-Bleed Flex Layout) */}
      <main className="flex-1 min-h-0 w-full flex flex-col items-center justify-between p-2 sm:p-3 relative overflow-hidden">
        {/* Main Artwork Stage Viewport (Maximized Physical Area) */}
        <div className="flex-1 min-h-0 w-full flex items-center justify-center relative overflow-hidden p-1">
          <div
            ref={containerRef}
            style={{
              aspectRatio: `${getAspectRatioNumeric(aspectRatio)}`
            }}
            className={`relative max-w-full max-h-full h-auto w-auto rounded-2xl border overflow-hidden flex items-center justify-center transition-all duration-150 ${
              isLight
                ? 'bg-[#FAF8F5] border-stone-300/80 shadow-md text-stone-800'
                : 'bg-black/60 border-white/10 shadow-2xl text-white'
            } group`}
          >
            <AnimatePresence mode="wait">
            <motion.div
              key={`${activeShot.id}-${activeShot.currentRevisionId || 'rev0'}-${currentImageUrl ? 'img' : isGenerating ? 'gen' : isFailed ? 'fail' : 'empty'}`}
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.01 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full flex items-center justify-center relative overflow-hidden"
            >
              {/* 若已有历史图纸但最新一次重试报错，顶部显式挂载浮动警告条 */}
              {isFailed && currentImageUrl && !imageError && (
                <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 px-4 py-2 rounded-xl border shadow-lg backdrop-blur-md max-w-lg ${
                  isLight ? 'bg-rose-50/95 border-rose-300 text-rose-900' : 'bg-rose-950/95 border-rose-700 text-rose-200'
                }`}>
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                  <div className="text-[11px] flex-1 leading-tight line-clamp-2">
                    <span className="font-bold">生成异常提示：</span>{failureError}
                  </div>
                  <button
                    onClick={onGenerateCurrent}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>重试</span>
                  </button>
                </div>
              )}
              {/* Interactive Viewport */}
              {isCompareMode && baseRevision?.imageUrl && currentImageUrl && baseRevision.imageUrl !== currentImageUrl ? (
                <div className="relative w-full h-full flex items-center divide-x divide-amber-500/30 overflow-hidden bg-black/80">
                  {/* Left: Base Version (纯空间家具场景) */}
                  <div className="relative flex-1 h-full flex items-center justify-center overflow-hidden group/left">
                    <img
                      src={baseRevision.imageUrl}
                      alt="Base Space"
                      className="w-full h-full object-contain select-none"
                    />
                    <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-black/80 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1 backdrop-blur-md">
                      <Home className="w-3 h-3 text-emerald-400" />
                      <span>纯空间场景 (v{baseRevision.revisionNumber || 1})</span>
                    </div>
                  </div>
                  {/* Right: Current Version (人物入座版) */}
                  <div className="relative flex-1 h-full flex items-center justify-center overflow-hidden group/right">
                    <img
                      src={currentImageUrl}
                      alt="Human Pass"
                      className="w-full h-full object-contain select-none"
                    />
                    <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-purple-950/80 text-amber-300 border border-purple-400/30 text-[10px] font-bold flex items-center gap-1 backdrop-blur-md">
                      <Users className="w-3 h-3 text-amber-400" />
                      <span>人物入座方案 (当前已选)</span>
                    </div>
                  </div>
                  {/* Center Divider Tag */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-2.5 py-1 rounded-full bg-amber-500 text-black font-extrabold text-[10px] shadow-lg pointer-events-none tracking-wider flex items-center gap-1 z-30">
                    <Columns className="w-3 h-3" />
                    <span>A/B 对比</span>
                  </div>
                </div>
              ) : currentImageUrl && !imageError ? (
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
                    {/* 关键：真实图片边界容器 (Strict Image Content Box) */}
                    {/* 当 fitMode 为 contain 时，严格约束宽高比使容器边界 100% 贴合实际图片像素，彻底消除 Letterbox/Pillarbox 导致的打标偏位 */}
                    <div
                      className={`relative flex items-center justify-center ${
                        fitMode === 'cover' ? 'w-full h-full' : 'max-w-full max-h-full'
                      }`}
                      style={{
                        aspectRatio: imageAspect ? `${imageAspect}` : undefined
                      }}
                    >
                      <img
                        src={currentImageUrl}
                        alt={activeShot.name}
                        onLoad={(e) => {
                          setImageLoaded(true);
                          setImageError(false);
                          const { naturalWidth, naturalHeight } = e.currentTarget;
                          if (naturalWidth && naturalHeight) {
                            setImageAspect(naturalWidth / naturalHeight);
                          }
                        }}
                        onError={handleImageError}
                        className={`w-full h-full select-none block ${
                          fitMode === 'cover' ? 'object-cover' : 'object-contain'
                        } ${!imageLoaded ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
                        crossOrigin="anonymous"
                        referrerPolicy="no-referrer"
                        draggable={false}
                      />

                      {/* Scene Product Annotation Overlay 1~14 with Frustum Linkage */}
                      {annotations && annotations.length > 0 && imageLoaded && (
                        <SceneProductAnnotationOverlay
                          annotations={annotations}
                          activeShotCode={activeShot.templateCode}
                          selectedAnnotationId={selectedAnnotationId || null}
                          onSelectAnnotation={onSelectAnnotation || (() => {})}
                          onUpdateAnnotationPosition={onUpdateAnnotationPosition}
                          onHideAnnotation={onHideAnnotation}
                          onClose={() => onSelectAnnotation?.(null)}
                          onLocateInDrawer={onLocateInDrawer}
                          visible={showAnnotations}
                        />
                      )}
                    </div>
                  </div>

                  {!imageLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-xs">
                      <RefreshCw className="w-6 h-6 text-amber-400 animate-spin" />
                    </div>
                  )}

                  {/* 智能扩图交互图层 (Canvas Crop & Expand Handles Overlay) */}
                  {isOutpaintingMode && (
                    <CanvasOutpaintOverlay
                      currentImageUrl={currentImageUrl}
                      imageAspect={imageAspect}
                      shotCode={activeShot.templateCode}
                      roomName={roomName || activeShot.name}
                      styleName={styleName || stylePreset?.name?.split(' (')[0] || '都会收藏家'}
                      stylePreset={stylePreset}
                      spacePreset={spacePreset}
                      productName={productName}
                      productMaterial={productMaterial}
                      currentPositivePrompt={currentPositivePrompt}
                      isGenerating={isOutpainting}
                      onConfirmOutpaint={async (params) => {
                        if (onOutpaint) {
                          await onOutpaint(params);
                          setIsOutpaintingMode(false);
                        }
                      }}
                      onCancel={() => setIsOutpaintingMode(false)}
                      onCancelRendering={onCancelRendering}
                      theme={theme}
                    />
                  )}

                  {/* Watermark in bottom right */}
                  <div className={`absolute bottom-3 right-3 px-2.5 py-1 rounded-md backdrop-blur-md border text-[10px] font-mono pointer-events-none flex items-center gap-1.5 ${
                    isLight ? 'bg-white/80 border-stone-200 text-stone-600 shadow-2xs' : 'bg-black/70 border-white/10 text-neutral-300'
                  }`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span>MANWAH · 视觉驱动摄影母版</span>
                  </div>

                  {/* FLOATING INTERACTION HUD */}
                  <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2.5 py-1 rounded-full backdrop-blur-xl border shadow-xl ${
                    isLight ? 'bg-white/95 border-stone-200 text-stone-800' : 'bg-black/80 border-white/15 text-white'
                  }`}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleZoomChange(-0.25);
                      }}
                      className={`p-1.5 rounded-full transition cursor-pointer ${
                        isLight ? 'hover:bg-stone-100 text-stone-600' : 'hover:bg-white/10 text-neutral-300'
                      }`}
                      title="缩小 (-25%)"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleResetTransform();
                      }}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold min-w-[48px] text-center cursor-pointer ${
                        isLight ? 'text-amber-800' : 'text-amber-400'
                      }`}
                    >
                      {Math.round(zoom * 100)}%
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleZoomChange(0.25);
                      }}
                      className={`p-1.5 rounded-full transition cursor-pointer ${
                        isLight ? 'hover:bg-stone-100 text-stone-600' : 'hover:bg-white/10 text-neutral-300'
                      }`}
                      title="放大 (+25%)"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>

                    <div className={`w-px h-3.5 mx-0.5 ${isLight ? 'bg-stone-200' : 'bg-white/20'}`} />

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFitMode((prev) => (prev === 'contain' ? 'cover' : 'contain'));
                      }}
                      className={`px-2 py-1 rounded-md text-[10px] font-medium transition flex items-center gap-1 cursor-pointer ${
                        fitMode === 'cover'
                          ? isLight ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
                          : isLight ? 'hover:bg-stone-100 text-stone-600' : 'hover:bg-white/10 text-neutral-300'
                      }`}
                    >
                      {fitMode === 'contain' ? <Scan className="w-3 h-3" /> : <Maximize className="w-3 h-3" />}
                      <span>{fitMode === 'contain' ? '适应' : '填满'}</span>
                    </button>

                    <div className={`w-px h-3.5 mx-0.5 ${isLight ? 'bg-stone-200' : 'bg-white/20'}`} />

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOutpaintingMode(true);
                      }}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold transition flex items-center gap-1 cursor-pointer border ${
                        isOutpaintingMode
                          ? 'bg-amber-500 text-black border-amber-400 shadow-xs'
                          : isLight ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300/80 shadow-2xs' : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/30'
                      }`}
                      title="智能扩图 (直接拖拽边框手柄向四周/左右/上下延展大视窗)"
                    >
                      <Maximize2 className="w-3 h-3 text-amber-500" />
                      <span>智能扩图</span>
                    </button>

                    {(zoom !== 1.0 || pan.x !== 0 || pan.y !== 0) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResetTransform();
                        }}
                        className={`p-1.5 rounded-full transition cursor-pointer ${
                          isLight ? 'hover:bg-stone-100 text-amber-700' : 'hover:bg-white/10 text-amber-400'
                        }`}
                        title="复位视口"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ) : isFailed ? (
                <div className={`flex flex-col items-center justify-center p-6 text-center space-y-3.5 max-w-md mx-4 rounded-2xl border ${
                  isLight ? 'bg-rose-50/95 border-rose-200 text-stone-800 shadow-sm' : 'bg-rose-950/30 border-rose-900/60 text-white shadow-xl'
                }`}>
                  <div className="w-12 h-12 rounded-2xl border border-rose-500/40 bg-rose-500/15 text-rose-500 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-rose-500" />
                  </div>
                  <div className="space-y-1.5 w-full">
                    <h4 className={`text-sm font-bold ${isLight ? 'text-rose-900' : 'text-rose-300'}`}>
                      模型生成未完成 / 接口异常响应
                    </h4>
                    <div className={`text-xs px-3 py-2 rounded-lg border font-mono break-all leading-relaxed text-left max-h-36 overflow-y-auto ${
                      isLight ? 'bg-white border-rose-200 text-rose-700' : 'bg-black/50 border-rose-800/60 text-rose-300'
                    }`}>
                      {failureError}
                    </div>
                  </div>
                  <p className={`text-[11px] leading-relaxed text-left ${isLight ? 'text-stone-600' : 'text-neutral-400'}`}>
                    💡 <strong>故障容灾提示：</strong>若当前选定模型网络超时或上游接口不可用，可在右侧控制面板开启<strong className="text-amber-500 font-bold">【多模型故障自动轮换 (Auto-Fallback)】</strong>，系统将在主模型失败时自动顺延轮换（Gemini 3.1 ➔ GPT 2.5 ➔ GPT 2 系列）。
                  </p>
                  <div className="flex items-center gap-2.5 pt-1">
                    <button
                      onClick={onGenerateCurrent}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>立即重试生成</span>
                    </button>
                  </div>
                </div>
              ) : imageError ? (
                <div className="flex flex-col items-center justify-center p-8 text-center space-y-3 max-w-sm">
                  <div className="w-12 h-12 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-400 flex items-center justify-center">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h4 className={`text-xs font-bold ${isLight ? 'text-stone-800' : 'text-white'}`}>图像读取异常</h4>
                  <button
                    onClick={onGenerateCurrent}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>重新生成当前画面</span>
                  </button>
                </div>
              ) : isGenerating ? (
                <div className={`w-full h-full flex flex-col items-center justify-center gap-3 p-8 text-center ${
                  isLight ? 'bg-white/95' : 'bg-black/80'
                }`}>
                  <div className="relative">
                    <div className="w-14 h-14 rounded-full border-2 border-amber-500/30 border-t-amber-500 animate-spin" />
                    <Camera className="w-6 h-6 text-amber-500 absolute inset-0 m-auto animate-pulse" />
                  </div>
                  <div className={`text-xs font-bold ${isLight ? 'text-amber-900' : 'text-amber-300'}`}>
                    AI 摄影大模型正在计算渲染方案...
                  </div>
                  <p className={`text-[10px] max-w-xs ${isLight ? 'text-stone-500' : 'text-neutral-400'}`}>
                    正在执行空间几何锁定、模特面容对齐与落座物理真值护航
                  </p>
                  {onCancelRendering && (
                    <button
                      type="button"
                      onClick={onCancelRendering}
                      className="mt-2 px-4 py-2 rounded-xl border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                    >
                      <XCircle className="w-4 h-4 text-rose-500" />
                      <span>打断本次计算</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center space-y-3 max-w-sm">
                  <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${
                    isLight ? 'border-amber-300/80 bg-amber-100/70 text-amber-800' : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                  }`}>
                    <Camera className="w-6 h-6" />
                  </div>
                  <h4 className={`text-xs font-bold ${isLight ? 'text-stone-900' : 'text-white'}`}>
                    {activeShot.templateCode} · {activeShot.name}
                  </h4>
                  <p className={`text-[11px] leading-relaxed ${isLight ? 'text-stone-500' : 'text-neutral-400'}`}>
                    {(() => {
                      if (activeShot.templateCode === 'A00') {
                        return '当前为 A00 空间母版。点击下方按钮生成并锁定空间世界（户型·家具·材质真值），确立全案镜头的物理基准。';
                      }
                      let assetTargetName = '独立产品真值资产';
                      if (activeShot.templateCode === 'A09') {
                        assetTargetName = '独立餐桌椅、餐边柜、移动餐车等客餐厅配套产品资产';
                      } else if (activeShot.templateCode === 'A06') {
                        assetTargetName = '独立 3人位主沙发产品资产（客厅空间靠墙展示·体现零靠墙闭合贴墙形态）';
                      } else if (activeShot.templateCode === 'A08') {
                        assetTargetName = '独立单人位电动功能沙发资产（摆放于母版空旷开阔的客厅中央）';
                      } else if (['A03', 'A04', 'A05'].includes(activeShot.templateCode)) {
                        assetTargetName = '独立 3人位主沙发产品真值资产';
                      } else if (activeShot.templateCode === 'A02' || activeShot.templateCode === 'A07') {
                        assetTargetName = '独立主沙发与客厅起居配套产品套组资产';
                      }

                      return sceneMaster?.isLocked
                        ? `母版空间与硬装已锁定作为空间与摆放参考。直接联动关联的${assetTargetName}，生成高定专属镜头方案。`
                        : `以选定空间场景与关联的${assetTargetName}为基准，直接生成高定商业镜头方案（母版作为空间与摆放参考）。`;
                    })()}
                  </p>
                  <button
                    onClick={onGenerateCurrent}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-xs font-bold shadow-lg shadow-amber-500/20 transition flex items-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {activeShot.templateCode === 'A00'
                        ? (sceneMaster?.isLocked ? '重新生成并锁定 A00 母版' : '生成并锁定 A00 空间母版')
                        : `生成 ${activeShot.templateCode} 镜头方案`}
                    </span>
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        </div>

        {/* 3. BOTTOM CANDIDATE GALLERY & DIRECTOR VARIATIONS BAR (Resizable & Collapsible) */}
        {isCandidateBatchMatchingCurrentRevision && candidateBatch && candidateBatch.candidates.length > 0 && (
          isBatchDrawerCollapsed ? (
            /* COLLAPSED FLOATING PILL (极简胶囊态: 仅 38px 高度，释放 95% 主视窗呈现面积) */
            <div className="w-full max-w-3xl shrink-0 px-2 pt-1 pb-1 z-20 animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className={`p-1.5 px-3.5 rounded-full border backdrop-blur-xl shadow-xl flex items-center justify-between gap-3 ${
                isLight ? 'bg-white/95 border-stone-200 text-stone-900 shadow-stone-200/50' : 'bg-[#14161f]/95 border-white/15 text-white'
              }`}>
                {/* 方案标记 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold flex items-center gap-1.5 text-amber-500">
                    <Sparkle className="w-3.5 h-3.5" />
                    <span>
                      {candidateBatch.candidates.length > 1
                        ? `精修方案 (共 ${candidateBatch.candidates.length} 款)`
                        : '精修母版方案'}
                    </span>
                  </span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                    isLight ? 'bg-stone-100 border-stone-200 text-stone-700' : 'bg-black/40 border-white/10 text-neutral-300'
                  }`}>
                    已选 #{activeCandidate?.variantIndex || 1}
                  </span>
                </div>

                {/* 快捷操作 */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={onRegenerateBatch}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-neutral-300 hover:text-white flex items-center gap-1 transition cursor-pointer"
                    title="重新生成当前镜头方案"
                  >
                    <RefreshCw className="w-3 h-3 text-amber-400" />
                    <span>换一批</span>
                  </button>

                  <button
                    onClick={onKeepSpaceRefreshModel}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-purple-500/20 border border-white/10 text-[10px] text-neutral-300 hover:text-purple-300 flex items-center gap-1 transition cursor-pointer hidden md:flex"
                    title="保持空间不变，重生人物"
                  >
                    <User className="w-3 h-3 text-purple-400" />
                    <span>重生人物</span>
                  </button>

                  {activeCandidate && (
                    <button
                      onClick={() => onApplyCandidateAsFinal?.(activeCandidate)}
                      className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-[10px] flex items-center gap-1 shadow-xs transition cursor-pointer"
                    >
                      <Check className="w-3 h-3 stroke-[3]" />
                      <span>设为当前结果</span>
                    </button>
                  )}
                </div>

                {/* 展开抽屉 */}
                <button
                  onClick={toggleCollapseBatchDrawer}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-400 text-[10px] font-bold flex items-center gap-1 transition cursor-pointer shadow-2xs"
                  title="展开精修方案抽屉与缩略图"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>展开候选方案</span>
                </button>
              </div>
            </div>
          ) : (
            /* EXPANDED RESIZABLE DRAWER (自由拉伸调节高度与紧凑胶卷式缩略图) */
            <div
              style={{ height: `${batchDrawerHeight}px` }}
              className="w-full max-w-4xl shrink-0 px-2 pb-1 z-20 flex flex-col relative transition-[height] duration-75 select-none"
            >
              {/* 顶部 Resizable 拖拽手柄条 */}
              <div
                onMouseDown={handleStartResizeDrawer}
                onDoubleClick={toggleCollapseBatchDrawer}
                className="h-3.5 w-full flex items-center justify-center cursor-row-resize group/splitter py-0.5 shrink-0"
                title="上下拖拽调整抽屉高度 · 双击快速收起/展开"
              >
                <div className="w-14 h-1 rounded-full bg-white/20 group-hover/splitter:bg-amber-400 group-hover/splitter:w-24 group-hover/splitter:h-1.5 transition-all shadow-xs" />
              </div>

              {/* 方案卡片面板主体 */}
              <div className="flex-1 rounded-2xl bg-[#14161f]/95 border border-white/10 backdrop-blur-md shadow-2xl flex flex-col p-2.5 gap-2 overflow-hidden min-h-0">
                {/* 标题栏与操作条 */}
                <div className="flex items-center justify-between border-b border-white/10 pb-1.5 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Sparkle className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        {candidateBatch.candidates.length > 1
                          ? `${candidateBatch.candidates.length} 张候选方案`
                          : activeShot.hasHumanPass
                          ? '精修人物方案'
                          : activeShot.templateCode === 'A00'
                          ? '精修母版方案'
                          : '精修镜头方案'}
                      </span>
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono">
                      (已选 #{activeCandidate?.variantIndex || 1})
                    </span>

                    {/* 预设尺寸快速切换 */}
                    <div className="hidden sm:flex items-center gap-1 ml-2 text-[9px] font-mono text-neutral-400">
                      <button
                        onClick={() => { setBatchDrawerHeight(140); setIsBatchDrawerCollapsed(false); }}
                        className={`px-1.5 py-0.2 rounded hover:text-white cursor-pointer ${batchDrawerHeight < 170 ? 'text-amber-400 font-bold bg-white/10' : ''}`}
                        title="紧凑高度 (140px)"
                      >
                        紧凑
                      </button>
                      <span>|</span>
                      <button
                        onClick={() => { setBatchDrawerHeight(200); setIsBatchDrawerCollapsed(false); }}
                        className={`px-1.5 py-0.2 rounded hover:text-white cursor-pointer ${batchDrawerHeight >= 170 && batchDrawerHeight <= 250 ? 'text-amber-400 font-bold bg-white/10' : ''}`}
                        title="舒适高度 (200px)"
                      >
                        舒适
                      </button>
                      <span>|</span>
                      <button
                        onClick={() => { setBatchDrawerHeight(300); setIsBatchDrawerCollapsed(false); }}
                        className={`px-1.5 py-0.2 rounded hover:text-white cursor-pointer ${batchDrawerHeight > 250 ? 'text-amber-400 font-bold bg-white/10' : ''}`}
                        title="大图高度 (300px)"
                      >
                        大图
                      </button>
                    </div>
                  </div>

                  {/* 右侧动作条 */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={onRegenerateBatch}
                      className="px-2 py-0.8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-neutral-300 hover:text-white flex items-center gap-1 transition cursor-pointer"
                      title="重新生成当前镜头方案"
                    >
                      <RefreshCw className="w-3 h-3 text-amber-400" />
                      <span>换一批</span>
                    </button>

                    <button
                      onClick={onKeepSpaceRefreshModel}
                      className="px-2 py-0.8 rounded-lg bg-white/5 hover:bg-purple-500/20 border border-white/10 hover:border-purple-500/40 text-[10px] text-neutral-300 hover:text-purple-300 flex items-center gap-1 transition cursor-pointer hidden md:flex"
                      title="锁空间与家具不变，重新生成人物构图与细节"
                    >
                      <User className="w-3 h-3 text-purple-400" />
                      <span>保持空间重生人物</span>
                    </button>

                    <button
                      onClick={onKeepModelRefreshPose}
                      className="px-2 py-0.8 rounded-lg bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/40 text-[10px] text-neutral-300 hover:text-emerald-300 flex items-center gap-1 transition cursor-pointer hidden md:flex"
                      title="轮换已导入角色并重新生成"
                    >
                      <RefreshCw className="w-3 h-3 text-emerald-400" />
                      <span>替换角色重生</span>
                    </button>

                    {activeCandidate && (
                      <button
                        onClick={() => onApplyCandidateAsFinal?.(activeCandidate)}
                        className="px-2.5 py-0.8 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-[10px] flex items-center gap-1 shadow-md transition cursor-pointer"
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span>设为当前镜头结果</span>
                      </button>
                    )}

                    {/* 收起抽屉按钮 */}
                    <button
                      onClick={toggleCollapseBatchDrawer}
                      className="p-1 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition cursor-pointer ml-1"
                      title="收起此面板以最大化主视窗呈现面积"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 缩略图横排自适应胶卷列表 */}
                <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden flex items-center justify-start gap-2.5 py-0.5">
                  {candidateBatch.candidates.map((cand) => {
                    const isSelected = (activeCandidate?.id === cand.id);
                    return (
                      <div
                        key={cand.id}
                        onClick={() => onSelectCandidate?.(cand)}
                        className={`group relative h-full aspect-[16/10] max-h-full rounded-xl overflow-hidden border cursor-pointer transition-all duration-150 flex flex-col bg-black/40 shrink-0 ${
                          isSelected
                            ? 'border-amber-500 ring-2 ring-amber-500/40 shadow-lg'
                            : 'border-white/10 hover:border-white/30'
                        }`}
                      >
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
                          className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center transition ${
                            cand.isFavorite
                              ? 'bg-amber-500 text-black'
                              : 'bg-black/50 hover:bg-black/80 text-white/60 hover:text-amber-400'
                          }`}
                        >
                          <Star className="w-2.5 h-2.5 fill-current" />
                        </button>

                        {isSelected && (
                          <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.2 bg-amber-500 text-black rounded">
                            <Check className="w-2 h-2 stroke-[3]" /> 正在品鉴
                          </div>
                        )}

                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-1.5 pt-4 text-[9px] text-neutral-300 font-medium truncate pointer-events-none">
                          {cand.summaryTag || `候选方案 ${cand.variantIndex}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )
        )}
      </main>
    </div>
  );
};
