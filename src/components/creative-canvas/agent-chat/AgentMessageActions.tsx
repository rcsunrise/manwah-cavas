import React, { useState } from 'react';
import { Copy, Check, Pencil, RefreshCw, Quote } from 'lucide-react';

interface AgentMessageActionsProps {
  text: string;
  isUser: boolean;
  /** 只在最后一条回复上提供"重新生成" */
  canRegenerate?: boolean;
  disabled?: boolean;
  /** 常驻显示（最后一条消息）；否则悬停时才出现 */
  alwaysVisible?: boolean;
  onEdit?: (text: string) => void;
  onQuote?: (text: string) => void;
  onRegenerate?: () => void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 非安全上下文或权限被拒时退回 execCommand
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

const ActionButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, children }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className="w-6 h-6 inline-flex items-center justify-center rounded-md text-stone-400 hover:text-[#8A6A3E] hover:bg-[#F3EEE6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
  >
    {children}
  </button>
);

/** 消息下方的快捷操作：复制、编辑重发（用户消息）、引用、重新生成（最后一条回复） */
export const AgentMessageActions: React.FC<AgentMessageActionsProps> = ({
  text,
  isUser,
  canRegenerate,
  disabled,
  alwaysVisible,
  onEdit,
  onQuote,
  onRegenerate
}) => {
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  if (!text.trim()) return null;

  const handleCopy = async () => {
    const ok = await copyText(text);
    setCopied(ok ? 'ok' : 'fail');
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div
      className={`flex items-center gap-0.5 mt-1 ${isUser ? 'justify-end' : ''} ${
        alwaysVisible ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
      } transition-opacity`}
    >
      <ActionButton label={copied === 'ok' ? '已复制' : copied === 'fail' ? '复制失败' : '复制'} onClick={handleCopy}>
        {copied === 'ok' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
      </ActionButton>
      {isUser && onEdit && (
        <ActionButton label="编辑后重发" onClick={() => onEdit(text)} disabled={disabled}>
          <Pencil className="w-3.5 h-3.5" />
        </ActionButton>
      )}
      {!isUser && onQuote && (
        <ActionButton label="引用到输入框" onClick={() => onQuote(text)} disabled={disabled}>
          <Quote className="w-3.5 h-3.5" />
        </ActionButton>
      )}
      {!isUser && canRegenerate && onRegenerate && (
        <ActionButton label="重新生成" onClick={onRegenerate} disabled={disabled}>
          <RefreshCw className="w-3.5 h-3.5" />
        </ActionButton>
      )}
      {copied && <span className="text-[10px] text-stone-400 ml-1">{copied === 'ok' ? '已复制' : '复制失败'}</span>}
    </div>
  );
};
