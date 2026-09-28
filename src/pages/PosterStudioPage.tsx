// src/pages/PosterStudioPage.tsx
import React, { useState } from 'react';
import {
  createDefaultNinePlan,
  buildPosterComposition,
  PlanScreenItem,
  downloadNinePostersZip,
  downloadSinglePosterJpeg
} from '../services/posterStudioService';
import { PosterCompositionSnapshot, TemplateId } from '../types/posterTemplate';
import { SpaceStudioMode } from '../types/spaceStudio';
import { SpaceStudioShell } from '../features/space-studio/shell/SpaceStudioShell';
import { POSTER_SPEC } from '../config/posterSpec';
import { POSTER_TEMPLATES } from '../config/posterTemplates';
import { PosterCanvas } from '../components/poster-studio/PosterCanvas';
import { NineScreenNavigator } from '../components/poster-studio/NineScreenNavigator';
import { LeftDrawer } from '../components/poster-studio/LeftDrawer';
import { RightAiAssistant } from '../components/poster-studio/RightAiAssistant';
import { NineScreenPreviewModal } from '../components/poster-studio/NineScreenPreviewModal';
import { DevDebugDrawer } from '../components/poster-studio/DevDebugDrawer';
import { generateEditedImage, rewriteCopywriting } from '../services/geminiService';
import { dbService } from '../services/dbService';
import { supabase } from '../lib/supabase';
import {
  Layers,
  Sparkles,
  Download,
  Eye,
  CheckCircle2,
  FileArchive,
  ArrowLeft,
  Settings,
  Camera
} from 'lucide-react';
import { UserBadge } from '../components/common/UserBadge';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

export const PosterStudioPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const urlMode = searchParams.get('mode');
  const initialMode: SpaceStudioMode = urlMode === 'poster' ? 'poster' : 'space';

  const handoff = (location.state as {
    posterStudioHandoff?: { schemaVersion?: string; canvasId?: string; projectId?: string; screens?: PlanScreenItem[]; initialScreenIndex?: number };
  } | null)?.posterStudioHandoff;

  const initialScreens =
    handoff?.schemaVersion === 'poster-studio-handoff/v1' && handoff.screens && handoff.screens.length > 0
      ? handoff.screens
      : createDefaultNinePlan({
          productName: 'MANWAH 智能电动功能沙发',
          category: '真皮多功能沙发',
          materials: ['甄选南美进口头层牛皮', '德国超静音低压电机', '七区人体工学承托']
        });

  // 1. Core State: 9 Screen Plans and Compositions
  const [studioMode, setStudioMode] = useState<SpaceStudioMode>(initialMode);
  const [screens, setScreens] = useState<PlanScreenItem[]>(initialScreens);

  const [activeScreenIndex, setActiveScreenIndex] = useState<number>(
    typeof handoff?.initialScreenIndex === 'number' ? handoff.initialScreenIndex : 1
  );
  const [compositions, setCompositions] = useState<Record<number, PosterCompositionSnapshot>>(() =>
    Object.fromEntries(initialScreens.map((screen) => [screen.screenIndex, buildPosterComposition(screen)]))
  );

  // 2. UI State
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState<boolean>(false);
  const [isGeneratingCurrent, setIsGeneratingCurrent] = useState<boolean>(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState<boolean>(false);
  const [isExportingZip, setIsExportingZip] = useState<boolean>(false);
  const [generationNotice, setGenerationNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const activeScreen = screens.find((s) => s.screenIndex === activeScreenIndex) || screens[0];
  const activeComposition =
    compositions[activeScreenIndex] || buildPosterComposition(activeScreen);

  // Auto save poster studio draft to IndexedDB
  React.useEffect(() => {
    if (screens && screens.length > 0) {
      dbService.saveDraft('manwah_poster_studio_draft', { screens, compositions })
        .catch(e => console.warn('Poster studio draft save warning:', e));
    }
  }, [screens, compositions]);

  // Load draft on mount if not handing off from canvas
  React.useEffect(() => {
    if (!handoff) {
      dbService.getDraft<{ screens: PlanScreenItem[]; compositions: Record<number, PosterCompositionSnapshot> }>('manwah_poster_studio_draft')
        .then((draft) => {
          if (draft && Array.isArray(draft.screens) && draft.screens.length > 0) {
            setScreens(draft.screens);
            if (draft.compositions && Object.keys(draft.compositions).length > 0) {
              setCompositions(draft.compositions);
            }
          }
        })
        .catch(err => console.warn('Failed loading poster studio draft:', err));
    }
  }, []);

  // 3. Plan & Composition Update Handlers
  const handleUpdatePlan = (updates: Partial<PlanScreenItem>) => {
    setScreens((prev) =>
      prev.map((s) => (s.screenIndex === activeScreenIndex ? { ...s, ...updates } : s))
    );

    // Sync to composition
    const updatedScreen = { ...activeScreen, ...updates };
    const updatedComp = buildPosterComposition(
      updatedScreen,
      activeComposition.imageLayers?.[0]?.imageUrl
    );
    setCompositions((prev) => ({ ...prev, [activeScreenIndex]: updatedComp }));
  };

  const handleUpdateComposition = (updated: PosterCompositionSnapshot) => {
    setCompositions((prev) => ({ ...prev, [activeScreenIndex]: updated }));
  };

  const handleSwitchTemplate = (templateId: TemplateId) => {
    const updatedScreen: PlanScreenItem = {
      ...activeScreen,
      templateId
    };
    setScreens((prev) =>
      prev.map((s) => (s.screenIndex === activeScreenIndex ? updatedScreen : s))
    );

    const newComp = buildPosterComposition(
      updatedScreen,
      activeComposition.imageLayers?.[0]?.imageUrl
    );
    setCompositions((prev) => ({ ...prev, [activeScreenIndex]: newComp }));
  };

  // 接收从 Space Studio 传来的单屏海报排版计划与镜头渲染图
  const handleSpaceHandoff = (item: PlanScreenItem) => {
    setScreens((prev) =>
      prev.map((s) => (s.screenIndex === item.screenIndex ? item : s))
    );
    const newComp = buildPosterComposition(item, item.sourceImageUrl, 2100, 2800, '3:4');
    setCompositions((prev) => ({ ...prev, [item.screenIndex]: newComp }));
    setActiveScreenIndex(item.screenIndex);
    setStudioMode('poster');
    setGenerationNotice({
      type: 'success',
      message: `✨ 已成功将 Space Studio 空间镜头资产【${item.screenTitle}】无缝注入第 0${item.screenIndex} 屏！已完成智能排版。`
    });
  };

  // 4. Product Photo Upload (Safe Aspect Ratio preservation)
  const handleUploadProductPhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const width = img.naturalWidth || 2560;
        const height = img.naturalHeight || 1440;
        const aspect = width / height;

        const updatedScreen: PlanScreenItem = {
          ...activeScreen,
          sourceImageUrl: dataUrl,
          sourceWidth: width,
          sourceHeight: height,
          sourceAspectRatio: aspect,
          status: 'review'
        };

        setScreens((prev) =>
          prev.map((s) => (s.screenIndex === activeScreenIndex ? updatedScreen : s))
        );

        const newComp = buildPosterComposition(updatedScreen, dataUrl, width, height);
        setCompositions((prev) => ({ ...prev, [activeScreenIndex]: newComp }));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Helper to load image natural dimensions
  const getImageDimensions = (url: string): Promise<{ w: number; h: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 2100, h: img.naturalHeight || 2800 });
      img.onerror = () => resolve({ w: 2100, h: 2800 });
      img.src = url;
    });
  };

  // 5. AI Generation Handlers
  const handleGenerateCurrentScreen = async () => {
    try {
      setGenerationNotice(null);
      setIsGeneratingCurrent(true);
      setScreens((prev) =>
        prev.map((s) => (s.screenIndex === activeScreenIndex ? { ...s, status: 'generating' } : s))
      );

      // Clean prompt without text
      const cleanPrompt = `${activeScreen.prompt}\n\n[CRITICAL NEGATIVE INSTRUCTION]: ${activeScreen.negativePrompt}`;
      const genResult = await generateEditedImage(
        cleanPrompt,
        [],
        '3:4',
        '2K',
        'gemini-3.1-flash-image-preview',
        undefined,
        (msg) => console.log(`[ScreenGen 0${activeScreenIndex}]:`, msg)
      );

      if (genResult && genResult.imageUrl) {
        const { w, h } = await getImageDimensions(genResult.imageUrl);
        const aspect = w / h;

        const updatedScreen: PlanScreenItem = {
          ...activeScreen,
          sourceImageUrl: genResult.imageUrl,
          sourceWidth: w,
          sourceHeight: h,
          sourceAspectRatio: aspect,
          status: 'approved'
        };

        setScreens((prev) =>
          prev.map((s) => (s.screenIndex === activeScreenIndex ? updatedScreen : s))
        );

        const updatedComp = buildPosterComposition(updatedScreen, genResult.imageUrl, w, h);
        setCompositions((prev) => ({ ...prev, [activeScreenIndex]: updatedComp }));

        // Save instantly to IndexedDB history archive
        await dbService.saveHistoryWithEvent({
          id: `poster_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          imageUrl: genResult.imageUrl,
          prompt: cleanPrompt,
          model: 'gemini-3.1-flash-image-preview',
          roleUsed: `海报屏块 #${activeScreenIndex} ${activeScreen.screenTitle || ''}`,
          timestamp: Date.now()
        }).catch(e => console.warn('History save warning:', e));

        setGenerationNotice({ type: 'success', message: `第 ${activeScreenIndex} 屏已生成，画布已自动按 ${w}x${h} (${aspect.toFixed(2)}) 比例匹配排版。` });
      } else {
        throw new Error('生成服务未返回有效图片');
      }
    } catch (err) {
      console.error('Screen generation failed:', err);
      setScreens((prev) =>
        prev.map((s) => (s.screenIndex === activeScreenIndex ? { ...s, status: 'failed' } : s))
      );
      setGenerationNotice({
        type: 'error',
        message: `第 ${activeScreenIndex} 屏生成失败：${err instanceof Error ? err.message : '未知错误'}`
      });
    } finally {
      setIsGeneratingCurrent(false);
    }
  };

  const handleGenerateAllScreens = async () => {
    setIsGeneratingAll(true);
    setGenerationNotice(null);
    let successCount = 0;
    let failedCount = 0;
    for (let i = 0; i < screens.length; i++) {
      const s = screens[i];
      setActiveScreenIndex(s.screenIndex);

      try {
        setScreens((prev) =>
          prev.map((item) =>
            item.screenIndex === s.screenIndex ? { ...item, status: 'generating' } : item
          )
        );

        const cleanPrompt = `${s.prompt}\n\n[CRITICAL NEGATIVE INSTRUCTION]: ${s.negativePrompt}`;
        const genResult = await generateEditedImage(
          cleanPrompt,
          [],
          '3:4',
          '2K',
          'gemini-3.1-flash-image-preview',
          undefined,
          (msg) => console.log(`[ScreenGen 0${s.screenIndex}]:`, msg)
        );

        if (genResult && genResult.imageUrl) {
          const { w, h } = await getImageDimensions(genResult.imageUrl);
          const aspect = w / h;

          const updatedScreen: PlanScreenItem = {
            ...s,
            sourceImageUrl: genResult.imageUrl,
            sourceWidth: w,
            sourceHeight: h,
            sourceAspectRatio: aspect,
            status: 'approved'
          };

          setScreens((prev) =>
            prev.map((item) => (item.screenIndex === s.screenIndex ? updatedScreen : item))
          );

          const updatedComp = buildPosterComposition(updatedScreen, genResult.imageUrl, w, h);
          setCompositions((prev) => ({ ...prev, [s.screenIndex]: updatedComp }));

          // Save instantly to IndexedDB history archive
          await dbService.saveHistoryWithEvent({
            id: `poster_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            imageUrl: genResult.imageUrl,
            prompt: cleanPrompt,
            model: 'gemini-3.1-flash-image-preview',
            roleUsed: `海报屏块 #${s.screenIndex} ${s.screenTitle || ''}`,
            timestamp: Date.now()
          }).catch(e => console.warn('History save warning:', e));

          successCount += 1;
        } else {
          throw new Error('生成服务未返回有效图片');
        }
      } catch (e) {
        console.warn(`Screen ${s.screenIndex} generation warning:`, e);
        failedCount += 1;
        setScreens((prev) =>
          prev.map((item) =>
            item.screenIndex === s.screenIndex ? { ...item, status: 'failed' } : item
          )
        );

        const errorText = e instanceof Error ? e.message : String(e);
        if (/余额不足|insufficient|quota|额度不足/i.test(errorText)) {
          const remaining = screens.slice(i + 1).map((item) => item.screenIndex);
          failedCount += remaining.length;
          setScreens((prev) =>
            prev.map((item) =>
              remaining.includes(item.screenIndex) ? { ...item, status: 'failed' } : item
            )
          );
          break;
        }
      }
    }
    setIsGeneratingAll(false);
    setGenerationNotice(
      failedCount > 0
        ? { type: 'error', message: `全案任务结束：成功 ${successCount} 屏，失败 ${failedCount} 屏。` }
        : { type: 'success', message: `全案全部生成完成，共 ${successCount} 屏。已自动保存至本地历史库。` }
    );
  };

  const handleAiRewriteCopy = async () => {
    try {
      const optimizedText = await rewriteCopywriting(
        `请为高端家具详情海报润色文案：主标题“${activeScreen.headline}”，副标题“${activeScreen.subheadline}”。要求高质感、奢华温润、简练有力。`,
        (msg) => console.log('[RewriteCopy]:', msg)
      );

      if (optimizedText) {
        const parts = optimizedText.split('\n').filter(Boolean);
        if (parts.length >= 1) {
          handleUpdatePlan({
            headline: parts[0] || activeScreen.headline,
            subheadline: parts[1] || activeScreen.subheadline
          });
        }
      }
    } catch (e) {
      console.warn('AI Rewrite Copy fallback:', e);
    }
  };

  const handleAutoLayout = () => {
    // 智能排版：随机尝试一个与当前不同的模版，并重置坐标
    const allTemplateIds = Object.keys(POSTER_TEMPLATES) as TemplateId[];
    const currentId = activeScreen.templateId;
    const availableIds = allTemplateIds.filter(id => id !== currentId);
    const randomId = availableIds[Math.floor(Math.random() * availableIds.length)];

    const updatedScreen = { ...activeScreen, templateId: randomId };
    
    setScreens((prev) =>
      prev.map((item) => (item.screenIndex === activeScreenIndex ? updatedScreen : item))
    );

    const fresh = buildPosterComposition(updatedScreen, activeComposition.imageLayers?.[0]?.imageUrl);
    setCompositions((prev) => ({ ...prev, [activeScreenIndex]: fresh }));
  };

  // 6. Export Handlers & Navigation
  const [isSplittingLayers, setIsSplittingLayers] = useState<boolean>(false);

  const handleBackToCanvas = () => {
    const rawId = handoff?.projectId || handoff?.canvasId || 'latest';
    const cleanProjectId = String(rawId).replace(/^canvas_/, '');
    navigate(`/creative-canvas/${cleanProjectId}`);
  };

  const handleSplitLayers = async () => {
    try {
      setIsSplittingLayers(true);
      const activeImg = activeComposition.imageLayers?.[0]?.imageUrl || activeScreen.sourceImageUrl;

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || localStorage.getItem('token') || '';

      const res = await fetch('/api/poster/split-layers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          imageUrl: activeImg,
          screenIndex: activeScreenIndex,
          headline: activeScreen.headline,
          subheadline: activeScreen.screenTitle
        })
      });

      if (!res.ok) {
        throw new Error('网络解析异常');
      }

      const data = await res.json();
      if (data.success && data.splitComposition) {
        const newComp: PosterCompositionSnapshot = {
          ...activeComposition,
          textLayers: data.splitComposition.textLayers || activeComposition.textLayers,
          imageLayers: data.splitComposition.imageLayers || activeComposition.imageLayers
        };
        setCompositions((prev) => ({ ...prev, [activeScreenIndex]: newComp }));
        setGenerationNotice({
          type: 'success',
          message: '⚡ 已成功对海报进行智能拆分！标题、副标题、卖点与背景/前景已被解析为自由移动图层。'
        });
      }
    } catch (err: any) {
      console.error('Layer split failed:', err);
      setGenerationNotice({
        type: 'error',
        message: err?.message || '图层拆分失败'
      });
    } finally {
      setIsSplittingLayers(false);
    }
  };

  const handleExportAllZip = async () => {
    try {
      setIsExportingZip(true);
      const snapshots = screens.map((s) => compositions[s.screenIndex]);
      if (snapshots.some((snapshot) => !snapshot)) {
        throw new Error('全案排版数据不完整，请先补齐缺失屏');
      }
      await downloadNinePostersZip(snapshots, 'MANWAH_全案电商详情海报套件_2100x2800');
    } catch (e) {
      console.error('ZIP Export failed:', e);
    } finally {
      setIsExportingZip(false);
    }
  };

  return (
    <div className="flex flex-col w-screen h-screen bg-stone-950 text-stone-100 overflow-hidden select-none font-sans">
      {/* 1. TOP APP BAR */}
      <header className="h-14 bg-stone-900 border-b border-stone-800 px-5 flex items-center justify-between z-40 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackToCanvas}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-amber-300 rounded-lg text-xs font-semibold border border-stone-700 transition cursor-pointer"
            title="返回基础工作流"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>返回基础工作流</span>
          </button>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-stone-900/90 p-1 rounded-full border border-stone-800">
              {/* 摄影画册工作台（放在左边，核心展示） */}
              <button
                onClick={() => setStudioMode('space')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                  studioMode === 'space'
                    ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-sm border border-amber-500/50'
                    : 'text-stone-300 hover:text-white hover:bg-stone-800'
                }`}
                title="摄影画册工作台"
              >
                <Camera className="w-3.5 h-3.5 text-amber-300" />
                <span className="whitespace-nowrap">摄影画册工作台</span>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              </button>

              {/* 全案（缩小成一个小按钮） */}
              <button
                onClick={() => setStudioMode('poster')}
                className={`px-2 py-1 rounded-full text-[11px] font-medium transition cursor-pointer border whitespace-nowrap ${
                  studioMode === 'poster'
                    ? 'bg-amber-500/25 text-amber-300 border-amber-500/40 shadow-xs'
                    : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800 border-transparent'
                }`}
                title="切换至全案海报工作台"
              >
                全案
              </button>
            </div>

            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-stone-800 text-stone-300 border border-stone-700">
              {(studioMode as string) === 'space' ? '2100 × 2800 px · 3:4 · 摄影母版' : '2100 × 2800 px · 3:4 · JPEG'}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar shrink-0">
          {studioMode === 'poster' ? (
            <>
              <button
                onClick={handleSplitLayers}
                disabled={isSplittingLayers}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 rounded-lg text-xs font-bold transition disabled:opacity-50 whitespace-nowrap shrink-0"
                title="利用 AI (GPT/Gemini Image-2-c) 将已有带文字海报拆解为标题、副标题与前后景多维图层"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span className="whitespace-nowrap">{isSplittingLayers ? '拆分图层中...' : '⚡ 一键 AI 拆分海报图层'}</span>
              </button>

              <button
                onClick={() => setIsPreviewModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs font-semibold border border-stone-700 transition whitespace-nowrap shrink-0"
              >
                <Eye className="w-3.5 h-3.5 text-amber-400" />
                <span className="whitespace-nowrap">全览全案</span>
              </button>

              <button
                onClick={() => downloadSinglePosterJpeg(activeComposition)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs font-semibold border border-stone-700 transition whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="whitespace-nowrap">导出当前屏 (JPEG)</span>
              </button>

              <button
                onClick={handleExportAllZip}
                disabled={isExportingZip}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-lg shadow-amber-950/50 transition active:scale-98 whitespace-nowrap shrink-0"
              >
                <FileArchive className="w-3.5 h-3.5" />
                <span className="whitespace-nowrap">{isExportingZip ? '打包中...' : '打包下载全案 ZIP'}</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-400">摄影画册模式 · A00~A08 连续视角</span>
            </div>
          )}

          <div className="h-5 w-px bg-stone-800 my-auto shrink-0" />
          <UserBadge theme="dark" variant="detailed" className="shrink-0" />
        </div>
      </header>

      {studioMode === 'space' ? (
        <SpaceStudioShell
          onSwitchMode={setStudioMode}
          onBackToCanvas={handleBackToCanvas}
          onHandoffToPoster={handleSpaceHandoff}
        />
      ) : (
        <>
          {generationNotice && (
            <div
              className={`shrink-0 px-5 py-2 text-xs font-semibold border-b ${
                generationNotice.type === 'success'
                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-900'
                  : 'bg-rose-950/70 text-rose-300 border-rose-900'
              }`}
              role="status"
            >
              {generationNotice.message}
            </div>
          )}

          {/* 2. MAIN WORKSPACE (Left Drawer + Canvas Viewport + Right AI Assistant) */}
          <div className="flex-1 flex overflow-hidden relative">
            {/* Left Drawer */}
            <LeftDrawer
              activeScreen={activeScreen}
              activeComposition={activeComposition}
              onUpdateComposition={handleUpdateComposition}
              onUpdatePlan={handleUpdatePlan}
              onUploadProductPhoto={handleUploadProductPhoto}
              onSwitchTemplate={handleSwitchTemplate}
            />

            {/* Center Canvas Viewport */}
            <main className="flex-1 h-full relative overflow-hidden bg-stone-950 flex flex-col">
              <PosterCanvas
                composition={activeComposition}
                onUpdateComposition={handleUpdateComposition}
                onReplaceImagePrompt={handleGenerateCurrentScreen}
                onAiRewriteText={handleAiRewriteCopy}
              />
            </main>

            {/* Right AI Assistant */}
            <RightAiAssistant
              activeScreen={activeScreen}
              activeComposition={activeComposition}
              isGeneratingCurrent={isGeneratingCurrent}
              isGeneratingAll={isGeneratingAll}
              onGenerateCurrentScreen={handleGenerateCurrentScreen}
              onGenerateAllScreens={handleGenerateAllScreens}
              onAiRewriteCopy={handleAiRewriteCopy}
              onAutoLayout={handleAutoLayout}
              onUpdatePlan={handleUpdatePlan}
            />
          </div>

          {/* 3. BOTTOM NINE-SCREEN NAVIGATOR */}
          <NineScreenNavigator
            screens={screens}
            compositions={compositions}
            activeScreenIndex={activeScreenIndex}
            onSelectScreen={setActiveScreenIndex}
            onRegenerateScreen={handleGenerateCurrentScreen}
          />

          {/* 4. NINE SCREEN PREVIEW MODAL */}
          <NineScreenPreviewModal
            isOpen={isPreviewModalOpen}
            onClose={() => setIsPreviewModalOpen(false)}
            screens={screens}
            compositions={compositions}
          />
        </>
      )}

      {/* 5. DEV DIAGNOSTICS DRAWER */}
      {(import.meta as any).env?.DEV && <DevDebugDrawer currentComposition={activeComposition} />}
    </div>
  );
};

export default PosterStudioPage;
