import { ApiProviderConfig } from './providerConfig';

export type AgentReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type AgentResponseStatus =
  | 'completed'
  | 'incomplete'
  | 'failed'
  | 'in_progress'
  | 'queued'
  | 'cancelled';

export interface ResponsesJsonSchema {
  name: string;
  schema: Record<string, unknown>;
  description?: string;
}

export interface AgentResponsesPayloadInput {
  model: string;
  input: string;
  instructions: string;
  reasoningEffort: AgentReasoningEffort;
  previousResponseId?: string;
  maxOutputTokens?: number;
  schema?: ResponsesJsonSchema;
  metadata?: Record<string, string>;
}

export interface NormalizedAgentResponse {
  id: string;
  model: string;
  status: AgentResponseStatus;
  outputText: string;
  refusal?: string;
  incompleteReason?: 'max_output_tokens' | 'content_filter' | string;
  usage?: Record<string, unknown> | null;
  raw: Record<string, any>;
}

export class AgentResponsesError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly retryable: boolean,
    public readonly upstreamRequestId?: string
  ) {
    super(message);
    this.name = 'AgentResponsesError';
  }
}

const RESPONSE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const ALLOWED_EFFORTS = new Set<AgentReasoningEffort>([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh'
]);

export function parseAgentReasoningEffort(value: unknown): AgentReasoningEffort {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : 'medium';
  if (!ALLOWED_EFFORTS.has(normalized as AgentReasoningEffort)) {
    throw new AgentResponsesError(
      'reasoningEffort 必须为 none、minimal、low、medium、high 或 xhigh。',
      'INVALID_REASONING_EFFORT',
      400,
      false
    );
  }
  return normalized as AgentReasoningEffort;
}

export function assertSafeAgentModel(value: unknown, fallback = 'gpt-5.6-sol'): string {
  const model = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  if (!MODEL_ID_PATTERN.test(model)) {
    throw new AgentResponsesError('Agent 模型 ID 格式无效。', 'INVALID_MODEL_ID', 400, false);
  }
  return model;
}

export function assertSafePreviousResponseId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !RESPONSE_ID_PATTERN.test(value)) {
    throw new AgentResponsesError(
      'previousResponseId 格式无效。',
      'INVALID_PREVIOUS_RESPONSE_ID',
      400,
      false
    );
  }
  return value;
}

export function buildResponsesEndpoint(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new AgentResponsesError('Provider Base URL 无效。', 'INVALID_PROVIDER_URL', 500, false);
  }
  if (url.protocol !== 'https:') {
    throw new AgentResponsesError('Responses Provider 必须使用 HTTPS。', 'INSECURE_PROVIDER_URL', 500, false);
  }
  if (url.username || url.password) {
    throw new AgentResponsesError('Provider URL 不得包含内嵌凭据。', 'INVALID_PROVIDER_URL', 500, false);
  }

  url.search = '';
  url.hash = '';
  const path = url.pathname.replace(/\/+$/, '');
  if (/\/responses$/i.test(path)) {
    url.pathname = path;
  } else if (/\/v1(?:beta|alpha)?$/i.test(path)) {
    url.pathname = path.replace(/\/v1(?:beta|alpha)?$/i, '/v1/responses');
  } else {
    url.pathname = `${path}/v1/responses`.replace(/\/{2,}/g, '/');
  }
  return url.toString();
}

export function buildAgentResponsesPayload(input: AgentResponsesPayloadInput): Record<string, unknown> {
  const model = assertSafeAgentModel(input.model);
  const previousResponseId = assertSafePreviousResponseId(input.previousResponseId);
  const reasoningEffort = parseAgentReasoningEffort(input.reasoningEffort);
  if (!input.input.trim()) {
    throw new AgentResponsesError('Responses input 不能为空。', 'EMPTY_AGENT_INPUT', 400, false);
  }
  if (!input.instructions.trim()) {
    throw new AgentResponsesError('Responses instructions 不能为空。', 'EMPTY_AGENT_INSTRUCTIONS', 500, false);
  }

  const payload: Record<string, unknown> = {
    model,
    input: input.input,
    // Responses API does not inherit instructions through previous_response_id.
    instructions: input.instructions,
    store: true,
    reasoning: { effort: reasoningEffort },
    max_output_tokens: input.maxOutputTokens ?? 12000
  };

  if (previousResponseId) payload.previous_response_id = previousResponseId;
  if (input.metadata && Object.keys(input.metadata).length > 0) payload.metadata = input.metadata;
  if (input.schema) {
    payload.text = {
      format: {
        type: 'json_schema',
        name: input.schema.name,
        description: input.schema.description,
        strict: true,
        schema: input.schema.schema
      }
    };
  }
  return payload;
}

function extractOutputText(raw: Record<string, any>): { text: string; refusal?: string } {
  if (typeof raw.output_text === 'string' && raw.output_text.trim()) {
    return { text: raw.output_text.trim() };
  }

  const textParts: string[] = [];
  let refusal: string | undefined;
  for (const item of Array.isArray(raw.output) ? raw.output : []) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        textParts.push(content.text);
      } else if (content?.type === 'refusal' && typeof content.refusal === 'string') {
        refusal = content.refusal;
      }
    }
  }
  return { text: textParts.join('').trim(), refusal };
}

export function normalizeAgentResponse(rawValue: unknown): NormalizedAgentResponse {
  const raw = rawValue && typeof rawValue === 'object' ? rawValue as Record<string, any> : {};
  const id = typeof raw.id === 'string' ? raw.id : '';
  if (!id) {
    throw new AgentResponsesError('上游 Responses 响应缺少 id。', 'INVALID_PROVIDER_RESPONSE', 502, true);
  }

  const allowedStatuses = new Set<AgentResponseStatus>([
    'completed', 'incomplete', 'failed', 'in_progress', 'queued', 'cancelled'
  ]);
  const status = allowedStatuses.has(raw.status) ? raw.status as AgentResponseStatus : 'failed';
  const extracted = extractOutputText(raw);
  return {
    id,
    model: typeof raw.model === 'string' ? raw.model : '',
    status,
    outputText: extracted.text,
    refusal: extracted.refusal,
    incompleteReason: typeof raw.incomplete_details?.reason === 'string'
      ? raw.incomplete_details.reason
      : undefined,
    usage: raw.usage && typeof raw.usage === 'object' ? raw.usage : null,
    raw
  };
}

export function isContinuableIncompleteReason(reason: string | undefined): boolean {
  return reason === 'max_output_tokens';
}

export async function createAgentResponse(
  config: ApiProviderConfig,
  input: AgentResponsesPayloadInput,
  fetchImpl: typeof fetch = fetch
): Promise<NormalizedAgentResponse> {
  if (!config.apiKey) {
    throw new AgentResponsesError('Provider API Key 未配置。', 'PROVIDER_NOT_CONFIGURED', 500, false);
  }

  const endpoint = buildResponsesEndpoint(config.baseUrl);
  const payload = buildAgentResponsesPayload(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 360000);
  let response: globalThis.Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error: any) {
    const timedOut = error?.name === 'AbortError';
    if (config.method1Key && config.method1Key !== config.apiKey) {
      console.warn(`[AgentResponses] 主路由请求${timedOut ? '超时' : '异常'}，正在自动无缝故障转移至备用路由 (RouterHub)...`);
      const fallbackConfig: ApiProviderConfig = {
        apiKey: config.method1Key,
        baseUrl: 'https://api.routerhub.ai/v1',
        deptId: config.deptId,
        provider: 'routerhub',
        source: config.source,
        routingMode: config.routingMode,
        method1Key: null
      };
      return await createAgentResponse(fallbackConfig, input, fetchImpl);
    }
    throw new AgentResponsesError(
      timedOut ? 'Responses Provider 请求超时。' : 'Responses Provider 网络请求失败。',
      timedOut ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK_ERROR',
      502,
      true
    );
  } finally {
    clearTimeout(timeout);
  }

  const requestId = response.headers.get('x-request-id') || undefined;
  const rawText = await response.text();
  let raw: any = {};
  try {
    raw = rawText ? JSON.parse(rawText) : {};
  } catch {
    if (config.method1Key && config.method1Key !== config.apiKey) {
      console.warn('[AgentResponses] 主路由返回非 JSON，正在自动无缝故障转移至备用路由 (RouterHub)...');
      const fallbackConfig: ApiProviderConfig = {
        apiKey: config.method1Key,
        baseUrl: 'https://api.routerhub.ai/v1',
        deptId: config.deptId,
        provider: 'routerhub',
        source: config.source,
        routingMode: config.routingMode,
        method1Key: null
      };
      return await createAgentResponse(fallbackConfig, input, fetchImpl);
    }
    throw new AgentResponsesError(
      'Responses Provider 返回了非 JSON 响应。',
      'INVALID_PROVIDER_RESPONSE',
      502,
      response.status >= 500,
      requestId
    );
  }

  if (!response.ok) {
    // If upstream returns 404 or 405 (e.g. TianToken / TokenMarket endpoint does not support /v1/responses), fallback to standard /v1/chat/completions
    if (response.status === 404 || response.status === 405) {
      console.warn(`[AgentResponses] Provider endpoint returned ${response.status}, attempting chat/completions fallback for model ${input.model}`);
      try {
        return await callChatCompletionsFallback(config, input, fetchImpl);
      } catch (fallbackError: any) {
        console.warn('[AgentResponses] Chat completions fallback failed:', fallbackError?.message);
      }
    }

    const message = raw?.error?.message || raw?.message || `Responses Provider HTTP ${response.status}`;

    // 如果是 401（Token 无效/未授权）或 403 或 5xx 上游错误，且配置了有效的备用 RouterHub key，自动无缝平滑故障转移
    if ((response.status === 401 || response.status === 403 || response.status >= 500) && config.method1Key && config.method1Key !== config.apiKey) {
      console.warn(`[AgentResponses] 主路由返回 HTTP ${response.status} (${message})，正在自动无缝故障转移至备用路由 (RouterHub)...`);
      const fallbackConfig: ApiProviderConfig = {
        apiKey: config.method1Key,
        baseUrl: 'https://api.routerhub.ai/v1',
        deptId: config.deptId,
        provider: 'routerhub',
        source: config.source,
        routingMode: config.routingMode,
        method1Key: null
      };
      return await createAgentResponse(fallbackConfig, input, fetchImpl);
    }

    throw new AgentResponsesError(
      message,
      raw?.error?.code || 'PROVIDER_ERROR',
      response.status >= 500 ? 502 : response.status,
      response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
      requestId
    );
  }
  return normalizeAgentResponse(raw);
}

async function callChatCompletionsFallback(
  config: ApiProviderConfig,
  input: AgentResponsesPayloadInput,
  fetchImpl: typeof fetch
): Promise<NormalizedAgentResponse> {
  let chatEndpoint = config.baseUrl.replace(/\/+$/, '');
  if (/\/responses$/i.test(chatEndpoint)) {
    chatEndpoint = chatEndpoint.replace(/\/responses$/i, '/chat/completions');
  } else if (!/\/chat\/completions$/i.test(chatEndpoint)) {
    chatEndpoint = `${chatEndpoint}/chat/completions`.replace(/([^:]\/)\/+/g, '$1');
  }

  const model = assertSafeAgentModel(input.model);
  const messages = [
    { role: 'system', content: input.instructions },
    { role: 'user', content: input.input }
  ];

  const body: Record<string, any> = {
    model,
    messages,
    max_tokens: input.maxOutputTokens ?? 8192,
    temperature: 0.3
  };

  if (input.schema) {
    body.response_format = {
      type: 'json_object'
    };
  }

  const res = await fetchImpl(chatEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const rawText = await res.text();
  let raw: any = {};
  try {
    raw = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new AgentResponsesError('Chat Completions 返回非 JSON', 'INVALID_PROVIDER_RESPONSE', 502, false);
  }

  if (!res.ok) {
    throw new AgentResponsesError(
      raw?.error?.message || `HTTP ${res.status}`,
      raw?.error?.code || 'CHAT_COMPLETIONS_ERROR',
      res.status,
      false
    );
  }

  const content = raw?.choices?.[0]?.message?.content || '';
  return {
    id: raw.id || `chatcmpl-${Date.now()}`,
    model: raw.model || model,
    status: 'completed',
    outputText: content,
    usage: raw.usage || null,
    raw
  };
}
