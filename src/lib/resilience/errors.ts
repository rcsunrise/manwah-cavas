/**
 * Supabase and API Error Classification
 * Classifies errors into schema, auth, rate-limit, service-unavailable, not-found, validation, or network.
 * Prevents non-retryable errors (e.g. Postgres 42703, 401, 403, 404) from causing retry loops.
 */

export type FailureKind =
  | 'schema'
  | 'auth'
  | 'rate-limit'
  | 'service-unavailable'
  | 'network'
  | 'not-found'
  | 'validation'
  | 'unknown';

export interface ClassifiedFailure {
  kind: FailureKind;
  retryable: boolean;
  status?: number;
  code?: string;
  message: string;
}

export function classifySupabaseError(error: unknown): ClassifiedFailure {
  if (!error) {
    return { kind: 'unknown', retryable: false, message: 'Unknown error' };
  }

  const value = error as {
    code?: string;
    message?: string;
    status?: number;
    statusCode?: number;
    error_description?: string;
    name?: string;
  };

  const code = value?.code;
  const status = value?.status || value?.statusCode;
  const message = value?.message || value?.error_description || 'Unknown Supabase error';

  // 1. PostgreSQL 42703: undefined_column, 42P01: undefined_table, PGRST205: relation not found -> STRICTLY NON-RETRYABLE
  if (
    code === '42703' ||
    code === '42P01' ||
    code === 'PGRST205' ||
    status === 404 ||
    message.includes('undefined_column') ||
    message.includes('undefined_table') ||
    message.includes('does not exist') ||
    message.includes('Could not find the')
  ) {
    return {
      kind: 'schema',
      retryable: false,
      code: code || (status === 404 ? '404' : '42P01'),
      status: status || 404,
      message: `Schema/Table Missing Error: ${message}`
    };
  }

  // 2. Authentication and Authorization
  if (status === 401 || status === 403 || code === 'PGRST301' || code === '42501') {
    return { kind: 'auth', retryable: false, code, status, message };
  }

  // 3. Not Found (HTTP 404 / PGRST116 / NOT_FOUND) -> STRICTLY NON-RETRYABLE
  if (status === 404 || code === 'PGRST116' || code === 'NOT_FOUND') {
    return { kind: 'not-found', retryable: false, code, status, message };
  }

  // 4. Rate Limiting (429) -> Retryable with backoff
  if (status === 429 || code === '429' || message.includes('rate limit')) {
    return { kind: 'rate-limit', retryable: true, code, status, message };
  }

  // 5. Service Unavailable (502, 503, 504) -> Retryable with backoff and circuit breaker
  if (status === 502 || status === 503 || status === 504 || message.includes('503') || message.includes('502')) {
    return {
      kind: 'service-unavailable',
      retryable: true,
      code,
      status: status || 503,
      message
    };
  }

  // 6. Network / Fetch / Timeout / Connection Reset -> Retryable
  if (
    error instanceof TypeError ||
    value.name === 'FetchError' ||
    value.name === 'AbortError' ||
    /network|fetch|timeout|econnrefused|econnreset|etimedout|socket hang up/i.test(message)
  ) {
    return { kind: 'network', retryable: true, code, status, message };
  }

  // 7. Validation / Bad Request (400) -> Non-retryable
  if (status === 400 || code === '22P02' || code === '23502') {
    return { kind: 'validation', retryable: false, code, status, message };
  }

  return { kind: 'unknown', retryable: false, code, status, message };
}
