import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LayoutGrid, Check, Sparkles, Save, History, CloudCheck, Loader2, AlertCircle, RefreshCw, PlusCircle, Dna, Download, Upload, Film, Database, MoreHorizontal } from 'lucide-react';
import { SaveStatus } from '../../types/creativeCanvas';

interface WorkflowHeaderProps {
  workspaceName?: string;
  saveStatus?: SaveStatus;
  lastSavedAt?: string;
  currentRevisionNumber?: number;
  dnaCode?: string;
  productDnaVersionCode?: string;
  productDnaVersionId?: string;
  isVideoPanelOpen?: boolean;
  /** 同一画布在其他标签页也打开着 */
  isOpenInOtherTab?: boolean;
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

/** 顶栏“全案海报”入口开关：九屏排版工作台当前用不到，先隐藏 */
const SHOW_LAYOUT_EDITOR_ENTRY = false;

const formatTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

export const WorkflowHeader: React.FC<WorkflowHeaderProps> = ({
  workspaceName = '新建立体视觉企划案',
  saveStatus = 'saved',
  lastSavedAt,
  currentRevisionNumber = 0,
  dnaCode,
  productDnaVersionCode,
  productDnaVersionId,
  isVideoPanelOpen = false,
  isOpenInOtherTab = false,
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
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // 更多菜单：点击外部或按 Esc 关闭
  useEffect(() => {
    if (!isMoreOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (!moreMenuRef.current?.contains(e.target as globalThis.Node)) setIsMoreOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMoreOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMoreOpen]);

  const runMenuAction = (action?: () => void) => {
    setIsMoreOpen(false);
    action?.();
  };

  // 保存状态胶囊：同时作为“立即保存草稿”的入口
  const renderSaveStatus = () => {
    const time = formatTime(lastSavedAt);
    switch (saveStatus) {
      case 'saving':
        return { tone: 'text-amber-700 bg-amber-50 border-amber-200', icon: <Loader2 className="w-3 h-3 animate-spin text-amber-600" />, label: '正在保存...', title: '正在保存草稿到服务器与本地' };
      case 'local_saved':
        return { tone: 'text-amber-800 bg-amber-50 border-amber-300 hover:bg-amber-100', icon: <AlertCircle className="w-3.5 h-3.5 text-amber-600" />, label: `未同步到云端 ${time}`, title: '数据库暂时连不上，改动先存在本机（浏览器里留有草稿，下次打开会自动恢复）；点击立即重试同步' };
      case 'memory_only':
        return { tone: 'text-amber-800 bg-amber-50 border-amber-300', icon: <AlertCircle className="w-3.5 h-3.5 text-amber-600" />, label: '未同步到云端', title: '数据库暂时连不上，改动先存在本机（浏览器里留有草稿，下次打开会自动恢复）；点击立即重试同步' };
      case 'save_failed':
      case 'error':
        return { tone: 'text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100', icon: <AlertCircle className="w-3.5 h-3.5 text-rose-600" />, label: '保存失败，点击重试', title: '点击立即重试保存当前工作流草稿' };
      case 'offline_pending':
      case 'unsynced':
        return { tone: 'text-amber-700 bg-amber-50 border-amber-200', icon: <RefreshCw className="w-3 h-3 text-amber-500 animate-pulse" />, label: '有未保存改动', title: '停止编辑约 10 秒后自动保存，点击立即保存' };
      default:
        return { tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: <CloudCheck className="w-3.5 h-3.5 text-emerald-600" />, label: `已保存 ${time}`, title: '草稿已保存（停止编辑约 10 秒后自动保存），点击立即保存' };
    }
  };
  const save = renderSaveStatus();

  const menuItemClass = 'w-full flex items-center gap-2 px-3 py-2 text-xs text-stone-700 hover:bg-[#F9F5EF] hover:text-[#8C6F43] text-left transition-colors';

  // 头部层级需高于视频面板（fixed z-40），否则“更多”下拉菜单会被面板盖住
  return (
    <header className="h-14 bg-white/90 backdrop-blur-md border-b border-[#E5E0D8] px-3 md:px-5 flex items-center gap-3 shrink-0 z-50 select-none">
      {/* 左：返回 + 画布身份 + 状态（DNA / 保存），状态紧挨着它描述的对象 */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1 basis-0">
        <button
          onClick={() => navigate('/manwah')}
          className="shrink-0 w-8 h-8 rounded-xl bg-stone-100 hover:bg-[#F9F5EF] text-stone-700 hover:text-[#B28C5A] flex items-center justify-center transition-all"
          title="返回工作流"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <div className="shrink-0 w-7 h-7 rounded-lg bg-[#F9F5EF] text-[#B28C5A] flex items-center justify-center border border-[#E5E0D8]">
            <LayoutGrid className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="font-serif font-bold text-sm text-[#2C2A29] whitespace-nowrap">视觉企划画布</h1>
            <p className="text-[10px] text-stone-400 font-sans truncate" title={workspaceName}>{workspaceName}</p>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-[#E5E0D8] bg-[#FAF8F5]">
            <Dna className="w-3.5 h-3.5 text-[#B28C5A]" />
            {dnaCode && productDnaVersionCode ? (
              <button
                onClick={onViewDnaVersion}
                className="flex items-center gap-1.5 text-stone-800 hover:text-[#B28C5A] transition-colors"
                title={`DNA Version ID: ${productDnaVersionId || '未确定'}`}
              >
                <span className="font-mono text-[11px] font-bold text-[#B28C5A]">{dnaCode}</span>
                <span className="font-mono text-[10px] bg-[#B28C5A]/10 text-[#8C6F43] px-1.5 rounded-full border border-[#B28C5A]/20 font-bold">
                  {productDnaVersionCode}
                </span>
              </button>
            ) : (
              <span className="text-[11px] text-stone-400 whitespace-nowrap">未绑定 DNA</span>
            )}
          </div>
        </div>

        <button
          onClick={onSaveDraftNow}
          disabled={!onSaveDraftNow || saveStatus === 'saving'}
          className={`hidden sm:flex shrink-0 items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium whitespace-nowrap transition-colors disabled:cursor-default ${save.tone}`}
          title={save.title}
        >
          {save.icon}
          <span>{save.label}</span>
        </button>

        {isOpenInOtherTab && (
          <span
            className="hidden md:flex shrink-0 items-center gap-1 px-2.5 py-1 rounded-full border border-amber-300 bg-amber-50 text-amber-800 text-[11px] font-medium whitespace-nowrap"
            title="此画布在另一个浏览器标签页也打开着，两边的自动保存会互相覆盖，建议只保留一个窗口编辑"
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            另一窗口也在编辑
          </span>
        )}
      </div>

      {/* 中：创作工具，画布上最常用的两个产出入口 */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-stone-100/80 border border-[#E5E0D8] shrink-0">
        {/* 全案海报暂时隐藏：当前用模板海报流程，九屏排版工作台用不到 */}
        {SHOW_LAYOUT_EDITOR_ENTRY && onOpenLayoutEditor && (
          <button
            onClick={onOpenLayoutEditor}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-stone-700 hover:bg-white hover:text-amber-800 transition-all flex items-center gap-1.5"
            title="进入全案海报工作台"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-amber-700" />
            <span className="hidden md:inline">全案海报</span>
          </button>
        )}
        {onOpenVideoPanel && (
          <button
            onClick={onOpenVideoPanel}
            aria-pressed={isVideoPanelOpen}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              isVideoPanelOpen
                ? 'bg-white text-emerald-800 shadow-xs ring-1 ring-emerald-200'
                : 'text-stone-700 hover:bg-white hover:text-emerald-800'
            }`}
            title={isVideoPanelOpen ? '收起视频创作面板' : '展开视频创作与运镜策划面板'}
          >
            <Film className="w-3.5 h-3.5 text-emerald-700" />
            <span className="hidden md:inline">视频创作</span>
          </button>
        )}
      </div>

      {/* 右：版本相关 + 主操作 + 更多（低频文件操作收进菜单） */}
      <div className="flex items-center justify-end gap-2 flex-1 basis-0 min-w-0">
        <button
          onClick={onOpenHistoryModal}
          className="shrink-0 px-2.5 py-1.5 rounded-xl text-stone-700 hover:bg-stone-100 text-xs font-bold transition-all flex items-center gap-1.5"
          title="查看与恢复历史存档版本"
        >
          <History className="w-3.5 h-3.5 text-[#B28C5A]" />
          <span className="hidden xl:inline">版本历史</span>
          {currentRevisionNumber > 0 && (
            <span className="font-mono text-[10px] bg-[#B28C5A] text-white px-1.5 rounded-full">v{currentRevisionNumber}</span>
          )}
        </button>

        <button
          onClick={onOpenSaveModal}
          className="shrink-0 px-3.5 py-1.5 rounded-xl bg-[#B28C5A] hover:bg-[#8C6F43] active:bg-[#6E5532] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
          title="将当前画布保存为一个可回溯的版本"
        >
          <Save className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">保存版本</span>
        </button>

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

        <div className="relative shrink-0" ref={moreMenuRef}>
          <button
            onClick={() => setIsMoreOpen(open => !open)}
            aria-haspopup="menu"
            aria-expanded={isMoreOpen}
            className={`w-8 h-8 rounded-xl flex items-center justify-center text-stone-600 transition-all ${isMoreOpen ? 'bg-stone-200' : 'hover:bg-stone-100'}`}
            title="更多操作"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {isMoreOpen && (
            <div role="menu" className="absolute right-0 top-full mt-1.5 w-48 py-1 bg-white border border-[#E5E0D8] rounded-xl shadow-lg z-50">
              {onNewCanvas && (
                <button role="menuitem" className={menuItemClass} onClick={() => runMenuAction(onNewCanvas)}>
                  <PlusCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>新建画布</span>
                </button>
              )}
              {onSaveDraftNow && (
                <button role="menuitem" className={menuItemClass} onClick={() => runMenuAction(onSaveDraftNow)}>
                  <Save className="w-3.5 h-3.5 text-stone-500" />
                  <span>立即保存草稿</span>
                </button>
              )}
              {(onImportJson || onExportJson) && <div className="my-1 border-t border-stone-100" />}
              {onImportJson && (
                <button role="menuitem" className={menuItemClass} onClick={() => runMenuAction(() => fileInputRef.current?.click())}>
                  <Upload className="w-3.5 h-3.5 text-[#B28C5A]" />
                  <span>导入 JSON</span>
                </button>
              )}
              {onExportJson && (
                <button role="menuitem" className={menuItemClass} onClick={() => runMenuAction(onExportJson)}>
                  <Download className="w-3.5 h-3.5 text-stone-500" />
                  <span>导出 JSON</span>
                </button>
              )}
              <div className="my-1 border-t border-stone-100" />
              {onOpenStorageManager && (
                <button role="menuitem" className={menuItemClass} onClick={() => runMenuAction(onOpenStorageManager)}>
                  <Database className="w-3.5 h-3.5 text-purple-700" />
                  <span>存储管理</span>
                </button>
              )}
              <button role="menuitem" className={menuItemClass} onClick={() => runMenuAction(() => navigate('/manwah'))}>
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>切换到传统视图</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
