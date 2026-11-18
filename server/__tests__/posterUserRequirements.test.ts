import { describe, expect, it } from 'vitest';
import { cropRectForBox } from '../services/posterTemplate/detailCrop';
import { buildConceptPrompt, buildTemplateAHeroPrompt, sanitizeConcept } from '../services/posterTemplate/posterConcept';
import { DARK_DIRECTIONS, pickSceneCandidates, pickSceneDirection } from '../services/posterTemplate/sceneDirections';
import { posterPromptTags } from '../../src/utils/posterRegen';
import { describePlanParams, extractAgentActions } from '../../src/utils/agentActionProtocol';

describe('细节格：整个部位都要在裁切框里', () => {
  it('竖长的扶手不会被切掉顶部或底部', () => {
    const box = { left: 0.2, top: 0.3, width: 0.08, height: 0.3 };
    const rect = cropRectForBox(box, 2048, 1175, 1.05);
    expect(rect.top).toBeLessThanOrEqual(box.top * 1175);
    expect(rect.top + rect.height).toBeGreaterThanOrEqual((box.top + box.height) * 1175);
    expect(rect.left).toBeLessThanOrEqual(box.left * 2048);
    expect(rect.left + rect.width).toBeGreaterThanOrEqual((box.left + box.width) * 2048);
  });
});

describe('场景：整体明亮，不再自动轮换到夜景 / 星空', () => {
  it('候选和单选都不出暗调方向', () => {
    for (let i = 0; i < 40; i++) {
      const r = () => ((i * 7919) % 97) / 97;
      expect(pickSceneCandidates([], 3, r).some(d => DARK_DIRECTIONS.has(d.id))).toBe(false);
      expect(DARK_DIRECTIONS.has(pickSceneDirection([], () => i / 40).id)).toBe(false);
    }
  });

  it('构思和出图提示词要求明亮、常规茶几贴近沙发', () => {
    const prompt = buildConceptPrompt({});
    expect(prompt).toContain('整体明亮通透');
    expect(prompt).toContain('不要离沙发很远');
    expect(prompt).not.toContain('夜晚星光');
    const hero = buildTemplateAHeroPrompt(sanitizeConcept({ name: '苔痕' }));
    expect(hero).toContain('不要夜景');
    expect(hero).toContain('展厅常见的正常款式');
    expect(hero).toContain('画面里不要出现人物');
  });
});

describe('用户的个性化要求与附图', () => {
  it('用户要求原样进构思，附图逐张判断用途', () => {
    const prompt = buildConceptPrompt({
      hint: '主图要有中文标题（四字以内），沙发上有两个相同带图案的抱枕，扶手要完整',
      productImage: { data: 'x', mimeType: 'image/jpeg' },
      attachments: [
        { data: 'a', mimeType: 'image/jpeg' },
        { data: 'b', mimeType: 'image/jpeg' }
      ]
    });
    expect(prompt).toContain('四字以内');
    expect(prompt).toContain('第2张：用户附图1');
    expect(prompt).toContain('第3张：用户附图2');
    expect(prompt).toContain('attachmentRoles');
  });

  it('概念保留附图序号、附图用途、功能位与人物', () => {
    const c = sanitizeConcept({
      name: '苔痕',
      functionOpen: true,
      person: '一位年轻女性半躺在打开的功能位上看书',
      attachmentRoles: ['detail', 'scene', 'whatever'],
      details: [
        { key: 'armrest', locate: '整只扶手', title: '饱满扶手', desc: '整只扶手圆润包覆，侧面拉手开槽，金属圆脚稳固支撑', photo: 1 },
        { key: 'backrest', locate: '靠背', title: '分段靠背', desc: '分区承托', photo: 0 },
        { key: 'foot', locate: '沙发脚', title: '金属底座', desc: '稳固支撑' }
      ]
    });
    expect(c.details[0].photo).toBe(1);
    expect(c.details[0].desc.length).toBeGreaterThan(20);
    expect(c.details[1].photo).toBeUndefined();
    expect(c.attachmentRoles).toEqual(['detail', 'scene', 'ignore']);
    expect(c.functionOpen).toBe(true);
    const hero = buildTemplateAHeroPrompt(c, undefined, { detailPhotos: 1 });
    expect(hero).toContain('[人物] 一位年轻女性');
    expect(hero).toContain('产品细节实拍');
  });

  it('确认卡片带上全部附图，长要求不被截成 300 字', () => {
    const longHint = '要求'.repeat(400);
    const msg = extractAgentActions(
      `好的<agent_actions>{"plan": {"actionId": "template_poster", "title": "4/3 产品海报", "params": {"hint": "${longHint}", "attachmentUrls": ["https://a.example/1.jpg", "https://a.example/2.jpg", "javascript:x"]}}}</agent_actions>`
    );
    expect(msg.planCard?.params?.attachmentUrls).toEqual(['https://a.example/1.jpg', 'https://a.example/2.jpg']);
    expect(msg.planCard?.params?.hint?.length).toBe(800);
    const items = describePlanParams('template_poster', msg.planCard!.params);
    expect(items.some(i => i.label === '附图')).toBe(true);
  });
});

describe('出图后的提示词标签', () => {
  it('功能位打开却没有人物时，第一个就是“加入人物”', () => {
    const tags = posterPromptTags({ template: 'A', concept: { functionOpen: true, person: '' } });
    expect(tags[0].label).toContain('加入人物');
    expect(tags[0].text).toContain('功能位');
    expect(posterPromptTags({ template: 'B' })).toEqual([]);
  });
});

import { cutDetailDesc } from '../services/posterTemplate/posterConcept';
describe('细节说明不出现半句话', () => {
  it('在逗号处截断时去掉挂着的半截连接词，并补句号', () => {
    const d = cutDetailDesc('采用精工锻造的柱状金属脚，表面呈现哑光银色光泽，稳固支撑结构的同时，也为整体造型增添了轻盈感与现代气息', 40);
    expect(d).toBe('采用精工锻造的柱状金属脚，表面呈现哑光银色光泽。');
    expect(cutDetailDesc('圆润包覆 · 分割缝线', 40)).toBe('圆润包覆 · 分割缝线');
    expect(cutDetailDesc('靠背以拉点工艺分为上下两区。精准贴合人体脊椎曲线，久坐不累，同时还带来更柔软的坐感体验和包裹感受', 40)).toBe('靠背以拉点工艺分为上下两区。');
  });
});
