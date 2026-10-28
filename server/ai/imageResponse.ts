export interface NormalizedImage {
  mimeType: string;
  data: string;
}

export interface NormalizedImageResponse {
  success: true;
  images: NormalizedImage[];
  actualModel: string;
  provider: string;
  providerRequestId?: string;
  finishReasons?: string[];
  usage?: unknown;
  candidates: Array<{
    content: { parts: Array<{ inlineData: NormalizedImage }> };
    finishReason?: string;
  }>;
}

const isValidImage = (image: NormalizedImage) =>
  typeof image.data === 'string' &&
  (image.data.length > 100 || /^https?:\/\//i.test(image.data)) &&
  image.mimeType.startsWith('image/');

export function buildNormalizedImageResponse(
  images: NormalizedImage[],
  context: {
    actualModel: string;
    provider: string;
    providerRequestId?: string;
    finishReasons?: string[];
    usage?: unknown;
  }
): NormalizedImageResponse {
  const validImages = images.filter(isValidImage);
  if (validImages.length === 0) throw new Error('上游接口未返回有效图像数据。');
  return {
    success: true,
    images: validImages,
    actualModel: context.actualModel,
    provider: context.provider,
    providerRequestId: context.providerRequestId,
    finishReasons: context.finishReasons,
    usage: context.usage,
    candidates: validImages.map((image, index) => ({
      content: { parts: [{ inlineData: image }] },
      finishReason: context.finishReasons?.[index]
    }))
  };
}

function normalizeImageMime(rawMime?: string): string {
  if (!rawMime || typeof rawMime !== 'string') return 'image/jpeg';
  const trimmed = rawMime.trim().toLowerCase();
  if (trimmed.startsWith('image/')) return trimmed;
  if (['png', 'jpeg', 'jpg', 'webp', 'gif'].includes(trimmed)) {
    return trimmed === 'jpg' ? 'image/jpeg' : `image/${trimmed}`;
  }
  return 'image/png';
}

function extractImagesFromText(textStr: string, target: NormalizedImage[]): void {
  const dataUrlMatch = textStr.match(/data:(image\/[a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=\s]+)/);
  if (dataUrlMatch) {
    const cleanB64 = dataUrlMatch[2].replace(/\s+/g, '');
    if (cleanB64.length > 100) {
      target.push({
        mimeType: normalizeImageMime(dataUrlMatch[1]),
        data: cleanB64
      });
      return;
    }
  }
  const mdUrlMatch = textStr.match(/!\[[^\]]*\]\((https?:\/\/[^\s"'<>\)]+)\)/i);
  const extUrlMatch = textStr.match(/(https?:\/\/[^\s"'<>\)]+\.(?:png|jpg|jpeg|webp|gif)(?:\?[^\s"'<>\)]*)?)/i);
  const singleUrlMatch = /^https?:\/\/[^\s"'<>\)]+$/i.test(textStr) ? [textStr, textStr] : null;
  const urlMatch = mdUrlMatch || extUrlMatch || singleUrlMatch;
  if (urlMatch) {
    target.push({
      mimeType: 'image/png',
      data: urlMatch[1] || urlMatch[0]
    });
  }
}

export function normalizeGeminiImageResponse(
  raw: any,
  context: { actualModel: string; provider: string }
): NormalizedImageResponse {
  const images: NormalizedImage[] = [];
  const finishReasons: string[] = [];
  let collectedText = '';

  for (const candidate of Array.isArray(raw?.candidates) ? raw.candidates : []) {
    if (candidate?.finishReason) finishReasons.push(String(candidate.finishReason));
    const partsList = Array.isArray(candidate?.content?.parts)
      ? candidate.content.parts
      : Array.isArray(candidate?.parts)
      ? candidate.parts
      : [];
    for (const part of partsList) {
      const inlineData = part?.inlineData || part?.inline_data;
      const fileData = part?.fileData || part?.file_data;
      const imageUrlObj = part?.image_url || part?.imageUrl;
      if (inlineData?.data && typeof inlineData.data === 'string') {
        const rawDataStr = inlineData.data.trim();
        const strippedB64 = rawDataStr.startsWith('data:')
          ? rawDataStr.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '')
          : rawDataStr.startsWith('http://') || rawDataStr.startsWith('https://')
          ? rawDataStr
          : rawDataStr.replace(/\s+/g, '');
        images.push({
          mimeType: normalizeImageMime(inlineData.mimeType || inlineData.mime_type),
          data: strippedB64
        });
      } else if (fileData?.fileUri || fileData?.file_uri) {
        images.push({
          mimeType: normalizeImageMime(fileData.mimeType || fileData.mime_type || 'image/png'),
          data: String(fileData.fileUri || fileData.file_uri).trim()
        });
      } else if (imageUrlObj) {
        const u = typeof imageUrlObj === 'string' ? imageUrlObj : imageUrlObj?.url;
        if (typeof u === 'string' && u.trim()) {
          extractImagesFromText(u.trim(), images);
        }
      } else if (part?.text) {
        const textStr = String(part.text).trim();
        if (textStr) {
          collectedText += (collectedText ? ' | ' : '') + textStr;
          extractImagesFromText(textStr, images);
        }
      }
    }
  }

  // Fallback 1: compatible with relay gateways that return OpenAI-style { data: [{ b64_json / url }] }
  if (images.length === 0 && Array.isArray(raw?.data)) {
    for (const item of raw.data) {
      const b64Val = item?.b64_json || item?.b64 || item?.base64 || item?.image;
      if (typeof b64Val === 'string' && b64Val.length > 100) {
        images.push({
          mimeType: normalizeImageMime(item.mime_type || item.mimeType || 'image/png'),
          data: b64Val.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '')
        });
      } else if (typeof item?.url === 'string' && item.url.trim()) {
        images.push({ mimeType: 'image/png', data: item.url.trim() });
      }
    }
  }

  // Fallback 2: compatible with relay gateways that wrap Gemini image responses in OpenAI Chat { choices: [{ message }] }
  if (images.length === 0 && Array.isArray(raw?.choices)) {
    for (const choice of raw.choices) {
      const msg = choice?.message;
      if (Array.isArray(msg?.images)) {
        for (const imgItem of msg.images) {
          const u = imgItem?.image_url?.url || imgItem?.url || (typeof imgItem === 'string' ? imgItem : '');
          if (typeof u === 'string' && u.trim()) {
            extractImagesFromText(u.trim(), images);
          }
        }
      }
      if (typeof msg?.content === 'string' && msg.content.trim()) {
        const textStr = msg.content.trim();
        collectedText += (collectedText ? ' | ' : '') + textStr;
        extractImagesFromText(textStr, images);
      } else if (Array.isArray(msg?.content)) {
        for (const cPart of msg.content) {
          const u = cPart?.image_url?.url || cPart?.url;
          if (typeof u === 'string' && u.trim()) {
            extractImagesFromText(u.trim(), images);
          } else if (typeof cPart?.text === 'string' && cPart.text.trim()) {
            extractImagesFromText(cPart.text.trim(), images);
          }
        }
      }
    }
  }

  // Fallback 3: top-level imageUrl / url
  if (images.length === 0 && typeof (raw?.imageUrl || raw?.url) === 'string') {
    extractImagesFromText(String(raw.imageUrl || raw.url).trim(), images);
  }

  if (images.length === 0) {
    const upstreamErrMsg = typeof raw?.error === 'string' ? raw.error : raw?.error?.message;
    if (upstreamErrMsg) {
      throw new Error(`上游接口返回错误: ${upstreamErrMsg}`);
    }
    const blockReason = raw?.promptFeedback?.blockReason || raw?.candidates?.[0]?.finishMessage;
    if (blockReason) {
      throw new Error(`上游接口拦截或未生成图像 (${blockReason})`);
    }
    if (collectedText) {
      throw new Error(`上游模型未返回图片数据流，仅返回了文本内容: "${collectedText.slice(0, 120)}${collectedText.length > 120 ? '...' : ''}"`);
    }
    const reasonSuffix = finishReasons.length > 0 ? ` (finishReason: ${finishReasons.join(', ')})` : '';
    throw new Error(`上游接口未返回有效图像数据。${reasonSuffix}`);
  }

  return buildNormalizedImageResponse(images, {
    ...context,
    providerRequestId: raw?.responseId || raw?.id,
    finishReasons,
    usage: raw?.usageMetadata || raw?.usage
  });
}

export function normalizeOpenAiImageResponse(
  raw: any,
  context: { actualModel: string; provider: string }
): NormalizedImageResponse {
  const images: NormalizedImage[] = [];
  const finishReasons: string[] = [];

  for (const item of Array.isArray(raw?.data) ? raw.data : []) {
    if (item?.b64_json) {
      images.push({
        mimeType: 'image/png',
        data: item.b64_json
      });
      if (item?.revised_prompt) {
        finishReasons.push(`revised_prompt:${item.revised_prompt.substring(0, 50)}`);
      }
    } else if (item?.url) {
      images.push({
        mimeType: 'image/png',
        data: item.url
      });
    }
  }

  return buildNormalizedImageResponse(images, {
    ...context,
    providerRequestId: raw?.created ? String(raw.created) : undefined,
    finishReasons: finishReasons.length > 0 ? finishReasons : ['STOP'],
    usage: raw?.usage
  });
}

export function hasValidImages(value: any): boolean {
  if (Array.isArray(value?.images) && value.images.some(isValidImage)) return true;
  return Array.isArray(value?.candidates) && value.candidates.some((candidate: any) =>
    Array.isArray(candidate?.content?.parts) && candidate.content.parts.some((part: any) =>
      isValidImage(part?.inlineData || part?.inline_data || { mimeType: '', data: '' })
    )
  );
}
