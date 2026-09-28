// src/features/space-studio/components/SpaceStudioLeftDrawer.tsx
import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutTemplate,
  Package,
  Palette,
  Camera,
  ChevronLeft,
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
  Info
} from 'lucide-react';
import { SpacePreset, StylePreset, ProductAsset, ShotInstance } from '../../../types/spaceStudio';

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
  onUpdateProduct?: (product: ProductAsset) => void;
  onRemoveProduct?: (productId: string) => void;
  onSetPrimaryProduct?: (productId: string) => void;

  shots: ShotInstance[];
  activeShotIndex: number;
  onSelectShot: (index: number) => void;

  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
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
  onUpdateProduct,
  onRemoveProduct,
  onSetPrimaryProduct,
  shots,
  activeShotIndex,
  onSelectShot,
  theme = 'dark',
  onToggleTheme
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<TabKey>('product');
  const [newTagInput, setNewTagInput] = useState<string>('');
  const [showTagInput, setShowTagInput] = useState<boolean>(false);
  const [newRuleInput, setNewRuleInput] = useState<string>('');
  const [showRuleInput, setShowRuleInput] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLight = theme === 'light';

  const navButtons = [
    { key: 'space' as TabKey, label: '空间户型', icon: LayoutTemplate },
    { key: 'product' as TabKey, label: '产品', icon: Package },
    { key: 'style' as TabKey, label: '美学硬装', icon: Palette },
    { key: 'camera' as TabKey, label: '摄影机位', icon: Camera }
  ];

  const primaryProduct = products.find((p) => p.priority === 'primary') || products[0];

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
          const isActive = activeTab === btn.key && isOpen;
          return (
            <button
              key={btn.key}
              onClick={() => {
                if (activeTab === btn.key && isOpen) {
                  setIsOpen(false);
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
      {isOpen && (
        <div
          className={`w-84 border-r flex flex-col h-full overflow-hidden animate-in slide-in-from-left duration-200 transition-colors ${
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
              onClick={() => setIsOpen(false)}
              className={`p-1 rounded transition cursor-pointer ${
                isLight ? 'text-stone-400 hover:text-stone-800 hover:bg-stone-100' : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
              }`}
              title="收起侧栏面板"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 text-xs">
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
                    title="上传本地产品白底图或实拍图，生成高精档案与读数"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>上传产品图</span>
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
                          <span className="text-[10px] bg-amber-500 text-stone-950 font-bold px-1.5 py-0.5 rounded shadow-2xs">
                            核心主品
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
                    {primaryProduct.referenceImages?.[0]?.publicUrl ? (
                      <div
                        className={`w-full h-36 rounded-xl border overflow-hidden flex items-center justify-center relative group ${
                          isLight ? 'bg-white border-stone-200' : 'bg-stone-900/90 border-stone-800'
                        }`}
                      >
                        <img
                          src={primaryProduct.referenceImages[0].publicUrl}
                          alt={primaryProduct.name}
                          className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute bottom-1.5 right-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[9px] font-mono text-white">
                          原图比例 1:1 锁定
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
                    )}

                    {/* ===================== 产品方便读数区块 (READOUTS) ===================== */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className={`flex items-center gap-1 ${isLight ? 'text-stone-700' : 'text-stone-300'}`}>
                          <Ruler className="w-3.5 h-3.5 text-amber-500" />
                          <span>产品工程规格读数</span>
                        </span>
                        <span className={`text-[10px] font-mono ${isLight ? 'text-amber-800 font-semibold' : 'text-amber-400'}`}>
                          置信度 {primaryProduct.readoutConfidence ? `${Math.round(primaryProduct.readoutConfidence * 100)}%` : '98% 黄金精测'}
                        </span>
                      </div>

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

                    {/* ===================== 产品结构标记区块 (MARKINGS & TAGS) ===================== */}
                    <div className="space-y-2 pt-1 border-t border-stone-700/20">
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className={`flex items-center gap-1 ${isLight ? 'text-stone-700' : 'text-stone-300'}`}>
                          <Tag className="w-3.5 h-3.5 text-amber-500" />
                          <span>结构与关键特征标记</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowTagInput(!showTagInput)}
                          className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>添加标记</span>
                        </button>
                      </div>

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

                    {/* ===================== 真值物理保护规则标记 ===================== */}
                    <div
                      className={`p-2.5 rounded-lg border space-y-1.5 text-[10px] leading-relaxed ${
                        isLight ? 'bg-amber-50/70 border-amber-200/80 text-stone-700' : 'bg-stone-900 border-stone-800 text-stone-400'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold text-amber-600 dark:text-amber-400">
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>真值物理保护规则 (不可漂移)：</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowRuleInput(!showRuleInput)}
                          className="text-[9px] hover:underline cursor-pointer"
                        >
                          + 增加规则
                        </button>
                      </div>

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
                  </div>
                )}

                {/* 3. 多产品资产库列表 (切换主品 / 搭配商品) */}
                {products.length > 1 && (
                  <div className="space-y-2 pt-2 border-t border-stone-700/20">
                    <span className={`text-[11px] font-bold px-1 ${isLight ? 'text-stone-600' : 'text-stone-400'}`}>
                      其他搭配产品资产 ({products.length - 1})
                    </span>
                    <div className="space-y-1.5">
                      {products
                        .filter((p) => p.id !== primaryProduct?.id)
                        .map((p) => {
                          const ref = p.referenceImages?.[0];
                          return (
                            <div
                              key={p.id}
                              className={`p-2 rounded-xl border flex items-center justify-between gap-2 transition ${
                                isLight
                                  ? 'bg-[#FAF8F5] border-stone-200 hover:border-amber-400 text-stone-800'
                                  : 'bg-stone-950/60 border-stone-800 hover:border-stone-700 text-stone-300'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className={`w-9 h-9 rounded-lg border overflow-hidden shrink-0 flex items-center justify-center ${
                                    isLight ? 'bg-white border-stone-200' : 'bg-stone-900 border-stone-800'
                                  }`}
                                >
                                  {ref?.publicUrl ? (
                                    <img
                                      src={ref.publicUrl}
                                      alt={p.name}
                                      className="w-full h-full object-contain"
                                    />
                                  ) : (
                                    <Box className="w-4 h-4 text-stone-500" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-semibold text-xs truncate">{p.name}</div>
                                  <div className={`text-[10px] font-mono truncate ${isLight ? 'text-stone-400' : 'text-stone-500'}`}>
                                    {p.dimensions ? `${p.dimensions.width}×${p.dimensions.depth}mm` : p.role}
                                  </div>
                                </div>
                              </div>

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
            {activeTab === 'style' && (
              <div className="space-y-2.5">
                <div className={`text-[11px] font-medium px-1 flex items-center justify-between ${isLight ? 'text-stone-500' : 'text-stone-400'}`}>
                  <span>精选国际美学室内设计调性</span>
                  <span className={`text-[10px] font-mono ${isLight ? 'text-amber-700' : 'text-amber-400/80'}`}>
                    {selectedStyle.name}
                  </span>
                </div>

                {styles.map((st) => {
                  const isSelected = st.id === selectedStyle.id;
                  return (
                    <div
                      key={st.id}
                      onClick={() => onSelectStyle(st)}
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
                            className={`font-semibold text-xs ${
                              isSelected ? (isLight ? 'text-amber-950 font-bold' : 'text-amber-200') : isLight ? 'text-stone-800' : 'text-stone-200'
                            }`}
                          >
                            {st.name}
                          </span>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-amber-500 shrink-0" />}
                      </div>

                      <div className="flex items-center gap-1.5 my-2 flex-wrap">
                        {st.colorPalette.slice(0, 4).map((c, i) => (
                          <div
                            key={i}
                            className={`flex items-center gap-1.5 text-[9px] px-2 py-0.5 rounded-md border font-mono shadow-2xs transition-all ${
                              isLight ? 'bg-white text-stone-700 border-stone-200' : 'bg-stone-900 text-stone-300 border-stone-800'
                            }`}
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-black/20 shadow-2xs shrink-0"
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
            )}

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
    </div>
  );
};
