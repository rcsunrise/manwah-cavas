import React, { useEffect, useState } from 'react';
import { NodeProps } from '@xyflow/react';
import { Lock, Unlock, X } from 'lucide-react';

export interface GroupFrameNodeData {
  title?: string;
  locked?: boolean;
  memberCount?: number;
  onRename?: (title: string) => void;
  onToggleLock?: () => void;
  onUngroup?: () => void;
}

/**
 * 分组框：把一批生成结果框在一起。锁定后框内节点不能拖动/删除，
 * 之后对话里的新项目、新会话的结果会排在它旁边，互不干扰。
 */
export const GroupFrameNode: React.FC<NodeProps> = ({ data, selected }) => {
  const d = data as unknown as GroupFrameNodeData;
  const [title, setTitle] = useState(d.title || '');
  useEffect(() => setTitle(d.title || ''), [d.title]);
  const locked = Boolean(d.locked);

  return (
    <div
      className={`w-full h-full rounded-3xl border-2 border-dashed transition-colors ${
        locked ? 'border-[#B28C5A] bg-[#B28C5A]/[0.06]' : 'border-[#B28C5A]/50 bg-[#B28C5A]/[0.03]'
      } ${selected ? 'ring-2 ring-offset-2 ring-[#B28C5A]/40' : ''}`}
    >
      <div className="flex items-center gap-2 px-5 h-14 nodrag">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== d.title && d.onRename?.(title.trim())}
          onKeyDown={e => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          placeholder="分组名称"
          className="bg-transparent outline-none font-serif font-bold text-sm text-[#2C2622] min-w-0 w-56 border-b border-transparent focus:border-[#B28C5A]/60"
        />
        <span className="text-[10px] font-mono text-stone-500 bg-white/80 border border-[#E5E0D8] rounded-full px-2 py-0.5 shrink-0">
          {d.memberCount ?? 0} 个节点
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => d.onToggleLock?.()}
            className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
              locked ? 'bg-[#B28C5A] text-white border-[#B28C5A]' : 'bg-white text-[#8C6F43] border-[#E5E0D8] hover:border-[#B28C5A]'
            }`}
            title={locked ? '已锁定：框内节点不能移动、删除。点击解锁' : '锁定后框内结果不再被移动或误删，新结果会排到它旁边'}
          >
            {locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            <span>{locked ? '已锁定' : '锁定'}</span>
          </button>
          <button
            type="button"
            onClick={() => d.onUngroup?.()}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-stone-400 hover:text-rose-500 hover:bg-white transition-colors cursor-pointer"
            title="解散分组（节点保留）"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
