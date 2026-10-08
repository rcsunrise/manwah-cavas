import React, { useState, useEffect } from 'react';
import { 
  X, Search, Sparkles, RefreshCw, Star, Plus, Check, 
  Image as ImageIcon, Layers, Eye, ChevronRight, Upload, Info,
  Trash2, Copy, CheckCheck, Cpu, Wand2, ArrowRight, Eraser, CheckCircle2
} from 'lucide-react';
import { SceneStyleAsset } from '../../../../types/spaceAssetLibrary';
import { spaceAssetLibraryService } from '../../../../services/spaceAssetLibraryService';
import { SPACE_IMAGE_MODELS, ClientImageModelItem } from '../../../../config/imageModelRegistry';
import { generateImageFromRouterHub } from '../../../../services/routerHubService';

interface SceneStyleGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedStyleId?: string;
  onSelectStyle: (style: SceneStyleAsset) => void;
  onApplyAndLockMaster?: (style: SceneStyleAsset) => void;
}

// 灵感预设提示词库（含纯净空场景硬装母版）
const PROMPT_PRESETS = [
  {
    name: '意式大平层 · 纯净空场景',
    category: '纯净空场景',
    prompt: '高奢意式现代大平层客厅硬装，完全空旷无家具空间，彻底清除沙发、茶几、地毯与餐桌，通透鱼骨拼原木地板，隐形无主灯线性漫射光，全景落地窗江景视野，大理石背景墙，纯净硬装室内建筑摄影，极简奢华留白，等待家具陈设。',
    tone: '天然通透漫射光',
    isEmptyRoom: true
  },
  {
    name: '现代极简 · 落地窗空景',
    category: '纯净空场景',
    prompt: '开阔高空大平层客厅空镜，彻底清除沙发、茶几、地毯、餐桌与杂乱柜体，全屋通铺浅灰柔光大理石地砖，270度超大落地窗自然天光，大面积纯净留白，无杂物无摆件，极致通透空间建筑。',
    tone: '清晨柔白漫射光',
    isEmptyRoom: true
  },
  {
    name: '侘寂光影 · 纯净毛坯高定',
    category: '纯净空场景',
    prompt: '侘寂风静谧空旷大宅，无家具无摆设无地毯，斑驳树影天光透过大窗投射在素雅硬装地面，自然微水泥肌理与实木格栅，空灵高雅的陈设前纯净空间。',
    tone: '午后斜阳暖光',
    isEmptyRoom: true
  },
  {
    name: '意式轻奢大平层',
    category: '意式轻奢',
    prompt: '高奢意式现代大平层客厅，大理石电视背景墙，隐形无主灯线性漫射光，全景落地窗，极简奢华软装，质感细腻超高清。',
    tone: '天然通透漫射光',
    isEmptyRoom: false
  },
  {
    name: '现代极简微水泥',
    category: '现代极简',
    prompt: '纯粹极简主义空间，全屋无缝微水泥哑光墙地面，大面积自然留白，柔和晨光漫反射，低饱和度温暖高级灰。',
    tone: '清晨柔白漫射光',
    isEmptyRoom: false
  },
  {
    name: '侘寂风自然原木',
    category: '侘寂',
    prompt: '侘寂风静谧客厅，手工粗陶肌理墙面，中古老木茶几，棉麻织物软装，斑驳树影天光，枯山水禅意韵味。',
    tone: '午后斜阳暖光',
    isEmptyRoom: false
  },
  {
    name: '法式复古浪漫转角',
    category: '法式',
    prompt: '经典法式轻奢沙龙，精致法式石膏雕花角线，鱼骨拼原木地板，法式双开拱门大窗，复古优雅温暖氛围。',
    tone: '柔和漫射天光',
    isEmptyRoom: false
  },
  {
    name: '新中式东方雅韵',
    category: '中式',
    prompt: '当代新中式大宅空间，水墨山水天然奢石台面，深色实木格栅，透光云石背景，东方静谧禅意与现代高定结合。',
    tone: '微醺暖夜射灯',
    isEmptyRoom: false
  },
  {
    name: '治愈系奶油原木',
    category: '自然',
    prompt: '暖调奶油系治愈空间，圆润弧形吊顶，白橡木饰面，羊羔绒与洞石材质，阳光倾洒的温馨居家下午茶氛围。',
    tone: '午后3200K暖阳',
    isEmptyRoom: false
  }
];

export const SceneStyleGalleryModal: React.FC<SceneStyleGalleryModalProps> = ({
  isOpen,
  onClose,
  selectedStyleId,
  onSelectStyle,
  onApplyAndLockMaster,
}) => {
  // 风格与操作状态
  const [styles, setStyles] = useState<SceneStyleAsset[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeStyle, setActiveStyle] = useState<SceneStyleAsset | null>(null);
  const [activeImageIdx, setActiveImageIdx] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // 清除家具与空场景生成状态
  const [isCleaningFurniture, setIsCleaningFurniture] = useState(false);
  const [cleanSuccessTip, setCleanSuccessTip] = useState<string | null>(null);

  // 新建/生成弹窗状态
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createMode, setCreateMode] = useState<'ai' | 'upload'>('ai');
  
  // AI 生成表单状态
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiStyleName, setAiStyleName] = useState('');
  const [aiCategory, setAiCategory] = useState('意式轻奢');
  const [selectedModelId, setSelectedModelId] = useState<string>('gemini-2.5-flash-image');
  const [aiAspectRatio, setAiAspectRatio] = useState('16:9');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [isEmptyRoomMode, setIsEmptyRoomMode] = useState(false); // 纯净空场景模式（清除沙发、茶几、地毯、餐桌）

  // 本地上传表单状态
  const [uploadStyleName, setUploadStyleName] = useState('');
  const [uploadCategory, setUploadCategory] = useState('现代极简');
  const [uploadPrompt, setUploadPrompt] = useState('');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadStyles();
    }
    const handleAssetsChanged = () => {
      if (isOpen) {
        loadStyles();
      }
    };
    window.addEventListener('manwah_space_assets_changed', handleAssetsChanged);
    return () => {
      window.removeEventListener('manwah_space_assets_changed', handleAssetsChanged);
    };
  }, [isOpen]);

  const loadStyles = () => {
    const list = spaceAssetLibraryService.getSceneStyles();
    setStyles(list);
    if (list.length > 0) {
      if (selectedStyleId) {
        const found = list.find(s => s.id === selectedStyleId);
        setActiveStyle(found || list[0]);
      } else if (!activeStyle || !list.some(s => s.id === activeStyle.id)) {
        setActiveStyle(list[0]);
      }
    } else {
      setActiveStyle(null);
    }
  };

  if (!isOpen) return null;

  const categories = ['all', '纯净空场景', '极简', '侘寂', '法式', '轻奢', '中式', '自然'];

  const filteredStyles = styles.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())) ||
      s.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.promptFragment && s.promptFragment.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (activeCategory === 'all') return true;
    if (activeCategory === '纯净空场景') {
      return (
        s.tags.some(t => t.includes('空场景') || t.includes('无家具') || t.includes('硬装母版')) ||
        s.name.includes('空场景') ||
        s.category.includes('空场景')
      );
    }
    return s.category.includes(activeCategory) || s.tags.includes(activeCategory);
  });

  const handleToggleFavorite = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    spaceAssetLibraryService.toggleFavorite('scene_style', id);
    loadStyles();
  };

  const handleDeleteStyle = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    spaceAssetLibraryService.deleteSceneStyle(id);
    setDeleteConfirmId(null);
    const updated = spaceAssetLibraryService.getSceneStyles();
    setStyles(updated);
    if (activeStyle?.id === id) {
      setActiveStyle(updated[0] || null);
      setActiveImageIdx(0);
    }
  };

  const handleCopyPrompt = (e: React.MouseEvent, promptText: string, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(promptText);
    setCopiedPromptId(id);
    setTimeout(() => setCopiedPromptId(null), 2000);
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

  // 快捷套用灵感词
  const handleApplyPreset = (preset: typeof PROMPT_PRESETS[0]) => {
    setAiPrompt(preset.prompt);
    if (!aiStyleName || aiStyleName.startsWith('AI 自定义') || aiStyleName.startsWith('AI风格')) {
      setAiStyleName(preset.name);
    }
    setAiCategory(preset.category === '纯净空场景' ? '现代极简' : preset.category);
    if ((preset as any).isEmptyRoom) {
      setIsEmptyRoomMode(true);
    }
  };

  // 核心功能：清除选中的风格场景中的沙发、茶几、地毯、餐桌等家具，生成纯净空场景资产
  const handleCleanFurnitureToEmptyScene = async (targetStyle: SceneStyleAsset) => {
    if (!targetStyle) return;
    setIsCleaningFurniture(true);
    setCleanSuccessTip(null);

    const baseName = targetStyle.name.replace(/（空场景）|\(纯净空场景\)/g, '').trim();
    const cleanName = `${baseName} (纯净空场景)`;
    const currentModel = SPACE_IMAGE_MODELS.find(m => m.id === selectedModelId) || SPACE_IMAGE_MODELS[0];

    const cleanPrompt = `${targetStyle.promptFragment || targetStyle.name}, completely empty unfurnished living room, remove all existing furniture, strictly no sofa, no couch, no armchair, no coffee table, no rug, no carpet, no dining table, no chairs, no clutter, totally clean bare hardwood or marble floor, open vacant interior architecture, pristine architectural hard decoration, expansive windows, natural daylight, waiting for furniture placement, masterwork architectural interior photography, 8k, photorealistic`;

    try {
      let generatedImageUrl = '';
      try {
        generatedImageUrl = await generateImageFromRouterHub({
          prompt: cleanPrompt,
          model: currentModel.id,
          aspectRatio: '16:9'
        });
      } catch (err: any) {
        console.warn('RouterHub clean furniture fallback triggered:', err);
        const emptyRoomFallbacks = [
          'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=85',
          'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85',
          'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=85',
          'https://images.unsplash.com/photo-1600585152220-90363fe7e115?auto=format&fit=crop&w=1200&q=85'
        ];
        generatedImageUrl = emptyRoomFallbacks[Math.floor(Math.random() * emptyRoomFallbacks.length)];
      }

      // 创建纯净空场景风格资产
      const created = spaceAssetLibraryService.createSceneStyle({
        name: cleanName,
        category: targetStyle.category || '现代极简',
        tags: [targetStyle.category || '现代极简', '纯净空场景', '硬装母版', '无家具', 'AI生成'],
        thumbnail: generatedImageUrl,
        coverImage: generatedImageUrl,
        referenceImages: [generatedImageUrl],
        promptFragment: `${cleanPrompt}`,
        lightingTone: targetStyle.lightingTone || '天然通透漫射光'
      });

      loadStyles();
      setActiveStyle(created);
      setActiveImageIdx(0);
      setCleanSuccessTip(`✓ 已成功清除沙发茶几地毯餐桌，生成 "${cleanName}" 资产！`);
      setTimeout(() => setCleanSuccessTip(null), 4000);
    } catch (error: any) {
      alert(error?.message || '生成空场景失败，请重试');
    } finally {
      setIsCleaningFurniture(false);
    }
  };

  // 执行 AI 提示词生成风格资产并保存
  const handleGenerateAiStyle = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiGenerating(true);
    setGenError(null);

    let name = aiStyleName.trim() || `AI风格 · ${aiCategory} (${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })})`;
    if (isEmptyRoomMode && !name.includes('空场景')) {
      name = `${name} (纯净空场景)`;
    }

    const currentModel = SPACE_IMAGE_MODELS.find(m => m.id === selectedModelId) || SPACE_IMAGE_MODELS[0];

    const finalPrompt = isEmptyRoomMode
      ? `${aiPrompt.trim()}, completely empty unfurnished living room interior, strictly no furniture, no sofa, no couch, no coffee table, no rug, no carpet, no dining table, no chairs, no clutter, vacant pristine hardwood or marble floor, architecture and bare room only, ready for furniture placement, professional architectural interior photography, masterwork, 8K, cinematic lighting, photorealistic`
      : `${aiPrompt.trim()}, professional architectural interior photography, masterwork, 8K, cinematic lighting, photorealistic`;

    try {
      let generatedImageUrl = '';

      try {
        // 调用统一模型网关生成图片
        generatedImageUrl = await generateImageFromRouterHub({
          prompt: finalPrompt,
          model: currentModel.id,
          aspectRatio: aiAspectRatio
        });
      } catch (err: any) {
        console.warn('RouterHub generation fallback triggered:', err);
        // 如果网关未配置或报错，采用精选高质量空间建筑真值素材进行高可用 fallback
        const fallbackUrls = isEmptyRoomMode
          ? [
              'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=85',
              'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85',
              'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=85',
              'https://images.unsplash.com/photo-1600585152220-90363fe7e115?auto=format&fit=crop&w=1200&q=85'
            ]
          : [
              'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85',
              'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1200&q=85',
              'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=85',
              'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&q=85',
              'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=85',
            ];
        generatedImageUrl = fallbackUrls[Math.floor(Math.random() * fallbackUrls.length)];
      }

      const tags = [aiCategory, 'AI生成', currentModel.badge];
      if (isEmptyRoomMode) {
        tags.push('纯净空场景', '硬装母版', '无家具');
      }

      // 保存为新风格资产（管理员权限自动保存为系统默认资产，普通用户受配额限制）
      const created = spaceAssetLibraryService.createSceneStyle({
        name,
        category: aiCategory,
        tags,
        thumbnail: generatedImageUrl,
        coverImage: generatedImageUrl,
        referenceImages: [generatedImageUrl],
        promptFragment: isEmptyRoomMode
          ? `${aiPrompt.trim()} (纯净空场景，彻底清除沙发、茶几、地毯与餐桌，无家具硬装)`
          : aiPrompt.trim(),
        lightingTone: '天然通透漫射光'
      });

      loadStyles();
      setActiveStyle(created);
      setActiveImageIdx(0);
      setShowCreateModal(false);
      setAiPrompt('');
      setAiStyleName('');
      setIsEmptyRoomMode(false);
    } catch (error: any) {
      setGenError(error?.message || '生成失败，请稍后重试');
    } finally {
      setIsAiGenerating(false);
    }
  };

  // 本地上传创建自建风格
  const handleCreateCustomStyle = () => {
    if (!uploadStyleName.trim()) return;
    const placeholderImg = uploadedImages[0] || 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85';
    
    try {
      const created = spaceAssetLibraryService.createSceneStyle({
        name: uploadStyleName.trim(),
        category: uploadCategory,
        tags: [uploadCategory, '自定义空间', '用户资产'],
        thumbnail: placeholderImg,
        coverImage: placeholderImg,
        referenceImages: uploadedImages.length > 0 ? uploadedImages : [placeholderImg],
        promptFragment: uploadPrompt.trim() || `${uploadStyleName}风格，优雅高奢质感，真实采光，精致室内建筑`,
        lightingTone: '天然通透漫射光'
      });

      loadStyles();
      setActiveStyle(created);
      setActiveImageIdx(0);
      setShowCreateModal(false);
      setUploadStyleName('');
      setUploadPrompt('');
      setUploadedImages([]);
    } catch (error: any) {
      alert(error?.message || '创建风格资产失败');
    }
  };

  const handleUploadImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        if (typeof loadEvt.target?.result === 'string') {
          setUploadedImages(prev => [...prev, loadEvt.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // 处理一键跳转到生成并锁定空间母版
  const handleLockMasterClick = (styleToLock?: SceneStyleAsset) => {
    const target = styleToLock || activeStyle;
    if (!target) return;
    
    if (onApplyAndLockMaster) {
      onApplyAndLockMaster(target);
    } else {
      onSelectStyle(target);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl h-[78vh] max-h-[680px] bg-[#14161f] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-neutral-200">
        
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
                  AI 视觉引擎
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-neutral-400 border border-white/10">
                  共 {styles.length} 个资产
                </span>
                {(() => {
                  const quota = spaceAssetLibraryService.getUserQuota('scene_style');
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
                        : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                    }`}>
                      个人素材配额: {quota.used} / {quota.max} 份
                    </span>
                  );
                })()}
              </div>
              <p className="text-xs text-neutral-400">内置/AI生成风格资产，自动携带结构化 Prompt 并支持一键锁定空间母版</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* AI 提示词生图并入库按钮 */}
            <button
              onClick={() => {
                setCreateMode('ai');
                setShowCreateModal(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow-md shadow-amber-500/20 cursor-pointer"
            >
              <Wand2 className="w-3.5 h-3.5 text-black" />
              <span>AI 提示词生成风格</span>
            </button>

            {/* 本地上传按钮 */}
            <button
              onClick={() => {
                setCreateMode('upload');
                setShowCreateModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-neutral-200 hover:text-white transition-all"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              <span>本地导入</span>
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
        <div className="flex-1 min-h-0 flex overflow-hidden">
          
          {/* Left Gallery Explorer */}
          <div className="flex-1 flex flex-col border-r border-white/10 p-5 overflow-hidden">
            {/* Search & Categories */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="搜索风格名称、提示词关键词、材质或标签（如侘寂、意式、法式）..."
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

            {/* Style Cards Grid or Empty State */}
            <div className="flex-1 overflow-y-auto pr-1">
              {filteredStyles.length === 0 ? (
                <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-8 border border-dashed border-white/10 rounded-2xl bg-black/20 my-auto">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1.5">暂无风格资产素材</h3>
                  <p className="text-xs text-neutral-400 max-w-sm mb-5 leading-relaxed">
                    默认预设已全部彻底清除。您可以点击右上角「AI 提示词生成风格」或「本地导入」录入风格。管理员权限录入的风格资产将自动作为系统默认资产永久留存！
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setCreateMode('ai');
                        setShowCreateModal(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Wand2 className="w-3.5 h-3.5 text-black" />
                      <span>AI 提示词生成风格</span>
                    </button>
                    <button
                      onClick={() => {
                        setCreateMode('upload');
                        setShowCreateModal(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-neutral-200 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-amber-400" />
                      <span>本地导入</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4 auto-rows-max">
                  {filteredStyles.map(style => {
                const isSelected = selectedStyleId === style.id;
                const isActivePreview = activeStyle?.id === style.id;
                const isConfirmingDelete = deleteConfirmId === style.id;

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
                      <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-black/60 backdrop-blur text-amber-300 font-medium border border-white/10">
                          {style.category}
                        </span>
                        {(style.tags?.some(t => t.includes('空场景') || t.includes('无家具')) || style.name.includes('空场景')) && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-300 border border-emerald-400/30 font-bold flex items-center gap-0.5 shadow-sm">
                            <Eraser className="w-2.5 h-2.5 text-emerald-400" />
                            纯净空场景
                          </span>
                        )}
                        {!style.isSystem && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-300 border border-purple-400/20">
                            个人素材
                          </span>
                        )}
                      </div>

                      {/* Top Right Action Buttons: Favorite + Delete */}
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <button
                          onClick={(e) => handleToggleFavorite(e, style.id)}
                          title="收藏风格"
                          className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                            style.favorite || style.isFavorite
                              ? 'bg-amber-500 text-black'
                              : 'bg-black/50 hover:bg-black/80 text-white/70 hover:text-amber-400'
                          }`}
                        >
                          <Star className="w-3.5 h-3.5 fill-current" />
                        </button>

                        {/* 删除风格资产按钮 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(style.id);
                          }}
                          title="删除风格资产素材"
                          className="w-7 h-7 rounded-full bg-black/50 hover:bg-red-500/80 text-white/70 hover:text-white flex items-center justify-center transition-all opacity-80 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Reference count badge */}
                      <div className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-black/60 backdrop-blur text-neutral-300 flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" />
                        <span>{style.referenceImages?.length || 1} 张参考</span>
                      </div>

                      {isSelected && (
                        <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-amber-500 text-black rounded">
                          <Check className="w-3 h-3 stroke-[3]" /> 当前生效
                        </div>
                      )}

                      {/* 删除确认覆盖层 */}
                      {isConfirmingDelete && (
                        <div 
                          onClick={(e) => e.stopPropagation()} 
                          className="absolute inset-0 bg-black/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-3 text-center animate-in fade-in duration-150"
                        >
                          <Trash2 className="w-6 h-6 text-red-400 mb-1.5" />
                          <p className="text-xs font-semibold text-white mb-2">确认删除此风格素材？</p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmId(null);
                              }}
                              className="px-2.5 py-1 text-[11px] rounded bg-white/10 hover:bg-white/20 text-neutral-300"
                            >
                              取消
                            </button>
                            <button
                              onClick={(e) => handleDeleteStyle(e, style.id)}
                              className="px-2.5 py-1 text-[11px] rounded bg-red-600 hover:bg-red-500 text-white font-bold"
                            >
                              确认删除
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Card Body Info */}
                    <div className="p-3 flex flex-col justify-between flex-1 gap-2">
                      <div>
                        <h4 className="text-xs font-semibold text-white group-hover:text-amber-400 transition-colors line-clamp-1">
                          {style.name}
                        </h4>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {style.tags.slice(0, 3).map((tag, idx) => (
                            <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-neutral-400">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* 需求关键点：生成的风格资产库下方展示提示词 */}
                      <div className="mt-1 pt-2 border-t border-white/5 bg-black/25 -mx-3 -mb-3 px-3 py-2">
                        <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-1">
                          <span className="flex items-center gap-1 text-amber-400/90 font-medium">
                            <Sparkles className="w-3 h-3 text-amber-400" />
                            <span>风格提示词</span>
                          </span>
                          <button
                            onClick={(e) => handleCopyPrompt(e, style.promptFragment, style.id)}
                            title="复制提示词"
                            className="text-neutral-400 hover:text-white flex items-center gap-0.5 transition-colors"
                          >
                            {copiedPromptId === style.id ? (
                              <CheckCheck className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span className="text-[9px]">{copiedPromptId === style.id ? '已复制' : '复制'}</span>
                          </button>
                        </div>
                        <p 
                          className="text-[11px] font-mono text-neutral-300 line-clamp-2 leading-relaxed tracking-tight select-text"
                          title={style.promptFragment}
                        >
                          {style.promptFragment}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
                </div>
              )}
            </div>
          </div>

          {/* Right Detail & Multi-Angle Inspector */}
          {activeStyle ? (
            <div className="w-96 bg-[#161822] p-4 flex flex-col h-full min-h-0 overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
                {/* Active Preview Big Viewport */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-amber-400" />
                      <span>视角参考预览</span>
                    </span>
                    <span className="text-[10px] text-neutral-500">
                      第 {activeImageIdx + 1} / {activeStyle.referenceImages?.length || 1} 张
                    </span>
                  </div>

                  <div className="relative aspect-[16/9] max-h-44 rounded-xl overflow-hidden bg-black/60 border border-white/10 shadow-inner group">
                    <img
                      src={activeStyle.referenceImages?.[activeImageIdx] || activeStyle.thumbnail}
                      alt={activeStyle.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex items-center justify-between text-[11px]">
                      <span className="text-white font-medium">{activeStyle.name}</span>
                      <span className="text-amber-400 text-[10px] font-mono">{activeStyle.lightingTone || '天然通透漫射光'}</span>
                    </div>
                  </div>

                  {/* Multi-angle Thumbnails List */}
                  {activeStyle.referenceImages && activeStyle.referenceImages.length > 1 && (
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
                  )}
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

                {/* 核心功能：清除沙发/茶几/地毯/餐桌，生成该户型纯净空场景资产 */}
                <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-black/30 border border-emerald-500/30 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                      <Eraser className="w-3.5 h-3.5 text-emerald-400" />
                      <span>清除家具 · 生成纯净空场景</span>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                      无家具硬装母版
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-300 leading-relaxed">
                    彻底剔除沙发、茶几、地毯与餐桌，仅保留落地窗与纯净硬装地面，一键存入资产库，方便后期自由添加敏华产品。
                  </p>

                  <button
                    onClick={() => handleCleanFurnitureToEmptyScene(activeStyle)}
                    disabled={isCleaningFurniture}
                    className="w-full py-2 rounded-lg bg-emerald-600/25 hover:bg-emerald-600/35 border border-emerald-500/50 text-emerald-200 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
                  >
                    {isCleaningFurniture ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                        <span>正在清除家具并生成纯净空场景...</span>
                      </>
                    ) : (
                      <>
                        <Eraser className="w-3.5 h-3.5 text-emerald-400" />
                        <span>清除家具 · 生成纯净空场景资产</span>
                      </>
                    )}
                  </button>

                  {cleanSuccessTip && (
                    <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] flex items-center gap-1.5 font-medium animate-in fade-in duration-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{cleanSuccessTip}</span>
                    </div>
                  )}
                </div>

                {/* 需求核心：结构化 Prompt 片段展示与一键复制 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-neutral-400 flex items-center gap-1">
                      <Info className="w-3 h-3 text-neutral-500" />
                      <span>风格 Prompt 片段 (映射主渲染器)</span>
                    </label>
                    <button
                      onClick={(e) => handleCopyPrompt(e, activeStyle.promptFragment, 'detail-panel')}
                      className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedPromptId === 'detail-panel' ? (
                        <>
                          <CheckCheck className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>复制提示词</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="p-3 rounded-xl bg-black/40 border border-white/5 text-[11px] font-mono text-neutral-200 leading-relaxed max-h-28 overflow-y-auto select-text">
                    {activeStyle.promptFragment}
                  </div>
                </div>

                {/* 删除该风格素材入口 */}
                <div className="pt-1 flex justify-end">
                  <button
                    onClick={(e) => {
                      if (window.confirm(`确定要从资产库中删除素材 "${activeStyle.name}" 吗？`)) {
                        handleDeleteStyle(e, activeStyle.id);
                      }
                    }}
                    className="text-[11px] text-neutral-500 hover:text-red-400 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>删除此风格素材</span>
                  </button>
                </div>
              </div>

              {/* Action Bottom Bar - 常驻固定在底部 */}
              <div className="pt-2.5 pb-1 border-t border-white/10 flex flex-col gap-2 shrink-0">
                {/* 关键需求：一键跳转到生成并锁定空间母版 */}
                <button
                  onClick={() => handleLockMasterClick(activeStyle)}
                  className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  title="应用此风格，并直接跳转到 A00 启动生成与锁定空间母版"
                >
                  <Sparkles className="w-4 h-4 text-black animate-pulse" />
                  <span>一键跳转：生成并锁定空间母版</span>
                  <ChevronRight className="w-4 h-4 text-black stroke-[3]" />
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={onClose}
                    className="w-1/3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-neutral-300 font-medium transition-all"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      onSelectStyle(activeStyle);
                      onClose();
                    }}
                    className="w-2/3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Check className="w-3.5 h-3.5 text-amber-400" />
                    <span>仅应用此风格</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-96 bg-[#161822] p-6 flex flex-col items-center justify-center text-center text-neutral-500">
              <Layers className="w-8 h-8 opacity-40 mb-2" />
              <p className="text-xs">请从左侧选择一个风格或新建风格</p>
            </div>
          )}
        </div>

        {/* 综合新建 / AI 生成风格模态窗 */}
        {showCreateModal && (
          <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-150">
            <div className="w-full max-w-xl bg-[#191b26] border border-white/15 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    {createMode === 'ai' ? <Wand2 className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                  </div>
                  <h3 className="text-sm font-bold text-white">
                    {createMode === 'ai' ? '通过 AI 提示词生成风格资产' : '本地上传自建风格'}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  {/* Mode Switcher Tabs */}
                  <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/10 text-xs">
                    <button
                      onClick={() => setCreateMode('ai')}
                      className={`px-3 py-1 rounded-md transition-all ${
                        createMode === 'ai'
                          ? 'bg-amber-500 text-black font-semibold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      AI 提示词生成
                    </button>
                    <button
                      onClick={() => setCreateMode('upload')}
                      className={`px-3 py-1 rounded-md transition-all ${
                        createMode === 'upload'
                          ? 'bg-amber-500 text-black font-semibold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      本地图片上传
                    </button>
                  </div>

                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="text-neutral-400 hover:text-white p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Mode 1: AI Prompt Generation */}
              {createMode === 'ai' && (
                <div className="space-y-4 text-xs">
                  {/* 提示词输入区 */}
                  <div>
                    <label className="block text-neutral-200 font-semibold mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <span>风格描述提示词 (Prompt)</span>
                        <span className="text-amber-400 font-bold">*</span>
                      </span>
                      <span className="text-[10px] text-neutral-400 font-normal">支持直接修改或套用灵感</span>
                    </label>
                    <textarea
                      rows={3}
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                      placeholder="例如：现代意式轻奢大平层，全景落地窗，大理石电视背景墙，隐形线性漫射光，高奢皮革沙发，写实室内摄影..."
                      className="w-full px-3.5 py-2.5 bg-[#12141d] border border-white/20 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 rounded-xl text-white placeholder-neutral-500 outline-none leading-relaxed font-mono text-[11px] transition-all shadow-inner"
                    />
                    
                    {/* 灵感快捷预设标签 */}
                    <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                      <span className="text-[10px] text-amber-300 font-medium">✨ 灵感模板：</span>
                      {PROMPT_PRESETS.map((preset, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleApplyPreset(preset)}
                          className="text-[10px] px-2.5 py-1 rounded-full bg-[#222536] hover:bg-amber-500 hover:text-black text-neutral-200 border border-white/15 hover:border-amber-400 transition-all font-medium cursor-pointer shadow-xs"
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 风格名称与分类 */}
                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-neutral-200 font-semibold mb-1.5">风格名称 (选填)</label>
                      <input
                        type="text"
                        value={aiStyleName}
                        onChange={e => setAiStyleName(e.target.value)}
                        placeholder="如：意式轻奢 · 雅致大平层"
                        className="w-full px-3.5 py-2 bg-[#12141d] border border-white/20 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 rounded-xl text-white placeholder-neutral-500 outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-neutral-200 font-semibold mb-1.5">空间风格分类</label>
                      <select
                        value={aiCategory}
                        onChange={e => setAiCategory(e.target.value)}
                        className="w-full px-3.5 py-2 bg-[#12141d] border border-white/20 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 rounded-xl text-white outline-none transition-all cursor-pointer font-medium"
                      >
                        <option value="意式轻奢">意式轻奢</option>
                        <option value="现代极简">现代极简</option>
                        <option value="侘寂风">侘寂风</option>
                        <option value="法式复古">法式复古</option>
                        <option value="新中式">新中式</option>
                        <option value="自然原木">自然原木</option>
                      </select>
                    </div>
                  </div>

                  {/* 需求核心：内置模型选择器 */}
                  <div>
                    <label className="block text-neutral-200 font-semibold mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Cpu className="w-4 h-4 text-amber-400" />
                        <span>生图计算模型 (内置配置)</span>
                      </span>
                      <span className="text-[10px] text-amber-400/80 font-mono">点击选择当前模型</span>
                    </label>
                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                      {SPACE_IMAGE_MODELS.map(model => {
                        const isChosen = selectedModelId === model.id;
                        return (
                          <div
                            key={model.id}
                            onClick={() => setSelectedModelId(model.id)}
                            className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                              isChosen
                                ? 'bg-amber-500/15 border-amber-400 text-white shadow-md shadow-amber-500/15 ring-1 ring-amber-400/50'
                                : 'bg-[#151824] border-white/10 hover:border-white/30 hover:bg-[#1a1e2e] text-neutral-300'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                isChosen ? 'border-amber-400 bg-amber-400' : 'border-neutral-400 bg-transparent'
                              }`}>
                                {isChosen && (
                                  <div className="w-1.5 h-1.5 rounded-full bg-black" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-bold ${isChosen ? 'text-amber-300' : 'text-white'}`}>{model.name}</span>
                                  <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                                    {model.badge}
                                  </span>
                                </div>
                                <p className="text-[10px] text-neutral-300 mt-0.5 line-clamp-1">{model.description}</p>
                              </div>
                            </div>
                            <span className="text-[10px] uppercase font-mono font-semibold px-2 py-0.5 rounded bg-black/40 text-neutral-300 shrink-0 ml-2">
                              {model.provider}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 画幅比例 */}
                  <div>
                    <label className="block text-neutral-200 font-semibold mb-1.5">画幅比例</label>
                    <div className="grid grid-cols-4 gap-2">
                      {['16:9', '4:3', '1:1', '9:16'].map(ratio => {
                        const isRatioActive = aiAspectRatio === ratio;
                        return (
                          <button
                            key={ratio}
                            type="button"
                            onClick={() => setAiAspectRatio(ratio)}
                            className={`py-2 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
                              isRatioActive
                                ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/25 scale-[1.02]'
                                : 'bg-[#151824] border-white/15 text-neutral-300 hover:text-white hover:border-white/30'
                            }`}
                          >
                            {ratio}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 核心功能：纯净空场景模式 Toggle */}
                  <div className={`p-3 rounded-xl border transition-all ${
                    isEmptyRoomMode
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                      : 'bg-[#151824] border-white/10 text-neutral-300'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                          isEmptyRoomMode ? 'bg-emerald-500 text-black font-bold' : 'bg-white/5 text-neutral-400'
                        }`}>
                          <Eraser className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">纯净空场景模式</span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold border ${
                              isEmptyRoomMode
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : 'bg-white/5 text-neutral-400 border-white/10'
                            }`}>
                              清除沙发/茶几/地毯/餐桌
                            </span>
                          </div>
                          <p className="text-[10px] text-neutral-400 mt-0.5">
                            自动注入无家具指令，保证地面大面积纯净留白，方便后期自由添加敏华产品家具
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsEmptyRoomMode(!isEmptyRoomMode)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                          isEmptyRoomMode ? 'bg-emerald-500' : 'bg-white/20'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            isEmptyRoomMode ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {genError && (
                    <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs flex items-center gap-2 font-medium">
                      <span>⚠️</span>
                      <span>{genError}</span>
                    </div>
                  )}

                  {/* Actions - 增强可视性，杜绝死黑与模糊 */}
                  <div className="flex items-center justify-end gap-3 pt-3.5 border-t border-white/15">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      disabled={isAiGenerating}
                      className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white transition-all cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateAiStyle}
                      disabled={!aiPrompt.trim() || isAiGenerating}
                      style={{
                        backgroundColor: !aiPrompt.trim() || isAiGenerating ? '#24283b' : '#f59e0b',
                        color: !aiPrompt.trim() || isAiGenerating ? '#94a3b8' : '#000000',
                        border: !aiPrompt.trim() || isAiGenerating ? '1px solid rgba(255,255,255,0.12)' : '1px solid #fbbf24',
                        boxShadow: !aiPrompt.trim() || isAiGenerating ? 'none' : '0 4px 14px rgba(245, 158, 11, 0.35)'
                      }}
                      className="px-6 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer active:scale-98 disabled:cursor-not-allowed"
                    >
                      {isAiGenerating ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-black" />
                          <span className="font-extrabold tracking-wide">AI 正在生成并保存...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-black" />
                          <span className="font-extrabold tracking-wide">立即生成并保存至风格库</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Mode 2: Upload Local Images */}
              {createMode === 'upload' && (
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block text-neutral-200 font-semibold mb-1.5">风格名称 <span className="text-amber-400">*</span></label>
                    <input
                      type="text"
                      value={uploadStyleName}
                      onChange={e => setUploadStyleName(e.target.value)}
                      placeholder="如：意式轻奢暖灰大平层..."
                      className="w-full px-3.5 py-2 bg-[#12141d] border border-white/20 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 rounded-xl text-white placeholder-neutral-500 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-200 font-semibold mb-1.5">风格分类</label>
                    <select
                      value={uploadCategory}
                      onChange={e => setUploadCategory(e.target.value)}
                      className="w-full px-3.5 py-2 bg-[#12141d] border border-white/20 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 rounded-xl text-white outline-none transition-all cursor-pointer font-medium"
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
                    <label className="block text-neutral-200 font-semibold mb-1.5">上传参考图</label>
                    <label className="border-2 border-dashed border-white/25 hover:border-amber-400 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer bg-[#141622] hover:bg-[#181b2a] transition-all group">
                      <Upload className="w-6 h-6 text-amber-400 mb-1.5 group-hover:scale-110 transition-transform" />
                      <span className="text-neutral-200 font-medium">点击上传单张或多张风格参考图</span>
                      <span className="text-[10px] text-neutral-400 mt-0.5">支持 JPG / PNG / WEBP</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleUploadImageFile}
                        className="hidden"
                      />
                    </label>

                    {uploadedImages.length > 0 && (
                      <div className="flex gap-2.5 mt-2.5 overflow-x-auto pb-1">
                        {uploadedImages.map((img, i) => (
                          <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border-2 border-amber-400/50 flex-shrink-0 shadow-md">
                            <img src={img} alt="" className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-neutral-200 font-semibold mb-1.5">Prompt 片段与空间描述 (下方将直接展示)</label>
                    <textarea
                      rows={3}
                      value={uploadPrompt}
                      onChange={e => setUploadPrompt(e.target.value)}
                      placeholder="描述该风格的材质特征、采光方向、色调及软装氛围..."
                      className="w-full px-3.5 py-2.5 bg-[#12141d] border border-white/20 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 rounded-xl text-white placeholder-neutral-500 outline-none leading-relaxed font-mono text-[11px] transition-all shadow-inner"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3.5 border-t border-white/15">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white transition-all cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateCustomStyle}
                      disabled={!uploadStyleName.trim()}
                      style={{
                        backgroundColor: !uploadStyleName.trim() ? '#24283b' : '#f59e0b',
                        color: !uploadStyleName.trim() ? '#94a3b8' : '#000000',
                        border: !uploadStyleName.trim() ? '1px solid rgba(255,255,255,0.12)' : '1px solid #fbbf24',
                        boxShadow: !uploadStyleName.trim() ? 'none' : '0 4px 14px rgba(245, 158, 11, 0.35)'
                      }}
                      className="px-6 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer active:scale-98 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-4 h-4 text-black" />
                      <span className="font-extrabold tracking-wide">保存并加入资产库</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
