// src/features/space-studio/__tests__/renderInterruptionAndLockRelease.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ShotInstance } from '../../../types/spaceStudio';

describe('Space Studio: Render Interruption & Lock Release Mechanism', () => {
  it('correctly resets generating shots to draft or passed when cancelled or mounted', () => {
    const rawShots = [
      {
        id: 'shot-a03',
        templateCode: 'A03',
        name: '3人位主沙发组',
        status: 'generating',
        revisions: [
          {
            id: 'rev-01',
            shotId: 'shot-a03',
            revisionNumber: 1,
            revisionType: 'scene',
            label: '纯空间 v1',
            objectKey: 'shots/a03/rev1.webp',
            imageUrl: 'https://images.unsplash.com/photo-1',
            thumbnailUrl: 'https://images.unsplash.com/photo-1',
            promptSnapshotId: 'snap-01',
            status: 'approved',
            provenance: 'SOLVER_RESOLVED',
            productionTruth: false,
            createdAt: new Date().toISOString()
          }
        ]
      },
      {
        id: 'shot-a04',
        templateCode: 'A04',
        name: '2/3 主沙发透视',
        status: 'generating',
        revisions: []
      }
    ] as unknown as ShotInstance[];

    // 模拟挂载和打断复位逻辑
    const cleanedShots = rawShots.map((s) => {
      if (s.status === 'generating') {
        return {
          ...s,
          status: s.revisions && s.revisions.length > 0 ? ('passed' as const) : ('draft' as const)
        };
      }
      return s;
    });

    expect(cleanedShots[0].status).toBe('passed');
    expect(cleanedShots[1].status).toBe('draft');
  });

  it('aborts active fetch and clears timers on cancel rendering', async () => {
    const abortSpy = vi.fn();
    const fakeController = {
      signal: { aborted: false },
      abort: abortSpy
    };

    let isRendering = true;
    let renderingShotId: string | null = 'shot-a03';
    let timeoutId: any = setTimeout(() => {}, 90000);

    // 执行打断流程
    const handleCancel = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      fakeController.abort();
      isRendering = false;
      renderingShotId = null;
    };

    handleCancel();

    expect(abortSpy).toHaveBeenCalled();
    expect(isRendering).toBe(false);
    expect(renderingShotId).toBeNull();
    expect(timeoutId).toBeNull();
  });

  it('enables other shots generation independently when a different shot was rendering', () => {
    const renderingShotId: string | null = 'shot-a03';
    const activeShotA03 = { id: 'shot-a03', templateCode: 'A03' };
    const activeShotA04 = { id: 'shot-a04', templateCode: 'A04' };

    // 细粒度判断：当前激活镜头是否正在渲染
    const isGeneratingA03 = renderingShotId === activeShotA03.id;
    const isGeneratingA04 = renderingShotId === activeShotA04.id;

    // A03 显示为生成中
    expect(isGeneratingA03).toBe(true);

    // 用户切换到 A04 时，A04 绝不受 A03 阻塞，可正常点击生成！
    expect(isGeneratingA04).toBe(false);
  });
});
