import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

/**
 * 海报排版用字体：标题用宋体（思源宋体 / Noto Serif SC），正文用黑体（思源黑体 / Noto Sans SC）。
 * 按顺序找第一个存在的字体文件；都找不到时报错，而不是退回系统默认字体（默认字体会把版式整体拉垮）。
 *
 * 查找顺序：环境变量 → 项目 assets/fonts → Windows 系统字体 → Debian fonts-noto-cjk（Docker 镜像）。
 */
export type PosterFontRole = 'serif' | 'sans';

interface FontCandidate {
  file: string;
  family: string;
}

export interface ResolvedFont {
  file: string;
  family: string;
}

const PROJECT_FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');

function candidatesFor(role: PosterFontRole): FontCandidate[] {
  if (role === 'serif') {
    return [
      ...(process.env.POSTER_FONT_SERIF ? [{ file: process.env.POSTER_FONT_SERIF, family: process.env.POSTER_FONT_SERIF_FAMILY || 'Noto Serif SC' }] : []),
      { file: path.join(PROJECT_FONT_DIR, 'NotoSerifSC-VF.ttf'), family: 'Noto Serif SC' },
      { file: path.join(PROJECT_FONT_DIR, 'SourceHanSerifSC-VF.ttf'), family: 'Source Han Serif SC VF' },
      { file: 'C:/Windows/Fonts/NotoSerifSC-VF.ttf', family: 'Noto Serif SC' },
      { file: '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc', family: 'Noto Serif CJK SC' },
      { file: 'C:/Windows/Fonts/STSONG.TTF', family: 'STSong' }
    ];
  }
  return [
    ...(process.env.POSTER_FONT_SANS ? [{ file: process.env.POSTER_FONT_SANS, family: process.env.POSTER_FONT_SANS_FAMILY || 'Noto Sans SC' }] : []),
    { file: path.join(PROJECT_FONT_DIR, 'NotoSansSC-VF.ttf'), family: 'Noto Sans SC' },
    { file: 'C:/Windows/Fonts/NotoSansSC-VF.ttf', family: 'Noto Sans SC' },
    { file: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', family: 'Noto Sans CJK SC' },
    { file: 'C:/Windows/Fonts/msyh.ttc', family: 'Microsoft YaHei' }
  ];
}

const resolvedCache = new Map<PosterFontRole, ResolvedFont>();

/**
 * Linux 兜底：Debian 不同版本 fonts-noto-cjk 的文件名不一样
 * （bookworm 是 NotoSerifCJK-Regular.ttc，trixie 起是 NotoSerifCJK-VF.otf.ttc），
 * 固定路径找不到时，扫一遍系统字体目录找思源/Noto CJK 文件。
 */
function scanSystemFonts(role: PosterFontRole): FontCandidate | null {
  const roots = ['/usr/share/fonts', '/usr/local/share/fonts', '/app/fonts'];
  const want = role === 'serif' ? /Noto\s*Serif.*(CJK|SC)|SourceHanSerif/i : /Noto\s*Sans.*(CJK|SC)|SourceHanSans/i;
  const exts = /\.(ttc|otf|ttf)$/i;
  const stack = [...roots];
  let depth = 0;
  while (stack.length && depth++ < 400) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (exts.test(e.name) && want.test(e.name) && !/Mono/i.test(e.name)) {
        return { file: full, family: role === 'serif' ? 'Noto Serif CJK SC' : 'Noto Sans CJK SC' };
      }
    }
  }
  return null;
}

export function resolvePosterFont(role: PosterFontRole): ResolvedFont {
  const cached = resolvedCache.get(role);
  if (cached) return cached;
  const hit =
    candidatesFor(role).find(c => {
      try {
        return fs.existsSync(c.file);
      } catch {
        return false;
      }
    }) || scanSystemFonts(role);
  if (!hit) {
    throw new Error(
      `POSTER_FONT_NOT_FOUND: 找不到${role === 'serif' ? '宋体（思源宋体 / Noto Serif SC）' : '黑体（思源黑体 / Noto Sans SC）'}字体文件，` +
        `请放到 assets/fonts/ 或用 POSTER_FONT_${role.toUpperCase()} 环境变量指定`
    );
  }
  resolvedCache.set(role, hit);
  return hit;
}

export interface TextStyle {
  role: PosterFontRole;
  /** 字号，单位 px（按 72dpi 渲染，pt 与 px 一致） */
  size: number;
  weight?: number;
  color: string;
  /** 字间距，单位 em */
  letterSpacingEm?: number;
  /** 最大宽度：超出时换行 */
  maxWidth?: number;
  align?: 'left' | 'centre' | 'right';
  /** 额外行距，单位 px */
  lineGap?: number;
  opacity?: number;
}

export interface RenderedText {
  buffer: Buffer;
  width: number;
  height: number;
}

export function escapePangoMarkup(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 把一段文字渲染成透明底 PNG（真实字体，非 AI 生成） */
export async function renderText(text: string, style: TextStyle): Promise<RenderedText> {
  const font = resolvePosterFont(style.role);
  const spacing = Math.round((style.letterSpacingEm || 0) * style.size * 1024);
  const alpha = style.opacity !== undefined && style.opacity < 1 ? ` alpha="${Math.round(style.opacity * 100)}%"` : '';
  const markup =
    `<span foreground="${style.color}"${alpha} font_weight="${style.weight || 400}" letter_spacing="${spacing}">` +
    `${escapePangoMarkup(text)}</span>`;
  const buffer = await sharp({
    text: {
      text: markup,
      font: `${font.family} ${style.size}`,
      fontfile: font.file,
      rgba: true,
      dpi: 72,
      align: style.align || 'left',
      ...(style.maxWidth ? { width: Math.max(1, Math.round(style.maxWidth)), wrap: 'word-char' as const } : {}),
      ...(style.lineGap ? { spacing: style.lineGap } : {})
    }
  })
    .png()
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, width: meta.width || 0, height: meta.height || 0 };
}
