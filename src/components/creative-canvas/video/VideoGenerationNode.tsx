// src/components/creative-canvas/video/VideoGenerationNode.tsx
import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Play, RotateCw, AlertTriangle, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { VideoJob } from '../../../types/creativeCanvasVideo';

export interface VideoGenerationNodeData {
  job?: VideoJob;
  onCancel?: (jobId: string) => void;
  onRetryTransfer?: (jobId: string) => void;
  onOpenResult?: (job: VideoJob) => void;
  [key: string]: unknown;
}

export const VideoGenerationNode = memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as VideoGenerationNodeData;
  const job = nodeData.job;

  const getStatusBadge = () => {
    if (!job) {
      return (
        <span className="text-[10px] px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded">
          等待中
        </span>
      );
    }
    switch (job.status) {
      case 'ready':
        return (
          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>已就绪</span>
          </span>
        );
      case 'running':
        return (
          <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded font-medium flex items-center gap-1">
            <RotateCw className="w-3 h-3 animate-spin text-amber-600" />
            <span>生成中 {job.progressPercent || 0}%</span>
          </span>
        );
      case 'transferring':
        if ((job as any).videoUrl) {
          return (
            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>已就绪 (备份中)</span>
            </span>
          );
        }
        return (
          <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-medium flex items-center gap-1">
            <RotateCw className="w-3 h-3 animate-spin text-blue-600" />
            <span>转存云存储中</span>
          </span>
        );
      case 'transfer_failed':
        if ((job as any).videoUrl) {
          return (
            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>已就绪 (直连播放)</span>
            </span>
          );
        }
        return (
          <span className="text-[10px] px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded font-medium flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            <span>转存失败</span>
          </span>
        );
      case 'failed':
      case 'submission_unknown':
        return (
          <span className="text-[10px] px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded font-medium flex items-center gap-1">
            <XCircle className="w-3 h-3 text-rose-600" />
            <span>生成异常</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="text-[10px] px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded">
            已取消
          </span>
        );
      default:
        return (
          <span className="text-[10px] px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded">
            排队中
          </span>
        );
    }
  };

  return (
    <div
      id={`node-${id}`}
      className={`w-[290px] rounded-xl border bg-white shadow-sm transition-all font-sans ${
        selected ? 'border-neutral-900 ring-2 ring-neutral-900/10 shadow-md' : 'border-neutral-200'
      }`}
    >
      <Handle type="target" position={Position.Left} id="target" className="w-3 h-3 bg-neutral-400 border-2 border-white" />

      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-neutral-100 bg-neutral-50/70 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-indigo-600 text-white">
            <Play className="w-3 h-3 fill-current" />
          </div>
          <span className="text-xs font-semibold text-neutral-800 truncate">
            {job?.shotId || '视频生成任务'}
          </span>
        </div>
        {getStatusBadge()}
      </div>

      {/* Body */}
      <div className="p-3.5 space-y-3">
        {job ? (
          <>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-neutral-500">
                <span>模型: {job.modelKey}</span>
                <span className="font-mono">{job.videoSettings.resolution} / {job.videoSettings.durationSeconds}s</span>
              </div>
              <div className="text-[11px] text-neutral-700 bg-neutral-50 p-2 rounded border border-neutral-100 line-clamp-2 leading-relaxed">
                {job.prompt}
              </div>
            </div>

            {/* Progress bar (when running or transferring without direct url) */}
            {((job.status === 'running') || (job.status === 'transferring' && !(job as any).videoUrl)) && (
              <div className="space-y-1">
                <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-neutral-900 transition-all duration-300 rounded-full"
                    style={{ width: `${job.progressPercent || 20}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-neutral-400">
                  <span>{job.status === 'transferring' ? '正在落盘至云存储...' : '供应商计算渲染中...'}</span>
                  <span>{job.progressPercent || 0}%</span>
                </div>
              </div>
            )}

            {/* In-place playable video when ready OR when videoUrl exists */}
            {(job.status === 'ready' || (job as any).videoUrl) && (
              <div className="space-y-2">
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-neutral-200 group">
                  <video
                    src={(job as any).videoUrl || `/api/video-assets/${job.assetVersionId || job.id}/playback-url`}
                    controls
                    playsInline
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{job.status === 'transferring' ? '已就绪 (云端归档中)' : '渲染完成'}</span>
                  </span>
                  {((job as any).videoUrl || job.assetVersionId) && (
                    <a
                      href={(job as any).videoUrl || `/api/video-assets/${job.assetVersionId || job.id}/playback-url`}
                      target="_blank"
                      rel="noreferrer"
                      download
                      className="text-[11px] px-2 py-1 bg-neutral-900 text-white hover:bg-neutral-800 rounded transition font-medium"
                    >
                      下载视频
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Error & Action buttons */}
            {(job.status === 'failed' || job.status === 'submission_unknown') && (
              <div className="space-y-1.5 p-2.5 bg-rose-50 border border-rose-200 rounded-lg">
                <div className="text-[11px] font-medium text-rose-800 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>生成失败</span>
                </div>
                <div className="text-[10px] text-rose-600 leading-relaxed break-all">
                  {job.errorMessage || '视频模型上游拒绝或生成超时，请检查模型支持参数'}
                </div>
              </div>
            )}

            {job.status === 'transfer_failed' && (
              <div className="space-y-1.5">
                <div className="text-[10px] text-rose-600 leading-tight">
                  {job.errorMessage || '转存云存储超时'}
                </div>
                <button
                  type="button"
                  onClick={() => nodeData.onRetryTransfer?.(job.id)}
                  className="w-full py-1 text-xs font-medium bg-rose-50 hover:bg-rose-100 text-rose-700 rounded border border-rose-200 transition"
                >
                  仅重试转存 (不重新扣费)
                </button>
              </div>
            )}

            {job.status === 'running' && (
              <button
                type="button"
                onClick={() => nodeData.onCancel?.(job.id)}
                className="w-full py-1 text-[11px] font-medium text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded transition"
              >
                取消任务
              </button>
            )}

            {/* Task Id / Meta */}
            <div className="pt-1 border-t border-neutral-100 flex items-center justify-between text-[9px] text-neutral-400 font-mono">
              <span className="truncate max-w-[150px]">{job.id}</span>
              <span>幂等键已绑定</span>
            </div>
          </>
        ) : (
          <div className="py-3 text-center text-xs text-neutral-400">任务等待派发中</div>
        )}
      </div>

      <Handle type="source" position={Position.Right} id="source" className="w-3 h-3 bg-neutral-400 border-2 border-white" />
    </div>
  );
});

VideoGenerationNode.displayName = 'VideoGenerationNode';
