import React, { useState } from 'react';
import { Sparkles, Layers, Type, RefreshCw, CheckCircle2, ShieldCheck, Download, Wand2, Palette } from 'lucide-react';
import { ScreenComposition, TextLayer } from '../../types/detailCompositionSchema';
import { TextLayerEditor } from './TextLayerEditor';
import { requestCompositionRender, pollCompositionRenderJob } from '../../services/detailCompositionService';
import { supabase } from '../../lib/supabase';
import { downloadFileWithFallback } from '../../lib/storage/fileDownload';

interface ScreenCompositionPreviewProps {
  canvasId: string;
  baseImageUrl?: string;
  composition: ScreenComposition;
  onCompositionChange?: (updated: ScreenComposition) => void;
  onRenderCompleted?: (assetVersionId: string, outputUrl: string) => void;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token || '';
  const user = data?.session?.user;
  const storedUser = localStorage.getItem('manwah_user');
  let userUuid = user?.id || '';

  if (!userUuid && storedUser) {
    try {
      const parsed = JSON.parse(storedUser);
      userUuid = parsed.id || '';
    } catch (e) {}
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (userUuid) headers['x-user-uuid'] = userUuid;
  return headers;
}

export const ScreenCompositionPreview: React.FC<ScreenCompositionPreviewProps> = ({
  canvasId,
  baseImageUrl,
  composition: initialComposition,
  onCompositionChange,
  onRenderCompleted
}) => {
  const [composition, setComposition] = useState<ScreenComposition>(initialComposition);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(
    initialComposition.textLayers[0]?.id || null
  );
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [isAiDesigning, setIsAiDesigning] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<string>('luxury_minimal');
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [outputResult, setOutputResult] = useState<{ assetVersionId: string; url: string } | null>(
    initialComposition.renderAssetVersionId
      ? {
          assetVersionId: initialComposition.renderAssetVersionId,
          url: `/api/canvases/compositions/file/${initialComposition.screenId}/${initialComposition.renderAssetVersionId}.jpg`
        }
      : null
  );

  const handleUpdateLayer = (updated: TextLayer) => {
    const nextLayers = composition.textLayers.map(l => l.id === updated.id ? updated : l);
    const nextComposition = { ...composition, textLayers: nextLayers };
    setComposition(nextComposition);
    if (onCompositionChange) onCompositionChange(nextComposition);
  };

  const handleAiDesignAestheticLayout = async () => {
    setIsAiDesigning(true);
    setAiMessage(null);
    try {
      const authHeaders = await getAuthHeaders();
      const slotsPayload = composition.textLayers.map(tl => ({
        slotKey: tl.slotKey || tl.copyField,
        semanticRole: tl.copyField,
        content: tl.text,
        fontSize: tl.fontSize,
        fontWeight: tl.fontWeight,
        color: tl.color,
        fontFamily: tl.fontFamily,
        textAlign: tl.textAlign,
        maxLines: tl.maxLines,
        enabled: true
      }));

      const res = await fetch('/api/typography-specs/ai-design-layout', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          canvasId,
          projectId: canvasId,
          sceneKey: composition.screenId,
          sceneRole: composition.screenRole,
          slots: slotsPayload,
          slotWidth: 2100,
          slotHeight: composition.height || 2800,
          theme: selectedTheme
        })
      });

      const data = await res.json();
      if (data.success && Array.isArray(data.textLayers) && data.textLayers.length > 0) {
        const nextComp: ScreenComposition = {
          ...composition,
          textLayers: data.textLayers
        };
        setComposition(nextComp);
        if (data.textLayers[0]) setSelectedLayerId(data.textLayers[0].id);
        if (onCompositionChange) onCompositionChange(nextComp);
        setAiMessage(data.message || '✨ AI 美学智能排版引擎已完成版面重构与防重叠设计！');
      } else {
        setAiMessage('AI 排版计算未返回新图层，保留当前排版。');
      }
    } catch (e: any) {
      console.error('Failed to AI design layout:', e);
      setAiMessage('AI 排版重构请求失败: ' + (e.message || '网络异常'));
    } finally {
      setIsAiDesigning(false);
    }
  };

  const handleTriggerRender = async () => {
    setRendering(true);
    setRenderProgress(10);
    try {
      const { jobId } = await requestCompositionRender({
        canvasId,
        workspaceId: composition.workspaceId || 'default-workspace',
        screenId: composition.screenId,
        screenRole: composition.screenRole,
        slotHeight: composition.height,
        baseAssetVersionId: composition.baseAssetVersionId,
        productDnaVersionId: composition.productDnaVersionId,
        copySkuId: composition.copySkuId,
        copyVersionId: composition.copyVersionId,
        typographySpecId: composition.typographySpecId,
        consistencyReportId: composition.consistencyReportId
      });

      // Poll render job
      let completed = false;
      let attempts = 0;
      while (!completed && attempts < 20) {
        await new Promise(r => setTimeout(r, 600));
        attempts++;
        const job = await pollCompositionRenderJob(canvasId, jobId);
        setRenderProgress(job.progressPercent || 50);

        if (job.status === 'completed' && job.compositionAssetVersionId && job.outputUrl) {
          completed = true;
          setOutputResult({
            assetVersionId: job.compositionAssetVersionId,
            url: job.outputUrl
          });
          if (onRenderCompleted) {
            onRenderCompleted(job.compositionAssetVersionId, job.outputUrl);
          }
        } else if (job.status === 'failed') {
          throw new Error(job.error || 'Render job failed');
        }
      }
    } catch (e) {
      console.error('Failed to trigger composition render:', e);
    } finally {
      setRendering(false);
    }
  };

  const handleDownloadSolidified = async () => {
    if (!outputResult?.assetVersionId && !outputResult?.url) return;
    setDownloading(true);
    try {
      const assetId = outputResult?.assetVersionId || initialComposition.renderAssetVersionId || '';
      const scId = composition.screenId || 'screen';
      const fileName = `${composition.screenId || 'screen'}_2100x${composition.height || 2800}_solidified.jpg`;

      const candidateUrls = [
        outputResult?.url,
        `/api/canvases/compositions/file/${scId}/${assetId}.jpg`,
        `/api/canvases/compositions/file/${assetId}.jpg`,
        `/api/canvases/exports/file/${assetId}.jpg`
      ].filter(Boolean) as string[];

      await downloadFileWithFallback(candidateUrls, fileName);
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setDownloading(false);
    }
  };

  const compHeight = composition.height || 2800;
  const previewScale = Math.min(0.16, 448 / compHeight); // Scale nicely for UI canvas preview
  const canvasDisplayWidth = 2100 * previewScale;
  const canvasDisplayHeight = compHeight * previewScale;

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4 bg-[#FAF8F5] rounded-3xl border border-[#E5E0D8]">
      {/* Left: Interactive 2100 x H Canvas Scaled Container */}
      <div className="flex flex-col items-center gap-3">
        <div className="text-xs font-bold text-[#2C2A29] flex items-center justify-between w-full max-w-[340px]">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#B28C5A]" />
            <span>{composition.screenId.toUpperCase()} 真实排版</span>
          </div>
          <span className="text-[10px] bg-[#B28C5A] text-white px-2 py-0.5 rounded-full font-mono">
            2100 × {compHeight} px
          </span>
        </div>

        {/* AI Theme selector & Smart Layout Trigger */}
        <div className="w-full max-w-[340px] flex items-center gap-1.5 p-1.5 bg-white rounded-2xl border border-[#E5E0D8] shadow-sm">
          <Palette className="w-3.5 h-3.5 text-[#B28C5A] ml-1 shrink-0" />
          <select
            value={selectedTheme}
            onChange={(e) => setSelectedTheme(e.target.value)}
            className="text-[11px] bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 text-stone-700 font-medium focus:outline-none focus:ring-1 focus:ring-[#B28C5A]"
          >
            <option value="luxury_minimal">轻奢高级感 (金色CTA)</option>
            <option value="modern_bold">现代醒目 (高对比)</option>
            <option value="tech_param">硬核科技 (参数矩阵)</option>
            <option value="feature_split">功能拆解 (图文分区)</option>
          </select>

          <button
            onClick={handleAiDesignAestheticLayout}
            disabled={isAiDesigning}
            className="flex-1 py-1.5 px-2.5 bg-gradient-to-r from-[#B28C5A] to-[#8C6F43] hover:from-[#A27B49] hover:to-[#7B5E32] text-white text-[11px] font-bold rounded-xl flex items-center justify-center gap-1 shadow-sm transition-all active:scale-95 disabled:opacity-50"
            title="依据当前分屏角色与文案，重新计算字号梯度、防重叠纵横坐标与金色 CTA / 磨砂质感卡片"
          >
            {isAiDesigning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>AI 设计中...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-3.5 h-3.5" />
                <span>AI 美学排版</span>
              </>
            )}
          </button>
        </div>

        {aiMessage && (
          <div className="text-[11px] text-[#8C6F43] bg-[#B28C5A]/10 border border-[#B28C5A]/20 p-2 rounded-xl w-full max-w-[340px] leading-tight">
            {aiMessage}
          </div>
        )}

        <div
          className="relative bg-white rounded-2xl shadow-xl overflow-hidden border border-[#E5E0D8] group select-none"
          style={{ width: `${canvasDisplayWidth}px`, height: `${canvasDisplayHeight}px` }}
        >
          {/* Base Background Image */}
          {baseImageUrl ? (
            <img
              src={baseImageUrl}
              alt={`${composition.screenId} Base Image`}
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-b from-[#FAF8F5] via-[#F2EDE4] to-[#E8E1D5]" />
          )}

          {/* Text Layers Overlay with Container Style */}
          {composition.textLayers.map(layer => {
            const isSelected = selectedLayerId === layer.id;
            const containerStyle = (layer as any).containerStyle;

            return (
              <div
                key={layer.id}
                onClick={() => setSelectedLayerId(layer.id)}
                className={`absolute cursor-pointer transition-all duration-150 border ${
                  isSelected
                    ? 'border-[#B28C5A] ring-2 ring-[#B28C5A]/40'
                    : 'border-dashed border-stone-400/30 hover:border-[#B28C5A]/60'
                }`}
                style={{
                  left: `${layer.x * previewScale}px`,
                  top: `${layer.y * previewScale}px`,
                  width: `${layer.width * previewScale}px`,
                  height: `${layer.height * previewScale}px`,
                  color: layer.color,
                  fontSize: `${layer.fontSize * previewScale}px`,
                  fontWeight: layer.fontWeight,
                  textAlign: layer.textAlign,
                  lineHeight: layer.lineHeight,
                  letterSpacing: `${(layer.letterSpacing || 0) * previewScale}px`,
                  backgroundColor: containerStyle?.backgroundColor || 'transparent',
                  borderRadius: containerStyle?.borderRadius ? `${containerStyle.borderRadius * previewScale}px` : undefined,
                  border: containerStyle?.border || undefined,
                  padding: containerStyle?.padding ? `${containerStyle.padding * previewScale}px` : '2px',
                  boxShadow: containerStyle?.boxShadow || undefined,
                  backdropFilter: containerStyle?.backgroundColor?.includes('rgba') ? 'blur(4px)' : undefined,
                  zIndex: layer.zIndex
                }}
              >
                <div
                  className="w-full h-full overflow-hidden pointer-events-none font-sans flex"
                  style={{
                    alignItems: layer.verticalAlign === 'middle' ? 'center' : (layer.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start'),
                    justifyContent: layer.textAlign === 'center' ? 'center' : (layer.textAlign === 'right' ? 'flex-end' : 'flex-start')
                  }}
                >
                  {layer.text}
                </div>
              </div>
            );
          })}

          {/* Resolution & Safety Badge */}
          <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md text-white text-[9px] px-2 py-0.5 rounded-full font-mono flex items-center gap-1 z-30">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>2100 × {compHeight} px · Vector Typography</span>
          </div>
        </div>

        {/* Render Solidified Asset Button */}
        <button
          onClick={handleTriggerRender}
          disabled={rendering}
          className="w-full max-w-[340px] py-2.5 px-4 bg-[#B28C5A] hover:bg-[#9E7A4A] disabled:opacity-50 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-98"
        >
          {rendering ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>服务端排版合成中 ({renderProgress}%)...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>生成 2100×{compHeight} 固化 Asset Version</span>
            </>
          )}
        </button>

        {outputResult && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 space-y-1.5 w-full max-w-[340px]">
            <div className="font-bold flex items-center justify-between">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> 固化成功 (Asset Version)
              </span>
              <span className="text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.2 rounded font-mono">READY</span>
            </div>
            <div className="text-[10px] font-mono text-stone-600 truncate">
              ID: {outputResult.assetVersionId}
            </div>
            <button
              onClick={handleDownloadSolidified}
              disabled={downloading}
              className="w-full py-1.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-98 disabled:opacity-50"
            >
              {downloading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>下载准备中...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>下载 2100×{compHeight} 高清海报</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Right: Text Layer Editor Panel */}
      <div className="flex-1 min-w-[280px]">
        <TextLayerEditor
          layers={composition.textLayers}
          selectedLayerId={selectedLayerId}
          onSelectLayer={setSelectedLayerId}
          onChangeLayer={handleUpdateLayer}
        />
      </div>
    </div>
  );
};
