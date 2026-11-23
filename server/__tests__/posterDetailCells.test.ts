import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { composeTemplateA, detailStripGeometry, templateADetailAspect, TEMPLATE_A_SIZE } from '../services/posterTemplate/templateA';
import { clampDetailCount, fitDetailCount, sanitizeConcept, buildConceptPrompt } from '../services/posterTemplate/posterConcept';

const solid = (w: number, h: number, c: string) => sharp({ create: { width: w, height: h, channels: 3, background: c } }).jpeg().toBuffer();

describe('细节格 3–6 格', () => {
  it('格数夹在 3–6，补格不重复部位', () => {
    expect(clampDetailCount(undefined)).toBe(3);
    expect(clampDetailCount(9)).toBe(6);
    expect(clampDetailCount(1)).toBe(3);
    const c = sanitizeConcept({ name: '镜界' });
    fitDetailCount(c, 6);
    expect(c.details).toHaveLength(6);
    expect(new Set(c.details.map(d => d.key)).size).toBe(6);
    fitDetailCount(c, 4);
    expect(c.details).toHaveLength(4);
  });

  it('提示词写明格数与细节图窗口实拍', () => {
    const p = buildConceptPrompt({ detailCount: 5, detailPhotoCount: 2, attachments: [{ data: 'a', mimeType: 'image/jpeg' }, { data: 'b', mimeType: 'image/jpeg' }] });
    expect(p).toContain('底部一栏 5 格');
    expect(p).toContain('details 必须正好 5 项');
    expect(p).toContain('附图1～附图2');
  });

  it('每种格数的几何都在细节栏内', () => {
    const W = TEMPLATE_A_SIZE.width;
    for (const n of [3, 4, 5, 6]) {
      const g = detailStripGeometry(n);
      const cellW = (W - g.padX * 2) / n;
      expect(g.imgW).toBeLessThanOrEqual(cellW);
      expect(g.imgH).toBeGreaterThan(150);
      expect(templateADetailAspect(n)).toBeGreaterThan(0.8);
      expect(templateADetailAspect(n)).toBeLessThan(2);
    }
  });

  it('4/5/6 格都能排版出图', async () => {
    const hero = await solid(2048, 1175, '#8fb0c8');
    for (const n of [4, 5, 6]) {
      const details = await Promise.all(
        Array.from({ length: n }, async (_, i) => ({ image: await solid(400, 300, ['#444', '#777', '#999', '#555', '#666', '#888'][i]), title: `细节${i + 1}`, desc: '饱满造型 · 圆润包覆' }))
      );
      const out = await composeTemplateA({ hero, title: { name: '镜界', subtitle: '天地之间，舒展自在', inspiration: '' }, details });
      expect(out.width).toBe(2048);
      if (process.env.SAVE_POSTER_SAMPLES) await sharp(out.buffer).resize(1024).toFile(`${process.env.SAVE_POSTER_SAMPLES}/cells-${n}.jpg`);
    }
  }, 60000);
});
