import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/supabaseClient', () => ({ supabaseAdmin: {} }));

describe('本机副本比数据库新时优先', async () => {
  const { isNewerLocalCopy } = await import('../routes/canvasRoutes');
  it('断线期间只落在本机的保存更晚 → 用本机副本', () => {
    expect(isNewerLocalCopy({ last_saved_at: '2026-11-19T07:18:00.000Z' }, { last_saved_at: '2026-11-19T10:31:55.092+08:00' })).toBe(true);
  });
  it('数据库同一次保存（时间相同或更新）→ 用数据库', () => {
    expect(isNewerLocalCopy({ last_saved_at: '2026-11-19T07:18:00.000Z' }, { last_saved_at: '2026-11-19T07:18:00.500Z' })).toBe(false);
    expect(isNewerLocalCopy({ last_saved_at: '2026-11-19T07:18:00.000Z' }, { updated_at: '2026-11-19T15:20:00+08:00' })).toBe(false);
    expect(isNewerLocalCopy({}, { last_saved_at: '2026-11-19T07:18:00.000Z' })).toBe(false);
  });
});

describe('同一项目查出多行画布时取对的那一行', async () => {
  const { pickCanvasRow } = await import('../routes/canvasRoutes');
  const stale = { id: 'a662', updated_at: '2026-11-19T10:31:55+08:00' };
  const real = { id: '544b', updated_at: '2026-11-19T16:00:01+08:00' };
  it('id 完全匹配的优先（不管排在第几）', () => {
    expect(pickCanvasRow([stale, real], '544b')).toBe(real);
    expect(pickCanvasRow([real, { id: 'x', updated_at: '2026-12-01T00:00:00Z' }], '544b')).toBe(real);
  });
  it('没有 id 匹配时取最近更新的', () => {
    expect(pickCanvasRow([stale, { ...real, id: 'zz' }], '544b')?.id).toBe('zz');
    expect(pickCanvasRow([], '544b')).toBeNull();
  });
});
