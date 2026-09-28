// src/components/poster-studio/PosterCanvas.tsx
import React, { useRef, useState, useEffect } from 'react';
import { POSTER_SPEC } from '../../config/posterSpec';
import {
  PosterCompositionSnapshot,
  PosterImageLayer,
  PosterTextLayer,
  DecorationLayer
} from '../../types/posterTemplate';
import { FloatingContextToolbar } from './FloatingContextToolbar';
import { Image as ImageIcon, Sparkles, Upload } from 'lucide-react';

interface PosterCanvasProps {
  composition: PosterCompositionSnapshot;
  onUpdateComposition: (updated: PosterCompositionSnapshot) => void;
  onReplaceImagePrompt?: () => void;
  onAiRewriteText?: (layerId: string) => void;
}

export const PosterCanvas: React.FC<PosterCanvasProps> = ({
  composition,
  onUpdateComposition,
  onReplaceImagePrompt,
  onAiRewriteText
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(0.25);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    layerId: string;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    layerType: 'text' | 'image';
  } | null>(null);

  const canvasW = composition.width || POSTER_SPEC.width;
  const canvasH = composition.height || POSTER_SPEC.height;

  // ResizeObserver to calculate scale responsive to container
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const availableW = Math.max(300, width - 40);
        const availableH = Math.max(400, height - 40);
        const scaleW = availableW / canvasW;
        const scaleH = availableH / canvasH;
        setScale(Math.min(scaleW, scaleH, 0.5));
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [canvasW, canvasH]);

  const selectedImageLayer = composition.imageLayers.find((l) => l.id === selectedLayerId);
  const selectedTextLayer = composition.textLayers.find((l) => l.id === selectedLayerId);

  // Mouse Drag Handler Effect
  useEffect(() => {
    if (!dragState || !dragState.isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = Math.round((e.clientX - dragState.startX) / scale);
      const deltaY = Math.round((e.clientY - dragState.startY) / scale);

      const newX = dragState.initialX + deltaX;
      const newY = dragState.initialY + deltaY;

      if (dragState.layerType === 'text') {
        handleUpdateText(dragState.layerId, { x: newX, y: newY });
      } else if (dragState.layerType === 'image') {
        handleUpdateImage(dragState.layerId, { frameX: newX, frameY: newY });
      }
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, scale]);

  // Keyboard Nudge Effect (Arrow Keys: 2px, Shift+Arrow: 10px)
  useEffect(() => {
    if (!selectedLayerId || editingTextId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 2;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;

        if (selectedTextLayer) {
          handleUpdateText(selectedTextLayer.id, {
            x: selectedTextLayer.x + dx,
            y: selectedTextLayer.y + dy
          });
        } else if (selectedImageLayer) {
          handleUpdateImage(selectedImageLayer.id, {
            frameX: selectedImageLayer.frameX + dx,
            frameY: selectedImageLayer.frameY + dy
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLayerId, editingTextId, selectedTextLayer, selectedImageLayer]);

  const handleLayerMouseDown = (
    e: React.MouseEvent,
    layerId: string,
    initialX: number,
    initialY: number,
    layerType: 'text' | 'image'
  ) => {
    if (editingTextId === layerId) return;
    e.stopPropagation();
    setSelectedLayerId(layerId);
    setDragState({
      isDragging: true,
      layerId,
      startX: e.clientX,
      startY: e.clientY,
      initialX,
      initialY,
      layerType
    });
  };

  const selectedType: 'image' | 'text' | null = selectedImageLayer
    ? 'image'
    : selectedTextLayer
    ? 'text'
    : null;

  const handleUpdateText = (layerId: string, updates: Partial<PosterTextLayer>) => {
    const updatedTexts = composition.textLayers.map((l) =>
      l.id === layerId ? { ...l, ...updates } : l
    );
    onUpdateComposition({ ...composition, textLayers: updatedTexts });
  };

  const handleUpdateImage = (layerId: string, updates: Partial<PosterImageLayer>) => {
    const updatedImages = composition.imageLayers.map((l) =>
      l.id === layerId ? { ...l, ...updates } : l
    );
    onUpdateComposition({ ...composition, imageLayers: updatedImages });
  };

  const handleDeleteSelected = () => {
    if (selectedImageLayer) {
      onUpdateComposition({
        ...composition,
        imageLayers: composition.imageLayers.filter((l) => l.id !== selectedLayerId)
      });
      setSelectedLayerId(null);
    } else if (selectedTextLayer) {
      onUpdateComposition({
        ...composition,
        textLayers: composition.textLayers.filter((l) => l.id !== selectedLayerId)
      });
      setSelectedLayerId(null);
    }
  };

  const handleBringForward = () => {
    if (selectedImageLayer) {
      const idx = composition.imageLayers.findIndex((l) => l.id === selectedLayerId);
      if (idx < composition.imageLayers.length - 1) {
        const arr = [...composition.imageLayers];
        const temp = arr[idx];
        arr[idx] = arr[idx + 1];
        arr[idx + 1] = temp;
        onUpdateComposition({ ...composition, imageLayers: arr });
      }
    }
  };

  const handleSendBackward = () => {
    if (selectedImageLayer) {
      const idx = composition.imageLayers.findIndex((l) => l.id === selectedLayerId);
      if (idx > 0) {
        const arr = [...composition.imageLayers];
        const temp = arr[idx];
        arr[idx] = arr[idx - 1];
        arr[idx - 1] = temp;
        onUpdateComposition({ ...composition, imageLayers: arr });
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center p-6 bg-stone-900/60 overflow-hidden select-none"
      onClick={() => {
        setSelectedLayerId(null);
        setEditingTextId(null);
      }}
    >
      {/* Floating Toolbar */}
      <FloatingContextToolbar
        selectedType={selectedType}
        selectedTextLayer={selectedTextLayer}
        selectedImageLayer={selectedImageLayer}
        onUpdateTextLayer={(u) => selectedTextLayer && handleUpdateText(selectedTextLayer.id, u)}
        onUpdateImageLayer={(u) => selectedImageLayer && handleUpdateImage(selectedImageLayer.id, u)}
        onDeleteSelected={handleDeleteSelected}
        onAiRewriteText={() => selectedTextLayer && onAiRewriteText?.(selectedTextLayer.id)}
        onReplaceImage={onReplaceImagePrompt}
        onBringForward={handleBringForward}
        onSendBackward={handleSendBackward}
      />

      {/* Scaled Poster Viewport (Dynamic Aspect Ratio Coordinate System) */}
      <div
        id="poster-canvas-viewport"
        className="relative bg-[#F7F4EF] shadow-2xl transition-transform duration-75 origin-center overflow-hidden border border-stone-800"
        style={{
          width: `${canvasW}px`,
          height: `${canvasH}px`,
          transform: `scale(${scale})`,
          flexShrink: 0
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Image Layers */}
        {composition.imageLayers.map((layer) => {
          const isSelected = selectedLayerId === layer.id;
          const focalXPercent = ((layer.focalPoint?.x ?? 0.5) * 100).toFixed(1);
          const focalYPercent = ((layer.focalPoint?.y ?? 0.5) * 100).toFixed(1);

          return (
            <div
              key={layer.id}
              onMouseDown={(e) => handleLayerMouseDown(e, layer.id, layer.frameX, layer.frameY, 'image')}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedLayerId(layer.id);
                setEditingTextId(null);
              }}
              className={`absolute transition-shadow ${
                isSelected ? 'ring-8 ring-amber-500 ring-offset-4 ring-offset-stone-900 cursor-move z-20' : 'cursor-pointer hover:ring-4 hover:ring-amber-300/60'
              }`}
              style={{
                left: `${layer.frameX}px`,
                top: `${layer.frameY}px`,
                width: `${layer.frameWidth}px`,
                height: `${layer.frameHeight}px`,
                backgroundColor: layer.backgroundColor || '#F7F4EF',
                zIndex: layer.zIndex || 1
              }}
            >
              {isSelected && (
                <div className="absolute -top-10 left-0 bg-amber-600 text-white px-3 py-1 rounded-full text-xs font-mono font-bold shadow-lg pointer-events-none z-30 flex items-center gap-1.5">
                  <span>图片图层</span>
                  <span className="opacity-80">({layer.frameX}px, {layer.frameY}px)</span>
                </div>
              )}
              {layer.imageUrl ? (
                <img
                  src={layer.imageUrl}
                  alt="Poster Visual"
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                  className="w-full h-full pointer-events-none"
                  style={{
                    objectFit: layer.fitMode === 'contain' ? 'contain' : 'cover',
                    objectPosition: `${focalXPercent}% ${focalYPercent}%`
                  }}
                />
              ) : (
                <div
                  onClick={onReplaceImagePrompt}
                  className="w-full h-full flex flex-col items-center justify-center bg-stone-200/80 border-4 border-dashed border-stone-400/80 rounded-2xl text-stone-600 gap-6 cursor-pointer hover:bg-stone-200 transition"
                >
                  <div className="w-32 h-32 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-700">
                    <ImageIcon className="w-16 h-16" />
                  </div>
                  <div className="text-center">
                    <p className="text-4xl font-bold text-stone-800">点击生成或上传此屏画面</p>
                    <p className="text-2xl text-stone-500 mt-2">支持 AI 生成或本地上传高清实拍图</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* 2. Decoration Layers (Gradients / Shapes) */}
        {composition.decorationLayers?.map((dec) => {
          if (dec.type === 'shape') {
            return (
              <div
                key={dec.id}
                className="absolute pointer-events-none"
                style={{
                  left: `${dec.x}px`,
                  top: `${dec.y}px`,
                  width: `${dec.width}px`,
                  height: `${dec.height}px`,
                  backgroundColor: (dec.props?.color as string) || '#F7F4EF',
                  borderRadius: `${(dec.props?.radius as number) || 0}px`,
                  zIndex: dec.zIndex || 5
                }}
              />
            );
          }
          if (dec.type === 'gradient') {
            const from = (dec.props?.from as string) || 'transparent';
            const to = (dec.props?.to as string) || '#F7F4EF';
            return (
              <div
                key={dec.id}
                className="absolute pointer-events-none"
                style={{
                  left: `${dec.x}px`,
                  top: `${dec.y}px`,
                  width: `${dec.width}px`,
                  height: `${dec.height}px`,
                  background: `linear-gradient(to bottom, ${from}, ${to})`,
                  zIndex: dec.zIndex || 5
                }}
              />
            );
          }
          return null;
        })}

        {/* 3. Text Layers */}
        {composition.textLayers.map((textLayer) => {
          const isSelected = selectedLayerId === textLayer.id;
          const isEditing = editingTextId === textLayer.id;

          return (
            <div
              key={textLayer.id}
              onMouseDown={(e) => handleLayerMouseDown(e, textLayer.id, textLayer.x, textLayer.y, 'text')}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedLayerId(textLayer.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setSelectedLayerId(textLayer.id);
                setEditingTextId(textLayer.id);
              }}
              className={`absolute transition-all rounded-lg ${
                isSelected
                  ? 'ring-4 ring-amber-500 bg-amber-500/10 cursor-move'
                  : 'cursor-pointer hover:ring-2 hover:ring-amber-300/60'
              }`}
              style={{
                left: `${textLayer.x}px`,
                top: `${textLayer.y}px`,
                width: `${textLayer.width}px`,
                minHeight: `${textLayer.height}px`,
                zIndex: textLayer.zIndex || 10,
                padding: '8px'
              }}
            >
              {isSelected && !isEditing && (
                <div className="absolute -top-9 left-0 bg-stone-900/90 text-amber-400 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold shadow-md pointer-events-none z-30 flex items-center gap-1 border border-stone-700">
                  <span>可拖拽移动</span>
                  <span className="text-stone-300">({textLayer.x}px, {textLayer.y}px)</span>
                </div>
              )}
              {isEditing ? (
                <textarea
                  autoFocus
                  value={textLayer.text}
                  onChange={(e) => handleUpdateText(textLayer.id, { text: e.target.value })}
                  onBlur={() => setEditingTextId(null)}
                  className="w-full bg-white/95 text-stone-900 border-2 border-amber-500 rounded p-2 outline-none resize-none shadow-lg"
                  style={{
                    fontSize: `${textLayer.fontSize}px`,
                    fontWeight: textLayer.fontWeight,
                    textAlign: textLayer.textAlign,
                    lineHeight: 1.35
                  }}
                  rows={textLayer.text.split('\n').length || 2}
                />
              ) : (
                <div
                  style={{
                    fontSize: `${textLayer.fontSize}px`,
                    fontWeight: textLayer.fontWeight,
                    color: textLayer.color,
                    textAlign: textLayer.textAlign,
                    lineHeight: 1.35,
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {textLayer.text || '输入文案...'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
