import { describe, it, expect } from 'vitest';
import { posterRegenOptions } from '../posterRegen';

describe('posterRegenOptions', () => {
  it('面料海报（B）给同版式与换版式两种整套重出，并带上现有型号/编号', () => {
    const opts = posterRegenOptions({ template: 'B', productNodeId: 'img-node-1', layout: 'hero3', code: '', label: '20250430-6#' });
    expect(opts).toHaveLength(2);
    expect(opts[0].actionId).toBe('fabric_poster');
    expect(opts[0].params).toMatchObject({ nodeId: 'img-node-1', fabricLayout: 'hero3', fabricCode: '', fabricLabel: '20250430-6#' });
    expect(opts[1].params.fabricLayout).toBe('collage4');
  });
  it('模板 A 只给再出一版；C 没有整套重出；非模板海报没有选项', () => {
    expect(posterRegenOptions({ template: 'A', productNodeId: 'p' })[0].actionId).toBe('template_poster');
    expect(posterRegenOptions({ template: 'C' })).toEqual([]);
    expect(posterRegenOptions(undefined)).toEqual([]);
  });
});
