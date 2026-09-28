// src/components/creative-canvas/DetailExportPanel.tsx
import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, CheckCircle2, AlertTriangle, Layers, FileImage, Archive, ExternalLink } from 'lucide-react';
import {
  requestNinePostersExport,
  PosterItemExport,
  NinePostersExportResponse
} from '../../services/detailExportService';

interface DetailExportPanelProps {
  canvasId: string;
  workspaceId?: string;
  onClose?: () => void;
}

export const DetailExportPanel: React.FC<DetailExportPanelProps> = ({
  canvasId,
  workspaceId = 'default_workspace',
  onClose
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('准备导出 9 张 2100×2800 独立海报');
  const [exportResponse, setExportResponse] = useState<NinePostersExportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStartExport = async () => {
    setLoading(true);
    setError(null);
    setProgress(15);
    setStatusMessage('正在并发渲染 9 张 2100×2800 独立海报...');

    try {
      setProgress(40);
      const res = await requestNinePostersExport(canvasId, workspaceId);
      setProgress(90);
      setStatusMessage('正在打包 ZIP 归档文件...');

      setExportResponse(res);
      setProgress(100);
      setLoading(false);
      setStatusMessage('9 张独立海报与 ZIP 归档包全部生成成功！');
    } catch (err: any) {
      setLoading(false);
      setError(err.message || '导出任务失败');
    }
  };

  const handleDownloadZip = async () => {
    if (!exportResponse) return;
    const url = `/api/canvases/${canvasId}/detail-exports/${exportResponse.exportId}/zip`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `manwah_${canvasId}_V00${exportResponse.exportVersionNumber}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
      window.open(url, '_blank');
    }
  };

  const handleDownloadSinglePoster = async (poster: PosterItemExport) => {
    const url = `/api/canvases/${canvasId}/detail-exports/${exportResponse?.exportId}/posters/${poster.posterIndex}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = poster.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-100 max-w-3xl w-full shadow-2xl">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-indigo-950 border border-indigo-800 text-indigo-400">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100">九屏独立海报固化与批量导出</h3>
            <p className="text-xs text-slate-400">生成 9 张独立 2100×2800 高清 JPEG 海报及标准 ZIP 归档包</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-sm px-2 py-1 rounded hover:bg-slate-800 transition"
          >
            关闭
          </button>
        )}
      </div>

      {/* Action Button & Status Bar */}
      <div className="mt-6 space-y-4">
        {!exportResponse && !loading && (
          <button
            onClick={handleStartExport}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold text-sm shadow-lg transition flex items-center justify-center space-x-2 cursor-pointer active:scale-98"
          >
            <Download className="w-5 h-5" />
            <span>生成 9 张 2100×2800 独立海报与 ZIP 归档</span>
          </button>
        )}

        {loading && (
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-indigo-400 font-semibold">{statusMessage}</span>
              <span className="text-slate-400">{progress}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-indigo-500 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">导出任务失败</div>
              <div className="mt-1 text-red-300">{error}</div>
              <button
                onClick={handleStartExport}
                className="mt-3 px-3 py-1.5 rounded bg-red-900 hover:bg-red-800 text-white font-medium text-xs flex items-center space-x-1 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>重试导出任务</span>
              </button>
            </div>
          </div>
        )}

        {/* Export Success Result Display */}
        {exportResponse && (
          <div className="space-y-6 mt-4">
            {/* ZIP Archive Asset Card */}
            <div className="p-4 rounded-xl bg-slate-950 border border-indigo-900/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span className="font-bold text-sm text-slate-100">9 屏独立海报与 ZIP 归档包已就绪</span>
                </div>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Version: V00{exportResponse.exportVersionNumber}
                </span>
              </div>

              <div className="text-xs text-slate-400">
                包含 manifest.json 与 poster-01.jpg ~ poster-09.jpg（每张 2100×2800 像素，3:4 比例）。
              </div>

              <button
                onClick={handleDownloadZip}
                className="inline-flex items-center justify-center space-x-2 w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition cursor-pointer active:scale-98 shadow-md"
              >
                <Archive className="w-4 h-4" />
                <span>一键下载全套 ZIP 压缩包 (9 张海报 + Manifest)</span>
              </button>
            </div>

            {/* 9 Posters List */}
            <div>
              <h4 className="text-sm font-bold text-slate-200 mb-3 flex items-center space-x-2">
                <FileImage className="w-4 h-4 text-indigo-400" />
                <span>9 张独立海报清单 (2100×2800 px)</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
                {exportResponse.posters.map((poster: PosterItemExport) => (
                  <div
                    key={poster.filename}
                    className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs hover:border-slate-700 transition"
                  >
                    <div className="space-y-0.5 min-w-0 pr-2">
                      <div className="font-medium text-slate-200 truncate">{poster.filename}</div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {poster.width}×{poster.height}px | {((poster.fileSizeBytes || 0) / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownloadSinglePoster(poster)}
                      className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-mono transition flex items-center space-x-1 cursor-pointer active:scale-95 flex-shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>下载</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
