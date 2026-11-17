import React from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
import { toThumbnailUrl } from '../../utils/thumbnailUrl';

export interface FabricMainNodeData {
  name?: string;
  imageUrl?: string;
  /** pending 已选主面料、等确认；running 生成中；done 已出海报 */
  state?: 'pending' | 'running' | 'done';
}

const STATE_TEXT: Record<string, string> = { pending: '待确认', running: '生成中', done: '已出海报' };

/** 面料色卡海报的“主面料”节点：选好主色后立刻出现在画布上，生成的海报从它连出。 */
export const FabricMainNode: React.FC<NodeProps> = ({ data, selected }) => {
  const d = data as unknown as FabricMainNodeData;
  const [useThumb, setUseThumb] = React.useState(true);
  React.useEffect(() => setUseThumb(true), [d.imageUrl]);
  const src = d.imageUrl && useThumb ? toThumbnailUrl(d.imageUrl, 512) : d.imageUrl;
  return (
    <div
      className={`w-[260px] rounded-2xl bg-white border shadow-sm p-3 space-y-2 ${
        selected ? 'border-[#B28C5A] ring-2 ring-[#B28C5A]/30' : 'border-[#E5E0D8]'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-[#B28C5A] !w-2 !h-2" />
      <div className="flex items-center justify-between">
        <span className="text-xs font-serif font-bold text-[#2C2622]">主面料</span>
        <span className="text-[10px] font-bold text-[#8C6F43] bg-[#F9F5EF] border border-[#E5E0D8] rounded-full px-2 py-0.5">
          {STATE_TEXT[d.state || 'pending']}
        </span>
      </div>
      <div className="aspect-[4/3] rounded-xl bg-stone-100 overflow-hidden">
        {src && (
          <img
            src={src}
            alt={d.name}
            className="w-full h-full object-cover"
            draggable={false}
            onError={() => useThumb && src !== d.imageUrl && setUseThumb(false)}
          />
        )}
      </div>
      <p className="text-[11px] font-mono text-stone-600 truncate" title={d.name}>
        {d.name}
      </p>
      <Handle type="source" position={Position.Right} className="!bg-[#B28C5A] !w-2 !h-2" />
    </div>
  );
};
