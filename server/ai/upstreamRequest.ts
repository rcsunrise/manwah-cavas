// 读取上游响应：计时覆盖响应头和响应内容两个阶段。
// 上游可能先返回 200 响应头，内容却迟迟传不完；调用方放弃后也要取消请求，避免继续重试生成。
import { ProviderError } from './providerError';

export interface UpstreamRequestOptions {
  timeoutMs: number;
  /** 调用方离开时触发 */
  callerSignal: AbortSignal;
  provider: string;
  model: string;
  log?: (message: string) => void;
}

function callerGoneError(provider: string, model: string): ProviderError {
  return new ProviderError('调用方已停止等待，已取消上游请求。', 'internal_error', 499, false, provider, model);
}

export async function fetchUpstreamText(
  url: string,
  init: RequestInit,
  { timeoutMs, callerSignal, provider, model, log }: UpstreamRequestOptions
): Promise<{ response: Response; text: string }> {
  if (callerSignal.aborted) throw callerGoneError(provider, model);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const abortForCaller = () => controller.abort();
  callerSignal.addEventListener('abort', abortForCaller, { once: true });

  const startedAt = Date.now();
  const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
  let response: Response | undefined;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
    log?.(`[OpenAI Proxy Debug] upstream status: ${response.status} (headers after ${elapsed()}, model ${model})`);
    const text = await response.text();
    log?.(`[Gateway timing] ${model}: body received after ${elapsed()}, ${text.length} chars`);
    return { response, text };
  } catch (err: any) {
    if (callerSignal.aborted) throw callerGoneError(provider, model);
    if (controller.signal.aborted) {
      const seconds = Math.round(timeoutMs / 1000);
      throw new ProviderError(
        response ? `上游已开始响应，但内容在 ${seconds} 秒内没有传完。` : `上游请求在 ${seconds} 秒后超时。`,
        'timeout',
        504,
        true,
        provider,
        model
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    callerSignal.removeEventListener('abort', abortForCaller);
  }
}
