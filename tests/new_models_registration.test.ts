import { describe, it, expect } from 'vitest';
import { resolveImageModel } from '../server/ai/modelRegistry';
import { getImageProviderAdapter } from '../server/ai/imageProviderAdapter';
import { normalizeGeminiImageResponse } from '../server/ai/imageResponse';
import { SPACE_IMAGE_MODELS, getModelById } from '../src/config/imageModelRegistry';

describe('新增 2 款系列模型注册与协议解析校验', () => {
  describe('1. Google Gemini 家族：Nano Banana 2.1 (gemini-nano-banana-2.1-preview)', () => {
    it('后端 modelRegistry 支持 gemini-nano-banana-2.1-preview 及其别名解析', () => {
      const modelDef = resolveImageModel('gemini-nano-banana-2.1-preview', 'text_to_image');
      expect(modelDef.id).toBe('gemini-nano-banana-2.1-preview');
      expect(modelDef.transport).toBe('gemini_native');
      expect(modelDef.capabilities.textToImage).toBe(true);
      expect(modelDef.capabilities.imageEdit).toBe(true);
      expect(modelDef.capabilities.multiImage).toBe(true);

      // 别名测试
      const aliasDef = resolveImageModel('google/gemini-nano-banana-2.1-preview', 'image_edit');
      expect(aliasDef.id).toBe('gemini-nano-banana-2.1-preview');
      expect(aliasDef.transport).toBe('gemini_native');
    });

    it('前端客户端注册表 SPACE_IMAGE_MODELS 包含 Nano Banana 2.1 且支持 1K/2K/4K', () => {
      const item = getModelById('gemini-nano-banana-2.1-preview');
      expect(item).toBeDefined();
      expect(item.id).toBe('gemini-nano-banana-2.1-preview');
      expect(item.name).toContain('Nano Banana 2.1');
      expect(item.provider).toBe('gemini');
      expect(item.capabilities.supports4K).toBe(true);
      expect(item.capabilities.supportsMultiReference).toBe(true);
    });
  });

  describe('2. OpenAI GPT 家族：GPT 2.5 Flare & GPT 2.5 Sunburst', () => {
    it('后端 modelRegistry 支持 gpt-image-2.5-flare-c 及其别名解析', () => {
      const flareDef = resolveImageModel('gpt-image-2.5-flare-c', 'text_to_image');
      expect(flareDef.id).toBe('gpt-image-2.5-flare-c');
      expect(flareDef.transport).toBe('openai_images');
      expect(flareDef.capabilities.textToImage).toBe(true);
      expect(flareDef.capabilities.imageEdit).toBe(true);

      const flareAlias = resolveImageModel('openai/gpt-image-2.5-flare-c', 'image_edit');
      expect(flareAlias.id).toBe('gpt-image-2.5-flare-c');
      expect(flareAlias.transport).toBe('openai_images');
    });

    it('后端 modelRegistry 支持 gpt-image-2.5-sunburst-c 及其别名解析', () => {
      const sunburstDef = resolveImageModel('gpt-image-2.5-sunburst-c', 'text_to_image');
      expect(sunburstDef.id).toBe('gpt-image-2.5-sunburst-c');
      expect(sunburstDef.transport).toBe('openai_images');
      expect(sunburstDef.capabilities.textToImage).toBe(true);
      expect(sunburstDef.capabilities.imageEdit).toBe(true);

      const sunburstAlias = resolveImageModel('openai/gpt-image-2.5-sunburst-c', 'image_edit');
      expect(sunburstAlias.id).toBe('gpt-image-2.5-sunburst-c');
      expect(sunburstAlias.transport).toBe('openai_images');
    });

    it('前端客户端注册表 SPACE_IMAGE_MODELS 包含 Flare 与 Sunburst 规格', () => {
      const flareItem = getModelById('gpt-image-2.5-flare-c');
      expect(flareItem).toBeDefined();
      expect(flareItem.name).toContain('GPT 2.5 Flare');
      expect(flareItem.provider).toBe('openai');
      expect(flareItem.capabilities.supports4K).toBe(true);

      const sunburstItem = getModelById('gpt-image-2.5-sunburst-c');
      expect(sunburstItem).toBeDefined();
      expect(sunburstItem.name).toContain('GPT 2.5 Sunburst');
      expect(sunburstItem.provider).toBe('openai');
      expect(sunburstItem.capabilities.supports4K).toBe(true);
    });

    it('2.5 系列模型严格走 /v1/images/generations 与 /v1/images/edits 端点', () => {
      const flareGen = resolveImageModel('gpt-image-2.5-flare-c', 'text_to_image');
      const flareAdapter = getImageProviderAdapter(flareGen);
      expect(flareAdapter.buildEndpoint('https://api.tiantoken.com/v1', flareGen, 'text_to_image'))
        .toBe('https://api.tiantoken.com/v1/images/generations');
      expect(flareAdapter.buildEndpoint('https://api.tiantoken.com/v1', flareGen, 'image_edit'))
        .toBe('https://api.tiantoken.com/v1/images/edits');
      expect(flareAdapter.usesMultipart('text_to_image')).toBe(false);
      expect(flareAdapter.usesMultipart('image_edit')).toBe(true);

      const sunburstGen = resolveImageModel('gpt-image-2.5-sunburst-c', 'text_to_image');
      const sunburstAdapter = getImageProviderAdapter(sunburstGen);
      expect(sunburstAdapter.buildEndpoint('https://api.tiantoken.com/v1', sunburstGen, 'text_to_image'))
        .toBe('https://api.tiantoken.com/v1/images/generations');
      expect(sunburstAdapter.buildEndpoint('https://api.tiantoken.com/v1', sunburstGen, 'image_edit'))
        .toBe('https://api.tiantoken.com/v1/images/edits');
    });
  });

  describe('3. OpenAI GPT 2.6 家族：gpt-image-2.6-flare-c & gpt-image-2.6-sunburst-c (/v1/images)', () => {
    it('后端 modelRegistry 支持 gpt-image-2.6-flare-c 与 gpt-image-2.6-sunburst-c 及其别名解析', () => {
      const flare26 = resolveImageModel('gpt-image-2.6-flare-c', 'text_to_image');
      expect(flare26.id).toBe('gpt-image-2.6-flare-c');
      expect(flare26.transport).toBe('openai_images');
      expect(flare26.capabilities.textToImage).toBe(true);
      expect(flare26.capabilities.imageEdit).toBe(true);

      const sunburst26 = resolveImageModel('openai/gpt-image-2.6-sunburst-c', 'image_edit');
      expect(sunburst26.id).toBe('gpt-image-2.6-sunburst-c');
      expect(sunburst26.transport).toBe('openai_images');
      expect(sunburst26.capabilities.textToImage).toBe(true);
      expect(sunburst26.capabilities.imageEdit).toBe(true);
    });

    // 网关实测：2.6 在 chat/completions 返回 "This model is not supported on the Chat Completions endpoint"，
    // 只能走 /v1/images/generations 与 /v1/images/edits（与 2.5 相同）
    it('2.6 系列模型走 /v1/images 端点（生图 JSON，改图 Multipart）', () => {
      const flare26 = resolveImageModel('gpt-image-2.6-flare-c', 'image_edit');
      const adapter = getImageProviderAdapter(flare26);
      expect(adapter.buildEndpoint('https://api.tiantoken.com/v1beta', flare26, 'text_to_image'))
        .toBe('https://api.tiantoken.com/v1/images/generations');
      expect(adapter.buildEndpoint('https://api.tiantoken.com/v1', flare26, 'image_edit'))
        .toBe('https://api.tiantoken.com/v1/images/edits');
      expect(adapter.usesMultipart('text_to_image')).toBe(false);
      expect(adapter.usesMultipart('image_edit')).toBe(true);
    });

    it('能够正确解析 /v1/chat/completions 返回的 Markdown 链接、Data URL 或 images 数组', () => {
      const fakeB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='.repeat(3);
      const parsedB64 = normalizeGeminiImageResponse({
        id: 'chatcmpl-26',
        choices: [
          {
            message: {
              role: 'assistant',
              content: `![generated](data:image/png;base64,${fakeB64})`
            }
          }
        ]
      }, { actualModel: 'gpt-image-2.6-sunburst-c', provider: 'tiantoken' });
      expect(parsedB64.images).toHaveLength(1);
      expect(parsedB64.images[0].data).toBe(fakeB64);

      const parsedUrl = normalizeGeminiImageResponse({
        id: 'chatcmpl-26-url',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Here is your image: ![image](https://cdn.example.com/generated/26_flare_output.png)'
            }
          }
        ]
      }, { actualModel: 'gpt-image-2.6-flare-c', provider: 'tiantoken' });
      expect(parsedUrl.images).toHaveLength(1);
      expect(parsedUrl.images[0].data).toBe('https://cdn.example.com/generated/26_flare_output.png');
    });

    it('前端客户端注册表 SPACE_IMAGE_MODELS 包含 2.6 Flare 与 2.6 Sunburst', () => {
      const flare26Item = getModelById('gpt-image-2.6-flare-c');
      expect(flare26Item.id).toBe('gpt-image-2.6-flare-c');
      expect(flare26Item.capabilities.supports4K).toBe(true);

      const sunburst26Item = getModelById('openai/gpt-image-2.6-sunburst-c');
      expect(sunburst26Item.id).toBe('gpt-image-2.6-sunburst-c');
      expect(sunburst26Item.capabilities.supports4K).toBe(true);
    });
  });
});
