// src/services/posterStudioService.ts
import { POSTER_SPEC } from '../config/posterSpec';
import {
  PosterCompositionSnapshot,
  PosterImageLayer,
  PosterTextLayer,
  DecorationLayer,
  TemplateId,
  PosterRole,
  NinePosterManifest
} from '../types/posterTemplate';
import { POSTER_TEMPLATES, ROLE_TO_TEMPLATE_MAP } from '../config/posterTemplates';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export interface PlanScreenItem {
  screenIndex: number;
  screenTitle: string;
  role: PosterRole;
  templateId: TemplateId;
  prompt: string;
  negativePrompt: string;
  safeAreaFocus: string;
  headline: string;
  subheadline: string;
  body: string;
  points?: string[];
  specs?: Record<string, string>;
  ctaText?: string;
  sourceImageUrl?: string;
  sourceAssetVersionId?: string;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceAspectRatio?: number;
  status: 'pending' | 'generating' | 'review' | 'approved' | 'failed';
  renderedUrl?: string;
}

const DEFAULT_NEGATIVE_PROMPT =
  'No text, No letters, No logo, No watermark, No Chinese characters, No labels, No UI elements, Keep realistic product proportions, Reserve clean negative space for typography, high resolution 8k furniture photography';

/**
 * Creates default 9-screen plan structure
 */
export function createDefaultNinePlan(productInfo?: {
  productName?: string;
  category?: string;
  materials?: string[];
  keyFeatures?: string[];
  referenceImageUrl?: string;
}): PlanScreenItem[] {
  const name = productInfo?.productName || 'MANWAH 智能电动功能沙发';
  const mat = productInfo?.materials?.join(' · ') || '进口头层摔纹牛皮 · 45D高回弹海绵 · 德国超静音电机';

  return [1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => {
    const meta = ROLE_TO_TEMPLATE_MAP[index];
    const template = POSTER_TEMPLATES[meta.defaultTemplateId];

    let headline = template.textSlots.find((s) => s.role === 'headline')?.defaultText || '';
    let subheadline = template.textSlots.find((s) => s.role === 'subheadline')?.defaultText || '';
    let body = template.textSlots.find((s) => s.role === 'body')?.defaultText || '';

    if (index === 1) {
      headline = `${name} · 头等舱尊享美学`;
      subheadline = mat;
    }

    const prompt = `Professional commercial photography of ${name}, ${meta.promptFocus}, architectural lighting, ${meta.safeAreaFocus}, hyperrealistic 8k interior design shot`;

    return {
      screenIndex: index,
      screenTitle: meta.title,
      role: meta.role,
      templateId: meta.defaultTemplateId,
      prompt,
      negativePrompt: DEFAULT_NEGATIVE_PROMPT,
      safeAreaFocus: meta.safeAreaFocus,
      headline,
      subheadline,
      body,
      sourceImageUrl: productInfo?.referenceImageUrl,
      sourceWidth: 2560,
      sourceHeight: 1440,
      sourceAspectRatio: 2560 / 1440,
      status: productInfo?.referenceImageUrl ? 'review' : 'pending'
    };
  });
}

/**
 * Builds a single PosterCompositionSnapshot from template and screen plan data
 */
export function buildPosterComposition(
  plan: PlanScreenItem,
  customImageUrl?: string,
  customWidth?: number,
  customHeight?: number,
  customAspectRatioStr?: string
): PosterCompositionSnapshot {
  const template = POSTER_TEMPLATES[plan.templateId] || POSTER_TEMPLATES['hero-editorial'];
  const imageUrl = customImageUrl || plan.sourceImageUrl || '';

  // Determine actual image dimensions and aspect ratio
  const srcW = customWidth || plan.sourceWidth;
  const srcH = customHeight || plan.sourceHeight;
  
  let canvasAspect = 0.75; // default 3:4 (2100x2800)
  if (srcW && srcH && srcH > 0) {
    canvasAspect = srcW / srcH;
  } else if (customAspectRatioStr) {
    const parts = customAspectRatioStr.split(':');
    if (parts.length === 2 && parseFloat(parts[1]) > 0) {
      canvasAspect = parseFloat(parts[0]) / parseFloat(parts[1]);
    }
  } else if (plan.sourceAspectRatio && plan.sourceAspectRatio > 0) {
    canvasAspect = plan.sourceAspectRatio;
  }

  // Calculate dynamic canvas width & height (base height 2800px)
  let canvasHeight = 2800;
  let canvasWidth = Math.round(canvasHeight * canvasAspect);
  
  // Cap max width for ultra-wide images to 2800px base
  if (canvasWidth > 3800) {
    canvasWidth = 2800;
    canvasHeight = Math.round(canvasWidth / canvasAspect);
  }

  const scaleX = canvasWidth / 2100;
  const scaleY = canvasHeight / 2800;

  const imageLayers: PosterImageLayer[] = template.imageFrames.map((frame, idx) => {
    const isHeroFrame = idx === 0 || frame.fitMode === 'cover';
    return {
      id: `img_layer_${plan.screenIndex}_${idx}_${Date.now()}`,
      sourceWidth: srcW || canvasWidth,
      sourceHeight: srcH || canvasHeight,
      sourceAspectRatio: canvasAspect,
      frameX: isHeroFrame ? 0 : Math.round(frame.x * scaleX),
      frameY: isHeroFrame ? 0 : Math.round(frame.y * scaleY),
      frameWidth: isHeroFrame ? canvasWidth : Math.round(frame.width * scaleX),
      frameHeight: isHeroFrame ? canvasHeight : Math.round(frame.height * scaleY),
      fitMode: frame.fitMode,
      focalPoint: frame.defaultFocalPoint || { x: 0.5, y: 0.5 },
      imageUrl: imageUrl,
      assetVersionId: plan.sourceAssetVersionId || `asset_s${plan.screenIndex}`,
      objectKey: `screens/screen-${String(plan.screenIndex).padStart(2, '0')}/hero.jpg`,
      backgroundColor: '#F7F4EF',
      opacity: 1,
      zIndex: 1
    };
  });

  const textLayers: PosterTextLayer[] = template.textSlots.map((slot, idx) => {
    let content = slot.defaultText;
    if (slot.role === 'headline' && plan.headline) content = plan.headline;
    else if (slot.role === 'subheadline' && plan.subheadline) content = plan.subheadline;
    else if (slot.role === 'body' && plan.body) content = plan.body;

    return {
      id: `text_layer_${plan.screenIndex}_${idx}`,
      role: slot.role,
      text: content,
      x: Math.round(slot.x * scaleX),
      y: Math.round(slot.y * scaleY),
      width: Math.round(slot.width * scaleX),
      height: Math.round(slot.height * scaleY),
      fontFamily: 'PingFang SC, -apple-system, "Segoe UI", Roboto, sans-serif',
      fontSize: Math.round(slot.fontSize * Math.min(scaleX, scaleY)),
      fontWeight: slot.fontWeight,
      color: slot.color,
      textAlign: slot.textAlign,
      maxLines: slot.maxLines,
      zIndex: 10
    };
  });

  const decorationLayers: DecorationLayer[] = template.decorationSlots.map((dec, idx) => ({
    id: `dec_layer_${plan.screenIndex}_${idx}`,
    type: dec.type,
    x: Math.round(dec.x * scaleX),
    y: Math.round(dec.y * scaleY),
    width: Math.round(dec.width * scaleX),
    height: Math.round(dec.height * scaleY),
    props: dec.props,
    zIndex: 5
  }));

  return {
    screenIndex: plan.screenIndex,
    screenTitle: plan.screenTitle,
    role: plan.role,
    templateId: plan.templateId,
    sourceAssetVersionId: plan.sourceAssetVersionId || `source_ver_${plan.screenIndex}`,
    sourceImageUrl: imageUrl,
    copyVersionId: `copy_v1_${plan.screenIndex}`,
    imageLayers,
    textLayers,
    decorationLayers,
    width: canvasWidth,
    height: canvasHeight,
    backgroundColor: '#F7F4EF',
    status: plan.status,
    renderedUrl: plan.renderedUrl
  };
}

/**
 * Downloads single 2100x2800 JPEG poster
 */
export async function downloadSinglePosterJpeg(
  snapshot: PosterCompositionSnapshot,
  filename?: string
): Promise<void> {
  const name =
    filename ||
    `MANWAH_0${snapshot.screenIndex}_${snapshot.screenTitle?.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_') || '海报'}_2100x2800.jpg`;

  if (snapshot.renderedUrl && !snapshot.renderedUrl.startsWith('data:')) {
    try {
      const response = await fetch(snapshot.renderedUrl);
      const blob = await response.blob();
      saveAs(blob, name);
      return;
    } catch (e) {
      console.warn('Direct URL fetch failed, falling back to canvas synthesis:', e);
    }
  }

  // Client-side offscreen rendering fallback ensuring precise 2100x2800 dimensions
  const blob = await renderSnapshotToBlob(snapshot);
  saveAs(blob, name);
}

/**
 * Packages and downloads 9 JPEG posters in a ZIP archive
 */
export async function downloadNinePostersZip(
  snapshots: PosterCompositionSnapshot[],
  zipTitle = 'MANWAH_九屏电商详情海报套件'
): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder(zipTitle) || zip;

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const indexStr = String(snap.screenIndex || i + 1).padStart(2, '0');
    const safeTitle = (snap.screenTitle || `第${indexStr}屏`).replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
    const fileName = `${indexStr}_${safeTitle}_2100x2800.jpg`;

    try {
      const blob = await renderSnapshotToBlob(snap);
      folder.file(fileName, blob);
    } catch (err) {
      console.error(`Failed to pack poster ${fileName}:`, err);
    }
  }

  // Add manifest JSON for traceable reference
  const manifestData: NinePosterManifest = {
    schemaVersion: 'nine-poster-manifest/v1',
    canvasId: `studio_canvas_${Date.now()}`,
    posters: snapshots.map((s, idx) => ({
      screenIndex: s.screenIndex || idx + 1,
      posterCompositionId: `comp_s${s.screenIndex || idx + 1}`,
      assetVersionId: s.sourceAssetVersionId || `asset_s${s.screenIndex || idx + 1}`,
      width: 2100,
      height: 2800,
      checksum: `ck_${Date.now()}_${idx}`
    }))
  };
  folder.file('manifest.json', JSON.stringify(manifestData, null, 2));

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  saveAs(zipBlob, `${zipTitle}_${Date.now()}.zip`);
}

/**
 * Offscreen rendering of PosterCompositionSnapshot to 2100x2800 JPEG Blob
 */
export async function renderSnapshotToBlob(snapshot: PosterCompositionSnapshot): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = POSTER_SPEC.width; // 2100
  canvas.height = POSTER_SPEC.height; // 2800
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }

  // 1. Background fill
  ctx.fillStyle = snapshot.backgroundColor || '#F7F4EF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Render Image Layers
  for (const layer of snapshot.imageLayers) {
    if (layer.imageUrl) {
      try {
        const img = await loadImageElement(layer.imageUrl);
        const naturalW = img.naturalWidth || layer.sourceWidth || 2100;
        const naturalH = img.naturalHeight || layer.sourceHeight || 2800;

        ctx.save();
        ctx.beginPath();
        ctx.rect(layer.frameX, layer.frameY, layer.frameWidth, layer.frameHeight);
        ctx.clip();

        if (layer.fitMode === 'contain') {
          // Contain: scale to fit within frame with letterboxing, no stretching
          const scale = Math.min(layer.frameWidth / naturalW, layer.frameHeight / naturalH);
          const dw = naturalW * scale;
          const dh = naturalH * scale;
          const dx = layer.frameX + (layer.frameWidth - dw) * 0.5;
          const dy = layer.frameY + (layer.frameHeight - dh) * 0.5;
          ctx.drawImage(img, dx, dy, dw, dh);
        } else {
          // Cover: scale to fill frame completely, cropped by focal point, no stretching
          const scale = Math.max(layer.frameWidth / naturalW, layer.frameHeight / naturalH);
          const dw = naturalW * scale;
          const dh = naturalH * scale;
          const focalX = layer.focalPoint?.x ?? 0.5;
          const focalY = layer.focalPoint?.y ?? 0.5;
          const dx = layer.frameX + (layer.frameWidth - dw) * focalX;
          const dy = layer.frameY + (layer.frameHeight - dh) * focalY;
          ctx.drawImage(img, dx, dy, dw, dh);
        }
        ctx.restore();
      } catch (e) {
        console.warn('Image render warning:', e);
      }
    }
  }

  // 3. Render Decorations (Gradients & Cards)
  for (const dec of snapshot.decorationLayers || []) {
    ctx.save();
    if (dec.type === 'shape') {
      ctx.fillStyle = (dec.props?.color as string) || '#F7F4EF';
      const r = (dec.props?.radius as number) || 0;
      roundRect(ctx, dec.x, dec.y, dec.width, dec.height, r);
      ctx.fill();
    } else if (dec.type === 'gradient') {
      const grad = ctx.createLinearGradient(dec.x, dec.y, dec.x, dec.y + dec.height);
      grad.addColorStop(0, (dec.props?.from as string) || 'transparent');
      grad.addColorStop(1, (dec.props?.to as string) || '#F7F4EF');
      ctx.fillStyle = grad;
      ctx.fillRect(dec.x, dec.y, dec.width, dec.height);
    }
    ctx.restore();
  }

  // 4. Render Text Layers
  for (const textLayer of snapshot.textLayers) {
    if (!textLayer.text) continue;
    ctx.save();
    ctx.fillStyle = textLayer.color || '#1A1817';
    ctx.font = `${textLayer.fontWeight || 600} ${textLayer.fontSize || 36}px PingFang SC, -apple-system, sans-serif`;
    ctx.textAlign = textLayer.textAlign || 'left';
    ctx.textBaseline = 'top';

    const lines = textLayer.text.split('\n');
    const lineHeight = (textLayer.fontSize || 36) * 1.35;
    const maxLines = textLayer.maxLines || 4;

    let startX = textLayer.x;
    if (textLayer.textAlign === 'center') {
      startX = textLayer.x + textLayer.width / 2;
    } else if (textLayer.textAlign === 'right') {
      startX = textLayer.x + textLayer.width;
    }

    for (let l = 0; l < Math.min(lines.length, maxLines); l++) {
      ctx.fillText(lines[l], startX, textLayer.y + l * lineHeight);
    }
    ctx.restore();
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob || new Blob([])), 'image/jpeg', 0.95);
  });
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  if (width < 2 * radius) radius = width / 2;
  if (height < 2 * radius) radius = height / 2;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
