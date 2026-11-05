// src/components/creative-canvas/video/VideoCreationPanel.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  CheckCircle2,
  Sparkles,
  Film,
  Video,
  Layers,
  Wand2,
  Clock,
  Play,
  RotateCw,
  AlertCircle,
  ChevronRight,
  ShieldCheck,
  Plus,
  Image as ImageIcon,
  Check,
  Trash2,
  Sliders,
  Cpu,
  Tv
} from 'lucide-react';
import {
  VideoCreationMode,
  VideoStyle,
  VideoSettings,
  VideoDirectorPlan,
  VideoJob,
  VideoShotPlan,
  VideoShotType,
  VideoShotOutline,
  VideoCapability
} from '../../../types/creativeCanvasVideo';
import { useCanvasVideo } from '../../../hooks/useCanvasVideo';
import { VideoGenerationService } from '../../../services/videoGenerationService';

interface VideoCreationPanelProps {
  canvasId: string;
  isOpen: boolean;
  onClose: () => void;
  selectedNode: {
    id: string;
    type: string;
    title: string;
    imageUrl?: string;
    assetVersionId?: string | null;
  } | null;
  allNodes?: any[];
  onPlanCreated?: (plan: VideoDirectorPlan, sourceNodeId: string) => void;
  onJobSubmitted?: (job: VideoJob, sourceNodeId: string) => void;
  /** Agent G 对话中商定的视频创意；nonce 变化时填入创意描述与展示重点 */
  incomingBrief?: {
    videoBrief?: string;
    focusPoints?: string[];
    videoMode?: 'product_showcase' | 'generate_video';
    videoStyle?: 'smart_mix' | 'single_take' | 'outline';
    videoShots?: VideoShotOutline[];
    videoRatio?: string;
    referenceImageUrl?: string;
    nonce: number;
  } | null;
}

const PRESET_FOCUS_POINTS = [
  '整体造型与比例',
  '面料/皮面质感与缝线工艺',
  '人体工学靠包承托',
  '智能电动伸展/零重力仰躺',
  '稳固实木骨架与金属纤细高脚',
  '高回弹海绵与陷入感坐深',
  '极简现代空间整体光影搭配',
  '静音五金导轨平顺开合',
  '360度自由旋转底座'
];

const SHOT_TYPE_LABELS: Record<VideoShotType, string> = {
  hero: '全景亮相',
  function: '功能演示',
  detail: '材质细节',
  closing: '收尾'
};

const DIRECTOR_MODELS = [
  { key: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', desc: 'Google 旗舰多模态 · 精准视觉运镜', tag: '推荐首选' },
  { key: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', desc: 'Google 新一代超高速多模态', tag: '极速出片' },
  { key: 'gpt-6-astra', name: 'GPT-6 Astra', desc: 'OpenAI 旗舰强推理 · 影视级叙事', tag: '强推理' },
  { key: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', desc: 'OpenAI 旗舰基础模型 · 细节严密', tag: '稳定' },
  { key: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', desc: 'OpenAI 轻量高性价比模型', tag: '高性价比' }
];

interface PersistedPanelState {
  activeTab?: VideoCreationMode;
  style?: VideoStyle;
  userPrompt?: string;
  productTitle?: string;
  focusPointsList?: string[];
  selectedFocusPoints?: string[];
  selectedDirectorModel?: string;
  selectedModelKey?: string;
  videoSettings?: VideoSettings;
  directorPlan?: VideoDirectorPlan | null;
  shotOutline?: VideoShotOutline[] | null;
}

/** 模型支持的时长里离目标最近的一个（同样近取较长的，宁可慢一点也不截断动作） */
function snapDuration(cap: VideoCapability | undefined, seconds: number): number {
  const options = Array.from(new Set((cap?.variants || []).map(v => v.durationSeconds))).sort((a, b) => a - b);
  if (options.length === 0) return seconds;
  return options.reduce((best, cur) => {
    const d = Math.abs(cur - seconds);
    const bd = Math.abs(best - seconds);
    return d < bd || (d === bd && cur > best) ? cur : best;
  }, options[0]);
}

/** 镜头时长 + 分辨率 + 比例要落在模型的某个规格上 */
function settingsForShot(cap: VideoCapability | undefined, base: VideoSettings, seconds: number): VideoSettings {
  const durationSeconds = snapDuration(cap, seconds);
  const variants = (cap?.variants || []).filter(v => v.durationSeconds === durationSeconds);
  const resolution = variants.some(v => v.resolution === base.resolution) ? base.resolution : variants[0]?.resolution || base.resolution;
  const variant = variants.find(v => v.resolution === resolution);
  const ratio = !variant || variant.ratios.includes(base.ratio) ? base.ratio : variant.ratios[0] || base.ratio;
  return { ...base, durationSeconds, resolution, ratio };
}

/** 按分镜大纲挑视频模型：比例必须支持，各镜头时长偏差总和最小；同分优先当前模型，其次默认模型 */
function pickModelForOutline(
  caps: VideoCapability[],
  outline: VideoShotOutline[],
  ratio: string | undefined,
  currentKey: string,
  defaultKey: string
): VideoCapability | undefined {
  const usable = caps.filter(c => c.available !== false && c.enabled !== false);
  const pool = usable.filter(c => !ratio || c.variants.some(v => v.ratios.includes(ratio)));
  const candidates = pool.length > 0 ? pool : usable;
  const score = (c: VideoCapability) =>
    outline.reduce((acc, s) => acc + Math.abs(snapDuration(c, s.durationSeconds) - s.durationSeconds), 0);
  return [...candidates].sort((a, b) => {
    const diff = score(a) - score(b);
    if (diff !== 0) return diff;
    const rank = (c: VideoCapability) => (c.key === currentKey ? 0 : c.key === defaultKey ? 1 : 2);
    return rank(a) - rank(b);
  })[0];
}

const panelStateKey = (canvasId: string) => `creative-canvas:video-panel:${canvasId}`;

function loadPanelState(canvasId: string): PersistedPanelState | null {
  if (!canvasId) return null;
  try {
    const raw = localStorage.getItem(panelStateKey(canvasId));
    return raw ? (JSON.parse(raw) as PersistedPanelState) : null;
  } catch {
    return null;
  }
}

function savePanelState(canvasId: string, state: PersistedPanelState) {
  if (!canvasId) return;
  // data: 内联图片动辄数 MB，会撑爆 localStorage 配额，只保留可重新加载的链接
  const stripInline = (url?: string) => (url && url.startsWith('data:') ? undefined : url);
  const directorPlan = state.directorPlan && {
    ...state.directorPlan,
    shots: state.directorPlan.shots.map(shot => ({
      ...shot,
      keyframeImageUrl: stripInline(shot.keyframeImageUrl),
      endFrameImageUrl: stripInline(shot.endFrameImageUrl)
    }))
  };
  try {
    localStorage.setItem(panelStateKey(canvasId), JSON.stringify({ ...state, directorPlan }));
  } catch {
    // 存储不可用（隐私模式 / 配额已满）时仅放弃驻留，不影响面板使用
  }
}

export const VideoCreationPanel: React.FC<VideoCreationPanelProps> = ({
  canvasId,
  isOpen,
  onClose,
  selectedNode,
  allNodes,
  onPlanCreated,
  onJobSubmitted,
  incomingBrief
}) => {
  const {
    capabilities,
    defaultModelKey,
    storageInfo,
    jobs,
    directorPlan,
    setDirectorPlan,
    isGeneratingPlan,
    isSubmittingJob,
    error,
    generatePlan,
    submitVideo,
    retryTransfer
  } = useCanvasVideo(canvasId, isOpen);

  // Tab & Basic state
  const [activeTab, setActiveTab] = useState<VideoCreationMode>('product_showcase');
  const [style, setStyle] = useState<VideoStyle>('single_take');
  const [userPrompt, setUserPrompt] = useState('');
  const [productTitle, setProductTitle] = useState('');

  // Reference Images state (multi-image support & upload)
  const [referenceImages, setReferenceImages] = useState<
    Array<{ id: string; url: string; title: string; assetVersionId?: string }>
  >([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Multi-select Focus Points state
  const [focusPointsList, setFocusPointsList] = useState<string[]>(PRESET_FOCUS_POINTS);
  const [selectedFocusPoints, setSelectedFocusPoints] = useState<string[]>([
    '整体造型与比例',
    '面料/皮面质感与缝线工艺'
  ]);
  const [customFocusInput, setCustomFocusInput] = useState('');
  // AI 扩写状态
  const [isExpandingPrompt, setIsExpandingPrompt] = useState(false);
  const [expandError, setExpandError] = useState<string | null>(null);
  const [expandNote, setExpandNote] = useState<string | null>(null);
  const [promptBeforeExpand, setPromptBeforeExpand] = useState<string | null>(null);
  const [aiFocusPoints, setAiFocusPoints] = useState<string[]>([]);

  // Director LLM Model
  const [selectedDirectorModel, setSelectedDirectorModel] = useState<string>('gemini-3.7-flash');

  // Video Synthesis Model & Settings
  const [selectedModelKey, setSelectedModelKey] = useState<string>(defaultModelKey);
  const [videoSettings, setVideoSettings] = useState<VideoSettings>({
    durationSeconds: 5,
    resolution: '720p',
    ratio: '16:9',
    audioMode: 'none'
  });

  // Keyframe generation tracking state per shot
  const [generatingKeyframeShotId, setGeneratingKeyframeShotId] = useState<string | null>(null);
  const [uploadingEndFrameShotId, setUploadingEndFrameShotId] = useState<string | null>(null);
  const [isBatchSubmitting, setIsBatchSubmitting] = useState(false);
  // 按构思分镜：对话里定好的镜头大纲（镜头数、顺序、每镜时长）
  const [shotOutline, setShotOutline] = useState<VideoShotOutline[] | null>(null);
  const [outlineMatchPending, setOutlineMatchPending] = useState(false);
  const outlineRatioRef = useRef<string | undefined>(undefined);
  const [batchSubmitError, setBatchSubmitError] = useState<string | null>(null);
  const autoFilledTitleRef = useRef<string | null>(null);

  // 面板状态按画布驻留：刷新页面或关闭面板后，分镜方案、尾帧、参数仍在
  // 用 state 而不是 ref 标记恢复完成：恢复出的值要到下一次渲染才生效，同一轮提交里写入会用初始值覆盖存档
  const [hydratedCanvasId, setHydratedCanvasId] = useState<string | null>(null);
  useEffect(() => {
    const saved = loadPanelState(canvasId);
    if (saved) {
      if (saved.activeTab) setActiveTab(saved.activeTab);
      if (saved.style) setStyle(saved.style);
      if (typeof saved.userPrompt === 'string') setUserPrompt(saved.userPrompt);
      if (typeof saved.productTitle === 'string') setProductTitle(saved.productTitle);
      if (Array.isArray(saved.focusPointsList)) setFocusPointsList(saved.focusPointsList);
      if (Array.isArray(saved.selectedFocusPoints)) setSelectedFocusPoints(saved.selectedFocusPoints);
      if (saved.selectedDirectorModel) setSelectedDirectorModel(saved.selectedDirectorModel);
      if (saved.selectedModelKey) setSelectedModelKey(saved.selectedModelKey);
      if (saved.videoSettings) setVideoSettings(saved.videoSettings);
      setShotOutline(Array.isArray(saved.shotOutline) ? saved.shotOutline : null);
    } else {
      setShotOutline(null);
    }
    // 切换到没有存档的画布时清掉上一张画布的方案
    setDirectorPlan(saved?.directorPlan || null);
    setHydratedCanvasId(canvasId);
  }, [canvasId, setDirectorPlan]);

  useEffect(() => {
    // 恢复完成前不写入，避免用初始值覆盖已保存的状态
    if (hydratedCanvasId !== canvasId) return;
    savePanelState(canvasId, {
      activeTab,
      style,
      userPrompt,
      productTitle,
      focusPointsList,
      selectedFocusPoints,
      selectedDirectorModel,
      selectedModelKey,
      videoSettings,
      directorPlan,
      shotOutline
    });
  }, [canvasId, hydratedCanvasId, activeTab, style, userPrompt, productTitle, focusPointsList, selectedFocusPoints, selectedDirectorModel, selectedModelKey, videoSettings, directorPlan, shotOutline]);

  // 填入 Agent G 带来的视频创意：等本画布存档恢复完成后再写，避免被存档覆盖；同一 nonce 只填一次
  const appliedBriefNonceRef = useRef<number | null>(null);
  // 对话里要的是视频分镜：填入创意后自动让 AI 导演出分镜方案（等状态更新后再触发）
  // 用 state 而不是 ref：要等创意、运镜模式、分镜大纲这些状态都提交后，下一次渲染再触发，
  // 否则触发时拿到的还是上一轮的参数（曾因此按旧的智能混剪 + 6 秒出了 5 个镜头）
  const [autoStoryboardPending, setAutoStoryboardPending] = useState(false);
  useEffect(() => {
    if (!incomingBrief || hydratedCanvasId !== canvasId) return;
    if (appliedBriefNonceRef.current === incomingBrief.nonce) return;
    appliedBriefNonceRef.current = incomingBrief.nonce;
    setActiveTab(incomingBrief.videoMode === 'generate_video' ? 'generate_video' : 'product_showcase');
    // 对话里的创意通常按顺序描述多个卖点，默认用多镜头分镜，否则一镜到底只能表现开头和结尾
    const outline = (incomingBrief.videoShots || []).filter(s => s.title && s.content && s.durationSeconds > 0);
    if (incomingBrief.videoMode !== 'generate_video') {
      setStyle(
        outline.length > 0 && incomingBrief.videoStyle !== 'single_take'
          ? 'outline'
          : incomingBrief.videoStyle === 'outline'
          ? 'smart_mix'
          : incomingBrief.videoStyle || 'smart_mix'
      );
    }
    setShotOutline(outline.length > 0 ? outline : null);
    // 模型匹配要等能力列表加载完成，见下方 effect
    outlineRatioRef.current = incomingBrief.videoRatio;
    setOutlineMatchPending(outline.length > 0);
    if (incomingBrief.referenceImageUrl) {
      setReferenceImages([{ id: `chat-ref-${incomingBrief.nonce}`, url: incomingBrief.referenceImageUrl, title: '对话里发的参考图' }]);
    }
    if (incomingBrief.videoBrief) {
      setPromptBeforeExpand(userPrompt);
      setUserPrompt(incomingBrief.videoBrief);
    }
    const points = incomingBrief.focusPoints || [];
    if (points.length > 0) {
      setFocusPointsList(prev => [...points.filter(p => !prev.includes(p)), ...prev]);
      setSelectedFocusPoints(points);
      setAiFocusPoints(points);
    }
    setExpandError(null);
    const autoStoryboard =
      incomingBrief.videoMode !== 'generate_video' && (Boolean(incomingBrief.videoBrief) || outline.length > 0);
    setAutoStoryboardPending(autoStoryboard);
    setExpandNote(
      autoStoryboard
        ? `已填入 Agent G 对话中的视频创意${outline.length > 0 ? `（${outline.length} 个镜头）` : ''}${points.length > 0 ? `与 ${points.length} 个展示重点` : ''}，AI 导演正在生成分镜方案`
        : `已填入 Agent G 对话中的视频创意${points.length > 0 ? `与 ${points.length} 个展示重点` : ''}，可调整后${
            incomingBrief.videoMode === 'generate_video' ? '直接生成视频' : '生成分镜方案'
          }`
    );
    // userPrompt 只用于记录填入前的内容，不作为触发条件
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingBrief, hydratedCanvasId, canvasId]);

  // Sync selectedNode image to reference images if not already present
  useEffect(() => {
    if (selectedNode?.imageUrl) {
      // 不预设材质：导演会看图识别，写死“真皮”会让布艺产品被往皮质方向改画
      let finalTitle = '';
      const nodeTitle = selectedNode.title || '';
      
      const isPlaceholderId = 
        nodeTitle.startsWith('node-') || 
        nodeTitle.startsWith('img-node-') || 
        nodeTitle.startsWith('asset-') || 
        nodeTitle.startsWith('ref-') ||
        nodeTitle.match(/^[a-z0-9-_]{8,}$/i);

      if (nodeTitle && !isPlaceholderId) {
        finalTitle = nodeTitle;
      }

      // 顺藤摸瓜：扫描 allNodes 寻找 Product DNA 节点提取核心描述
      if (allNodes && allNodes.length > 0) {
        const dnaNode = allNodes.find(n => n.type === 'productDnaNode' || n.id === 'dna-node-1');
        if (dnaNode?.data?.dna) {
          const dna = dnaNode.data.dna;
          const tone = dna.primaryColor || '';
          const category = dna.category || '沙发';
          const materials = Array.isArray(dna.materials) ? dna.materials.slice(0, 3).join(' ') : '';
          const style = Array.isArray(dna.style) ? dna.style[0] || '' : '';
          
          if (tone || category || materials) {
            finalTitle = `${tone} ${materials} ${style}${category}`.replace(/\s+/g, ' ').trim();
          }
        }
      }

      // 只覆盖空标题或上次自动填入的标题，用户手填 / 刷新后恢复的标题保留
      setProductTitle(prev => {
        const next = !prev || prev === autoFilledTitleRef.current ? finalTitle : prev;
        autoFilledTitleRef.current = finalTitle;
        return next;
      });
      setReferenceImages(prev => {
        const exists = prev.some(img => img.url === selectedNode.imageUrl);
        if (exists) return prev;
        return [
          {
            id: `node-${selectedNode.id}`,
            url: selectedNode.imageUrl!,
            title: finalTitle,
            assetVersionId: selectedNode.assetVersionId || undefined
          },
          ...prev
        ];
      });
    }
  }, [selectedNode, allNodes]);

  // 镜头按面板所选时长提交生成：时长（或切换模型导致的时长）变化时同步到已有分镜方案的展示
  useEffect(() => {
    // 按构思分镜的每个镜头时长各不相同，不跟随面板时长
    if (style === 'outline') return;
    const durationSeconds = videoSettings.durationSeconds;
    setDirectorPlan(prev => {
      if (!prev || prev.shots.every(shot => shot.durationSeconds === durationSeconds)) return prev;
      return {
        ...prev,
        shots: prev.shots.map(shot => ({ ...shot, durationSeconds })),
        estimatedDurationSeconds: durationSeconds * prev.shots.length
      };
    });
  }, [videoSettings.durationSeconds, style, setDirectorPlan]);

  // 按大纲匹配视频模型与参数：比例、各镜头时长都要落在模型支持的规格上；有调整就如实写在提示里
  useEffect(() => {
    if (!outlineMatchPending || !shotOutline || capabilities.length === 0) return;
    const ratio = outlineRatioRef.current;
    const cap = pickModelForOutline(capabilities, shotOutline, ratio, selectedModelKey, defaultModelKey);
    setOutlineMatchPending(false);
    if (!cap) return;
    const snapped = shotOutline.map(s => ({ ...s, durationSeconds: snapDuration(cap, s.durationSeconds) }));
    const changes = shotOutline
      .map((s, i) =>
        snapped[i].durationSeconds !== s.durationSeconds ? `镜头${i + 1} ${s.durationSeconds}s→${snapped[i].durationSeconds}s` : ''
      )
      .filter(Boolean);
    setShotOutline(snapped);
    setSelectedModelKey(cap.key);
    const ratioOk = Boolean(ratio) && cap.variants.some(v => v.ratios.includes(ratio!));
    setVideoSettings(prev => settingsForShot(cap, { ...prev, ratio: ratioOk ? ratio! : prev.ratio }, snapped[0].durationSeconds));
    const total = snapped.reduce((acc, s) => acc + s.durationSeconds, 0);
    setExpandNote(
      `按对话分镜：${snapped.length} 个镜头共 ${total} 秒，视频模型匹配为 ${cap.displayName}` +
        (ratio ? (ratioOk ? `，比例 ${ratio}` : `，该模型不支持 ${ratio}，沿用当前比例`) : '') +
        (changes.length > 0 ? `；模型不支持的时长已就近调整（${changes.join('、')}）` : '') +
        '。AI 导演正在补全每个镜头的提示词'
    );
  }, [outlineMatchPending, shotOutline, capabilities, selectedModelKey, defaultModelKey]);

  // 没选参考图也没选中节点时，默认用画布上的产品主图
  const fallbackProductImage = (() => {
    const node = (allNodes || []).find(
      n => n?.type === 'productImageNode' && typeof n?.data?.imageUrl === 'string' && n.data.imageUrl
    );
    return node
      ? { id: `node-${node.id}`, url: String(node.data.imageUrl), title: '产品主图', assetVersionId: node.data.assetVersionId || undefined }
      : null;
  })();

  // Sync video model
  useEffect(() => {
    if (capabilities.length > 0) {
      // 当前选择不存在或令牌未开通时，回落到默认模型 / 第一个可用模型
      const usable = capabilities.filter(c => c.available !== false);
      const pool = usable.length > 0 ? usable : capabilities;
      if (!selectedModelKey || !pool.some(c => c.key === selectedModelKey)) {
        const nextKey = pool.some(c => c.key === defaultModelKey) ? defaultModelKey : pool[0].key;
        setSelectedModelKey(nextKey);
      }
    }
  }, [capabilities, defaultModelKey, selectedModelKey]);

  // 自动出分镜要在 isOpen 提前返回之前注册，保证每次渲染的 hook 数量一致
  const handleGeneratePlanRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!isOpen || !autoStoryboardPending || isGeneratingPlan || activeTab !== 'product_showcase' || outlineMatchPending) return;
    if (!selectedNode && referenceImages.length === 0 && !fallbackProductImage) {
      setAutoStoryboardPending(false);
      setExpandNote('已填入 Agent G 对话中的视频创意。请先选择一张产品参考图，再点击生成分镜方案');
      return;
    }
    setAutoStoryboardPending(false);
    handleGeneratePlanRef.current?.();
  }, [isOpen, autoStoryboardPending, userPrompt, selectedFocusPoints, activeTab, style, isGeneratingPlan, selectedNode, referenceImages.length, outlineMatchPending, fallbackProductImage?.url]);

  if (!isOpen) return null;

  const currentCapability = capabilities.find(c => c.key === selectedModelKey) || capabilities[0];

  // Handle uploading local reference image
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    try {
      const res = await VideoGenerationService.uploadReferenceImage(file);
      const newImg = {
        id: `upload-${Date.now()}`,
        url: res.url,
        title: file.name,
        assetVersionId: res.assetVersionId
      };
      setReferenceImages(prev => [...prev, newImg]);
    } catch (err: any) {
      alert(`参考图上传失败: ${err.message || '未知错误'}`);
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveReferenceImage = (id: string) => {
    setReferenceImages(prev => prev.filter(img => img.id !== id));
  };

  // Focus points toggle
  const handleToggleFocusPoint = (point: string) => {
    setSelectedFocusPoints(prev =>
      prev.includes(point) ? prev.filter(p => p !== point) : [...prev, point]
    );
  };

  const handleAddCustomFocusPoint = () => {
    const trimmed = customFocusInput.trim();
    if (!trimmed) return;
    if (!focusPointsList.includes(trimmed)) {
      setFocusPointsList(prev => [...prev, trimmed]);
    }
    if (!selectedFocusPoints.includes(trimmed)) {
      setSelectedFocusPoints(prev => [...prev, trimmed]);
    }
    setCustomFocusInput('');
  };

  // AI 扩写：多模态大模型看产品图，结合原始描述、展示重点、视频模型与时长改写；同时按图推荐展示重点
  const handleExpandPrompt = async () => {
    if (isExpandingPrompt) return;
    const imageUrl = referenceImages[0]?.url || selectedNode?.imageUrl;
    const capability = capabilities.find(c => c.key === selectedModelKey) || capabilities[0];
    setIsExpandingPrompt(true);
    setExpandError(null);
    setExpandNote(null);
    try {
      const result = await VideoGenerationService.expandPrompt({
        mode: activeTab === 'product_showcase' ? 'product_showcase' : 'generate_video',
        userPrompt,
        productTitle: productTitle || selectedNode?.title,
        focusPoints: selectedFocusPoints,
        imageUrl,
        durationSeconds: videoSettings.durationSeconds,
        videoModelName: capability?.displayName,
        supportsLastFrame: Boolean(capability?.modes.includes('first_last_frame')),
        directorModelKey: selectedDirectorModel
      });
      setPromptBeforeExpand(userPrompt);
      setUserPrompt(result.prompt);
      const fresh = result.suggestedFocusPoints.filter(p => !focusPointsList.includes(p));
      if (fresh.length > 0) {
        setFocusPointsList(prev => [...fresh, ...prev.filter(p => !fresh.includes(p))]);
        setAiFocusPoints(fresh);
      }
      setExpandNote(
        `已由 ${result.model} ${result.usedImage ? '看图' : '仅按文字（没有可用的产品图）'}改写` +
          (fresh.length > 0 && activeTab === 'product_showcase'
            ? `，并${result.usedImage ? '按产品图' : ''}补充了 ${fresh.length} 个展示重点（✦ 标记）`
            : '')
      );
    } catch (err: any) {
      setExpandError(err?.message || '扩写失败，请稍后重试');
    } finally {
      setIsExpandingPrompt(false);
    }
  };

  const handleUndoExpand = () => {
    if (promptBeforeExpand === null) return;
    setUserPrompt(promptBeforeExpand);
    setPromptBeforeExpand(null);
    setExpandNote(null);
  };

  // Generate Director Brief
  const handleGeneratePlan = async () => {
    if (!selectedNode && referenceImages.length === 0 && !fallbackProductImage) return;
    const primaryImg =
      referenceImages[0] ||
      (selectedNode?.imageUrl
        ? { id: `node-${selectedNode.id}`, url: selectedNode.imageUrl, title: selectedNode.title, assetVersionId: selectedNode.assetVersionId || undefined }
        : undefined) ||
      fallbackProductImage ||
      undefined;
    const effectiveRefs = referenceImages.length > 0 ? referenceImages : fallbackProductImage ? [fallbackProductImage] : [];

    const plan = await generatePlan({
      mode: activeTab,
      style,
      userPrompt: userPrompt.trim() || '产品全景微移，展现高端居家光影质感',
      focusPoints: selectedFocusPoints,
      focusPoint: selectedFocusPoints.join('、'),
      sourceAssetVersionId: primaryImg?.assetVersionId || selectedNode?.assetVersionId,
      sourceImageUrl: primaryImg?.url,
      directorModelKey: selectedDirectorModel,
      referenceImages: effectiveRefs.map(img => ({ url: img.url, title: img.title })),
      productTitle: productTitle || selectedNode?.title,
      productCategory: '家具',
      targetDurationSeconds: videoSettings.durationSeconds,
      // 让导演知道生成端：模型能力决定是否安排依赖尾帧的功能镜头
      videoModelName: currentCapability?.displayName,
      supportsLastFrame: Boolean(currentCapability?.modes.includes('first_last_frame')),
      ...(style === 'outline' && shotOutline?.length ? { shotOutline } : {})
    });

    if (onPlanCreated && selectedNode) {
      onPlanCreated(plan, selectedNode.id);
    }
  };
  handleGeneratePlanRef.current = () => { void handleGeneratePlan(); };

  // Generate Static Keyframe image for single shot
  const handleGenerateKeyframe = async (shot: VideoShotPlan) => {
    setGeneratingKeyframeShotId(shot.shotId);
    try {
      const primaryUrl = referenceImages[0]?.url || selectedNode?.imageUrl;
      const res = await VideoGenerationService.generateShotKeyframe({
        canvasId,
        shotId: shot.shotId,
        prompt: shot.prompt,
        referenceImageUrl: primaryUrl,
        productTitle: productTitle || selectedNode?.title || ''
      });

      if (directorPlan) {
        const updatedShots = directorPlan.shots.map(s =>
          s.shotId === shot.shotId ? { ...s, keyframeImageUrl: res.keyframeUrl } : s
        );
        setDirectorPlan({ ...directorPlan, shots: updatedShots });
      }
    } catch (err: any) {
      alert(`生成镜头关键帧失败: ${err.message || '未知错误'}`);
    } finally {
      setGeneratingKeyframeShotId(null);
    }
  };

  // Submit single shot video generation
  const supportsLastFrame = Boolean(currentCapability?.modes.includes('first_last_frame'));

  // 为功能镜头上传“动作完成态”尾帧
  const handleUploadEndFrame = async (shotId: string, file: File) => {
    setUploadingEndFrameShotId(shotId);
    try {
      const res = await VideoGenerationService.uploadReferenceImage(file);
      setDirectorPlan(prev => prev && {
        ...prev,
        shots: prev.shots.map(s => (s.shotId === shotId ? { ...s, endFrameImageUrl: res.url } : s))
      });
    } catch (err: any) {
      alert(`尾帧上传失败: ${err.message || '未知错误'}`);
    } finally {
      setUploadingEndFrameShotId(null);
    }
  };

  const handleRemoveEndFrame = (shotId: string) => {
    setDirectorPlan(prev => prev && {
      ...prev,
      shots: prev.shots.map(s => (s.shotId === shotId ? { ...s, endFrameImageUrl: undefined } : s))
    });
  };

  const handleSubmitDirectVideo = async (
    shotPrompt?: string,
    shotId?: string,
    keyframeUrl?: string,
    endFrameUrl?: string,
    shotDurationSeconds?: number
  ) => {
    if (!selectedNode && referenceImages.length === 0 && !fallbackProductImage) return;
    const finalPrompt = shotPrompt || userPrompt || '产品静止，镜头缓慢平移，光影自然流动';
    const effectiveImageUrl = keyframeUrl || referenceImages[0]?.url || selectedNode?.imageUrl || fallbackProductImage?.url;
    // 按构思分镜时每个镜头按自己的时长生成（就近落到模型支持的规格）
    const settings =
      style === 'outline' && shotDurationSeconds ? settingsForShot(currentCapability, videoSettings, shotDurationSeconds) : videoSettings;

    const job = await submitVideo({
      sourceNodeId: selectedNode?.id || 'ref-upload',
      sourceAssetVersionId: selectedNode?.assetVersionId,
      sourceImageUrl: effectiveImageUrl,
      // 尾帧仅对支持首尾帧的模型生效；不支持时面板会提示切换模型
      lastFrameImageUrl: endFrameUrl && supportsLastFrame ? endFrameUrl : undefined,
      mode: activeTab,
      style,
      modelKey: selectedModelKey,
      settings,
      prompt: finalPrompt,
      shotId
    });

    // 仅用上传参考图提交时也要在画布上落任务节点（无源节点时不连线）
    onJobSubmitted?.(job, selectedNode?.id || '');
    return job;
  };

  const handleSubmitDirectVideoClick = async (shotPrompt?: string, shotId?: string, keyframeUrl?: string, endFrameUrl?: string, shotDurationSeconds?: number) => {
    try {
      await handleSubmitDirectVideo(shotPrompt, shotId, keyframeUrl, endFrameUrl, shotDurationSeconds);
    } catch {
      // 错误已由 useCanvasVideo 写入 error 状态并在面板展示
    }
  };

  // Batch submit all shots in director plan
  const handleBatchSubmitAllShots = async () => {
    if (!directorPlan || directorPlan.shots.length === 0) return;
    setIsBatchSubmitting(true);
    setBatchSubmitError(null);
    const failedShots: string[] = [];
    try {
      // 单个镜头失败不影响后续镜头提交
      for (const shot of directorPlan.shots) {
        try {
          await handleSubmitDirectVideo(shot.prompt, shot.shotId, shot.keyframeImageUrl, shot.endFrameImageUrl, shot.durationSeconds);
        } catch (err: any) {
          console.warn(`Batch submit failed for shot ${shot.shotId}:`, err);
          failedShots.push(shot.title || shot.shotId);
        }
      }
      if (failedShots.length > 0) {
        setBatchSubmitError(`${failedShots.length} 个镜头提交失败：${failedShots.join('、')}`);
      }
    } finally {
      setIsBatchSubmitting(false);
    }
  };

  return (
    <aside
      id="video-creation-panel"
      className="fixed top-14 right-0 bottom-0 w-[440px] bg-white border-l border-neutral-200 shadow-2xl z-40 flex flex-col font-sans"
    >
      {/* Hidden file input for uploading reference image */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-100 bg-neutral-50/80">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-purple-600" />
          <span className="text-xs text-neutral-400 font-medium">万能画布</span>
          <span className="text-xs text-neutral-300">/</span>
          <span className="text-sm font-semibold text-neutral-900">影视级视频创作</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/50 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mode Tabs */}
      <div className="flex items-center border-b border-neutral-200 px-4 mt-2">
        <button
          onClick={() => setActiveTab('product_showcase')}
          className={`pb-2.5 pt-1 px-3 text-xs font-medium border-b-2 transition ${
            activeTab === 'product_showcase'
              ? 'border-purple-600 text-purple-700 font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          产品展示 (AI导演脚本)
        </button>
        <button
          onClick={() => setActiveTab('generate_video')}
          className={`pb-2.5 pt-1 px-3 text-xs font-medium border-b-2 transition ${
            activeTab === 'generate_video'
              ? 'border-purple-600 text-purple-700 font-semibold'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          直接生成视频
        </button>
        <div className="pb-2.5 pt-1 px-2 text-xs font-medium text-neutral-300 flex items-center gap-1 cursor-not-allowed">
          <span>带货视频</span>
          <span className="text-[9px] px-1 py-0.2 bg-neutral-100 text-neutral-400 rounded">V2</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Style Selector (Only for product_showcase) */}
        {activeTab === 'product_showcase' && (
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1.5">运镜模式</label>
            <div className={`grid ${shotOutline?.length ? 'grid-cols-3' : 'grid-cols-2'} gap-2 bg-neutral-100 p-1 rounded-lg`}>
              <button
                type="button"
                onClick={() => setStyle('single_take')}
                className={`py-1.5 px-3 rounded text-xs font-medium transition ${
                  style === 'single_take'
                    ? 'bg-white text-purple-900 shadow-sm font-semibold'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                一镜到底 (连贯大景深)
              </button>
              <button
                type="button"
                onClick={() => setStyle('smart_mix')}
                className={`py-1.5 px-3 rounded text-xs font-medium transition ${
                  style === 'smart_mix'
                    ? 'bg-white text-purple-900 shadow-sm font-semibold'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                智能混剪 (3分镜细节特写)
              </button>
              {shotOutline?.length ? (
                <button
                  type="button"
                  onClick={() => setStyle('outline')}
                  className={`py-1.5 px-3 rounded text-xs font-medium transition ${
                    style === 'outline'
                      ? 'bg-white text-purple-900 shadow-sm font-semibold'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                  title="镜头数、顺序和每个镜头的时长按对话里定的分镜执行"
                >
                  按构思分镜 ({shotOutline.length}镜 · {shotOutline.reduce((acc, s) => acc + s.durationSeconds, 0)}s)
                </button>
              ) : null}
            </div>
          </div>
        )}

        {/* Reference Images Section */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-neutral-700 flex items-center gap-1">
              <span>参考商品图片</span>
              <span className="text-[11px] text-neutral-400 font-normal">
                {referenceImages.length > 0
                  ? `(${referenceImages.length} 张已选)`
                  : fallbackProductImage && !selectedNode
                  ? '(未选择，默认用画布产品主图)'
                  : '(0 张已选)'}
              </span>
            </label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingImage}
              className="inline-flex items-center gap-1 text-[11px] text-purple-600 hover:text-purple-800 font-medium"
            >
              {isUploadingImage ? (
                <>
                  <RotateCw className="w-3 h-3 animate-spin" />
                  <span>上传中...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3 h-3" />
                  <span>添加参考图</span>
                </>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {referenceImages.map((img, idx) => (
              <div
                key={img.id}
                className="group relative flex items-center gap-2 p-1.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg transition"
              >
                <img
                  src={img.url}
                  alt={img.title}
                  className="w-9 h-9 rounded object-cover border border-neutral-300 shadow-2xs"
                />
                <div className="min-w-0 pr-5">
                  <div className="text-[11px] font-medium text-neutral-800 truncate max-w-[110px]">
                    {img.title || `@参考图 ${idx + 1}`}
                  </div>
                  <div className="text-[9px] text-emerald-600 font-mono">
                    {idx === 0 ? '首选主图' : '辅视图'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveReferenceImage(img.id)}
                  className="absolute top-1 right-1 p-0.5 text-neutral-400 hover:text-rose-600 rounded"
                  title="移除此图"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}

            {referenceImages.length === 0 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-3 border border-dashed border-neutral-300 hover:border-purple-400 rounded-lg text-xs text-neutral-500 hover:text-purple-700 flex items-center justify-center gap-1.5 transition bg-neutral-50/50"
              >
                <ImageIcon className="w-4 h-4 text-neutral-400" />
                <span>点击添加商品参考图 (支持电脑本地图片)</span>
              </button>
            )}
          </div>
        </div>

        {/* Product Title / DNA */}
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">商品名称与品类特征</label>
          <input
            type="text"
            value={productTitle}
            onChange={e => setProductTitle(e.target.value)}
            placeholder="例如：现代意式轻奢真皮功能沙发"
            className="w-full text-xs px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600"
          />
        </div>

        {/* Focus Points (Multi-select Chips) */}
        {activeTab === 'product_showcase' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-neutral-700 flex items-center gap-1">
                <span>展示重点 (多选)</span>
                <span className="text-[11px] text-neutral-400 font-normal">
                  已选 {selectedFocusPoints.length} 项
                </span>
              </label>
              <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded font-medium">
                将深度对齐运镜分镜
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {focusPointsList.map(point => {
                const isSelected = selectedFocusPoints.includes(point);
                return (
                  <button
                    key={point}
                    type="button"
                    onClick={() => handleToggleFocusPoint(point)}
                    className={`text-xs px-2.5 py-1 rounded-md transition flex items-center gap-1 border ${
                      isSelected
                        ? 'bg-purple-50 text-purple-800 border-purple-300 font-medium shadow-2xs'
                        : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:text-neutral-900'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-purple-600 stroke-[3]" />}
                    {!isSelected && aiFocusPoints.includes(point) && <Sparkles className="w-3 h-3 text-purple-400" />}
                    <span>{point}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom Focus Point input */}
            <div className="flex items-center gap-1.5 pt-1">
              <input
                type="text"
                value={customFocusInput}
                onChange={e => setCustomFocusInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCustomFocusPoint())}
                placeholder="+ 输入自定义展示重点 (回车添加)"
                className="flex-1 text-xs px-2.5 py-1.5 border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-600"
              />
              <button
                type="button"
                onClick={handleAddCustomFocusPoint}
                className="px-2.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-md text-xs font-medium transition"
              >
                添加
              </button>
            </div>
          </div>
        )}

        {/* Script / Director LLM Model Selector */}
        {activeTab === 'product_showcase' && (
          <div className="pt-2 border-t border-neutral-100">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-neutral-700 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-purple-600" />
                <span>分镜文案模型 (Director LLM)</span>
              </label>
              <span className="text-[10px] text-neutral-400">词元流墟高规格通道</span>
            </div>

            <select
              value={selectedDirectorModel}
              onChange={e => setSelectedDirectorModel(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600 bg-white"
            >
              {DIRECTOR_MODELS.map(m => (
                <option key={m.key} value={m.key}>
                  {m.name} [{m.tag}] - {m.desc}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Video Prompt */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-neutral-700">创意描述 / 运镜定制要求</label>
            <button
              type="button"
              onClick={handleExpandPrompt}
              disabled={isExpandingPrompt}
              title="由大模型看产品图，结合展示重点、视频模型与时长改写"
              className="inline-flex items-center gap-1 text-[11px] text-purple-600 hover:text-purple-800 disabled:opacity-60 font-medium"
            >
              {isExpandingPrompt ? <RotateCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              <span>{isExpandingPrompt ? 'AI 正在看图改写…' : 'AI扩写融合重点'}</span>
            </button>
          </div>
          <textarea
            rows={3}
            value={userPrompt}
            onChange={e => setUserPrompt(e.target.value)}
            placeholder="描述你想呈现的镜头画面，如：镜头缓慢向右平移，室内晨光洒在沙发扶手边缘..."
            className="w-full text-xs p-3 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600 resize-none leading-relaxed"
          />
          {(expandNote || expandError) && (
            <div className={`mt-1 flex items-center justify-between gap-2 text-[11px] ${expandError ? 'text-red-600' : 'text-neutral-500'}`}>
              <span>{expandError || expandNote}</span>
              {!expandError && promptBeforeExpand !== null && (
                <button type="button" onClick={handleUndoExpand} className="shrink-0 text-purple-600 hover:text-purple-800 font-medium">
                  撤销改写
                </button>
              )}
            </div>
          )}
        </div>

        {/* Video Synthesis Model and Settings (For direct or fine-tuning) */}
        <div className="space-y-3 pt-2 border-t border-neutral-100">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1 flex items-center gap-1.5">
              <Tv className="w-3.5 h-3.5 text-neutral-600" />
              <span>视频生成模型 (Video Engine)</span>
            </label>
            <select
              value={selectedModelKey}
              onChange={e => {
                const newKey = e.target.value;
                setSelectedModelKey(newKey);
                const newCap = capabilities.find(c => c.key === newKey);
                if (newCap && newCap.variants.length > 0) {
                  const firstVar = newCap.variants[0];
                  setVideoSettings(prev => ({
                    ...prev,
                    durationSeconds: firstVar.durationSeconds,
                    resolution: firstVar.resolution
                  }));
                }
              }}
              className="w-full text-xs px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-600 bg-white"
            >
              {capabilities.map(cap => (
                <option key={cap.key} value={cap.key} disabled={cap.available === false}>
                  {cap.displayName} ({cap.exactModelId}){cap.available === false ? ' · 令牌未开通' : ''}
                </option>
              ))}
            </select>
            {currentCapability && (
              <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-500">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className={`w-3 h-3 ${currentCapability.tested ? 'text-emerald-600' : 'text-amber-500'}`} />
                  <span>实测状态: {currentCapability.tested ? '测试通过' : '可用'}</span>
                </div>
                {currentCapability.key.startsWith('sd-') && (
                  <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[9px] font-medium">
                    推荐 · 秒级出片
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-neutral-500 mb-1">时长</label>
              <select
                value={videoSettings.durationSeconds}
                onChange={e =>
                  setVideoSettings(prev => ({ ...prev, durationSeconds: Number(e.target.value) }))
                }
                className="w-full text-xs px-2.5 py-1.5 border border-neutral-200 rounded-md bg-white"
              >
                {(() => {
                  const durations = Array.from(
                    new Set((currentCapability?.variants || []).map(v => v.durationSeconds))
                  ).sort((a, b) => a - b);
                  const validDurations = durations.length > 0 ? durations : [5, 10];
                  return validDurations.map(sec => (
                    <option key={sec} value={sec}>
                      {sec} 秒
                    </option>
                  ));
                })()}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-neutral-500 mb-1">分辨率</label>
              <select
                value={videoSettings.resolution}
                onChange={e =>
                  setVideoSettings(prev => ({ ...prev, resolution: e.target.value }))
                }
                className="w-full text-xs px-2.5 py-1.5 border border-neutral-200 rounded-md bg-white"
              >
                {(() => {
                  const resolutions = Array.from(
                    new Set((currentCapability?.variants || []).map(v => v.resolution))
                  );
                  const validResolutions = resolutions.length > 0 ? resolutions : ['720p', '1080p'];
                  return validResolutions.map(res => (
                    <option key={res} value={res}>
                      {res === '1080p' ? '1080p 超清' : `${res} 高清`}
                    </option>
                  ));
                })()}
              </select>
            </div>
          </div>
        </div>

        {/* Director Brief Plan Display */}
        {directorPlan && (
          <div className="pt-3 border-t border-neutral-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-900 flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-purple-600" />
                <span>导演分镜方案 ({directorPlan.shots.length} 个镜头)</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 bg-purple-50 text-purple-700 font-medium rounded-full">
                总长 {directorPlan.estimatedDurationSeconds}s · 模型: {directorPlan.directorModel}
              </span>
            </div>

            <p className="text-[11px] text-neutral-600 leading-relaxed bg-neutral-50 p-2.5 rounded-lg border border-neutral-100">
              {directorPlan.summary}
            </p>

            {directorPlan.productFacts && (
              <div className="text-[10px] text-neutral-600 bg-emerald-50/60 border border-emerald-100 rounded-lg p-2 space-y-0.5">
                <div>
                  <span className="text-neutral-500">看图识别：</span>
                  {[directorPlan.productFacts.color, directorPlan.productFacts.material, directorPlan.productFacts.category].filter(Boolean).join(' · ')}
                </div>
                {directorPlan.productFacts.functions.length > 0 && (
                  <div><span className="text-neutral-500">功能：</span>{directorPlan.productFacts.functions.join('、')}</div>
                )}
              </div>
            )}

            {/* Invariants */}
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-neutral-500">产品保真与运镜准则:</span>
              {directorPlan.lockedRules.slice(0, 3).map((rule, idx) => (
                <div key={idx} className="flex items-start gap-1 text-[10px] text-neutral-600">
                  <span className="text-emerald-600 font-bold">•</span>
                  <span>{rule}</span>
                </div>
              ))}
            </div>

            {/* Shots List */}
            <div className="space-y-2.5">
              {directorPlan.shots.map(shot => {
                const isGeneratingKeyframe = generatingKeyframeShotId === shot.shotId;
                return (
                  <div
                    key={shot.shotId}
                    className="p-3 border border-neutral-200 rounded-lg space-y-2 bg-white shadow-2xs hover:border-purple-200 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-neutral-900">
                        {shot.order}. {shot.title}
                      </span>
                      <span className="text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded font-mono">
                        {shot.durationSeconds}s
                      </span>
                    </div>

                    <div className="text-[10px] text-neutral-500 grid grid-cols-2 gap-1.5 bg-neutral-50 p-1.5 rounded">
                      <div>构图: <span className="text-neutral-700">{shot.composition}</span></div>
                      <div>运镜: <span className="text-neutral-700">{shot.cameraMotion}</span></div>
                    </div>

                    {(shot.cameraLocked || shot.shotType) && (
                      <div className="flex flex-wrap gap-1">
                        {shot.shotType && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
                            {SHOT_TYPE_LABELS[shot.shotType]}
                          </span>
                        )}
                        {shot.cameraLocked && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">机位锁定</span>
                        )}
                      </div>
                    )}

                    {shot.firstFrameHint && (
                      <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded p-1.5">
                        首帧建议：{shot.firstFrameHint}
                      </div>
                    )}

                    {shot.needsEndFrame && (
                      <div className="space-y-1.5 border border-dashed border-purple-200 rounded p-1.5">
                        <div className="text-[10px] text-neutral-600">
                          <span className="font-medium text-purple-700">尾帧（动作完成态）：</span>
                          {shot.endFrameHint || '请上传动作完成后的实拍图，与首帧同机位'}
                        </div>
                        {shot.endFrameImageUrl ? (
                          <div className="relative rounded overflow-hidden border border-purple-200">
                            <img src={shot.endFrameImageUrl} alt="End frame" className="w-full h-20 object-cover" />
                            <button
                              type="button"
                              onClick={() => handleRemoveEndFrame(shot.shotId)}
                              className="absolute top-1 right-1 text-[9px] bg-black/60 text-white px-1.5 py-0.5 rounded"
                            >
                              移除
                            </button>
                          </div>
                        ) : (
                          <label className="block text-center py-1 text-[11px] rounded bg-purple-50 hover:bg-purple-100 text-purple-700 cursor-pointer">
                            {uploadingEndFrameShotId === shot.shotId ? '上传中...' : '上传尾帧实拍图'}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={uploadingEndFrameShotId === shot.shotId}
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadEndFrame(shot.shotId, file);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        )}
                        {!shot.endFrameImageUrl && (
                          <div className="text-[10px] text-amber-700">没有尾帧时模型只能凭空想象机构动作，最容易变形。</div>
                        )}
                        {shot.endFrameImageUrl && !supportsLastFrame && (
                          <div className="text-[10px] text-rose-600">当前视频模型不支持首尾帧，提交时会忽略尾帧，请切换 MiniMax-H3。</div>
                        )}
                      </div>
                    )}

                    <div className="text-[10px] text-neutral-600 line-clamp-2 italic">
                      "{shot.prompt}"
                    </div>

                    {/* Keyframe image if generated */}
                    {shot.keyframeImageUrl && (
                      <div className="relative rounded overflow-hidden border border-purple-200">
                        <img
                          src={shot.keyframeImageUrl}
                          alt="Keyframe"
                          className="w-full h-24 object-cover"
                        />
                        <span className="absolute bottom-1 right-1 text-[9px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                          首帧画面已锁定
                        </span>
                      </div>
                    )}

                    {/* Shot Action Buttons: Generate Keyframe OR Direct Video */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleGenerateKeyframe(shot)}
                        disabled={isGeneratingKeyframe}
                        className="py-1.5 px-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-800 rounded text-[11px] font-medium transition flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        {isGeneratingKeyframe ? (
                          <>
                            <RotateCw className="w-3 h-3 animate-spin text-purple-600" />
                            <span>生成画面中...</span>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="w-3 h-3 text-purple-600" />
                            <span>先生成首帧画面</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSubmitDirectVideoClick(shot.prompt, shot.shotId, shot.keyframeImageUrl, shot.endFrameImageUrl, shot.durationSeconds)}
                        disabled={isSubmittingJob}
                        className="py-1.5 px-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-[11px] font-medium transition flex items-center justify-center gap-1 shadow-2xs disabled:opacity-50"
                      >
                        <Play className="w-3 h-3" />
                        <span>生成此分镜视频</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Batch generation of all shots */}
            {directorPlan.shots.length > 1 && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleBatchSubmitAllShots}
                  disabled={isBatchSubmitting || isSubmittingJob}
                  className="w-full py-2 px-3 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-semibold shadow-sm transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isBatchSubmitting ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>正在批量排队提交...</span>
                    </>
                  ) : (
                    <>
                      <Layers className="w-3.5 h-3.5 text-purple-400" />
                      <span>一键批量生成全部 {directorPlan.shots.length} 个分镜视频</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="leading-tight">{error}</div>
          </div>
        )}
        {batchSubmitError && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="leading-tight">{batchSubmitError}</div>
          </div>
        )}
      </div>

      {/* Bottom Action Footer */}
      <div className="p-4 border-t border-neutral-200 bg-neutral-50/50 space-y-2">
        {activeTab === 'product_showcase' ? (
          <button
            type="button"
            onClick={handleGeneratePlan}
            disabled={isGeneratingPlan || (referenceImages.length === 0 && !selectedNode)}
            className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition flex items-center justify-center gap-1.5"
          >
            {isGeneratingPlan ? (
              <>
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>导演正在构思运镜方案 ({selectedDirectorModel})...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-3.5 h-3.5" />
                <span>生成视频策划分镜方案</span>
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleSubmitDirectVideoClick()}
            disabled={isSubmittingJob || (referenceImages.length === 0 && !selectedNode)}
            className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition flex items-center justify-center gap-1.5"
          >
            {isSubmittingJob ? (
              <>
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>正在排队下发视频任务...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>开始生成视频</span>
              </>
            )}
          </button>
        )}

        {/* Active Tasks Status Drawer */}
        {jobs.length > 0 && (
          <div className="pt-2 border-t border-neutral-200">
            <div className="flex items-center justify-between text-[11px] text-neutral-500 mb-1">
              <span>近期任务 ({jobs.length})</span>
              {storageInfo && (
                <span className="text-[10px] text-neutral-400">
                  存储: {storageInfo.provider === 'gcs' ? 'GCS私有桶 + Supabase' : '云端与本地双重备份'}
                </span>
              )}
            </div>
            <div className="max-h-24 overflow-y-auto space-y-1">
              {jobs.slice(0, 3).map(job => (
                <div
                  key={job.id}
                  className="flex items-center justify-between px-2 py-1 bg-white border border-neutral-200 rounded text-[10px]"
                >
                  <span className="font-mono text-neutral-600 truncate max-w-[120px]">{job.id}</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded font-medium ${
                        job.status === 'ready'
                          ? 'bg-emerald-100 text-emerald-800'
                          : job.status === 'transferring'
                          ? 'bg-blue-100 text-blue-800'
                          : job.status === 'running'
                          ? 'bg-amber-100 text-amber-800'
                          : job.status === 'transfer_failed'
                          ? 'bg-rose-100 text-rose-800'
                          : job.status === 'failed' || job.status === 'submission_unknown'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-neutral-100 text-neutral-600'
                      }`}
                      title={job.errorMessage || ''}
                    >
                      {job.status === 'ready'
                        ? '就绪'
                        : job.status === 'transferring'
                        ? '转存中'
                        : job.status === 'running'
                        ? `生成中 ${job.progressPercent || 0}%`
                        : job.status === 'transfer_failed'
                        ? '转存失败'
                        : job.status === 'failed'
                        ? '生成失败'
                        : job.status === 'submission_unknown'
                        ? '提交异常'
                        : '排队中'}
                    </span>
                    {job.status === 'transfer_failed' && (
                      <button
                        onClick={() => retryTransfer(job.id)}
                        className="text-indigo-600 hover:underline"
                      >
                        重试转存
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
