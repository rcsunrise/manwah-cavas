import { resolveApiConfig } from '../../ai/providerConfig';

/**
 * 模板 A 的文本/视觉调用兜底：gemini 原生通道（generateContent）全部失败时，
 * 改走 OpenAI 兼容的 /v1/chat/completions，依次尝试可用模型。
 * 网关侧 gemini 通道下线或额度用尽时，对话用的 gpt 模型通常仍可用。
 */
// 实测（2026-11 识图框选）：gpt-6.1-sol 约 2.8 秒且准确，gpt-6-astra 约 9.4 秒，放最后
export const CHAT_FALLBACK_MODELS = ['gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-astra'];

export async function chatCompletionText(params: {
  prompt: string;
  /** 附带的图片（jpeg/png 的 base64，不含 data: 前缀） */
  images?: Array<{ mimeType: string; data: string }>;
  temperature?: number;
  userId?: string;
  models?: string[];
  timeoutMs?: number;
}): Promise<{ text: string; model: string }> {
  const config = await resolveApiConfig(params.userId || 'system');
  if (!config.apiKey) throw new Error('未配置模型 API 凭证');
  const base = String(config.baseUrl || '').replace(/\/+$/, '').replace(/\/(v1beta|v1)$/, '');
  const content: any[] = [
    { type: 'text', text: params.prompt },
    ...(params.images || []).map(img => ({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.data}` } }))
  ];

  let lastErr: any = null;
  for (const model of params.models || CHAT_FALLBACK_MODELS) {
    try {
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, temperature: params.temperature ?? 0.7, max_tokens: 4096, messages: [{ role: 'user', content }] }),
        signal: AbortSignal.timeout(params.timeoutMs ?? 120_000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      const json: any = await res.json();
      const text = String(json?.choices?.[0]?.message?.content || '');
      if (!text.trim()) throw new Error('模型返回空内容');
      return { text, model };
    } catch (err: any) {
      lastErr = err;
      console.warn(`[PosterChatFallback] ${model} 失败:`, err?.message || err);
    }
  }
  throw lastErr || new Error('没有可用的对话模型');
}
