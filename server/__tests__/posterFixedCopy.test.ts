import { describe, expect, it } from 'vitest';
import { applyFixedCopy, buildConceptPrompt, sanitizeConcept, sanitizeFixedCopy } from '../services/posterTemplate/posterConcept';

describe('poster fixed copy · user-entered text', () => {
  it('sanitizes input: trims, caps lengths and drops empty items', () => {
    const f = sanitizeFixedCopy({
      name: '  曜境境境境 ',
      subtitle: '',
      photoDetails: [{ photo: 1, title: '轻托离地', desc: '' }, { photo: 9, title: 'x' }, { photo: 2 }],
      otherDetails: [{ title: '', desc: '' }]
    });
    expect(f).toEqual({ name: '曜境境境', photoDetails: [{ photo: 1, title: '轻托离地', desc: '' }] });
    expect(sanitizeFixedCopy({})).toBeUndefined();
    expect(sanitizeFixedCopy(null)).toBeUndefined();
  });

  it('overrides model output: photo cells by photo number, others in order, blanks keep the model text', () => {
    const concept = sanitizeConcept({
      name: '晴岚',
      subtitle: '模型写的副标题',
      details: [
        { key: 'foot', title: '模型标题A', desc: '模型正文A', photo: 2 },
        { key: 'armrest', title: '模型标题B', desc: '模型正文B', photo: 1 },
        { key: 'backrest', title: '模型标题C', desc: '模型正文C' }
      ]
    });
    applyFixedCopy(
      concept,
      {
        name: '曜境',
        photoDetails: [
          { photo: 1, title: '臂弯有度' },
          { photo: 2, desc: '稳固支撑 · 利落收边 · 安定从容' }
        ],
        otherDetails: [{ title: '层叠承托', desc: '分区支撑 · 分段车缝 · 贴合背脊' }]
      },
      2
    );
    expect(concept.name).toBe('曜境');
    expect(concept.subtitle).toBe('模型写的副标题');
    expect(concept.details[0]).toMatchObject({ title: '模型标题A', desc: '稳固支撑 · 利落收边 · 安定从容' });
    expect(concept.details[1]).toMatchObject({ title: '臂弯有度', desc: '模型正文B' });
    expect(concept.details[2]).toMatchObject({ title: '层叠承托', desc: '分区支撑 · 分段车缝 · 贴合背脊' });
  });

  it('falls back to cell order for photo cells when the model left photo empty', () => {
    const concept = sanitizeConcept({ details: [{ key: 'a', title: 'A', desc: 'a' }, { key: 'b', title: 'B', desc: 'b' }, { key: 'c', title: 'C', desc: 'c' }] });
    applyFixedCopy(concept, { photoDetails: [{ photo: 2, title: '第二张实拍' }] }, 2);
    expect(concept.details.map(d => d.title)).toEqual(['A', '第二张实拍', 'C']);
  });

  it('prompt lists the fixed copy and asks the model not to change it', () => {
    const p = buildConceptPrompt({
      detailCount: 4,
      fixedCopy: { name: '曜境', subtitle: '墨色映光，舒展有度', photoDetails: [{ photo: 1, title: '轻托离地' }] }
    });
    expect(p).toContain('用户已录入的文案（一字不改');
    expect(p).toContain('命名（name）：「曜境」');
    expect(p).toContain('附图1那一格：标题「轻托离地」；正文你来写');
  });

  it('prompt asks for literary titles and 功能 · 工艺 · 情绪 descriptions (two phrases when 6 cells)', () => {
    const four = buildConceptPrompt({ detailCount: 4 });
    expect(four).toContain('要有语言艺术');
    expect(four).toContain('依次写 功能 · 工艺 · 情绪');
    expect(four).toContain('不要写成“防伪、溯源、智能”');
    const six = buildConceptPrompt({ detailCount: 6 });
    expect(six).toContain('底部 6 格太窄，只写两个');
  });
});
