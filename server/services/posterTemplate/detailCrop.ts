import sharp from 'sharp';
import { chatCompletionText } from './chatFallback';
import { createServerGenAI } from '../../utils/aiClient';

/**
 * 细节格：在主场景图上找到扶手 / 靠背 / 脚等部位，按细节格的宽高比裁出来。
 * 用真实裁切而不是让生图模型另画特写，特写和主图才一定是同一件产品。
 */

export interface DetailTarget {
  key: string;
  /** 给视觉模型看的部位描述，如“沙发左侧扶手的正面与侧面” */
  locate: string;
}

/** 归一化坐标 0–1 */
export interface NormBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LocatedDetail {
  key: string;
  box: NormBox;
  source: 'vision' | 'fallback';
}

const VISION_MODELS = ['gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.6-flash'];

/** 视觉模型没给出结果时的保守取景（三人位沙发居中、正三分之四视角时大致可用） */
const FALLBACK_BOXES: Record<string, NormBox> = {
  armrest: { left: 0.12, top: 0.38, width: 0.2, height: 0.3 },
  backrest: { left: 0.4, top: 0.22, width: 0.22, height: 0.28 },
  foot: { left: 0.14, top: 0.62, width: 0.14, height: 0.18 },
  side: { left: 0.78, top: 0.4, width: 0.16, height: 0.3 },
  cushion: { left: 0.4, top: 0.48, width: 0.22, height: 0.22 }
};

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Gemini 约定的 box_2d：[ymin, xmin, ymax, xmax]，0–1000 */
export function boxFrom2d(box2d: unknown): NormBox | null {
  if (!Array.isArray(box2d) || box2d.length !== 4) return null;
  const [ymin, xmin, ymax, xmax] = box2d.map(Number);
  if (![ymin, xmin, ymax, xmax].every(Number.isFinite)) return null;
  const top = clamp01(Math.min(ymin, ymax) / 1000);
  const left = clamp01(Math.min(xmin, xmax) / 1000);
  const bottom = clamp01(Math.max(ymin, ymax) / 1000);
  const right = clamp01(Math.max(xmin, xmax) / 1000);
  if (right - left < 0.01 || bottom - top < 0.01) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * 把部位框换算成实际裁切区域：四周留少量余量，按面积不变换成目标宽高比（细长的框会被裁掉两头，
 * 而不是把旁边的窗景、地毯一起带进来，参考海报的特写都是部位撑满画格），保证最小取景尺寸
 * （沙发脚这类小部件单独裁会糊，参考海报里脚的特写也带着一截底座），最后整体平移进画面内。返回像素坐标。
 */
export function cropRectForBox(
  box: NormBox,
  imageWidth: number,
  imageHeight: number,
  aspect: number,
  options: { margin?: number; minWidthRatio?: number; maxBoxWidthRatio?: number; maxBoxHeightRatio?: number } = {}
): { left: number; top: number; width: number; height: number } {
  const margin = options.margin ?? 0.08;
  const minW = imageWidth * (options.minWidthRatio ?? 0.1);
  // 框太大（如整排靠背）裁出来就成了缩小的全景，不像特写：按中心收到最大尺寸以内
  const maxBoxW = options.maxBoxWidthRatio ?? 0.26;
  const maxBoxH = options.maxBoxHeightRatio ?? 0.4;
  const bw = Math.min(box.width, maxBoxW);
  const bh = Math.min(box.height, maxBoxH);

  const cx = (box.left + box.width / 2) * imageWidth;
  const cy = (box.top + box.height / 2) * imageHeight;
  const area = bw * imageWidth * (1 + margin * 2) * bh * imageHeight * (1 + margin * 2);
  let w = Math.sqrt(area * aspect);
  let h = w / aspect;
  if (w < minW) {
    w = minW;
    h = w / aspect;
  }
  // 画面装不下时整体缩小
  const scale = Math.min(1, imageWidth / w, imageHeight / h);
  w *= scale;
  h *= scale;

  let left = cx - w / 2;
  let top = cy - h / 2;
  left = Math.min(Math.max(0, left), imageWidth - w);
  top = Math.min(Math.max(0, top), imageHeight - h);
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.max(1, Math.min(imageWidth - Math.round(left), Math.round(w))),
    height: Math.max(1, Math.min(imageHeight - Math.round(top), Math.round(h)))
  };
}

function fallbackBox(key: string, index: number): NormBox {
  return FALLBACK_BOXES[key] || Object.values(FALLBACK_BOXES)[index % 3];
}

/** 让视觉模型在图上框出各部位；失败的部位用保守取景 */
export async function locateDetails(
  image: Buffer,
  targets: DetailTarget[],
  userId = 'system'
): Promise<{ details: LocatedDetail[]; warnings: string[] }> {
  const warnings: string[] = [];
  const found = new Map<string, NormBox>();

  try {
    const { ai, isValidKey } = await createServerGenAI(userId);
    if (!ai || !isValidKey) throw new Error('未配置可用的模型凭据');
    const small = await sharp(image, { failOn: 'none' }).resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const list = targets.map(t => `- key="${t.key}": ${t.locate}`).join('\n');
    const prompt = `这是一张家具产品的场景图。请在图中找到下列产品部位，各给出一个能完整展示该部位细节的矩形框。
${list}

要求：
1. 只框画面中那件主角沙发上的部位，不要框茶几、抱枕、摆件或其他家具。
2. 同类部位有多个时（如左右两个扶手、多个沙发脚、多个座位的靠背），选完整露出、前面没有茶几/花瓶/摆件/抱枕遮挡的那一个；都没被挡时选离镜头最近、最清晰的。框里尽量不要带进茶几、摆件等其他物体。
3. 这是给细节特写取景用的：框只包住这一个部位本身，带少量相邻结构即可；靠背、座垫这类横向连成一排的，只框其中一个座位，不要框整排。
4. 只输出 JSON 数组，不要任何说明文字：[{"key": "...", "box_2d": [ymin, xmin, ymax, xmax]}]，坐标为 0–1000 的归一化整数。`;

    let lastErr: any = null;
    for (const model of VISION_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [{ inlineData: { mimeType: 'image/jpeg', data: small.toString('base64') } }, { text: prompt }]
            }
          ],
          config: { temperature: 0.1 }
        });
        const text = String(response.text || '').replace(/```json|```/g, '');
        const match = text.match(/\[[\s\S]*\]/);
        if (!match) throw new Error('视觉模型未返回 JSON 数组');
        const parsed = JSON.parse(match[0]);
        for (const item of Array.isArray(parsed) ? parsed : []) {
          const box = boxFrom2d(item?.box_2d);
          if (box && typeof item?.key === 'string') found.set(item.key, box);
        }
        if (found.size > 0) break;
      } catch (err: any) {
        lastErr = err;
        console.warn(`[PosterDetailCrop] ${model} 定位部位失败:`, err?.message || err);
        // 通道不可用 / 网络不通时不再逐个等超时，直接走对话模型兜底
        if (/model_not_found|no available channel|unknown provider|fetch failed/i.test(String(err?.message || err))) break;
      }
    }
    if (found.size === 0 && lastErr) {
      // gemini 原生通道不可用：改走 chat/completions 的对话模型
      try {
        const fb = await chatCompletionText({
          prompt,
          images: [{ mimeType: 'image/jpeg', data: small.toString('base64') }],
          temperature: 0.1,
          userId
        });
        const m = fb.text.replace(/```json|```/g, '').match(/\[[\s\S]*\]/);
        if (!m) throw new Error('视觉模型未返回 JSON 数组');
        for (const item of JSON.parse(m[0])) {
          const box = boxFrom2d(item?.box_2d);
          if (box && typeof item?.key === 'string') found.set(item.key, box);
        }
        console.info(`[PosterDetailCrop] gemini 通道不可用，已改用 ${fb.model} 定位部位`);
      } catch (fbErr: any) {
        console.warn('[PosterDetailCrop] 对话模型兜底也失败:', fbErr?.message || fbErr);
      }
      if (found.size === 0) throw lastErr;
    }
  } catch (err: any) {
    warnings.push(`细节部位自动定位失败，已改用默认取景：${err?.message || err}`);
  }

  const details = targets.map((t, i): LocatedDetail => {
    const box = found.get(t.key);
    if (box) return { key: t.key, box, source: 'vision' };
    if (found.size > 0) warnings.push(`没有找到「${t.locate}」，该格改用默认取景`);
    return { key: t.key, box: fallbackBox(t.key, i), source: 'fallback' };
  });
  return { details, warnings };
}

export async function cropDetail(image: Buffer, box: NormBox, aspect: number): Promise<Buffer> {
  const meta = await sharp(image, { failOn: 'none' }).rotate().metadata();
  const width = meta.autoOrient?.width || meta.width || 0;
  const height = meta.autoOrient?.height || meta.height || 0;
  const rect = cropRectForBox(box, width, height, aspect);
  return sharp(image, { failOn: 'none' }).rotate().extract(rect).png().toBuffer();
}
