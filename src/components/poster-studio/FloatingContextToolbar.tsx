// src/components/poster-studio/FloatingContextToolbar.tsx
import React from 'react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Sparkles,
  Trash2,
  Maximize2,
  Minimize2,
  ArrowUp,
  ArrowDown,
  Crop,
  Palette,
  Type,
  Crosshair,
  Image as ImageIcon
} from 'lucide-react';
import { PosterTextLayer, PosterImageLayer } from '../../types/posterTemplate';

interface FloatingContextToolbarProps {
  selectedType: 'image' | 'text' | 'multi' | null;
  selectedTextLayer?: PosterTextLayer;
  selectedImageLayer?: PosterImageLayer;
  onUpdateTextLayer?: (updates: Partial<PosterTextLayer>) => void;
  onUpdateImageLayer?: (updates: Partial<PosterImageLayer>) => void;
  onDeleteSelected?: () => void;
  onAiRewriteText?: () => void;
  onReplaceImage?: () => void;
  onBringForward?: () => void;
  onSendBackward?: () => void;
}

export const FloatingContextToolbar: React.FC<FloatingContextToolbarProps> = ({
  selectedType,
  selectedTextLayer,
  selectedImageLayer,
  onUpdateTextLayer,
  onUpdateImageLayer,
  onDeleteSelected,
  onAiRewriteText,
  onReplaceImage,
  onBringForward,
  onSendBackward
}) => {
  if (!selectedType) return null;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-stone-900/90 backdrop-blur-md text-white px-3 py-1.5 rounded-full shadow-2xl border border-stone-700/80 flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150 select-none text-xs">
      {/* IMAGE CONTROLS */}
      {selectedType === 'image' && selectedImageLayer && (
        <>
          <button
            onClick={onReplaceImage}
            className="flex items-center gap-1 px-2.5 py-1 hover:bg-stone-800 rounded-full transition text-amber-300 font-medium"
            title="更换图片"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>更换图片</span>
          </button>

          <div className="w-[1px] h-4 bg-stone-700 mx-0.5" />

          {/* Fit Mode Toggle */}
          <button
            onClick={() =>
              onUpdateImageLayer?.({
                fitMode: selectedImageLayer.fitMode === 'cover' ? 'contain' : 'cover'
              })
            }
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full transition ${
              selectedImageLayer.fitMode === 'contain'
                ? 'bg-amber-600 text-white'
                : 'hover:bg-stone-800 text-stone-300'
            }`}
            title="切换填满 (Cover) / 完整留白 (Contain)"
          >
            <Crop className="w-3.5 h-3.5" />
            <span>{selectedImageLayer.fitMode === 'contain' ? '完整 (Contain)' : '填满 (Cover)'}</span>
          </button>

          {/* Focal Point Presets */}
          <div className="flex items-center bg-stone-800/80 rounded-full px-1 py-0.5">
            <button
              onClick={() => onUpdateImageLayer?.({ focalPoint: { x: 0.5, y: 0.2 } })}
              className={`p-1 hover:text-amber-300 rounded ${
                selectedImageLayer.focalPoint.y < 0.33 ? 'text-amber-400 font-bold' : 'text-stone-400'
              }`}
              title="焦点靠上"
            >
              <ArrowUp className="w-3 h-3" />
            </button>
            <button
              onClick={() => onUpdateImageLayer?.({ focalPoint: { x: 0.5, y: 0.5 } })}
              className={`p-1 hover:text-amber-300 rounded ${
                selectedImageLayer.focalPoint.y >= 0.33 && selectedImageLayer.focalPoint.y <= 0.67
                  ? 'text-amber-400 font-bold'
                  : 'text-stone-400'
              }`}
              title="主体居中"
            >
              <Crosshair className="w-3 h-3" />
            </button>
            <button
              onClick={() => onUpdateImageLayer?.({ focalPoint: { x: 0.5, y: 0.8 } })}
              className={`p-1 hover:text-amber-300 rounded ${
                selectedImageLayer.focalPoint.y > 0.67 ? 'text-amber-400 font-bold' : 'text-stone-400'
              }`}
              title="焦点靠下"
            >
              <ArrowDown className="w-3 h-3" />
            </button>
          </div>

          <div className="w-[1px] h-4 bg-stone-700 mx-0.5" />

          {/* Layer order */}
          <button
            onClick={onBringForward}
            className="p-1.5 hover:bg-stone-800 rounded-full text-stone-300 hover:text-white"
            title="图层向前"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onSendBackward}
            className="p-1.5 hover:bg-stone-800 rounded-full text-stone-300 hover:text-white"
            title="图层向后"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        </>
      )}

      {/* TEXT CONTROLS */}
      {selectedType === 'text' && selectedTextLayer && (
        <>
          {/* AI Rewrite */}
          <button
            onClick={onAiRewriteText}
            className="flex items-center gap-1 px-2.5 py-1 bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 rounded-full transition font-medium"
            title="AI 润色文案"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI 改写</span>
          </button>

          <div className="w-[1px] h-4 bg-stone-700 mx-0.5" />

          {/* Font Size */}
          <div className="flex items-center gap-1 px-1 text-stone-300">
            <Type className="w-3.5 h-3.5 text-stone-400" />
            <select
              value={selectedTextLayer.fontSize}
              onChange={(e) => onUpdateTextLayer?.({ fontSize: Number(e.target.value) })}
              className="bg-stone-800 text-white rounded px-1.5 py-0.5 text-xs outline-none border border-stone-700"
            >
              <option value="28">28 px</option>
              <option value="32">32 px</option>
              <option value="36">36 px</option>
              <option value="42">42 px</option>
              <option value="48">48 px</option>
              <option value="60">60 px</option>
              <option value="72">72 px</option>
              <option value="84">84 px</option>
              <option value="96">96 px</option>
              <option value="120">120 px</option>
            </select>
          </div>

          {/* Position fine-tuning inputs */}
          <div className="flex items-center gap-1 bg-stone-800/90 rounded-full px-2 py-0.5 text-stone-300">
            <span className="text-[10px] text-stone-400 font-mono font-bold">X</span>
            <input
              type="number"
              value={selectedTextLayer.x}
              onChange={(e) => onUpdateTextLayer?.({ x: Number(e.target.value) })}
              className="w-12 bg-stone-900 text-amber-300 rounded px-1 py-0.5 text-[11px] font-mono text-center border border-stone-700 outline-none"
            />
            <span className="text-[10px] text-stone-400 font-mono font-bold">Y</span>
            <input
              type="number"
              value={selectedTextLayer.y}
              onChange={(e) => onUpdateTextLayer?.({ y: Number(e.target.value) })}
              className="w-12 bg-stone-900 text-amber-300 rounded px-1 py-0.5 text-[11px] font-mono text-center border border-stone-700 outline-none"
            />
          </div>

          {/* Font Weight */}
          <button
            onClick={() =>
              onUpdateTextLayer?.({
                fontWeight: selectedTextLayer.fontWeight >= 700 ? 400 : 800
              })
            }
            className={`p-1.5 rounded-full transition ${
              selectedTextLayer.fontWeight >= 700
                ? 'bg-stone-700 text-amber-300'
                : 'hover:bg-stone-800 text-stone-300'
            }`}
            title="加粗"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>

          {/* Alignment */}
          <div className="flex items-center bg-stone-800/80 rounded-full p-0.5">
            <button
              onClick={() => onUpdateTextLayer?.({ textAlign: 'left' })}
              className={`p-1 rounded ${selectedTextLayer.textAlign === 'left' ? 'bg-stone-700 text-amber-300' : 'text-stone-400'}`}
              title="左对齐"
            >
              <AlignLeft className="w-3 h-3" />
            </button>
            <button
              onClick={() => onUpdateTextLayer?.({ textAlign: 'center' })}
              className={`p-1 rounded ${selectedTextLayer.textAlign === 'center' ? 'bg-stone-700 text-amber-300' : 'text-stone-400'}`}
              title="居中对齐"
            >
              <AlignCenter className="w-3 h-3" />
            </button>
            <button
              onClick={() => onUpdateTextLayer?.({ textAlign: 'right' })}
              className={`p-1 rounded ${selectedTextLayer.textAlign === 'right' ? 'bg-stone-700 text-amber-300' : 'text-stone-400'}`}
              title="右对齐"
            >
              <AlignRight className="w-3 h-3" />
            </button>
          </div>

          {/* Color Presets */}
          <div className="flex items-center gap-1 px-1">
            {['#1A1817', '#9B7347', '#5A5652', '#FFFFFF', '#C23B22'].map((c) => (
              <button
                key={c}
                onClick={() => onUpdateTextLayer?.({ color: c })}
                className={`w-4 h-4 rounded-full border border-stone-600 ${
                  selectedTextLayer.color === c ? 'ring-2 ring-amber-400' : ''
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </>
      )}

      {/* Delete */}
      <div className="w-[1px] h-4 bg-stone-700 mx-0.5" />
      <button
        onClick={onDeleteSelected}
        className="p-1.5 hover:bg-red-950/60 text-stone-400 hover:text-red-400 rounded-full transition"
        title="删除所选图层"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
