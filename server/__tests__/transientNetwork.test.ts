import { describe, expect, it } from 'vitest';
import { isTransientNetworkError } from '../lib/transientNetwork';

describe('isTransientNetworkError', () => {
  it('网络断连算偶发错误（重试同一个模型）', () => {
    expect(isTransientNetworkError(new TypeError('fetch failed'))).toBe(true);
    const e: any = new TypeError('fetch failed');
    e.cause = { code: 'UND_ERR_SOCKET', message: 'other side closed' };
    expect(isTransientNetworkError(e)).toBe(true);
    expect(isTransientNetworkError({ message: 'read ECONNRESET' })).toBe(true);
    expect(isTransientNetworkError(new Error('Client network socket disconnected before secure TLS connection was established'))).toBe(true);
  });

  it('模型没开通、超时、4xx/5xx 不算网络断连', () => {
    expect(isTransientNetworkError(new Error('No available channel for model gemini-3.7-flash'))).toBe(false);
    expect(isTransientNetworkError(new Error('gemini-3.6-flash 超时 75000ms'))).toBe(false);
    expect(isTransientNetworkError(new Error('HTTP 503: upstream unavailable'))).toBe(false);
  });
});
