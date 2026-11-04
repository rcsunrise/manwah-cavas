// server/services/spaceImageGrading.ts
// 空间渲染图“去雾定级”：多轮图生图（尤其空场景补画）后黑位抬升、对比与清晰度下降，画面发灰发朦。
// 生成后按亮度直方图把黑位/白位拉回，再做温和局部对比与轻锐化。只按亮度缩放 RGB，不改变色相与饱和度。
import sharp from 'sharp';

/**
 * 黑位抬升是“发灰起雾”的标志：黑位在此值以内视为正常，不处理。
 * 只是白位偏低（无高光、低调画面）通常是有意为之，不单独触发，以免把正常画面整体提亮。
 */
const BLACK_OK = 12;
/** 单次拉伸上限：避免把本就低调或高调的画面拉过头 */
const MAX_GAIN = 1.45;
const LOW_PERCENTILE = 0.005;
const HIGH_PERCENTILE = 0.996;

export interface GradeResult {
  buffer: Buffer;
  applied: boolean;
  /** 处理前的黑位 / 白位（亮度分位），便于日志排查 */
  levels: { black: number; white: number };
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export async function dehazeGrade(input: Buffer): Promise<GradeResult> {
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const pixelCount = info.width * info.height;

  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += channels) {
    hist[Math.round(luminance(data[i], data[i + 1], data[i + 2]))]++;
  }
  const percentile = (p: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= pixelCount * p) return v;
    }
    return 255;
  };
  const black = percentile(LOW_PERCENTILE);
  const white = percentile(HIGH_PERCENTILE);

  if (black <= BLACK_OK) {
    return { buffer: input, applied: false, levels: { black, white } };
  }

  const gain = Math.min(MAX_GAIN, 255 / Math.max(1, white - black));
  const out = Buffer.alloc(pixelCount * 3);
  for (let i = 0, o = 0; i < data.length; i += channels, o += 3) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const y = luminance(r, g, b);
    // 亮度按色阶拉伸，再按比例缩放 RGB：色相与饱和度保持不变
    const target = Math.min(255, Math.max(0, (y - black) * gain));
    const k = y > 0.5 ? target / y : 0;
    out[o] = Math.min(255, Math.round(r * k));
    out[o + 1] = Math.min(255, Math.round(g * k));
    out[o + 2] = Math.min(255, Math.round(b * k));
  }

  const graded = await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } })
    .clahe({ width: 96, height: 96, maxSlope: 2 })
    .sharpen({ sigma: 0.8, m1: 0.6, m2: 1.6 })
    .png()
    .toBuffer();

  return { buffer: graded, applied: true, levels: { black, white } };
}

/** 生成提示词统一追加的画质约束：清晰黑位、高微对比，明确排除雾感发灰 */
export const RENDER_CLARITY_CLAUSE =
  '[IMAGE QUALITY]: crisp professional architectural photograph with true deep blacks, clean bright highlights, high micro-contrast and sharp material detail. ' +
  'NO haze, NO fog, NO milky veil, NO washed-out low-contrast grey tones, NO lifted blacks, NO soft blurry focus.';

export function withClarityClause(prompt: string): string {
  return prompt.includes('[IMAGE QUALITY]') ? prompt : `${prompt}\n\n${RENDER_CLARITY_CLAUSE}`;
}
