import sharp from 'sharp';
import { cropDetail, NormBox } from './detailCrop';
import { templateADetailAspect } from './templateA';
import { VideoSourceImageResolver } from '../video/videoSourceImageResolver';

/**
 * 模板 A 海报 → 成片：主场景原图（不带字）+ 各细节格的高清裁切，作为多参考图一次生成整段视频。
 * 结构固定为「环境 + 产品细节」：全景推近 → 按细节顺序逐个特写 → 人物放松 / 功能展开 → 回到全景。
 * 已验证 sd-2.5（tiantoken）：参考图需公网 URL、每张 ≥ 9 万像素、role=reference_image。
 */

/** 成片默认用的模型与规格 */
export const POSTER_FILM_MODEL_KEY = 'sd-2.5';
export const POSTER_FILM_DURATION = 15;
export const POSTER_FILM_RESOLUTION = '1080p';

/** sd-2.5 参考图最少 9 万像素；细节裁切短边放大到 640 留余量 */
const MIN_DETAIL_SHORT_SIDE = 640;
const MAIN_MAX_EDGE = 2048;

export interface PosterFilmDetail {
  box: NormBox;
  title?: string;
}

export function isNormBox(b: any): b is NormBox {
  return Boolean(b) && ['left', 'top', 'width', 'height'].every(k => typeof b[k] === 'number' && Number.isFinite(b[k]))
    && b.width > 0 && b.height > 0;
}

/** 按细节框从主场景原图裁特写，过小的放大到短边 640（sd-2.5 拒收 9 万像素以下的参考图） */
export async function cropFilmDetails(hero: Buffer, boxes: NormBox[]): Promise<Buffer[]> {
  if (boxes.length === 0) return [];
  const aspect = templateADetailAspect(boxes.length);
  const out: Buffer[] = [];
  for (const box of boxes) {
    const png = await cropDetail(hero, box, aspect);
    const meta = await sharp(png).metadata();
    const w = meta.width || 1;
    const h = meta.height || 1;
    const scale = Math.max(1, MIN_DETAIL_SHORT_SIDE / Math.min(w, h));
    out.push(
      await sharp(png)
        .resize(Math.round(w * scale), Math.round(h * scale), { kernel: 'lanczos3' })
        .jpeg({ quality: 92 })
        .toBuffer()
    );
  }
  return out;
}

export interface PosterFilmPromptOptions {
  productName?: string;
  /** 海报概念里的人物描述（concept.person）；空 = 海报没有人物，成片里也不能出现人 */
  person?: string;
}

export function buildPosterFilmPrompt(detailTitles: string[], durationSeconds: number, options: PosterFilmPromptOptions = {}): string {
  const name = options.productName?.trim() ? `「${options.productName.trim()}」` : '';
  const person = options.person?.trim() || '';
  const detailLines = detailTitles.map((t, i) => `图${i + 2}是「${t || `细节${i + 1}`}」`).join('，');
  return [
    `根据参考图创作一段 ${durationSeconds} 秒的横屏 16:9 沙发${name}产品广告片，环境 + 产品细节的展示方式。`,
    person
      ? `图1是这款沙发的主场景照片：以它的场景、时段、光线、沙发、人物和道具作为整部片子的世界。`
      : `图1是这款沙发的主场景照片：以它的场景、时段、光线、沙发和道具作为整部片子的世界。`,
    detailTitles.length ? `其余参考图是同一张沙发的细节特写，只用来参考部件的造型和材质：${detailLines}。` : '',
    `所有特写镜头都发生在图1的同一个场景里，背景沿用图1的环境和光线（虚化即可），不要出现白墙、棚拍或其他背景。`,
    `镜头结构：开场是整体场景的全景，镜头缓慢推近；`,
    detailTitles.length ? `然后按图2起的顺序，每个细节一个浅景深特写，运镜轻柔缓慢；` : '然后给沙发的扶手、靠背、底座各一个浅景深特写；',
    // 海报没有模特时不能凭空加人：上一版硬写“人物放松”，无人海报的成片里冒出了模特和按触控的手
    person
      ? `接着中景，图1中的人物${person.startsWith('图1') ? '' : `（${person}）`}在沙发上放松，展示沙发的舒适与功能，人物外貌与穿着和图1一致；`
      : `接着中景，镜头缓慢横移展示沙发的坐垫与靠背层次；`,
    `最后回到整体场景的全景收尾，收尾与开场是同一时段、同样的光线，不要变成黄昏、夜晚或其他时间。`,
    person ? '' : `整部片子空间里没有任何人，不要出现人物、模特、手或身体的任何部位。`,
    `每个镜头的光线、色调和环境保持连续一致。沙发的造型、比例、面料、颜色、缝线和部件与参考图完全一致，不要凭空添加新的沙发脚、底座、五金件、铭牌或按键。`,
    `画面中绝对不要出现任何文字：不要标题、字幕、标签、logo、水印；按键、触控面板和铭牌保持参考图原样，上面不要出现文字或字母。`
  ].filter(Boolean).join('');
}

/**
 * 准备成片参考图：主场景原图 + 细节裁切，全部上传为公网直链（网关的 references 只收公网 URL）。
 * 返回顺序即提示词里的图1、图2……
 */
export async function preparePosterFilmReferences(hero: Buffer, details: PosterFilmDetail[]): Promise<string[]> {
  const main = await sharp(hero, { failOn: 'none' })
    .rotate()
    .resize(MAIN_MAX_EDGE, MAIN_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  const crops = await cropFilmDetails(hero, details.map(d => d.box));
  const toDataUrl = (b: Buffer) => `data:image/jpeg;base64,${b.toString('base64')}`;
  const urls: string[] = [];
  // 逐张上传：Supabase 常 ECONNRESET，并发更容易失败
  for (const buf of [main, ...crops]) {
    urls.push(await VideoSourceImageResolver.resolveToPublicUrl(toDataUrl(buf)));
  }
  return urls;
}
