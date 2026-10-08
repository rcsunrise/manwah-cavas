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
  Sparkle,
  Link2,
  UserCheck,
  Check,
  AlertTriangle
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
  onApplyStyleAndGenerateMaster?: (style: SceneStyleAsset) => void;

  // Custom Prompt / Negative Prompt support
  customPrompt?: string;
  onChangeCustomPrompt?: (prompt: string) => void;
  negativePrompt?: string;
  onChangeNegativePrompt?: (neg: string) => void;

  theme?: 'dark' | 'light';

  // 自由拉伸宽度与折叠收起支持
  width?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
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
  onApplyStyleAndGenerateMaster,
  customPrompt = '',
  onChangeCustomPrompt,
  negativePrompt = 'nsfw, low quality, deformed anatomy, blurry, distorted furniture, extra limbs, watermark',
  onChangeNegativePrompt,
  theme = 'dark',
  width = 368,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isHumanLayoutCollapsed, setIsHumanLayoutCollapsed] = useState(false);
  const [isLightingCollapsed, setIsLightingCollapsed] = useState(true);

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

  // 正在生成状态多阶段演进提示
  const [generationPhase, setGenerationPhase] = useState<number>(1);
  const [generationProgress, setGenerationProgress] = useState<number>(15);

  useEffect(() => {
    let interval: any = null;
    let step2Timer: any = null;
    let step3Timer: any = null;

    if (isGeneratingHuman) {
      setGenerationPhase(1);
      setGenerationProgress(22);

      interval = setInterval(() => {
        setGenerationProgress(prev => {
          if (prev < 48) return prev + 7;
          if (prev < 82) return prev + 3;
          if (prev < 95) return prev + 1;
          return 95;
        });
      }, 700);

      step2Timer = setTimeout(() => {
        setGenerationPhase(2);
      }, 3500);

      step3Timer = setTimeout(() => {
        setGenerationPhase(3);
      }, 9000);
    } else {
      setGenerationPhase(1);
      setGenerationProgress(15);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (step2Timer) clearTimeout(step2Timer);
      if (step3Timer) clearTimeout(step3Timer);
    };
  }, [isGeneratingHuman]);

  // 计算某个角色当前在编排器中被关联到的槽位信息
  const getModelAssignedSlots = (modelId: string) => {
    return activeLayout.slots
      .map((s, idx) => ({ slot: s, index: idx + 1 }))
      .filter(item => item.slot.modelId === modelId);
  };

  // 一键将所有已导入角色资产与编排器槽位 1:1 精确关联
  const handleAlignAllImportedModels = () => {
    if (!availableModels || availableModels.length === 0) return;

    const defaultPositionPresets = [
      { position: '主沙发一号电动功能主座（展开脚托）', action: '从容就座，左手搭扶手，右手握持画册与家人交谈' },
      { position: '单人真皮功能单椅', action: '端坐品茗，神态安详从容，展现长者风范' },
      { position: '沙发贵妃榻休闲位', action: '优雅侧倚，手捧暖白瓷杯，身体微倾倾听' },
      { position: '沙发前羊毛地毯，倚靠茶几边缘', action: '席地而坐，操作平板电脑，姿态轻松机敏' },
      { position: '主沙发二号位中央舒适座', action: '舒适依偎靠坐，笑容自然温暖，享受居家惬意' },
      { position: '沙发侧边休闲脚凳', action: '轻松侧坐，双腿自然交叠，身姿轻盈舒展' }
    ];

    const alignedSlots: HumanSlotAssignment[] = availableModels.map((m, idx) => {
      const preset = defaultPositionPresets[idx % defaultPositionPresets.length];
      const isElder = m.nameZh?.includes('老') || m.nameZh?.includes('爷') || m.ageGroup?.includes('60') || m.roleType === 'grandfather' || m.roleType === 'grandmother';
      const isChild = m.roleType === 'daughter' || m.roleType === 'son' || m.ageGroup?.includes('童') || m.ageGroup?.includes('岁 活');

      let positionDesc = preset.position;
      let actionDesc = preset.action;
      if (isElder) {
        positionDesc = '单人真皮功能单椅或尊享主位';
        actionDesc = '端坐品茗，神态安详从容，目光慈和沉稳';
      } else if (isChild) {
        positionDesc = '沙发前羊毛地毯休闲位，贴靠沙发边缘';
        actionDesc = '盘腿席地而坐，专注摆弄画册玩具，神情生动灵巧';
      }

      return {
        id: `slot-aligned-${m.id}-${Date.now().toString(36)}-${idx}`,
        modelId: m.id,
        modelName: m.nameZh || m.name,
        positionDesc,
        actionDesc
      };
    });

    updateLayout({
      mode: availableModels.length === 4 ? '4' : availableModels.length === 6 ? '6' : 'custom',
      characterCount: availableModels.length,
      slots: alignedSlots
    });
  };

  // 点击角色卡片快速加入/移出或指派到编排器
  const handleToggleModelInLayout = (model: ModelAsset) => {
    const assigned = getModelAssignedSlots(model.id);
    if (assigned.length > 0) {
      // 若已关联，且总槽位大于1，移出该槽位
      if (activeLayout.slots.length > 1) {
        const remainingSlots = activeLayout.slots.filter(s => s.modelId !== model.id);
        updateLayout({
          slots: remainingSlots,
          characterCount: remainingSlots.length
        });
      }
    } else {
      // 若未关联，优先填充第一个未绑定的空槽位
      const emptySlot = activeLayout.slots.find(s => !s.modelId);
      if (emptySlot) {
        handleUpdateSlot(emptySlot.id, {
          modelId: model.id,
          modelName: model.nameZh || model.name
        });
      } else {
        // 无空槽位时，追加新槽位绑定该角色
        const newSlot: HumanSlotAssignment = {
          id: `slot-user-${model.id}-${Date.now().toString(36)}`,
          modelId: model.id,
          modelName: model.nameZh || model.name,
          positionDesc: '客厅功能单椅或休闲软座',
          actionDesc: '自然落座，松弛与居室环境交互'
        };
        const nextSlots = [...activeLayout.slots, newSlot];
        updateLayout({
          slots: nextSlots,
          characterCount: nextSlots.length
        });
      }
    }
  };

  // 角色资产自动联动：当有导入的角色资产且槽位未绑定时，按顺序优先一一对应绑定
  useEffect(() => {
    if (availableModels && availableModels.length > 0) {
      const needsBinding = activeLayout.slots.some(
        (s) => !s.modelId || !availableModels.some(m => m.id === s.modelId)
      );
      if (needsBinding) {
        const nextSlots = activeLayout.slots.map((s, idx) => {
          const matched = s.modelId ? availableModels.find(m => m.id === s.modelId) : null;
          if (matched) return s;
          const assigned = availableModels[idx % availableModels.length];
          return {
            ...s,
            modelId: assigned.id,
            modelName: assigned.nameZh || assigned.name
          };
        });
        updateLayout({ slots: nextSlots });
      }
    }
  }, [availableModels]);

  const handleUpdateCompute = (updates: Partial<RenderComputeConfig>) => {
    if (onChangeComputeConfig) {
      onChangeComputeConfig(updates);
    }
    if (updates.aspectRatio) {
      onChangeAspectRatio(updates.aspectRatio);
    }
  };

  // 切换 4人 / 6人 / 自定义阵容模式（并自动精确绑定已有角色资产）
  const handleSwitchLayoutMode = (mode: '4' | '6' | 'custom' | 'imported') => {
    if (mode === 'imported') {
      handleAlignAllImportedModels();
      return;
    }

    const bindSlots = (baseSlots: HumanSlotAssignment[]) => {
      if (!availableModels || availableModels.length === 0) return baseSlots;
      return baseSlots.map((s, idx) => {
        const m = availableModels[idx] || availableModels[idx % availableModels.length];
        return {
          ...s,
          modelId: m ? m.id : undefined,
          modelName: m ? (m.nameZh || m.name) : undefined
        };
      });
    };

    if (mode === '4') {
      updateLayout({
        mode: '4',
        characterCount: 4,
        slots: bindSlots(DEFAULT_4_HUMAN_SLOTS)
      });
    } else if (mode === '6') {
      updateLayout({
        mode: '6',
        characterCount: 6,
        slots: bindSlots(DEFAULT_6_HUMAN_SLOTS)
      });
    } else {
      const curSlots = activeLayout.slots.length > 0 ? activeLayout.slots : DEFAULT_4_HUMAN_SLOTS;
      updateLayout({
        mode: 'custom',
        characterCount: curSlots.length,
        slots: bindSlots(curSlots)
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
      style={{
        width: isCollapsed ? 0 : width,
        minWidth: isCollapsed ? 0 : undefined
      }}
      className={`border-l flex flex-col h-full select-none z-30 shrink-0 transition-[width,background-color] duration-200 overflow-hidden ${
        isLight ? 'bg-[#FAF8F5] border-stone-200 text-stone-800' : 'bg-[#12141c] border-stone-800 text-stone-200'
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
            <span className={`font-bold text-xs ${isLight ? 'text-stone-900' : 'text-white'}`}>AI 摄影导演工作台</span>
            <span className="text-[9px] text-amber-500 ml-1.5 font-mono">人居编排 v3.0</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
            isLight ? 'bg-amber-100/90 text-amber-900 border-amber-300' : 'bg-black/40 text-amber-400 border-amber-500/20'
          }`}>
            0{activeShotIndex + 1} / 0{totalShots} 镜 ({activeShot.templateCode})
          </span>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className={`p-1 rounded transition cursor-pointer ${
                isLight ? 'text-stone-400 hover:text-stone-800 hover:bg-stone-200' : 'text-neutral-400 hover:text-white hover:bg-white/10'
              }`}
              title="收起右侧导演工作台"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
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

          {/* ═════════════════════════════════════════════════════════════
              生图计算模型选项 (支持 Gemini + GPT Image 2 快捷切换)
          ═════════════════════════════════════════════════════════════ */}
          <div className={`p-2.5 rounded-xl border space-y-2 transition-all ${
            isLight ? 'bg-white border-stone-200/90 shadow-2xs' : 'bg-[#161822] border-white/10'
          }`}>
            <div className="flex items-center justify-between text-[11px]">
              <span className={`font-semibold flex items-center gap-1.5 ${isLight ? 'text-stone-800' : 'text-neutral-300'}`}>
                <Cpu className={`w-3.5 h-3.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
                <span>生图模型选项</span>
              </span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono border ${
                isLight ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
              }`}>
                {cfg.model.includes('gpt') ? 'OpenAI GPT Image 2' : 'Google Gemini 3.1'}
              </span>
            </div>

            {/* Gemini / GPT Image 2 双核心切换 Tabs */}
            <div className={`grid grid-cols-2 gap-1.5 p-1 rounded-lg border ${
              isLight ? 'bg-stone-100 border-stone-200' : 'bg-black/40 border-white/5'
            }`}>
              <button
                type="button"
                onClick={() => onChangeComputeConfig?.({ model: 'gemini-3.1-flash-image-preview' })}
                className={`py-1.5 px-2 rounded-md text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  !cfg.model.includes('gpt')
                    ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                    : isLight ? 'text-stone-600 hover:text-stone-900 hover:bg-white' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                <span>Gemini</span>
                <span className="text-[9px] px-1 py-0.2 rounded bg-black/10 font-mono font-normal">3.1</span>
              </button>

              <button
                type="button"
                onClick={() => onChangeComputeConfig?.({ model: 'gpt-image-2' })}
                className={`py-1.5 px-2 rounded-md text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  cfg.model.includes('gpt')
                    ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                    : isLight ? 'text-stone-600 hover:text-stone-900 hover:bg-white' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Cpu className="w-3 h-3" />
                <span>GPT Image 2</span>
                <span className="text-[9px] px-1 py-0.2 rounded bg-black/10 font-mono font-normal">v2</span>
              </button>
            </div>

            {/* 细分子模型与引擎参数下拉 */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className={`text-[10px] shrink-0 ${isLight ? 'text-stone-500' : 'text-neutral-400'}`}>模型微调核心:</span>
              <select
                value={cfg.model}
                onChange={(e) => onChangeComputeConfig?.({ model: e.target.value })}
                className={`flex-1 border rounded px-2 py-1 text-[10px] focus:border-amber-400 outline-none font-mono ${
                  isLight ? 'bg-stone-50 border-stone-200 text-stone-900' : 'bg-black/50 border-white/10 text-amber-300'
                }`}
              >
                <optgroup label="Google Gemini 家族" className={isLight ? 'bg-white text-stone-800' : 'bg-[#161822] text-neutral-200'}>
                  <option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash Image (推荐 · 极速高精)</option>
                  <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image (超低延迟)</option>
                  <option value="gemini-3-pro-image-preview">Gemini 3 Pro Image (复杂光影)</option>
                </optgroup>
                <optgroup label="OpenAI GPT Image 2 家族" className={isLight ? 'bg-white text-stone-800' : 'bg-[#161822] text-neutral-200'}>
                  <option value="gpt-image-2">GPT Image 2 (电影级写实 · 材质保护)</option>
                  <option value="gpt-image-2-c">GPT Image 2-c (高一致性母版)</option>
                  <option value="gpt-image-2-all">GPT Image 2-all (全能写实增强)</option>
                </optgroup>
              </select>
            </div>
          </div>

          {/* Quick Render Base Shot Header Button */}
          <div className="space-y-1.5">
            <button
              onClick={onGenerateCurrentShot}
              disabled={isGeneratingCurrent || isGeneratingAll || isGeneratingHuman}
              className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 border font-bold rounded-xl transition cursor-pointer disabled:opacity-50 ${
                isLight
                  ? 'bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent hover:bg-amber-500/20 border-amber-400/50 text-amber-900 shadow-2xs'
                  : 'bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent hover:bg-amber-500/25 border-amber-500/30 text-amber-300'
              }`}
            >
              {isGeneratingCurrent ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" />
              ) : (
                <Camera className="w-3.5 h-3.5 text-amber-500" />
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
          <div className={`p-3 rounded-xl border space-y-2 transition-all ${
            isLight
              ? 'bg-white border-stone-200/90 shadow-2xs hover:border-amber-400/60'
              : 'bg-[#161822] border-white/10 hover:border-amber-500/40'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-semibold flex items-center gap-1.5 ${isLight ? 'text-stone-800' : 'text-neutral-300'}`}>
                <Layers className={`w-3.5 h-3.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
                <span>1. 空间风格 (Scene Style)</span>
              </span>
              <button
                onClick={() => setIsStyleModalOpen(true)}
                className={`text-[10px] flex items-center gap-0.5 cursor-pointer font-medium ${
                  isLight ? 'text-amber-700 hover:text-amber-900' : 'text-amber-400 hover:text-amber-300'
                }`}
              >
                <span>图库切换</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {activeAssets?.style ? (
              <div
                onClick={() => setIsStyleModalOpen(true)}
                className={`group flex gap-2.5 p-2 rounded-lg border cursor-pointer transition-all ${
                  isLight
                    ? 'bg-stone-50 border-stone-200/80 hover:border-amber-400'
                    : 'bg-black/40 border-white/5 hover:border-amber-500/30'
                }`}
              >
                <div className={`w-14 h-14 rounded-lg overflow-hidden shrink-0 relative ${isLight ? 'bg-stone-200' : 'bg-black/60'}`}>
                  <img
                    src={activeAssets.style.thumbnail}
                    alt={activeAssets.style.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className={`text-xs font-bold transition-colors truncate ${
                    isLight ? 'text-stone-900 group-hover:text-amber-700' : 'text-white group-hover:text-amber-400'
                  }`}>
                    {activeAssets.style.name}
                  </div>
                  <div className={`text-[10px] flex items-center gap-1 mt-0.5 ${isLight ? 'text-stone-500' : 'text-neutral-400'}`}>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-medium ${
                      isLight ? 'bg-amber-100 text-amber-800' : 'bg-amber-500/10 text-amber-300'
                    }`}>
                      {activeAssets.style.category}
                    </span>
                    <span className="truncate">{activeAssets.style.lightingTone}</span>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsStyleModalOpen(true)}
                className={`w-full py-2.5 border border-dashed rounded-lg flex items-center justify-center gap-1.5 cursor-pointer text-xs ${
                  isLight
                    ? 'border-stone-300 text-stone-600 hover:text-stone-900 bg-stone-50 hover:bg-stone-100'
                    : 'border-white/15 text-neutral-400 hover:text-white bg-black/20'
                }`}
              >
                <Plus className="w-3.5 h-3.5 text-amber-500" />
                <span>选择空间风格资产</span>
              </button>
            )}
          </div>

          {/* ═════════════════════════════════════════════════════════════
              SECTION 2: Model DNA (角色资产 / AI 识别)
          ═════════════════════════════════════════════════════════════ */}
          <div className={`p-3 rounded-xl border space-y-2 transition-all ${
            isLight
              ? 'bg-white border-stone-200/90 shadow-2xs hover:border-purple-300'
              : 'bg-[#161822] border-white/10 hover:border-purple-500/40'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-semibold flex items-center gap-1.5 ${isLight ? 'text-stone-800' : 'text-neutral-300'}`}>
                <User className={`w-3.5 h-3.5 ${isLight ? 'text-purple-600' : 'text-purple-400'}`} />
                <span>2. 角色资产 (Model DNA)</span>
              </span>
              <button
                onClick={() => setIsModelModalOpen(true)}
                className={`text-[10px] flex items-center gap-0.5 cursor-pointer font-medium ${
                  isLight ? 'text-purple-700 hover:text-purple-900' : 'text-purple-400 hover:text-purple-300'
                }`}
              >
                <span>导入角色 / AI识别</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {availableModels.length > 0 ? (
              <div className="space-y-1.5">
                <div className={`flex items-center justify-between text-[10px] ${isLight ? 'text-stone-500' : 'text-neutral-400'}`}>
                  <div className="flex items-center gap-1.5">
                    <span>已导入 {availableModels.length} 个角色资产</span>
                    <button
                      onClick={handleAlignAllImportedModels}
                      className={`text-[9px] px-2 py-0.5 rounded font-semibold flex items-center gap-1 transition cursor-pointer ${
                        isLight
                          ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                          : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                      }`}
                      title="一键将已导入的全部人物 1:1 关联到编排器各个槽位"
                    >
                      <Link2 className="w-2.5 h-2.5" />
                      <span>一键对齐编排</span>
                    </button>
                  </div>
                  <button
                    onClick={() => setIsModelModalOpen(true)}
                    className={`hover:underline text-[9px] ${isLight ? 'text-purple-700' : 'text-purple-400'}`}
                  >
                    管理角色
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
                  {availableModels.map(m => {
                    const assignedSlots = getModelAssignedSlots(m.id);
                    const isAssigned = assignedSlots.length > 0;
                    return (
                      <div
                        key={m.id}
                        onClick={() => handleToggleModelInLayout(m)}
                        title={isAssigned ? `点击移出编排（当前位于槽位 ${assignedSlots.map(a => a.index).join(', ')}）` : '点击快速加入编排槽位'}
                        className={`group relative flex items-center gap-2 p-1.5 rounded-lg border cursor-pointer transition-all ${
                          isAssigned
                            ? isLight
                              ? 'bg-amber-50/70 border-amber-400/90 shadow-2xs ring-1 ring-amber-400/30'
                              : 'bg-amber-500/10 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
                            : isLight
                              ? 'bg-stone-50 border-stone-200/80 hover:border-purple-300'
                              : 'bg-black/40 border-white/5 hover:border-purple-500/30'
                        }`}
                      >
                        <div className={`relative w-8 h-8 rounded-full overflow-hidden shrink-0 ${isLight ? 'bg-stone-200' : 'bg-black/60'}`}>
                          <img src={m.thumbnail || m.coverImage} alt={m.nameZh || m.name} className="w-full h-full object-cover" />
                          {isAssigned && (
                            <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center">
                              <span className="text-[8px] font-black font-mono text-amber-950 dark:text-amber-200 bg-amber-400 px-1 rounded-full leading-none py-0.5">
                                {assignedSlots.map(a => a.index).join(',')}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <div className={`text-[11px] font-bold truncate ${isLight ? 'text-stone-900' : 'text-white'}`}>{m.nameZh || m.name}</div>
                            {isAssigned ? (
                              <span className="text-[8px] font-mono px-1 py-0.2 rounded font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                                槽位{assignedSlots.map(a => a.index).join(',')}
                              </span>
                            ) : (
                              <span className="text-[8px] px-1 py-0.2 rounded text-neutral-400 border border-white/5 shrink-0 opacity-60 group-hover:opacity-100">
                                未编排
                              </span>
                            )}
                          </div>
                          <div className={`text-[9px] truncate ${isLight ? 'text-purple-700' : 'text-purple-400'}`}>{m.ageGroup || '成熟知性'}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className={`text-[10px] leading-relaxed ${isLight ? 'text-stone-500' : 'text-neutral-400'}`}>
                  系统已清除默认固定家庭角色。请通过【导入角色资产 / AI识别】上传人物卡、多视角图或服装图，自动提取 Model DNA。
                </p>
                <button
                  onClick={() => setIsModelModalOpen(true)}
                  className={`w-full py-2.5 border border-dashed rounded-xl flex items-center justify-center gap-1.5 transition-all font-medium text-xs cursor-pointer ${
                    isLight
                      ? 'border-purple-300 hover:border-purple-500 bg-purple-50/70 hover:bg-purple-100/80 text-purple-900'
                      : 'border-purple-500/30 hover:border-purple-500/60 bg-purple-500/5 hover:bg-purple-500/10 text-purple-300/90 hover:text-purple-200'
                  }`}
                >
                  <UserPlus className={`w-3.5 h-3.5 ${isLight ? 'text-purple-700' : 'text-purple-400'}`} />
                  <span>上传人物资产卡 / AI 识别 Model DNA</span>
                </button>
              </div>
            )}
          </div>

          {/* ═════════════════════════════════════════════════════════════
              SECTION 3: Human Layout (人物编排器 - 允许折叠)
          ═════════════════════════════════════════════════════════════ */}
          <div className={`p-3 rounded-xl border space-y-2.5 transition-all ${
            isLight
              ? 'bg-gradient-to-br from-amber-50/70 via-stone-50/30 to-white border-amber-300/60 shadow-2xs'
              : 'bg-gradient-to-br from-[#1b1928] to-[#151722] border-amber-500/30 shadow-lg'
          }`}>
            <div
              onClick={() => setIsHumanLayoutCollapsed(!isHumanLayoutCollapsed)}
              className="flex items-center justify-between cursor-pointer select-none hover:opacity-90 transition-opacity"
            >
              <span className={`text-[11px] font-bold flex items-center gap-1.5 ${isLight ? 'text-amber-900' : 'text-amber-300'}`}>
                <Users className={`w-3.5 h-3.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
                <span>3. 人物编排器 (Human Layout)</span>
              </span>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold border ${
                  isLight ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}>
                  {activeLayout.characterCount} 人阵容
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isLight ? 'text-amber-700' : 'text-amber-400'
                  } ${isHumanLayoutCollapsed ? '-rotate-90' : ''}`}
                />
              </div>
            </div>

            {!isHumanLayoutCollapsed ? (
              <div className="space-y-2.5 animate-in fade-in duration-150">
                {/* Mode Switcher: 支持全员对齐 / 4人 / 6人 / 自定义 */}
                <div className={`grid grid-cols-4 gap-1 p-0.5 rounded-lg border text-[10px] ${
                  isLight ? 'bg-stone-100 border-stone-200' : 'bg-black/50 border-white/10'
                }`}>
                  <button
                    onClick={() => handleSwitchLayoutMode('imported')}
                    className={`py-1 rounded font-medium transition ${
                      activeLayout.slots.length === availableModels.length && availableModels.length > 0
                        ? 'bg-amber-500 text-black font-bold shadow'
                        : isLight ? 'text-stone-600 hover:text-stone-900' : 'text-neutral-400 hover:text-white'
                    }`}
                    title="槽位数与导入角色数完全 1:1 精确对应"
                  >
                    对齐({availableModels.length}人)
                  </button>
                  <button
                    onClick={() => handleSwitchLayoutMode('4')}
                    className={`py-1 rounded font-medium transition ${
                      activeLayout.mode === '4' && activeLayout.slots.length === 4
                        ? 'bg-amber-500 text-black font-bold shadow'
                        : isLight ? 'text-stone-600 hover:text-stone-900' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    4 人阵容
                  </button>
                  <button
                    onClick={() => handleSwitchLayoutMode('6')}
                    className={`py-1 rounded font-medium transition ${
                      activeLayout.mode === '6' && activeLayout.slots.length === 6
                        ? 'bg-amber-500 text-black font-bold shadow'
                        : isLight ? 'text-stone-600 hover:text-stone-900' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    6 人阵容
                  </button>
                  <button
                    onClick={() => handleSwitchLayoutMode('custom')}
                    className={`py-1 rounded font-medium transition ${
                      activeLayout.mode === 'custom'
                        ? 'bg-amber-500 text-black font-bold shadow'
                        : isLight ? 'text-stone-600 hover:text-stone-900' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    自定义
                  </button>
                </div>

                {/* 数量与对象对应状态栏 */}
                {(() => {
                  const uniqueAssignedCount = new Set(activeLayout.slots.map(s => s.modelId).filter(Boolean)).size;
                  const hasUnassigned = activeLayout.slots.some(s => !s.modelId);
                  const isCountMismatched = activeLayout.slots.length !== availableModels.length;

                  if (hasUnassigned) {
                    return (
                      <div className={`p-1.5 rounded-lg border text-[10px] flex items-center justify-between gap-1.5 ${
                        isLight ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      }`}>
                        <div className="flex items-center gap-1 min-w-0">
                          <AlertTriangle className="w-3 h-3 shrink-0 text-amber-500" />
                          <span className="truncate">存在未关联人物的槽位</span>
                        </div>
                        <button
                          onClick={handleAlignAllImportedModels}
                          className="shrink-0 underline hover:opacity-80 font-bold"
                        >
                          一键对齐导入角色
                        </button>
                      </div>
                    );
                  }

                  if (isCountMismatched) {
                    return (
                      <div className={`p-1.5 rounded-lg border text-[10px] flex items-center justify-between gap-1.5 ${
                        isLight ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                      }`}>
                        <span className="truncate">
                          编排 {activeLayout.slots.length} 人 · 导入资产 {availableModels.length} 人
                        </span>
                        <button
                          onClick={handleAlignAllImportedModels}
                          className="shrink-0 underline hover:opacity-80 font-bold"
                        >
                          同步为 {availableModels.length} 人
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div className={`p-1.5 rounded-lg border text-[10px] flex items-center gap-1.5 ${
                      isLight ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    }`}>
                      <Check className="w-3 h-3 text-emerald-500" />
                      <span>编排人数 ({activeLayout.slots.length}人) 与已导入角色 100% 精确对应</span>
                    </div>
                  );
                })()}

                {/* Slots List */}
                <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                  {activeLayout.slots.map((slot, idx) => {
                    const boundModel = availableModels.find(m => m.id === slot.modelId);
                    return (
                      <div
                        key={slot.id}
                        className={`p-2 rounded-lg border space-y-1.5 transition-all text-[11px] ${
                          !boundModel
                            ? isLight
                              ? 'bg-rose-50/30 border-rose-300/80'
                              : 'bg-rose-500/5 border-rose-500/30'
                            : isLight
                              ? 'bg-white border-stone-200/90 shadow-2xs hover:border-amber-300'
                              : 'bg-black/40 border-white/5 hover:border-amber-500/20'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <span className={`w-4 h-4 rounded-full text-[9px] font-mono font-bold flex items-center justify-center shrink-0 ${
                              isLight ? 'bg-amber-100 text-amber-900' : 'bg-amber-500/20 text-amber-400'
                            }`}>
                              {idx + 1}
                            </span>

                            {/* Bound Model Thumbnail */}
                            {boundModel ? (
                              <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 border border-amber-500/50">
                                <img
                                  src={boundModel.thumbnail || boundModel.coverImage}
                                  alt={boundModel.nameZh || boundModel.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full border border-dashed border-rose-400/60 flex items-center justify-center shrink-0">
                                <User className="w-2.5 h-2.5 text-rose-400" />
                              </div>
                            )}

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
                              className={`border rounded px-1.5 py-0.5 text-[10px] focus:border-amber-400 outline-none flex-1 truncate ${
                                !slot.modelId
                                  ? isLight ? 'bg-rose-50 border-rose-300 text-rose-800 font-semibold' : 'bg-rose-500/10 border-rose-500/30 text-rose-300 font-semibold'
                                  : isLight ? 'bg-stone-50 border-stone-200 text-stone-900' : 'bg-[#1e202e] border-white/15 text-white'
                              }`}
                            >
                              <option value="">-- 请选择关联人物 --</option>
                              {availableModels.map(m => (
                                <option key={m.id} value={m.id}>
                                  {m.nameZh || m.name} ({m.ageGroup || m.roleType || '已导入角色'})
                                </option>
                              ))}
                            </select>
                          </div>

                          {activeLayout.mode === 'custom' && activeLayout.slots.length > 1 && (
                            <button
                              onClick={() => handleRemoveSlot(slot.id)}
                              className="text-neutral-400 hover:text-rose-500 transition shrink-0"
                              title="删除该角色位"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {/* Position Input */}
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] shrink-0 ${isLight ? 'text-stone-500' : 'text-neutral-400'}`}>位置:</span>
                          <input
                            type="text"
                            value={slot.positionDesc}
                            onChange={(e) => handleUpdateSlot(slot.id, { positionDesc: e.target.value })}
                            placeholder="例如：主沙发一号电动功能位"
                            className={`flex-1 border rounded px-1.5 py-0.5 text-[10px] focus:border-amber-400 outline-none truncate ${
                              isLight ? 'bg-stone-50 border-stone-200 text-stone-900' : 'bg-black/50 border-white/10 text-white'
                            }`}
                          />
                        </div>

                        {/* Action Input */}
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] shrink-0 ${isLight ? 'text-stone-500' : 'text-neutral-400'}`}>动作:</span>
                          <input
                            type="text"
                            value={slot.actionDesc}
                            onChange={(e) => handleUpdateSlot(slot.id, { actionDesc: e.target.value })}
                            placeholder="例如：展开脚托半躺，手持画册与家人交谈"
                            className={`flex-1 border rounded px-1.5 py-0.5 text-[10px] focus:border-amber-400 outline-none truncate ${
                              isLight ? 'bg-stone-50 border-stone-200 text-stone-900' : 'bg-black/50 border-white/10 text-white'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Custom Mode: Add Slot Button */}
                {activeLayout.mode === 'custom' && (
                  <button
                    onClick={handleAddSlot}
                    className={`w-full py-1.5 border border-dashed rounded-lg text-[10px] flex items-center justify-center gap-1 transition cursor-pointer ${
                      isLight
                        ? 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900'
                        : 'border-amber-500/30 hover:border-amber-500/50 bg-amber-500/5 text-amber-300/80 hover:text-amber-200'
                    }`}
                  >
                    <Plus className="w-3 h-3" />
                    <span>添加角色位</span>
                  </button>
                )}

                {/* Disallow Extra Characters Checkbox */}
                <div
                  onClick={() => updateLayout({ disallowExtraCharacters: !activeLayout.disallowExtraCharacters })}
                  className={`flex items-center gap-2 p-1.5 rounded-lg border cursor-pointer text-[10px] ${
                    isLight
                      ? 'bg-stone-50 border-stone-200 hover:border-stone-300 text-stone-700'
                      : 'bg-black/30 border-white/5 hover:border-white/15 text-neutral-300'
                  }`}
                >
                  {activeLayout.disallowExtraCharacters ? (
                    <CheckSquare className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  )}
                  <span className="select-none">禁止新增额外人物 (严格锁定人数，杜绝杂乱路人)</span>
                </div>
              </div>
            ) : (
              <div
                onClick={() => setIsHumanLayoutCollapsed(false)}
                className={`p-1.5 rounded-lg border text-[10px] font-mono text-center cursor-pointer transition ${
                  isLight
                    ? 'bg-white border-amber-200 text-stone-600 hover:border-amber-400'
                    : 'bg-black/40 border-white/5 text-neutral-400 hover:border-amber-500/30'
                }`}
              >
                当前模式: {activeLayout.mode === '4' ? '4人阵容' : activeLayout.mode === '6' ? '6人阵容' : '自定义阵容'} · 已配置 {activeLayout.slots.length} 个角色位 (已折叠，点击展开)
              </div>
            )}
          </div>

          {/* ═════════════════════════════════════════════════════════════
              SECTION 4: 添加模特 (基于当前镜头生成人物版)
          ═════════════════════════════════════════════════════════════ */}
          <div className={`p-3 rounded-xl border-2 space-y-2.5 transition-all ${
            isLight
              ? 'bg-gradient-to-br from-purple-50/80 via-white to-amber-50/40 border-purple-300/80 shadow-xs'
              : 'bg-gradient-to-br from-[#241b35] via-[#1a1c29] to-[#141620] border-purple-500/40 shadow-xl'
          }`}>
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-1.5 font-bold text-xs ${isLight ? 'text-purple-950' : 'text-purple-300'}`}>
                <Sparkle className={`w-3.5 h-3.5 ${isLight ? 'text-purple-700' : 'text-purple-400'}`} />
                <span>4. 基于当前镜头生成人物版</span>
              </div>
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                isLight ? 'bg-purple-100 text-purple-900 border-purple-200' : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
              }`}>
                每次 4 候选
              </span>
            </div>

            {/* Lock Invariants Badges */}
            <div className="grid grid-cols-3 gap-1 text-[9px] font-mono text-center">
              <div className={`border p-1 rounded flex items-center justify-center gap-1 ${
                isLight ? 'bg-white border-emerald-300 text-emerald-800 shadow-2xs' : 'bg-black/40 border-emerald-500/30 text-emerald-300'
              }`}>
                <Lock className="w-2.5 h-2.5" /> 锁空间
              </div>
              <div className={`border p-1 rounded flex items-center justify-center gap-1 ${
                isLight ? 'bg-white border-emerald-300 text-emerald-800 shadow-2xs' : 'bg-black/40 border-emerald-500/30 text-emerald-300'
              }`}>
                <Lock className="w-2.5 h-2.5" /> 锁产品
              </div>
              <div className={`border p-1 rounded flex items-center justify-center gap-1 ${
                isLight ? 'bg-white border-emerald-300 text-emerald-800 shadow-2xs' : 'bg-black/40 border-emerald-500/30 text-emerald-300'
              }`}>
                <Lock className="w-2.5 h-2.5" /> 锁家具
              </div>
              <div className={`border p-1 rounded flex items-center justify-center gap-1 ${
                isLight ? 'bg-white border-emerald-300 text-emerald-800 shadow-2xs' : 'bg-black/40 border-emerald-500/30 text-emerald-300'
              }`}>
                <Lock className="w-2.5 h-2.5" /> 锁风格
              </div>
              <div className={`border p-1 rounded flex items-center justify-center gap-1 ${
                isLight ? 'bg-white border-emerald-300 text-emerald-800 shadow-2xs' : 'bg-black/40 border-emerald-500/30 text-emerald-300'
              }`}>
                <Lock className="w-2.5 h-2.5" /> 锁 Camera
              </div>
              <div className={`border p-1 rounded flex items-center justify-center gap-1 font-bold ${
                isLight ? 'bg-purple-100 border-purple-300 text-purple-900' : 'bg-purple-500/20 border-purple-500/40 text-purple-300'
              }`}>
                <Plus className="w-2.5 h-2.5" /> 只增人物
              </div>
            </div>

            {/* Core Action Button - 高对比度视觉设计，杜绝浅色模式白底白字隐形 */}
            <button
              onClick={onRenderHumanPass}
              disabled={isGeneratingHuman || isGeneratingCurrent || isGeneratingAll}
              className={`relative overflow-hidden w-full flex items-center justify-center gap-2 py-3 px-4 font-extrabold rounded-xl shadow-lg transition-all active:scale-98 cursor-pointer ${
                isGeneratingHuman
                  ? isLight
                    ? 'bg-purple-900 hover:bg-purple-950 text-white shadow-purple-900/30 ring-2 ring-purple-400'
                    : 'bg-[#2b1842] border border-purple-400/50 text-amber-200 shadow-purple-900/50 ring-1 ring-purple-500/40'
                  : isLight
                  ? 'bg-gradient-to-r from-purple-800 via-indigo-700 to-amber-600 hover:from-purple-900 hover:to-amber-700 text-white shadow-purple-900/20'
                  : 'bg-gradient-to-r from-purple-600 via-purple-500 to-amber-500 hover:from-purple-500 hover:to-amber-400 text-white shadow-purple-600/30'
              } disabled:cursor-not-allowed`}
            >
              {isGeneratingHuman ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-300 shrink-0" />
                  <span className="text-xs tracking-wider text-white font-bold">
                    正在为 {activeShot.templateCode} 生成 4 张人物版候选... ({generationProgress}%)
                  </span>
                </>
              ) : (
                <>
                  <Users className="w-4 h-4 text-white stroke-[2.5] shrink-0" />
                  <span className="text-xs tracking-wider text-white font-bold">
                    基于当前镜头添加模特 ({activeShot.templateCode})
                  </span>
                </>
              )}
            </button>

            {/* 正在生成时的动态多阶段状态提示指示器 */}
            {isGeneratingHuman && (
              <div className={`p-3 rounded-xl border text-xs space-y-2.5 animate-in fade-in zoom-in-95 duration-200 ${
                isLight 
                  ? 'bg-purple-100/90 border-purple-300 text-purple-950 shadow-sm' 
                  : 'bg-purple-950/60 border-purple-500/40 text-purple-200 shadow-lg'
              }`}>
                {/* 顶部标题与百分比 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-purple-900 dark:text-purple-200">
                    <Sparkle className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                    <span>AI 人物版候选生成中</span>
                  </div>
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-purple-500/25 text-purple-900 dark:text-amber-300 font-extrabold border border-purple-500/30">
                    进度 {generationProgress}%
                  </span>
                </div>

                {/* 动态流光平滑进度条 */}
                <div className="w-full bg-black/15 dark:bg-black/50 h-2 rounded-full overflow-hidden p-0.5 border border-purple-400/20">
                  <div 
                    className="bg-gradient-to-r from-purple-600 via-indigo-500 to-amber-500 h-full rounded-full transition-all duration-500 ease-out shadow-xs" 
                    style={{ width: `${generationProgress}%` }} 
                  />
                </div>

                {/* 阶段性步骤说明文案 */}
                <div className="space-y-1.5 pt-0.5">
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-purple-950 dark:text-white">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                    <span>
                      {generationPhase === 1 && '第 1 阶段：严格锁死空间硬装与沙发骨架物理真值'}
                      {generationPhase === 2 && '第 2 阶段：编排模特五官 DNA 与人体工程座包接触面'}
                      {generationPhase === 3 && '第 3 阶段：空间多通道渲染器并发输出 4 组人物方案'}
                    </span>
                  </div>

                  <p className="text-[10px] leading-relaxed text-purple-900/80 dark:text-purple-300/80 pl-4">
                    {generationPhase === 1 && '保持户型建筑与已审定产品绝对零形变，仅保留模特图层留白...'}
                    {generationPhase === 2 && '锁定所选家庭角色面部特征与着装，精确适配沙发功能位就座姿态...'}
                    {generationPhase === 3 && '生成天然通透漫射光、温暖侧光、柔焦生活意境及黄金金字塔 4 套方案...'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ═════════════════════════════════════════════════════════════
              SECTION 5: Lighting (光线氛围 - 默认折叠保持版面整洁)
          ═════════════════════════════════════════════════════════════ */}
          <div className={`p-3 rounded-xl border space-y-2 transition-all ${
            isLight ? 'bg-white border-stone-200/90 shadow-2xs' : 'bg-[#161822] border-white/10'
          }`}>
            <div
              onClick={() => setIsLightingCollapsed(!isLightingCollapsed)}
              className="flex items-center justify-between cursor-pointer select-none hover:opacity-90 transition-opacity"
            >
              <span className={`text-[11px] font-semibold flex items-center gap-1.5 ${isLight ? 'text-stone-800' : 'text-neutral-300'}`}>
                <SunMedium className={`w-3.5 h-3.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
                <span>5. 光线氛围 (Lighting)</span>
              </span>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border truncate max-w-[120px] ${
                  isLight ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}>
                  {activeAssets?.lighting || '天然通透漫射光'}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isLight ? 'text-stone-500' : 'text-neutral-400'
                  } ${isLightingCollapsed ? '-rotate-90' : ''}`}
                />
              </div>
            </div>

            {!isLightingCollapsed ? (
              <div className="grid grid-cols-1 gap-1.5 animate-in fade-in duration-150 pt-1">
                {LIGHTING_OPTIONS.map(opt => {
                  const isSelected = (activeAssets?.lighting || '天然通透漫射光') === opt.label;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => onUpdateActiveAssets?.({ lighting: opt.label })}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-left transition-all ${
                        isLight
                          ? isSelected
                            ? 'bg-amber-50 border-amber-400 text-stone-900 shadow-2xs font-semibold'
                            : 'bg-stone-50 border-stone-200/70 text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                          : isSelected
                          ? 'bg-amber-500/15 border-amber-500/50 text-white'
                          : 'bg-black/30 border-white/5 text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      <span className="text-xs font-medium">{opt.label}</span>
                      <span className={`text-[9px] scale-95 ${isLight ? 'text-stone-400' : 'text-neutral-500'}`}>{opt.desc.slice(0, 10)}...</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div
                onClick={() => setIsLightingCollapsed(false)}
                className={`p-1.5 rounded-lg border text-[10px] font-mono text-center cursor-pointer transition ${
                  isLight
                    ? 'bg-stone-50 border-stone-200 text-stone-600 hover:border-amber-400'
                    : 'bg-black/30 border-white/5 text-neutral-400 hover:border-amber-500/30'
                }`}
              >
                当前布光: {activeAssets?.lighting || '天然通透漫射光'} (已折叠，点击展开)
              </div>
            )}
          </div>

          {/* Current Shot Info & Collapsible Camera / Advanced Controls */}
          <div className={`pt-2 border-t space-y-2 ${isLight ? 'border-stone-200' : 'border-white/10'}`}>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`flex items-center justify-between w-full py-1.5 transition-all cursor-pointer text-[11px] ${
                isLight ? 'text-stone-600 hover:text-stone-900' : 'text-neutral-400 hover:text-white'
              }`}
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
              <div className={`space-y-3 p-3 rounded-xl border animate-in fade-in duration-150 ${
                isLight ? 'bg-white border-stone-200 shadow-2xs text-stone-800' : 'bg-black/40 border-white/10 text-neutral-200'
              }`}>
                {/* 1. 机位参数 */}
                <div className="space-y-2 text-[10px]">
                  <div className={`flex items-center justify-between ${isLight ? 'text-stone-500' : 'text-neutral-400'}`}>
                    <span>焦距: {activeShot.camera.lensMm}mm</span>
                    <span>高度: {activeShot.camera.heightCm}cm</span>
                    <span>偏角: {activeShot.camera.yawDeg}°</span>
                  </div>
                  <div>
                    <div className={`flex justify-between mb-1 ${isLight ? 'text-stone-500' : 'text-neutral-400'}`}>
                      <span>机位高度</span>
                      <span className={`font-mono font-bold ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>{activeShot.camera.heightCm}cm</span>
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
                  <span className={`text-[10px] ${isLight ? 'text-stone-500' : 'text-neutral-400'}`}>渲染画幅</span>
                  <div className="grid grid-cols-4 gap-1">
                    {['4:3', '16:9', '1:1', '3:4'].map(r => (
                      <button
                        key={r}
                        onClick={() => handleUpdateCompute({ aspectRatio: r as ImageAspectRatio })}
                        className={`py-1 rounded text-[10px] font-mono transition ${
                          aspectRatio === r
                            ? 'bg-amber-500 text-black font-bold'
                            : isLight ? 'bg-stone-100 text-stone-700 hover:bg-stone-200' : 'bg-black/30 text-neutral-400 hover:text-white'
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
          <div className={`p-2.5 rounded-xl border space-y-1 transition-all ${
            isLight ? 'bg-emerald-50/80 border-emerald-200 text-stone-700' : 'bg-emerald-500/5 border-emerald-500/20 text-neutral-300'
          }`}>
            <div className={`flex items-center gap-1.5 font-bold text-[10px] ${isLight ? 'text-emerald-800' : 'text-emerald-400'}`}>
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>敏华物理真值护航 · 零家具漂移</span>
            </div>
            <p className={`text-[9px] leading-tight ${isLight ? 'text-stone-500' : 'text-neutral-400'}`}>
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
        onApplyAndLockMaster={(style) => {
          onUpdateActiveAssets?.({ style });
          setIsStyleModalOpen(false);
          onApplyStyleAndGenerateMaster?.(style);
        }}
      />

      <ModelAssetModal
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
        selectedModelId={activeAssets?.model?.id}
        onSelectModel={(model) => {
          onUpdateActiveAssets?.({ model });
          if (model) {
            const nextSlots = activeLayout.slots.map((s, idx) =>
              idx === 0
                ? { ...s, modelId: model.id, modelName: model.nameZh || model.name }
                : s
            );
            updateLayout({ slots: nextSlots });
          }
        }}
      />
    </div>
  );
};
