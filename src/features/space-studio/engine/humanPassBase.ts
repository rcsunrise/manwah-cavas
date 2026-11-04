// src/features/space-studio/engine/humanPassBase.ts
// 人物入座 (Human Pass) 底图与画幅解析：
// 1. 底图必须是"无人"的空间版本。若当前展示的是人物版，沿 parentRevisionId 回溯到它所基于的纯空间/实拍版本，
//    避免在已有人物的图上再次"植入人物"导致模型整张重绘（换房间、换产品、换人）；
// 2. 输出画幅跟随底图实际比例，底图与镜头画幅不一致时不得强行重构图。

import type { ImageAspectRatio, ShotInstance, ShotRevision } from '../../../types/spaceStudio';

const isHumanRevision = (rev: ShotRevision) => rev.revisionType === 'human';

export function resolveHumanPassBaseRevision(shot: Pick<ShotInstance, 'revisions' | 'currentRevisionId'>): ShotRevision | undefined {
  const revisions = shot.revisions || [];
  if (revisions.length === 0) return undefined;
  const byId = new Map(revisions.map((r) => [r.id, r]));

  let cursor: ShotRevision | undefined =
    (shot.currentRevisionId ? byId.get(shot.currentRevisionId) : undefined) || revisions[0];
  const visited = new Set<string>();
  while (cursor && isHumanRevision(cursor) && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    cursor = cursor.parentRevisionId ? byId.get(cursor.parentRevisionId) : undefined;
  }
  if (cursor && !isHumanRevision(cursor) && (cursor.imageUrl || cursor.objectKey)) return cursor;

  // 溯源链断裂时，退回最新一版带图的无人版本
  return revisions
    .filter((r) => !isHumanRevision(r) && (r.imageUrl || r.objectKey))
    .sort((a, b) => b.revisionNumber - a.revisionNumber)[0];
}

const HUMAN_PASS_RATIOS: Array<[ImageAspectRatio, number]> = [
  ['3:4', 3 / 4],
  ['4:3', 4 / 3],
  ['1:1', 1],
  ['2:3', 2 / 3],
  ['3:2', 3 / 2],
  ['9:16', 9 / 16],
  ['16:9', 16 / 9]
];

const parseRatio = (ratio?: string): number | undefined => {
  const m = ratio?.match(/^(\d+):(\d+)$/);
  return m ? Number(m[1]) / Number(m[2]) : undefined;
};

/** 镜头画幅与底图比例相差在 8% 以内时沿用镜头画幅，否则取最接近底图的标准比例 */
export function resolveHumanPassAspectRatio(
  shotAspect: ImageAspectRatio | undefined,
  baseSize?: { width: number; height: number } | null
): ImageAspectRatio | undefined {
  if (!baseSize || !baseSize.width || !baseSize.height) return shotAspect;
  const baseRatio = baseSize.width / baseSize.height;
  const shotRatio = parseRatio(shotAspect);
  if (shotRatio && Math.abs(shotRatio - baseRatio) / baseRatio <= 0.08) return shotAspect;
  return HUMAN_PASS_RATIOS.reduce((best, cur) =>
    Math.abs(Math.log(cur[1] / baseRatio)) < Math.abs(Math.log(best[1] / baseRatio)) ? cur : best
  )[0];
}

/** 浏览器端读取底图实际尺寸，失败返回 null（不阻断出图） */
export function measureImageSize(src?: string, timeoutMs = 8000): Promise<{ width: number; height: number } | null> {
  if (!src || typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : null);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}
