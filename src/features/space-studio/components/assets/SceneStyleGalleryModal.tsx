import React, { useState, useEffect } from 'react';
import { 
  X, Search, Sparkles, RefreshCw, Star, Plus, Check, 
  Image as ImageIcon, Layers, Eye, ChevronRight, Upload, Info 
} from 'lucide-react';
import { SceneStyleAsset } from '../../../../types/spaceAssetLibrary';
import { spaceAssetLibraryService } from '../../../../services/spaceAssetLibraryService';

interface SceneStyleGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedStyleId?: string;
  onSelectStyle: (style: SceneStyleAsset) => void;
}

export const SceneStyleGalleryModal: React.FC<SceneStyleGalleryModalProps> = ({
  isOpen,
  onClose,
  selectedStyleId,
  onSelectStyle,
}) => {
  const [styles, setStyles] = useState<SceneStyleAsset[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeStyle, setActiveStyle] = useState<SceneStyleAsset | null>(null);
  const [activeImageIdx, setActiveImageIdx] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showUploadDrawer, setShowUploadDrawer] = useState(false);
  
  // New style upload form state
  const [newStyleName, setNewStyleName] = useState('');
  const [newStyleCategory, setNewStyleCategory] = useState('现代极简');
  const [newStylePrompt, setNewStylePrompt] = useState('');
  const [newStyleImages, setNewStyleImages] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadStyles();
    }
  }, [isOpen]);

  const loadStyles = () => {
    const list = spaceAssetLibraryService.getSceneStyles();
    setStyles(list);
    if (list.length > 0) {
      if (selectedStyleId) {
        const found = list.find(s => s.id === selectedStyleId);
        setActiveStyle(found || list[0]);
      } else if (!activeStyle) {
        setActiveStyle(list[0]);
      }
    }
  };

  if (!isOpen) return null;

  const categories = ['all', '极简', '侘寂', '法式', '轻奢', '中式', '自然'];

  const filteredStyles = styles.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
      s.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = activeCategory === 'all' || s.category.includes(activeCategory) || s.tags.includes(activeCategory);
    return matchesSearch && matchesCat;
  });

  const handleToggleFavorite = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    spaceAssetLibraryService.toggleFavorite('scene_style', id);
    loadStyles();
  };

  const handleAiRefresh = async (styleId: string) => {
    setIsRefreshing(true);
    try {
      const updated = await spaceAssetLibraryService.generateStyleVariants(styleId);
      loadStyles();
      if (activeStyle?.id === styleId) {
        setActiveStyle(updated);
        setActiveImageIdx(0);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCreateCustomStyle = () => {
    if (!newStyleName.trim()) return;
    const placeholderImg = newStyleImages[0] || 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85';
    
    const created = spaceAssetLibraryService.createSceneStyle({
      name: newStyleName.trim(),
      category: newStyleCategory,
      tags: [newStyleCategory, '自定义空间', '用户资产'],
      thumbnail: placeholderImg,
      referenceImages: newStyleImages.length > 0 ? newStyleImages : [placeholderImg],
      promptFragment: newStylePrompt.trim() || `${newStyleName}风格，优雅高奢质感，真实采光，精致室内建筑`,
      lightingTone: '天然通透漫射光',
      isSystem: false,
    });

    loadStyles();
    setActiveStyle(created);
    setShowUploadDrawer(false);
    setNewStyleName('');
    setNewStylePrompt('');
    setNewStyleImages([]);
  };

  const handleUploadImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        if (typeof loadEvt.target?.result === 'string') {
          setNewStyleImages(prev => [...prev, loadEvt.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl h-[88vh] bg-[#14161f] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-neutral-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#191b26]/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">场景风格视觉资产库</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                  视觉驱动引擎
                </span>
              </div>
              <p className="text-xs text-neutral-400">选择或上传空间建筑与软装风格参考，Prompt 自动映射至主渲染器</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowUploadDrawer(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-neutral-200 hover:text-white transition-all"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>新建风格资产</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Content Layout (Left Filter & Grid + Right Preview) */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Gallery Explorer */}
          <div className="flex-1 flex flex-col border-r border-white/10 p-5 overflow-hidden">
            {/* Search & Categories */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="搜索风格名称、材质或标签（如侘寂、意式、法式）..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/60 transition-all"
                />
              </div>

              <div className="flex items-center gap-1.5 bg-black/30 p-1 rounded-xl border border-white/5">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-3 py-1 rounded-lg text-xs transition-all ${
                      activeCategory === cat
                        ? 'bg-amber-500 text-black font-semibold shadow-sm'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {cat === 'all' ? '全部' : cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Style Cards Grid */}
            <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-3 gap-4 auto-rows-max">
              {filteredStyles.map(style => {
                const isSelected = selectedStyleId === style.id;
                const isActivePreview = activeStyle?.id === style.id;
                return (
                  <div
                    key={style.id}
                    onClick={() => {
                      setActiveStyle(style);
                      setActiveImageIdx(0);
                    }}
                    className={`group relative rounded-xl overflow-hidden border cursor-pointer transition-all duration-200 flex flex-col bg-[#181a24] ${
                      isSelected
                        ? 'border-amber-500 ring-2 ring-amber-500/30'
                        : isActivePreview
                        ? 'border-white/40 shadow-lg'
                        : 'border-white/10 hover:border-white/25 hover:scale-[1.01]'
                    }`}
                  >
                    {/* Thumbnail Image */}
                    <div className="relative aspect-[16/10] bg-black/50 overflow-hidden">
                      <img
                        src={style.thumbnail}
                        alt={style.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                      
                      {/* Top Badges */}
                      <div className="absolute top-2 left-2 flex items-center gap-1.5">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-black/60 backdrop-blur text-amber-300 font-medium border border-white/10">
                          {style.category}
                        </span>
                        {style.isSystem ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/30 text-blue-300 border border-blue-400/20">
                            系统
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-300 border border-purple-400/20">
                            用户
                          </span>
                        )}
                      </div>

                      {/* Favorite Button */}
                      <button
                        onClick={(e) => handleToggleFavorite(e, style.id)}
                        className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                          style.favorite
                            ? 'bg-amber-500 text-black'
                            : 'bg-black/50 hover:bg-black/80 text-white/70 hover:text-amber-400'
                        }`}
                      >
                        <Star className="w-3.5 h-3.5 fill-current" />
                      </button>

                      {/* Reference count badge */}
                      <div className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-black/60 backdrop-blur text-neutral-300 flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" />
                        <span>{style.referenceImages.length} 张参考</span>
                      </div>

                      {isSelected && (
                        <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-amber-500 text-black rounded">
                          <Check className="w-3 h-3 stroke-[3]" /> 当前生效
                        </div>
                      )}
                    </div>

                    {/* Card Info */}
                    <div className="p-3 flex flex-col justify-between flex-1">
                      <div>
                        <h4 className="text-xs font-semibold text-white group-hover:text-amber-400 transition-colors line-clamp-1">
                          {style.name}
                        </h4>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {style.tags.slice(0, 3).map((tag, idx) => (
                            <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-neutral-400">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Detail & Multi-Angle Inspector */}
          {activeStyle && (
            <div className="w-96 bg-[#161822] p-5 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-4">
                {/* Active Preview Big Viewport */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-amber-400" />
                      <span>视角参考预览</span>
                    </span>
                    <span className="text-[10px] text-neutral-500">
                      第 {activeImageIdx + 1} / {activeStyle.referenceImages.length} 张
                    </span>
                  </div>

                  <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-black/60 border border-white/10 shadow-inner group">
                    <img
                      src={activeStyle.referenceImages[activeImageIdx] || activeStyle.thumbnail}
                      alt={activeStyle.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex items-center justify-between text-[11px]">
                      <span className="text-white font-medium">{activeStyle.name}</span>
                      <span className="text-amber-400 text-[10px] font-mono">{activeStyle.lightingTone}</span>
                    </div>
                  </div>

                  {/* Multi-angle Thumbnails List */}
                  <div className="flex items-center gap-2 mt-2 overflow-x-auto pb-1">
                    {activeStyle.referenceImages.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveImageIdx(idx)}
                        className={`relative w-16 aspect-[16/10] rounded-lg overflow-hidden border flex-shrink-0 transition-all ${
                          activeImageIdx === idx
                            ? 'border-amber-500 ring-2 ring-amber-500/40 scale-105'
                            : 'border-white/10 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* AI Refresh 4 Variants Action Bar */}
                <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>AI 场景裂变与刷新</span>
                    </div>
                    <span className="text-[10px] text-neutral-400">实时生成4张变体</span>
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    基于空间物理真值与该风格 DNA，AI 自动生成 4 套同风格不同采光/构图参考。
                  </p>
                  <button
                    onClick={() => handleAiRefresh(activeStyle.id)}
                    disabled={isRefreshing}
                    className="w-full py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>{isRefreshing ? 'AI 裂变运算中...' : 'AI 刷新 4 张参考图'}</span>
                  </button>
                </div>

                {/* Prompt Fragment Inspector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-400 flex items-center gap-1">
                    <Info className="w-3 h-3 text-neutral-500" />
                    <span>映射 Prompt 片段 (不可视后台指令)</span>
                  </label>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 text-[11px] font-mono text-neutral-300 leading-relaxed max-h-24 overflow-y-auto">
                    {activeStyle.promptFragment}
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
                    onSelectStyle(activeStyle);
                    onClose();
                  }}
                  className="flex-1 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-xs font-bold text-black shadow-lg shadow-amber-500/20 flex items-center justify-center gap-1.5 transition-all"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>应用此风格</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Upload Custom Style Drawer / Modal */}
        {showUploadDrawer && (
          <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-150">
            <div className="w-full max-w-lg bg-[#191b26] border border-white/15 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Upload className="w-4 h-4 text-amber-400" />
                  <span>创建自定义风格资产</span>
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
                  <label className="block text-neutral-400 mb-1">风格名称</label>
                  <input
                    type="text"
                    value={newStyleName}
                    onChange={e => setNewStyleName(e.target.value)}
                    placeholder="如：意式轻奢暖灰大平层..."
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-amber-500/60"
                  />
                </div>

                <div>
                  <label className="block text-neutral-400 mb-1">风格分类</label>
                  <select
                    value={newStyleCategory}
                    onChange={e => setNewStyleCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-[#12141c] border border-white/10 rounded-xl text-white focus:outline-none"
                  >
                    <option value="现代极简">现代极简</option>
                    <option value="侘寂风">侘寂风</option>
                    <option value="意式轻奢">意式轻奢</option>
                    <option value="法式复古">法式复古</option>
                    <option value="新中式">新中式</option>
                    <option value="自然原木">自然原木</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-400 mb-1">上传参考图</label>
                  <label className="border border-dashed border-white/20 hover:border-amber-500/50 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer bg-black/20 transition-all">
                    <Upload className="w-5 h-5 text-neutral-400 mb-1" />
                    <span className="text-neutral-400">点击上传单张或多张风格参考图</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleUploadImageFile}
                      className="hidden"
                    />
                  </label>

                  {newStyleImages.length > 0 && (
                    <div className="flex gap-2 mt-2 overflow-x-auto">
                      {newStyleImages.map((img, i) => (
                        <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden border border-white/20">
                          <img src={img} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-neutral-400 mb-1">Prompt 片段与空间描述 (可选)</label>
                  <textarea
                    rows={3}
                    value={newStylePrompt}
                    onChange={e => setNewStylePrompt(e.target.value)}
                    placeholder="描述该风格的材质特征、采光方向、色调及软装氛围..."
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-amber-500/60"
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
                  onClick={handleCreateCustomStyle}
                  disabled={!newStyleName.trim()}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all disabled:opacity-40"
                >
                  保存并加入资产库
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
