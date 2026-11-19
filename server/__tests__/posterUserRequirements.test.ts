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
    expect(hero).toContain('离沙发约一臂距离');
    expect(hero).not.toContain('简洁的矩形、圆形或椭圆');
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

import { COFFEE_TABLE_STYLES, coffeeTableRule, pickCoffeeTableCandidates } from '../services/posterTemplate/coffeeTables';
describe('茶几款式：现代轻奢大理石，按产品轮换、按配色挑选', () => {
  it('候选来自没用过的款式，构思列出候选，出图写进选中的那一款', () => {
    const used = COFFEE_TABLE_STYLES.slice(0, 8).map(s => s.id);
    const cands = pickCoffeeTableCandidates(used, 3, () => 0.5);
    expect(cands).toHaveLength(3);
    expect(cands.every(c => !used.includes(c.id))).toBe(true);
    const prompt = buildConceptPrompt({ tableCandidates: cands });
    for (const c of cands) expect(prompt).toContain(c.id);
    const style = COFFEE_TABLE_STYLES[0];
    expect(coffeeTableRule(style)).toContain(style.label);
    expect(coffeeTableRule(style)).toContain('不要细金属框架');
    const hero = buildTemplateAHeroPrompt(sanitizeConcept({ name: '苔镜', tableStyle: style.id }));
    expect(hero).toContain(style.brief);
    expect(sanitizeConcept({ tableStyle: 'nope' }).tableStyle).toBeUndefined();
  });
});

import { PILLOW_RULE } from '../services/posterTemplate/posterConcept';
describe('抱枕颜色和沙发区分开', () => {
  it('构思和出图都要求抱枕和沙发明显区分', () => {
    expect(buildConceptPrompt({})).toContain(PILLOW_RULE);
    expect(buildTemplateAHeroPrompt(sanitizeConcept({ name: '托岚' }))).toContain('和沙发面料明显区分开');
  });
});

import { isArmTarget } from '../services/posterTemplate/detailCrop';
describe('扶手格避开遮挡', () => {
  it('扶手类部位会做左右候选与遮挡检查；出图要求花瓶绿植不挡扶手', () => {
    expect(isArmTarget({ key: 'armrest', locate: 'x' })).toBe(true);
    expect(isArmTarget({ key: 'detail_1', locate: '整只扶手' })).toBe(true);
    expect(isArmTarget({ key: 'foot', locate: '沙发脚' })).toBe(false);
    expect(buildTemplateAHeroPrompt(sanitizeConcept({ name: '岩织' }))).toContain('不能挡在沙发两侧扶手前面');
  });
});

import sharpLib from 'sharp';
import { circleCropRect } from '../services/posterTemplate/detailCrop';
import { ARM_DETAIL_LOCATE, sanitizeFabricConcept } from '../services/posterTemplate/fabricConcept';
import { DETAIL_CIRCLE_BG, farSideOfSofa, onDetailBackground } from '../services/posterTemplate/fabricPoster';
describe('氛围海报：圆形细节底色、整只扶手、抱枕朝向', () => {
  it('细节 1 固定是整只扶手，按扶手做遮挡检查、不做紧贴精定位', () => {
    const c = sanitizeFabricConcept({ details: [{ key: 'detail1', locate: '扶手上的按钮' }, { key: 'detail2', locate: '沙发脚' }] });
    expect(c.details[0].locate).toBe(ARM_DETAIL_LOCATE);
    expect(isArmTarget(c.details[0])).toBe(true);
    expect(c.details[1].locate).toBe('沙发脚');
  });
  it('圆形取景把部位框的对角线装进圆里', () => {
    const box = { left: 0.1, top: 0.3, width: 0.2, height: 0.4 };
    const r = circleCropRect(box, 2000, 1000);
    expect(r.width).toBe(r.height);
    expect(r.width).toBeGreaterThanOrEqual(Math.round(Math.hypot(400, 400)));
  });
  it('近端更低的一侧离镜头近，抱枕放另一端；两端一样高按右侧', async () => {
    const make = async (leftBottom: number, rightBottom: number) => {
      const w = 400, h = 200;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><polygon points="0,20 ${w},20 ${w},${rightBottom} 0,${leftBottom}" fill="#666"/></svg>`;
      return sharpLib(Buffer.from(svg)).png().toBuffer();
    };
    expect(await farSideOfSofa(await make(195, 150))).toBe('right');
    expect(await farSideOfSofa(await make(150, 195))).toBe('left');
    expect(await farSideOfSofa(await make(190, 190))).toBe('right');
  });
  it('白底细节图的白色背景换成暖浅灰，尺寸不变', async () => {
    const img = await sharpLib({ create: { width: 200, height: 200, channels: 3, background: '#ffffff' } })
      .composite([{ input: await sharpLib({ create: { width: 80, height: 80, channels: 3, background: '#556655' } }).png().toBuffer(), left: 60, top: 60 }])
      .png()
      .toBuffer();
    const out = await onDetailBackground(img);
    const { data, info } = await sharpLib(out).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([200, 200]);
    const hex = '#' + [0, 1, 2].map(i => data[i].toString(16).padStart(2, '0')).join('');
    expect(hex.toUpperCase()).toBe(DETAIL_CIRCLE_BG.toUpperCase());
  });
});
