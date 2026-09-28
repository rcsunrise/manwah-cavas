import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LayoutGrid, Check, Sparkles, Save, History, CloudCheck, Loader2, AlertCircle, RefreshCw, PlusCircle, Dna, Download, Upload, Film, Database } from 'lucide-react';
import { SaveStatus } from '../../types/creativeCanvas';

interface WorkflowHeaderProps {
  workspaceName?: string;
  saveStatus?: SaveStatus;
  lastSavedAt?: string;
  currentRevisionNumber?: number;
  dnaCode?: string;
  productDnaVersionCode?: string;
  productDnaVersionId?: string;
  onSaveDraftNow?: () => void;
  onOpenSaveModal?: () => void;
  onOpenHistoryModal?: () => void;
  onOpenStorageManager?: () => void;
  onOpenLayoutEditor?: () => void;
  onOpenVideoPanel?: () => void;
  onNewCanvas?: () => void;
  onViewDnaVersion?: () => void;
  onExportJson?: () => void;
  onImportJson?: (file: File) => void;
}

export const WorkflowHeader: React.FC<WorkflowHeaderProps> = ({
  workspaceName = '新建立体视觉企划案',
  saveStatus = 'saved',
  lastSavedAt,
  currentRevisionNumber = 0,
  dnaCode,
  productDnaVersionCode,
  productDnaVersionId,
  onSaveDraftNow,
  onOpenSaveModal,
  onOpenHistoryModal,
  onOpenStorageManager,
  onOpenLayoutEditor,
  onOpenVideoPanel,
  onNewCanvas,
  onViewDnaVersion,
  onExportJson,
  onImportJson
}) => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <header className="h-14 bg-white/90 backdrop-blur-md border-b border-[#E5E0D8] px-4 md:px-6 flex items-center justify-between shrink-0 z-30 select-none">
      {/* Left: Back button & Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/manwah')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-[#F9F5EF] text-stone-700 hover:text-[#B28C5A] text-xs font-bold transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回工作流</span>
        </button>

        <div className="w-[1px] h-5 bg-[#E5E0D8] mx-1" />

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#F9F5EF] text-[#B28C5A] flex items-center justify-center border border-[#E5E0D8]">
            <LayoutGrid className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif font-bold text-sm text-[#2C2A29]">
                视觉企划画布
              </h1>
              <span className="text-[10px] font-bold text-[#B28C5A] bg-[#F9F5EF] px-2 py-0.5 rounded-full border border-[#E5E0D8]">
                无限画布工作流
              </span>
            </div>
            <p className="text-[10px] text-stone-400 font-sans">
              {workspaceName}
            </p>
          </div>
        </div>
      </div>

      {/* Right: Save Status, DNA Version Status & Actions */}
      <div className="flex items-center gap-2.5">
        {/* Product DNA Version Status Pill */}
        <div className="hidden lg:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-[#E5E0D8] bg-[#FAF8F5]">
          <Dna className="w-3.5 h-3.5 text-[#B28C5A]" />
          {dnaCode && productDnaVersionCode ? (
            <button
              onClick={onViewDnaVersion}
              className="flex items-center gap-1.5 text-stone-800 hover:text-[#B28C5A] transition-colors"
              title={`DNA Version ID: ${productDnaVersionId || '未确定'}`}
            >
              <span className="font-mono text-[11px] font-bold text-[#B28C5A]">{dnaCode}</span>
              <span className="font-mono text-[10px] bg-[#B28C5A]/10 text-[#8C6F43] px-1.5 py-0.2 rounded-full border border-[#B28C5A]/20 font-bold">
                {productDnaVersionCode}
              </span>
            </button>
          ) : (
            <span className="text-[11px] text-stone-400">未绑定 Product DNA</span>
          )}
        </div>
        {/* Auto-save status indicator (5min policy) */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-all">
          {(saveStatus === 'saving') && (
            <span className="flex items-center gap-1.5 text-amber-700 bg-amber-50 border-amber-200 px-2.5 py-0.5 rounded-full" title="正在保存草稿到服务器与本地">
              <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
              <span className="text-[11px] font-medium">正在保存草稿...</span>
            </span>
          )}

          {(saveStatus === 'cloud_saved' || saveStatus === 'saved') && (
            <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border-emerald-200 px-2.5 py-0.5 rounded-full" title="草稿已成功保存（系统每5分钟自动保存一次）">
              <CloudCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[11px] font-medium">
                已保存草稿 (5分钟自动) {lastSavedAt ? `(${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}
              </span>
            </span>
          )}

          {saveStatus === 'local_saved' && (
            <span className="flex items-center gap-1.5 text-sky-800 bg-sky-50 border-sky-200 px-2.5 py-0.5 rounded-full" title="已备用保存到本地存储">
              <Check className="w-3.5 h-3.5 text-sky-600" />
              <span className="text-[11px] font-medium">
                已存本地 (5分钟自动) {lastSavedAt ? `(${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}
              </span>
            </span>
          )}

          {saveStatus === 'memory_only' && (
            <span className="flex items-center gap-1.5 text-amber-800 bg-amber-50 border-amber-300 px-2.5 py-0.5 rounded-full" title="仅临时存放在内存中，重启后可能丢失">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-[11px] font-medium">临时保存，服务重启后可能丢失</span>
            </span>
          )}

          {(saveStatus === 'save_failed' || saveStatus === 'error') && (
            <button
              onClick={onSaveDraftNow}
              className="flex items-center gap-1.5 text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 px-2.5 py-0.5 rounded-full cursor-pointer transition-colors"
              title="点击立即重试保存当前工作流草稿"
            >
              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
              <span className="text-[11px] font-medium">保存失败，点击重试</span>
            </button>
          )}

          {(saveStatus === 'offline_pending' || saveStatus === 'unsynced') && (
            <span className="flex items-center gap-1.5 text-amber-700 bg-amber-50 border-amber-200 px-2.5 py-0.5 rounded-full" title="有尚未保存的改动，将在5分钟内自动保存">
              <RefreshCw className="w-3 h-3 text-amber-500 animate-pulse" />
              <span className="text-[11px] font-medium">待自动保存 (5分钟一次)</span>
            </span>
          )}
        </div>

        {/* Action: Manual Immediate Save Draft */}
        {onSaveDraftNow && (
          <button
            onClick={onSaveDraftNow}
            className="px-2.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition-all shadow-xs flex items-center gap-1"
            title="立即保存当前工作流草稿（无需等待5分钟自动保存）"
          >
            <Save className="w-3.5 h-3.5 text-stone-500" />
            <span>存草稿</span>
          </button>
        )}

        {/* Action: Create New Canvas */}
        {onNewCanvas && (
          <button
            onClick={onNewCanvas}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs transition-all shadow-xs flex items-center gap-1.5"
            title="清空当前状态，创建一个全新的视觉企划画布"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>新建画布</span>
          </button>
        )}

        {/* Action: Open History Revisions Modal */}
        <button
          onClick={onOpenHistoryModal}
          className="px-3 py-1.5 rounded-xl bg-[#FAF8F5] hover:bg-white text-stone-700 border border-[#E5E0D8] text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
          title="查看与恢复历史存档版本"
        >
          <History className="w-3.5 h-3.5 text-[#B28C5A]" />
          <span>版本历史</span>
          {currentRevisionNumber > 0 && (
            <span className="font-mono text-[10px] bg-[#B28C5A] text-white px-1.5 py-0.2 rounded-full">
              v{currentRevisionNumber}
            </span>
          )}
        </button>

        {/* Action: Open Storage Manager Modal */}
        {onOpenStorageManager && (
          <button
            onClick={onOpenStorageManager}
            className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
            title="一键查找并清除 Supabase 与本地存储的画布与素材"
          >
            <Database className="w-3.5 h-3.5 text-purple-700" />
            <span>存储管理</span>
          </button>
        )}

        {/* Action: Open Long Image Layout Editor Modal */}
        {onOpenLayoutEditor && (
          <button
            onClick={onOpenLayoutEditor}
            className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
            title="进入全案海报工作台"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-amber-700" />
            <span>全案海报</span>
          </button>
        )}

        {/* Action: Open Video Creation Panel */}
        {onOpenVideoPanel && (
          <button
            onClick={onOpenVideoPanel}
            className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
            title="展开视频创作与运镜策划面板"
          >
            <Film className="w-3.5 h-3.5 text-emerald-700" />
            <span>视频创作</span>
          </button>
        )}

        {/* Action: Import & Export JSON Draft */}
        <input
          type="file"
          ref={fileInputRef}
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && onImportJson) {
              onImportJson(file);
            }
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />

        {onImportJson && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1.5 rounded-xl bg-[#FAF8F5] hover:bg-white text-stone-700 border border-[#E5E0D8] hover:border-[#B28C5A] text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
            title="选择并导入 JSON 备份文件还原画布与工作流"
          >
            <Upload className="w-3.5 h-3.5 text-[#B28C5A]" />
            <span className="hidden sm:inline">导入 JSON</span>
          </button>
        )}

        {onExportJson && (
          <button
            onClick={onExportJson}
            className="px-2.5 py-1.5 rounded-xl bg-[#FAF8F5] hover:bg-white text-stone-700 border border-[#E5E0D8] hover:border-[#B28C5A] text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
            title="导出当前画布完整数据为标准 JSON 备份文件"
          >
            <Download className="w-3.5 h-3.5 text-stone-600" />
            <span className="hidden sm:inline">导出 JSON</span>
          </button>
        )}

        {/* Action: Save Current Version Modal */}
        <button
          onClick={onOpenSaveModal}
          className="px-3.5 py-1.5 rounded-xl bg-[#B28C5A] hover:bg-[#8C6F43] active:bg-[#6E5532] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
        >
          <Save className="w-3.5 h-3.5" />
          <span>保存当前版本</span>
        </button>

        <button
          onClick={() => navigate('/manwah')}
          className="hidden md:flex px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition-all shadow-sm items-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>传统视图</span>
        </button>
      </div>
    </header>
  );
};
