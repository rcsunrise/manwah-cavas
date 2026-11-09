import { describe, expect, it } from 'vitest';
import { buildShotExportFileName, cleanPresetName } from '../engine/exportFileName';

const base = {
  spaceName: '通透横厅大平层 (Open Horizontal Flat)',
  styleName: '美式庄园宅 (American Grand Manor Estate)',
  shotCode: 'A00',
  resolution: '2K',
  format: 'jpg'
};

describe('buildShotExportFileName', () => {
  it('includes layout, style, shot, version, time and resolution', () => {
    const name = buildShotExportFileName({ ...base, revisionNumber: 2, createdAt: new Date(2026, 10, 9, 9, 3, 12).toISOString() });
    expect(name).toBe('MANWAH_通透横厅大平层_美式庄园宅_A00_v2_1109-090312_2K.jpg');
  });

  it('gives different names to versions of the same shot', () => {
    const createdAt = new Date(2026, 10, 9, 9, 3, 12).toISOString();
    expect(buildShotExportFileName({ ...base, revisionNumber: 1, createdAt })).not.toBe(buildShotExportFileName({ ...base, revisionNumber: 2, createdAt }));
  });

  it('stays unique when a version number is reused after deletion', () => {
    const first = buildShotExportFileName({ ...base, revisionNumber: 3, createdAt: new Date(2026, 10, 9, 9, 3, 12).toISOString() });
    const second = buildShotExportFileName({ ...base, revisionNumber: 3, createdAt: new Date(2026, 10, 9, 9, 8, 40).toISOString() });
    expect(first).not.toBe(second);
  });

  it('separates candidates of one batch', () => {
    const createdAt = new Date(2026, 10, 9, 9, 3, 12).toISOString();
    const one = buildShotExportFileName({ ...base, revisionNumber: 2, candidateNumber: 1, createdAt });
    const two = buildShotExportFileName({ ...base, revisionNumber: 2, candidateNumber: 2, createdAt });
    expect(one).toContain('_v2_方案1_');
    expect(one).not.toBe(two);
  });

  it('removes characters that are invalid in file names', () => {
    const name = buildShotExportFileName({ ...base, spaceName: 'A/B:C*户型', styleName: '我的 风格?', revisionNumber: 1, createdAt: new Date(2026, 0, 2, 3, 4, 5).toISOString() });
    expect(name).toBe('MANWAH_ABC户型_我的-风格_A00_v1_0102-030405_2K.jpg');
  });

  it('omits layout and style when a version has no recorded labels', () => {
    const name = buildShotExportFileName({ ...base, spaceName: undefined, styleName: undefined, revisionNumber: 1, createdAt: new Date(2026, 10, 9, 9, 1, 13).toISOString() });
    expect(name).toBe('MANWAH_A00_v1_1109-090113_2K.jpg');
  });

  it('falls back to the current time when createdAt is invalid', () => {
    const name = buildShotExportFileName({ ...base, revisionNumber: 1, createdAt: 'bad-date', now: new Date(2026, 10, 9, 1, 2, 3) });
    expect(name).toContain('_1109-010203_');
  });
});

describe('cleanPresetName', () => {
  it('strips half-width and full-width bracket suffixes', () => {
    expect(cleanPresetName('现代美式都会宅 (Modern American Metropolitan)')).toBe('现代美式都会宅');
    expect(cleanPresetName('端厅平层（Corner）')).toBe('端厅平层');
  });
});
