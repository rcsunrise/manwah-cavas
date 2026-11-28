import { describe, expect, it } from 'vitest';
import { computeSeedreamSize, fitSeedreamSize, SEEDREAM_MAX_PIXELS, SEEDREAM_MIN_PIXELS } from '../ai/seedreamSize';
import { buildSeedreamPayload, getImageProviderAdapter } from '../ai/imageProviderAdapter';
import { resolveImageModel } from '../ai/modelRegistry';

const px = (s: string) => s.split('x').map(Number).reduce((a, b) => a * b, 1);

describe('computeSeedreamSize', () => {
  it('uses the recommended sizes for common ratios', () => {
    expect(computeSeedreamSize('1:1', '2K')).toBe('2048x2048');
    expect(computeSeedreamSize('16:9', '2K')).toBe('2848x1600');
    expect(computeSeedreamSize('3:4', '4K')).toBe('3520x4704');
    expect(computeSeedreamSize('4:3', '4K')).toBe('4704x3520');
  });

  it('has no 1K tier: 1K falls back to 2K', () => {
    expect(computeSeedreamSize('4:3', '1K')).toBe('2304x1728');
    expect(computeSeedreamSize(undefined, undefined)).toBe('2048x2048');
    expect(computeSeedreamSize('Auto', '1K')).toBe('2048x2048');
  });

  it('keeps an explicit size when it is in range, otherwise scales it into range', () => {
    expect(computeSeedreamSize('4:3', '2K', '2304x1728')).toBe('2304x1728');
    // 海报常用 2048x1536 只有 314 万像素，低于下限：保持 4:3 放大
    const up = computeSeedreamSize('4:3', '2K', '2048x1536');
    const [w, h] = up.split('x').map(Number);
    expect(px(up)).toBeGreaterThanOrEqual(SEEDREAM_MIN_PIXELS);
    expect(Math.abs(w / h - 4 / 3)).toBeLessThan(0.01);
    expect(px(computeSeedreamSize(undefined, undefined, '8000x6000'))).toBeLessThanOrEqual(SEEDREAM_MAX_PIXELS);
  });

  it('computes unusual ratios within the pixel range, multiples of 16', () => {
    for (const r of [5 / 4, 2.35, 1 / 3, 12]) {
      for (const budget of [1_000_000, 4_194_304, 30_000_000]) {
        const [w, h] = fitSeedreamSize(r, budget);
        expect(w % 16).toBe(0);
        expect(h % 16).toBe(0);
        expect(w * h).toBeGreaterThanOrEqual(SEEDREAM_MIN_PIXELS);
        expect(w * h).toBeLessThanOrEqual(SEEDREAM_MAX_PIXELS);
      }
    }
  });
});

describe('seedream payload and registry', () => {
  it('builds a single-image request without watermark', () => {
    const body = buildSeedreamPayload({ model: 'doubao-seedream-5-5', prompt: 'p', size: '2048x2048', images: [] });
    expect(body).toMatchObject({ model: 'doubao-seedream-5-5', size: '2048x2048', watermark: false, response_format: 'b64_json', output_format: 'jpeg' });
    expect(body).not.toHaveProperty('image');
    expect(body).not.toHaveProperty('sequential_image_generation');
  });

  it('sends one reference as a string and several as an array', () => {
    expect(buildSeedreamPayload({ model: 'm', prompt: 'p', size: 's', images: ['https://a/1.jpg'] }).image).toBe('https://a/1.jpg');
    expect(buildSeedreamPayload({ model: 'm', prompt: 'p', size: 's', images: ['https://a/1.jpg', 'data:image/png;base64,xx'] }).image)
      .toEqual(['https://a/1.jpg', 'data:image/png;base64,xx']);
  });

  it('is registered for text-to-image and image edit, without mask, on the doubao endpoint', () => {
    const model = resolveImageModel('doubao-seedream-5-5', 'image_edit');
    expect(resolveImageModel('seedream-5.5', 'text_to_image').id).toBe('doubao-seedream-5-5');
    expect(model.capabilities.mask).toBe(false);
    const adapter = getImageProviderAdapter(model);
    expect(adapter.buildEndpoint('https://api.tiantoken.com/v1', model, 'image_edit')).toBe('https://api.tiantoken.com/api/v3/images/generations');
    expect(adapter.usesMultipart('image_edit')).toBe(false);
  });
});
