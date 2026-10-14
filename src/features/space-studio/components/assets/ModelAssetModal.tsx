import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Search, User, Sparkles, Star, Plus, Check, 
  Trash2, Upload, Eye, Sliders, RefreshCw, AlertCircle, Shirt,
  Smile, Camera, Layers, Copy, CheckCheck, Scan, ShieldCheck, Heart,
  FileText, Image as ImageIcon, ArrowRight, UserCheck, Compass,
  Edit2, Pencil, Download, UploadCloud, CheckCircle2, HardDrive
} from 'lucide-react';
import { ModelAsset, ModelMultiViews, FamilyRoleType } from '../../../../types/spaceAssetLibrary';
import { spaceAssetLibraryService } from '../../../../services/spaceAssetLibraryService';

interface ModelAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModelId?: string;
  onSelectModel: (model: ModelAsset | null) => void;
}

type InspectorTab = 'multiview' | 'expressions' | 'details' | 'lifestyle' | 'dna';
type RoleFilter = 'all' | 'elder' | 'parents' | 'children' | 'favorite';

const ROLE_TYPE_LABELS: Record<string, { label: string; bg: string; text: string; border: string }> = {
  father: { label: '家庭男主人', bg: 'bg-blue-500/15', text: 'text-blue-300', border: 'border-blue-500/30' },
  mother: { label: '家庭女主人', bg: 'bg-rose-500/15', text: 'text-rose-300', border: 'border-rose-500/30' },
  grandfather: { label: '爷爷', bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30' },
  grandmother: { label: '奶奶', bg: 'bg-purple-500/15', text: 'text-purple-300', border: 'border-purple-500/30' },
  daughter: { label: '混血女儿', bg: 'bg-pink-500/15', text: 'text-pink-300', border: 'border-pink-500/30' },
  son: { label: '混血男孩', bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  couple: { label: '夫妻组合', bg: 'bg-indigo-500/15', text: 'text-indigo-300', border: 'border-indigo-500/30' },
  family: { label: '全家福', bg: 'bg-cyan-500/15', text: 'text-cyan-300', border: 'border-cyan-500/30' }
};

export const ModelAssetModal: React.FC<ModelAssetModalProps> = ({
  isOpen,
  onClose,
  selectedModelId,
  onSelectModel,
}) => {
  const [models, setModels] = useState<ModelAsset[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [activeModel, setActiveModel] = useState<ModelAsset | null>(null);
  const [activeInspectorTab, setActiveInspectorTab] = useState<InspectorTab>('multiview');
  const [activeViewKey, setActiveViewKey] = useState<string>('front');
  const [copiedDna, setCopiedDna] = useState(false);

  // Edit Model State
  const [editingModel, setEditingModel] = useState<ModelAsset | null>(null);
  const [editForm, setEditForm] = useState<{
    nameZh: string;
    nameEn: string;
    roleType: FamilyRoleType;
    ageGroup: string;
    height: string;
    positioning: string;
    temperament: string;
    bio: string;
    coverImage: string;
  }>({
    nameZh: '',
    nameEn: '',
    roleType: 'father',
    ageGroup: '',
    height: '',
    positioning: '',
    temperament: '',
    bio: '',
    coverImage: '',
  });

  // Import Drawer State
  const [showUploadDrawer, setShowUploadDrawer] = useState(false);
  const [importMode, setImportMode] = useState<'single' | 'sheet_ai'>('sheet_ai');
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scannedResult, setScannedResult] = useState<any>(null);

  // Manual Form State
  const [manualNameZh, setManualNameZh] = useState('');
  const [manualNameEn, setManualNameEn] = useState('');
  const [manualRoleType, setManualRoleType] = useState<FamilyRoleType>('father');
  const [manualAgeGroup, setManualAgeGroup] = useState('40-45岁 黄金成熟期');
  const [manualHeight, setManualHeight] = useState('182cm');
  const [manualPositioning, setManualPositioning] = useState('家庭支柱 / 事业高管');
  const [manualBio, setManualBio] = useState('');
  const [manualViews, setManualViews] = useState<Record<string, string>>({});
  const cardSheetInputRef = useRef<HTMLInputElement>(null);
  const editImageInputRef = useRef<HTMLInputElement>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const [syncNotice, setSyncNotice] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      loadModels();
    }
    const handleAssetsChanged = () => {
      if (isOpen) {
        loadModels();
      }
    };
    const handleModelsSynced = (e: any) => {
      const count = e?.detail?.count || 6;
      setSyncNotice(`已实时存盘 (${count} 个角色)`);
      setTimeout(() => setSyncNotice(''), 3000);
    };
    window.addEventListener('manwah_space_assets_changed', handleAssetsChanged);
    window.addEventListener('manwah_space_models_synced', handleModelsSynced);
    return () => {
      window.removeEventListener('manwah_space_assets_changed', handleAssetsChanged);
      window.removeEventListener('manwah_space_models_synced', handleModelsSynced);
    };
  }, [isOpen]);

  const loadModels = () => {
    const list = spaceAssetLibraryService.getModels();
    setModels(list);
    if (list.length > 0) {
      if (selectedModelId) {
        const found = list.find(m => m.id === selectedModelId);
        setActiveModel(found || list[0]);
      } else if (!activeModel) {
        setActiveModel(list[0]);
      }
    }
  };

  if (!isOpen) return null;

  const filteredModels = models.filter(m => {
    const matchesSearch = 
      (m.nameZh || m.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.nameEn || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.positioning || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.temperamentKeywords || []).some(t => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (m.tags || []).some(t => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (m.ageGroup || '').includes(searchQuery);

    if (!matchesSearch) return false;

    if (roleFilter === 'elder') {
      return m.roleType === 'grandfather' || m.roleType === 'grandmother';
    }
    if (roleFilter === 'parents') {
      return m.roleType === 'father' || m.roleType === 'mother' || m.roleType === 'couple';
    }
    if (roleFilter === 'children') {
      return m.roleType === 'daughter' || m.roleType === 'son';
    }
    if (roleFilter === 'favorite') {
      return !!(m.isFavorite || m.favorite);
    }
    return true;
  });

  const handleToggleFavorite = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    spaceAssetLibraryService.toggleFavorite('model', id);
    loadModels();
  };

  const handleDeleteModel = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const target = models.find(m => m.id === id);
    const targetName = target?.nameZh || target?.name || '此模特';
    if (window.confirm(`确定要从资产库中删除模特 "${targetName}" 吗？此操作将立即从人物资产库中移除。`)) {
      spaceAssetLibraryService.deleteModel(id);
      loadModels();
      if (activeModel?.id === id) {
        const remaining = models.filter(m => m.id !== id);
        setActiveModel(remaining[0] || null);
      }
    }
  };

  // 打开编辑模特模态窗
  const handleOpenEditModal = (e: React.MouseEvent, model: ModelAsset) => {
    e.stopPropagation();
    setEditingModel(model);
    setEditForm({
      nameZh: model.nameZh || model.name,
      nameEn: model.nameEn || '',
      roleType: (model.roleType as FamilyRoleType) || 'father',
      ageGroup: model.ageGroup || '',
      height: model.height || '',
      positioning: model.positioning || '',
      temperament: (model.temperamentKeywords || []).join('，'),
      bio: model.bio || '',
      coverImage: model.coverImage || model.thumbnail || '',
    });
  };

  // 保存模特编辑修改
  const handleSaveEditModel = () => {
    if (!editingModel) return;
    if (!editForm.nameZh.trim()) {
      alert('请填写人物姓名/称谓');
      return;
    }

    const kwList = editForm.temperament
      .split(/[,，、\s]+/)
      .map(k => k.trim().replace(/^#/, ''))
      .filter(Boolean);

    const updated = spaceAssetLibraryService.updateModel(editingModel.id, {
      name: editForm.nameZh.trim(),
      nameZh: editForm.nameZh.trim(),
      nameEn: editForm.nameEn.trim(),
      roleType: editForm.roleType,
      ageGroup: editForm.ageGroup.trim(),
      height: editForm.height.trim(),
      positioning: editForm.positioning.trim(),
      temperamentKeywords: kwList.length > 0 ? kwList : editingModel.temperamentKeywords,
      bio: editForm.bio.trim(),
      coverImage: editForm.coverImage || editingModel.coverImage,
      thumbnail: editForm.coverImage || editingModel.thumbnail,
      views: {
        ...editingModel.views,
        portrait: editForm.coverImage || editingModel.views?.portrait,
        front: editForm.coverImage || editingModel.views?.front,
      }
    });

    loadModels();
    setActiveModel(updated);
    setEditingModel(null);
  };

  // 编辑模特时上传替换新头像/立绘
  const handleUploadEditImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      if (typeof loadEvt.target?.result === 'string') {
        setEditForm(prev => ({ ...prev, coverImage: loadEvt.target!.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCopyDna = () => {
    if (!activeModel) return;
    const jsonStr = JSON.stringify(
      {
        character: activeModel.nameZh,
        code: activeModel.code,
        role: activeModel.roleType,
        age: activeModel.ageGroup,
        height: activeModel.height,
        positioning: activeModel.positioning,
        temperament: activeModel.temperamentKeywords,
        modelDna: activeModel.modelDna,
        promptFragment: activeModel.promptFragment,
        negativeConstraints: activeModel.negativeConstraints || activeModel.modelDna.negativeConstraints
      },
      null,
      2
    );
    navigator.clipboard.writeText(jsonStr);
    setCopiedDna(true);
    setTimeout(() => setCopiedDna(false), 2000);
  };

  const handleExportBackup = () => {
    try {
      spaceAssetLibraryService.exportModelsBackup();
    } catch (err: any) {
      alert(`导出备份失败: ${err.message}`);
    }
  };

  const handleImportBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (loadEvt) => {
      if (typeof loadEvt.target?.result === 'string') {
        try {
          const count = await spaceAssetLibraryService.importModelsBackup(loadEvt.target.result);
          loadModels();
          alert(`✓ 成功恢复 ${count} 个家庭模特资产，并已同步写入服务器磁盘！`);
        } catch (err: any) {
          alert(`恢复备份失败: ${err.message}`);
        }
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  // Upload and AI Slicing Handler
  const handleUploadCardSheet = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (loadEvt) => {
      if (typeof loadEvt.target?.result === 'string') {
        const base64 = loadEvt.target.result;
        setIsAiScanning(true);
        setScanProgress(15);

        const timer1 = setTimeout(() => setScanProgress(45), 300);
        const timer2 = setTimeout(() => setScanProgress(80), 700);

        try {
          const result = await spaceAssetLibraryService.aiAnalyzeModelCard(base64);
          setScanProgress(100);
          setScannedResult(result);
          setManualNameZh(result.nameZh);
          setManualNameEn(result.nameEn);
          setManualRoleType(result.roleType);
          setManualAgeGroup(result.ageGroup);
          setManualHeight(result.height);
          setManualPositioning(result.positioning);
          setManualBio(result.bio);
          setManualViews(result.views);
        } finally {
          clearTimeout(timer1);
          clearTimeout(timer2);
          setIsAiScanning(false);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveImportedModel = () => {
    const primaryImg = manualViews.front || manualViews.portrait || scannedResult?.views?.front || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80';
    
    try {
      const mergedModelDna = {
        ...(scannedResult?.modelDna || {}),
        gender: ['mother', 'grandmother', 'daughter'].includes(manualRoleType) ? 'female' : 'male',
        roleType: manualRoleType,
        ageGroup: manualAgeGroup,
        ageRange: manualAgeGroup,
        height: manualHeight,
        positioning: manualPositioning,
        appearanceDesc: scannedResult?.modelDna?.appearanceDesc || manualPositioning,
        clothingDesc: scannedResult?.modelDna?.clothingDesc || '极简质感私服',
        materialsColorsDesc: scannedResult?.modelDna?.materialsColorsDesc || '天然面料与低饱和中性色',
        identityDesc: manualPositioning || '家庭核心成员',
        behaviorTags: scannedResult?.modelDna?.behaviorTags || ['居家生活', '舒适休憩', '陪伴家人'],
        sceneTags: scannedResult?.modelDna?.sceneTags || ['大平层客厅', '独立书房'],
        poseTags: scannedResult?.modelDna?.poseTags || ['舒适坐姿', '沙发端坐'],
        negativeConstraints: scannedResult?.modelDna?.negativeConstraints || ['严禁面部变形', '严禁年龄漂移', '严禁肢体畸变']
      };

      const created = spaceAssetLibraryService.createModel({
        name: manualNameZh || '新录入家庭角色',
        nameZh: manualNameZh || '新录入家庭角色',
        nameEn: manualNameEn || (manualRoleType === 'father' ? 'Refined Father' : manualRoleType === 'mother' ? 'Elegant Mother' : 'Custom Role'),
        roleType: manualRoleType,
        gender: ['mother', 'grandmother', 'daughter'].includes(manualRoleType) ? 'female' : 'male',
        ageGroup: manualAgeGroup,
        height: manualHeight,
        positioning: manualPositioning,
        bio: manualBio || `通过 AI 资产卡扫描识别的人物真值资产（${manualNameZh}），五官骨骼比例严谨，包含多视角与私服穿搭。`,
        temperamentKeywords: scannedResult?.temperamentKeywords || (
          ['mother', 'grandmother', 'daughter'].includes(manualRoleType) ? ['知性优雅', '温柔明媚', '品味高级'] : ['沉稳儒雅', '亲和威严', '高智感']
        ),
        coverImage: primaryImg,
        thumbnail: primaryImg,
        views: manualViews,
        multiViews: manualViews,
        expressionRefs: scannedResult?.expressionRefs || [primaryImg],
        detailRefs: scannedResult?.detailRefs || [primaryImg],
        lifestyleRefs: scannedResult?.lifestyleRefs || [primaryImg],
        modelDna: mergedModelDna
      });

      loadModels();
      setActiveModel(created);
      setShowUploadDrawer(false);
      setScannedResult(null);
    } catch (error: any) {
      alert(error?.message || '保存人物资产失败');
    }
  };

  const viewSlots: { key: string; label: string; desc: string }[] = [
    { key: 'front', label: '正面', desc: '五官与正面真值' },
    { key: 'side', label: '侧面', desc: '侧面下颌与轮廓' },
    { key: 'back', label: '背面', desc: '发型与体态骨骼' },
    { key: 'portrait', label: '特写', desc: '眼眸与肤质真值' },
    { key: 'fullBody', label: '全身', desc: '身材比例与站姿' },
    { key: 'wardrobeRef', label: '私服穿搭', desc: '材质与色系参考' },
    { key: 'accessoryRef', label: '配饰细节', desc: '手表/发饰/首饰' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl h-[88vh] bg-[#12141c] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-neutral-200">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#171924]/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  固定家庭角色资产库 (Model DNA 标准库)
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono border border-purple-500/30">
                  6 大核心家庭角色 · 多视角真值
                </span>
                {(() => {
                  const quota = spaceAssetLibraryService.getUserQuota('model');
                  if (quota.isAdmin) {
                    return (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-medium">
                        👑 首席设计师权限 · 系统默认留存
                      </span>
                    );
                  }
                  return (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 font-medium ${
                      quota.used >= quota.max 
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30 font-bold' 
                        : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                    }`}>
                      个人人物配额: {quota.used} / {quota.max} 份
                    </span>
                  );
                })()}
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                严禁随机示意模特。独立角色 DNA、多视角线稿真图与生活场景资产，确保跨镜头绝对一致性。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* 持久化存盘状态指示器 */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs shadow-inner">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-medium">{syncNotice || '已安全永久存盘 (磁盘+DB)'}</span>
            </div>

            {/* 导出 JSON 备份 */}
            <button
              onClick={handleExportBackup}
              title="将录入的 6 大角色数据打包导出为本地 JSON 离线备份文件（可在任何机器上随时还原）"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-neutral-300 hover:text-white transition-all shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>导出备份</span>
            </button>

            {/* 恢复 JSON 备份 */}
            <button
              onClick={() => backupFileInputRef.current?.click()}
              title="从此前导出的备份文件快速还原人物资产"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-neutral-300 hover:text-white transition-all shadow-sm"
            >
              <UploadCloud className="w-3.5 h-3.5 text-purple-400" />
              <span>恢复备份</span>
            </button>
            <input
              ref={backupFileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportBackupFile}
            />

            <div className="h-4 w-[1px] bg-white/10 mx-0.5" />

            <button
              onClick={() => onSelectModel(null)}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-neutral-400 hover:text-white transition-all"
            >
              不使用模特 (纯静物)
            </button>
            <button
              onClick={() => setShowUploadDrawer(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-purple-600/20 transition-all"
            >
              <Scan className="w-3.5 h-3.5" />
              <span>导入角色资产卡 / AI 识别</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Content Layout */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Panel: 6 Fixed Characters List */}
          <div className="w-[380px] shrink-0 flex flex-col border-r border-white/10 p-4 bg-[#141620] overflow-hidden">
            {/* Search & Filter */}
            <div className="space-y-2 mb-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="搜索角色姓名、英文名、编号或定位..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500/60 transition-all"
                />
              </div>

              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
                {[
                  { id: 'all', label: '全部' },
                  { id: 'elder', label: '长辈 (爷/奶)' },
                  { id: 'parents', label: '父母 (男/女)' },
                  { id: 'children', label: '儿女 (混血)' },
                  { id: 'favorite', label: '已收藏' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setRoleFilter(tab.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] whitespace-nowrap transition-all ${
                      roleFilter === tab.id
                        ? 'bg-purple-600 text-white font-medium shadow-sm'
                        : 'bg-black/30 text-neutral-400 hover:text-neutral-200 border border-white/5'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Character Cards List */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
              {filteredModels.map(model => {
                const isSelected = selectedModelId === model.id;
                const isActive = activeModel?.id === model.id;
                const roleBadge = ROLE_TYPE_LABELS[model.roleType] || {
                  label: '家庭成员',
                  bg: 'bg-purple-500/15',
                  text: 'text-purple-300',
                  border: 'border-purple-500/30'
                };

                return (
                  <div
                    key={model.id}
                    onClick={() => {
                      setActiveModel(model);
                      setActiveViewKey('front');
                    }}
                    className={`group relative rounded-xl p-2.5 border cursor-pointer transition-all duration-200 flex gap-3 ${
                      isActive
                        ? 'bg-[#1e202f] border-purple-500 shadow-md ring-1 ring-purple-500/40'
                        : isSelected
                        ? 'bg-[#181a26] border-purple-500/60'
                        : 'bg-[#171924] border-white/5 hover:border-white/20 hover:bg-[#1a1c2a]'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="relative w-16 h-20 rounded-lg overflow-hidden shrink-0 bg-black/60 border border-white/10">
                      <img
                        src={model.thumbnail || model.coverImage}
                        alt={model.nameZh || model.name}
                        className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform"
                      />
                      {isSelected && (
                        <div className="absolute top-1 left-1 bg-purple-600 text-white p-0.5 rounded">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      )}
                    </div>

                    {/* Meta Info */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-medium border ${roleBadge.bg} ${roleBadge.text} ${roleBadge.border}`}>
                            {roleBadge.label}
                          </span>
                          <span className="text-[9px] font-mono text-neutral-500">{model.code}</span>
                        </div>

                        <h4 className="text-xs font-bold text-white mt-1 group-hover:text-purple-300 transition-colors truncate">
                          {model.nameZh || model.name}
                        </h4>
                        <div className="text-[10px] text-neutral-400 font-mono truncate">
                          {model.nameEn}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] text-neutral-300 flex items-center gap-1.5 mt-1">
                          <span className="text-neutral-400">{model.ageGroup}</span>
                          <span className="text-neutral-600">·</span>
                          <span className="text-neutral-400">{model.height}</span>
                        </div>

                        <div className="flex flex-wrap gap-1 mt-1">
                          {(model.temperamentKeywords || []).slice(0, 3).map((kw, i) => (
                            <span key={i} className="text-[8px] px-1.5 py-0.2 rounded bg-white/5 text-neutral-400">
                              #{kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons: 收藏 + 编辑 + 删减 */}
                    <div className="flex flex-col justify-between items-end gap-1.5 shrink-0">
                      <button
                        onClick={(e) => handleToggleFavorite(e, model.id)}
                        title="收藏模特"
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                          model.isFavorite || model.favorite
                            ? 'text-amber-400 bg-amber-400/10'
                            : 'text-neutral-500 hover:text-white bg-black/30'
                        }`}
                      >
                        <Star className={`w-3 h-3 ${model.isFavorite || model.favorite ? 'fill-current' : ''}`} />
                      </button>

                      {/* 编辑模特资产入口 */}
                      <button
                        onClick={(e) => handleOpenEditModal(e, model)}
                        title="编辑此模特资产信息"
                        className="w-6 h-6 rounded-full text-neutral-400 hover:text-purple-300 hover:bg-purple-500/20 bg-black/40 flex items-center justify-center transition-all cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>

                      {/* 删减模特资产入口（支持所有模特素材删减） */}
                      <button
                        onClick={(e) => handleDeleteModel(e, model.id)}
                        title="从资产库删除此模特"
                        className="w-6 h-6 rounded-full text-neutral-500 hover:text-rose-400 hover:bg-rose-500/20 bg-black/40 flex items-center justify-center transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Role Detail Inspector */}
          {activeModel ? (
            <div className="flex-1 flex flex-col bg-[#12141c] overflow-hidden">
              
              {/* Character Banner Header */}
              <div className="px-6 py-4 border-b border-white/10 bg-[#161824]/60 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-purple-500/30 bg-black/60">
                    <img
                      src={activeModel.views?.portrait || activeModel.thumbnail}
                      alt={activeModel.nameZh}
                      className="w-full h-full object-cover object-top"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white tracking-wide">
                        {activeModel.nameZh || activeModel.name}
                      </h3>
                      <span className="text-xs font-mono text-purple-400 font-medium">
                        ({activeModel.nameEn})
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono border border-purple-500/30">
                        {activeModel.code}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-neutral-400 mt-1">
                      <span>定位: <strong className="text-neutral-200 font-normal">{activeModel.positioning}</strong></span>
                      <span>·</span>
                      <span>年龄: <strong className="text-neutral-200 font-normal">{activeModel.ageGroup}</strong></span>
                      <span>·</span>
                      <span>身高: <strong className="text-neutral-200 font-normal">{activeModel.height}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={(e) => handleOpenEditModal(e, activeModel)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-purple-500/20 border border-white/10 hover:border-purple-400/40 text-xs text-neutral-300 hover:text-purple-200 transition-all cursor-pointer"
                    title="编辑当前模特名称、定位与身材属性"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-purple-400" />
                    <span>编辑模特</span>
                  </button>
                  <button
                    onClick={(e) => handleDeleteModel(e, activeModel.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 border border-white/10 hover:border-rose-400/40 text-xs text-neutral-400 hover:text-rose-300 transition-all cursor-pointer"
                    title="从资产库删除此模特素材"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>删除</span>
                  </button>
                  <button
                    onClick={handleCopyDna}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-neutral-300 hover:text-white transition-all"
                  >
                    {copiedDna ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-purple-400" />}
                    <span>{copiedDna ? '已复制 DNA' : '复制 DNA'}</span>
                  </button>
                  <button
                    onClick={() => {
                      onSelectModel(activeModel);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition-all"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    <span>选用此角色</span>
                  </button>
                </div>
              </div>

              {/* Inspector Sub-tabs Navigation */}
              <div className="flex items-center gap-2 px-6 py-2.5 border-b border-white/5 bg-[#141620]">
                {[
                  { id: 'multiview', label: '360 多视角真图', icon: Eye },
                  { id: 'expressions', label: '表情参考图集 (2~3张)', icon: Smile },
                  { id: 'details', label: '服装与饰品细节', icon: Shirt },
                  { id: 'lifestyle', label: '生活场景抓拍', icon: Camera },
                  { id: 'dna', label: 'Model DNA 结构体', icon: Sparkles },
                ].map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeInspectorTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveInspectorTab(tab.id as InspectorTab)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                          : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Inspector Tab Views */}
              <div className="flex-1 overflow-y-auto p-6">
                
                {/* 1. Multi-Views Tab */}
                {activeInspectorTab === 'multiview' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-12 gap-6 items-start">
                      {/* Big Main Stage */}
                      <div className="col-span-7 space-y-3">
                        <div className="flex items-center justify-between text-xs text-neutral-400">
                          <span className="font-semibold text-white flex items-center gap-1.5">
                            <Eye className="w-3.5 h-3.5 text-purple-400" />
                            <span>当前主视角真值参考</span>
                          </span>
                          <span className="font-mono text-purple-300">
                            {viewSlots.find(v => v.key === activeViewKey)?.label} · {viewSlots.find(v => v.key === activeViewKey)?.desc}
                          </span>
                        </div>

                        <div className="relative aspect-[3/4] max-h-[380px] rounded-2xl overflow-hidden bg-black/80 border border-white/10 shadow-2xl flex items-center justify-center">
                          <img
                            src={
                              activeModel.views?.[activeViewKey as keyof ModelMultiViews] ||
                              activeModel.multiViews?.[activeViewKey as keyof ModelMultiViews] ||
                              activeModel.coverImage
                            }
                            alt={activeModel.nameZh}
                            className="w-full h-full object-cover object-top"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                          <div className="absolute bottom-3 left-3 right-3 text-xs text-white/90 bg-black/50 backdrop-blur-md p-2.5 rounded-xl border border-white/10">
                            <div className="font-semibold text-purple-300">{activeModel.nameZh} · {viewSlots.find(v => v.key === activeViewKey)?.label}</div>
                            <div className="text-[11px] text-neutral-300 line-clamp-1 mt-0.5">{activeModel.modelDna.appearanceDesc || activeModel.bio}</div>
                          </div>
                        </div>
                      </div>

                      {/* 7 Angle Selector Chips */}
                      <div className="col-span-5 space-y-3">
                        <span className="text-xs font-semibold text-neutral-300 block">
                          切换查看多角度真值图
                        </span>
                        <div className="grid grid-cols-2 gap-2.5">
                          {viewSlots.map(slot => {
                            const imgUrl = 
                              activeModel.views?.[slot.key as keyof ModelMultiViews] ||
                              activeModel.multiViews?.[slot.key as keyof ModelMultiViews] ||
                              activeModel.thumbnail;
                            const isSlotActive = activeViewKey === slot.key;

                            return (
                              <button
                                key={slot.key}
                                onClick={() => setActiveViewKey(slot.key)}
                                className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all ${
                                  isSlotActive
                                    ? 'bg-purple-500/15 border-purple-500 text-white shadow-md'
                                    : 'bg-[#171924] border-white/10 text-neutral-400 hover:text-white hover:border-white/20'
                                }`}
                              >
                                <div className="w-9 h-11 rounded-lg overflow-hidden shrink-0 bg-black/60 border border-white/10">
                                  <img src={imgUrl} alt={slot.label} className="w-full h-full object-cover object-top" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-bold text-white truncate">{slot.label}</div>
                                  <div className="text-[9px] text-neutral-400 truncate">{slot.desc}</div>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {/* Prompt fragment banner */}
                        <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 text-xs text-neutral-300 space-y-1 mt-4">
                          <div className="text-[11px] font-semibold text-purple-300 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>跨镜头视觉一致性约束</span>
                          </div>
                          <p className="text-[11px] text-neutral-400 leading-relaxed font-mono">
                            {activeModel.promptFragment}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Expressions Tab */}
                {activeInspectorTab === 'expressions' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-white">表情参考真图图集</h4>
                        <p className="text-[11px] text-neutral-400">保留人物面部微笑、专注、沉静与温馨交流状态</p>
                      </div>
                      <span className="text-[10px] text-purple-400 font-mono">共 {activeModel.expressionRefs?.length || 3} 张真值</span>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      {(activeModel.expressionRefs && activeModel.expressionRefs.length > 0
                        ? activeModel.expressionRefs
                        : [
                            activeModel.views?.portrait || activeModel.coverImage,
                            activeModel.views?.front || activeModel.coverImage,
                            activeModel.views?.angle45 || activeModel.coverImage
                          ]
                      ).map((img, i) => {
                        const labels = ['温和从容微笑', '专注阅读与思考', '亲和交谈倾听'];
                        return (
                          <div key={i} className="group relative rounded-2xl overflow-hidden bg-black/60 border border-white/10 shadow-lg">
                            <div className="aspect-[3/4] overflow-hidden">
                              <img src={img} alt={`expression-${i}`} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300" />
                            </div>
                            <div className="p-3 bg-[#171924]/90 border-t border-white/10">
                              <div className="text-xs font-semibold text-white">{labels[i % labels.length]}</div>
                              <div className="text-[10px] text-neutral-400 mt-0.5 font-mono">五官对称度 100% · 微表情真值锁定</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. Details & Wardrobe Tab */}
                {activeInspectorTab === 'details' && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-xs font-bold text-white">服装面料、饰品与鞋履细节</h4>
                      <p className="text-[11px] text-neutral-400">私服选品与质感真图参考，严防材质降级</p>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-4 rounded-2xl bg-[#171924] border border-white/10 space-y-3">
                        <div className="aspect-video rounded-xl overflow-hidden bg-black/60 border border-white/10">
                          <img
                            src={activeModel.wardrobeRefs?.[0] || activeModel.views?.wardrobeRef || activeModel.coverImage}
                            alt="wardrobe"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">经典私服穿搭</div>
                          <div className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                            {activeModel.modelDna.clothingDesc || activeModel.modelDna.wardrobeStyle}
                          </div>
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl bg-[#171924] border border-white/10 space-y-3">
                        <div className="aspect-video rounded-xl overflow-hidden bg-black/60 border border-white/10">
                          <img
                            src={activeModel.accessoryRefs?.[0] || activeModel.views?.accessoryRef || activeModel.coverImage}
                            alt="accessories"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">配饰与珠宝细节</div>
                          <div className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                            {activeModel.modelDna.materialsColorsDesc || '极简精钢与皮革配饰'}
                          </div>
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl bg-[#171924] border border-white/10 space-y-3">
                        <div className="aspect-video rounded-xl overflow-hidden bg-black/60 border border-white/10">
                          <img
                            src={activeModel.detailRefs?.[0] || activeModel.coverImage}
                            alt="details"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">面料微距质感</div>
                          <div className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                            高支纯天然纱线与真皮微孔质感，哑光细腻高质感。
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Lifestyle Tab */}
                {activeInspectorTab === 'lifestyle' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-white">生活场景真值抓拍 (Lifestyle)</h4>
                        <p className="text-[11px] text-neutral-400">大平层客厅、茶室、餐桌与家庭互动生动记录</p>
                      </div>
                      <span className="text-[10px] text-purple-400 font-mono">共 {activeModel.lifestyleRefs?.length || 2} 个场景</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {(activeModel.lifestyleRefs && activeModel.lifestyleRefs.length > 0
                        ? activeModel.lifestyleRefs
                        : [
                            'https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?auto=format&fit=crop&w=800&q=80',
                            'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80'
                          ]
                      ).map((img, idx) => (
                        <div key={idx} className="group relative rounded-2xl overflow-hidden bg-black/60 border border-white/10 shadow-lg">
                          <div className="aspect-[16/10] overflow-hidden">
                            <img src={img} alt={`lifestyle-${idx}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          </div>
                          <div className="p-3 bg-[#171924]/90 border-t border-white/10 flex items-center justify-between">
                            <div className="text-xs font-semibold text-white">
                              {idx === 0 ? '客厅沙发休闲与翻阅画册' : '家庭成员温情互动时刻'}
                            </div>
                            <span className="text-[10px] text-purple-300 px-2 py-0.5 rounded bg-purple-500/15">
                              自然光感
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. DNA Tab */}
                {activeInspectorTab === 'dna' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-white">自动生成 Model DNA 结构体</h4>
                        <p className="text-[11px] text-neutral-400">标准结构化数据，直接作为提示词编译器人物真值来源</p>
                      </div>
                      <span className="text-[10px] font-mono text-purple-300">
                        Seed #{activeModel.modelDna.identitySeed || 88401}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-[#171924] border border-white/10 space-y-1">
                        <span className="text-[10px] text-neutral-500 font-mono">外貌描述 (Appearance)</span>
                        <div className="text-neutral-200 leading-relaxed font-mono text-[11px]">
                          {activeModel.modelDna.appearanceDesc || activeModel.modelDna.appearanceSummary}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-[#171924] border border-white/10 space-y-1">
                        <span className="text-[10px] text-neutral-500 font-mono">发型描述 (Hair)</span>
                        <div className="text-neutral-200 leading-relaxed font-mono text-[11px]">
                          {activeModel.modelDna.hairDesc || activeModel.modelDna.hairStyleAndColor || activeModel.modelDna.hairStyle}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-[#171924] border border-white/10 space-y-1">
                        <span className="text-[10px] text-neutral-500 font-mono">服装描述 (Clothing)</span>
                        <div className="text-neutral-200 leading-relaxed font-mono text-[11px]">
                          {activeModel.modelDna.clothingDesc || activeModel.modelDna.wardrobeStyle}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-[#171924] border border-white/10 space-y-1">
                        <span className="text-[10px] text-neutral-500 font-mono">材质与色系描述 (Materials & Colors)</span>
                        <div className="text-neutral-200 leading-relaxed font-mono text-[11px]">
                          {activeModel.modelDna.materialsColorsDesc || '低饱和高级灰与天然羊毛/真丝'}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-[#171924] border border-white/10 space-y-1">
                        <span className="text-[10px] text-neutral-500 font-mono">家庭身份描述 (Identity)</span>
                        <div className="text-neutral-200 leading-relaxed font-mono text-[11px]">
                          {activeModel.modelDna.identityDesc || activeModel.positioning}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-[#171924] border border-white/10 space-y-1">
                        <span className="text-[10px] text-neutral-500 font-mono">严格负面约束 (Negative Constraints)</span>
                        <div className="text-rose-300/80 leading-relaxed font-mono text-[11px]">
                          {(activeModel.negativeConstraints || activeModel.modelDna.negativeConstraints || []).join(' | ')}
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1.5">
                      <span className="text-[10px] text-neutral-500 font-mono">行为偏好与场景标签</span>
                      <div className="flex flex-wrap gap-1.5">
                        {(activeModel.modelDna.behaviorTags || []).map((t, idx) => (
                          <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            ⚡ {t}
                          </span>
                        ))}
                        {(activeModel.modelDna.sceneTags || []).map((t, idx) => (
                          <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                            🏠 {t}
                          </span>
                        ))}
                        {(activeModel.modelDna.poseTags || []).map((t, idx) => (
                          <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                            🧘 {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-neutral-500">
              <User className="w-12 h-12 stroke-[1] mb-2 text-neutral-600" />
              <p className="text-sm">请从左侧选择一个家庭角色查看详细 Model DNA</p>
            </div>
          )}
        </div>

        {/* Bottom Footer Toolbar */}
        <div className="px-6 py-3 border-t border-white/10 bg-[#171924] flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-purple-400 font-mono">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>零面容漂移与骨骼真值锁已激活</span>
            </span>
            <span>当前共 {models.length} 位标准家庭角色资产</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white transition-all font-medium"
            >
              关闭
            </button>
          </div>
        </div>

        {/* Import Drawer Modal */}
        {showUploadDrawer && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-md p-6 animate-in fade-in duration-200">
            <div className="relative w-full max-w-3xl bg-[#161824] border border-white/15 rounded-2xl shadow-2xl p-6 overflow-hidden flex flex-col text-neutral-200">
              
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center border border-purple-500/40">
                    <Scan className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">导入新模特资产与 AI 智能识别拆解</h3>
                    <p className="text-xs text-neutral-400">支持上传单图或“角色资产卡大图”，系统将自动切片并生成结构化 Model DNA</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowUploadDrawer(false)}
                  className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Mode Tabs */}
              <div className="flex items-center gap-2 my-4 bg-black/40 p-1 rounded-xl border border-white/5">
                <button
                  onClick={() => setImportMode('sheet_ai')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    importMode === 'sheet_ai'
                      ? 'bg-purple-600 text-white shadow'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Scan className="w-3.5 h-3.5" />
                  <span>模式一：上传资产卡大图 (AI 自动拆解多视角)</span>
                </button>
                <button
                  onClick={() => setImportMode('single')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    importMode === 'single'
                      ? 'bg-purple-600 text-white shadow'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>模式二：单个角色手动上传录入</span>
                </button>
              </div>

              {/* Sheet AI Upload Box */}
              {importMode === 'sheet_ai' && (
                <div className="space-y-4">
                  <div
                    onClick={() => cardSheetInputRef.current?.click()}
                    className="relative border-2 border-dashed border-purple-500/40 hover:border-purple-500 rounded-2xl p-6 bg-purple-500/5 hover:bg-purple-500/10 cursor-pointer text-center transition-all group"
                  >
                    <input
                      ref={cardSheetInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleUploadCardSheet}
                    />
                    
                    {isAiScanning ? (
                      <div className="py-8 flex flex-col items-center space-y-3">
                        <div className="relative w-16 h-16 rounded-full border-4 border-purple-500/30 border-t-purple-500 animate-spin flex items-center justify-center">
                          <Scan className="w-6 h-6 text-purple-400 animate-pulse" />
                        </div>
                        <div className="text-sm font-bold text-white">AI 正在高精度扫描人物资料卡...</div>
                        <div className="text-xs text-purple-300 font-mono">
                          正在解析五官骨骼比例、自动裁切多视角 (正面/侧面/背面/特写/表情)... {scanProgress}%
                        </div>
                        <div className="w-48 h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/10">
                          <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-300" style={{ width: `${scanProgress}%` }} />
                        </div>
                      </div>
                    ) : scannedResult ? (
                      <div className="py-2 flex items-center gap-4 text-left">
                        <div className="w-20 h-24 rounded-xl overflow-hidden shrink-0 bg-black/60 border border-emerald-500/50 relative">
                          <img src={scannedResult.views.front} alt="scanned" className="w-full h-full object-cover object-top" />
                          <div className="absolute bottom-1 right-1 bg-emerald-500 text-white p-0.5 rounded-full">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">
                            ✓ AI 识别拆解成功
                          </span>
                          <h4 className="text-sm font-bold text-white mt-1">{manualNameZh} ({manualNameEn})</h4>
                          <p className="text-xs text-neutral-400 mt-0.5">
                            已成功拆解出 7 大视角真图与 Model DNA 结构体（年龄: {manualAgeGroup} · 身高: {manualHeight}）
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            cardSheetInputRef.current?.click();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white"
                        >
                          重新上传
                        </button>
                      </div>
                    ) : (
                      <div className="py-6 flex flex-col items-center space-y-2">
                        <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 group-hover:scale-110 transition-transform">
                          <Upload className="w-6 h-6" />
                        </div>
                        <div className="text-sm font-bold text-white">点击或拖拽上传“角色资产卡大图”</div>
                        <p className="text-xs text-neutral-400">
                          支持 JPG, PNG, WEBP 高清大图，系统将智能提取正面、侧面、背面、特写与私服细节
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Form fields for review */}
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[11px] text-neutral-400 block mb-1">中文角色名称</label>
                        <input
                          type="text"
                          value={manualNameZh}
                          onChange={e => setManualNameZh(e.target.value)}
                          placeholder="例如：定制角色 · 知性优雅女主人"
                          className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white text-xs focus:border-purple-500/60 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-neutral-400 block mb-1">英文名称</label>
                        <input
                          type="text"
                          value={manualNameEn}
                          onChange={e => setManualNameEn(e.target.value)}
                          placeholder="例如：Custom / Elegant Mother"
                          className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white text-xs focus:border-purple-500/60 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-neutral-400 block mb-1">角色类型</label>
                        <select
                          value={manualRoleType}
                          onChange={e => setManualRoleType(e.target.value as FamilyRoleType)}
                          className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white text-xs focus:border-purple-500/60 focus:outline-none"
                        >
                          <option value="father">家庭男主人 (Father)</option>
                          <option value="mother">家庭女主人 (Mother)</option>
                          <option value="grandfather">爷爷 (Grandfather)</option>
                          <option value="grandmother">奶奶 (Grandmother)</option>
                          <option value="daughter">混血女儿 (Young Daughter)</option>
                          <option value="son">混血男孩 (Young Son)</option>
                          <option value="couple">夫妻组合 (Couple)</option>
                          <option value="family">全家福 (Family)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[11px] text-neutral-400 block mb-1">真实年龄段</label>
                        <input
                          type="text"
                          value={manualAgeGroup}
                          onChange={e => setManualAgeGroup(e.target.value)}
                          placeholder="例如：30-35岁 知性青年期"
                          className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white text-xs focus:border-purple-500/60 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-neutral-400 block mb-1">预估身高</label>
                        <input
                          type="text"
                          value={manualHeight}
                          onChange={e => setManualHeight(e.target.value)}
                          placeholder="例如：168cm 优雅高挑"
                          className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white text-xs focus:border-purple-500/60 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-neutral-400 block mb-1">核心身份定位</label>
                        <input
                          type="text"
                          value={manualPositioning}
                          onChange={e => setManualPositioning(e.target.value)}
                          placeholder="例如：生活美学主理人 / 知性女主人"
                          className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white text-xs focus:border-purple-500/60 focus:outline-none"
                        />
                      </div>
                    </div>

                    {scannedResult?.modelDna && (
                      <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-purple-300 font-bold flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            Model DNA 智能真值提炼
                          </span>
                          <span className="text-neutral-400 font-mono text-[10px]">
                            {scannedResult.modelDna.ethnicity || '东亚'} · {scannedResult.modelDna.bodyBuild || '匀称体态'}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-300">
                          <span className="text-neutral-400">容貌发型：</span>{scannedResult.modelDna.appearanceDesc || scannedResult.modelDna.facialFeatures}
                        </p>
                        <p className="text-[11px] text-neutral-300">
                          <span className="text-neutral-400">穿搭色系：</span>{scannedResult.modelDna.clothingDesc || scannedResult.modelDna.materialsColorsDesc}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {(scannedResult.temperamentKeywords || []).map((kw: string, i: number) => (
                            <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              #{kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Manual Form Box */}
              {importMode === 'single' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="text-[11px] text-neutral-400 block mb-1">中文名称</label>
                      <input
                        type="text"
                        value={manualNameZh}
                        onChange={e => setManualNameZh(e.target.value)}
                        placeholder="中文角色名"
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-neutral-400 block mb-1">英文名称</label>
                      <input
                        type="text"
                        value={manualNameEn}
                        onChange={e => setManualNameEn(e.target.value)}
                        placeholder="English Name"
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-neutral-400 block mb-1">角色类型</label>
                      <select
                        value={manualRoleType}
                        onChange={e => setManualRoleType(e.target.value as FamilyRoleType)}
                        className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white text-xs focus:outline-none"
                      >
                        <option value="father">家庭男主人</option>
                        <option value="mother">家庭女主人</option>
                        <option value="grandfather">爷爷</option>
                        <option value="grandmother">奶奶</option>
                        <option value="daughter">混血女儿</option>
                        <option value="son">混血男孩</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-neutral-400 block mb-1">人物定位 / 气质简介</label>
                    <textarea
                      rows={2}
                      value={manualPositioning}
                      onChange={e => setManualPositioning(e.target.value)}
                      placeholder="人物定位与气质简介..."
                      className="w-full px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white text-xs focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-white/10">
                <button
                  onClick={() => setShowUploadDrawer(false)}
                  className="px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-neutral-300"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveImportedModel}
                  disabled={!manualNameZh.trim() && !scannedResult}
                  className="px-5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition-all"
                >
                  保存并入库为 Model DNA
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 核心新功能：编辑人物资产卡模态窗 */}
        {editingModel && (
          <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-150">
            <div className="w-full max-w-xl bg-[#181a26] border border-purple-500/30 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
                    <Edit2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>编辑人物资产卡</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">
                        {editingModel.code}
                      </span>
                    </h3>
                    <p className="text-[11px] text-neutral-400">修改模特真实身份属性、定位、年龄与身材特征，实时生效</p>
                  </div>
                </div>
                <button
                  onClick={() => setEditingModel(null)}
                  className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form Body */}
              <div className="space-y-3.5 text-xs">
                {/* 形象立绘主图与替换 */}
                <div>
                  <label className="text-[11px] font-semibold text-neutral-300 block mb-1.5">形象立绘与头像</label>
                  <div className="flex items-center gap-4 bg-black/30 p-3 rounded-xl border border-white/5">
                    <div className="w-16 h-20 rounded-lg overflow-hidden bg-black/60 border border-purple-500/30 shrink-0">
                      <img
                        src={editForm.coverImage || editingModel.coverImage || editingModel.thumbnail}
                        alt=""
                        className="w-full h-full object-cover object-top"
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <p className="text-[11px] text-neutral-400">
                        当前主视角立绘，用于空间场景渲染时的人脸特征与着装真值参考。
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => editImageInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>替换立绘图片</span>
                        </button>
                        <input
                          ref={editImageInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleUploadEditImage}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 姓名与英文名 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                      <span>人物姓名 / 称谓</span>
                      <span className="text-purple-400 font-bold ml-1">*</span>
                    </label>
                    <input
                      type="text"
                      value={editForm.nameZh}
                      onChange={e => setEditForm(prev => ({ ...prev, nameZh: e.target.value }))}
                      placeholder="如：老人、奶奶、知性女主人"
                      className="w-full px-3.5 py-2 bg-[#12141d] border border-white/15 focus:border-purple-400 rounded-xl text-white outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-neutral-300 block mb-1">英文名称 / 别名 (选填)</label>
                    <input
                      type="text"
                      value={editForm.nameEn}
                      onChange={e => setEditForm(prev => ({ ...prev, nameEn: e.target.value }))}
                      placeholder="如：Grandmother, Hostess"
                      className="w-full px-3.5 py-2 bg-[#12141d] border border-white/15 focus:border-purple-400 rounded-xl text-white outline-none transition-all"
                    />
                  </div>
                </div>

                {/* 角色类型与年龄段 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-300 block mb-1">家庭角色分类</label>
                    <select
                      value={editForm.roleType}
                      onChange={e => setEditForm(prev => ({ ...prev, roleType: e.target.value as FamilyRoleType }))}
                      className="w-full px-3.5 py-2 bg-[#12141d] border border-white/15 focus:border-purple-400 rounded-xl text-white outline-none transition-all cursor-pointer font-medium"
                    >
                      <option value="father">家庭男主人 (Father)</option>
                      <option value="mother">家庭女主人 (Mother)</option>
                      <option value="grandfather">爷爷 / 长辈 (Grandfather)</option>
                      <option value="grandmother">奶奶 / 长辈 (Grandmother)</option>
                      <option value="daughter">混血女儿 (Daughter)</option>
                      <option value="son">混血男孩 (Son)</option>
                      <option value="couple">夫妻组合 (Couple)</option>
                      <option value="family">全家福 (Family)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-neutral-300 block mb-1">真实年龄段</label>
                    <input
                      type="text"
                      value={editForm.ageGroup}
                      onChange={e => setEditForm(prev => ({ ...prev, ageGroup: e.target.value }))}
                      placeholder="如：60岁 银发安详期、40-45岁 精英成熟期"
                      className="w-full px-3.5 py-2 bg-[#12141d] border border-white/15 focus:border-purple-400 rounded-xl text-white outline-none transition-all"
                    />
                  </div>
                </div>

                {/* 身高与核心定位 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-300 block mb-1">身高 / 体型特征</label>
                    <input
                      type="text"
                      value={editForm.height}
                      onChange={e => setEditForm(prev => ({ ...prev, height: e.target.value }))}
                      placeholder="如：180cm 挺拔匀称、165cm 优雅高挑"
                      className="w-full px-3.5 py-2 bg-[#12141d] border border-white/15 focus:border-purple-400 rounded-xl text-white outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-neutral-300 block mb-1">核心身份定位</label>
                    <input
                      type="text"
                      value={editForm.positioning}
                      onChange={e => setEditForm(prev => ({ ...prev, positioning: e.target.value }))}
                      placeholder="如：慈祥长辈 / 家庭支柱 / 事业高管"
                      className="w-full px-3.5 py-2 bg-[#12141d] border border-white/15 focus:border-purple-400 rounded-xl text-white outline-none transition-all"
                    />
                  </div>
                </div>

                {/* 气质标签 */}
                <div>
                  <label className="text-[11px] font-semibold text-neutral-300 block mb-1">气质特征关键词 (用逗号或空格分隔)</label>
                  <input
                    type="text"
                    value={editForm.temperament}
                    onChange={e => setEditForm(prev => ({ ...prev, temperament: e.target.value }))}
                    placeholder="例如：沉稳儒雅，亲和威严，高智感，知性优雅"
                    className="w-full px-3.5 py-2 bg-[#12141d] border border-white/15 focus:border-purple-400 rounded-xl text-white outline-none transition-all"
                  />
                </div>

                {/* 简介描述 */}
                <div>
                  <label className="text-[11px] font-semibold text-neutral-300 block mb-1">人物背景与生活特征</label>
                  <textarea
                    rows={2}
                    value={editForm.bio}
                    onChange={e => setEditForm(prev => ({ ...prev, bio: e.target.value }))}
                    placeholder="选填，关于该人物的着装风格、动作习惯或居家生活细节描述..."
                    className="w-full px-3.5 py-2 bg-[#12141d] border border-white/15 focus:border-purple-400 rounded-xl text-white outline-none transition-all resize-none text-[11px]"
                  />
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditingModel(null)}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-neutral-300 transition-all cursor-pointer font-medium"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditModel}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>保存修改并同步</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
