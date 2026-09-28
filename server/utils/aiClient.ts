import { GoogleGenAI } from '@google/genai';
import { isProviderKeyValid, resolveApiConfig } from '../ai/providerConfig';

export { resolveApiConfig } from '../ai/providerConfig';

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

    return { ai, config, isValidKey: true };
  }

  // 2. 仅在 Supabase 和第三方环境无任何有效 Key 时，才作为本地开发调试兜底使用 GEMINI_API_KEY
  if (isProviderKeyValid(process.env.GEMINI_API_KEY)) {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    return {
      ai,
      config: {
        apiKey: process.env.GEMINI_API_KEY,
        baseUrl: 'https://generativelanguage.googleapis.com',
        deptId: null,
        provider: 'google_native' as any,
        source: 'global' as const
      },
      isValidKey: true
    };
  }

  return { ai: null, config, isValidKey: false };
}
