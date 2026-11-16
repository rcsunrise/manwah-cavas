import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentMessageCards } from '../AgentMessageCards';
import type { AgentMessage } from '../../../../types/creativeCanvas';

const render = (taskCard: AgentMessage['taskCard']) =>
  renderToStaticMarkup(
    React.createElement(AgentMessageCards as any, {
      message: { id: 'm', sender: 'agent', text: '', timestamp: '', taskCard },
      onChooseOption: () => {},
      onConfirmPlan: () => {},
      onCancelPlan: () => {}
    })
  );

describe('任务卡耗时显示', () => {
  it('完成后显示总耗时和各步骤耗时', () => {
    const html = render({
      title: '模板 A 海报',
      status: 'done',
      detail: '完成',
      startedAt: 1_000,
      finishedAt: 93_000,
      steps: [
        { label: '1/3 构思命名、场景与细节文案', ms: 8_200 },
        { label: '2/3 正在生成主场景底图', ms: 75_000 },
        { label: '3/3 定位细节部位并排版', ms: 8_800 }
      ]
    });
    expect(html).toContain('总耗时 1分32秒');
    expect(html).toContain('2/3 正在生成主场景底图');
    expect(html).toContain('1分15秒');
    expect(html).toContain('8.2秒');
  });

  it('执行中显示已用时间', () => {
    const html = render({ title: 't', status: 'running', detail: '1/3 构思…', startedAt: Date.now() - 3_000, steps: [] });
    expect(html).toMatch(/已用 3\.\d秒/);
  });

  it('旧消息没有时间戳时不显示', () => {
    expect(render({ title: 't', status: 'done', detail: 'x' })).not.toContain('耗时');
  });
});
