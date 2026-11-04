import React, { useMemo, useRef, useState } from 'react';
import { Send, Pause, Plus, AtSign, X, ImageIcon } from 'lucide-react';
import { AgentActionOption } from '../../../types/creativeCanvas';

export interface MentionableNode {
  id: string;
  title: string;
  imageUrl?: string;
}

interface AgentComposerProps {
  isStreaming?: boolean;
  onSend: (text: string, mentionedNodeIds: string[]) => void;
  onStop?: () => void;
  onUploadFile: (file: File) => void;
  quickActions: AgentActionOption[];
  onQuickAction: (option: AgentActionOption) => void;
  mentionableNodes: MentionableNode[];
}

/** 从光标位置往前找正在输入的 @ 引用，返回 @ 的位置与已输入的关键词 */
function findMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query) || query.length > 20) return null;
  return { start: at, query };
}

export const AgentComposer: React.FC<AgentComposerProps> = ({
  isStreaming,
  onSend,
  onStop,
  onUploadFile,
  quickActions,
  onQuickAction,
  mentionableNodes
}) => {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<MentionableNode[]>([]);
  const [mentionQuery, setMentionQuery] = useState<{ start: number; query: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mentionCandidates = useMemo(() => {
    if (!mentionQuery) return [];
    const q = mentionQuery.query.toLowerCase();
    return mentionableNodes.filter(n => n.title.toLowerCase().includes(q)).slice(0, 8);
  }, [mentionQuery, mentionableNodes]);

  const updateMentionQuery = (value: string, caret: number) => {
    setMentionQuery(mentionableNodes.length > 0 ? findMentionQuery(value, caret) : null);
  };

  const insertMention = (node: MentionableNode) => {
    if (!mentionQuery) return;
    const caret = textareaRef.current?.selectionStart ?? text.length;
    const token = `@${node.title} `;
    const next = text.slice(0, mentionQuery.start) + token + text.slice(caret);
    setText(next);
    setMentions(prev => (prev.some(m => m.id === node.id) ? prev : [...prev, node]));
    setMentionQuery(null);
    requestAnimationFrame(() => {
      const pos = mentionQuery.start + token.length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
    });
  };

  const openMentionPicker = () => {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? text.length;
    const next = `${text.slice(0, caret)}@${text.slice(caret)}`;
    setText(next);
    setMentionQuery({ start: caret, query: '' });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret + 1, caret + 1);
    });
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    // 只带上正文里仍然保留的引用（用户可能手动删掉了 @标签）
    const activeMentionIds = mentions.filter(m => trimmed.includes(`@${m.title}`)).map(m => m.id);
    onSend(trimmed, activeMentionIds);
    setText('');
    setMentions([]);
    setMentionQuery(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery && mentionCandidates.length > 0) {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionCandidates[0]);
        return;
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }
    // 中文输入法组字时回车用于上屏，不发送
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="p-3 border-t border-[#E5E0D8] bg-white/90 backdrop-blur-md shrink-0 space-y-2">
      {quickActions.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] pb-0.5">
          {quickActions.map(action => (
            <button
              key={action.label}
              type="button"
              onClick={() => onQuickAction(action)}
              disabled={isStreaming}
              className="shrink-0 px-2.5 py-1 rounded-lg border border-[#E5E0D8] bg-white hover:border-[#B28C5A] hover:text-[#8C6F43] text-[11px] font-bold text-stone-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      <div className="relative rounded-2xl border border-[#E5E0D8] bg-[#F9F5EF]/80 focus-within:border-[#B28C5A] focus-within:ring-1 focus-within:ring-[#B28C5A] transition-all">
        {mentions.length > 0 && (
          <div className="flex flex-wrap gap-1 px-3 pt-2">
            {mentions.map(m => (
              <span key={m.id} className="flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded-md bg-white border border-[#E5E0D8] text-[10px] text-stone-700">
                {m.imageUrl ? (
                  <img src={m.imageUrl} alt="" className="w-4 h-4 rounded object-cover" />
                ) : (
                  <ImageIcon className="w-3 h-3 text-[#B28C5A]" />
                )}
                <span className="max-w-[120px] truncate">{m.title}</span>
                <button
                  type="button"
                  onClick={() => setMentions(prev => prev.filter(x => x.id !== m.id))}
                  className="text-stone-400 hover:text-stone-700 cursor-pointer"
                  title="移除引用"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          rows={2}
          disabled={isStreaming}
          onChange={e => {
            setText(e.target.value);
            updateMentionQuery(e.target.value, e.target.selectionStart);
          }}
          onClick={e => updateMentionQuery(text, e.currentTarget.selectionStart)}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? '智能体正在回复中...' : '说说你的需求，输入 @ 引用画布素材，如：@产品主图 做 6 屏详情页'}
          className="w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-xs text-[#2C2A29] placeholder:text-stone-400 outline-none disabled:opacity-60 max-h-32"
        />

        <div className="flex items-center justify-between px-2 pb-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-500 hover:bg-white hover:text-[#B28C5A] transition-colors cursor-pointer"
              title="上传产品主图"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={openMentionPicker}
              disabled={mentionableNodes.length === 0 || isStreaming}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-500 hover:bg-white hover:text-[#B28C5A] transition-colors disabled:opacity-40 cursor-pointer"
              title={mentionableNodes.length === 0 ? '画布上还没有可引用的素材' : '引用画布素材'}
            >
              <AtSign className="w-3.5 h-3.5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) onUploadFile(file);
                e.target.value = '';
              }}
            />
          </div>

          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer"
              title="停止生成"
            >
              <Pause className="w-3 h-3" />
              <span>停止</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!text.trim()}
              className="p-2 bg-[#B28C5A] hover:bg-[#9E7A4A] disabled:opacity-40 text-white rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
              title="发送（Enter 发送，Shift+Enter 换行）"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {mentionQuery && (
          <div className="absolute left-2 right-2 bottom-full mb-1.5 max-h-56 overflow-y-auto bg-white border border-[#E5E0D8] rounded-xl shadow-lg py-1 z-20">
            <div className="px-3 py-1 text-[10px] font-bold text-stone-400">引用画布素材</div>
            {mentionCandidates.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-stone-400">没有匹配的素材</div>
            ) : (
              mentionCandidates.map(node => (
                <button
                  key={node.id}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => insertMention(node)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[#F9F5EF] cursor-pointer"
                >
                  {node.imageUrl ? (
                    <img src={node.imageUrl} alt="" className="w-7 h-7 rounded-md object-cover border border-[#E5E0D8]" />
                  ) : (
                    <span className="w-7 h-7 rounded-md bg-[#F9F5EF] border border-[#E5E0D8] flex items-center justify-center">
                      <ImageIcon className="w-3.5 h-3.5 text-[#B28C5A]" />
                    </span>
                  )}
                  <span className="text-[11px] text-[#2C2A29] truncate">{node.title}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
