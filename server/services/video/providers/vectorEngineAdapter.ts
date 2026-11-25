// server/services/video/providers/vectorEngineAdapter.ts
import crypto from 'crypto';
import { resolveVideoCapability, validateVideoSettings, resolveVideoProtocol, VideoProtocol } from '../videoCapabilityRegistry';
import { VideoSettings } from '../../../../src/types/creativeCanvasVideo';
import { resolveApiConfig } from '../../../ai/providerConfig';
import { VideoSourceImageResolver } from '../videoSourceImageResolver';

// 上游请求超时：提交可能较慢（同步直出模型），查询应快速失败以免拖住轮询
const SUBMIT_TIMEOUT_MS = 90_000;
const QUERY_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 连接在请求发出前就失败（TLS 握手前被重置、拒绝连接、DNS 失败）时请求一定没有到达上游，可以安全重试
function isPreSendNetworkError(err: any): boolean {
  const cause = err?.cause;
  const code = cause?.code || err?.code;
  const message = String(cause?.message || '');
  return (
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    (code === 'ECONNRESET' && message.includes('before secure TLS connection'))
  );
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  shouldRetry: (err: any) => boolean,
  attempts = 4
): Promise<globalThis.Response> {
  let lastError: any;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetchWithTimeout(url, init, timeoutMs);
    } catch (err) {
      lastError = err;
      if (attempt === attempts || !shouldRetry(err)) break;
      console.warn(`[VectorEngineVideoAdapter] Network error before request was sent (attempt ${attempt}), retrying:`, err?.cause?.code || err?.message);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}

export interface NormalizedVideoInput {
  modelKey: string;
  prompt: string;
  negativePrompt?: string;
  sourceImageUrl?: string;
  referenceImageUrls?: string[];
  /** 首尾帧模式的尾帧图 */
  lastFrameImageUrl?: string;
  /** multi_reference：referenceImageUrls 全部作为参考图（role=reference_image），不当首帧 */
  referenceMode?: 'multi_reference';
  settings: VideoSettings;
}

/** 豆包多参考图上限（sd-2.0 最多 9 张，sd-2.5 最多 30 张；统一按 9 张收口） */
export const MAX_MULTI_REFERENCE_IMAGES = 9;

/**
 * 豆包兼容格式的多参考图请求体：上游（火山）要求每张图标注 role，多参考图用 reference_image；
 * 只放 metadata.ratio 时出过竖屏，顶层再放一份 ratio。
 */
export function buildMultiReferenceRequest(exactModelId: string, input: NormalizedVideoInput, imageUrls: string[]): SubmitRequest {
  const ratio = input.settings.ratio || '16:9';
  return {
    path: '/v1/video/generations',
    body: {
      model: exactModelId,
      prompt: input.prompt,
      duration: input.settings.durationSeconds || 5,
      ratio,
      metadata: {
        resolution: (input.settings.resolution || '720p').toLowerCase(),
        ratio,
        generate_audio: input.settings.audioMode === 'native',
        watermark: false,
        // 只有 sd-2.5 认这个字段，sd-2.0 会直接 400「当前不支持参数 omni_reference_task_type」
        ...(/^sd-2\.5/.test(exactModelId) ? { omni_reference_task_type: 'auto' } : {})
      },
      references: imageUrls.map(url => ({ type: 'image_url', url, role: 'reference_image' }))
    }
  };
}

export interface SubmitResult {
  providerTaskId: string;
  provider: string;
  exactModelId: string;
  isSimulated: boolean;
  rawResponse?: any;
  directVideoUrl?: string;
}

export interface NormalizedProviderStatus {
  providerTaskId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  progressPercent: number;
  videoUrl?: string;
  posterUrl?: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
}

interface ApiTarget {
  baseUrl: string;
  apiKey: string;
}

interface SubmitRequest {
  path: string;
  body: Record<string, any>;
}

// 配置里的 baseUrl 可能是 https://api.tiantoken.com 或 https://api.tiantoken.com/v1，统一去掉版本段再拼接文档路径
const cleanBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '').replace(/\/(v1beta|v1)$/, '');

const SUCCEEDED_STATUSES = new Set(['succeeded', 'success', 'completed', 'done']);
const FAILED_STATUSES = new Set(['failed', 'failure', 'error']);
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled']);
const EXPIRED_STATUSES = new Set(['expired', 'timeout']);
const QUEUED_STATUSES = new Set(['queued', 'pending', 'submitted']);

/**
 * 按 tokenmarket.apifox.cn 文档为各模型族构造创建任务请求：
 * - 豆包 sd-*（兼容格式）: POST /v1/video/generations { model, prompt, duration, metadata, references }
 * - MiniMax-H3: POST /v1/video/generations { model, prompt, duration, images, metadata{resolution 768P/2K, first_frame, last_frame} }
 * - Grok: POST /v1/videos/generations { model, prompt, duration, resolution, aspect_ratio, image_url }
 * - 万相: POST /api/v1/services/aigc/video-generation/video-synthesis { model, input{prompt, media}, parameters }
 * - 可灵 3.0: POST /image-to-video/{model} { contents, settings, options }（模型名在路径中）
 */
function buildSubmitRequest(
  protocol: VideoProtocol,
  exactModelId: string,
  input: NormalizedVideoInput,
  firstFrameUrl: string,
  lastFrameUrl: string | undefined,
  idempotencyKey: string
): SubmitRequest {
  const resolution = (input.settings.resolution || '720p').toLowerCase();
  const duration = input.settings.durationSeconds || 5;
  const ratio = input.settings.ratio || '16:9';
  const generateAudio = input.settings.audioMode === 'native';

  switch (protocol) {
    case 'minimax':
      return {
        path: '/v1/video/generations',
        body: {
          model: exactModelId,
          prompt: input.prompt,
          duration,
          // 首帧/首尾帧场景与 images 参考图场景互斥（混用会被上游 2013 拒绝），图生视频只走首帧
          metadata: {
            // 平台档位为 768P / 2K，画面比例由输入图片决定
            resolution: resolution === '1080p' || resolution === '2k' ? '2K' : '768P',
            aigc_watermark: false,
            first_frame: firstFrameUrl,
            ...(lastFrameUrl ? { last_frame: lastFrameUrl } : {})
          }
        }
      };
    case 'grok':
      return {
        path: '/v1/videos/generations',
        body: {
          model: exactModelId,
          prompt: input.prompt,
          duration,
          resolution,
          aspect_ratio: ratio,
          image_url: firstFrameUrl
        }
      };
    case 'wan':
      return {
        path: '/api/v1/services/aigc/video-generation/video-synthesis',
        body: {
          model: exactModelId,
          input: {
            prompt: input.prompt,
            ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
            media: [
              { type: 'first_frame', url: firstFrameUrl },
              ...(lastFrameUrl ? [{ type: 'last_frame', url: lastFrameUrl }] : [])
            ]
          },
          parameters: {
            resolution: resolution === '1080p' ? '1080P' : '720P',
            duration,
            watermark: false,
            prompt_extend: true
          }
        }
      };
    case 'kling': {
      const isTurbo = exactModelId.endsWith('-turbo');
      return {
        path: `/image-to-video/${exactModelId}`,
        body: {
          contents: [
            { type: 'prompt', text: input.prompt },
            { type: 'first_frame', url: firstFrameUrl }
          ],
          settings: {
            resolution,
            duration,
            // turbo 默认有声且不接受 audio / multi_shot 参数
            ...(isTurbo ? {} : { audio: generateAudio ? 'native' : 'off', multi_shot: false })
          },
          options: {
            external_task_id: idempotencyKey.slice(0, 64),
            watermark_info: { enabled: false }
          }
        }
      };
    }
    case 'doubao':
    default:
      return {
        path: '/v1/video/generations',
        body: {
          model: exactModelId,
          prompt: input.prompt,
          duration,
          metadata: {
            resolution,
            ratio,
            generate_audio: generateAudio,
            watermark: false
          },
          // 兼容格式的多张 references 是多参考图语义而非首尾帧，这里只传首帧
          references: [{ type: 'image_url', url: firstFrameUrl }]
        }
      };
  }
}

function extractTaskId(data: any): string | undefined {
  return (
    data?.data?.id ||
    data?.id ||
    data?.task_id ||
    data?.request_id ||
    data?.data?.task_id ||
    data?.output?.task_id ||
    undefined
  );
}

function extractVideoUrl(record: any): string | undefined {
  if (!record || typeof record !== 'object') return undefined;
  const outputs = Array.isArray(record.outputs) ? record.outputs : [];
  const videoOutput = outputs.find((o: any) => o?.type === 'video' && o?.url) || outputs.find((o: any) => o?.url);
  return (
    record.metadata?.url ||
    record.video?.url ||
    videoOutput?.url ||
    record.content?.video_url ||
    record.output?.video_url ||
    record.result?.video_url ||
    record.result_url ||
    record.video_url ||
    (Array.isArray(record.videos) ? record.videos[0]?.url : undefined) ||
    undefined
  ) || undefined;
}

function upstreamErrorMessage(status: number, text: string, displayName: string): string {
  let parsedMessage = text;
  try {
    const parsed = JSON.parse(text);
    parsedMessage = parsed.message || parsed.error?.message || parsed.msg || parsed.base_resp?.status_msg || text;
  } catch {}
  parsedMessage = String(parsedMessage || '').slice(0, 300);

  // 友好化 New-API 分组权限缺失与渠道维护提示
  if (status === 503 && parsedMessage.includes('No available channel')) {
    return `模型【${displayName}】在此 Token 权限分组下暂无可用渠道，请在 TianToken 控制台为令牌开通对应分组，或切换豆包 Seedance 2.0 系列。`;
  }
  if (parsedMessage.includes('可用渠道不存在')) {
    return `模型【${displayName}】上游渠道暂时离线或维护中，建议切换豆包 Seedance 2.0 系列。`;
  }
  return parsedMessage;
}

export class VectorEngineVideoAdapter {
  /**
   * Validates input against model capabilities
   */
  public static validate(input: NormalizedVideoInput): { valid: boolean; error?: string } {
    const capability = resolveVideoCapability(input.modelKey);
    if (input.referenceMode === 'multi_reference') {
      if (!capability.modes.includes('multi_reference')) {
        return { valid: false, error: `模型 ${capability.displayName} 不支持多参考图生成` };
      }
      const n = input.referenceImageUrls?.length || 0;
      if (n === 0) return { valid: false, error: '多参考图生成至少需要一张参考图' };
      if (n > MAX_MULTI_REFERENCE_IMAGES) return { valid: false, error: `多参考图最多 ${MAX_MULTI_REFERENCE_IMAGES} 张，当前 ${n} 张` };
      return validateVideoSettings(capability, input.settings, 0);
    }
    // 尾帧单独按 first_last_frame 能力校验，不占参考图名额
    const count = (input.referenceImageUrls?.length || 0) + (input.sourceImageUrl ? 1 : 0);
    return validateVideoSettings(capability, input.settings, count);
  }

  private static async postJson(target: ApiTarget, path: string, body: Record<string, any>, idempotencyKey: string) {
    return fetchWithRetry(`${target.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${target.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(body)
    }, SUBMIT_TIMEOUT_MS, isPreSendNetworkError);
  }

  /**
   * Submits a video task to TianToken (tokenmarket) gateway using the per-family documented protocol
   */
  public static async submit(
    input: NormalizedVideoInput,
    idempotencyKey: string,
    userUuid: string = 'system'
  ): Promise<SubmitResult> {
    const capability = resolveVideoCapability(input.modelKey);
    const validation = this.validate(input);
    if (!validation.valid) {
      throw new Error(`VALIDATION_FAILED: ${validation.error}`);
    }

    const config = await resolveApiConfig(userUuid);
    if (!config.apiKey) {
      if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_MOCK_VIDEO === 'true') {
        return {
          providerTaskId: `sim-task-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
          provider: 'vectorengine_simulated',
          exactModelId: capability.exactModelId,
          isSimulated: true
        };
      }
      throw new Error('MISSING_API_KEY: 未能读取到 API 凭证（全站配置读取失败或未配置），若密钥已配置多为网络抖动，请稍后重试');
    }

    let request: SubmitRequest;
    const protocol = resolveVideoProtocol(capability.exactModelId);
    if (input.referenceMode === 'multi_reference') {
      // 参考图原样转公网直链（不按画幅补边：参考图不是首帧，补边会把细节特写变成带边的小图）
      const urls: string[] = [];
      for (const raw of input.referenceImageUrls || []) {
        urls.push(await VideoSourceImageResolver.resolveToPublicUrl(raw));
      }
      request = buildMultiReferenceRequest(capability.exactModelId, input, urls);
    } else {
      request = await this.buildSingleFrameRequest(capability, protocol, input, idempotencyKey);
    }
    const primary: ApiTarget = { baseUrl: cleanBaseUrl(config.baseUrl), apiKey: config.apiKey };

    console.log(`[VectorEngineVideoAdapter] Submit ${input.referenceMode || protocol} task: POST ${request.path} model=${capability.exactModelId}`);
    return this.postAndParse(primary, request, idempotencyKey, capability, protocol);
  }

  /** 首帧 / 首尾帧图生视频的请求体 */
  private static async buildSingleFrameRequest(
    capability: ReturnType<typeof resolveVideoCapability>,
    protocol: VideoProtocol,
    input: NormalizedVideoInput,
    idempotencyKey: string
  ): Promise<SubmitRequest> {
    const rawImageUrl = input.sourceImageUrl || input.referenceImageUrls?.[0];
    if (!rawImageUrl) {
      throw new Error('IMAGE_REQUIRED: 图生视频必须提供一张参考底图');
    }

    const rawLastFrame = input.lastFrameImageUrl
      || (input.sourceImageUrl ? input.referenceImageUrls?.[0] : input.referenceImageUrls?.[1]);
    if (rawLastFrame && !capability.modes.includes('first_last_frame')) {
      throw new Error(`VALIDATION_FAILED: 模型 ${capability.displayName} 不支持首尾帧，请切换 MiniMax-H3 或去掉尾帧`);
    }

    // 无论来自画布相对路径、本地 asset 还是 Base64，均统一转换为上游可下载的公网直链；
    // 同时补边到目标画幅，避免上游裁切首帧后自行脑补被裁掉的产品部分
    const frameRatio = input.settings.ratio;
    const firstFrameUrl = await VideoSourceImageResolver.resolveFrameForRatio(rawImageUrl, frameRatio);
    const lastFrameUrl = rawLastFrame ? await VideoSourceImageResolver.resolveFrameForRatio(rawLastFrame, frameRatio) : undefined;

    return buildSubmitRequest(protocol, capability.exactModelId, input, firstFrameUrl, lastFrameUrl, idempotencyKey);
  }

  private static async postAndParse(
    primary: ApiTarget,
    request: SubmitRequest,
    idempotencyKey: string,
    capability: ReturnType<typeof resolveVideoCapability>,
    protocol: VideoProtocol
  ): Promise<SubmitResult> {
    let response = await this.postJson(primary, request.path, request.body, idempotencyKey);

    // 部门专属令牌无渠道 (503) 或限流 (429)：请求确定未被受理，故障转移到全站令牌重试一次
    if (response.status === 503 || response.status === 429) {
      const fallbackConfig = await resolveApiConfig('system');
      if (fallbackConfig.apiKey && fallbackConfig.apiKey !== primary.apiKey) {
        console.log(`[VectorEngineVideoAdapter] Primary token returned ${response.status}, failing over to system token`);
        response = await this.postJson(
          { baseUrl: cleanBaseUrl(fallbackConfig.baseUrl), apiKey: fallbackConfig.apiKey },
          request.path,
          request.body,
          `${idempotencyKey}-fb`
        );
      }
    }

    const resText = await response.text();
    if (!response.ok) {
      console.error(`[VectorEngineVideoAdapter] Video upstream rejected (${response.status}):`, resText.slice(0, 500));
      throw new Error(`视频网关拒绝请求 (${response.status}): ${upstreamErrorMessage(response.status, resText, capability.displayName)}`);
    }

    let data: any;
    try {
      data = JSON.parse(resText);
    } catch {
      throw new Error(`视频网关返回非JSON格式数据: ${resText.slice(0, 150)}`);
    }

    // 可灵原生格式：HTTP 200 但 code 非 0 视为拒绝
    if (typeof data?.code === 'number' && data.code !== 0) {
      throw new Error(`视频网关拒绝请求 (code ${data.code}): ${data.message || JSON.stringify(data).slice(0, 200)}`);
    }

    const taskId = extractTaskId(data);
    const immediateVideoUrl = extractVideoUrl(data) || extractVideoUrl(data?.data);
    if (!taskId && !immediateVideoUrl) {
      throw new Error(`视频网关未返回有效任务ID或视频链接: ${JSON.stringify(data).slice(0, 300)}`);
    }

    return {
      providerTaskId: taskId || `sync-task-${Date.now()}`,
      provider: `tiantoken_${protocol}`,
      exactModelId: capability.exactModelId,
      isSimulated: false,
      rawResponse: data,
      directVideoUrl: immediateVideoUrl
    };
  }

  private static normalizeRecord(providerTaskId: string, record: any): NormalizedProviderStatus | null {
    if (!record || typeof record !== 'object') return null;
    const rawStatus = String(
      record.status || record.state || record.task_status || record.output?.task_status || record.data?.status || ''
    ).toLowerCase();
    const videoUrl = extractVideoUrl(record) || extractVideoUrl(record.data);
    if (!rawStatus && !videoUrl) return null;

    let progressPercent = 40;
    const rawProgress = record.progress ?? record.data?.progress;
    if (rawProgress !== undefined && rawProgress !== null) {
      const parsed = parseInt(String(rawProgress).replace('%', ''), 10);
      if (!isNaN(parsed)) progressPercent = parsed;
    }

    const rawError = record.error?.message || record.error || record.fail_reason || record.data?.fail_reason || record.message;
    const failReason = typeof rawError === 'string' ? rawError : rawError ? JSON.stringify(rawError) : undefined;
    const posterUrl = record.poster_url || record.metadata?.poster_url || record.output?.poster_url || record.result?.poster_url;
    const durationSec = Number(record.video?.duration ?? record.duration ?? NaN);
    const durationMs = record.duration_ms ? Number(record.duration_ms) : (isNaN(durationSec) ? undefined : durationSec * 1000);

    if (SUCCEEDED_STATUSES.has(rawStatus) || (!rawStatus && videoUrl)) {
      return { providerTaskId, status: 'succeeded', progressPercent: 100, videoUrl, posterUrl, durationMs };
    }
    if (FAILED_STATUSES.has(rawStatus) || EXPIRED_STATUSES.has(rawStatus)) {
      return {
        providerTaskId,
        status: 'failed',
        progressPercent,
        errorCode: EXPIRED_STATUSES.has(rawStatus) ? 'PROVIDER_EXPIRED' : undefined,
        errorMessage: failReason || (EXPIRED_STATUSES.has(rawStatus) ? '上游任务已过期' : '上游生成失败')
      };
    }
    if (CANCELLED_STATUSES.has(rawStatus)) {
      return { providerTaskId, status: 'cancelled', progressPercent, errorMessage: failReason || '上游任务已取消' };
    }
    return {
      providerTaskId,
      status: QUEUED_STATUSES.has(rawStatus) ? 'queued' : 'running',
      progressPercent
    };
  }

  /**
   * Queries provider task status
   * - 豆包兼容 / MiniMax / Grok: GET /v1/videos/{task_id}
   * - 万相: GET /api/v1/tasks/{task_id}
   * - 可灵 3.0: GET /tasks?task_ids={id}，结果在 data[0]
   * 旧任务（豆包原生 cgt- 等）回退到历史端点列表
   */
  public static async query(
    providerTaskId: string,
    userUuid: string = 'system',
    modelKey?: string
  ): Promise<NormalizedProviderStatus> {
    if (providerTaskId.startsWith('sim-task-')) {
      const parts = providerTaskId.split('-');
      const createdTs = Number(parts[2]) || Date.now();
      const elapsedSeconds = (Date.now() - createdTs) / 1000;

      if (elapsedSeconds < 3) {
        return { providerTaskId, status: 'queued', progressPercent: 15 };
      } else if (elapsedSeconds < 8) {
        return { providerTaskId, status: 'running', progressPercent: Math.min(85, Math.floor(elapsedSeconds * 12)) };
      }
      return {
        providerTaskId,
        status: 'succeeded',
        progressPercent: 100,
        videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        posterUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800',
        durationMs: 5000
      };
    }

    if (providerTaskId.startsWith('direct-') || providerTaskId.startsWith('sync-task-')) {
      return { providerTaskId, status: 'succeeded', progressPercent: 100 };
    }

    let config = await resolveApiConfig(userUuid);
    if (!config.apiKey) {
      config = await resolveApiConfig('system');
    }
    if (!config.apiKey) {
      return {
        providerTaskId,
        status: 'failed',
        progressPercent: 0,
        errorMessage: '未配置向量引擎/全站 API Key，无法查询真实任务进度'
      };
    }

    const baseUrl = cleanBaseUrl(config.baseUrl);
    const encodedId = encodeURIComponent(providerTaskId);
    const protocol = modelKey ? resolveVideoProtocol(resolveVideoCapability(modelKey).exactModelId) : null;

    const primaryEndpoints: string[] =
      protocol === 'kling' ? [`${baseUrl}/tasks?task_ids=${encodedId}`]
      : protocol === 'wan' ? [`${baseUrl}/api/v1/tasks/${encodedId}`]
      : protocol ? [`${baseUrl}/v1/videos/${encodedId}`]
      : [];
    // 历史任务兼容：豆包原生 v3 / 火山端点等
    const legacyEndpoints = [
      ...(providerTaskId.startsWith('cgt-') ? [`${baseUrl}/api/v3/contents/generations/tasks/${encodedId}`] : []),
      `${baseUrl}/v1/videos/${encodedId}`,
      `${baseUrl}/volc/v1/contents/generations/tasks/${encodedId}`,
      `${baseUrl}/api/v3/contents/generations/tasks/${encodedId}`,
      `${baseUrl}/v1/video/generations/${encodedId}`,
      `${baseUrl}/api/v1/tasks/${encodedId}`
    ];
    const endpointsToTry = Array.from(new Set([...primaryEndpoints, ...legacyEndpoints]));

    for (const url of endpointsToTry) {
      try {
        // 查询是幂等 GET，网络抖动时直接重试
        const response = await fetchWithRetry(url, {
          headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Accept': 'application/json' }
        }, QUERY_TIMEOUT_MS, () => true, 2);
        if (!response.ok) continue;

        const data: any = await response.json();
        // 可灵原生查询结果为数组
        const record = Array.isArray(data?.data)
          ? data.data.find((item: any) => item?.id === providerTaskId) || data.data[0]
          : data;
        const normalized = this.normalizeRecord(providerTaskId, record);
        if (normalized) {
          if (normalized.status === 'succeeded' && !normalized.videoUrl) {
            console.warn(`[VectorEngineVideoAdapter] Task ${providerTaskId} succeeded without a recognizable video URL:`, JSON.stringify(data).slice(0, 500));
          }
          return normalized;
        }
      } catch {
        // Try next endpoint
      }
    }

    return { providerTaskId, status: 'running', progressPercent: 40 };
  }

  /**
   * Cancels task if supported
   */
  public static async cancel(providerTaskId: string): Promise<{ success: boolean; message: string }> {
    return {
      success: true,
      message: '任务已请求取消。'
    };
  }
}
