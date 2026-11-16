import type { AgentTaskCard } from '../types/creativeCanvas';

/** 毫秒 → “8.2秒” / “1分32秒” */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}秒`;
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}秒`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s ? `${m}分${s}秒` : `${m}分`;
}

/** 步骤说明 → 简短标签：“2/3 「名」：…\n正在生成主场景底图（约 1–3 分钟）…” → “2/3 正在生成主场景底图” */
export function stepLabel(detail: string): string {
  const text = String(detail || '').trim();
  const marker = text.match(/^(\d+\/\d+)/)?.[1];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let body = (lines.length > 1 ? lines[lines.length - 1] : lines[0] || '')
    .replace(/^\d+\/\d+\s*/, '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[…。.]+$/, '')
    .trim();
  if (body.length > 20) body = body.slice(0, 20) + '…';
  return marker ? `${marker} ${body}`.trim() : body || '执行';
}

/** 新建任务卡时打上开始时间 */
export function startTaskTiming(card: AgentTaskCard, now = Date.now()): AgentTaskCard {
  return { ...card, startedAt: card.startedAt ?? now, stepStartedAt: card.stepStartedAt ?? now, steps: card.steps ?? [] };
}

/**
 * 任务卡更新：步骤说明变了就把上一步耗时记下来；结束（非 running）时记最后一步和总结束时间。
 * 老消息没有 startedAt 时不做任何记录。
 */
export function advanceTaskTiming(prev: AgentTaskCard, next: AgentTaskCard, now = Date.now()): AgentTaskCard {
  if (typeof prev.startedAt !== 'number' || prev.status !== 'running') return next;
  const steps = [...(prev.steps || [])];
  const stepStart = prev.stepStartedAt ?? prev.startedAt;
  const detailChanged = (next.detail ?? '') !== (prev.detail ?? '');
  const finished = next.status !== 'running';
  const out: AgentTaskCard = { ...next, startedAt: prev.startedAt, steps, stepStartedAt: prev.stepStartedAt };
  if ((detailChanged || finished) && prev.detail) {
    steps.push({ label: stepLabel(prev.detail), ms: now - stepStart });
    out.stepStartedAt = now;
  }
  if (finished) out.finishedAt = now;
  return out;
}
