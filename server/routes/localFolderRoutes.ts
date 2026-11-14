import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

/**
 * 本机调试用的“服务端读文件夹”兜底。
 *
 * 背景：浏览器的 showDirectoryPicker 在内嵌浏览器、部分 Edge/策略环境、或选了桌面/文档/下载等
 * 受保护目录时会直接 AbortError，本地调试时没法授权素材文件夹。本地服务和素材在同一台电脑上，
 * 所以让服务端直接按路径读取即可（云端部署没有这个需求，也不允许）。
 *
 * 安全：只在非生产环境、且请求来自本机回环地址时启用；只读、只放行图片/文档扩展名，
 * 路径必须落在扫描时登记过的根目录之内。
 *   GET  /api/local-folder/status
 *   POST /api/local-folder/scan   { dir }
 *   GET  /api/local-folder/file?root=<id>&p=<相对路径>&w=<缩略图宽，可选>
 */
const router = Router();

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'bmp', 'tiff']);
const OTHER_EXT = new Set(['pdf', 'doc', 'docx', 'txt', 'md', 'xlsx', 'xls', 'ppt', 'pptx', 'psd', 'ai', 'mp4', 'mov', 'webm']);
const IGNORED_DIRS = new Set(['node_modules', '.git', '.svn', '$recycle.bin', '.vscode', '.idea', 'dist', 'build']);
const MAX_ITEMS = 3000;
const MAX_DEPTH = 6;

const roots = new Map<string, string>();

export function isLocalFolderAllowed(req: Pick<Request, 'socket'>): boolean {
  if (process.env.NODE_ENV === 'production' && process.env.LOCAL_FOLDER_ENABLED !== '1') return false;
  const addr = req.socket?.remoteAddress || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function guard(req: Request, res: Response): boolean {
  if (isLocalFolderAllowed(req)) return true;
  res.status(404).json({ success: false, error: { message: '本机文件夹读取只在本地调试时可用' } });
  return false;
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function resolveInside(root: string, rel: string): string | null {
  const full = path.resolve(root, rel);
  const back = path.relative(root, full);
  if (back.startsWith('..') || path.isAbsolute(back)) return null;
  return full;
}

interface ScanItem {
  name: string;
  path: string;
  size: number;
  lastModified: number;
  extension: string;
}

async function scan(dir: string, rel: string, depth: number, out: ScanItem[]): Promise<void> {
  if (out.length >= MAX_ITEMS || depth > MAX_DEPTH) return;
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(path.join(dir, rel), { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true }));
  for (const entry of entries) {
    if (out.length >= MAX_ITEMS) return;
    const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name.toLowerCase()) && !entry.name.startsWith('.')) await scan(dir, entryRel, depth + 1, out);
    } else if (entry.isFile()) {
      const ext = extOf(entry.name);
      if (!IMAGE_EXT.has(ext) && !OTHER_EXT.has(ext)) continue;
      try {
        const st = await fs.promises.stat(path.join(dir, entryRel));
        out.push({ name: entry.name, path: entryRel, size: st.size, lastModified: st.mtimeMs, extension: ext });
      } catch {
        /* 读不了的文件跳过 */
      }
    }
  }
}

router.get('/status', (req: Request, res: Response) => {
  res.json({ success: true, enabled: isLocalFolderAllowed(req) });
});

router.post('/scan', async (req: Request, res: Response) => {
  if (!guard(req, res)) return;
  try {
    const raw = typeof req.body?.dir === 'string' ? req.body.dir.trim().replace(/^"+|"+$/g, '') : '';
    if (!raw || !path.isAbsolute(raw)) {
      return res.status(400).json({ success: false, error: { message: '请填写完整的文件夹路径，如 D:\\素材' } });
    }
    const dir = path.resolve(raw);
    let st: fs.Stats;
    try {
      st = await fs.promises.stat(dir);
    } catch {
      return res.status(400).json({ success: false, error: { message: `找不到文件夹：${dir}` } });
    }
    if (!st.isDirectory()) return res.status(400).json({ success: false, error: { message: '这个路径不是文件夹' } });
    const items: ScanItem[] = [];
    await scan(dir, '', 0, items);
    const id = crypto.createHash('sha1').update(dir.toLowerCase()).digest('hex').slice(0, 12);
    roots.set(id, dir);
    res.json({ success: true, rootId: id, dirName: path.basename(dir) || dir, items, truncated: items.length >= MAX_ITEMS });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || '读取文件夹失败' } });
  }
});

router.get('/file', async (req: Request, res: Response) => {
  if (!guard(req, res)) return;
  try {
    const root = roots.get(String(req.query.root || ''));
    const rel = String(req.query.p || '');
    if (!root || !rel) return res.status(400).json({ success: false, error: { message: '参数无效，请先读取文件夹' } });
    const full = resolveInside(root, rel);
    const ext = extOf(rel);
    if (!full || (!IMAGE_EXT.has(ext) && !OTHER_EXT.has(ext))) return res.status(403).json({ success: false, error: { message: '不允许读取该文件' } });
    const w = Math.round(Number(req.query.w));
    if (IMAGE_EXT.has(ext) && ext !== 'svg' && Number.isFinite(w) && w >= 16 && w <= 6000) {
      // 缩略图：JPEG 走 shrink-on-load，十几 MB 的原图也很快
      const buf = await sharp(full, { failOn: 'none' }).rotate().resize(w, w, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.end(buf);
    }
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.sendFile(full, err => {
      if (err && !res.headersSent) res.status(404).json({ success: false, error: { message: '文件不存在' } });
    });
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ success: false, error: { message: err?.message || '读取文件失败' } });
  }
});

export default router;
