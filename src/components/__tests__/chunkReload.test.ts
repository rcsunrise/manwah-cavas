import { describe, expect, it, beforeEach } from 'vitest';
import { autoReloadAllowed, isChunkLoadError } from '../RouteErrorBoundary';

describe('模块加载失败自动刷新', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    (globalThis as any).sessionStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => (store[k] = v),
      removeItem: (k: string) => delete store[k]
    };
  });
  it('识别各浏览器的模块加载失败', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: http://x/a.js'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 42 failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
  });
  it('1 分钟内只自动刷新一次', () => {
    expect(autoReloadAllowed(1_000_000)).toBe(true);
    expect(autoReloadAllowed(1_030_000)).toBe(false);
    expect(autoReloadAllowed(1_070_000)).toBe(true);
  });
});
