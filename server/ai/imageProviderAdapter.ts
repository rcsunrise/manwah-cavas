import type { ImageIntent, ImageModelDefinition, ImageTransport } from './modelRegistry';

export interface ImageProviderAdapter {
  transport: ImageTransport;
  buildEndpoint(baseUrl: string, model: ImageModelDefinition, intent: ImageIntent): string;
  usesMultipart(intent: ImageIntent): boolean;
  buildJsonPayload?(input: JsonMultiImagePayloadInput): JsonMultiImagePayload;
}

export interface JsonMultiImagePayloadInput {
  model: string;
  publicUrls: string[];
  prompt: string;
  size: string;
  aspectRatio?: string;
  quality: string;
  outputFormat: string;
  background?: string;
  moderation?: string;
}

export interface JsonMultiImagePayload {
  model: string;
  image: string[];
  prompt: string;
  n: 1;
  size: string;
  aspect_ratio?: string;
  aspectRatio?: string;
  quality: string;
  output_format: string;
  background?: string;
  moderation?: string;
}

export function normalizeGoogleGenAiBaseUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) return 'https://api.tiantoken.com/v1beta';
  let clean = rawUrl.trim().replace(/\/+$/, '');
  if (!clean.startsWith('http')) clean = 'https://' + clean;
  if (!clean.includes('googleapis.com')) {
    if (!clean.endsWith('/v1beta')) {
      clean = clean.replace(/\/v1\/?$/, '') + '/v1beta';
    }
  }
  return clean;
}

const cleanBase = (baseUrl: string) => baseUrl.replace(/\/+$/, '');
const cleanOpenAiBase = (baseUrl: string) => {
  let clean = cleanBase(baseUrl);
  if (!clean.startsWith('http')) clean = 'https://' + clean;
  return clean.replace(/\/v1beta\/?$/, '').replace(/\/v1\/?$/, '');
};

const geminiNativeAdapter: ImageProviderAdapter = {
  transport: 'gemini_native',
  buildEndpoint(baseUrl, model) {
    const normalized = normalizeGoogleGenAiBaseUrl(baseUrl);
    return `${normalized}/models/${model.id}:generateContent`;
  },
  usesMultipart() {
    return false;
  }
};

const openAiImagesAdapter: ImageProviderAdapter = {
  transport: 'openai_images',
  buildEndpoint(baseUrl, _model, intent) {
    const operation = intent === 'image_edit' ? 'edits' : 'generations';
    return `${cleanOpenAiBase(baseUrl)}/v1/images/${operation}`;
  },
  usesMultipart(intent) {
    return intent === 'image_edit';
  }
};

const openAiImagesJsonMultiAdapter: ImageProviderAdapter = {
  transport: 'openai_images_json_multi',
  buildEndpoint(baseUrl) {
    return `${cleanOpenAiBase(baseUrl)}/v1/images/edits`;
  },
  usesMultipart() {
    return false;
  },
  buildJsonPayload(input) {
    if (input.publicUrls.length === 0 || input.publicUrls.some(url => {
      try {
        return new URL(url).protocol !== 'https:';
      } catch {
        return true;
      }
    })) {
      throw new TypeError('openai_images_json_multi requires at least one public HTTPS image URL.');
    }
    return {
      model: input.model,
      image: [...input.publicUrls],
      prompt: input.prompt,
      n: 1,
      size: input.size,
      ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio, aspectRatio: input.aspectRatio } : {}),
      quality: input.quality,
      output_format: input.outputFormat,
      ...(input.background ? { background: input.background } : {}),
      ...(input.moderation ? { moderation: input.moderation } : {})
    };
  }
};

export interface SeedreamPayloadInput {
  model: string;
  prompt: string;
  size: string;
  /** 参考图：公网 URL 或 data:image/...;base64,...，按顺序对应提示词里的参考图编号 */
  images: string[];
  outputFormat?: string;
}

/** 豆包 Seedream 请求体（网关 Doubao 生图文档）：只出一张、不加水印。
 * 5.5 不认 sequential_image_generation（上游 400 "not supported by the current model"），不传即单图 */
export function buildSeedreamPayload(input: SeedreamPayloadInput): Record<string, unknown> {
  const fmt = input.outputFormat === 'png' ? 'png' : 'jpeg';
  return {
    model: input.model,
    prompt: input.prompt,
    ...(input.images.length === 1 ? { image: input.images[0] } : input.images.length > 1 ? { image: [...input.images] } : {}),
    size: input.size,
    output_format: fmt,
    response_format: 'b64_json',
    watermark: false,
    stream: false
  };
}

const seedreamImagesAdapter: ImageProviderAdapter = {
  transport: 'seedream_images',
  buildEndpoint(baseUrl) {
    return `${cleanOpenAiBase(baseUrl)}/api/v3/images/generations`;
  },
  usesMultipart() {
    return false;
  }
};

const openAiChatCompletionsAdapter: ImageProviderAdapter = {
  transport: 'openai_chat_completions',
  buildEndpoint(baseUrl) {
    return `${cleanOpenAiBase(baseUrl)}/v1/chat/completions`;
  },
  usesMultipart() {
    return false;
  }
};

const adapters: Record<ImageTransport, ImageProviderAdapter> = {
  gemini_native: geminiNativeAdapter,
  openai_images: openAiImagesAdapter,
  openai_images_json_multi: openAiImagesJsonMultiAdapter,
  openai_chat_completions: openAiChatCompletionsAdapter,
  seedream_images: seedreamImagesAdapter
};

export function getImageProviderAdapter(model: ImageModelDefinition): ImageProviderAdapter {
  return adapters[model.transport];
}
