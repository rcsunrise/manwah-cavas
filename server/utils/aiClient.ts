import { GoogleGenAI } from '@google/genai';
import { isProviderKeyValid, resolveApiConfig } from '../ai/providerConfig';
import { modelsToTry, TEXT_MODEL_TIMEOUT_MS } from '../ai/textModelChain';
import { isTransientNetworkError, transientBackoff } from '../lib/transientNetwork';

export { resolveApiConfig } from '../ai/providerConfig';

/**
 * 文本 / 识图调用统一走 TEXT_MODEL_CHAIN：代码里写的是 gemini-3.7/3.8/2.5-flash 等平台没开通的名字时，
 * 自动改成可用模型按顺序兜底；每个模型限时，超时或失败换下一个。生图等其他模型不受影响。
 */
const modelDownUntil = new Map<string, number>();
const MODEL_DOWN_MS = 2 * 60_000;

function wrapWithModelChain(ai: GoogleGenAI) {
  const models: any = (ai as any).models;
  if (!models || models.__chainWrapped) return;
  const original = models.generateContent.bind(models);
  models.generateContent = async (params: any) => {
    const tryList = modelsToTry(String(params?.model || ''));
    if (tryList.length === 1) return original(params);
    let lastErr: any;
    // 最近失败过的模型先跳过（调用方自己还有一层循环时，避免同一个坏模型被反复等超时）；全在冷却就照常全试
    const now = Date.now();
    const healthy = tryList.filter(m => (modelDownUntil.get(m) || 0) <= now);
    for (const model of healthy.length ? healthy : tryList) {
      const controller = new AbortController();
      const callerSignal: AbortSignal | undefined = params?.config?.abortSignal;
      if (callerSignal?.aborted) throw callerSignal.reason ?? new Error('aborted');
      const onAbort = () => controller.abort(callerSignal?.reason);
      callerSignal?.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => controller.abort(new Error(`${model} 超时 ${TEXT_MODEL_TIMEOUT_MS}ms`)), TEXT_MODEL_TIMEOUT_MS);
      try {
        // 网络断连（复用了被代理掐断的连接等）先用新连接重试同一个模型一次，再考虑换模型
        for (let attempt = 0; ; attempt++) {
          try {
            return await original({ ...params, model, config: { ...(params?.config || {}), abortSignal: controller.signal } });
          } catch (attemptErr: any) {
            if (attempt === 0 && !controller.signal.aborted && !callerSignal?.aborted && isTransientNetworkError(attemptErr)) {
              console.warn(`[ModelChain] ${model} 网络断连，重试一次:`, String(attemptErr?.message || attemptErr).slice(0, 120));
              await transientBackoff(attempt);
              continue;
            }
            throw attemptErr;
          }
        }
      } catch (err: any) {
        lastErr = err;
        if (callerSignal?.aborted) throw err;
        // 只有“模型没开通 / 上游 5xx / 超时”才把模型标为暂不可用；网络断连不算（换个连接就好）
        const msg = String(err?.message || err?.status || err);
        if (!isTransientNetworkError(err) && (controller.signal.aborted || /model_not_found|no available channel|timeout|超时|5\d\d/i.test(msg))) {
          modelDownUntil.set(model, Date.now() + MODEL_DOWN_MS);
        }
        console.warn(`[ModelChain] ${model}（请求 ${params?.model}）失败，换下一个:`, msg.slice(0, 200));
      } finally {
        clearTimeout(timer);
        callerSignal?.removeEventListener('abort', onAbort);
      }
    }
    throw lastErr;
  };
  models.__chainWrapped = true;
}

export async function createServerGenAI(userUuid: string = 'system') {
  // 1. 优先使用来自 Supabase (department_configs / profiles) 的第三方 API 路由底座
  const config = await resolveApiConfig(userUuid);

  if (isProviderKeyValid(config.apiKey)) {
    let baseUrl = config.baseUrl || 'https://api.routerhub.ai/v1';
    if (!baseUrl.startsWith('http')) {
      baseUrl = 'https://' + baseUrl;
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${config.apiKey}`
    };

    const ai = new GoogleGenAI({
      apiKey: config.apiKey || 'proxy-key',
      httpOptions: {
        baseUrl: baseUrl.replace(/\/+$/, ''),
        headers,
        timeout: 360000
      }
    } as any);

    // 增强故障转移与自愈防护：当主通道(如TianToken)出现401、403、价格限制或上游5xx时，无缝切换到RouterHub备用通道
    const internalClient = (ai as any).apiClient;
    if (internalClient && typeof internalClient.unaryApiCall === 'function') {
      const originalUnary = internalClient.unaryApiCall.bind(internalClient);
      internalClient.unaryApiCall = async function (url: any, requestInit: any, httpMethod: any) {
        try {
          return await originalUnary(url, requestInit, httpMethod);
        } catch (callError: any) {
          const isAuthOrChannelError = 
            callError?.status === 401 ||
            callError?.status === 403 ||
            (callError?.status && callError.status >= 500) ||
            /unauthorized|invalid token|model_price_error|no available channel/i.test(callError?.message || '');

          if (isAuthOrChannelError && config.method1Key && config.method1Key !== config.apiKey) {
            console.warn(`[ServerGenAI] 检测到主路由鉴权/通道失效 (${callError?.message || callError?.status})，正在自动无缝故障转移至 RouterHub 备用通道...`);
            try {
              const u = new URL(url.toString());
              u.host = 'api.routerhub.ai';
              u.protocol = 'https:';
              if (!u.pathname.startsWith('/v1beta')) {
                u.pathname = '/v1beta' + u.pathname.replace(/^\/v1/, '');
              }
              u.searchParams.delete('key');

              const fallbackHeaders = {
                ...(requestInit?.headers || {}),
                Authorization: `Bearer ${config.method1Key}`
              };

              const fallbackInit = {
                ...requestInit,
                headers: fallbackHeaders
              };

              return await originalUnary(u, fallbackInit, httpMethod);
            } catch (failoverErr: any) {
              console.warn('[ServerGenAI] RouterHub 备用通道故障转移异常:', failoverErr?.message);
            }
          }
          throw callError;
        }
      };
    }

    wrapWithModelChain(ai);
    return { ai, config, isValidKey: true };
  }

  return { ai: null, config, isValidKey: false };
}
