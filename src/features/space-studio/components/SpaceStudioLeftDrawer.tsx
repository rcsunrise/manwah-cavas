// src/features/space-studio/components/SpaceStudioLeftDrawer.tsx
import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutTemplate,
  Package,
  Palette,
  Camera,
  ChevronLeft,
  ChevronDown,
  Check,
  Sparkles,
  Layers,
  Building,
  RefreshCw,
  Box,
  SlidersHorizontal,
  Upload,
  Plus,
  Edit3,
  Trash2,
  Tag,
  ShieldCheck,
  CheckCircle2,
  Maximize2,
  Sun,
  Moon,
  Ruler,
  Cpu,
  FileCheck,
  Info,
  Boxes,
  CheckCheck,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X
} from 'lucide-react';
import { SpacePreset, StylePreset, ProductAsset, ShotInstance } from '../../../types/spaceStudio';
import { recommendStylesForProduct } from '../engine/styleRecommendationEngine';

interface SpaceStudioLeftDrawerProps {
  spaces: SpacePreset[];
  selectedSpace: SpacePreset;
  onSelectSpace: (space: SpacePreset) => void;

  styles: StylePreset[];
  selectedStyle: StylePreset;
  onSelectStyle: (style: StylePreset) => void;

  products: ProductAsset[];
  onSyncFromCanvas?: () => void;
  onOpenUploadModal?: (productToEdit?: ProductAsset | null) => void;
  onAddProduct?: (product: ProductAsset) => void;
  onBatchAddProducts?: (products: ProductAsset[]) => void;
  onUpdateProduct?: (product: ProductAsset) => void;
  onRemoveProduct?: (productId: string) => void;
  onSetPrimaryProduct?: (productId: string) => void;
  onToggleEnsembleInclude?: (productId: string) => void;
  onBatchToggleEnsemble?: (allIncluded: boolean) => void;

  shots: ShotInstance[];
  activeShotIndex: number;
  onSelectShot: (index: number) => void;

  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;

  drawerWidth?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

type TabKey = 'space' | 'product' | 'style' | 'camera';

export const SpaceStudioLeftDrawer: React.FC<SpaceStudioLeftDrawerProps> = ({
  spaces,
  selectedSpace,
  onSelectSpace,
  styles,
  selectedStyle,
  onSelectStyle,
  products,
  onSyncFromCanvas,
  onOpenUploadModal,
  onAddProduct,
  onBatchAddProducts,
  onUpdateProduct,
  onRemoveProduct,
  onSetPrimaryProduct,
  onToggleEnsembleInclude,
  onBatchToggleEnsemble,
  shots,
  activeShotIndex,
  onSelectShot,
  theme = 'dark',
  onToggleTheme,
  drawerWidth = 336,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<TabKey>('product');
  const [newTagInput, setNewTagInput] = useState<string>('');
  const [showTagInput, setShowTagInput] = useState<boolean>(false);
  const [newRuleInput, setNewRuleInput] = useState<string>('');
  const [showRuleInput, setShowRuleInput] = useState<boolean>(false);
  // 产品细节折叠状态 (支持各模块收起展开，核心主品参数类内容默认折叠，保持版面整洁)
  const [isReadoutsCollapsed, setIsReadoutsCollapsed] = useState<boolean>(true);
  const [isFeaturesCollapsed, setIsFeaturesCollapsed] = useState<boolean>(true);
  const [isRulesCollapsed, setIsRulesCollapsed] = useState<boolean>(true);
  const [isEnsembleBreakdownCollapsed, setIsEnsembleBreakdownCollapsed] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 产品大图高保真放大预览 Lightbox 状态
  const [zoomedProduct, setZoomedProduct] = useState<{
    imageUrl: string;
    name: string;
    sku?: string;
    dimensions?: { width: number; depth: number; height?: number };
    materials?: string[];
    colors?: string[];
    roleTitle?: string;
  } | null>(null);
  const [lightboxScale, setLightboxScale] = useState<number>(1);

  // 风格库大类筛选状态 (全部 / 欧美住宅 / 国际现代 / 东方住宅)
  const [styleCategoryFilter, setStyleCategoryFilter] = useState<string>('all');

  // 支持键盘 Esc 键退出大图预览
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && zoomedProduct) {
        setZoomedProduct(null);
        setLightboxScale(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomedProduct]);

  const isLight = theme === 'light';

  const navButtons = [
    { key: 'space' as TabKey, label: '空间户型', icon: LayoutTemplate },
    { key: 'product' as TabKey, label: '产品', icon: Package },
    { key: 'style' as TabKey, label: '美学硬装', icon: Palette },
    { key: 'camera' as TabKey, label: '摄影机位', icon: Camera }
  ];

  const primaryProduct = products.find((p) => p.priority === 'primary') || products[0];

  // 一键将主品总图解构出的全部单品导入并展开到搭配库
  const handleDeployEnsembleToLibrary = () => {
    if (!primaryProduct?.detectedProducts || primaryProduct.detectedProducts.length <= 1) return;
    const ensembleId = primaryProduct.ensembleId || `ens-${Date.now().toString(36)}`;
    const masterImg = primaryProduct.sourceMasterImageUrl || primaryProduct.referenceImages?.[0]?.publicUrl || '';

    const newAssets: ProductAsset[] = primaryProduct.detectedProducts.map((dp, idx) => {
      const isFirst = idx === 0;
      const prodId = dp.id.startsWith('item-') ? `prod-ens-${dp.id}` : dp.id;
      const cropUrl = dp.cropBase64 || dp.cropImageUrl;

      const isArmlessOrNonFunc =
        dp.role === 'lounge_chair' ||
        dp.functionCapable === false ||
        (dp.name && /(休闲|无扶手|矮椅|旋转|单椅|焦糖)/.test(dp.name) && !/(功能|电动|头等舱|展开|太空舱)/.test(dp.name));
      const resolvedRole = isArmlessOrNonFunc && dp.role === 'recliner_1seat' ? 'lounge_chair' : dp.role;

      return {
        id: isFirst ? primaryProduct.id : prodId,
        name: dp.name,
        sku: dp.sku || `MW-CH-${Math.floor(1000 + Math.random() * 9000)}-${idx + 1}`,
        role: resolvedRole as any,
        priority: isFirst ? ('primary' as const) : ('secondary' as const),
        identityLock: 'strict' as const,
        dimensions: dp.dimensions,
        materials: dp.materials,
        colors: dp.colors,
        adaptiveStyles: dp.adaptiveStyles || primaryProduct.adaptiveStyles,
        surfaceTexture: dp.surfaceTexture || primaryProduct.surfaceTexture,
        functionCapable: typeof dp.functionCapable === 'boolean'
          ? dp.functionCapable
          : isArmlessOrNonFunc
          ? false
          : (resolvedRole === 'sofa_3seat' || resolvedRole === 'sofa_2seat' || resolvedRole === 'recliner_1seat'),
        isEnsembleIncluded: true,
        referenceImages: cropUrl
          ? [
              {
                id: `ref-crop-${idx + 1}`,
                type: 'front' as const,
                objectKey: `projects/manwah/products/${prodId}/refs/crop/original.webp`,
                publicUrl: cropUrl,
                verified: true
              }
            ]
          : primaryProduct.referenceImages || [],
        cropBase64: dp.cropBase64,
        cropImageUrl: dp.cropImageUrl,
        sourceMasterImageUrl: masterImg,
        sourceBoundingBox: dp.boundingBox,
        ensembleId,
        ensembleRoleTitle: dp.roleTitle || dp.name,
        structuralFeatures: primaryProduct.structuralFeatures,
        lockedRules: dp.lockedRules || primaryProduct.lockedRules,
        readoutConfidence: primaryProduct.readoutConfidence || 96,
        dossierSummary: dp.dossierSummary || `${dp.name} · 索引来自主品总图切片`,
        dossierGeneratedAt: new Date().toISOString(),
        provenance: 'MANUAL_CONFIRMED' as const,
        productionTruth: true,
        sourceType: 'upload' as const
      };
    });

    if (onBatchAddProducts) {
      onBatchAddProducts(newAssets);
    } else if (onAddProduct) {
      newAssets.forEach((p) => {
        if (p.id !== primaryProduct.id) {
          onAddProduct(p);
        }
      });
    }
  };

  // Quick upload handler directly from left drawer
  const handleQuickUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const base64 = uploadEvent.target?.result as string;
      const newProd: ProductAsset = {
        id: `prod-${Date.now().toString(36)}`,
        name: file.name.replace(/\.[^/.]+$/, ''),
        sku: `MW-${Date.now().toString().slice(-6)}`,
        role: 'sofa_3seat',
        priority: products.length === 0 ? 'primary' : 'secondary',
        identityLock: 'strict',
        dimensions: { width: 3100, depth: 1080, height: 950 },
        materials: ['头层半苯胺真皮', '高档绒面科技布'],
        colors: ['极地米白', '云雾暖灰'],
        surfaceTexture: '细腻平纹半苯胺真皮，天然透气毛孔，手工法式立体双缝线',
        functionCapable: true,
        referenceImages: [
          {
            id: `ref-${Date.now()}`,
            type: 'front',
            objectKey: `uploads/products/${file.name}`,
            publicUrl: base64,
            verified: true
          }
        ],
        structuralFeatures: [
          { name: '立体双包线扶手', description: '手工弧形法式滚边双包线工艺' },
          { name: '电动展开功能位', description: '德国超静音低压电机，110°~160°自由调节' },
          { name: '分段式护腰靠包', description: '高回弹环保海绵与鹅绒黄金配比分段支撑' },
          { name: '高碳钢隐藏式底脚', description: '哑光黑色承重五金脚，坚固耐磨' }
        ],
        lockedRules: [
          '绝对锁定原产品皮革色温与缝线工艺',
          '绝对维持五金脚部与功能架物理比例',
          '锁定 1:1 工业真值宽高比（杜绝拉伸形变）'
        ],
        provenance: 'MANUAL_CONFIRMED',
        productionTruth: true,
        sourceType: 'upload'
      };

      if (onAddProduct) {
        onAddProduct(newProd);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Add tag to primary product
  const handleAddFeatureTag = () => {
    if (!newTagInput.trim() || !primaryProduct || !onUpdateProduct) return;
    const currentFeatures = primaryProduct.structuralFeatures || [];
    const updatedFeatures = [
      ...currentFeatures,
      { name: newTagInput.trim(), description: '用户自定义特征标记' }
    ];
    onUpdateProduct({
      ...primaryProduct,
      structuralFeatures: updatedFeatures
    });
    setNewTagInput('');
    setShowTagInput(false);
  };

  // Remove tag
  const handleRemoveFeatureTag = (tagName: string) => {
    if (!primaryProduct || !onUpdateProduct) return;
    const updatedFeatures = (primaryProduct.structuralFeatures || []).filter(
      (f) => f.name !== tagName
    );
    onUpdateProduct({
      ...primaryProduct,
      structuralFeatures: updatedFeatures
    });
  };

  // Add rule to primary product
  const handleAddRule = () => {
    if (!newRuleInput.trim() || !primaryProduct || !onUpdateProduct) return;
    const currentRules = primaryProduct.lockedRules || [];
    onUpdateProduct({
      ...primaryProduct,
      lockedRules: [...currentRules, newRuleInput.trim()]
    });
    setNewRuleInput('');
    setShowRuleInput(false);
  };

  // Remove rule
  const handleRemoveRule = (ruleIndex: number) => {
    if (!primaryProduct || !onUpdateProduct) return;
    const currentRules = primaryProduct.lockedRules || [];
    onUpdateProduct({
      ...primaryProduct,
      lockedRules: currentRules.filter((_, i) => i !== ruleIndex)
    });
  };

  return (
    <div className="relative flex h-full select-none z-30 shrink-0">
      {/* 1. Leftmost Icon Dock */}
      <div
        className={`w-14 border-r flex flex-col items-center py-4 gap-4 shrink-0 transition-colors ${
          isLight ? 'bg-[#FAF8F5] border-stone-200' : 'bg-stone-950 border-stone-800'
        }`}
      >
        {navButtons.map((btn) => {
          const Icon = btn.icon;
          const isActive = activeTab === btn.key && isOpen && !isCollapsed;
          return (
            <button
              key={btn.key}
              onClick={() => {
                if (isCollapsed) {
                  if (onToggleCollapse) onToggleCollapse();
                  setActiveTab(btn.key);
                  setIsOpen(true);
                } else if (activeTab === btn.key && isOpen) {
                  if (onToggleCollapse) {
                    onToggleCollapse();
                  } else {
                    setIsOpen(false);
                  }
                } else {
                  setActiveTab(btn.key);
                  setIsOpen(true);
                }
              }}
              className={`relative w-10 h-10 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                isActive
                  ? isLight
                    ? 'text-amber-800 font-bold'
                    : 'text-amber-400 font-bold'
                  : isLight
                  ? 'text-stone-500 hover:text-stone-900 hover:bg-stone-200/60'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
              }`}
              title={btn.label}
            >
              {isActive && (
                <motion.div
                  layoutId="activeDockTabIndicator"
                  className={`absolute inset-0 rounded-xl border ${
                    isLight
                      ? 'bg-amber-500/20 border-amber-500/60 shadow-xs'
                      : 'bg-amber-600/30 border-amber-500/50 shadow-sm'
                  }`}
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                />
              )}
              <span className="relative z-10 flex flex-col items-center justify-center gap-0.5">
                <Icon className="w-4 h-4" />
                <span className="text-[9px] scale-90">{btn.label}</span>
              </span>
            </button>
          );
        })}

        {/* Theme toggle icon button at bottom of dock */}
        {onToggleTheme && (
          <div className="mt-auto pt-2 border-t border-stone-700/30 flex flex-col items-center">
            <button
              onClick={onToggleTheme}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition cursor-pointer ${
                isLight
                  ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  : 'bg-stone-800 text-amber-400 hover:bg-stone-700'
              }`}
              title={isLight ? '切换为黑色系UI' : '切换为白色系UI'}
            >
              {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>

      {/* 2. Expandable Content Drawer */}
      {isOpen && !isCollapsed && (
        <div
          style={{ width: `${drawerWidth}px` }}
          className={`border-r flex flex-col h-full overflow-hidden animate-in slide-in-from-left duration-200 transition-[width,background-color] ${
            isLight ? 'bg-white border-stone-200 text-stone-800' : 'bg-stone-900 border-stone-800 text-stone-200'
          }`}
        >
          {/* Header */}
          <div
            className={`px-4 py-3 border-b flex items-center justify-between shrink-0 ${
              isLight ? 'border-stone-200 bg-[#FAF8F5]' : 'border-stone-800 bg-stone-900'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-xs">
              <span className={isLight ? 'text-amber-700' : 'text-amber-400'}>
                {activeTab === 'space' && <LayoutTemplate className="w-4 h-4 inline mr-1.5" />}
                {activeTab === 'product' && <Package className="w-4 h-4 inline mr-1.5" />}
                {activeTab === 'style' && <Palette className="w-4 h-4 inline mr-1.5" />}
                {activeTab === 'camera' && <Camera className="w-4 h-4 inline mr-1.5" />}
              </span>
              <span>{navButtons.find((b) => b.key === activeTab)?.label}</span>
              {activeTab === 'product' && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    isLight ? 'bg-amber-100 text-amber-800' : 'bg-stone-800 text-amber-400'
                  }`}
                >
                  {products.length} 款
                </span>
              )}
            </div>
            <button
              onClick={() => {
                if (onToggleCollapse) {
                  onToggleCollapse();
                } else {
                  setIsOpen(false);
                }
              }}
              className={`p-1 rounded transition cursor-pointer ${
                isLight ? 'text-stone-400 hover:text-stone-800 hover:bg-stone-100' : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
              }`}
              title="收起侧栏面板"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Body (增加 pb-28 安全留白，避免被底部画册镜头导航遮挡) */}
          <div className="flex-1 overflow-y-auto p-3.5 pb-28 space-y-3.5 text-xs">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="space-y-3.5"
              >
                {/* TAB 1: 空间户型 */}
                {activeTab === 'space' && (
              <div className="space-y-2.5">
                <div className={`text-[11px] font-medium px-1 flex items-center justify-between ${isLight ? 'text-stone-500' : 'text-stone-400'}`}>
                  <span>精选 6 大室内空间原型</span>
                  <span className={`text-[10px] font-mono ${isLight ? 'text-amber-700' : 'text-amber-400/80'}`}>
                    当前: {selectedSpace.code}
                  </span>
                </div>

                {spaces.map((sp) => {
                  const isSelected = sp.id === selectedSpace.id;
                  return (
                    <div
                      key={sp.id}
                      onClick={() => onSelectSpace(sp)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? isLight
                            ? 'bg-amber-50 border-amber-500 shadow-xs ring-1 ring-amber-400/30'
                            : 'bg-amber-950/30 border-amber-500/80 shadow-md ring-1 ring-amber-500/30'
                          : isLight
                          ? 'bg-[#FAF8F5] border-stone-200 hover:border-stone-300 hover:bg-white text-stone-700'
                          : 'bg-stone-950/60 border-stone-800 hover:border-stone-700 hover:bg-stone-800/40 text-stone-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded ${
                              isSelected
                                ? 'bg-amber-500 text-stone-950 font-bold'
                                : isLight
                                ? 'bg-stone-200 text-stone-700'
                                : 'bg-stone-800 text-stone-400'
                            }`}
                          >
                            {sp.code}
                          </span>
                          <span
                            className={`font-semibold text-xs ${
                              isSelected ? (isLight ? 'text-amber-950 font-bold' : 'text-amber-200') : isLight ? 'text-stone-800' : 'text-stone-200'
                            }`}
                          >
                            {sp.name.split(' (')[0]}
                          </span>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-amber-500 shrink-0" />}
                      </div>

                      <div className={`text-[11px] line-clamp-2 leading-relaxed pl-1 ${isLight ? 'text-stone-500' : 'text-stone-400'}`}>
                        {sp.signatureFeatures.slice(0, 3).join(' · ')}
                      </div>

                      <div className={`mt-2 flex items-center gap-2 text-[10px] font-mono pl-1 ${isLight ? 'text-stone-400' : 'text-stone-500'}`}>
                        <span>层高: {sp.ceilingHeight || 3.2}m</span>
                        <span>·</span>
                        <span>分区: {sp.zones.length} 核心功能区</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB 2: 产品 (WHAT) */}
            {activeTab === 'product' && (
              <div className="space-y-3">
                {/* 1. 操作栏：自主上传产品 + 从画布同步 */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenUploadModal) {
                        onOpenUploadModal(null);
                      } else if (fileInputRef.current) {
                        fileInputRef.current.click();
                      }
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl font-bold text-xs transition shadow-xs cursor-pointer ${
                      isLight
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : 'bg-amber-600 hover:bg-amber-500 text-white'
                    }`}
                    title="录入产品资产与多模态读数 (支持本地上传、拖拽或直接按 Ctrl+V 粘贴截图)"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>录入产品图</span>
                  </button>

                  {onSyncFromCanvas && (
                    <button
                      type="button"
                      onClick={onSyncFromCanvas}
                      className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border font-semibold text-xs transition cursor-pointer ${
                        isLight
                          ? 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-300'
                          : 'bg-stone-800/80 hover:bg-stone-800 text-stone-300 border-stone-700'
                      }`}
                      title="从视觉企划创意画布一键导入解析出的产品真值"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                      <span>同步画布产品</span>
                    </button>
                  )}
                </div>

                {/* 隐藏式快速上传 input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleQuickUpload}
                  className="hidden"
                />

                {/* 1.5 场景产品套组概览与合理搭配校验看板 (Ensemble & Smart Compatibility) */}
                {(() => {
                  const ensembleProducts = products.filter(
                    (p) => p.priority === 'primary' || p.isEnsembleIncluded !== false
                  );
                  const totalCount = products.length;
                  const ensembleCount = ensembleProducts.length;

                  // 角色分布统计
                  const sofaCount = ensembleProducts.filter(
                    (p) => p.role === 'sofa_3seat' || p.role === 'sofa_2seat'
                  ).length;
                  const reclinerCount = ensembleProducts.filter(
                    (p) => p.role === 'recliner_1seat'
                  ).length;
                  const tableCount = ensembleProducts.filter(
                    (p) => p.role === 'coffee_table' || p.role === 'side_table'
                  ).length;

                  let validationType: 'success' | 'warning' | 'info' = 'info';
                  let validationTitle = '场景套组就绪';
                  let validationDesc = `已关联 ${ensembleCount} 款产品协同编排进入当前场景。`;

                  if (sofaCount > 1) {
                    validationType = 'warning';
                    validationTitle = '主位动线拥堵提示';
                    validationDesc = `当前勾选了 ${sofaCount} 款主位大沙发，易造成客厅拥挤冲突。建议保留 1 款主沙发，其余搭配单椅或茶几。`;
                  } else if (sofaCount === 1 && tableCount >= 1 && reclinerCount >= 1) {
                    validationType = 'success';
                    validationTitle = '黄金客厅套组 (3+1+几)';
                    validationDesc = '主沙发 + 单人躺椅 + 奢石茶几，符合人体工学与开阔动线规范。';
                  } else if (sofaCount === 1 && tableCount >= 1) {
                    validationType = 'success';
                    validationTitle = '极简客厅套组 (主沙发+茶几)';
                    validationDesc = '开阔通透，视线延伸感强，适合大平层空间母版视角。';
                  } else if (sofaCount === 1 && reclinerCount >= 1) {
                    validationType = 'info';
                    validationTitle = '双座休闲套组';
                    validationDesc = '已组合主沙发与功能单椅，可按需勾选茶几以丰富视觉层次。';
                  } else if (ensembleCount === 1) {
                    validationType = 'info';
                    validationTitle = '核心单品聚焦';
                    validationDesc = '当前仅勾选主件，适用于大特写镜头或单品极简陈设。';
                  }

                  return (
                    <div
                      className={`p-3 rounded-xl border space-y-2 transition-all ${
                        isLight
                          ? validationType === 'warning'
                            ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                            : validationType === 'success'
                            ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                            : 'bg-stone-50 border-stone-200 text-stone-800'
                          : validationType === 'warning'
                          ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                          : validationType === 'success'
                          ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                          : 'bg-stone-900/60 border-stone-800 text-stone-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 font-bold text-xs">
                          <Layers className="w-3.5 h-3.5 text-amber-500" />
                          <span>场景产品套组 ({ensembleCount}/{totalCount})</span>
                        </div>
                        {onBatchToggleEnsemble && totalCount > 1 && (
                          <div className="flex items-center gap-1 text-[10px]">
                            <button
                              type="button"
                              onClick={() => onBatchToggleEnsemble(true)}
                              className="px-1.5 py-0.5 rounded text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                            >
                              全选关联
                            </button>
                            <span className="text-stone-400">|</span>
                            <button
                              type="button"
                              onClick={() => onBatchToggleEnsemble(false)}
                              className="px-1.5 py-0.5 rounded text-stone-500 hover:underline cursor-pointer"
                            >
                              仅留主品
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="text-[11px] leading-relaxed flex items-start gap-1.5">
                        <span className="shrink-0 mt-0.5">
                          {validationType === 'warning' ? '⚠️' : validationType === 'success' ? '✓' : '💡'}
                        </span>
                        <div>
                          <div className="font-bold">{validationTitle}</div>
                          <div className="text-[10px] mt-0.5 opacity-85">{validationDesc}</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* 2. 主选产品卡片 (含完整读数与标记) */}
                {primaryProduct && (
                  <div
                    className={`p-3.5 rounded-xl border space-y-3 shadow-xs ${
                      isLight
                        ? 'bg-[#FAF8F5] border-amber-300/80 ring-1 ring-amber-300/40'
                        : 'bg-stone-950/90 border-amber-500/50'
                    }`}
                  >
                    {/* Header: Title + SKU + Actions */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] bg-amber-500 text-stone-950 font-bold px-1.5 py-0.5 rounded shadow-2xs flex items-center gap-1">
                            <Check className="w-2.5 h-2.5" />
                            <span>核心主品 (已关联)</span>
                          </span>
                          {primaryProduct.productionTruth && (
                            <span className="text-[9px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono font-bold">
                              ✓ 生产真值
                            </span>
                          )}
                        </div>
                        <h4 className={`font-bold text-xs mt-1 leading-snug ${isLight ? 'text-stone-900' : 'text-stone-100'}`}>
                          {primaryProduct.name}
                        </h4>
                        <div className={`text-[10px] font-mono mt-0.5 ${isLight ? 'text-stone-500' : 'text-stone-400'}`}>
                          SKU: {primaryProduct.sku || 'MW-MASTER'} · {primaryProduct.role}
                        </div>

                        {/* 核心标记药丸徽章流：尺寸、主色、适配风格 */}
                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          {primaryProduct.dimensions && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
                              isLight ? 'bg-white border-stone-200 text-stone-700' : 'bg-stone-900 border-stone-800 text-stone-300'
                            }`}>
                              {primaryProduct.dimensions.width}×{primaryProduct.dimensions.depth}mm
                            </span>
                          )}
                          {primaryProduct.colors?.[0] && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 ${
                              isLight ? 'bg-white border-stone-200 text-stone-700' : 'bg-stone-900 border-stone-800 text-stone-300'
                            }`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 shrink-0" />
                              <span className="truncate max-w-[80px]">{primaryProduct.colors[0].split(' ')[0]}</span>
                            </span>
                          )}
                          {primaryProduct.adaptiveStyles && primaryProduct.adaptiveStyles.length > 0 && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                              isLight ? 'bg-amber-100/70 border-amber-300 text-amber-900' : 'bg-amber-950/40 border-amber-700 text-amber-300'
                            }`}>
                              风格: {primaryProduct.adaptiveStyles.slice(0, 2).join('/')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Edit modal trigger */}
                      {onOpenUploadModal && (
                        <button
                          type="button"
                          onClick={() => onOpenUploadModal(primaryProduct)}
                          className={`p-1.5 rounded-lg border transition cursor-pointer shrink-0 ${
                            isLight
                              ? 'bg-white hover:bg-stone-100 text-stone-600 border-stone-200'
                              : 'bg-stone-900 hover:bg-stone-800 text-stone-300 border-stone-700'
                          }`}
                          title="编辑产品档案与详细读数"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Image Preview */}
                    {(() => {
                      const mainImgSrc =
                        primaryProduct.referenceImages?.[0]?.publicUrl ||
                        primaryProduct.cropBase64 ||
                        primaryProduct.cropImageUrl ||
                        primaryProduct.sourceMasterImageUrl ||
                        (primaryProduct.referenceImages?.[0]?.objectKey
                          ? `/api/space/storage/local-file?key=${encodeURIComponent(primaryProduct.referenceImages[0].objectKey)}`
                          : undefined);

                      return mainImgSrc ? (
                        <div
                          onClick={() => {
                            setZoomedProduct({
                              imageUrl: mainImgSrc,
                              name: primaryProduct.name,
                              sku: primaryProduct.sku,
                              dimensions: primaryProduct.dimensions,
                              materials: primaryProduct.materials,
                              colors: primaryProduct.colors,
                              roleTitle: '核心主品'
                            });
                            setLightboxScale(1);
                          }}
                          className={`w-full h-36 rounded-xl border overflow-hidden flex items-center justify-center relative group cursor-zoom-in transition-all ${
                            isLight
                              ? 'bg-white border-stone-200 hover:border-amber-400 hover:shadow-xs'
                              : 'bg-stone-900/90 border-stone-800 hover:border-amber-500/60 hover:shadow-xs'
                          }`}
                          title="点击放大查看高保真大图与细节"
                        >
                          <img
                            src={mainImgSrc}
                            alt={primaryProduct.name}
                            className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                            referrerPolicy="no-referrer"
                          />
                          {/* 悬停放大镜遮罩 */}
                          <div className="absolute inset-0 bg-black/40 backdrop-blur-2xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-bold pointer-events-none">
                            <ZoomIn className="w-4 h-4 text-amber-400" />
                            <span>点击放大查看高保真图</span>
                          </div>
                          <div className="absolute bottom-1.5 right-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[9px] font-mono text-white pointer-events-none flex items-center gap-1">
                            <ZoomIn className="w-2.5 h-2.5 text-amber-400" />
                            <span>原图比例 1:1 锁定</span>
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`w-full h-24 rounded-xl border flex flex-col items-center justify-center text-[11px] gap-1 ${
                            isLight ? 'bg-white border-stone-200 text-stone-400' : 'bg-stone-900/60 border-stone-800 text-stone-500'
                          }`}
                        >
                          <Box className="w-5 h-5 text-stone-400" />
                          <span>已锁定物理真值特征</span>
                        </div>
                      );
                    })()}

                    {/* 2.1 来源总图多产品解构与参数分配看板 (Ensemble Disaggregation Panel) */}
                    {primaryProduct.detectedProducts && primaryProduct.detectedProducts.length > 1 && (
                      <div
                        className={`p-2.5 rounded-xl border space-y-2.5 transition-all ${
                          isLight
                            ? 'bg-amber-50/90 border-amber-300 text-stone-900 shadow-2xs'
                            : 'bg-stone-900/90 border-amber-500/50 text-stone-100 shadow-2xs'
                        }`}
                      >
                        <div
                          onClick={() => setIsEnsembleBreakdownCollapsed(!isEnsembleBreakdownCollapsed)}
                          className="flex items-center justify-between cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-1.5 font-bold text-xs text-amber-700 dark:text-amber-400">
                            <Boxes className="w-3.5 h-3.5" />
                            <span>总图智能解构套组 ({primaryProduct.detectedProducts.length} 款)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold border border-amber-400/30">
                              物理切片就绪
                            </span>
                            <ChevronDown
                              className={`w-3.5 h-3.5 text-stone-400 transition-transform duration-200 ${
                                isEnsembleBreakdownCollapsed ? '-rotate-90' : ''
                              }`}
                            />
                          </div>
                        </div>

                        {!isEnsembleBreakdownCollapsed && (
                          <div className="space-y-2 animate-in fade-in duration-150">
                            <div className="text-[10px] text-stone-500 dark:text-stone-400 leading-normal">
                              已从识别总图中智能解构各家具空间角色、毫米级读数与聚焦切片：
                            </div>

                            {/* 解构出的家具单品列表 */}
                            <div className="grid grid-cols-2 gap-1.5">
                              {primaryProduct.detectedProducts.map((dp, dIdx) => {
                                const imgSrc = dp.cropBase64 || dp.cropImageUrl;
                                return (
                                  <div
                                    key={dp.id || dIdx}
                                    className={`p-1.5 rounded-lg border flex items-center gap-1.5 ${
                                      isLight
                                        ? 'bg-white border-stone-200 text-stone-800'
                                        : 'bg-stone-950 border-stone-800 text-stone-200'
                                    }`}
                                  >
                                    <div className="w-8 h-8 rounded border border-amber-400/30 overflow-hidden shrink-0 bg-stone-900 flex items-center justify-center">
                                      {imgSrc ? (
                                        <img
                                          src={imgSrc}
                                          alt={dp.name}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : primaryProduct.sourceMasterImageUrl && dp.boundingBox ? (
                                        <div
                                          className="w-full h-full"
                                          style={{
                                            backgroundImage: `url(${primaryProduct.sourceMasterImageUrl})`,
                                            backgroundPosition: `${dp.boundingBox.xmin || 0}% ${dp.boundingBox.ymin || 0}%`,
                                            backgroundSize: `${(100 / Math.max(5, (dp.boundingBox.xmax || 100) - (dp.boundingBox.xmin || 0))) * 100}% ${(100 / Math.max(5, (dp.boundingBox.ymax || 100) - (dp.boundingBox.ymin || 0))) * 100}%`,
                                            backgroundRepeat: 'no-repeat'
                                          }}
                                          title={dp.name}
                                        />
                                      ) : (
                                        <Box className="w-4 h-4 text-stone-500" />
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="font-bold text-[10px] truncate leading-tight">
                                        {dp.name.split(' (')[0]}
                                      </div>
                                      <div className="text-[9px] font-mono text-stone-400 truncate mt-0.5">
                                        {dp.dimensions.width}×{dp.dimensions.depth}mm
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* 一键全套展开至搭配产品库按钮 */}
                            <button
                              type="button"
                              onClick={handleDeployEnsembleToLibrary}
                              className="w-full py-1.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-98"
                              title="将总图解构出的全部家具（三人位、单椅、奢石茶几、电视柜等）一键展开至搭配库并协同入镜"
                            >
                              <CheckCheck className="w-3.5 h-3.5" />
                              <span>一键全套展开至搭配产品库</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ===================== 产品方便读数区块 (READOUTS) ===================== */}
                    <div className="space-y-1.5 pt-1">
                      <div
                        onClick={() => setIsReadoutsCollapsed(!isReadoutsCollapsed)}
                        className={`flex items-center justify-between text-[11px] font-bold cursor-pointer select-none p-1 rounded-lg transition-colors ${
                          isLight ? 'hover:bg-amber-100/50' : 'hover:bg-stone-900/60'
                        }`}
                      >
                        <span className={`flex items-center gap-1 ${isLight ? 'text-stone-700' : 'text-stone-300'}`}>
                          <Ruler className="w-3.5 h-3.5 text-amber-500" />
                          <span>产品工程规格读数</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-mono ${isLight ? 'text-amber-800 font-semibold' : 'text-amber-400'}`}>
                            {primaryProduct.readoutConfidence ? `${Math.round(primaryProduct.readoutConfidence * 100)}%` : '98% 黄金精测'}
                          </span>
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-stone-400 transition-transform duration-200 ${
                              isReadoutsCollapsed ? '-rotate-90' : ''
                            }`}
                          />
                        </div>
                      </div>

                      {!isReadoutsCollapsed ? (
                        <div className="space-y-2 animate-in fade-in duration-150">
                          {/* 物理尺寸读数条 */}
                          <div
                            className={`p-2 rounded-lg border grid grid-cols-3 gap-1 text-center font-mono ${
                              isLight ? 'bg-white border-stone-200 text-stone-800' : 'bg-stone-900/80 border-stone-800 text-stone-300'
                            }`}
                          >
                            <div>
                              <div className={`text-[9px] ${isLight ? 'text-stone-400' : 'text-stone-500'}`}>总宽 (W)</div>
                              <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                                {primaryProduct.dimensions?.width || 3100} <span className="text-[8px]">mm</span>
                              </div>
                            </div>
                            <div>
                              <div className={`text-[9px] ${isLight ? 'text-stone-400' : 'text-stone-500'}`}>总深 (D)</div>
                              <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                                {primaryProduct.dimensions?.depth || 1080} <span className="text-[8px]">mm</span>
                              </div>
                            </div>
                            <div>
                              <div className={`text-[9px] ${isLight ? 'text-stone-400' : 'text-stone-500'}`}>总高 (H)</div>
                              <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                                {primaryProduct.dimensions?.height || 950} <span className="text-[8px]">mm</span>
                              </div>
                            </div>
                          </div>

                          {/* 材质与色彩读数 */}
                          <div
                            className={`p-2 rounded-lg border space-y-1.5 text-[11px] ${
                              isLight ? 'bg-white border-stone-200' : 'bg-stone-900/80 border-stone-800'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className={`shrink-0 ${isLight ? 'text-stone-400' : 'text-stone-500'}`}>材质系:</span>
                              <span className={`text-right font-medium truncate ${isLight ? 'text-stone-800' : 'text-stone-200'}`}>
                                {primaryProduct.materials?.join(' · ') || '半苯胺头层牛皮 / 科技布'}
                              </span>
                            </div>
                            <div className="flex items-start justify-between gap-1">
                              <span className={`shrink-0 ${isLight ? 'text-stone-400' : 'text-stone-500'}`}>原厂色彩:</span>
                              <span className={`text-right font-medium truncate ${isLight ? 'text-stone-800' : 'text-stone-200'}`}>
                                {primaryProduct.colors?.join(' / ') || '极地米白 / 云雾暖灰'}
                              </span>
                            </div>
                            {primaryProduct.surfaceTexture && (
                              <div className="flex items-start justify-between gap-1">
                                <span className={`shrink-0 ${isLight ? 'text-stone-400' : 'text-stone-500'}`}>肌理工艺:</span>
                                <span className={`text-right text-[10px] line-clamp-1 ${isLight ? 'text-stone-600' : 'text-stone-400'}`}>
                                  {primaryProduct.surfaceTexture}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => setIsReadoutsCollapsed(false)}
                          className={`p-1.5 rounded-lg border text-[10px] font-mono text-center cursor-pointer transition ${
                            isLight ? 'bg-stone-100 text-stone-600 border-stone-200' : 'bg-stone-900/50 text-stone-400 border-stone-800'
                          }`}
                        >
                          尺寸: {primaryProduct.dimensions?.width || 3100}×{primaryProduct.dimensions?.depth || 1080}×{primaryProduct.dimensions?.height || 950}mm · {primaryProduct.materials?.[0] || '半苯胺牛皮'} (已折叠，点击展开)
                        </div>
                      )}
                    </div>

                    {/* ===================== 产品结构标记区块 (MARKINGS & TAGS) ===================== */}
                    <div className="space-y-1.5 pt-1 border-t border-stone-700/20">
                      <div
                        onClick={() => setIsFeaturesCollapsed(!isFeaturesCollapsed)}
                        className={`flex items-center justify-between text-[11px] font-bold cursor-pointer select-none p-1 rounded-lg transition-colors ${
                          isLight ? 'hover:bg-amber-100/50' : 'hover:bg-stone-900/60'
                        }`}
                      >
                        <span className={`flex items-center gap-1 ${isLight ? 'text-stone-700' : 'text-stone-300'}`}>
                          <Tag className="w-3.5 h-3.5 text-amber-500" />
                          <span>结构与关键特征标记</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsFeaturesCollapsed(false);
                              setShowTagInput(!showTagInput);
                            }}
                            className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>添加标记</span>
                          </button>
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-stone-400 transition-transform duration-200 ${
                              isFeaturesCollapsed ? '-rotate-90' : ''
                            }`}
                          />
                        </div>
                      </div>

                      {!isFeaturesCollapsed ? (
                        <div className="space-y-2 animate-in fade-in duration-150">
                          {/* 结构标记芯片流 */}
                          <div className="flex flex-wrap gap-1.5">
                            {(primaryProduct.structuralFeatures && primaryProduct.structuralFeatures.length > 0
                              ? primaryProduct.structuralFeatures
                              : [
                                  { name: '立体双包线扶手', description: '' },
                                  { name: '电动展开功能位', description: '' },
                                  { name: '分段式护腰靠包', description: '' },
                                  { name: '高碳钢隐藏底脚', description: '' }
                                ]
                            ).map((feat, idx) => (
                              <span
                                key={idx}
                                className={`group inline-flex items-center gap-1 px-2 py-0.8 rounded-lg text-[10px] border transition ${
                                  isLight
                                    ? 'bg-amber-100/70 border-amber-300 text-amber-900'
                                    : 'bg-stone-900 border-stone-700 text-amber-300'
                                }`}
                              >
                                <span>{feat.name}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFeatureTag(feat.name)}
                                  className="text-stone-400 hover:text-rose-500 opacity-60 group-hover:opacity-100 transition cursor-pointer"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>

                          {/* 自定义标记输入框 */}
                          {showTagInput && (
                            <div className="flex items-center gap-1.5 pt-1">
                              <input
                                type="text"
                                placeholder="如：双电机无极伸缩、法式手工滚边..."
                                value={newTagInput}
                                onChange={(e) => setNewTagInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddFeatureTag()}
                                className={`flex-1 py-1 px-2 text-xs rounded-lg border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                                  isLight ? 'bg-white border-stone-300 text-stone-900' : 'bg-stone-900 border-stone-700 text-stone-100'
                                }`}
                              />
                              <button
                                type="button"
                                onClick={handleAddFeatureTag}
                                className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                              >
                                添加
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          onClick={() => setIsFeaturesCollapsed(false)}
                          className={`p-1.5 rounded-lg border text-[10px] text-center cursor-pointer transition ${
                            isLight ? 'bg-stone-100 text-stone-600 border-stone-200' : 'bg-stone-900/50 text-stone-400 border-stone-800'
                          }`}
                        >
                          已标记 {(primaryProduct.structuralFeatures || []).length || 4} 个关键特征 (已折叠，点击展开)
                        </div>
                      )}
                    </div>

                    {/* ===================== 真值物理保护规则标记 ===================== */}
                    <div
                      className={`p-2.5 rounded-lg border space-y-1.5 text-[10px] leading-relaxed transition-all ${
                        isLight ? 'bg-amber-50/70 border-amber-200/80 text-stone-700' : 'bg-stone-900 border-stone-800 text-stone-400'
                      }`}
                    >
                      <div
                        onClick={() => setIsRulesCollapsed(!isRulesCollapsed)}
                        className="flex items-center justify-between font-bold text-amber-600 dark:text-amber-400 cursor-pointer select-none"
                      >
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>真值物理保护规则 (不可漂移)：</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsRulesCollapsed(false);
                              setShowRuleInput(!showRuleInput);
                            }}
                            className="text-[9px] hover:underline cursor-pointer"
                          >
                            + 增加规则
                          </button>
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${
                              isRulesCollapsed ? '-rotate-90' : ''
                            }`}
                          />
                        </div>
                      </div>

                      {!isRulesCollapsed ? (
                        <div className="space-y-1.5 animate-in fade-in duration-150">
                          {(primaryProduct.lockedRules && primaryProduct.lockedRules.length > 0
                            ? primaryProduct.lockedRules
                            : [
                                '绝对锁定原产品皮革色温与缝线工艺',
                                '绝对维持五金脚部与功能架物理比例',
                                '锁定 1:1 工业真值宽高比（杜绝拉伸形变）'
                              ]
                          ).map((rule, rIdx) => (
                            <div key={rIdx} className="flex items-start justify-between gap-1 group">
                              <span className="flex-1">✓ {rule}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveRule(rIdx)}
                                className="text-stone-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition cursor-pointer"
                              >
                                ×
                              </button>
                            </div>
                          ))}

                          {showRuleInput && (
                            <div className="flex items-center gap-1.5 pt-1">
                              <input
                                type="text"
                                placeholder="输入保护规则..."
                                value={newRuleInput}
                                onChange={(e) => setNewRuleInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddRule()}
                                className={`flex-1 py-1 px-2 text-[10px] rounded border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                                  isLight ? 'bg-white border-stone-300 text-stone-900' : 'bg-stone-950 border-stone-700 text-stone-100'
                                }`}
                              />
                              <button
                                type="button"
                                onClick={handleAddRule}
                                className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px]"
                              >
                                保存
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          onClick={() => setIsRulesCollapsed(false)}
                          className="text-[9px] text-stone-500 cursor-pointer pt-0.5"
                        >
                          已启用 {(primaryProduct.lockedRules || []).length || 3} 条不可漂移保护规则 (已折叠，点击展开)
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. 多产品资产库列表 (切换主品 / 搭配商品 / 勾选关联到场景套组) */}
                {products.length > 1 && (
                  <div className="space-y-2 pt-2 border-t border-stone-700/20">
                    <div className="flex items-center justify-between px-1">
                      <span className={`text-[11px] font-bold ${isLight ? 'text-stone-700' : 'text-stone-300'}`}>
                        搭配产品库 ({products.length - 1}) · 可勾选关联
                      </span>
                      <span className={`text-[10px] font-mono ${isLight ? 'text-stone-400' : 'text-stone-500'}`}>
                        仅勾选品进入场景
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {products
                        .filter((p) => p.id !== primaryProduct?.id)
                        .map((p) => {
                          const ref = p.referenceImages?.[0];
                          const isIncluded = p.isEnsembleIncluded !== false;

                          return (
                            <div
                              key={p.id}
                              className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition ${
                                isIncluded
                                  ? isLight
                                    ? 'bg-amber-50/70 border-amber-300/80 shadow-2xs text-stone-900'
                                    : 'bg-stone-900/90 border-amber-500/40 shadow-2xs text-stone-100'
                                  : isLight
                                  ? 'bg-[#FAF8F5]/80 border-stone-200 text-stone-500 opacity-70 hover:opacity-100'
                                  : 'bg-stone-950/40 border-stone-800 text-stone-500 opacity-60 hover:opacity-100'
                              }`}
                            >
                              {/* 左侧 Checkbox 勾选框 */}
                              <div
                                onClick={() => onToggleEnsembleInclude && onToggleEnsembleInclude(p.id)}
                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer transition ${
                                  isIncluded
                                    ? 'bg-amber-600 border-amber-600 text-white'
                                    : isLight
                                    ? 'border-stone-300 bg-white hover:border-amber-400'
                                    : 'border-stone-700 bg-stone-900 hover:border-amber-500'
                                }`}
                                title={isIncluded ? '取消关联（不出现在当前场景中）' : '勾选关联（参与当前场景渲染与摆位）'}
                              >
                                {isIncluded && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>

                              {/* 中间图片与产品核心标记 */}
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                {(() => {
                                  const thumbSrc =
                                    p.cropBase64 ||
                                    p.cropImageUrl ||
                                    (ref?.publicUrl && !ref.publicUrl.includes('projects/default/') ? ref.publicUrl : undefined) ||
                                    (ref?.objectKey ? `/api/space/storage/local-file?key=${encodeURIComponent(ref.objectKey)}` : undefined) ||
                                    p.sourceMasterImageUrl;

                                  return (
                                    <div
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (thumbSrc) {
                                          setZoomedProduct({
                                            imageUrl: thumbSrc,
                                            name: p.name,
                                            sku: p.sku,
                                            dimensions: p.dimensions,
                                            materials: p.materials,
                                            colors: p.colors,
                                            roleTitle: '搭配产品'
                                          });
                                          setLightboxScale(1);
                                        }
                                      }}
                                      className={`w-12 h-12 rounded-lg border overflow-hidden shrink-0 flex items-center justify-center relative group cursor-zoom-in transition-all ${
                                        isLight ? 'bg-white border-stone-200 hover:border-amber-400' : 'bg-stone-900 border-stone-800 hover:border-amber-500'
                                      }`}
                                      title="点击放大查看产品大图细节"
                                    >
                                      {thumbSrc ? (
                                        <>
                                          <img
                                            src={thumbSrc}
                                            alt={p.name}
                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
                                            referrerPolicy="no-referrer"
                                            onError={(e) => {
                                              (e.currentTarget as HTMLElement).style.display = 'none';
                                            }}
                                          />
                                          {/* 悬停放大镜遮罩 */}
                                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <ZoomIn className="w-3.5 h-3.5 text-amber-300 drop-shadow-sm" />
                                          </div>
                                        </>
                                      ) : (
                                        <Box className="w-4 h-4 text-stone-400" />
                                      )}
                                    </div>
                                  );
                                })()}

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-xs truncate max-w-[130px]">{p.name}</span>
                                    <span
                                      className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                                        isIncluded
                                          ? isLight
                                            ? 'bg-amber-100 text-amber-900 font-bold'
                                            : 'bg-amber-950 text-amber-300 font-bold'
                                          : 'bg-stone-200/60 dark:bg-stone-800 text-stone-500'
                                      }`}
                                    >
                                      {isIncluded ? '已关联场景' : '仅存库'}
                                    </span>
                                    {(p.sourceBoundingBox || p.cropBase64 || p.cropImageUrl) && (
                                      <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-400/30">
                                        总图切片
                                      </span>
                                    )}
                                    {(p.role === 'lounge_chair' || p.functionCapable === false || (p.name && /(休闲|无扶手|矮椅|旋转|单椅|焦糖)/.test(p.name) && !/(功能|电动|头等舱|展开|太空舱)/.test(p.name))) ? (
                                      <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-stone-500/15 text-stone-600 dark:text-stone-300 border border-stone-400/30">
                                        无功能单椅
                                      </span>
                                    ) : (p.role === 'recliner_1seat' || p.functionCapable) ? (
                                      <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-400/30">
                                        电动功能位
                                      </span>
                                    ) : null}
                                  </div>

                                  {/* 核心标记流：尺寸、主色、适配风格 */}
                                  <div className="flex items-center gap-1.5 flex-wrap text-[9px] font-mono mt-0.5">
                                    {p.dimensions && (
                                      <span className={isLight ? 'text-stone-600' : 'text-stone-400'}>
                                        {p.dimensions.width}×{p.dimensions.depth}mm
                                      </span>
                                    )}
                                    {p.colors?.[0] && (
                                      <span className="flex items-center gap-0.5 text-stone-500">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-600 inline-block" />
                                        <span>{p.colors[0].split(' ')[0]}</span>
                                      </span>
                                    )}
                                    {p.adaptiveStyles?.[0] && (
                                      <span className={isLight ? 'text-amber-800 font-medium' : 'text-amber-400/90 font-medium'}>
                                        {p.adaptiveStyles[0]}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* 右侧操作按钮 */}
                              <div className="flex items-center gap-1 shrink-0">
                                {onSetPrimaryProduct && (
                                  <button
                                    type="button"
                                    onClick={() => onSetPrimaryProduct(p.id)}
                                    className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer border ${
                                      isLight
                                        ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300'
                                        : 'bg-stone-800 hover:bg-stone-700 text-amber-300 border-stone-700'
                                    }`}
                                    title="将此产品设为画册主拍摄对象"
                                  >
                                    设为主品
                                  </button>
                                )}
                                {onOpenUploadModal && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenUploadModal(p)}
                                    className={`p-1 rounded text-stone-400 hover:text-amber-600 transition cursor-pointer ${
                                      isLight ? 'hover:bg-stone-200/60' : 'hover:bg-stone-800'
                                    }`}
                                    title="编辑此产品名称、颜色、适配风格与尺寸"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {onRemoveProduct && (
                                  <button
                                    type="button"
                                    onClick={() => onRemoveProduct(p.id)}
                                    className="p-1 rounded text-stone-400 hover:text-rose-500 transition cursor-pointer"
                                    title="从当前工作台移除"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: 美学硬装 */}
            {activeTab === 'style' && (() => {
              const topRecommendations = primaryProduct ? recommendStylesForProduct(primaryProduct, styles, 3) : [];
              const recMap = new Map(topRecommendations.map((r, rank) => [r.style.id, { rank: rank + 1, score: r.score, traits: r.matchedTraits }]));

              const filteredStyles = styles.filter((st) => {
                if (styleCategoryFilter === 'all') return true;
                return st.category === styleCategoryFilter;
              });

              return (
                <div className="space-y-3">
                  {/* AI 风格推荐浮层（当主品存在时自动计算） */}
                  {primaryProduct && topRecommendations.length > 0 && (
                    <div
                      className={`p-2.5 rounded-xl border space-y-2 shadow-xs ${
                        isLight
                          ? 'bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border-amber-300'
                          : 'bg-gradient-to-br from-amber-950/40 via-stone-900/60 to-transparent border-amber-600/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-[11px] font-bold text-amber-800 dark:text-amber-400">
                            AI 风格推荐适配
                          </span>
                        </div>
                        <span className="text-[9px] font-mono text-stone-500">
                          基于「{primaryProduct.name}」
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {topRecommendations.map((rec, rIdx) => {
                          const isRecSelected = rec.style.id === selectedStyle.id;
                          return (
                            <div
                              key={rec.style.id}
                              onClick={() => onSelectStyle(rec.style)}
                              className={`p-1.5 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition text-[11px] ${
                                isRecSelected
                                  ? 'bg-amber-500 text-stone-950 font-bold border-amber-500'
                                  : isLight
                                  ? 'bg-white hover:bg-amber-100/60 text-stone-800 border-amber-200/60'
                                  : 'bg-stone-900 hover:bg-stone-800 text-stone-200 border-stone-800'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`text-[10px] font-mono px-1 py-0.2 rounded font-bold ${
                                  isRecSelected ? 'bg-stone-950 text-amber-400' : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                                }`}>
                                  #{rIdx + 1} {rec.style.code}
                                </span>
                                <span className="truncate">{rec.style.name.split('(')[0]}</span>
                              </div>
                              <span className={`text-[10px] font-mono font-bold shrink-0 ${
                                isRecSelected ? 'text-stone-950' : 'text-amber-700 dark:text-amber-400'
                              }`}>
                                {rec.score}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 风格分类过滤筛选按钮组 */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
                    {[
                      { key: 'all', label: '全部' },
                      { key: '欧美住宅', label: '欧美住宅' },
                      { key: '国际现代', label: '国际现代' },
                      { key: '东方住宅', label: '东方住宅' }
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setStyleCategoryFilter(tab.key)}
                        className={`text-[10px] px-2.5 py-1 rounded-lg border font-medium whitespace-nowrap transition cursor-pointer ${
                          styleCategoryFilter === tab.key
                            ? 'bg-amber-500 text-stone-950 font-bold border-amber-500 shadow-2xs'
                            : isLight
                            ? 'bg-white hover:bg-stone-100 text-stone-600 border-stone-200'
                            : 'bg-stone-900 hover:bg-stone-800 text-stone-400 border-stone-800'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* 风格列表 */}
                  <div className="space-y-2">
                    {filteredStyles.map((st) => {
                      const isSelected = st.id === selectedStyle.id;
                      const recInfo = recMap.get(st.id);

                      return (
                        <div
                          key={st.id}
                          onClick={() => onSelectStyle(st)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer relative group ${
                            isSelected
                              ? isLight
                                ? 'bg-amber-50 border-amber-500 shadow-xs ring-1 ring-amber-400/30'
                                : 'bg-amber-950/30 border-amber-500/80 shadow-md ring-1 ring-amber-500/30'
                              : isLight
                              ? 'bg-[#FAF8F5] border-stone-200 hover:border-stone-300 hover:bg-white text-stone-700'
                              : 'bg-stone-950/60 border-stone-800 hover:border-stone-700 hover:bg-stone-800/40 text-stone-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[9px] font-mono px-1 py-0.2 rounded border font-bold ${
                                  isLight ? 'bg-stone-100 border-stone-200 text-stone-700' : 'bg-stone-900 border-stone-800 text-stone-300'
                                }`}>
                                  {st.code}
                                </span>
                                <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 font-medium">
                                  {st.category}
                                </span>
                                {recInfo && (
                                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/30">
                                    推荐 {recInfo.score}%
                                  </span>
                                )}
                              </div>
                              <h4
                                className={`font-semibold text-xs mt-1 leading-snug ${
                                  isSelected ? (isLight ? 'text-amber-950 font-bold' : 'text-amber-200') : isLight ? 'text-stone-800' : 'text-stone-200'
                                }`}
                              >
                                {st.name}
                              </h4>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-amber-500 shrink-0" />}
                          </div>

                          {/* 城市/空间联想与典型户型 */}
                          {(st.cityCharacter || st.typicalLayout) && (
                            <div className="text-[9px] space-y-0.5 my-1.5">
                              {st.cityCharacter && (
                                <div className={`truncate ${isLight ? 'text-stone-500' : 'text-stone-400'}`}>
                                  📍 {st.cityCharacter}
                                </div>
                              )}
                              {st.typicalLayout && (
                                <div className={`truncate font-mono ${isLight ? 'text-amber-800/80' : 'text-amber-400/80'}`}>
                                  🏠 户型: {st.typicalLayout}
                                </div>
                              )}
                            </div>
                          )}

                          {/* 调色板 */}
                          <div className="flex items-center gap-1 my-1.5 flex-wrap">
                            {st.colorPalette.slice(0, 5).map((c, i) => (
                              <div
                                key={i}
                                className={`flex items-center gap-1 text-[8px] px-1.5 py-0.2 rounded border font-mono shadow-2xs ${
                                  isLight ? 'bg-white text-stone-700 border-stone-200' : 'bg-stone-900 text-stone-300 border-stone-800'
                                }`}
                              >
                                <span
                                  className="w-2 h-2 rounded-full border border-black/20 shrink-0"
                                  style={{ backgroundColor: c }}
                                />
                                <span>{c}</span>
                              </div>
                            ))}
                          </div>

                          <div className={`text-[10px] pl-0.5 ${isLight ? 'text-stone-500' : 'text-stone-400'}`}>
                            {st.lifestyleTags.slice(0, 3).join(' · ')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* TAB 4: 摄影机位 */}
            {activeTab === 'camera' && (
              <div className="space-y-2.5">
                <div className={`text-[11px] font-medium px-1 flex items-center justify-between ${isLight ? 'text-stone-500' : 'text-stone-400'}`}>
                  <span>画册 9 大黄金构图机位</span>
                  <span className={`text-[10px] font-mono ${isLight ? 'text-amber-700' : 'text-amber-400/80'}`}>
                    0{activeShotIndex + 1}/09
                  </span>
                </div>

                {shots.map((shot, idx) => {
                  const isCurrent = idx === activeShotIndex;
                  return (
                    <div
                      key={shot.id}
                      onClick={() => onSelectShot(idx)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isCurrent
                          ? isLight
                            ? 'bg-amber-50 border-amber-500 shadow-xs ring-1 ring-amber-400/30'
                            : 'bg-amber-950/30 border-amber-500/80 shadow-md ring-1 ring-amber-500/30'
                          : isLight
                          ? 'bg-[#FAF8F5] border-stone-200 hover:border-stone-300 hover:bg-white text-stone-700'
                          : 'bg-stone-950/60 border-stone-800 hover:border-stone-700 hover:bg-stone-800/40 text-stone-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded ${
                              isCurrent
                                ? 'bg-amber-500 text-stone-950 font-bold'
                                : isLight
                                ? 'bg-stone-200 text-stone-700'
                                : 'bg-stone-800 text-stone-400'
                            }`}
                          >
                            0{idx + 1}
                          </span>
                          <span
                            className={`font-semibold text-xs ${
                              isCurrent ? (isLight ? 'text-amber-950 font-bold' : 'text-amber-200') : isLight ? 'text-stone-800' : 'text-stone-200'
                            }`}
                          >
                            {shot.name}
                          </span>
                        </div>
                        <span className={`text-[10px] font-mono ${isLight ? 'text-stone-500' : 'text-stone-400'}`}>
                          {shot.camera.lensMm}mm · {shot.camera.heightCm}cm
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* ===================== 产品高保真大图放大品鉴灯箱 (Lightbox Modal) ===================== */}
      <AnimatePresence>
        {zoomedProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setZoomedProduct(null);
              setLightboxScale(1);
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-4xl max-h-[90vh] w-full bg-stone-950/95 border border-white/15 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-white"
            >
              {/* 顶栏控制条 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/40">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <span className="font-bold text-sm text-stone-100 truncate">
                    {zoomedProduct.name}
                  </span>
                  {zoomedProduct.sku && (
                    <span className="text-[10px] font-mono text-stone-400 bg-white/5 px-2 py-0.5 rounded border border-white/10 shrink-0">
                      SKU: {zoomedProduct.sku}
                    </span>
                  )}
                  {zoomedProduct.roleTitle && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 shrink-0">
                      {zoomedProduct.roleTitle}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* 缩放操作 */}
                  <div className="flex items-center gap-1 bg-white/10 rounded-lg p-0.5 border border-white/10">
                    <button
                      type="button"
                      onClick={() => setLightboxScale((prev) => Math.max(0.5, prev - 0.25))}
                      className="p-1 rounded hover:bg-white/10 text-stone-300 hover:text-white transition cursor-pointer"
                      title="缩小 (-25%)"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-mono text-xs px-1.5 text-amber-400 min-w-[42px] text-center">
                      {Math.round(lightboxScale * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setLightboxScale((prev) => Math.min(3, prev + 0.25))}
                      className="p-1 rounded hover:bg-white/10 text-stone-300 hover:text-white transition cursor-pointer"
                      title="放大 (+25%)"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setLightboxScale(1)}
                      className="p-1 rounded hover:bg-white/10 text-stone-300 hover:text-white transition cursor-pointer"
                      title="复位 1:1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* 关闭按钮 */}
                  <button
                    type="button"
                    onClick={() => {
                      setZoomedProduct(null);
                      setLightboxScale(1);
                    }}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-rose-500/80 text-stone-300 hover:text-white transition cursor-pointer"
                    title="关闭 (ESC)"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 核心大图展示区 (支持滚轮缩放) */}
              <div
                onWheel={(e) => {
                  e.preventDefault();
                  if (e.deltaY < 0) {
                    setLightboxScale((prev) => Math.min(3, prev + 0.15));
                  } else {
                    setLightboxScale((prev) => Math.max(0.5, prev - 0.15));
                  }
                }}
                className="flex-1 min-h-[360px] max-h-[65vh] flex items-center justify-center p-4 bg-stone-900/60 overflow-hidden relative cursor-grab active:cursor-grabbing"
              >
                <div
                  style={{
                    transform: `scale(${lightboxScale})`,
                    transition: 'transform 0.12s ease-out'
                  }}
                  className="max-w-full max-h-full flex items-center justify-center"
                >
                  <img
                    src={zoomedProduct.imageUrl}
                    alt={zoomedProduct.name}
                    className="max-h-[58vh] max-w-full object-contain rounded-lg shadow-2xl pointer-events-none select-none"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>

              {/* 底部参数读数栏 */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-black/60 border-t border-white/10 text-xs flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap text-stone-300 text-[11px] font-mono">
                  {zoomedProduct.dimensions && (
                    <span className="bg-white/5 px-2 py-0.5 rounded border border-white/10">
                      尺寸: {zoomedProduct.dimensions.width}×{zoomedProduct.dimensions.depth}{zoomedProduct.dimensions.height ? `×${zoomedProduct.dimensions.height}` : ''}mm
                    </span>
                  )}
                  {zoomedProduct.materials?.[0] && (
                    <span className="bg-white/5 px-2 py-0.5 rounded border border-white/10">
                      材质: {zoomedProduct.materials[0]}
                    </span>
                  )}
                  {zoomedProduct.colors?.[0] && (
                    <span className="bg-white/5 px-2 py-0.5 rounded border border-white/10 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                      <span>{zoomedProduct.colors[0]}</span>
                    </span>
                  )}
                </div>

                <div className="text-[10px] text-stone-400">
                  支持滚轮无级缩放 · 拖拽平移 · 按 ESC 或点击遮罩关闭
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
