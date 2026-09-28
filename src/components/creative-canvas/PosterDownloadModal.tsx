import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  CheckCircle2,
  Sparkles,
  Layers,
  FileImage,
  Printer,
  ShieldCheck,
  Eye,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import {
  PosterExportFormat,
  PosterExportResolution,
  downloadPosterImage,
  generatePosterDataUrl
} from '../../utils/posterExportHelper';
import { CanvasTextLayer } from '../../types/creativeCanvas';
import { downloadHighResImage } from '../../utils/downloadUtils';

interface PosterDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  cleanBackgroundUrl?: string;
  withText?: boolean;
  textLayers?: CanvasTextLayer[];
  screenTitle?: string;
  coreSellingPoint?: string;
  themeTitle?: string;
  sceneIndex?: number;
  sourceAspectRatio?: string;
}

export const PosterDownloadModal: React.FC<PosterDownloadModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  cleanBackgroundUrl,
  withText = false,
  textLayers = [],
  screenTitle = '海报设计',
  coreSellingPoint,
  themeTitle = 'MANWAH DESIGN STUDIO',
  sceneIndex = 1,
  sourceAspectRatio = '3:4'
}) => {
  const [format, setFormat] = useState<PosterExportFormat>('png');
  const [resolution, setResolution] = useState<PosterExportResolution>('native');
  // 如果底层图片本身已是带字海报（withText 为 true 且无独立纯净底图），默认关闭平台模板文字，彻底杜绝双重文案粘连
  const isAiPosterWithoutSeparateBg = Boolean(withText || (!cleanBackgroundUrl && (!textLayers || textLayers.length === 0)));
  const [includeText, setIncludeText] = useState<boolean>(!isAiPosterWithoutSeparateBg);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [isGeneratingPreview, setIsGeneratingPreview] = useState<boolean>(false);
  const [previewDimensions, setPreviewDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const hasCustomLayers = textLayers.length > 0;

  useEffect(() => {
    if (isOpen) {
      if (withText && (!textLayers || textLayers.length === 0)) {
        setIncludeText(false);
      } else if (textLayers && textLayers.length > 0) {
        setIncludeText(true);
      }
    }
  }, [isOpen, withText, textLayers]);

  // 生成实时海报小图预览
  useEffect(() => {
    if (!isOpen || !imageUrl) return;

    let isMounted = true;
    const updatePreview = async () => {
      try {
        setIsGeneratingPreview(true);
        const res = await generatePosterDataUrl({
          imageUrl,
          cleanBackgroundUrl,
          withText,
          textLayers,
          screenTitle,
          coreSellingPoint,
          themeTitle,
          sceneIndex,
          format: 'jpeg',
          quality: 0.85,
          resolution,
          includeText
        });

        if (isMounted) {
          setPreviewDataUrl(res.dataUrl);
          setPreviewDimensions({ width: res.width, height: res.height });
        }
      } catch (err) {
        console.warn('Preview generation failed:', err);
      } finally {
        if (isMounted) setIsGeneratingPreview(false);
      }
    };

    updatePreview();

    return () => {
      isMounted = false;
    };
  }, [isOpen, imageUrl, cleanBackgroundUrl, withText, textLayers, screenTitle, coreSellingPoint, themeTitle, sceneIndex, resolution, includeText]);

  if (!isOpen) return null;

  // 执行正式超清下载
  const handleDownload = async () => {
    if (isExporting) return;
    try {
      setIsExporting(true);
      await downloadPosterImage({
        imageUrl,
        cleanBackgroundUrl,
        withText,
        textLayers,
        screenTitle,
        coreSellingPoint,
        themeTitle,
        sceneIndex,
        format,
        quality: 0.98,
        resolution,
        includeText
      });
      onClose();
    } catch (err: any) {
      console.error('Download poster failed:', err);
      alert('下载海报失败: ' + (err?.message || '未知错误'));
    } finally {
      setIsExporting(false);
    }
  };

  // 单独下载纯净底图原图
  const handleDownloadCleanOriginal = async () => {
    try {
      const targetUrl = cleanBackgroundUrl || imageUrl;
      const safeTitle = (screenTitle || 'scene').replace(/[\s/\\?%*:|"<>]/g, '_').slice(0, 30);
      await downloadHighResImage(targetUrl, `MW_纯净底图_第${sceneIndex}屏_${safeTitle}.jpg`);
      onClose();
    } catch (err: any) {
      alert('下载纯净底图失败: ' + (err?.message || '未知错误'));
    }
  };

  // 估算文件大小与品质描述
  const getEstimatedSize = () => {
    if (format === 'png') {
      if (resolution === 'ecommerce_3_4' || resolution === 'ultra_4k') {
        return '约 6.0 ~ 10.0 MB (无损高保真，极高锐度)';
      }
      return '约 3.5 ~ 6.0 MB (无损高保真，字体无噪点)';
    }
    if (resolution === 'ecommerce_3_4' || resolution === 'ultra_4k') {
      return '约 2.5 ~ 4.5 MB (98% 超清商业 JPG)';
    }
    return '约 1.5 ~ 3.0 MB (98% 高清商业 JPG)';
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#1C1917] text-stone-100 w-full max-w-4xl rounded-2xl border border-stone-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-800 flex items-center justify-between bg-[#24211E]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#B28C5A] to-[#8C6F43] flex items-center justify-center text-white shadow-md">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-100 flex items-center gap-2">
                海报高清下载与商业导出
                <span className="text-xs bg-[#B28C5A]/20 text-[#D8B48A] px-2 py-0.5 rounded-full border border-[#B28C5A]/30">
                  第 {sceneIndex} 屏分镜
                </span>
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">
                支持无损超清 PNG、300DPI 商业印刷规范、解决轻量压缩与字体边缘模糊
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-white hover:bg-stone-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto flex-1">
          {/* 左侧：实时海报效果预览 */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center bg-[#141211] rounded-xl p-4 border border-stone-800 relative">
            <div className="relative w-full aspect-[3/4] max-h-[380px] flex items-center justify-center bg-black/40 rounded-lg overflow-hidden shadow-inner border border-stone-800/80">
              {isGeneratingPreview ? (
                <div className="flex flex-col items-center gap-2 text-stone-400 text-xs">
                  <Loader2 className="w-6 h-6 animate-spin text-[#B28C5A]" />
                  <span>渲染高保真海报预览...</span>
                </div>
              ) : previewDataUrl ? (
                <img
                  src={previewDataUrl}
                  alt="海报导出预览"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-stone-500 text-xs flex items-center gap-1.5">
                  <FileImage className="w-4 h-4" /> 暂无预览
                </div>
              )}

              {/* 预览规格标签 */}
              <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-md text-white text-[10px] px-2.5 py-1 rounded-md font-mono flex items-center gap-1.5 border border-white/10">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>
                  {previewDimensions.width > 0
                    ? `${previewDimensions.width} × ${previewDimensions.height} px`
                    : '1536 × 2048 px'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-stone-400 mt-3 text-center flex items-center gap-1">
              <Eye className="w-3.5 h-3.5 text-[#B28C5A]" />
              实时预览已精准映射文案排版、阴影与遮罩
            </p>
          </div>

          {/* 右侧：下载规格与格式配置 */}
          <div className="lg:col-span-7 space-y-5">
            {/* 1. 格式选择 (核心解决 500KB 压缩问题) */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-300 flex items-center justify-between">
                <span>导出图像格式</span>
                <span className="text-[11px] text-[#D8B48A] font-normal">
                  {format === 'png' ? '推荐设计与印刷 (无损)' : '适合网络快速传输'}
                </span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormat('png')}
                  className={`p-3 rounded-xl border text-left transition-all relative ${
                    format === 'png'
                      ? 'bg-[#B28C5A]/15 border-[#B28C5A] text-white shadow-sm'
                      : 'bg-stone-800/40 border-stone-700 text-stone-300 hover:bg-stone-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#B28C5A]" />
                      无损超清 PNG
                    </span>
                    {format === 'png' && <CheckCircle2 className="w-4 h-4 text-[#B28C5A]" />}
                  </div>
                  <p className="text-[11px] text-stone-400 mt-1">
                    文字边缘 100% 锐利，无 JPEG 压缩块噪点，体积约 3~8 MB。
                  </p>
                  <span className="inline-block mt-2 text-[9px] bg-emerald-950/60 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-800/40">
                    推荐海报企划
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setFormat('jpeg')}
                  className={`p-3 rounded-xl border text-left transition-all relative ${
                    format === 'jpeg'
                      ? 'bg-[#B28C5A]/15 border-[#B28C5A] text-white shadow-sm'
                      : 'bg-stone-800/40 border-stone-700 text-stone-300 hover:bg-stone-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs flex items-center gap-1.5">
                      <FileImage className="w-3.5 h-3.5 text-stone-400" />
                      超清高保真 JPG
                    </span>
                    {format === 'jpeg' && <CheckCircle2 className="w-4 h-4 text-[#B28C5A]" />}
                  </div>
                  <p className="text-[11px] text-stone-400 mt-1">
                    98% 超高画质保存，文件体积约 2~4 MB，兼顾清晰与加载速度。
                  </p>
                  <span className="inline-block mt-2 text-[9px] bg-stone-700/60 text-stone-300 px-1.5 py-0.5 rounded border border-stone-600/40">
                    超清 JPG
                  </span>
                </button>
              </div>
            </div>

            {/* 2. 分辨率规格 */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-300 flex items-center justify-between">
                <span>导出分辨率档位</span>
                <span className="text-[11px] text-stone-400 font-mono">
                  当前画布比例: {sourceAspectRatio}
                </span>
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setResolution('native')}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    resolution === 'native'
                      ? 'bg-[#B28C5A]/15 border-[#B28C5A] text-white'
                      : 'bg-stone-800/40 border-stone-700 text-stone-300 hover:bg-stone-800'
                  }`}
                >
                  <div className="font-bold text-xs">原图渲染像素</div>
                  <div className="text-[11px] text-stone-400 font-mono mt-0.5">
                    1536 × 2048
                  </div>
                  <div className="text-[10px] text-stone-500 mt-1">保持 AI 原画比例</div>
                </button>

                <button
                  type="button"
                  onClick={() => setResolution('ecommerce_3_4')}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    resolution === 'ecommerce_3_4'
                      ? 'bg-[#B28C5A]/15 border-[#B28C5A] text-white'
                      : 'bg-stone-800/40 border-stone-700 text-stone-300 hover:bg-stone-800'
                  }`}
                >
                  <div className="font-bold text-xs flex items-center gap-1">
                    <Printer className="w-3 h-3 text-[#B28C5A]" />
                    商业电商 3:4
                  </div>
                  <div className="text-[11px] text-[#D8B48A] font-mono mt-0.5">
                    2100 × 2800
                  </div>
                  <div className="text-[10px] text-stone-500 mt-1">300DPI 印刷规范</div>
                </button>

                <button
                  type="button"
                  onClick={() => setResolution('ultra_4k')}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    resolution === 'ultra_4k'
                      ? 'bg-[#B28C5A]/15 border-[#B28C5A] text-white'
                      : 'bg-stone-800/40 border-stone-700 text-stone-300 hover:bg-stone-800'
                  }`}
                >
                  <div className="font-bold text-xs">4K 超高解析</div>
                  <div className="text-[11px] text-stone-400 font-mono mt-0.5">
                    3072 × 4096
                  </div>
                  <div className="text-[10px] text-stone-500 mt-1">巨幅展屏/精修</div>
                </button>
              </div>
            </div>

            {/* 3. 海报文案合成开关 */}
            <div className={`p-3.5 rounded-xl border space-y-2.5 transition-all ${
              withText ? 'bg-amber-950/20 border-amber-800/40' : 'bg-stone-800/50 border-stone-700/70'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#B28C5A]" />
                  <span className="text-xs font-bold text-stone-200">
                    叠加平台模板文案与标牌
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={includeText}
                  onChange={(e) => setIncludeText(e.target.checked)}
                  className="w-4 h-4 accent-[#B28C5A] rounded cursor-pointer"
                />
              </div>

              {withText && !includeText && (
                <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-[11px] text-emerald-300 flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>智能防重影已生效</strong>：此分镜为 AI 渲染的精装图文海报，已自动关闭平台二次模板文字，直接输出 100% 原始超清排版，彻底避免双重文字粘连。
                  </span>
                </div>
              )}

              {withText && includeText && (
                <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-700/60 text-[11px] text-amber-300 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    ⚠️ 底层海报已包含文字排版。强制开启此开关将额外叠印「SCENE #{sceneIndex}」和全案标牌，可能造成文字冲突，建议保持关闭。
                  </span>
                </div>
              )}

              <p className="text-[11px] text-stone-400">
                {hasCustomLayers
                  ? '已检测到排版工坊自定义矢量图层，将高保真合并自定义文字。'
                  : withText
                    ? '已智能保护 AI 海报原始排版，无需叠加任何多余模板文案。'
                    : '开启后将把场景标题、爆款卖点与品牌标牌以高奢渐变排版合并输出。'}
              </p>
            </div>

            {/* 4. 文件预估信息栏 */}
            <div className="p-3 bg-[#171514] rounded-xl border border-stone-800 flex items-center justify-between text-xs">
              <span className="text-stone-400">预估文件体积:</span>
              <span className="font-semibold text-emerald-400 font-mono">
                {getEstimatedSize()}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Action Bar */}
        <div className="px-6 py-4 border-t border-stone-800 bg-[#24211E] flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleDownloadCleanOriginal}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-300 hover:text-white bg-stone-800 hover:bg-stone-700 border border-stone-700 flex items-center gap-1.5 transition"
            title="单独下载未经文案合并的原始家居实景大图"
          >
            <FileImage className="w-4 h-4 text-blue-400" />
            <span>下载纯净原图 (无字)</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-300 hover:text-white hover:bg-stone-800 transition"
            >
              取消
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={isExporting}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-[#B28C5A] hover:bg-[#9E7A4A] text-white flex items-center gap-2 shadow-lg transition-all active:scale-95 disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在合成超清文件...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>确认下载超清海报 ({format.toUpperCase()})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
