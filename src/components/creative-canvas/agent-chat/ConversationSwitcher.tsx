import React, { useEffect, useRef, useState } from 'react';
import { confirmDialog } from '../../../utils/confirmDialog';
import { ChevronDown, Trash2, MessageSquare } from 'lucide-react';
import { AgentConversationRecord } from '../../../types/creativeCanvas';

interface ConversationSwitcherProps {
  conversations: AgentConversationRecord[];
  currentId?: string;
  onSelect: (id: string) => void;
  onDelete: (ids: string[]) => void | Promise<void>;
}

const formatTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `今天 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
};

const titleOf = (c: AgentConversationRecord) => c.display_title || c.title || `会话 ${c.id.slice(0, 8)}`;

/** 历史会话切换：列出有内容的会话（标题、时间、条数），可逐个删除或一键清理空会话 */
export const ConversationSwitcher: React.FC<ConversationSwitcherProps> = ({ conversations, currentId, onSelect, onDelete }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const current = conversations.find(c => c.id === currentId);
  const sorted = [...conversations].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  // 没有消息的会话默认不列出（当前会话除外），可一键清理
  const visible = sorted.filter(c => c.id === currentId || (c.message_count ?? 1) > 0);
  const emptyIds = sorted.filter(c => c.id !== currentId && c.message_count === 0).map(c => c.id);

  const remove = async (ids: string[]) => {
    setBusy(true);
    try {
      await onDelete(ids);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[10px] bg-[#FAF8F5] text-stone-700 pl-2 pr-1.5 py-1 rounded-lg border border-[#E5E0D8] outline-none max-w-[150px] hover:border-[#B28C5A]/60 transition-colors cursor-pointer"
        title="切换或管理历史会话"
      >
        <MessageSquare className="w-3 h-3 text-[#B28C5A] shrink-0" />
        <span className="truncate">{current ? titleOf(current) : '历史会话'}</span>
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 z-50 rounded-xl border border-[#E5E0D8] bg-white shadow-xl overflow-hidden">
          <div className="px-3 py-2 text-[10px] text-stone-500 border-b border-[#F0EBE3]">
            历史会话 · {visible.length} 个（保存在云端，只加载当前会话的消息）
          </div>
          <div className="max-h-80 overflow-y-auto overscroll-contain py-1">
            {visible.map(c => {
              const isCurrent = c.id === currentId;
              return (
                <div
                  key={c.id}
                  className={`group flex items-center gap-2 px-3 py-2 cursor-pointer ${isCurrent ? 'bg-[#F9F5EF]' : 'hover:bg-[#FAF8F5]'}`}
                  onClick={() => {
                    if (!isCurrent) onSelect(c.id);
                    setOpen(false);
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className={`text-[11px] truncate ${isCurrent ? 'font-bold text-[#8C6F43]' : 'text-stone-800'}`}>{titleOf(c)}</div>
                    <div className="text-[10px] text-stone-400">
                      {formatTime(c.updated_at)}
                      {typeof c.message_count === 'number' ? ` · ${c.message_count} 条消息` : ''}
                      {isCurrent ? ' · 当前' : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async e => {
                      e.stopPropagation();
                      const n = c.message_count;
                      if (await confirmDialog(`删除会话「${titleOf(c)}」${typeof n === 'number' ? `及其 ${n} 条消息` : ''}？删除后无法恢复。`)) {
                        void remove([c.id]);
                      }
                    }}
                    className="p-1 rounded-md text-stone-300 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition disabled:opacity-40 cursor-pointer"
                    title="删除这个会话"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
            {visible.length === 0 && <div className="px-3 py-4 text-[11px] text-stone-400 text-center">还没有历史会话</div>}
          </div>
          {emptyIds.length > 0 && (
            <div className="border-t border-[#F0EBE3] px-3 py-2">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (await confirmDialog(`清理 ${emptyIds.length} 个没有任何消息的空会话？`, { confirmText: '清理' })) void remove(emptyIds);
                }}
                className="text-[10px] text-stone-500 hover:text-rose-600 disabled:opacity-40 cursor-pointer"
              >
                {busy ? '清理中…' : `清理 ${emptyIds.length} 个空会话`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
