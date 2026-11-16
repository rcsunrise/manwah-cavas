import { describe, expect, it } from 'vitest';
import { CREATIVE_ANGLES, pickCreativeAngle } from '../services/posterTemplate/creativeAngles';
import { buildConceptPrompt, sanitizeConcept } from '../services/posterTemplate/posterConcept';

describe('创意角度轮换', () => {
  it('第一张不会选奇观空间', () => {
    for (let i = 0; i < 20; i++) {
      expect(pickCreativeAngle([], () => i / 20).id).not.toBe('spectacle');
    }
  });

  it('优先选没用过的角度', () => {
    const used = ['function', 'material', 'color', 'lifestyle'];
    expect(pickCreativeAngle(used, () => 0).id).toBe('form');
  });

  it('非奇观角度都用过后，避开最近 3 次（奇观空间这时才会出现）', () => {
    const used = ['function', 'material', 'color', 'lifestyle', 'form'];
    const picks = new Set(Array.from({ length: 10 }, (_, i) => pickCreativeAngle(used, () => i / 10).id));
    expect(picks.has('color')).toBe(false);
    expect(picks.has('lifestyle')).toBe(false);
    expect(picks.has('form')).toBe(false);
    expect(picks.has('spectacle')).toBe(true);
  });

  it('六个角度 id 不重复', () => {
    expect(new Set(CREATIVE_ANGLES.map(a => a.id)).size).toBe(CREATIVE_ANGLES.length);
  });
});

describe('海报概念 prompt', () => {
  it('把角度、做过的卖点和视觉元素写进 prompt', () => {
    const prompt = buildConceptPrompt({
      angle: CREATIVE_ANGLES[0],
      used: [{ name: '潮汐', angle: 'spectacle', sellingPoint: '弧形扶手', keyElements: ['弧形穹顶', '海面落日'] }]
    });
    expect(prompt).toContain('功能演绎');
    expect(prompt).toContain('卖点：弧形扶手');
    expect(prompt).toContain('弧形穹顶、海面落日');
    expect(prompt).toContain('先挖卖点');
  });

  it('sanitize 保留卖点与元素', () => {
    const c = sanitizeConcept({ name: '星眠', angle: 'function', sellingPoint: '一键半躺看星空', keyElements: ['观星房', '银河', 1] });
    expect(c.angle).toBe('function');
    expect(c.sellingPoint).toBe('一键半躺看星空');
    expect(c.keyElements).toEqual(['观星房', '银河']);
  });
});
