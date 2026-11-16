import { describe, expect, it } from 'vitest';
import { CREATIVE_ANGLES, pickCreativeAngle } from '../services/posterTemplate/creativeAngles';
import { findSceneDirection, pickSceneCandidates, SCENE_DIRECTIONS } from '../services/posterTemplate/sceneDirections';
import { buildConceptPrompt, sanitizeConcept } from '../services/posterTemplate/posterConcept';

describe('创意角度轮换', () => {
  it('优先选没用过的角度', () => {
    const used = ['function', 'material', 'color', 'form'];
    expect(pickCreativeAngle(used, () => 0).id).toBe('mood');
  });

  it('都用过后避开最近 2 次', () => {
    const used = ['function', 'material', 'color', 'form', 'mood'];
    for (let i = 0; i < 10; i++) {
      expect(['form', 'mood']).not.toContain(pickCreativeAngle(used, () => i / 10).id);
    }
  });

  it('角度 id 不重复', () => {
    expect(new Set(CREATIVE_ANGLES.map(a => a.id)).size).toBe(CREATIVE_ANGLES.length);
  });
});

describe('场景候选', () => {
  it('3 个候选来自 3 个不同类别', () => {
    for (let i = 0; i < 20; i++) {
      const c = pickSceneCandidates([], 3, () => ((i * 7 + 3) % 20) / 20);
      expect(c).toHaveLength(3);
      expect(new Set(c.map(d => d.family)).size).toBe(3);
    }
  });

  it('避开最近 4 张用过的类别', () => {
    const used = ['future_arch', 'seaside_platform', 'cosmic', 'warm_arcade'];
    const recentFamilies = new Set(used.map(id => findSceneDirection(id)!.family));
    for (let i = 0; i < 20; i++) {
      const c = pickSceneCandidates(used, 3, Math.random);
      for (const d of c) expect(recentFamilies.has(d.family)).toBe(false);
    }
  });

  it('方向库足够大、id 不重复、类别够多', () => {
    expect(SCENE_DIRECTIONS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(SCENE_DIRECTIONS.map(d => d.id)).size).toBe(SCENE_DIRECTIONS.length);
    expect(new Set(SCENE_DIRECTIONS.map(d => d.family)).size).toBeGreaterThanOrEqual(10);
  });
});

describe('海报概念 prompt', () => {
  it('写进角度、候选场景、做过的卖点和视觉元素，并要求大场景', () => {
    const prompt = buildConceptPrompt({
      angle: CREATIVE_ANGLES[0],
      sceneCandidates: [findSceneDirection('white_dunes')!, findSceneDirection('cloud_peak')!],
      used: [{ name: '潮汐', sellingPoint: '弧形扶手', keyElements: ['弧形穹顶', '海面落日'] }]
    });
    expect(prompt).toContain('功能演绎');
    expect(prompt).toContain('white_dunes｜白色沙丘');
    expect(prompt).toContain('cloud_peak｜云海之巅');
    expect(prompt).toContain('卖点：弧形扶手');
    expect(prompt).toContain('弧形穹顶、海面落日');
    expect(prompt).toContain('不能是封闭的室内房间');
  });

  it('sanitize 保留卖点、元素与合法场景 id', () => {
    const c = sanitizeConcept({ name: '镜湖', angle: 'color', sceneDirection: 'salt_mirror', sellingPoint: '米白真皮', keyElements: ['盐湖', '倒影', 1] });
    expect(c.angle).toBe('color');
    expect(c.sceneDirection).toBe('salt_mirror');
    expect(c.sellingPoint).toBe('米白真皮');
    expect(c.keyElements).toEqual(['盐湖', '倒影']);
  });
});
