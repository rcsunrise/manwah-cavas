// src/components/creative-canvas/video/VideoCreationNode.tsx
import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Film, Sparkles, Clock, CheckCircle2, ChevronRight } from 'lucide-react';
import { VideoDirectorPlan } from '../../../types/creativeCanvasVideo';

export interface VideoCreationNodeData {
  title?: string;
  plan?: VideoDirectorPlan;
  sourceNodeId?: string;
  sourceImageUrl?: string;
  onSelectShot?: (shotId: string) => void;
  [key: string]: unknown;
}

export const VideoCreationNode = memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as VideoCreationNodeData;
  const plan = nodeData.plan;

  return (
    <div
      id={`node-${id}`}
      className={`w-[320px] rounded-xl border bg-white shadow-sm transition-all font-sans ${
        selected ? 'border-neutral-900 ring-2 ring-neutral-900/10 shadow-md' : 'border-neutral-200'
      }`}
    >
      <Handle type="target" position={Position.Left} id="target" className="w-3 h-3 bg-neutral-400 border-2 border-white" />

      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-neutral-100 bg-neutral-50/70 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-neutral-900 text-white">
            <Film className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-neutral-800">
            {nodeData.title || '视频企划分镜方案'}
          </span>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-medium">
          企划组
        </span>
      </div>

      {/* Content */}
      <div className="p-3.5 space-y-3">
        {nodeData.sourceImageUrl && (
          <div className="flex items-center gap-2 p-2 bg-neutral-50 rounded-lg border border-neutral-100">
            <img
              src={nodeData.sourceImageUrl}
              alt="Source"
              className="w-10 h-10 rounded object-cover border border-neutral-200"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-neutral-400 font-medium">参考原图</div>
              <div className="text-xs text-neutral-700 truncate font-mono">{nodeData.sourceNodeId}</div>
            </div>
          </div>
        )}

        {plan ? (
          <>
            <div className="text-xs text-neutral-600 leading-relaxed bg-neutral-50/60 p-2 rounded-lg border border-neutral-100">
              {plan.summary}
            </div>

            {/* Shots List */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-medium text-neutral-500">
                <span>分镜镜头 ({plan.shots.length})</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{plan.estimatedDurationSeconds}s</span>
                </span>
              </div>
              <div className="space-y-1">
                {plan.shots.map(shot => (
                  <div
                    key={shot.shotId}
                    className="p-2 border border-neutral-100 rounded-md bg-white hover:border-neutral-300 transition text-[11px] flex items-center justify-between"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-medium text-neutral-800 truncate">
                        {shot.order}. {shot.title}
                      </div>
                      <div className="text-[10px] text-neutral-400 truncate">{shot.cameraMotion}</div>
                    </div>
                    <span className="text-[10px] font-mono text-neutral-400 shrink-0">
                      {shot.durationSeconds}s
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="py-4 text-center text-xs text-neutral-400">
            暂无分镜规划，请在右侧面板点击“生成视频方案”
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="source" className="w-3 h-3 bg-neutral-400 border-2 border-white" />
    </div>
  );
});

VideoCreationNode.displayName = 'VideoCreationNode';
