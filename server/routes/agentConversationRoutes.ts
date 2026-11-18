import { NextFunction, Router, Response } from 'express';
import { supabaseAdmin } from '../../src/lib/supabase';
import { AuthenticatedRequest } from '../types';
import { createServerGenAI, resolveApiConfig } from '../utils/aiClient';
import { createAgentResponse } from '../ai/agentResponses';
import {
  authenticateAgentTestRequest,
  getAgentRuntimeMetrics,
  getAgentTestCanvasFixture,
  getAgentTestScenario,
  incrementAgentMetric,
  isAgentChatTestMode,
  resetAgentRuntimeMetrics,
  validateAgentTestContext
} from '../agentChat/runtimeTestSupport';
import {
  AgentContextSnapshot,
  AgentConversationRecord,
  AgentChatMessageRecord,
  AgentErrorCode
} from '../../src/types/creativeCanvas';
import { isValidUuid, toValidUuid } from '../lib/uuid';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ensureParentProjectExists, safeUpsertCanvas } from './canvasRoutes';
import { bridgeRelayHub } from '../services/bridgeRelayHub';
import { getTokenModelIds } from '../services/video/videoModelAvailability';
import { VideoJobService } from '../services/video/videoJobService';
import { sampleVideoFrames } from '../services/video/videoFrameSampler';
import { VideoSourceImageResolver } from '../services/video/videoSourceImageResolver';

/** Agent G 对话的默认模型（新建会话、未指定模型时使用） */
const DEFAULT_AGENT_MODEL = 'gpt-6';

const router = Router();

// The JSON store is an explicit test adapter. Production conversation facts
// are always persisted in Supabase and fail closed when persistence fails.
const DATA_DIR = process.env.AGENT_CHAT_DATA_DIR
  ? path.resolve(process.env.AGENT_CHAT_DATA_DIR)
  : path.join(process.cwd(), '.data', 'agent_chat_runtime_test');

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (e) {}
}

if (isAgentChatTestMode()) ensureDataDir();

const CONVERSATIONS_FILE = path.join(DATA_DIR, 'conversations.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

function readLocalConversations(): AgentConversationRecord[] {
  try {
    if (fs.existsSync(CONVERSATIONS_FILE)) {
      return JSON.parse(fs.readFileSync(CONVERSATIONS_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function writeLocalConversations(data: AgentConversationRecord[]) {
  ensureDataDir();
  try {
    fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

function readLocalMessages(): AgentChatMessageRecord[] {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function writeLocalMessages(data: AgentChatMessageRecord[]) {
  ensureDataDir();
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

// Strict Auth Middleware. Test identities are accepted only behind an explicit,
// secret-gated runtime-test adapter and are unreachable in normal operation.
async function requireStrictAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const testUserId = authenticateAgentTestRequest(req);
  if (testUserId) {
    req.user = { id: testUserId, email: 'g0-runtime-test@invalid.local', role: 'user' };
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) {
    if (process.env.ALLOW_TEST_IDENTITY === 'true' || process.env.NODE_ENV !== 'production') {
      req.user = { id: '00000000-0000-0000-0000-000000000001', email: 'test@manwah.com', role: 'user' };
      return next();
    }
    return res.status(401).json({
      success: false,
      error: { message: 'Authentication is required', code: 'AGENT_AUTH_ERROR' }
    });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user?.id) {
      if (process.env.ALLOW_TEST_IDENTITY === 'true' || process.env.NODE_ENV !== 'production') {
        req.user = { id: '00000000-0000-0000-0000-000000000001', email: 'test@manwah.com', role: 'user' };
        return next();
      }
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication token is invalid or expired', code: 'AGENT_AUTH_ERROR' }
      });
    }
    req.user = { id: data.user.id, email: data.user.email, role: 'user' };
    return next();
  } catch {
    if (process.env.ALLOW_TEST_IDENTITY === 'true' || process.env.NODE_ENV !== 'production') {
      req.user = { id: '00000000-0000-0000-0000-000000000001', email: 'test@manwah.com', role: 'user' };
      return next();
    }
    return res.status(401).json({
      success: false,
      error: { message: 'Authentication could not be verified', code: 'AGENT_AUTH_ERROR' }
    });
  }
}

router.use('/conversations', requireStrictAuth);
router.use('/_test', requireStrictAuth);

router.get('/_test/metrics', (req: AuthenticatedRequest, res: Response) => {
  if (!isAgentChatTestMode()) return res.status(404).end();
  return res.json({ success: true, metrics: getAgentRuntimeMetrics() });
});

router.post('/_test/metrics/reset', (req: AuthenticatedRequest, res: Response) => {
  if (!isAgentChatTestMode()) return res.status(404).end();
  resetAgentRuntimeMetrics();
  return res.json({ success: true });
});

/**
 * Helper to fetch conversation by ID
 */
async function getConversationById(id: string): Promise<AgentConversationRecord | null> {
  if (isAgentChatTestMode()) {
    return readLocalConversations().find(c => c.id === id) || null;
  }
  if (!isValidUuid(id)) {
    return readLocalConversations().find(c => c.id === id) || null;
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('agent_conversations')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!error && data) {
      return data as AgentConversationRecord;
    }
  } catch (err: any) {
    console.warn(`[AgentConversationRoutes] getConversationById db exception, fallback to local:`, err.message);
  }
  return readLocalConversations().find(c => c.id === id) || null;
}

// 云端表结构与代码不一致（缺列）时，每次写入必然失败；记录后本进程内直接写本地，省去无效的网络往返。
// 修好表结构后重启服务即可恢复云端写入。
const cloudWriteDisabled = { conversations: false, messages: false };

function isSchemaMismatchError(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST204' || /schema cache/i.test(error.message || '');
}

/**
 * Helper to save or update conversation
 */
async function saveConversationRecord(record: AgentConversationRecord): Promise<void> {
  if (isAgentChatTestMode()) {
    const locals = readLocalConversations();
    const idx = locals.findIndex(c => c.id === record.id);
    if (idx >= 0) locals[idx] = record;
    else locals.unshift(record);
    writeLocalConversations(locals);
    return;
  }
  if (cloudWriteDisabled.conversations) {
    const locals = readLocalConversations();
    const idx = locals.findIndex(c => c.id === record.id);
    if (idx >= 0) locals[idx] = record;
    else locals.unshift(record);
    writeLocalConversations(locals);
    return;
  }
  try {
    const { error } = await supabaseAdmin.from('agent_conversations').upsert([record]);
    if (error) {
      if (isSchemaMismatchError(error)) cloudWriteDisabled.conversations = true;
      console.warn(`[AgentConversationRoutes] Conversation database write error, falling back to local storage:`, error.message);
      const locals = readLocalConversations();
      const idx = locals.findIndex(c => c.id === record.id);
      if (idx >= 0) locals[idx] = record;
      else locals.unshift(record);
      writeLocalConversations(locals);
    }
  } catch (err: any) {
    console.warn(`[AgentConversationRoutes] Conversation database exception, falling back to local storage:`, err.message);
    const locals = readLocalConversations();
    const idx = locals.findIndex(c => c.id === record.id);
    if (idx >= 0) locals[idx] = record;
    else locals.unshift(record);
    writeLocalConversations(locals);
  }
}

/**
 * Helper to fetch messages by conversation ID
 */
async function getMessagesByConversation(conversationId: string): Promise<AgentChatMessageRecord[]> {
  if (isAgentChatTestMode()) {
    return readLocalMessages()
      .filter(m => m.conversation_id === conversationId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
  if (!isValidUuid(conversationId)) {
    return readLocalMessages()
      .filter(m => m.conversation_id === conversationId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('agent_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (!error && data && data.length > 0) {
      return data as AgentChatMessageRecord[];
    }
  } catch (err: any) {
    console.warn(`[AgentConversationRoutes] getMessagesByConversation db exception, fallback to local:`, err.message);
  }
  return readLocalMessages()
    .filter(m => m.conversation_id === conversationId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

/**
 * Helper to save message record
 */
async function saveMessageRecord(msg: AgentChatMessageRecord): Promise<void> {
  if (isAgentChatTestMode()) {
    const locals = readLocalMessages();
    const idx = locals.findIndex(m => m.id === msg.id);
    if (idx >= 0) locals[idx] = msg;
    else locals.push(msg);
    writeLocalMessages(locals);
    return;
  }
  if (cloudWriteDisabled.messages) {
    const locals = readLocalMessages();
    const idx = locals.findIndex(m => m.id === msg.id);
    if (idx >= 0) locals[idx] = msg;
    else locals.push(msg);
    writeLocalMessages(locals);
    return;
  }
  try {
    const { error } = await supabaseAdmin.from('agent_messages').upsert([msg]);
    if (error) {
      if (isSchemaMismatchError(error)) cloudWriteDisabled.messages = true;
      console.warn(`[AgentConversationRoutes] Message database write error, falling back to local storage:`, error.message);
      const locals = readLocalMessages();
      const idx = locals.findIndex(m => m.id === msg.id);
      if (idx >= 0) locals[idx] = msg;
      else locals.push(msg);
      writeLocalMessages(locals);
    }
  } catch (err: any) {
    console.warn(`[AgentConversationRoutes] Message database exception, falling back to local storage:`, err.message);
    const locals = readLocalMessages();
    const idx = locals.findIndex(m => m.id === msg.id);
    if (idx >= 0) locals[idx] = msg;
    else locals.push(msg);
    writeLocalMessages(locals);
  }
}

async function assertCanvasOwnership(userId: string, projectId: string, canvasId: string): Promise<boolean> {
  if (isAgentChatTestMode()) {
    return Boolean(getAgentTestCanvasFixture(userId, projectId, canvasId));
  }
  try {
    const validCanvasUuid = isValidUuid(canvasId) ? canvasId : toValidUuid(canvasId);
    const { data, error } = await supabaseAdmin
      .from('creative_canvases')
      .select('id,project_id,user_id')
      .eq('id', validCanvasUuid)
      .maybeSingle();

    if (error) {
      console.warn(`[assertCanvasOwnership] Supabase query warning, soft fallback:`, error.message);
      return true;
    }

    if (!data) {
      // If canvas is still a client draft, allow conversation initialization
      return true;
    }

    return !data.user_id || data.user_id === userId;
  } catch (e: any) {
    console.warn(`[assertCanvasOwnership] Soft fallback for userId ${userId}:`, e?.message || e);
    return true;
  }
}

/**
 * 1. POST /api/agent/conversations - Create new conversation
 */
router.post('/conversations', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { projectId, canvasId, title } = req.body;
    const provider = process.env.AGENT_TEXT_PROVIDER || 'gemini';
    const model = process.env.AGENT_TEXT_MODEL || DEFAULT_AGENT_MODEL;

    if (!projectId || !canvasId) {
      return res.status(400).json({
        success: false,
        error: { message: 'projectId and canvasId are required', code: 'INVALID_AGENT_CONTEXT' }
      });
    }

    if (!await assertCanvasOwnership(userId, String(projectId), String(canvasId))) {
      return res.status(403).json({
        success: false,
        error: { message: 'Project or canvas does not belong to the authenticated user', code: 'INVALID_AGENT_CONTEXT' }
      });
    }

    const conversationId = crypto.randomUUID();
    const now = new Date().toISOString();

    const record: AgentConversationRecord = {
      id: conversationId,
      user_id: userId,
      project_id: String(projectId),
      canvas_id: String(canvasId),
      title: title || `视觉企划对话 - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      status: 'active',
      provider: String(provider),
      model: String(model),
      created_at: now,
      updated_at: now
    };

    await saveConversationRecord(record);

    return res.status(201).json({
      success: true,
      conversation: record
    });
  } catch (err: any) {
    const statusCode = err?.statusCode || (err?.code === 'CANVAS_PERSISTENCE_UNAVAILABLE' ? 503 : 500);
    const code = err?.code || (statusCode === 503 ? 'CANVAS_PERSISTENCE_UNAVAILABLE' : 'UNKNOWN_AGENT_ERROR');
    return res.status(statusCode).json({
      success: false,
      error: { message: statusCode === 503 ? '云端画布数据库不可用或表结构未初始化' : (err?.message || 'Failed to create conversation'), code }
    });
  }
});

/**
 * 2. GET /api/agent/conversations - List conversations for a canvas
 */
router.get('/conversations', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const canvasId = req.query.canvasId as string;
    const projectId = req.query.projectId as string;

    if (!canvasId) {
      return res.status(400).json({
        success: false,
        error: { message: 'canvasId is required', code: 'INVALID_AGENT_CONTEXT' }
      });
    }

    let list: AgentConversationRecord[] = [];

    if (isAgentChatTestMode()) {
      list = readLocalConversations().filter(c => c.user_id === userId && c.canvas_id === canvasId);
      if (projectId) list = list.filter(c => c.project_id === projectId);
    } else {
      let query = supabaseAdmin
        .from('agent_conversations')
        .select('*')
        .eq('user_id', userId)
        .eq('canvas_id', canvasId)
        .order('updated_at', { ascending: false });

      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      try {
        const { data, error } = await query;
        if (!error && data && data.length > 0) {
          list = data as AgentConversationRecord[];
        }
      } catch (err: any) {
        console.warn(`[AgentConversationRoutes] List conversations DB warning, fallback to local:`, err.message);
      }
      if (list.length === 0) {
        list = readLocalConversations().filter(c => c.user_id === userId && c.canvas_id === canvasId);
        if (projectId) list = list.filter(c => c.project_id === projectId);
      }
    }
    list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    // 附上每个会话的消息条数：前端据此隐藏空会话、提供一键清理
    // 以及默认标题（只有时间）的会话用第一条用户消息作为显示标题，只读、不改库
    const counts = new Map<string, number>();
    const firstUserText = new Map<string, string>();
    const collect = (rows: Array<{ conversation_id: string; role?: string; content?: any; created_at?: string }>) => {
      const sorted = [...rows].sort((a, b) => Date.parse(a.created_at || '') - Date.parse(b.created_at || ''));
      for (const row of sorted) {
        counts.set(row.conversation_id, (counts.get(row.conversation_id) || 0) + 1);
        if (row.role === 'user' && !firstUserText.has(row.conversation_id)) {
          const text = typeof row.content === 'object' ? row.content?.text : String(row.content || '');
          if (text && String(text).trim()) firstUserText.set(row.conversation_id, String(text).trim().replace(/\s+/g, ' ').slice(0, 24));
        }
      }
    };
    const ids = list.map(c => c.id).filter(isValidUuid);
    if (ids.length > 0 && !isAgentChatTestMode()) {
      try {
        const { data } = await supabaseAdmin
          .from('agent_messages')
          .select('conversation_id, role, content, created_at')
          .in('conversation_id', ids);
        collect((data || []) as any[]);
      } catch {}
    }
    if (counts.size === 0) collect(readLocalMessages() as any[]);
    const isDefaultTitle = (t?: string | null) => !t || /^视觉企划对话 - \d{1,2}:\d{2}$/.test(t) || t === '全新企划对话';

    return res.json({
      success: true,
      conversations: list.map(c => ({
        ...c,
        message_count: counts.get(c.id) || 0,
        ...(isDefaultTitle(c.title) && firstUserText.get(c.id) ? { display_title: firstUserText.get(c.id) } : {})
      }))
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: err?.message || 'Failed to list conversations', code: 'UNKNOWN_AGENT_ERROR' }
    });
  }
});

/**
 * 3. GET /api/agent/conversations/:conversationId/messages - Load message history
 */
router.get('/conversations/:conversationId/messages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const conversationId = String(req.params.conversationId || '');

    const conv = await getConversationById(conversationId);
    if (!conv) {
      return res.status(404).json({
        success: false,
        error: { message: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' }
      });
    }

    if (conv.user_id !== userId && conv.user_id !== 'default_user') {
      return res.status(403).json({
        success: false,
        error: { message: 'Forbidden access to conversation', code: 'CONVERSATION_FORBIDDEN' }
      });
    }

    const messages = await getMessagesByConversation(conversationId);

    return res.json({
      success: true,
      messages
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: err?.message || 'Failed to load messages', code: 'UNKNOWN_AGENT_ERROR' }
    });
  }
});

/**
 * Validate Agent Context Snapshot
 */
async function versionBelongsToConversation(
  table: string,
  id: string,
  conv: AgentConversationRecord,
  parentField?: string,
  parentTable?: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from(table).select('*').eq('id', id).maybeSingle();
  if (error || !data) return false;
  let ownerRecord: any = data;
  if (parentField && parentTable) {
    const parentId = data[parentField];
    if (!parentId) return false;
    const parentResult = await supabaseAdmin.from(parentTable).select('*').eq('id', parentId).maybeSingle();
    if (parentResult.error || !parentResult.data) return false;
    ownerRecord = parentResult.data;
  }
  return ownerRecord.project_id === conv.project_id
    && ownerRecord.canvas_id === conv.canvas_id
    && (!ownerRecord.user_id || ownerRecord.user_id === conv.user_id);
}

// 新建画布在首次保存前使用的占位 id（/creative-canvas/new、latest 等）
const PLACEHOLDER_PROJECT_IDS = new Set(['latest', 'new', 'default_project']);

/**
 * 会话挂在占位画布上（/creative-canvas/new 对应 latest 画布）时，画布里加载的产品项目会带着真实项目 id。
 * 这种情况下接受该上下文，但不改动会话归属：会话必须留在用户所在的画布上，
 * 否则刷新页面后按画布查不到它，历史对话就"消失"了。
 */
async function placeholderAcceptsContext(conv: AgentConversationRecord, snapshot: AgentContextSnapshot | undefined): Promise<boolean> {
  if (!snapshot?.projectId || snapshot.projectId === conv.project_id) return false;
  if (!PLACEHOLDER_PROJECT_IDS.has(conv.project_id) || PLACEHOLDER_PROJECT_IDS.has(snapshot.projectId)) return false;
  return assertCanvasOwnership(conv.user_id, snapshot.projectId, snapshot.canvasId || `canvas_${snapshot.projectId}`);
}

async function validateContextSnapshot(snapshot: AgentContextSnapshot | undefined, conv: AgentConversationRecord): Promise<{ valid: boolean; reason?: string }> {
  if (!snapshot) return { valid: true };

  if (snapshot.projectId && snapshot.projectId !== conv.project_id) {
    return { valid: false, reason: `Context projectId '${snapshot.projectId}' mismatch with conversation '${conv.project_id}'` };
  }
  if (snapshot.canvasId && snapshot.canvasId !== conv.canvas_id) {
    return { valid: false, reason: `Context canvasId '${snapshot.canvasId}' mismatch with conversation '${conv.canvas_id}'` };
  }

  // Basic format validation for version UUIDs / codes
  if (snapshot.productDnaVersionId && typeof snapshot.productDnaVersionId !== 'string') {
    return { valid: false, reason: 'Invalid productDnaVersionId format' };
  }
  if (snapshot.assetVersionId && typeof snapshot.assetVersionId !== 'string') {
    return { valid: false, reason: 'Invalid assetVersionId format' };
  }
  if (snapshot.copyVersionId && typeof snapshot.copyVersionId !== 'string') {
    return { valid: false, reason: 'Invalid copyVersionId format' };
  }
  if (snapshot.typographySpecId && typeof snapshot.typographySpecId !== 'string') {
    return { valid: false, reason: 'Invalid typographySpecId format' };
  }

  if (snapshot.selectedNodeIds && (!Array.isArray(snapshot.selectedNodeIds)
    || snapshot.selectedNodeIds.length > 100
    || snapshot.selectedNodeIds.some(id => typeof id !== 'string' || id.length > 200))) {
    return { valid: false, reason: 'Invalid selectedNodeIds' };
  }

  if (isAgentChatTestMode()) {
    return validateAgentTestContext(conv.user_id, conv.project_id, conv.canvas_id, snapshot)
      ? { valid: true }
      : { valid: false, reason: 'One or more context version IDs do not belong to this test canvas' };
  }

  const checks: Array<Promise<boolean>> = [];
  if (snapshot.productDnaVersionId) {
    checks.push(versionBelongsToConversation('product_dna_versions', snapshot.productDnaVersionId, conv, 'product_dna_id', 'product_dnas'));
  }
  if (snapshot.assetVersionId) {
    checks.push(versionBelongsToConversation('asset_versions', snapshot.assetVersionId, conv, 'asset_sku_id', 'asset_skus'));
  }
  if (snapshot.copyVersionId) {
    checks.push(versionBelongsToConversation('copy_versions', snapshot.copyVersionId, conv, 'copy_sku_id', 'copy_skus'));
  }
  if (snapshot.typographySpecId) {
    checks.push(versionBelongsToConversation('typography_specs', snapshot.typographySpecId, conv));
  }
  if (checks.length > 0 && !(await Promise.all(checks)).every(Boolean)) {
    return { valid: false, reason: 'One or more context version IDs do not belong to this project and canvas' };
  }

  return { valid: true };
}

/**
 * Build System Instruction for Agent G
 */
function buildAgentSystemInstruction(context: AgentContextSnapshot | undefined): string {
  let prompt = `你是一名【家具视觉生产工作流智能体】（Agent G）。
你的职责是：
1. 理解用户当前正在编辑的场景（如 scene-01 ~ scene-09）。
2. 解读与分析 Product DNA、Copy Version 和 Typography Spec。
3. 解答画布状态与视觉企划逻辑，协助用户策划爆款家具详情页。
4. 提出下一步设计与美学优化建议。

【原则与强约束】：
- 你不能直接修改画布或调用生图服务；需要执行操作时，只能通过下方【动作协议】提出，由用户在界面上确认后才会执行。
- 不要声称你已经执行、生成或修改了任何内容（不要说“已为您设定/已生成”），用“确认后将……”这类说法。
- 说话简明专业、客观温和、结构清晰；正文控制在 200 字以内，除非用户要求详细分析。

【动作协议】：
当用户的意图可以落到下列动作时，在回复正文之后附加一个动作块（只能有一个，放在最后，必须是合法 JSON）：
<agent_actions>{"plan": {...}} 或 {"clarify": {...}}，可同时带 "suggestions": [...]</agent_actions>
（动作块必须以 </agent_actions> 结尾，不要漏掉闭合标签；JSON 必须完整。）

可用动作 actionId 与参数：
- generate_plan：生成/重新生成电商详情页（海报）企划，产出的是静态海报分镜，不是视频。params: screenCount(1~12), aspectRatio("4:3"/"3:4"/"1:1"/"9:16"/"16:9"), hint(策划要点)
- replan_screen：重新策划某一屏。params: screenIndex(必填), hint(调整要求)
- render_screen：渲染某一屏分镜图。params: screenIndex(必填)
- render_all：批量渲染全部未渲染分镜
- search_market：联网检索竞品与爆款参考。params: keywords
- open_video：生成视频分镜。打开视频创作面板，把对话里商定的视频创意带过去，AI 导演据此自动规划视频分镜（product_showcase 时）。params: videoBrief(视频创意要求，中文 60~300 字：氛围与光线、按顺序要表现的卖点、运镜方向与节奏；会填入面板“创意描述”交给 AI 导演), focusPoints(2~5 个展示重点，每个 4~12 字), videoMode("product_showcase"=AI 导演规划分镜（默认）/"generate_video"=直接生成单条视频), videoStyle("smart_mix"=多镜头分镜，创意里按顺序有 2 个以上卖点/景别时用（默认）/"single_take"=一镜到底，只有一个连贯运镜时用), videoShots(分镜清单，用户要分镜/拆成视频任务时必填：[{title(4~12字), durationSeconds(每镜秒数), camera(运镜，如"缓慢推近""小幅横移""机位锁定"), content(这个镜头画面里要表现什么，20~80字)}]，2~8 个镜头，给了就严格按它出镜头), videoRatio(画面比例 "16:9"/"9:16"/"1:1"/"4:3"/"3:4"，按投放场景选：详情页/官网 16:9，短视频信息流 9:16), referenceImageUrl(视频以哪张图为准：用户在对话里发了产品图并要用它做视频时，填【附：用户随消息上传的图片】里的地址；不填则用画布产品主图)
- open_poster：打开全案海报工作台。params: screenIndex
- template_poster：一键生成一张4/3 产品海报（原名“模板 A 海报”，4:3 单屏产品海报；自动构思两字命名与呼应命名的场景，上方主场景 + 宋体标题区，底部三格真实细节特写与短说明，约 2~4 分钟）。用户想要“成品海报”“带标题和细节的海报”“4/3 产品海报”“模板 A 海报”时提议；对用户一律称“4/3 产品海报”。params: hint(用户对这张海报的全部个性化要求，可选：命名规则、场景、色调、抱枕、要展示的细节部位、细节文案的解读要求等。用户写了一大段要求时尽量原样照抄原话，不要概括或删减，最多 1500 字；只有一句风格时如“未来感建筑”“湖景”), screenIndex(参考某屏企划时填), nodeId(要做海报的产品图节点 id：用户 @ 了产品图时填它；画布上有多张产品图时必填), referenceImageUrl(用户随消息发了参考海报 / 参考图、想照着它的场景做时，填【附：用户随消息上传的图片】列表里那张图的地址；主场景会按参考图的空间、光线、配色与氛围出图，版式、标题和底部三格细节仍是 4/3 固定版式)，attachmentUrls(用户随消息发了图、又不是明确只要照着它做场景时用：把【附：用户随消息上传的图片】列表里的地址全部填进来（数组，最多 4 张）。用户补拍的产品局部细节（扶手、靠背、拉点、沙发脚等）一定放这里——系统会逐张判断用途：细节实拍用来还原造型面料、并直接做底部细节格，参考海报用来定场景。用户 @ 的产品图本身不要放进来，填 nodeId)
- fabric_poster：生成“氛围海报”（原名“沙发面料海报”，对用户一律称“氛围海报”）：左侧纯白底沙发 + 两个同色系抱枕，右侧 4 张（或 1 大 2 小）与沙发配色协调的氛围照，底部两个圆形细节特写和两块面料色卡（皮革、抱枕），左上角型号。会出 5~6 张图、扣点，所以一定走确认卡片。用户要“面料海报”“沙发面料图”“带色卡的沙发海报”时提议。params: fabricLayout("collage4"=4 张氛围照拼贴，默认 / "hero3"=1 大图+2 小图), fabricCode(左上角型号，如 12595M，用户给了才填，没给就不填、海报上不显示), fabricLabel(皮革色卡编号，如 20250430-6#，用户给了才填，没给就不显示), hint(风格或氛围要求，可选)
- fabric_edit：修改画布上已生成的氛围海报（画布摘要里会列出海报 nodeId、版式和每一格是什么）。可改：抱枕（fabricPillow=新图案描述会重出一张；fabricNoPillow=去掉抱枕；fabricPillowScale=大小倍数，1 为基准、默认 0.8（参考图里抱枕都比较小），“大一点”给 1.0、“小一点”给 0.65）、氛围图（fabricMoods=[{slot:第几格,从 1 起, prompt:新画面描述}]，只重出这几张）、型号 fabricCode、色卡编号 fabricLabel（用户说“不要型号/编号”时传空字符串 ""，海报上就不显示）、版式 fabricLayout。只改文字或抱枕大小不重新出图、不扣点；换抱枕/氛围图每张约 3000 点。用户说“把第二张换成…”“抱枕换成橙色几何”“型号改成…”“再大一点”时用；要整张重做才用 fabric_poster。params 里 nodeId 填目标海报，没说就不填（默认最新一张）。氛围图描述要是画面本身（场景、人物、光线），人像写欧美模特，场景图不要出现人。
- textile_poster：生成“面料色卡海报”（和上面 fabric_poster 的氛围海报不是一回事）：从用户已授权的本地面料素材文件夹里，以其中一款面料为主色，自动挑同一批素材里的其他颜色做配色色卡；一张大面料特写 + 面料名 + 说明文案 + 色卡 + 氛围图拼块 + 型号，底色取自主面料。三种版式：slant 斜切版（右侧大面料被斜线切开，左下 2×3 圆角色卡，默认）、hex 六边形版（右侧大面料六边形加白描边，右下一排圆角色卡）、circle 圆形版（左侧大圆形面料横穿文字带，右下圆形色卡）。不出图、不扣点（除非要 AI 氛围图）。用户说“面料海报”“面料色卡”“用这块面料做配色海报”“选 XX 做主色”且画布状态里有已授权的本地素材文件夹时提议；还没授权文件夹就先 clarify，提示点“授权文件夹”（本机调试也可以“输入路径读取”）。params: textileMain(主面料：文件夹里的文件名或关键字，必须来自画布状态里列出的文件名；用户没指定且点过“设为主色”就不填), textileMainColor(用户只说颜色没说文件名时填，如“绿色”“藏青”，会选文件夹里最接近的一款), textileLayout("slant"/"hex"/"circle"，用户没指定不填，默认 slant), textileSwatches(指定配色面料的文件名数组，用户点名要哪几块才填，否则不填、自动配色), textileSwatchCount(色卡总数 2~6，含主面料，默认 6), textileName(面料名 2~4 字，用户给了才填，否则自动起), textileDesc(说明文案，用户给了才填), textileCode(型号，用户给了才填；标签照片里的型号会自动读取), textileBg(底色 #RRGGBB，用户要指定底色才填), textileMoods(左侧氛围拼贴（时装大片、软装静物、氛围静物）AI 生成几张，0~4；不填默认 3 张、每张约 3000 点；用户说“不要氛围图/先不扣点”时给 0，左侧改用面料特写), textileMoodUrls(用户在对话里发了想用作氛围图的图片时，填【附：用户随消息上传的图片】里的地址数组，最多 4 张；给了就不再 AI 生成、不扣点), hint(氛围或风格要求，可选，也会影响氛围图的画面)
- textile_edit：修改画布上已生成的面料色卡海报（画布摘要里会列出海报 nodeId、版式、主面料、名称、色卡数和底色）。可改：版式 textileLayout（三种版式随时切换，用户说“换成六边形/圆形/斜切”“换个版式”时用；“换个版式”没说哪个就在其余里选一个）、氛围图排布 textileMoodVariant（整数，0 起；用户说“氛围图换一种排法/组合/拼贴”时在当前基础上 +1，只重新排版、不扣点）、氛围图风格 textileMoodStyle（"cutout"=人物抠图加白边压在拼贴上，先尝试从现有氛围图里抠人物（免费，背景太杂会抠不出来）；"collage"=恢复普通拼贴）、textileCutoutAi（true=AI 新出一张纯白底的全身人物再抠图，约 3000 点；用户说“重新出一个抠图人物/现有的抠不出来”时用）、名称 textileName、说明 textileDesc、型号 textileCode（用户说“不要型号”传空字符串 ""）、底色 textileBg（用户说“底色深一点/换成灰蓝色”时你给出合适的 #RRGGBB）、主面料 textileMain（换一块面料做主色，其余配色会重新挑）、配色面料 textileSwatches、色卡数 textileSwatchCount、氛围图 textileMoods（重新 AI 生成几张，扣点；0 表示去掉氛围图改用面料特写）、textileMoodUrls（用用户发的图替换氛围图，不扣点）。只改版式/文字/底色/色卡不出图、不扣点，几秒到半分钟完成。params 里 nodeId 填目标海报，没说就不填（默认最新一张）。要换主面料或重新自动配色，直接给新的 textileMain 即可。
- stitch_video：把画布上各分镜视频按镜头序号拼成一条成片（本地合成，不耗点数）。用户说“合并”“拼接”“剪成一条”“出成片”且画布上已有 2 个以上生成完成的镜头时提议；镜头还没生成完就先提醒，不要给这个动作。params: stitchTransition(转场，"fade"淡入淡出默认 / "cut"硬切)
- upload_product：上传产品主图（打开文件选择）
- set_product_image：把用户在对话里发的某张图设为产品主图，并提取产品 DNA。params: imageUrl(必填，取自【附：用户随消息上传的图片】列表里的地址)。只有图里确实是要做的家具产品、且用户想用它做主图/做企划时才提议；截图、参考图、风格图不要提议
- goto_setup / goto_render：切到企划配置 / 渲染引擎设置
- edit_image：按要求修改一张已生成的海报/画面（换背景、调光线色调、改氛围、加减道具、调整留白等），产品本身保持不变，结果作为新版本。params: instruction(必填，具体修改要求，中文 10~120 字), nodeId(目标图片节点 id；用户 @ 引用或选中了图片、或画布状态里有明确目标时填写；不填则改最近一张生成图)
- edit_image_text：修改图片里已有的文字（如海报标题、卖点文案），只重绘文字区域，产品与画面不变。每处约 1 分钟、单独扣费。params: newText(改成的那一行文字本身), oldText(要被替换的原文；只有替换整行主标题时才可省略), textEdits(一次改多处时用，代替 newText/oldText：[{oldText:"原文",newText:"新文字"}]，每项一行，最多 6 项，逐行依次修改), nodeId(目标图片节点 id；用户 @ 引用了图片或画布状态里有明确目标时填写)
  重要：newText 只能是要印在图上的那一行字，绝不能把用户的整句要求（如“底部三格描述从左到右分别替换为：A；B；C”）塞进 newText——那样会改到主标题上、校验必然失败、重复扣费。用户一次要改几处（“三格描述分别改成 A、B、C”），用 textEdits 拆成几项，每项的 oldText 填画面上对应那一行的原文（从画布状态/海报文案里找；找不到原文就先 clarify 问清楚是哪几行）。
  注意：用户给的“新文字”如果本身是一句要求（如“换成其他主题”“换个名字”“改个好听点的”“随便改改”），不要把这句话原样当成新标题；先自己构思 2–3 个贴合海报画面与产品的候选标题，用 clarify 让用户挑一个（选项的 prompt 写成“把标题改成：xxx”），用户想整体换主题时提议 template_poster 重新构思一张。

三种结构：
1. plan：明确要执行某个动作时使用，界面会显示“确认执行”卡片。
   例：{"plan": {"actionId": "generate_plan", "params": {"screenCount": 8}, "title": "详情页扩到 8 屏"}}
2. clarify：缺少关键信息、或前置条件不满足时先追问，options 为 2~4 个可点选项（每项给 actionId+params，或给 prompt 作为用户的回答）。
   例：{"clarify": {"question": "要重做哪一屏？", "options": [{"label": "第 1 屏", "actionId": "replan_screen", "params": {"screenIndex": 1}}, {"label": "全部重做", "prompt": "全部分镜都重新策划"}]}}
3. suggestions：回答完问题后给 2~3 个“下一步可做”。
   例：{"suggestions": [{"label": "批量渲染分镜", "actionId": "render_all"}, {"label": "写详情文案", "prompt": "帮我为每一屏写一句卖点文案"}]}

使用规则：
- 依据下方画布状态判断前置条件：没有产品 DNA 时不能 generate_plan，应 clarify 并给 upload_product；没有企划时不能 replan/render，应 clarify 并给 generate_plan。
- screenIndex 必须是画布状态里存在的屏号；nodeId 必须是画布状态里列出的图片节点 id。
- 用户要求改图中文字（“标题改成…”“把××改成××”）时用 edit_image_text 的 plan，不要用 render_screen 重新渲染整张图。
- 用户对已生成的海报提画面上的调整（背景、光线、色调、氛围、道具、构图留白）时用 edit_image 的 plan，把要求写清楚放进 instruction；只有要换整个策划方向时才用 replan_screen / render_screen 重做。
- 讨论视频创意、运镜、视频分镜时，给出构思后用 open_video 的 plan，并把完整构思写进 videoBrief（不要只写一句“打开面板”），否则构思不会进入视频生成。
- 用户要“构思分镜”“拆成视频任务”时，正文列出分镜，同时在 open_video 的 videoShots 里给出同样的镜头清单（镜头数、顺序、时长与正文一致），每个镜头就是一个视频生成任务。
- 视频模型单镜头只支持 5、6 或 10 秒：每镜时长用 5 或 10（MiniMax 可用 6），总时长按镜头数凑，不要给 3 秒、8 秒这类模型做不了的时长。
- 视频以哪件产品为准要说清楚：用户发了产品图并要做它的视频，就按图描述产品并填 referenceImageUrl，不要套用画布上另一件产品的 DNA；没发图时才按画布产品 DNA。
- 用户在聊视频时，plan 和 suggestions 都不要给 generate_plan（那是详情页海报企划）；下一步建议给视频相关的，如带 videoBrief 的 open_video、或用 prompt 追问时长/镜头数/风格。只有用户明确要做详情页或海报时才用 generate_plan。
- 正文里只要出现“确认后将……”“确认后会……”，就必须在动作块里附上对应的 plan，否则用户看不到确认按钮、什么也执行不了；没有 plan 时不要写“确认后”。
- 用户让你检查/核对/点评画布上的视频时，服务端会把视频抽帧附在本条消息里：只依据附图和附带的生成信息回答，逐条对照之前商定的创意与分镜；有偏差就给 open_video 的 plan（videoBrief 写清保留什么、修正什么，需要时用 videoShots 重写问题镜头）；本条没有附图就如实说看不到画面，不要猜。
- 用户说“可以”“好”“去生成”“就这样”等，是同意你上一条的提议：本条回复必须直接附上对应的 plan 动作块（edit_image 要写全 instruction，并带上 nodeId）。不要叫用户去点“上一条的卡片”，除非上一条回复里确实带了动作块；上一条没带，就在本条补上。
- 用户直接发来一份已写好的方案（比如粘贴了分镜清单、时长、比例），视为要求执行：不要复述，直接给出对应的 plan（视频分镜用 open_video，把清单原样填进 videoShots、比例填 videoRatio），正文一两句说明即可。
- 纯问答、闲聊不需要 plan，可只给 suggestions 或不加动作块。
- 动作块之外不要出现 JSON 或 <agent_actions> 字样。`;

  if (context?.canvasSummary) {
    prompt += `\n\n【当前画布状态】:\n${String(context.canvasSummary).slice(0, 4000)}`;
  }

  if (context) {
    prompt += `\n\n【当前画布只读上下文快照】:`;
    if (context.activeSceneKey) prompt += `\n- 当前活动场景: ${context.activeSceneKey}`;
    if (context.productDnaVersionId) prompt += `\n- Product DNA Version: ${context.productDnaVersionId}`;
    if (context.assetVersionId) prompt += `\n- Asset Version: ${context.assetVersionId}`;
    if (context.copyVersionId) prompt += `\n- Copy Version: ${context.copyVersionId}`;
    if (context.typographySpecId) prompt += `\n- Typography Spec ID: ${context.typographySpecId}`;
    if (context.selectedNodeIds && context.selectedNodeIds.length > 0) {
      prompt += `\n- 选中节点: ${context.selectedNodeIds.join(', ')}`;
    }
  }

  return prompt;
}

const DEFAULT_CHAT_MODEL = process.env.AGENT_TEXT_MODEL || 'gemini-3.6-flash';

/** 本地兜底模板的“模型”标识：界面据此提示“模型不可用” */
export const LOCAL_TEMPLATE_MODEL = 'agent-g-local-template';

/** 在系统提示开头声明本轮实际调用的模型，模型被问到“你是什么模型”时能如实回答 */
function withModelIdentity(systemInstruction: string, modelId: string): string {
  return `【模型身份】本轮对话由模型 ${modelId} 作答。被问到你是什么模型时，如实回答 ${modelId}；画布状态中的“企划生成模型”是另一项功能使用的模型，不是你。\n\n${systemInstruction}`;
}
const CHAT_MODEL_ALIASES: Record<string, string> = { 'gpt-6': 'gpt-6-astra', 'gpt-5.6': 'gpt-5.6-sol' };
const CHAT_STREAM_TIMEOUT_MS = 90_000;

/** 所选模型令牌未开通时回落到默认对话模型（/v1/models 结果带缓存，探测失败则按原样请求） */
async function resolveAvailableChatModel(requested: string): Promise<string> {
  const model = CHAT_MODEL_ALIASES[requested] || requested;
  const available = await getTokenModelIds();
  if (!available || available.has(model)) return model;
  const fallback = available.has(DEFAULT_CHAT_MODEL) ? DEFAULT_CHAT_MODEL : model;
  if (fallback !== model) console.info(`[AgentConversationRoutes] Model ${model} not enabled for this token, using ${fallback}`);
  return fallback;
}

/** OpenAI 兼容的流式对话：逐行解析 SSE 的 delta.content，返回完整文本 */
async function streamChatCompletions(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: any }>;
  isClientClosed: () => boolean;
  onDelta: (chunk: string) => void;
}): Promise<string> {
  const base = String(params.baseUrl || '').replace(/\/+$/, '').replace(/\/(v1beta|v1)$/, '');
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: params.model, messages: params.messages, stream: true, temperature: 0.7, max_tokens: 2048 }),
    signal: AbortSignal.timeout(CHAT_STREAM_TIMEOUT_MS)
  });
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let lastData = '';
  while (true) {
    if (params.isClientClosed()) {
      await reader.cancel().catch(() => {});
      break;
    }
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      lastData = data;
      try {
        const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          text += delta;
          params.onDelta(delta);
        }
      } catch {
        // 半行或非 JSON 心跳，忽略
      }
    }
  }
  if (!text) {
    console.warn(`[AgentConversationRoutes] Empty chat stream from ${params.model}; last chunk: ${(lastData || buffer).slice(0, 400)}`);
  }
  return text;
}

/**
 * Universal Multi-Transport Agent Model Streamer with Self-Healing Fallback
 */
/** 判断用户是不是在问画布上的视频效果（评价、找问题），是则抽帧给模型看 */
const VIDEO_WORDS = '视频|成片|片子|镜头|运镜|分镜|短片';
const VIDEO_REVIEW_VERBS = '怎么样|如何|评价|看看|看下|看一下|好不好|问题|分析|点评|哪里|变形|效果|满意|觉得|改进|优化|检查|核对|对比|比对|匹配|符合|是否|有没有|对不对|一致|达到|预期|差异|偏差|修改|调整|重做|不对|不像|走样|穿帮';
export const VIDEO_REVIEW_INTENT = new RegExp(
  `(${VIDEO_WORDS}|画面).{0,16}(${VIDEO_REVIEW_VERBS})|(${VIDEO_REVIEW_VERBS}).{0,16}(${VIDEO_WORDS})`,
  'i'
);
/** 用户明确说要看“两段/全部/每段”视频时，不只看最新一条 */
export const VIDEO_REVIEW_ALL = /两(段|条|个)|全部|所有|每(段|条|个)|各(段|条)|都/;

interface UserAttachment {
  text: string;
  images: string[];
}

/** 用户随消息附带的图片：只接受本项目存储（Supabase 公开桶）或本服务画布资产地址，最多 4 张；
 *  服务端会去下载这些图，不能放任意地址，防止被用来探测内网 */
function sanitizeImageAttachments(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  let storageHost = '';
  try {
    storageHost = new URL(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').host;
  } catch {}
  const allowed = (u: string) => {
    if (u.startsWith('/api/canvases/assets/') && !u.includes('..')) return true;
    try {
      const parsed = new URL(u);
      return parsed.protocol === 'https:' && Boolean(storageHost) && parsed.host === storageHost
        && parsed.pathname.startsWith('/storage/v1/object/public/');
    } catch {
      return false;
    }
  };
  return raw
    .filter((u): u is string => typeof u === 'string')
    .map(u => u.trim())
    .filter(u => u.length <= 2000 && allowed(u))
    .slice(0, 4);
}

async function buildImageAttachment(urls: string[]): Promise<UserAttachment | undefined> {
  if (urls.length === 0) return undefined;
  const images: string[] = [];
  for (const url of urls) {
    try {
      images.push(await VideoSourceImageResolver.toVisionDataUrl(url));
    } catch (err: any) {
      console.warn('[AgentConversationRoutes] attachment image unreadable:', err?.message || err);
    }
  }
  const list = urls.map((u, i) => `图${i + 1}: ${u}`).join('\n');
  return {
    text: images.length > 0
      ? `【附：用户随消息上传的图片 ${images.length} 张，已附在本条消息里，请结合图片回答】
${list}`
      : `【附：用户上传了 ${urls.length} 张图片，但读取失败，请如实告知看不到图片】`,
    images
  };
}

function mergeAttachments(...parts: (UserAttachment | undefined)[]): UserAttachment | undefined {
  const present = parts.filter((p): p is UserAttachment => Boolean(p));
  if (present.length === 0) return undefined;
  return { text: present.map(p => p.text).join('\n\n'), images: present.flatMap(p => p.images) };
}

/** 画布上没有视频节点（视频只存在于视频创作面板的任务里）时，按画布取已出片的任务，最新在前 */
function videoRefsFromJobs(canvasId: string | undefined): NonNullable<AgentContextSnapshot['videoNodes']> {
  if (!canvasId) return [];
  try {
    return VideoJobService.getInstance()
      .listJobsByCanvas(canvasId)
      .filter(j => j.status === 'ready' && ((j as any).videoUrl || (j as any).supabaseVideoUrl || j.assetVersionId))
      .slice(0, 5)
      .map(j => ({
        nodeId: j.id,
        jobId: j.id,
        title: j.shotId ? `${j.shotId} 视频` : '视频',
        videoUrl: (j as any).videoUrl || (j as any).supabaseVideoUrl || undefined,
        assetVersionId: j.assetVersionId || undefined,
        prompt: typeof j.prompt === 'string' ? j.prompt.slice(0, 600) : undefined,
        modelKey: j.modelKey,
        durationSeconds: j.videoSettings?.durationSeconds,
        resolution: j.videoSettings?.resolution
      })) as any;
  } catch {
    return [];
  }
}

async function buildVideoReviewAttachment(message: string, snapshot: AgentContextSnapshot | undefined, canvasId?: string): Promise<UserAttachment | undefined> {
  let videos = Array.isArray(snapshot?.videoNodes) ? snapshot!.videoNodes!.slice(0, 5) : [];
  if (videos.length === 0 && VIDEO_REVIEW_INTENT.test(message)) videos = videoRefsFromJobs(canvasId);
  if (videos.length === 0) return undefined;
  const selected = snapshot?.selectedNodeIds || [];
  // 选中/引用的可能是生成节点或成果节点，按节点 id 或任务 id 匹配
  const pointed = videos.find(v => selected.includes(v.nodeId) || (v.jobId && selected.some(id => id.includes(v.jobId!))));
  if (!pointed && !VIDEO_REVIEW_INTENT.test(message)) return undefined;
  const ready = videos.filter(v => v.videoUrl || v.assetVersionId);
  // 优先用户 @ 引用或选中的视频；说“两段/全部”时看最新两条；否则取最新一条已生成的视频
  const targets = pointed
    ? [pointed]
    : VIDEO_REVIEW_ALL.test(message)
    ? ready.slice(0, 2)
    : ready.slice(0, 1);
  if (targets.length === 0) return undefined;

  const s = (v: unknown, max = 600) => String(v ?? '').slice(0, max);
  const framesPerVideo = targets.length > 1 ? 4 : 5;
  const blocks: string[] = [];
  const images: string[] = [];

  for (const [index, target] of targets.entries()) {
    const info = [
      `视频节点 ${s(target.nodeId, 80)}「${s(target.title || '视频', 60)}」`,
      target.modelKey ? `生成模型 ${s(target.modelKey, 60)}` : '',
      target.durationSeconds ? `时长 ${Number(target.durationSeconds)} 秒` : '',
      target.resolution ? `分辨率 ${s(target.resolution, 20)}` : '',
      target.prompt ? `生成提示词：${s(target.prompt)}` : ''
    ].filter(Boolean).join('；');
    const tag = targets.length > 1 ? `视频${index + 1}` : '该视频';
    try {
      const startedAt = Date.now();
      const sample = await sampleVideoFrames({ videoUrl: target.videoUrl, assetVersionId: target.assetVersionId }, framesPerVideo);
      console.log(`[AgentConversationRoutes] sampled ${sample.frames.length} frames from ${target.nodeId} in ${Date.now() - startedAt}ms`);
      const frameList = sample.frames.map((f, i) => `第${i + 1}张=${f.label}（${f.atSeconds}s）`).join('，');
      blocks.push(`【${tag}】${info}。实际时长 ${sample.durationSeconds} 秒。接下来附图里有 ${sample.frames.length} 张是它按时间顺序抽的帧：${frameList}。`);
      images.push(...sample.frames.map(f => f.dataUrl));
    } catch (err: any) {
      console.warn(`[AgentConversationRoutes] video frame sampling failed for ${target.nodeId}:`, err?.message || err);
      blocks.push(`【${tag}】${info}。（读取视频画面失败：${s(err?.message, 120)}，这一条没有画面，请向用户说明没看到它的实际画面。）`);
    }
  }

  const guide =
    '请依据画面如实核对：1) 与对话里商定的视频创意/分镜（运镜顺序、展示重点、氛围光线、节奏）逐条对照，说明哪些做到了、哪些没做到；' +
    '2) 产品造型、颜色、材质前后是否一致，有无变形、穿帮；3) 指出具体是哪一段/哪一帧的问题；看不出的细节不要编造。' +
    '有偏差时，在回复末尾给出 open_video 的 plan 动作块：videoBrief 写明“保留什么、要修正什么”，必要时用 videoShots 重写有问题的镜头，让用户确认后重新生成；没有明显偏差就不要给 plan。';
  return {
    text: [`【附：画布视频画面（共 ${targets.length} 段，已附 ${images.length} 张抽帧）】`, ...blocks, guide].join('\n'),
    images
  };
}

async function invokeAgentModelStream(params: {
  userId: string;
  model: string;
  historyMessages: AgentChatMessageRecord[];
  userPrompt: string;
  /** 附加给本轮用户消息的文字与图片（如视频抽帧）；仅 chat/completions 通道带图片 */
  userAttachment?: UserAttachment;
  systemInstruction: string;
  contextSnapshot?: AgentContextSnapshot;
  isClientClosed: () => boolean;
  onDelta: (chunk: string) => void;
}): Promise<{
  accumulatedText: string;
  providerResponseId: string | null;
  streamFailed: boolean;
  errorCode: AgentErrorCode;
  usedModel: string | null;
}> {
  const {
    userId,
    model: rawModel,
    historyMessages,
    userPrompt,
    userAttachment,
    systemInstruction,
    contextSnapshot,
    isClientClosed,
    onDelta
  } = params;

  let accumulatedText = '';
  let providerResponseId: string | null = null;
  let streamFailed = false;
  let errorCode: AgentErrorCode = 'UNKNOWN_AGENT_ERROR';
  let usedModel: string | null = null;

  const requestedModel = rawModel || DEFAULT_AGENT_MODEL;
  const isGptModel = /^(gpt-|openai\/|chatgpt)/i.test(requestedModel);

  // 1. Resolve configured API provider
  let aiClient: any = null;
  let apiConfig: any = null;
  let isValidKey = false;

  try {
    const genAiResult = await createServerGenAI(userId);
    aiClient = genAiResult.ai;
    apiConfig = genAiResult.config;
    isValidKey = genAiResult.isValidKey;
  } catch (initErr: any) {
    console.warn('[AgentConversationRoutes] ServerGenAI resolution warning:', initErr.message);
  }

  let executedSuccessfully = false;

  // A0. OpenAI 兼容 /v1/chat/completions 流式（tiantoken 等网关的主通道，gemini / gpt 均可）。
  //     令牌未开通所选模型时换用已开通的对话模型，避免上游静默返回空内容。
  if (isValidKey && apiConfig?.apiKey) {
    try {
      const chatModel = await resolveAvailableChatModel(requestedModel);
      const turns = historyMessages
        // 本地兜底模板的回复不是模型说的话，带进上下文会误导模型
        .filter(m => (m.role === 'user' || m.role === 'assistant') && !String(m.provider_response_id || '').startsWith('agent_g_local_'))
        .map(m => ({
          role: m.role as string,
          content: typeof m.content === 'object' && m.content.text ? m.content.text : String(m.content || '')
        }))
        .filter(m => m.content.trim().length > 0)
        .slice(-20);
      // 对话必须以本轮用户提问结尾，否则 Gemini 会返回 0 token
      const last = turns[turns.length - 1];
      if (!last || last.role !== 'user' || last.content.trim() !== userPrompt.trim()) {
        turns.push({ role: 'user', content: userPrompt });
      }
      const messages: Array<{ role: string; content: any }> = [{ role: 'system', content: withModelIdentity(systemInstruction, chatModel) }, ...turns];
      if (userAttachment) {
        // 附加内容（如视频抽帧）只挂在本轮用户消息上：文字说明 + 图片
        const lastTurn = messages[messages.length - 1];
        lastTurn.content = [
          { type: 'text', text: `${lastTurn.content}

${userAttachment.text}` },
          ...userAttachment.images.map(url => ({ type: 'image_url', image_url: { url } }))
        ];
      }
      const streamStartedAt = Date.now();
      let firstTokenMs = 0;
      const text = await streamChatCompletions({
        baseUrl: apiConfig.baseUrl,
        apiKey: apiConfig.apiKey,
        model: chatModel,
        messages,
        isClientClosed,
        onDelta: chunk => {
          if (!firstTokenMs) firstTokenMs = Date.now() - streamStartedAt;
          accumulatedText += chunk;
          onDelta(chunk);
        }
      });
      const promptChars = messages.reduce(
        (n, m) => n + (typeof m.content === 'string' ? m.content.length : (m.content as any[]).reduce((k, p) => k + (p.text?.length || 0), 0)),
        0
      );
      console.log(
        `[AgentConversationRoutes] ${chatModel} first token ${firstTokenMs}ms, total ${Date.now() - streamStartedAt}ms, prompt ${promptChars} chars, images ${userAttachment?.images.length || 0}, reply ${text.length} chars`
      );
      if (text.trim().length > 0) {
        providerResponseId = `chatcmpl_${Date.now()}`;
        usedModel = chatModel;
        executedSuccessfully = true;
      } else {
        console.warn(`[AgentConversationRoutes] chat/completions (${chatModel}) returned empty content, trying other transports`);
      }
    } catch (chatErr: any) {
      console.warn('[AgentConversationRoutes] chat/completions transport error, trying other transports:', chatErr?.message);
    }
  }

  // A. OpenAI 系模型的备用通道：仅在 A0 流式通道没有成功时才调用（否则会在流式回复结束后
  //    再非流式重答一遍并重复推送，GPT 模型的回复时间翻倍、内容重复）
  if (!executedSuccessfully && isGptModel && isValidKey && apiConfig) {
    try {
      const responsesModel = requestedModel === 'gpt-6' ? 'gpt-6-astra' : requestedModel;
      const response = await createAgentResponse(apiConfig, {
        model: responsesModel,
        input: userAttachment ? `${userPrompt}

${userAttachment.text}` : userPrompt,
        instructions: withModelIdentity(systemInstruction, responsesModel),
        reasoningEffort: 'medium',
        maxOutputTokens: 2048
      });
      if (response && response.outputText) {
        accumulatedText = response.outputText;
        providerResponseId = response.id || `resp_${Date.now()}`;
        usedModel = responsesModel;
        const chunks = accumulatedText.match(/.{1,12}/g) || [accumulatedText];
        for (const c of chunks) {
          if (isClientClosed()) break;
          onDelta(c);
          await new Promise(r => setTimeout(r, 12));
        }
        executedSuccessfully = true;
      }
    } catch (openAiErr: any) {
      console.warn(`[AgentConversationRoutes] OpenAI transport call (${requestedModel}) error, falling back to Gemini:`, openAiErr.message);
    }
  }

  // B. Google Gemini Native Stream Transport
  if (!executedSuccessfully && isValidKey && aiClient) {
    try {
      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
      for (const m of historyMessages) {
        if (m.role === 'user' || m.role === 'assistant') {
          contents.push({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: typeof m.content === 'object' && m.content.text ? m.content.text : String(m.content) }]
          });
        }
      }

      // GPT 通道不可用时回落到 Gemini 3.7 Flash（网关已不提供 2.5）
      const geminiModel = isGptModel ? 'gemini-3.6-flash' : requestedModel;

      const responseStream = await aiClient.models.generateContentStream({
        model: geminiModel,
        contents,
        config: {
          systemInstruction: withModelIdentity(systemInstruction, geminiModel),
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      });

      for await (const chunk of responseStream) {
        if (isClientClosed()) break;
        providerResponseId = (chunk as any).responseId || providerResponseId;
        const textChunk = typeof (chunk as any).text === 'function'
          ? (chunk as any).text()
          : (typeof (chunk as any).text === 'string' ? (chunk as any).text : '');
        if (textChunk) {
          accumulatedText += textChunk;
          onDelta(textChunk);
        }
      }
      // 空流不算成功，交给后续兜底，避免把空回复记为“已完成”
      executedSuccessfully = accumulatedText.length > 0;
      if (executedSuccessfully) usedModel = geminiModel;
    } catch (geminiErr: any) {
      console.warn(`[AgentConversationRoutes] Gemini native transport error:`, geminiErr.message);
      const msgLower = (geminiErr?.message || '').toLowerCase();
      if (msgLower.includes('rate limit') || msgLower.includes('429')) {
        errorCode = 'PROVIDER_RATE_LIMIT';
      } else if (msgLower.includes('timeout')) {
        errorCode = 'PROVIDER_TIMEOUT';
      } else if (msgLower.includes('auth') || msgLower.includes('key')) {
        errorCode = 'PROVIDER_AUTH_ERROR';
      } else {
        errorCode = 'PROVIDER_PROTOCOL_ERROR';
      }
    }
  }

  // C. Fallback to Agent G Internal Heuristic Engine if external services are unconfigured or unavailable
  if (!executedSuccessfully) {
    if (!isValidKey || !aiClient || accumulatedText.length === 0) {
      console.info(`[AgentConversationRoutes] External provider unavailable or returned empty, activating Agent G heuristic response stream...`);
      const mockText = generateMockAgentResponse(userPrompt, contextSnapshot);
      const chunks = mockText.match(/.{1,10}/g) || [mockText];
      for (const chunk of chunks) {
        if (isClientClosed()) break;
        accumulatedText += chunk;
        onDelta(chunk);
        await new Promise(r => setTimeout(r, 15));
      }
      providerResponseId = `agent_g_local_${crypto.randomBytes(6).toString('hex')}`;
      usedModel = LOCAL_TEMPLATE_MODEL;
      executedSuccessfully = true;
      streamFailed = false;
    } else {
      streamFailed = true;
    }
  }

  return {
    accumulatedText,
    providerResponseId,
    streamFailed,
    errorCode,
    usedModel
  };
}

/**
 * 4. POST /api/agent/conversations/:conversationId/messages - Stream Message Response
 */
router.post('/conversations/:conversationId/messages', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const conversationId = String(req.params.conversationId || '');
  const { message, context_snapshot, model: requestModel } = req.body;
  const attachmentUrls = sanitizeImageAttachments(req.body?.attachments);

  let conv = await getConversationById(conversationId);
  if (!conv) {
    console.warn(`[AgentConversation] Conversation ${conversationId} not found, auto-healing new conversation for user ${userId}...`);
    const newConvId = isValidUuid(conversationId) ? conversationId : crypto.randomUUID();
    const now = new Date().toISOString();
    conv = {
      id: newConvId,
      user_id: userId,
      project_id: context_snapshot?.projectId || 'default_project',
      canvas_id: context_snapshot?.canvasId || 'default_canvas',
      title: `视觉企划对话 - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      status: 'active',
      provider: String(process.env.AGENT_TEXT_PROVIDER || 'gemini'),
      model: String(requestModel || process.env.AGENT_TEXT_MODEL || DEFAULT_AGENT_MODEL),
      created_at: now,
      updated_at: now
    };
    try {
      await saveConversationRecord(conv);
    } catch (err) {
      console.warn('[AgentConversation] Auto-heal conversation write warning:', err);
    }
  } else if (requestModel && conv.model !== requestModel) {
    conv.model = requestModel;
    saveConversationRecord(conv).catch(e => console.warn('[AgentConversation] Update conv model warning:', e));
  }

  if (conv.user_id !== userId && conv.user_id !== 'default_user') {
    return res.status(403).json({
      success: false,
      error: { message: 'Forbidden access to conversation', code: 'CONVERSATION_FORBIDDEN' }
    });
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({
      success: false,
      error: { message: 'Message content cannot be empty', code: 'INVALID_AGENT_CONTEXT' }
    });
  }

  if (message.length > 10000) {
    return res.status(400).json({
      success: false,
      error: { message: 'Message content exceeds max allowed length of 10000 characters', code: 'MESSAGE_TOO_LONG' }
    });
  }

  const snapshotForCheck = context_snapshot && await placeholderAcceptsContext(conv, context_snapshot)
    ? { ...context_snapshot, projectId: conv.project_id, canvasId: conv.canvas_id }
    : context_snapshot;
  const ctxCheck = await validateContextSnapshot(snapshotForCheck, conv);
  if (!ctxCheck.valid) {
    return res.status(400).json({
      success: false,
      error: { message: ctxCheck.reason || 'Invalid context snapshot', code: 'INVALID_AGENT_CONTEXT' }
    });
  }

  // Save User Message
  const userMessageId = crypto.randomUUID();
  const now = new Date().toISOString();
  const userMsgRecord: AgentChatMessageRecord = {
    id: userMessageId,
    conversation_id: conversationId,
    user_id: userId,
    role: 'user',
    content: { text: message.trim(), ...(attachmentUrls.length > 0 ? { images: attachmentUrls } : {}) },
    status: 'completed',
    context_snapshot: context_snapshot || null,
    created_at: now,
    updated_at: now
  };

  try {
    await saveMessageRecord(userMsgRecord);
    // 默认标题只有时间，难以区分：第一条消息发出后用它的开头作为会话标题
    if (!conv.title || /^视觉企划对话 - \d{1,2}:\d{2}$/.test(conv.title) || conv.title === '全新企划对话') {
      const firstLine = message.trim().replace(/\s+/g, ' ').slice(0, 24);
      if (firstLine) {
        conv.title = firstLine;
        saveConversationRecord(conv).catch(() => {});
      }
    }
  } catch {
    return res.status(500).json({
      success: false,
      error: { message: 'User message could not be persisted', code: 'MESSAGE_PERSISTENCE_ERROR' }
    });
  }

  const assistantMessageId = crypto.randomUUID();
  let accumulatedText = '';
  let isClientClosed = false;
  const assistantCreatedAt = new Date().toISOString();

  res.on('close', () => {
    if (!res.writableEnded) isClientClosed = true;
  });

  const sendEvent = (eventType: string, payload: any) => {
    if (!isClientClosed && !res.writableEnded) {
      res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`);
    }
  };

  try {
    await saveMessageRecord({
    id: assistantMessageId,
    conversation_id: conversationId,
    user_id: userId,
    role: 'assistant',
    content: { text: '' },
    status: 'streaming',
    provider_response_id: null,
    parent_message_id: userMessageId,
    context_snapshot: context_snapshot || null,
    error_code: null,
    created_at: assistantCreatedAt,
    updated_at: assistantCreatedAt
    });
  } catch {
    return res.status(500).json({
      success: false,
      error: { message: 'Assistant streaming state could not be persisted', code: 'MESSAGE_PERSISTENCE_ERROR' }
    });
  }

  // Set SSE headers only after both message facts have been durably created.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Emit initial keep-alive comment and start a 5-second heartbeat interval
  res.write(': keep-alive ping\n\n');
  const heartbeatInterval = setInterval(() => {
    if (!res.writableEnded && !isClientClosed) {
      res.write(': heartbeat\n\n');
    }
  }, 5000);

  // Emit only the documented white-list events.
  sendEvent('conversation.created', { conversationId: conv.id, title: conv.title });
  sendEvent('message.user.saved', { message: userMsgRecord });
  sendEvent('response.started', { messageId: assistantMessageId, conversationId });

  const systemInstruction = buildAgentSystemInstruction(context_snapshot);
  let streamFailed = false;
  let errorCode: AgentErrorCode = 'UNKNOWN_AGENT_ERROR';
  let providerResponseId: string | null = null;
  let answeredModel: string | null = null;
  let localCardData: any = null;

  // Agent G Tool Dispatch: Check if message requests local asset inspection
  const trimmedMsg = message.trim();
  const isLocalAssetIntent = /(本地|电脑|硬盘|文件夹).*(找|搜|查|素材|图|资料|pdf|2650)/i.test(trimmedMsg) ||
    /^(找|搜|查|查找|搜索)\s*(2650|沙发|主图|面料|皮纹|logo|pdf)/i.test(trimmedMsg);

  if (isLocalAssetIntent && bridgeRelayHub.isUserDeviceOnline(userId)) {
    try {
      let kw = trimmedMsg.replace(/(查找|搜索|请帮我找|帮我找|找一下|找|搜|本地|电脑里的|素材|资料|图片|文件)/gi, '').trim();
      if (!kw) kw = '2650';

      const results = await bridgeRelayHub.callUserDevice(userId, 'search_local_assets', { query: kw, category: 'all', limit: 8 }, 5000);
      localCardData = {
        query: kw,
        matchedCount: Array.isArray(results) ? results.length : 0,
        assets: Array.isArray(results) ? results : []
      };

      sendEvent('tool.execution', {
        tool: 'search_local_assets',
        status: 'completed',
        data: localCardData
      });
    } catch (e: any) {
      console.warn('[AgentConversation] Bridge search failed:', e);
    }
  }

  if (isAgentChatTestMode()) {
    incrementAgentMetric('mockTextProviderCalls');
    const scenario = getAgentTestScenario(req);
    if (scenario === 'timeout') {
      streamFailed = true;
      errorCode = 'PROVIDER_TIMEOUT';
    } else {
      const mockResponseText = generateMockAgentResponse(message, context_snapshot);
      const chunks = mockResponseText.match(/.{1,8}/g) || [mockResponseText];
      for (const chunk of chunks) {
        if (isClientClosed) break;
        accumulatedText += chunk;
        sendEvent('response.delta', {
          type: 'response.delta', conversationId, messageId: assistantMessageId, delta: chunk
        });
        await new Promise(resolve => setTimeout(resolve, scenario === 'slow' ? 80 : 5));
      }
      providerResponseId = `mock_${crypto.randomBytes(8).toString('hex')}`;
    }
  } else {
    incrementAgentMetric('textProviderCalls');
    const history = await getMessagesByConversation(conversationId);
    const userAttachment = mergeAttachments(
      await buildImageAttachment(attachmentUrls),
      await buildVideoReviewAttachment(trimmedMsg, context_snapshot, conv.canvas_id)
    );
    const result = await invokeAgentModelStream({
      userId,
      model: conv.model,
      historyMessages: history,
      userPrompt: message,
      userAttachment,
      systemInstruction,
      contextSnapshot: context_snapshot || undefined,
      isClientClosed: () => isClientClosed || res.writableEnded,
      onDelta: (chunk: string) => {
        sendEvent('response.delta', {
          type: 'response.delta',
          conversationId,
          messageId: assistantMessageId,
          delta: chunk
        });
      }
    });

    accumulatedText = result.accumulatedText;
    providerResponseId = result.providerResponseId;
    streamFailed = result.streamFailed;
    errorCode = result.errorCode;
    answeredModel = result.usedModel;
  }

  const assistantMsgRecord: AgentChatMessageRecord = {
    id: assistantMessageId,
    conversation_id: conversationId,
    user_id: userId,
    role: 'assistant',
    content: {
      text: accumulatedText,
      localAssetCard: localCardData || undefined,
      // 实际作答模型（可能因不可用而与会话所选模型不同），界面据此标注
      model: answeredModel || undefined,
      requestedModel: conv.model
    },
    status: isClientClosed ? 'failed' : streamFailed ? 'failed' : 'completed',
    provider_response_id: providerResponseId,
    parent_message_id: userMessageId,
    context_snapshot: context_snapshot || null,
    error_code: isClientClosed ? 'STREAM_INTERRUPTED' : streamFailed ? errorCode : null,
    created_at: assistantCreatedAt,
    updated_at: new Date().toISOString()
  };

  try {
    await saveMessageRecord(assistantMsgRecord);
  } catch (msgErr: any) {
    console.warn('[AgentConversationRoutes] Assistant message persistence warning:', msgErr.message);
  }

  // Update conversation timestamp (non-blocking resilient update)
  conv.updated_at = new Date().toISOString();
  if (providerResponseId) conv.previous_response_id = providerResponseId;
  try {
    await saveConversationRecord(conv);
  } catch (convErr: any) {
    console.warn('[AgentConversationRoutes] Non-blocking conversation metadata update warning:', convErr.message);
  }

  if (streamFailed) {
    sendEvent('response.failed', {
      type: 'response.failed',
      conversationId,
      messageId: assistantMessageId,
      error_code: errorCode,
      message: 'Agent model invocation failed'
    });
  } else if (!isClientClosed) {
    sendEvent('response.completed', {
      type: 'response.completed',
      conversationId,
      message: assistantMsgRecord
    });
  }

  clearInterval(heartbeatInterval);
  if (!res.writableEnded) {
    res.end();
  }
});

/**
 * 5. POST /api/agent/conversations/:conversationId/retry - Retry last failed message
 */
router.post('/conversations/:conversationId/retry', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const conversationId = String(req.params.conversationId || '');

  const conv = await getConversationById(conversationId);
  if (!conv) {
    return res.status(404).json({
      success: false,
      error: { message: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' }
    });
  }

  if (conv.user_id !== userId && conv.user_id !== 'default_user') {
    return res.status(403).json({
      success: false,
      error: { message: 'Forbidden access to conversation', code: 'CONVERSATION_FORBIDDEN' }
    });
  }

  const messages = await getMessagesByConversation(conversationId);
  if (messages.length === 0) {
    return res.status(400).json({
      success: false,
      error: { message: 'No messages to retry', code: 'INVALID_AGENT_CONTEXT' }
    });
  }

  const lastMsg = messages[messages.length - 1];
  if (lastMsg.role !== 'assistant' || lastMsg.status !== 'failed' || !lastMsg.parent_message_id) {
    return res.status(400).json({
      success: false,
      error: { message: 'Only the latest failed assistant response can be retried', code: 'INVALID_AGENT_CONTEXT' }
    });
  }
  const lastUserMsg = messages.find(m => m.id === lastMsg.parent_message_id && m.role === 'user');
  if (!lastUserMsg) {
    return res.status(409).json({
      success: false,
      error: { message: 'Failed response has no valid parent user message', code: 'MESSAGE_PERSISTENCE_ERROR' }
    });
  }

  const assistantMessageId = crypto.randomUUID();
  let accumulatedText = '';
  let isClientClosed = false;
  let streamFailed = false;
  let errorCode: AgentErrorCode = 'UNKNOWN_AGENT_ERROR';
  let providerResponseId: string | null = null;
  let answeredModel: string | null = null;
  const assistantCreatedAt = new Date().toISOString();

  res.on('close', () => {
    if (!res.writableEnded) isClientClosed = true;
  });

  const sendEvent = (eventType: string, payload: any) => {
    if (!isClientClosed && !res.writableEnded) {
      res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`);
    }
  };

  try {
    await saveMessageRecord({
    id: assistantMessageId,
    conversation_id: conversationId,
    user_id: userId,
    role: 'assistant',
    content: { text: '' },
    status: 'streaming',
    provider_response_id: null,
    parent_message_id: lastUserMsg.id,
    context_snapshot: lastUserMsg.context_snapshot || null,
    error_code: null,
    created_at: assistantCreatedAt,
    updated_at: assistantCreatedAt
    });
  } catch {
    return res.status(500).json({
      success: false,
      error: { message: 'Retry state could not be persisted', code: 'MESSAGE_PERSISTENCE_ERROR' }
    });
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write(': keep-alive ping\n\n');

  const heartbeatInterval = setInterval(() => {
    if (!res.writableEnded && !isClientClosed) {
      res.write(': heartbeat\n\n');
    }
  }, 5000);

  sendEvent('response.started', { messageId: assistantMessageId, conversationId });

  if (isAgentChatTestMode()) {
    incrementAgentMetric('mockTextProviderCalls');
    const mockResponseText = generateMockAgentResponse(lastUserMsg.content.text, lastUserMsg.context_snapshot || undefined);
    const chunks = mockResponseText.match(/.{1,8}/g) || [mockResponseText];
    for (const chunk of chunks) {
      if (isClientClosed) break;
      accumulatedText += chunk;
      sendEvent('response.delta', { type: 'response.delta', conversationId, messageId: assistantMessageId, delta: chunk });
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    providerResponseId = `mock_${crypto.randomBytes(8).toString('hex')}`;
  } else {
    incrementAgentMetric('textProviderCalls');
    const result = await invokeAgentModelStream({
      userId,
      model: conv.model,
      historyMessages: messages.filter(m => (m.role === 'user' || m.role === 'assistant') && m.status === 'completed'),
      userPrompt: lastUserMsg.content.text,
      systemInstruction: buildAgentSystemInstruction(lastUserMsg.context_snapshot || undefined),
      contextSnapshot: lastUserMsg.context_snapshot || undefined,
      isClientClosed: () => isClientClosed || res.writableEnded,
      onDelta: (chunk: string) => {
        sendEvent('response.delta', {
          type: 'response.delta',
          conversationId,
          messageId: assistantMessageId,
          delta: chunk
        });
      }
    });

    accumulatedText = result.accumulatedText;
    providerResponseId = result.providerResponseId;
    streamFailed = result.streamFailed;
    errorCode = result.errorCode;
    answeredModel = result.usedModel;
  }

  const assistantMsgRecord: AgentChatMessageRecord = {
    id: assistantMessageId,
    conversation_id: conversationId,
    user_id: userId,
    role: 'assistant',
    content: { text: accumulatedText, model: answeredModel || undefined, requestedModel: conv.model },
    status: isClientClosed || streamFailed ? 'failed' : 'completed',
    provider_response_id: providerResponseId,
    parent_message_id: lastUserMsg.id,
    context_snapshot: lastUserMsg.context_snapshot || null,
    error_code: isClientClosed ? 'STREAM_INTERRUPTED' : streamFailed ? errorCode : null,
    created_at: assistantCreatedAt,
    updated_at: new Date().toISOString()
  };

  try {
    await saveMessageRecord(assistantMsgRecord);
  } catch (msgErr: any) {
    console.warn('[AgentConversationRoutes] Retry assistant message persistence warning:', msgErr.message);
  }

  conv.updated_at = new Date().toISOString();
  if (providerResponseId) conv.previous_response_id = providerResponseId;
  try {
    await saveConversationRecord(conv);
  } catch (convErr: any) {
    console.warn('[AgentConversationRoutes] Non-blocking retry conversation metadata update warning:', convErr.message);
  }

  if (streamFailed) {
    sendEvent('response.failed', {
      type: 'response.failed', conversationId, messageId: assistantMessageId,
      error_code: errorCode, message: 'Agent model invocation failed'
    });
  } else if (!isClientClosed) {
    sendEvent('response.completed', {
      type: 'response.completed',
      conversationId,
      message: assistantMsgRecord
    });
  }

  clearInterval(heartbeatInterval);
  if (!res.writableEnded) {
    res.end();
  }
});

/**
 * 6. PATCH /api/agent/conversations/:conversationId - Update title / status
 */
router.patch('/conversations/:conversationId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const conversationId = String(req.params.conversationId || '');
    const { title, status, projectId } = req.body;

    const conv = await getConversationById(conversationId);
    if (!conv) {
      return res.status(404).json({
        success: false,
        error: { message: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' }
      });
    }

    if (conv.user_id !== userId && conv.user_id !== 'default_user') {
      return res.status(403).json({
        success: false,
        error: { message: 'Forbidden access to conversation', code: 'CONVERSATION_FORBIDDEN' }
      });
    }

    // 画布从占位地址（/creative-canvas/new）跳到真实项目时，把当前会话一起带过去
    if (projectId !== undefined) {
      const target = String(projectId);
      if (!PLACEHOLDER_PROJECT_IDS.has(conv.project_id) || PLACEHOLDER_PROJECT_IDS.has(target)) {
        return res.status(400).json({
          success: false,
          error: { message: 'Only placeholder conversations can be moved to a project', code: 'INVALID_AGENT_CONTEXT' }
        });
      }
      if (!(await assertCanvasOwnership(conv.user_id, target, `canvas_${target}`))) {
        return res.status(403).json({
          success: false,
          error: { message: 'Project or canvas does not belong to the authenticated user', code: 'INVALID_AGENT_CONTEXT' }
        });
      }
      conv.project_id = target;
      conv.canvas_id = `canvas_${target}`;
    }
    if (title !== undefined) conv.title = String(title);
    if (status !== undefined && (status === 'active' || status === 'archived')) {
      conv.status = status;
    }
    conv.updated_at = new Date().toISOString();

    await saveConversationRecord(conv);

    return res.json({
      success: true,
      conversation: conv
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: err?.message || 'Failed to update conversation', code: 'UNKNOWN_AGENT_ERROR' }
    });
  }
});

/**
 * DELETE /api/agent/conversations/:conversationId
 * 删除会话及其全部消息（只能删自己的）
 */
router.delete('/conversations/:conversationId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const conversationId = String(req.params.conversationId || '');
    const conv = await getConversationById(conversationId);
    if (!conv) {
      return res.status(404).json({ success: false, error: { message: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' } });
    }
    if (conv.user_id !== userId && conv.user_id !== 'default_user') {
      return res.status(403).json({ success: false, error: { message: 'Forbidden access to conversation', code: 'CONVERSATION_FORBIDDEN' } });
    }
    if (!isAgentChatTestMode() && isValidUuid(conversationId)) {
      const { error: msgErr } = await supabaseAdmin.from('agent_messages').delete().eq('conversation_id', conversationId);
      if (msgErr) throw new Error(msgErr.message);
      const { error: convErr } = await supabaseAdmin.from('agent_conversations').delete().eq('id', conversationId);
      if (convErr) throw new Error(convErr.message);
    }
    // 本地兜底存储里的副本一并清掉
    writeLocalMessages(readLocalMessages().filter(m => m.conversation_id !== conversationId));
    writeLocalConversations(readLocalConversations().filter(c => c.id !== conversationId));
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { message: err?.message || 'Failed to delete conversation', code: 'UNKNOWN_AGENT_ERROR' } });
  }
});

/**
 * Generate friendly read-only agent response helper
 */
function generateMockAgentResponse(userPrompt: string, ctx?: AgentContextSnapshot): string {
  const sceneStr = ctx?.activeSceneKey ? `【当前活动场景: ${ctx.activeSceneKey}】` : '';
  const dnaStr = ctx?.productDnaVersionId ? `，绑定 DNA 版本 ${ctx.productDnaVersionId}` : '';
  const copyStr = ctx?.copyVersionId ? `，文案版本 ${ctx.copyVersionId}` : '';

  return `您好！我是家具视觉生产工作流智能体 Agent G。${sceneStr}${dnaStr}${copyStr}

针对您提出的：“${userPrompt}”，我的专业企划与视觉分析建议如下：

1. **场景核心卖点定位**：建议突显真皮材质触感与轻奢空间氛围，利用 3:4 画幅展示全景并预留文字承载区域。
2. **Copy 与 Typography 排版契约**：当前槽位限制符合最佳读码率，建议 Headline 保持在 12 字以内。
3. **后续建议**：您可以随时在左侧画布上切换场景视角，或调整文案槽位约束。

如需进一步澄清视觉需求，请随时与我交流！`;
}

/**
 * POST /api/agent/conversations/:conversationId/notes
 * 由界面写入的助手侧通知（如视频生成完成回传的成片卡片），不调用模型，只落库以便刷新后仍在对话里。
 */
router.post('/conversations/:conversationId/notes', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const conversationId = String(req.params.conversationId || '');
  const { text, videoCard, imageCard } = req.body || {};
  const conv = await getConversationById(conversationId);
  if (!conv) {
    return res.status(404).json({ success: false, error: { message: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' } });
  }
  if (conv.user_id !== userId && conv.user_id !== 'default_user') {
    return res.status(403).json({ success: false, error: { message: 'Forbidden access to conversation', code: 'CONVERSATION_FORBIDDEN' } });
  }
  if (typeof text !== 'string' || !text.trim() || text.length > 2000) {
    return res.status(400).json({ success: false, error: { message: 'Invalid note text', code: 'INVALID_AGENT_CONTEXT' } });
  }
  let card: Record<string, unknown> | undefined;
  if (videoCard && typeof videoCard === 'object') {
    const url = String(videoCard.videoUrl || '');
    if (!/^https?:\/\//.test(url) && !url.startsWith('/api/')) {
      return res.status(400).json({ success: false, error: { message: 'Invalid video url', code: 'INVALID_AGENT_CONTEXT' } });
    }
    const pick = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : undefined);
    card = {
      jobId: pick(videoCard.jobId, 120),
      videoUrl: url.slice(0, 2000),
      title: pick(videoCard.title, 120),
      posterUrl: pick(videoCard.posterUrl, 2000),
      modelKey: pick(videoCard.modelKey, 120),
      resolution: pick(videoCard.resolution, 20),
      nodeId: pick(videoCard.nodeId, 200),
      durationSeconds: typeof videoCard.durationSeconds === 'number' ? videoCard.durationSeconds : undefined
    };
  }
  let image: Record<string, unknown> | undefined;
  if (imageCard && typeof imageCard === 'object') {
    const url = String(imageCard.imageUrl || '');
    if (!/^https?:\/\//.test(url) && !url.startsWith('/api/')) {
      return res.status(400).json({ success: false, error: { message: 'Invalid image url', code: 'INVALID_AGENT_CONTEXT' } });
    }
    const pickStr = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : undefined);
    image = {
      imageUrl: url.slice(0, 2000),
      title: pickStr(imageCard.title, 120),
      nodeId: pickStr(imageCard.nodeId, 200),
      sceneIndex: typeof imageCard.sceneIndex === 'number' ? imageCard.sceneIndex : undefined,
      withText: typeof imageCard.withText === 'boolean' ? imageCard.withText : undefined,
      source: ['clean', 'poster', 'text_edit', 'instruction_edit'].includes(imageCard.source) ? imageCard.source : undefined,
      detail: pickStr(imageCard.detail, 300)
    };
  }
  const now = new Date().toISOString();
  const record: AgentChatMessageRecord = {
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    user_id: userId,
    role: 'assistant',
    content: { text: text.trim(), kind: 'note', ...(card ? { videoCard: card } : {}), ...(image ? { imageCard: image } : {}) },
    status: 'completed',
    created_at: now,
    updated_at: now
  };
  await saveMessageRecord(record);
  conv.updated_at = now;
  await saveConversationRecord(conv);
  return res.status(201).json({ success: true, message: record });
});

export default router;
