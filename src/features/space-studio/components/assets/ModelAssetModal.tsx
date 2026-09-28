import React, { useState, useEffect } from 'react';
import { 
  X, Search, User, Sparkles, Star, Plus, Check, 
  Trash2, Upload, Eye, Sliders, RefreshCw, AlertCircle, Shirt
} from 'lucide-react';
import { ModelAsset, ModelMultiViews } from '../../../../types/spaceAssetLibrary';
import { spaceAssetLibraryService } from '../../../../services/spaceAssetLibraryService';

interface ModelAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModelId?: string;
  onSelectModel: (model: ModelAsset | null) => void;
}

export const ModelAssetModal: React.FC<ModelAssetModalProps> = ({
  isOpen,
  onClose,
  selectedModelId,
  onSelectModel,
}) => {
  const [models, setModels] = useState<ModelAsset[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'female' | 'male' | 'couple' | 'family'>('all');
  const [activeModel, setActiveModel] = useState<ModelAsset | null>(null);
  const [activeViewKey, setActiveViewKey] = useState<keyof ModelMultiViews>('front');
  const [showUploadDrawer, setShowUploadDrawer] = useState(false);

  // Upload model form state
  const [newName, setNewName] = useState('');
  const [newGender, setNewGender] = useState<'female' | 'male' | 'couple' | 'family'>('female');
  const [newAgeGroup, setNewAgeGroup] = useState('28-35岁 青年高管');
  const [newOutfitStyle, setNewOutfitStyle] = useState('极简羊绒与米白丝绸家居私服');
  const [newViews, setNewViews] = useState<ModelMultiViews>({});
  const [isDnaInferring, setIsDnaInferring] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadModels();
    }
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
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
      m.ageGroup.includes(searchQuery);
    const matchesGender = genderFilter === 'all' || m.gender === genderFilter;
    return matchesSearch && matchesGender;
  });

  const handleToggleFavorite = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    spaceAssetLibraryService.toggleFavorite('model', id);
    loadModels();
  };

  const handleDeleteModel = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('确定删除此模特资产吗？')) {
      spaceAssetLibraryService.deleteModel(id);
      loadModels();
      if (activeModel?.id === id) {
        setActiveModel(models.find(m => m.id !== id) || null);
      }
    }
  };

  const handleUploadSingleView = (viewKey: keyof ModelMultiViews, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      if (typeof loadEvt.target?.result === 'string') {
        setNewViews(prev => ({
          ...prev,
          [viewKey]: loadEvt.target!.result as string
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateCustomModel = async () => {
    if (!newName.trim()) return;
    setIsDnaInferring(true);
    try {
      const primaryThumb = newViews.front || newViews.threeQuarter || newViews.fullBody || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80';
      
      const created = spaceAssetLibraryService.createModel({
        name: newName.trim(),
        gender: newGender,
        ageGroup: newAgeGroup,
        tags: [newGender === 'female' ? '女性' : '男性', '私服', '定制模特'],
        thumbnail: primaryThumb,
        multiViews: {
          ...newViews,
          front: newViews.front || primaryThumb
        },
        modelDna: {
          identitySeed: Math.floor(Math.random() * 1000000),
          gender: newGender,
          ageRange: newAgeGroup,
          heightCm: 172,
          bodyBuild: 'slender',
          facialFeatures: '东亚高智温婉骨相，五官立体对称，清透微裸妆',
          hairStyleAndColor: '黑茶色及肩微卷锁骨发',
          outfitStyle: newOutfitStyle,
          skinTone: '自然亚洲象牙白皙肌'
        },
        isSystem: false,
      });

      loadModels();
      setActiveModel(created);
      setShowUploadDrawer(false);
      setNewName('');
      setNewViews({});
    } finally {
      setIsDnaInferring(false);
    }
  };

  const viewSlots: { key: keyof ModelMultiViews; label: string; desc: string }[] = [
    { key: 'front', label: '正面', desc: '五官与正脸真值' },
    { key: 'threeQuarter', label: '45度', desc: '侧面下颌与轮廓' },
    { key: 'side', label: '侧面', desc: '鼻梁立体度' },
    { key: 'fullBody', label: '全身', desc: '身材骨骼比例' },
    { key: 'outfitRef', label: '服装参考', desc: '材质与穿搭色系' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl h-[88vh] bg-[#14161f] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-neutral-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#191b26]/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">真实模特资产库 (Model DNA)</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono border border-purple-500/30">
                  面容·骨骼·私服穿搭
                </span>
              </div>
              <p className="text-xs text-neutral-400">多视角真值录入，独立模特 DNA 与姿态解耦，确保跨镜头面容一致性</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onSelectModel(null)}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-neutral-400 hover:text-white transition-all"
            >
              不使用模特 (纯静物)
            </button>
            <button
              onClick={() => setShowUploadDrawer(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-xs text-purple-300 transition-all font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>录入新模特资产</span>
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
          
          {/* Left Model Explorer */}
          <div className="flex-1 flex flex-col border-r border-white/10 p-5 overflow-hidden">
            {/* Filter Bar */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="搜索模特姓名、标签或年龄段..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500/60 transition-all"
                />
              </div>

              <div className="flex items-center gap-1 bg-black/30 p-1 rounded-xl border border-white/5">
                {[
                  { id: 'all', label: '全部' },
                  { id: 'female', label: '女性' },
                  { id: 'male', label: '男性' },
                  { id: 'couple', label: '情侣/夫妻' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setGenderFilter(tab.id as any)}
                    className={`px-3 py-1 rounded-lg text-xs transition-all ${
                      genderFilter === tab.id
                        ? 'bg-purple-600 text-white font-semibold shadow-sm'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Model Grid */}
            <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-3 gap-4 auto-rows-max">
              {filteredModels.map(model => {
                const isSelected = selectedModelId === model.id;
                const isActivePreview = activeModel?.id === model.id;
                return (
                  <div
                    key={model.id}
                    onClick={() => {
                      setActiveModel(model);
                      setActiveViewKey('front');
                    }}
                    className={`group relative rounded-xl overflow-hidden border cursor-pointer transition-all duration-200 flex flex-col bg-[#181a24] ${
                      isSelected
                        ? 'border-purple-500 ring-2 ring-purple-500/30'
                        : isActivePreview
                        ? 'border-white/40 shadow-lg'
                        : 'border-white/10 hover:border-white/25 hover:scale-[1.01]'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-[3/4] bg-black/50 overflow-hidden">
                      <img
                        src={model.thumbnail}
                        alt={model.name}
                        className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                      
                      {/* Top Badges */}
                      <div className="absolute top-2 left-2 flex items-center gap-1">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-black/60 backdrop-blur text-purple-300 font-medium border border-white/10">
                          {model.ageGroup}
                        </span>
                      </div>

                      {/* Favorite & Delete */}
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        {!model.isSystem && (
                          <button
                            onClick={(e) => handleDeleteModel(e, model.id)}
                            className="w-7 h-7 rounded-full bg-black/50 hover:bg-rose-500/80 text-white/70 hover:text-white flex items-center justify-center transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={(e) => handleToggleFavorite(e, model.id)}
                          className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                            model.favorite
                              ? 'bg-purple-500 text-white'
                              : 'bg-black/50 hover:bg-black/80 text-white/70 hover:text-purple-400'
                          }`}
                        >
                          <Star className="w-3.5 h-3.5 fill-current" />
                        </button>
                      </div>

                      {isSelected && (
                        <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-purple-500 text-white rounded">
                          <Check className="w-3 h-3 stroke-[3]" /> 已选用
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <h4 className="text-xs font-semibold text-white group-hover:text-purple-300 transition-colors">
                        {model.name}
                      </h4>
                      <p className="text-[10px] text-neutral-400 line-clamp-1 mt-0.5">
                        {model.modelDna.outfitStyle}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {model.tags.map((tag, idx) => (
                          <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-neutral-400">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Detail & Multi-Angle Inspector */}
          {activeModel && (
            <div className="w-96 bg-[#161822] p-5 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-4">
                {/* Active View Big Preview */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-purple-400" />
                      <span>多视角真值真图参考</span>
                    </span>
                    <span className="text-[10px] text-purple-400 font-mono">
                      视角: {viewSlots.find(v => v.key === activeViewKey)?.label}
                    </span>
                  </div>

                  <div className="relative aspect-[3/4] max-h-56 rounded-xl overflow-hidden bg-black/60 border border-white/10 shadow-inner group mx-auto">
                    <img
                      src={activeModel.multiViews[activeViewKey] || activeModel.thumbnail}
                      alt={activeModel.name}
                      className="w-full h-full object-cover object-top"
                    />
                  </div>

                  {/* 5 View Switchers */}
                  <div className="grid grid-cols-5 gap-1.5 mt-2">
                    {viewSlots.map(slot => {
                      const imgUrl = activeModel.multiViews[slot.key];
                      const isActive = activeViewKey === slot.key;
                      return (
                        <button
                          key={slot.key}
                          onClick={() => setActiveViewKey(slot.key)}
                          className={`relative flex flex-col items-center p-1 rounded-lg border text-center transition-all ${
                            isActive
                              ? 'border-purple-500 bg-purple-500/10 text-white'
                              : 'border-white/10 bg-black/20 text-neutral-400 hover:text-white'
                          }`}
                        >
                          <span className="text-[10px] font-bold">{slot.label}</span>
                          <span className="text-[8px] text-neutral-500 truncate w-full">{imgUrl ? '已录入' : '默认'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Model DNA Card */}
                <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-300">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>自动生成 Model DNA 结构体</span>
                    </div>
                    <span className="text-[9px] font-mono text-neutral-400">ID: #{activeModel.modelDna.identitySeed}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-300">
                    <div className="bg-black/30 p-1.5 rounded-lg">
                      <span className="text-[9px] text-neutral-500 block">身高/体型</span>
                      <span>{activeModel.modelDna.heightCm}cm · {activeModel.modelDna.bodyBuild}</span>
                    </div>
                    <div className="bg-black/30 p-1.5 rounded-lg">
                      <span className="text-[9px] text-neutral-500 block">肤色</span>
                      <span className="truncate block">{activeModel.modelDna.skinTone}</span>
                    </div>
                    <div className="col-span-2 bg-black/30 p-1.5 rounded-lg">
                      <span className="text-[9px] text-neutral-500 block">五官特征</span>
                      <span className="text-[10px] leading-tight block">{activeModel.modelDna.facialFeatures}</span>
                    </div>
                    <div className="col-span-2 bg-black/30 p-1.5 rounded-lg">
                      <span className="text-[9px] text-neutral-500 block">私服与穿搭</span>
                      <span className="text-[10px] leading-tight block text-purple-200">{activeModel.modelDna.outfitStyle}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Bottom Bar */}
              <div className="pt-4 border-t border-white/10 flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-neutral-300 font-medium transition-all"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    onSelectModel(activeModel);
                    onClose();
                  }}
                  className="flex-1 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-xs font-bold text-white shadow-lg shadow-purple-500/20 flex items-center justify-center gap-1.5 transition-all"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>指定此模特出镜</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Upload Custom Model Drawer */}
        {showUploadDrawer && (
          <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-150">
            <div className="w-full max-w-2xl bg-[#191b26] border border-white/15 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Upload className="w-4 h-4 text-purple-400" />
                  <span>录入新真实模特多视角参考与 DNA</span>
                </h3>
                <button
                  onClick={() => setShowUploadDrawer(false)}
                  className="text-neutral-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                {/* 1. Base Info */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-neutral-400 mb-1">模特名称/编号</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="如：Lin (高级白领/青年女主人)..."
                      className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/60"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-400 mb-1">性别与出镜角色</label>
                    <select
                      value={newGender}
                      onChange={e => setNewGender(e.target.value as any)}
                      className="w-full px-3 py-2 bg-[#12141c] border border-white/10 rounded-xl text-white focus:outline-none"
                    >
                      <option value="female">女性 (Female)</option>
                      <option value="male">男性 (Male)</option>
                      <option value="couple">夫妻/情侣 (Couple)</option>
                      <option value="family">家庭组合 (Family)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-neutral-400 mb-1">年龄段定位</label>
                    <input
                      type="text"
                      value={newAgeGroup}
                      onChange={e => setNewAgeGroup(e.target.value)}
                      placeholder="如：28-35岁 青年精英"
                      className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/60"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-400 mb-1">私服与穿搭特征</label>
                    <input
                      type="text"
                      value={newOutfitStyle}
                      onChange={e => setNewOutfitStyle(e.target.value)}
                      placeholder="如：意式羊绒针织衫、米白休闲阔腿裤"
                      className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/60"
                    />
                  </div>
                </div>

                {/* 2. Multi-view Upload Grid */}
                <div>
                  <label className="block text-neutral-300 font-medium mb-2 flex items-center justify-between">
                    <span>上传多视角真实参考照片 (至少上传正面照)</span>
                    <span className="text-[10px] text-purple-400 font-normal">支持自动解析五官真值</span>
                  </label>

                  <div className="grid grid-cols-5 gap-2">
                    {viewSlots.map(slot => (
                      <div key={slot.key} className="flex flex-col items-center">
                        <label className={`w-full aspect-[3/4] rounded-xl border border-dashed flex flex-col items-center justify-center p-2 cursor-pointer transition-all ${
                          newViews[slot.key]
                            ? 'border-purple-500 bg-purple-500/10'
                            : 'border-white/20 hover:border-purple-400 bg-black/30'
                        }`}>
                          {newViews[slot.key] ? (
                            <img src={newViews[slot.key]} alt="" className="w-full h-full object-cover rounded-lg" />
                          ) : (
                            <>
                              <Upload className="w-4 h-4 text-neutral-400 mb-1" />
                              <span className="text-[10px] text-neutral-300 font-bold">{slot.label}</span>
                              <span className="text-[8px] text-neutral-500 text-center scale-90">{slot.desc}</span>
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={e => handleUploadSingleView(slot.key, e)}
                            className="hidden"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  onClick={() => setShowUploadDrawer(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-neutral-300"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateCustomModel}
                  disabled={!newName.trim() || isDnaInferring}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all disabled:opacity-40 flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isDnaInferring ? 'AI 正在测算 Model DNA...' : '生成 Model DNA 并入库'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
