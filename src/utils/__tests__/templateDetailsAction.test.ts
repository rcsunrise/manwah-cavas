import { describe, expect, it } from 'vitest';
import { extractAgentActions } from '../agentActionProtocol';

const U = 'https://x.supabase.co/storage/v1/object/public/a/';
describe('template_details：只换 4/3 海报底部细节格', () => {
  it('解析出计划卡，保留格子对应与文案，说明不生图不扣点', () => {
    const text = `按实拍更新底部三格。<agent_actions>${JSON.stringify({
      plan: {
        actionId: 'template_details',
        params: {
          nodeId: 'image-edit-1',
          attachmentUrls: [`${U}1.png`, `${U}2.png`, 'javascript:alert(1)'],
          detailSlots: [1, 2, 9],
          detailTexts: [{ slot: 1, title: '宽厚扶手', desc: '软包轮廓 · 金属连接' }, { slot: 5, title: 'x' }]
        }
      }
    })}</agent_actions>`;
    const r = extractAgentActions(text);
    expect(r.planCard?.actionId).toBe('template_details');
    expect(r.planCard?.params?.attachmentUrls).toEqual([`${U}1.png`, `${U}2.png`]);
    expect(r.planCard?.params?.detailSlots).toEqual([1, 2]);
    expect(r.planCard?.params?.detailTexts).toEqual([{ slot: 1, title: '宽厚扶手', desc: '软包轮廓 · 金属连接' }]);
    const items = r.planCard!.items.map(i => `${i.label}:${i.value}`).join('\n');
    expect(items).toContain('图1→第1格');
    expect(items).toContain('第 1 格文案:宽厚扶手｜软包轮廓 · 金属连接');
    expect(items).toContain('不扣点');
    expect(items).not.toContain('参考图用来定场景');
  });
});
