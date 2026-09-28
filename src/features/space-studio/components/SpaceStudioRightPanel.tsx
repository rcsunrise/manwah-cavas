// src/features/space-studio/components/SpaceStudioRightPanel.tsx
import React, { useState } from 'react';
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
  FileCode,
  Ratio,
  Cpu,
  Settings2,
  SlidersHorizontal,
  User,
  Activity,
  SunMedium,
  Image as ImageIcon,
  ChevronRight,
  Plus,
  LayoutTemplate
} from 'lucide-react';
import {
  ShotInstance,
  SceneMaster,
  ImageAspectRatio,
  IMAGE_ASPECT_SPECS,
  CameraDNA,
  RenderComputeConfig,
} from '../../../types/spaceStudio';
import { ActivePhotographyAssets, SceneStyleAsset, ModelAsset, PoseAsset, FamilySceneTemplate } from '../../../types/spaceAssetLibrary';
import { SceneStyleGalleryModal } from './assets/SceneStyleGalleryModal';
import { ModelAssetModal } from './assets/ModelAssetModal';
import { PoseAssetGalleryModal } from './assets/PoseAssetGalleryModal';
import { FamilyTemplateGalleryModal } from './assets/FamilyTemplateGalleryModal';

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

  onOptimizeLightingAndPrompt: () => void;
  onUpdateCamera: (shotId: string, updates: Partial<CameraDNA>) => void;

  // New Asset Library integration props
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
  const [isPoseModalOpen, setIsPoseModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

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

  const ratioList = [
    'Auto', 'Custom', '1:1', '3:2', '4:3', '3:4',
    '16:9', '9:16', '21:9', '2:3', '4:5', '5:4'
  ];

  return (
    <div
      className={`w-88 border-l flex flex-col h-full select-none z-30 shrink-0 transition-colors ${
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
            <span className="text-[9px] text-neutral-400 ml-1.5 font-mono">V2.0 视觉驱动</span>
          </div>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 text-amber-400 border border-amber-500/20">
          0{activeShotIndex + 1} / 0{totalShots} 镜
        </span>
      </div>

      {/* 2. Scrollable Body: Visual Asset Directing Controls */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 text-xs">
        <motion.div
          key={activeShot.id}
          initial={{ opacity: 0.9, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="space-y-3"
        >

          {/* Core Action: 生成 4 张候选 */}
          <div className="space-y-1.5">
            <button
              onClick={onGenerateCurrentShot}
              disabled={isGeneratingCurrent || isGeneratingAll}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:from-amber-400 hover:to-amber-600 disabled:opacity-50 text-black font-extrabold rounded-xl shadow-lg shadow-amber-500/25 transition active:scale-98 cursor-pointer"
            >
              {isGeneratingCurrent ? (
                <RefreshCw className="w-4 h-4 animate-spin text-black" />
              ) : (
                <Sparkles className="w-4 h-4 text-black stroke-[2.5]" />
              )}
              <span className="text-xs tracking-wider">
                {isGeneratingCurrent ? '正在生成 4 张候选图...' : '生成 4 张候选'}
              </span>
            </button>

            <button
              onClick={onGenerateAllShots}
              disabled={isGeneratingCurrent || isGeneratingAll}
              className="w-full py-1.5 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-neutral-200 border border-white/5 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all"
            >
              {isGeneratingAll ? (
                <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
              ) : (
                <Layers className="w-3 h-3 text-neutral-400" />
              )}
              <span>一键渲染全部镜头 (A00-A08)</span>
            </button>
          </div>

          {/* Section 0: 人物场景模板库 (Human Scene Template Library) */}
          <div className="p-3 rounded-xl bg-gradient-to-br from-[#1b1928] to-[#151722] border border-amber-500/30 space-y-2 hover:border-amber-500/60 transition-all shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                <LayoutTemplate className="w-3.5 h-3.5 text-amber-400" />
                <span>人物场景模板 (Template Library)</span>
              </span>
              <button
                onClick={() => setIsTemplateModalOpen(true)}
                className="text-[10px] text-amber-400 hover:text-amber-300 font-medium flex items-center gap-0.5"
              >
                <span>{activeAssets?.selectedTemplate ? '更换模板' : '选择模板'}</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {activeAssets?.selectedTemplate ? (
              <div
                onClick={() => setIsTemplateModalOpen(true)}
                className="group flex flex-col gap-2 p-2.5 rounded-xl bg-black/50 border border-amber-500/30 hover:border-amber-500/60 cursor-pointer transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                    {activeAssets.selectedTemplate.templateName}
                  </div>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                    {activeAssets.selectedTemplate.characterCount} 人阵容
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 h-16 rounded-lg overflow-hidden bg-black/60 border border-white/5">
                  <div className="relative">
                    <img src={activeAssets.selectedTemplate.window1SceneRef.imageUrl} alt="win1" className="w-full h-full object-cover" />
                    <span className="absolute bottom-0.5 left-1 text-[8px] text-amber-300 bg-black/70 px-1 rounded font-bold">窗口1 场景</span>
                  </div>
                  <div className="relative">
                    <img src={activeAssets.selectedTemplate.window2WireframeRef.imageUrl} alt="win2" className="w-full h-full object-cover" />
                    <span className="absolute bottom-0.5 left-1 text-[8px] text-cyan-300 bg-black/70 px-1 rounded font-bold">窗口2 线稿</span>
                  </div>
                </div>

                <div className="text-[10px] text-neutral-400 flex items-center justify-between mt-0.5">
                  <span className="truncate">{activeAssets.selectedTemplate.spaceType}</span>
                  <span className="text-amber-400/80 font-mono text-[9px]">双窗口位置锁定</span>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsTemplateModalOpen(true)}
                className="w-full py-2.5 border border-dashed border-amber-500/30 hover:border-amber-500/60 rounded-xl text-amber-300/90 hover:text-amber-200 flex items-center justify-center gap-1.5 bg-amber-500/5 hover:bg-amber-500/10 transition-all font-medium text-xs"
              >
                <LayoutTemplate className="w-3.5 h-3.5 text-amber-400" />
                <span>选择 4人/6人/三代同堂场景模板</span>
              </button>
            )}
          </div>

          {/* Section 1: 空间风格 (Scene Style Asset) */}
          <div className="p-3 rounded-xl bg-[#161822] border border-white/10 space-y-2 hover:border-amber-500/40 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>空间风格 (Scene Style)</span>
              </span>
              <button
                onClick={() => setIsStyleModalOpen(true)}
                className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-0.5"
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
                className="w-full py-3 border border-dashed border-white/15 rounded-lg text-neutral-400 hover:text-white flex items-center justify-center gap-1.5 bg-black/20"
              >
                <Plus className="w-3.5 h-3.5 text-amber-400" />
                <span>选择空间风格资产</span>
              </button>
            )}
          </div>

          {/* Section 2: 模特资产 (Model Asset - 固定家庭角色) */}
          <div className="p-3 rounded-xl bg-[#161822] border border-white/10 space-y-2 hover:border-purple-500/40 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-purple-400" />
                <span>固定家庭角色 (Model DNA)</span>
              </span>
              <button
                onClick={() => setIsModelModalOpen(true)}
                className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-0.5"
              >
                <span>{activeAssets?.model ? '更换角色' : '选择角色'}</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {activeAssets?.model ? (
              <div
                onClick={() => setIsModelModalOpen(true)}
                className="group flex gap-2.5 p-2 rounded-lg bg-black/40 border border-white/5 hover:border-purple-500/30 cursor-pointer transition-all"
              >
                <div className="w-12 h-14 rounded-lg overflow-hidden shrink-0 relative bg-black/60">
                  <img
                    src={activeAssets.model.thumbnail}
                    alt={activeAssets.model.nameZh || activeAssets.model.name}
                    className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform"
                  />
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors truncate">
                      {activeAssets.model.nameZh || activeAssets.model.name}
                    </span>
                    <span className="text-[9px] font-mono text-purple-400 font-medium">
                      {activeAssets.model.code}
                    </span>
                  </div>
                  <div className="text-[10px] text-neutral-400 truncate mt-0.5">
                    {activeAssets.model.ageGroup} · {activeAssets.model.height}
                  </div>
                  <div className="text-[9px] text-purple-300 truncate">
                    定位: {activeAssets.model.positioning || activeAssets.model.modelDna.outfitStyle}
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsModelModalOpen(true)}
                className="w-full py-2.5 border border-dashed border-white/15 rounded-lg text-neutral-400 hover:text-white flex items-center justify-center gap-1.5 bg-black/20"
              >
                <User className="w-3.5 h-3.5 text-purple-400" />
                <span>未指定模特 (纯静物空间)</span>
              </button>
            )}
          </div>

          {/* Section 3: 姿态资产 (Pose Asset) */}
          <div className="p-3 rounded-xl bg-[#161822] border border-white/10 space-y-2 hover:border-emerald-500/40 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>人物姿态 (Pose DNA)</span>
              </span>
              <button
                onClick={() => setIsPoseModalOpen(true)}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5"
              >
                <span>{activeAssets?.pose ? '更换姿态' : '选择姿态'}</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {activeAssets?.pose ? (
              <div
                onClick={() => setIsPoseModalOpen(true)}
                className="group flex gap-2.5 p-2 rounded-lg bg-black/40 border border-white/5 hover:border-emerald-500/30 cursor-pointer transition-all"
              >
                <div className="w-14 h-12 rounded-lg overflow-hidden shrink-0 relative bg-black/60">
                  <img
                    src={activeAssets.pose.thumbnail}
                    alt={activeAssets.pose.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors truncate">
                    {activeAssets.pose.name}
                  </div>
                  <div className="text-[10px] text-neutral-400 truncate mt-0.5">
                    {activeAssets.pose.poseDna.seatingContact}
                  </div>
                  <div className="text-[9px] text-emerald-300 truncate">
                    规则: {activeAssets.pose.poseDna.occlusionRules}
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsPoseModalOpen(true)}
                className="w-full py-2.5 border border-dashed border-white/15 rounded-lg text-neutral-400 hover:text-white flex items-center justify-center gap-1.5 bg-black/20"
              >
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>无指定姿态</span>
              </button>
            )}
          </div>

          {/* Section 4: 光线氛围 (Lighting & Atmosphere) */}
          <div className="p-3 rounded-xl bg-[#161822] border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
                <SunMedium className="w-3.5 h-3.5 text-amber-400" />
                <span>光线氛围 (Lighting)</span>
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

          {/* Section 5: 当前镜头 (Current Shot Info) */}
          <div className="p-3 rounded-xl bg-[#161822] border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-amber-400" />
                <span>当前镜头: {activeShot.name}</span>
              </span>
              <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                {activeShot.templateCode || `A0${activeShotIndex}`}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed bg-black/30 p-2 rounded-lg">
              {activeShot.intent?.description || '拍摄主视角，呈现沙发在完整客厅空间中的视觉比例与采光通透度。'}
            </p>
            <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono text-neutral-400">
              <div className="bg-black/30 p-1 rounded text-center">焦距: {activeShot.camera.lensMm}mm</div>
              <div className="bg-black/30 p-1 rounded text-center">高度: {activeShot.camera.heightCm}cm</div>
              <div className="bg-black/30 p-1 rounded text-center">偏角: {activeShot.camera.yawDeg}°</div>
            </div>
          </div>

          {/* Section 6: AI 润色与真值一致性 */}
          <button
            onClick={onOptimizeLightingAndPrompt}
            className="w-full flex items-center justify-between p-2.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-transparent hover:from-amber-500/20 border border-amber-500/20 text-neutral-200 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <div className="text-left">
                <div className="text-xs font-semibold text-amber-300">AI 摄影导演润色</div>
                <div className="text-[10px] text-neutral-400">基于空间几何融合风格与模特</div>
              </div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-amber-400" />
          </button>

          {/* Section 7: 高级设置 (Collapsible Advanced Settings) */}
          <div className="pt-1 border-t border-white/10">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full py-2 text-neutral-400 hover:text-white transition-all cursor-pointer"
            >
              <span className="font-semibold text-[11px] flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-neutral-400" />
                <span>高级设置 (模型·Prompt·分辨率·机位)</span>
              </span>
              {showAdvanced ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {showAdvanced && (
              <div className="mt-2 space-y-3 p-3 rounded-xl bg-black/40 border border-white/10 animate-in fade-in duration-150">
                {/* 1. 渲染引擎 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-300">
                    <span>算力与画质模型</span>
                    <span className="text-[10px] font-mono text-amber-400">{cfg.model.split('/').pop()}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'gemini-3.1-flash-image', label: 'v3.1 Flash', icon: '⚡' },
                      { id: 'google/gemini-3-pro-image', label: 'v3.0 Pro', icon: '✨' },
                      { id: 'openai/gpt-image-2', label: 'GPT img-2', icon: '🌌' },
                    ].map(m => (
                      <button
                        key={m.id}
                        onClick={() => handleUpdateCompute({ model: m.id })}
                        className={`p-1.5 rounded-lg text-center border transition-all text-xs ${
                          cfg.model === m.id
                            ? 'bg-amber-500 text-black font-bold border-amber-400'
                            : 'bg-black/30 border-white/10 text-neutral-400 hover:text-white'
                        }`}
                      >
                        <div>{m.icon}</div>
                        <div className="text-[10px]">{m.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. 渲染精度 */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-neutral-300 block">渲染精度</label>
                  <div className="flex gap-2">
                    {(['1K', '2K', '4K'] as const).map(r => (
                      <button
                        key={r}
                        onClick={() => handleUpdateCompute({ resolution: r })}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          cfg.resolution === r
                            ? 'bg-amber-500 text-black border-amber-400'
                            : 'bg-black/30 border-white/10 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. 画幅比例 */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-neutral-300 block">画幅比例</label>
                  <div className="grid grid-cols-4 gap-1">
                    {ratioList.map(r => (
                      <button
                        key={r}
                        onClick={() => handleUpdateCompute({ aspectRatio: r })}
                        className={`py-1 rounded text-center font-mono text-xs border ${
                          cfg.aspectRatio === r
                            ? 'bg-amber-500 text-black font-bold border-amber-400'
                            : 'bg-black/30 border-white/10 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Seed */}
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-neutral-400 w-12 shrink-0">Seed</label>
                  <input
                    type="number"
                    placeholder="随机 (Random)"
                    value={cfg.seed === undefined ? '' : cfg.seed}
                    onChange={e => handleUpdateCompute({ seed: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                    className="flex-1 py-1 px-2 text-xs bg-black/50 border border-white/10 rounded-lg text-white"
                  />
                </div>

                {/* 5. Prompt 编辑 */}
                {onChangeCustomPrompt && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-neutral-300 block">实时生图 Prompt</label>
                    <textarea
                      rows={3}
                      value={customPrompt}
                      onChange={e => onChangeCustomPrompt(e.target.value)}
                      placeholder="Prompt 将由空间风格、模特DNA、姿态DNA和家具真值自动融合..."
                      className="w-full p-2 text-[11px] font-mono bg-black/60 border border-white/10 rounded-lg text-neutral-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}

                {/* 6. Negative Prompt */}
                {onChangeNegativePrompt && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-neutral-400 block">Negative Prompt (负向约束)</label>
                    <input
                      type="text"
                      value={negativePrompt}
                      onChange={e => onChangeNegativePrompt(e.target.value)}
                      className="w-full p-1.5 text-[10px] font-mono bg-black/60 border border-white/10 rounded-lg text-neutral-300"
                    />
                  </div>
                )}

                {/* 7. 机位参数微调 */}
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-neutral-400">镜头焦距</span>
                    <span className="font-mono text-amber-400 font-bold">{activeShot.camera.lensMm}mm</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[24, 35, 50, 85].map(mm => (
                      <button
                        key={mm}
                        onClick={() => onUpdateCamera(activeShot.id, { lensMm: mm })}
                        className={`py-1 rounded text-center text-xs font-mono border ${
                          activeShot.camera.lensMm === mm
                            ? 'bg-amber-500 text-black font-bold border-amber-400'
                            : 'bg-black/30 border-white/10 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {mm}mm
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-neutral-400">机位高度</span>
                      <span className="font-mono text-amber-400 font-bold">{activeShot.camera.heightCm}cm</span>
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
              </div>
            )}
          </div>

          {/* Product Guarantee */}
          <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-neutral-300 space-y-1">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[10px]">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>敏华物理真值引擎 (Physical Truth v3.0) 护航</span>
            </div>
            <p className="text-[9px] text-neutral-400 leading-tight">
              工业级毫米尺寸保真、皮质肌理与缝线锁死、独立模特面容防形变。
            </p>
          </div>

        </motion.div>
      </div>

      {/* Asset Modals */}
      <FamilyTemplateGalleryModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        selectedTemplateId={activeAssets?.selectedTemplate?.templateId}
        onApplyTemplate={(template, compiled) => {
          onUpdateActiveAssets?.({ selectedTemplate: template });
          onChangeCustomPrompt?.(compiled.positivePrompt);
          onChangeNegativePrompt?.(compiled.negativePrompt);
        }}
      />

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

      <PoseAssetGalleryModal
        isOpen={isPoseModalOpen}
        onClose={() => setIsPoseModalOpen(false)}
        selectedPoseId={activeAssets?.pose?.id}
        onSelectPose={(pose) => onUpdateActiveAssets?.({ pose })}
      />
    </div>
  );
};
