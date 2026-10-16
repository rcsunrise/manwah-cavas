// src/features/space-studio/__tests__/concurrentShotGeneration.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('Space Studio: Multi-Shot Concurrent Generation Engine', () => {
  it('allows multiple shots to be rendered concurrently without mutual locking', () => {
    let renderingShotIds: string[] = [];

    // 模拟启动 A01 渲染
    renderingShotIds = Array.from(new Set([...renderingShotIds, 'shot-a01']));
    expect(renderingShotIds).toContain('shot-a01');
    expect(renderingShotIds.length).toBe(1);

    // 在 A01 渲染期间，用户切换到 A02 并启动 A02 渲染（并发）
    renderingShotIds = Array.from(new Set([...renderingShotIds, 'shot-a02']));
    expect(renderingShotIds).toContain('shot-a01');
    expect(renderingShotIds).toContain('shot-a02');
    expect(renderingShotIds.length).toBe(2);

    // 细粒度状态判断：两个机位各自的独立状态
    const activeShotA01 = { id: 'shot-a01', templateCode: 'A01' };
    const activeShotA02 = { id: 'shot-a02', templateCode: 'A02' };
    const activeShotA03 = { id: 'shot-a03', templateCode: 'A03' };

    expect(renderingShotIds.includes(activeShotA01.id)).toBe(true);
    expect(renderingShotIds.includes(activeShotA02.id)).toBe(true);
    expect(renderingShotIds.includes(activeShotA03.id)).toBe(false);
  });

  it('cancels specific shot independently without interrupting other active jobs', () => {
    const controllers = new Map<string, { abort: (reason?: any) => void }>();
    let renderingShotIds = ['shot-a01', 'shot-a02'];

    const abortA01 = vi.fn();
    const abortA02 = vi.fn();
    controllers.set('shot-a01', { abort: abortA01 });
    controllers.set('shot-a02', { abort: abortA02 });

    // 用户仅打断 A01
    const targetShotIdToCancel = 'shot-a01';
    const ctrl = controllers.get(targetShotIdToCancel);
    if (ctrl) {
      ctrl.abort();
      controllers.delete(targetShotIdToCancel);
    }
    renderingShotIds = renderingShotIds.filter((id) => id !== targetShotIdToCancel);

    // 校验：A01 被取消，A02 依然在执行
    expect(abortA01).toHaveBeenCalled();
    expect(abortA02).not.toHaveBeenCalled();
    expect(renderingShotIds).not.toContain('shot-a01');
    expect(renderingShotIds).toContain('shot-a02');
    expect(renderingShotIds.length).toBe(1);
  });

  it('runs batch generation in a concurrent pool (e.g. max 3 concurrency)', async () => {
    const executedShots: string[] = [];
    let currentActive = 0;
    let maxSimultaneous = 0;

    const mockRender = async (shotCode: string) => {
      currentActive++;
      maxSimultaneous = Math.max(maxSimultaneous, currentActive);
      await new Promise((r) => setTimeout(r, 20));
      executedShots.push(shotCode);
      currentActive--;
    };

    const shots = ['A01', 'A02', 'A03', 'A04', 'A05'];
    const concurrency = 3;
    const queue = [...shots];
    const executing: Promise<any>[] = [];

    for (const shot of queue) {
      const p = mockRender(shot).then(() => {
        const idx = executing.indexOf(p);
        if (idx !== -1) executing.splice(idx, 1);
      });
      executing.push(p);
      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }
    }
    await Promise.all(executing);

    expect(executedShots.length).toBe(5);
    expect(maxSimultaneous).toBeLessThanOrEqual(concurrency);
  });
});
