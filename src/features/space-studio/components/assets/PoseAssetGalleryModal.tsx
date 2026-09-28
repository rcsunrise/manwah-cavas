import React, { useState, useEffect } from 'react';
import { 
  X, Search, Sparkles, Star, Plus, Check, 
  Trash2, Upload, Eye, Activity, ShieldCheck, UserCheck
} from 'lucide-react';
import { PoseAsset, PoseCategory, PoseDnaData } from '../../../../types/spaceAssetLibrary';
import { spaceAssetLibraryService } from '../../../../services/spaceAssetLibraryService';

interface PoseAssetGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPoseId?: string;
  onSelectPose: (pose: PoseAsset | null) => void;
}

export const PoseAssetGalleryModal: React.FC<PoseAssetGalleryModalProps> = ({
  isOpen,
  onClose,
  selectedPoseId,
  onSelectPose,
}) => {
  const [poses, setPoses] = useState<PoseAsset[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<PoseCategory | 'all'>('all');
  const [activePose, setActivePose] = useState<PoseAsset | null>(null);
  const [showUploadDrawer, setShowUploadDrawer] = useState(false);

  // New pose form state
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<PoseCategory>('sitting');
  const [newImage, setNewImage] = useState('');
  const [newOrientation, setNewOrientation] = useState('45度侧身微倾');
  const [newSeating, setNewSeating] = useState('落座于主沙发右侧1/3位');
  const [newBack, setNewBack] = useState('背部轻倚靠包');
  const [newArms, setNewArms] = useState('一手搭扶手，一手翻阅画册');
  const [newOcclusion, setNewOcclusion] = useState('严禁遮挡沙发主靠背与扶手缝线');

  useEffect(() => {
    if (isOpen) {
      loadPoses();
    }
  }, [isOpen]);

  const loadPoses = () => {
    const list = spaceAssetLibraryService.getPoses();
    setPoses(list);
    if (list.length > 0) {
      if (selectedPoseId) {
        const found = list.find(p => p.id === selectedPoseId);
        setActivePose(found || list[0]);
      } else if (!activePose) {
        setActivePose(list[0]);
      }
    }
  };

  if (!isOpen) return null;

  const categories: { id: PoseCategory | 'all'; label: string }[] = [
    { id: 'all', label: '全部' },
    { id: 'sitting', label: '坐姿' },
    { id: 'lying', label: '躺姿' },
    { id: 'reading', label: '阅读' },
    { id: 'chatting', label: '交谈' },
    { id: 'drinking', label: '喝茶' },
    { id: 'family', label: '家庭互动' },
    { id: 'standing', label: '站立' },
  ];

  const filteredPoses = poses.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
      p.poseDna.bodyOrientation.includes(searchQuery);
    const matchesCat = activeCategory === 'all' || p.category === activeCategory;
    return matchesSearch && matchesCat;
  });

  const handleToggleFavorite = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    spaceAssetLibraryService.toggleFavorite('pose', id);
    loadPoses();
  };

  const handleDeletePose = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('确定删除此姿态资产吗？')) {
      spaceAssetLibraryService.deletePose(id);
      loadPoses();
      if (activePose?.id === id) {
        setActivePose(poses.find(p => p.id !== id) || null);
      }
    }
  };

  const handleUploadPoseImg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      if (typeof loadEvt.target?.result === 'string') {
        setNewImage(loadEvt.target!.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateCustomPose = () => {
    if (!newName.trim()) return;
    const thumb = newImage || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80';
    
    const created = spaceAssetLibraryService.createPose({
      name: newName.trim(),
      category: newCategory,
      tags: [newCategory, '自定义姿态', '自然互动'],
      thumbnail: thumb,
      poseDna: {
        bodyOrientation: newOrientation,
        seatingContact: newSeating,
        backSupport: newBack,
        armPlacements: newArms,
        footPlacements: '双脚自然踩于地毯',
        personCount: 1,
        occlusionRules: newOcclusion,
      },
      isSystem: false,
    });

    loadPoses();
    setActivePose(created);
    setShowUploadDrawer(false);
    setNewName('');
    setNewImage('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl h-[88vh] bg-[#14161f] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-neutral-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#191b26]/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">姿态资产库 (Pose DNA)</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">
                  落座·骨骼·家具避让
                </span>
              </div>
              <p className="text-xs text-neutral-400">7 大标准姿态与落座关系，严格保持家具主体结构无遮挡与物理真实度</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onSelectPose(null)}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-neutral-400 hover:text-white transition-all"
            >
              无人物姿态 (纯景)
            </button>
            <button
              onClick={() => setShowUploadDrawer(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs text-emerald-300 transition-all font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新建姿态资产</span>
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
          
          {/* Left Pose Explorer */}
          <div className="flex-1 flex flex-col border-r border-white/10 p-5 overflow-hidden">
            {/* Search & Category Filter */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="搜索姿态名称、动作或落座位置..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500/60 transition-all"
                />
              </div>

              <div className="flex items-center gap-1 bg-black/30 p-1 rounded-xl border border-white/5">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`px-3 py-1 rounded-lg text-xs transition-all ${
                      activeCategory === cat.id
                        ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pose Grid */}
            <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-3 gap-4 auto-rows-max">
              {filteredPoses.map(pose => {
                const isSelected = selectedPoseId === pose.id;
                const isActivePreview = activePose?.id === pose.id;
                return (
                  <div
                    key={pose.id}
                    onClick={() => setActivePose(pose)}
                    className={`group relative rounded-xl overflow-hidden border cursor-pointer transition-all duration-200 flex flex-col bg-[#181a24] ${
                      isSelected
                        ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                        : isActivePreview
                        ? 'border-white/40 shadow-lg'
                        : 'border-white/10 hover:border-white/25 hover:scale-[1.01]'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-[4/3] bg-black/50 overflow-hidden">
                      <img
                        src={pose.thumbnail}
                        alt={pose.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                      
                      {/* Top Badges */}
                      <div className="absolute top-2 left-2 flex items-center gap-1">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-black/60 backdrop-blur text-emerald-300 font-medium border border-white/10">
                          {categories.find(c => c.id === pose.category)?.label || pose.category}
                        </span>
                      </div>

                      {/* Favorite & Delete */}
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        {!pose.isSystem && (
                          <button
                            onClick={(e) => handleDeletePose(e, pose.id)}
                            className="w-7 h-7 rounded-full bg-black/50 hover:bg-rose-500/80 text-white/70 hover:text-white flex items-center justify-center transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={(e) => handleToggleFavorite(e, pose.id)}
                          className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                            pose.favorite
                              ? 'bg-emerald-500 text-black'
                              : 'bg-black/50 hover:bg-black/80 text-white/70 hover:text-emerald-400'
                          }`}
                        >
                          <Star className="w-3.5 h-3.5 fill-current" />
                        </button>
                      </div>

                      {isSelected && (
                        <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-emerald-500 text-black rounded">
                          <Check className="w-3 h-3 stroke-[3]" /> 已选用
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <h4 className="text-xs font-semibold text-white group-hover:text-emerald-300 transition-colors">
                        {pose.name}
                      </h4>
                      <p className="text-[10px] text-neutral-400 line-clamp-1 mt-0.5">
                        {pose.poseDna.seatingContact}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {pose.tags.map((tag, idx) => (
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

          {/* Right Pose DNA Inspector */}
          {activePose && (
            <div className="w-96 bg-[#161822] p-5 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-4">
                {/* Big Preview */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      <span>姿态与人体骨骼参考</span>
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono">
                      人物数: {activePose.poseDna.personCount} 人
                    </span>
                  </div>

                  <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-black/60 border border-white/10 shadow-inner group">
                    <img
                      src={activePose.thumbnail}
                      alt={activePose.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex items-center justify-between text-[11px]">
                      <span className="text-white font-medium">{activePose.name}</span>
                    </div>
                  </div>
                </div>

                {/* Pose DNA Structured Rules */}
                <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Pose DNA 物理真实落座定义</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-[11px] text-neutral-300">
                    <div className="bg-black/30 p-2 rounded-lg">
                      <span className="text-[9px] text-neutral-500 block">身体朝向与微动</span>
                      <span>{activePose.poseDna.bodyOrientation}</span>
                    </div>

                    <div className="bg-black/30 p-2 rounded-lg">
                      <span className="text-[9px] text-neutral-500 block">臀部落座关系</span>
                      <span className="text-emerald-300">{activePose.poseDna.seatingContact}</span>
                    </div>

                    <div className="bg-black/30 p-2 rounded-lg">
                      <span className="text-[9px] text-neutral-500 block">背部支撑与贴合</span>
                      <span>{activePose.poseDna.backSupport}</span>
                    </div>

                    <div className="bg-black/30 p-2 rounded-lg">
                      <span className="text-[9px] text-neutral-500 block">手臂与手部摆放</span>
                      <span>{activePose.poseDna.armPlacements}</span>
                    </div>

                    <div className="bg-black/30 p-2 rounded-lg flex items-start gap-1.5 border border-amber-500/20 text-amber-200">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="text-[9px] text-amber-400 block font-bold">遮挡与产品保真规则</span>
                        <span className="text-[10px]">{activePose.poseDna.occlusionRules}</span>
                      </div>
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
                    onSelectPose(activePose);
                    onClose();
                  }}
                  className="flex-1 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-xs font-bold text-black shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5 transition-all"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>应用此姿态</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Upload Custom Pose Drawer */}
        {showUploadDrawer && (
          <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-150">
            <div className="w-full max-w-lg bg-[#191b26] border border-white/15 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Upload className="w-4 h-4 text-emerald-400" />
                  <span>录入新姿态资产与 Pose DNA</span>
                </h3>
                <button
                  onClick={() => setShowUploadDrawer(false)}
                  className="text-neutral-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-neutral-400 mb-1">姿态名称</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="如：翻阅杂志·半倚扶手..."
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-emerald-500/60"
                  />
                </div>

                <div>
                  <label className="block text-neutral-400 mb-1">姿态分类</label>
                  <select
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value as any)}
                    className="w-full px-3 py-2 bg-[#12141c] border border-white/10 rounded-xl text-white focus:outline-none"
                  >
                    <option value="sitting">坐姿 (Sitting)</option>
                    <option value="lying">躺姿 (Lying)</option>
                    <option value="reading">阅读 (Reading)</option>
                    <option value="chatting">交谈 (Chatting)</option>
                    <option value="drinking">喝茶 (Drinking)</option>
                    <option value="family">家庭互动 (Family)</option>
                    <option value="standing">站立 (Standing)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-400 mb-1">姿态参考缩略图</label>
                  <label className="border border-dashed border-white/20 hover:border-emerald-500/50 rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer bg-black/20">
                    <Upload className="w-4 h-4 text-neutral-400 mb-1" />
                    <span className="text-neutral-400">点击上传姿态示意图/人体参考</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUploadPoseImg}
                      className="hidden"
                    />
                  </label>
                  {newImage && (
                    <div className="mt-2 w-20 h-20 rounded-lg overflow-hidden border border-emerald-500/50">
                      <img src={newImage} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-neutral-400 mb-1">身体朝向与落座关系</label>
                  <input
                    type="text"
                    value={newOrientation}
                    onChange={e => setNewOrientation(e.target.value)}
                    placeholder="如：正面微侧向镜头..."
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-emerald-500/60"
                  />
                </div>

                <div>
                  <label className="block text-neutral-400 mb-1">臀部与背部支撑</label>
                  <input
                    type="text"
                    value={newSeating}
                    onChange={e => setNewSeating(e.target.value)}
                    placeholder="如：稳稳落座于坐垫右侧..."
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-emerald-500/60"
                  />
                </div>

                <div>
                  <label className="block text-neutral-400 mb-1">产品无遮挡规则 (Guardrail)</label>
                  <input
                    type="text"
                    value={newOcclusion}
                    onChange={e => setNewOcclusion(e.target.value)}
                    placeholder="如：身体不可遮挡主靠背和中缝线..."
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-emerald-500/60"
                  />
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
                  onClick={handleCreateCustomPose}
                  disabled={!newName.trim()}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-all disabled:opacity-40"
                >
                  保存并加入姿态库
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
