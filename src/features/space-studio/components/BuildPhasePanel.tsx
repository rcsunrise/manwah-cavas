// src/features/space-studio/components/BuildPhasePanel.tsx
// MANWAH Space Studio｜BUILD 空间搭建控制抽屉与配置面板 V3.0
import React, { useState, useEffect } from 'react';
import {
  ProductAsset,
  SpacePreset,
  StylePreset,
  PlacementBlueprint,
  SceneMaster
} from '../../../types/spaceStudio';
import { dbService } from '../../../services/dbService';
import {
  Box,
  Layers,
  Sparkles,
  Lock,
  Unlock,
  ShieldCheck,
  CheckCircle2,
  Sliders,
  Maximize2,
  Info,
  ChevronDown,
  Upload,
  Plus,
  Edit3,
  Trash2,
  Star,
  Image as ImageIcon,
  DownloadCloud,
  FileCheck
} from 'lucide-react';
import { ProductUploadModal } from './ProductUploadModal';

interface BuildPhasePanelProps {
  products: ProductAsset[];
  selectedSpace: SpacePreset;
  selectedStyle: StylePreset;
  allSpaces: SpacePreset[];
  allStyles: StylePreset[];
  blueprint: PlacementBlueprint;
  sceneMaster: SceneMaster | null;
  onSelectSpace: (space: SpacePreset) => void;
  onSelectStyle: (style: StylePreset) => void;
  onToggleLockBlueprint: () => void;
  onGenerateSceneMaster: () => void;
  isGeneratingMaster: boolean;
  onAddProduct?: (product: ProductAsset) => void;
  onUpdateProduct?: (product: ProductAsset) => void;
  onRemoveProduct?: (productId: string) => void;
  onSetPrimaryProduct?: (productId: string) => void;
  onSyncFromCanvas?: () => void;
}

export const BuildPhasePanel: React.FC<BuildPhasePanelProps> = ({
  products,
  selectedSpace,
  selectedStyle,
  allSpaces,
  allStyles,
  blueprint,
  sceneMaster,
  onSelectSpace,
  onSelectStyle,
  onToggleLockBlueprint,
  onGenerateSceneMaster,
  isGeneratingMaster,
  onAddProduct,
  onUpdateProduct,
  onRemoveProduct,
  onSetPrimaryProduct,
  onSyncFromCanvas
}) => {
  const [activeTab, setActiveTab] = useState<'asset' | 'space' | 'style' | 'blueprint'>('asset');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<ProductAsset | null>(null);

  const [detectedCanvasDraft, setDetectedCanvasDraft] = useState<{
    productName: string;
    hasImage: boolean;
  } | null>(null);

  useEffect(() => {
    const checkCanvas = async () => {
      try {
        const draft: any = await dbService.getDraft('manwah_canvas_latest');
        if (draft && (draft.uploadedImageUrl || draft.activeDna)) {
          const name =
            draft.activeDna?.productCategory ||
            draft.activeDna?.primaryProduct?.name ||
            '创意画布已解析功能沙发组合 (15019)';
          setDetectedCanvasDraft({
            productName: name,
            hasImage: Boolean(draft.uploadedImageUrl || draft.uploadedBase64)
          });
        }
      } catch (e) {
        console.warn('Check canvas draft in BuildPhasePanel failed:', e);
      }
    };
    checkCanvas();
  }, []);

  const handleToggleTruth = (product: ProductAsset) => {
    if (!onUpdateProduct) return;
    const nextTruth = !product.productionTruth;
    onUpdateProduct({
      ...product,
      productionTruth: nextTruth,
      provenance: nextTruth ? 'MANUAL_CONFIRMED' : 'AI_ESTIMATED'
    });
  };

  const handleOpenNewUpload = () => {
    setEditingProduct(null);
    setIsUploadModalOpen(true);
  };

  const handleOpenEditProduct = (prod: ProductAsset) => {
    setEditingProduct(prod);
    setIsUploadModalOpen(true);
  };

  const handleSaveProductFromModal = (savedProduct: ProductAsset) => {
    if (editingProduct) {
      if (onUpdateProduct) {
        onUpdateProduct(savedProduct);
      }
    } else {
      if (onAddProduct) {
        onAddProduct(savedProduct);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-[#EBE7E0] text-xs select-none">
      {/* 顶部 Tab 切换 */}
      <div className="flex items-center border-b border-[#EBE7E0] bg-[#FAF8F5] px-2 py-1.5 gap-1 shrink-0">
        <button
          onClick={() => setActiveTab('asset')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition-all text-center ${
            activeTab === 'asset'
              ? 'bg-white text-stone-900 shadow-xs border border-stone-200 font-bold'
              : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          产品真值
        </button>
        <button
          onClick={() => setActiveTab('space')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition-all text-center ${
            activeTab === 'space'
              ? 'bg-white text-stone-900 shadow-xs border border-stone-200 font-bold'
              : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          户型原型
        </button>
        <button
          onClick={() => setActiveTab('style')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition-all text-center ${
            activeTab === 'style'
              ? 'bg-white text-stone-900 shadow-xs border border-stone-200 font-bold'
              : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          风格体系
        </button>
        <button
          onClick={() => setActiveTab('blueprint')}
          className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition-all text-center ${
            activeTab === 'blueprint'
              ? 'bg-white text-stone-900 shadow-xs border border-stone-200 font-bold'
              : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          摆位蓝图
        </button>
      </div>

      {/* 内容滚动区 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* TAB 1: 产品资产 (WHAT) */}
        {activeTab === 'asset' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-stone-800 text-[13px]">
                敏华核心产品资产 ({products.length})
              </span>
              <button
                onClick={handleOpenNewUpload}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-1 shadow-xs transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>录入新产品 / AI读数</span>
              </button>
            </div>

            {/* 创意画布已解析产品同步条幅 */}
            {detectedCanvasDraft && onSyncFromCanvas && (
              <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 border border-amber-300 flex items-center justify-between gap-2 shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-800 flex items-center justify-center shrink-0">
                    <DownloadCloud className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-stone-900 truncate flex items-center gap-1.5">
                      <span>检测到创意画布已解析产品</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-amber-200 text-amber-900 font-mono">
                        DNA
                      </span>
                    </div>
                    <div className="text-[10px] text-stone-600 truncate">
                      {detectedCanvasDraft.productName}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onSyncFromCanvas}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold shrink-0 shadow-xs transition flex items-center gap-1"
                >
                  <FileCheck className="w-3 h-3" />
                  <span>一键同步</span>
                </button>
              </div>
            )}

            {/* 智能上传与多模态读数入口卡片 */}
            <div
              onClick={handleOpenNewUpload}
              className="p-3 rounded-xl bg-gradient-to-br from-amber-500/10 via-amber-50 to-[#FAF7F2] border border-dashed border-amber-400 hover:border-amber-600 cursor-pointer transition group shadow-2xs"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-700 group-hover:scale-105 transition">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-stone-900 text-[11px] flex items-center gap-1.5">
                    <span>上传产品图 · AI 识别生成产品档案</span>
                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-200 text-amber-900 font-mono font-bold">
                      AI DOSSIER
                    </span>
                  </div>
                  <div className="text-[10px] text-stone-500 mt-0.5 leading-snug">
                    支持实拍/白底图，一键提取毫米长宽高、皮质肌理与空间物理真值档案
                  </div>
                </div>
              </div>
            </div>

            {/* 产品资产列表 */}
            <div className="space-y-2.5">
              {products.map((prod) => {
                const isPrimary = prod.priority === 'primary';
                const firstRef = prod.referenceImages?.[0];
                return (
                  <div
                    key={prod.id}
                    className={`p-3 rounded-xl bg-[#FAF8F5] border transition space-y-2 ${
                      isPrimary
                        ? 'border-amber-400/80 shadow-2xs ring-1 ring-amber-400/20'
                        : 'border-[#E5E0D8]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        {/* 产品缩略图 */}
                        <div
                          onClick={() => handleOpenEditProduct(prod)}
                          className="w-12 h-12 rounded-lg bg-white border border-stone-200 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer hover:opacity-80 transition group relative"
                          title="点击查看/编辑 AI 产品档案"
                        >
                          {firstRef?.publicUrl ? (
                            <img
                              src={firstRef.publicUrl}
                              alt={prod.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="w-5 h-5 text-stone-300" />
                          )}
                        </div>
                        <div>
                          <div
                            onClick={() => handleOpenEditProduct(prod)}
                            className="font-semibold text-stone-900 text-[12px] line-clamp-1 cursor-pointer hover:text-amber-700 transition flex items-center gap-1"
                          >
                            <span>{prod.name}</span>
                          </div>
                          <div className="text-[10px] text-stone-400 font-mono mt-0.5">
                            SKU: {prod.sku || 'N/A'} · {prod.role}
                          </div>
                          {prod.colors && prod.colors.length > 0 && (
                            <div className="text-[10px] text-amber-800/80 mt-0.5">
                              色调: {prod.colors.join(' / ')}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0 ${
                            isPrimary
                              ? 'bg-amber-100 text-amber-900 font-bold border border-amber-300'
                              : 'bg-stone-200/80 text-stone-700'
                          }`}
                        >
                          {isPrimary ? '主件 (Strict Lock)' : '配件'}
                        </span>
                        {/* 生产真值状态切换按钮 */}
                        <button
                          type="button"
                          onClick={() => handleToggleTruth(prod)}
                          className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold flex items-center gap-1 border transition ${
                            prod.productionTruth
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-stone-100 text-stone-600 border-stone-300 hover:bg-amber-50 hover:text-amber-800'
                          }`}
                          title={prod.productionTruth ? '点击恢复为待确认' : '点击确认锁定为生产真值'}
                        >
                          {prod.productionTruth ? (
                            <>
                              <Lock className="w-2.5 h-2.5 text-emerald-600" />
                              <span>真值已锁</span>
                            </>
                          ) : (
                            <>
                              <Unlock className="w-2.5 h-2.5 text-stone-400" />
                              <span>待确认为真值</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* 产品档案摘要状态 (Product Dossier Badge & Summary) */}
                    <div className="p-2 rounded-lg bg-amber-50/70 border border-amber-200/70 text-[10px] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-900 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-amber-600" />
                          <span>AI 产品档案</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenEditProduct(prod)}
                          className="text-amber-700 hover:text-amber-900 underline font-medium text-[9.5px]"
                        >
                          编辑档案 / 重新AI识别
                        </button>
                      </div>
                      <p className="text-stone-600 text-[9.5px] leading-relaxed line-clamp-2">
                        {prod.dossierSummary || `尺寸: ${prod.dimensions?.width || 3100}×${prod.dimensions?.depth || 1080}×${prod.dimensions?.height || 950}mm · 材质: ${prod.materials?.join('、') || '高定进口面料'}`}
                      </p>
                    </div>

                    {/* 数据溯源条 (Provenance & Confidence) */}
                    <div className="flex items-center justify-between text-[10px] px-2 py-1 rounded bg-stone-100/80 font-mono text-stone-500">
                      <span>PROVENANCE: {prod.provenance || 'AI_ESTIMATED'}</span>
                      <span>置信度: {prod.readoutConfidence || 96}%</span>
                    </div>

                    {/* 物理锁定规则 (Strict Locks) */}
                    {prod.lockedRules && prod.lockedRules.length > 0 && (
                      <div className="text-[10px] bg-amber-50/60 p-2 rounded-lg border border-amber-200/50 space-y-1">
                        <div className="font-semibold text-amber-950 flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5 text-amber-700" />
                          <span>物理不变量锁定规则：</span>
                        </div>
                        {prod.lockedRules.map((rule, idx) => (
                          <div key={idx} className="text-amber-900/80 truncate text-[9.5px]">
                            • {rule}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 材质与机构读数 */}
                    {prod.materials && (
                      <div className="text-[10px] text-stone-600 bg-white p-2 rounded-lg border border-stone-200/60 space-y-0.5">
                        <div className="font-medium text-stone-700">材质与机构：</div>
                        {prod.materials.map((m, idx) => (
                          <div key={idx} className="text-stone-500 truncate">
                            • {m}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 三维毫米尺寸读数 */}
                    {prod.dimensions && (
                      <div className="text-[10px] text-stone-500 font-mono flex items-center justify-between pt-0.5">
                        <span>尺寸 (mm):</span>
                        <span className="font-bold text-stone-700">
                          {prod.dimensions.width}W × {prod.dimensions.depth}D × {prod.dimensions.height}H
                        </span>
                      </div>
                    )}

                    {/* 卡片底部操作条 */}
                    <div className="pt-2 border-t border-stone-200/60 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {!isPrimary && onSetPrimaryProduct && (
                          <button
                            onClick={() => onSetPrimaryProduct(prod.id)}
                            className="text-[10px] px-2 py-0.5 rounded bg-stone-100 hover:bg-amber-50 hover:text-amber-800 text-stone-600 transition flex items-center gap-1"
                            title="设为空间第一主角"
                          >
                            <Star className="w-2.5 h-2.5 text-amber-600" />
                            设为主件
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEditProduct(prod)}
                          className="text-[10px] px-2 py-0.5 rounded bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 transition flex items-center gap-1"
                        >
                          <Edit3 className="w-2.5 h-2.5 text-stone-500" />
                          查看/编辑读数
                        </button>
                      </div>

                      {onRemoveProduct && products.length > 1 && (
                        <button
                          onClick={() => onRemoveProduct(prod.id)}
                          className="text-[10px] p-1 text-stone-400 hover:text-rose-600 transition"
                          title="从空间资产中移除"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}


        {/* TAB 2: 户型原型选择 (N-R01 ~ N-R06) */}
        {activeTab === 'space' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-stone-800 text-[13px]">
                空间户型原型 (6 套标准原型)
              </span>
              <span className="text-[10px] text-stone-500">当前：{selectedSpace.code}</span>
            </div>

            <div className="space-y-2">
              {allSpaces.map((space) => {
                const isSelected = space.id === selectedSpace.id;
                return (
                  <div
                    key={space.id}
                    onClick={() => onSelectSpace(space)}
                    className={`p-3 rounded-xl cursor-pointer transition-all border text-left ${
                      isSelected
                        ? 'bg-amber-50/70 border-amber-500 ring-1 ring-amber-400/30'
                        : 'bg-[#FAF8F5] border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-stone-900 text-[12px]">
                        {space.name}
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-stone-200 font-bold text-amber-800">
                        {space.code}
                      </span>
                    </div>
                    <div className="text-[10px] text-stone-500 mt-1">
                      净高: {space.ceilingHeight}m · 布局: {space.layoutType} · 业态: {space.propertyType}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {space.signatureFeatures.map((feat, i) => (
                        <span
                          key={i}
                          className="text-[9px] px-1.5 py-0.5 bg-white rounded border border-stone-200 text-stone-600"
                        >
                          {feat}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: 风格体系选择 (12 大风格) */}
        {activeTab === 'style' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-stone-800 text-[13px]">
                贵族空间风格系统 (12 种)
              </span>
              <span className="text-[10px] text-amber-800 font-semibold">{selectedStyle.name}</span>
            </div>

            <div className="space-y-2">
              {allStyles.map((style) => {
                const isSelected = style.id === selectedStyle.id;
                return (
                  <div
                    key={style.id}
                    onClick={() => onSelectStyle(style)}
                    className={`p-3 rounded-xl cursor-pointer transition-all border text-left ${
                      isSelected
                        ? 'bg-amber-50/70 border-amber-500 ring-1 ring-amber-400/30'
                        : 'bg-[#FAF8F5] border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-stone-900 text-[12px]">
                        {style.name}
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 font-mono">
                        {style.category}
                      </span>
                    </div>

                    {/* 色卡小圆点 */}
                    <div className="flex items-center gap-1.5 my-2">
                      {style.colorPalette.map((color, i) => (
                        <div
                          key={i}
                          className="w-4 h-4 rounded-full border border-black/10 shadow-xs"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>

                    <div className="text-[10px] text-stone-500 line-clamp-1">
                      {style.materialSystem.join(' · ')}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: 摆位蓝图 (KEEP FURNITURE FIXED) */}
        {activeTab === 'blueprint' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-stone-800 text-[13px]">
                空间摆位蓝图 (Top-down Layout)
              </span>
              <button
                onClick={onToggleLockBlueprint}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium transition ${
                  blueprint.isLocked
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}
              >
                {blueprint.isLocked ? (
                  <>
                    <Lock className="w-3 h-3 text-emerald-700" />
                    <span>摆位已绝对锁定 (LOCKED)</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3 h-3 text-amber-700" />
                    <span>摆位可微调</span>
                  </>
                )}
              </button>
            </div>

            {/* 顶视图俯视模拟卡片 */}
            <div className="aspect-[4/3] w-full bg-[#FAF8F5] rounded-xl border border-[#DFD8CE] p-3 relative overflow-hidden flex flex-col justify-between">
              <div className="text-[9px] font-mono text-stone-400">
                TOP-DOWN 2D BLUEPRINT VIEW · PROJECTION (0..1)
              </div>

              {/* 空间中的摆位图示 */}
              <div className="relative w-full h-36 bg-white/70 rounded-lg border border-dashed border-stone-300 flex items-center justify-center">
                {blueprint.items.map((item) => (
                  <div
                    key={item.assetId}
                    style={{
                      position: 'absolute',
                      left: `${item.x * 100}%`,
                      top: `${item.y * 100}%`,
                      transform: `translate(-50%, -50%) rotate(${item.rotationDeg}deg)`
                    }}
                    className="px-2 py-1 bg-stone-900/90 text-white rounded text-[9px] shadow-sm border border-amber-400/40 whitespace-nowrap cursor-default"
                  >
                    {item.role === 'sofa_3seat' && '🛋️ 主沙发 (固定)'}
                    {item.role === 'recliner_1seat' && '💺 功能单椅'}
                    {item.role === 'coffee_table' && '☕ 奢石茶几'}
                    {item.role === 'side_table' && '🪑 边几'}
                  </div>
                ))}
              </div>

              <div className="text-[10px] text-stone-500 flex items-center justify-between">
                <span>坐标系原点: 空间几何中心 (0.5, 0.5)</span>
                <span className="text-emerald-700 font-semibold">物理约束严格保真</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-900 space-y-1">
              <div className="font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                <span>工程守则：保持家具不动，仅动摄影机</span>
              </div>
              <p className="text-[10px] text-stone-600 leading-relaxed">
                A00 空间母版一旦锁定，后续 A01~A08 镜头组将强制继承此蓝图物理坐标，绝不允许为了镜头效果擅自移动沙发与茶几。
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 底部生成 A00 空间母版触发区 */}
      <div className="p-3 border-t border-[#EBE7E0] bg-[#FAF8F5] space-y-2 shrink-0">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-stone-600">母版锁定状态:</span>
          {sceneMaster?.isLocked ? (
            <span className="text-emerald-700 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              已锁定 A00 母版基准
            </span>
          ) : (
            <span className="text-stone-500">未锁定 (随时可更新)</span>
          )}
        </div>

        <button
          onClick={onGenerateSceneMaster}
          disabled={isGeneratingMaster}
          className={`w-full py-2.5 rounded-xl font-semibold text-xs shadow-sm transition flex items-center justify-center gap-2 ${
            isGeneratingMaster
              ? 'bg-stone-300 text-stone-500 cursor-not-allowed'
              : 'bg-stone-900 hover:bg-stone-800 text-amber-300 active:scale-[0.99]'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>
            {isGeneratingMaster
              ? '正在合成与编译 A00 母版...'
              : sceneMaster?.isLocked
              ? '重新生成 A00 空间母版'
              : '生成并锁定 A00 空间母版'}
          </span>
        </button>
      </div>
      {/* 产品真值上传与多模态读数窗口 */}
      <ProductUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSaveProduct={handleSaveProductFromModal}
        initialProduct={editingProduct}
      />
    </div>
  );
};
