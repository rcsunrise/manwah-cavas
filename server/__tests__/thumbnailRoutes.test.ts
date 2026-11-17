import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pickThumbWidth, resolveThumbSource } from '../routes/thumbnailRoutes';
import { isThumbnailable, toThumbnailUrl } from '../../src/utils/thumbnailUrl';

const SB = 'https://abcd1234.supabase.co';

describe('缩略图来源白名单', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.SUPABASE_URL = SB;
    process.env.GCS_GENERATED_BUCKET = 'my-generated';
    delete process.env.GCS_ASSET_BUCKET;
    delete process.env.GCS_EXPORT_BUCKET;
    delete process.env.GCS_VIDEO_BUCKET;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('本项目 Supabase Storage 公开地址可取', () => {
    const r = resolveThumbSource(`${SB}/storage/v1/object/public/creative-canvas-assets/a/b.png`);
    expect(r?.kind).toBe('url');
    expect((r as any).fetchUrl).toBe(`${SB}/storage/v1/object/public/creative-canvas-assets/a/b.png`);
  });

  it('经本站代理的 Supabase 地址改写到上游，失败回跳只用相对路径', () => {
    const r = resolveThumbSource('https://evil.example/api/supabase-proxy/storage/v1/object/public/x/y.png');
    expect((r as any).fetchUrl).toBe(`${SB}/storage/v1/object/public/x/y.png`);
    expect(r?.fallbackUrl).toBe('/api/supabase-proxy/storage/v1/object/public/x/y.png');
  });

  it('Supabase 的非存储接口不允许（不能拿来读数据库）', () => {
    expect(resolveThumbSource(`${SB}/rest/v1/profiles?select=*`)).toBeNull();
    expect(resolveThumbSource('/api/supabase-proxy/rest/v1/profiles')).toBeNull();
    expect(resolveThumbSource(`${SB}/storage/v1/object/../../rest/v1/x`)).toBeNull();
  });

  it('只允许本项目的 GCS 桶，签名参数不进缓存键', () => {
    const a = resolveThumbSource('https://storage.googleapis.com/my-generated/k/1.png?X-Goog-Signature=aaa');
    const b = resolveThumbSource('https://storage.googleapis.com/my-generated/k/1.png?X-Goog-Signature=bbb');
    expect(a?.cacheKey).toBe(b?.cacheKey);
    expect(resolveThumbSource('https://my-generated.storage.googleapis.com/k/1.png')?.kind).toBe('url');
    expect(resolveThumbSource('https://storage.googleapis.com/someone-else/k/1.png')).toBeNull();
    expect(resolveThumbSource('https://someone-else.storage.googleapis.com/k/1.png')).toBeNull();
  });

  it('其它网站、内网地址、非 https 一律拒绝', () => {
    expect(resolveThumbSource('https://example.com/a.png')).toBeNull();
    expect(resolveThumbSource('http://169.254.169.254/latest/meta-data')).toBeNull();
    expect(resolveThumbSource('http://storage.googleapis.com/my-generated/a.png')).toBeNull();
    expect(resolveThumbSource('file:///etc/passwd')).toBeNull();
    expect(resolveThumbSource('')).toBeNull();
  });

  it('不存在的本站画布资源返回 null', () => {
    expect(resolveThumbSource('/api/canvases/assets/does-not-exist-xyz')).toBeNull();
    expect(resolveThumbSource('/api/canvases/assets/..%2Fsecret')).toBeNull();
  });
});

describe('缩略图宽度', () => {
  it('取不小于请求宽度的档位，非法值用默认 768', () => {
    expect(pickThumbWidth('300')).toBe(512);
    expect(pickThumbWidth(768)).toBe(768);
    expect(pickThumbWidth(5000)).toBe(1024);
    expect(pickThumbWidth('abc')).toBe(768);
    expect(pickThumbWidth(undefined)).toBe(768);
  });
});

describe('前端缩略图地址', () => {
  it('云存储和本站资源改写成 /api/thumb', () => {
    const u = `${SB}/storage/v1/object/public/b/x.png`;
    expect(toThumbnailUrl(u)).toBe(`/api/thumb?w=768&src=${encodeURIComponent(u)}`);
    expect(isThumbnailable('/api/canvases/assets/abc')).toBe(true);
    expect(isThumbnailable('https://storage.googleapis.com/b/x.jpg?sig=1')).toBe(true);
  });

  it('data:/blob:/svg/gif/外站/已是缩略图 的原样返回', () => {
    for (const u of ['data:image/png;base64,xx', 'blob:http://x/1', `${SB}/storage/v1/object/public/b/x.svg`, `${SB}/storage/v1/object/public/b/x.gif`, 'https://example.com/a.png', '/api/thumb?src=x']) {
      expect(toThumbnailUrl(u)).toBe(u);
    }
  });
});
