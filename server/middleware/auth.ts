import { Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../src/lib/supabase';
import { AuthenticatedRequest, AuthenticatedUser, AppError } from '../types';
import { isValidUuid } from '../lib/uuid';

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

// Production safety check: Reject start if ALLOW_TEST_IDENTITY is true in production
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_TEST_IDENTITY === 'true') {
  throw new Error('FATAL: ALLOW_TEST_IDENTITY cannot be true in production environment!');
}

const ALLOWED_ROLES = new Set(['user', 'dept_admin', 'admin']);

/** 显式开启（ALLOW_TEST_IDENTITY=true）且非生产环境时才允许无登录凭证的测试身份 */
function isTestIdentityEnabled(): boolean {
  return process.env.ALLOW_TEST_IDENTITY === 'true' && process.env.NODE_ENV !== 'production';
}

/** 网络抖动（代理断连、超时）与凭证无效要区分：前者返回 503，避免把已登录用户当成未登录 */
function isNetworkError(err: any): boolean {
  if (!err) return false;
  if (err.name === 'AuthRetryableFetchError') return true;
  const text = `${err.message || ''} ${err.cause?.code || ''} ${err.code || ''}`;
  return /fetch failed|network|socket|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR|timeout/i.test(text);
}

type TokenResolution =
  | { status: 'ok'; user: AuthenticatedUser }
  | { status: 'invalid_token' }
  /** 凭证有效但没有 profile：身份已确认，但不授予任何角色 */
  | { status: 'profile_required'; user: Pick<AuthenticatedUser, 'id' | 'email'> }
  | { status: 'unavailable' };

// token → 用户身份的短期缓存：每个 API 请求原本都要串行访问 Supabase 两次（getUser + profiles）。
// 测试环境不缓存，保证每个用例按各自的模拟数据重新校验。
const TOKEN_CACHE_TTL_MS = process.env.NODE_ENV === 'test' ? 0 : 60_000;
const TOKEN_CACHE_MAX = 500;
const tokenUserCache = new Map<string, { user: AuthenticatedUser; expiresAt: number; confirmedAt: number }>();
const tokenUserInflight = new Map<string, Promise<TokenResolution>>();
// Supabase 网络常 ECONNRESET：先重试；仍连不上时，同一凭证 10 分钟内确认过身份就沿用，免得生成请求白白失败
const AUTH_RETRY_DELAYS_MS = process.env.NODE_ENV === 'test' ? [] : [300, 800];
const STALE_IDENTITY_GRACE_MS = 10 * 60_000;

async function fetchTokenUserWithRetry(token: string): Promise<TokenResolution> {
  let resolution = await fetchTokenUser(token);
  for (const delay of AUTH_RETRY_DELAYS_MS) {
    if (resolution.status !== 'unavailable') break;
    await new Promise(r => setTimeout(r, delay));
    resolution = await fetchTokenUser(token);
  }
  return resolution;
}

async function fetchTokenUser(token: string): Promise<TokenResolution> {
  let authResult: Awaited<ReturnType<typeof supabaseAdmin.auth.getUser>>;
  try {
    authResult = await supabaseAdmin.auth.getUser(token);
  } catch (err) {
    return isNetworkError(err) ? { status: 'unavailable' } : { status: 'invalid_token' };
  }
  const { data, error } = authResult;
  if (error) return isNetworkError(error) ? { status: 'unavailable' } : { status: 'invalid_token' };
  const user = data?.user;
  if (!user || !isValidUuid(user.id)) return { status: 'invalid_token' };

  // 角色只认服务端 profiles 表，不接受请求头或请求体里的任何身份/角色字段
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role, dept_id')
    .eq('id', user.id)
    .single();
  if (profileError && isNetworkError(profileError)) return { status: 'unavailable' };
  if (!profile) return { status: 'profile_required', user: { id: user.id, email: user.email } };

  return {
    status: 'ok',
    user: {
      id: user.id,
      email: user.email,
      role: ALLOWED_ROLES.has(profile.role) ? profile.role : 'user',
      departmentId: profile.dept_id || undefined
    }
  };
}

async function resolveTokenUser(token: string): Promise<TokenResolution> {
  const cached = tokenUserCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return { status: 'ok', user: cached.user };

  let pending = tokenUserInflight.get(token);
  if (!pending) {
    pending = fetchTokenUserWithRetry(token).finally(() => tokenUserInflight.delete(token));
    tokenUserInflight.set(token, pending);
  }
  const resolution = await pending;
  if (resolution.status === 'unavailable' && cached && Date.now() - cached.confirmedAt < STALE_IDENTITY_GRACE_MS) {
    return { status: 'ok', user: cached.user };
  }
  if (resolution.status === 'ok' && TOKEN_CACHE_TTL_MS > 0) {
    tokenUserCache.delete(token);
    if (tokenUserCache.size >= TOKEN_CACHE_MAX) {
      const oldestKey = tokenUserCache.keys().next().value;
      if (oldestKey !== undefined) tokenUserCache.delete(oldestKey);
    }
    const now = Date.now();
    tokenUserCache.set(token, { user: resolution.user, expiresAt: now + TOKEN_CACHE_TTL_MS, confirmedAt: now });
  } else if (resolution.status === 'invalid_token' || resolution.status === 'profile_required') {
    tokenUserCache.delete(token);
  }
  return resolution;
}

function extractBearerToken(req: AuthenticatedRequest): string | undefined {
  return req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || undefined;
}

/**
 * 严格鉴权：必须携带有效的 Bearer 凭证且账号已开通 profile。
 * 不信任 x-user-id / x-user-uuid 等请求头或请求体中的身份字段。
 */
export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // 丢弃上游可能伪造的身份，只认本次校验结果
    req.user = undefined;
    const token = extractBearerToken(req);

    if (!token) {
      if (isTestIdentityEnabled()) {
        req.user = { id: TEST_USER_ID, email: 'test@manwah.com', role: 'admin' };
        return next();
      }
      return next(new AppError('未提供有效的登录凭证', 401, 'UNAUTHORIZED'));
    }

    const resolution = await resolveTokenUser(token);
    switch (resolution.status) {
      case 'ok':
        req.user = { ...resolution.user };
        return next();
      case 'invalid_token':
        return next(new AppError('登录凭证无效或已过期，请重新登录', 401, 'INVALID_TOKEN'));
      case 'profile_required':
        return next(new AppError('账号尚未开通，请联系管理员', 403, 'PROFILE_REQUIRED'));
      case 'unavailable':
        return next(new AppError('认证服务暂时不可用，请稍后重试', 503, 'AUTH_UNAVAILABLE'));
    }
  } catch (err) {
    next(err);
  }
}

/**
 * 可选鉴权：有有效凭证时识别用户，没有时按匿名继续。
 * 同样不信任请求头 / 请求体 / 查询参数里的身份字段（否则任何人都能冒充他人，包括管理员）。
 * 非生产环境下无凭证时沿用测试身份（普通用户角色），以兼容本地开发中假定 req.user 存在的路由。
 */
export async function optionalAuthenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const token = extractBearerToken(req);
    if (token && !req.user) {
      const resolution = await resolveTokenUser(token);
      if (resolution.status === 'ok') {
        req.user = { ...resolution.user };
      } else if (resolution.status === 'profile_required') {
        // 身份由凭证确认，未开通 profile 只给最低权限
        req.user = { id: resolution.user.id, email: resolution.user.email, role: 'user' };
      }
    }
  } catch {
    // 鉴权异常时按匿名继续
  }

  if (!req.user && (isTestIdentityEnabled() || process.env.NODE_ENV !== 'production')) {
    req.user = { id: TEST_USER_ID, email: 'test@manwah.com', role: 'user' };
  }
  next();
}
