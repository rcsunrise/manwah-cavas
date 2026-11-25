import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { buildPosterFilmPrompt, cropFilmDetails, heroFromEditedPoster, isNormBox } from '../services/posterTemplate/posterFilm';
import { buildMultiReferenceRequest, VectorEngineVideoAdapter } from '../services/video/providers/vectorEngineAdapter';
import { resolveVideoCapability, validateVideoSettings } from '../services/video/videoCapabilityRegistry';

const settings = { durationSeconds: 15, resolution: '1080p', ratio: '16:9', audioMode: 'native' } as any;

describe('poster film · references', () => {
  it('upscales tiny detail crops past the 90k-pixel minimum of sd-2.5', async () => {
    const hero = await sharp({ create: { width: 1200, height: 675, channels: 3, background: '#333' } }).jpeg().toBuffer();
    const crops = await cropFilmDetails(hero, [
      { left: 0.83, top: 0.33, width: 0.02, height: 0.09 },
      { left: 0.5, top: 0.3, width: 0.2, height: 0.2 }
    ]);
    expect(crops).toHaveLength(2);
    for (const c of crops) {
      const m = await sharp(c).metadata();
      expect(Math.min(m.width!, m.height!)).toBeGreaterThanOrEqual(640);
      expect(m.width! * m.height!).toBeGreaterThanOrEqual(90000);
    }
  });

  it('accepts only finite positive boxes', () => {
    expect(isNormBox({ left: 0.1, top: 0.2, width: 0.3, height: 0.4 })).toBe(true);
    expect(isNormBox({ left: 0.1, top: 0.2, width: 0, height: 0.4 })).toBe(false);
    expect(isNormBox({ left: '0.1', top: 0.2, width: 0.3, height: 0.4 })).toBe(false);
    expect(isNormBox(null)).toBe(false);
  });

  it('prompt numbers details from 图2, keeps close-ups in the hero scene and bans on-screen text', () => {
    const p = buildPosterFilmPrompt(['宽厚扶手', '分段靠背'], 15, { productName: '展澜' });
    expect(p).toContain('15 秒的横屏 16:9');
    expect(p).toContain('图2是「宽厚扶手」');
    expect(p).toContain('图3是「分段靠背」');
    expect(p).toContain('不要出现白墙');
    expect(p).toContain('不要出现任何文字');
    expect(p).toContain('不要变成黄昏、夜晚');
  });

  it('adds no person when the hero has none, and keeps the hero person when it has one', () => {
    const none = buildPosterFilmPrompt(['智能触控'], 15, { person: '' });
    expect(none).not.toContain('人物在沙发上放松');
    expect(none).toContain('不要出现人物、模特、手');
    const withGeneric = buildPosterFilmPrompt(['智能触控'], 15, { person: '图1里那位人物' });
    expect(withGeneric).toContain('图1中的人物在沙发上放松');
    expect(withGeneric).not.toContain('不要出现人物');
    const withDesc = buildPosterFilmPrompt([], 15, { person: '一位穿浅色针织衫的女性' });
    expect(withDesc).toContain('图1中的人物（一位穿浅色针织衫的女性）');
  });
});

describe('poster film · edited poster → hero', () => {
  // 原图 1600×900 纯蓝；改后海报 2048×1536：主场景区是原图 cover 上去，左上压了黑色标题，右侧加了一块红（改图加的人物）
  const makePoster = async (sceneColor: string) => {
    const regionH = Math.round(1536 * 0.765);
    const scene = await sharp({ create: { width: 2048, height: regionH, channels: 3, background: sceneColor } })
      .composite([
        { input: { create: { width: 500, height: 160, channels: 3, background: '#000000' } }, left: 150, top: 110 },
        { input: { create: { width: 200, height: 300, channels: 3, background: '#ff0000' } }, left: 1500, top: 500 }
      ])
      .png()
      .toBuffer();
    return sharp({ create: { width: 2048, height: 1536, channels: 3, background: '#f5f0e8' } }).composite([{ input: scene, left: 0, top: 0 }]).png().toBuffer();
  };
  const pixel = async (buf: Buffer, x: number, y: number) => {
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };

  it('keeps edits outside the title zone and patches the title zone from the original hero', async () => {
    const hero = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#2050c0' } }).jpeg().toBuffer();
    const out = await heroFromEditedPoster(hero, await makePoster('#2050c0'), { titleSide: 'left' });
    expect(out).not.toBeNull();
    const m = await sharp(out!).metadata();
    expect([m.width, m.height]).toEqual([1600, 900]);
    // 红块（改图加的人物）保留：海报 x≈1600,y≈650 → 原图坐标约 (1250, 510)
    const [r, g] = await pixel(out!, 1250, 510);
    expect(r).toBeGreaterThan(180);
    expect(g).toBeLessThan(80);
    // 标题黑块被原图蓝色补掉
    const [tr, tg, tb] = await pixel(out!, 300, 150);
    expect(tb).toBeGreaterThan(150);
    expect(tr + tg).toBeLessThan(200);
  });

  it('fills the title zone by blurring when the whole scene changed', async () => {
    const hero = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#e0e0e0' } }).jpeg().toBuffer();
    const out = await heroFromEditedPoster(hero, await makePoster('#202020'), { titleSide: 'left' });
    // 换成暗场景后，标题区不能出现原图的浅灰补丁
    const [v] = await pixel(out!, 300, 150);
    expect(v).toBeLessThan(90);
  });

  it('returns null for an image that is not a 4:3 poster', async () => {
    const hero = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#2050c0' } }).jpeg().toBuffer();
    const notPoster = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#2050c0' } }).png().toBuffer();
    expect(await heroFromEditedPoster(hero, notPoster)).toBeNull();
  });
});

describe('video adapter · multi_reference', () => {
  it('tags every image as reference_image and puts ratio at the top level too', () => {
    const req = buildMultiReferenceRequest('sd-2.5', { modelKey: 'sd-2.5', prompt: 'p', settings, referenceMode: 'multi_reference' }, ['https://a/1.jpg', 'https://a/2.jpg']);
    expect(req.path).toBe('/v1/video/generations');
    expect(req.body.ratio).toBe('16:9');
    expect(req.body.metadata).toMatchObject({ ratio: '16:9', resolution: '1080p', generate_audio: true });
    expect(req.body.duration).toBe(15);
    expect(req.body.references).toEqual([
      { type: 'image_url', url: 'https://a/1.jpg', role: 'reference_image' },
      { type: 'image_url', url: 'https://a/2.jpg', role: 'reference_image' }
    ]);
  });

  it('sends omni_reference_task_type only to sd-2.5 (sd-2.0 rejects it)', () => {
    const input = { modelKey: 'x', prompt: 'p', settings, referenceMode: 'multi_reference' as const };
    expect(buildMultiReferenceRequest('sd-2.5', input, ['u']).body.metadata.omni_reference_task_type).toBe('auto');
    expect('omni_reference_task_type' in buildMultiReferenceRequest('sd-2.0', input, ['u']).body.metadata).toBe(false);
    expect('output_format' in buildMultiReferenceRequest('sd-2.0', input, ['u']).body.metadata).toBe(false);
  });

  it('validates multi_reference on sd-2.5 and rejects models without it', () => {
    const urls = ['a', 'b', 'c', 'd', 'e'];
    expect(VectorEngineVideoAdapter.validate({ modelKey: 'sd-2.5', prompt: 'p', settings, referenceMode: 'multi_reference', referenceImageUrls: urls }).valid).toBe(true);
    expect(VectorEngineVideoAdapter.validate({ modelKey: 'sd-2.0-fast', prompt: 'p', settings, referenceMode: 'multi_reference', referenceImageUrls: urls }).valid).toBe(false);
    expect(VectorEngineVideoAdapter.validate({ modelKey: 'sd-2.5', prompt: 'p', settings, referenceMode: 'multi_reference', referenceImageUrls: [] }).valid).toBe(false);
  });

  it('does not widen the image limit of single-frame mode', () => {
    const cap = resolveVideoCapability('sd-2.5');
    expect(validateVideoSettings(cap, { durationSeconds: 5, resolution: '1080p', ratio: '16:9', audioMode: 'none' } as any, 2).valid).toBe(false);
  });
});
