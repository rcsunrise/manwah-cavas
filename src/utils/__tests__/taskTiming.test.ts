import { describe, expect, it } from 'vitest';
import { advanceTaskTiming, formatDuration, startTaskTiming, stepLabel } from '../taskTiming';
import type { AgentTaskCard } from '../../types/creativeCanvas';

describe('taskTiming', () => {
  it('formats durations', () => {
    expect(formatDuration(8200)).toBe('8.2秒');
    expect(formatDuration(45_000)).toBe('45秒');
    expect(formatDuration(92_000)).toBe('1分32秒');
    expect(formatDuration(120_000)).toBe('2分');
  });

  it('shortens step labels', () => {
    expect(stepLabel('1/3 构思命名、场景与细节文案…')).toBe('1/3 构思命名、场景与细节文案');
    expect(stepLabel('2/3 「云栖」：一段说明\n正在生成主场景底图（约 1–3 分钟）…')).toBe('2/3 正在生成主场景底图');
  });

  it('records each step and the total', () => {
    let card: AgentTaskCard = startTaskTiming({ title: 't', status: 'running', detail: '1/3 构思…' }, 0);
    card = advanceTaskTiming(card, { ...card, detail: '2/3 生成底图…' }, 5_000);
    card = advanceTaskTiming(card, { ...card, detail: '3/3 排版…' }, 65_000);
    card = advanceTaskTiming(card, { ...card, status: 'done', detail: '完成' }, 70_000);
    expect(card.steps).toEqual([
      { label: '1/3 构思', ms: 5_000 },
      { label: '2/3 生成底图', ms: 60_000 },
      { label: '3/3 排版', ms: 5_000 }
    ]);
    expect(card.finishedAt! - card.startedAt!).toBe(70_000);
  });

  it('leaves old cards without timing untouched', () => {
    const old: AgentTaskCard = { title: 't', status: 'running', detail: 'x' };
    const next = advanceTaskTiming(old, { ...old, status: 'done' }, 1);
    expect(next.finishedAt).toBeUndefined();
  });
});
