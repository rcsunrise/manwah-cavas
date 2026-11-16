// server/services/characterIdentityCropService.ts
// 角色资产图多为多宫格角色卡（头像组、细节图、文字标注）。直接作为人物参考图发给生图模型时，
// 模型有概率照搬其排版输出拼图，并连带丢掉底图的房间与家具。
// 这里用视觉模型定位卡片中最大的一张人物头像，裁出单人照再发送；结果按图片内容哈希缓存到磁盘。

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { createServerGenAI } from '../utils/aiClient';

const CROP_MODEL = 'gemini-3.6-flash';
const CROP_TIMEOUT_MS = 30_000;
const CACHE_DIR = path.join(process.cwd(), '.data', 'cache', 'identity-crops');

type InlineImage = { mimeType: string; data: string };

const DETECT_PROMPT = `This image is a character reference sheet that may contain several photo panels (portrait grid, full-body views, detail crops) plus text labels.
Find the single LARGEST photo panel that shows this person's face clearly from the front (a head-and-shoulders portrait). Exclude text, labels and neighbouring panels.
Return JSON only: {"box_2d":[ymin,xmin,ymax,xmax]} with coordinates normalized to 0-1000. If the whole image is already one single portrait photo, return {"box_2d":null}.`;

function cachePath(hash: string) {
  return path.join(CACHE_DIR, `${hash}.json`);
}

async function detectPortraitBox(userId: string, image: InlineImage): Promise<number[] | null> {
  const { ai, isValidKey } = await createServerGenAI(userId);
  if (!ai || !isValidKey) throw new Error('vision model unavailable');
  const response = await Promise.race([
    ai.models.generateContent({
      model: CROP_MODEL,
      contents: [{ text: DETECT_PROMPT }, { inlineData: image }]
    }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('identity crop timeout')), CROP_TIMEOUT_MS))
  ]);
  const parsed = JSON.parse((response.text || '').replace(/```json/gi, '').replace(/```/g, '').trim());
  const box = parsed?.box_2d;
  if (!Array.isArray(box) || box.length !== 4 || box.some((v: unknown) => typeof v !== 'number')) return null;
  return box;
}

/**
 * 返回单人头像裁切图；识别失败、无需裁切或裁切结果异常时原样返回。
 */
export async function cropCharacterIdentity(image: InlineImage, userId = 'system'): Promise<InlineImage> {
  const buf = Buffer.from(image.data, 'base64');
  const hash = crypto.createHash('sha1').update(buf).digest('hex');

  let box: number[] | null | undefined;
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath(hash), 'utf8'));
    box = cached.box ?? null;
  } catch {
    try {
      box = await detectPortraitBox(userId, image);
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(cachePath(hash), JSON.stringify({ box, model: CROP_MODEL, at: new Date().toISOString() }));
    } catch (err: any) {
      // 识别失败不缓存，下次重试；本次沿用原图
      console.warn('[CharacterIdentityCrop] detect failed, using original sheet:', err?.message);
      return image;
    }
  }
  if (!box) return image;

  try {
    const meta = await sharp(buf).metadata();
    const W = meta.width || 0;
    const H = meta.height || 0;
    const [ymin, xmin, ymax, xmax] = box.map((v) => Math.min(1000, Math.max(0, v)));
    const left = Math.round((xmin / 1000) * W);
    const top = Math.round((ymin / 1000) * H);
    const width = Math.round(((xmax - xmin) / 1000) * W);
    const height = Math.round(((ymax - ymin) / 1000) * H);
    // 过小（误检到小图标）或几乎整张图时不裁
    const areaRatio = (width * height) / (W * H || 1);
    if (!W || !H || width < 96 || height < 96 || areaRatio < 0.04 || areaRatio > 0.9) return image;

    const out = await sharp(buf).extract({ left, top, width, height }).jpeg({ quality: 92 }).toBuffer();
    return { mimeType: 'image/jpeg', data: out.toString('base64') };
  } catch (err: any) {
    console.warn('[CharacterIdentityCrop] crop failed, using original sheet:', err?.message);
    return image;
  }
}
