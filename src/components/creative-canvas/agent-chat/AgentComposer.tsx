import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Pause, Plus, AtSign, X, ImageIcon, Loader2 } from 'lucide-react';
import { AgentActionOption } from '../../../types/creativeCanvas';

export interface MentionableNode {
  id: string;
  title: string;
  imageUrl?: string;
}

interface AgentComposerProps {
  isStreaming?: boolean;
  onSend: (text: string, mentionedNodeIds: string[], imageUrls: string[]) => void;
  /** 上传对话图片，返回存储地址；不传时退回为直接上传产品主图 */
  onUploadAttachment?: (file: File) => Promise<string>;
  onStop?: () => void;
  onUploadFile: (file: File) => void;
  quickActions: AgentActionOption[];
  onQuickAction: (option: AgentActionOption) => void;
  mentionableNodes: MentionableNode[];
  /** 外部把文字填进输入框（编辑重发、引用回复）；nonce 变化才生效 */
  fillRequest?: { text: string; mode: 'replace' | 'append'; nonce: number } | null;
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
  onUploadAttachment,
  quickActions,
  onQuickAction,
  mentionableNodes,
  fillRequest
}) => {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<MentionableNode[]>([]);
  const [mentionQuery, setMentionQuery] = useState<{ start: number; query: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  type Attachment = { id: string; file: File; previewUrl: string; status: 'uploading' | 'ready' | 'error'; url?: string; error?: string };
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const removeAttachment = (id: string) =>
    setAttachments(prev => {
      const hit = prev.find(a => a.id === id);
      if (hit) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter(a => a.id !== id);
    });
  // 图片先作为附件放进输入框，由用户决定：随消息发给智能体，或点"设为主图"提取 DNA
  const addImage = (file: File) => {
    if (!onUploadAttachment) {
      onUploadFile(file);
      return;
    }
    if (attachments.length >= 4) return;
    const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setAttachments(prev => [...prev, { id, file, previewUrl: URL.createObjectURL(file), status: 'uploading' }]);
    onUploadAttachment(file).then(
      url => setAttachments(prev => prev.map(a => (a.id === id ? { ...a, status: 'ready', url } : a))),
      err => setAttachments(prev => prev.map(a => (a.id === id ? { ...a, status: 'error', error: err?.message || '上传失败' } : a)))
    );
    textareaRef.current?.focus();
  };
  const setAsProductImage = (att: Attachment) => {
    onUploadFile(att.file);
    removeAttachment(att.id);
  };

  useEffect(() => {
    if (!fillRequest) return;
    setText(prev => (fillRequest.mode === 'append' && prev.trim() ? `${prev.trimEnd()}\n${fillRequest.text}` : fillRequest.text));
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [fillRequest?.nonce]);

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

  const attachmentsUploading = attachments.some(a => a.status === 'uploading');
  const readyImageUrls = attachments.filter(a => a.status === 'ready' && a.url).map(a => a.url!);
  const submit = () => {
    const trimmed = text.trim();
    if ((!trimmed && readyImageUrls.length === 0) || isStreaming || attachmentsUploading) return;
    // 只带上正文里仍然保留的引用（用户可能手动删掉了 @标签）
    const activeMentionIds = mentions.filter(m => trimmed.includes(`@${m.title}`)).map(m => m.id);
    onSend(trimmed, activeMentionIds, readyImageUrls);
    setText('');
    setMentions([]);
    setMentionQuery(null);
    attachments.forEach(a => URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);
  };

  // 粘贴 / 拖入图片：和 + 按钮一样上传为产品主图；纯文字粘贴照常进入输入框
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const firstImageFile = (files: FileList | DataTransferItemList | null | undefined): File | null => {
    if (!files) return null;
    for (let i = 0; i < files.length; i++) {
      const item = files[i] as File | DataTransferItem;
      if ('kind' in item) {
        if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
      } else if (item.type.startsWith('image/')) {
        return item;
      }
    }
    return null;
  };
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = firstImageFile(e.clipboardData?.items);
    if (!file) return;
    e.preventDefault();
    // 阻止冒泡到画布的全局粘贴监听，避免同一张图上传两次
    e.stopPropagation();
    addImage(file);
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingImage) setIsDraggingImage(true);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    setIsDraggingImage(false);
    const file = firstImageFile(e.dataTransfer.files);
    if (!file) return;
    e.preventDefault();
    e.stopPropagation();
    addImage(file);
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

      <div
        className={`relative rounded-2xl border bg-[#F9F5EF]/80 focus-within:border-[#B28C5A] focus-within:ring-1 focus-within:ring-[#B28C5A] transition-all ${
          isDraggingImage ? 'border-[#B28C5A] ring-2 ring-[#B28C5A]/40' : 'border-[#E5E0D8]'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDraggingImage(false);
        }}
        onDrop={handleDrop}
      >
        {isDraggingImage && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-[#F9F5EF]/90 text-xs font-bold text-[#8C6F43]">
            松开即可添加图片
          </div>
        )}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-2.5">
            {attachments.map(att => (
              <div key={att.id} className="relative w-[88px] rounded-lg border border-[#E5E0D8] bg-white overflow-hidden">
                <img src={att.previewUrl} alt="" className="w-full h-16 object-cover" />
                {att.status === 'uploading' && (
                  <div className="absolute inset-x-0 top-0 h-16 flex items-center justify-center bg-white/60">
                    <Loader2 className="w-4 h-4 animate-spin text-[#B28C5A]" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/55 text-white flex items-center justify-center cursor-pointer"
                  title="移除"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
                {att.status === 'error' ? (
                  <div className="px-1 py-1 text-[9px] text-rose-600 truncate" title={att.error}>{att.error}</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAsProductImage(att)}
                    className="w-full py-1 text-[9px] font-bold text-[#8C6F43] hover:bg-[#F9F5EF] border-t border-[#E5E0D8] cursor-pointer"
                    title="替换画布上的产品主图并提取产品 DNA"
                  >
                    设为产品主图
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
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
          onPaste={handlePaste}
          placeholder={isStreaming ? '智能体正在回复中...' : attachments.length > 0 ? '说说想对这张图做什么，或直接发送让智能体看图' : '说说你的需求，输入 @ 引用画布素材；可粘贴或拖入图片'}
          className="w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-xs text-[#2C2A29] placeholder:text-stone-400 outline-none disabled:opacity-60 max-h-32"
        />

        <div className="flex items-center justify-between px-2 pb-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-500 hover:bg-white hover:text-[#B28C5A] transition-colors cursor-pointer"
              title="添加图片（也可直接粘贴或拖入）"
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
                if (file) addImage(file);
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
              disabled={(!text.trim() && readyImageUrls.length === 0) || attachmentsUploading}
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
