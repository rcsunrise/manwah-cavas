import React from 'react';
import { NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronUp, Layers, CheckCircle, Sparkles, Film } from 'lucide-react';
import { STAGE_CONFIGS } from '../../utils/creativeCanvasLayout';
import { WorkflowStage } from '../../types/creativeCanvas';

export interface WorkflowStageGroupNodeData {
  stage: WorkflowStage;
  title?: string;
  subtitle?: string;
  color?: string;
  borderColor?: string;
  bg?: string;
  count?: number;
  collapsed?: boolean;
  onToggleCollapse?: (stage: WorkflowStage) => void;
}

export const WorkflowStageGroupNode: React.FC<NodeProps> = (props) => {
  const data = props.data as unknown as WorkflowStageGroupNodeData;
  const stage = data.stage || 'planning';
  const config = STAGE_CONFIGS[stage] || STAGE_CONFIGS.planning;

  const isCollapsed = Boolean(data.collapsed);
  const count = data.count || 0;

  const getStageIcon = () => {
    switch (stage) {
      case 'planning':
        return <Film className="w-4 h-4" style={{ color: config.color }} />;
      case 'generation':
        return <Sparkles className="w-4 h-4" style={{ color: config.color }} />;
      case 'results':
        return <CheckCircle className="w-4 h-4" style={{ color: config.color }} />;
      default:
        return <Layers className="w-4 h-4" style={{ color: config.color }} />;
    }
  };

  return (
    <div
      className={`relative w-full h-full rounded-3xl border-2 transition-all duration-300 select-none ${
        props.selected ? 'ring-2 ring-offset-2 ring-[#B28C5A]/40' : ''
      }`}
      style={{
        borderColor: config.borderColor,
        backgroundColor: config.bg,
        backdropFilter: 'blur(8px)'
      }}
    >
      {/* Header Container */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 bg-white/60 rounded-t-3xl">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-xs border border-black/5"
            style={{ backgroundColor: `${config.color}15` }}
          >
            {getStageIcon()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif font-bold text-sm text-[#2C2622]">
                {data.title || config.title}
              </h2>
              <span
                className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border text-stone-700 bg-white/80"
                style={{ borderColor: `${config.color}40`, color: config.color }}
              >
                {count} / 9 屏
              </span>
            </div>
            <p className="text-[11px] text-stone-500 font-medium mt-0.5">
              {data.subtitle || config.subtitle}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {data.onToggleCollapse && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onToggleCollapse?.(stage);
              }}
              className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl bg-white/90 hover:bg-white text-stone-700 border border-stone-200 shadow-xs transition-all active:scale-95"
              title={isCollapsed ? '展开阶段区域' : '折叠阶段区域'}
            >
              <span>{isCollapsed ? '展开阶段' : '收起阶段'}</span>
              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Collapsed Overlay Message */}
      {isCollapsed && (
        <div className="px-6 py-3 flex items-center justify-between text-xs text-stone-500 font-medium">
          <span>已折叠 {data.title || config.title} ({count} 个节点已隐藏)</span>
          <span className="text-[10px] font-mono text-stone-400">点击右侧按钮展开</span>
        </div>
      )}
    </div>
  );
};
