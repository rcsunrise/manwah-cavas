// src/features/space-studio/engine/__tests__/promptDeduplication.test.ts
import { describe, it, expect } from 'vitest';
import { deduplicateNegativeConstraints, deduplicatePositiveClauses } from '../promptDeduplication';

describe('promptDeduplication (Prompt Deduplication Engine)', () => {
  it('deduplicates negative constraints while preserving first-seen token order and casing', () => {
    const clause1 = 'text, watermark, Logo, letters, chinese characters, words';
    const clause2 = 'TEXT, Watermark, font, words, letters, Chinese Characters, labels, annotations, captions, LOGO';
    const clause3 = 'people, human, person, text, watermark';

    const result = deduplicateNegativeConstraints(clause1, clause2, clause3);

    // Exact order check:
    // 1. text, watermark, Logo, letters, chinese characters, words (from clause1)
    // 2. font, labels, annotations, captions (new from clause2)
    // 3. people, human, person (new from clause3)
    expect(result).toBe('text, watermark, Logo, letters, chinese characters, words, font, labels, annotations, captions, people, human, person');

    // Counts: 'text' should only appear once
    const tokens = result.split(', ').map(t => t.toLowerCase());
    expect(tokens.filter(t => t === 'text')).toHaveLength(1);
    expect(tokens.filter(t => t === 'watermark')).toHaveLength(1);
    expect(tokens.filter(t => t === 'logo')).toHaveLength(1);
    expect(tokens.filter(t => t === 'words')).toHaveLength(1);
  });

  it('safely handles empty strings, null, undefined, false, and trailing/double commas', () => {
    const result = deduplicateNegativeConstraints(
      '',
      undefined,
      'visible_ceiling, , ceiling_cove,',
      null,
      false,
      'ceiling_cove, squeezed_ceiling, ,'
    );

    expect(result).toBe('visible_ceiling, ceiling_cove, squeezed_ceiling');
  });

  it('deduplicates positive clause arrays without mangling sentences', () => {
    const clauses = [
      '[SHOT MANDATE - A05 2/3 HERO SOFA PRIVATE LOUNGE VIEW]',
      'proportional 3:4 vertical editorial composition, elegant vertical framing',
      'SPATIAL INVARIANCE ANCHOR: white matte cylindrical planter',
      'proportional 3:4 vertical editorial composition, elegant vertical framing', // duplicate
      '[SHOT MANDATE - A05 2/3 HERO SOFA PRIVATE LOUNGE VIEW]' // duplicate
    ];

    const result = deduplicatePositiveClauses(...clauses);
    expect(result).toHaveLength(3);
    expect(result).toEqual([
      '[SHOT MANDATE - A05 2/3 HERO SOFA PRIVATE LOUNGE VIEW]',
      'proportional 3:4 vertical editorial composition, elegant vertical framing',
      'SPATIAL INVARIANCE ANCHOR: white matte cylindrical planter'
    ]);
  });
});
