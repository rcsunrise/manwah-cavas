import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { boxFrom2d, cropRectForBox } from '../services/posterTemplate/detailCrop';
import { buildTemplateAHeroPrompt, cutAtPunctuation, sanitizeConcept } from '../services/posterTemplate/posterConcept';
import { availableTitleWidth, chooseTitleSide, composeTemplateA, stripPalette, needsScrim, normalizeHexColor, pickTextScheme, TEMPLATE_A_SIZE } from '../services/posterTemplate/templateA';
import { resolvePosterFont } from '../services/posterTemplate/posterFonts';
import { isAllowedImageSource } from '../routes/posterTemplateRoutes';
import { namesCollide, pickSceneDirection, SCENE_DIRECTIONS } from '../services/posterTemplate/sceneDirections';

describe('poster template A · detail crop', () => {
  it('parses Gemini box_2d (ymin, xmin, ymax, xmax on 0-1000)', () => {
    expect(boxFrom2d([435, 169, 765, 267])).toEqual({ left: 0.169, top: 0.435, width: 0.098, height: 0.33 });
    expect(boxFrom2d([10, 10, 10, 500])).toBeNull();
    expect(boxFrom2d('nope')).toBeNull();
  });

  it('crops to the tile aspect while keeping the part centred and inside the image', () => {
    const rect = cropRectForBox({ left: 0.4, top: 0.3, width: 0.2, height: 0.2 }, 2000, 1000, 1.05);
    expect(rect.width / rect.height).toBeCloseTo(1.05, 1);
    expect(rect.left + rect.width / 2).toBeCloseTo(1000, -1);
    expect(rect.top + rect.height / 2).toBeCloseTo(400, -1);
  });

  it('enlarges tiny parts (sofa feet) to a minimum width and shifts crops back inside the frame', () => {
    const rect = cropRectForBox({ left: 0.97, top: 0.95, width: 0.02, height: 0.03 }, 2000, 1000, 1.05);
    expect(rect.width).toBeGreaterThanOrEqual(199);
    expect(rect.left + rect.width).toBeLessThanOrEqual(2000);
    expect(rect.top + rect.height).toBeLessThanOrEqual(1000);
  });
});

describe('poster template A · layout decisions', () => {
  it('puts the title on the cleaner side, defaulting to the left', () => {
    expect(chooseTitleSide({ luminance: 180, busyness: 60 }, { luminance: 180, busyness: 20 })).toBe('right');
    expect(chooseTitleSide({ luminance: 180, busyness: 30 }, { luminance: 180, busyness: 28 })).toBe('left');
  });

  it('chooses text colour and scrim from the background under the title', () => {
    expect(pickTextScheme({ luminance: 200, busyness: 20 })).toBe('dark');
    expect(pickTextScheme({ luminance: 60, busyness: 20 })).toBe('light');
    expect(needsScrim({ luminance: 200, busyness: 20 })).toBe(false);
    expect(needsScrim({ luminance: 140, busyness: 20 })).toBe(true);
    expect(needsScrim({ luminance: 200, busyness: 70 })).toBe(true);
  });

  it('narrows title lines that run into the product, leaving lines above it at full width', () => {
    const product = { left: 540, top: 360, right: 1820, bottom: 900 };
    expect(availableTitleWidth('left', 130, 140, product, 143, 778, 2048)).toBe(778);
    expect(availableTitleWidth('left', 440, 40, product, 143, 778, 2048)).toBe(349);
    expect(availableTitleWidth('right', 440, 40, product, 143, 778, 2048)).toBe(280);
    expect(availableTitleWidth('left', 440, 40, null, 143, 778, 2048)).toBe(778);
  });

  it('switches the detail strip to light text on a dark background', () => {
    expect(stripPalette('#14213A').title).toBe('#F4EDE2');
    expect(stripPalette('#F7F3EE').title).toBe('#2E241C');
    expect(stripPalette('not-a-colour').bg).toBe('#F7F3EE');
  });

  it('only accepts #RRGGBB accent colours', () => {
    expect(normalizeHexColor('#c27d38')).toBe('#c27d38');
    expect(normalizeHexColor('red')).toBe('#A8743F');
  });
});

describe('poster template A · concept sanitising', () => {
  it('trims over-long copy, fixes duplicate detail keys and pads to three details', () => {
    const concept = sanitizeConcept({
      name: '琥光琥光琥光',
      subtitle: '温润如琥，沉浸暮色暖光',
      titleSide: 'middle',
      accentColor: 'orange',
      details: [
        { key: 'armrest', locate: '扶手', title: '充盈枕臂扶手设计', desc: '外展包覆 · 巧嵌按键' },
        { key: 'armrest', locate: '另一侧扶手', title: '扶手', desc: '饱满' }
      ]
    });
    expect(concept.name).toBe('琥光琥光');
    expect(concept.titleSide).toBe('left');
    expect(concept.accentColor).toBe('#A8743F');
    expect(concept.details).toHaveLength(3);
    expect(Array.from(concept.details[0].title).length).toBeLessThanOrEqual(7);
    expect(new Set(concept.details.map(d => d.key)).size).toBe(3);
  });
});

describe('poster template A · packaging mark', () => {
  it('keeps the packaging film and logo in the prompt only when the product has one', () => {
    const withPack = buildTemplateAHeroPrompt(sanitizeConcept({ name: '银弧', packaging: '底部透明包装膜，印红色飞机图标和蓝色 CHEERS 字样' }));
    expect(withPack).toContain('必须原样保留');
    expect(withPack).toContain('CHEERS');
    expect(withPack).toContain('除沙发上原有的包装标识外');

    const noPack = buildTemplateAHeroPrompt(sanitizeConcept({ name: '银弧' }));
    expect(noPack).toContain('没有包装膜和品牌标识');
    expect(noPack).not.toContain('必须原样保留');
  });
});

describe('poster template A · copy length', () => {
  it('cuts over-long lines at the last punctuation instead of mid-phrase', () => {
    expect(cutAtPunctuation('灵感源于都市云端之上的静谧，与头层真皮细腻触感的温柔相遇在每一个午后时光里', 20)).toBe('灵感源于都市云端之上的静谧');
    expect(cutAtPunctuation('柔和之间，自有锋芒', 13)).toBe('柔和之间，自有锋芒');
    expect(cutAtPunctuation('没有任何标点的一句很长很长很长的话', 8)).toBe('没有任何标点的一');
  });
});

describe('poster template A · variety', () => {
  it('treats reordered characters as the same name', () => {
    expect(namesCollide('云栖', '栖云')).toBe(true);
    expect(namesCollide('暖丘', '暖丘')).toBe(true);
    expect(namesCollide('云栖', '云憩')).toBe(false);
    expect(namesCollide('', '云栖')).toBe(false);
  });

  it('rotates to a scene direction this product has not used yet, avoiding the over-used window view', () => {
    const used = ['future_arch', 'night_city', 'cosmic'];
    for (let i = 0; i < 20; i++) {
      const picked = pickSceneDirection(used, () => i / 20);
      expect(used).not.toContain(picked.id);
      expect(picked.id).not.toBe('valley_window');
    }
  });

  it('falls back to the least recently used directions once all have been used', () => {
    const all = SCENE_DIRECTIONS.map(d => d.id);
    const recent = new Set(all.slice(-Math.ceil(all.length / 2)));
    for (let i = 0; i < 10; i++) {
      expect(recent.has(pickSceneDirection(all, () => i / 10).id)).toBe(false);
    }
  });
});

describe('poster template routes · image source allowlist', () => {
  it('accepts data URLs and canvas assets, rejects arbitrary hosts and traversal', () => {
    expect(isAllowedImageSource('data:image/png;base64,AAAA')).toBe(true);
    expect(isAllowedImageSource('/api/canvases/assets/asset_123')).toBe(true);
    expect(isAllowedImageSource('/api/canvases/assets/../../etc/passwd')).toBe(false);
    expect(isAllowedImageSource('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isAllowedImageSource('https://example.com/a.png')).toBe(false);
    expect(isAllowedImageSource(42)).toBe(false);
  });
});

let fontsAvailable = true;
try {
  resolvePosterFont('serif');
  resolvePosterFont('sans');
} catch {
  fontsAvailable = false;
}

describe.skipIf(!fontsAvailable)('poster template A · composition', () => {
  it('renders a 2048x1536 poster with real fonts', async () => {
    const solid = (w: number, h: number, c: string) => sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();
    const result = await composeTemplateA({
      hero: await solid(1600, 900, '#EDE4D8'),
      title: { name: '琥光', subtitle: '温润如琥，沉浸暮色', inspiration: '灵感源于琥珀色调与暮光' },
      titleSide: 'auto',
      details: [
        { image: await solid(300, 300, '#C27D38'), title: '弧面扶手', desc: '圆润包覆 · 分割缝线' },
        { image: await solid(300, 300, '#B06A2A'), title: '分段靠背', desc: '立体拉点 · 双段承托' },
        { image: await solid(300, 300, '#999999'), title: '金属圆足', desc: '精炼矮足 · 沉稳托底' }
      ]
    });
    const meta = await sharp(result.buffer).metadata();
    expect(meta.width).toBe(TEMPLATE_A_SIZE.width);
    expect(meta.height).toBe(TEMPLATE_A_SIZE.height);
    expect(result.layout.textScheme).toBe('dark');
    expect(result.layout.titleSide).toBe('left');
  }, 20000);

  it('outputScale 2 renders 4096x3072 with the same layout (scaled-up 2048 version ≈ the 4K one)', async () => {
    const solid = (w: number, h: number, c: string) => sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();
    const input = {
      hero: await solid(1600, 900, '#EDE4D8'),
      title: { name: '琥光', subtitle: '温润如琥，沉浸暮色', inspiration: '灵感源于琥珀色调与暮光' },
      titleSide: 'left' as const,
      productBox: { left: 0.3, top: 0.45, width: 0.4, height: 0.4 },
      details: [
        { image: await solid(300, 300, '#C27D38'), title: '弧面扶手', desc: '圆润包覆 · 分割缝线' },
        { image: await solid(300, 300, '#B06A2A'), title: '分段靠背', desc: '立体拉点 · 双段承托' },
        { image: await solid(300, 300, '#999999'), title: '金属圆足', desc: '精炼矮足 · 沉稳托底' }
      ]
    };
    const one = await composeTemplateA(input);
    const two = await composeTemplateA({ ...input, outputScale: 2 });
    expect([two.width, two.height]).toEqual([TEMPLATE_A_SIZE.width * 2, TEMPLATE_A_SIZE.height * 2]);
    expect((await sharp(two.buffer).metadata()).width).toBe(4096);
    expect(two.layout.titleSide).toBe(one.layout.titleSide);
    expect(two.layout.textScheme).toBe(one.layout.textScheme);
    // 把 4K 缩回 2048 与 1x 逐像素对比：版式一致则平均差异很小
    const a = await sharp(one.buffer).raw().toBuffer();
    const b = await sharp(two.buffer).resize(2048, 1536).raw().toBuffer();
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
    expect(diff / a.length).toBeLessThan(4);
    if (process.env.POSTER_DUMP) {
      await sharp(one.buffer).toFile(`${process.env.POSTER_DUMP}/a1x.jpg`);
      await sharp(two.buffer).resize(1024, 768).toFile(`${process.env.POSTER_DUMP}/a2x_small.jpg`);
    }
  }, 40000);
});
