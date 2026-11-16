import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ExternalLink, Minus, Plus, RotateCcw, X } from 'lucide-react';

/**
 * 当前窗口内的大图预览：点图片不再新开页面，而是在页面上铺一层放大查看。
 * 任何地方调用 openImageLightbox(url, title) 即可；页面里挂一次 <ImageLightboxHost />。
 * 滚轮缩放、拖动平移、双击切换 2 倍、Esc / 点背景关闭。
 */
const OPEN_EVENT = 'canvas:open-image-lightbox';

export function openImageLightbox(url: string, title?: string) {
  if (!url) return;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { url, title } }));
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;

export const ImageLightboxHost: React.FC = () => {
  const [item, setItem] = useState<{ url: string; title?: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const close = useCallback(() => {
    setItem(null);
    reset();
  }, [reset]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.url) {
        setItem({ url: d.url, title: d.title });
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === '+' || e.key === '=') setZoom(z => Math.min(MAX_ZOOM, z * 1.25));
      if (e.key === '-') setZoom(z => Math.max(MIN_ZOOM, z / 1.25));
      if (e.key === '0') reset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, close, reset]);

  if (!item) return null;

  const download = async () => {
    const name = `${(item.title || 'image').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'image'}.png`;
    try {
      const blob = await (await fetch(item.url)).blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch {
      window.open(item.url, '_blank');
    }
  };

  const btn = 'p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer';

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex flex-col select-none"
      onClick={close}
      onWheel={e => {
        e.stopPropagation();
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)));
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white/90" onClick={e => e.stopPropagation()}>
        <span className="text-sm font-bold truncate">{item.title || '预览'}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" className={btn} title="缩小（-）" onClick={() => setZoom(z => Math.max(MIN_ZOOM, z / 1.25))}>
            <Minus className="w-4 h-4" />
          </button>
          <span className="w-12 text-center text-xs font-mono tabular-nums">{Math.round(zoom * 100)}%</span>
          <button type="button" className={btn} title="放大（+）" onClick={() => setZoom(z => Math.min(MAX_ZOOM, z * 1.25))}>
            <Plus className="w-4 h-4" />
          </button>
          <button type="button" className={btn} title="还原（0）" onClick={reset}>
            <RotateCcw className="w-4 h-4" />
          </button>
          <button type="button" className={btn} title="下载" onClick={download}>
            <Download className="w-4 h-4" />
          </button>
          <button type="button" className={btn} title="新标签页打开原图" onClick={() => window.open(item.url, '_blank')}>
            <ExternalLink className="w-4 h-4" />
          </button>
          <button type="button" className={btn} title="关闭（Esc）" onClick={close}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden px-4 pb-4">
        <img
          src={item.url}
          alt={item.title || ''}
          draggable={false}
          onClick={e => e.stopPropagation()}
          onDoubleClick={e => {
            e.stopPropagation();
            if (zoom > 1) reset();
            else setZoom(2);
          }}
          onPointerDown={e => {
            e.stopPropagation();
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
          }}
          onPointerMove={e => {
            if (!drag.current) return;
            setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: drag.current ? 'none' : 'transform 120ms ease-out',
            cursor: drag.current ? 'grabbing' : zoom > 1 ? 'grab' : 'zoom-in'
          }}
        />
      </div>
      <div className="pb-3 text-center text-[11px] text-white/50">滚轮缩放 · 拖动平移 · 双击放大/还原 · Esc 关闭</div>
    </div>,
    document.body
  );
};
