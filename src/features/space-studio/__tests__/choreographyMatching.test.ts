import { describe, expect, it } from 'vitest';
import { countMatchedSlots, fillMissingModelMatches } from '../engine/choreographyMatching';

const model = (id: string, roleType: string) => ({ id, roleType, name: id, nameZh: `${id}中文` }) as any;
const models = [model('gp', 'grandfather'), model('gm', 'grandmother'), model('f', 'father'), model('m', 'mother'), model('s', 'son'), model('d', 'daughter')];

describe('choreography role matching', () => {
  it('matches every family role to its model', () => {
    const slots = ['father', 'son', 'grandmother', 'daughter', 'grandfather', 'mother'].map((targetRole) => ({ targetRole }));
    const filled = fillMissingModelMatches(slots, models);
    expect(filled.map((s) => s.matchedModelId)).toEqual(['f', 's', 'gm', 'd', 'gp', 'm']);
    expect(filled[0].matchedModelName).toBe('f中文');
    expect(countMatchedSlots(filled, models)).toBe(6);
  });

  it('keeps valid choices, replaces stale ids and never reuses a model', () => {
    const filled = fillMissingModelMatches(
      [
        { targetRole: 'father', matchedModelId: 'f' },
        { targetRole: 'father' },
        { targetRole: 'dad', matchedModelId: 'gone' },
        { targetRole: 'pet' }
      ],
      models
    );
    expect(filled.map((s) => s.matchedModelId)).toEqual(['f', undefined, undefined, undefined]);
    expect(fillMissingModelMatches([{ targetRole: 'dad' }], models)[0].matchedModelId).toBe('f');
    expect(countMatchedSlots(filled, models)).toBe(1);
  });

  it('leaves slots empty when the library is empty', () => {
    expect(fillMissingModelMatches([{ targetRole: 'father' }], [])[0].matchedModelId).toBeUndefined();
  });
});
