// src/components/creative-canvas/video/VideoResultNode.tsx
import React, { memo, useState, useEffect } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Film, Download, ExternalLink, RotateCw, Play, Volume2, VolumeX, ShieldCheck } from 'lucide-react';
import { VideoPlaybackInfo } from '../../../types/creativeCanvasVideo';
import { VideoGenerationService } from '../../../services/videoGenerationService';

export interface VideoResultNodeData {
  title?: string;
  assetVersionId?: string;
  posterUrl?: string;
  durationSeconds?: number;
  modelKey?: string;
  onRegenerate?: () => void;
  [key: string]: unknown;
}

export const VideoResultNode = memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as VideoResultNodeData;
  const { assetVersionId, title, posterUrl, modelKey } = nodeData;

  const [playbackInfo, setPlaybackInfo] = useState<VideoPlaybackInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);

  useEffect(() => {
    if (!assetVersionId) return;

    setLoading(true);
    VideoGenerationService.getPlaybackUrl(assetVersionId)
      .then(info => {
        setPlaybackInfo(info);
      })
      .catch(err => {
        console.warn('[VideoResultNode] Failed to load playback URL:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [assetVersionId]);

  const handleDownload = () => {
    if (!assetVersionId) return;
    window.open(`/api/canvases/assets/video?assetId=${assetVersionId}&download=1`, '_blank');
  };

  return (
    <div
      id={`node-${id}`}
      className={`w-[320px] rounded-xl border bg-white shadow-sm transition-all font-sans overflow-hidden ${
        selected ? 'border-neutral-900 ring-2 ring-neutral-900/10 shadow-md' : 'border-neutral-200'
      }`}
    >
      <Handle type="target" position={Position.Left} id="target" className="w-3 h-3 bg-neutral-400 border-2 border-white" />
      <Handle type="source" position={Position.Right} id="source" className="w-3 h-3 bg-neutral-400 border-2 border-white" />

      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-neutral-100 bg-neutral-50/70">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-emerald-600 text-white">
            <Film className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-neutral-800 truncate">
            {title || '视频成果'}
          </span>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-medium">
          成果组
        </span>
      </div>

      {/* Video Player Box */}
      <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden group">
        {playbackInfo?.playbackUrl ? (
          <video
            src={playbackInfo.playbackUrl}
            poster={posterUrl}
            controls
            playsInline
            muted={isMuted}
            className="w-full h-full object-contain"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        ) : loading ? (
          <div className="flex flex-col items-center gap-2 text-neutral-400 text-xs">
            <RotateCw className="w-5 h-5 animate-spin" />
            <span>获取私有签名流...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-neutral-500 text-xs p-4 text-center">
            <Film className="w-6 h-6 text-neutral-600" />
            <span>暂无有效播放地址</span>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-neutral-500">
          <div className="flex items-center gap-1 truncate max-w-[180px]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="font-mono truncate">{assetVersionId || 'V1-Ready'}</span>
          </div>
          <div className="text-[10px] text-neutral-400">
            {playbackInfo?.storageProvider === 'gcs' ? 'GCS加密存储' : '本地安全落盘'}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1 border-t border-neutral-100">
          <button
            type="button"
            onClick={handleDownload}
            disabled={!assetVersionId}
            className="flex-1 py-1.5 px-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded text-xs font-medium transition flex items-center justify-center gap-1"
          >
            <Download className="w-3 h-3" />
            <span>下载 MP4</span>
          </button>
          {nodeData.onRegenerate && (
            <button
              type="button"
              onClick={nodeData.onRegenerate}
              className="py-1.5 px-3 border border-neutral-200 hover:border-neutral-400 text-neutral-700 rounded text-xs font-medium transition"
            >
              生成新版本
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

VideoResultNode.displayName = 'VideoResultNode';
