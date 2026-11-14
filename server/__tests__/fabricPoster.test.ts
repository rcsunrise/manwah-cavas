import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  centerSquare,
  composeFabricPoster,
  cutoutWhiteBackground,
  FABRIC_LAYOUTS,
  flattestSquare,
  moodAspectFor,
  moodIndexesFor
} from '../services/posterTemplate/fabricPoster';
import { defaultFabricConcept, MOOD_SHOT_ORDER, pickDirections, sanitizeFabricConcept, SCENE_DIRECTIONS } from '../services/posterTemplate/fabricConcept';

async function solid(w: number, h: number, color: string): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();
}

/** 白底上一块深色矩形，矩形里还有一块近白高光（被主体包围，不能被抠掉） */
async function sofaOnWhite(): Promise<Buffer> {
  const body = await solid(400, 200, '#8a6a4a');
  const highlight = await solid(40, 30, '#fafafa');
  return sharp({ create: { width: 600, height: 400, channels: 3, background: '#ffffff' } })
    .composite([
      { input: body, left: 100, top: 100 },
      { input: highlight, left: 250, top: 150 }
    ])
    .png()
    .toBuffer();
}

async function pixel(buf: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 3;
  return [data[i], data[i + 1], data[i + 2]];
}

describe('cutoutWhiteBackground', () => {
  it('去掉与边缘相连的白底，保留主体内部的高光，并裁掉空白边', async () => {
    const cut = await cutoutWhiteBackground(await sofaOnWhite());
    const meta = await sharp(cut).metadata();
    expect(meta.channels).toBe(4);
    // 主体 400×200，四周各留 4px 余量
    expect(meta.width).toBeGreaterThanOrEqual(400);
    expect(meta.width).toBeLessThanOrEqual(410);
    expect(meta.height).toBeGreaterThanOrEqual(200);
    expect(meta.height).toBeLessThanOrEqual(210);
    const { data, info } = await sharp(cut).raw().toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(info.width - 1, info.height - 1)).toBe(0);
    expect(alphaAt(Math.round(info.width / 2), Math.round(info.height / 2))).toBe(255);
    // 高光在主体里面（相对左上约 150,50 附近 + 余量），仍然不透明
    expect(alphaAt(4 + 150 + 20, 4 + 50 + 15)).toBe(255);
  });

  it('整张都是白色时报错而不是返回空图', async () => {
    await expect(cutoutWhiteBackground(await solid(100, 100, '#ffffff'))).rejects.toThrow('没有识别到主体');
  });
});

describe('composeFabricPoster', () => {
  it.each(['collage4', 'hero3'] as const)('%s 版式输出 A4 横版，氛围照槽位有内容、右下角留白', async layout => {
    const L = FABRIC_LAYOUTS[layout];
    const sofa = await cutoutWhiteBackground(await sofaOnWhite());
    const photoCount = L.photos.length;
    const photos = await Promise.all(Array.from({ length: photoCount }, (_, i) => solid(300, 500, ['#c0392b', '#2980b9', '#27ae60', '#8e44ad'][i])));
    const result = await composeFabricPoster({
      layout,
      sofa,
      pillows: await cutoutWhiteBackground(await sofaOnWhite()),
      photos,
      circles: [await solid(200, 200, '#333333'), await solid(200, 200, '#555555')],
      swatches: [await solid(100, 100, '#aa8866'), await solid(100, 100, '#884422')],
      code: '12595M',
      label: '20250430-6#'
    });
    expect(result.width).toBe(2000);
    expect(result.height).toBe(1414);
    const p0 = L.photos[0];
    const mid = await pixel(result.buffer, Math.round(p0.x + p0.w / 2), Math.round(p0.y + p0.h / 2));
    expect(mid[0] + mid[1] + mid[2]).toBeLessThan(700); // 不是白的
    const corner = await pixel(result.buffer, 1900, 1380);
    expect(corner.every(v => v > 245)).toBe(true); // 右下角留白
    // 圆形细节：圆心有内容，外接正方形的角是白的
    const c0 = L.circles[0];
    const centre = await pixel(result.buffer, Math.round(c0.x + c0.w / 2), Math.round(c0.y + c0.h / 2));
    expect(centre.some(v => v < 120)).toBe(true);
    const cornerOfCircle = await pixel(result.buffer, Math.round(c0.x + 3), Math.round(c0.y + 3));
    expect(cornerOfCircle.every(v => v > 245)).toBe(true);
    expect(result.layout.pillows).toBeTruthy();
  });

  it('outputScale 2 输出 4000×2828，且槽位缺图时留白不报错', async () => {
    const sofa = await cutoutWhiteBackground(await sofaOnWhite());
    const result = await composeFabricPoster({ layout: 'collage4', sofa, photos: [], circles: [], swatches: [], code: '', label: '', outputScale: 2 });
    expect(result.width).toBe(4000);
    expect(result.height).toBe(2828);
    expect(result.layout.pillows).toBeUndefined();
  });
});

describe('版式辅助', () => {
  it('hero3 用大人像 + 场景图 + 街拍（第 1、3、4 条），collage4 用全部', () => {
    expect(moodIndexesFor('collage4')).toEqual([0, 1, 2, 3]);
    expect(moodIndexesFor('hero3')).toEqual([0, 2, 3]);
  });

  it('氛围照画幅贴近槽位：竖长槽位用 9:16，横向灯具槽位用 4:3', () => {
    expect(moodAspectFor('collage4', 0)).toBe('9:16');
    expect(moodAspectFor('collage4', 2)).toBe('4:3');
    expect(moodAspectFor('hero3', 0)).toBe('9:16');
    // hero3 的场景图在小竖槽位（373×540）；没用到的第 2 条给默认画幅
    expect(moodAspectFor('hero3', 2)).toBe('2:3');
    expect(moodAspectFor('hero3', 1)).toBe('3:4');
  });

  it('centerSquare 取中间正方形', async () => {
    const out = await centerSquare(await solid(200, 100, '#123456'), 0.5);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(50);
    expect(meta.height).toBe(50);
  });
});

describe('sanitizeFabricConcept', () => {
  it('模型返回乱七八糟时补齐 4 条氛围照与 2 个细节，色值不合法就用兜底色', () => {
    const c = sanitizeFabricConcept({ leatherColor: 'red', moodShots: [{ key: 'tall', prompt: '  暖色石墙前的女性  ' }], details: [] }, '#C9B8A3');
    expect(c.leatherColor).toBe('#C9B8A3');
    expect(c.moodShots.map(s => s.key)).toEqual(MOOD_SHOT_ORDER);
    expect(c.moodShots[0].prompt).toContain('暖色石墙前的女性');
    expect(c.moodShots.every(s => s.prompt.includes('不要出现任何文字'))).toBe(true);
    expect(c.details).toHaveLength(2);
    expect(c.swatchLocate.length).toBeGreaterThan(0);
  });

  it('合法色值保留并转大写', () => {
    expect(sanitizeFabricConcept({ leatherColor: '#d9b99b' }).leatherColor).toBe('#D9B99B');
  });

  it('默认方案可直接用', () => {
    const c = defaultFabricConcept('#112233', '秋日');
    expect(c.moodShots).toHaveLength(4);
    expect(c.moodShots[0].prompt).toContain('秋日');
  });
});

describe('抱枕大小', () => {
  it('放大时底边和水平中心不动，向上和两侧长大；默认比基准小（参考图里抱枕都比较小）', async () => {
    const sofa = await cutoutWhiteBackground(await sofaOnWhite());
    const pillows = await cutoutWhiteBackground(await sofaOnWhite());
    const base = { layout: 'collage4' as const, sofa, pillows, photos: [], circles: [], swatches: [], code: '', label: '' };
    const one = await composeFabricPoster({ ...base, pillowScale: 1 });
    const big = await composeFabricPoster({ ...base, pillowScale: 1.5 });
    const def = await composeFabricPoster(base);
    const a = one.layout.pillows!;
    const b = big.layout.pillows!;
    expect(b.w).toBeGreaterThan(a.w * 1.4);
    expect(b.y + b.h).toBeCloseTo(a.y + a.h, -1);
    expect(b.x + b.w / 2).toBeCloseTo(a.x + a.w / 2, -1);
    expect(def.layout.pillows!.w).toBeLessThan(a.w);
    expect(def.layout.pillows!.w).toBeGreaterThan(a.w * 0.7);
  });

  it('倍数超出范围会被夹住', async () => {
    const sofa = await cutoutWhiteBackground(await sofaOnWhite());
    const pillows = await cutoutWhiteBackground(await sofaOnWhite());
    const base = { layout: 'collage4' as const, sofa, pillows, photos: [], circles: [], swatches: [], code: '', label: '' };
    const huge = await composeFabricPoster({ ...base, pillowScale: 9 });
    const max = await composeFabricPoster({ ...base, pillowScale: 1.8 });
    expect(huge.layout.pillows!.w).toBe(max.layout.pillows!.w);
    const tiny = await composeFabricPoster({ ...base, pillowScale: 0.1 });
    const min = await composeFabricPoster({ ...base, pillowScale: 0.5 });
    expect(tiny.layout.pillows!.w).toBe(min.layout.pillows!.w);
  });
});

describe('氛围照方向轮换', () => {
  it('避开已用过的方向；全用过了就重新开始', () => {
    const first = pickDirections([], () => 0);
    expect(first.scene.id).toBe(SCENE_DIRECTIONS[0].id);
    const second = pickDirections([first.scene.id, first.portrait.id, first.street.id], () => 0);
    expect(second.scene.id).not.toBe(first.scene.id);
    expect(second.portrait.id).not.toBe(first.portrait.id);
    expect(second.street.id).not.toBe(first.street.id);
    const all = pickDirections(SCENE_DIRECTIONS.map(d => d.id), () => 0);
    expect(all.scene.id).toBe(SCENE_DIRECTIONS[0].id);
  });

  it('默认方案的提示词用的是选中的方向，且概念里保留 tags', () => {
    const dirs = pickDirections([], () => 0.5);
    const c = defaultFabricConcept('#112233', undefined, dirs);
    expect(c.tags?.scene.id).toBe(dirs.scene.id);
    expect(c.moodShots.find(s => s.key === 'ambient')!.prompt).toContain(dirs.scene.seed);
    expect(c.moodShots.find(s => s.key === 'street')!.prompt).toContain(dirs.street.seed);
    expect(sanitizeFabricConcept(c).tags?.portrait.id).toBe(dirs.portrait.id);
  });
});

describe('抱枕放在座面上，不掉出沙发', () => {
  async function base() {
    const sofa = await cutoutWhiteBackground(await sofaOnWhite());
    const pillows = await cutoutWhiteBackground(await sofaOnWhite());
    return { layout: 'collage4' as const, sofa, pillows, photos: [], circles: [], swatches: [], code: '', label: '' };
  }
  const inside = (p: { x: number; y: number; w: number; h: number }, s: { x: number; y: number; w: number; h: number }) =>
    p.x >= s.x && p.y >= s.y && p.x + p.w <= s.x + s.w && p.y + p.h <= s.y + s.h;

  it.each([0.5, 1, 1.8])('倍数 %s 时抱枕完全落在沙发范围内', async scale => {
    const r = await composeFabricPoster({ ...(await base()), pillowScale: scale });
    expect(inside(r.layout.pillows!, r.layout.sofa)).toBe(true);
  });

  it('给了座面框时，抱枕水平中心落在座面里，且不超过座面宽度', async () => {
    const seat = { x: 0.55, y: 0.1, w: 0.35, h: 0.4 };
    const r = await composeFabricPoster({ ...(await base()), seat, pillowScale: 1.8 });
    const s = r.layout.sofa;
    const p = r.layout.pillows!;
    const seatLeft = s.x + seat.x * s.w;
    const seatRight = seatLeft + seat.w * s.w;
    const cx = p.x + p.w / 2;
    expect(cx).toBeGreaterThan(seatLeft);
    expect(cx).toBeLessThan(seatRight);
    expect(p.w).toBeLessThanOrEqual(seat.w * s.w + 1);
    expect(inside(p, s)).toBe(true);
  });
});

describe('皮革色卡取样 flattestSquare', () => {
  it('在满是条纹的沙发里找到那块最平的区域', async () => {
    // 600×300 的“沙发”：整体是竖条纹（模拟缝线/褶皱），只有一块 140×140 的纯色平区
    const w = 600;
    const h = 300;
    const raw = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const stripe = Math.floor(x / 6) % 2 === 0 ? 150 : 205;
        const inFlat = x >= 380 && x < 520 && y >= 120 && y < 260;
        const v = inFlat ? 180 : stripe;
        raw[i] = v;
        raw[i + 1] = v;
        raw[i + 2] = inFlat ? 175 : v;
        raw[i + 3] = 255;
      }
    }
    const sofa = await sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
    const crop = await flattestSquare(sofa, 0.14);
    const { data, info } = await sharp(crop).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let min = 255;
    let max = 0;
    for (let i = 0; i < info.width * info.height; i++) {
      min = Math.min(min, data[i * 3]);
      max = Math.max(max, data[i * 3]);
    }
    expect(max - min).toBeLessThanOrEqual(2); // 取到的是纯色平区，不是条纹
    expect(data[0]).toBe(180);
  });

  it('透明区域不会被取进来', async () => {
    const sofa = await cutoutWhiteBackground(await sofaOnWhite());
    const crop = await flattestSquare(sofa, 0.2);
    const { data, info } = await sharp(crop).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < info.width * info.height; i++) expect(data[i * 4 + 3]).toBeGreaterThan(250);
  });
});

describe('场景图不能抢戏', () => {
  it('ambient 提示词里追加“不出现沙发、人物”', () => {
    const c = sanitizeFabricConcept({ moodShots: [{ key: 'ambient', prompt: '暖光落地灯下的墙面光影' }] });
    const amb = c.moodShots.find(s => s.key === 'ambient')!.prompt;
    expect(amb).toContain('暖光落地灯下的墙面光影');
    expect(amb).toContain('不出现沙发');
    expect(amb).toContain('不出现人物');
    const tall = c.moodShots.find(s => s.key === 'tall')!.prompt;
    expect(tall).not.toContain('不出现沙发');
  });
});
