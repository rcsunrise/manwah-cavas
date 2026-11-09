/** 下载文件名里的户型 / 美学标签（记录在版本上，换了美学后再导出旧版本也不会标错） */
export interface RevisionExportLabels {
  space: string;
  style: string;
}

/** 预设名称去掉英文括注："美式庄园宅 (American Grand Manor Estate)" → "美式庄园宅" */
export function cleanPresetName(name: string | undefined | null): string {
  return (name || '').split(/\s*[(（]/)[0].trim();
}

function sanitizeSegment(value: string | undefined | null): string {
  return (value || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 40);
}

function formatTimestamp(createdAt: string | undefined, fallback: Date): string {
  const parsed = createdAt ? new Date(createdAt) : fallback;
  const d = Number.isNaN(parsed.getTime()) ? fallback : parsed;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * 导出文件名：MANWAH_户型_美学_镜头_v版本[_方案N]_模型_月日-时分秒_分辨率.扩展名
 * 版本号 + 生成时间保证同镜头多次生成不重名（删掉最新版后重新生成会复用版本号，时间仍不同）；
 * 同一批多张候选用方案序号区分。
 */
export function buildShotExportFileName(params: {
  spaceName?: string;
  styleName?: string;
  shotCode: string;
  revisionNumber?: number;
  candidateNumber?: number;
  /** 可读模型名，例如 "GPT 2.6 Flare"；两步出图为 "A + B 精修" */
  modelLabel?: string;
  createdAt?: string;
  resolution?: string;
  format: string;
  now?: Date;
}): string {
  const segments = [
    'MANWAH',
    sanitizeSegment(cleanPresetName(params.spaceName)),
    sanitizeSegment(cleanPresetName(params.styleName)),
    sanitizeSegment(params.shotCode),
    params.revisionNumber ? `v${params.revisionNumber}` : '',
    params.candidateNumber ? `方案${params.candidateNumber}` : '',
    sanitizeSegment((params.modelLabel || '').replace(/\s*\+\s*/g, '+').replace(/·/g, '-')),
    formatTimestamp(params.createdAt, params.now || new Date()),
    sanitizeSegment(params.resolution)
  ].filter(Boolean);
  return `${segments.join('_')}.${params.format}`;
}
