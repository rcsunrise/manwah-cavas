// src/features/space-studio/components/SpaceStudioRightPanel.tsx
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Sparkles,
  RefreshCw,
  Zap,
  CheckCircle,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Sliders,
  Camera,
  Layers,
  Ratio,
  Cpu,
  Settings2,
  SlidersHorizontal,
  User,
  Users,
  Activity,
  SunMedium,
  Image as ImageIcon,
  ChevronRight,
  Plus,
  Trash2,
  CheckSquare,
  Square,
  Lock,
  UserPlus,
  Sparkle
} from 'lucide-react';
import {
  ShotInstance,
  SceneMaster,
  ImageAspectRatio,
  IMAGE_ASPECT_SPECS,
  CameraDNA,
  RenderComputeConfig,
} from '../../../types/spaceStudio';
import {
  ActivePhotographyAssets,
  SceneStyleAsset,
  ModelAsset,
  PoseAsset,
  HumanLayoutConfig,
  HumanSlotAssignment,
  DEFAULT_4_HUMAN_SLOTS,
  DEFAULT_6_HUMAN_SLOTS
} from '../../../types/spaceAssetLibrary';
import { SceneStyleGalleryModal } from './assets/SceneStyleGalleryModal';
import { ModelAssetModal } from './assets/ModelAssetModal';
import { spaceAssetLibraryService } from '../../../services/spaceAssetLibraryService';

interface SpaceStudioRightPanelProps {
  activeShot: ShotInstance;
  activeShotIndex: number;
  totalShots: number;
  sceneMaster: SceneMaster | null;
  aspectRatio: ImageAspectRatio;
  onChangeAspectRatio: (ratio: ImageAspectRatio) => void;

  computeConfig?: RenderComputeConfig;
  onChangeComputeConfig?: (updater: Partial<RenderComputeConfig>) => void;

  isGeneratingCurrent: boolean;
  isGeneratingAll: boolean;
  onGenerateCurrentShot: () => void;
  onGenerateAllShots: () => void;

  // 人物添加重构专属参数
  isGeneratingHuman?: boolean;
  onRenderHumanPass?: () => void;
  humanLayout?: HumanLayoutConfig;
  onChangeHumanLayout?: (layout: HumanLayoutConfig) => void;
  availableModels?: ModelAsset[];

  onOptimizeLightingAndPrompt: () => void;
  onUpdateCamera: (shotId: string, updates: Partial<CameraDNA>) => void;

  // Asset Library integration props
  activeAssets?: ActivePhotographyAssets;
  onUpdateActiveAssets?: (updater: Partial<ActivePhotographyAssets>) => void;

  // Custom Prompt / Negative Prompt support
  customPrompt?: string;
  onChangeCustomPrompt?: (prompt: string) => void;
  negativePrompt?: string;
  onChangeNegativePrompt?: (neg: string) => void;

  theme?: 'dark' | 'light';
}

const DEFAULT_COMPUTE_CONFIG: RenderComputeConfig = {
  model: 'gemini-3.1-flash-image',
  resolution: '2K',
  aspectRatio: '4:3',
  customAspectRatio: '',
  seed: undefined,
  namingPreset: 'detailed',
  customPrefix: ''
};

const LIGHTING_OPTIONS = [
  { id: 'natural_soft', label: '天然通透漫射光', desc: '大落地窗自然散射，阴影柔和' },
  { id: 'afternoon_warm', label: '午后斜阳暖光', desc: '3200K 金色光柱，温暖家居氛围' },
  { id: 'morning_clear', label: '清晨纯净冷白光', desc: '5600K 纯净晨曦，现代高知清爽' },
  { id: 'dramatic_side', label: '高端建筑侧逆光', desc: '强明暗层次，凸显皮质与面料纹理' },
  { id: 'luxury_night', label: '微醺暖夜射灯', desc: '2700K 局部重点照明，私享私邸质感' },
];

export const SpaceStudioRightPanel: React.FC<SpaceStudioRightPanelProps> = ({
  activeShot,
  activeShotIndex,
  totalShots,
  sceneMaster,
  aspectRatio,
  onChangeAspectRatio,
  computeConfig = DEFAULT_COMPUTE_CONFIG,
  onChangeComputeConfig,
  isGeneratingCurrent,
  isGeneratingAll,
  onGenerateCurrentShot,
  onGenerateAllShots,
  isGeneratingHuman = false,
  onRenderHumanPass,
  humanLayout,
  onChangeHumanLayout,
  availableModels = [],
  onOptimizeLightingAndPrompt,
  onUpdateCamera,
  activeAssets,
  onUpdateActiveAssets,
  customPrompt = '',
  onChangeCustomPrompt,
  negativePrompt = 'nsfw, low quality, deformed anatomy, blurry, distorted furniture, extra limbs, watermark',
  onChangeNegativePrompt,
  theme = 'dark'
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);

  // Local state for Human Layout if not controlled from parent
  const [localLayout, setLocalLayout] = useState<HumanLayoutConfig>(() => ({
    mode: '4',
    characterCount: 4,
    disallowExtraCharacters: true,
    slots: DEFAULT_4_HUMAN_SLOTS
  }));

  const activeLayout = humanLayout || localLayout;
  const updateLayout = (updated: Partial<HumanLayoutConfig>) => {
    const next = { ...activeLayout, ...updated };
    if (onChangeHumanLayout) {
      onChangeHumanLayout(next);
    } else {
      setLocalLayout(next);
    }
  };

  const isLight = theme === 'light';
  const cfg = computeConfig || DEFAULT_COMPUTE_CONFIG;

  const handleUpdateCompute = (updates: Partial<RenderComputeConfig>) => {
    if (onChangeComputeConfig) {
      onChangeComputeConfig(updates);
    }
    if (updates.aspectRatio) {
      onChangeAspectRatio(updates.aspectRatio);
    }
  };

  // Switch between 4 / 6 / Custom Human Layout modes
  const handleSwitchLayoutMode = (mode: '4' | '6' | 'custom') => {
    if (mode === '4') {
      updateLayout({
        mode: '4',
        characterCount: 4,
        slots: DEFAULT_4_HUMAN_SLOTS
      });
    } else if (mode === '6') {
      updateLayout({
        mode: '6',
        characterCount: 6,
        slots: DEFAULT_6_HUMAN_SLOTS
      });
    } else {
      updateLayout({
        mode: 'custom',
        characterCount: activeLayout.slots.length,
        slots: activeLayout.slots.length > 0 ? activeLayout.slots : DEFAULT_4_HUMAN_SLOTS
      });
    }
  };

  // Update a single slot
  const handleUpdateSlot = (slotId: string, updates: Partial<HumanSlotAssignment>) => {
    const newSlots = activeLayout.slots.map(s => (s.id === slotId ? { ...s, ...updates } : s));
    updateLayout({ slots: newSlots });
  };

  // Add custom slot
  const handleAddSlot = () => {
    const newId = `slot-${Date.now().toString(36)}`;
    const newSlot: HumanSlotAssignment = {
      id: newId,
      positionDesc: '客厅功能单椅或地毯休闲位',
      actionDesc: '自然落座，松弛与居室交互'
    };
    const newSlots = [...activeLayout.slots, newSlot];
    updateLayout({
      slots: newSlots,
      characterCount: newSlots.length
    });
  };

  // Remove custom slot
  const handleRemoveSlot = (slotId: string) => {
    if (activeLayout.slots.length <= 1) return;
    const newSlots = activeLayout.slots.filter(s => s.id !== slotId);
    updateLayout({
      slots: newSlots,
      characterCount: newSlots.length
    });
  };

  // Check if current shot has an approved image (or is A00 with locked master)
  const hasBaseImage = Boolean(
    activeShot.revisions.length > 0 || (activeShot.templateCode === 'A00' && sceneMaster?.isLocked)
  );

  return (
    <div
      className={`w-92 border-l flex flex-col h-full select-none z-30 shrink-0 transition-colors ${
        isLight ? 'bg-white border-stone-200 text-stone-800' : 'bg-[#12141c] border-stone-800 text-stone-200'
      }`}
    >
      {/* 1. Header */}
      <div
        className={`px-4 py-3 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'border-stone-200 bg-[#FAF8F5]' : 'border-white/10 bg-[#161822]'
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Sparkles className="w-3 h-3" />
          </div>
          <div>
            <span className="font-bold text-xs text-white">AI 摄影导演工作台</span>
            <span className="text-[9px] text-amber-400/90 ml-1.5 font-mono">人居编排 v3.0</span>
          </div>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 text-amber-400 border border-amber-500/20">
          0{activeShotIndex + 1} / 0{totalShots} 镜 ({activeShot.templateCode})
        </span>
      </div>

      {/* 2. Scrollable Body: Exactly Ordered as Requested:
          Scene Style → Model DNA → Human Layout → Lighting → 添加模特
      */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 text-xs">
        <motion.div
          key={activeShot.id}
          initial={{ opacity: 0.9, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="space-y-3.5"
        >

          {/* Quick Render Base Shot Header Button */}
          <div className="space-y-1.5">
            <button
              onClick={onGenerateCurrentShot}
              disabled={isGeneratingCurrent || isGeneratingAll || isGeneratingHuman}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
            >
              {isGeneratingCurrent ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : (
                <Camera className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span className="text-xs">
                {isGeneratingCurrent
                  ? `正在渲染 ${activeShot.templateCode} 基础机位...`
                  : activeShot.templateCode === 'A00'
                  ? (sceneMaster?.isLocked ? '重新生成 A00 空间母版' : '生成并锁定 A00 空间母版')
                  : `生成 ${activeShot.templateCode} 基础机位 (4 候选)`}
              </span>
            </button>
          </div>

          {/* ═════════════════════════════════════════════════════════════
              SECTION 1: Scene Style (空间风格)
          ═════════════════════════════════════════════════════════════ */}
          <div className="p-3 rounded-xl bg-[#161822] border border-white/10 space-y-2 hover:border-amber-500/40 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>1. 空间风格 (Scene Style)</span>
              </span>
              <button
                onClick={() => setIsStyleModalOpen(true)}
                className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-0.5 cursor-pointer"
              >
                <span>图库切换</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {activeAssets?.style ? (
              <div
                onClick={() => setIsStyleModalOpen(true)}
                className="group flex gap-2.5 p-2 rounded-lg bg-black/40 border border-white/5 hover:border-amber-500/30 cursor-pointer transition-all"
              >
                <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 relative bg-black/60">
                  <img
                    src={activeAssets.style.thumbnail}
                    alt={activeAssets.style.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors truncate">
                    {activeAssets.style.name}
                  </div>
                  <div className="text-[10px] text-neutral-400 flex items-center gap-1 mt-0.5">
                    <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 text-[9px]">
                      {activeAssets.style.category}
                    </span>
                    <span className="truncate">{activeAssets.style.lightingTone}</span>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsStyleModalOpen(true)}
                className="w-full py-2.5 border border-dashed border-white/15 rounded-lg text-neutral-400 hover:text-white flex items-center justify-center gap-1.5 bg-black/20 cursor-pointer text-xs"
              >
                <Plus className="w-3.5 h-3.5 text-amber-400" />
                <span>选择空间风格资产</span>
              </button>
            )}
          </div>

          {/* ═════════════════════════════════════════════════════════════
              SECTION 2: Model DNA (角色资产 / AI 识别)
          ═════════════════════════════════════════════════════════════ */}
          <div className="p-3 rounded-xl bg-[#161822] border border-white/10 space-y-2 hover:border-purple-500/40 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-purple-400" />
                <span>2. 角色资产 (Model DNA)</span>
              </span>
              <button
                onClick={() => setIsModelModalOpen(true)}
                className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-0.5 cursor-pointer font-medium"
              >
                <span>导入角色 / AI识别</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {availableModels.length > 0 ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-neutral-400">
                  <span>已导入 {availableModels.length} 个角色资产</span>
                  <button
                    onClick={() => setIsModelModalOpen(true)}
                    className="text-purple-400 hover:underline text-[9px]"
                  >
                    管理角色
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {availableModels.slice(0, 4).map(m => (
                    <div
                      key={m.id}
                      onClick={() => setIsModelModalOpen(true)}
                      className="flex items-center gap-2 p-1.5 rounded-lg bg-black/40 border border-white/5 hover:border-purple-500/30 cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-black/60 shrink-0">
                        <img src={m.thumbnail || m.coverImage} alt={m.nameZh || m.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold text-white truncate">{m.nameZh || m.name}</div>
                        <div className="text-[9px] text-purple-400 truncate">{m.ageGroup || '成熟知性'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] text-neutral-400 leading-relaxed">
                  系统已清除默认固定家庭角色。请通过【导入角色资产 / AI识别】上传人物卡、多视角图或服装图，自动提取 Model DNA。
                </p>
                <button
                  onClick={() => setIsModelModalOpen(true)}
                  className="w-full py-2.5 border border-dashed border-purple-500/30 hover:border-purple-500/60 rounded-xl text-purple-300/90 hover:text-purple-200 flex items-center justify-center gap-1.5 bg-purple-500/5 hover:bg-purple-500/10 transition-all font-medium text-xs cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5 text-purple-400" />
                  <span>上传人物资产卡 / AI 识别 Model DNA</span>
                </button>
              </div>
            )}
          </div>

          {/* ═════════════════════════════════════════════════════════════
              SECTION 3: Human Layout (人物编排器)
          ═════════════════════════════════════════════════════════════ */}
          <div className="p-3 rounded-xl bg-gradient-to-br from-[#1b1928] to-[#151722] border border-amber-500/30 space-y-2.5 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-amber-400" />
                <span>3. 人物编排器 (Human Layout)</span>
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30">
                {activeLayout.characterCount} 人阵容
              </span>
            </div>

            {/* Mode Switcher: 4人 / 6人 / 自定义 */}
            <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-black/50 border border-white/10 text-[11px]">
              <button
                onClick={() => handleSwitchLayoutMode('4')}
                className={`py-1 rounded font-medium transition ${
                  activeLayout.mode === '4'
                    ? 'bg-amber-500 text-black font-bold shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                4 人阵容
              </button>
              <button
                onClick={() => handleSwitchLayoutMode('6')}
                className={`py-1 rounded font-medium transition ${
                  activeLayout.mode === '6'
                    ? 'bg-amber-500 text-black font-bold shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                6 人阵容
              </button>
              <button
                onClick={() => handleSwitchLayoutMode('custom')}
                className={`py-1 rounded font-medium transition ${
                  activeLayout.mode === 'custom'
                    ? 'bg-amber-500 text-black font-bold shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                自定义
              </button>
            </div>

            {/* Slots List */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
              {activeLayout.slots.map((slot, idx) => (
                <div
                  key={slot.id}
                  className="p-2 rounded-lg bg-black/40 border border-white/5 space-y-1.5 hover:border-amber-500/20 transition-all text-[11px]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 text-[9px] font-mono font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      {/* Model Selector */}
                      <select
                        value={slot.modelId || ''}
                        onChange={(e) => {
                          const mId = e.target.value;
                          const found = availableModels.find(m => m.id === mId);
                          handleUpdateSlot(slot.id, {
                            modelId: mId || undefined,
                            modelName: found ? (found.nameZh || found.name) : undefined
                          });
                        }}
                        className="bg-[#1e202e] border border-white/15 rounded px-2 py-0.5 text-[10px] text-white focus:border-amber-400 outline-none"
                      >
                        <option value="">{slot.modelName || `角色位 ${idx + 1}`}</option>
                        {availableModels.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.nameZh || m.name} ({m.roleType || '模特'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {activeLayout.mode === 'custom' && activeLayout.slots.length > 1 && (
                      <button
                        onClick={() => handleRemoveSlot(slot.id)}
                        className="text-neutral-500 hover:text-rose-400 transition"
                        title="删除该角色位"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Position Input */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-neutral-400 shrink-0">位置:</span>
                    <input
                      type="text"
                      value={slot.positionDesc}
                      onChange={(e) => handleUpdateSlot(slot.id, { positionDesc: e.target.value })}
                      placeholder="例如：主沙发一号电动功能位"
                      className="flex-1 bg-black/50 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white focus:border-amber-400 outline-none truncate"
                    />
                  </div>

                  {/* Action Input */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-neutral-400 shrink-0">动作:</span>
                    <input
                      type="text"
                      value={slot.actionDesc}
                      onChange={(e) => handleUpdateSlot(slot.id, { actionDesc: e.target.value })}
                      placeholder="例如：展开脚托半躺，手持画册与家人交谈"
                      className="flex-1 bg-black/50 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white focus:border-amber-400 outline-none truncate"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Custom Mode: Add Slot Button */}
            {activeLayout.mode === 'custom' && (
              <button
                onClick={handleAddSlot}
                className="w-full py-1.5 border border-dashed border-amber-500/30 hover:border-amber-500/50 rounded-lg text-amber-300/80 hover:text-amber-200 text-[10px] flex items-center justify-center gap-1 bg-amber-500/5 transition cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>添加角色位</span>
              </button>
            )}

            {/* Disallow Extra Characters Checkbox */}
            <div
              onClick={() => updateLayout({ disallowExtraCharacters: !activeLayout.disallowExtraCharacters })}
              className="flex items-center gap-2 p-1.5 rounded-lg bg-black/30 border border-white/5 hover:border-white/15 cursor-pointer text-[10px] text-neutral-300"
            >
              {activeLayout.disallowExtraCharacters ? (
                <CheckSquare className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              ) : (
                <Square className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
              )}
              <span className="select-none">禁止新增额外人物 (严格锁定人数，杜绝杂乱路人)</span>
            </div>
          </div>

          {/* ═════════════════════════════════════════════════════════════
              SECTION 4: Lighting (光线氛围)
          ═════════════════════════════════════════════════════════════ */}
          <div className="p-3 rounded-xl bg-[#161822] border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
                <SunMedium className="w-3.5 h-3.5 text-amber-400" />
                <span>4. 光线氛围 (Lighting)</span>
              </span>
              <span className="text-[10px] text-neutral-500">电影级布光</span>
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              {LIGHTING_OPTIONS.map(opt => {
                const isSelected = (activeAssets?.lighting || '天然通透漫射光') === opt.label;
                return (
                  <button
                    key={opt.id}
                    onClick={() => onUpdateActiveAssets?.({ lighting: opt.label })}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500/50 text-white'
                        : 'bg-black/30 border-white/5 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <span className="text-xs font-medium">{opt.label}</span>
                    <span className="text-[9px] text-neutral-500 scale-95">{opt.desc.slice(0, 10)}...</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ═════════════════════════════════════════════════════════════
              SECTION 5: 添加模特 (基于当前镜头生成人物版)
          ═════════════════════════════════════════════════════════════ */}
          <div className="p-3 rounded-xl bg-gradient-to-br from-[#241b35] via-[#1a1c29] to-[#141620] border-2 border-purple-500/40 space-y-2.5 shadow-xl hover:border-purple-500/70 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-purple-300 font-bold text-xs">
                <Sparkle className="w-3.5 h-3.5 text-purple-400" />
                <span>5. 基于当前镜头生成人物版</span>
              </div>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                每次 4 候选
              </span>
            </div>

            {/* Lock Invariants Badges */}
            <div className="grid grid-cols-3 gap-1 text-[9px] font-mono text-center">
              <div className="bg-black/40 border border-emerald-500/30 text-emerald-300 p-1 rounded flex items-center justify-center gap-1">
                <Lock className="w-2.5 h-2.5" /> 锁空间
              </div>
              <div className="bg-black/40 border border-emerald-500/30 text-emerald-300 p-1 rounded flex items-center justify-center gap-1">
                <Lock className="w-2.5 h-2.5" /> 锁产品
              </div>
              <div className="bg-black/40 border border-emerald-500/30 text-emerald-300 p-1 rounded flex items-center justify-center gap-1">
                <Lock className="w-2.5 h-2.5" /> 锁家具
              </div>
              <div className="bg-black/40 border border-emerald-500/30 text-emerald-300 p-1 rounded flex items-center justify-center gap-1">
                <Lock className="w-2.5 h-2.5" /> 锁风格
              </div>
              <div className="bg-black/40 border border-emerald-500/30 text-emerald-300 p-1 rounded flex items-center justify-center gap-1">
                <Lock className="w-2.5 h-2.5" /> 锁 Camera
              </div>
              <div className="bg-purple-500/20 border border-purple-500/40 text-purple-300 p-1 rounded flex items-center justify-center gap-1 font-bold">
                <Plus className="w-2.5 h-2.5" /> 只增人物
              </div>
            </div>

            {/* Core Action Button */}
            <button
              onClick={onRenderHumanPass}
              disabled={isGeneratingHuman || isGeneratingCurrent || isGeneratingAll}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-purple-600 via-purple-500 to-amber-500 hover:from-purple-500 hover:to-amber-400 disabled:opacity-50 text-white font-extrabold rounded-xl shadow-lg shadow-purple-600/30 transition active:scale-98 cursor-pointer"
            >
              {isGeneratingHuman ? (
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Users className="w-4 h-4 text-white stroke-[2.5]" />
              )}
              <span className="text-xs tracking-wider">
                {isGeneratingHuman
                  ? `正在为 ${activeShot.templateCode} 生成 4 张人物版候选...`
                  : `基于当前镜头添加模特 (${activeShot.templateCode})`}
              </span>
            </button>
          </div>

          {/* Current Shot Info & Collapsible Camera / Advanced Controls */}
          <div className="pt-2 border-t border-white/10 space-y-2">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full py-1.5 text-neutral-400 hover:text-white transition-all cursor-pointer text-[11px]"
            >
              <span className="font-semibold flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                <span>机位与画幅高级参数 ({activeShot.templateCode})</span>
              </span>
              {showAdvanced ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {showAdvanced && (
              <div className="space-y-3 p-3 rounded-xl bg-black/40 border border-white/10 animate-in fade-in duration-150">
                {/* 1. 机位参数 */}
                <div className="space-y-2 text-[10px]">
                  <div className="flex items-center justify-between text-neutral-400">
                    <span>焦距: {activeShot.camera.lensMm}mm</span>
                    <span>高度: {activeShot.camera.heightCm}cm</span>
                    <span>偏角: {activeShot.camera.yawDeg}°</span>
                  </div>
                  <div>
                    <div className="flex justify-between text-neutral-400 mb-1">
                      <span>机位高度</span>
                      <span className="font-mono text-amber-400">{activeShot.camera.heightCm}cm</span>
                    </div>
                    <input
                      type="range"
                      min={60}
                      max={180}
                      step={5}
                      value={activeShot.camera.heightCm}
                      onChange={e => onUpdateCamera(activeShot.id, { heightCm: parseInt(e.target.value, 10) })}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* 2. 渲染画幅 */}
                <div className="space-y-1">
                  <span className="text-[10px] text-neutral-400">渲染画幅</span>
                  <div className="grid grid-cols-4 gap-1">
                    {['4:3', '16:9', '1:1', '3:4'].map(r => (
                      <button
                        key={r}
                        onClick={() => handleUpdateCompute({ aspectRatio: r as ImageAspectRatio })}
                        className={`py-1 rounded text-[10px] font-mono transition ${
                          aspectRatio === r
                            ? 'bg-amber-500 text-black font-bold'
                            : 'bg-black/30 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Product Guarantee Footer */}
          <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-neutral-300 space-y-1">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[10px]">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>敏华物理真值护航 · 零家具漂移</span>
            </div>
            <p className="text-[9px] text-neutral-400 leading-tight">
              人体工程就座落点锁定、沙发轮廓与颜色严禁漂移、严禁额外无关人员。
            </p>
          </div>

        </motion.div>
      </div>

      {/* Asset Modals */}
      <SceneStyleGalleryModal
        isOpen={isStyleModalOpen}
        onClose={() => setIsStyleModalOpen(false)}
        selectedStyleId={activeAssets?.style?.id}
        onSelectStyle={(style) => onUpdateActiveAssets?.({ style })}
      />

      <ModelAssetModal
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
        selectedModelId={activeAssets?.model?.id}
        onSelectModel={(model) => onUpdateActiveAssets?.({ model })}
      />
    </div>
  );
};
