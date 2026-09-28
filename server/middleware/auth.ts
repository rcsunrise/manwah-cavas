import { Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../src/lib/supabase';
import { AuthenticatedRequest, AuthenticatedUser, AppError } from '../types';
import { isValidUuid } from '../lib/uuid';

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

// Production safety check: Reject start if ALLOW_TEST_IDENTITY is true in production
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_TEST_IDENTITY === 'true') {
  throw new Error('FATAL: ALLOW_TEST_IDENTITY cannot be true in production environment!');
}

export async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    const xUserUuid = (
      req.headers['x-user-uuid'] ||
      req.headers['x-user-id'] ||
      (req.body && (req.body.userUuid || req.body.userId))
    ) as string | undefined;

    if (token) {
      try {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        const user = data?.user;
        if (!error && user && isValidUuid(user.id)) {
          const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('role, dept_id')
            .eq('id', user.id)
            .maybeSingle();

          const allowedRoles = new Set(['user', 'dept_admin', 'admin']);
          const role = profile && allowedRoles.has(profile.role) ? profile.role : 'user';
          req.user = {
            id: user.id,
            email: user.email,
            role,
            departmentId: profile?.dept_id || undefined
          };
          return next();
        }
      } catch (tokenErr) {
        // Fall back to xUserUuid
      }
    }

    if (xUserUuid) {
      try {
        const isUuid = isValidUuid(xUserUuid);
        let profileQuery = supabaseAdmin.from('profiles').select('id, role, dept_id, email, username');
        if (isUuid) {
          profileQuery = profileQuery.eq('id', xUserUuid);
        } else {
          profileQuery = profileQuery.or(`employee_id.eq.${xUserUuid},username.eq.${xUserUuid}`);
        }

        const { data: profile } = await profileQuery.maybeSingle();
        if (profile) {
          const allowedRoles = new Set(['user', 'dept_admin', 'admin']);
          req.user = {
            id: profile.id,
            email: profile.email || 'admin@manwah.com',
            role: allowedRoles.has(profile.role) ? profile.role : 'user',
            departmentId: profile.dept_id || undefined
          };
          return next();
        }
      } catch (profileErr) {
        // Continue
      }
    }

    if (process.env.ALLOW_TEST_IDENTITY === 'true' || process.env.NODE_ENV !== 'production') {
      req.user = {
        id: TEST_USER_ID,
        email: 'test@manwah.com',
        role: 'admin'
      };
      return next();
    }
    return next(new AppError('未提供有效的登录凭证', 401, 'UNAUTHORIZED'));
  } catch (err) {
    next(err);
  }
}

export async function optionalAuthenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    const xUserUuid = 
      (req.headers['x-user-uuid'] as string | undefined) || 
      (req.headers['x-user-id'] as string | undefined) ||
      (req.headers['x-employee-id'] as string | undefined) ||
      (req.body && (req.body.userUuid || req.body.userId || req.body.employeeId)) ||
      (req.query && (req.query.userUuid as string || req.query.userId as string));

    if (token) {
      try {
        const { data } = await supabaseAdmin.auth.getUser(token);
        const user = data?.user;
        if (user && isValidUuid(user.id)) {
          const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('role, dept_id')
            .eq('id', user.id)
            .single();

          if (!profileError && profile) {
            const allowedRoles = new Set(['user', 'dept_admin', 'admin']);
            req.user = {
              id: user.id,
              email: user.email,
              role: allowedRoles.has(profile.role) ? profile.role : 'user',
              departmentId: profile.dept_id || undefined
            };
          } else {
            req.user = {
              id: user.id,
              email: user.email,
              role: 'user'
            };
          }
        }
      } catch (tokenErr) {
        // Token error ignored, fallback to xUserUuid
      }
    }

    if (!req.user && xUserUuid) {
      try {
        const isUuid = isValidUuid(xUserUuid);
        let profileQuery = supabaseAdmin.from('profiles').select('id, role, dept_id, email, username');
        if (isUuid) {
          profileQuery = profileQuery.eq('id', xUserUuid);
        } else {
          profileQuery = profileQuery.or(`employee_id.eq.${xUserUuid},username.eq.${xUserUuid}`);
        }

        const { data: profile } = await profileQuery.maybeSingle();

        const allowedRoles = new Set(['user', 'dept_admin', 'admin']);
        req.user = {
          id: profile?.id || xUserUuid,
          email: profile?.email || 'user@manwah.com',
          role: profile && allowedRoles.has(profile.role) ? profile.role : 'user',
          departmentId: profile?.dept_id || undefined
        };
      } catch (profileErr) {
        req.user = {
          id: xUserUuid,
          email: 'user@manwah.com',
          role: 'user'
        };
      }
    }

    if (!req.user && (process.env.ALLOW_TEST_IDENTITY === 'true' || process.env.NODE_ENV !== 'production')) {
      req.user = {
        id: TEST_USER_ID,
        email: 'test@manwah.com',
        role: 'user'
      };
    }
    next();
  } catch {
    if (!req.user && (process.env.ALLOW_TEST_IDENTITY === 'true' || process.env.NODE_ENV !== 'production')) {
      req.user = {
        id: TEST_USER_ID,
        email: 'test@manwah.com',
        role: 'user'
      };
    }
    next();
  }
}

