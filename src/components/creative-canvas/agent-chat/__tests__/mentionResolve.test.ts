import { describe, expect, it } from 'vitest';
import { resolveTypedMentions } from '../AgentComposer';
import { buildCanvasSummary, canvasNodeTitle } from '../../../../utils/agentActionProtocol';

const posterA = (id: string, name: string, extra: any = {}) => ({
  id,
  type: 'generatedImageNode',
  data: { imageUrl: `https://x/${id}.png`, templatePoster: { template: 'A', productNodeId: 'p2', concept: { name } }, ...extra }
});

describe('模板海报原版也能被 @ 和认出', () => {
  it('没有 title 的 4/3 海报用构思名字', () => {
    expect(canvasNodeTitle(posterA('a1', '极境'))).toBe('4/3 产品海报 · 极境');
    expect(canvasNodeTitle(posterA('a2', '极境', { title: '极境 · 修改' }))).toBe('极境 · 修改');
  });
  it('手打 @极境 / @ 极境 认到最新的同名海报', () => {
    const nodes = [
      { id: 'a1', title: '4/3 产品海报 · 极境' },
      { id: 'e1', title: '极境 · 修改' },
      { id: 'a3', title: '4/3 产品海报 · 极境' }
    ];
    expect(resolveTypedMentions('请检查 @极境 的细节', nodes)).toEqual(['a3']);
    expect(resolveTypedMentions('重新 @ 极境，沿用方案', nodes)).toEqual(['a3']);
    expect(resolveTypedMentions('@极境 · 修改 调整', nodes)).toEqual(['a3']);
    expect(resolveTypedMentions('没有引用', nodes)).toEqual([]);
  });
  it('引用的早先海报也列进画布摘要，并带 nodeId', () => {
    const nodes = [posterA('old', '极境'), ...['b', 'c', 'd', 'e', 'f'].map(k => posterA(k, `名${k}`))];
    const summary = buildCanvasSummary({ nodes, planSettings: {}, mentionedNodeIds: ['old'] });
    expect(summary).toContain('old【用户引用】（主标题「极境」');
    expect(summary).toContain('4/3 产品海报 · 极境（nodeId old）');
    expect(buildCanvasSummary({ nodes, planSettings: {} })).not.toContain('主标题「极境」');
  });
});

describe('全画布简表', () => {
  it('列出别的对话生成的海报，标出处与对话', async () => {
    const { buildCanvasIndex } = await import('../../../../utils/agentActionProtocol');
    const nodes = [
      { id: 'img-node-1', type: 'productImageNode', data: { imageUrl: 'u0', fileName: 'main.jpg' } },
      { id: 'p2', type: 'productImageNode', data: { imageUrl: 'u1', conversationId: 'c1' } },
      { ...posterA('a1', '极境'), data: { ...posterA('a1', '极境').data, conversationId: 'c1' } },
      { id: 'e1', type: 'generatedImageNode', data: { imageUrl: 'u3', title: '极境 · 修改', editedFrom: 'a1', templatePoster: { template: 'A', productNodeId: 'p2' }, conversationId: 'c2' } },
      { id: 'note', type: 'noteNode', data: {} }
    ];
    const s = buildCanvasIndex(nodes, 'c2');
    expect(s).toContain('共 4 张图');
    expect(s).toContain('a1「4/3 产品海报 · 极境」(4/3海报/出自产品图2/别的对话生成)');
    expect(s).toContain('e1「极境 · 修改」(4/3海报修改版/出自产品图2)');
    expect(s.indexOf('e1')).toBeLessThan(s.indexOf('a1'));
    expect(s).toContain('img-node-1「产品主图 · main」(主产品图)');
    expect(buildCanvasIndex([], 'c2')).toBe('');
  });
  it('超过上限只列最新的并注明', async () => {
    const { buildCanvasIndex } = await import('../../../../utils/agentActionProtocol');
    const nodes = Array.from({ length: 45 }, (_, i) => posterA(`a${i}`, `名${i}`));
    const s = buildCanvasIndex(nodes, 'c');
    expect(s).toContain('a44「');
    expect(s).not.toContain('a4「');
    expect(s).toContain('更早还有 5 张未列出');
  });
});
