/**
 * 按字节数封顶的 LRU 缓存（常驻内存的大图缓存用）。
 * 以前画布图片、SKU 图片的 dataUrl 读写一次就永久留在内存里，服务跑久了、看过的图多了，
 * 内存只涨不降，最后 Node 堆内存打满崩溃。超出上限时先淘汰最久没用的；数据在磁盘上还有一份，
 * 需要时会重新读入。
 */
export class BoundedCache<V> {
  private map = new Map<string, { value: V; bytes: number }>();
  private total = 0;

  constructor(
    private readonly maxBytes: number,
    private readonly sizeOf: (value: V) => number,
    private readonly maxEntries = Infinity
  ) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    // 访问即移到末尾（最近使用）
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  set(key: string, value: V): this {
    const bytes = Math.max(0, this.sizeOf(value) || 0);
    const old = this.map.get(key);
    if (old) {
      this.total -= old.bytes;
      this.map.delete(key);
    }
    // 单个就超过上限的不进缓存（磁盘上还有）
    if (bytes > this.maxBytes) return this;
    this.map.set(key, { value, bytes });
    this.total += bytes;
    while ((this.total > this.maxBytes || this.map.size > this.maxEntries) && this.map.size > 0) {
      const oldestKey = this.map.keys().next().value as string;
      const oldest = this.map.get(oldestKey)!;
      this.map.delete(oldestKey);
      this.total -= oldest.bytes;
    }
    return this;
  }

  delete(key: string): boolean {
    const hit = this.map.get(key);
    if (!hit) return false;
    this.total -= hit.bytes;
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
    this.total = 0;
  }

  get size(): number {
    return this.map.size;
  }

  get bytes(): number {
    return this.total;
  }

  keys(): IterableIterator<string> {
    return this.map.keys();
  }

  values(): V[] {
    return Array.from(this.map.values(), x => x.value);
  }
}

/** 字符串按 UTF-16 粗估字节；dataUrl 这类 ASCII 实际占用约等于长度 × 2 */
export function approxStringBytes(s: unknown): number {
  return typeof s === 'string' ? s.length * 2 : 0;
}
