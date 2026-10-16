// src/features/space-studio/components/SceneProductAnnotationOverlay.tsx
// MANWAH Space Studio｜全案母版 1~14 多产品交互打标图层与镜头视锥联动 V3.5
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Tag,
  CheckCircle2,
  Box,
  Layers,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Eye,
  Info,
  SlidersHorizontal,
  X
} from 'lucide-react';
import { DisaggregatedProductItem } from '../../../types/spaceStudio';

export interface SceneProductAnnotationOverlayProps {
  annotations: DisaggregatedProductItem[];
  activeShotCode: string; // e.g. 'A00', 'A01', 'A02', 'A03'...
  selectedAnnotationId: string | null;
  onSelectAnnotation: (item: DisaggregatedProductItem | null) => void;
  onUpdateAnnotationPosition?: (
    id: string,
    newBoundingBox: { ymin: number; xmin: number; ymax: number; xmax: number }
  ) => void;
  onHideAnnotation?: (id: string) => void;
  onClose?: () => void;
  onLocateInDrawer?: (productId: string) => void;
  visible?: boolean;
}

/**
 * 镜头视锥白名单映射规则：
 * 判定各镜头视角下，哪些产品在当前视锥核心焦点内 (Focused)、哪些在背景背景中 (Context)、哪些在视锥外 (Excluded)
 */
export function getProductFrustumStatus(
  shotCode: string,
  annotationIndex: number, // 1-based (1..14)
  role: string
): 'focused' | 'context' | 'excluded' {
  // A00 / A01: 空间主大全景，收录所有产品
  if (shotCode === 'A00' || shotCode === 'A01') {
    return 'focused';
  }

  // A02: 主位舒享生活 (主沙发 ②, 茶几 ⑤, 地毯 ④, 抱枕 ⑬⑭)
  if (shotCode === 'A02') {
    if (annotationIndex === 2 || annotationIndex === 5) return 'focused';
    if (annotationIndex === 4 || annotationIndex === 13 || annotationIndex === 14) return 'context';
    return 'excluded';
  }

  // A03: 单椅功能位 (单椅 ③ 核心聚焦, 地毯 ④ 背景)
  if (shotCode === 'A03') {
    if (annotationIndex === 3) return 'focused';
    if (annotationIndex === 4 || annotationIndex === 2) return 'context';
    return 'excluded';
  }

  // A04: 单椅亲子陪伴景 (单椅 ③ 核心)
  if (shotCode === 'A04') {
    if (annotationIndex === 3) return 'focused';
    if (annotationIndex === 4 || annotationIndex === 2) return 'context';
    return 'excluded';
  }

  // A05: 地毯松弛休闲景 (地毯 ④, 主沙发 ②, 茶几 ⑤)
  if (shotCode === 'A05') {
    if (annotationIndex === 4 || annotationIndex === 2 || annotationIndex === 5) return 'focused';
    if (annotationIndex === 1 || annotationIndex === 3) return 'context';
    return 'excluded';
  }

  // A06: 零靠墙功能展开景 (主沙发 ② 展开 focused)
  if (shotCode === 'A06') {
    if (annotationIndex === 2) return 'focused';
    if (annotationIndex === 5 || annotationIndex === 4 || annotationIndex === 13) return 'context';
    return 'excluded';
  }

  // A07: 沙发+茶几组群中景 (主沙发 ②, 茶几 ⑤, 双人位 ①, 单椅 ③)
  if (shotCode === 'A07') {
    if (annotationIndex === 2 || annotationIndex === 5 || annotationIndex === 1) return 'focused';
    if (annotationIndex === 3 || annotationIndex === 4 || annotationIndex === 13 || annotationIndex === 14) return 'context';
    return 'excluded';
  }

  // A08: 高定特写 (主沙发面料/抱枕)
  if (shotCode === 'A08') {
    if (annotationIndex === 2 || annotationIndex === 13 || annotationIndex === 14) return 'focused';
    return 'excluded';
  }

  return 'context';
}

export const SceneProductAnnotationOverlay: React.FC<SceneProductAnnotationOverlayProps> = ({
  annotations,
  activeShotCode,
  selectedAnnotationId,
  onSelectAnnotation,
  onUpdateAnnotationPosition,
  onHideAnnotation,
  onClose,
  onLocateInDrawer,
  visible = true
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const dragStartRef = React.useRef<{
    id: string;
    startX: number;
    startY: number;
    initXmin: number;
    initYmin: number;
    initXmax: number;
    initYmax: number;
    hasMoved: boolean;
  } | null>(null);

  // 标点拖拽位移监听：支持用户直接拖拽标点到家具真实像素位置
  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const dxPx = e.clientX - dragStartRef.current.startX;
      const dyPx = e.clientY - dragStartRef.current.startY;
      if (Math.hypot(dxPx, dyPx) > 3) {
        dragStartRef.current.hasMoved = true;
      }

      if (!dragStartRef.current.hasMoved) return;

      const dxPct = (dxPx / rect.width) * 100;
      const dyPct = (dyPx / rect.height) * 100;

      const widthPct = dragStartRef.current.initXmax - dragStartRef.current.initXmin;
      const heightPct = dragStartRef.current.initYmax - dragStartRef.current.initYmin;

      let newXmin = Math.max(1, Math.min(99 - widthPct, dragStartRef.current.initXmin + dxPct));
      let newYmin = Math.max(1, Math.min(99 - heightPct, dragStartRef.current.initYmin + dyPct));
      let newXmax = newXmin + widthPct;
      let newYmax = newYmin + heightPct;

      onUpdateAnnotationPosition?.(dragStartRef.current.id, {
        xmin: Math.round(newXmin * 10) / 10,
        ymin: Math.round(newYmin * 10) / 10,
        xmax: Math.round(newXmax * 10) / 10,
        ymax: Math.round(newYmax * 10) / 10
      });
    };

    const handleMouseUp = () => {
      if (dragStartRef.current && !dragStartRef.current.hasMoved) {
        // 纯点击未移动：激活卡片或取消
        const clickedItem = annotations.find((a) => a.id === dragStartRef.current?.id);
        if (clickedItem) {
          if (selectedAnnotationId === clickedItem.id) {
            handleCloseCard();
          } else {
            onSelectAnnotation(clickedItem);
          }
        }
      }
      dragStartRef.current = null;
      setDraggingId(null);
    };

    if (draggingId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingId, annotations, selectedAnnotationId, onSelectAnnotation, onUpdateAnnotationPosition]);

  if (!visible || !annotations || annotations.length === 0) {
    return null;
  }

  const activeItem = annotations.find(
    (a) => a.id === (hoveredId || selectedAnnotationId)
  );

  const handleCloseCard = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setHoveredId(null);
    onClose?.();
    onSelectAnnotation(null);
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-20 overflow-hidden select-none"
    >
      {/* 遍历渲染 1~14 号标记点与边框 */}
      {annotations.map((item, index) => {
        const itemNumber = index + 1; // 1-based index (1..14)
        const isSelected = selectedAnnotationId === item.id;
        const isHovered = hoveredId === item.id;
        const isThisDragging = draggingId === item.id;
        const frustumStatus = getProductFrustumStatus(activeShotCode, itemNumber, item.role);

        const { ymin, xmin, ymax, xmax } = item.boundingBox;
        const widthPct = Math.max(2, xmax - xmin);
        const heightPct = Math.max(2, ymax - ymin);
        const centerX = xmin + widthPct / 2;
        const centerY = ymin + heightPct / 2;

        // 根据视锥状态计算透明度和视觉强度
        let opacityClass = 'opacity-90 hover:opacity-100';
        let badgeBg = 'bg-rose-600';
        let ringEffect = '';

        if (frustumStatus === 'focused') {
          opacityClass = 'opacity-100 scale-105';
          badgeBg = 'bg-rose-600 shadow-lg shadow-rose-600/50';
          ringEffect = 'ring-2 ring-amber-400 ring-offset-1 ring-offset-black';
        } else if (frustumStatus === 'context') {
          opacityClass = 'opacity-70 hover:opacity-100';
          badgeBg = 'bg-rose-700/80';
        } else if (frustumStatus === 'excluded') {
          // 当前镜头视锥外：淡化呈现，避免干扰
          opacityClass = 'opacity-25 hover:opacity-80';
          badgeBg = 'bg-stone-600/60';
        }

        if (isSelected || isHovered || isThisDragging) {
          opacityClass = 'opacity-100 scale-110';
          badgeBg = 'bg-amber-500 shadow-xl shadow-amber-500/50 text-stone-950';
          ringEffect = 'ring-2 ring-white ring-offset-2 ring-offset-black';
        }

        return (
          <React.Fragment key={item.id}>
            {/* 1. 虚线检测选框 (选框在 Hover / Selected 或 Focused 状态下显现) */}
            {(isSelected || isHovered || isThisDragging || (frustumStatus === 'focused' && activeShotCode !== 'A00')) && (
              <div
                style={{
                  top: `${ymin}%`,
                  left: `${xmin}%`,
                  width: `${widthPct}%`,
                  height: `${heightPct}%`
                }}
                className={`absolute border rounded-md transition-all pointer-events-none ${
                  isSelected || isHovered || isThisDragging
                    ? 'border-amber-400/90 bg-amber-400/10 shadow-xs'
                    : 'border-rose-500/50 border-dashed bg-rose-500/5'
                }`}
              />
            )}

            {/* 2. 圆形编号徽标 (支持直接按住拖拽校准点位) */}
            <div
              style={{
                top: `${centerY}%`,
                left: `${centerX}%`,
                transform: 'translate(-50%, -50%)',
                cursor: isThisDragging ? 'grabbing' : 'grab'
              }}
              className={`absolute pointer-events-auto transition-transform duration-100 ${opacityClass}`}
              onMouseDown={(e) => {
                e.stopPropagation(); // 阻断画布平移拖拽事件
                e.preventDefault();
                setDraggingId(item.id);
                dragStartRef.current = {
                  id: item.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  initXmin: item.boundingBox.xmin,
                  initYmin: item.boundingBox.ymin,
                  initXmax: item.boundingBox.xmax,
                  initYmax: item.boundingBox.ymax,
                  hasMoved: false
                };
              }}
              onMouseEnter={() => {
                if (!draggingId) setHoveredId(item.id);
              }}
              onMouseLeave={() => {
                if (!draggingId) setHoveredId(null);
              }}
              title={`${itemNumber}. ${item.name} (${item.role}) · 按住可自由拖拽微调位置`}
            >
              <div
                className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center font-bold text-[10px] sm:text-xs text-white border border-white/60 transition-transform ${badgeBg} ${ringEffect} active:scale-95`}
              >
                {itemNumber}
              </div>

              {/* 仅在 Focused 镜头时显示脉冲光环 */}
              {frustumStatus === 'focused' && activeShotCode !== 'A00' && !isThisDragging && (
                <span className="absolute -inset-1 rounded-full bg-amber-400/30 animate-ping pointer-events-none" />
              )}
            </div>
          </React.Fragment>
        );
      })}

      {/* 3. 悬停 / 选中产品信息卡片 (浮动卡片展示) */}
      <AnimatePresence>
        {activeItem && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            style={{
              top: `${Math.min(75, Math.max(10, activeItem.boundingBox.ymin))}%`,
              left: `${Math.min(70, Math.max(15, activeItem.boundingBox.xmin + 5))}%`
            }}
            className="absolute pointer-events-auto z-40 max-w-xs bg-stone-900/95 text-stone-100 border border-amber-500/40 rounded-xl shadow-2xl p-3 backdrop-blur-md space-y-2 select-text"
            onClick={(e) => {
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              e.stopPropagation(); // 关键：防止触发父级画布的平移与拖拽
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
          >
            {/* 标头 */}
            <div className="flex items-start justify-between gap-2 border-b border-stone-800 pb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-rose-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  {annotations.findIndex((a) => a.id === activeItem.id) + 1}
                </span>
                <div>
                  <h4 className="font-bold text-xs leading-tight text-white line-clamp-1">
                    {activeItem.name}
                  </h4>
                  <div className="text-[10px] font-mono text-amber-400/90 mt-0.5">
                    {activeItem.sku || 'MW-SERIES'} · {activeItem.role}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseCard}
                onMouseDown={(e) => e.stopPropagation()}
                className="text-stone-400 hover:text-white p-1 rounded-md hover:bg-stone-800 transition cursor-pointer"
                title="关闭信息卡片"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 属性清单 */}
            <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
              <div className="bg-stone-800/80 p-1.5 rounded-lg">
                <span className="text-stone-400 block text-[9px]">物理规格</span>
                <span className="font-semibold text-stone-200">
                  {activeItem.dimensions
                    ? `${activeItem.dimensions.width}×${activeItem.dimensions.depth}mm`
                    : '标准真值'}
                </span>
              </div>
              <div className="bg-stone-800/80 p-1.5 rounded-lg">
                <span className="text-stone-400 block text-[9px]">主材质</span>
                <span className="font-semibold text-stone-200 truncate block">
                  {activeItem.materials?.[0] || '半苯胺牛皮'}
                </span>
              </div>
            </div>

            {/* 当前镜头视锥状态 */}
            <div className="text-[10px] flex items-center justify-between text-stone-300 pt-1">
              <span className="text-stone-400">镜头视锥状态:</span>
              <span
                className={`font-semibold px-1.5 py-0.5 rounded text-[9px] ${
                  getProductFrustumStatus(
                    activeShotCode,
                    annotations.findIndex((a) => a.id === activeItem.id) + 1,
                    activeItem.role
                  ) === 'focused'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                    : getProductFrustumStatus(
                        activeShotCode,
                        annotations.findIndex((a) => a.id === activeItem.id) + 1,
                        activeItem.role
                      ) === 'context'
                    ? 'bg-stone-800 text-stone-300'
                    : 'bg-rose-950/60 text-rose-300 border border-rose-500/30'
                }`}
              >
                {getProductFrustumStatus(
                  activeShotCode,
                  annotations.findIndex((a) => a.id === activeItem.id) + 1,
                  activeItem.role
                ) === 'focused'
                  ? '🎯 核心聚焦'
                  : getProductFrustumStatus(
                      activeShotCode,
                      annotations.findIndex((a) => a.id === activeItem.id) + 1,
                      activeItem.role
                    ) === 'context'
                  ? '👁️ 背景衬托'
                  : '🚫 视锥外已排除'}
              </span>
            </div>

            {/* 拖拽微调提示 */}
            <div className="text-[9px] text-amber-300/80 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-md flex items-center gap-1">
              <span>💡 提示：按住编号徽标可直接拖拽调整在图中的位置</span>
            </div>

            {/* 定位与编辑操作 */}
            <div className="flex items-center gap-1.5 pt-0.5">
              {onLocateInDrawer && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onLocateInDrawer(activeItem.id);
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation(); // 关键：阻断 mousedown，防止触发画布拖拽
                  }}
                  className="flex-1 py-1.5 px-2 bg-amber-500 hover:bg-amber-400 active:scale-98 text-stone-950 font-bold text-[10px] rounded-lg transition flex items-center justify-center gap-1 cursor-pointer shadow-md"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>在左侧面板定位资产</span>
                </button>
              )}
              {onHideAnnotation && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onHideAnnotation(activeItem.id);
                    handleCloseCard();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="py-1.5 px-2 bg-stone-800 hover:bg-rose-950/50 hover:text-rose-300 text-stone-300 text-[10px] rounded-lg transition flex items-center justify-center gap-1 cursor-pointer border border-white/10"
                  title="若画面中无此产品可隐藏此标点"
                >
                  <span>隐藏此标</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

