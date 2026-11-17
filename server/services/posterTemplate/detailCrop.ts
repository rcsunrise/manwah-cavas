import sharp from 'sharp';
import { CHAT_FALLBACK_MODELS, chatCompletionText } from './chatFallback';
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

// 路由平台（TianToken）目前只开通了 gemini-3.6-flash，3.7/3.8 返回 model_not_found；放最前面，否则第一个失败就整条通道被标记不可用
const VISION_MODELS = ['gemini-3.6-flash'];

/**
 * 框选定位先用 gpt-6.1-sol（实测 3–11 秒），gemini-3.6-flash 同样的请求要 45–80 秒，排版一次要定位好几轮。
 * gpt 失败时再走 gemini，最后才用其他对话模型。
 */
export const FAST_VISION_MODELS = ['gpt-6.1-sol'];
const FAST_VISION_TIMEOUT_MS = 45_000;

/**
 * gemini 通道没开通 / 额度用完时，每次定位都要先白等一轮失败（实测约 17 秒）才走对话模型。
 * 记下通道不可用，10 分钟内直接走对话模型；过期后再试一次，通道恢复了自动切回。
 */
let geminiDownUntil = 0;
const GEMINI_DOWN_MS = 10 * 60_000;
const CHANNEL_DOWN_RE = /model_not_found|no available channel|unknown provider|quota|fetch failed/i;

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
  // 同一个部位可能给了多个候选（沙发脚会要 3 个，后面逐个检查有没有被挡）
  const candidates = new Map<string, NormBox[]>();
  const ingest = (items: any) => {
    for (const item of Array.isArray(items) ? items : []) {
      const box = boxFrom2d(item?.box_2d);
      if (!box || typeof item?.key !== 'string') continue;
      if (!found.has(item.key)) found.set(item.key, box);
      candidates.set(item.key, [...(candidates.get(item.key) || []), box]);
    }
  };

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
4. 沙发脚（key="foot"）请给出 3 个候选框（同一个 key 重复 3 项，最好的放最前）：每个框里要能看到这只脚从沙发底座到地面的完整形状，框内不能出现茶几、地毯边、摆件、抱枕、人物或沙发其他部分挡住脚的情况；离镜头最近的脚常被前面的茶几挡住，宁可选两端或侧面完整露出的脚。
5. 只输出 JSON 数组，不要任何说明文字：[{"key": "...", "box_2d": [ymin, xmin, ymax, xmax]}]，坐标为 0–1000 的归一化整数。`;

    let lastErr: any = null;
    const parseArray = (text: string) => {
      const m = String(text || '').replace(/```json|```/g, '').match(/\[[\s\S]*\]/);
      if (!m) throw new Error('视觉模型未返回 JSON 数组');
      return JSON.parse(m[0]);
    };
    // 1) 快的对话模型先定位
    try {
      const fast = await chatCompletionText({
        prompt,
        images: [{ mimeType: 'image/jpeg', data: small.toString('base64') }],
        temperature: 0.1,
        userId,
        models: FAST_VISION_MODELS,
        timeoutMs: FAST_VISION_TIMEOUT_MS
      });
      ingest(parseArray(fast.text));
    } catch (err: any) {
      lastErr = err;
      console.warn(`[PosterDetailCrop] ${FAST_VISION_MODELS.join('/')} 定位部位失败，改用 gemini:`, err?.message || err);
    }
    // 2) gemini 兜底
    const skipGemini = found.size > 0 || Date.now() < geminiDownUntil;
    for (const model of skipGemini ? [] : VISION_MODELS) {
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
        ingest(JSON.parse(match[0]));
        if (found.size > 0) break;
      } catch (err: any) {
        lastErr = err;
        console.warn(`[PosterDetailCrop] ${model} 定位部位失败:`, err?.message || err);
        // 通道不可用 / 网络不通时不再逐个等超时，直接走对话模型兜底
        if (CHANNEL_DOWN_RE.test(String(err?.message || err))) {
          geminiDownUntil = Date.now() + GEMINI_DOWN_MS;
          break;
        }
      }
    }
    if (found.size === 0) {
      // 3) gemini 也不行：其余对话模型兜底
      try {
        const fb = await chatCompletionText({
          prompt,
          images: [{ mimeType: 'image/jpeg', data: small.toString('base64') }],
          temperature: 0.1,
          userId,
          models: CHAT_FALLBACK_MODELS.filter(m => !FAST_VISION_MODELS.includes(m))
        });
        const m = fb.text.replace(/```json|```/g, '').match(/\[[\s\S]*\]/);
        if (!m) throw new Error('视觉模型未返回 JSON 数组');
        ingest(JSON.parse(m[0]));
        console.info(`[PosterDetailCrop] gemini 通道不可用，已改用 ${fb.model} 定位部位`);
      } catch (fbErr: any) {
        console.warn('[PosterDetailCrop] 对话模型兜底也失败:', fbErr?.message || fbErr);
      }
      if (found.size === 0) throw lastErr || new Error('视觉模型暂不可用');
    }
  } catch (err: any) {
    warnings.push(`细节部位自动定位失败，已改用默认取景：${err?.message || err}`);
  }

  // 沙发脚：逐个候选裁出来让模型看有没有被挡，选第一个干净的
  try {
    const foot = candidates.get('foot');
    if (foot && foot.length > 0) {
      // 3 个候选同时检查（每次视觉调用约 10 秒，串行会多等半分钟）；只有 1 个候选时不用检查
      let picked: NormBox | null = null;
      if (foot.length > 1) {
        const verdicts = await Promise.all(
          foot.slice(0, 3).map(async box => {
            try {
              const crop = await sharp(await cropDetail(image, box, 1.4)).resize(640, 640, { fit: 'inside' }).jpeg({ quality: 82 }).toBuffer();
              const r = await chatCompletionText({
                prompt:
                  '这是从沙发图里裁出的“沙发脚”特写。请判断：画面里能不能清楚看到一只完整的沙发脚（从底座到地面），且脚前面没有茶几、摆件、地毯边、人物、抱枕等东西遮挡？只回答 “是” 或 “否”。',
                images: [{ mimeType: 'image/jpeg', data: crop.toString('base64') }],
                temperature: 0,
                userId
              });
              return /^\s*是/.test(r.text);
            } catch {
              return false;
            }
          })
        );
        const idx = verdicts.findIndex(Boolean);
        if (idx >= 0) picked = foot[idx];
      } else {
        picked = foot[0];
      }
      if (picked) found.set('foot', picked);
      else if (foot.length > 0) warnings.push('沙发脚几个候选都有遮挡，已选第一个，可在再次生成里换取景');
    }
  } catch (err: any) {
    console.warn('[PosterDetailCrop] 沙发脚遮挡检查失败（沿用第一个候选）:', err?.message || err);
  }

  const details = targets.map((t, i): LocatedDetail => {
    const box = found.get(t.key);
    if (box) return { key: t.key, box, source: 'vision' };
    if (found.size > 0) warnings.push(`没有找到「${t.locate}」，该格改用默认取景`);
    return { key: t.key, box: fallbackBox(t.key, i), source: 'fallback' };
  });
  return { details, warnings };
}

/**
 * 把框放大成正方形区域（以框中心为中心、边长取框较长边的 scale 倍），并限制在图内。返回归一化坐标。
 */
export function expandToSquare(box: NormBox, imageWidth: number, imageHeight: number, scale = 1.8): NormBox {
  const cx = (box.left + box.width / 2) * imageWidth;
  const cy = (box.top + box.height / 2) * imageHeight;
  let side = Math.max(box.width * imageWidth, box.height * imageHeight) * scale;
  side = Math.min(side, imageWidth, imageHeight);
  const left = Math.min(Math.max(0, cx - side / 2), imageWidth - side);
  const top = Math.min(Math.max(0, cy - side / 2), imageHeight - side);
  return { left: left / imageWidth, top: top / imageHeight, width: side / imageWidth, height: side / imageHeight };
}

/** 区域内的相对框 → 整图归一化坐标 */
export function mapBoxFromRegion(inner: NormBox, region: NormBox): NormBox {
  return {
    left: region.left + inner.left * region.width,
    top: region.top + inner.top * region.height,
    width: inner.width * region.width,
    height: inner.height * region.height
  };
}

/**
 * 二次精定位：第一次在整张图上框的部位常常偏大（比如“沙发脚连同上方侧板转角”框成一大块），
 * 按框中心裁出来部位会落在边上。这里把第一次的框周围放大裁出来，让视觉模型在近景里再框一次，
 * 只要新框落在区域内就采用；失败或没找到就保留原框。
 */
export async function refineDetails(
  image: Buffer,
  located: LocatedDetail[],
  targets: DetailTarget[],
  userId = 'system'
): Promise<LocatedDetail[]> {
  const meta = await sharp(image, { failOn: 'none' }).rotate().metadata();
  const width = meta.autoOrient?.width || meta.width || 0;
  const height = meta.autoOrient?.height || meta.height || 0;
  if (!width || !height) return located;
  return Promise.all(
    located.map(async d => {
      const target = targets.find(t => t.key === d.key);
      if (!target || d.source !== 'vision') return d;
      try {
        const region = expandToSquare(d.box, width, height);
        const rect = {
          left: Math.round(region.left * width),
          top: Math.round(region.top * height),
          width: Math.max(1, Math.round(region.width * width)),
          height: Math.max(1, Math.round(region.height * height))
        };
        rect.width = Math.min(rect.width, width - rect.left);
        rect.height = Math.min(rect.height, height - rect.top);
        const crop = await sharp(image, { failOn: 'none' }).rotate().extract(rect).png().toBuffer();
        const { details } = await locateDetails(
          crop,
          [{ key: d.key, locate: `${target.locate}。这是局部放大图：只框这个部位本身，框要紧贴部位，不要带上周围的空白背景和其他部位。` }],
          userId
        );
        const inner = details[0];
        if (!inner || inner.source !== 'vision') return d;
        // 几乎是一个点的框多半是误判，保留原框；沙发脚这类细长部位面积本来就小，不按面积判断
        if (inner.box.width < 0.02 || inner.box.height < 0.02) return d;
        return { ...d, box: mapBoxFromRegion(inner.box, region) };
      } catch {
        return d;
      }
    })
  );
}

export async function cropDetail(image: Buffer, box: NormBox, aspect: number): Promise<Buffer> {
  const meta = await sharp(image, { failOn: 'none' }).rotate().metadata();
  const width = meta.autoOrient?.width || meta.width || 0;
  const height = meta.autoOrient?.height || meta.height || 0;
  const rect = cropRectForBox(box, width, height, aspect);
  return sharp(image, { failOn: 'none' }).rotate().extract(rect).png().toBuffer();
}
