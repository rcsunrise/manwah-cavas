import React, { useState } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Maximize2,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Eye,
  Layers,
  ShieldCheck,
  Type,
  ChevronUp,
  ChevronDown,
  Download,
  Loader2,
  History,
  FileDown,
  ChevronRight,
  Sparkles as SparklesIcon,
  Paintbrush
} from 'lucide-react';
import { GeneratedImageNodeData, GeneratedImageNodeVersion } from '../../types/creativeCanvas';
import { ConsistencyReportPanel } from './ConsistencyReportPanel';
import { ScreenCompositionPreview } from './ScreenCompositionPreview';
import { ScreenComposition } from '../../types/detailCompositionSchema';
import { assembleComposition } from '../../services/detailCompositionService';
import { PosterTypographyOverlay } from './PosterTypographyOverlay';
import { NodeTextEditor } from './NodeTextEditor';
import { PosterDownloadModal } from './PosterDownloadModal';
import { ImageInpaintModal } from './ImageInpaintModal';
import { downloadHighResImage } from '../../utils/downloadUtils';
import { downloadPosterImage } from '../../utils/posterExportHelper';

interface GeneratedImageNodeProps {
  data: GeneratedImageNodeData & {
    onToggleCollapse?: () => void;
    onUpdate?: (updated: any) => void;
    onRestoreWorkflow?: (data: any) => void;
  };
  selected?: boolean;
}

export const GeneratedImageNode: React.FC<GeneratedImageNodeProps> = ({ data, selected }) => {
  const [imgError, setImgError] = React.useState(false);

  React.useEffect(() => {
    setImgError(false);
  }, [data.imageUrl]);
  const [showConsistencyPanel, setShowConsistencyPanel] = useState(false);
  const [showCompositionModal, setShowCompositionModal] = useState(false);
  const [loadingComposition, setLoadingComposition] = useState(false);
  const [compositionError, setCompositionError] = useState<string | null>(null);
  const [realComposition, setRealComposition] = useState<ScreenComposition | null>(null);

  // Inpaint Modal State
  const [showInpaintModal, setShowInpaintModal] = useState(false);

  // In-Node Text Editing & OCR State
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({
    width: data.sourceWidth || 1024,
    height: data.sourceHeight || 1365
  });
  const [isEditingText, setIsEditingText] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrRepairSuccess, setOcrRepairSuccess] = useState(true);
  const [ocrRepairMessage, setOcrRepairMessage] = useState<string | undefined>();
  const [showVersionDropdown, setShowVersionDropdown] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showDownloadDropdown, setShowDownloadDropdown] = useState(false);
  const [isQuickDownloading, setIsQuickDownloading] = useState(false);

  // 一键直接下载原始 AI 生成图 (零二次污染、零弹窗阻断)
  const handleDirectDownloadOriginal = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setShowDownloadDropdown(false);
    if (!imageUrl) return;

    try {
      setIsQuickDownloading(true);
      const safeTitle = (screenTitle || '分镜').replace(/[\s/\\?%*:|"<>]/g, '_').slice(0, 30);
      const ext = imageUrl.includes('.png') ? 'png' : 'jpg';
      const fn = `MW_分镜${sceneIndex || 1}_${safeTitle}_原始画质.${ext}`;
      await downloadHighResImage(imageUrl, fn);
    } catch (err: any) {
      console.error('Direct download failed:', err);
      alert('直接下载失败: ' + (err?.message || '网络连接异常'));
    } finally {
      setIsQuickDownloading(false);
    }
  };

  // 一键直接下载无损超清排版海报 (PNG 300DPI 规范)
  const handleDirectDownloadPosterPng = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setShowDownloadDropdown(false);
    if (!imageUrl) return;

    try {
      setIsQuickDownloading(true);
      await downloadPosterImage({
        imageUrl,
        cleanBackgroundUrl: data.cleanBackgroundUrl,
        withText: data.withText,
        textLayers: data.textLayers,
        screenTitle,
        coreSellingPoint: (data as any).coreSellingPoint || (data as any).subTitle || '',
        themeTitle: (data as any).themeTitle || 'MANWAH DESIGN STUDIO',
        sceneIndex,
        format: 'png',
        resolution: 'native',
        includeText: Boolean(!data.withText && (data.cleanBackgroundUrl || (data.textLayers && data.textLayers.length > 0)))
      });
    } catch (err: any) {
      console.error('Poster PNG export failed:', err);
      // 降级回退为原图直接下载
      await handleDirectDownloadOriginal();
    } finally {
      setIsQuickDownloading(false);
    }
  };

  // 一键直接下载纯净底图
  const handleDirectDownloadCleanBg = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setShowDownloadDropdown(false);
    const targetUrl = data.cleanBackgroundUrl || imageUrl;
    if (!targetUrl) return;

    try {
      setIsQuickDownloading(true);
      const safeTitle = (screenTitle || '分镜').replace(/[\s/\\?%*:|"<>]/g, '_').slice(0, 30);
      await downloadHighResImage(targetUrl, `MW_纯净底图_第${sceneIndex || 1}屏_${safeTitle}.jpg`);
    } catch (err: any) {
      alert('下载纯净底图失败: ' + (err?.message || '网络错误'));
    } finally {
      setIsQuickDownloading(false);
    }
  };

  // Standalone Inpaint Handler
  const handleInpaintApply = (result: {
    imageUrl: string;
    prompt: string;
    model: string;
    action: 'add_new_node' | 'replace_current';
    maskPreviewUrl?: string;
  }) => {
    if (result.action === 'replace_current') {
      const oldVersion: GeneratedImageNodeVersion = {
        versionId: `ver-${Date.now()}`,
        versionCode: data.activeVersionCode || `V00${data.version || 1}`,
        imageUrl: data.imageUrl,
        rawImageUrl: data.rawImageUrl || data.imageUrl,
        cleanBackgroundUrl: data.cleanBackgroundUrl,
        textLayers: data.textLayers,
        generatedAt: data.generatedAt || new Date().toLocaleTimeString(),
        note: '局部重绘前原版本'
      };
      const nextVerNum = (data.version || 1) + 1;
      const nextVerCode = `V00${nextVerNum}`;
      data.onUpdate?.({
        imageUrl: result.imageUrl,
        rawImageUrl: result.imageUrl,
        version: nextVerNum,
        activeVersionCode: nextVerCode,
        versionHistory: [...(data.versionHistory || []), oldVersion],
        prompt: `${data.prompt || ''}\n[局部重绘]: ${result.prompt}`,
        model: result.model
      });
    } else {
      window.dispatchEvent(
        new CustomEvent('canvas:inpaint-new-node', {
          detail: {
            parentSceneIndex: data.sceneIndex,
            parentScreenTitle: data.screenTitle,
            coreSellingPoint: data.coreSellingPoint,
            aspectRatio: data.aspectRatio,
            parentImageUrl: data.imageUrl,
            newImageUrl: result.imageUrl,
            prompt: result.prompt,
            model: result.model,
            version: (data.version || 1) + 1
          }
        })
      );
    }
  };

  const isCollapsed = Boolean((data as any).ui?.collapsed);

  const toggleCollapse = () => {
    if (data.onToggleCollapse) {
      data.onToggleCollapse();
    } else {
      const currentUi = ((data as any).ui as object) || {};
      data.onUpdate?.({
        ui: { ...currentUi, collapsed: !isCollapsed }
      });
    }
  };

  const {
    sceneIndex,
    screenTitle,
    imageUrl,
    dimensions = '1024x1365',
    sourceWidth,
    sourceHeight,
    sourceAspectRatio,
    aspectRatio = '3:4',
    model = 'google/gemini-3-pro-image-preview',
    generatedAt,
    version = 1,
    assetSkuCode,
    assetVersionCode,
    reviewStatus = 'pendingReview',
    onViewDetail,
    onApprove,
    onReject,
    onOpenAssetVersions,
    onGeneratePoster,
    onRegenerate
  } = data;

  const [resolvedCanvasId, setResolvedCanvasId] = useState<string>('canvas-default');

  const handleOpenComposition = async () => {
    setShowCompositionModal(true);
    setLoadingComposition(true);
    setCompositionError(null);

    const pathParts = window.location.pathname.split('/');
    const urlCanvasId = pathParts.includes('creative-canvas') ? pathParts[pathParts.indexOf('creative-canvas') + 1] : '';
    const canvasId = (data.canvasId as string) || (data.projectId as string) || urlCanvasId || 'canvas-default';
    setResolvedCanvasId(canvasId);

    const screenId = (data.screenId as string) || `screen-0${sceneIndex || 1}`;
    const screenRole = (data.screenRole as any) || (sceneIndex === 1 ? 'PRODUCT_HERO' : 'LIFESTYLE_SCENE');
    const baseAssetVersionId = (data.assetVersionId as string) || assetVersionCode || `asset-v00${sceneIndex || 1}`;

    try {
      const result = await assembleComposition({
        workspaceId: (data.workspaceId as string) || 'default_workspace',
        canvasId,
        screenId,
        screenRole,
        baseAssetVersionId,
        productDnaVersionId: data.productDnaVersionId as string,
        copySkuId: data.copySkuId as string,
        consistencyReportId: data.consistencyReportId as string
      });

      if (result) {
        setRealComposition(result as any);
      } else {
        throw new Error('未获取到有效装配结果');
      }
    } catch (err: any) {
      console.error('Failed to assemble composition:', err);
      setCompositionError(err?.message || '装配失败: 缺失必要依赖或格式错误');
    } finally {
      setLoadingComposition(false);
    }
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    }
  };

  // Requirement 9: Check whether clean background exists before deciding to run OCR
  const handleStartEditText = async () => {
    // If we ALREADY have a pure clean background (or image was generated without text), open editor immediately
    if (data.cleanBackgroundUrl || data.withText === false) {
      console.log('[Poster Studio] Pure background present. Opening dedicated poster studio directly.');
      setOcrRepairSuccess(true);
      setOcrRepairMessage(undefined);
      setIsEditingText(true);
      return;
    }

    // Text is baked into image: trigger OCR + text erasing + background repair
    setIsOcrLoading(true);
    try {
      const res = await fetch('/api/poster/ocr-and-erase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: data.imageUrl,
          naturalWidth: naturalSize.width,
          naturalHeight: naturalSize.height,
          screenTitle: data.screenTitle || '爆款海报',
          coreSellingPoint: (data.coreSellingPoint as string) || data.screenTitle
        })
      });
      const json = await res.json();
      if (json && json.success) {
        setOcrRepairSuccess(Boolean(json.repairSuccess));
        setOcrRepairMessage(json.message);

        data.onUpdate?.({
          cleanBackgroundUrl: json.cleanBackgroundUrl || data.imageUrl,
          textLayers: json.textLayers || []
        });
      } else {
        setOcrRepairSuccess(false);
        setOcrRepairMessage('背景修复或 OCR 失败，已保留原图并标注文字图层');
      }
    } catch (err: any) {
      console.warn('[GeneratedImageNode] OCR request failed, using fallback:', err);
      setOcrRepairSuccess(false);
      setOcrRepairMessage('背景修复与 OCR 尝试超时，已保留原图并标注文字图层');
    } finally {
      setIsOcrLoading(false);
      setIsEditingText(true);
    }
  };

  // Requirement 7: Save new immutable version (V002, V003...) without overwriting V001
  const handleSaveVersion = (newImageUrl: string, cleanBgUrl: string, updatedLayers: any[]) => {
    const history = data.versionHistory || [];
    const v001: GeneratedImageNodeVersion = {
      versionId: data.assetVersionId || 'asset-v001',
      versionCode: 'V001',
      imageUrl: data.rawImageUrl || data.imageUrl,
      rawImageUrl: data.rawImageUrl || data.imageUrl,
      cleanBackgroundUrl: data.cleanBackgroundUrl,
      textLayers: data.textLayers || [],
      sourceWidth: naturalSize.width,
      sourceHeight: naturalSize.height,
      generatedAt: data.generatedAt || new Date().toISOString(),
      note: 'AI 原始生成版本'
    };

    const fullHistory = history.length === 0 ? [v001] : [...history];
    const nextNum = fullHistory.length + 1;
    const newVersionCode = `V00${nextNum}`;

    const newVerObj: GeneratedImageNodeVersion = {
      versionId: `asset-v00${nextNum}`,
      versionCode: newVersionCode,
      imageUrl: newImageUrl,
      rawImageUrl: data.rawImageUrl || data.imageUrl,
      cleanBackgroundUrl: cleanBgUrl,
      textLayers: updatedLayers,
      sourceWidth: naturalSize.width,
      sourceHeight: naturalSize.height,
      generatedAt: new Date().toISOString(),
      note: '海报文字与排版自定义修改版本'
    };

    const updatedHistory = [...fullHistory, newVerObj];

    data.onUpdate?.({
      imageUrl: newImageUrl,
      cleanBackgroundUrl: cleanBgUrl,
      textLayers: updatedLayers,
      versionHistory: updatedHistory,
      activeVersionCode: newVersionCode,
      assetVersionCode: newVersionCode,
      version: nextNum
    });

    setIsEditingText(false);
  };

  // Switch/roll back active version without modifying history
  const handleSwitchVersion = (ver: GeneratedImageNodeVersion) => {
    data.onUpdate?.({
      imageUrl: ver.imageUrl,
      cleanBackgroundUrl: ver.cleanBackgroundUrl,
      textLayers: ver.textLayers,
      activeVersionCode: ver.versionCode,
      assetVersionCode: ver.versionCode
    });
    setShowVersionDropdown(false);
  };

  const getReviewBadge = () => {
    switch (reviewStatus) {
      case 'approved':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" /> 审核通过
          </span>
        );
      case 'rejected':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full">
            <XCircle className="w-3 h-3" /> 未通过
          </span>
        );
      case 'pendingReview':
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
            <Clock className="w-3 h-3" /> 待人审
          </span>
        );
    }
  };

  const getCssAspectRatio = (ratioStr?: string): string => {
    if (!ratioStr || ratioStr === 'Auto' || ratioStr === 'Custom') return '3/4';
    const parts = ratioStr.split(':');
    if (parts.length === 2) {
      const w = parseFloat(parts[0]);
      const h = parseFloat(parts[1]);
      if (!isNaN(w) && !isNaN(h) && h > 0) {
        return `${w}/${h}`;
      }
    }
    return '3/4';
  };

  const sourceRatioCss = (sourceWidth && sourceHeight && sourceWidth > 0 && sourceHeight > 0)
    ? `${sourceWidth}/${sourceHeight}`
    : getCssAspectRatio(sourceAspectRatio || aspectRatio);

  const displayVersionCode = assetVersionCode || `V00${version}`;

  return (
    <div
      className={`w-[320px] max-w-full bg-white rounded-2xl border transition-all duration-200 shadow-sm hover:shadow-md select-none overflow-hidden ${
        selected ? 'border-[#B28C5A] ring-2 ring-[#B28C5A]/20' : 'border-[#E5E0D8]'
      }`}
    >
      {selected && !isCollapsed && (
        <NodeResizer
          color="#B28C5A"
          isVisible={selected}
          minWidth={260}
          minHeight={220}
          maxWidth={840}
          maxHeight={1200}
          handleStyle={{ width: 8, height: 8, borderRadius: 2 }}
        />
      )}

      <Handle
        type="target"
        position={Position.Left}
        id="target"
        className="!w-3 !h-3 !bg-[#B28C5A] !border-2 !border-white"
      />

      <Handle
        type="source"
        position={Position.Right}
        id="source"
        className="!w-3 !h-3 !bg-[#B28C5A] !border-2 !border-white"
      />

      {/* Header */}
      <div className="p-3 border-b border-[#E5E0D8]/60 bg-[#FAF8F5] flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-bold text-xs flex-shrink-0">
            #{sceneIndex}
          </div>
          <div className="flex flex-col min-w-0 relative">
            <div className="flex items-center gap-1 font-bold text-xs text-[#2C2A29] truncate">
              <span>渲染结果</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowVersionDropdown(!showVersionDropdown);
                }}
                className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-[#B28C5A] hover:bg-[#8C6F43] text-white font-bold flex items-center gap-0.5 cursor-pointer transition-colors"
                title="点击快速切换/回滚历史版本"
              >
                <span>{data.activeVersionCode || displayVersionCode}</span>
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
            </div>

            {/* Version Dropdown */}
            {showVersionDropdown && (
              <div className="absolute top-6 left-0 z-40 bg-stone-900 border border-stone-700 rounded-xl p-1.5 shadow-xl w-48 text-[10px] space-y-1 animate-in fade-in duration-150">
                <div className="text-[9px] text-stone-400 font-bold px-1.5 py-0.5 border-b border-stone-800 flex items-center justify-between">
                  <span>版本切换 history</span>
                  <span className="text-[8px] text-stone-500 font-normal">不可篡改</span>
                </div>
                {((data.versionHistory && data.versionHistory.length > 0)
                  ? data.versionHistory
                  : [{
                      versionId: data.assetVersionId || 'asset-v001',
                      versionCode: 'V001',
                      imageUrl: data.rawImageUrl || data.imageUrl,
                      generatedAt: data.generatedAt || '初始版本',
                      note: 'AI 初始生成版'
                    }]
                ).map(ver => (
                  <button
                    key={ver.versionCode}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSwitchVersion(ver);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center justify-between transition-colors ${
                      (data.activeVersionCode || displayVersionCode) === ver.versionCode
                        ? 'bg-[#B28C5A] text-white font-bold'
                        : 'text-stone-300 hover:bg-stone-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono">{ver.versionCode}</span>
                      <span className="text-[9px] opacity-80 truncate max-w-[80px]">{ver.note || '海报快照'}</span>
                    </div>
                    <span className="text-[8px] opacity-60 font-mono">
                      {ver.generatedAt ? ver.generatedAt.slice(11, 16) : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {assetSkuCode && (
              <span className="text-[9px] text-stone-400 font-mono truncate" title={assetSkuCode}>
                {assetSkuCode}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {getReviewBadge()}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse();
            }}
            className="p-1 text-stone-400 hover:text-[#B28C5A] rounded hover:bg-stone-100 transition-colors"
            title={isCollapsed ? '展开节点' : '收起节点'}
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Image Preview Container with Dynamic Ratio and object-contain */}
          <div
            className="relative w-full bg-stone-100 overflow-hidden group min-h-[160px] flex items-center justify-center"
            style={{ aspectRatio: sourceRatioCss }}
          >
            {!imgError && imageUrl ? (
              <>
                <img
                  src={imageUrl}
                  alt={`分镜 #${sceneIndex} ${screenTitle}`}
                  className="w-full h-full object-contain transition-transform duration-300"
                  draggable={false}
                  referrerPolicy="no-referrer"
                  onLoad={handleImageLoad}
                  onError={() => setImgError(true)}
                />
                <PosterTypographyOverlay
                  screenTitle={screenTitle}
                  coreSellingPoint={(data.coreSellingPoint as string) || screenTitle}
                  themeTitle={(data.themeTitle as string) || '敏华全案企划'}
                  sceneIndex={sceneIndex}
                  imageUrl={imageUrl}
                  defaultVisible={false}
                />
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-stone-100 text-stone-400 text-center">
                <Sparkles className="w-8 h-8 mb-2 text-[#B28C5A]/40 animate-pulse" />
                <span className="text-xs font-medium text-stone-500">图片资源加载中或已更新</span>
                <span className="text-[10px] text-stone-400 mt-1">请重试或重新生成分镜渲染</span>
                {imageUrl && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setImgError(false);
                    }}
                    className="mt-2 px-2.5 py-1 bg-white border border-stone-200 rounded text-[10px] text-stone-600 hover:text-[#B28C5A] hover:border-[#B28C5A] transition-colors shadow-xs"
                  >
                    重试加载
                  </button>
                )}
              </div>
            )}
            
            {/* Hover Floating Controls - 放置在左上角小图标工具栏，彻底不遮挡主画面及右上角 T文字 按钮 */}
            <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 z-20 pointer-events-none">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowInpaintModal(true);
                }}
                className="px-2 py-0.5 bg-black/75 hover:bg-black/95 backdrop-blur-md text-amber-300 hover:text-white rounded-lg text-[10px] font-medium flex items-center gap-1 shadow-md transition-transform active:scale-95 pointer-events-auto border border-amber-500/30"
                title="框选/涂抹局部画面，调用 GPT 模型重绘生成"
              >
                <Paintbrush className="w-2.5 h-2.5 text-amber-400" />
                <span>局部重绘</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartEditText();
                }}
                disabled={isOcrLoading}
                className="px-2 py-0.5 bg-black/70 hover:bg-black/90 backdrop-blur-md text-white rounded-lg text-[10px] font-medium flex items-center gap-1 shadow-md transition-transform active:scale-95 pointer-events-auto"
                title="打开独立海报排版工坊（图文分离与自由排版）"
              >
                {isOcrLoading ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin text-[#B28C5A]" />
                ) : (
                  <Type className="w-2.5 h-2.5 text-[#B28C5A]" />
                )}
                <span>{isOcrLoading ? 'AI 消除中...' : '排版工坊'}</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenAssetVersions) onOpenAssetVersions();
                  else if (onViewDetail) onViewDetail();
                }}
                className="px-2 py-0.5 bg-black/70 hover:bg-black/90 backdrop-blur-md text-white rounded-lg text-[10px] font-medium flex items-center gap-1 shadow-md transition-transform active:scale-95 pointer-events-auto"
                title="查看与回滚历史版本"
              >
                <Layers className="w-2.5 h-2.5 text-[#B28C5A]" />
                <span>版本</span>
              </button>
            </div>

            {/* Standalone Full-screen Poster Typography Studio */}
            {isEditingText && (
              <NodeTextEditor
                imageUrl={imageUrl}
                cleanBackgroundUrl={data.cleanBackgroundUrl}
                repairSuccess={ocrRepairSuccess}
                repairMessage={ocrRepairMessage}
                naturalWidth={naturalSize.width}
                naturalHeight={naturalSize.height}
                initialTextLayers={data.textLayers || []}
                screenTitle={screenTitle}
                sceneIndex={sceneIndex}
                coreSellingPoint={data.coreSellingPoint ? String(data.coreSellingPoint) : undefined}
                onSaveVersion={handleSaveVersion}
                onOpenPosterStudio={() => (data as any).onOpenPosterStudio?.(sceneIndex || 1)}
                onClose={() => setIsEditingText(false)}
              />
            )}

            {/* Resolution & Aspect ratio tag */}
            <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md text-white text-[9px] px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
              <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
              <span>cloud_saved · {sourceAspectRatio || aspectRatio}</span>
            </div>
          </div>

          {/* Action Footer */}
          <div className="p-2.5 bg-[#FAF8F5] border-t border-[#E5E0D8]/60 space-y-2">
            <div className="flex items-center justify-between text-[10px] text-stone-500">
              <span className="truncate max-w-[130px] font-medium" title={screenTitle}>
                {screenTitle}
              </span>
              <div className="flex items-center gap-1 font-mono">
                {data.productDnaVersionCode && (
                  <span className="text-[9px] text-[#8C827A] bg-[#B28C5A]/10 px-1 py-0.2 rounded border border-[#B28C5A]/20 font-bold" title={`Bound DNA Version: ${data.productDnaVersionId || ''}`}>
                    {data.productDnaVersionCode}
                  </span>
                )}
                {data.parentVersionId && (
                  <span className="text-[9px] text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-200" title={`Parent Version ID: ${data.parentVersionId}`}>
                    P:{data.parentVersionId.slice(-4)}
                  </span>
                )}
                <span>{generatedAt || '刚刚'}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 pt-1 border-t border-[#E5E0D8]/40">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowInpaintModal(true);
                }}
                className="py-1 px-1.5 rounded-lg text-[10px] font-bold bg-[#FAF8F5] hover:bg-[#F2EDE4] text-amber-800 border border-amber-500/40 flex items-center justify-center gap-1 transition-all shadow-xs"
                title="框选/涂抹标记局部，调用 GPT 模型重绘生成"
              >
                <Paintbrush className="w-3 h-3 text-amber-600" />
                <span>局部重绘</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartEditText();
                }}
                className="py-1 px-1.5 rounded-lg text-[10px] font-bold bg-[#FAF8F5] hover:bg-[#F2EDE4] text-[#8C6F43] border border-[#B28C5A]/40 flex items-center justify-center gap-1 transition-all shadow-xs"
                title="打开独立海报排版工坊（图文分离与自由排版）"
              >
                <Type className="w-3 h-3 text-[#B28C5A]" />
                <span>排版工坊</span>
              </button>

              {onGeneratePoster && !data.withText && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onGeneratePoster();
                  }}
                  className="flex-1 py-1 px-1.5 rounded-lg text-[10px] font-bold bg-[#2C2A29] hover:bg-[#1A1818] text-white flex items-center justify-center gap-1 shadow-xs transition-all"
                  title="基于此画面节点在右侧生成带字海报"
                >
                  <Type className="w-3 h-3 text-[#B28C5A]" />
                  <span>生成带字海报</span>
                </button>
              )}

              {onRegenerate && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRegenerate();
                  }}
                  className="py-1 px-1.5 rounded-lg text-[10px] font-bold bg-[#FAF8F5] hover:bg-[#F2EDE4] text-[#8C6F43] border border-[#B28C5A]/30 flex items-center justify-center gap-1 transition-all"
                  title="再次生成新画质节点"
                >
                  <RefreshCw className="w-3 h-3 text-[#B28C5A]" />
                  <span>再次生成</span>
                </button>
              )}

              {imageUrl && (
                <div className="relative">
                  <div className="flex items-stretch rounded-lg shadow-xs overflow-hidden">
                    <button
                      onClick={handleDirectDownloadOriginal}
                      disabled={isQuickDownloading}
                      className="py-1 px-1.5 text-[10px] font-bold bg-[#B28C5A] hover:bg-[#8C6F43] text-white flex items-center justify-center gap-1 transition-all"
                      title="一键直接下载原图 (保留原画质，不跳转)"
                    >
                      {isQuickDownloading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Download className="w-3 h-3" />
                      )}
                      <span>直接下载</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDownloadDropdown(!showDownloadDropdown);
                      }}
                      className="px-1 bg-[#9E7A4A] hover:bg-[#8C6F43] text-white border-l border-white/20 flex items-center justify-center transition-colors"
                      title="选择下载格式或参数设置"
                    >
                      <ChevronDown className="w-2.5 h-2.5" />
                    </button>
                  </div>

                  {/* 展开的底部精巧参数面板，不遮挡画面 */}
                  {showDownloadDropdown && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 bottom-full mb-1.5 w-48 bg-white rounded-xl shadow-xl border border-stone-200 py-1 z-50 text-left animate-in fade-in zoom-in-95 duration-100"
                    >
                      <button
                        onClick={handleDirectDownloadOriginal}
                        className="w-full px-2.5 py-1.5 text-[11px] text-left hover:bg-stone-50 flex items-center justify-between text-stone-700 font-medium"
                      >
                        <span className="flex items-center gap-1.5">
                          <FileDown className="w-3 h-3 text-[#B28C5A]" />
                          <span>原画质直接下载</span>
                        </span>
                        <span className="text-[9px] text-stone-400 font-mono">原图</span>
                      </button>
                      <button
                        onClick={handleDirectDownloadPosterPng}
                        className="w-full px-2.5 py-1.5 text-[11px] text-left hover:bg-stone-50 flex items-center justify-between text-stone-700 font-medium"
                      >
                        <span className="flex items-center gap-1.5">
                          <SparklesIcon className="w-3 h-3 text-amber-600" />
                          <span>海报直接导出 (PNG)</span>
                        </span>
                        <span className="text-[9px] text-amber-600 font-bold font-mono">300DPI</span>
                      </button>
                      {data.cleanBackgroundUrl && (
                        <button
                          onClick={handleDirectDownloadCleanBg}
                          className="w-full px-2.5 py-1.5 text-[11px] text-left hover:bg-stone-50 flex items-center justify-between text-stone-700 font-medium"
                        >
                          <span className="flex items-center gap-1.5">
                            <Layers className="w-3 h-3 text-indigo-600" />
                            <span>消除文字纯净底图</span>
                          </span>
                          <span className="text-[9px] text-stone-400 font-mono">Clean</span>
                        </button>
                      )}
                      <div className="border-t border-stone-100 my-0.5"></div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDownloadDropdown(false);
                          setShowDownloadModal(true);
                        }}
                        className="w-full px-2.5 py-1.5 text-[11px] text-left hover:bg-[#FAF8F5] text-[#8C6F43] font-bold flex items-center justify-between"
                      >
                        <span>更多参数定制...</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowConsistencyPanel(true);
                }}
                className="py-1 px-1.5 rounded-lg text-[10px] font-bold bg-[#FAF8F5] hover:bg-[#F2EDE4] text-[#8C6F43] border border-[#B28C5A]/30 flex items-center justify-center gap-1 transition-all"
                title="一致性诊断"
              >
                <ShieldCheck className="w-3 h-3 text-[#B28C5A]" />
                <span>诊断</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (data.onRestoreWorkflow) {
                    data.onRestoreWorkflow(data);
                  } else {
                    window.dispatchEvent(new CustomEvent('restore_node_workflow', { detail: data }));
                  }
                }}
                className="py-1 px-1.5 rounded-lg text-[10px] font-bold bg-[#F5EFE6] hover:bg-[#EBDCCB] text-[#8C6F43] border border-[#B28C5A]/40 flex items-center justify-center gap-1 transition-all"
                title="一键复现生成此节点的模型、宽高比、提示词等工作流参数"
              >
                <Sparkles className="w-3 h-3 text-[#B28C5A]" />
                <span>复现 Workflow</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenComposition();
                }}
                className="py-1 px-1.5 rounded-lg text-[10px] font-bold bg-[#B28C5A] hover:bg-[#9E7A4A] text-white flex items-center justify-center gap-1 transition-all"
                title="2100×2800 排版模式"
              >
                <Type className="w-3 h-3" />
                <span>排版</span>
              </button>
            </div>

            {/* ComfyUI style embedded Workflow metadata badge */}
            <div className="pt-1 border-t border-[#E5E0D8]/40 flex flex-wrap gap-1 text-[9px] font-mono text-stone-500">
              <span className="bg-stone-100 border border-stone-200 px-1 py-0.2 rounded text-stone-600 truncate max-w-[140px]" title={model}>
                ⚙️ {model.split('/').pop()}
              </span>
              <span className="bg-stone-100 border border-stone-200 px-1 py-0.2 rounded text-stone-600">
                📐 {dimensions} ({aspectRatio})
              </span>
            </div>
          </div>
        </>
      )}

      {/* Consistency Report Panel Drawer */}
      <ConsistencyReportPanel
        isOpen={showConsistencyPanel}
        onClose={() => setShowConsistencyPanel(false)}
        canvasId={(data.canvasId as string) || "canvas-default"}
        screenId={(data.screenId as string) || `screen-0${sceneIndex || 1}`}
        screenRole={(data.screenRole as any) || (sceneIndex === 1 ? 'PRODUCT_HERO' : 'LIFESTYLE_SCENE')}
        productDnaVersionId={data.productDnaVersionId || 'dna-v001'}
        candidateAssetVersionId={data.assetVersionId || assetVersionCode || 'asset-v001'}
      />

      {/* Screen Composition Preview Modal */}
      {showCompositionModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <button
              onClick={() => setShowCompositionModal(false)}
              className="absolute top-4 right-4 p-2 text-stone-400 hover:text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-full transition-colors z-20"
            >
              ✕
            </button>

            {loadingComposition && (
              <div className="py-20 flex flex-col items-center justify-center text-stone-600 gap-3">
                <RefreshCw className="w-8 h-8 text-[#B28C5A] animate-spin" />
                <span className="text-sm font-bold">正在装配真实文案与排版...</span>
                <span className="text-xs text-stone-400">正在检索绑定的 CopyVersion 与 TypographySpec</span>
              </div>
            )}

            {!loadingComposition && compositionError && (
              <div className="p-8 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 space-y-3 my-4">
                <div className="flex items-center gap-2 font-bold text-base text-rose-900">
                  <XCircle className="w-5 h-5 text-rose-600" />
                  <span>排版装配门禁阻断</span>
                </div>
                <p className="text-xs text-rose-700 leading-relaxed font-mono">
                  {compositionError}
                </p>
                <div className="text-[11px] text-rose-500">
                  根据严格排版规范：未绑定真实 Copy Version 或 Typography Spec 时禁止合成预览。
                </div>
              </div>
            )}

            {!loadingComposition && realComposition && (
              <ScreenCompositionPreview
                canvasId={resolvedCanvasId}
                baseImageUrl={imageUrl}
                composition={realComposition}
                onRenderCompleted={(assetVersionId, outputUrl) => {
                  console.log('Composition render completed:', assetVersionId, outputUrl);
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Poster High-Res Download & Commercial Export Modal */}
      {showDownloadModal && (
        <PosterDownloadModal
          isOpen={showDownloadModal}
          onClose={() => setShowDownloadModal(false)}
          imageUrl={imageUrl}
          cleanBackgroundUrl={data.cleanBackgroundUrl}
          withText={data.withText}
          textLayers={data.textLayers}
          screenTitle={screenTitle}
          coreSellingPoint={(data as any).coreSellingPoint || (data as any).subTitle || ''}
          themeTitle={(data as any).themeTitle || 'MANWAH DESIGN STUDIO'}
          sceneIndex={sceneIndex}
          sourceAspectRatio={sourceAspectRatio || aspectRatio}
        />
      )}

      {/* Local Inpaint & Partial Redraw Modal */}
      {showInpaintModal && imageUrl && (
        <ImageInpaintModal
          isOpen={showInpaintModal}
          onClose={() => setShowInpaintModal(false)}
          imageUrl={imageUrl}
          sceneIndex={sceneIndex}
          screenTitle={screenTitle}
          coreSellingPoint={data.coreSellingPoint ? String(data.coreSellingPoint) : undefined}
          initialPrompt={data.prompt}
          aspectRatio={data.aspectRatio || '3:4'}
          selectedModel={data.model}
          currentVersionCode={data.activeVersionCode || `V00${data.version || 2}`}
          onApplyResult={handleInpaintApply}
        />
      )}
    </div>
  );
};
