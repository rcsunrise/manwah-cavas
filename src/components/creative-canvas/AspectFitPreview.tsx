import React from 'react';
import {
  LayoutSlotSpec,
  FitMode,
  NormalizedPoint,
  SafeAreaInsets,
  NormalizedRect
} from '../../types/layoutManifest';
import { computeLayoutTransform } from '../../lib/layoutGeometry';
import { SafeAreaOverlay } from './SafeAreaOverlay';
import { TextLayer } from '../../types/detailCompositionSchema';

interface AspectFitPreviewProps {
  slot: LayoutSlotSpec;
  imageUrl?: string;
  targetWidth?: number;
  interactiveFocal?: boolean;
  showOverlays?: boolean;
  textLayers?: TextLayer[];
  onSlotChange?: (updatedSlot: LayoutSlotSpec) => void;
  className?: string;
}

export const AspectFitPreview: React.FC<AspectFitPreviewProps> = ({
  slot,
  imageUrl,
  targetWidth = 2100,
  interactiveFocal = false,
  showOverlays = true,
  textLayers = [],
  onSlotChange,
  className = ''
}) => {
  const {
    sourceWidth,
    sourceHeight,
    slotHeight,
    fitMode,
    focalPoint,
    safeArea,
    reservedZones,
    subjectBounds,
    backgroundColor
  } = slot;

  // Compute live transform
  const renderTransform = React.useMemo(() => {
    return computeLayoutTransform({
      slotWidth: targetWidth,
      slotHeight,
      sourceWidth,
      sourceHeight,
      fitMode,
      focalPoint,
      subjectBounds,
      reservedZones
    });
  }, [targetWidth, slotHeight, sourceWidth, sourceHeight, fitMode, focalPoint, subjectBounds, reservedZones]);

  const handleFocalPointChange = (pt: NormalizedPoint) => {
    if (!onSlotChange) return;
    onSlotChange({
      ...slot,
      focalPoint: pt
    });
  };

  // Convert transform to CSS % offsets
  const imgStyle: React.CSSProperties = {
    position: 'absolute',
    width: `${(renderTransform.displayWidth / targetWidth) * 100}%`,
    height: `${(renderTransform.displayHeight / slotHeight) * 100}%`,
    left: `${(renderTransform.offsetX / targetWidth) * 100}%`,
    top: `${(renderTransform.offsetY / slotHeight) * 100}%`,
    maxWidth: 'none',
    maxHeight: 'none',
    pointerEvents: 'none'
  };

  return (
    <div
      className={`relative overflow-hidden select-none transition-all ${className}`}
      style={{
        backgroundColor: backgroundColor || '#F7F4EF',
        aspectRatio: `${targetWidth} / ${slotHeight}`
      }}
    >
      {/* 1. Underlying Image Rendered via Computed Transform */}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={slot.sceneKey}
          style={imgStyle}
          className="transition-all duration-100"
          draggable={false}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-stone-400 bg-stone-100/60 p-4 text-center">
          <span className="font-mono text-xs">分镜资产加载中</span>
          <span className="text-[10px] text-stone-400 mt-0.5">
            {slot.sourceWidth} × {slot.sourceHeight} · {slot.sourceAspectRatio}
          </span>
        </div>
      )}

      {/* 2. Text Layers Overlay */}
      {textLayers && textLayers.length > 0 && (
        <div className="absolute inset-0 pointer-events-none z-10">
          {textLayers.map((tl) => {
            const leftPct = (tl.x / targetWidth) * 100;
            const topPct = (tl.y / slotHeight) * 100;
            const widthPct = (tl.width / targetWidth) * 100;
            const heightPct = (tl.height / slotHeight) * 100;

            const containerStyle = (tl as any).containerStyle;

            return (
              <div
                key={tl.id}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  width: `${widthPct}%`,
                  height: `${heightPct}%`,
                  fontFamily: tl.fontFamily || 'PingFang SC',
                  color: tl.color || '#2C2A29',
                  fontWeight: tl.fontWeight || 700,
                  fontSize: `clamp(9px, ${(tl.fontSize / targetWidth) * 100}vw, 36px)`,
                  lineHeight: tl.lineHeight || 1.3,
                  letterSpacing: `${(tl.letterSpacing || 0) / 10}px`,
                  textAlign: tl.textAlign || 'left',
                  display: 'flex',
                  alignItems: tl.verticalAlign === 'middle' ? 'center' : 'flex-start',
                  backgroundColor: containerStyle?.backgroundColor || 'transparent',
                  borderRadius: containerStyle?.borderRadius ? `${containerStyle.borderRadius / 4}px` : undefined,
                  border: containerStyle?.border || undefined,
                  padding: containerStyle?.padding ? `${containerStyle.padding / 4}px` : undefined,
                  boxShadow: containerStyle?.boxShadow || undefined,
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                  opacity: tl.opacity ?? 1,
                  zIndex: tl.zIndex || 10
                }}
              >
                {tl.text}
              </div>
            );
          })}
        </div>
      )}

      {/* 3. Dark Crop Mask for Cover / Smart Crop */}
      {renderTransform.isCropped && showOverlays && (
        <div className="absolute top-1 right-1 bg-black/70 backdrop-blur-sm text-white text-[9px] font-mono px-1.5 py-0.5 rounded pointer-events-none flex items-center gap-1 z-20">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span>受控裁切 ({fitMode})</span>
        </div>
      )}

      {/* 4. Safe Area & Conflict Overlays */}
      {showOverlays && (
        <SafeAreaOverlay
          slotWidth={targetWidth}
          slotHeight={slotHeight}
          safeArea={safeArea}
          reservedZones={reservedZones}
          subjectBounds={subjectBounds}
          renderTransform={renderTransform}
          focalPoint={focalPoint}
          showFocalPoint={interactiveFocal || fitMode === 'cover' || fitMode === 'smart_crop'}
          onFocalPointChange={handleFocalPointChange}
          interactive={interactiveFocal}
        />
      )}
    </div>
  );
};
