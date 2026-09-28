import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Database,
  Trash2,
  RefreshCw,
  Search,
  CheckSquare,
  Square,
  HardDrive,
  Clock,
  Layers,
  FileImage,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  Filter,
  Sparkles,
  Eye,
  Server,
  Play,
  Video,
  Film
} from 'lucide-react';
import {
  StorageManagementService,
  StorageScanResult,
  CanvasRecordItem,
  RevisionRecordItem,
  StorageAssetItem,
  LocalBrowserDraftItem
} from '../../services/storageManagementService';

interface StorageManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCanvasId?: string;
  onCanvasDeleted?: (deletedCanvasId: string) => void;
}

type TabType = 'all' | 'canvases' | 'storage_assets' | 'revisions' | 'local_drafts';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export const StorageManagerModal: React.FC<StorageManagerModalProps> = ({
  isOpen,
  onClose,
  currentCanvasId,
  onCanvasDeleted
}) => {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [scanData, setScanData] = useState<StorageScanResult | null>(null);
  const [localDrafts, setLocalDrafts] = useState<LocalBrowserDraftItem[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [assetCategoryFilter, setAssetCategoryFilter] = useState<string>('all');
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Selected IDs
  const [selectedCanvasIds, setSelectedCanvasIds] = useState<Set<string>>(new Set());
  const [selectedRevisionIds, setSelectedRevisionIds] = useState<Set<string>>(new Set());
  const [selectedStorageKeys, setSelectedStorageKeys] = useState<Set<string>>(new Set()); // bucket:fullPath
  const [selectedLocalDraftKeys, setSelectedLocalDraftKeys] = useState<Set<string>>(new Set());

  // Image preview popover
  const [hoverPreviewUrl, setHoverPreviewUrl] = useState<string | null>(null);

  // Video preview player modal
  const [playingVideoUrl, setPlayingVideoUrl] = useState<{ url: string; title: string } | null>(null);

  // Confirm purge modal
  const [purgeConfirmScope, setPurgeConfirmScope] = useState<'canvases' | 'storage_assets' | 'all' | 'local_drafts' | null>(null);

  const loadData = async () => {
    setLoading(true);
    setFeedbackMessage(null);
    try {
      const data = await StorageManagementService.scanStorage();
      setScanData(data);
      const drafts = StorageManagementService.getLocalBrowserDrafts();
      setLocalDrafts(drafts);
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: `读取存储信息失败: ${err?.message || '网络连接或服务异常'}`
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setSelectedCanvasIds(new Set());
      setSelectedRevisionIds(new Set());
      setSelectedStorageKeys(new Set());
      setSelectedLocalDraftKeys(new Set());
    }
  }, [isOpen]);

  // Filtered lists
  const filteredCanvases = useMemo(() => {
    if (!scanData) return [];
    return scanData.canvases.filter(c => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
    });
  }, [scanData, searchQuery]);

  const filteredRevisions = useMemo(() => {
    if (!scanData) return [];
    return scanData.revisions.filter(r => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return r.versionName.toLowerCase().includes(q) || r.canvasId.toLowerCase().includes(q);
    });
  }, [scanData, searchQuery]);

  const filteredStorageAssets = useMemo(() => {
    if (!scanData) return [];
    return scanData.storageAssets.filter(s => {
      if (assetCategoryFilter !== 'all' && s.category !== assetCategoryFilter) {
        return false;
      }
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.fullPath.toLowerCase().includes(q);
    });
  }, [scanData, searchQuery, assetCategoryFilter]);

  const filteredLocalDrafts = useMemo(() => {
    return localDrafts.filter(d => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return d.title.toLowerCase().includes(q) || d.key.toLowerCase().includes(q);
    });
  }, [localDrafts, searchQuery]);

  // Total selected items count
  const totalSelectedCount =
    selectedCanvasIds.size +
    selectedRevisionIds.size +
    selectedStorageKeys.size +
    selectedLocalDraftKeys.size;

  // Toggle selection helpers
  const toggleCanvas = (id: string) => {
    const next = new Set(selectedCanvasIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedCanvasIds(next);
  };

  const toggleRevision = (id: string) => {
    const next = new Set(selectedRevisionIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRevisionIds(next);
  };

  const toggleStorageKey = (key: string) => {
    const next = new Set(selectedStorageKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedStorageKeys(next);
  };

  const toggleLocalDraft = (key: string) => {
    const next = new Set(selectedLocalDraftKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedLocalDraftKeys(next);
  };

  // Select all visible in current tab
  const handleSelectAllVisible = () => {
    if (activeTab === 'canvases' || activeTab === 'all') {
      const allCids = new Set(filteredCanvases.map(c => c.id));
      const allSelected = filteredCanvases.every(c => selectedCanvasIds.has(c.id));
      if (allSelected) {
        setSelectedCanvasIds(new Set());
      } else {
        setSelectedCanvasIds(new Set([...selectedCanvasIds, ...allCids]));
      }
    }
    if (activeTab === 'storage_assets' || activeTab === 'all') {
      const allKeys = filteredStorageAssets.map(s => `${s.bucket}:${s.fullPath}`);
      const allSelected = allKeys.every(k => selectedStorageKeys.has(k));
      if (allSelected) {
        setSelectedStorageKeys(new Set());
      } else {
        setSelectedStorageKeys(new Set([...selectedStorageKeys, ...allKeys]));
      }
    }
    if (activeTab === 'revisions' || activeTab === 'all') {
      const allRids = filteredRevisions.map(r => r.id);
      const allSelected = allRids.every(r => selectedRevisionIds.has(r));
      if (allSelected) {
        setSelectedRevisionIds(new Set());
      } else {
        setSelectedRevisionIds(new Set([...selectedRevisionIds, ...allRids]));
      }
    }
    if (activeTab === 'local_drafts' || activeTab === 'all') {
      const allKeys = filteredLocalDrafts.map(d => d.key);
      const allSelected = allKeys.every(k => selectedLocalDraftKeys.has(k));
      if (allSelected) {
        setSelectedLocalDraftKeys(new Set());
      } else {
        setSelectedLocalDraftKeys(new Set([...selectedLocalDraftKeys, ...allKeys]));
      }
    }
  };

  // Execute Batch Delete
  const handleDeleteSelected = async () => {
    if (totalSelectedCount === 0) return;
    if (!window.confirm(`确定要删除选中的 ${totalSelectedCount} 项存储数据吗？此操作不可恢复。`)) {
      return;
    }

    setDeleting(true);
    setFeedbackMessage(null);

    try {
      // 1. Delete local drafts if any
      let localFreed = 0;
      if (selectedLocalDraftKeys.size > 0) {
        const res = StorageManagementService.clearLocalBrowserDrafts(Array.from(selectedLocalDraftKeys));
        localFreed = res.freedBytes;
      }

      // 2. Delete Supabase & server data
      const storageFiles = Array.from(selectedStorageKeys).map(k => {
        const [bucket, ...rest] = k.split(':');
        return { bucket, path: rest.join(':') };
      });

      const res = await StorageManagementService.deleteItems({
        canvasIds: Array.from(selectedCanvasIds),
        revisionIds: Array.from(selectedRevisionIds),
        storageFiles
      });

      // Check if current canvas was deleted
      if (currentCanvasId && selectedCanvasIds.has(currentCanvasId)) {
        if (onCanvasDeleted) onCanvasDeleted(currentCanvasId);
      }

      const totalFreedStr = formatBytes((res.freedBytesEstimate || 0) + localFreed);
      setFeedbackMessage({
        type: 'success',
        text: `清除成功！已从 Supabase 及本地删除 ${res.deletedCanvasesCount} 个画布、${res.deletedStorageFilesCount} 个素材文件、${res.deletedRevisionsCount} 个历史快照，共释放空间约 ${totalFreedStr}。`
      });

      // Clear selections & reload
      setSelectedCanvasIds(new Set());
      setSelectedRevisionIds(new Set());
      setSelectedStorageKeys(new Set());
      setSelectedLocalDraftKeys(new Set());
      await loadData();
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: `删除失败: ${err?.message || '未知错误'}`
      });
    } finally {
      setDeleting(false);
    }
  };

  // Single item fast delete
  const handleSingleDelete = async (type: 'canvas' | 'storage' | 'revision' | 'local', idOrKey: string, bucket?: string) => {
    if (!window.confirm('确定要删除此条存储记录吗？')) return;
    setDeleting(true);
    setFeedbackMessage(null);
    try {
      if (type === 'local') {
        StorageManagementService.clearLocalBrowserDrafts([idOrKey]);
      } else if (type === 'canvas') {
        await StorageManagementService.deleteItems({ canvasIds: [idOrKey] });
        if (currentCanvasId && currentCanvasId === idOrKey && onCanvasDeleted) {
          onCanvasDeleted(idOrKey);
        }
      } else if (type === 'revision') {
        await StorageManagementService.deleteItems({ revisionIds: [idOrKey] });
      } else if (type === 'storage' && bucket) {
        await StorageManagementService.deleteItems({ storageFiles: [{ bucket, path: idOrKey }] });
      }
      setFeedbackMessage({ type: 'success', text: '已成功删除该记录' });
      await loadData();
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: `删除失败: ${err?.message}` });
    } finally {
      setDeleting(false);
    }
  };

  // Handle Purge All Confirmation
  const handleExecutePurge = async () => {
    if (!purgeConfirmScope) return;
    setDeleting(true);
    setFeedbackMessage(null);
    try {
      if (purgeConfirmScope === 'local_drafts') {
        const res = StorageManagementService.clearLocalBrowserDrafts();
        setFeedbackMessage({
          type: 'success',
          text: `已一键清空所有本地浏览器草稿缓存 (共 ${res.count} 项，释放 ${formatBytes(res.freedBytes)})`
        });
      } else {
        const res = await StorageManagementService.purgeAll(purgeConfirmScope);
        setFeedbackMessage({
          type: 'success',
          text: res.message || '一键清空完成'
        });
      }
      setPurgeConfirmScope(null);
      await loadData();
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: `清空失败: ${err?.message}` });
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  const overview = scanData?.overview;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#FAF8F5] border border-[#E5E0D8] rounded-2xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden text-stone-800">
        
        {/* Header */}
        <div className="h-16 px-6 bg-white border-b border-[#E5E0D8] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif font-bold text-base text-[#2C2A29]">
                  云端存储与历史数据管理中心
                </h2>
                <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Server className="w-3 h-3 text-emerald-600" />
                  Supabase 直连
                </span>
              </div>
              <p className="text-xs text-stone-500">
                一键检索并清理存储在 Supabase 数据库、Storage 存储桶及浏览器中的历史画布与素材
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading || deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors disabled:opacity-50"
              title="重新扫描 Supabase 与本地最新数据"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-600' : ''}`} />
              <span>重新扫描</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Overview Stat Cards */}
        <div className="px-6 py-3.5 bg-[#F5F2EB] border-b border-[#E5E0D8] grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
          <div className="bg-white p-3 rounded-xl border border-[#E5E0D8] shadow-2xs">
            <div className="flex items-center justify-between text-stone-400 mb-1">
              <span className="text-xs font-medium">云端画布记录</span>
              <Layers className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono text-stone-900">
                {overview?.totalCanvases ?? '--'}
              </span>
              <span className="text-[11px] text-stone-500">份画板草稿</span>
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-[#E5E0D8] shadow-2xs">
            <div className="flex items-center justify-between text-stone-400 mb-1">
              <span className="text-xs font-medium">Storage 素材文件</span>
              <FileImage className="w-4 h-4 text-sky-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono text-stone-900">
                {overview?.totalStorageFiles ?? '--'}
              </span>
              <span className="text-[11px] text-stone-500">
                ({formatBytes(overview?.totalStorageBytes || 0)})
              </span>
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-[#E5E0D8] shadow-2xs">
            <div className="flex items-center justify-between text-stone-400 mb-1">
              <span className="text-xs font-medium">历史版本快照</span>
              <Clock className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono text-stone-900">
                {overview?.totalRevisions ?? '--'}
              </span>
              <span className="text-[11px] text-stone-500">份 Revision</span>
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-[#E5E0D8] shadow-2xs">
            <div className="flex items-center justify-between text-stone-400 mb-1">
              <span className="text-xs font-medium">本地草稿缓存</span>
              <HardDrive className="w-4 h-4 text-purple-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono text-stone-900">
                {localDrafts.length}
              </span>
              <span className="text-[11px] text-stone-500">项本地存储</span>
            </div>
          </div>
        </div>

        {/* Feedback Alert if any */}
        {feedbackMessage && (
          <div
            className={`mx-6 mt-3 px-4 py-2.5 rounded-xl border flex items-center justify-between text-xs font-medium ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedbackMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{feedbackMessage.text}</span>
            </div>
            <button onClick={() => setFeedbackMessage(null)} className="text-stone-400 hover:text-stone-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Action Controls & Filter Bar */}
        <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E0D8] bg-white">
          {/* Left: Tab Switchers */}
          <div className="flex items-center gap-1 bg-[#FAF8F5] p-1 rounded-xl border border-[#E5E0D8]">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'all'
                  ? 'bg-white text-stone-900 shadow-2xs border border-[#E5E0D8]'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              全部资产
            </button>
            <button
              onClick={() => setActiveTab('canvases')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'canvases'
                  ? 'bg-white text-amber-900 shadow-2xs border border-[#E5E0D8]'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <span>云端画布</span>
              <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 rounded-full font-mono">
                {scanData?.canvases.length || 0}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('storage_assets')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'storage_assets'
                  ? 'bg-white text-sky-900 shadow-2xs border border-[#E5E0D8]'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <span>Storage 素材</span>
              <span className="text-[10px] bg-sky-100 text-sky-800 px-1.5 rounded-full font-mono">
                {scanData?.storageAssets.length || 0}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('revisions')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'revisions'
                  ? 'bg-white text-emerald-900 shadow-2xs border border-[#E5E0D8]'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <span>历史快照</span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 rounded-full font-mono">
                {scanData?.revisions.length || 0}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('local_drafts')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'local_drafts'
                  ? 'bg-white text-purple-900 shadow-2xs border border-[#E5E0D8]'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <span>本地缓存</span>
              <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 rounded-full font-mono">
                {localDrafts.length}
              </span>
            </button>
          </div>

          {/* Middle: Search input */}
          <div className="flex-1 min-w-[200px] max-w-xs relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="搜索名称、ID、路径..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 focus:bg-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Right: Batch Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAllVisible}
              className="px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 border border-[#E5E0D8] rounded-lg transition-colors"
            >
              全选当前
            </button>

            {totalSelectedCount > 0 ? (
              <button
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>删除所选 ({totalSelectedCount})</span>
              </button>
            ) : (
              <div className="relative group">
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                  <span>快捷清理助手 ▼</span>
                </button>
                <div className="hidden group-hover:block absolute right-0 top-full mt-1 w-52 bg-white border border-[#E5E0D8] rounded-xl shadow-xl py-1 z-50 animate-in fade-in duration-150">
                  <button
                    onClick={() => setPurgeConfirmScope('local_drafts')}
                    className="w-full text-left px-3 py-2 text-xs text-stone-700 hover:bg-amber-50 hover:text-amber-900 flex items-center gap-2"
                  >
                    <HardDrive className="w-3.5 h-3.5 text-purple-500" />
                    <span>一键清理本地浏览器草稿</span>
                  </button>
                  <button
                    onClick={() => setPurgeConfirmScope('storage_assets')}
                    className="w-full text-left px-3 py-2 text-xs text-stone-700 hover:bg-amber-50 hover:text-amber-900 flex items-center gap-2"
                  >
                    <FileImage className="w-3.5 h-3.5 text-sky-500" />
                    <span>一键清除云端素材文件</span>
                  </button>
                  <button
                    onClick={() => setPurgeConfirmScope('canvases')}
                    className="w-full text-left px-3 py-2 text-xs text-stone-700 hover:bg-amber-50 hover:text-amber-900 flex items-center gap-2"
                  >
                    <Layers className="w-3.5 h-3.5 text-amber-500" />
                    <span>一键清空所有历史画布</span>
                  </button>
                  <div className="h-[1px] bg-stone-100 my-1" />
                  <button
                    onClick={() => setPurgeConfirmScope('all')}
                    className="w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 font-bold flex items-center gap-2"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    <span>深度重置 (清空全部历史)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Content List Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-stone-400">
              <RefreshCw className="w-6 h-6 animate-spin text-amber-600" />
              <p className="text-xs font-medium">正在读取 Supabase 云端与本地数据清单...</p>
            </div>
          ) : (
            <>
              {/* SECTION: Canvases (if activeTab is 'all' or 'canvases') */}
              {(activeTab === 'all' || activeTab === 'canvases') && filteredCanvases.length > 0 && (
                <div className="bg-white rounded-xl border border-[#E5E0D8] shadow-2xs overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#F9F6F0] border-b border-[#E5E0D8] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-amber-700" />
                      <h3 className="text-xs font-bold text-stone-800">
                        Supabase 云端画布草稿与工程 ({filteredCanvases.length})
                      </h3>
                    </div>
                    <span className="text-[11px] text-stone-500">表: creative_canvases</span>
                  </div>
                  <div className="divide-y divide-stone-100">
                    {filteredCanvases.map(canvas => {
                      const isSelected = selectedCanvasIds.has(canvas.id);
                      const isCurrent = canvas.id === currentCanvasId;
                      return (
                        <div
                          key={canvas.id}
                          className={`p-3.5 flex items-center justify-between gap-3 hover:bg-amber-50/40 transition-colors ${
                            isSelected ? 'bg-amber-50/70' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <button
                              onClick={() => toggleCanvas(canvas.id)}
                              className="text-stone-400 hover:text-amber-600 shrink-0"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-amber-600" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-stone-900 truncate">
                                  {canvas.title}
                                </span>
                                {isCurrent && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    当前画板
                                  </span>
                                )}
                                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-stone-100 text-stone-600 font-mono">
                                  {canvas.source === 'supabase' ? 'Supabase DB' : '磁盘持久化'}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-stone-400 mt-0.5 font-mono">
                                <span>ID: {canvas.id}</span>
                                <span>节点数: {canvas.nodeCount}</span>
                                <span>连线: {canvas.edgeCount}</span>
                                <span>更新时间: {new Date(canvas.updatedAt).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleSingleDelete('canvas', canvas.id)}
                              disabled={deleting}
                              className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="删除此画布草稿"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SECTION: Storage Assets (if activeTab is 'all' or 'storage_assets') */}
              {(activeTab === 'all' || activeTab === 'storage_assets') && (
                <div className="bg-white rounded-xl border border-[#E5E0D8] shadow-2xs overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#F0F5FA] border-b border-[#E5E0D8] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileImage className="w-4 h-4 text-sky-700" />
                      <h3 className="text-xs font-bold text-stone-800">
                        Supabase Storage 云端素材与导出文件 ({filteredStorageAssets.length})
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <Filter className="w-3.5 h-3.5 text-stone-400" />
                      <select
                        value={assetCategoryFilter}
                        onChange={e => setAssetCategoryFilter(e.target.value)}
                        className="text-[11px] bg-white border border-[#E5E0D8] rounded-md px-2 py-0.5 text-stone-700"
                      >
                        <option value="all">全部分类</option>
                        <option value="video">视频与输入</option>
                        <option value="export">海报与导出</option>
                        <option value="composition">排版图</option>
                        <option value="upload">用户上传</option>
                        <option value="mask">蒙版</option>
                      </select>
                    </div>
                  </div>

                  {filteredStorageAssets.length === 0 ? (
                    <div className="p-8 text-center text-xs text-stone-400">
                      未找到匹配的 Storage 素材文件
                    </div>
                  ) : (
                    <div className="divide-y divide-stone-100 max-h-96 overflow-y-auto">
                      {filteredStorageAssets.map(asset => {
                        const itemKey = `${asset.bucket}:${asset.fullPath}`;
                        const isSelected = selectedStorageKeys.has(itemKey);
                        return (
                          <div
                            key={asset.id}
                            className={`p-3 flex items-center justify-between gap-3 hover:bg-sky-50/40 transition-colors ${
                              isSelected ? 'bg-sky-50/70' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <button
                                onClick={() => toggleStorageKey(itemKey)}
                                className="text-stone-400 hover:text-sky-600 shrink-0"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-sky-600" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>

                              {/* Thumbnail preview if available */}
                              {asset.publicUrl && (
                                <div
                                  className="w-10 h-10 rounded-lg bg-stone-100 border border-[#E5E0D8] overflow-hidden shrink-0 cursor-pointer relative group flex items-center justify-center"
                                  onClick={() => {
                                    if (asset.category === 'video' || asset.mimeType?.startsWith('video/') || asset.name.endsWith('.mp4')) {
                                      setPlayingVideoUrl({ url: asset.publicUrl, title: asset.name });
                                    } else {
                                      window.open(asset.publicUrl, '_blank');
                                    }
                                  }}
                                  onMouseEnter={() => {
                                    if (asset.category !== 'video' && !asset.name.endsWith('.mp4')) {
                                      setHoverPreviewUrl(asset.publicUrl || null);
                                    }
                                  }}
                                  onMouseLeave={() => setHoverPreviewUrl(null)}
                                  title={asset.category === 'video' || asset.name.endsWith('.mp4') ? '点击播放视频' : '点击查看原图'}
                                >
                                  {asset.category === 'video' || asset.mimeType?.startsWith('video/') || asset.name.endsWith('.mp4') ? (
                                    <div className="w-full h-full bg-slate-900 flex items-center justify-center text-white relative">
                                      <Film className="w-5 h-5 text-sky-400" />
                                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Play className="w-4 h-4 text-white fill-white" />
                                      </div>
                                    </div>
                                  ) : (
                                    <img
                                      src={asset.publicUrl}
                                      alt={asset.name}
                                      className="w-full h-full object-cover"
                                      loading="lazy"
                                      referrerPolicy="no-referrer"
                                    />
                                  )}
                                </div>
                              )}

                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-semibold text-stone-900 truncate max-w-sm">
                                    {asset.name}
                                  </span>
                                  {asset.category === 'video' || asset.name.endsWith('.mp4') ? (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-800 font-mono font-medium flex items-center gap-0.5">
                                      <Video className="w-2.5 h-2.5" /> 视频素材
                                    </span>
                                  ) : (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-sky-100 text-sky-800 font-mono">
                                      {asset.bucket}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-stone-500 font-mono">
                                    {formatBytes(asset.sizeBytes)}
                                  </span>
                                </div>
                                <div className="text-[11px] text-stone-400 font-mono truncate max-w-xl mt-0.5">
                                  {asset.fullPath}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {asset.publicUrl && (asset.category === 'video' || asset.name.endsWith('.mp4')) && (
                                <button
                                  onClick={() => setPlayingVideoUrl({ url: asset.publicUrl, title: asset.name })}
                                  className="p-1.5 text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-medium"
                                  title="立即播放视频"
                                >
                                  <Play className="w-3.5 h-3.5 fill-purple-600" />
                                  <span>播放</span>
                                </button>
                              )}
                              {asset.publicUrl && (
                                <a
                                  href={asset.publicUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 text-stone-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                                  title="在浏览器新窗口打开"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                              <button
                                onClick={() => handleSingleDelete('storage', asset.fullPath, asset.bucket)}
                                disabled={deleting}
                                className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="删除该云端文件"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* SECTION: Local Drafts (if activeTab is 'all' or 'local_drafts') */}
              {(activeTab === 'all' || activeTab === 'local_drafts') && filteredLocalDrafts.length > 0 && (
                <div className="bg-white rounded-xl border border-[#E5E0D8] shadow-2xs overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#FAF5FA] border-b border-[#E5E0D8] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-purple-700" />
                      <h3 className="text-xs font-bold text-stone-800">
                        浏览器本地画布缓存与草稿 ({filteredLocalDrafts.length})
                      </h3>
                    </div>
                    <span className="text-[11px] text-stone-500">
                      清理后可解决打开画布自动恢复旧记录的问题
                    </span>
                  </div>
                  <div className="divide-y divide-stone-100">
                    {filteredLocalDrafts.map(draft => {
                      const isSelected = selectedLocalDraftKeys.has(draft.key);
                      return (
                        <div
                          key={draft.key}
                          className={`p-3.5 flex items-center justify-between gap-3 hover:bg-purple-50/40 transition-colors ${
                            isSelected ? 'bg-purple-50/70' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <button
                              onClick={() => toggleLocalDraft(draft.key)}
                              className="text-stone-400 hover:text-purple-600 shrink-0"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-purple-600" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-stone-900 truncate">
                                  {draft.title}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-800 font-mono">
                                  {formatBytes(draft.sizeBytes)}
                                </span>
                              </div>
                              <div className="text-[11px] text-stone-400 font-mono mt-0.5 truncate">
                                存储键: {draft.key}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleSingleDelete('local', draft.key)}
                              disabled={deleting}
                              className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="清理该本地缓存项"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SECTION: Revisions */}
              {(activeTab === 'all' || activeTab === 'revisions') && filteredRevisions.length > 0 && (
                <div className="bg-white rounded-xl border border-[#E5E0D8] shadow-2xs overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#F0FAF5] border-b border-[#E5E0D8] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-700" />
                      <h3 className="text-xs font-bold text-stone-800">
                        历史版本快照 ({filteredRevisions.length})
                      </h3>
                    </div>
                    <span className="text-[11px] text-stone-500">表: canvas_revisions</span>
                  </div>
                  <div className="divide-y divide-stone-100">
                    {filteredRevisions.map(rev => {
                      const isSelected = selectedRevisionIds.has(rev.id);
                      return (
                        <div
                          key={rev.id}
                          className={`p-3.5 flex items-center justify-between gap-3 hover:bg-emerald-50/40 transition-colors ${
                            isSelected ? 'bg-emerald-50/70' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <button
                              onClick={() => toggleRevision(rev.id)}
                              className="text-stone-400 hover:text-emerald-600 shrink-0"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-stone-900 truncate">
                                  {rev.versionName}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-mono">
                                  Rev #{rev.revisionNumber}
                                </span>
                              </div>
                              <div className="text-[11px] text-stone-400 font-mono mt-0.5 truncate">
                                所属画布 ID: {rev.canvasId} | 创建于: {rev.createdAt ? new Date(rev.createdAt).toLocaleString() : '--'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleSingleDelete('revision', rev.id)}
                              disabled={deleting}
                              className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="删除此版本快照"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {filteredCanvases.length === 0 &&
                filteredStorageAssets.length === 0 &&
                filteredLocalDrafts.length === 0 &&
                filteredRevisions.length === 0 && (
                  <div className="h-64 flex flex-col items-center justify-center gap-2 text-stone-400 bg-white rounded-xl border border-[#E5E0D8]">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    <p className="text-xs font-semibold text-stone-700">未发现任何存储记录或素材</p>
                    <p className="text-[11px] text-stone-400">存储环境非常干净，或搜索关键词无匹配结果</p>
                  </div>
                )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="h-14 px-6 bg-white border-t border-[#E5E0D8] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <span>当前已选中</span>
            <span className="font-mono font-bold text-amber-700">{totalSelectedCount}</span>
            <span>项数据</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
            >
              完成并关闭
            </button>
            {totalSelectedCount > 0 && (
              <button
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>立即清除所选 ({totalSelectedCount})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Floating Image Preview on Hover */}
      {hoverPreviewUrl && (
        <div className="fixed bottom-8 right-8 z-[110] bg-white p-2 rounded-2xl shadow-2xl border border-[#E5E0D8] max-w-sm pointer-events-none animate-in fade-in zoom-in-95 duration-150">
          <img
            src={hoverPreviewUrl}
            alt="Preview"
            className="w-full max-h-72 object-contain rounded-xl"
            referrerPolicy="no-referrer"
          />
          <div className="text-[10px] text-stone-400 font-mono text-center mt-1">
            素材预览
          </div>
        </div>
      )}

      {/* Video Player Modal */}
      {playingVideoUrl && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-stone-900 rounded-2xl max-w-3xl w-full border border-stone-700 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-3 bg-stone-800/90 border-b border-stone-700 flex items-center justify-between text-white">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Video className="w-4 h-4 text-purple-400" />
                <span className="truncate max-w-md">{playingVideoUrl.title}</span>
              </div>
              <button
                onClick={() => setPlayingVideoUrl(null)}
                className="p-1 hover:bg-stone-700 text-stone-400 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-black flex items-center justify-center">
              <video
                src={playingVideoUrl.url}
                controls
                autoPlay
                className="max-h-[65vh] w-auto max-w-full rounded-lg shadow-lg"
              >
                您的浏览器不支持 HTML5 视频播放。
              </video>
            </div>
            <div className="p-3 bg-stone-900 border-t border-stone-800 flex items-center justify-between text-xs">
              <span className="text-stone-400 font-mono text-[11px] truncate max-w-md">
                {playingVideoUrl.url}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={playingVideoUrl.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>下载 / 外部打开</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Purge Confirm Modal */}
      {purgeConfirmScope && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-[#E5E0D8] shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-bold text-base text-stone-900">
                确认一键清空操作
              </h3>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              {purgeConfirmScope === 'local_drafts' && '即将清空当前浏览器中缓存的所有画布草稿。此操作将避免每次打开页面时自动恢复历史草稿，但不会影响 Supabase 云端已保存的数据。'}
              {purgeConfirmScope === 'storage_assets' && '即将清空 Supabase Storage 存储桶中保存的生成图片与海报导出素材。此操作将释放大量云端存储空间。'}
              {purgeConfirmScope === 'canvases' && '即将删除 Supabase 数据库中所有的画布工程记录 (creative_canvases)。此操作不可撤销。'}
              {purgeConfirmScope === 'all' && '【高危操作】即将彻底清空 Supabase 数据库画布记录、所有云端 Storage 素材文件以及本地缓存！系统将恢复至初始无记录状态。'}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setPurgeConfirmScope(null)}
                className="px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-xl"
              >
                取消
              </button>
              <button
                onClick={handleExecutePurge}
                disabled={deleting}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs"
              >
                {deleting ? '正在清除...' : '确认执行清空'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
