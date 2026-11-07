import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * 页面内确认弹框，替代 window.confirm。
 * 原因：在 Claude 桌面端预览窗口等嵌入式浏览器里，window.confirm 不会弹出、直接返回 false，
 * 导致删除 / 清空类按钮“点了没反应”。这里自己渲染一个弹框，返回 Promise<boolean>。
 */
export interface ConfirmDialogOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作（删除/清空/退款）用红色确认按钮，默认 true */
  danger?: boolean;
}

function ConfirmDialogView({
  message,
  options,
  onClose
}: {
  message: string;
  options: ConfirmDialogOptions;
  onClose: (ok: boolean) => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const danger = options.danger !== false;

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onClose(true);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(false);
      }}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-sm rounded-2xl bg-white text-stone-800 shadow-2xl ring-1 ring-black/10 p-5"
      >
        <h2 id="confirm-dialog-title" className="text-sm font-bold mb-2">
          {options.title || '请确认'}
        </h2>
        <p className="text-[13px] leading-relaxed text-stone-600 whitespace-pre-line break-words">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 transition cursor-pointer"
          >
            {options.cancelText || '取消'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onClose(true)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold text-white transition cursor-pointer ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {options.confirmText || (danger ? '确认删除' : '确定')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function confirmDialog(message: string, options: ConfirmDialogOptions = {}): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.setAttribute('data-confirm-dialog', '');
    document.body.appendChild(host);
    const root = createRoot(host);
    let settled = false;
    const close = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
      // 延后卸载，避免在 React 事件处理中同步 unmount 触发警告
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
    };
    root.render(<ConfirmDialogView message={message} options={options} onClose={close} />);
  });
}
