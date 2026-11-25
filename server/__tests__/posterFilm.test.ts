import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { buildPosterFilmPrompt, cropFilmDetails, isNormBox } from '../services/posterTemplate/posterFilm';
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
