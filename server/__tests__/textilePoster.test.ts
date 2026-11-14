import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  analyzeFabric,
  colorNameZh,
  composeTextilePoster,
  deriveBackground,
  hexToRgb,
  luminanceOf,
  moodCollage,
  mosaic,
  swatchSlotsFor,
  TEXTILE_LAYOUT_IDS,
  TEXTILE_LAYOUTS,
  textileLayoutOf,
  textileMoodAspectFor
} from '../services/posterTemplate/textilePoster';
import { defaultTextileConcept, sanitizeTextileConcept } from '../services/posterTemplate/textileConcept';

async function solid(w: number, h: number, color: string): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();
}

/** 模拟一张面料样卡照片：橄榄绿主体、上方灰条、下方藏青条、中间贴白色标签、右侧是白色桌面 */
async function sampleCard(): Promise<Buffer> {
  const noise = (w: number, h: number, base: [number, number, number]) => {
    const data = Buffer.alloc(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      const v = ((i * 2654435761) >>> 0) % 40;
      data[i * 3] = Math.min(255, base[0] + v - 20);
      data[i * 3 + 1] = Math.min(255, base[1] + v - 20);
      data[i * 3 + 2] = Math.min(255, base[2] + v - 20);
    }
    return sharp(data, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  };
  return sharp({ create: { width: 1000, height: 700, channels: 3, background: '#f2f2f0' } })
    .composite([
      { input: await noise(700, 100, [185, 185, 190]), left: 0, top: 0 },
      { input: await noise(700, 460, [100, 100, 70]), left: 0, top: 100 },
      { input: await noise(700, 140, [20, 30, 70]), left: 0, top: 560 },
      { input: await solid(220, 160, '#fcfcfc'), left: 250, top: 250 }
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe('analyzeFabric（避开标签纸，取干净的同色面料）', () => {
  it('标签贴在橄榄绿上：区域落在橄榄绿里，不含标签、藏青条、灰条和白桌面', async () => {
    const a = await analyzeFabric(await sampleCard());
    expect(a.hasLabel).toBe(true);
    const { left, top, width, height } = a.region;
    // 不能压到标签（x 250~470, y 250~410）
    const overlapsLabel = left < 470 && left + width > 250 && top < 410 && top + height > 250;
    expect(overlapsLabel).toBe(false);
    // 在橄榄绿带内（y 100~560）、在样布内（x<700）
    expect(top).toBeGreaterThanOrEqual(90);
    expect(top + height).toBeLessThanOrEqual(570);
    expect(left + width).toBeLessThanOrEqual(710);
    // 主色是橄榄绿，不是藏青或灰
    const [r, g, b] = hexToRgb(a.color);
    expect(r).toBeGreaterThan(80);
    expect(g).toBeGreaterThan(80);
    expect(b).toBeLessThan(r);
  });

  it('没有标签的纯色面料：取大块区域，不报有标签', async () => {
    const a = await analyzeFabric(await solid(800, 600, '#445566'));
    expect(a.hasLabel).toBe(false);
    expect(a.region.width * a.region.height).toBeGreaterThan(800 * 600 * 0.3);
    expect(a.color).toBe('#445566');
  });

  it('整张是白色面料：不会把它当成标签纸和桌面', async () => {
    const a = await analyzeFabric(await solid(600, 600, '#f6f6f4'));
    expect(a.hasLabel).toBe(false);
    expect(a.region.width).toBeGreaterThan(300);
  });
});

describe('底色与色名', () => {
  it('深色面料底色提亮、浅色面料底色压深，都落在中间明度，并降低饱和', () => {
    const dark = deriveBackground('#14213D');
    const light = deriveBackground('#E8D9C4');
    expect(luminanceOf(dark)).toBeGreaterThan(luminanceOf('#14213D'));
    expect(luminanceOf(light)).toBeLessThan(luminanceOf('#E8D9C4'));
    for (const c of [dark, light]) {
      expect(luminanceOf(c)).toBeGreaterThan(0.15);
      expect(luminanceOf(c)).toBeLessThan(0.62);
    }
  });

  it('色名', () => {
    expect(colorNameZh('#111111')).toBe('墨黑');
    expect(colorNameZh('#14213D')).toBe('藏青');
    expect(colorNameZh('#6B6B3A')).toMatch(/绿|橄榄/);
  });
});

describe('版式', () => {
  it('三种版式；未知值回退 slant', () => {
    expect(TEXTILE_LAYOUT_IDS).toEqual(['slant', 'hex', 'circle']);
    expect(textileLayoutOf('hex')).toBe('hex');
    expect(textileLayoutOf('collage4')).toBe('slant');
    expect(textileLayoutOf(undefined)).toBe('slant');
  });

  it('色卡槽位：圆形版先填第一排，一排式靠右对齐，数量不超过槽位', () => {
    expect(swatchSlotsFor('circle', 2).map(s => s.y)).toEqual([905, 905]);
    const hex = swatchSlotsFor('hex', 3);
    expect(hex).toHaveLength(3);
    expect(hex[2].x + TEXTILE_LAYOUTS.hex.swatch.size).toBe(1968);
    expect(swatchSlotsFor('slant', 99)).toHaveLength(6);
  });

  it('氛围图拼块都落在框内、互不重叠', () => {
    for (const id of TEXTILE_LAYOUT_IDS) {
      const frame = TEXTILE_LAYOUTS[id].moodFrame;
      for (let n = 1; n <= 4; n++) {
        const rects = mosaic(frame, n);
        expect(rects).toHaveLength(n);
        rects.forEach(r => {
          expect(r.x).toBeGreaterThanOrEqual(frame.x);
          expect(r.y).toBeGreaterThanOrEqual(frame.y);
          expect(r.x + r.w).toBeLessThanOrEqual(frame.x + frame.w);
          expect(r.y + r.h).toBeLessThanOrEqual(frame.y + frame.h);
        });
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const a = rects[i];
            const b = rects[j];
            const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
            expect(overlap).toBe(false);
          }
        }
      }
    }
    expect(textileMoodAspectFor('hex', 1, 0)).toMatch(/^\d+:\d+$/);
  });
});

describe('composeTextilePoster', () => {
  it.each(TEXTILE_LAYOUT_IDS)('%s：输出 A4 横版，底色取自主面料，文字与色卡都画上', async layout => {
    const card = await sampleCard();
    const other = await solid(400, 400, '#a04030');
    const mood = await solid(600, 800, '#334455');
    const r = await composeTextilePoster({
      layout,
      main: card,
      swatches: [other, other],
      moods: [mood],
      name: '苔原绒',
      description: '以苔原为灵感，肌理细腻，手感柔软亲肤。',
      code: 'NH30425'
    });
    expect(r.width).toBe(2000);
    expect(r.height).toBe(1414);
    const meta = await sharp(r.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([2000, 1414]);
    expect(r.swatchColors).toHaveLength(3);
    expect(r.warnings.join('')).not.toMatch(/没有氛围图/);
    // 取一个各版式里都没有被图片盖住的角落像素：应当是底色
    const corner = { slant: [5, 1400], hex: [5, 5], circle: [1995, 3] }[layout];
    const { data } = await sharp(r.buffer).extract({ left: corner[0], top: corner[1], width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    const bg = hexToRgb(r.bgColor);
    expect(Math.abs(data[0] - bg[0])).toBeLessThan(6);
  }, 30000);

  it('指定底色优先于取自主面料；没有氛围图时给出提示并用面料特写代替', async () => {
    const r = await composeTextilePoster({
      layout: 'slant',
      main: await solid(800, 600, '#445566'),
      swatches: [],
      moods: [],
      name: '雾蓝',
      description: '',
      bgColor: '#7a8584'
    });
    expect(r.bgColor).toBe('#7A8584');
    expect(r.warnings.join('')).toMatch(/没有氛围图/);
  }, 30000);

  it('outputScale=2 时输出 4000×2828', async () => {
    const r = await composeTextilePoster({
      layout: 'circle',
      main: await solid(800, 600, '#445566'),
      swatches: [],
      moods: [],
      name: '雾蓝',
      description: '说明',
      outputScale: 2
    });
    expect([r.width, r.height]).toEqual([4000, 2828]);
  }, 60000);
});

describe('textile concept', () => {
  it('默认文案按色名生成，型号为空', () => {
    const c = defaultTextileConcept('#14213D');
    expect(c.colorName).toBe('藏青');
    expect(c.name).toBe('藏青');
    expect(c.code).toBe('');
    expect(c.moodPrompts).toHaveLength(3);
  });

  it('清洗模型输出：型号只保留合法字符，名称/说明限长，缺项补默认', () => {
    const c = sanitizeTextileConcept(
      { name: '苔原绒苔原绒苔原绒', description: 'x'.repeat(400), code: 'NH30425', moodPrompts: ['一张图'] },
      '#6B6B3A'
    );
    expect(c.name.length).toBeLessThanOrEqual(8);
    expect(c.description.length).toBeLessThanOrEqual(160);
    expect(c.code).toBe('NH30425');
    expect(c.moodPrompts).toHaveLength(3);
    expect(c.moodPrompts[0]).toContain('一张图');
    expect(sanitizeTextileConcept({ code: '<script>' }).code).toBe('');
    expect(sanitizeTextileConcept(null).name.length).toBeGreaterThan(0);
  });
});

describe('moodCollage（氛围图拼贴）', () => {
  it('第一张铺满框做底图，其余是叠放的小图且都在框内；六边形版是格子拼块', () => {
    for (const id of ['slant', 'circle'] as const) {
      const frame = TEXTILE_LAYOUTS[id].moodFrame;
      const rects = moodCollage(id, 3);
      expect(rects).toHaveLength(3);
      expect(rects[0].inset).toBeFalsy();
      expect(rects[0].w).toBeGreaterThan(frame.w * 0.95);
      rects.slice(1).forEach(r => {
        expect(r.inset).toBe(true);
        expect(r.x).toBeGreaterThanOrEqual(frame.x);
        expect(r.x + r.w).toBeLessThanOrEqual(frame.x + frame.w);
        expect(r.y + r.h).toBeLessThanOrEqual(frame.y + frame.h);
      });
    }
    expect(moodCollage('hex', 3).every(r => !r.inset)).toBe(true);
    expect(moodCollage('slant', 1)).toHaveLength(1);
  });

  it('圆形版的小图放在大圆右边，不被大圆盖住', () => {
    const c = TEXTILE_LAYOUTS.circle.hero.circle!;
    moodCollage('circle', 4).slice(1).forEach(r => {
      // 小图左上角在圆外
      expect(Math.hypot(r.x - c.cx, r.y - c.cy)).toBeGreaterThan(c.r);
    });
  });
});
