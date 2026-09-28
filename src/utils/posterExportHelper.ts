import { CanvasTextLayer } from '../types/creativeCanvas';
import { downloadHighResImage } from './downloadUtils';

export type PosterExportResolution = 'native' | 'ecommerce_3_4' | 'ultra_4k';
export type PosterExportFormat = 'png' | 'jpeg';

export interface PosterExportOptions {
  imageUrl: string;
  cleanBackgroundUrl?: string;
  textLayers?: CanvasTextLayer[];
  screenTitle?: string;
  coreSellingPoint?: string;
  themeTitle?: string;
  sceneIndex?: number;
  format?: PosterExportFormat; // default: 'png'
  quality?: number; // for jpeg, default: 0.98
  resolution?: PosterExportResolution; // default: 'native'
  customWidth?: number;
  customHeight?: number;
  includeText?: boolean; // default: true
  withText?: boolean; // 底层图片是否本身已是带字海报
  filename?: string;
}

/**
 * 辅助函数：根据最大宽度对文本进行折行计算
 */
function getWrappedLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [];
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (!para) {
      lines.push('');
      continue;
    }
    let currentLine = '';
    for (let i = 0; i < para.length; i++) {
      const char = para[i];
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }
  return lines;
}

function isDarkColor(hexOrRgba?: string): boolean {
  if (!hexOrRgba) return false;
  if (hexOrRgba.startsWith('#')) {
    const hex = hexOrRgba.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
  }
  return false;
}

/**
 * 加载图片元素
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * 核心高保真海报 Canvas 合成函数
 * 保证无失真、文字边缘极致锐利、支持 2K/3K/4K 及 3:4 商业电商印刷标准
 */
export async function renderPosterToCanvas(
  options: PosterExportOptions
): Promise<HTMLCanvasElement> {
  const {
    imageUrl,
    cleanBackgroundUrl,
    withText,
    textLayers = [],
    screenTitle = '敏华海报设计',
    coreSellingPoint,
    themeTitle = 'MANWAH DESIGN STUDIO',
    sceneIndex = 1,
    resolution = 'native',
    includeText = true
  } = options;

  // 1. 优先使用无字纯净底图，避免与文字图层发生重影
  const bgSourceUrl = (textLayers.length > 0 && cleanBackgroundUrl) ? cleanBackgroundUrl : imageUrl;
  const bgImg = await loadImage(bgSourceUrl);

  const natW = bgImg.naturalWidth || 1536;
  const natH = bgImg.naturalHeight || 2048;

  // 2. 确定目标画布尺寸
  let targetW = natW;
  let targetH = natH;

  if (resolution === 'ecommerce_3_4') {
    targetW = 2100;
    targetH = 2800;
  } else if (resolution === 'ultra_4k') {
    const aspect = natW / natH;
    targetH = 4096;
    targetW = Math.round(targetH * aspect);
  } else if (options.customWidth && options.customHeight) {
    targetW = options.customWidth;
    targetH = options.customHeight;
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
  if (!ctx) throw new Error('无法初始化 Canvas 2D 绘图上下文');

  // 图像平滑与渲染质量最高优化
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 3. 绘制底图并自适应比例
  const bgAspect = natW / natH;
  const targetAspect = targetW / targetH;

  let renderW = targetW;
  let renderH = targetH;
  let offsetX = 0;
  let offsetY = 0;

  if (Math.abs(bgAspect - targetAspect) > 0.01) {
    if (bgAspect > targetAspect) {
      renderH = targetW / bgAspect;
      offsetY = (targetH - renderH) / 2;
    } else {
      renderW = targetH * bgAspect;
      offsetX = (targetW - renderW) / 2;
    }
    // 底色填充微温暗调
    ctx.fillStyle = '#1A1818';
    ctx.fillRect(0, 0, targetW, targetH);
  }

  ctx.drawImage(bgImg, offsetX, offsetY, renderW, renderH);

  // 4. 若不包含文案，或者底层图本身已经是带字海报（withText 为 true）且没有在工坊编辑独立图层，
  // 严禁在此类海报上再次叠印 SCENE #1、全案企划等默认模板文字，直接输出高保真原图，彻底杜绝双重文案粘连！
  if (!includeText || (withText && (!textLayers || textLayers.length === 0))) {
    return canvas;
  }

  // 5. 渲染文案图层
  const scaleX = renderW / natW;
  const scaleY = renderH / natH;

  if (textLayers.length > 0) {
    // A. 存在独立矢量文字图层（海报排版工坊编辑的专业图层）
    for (const layer of textLayers) {
      ctx.save();
      const lx = offsetX + layer.x * scaleX;
      const ly = offsetY + layer.y * scaleY;
      const lw = layer.width * scaleX;
      const fontPx = Math.round(layer.fontSize * scaleX);
      const lineH = Math.round(fontPx * (layer.lineHeight || 1.25));

      ctx.font = `${layer.fontWeight || 'bold'} ${fontPx}px ${layer.fontFamily || '"Songti SC", "PingFang SC", serif'}`;
      ctx.textAlign = (layer.textAlign as CanvasTextAlign) || 'left';
      ctx.textBaseline = 'top';

      const lines = getWrappedLines(ctx, layer.text, lw);
      const totalH = Math.max(1, lines.length) * lineH;

      // 背景保护底板
      if ((layer as any).backdropEnabled) {
        ctx.fillStyle = (layer as any).backdropColor || 'rgba(0,0,0,0.65)';
        ctx.beginPath();
        ctx.roundRect(lx - 12 * scaleX, ly - 8 * scaleY, lw + 24 * scaleX, totalH + 16 * scaleY, 8 * scaleX);
        ctx.fill();
      }

      ctx.fillStyle = layer.color || '#FFFFFF';

      const darkText = isDarkColor(layer.color);
      const textShadowMode = (layer as any).textShadow;
      if (textShadowMode === false || (textShadowMode !== 'deep' && darkText)) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      } else if (textShadowMode === 'deep') {
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = Math.round(fontPx * 0.25);
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = Math.round(fontPx * 0.12);
      }

      let drawX = lx;
      if (layer.textAlign === 'center') drawX = lx + lw / 2;
      else if (layer.textAlign === 'right') drawX = lx + lw;

      lines.forEach((line, index) => {
        ctx.fillText(line, drawX, ly + index * lineH);
      });
      ctx.restore();
    }
  } else if ((screenTitle || coreSellingPoint) && !withText) {
    // B. 无独立文字图层且底图非带字海报时，自动根据分镜标题和卖点渲染高奢商业企划海报
    // 1) 顶部高奢渐变遮罩
    const topGradient = ctx.createLinearGradient(0, 0, 0, targetH * 0.16);
    topGradient.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
    topGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = topGradient;
    ctx.fillRect(0, 0, targetW, targetH * 0.16);

    // 2) 底部渐变遮罩
    const bottomGradient = ctx.createLinearGradient(0, targetH * 0.68, 0, targetH);
    bottomGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    bottomGradient.addColorStop(1, 'rgba(0, 0, 0, 0.82)');
    ctx.fillStyle = bottomGradient;
    ctx.fillRect(0, targetH * 0.68, targetW, targetH * 0.32);

    // 3) 顶部 Header
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.font = `bold ${Math.round(targetW * 0.022)}px "PingFang SC", system-ui, sans-serif`;
    ctx.fillText(`${themeTitle}  |  全案企划`, targetW * 0.045, targetH * 0.045);

    // 右上角 Scene 编号标牌
    ctx.fillStyle = '#B28C5A';
    const badgeWidth = targetW * 0.15;
    const badgeHeight = targetH * 0.032;
    const badgeX = targetW * 0.955 - badgeWidth;
    const badgeY = targetH * 0.028;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, targetH * 0.008);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.round(targetW * 0.018)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`SCENE #${sceneIndex}`, badgeX + badgeWidth / 2, badgeY + badgeHeight * 0.7);
    ctx.restore();

    // 4) 底部主文案排版
    ctx.save();
    ctx.textAlign = 'left';

    // 卖点 Pill
    ctx.fillStyle = 'rgba(178, 140, 90, 0.92)';
    const tagWidth = targetW * 0.14;
    const tagHeight = targetH * 0.026;
    const tagX = targetW * 0.045;
    const tagY = targetH * 0.785;
    ctx.beginPath();
    ctx.roundRect(tagX, tagY, tagWidth, tagHeight, targetH * 0.005);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.round(targetW * 0.015)}px "PingFang SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('爆款卖点', tagX + tagWidth / 2, tagY + tagHeight * 0.72);
    ctx.restore();

    // 主标题
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.round(targetW * 0.038)}px "Songti SC", "PingFang SC", serif`;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = Math.round(targetW * 0.012);
    ctx.fillText(screenTitle, targetW * 0.045, targetH * 0.865, targetW * 0.91);

    // 核心卖点详细文案
    if (coreSellingPoint && coreSellingPoint !== screenTitle) {
      ctx.fillStyle = '#E5E0D8';
      ctx.font = `500 ${Math.round(targetW * 0.022)}px "PingFang SC", sans-serif`;
      ctx.shadowBlur = Math.round(targetW * 0.006);
      ctx.fillText(`“ ${coreSellingPoint} ”`, targetW * 0.045, targetH * 0.915, targetW * 0.91);
    }

    // 底部高奢英文字样
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = `normal ${Math.round(targetW * 0.014)}px system-ui, sans-serif`;
    ctx.fillText(`MANWAH HIGH-END COMMERCIAL SPECIFICATION · 300DPI PRINT STANDARD`, targetW * 0.045, targetH * 0.96);
    ctx.restore();
  }

  return canvas;
}

/**
 * 导出海报并获取 DataUrl
 */
export async function generatePosterDataUrl(
  options: PosterExportOptions
): Promise<{ dataUrl: string; width: number; height: number; filename: string }> {
  const format = options.format || 'png';
  const quality = options.quality ?? 0.98;
  const canvas = await renderPosterToCanvas(options);

  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const dataUrl = canvas.toDataURL(mime, format === 'jpeg' ? quality : undefined);

  const resLabel =
    options.resolution === 'ecommerce_3_4'
      ? '3-4-2100x2800'
      : options.resolution === 'ultra_4k'
      ? `4K-${canvas.width}x${canvas.height}`
      : `${canvas.width}x${canvas.height}`;

  const safeTitle = (options.screenTitle || '海报').replace(/[\s/\\?%*:|"<>]/g, '_').slice(0, 30);
  const ext = format === 'png' ? 'png' : 'jpg';
  const filename =
    options.filename ||
    `MW_海报_第${options.sceneIndex || 1}屏_${safeTitle}_${resLabel}.${ext}`;

  return {
    dataUrl,
    width: canvas.width,
    height: canvas.height,
    filename
  };
}

/**
 * 一键下载超清海报（无损 PNG 或超清 JPG）
 */
export async function downloadPosterImage(
  options: PosterExportOptions
): Promise<{ filename: string; width: number; height: number }> {
  const result = await generatePosterDataUrl(options);
  await downloadHighResImage(result.dataUrl, result.filename);
  return {
    filename: result.filename,
    width: result.width,
    height: result.height
  };
}
