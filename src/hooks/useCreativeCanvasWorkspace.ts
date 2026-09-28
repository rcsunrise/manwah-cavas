import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Node, Edge, useNodesState, useEdgesState } from '@xyflow/react';
import { CreativeProject, ProductVisualDNA, AgentRun, ImageAttachment } from '../types';
import { AgentMessage, SceneQueueItem, GenerationBatch, SaveStatus, ViewportState, AgentConversationRecord, AgentChatMessageRecord, AgentContextSnapshot, AgentErrorCode } from '../types/creativeCanvas';
import { assetQueueManager, QueueStats } from '../services/assetQueueService';
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
    onNodesChange(changes);
  }, [hydrationState, onNodesChange]);

  const handleEdgesChange = useCallback((changes: any) => {
    if (hydrationState === 'ready' && !isRestoringRef.current) {
      hasUserMutationRef.current = true;
    }
    onEdgesChange(changes);
  }, [hydrationState, onEdgesChange]);

  const activeProjectRef = useRef<CreativeProject | null>(null);
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

  // Phase C2 states for 9-grid planning
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null);
  const agentRunRef = useRef<AgentRun | null>(null);
  agentRunRef.current = agentRun;
  const [isPlanGenerating, setIsPlanGenerating] = useState<boolean>(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState<number | null>(null);

  // Model & Resolution config for Image Generation
  const [selectedModel, setSelectedModel] = useState<string>('openai/gpt-image-2-c');
  const [planAgentModel, setPlanAgentModel] = useState<string>('gemini-2.5-flash');
  const [planReasoningEffort, setPlanReasoningEffort] = useState<'minimal' | 'low' | 'medium' | 'high'>('medium');
  const [planTargetAudience, setPlanTargetAudience] = useState<string>('');
  const [planScreenCount, setPlanScreenCount] = useState<number>(1);
  const [planAspectRatio, setPlanAspectRatio] = useState<string>('4:3');
  const [selectedResolution, setSelectedResolution] = useState<'1K' | '2K' | '4K'>('2K');

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

  const addAgentMessage = useCallback((text: string) => {
    setMessages(prev => [
      ...prev,
      {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sender: 'agent',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  }, []);

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

  const addUserMessage = useCallback((text: string) => {
    setMessages(prev => [
      ...prev,
      {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sender: 'user',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  }, []);

  // G0-1: Conversation initialization and load
  const loadOrInitConversation = useCallback(async (projId: string, canvId: string) => {
    try {
      let list: AgentConversationRecord[] = [];
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
      setConversationsList(list);

      let conv = list.find(c => c.status === 'active');
      if (!conv) {
        try {
          conv = await AgentChatService.createConversation(projId, canvId);
          setConversationsList(prev => [conv!, ...prev.filter(x => x.id !== conv!.id)]);
        } catch (createErr) {
          // Local fallback active conversation if server is temporarily unreachable
          const fallbackConv: AgentConversationRecord = {
            id: `conv_fallback_${Date.now()}`,
            user_id: 'default_user',
            project_id: projId,
            canvas_id: canvId,
            title: '全新企划对话',
            status: 'active',
            provider: 'google',
            model: 'gemini-2.5-pro',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          conv = fallbackConv;
          setConversationsList(prev => [fallbackConv, ...prev]);
        }
      }
      setCurrentConversation(conv);

      try {
        const historyMsgs = await AgentChatService.loadMessages(conv.id);
        if (historyMsgs && historyMsgs.length > 0) {
          const mappedMsgs: AgentMessage[] = historyMsgs.map(m => ({
            id: m.id,
            sender: m.role === 'user' ? 'user' : 'agent',
            text: typeof m.content === 'object' && m.content.text ? m.content.text : String(m.content),
            timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: m.status as any,
            error_code: m.error_code as any
          }));
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
  const handleSendMessageStream = useCallback(async (textText: string) => {
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

    const contextSnapshot: AgentContextSnapshot = {
      projectId: targetProjectId,
      canvasId: targetCanvasId,
      activeSceneKey: selectedSceneIndex ? `scene-0${selectedSceneIndex}` : undefined,
      selectedNodeIds: selectedNodeId ? [selectedNodeId] : undefined,
      productDnaVersionId: productDnaVersionId || null,
      assetVersionId: activeAssetVersionId,
      copyVersionId: null,
      typographySpecId: null
    };

    const userMsgId = `user-msg-${Date.now()}`;
    const assistantMsgId = `assistant-msg-${Date.now()}`;
    const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const userMessage: AgentMessage = {
      id: userMsgId,
      sender: 'user',
      text: textText.trim(),
      timestamp: timestampStr
    };

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
      abortController: controller,
      onDelta: (delta) => {
        accumulatedText += delta;
        setMessages(prev => prev.map(m => {
          if (m.id === assistantMsgId) {
            return { ...m, text: accumulatedText };
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
              text: (completedRecord.content && completedRecord.content.text) || accumulatedText,
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
              text: accumulatedText ? `${accumulatedText}\n\n[回答中断: ${err.message}]` : `[发送失败: ${err.message}]`
            };
          }
          return m;
        }));
      }
    });
  }, [currentConversation, workspaceIdParam, isStreaming, selectedSceneIndex, selectedNodeId, productDnaVersionId, nodes]);

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
            return { ...m, text: accumulatedText };
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
              text: (record.content && record.content.text) || accumulatedText,
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
              text: accumulatedText ? `${accumulatedText}\n\n[重试失败: ${err.message}]` : `[重试失败: ${err.message}]`
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
      if (historyMsgs && historyMsgs.length > 0) {
        const mappedMsgs: AgentMessage[] = historyMsgs.map(m => ({
          id: m.id,
          sender: m.role === 'user' ? 'user' : 'agent',
          text: typeof m.content === 'object' && m.content.text ? m.content.text : String(m.content),
          timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          status: m.status as any,
          error_code: m.error_code as any
        }));
        setMessages(mappedMsgs);
      }
    } catch (e) {
      console.error('Failed to select conversation:', e);
    }
  }, [conversationsList]);

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
        body: JSON.stringify({
          imageBase64List: [base64]
        })
      });

      const data = await parseJsonResponse<{ success?: boolean; productDna?: ProductVisualDNA; error?: string; message?: string }>(res);

      if (data.success && data.productDna) {
        setActiveDna(data.productDna);
        setUploadState('completed');
        addAgentMessage('✅ 产品 DNA 提取完成！点击下方【生成全案企划】按钮即可启动爆款详情页  屏方案策划。');

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

    setUploadState('uploading');
    setErrorMessage(null);
    addUserMessage(`上传产品主图：${file.name}`);

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

        await performDnaExtraction(proj, b64);
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

  const handleReanalyze = () => {
    if (activeProject && uploadedBase64) {
      performDnaExtraction(activeProject, uploadedBase64);
    }
  };

  handleUploadFileRef.current = handleUploadFile;
  handleRemoveProductImageRef.current = handleRemoveProductImage;
  handleReanalyzeRef.current = handleReanalyze;

  const isPlanGeneratingRef = useRef(false);

  // Phase C2: Generate 9-grid plan
  const handleGenerateNineGridPlan = async (promptHint?: string) => {
    if (isPlanGeneratingRef.current) {
      console.warn('企划生成请求正在进行中，自动忽略重复触发');
      return;
    }

    const proj = activeProject || (await getOrCreateProject());
    if (!proj) {
      setPlanError('无法初始化项目容器');
      return;
    }

    isPlanGeneratingRef.current = true;
    setIsPlanGenerating(true);
    setPlanError(null);
    const modelDisplayName =
      planAgentModel === 'gemini-3.7-flash'
        ? 'Gemini 3.7 Flash'
        : planAgentModel === 'gpt-6'
        ? 'GPT-6 Astra'
        : planAgentModel;
    addAgentMessage(
      planAgentModel.startsWith('gpt-')
        ? `正在使用 ${modelDisplayName} 结构化输出生成 ${planScreenCount} 屏企划方案...`
        : `正在使用 ${modelDisplayName} 策划引擎生成 ${planScreenCount} 屏企划方案...`
    );

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
          screenCount: planScreenCount,
          aspectRatio: planAspectRatio,
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
        addAgentMessage(
          planScreenCount === 1
            ? '🎉 单屏视觉企划方案生成成功！已转换为 1 个策划节点和 1 个分镜方案节点并同步显示在画布中。'
            : `🎉 全案视觉企划方案生成成功！已转换为 1 个总策划节点和 ${planScreenCount} 个分镜方案节点并同步显示在画布中。`
        );
      } else {
        const errStr = genData.error || genData.message || '服务端生成企划失败';
        setPlanError(errStr);
        setIsPlanGenerating(false);
        addAgentMessage(`❌ 全案企划生成异常：${errStr}`);
      }
    } catch (err: any) {
      // Direct fetch may fail if intermediate proxy or browser idle connection dropped during long reasoning (e.g. 60-120s).
      // The backend will still finish in background. Poll backend status to recover seamlessly:
      let recovered = false;
      const currentRunId = activeRunIdForRecovery || agentRun?.id;
      if (currentRunId) {
        try {
          addAgentMessage(`⏳ 正在同步后台 ${planScreenCount} 屏策划生成进度（模型已在后台调用或深度生成中，正在为您同步状态）...`);
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
                    addAgentMessage(
                      planScreenCount === 1
                        ? '🎉 单屏视觉企划方案已从后台同步就绪！已转换为 1 个策划节点和 1 个分镜方案节点并同步显示在画布中。'
                        : `🎉 全案视觉企划方案已从后台同步就绪！已转换为 1 个总策划节点和 ${planScreenCount} 个分镜方案节点并同步显示在画布中。`
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
        addAgentMessage(`❌ 全案企划生成失败：${errStr}`);
      }
    } finally {
      isPlanGeneratingRef.current = false;
    }
  };

  // Phase C2: Single screen replanning
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
    addAgentMessage(`正在重新策划第 ${screenIndex} 屏分镜...`);

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
            if (n.id === `scene-plan-node-${screenIndex}`) {
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
                    setSelectedNodeId(`scene-plan-node-${screenIndex}`);
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
        addAgentMessage(`✅ 第 ${screenIndex} 屏分镜（${screen.screenTitle}）重新策划完成！节点已更新。`);
      } else {
        const errStr = data.error || data.message || '单屏重新策划失败';
        setPlanError(errStr);
        setIsPlanGenerating(false);
        addAgentMessage(`❌ 第 ${screenIndex} 屏重新策划失败：${errStr}`);
      }
    } catch (err: any) {
      const errStr = err?.message || '请求失败';
      setPlanError(errStr);
      setIsPlanGenerating(false);
      addAgentMessage(`❌ 单屏重新策划异常：${errStr}`);
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
    withText?: boolean
  ): Promise<boolean> => {
    if (generatingScenesRef.current.has(screenIndex)) {
      console.warn(`第 ${screenIndex} 屏图片生成正在进行中，忽略重复触发`);
      return false;
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
    const sceneNode = currentNodes.find(
      n => n.id === `scene-plan-node-${screenIndex}` || 
           n.data?.screenIndex === screenIndex || 
           Number(n.data?.screenIndex) === screenIndex ||
           n.id === `screen-${screenIndex}` ||
           (n.id === selectedNodeId && (n.data?.promptSuggestion || n.data?.prompt))
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
    const modelLabel = isGpt ? 'OpenAI GPT image-2' : modelToUse.includes('3-pro') ? 'Google Gemini v3.0 Pro' : modelToUse.includes('2.5') ? 'Google Gemini v2.5 Flash' : 'Google Gemini v3.1 Flash';
    addAgentMessage(`正在调用 ${modelLabel} (${resolutionToUse}) 渲染引擎生成第 ${screenIndex} 屏画面...`);

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
              imageUrl: result.imageUrl,
              dimensions: resolutionToUse === '4K' ? '3840x2160' : resolutionToUse === '2K' ? '2560x1440' : '1024x1365',
              aspectRatio: screen!.aspectRatio || '3:4',
              model: result.actualModel || modelToUse,
              provider: result.provider || (isGpt ? 'openai' : 'google'),
              generatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              version,
              reviewStatus: 'pendingReview',
              prompt: fullPrompt,
              cleanBackgroundUrl: withText ? undefined : result.imageUrl,
              rawImageUrl: result.imageUrl,
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

        addAgentMessage(`✅ 第 ${screenIndex} 屏渲染图片生成成功！已加入画布节点，请在右侧进行审阅。`);
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
      addAgentMessage(`❌ 第 ${screenIndex} 屏渲染图片失败：${errText}`);
      return false;
    } finally {
      generatingScenesRef.current.delete(screenIndex);
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
    setNodes(prevNodes => {
      const { nodes: arranged } = arrangeCleanTreeLayout(prevNodes, edges);
      return arranged;
    });
    addAgentMessage('已为您一键按全案企划顺序整齐排列并对齐画布节点。');
  }, [edges, setNodes, addAgentMessage]);

  const handleGrid3x3Layout = useCallback((selectedOnly: boolean = false) => {
    setNodes(prevNodes => {
      const { nodes: arranged } = arrangeGrid3x3Layout(prevNodes, selectedOnly);
      return arranged;
    });
    addAgentMessage(selectedOnly ? '已将选中的节点按 3x3 九宫格平铺排列。' : '已将全案海报与结果节点按 3x3 九宫格模式精准对齐排列。');
  }, [setNodes, addAgentMessage]);

  const handleSeamlessLayout = useCallback((selectedOnly: boolean = false) => {
    setNodes(prevNodes => {
      const { nodes: arranged } = arrangeSeamlessVerticalLayout(prevNodes, selectedOnly);
      return arranged;
    });
    addAgentMessage(selectedOnly ? '已将选中的节点首尾无缝拼接垂直排列。' : '已将全案 9 屏海报按首尾相接拼接为 2100×14800 长图视觉垂直排列。');
  }, [setNodes, addAgentMessage]);

  const handleTriggerBatchMissingModal = useCallback((withTextParam?: boolean) => {
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
      const confirmReall = window.confirm(`当前 ${screens.length} 屏均已存在画面，是否全部重新全量生成画面？`);
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
            batchWithTextRef.current
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
      const selectedIds = new Set(prev.filter(n => n.selected).map(n => n.id));
      if (selectedIds.size === 0) return prev;

      setEdges(prevEdges =>
        prevEdges.filter(e => !selectedIds.has(e.source) && !selectedIds.has(e.target))
      );

      return prev.filter(n => !selectedIds.has(n.id));
    });
  }, [setNodes, setEdges]);

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
  const attachNodeHandlers = useCallback(
    (nodeList: Node[]): Node[] => {
      return nodeList.map(node => {
        const data = { ...(node.data || {}) };

        // Bind universal edit & delete handlers to every node
        data.onDelete = () => deleteNodeById(node.id);
        data.onDuplicate = () => duplicateNodeById(node.id);
        data.onChange = (updated: any) => updateNodeData(node.id, updated);
        data.onUpdate = (updated: any) => updateNodeData(node.id, updated);

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
          data.onSelectDnaVersion = handleSelectDnaVersion;
          if (!data.dna && activeDna) {
            data.dna = activeDna;
            if (data.status === 'idle' || !data.status) data.status = 'completed';
          }
        } else if (isPlan) {
          data.onViewFullPlan = () => {
            setSelectedNodeId(node.id);
            setSelectedSceneIndex(null);
          };
          data.onRegenerateAll = () => handleGenerateNineGridPlan();
          data.onGenerateMissingImages = () => handleTriggerBatchMissingModal();
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
          data.onReplanScene = () => handleReplanSingleScene(idx);
          data.onGenerateImage = () => handleGenerateSceneImage(idx);
          data.onGenerateWithText = () => handleGenerateSceneImage(idx, undefined, undefined, undefined, true);
        } else if (isGenTask) {
          const idxStr = node.id.replace('img-gen-task-', '').replace('screen-', '');
          const idx: number = parseInt(idxStr, 10) || Number(data.screenIndex) || 1;
          data.onGenerate = () => handleGenerateSceneImage(idx);
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
          data.onApprove = () => handleApproveSceneImage(idx);
          data.onReject = (feedback: string) => handleRejectSceneImage(idx, feedback);
          data.onOpenPosterStudio = () => onOpenPosterStudioRef.current?.(idx);
          data.onGeneratePoster = () => handleGenerateSceneImage(idx, undefined, undefined, undefined, true);
        } else if (isProdImg) {
          data.onUpload = (f: File) => (handleUploadFileRef.current ? handleUploadFileRef.current(f) : handleUploadFile(f));
          data.onRemove = () => (handleRemoveProductImageRef.current ? handleRemoveProductImageRef.current() : handleRemoveProductImage());
          data.onReanalyze = () => (handleReanalyzeRef.current ? handleReanalyzeRef.current() : handleReanalyze());
          if (!data.imageUrl && (uploadedImageUrl || uploadedBase64)) {
            data.imageUrl = uploadedImageUrl || uploadedBase64;
            if (data.status === 'idle' || !data.status) data.status = 'completed';
          }
        }

        return { ...node, data };
      });
    },
    [
      deleteNodeById,
      duplicateNodeById,
      updateNodeData,
      handleGenerateNineGridPlan,
      handleReplanSingleScene,
      handleGenerateSceneImage,
      handleApproveSceneImage,
      handleRejectSceneImage,
      handleReanalyze,
      handleTriggerBatchMissingModal,
      handleSelectDnaVersion,
      batchState,
      dnaCode,
      productDnaVersionCode,
      productDnaVersionId,
      dnaVersions,
      activeDna,
      uploadedImageUrl,
      uploadedBase64
    ]
  );

  const displayNodes = useMemo(() => {
    return attachNodeHandlers(nodes);
  }, [nodes, attachNodeHandlers]);

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

      if (targetProjectId && targetProjectId !== 'new' && targetProjectId !== 'latest') {
        try {
          const authHeaders = await getAuthHeaders();
          const pRes = await fetch(`/api/projects/${targetProjectId}`, { headers: { ...authHeaders } });
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
          const rRes = await fetch(`/api/agent-runs?projectId=${targetProjectId}`, { headers: { ...authHeaders } });
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
        const serverCanvas = await canvasService.getCanvas(targetCanvasId);
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

      if (!serverSuccess && isMounted) {
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
        setSaveStatus('cloud_saved');

        logCanvasDiagnostic({
          projectId: targetProjectId,
          canvasId: targetCanvasId,
          source: 'default_canvas_initialized_with_dna',
          nodesCount: defaultEnriched.nodes.length
        });
      }

      if (isMounted) {
        loadOrInitConversation(targetProjectId, targetCanvasId);
        setHydrationState('hydrated');
        setTimeout(() => {
          if (isMounted) {
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

  // 2. Debounced Auto-Save Draft Effect (5 minutes interval / 300,000ms debounce)
  useEffect(() => {
    if (hydrationState !== 'ready' || isRestoringRef.current || !hasUserMutationRef.current) {
      return;
    }

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

    setSaveStatus('unsynced');

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // 5 minutes (300,000ms) interval
    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const rawTarget = activeProjectRef.current?.id || workspaceIdParam;
        const { projectId: targetProjectId, canvasId: targetCanvasId } = normalizeCanvasIds(rawTarget);

        logCanvasDiagnostic({
          projectId: targetProjectId,
          canvasId: targetCanvasId,
          source: 'auto_save_5min_triggered',
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

        setSaveStatus('local_saved');
        setLastSavedAt(nowIso);
      }
    }, 300000); // 5 minutes

    return () => {
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

    try {
      await canvasService.saveCanvasDraft(newCanvasId, {
        nodesDraft: initialNodes as any,
        edgesDraft: [],
        viewportDraft: { x: 0, y: 0, zoom: 1 },
        canvasName: '新建立体视觉企划案',
        hasExplicitUserClear: true
      });
      setSaveStatus('cloud_saved');
    } catch (err) {
      console.warn('Failed to save fresh draft to server:', err);
      setSaveStatus('local_saved');
    }

    return newProjectId;
  }, [getStorageKey, activeProject, workspaceIdParam, setNodes, setEdges]);

  return {
    nodes: displayNodes,
    rawNodes: nodes,
    setNodes,
    edges,
    onNodesChange,
    onEdgesChange,
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
    handleSelectConversation,
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
    generatingScenes: generatingScenesRef.current,
    handleGenerateSceneImage,
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
