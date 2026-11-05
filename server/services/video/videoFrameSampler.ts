// server/services/video/videoFrameSampler.ts
// 从画布上的视频中均匀抽取若干帧（开头、1/4、1/2、3/4、结尾），供多模态模型“看”视频。
// 依赖系统 ffmpeg（可用 FFMPEG_PATH 指定路径）；不可用时抛错，由调用方降级为只提供文字信息。
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const FRAME_WIDTH = 640;
const CACHE_LIMIT = 20;

export interface SampledFrame {
  /** 帧所在时间点（秒） */
  atSeconds: number;
  /** 帧位置说明，如“开头”“结尾” */
  label: string;
  /** JPEG data URL */
  dataUrl: string;
}

export interface VideoFrameSample {
  durationSeconds: number;
  frames: SampledFrame[];
}

const cache = new Map<string, VideoFrameSample>();

/** 只允许抓取公网地址或本服务自身的视频路由，避免被用来访问内网（SSRF） */
function resolveVideoUrl(input: { videoUrl?: string | null; assetVersionId?: string | null }): string {
  const port = process.env.PORT || 3000;
  const raw = String(input.videoUrl || '').trim();
  if (raw.startsWith('/')) {
    if (!/^\/api\/(video-assets|canvases\/assets)\//.test(raw)) throw new Error('不支持的视频地址');
    return `http://127.0.0.1:${port}${raw}`;
  }
  if (/^https?:\/\//i.test(raw)) {
    const host = new URL(raw).hostname.toLowerCase();
    const isPrivate =
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '0.0.0.0' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host === '[::1]' ||
      host.startsWith('[fc') ||
      host.startsWith('[fd');
    if (isPrivate) throw new Error('不支持的视频地址');
    return raw;
  }
  if (input.assetVersionId && /^[\w.-]+$/.test(input.assetVersionId)) {
    return `http://127.0.0.1:${port}/api/video-assets/${encodeURIComponent(input.assetVersionId)}/playback-url`;
  }
  throw new Error('视频没有可用的播放地址');
}

function runFfmpeg(args: string[], timeoutMs = 30_000): Promise<{ stdout: Buffer; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { windowsHide: true });
    const out: Buffer[] = [];
    let err = '';
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
    proc.stdout.on('data', d => out.push(d));
    proc.stderr.on('data', d => { err += d.toString(); });
    proc.on('error', e => {
      clearTimeout(timer);
      reject(new Error(`ffmpeg 不可用：${(e as any).code === 'ENOENT' ? '未安装或未加入 PATH（可设置 FFMPEG_PATH）' : e.message}`));
    });
    proc.on('close', code => {
      clearTimeout(timer);
      resolve({ stdout: Buffer.concat(out), stderr: err, code });
    });
  });
}

async function downloadVideo(url: string, file: string): Promise<void> {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`视频下载失败（HTTP ${res.status}）`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_VIDEO_BYTES) throw new Error('视频过大，无法抽帧');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_VIDEO_BYTES) throw new Error('视频过大，无法抽帧');
  await fs.promises.writeFile(file, buf);
}

export async function sampleVideoFrames(
  input: { videoUrl?: string | null; assetVersionId?: string | null },
  frameCount = 5
): Promise<VideoFrameSample> {
  const url = resolveVideoUrl(input);
  const cacheKey = `${url}#${frameCount}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const file = path.join(os.tmpdir(), `agent-video-${crypto.randomBytes(6).toString('hex')}.mp4`);
  try {
    await downloadVideo(url, file);

    // ffmpeg -i 不带输出时会在 stderr 打印 Duration
    const probe = await runFfmpeg(['-hide_banner', '-i', file]);
    const m = probe.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    const duration = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
    if (!duration) throw new Error('无法读取视频时长');

    const n = Math.max(2, Math.min(8, frameCount));
    const frames: SampledFrame[] = [];
    for (let i = 0; i < n; i++) {
      // 首尾各留 0.15 秒，避开黑场/编码起始帧
      const at = Math.min(duration - 0.15, Math.max(0.15, (duration * i) / (n - 1)));
      const label = i === 0 ? '开头' : i === n - 1 ? '结尾' : `${Math.round((i / (n - 1)) * 100)}% 处`;
      const r = await runFfmpeg(['-hide_banner', '-loglevel', 'error', '-ss', at.toFixed(2), '-i', file, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-']);
      if (r.code !== 0 || r.stdout.length === 0) continue;
      const jpg = await sharp(r.stdout).resize(FRAME_WIDTH, FRAME_WIDTH, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      frames.push({ atSeconds: Number(at.toFixed(1)), label, dataUrl: `data:image/jpeg;base64,${jpg.toString('base64')}` });
    }
    if (frames.length === 0) throw new Error('没能从视频中抽出画面');

    const result = { durationSeconds: Number(duration.toFixed(1)), frames };
    cache.set(cacheKey, result);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    return result;
  } finally {
    fs.promises.unlink(file).catch(() => {});
  }
}
