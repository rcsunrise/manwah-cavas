// src/components/poster-studio/NineScreenPreviewModal.tsx
import React, { useState } from 'react';
import { X, Download, Grid, Rows, Sparkles, CheckCircle2, FileArchive } from 'lucide-react';
import { PosterCompositionSnapshot } from '../../types/posterTemplate';
import { PlanScreenItem, downloadNinePostersZip, downloadSinglePosterJpeg } from '../../services/posterStudioService';

interface NineScreenPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  screens: PlanScreenItem[];
  compositions: Record<number, PosterCompositionSnapshot>;
}

export const NineScreenPreviewModal: React.FC<NineScreenPreviewModalProps> = ({
  isOpen,
  onClose,
  screens,
  compositions
}) => {
  const [viewMode, setViewMode] = useState<'vertical' | 'grid'>('vertical');
  const [isExportingZip, setIsExportingZip] = useState(false);

  if (!isOpen) return null;

  const snapshots = screens.map((s) => compositions[s.screenIndex]);

  const handleExportZip = async () => {
    try {
      setIsExportingZip(true);
      await downloadNinePostersZip(snapshots, 'MANWAH_全案电商详情海报套件_2100x2800');
    } catch (e) {
      console.error('ZIP Export Error:', e);
    } finally {
      setIsExportingZip(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col select-none animate-in fade-in duration-200">
      {/* Modal Top Bar */}
      <div className="h-16 border-b border-stone-800 px-6 flex items-center justify-between bg-stone-950/90 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">全案成品海报全览 & 批量导出</h2>
            <p className="text-[11px] text-stone-400">
              固定 2100 × 2800 px · 3:4 · JPEG 高清成片 · 独立排版渲染
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-stone-900 border border-stone-800 rounded-lg p-0.5 text-stone-400 text-xs">
            <button
              onClick={() => setViewMode('vertical')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
                viewMode === 'vertical' ? 'bg-stone-800 text-white font-medium' : 'hover:text-stone-200'
              }`}
            >
              <Rows className="w-3.5 h-3.5" />
              <span>长图串联</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
                viewMode === 'grid' ? 'bg-stone-800 text-white font-medium' : 'hover:text-stone-200'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>3×3 矩阵</span>
            </button>
          </div>

          {/* Export ZIP Button */}
          <button
            onClick={handleExportZip}
            disabled={isExportingZip}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 text-white font-bold rounded-lg shadow-lg transition text-xs"
          >
            <FileArchive className="w-4 h-4" />
            <span>{isExportingZip ? '正在打包 ZIP...' : '下载全案高清 ZIP 包'}</span>
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Modal Content Viewport */}
      <div className="flex-1 overflow-y-auto p-8 flex justify-center">
        {viewMode === 'vertical' ? (
          /* Vertical Long Flow: sequentially stacks the 9 posters without creating a giant canvas */
          <div className="w-full max-w-xl space-y-4 flex flex-col items-center">
            {screens.map((screen) => {
              const comp = compositions[screen.screenIndex];
              const imgUrl = comp?.imageLayers?.[0]?.imageUrl || screen.sourceImageUrl;

              return (
                <div
                  key={screen.screenIndex}
                  className="relative w-full aspect-[3/4] bg-[#F7F4EF] rounded-xl overflow-hidden shadow-2xl border border-stone-800 group"
                >
                  {/* Poster Image */}
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={screen.screenTitle}
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-400 font-mono text-sm">
                      第 {screen.screenIndex} 屏待生成
                    </div>
                  )}

                  {/* Text Overlay Preview */}
                  <div className="absolute inset-0 p-6 flex flex-col justify-between pointer-events-none">
                    <div className="text-center">
                      <p className="text-[10px] text-amber-800 font-semibold tracking-wide">
                        MANWAH 敏华家居
                      </p>
                      <h4 className="text-base font-bold text-stone-900 mt-1">{screen.headline}</h4>
                      <p className="text-xs text-stone-700 mt-0.5">{screen.subheadline}</p>
                    </div>
                    {screen.body && (
                      <div className="bg-stone-900/60 backdrop-blur-sm p-3 rounded-lg text-[11px] text-stone-200">
                        {screen.body}
                      </div>
                    )}
                  </div>

                  {/* Action overlay on hover */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-3">
                    <button
                      onClick={() => downloadSinglePosterJpeg(comp)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-xs shadow-lg transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>下载单张 (2100×2800)</span>
                    </button>
                  </div>

                  {/* Badge */}
                  <div className="absolute top-3 left-3 bg-black/75 backdrop-blur-sm text-stone-300 text-xs font-mono px-2 py-1 rounded">
                    0{screen.screenIndex} · {screen.screenTitle}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* 3x3 Grid View */
          <div className="w-full max-w-6xl grid grid-cols-3 gap-6">
            {screens.map((screen) => {
              const comp = compositions[screen.screenIndex];
              const imgUrl = comp?.imageLayers?.[0]?.imageUrl || screen.sourceImageUrl;

              return (
                <div
                  key={screen.screenIndex}
                  className="relative w-full aspect-[3/4] bg-[#F7F4EF] rounded-xl overflow-hidden shadow-2xl border border-stone-800 group"
                >
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={screen.screenTitle}
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-400 font-mono text-sm">
                      第 {screen.screenIndex} 屏待生成
                    </div>
                  )}

                  <div className="absolute inset-0 p-4 flex flex-col justify-between pointer-events-none">
                    <div className="text-center">
                      <h4 className="text-xs font-bold text-stone-900 line-clamp-2">{screen.headline}</h4>
                    </div>
                  </div>

                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <button
                      onClick={() => downloadSinglePosterJpeg(comp)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-xs shadow-lg transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>下载单张</span>
                    </button>
                  </div>

                  <div className="absolute top-2 left-2 bg-black/75 backdrop-blur-sm text-stone-300 text-[10px] font-mono px-1.5 py-0.5 rounded">
                    0{screen.screenIndex} · {screen.screenTitle}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
