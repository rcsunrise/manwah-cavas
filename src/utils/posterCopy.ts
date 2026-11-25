import type { ProductPosterCopy } from '../types/creativeCanvas';

/** 录入框的字数上限，和服务端 sanitizeFixedCopy / 海报排版能放下的长度一致 */
export const POSTER_COPY_LIMITS = { title: 4, subtitle: 16, inspiration: 32, detailTitle: 7, detailDesc: 40 } as const;

export interface FixedPosterCopyPayload {
  name?: string;
  subtitle?: string;
  inspiration?: string;
  photoDetails?: Array<{ photo: number; title?: string; desc?: string }>;
  otherDetails?: Array<{ title?: string; desc?: string }>;
}

const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? Array.from(v.replace(/\s+/g, ' ').trim()).slice(0, max).join('') : '';

/** 有效的细节实拍：与生成海报时筛选 detailPhotos 的规则一致（blob: 预览、空格不算） */
const isPhoto = (u: unknown): u is string => typeof u === 'string' && /^(https?:|data:)/.test(u);

/**
 * 产品节点录入的文案 → /api/poster-templates/concept 的 fixedCopy。
 * - 主图正文：第一行是副标题，第二行起是灵感小字；
 * - 细节格：有实拍的格子按实拍顺序编号（photo 从 1 起，和 attachments 前几张对应）；
 *   没有实拍的格子放进 otherDetails，给主场景裁切的格子按顺序用。
 * 什么都没录入时返回 undefined（全部交给 AI 写）。
 */
export function buildFixedPosterCopy(copy: ProductPosterCopy | undefined, detailSlots: Array<string | null>): FixedPosterCopyPayload | undefined {
  if (!copy) return undefined;
  const out: FixedPosterCopyPayload = {};
  const name = clean(copy.title, POSTER_COPY_LIMITS.title);
  if (name) out.name = name;
  const [line1 = '', ...rest] = (copy.body || '').split(/\r?\n/);
  const subtitle = clean(line1, POSTER_COPY_LIMITS.subtitle);
  const inspiration = clean(rest.join(' '), POSTER_COPY_LIMITS.inspiration);
  if (subtitle) out.subtitle = subtitle;
  if (inspiration) out.inspiration = inspiration;

  const photoDetails: NonNullable<FixedPosterCopyPayload['photoDetails']> = [];
  const otherDetails: NonNullable<FixedPosterCopyPayload['otherDetails']> = [];
  let photoNo = 0;
  detailSlots.forEach((url, i) => {
    const hasPhoto = isPhoto(url);
    if (hasPhoto) photoNo += 1;
    const d = copy.details?.[i];
    const title = clean(d?.title, POSTER_COPY_LIMITS.detailTitle);
    const desc = clean(d?.desc, POSTER_COPY_LIMITS.detailDesc);
    if (!title && !desc) return;
    if (hasPhoto) photoDetails.push({ photo: photoNo, ...(title ? { title } : {}), ...(desc ? { desc } : {}) });
    else otherDetails.push({ ...(title ? { title } : {}), ...(desc ? { desc } : {}) });
  });
  if (photoDetails.length) out.photoDetails = photoDetails;
  if (otherDetails.length) out.otherDetails = otherDetails;
  return Object.keys(out).length ? out : undefined;
}
