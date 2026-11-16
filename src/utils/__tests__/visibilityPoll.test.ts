import { afterEach, describe, expect, it, vi } from 'vitest';
import { startVisibilityPoll, __markUserActivity, __setLastActivity } from '../visibilityPoll';
import { VideoGenerationService } from '../../services/videoGenerationService';

function fakeDocument(state: 'visible' | 'hidden') {
  __setLastActivity(Date.now());
  const listeners: Array<() => void> = [];
  const doc: any = {
    visibilityState: state,
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    removeEventListener: () => {},
    fire: () => listeners.forEach(fn => fn())
  };
  vi.stubGlobal('document', doc);
  return doc;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('startVisibilityPoll', () => {
  it('前台按 tick 返回的间隔轮询', async () => {
    vi.useFakeTimers();
    fakeDocument('visible');
    const tick = vi.fn(async () => 1000);
    const stop = startVisibilityPoll(tick);
    await vi.advanceTimersByTimeAsync(3500);
    expect(tick).toHaveBeenCalledTimes(4); // 0, 1000, 2000, 3000
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(tick).toHaveBeenCalledTimes(4);
  });

  it('后台不拉，回到前台立即拉一次', async () => {
    vi.useFakeTimers();
    const doc = fakeDocument('hidden');
    const tick = vi.fn(async () => 1000);
    const stop = startVisibilityPoll(tick);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(tick).not.toHaveBeenCalled();
    doc.visibilityState = 'visible';
    doc.fire();
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe('用户闲置', () => {
  it('超过 2 分钟没操作就停，一有操作立即拉', async () => {
    vi.useFakeTimers();
    fakeDocument('visible');
    __setLastActivity(Date.now());
    const tick = vi.fn(async () => 30_000);
    const stop = startVisibilityPoll(tick);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    // 0、30、60、90、120 秒各一次；之后闲置不再拉
    expect(tick.mock.calls.length).toBeLessThanOrEqual(5);
    const before = tick.mock.calls.length;
    __markUserActivity();
    await vi.advanceTimersByTimeAsync(0);
    expect(tick.mock.calls.length).toBe(before + 1);
    stop();
  });

  it('evenIfIdle 时闲置也继续拉（视频任务进行中）', async () => {
    vi.useFakeTimers();
    fakeDocument('visible');
    __setLastActivity(Date.now() - 10 * 60_000);
    const tick = vi.fn(async () => ({ delay: 3_000, evenIfIdle: true }));
    const stop = startVisibilityPoll(tick);
    // 第一次跑之前还不知道有任务：闲置时第一次也会被跳过，所以先模拟一次操作
    __markUserActivity();
    await vi.advanceTimersByTimeAsync(0);
    __setLastActivity(Date.now() - 10 * 60_000);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(tick.mock.calls.length).toBeGreaterThanOrEqual(4);
    stop();
  });
});

describe('fetchCanvasJobs', () => {
  it('同一画布并发请求合并成一个', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ jobs: [{ id: 'a' }] }) }));
    vi.stubGlobal('fetch', fetchMock);
    const [a, b, c] = await Promise.all([
      VideoGenerationService.fetchCanvasJobs('c1'),
      VideoGenerationService.fetchCanvasJobs('c1'),
      VideoGenerationService.fetchCanvasJobs('c1')
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(c).toEqual([{ id: 'a' }]);
  });

  it('空闲 60 秒、有任务 3 秒', () => {
    expect(VideoGenerationService.nextJobsPollDelay(false)).toBe(60_000);
    expect(VideoGenerationService.nextJobsPollDelay(true)).toBe(3_000);
  });
});
