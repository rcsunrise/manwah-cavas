import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Node, Edge, useNodesState, useEdgesState } from '@xyflow/react';
import { CreativeProject, ProductVisualDNA, AgentRun, ImageAttachment } from '../types';
import { LocalAssetItem } from '../types/creativeCanvas';
import { deltaE, findAssetByKeyword, pickBestSource, pickPaletteSwatches, textileColorTarget } from '../utils/textilePalette';
import { AgentMessage, SceneQueueItem, GenerationBatch, SaveStatus, ViewportState, AgentConversationRecord, AgentChatMessageRecord, AgentContextSnapshot, AgentErrorCode, CanvasTextLayer, AgentSuggestion, AgentTaskCard, AgentPlanCard, AgentLocateTarget, AgentVideoCard, AgentImageCard, AgentActionParams } from '../types/creativeCanvas';
import { assetQueueManager, QueueStats } from '../services/assetQueueService';
import { confirmDialog } from '../utils/confirmDialog';
import { AgentChatService } from '../services/agentChatService';
import { mapExistingNineGridResultToCanvasNodes } from '../adapters/creativeCanvasNineGridAdapter';
import { supabase } from '../lib/supabase';
import { parseJsonResponse, assertSerializableRequestPayload } from '../utils/apiUtils';
import { generateEditedImage, resolveClientImageToBase64, resolveClientImageDetailed } from '../services/geminiService';
import { createDefaultNinePlan } from '../services/posterStudioService';
import { canvasService } from '../services/canvasService';
import { dbService } from '../services/dbService';
import { arrangeCleanTreeLayout, arrangeGrid3x3Layout, arrangeSeamlessVerticalLayout } from '../utils/creativeCanvasLayout';
import { logCanvasDiagnostic } from '../utils/canvasDiagnostic';
import { getAuthHeaders } from '../utils/apiUtils';
import { localAssetService } from '../services/localAssetService';
import { buildCanvasSummary, collectVideoNodeRefs, extractAgentActions, stripAgentActions } from '../utils/agentActionProtocol';
import { advanceTaskTiming, startTaskTiming } from '../utils/taskTiming';

// 对话中“下一步可做”的建议动作：DNA 提取完成后 / 企划生成完成后
const DNA_NEXT_STEPS: AgentSuggestion[] = [
  { label: '4/3 产品海报', actionId: 'template_poster' },
  { label: '氛围海报', actionId: 'fabric_poster' },
  { label: '做视频分镜', actionId: 'open_video' }
];

const CARD_STATE_KEY = 'creative-canvas:agent-card-states';
const CARD_STATE_LIMIT = 300;
type CardState = { plan?: AgentPlanCard['status']; answered?: string };

function loadCardStates(): Record<string, CardState> {
  try {
    return JSON.parse(localStorage.getItem(CARD_STATE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveCardState(messageId: string, state: CardState) {
  try {
    const all = loadCardStates();
    all[messageId] = { ...all[messageId], ...state };
    const ids = Object.keys(all);
    // 只保留最近的若干条，避免无限增长
    for (const id of ids.slice(0, Math.max(0, ids.length - CARD_STATE_LIMIT))) delete all[id];
    localStorage.setItem(CARD_STATE_KEY, JSON.stringify(all));
  } catch {
    // 存储不可用时卡片状态仅在本次会话内有效
  }
}

/** 空会话显示的欢迎语 */
function makeWelcomeMessage(): AgentMessage {
  return {
    id: `msg-${Date.now()}-welcome`,
    sender: 'agent',
    text: '新会话已开启！我是家具视觉生产工作流智能体 Agent G。有什么关于场景企划、DNA 或排版契约的问题可以随时问我。',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
}

function mapHistoryMessages(historyMsgs: AgentChatMessageRecord[]): AgentMessage[] {
  const mapped: AgentMessage[] = historyMsgs.map(m => {
    const rawText = typeof m.content === 'object' && m.content.text ? m.content.text : String(m.content);
    return {
      id: m.id,
      sender: m.role === 'user' ? 'user' : 'agent',
      ...(m.role === 'user' ? { text: rawText } : extractAgentActions(rawText)),
      model: typeof m.content === 'object' ? m.content.model : undefined,
      requestedModel: typeof m.content === 'object' ? m.content.requestedModel : undefined,
      videoCard: typeof m.content === 'object' && m.content.videoCard?.videoUrl ? m.content.videoCard : undefined,
      imageCard: typeof m.content === 'object' && m.content.imageCard?.imageUrl ? m.content.imageCard : undefined,
      images: typeof m.content === 'object' && Array.isArray(m.content.images) ? m.content.images : undefined,
      timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: m.status as any,
      error_code: m.error_code as any
    };
  });
  let lastAgentIdx = -1;
  mapped.forEach((m, i) => {
    if (m.sender === 'agent') lastAgentIdx = i;
  });
  const states = loadCardStates();
  return mapped.map((m, i) => {
    const state = states[m.id];
    const planCard = m.planCard && state?.plan ? { ...m.planCard, status: state.plan } : m.planCard;
    const clarifyCard = m.clarifyCard && state?.answered ? { ...m.clarifyCard, answered: state.answered } : m.clarifyCard;
    if (i === lastAgentIdx) return { ...m, planCard, clarifyCard };
    // 更早的消息：只保留用户处理过的卡片（显示已确认/已取消/已回答），未处理的旧提议不再展示
    return {
      ...m,
      planCard: state?.plan ? planCard : undefined,
      clarifyCard: state?.answered ? clarifyCard : undefined,
      suggestions: undefined
    };
  });
}

const PLAN_NEXT_STEPS: AgentSuggestion[] = [
  { label: '批量渲染分镜', actionId: 'render_all' },
  { label: '做全案海报', actionId: 'open_poster' },
  { label: '做视频分镜', actionId: 'open_video' }
];

const initialNodes: Node[] = [
  {
    id: 'welcome-1',
    type: 'welcomeNode',
    position: { x: 100, y: 120 },
    data: {
      title: '视觉企划画布',
      description: '上传产品图片后，智能体生成的产品 DNA、全案方案和渲染结果将在这里形成节点。',
      status: '画布已连接'
    }
  },
  {
    id: 'img-node-1',
    type: 'productImageNode',
    position: { x: 100, y: 320 },
    data: {
      title: '产品主图',
      status: 'idle'
    }
  }
];

const initialEdges: Edge[] = [];

/** 主产品图节点：上传会提取 DNA、驱动企划；画布上其他产品图节点各自独立 */
export function isMainProductNodeId(id: string | undefined | null): boolean {
  return id === 'img-node-1' || id === 'product-image-node-1';
}

export function normalizeCanvasIds(idParam?: string): { projectId: string; canvasId: string } {
  let raw = String(idParam || 'latest').trim();
  if (!raw || raw === 'undefined' || raw === 'null') {
    raw = 'latest';
  }
  while (raw.startsWith('canvas_')) {
    raw = raw.substring('canvas_'.length);
  }
  const projectId = raw || 'latest';
  const canvasId = `canvas_${projectId}`;
  return { projectId, canvasId };
}

// 自动保存：停止操作 10 秒后保存；持续操作时最多 60 秒也会保存一次
const AUTOSAVE_IDLE_MS = 10_000;
const AUTOSAVE_MAX_WAIT_MS = 60_000;

/**
 * 待同步草稿：页面隐藏 / 关闭 / 离开画布时写下的完整快照（含大图，不做裁剪）。
 * 服务端保存成功后清除；下次打开画布若它比服务端版本新，则恢复并重新保存。
 */
interface PendingDraft {
  canvasId: string;
  projectId: string;
  at: string;
  nodes: any[];
  edges: any[];
  viewport: ViewportState;
}

const pendingDraftKey = (canvasId: string) => `creative-canvas:pending-draft:${canvasId}`;

function writePendingDraft(draft: PendingDraft) {
  // localStorage 同步写入，关闭页面时也能落盘；超出配额时仅依赖 IndexedDB
  try {
    localStorage.setItem(pendingDraftKey(draft.canvasId), JSON.stringify(draft));
  } catch {}
  void dbService.saveDraft(pendingDraftKey(draft.canvasId), draft).catch(() => {});
}

function clearPendingDraft(canvasId: string) {
  try {
    localStorage.removeItem(pendingDraftKey(canvasId));
  } catch {}
  void dbService.deleteDraft(pendingDraftKey(canvasId)).catch(() => {});
}

async function readPendingDraft(canvasId: string): Promise<PendingDraft | null> {
  const candidates: PendingDraft[] = [];
  try {
    const fromDb = await dbService.getDraft<PendingDraft>(pendingDraftKey(canvasId));
    if (fromDb) candidates.push(fromDb);
  } catch {}
  try {
    const raw = localStorage.getItem(pendingDraftKey(canvasId));
    if (raw) candidates.push(JSON.parse(raw));
  } catch {}
  return candidates
    .filter(d => d && d.canvasId === canvasId && Array.isArray(d.nodes))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] || null;
}

export function safeSaveToLocalStorage(key: string, data: any) {
  try {
    const serialized = JSON.stringify(data, (k, v) => {
      if (typeof v === 'string' && v.startsWith('data:image/') && v.length > 100000) {
        return undefined;
      }
      return v;
    });
    localStorage.setItem(key, serialized);
  } catch (e) {
    console.warn(`LocalStorage write skipped for ${key}:`, e);
  }
}

export function useCreativeCanvasWorkspace(
  workspaceIdParam?: string,
  options?: { onOpenPosterStudio?: (screenIndex: number) => void }
) {
  const onOpenPosterStudioRef = useRef(options?.onOpenPosterStudio);
  onOpenPosterStudioRef.current = options?.onOpenPosterStudio;

  // Get stable userId for LocalStorage key prefixing
  const userId = useMemo(() => {
    const storedUser = localStorage.getItem('manwah_user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed.id) return String(parsed.id);
      } catch (e) {}
    }
    return 'default_user';
  }, []);

  const getStorageKey = useCallback((projId: string, canvId: string) => {
    const { projectId, canvasId } = normalizeCanvasIds(projId || canvId);
    return `creative-canvas:${userId}:${projectId}:${canvasId}:draft`;
  }, [userId]);

  // C4A-1 Hydration State Machine: idle -> loading -> hydrated -> ready
  const [hydrationState, setHydrationState] = useState<'idle' | 'loading' | 'hydrated' | 'ready'>('idle');
  const hasUserMutationRef = useRef<boolean>(false);
  const isRestoringRef = useRef<boolean>(false);
  const hasExplicitUserClearRef = useRef<boolean>(false);
  // 本地刚新建、尚无任何云端数据的项目 ID：hydrate 时跳过全部远程拉取
  const freshProjectIdRef = useRef<string | null>(null);
  const lastHydratedProjectRef = useRef<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const nodesRef = useRef<Node[]>(initialNodes);
  nodesRef.current = nodes;

  const edgesRef = useRef<Edge[]>(initialEdges);
  edgesRef.current = edges;

  const handleNodesChange = useCallback((changes: any) => {
    if (hydrationState === 'ready' && !isRestoringRef.current) {
      hasUserMutationRef.current = true;
    }
    // 拖动没锁定的分组框时，框内节点跟着一起走
    let all = changes;
    if (Array.isArray(changes) && changes.some((c: any) => c.type === 'position' && c.position)) {
      const extra: any[] = [];
      const changedIds = new Set(changes.map((c: any) => c.id));
      for (const c of changes) {
        if (c.type !== 'position' || !c.position) continue;
        const frame = nodesRef.current.find(n => n.id === c.id);
        if (!frame || frame.type !== 'groupFrameNode' || (frame.data as any)?.locked) continue;
        const dx = c.position.x - frame.position.x;
        const dy = c.position.y - frame.position.y;
        if (!dx && !dy) continue;
        for (const mid of ((frame.data as any)?.memberIds || []) as string[]) {
          if (changedIds.has(mid)) continue;
          const m = nodesRef.current.find(n => n.id === mid);
          if (m) extra.push({ type: 'position', id: mid, position: { x: m.position.x + dx, y: m.position.y + dy }, dragging: c.dragging });
        }
      }
      if (extra.length) all = [...changes, ...extra];
    }
    onNodesChange(all);
  }, [hydrationState, onNodesChange]);

  const handleEdgesChange = useCallback((changes: any) => {
    if (hydrationState === 'ready' && !isRestoringRef.current) {
      hasUserMutationRef.current = true;
    }
    onEdgesChange(changes);
  }, [hydrationState, onEdgesChange]);

  const activeProjectRef = useRef<CreativeProject | null>(null);
  const loadedFromSourceRef = useRef(false);
  const uploadedBase64Ref = useRef<string | null>(null);

  const handleUploadFileRef = useRef<((file: File) => Promise<void>) | null>(null);
  const handleRemoveProductImageRef = useRef<(() => void) | null>(null);
  const handleReanalyzeRef = useRef<(() => void) | null>(null);
  const handleAddInpaintNodeRef = useRef<((detail: any) => void) | null>(null);

  useEffect(() => {
    const handleCustomUpload = (e: Event) => {
      const customEvent = e as CustomEvent<File>;
      if (customEvent.detail && handleUploadFileRef.current) {
        handleUploadFileRef.current(customEvent.detail);
      }
    };
    const handleCustomInpaint = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      if (customEvent.detail && handleAddInpaintNodeRef.current) {
        handleAddInpaintNodeRef.current(customEvent.detail);
      }
    };
    window.addEventListener('canvas:upload-product-image', handleCustomUpload);
    window.addEventListener('canvas:inpaint-new-node', handleCustomInpaint);
    return () => {
      window.removeEventListener('canvas:upload-product-image', handleCustomUpload);
      window.removeEventListener('canvas:inpaint-new-node', handleCustomInpaint);
    };
  }, []);

  const [activeProject, setActiveProjectState] = useState<CreativeProject | null>(null);
  const setActiveProject = (proj: CreativeProject | null) => {
    activeProjectRef.current = proj;
    setActiveProjectState(proj);
  };

  const [activeDna, setActiveDna] = useState<ProductVisualDNA | null>(null);
  const activeDnaRef = useRef<ProductVisualDNA | null>(null);
  activeDnaRef.current = activeDna;

  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadedBase64, setUploadedBase64State] = useState<string | null>(null);

  const setUploadedBase64 = (b64: string | null) => {
    uploadedBase64Ref.current = b64;
    setUploadedBase64State(b64);
  };

  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'analyzing' | 'completed' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showFullDnaDrawer, setShowFullDnaDrawer] = useState<boolean>(false);

  // Phase C4A-1 states for Canvas Draft & Revision Persistence
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('cloud_loading');
  const [assetQueueStats, setAssetQueueStats] = useState<QueueStats | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [currentRevisionNumber, setCurrentRevisionNumber] = useState<number>(0);

  useEffect(() => {
    assetQueueManager.init();
    return assetQueueManager.subscribe((_, stats) => {
      setAssetQueueStats(stats);
      if (stats.uploading > 0 || stats.queued > 0) {
        setSaveStatus('syncing_assets');
      } else if (stats.failed > 0) {
        setSaveStatus('error');
      } else {
        setSaveStatus('saved');
      }
    });
  }, []);

  const [showSaveVersionModal, setShowSaveVersionModal] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

  const [viewport, setViewport] = useState<ViewportState>({ x: 0, y: 0, zoom: 1 });
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevSerializedRef = useRef<string>('');
  // 本轮未保存改动开始的时间，用于“持续操作也至少每 60 秒保存一次”
  const firstDirtyAtRef = useRef<number | null>(null);

  // Phase C2 states for 9-grid planning
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null);
  const agentRunRef = useRef<AgentRun | null>(null);
  agentRunRef.current = agentRun;
  const [isPlanGenerating, setIsPlanGenerating] = useState<boolean>(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState<number | null>(null);

  // Model & Resolution config for Image Generation
  // 默认出图模型：GPT 2.6 Flare（实测产品保真、中文字准确、约 40 秒）；Sunburst 作为高质量选项
  const [selectedModel, setSelectedModel] = useState<string>('openai/gpt-image-2.6-flare-c');
  const [planAgentModel, setPlanAgentModel] = useState<string>('gpt-6');
  const [planReasoningEffort, setPlanReasoningEffort] = useState<'minimal' | 'low' | 'medium' | 'high'>('medium');
  const [planTargetAudience, setPlanTargetAudience] = useState<string>('');
  const [planScreenCount, setPlanScreenCount] = useState<number>(1);
  const [planAspectRatio, setPlanAspectRatio] = useState<string>('4:3');
  const [selectedResolution, setSelectedResolution] = useState<'1K' | '2K' | '4K'>('2K');
  // 模板 A 成品 4K（4096×3072）：默认关；开启后主场景用 4K 生成，排版整体放大 2 倍
  const [templateA4K, setTemplateA4KState] = useState<boolean>(() => {
    try { return localStorage.getItem('templateA4K') === '1'; } catch { return false; }
  });
  const setTemplateA4K = (on: boolean) => {
    setTemplateA4KState(on);
    try { localStorage.setItem('templateA4K', on ? '1' : '0'); } catch { /* 无痕等环境忽略 */ }
  };

  // Style reference images & reference doc states
  const [styleRefImages, setStyleRefImages] = useState<string[]>([]);
  const [refDocName, setRefDocName] = useState<string | null>(null);
  const [refDocText, setRefDocText] = useState<string | null>(null);

  // Web search & competitor reference states for planning (VectorEngine Google Search)
  const [planEnableSearch, setPlanEnableSearch] = useState<boolean>(false);
  const [planSearchKeywords, setPlanSearchKeywords] = useState<string>('');
  const [marketSearchLoading, setMarketSearchLoading] = useState<boolean>(false);
  const [marketSearchResult, setMarketSearchResult] = useState<string | null>(null);

  // C4B-1 Product DNA Version & Selection Linkage States
  const [dnaCode, setDnaCode] = useState<string | undefined>(undefined);
  const [productDnaVersionCode, setProductDnaVersionCode] = useState<string | undefined>(undefined);
  const [productDnaVersionId, setProductDnaVersionId] = useState<string | undefined>(undefined);
  const [dnaVersions, setDnaVersions] = useState<any[]>([]);

  useEffect(() => {
    if (activeDna) {
      if ((activeDna as any).dnaCode) setDnaCode((activeDna as any).dnaCode);
      if ((activeDna as any).versionCode) setProductDnaVersionCode((activeDna as any).versionCode);
      if ((activeDna as any).productDnaVersionId) setProductDnaVersionId((activeDna as any).productDnaVersionId);
    }
  }, [activeDna]);

  const fetchDnaVersions = useCallback(async () => {
    try {
      const targetProjectId = activeProjectRef.current?.id || workspaceIdParam || 'latest';
      // 新建画布还没有 DNA，跳过这次必然 404 的请求
      if (freshProjectIdRef.current === targetProjectId) return;
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/projects/${targetProjectId}/product-dna`, {
        headers: { ...authHeaders }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.productDna) {
          if (data.productDna.dna_code) setDnaCode(data.productDna.dna_code);
          if (data.productDna.version_code) setProductDnaVersionCode(data.productDna.version_code);
          if (data.productDna.current_version_id) setProductDnaVersionId(data.productDna.current_version_id);
          if (Array.isArray(data.versions)) setDnaVersions(data.versions);
        }
      }
    } catch (e) {}
  }, [workspaceIdParam]);

  useEffect(() => {
    fetchDnaVersions();
  }, [fetchDnaVersions]);

  // G0-1: Conversation & Agent Chat States
  const [currentConversation, setCurrentConversation] = useState<AgentConversationRecord | null>(null);
  const [conversationsList, setConversationsList] = useState<AgentConversationRecord[]>([]);
  const currentConversationRef = useRef<AgentConversationRecord | null>(null);
  currentConversationRef.current = currentConversation;
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [streamError, setStreamError] = useState<{ code: AgentErrorCode; message: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: 'msg-1',
      sender: 'agent',
      text: '你好！我是家具视觉生产工作流智能体 Agent G。请上传产品主角图，我将自动提取造型、色彩、材质与结构 DNA 并同步至左侧画布。',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  // extras 可附带结构化卡片（追问 / 计划 / 任务 / 下一步建议），返回消息 id 便于后续更新卡片状态
  const addAgentMessage = useCallback((text: string, extras?: Partial<AgentMessage>) => {
    const id = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setMessages(prev => [
      ...prev,
      {
        id,
        sender: 'agent',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        ...extras,
        ...(extras?.taskCard ? { taskCard: startTaskTiming(extras.taskCard) } : {})
      }
    ]);
    return id;
  }, []);

  const updateAgentMessage = useCallback((id: string, patch: Partial<AgentMessage>) => {
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));
    if (patch.planCard || patch.clarifyCard?.answered) {
      saveCardState(id, { plan: patch.planCard?.status, answered: patch.clarifyCard?.answered });
    }
  }, []);

  // 企划生成任务卡：开始时插入，结束时原地更新状态
  const planTaskMsgIdRef = useRef<string | null>(null);
  const finishTaskCard = useCallback((
    id: string | null | undefined,
    status: AgentTaskCard['status'],
    detail?: string,
    locate?: AgentLocateTarget,
    extra?: Partial<AgentTaskCard>
  ) => {
    if (!id) return;
    setMessages(prev =>
      prev.map(m =>
        m.id === id && m.taskCard
          ? { ...m, taskCard: advanceTaskTiming(m.taskCard, { ...m.taskCard, status, detail: detail ?? m.taskCard.detail, locate, ...extra }) }
          : m
      )
    );
  }, []);
  const finishPlanTask = useCallback((status: AgentTaskCard['status'], detail?: string, locate?: AgentLocateTarget) => {
    const id = planTaskMsgIdRef.current;
    planTaskMsgIdRef.current = null;
    finishTaskCard(id, status, detail, locate);
  }, [finishTaskCard]);

  const handleSelectDnaVersion = useCallback(async (versionId: string) => {
    try {
      const targetProjectId = activeProjectRef.current?.id || workspaceIdParam || 'latest';
      const authHeaders = await getAuthHeaders();
      const dnaRes = await fetch(`/api/projects/${targetProjectId}/product-dna`, { headers: { ...authHeaders } });
      const dnaData = await dnaRes.json();
      const dnaId = dnaData?.productDna?.id;
      if (!dnaId) return;

      const res = await fetch(`/api/product-dnas/${dnaId}/select-version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ versionId })
      });
      const data = await res.json();
      if (data.success && data.version) {
        setProductDnaVersionId(data.version.id);
        const vCode = data.version.version_code || `V00${data.version.version_number}`;
        setProductDnaVersionCode(vCode);
        addAgentMessage(`✅ 已成功将当前 Product DNA 版本切换至 ${vCode}`);
        fetchDnaVersions();
      }
    } catch (e) {
      console.error('Failed to select DNA version:', e);
    }
  }, [workspaceIdParam, addAgentMessage, fetchDnaVersions]);

  // images：随消息显示的图片（上传的产品图在对话里也能看到、点开放大）
  const addUserMessage = useCallback((text: string, images?: string[]) => {
    setMessages(prev => [
      ...prev,
      {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sender: 'user',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        ...(images && images.length > 0 ? { images } : {})
      }
    ]);
  }, []);

  // 对话里粘贴/拖入的图片：先传到存储拿到地址，随消息发给智能体（不再直接当产品主图做 DNA）
  const uploadChatImage = useCallback(async (file: File): Promise<string> => {
    if (file.size > 20 * 1024 * 1024) throw new Error('图片超过 20MB');
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.readAsDataURL(file);
    });
    const { canvasId } = normalizeCanvasIds(activeProjectRef.current?.id || workspaceIdParam);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/canvases/${encodeURIComponent(canvasId)}/inline-images`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl })
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.url) throw new Error(json?.error?.message || `上传失败 (${res.status})`);
    return String(json.url);
  }, [workspaceIdParam]);

  // 生成图落云端：只处理内嵌 data:image，重试 3 次拿云端地址；仍失败就提示，并优先用服务端本地兜底地址（避免把大 base64 留在节点里）
  const persistGeneratedImage = useCallback(async (imageUrl: string, label: string): Promise<string> => {
    if (!imageUrl.startsWith('data:image/')) return imageUrl;
    const { canvasId } = normalizeCanvasIds(activeProjectRef.current?.id || workspaceIdParam);
    let localFallback = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/canvases/${encodeURIComponent(canvasId)}/inline-images`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: imageUrl })
        });
        const json = await res.json().catch(() => null);
        const url = res.ok && json?.url ? String(json.url) : '';
        if (/^https?:\/\//i.test(url)) return url;
        if (url) {
          // 服务端已经重试过云端上传，退回了本机地址；不再把整张图重传（每次都要等上传超时）
          localFallback = url;
          break;
        }
      } catch {
        // 网络抖动，下面重试
      }
      if (attempt < 3) await new Promise(r => setTimeout(r, 800 * attempt));
    }
    addAgentMessage(`⚠️ 「${label}」图片没能上传到云端（网络不稳），目前只存在本机，换设备或清缓存后可能丢失。建议稍后点「再次生成」，或先下载保存。`);
    return localFallback || imageUrl;
  }, [workspaceIdParam, addAgentMessage]);

  // 视频任务完成后把成片回传到对话：先本地显示，再落库（失败不影响画布）
  const postVideoResultToChat = useCallback((card: AgentVideoCard) => {
    const meta = [card.modelKey, card.resolution, card.durationSeconds ? `${Math.round(card.durationSeconds)}s` : ''].filter(Boolean).join(' · ');
    const text = `🎬 视频已生成：${card.title || card.jobId}${meta ? `（${meta}）` : ''}`;
    addAgentMessage(text, { videoCard: card });
    const conv = currentConversationRef.current;
    if (conv) {
      AgentChatService.appendNote(conv.id, text, { videoCard: card }).catch(err =>
        console.warn('[AgentChat] video note not persisted:', err?.message || err)
      );
    }
  }, [addAgentMessage]);

  // 海报/画面生成或修改完成后把成图回传到对话（画布上保留流程节点，对话里看结果、接着提修改）
  const postImageResultToChat = useCallback((card: AgentImageCard) => {
    const label =
      card.source === 'poster' ? '带字海报已生成'
      : card.source === 'clean' ? '纯净底图已生成'
      : card.source === 'text_edit' ? '改字完成'
      : card.source === 'instruction_edit' ? '画面修改完成'
      : '画面已生成';
    const text = `🖼️ ${label}：${card.title || '画面'}${card.detail ? `\n${card.detail}` : ''}`;
    addAgentMessage(text, { imageCard: card });
    const conv = currentConversationRef.current;
    if (conv) {
      AgentChatService.appendNote(conv.id, text, { imageCard: card }).catch(err =>
        console.warn('[AgentChat] image note not persisted:', err?.message || err)
      );
    }
  }, [addAgentMessage]);

  // G0-1: Conversation initialization and load
  const loadOrInitConversation = useCallback(async (projId: string, canvId: string, isFreshCanvas = false) => {
    try {
      let list: AgentConversationRecord[] = [];
      // 新建画布不可能已有会话，跳过列表查询
      if (!isFreshCanvas) {
        try {
          list = await AgentChatService.listConversations(canvId, projId);
        } catch (firstErr) {
          try {
            await new Promise(r => setTimeout(r, 800));
            list = await AgentChatService.listConversations(canvId, projId);
          } catch {
            // If server API returns 504 or times out, proceed with empty list
            list = [];
          }
        }
      }
      // 从占位画布（/creative-canvas/new）跳到真实项目时，把正在进行的会话一起带过来，而不是另开一个空会话
      const prevConv = currentConversationRef.current;
      const PLACEHOLDERS = ['latest', 'new', 'default_project'];
      if (prevConv && PLACEHOLDERS.includes(prevConv.project_id) && !PLACEHOLDERS.includes(projId)) {
        try {
          // 空会话不带过去，免得盖住项目里已有的历史对话
          const prevMsgs = await AgentChatService.loadMessages(prevConv.id).catch(() => []);
          const moved = prevMsgs.length > 0 ? await AgentChatService.moveToProject(prevConv.id, projId) : null;
          if (moved) list = [moved, ...list.filter(c => c.id !== moved.id)];
        } catch (moveErr) {
          console.warn('Failed to move placeholder conversation to project (non-fatal):', moveErr);
        }
      }
      setConversationsList(list);

      let conv = list.find(c => c.status === 'active');
      // 占位画布（/new）上先不建会话：项目一确定页面就会跳到项目地址，发第一条消息时再按需创建
      if (!conv && PLACEHOLDERS.includes(projId)) {
        setCurrentConversation(null);
        return;
      }
      if (!conv) {
        try {
          conv = await AgentChatService.createConversation(projId, canvId);
          setConversationsList(prev => [conv!, ...prev.filter(x => x.id !== conv!.id)]);
        } catch (createErr) {
          // Local fallback active conversation if server is temporarily unreachable
          const validFallbackId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
            ? crypto.randomUUID()
            : '00000000-0000-4000-8000-000000000001';

          const fallbackConv: AgentConversationRecord = {
            id: validFallbackId,
            user_id: 'default_user',
            project_id: projId,
            canvas_id: canvId,
            title: '全新企划对话',
            status: 'active',
            provider: 'openai',
            model: 'gpt-6',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          conv = fallbackConv;
          setConversationsList(prev => [fallbackConv, ...prev]);
        }
      }
      setCurrentConversation(conv);
      if (isFreshCanvas) return;

      try {
        const historyMsgs = await AgentChatService.loadMessages(conv.id);
        if (historyMsgs && historyMsgs.length > 0) {
          const mappedMsgs: AgentMessage[] = mapHistoryMessages(historyMsgs);
          setMessages(mappedMsgs);
        }
      } catch (historyErr) {
        console.warn('Failed to load message history (non-fatal):', historyErr);
      }
    } catch (err: any) {
      console.warn('Failed to load agent conversation:', err);
    }
  }, []);

  // G0-1: Streamed message sending
  const handleSendMessageStream = useCallback(async (textText: string, options?: { mentionedNodeIds?: string[]; imageUrls?: string[] }) => {
    const imageUrls = (options?.imageUrls || []).slice(0, 4);
    // 只发图片不写字时，给模型一个默认问题
    if (!textText.trim() && imageUrls.length > 0) textText = '看看这张图';
    if (!textText.trim() || isStreaming) return;

    const targetProjectId = activeProjectRef.current?.id || workspaceIdParam || 'latest';
    const targetCanvasId = `canvas_${targetProjectId}`;

    let conv = currentConversation;
    if (!conv) {
      try {
        conv = await AgentChatService.createConversation(targetProjectId, targetCanvasId);
        setCurrentConversation(conv);
        setConversationsList(prev => [conv!, ...prev]);
      } catch (e) {
        console.error('Failed to auto-create conversation:', e);
        return;
      }
    }

    const selectedNode = nodes.find(n => n.id === selectedNodeId);
    const activeAssetVersionId = (selectedNode?.data?.assetVersionId as string) || null;
    // 本会话看不到：其它会话生成的结果、已锁定分组里的结果（产品图/DNA 等素材除外）；用户 @ 或选中的照常可见
    const pointedIds = new Set<string>([...(options?.mentionedNodeIds || []), ...(selectedNodeId ? [selectedNodeId] : [])]);
    const SHARED_TYPES = new Set(['productImageNode', 'productDnaNode', 'welcomeNode', 'noteNode', 'groupFrameNode']);
    const sessionNodes = nodes.filter(n => {
      if (pointedIds.has(n.id) || SHARED_TYPES.has(String(n.type))) return true;
      const d = n.data as any;
      if (d?.groupLocked) return false;
      if (d?.conversationId && d.conversationId !== conv!.id) return false;
      return true;
    });

    const contextSnapshot: AgentContextSnapshot = {
      projectId: targetProjectId,
      canvasId: targetCanvasId,
      activeSceneKey: selectedSceneIndex ? `scene-0${selectedSceneIndex}` : undefined,
      // @ 引用的画布素材与当前选中节点一并作为上下文
      selectedNodeIds: (() => {
        const ids = [...(options?.mentionedNodeIds || []), ...(selectedNodeId ? [selectedNodeId] : [])];
        return ids.length > 0 ? Array.from(new Set(ids)) : undefined;
      })(),
      productDnaVersionId: productDnaVersionId || null,
      assetVersionId: activeAssetVersionId,
      copyVersionId: null,
      typographySpecId: null,
      canvasSummary: buildCanvasSummary({
        dna: activeDna,
        dnaReady: uploadState === 'completed' || nodes.some(n => n.id === 'dna-node-1' || n.type === 'productDnaNode'),
        plan: agentRun?.plan,
        planSettings: { screenCount: planScreenCount, aspectRatio: planAspectRatio, model: planAgentModel },
        nodes: sessionNodes,
        mentionedNodeIds: options?.mentionedNodeIds,
        selectedSceneIndex,
        localFolder: localAssetService.isConnected()
          ? (() => {
              const images = localAssetService.getAssets().filter(a => a.type === 'image');
              return { dirName: localAssetService.getDirectoryName(), imageCount: images.length, names: images.slice(0, 40).map(a => a.name) };
            })()
          : null
      }),
      videoNodes: collectVideoNodeRefs(sessionNodes)
    };

    const userMsgId = `user-msg-${Date.now()}`;
    const assistantMsgId = `assistant-msg-${Date.now()}`;
    const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const userMessage: AgentMessage = {
      id: userMsgId,
      sender: 'user',
      text: textText.trim(),
      timestamp: timestampStr,
      ...(imageUrls.length > 0 ? { images: imageUrls } : {})
    };

    const trimmed = textText.trim();
    // 带图的消息直接交给模型看图回答，不走本地关键词拦截

    // Agent G Execution Interceptor: Autonomous 4:3 Poster Layout from Local Assets
    // 面料海报 / 色卡海报 / 模板海报有自己的动作（由智能体提议确认卡片），不走这个写死的 2650 本地素材拦截
    const isNamedTemplatePoster = /(面料|色卡|配色|氛围海报|模板\s*[A-C]|模板海报|产品海报|4\s*[/:：比]\s*3)/i.test(trimmed);
    const isPosterLayoutIntent =
      !isNamedTemplatePoster &&
      (/(制作|生成|排版|设计|排一套|做一张|创建|自动制作).*(海报|4:3|四比三|版面)/i.test(trimmed) ||
        /(使用|用).*(本地|素材).*(海报|排版)/i.test(trimmed) ||
        /(4:3|四比三).*(海报|排版)/i.test(trimmed));

    if (isPosterLayoutIntent && imageUrls.length === 0) {
      if (!localAssetService.isConnected()) {
        const assistantMsg: AgentMessage = {
          id: assistantMsgId,
          sender: 'agent',
          text: `收到排版指令！检测到您希望使用本地 2650 沙发素材自动生成 4:3 意式轻奢海报。\n由于您尚未授权本地素材文件夹，请先点击上方的【📂 授权文件夹】选择包含 2650 系列产品图、Logo 与面料资料的本地目录。授权完成后，我将立即为您自动规划版面与排版节点！`,
          timestamp: timestampStr,
          status: 'completed'
        };
        setMessages(prev => [...prev, userMessage, assistantMsg]);
        return;
      }

      // Step 1: Intelligent asset selection from authorized directory
      const searchProduct = localAssetService.searchAssets('2650 沙发 主图 渲染 实景', 'image', 5);
      const productAsset = searchProduct.assets[0] || localAssetService.getAssets().find(a => a.type === 'image');
      const targetImageUrl = productAsset?.previewUrl || '';

      if (!targetImageUrl) {
        const assistantMsg: AgentMessage = {
          id: assistantMsgId,
          sender: 'agent',
          text: `已在您授权的本地文件夹【${localAssetService.getDirectoryName()}】中检索 2650 沙发素材，但未找到图片格式的产品主图。\n请确保文件夹中包含 PNG/JPG/WEBP 格式的沙发实景或渲染图，然后点击上方【重新扫描】。`,
          timestamp: timestampStr,
          status: 'completed'
        };
        setMessages(prev => [...prev, userMessage, assistantMsg]);
        return;
      }

      // Step 2: Compute 4:3 High-End Italian Luxury Layout Layers (Zero distortion, independent layers)
      const layoutLayers: CanvasTextLayer[] = [
        {
          id: `layer-brand-${Date.now()}`,
          text: 'MANWAH DESIGN STUDIO  |  MILAN LUXURY 2026',
          x: 120,
          y: 90,
          width: 900,
          height: 40,
          fontSize: 26,
          fontWeight: 700,
          color: '#B28C5A',
          letterSpacing: 2,
          fontFamily: 'system-ui, -apple-system, sans-serif'
        },
        {
          id: `layer-headline-${Date.now()}`,
          text: '2650 意式轻奢功能沙发',
          x: 120,
          y: 150,
          width: 1400,
          height: 90,
          fontSize: 64,
          fontWeight: 800,
          color: '#FFFFFF',
          fontFamily: '"Songti SC", "Source Han Serif SC", serif'
        },
        {
          id: `layer-sub-${Date.now()}`,
          text: '纯正意式鞍皮质感 · 零重力电动随心躺',
          x: 120,
          y: 255,
          width: 1200,
          height: 50,
          fontSize: 32,
          fontWeight: 500,
          color: '#E5E0D8',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        },
        {
          id: `layer-pills-${Date.now()}`,
          text: '【头层进口牛皮】  【德国静音电机】  【45D高回弹海绵】  【适老工程学】',
          x: 120,
          y: 325,
          width: 1400,
          height: 48,
          fontSize: 24,
          fontWeight: 600,
          color: '#C8A97E',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        },
        {
          id: `layer-specs-${Date.now()}`,
          text: '产品规格: W2200 × D1050 × H880mm · 鞍褐/米白双色可选 · 全国免费入户安装',
          x: 120,
          y: 1630,
          width: 1800,
          height: 40,
          fontSize: 26,
          fontWeight: 500,
          color: '#A8A29E',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        },
        {
          id: `layer-cert-${Date.now()}`,
          text: 'PREMIUM COMMERCIAL 4:3 ARCHIVE · STRICT AUDIT PROTECTED',
          x: 120,
          y: 1690,
          width: 1000,
          height: 30,
          fontSize: 20,
          color: 'rgba(255,255,255,0.45)',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }
      ];

      // Step 3: Inject onto Infinite Canvas as an Editable Draft Node
      const posterNodeId = 'poster-auto-4-3-draft';
      const posterNode: Node = {
        id: posterNodeId,
        type: 'generatedImageNode',
        position: { x: 860, y: 120 },
        data: {
          sceneIndex: 1,
          screenTitle: '2650 意式轻奢 4:3 产品海报 (待审核草稿)',
          aspectRatio: '4:3',
          sourceAspectRatio: '4:3',
          dimensions: '2400x1800',
          imageUrl: targetImageUrl,
          cleanBackgroundUrl: targetImageUrl,
          withText: false,
          textLayers: layoutLayers,
          reviewStatus: 'pendingReview',
          version: 1,
          activeVersionCode: 'V001-DRAFT',
          themeTitle: 'MANWAH MILAN LUXURY',
          coreSellingPoint: '纯正意式鞍皮质感 · 零重力电动随心躺',
          onApprove: () => {
            setNodes(cur => cur.map(n => n.id === posterNodeId ? {
              ...n,
              data: { ...n.data, reviewStatus: 'approved', activeVersionCode: 'V001-FINAL' }
            } : n));
          },
          onReject: (feedback: string) => {
            setNodes(cur => cur.map(n => n.id === posterNodeId ? {
              ...n,
              data: { ...n.data, reviewStatus: 'rejected', reviewFeedback: feedback }
            } : n));
          }
        }
      };

      setNodes(prev => {
        const filtered = prev.filter(n => n.id !== posterNodeId);
        return [...filtered, posterNode];
      });

      // Connect edge
      setEdges(prev => {
        const hasEdge = prev.some(e => e.target === posterNodeId);
        if (!hasEdge) {
          const sourceNode = nodes.find(n => n.id === 'dna-node-1' || n.id === 'img-node-1') || nodes[0];
          if (sourceNode) {
            return [
              ...prev,
              {
                id: `edge-${sourceNode.id}-${posterNodeId}`,
                source: sourceNode.id,
                target: posterNodeId,
                type: 'smoothstep',
                animated: true,
                style: { stroke: '#B28C5A', strokeWidth: 2 }
              }
            ];
          }
        }
        return prev;
      });

      // Step 4: Assistant Message with Draft Metadata & Interactive Card
      const assistantMsg: AgentMessage = {
        id: assistantMsgId,
        sender: 'agent',
        text: `✨ 已为您自动检索本地素材，完成【2650 意式轻奢 4:3 产品海报】排版策划！\n\n` +
          `• **📸 原始产品图**：选用本地素材「${productAsset.name}」（保持 100% 原始真实像素，零 AI 重绘）。\n` +
          `• **📐 画面规格**：标准商业 4:3 横版画幅（2400 × 1800 px，支持 300DPI 印刷导出）。\n` +
          `• **🎨 美学层级**：意式极简高奢规范（品牌标牌、方正宋体主标、敏华奢金 Pill 卖点标、工程参数规格栏）。\n` +
          `• **📝 图层架构**：图片底图、文字、装饰各自保持独立图层，零交叉污染。\n` +
          `• **🛡️ 交付管控**：**已创建可编辑草稿（待您审核）**。未经您的批准，严禁发布正式交付版本。\n\n` +
          `已在左侧无限画布中生成可编辑海报节点，您可以双击文字直接微调，或通过下方卡片快速导出：`,
        timestamp: timestampStr,
        status: 'completed',
        posterDraftCard: {
          nodeId: posterNodeId,
          screenTitle: '2650 意式轻奢 4:3 产品海报',
          aspectRatio: '4:3',
          dimensions: '2400 × 1800',
          imageUrl: targetImageUrl,
          layersCount: layoutLayers.length,
          reviewStatus: 'pendingReview',
          textLayers: layoutLayers
        }
      };

      setMessages(prev => [...prev, userMessage, assistantMsg]);
      return;
    }

    // Agent G Tool Interceptor: Detect local asset search intention
    const isLocalSearchIntent =
      /(本地|电脑|硬盘|文件夹|这里|库里|当前|目录).*(找|搜|查|素材|图|资料|pdf|2650|文件|内容|有哪些|有什么|看一下|看下|清单)/i.test(trimmed) ||
      /(有哪些|有什么|看下|列出).*(文件|素材|资料|图片|图)/i.test(trimmed) ||
      /^(找|搜|查|查找|搜索)\s*(2650|沙发|主图|面料|皮纹|logo|pdf|文件)/i.test(trimmed);

    if (isLocalSearchIntent && imageUrls.length === 0) {
      if (localAssetService.isConnected()) {
        let kw = trimmed.replace(/(查找|搜索|请帮我找|帮我找|找一下|找|搜|本地|电脑里的|素材|资料|图片|文件|这里|库里|当前|有哪些|有什么|看一下|看下|列出|清单)/gi, '').trim();

        // If asking "what files are here", list all indexed assets!
        const searchRes = localAssetService.searchAssets(kw, 'all', 8);
        const introText = kw
          ? `收到！已在您授权的本地文件夹【${localAssetService.getDirectoryName()}】中检索到 ${searchRes.matchedCount} 项与 "${kw}" 相关的素材：`
          : `您好！当前授权的本地素材库【${localAssetService.getDirectoryName()}】中共有 ${localAssetService.getIndexedCount()} 个文件，为您展示以下素材：`;

        const assistantMsg: AgentMessage = {
          id: assistantMsgId,
          sender: 'agent',
          text: searchRes.matchedCount > 0
            ? `${introText}\n您可以点击卡片下方的【导入主图】将其直接推入左侧无限画布并提取产品 DNA：`
            : `已在您授权的本地文件夹【${localAssetService.getDirectoryName()}】中检索，暂未匹配到相关素材。建议点击上方重新扫描。`,
          timestamp: timestampStr,
          status: 'completed',
          localAssetCard: searchRes.matchedCount > 0 ? searchRes : undefined
        };

        setMessages(prev => [...prev, userMessage, assistantMsg]);
        return;
      } else {
        const assistantMsg: AgentMessage = {
          id: assistantMsgId,
          sender: 'agent',
          text: `检测到您想检索本地素材，但目前尚未授权本地文件夹。\n请点击上方【授权文件夹】选择您的设计资料文件夹（例如：D:\\设计资料），无需安装任何软件，浏览器即可安全建立索引。`,
          timestamp: timestampStr,
          status: 'completed'
        };
        setMessages(prev => [...prev, userMessage, assistantMsg]);
        return;
      }
    }

    const pendingAssistantMsg: AgentMessage = {
      id: assistantMsgId,
      sender: 'agent',
      text: '',
      timestamp: timestampStr,
      status: 'streaming' as any
    };

    setMessages(prev => [...prev, userMessage, pendingAssistantMsg]);
    setIsStreaming(true);
    setStreamError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let accumulatedText = '';

    await AgentChatService.sendMessageStream({
      conversationId: conv.id,
      message: textText.trim(),
      contextSnapshot,
      model: currentConversation?.model || conv.model,
      attachments: imageUrls,
      abortController: controller,
      onDelta: (delta) => {
        accumulatedText += delta;
        setMessages(prev => prev.map(m => {
          if (m.id === assistantMsgId) {
            return { ...m, text: stripAgentActions(accumulatedText) };
          }
          return m;
        }));
      },
      onComplete: (completedRecord) => {
        setIsStreaming(false);
        abortControllerRef.current = null;
        setMessages(prev => prev.map(m => {
          if (m.id === assistantMsgId) {
            return {
              ...m,
              id: completedRecord.id,
              ...extractAgentActions((completedRecord.content && completedRecord.content.text) || accumulatedText),
              model: completedRecord.content?.model,
              requestedModel: completedRecord.content?.requestedModel,
              status: 'completed' as any
            };
          }
          return m;
        }));
      },
      onError: (err) => {
        setIsStreaming(false);
        abortControllerRef.current = null;
        setStreamError(err);
        setMessages(prev => prev.map(m => {
          if (m.id === assistantMsgId) {
            return {
              ...m,
              status: 'failed' as any,
              error_code: err.code as any,
              text: accumulatedText ? `${stripAgentActions(accumulatedText)}\n\n[回答中断: ${err.message}]` : `[发送失败: ${err.message}]`
            };
          }
          return m;
        }));
      }
    });
  }, [currentConversation, workspaceIdParam, isStreaming, selectedSceneIndex, selectedNodeId, productDnaVersionId, nodes, activeDna, agentRun, planScreenCount, planAspectRatio, planAgentModel, uploadState]);

  const handleStopGenerating = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const handleRetryMessage = useCallback(async () => {
    if (!currentConversation || isStreaming) return;

    setIsStreaming(true);
    setStreamError(null);

    const assistantMsgId = `assistant-retry-${Date.now()}`;
    const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setMessages(prev => [
      ...prev,
      {
        id: assistantMsgId,
        sender: 'agent',
        text: '',
        timestamp: timestampStr,
        status: 'streaming' as any
      }
    ]);

    let accumulatedText = '';

    await AgentChatService.retryMessage({
      conversationId: currentConversation.id,
      onDelta: (delta) => {
        accumulatedText += delta;
        setMessages(prev => prev.map(m => {
          if (m.id === assistantMsgId) {
            return { ...m, text: stripAgentActions(accumulatedText) };
          }
          return m;
        }));
      },
      onComplete: (record) => {
        setIsStreaming(false);
        setMessages(prev => prev.map(m => {
          if (m.id === assistantMsgId) {
            return {
              ...m,
              id: record.id,
              ...extractAgentActions((record.content && record.content.text) || accumulatedText),
              model: record.content?.model,
              requestedModel: record.content?.requestedModel,
              status: 'completed' as any
            };
          }
          return m;
        }));
      },
      onError: (err) => {
        setIsStreaming(false);
        setStreamError(err);
        setMessages(prev => prev.map(m => {
          if (m.id === assistantMsgId) {
            return {
              ...m,
              status: 'failed' as any,
              error_code: err.code as any,
              text: accumulatedText ? `${stripAgentActions(accumulatedText)}\n\n[重试失败: ${err.message}]` : `[重试失败: ${err.message}]`
            };
          }
          return m;
        }));
      }
    });
  }, [currentConversation, isStreaming]);

  const handleCreateNewConversation = useCallback(async () => {
    const targetProjectId = activeProjectRef.current?.id || workspaceIdParam || 'latest';
    const targetCanvasId = `canvas_${targetProjectId}`;

    try {
      const conv = await AgentChatService.createConversation(targetProjectId, targetCanvasId);
      setCurrentConversation(conv);
      setConversationsList(prev => [conv, ...prev.filter(x => x.id !== conv.id)]);

      const defaultWelcomeMessage: AgentMessage = {
        id: `msg-${Date.now()}-welcome`,
        sender: 'agent',
        text: '新会话已开启！我是家具视觉生产工作流智能体 Agent G。有什么关于场景企划、DNA 或排版契约的问题可以随时问我。',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages([defaultWelcomeMessage]);
    } catch (e) {
      console.error('Failed to create new conversation:', e);
    }
  }, [workspaceIdParam]);

  const handleSelectConversation = useCallback(async (convId: string) => {
    const conv = conversationsList.find(c => c.id === convId);
    if (!conv) return;

    setCurrentConversation(conv);
    try {
      const historyMsgs = await AgentChatService.loadMessages(convId);
      // 空会话也要清掉上一个会话的消息，否则切过去看到的还是别的对话
      setMessages(historyMsgs && historyMsgs.length > 0 ? mapHistoryMessages(historyMsgs) : [makeWelcomeMessage()]);
    } catch (e) {
      console.error('Failed to select conversation:', e);
    }
  }, [conversationsList]);

  // 删除会话（含全部消息）；删的是当前会话时切到最近的另一个，没有就回到欢迎页，发消息时再新建
  const handleDeleteConversations = useCallback(async (convIds: string[]) => {
    const ids = convIds.filter(Boolean);
    if (ids.length === 0) return;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await AgentChatService.deleteConversation(id);
      } catch (e) {
        console.error('Failed to delete conversation:', e);
        failed.push(id);
      }
    }
    const removed = new Set(ids.filter(id => !failed.includes(id)));
    const remaining = conversationsList.filter(c => !removed.has(c.id));
    setConversationsList(remaining);
    if (currentConversation && removed.has(currentConversation.id)) {
      const next = remaining.find(c => (c.message_count ?? 1) > 0) || remaining[0] || null;
      setCurrentConversation(next);
      if (next) {
        try {
          const historyMsgs = await AgentChatService.loadMessages(next.id);
          setMessages(historyMsgs && historyMsgs.length > 0 ? mapHistoryMessages(historyMsgs) : [makeWelcomeMessage()]);
        } catch {
          setMessages([makeWelcomeMessage()]);
        }
      } else {
        setMessages([makeWelcomeMessage()]);
      }
    }
    if (failed.length > 0) addAgentMessage(`有 ${failed.length} 个会话删除失败，请稍后重试。`);
  }, [conversationsList, currentConversation, addAgentMessage]);

  const handleChangeConversationModel = useCallback((newModel: string) => {
    if (!currentConversation) return;
    const updated: AgentConversationRecord = { ...currentConversation, model: newModel };
    setCurrentConversation(updated);
    setConversationsList(prev => prev.map(c => c.id === updated.id ? updated : c));
  }, [currentConversation]);

  // Ensure an active project exists or create one
  const getOrCreateProject = async (): Promise<CreativeProject | null> => {
    if (activeProject) return activeProject;
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          name: `画布企划 - ${new Date().toLocaleDateString()}`,
          project_type: 'detail_page'
        })
      });
      const data = await res.json();
      if (data.success && data.project) {
        setActiveProject(data.project);
        return data.project;
      }
    } catch (err) {
      console.warn('Server project creation failed, fallback to local project:', err);
    }

    const fallbackProj: CreativeProject = {
      id: workspaceIdParam || `proj_local_${Date.now()}`,
      name: `画布企划 (离线模式)`,
      project_type: 'detail_page',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      owner_id: 'local_user',
      status: 'active'
    };
    setActiveProject(fallbackProj);
    return fallbackProj;
  };

  // Perform DNA Analysis
  const performDnaExtraction = async (project: CreativeProject, base64: string) => {
    setUploadState('analyzing');
    addAgentMessage('正在进行产品 DNA 分析，提取造型、材质与强约束特征...');

    setNodes(prev => {
      const existing = prev.find(n => n.id === 'dna-node-1');
      const dnaNode: Node = {
        id: 'dna-node-1',
        type: 'productDnaNode',
        position: existing?.position || { x: 480, y: 150 },
        data: {
          status: 'analyzing',
          onViewFullDna: () => setShowFullDnaDrawer(true)
        }
      };
      if (existing) {
        return prev.map(n => (n.id === 'dna-node-1' ? dnaNode : n));
      }
      return [...prev, dnaNode];
    });

    setEdges(prev => {
      if (prev.some(e => e.id === 'edge-img-dna')) return prev;
      return [
        ...prev,
        {
          id: 'edge-img-dna',
          source: 'img-node-1',
          target: 'dna-node-1',
          sourceHandle: 'source',
          targetHandle: 'target',
          label: '分析生成',
          labelStyle: { fill: '#8C6F43', fontSize: 10, fontWeight: 700 },
          labelBgStyle: { fill: '#F9F5EF', rx: 4, ry: 4 },
          animated: true,
          style: { stroke: '#B28C5A', strokeWidth: 2 }
        }
      ];
    });

    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/projects/${project.id}/product-dna/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        // 图片是 http(s) 地址时走 images，服务端下载；base64 走 imageBase64List
        body: JSON.stringify(/^https?:\/\//i.test(base64) ? { images: [base64] } : { imageBase64List: [base64] })
      });

      const data = await parseJsonResponse<{ success?: boolean; productDna?: ProductVisualDNA; error?: string; message?: string }>(res);

      if (data.success && data.productDna) {
        setActiveDna(data.productDna);
        setUploadState('completed');
        addAgentMessage('✅ 产品 DNA 提取完成！可以开始策划详情页方案了。', { suggestions: DNA_NEXT_STEPS });

        setNodes(prev =>
          prev.map(n => {
            if (n.id === 'dna-node-1' || n.type === 'productDnaNode' || n.type === 'productDna') {
              return {
                ...n,
                data: {
                  ...(n.data || {}),
                  dna: data.productDna,
                  status: 'completed',
                  analyzedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  onViewFullDna: () => setShowFullDnaDrawer(true)
                }
              };
            }
            if (n.id === 'img-node-1' || n.type === 'productImageNode' || n.type === 'productImage') {
              return {
                ...n,
                data: {
                  ...(n.data || {}),
                  status: 'completed'
                }
              };
            }
            return n;
          })
        );
      } else {
        const errorText = data.error || data.message || '分析服务未响应有效 DNA 数据';
        setErrorMessage(errorText);
        setUploadState('error');
        addAgentMessage(`❌ DNA 分析未完成：${errorText}`);

        setNodes(prev =>
          prev.map(n => {
            if (n.id === 'dna-node-1' || n.type === 'productDnaNode' || n.type === 'productDna') {
              return {
                ...n,
                data: {
                  ...(n.data || {}),
                  status: 'error',
                  errorMsg: errorText
                }
              };
            }
            if (n.id === 'img-node-1' || n.type === 'productImageNode' || n.type === 'productImage') {
              return {
                ...n,
                data: {
                  ...(n.data || {}),
                  status: 'error'
                }
              };
            }
            return n;
          })
        );
      }
    } catch (err: any) {
      const errorText = err?.message || '网络连接或服务端响应错误';
      setErrorMessage(errorText);
      setUploadState('error');
      addAgentMessage(`❌ DNA 分析失败：${errorText}`);

      setNodes(prev =>
        prev.map(n => {
          if (n.id === 'dna-node-1' || n.type === 'productDnaNode' || n.type === 'productDna') {
            return {
              ...n,
              data: {
                ...(n.data || {}),
                status: 'error',
                errorMsg: errorText
              }
            };
          }
          if (n.id === 'img-node-1' || n.type === 'productImageNode' || n.type === 'productImage') {
            return {
              ...n,
              data: {
                ...(n.data || {}),
                status: 'error'
              }
            };
          }
          return n;
        })
      );
    }
  };

  // Format byte size to human readable string
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 上传主图后是否自动提取产品 DNA（默认关；localStorage creative-canvas:auto-dna = '1' 打开）
  const readAutoDnaPref = () => {
    try {
      return localStorage.getItem('creative-canvas:auto-dna') === '1';
    } catch {
      return false;
    }
  };

  // Upload file & handle pipeline
  const handleUploadFile = async (file: File) => {
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setErrorMessage('不支持的文件格式。请上传 PNG, JPG 或 WEBP 图片。');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage('文件大小超出 20MB 限制。');
      return;
    }

    // 原项目已成组锁定：不覆盖锁定的主产品图，新图作为新产品节点落在分组框旁边
    const lockedMain = (nodesRef.current || nodes).find(n => n.id === 'img-node-1' && (n.data as any)?.groupLocked);
    if (lockedMain) {
      addAgentMessage('原项目已锁定，没有动它的主图。这张图作为新产品放在分组框右侧，可点它上面的「4/3 产品海报」等按钮单独开新项目。');
      handleAddProductNode(file);
      return;
    }

    setUploadState('uploading');
    setErrorMessage(null);
    // 本地预览地址：对话里马上能看到这张图，不用等上传到存储
    addUserMessage(`上传产品主图：${file.name}`, [URL.createObjectURL(file)]);

    const formattedSize = formatFileSize(file.size);

    const reader = new FileReader();
    reader.onload = async event => {
      const b64 = event.target?.result as string;
      if (!b64) {
        setUploadState('error');
        setErrorMessage('图片文件读取失败');
        return;
      }

      // Measure dimensions asynchronously
      let dimensions: { width: number; height: number } | undefined;
      try {
        dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => resolve({ width: 0, height: 0 });
          img.src = b64;
        });
      } catch (e) {
        console.warn('Failed to calculate image dimensions', e);
      }

      setUploadedBase64(b64);
      setUploadedImageUrl(b64);

      setNodes(prev => {
        const existing = prev.find(n => n.id === 'img-node-1');
        const imgNode: Node = {
          id: 'img-node-1',
          type: 'productImageNode',
          position: existing?.position || { x: 150, y: 150 },
          data: {
            imageUrl: b64,
            fileName: file.name,
            mimeType: file.type,
            fileSize: formattedSize,
            dimensions,
            status: 'analyzing',
            uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            onReanalyze: () => {
              if (activeProject && b64) {
                performDnaExtraction(activeProject, b64);
              }
            },
            onUpload: (f: File) => handleUploadFile(f),
            onRemove: () => handleRemoveProductImage()
          }
        };
        if (existing) {
          return prev.map(n => (n.id === 'img-node-1' ? imgNode : n));
        }
        return [...prev, imgNode];
      });

      const proj = await getOrCreateProject();
      if (proj) {
        try {
          const authHeaders = await getAuthHeaders();
          await fetch(`/api/projects/${proj.id}/assets`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders
            },
            body: JSON.stringify({
              asset_type: 'product_photo',
              storage_path: b64,
              mime_type: file.type
            })
          });
        } catch (e) {
          console.error('Failed to save project asset:', e);
        }

        if (readAutoDnaPref()) {
          await performDnaExtraction(proj, b64);
        } else {
          // 默认不自动提取 DNA：只放图。做企划/点“重新分析”时才提取
          setUploadState('completed');
          setNodes(prev => prev.map(n => (n.id === 'img-node-1' ? { ...n, data: { ...(n.data as any), status: 'completed' } } : n)));
          addAgentMessage('主图已放上画布，没有自动提取 DNA。做九宫格企划时会自动提取；想先看 DNA，点主图上的「重新分析」。');
        }
      } else {
        setUploadState('error');
        setErrorMessage('创建项目容器失败');
      }
    };

    reader.readAsDataURL(file);
  };

  const handleRemoveProductImage = () => {
    setUploadedBase64(null);
    setUploadedImageUrl(null);
    setActiveDna(null);
    setUploadState('idle');
    setErrorMessage(null);
    setNodes(prev =>
      prev.map(n => {
        if (n.id === 'img-node-1') {
          return {
            ...n,
            data: {
              imageUrl: undefined,
              fileName: undefined,
              mimeType: undefined,
              fileSize: undefined,
              uploadedAt: undefined,
              dimensions: undefined,
              status: 'idle',
              onUpload: (f: File) => handleUploadFile(f),
              onRemove: () => handleRemoveProductImage()
            }
          };
        }
        return n;
      })
    );
    addAgentMessage('已成功移除产品主图，您可以随时重新上传。');
  };

  // 重新分析：内存里没有上传时的 base64（刷新页面后从云端恢复的主图只有 URL）时，改用主图节点上的图片地址，
  // 服务端会下载；以前这里直接 return，点了没有任何反应
  const handleReanalyze = async () => {
    const mainNode = nodesRef.current.find(n => n.id === 'img-node-1' || n.id === 'product-image-node-1' || n.type === 'productImageNode');
    const image = uploadedBase64 || uploadedBase64Ref.current || (mainNode?.data as any)?.imageUrl || '';
    if (!image) {
      addAgentMessage('请先上传产品主图，再进行 DNA 分析。');
      return;
    }
    const proj = activeProject || (await getOrCreateProject());
    if (!proj) {
      addAgentMessage('❌ 无法初始化项目，DNA 分析未开始，请刷新页面后重试。');
      return;
    }
    performDnaExtraction(proj, image);
  };

  handleUploadFileRef.current = handleUploadFile;
  handleRemoveProductImageRef.current = handleRemoveProductImage;
  handleReanalyzeRef.current = handleReanalyze;

  const isPlanGeneratingRef = useRef(false);

  // Phase C2: Generate 9-grid plan
  const handleGenerateNineGridPlan = async (promptHint?: string, overrides?: { screenCount?: number; aspectRatio?: string }) => {
    if (isPlanGeneratingRef.current) {
      console.warn('企划生成请求正在进行中，自动忽略重复触发');
      return;
    }
    const screenCount = overrides?.screenCount ?? planScreenCount;
    const aspectRatio = overrides?.aspectRatio ?? planAspectRatio;
    if (overrides?.screenCount) setPlanScreenCount(overrides.screenCount);
    if (overrides?.aspectRatio) setPlanAspectRatio(overrides.aspectRatio);

    const proj = activeProject || (await getOrCreateProject());
    if (!proj) {
      setPlanError('无法初始化项目容器');
      return;
    }
    // 上传时没自动提取 DNA：做企划前补提一次
    if (!activeDnaRef.current && uploadedBase64Ref.current) {
      const raw = uploadedBase64Ref.current;
      await performDnaExtraction(proj, raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}`);
    }

    isPlanGeneratingRef.current = true;
    setIsPlanGenerating(true);
    setPlanError(null);
    const modelDisplayName =
      ({
        'gemini-3.6-flash': 'Gemini 3.6 Flash',
        'gemini-3.7-flash': 'Gemini 3.6 Flash',
        'gemini-3.8-flash': 'Gemini 3.6 Flash',
        'gpt-6.1-sol': 'GPT-6.1 Sol',
        'gpt-6': 'GPT-6 Astra'
      } as Record<string, string>)[planAgentModel] || planAgentModel;
    finishPlanTask('cancelled');
    planTaskMsgIdRef.current = addAgentMessage('', {
      taskCard: {
        title: `生成 ${screenCount} 屏企划方案`,
        status: 'running',
        detail: `${modelDisplayName}${planAgentModel.startsWith('gpt-') ? ' 结构化输出' : ' 策划引擎'} · 深度思考可能需要 1~2 分钟`
      }
    });

    let activeRunIdForRecovery: string | null = agentRun?.id || null;
    try {
      const authHeaders = await getAuthHeaders();
      let currentRunId: string;
      
      const createRunPayload = { projectId: proj.id };
      assertSerializableRequestPayload(createRunPayload, 'createRunPayload');
      const createRunRes = await fetch('/api/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify(createRunPayload)
      });
      const createRunData = await parseJsonResponse<{ success?: boolean; agentRun?: AgentRun; error?: string; message?: string }>(createRunRes);
      if (createRunData.success && createRunData.agentRun) {
        currentRunId = createRunData.agentRun.id;
        activeRunIdForRecovery = currentRunId;
        setAgentRun(createRunData.agentRun);
      } else {
        throw new Error(createRunData.error || createRunData.message || '创建 Agent 运行实例失败');
      }

      const cleanPromptHint = typeof promptHint === 'string' ? promptHint : '';
      let previousResponseId: string | undefined;
      let genData: {
        success?: boolean;
        incomplete?: boolean;
        continuationRequired?: boolean;
        responseId?: string;
        incompleteReason?: string;
        agentRun?: AgentRun;
        error?: string;
        message?: string;
      } = {};

      // 预处理并压缩风格参考图（等比缩放至最大1024px并压缩为标准JPEG，杜绝损坏base64结构或截断200字符）
      const sanitizedStyleRefImages = Array.isArray(styleRefImages) && styleRefImages.length > 0
        ? await Promise.all(
            styleRefImages
              .filter((img): img is string => typeof img === 'string' && img.length > 50)
              .slice(0, 3)
              .map(async (img) => {
                if (!img.startsWith('data:image')) return img;
                try {
                  return await new Promise<string>((resolve) => {
                    const el = new Image();
                    el.crossOrigin = 'anonymous';
                    el.onload = () => {
                      let { width, height } = el;
                      const maxDim = 1024;
                      if (width <= maxDim && height <= maxDim && img.length < 400000) {
                        resolve(img);
                        return;
                      }
                      if (width > height) {
                        if (width > maxDim) {
                          height = Math.round((height * maxDim) / width);
                          width = maxDim;
                        }
                      } else {
                        if (height > maxDim) {
                          width = Math.round((width * maxDim) / height);
                          height = maxDim;
                        }
                      }
                      const cvs = document.createElement('canvas');
                      cvs.width = Math.max(1, width);
                      cvs.height = Math.max(1, height);
                      const ctx = cvs.getContext('2d');
                      if (!ctx) {
                        resolve(img);
                        return;
                      }
                      ctx.drawImage(el, 0, 0, width, height);
                      resolve(cvs.toDataURL('image/jpeg', 0.85));
                    };
                    el.onerror = () => resolve(img);
                    el.src = img;
                  });
                } catch {
                  return img;
                }
              })
          )
        : [];

      for (let continuationAttempt = 0; continuationAttempt < 3; continuationAttempt += 1) {
        const planPayload = {
          promptHint: cleanPromptHint || planTargetAudience || '',
          agentModel: planAgentModel,
          reasoningEffort: planReasoningEffort,
          targetAudience: planTargetAudience,
          screenCount,
          aspectRatio,
          dna: activeDna,
          enableWebSearch: planEnableSearch,
          searchKeywords: planSearchKeywords,
          styleReferenceImages: sanitizedStyleRefImages,
          referenceDocText: refDocText,
          ...(previousResponseId ? { previousResponseId } : {})
        };
        assertSerializableRequestPayload(planPayload, 'planPayload');

        const genRes = await fetch(`/api/agent/${currentRunId}/generate-plan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders
          },
          body: JSON.stringify(planPayload)
        });
        genData = await parseJsonResponse(genRes);
        if (!genData.incomplete || !genData.continuationRequired) break;
        if (!genData.responseId) {
          throw new Error('模型返回 incomplete，但缺少可续接的 responseId');
        }
        previousResponseId = genData.responseId;
        addAgentMessage(`模型输出因 ${genData.incompleteReason || '输出上限'} 暂停，正在自动续接（${continuationAttempt + 1}/2）...`);
      }

      if (genData.incomplete) {
        throw new Error('模型连续输出不完整，请降低思考等级或稍后重试。');
      }

      if (genData.success && genData.agentRun) {
        const run: AgentRun = genData.agentRun;
        setAgentRun(run);

        let offsetY = 0;
        setNodes(prev => {
          const planNodes = prev.filter(n => n.type === 'nineGridPlanNode');
          const maxPlanY = planNodes.length > 0 ? Math.max(...planNodes.map(n => n.position.y)) : 0;
          offsetY = planNodes.length > 0 ? maxPlanY + 1200 : 0;

          const adapterResult = mapExistingNineGridResultToCanvasNodes(run, activeDna, {
            offsetY,
            onViewFullPlan: () => {
              setSelectedNodeId(`plan-node-${run.id}`);
              setSelectedSceneIndex(null);
            },
            onRegenerateAll: () => handleGenerateNineGridPlan(),
            onViewSceneDetail: (idx: number) => {
              setSelectedNodeId(`scene-plan-${run.id}-${idx}`);
              setSelectedSceneIndex(idx);
            },
            onReplanScene: (idx: number) => handleReplanSingleScene(idx),
            onOpenPosterStudio: (idx: number) => onOpenPosterStudioRef.current?.(idx),
            onGenerateWithTextImage: (idx: number) => handleGenerateSceneImage(idx, undefined, undefined, undefined, true)
          });

          const withoutNew = prev.filter(p => !adapterResult.nodes.some(n => n.id === p.id));
          return [...withoutNew, ...adapterResult.nodes];
        });

        setEdges(prev => {
          const adapterResult = mapExistingNineGridResultToCanvasNodes(run, activeDna, { offsetY });
          const withoutNew = prev.filter(e => !adapterResult.edges.some(newE => newE.id === e.id));
          return [...withoutNew, ...adapterResult.edges];
        });

        setIsPlanGenerating(false);
        finishPlanTask('done', `已在画布生成 ${screenCount === 1 ? '1 个分镜方案节点' : `1 个总策划节点和 ${screenCount} 个分镜方案节点`}`, { nodeType: 'nineGridPlanNode' });
        // 对话里直接展示方案要点，画布只承载流程节点
        const planObj: any = (run as any)?.plan || {};
        const screensForChat: any[] = Array.isArray(planObj.screens) ? planObj.screens : [];
        const planLines = screensForChat.slice(0, 12).map((s: any) =>
          `${s.screenIndex}. **${s.screenTitle || `第 ${s.screenIndex} 屏`}**${s.coreSellingPoint ? `：${String(s.coreSellingPoint).slice(0, 60)}` : ''}`
        );
        addAgentMessage(
          [
            `🎉 ${screenCount === 1 ? '单屏' : `${screenCount} 屏`}企划方案已生成${planObj.themeTitle ? `：**${planObj.themeTitle}**` : ''}`,
            ...(planLines.length ? ['', ...planLines] : []),
            '',
            '可以直接生成海报，也可以告诉我要怎么调整（如“第 1 屏更突出灯带”“标题改成××”）。'
          ].join('\n'),
          {
            suggestions: [
              ...screensForChat.slice(0, 2).map((s: any) => ({
                label: `生成第 ${s.screenIndex} 屏海报`,
                actionId: 'render_screen' as const,
                params: { screenIndex: Number(s.screenIndex) }
              })),
              ...PLAN_NEXT_STEPS
            ].slice(0, 4)
          }
        );
      } else {
        const errStr = genData.error || genData.message || '服务端生成企划失败';
        setPlanError(errStr);
        setIsPlanGenerating(false);
        finishPlanTask('failed', errStr);
        addAgentMessage(`❌ 全案企划生成异常：${errStr}`);
      }
    } catch (err: any) {
      // Direct fetch may fail if intermediate proxy or browser idle connection dropped during long reasoning (e.g. 60-120s).
      // The backend will still finish in background. Poll backend status to recover seamlessly:
      let recovered = false;
      const currentRunId = activeRunIdForRecovery || agentRun?.id;
      if (currentRunId) {
        try {
          addAgentMessage(`⏳ 正在同步后台 ${screenCount} 屏策划生成进度（模型已在后台调用或深度生成中，正在为您同步状态）...`);
          const authHeaders = await getAuthHeaders();
          for (let pollAttempt = 0; pollAttempt < 45; pollAttempt += 1) {
            await new Promise(resolve => setTimeout(resolve, 2500));
            try {
              const pollRes = await fetch(`/api/agent/${currentRunId}`, {
                headers: { ...authHeaders }
              });
              if (pollRes.ok) {
                const pollData = await pollRes.json();
                if (pollData.success && pollData.agentRun) {
                  const run: AgentRun = pollData.agentRun;
                  if (run.plan && (run.status === 'plan_review' || run.status === 'plan_approved' || run.status === 'completed')) {
                    setAgentRun(run);

                    let offsetY = 0;
                    setNodes(prev => {
                      const planNodes = prev.filter(n => n.type === 'nineGridPlanNode');
                      const maxPlanY = planNodes.length > 0 ? Math.max(...planNodes.map(n => n.position.y)) : 0;
                      offsetY = planNodes.length > 0 ? maxPlanY + 1200 : 0;

                      const adapterResult = mapExistingNineGridResultToCanvasNodes(run, activeDna, {
                        offsetY,
                        onViewFullPlan: () => {
                          setSelectedNodeId(`plan-node-${run.id}`);
                          setSelectedSceneIndex(null);
                        },
                        onRegenerateAll: () => handleGenerateNineGridPlan(),
                        onViewSceneDetail: (idx: number) => {
                          setSelectedNodeId(`scene-plan-${run.id}-${idx}`);
                          setSelectedSceneIndex(idx);
                        },
                        onReplanScene: (idx: number) => handleReplanSingleScene(idx),
                        onOpenPosterStudio: (idx: number) => onOpenPosterStudioRef.current?.(idx),
                        onGenerateWithTextImage: (idx: number) => handleGenerateSceneImage(idx, undefined, undefined, undefined, true)
                      });

                      const withoutNew = prev.filter(p => !adapterResult.nodes.some(n => n.id === p.id));
                      return [...withoutNew, ...adapterResult.nodes];
                    });

                    setEdges(prev => {
                      const adapterResult = mapExistingNineGridResultToCanvasNodes(run, activeDna, { offsetY });
                      const withoutNew = prev.filter(e => !adapterResult.edges.some(newE => newE.id === e.id));
                      return [...withoutNew, ...adapterResult.edges];
                    });

                    setIsPlanGenerating(false);
                    finishPlanTask('done', '已从后台同步就绪', { nodeType: 'nineGridPlanNode' });
                    addAgentMessage(
                      screenCount === 1
                        ? '🎉 单屏视觉企划方案已从后台同步就绪！已转换为 1 个策划节点和 1 个分镜方案节点并同步显示在画布中。'
                        : `🎉 全案视觉企划方案已从后台同步就绪！已转换为 1 个总策划节点和 ${screenCount} 个分镜方案节点并同步显示在画布中。`,
                      { suggestions: PLAN_NEXT_STEPS }
                    );
                    recovered = true;
                    return;
                  }
                  if (run.status === 'failed') {
                    throw new Error(run.errorMessage || '服务端生成企划失败');
                  }
                }
              }
            } catch (pErr: any) {
              if (pErr.message && !pErr.message.includes('fetch') && !pErr.message.includes('network') && !pErr.message.includes('Failed')) {
                throw pErr;
              }
            }
          }
        } catch (recoverErr: any) {
          err = recoverErr;
        }
      }

      if (!recovered) {
        let errStr = err?.message || '网络请求或引擎解析异常';
        if (errStr.includes('504') || errStr.includes('超时') || errStr.toLowerCase().includes('gateway time')) {
          errStr = `${errStr}（💡 提示：旗舰模型深度思考耗时较长触发网关超时。建议将上方【思考等级】切换为“低”或“中”后重新提交）`;
        }
        setPlanError(errStr);
        setIsPlanGenerating(false);
        finishPlanTask('failed', errStr);
        addAgentMessage(`❌ 全案企划生成失败：${errStr}`);
      }
    } finally {
      isPlanGeneratingRef.current = false;
    }
  };

  // Phase C2: Single screen replanning
  /**
   * 对话改字：修改画布图片中已有的文字（如海报标题），只重绘文字区域。
   * 结果作为新版本节点放在原图右侧并连线，原图保留。
   */
  const handleEditImageText = async (params: { newText?: string; oldText?: string; nodeId?: string }) => {
    const newText = params.newText?.trim();
    if (!newText) return;
    const currentNodes = nodesRef.current;
    const hasImage = (n: Node | undefined) => typeof (n?.data as any)?.imageUrl === 'string' && Boolean((n?.data as any)?.imageUrl);
    // 目标图：显式指定 → 当前选中 → 最近一张带文字的生成图 → 最近一张生成图 → 画布上任意一张图（如产品主图）
    const target =
      currentNodes.find(n => n.id === params.nodeId && hasImage(n)) ||
      currentNodes.find(n => n.id === selectedNodeId && hasImage(n)) ||
      [...currentNodes].reverse().find(n => n.type === 'generatedImageNode' && (n.data as any)?.withText && hasImage(n)) ||
      [...currentNodes].reverse().find(n => n.type === 'generatedImageNode' && hasImage(n)) ||
      [...currentNodes].reverse().find(n => hasImage(n));
    if (!target) {
      addAgentMessage('画布上没有找到可以改字的图片。请先选中或 @ 引用一张带文字的海报。');
      return;
    }
    const targetTitle = (target.data as any)?.title || (target.data as any)?.screenTitle || '目标图片';
    const taskStartedAt = Date.now();
    const taskId = addAgentMessage('', {
      taskCard: {
        title: `修改图中文字：${params.oldText ? `「${params.oldText}」→` : ''}「${newText}」`,
        status: 'running',
        detail: `${targetTitle} · GPT 2.5 Sunburst 局部重绘，约 1 分钟`
      }
    });
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/image-text-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ imageUrl: (target.data as any).imageUrl, newText, oldText: params.oldText })
      });
      const json = await parseJsonResponse<{ success?: boolean; data?: any; error?: string }>(res);
      if (!res.ok || !json.success || !json.data) throw new Error(json.error || `改字失败 (HTTP ${res.status})`);
      const result = json.data;

      const newNodeId = `text-edit-${Date.now()}`;
      const sourceWidth = Number((target as any).width || (target.style as any)?.width || 380);
      setNodes(prev => [
        ...prev.map(n => ({ ...n, selected: false })),
        {
          ...target,
          id: newNodeId,
          selected: true,
          position: { x: target.position.x + sourceWidth + 60, y: target.position.y },
          data: {
            ...(target.data as any),
            imageUrl: result.imageUrl,
            title: `${targetTitle} · 改字`,
            textEditedFrom: target.id,
            textEdit: { from: result.originalLine, to: result.expectedLine, model: result.model, verified: result.verified }
          }
        }
      ]);
      setEdges(prev => [
        ...prev,
        {
          id: `edge-text-edit-${target.id}-${newNodeId}`,
          source: target.id,
          target: newNodeId,
          animated: false,
          style: { stroke: '#B28C5A', strokeWidth: 1.5, strokeDasharray: '4 3' }
        }
      ]);
      hasUserMutationRef.current = true;

      const modelLabel = /sunburst/.test(result.model || '') ? 'GPT 2.5 Sunburst' : result.model === 'gemini-3-pro-image' ? 'Gemini 3 Pro' : 'Nano Banana 2.1';
      const editDetail = result.verified
        ? `「${result.originalLine}」→「${result.expectedLine}」 · ${modelLabel} · 已逐字校验，画面其余部分保持原图`
        : `⚠️ 逐字校验未通过（识别为「${result.recognizedLine || '无法识别'}」），请放大核对文字 · ${modelLabel}`;
      finishTaskCard(taskId, 'done', editDetail, { nodeId: newNodeId });
      postImageResultToChat({
        imageUrl: result.imageUrl,
        title: `${targetTitle} · 改字`,
        nodeId: newNodeId,
        sceneIndex: (target.data as any)?.sceneIndex,
        withText: true,
        source: 'text_edit',
        detail: editDetail
      });
    } catch (err: any) {
      finishTaskCard(taskId, 'failed', err?.message || '改字失败');
    }
  };

  // 按对话里的要求修改一张已生成的画面（换背景、调光线等），结果作为新版本节点接在原图后面，并回传到对话
  const handleEditImage = async (params: { instruction?: string; nodeId?: string }) => {
    const instruction = params.instruction?.trim();
    if (!instruction) return;
    const currentNodes = nodesRef.current;
    const hasImage = (n: Node | undefined) => typeof (n?.data as any)?.imageUrl === 'string' && Boolean((n?.data as any)?.imageUrl);
    const target =
      currentNodes.find(n => n.id === params.nodeId && hasImage(n)) ||
      currentNodes.find(n => n.id === selectedNodeId && hasImage(n) && n.type === 'generatedImageNode') ||
      [...currentNodes].reverse().find(n => n.type === 'generatedImageNode' && hasImage(n));
    if (!target) {
      addAgentMessage('画布上还没有生成的海报画面可以修改。请先生成底图或带字海报，或 @ 引用一张图片。');
      return;
    }
    const targetTitle = (target.data as any)?.title || (target.data as any)?.screenTitle || '目标画面';
    const taskStartedAt = Date.now();
    const taskId = addAgentMessage('', {
      taskCard: { title: `修改画面：${instruction.slice(0, 24)}${instruction.length > 24 ? '…' : ''}`, status: 'running', detail: `${targetTitle} · 产品保持不变，约 1 分钟` }
    });
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/image-text-edit/instruction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ imageUrl: (target.data as any).imageUrl, instruction })
      });
      const json = await parseJsonResponse<{ success?: boolean; data?: any; error?: string }>(res);
      if (!res.ok || !json.success || !json.data) throw new Error(json.error || `修改失败 (HTTP ${res.status})`);
      const result = json.data;
      const newNodeId = `image-edit-${Date.now()}`;
      const sourceWidth = Number((target as any).width || (target.style as any)?.width || 380);
      setNodes(prev => [
        ...prev.map(n => ({ ...n, selected: false })),
        {
          ...target,
          id: newNodeId,
          selected: true,
          position: { x: target.position.x + sourceWidth + 60, y: target.position.y },
          data: {
            ...(target.data as any),
            imageUrl: result.imageUrl,
            rawImageUrl: result.imageUrl,
            title: `${targetTitle} · 修改`,
            editedFrom: target.id,
            editInstruction: instruction,
            model: result.model
          }
        }
      ]);
      setEdges(prev => [
        ...prev,
        {
          id: `edge-image-edit-${target.id}-${newNodeId}`,
          source: target.id,
          target: newNodeId,
          label: '按要求修改',
          labelStyle: { fill: '#B28C5A', fontSize: 10, fontWeight: 700 },
          animated: false,
          style: { stroke: '#B28C5A', strokeWidth: 1.5, strokeDasharray: '4 3' }
        }
      ]);
      hasUserMutationRef.current = true;
      finishTaskCard(taskId, 'done', `已按要求修改 · ${result.model}`, { nodeId: newNodeId });
      postImageResultToChat({
        imageUrl: result.imageUrl,
        title: `${targetTitle} · 修改`,
        nodeId: newNodeId,
        sceneIndex: (target.data as any)?.sceneIndex,
        withText: Boolean((target.data as any)?.withText),
        source: 'instruction_edit',
        detail: `修改要求：${instruction}`
      });
    } catch (err: any) {
      finishTaskCard(taskId, 'failed', err?.message || '修改失败');
    }
  };

  const handleReplanSingleScene = async (screenIndex: number, promptHint?: string) => {
    if (isPlanGeneratingRef.current) {
      console.warn('正在生成或修改企划中，自动忽略重复触发');
      return;
    }

    if (!agentRun?.id) {
      setPlanError('缺失 Agent 运行实例');
      return;
    }

    isPlanGeneratingRef.current = true;
    setIsPlanGenerating(true);
    setPlanError(null);
    const replanTaskId = addAgentMessage('', {
      taskCard: { title: `重新策划第 ${screenIndex} 屏`, status: 'running', detail: promptHint || undefined }
    });

    try {
      const authHeaders = await getAuthHeaders();
      const cleanPromptHint = typeof promptHint === 'string' ? promptHint : '优化核心卖点与构图';
      const replanPayload = { promptHint: cleanPromptHint, dna: activeDna };
      assertSerializableRequestPayload(replanPayload, 'replanPayload');

      const res = await fetch(`/api/agent/${agentRun.id}/screens/${screenIndex}/replan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify(replanPayload)
      });

      const data = await parseJsonResponse<{ success?: boolean; updatedScreen?: any; agentRun?: AgentRun; error?: string; message?: string }>(res);

      if (data.success && data.updatedScreen && data.agentRun) {
        const run: AgentRun = data.agentRun;
        setAgentRun(run);

        const screen = data.updatedScreen;

        setNodes(prev =>
          prev.map(n => {
            const isTargetScene =
              n.id === `scene-plan-node-${screenIndex}` ||
              (n.type === 'scenePlanNode' && Number((n.data as any)?.screenIndex) === screenIndex);
            if (isTargetScene) {
              return {
                ...n,
                data: {
                  ...n.data,
                  screenTitle: screen.screenTitle,
                  coreSellingPoint: screen.coreSellingPoint,
                  visualComposition: screen.visualComposition,
                  lightingAndAtmosphere: screen.lightingAndAtmosphere,
                  promptSuggestion: screen.promptSuggestion,
                  aspectRatio: screen.aspectRatio || '3:4',
                  status: 'completed',
                  onViewDetail: () => {
                    setSelectedNodeId(n.id);
                    setSelectedSceneIndex(screenIndex);
                  },
                  onReplanScene: () => handleReplanSingleScene(screenIndex)
                }
              };
            }
            return n;
          })
        );

        setIsPlanGenerating(false);
        finishTaskCard(replanTaskId, 'done', `「${screen.screenTitle}」已更新到画布`, { nodeType: 'scenePlanNode', screenIndex });
      } else {
        const errStr = data.error || data.message || '单屏重新策划失败';
        setPlanError(errStr);
        setIsPlanGenerating(false);
        finishTaskCard(replanTaskId, 'failed', errStr);
      }
    } catch (err: any) {
      const errStr = err?.message || '请求失败';
      setPlanError(errStr);
      setIsPlanGenerating(false);
      finishTaskCard(replanTaskId, 'failed', errStr);
    } finally {
      isPlanGeneratingRef.current = false;
    }
  };

  // Phase C3A: Single screen image generation & review
  const handleGenerateNineGridPlanRef = useRef(handleGenerateNineGridPlan);
  handleGenerateNineGridPlanRef.current = handleGenerateNineGridPlan;

  const handleReplanSingleSceneRef = useRef(handleReplanSingleScene);
  handleReplanSingleSceneRef.current = handleReplanSingleScene;

  const handleSearchMarketReference = async (customKeywords?: string) => {
    const defaultKeywords = '顾家家居、乐至宝（La-Z-Boy）等品牌最新沙发产品命名（如赫兹、云舒等）、色彩方案、空间场景搭配与排版文案构思';
    const query = typeof customKeywords === 'string' && customKeywords.trim().length > 0
      ? customKeywords.trim()
      : (planSearchKeywords.trim() || defaultKeywords);

    setMarketSearchLoading(true);
    addAgentMessage(`🌐 正在通过 VectorEngine 联网检索竞品与市场趋势：${query}...`);

    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/agent/search-market-reference', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          query,
          category: activeDna?.category || '家具/客厅沙发'
        })
      });

      const data = await parseJsonResponse<{ success?: boolean; result?: string; error?: string; message?: string }>(res);
      if (data.success && data.result) {
        setMarketSearchResult(data.result);
        addAgentMessage('✅ 已成功获取顾家、乐至宝等行业最新爆款产品命名与设计参考情报！');
      } else {
        throw new Error(data.message || data.error || '检索未能返回有效结果');
      }
    } catch (err: any) {
      console.error('市场检索失败:', err);
      addAgentMessage(`❌ 市场参考检索失败: ${err.message || '网络异常'}`);
    } finally {
      setMarketSearchLoading(false);
    }
  };

  const generatingScenesRef = useRef<Set<number>>(new Set());

  const handleApproveSceneImage = (screenIndex: number) => {
    const resultNodeId = `gen-img-node-${screenIndex}`;
    setNodes(prev =>
      prev.map(n => {
        if (n.id === resultNodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              reviewStatus: 'approved'
            }
          };
        }
        return n;
      })
    );
    addAgentMessage(`🎉 第 ${screenIndex} 屏渲染图片人审标记为：【审核通过】！`);
  };

  const handleRejectSceneImage = (screenIndex: number, feedback: string) => {
    const resultNodeId = `gen-img-node-${screenIndex}`;
    setNodes(prev =>
      prev.map(n => {
        if (n.id === resultNodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              reviewStatus: 'rejected',
              reviewFeedback: feedback
            }
          };
        }
        return n;
      })
    );
    addAgentMessage(`⚠️ 第 ${screenIndex} 屏渲染图片已被标记为【未通过】。修改要求：“${feedback}”。可点击【根据反馈重新生成】修正。`);
  };

  const handleAddInpaintNode = useCallback((detail: {
    parentSceneIndex: number;
    parentScreenTitle?: string;
    coreSellingPoint?: string;
    aspectRatio?: string;
    parentImageUrl?: string;
    newImageUrl: string;
    prompt: string;
    model: string;
    version?: number;
    durationMs?: number;
  }) => {
    const screenIndex = detail.parentSceneIndex || 1;
    const currentNodes = nodesRef.current || nodes;

    const parentNode = currentNodes.find(
      n => (n.type === 'generatedImageNode' || n.type === 'generatedImage' || n.id.startsWith('gen-img-node-')) &&
      ((n.data as any)?.imageUrl === detail.parentImageUrl || (n.data as any)?.sceneIndex === screenIndex)
    );

    const sameSceneImages = currentNodes.filter(
      n => (n.type === 'generatedImageNode' || n.type === 'generatedImage' || n.id.startsWith('gen-img-node-')) &&
      ((n.data as any)?.sceneIndex === screenIndex || (n.data as any)?.sceneIndex === Number(screenIndex))
    );

    const versionNum = detail.version || (sameSceneImages.length + 1);
    const versionCode = `V00${versionNum}`;
    const resultNodeId = `gen-img-node-s${screenIndex}-inpaint-${Date.now()}`;

    let targetX = 1620;
    let targetY = (screenIndex - 1) * 460 + 100;
    if (parentNode) {
      targetX = parentNode.position.x + 380;
      targetY = parentNode.position.y;
    } else if (sameSceneImages.length > 0) {
      const maxX = Math.max(...sameSceneImages.map(n => n.position.x));
      targetX = maxX + 380;
      targetY = sameSceneImages[0].position.y;
    }

    const newInpaintNode: Node = {
      id: resultNodeId,
      type: 'generatedImageNode',
      position: { x: targetX, y: targetY },
      data: {
        sceneIndex: screenIndex,
        screenTitle: `${detail.parentScreenTitle || '分镜画面'} (局部重绘)`,
        coreSellingPoint: detail.coreSellingPoint || '',
        imageUrl: detail.newImageUrl,
        rawImageUrl: detail.newImageUrl,
        aspectRatio: detail.aspectRatio || '3:4',
        model: detail.model || 'gpt-image-2-c',
        provider: detail.model?.includes('gpt') ? 'openai' : 'google',
        generatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        generationDurationMs: detail.durationMs,
        version: versionNum,
        activeVersionCode: versionCode,
        parentVersionId: parentNode?.id || `scene-${screenIndex}`,
        reviewStatus: 'pendingReview',
        prompt: detail.prompt,
        withText: false,
        onOpenPosterStudio: () => onOpenPosterStudioRef.current?.(screenIndex),
        onGeneratePoster: () => handleGenerateSceneImage(screenIndex, undefined, detail.model, undefined, true),
        onRegenerate: () => handleGenerateSceneImage(screenIndex, undefined, detail.model, undefined, false),
        onViewDetail: () => {
          setSelectedNodeId(resultNodeId);
          setSelectedSceneIndex(screenIndex);
        },
        onApprove: () => handleApproveSceneImage(screenIndex),
        onReject: (feedback: string) => handleRejectSceneImage(screenIndex, feedback)
      }
    };

    setNodes(prev => [...prev, newInpaintNode]);

    if (parentNode) {
      const edgeInpaintId = `edge-inpaint-${parentNode.id}-${resultNodeId}`;
      setEdges(prev => {
        if (prev.some(e => e.id === edgeInpaintId)) return prev;
        return [
          ...prev,
          {
            id: edgeInpaintId,
            source: parentNode.id,
            target: resultNodeId,
            sourceHandle: 'source',
            targetHandle: 'target',
            label: 'GPT局部重绘',
            labelStyle: { fill: '#B28C5A', fontSize: 10, fontWeight: 700 },
            labelBgStyle: { fill: '#F9F5EF', rx: 4, ry: 4 },
            animated: true,
            style: { stroke: '#B28C5A', strokeWidth: 2, strokeDasharray: '4 4' }
          }
        ];
      });
    }

    addAgentMessage(`✅ 已生成第 ${screenIndex} 屏局部重绘新分镜 (${versionCode}) 并排接入画布！`);
  }, [nodes, setNodes, setEdges, addAgentMessage, handleApproveSceneImage, handleRejectSceneImage]);

  handleAddInpaintNodeRef.current = handleAddInpaintNode;

  const handleGenerateSceneImage = async (
    screenIndex: number, 
    reviewFeedback?: string, 
    overrideModel?: string, 
    overrideResolution?: '1K' | '2K' | '4K',
    withText?: boolean,
    fromBatch?: boolean
  ): Promise<boolean> => {
    if (generatingScenesRef.current.has(screenIndex)) {
      console.warn(`第 ${screenIndex} 屏图片生成正在进行中，忽略重复触发`);
      return false;
    }
    const sceneGenStartedAt = Date.now();

    // 「生成带字海报」统一走模板 A：文本模型先构思名字与文案 → 无字场景图 → 后端真实字体排版 + 细节裁切。
    // 不再让图像模型自己画字。批量生成（fromBatch）按屏排队、版式各异，仍走原链路；纯净底图也不受影响。
    if (withText && !fromBatch) {
      const mainProduct = (nodesRef.current || nodes).find(n => n.id === 'img-node-1');
      return handleGenerateTemplatePoster({
        screenIndex,
        nodeId: mainProduct ? mainProduct.id : undefined,
        hint: reviewFeedback || undefined
      });
    }

    const currentNodes = nodesRef.current || nodes;
    const currentRun = agentRunRef.current || agentRun;
    const currentDna = activeDnaRef.current || activeDna || currentRun?.dna;

    const modelToUse = overrideModel || selectedModel || 'gemini-3.1-flash-image';
    const resolutionToUse = overrideResolution || selectedResolution || '2K';
    const isGpt = modelToUse.includes('gpt-image');

    let rawB64 = uploadedBase64Ref.current || uploadedBase64;
    if (!rawB64) {
      const imgNode = currentNodes.find(n => n.id === 'img-node-1' || n.type === 'productImageNode' || n.type === 'productImage');
      if (imgNode?.data?.imageUrl) {
        rawB64 = imgNode.data.imageUrl as string;
      }
    }

    // Try finding any image from nodes if still not found
    if (!rawB64) {
      const anyImageNode = currentNodes.find(n => n.data && (n.data.imageUrl || n.data.sourceImageUrl || n.data.previewUrl));
      if (anyImageNode?.data) {
        rawB64 = (anyImageNode.data.imageUrl || anyImageNode.data.sourceImageUrl || anyImageNode.data.previewUrl) as string;
      }
    }

    let dna = currentDna;
    if (!dna) {
      const dnaNode = currentNodes.find(n => n.id === 'dna-node-1' || n.type === 'productDnaNode');
      if (dnaNode?.data) {
        dna = dnaNode.data as unknown as ProductVisualDNA;
      }
    }

    // Prioritize user-edited sceneNode on canvas, falling back to currentRun.plan.screens
    // 选中的若是已生成的海报（含模板 A），它的标题/提示词是成品信息，不能当分镜策划来源，否则标题会被当文案画进新图
    const isFinishedPosterNode = (n: Node) => n.type === 'generatedImageNode' || Boolean((n.data as any)?.templatePoster);
    const sceneNode = currentNodes.find(
      n => n.id === `scene-plan-node-${screenIndex}` ||
           n.data?.screenIndex === screenIndex ||
           Number(n.data?.screenIndex) === screenIndex ||
           n.id === `screen-${screenIndex}` ||
           (n.id === selectedNodeId && !isFinishedPosterNode(n) && (n.data?.promptSuggestion || n.data?.prompt))
    );

    const baseScreen = currentRun?.plan?.screens?.find(s => s.screenIndex === screenIndex);
    let screen = baseScreen;

    if (sceneNode?.data) {
      screen = {
        screenIndex: Number(sceneNode.data.screenIndex) || baseScreen?.screenIndex || screenIndex,
        screenTitle: (sceneNode.data.screenTitle as string) || (sceneNode.data.title as string) || baseScreen?.screenTitle || `第 ${screenIndex} 屏分镜`,
        coreSellingPoint: (sceneNode.data.coreSellingPoint as string) || (sceneNode.data.sellingPoint as string) || baseScreen?.coreSellingPoint || '',
        visualComposition: (sceneNode.data.visualComposition as string) || baseScreen?.visualComposition || '',
        lightingAndAtmosphere: (sceneNode.data.lightingAndAtmosphere as string) || baseScreen?.lightingAndAtmosphere || '',
        promptSuggestion: (sceneNode.data.promptSuggestion as string) || (sceneNode.data.prompt as string) || (sceneNode.data.promptHint as string) || baseScreen?.promptSuggestion || '',
        aspectRatio: (sceneNode.data.aspectRatio as string) || baseScreen?.aspectRatio || '3:4',
        lockedRules: baseScreen?.lockedRules || []
      };
    }

    // Fallback: If screen or promptSuggestion is missing, generate high-quality fallback prompt from default 9-plan template
    if (!screen || !screen.promptSuggestion) {
      const defaultPlan = createDefaultNinePlan({
        productName: dna?.subcategory || dna?.category || 'MANWAH 智能头等舱家居',
        category: dna?.category,
        materials: Array.isArray(dna?.materials) ? dna.materials : undefined
      });
      const fallbackScreen = defaultPlan.find(s => s.screenIndex === screenIndex) || defaultPlan[(screenIndex - 1) % defaultPlan.length];
      if (fallbackScreen) {
        screen = {
          screenIndex,
          screenTitle: fallbackScreen.screenTitle || `第 ${screenIndex} 屏分镜`,
          coreSellingPoint: fallbackScreen.headline || fallbackScreen.subheadline || '',
          visualComposition: fallbackScreen.safeAreaFocus || '专业商业摄影，中心构图，高保真商业级家居画质',
          lightingAndAtmosphere: '柔和自然采光，层次丰富',
          promptSuggestion: fallbackScreen.prompt,
          aspectRatio: '3:4',
          lockedRules: []
        };
      }
    }

    if (!screen) {
      addAgentMessage(`❌ 未找到第 ${screenIndex} 屏分镜策划。`);
      return false;
    }

    generatingScenesRef.current.add(screenIndex);
    const getModelFriendlyName = (m: string) => {
      if (m.includes('2.6-flare') || m.includes('2.6_flare')) return 'GPT 2.6 Flare (精细视觉创作·图文编辑)';
      if (m.includes('2.6-sunburst') || m.includes('2.6_sunburst')) return 'GPT 2.6 Sunburst (旗舰构图·标注引导编辑)';
      if (m.includes('flare')) return 'GPT 2.5 Flare (高保真原画·局部Mask重绘)';
      if (m.includes('sunburst')) return 'GPT 2.5 Sunburst (旗舰高光·质感重绘)';
      if (m.includes('banana')) return 'Nano Banana 2.1 (极速响应·轻量多图融合)';
      if (m.includes('gpt-image-2-c')) return 'GPT 2-c (高一致性母版)';
      if (m.includes('gpt-image-2-all')) return 'GPT 2-all (全能写实增强)';
      if (m.includes('gpt-image')) return 'OpenAI GPT Image 2';
      if (m.includes('3-pro')) return 'Google Gemini 3 Pro (复杂光影)';
      if (m === 'gemini-2.5-flash-image') return 'Google Gemini 2.5 Flash';
      return 'Google Gemini 3.1 Flash (极速高精)';
    };
    const modelLabel = getModelFriendlyName(modelToUse);
    const renderTaskId = fromBatch
      ? null
      : addAgentMessage('', {
          taskCard: { title: `渲染第 ${screenIndex} 屏${withText ? '（带文案）' : ''}`, status: 'running', detail: `${modelLabel} · ${resolutionToUse}` }
        });

    // Determine initial node position and exact scene plan node ID
    const currentRunId = currentRun?.id;
    let existingSceneNode = currentNodes.find(
      n =>
        n.type === 'scenePlanNode' &&
        ((n.data as any)?.sceneIndex === screenIndex || (n.data as any)?.screenIndex === Number(screenIndex)) &&
        (currentRunId ? ((n.data as any)?.runId === currentRunId || n.id.includes(currentRunId)) : true)
    );

    if (!existingSceneNode) {
      existingSceneNode = currentNodes.find(
        n =>
          n.type === 'scenePlanNode' &&
          ((n.data as any)?.sceneIndex === screenIndex || (n.data as any)?.screenIndex === Number(screenIndex))
      ) || currentNodes.find(n => n.id === `scene-plan-node-${screenIndex}` || n.id.endsWith(`-${screenIndex}`));
    }

    const actualSceneNodeId = existingSceneNode ? existingSceneNode.id : `scene-plan-node-${screenIndex}`;
    const sceneNodePos = existingSceneNode ? existingSceneNode.position : { x: 840, y: (screenIndex - 1) * 460 + 100 };

    const taskId = `task-${Date.now()}`;
    const startTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Create/Update ImageGenerationNode
    const taskNodeId = `img-gen-task-${actualSceneNodeId}`;
    setNodes(prev => {
      const existing = prev.find(n => n.id === taskNodeId);
      const taskNode: Node = {
        id: taskNodeId,
        type: 'imageGenerationNode',
        position: existing?.position || { x: sceneNodePos.x + 380, y: sceneNodePos.y },
        data: {
          runId: currentRunId || (existingSceneNode?.data as any)?.runId,
          sceneIndex: screenIndex,
          screenTitle: screen!.screenTitle,
          model: modelToUse,
          provider: isGpt ? 'openai' : 'google',
          aspectRatio: screen!.aspectRatio || '3:4',
          referenceCount: 1,
          status: 'generating',
          startTime,
          taskId
        }
      };
      if (existing) {
        return prev.map(n => (n.id === taskNodeId ? taskNode : n));
      }
      return [...prev, taskNode];
    });

    // Create edge: ScenePlanNode -> ImageGenerationNode
    const edgeTask = `edge-scene-gen-${actualSceneNodeId}`;
    setEdges(prev => {
      if (prev.some(e => e.id === edgeTask)) return prev;
      return [
        ...prev,
        {
          id: edgeTask,
          source: actualSceneNodeId,
          target: taskNodeId,
          sourceHandle: 'source',
          targetHandle: 'target',
          label: '生成画面',
          labelStyle: { fill: '#8C6F43', fontSize: 10, fontWeight: 700 },
          labelBgStyle: { fill: '#F9F5EF', rx: 4, ry: 4 },
          animated: true,
          style: { stroke: '#B28C5A', strokeWidth: 2 }
        }
      ];
    });

    try {
      const targetRaw = rawB64 || uploadedBase64Ref.current || uploadedBase64 || '';
      let resolvedImg = targetRaw ? await resolveClientImageDetailed(targetRaw) : { base64Data: '', mimeType: 'image/jpeg' };
      let cleanB64 = resolvedImg.base64Data;
      let detectedMime = resolvedImg.mimeType;

      if (!cleanB64) {
        const imgNode = currentNodes.find(n => n.id === 'img-node-1' || n.type === 'productImageNode' || n.type === 'productImage');
        if (imgNode?.data?.imageUrl) {
          const fallbackRes = await resolveClientImageDetailed(imgNode.data.imageUrl as string);
          cleanB64 = fallbackRes.base64Data;
          detectedMime = fallbackRes.mimeType;
        }
      }

      if (cleanB64 && !uploadedBase64Ref.current) {
        uploadedBase64Ref.current = cleanB64;
      }

      let fullPrompt = `${screen.promptSuggestion}\n\n[核心画幅与构图]: ${screen.visualComposition}，光影氛围：${screen.lightingAndAtmosphere}。`;

      if (dna) {
        const styleStr = Array.isArray(dna.style) ? dna.style.join('、') : (dna.style || '');
        const matStr = Array.isArray(dna.materials) ? dna.materials.join('、') : (dna.materials || '');
        const structStr = Array.isArray(dna.structuralFeatures)
          ? dna.structuralFeatures.map(f => `${f.name}: ${f.description}`).join('；')
          : '';
        const lockedStr = Array.isArray(dna.lockedFeatures)
          ? dna.lockedFeatures.map(f => `${f.name}(${f.rule})`).join('；')
          : '';

        fullPrompt += `\n\n[核心产品主角 DNA 强约束 (必须与参考主图完全一致)]:`;
        if (dna.category) fullPrompt += `\n- 产品品类: ${dna.category}`;
        if (dna.primaryColor) fullPrompt += `\n- 主色调与外观色彩: ${dna.primaryColor}`;
        if (matStr) fullPrompt += `\n- 核心材质与触感: ${matStr}`;
        if (styleStr) fullPrompt += `\n- 设计风格: ${styleStr}`;
        const isCombo = (dna.subcategory && (dna.subcategory.includes('组合') || dna.subcategory.includes('3+1') || dna.subcategory.includes('套'))) ||
          (Array.isArray(dna.structuralFeatures) && dna.structuralFeatures.some(f => {
            const txt = `${f.name} ${f.description}`;
            return txt.includes('单人') || txt.includes('3+1') || txt.includes('单椅') || txt.includes('组合');
          }));

        if (isCombo) {
          fullPrompt += `\n\n[核心成组产品强约束 (严禁遗漏组合单椅/单件)]:
- 本套产品为 3+1 客厅功能沙发成套组合（包含 3 人位米白主沙发 + 1 人位独立单椅/配件）；
- 画面中必须完整呈现主沙发与单人单椅两者构成的成套空间搭配，严禁只画单件三人位而忽略单人单椅；
- 保持主沙发与单椅的经典客厅主次陈列呼应，米白与焦糖棕对比呼应，质感高贵典雅。`;
        }

        fullPrompt += `\n- 极其重要: 画面中的核心家具/产品主体必须参照输入参考主图，保持造型结构、扶手样式、靠背弧度、包边缝线、面料材质与色调完全一致，严禁改变产品外观样式。`;
      } else {
        fullPrompt += `\n\n[家具强约束]: 必须保持核心产品结构与造型与参考图完全一致，扶手、靠背缝线、座包材质严格符合 DNA 描述。`;
      }

      if (reviewFeedback) {
        fullPrompt += `\n\n[根据审核反馈重绘调整]: ${reviewFeedback}`;
      }

      // Benchmark poster visual styling (aligning with high-end enterprise poster aesthetics)
      fullPrompt += `\n\n[标杆商业海报视觉场景与影棚美学规范 (对齐国际顶级大牌商业海报)]:
- 空间布景: 当代超大通顶全景落地窗横厅豪宅，视野开阔纵深，窗外呈现柔和晚霞夕阳/远山与浮云，营造松弛慵懒的家居生活格调；
- 光影氛围: 真实电影级柔和漫反射光线，通透窗光洒在沙发皮质微纹理与立体饱满靠背上，深色高级地毯与极简圆几相得益彰；
- 镜头质感: 专业商业中画幅相机 50mm 镜头拍摄，色彩纯正温润，空间透气，高级且充满生活温度。`;

      if (withText) {
        const mainTitle = screen.screenTitle || `第 ${screenIndex} 屏分镜`;
        const sellingPoint = screen.coreSellingPoint || '';
        const themeName = currentRun?.plan?.themeTitle || '敏华家居爆款全案企划';
        fullPrompt += `\n\n[高端商业企划海报排版与文字排版指令 (极其重要)]:
必须在海报画面中直接精准渲染并高质感排版以下企划文案，排版风格需深度对齐标杆商业海报标准：
1. 顶部艺术主标题 (Main Header/Title): “${mainTitle}”（采用高奢宋体/无衬线艺术大字，字距拉开，彰显品位）
2. 核心卖点标语 (Core Selling Point / Hero Text): “${sellingPoint}”（工整雅致副标）
3. 企划全案主题 (Series Name): “${themeName}”
4. 底部工艺解构特写栏 (Craftsmanship Callouts): 在画面底部工整排列 3 个工艺特写与标签（如：云感扶手、分段靠背、金属高脚），配以细腻线条解构。
- 整体字体字迹清晰不乱码，文字与背景有极佳明暗对比，留白考究，不遮挡沙发主体细节。`;
      } else {
        fullPrompt += `\n\n严禁在画面中渲染任何文字、尺寸标尺、箭头或 UI 元素，保持纯净无字室内摄影底图。`;
      }

      const targetRatio = screen.aspectRatio || planAspectRatio || '4:3';

      // Assert serializable DTO before call
      const generatePayload = {
        screenIndex,
        prompt: fullPrompt,
        aspectRatio: targetRatio,
        model: modelToUse,
        hasRefImage: !!cleanB64
      };
      assertSerializableRequestPayload(generatePayload, 'generatePayload');

      const activeMime = detectedMime || 'image/png';
      const imageAttachments: ImageAttachment[] = [];
      if (cleanB64) {
        imageAttachments.push({
          id: `ref-img-${Date.now()}-prod`,
          previewUrl: cleanB64.startsWith('data:') ? cleanB64 : `data:${activeMime};base64,${cleanB64}`,
          base64Data: cleanB64,
          mimeType: activeMime,
          width: 1024,
          height: 1024,
          role: 'primary_product',
          referenceAssetId: 'primary-product',
          order: 0
        });
      }

      // Add user uploaded style reference images so model actually incorporates their aesthetic!
      if (Array.isArray(styleRefImages) && styleRefImages.length > 0) {
        for (let i = 0; i < Math.min(styleRefImages.length, 2); i++) {
          const sImg = styleRefImages[i];
          if (sImg) {
            try {
              const sResolved = await resolveClientImageDetailed(sImg);
              if (sResolved.base64Data) {
                imageAttachments.push({
                  id: `style-ref-${Date.now()}-${i}`,
                  previewUrl: sImg,
                  base64Data: sResolved.base64Data,
                  mimeType: sResolved.mimeType,
                  width: 1024,
                  height: 1024,
                  role: 'style_reference',
                  referenceAssetId: `style-ref-${i}`,
                  order: i + 1
                });
              }
            } catch (sErr) {
              console.warn(`[SceneImage] 解析第 ${i} 张参考图失败:`, sErr);
            }
          }
        }
      }

      const result = await generateEditedImage(
        fullPrompt,
        imageAttachments,
        targetRatio,
        resolutionToUse,
        modelToUse as any,
        undefined,
        msg => console.log(`[SceneImage #${screenIndex}]`, msg)
      );

      // 上游出图失败时 generateEditedImage 会返回一张本地占位 SVG（isFallback）。
      // 不能把它当成图建节点：既不是真实渲染，还会让人以为成功了，这里直接按失败处理（占位图本身不扣点）
      if (result?.isFallback) {
        throw new Error(`渲染服务暂时没有出图（${result.fallbackError || '上游连接中断'}），未扣点，请稍后再试`);
      }

      if (result && result.imageUrl) {
        // Auto archive to history
        dbService.saveHistoryWithEvent({
          id: `canvas_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          imageUrl: result.imageUrl,
          prompt: fullPrompt,
          model: (result.actualModel || modelToUse) as any,
          roleUsed: `屏块 #${screenIndex} ${(screen as any).name || (screen as any).title || ''}`,
          timestamp: Date.now()
        }).catch(err => console.warn('Failed auto saving canvas image to history:', err));

        // Update task node status to completed
        setNodes(prev =>
          prev.map(n => {
            if (n.id === taskNodeId) {
              return {
                ...n,
                data: {
                  ...n.data,
                  status: 'completed',
                  model: result.actualModel || modelToUse,
                  provider: result.provider || (isGpt ? 'openai' : 'google')
                }
              };
            }
            return n;
          })
        );

        // Create new distinct GeneratedImageNode (parallel branching, non-overwriting)
        // 先落云端再建节点：节点里只放地址，不留大 base64
        const persistedImageUrl = await persistGeneratedImage(result.imageUrl, screen!.screenTitle || `第 ${screenIndex} 屏`);
        const resultNodeId = `gen-img-node-s${screenIndex}-${withText ? 'poster' : 'clean'}-${Date.now()}`;
        setNodes(prev => {
          const sameSceneImages = prev.filter(
            n => n.type === 'generatedImageNode' &&
            ((n.data as any)?.sceneIndex === screenIndex || (n.data as any)?.sceneIndex === Number(screenIndex))
          );
          const existingCount = sameSceneImages.length;
          const version = existingCount + 1;

          let targetX = sceneNodePos.x + 780; // Default X for 1st image node (840 + 780 = 1620)
          if (sameSceneImages.length > 0) {
            const maxX = Math.max(...sameSceneImages.map(n => n.position.x));
            targetX = Math.max(targetX, maxX + 380);
          }

          const genNode: Node = {
            id: resultNodeId,
            type: 'generatedImageNode',
            position: { x: targetX, y: sceneNodePos.y },
            data: {
              sceneIndex: screenIndex,
              screenTitle: screen!.screenTitle,
              coreSellingPoint: screen!.coreSellingPoint,
              themeTitle: currentRun?.plan?.themeTitle,
              withText: !!withText,
              imageUrl: persistedImageUrl,
              dimensions: resolutionToUse === '4K' ? '3840x2160' : resolutionToUse === '2K' ? '2560x1440' : '1024x1365',
              aspectRatio: screen!.aspectRatio || '3:4',
              model: result.actualModel || modelToUse,
              provider: result.provider || (isGpt ? 'openai' : 'google'),
              generatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              generationDurationMs: Date.now() - sceneGenStartedAt,
              version,
              reviewStatus: 'pendingReview',
              prompt: fullPrompt,
              cleanBackgroundUrl: withText ? undefined : persistedImageUrl,
              rawImageUrl: persistedImageUrl,
              onOpenPosterStudio: () => onOpenPosterStudioRef.current?.(screenIndex),
              onGeneratePoster: () => handleGenerateSceneImage(screenIndex, undefined, modelToUse, resolutionToUse, true),
              onRegenerate: () => handleGenerateSceneImage(screenIndex, undefined, modelToUse, resolutionToUse, false),
              onViewDetail: () => {
                setSelectedNodeId(resultNodeId);
                setSelectedSceneIndex(screenIndex);
              },
              onApprove: () => handleApproveSceneImage(screenIndex),
              onReject: (feedback: string) => handleRejectSceneImage(screenIndex, feedback)
            }
          };

          return [...prev, genNode];
        });

        // Edge: ImageGenerationNode -> GeneratedImageNode
        const edgeResult = `edge-gen-result-${resultNodeId}`;
        setEdges(prev => {
          if (prev.some(e => e.id === edgeResult)) return prev;
          return [
            ...prev,
            {
              id: edgeResult,
              source: taskNodeId,
              target: resultNodeId,
              sourceHandle: 'source',
              targetHandle: 'target',
              label: withText ? '带字海报' : '生成底图',
              labelStyle: { fill: '#10B981', fontSize: 10, fontWeight: 700 },
              labelBgStyle: { fill: '#ECFDF5', rx: 4, ry: 4 },
              animated: false,
              style: { stroke: '#10B981', strokeWidth: 2 }
            }
          ];
        });

        if (renderTaskId) {
          finishTaskCard(renderTaskId, 'done', '已加入画布流程，成图见下方', { nodeId: resultNodeId });
        }
        postImageResultToChat({
          imageUrl: result.imageUrl,
          title: `第 ${screenIndex} 屏 · ${screen!.screenTitle}`,
          nodeId: resultNodeId,
          sceneIndex: screenIndex,
          withText: !!withText,
          source: withText ? 'poster' : 'clean'
        });
        return true;
      } else {
        throw new Error('渲染服务未响应有效图片');
      }
    } catch (err: any) {
      const errText = err?.message || '渲染图片失败';
      setNodes(prev =>
        prev.map(n => {
          if (n.id === taskNodeId) {
            return {
              ...n,
              data: {
                ...n.data,
                status: 'error',
                errorMsg: errText
              }
            };
          }
          return n;
        })
      );
      if (renderTaskId) finishTaskCard(renderTaskId, 'failed', errText);
      else addAgentMessage(`❌ 第 ${screenIndex} 屏渲染图片失败：${errText}`);
      return false;
    } finally {
      generatingScenesRef.current.delete(screenIndex);
    }
  };

  // 非主产品图节点：上传的图只进这个节点（先传到存储拿地址，避免草稿里塞大图）
  const handleUploadToProductNode = async (nodeId: string, file: File) => {
    if (!file.type.startsWith('image/')) return;
    hasUserMutationRef.current = true;
    addUserMessage(`新增产品图：${file.name}`, [URL.createObjectURL(file)]);
    const patch = (data: Record<string, unknown>) =>
      setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n)));
    patch({ status: 'uploading', fileName: file.name, errorMsg: undefined });
    try {
      const url = await uploadChatImage(file);
      // 尺寸从本地文件读：存储地址在网络抖动时可能迟迟不返回，不能让节点一直卡在上传中
      const dimensions = await new Promise<{ width: number; height: number }>(resolve => {
        const localUrl = URL.createObjectURL(file);
        const done = (d: { width: number; height: number }) => {
          URL.revokeObjectURL(localUrl);
          resolve(d);
        };
        const timer = setTimeout(() => done({ width: 0, height: 0 }), 8000);
        const img = new Image();
        img.onload = () => {
          clearTimeout(timer);
          done({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = () => {
          clearTimeout(timer);
          done({ width: 0, height: 0 });
        };
        img.src = localUrl;
      });
      patch({
        imageUrl: url,
        fileName: file.name,
        mimeType: file.type,
        fileSize: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        dimensions,
        status: 'completed',
        uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    } catch (err: any) {
      patch({ status: 'error', errorMsg: err?.message || '上传失败' });
    }
  };
  // 在画布上新增一个产品图节点并把图放进去（对话框里贴多张产品图时用），不动主产品图
  const handleAddProductNode = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    hasUserMutationRef.current = true;
    const newId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setNodes(prev => {
      const products = prev.filter(n => n.id === 'img-node-1' || n.type === 'productImageNode' || n.type === 'productImage');
      const anchor = products.find(n => isMainProductNodeId(n.id)) || products[0];
      const x = anchor?.position?.x ?? 150;
      const y = products.length > 0 ? Math.max(...products.map(n => n.position?.y ?? 0)) + 460 : 150;
      return [
        ...prev,
        { id: newId, type: 'productImageNode', position: { x, y }, data: { fileName: file.name, imageUrl: '', status: 'uploading', uploadedAt: '刚刚' } }
      ];
    });
    void handleUploadToProductNode(newId, file);
  };
  const handleClearProductNode = (nodeId: string) => {
    hasUserMutationRef.current = true;
    setNodes(prev =>
      prev.map(n =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, imageUrl: '', fileName: undefined, fileSize: undefined, dimensions: undefined, status: 'idle', uploadedAt: undefined } }
          : n
      )
    );
  };

  // 模板 A 海报（原型）：概念 → 主场景底图 → 细节裁切 + 真实字体排版，成图进画布并回传对话。
  // 画布上可以有多张产品图，每张各自生成、可同时进行：锁、避重名、成图位置都按产品节点区分。
  /**
   * 模板海报成品的落点：在起点右侧按 3 列网格找第一个没被占用的位置，
   * 同一产品的各版海报（含对话里生成的浅色版、修改版）就会整齐排成一组，不再互相叠压或散落。
   */
  const findFreePosterSlot = (all: Node[], start: { x: number; y: number }, w = 520, h = 640): { x: number; y: number } => {
    for (let k = 0; k < 60; k++) {
      const p = { x: start.x + (k % 3) * w, y: start.y + Math.floor(k / 3) * h };
      if (!all.some(n => Math.abs(n.position.x - p.x) < w - 20 && Math.abs(n.position.y - p.y) < h - 20)) return p;
    }
    return { x: start.x, y: start.y + all.length * 40 };
  };
  const templatePosterRunningRef = useRef<Set<string>>(new Set());
  const [templatePosterRunningIds, setTemplatePosterRunningIds] = useState<string[]>([]);
  const handleGenerateTemplatePoster = async (params?: AgentActionParams): Promise<boolean> => {
    const currentNodes = nodesRef.current || nodes;
    const isProductNode = (n: Node) => n.id === 'img-node-1' || n.type === 'productImageNode' || n.type === 'productImage';
    const productNodes = currentNodes.filter(n => isProductNode(n) && typeof n.data?.imageUrl === 'string' && n.data.imageUrl);
    // 选哪张产品图：指定的节点 → 当前选中的产品图 → 画布上唯一的产品图
    const productNode =
      (params?.nodeId ? productNodes.find(n => n.id === params.nodeId) : undefined) ||
      (selectedNodeId ? productNodes.find(n => n.id === selectedNodeId) : undefined) ||
      (productNodes.length === 1 ? productNodes[0] : undefined);
    if (!productNode && productNodes.length > 1) {
      addAgentMessage(`画布上有 ${productNodes.length} 张产品图，请先点选要做海报的那一张，或直接点产品图上的「4/3 产品海报」按钮。`);
      return false;
    }
    let productImage = (productNode?.data?.imageUrl as string) || '';
    if (!productImage) {
      const raw = uploadedBase64Ref.current || uploadedBase64;
      if (raw) productImage = raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}`;
    }
    if (!productImage) {
      addAgentMessage('❌ 还没有产品主图，请先上传产品图再生成4/3 产品海报。');
      return false;
    }
    const productKey = productNode?.id || 'img-node-1';
    const productLabel = (productNode?.data?.fileName as string) || '产品图';
    if (templatePosterRunningRef.current.has(productKey)) {
      addAgentMessage(`「${productLabel}」的4/3 产品海报正在生成中，请等这一张完成后再试；其他产品图可以同时生成。`);
      return false;
    }

    const currentRun = agentRunRef.current || agentRun;
    // DNA 只属于主产品图；其他产品图以图片为准
    const dna = isMainProductNodeId(productKey) ? activeDnaRef.current || activeDna || currentRun?.dna : undefined;
    // 这张产品图已出过的海报：新海报避开它们的命名与场景（旧版没记录产品的海报，按连线归属）
    const used = currentNodes
      .filter(n => (n.data as any)?.templatePoster?.concept?.name)
      .filter(n => {
        const owner = (n.data as any).templatePoster.productNodeId;
        if (owner) return owner === productKey;
        return (edgesRef.current || edges).some(e => e.target === n.id && e.source === productKey);
      })
      .map(n => {
        const c = (n.data as any).templatePoster.concept;
        return { name: c.name, idea: c.idea, sceneDirection: c.sceneDirection, angle: c.angle, sellingPoint: c.sellingPoint, keyElements: c.keyElements };
      });
    // 企划也只属于主产品图
    const isMainProduct = isMainProductNodeId(productKey);
    const screen = isMainProduct && params?.screenIndex ? currentRun?.plan?.screens?.find(s => s.screenIndex === params.screenIndex) : undefined;
    const planContext = !isMainProduct ? '' : [
      currentRun?.plan?.themeTitle ? `企划主题：${currentRun.plan.themeTitle}` : '',
      currentRun?.plan?.targetAudience ? `目标客群：${currentRun.plan.targetAudience}` : '',
      screen?.coreSellingPoint ? `本屏卖点：${screen.coreSellingPoint}` : ''
    ].filter(Boolean).join('\n');

    templatePosterRunningRef.current.add(productKey);
    setTemplatePosterRunningIds(Array.from(templatePosterRunningRef.current));
    const taskTitle = productNodes.length > 1 ? `4/3 产品海报 · ${productLabel}` : '4/3 产品海报';
    const taskStartedAt = Date.now();
    const referenceImage = params?.referenceImageUrl || undefined;
    const taskId = addAgentMessage('', {
      taskCard: {
        title: referenceImage ? `${taskTitle}（按参考图）` : taskTitle,
        status: 'running',
        detail: referenceImage ? '1/3 读参考图的场景与氛围，构思命名和细节文案…' : '1/3 构思命名、场景与细节文案…'
      }
    });
    const { canvasId } = normalizeCanvasIds(activeProjectRef.current?.id || workspaceIdParam);

    const postJson = async (url: string, body: any) => {
      const headers = await getAuthHeaders();
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message || `请求失败 (${res.status})`);
      return json;
    };
    const storeImage = (dataUrl: string) => persistGeneratedImage(dataUrl, '4/3 产品海报');

    try {
      const { concept } = await postJson('/api/poster-templates/concept', {
        productImage,
        referenceImage,
        dna,
        hint: params?.hint,
        planContext,
        used
      });
      finishTaskCard(taskId, 'running', `2/3 「${concept.name}」：${concept.idea || concept.subtitle}\n正在生成主场景底图（约 1–3 分钟）…`);

      const hero = await postJson('/api/poster-templates/template-a/hero', {
        concept,
        productImage,
        referenceImage,
        dna,
        model: selectedModel || undefined,
        resolution: templateA4K ? '4K' : (selectedResolution || '2K')
      });
      const heroUrl = await storeImage(hero.imageDataUrl);
      finishTaskCard(taskId, 'running', `3/3 「${concept.name}」：定位细节部位并排版…`);

      const composed = await postJson('/api/poster-templates/template-a/compose', { heroImage: heroUrl, concept, outputScale: templateA4K ? 2 : 1 });
      const posterUrl = await storeImage(composed.imageDataUrl);

      const resultNodeId = `template-poster-a-${Date.now()}`;
      const basePos = productNode?.position || { x: 100, y: 100 };
      setNodes(prev => {
        const posterNode: Node = {
          id: resultNodeId,
          type: 'generatedImageNode',
          position: findFreePosterSlot(prev, { x: basePos.x + 460, y: basePos.y }),
          data: {
            sceneIndex: params?.screenIndex || 0,
            // 只放海报名：screenTitle 会被排版叠加、企划出图当标题用，不能带“模板 A”标签（节点页脚显示时再加前缀）
            screenTitle: concept.name,
            coreSellingPoint: concept.subtitle,
            themeTitle: concept.idea,
            withText: true,
            imageUrl: posterUrl,
            rawImageUrl: posterUrl,
            heroImageUrl: heroUrl,
            dimensions: `${composed.width}x${composed.height}`,
            aspectRatio: '4:3',
            model: hero.model,
            generatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            generationDurationMs: Date.now() - taskStartedAt,
            version: 1,
            reviewStatus: 'pendingReview',
            prompt: hero.prompt,
            templatePoster: { template: 'A', productNodeId: productKey, concept, details: composed.details, layout: composed.layout, ...(referenceImage ? { referenceImageUrl: referenceImage } : {}) }
          }
        };
        return [...prev, posterNode];
      });
      if (productNode) {
        setEdges(prev => [
          ...prev,
          {
            id: `edge-template-poster-${resultNodeId}`,
            source: productNode.id,
            target: resultNodeId,
            sourceHandle: 'source',
            targetHandle: 'target',
            label: '4/3 产品海报',
            labelStyle: { fill: '#B28C5A', fontSize: 10, fontWeight: 700 },
            labelBgStyle: { fill: '#FAF6EF', rx: 4, ry: 4 },
            style: { stroke: '#B28C5A', strokeWidth: 2 }
          }
        ]);
      }

      const warnings: string[] = Array.isArray(composed.warnings) ? composed.warnings : [];
      finishTaskCard(taskId, 'done', warnings.length ? `已完成，${warnings.join('；')}` : '已完成，海报已加入画布', { nodeId: resultNodeId });
      postImageResultToChat({
        imageUrl: posterUrl,
        title: `4/3 产品海报 · ${concept.name}`,
        nodeId: resultNodeId,
        withText: true,
        source: 'poster',
        detail: [concept.subtitle, concept.inspiration].filter(Boolean).join(' / ')
      });
      return true;
    } catch (err: any) {
      finishTaskCard(taskId, 'failed', err?.message || '4/3 产品海报生成失败');
      return false;
    } finally {
      templatePosterRunningRef.current.delete(productKey);
      setTemplatePosterRunningIds(Array.from(templatePosterRunningRef.current));
    }
  };

  // 沙发面料海报（模板 B）：构思 → 沙发改白底 / 抱枕 / 氛围照并行出图 → 抠图、取细节与色卡、排版。
  // 出图每张都扣点，所以某一张失败不丢弃其他已出的图：抱枕失败就不放抱枕，氛围照失败就留白并提示。
  const handleGenerateFabricPoster = async (params?: AgentActionParams): Promise<boolean> => {
    const currentNodes = nodesRef.current || nodes;
    const isProductNode = (n: Node) => n.id === 'img-node-1' || n.type === 'productImageNode' || n.type === 'productImage';
    const productNodes = currentNodes.filter(n => isProductNode(n) && typeof n.data?.imageUrl === 'string' && n.data.imageUrl);
    const productNode =
      (params?.nodeId ? productNodes.find(n => n.id === params.nodeId) : undefined) ||
      (selectedNodeId ? productNodes.find(n => n.id === selectedNodeId) : undefined) ||
      (productNodes.length === 1 ? productNodes[0] : undefined);
    if (!productNode && productNodes.length > 1) {
      addAgentMessage(`画布上有 ${productNodes.length} 张产品图，请先点选要做氛围海报的那一张，或直接点沙发图上的「氛围海报」按钮。`);
      return false;
    }
    let productImage = (productNode?.data?.imageUrl as string) || '';
    if (!productImage) {
      const raw = uploadedBase64Ref.current || uploadedBase64;
      if (raw) productImage = raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}`;
    }
    if (!productImage) {
      addAgentMessage('❌ 还没有沙发图，请先上传沙发图再生成氛围海报。');
      return false;
    }
    const productKey = productNode?.id || 'img-node-1';
    const lockKey = `fabric:${productKey}`;
    const productLabel = (productNode?.data?.fileName as string) || '沙发图';
    if (templatePosterRunningRef.current.has(lockKey)) {
      addAgentMessage(`「${productLabel}」的氛围海报正在生成中，请等这一张完成后再试。`);
      return false;
    }

    // 版式：指定的 → 同一沙发已出过的面料海报数量决定（第 1 张参考图 1，第 2 张参考图 2，交替）
    const existing = currentNodes.filter(n => (n.data as any)?.templatePoster?.template === 'B' && (n.data as any).templatePoster.productNodeId === productKey).length;
    const layout: 'collage4' | 'hero3' = params?.fabricLayout || (existing % 2 === 0 ? 'collage4' : 'hero3');
    // 版式用到哪几条氛围照（与服务端 FABRIC_LAYOUTS.photoOrder 一致）
    const moodIndexes = layout === 'hero3' ? [0, 2, 3] : [0, 1, 2, 3];
    // 左上角型号：没指定就用文件名（去掉扩展名），如 12595M.jpg → 12595M
    // 型号默认不显示（不再拿文件名充数），用户给了才写，之后可在对话里改
    const code = params?.fabricCode ?? '';
    const label = params?.fabricLabel ?? '';

    templatePosterRunningRef.current.add(lockKey);
    setTemplatePosterRunningIds(Array.from(templatePosterRunningRef.current));
    const taskStartedAt = Date.now();
    const taskId = addAgentMessage('', {
      taskCard: { title: productNodes.length > 1 ? `氛围海报 · ${productLabel}` : '氛围海报', status: 'running', detail: '1/3 构思皮革色、抱枕图案与氛围照…' }
    });
    const postJson = async (url: string, body: any) => {
      const headers = await getAuthHeaders();
      const res = await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message || `请求失败 (${res.status})`);
      return json;
    };
    const storeImage = (dataUrl: string) => persistGeneratedImage(dataUrl, '氛围海报');
    const model = selectedModel || undefined;
    const resolution = selectedResolution || '2K';

    try {
      // 这张沙发已出过的氛围照方向（场景/人像背景/街拍），新海报避开，避免每张都一样
      const usedTags = currentNodes
        .filter(n => (n.data as any)?.templatePoster?.template === 'B' && (n.data as any).templatePoster.productNodeId === productKey)
        .flatMap(n => {
          const t = (n.data as any).templatePoster.concept?.tags;
          return t ? [t.scene?.id, t.portrait?.id, t.street?.id].filter(Boolean) : [];
        });
      const { concept } = await postJson('/api/poster-templates/fabric/concept', { productImage, hint: params?.hint, used: usedTags });
      finishTaskCard(taskId, 'running', `2/3 「${concept.leatherName}」：沙发改白底、抱枕与 ${moodIndexes.length} 张氛围照并行生成中（约 2–5 分钟，每张扣点）…`);

      const sofaP = postJson('/api/poster-templates/fabric/sofa', { productImage, model, resolution }).then(r => storeImage(r.imageDataUrl));
      // 网关偶尔超时，抱枕/氛围照失败时自动再试一次（沙发是版面主体，失败直接报错，不重试以免重复扣点）
      const retryOnce = <T,>(fn: () => Promise<T>) => fn().catch(() => fn());
      const pillowP = retryOnce(() => postJson('/api/poster-templates/fabric/pillow', { concept, model, resolution }).then(r => storeImage(r.imageDataUrl)));
      const moodPs = moodIndexes.map(i =>
        retryOnce(() => postJson('/api/poster-templates/fabric/mood', { concept, shotIndex: i, layout, model, resolution }).then(r => storeImage(r.imageDataUrl)))
      );
      const [sofaR, pillowR, ...moodRs] = await Promise.allSettled([sofaP, pillowP, ...moodPs]);
      if (sofaR.status !== 'fulfilled') throw new Error(`沙发改白底失败：${(sofaR.reason as any)?.message || '未知错误'}（其余已出的图未使用）`);
      const failures: string[] = [];
      if (pillowR.status !== 'fulfilled') failures.push(`抱枕生成失败（已省略）：${(pillowR.reason as any)?.message || ''}`);
      // 氛围照按“条目下标”放进数组，没出的位置留空，排版时留白
      const moodImages: Array<string | undefined> = [undefined, undefined, undefined, undefined];
      moodRs.forEach((r, k) => {
        if (r.status === 'fulfilled') moodImages[moodIndexes[k]] = r.value;
        else failures.push(`第 ${k + 1} 张氛围照失败（已留白）：${(r.reason as any)?.message || ''}`);
      });
      finishTaskCard(taskId, 'running', '3/3 抠图、取圆形细节与面料色卡并排版…');

      const composed = await postJson('/api/poster-templates/fabric/compose', {
        sofaImage: sofaR.value,
        pillowImage: pillowR.status === 'fulfilled' ? pillowR.value : undefined,
        moodImages,
        concept,
        layout,
        code,
        label
      });
      const posterUrl = await storeImage(composed.imageDataUrl);

      const resultNodeId = `template-poster-b-${Date.now()}`;
      const basePos = productNode?.position || { x: 100, y: 100 };
      setNodes(prev => {
        const posterNode: Node = {
          id: resultNodeId,
          type: 'generatedImageNode',
          position: findFreePosterSlot(prev, { x: basePos.x + 460, y: basePos.y }),
          data: {
            sceneIndex: 0,
            screenTitle: code || '氛围海报',
            coreSellingPoint: concept.leatherName,
            themeTitle: '氛围海报',
            withText: true,
            imageUrl: posterUrl,
            rawImageUrl: posterUrl,
            heroImageUrl: sofaR.value,
            dimensions: `${composed.width}x${composed.height}`,
            aspectRatio: '3:2',
            generatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            generationDurationMs: Date.now() - taskStartedAt,
            version: 1,
            reviewStatus: 'pendingReview',
            templatePoster: { template: 'B', productNodeId: productKey, concept, layout, code, label, details: composed.details, assets: { sofa: sofaR.value, pillow: pillowR.status === 'fulfilled' ? pillowR.value : null, moods: moodImages } }
          }
        };
        return [...prev, posterNode];
      });
      if (productNode) {
        setEdges(prev => [
          ...prev,
          {
            id: `edge-template-poster-${resultNodeId}`,
            source: productNode.id,
            target: resultNodeId,
            sourceHandle: 'source',
            targetHandle: 'target',
            label: '氛围海报',
            labelStyle: { fill: '#B28C5A', fontSize: 10, fontWeight: 700 },
            labelBgStyle: { fill: '#FAF6EF', rx: 4, ry: 4 },
            style: { stroke: '#B28C5A', strokeWidth: 2 }
          }
        ]);
      }
      const warnings: string[] = [...failures, ...(Array.isArray(composed.warnings) ? composed.warnings : [])];
      finishTaskCard(taskId, 'done', warnings.length ? `已完成，${warnings.join('；')}` : '已完成，海报已加入画布', { nodeId: resultNodeId });
      postImageResultToChat({
        imageUrl: posterUrl,
        title: `氛围海报 · ${code || concept.leatherName}`,
        nodeId: resultNodeId,
        withText: true,
        source: 'poster',
        detail: [concept.leatherName, layout === 'hero3' ? '版式 2' : '版式 1'].join(' / ')
      });
      return true;
    } catch (err: any) {
      finishTaskCard(taskId, 'failed', err?.message || '氛围海报生成失败');
      return false;
    } finally {
      templatePosterRunningRef.current.delete(lockKey);
      setTemplatePosterRunningIds(Array.from(templatePosterRunningRef.current));
    }
  };

  // 修改已生成的面料海报：沿用已有素材，只重出被点名的抱枕/氛围图，其余重新排版；结果是新版本节点，旧版保留。
  const handleEditFabricPoster = async (params?: AgentActionParams): Promise<boolean> => {
    const currentNodes = nodesRef.current || nodes;
    const fabricNodes = currentNodes.filter(n => n.id.startsWith('template-poster-b-') && (n.data as any)?.templatePoster?.template === 'B');
    // 没点名时只在本会话、未锁定的海报里找最新一张；点名或选中的照常可改
    const activeFabric = fabricNodes.filter(n => {
      const d = n.data as any;
      return !d?.groupLocked && (!d?.conversationId || d.conversationId === currentConversationRef.current?.id);
    });
    const target =
      (params?.nodeId ? fabricNodes.find(n => n.id === params.nodeId) : undefined) ||
      (selectedNodeId ? fabricNodes.find(n => n.id === selectedNodeId) : undefined) ||
      activeFabric[activeFabric.length - 1];
    if (!target) {
      addAgentMessage('画布上还没有氛围海报，先点沙发图上的「氛围海报」生成一张，再来修改。');
      return false;
    }
    const lockKey = `fabric-edit:${target.id}`;
    if (templatePosterRunningRef.current.has(lockKey)) {
      addAgentMessage('这张氛围海报正在修改中，请等它完成。');
      return false;
    }
    const tp = (target.data as any).templatePoster;
    const concept = JSON.parse(JSON.stringify(tp.concept));
    const layout: 'collage4' | 'hero3' = params?.fabricLayout || tp.layout || 'collage4';
    const slots = layout === 'hero3' ? [0, 2, 3] : [0, 1, 2, 3];
    const moods: Array<string | undefined> = [0, 1, 2, 3].map(i => (tp.assets?.moods?.[i] as string) || undefined);
    let pillow: string | null = params?.fabricNoPillow ? null : tp.assets?.pillow || null;
    const regenMoods = new Set<number>();
    for (const m of params?.fabricMoods || []) {
      const idx = slots[m.slot - 1];
      if (idx === undefined) continue;
      concept.moodShots[idx].prompt = m.prompt;
      regenMoods.add(idx);
    }
    // 换版式后新增的格子如果还没有图，也要出
    for (const idx of slots) if (!moods[idx]) regenMoods.add(idx);
    const regenPillow = Boolean(params?.fabricPillow);
    if (params?.fabricPillow) concept.pillowPattern = params.fabricPillow;
    const code = params?.fabricCode ?? tp.code ?? String((target.data as any).screenTitle || '');
    const label = params?.fabricLabel ?? tp.label ?? '';
    const pillowScale = params?.fabricPillowScale ?? tp.pillowScale;
    const regenCount = regenMoods.size + (regenPillow ? 1 : 0);

    templatePosterRunningRef.current.add(lockKey);
    setTemplatePosterRunningIds(Array.from(templatePosterRunningRef.current));
    const taskStartedAt = Date.now();
    const taskId = addAgentMessage('', {
      taskCard: { title: '修改氛围海报', status: 'running', detail: regenCount ? `重出 ${regenCount} 张图（每张扣点），其余沿用已有素材…` : '沿用已有素材重新排版…' }
    });
    const postJson = async (url: string, body: any) => {
      const headers = await getAuthHeaders();
      const res = await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message || `请求失败 (${res.status})`);
      return json;
    };
    const storeImage = (dataUrl: string) => persistGeneratedImage(dataUrl, '氛围海报');
    const retryOnce = <T,>(fn: () => Promise<T>) => fn().catch(() => fn());
    const model = selectedModel || undefined;
    const resolution = selectedResolution || '2K';
    const warnings: string[] = [];

    try {
      const jobs: Array<Promise<void>> = [];
      if (regenPillow) {
        jobs.push(
          retryOnce(() => postJson('/api/poster-templates/fabric/pillow', { concept, model, resolution }).then(r => storeImage(r.imageDataUrl)))
            .then(url => { pillow = url; })
            .catch(e => { warnings.push(`抱枕重出失败，沿用原来的：${e?.message || ''}`); concept.pillowPattern = tp.concept.pillowPattern; })
        );
      }
      for (const idx of regenMoods) {
        jobs.push(
          retryOnce(() => postJson('/api/poster-templates/fabric/mood', { concept, shotIndex: idx, layout, model, resolution }).then(r => storeImage(r.imageDataUrl)))
            .then(url => { moods[idx] = url; })
            .catch(e => {
              warnings.push(`第 ${slots.indexOf(idx) + 1} 格氛围图重出失败，${tp.assets?.moods?.[idx] ? '沿用原来的' : '该格留白'}：${e?.message || ''}`);
              if (tp.concept.moodShots[idx]) concept.moodShots[idx].prompt = tp.concept.moodShots[idx].prompt;
            })
        );
      }
      await Promise.all(jobs);
      finishTaskCard(taskId, 'running', '重新抠图、取细节并排版…');

      const composed = await postJson('/api/poster-templates/fabric/compose', {
        sofaImage: tp.assets.sofa,
        pillowImage: pillow || undefined,
        moodImages: moods,
        concept,
        layout,
        code,
        label,
        pillowScale
      });
      const posterUrl = await storeImage(composed.imageDataUrl);

      const resultNodeId = `template-poster-b-${Date.now()}`;
      const base = target.position || { x: 100, y: 100 };
      const version = Number((target.data as any).version || 1) + 1;
      setNodes(prev => {
        const node: Node = {
          id: resultNodeId,
          type: 'generatedImageNode',
          position: findFreePosterSlot(prev, { x: base.x + 520, y: base.y }),
          data: {
            ...(target.data as any),
            imageUrl: posterUrl,
            rawImageUrl: posterUrl,
            screenTitle: code || (target.data as any).screenTitle,
            dimensions: `${composed.width}x${composed.height}`,
            generatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            generationDurationMs: Date.now() - taskStartedAt,
            version,
            reviewStatus: 'pendingReview',
            templatePoster: {
              ...tp,
              concept,
              layout,
              code,
              label,
              pillowScale,
              details: composed.details,
              assets: { sofa: tp.assets.sofa, pillow, moods }
            }
          }
        };
        return [...prev, node];
      });
      setEdges(prev => [
        ...prev,
        {
          id: `edge-fabric-edit-${resultNodeId}`,
          source: target.id,
          target: resultNodeId,
          sourceHandle: 'source',
          targetHandle: 'target',
          label: `修改版 v${version}`,
          labelStyle: { fill: '#B28C5A', fontSize: 10, fontWeight: 700 },
          labelBgStyle: { fill: '#FAF6EF', rx: 4, ry: 4 },
          style: { stroke: '#B28C5A', strokeWidth: 2, strokeDasharray: '6 4' }
        }
      ]);
      const all = [...warnings, ...(Array.isArray(composed.warnings) ? composed.warnings : [])];
      finishTaskCard(taskId, 'done', all.length ? `已完成，${all.join('；')}` : '已完成，修改版已加入画布', { nodeId: resultNodeId });
      postImageResultToChat({
        imageUrl: posterUrl,
        title: `氛围海报 · ${code || concept.leatherName} · v${version}`,
        nodeId: resultNodeId,
        withText: true,
        source: 'poster',
        detail: regenCount ? `重出 ${regenCount} 张，其余沿用` : '沿用已有素材重新排版'
      });
      return true;
    } catch (err: any) {
      finishTaskCard(taskId, 'failed', err?.message || '修改氛围海报失败');
      return false;
    } finally {
      templatePosterRunningRef.current.delete(lockKey);
      setTemplatePosterRunningIds(Array.from(templatePosterRunningRef.current));
    }
  };

  // ───────── 面料色卡海报（模板 C）：本地面料素材 → 主色 + 自动配色 → 三种版式排版 ─────────
  // 不出图、不扣点（除非用户要 AI 氛围图）；所有图片/文字排版在服务端 compose 完成，
  // 版式、名称、说明、型号、底色都能在对话里改，改动只重新排版，几秒完成。
  const textilePostJson = async (url: string, body: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(json?.error?.message || `请求失败 (${res.status})`);
    return json;
  };

  const textileNodePosition = (): { x: number; y: number } => {
    const list = nodesRef.current || nodes;
    if (!list.length) return { x: 100, y: 100 };
    const maxX = Math.max(...list.map(n => n.position.x + (Number((n as any).width) || 420)));
    const minY = Math.min(...list.map(n => n.position.y));
    const siblings = list.filter(n => n.id.startsWith('template-poster-c-')).length;
    return { x: maxX + 60, y: minY + siblings * 460 };
  };

  /** 选好主面料后在画布上放一个“主面料”节点（已有就更新），海报生成后从它连线到成品 */
  const upsertFabricMainNode = (assetId: string, name: string, imageUrl?: string, state: 'pending' | 'running' | 'done' = 'pending') => {
    const id = `fabric-main-${assetId}`;
    hasUserMutationRef.current = true;
    setNodes(prev => {
      if (prev.some(n => n.id === id)) {
        return prev.map(n => (n.id === id ? { ...n, data: { ...(n.data as any), name, imageUrl: imageUrl || (n.data as any).imageUrl, state } } : n));
      }
      const pos = textileNodePosition();
      return [...prev, { id, type: 'fabricMainNode', position: pos, data: { name, imageUrl, state } } as Node];
    });
    return id;
  };

  /** 挑配色面料：用户点名的按名字找；否则按主色从同一文件夹自动挑（颜色拉开、彼此协调）。找不到/有歧义时抛出可直接给用户看的话 */
  const pickTextileSwatches = async (
    main: LocalAssetItem,
    params: AgentActionParams | undefined,
    wantCount: number,
    onProgress: (done: number, total: number) => void
  ): Promise<LocalAssetItem[]> => {
    const images = localAssetService.getAssets().filter(a => a.type === 'image' && a.id !== main.id);
    const others = Math.max(1, Math.min(5, wantCount - 1));
    if (params?.textileSwatches?.length) {
      const picked: LocalAssetItem[] = [];
      for (const kw of params.textileSwatches) {
        const r = findAssetByKeyword(images, kw);
        if (!r.match) {
          throw new Error(
            r.ambiguous.length
              ? `「${kw}」匹配到多张：${r.ambiguous.map(a => a.name).join('、')}，请说具体的文件名。`
              : `在「${localAssetService.getDirectoryName()}」里没找到「${kw}」，请说准确的文件名，或不指定让我自动配色。`
          );
        }
        if (!picked.includes(r.match)) picked.push(r.match);
      }
      return picked.slice(0, 5);
    }
    const dirOf = (a: LocalAssetItem) => (a.path.includes('/') ? a.path.slice(0, a.path.lastIndexOf('/')) : '');
    let pool = images.filter(a => dirOf(a) === dirOf(main));
    if (pool.length < others) pool = images;
    if (pool.length === 0) throw new Error('文件夹里除了主面料没有别的图片，没法配色。');
    // 候选太多时均匀抽样，避免逐张解码十几 MB 的原图等太久
    if (pool.length > 48) pool = pool.filter((_, i) => i % Math.ceil(pool.length / 48) === 0);
    const mainHex = await localAssetService.getFabricColor(main);
    if (!mainHex) throw new Error(`读不出「${main.name}」的颜色，请确认这是一张图片。`);
    const colored: Array<{ id: string; hex: string }> = [];
    let done = 0;
    let cursor = 0;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (cursor < pool.length) {
          const a = pool[cursor++];
          const hex = await localAssetService.getFabricColor(a);
          if (hex) colored.push({ id: a.id, hex });
          onProgress(++done, pool.length);
        }
      })
    );
    const chosen = pickPaletteSwatches(mainHex, colored, others);
    return chosen.map(c => pool.find(a => a.id === c.id)!).filter(Boolean);
  };

  /** 读图用：文件夹里同名文件有多份时（如 3000px 缩略版和 6880px 原片）取体积最大的 */
  const textileSource = (a: LocalAssetItem): LocalAssetItem => pickBestSource(a, localAssetService.getAssets());

  /** 与主面料同色的其他照片（如没有标签的特写），大图优先用它们里干净区域更大的；最多 2 张，按颜色接近程度排 */
  const pickHeroAlternatives = async (main: LocalAssetItem, excludeIds: string[]): Promise<LocalAssetItem[]> => {
    const mainHex = await localAssetService.getFabricColor(main);
    if (!mainHex) return [];
    const scored: Array<{ a: LocalAssetItem; d: number }> = [];
    for (const a of localAssetService.getAssets()) {
      if (a.type !== 'image' || a.id === main.id || excludeIds.includes(a.id) || !a.colorHex) continue; // 只看已算过颜色的（配色时已读过同目录）
      const d = deltaE(mainHex, a.colorHex);
      if (d < 14) scored.push({ a, d });
    }
    return scored.sort((x, y) => x.d - y.d).slice(0, 2).map(s => s.a);
  };

  /** 按颜色说法（如“绿色”“藏青”）在文件夹里找最接近的一张做主面料；读颜色会逐张解码，最多看 60 张 */
  const findMainByColorName = async (colorName: string): Promise<LocalAssetItem | null> => {
    const target = textileColorTarget(colorName);
    if (!target) return null;
    const pool = localAssetService.getAssets().filter(a => a.type === 'image').slice(0, 60);
    let best: { a: LocalAssetItem; d: number } | null = null;
    let cursor = 0;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (cursor < pool.length) {
          const a = pool[cursor++];
          const hex = await localAssetService.getFabricColor(a);
          if (!hex) continue;
          const d = deltaE(target, hex);
          if (!best || d < best.d) best = { a, d };
        }
      })
    );
    return best ? (best as { a: LocalAssetItem; d: number }).a : null;
  };

  const handleGenerateTextilePoster = async (params?: AgentActionParams, opts?: { mainAsset?: LocalAssetItem }): Promise<boolean> => {
    if (!localAssetService.isConnected()) {
      addAgentMessage('面料色卡海报要用你本地的面料素材：请先点上方【授权文件夹】选择面料文件夹（本机调试授权不了的话，用「输入路径读取」直接填 D:\\素材\\面料 这样的路径），再选一款面料做主色。');
      return false;
    }
    const images = localAssetService.getAssets().filter(a => a.type === 'image');
    let main = opts?.mainAsset;
    if (!main && params?.textileMain) {
      const r = findAssetByKeyword(images, params.textileMain);
      if (!r.match) {
        addAgentMessage(
          r.ambiguous.length
            ? `「${params.textileMain}」匹配到多张：${r.ambiguous.map(a => a.name).join('、')}，请说具体的文件名。`
            : `在「${localAssetService.getDirectoryName()}」里没找到「${params.textileMain}」，请在素材列表里点「设为主色 · 面料色卡海报」，或告诉我准确的文件名。`
        );
        return false;
      }
      main = r.match;
    }
    if (!main && params?.textileMainColor) {
      main = (await findMainByColorName(params.textileMainColor)) || undefined;
      if (!main) {
        addAgentMessage(`没认出「${params.textileMainColor}」是什么颜色，请点「设为主色 · 面料色卡海报」选一张，或告诉我文件名。`);
        return false;
      }
    }
    if (!main) {
      addAgentMessage('先选一款面料做主色：在上方素材列表里点「设为主色 · 面料色卡海报」，或告诉我文件名。');
      return false;
    }
    const lockKey = `textile:${main.id}`;
    if (templatePosterRunningRef.current.has(lockKey)) {
      addAgentMessage(`「${main.name}」的面料色卡海报正在生成中，请等它完成。`);
      return false;
    }
    const layout: 'slant' | 'hex' | 'circle' = params?.textileLayout || 'slant';

    templatePosterRunningRef.current.add(lockKey);
    setTemplatePosterRunningIds(Array.from(templatePosterRunningRef.current));
    const fabricNodeId = upsertFabricMainNode(main.id, main.name, main.previewUrl, 'running');
    const taskStartedAt = Date.now();
    const taskId = addAgentMessage('', { taskCard: { title: `面料色卡海报 · ${main.name}`, status: 'running', detail: '1/4 读取面料颜色并挑选配色…' } });
    try {
      const swatchAssets = await pickTextileSwatches(main, params, params?.textileSwatchCount || 6, (done, total) =>
        finishTaskCard(taskId, 'running', `1/4 读取面料颜色并挑选配色… ${done}/${total}`)
      );
      const heroAssets = await pickHeroAlternatives(main, swatchAssets.map(a => a.id));
      finishTaskCard(taskId, 'running', `2/4 读取 ${swatchAssets.length + 1 + heroAssets.length} 张面料原图并构思名称与说明…`);
      const [mainData, ...restData] = await Promise.all([
        localAssetService.getImageDataUrl(textileSource(main), 4800, 0.9),
        ...swatchAssets.map(a => localAssetService.getImageDataUrl(textileSource(a), 2000, 0.86)),
        ...heroAssets.map(a => localAssetService.getImageDataUrl(textileSource(a), 4800, 0.9))
      ]);
      if (!mainData || restData.some(d => !d)) throw new Error('有面料图片读取失败，请重新读取文件夹后再试。');
      const swatchSrc = restData.slice(0, swatchAssets.length) as string[];
      const heroSrc = restData.slice(swatchAssets.length) as string[];

      const { concept, mainColor } = await textilePostJson('/api/poster-templates/textile/concept', {
        mainImage: mainData,
        hint: params?.hint,
        currentName: params?.textileName
      });

      // 氛围图（参考图左侧的时装/生活方式拼贴）：用户发了图就用用户的；否则默认 AI 出 3 张（扣点，确认卡片里写明），textileMoods=0 不出
      const moodUrls: string[] = [...(params?.textileMoodUrls || [])];
      const warnings: string[] = [];
      const moodCount = moodUrls.length ? 0 : params?.textileMoods ?? 3;
      if (moodCount > 0) {
        finishTaskCard(taskId, 'running', `3/4 生成 ${moodCount} 张氛围图（每张扣点，约 2–5 分钟）…`);
        const retryOnce = <T,>(fn: () => Promise<T>) => fn().catch(() => fn());
        const results = await Promise.allSettled(
          Array.from({ length: moodCount }, (_, i) =>
            retryOnce(() =>
              textilePostJson('/api/poster-templates/textile/mood', {
                concept, index: i, count: moodCount, layout, mainColor,
                model: selectedModel || undefined, resolution: selectedResolution || '2K'
              }).then(r => persistGeneratedImage(r.imageDataUrl, '面料色卡海报氛围图'))
            )
          )
        );
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') moodUrls.push(r.value);
          else warnings.push(`第 ${i + 1} 张氛围图失败（已省略）：${(r.reason as any)?.message || ''}`);
        });
      }
      let cutoutImage: string | undefined;
      if (params?.textileMoodStyle === 'cutout' && params?.textileCutoutAi) {
        finishTaskCard(taskId, 'running', '3/4 AI 生成白底全身人物（约 3000 点）并抠图…');
        const r = await textilePostJson('/api/poster-templates/textile/mood', {
          concept, index: 0, count: 1, layout, mainColor, kind: 'cutout',
          model: selectedModel || undefined, resolution: selectedResolution || '2K'
        });
        cutoutImage = await persistGeneratedImage(r.imageDataUrl, '面料色卡海报抠图人物');
      }
      finishTaskCard(taskId, 'running', '4/4 避开标签取面料、取底色并排版…');

      const name = params?.textileName || concept.name;
      const description = params?.textileDesc || concept.description;
      const code = params?.textileCode ?? concept.code ?? '';
      const composed = await textilePostJson('/api/poster-templates/textile/compose', {
        mainImage: mainData,
        heroImages: heroSrc,
        swatchImages: swatchSrc,
        moodImages: moodUrls,
        layout,
        name,
        description,
        code,
        bgColor: params?.textileBg,
        moodVariant: params?.textileMoodVariant ?? 0,
        moodStyle: params?.textileMoodStyle ?? 'collage',
        cutoutImage
      });
      const [posterUrl, mainUrl, ...restUrls] = await Promise.all([
        persistGeneratedImage(composed.imageDataUrl, '面料色卡海报'),
        persistGeneratedImage(mainData, '面料原图'),
        ...swatchSrc.map(d => persistGeneratedImage(d, '面料原图')),
        ...heroSrc.map(d => persistGeneratedImage(d, '面料原图'))
      ]);
      const swatchUrls = restUrls.slice(0, swatchSrc.length);
      const heroUrls = restUrls.slice(swatchSrc.length);

      const resultNodeId = `template-poster-c-${Date.now()}`;
      const pos = textileNodePosition();
      setNodes(prev => [
        ...prev,
        {
          id: resultNodeId,
          type: 'generatedImageNode',
          position: pos,
          data: {
            sceneIndex: 0,
            screenTitle: name,
            coreSellingPoint: concept.colorName,
            themeTitle: '面料色卡海报',
            withText: true,
            imageUrl: posterUrl,
            rawImageUrl: posterUrl,
            dimensions: `${composed.width}x${composed.height}`,
            aspectRatio: '4:3',
            generatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            generationDurationMs: Date.now() - taskStartedAt,
            version: 1,
            reviewStatus: 'pendingReview',
            templatePoster: {
              template: 'C',
              layout,
              name,
              description,
              code,
              bgColor: params?.textileBg || null,
              autoBgColor: composed.bgColor,
              mainColor: composed.mainColor,
              mainName: main.name,
              mainImage: mainUrl,
              heroImages: heroUrls,
              swatchNames: swatchAssets.map(a => a.name),
              swatchImages: swatchUrls,
              moods: moodUrls,
              moodVariant: params?.textileMoodVariant ?? 0,
              moodStyle: params?.textileMoodStyle ?? 'collage',
              cutoutImage,
              concept
            }
          }
        } as Node
      ]);
      setNodes(prev => prev.map(n => (n.id === fabricNodeId ? { ...n, data: { ...(n.data as any), imageUrl: mainUrl, state: 'done' } } : n)));
      setEdges(prev => [
        ...prev,
        { id: `edge-${fabricNodeId}-${resultNodeId}`, source: fabricNodeId, target: resultNodeId, animated: false, style: { stroke: '#B28C5A', strokeWidth: 2 } }
      ]);
      const all = [...warnings, ...(Array.isArray(composed.warnings) ? composed.warnings : [])];
      finishTaskCard(taskId, 'done', all.length ? `已完成，${all.join('；')}` : '已完成，海报已加入画布', { nodeId: resultNodeId });
      postImageResultToChat({
        imageUrl: posterUrl,
        title: `面料色卡海报 · ${name}`,
        nodeId: resultNodeId,
        withText: true,
        source: 'poster',
        detail: `${layout === 'hex' ? '六边形版' : layout === 'circle' ? '圆形版' : '斜切版'} · 主面料 ${main.name} · ${swatchAssets.length + 1} 块色卡 / 想换版式、改名称说明、换底色直接告诉我`
      });
      return true;
    } catch (err: any) {
      finishTaskCard(taskId, 'failed', err?.message || '面料色卡海报生成失败');
      setNodes(prev => prev.map(n => (n.id === fabricNodeId ? { ...n, data: { ...(n.data as any), state: 'pending' } } : n)));
      return false;
    } finally {
      templatePosterRunningRef.current.delete(lockKey);
      setTemplatePosterRunningIds(Array.from(templatePosterRunningRef.current));
    }
  };

  // 修改已生成的面料色卡海报：沿用已存的面料原图，只重新排版（换版式/名称/说明/型号/底色/色卡数）；
  // 换主面料或指定配色才需要再读本地文件夹；要 AI 氛围图才扣点。结果是新版本节点，旧版保留。
  const handleEditTextilePoster = async (params?: AgentActionParams): Promise<boolean> => {
    const currentNodes = nodesRef.current || nodes;
    const textileNodes = currentNodes.filter(n => n.id.startsWith('template-poster-c-') && (n.data as any)?.templatePoster?.template === 'C');
    const target =
      (params?.nodeId ? textileNodes.find(n => n.id === params.nodeId) : undefined) ||
      (selectedNodeId ? textileNodes.find(n => n.id === selectedNodeId) : undefined) ||
      textileNodes[textileNodes.length - 1];
    if (!target) {
      addAgentMessage('画布上还没有面料色卡海报，先在素材列表里点「设为主色 · 面料色卡海报」生成一张，再来修改。');
      return false;
    }
    const lockKey = `textile-edit:${target.id}`;
    if (templatePosterRunningRef.current.has(lockKey)) {
      addAgentMessage('这张面料色卡海报正在修改中，请等它完成。');
      return false;
    }
    const tp = (target.data as any).templatePoster;
    const needsFolder = Boolean(params?.textileMain || params?.textileSwatches?.length || (params?.textileSwatchCount && params.textileSwatchCount - 1 > (tp.swatchImages?.length || 0)));
    if (needsFolder && !localAssetService.isConnected()) {
      addAgentMessage('换主面料或增加色卡要重新读本地面料文件夹，请先点【授权文件夹】（或「输入路径读取」）再说一次。');
      return false;
    }
    let newMain: LocalAssetItem | undefined;
    if (params?.textileMain) {
      const r = findAssetByKeyword(localAssetService.getAssets().filter(a => a.type === 'image'), params.textileMain);
      if (!r.match) {
        addAgentMessage(r.ambiguous.length ? `「${params.textileMain}」匹配到多张：${r.ambiguous.map(a => a.name).join('、')}，请说具体的文件名。` : `在「${localAssetService.getDirectoryName()}」里没找到「${params.textileMain}」。`);
        return false;
      }
      newMain = r.match;
    }

    templatePosterRunningRef.current.add(lockKey);
    setTemplatePosterRunningIds(Array.from(templatePosterRunningRef.current));
    const taskStartedAt = Date.now();
    const taskId = addAgentMessage('', {
      taskCard: { title: '修改面料色卡海报', status: 'running', detail: params?.textileMoods ? `重出 ${params.textileMoods} 张氛围图（每张扣点），其余沿用…` : '沿用已有面料重新排版…' }
    });
    const warnings: string[] = [];
    try {
      const layout: 'slant' | 'hex' | 'circle' = params?.textileLayout || tp.layout || 'slant';
      let mainImage: string = tp.mainImage;
      let mainName: string = tp.mainName;
      let swatchImages: string[] = [...(tp.swatchImages || [])];
      let heroImages: string[] = [...(tp.heroImages || [])];
      let swatchNames: string[] = [...(tp.swatchNames || [])];
      let concept = JSON.parse(JSON.stringify(tp.concept || {}));
      let name: string = params?.textileName ?? tp.name;
      let description: string = params?.textileDesc ?? tp.description;
      const code: string = params?.textileCode ?? tp.code ?? '';
      let moods: string[] = [...(tp.moods || [])];
      const moodVariant: number = params?.textileMoodVariant ?? tp.moodVariant ?? 0;
      const moodStyle: 'collage' | 'cutout' = params?.textileMoodStyle ?? tp.moodStyle ?? 'collage';
      let cutoutImage: string | undefined = tp.cutoutImage;

      if (newMain || params?.textileSwatches?.length || (params?.textileSwatchCount && params.textileSwatchCount - 1 > swatchImages.length)) {
        const main = newMain || localAssetService.getAssets().find(a => a.name === tp.mainName && a.type === 'image');
        if (!main) throw new Error(`本地文件夹里找不到原来的主面料「${tp.mainName}」，请指定新的主面料。`);
        finishTaskCard(taskId, 'running', '重新读取面料并挑选配色…');
        const swatchAssets = await pickTextileSwatches(main, params, params?.textileSwatchCount || swatchImages.length + 1, (d, t) =>
          finishTaskCard(taskId, 'running', `重新读取面料并挑选配色… ${d}/${t}`)
        );
        const heroAssets = await pickHeroAlternatives(main, swatchAssets.map(a => a.id));
        const [mainData, ...restData] = await Promise.all([
          localAssetService.getImageDataUrl(textileSource(main), 4800, 0.9),
          ...swatchAssets.map(a => localAssetService.getImageDataUrl(textileSource(a), 2000, 0.86)),
          ...heroAssets.map(a => localAssetService.getImageDataUrl(textileSource(a), 4800, 0.9))
        ]);
        if (!mainData || restData.some(d => !d)) throw new Error('有面料图片读取失败，请重新读取文件夹后再试。');
        const persisted = await Promise.all([mainData, ...(restData as string[])].map(d => persistGeneratedImage(d, '面料原图')));
        mainImage = persisted[0];
        swatchImages = persisted.slice(1, 1 + swatchAssets.length);
        heroImages = persisted.slice(1 + swatchAssets.length);
        mainName = main.name;
        swatchNames = swatchAssets.map(a => a.name);
        if (newMain && newMain.name !== tp.mainName) {
          // 换了主面料：名称/说明按新面料重写（用户明确给了的除外）
          const fresh = await textilePostJson('/api/poster-templates/textile/concept', { mainImage: mainData, currentName: params?.textileName });
          concept = fresh.concept;
          if (params?.textileName === undefined) name = fresh.concept.name;
          if (params?.textileDesc === undefined) description = fresh.concept.description;
        }
      } else if (params?.textileSwatchCount && params.textileSwatchCount - 1 < swatchImages.length) {
        swatchImages = swatchImages.slice(0, Math.max(1, params.textileSwatchCount - 1));
        swatchNames = swatchNames.slice(0, swatchImages.length);
      }

      if (params?.textileMoodUrls?.length) {
        moods = [...params.textileMoodUrls];
      } else if (params?.textileMoods === 0) {
        moods = [];
      } else if (params?.textileMoods) {
        const retryOnce = <T,>(fn: () => Promise<T>) => fn().catch(() => fn());
        const results = await Promise.allSettled(
          Array.from({ length: params.textileMoods }, (_, i) =>
            retryOnce(() =>
              textilePostJson('/api/poster-templates/textile/mood', {
                concept, index: i, count: params.textileMoods, layout, mainColor: tp.mainColor, variation: params.textileMoodVariation ? 1 : 0,
                model: selectedModel || undefined, resolution: selectedResolution || '2K'
              }).then(r => persistGeneratedImage(r.imageDataUrl, '面料色卡海报氛围图'))
            )
          )
        );
        const fresh: string[] = [];
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') fresh.push(r.value);
          else warnings.push(`第 ${i + 1} 张氛围图重出失败：${(r.reason as any)?.message || ''}`);
        });
        if (fresh.length) moods = fresh;
      }
      if (moodStyle === 'cutout' && params?.textileCutoutAi) {
        finishTaskCard(taskId, 'running', 'AI 生成白底全身人物（约 3000 点）并抠图…');
        const r = await textilePostJson('/api/poster-templates/textile/mood', {
          concept, index: 0, count: 1, layout, mainColor: tp.mainColor, kind: 'cutout',
          model: selectedModel || undefined, resolution: selectedResolution || '2K'
        });
        cutoutImage = await persistGeneratedImage(r.imageDataUrl, '面料色卡海报抠图人物');
      }
      finishTaskCard(taskId, 'running', '重新排版…');

      const bgColor: string | null = params?.textileBg ?? tp.bgColor ?? null;
      // 换了主面料后原来手动指定的底色不再适用，除非这次又指定了
      const effectiveBg = newMain && newMain.name !== tp.mainName && !params?.textileBg ? null : bgColor;
      const composed = await textilePostJson('/api/poster-templates/textile/compose', {
        mainImage,
        heroImages,
        swatchImages,
        moodImages: moods,
        layout,
        name,
        description,
        code,
        bgColor: effectiveBg || undefined,
        moodVariant,
        moodStyle,
        cutoutImage: moodStyle === 'cutout' ? cutoutImage : undefined
      });
      const posterUrl = await persistGeneratedImage(composed.imageDataUrl, '面料色卡海报');

      const resultNodeId = `template-poster-c-${Date.now()}`;
      const base = target.position || { x: 100, y: 100 };
      const version = Number((target.data as any).version || 1) + 1;
      setNodes(prev => [
        ...prev,
        {
          id: resultNodeId,
          type: 'generatedImageNode',
          position: { x: base.x + 460, y: base.y + 20 },
          data: {
            ...(target.data as any),
            screenTitle: name,
            imageUrl: posterUrl,
            rawImageUrl: posterUrl,
            dimensions: `${composed.width}x${composed.height}`,
            generatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            generationDurationMs: Date.now() - taskStartedAt,
            version,
            reviewStatus: 'pendingReview',
            templatePoster: {
              ...tp,
              layout,
              name,
              description,
              code,
              bgColor: effectiveBg,
              autoBgColor: composed.bgColor,
              mainColor: composed.mainColor,
              mainName,
              mainImage,
              heroImages,
              swatchNames,
              swatchImages,
              moods,
              moodVariant,
              moodStyle,
              cutoutImage,
              concept
            }
          }
        } as Node
      ]);
      setEdges(prev => [
        ...prev,
        {
          id: `edge-textile-edit-${resultNodeId}`,
          source: target.id,
          target: resultNodeId,
          sourceHandle: 'source',
          targetHandle: 'target',
          label: `修改版 v${version}`,
          labelStyle: { fill: '#B28C5A', fontSize: 10, fontWeight: 700 },
          labelBgStyle: { fill: '#FAF6EF', rx: 4, ry: 4 },
          style: { stroke: '#B28C5A', strokeWidth: 2, strokeDasharray: '6 4' }
        }
      ]);
      const all = [...warnings, ...(Array.isArray(composed.warnings) ? composed.warnings : [])];
      finishTaskCard(taskId, 'done', all.length ? `已完成，${all.join('；')}` : '已完成，修改版已加入画布', { nodeId: resultNodeId });
      postImageResultToChat({
        imageUrl: posterUrl,
        title: `面料色卡海报 · ${name} · v${version}`,
        nodeId: resultNodeId,
        withText: true,
        source: 'poster',
        detail: `${layout === 'hex' ? '六边形版' : layout === 'circle' ? '圆形版' : '斜切版'} · 沿用已有面料重新排版`
      });
      return true;
    } catch (err: any) {
      finishTaskCard(taskId, 'failed', err?.message || '修改面料色卡海报失败');
      return false;
    } finally {
      templatePosterRunningRef.current.delete(lockKey);
      setTemplatePosterRunningIds(Array.from(templatePosterRunningRef.current));
    }
  };

  // Phase C3B: Batch Generation & Controlled Task Queue
  const [batchState, setBatchState] = useState<GenerationBatch | null>(null);
  const [queueItems, setQueueItems] = useState<SceneQueueItem[]>([]);
  const [showBatchConfirmModal, setShowBatchConfirmModal] = useState<boolean>(false);
  const [batchWithText, setBatchWithText] = useState<boolean>(false);
  const batchWithTextRef = useRef<boolean>(false);
  batchWithTextRef.current = batchWithText;

  const [batchConfirmInfo, setBatchConfirmInfo] = useState<{
    existingCount: number;
    missingCount: number;
    failedCount: number;
    missingSceneNumbers: number[];
  } | null>(null);

  const isBatchPausedRef = useRef<boolean>(false);
  const isBatchCancelledRef = useRef<boolean>(false);
  const isBatchSettledRef = useRef<boolean>(false);
  const activeWorkerCountRef = useRef<number>(0);
  const inFlightScenesRef = useRef<Set<number>>(new Set());
  const queueItemsRef = useRef<SceneQueueItem[]>([]);
  queueItemsRef.current = queueItems;

  const handleAutoLayoutNodes = useCallback(() => {
    // 一键排版属于用户改动，需要触发自动保存
    hasUserMutationRef.current = true;
    setNodes(prevNodes => {
      const { nodes: arranged } = arrangeCleanTreeLayout(prevNodes, edges);
      return arranged;
    });
    addAgentMessage('已为您一键按全案企划顺序整齐排列并对齐画布节点。');
  }, [edges, setNodes, addAgentMessage]);

  const handleGrid3x3Layout = useCallback((selectedOnly: boolean = false) => {
    // 一键排版属于用户改动，需要触发自动保存
    hasUserMutationRef.current = true;
    setNodes(prevNodes => {
      const { nodes: arranged } = arrangeGrid3x3Layout(prevNodes, selectedOnly);
      return arranged;
    });
    addAgentMessage(selectedOnly ? '已将选中的节点按 3x3 九宫格平铺排列。' : '已将全案海报与结果节点按 3x3 九宫格模式精准对齐排列。');
  }, [setNodes, addAgentMessage]);

  const handleSeamlessLayout = useCallback((selectedOnly: boolean = false) => {
    // 一键排版属于用户改动，需要触发自动保存
    hasUserMutationRef.current = true;
    setNodes(prevNodes => {
      const { nodes: arranged } = arrangeSeamlessVerticalLayout(prevNodes, selectedOnly);
      return arranged;
    });
    addAgentMessage(selectedOnly ? '已将选中的节点首尾无缝拼接垂直排列。' : '已将全案 9 屏海报按首尾相接拼接为 2100×14800 长图视觉垂直排列。');
  }, [setNodes, addAgentMessage]);

  const handleTriggerBatchMissingModal = useCallback(async (withTextParam?: boolean) => {
    if (typeof withTextParam === 'boolean') {
      setBatchWithText(withTextParam);
    }
    const screens = agentRun?.plan?.screens || [];
    if (screens.length === 0) {
      alert('请先生成全案企划方案');
      return;
    }

    const currentRunId = agentRun?.id;
    const missingSceneNumbers: number[] = [];
    let existingCount = 0;
    let failedCount = 0;

    screens.forEach((_, idx) => {
      const sceneNum = idx + 1;
      const genImgNode = nodes.find(
        n =>
          (n.id === `gen-img-node-${sceneNum}` || (n.data as any)?.sceneIndex === sceneNum) &&
          n.data &&
          typeof n.data.imageUrl === 'string' &&
          (n.data.imageUrl as string).trim() !== ''
      );

      // Check if image belongs to current plan run
      const isCurrentRun = genImgNode && (genImgNode.data as any)?.runId === currentRunId;

      if (genImgNode && isCurrentRun) {
        existingCount += 1;
      } else {
        missingSceneNumbers.push(sceneNum);
      }
    });

    if (missingSceneNumbers.length === 0) {
      // If user still clicks, allow forced full regeneration of all screens
      const confirmReall = await confirmDialog(`当前 ${screens.length} 屏均已存在画面，是否全部重新全量生成画面？`, { title: '全部重新生成', confirmText: '全部重新生成', danger: false });
      if (confirmReall) {
        const allNums = screens.map((_, i) => i + 1);
        setBatchConfirmInfo({
          existingCount: 0,
          missingCount: allNums.length,
          failedCount: 0,
          missingSceneNumbers: allNums
        });
        setShowBatchConfirmModal(true);
      } else {
        addAgentMessage('已取消全案批量重生成。');
      }
      return;
    }

    setBatchConfirmInfo({
      existingCount,
      missingCount: missingSceneNumbers.length,
      failedCount,
      missingSceneNumbers
    });
    setShowBatchConfirmModal(true);
  }, [agentRun, nodes, addAgentMessage]);

  const processQueue = useCallback(async () => {
    if (isBatchCancelledRef.current || isBatchPausedRef.current) return;

    const CONCURRENCY_LIMIT = 3;
    const currentItems = queueItemsRef.current;
    const pendingItems = currentItems.filter(
      i => (i.status === 'queued' || i.status === 'pending') && !inFlightScenesRef.current.has(i.sceneNumber)
    );

    // If nothing is pending/queued and no workers are currently running, settle the batch once
    if (pendingItems.length === 0 && activeWorkerCountRef.current === 0) {
      if (isBatchSettledRef.current) return;
      isBatchSettledRef.current = true;

      const totalSuccess = currentItems.filter(i => i.status === 'success').length;
      const totalFailed = currentItems.filter(i => i.status === 'failed').length;
      const totalCancelled = currentItems.filter(i => i.status === 'cancelled').length;

      setBatchState(prev => {
        if (!prev) return null;
        let finalStatus: GenerationBatch['status'] = 'completed';
        if (totalFailed > 0 && totalSuccess > 0) finalStatus = 'partial_failed';
        else if (totalFailed > 0 && totalSuccess === 0) finalStatus = 'partial_failed';
        else if (totalCancelled > 0) finalStatus = 'cancelled';

        return {
          ...prev,
          status: finalStatus,
          running: 0,
          completedAt: new Date().toISOString()
        };
      });

      if (totalFailed > 0) {
        addAgentMessage(`批量生成队列执行完毕：完成 ${totalSuccess} 屏，失败 ${totalFailed} 屏。可在队列控制区重试失败项。`);
      } else if (totalSuccess > 0) {
        addAgentMessage(`🎉 全案批量生成任务已全部顺利完成！所有 ${totalSuccess} 屏画面已呈现于画布支线。`);
      }
      return;
    }

    while (activeWorkerCountRef.current < CONCURRENCY_LIMIT) {
      if (isBatchPausedRef.current || isBatchCancelledRef.current) break;

      // Find next item that is queued/pending AND not already claimed/in-flight
      const nextItemIndex = queueItemsRef.current.findIndex(
        i => (i.status === 'queued' || i.status === 'pending') && !inFlightScenesRef.current.has(i.sceneNumber)
      );
      if (nextItemIndex === -1) break;

      const taskItem = queueItemsRef.current[nextItemIndex];
      const targetSceneNumber = taskItem.sceneNumber;

      // 1. Synchronously claim and mark as generating BEFORE starting worker
      inFlightScenesRef.current.add(targetSceneNumber);
      activeWorkerCountRef.current += 1;

      // Update queue item status synchronously in ref and state
      const updatedQueue = [...queueItemsRef.current];
      updatedQueue[nextItemIndex] = { ...updatedQueue[nextItemIndex], status: 'generating' };
      queueItemsRef.current = updatedQueue;
      setQueueItems(updatedQueue);

      setBatchState(prev => (prev ? { ...prev, running: activeWorkerCountRef.current } : null));

      // Asynchronously process single scene task with terminal state protection
      (async () => {
        try {
          // Double check: terminal states must not be executed
          const freshItem = queueItemsRef.current.find(i => i.sceneNumber === targetSceneNumber);
          if (freshItem && (freshItem.status === 'success' || freshItem.status === 'cancelled')) {
            return;
          }

          const succeeded = await handleGenerateSceneImage(
            targetSceneNumber,
            undefined,
            undefined,
            undefined,
            batchWithTextRef.current,
            true
          );
          if (!succeeded) {
            throw new Error('生成服务未返回有效图片；任务已标记为失败');
          }

          setQueueItems(prev => {
            const updated = prev.map(i =>
              i.sceneNumber === targetSceneNumber ? { ...i, status: 'success' as const } : i
            );
            queueItemsRef.current = updated;
            return updated;
          });

          setBatchState(prev => (prev ? { ...prev, success: prev.success + 1, pending: Math.max(0, prev.pending - 1) } : null));
        } catch (err: any) {
          console.error(`[BatchQueue] Scene #${targetSceneNumber} failed:`, err);

          const isRetryable = taskItem.attempt < 2 && (
            err?.message?.includes('429') || 
            err?.message?.includes('rate') || 
            err?.message?.includes('timeout') || 
            err?.message?.includes('500') || 
            err?.message?.includes('503')
          );

          if (isRetryable && !isBatchCancelledRef.current) {
            console.log(`[BatchQueue] Retrying scene #${targetSceneNumber} (attempt ${taskItem.attempt + 1})...`);
            await new Promise(r => setTimeout(r, 1500 * (taskItem.attempt + 1)));
            setQueueItems(prev => {
              const updated = prev.map(i =>
                i.sceneNumber === targetSceneNumber
                  ? { ...i, status: 'queued' as const, attempt: i.attempt + 1 }
                  : i
              );
              queueItemsRef.current = updated;
              return updated;
            });
          } else {
            setQueueItems(prev => {
              const updated = prev.map(i =>
                i.sceneNumber === targetSceneNumber
                  ? {
                      ...i,
                      status: 'failed' as const,
                      error: { message: err?.message || '生成图片失败' }
                    }
                  : i
              );
              queueItemsRef.current = updated;
              return updated;
            });

            setBatchState(prev => (prev ? { ...prev, failed: prev.failed + 1, pending: Math.max(0, prev.pending - 1) } : null));
          }
        } finally {
          inFlightScenesRef.current.delete(targetSceneNumber);
          activeWorkerCountRef.current -= 1;
          setBatchState(prev => (prev ? { ...prev, running: activeWorkerCountRef.current } : null));

          setTimeout(() => {
            processQueue();
          }, 200);
        }
      })();
    }
  }, [handleGenerateSceneImage, addAgentMessage]);

  const handleStartBatchGeneration = useCallback(() => {
    if (!batchConfirmInfo || batchConfirmInfo.missingSceneNumbers.length === 0) return;
    setShowBatchConfirmModal(false);

    const batchId = `batch_${Date.now()}`;
    const missingNums = batchConfirmInfo.missingSceneNumbers;

    const items: SceneQueueItem[] = missingNums.map(num => ({
      sceneId: `scene-plan-node-${num}`,
      sceneNumber: num,
      status: 'queued',
      attempt: 0
    }));

    const batch: GenerationBatch = {
      batchId,
      sceneIds: missingNums.map(n => `scene-plan-node-${n}`),
      status: 'running',
      total: missingNums.length,
      pending: missingNums.length,
      running: 0,
      success: 0,
      failed: 0,
      cancelled: 0,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString()
    };

    setQueueItems(items);
    queueItemsRef.current = items;
    setBatchState(batch);

    isBatchSettledRef.current = false;
    isBatchPausedRef.current = false;
    isBatchCancelledRef.current = false;
    inFlightScenesRef.current.clear();
    activeWorkerCountRef.current = 0;

    addAgentMessage(
      `已启动全案批量生成任务，队列中有 ${missingNums.length} 屏待生成（已自动跳过已有图片的 ${batchConfirmInfo.existingCount} 屏），并发数为 2。`
    );

    setTimeout(() => {
      processQueue();
    }, 100);
  }, [batchConfirmInfo, addAgentMessage, processQueue]);

  const handlePauseBatch = useCallback(() => {
    isBatchPausedRef.current = true;
    setBatchState(prev => (prev ? { ...prev, status: 'paused' } : null));
    addAgentMessage('已暂停全案批量生成队列。当前正在运行的任务将继续完成，排队中的任务暂停启动。');
  }, [addAgentMessage]);

  const handleResumeBatch = useCallback(() => {
    isBatchPausedRef.current = false;
    setBatchState(prev => (prev ? { ...prev, status: 'running' } : null));
    addAgentMessage('已恢复全案批量生成队列。');
    setTimeout(() => {
      processQueue();
    }, 100);
  }, [addAgentMessage, processQueue]);

  const handleCancelBatch = useCallback(() => {
    isBatchCancelledRef.current = true;
    inFlightScenesRef.current.clear();
    setQueueItems(prev => {
      const updated = prev.map(i =>
        i.status === 'queued' || i.status === 'pending' ? { ...i, status: 'cancelled' as const } : i
      );
      queueItemsRef.current = updated;
      return updated;
    });
    setBatchState(prev => (prev ? { ...prev, status: 'cancelled' } : null));
    addAgentMessage('已取消批量生成队列中所有排队中的任务。已成功的图片及节点已安全保留。');
  }, [addAgentMessage]);

  const handleRetryFailedBatch = useCallback(() => {
    const failedItems = queueItemsRef.current.filter(i => i.status === 'failed');
    if (failedItems.length === 0) return;

    setQueueItems(prev => {
      const updated = prev.map(i =>
        i.status === 'failed' ? { ...i, status: 'queued' as const, attempt: 0, error: undefined } : i
      );
      queueItemsRef.current = updated;
      return updated;
    });

    setBatchState(prev =>
      prev
        ? {
            ...prev,
            status: 'running',
            pending: prev.pending + failedItems.length,
            failed: prev.failed - failedItems.length
          }
        : null
    );

    isBatchSettledRef.current = false;
    isBatchPausedRef.current = false;
    isBatchCancelledRef.current = false;
    inFlightScenesRef.current.clear();

    addAgentMessage(`开始重试 ${failedItems.length} 个失败的分镜画面生成...`);

    setTimeout(() => {
      processQueue();
    }, 100);
  }, [addAgentMessage, processQueue]);

  const handleSelectSceneIndex = useCallback((idx: number | null) => {
    setSelectedSceneIndex(idx);
    let targetNodeId: string | null = null;
    if (idx !== null) {
      const sceneNode = nodes.find(n => n.id === `scene-plan-node-${idx}`);
      const genNode = nodes.find(n => n.id === `gen-img-node-${idx}`);
      targetNodeId = sceneNode?.id || genNode?.id || `scene-plan-node-${idx}`;
      setNodes(prev => prev.map(n => ({
        ...n,
        selected: n.id === targetNodeId || (genNode && n.id === genNode.id)
      })));
    } else {
      setNodes(prev => prev.map(n => ({ ...n, selected: false })));
    }
    setSelectedNodeId(targetNodeId);

    try {
      const ns = workspaceIdParam ? `c4b1_${workspaceIdParam}` : 'c4b1_default';
      if (idx !== null) {
        sessionStorage.setItem(`${ns}_selectedSceneIndex`, String(idx));
      } else {
        sessionStorage.removeItem(`${ns}_selectedSceneIndex`);
      }
      if (targetNodeId) {
        sessionStorage.setItem(`${ns}_selectedNodeId`, targetNodeId);
      } else {
        sessionStorage.removeItem(`${ns}_selectedNodeId`);
      }
    } catch (e) {}
  }, [nodes, setNodes, workspaceIdParam]);

  const handleNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setNodes(prev => prev.map(n => ({ ...n, selected: n.id === node.id })));
    let foundIdx: number | null = null;
    if (node.id.startsWith('scene-plan-node-') || node.id.startsWith('gen-img-node-') || node.id.startsWith('img-gen-task-')) {
      const idxStr = node.id.replace(/^(scene-plan-node-|gen-img-node-|img-gen-task-)/, '');
      const parsed = parseInt(idxStr, 10);
      if (!isNaN(parsed)) foundIdx = parsed;
    }
    if (foundIdx === null && node.data?.screenIndex) {
      const parsed = parseInt(String(node.data.screenIndex), 10);
      if (!isNaN(parsed)) foundIdx = parsed;
    }
    setSelectedSceneIndex(foundIdx);

    try {
      const ns = workspaceIdParam ? `c4b1_${workspaceIdParam}` : 'c4b1_default';
      sessionStorage.setItem(`${ns}_selectedNodeId`, node.id);
      if (foundIdx !== null) {
        sessionStorage.setItem(`${ns}_selectedSceneIndex`, String(foundIdx));
      } else {
        sessionStorage.removeItem(`${ns}_selectedSceneIndex`);
      }
    } catch (e) {}
  };

  // Safe recovery/fallback for selected node per canvas namespace
  useEffect(() => {
    if (nodes.length > 0) {
      const ns = workspaceIdParam ? `c4b1_${workspaceIdParam}` : 'c4b1_default';
      try {
        const storedNodeId = sessionStorage.getItem(`${ns}_selectedNodeId`);
        const storedSceneIndex = sessionStorage.getItem(`${ns}_selectedSceneIndex`);

        if (storedNodeId) {
          const exists = nodes.some(n => n.id === storedNodeId);
          if (exists) {
            if (selectedNodeId !== storedNodeId) {
              setSelectedNodeId(storedNodeId);
            }
          } else {
            // Node does not exist on this canvas - safely fallback
            if (selectedNodeId === storedNodeId) {
              setSelectedNodeId(null);
            }
            sessionStorage.removeItem(`${ns}_selectedNodeId`);
          }
        }

        if (storedSceneIndex !== null) {
          const parsed = parseInt(storedSceneIndex, 10);
          if (!isNaN(parsed) && selectedSceneIndex !== parsed) {
            setSelectedSceneIndex(parsed);
          }
        }
      } catch (e) {}
    }
  }, [workspaceIdParam, nodes.length]);

  // Phase C4-Edit: Canvas Selection, Deletion, Addition, Duplication, and Inline Editing
  const selectAllNodes = useCallback(() => {
    setNodes(prev => prev.map(n => ({ ...n, selected: true })));
  }, [setNodes]);

  const clearSelection = useCallback(() => {
    setNodes(prev => prev.map(n => ({ ...n, selected: false })));
  }, [setNodes]);

  const deleteNodeById = useCallback((nodeId: string) => {
    hasUserMutationRef.current = true;
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId));
  }, [setNodes, setEdges]);

  const deleteSelectedNodes = useCallback(() => {
    hasUserMutationRef.current = true;
    setNodes(prev => {
      // 锁定分组里的节点和已锁定的分组框不能被删除，先解锁
      const selectedIds = new Set(
        prev.filter(n => n.selected && !(n.data as any)?.groupLocked && !(n.type === 'groupFrameNode' && (n.data as any)?.locked)).map(n => n.id)
      );
      if (selectedIds.size === 0) return prev;

      setEdges(prevEdges =>
        prevEdges.filter(e => !selectedIds.has(e.source) && !selectedIds.has(e.target))
      );

      return prev.filter(n => !selectedIds.has(n.id));
    });
  }, [setNodes, setEdges]);

  // ===== 分组框：把一批结果框起来并可锁定；新结果、新会话的产物排到旁边 =====
  const nodeBox = (n: Node) => ({
    x: n.position.x,
    y: n.position.y,
    w: Number((n as any).measured?.width ?? n.width ?? 460),
    h: Number((n as any).measured?.height ?? n.height ?? 620)
  });

  const groupNodesIntoFrame = useCallback((opts?: { lock?: boolean }) => {
    const cur = nodesRef.current;
    const grouped = new Set<string>(cur.filter(n => n.type === 'groupFrameNode').flatMap(n => ((n.data as any)?.memberIds || []) as string[]));
    const pool = cur.filter(n => n.type !== 'groupFrameNode' && !grouped.has(n.id));
    const picked = pool.filter(n => n.selected);
    const members = picked.length > 0 ? picked : pool;
    if (members.length === 0) {
      addAgentMessage('没有可成组的节点（已经在分组里的不会重复加入）。');
      return;
    }
    const boxes = members.map(nodeBox);
    const PAD = 48;
    const HEAD = 56;
    const minX = Math.min(...boxes.map(b => b.x));
    const minY = Math.min(...boxes.map(b => b.y));
    const maxX = Math.max(...boxes.map(b => b.x + b.w));
    const maxY = Math.max(...boxes.map(b => b.y + b.h));
    const lock = opts?.lock !== false;
    const id = `group-frame-${Date.now()}`;
    const index = cur.filter(n => n.type === 'groupFrameNode').length + 1;
    const frame: Node = {
      id,
      type: 'groupFrameNode',
      position: { x: minX - PAD, y: minY - PAD - HEAD },
      data: {
        title: `项目 ${index} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        locked: lock,
        memberIds: members.map(n => n.id),
        frameW: Math.round(maxX - minX + PAD * 2),
        frameH: Math.round(maxY - minY + PAD * 2 + HEAD),
        conversationId: currentConversationRef.current?.id
      }
    } as Node;
    const memberSet = new Set(members.map(n => n.id));
    hasUserMutationRef.current = true;
    setNodes(prev => [
      ...prev.map(n => (memberSet.has(n.id) ? { ...n, selected: false, data: { ...(n.data as any), groupId: id, groupLocked: lock ? id : undefined } } : n)),
      frame
    ]);
    addAgentMessage(
      lock
        ? `已把 ${members.length} 个节点成组并锁定。接下来在对话里做新项目，或新开会话，新结果会排在这个分组右边；需要用到这里的内容，用 @ 引用即可。`
        : `已把 ${members.length} 个节点成组（未锁定，拖动分组框会带着里面的节点一起移动）。`
    );
  }, [setNodes]);

  const toggleGroupFrameLock = useCallback((frameId: string) => {
    hasUserMutationRef.current = true;
    setNodes(prev => {
      const frame = prev.find(n => n.id === frameId);
      if (!frame) return prev;
      const lock = !(frame.data as any)?.locked;
      const members = new Set<string>(((frame.data as any)?.memberIds || []) as string[]);
      return prev.map(n => {
        if (n.id === frameId) return { ...n, data: { ...(n.data as any), locked: lock } };
        if (members.has(n.id)) return { ...n, data: { ...(n.data as any), groupLocked: lock ? frameId : undefined } };
        return n;
      });
    });
  }, [setNodes]);

  const ungroupFrame = useCallback((frameId: string) => {
    hasUserMutationRef.current = true;
    setNodes(prev => {
      const frame = prev.find(n => n.id === frameId);
      if (!frame) return prev;
      const members = new Set<string>(((frame.data as any)?.memberIds || []) as string[]);
      return prev
        .filter(n => n.id !== frameId)
        .map(n => (members.has(n.id) ? { ...n, data: { ...(n.data as any), groupId: undefined, groupLocked: undefined } } : n));
    });
  }, [setNodes]);

  const renameGroupFrame = useCallback((frameId: string, title: string) => {
    hasUserMutationRef.current = true;
    setNodes(prev => prev.map(n => (n.id === frameId ? { ...n, data: { ...(n.data as any), title } } : n)));
  }, [setNodes]);

  const duplicateNodeById = useCallback((nodeId: string) => {
    hasUserMutationRef.current = true;
    setNodes(prev => {
      const target = prev.find(n => n.id === nodeId);
      if (!target) return prev;
      const newId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newNode: Node = {
        ...target,
        id: newId,
        position: {
          x: (target.position?.x || 0) + 40,
          y: (target.position?.y || 0) + 40
        },
        selected: true,
        data: {
          ...target.data,
          ...(target.data?.screenTitle ? { screenTitle: `${target.data.screenTitle} (副本)` } : {}),
          ...(target.data?.title ? { title: `${target.data.title} (副本)` } : {})
        }
      };
      return [...prev.map(n => ({ ...n, selected: false })), newNode];
    });
  }, [setNodes]);

  const duplicateSelectedNodes = useCallback(() => {
    hasUserMutationRef.current = true;
    setNodes(prev => {
      const selectedList = prev.filter(n => n.selected);
      if (selectedList.length === 0) return prev;

      const newNodes = selectedList.map(n => {
        const newId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        return {
          ...n,
          id: newId,
          position: {
            x: (n.position?.x || 0) + 40,
            y: (n.position?.y || 0) + 40
          },
          selected: true,
          data: {
            ...n.data,
            ...(n.data?.screenTitle ? { screenTitle: `${n.data.screenTitle} (副本)` } : {}),
            ...(n.data?.title ? { title: `${n.data.title} (副本)` } : {})
          }
        };
      });

      const unselectedOld = prev.map(n => ({ ...n, selected: false }));
      return [...unselectedOld, ...newNodes];
    });
  }, [setNodes]);

  const updateNodeData = useCallback((nodeId: string, partialData: any) => {
    hasUserMutationRef.current = true;
    setNodes(prev =>
      prev.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, ...partialData } } : n))
    );
  }, [setNodes]);

  const addCustomNode = useCallback((nodeKind: 'note' | 'scene' | 'prompt' | 'image', customParams?: any) => {
    hasUserMutationRef.current = true;
    const newId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    setNodes(prev => {
      let spawnX = 220;
      let spawnY = 180;

      if (prev.length > 0) {
        const lastNode = prev[prev.length - 1];
        spawnX = (lastNode.position?.x || 100) + 50;
        spawnY = (lastNode.position?.y || 100) + 50;
      }

      let newNode: Node;

      if (nodeKind === 'note') {
        newNode = {
          id: newId,
          type: 'noteNode',
          position: { x: spawnX, y: spawnY },
          selected: true,
          data: {
            title: customParams?.title || '自定义企划便签',
            text: customParams?.text || '双击或点击编辑按钮输入调整意见、重点强调或选型标注...',
            color: customParams?.color || 'amber'
          }
        };
      } else if (nodeKind === 'prompt') {
        newNode = {
          id: newId,
          type: 'noteNode',
          position: { x: spawnX, y: spawnY },
          selected: true,
          data: {
            title: customParams?.title || 'AI 绘图提示词',
            text: customParams?.text || 'cinematic lighting, ultra-realistic product photography, 8k resolution, cozy atmosphere...',
            color: 'blue'
          }
        };
      } else if (nodeKind === 'scene') {
        const sceneIndex = prev.filter(n => n.type === 'scenePlanNode' || n.type === 'scenePlan').length + 1;
        newNode = {
          id: newId,
          type: 'scenePlanNode',
          position: { x: spawnX, y: spawnY },
          style: { width: 340 },
          selected: true,
          data: {
            screenIndex: sceneIndex,
            screenTitle: customParams?.title || `第 ${sceneIndex} 屏：自定义视觉场景`,
            coreSellingPoint: customParams?.sellingPoint || '展示产品核心卖点与材质细节',
            visualComposition: customParams?.composition || '特写与家居环境组合视角',
            lightingAndAtmosphere: customParams?.lighting || '自然日光与高端奢华氛围',
            promptSuggestion: customParams?.prompt || 'detailed product close-up shot, warm luxury living room setting'
          }
        };
      } else {
        newNode = {
          id: newId,
          type: 'productImageNode',
          position: { x: spawnX, y: spawnY },
          selected: true,
          data: {
            fileName: customParams?.fileName || '参考元素.jpg',
            imageUrl: customParams?.imageUrl || '',
            uploadedAt: '刚刚'
          }
        };
      }

      const deselectPrev = prev.map(n => ({ ...n, selected: false }));
      return [...deselectPrev, newNode];
    });

    return newId;
  }, [setNodes]);

  // Re-bind interactive handlers for restored nodes
  // 节点回调统一经 ref 调用最新的处理函数：这些函数多数每次渲染都会重建，
  // 若直接作为依赖，attachNodeHandlers 会每次渲染失效，导致所有节点 data 重建、整画布重渲染
  const nodeActions = {
    deleteNodeById,
    duplicateNodeById,
    updateNodeData,
    handleGenerateNineGridPlan,
    handleReplanSingleScene,
    handleGenerateSceneImage,
    handleGenerateTemplatePoster,
    handleGenerateFabricPoster,
    handleEditFabricPoster,
    handleGenerateTextilePoster,
    handleEditTextilePoster,
    renameGroupFrame,
    toggleGroupFrameLock,
    ungroupFrame,
    handleUploadToProductNode,
    handleClearProductNode,
    handleApproveSceneImage,
    handleRejectSceneImage,
    handleReanalyze,
    handleTriggerBatchMissingModal,
    handleSelectDnaVersion,
    handleUploadFile,
    handleRemoveProductImage
  };
  const nodeActionsRef = useRef(nodeActions);
  nodeActionsRef.current = nodeActions;

  const attachNodeHandlers = useCallback(
    (nodeList: Node[]): Node[] => {
      return nodeList.map(node => {
        const data = { ...(node.data || {}) };

        // Bind universal edit & delete handlers to every node
        data.onDelete = () => nodeActionsRef.current.deleteNodeById(node.id);
        data.onDuplicate = () => nodeActionsRef.current.duplicateNodeById(node.id);
        data.onChange = (updated: any) => nodeActionsRef.current.updateNodeData(node.id, updated);
        data.onUpdate = (updated: any) => nodeActionsRef.current.updateNodeData(node.id, updated);

        const nodeType = String(node.type || '');
        const isDna = node.id === 'dna-node-1' || nodeType === 'productDnaNode' || nodeType === 'productDna';
        const isPlan = node.id === 'nine-grid-plan-node' || nodeType === 'nineGridPlanNode' || nodeType === 'nineGridPlan';
        const isScenePlan =
          node.id.startsWith('scene-plan-node-') ||
          nodeType === 'scenePlanNode' ||
          nodeType === 'scenePlan' ||
          nodeType === 'productHero' ||
          nodeType === 'productHeroNode' ||
          nodeType === 'lifestyle' ||
          nodeType === 'feature' ||
          nodeType === 'detailCallout';
        const isGenTask = node.id.startsWith('img-gen-task-') || nodeType === 'imageGenerationNode' || nodeType === 'imageGeneration';
        const isGenImg = node.id.startsWith('gen-img-node-') || nodeType === 'generatedImageNode' || nodeType === 'generatedImage';
        const isProdImg = node.id === 'img-node-1' || nodeType === 'productImageNode' || nodeType === 'productImage';

        if (isDna) {
          data.onViewFullDna = () => setShowFullDnaDrawer(true);
          data.dnaCode = dnaCode || data.dnaCode || 'DNA-178229';
          data.versionCode = productDnaVersionCode || data.versionCode || 'DNA-V001';
          data.productDnaVersionId = productDnaVersionId || data.productDnaVersionId;
          data.versions = dnaVersions.length > 0 ? dnaVersions : data.versions;
          data.onSelectDnaVersion = (...args: Parameters<typeof handleSelectDnaVersion>) =>
            nodeActionsRef.current.handleSelectDnaVersion(...args);
          if (!data.dna && activeDna) {
            data.dna = activeDna;
            if (data.status === 'idle' || !data.status) data.status = 'completed';
          }
        } else if (isPlan) {
          data.onViewFullPlan = () => {
            setSelectedNodeId(node.id);
            setSelectedSceneIndex(null);
          };
          data.onRegenerateAll = () => nodeActionsRef.current.handleGenerateNineGridPlan();
          data.onGenerateMissingImages = () => nodeActionsRef.current.handleTriggerBatchMissingModal();
          if (batchState) {
            data.batchProgress = {
              completed: batchState.success + batchState.failed,
              total: batchState.total,
              status: batchState.status
            };
          }
        } else if (isScenePlan) {
          const idxStr = node.id.replace('scene-plan-node-', '').replace('screen-', '');
          const idx: number = parseInt(idxStr, 10) || Number(data.screenIndex) || 1;
          const formattedIdx = String(idx).padStart(2, '0');
          data.assetSkuCode = data.assetSkuCode || `SKU-SCENE-${formattedIdx}`;
          data.assetVersionCode = data.assetVersionCode || 'V001';
          data.productDnaVersionCode = productDnaVersionCode || 'DNA-V001';
          data.productDnaVersionId = productDnaVersionId;
          data.onViewDetail = () => {
            setSelectedNodeId(node.id);
            setSelectedSceneIndex(idx);
          };
          data.onReplanScene = () => nodeActionsRef.current.handleReplanSingleScene(idx);
          data.onGenerateImage = () => nodeActionsRef.current.handleGenerateSceneImage(idx);
          data.onGenerateWithText = () => nodeActionsRef.current.handleGenerateSceneImage(idx, undefined, undefined, undefined, true);
        } else if (isGenTask) {
          const idxStr = node.id.replace('img-gen-task-', '').replace('screen-', '');
          const idx: number = parseInt(idxStr, 10) || Number(data.screenIndex) || 1;
          data.onGenerate = () => nodeActionsRef.current.handleGenerateSceneImage(idx);
        } else if (isGenImg) {
          const idxStr = node.id.replace('gen-img-node-', '').replace('screen-', '');
          const idx: number = parseInt(idxStr, 10) || Number(data.screenIndex) || 1;
          const formattedIdx = String(idx).padStart(2, '0');
          data.assetSkuCode = data.assetSkuCode || `SKU-SCENE-${formattedIdx}`;
          data.assetVersionCode = data.assetVersionCode || `V00${data.version || 1}`;
          data.productDnaVersionCode = productDnaVersionCode || 'DNA-V001';
          data.productDnaVersionId = productDnaVersionId;
          data.onViewDetail = () => {
            setSelectedNodeId(node.id);
            setSelectedSceneIndex(idx);
          };
          data.onApprove = () => nodeActionsRef.current.handleApproveSceneImage(idx);
          data.onReject = (feedback: string) => nodeActionsRef.current.handleRejectSceneImage(idx, feedback);
          data.onOpenPosterStudio = () => onOpenPosterStudioRef.current?.(idx);
          if (!data.templatePoster) {
            data.onGeneratePoster = () => nodeActionsRef.current.handleGenerateSceneImage(idx, undefined, undefined, undefined, true);
          }
        } else if (isProdImg) {
          if (isMainProductNodeId(node.id)) {
            // 主产品图：上传会提取 DNA、驱动企划
            data.onUpload = (f: File) => (handleUploadFileRef.current ? handleUploadFileRef.current(f) : nodeActionsRef.current.handleUploadFile(f));
            data.onRemove = () => (handleRemoveProductImageRef.current ? handleRemoveProductImageRef.current() : nodeActionsRef.current.handleRemoveProductImage());
            data.onReanalyze = () => (handleReanalyzeRef.current ? handleReanalyzeRef.current() : nodeActionsRef.current.handleReanalyze());
            if (!data.imageUrl && (uploadedImageUrl || uploadedBase64)) {
              data.imageUrl = uploadedImageUrl || uploadedBase64;
              if (data.status === 'idle' || !data.status) data.status = 'completed';
            }
          } else {
            // 其他产品图：图只进这个节点，不替换主产品图、不重提 DNA
            data.onUpload = (f: File) => nodeActionsRef.current.handleUploadToProductNode(node.id, f);
            data.onRemove = () => nodeActionsRef.current.handleClearProductNode(node.id);
            data.onReanalyze = undefined;
          }
          // 每张产品图各自生成模板海报（可同时进行）
          data.onTemplatePoster = () => nodeActionsRef.current.handleGenerateTemplatePoster({ nodeId: node.id });
          data.templatePosterRunning = templatePosterRunningIds.includes(node.id);
          data.onFabricPoster = () => nodeActionsRef.current.handleGenerateFabricPoster({ nodeId: node.id });
          data.fabricPosterRunning = templatePosterRunningIds.includes(`fabric:${node.id}`);
        }

        // 分组框：放在底层、尺寸由数据决定；锁定分组里的节点不可拖动不可删除
        const frameExtra: Record<string, any> = {};
        if (node.type === 'groupFrameNode') {
          const memberCount = (((data as any).memberIds || []) as string[]).length;
          (data as any).memberCount = memberCount;
          (data as any).onRename = (t: string) => nodeActionsRef.current.renameGroupFrame(node.id, t);
          (data as any).onToggleLock = () => nodeActionsRef.current.toggleGroupFrameLock(node.id);
          (data as any).onUngroup = () => nodeActionsRef.current.ungroupFrame(node.id);
          frameExtra.zIndex = -1;
          frameExtra.draggable = !(data as any).locked;
          frameExtra.style = { ...(node.style || {}), width: (data as any).frameW, height: (data as any).frameH };
        } else if ((data as any).groupLocked) {
          frameExtra.draggable = false;
          frameExtra.deletable = false;
        }
        return { ...node, data, ...frameExtra };
      });
    },
    [
      batchState,
      dnaCode,
      productDnaVersionCode,
      productDnaVersionId,
      dnaVersions,
      activeDna,
      uploadedImageUrl,
      uploadedBase64,
      templatePosterRunningIds
    ]
  );

  // 按节点引用缓存挂好回调的节点：拖拽时只有被拖动的节点对象会变，
  // 其余节点保持引用稳定，避免整张画布每帧重建 data 并全部重渲染
  const decoratedNodeCache = useMemo(() => new WeakMap<Node, Node>(), [attachNodeHandlers]);
  const displayNodes = useMemo(() => {
    return nodes.map(node => {
      let decorated = decoratedNodeCache.get(node);
      if (!decorated) {
        decorated = attachNodeHandlers([node])[0];
        decoratedNodeCache.set(node, decorated);
      }
      return decorated;
    });
  }, [nodes, attachNodeHandlers, decoratedNodeCache]);

  // 新生成的节点：1) 记下它属于哪个会话（会话之间的结果互不读取，要用就 @）；
  // 2) 如果落在某个分组框里，整批平移到分组框右边，不叠在已锁定的结果上，也不一路往下排
  const seenNodeIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (hydrationState !== 'ready') {
      seenNodeIdsRef.current = null;
      return;
    }
    if (!seenNodeIdsRef.current) {
      seenNodeIdsRef.current = new Set(nodes.map(n => n.id));
      return;
    }
    const seen = seenNodeIdsRef.current;
    const fresh = nodes.filter(n => !seen.has(n.id));
    if (fresh.length === 0) return;
    fresh.forEach(n => seen.add(n.id));
    const convId = currentConversationRef.current?.id;
    const frames = nodes.filter(n => n.type === 'groupFrameNode');
    const shifts = new Map<string, number>();
    for (const f of frames) {
      const fx = f.position.x;
      const fy = f.position.y;
      const fw = Number((f.data as any)?.frameW || 0);
      const fh = Number((f.data as any)?.frameH || 0);
      const members = new Set<string>(((f.data as any)?.memberIds || []) as string[]);
      const inside = fresh.filter(
        n => n.type !== 'groupFrameNode' && !members.has(n.id) && n.position.x >= fx - 20 && n.position.x <= fx + fw && n.position.y >= fy - 20 && n.position.y <= fy + fh
      );
      if (inside.length === 0) continue;
      const delta = fx + fw + 120 - Math.min(...inside.map(n => n.position.x));
      inside.forEach(n => shifts.set(n.id, Math.max(shifts.get(n.id) || 0, delta)));
    }
    const needStamp = fresh.some(n => n.type !== 'groupFrameNode' && convId && !(n.data as any)?.conversationId);
    if (!needStamp && shifts.size === 0) return;
    setNodes(prev =>
      prev.map(n => {
        if (!fresh.some(f => f.id === n.id) || n.type === 'groupFrameNode') return n;
        const d = n.data as any;
        const stamped = convId && !d?.conversationId ? { ...d, conversationId: convId } : d;
        const dx = shifts.get(n.id) || 0;
        return { ...n, data: stamped, position: dx ? { x: n.position.x + dx, y: n.position.y } : n.position };
      })
    );
  }, [nodes, hydrationState, setNodes]);

  // 素材列表里点“设为主色 · 面料海报”：先把主面料节点放上画布（确认前就可见）
  useEffect(() => {
    const onPick = (e: Event) => {
      const d = (e as CustomEvent).detail as { id?: string; name?: string; previewUrl?: string } | undefined;
      if (d?.id && d.name) upsertFabricMainNode(d.id, d.name, d.previewUrl, 'pending');
    };
    window.addEventListener('canvas:fabric-main', onPick);
    return () => window.removeEventListener('canvas:fabric-main', onPick);
  });

  // 对话框的“成组锁定”入口通过事件触发
  useEffect(() => {
    const onGroup = () => groupNodesIntoFrame({ lock: true });
    window.addEventListener('canvas:group-lock', onGroup);
    return () => window.removeEventListener('canvas:group-lock', onGroup);
  }, [groupNodesIntoFrame]);

  // 1. Initial Hydrate from Server API or LocalStorage
  useEffect(() => {
    let isMounted = true;

    async function hydrateCanvas() {
      setHydrationState('loading');
      setSaveStatus('cloud_loading');

      const rawTarget = activeProjectRef.current?.id || workspaceIdParam;
      const { projectId: targetProjectId, canvasId: targetCanvasId } = normalizeCanvasIds(rawTarget);
      const localKey = getStorageKey(targetProjectId, targetCanvasId);

      logCanvasDiagnostic({
        projectId: targetProjectId,
        canvasId: targetCanvasId,
        source: 'page_enter_hydration_start',
        localKey
      });

      let fetchedProject: CreativeProject | null = null;
      let fetchedDna: ProductVisualDNA | null = null;
      let fetchedAssets: any[] = [];
      let fetchedHeroUrl: string | null = null;
      let fetchedRun: AgentRun | null = null;

      const isFreshCanvas = Boolean(targetProjectId) && freshProjectIdRef.current === targetProjectId;

      // 页面组件在不同画布间复用：从一个真实画布切到另一个（或新建页）时，对话区不能还留着上一张画布的消息。
      // 占位页（new/latest）跳到真实项目是同一次创建流程，保留；新建画布的欢迎消息由新建流程自己设置。
      const prevHydrated = lastHydratedProjectRef.current;
      if (prevHydrated && prevHydrated !== targetProjectId && !['new', 'latest', 'default_project'].includes(prevHydrated) && !isFreshCanvas) {
        setMessages([makeWelcomeMessage()]);
      }
      lastHydratedProjectRef.current = targetProjectId;

      // 画布草稿与项目详情、agent-runs 互不依赖，并行发起
      const canvasPromise = isFreshCanvas
        ? null
        : canvasService.getCanvas(targetCanvasId).then(
            canvas => ({ canvas, error: null as any }),
            error => ({ canvas: null, error })
          );

      if (!isFreshCanvas && targetProjectId && targetProjectId !== 'new' && targetProjectId !== 'latest') {
        try {
          const authHeaders = await getAuthHeaders();
          const [pRes, rRes] = await Promise.all([
            fetch(`/api/projects/${targetProjectId}`, { headers: { ...authHeaders } }),
            fetch(`/api/agent-runs?projectId=${targetProjectId}`, { headers: { ...authHeaders } })
          ]);
          if (pRes.ok) {
            const pData = await pRes.json();
            if (pData.success && pData.project) {
              fetchedProject = pData.project;
              fetchedDna = pData.productDna || null;
              fetchedAssets = pData.assets || [];
              setActiveProject(fetchedProject);
              if (fetchedDna) {
                setActiveDna(fetchedDna);
                const dnaAny = fetchedDna as any;
                if (dnaAny.dna_code || dnaAny.dnaCode) setDnaCode(dnaAny.dna_code || dnaAny.dnaCode);
                if (dnaAny.version_code || dnaAny.versionCode) setProductDnaVersionCode(dnaAny.version_code || dnaAny.versionCode);
                if (dnaAny.current_version_id || dnaAny.currentVersionId) setProductDnaVersionId(dnaAny.current_version_id || dnaAny.currentVersionId);
              }
              if (fetchedAssets.length > 0) {
                const hero = fetchedAssets.find((a: any) => a.asset_type === 'product_hero') || fetchedAssets[0];
                const heroUrl = hero?.storage_path || hero?.url || hero?.storage_url;
                if (heroUrl) {
                  fetchedHeroUrl = heroUrl;
                  setUploadedImageUrl(heroUrl);
                  if (typeof heroUrl === 'string' && heroUrl.startsWith('data:image/')) {
                    setUploadedBase64(heroUrl);
                  }
                  setUploadState('completed');
                }
              }
            }
          }

          // Check for existing agent runs
          if (rRes.ok) {
            const rData = await rRes.json();
            if (rData.success && rData.agentRuns?.length > 0) {
              fetchedRun = rData.agentRuns[0];
              setAgentRun(fetchedRun);
            }
          }
        } catch (e) {
          console.warn('Failed to load project details for canvas hydration:', e);
        }
      }

      const enrichCanvasNodesAndEdges = (rawNodes: Node[], rawEdges: Edge[]) => {
        let enrichedNodes = [...rawNodes];
        let enrichedEdges = [...rawEdges];

        const currentDna = fetchedDna || activeDna;
        const currentHeroUrl = fetchedHeroUrl || uploadedImageUrl;
        const currentRun = fetchedRun || agentRun;

        if (enrichedNodes.length === 0) {
          enrichedNodes.push({
            id: 'welcome-1',
            type: 'welcomeNode',
            position: { x: 100, y: 120 },
            data: {
              title: fetchedProject?.name ? `视觉企划画布 - ${fetchedProject.name}` : '视觉企划画布',
              description: currentDna
                ? '已成功关联产品 DNA 与主体参考图。您可以查看  屏策划分镜节点或点击重新生成。'
                : '上传产品图片后，智能体生成的产品 DNA、全案方案和渲染结果将在这里形成节点。',
              status: currentDna ? '产品 DNA 已关联' : '画布已连接'
            }
          });
        } else {
          enrichedNodes = enrichedNodes.map((n: any) => {
            if (n.id === 'welcome-1' || n.type === 'welcomeNode') {
              return {
                ...n,
                data: {
                  ...(n.data || {}),
                  title: fetchedProject?.name ? `视觉企划画布 - ${fetchedProject.name}` : (n.data?.title || '视觉企划画布'),
                  description: currentDna
                    ? '已成功关联产品 DNA 与主体参考图。您可以查看  屏策划分镜节点或点击重新生成。'
                    : (n.data?.description || '上传产品图片后，智能体生成的产品 DNA、全案方案和渲染结果将在这里形成节点。'),
                  status: currentDna ? '产品 DNA 已关联' : (n.data?.status || '画布已连接')
                }
              };
            }
            if (n.id === 'img-node-1' || n.type === 'productImageNode' || n.type === 'productImage') {
              const heroUrl = n.data?.imageUrl || currentHeroUrl;
              const isDone = Boolean(currentDna) || n.data?.status === 'completed' || uploadState === 'completed';
              return {
                ...n,
                data: {
                  ...(n.data || {}),
                  imageUrl: heroUrl,
                  status: isDone ? 'completed' : (n.data?.status || 'idle'),
                  onUpload: (f: File) => (handleUploadFileRef.current ? handleUploadFileRef.current(f) : handleUploadFile(f)),
                  onRemove: () => (handleRemoveProductImageRef.current ? handleRemoveProductImageRef.current() : handleRemoveProductImage()),
                  onReanalyze: () => (handleReanalyzeRef.current ? handleReanalyzeRef.current() : handleReanalyze())
                }
              };
            }
            if ((n.id === 'dna-node-1' || n.type === 'productDnaNode' || n.type === 'productDna') && (!n.data?.dna || !n.data?.dnaCode) && currentDna) {
              const dnaAny = currentDna as any;
              return {
                ...n,
                data: {
                  ...(n.data || {}),
                  dna: currentDna,
                  status: 'completed',
                  dnaCode: dnaAny.dna_code || dnaAny.dnaCode || 'DNA-178229',
                  versionCode: dnaAny.version_code || dnaAny.versionCode || 'DNA-V001',
                  onViewFullDna: () => setShowFullDnaDrawer(true)
                }
              };
            }
            if (String(n.id).startsWith('scene-plan-node-') || n.type === 'scenePlanNode' || n.type === 'scenePlan') {
              const currentStyle = n.style || {};
              const isOverlyWide = !currentStyle.width || Number(currentStyle.width) > 420;
              return {
                ...n,
                style: {
                  ...currentStyle,
                  width: isOverlyWide ? 340 : currentStyle.width
                }
              };
            }
            return n;
          });
        }

        const hasImgNode = enrichedNodes.some((n: any) => n.id === 'img-node-1' || n.type === 'productImageNode' || n.type === 'productImage');
        if (!hasImgNode) {
          enrichedNodes.push({
            id: 'img-node-1',
            type: 'productImageNode',
            position: { x: 100, y: 320 },
            data: {
              imageUrl: currentHeroUrl || undefined,
              status: currentHeroUrl ? 'completed' : 'idle',
              title: '产品主图',
              onUpload: (f: File) => (handleUploadFileRef.current ? handleUploadFileRef.current(f) : handleUploadFile(f)),
              onRemove: () => (handleRemoveProductImageRef.current ? handleRemoveProductImageRef.current() : handleRemoveProductImage()),
              onReanalyze: () => (handleReanalyzeRef.current ? handleReanalyzeRef.current() : handleReanalyze())
            }
          });
        }

        const hasDnaNode = enrichedNodes.some((n: any) => n.id === 'dna-node-1' || n.type === 'productDnaNode' || n.type === 'productDna');
        if (!hasDnaNode && currentDna) {
          const dnaAny = currentDna as any;
          enrichedNodes.push({
            id: 'dna-node-1',
            type: 'productDnaNode',
            position: { x: 480, y: 150 },
            data: {
              dna: currentDna,
              status: 'completed',
              dnaCode: dnaAny.dna_code || dnaAny.dnaCode || 'DNA-178229',
              versionCode: dnaAny.version_code || dnaAny.versionCode || 'DNA-V001',
              onViewFullDna: () => setShowFullDnaDrawer(true)
            }
          });
        }

        const hasImgDnaEdge = enrichedEdges.some((e: any) => e.id === 'edge-img-dna' || (e.source === 'img-node-1' && e.target === 'dna-node-1'));
        if (!hasImgDnaEdge && (hasImgNode || currentHeroUrl) && (hasDnaNode || currentDna)) {
          enrichedEdges.push({
            id: 'edge-img-dna',
            source: 'img-node-1',
            target: 'dna-node-1',
            sourceHandle: 'source',
            targetHandle: 'target',
            label: '分析生成',
            labelStyle: { fill: '#8C6F43', fontSize: 10, fontWeight: 700 },
            labelBgStyle: { fill: '#F9F5EF', rx: 4, ry: 4 }
          });
        }

        const hasPlanNodes = enrichedNodes.some((n: any) => n.type === 'nineGridPlanNode');
        if (!hasPlanNodes && currentRun?.plan?.screens && Array.isArray(currentRun.plan.screens)) {
          const planNodes = enrichedNodes.filter((n: any) => n.type === 'nineGridPlanNode');
          const maxPlanY = planNodes.length > 0 ? Math.max(...planNodes.map((n: any) => n.position.y)) : 0;
          const offsetY = planNodes.length > 0 ? maxPlanY + 1200 : 0;

          const adapterResult = mapExistingNineGridResultToCanvasNodes(currentRun, currentDna, {
            offsetY,
            onViewFullPlan: () => {
              setSelectedNodeId(`plan-node-${currentRun.id}`);
              setSelectedSceneIndex(null);
            },
            onRegenerateAll: () => handleGenerateNineGridPlanRef.current?.(),
            onViewSceneDetail: (idx: number) => {
              setSelectedNodeId(`scene-plan-${currentRun.id}-${idx}`);
              setSelectedSceneIndex(idx);
            },
            onReplanScene: (idx: number) => handleReplanSingleSceneRef.current?.(idx),
            onOpenPosterStudio: (idx: number) => onOpenPosterStudioRef.current?.(idx),
            onGenerateWithTextImage: (idx: number) => handleGenerateSceneImage(idx, undefined, undefined, undefined, true)
          });
          enrichedNodes = [...enrichedNodes, ...adapterResult.nodes];
          enrichedEdges = [...enrichedEdges, ...adapterResult.edges];
        }

        return { nodes: enrichedNodes, edges: enrichedEdges };
      };

      let serverSuccess = false;

      try {
        const canvasResult = canvasPromise ? await canvasPromise : null;
        if (canvasResult?.error) throw canvasResult.error;
        const serverCanvas = canvasResult?.canvas;
        if (
          isMounted &&
          serverCanvas &&
          Array.isArray(serverCanvas.nodes_draft || serverCanvas.nodesDraft) &&
          (serverCanvas.nodes_draft || serverCanvas.nodesDraft)!.length > 0
        ) {
          let loadedNodes = serverCanvas.nodes_draft || serverCanvas.nodesDraft || [];
          let loadedEdges = serverCanvas.edges_draft || serverCanvas.edgesDraft || [];
          const loadedViewport = serverCanvas.viewport_draft || serverCanvas.viewportDraft || { x: 0, y: 0, zoom: 1 };

          const enriched = enrichCanvasNodesAndEdges(loadedNodes, loadedEdges);
          loadedNodes = enriched.nodes;
          loadedEdges = enriched.edges;

          setNodes(loadedNodes);
          setEdges(loadedEdges);
          setViewport(loadedViewport);

          // Restore uploaded image state if present
          const imgNode = loadedNodes.find((n: any) => n.id === 'img-node-1' || n.type === 'productImageNode');
          if (imgNode?.data?.imageUrl) {
            setUploadedImageUrl(imgNode.data.imageUrl as string);
            if (typeof imgNode.data.imageUrl === 'string' && imgNode.data.imageUrl.startsWith('data:image/')) {
              setUploadedBase64(imgNode.data.imageUrl as string);
            }
          }
          try {
            const rawLocal = localStorage.getItem(localKey) || localStorage.getItem('manwah_canvas_latest');
            if (rawLocal) {
              const localSnapshot = JSON.parse(rawLocal);
              if (localSnapshot?.uploadedBase64 && !uploadedBase64Ref.current) {
                setUploadedBase64(localSnapshot.uploadedBase64);
              }
            }
          } catch (e) {}

          setCurrentRevisionNumber(serverCanvas.current_revision || serverCanvas.currentRevision || 0);
          setLastSavedAt(serverCanvas.last_saved_at || serverCanvas.lastSavedAt || new Date().toISOString());
          const medium = (serverCanvas as any).storageMedium || 'cloud';
          if (medium === 'cloud') {
            setSaveStatus('cloud_saved');
          } else if (medium === 'memory') {
            setSaveStatus('memory_only');
          } else {
            setSaveStatus('local_saved');
          }

          prevSerializedRef.current = JSON.stringify({
            nodes: loadedNodes,
            edges: loadedEdges,
            viewport: loadedViewport
          });

          hasUserMutationRef.current = false;

          // 上次关闭页面前有改动没来得及同步：本地待同步草稿比服务端新，就用它并重新保存
          const pendingDraft = await readPendingDraft(targetCanvasId);
          // 服务端每次保存草稿都会刷新 updated_at；拿不到服务端时间时不冒险覆盖，以服务端为准
          const sc = serverCanvas as any;
          const serverSavedAtMs = Date.parse(sc.last_saved_at || sc.lastSavedAt || sc.updated_at || sc.updatedAt || '') || 0;
          if (pendingDraft && serverSavedAtMs > 0 && Date.parse(pendingDraft.at) > serverSavedAtMs && pendingDraft.nodes.length > 0) {
            const restored = enrichCanvasNodesAndEdges(pendingDraft.nodes as any, (pendingDraft.edges || []) as any);
            setNodes(restored.nodes);
            setEdges(restored.edges);
            if (pendingDraft.viewport) setViewport(pendingDraft.viewport);
            prevSerializedRef.current = '';
            hasUserMutationRef.current = true;
            setSaveStatus('unsynced');
            addAgentMessage('已恢复上次关闭前未同步的画布改动，正在自动保存。');
            logCanvasDiagnostic({
              projectId: targetProjectId,
              canvasId: targetCanvasId,
              nodesCount: pendingDraft.nodes.length,
              source: 'hydrate_restored_pending_draft'
            });
          } else if (pendingDraft && serverSavedAtMs > 0) {
            clearPendingDraft(targetCanvasId);
          }

          serverSuccess = true;

          logCanvasDiagnostic({
            projectId: targetProjectId,
            canvasId: targetCanvasId,
            storageMode: (serverCanvas as any).storageMedium || 'cloud',
            nodesCount: loadedNodes.length,
            edgesCount: loadedEdges.length,
            source: 'hydrate_from_server_success'
          });
        }
      } catch (err: any) {
        console.warn('Failed to load canvas draft from API, checking local storage:', err);
        logCanvasDiagnostic({
          projectId: targetProjectId,
          canvasId: targetCanvasId,
          error: err?.message,
          source: 'hydrate_from_server_failed'
        });
      }

      // 新建画布不读本地缓存，避免 manwah_canvas_latest 把旧画布带进来
      if (!serverSuccess && isMounted && !isFreshCanvas) {
        // Fallback to LocalStorage - check all candidate keys to ensure no data loss
        try {
          const fallbackKeys = [
            localKey,
            `creative-canvas:${userId}:${targetProjectId}:${targetCanvasId}:draft`,
            `creative-canvas:${userId}:${targetProjectId}:${targetProjectId}:draft`,
            `creative-canvas:${userId}:canvas_${targetProjectId}:canvas_${targetProjectId}:draft`,
            `manwah_canvas_draft_${targetProjectId}`,
            `manwah_canvas_draft_${targetCanvasId}`,
            'manwah_canvas_latest'
          ];
          let raw: string | null = null;
          for (const k of fallbackKeys) {
            try {
              const item = localStorage.getItem(k);
              if (item) {
                raw = item;
                break;
              }
            } catch (e) {}
          }
          if (raw) {
            const snapshot = JSON.parse(raw);
            if (snapshot && Array.isArray(snapshot.nodes) && snapshot.nodes.length > 0) {
              if (snapshot.activeProject) setActiveProject(snapshot.activeProject);
              if (snapshot.activeDna) setActiveDna(snapshot.activeDna);
              if (snapshot.uploadedImageUrl) setUploadedImageUrl(snapshot.uploadedImageUrl);
              if (snapshot.uploadedBase64) setUploadedBase64(snapshot.uploadedBase64);
              if (snapshot.uploadState && snapshot.uploadState !== 'uploading' && snapshot.uploadState !== 'analyzing') {
                setUploadState(snapshot.uploadState);
              } else if (snapshot.uploadedBase64 || snapshot.uploadedImageUrl) {
                setUploadState('completed');
              }
              if (snapshot.agentRun) setAgentRun(snapshot.agentRun);
              if (snapshot.messages && Array.isArray(snapshot.messages) && snapshot.messages.length > 0) {
                const seenMsgIds = new Set<string>();
                const sanitizedMsgs = snapshot.messages.map((m: any, idx: number) => {
                  let msgId = m.id || `msg-${idx}`;
                  if (seenMsgIds.has(msgId)) {
                    msgId = `${msgId}-${idx}-${Math.random().toString(36).substring(2, 6)}`;
                  }
                  seenMsgIds.add(msgId);
                  return { ...m, id: msgId };
                });
                setMessages(sanitizedMsgs);
              }

              const enrichedLocal = enrichCanvasNodesAndEdges(snapshot.nodes, snapshot.edges || []);
              setEdges(enrichedLocal.edges);
              setNodes(enrichedLocal.nodes);
              if (snapshot.viewport) setViewport(snapshot.viewport);
              if (snapshot.selectedNodeId) setSelectedNodeId(snapshot.selectedNodeId);
              if (typeof snapshot.selectedSceneIndex === 'number') setSelectedSceneIndex(snapshot.selectedSceneIndex);

              prevSerializedRef.current = JSON.stringify({
                nodes: enrichedLocal.nodes,
                edges: enrichedLocal.edges,
                viewport: snapshot.viewport || { x: 0, y: 0, zoom: 1 }
              });

              hasUserMutationRef.current = false;
              setSaveStatus('local_saved');
              serverSuccess = true;

              logCanvasDiagnostic({
                projectId: targetProjectId,
                canvasId: targetCanvasId,
                nodesCount: enrichedLocal.nodes.length,
                source: 'hydrate_from_local_storage_fallback'
              });
            }
          }
        } catch (err: any) {
          console.error('Failed to hydrate canvas workspace state from local:', err);
        }
      }

      // 画布确实从云端或本地加载成功时，之后的任何差异都可直接自动保存；
      // 加载失败退回默认画布时仍需用户真正操作过才保存，避免用默认画布覆盖云端
      loadedFromSourceRef.current = serverSuccess;
      if (!serverSuccess && isMounted) {
        // Construct initial nodes from fetched project, assets, DNA & agentRun
        const defaultEnriched = enrichCanvasNodesAndEdges([], []);
        setNodes(defaultEnriched.nodes);
        setEdges(defaultEnriched.edges);
        prevSerializedRef.current = JSON.stringify({
          nodes: defaultEnriched.nodes,
          edges: defaultEnriched.edges,
          viewport: { x: 0, y: 0, zoom: 1 }
        });
        hasUserMutationRef.current = false;
        // 新建画布的保存状态由后台初始草稿写入结果决定
        if (!isFreshCanvas) setSaveStatus('cloud_saved');

        logCanvasDiagnostic({
          projectId: targetProjectId,
          canvasId: targetCanvasId,
          source: 'default_canvas_initialized_with_dna',
          nodesCount: defaultEnriched.nodes.length
        });
      }

      if (isMounted) {
        loadOrInitConversation(targetProjectId, targetCanvasId, isFreshCanvas);
        setHydrationState('hydrated');
        setTimeout(() => {
          if (isMounted) {
            // 在 ready 时才清除，StrictMode 下 effect 二次执行仍能识别为新建画布
            if (isFreshCanvas) freshProjectIdRef.current = null;
            setHydrationState('ready');
          }
        }, 100);
      }
    }

    hydrateCanvas();

    return () => {
      isMounted = false;
    };
  }, [workspaceIdParam]);

  // Helper to serialize nodes strictly for JSON draft
  const getCleanSerializableNodes = useCallback((rawNodeList: Node[]) => {
    return rawNodeList.map(n => {
      const cleanData: Record<string, any> = {};
      const data = n.data || {};
      for (const k of Object.keys(data)) {
        if (typeof data[k] !== 'function' && !k.startsWith('on')) {
          cleanData[k] = data[k];
        }
      }
      return {
        id: String(n.id),
        type: String(n.type || 'default'),
        position: { x: Number(n.position?.x || 0), y: Number(n.position?.y || 0) },
        width: n.width ? Number(n.width) : undefined,
        height: n.height ? Number(n.height) : undefined,
        data: cleanData
      };
    });
  }, []);

  const getCleanSerializableEdges = useCallback((rawEdgeList: Edge[]) => {
    return rawEdgeList.map(e => ({
      id: String(e.id),
      source: String(e.source),
      target: String(e.target),
      sourceHandle: e.sourceHandle ? String(e.sourceHandle) : null,
      targetHandle: e.targetHandle ? String(e.targetHandle) : null,
      type: e.type ? String(e.type) : undefined,
      animated: Boolean(e.animated),
      style: e.style
    }));
  }, []);

  // ===== 未保存改动兜底：页面隐藏 / 关闭 / 离开画布时立即保存 =====
  const latestCanvasRef = useRef({ nodes, edges, viewport, activeDna, hydrationState });
  latestCanvasRef.current = { nodes, edges, viewport, activeDna, hydrationState };

  // 页面关闭时来不及异步取登录态，提前缓存请求头
  const unloadAuthHeadersRef = useRef<Record<string, string> | null>(null);
  useEffect(() => {
    const refresh = () => {
      getAuthHeaders()
        .then(h => {
          unloadAuthHeadersRef.current = h;
        })
        .catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [workspaceIdParam]);

  const flushUnsavedDraft = useCallback(
    (mode: 'async' | 'unload') => {
      const latest = latestCanvasRef.current;
      if (latest.hydrationState !== 'ready' || isRestoringRef.current || !hasUserMutationRef.current) return;
      const cleanNodes = getCleanSerializableNodes(latest.nodes);
      const cleanEdges = getCleanSerializableEdges(latest.edges);
      // 与自动保存的比对口径保持一致
      const serialized = JSON.stringify({ nodes: cleanNodes, edges: cleanEdges, viewport: latest.viewport, activeDna: latest.activeDna });
      if (serialized === prevSerializedRef.current) return;

      const { projectId, canvasId } = normalizeCanvasIds(activeProjectRef.current?.id || workspaceIdParam);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      // 先落本地待同步草稿：即使请求没发出去，下次打开也能恢复
      writePendingDraft({ canvasId, projectId, at: new Date().toISOString(), nodes: cleanNodes, edges: cleanEdges, viewport: latest.viewport });

      const payload = {
        nodesDraft: cleanNodes,
        edgesDraft: cleanEdges,
        viewportDraft: latest.viewport,
        hasExplicitUserClear: hasExplicitUserClearRef.current
      };
      if (mode === 'unload') {
        if (unloadAuthHeadersRef.current) canvasService.sendCanvasDraftOnUnload(canvasId, payload, unloadAuthHeadersRef.current);
        return;
      }

      setSaveStatus('saving');
      canvasService
        .saveCanvasDraft(canvasId, payload)
        .then(res => {
          prevSerializedRef.current = serialized;
          hasExplicitUserClearRef.current = false;
          firstDirtyAtRef.current = null;
          clearPendingDraft(canvasId);
          setSaveStatus(res.storageMedium === 'cloud' ? 'cloud_saved' : 'local_saved');
          setLastSavedAt(res.lastSavedAt || new Date().toISOString());
        })
        .catch(err => {
          console.warn('Flush unsaved canvas draft failed, kept local pending draft:', err);
          setSaveStatus('local_saved');
        });
    },
    [getCleanSerializableNodes, getCleanSerializableEdges, workspaceIdParam]
  );

  // 同一画布在本浏览器的其他标签页也打开时提示：两边自动保存会互相覆盖
  const [isOpenInOtherTab, setIsOpenInOtherTab] = useState(false);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined' || !workspaceIdParam) return;
    const { canvasId } = normalizeCanvasIds(workspaceIdParam);
    const tabId = Math.random().toString(36).slice(2);
    const channel = new BroadcastChannel('creative-canvas-presence');
    const peers = new Map<string, number>();
    const announce = (type: 'hello' | 'here' | 'leave') => channel.postMessage({ type, canvasId, tabId });
    const syncFlag = () => setIsOpenInOtherTab(peers.size > 0);

    channel.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg || msg.canvasId !== canvasId || msg.tabId === tabId) return;
      if (msg.type === 'leave') {
        peers.delete(msg.tabId);
      } else {
        peers.set(msg.tabId, Date.now());
        if (msg.type === 'hello') announce('here');
      }
      syncFlag();
    };
    announce('hello');
    // 心跳：标签页被直接杀掉收不到 leave 时，15 秒后视为离开
    const heartbeat = setInterval(() => {
      announce('here');
      const now = Date.now();
      for (const [id, seenAt] of peers) if (now - seenAt > 15_000) peers.delete(id);
      syncFlag();
    }, 5_000);
    const leave = () => announce('leave');
    window.addEventListener('pagehide', leave);
    return () => {
      leave();
      clearInterval(heartbeat);
      window.removeEventListener('pagehide', leave);
      channel.close();
      setIsOpenInOtherTab(false);
    };
  }, [workspaceIdParam]);

  const flushUnsavedDraftRef = useRef(flushUnsavedDraft);
  flushUnsavedDraftRef.current = flushUnsavedDraft;
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushUnsavedDraftRef.current('async');
    };
    // 关闭 / 刷新标签页：异步请求可能被浏览器中断，用 keepalive 同步发出
    const handlePageHide = () => flushUnsavedDraftRef.current('unload');
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
      // 应用内离开画布（如返回工作流）：组件卸载前把未保存改动发出去
      flushUnsavedDraftRef.current('async');
    };
  }, []);

  // 1.5 内嵌大图外置：节点里的 data:image（如上传的主图、视频任务的首帧）上传一次换成 URL。
  // 否则同一张几 MB 的图被多个节点引用，草稿近 10MB，云端保存超时、本地备份超配额，画布就存不上了。
  const inlineImageUploadsRef = useRef<Map<string, Promise<string | null>>>(new Map());
  useEffect(() => {
    if (hydrationState !== 'ready') return;
    const timer = setTimeout(() => {
      const found = new Set<string>();
      const collect = (v: any, depth: number) => {
        if (depth > 6 || v === null || v === undefined) return;
        if (typeof v === 'string') {
          if (v.length >= 32 * 1024 && v.startsWith('data:image/')) found.add(v);
          return;
        }
        if (typeof v === 'function') return;
        if (Array.isArray(v)) v.forEach(x => collect(x, depth + 1));
        else if (typeof v === 'object') Object.values(v).forEach(x => collect(x, depth + 1));
      };
      nodesRef.current.forEach(n => collect(n.data, 0));
      if (found.size === 0) return;

      const { canvasId } = normalizeCanvasIds(activeProjectRef.current?.id || workspaceIdParam);
      const uploads = [...found].map(dataUrl => {
        let p = inlineImageUploadsRef.current.get(dataUrl);
        if (!p) {
          p = (async () => {
            try {
              const headers = await getAuthHeaders();
              const res = await fetch(`/api/canvases/${encodeURIComponent(canvasId)}/inline-images`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ dataUrl })
              });
              const json = await res.json().catch(() => null);
              return res.ok && json?.url ? String(json.url) : null;
            } catch {
              return null;
            }
          })();
          inlineImageUploadsRef.current.set(dataUrl, p);
          // 失败的允许下次重试
          p.then(url => { if (!url) inlineImageUploadsRef.current.delete(dataUrl); });
        }
        return p.then(url => [dataUrl, url] as const);
      });

      Promise.all(uploads).then(pairs => {
        const mapping = new Map(pairs.filter(([, url]) => Boolean(url)) as [string, string][]);
        if (mapping.size === 0) return;
        const swap = (v: any, depth: number): any => {
          if (depth > 6 || v === null || v === undefined) return v;
          if (typeof v === 'string') return mapping.get(v) || v;
          if (typeof v === 'function' || typeof v !== 'object') return v;
          if (Array.isArray(v)) return v.map(x => swap(x, depth + 1));
          const out: Record<string, any> = {};
          for (const [k, x] of Object.entries(v)) out[k] = swap(x, depth + 1);
          return out;
        };
        hasUserMutationRef.current = true;
        setNodes(prev => prev.map(n => {
          const nextData = swap(n.data, 0);
          return JSON.stringify(nextData) === JSON.stringify(n.data) ? n : { ...n, data: nextData };
        }));
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [nodes, hydrationState, workspaceIdParam, setNodes]);

  // 2. Debounced Auto-Save Draft Effect（停止操作 10 秒后保存，持续操作最多 60 秒保存一次）
  useEffect(() => {
    // 加载完成后，画布与上次保存的内容只要真的不同就保存：生成企划、视频回写等流程会直接 setNodes，
    // 不经过 onNodesChange，只靠改动标记会漏存（曾导致企划与视频节点刷新后丢失）
    if (hydrationState !== 'ready' || isRestoringRef.current) {
      return;
    }
    if (!loadedFromSourceRef.current && !hasUserMutationRef.current) {
      return;
    }

    // 拖拽时节点每帧都在变，整画布序列化开销大：等 400ms 无变化后再比对并排期保存
    const diffTimer = setTimeout(() => {
      const cleanNodes = getCleanSerializableNodes(nodes);
      const cleanEdges = getCleanSerializableEdges(edges);

      const serializedPayload = JSON.stringify({
        nodes: cleanNodes,
        edges: cleanEdges,
        viewport,
        activeDna
      });

      if (serializedPayload === prevSerializedRef.current) {
        return;
      }
      hasUserMutationRef.current = true;

      setSaveStatus('unsynced');
      if (!firstDirtyAtRef.current) firstDirtyAtRef.current = Date.now();

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      const waitedMs = Date.now() - firstDirtyAtRef.current;
      const saveDelayMs = Math.max(0, Math.min(AUTOSAVE_IDLE_MS, AUTOSAVE_MAX_WAIT_MS - waitedMs));
      saveTimeoutRef.current = setTimeout(async () => {
        setSaveStatus('saving');
        try {
          const rawTarget = activeProjectRef.current?.id || workspaceIdParam;
          const { projectId: targetProjectId, canvasId: targetCanvasId } = normalizeCanvasIds(rawTarget);

          logCanvasDiagnostic({
            projectId: targetProjectId,
            canvasId: targetCanvasId,
            source: 'auto_save_triggered',
            nodesCount: cleanNodes.length,
            edgesCount: cleanEdges.length
          });

          // Save to Server Draft API
          const res = await canvasService.saveCanvasDraft(targetCanvasId, {
            nodesDraft: cleanNodes,
            edgesDraft: cleanEdges,
            viewportDraft: viewport,
            hasExplicitUserClear: hasExplicitUserClearRef.current
          });

          // Backup to LocalStorage
          const localKey = getStorageKey(targetProjectId, targetCanvasId);
          let localSuccess = false;
          try {
            const localSnapshot = {
              version: 1,
              updatedAt: res.lastSavedAt,
              projectId: targetProjectId,
              canvasId: targetCanvasId,
              activeProject: activeProjectRef.current,
              activeDna,
              dnaCode,
              productDnaVersionCode,
              productDnaVersionId,
              uploadedImageUrl,
              uploadedBase64: uploadedBase64Ref.current,
              uploadState,
              agentRun,
              messages,
              nodes: cleanNodes,
              edges: cleanEdges,
              viewport
            };
            safeSaveToLocalStorage(localKey, localSnapshot);
            safeSaveToLocalStorage('manwah_canvas_latest', localSnapshot);
            localSuccess = true;
          } catch (e) {
            console.warn('LocalStorage draft backup skipped or full:', e);
          }

          prevSerializedRef.current = serializedPayload;
          hasExplicitUserClearRef.current = false;
          firstDirtyAtRef.current = null;
          clearPendingDraft(targetCanvasId);

          try {
            const localSnapshot = {
              version: 1,
              updatedAt: res.lastSavedAt || new Date().toISOString(),
              projectId: targetProjectId,
              canvasId: targetCanvasId,
              activeProject: activeProjectRef.current,
              activeDna,
              dnaCode,
              productDnaVersionCode,
              productDnaVersionId,
              uploadedImageUrl,
              uploadedBase64: uploadedBase64Ref.current,
              uploadState,
              agentRun,
              messages,
              nodes: cleanNodes,
              edges: cleanEdges,
              viewport
            };
            await dbService.saveDraft(localKey, localSnapshot);
            await dbService.saveDraft('manwah_canvas_latest', localSnapshot);
          } catch (e) {}

          if (res.storageMedium === 'cloud') {
            setSaveStatus('cloud_saved');
          } else {
            setSaveStatus('local_saved');
          }

          setLastSavedAt(res.lastSavedAt || new Date().toISOString());
        } catch (err: any) {
          console.warn('Canvas auto-save to server failed, applying local IndexedDB backup:', err);
          const targetProjectId = activeProjectRef.current?.id || workspaceIdParam || 'latest';
          const targetCanvasId = `canvas_${targetProjectId}`;
          const localKey = getStorageKey(targetProjectId, targetCanvasId);
          const nowIso = new Date().toISOString();
          const localSnapshot = {
            version: 1,
            updatedAt: nowIso,
            projectId: targetProjectId,
            canvasId: targetCanvasId,
            activeDna,
            dnaCode,
            productDnaVersionCode,
            nodes: cleanNodes,
            edges: cleanEdges,
            viewport
          };

          try {
            localStorage.setItem(localKey, JSON.stringify(localSnapshot));
          } catch (e) {}

          try {
            await dbService.saveDraft(localKey, localSnapshot);
          } catch (e) {}

          // 服务端没存上：留下待同步草稿，下次打开画布时恢复并补存
          writePendingDraft({ canvasId: targetCanvasId, projectId: targetProjectId, at: nowIso, nodes: cleanNodes, edges: cleanEdges, viewport });

          setSaveStatus('local_saved');
          setLastSavedAt(nowIso);
        }
      }, saveDelayMs);
    }, 400);

    return () => {
      clearTimeout(diffTimer);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    hydrationState,
    nodes,
    edges,
    viewport,
    messages,
    activeDna,
    dnaCode,
    productDnaVersionCode,
    productDnaVersionId,
    agentRun,
    uploadState,
    uploadedImageUrl,
    workspaceIdParam,
    getCleanSerializableNodes,
    getCleanSerializableEdges,
    getStorageKey
  ]);

  // 2.5 Manual Action: Immediate Draft Save
  const handleSaveDraftNow = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    setSaveStatus('saving');
    const targetProjectId = activeProjectRef.current?.id || workspaceIdParam || 'latest';
    const targetCanvasId = `canvas_${targetProjectId}`;
    const cleanNodes = getCleanSerializableNodes(nodes);
    const cleanEdges = getCleanSerializableEdges(edges);
    const nowIso = new Date().toISOString();

    let isCloudSaved = false;

    try {
      logCanvasDiagnostic({
        projectId: targetProjectId,
        canvasId: targetCanvasId,
        source: 'manual_draft_save_now',
        nodesCount: cleanNodes.length,
        edgesCount: cleanEdges.length
      });

      const res = await canvasService.saveCanvasDraft(targetCanvasId, {
        nodesDraft: cleanNodes,
        edgesDraft: cleanEdges,
        viewportDraft: viewport,
        hasExplicitUserClear: hasExplicitUserClearRef.current
      });
      if (res.storageMedium === 'cloud') isCloudSaved = true;
    } catch (err: any) {
      console.warn('Manual draft cloud save failed, writing local IndexedDB sandbox:', err);
    }

    const localKey = getStorageKey(targetProjectId, targetCanvasId);
    const localSnapshot = {
      version: 1,
      updatedAt: nowIso,
      projectId: targetProjectId,
      canvasId: targetCanvasId,
      activeProject: activeProjectRef.current,
      activeDna,
      dnaCode,
      productDnaVersionCode,
      productDnaVersionId,
      uploadedImageUrl,
      uploadedBase64: uploadedBase64Ref.current,
      uploadState,
      agentRun,
      messages,
      nodes: cleanNodes,
      edges: cleanEdges,
      viewport
    };

    try {
      safeSaveToLocalStorage(localKey, localSnapshot);
      safeSaveToLocalStorage('manwah_canvas_latest', localSnapshot);
    } catch (e) {}

    try {
      await dbService.saveDraft(localKey, localSnapshot);
      await dbService.saveDraft('manwah_canvas_latest', localSnapshot);
    } catch (e) {}

    prevSerializedRef.current = JSON.stringify({
      nodes: cleanNodes,
      edges: cleanEdges,
      viewport,
      activeDna
    });
    hasUserMutationRef.current = false;
    hasExplicitUserClearRef.current = false;
    firstDirtyAtRef.current = null;
    if (isCloudSaved) clearPendingDraft(targetCanvasId);

    setSaveStatus(isCloudSaved ? 'cloud_saved' : 'local_saved');
    setLastSavedAt(nowIso);
    return true;
  }, [
    nodes,
    edges,
    viewport,
    activeDna,
    dnaCode,
    productDnaVersionCode,
    productDnaVersionId,
    agentRun,
    messages,
    uploadState,
    uploadedImageUrl,
    workspaceIdParam,
    getCleanSerializableNodes,
    getCleanSerializableEdges,
    getStorageKey
  ]);

  // 2.55 Dedicated Canvas JSON Export (Self-contained Snapshot: Materials, DNA, Posters, Nodes & Edges)
  const exportCanvasJson = useCallback(async () => {
    const rawNodes = nodesRef.current.length > 0 ? nodesRef.current : nodes;
    const rawEdges = edgesRef.current.length > 0 ? edgesRef.current : edges;

    // 保证主图节点的图片资源完整无损
    const cleanNodes = getCleanSerializableNodes(rawNodes).map(n => {
      if ((n.id === 'img-node-1' || n.type === 'productImageNode' || n.type === 'productImage') && !n.data?.imageUrl) {
        if (uploadedImageUrl || uploadedBase64) {
          return {
            ...n,
            data: {
              ...n.data,
              imageUrl: uploadedImageUrl || uploadedBase64
            }
          };
        }
      }
      return n;
    });

    const cleanEdges = getCleanSerializableEdges(rawEdges);
    const targetProjectId = activeProjectRef.current?.id || workspaceIdParam || 'latest';
    const targetCanvasId = normalizeCanvasIds(targetProjectId).canvasId;

    const exportPayload = {
      format: 'manwah_creative_canvas_backup_v2',
      canvasId: targetCanvasId,
      projectId: targetProjectId,
      exportedAt: new Date().toISOString(),
      uploadedImageUrl: uploadedImageUrl || uploadedBase64 || cleanNodes.find(n => n.id === 'img-node-1' || n.type === 'productImageNode')?.data?.imageUrl,
      activeDna: activeDna || activeDnaRef.current,
      agentRun: agentRun || agentRunRef.current,
      dnaCode,
      productDnaVersionCode,
      productDnaVersionId,
      nodes: cleanNodes,
      edges: cleanEdges,
      viewport
    };

    const jsonString = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const fileName = `canvas_${targetProjectId}_${new Date().toISOString().slice(0, 10)}.json`;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    return exportPayload;
  }, [
    nodes,
    edges,
    viewport,
    uploadedImageUrl,
    uploadedBase64,
    activeDna,
    agentRun,
    dnaCode,
    productDnaVersionCode,
    productDnaVersionId,
    workspaceIdParam,
    getCleanSerializableNodes,
    getCleanSerializableEdges
  ]);

  // 2.6 Import Canvas JSON (Restores Nodes, Materials, DNA, Plan, and Poster Images)
  const importCanvasJson = useCallback(async (importedData: any) => {
    if (!importedData || typeof importedData !== 'object') {
      throw new Error('无效的 JSON 配置文件');
    }

    const importedNodes = importedData.nodes || importedData.nodes_draft || importedData.nodesSnapshot || [];
    const importedEdges = importedData.edges || importedData.edges_draft || importedData.edgesSnapshot || [];
    const importedViewport = importedData.viewport || importedData.viewport_draft || importedData.viewportSnapshot || { x: 0, y: 0, zoom: 1 };
    const importedActiveDna = importedData.activeDna || importedData.active_dna;
    const importedAgentRun = importedData.agentRun || importedData.agent_run;
    const importedUploadedImageUrl = importedData.uploadedImageUrl || importedData.uploaded_image_url;

    if (!Array.isArray(importedNodes) || importedNodes.length === 0) {
      throw new Error('导入的 JSON 中未包含有效的画布节点数据');
    }

    isRestoringRef.current = true;
    hasExplicitUserClearRef.current = true;

    try {
      const cleanNodes = getCleanSerializableNodes(importedNodes as any);
      const cleanEdges = getCleanSerializableEdges(importedEdges as any);

      // 自动提取产品素材主图
      let heroImageFound = importedUploadedImageUrl;
      if (!heroImageFound) {
        const prodNode = cleanNodes.find(n => n.id === 'img-node-1' || n.type === 'productImageNode' || n.type === 'productImage');
        if (prodNode?.data?.imageUrl) {
          heroImageFound = prodNode.data.imageUrl;
        }
      }

      if (heroImageFound) {
        setUploadedImageUrl(heroImageFound);
        if (typeof heroImageFound === 'string' && heroImageFound.startsWith('data:image/')) {
          uploadedBase64Ref.current = heroImageFound;
        }
      }

      setNodes(cleanNodes);
      setEdges(cleanEdges);
      if (importedViewport) {
        setViewport(importedViewport);
      }
      if (importedActiveDna) {
        setActiveDna(importedActiveDna);
        activeDnaRef.current = importedActiveDna;
      }
      if (importedAgentRun) {
        setAgentRun(importedAgentRun);
        agentRunRef.current = importedAgentRun;
      }

      hasUserMutationRef.current = true;

      const targetProjectId = activeProjectRef.current?.id || workspaceIdParam || 'latest';
      const targetCanvasId = `canvas_${targetProjectId}`;
      const nowIso = new Date().toISOString();

      try {
        await canvasService.saveCanvasDraft(targetCanvasId, {
          nodesDraft: cleanNodes,
          edgesDraft: cleanEdges,
          viewportDraft: importedViewport,
          hasExplicitUserClear: true
        });
      } catch (e) {}

      const localKey = getStorageKey(targetProjectId, targetCanvasId);
      const localSnapshot = {
        version: 1,
        updatedAt: nowIso,
        projectId: targetProjectId,
        canvasId: targetCanvasId,
        uploadedImageUrl: heroImageFound,
        activeDna: importedActiveDna,
        agentRun: importedAgentRun,
        nodes: cleanNodes,
        edges: cleanEdges,
        viewport: importedViewport
      };

      try {
        localStorage.setItem(localKey, JSON.stringify(localSnapshot));
      } catch (e) {}

      await dbService.saveDraft(localKey, localSnapshot).catch(() => {});
      await dbService.saveDraft('manwah_canvas_latest', localSnapshot).catch(() => {});

      setSaveStatus('local_saved');
      setLastSavedAt(nowIso);

      addAgentMessage(`✅ 已成功导入 JSON 全案工作流！重新载入 ${cleanNodes.length} 个节点（完美携带素材与海报图像数据）。`);

      return { success: true, count: cleanNodes.length };
    } finally {
      setTimeout(() => {
        isRestoringRef.current = false;
      }, 500);
    }
  }, [
    getCleanSerializableNodes,
    getCleanSerializableEdges,
    setNodes,
    setEdges,
    setViewport,
    setActiveDna,
    setAgentRun,
    setUploadedImageUrl,
    addAgentMessage,
    workspaceIdParam,
    getStorageKey
  ]);

  // 2.7 Restore ComfyUI Workflow parameters
  const restoreNodeWorkflow = useCallback((nodeData: any) => {
    if (!nodeData) return;
    if (nodeData.model) {
      setSelectedModel(nodeData.model);
    }
    if (nodeData.aspectRatio) {
      setPlanAspectRatio(nodeData.aspectRatio);
    }
    if (nodeData.dimensions) {
      if (nodeData.dimensions.includes('2K') || nodeData.dimensions.includes('2048')) setSelectedResolution('2K');
      else if (nodeData.dimensions.includes('4K') || nodeData.dimensions.includes('3840')) setSelectedResolution('4K');
      else setSelectedResolution('1K');
    }
    if (nodeData.sceneIndex) {
      setSelectedSceneIndex(nodeData.sceneIndex);
    }
  }, []);

  // 3. Manual Action: Save Immutable Revision
  const handleSaveVersion = useCallback(async (versionName: string, changeSummary: string = '', versionTag: string = '正式版') => {
    const targetProjectId = activeProjectRef.current?.id || workspaceIdParam || 'latest';
    const targetCanvasId = `canvas_${targetProjectId}`;

    const cleanNodes = getCleanSerializableNodes(nodes);
    const cleanEdges = getCleanSerializableEdges(edges);

    const revision = await canvasService.createCanvasRevision(targetCanvasId, {
      versionName,
      changeSummary,
      versionTag,
      nodesSnapshot: cleanNodes,
      edgesSnapshot: cleanEdges,
      viewportSnapshot: viewport
    });

    const revNum = revision.revision_number || revision.revisionNumber || currentRevisionNumber + 1;
    setCurrentRevisionNumber(revNum);
    setSaveStatus(revision.storageMedium === 'cloud' ? 'cloud_saved' : 'local_saved');
    setLastSavedAt(revision.created_at || revision.createdAt || new Date().toISOString());
    return revision;
  }, [nodes, edges, viewport, workspaceIdParam, currentRevisionNumber, getCleanSerializableNodes, getCleanSerializableEdges]);

  // 4. Manual Action: Restore Working Draft from Immutable Revision Snapshot
  const handleRestoreRevision = useCallback(async (revisionId: string) => {
    isRestoringRef.current = true;
    hasUserMutationRef.current = false;

    const targetProjectId = activeProjectRef.current?.id || workspaceIdParam || 'latest';
    const targetCanvasId = `canvas_${targetProjectId}`;

    try {
      logCanvasDiagnostic({
        projectId: targetProjectId,
        canvasId: targetCanvasId,
        revisionId,
        source: 'handle_restore_revision_start'
      });

      const restored = await canvasService.restoreCanvasFromRevision(targetCanvasId, revisionId);

      const parseJson = (val: any, fallback: any) => {
        if (!val) return fallback;
        if (typeof val === 'string') {
          try { return JSON.parse(val); } catch (e) { return fallback; }
        }
        return val;
      };

      const restoredNodes = parseJson(restored?.nodes, []);
      const restoredEdges = parseJson(restored?.edges, []);
      const restoredViewport = parseJson(restored?.viewport, { x: 0, y: 0, zoom: 1 });

      if (Array.isArray(restoredNodes) && restoredNodes.length > 0) {
        const cleanNodes = getCleanSerializableNodes(restoredNodes as any);
        const cleanEdges = getCleanSerializableEdges(restoredEdges as any);

        setNodes(cleanNodes as any);
        setEdges(cleanEdges as any);
        if (restoredViewport) {
          setViewport(restoredViewport);
        }

        const localKey = getStorageKey(targetProjectId, targetCanvasId);
        const localSnapshot = {
          version: 1,
          updatedAt: new Date().toISOString(),
          projectId: targetProjectId,
          canvasId: targetCanvasId,
          nodes: cleanNodes,
          edges: cleanEdges,
          viewport: restoredViewport
        };

        try {
          localStorage.setItem(localKey, JSON.stringify(localSnapshot));
          localStorage.setItem('manwah_canvas_latest', JSON.stringify(localSnapshot));
        } catch (e) {}

        prevSerializedRef.current = JSON.stringify({
          nodes: cleanNodes,
          edges: cleanEdges,
          viewport: restoredViewport
        });

        setSaveStatus(restored.storageMedium === 'cloud' ? 'cloud_saved' : 'local_saved');
        setLastSavedAt(new Date().toISOString());

        logCanvasDiagnostic({
          projectId: targetProjectId,
          canvasId: targetCanvasId,
          revisionId,
          nodesCount: cleanNodes.length,
          edgesCount: cleanEdges.length,
          snapshotChecksum: restored.snapshotChecksum,
          source: 'handle_restore_revision_success'
        });
      } else {
        throw new Error('恢复的历史版本未包含有效的节点数据');
      }
    } catch (err: any) {
      console.error('Failed to restore revision:', err);
      setSaveStatus('restore_failed');
      throw err;
    } finally {
      setTimeout(() => {
        isRestoringRef.current = false;
      }, 300);
    }
  }, [workspaceIdParam, setNodes, setEdges, getCleanSerializableNodes, getCleanSerializableEdges, getStorageKey]);

  const clearCanvasWorkspace = useCallback(async () => {
    hasExplicitUserClearRef.current = true;
    hasUserMutationRef.current = true;

    const newProjectId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newCanvasId = `canvas_${newProjectId}`;

    const newProjectObj: CreativeProject = {
      id: newProjectId,
      owner_id: userId,
      name: '新建立体视觉企划案',
      project_type: 'detail_page',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    setActiveProject(newProjectObj);
    setActiveDna(null);
    setUploadedImageUrl(null);
    setUploadedBase64(null);
    setUploadState('idle');
    setAgentRun(null);
    setSelectedNodeId(null);
    setSelectedSceneIndex(null);

    const defaultWelcomeMessage: AgentMessage = {
      id: `msg-${Date.now()}-welcome`,
      sender: 'agent',
      text: '你好！我是视觉企划智能体。请上传产品主角图，我将自动提取造型、色彩、材质与结构 DNA 并同步至左侧画布。',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages([defaultWelcomeMessage]);

    setNodes(initialNodes);
    setEdges(initialEdges);
    setViewport({ x: 0, y: 0, zoom: 1 });

    const localKey = getStorageKey(activeProject?.id || '', workspaceIdParam || '');
    if (localKey) localStorage.removeItem(localKey);
    localStorage.removeItem('manwah_canvas_latest');

    freshProjectIdRef.current = newProjectId;

    // 云端初始草稿在后台写入，不阻塞跳转；失败时由自动保存兜底
    setSaveStatus('saving');
    canvasService
      .saveCanvasDraft(newCanvasId, {
        nodesDraft: initialNodes as any,
        edgesDraft: [],
        viewportDraft: { x: 0, y: 0, zoom: 1 },
        canvasName: '新建立体视觉企划案',
        hasExplicitUserClear: true
      })
      .then(() => setSaveStatus('cloud_saved'))
      .catch(err => {
        console.warn('Failed to save fresh draft to server:', err);
        setSaveStatus('local_saved');
      });

    return newProjectId;
  }, [getStorageKey, activeProject, workspaceIdParam, setNodes, setEdges]);

  return {
    nodes: displayNodes,
    rawNodes: nodes,
    setNodes,
    edges,
    setEdges,
    // 必须返回带改动标记的版本：用原始 onNodesChange 时拖动、新增、连线都不会标记改动，自动保存永远不触发
    onNodesChange: handleNodesChange,
    onEdgesChange: handleEdgesChange,
    /** 绕过 onNodesChange 直接 setNodes 的改动（如视频任务回写成果节点）调用它，以触发自动保存 */
    markCanvasDirty: () => {
      if (!isRestoringRef.current) hasUserMutationRef.current = true;
    },
    uploadState,
    errorMessage,
    messages,
    activeDna,
    showFullDnaDrawer,
    setShowFullDnaDrawer,
    handleUploadFile,
    handleRemoveProductImage,
    handleReanalyze,
    addUserMessage,
    addAgentMessage,
    updateAgentMessage,
    isOpenInOtherTab,
    clearCanvasWorkspace,

    // G0-1 Exports
    currentConversation,
    conversationsList,
    isStreaming,
    streamError,
    handleSendMessageStream,
    handleStopGenerating,
    handleRetryMessage,
    handleCreateNewConversation,
    postVideoResultToChat,
    postImageResultToChat,
    handleEditImage,
    uploadChatImage,
    handleSelectConversation,
    handleDeleteConversations,
    handleChangeConversationModel,
    activeProject,

    // C2 Exports
    agentRun,
    isPlanGenerating,
    planError,
    selectedNodeId,
    selectedSceneIndex,
    setSelectedNodeId,
    setSelectedSceneIndex,
    onSelectSceneIndex: handleSelectSceneIndex,
    handleGenerateNineGridPlan,
    handleReplanSingleScene,
    handleEditImageText,
    handleNodeClick,

    // C4B-1 DNA Version Exports
    dnaCode,
    productDnaVersionCode,
    productDnaVersionId,
    dnaVersions,
    onSelectDnaVersion: handleSelectDnaVersion,

    // C3A Exports
    uploadedBase64,
    setUploadedBase64: setUploadedBase64State,
    selectedModel,
    setSelectedModel,
    planAgentModel,
    setPlanAgentModel,
    planReasoningEffort,
    setPlanReasoningEffort,
    planTargetAudience,
    setPlanTargetAudience,
    planScreenCount,
    setPlanScreenCount,
    planAspectRatio,
    setPlanAspectRatio,
    styleRefImages,
    setStyleRefImages,
    refDocName,
    setRefDocName,
    refDocText,
    setRefDocText,
    planEnableSearch,
    setPlanEnableSearch,
    planSearchKeywords,
    setPlanSearchKeywords,
    marketSearchLoading,
    marketSearchResult,
    setMarketSearchResult,
    handleSearchMarketReference,
    selectedResolution,
    setSelectedResolution,
    templateA4K,
    setTemplateA4K,
    generatingScenes: generatingScenesRef.current,
    handleGenerateSceneImage,
    handleGenerateTemplatePoster,
    handleGenerateFabricPoster,
    handleEditFabricPoster,
    handleGenerateTextilePoster,
    handleEditTextilePoster,
    groupNodesIntoFrame,
    handleAddProductNode,
    handleApproveSceneImage,
    handleRejectSceneImage,

    // C3B Exports
    batchState,
    queueItems,
    showBatchConfirmModal,
    setShowBatchConfirmModal,
    batchConfirmInfo,
    batchWithText,
    setBatchWithText,
    handleTriggerBatchMissingModal,
    handleStartBatchGeneration,
    handlePauseBatch,
    handleResumeBatch,
    handleCancelBatch,
    handleRetryFailedBatch,
    handleAutoLayoutNodes,
    handleGrid3x3Layout,
    handleSeamlessLayout,

    // C4-Edit Exports
    selectAllNodes,
    clearSelection,
    deleteSelectedNodes,
    deleteNodeById,
    duplicateSelectedNodes,
    duplicateNodeById,
    addCustomNode,
    updateNodeData,

    // C4A-1 Exports
    saveStatus,
    assetQueueStats,
    retryAssetUpload: (jobId: string) => assetQueueManager.retryJob(jobId),
    lastSavedAt,
    currentRevisionNumber,
    showSaveVersionModal,
    setShowSaveVersionModal,
    showHistoryModal,
    setShowHistoryModal,
    handleSaveDraftNow,
    handleSaveVersion,
    handleRestoreRevision,
    exportCanvasJson,
    importCanvasJson,
    restoreNodeWorkflow,
    viewport,
    setViewport,
    canvasId: normalizeCanvasIds(activeProject?.id || activeProjectRef.current?.id || workspaceIdParam).canvasId
  };
}
