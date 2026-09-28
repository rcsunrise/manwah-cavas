// src/components/creative-canvas/DetailLongCanvasEditor.tsx
import React, { useState } from 'react';
import { Layers, ZoomIn, ZoomOut, RotateCcw, CheckCircle2, Image as ImageIcon, Grid3X3, StretchVertical, Download } from 'lucide-react';
import { POSTER_SPEC, NINE_POSTERS_DEFAULT } from '../../config/posterSpec';

export interface PosterSpec {
  screenId: string;
  sceneKey: string;
  name: string;
  role: string;
  posterIndex: number;
}

export const NINE_SCREENS: PosterSpec[] = NINE_POSTERS_DEFAULT.map(p => ({
  screenId: `screen-${String(p.posterIndex).padStart(2, '0')}`,
  sceneKey: p.sceneKey,
  name: p.title,
  role: p.sceneRole,
  posterIndex: p.posterIndex
}));

interface DetailLongCanvasEditorProps {
  canvasId: string;
  longImageUrl?: string;
  posters?: Array<{ sceneKey: string; imageUrl: string; posterIndex: number }>;
  onOpenExportPanel?: () => void;
}

export const DetailLongCanvasEditor: React.FC<DetailLongCanvasEditorProps> = ({
  canvasId,
  posters = [],
  onOpenExportPanel
}) => {
  const [zoom, setZoom] = useState<number>(0.2);
  const [selectedPosterIndex, setSelectedPosterIndex] = useState<number>(1);
  const [layoutView, setLayoutView] = useState<'grid' | 'stack'>('grid');

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 rounded-xl overflow-hidden border border-slate-800">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <Layers className="w-5 h-5 text-indigo-400" />
          <span className="font-semibold text-sm text-slate-200">九屏独立海报总览 (9 张 2100×2800)</span>
          <span className="text-xs px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono">
            {POSTER_SPEC.width} × {POSTER_SPEC.height} px (3:4)
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {/* View toggle */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 mr-2">
            <button
              onClick={() => setLayoutView('grid')}
              className={`px-2 py-1 rounded text-xs flex items-center space-x-1 ${
                layoutView === 'grid' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="九宫格排列"
            >
              <Grid3X3 className="w-3.5 h-3.5" />
              <span>九宫格</span>
            </button>
            <button
              onClick={() => setLayoutView('stack')}
              className={`px-2 py-1 rounded text-xs flex items-center space-x-1 ${
                layoutView === 'stack' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="瀑布纵向排列"
            >
              <StretchVertical className="w-3.5 h-3.5" />
              <span>纵向排列</span>
            </button>
          </div>

          <button
            onClick={() => setZoom(prev => Math.max(0.05, prev - 0.05))}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
            title="缩小"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-slate-400 min-w-[3rem] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(prev => Math.min(0.5, prev + 0.05))}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
            title="放大"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(0.2)}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
            title="重置缩放"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {onOpenExportPanel && (
            <button
              onClick={onOpenExportPanel}
              className="ml-3 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition flex items-center space-x-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>批量固化导出 (ZIP)</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Navigator Bar */}
        <div className="w-64 border-r border-slate-800 bg-slate-950/50 p-3 space-y-1.5 overflow-y-auto">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">9 屏导航 Navigator</div>
          {NINE_SCREENS.map((s) => {
            const isSelected = selectedPosterIndex === s.posterIndex;
            return (
              <button
                key={s.sceneKey}
                onClick={() => setSelectedPosterIndex(s.posterIndex)}
                className={`w-full text-left p-2.5 rounded-lg transition text-xs border ${
                  isSelected
                    ? 'bg-indigo-950/80 border-indigo-600 text-indigo-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium font-mono text-indigo-400">0{s.posterIndex}. {s.sceneKey}</span>
                  <span className="text-[10px] font-mono text-slate-500">2100×2800</span>
                </div>
                <div className="font-semibold text-slate-200 truncate">{s.name}</div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">{s.role}</div>
              </button>
            );
          })}
        </div>

        {/* Center Preview Canvas */}
        <div className="flex-1 overflow-auto p-6 bg-slate-950 flex justify-center items-start">
          {layoutView === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl">
              {NINE_SCREENS.map((s) => {
                const posterItem = posters.find(p => p.posterIndex === s.posterIndex || p.sceneKey === s.sceneKey);
                const isSelected = selectedPosterIndex === s.posterIndex;
                const posterW = POSTER_SPEC.width * zoom;
                const posterH = POSTER_SPEC.height * zoom;

                return (
                  <div
                    key={s.sceneKey}
                    onClick={() => setSelectedPosterIndex(s.posterIndex)}
                    className={`relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer bg-stone-900 ${
                      isSelected
                        ? 'border-indigo-500 shadow-xl shadow-indigo-950/50'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                    style={{ width: `${posterW}px`, height: `${posterH}px` }}
                  >
                    {posterItem?.imageUrl ? (
                      <img
                        src={posterItem.imageUrl}
                        alt={`Poster 0${s.posterIndex}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col justify-between p-4 bg-gradient-to-b from-stone-900 to-stone-950">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-mono text-indigo-400 font-bold">0{s.posterIndex}</span>
                          <span className="text-[10px] text-stone-500 font-mono">2100×2800</span>
                        </div>
                        <div className="text-center py-4">
                          <ImageIcon className="w-8 h-8 mx-auto text-stone-600 mb-2" />
                          <div className="font-medium text-stone-300 text-sm">{s.name}</div>
                          <div className="text-xs text-stone-500 mt-1">{s.sceneKey}</div>
                        </div>
                        <div className="text-[10px] text-center text-stone-600 font-mono">
                          标准海报规格 3:4
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col space-y-6 items-center">
              {NINE_SCREENS.map((s) => {
                const posterItem = posters.find(p => p.posterIndex === s.posterIndex || p.sceneKey === s.sceneKey);
                const isSelected = selectedPosterIndex === s.posterIndex;
                const posterW = POSTER_SPEC.width * zoom;
                const posterH = POSTER_SPEC.height * zoom;

                return (
                  <div
                    key={s.sceneKey}
                    onClick={() => setSelectedPosterIndex(s.posterIndex)}
                    className={`relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer bg-stone-900 ${
                      isSelected
                        ? 'border-indigo-500 shadow-xl shadow-indigo-950/50'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                    style={{ width: `${posterW}px`, height: `${posterH}px` }}
                  >
                    {posterItem?.imageUrl ? (
                      <img
                        src={posterItem.imageUrl}
                        alt={`Poster 0${s.posterIndex}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col justify-between p-4 bg-gradient-to-b from-stone-900 to-stone-950">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-mono text-indigo-400 font-bold">0{s.posterIndex}. {s.sceneKey}</span>
                          <span className="text-[10px] text-stone-500 font-mono">2100×2800</span>
                        </div>
                        <div className="text-center py-4">
                          <ImageIcon className="w-8 h-8 mx-auto text-stone-600 mb-2" />
                          <div className="font-medium text-stone-300 text-sm">{s.name}</div>
                        </div>
                        <div className="text-[10px] text-center text-stone-600 font-mono">
                          标准海报规格 3:4
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
