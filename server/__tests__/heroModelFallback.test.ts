import { describe, expect, it } from 'vitest';
import { heroFallbackModel, isUpstreamDrop } from '../routes/posterTemplateRoutes';

describe('主场景生图断连换模型', () => {
  it('GPT 系列断连改用 Nano Banana，Nano Banana 本身不换', () => {
    expect(heroFallbackModel('gpt-image-2.6-flare-c')).toBe('gemini-nano-banana-2.1-preview');
    expect(heroFallbackModel('openai/gpt-image-2.6-flare-c')).toBe('gemini-nano-banana-2.1-preview');
    expect(heroFallbackModel('openai/gpt-image-2.5-flare-c')).toBe('gemini-nano-banana-2.1-preview');
    expect(heroFallbackModel('gemini-nano-banana-2.1-preview')).toBeUndefined();
  });
  it('只有断连 / 超时才换，余额不足不换', () => {
    expect(isUpstreamDrop(new Error('fetch failed (UND_ERR_SOCKET)'))).toBe(true);
    expect(isUpstreamDrop(new Error('The operation was aborted due to timeout'))).toBe(true);
    expect(isUpstreamDrop(new Error('余额不足'))).toBe(false);
    expect(isUpstreamDrop(new Error('内容审核未通过'))).toBe(false);
  });
});
