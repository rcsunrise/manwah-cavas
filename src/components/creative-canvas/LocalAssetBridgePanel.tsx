import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderOpen,
  RefreshCw,
  Search,
  HardDrive,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Film,
  Sparkles,
  ArrowRight,
  Upload,
  X,
  FileCheck,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Laptop,
  KeyRound,
  Download
} from 'lucide-react';
import { localAssetService } from '../../services/localAssetService';
import { LocalAssetItem, LocalAssetSearchCardData } from '../../types/creativeCanvas';
import { supabase } from '../../lib/supabase';

interface LocalAssetBridgePanelProps {
  onImportAsMainImage: (file: File) => void;
  onAddAsStyleRef?: (imageUrl: string) => void;
  onImportAsRefDoc?: (docName: string, textContent: string) => void;
  onTriggerSearchInChat?: (keyword: string) => void;
  /** 把这张面料照片设为主面料，生成面料色卡海报（其余配色自动从同一文件夹挑） */
  onMakeTextilePoster?: (asset: LocalAssetItem) => void;
}

const SERVER_PATH_KEY = 'manwah_local_folder_path';

export const LocalAssetBridgePanel: React.FC<LocalAssetBridgePanelProps> = ({
  onImportAsMainImage,
  onAddAsStyleRef,
  onImportAsRefDoc,
  onTriggerSearchInChat,
  onMakeTextilePoster
}) => {
  // P0 Native Web state
  const [isConnected, setIsConnected] = useState(localAssetService.isConnected());
  const [dirName, setDirName] = useState(localAssetService.getDirectoryName());
  const [assetCount, setAssetCount] = useState(localAssetService.getIndexedCount());
  const [isScanning, setIsScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // P1 Tauri Bridge Desktop state
  const [isBridgeOnline, setIsBridgeOnline] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<{ deviceName: string; authorizedDirs: string[] } | null>(null);
  const [showPairModal, setShowPairModal] = useState(false);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairLoading, setPairLoading] = useState(false);

  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResult, setSearchResult] = useState<LocalAssetSearchCardData | null>(null);
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [allKeyword, setAllKeyword] = useState('');
  const [zoomIdx, setZoomIdx] = useState<number | null>(null);

  // 本机调试兜底：浏览器授权不可用时，让本地服务按路径直接读文件夹（云端部署没有这个入口）
  const [serverAvailable, setServerAvailable] = useState(false);
  const [pathInput, setPathInput] = useState('');

  useEffect(() => {
    let alive = true;
    localAssetService.isServerFolderAvailable().then(ok => alive && setServerAvailable(ok));
    try {
      const saved = localStorage.getItem(SERVER_PATH_KEY);
      if (saved) setPathInput(saved);
    } catch {
      /* 读不到就留空 */
    }
    return () => {
      alive = false;
    };
  }, []);

  const handleAuthorizeByPath = async () => {
    const dir = pathInput.trim();
    if (!dir) {
      setErrorMsg('请先填写素材文件夹的完整路径，如 D:\\素材\\面料');
      return;
    }
    setErrorMsg(null);
    setIsScanning(true);
    const res = await localAssetService.authorizeServerFolder(dir);
    setIsScanning(false);
    if (res.success) {
      try {
        localStorage.setItem(SERVER_PATH_KEY, dir);
      } catch {
        /* 存不了不影响使用 */
      }
      updateLocalState();
      setSearchResult(localAssetService.searchAssets('', 'all', 6));
    } else {
      setErrorMsg(res.error || '读取失败');
    }
  };

  // Sync state with local service
  const updateLocalState = useCallback(() => {
    setIsConnected(localAssetService.isConnected());
    setDirName(localAssetService.getDirectoryName());
    setAssetCount(localAssetService.getIndexedCount());
  }, []);

  // Poll cloud Bridge device status
  const checkBridgeStatus = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/bridge/status', { headers });
      if (res.ok) {
        const json = await res.json();
        setIsBridgeOnline(json.isOnline || false);
        setConnectedDevice(json.device || null);
      }
    } catch (e) {
      // Offline fallback
    }
  }, []);

  useEffect(() => {
    updateLocalState();
    checkBridgeStatus();
    const timer = setInterval(checkBridgeStatus, 10000);
    return () => clearInterval(timer);
  }, [updateLocalState, checkBridgeStatus]);

  // Handle Authorize via browser API
  const handleAuthorize = async () => {
    setErrorMsg(null);
    setIsScanning(true);
    const res = await localAssetService.authorizeDirectory();
    setIsScanning(false);
    if (res.success) {
      updateLocalState();
      const initialResults = localAssetService.searchAssets('', 'all', 6);
      setSearchResult(initialResults);
    } else {
      setErrorMsg(res.error || '授权失败');
    }
  };

  // Generate pair code for Tauri Bridge
  const handleGeneratePairCode = async () => {
    setErrorMsg(null);
    setPairLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/bridge/pair-code', {
        method: 'POST',
        headers
      });

      if (res.ok) {
        const json = await res.json();
        setPairCode(json.pairCode);
        setShowPairModal(true);
      } else {
        setErrorMsg('无法生成配对码，请确认网络连接');
      }
    } catch (err: any) {
      setErrorMsg(err.message || '生成配对码异常');
    } finally {
      setPairLoading(false);
    }
  };

  // Handle Rescan
  const handleRescan = async () => {
    setErrorMsg(null);
    setIsScanning(true);
    const res = await localAssetService.rescanDirectory();
    setIsScanning(false);
    if (res.success) {
      updateLocalState();
      if (searchKeyword) {
        setSearchResult(localAssetService.searchAssets(searchKeyword, 'all', 8));
      }
    } else {
      setErrorMsg(res.error || '重新扫描失败');
    }
  };

  // Handle Disconnect
  const handleDisconnect = () => {
    localAssetService.disconnect();
    updateLocalState();
    setSearchResult(null);
    setSearchKeyword('');
  };

  // Handle Search (Bridge Desktop first, then browser memory fallback)
  const handleSearch = async (kw: string) => {
    setSearchKeyword(kw);

    if (isBridgeOnline && kw.trim()) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/bridge/search', {
          method: 'POST',
          headers,
          body: JSON.stringify({ query: kw.trim(), limit: 8 })
        });

        if (res.ok) {
          const json = await res.json();
          const items: LocalAssetItem[] = (json.data || []).map((d: any) => ({
            id: d.id,
            name: d.name,
            path: d.path,
            size: d.size,
            formattedSize: `${(d.size / (1024 * 1024)).toFixed(1)} MB`,
            type: d.category === 'product_photo' ? 'image' : 'document',
            extension: d.extension,
            lastModified: d.last_modified * 1000,
            previewUrl: d.preview_base64
          }));

          setSearchResult({
            query: kw,
            matchedCount: items.length,
            assets: items
          });
          return;
        }
      } catch (err) {
        console.warn('Bridge search fallback to local browser service:', err);
      }
    }

    if (!kw.trim()) {
      setSearchResult(localAssetService.searchAssets('', 'all', 6));
      return;
    }
    const res = localAssetService.searchAssets(kw, 'all', 8);
    setSearchResult(res);
  };

  // Import Asset as Main Image
  const handleSelectMainImage = async (asset: LocalAssetItem) => {
    // If from Bridge (without native File handle), stage it via bridge API
    if (!asset.file && !asset.fileHandle && !asset.serverUrl && asset.path) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/bridge/stage-asset', {
          method: 'POST',
          headers,
          body: JSON.stringify({ filePath: asset.path })
        });

        if (res.ok) {
          const json = await res.json();
          if (json.file?.base64) {
            // Convert Base64 to File
            const response = await fetch(json.file.base64);
            const blob = await response.blob();
            const file = new File([blob], asset.name, { type: blob.type || 'image/png' });
            onImportAsMainImage(file);
            return;
          }
        }
      } catch (err) {
        console.warn('Failed to stage asset via Bridge:', err);
      }
    }

    const file = await localAssetService.getFileForAsset(asset);
    if (file) {
      onImportAsMainImage(file);
    } else {
      setErrorMsg(`无法读取文件 ${asset.name}`);
    }
  };

  const hasAnyActiveConnection = isBridgeOnline || isConnected;

  // 刷新页面后文件夹连接会自动恢复，但素材列表是空的：连上后补一次默认列表
  useEffect(() => {
    if (isConnected && !searchResult && assetCount > 0) {
      setSearchResult(localAssetService.searchAssets('', 'all', 6));
    }
  }, [isConnected, searchResult, assetCount]);

  return (
    <div className="bg-[#FAF8F5] rounded-2xl border border-[#E5E0D8] p-3 shadow-xs space-y-3">
      {/* Top Header / Connection Status Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              isBridgeOnline
                ? 'bg-blue-50 text-blue-600 border border-blue-200'
                : isConnected
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                : 'bg-amber-50 text-amber-600 border border-amber-200'
            }`}
          >
            {isBridgeOnline ? <Laptop className="w-4 h-4" /> : <HardDrive className="w-4 h-4" />}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-[#2C2A29]">
                {isBridgeOnline
                  ? 'Local Bridge 桌面连接器'
                  : isConnected
                  ? '本地素材库 · 已就绪'
                  : '本地素材连接器'}
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                  isBridgeOnline
                    ? 'bg-blue-100 text-blue-700'
                    : isConnected
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-stone-200 text-stone-600'
                }`}
              >
                {isBridgeOnline ? 'Tauri 桌面端' : isConnected ? 'P0 免安装' : '未授权'}
              </span>
            </div>
            <p className="text-[10px] text-stone-500 truncate max-w-[190px]">
              {isBridgeOnline
                ? `${connectedDevice?.deviceName || '设计师电脑'} (已授权目录)`
                : isConnected
                ? `${dirName} (${assetCount} 个文件)`
                : '授权本地文件夹，Agent G 可直接读取'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {hasAnyActiveConnection ? (
            <>
              {isConnected && (
                <button
                  type="button"
                  onClick={handleRescan}
                  disabled={isScanning}
                  className="p-1.5 hover:bg-white rounded-lg text-stone-500 hover:text-stone-800 transition-colors"
                  title="重新扫描目录"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-[#B28C5A]' : ''}`} />
                </button>
              )}
              {isConnected && (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="p-1.5 hover:bg-rose-50 text-stone-400 hover:text-rose-600 rounded-lg transition-colors text-[10px]"
                  title="断开文件夹"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsPanelExpanded(!isPanelExpanded)}
                className="p-1.5 hover:bg-white rounded-lg text-stone-500 transition-colors"
                title={isPanelExpanded ? "收起素材面板" : "展开素材面板"}
              >
                {isPanelExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleGeneratePairCode}
                disabled={pairLoading}
                className="px-2 py-1 bg-stone-800 hover:bg-stone-900 text-white rounded-lg text-[10px] font-bold shadow-xs flex items-center gap-1 transition-all"
                title="绑定已安装的 Local Asset Bridge 桌面程序"
              >
                <KeyRound className="w-3 h-3 text-[#B28C5A]" />
                <span>配对桌面</span>
              </button>
              <button
                type="button"
                onClick={handleAuthorize}
                disabled={isScanning}
                className="px-2.5 py-1 bg-[#B28C5A] hover:bg-[#9E7A4A] text-white rounded-lg text-[10px] font-bold shadow-xs flex items-center gap-1 transition-all active:scale-95"
              >
                <FolderOpen className="w-3 h-3" />
                <span>{isScanning ? '扫描中...' : '授权文件夹'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pairing Code Modal */}
      {showPairModal && (
        <div className="p-3 bg-white border border-[#B28C5A]/40 rounded-xl space-y-2.5 shadow-sm animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#2C2A29] flex items-center gap-1">
              <KeyRound className="w-3.5 h-3.5 text-[#B28C5A]" />
              Local Asset Bridge 设备配对码
            </span>
            <button type="button" onClick={() => setShowPairModal(false)} className="text-stone-400 hover:text-stone-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="py-2.5 bg-[#F9F5EF] rounded-xl text-center relative border border-[#E5E0D8] group">
            <span className="tracking-widest font-mono font-bold text-xl text-[#B28C5A]">
              {pairCode || '------'}
            </span>
            <button
              type="button"
              onClick={() => {
                if (pairCode) navigator.clipboard.writeText(pairCode);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-white hover:bg-stone-50 border border-[#E5E0D8] rounded text-[9px] text-stone-600 font-bold transition-all"
              title="复制配对码"
            >
              复制
            </button>
          </div>

          {/* Direct Guidance on Where is the Connector */}
          <div className="p-2 bg-stone-50 rounded-lg border border-stone-200/60 space-y-1.5 text-[10px] text-stone-600">
            <p className="font-bold text-[#2C2A29] flex items-center gap-1">
              <Laptop className="w-3.5 h-3.5 text-blue-600" />
              如何启动本地连接器？
            </p>
            <ol className="list-decimal list-inside space-y-0.5 text-stone-600 pl-0.5 leading-relaxed">
              <li>在项目根目录下双击运行 <code className="bg-stone-200 px-1 py-0.2 rounded font-mono text-stone-800 font-bold">start-bridge.bat</code>（或在终端执行 <code className="bg-stone-200 px-1 py-0.2 rounded font-mono text-stone-800">npm run bridge</code>）</li>
              <li>在黑色控制台窗口中输入上方 6 位配对码并回车</li>
              <li>连接器即刻与云端握手，此处状态将自动变为绿色在线</li>
            </ol>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-stone-100 text-[10px]">
            <span className="text-stone-400">不想运行桌面程序？</span>
            <button
              type="button"
              onClick={() => {
                setShowPairModal(false);
                handleAuthorize();
              }}
              className="text-[#B28C5A] hover:underline font-bold flex items-center gap-0.5"
            >
              <FolderOpen className="w-3 h-3" />
              <span>使用【免安装】浏览器直接授权</span>
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {errorMsg && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-50 border border-rose-200 rounded-lg text-[10px] text-rose-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-stone-400 hover:text-stone-700">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 本机调试：输入路径读取（只在本地服务开放时出现，云端不显示） */}
      {serverAvailable && !hasAnyActiveConnection && (
        <div className="p-2 bg-white border border-dashed border-[#B28C5A]/50 rounded-xl space-y-1.5">
          <p className="text-[10px] text-stone-500 leading-relaxed">
            <span className="font-bold text-[#2C2A29]">本机调试 · 输入路径读取：</span>
            浏览器授权不可用（内嵌浏览器、受保护目录）时，让本地服务直接读这个文件夹。
          </p>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={pathInput}
              onChange={e => setPathInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAuthorizeByPath();
              }}
              placeholder="如 D:\素材\面料"
              className="flex-1 min-w-0 px-2 py-1 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-[11px] text-[#2C2A29] placeholder-stone-400 outline-none focus:border-[#B28C5A]"
            />
            <button
              type="button"
              onClick={handleAuthorizeByPath}
              disabled={isScanning}
              className="shrink-0 px-2.5 py-1 bg-stone-800 hover:bg-stone-900 text-white rounded-lg text-[10px] font-bold whitespace-nowrap"
            >
              {isScanning ? '读取中…' : '读取'}
            </button>
          </div>
        </div>
      )}

      {/* Expanded Search & Asset Grid when connected */}
      {hasAnyActiveConnection && isPanelExpanded && (
        <div className="space-y-2.5 pt-1 border-t border-[#E5E0D8]/60 animate-in fade-in duration-150">
          {/* Quick Search Input */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchKeyword}
              onChange={e => handleSearch(e.target.value)}
              placeholder="搜索本地型号 (如 2650)、材质、PDF、Logo..."
              className="w-full pl-8 pr-7 py-1.5 bg-white border border-[#E5E0D8] rounded-xl text-xs text-[#2C2A29] placeholder-stone-400 outline-none focus:border-[#B28C5A] transition-all"
            />
            {searchKeyword && (
              <button
                type="button"
                onClick={() => handleSearch('')}
                className="absolute right-2 text-stone-400 hover:text-stone-700"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Quick Filter Tag Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px] custom-scrollbar">
            {['2650', '沙发', '主图', '渲染', '面料', 'Logo', 'PDF'].map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => handleSearch(tag)}
                className={`px-2 py-0.5 rounded-md border shrink-0 transition-colors ${
                  searchKeyword === tag
                    ? 'bg-[#B28C5A] text-white border-[#B28C5A]'
                    : 'bg-white text-stone-600 border-[#E5E0D8] hover:border-[#B28C5A]'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>

          {/* Matched Asset Grid */}
          {searchResult && searchResult.assets.length > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-stone-500 px-0.5">
                <span>匹配到 {searchResult.matchedCount} 项素材</span>
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="text-[10px] font-bold text-[#B28C5A] hover:underline"
                >
                  查看全部大图 →
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto custom-scrollbar pr-0.5">
                {searchResult.assets.map(asset => (
                  <div
                    key={asset.id}
                    className="p-2 bg-white rounded-xl border border-[#E5E0D8] hover:border-[#B28C5A] shadow-2xs transition-all flex flex-col justify-between group space-y-1.5"
                  >
                    {/* Thumbnail or Icon */}
                    <div className="relative w-full h-20 bg-stone-100 rounded-lg overflow-hidden flex items-center justify-center">
                      {asset.type === 'image' && asset.previewUrl ? (
                        <img
                          src={asset.previewUrl}
                          alt={asset.name}
                          className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform"
                        />
                      ) : asset.type === 'document' ? (
                        <div className="flex flex-col items-center gap-1 text-stone-400">
                          <FileText className="w-6 h-6 text-[#B28C5A]" />
                          <span className="text-[9px] font-mono uppercase">{asset.extension}</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-stone-400">
                          <Film className="w-6 h-6 text-sky-500" />
                          <span className="text-[9px] font-mono uppercase">{asset.extension}</span>
                        </div>
                      )}
                      <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[8px] px-1 py-0.2 rounded">
                        {asset.formattedSize}
                      </span>
                    </div>

                    {/* File Meta */}
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-bold text-[#2C2A29] truncate" title={asset.name}>
                        {asset.name}
                      </p>
                      <p className="text-[9px] text-stone-400 truncate font-mono" title={asset.path}>
                        {asset.path}
                      </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-1 border-t border-stone-100 flex items-center gap-1">
                      {asset.type === 'image' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSelectMainImage(asset)}
                            className="flex-1 py-1 bg-[#B28C5A] hover:bg-[#9E7A4A] text-white rounded text-[9px] font-bold transition-colors flex items-center justify-center gap-0.5"
                            title="作为产品主图导入，并自动提取 DNA"
                          >
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>主图DNA</span>
                          </button>
                          {onAddAsStyleRef && (
                            <button
                              type="button"
                              onClick={() => {
                                if (asset.previewUrl) onAddAsStyleRef(asset.previewUrl);
                              }}
                              className="px-1.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded text-[9px] font-semibold transition-colors"
                              title="加入风格参考图"
                            >
                              参考
                            </button>
                          )}
                        </>
                      ) : null}
                    </div>
                    {asset.type === 'image' && onMakeTextilePoster && (
                      <button
                        type="button"
                        onClick={() => onMakeTextilePoster(asset)}
                        className="w-full py-1 bg-stone-800 hover:bg-stone-900 text-white rounded text-[9px] font-bold transition-colors whitespace-nowrap"
                        title="以这块面料为主色，自动配色，生成面料色卡海报（三种版式可在对话里切换）"
                      >
                        设为主色 · 面料海报
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : searchKeyword ? (
            <div className="py-4 text-center text-[10px] text-stone-400">
              未找到与 "{searchKeyword}" 匹配的本地素材
            </div>
          ) : null}
        </div>
      )}
      {showAll &&
        createPortal(
          <div className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-6" onClick={() => setShowAll(false)}>
            <div
              className="bg-[#FAF8F5] rounded-2xl w-full max-w-6xl h-[88vh] flex flex-col shadow-2xl border border-[#E5E0D8]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 px-5 py-3 border-b border-[#E5E0D8]">
                <h3 className="font-serif font-bold text-[#2C2A29] shrink-0">全部素材 · {dirName}</h3>
                <input
                  autoFocus
                  value={allKeyword}
                  onChange={e => setAllKeyword(e.target.value)}
                  placeholder="按文件名筛选"
                  className="flex-1 min-w-0 px-3 py-1.5 bg-white border border-[#E5E0D8] rounded-xl text-xs outline-none focus:border-[#B28C5A]"
                />
                <button type="button" onClick={() => setShowAll(false)} className="text-stone-400 hover:text-stone-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {(() => {
                const list = localAssetService.searchAssets(allKeyword, 'image', 100000).assets;
                return (
                  <>
                    <p className="px-5 py-2 text-[11px] text-stone-500">共 {list.length} 张图片 · 点缩略图放大预览（←→ 切换，Esc 关闭），挑好后点「设为主色 · 面料海报」</p>
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pb-5 grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 content-start">
                      {list.map(asset => (
                        <div key={asset.id} className="bg-white rounded-xl border border-[#E5E0D8] hover:border-[#B28C5A] p-2 space-y-1.5">
                          <button
                            type="button"
                            onClick={() => setZoomIdx(list.indexOf(asset))}
                            className="block w-full aspect-square bg-stone-100 rounded-lg overflow-hidden cursor-zoom-in"
                            title="点击放大预览"
                          >
                            {asset.previewUrl && <img src={asset.previewUrl} alt={asset.name} loading="lazy" className="w-full h-full object-contain" />}
                          </button>
                          <p className="text-[11px] font-bold text-[#2C2A29] truncate" title={asset.path}>{asset.name}</p>
                          {onMakeTextilePoster && (
                            <button
                              type="button"
                              onClick={() => {
                                setShowAll(false);
                                onMakeTextilePoster(asset);
                              }}
                              className="w-full py-1 bg-stone-800 hover:bg-stone-900 text-white rounded text-[10px] font-bold"
                            >
                              设为主色 · 面料海报
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {zoomIdx !== null && list[zoomIdx] && (() => {
                      const z = list[zoomIdx];
                      const big = z.serverUrl && z.serverUrl.includes('/api/local-folder/file') ? `${z.serverUrl}&w=1800` : z.serverUrl || z.previewUrl;
                      const go = (d: number) => setZoomIdx((zoomIdx + d + list.length) % list.length);
                      return (
                        <div
                          className="fixed inset-0 z-[310] bg-black/80 flex flex-col items-center justify-center p-6 gap-3"
                          tabIndex={0}
                          ref={el => el?.focus()}
                          onKeyDown={e => {
                            if (e.key === 'Escape') { e.stopPropagation(); setZoomIdx(null); }
                            if (e.key === 'ArrowLeft') go(-1);
                            if (e.key === 'ArrowRight') go(1);
                          }}
                          onClick={e => { e.stopPropagation(); setZoomIdx(null); }}
                        >
                          <img src={big} alt={z.name} className="max-w-full max-h-[78vh] object-contain rounded-lg shadow-2xl bg-white" onClick={e => e.stopPropagation()} />
                          <div className="flex items-center gap-3 text-white text-sm" onClick={e => e.stopPropagation()}>
                            <button type="button" onClick={() => go(-1)} className="px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25">← 上一张</button>
                            <span className="font-mono">{z.name} · {zoomIdx + 1}/{list.length}</span>
                            <button type="button" onClick={() => go(1)} className="px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25">下一张 →</button>
                            {onMakeTextilePoster && (
                              <button
                                type="button"
                                onClick={() => { setZoomIdx(null); setShowAll(false); onMakeTextilePoster(z); }}
                                className="px-4 py-1 rounded-lg bg-[#B28C5A] hover:bg-[#9E7A4A] font-bold"
                              >
                                设为主色 · 面料海报
                              </button>
                            )}
                            <button type="button" onClick={() => setZoomIdx(null)} className="px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25">关闭</button>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                );
              })()}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
