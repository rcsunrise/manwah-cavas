import React from 'react';
import { Loader2, Pause, Play, Square } from 'lucide-react';
import { GenerationBatch } from '../../../types/creativeCanvas';

interface AgentTaskStripProps {
  isPlanGenerating?: boolean;
  generatingScenes?: Set<number>;
  batchState?: GenerationBatch | null;
  onPauseBatch?: () => void;
  onResumeBatch?: () => void;
  onCancelBatch?: () => void;
}

/** 输入框上方的进行中任务条：企划生成、单屏渲染、批量渲染进度（批量可暂停 / 继续 / 终止） */
export const AgentTaskStrip: React.FC<AgentTaskStripProps> = ({
  isPlanGenerating,
  generatingScenes,
  batchState,
  onPauseBatch,
  onResumeBatch,
  onCancelBatch
}) => {
  const batchActive = batchState && (batchState.status === 'running' || batchState.status === 'paused');
  const renderingScenes = generatingScenes ? Array.from(generatingScenes).sort((a, b) => a - b) : [];
  // 批量渲染的单屏已经计入批量进度，不再单列
  const showSingleRenders = !batchActive && renderingScenes.length > 0;

  if (!isPlanGenerating && !batchActive && !showSingleRenders) return null;

  const done = batchState ? batchState.success + batchState.failed + batchState.cancelled : 0;
  const percent = batchState && batchState.total > 0 ? Math.round((done / batchState.total) * 100) : 0;

  return (
    <div className="px-3 pt-2 space-y-1.5">
      {isPlanGenerating && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-100 text-[11px] text-amber-800">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span className="font-bold">企划生成中</span>
          <span className="text-amber-700/80 truncate">后台持续执行，可继续对话</span>
        </div>
      )}

      {showSingleRenders && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-100 text-[11px] text-amber-800">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span className="font-bold">渲染中</span>
          <span className="truncate">{renderingScenes.map(i => `第 ${i} 屏`).join('、')}</span>
        </div>
      )}

      {batchActive && batchState && (
        <div className="px-2.5 py-1.5 rounded-lg bg-[#FAF8F5] border border-[#E5E0D8] space-y-1">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="flex items-center gap-1.5 font-bold text-[#2C2A29] min-w-0">
              {batchState.status === 'running' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B28C5A] shrink-0" />
              ) : (
                <Pause className="w-3.5 h-3.5 text-stone-500 shrink-0" />
              )}
              <span className="truncate">
                批量渲染 {done}/{batchState.total}
                {batchState.failed > 0 && <span className="text-rose-600 font-normal"> · 失败 {batchState.failed}</span>}
                {batchState.status === 'paused' && <span className="text-stone-500 font-normal"> · 已暂停</span>}
              </span>
            </span>
            <span className="flex items-center gap-1 shrink-0">
              {batchState.status === 'running' ? (
                <button type="button" onClick={onPauseBatch} className="p-1 rounded hover:bg-stone-200 text-stone-600 cursor-pointer" title="暂停（进行中的屏会完成）">
                  <Pause className="w-3 h-3" />
                </button>
              ) : (
                <button type="button" onClick={onResumeBatch} className="p-1 rounded hover:bg-stone-200 text-stone-600 cursor-pointer" title="继续">
                  <Play className="w-3 h-3" />
                </button>
              )}
              <button type="button" onClick={onCancelBatch} className="p-1 rounded hover:bg-rose-100 text-rose-600 cursor-pointer" title="终止剩余任务">
                <Square className="w-3 h-3" />
              </button>
            </span>
          </div>
          <div className="h-1 rounded-full bg-stone-200 overflow-hidden">
            <div className="h-full bg-[#B28C5A] transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
    </div>
  );
};
