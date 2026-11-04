import { describe, expect, it } from 'vitest';
import { extractAgentActions, stripAgentActions } from '../agentActionProtocol';

describe('agentActionProtocol', () => {
  it('parses a plan block and strips it from the visible text', () => {
    const text = '好的，把详情页扩到 8 屏。\n<agent_actions>{"plan": {"actionId": "generate_plan", "params": {"screenCount": 8}}, "suggestions": [{"label": "批量渲染", "actionId": "render_all"}]}</agent_actions>';
    const result = extractAgentActions(text);
    expect(result.text).toBe('好的，把详情页扩到 8 屏。');
    expect(result.planCard?.actionId).toBe('generate_plan');
    expect(result.planCard?.params?.screenCount).toBe(8);
    expect(result.planCard?.status).toBe('pending');
    expect(result.suggestions?.[0].actionId).toBe('render_all');
  });

  it('prefers clarify over plan and drops options without an action or prompt', () => {
    const text = '要重做哪一屏？<agent_actions>{"clarify": {"question": "要重做哪一屏？", "options": [{"label": "第 2 屏", "actionId": "replan_screen", "params": {"screenIndex": 2}}, {"label": "空选项"}]}, "plan": {"actionId": "render_all"}}</agent_actions>';
    const result = extractAgentActions(text);
    expect(result.clarifyCard?.options).toHaveLength(1);
    expect(result.clarifyCard?.options[0].params?.screenIndex).toBe(2);
    expect(result.planCard).toBeUndefined();
  });

  it('ignores unknown actions, invalid params and malformed JSON', () => {
    expect(extractAgentActions('hi <agent_actions>{"plan": {"actionId": "delete_all"}}</agent_actions>').planCard).toBeUndefined();
    expect(extractAgentActions('hi <agent_actions>{"plan": {"actionId": "render_screen"}}</agent_actions>').planCard).toBeUndefined();
    expect(extractAgentActions('hi <agent_actions>{"plan": {"actionId": "generate_plan", "params": {"screenCount": 99}}}</agent_actions>').planCard?.params).toBeUndefined();
    expect(extractAgentActions('hi <agent_actions>{oops</agent_actions>')).toEqual({ text: 'hi' });
  });

  it('accepts a fenced JSON block inside the tags', () => {
    const result = extractAgentActions('ok<agent_actions>```json\n{"suggestions": [{"label": "写文案", "prompt": "写卖点文案"}]}\n```</agent_actions>');
    expect(result.suggestions?.[0].prompt).toBe('写卖点文案');
  });

  it('tolerates stray characters around the JSON (seen from gemini)', () => {
    const text = '收到。<agent_actions>{"plan": {"actionId": "generate_plan", "params": {"screenCount": 6, "aspectRatio": "3:4"}}}></agent_actions>';
    const result = extractAgentActions(text);
    expect(result.planCard?.params).toEqual({ screenCount: 6, aspectRatio: '3:4' });
  });

  it('hides partially streamed tags', () => {
    expect(stripAgentActions('正文<agent_ac')).toBe('正文');
    expect(stripAgentActions('正文<agent_actions>{"pla')).toBe('正文');
    expect(stripAgentActions('a < b')).toBe('a < b');
  });
});
