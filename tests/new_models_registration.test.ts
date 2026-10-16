import { describe, it, expect } from 'vitest';
import { resolveImageModel } from '../server/ai/modelRegistry';
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
  });
});
