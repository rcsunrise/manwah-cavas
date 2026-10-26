import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Sparkles,
  Users,
  RefreshCw,
  Image as ImageIcon,
  FileText,
  Check,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Upload,
  ArrowRight,
  ShieldCheck,
  User,
  Compass,
  Cpu,
  Video,
  Layers
} from 'lucide-react';
import { ModelAsset, HumanSlotAssignment, HumanLayoutConfig } from '../../../types/spaceAssetLibrary';
import {
  SpaceHumanChoreographyClientService,
  CHOREOGRAPHY_PRESET_SCENARIOS,
  ChoreographedLayoutResult,
  ChoreographedSlotItem
} from '../../../services/spaceHumanChoreographyService';
import {
  STUDIO_CHOREOGRAPHY_TEMPLATES,
  StudioChoreographyTemplate,
  getRecommendedStudioTemplate,
  mapStudioSlotsToAssignments
} from '../data/choreographyPresets';

export const CHOREOGRAPHY_MODELS = [
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    badge: '默认推荐 · 极速推理',
    tag: '⚡ 默认',
    description: '思考链视觉自校准，生活意图与空间座次高敏锐度推导'
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    badge: '空间感知进阶',
    tag: '🚀 空间感知',
    description: '增强型微观空间层次拆解与多人物互动动线推导'
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 4 (Argon) / 3.1 Pro',
    badge: '空间几何旗舰',
    tag: '💎 空间切片',
    description: '原生空间视觉接地 (Visual Grounding)，复杂大平层座次高保真规划'
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    badge: '秒级轻量备用',
    tag: '⏱️ 秒级响应',
    description: '经典秒级轻量多模态模型，高可用稳定输出'
  }
];

interface AiHumanChoreographerModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableModels: ModelAsset[];
  currentShotImageUrl?: string;
  sceneMasterImageUrl?: string;
  currentShotCode?: string; // 当前镜头代码，例如 A01~A08
  onApplyLayout: (newSlots: HumanSlotAssignment[], mode: '4' | '6' | 'custom') => void;
}

export const AiHumanChoreographerModal: React.FC<AiHumanChoreographerModalProps> = ({
  isOpen,
  onClose,
  availableModels,
  currentShotImageUrl,
  sceneMasterImageUrl,
  currentShotCode,
  onApplyLayout
}) => {
  // 输入方式: prompt | vision
  const [inputMode, setInputMode] = useState<'prompt' | 'vision'>('prompt');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.7-flash');
  const [prompt, setPrompt] = useState<string>(
    '三代同堂周末家庭日，爷爷在主沙发一号电动位展开脚托半躺小憩，奶奶在单人真皮单椅品茗，男女主人并坐交谈，小女儿依偎在身旁翻画册，小男孩在地毯上拼装积木。'
  );
  const [targetCount, setTargetCount] = useState<number | 'auto'>('auto');

  // 图像选择
  const [selectedImageSource, setSelectedImageSource] = useState<'current_shot' | 'scene_master' | 'upload'>('current_shot');
  const [uploadedImageBase64, setUploadedImageBase64] = useState<string>('');
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string>('');

  // 生成状态与结果
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<ChoreographedLayoutResult | null>(null);

  // 本地编辑的 slots（支持生成后用户再次手动微调）
  const [editableSlots, setEditableSlots] = useState<ChoreographedSlotItem[]>([]);

  if (!isOpen) return null;

  // 获取当前选中的分析图
  const getActiveImageUrl = () => {
    if (selectedImageSource === 'current_shot') return currentShotImageUrl || '';
    if (selectedImageSource === 'scene_master') return sceneMasterImageUrl || '';
    return uploadedImagePreview;
  };

  // 处理上传本地图片
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setUploadedImageBase64(b64);
      setUploadedImagePreview(b64);
      setSelectedImageSource('upload');
    };
    reader.readAsDataURL(file);
  };

  // 快捷套用预设场景
  const handleApplyPreset = (preset: typeof CHOREOGRAPHY_PRESET_SCENARIOS[0]) => {
    setPrompt(preset.prompt);
    setTargetCount(preset.count);
  };

  // 一键直接套用影棚标准姿态模板（跳过等待，即刻绑定角色与工学姿态）
  const handleApplyStudioTemplateDirectly = (tpl: StudioChoreographyTemplate) => {
    const formatted = mapStudioSlotsToAssignments(tpl, availableModels);
    onApplyLayout(formatted, tpl.mode);
    onClose();
  };

  // 触发 AI 智能构思
  const handleRunChoreography = async () => {
    setIsGenerating(true);
    setErrorMsg(null);

    try {
      const activeImg = getActiveImageUrl();
      const res = await SpaceHumanChoreographyClientService.choreographLayout({
        prompt: prompt.trim(),
        imageBase64: selectedImageSource === 'upload' ? uploadedImageBase64 : undefined,
        imageUrl: selectedImageSource !== 'upload' ? activeImg : undefined,
        characterCount: typeof targetCount === 'number' ? targetCount : undefined,
        model: selectedModel,
        availableModels
      });

      setResult(res);
      setEditableSlots(res.slots);
    } catch (err: any) {
      console.error('[AiHumanChoreographerModal] error:', err);
      setErrorMsg(err.message || 'AI 构思请求失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  // 用户在生成列表中修改某一槽位的人物绑定
  const handleSlotModelChange = (slotId: string, modelId: string) => {
    const found = availableModels.find(m => m.id === modelId);
    setEditableSlots(prev =>
      prev.map(s => {
        if (s.id !== slotId) return s;
        return {
          ...s,
          matchedModelId: modelId || undefined,
          matchedModelName: found ? (found.nameZh || found.name) : s.matchedModelName
        };
      })
    );
  };

  // 用户修改某一槽位的位置或动作描述
  const handleSlotFieldChange = (slotId: string, field: 'positionDesc' | 'actionDesc', val: string) => {
    setEditableSlots(prev =>
      prev.map(s => {
        if (s.id !== slotId) return s;
        return { ...s, [field]: val };
      })
    );
  };

  // 应用到人物编排器工作台
  const handleApplyToWorkspace = () => {
    if (editableSlots.length === 0) return;

    const formattedSlots: HumanSlotAssignment[] = editableSlots.map(s => ({
      id: s.id,
      modelId: s.matchedModelId,
      modelName: s.matchedModelName,
      positionDesc: s.positionDesc,
      actionDesc: s.actionDesc
    }));

    const count = formattedSlots.length;
    const mode = count === 4 ? '4' : count === 6 ? '6' : 'custom';

    onApplyLayout(formattedSlots, mode);
    onClose();
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 pb-16 animate-in fade-in duration-150">
      <div className="w-full max-w-4xl bg-[#171925] border border-white/15 rounded-2xl shadow-2xl flex flex-col max-h-[86vh] overflow-hidden text-neutral-200">
        
        {/* 1. Header (固顶) */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#1a1d2c]/95">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  AI 智能人物编排与动作构思
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                  Human Choreographer
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-neutral-400 border border-white/10">
                  资产库共 {availableModels.length} 位角色
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                结合空间多模态视觉识别与情景提示词，自动构想生动生活动作、精准空间座次并匹配角色库
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all cursor-pointer"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. Body (滚动区) */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5 text-xs overscroll-contain">
          
          {/* 模式选择器与识别/编排模型切换器 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="p-1 rounded-xl bg-black/40 border border-white/10 flex items-center gap-1 w-fit">
              <button
                type="button"
                onClick={() => setInputMode('prompt')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold text-xs transition-all cursor-pointer ${
                  inputMode === 'prompt'
                    ? 'bg-amber-500 text-black shadow-xs font-bold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>提示词情景构思</span>
              </button>
              <button
                type="button"
                onClick={() => setInputMode('vision')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold text-xs transition-all cursor-pointer ${
                  inputMode === 'vision'
                    ? 'bg-amber-500 text-black shadow-xs font-bold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>空间图像识别 + 构思</span>
              </button>
            </div>

            {/* AI 识别与编排模型选择 */}
            <div className="flex items-center gap-2 bg-[#12141e] border border-white/10 px-3 py-1.5 rounded-xl">
              <Cpu className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[11px] text-neutral-400 shrink-0">构思模型:</span>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-[#1a1d2c] border border-white/15 focus:border-amber-400 rounded-lg px-2 py-0.5 text-[11px] text-amber-300 font-medium outline-none cursor-pointer"
              >
                {CHOREOGRAPHY_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.tag})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 图像多模态视觉选择区 (当处于 vision 模式时) */}
          {inputMode === 'vision' && (
            <div className="p-4 rounded-xl bg-[#131520] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                  <Compass className="w-3.5 h-3.5 text-amber-400" />
                  <span>选择待识别的空间沙发环境</span>
                </span>
                <span className="text-[10px] text-neutral-400">
                  AI 将扫描空间家具结构、动线与可用功能座次
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {/* 选项 1: 当前机位 */}
                <div
                  onClick={() => setSelectedImageSource('current_shot')}
                  className={`p-2.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col items-center gap-2 ${
                    selectedImageSource === 'current_shot'
                      ? 'bg-amber-500/10 border-amber-400 text-white shadow-md'
                      : 'bg-[#181a26] border-white/10 hover:border-white/20 text-neutral-300'
                  }`}
                >
                  <div className="w-full aspect-video rounded-lg overflow-hidden bg-black/40 border border-white/10 flex items-center justify-center">
                    {currentShotImageUrl ? (
                      <img src={currentShotImageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-neutral-500">当前镜头尚未渲染</span>
                    )}
                  </div>
                  <span className="text-[11px] font-bold">当前机位画面</span>
                </div>

                {/* 选项 2: 空间母版 */}
                <div
                  onClick={() => setSelectedImageSource('scene_master')}
                  className={`p-2.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col items-center gap-2 ${
                    selectedImageSource === 'scene_master'
                      ? 'bg-amber-500/10 border-amber-400 text-white shadow-md'
                      : 'bg-[#181a26] border-white/10 hover:border-white/20 text-neutral-300'
                  }`}
                >
                  <div className="w-full aspect-video rounded-lg overflow-hidden bg-black/40 border border-white/10 flex items-center justify-center">
                    {sceneMasterImageUrl ? (
                      <img src={sceneMasterImageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-neutral-500">空间母版未就绪</span>
                    )}
                  </div>
                  <span className="text-[11px] font-bold">A00 空间母版</span>
                </div>

                {/* 选项 3: 本地上传 */}
                <label
                  className={`p-2.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col items-center gap-2 group ${
                    selectedImageSource === 'upload'
                      ? 'bg-amber-500/10 border-amber-400 text-white shadow-md'
                      : 'bg-[#181a26] border-white/10 hover:border-white/20 text-neutral-300'
                  }`}
                >
                  <div className="w-full aspect-video rounded-lg overflow-hidden bg-black/40 border border-white/10 flex flex-col items-center justify-center group-hover:border-amber-400/50">
                    {uploadedImagePreview ? (
                      <img src={uploadedImagePreview} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <Upload className="w-4 h-4 text-amber-400 mb-1 group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] text-neutral-400">上传参考图</span>
                      </>
                    )}
                  </div>
                  <span className="text-[11px] font-bold">本地实景效果图</span>
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            </div>
          )}

          {/* 构思意图与情景描述 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-neutral-200 font-bold flex items-center gap-1.5 text-xs">
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                <span>情景意图描述与编排要求</span>
                <span className="text-amber-400 font-bold">*</span>
              </label>
              <span className="text-[10px] text-neutral-400">支持自由描述家庭氛围、人物互动或动作细节</span>
            </div>

            <textarea
              rows={3}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="例如：一家人温馨度过周末，爷爷在展开脚托的头等舱功能位小憩，奶奶在单人椅品茶，年轻夫妻在主沙发交谈，孩子在地毯上互动..."
              className="w-full px-3.5 py-2.5 bg-[#12141d] border border-white/20 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 rounded-xl text-white placeholder-neutral-500 outline-none leading-relaxed text-[11px] transition-all shadow-inner"
            />

            {/* 影棚实拍 5 套核心姿态与动作模版 (商业对齐) */}
            <div className="space-y-2 pt-1 pb-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-amber-300 font-bold flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5 text-amber-400" />
                  <span>🎬 影棚实拍 5 套核心姿态模版 (对齐真实影棚机位与人体工学)</span>
                </span>
                {currentShotCode && (
                  <span className="text-[10px] text-neutral-400 font-mono">
                    当前镜头: <strong className="text-amber-400">{currentShotCode}</strong>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {STUDIO_CHOREOGRAPHY_TEMPLATES.map((tpl) => {
                  const isCurrentShotMatch = Boolean(currentShotCode && tpl.targetShotCode === currentShotCode);

                  return (
                    <div
                      key={tpl.id}
                      className={`p-2.5 rounded-xl border text-left transition-all relative ${
                        isCurrentShotMatch
                          ? 'bg-amber-500/15 border-amber-400/80 shadow-md ring-1 ring-amber-400/40'
                          : 'bg-[#181a26] border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-white text-[11px] truncate">{tpl.name}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                            {tpl.targetShotCode} 专拍
                          </span>
                        </div>
                        {isCurrentShotMatch && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-amber-500 text-black shadow-xs shrink-0 animate-pulse">
                            ★ 当前镜头推荐
                          </span>
                        )}
                      </div>

                      <p className="text-[10px] text-neutral-300 line-clamp-2 leading-relaxed mb-2">
                        {tpl.summary}
                      </p>

                      <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px]">
                        <span className="text-neutral-400 font-mono">
                          {tpl.count} 人编制 · {tpl.slots[0]?.positionDesc.split('(')[0].trim()}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setPrompt(tpl.fullPrompt);
                              setTargetCount(tpl.count);
                            }}
                            className="px-2 py-0.5 rounded text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 transition cursor-pointer"
                            title="将详细情景要求填入上方描述框"
                          >
                            填入提示词
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApplyStudioTemplateDirectly(tpl)}
                            className="px-2.5 py-0.5 rounded font-bold bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black shadow-xs transition active:scale-95 cursor-pointer flex items-center gap-1"
                            title="直接将此影棚动作编制应用至工作台"
                          >
                            <span>一键直接套用</span>
                            <ArrowRight className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 其他灵感场景模板 */}
            <div className="flex flex-wrap gap-1.5 items-center pt-1 border-t border-white/5">
              <span className="text-[10px] text-neutral-400 font-medium shrink-0">✨ 更多全案情境：</span>
              {CHOREOGRAPHY_PRESET_SCENARIOS.slice(5).map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className="text-[10px] px-2.5 py-1 rounded-full bg-[#202334] hover:bg-amber-500 hover:text-black text-neutral-200 border border-white/10 hover:border-amber-400 transition-all font-medium cursor-pointer shadow-xs active:scale-95 flex items-center gap-1"
                >
                  <span>{preset.title.split('·')[0].trim()}</span>
                  <span className="text-[9px] opacity-75">({preset.tag})</span>
                </button>
              ))}
            </div>
          </div>

          {/* 期望人数控制与触发生成 */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#131520] border border-white/10">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-neutral-300 text-xs">编排人数规划:</span>
              <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/10 text-[11px]">
                {(['auto', 2, 4, 6] as const).map(cnt => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setTargetCount(cnt)}
                    className={`px-3 py-1 rounded-md font-medium transition cursor-pointer ${
                      targetCount === cnt
                        ? 'bg-amber-500 text-black font-bold shadow-xs'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {cnt === 'auto' ? 'AI 智能推断' : `${cnt} 人`}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleRunChoreography}
              disabled={isGenerating || (!prompt.trim() && inputMode === 'prompt')}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer shadow-md ${
                isGenerating
                  ? 'bg-[#24283b] text-neutral-400 border border-white/10 cursor-not-allowed'
                  : 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black border border-amber-300 shadow-amber-500/25 active:scale-98'
              }`}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-black" />
                  <span>AI 正在多模态构思与编排...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-black" />
                  <span>立即执行 AI 动作构思与资产匹配</span>
                </>
              )}
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 3. 编排构思结果展示与资产匹配微调区 */}
          {result && (
            <div className="space-y-3.5 pt-2 border-t border-white/10 animate-in fade-in duration-200">
              {/* 主题摘要卡片 */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-amber-300 text-sm">{result.theme}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40">
                      推荐 {editableSlots.length} 人组合
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono">
                      {result.source === 'ai_vision' ? '视觉多模态分析' : result.source === 'ai_prompt' ? '意图理解构思' : '启发式精选引擎'} · {result.modelUsed || selectedModel}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-300 mt-1 leading-relaxed">
                    {result.spatialSummary}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    已完成角色库匹配
                  </span>
                </div>
              </div>

              {/* 槽位卡片列表 */}
              <div className="space-y-2.5">
                <span className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-amber-400" />
                  <span>各就座槽位动作与角色库对应 (支持即时微调)</span>
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {editableSlots.map((slot, idx) => {
                    const boundModel = availableModels.find(m => m.id === slot.matchedModelId);
                    return (
                      <div
                        key={slot.id}
                        className="p-3 rounded-xl bg-[#141622] border border-white/10 hover:border-amber-400/40 transition-all space-y-2 shadow-xs"
                      >
                        {/* 槽位头部与模特匹配 */}
                        <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            {/* 模特头像 */}
                            {boundModel?.thumbnail || boundModel?.coverImage ? (
                              <img
                                src={boundModel.thumbnail || boundModel.coverImage}
                                alt=""
                                className="w-6 h-6 rounded-full object-cover border border-amber-400/60 shrink-0"
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-white/5 border border-dashed border-white/20 flex items-center justify-center shrink-0">
                                <User className="w-3 h-3 text-neutral-400" />
                              </div>
                            )}

                            {/* 模特选择器 */}
                            <select
                              value={slot.matchedModelId || ''}
                              onChange={e => handleSlotModelChange(slot.id, e.target.value)}
                              className="bg-[#1b1e2c] border border-white/15 focus:border-amber-400 rounded-lg px-2 py-1 text-[11px] text-white outline-none flex-1 truncate font-medium cursor-pointer"
                            >
                              <option value="">-- 未关联角色 --</option>
                              {availableModels.map(m => (
                                <option key={m.id} value={m.id}>
                                  {m.nameZh || m.name} ({m.ageGroup || m.roleType || '已导入角色'})
                                </option>
                              ))}
                            </select>
                          </div>

                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                            {slot.targetRole}
                          </span>
                        </div>

                        {/* 空间位置编辑 */}
                        <div className="space-y-1">
                          <span className="text-[10px] text-neutral-400 font-semibold block">就座空间位置:</span>
                          <input
                            type="text"
                            value={slot.positionDesc}
                            onChange={e => handleSlotFieldChange(slot.id, 'positionDesc', e.target.value)}
                            className="w-full bg-[#1b1e2c] border border-white/10 focus:border-amber-400 rounded-lg px-2.5 py-1 text-[11px] text-neutral-200 outline-none"
                          />
                        </div>

                        {/* 动作与姿态描述编辑 */}
                        <div className="space-y-1">
                          <span className="text-[10px] text-neutral-400 font-semibold block">姿态动作与生活细节:</span>
                          <textarea
                            rows={2}
                            value={slot.actionDesc}
                            onChange={e => handleSlotFieldChange(slot.id, 'actionDesc', e.target.value)}
                            className="w-full bg-[#1b1e2c] border border-white/10 focus:border-amber-400 rounded-lg px-2.5 py-1 text-[11px] text-neutral-200 outline-none resize-none leading-relaxed"
                          />
                        </div>

                        {/* 匹配理由契合度 */}
                        {slot.matchReason && (
                          <div className="text-[9px] text-neutral-400 flex items-center gap-1 pt-1 border-t border-white/5">
                            <span className="text-amber-400">💡</span>
                            <span className="truncate">{slot.matchReason}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. Footer (固底常驻) */}
        <div className="shrink-0 px-6 py-3.5 bg-[#141620] border-t border-white/10 flex items-center justify-between">
          <div className="text-[11px] text-neutral-400 flex items-center gap-2">
            {result ? (
              <span className="text-amber-300 font-semibold">
                ✓ 已成功构思 {editableSlots.length} 位角色编排方案
              </span>
            ) : (
              <span>准备就绪 · 点击上方按钮开始构思</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold text-neutral-300 hover:text-white transition-all cursor-pointer"
            >
              取消
            </button>

            <button
              type="button"
              onClick={handleApplyToWorkspace}
              disabled={editableSlots.length === 0}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md ${
                editableSlots.length === 0
                  ? 'bg-[#24283b] text-neutral-500 border border-white/10 cursor-not-allowed shadow-none'
                  : 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black border border-amber-300 shadow-amber-500/25 active:scale-98'
              }`}
            >
              <Check className="w-4 h-4 text-black" />
              <span>一键应用编排方案到人物工作台</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
