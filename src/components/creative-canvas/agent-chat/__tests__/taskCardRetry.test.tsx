import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentMessageCards, isTransientTaskError } from '../AgentMessageCards';
import type { AgentMessage } from '../../../../types/creativeCanvas';

const render = (taskCard: AgentMessage['taskCard'], withRetry = true) =>
  renderToStaticMarkup(
    React.createElement(AgentMessageCards as any, {
      message: { id: 'm', sender: 'agent', text: '', timestamp: '', taskCard },
      onChooseOption: () => {},
      onConfirmPlan: () => {},
      onCancelPlan: () => {},
      onAdjustPlan: () => {},
      ...(withRetry ? { onRetryTask: () => {} } : {})
    })
  );

describe('失败任务卡：提示并允许重试', () => {
  it('网络中断的失败显示“再试一次”提示和重试按钮', () => {
    const html = render({
      title: '修改画面',
      status: 'failed',
      detail: 'gemini-nano-banana-2.1-preview 改字失败：fetch failed (UND_ERR_SOCKET)',
      retry: { actionId: 'edit_image', params: { instruction: '换面料' } }
    });
    expect(html).toContain('重试');
    expect(html).toContain('一般再试一次即可');
    expect(html).not.toContain('继续尝试');
  });
  it('没有记下动作的失败卡提示在对话里发送“继续尝试”', () => {
    const html = render({ title: '旧任务', status: 'failed', detail: '提示词不合规' });
    expect(html).toContain('继续尝试');
    expect(html).not.toContain('>重试<');
  });
  it('成功的卡片不显示重试', () => {
    const html = render({ title: 'ok', status: 'done', retry: { actionId: 'edit_image' } });
    expect(html).not.toContain('重试');
  });
  it('识别临时性错误', () => {
    expect(isTransientTaskError('fetch failed (UND_ERR_SOCKET)')).toBe(true);
    expect(isTransientTaskError('远程图片下载失败（HTTP 502）')).toBe(true);
    expect(isTransientTaskError('提示词不合规')).toBe(false);
  });
});

describe('选哪张产品图：带缩略图的选项', () => {
  it('每张产品图显示缩略图和名称', () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentMessageCards as any, {
        message: {
          id: 'm2',
          sender: 'agent',
          text: '',
          timestamp: '',
          clarifyCard: {
            question: '点选要用的产品图：',
            options: [
              { label: '主产品图 · 极境', imageUrl: 'https://x/a.jpg', actionId: 'template_poster', params: { nodeId: 'img-node-1' }, confirmed: true },
              { label: '产品图 2', imageUrl: 'https://x/b.jpg', actionId: 'template_poster', params: { nodeId: 'n2' }, confirmed: true }
            ]
          }
        },
        onChooseOption: () => {},
        onConfirmPlan: () => {},
        onCancelPlan: () => {},
        onAdjustPlan: () => {}
      })
    );
    expect(html).toContain('https://x/a.jpg');
    expect(html).toContain('https://x/b.jpg');
    expect(html).toContain('主产品图 · 极境');
    expect(html).toContain('产品图 2');
  });
});
