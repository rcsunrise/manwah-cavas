import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { authenticateToken } from './auth';
import type { AuthenticatedRequest } from '../types';

/**
 * 上线前的接口防护：
 * 1. 会花钱的写请求必须登录（只认 Bearer 凭证，不认 x-user-uuid / userId 等请求方自报的身份）；
 * 2. 服务端自己调 /api/gateway/generate-image（海报、空间工作室、改字走本机回环）时带内部令牌，
 *    只有带令牌的请求才能用请求头指定扣点用户；
 * 3. 跨域只放行同源、配置的来源和本地开发；
 * 4. 生图类请求按用户限流。
 */

/** 进程内随机生成，只在本进程的回环请求里传递，不落盘、不出现在日志里 */
export const INTERNAL_GATEWAY_TOKEN = randomUUID();
const INTERNAL_HEADER = 'x-internal-gateway-token';

/** 服务端内部调用生图网关时用的请求头 */
export function internalGatewayHeaders(userId: string): Record<string, string> {
  return { [INTERNAL_HEADER]: INTERNAL_GATEWAY_TOKEN, 'x-user-uuid': userId };
}

export function isInternalGatewayCall(req: Request): boolean {
  return req.headers[INTERNAL_HEADER] === INTERNAL_GATEWAY_TOKEN;
}

/** 生图网关：内部回环调用放行（身份取请求头），外部请求必须登录 */
export function requireUserOrInternal(req: Request, res: Response, next: NextFunction) {
  if (isInternalGatewayCall(req)) return next();
  return authenticateToken(req as AuthenticatedRequest, res, next);
}

/** 不需要登录的写接口（前缀匹配） */
const PUBLIC_WRITE_PREFIXES = [
  '/api/supabase-proxy', // 前端直连 Supabase 的代理，凭证由 Supabase 自己校验
  '/api/bridge/pair', // 桌面端配对，用一次性配对码
  '/api/local-folder', // 本机调试，生产环境已整体关闭
  '/api/health'
];

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** 所有 /api 与 /v1* 下的写请求必须登录（生图网关单独处理内部调用） */
export function requireLoginForWrites(req: Request, res: Response, next: NextFunction) {
  if (!WRITE_METHODS.has(req.method)) return next();
  const path = req.path;
  const guarded = path.startsWith('/api/') || /^\/v1(beta|alpha)?\//.test(path);
  if (!guarded) return next();
  if (PUBLIC_WRITE_PREFIXES.some(p => path.startsWith(p))) return next();
  if (path.startsWith('/api/gateway/generate-image') && isInternalGatewayCall(req)) return next();
  return authenticateToken(req as AuthenticatedRequest, res, next);
}

// ───────────── 跨域 ─────────────

function configuredOrigins(): string[] {
  return String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * 是否放行这个 Origin：同源（Origin 与请求的 Host 一致）、ALLOWED_ORIGINS 里配置的、
 * 以及非生产环境的 localhost。没有 Origin（同源 GET、服务端回环、curl）不属于跨域，交给鉴权处理。
 */
export function isAllowedOrigin(origin: string | undefined, host: string | undefined, forwardedProto?: string): boolean {
  if (!origin) return true;
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  if (host && o.host === host) return true;
  const normalized = `${o.protocol}//${o.host}`;
  if (configuredOrigins().includes(normalized)) return true;
  if (process.env.NODE_ENV !== 'production' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(o.hostname)) return true;
  void forwardedProto;
  return false;
}

export function corsGuard(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin as string | undefined;
  if (!origin) return next();
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  if (!isAllowedOrigin(origin, host)) {
    // 不给跨域响应头：浏览器会拦下响应；写请求直接拒绝，避免别的网站借用户登录态发请求
    if (req.method === 'OPTIONS' || WRITE_METHODS.has(req.method)) {
      return res.status(403).json({ success: false, error: { message: '不允许的跨域来源', code: 'CORS_FORBIDDEN' } });
    }
    return next();
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    (req.headers['access-control-request-headers'] as string) || 'Content-Type, Authorization'
  );
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}

// ───────────── 限流 ─────────────

interface Bucket {
  hits: number[];
}

/** 生图类请求：每个用户 10 分钟内最多这么多次（一张面料海报约 6 次，批量九屏约 9 次） */
export const IMAGE_LIMIT = { max: 60, windowMs: 10 * 60_000 };
/** 其他写请求：每个用户 1 分钟内最多这么多次（画布自动保存、对话等） */
export const WRITE_LIMIT = { max: 240, windowMs: 60_000 };

const IMAGE_PATH_RE =
  /^\/api\/(gateway\/generate-image|poster-templates\/(template-a\/hero|fabric\/(sofa|pillow|mood)|textile\/mood)|space\/shoot\/|image-text-edit|video\/)|^\/v1(beta|alpha)?\/.*:(generateContent|streamGenerateContent|predict)/;

const buckets = new Map<string, Bucket>();

function hit(key: string, limit: { max: number; windowMs: number }, now: number): boolean {
  const b = buckets.get(key) || { hits: [] };
  b.hits = b.hits.filter(t => now - t < limit.windowMs);
  if (b.hits.length >= limit.max) {
    buckets.set(key, b);
    return false;
  }
  b.hits.push(now);
  buckets.set(key, b);
  return true;
}

/** 测试用 */
export function __resetRateLimit() {
  buckets.clear();
}

export function isImagePath(path: string): boolean {
  return IMAGE_PATH_RE.test(path);
}

/** 按登录用户限流（内部回环调用不计，外层请求已经计过一次）。每个实例各自计数。 */
export function rateLimitWrites(req: Request, res: Response, next: NextFunction) {
  if (!WRITE_METHODS.has(req.method) || isInternalGatewayCall(req)) return next();
  const userId = (req as AuthenticatedRequest).user?.id;
  if (!userId) return next();
  const now = Date.now();
  // 定期清掉空桶，避免长期运行内存增长
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (!b.hits.some(t => now - t < IMAGE_LIMIT.windowMs)) buckets.delete(k);
  }
  if (isImagePath(req.path) && !hit(`img:${userId}`, IMAGE_LIMIT, now)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ success: false, error: { message: '生成请求太频繁，请稍后再试（每 10 分钟最多 60 次生图）', code: 'RATE_LIMITED' } });
  }
  if (!hit(`w:${userId}`, WRITE_LIMIT, now)) {
    res.setHeader('Retry-After', '30');
    return res.status(429).json({ success: false, error: { message: '操作太频繁，请稍后再试', code: 'RATE_LIMITED' } });
  }
  next();
}
