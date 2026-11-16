import { supabase } from '../lib/supabase';

/**
 * 给同源的 /api 与 /v1* 请求自动带上登录凭证。
 * 服务端现在要求会花钱的写请求必须登录；前端有些地方自己拼了 getAuthHeaders，有些没有，
 * 这里统一兜底：请求里已有 Authorization 就不动；Supabase 代理由 supabase-js 自己带凭证，跳过。
 */
let cachedToken: string | null = null;
let installed = false;

async function currentToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  try {
    const result: any = await Promise.race([
      supabase.auth.getSession(),
      new Promise(resolve => setTimeout(() => resolve(null), 1500))
    ]);
    cachedToken = result?.data?.session?.access_token || null;
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

export function shouldAttachAuth(url: string, origin: string): boolean {
  let u: URL;
  try {
    u = new URL(url, origin);
  } catch {
    return false;
  }
  if (u.origin !== origin) return false;
  if (u.pathname.startsWith('/api/supabase-proxy')) return false;
  return u.pathname.startsWith('/api/') || /^\/v1(beta|alpha)?\//.test(u.pathname);
}

export function installAuthFetch() {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;

  try {
    supabase.auth.onAuthStateChange((_event: string, session: any) => {
      cachedToken = session?.access_token || null;
    });
  } catch {
    // supabase 未配置时不影响页面
  }

  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (shouldAttachAuth(url, window.location.origin)) {
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        if (!headers.has('Authorization')) {
          const token = await currentToken();
          if (token) {
            headers.set('Authorization', `Bearer ${token}`);
            if (input instanceof Request) return original(new Request(input, { ...init, headers }));
            return original(input, { ...init, headers });
          }
        }
      }
    } catch {
      // 出错就按原请求发，不影响功能
    }
    return original(input as any, init);
  };
}
