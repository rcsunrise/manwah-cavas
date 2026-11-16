import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../middleware/auth', () => ({
  // 有 Bearer good 视为登录成功，其余 401
  authenticateToken: (req: any, res: any, next: any) => {
    if (req.headers.authorization === 'Bearer good') {
      req.user = { id: 'u-1', role: 'user' };
      return next();
    }
    return next({ status: 401, code: 'UNAUTHORIZED' });
  }
}));

import {
  __resetRateLimit,
  corsGuard,
  IMAGE_LIMIT,
  internalGatewayHeaders,
  isAllowedOrigin,
  isImagePath,
  isInternalGatewayCall,
  rateLimitWrites,
  requireLoginForWrites,
  requireUserOrInternal
} from '../middleware/apiGuard';
import { shouldAttachAuth } from '../../src/utils/authFetch';

function mockReq(over: Partial<any> = {}) {
  return { method: 'POST', path: '/api/poster-templates/template-a/hero', headers: {}, ...over } as any;
}
function mockRes() {
  const res: any = { headers: {} as Record<string, string>, statusCode: 200, body: undefined };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: any) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: string) => ((res.headers[k] = v), res);
  return res;
}
function run(mw: any, req: any) {
  const res = mockRes();
  let nextArg: any = 'not-called';
  mw(req, res, (a?: any) => (nextArg = a));
  return { res, nextArg };
}

describe('写请求必须登录', () => {
  it('未登录的生图 / 海报写请求被拒', () => {
    expect(run(requireLoginForWrites, mockReq()).nextArg).toMatchObject({ status: 401 });
    expect(run(requireLoginForWrites, mockReq({ path: '/api/gateway/generate-image' })).nextArg).toMatchObject({ status: 401 });
    expect(run(requireLoginForWrites, mockReq({ path: '/v1beta/models/x:generateContent' })).nextArg).toMatchObject({ status: 401 });
  });

  it('请求头自报 x-user-uuid 不算登录', () => {
    const r = run(requireLoginForWrites, mockReq({ headers: { 'x-user-uuid': 'someone-else' } }));
    expect(r.nextArg).toMatchObject({ status: 401 });
  });

  it('带有效凭证放行，并识别出用户', () => {
    const req = mockReq({ headers: { authorization: 'Bearer good' } });
    expect(run(requireLoginForWrites, req).nextArg).toBeUndefined();
    expect(req.user.id).toBe('u-1');
  });

  it('GET、健康检查、Supabase 代理、桌面配对不需要登录', () => {
    expect(run(requireLoginForWrites, mockReq({ method: 'GET' })).nextArg).toBeUndefined();
    expect(run(requireLoginForWrites, mockReq({ path: '/api/supabase-proxy/auth/v1/token' })).nextArg).toBeUndefined();
    expect(run(requireLoginForWrites, mockReq({ path: '/api/bridge/pair' })).nextArg).toBeUndefined();
    expect(run(requireLoginForWrites, mockReq({ path: '/assets/index.js' })).nextArg).toBeUndefined();
  });

  it('生图网关：只有带内部令牌的回环调用可以不登录', () => {
    const internal = mockReq({ path: '/api/gateway/generate-image', headers: internalGatewayHeaders('u-9') });
    expect(isInternalGatewayCall(internal)).toBe(true);
    expect(run(requireLoginForWrites, internal).nextArg).toBeUndefined();
    expect(run(requireUserOrInternal, internal).nextArg).toBeUndefined();

    const forged = mockReq({ path: '/api/gateway/generate-image', headers: { 'x-internal-gateway-token': 'guess', 'x-user-uuid': 'u-9' } });
    expect(isInternalGatewayCall(forged)).toBe(false);
    expect(run(requireUserOrInternal, forged).nextArg).toMatchObject({ status: 401 });
  });

  it('内部令牌不能用来绕过其他接口', () => {
    const r = run(requireLoginForWrites, mockReq({ path: '/api/poster-templates/fabric/sofa', headers: internalGatewayHeaders('u-9') }));
    expect(r.nextArg).toMatchObject({ status: 401 });
  });
});

describe('跨域', () => {
  const env = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = env;
    delete process.env.ALLOWED_ORIGINS;
  });

  it('同源、配置的来源放行；其他网站拒绝', () => {
    process.env.NODE_ENV = 'production';
    expect(isAllowedOrigin('https://manwah-cavas.cloud.run', 'manwah-cavas.cloud.run')).toBe(true);
    expect(isAllowedOrigin('https://evil.example.com', 'manwah-cavas.cloud.run')).toBe(false);
    expect(isAllowedOrigin('http://localhost:3000', 'manwah-cavas.cloud.run')).toBe(false);
    process.env.ALLOWED_ORIGINS = 'https://studio.example.com';
    expect(isAllowedOrigin('https://studio.example.com', 'manwah-cavas.cloud.run')).toBe(true);
    expect(isAllowedOrigin(undefined, 'x')).toBe(true);
  });

  it('非生产环境放行 localhost', () => {
    process.env.NODE_ENV = 'development';
    expect(isAllowedOrigin('http://localhost:5173', 'localhost:3000')).toBe(true);
  });

  it('不允许的来源发写请求直接 403，允许的带上跨域响应头', () => {
    process.env.NODE_ENV = 'production';
    const bad = run(corsGuard, mockReq({ headers: { origin: 'https://evil.example.com', host: 'manwah-cavas.cloud.run' } }));
    expect(bad.res.statusCode).toBe(403);
    expect(bad.nextArg).toBe('not-called');
    const ok = run(corsGuard, mockReq({ headers: { origin: 'https://manwah-cavas.cloud.run', host: 'manwah-cavas.cloud.run' } }));
    expect(ok.res.headers['Access-Control-Allow-Origin']).toBe('https://manwah-cavas.cloud.run');
    expect(ok.nextArg).toBeUndefined();
  });
});

describe('限流', () => {
  beforeEach(() => __resetRateLimit());

  it('识别生图类路径', () => {
    expect(isImagePath('/api/gateway/generate-image')).toBe(true);
    expect(isImagePath('/api/poster-templates/fabric/mood')).toBe(true);
    expect(isImagePath('/api/poster-templates/fabric/compose')).toBe(false);
    expect(isImagePath('/api/canvases/c1/draft')).toBe(false);
  });

  it('同一用户生图超过上限返回 429，换个用户不受影响', () => {
    const make = (id: string) => mockReq({ path: '/api/gateway/generate-image', user: { id } });
    for (let i = 0; i < IMAGE_LIMIT.max; i++) expect(run(rateLimitWrites, make('a')).nextArg).toBeUndefined();
    expect(run(rateLimitWrites, make('a')).res.statusCode).toBe(429);
    expect(run(rateLimitWrites, make('b')).nextArg).toBeUndefined();
  });

  it('内部回环调用不计数', () => {
    const req = mockReq({ path: '/api/gateway/generate-image', headers: internalGatewayHeaders('a'), user: { id: 'a' } });
    for (let i = 0; i < IMAGE_LIMIT.max + 5; i++) expect(run(rateLimitWrites, req).nextArg).toBeUndefined();
  });
});

describe('前端自动带凭证', () => {
  const origin = 'https://manwah-cavas.cloud.run';
  it('同源 /api 与 /v1* 带，其他不带', () => {
    expect(shouldAttachAuth('/api/poster-templates/concept', origin)).toBe(true);
    expect(shouldAttachAuth(`${origin}/v1beta/models/x:generateContent`, origin)).toBe(true);
    expect(shouldAttachAuth('/api/supabase-proxy/rest/v1/profiles', origin)).toBe(false);
    expect(shouldAttachAuth('https://jbiktybatgdorflzwbob.supabase.co/storage/v1/object/x.png', origin)).toBe(false);
    expect(shouldAttachAuth('/assets/index.js', origin)).toBe(false);
  });
});
