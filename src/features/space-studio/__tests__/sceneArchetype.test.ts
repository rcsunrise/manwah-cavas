import { describe, expect, it } from 'vitest';
import { resolveSceneArchetype } from '../../../../server/services/spaceArchetypeResolver';
import { SPACE_PROTOTYPES } from '../data/spacePresets';
import { STYLE_PRESETS } from '../data/stylePresets';

describe('resolveSceneArchetype', () => {
  it('maps each built-in layout to its own topology for every style', () => {
    const expected: Record<string, string | null> = { 'N-R01': null, 'N-R02': null, 'N-R03': 'duplex', 'N-R04': 'sunken', 'N-R05': 'pavilion', 'N-R06': 'penthouse' };
    for (const space of SPACE_PROTOTYPES) {
      for (const style of STYLE_PRESETS) {
        const { topology } = resolveSceneArchetype({ spaceCode: space.code, spaceName: space.name, styleCode: style.code, styleName: style.name });
        expect(topology).toBe(expected[space.code]);
      }
    }
  });

  it('only applies style rules to styles that are named that way', () => {
    const styleOf = (code: string) => {
      const style = STYLE_PRESETS.find((s) => s.code === code)!;
      return resolveSceneArchetype({ styleCode: style.code, styleName: style.name }).style;
    };
    expect(styleOf('US-01')).toBe('american');
    expect(styleOf('US-02')).toBe('american');
    expect(styleOf('EU-01')).toBe('french');
    expect(styleOf('FR-01')).toBe('french');
    expect(styleOf('IT-01')).toBe('italian');
    expect(styleOf('OR-02')).toBeNull();
    expect(styleOf('LX-01')).toBeNull();
  });

  it('never forces built-in rules onto AI presets', () => {
    expect(resolveSceneArchetype({ spaceCode: 'AI-R01', spaceName: '下沉复式', styleCode: 'AI-S02', styleName: '美式岩层 (American Stone)' })).toEqual({ topology: null, style: null });
  });

  it('still understands custom names without a preset code', () => {
    expect(resolveSceneArchetype({ spaceName: '下沉会客厅', styleName: '法式雅宅' })).toEqual({ topology: 'sunken', style: 'french' });
  });
});
