import { describe, expect, it } from 'vitest';
import { buildConsistencyEvaluationPrompt } from '../services/consistencyPromptService';

describe('product consistency · evaluation prompt', () => {
  const { userPrompt } = buildConsistencyEvaluationPrompt('PRODUCT_HERO', []);

  it('does not ship sample scores the model could copy (they used to produce a fake ~92.5)', () => {
    const scores = [...userPrompt.matchAll(/"rawScore":\s*(\d+)/g)].map(m => Number(m[1]));
    expect(scores.length).toBe(8);
    expect(scores.every(s => s === 0)).toBe(true);
    expect(userPrompt).toContain('"modelConfidence": 0');
  });

  it('tells the model which image is which and to score from what it actually sees', () => {
    expect(userPrompt).toContain('第一张图是【参考图片】');
    expect(userPrompt).toContain('第二张图是【待评估候选图片】');
    expect(userPrompt).toContain('不得照抄占位值');
  });
});
