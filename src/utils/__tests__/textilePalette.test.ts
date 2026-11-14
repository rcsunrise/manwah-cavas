import { describe, expect, it } from 'vitest';
import { deltaE, findAssetByKeyword, pickPaletteSwatches } from '../textilePalette';

describe('deltaE', () => {
  it('相同颜色为 0，黑白差距很大', () => {
    expect(deltaE('#336699', '#336699')).toBe(0);
    expect(deltaE('#000000', '#FFFFFF')).toBeGreaterThan(90);
  });
});

describe('pickPaletteSwatches', () => {
  const main = '#6B6B3A'; // 橄榄绿
  const cands = [
    { id: 'dup-main', hex: '#6C6C3B' }, // 和主色几乎一样，应剔除
    { id: 'olive-light', hex: '#A8A66A' }, // 邻近色
    { id: 'olive-light-dup', hex: '#A9A76B' }, // 与上一个几乎一样，应剔除
    { id: 'navy', hex: '#1B2A4A' },
    { id: 'cream', hex: '#EFE6D2' },
    { id: 'rust', hex: '#A5502A' },
    { id: 'grey', hex: '#8A8A8A' }
  ];

  it('剔除与主色、彼此几乎一样的候选', () => {
    const ids = pickPaletteSwatches(main, cands, 10).map(c => c.id);
    expect(ids).not.toContain('dup-main');
    expect(ids).not.toContain('olive-light-dup');
    expect(ids).toContain('olive-light');
  });

  it('第一块是与主色最接近的邻近色，之后颜色拉开', () => {
    const picked = pickPaletteSwatches(main, cands, 4);
    expect(picked).toHaveLength(4);
    expect(picked[0].id).toBe('olive-light');
    // 选出来的颜色两两之间都有明显差距
    for (let i = 0; i < picked.length; i++) {
      for (let j = i + 1; j < picked.length; j++) expect(deltaE(picked[i].hex, picked[j].hex)).toBeGreaterThan(10);
    }
  });

  it('数量不足时有多少给多少；非法色值被忽略', () => {
    expect(pickPaletteSwatches(main, [{ id: 'x', hex: 'red' }], 3)).toEqual([]);
    expect(pickPaletteSwatches(main, cands, 99).length).toBeLessThanOrEqual(5);
    expect(pickPaletteSwatches(main, cands, 0)).toEqual([]);
  });
});

describe('findAssetByKeyword', () => {
  const assets = [
    { name: 'DSC_8836.JPG', path: '新建文件夹/DSC_8836.JPG' },
    { name: 'DSC_8837.JPG', path: '新建文件夹/DSC_8837.JPG' },
    { name: 'NH30425-11.jpg', path: 'NH30425/NH30425-11.jpg' },
    { name: 'NH30425-12.jpg', path: 'NH30425/NH30425-12.jpg' }
  ];

  it('文件名（带不带扩展名、大小写）能精确命中', () => {
    expect(findAssetByKeyword(assets, 'dsc_8837').match?.name).toBe('DSC_8837.JPG');
    expect(findAssetByKeyword(assets, 'NH30425-12.jpg').match?.name).toBe('NH30425-12.jpg');
  });

  it('关键字命中多个时不乱选，返回候选让调用方追问', () => {
    const r = findAssetByKeyword(assets, 'NH30425');
    expect(r.match).toBeNull();
    expect(r.ambiguous).toHaveLength(2);
  });

  it('找不到或空关键字', () => {
    expect(findAssetByKeyword(assets, 'zzz')).toEqual({ match: null, ambiguous: [] });
    expect(findAssetByKeyword(assets, '  ')).toEqual({ match: null, ambiguous: [] });
  });
});

import { pickBestSource, textileColorTarget } from '../textilePalette';

describe('textileColorTarget', () => {
  it('中文色名映射，具体的说法优先于笼统的', () => {
    expect(textileColorTarget('绿色')).toBe('#6B6B3A');
    expect(textileColorTarget('藏青')).toBe('#1B2A4A');
    expect(textileColorTarget('墨绿')).toBe('#1F3D2B');
    expect(textileColorTarget('#aabbcc')).toBe('#AABBCC');
    expect(textileColorTarget('彩虹')).toBeNull();
  });
});

describe('pickBestSource', () => {
  it('同名文件取体积最大的（缩略版 vs 原片）', () => {
    const all = [
      { name: 'DSC_8860.JPG', size: 300_000, type: 'image' },
      { name: 'DSC_8860.JPG', size: 17_000_000, type: 'image' },
      { name: 'DSC_8861.JPG', size: 360_000, type: 'image' }
    ];
    expect(pickBestSource(all[0], all).size).toBe(17_000_000);
    expect(pickBestSource(all[2], all).size).toBe(360_000);
  });
});
