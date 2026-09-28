import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Send,
  Upload,
  Bot,
  User,
  CheckCircle,
  Info,
  Loader2,
  AlertCircle,
  X,
  Dna,
  LayoutGrid,
  Film,
  RotateCw,
  RefreshCw,
  Sliders,
  ChevronRight,
  Image as ImageIcon,
  ThumbsUp,
  ThumbsDown,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  Play,
  Pause,
  ImagePlus,
  RotateCcw,
  Layers,
  ShieldAlert,
  Eye,
  Type,
  FileText,
  Plus,
  Save,
  Bookmark,
  Trash,
  FolderOpen,
  Globe,
  Search
} from 'lucide-react';
import { PosterTypographyOverlay } from './PosterTypographyOverlay';
import { AgentMessage, GenerationBatch, SceneQueueItem, AgentConversationRecord } from '../../types/creativeCanvas';
import { ProductVisualDNA, AgentRun } from '../../types';
import { CopyWorkspacePanel } from './CopyWorkspacePanel';
import { TypographyWorkspacePanel } from './TypographyWorkspacePanel';

interface AgentPanelProps {
  messages: AgentMessage[];
  uploadState: 'idle' | 'uploading' | 'analyzing' | 'completed' | 'error';
  errorMessage: string | null;
  activeDna: ProductVisualDNA | null;
  showFullDnaDrawer: boolean;
  setShowFullDnaDrawer: (show: boolean) => void;
  onUploadFile: (file: File) => void;
  onSendMessage: (text: string) => void;

  // C2 Props
  agentRun: AgentRun | null;
  isPlanGenerating: boolean;
  planError: string | null;
  selectedNodeId: string | null;
  selectedSceneIndex: number | null;
  onGenerateNineGridPlan: () => void;
  onReplanSingleScene: (screenIndex: number) => void;
  planAgentModel?: string;
  setPlanAgentModel?: (model: string) => void;
  planReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  setPlanReasoningEffort?: (effort: 'minimal' | 'low' | 'medium' | 'high') => void;
  planTargetAudience?: string;
  setPlanTargetAudience?: (audience: string) => void;
  planScreenCount?: number;
  setPlanScreenCount?: (count: number) => void;
  planAspectRatio?: string;
  setPlanAspectRatio?: (ratio: string) => void;
  styleRefImages?: string[];
  setStyleRefImages?: React.Dispatch<React.SetStateAction<string[]>>;
  refDocName?: string | null;
  setRefDocName?: React.Dispatch<React.SetStateAction<string | null>>;
  refDocText?: string | null;
  setRefDocText?: React.Dispatch<React.SetStateAction<string | null>>;
  planEnableSearch?: boolean;
  setPlanEnableSearch?: (val: boolean) => void;
  planSearchKeywords?: string;
  setPlanSearchKeywords?: (val: string) => void;
  marketSearchLoading?: boolean;
  marketSearchResult?: string | null;
  onSearchMarketReference?: (keywords?: string) => Promise<void>;
  onClearMarketSearchResult?: () => void;

  // C3A Props
  generatingScenes?: Set<number>;
  nodes?: any[];
  selectedModel?: string;
  setSelectedModel?: (m: string) => void;
  selectedResolution?: '1K' | '2K' | '4K';
  setSelectedResolution?: (r: '1K' | '2K' | '4K') => void;
  onGenerateSceneImage?: (screenIndex: number, reviewFeedback?: string, overrideModel?: string, overrideResolution?: '1K' | '2K' | '4K', withText?: boolean) => void;
  onOpenPosterStudio?: (screenIndex: number) => void;
  onPreviewGptImage?: () => void;
  onApproveSceneImage?: (screenIndex: number) => void;
  onRejectSceneImage?: (screenIndex: number, feedback: string) => void;

  // C3B Props
  batchState?: GenerationBatch | null;
  queueItems?: SceneQueueItem[];
  onTriggerBatchMissingModal?: () => void;
  onPauseBatch?: () => void;
  onResumeBatch?: () => void;
  onCancelBatch?: () => void;
  onRetryFailedBatch?: () => void;

  // C4B-1 & C4B-2 Props
  onSelectSceneIndex?: (sceneIndex: number) => void;
  onOpenAssetVersionsModal?: (sceneKey: string) => void;
  dnaCode?: string;
  productDnaVersionCode?: string;
  productDnaVersionId?: string;
  dnaVersions?: any[];
  onSelectDnaVersion?: (versionId: string) => void;
  projectId?: string;
  canvasId?: string;
  assetVersionId?: string;

  // G0-1 Agent Chat & Conversation Persistence Props
  currentConversation?: AgentConversationRecord | null;
  conversationsList?: AgentConversationRecord[];
  isStreaming?: boolean;
  streamError?: { code: string; message: string } | null;
  onStopGenerating?: () => void;
  onRetryMessage?: () => void;
  onCreateNewConversation?: () => void;
  onSelectConversation?: (convId: string) => void;
}

export interface EngineConfigSelectorProps {
  selectedModel: string;
  setSelectedModel: (m: string) => void;
  selectedResolution: '1K' | '2K' | '4K';
  setSelectedResolution: (r: '1K' | '2K' | '4K') => void;
  onPreviewGptImage?: () => void;
}

export const EngineConfigSelector: React.FC<EngineConfigSelectorProps> = ({
  selectedModel,
  setSelectedModel,
  selectedResolution,
  setSelectedResolution,
  onPreviewGptImage
}) => {
  const models = [
    {
      id: 'openai/gpt-image-2-c',
      icon: '🪐',
      title: 'GPT 增强',
      subtitle: 'image-2-c',
      activeColor: 'bg-[#B28C5A] text-white border-[#B28C5A] shadow-md'
    },
    {
      id: 'openai/gpt-image-2',
      icon: '🌌',
      title: 'GPT 标准',
      subtitle: 'image-2',
      activeColor: 'bg-[#2C2622] text-white border-[#2C2622] shadow-md'
    },
    {
      id: 'gemini-3.1-flash-image',
      icon: '⚡',
      title: 'Gemini 标准',
      subtitle: 'v3.1 Flash',
      activeColor: 'bg-[#B28C5A] text-white border-[#B28C5A] shadow-md'
    },
    {
      id: 'google/gemini-3-pro-image',
      icon: '✨',
      title: 'Gemini 旗舰',
      subtitle: 'v3.0 Pro',
      activeColor: 'bg-[#2C2622] text-white border-[#2C2622] shadow-md'
    },
    {
      id: 'openai/gpt-image-2-all',
      icon: '🧩',
      title: 'GPT 多图',
      subtitle: 'image-2-all',
      activeColor: 'bg-[#2C2622] text-white border-[#2C2622] shadow-md'
    }
  ];

  return (
    <div className="space-y-2.5 p-3 bg-[#FAF8F5] rounded-xl border border-[#E5E0D8]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[#2C2A29] flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-[#B28C5A]" />
          渲染引擎与精度档位
        </span>
        {selectedModel.includes('gpt-image') && onPreviewGptImage && (
          <button
            type="button"
            onClick={onPreviewGptImage}
            className="text-[10px] font-bold text-[#8C6F43] bg-[#B28C5A]/15 hover:bg-[#B28C5A]/25 px-2 py-0.5 rounded-lg border border-[#B28C5A]/40 flex items-center gap-1 transition-colors shadow-xs"
            title="预检并确认 gpt-image-2 参考原图与参数"
          >
            <Eye className="w-3 h-3 text-[#B28C5A]" />
            <span>原图预检</span>
          </button>
        )}
      </div>

      {/* Models Grid */}
      <div className="space-y-1">
        <div className="grid grid-cols-5 gap-1.5">
          {models.map(m => {
            const isSelected =
              selectedModel === m.id ||
              (m.id === 'gemini-3.1-flash-image' &&
                (selectedModel === 'gemini-3.1-flash-image' || selectedModel === 'gemini-3.1-flash-image-preview'));
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedModel(m.id)}
                className={`p-1.5 rounded-xl text-center border transition-all ${
                  isSelected
                    ? m.activeColor
                    : 'bg-white border-[#E5E0D8] text-stone-700 hover:border-[#B28C5A]'
                }`}
              >
                <div className="text-sm mb-0.5">{m.icon}</div>
                <div className="text-[10px] font-bold leading-tight">{m.title}</div>
                <div className="text-[8px] opacity-70 leading-tight">{m.subtitle}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Resolution */}
      <div className="space-y-1">
        <span className="text-[10px] text-stone-400 font-bold block">渲染精度 (Resolution)</span>
        <div className="flex gap-1.5">
          {(['1K', '2K', '4K'] as const).map(r => {
            const isV25 = selectedModel.includes('2.5');
            const isDisabled = isV25 && (r === '2K' || r === '4K');
            const isSelected = selectedResolution === r;

            return (
              <button
                key={r}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  setSelectedResolution(r);
                  if ((r === '2K' || r === '4K') && selectedModel.includes('2.5')) {
                    setSelectedModel('gemini-3.1-flash-image');
                  }
                }}
                className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                  isDisabled
                    ? 'bg-stone-50 border-stone-200 text-stone-300 cursor-not-allowed'
                    : isSelected
                    ? 'bg-[#B28C5A] text-white border-[#B28C5A] shadow-xs'
                    : 'bg-white border-[#E5E0D8] text-stone-600 hover:border-[#B28C5A]'
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const getCssAspectRatio = (ratioStr?: string): string => {
  if (!ratioStr || ratioStr === 'Auto' || ratioStr === 'Custom') return '3/4';
  const parts = String(ratioStr).split(':');
  if (parts.length === 2) {
    const w = parseFloat(parts[0]);
    const h = parseFloat(parts[1]);
    if (!isNaN(w) && !isNaN(h) && h > 0) {
      return `${w}/${h}`;
    }
  }
  return '3/4';
};

export const AgentPanel: React.FC<AgentPanelProps> = ({
  messages,
  uploadState,
  errorMessage,
  activeDna,
  showFullDnaDrawer,
  setShowFullDnaDrawer,
  onUploadFile,
  onSendMessage,
  agentRun,
  isPlanGenerating,
  planError,
  selectedNodeId,
  selectedSceneIndex,
  onGenerateNineGridPlan,
  onReplanSingleScene,
  planAgentModel = 'gemini-2.5-flash',
  setPlanAgentModel,
  planReasoningEffort = 'medium',
  setPlanReasoningEffort,
  planTargetAudience,
  setPlanTargetAudience,
  planScreenCount,
  setPlanScreenCount,
  planAspectRatio,
  setPlanAspectRatio,
  styleRefImages: propsStyleRefImages,
  setStyleRefImages: propsSetStyleRefImages,
  refDocName: propsRefDocName,
  setRefDocName: propsSetRefDocName,
  refDocText: propsRefDocText,
  setRefDocText: propsSetRefDocText,
  planEnableSearch = false,
  setPlanEnableSearch,
  planSearchKeywords = '',
  setPlanSearchKeywords,
  marketSearchLoading = false,
  marketSearchResult = null,
  onSearchMarketReference,
  onClearMarketSearchResult,
  generatingScenes,
  nodes = [],
  selectedModel,
  setSelectedModel,
  selectedResolution,
  setSelectedResolution,
  onGenerateSceneImage,
  onOpenPosterStudio,
  onPreviewGptImage,
  onApproveSceneImage,
  onRejectSceneImage,
  batchState,
  queueItems = [],
  onTriggerBatchMissingModal,
  onPauseBatch,
  onResumeBatch,
  onCancelBatch,
  onRetryFailedBatch,
  onSelectSceneIndex,
  onOpenAssetVersionsModal,
  dnaCode,
  productDnaVersionCode,
  productDnaVersionId,
  dnaVersions = [],
  onSelectDnaVersion,
  projectId,
  canvasId,
  assetVersionId,
  currentConversation,
  conversationsList = [],
  isStreaming = false,
  streamError,
  onStopGenerating,
  onRetryMessage,
  onCreateNewConversation,
  onSelectConversation
}) => {
  const [activeTab, setActiveTab] = useState<'setup' | 'render' | 'chat' | 'typography'>('setup');
  const [isPanelCollapsed, setIsPanelCollapsed] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [internalModel, setInternalModel] = useState<string>('gemini-3.1-flash-image');
  const [internalRes, setInternalRes] = useState<'1K' | '2K' | '4K'>('2K');

  const model = selectedModel || internalModel;
  const setModel = setSelectedModel || setInternalModel;
  const resolution = selectedResolution || internalRes;
  const setResolution = setSelectedResolution || setInternalRes;

  // Prompt Presets State & Handlers
  const DEFAULT_PRESETS = [
    {
      id: 'p1',
      name: '电影级高级空间与细节解析',
      text: '根据这款沙发制作创意海报，主图要有中文标题，设计灵感来源，色调，场景，排版。远景，场景高级，电影级，内容丰富有层次，空间感十足，中景或者远景，要求具备艺术感。颜色和谐，沙发上有两个款式相同带图案的抱枕，海报上需出现扶手设计，拉皱背靠，方形沙发脚的设计解析。'
    },
    {
      id: 'p2',
      name: '莫兰迪温润轻奢/适老化配饰',
      text: '莫兰迪低饱和温润光影，质感皮艺肌理，搭配柔和壁灯与低明度木饰面。突出适老化扶手支撑与拉皱靠背舒适包覆感。'
    },
    {
      id: 'p3',
      name: '极简悬浮解构/内部结构拆解',
      text: '现代极简展厅氛围，展示沙发脚与内部高回弹海绵，主图带科技感文字打标解析，电影级中景空间。'
    }
  ];

  const [savedPresets, setSavedPresets] = useState<Array<{ id: string; name: string; text: string }>>(() => {
    try {
      const raw = localStorage.getItem('mw_planner_presets');
      if (raw) return JSON.parse(raw);
    } catch {}
    return DEFAULT_PRESETS;
  });

  const [presetNameInput, setPresetNameInput] = useState('');
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);

  // Prompt Textarea Direct Control, Auto-Focus & Visual Feedback State
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [promptValue, setPromptValue] = useState<string>(planTargetAudience || '');
  const [isPromptHighlighted, setIsPromptHighlighted] = useState(false);
  const [promptToast, setPromptToast] = useState<string | null>(null);

  // Synchronize when prop changes from outside (e.g. workspace load or reset)
  useEffect(() => {
    if (planTargetAudience !== undefined) {
      setPromptValue(planTargetAudience);
    }
  }, [planTargetAudience]);

  // First-principles universal prompt updater: guaranteed immediate UI update, parent notification & visual confirmation
  const handleUpdatePrompt = useCallback((
    textToInsert: string,
    options?: {
      mode?: 'append' | 'replace';
      scrollIntoView?: boolean;
      feedback?: string;
    }
  ) => {
    if (textToInsert === undefined || textToInsert === null) return;
    const mode = options?.mode || 'append';
    const cleanInsert = textToInsert.trim();

    const prev = promptValue;
    let finalVal = '';
    if (mode === 'replace' || !prev.trim()) {
      finalVal = cleanInsert;
    } else {
      const needsNewline = prev.includes('\n') || cleanInsert.includes('\n') || cleanInsert.length > 25;
      finalVal = needsNewline ? `${prev.trim()}\n\n${cleanInsert}` : `${prev.trim()} ${cleanInsert}`;
    }
    setPromptValue(finalVal);
    setPlanTargetAudience?.(finalVal);

    const msg = options?.feedback || '已填入需求提示词！';
    setPromptToast(msg);
    setTimeout(() => setPromptToast(null), 2500);

    if (options?.scrollIntoView && textareaRef.current) {
      textareaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      textareaRef.current.focus();
      setIsPromptHighlighted(true);
      setTimeout(() => setIsPromptHighlighted(false), 2000);
    }
  }, [setPlanTargetAudience]);

  // Extract high-value actionable prompt directions directly from market search results
  const extractActionableMarketInspiration = useCallback((raw: string): string => {
    if (!raw || !raw.trim()) return '';
    const cleanLines = raw
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const points: string[] = [];
    cleanLines.forEach(line => {
      if (line.startsWith('#') || line.startsWith('---') || line.startsWith('===')) return;
      const cleaned = line.replace(/^[\*\-\•\d\.\、\s]+/, '').trim();
      if (cleaned.length >= 8 && !points.includes(cleaned)) {
        points.push(cleaned);
      }
    });

    if (points.length > 0) {
      const topPoints = points.slice(0, 5).join('；\n· ');
      return `【参考行业竞品与爆款灵感】：\n· ${topPoints}。\n（融合中文大标题与设计灵感来源打标，呈现电影级大片景深布局与空间高级感）`;
    }

    return `【参考行业竞品与爆款灵感】：\n${raw.trim()}`;
  }, []);

  // Style reference images & reference doc files (linked to workspace canvas)
  const [localStyleRefImages, setLocalStyleRefImages] = useState<string[]>([]);
  const styleRefImages = propsStyleRefImages ?? localStyleRefImages;
  const setStyleRefImages = propsSetStyleRefImages ?? setLocalStyleRefImages;

  const [localRefDocName, setLocalRefDocName] = useState<string | null>(null);
  const refDocName = propsRefDocName !== undefined ? propsRefDocName : localRefDocName;
  const setRefDocName = propsSetRefDocName ?? setLocalRefDocName;

  const [localRefDocText, setLocalRefDocText] = useState<string | null>(null);
  const refDocText = propsRefDocText !== undefined ? propsRefDocText : localRefDocText;
  const setRefDocText = propsSetRefDocText ?? setLocalRefDocText;

  const styleImageInputRef = useRef<HTMLInputElement>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveCurrentPreset = () => {
    const currentText = promptValue || planTargetAudience;
    if (!currentText || !currentText.trim()) return;
    const name = presetNameInput.trim() || `企划方向预设 #${savedPresets.length + 1}`;
    const newPreset = {
      id: `preset_${Date.now()}`,
      name,
      text: currentText.trim()
    };
    const updated = [newPreset, ...savedPresets];
    setSavedPresets(updated);
    try {
      localStorage.setItem('mw_planner_presets', JSON.stringify(updated));
    } catch {}
    setPresetNameInput('');
    setShowSavePresetModal(false);
  };

  const handleDeletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedPresets.filter(p => p.id !== id);
    setSavedPresets(updated);
    try {
      localStorage.setItem('mw_planner_presets', JSON.stringify(updated));
    } catch {}
  };

  const handleUploadStyleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result) {
          setStyleRefImages(prev => [...prev, evt.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleUploadRefDoc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRefDocName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      setRefDocText(content);
    };
    reader.readAsText(file);
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim()) return;
    onSendMessage(inputValue.trim());
    setInputValue('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadFile(file);
      e.target.value = '';
    }
  };

  const selectedScreen = React.useMemo(() => {
    if (selectedSceneIndex && agentRun?.plan?.screens) {
      const found = agentRun.plan.screens.find(s => s.screenIndex === selectedSceneIndex);
      if (found) return found;
    }

    const sceneNode = nodes.find(n => {
      if (selectedNodeId && n.id === selectedNodeId && (n.type === 'scenePlanNode' || n.type === 'scenePlan' || n.data?.screenTitle)) {
        return true;
      }
      if (selectedSceneIndex && (n.id === `scene-plan-node-${selectedSceneIndex}` || n.data?.screenIndex === selectedSceneIndex)) {
        return true;
      }
      return false;
    });

    if (sceneNode?.data) {
      const d = sceneNode.data as any;
      return {
        screenIndex: Number(d.screenIndex) || selectedSceneIndex || 1,
        screenTitle: (d.screenTitle as string) || (d.title as string) || '分镜画面',
        coreSellingPoint: (d.coreSellingPoint as string) || (d.sellingPoint as string) || '',
        visualComposition: (d.visualComposition as string) || '',
        lightingAndAtmosphere: (d.lightingAndAtmosphere as string) || '',
        promptSuggestion: (d.promptSuggestion as string) || (d.prompt as string) || '',
        aspectRatio: (d.aspectRatio as string) || '3:4'
      };
    }

    return null;
  }, [selectedSceneIndex, selectedNodeId, agentRun, nodes]);

  const hasDna = !!activeDna || !!agentRun?.dna || nodes.some(n => n.id === 'dna-node-1' || n.type === 'productDnaNode' || n.type === 'productDna');

  const selectedGenImgNode = nodes.find(
    n => n.id === selectedNodeId && (n.type === 'generatedImage' || n.type === 'generatedImageNode' || n.id.startsWith('gen-img-node-'))
  );
  const genImgData = selectedGenImgNode?.data;

  if (isPanelCollapsed) {
    return (
      <aside className="relative w-14 h-full flex flex-col items-center py-4 bg-[#FDFBF7] border-l border-[#E5E0D8] shrink-0 z-10 shadow-sm select-none transition-all duration-300">
        <button
          type="button"
          onClick={() => setIsPanelCollapsed(false)}
          className="p-2.5 rounded-xl bg-[#B28C5A] text-white hover:bg-[#8C6F43] active:scale-95 transition-all shadow-md mb-6"
          title="展开视觉企划智能体面板"
        >
          <Sparkles className="w-5 h-5" />
        </button>

        <div className="flex-1 flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={() => {
              setActiveTab('setup');
              setIsPanelCollapsed(false);
            }}
            className={`p-2.5 rounded-xl transition-all ${
              activeTab === 'setup'
                ? 'bg-[#F9F5EF] text-[#B28C5A] border border-[#B28C5A]/40'
                : 'text-stone-500 hover:bg-[#F4EFE6] hover:text-stone-800'
            }`}
            title="企划配置"
          >
            <Sliders className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('render');
              setIsPanelCollapsed(false);
            }}
            className={`p-2.5 rounded-xl transition-all ${
              activeTab === 'render'
                ? 'bg-[#F9F5EF] text-[#B28C5A] border border-[#B28C5A]/40'
                : 'text-stone-500 hover:bg-[#F4EFE6] hover:text-stone-800'
            }`}
            title="渲染引擎"
          >
            <Sparkles className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('chat');
              setIsPanelCollapsed(false);
            }}
            className={`p-2.5 rounded-xl transition-all ${
              activeTab === 'chat'
                ? 'bg-[#F9F5EF] text-[#B28C5A] border border-[#B28C5A]/40'
                : 'text-stone-500 hover:bg-[#F4EFE6] hover:text-stone-800'
            }`}
            title="智能对话"
          >
            <Bot className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('typography');
              setIsPanelCollapsed(false);
            }}
            className={`p-2.5 rounded-xl transition-all ${
              activeTab === 'typography'
                ? 'bg-[#F9F5EF] text-[#B28C5A] border border-[#B28C5A]/40'
                : 'text-stone-500 hover:bg-[#F4EFE6] hover:text-stone-800'
            }`}
            title="文案排版"
          >
            <Layers className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsPanelCollapsed(false)}
          className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-[#F4EFE6] transition-colors"
          title="展开侧边栏"
        >
          <ChevronRight className="w-5 h-5 rotate-180" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="relative w-full md:w-[440px] md:min-w-[380px] md:max-w-[520px] h-full flex flex-col bg-[#FDFBF7] border-l border-[#E5E0D8] shrink-0 z-10 shadow-[-4px_0_24px_rgba(0,0,0,0.02)] select-none transition-all duration-300">
      {/* Panel Header */}
      <div className="p-4 md:p-5 border-b border-[#E5E0D8] bg-white/80 backdrop-blur-md flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-[#F9F5EF] text-[#B28C5A] flex items-center justify-center border border-[#E5E0D8] shadow-sm">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-serif font-bold text-base text-[#2C2A29]">
              视觉企划智能体
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-medium text-stone-500">
                {agentRun?.plan ? '全案企划已就绪' : activeDna ? 'DNA 已接入' : '工作区已就绪'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {conversationsList.length > 1 && (
            <select
              value={currentConversation?.id || ''}
              onChange={(e) => onSelectConversation?.(e.target.value)}
              className="text-[10px] bg-[#FAF8F5] text-stone-700 px-2 py-1 rounded-lg border border-[#E5E0D8] font-mono outline-none max-w-[120px] truncate"
              title="切换历史会话"
            >
              {conversationsList.map(c => (
                <option key={c.id} value={c.id}>
                  {c.title || `会话 ${c.id.slice(0, 8)}`}
                </option>
              ))}
            </select>
          )}
          {onCreateNewConversation && (
            <button
              onClick={onCreateNewConversation}
              className="text-[10px] bg-[#F9F5EF] text-[#B28C5A] hover:bg-[#B28C5A] hover:text-white px-2.5 py-1 rounded-full font-bold border border-[#E5E0D8]/60 transition-colors"
              title="开启全新对话"
            >
              + 新建会话
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsPanelCollapsed(true)}
            className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-[#F4EFE6] rounded-xl transition-colors"
            title="折叠面板，收起留出画布空间"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Fixed Functional Lanes Tab Bar */}
      <div className="grid grid-cols-4 bg-[#F4EFE6] p-1 border-b border-[#E5E0D8] shrink-0 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('setup')}
          className={`py-2 text-center rounded-lg transition-all flex items-center justify-center gap-1 ${
            activeTab === 'setup'
              ? 'bg-white text-[#2C2A29] shadow-xs border border-[#E5E0D8]'
              : 'text-stone-500 hover:text-stone-800'
          }`}
          title="产品主图、详情页企划调参与企划生成"
        >
          <Sliders className="w-3.5 h-3.5 text-[#B28C5A]" />
          <span>企划配置</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('render')}
          className={`py-2 text-center rounded-lg transition-all flex items-center justify-center gap-1 ${
            activeTab === 'render'
              ? 'bg-white text-[#2C2A29] shadow-xs border border-[#E5E0D8]'
              : 'text-stone-500 hover:text-stone-800'
          }`}
          title="渲染引擎模型、精度与全案受控批量画面生成"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#B28C5A]" />
          <span>渲染引擎</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('chat')}
          className={`py-2 text-center rounded-lg transition-all flex items-center justify-center gap-1 ${
            activeTab === 'chat'
              ? 'bg-white text-[#2C2A29] shadow-xs border border-[#E5E0D8]'
              : 'text-stone-500 hover:text-stone-800'
          }`}
          title="AI 智能体对话思考流与全案灵感沟通"
        >
          <Bot className="w-3.5 h-3.5 text-[#B28C5A]" />
          <span>智能对话</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('typography')}
          className={`py-2 text-center rounded-lg transition-all flex items-center justify-center gap-1 ${
            activeTab === 'typography'
              ? 'bg-white text-[#2C2A29] shadow-xs border border-[#E5E0D8]'
              : 'text-stone-500 hover:text-stone-800'
          }`}
          title="海报文字排版与文案润色工坊"
        >
          <Layers className="w-3.5 h-3.5 text-[#B28C5A]" />
          <span>文案排版</span>
        </button>
      </div>

      {/* Unified Scrollable Main Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 custom-scrollbar">
        {/* Hidden File Input for Image Upload */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/png, image/jpeg, image/jpg, image/webp"
          className="hidden"
        />

        {/* Lane 1: Setup & Planning Configuration (企划配置) */}
        {activeTab === 'setup' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#2C2A29] flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-[#B28C5A]" />
                产品主图与全案企划调参
              </span>
              <span className="text-[10px] text-stone-500 font-mono">Lane 1 · Setup</span>
            </div>

            {/* Product Photo Upload & DNA Card */}
            {(() => {
              const imgNode = nodes?.find(n => n.id === 'img-node-1' || n.type === 'productImageNode' || n.type === 'productImage');
              const hasImage = !!imgNode?.data?.imageUrl;
              const imageUrl = imgNode?.data?.imageUrl as string;
              const fileName = (imgNode?.data?.fileName as string) || 'product_photo.jpg';

              if (hasImage && uploadState === 'completed') {
                return (
                  <div className="p-3 bg-white rounded-2xl border border-[#E5E0D8] shadow-sm space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-[#2C2A29]">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        产品主角图已接入
                      </span>
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 font-mono">
                        DNA 已同步
                      </span>
                    </div>

                    <div className="relative w-full h-32 bg-stone-100 rounded-xl overflow-hidden border border-[#E5E0D8] flex items-center justify-center group">
                      <img src={imageUrl} alt={fileName} className="w-full h-full object-contain p-2" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3 py-1.5 bg-[#B28C5A] hover:bg-[#9E7A4A] text-white rounded-lg text-xs font-bold shadow-md flex items-center gap-1"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>更换主角图</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-stone-500 pt-1">
                      <span className="truncate max-w-[180px] font-mono">{fileName}</span>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-[#B28C5A] hover:underline font-bold flex items-center gap-1"
                      >
                        <Upload className="w-3 h-3" />
                        <span>重新上传</span>
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  onClick={() => {
                    if (uploadState !== 'uploading' && uploadState !== 'analyzing') {
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file && onUploadFile) {
                      onUploadFile(file);
                    }
                  }}
                  className={`p-4 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center cursor-pointer group ${
                    uploadState === 'uploading' || uploadState === 'analyzing'
                      ? 'border-amber-300 bg-amber-50/40 cursor-wait'
                      : 'border-[#E5E0D8] bg-white/70 hover:bg-white hover:border-[#B28C5A]'
                  }`}
                >
                  {uploadState === 'uploading' && (
                    <div className="flex flex-col items-center py-2">
                      <Loader2 className="w-8 h-8 text-[#B28C5A] animate-spin mb-2" />
                      <p className="text-xs font-bold text-[#2C2A29]">正在上传产品主图...</p>
                    </div>
                  )}

                  {uploadState === 'analyzing' && (
                    <div className="flex flex-col items-center py-2">
                      <Sparkles className="w-8 h-8 text-[#B28C5A] animate-pulse mb-2" />
                      <p className="text-xs font-bold text-[#2C2A29]">正在解析 DNA 视觉特征...</p>
                      <p className="text-[10px] text-stone-400 mt-0.5">提取造型、色彩与材质纹理</p>
                    </div>
                  )}

                  {uploadState !== 'uploading' && uploadState !== 'analyzing' && (
                    <>
                      <div className="w-10 h-10 rounded-2xl bg-[#F9F5EF] text-[#B28C5A] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform border border-[#E5E0D8]/60">
                        <Upload className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-bold text-[#2C2A29] mb-0.5">
                        {uploadState === 'completed' ? '重新上传产品主角图' : '点击/拖拽上传产品主角图'}
                      </p>
                      <p className="text-[10px] text-stone-400">支持 PNG, JPG, WEBP · 支持 Ctrl+V 粘贴</p>
                    </>
                  )}
                </div>
              );
            })()}

            {/* Plan Settings Card */}
            <div className="p-4 bg-[#F9F5EF] rounded-2xl border border-[#B28C5A]/40 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-5 h-5 text-[#B28C5A]" />
                  <div>
                    <h4 className="font-bold text-xs text-[#2C2A29]">{planScreenCount || 1} 屏{planScreenCount === 1 ? '单图' : '全案'}爆款详情页策划</h4>
                    <p className="text-[10px] text-stone-500">基于产品 DNA 与行业大模型策划视角分布</p>
                  </div>
                </div>
                {savedPresets.length > 0 && (
                  <div className="relative group">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-[10px] font-bold text-[#8C6F43] bg-white px-2 py-1 rounded-lg border border-[#B28C5A]/30 hover:border-[#B28C5A] shadow-2xs"
                    >
                      <Bookmark className="w-3 h-3 text-[#B28C5A]" />
                      <span>企划预设库</span>
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-[#E5E0D8] rounded-xl shadow-xl p-2 z-50 hidden group-hover:block space-y-1">
                      <div className="text-[10px] font-bold text-stone-400 px-1 pb-1 border-b border-stone-100 flex items-center justify-between">
                        <span>已保存企划预设 ({savedPresets.length})</span>
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {savedPresets.map(preset => (
                          <div
                            key={preset.id}
                            onPointerDown={e => e.stopPropagation()}
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => handleUpdatePrompt(preset.text, { mode: 'replace', scrollIntoView: true, feedback: `✓ 已应用预设「${preset.name}」` })}
                            className="p-1.5 rounded-lg hover:bg-[#F9F5EF] cursor-pointer text-[10px] flex items-center justify-between group/item transition-colors"
                          >
                            <div className="truncate flex-1 min-w-0 pr-1">
                              <span className="font-bold text-[#2C2A29] block truncate">{preset.name}</span>
                              <span className="text-stone-400 block truncate text-[9px]">{preset.text}</span>
                            </div>
                            <button
                              type="button"
                              onPointerDown={e => e.stopPropagation()}
                              onMouseDown={e => e.stopPropagation()}
                              onClick={(e) => handleDeletePreset(preset.id, e)}
                              className="text-stone-300 hover:text-rose-500 p-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity"
                              title="删除此预设"
                            >
                              <Trash className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {/* Large Textarea Prompt Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-stone-600">全案爆款企划方向 & 需求提示词</span>
                      {promptToast && (
                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full animate-fadeIn flex items-center gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                          {promptToast}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onPointerDown={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={() => setShowSavePresetModal(!showSavePresetModal)}
                      disabled={!(promptValue || planTargetAudience)?.trim()}
                      className="text-[10px] font-bold text-[#B28C5A] hover:text-[#8C6F43] flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                    >
                      <Save className="w-3 h-3" />
                      <span>保存为预设</span>
                    </button>
                  </div>

                  {showSavePresetModal && (
                    <div className="flex items-center gap-1.5 bg-white p-2 rounded-lg border border-[#B28C5A]/40 shadow-sm animate-fadeIn">
                      <input
                        type="text"
                        placeholder="给此企划预设起个名字..."
                        value={presetNameInput}
                        onChange={e => setPresetNameInput(e.target.value)}
                        className="flex-1 text-[11px] px-2 py-1 border border-stone-200 rounded outline-none focus:border-[#B28C5A]"
                      />
                      <button
                        type="button"
                        onPointerDown={e => e.stopPropagation()}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={handleSaveCurrentPreset}
                        className="px-2.5 py-1 bg-[#B28C5A] text-white text-[10px] font-bold rounded hover:bg-[#8C6F43] cursor-pointer"
                      >
                        确认保存
                      </button>
                    </div>
                  )}

                  <div className="relative">
                    <textarea
                      ref={textareaRef}
                      rows={4}
                      onPointerDown={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                      placeholder="请输入你的全案企划想法（例如：根据这款沙发，做创意海报。中文标题，设计灵感来源，色调，场景，排版。电影级远景/中景层次感，颜色和谐，带两只同款图案靠枕。需出现扶手设计、拉皱背靠、方形沙发脚的设计解析...）"
                      value={promptValue}
                      onChange={e => {
                        const val = e.target.value;
                        setPromptValue(val);
                        setPlanTargetAudience?.(val);
                      }}
                      className={`nodrag nopan w-full rounded-xl border bg-white p-3 text-xs text-[#2C2A29] outline-none placeholder-stone-400 leading-relaxed resize-y min-h-[96px] transition-all duration-300 ${
                        isPromptHighlighted
                          ? 'border-[#B28C5A] ring-2 ring-[#B28C5A]/40 bg-[#FFFDF9] shadow-md'
                          : 'border-[#E5E0D8] focus:border-[#B28C5A]'
                      }`}
                    />
                    {Boolean(promptValue) && (
                      <button
                        type="button"
                        onPointerDown={e => e.stopPropagation()}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={() => handleUpdatePrompt('', { mode: 'replace', feedback: '已清空提示词' })}
                        className="absolute right-2 bottom-2 text-[9px] text-stone-400 hover:text-rose-500 bg-white/80 hover:bg-white border border-stone-200 px-1.5 py-0.5 rounded shadow-2xs transition-colors cursor-pointer"
                        title="清空输入框"
                      >
                        清空
                      </button>
                    )}
                  </div>

                  {/* Preset Tags Click to Insert */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    <span className="text-[9px] font-bold text-stone-400 self-center mr-0.5">快捷添加：</span>
                    {[
                      { label: '🎬 电影级视效', text: '电影级空间场景，远景与中景有丰富空间纵深与层次感，具备高雅艺术感。' },
                      { label: '🛋️ 扶手/拉皱背靠/方形脚解析', text: '海报上需出现扶手线条设计、拉皱靠背背搭、方形沙发脚的细节工程解析打标。' },
                      { label: '🎨 双同款图案抱枕', text: '沙发上摆放两个款式相同带有精致图案的靠枕，调性和谐。' },
                      { label: '🏷️ 中文标题与灵感', text: '主图需包含中文主标题、设计灵感来源、美学调性色盘与高级排版。' },
                      { label: '🌾 莫兰迪低饱和色调', text: '莫兰迪低饱和温润光影，质感皮艺与自然温润氛围。' }
                    ].map((tag, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onPointerDown={e => e.stopPropagation()}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={() => handleUpdatePrompt(tag.text, { mode: 'append', scrollIntoView: false, feedback: `✓ 已添加「${tag.label}」` })}
                        className="text-[9px] bg-white hover:bg-[#FAF8F5] text-stone-600 border border-[#E5E0D8] hover:border-[#B28C5A]/50 px-1.5 py-0.5 rounded-full transition-all active:scale-95 cursor-pointer shadow-2xs"
                      >
                        {tag.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* VectorEngine Market & Competitor Reference Search Grounding */}
                <div className="pt-2.5 pb-1 border-t border-[#E5E0D8]/60 space-y-2">
                  <div className="flex items-center justify-between bg-stone-50/80 p-2.5 rounded-xl border border-stone-200/80">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={planEnableSearch}
                        onChange={e => setPlanEnableSearch?.(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-[#B28C5A] border-stone-300 focus:ring-[#B28C5A] accent-[#B28C5A] cursor-pointer"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-[#B28C5A]" />
                          <span className="text-[11px] font-bold text-stone-800">
                            联网检索行业竞品参考 (VectorEngine 实时搜索)
                          </span>
                        </div>
                        <p className="text-[9px] text-stone-500 mt-0.5">
                          追溯顾家、乐至宝等行业品牌最新爆款命名（如赫兹、云舒等）、色调、场景与排版构思
                        </p>
                      </div>
                    </label>
                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${planEnableSearch ? 'bg-[#B28C5A]/10 text-[#8C6F43] border border-[#B28C5A]/30' : 'bg-stone-200/60 text-stone-400'}`}>
                      {planEnableSearch ? '已启用' : '未开启'}
                    </span>
                  </div>

                  {planEnableSearch && (
                    <div className="p-3 bg-white rounded-xl border border-[#B28C5A]/30 shadow-xs space-y-2.5 animate-fadeIn">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-bold text-stone-700">检索关键词 / 调研焦点：</span>
                          <span className="text-stone-400 text-[9px]">基于 Google Search 实时知识检索</span>
                        </div>
                        <input
                          type="text"
                          value={planSearchKeywords}
                          onChange={e => setPlanSearchKeywords?.(e.target.value)}
                          placeholder="例如：顾家家居、乐至宝最新爆款沙发命名(如赫兹、云舒)、流行色调、场景布景与排版"
                          className="w-full text-[11px] px-2.5 py-1.5 bg-[#FAF8F5] border border-stone-200 rounded-lg outline-none focus:border-[#B28C5A] text-stone-700 placeholder-stone-400"
                        />
                      </div>

                      {/* Quick Search Chips */}
                      <div className="flex flex-wrap gap-1">
                        <span className="text-[9px] text-stone-400 self-center">焦点推荐：</span>
                        {[
                          { label: '🏷️ 顾家 (赫兹/云舒/大黑牛)', text: '顾家家居最新爆款沙发命名(赫兹/云舒/大黑牛)与设计灵感来源、材质搭配' },
                          { label: '🛋️ 乐至宝 (功能科技/极致舒适)', text: '乐至宝 La-Z-Boy 最新功能沙发产品命名、零重力人体工学与布景美学' },
                          { label: '🎨 2025-2026 流行色调与皮质', text: '高端家具2025-2026流行色调方案(莫兰迪灰调/复古暖棕/奶油白)与材质表达' },
                          { label: '📐 电影级大片景深与详情排版', text: '现代家具详情页视觉排版特色、中文大标题、灵感来源解析标签与特写构图' }
                        ].map((chip, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setPlanSearchKeywords?.(chip.text)}
                            className="text-[9px] bg-stone-50 hover:bg-[#FAF8F5] text-stone-600 border border-stone-200 hover:border-[#B28C5A]/50 px-1.5 py-0.5 rounded transition-colors text-left"
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>

                      {/* Search Trigger Button */}
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => onSearchMarketReference?.(planSearchKeywords)}
                          disabled={marketSearchLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 hover:bg-black text-white text-[10px] font-bold rounded-lg shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                          {marketSearchLoading ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin text-[#B28C5A]" />
                              <span>正在联网检索行业最新趋势...</span>
                            </>
                          ) : (
                            <>
                              <Search className="w-3 h-3 text-[#B28C5A]" />
                              <span>立即联网检索参考构思</span>
                            </>
                          )}
                        </button>
                        <span className="text-[9px] text-stone-400">
                          生成全案时亦将自动融合
                        </span>
                      </div>

                      {/* Search Result Display */}
                      {marketSearchResult && (
                        <div className="mt-2 p-2.5 bg-[#FAF8F5] border border-[#B28C5A]/30 rounded-lg space-y-2 animate-fadeIn">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-[#8C6F43] flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-[#B28C5A]" />
                              最新检索到的市场与竞品参考构思：
                            </span>
                            <button
                              type="button"
                              onClick={onClearMarketSearchResult}
                              className="text-[9px] text-stone-400 hover:text-stone-600"
                            >
                              清空
                            </button>
                          </div>
                          <div className="max-h-36 overflow-y-auto text-[10px] text-stone-700 leading-relaxed space-y-1.5 pr-1 select-text">
                            {marketSearchResult.split('\n').map((line, lIdx) => (
                              <p key={lIdx} className={line.startsWith('#') ? 'font-bold text-stone-900 mt-1' : ''}>
                                {line}
                              </p>
                            ))}
                          </div>
                          <div className="pt-1.5 border-t border-stone-200/60 flex items-center justify-between flex-wrap gap-1.5">
                            <span className="text-[9px] text-emerald-700 font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              已获取市场灵感，可一键填入上方需求提示词
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onPointerDown={e => e.stopPropagation()}
                                onMouseDown={e => e.stopPropagation()}
                                onClick={() => {
                                  const inspirationText = extractActionableMarketInspiration(marketSearchResult);
                                  handleUpdatePrompt(inspirationText, {
                                    mode: 'append',
                                    scrollIntoView: true,
                                    feedback: '✓ 已成功填入提炼灵感！'
                                  });
                                }}
                                className="text-[9px] font-bold text-[#8C6F43] hover:text-[#B28C5A] flex items-center gap-1 px-2.5 py-1 bg-white border border-[#B28C5A]/50 rounded-md hover:shadow-xs transition-all cursor-pointer active:scale-95 shadow-2xs"
                                title="智能提炼核心爆款灵感并填入上方需求提示词框"
                              >
                                <Sparkles className="w-2.5 h-2.5 text-[#B28C5A]" />
                                <span>✨ 填入提示词</span>
                              </button>
                              <button
                                type="button"
                                onPointerDown={e => e.stopPropagation()}
                                onMouseDown={e => e.stopPropagation()}
                                onClick={() => {
                                  handleUpdatePrompt(`【市场与竞品参考调研情报】：\n${marketSearchResult.trim()}`, {
                                    mode: 'append',
                                    scrollIntoView: true,
                                    feedback: '✓ 已完整填入市场调研情报！'
                                  });
                                }}
                                className="text-[9px] font-medium text-stone-600 hover:text-stone-900 flex items-center gap-1 px-2 py-1 bg-white border border-stone-200 rounded-md hover:bg-stone-50 transition-all cursor-pointer shadow-2xs"
                                title="将完整调研内容追加到需求提示词框末尾"
                              >
                                <FileText className="w-2.5 h-2.5 text-stone-400" />
                                <span>完整填入</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Upload Style Reference Poster & Reference Document Section */}
                <div className="pt-2 border-t border-[#E5E0D8]/60 space-y-2">
                  <span className="text-[10px] font-bold text-stone-600 block">企划参考资料 (风格调性图 / 企划文档)</span>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Style Reference Image Button */}
                    <div>
                      <input
                        type="file"
                        ref={styleImageInputRef}
                        onChange={handleUploadStyleImage}
                        accept="image/*"
                        multiple
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => styleImageInputRef.current?.click()}
                        className="w-full py-2 px-2 bg-white hover:bg-[#FAF8F5] border border-dashed border-[#B28C5A]/40 rounded-xl text-[10px] font-bold text-stone-600 flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-[#B28C5A]" />
                        <span>上传风格参考海报图 ({styleRefImages.length})</span>
                      </button>
                    </div>

                    {/* Reference Document Button */}
                    <div>
                      <input
                        type="file"
                        ref={docFileInputRef}
                        onChange={handleUploadRefDoc}
                        accept=".txt,.md,.json,.doc,.docx,.pdf"
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => docFileInputRef.current?.click()}
                        className="w-full py-2 px-2 bg-white hover:bg-[#FAF8F5] border border-dashed border-[#B28C5A]/40 rounded-xl text-[10px] font-bold text-stone-600 flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5 text-[#B28C5A]" />
                        <span>{refDocName ? '已载入企划文档' : '上传企划参考文档'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Previews for Uploaded Reference Images */}
                  {styleRefImages.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                      {styleRefImages.map((img, i) => (
                        <div key={i} className="relative w-12 h-12 rounded-lg border border-stone-200 overflow-hidden shrink-0 group">
                          <img src={img} alt="风格参考" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setStyleRefImages(prev => prev.filter((_, idx) => idx !== i))}
                            className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Preview for Reference Document */}
                  {refDocName && (
                    <div className="flex items-center justify-between p-2 bg-emerald-50/80 border border-emerald-200/80 rounded-lg text-[10px] text-emerald-800">
                      <div className="flex items-center gap-1.5 truncate">
                        <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="font-bold truncate">{refDocName}</span>
                        <span className="text-[9px] text-emerald-600 font-mono">({refDocText?.length || 0} 字)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setRefDocName(null);
                          setRefDocText(null);
                        }}
                        className="text-emerald-600 hover:text-emerald-900 ml-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold text-stone-600">企划屏数 (对齐生成)</span>
                    <select
                      value={planScreenCount || 1}
                      onChange={e => setPlanScreenCount?.(Number(e.target.value))}
                      className="w-full rounded-lg border border-[#E5E0D8] bg-white px-2 py-2 text-[10px] font-bold text-[#2C2A29] outline-none focus:border-[#B28C5A]"
                    >
                      <option value={1}>1 屏 (单图传播)</option>
                      <option value={3}>3 屏 (轻量种草)</option>
                      <option value={4}>4 屏 (核心卖点)</option>
                      <option value={6}>6 屏 (精简详情)</option>
                      <option value={9}>9 屏 (完整全案)</option>
                      <option value={12}>12 屏 (深度全案)</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold text-stone-600">目标画面比例</span>
                    <select
                      value={planAspectRatio || '4:3'}
                      onChange={e => setPlanAspectRatio?.(e.target.value)}
                      className="w-full rounded-lg border border-[#E5E0D8] bg-white px-2 py-2 text-[10px] font-bold text-[#2C2A29] outline-none focus:border-[#B28C5A]"
                    >
                      <option value="1:1">1:1 (电商主图/方图)</option>
                      <option value="3:4">3:4 (小红书/海报竖版)</option>
                      <option value="4:3">4:3 (横版短图/横屏展厅)</option>
                      <option value="9:16">9:16 (手机全屏竖版)</option>
                      <option value="16:9">16:9 (PC横版/宽屏)</option>
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold text-stone-600">策划 AI 模型</span>
                    <select
                      value={planAgentModel}
                      onChange={event => setPlanAgentModel?.(event.target.value)}
                      className="w-full rounded-lg border border-[#E5E0D8] bg-white px-2 py-2 text-[10px] text-[#2C2A29] outline-none focus:border-[#B28C5A]"
                    >
                      <option value="gemini-3.7-flash">Gemini 3.7 Flash（混合推理·思维链加速）</option>
                      <option value="gpt-6">GPT-6（旗舰全模态 Astra·最强全案企划）</option>
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash（官方原生·快速稳定）</option>
                      <option value="gpt-5.6-sol">GPT-5.6 Sol（旗舰企划 Responses）</option>
                      <option value="gpt-5.5">GPT-5.5</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold text-stone-600">思考深度等级</span>
                    <select
                      value={planReasoningEffort}
                      onChange={event => setPlanReasoningEffort?.(event.target.value as 'minimal' | 'low' | 'medium' | 'high')}
                      className="w-full rounded-lg border border-[#E5E0D8] bg-white px-2 py-2 text-[10px] text-[#2C2A29] outline-none focus:border-[#B28C5A]"
                    >
                      <option value="minimal">极简 (最快)</option>
                      <option value="low">低 (推荐)</option>
                      <option value="medium">中 (标准深度)</option>
                      <option value="high">高 (极深思维链)</option>
                    </select>
                  </label>
                </div>
              </div>

              <button
                onClick={() => onGenerateNineGridPlan()}
                disabled={isPlanGenerating}
                className="w-full py-3 bg-[#B28C5A] hover:bg-[#9E7A4A] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98]"
              >
                {isPlanGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>正在生成 {planScreenCount || 1} 屏企划方案...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>{agentRun?.plan ? `重新策划 ${planScreenCount || 1} 屏企划` : `生成 ${planScreenCount || 1} 屏企划方案`}</span>
                  </>
                )}
              </button>
            </div>

            {/* Existing Nine Grid Plan Overview if Available */}
            {agentRun?.plan && (
              <div className="p-4 bg-white rounded-2xl border border-[#B28C5A] shadow-sm space-y-2.5">
                <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-2">
                  <div className="flex items-center gap-2 text-[#2C2A29]">
                    <LayoutGrid className="w-4 h-4 text-[#B28C5A]" />
                    <span className="font-bold text-xs">当前企划方案总览</span>
                  </div>
                  <span className="text-[10px] font-bold bg-[#10B981]/10 text-[#10B981] px-2 py-0.5 rounded-full font-mono">
                    {agentRun.plan.screens.length} 屏就绪
                  </span>
                </div>
                <div className="space-y-1 text-xs text-stone-700">
                  <p><span className="text-stone-400 font-bold">企划主题：</span>{agentRun.plan.themeTitle}</p>
                  <p><span className="text-stone-400 font-bold">目标受众：</span>{agentRun.plan.targetAudience}</p>
                  <p><span className="text-stone-400 font-bold">视觉调性：</span>{agentRun.plan.overallStyle}</p>
                </div>
              </div>
            )}
          </div>
        )}




        {/* Selected Node Inspector View inside Right Panel */}
        {(selectedNodeId?.startsWith('plan-node-') || selectedNodeId === 'nine-grid-plan-node') && agentRun?.plan && (
          <div className="p-4 bg-white rounded-2xl border border-[#B28C5A] shadow-md space-y-3">
          <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-2">
            <div className="flex items-center gap-2 text-[#2C2A29]">
              <LayoutGrid className="w-4 h-4 text-[#B28C5A]" />
              <span className="font-bold text-sm">全案企划总览</span>
            </div>
            <span className="text-[10px] font-bold bg-[#10B981]/10 text-[#10B981] px-2 py-0.5 rounded-full">
              全案就绪
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-stone-700">
            <p><span className="text-stone-400 font-bold">企划主题：</span>{agentRun.plan.themeTitle}</p>
            <p><span className="text-stone-400 font-bold">目标受众：</span>{agentRun.plan.targetAudience}</p>
            <p><span className="text-stone-400 font-bold">视觉调性：</span>{agentRun.plan.overallStyle}</p>
          </div>

          <div className="pt-2 border-t border-[#E5E0D8]/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-stone-400">共 9 屏视角脚本</span>
              <button
                onClick={() => onGenerateNineGridPlan()}
                disabled={isPlanGenerating}
                className="flex items-center gap-1 text-xs font-bold text-[#B28C5A] hover:text-[#8C6F43] disabled:opacity-50"
              >
                <RotateCw className="w-3 h-3" />
                <span>重新策划全案</span>
              </button>
            </div>

            {/* Model & Resolution selector */}
            <EngineConfigSelector
              selectedModel={model}
              setSelectedModel={setModel}
              selectedResolution={resolution}
              setSelectedResolution={setResolution}
              onPreviewGptImage={onPreviewGptImage}
            />

            {/* C3B Primary Entry Button */}
            <button
              onClick={() => onTriggerBatchMissingModal?.()}
              disabled={batchState?.status === 'running'}
              className="w-full py-2.5 px-4 bg-[#B28C5A] hover:bg-[#8C6F43] active:bg-[#6E5532] text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {batchState?.status === 'running' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>全案批量生成进行中...</span>
                </>
              ) : (
                <>
                  <ImagePlus className="w-4 h-4" />
                  <span>生成缺失画面 (全案受控队列)</span>
                </>
              )}
            </button>
          </div>

          {/* C3B Batch Task Queue Control Panel */}
          {(batchState || queueItems.length > 0) && (
            <div className="pt-3 border-t border-[#E5E0D8] space-y-3 bg-[#FAF8F5] p-3 rounded-xl border border-[#E5E0D8]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-[#B28C5A]" />
                  <span className="font-bold text-xs text-[#2C2A29]">受控并发任务队列 (Max=2)</span>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white border border-[#E5E0D8] text-stone-700">
                  {batchState?.status === 'running' && '运行中'}
                  {batchState?.status === 'paused' && '已暂停'}
                  {batchState?.status === 'completed' && '全部完成'}
                  {batchState?.status === 'partial_failed' && '有失败项'}
                  {batchState?.status === 'cancelled' && '已取消'}
                </span>
              </div>

              {/* Stats overview */}
              <div className="grid grid-cols-4 gap-1.5 text-center text-[10px]">
                <div className="bg-white p-1.5 rounded-lg border border-[#E5E0D8]">
                  <span className="text-stone-400 block">排队中</span>
                  <span className="font-bold text-stone-700 font-mono">
                    {queueItems.filter(i => i.status === 'queued' || i.status === 'pending').length}
                  </span>
                </div>
                <div className="bg-white p-1.5 rounded-lg border border-amber-200">
                  <span className="text-amber-600 block">生成中</span>
                  <span className="font-bold text-amber-700 font-mono">
                    {queueItems.filter(i => i.status === 'generating').length}
                  </span>
                </div>
                <div className="bg-white p-1.5 rounded-lg border border-emerald-200">
                  <span className="text-emerald-600 block">已完成</span>
                  <span className="font-bold text-emerald-700 font-mono">
                    {queueItems.filter(i => i.status === 'success').length}
                  </span>
                </div>
                <div className="bg-white p-1.5 rounded-lg border border-rose-200">
                  <span className="text-rose-600 block">失败</span>
                  <span className="font-bold text-rose-700 font-mono">
                    {queueItems.filter(i => i.status === 'failed').length}
                  </span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1.5 pt-1">
                {batchState?.status === 'running' ? (
                  <button
                    onClick={() => onPauseBatch?.()}
                    className="flex-1 py-1.5 px-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 border border-amber-300 transition-colors"
                  >
                    <Pause className="w-3 h-3" />
                    <span>暂停队列</span>
                  </button>
                ) : batchState?.status === 'paused' ? (
                  <button
                    onClick={() => onResumeBatch?.()}
                    className="flex-1 py-1.5 px-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 border border-emerald-300 transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    <span>继续队列</span>
                  </button>
                ) : null}

                {queueItems.some(i => i.status === 'queued' || i.status === 'pending' || i.status === 'generating') && (
                  <button
                    onClick={() => onCancelBatch?.()}
                    className="flex-1 py-1.5 px-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 border border-stone-300 transition-colors"
                  >
                    <XCircle className="w-3 h-3" />
                    <span>取消排队</span>
                  </button>
                )}

                {queueItems.some(i => i.status === 'failed') && (
                  <button
                    onClick={() => onRetryFailedBatch?.()}
                    className="flex-1 py-1.5 px-2 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 border border-rose-300 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>重试失败项</span>
                  </button>
                )}
              </div>

              {/* Scene Queue Grid Detail */}
              <div className="space-y-1 text-[10px] max-h-36 overflow-y-auto pt-1 border-t border-[#E5E0D8]/60">
                {queueItems.map(item => (
                  <div
                    key={item.sceneNumber}
                    className="flex items-center justify-between p-1.5 bg-white rounded-lg border border-[#E5E0D8]"
                  >
                    <span className="font-bold text-[#2C2A29]">第 {item.sceneNumber} 屏分镜</span>
                    <div className="flex items-center gap-1">
                      {item.status === 'generating' && (
                        <span className="text-amber-700 font-medium flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> 生成中...
                        </span>
                      )}
                      {item.status === 'queued' && <span className="text-stone-400">排队中</span>}
                      {item.status === 'pending' && <span className="text-stone-400 font-mono">待处理</span>}
                      {item.status === 'success' && (
                        <span className="text-emerald-600 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> 已完成
                        </span>
                      )}
                      {item.status === 'failed' && (
                        <span className="text-rose-600 font-bold flex items-center gap-1" title={item.error?.message}>
                          <XCircle className="w-3 h-3" /> 失败
                        </span>
                      )}
                      {item.status === 'cancelled' && <span className="text-stone-400">已取消</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedScreen && (
        <div className="p-4 bg-white rounded-2xl border border-[#B28C5A] shadow-md space-y-3">
          <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-2">
            <div className="flex items-center gap-2 text-[#2C2A29]">
              <Film className="w-4 h-4 text-[#B28C5A]" />
              <span className="font-bold text-sm">
                第 {selectedScreen.screenIndex} 屏分镜: {selectedScreen.screenTitle}
              </span>
            </div>
            <span className="text-[10px] font-bold bg-[#10B981]/10 text-[#10B981] px-2 py-0.5 rounded-full">
              策划完成
            </span>
          </div>

          <div className="space-y-2 text-xs text-stone-700">
            <div>
              <span className="text-[10px] text-stone-400 font-bold block">核心卖点 / 画面目的</span>
              <p className="font-medium text-[#2C2A29] mt-0.5">{selectedScreen.coreSellingPoint}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-[#FAF8F5] p-2.5 rounded-xl border border-[#E5E0D8]/60">
              <div>
                <span className="text-[10px] text-stone-400 block">构图视角</span>
                <span className="font-bold text-[#2C2A29] block mt-0.5">{selectedScreen.visualComposition}</span>
              </div>
              <div>
                <span className="text-[10px] text-stone-400 block">光影氛围</span>
                <span className="font-bold text-[#2C2A29] block mt-0.5">{selectedScreen.lightingAndAtmosphere}</span>
              </div>
            </div>

            <div>
              <span className="text-[10px] text-stone-400 font-bold block">图片生成提示词 (Prompt)</span>
              <p className="font-mono text-[11px] text-[#2C2A29] bg-[#F9F5EF] p-2 rounded-xl border border-[#E5E0D8] mt-0.5">
                {selectedScreen.promptSuggestion}
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-[#E5E0D8]/60 flex items-center justify-between">
            <span className="text-[11px] text-stone-400">画幅比例: {selectedScreen.aspectRatio || '3:4'}</span>
            <button
              onClick={() => onReplanSingleScene(selectedScreen.screenIndex)}
              disabled={isPlanGenerating}
              className="flex items-center gap-1 text-xs font-bold text-[#B28C5A] hover:text-[#8C6F43] disabled:opacity-50"
            >
              <RefreshCw className="w-3 h-3" />
              <span>重新策划本屏</span>
            </button>
          </div>

          {/* Phase C3A: Image Generation & Review Action Section */}
          {(() => {
            const screenIndex = selectedScreen.screenIndex;
            const isGenerating = generatingScenes?.has(screenIndex);
            const genImgNode = nodes.find(n => n.id === `gen-img-node-${screenIndex}`);
            const taskNode = nodes.find(n => n.id === `img-gen-task-${screenIndex}`);

            return (
              <div className="pt-3 border-t border-[#E5E0D8] space-y-3">
                {/* Engine & Resolution Selector */}
                <EngineConfigSelector
                  selectedModel={model}
                  setSelectedModel={setModel}
                  selectedResolution={resolution}
                  setSelectedResolution={setResolution}
                  onPreviewGptImage={onPreviewGptImage}
                />

                {/* Image Generation Trigger Buttons */}
                <div className="flex gap-2 w-full mt-4">
                  <button
                    onClick={() => {
                      if (onGenerateSceneImage) {
                        onGenerateSceneImage(screenIndex);
                      }
                    }}
                    disabled={isGenerating || isPlanGenerating || !hasDna}
                    className="flex-1 py-2 px-3 bg-[#B28C5A] hover:bg-[#8C6F43] active:bg-[#6E5533] text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>生成中...</span>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>生成纯净底图</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      if (onGenerateSceneImage) {
                        onGenerateSceneImage(screenIndex, undefined, undefined, undefined, true);
                      }
                    }}
                    disabled={isGenerating || isPlanGenerating}
                    className="flex-1 py-2 px-3 bg-[#2C2A29] hover:bg-[#1A1818] text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>生成中...</span>
                      </>
                    ) : (
                      <>
                        <Type className="w-3.5 h-3.5 text-[#B28C5A]" />
                        <span>直接生成带字海报</span>
                      </>
                    )}
                  </button>
                </div>

                {onOpenPosterStudio && (
                  <button
                    type="button"
                    onClick={() => onOpenPosterStudio(screenIndex)}
                    className="w-full text-[11px] text-[#8C6F43] hover:text-[#B28C5A] hover:underline text-center pt-1 font-medium transition-colors flex items-center justify-center gap-1"
                  >
                    <span>需要全案图层精调？进入海报工坊编辑器</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}

                {!hasDna && (
                  <div className="flex items-start gap-1.5 p-2 bg-amber-50 text-amber-800 rounded-lg text-[11px] border border-amber-200">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>提示：尚未提取产品 DNA，请上传产品主角图以激活海报生成。</span>
                  </div>
                )}

                {/* Show Result & Review controls if generated */}
                {genImgNode?.data && (
                  <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#E5E0D8] space-y-2.5 text-xs">
                    <div className="flex items-center justify-between font-bold text-[#2C2A29]">
                      <span className="flex items-center gap-1.5 text-xs">
                        <Sparkles className="w-3.5 h-3.5 text-[#B28C5A]" />
                        <span>渲染图 review (v{genImgNode.data.version || 1})</span>
                      </span>
                      {genImgNode.data.reviewStatus === 'approved' && (
                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> 已通过
                        </span>
                      )}
                      {genImgNode.data.reviewStatus === 'rejected' && (
                        <span className="text-[10px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> 未通过
                        </span>
                      )}
                      {genImgNode.data.reviewStatus === 'pendingReview' && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Clock className="w-3 h-3" /> 待审核
                        </span>
                      )}
                    </div>

                    <div
                      className="relative rounded-lg overflow-hidden border border-[#E5E0D8] max-h-[220px] bg-stone-200 flex items-center justify-center"
                      style={{ aspectRatio: getCssAspectRatio(genImgNode.data.aspectRatio as string) }}
                    >
                      <img
                        src={genImgNode.data.imageUrl as string}
                        alt={`分镜 #${screenIndex} 渲染结果`}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <PosterTypographyOverlay
                        screenTitle={(genImgNode.data.screenTitle as string) || `第 ${screenIndex} 屏`}
                        coreSellingPoint={(genImgNode.data.coreSellingPoint as string) || (genImgNode.data.screenTitle as string)}
                        themeTitle={(genImgNode.data.themeTitle as string) || '敏华全案企划'}
                        sceneIndex={screenIndex}
                        imageUrl={genImgNode.data.imageUrl as string}
                        defaultVisible={false}
                      />
                    </div>

                    {/* Review Action Buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => onApproveSceneImage?.(screenIndex)}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 border transition-colors ${
                          genImgNode.data.reviewStatus === 'approved'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white hover:bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span>通过标绿</span>
                      </button>

                      <button
                        onClick={() => {
                          const reason = prompt('请输入该屏画面需要修改或优化的反馈意见：', feedbackInput);
                          if (reason && reason.trim()) {
                            onRejectSceneImage?.(screenIndex, reason.trim());
                          }
                        }}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 border transition-colors ${
                          genImgNode.data.reviewStatus === 'rejected'
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-white hover:bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                        <span>标记问题</span>
                      </button>
                    </div>

                    {/* Feedback Re-generate Trigger */}
                    {genImgNode.data.reviewStatus === 'rejected' && (
                      <div className="space-y-1.5 pt-1 border-t border-[#E5E0D8]">
                        <span className="text-[10px] text-rose-700 font-bold block">
                          修改意见: {genImgNode.data.reviewFeedback || '细节需调整'}
                        </span>
                        <button
                          onClick={() => {
                            if (onGenerateSceneImage) {
                              onGenerateSceneImage(screenIndex, genImgNode.data.reviewFeedback as string);
                            }
                          }}
                          disabled={isGenerating}
                          className="w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>根据反馈重新生成本屏</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Selected GeneratedImageNode Detailed Inspector */}
      {genImgData && selectedNodeId?.startsWith('gen-img-node-') && (
        <div className="p-4 bg-white rounded-2xl border border-[#B28C5A] shadow-md space-y-3">
          <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-2">
            <div className="flex items-center gap-2 text-[#2C2A29]">
              <ImageIcon className="w-4 h-4 text-[#B28C5A]" />
              <span className="font-bold text-sm">
                第 {genImgData.sceneIndex} 屏渲染结果 (v{genImgData.version || 1})
              </span>
            </div>
            {genImgData.reviewStatus === 'approved' && (
              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> 已通过
              </span>
            )}
            {genImgData.reviewStatus === 'rejected' && (
              <span className="text-[10px] font-bold bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <XCircle className="w-3 h-3" /> 未通过
              </span>
            )}
            {genImgData.reviewStatus === 'pendingReview' && (
              <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Clock className="w-3 h-3" /> 待人审
              </span>
            )}
          </div>

          {/* Large Image Preview */}
          <div
            className="relative w-full rounded-xl overflow-hidden border border-[#E5E0D8] bg-stone-100 shadow-inner group flex items-center justify-center"
            style={{ aspectRatio: getCssAspectRatio(genImgData.aspectRatio as string) }}
          >
            <img
              src={genImgData.imageUrl as string}
              alt={genImgData.screenTitle as string}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-md text-white text-[10px] px-2.5 py-1 rounded-full font-mono">
              {genImgData.aspectRatio || '3:4'} · {genImgData.dimensions || '1024x1365'}
            </div>
          </div>

          {/* Metadata & Prompt Parameters */}
          <div className="space-y-2 text-xs text-stone-700 bg-[#FAF8F5] p-3 rounded-xl border border-[#E5E0D8]/80">
            <div>
              <span className="text-[10px] text-stone-400 font-bold block">分镜主题</span>
              <p className="font-bold text-[#2C2A29]">{genImgData.screenTitle as string}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-[#E5E0D8]/60">
              <div>
                <span className="text-[10px] text-stone-400 block">生成模型</span>
                <span className="font-semibold text-[#2C2A29] truncate block">
                  {(genImgData.model as string) || 'openai/gpt-image-2'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-stone-400 block">服务通道</span>
                <span className="font-semibold text-[#2C2A29] truncate block">
                  {(genImgData.provider as string) || 'OpenAI Direct API'}
                </span>
              </div>
            </div>

            <div className="pt-1 border-t border-[#E5E0D8]/60">
              <span className="text-[10px] text-stone-400 font-bold block">完整图片生成 Prompt</span>
              <p className="font-mono text-[10px] leading-relaxed text-[#2C2A29] bg-white p-2 rounded-lg border border-[#E5E0D8] max-h-24 overflow-y-auto mt-0.5">
                {genImgData.prompt as string}
              </p>
            </div>

            {genImgData.negativePrompt && (
              <div className="pt-1 border-t border-[#E5E0D8]/60">
                <span className="text-[10px] text-stone-400 font-bold block">负面约束 (Negative Prompt)</span>
                <p className="font-mono text-[10px] text-stone-600 bg-white p-1.5 rounded-lg border border-[#E5E0D8] mt-0.5">
                  {genImgData.negativePrompt as string}
                </p>
              </div>
            )}
          </div>

          {/* Review Actions & Feedback */}
          <div className="space-y-2 pt-2 border-t border-[#E5E0D8]">
            <div className="flex items-center gap-2">
              <button
                onClick={() => onApproveSceneImage?.(genImgData.sceneIndex as number)}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors ${
                  genImgData.reviewStatus === 'approved'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white hover:bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                <ThumbsUp className="w-4 h-4" />
                <span>标记通过</span>
              </button>

              <button
                onClick={() => {
                  const reason = prompt('请输入该屏画面需要修改或优化的反馈意见：', (genImgData.reviewFeedback as string) || '');
                  if (reason && reason.trim()) {
                    onRejectSceneImage?.(genImgData.sceneIndex as number, reason.trim());
                  }
                }}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors ${
                  genImgData.reviewStatus === 'rejected'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-white hover:bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                <ThumbsDown className="w-4 h-4" />
                <span>标记问题</span>
              </button>
            </div>

            {/* Re-generate trigger for this scene */}
            <button
              onClick={() => {
                if (onGenerateSceneImage) {
                  onGenerateSceneImage(genImgData.sceneIndex as number, genImgData.reviewFeedback as string);
                }
              }}
              disabled={generatingScenes?.has(genImgData.sceneIndex as number)}
              className="w-full py-2.5 px-4 bg-[#B28C5A] hover:bg-[#8C6F43] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {generatingScenes?.has(genImgData.sceneIndex as number) ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在重新生成...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>重新生成第 {genImgData.sceneIndex} 屏图片</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <div className="p-3 bg-white rounded-2xl border border-[#E5E0D8] shadow-sm flex items-start gap-3">
        <Info className="w-4 h-4 text-[#B28C5A] shrink-0 mt-0.5" />
        <div className="text-xs text-stone-600 leading-relaxed">
          <span className="font-bold text-[#2C2A29]">企划指南：</span>
          {uploadState !== 'completed' && '右侧上传产品图以完成 DNA 提取。'}
          {uploadState === 'completed' && !agentRun?.plan && '点击下方【生成全案企划】开启爆款 全案方案策划。'}
          {agentRun?.plan && '点击画布中的分镜节点可在右侧实时调阅与重新策划。'}
        </div>
      </div>

      {/* Context Snapshot Chips Indicator */}
      {(selectedSceneIndex || productDnaVersionCode || assetVersionId) && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FAF8F5] rounded-xl border border-[#E5E0D8]/60 text-[10px] text-stone-600">
          <span className="font-bold text-[#B28C5A]">Context:</span>
          {selectedSceneIndex && (
            <span className="bg-white px-1.5 py-0.5 rounded border border-[#E5E0D8] font-mono">
              屏-{selectedSceneIndex}
            </span>
          )}
          {productDnaVersionCode && (
            <span className="bg-white px-1.5 py-0.5 rounded border border-[#E5E0D8] font-mono">
              {productDnaVersionCode}
            </span>
          )}
          {assetVersionId && (
            <span className="bg-white px-1.5 py-0.5 rounded border border-[#E5E0D8] font-mono">
              SKU-V
            </span>
          )}
        </div>
      )}

      {/* Messages Area */}
      <div className="space-y-4 py-1">
        {messages.map((msg, index) => (
          <div
            key={msg.id ? `${msg.id}-${index}` : `msg-${index}`}
            className={`flex items-start gap-3 ${
              msg.sender === 'user' ? 'flex-row-reverse' : ''
            }`}
          >
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                msg.sender === 'user'
                  ? 'bg-stone-800 text-white shadow-sm'
                  : 'bg-[#F9F5EF] text-[#B28C5A] border border-[#E5E0D8]'
              }`}
            >
              {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div
              className={`max-w-[84%] rounded-2xl p-3.5 text-xs leading-relaxed shadow-sm ${
                msg.sender === 'user'
                  ? 'bg-stone-800 text-white rounded-tr-none'
                  : 'bg-white text-[#2C2A29] border border-[#E5E0D8] rounded-tl-none'
              }`}
            >
              <p className="whitespace-pre-wrap">
                {msg.text || (msg.status === 'streaming' ? '思考回复中...' : '')}
              </p>
              {msg.status === 'streaming' && (
                <div className="flex items-center gap-1.5 mt-2 text-[#B28C5A] font-bold text-[10px]">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Agent G 正在流式生成...</span>
                </div>
              )}
              {msg.status === 'failed' && (
                <div className="mt-2 pt-1.5 border-t border-rose-200/60 flex items-center justify-between">
                  <span className="text-rose-600 font-bold text-[10px]">发送中断 ({msg.error_code || 'ERROR'})</span>
                  {onRetryMessage && (
                    <button
                      type="button"
                      onClick={onRetryMessage}
                      className="px-2 py-0.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded text-[10px] font-bold transition-colors"
                    >
                      重试
                    </button>
                  )}
                </div>
              )}
              <span
                className={`block text-[9px] mt-1.5 ${
                  msg.sender === 'user' ? 'text-stone-400 text-right' : 'text-stone-400'
                }`}
              >
                {msg.timestamp}
              </span>
            </div>
          </div>
        ))}

        {/* Upload Trigger Area */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/png, image/jpeg, image/jpg, image/webp"
          className="hidden"
        />

        {(() => {
          const imgNode = nodes?.find(n => n.id === 'img-node-1' || n.type === 'productImageNode' || n.type === 'productImage');
          const hasImage = !!imgNode?.data?.imageUrl;
          const imageUrl = imgNode?.data?.imageUrl as string;
          const fileName = (imgNode?.data?.fileName as string) || 'product_photo.jpg';

          if (hasImage && uploadState === 'completed') {
            return (
              <div className="p-3 bg-white rounded-2xl border border-[#E5E0D8] shadow-sm my-3 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-[#2C2A29]">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    产品主图已就绪
                  </span>
                  <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    已连通 DNA
                  </span>
                </div>

                <div className="relative w-full h-32 bg-stone-100 rounded-xl overflow-hidden border border-[#E5E0D8] flex items-center justify-center group">
                  <img src={imageUrl} alt={fileName} className="w-full h-full object-contain p-2" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-[#B28C5A] hover:bg-[#9E7A4A] text-white rounded-lg text-xs font-bold shadow-md flex items-center gap-1"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>更换</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-stone-500 pt-1">
                  <span className="truncate max-w-[180px] font-mono">{fileName}</span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[#B28C5A] hover:underline font-bold flex items-center gap-1"
                  >
                    <Upload className="w-3 h-3" />
                    <span>重新上传</span>
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              onClick={() => {
                if (uploadState !== 'uploading' && uploadState !== 'analyzing') {
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file && onUploadFile) {
                  onUploadFile(file);
                }
              }}
              className={`p-4 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center my-3 cursor-pointer group ${
                uploadState === 'uploading' || uploadState === 'analyzing'
                  ? 'border-amber-300 bg-amber-50/40 cursor-wait'
                  : 'border-[#E5E0D8] bg-white/70 hover:bg-white hover:border-[#B28C5A]'
              }`}
            >
              {uploadState === 'uploading' && (
                <div className="flex flex-col items-center py-2">
                  <Loader2 className="w-8 h-8 text-[#B28C5A] animate-spin mb-2" />
                  <p className="text-xs font-bold text-[#2C2A29]">正在上传产品主图...</p>
                </div>
              )}

              {uploadState === 'analyzing' && (
                <div className="flex flex-col items-center py-2">
                  <Sparkles className="w-8 h-8 text-[#B28C5A] animate-pulse mb-2" />
                  <p className="text-xs font-bold text-[#2C2A29]">正在解析 DNA 视觉特征...</p>
                  <p className="text-[10px] text-stone-400 mt-0.5">提取造型、色彩、材质与材质纹理</p>
                </div>
              )}

              {uploadState !== 'uploading' && uploadState !== 'analyzing' && (
                <>
                  <div className="w-10 h-10 rounded-2xl bg-[#F9F5EF] text-[#B28C5A] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform border border-[#E5E0D8]/60">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-[#2C2A29] mb-0.5">
                    {uploadState === 'completed' ? '重新上传产品主角图' : '点击/拖拽上传产品主角图'}
                  </p>
                  <p className="text-[10px] text-stone-400">支持 PNG, JPG, WEBP · 支持 Ctrl+V 粘贴</p>
                </>
              )}
            </div>
          );
        })()}

        {/* Phase C2: Generate Plan Action Button */}
        {uploadState === 'completed' && activeDna && (
          <div className="my-4 p-4 bg-[#F9F5EF] rounded-2xl border border-[#B28C5A]/40 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-[#B28C5A]" />
              <div>
                <h4 className="font-bold text-xs text-[#2C2A29]">{planScreenCount || 1} 屏{planScreenCount === 1 ? '单图' : '全案'}爆款详情页策划</h4>
                <p className="text-[10px] text-stone-500">基于产品 DNA 与行业模型生成视觉企划</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="text-[10px] font-bold text-stone-500">企划方向 / 核心受众 (可选)</span>
                <input
                  type="text"
                  placeholder="例如：母婴喂奶、适老化设计、电竞房搭配..."
                  value={promptValue}
                  onChange={e => handleUpdatePrompt(e.target.value, { mode: 'replace' })}
                  className="w-full rounded-lg border border-[#E5E0D8] bg-white px-2 py-2 text-xs text-[#2C2A29] outline-none focus:border-[#B28C5A] placeholder-stone-400"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] font-bold text-stone-500">企划屏数</span>
                  <select
                    value={planScreenCount || 1}
                    onChange={e => setPlanScreenCount?.(Number(e.target.value))}
                    className="w-full rounded-lg border border-[#E5E0D8] bg-white px-2 py-2 text-[10px] text-[#2C2A29] outline-none focus:border-[#B28C5A]"
                  >
                    <option value={1}>1 屏 (单图传播)</option>
                    <option value={3}>3 屏 (轻量种草)</option>
                    <option value={4}>4 屏 (核心卖点)</option>
                    <option value={6}>6 屏 (精简详情)</option>
                    <option value={9}>9 屏 (完整全案)</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold text-stone-500">目标画面比例</span>
                  <select
                    value={planAspectRatio || '4:3'}
                    onChange={e => setPlanAspectRatio?.(e.target.value)}
                    className="w-full rounded-lg border border-[#E5E0D8] bg-white px-2 py-2 text-[10px] text-[#2C2A29] outline-none focus:border-[#B28C5A]"
                  >
                    <option value="1:1">1:1 (电商主图/方图)</option>
                    <option value="3:4">3:4 (小红书/海报竖版)</option>
                    <option value="4:3">4:3 (横版短图/横屏展厅)</option>
                    <option value="9:16">9:16 (手机全屏竖版)</option>
                    <option value="16:9">16:9 (PC横版/宽屏)</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] font-bold text-stone-500">策划模型</span>
                  <select
                    value={planAgentModel}
                    onChange={event => setPlanAgentModel?.(event.target.value)}
                    className="w-full rounded-lg border border-[#E5E0D8] bg-white px-2 py-2 text-[10px] text-[#2C2A29] outline-none focus:border-[#B28C5A]"
                  >
                    <option value="gemini-3.7-flash">Gemini 3.7 Flash（混合推理·思维链加速）</option>
                    <option value="gpt-6">GPT-6（旗舰全模态 Astra·最强全案企划）</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash（官方原生·快速稳定）</option>
                    <option value="gpt-5.6-sol">GPT-5.6 Sol（旗舰 GPT-5.6 Responses）</option>
                    <option value="gpt-5.5">GPT-5.5</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold text-stone-500">思考等级</span>
                  <select
                    value={planReasoningEffort}
                    onChange={event => setPlanReasoningEffort?.(event.target.value as 'minimal' | 'low' | 'medium' | 'high')}
                    className="w-full rounded-lg border border-[#E5E0D8] bg-white px-2 py-2 text-[10px] text-[#2C2A29] outline-none focus:border-[#B28C5A]"
                  >
                    <option value="minimal">极简 (最快)</option>
                    <option value="low">低 (推荐)</option>
                    <option value="medium">中 (标准深度)</option>
                    <option value="high">高 (极深，容易超时)</option>
                  </select>
                </label>
              </div>

              {/* Optional Search Grounding Toggle in Chat Card */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-stone-100/70 border border-stone-200/60">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={planEnableSearch}
                    onChange={e => setPlanEnableSearch?.(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-[#B28C5A] border-stone-300 focus:ring-[#B28C5A] accent-[#B28C5A] cursor-pointer"
                  />
                  <span className="text-[10px] font-bold text-stone-700 flex items-center gap-1">
                    <Globe className="w-3 h-3 text-[#B28C5A]" />
                    联网检索顾家/乐至宝等竞品命名与排版
                  </span>
                </label>
                <span className="text-[9px] text-stone-400">
                  {planEnableSearch ? '已启用' : '未开启'}
                </span>
              </div>
            </div>

            <button
              onClick={() => onGenerateNineGridPlan()}
              disabled={isPlanGenerating}
              className="w-full py-3 bg-[#B28C5A] hover:bg-[#9E7A4A] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98]"
            >
              {isPlanGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在根据 DNA 生成 {planScreenCount || 1} 屏企划...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{agentRun?.plan ? `重新生成 ${planScreenCount || 1} 屏企划` : `生成 ${planScreenCount || 1} 屏企划`}</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Error Alert if Any */}
        {(errorMessage || planError) && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">操作异常</p>
              <p className="text-[11px] text-rose-700 mt-0.5">{errorMessage || planError}</p>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Fixed Composer Input at Bottom */}
      <div className="p-4 border-t border-[#E5E0D8] bg-white/90 backdrop-blur-md shrink-0">
        <form onSubmit={handleSend} className="relative flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            disabled={isStreaming}
            placeholder={isStreaming ? "智能体正在回复中..." : "描述你希望生成的企划要求或重新策划建议……"}
            className="w-full pl-4 pr-12 py-3 bg-[#F9F5EF]/80 border border-[#E5E0D8] rounded-2xl text-xs text-[#2C2A29] placeholder:text-stone-400 outline-none focus:ring-1 focus:ring-[#B28C5A] focus:border-[#B28C5A] transition-all disabled:opacity-60"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={onStopGenerating}
              className="absolute right-2 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-bold transition-all shadow-sm flex items-center gap-1"
              title="停止生成"
            >
              <Pause className="w-3 h-3" />
              <span>停止</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!inputValue.trim()}
              className="absolute right-2 p-2 bg-[#B28C5A] hover:bg-[#9E7A4A] disabled:opacity-40 text-white rounded-xl transition-all shadow-sm active:scale-95"
              title="发送"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </form>
        <div className="mt-2 text-[10px] text-center text-stone-400 flex items-center justify-center gap-1">
          <CheckCircle className="w-3 h-3 text-emerald-500" />
          <span>MANWAH 视觉企划智能体 · 阶段 C2 企划工作流</span>
        </div>
      </div>

      {/* Full DNA Drawer Overlay inside Agent Panel */}
      {showFullDnaDrawer && activeDna && (
        <div className="absolute inset-0 bg-white z-40 flex flex-col animate-in slide-in-from-right duration-200">
          <div className="p-4 border-b border-[#E5E0D8] flex items-center justify-between bg-[#FDFBF7]">
            <div className="flex items-center gap-2">
              <Dna className="w-5 h-5 text-[#B28C5A]" />
              <h3 className="font-serif font-bold text-sm text-[#2C2A29]">完整 DNA 特征分析</h3>
            </div>
            <button
              onClick={() => setShowFullDnaDrawer(false)}
              className="p-1.5 rounded-xl hover:bg-stone-100 text-stone-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs text-stone-700 custom-scrollbar">
            <div className="bg-[#F9F5EF] p-3 rounded-2xl border border-[#E5E0D8]/60">
              <span className="text-[10px] text-stone-400 font-bold block mb-1">识别品类</span>
              <p className="font-bold text-sm text-[#2C2A29]">{activeDna.category}</p>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-[#E5E0D8]">
              <span className="text-[10px] text-stone-400 font-bold block mb-1">主色与色彩搭配</span>
              <p className="font-medium mb-1">主色: <span className="font-bold text-[#2C2A29]">{activeDna.primaryColor}</span></p>
              {activeDna.secondaryColors?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {activeDna.secondaryColors.map((c, idx) => (
                    <span key={idx} className="bg-stone-100 text-stone-600 text-[10px] px-2 py-0.5 rounded-md border border-[#E5E0D8]">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white p-3 rounded-2xl border border-[#E5E0D8]">
              <span className="text-[10px] text-stone-400 font-bold block mb-1">材质解析</span>
              <div className="flex flex-wrap gap-1">
                {activeDna.materials?.map((mat, idx) => (
                  <span key={idx} className="bg-[#F9F5EF] text-[#B28C5A] text-[10px] px-2 py-0.5 rounded-md font-bold border border-[#E5E0D8]">
                    {mat}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
