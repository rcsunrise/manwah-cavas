import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { composeFabricPoster } from '../services/posterTemplate/fabricPoster';
import { expandToSquare, mapBoxFromRegion } from '../services/posterTemplate/detailCrop';

describe('细节二次精定位的坐标换算', () => {
  it('放大区域是正方形、以原框为中心、不出图', () => {
    const r = expandToSquare({ left: 0.4, top: 0.4, width: 0.1, height: 0.2 }, 2000, 1000, 1.8);
    expect(r.width * 2000).toBeCloseTo(r.height * 1000, 3);
    expect(r.left + r.width / 2).toBeCloseTo(0.45, 2);
    expect(r.top + r.height / 2).toBeCloseTo(0.5, 2);
    const edge = expandToSquare({ left: 0.95, top: 0.9, width: 0.05, height: 0.1 }, 1000, 1000, 3);
    expect(edge.left + edge.width).toBeLessThanOrEqual(1.0000001);
    expect(edge.top + edge.height).toBeLessThanOrEqual(1.0000001);
  });

  it('区域内的框能换回整图坐标', () => {
    const region = { left: 0.2, top: 0.5, width: 0.4, height: 0.4 };
    const b = mapBoxFromRegion({ left: 0.5, top: 0.25, width: 0.1, height: 0.5 }, region);
    expect(b.left).toBeCloseTo(0.4);
    expect(b.top).toBeCloseTo(0.6);
    expect(b.width).toBeCloseTo(0.04);
    expect(b.height).toBeCloseTo(0.2);
  });
});

describe('抱枕落座', () => {
  // 一个简化的“沙发”：整块不透明矩形，方便判断抱枕底边位置
  const sofa = () => sharp({ create: { width: 1000, height: 500, channels: 4, background: { r: 200, g: 190, b: 170, alpha: 1 } } }).png().toBuffer();
  const pillow = () => sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 60, g: 40, b: 30, alpha: 1 } } }).png().toBuffer();
  const seat = { x: 0.65, y: 0.35, w: 0.28, h: 0.35 };

  it('有折缝时，抱枕底边落在折缝附近，水平仍在右侧座位中间', async () => {
    const r = await composeFabricPoster({
      layout: 'collage4', sofa: await sofa(), pillows: await pillow(), seat, seatCrease: { x: 0.62, y: 0.4 },
      photos: [], circles: [], swatches: [], code: '', label: ''
    });
    const s = r.layout.sofa;
    const p = r.layout.pillows!;
    const bottomRel = (p.y + p.h - s.y) / s.h;
    expect(bottomRel).toBeGreaterThan(0.4);
    expect(bottomRel).toBeLessThan(0.47);
    const centerRel = (p.x + p.w / 2 - s.x) / s.w;
    expect(centerRel).toBeGreaterThan(0.7); // 不跟着折缝框跑到座位左端
    expect(centerRel).toBeLessThan(0.85);
  });

  it('没有折缝时按座面框兜底', async () => {
    const r = await composeFabricPoster({
      layout: 'collage4', sofa: await sofa(), pillows: await pillow(), seat,
      photos: [], circles: [], swatches: [], code: '', label: ''
    });
    const s = r.layout.sofa;
    const p = r.layout.pillows!;
    const bottomRel = (p.y + p.h - s.y) / s.h;
    expect(bottomRel).toBeCloseTo(seat.y + seat.h * 0.42, 1);
  });
});
