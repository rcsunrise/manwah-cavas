import { describe, it, expect } from 'vitest';
import { resolveHumanPassAspectRatio, resolveHumanPassBaseRevision } from '../engine/humanPassBase';
import type { ShotRevision } from '../../../types/spaceStudio';

const rev = (id: string, n: number, type: 'scene' | 'human', parent?: string): ShotRevision => ({
  id,
  shotId: 'shot-a08',
  revisionNumber: n,
  parentRevisionId: parent,
  objectKey: `k/${id}`,
  imageUrl: `/img/${id}`,
  promptSnapshotId: id,
  status: 'approved',
  revisionType: type,
  provenance: 'DERIVED',
  productionTruth: false,
  createdAt: '2026-11-03T00:00:00Z'
});

// 复刻 A08 实际生成记录：v4 基于 v3、v7 基于 v6、v8 基于 v7（人物版叠人物版）
const a08Revisions = [
  rev('v8', 8, 'human', 'v7'),
  rev('v7', 7, 'human', 'v6'),
  rev('v6', 6, 'human', 'v2'),
  rev('v5', 5, 'scene', 'v4'),
  rev('v4', 4, 'human', 'v3'),
  rev('v3', 3, 'human', 'v2'),
  rev('v2', 2, 'scene', 'v1'),
  rev('v1', 1, 'scene')
];

describe('人物入座底图回溯', () => {
  it('当前为人物版时回溯到其所基于的纯空间版，不在人物图上叠加', () => {
    expect(resolveHumanPassBaseRevision({ revisions: a08Revisions, currentRevisionId: 'v8' })?.id).toBe('v2');
    expect(resolveHumanPassBaseRevision({ revisions: a08Revisions, currentRevisionId: 'v4' })?.id).toBe('v2');
  });

  it('当前为纯空间版时直接使用', () => {
    expect(resolveHumanPassBaseRevision({ revisions: a08Revisions, currentRevisionId: 'v5' })?.id).toBe('v5');
  });

  it('溯源链断裂时退回最新的无人版本', () => {
    const broken = [rev('h2', 3, 'human', 'missing'), rev('s2', 2, 'scene'), rev('s1', 1, 'scene')];
    expect(resolveHumanPassBaseRevision({ revisions: broken, currentRevisionId: 'h2' })?.id).toBe('s2');
  });

  it('只有人物版时不返回底图', () => {
    expect(resolveHumanPassBaseRevision({ revisions: [rev('h1', 1, 'human')], currentRevisionId: 'h1' })).toBeUndefined();
  });
});

describe('人物入座画幅', () => {
  it('底图与镜头画幅一致时沿用镜头画幅', () => {
    expect(resolveHumanPassAspectRatio('3:4', { width: 1800, height: 2400 })).toBe('3:4');
  });

  it('底图比例不同时跟随底图，避免 4:3 底图被强行出 3:4', () => {
    expect(resolveHumanPassAspectRatio('3:4', { width: 2400, height: 1800 })).toBe('4:3');
    expect(resolveHumanPassAspectRatio('4:3', { width: 683, height: 1024 })).toBe('2:3');
  });

  it('读不到底图尺寸时使用镜头画幅', () => {
    expect(resolveHumanPassAspectRatio('3:4', null)).toBe('3:4');
  });
});

describe('人物入座精简编辑指令', () => {
  it('以底图为编辑对象、只加人，不再出现"主沙发入座"等与单椅底图矛盾的通用指令', async () => {
    const { buildHumanPassEditPrompt } = await import('../../../../server/services/spaceImageGenerationService');
    const prompt = buildHumanPassEditPrompt({
      slotBriefs: '[Character Slot #1 - 男主人]:\n- Designated Position: 单椅 120°',
      personCount: 1,
      charRefCount: 1
    });
    expect(prompt.startsWith('Edit Reference Image 1.')).toBe(true);
    expect(prompt).toContain('Only add ONE person');
    expect(prompt).toContain('Reference Image 2 shows the person of Character Slot #1.');
    expect(prompt).toContain('[Character Slot #1 - 男主人]');
    expect(prompt).toContain('No collage');
    expect(prompt).not.toMatch(/hero sofa/i);
    expect(prompt.length).toBeLessThan(1500);
  });
});

describe('设为当前镜头结果不重复建版', () => {
  it('候选图已在生成记录中时返回该版本', async () => {
    const { findRevisionForCandidate } = await import('../engine/revisionGraphEngine');
    const revs = [rev('v2', 2, 'scene'), rev('v1', 1, 'scene')];
    expect(findRevisionForCandidate(revs, { id: 'x', objectKey: 'k/v1' })?.id).toBe('v1');
    expect(findRevisionForCandidate(revs, { id: 'x', imageUrl: '/img/v2' })?.id).toBe('v2');
    expect(findRevisionForCandidate(revs, { id: 'v2' })?.id).toBe('v2');
    expect(findRevisionForCandidate(revs, { id: 'new', objectKey: 'k/new', imageUrl: '/img/new' })).toBeUndefined();
  });
});
