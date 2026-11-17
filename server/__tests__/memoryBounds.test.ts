import { describe, expect, it } from 'vitest';
import { approxStringBytes, BoundedCache } from '../lib/boundedCache';

describe('BoundedCache', () => {
  it('超过字节上限时淘汰最久没用的', () => {
    const cache = new BoundedCache<string>(10, s => s.length);
    cache.set('a', '1234');
    cache.set('b', '1234');
    cache.get('a'); // a 变成最近使用
    cache.set('c', '1234'); // 12 > 10，淘汰最久没用的 b
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
    expect(cache.bytes).toBe(8);
  });

  it('单个超过上限的不进缓存', () => {
    const cache = new BoundedCache<string>(5, s => s.length);
    cache.set('big', '123456');
    expect(cache.has('big')).toBe(false);
    expect(cache.bytes).toBe(0);
  });

  it('按条数封顶', () => {
    const cache = new BoundedCache<string>(Number.MAX_SAFE_INTEGER, () => 1, 2);
    cache.set('a', 'x').set('b', 'x').set('c', 'x');
    expect(cache.size).toBe(2);
    expect(cache.has('a')).toBe(false);
  });

  it('覆盖同一个 key 时字节数正确', () => {
    const cache = new BoundedCache<string>(100, s => s.length);
    cache.set('a', '1234');
    cache.set('a', '12');
    expect(cache.bytes).toBe(2);
    cache.delete('a');
    expect(cache.bytes).toBe(0);
  });

  it('dataUrl 按长度 × 2 估算', () => {
    expect(approxStringBytes('data:image/png;base64,AAAA')).toBe(52);
    expect(approxStringBytes(undefined)).toBe(0);
  });
});
