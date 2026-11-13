// server/services/video/videoStitchService.ts
// 把分镜视频按顺序拼成一条成片：统一分辨率与帧率后硬切或淡入淡出衔接，上传到 Supabase 存储。
// 依赖系统 ffmpeg（可用 FFMPEG_PATH 指定），与抽帧共用下载与 SSRF 校验。
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { supabaseAdmin } from '../../../src/lib/supabase';
import { resolveVideoUrl, runFfmpeg, downloadVideo } from './videoFrameSampler';

const MAX_CLIPS = 12;
const FADE_SECONDS = 0.4;
const OUTPUT_FPS = 24;
const BUCKET = 'creative-canvas-assets';

export type StitchTransition = 'cut' | 'fade';

export interface StitchRequest {
  canvasId: string;
  clips: Array<{ videoUrl?: string | null; assetVersionId?: string | null }>;
  transition?: StitchTransition;
}

export interface StitchResult {
  videoUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  clipCount: number;
  sizeBytes: number;
}

function parseDuration(stderr: string): number {
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

function parseSize(stderr: string): { width: number; height: number } | null {
  const m = stderr.match(/Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

export async function stitchVideos(req: StitchRequest): Promise<StitchResult> {
  const clips = (req.clips || []).slice(0, MAX_CLIPS);
  if (clips.length < 2) throw new Error('至少需要 2 个镜头才能拼接');
  const urls = clips.map(c => resolveVideoUrl(c));
  const transition: StitchTransition = req.transition === 'fade' ? 'fade' : 'cut';

  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'stitch-'));
  try {
    const files = urls.map((_, i) => path.join(workDir, `clip-${i}.mp4`));
    await Promise.all(
      urls.map(async (url, i) => {
        let lastErr: any;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await downloadVideo(url, files[i]);
            return;
          } catch (e: any) {
            lastErr = e;
            console.warn(`[videoStitch] download clip ${i + 1} attempt ${attempt}/3 failed: ${e?.message || e}`);
          }
        }
        throw new Error(`镜头 ${i + 1} 下载失败（已重试 3 次）：${lastErr?.message || lastErr}`);
      })
    );

    const probes = await Promise.all(files.map(f => runFfmpeg(['-hide_banner', '-i', f])));
    const durations = probes.map(p => parseDuration(p.stderr));
    if (durations.some(d => !d)) throw new Error('有镜头无法读取时长，可能已损坏');
    // 以第一个镜头的画幅为准，其余镜头等比缩放后补边，避免拉伸变形
    const size = parseSize(probes[0].stderr) || { width: 720, height: 1280 };
    const width = size.width - (size.width % 2);
    const height = size.height - (size.height % 2);

    const normalize = files
      .map(
        (_, i) =>
          `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
          `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${OUTPUT_FPS},format=yuv420p,settb=AVTB[v${i}]`
      )
      .join(';');

    let chain = '';
    let total = durations.reduce((a, b) => a + b, 0);
    if (transition === 'fade') {
      // xfade 的 offset 是累计时长减去已重叠部分；镜头过短时退化为硬切
      const fade = Math.min(FADE_SECONDS, ...durations.map(d => d / 3));
      let prev = 'v0';
      let offset = 0;
      for (let i = 1; i < files.length; i++) {
        offset += durations[i - 1] - fade;
        const out = i === files.length - 1 ? 'out' : `x${i}`;
        chain += `;[${prev}][v${i}]xfade=transition=fade:duration=${fade.toFixed(2)}:offset=${offset.toFixed(3)}[${out}]`;
        prev = out;
      }
      total -= fade * (files.length - 1);
    } else {
      chain = `;${files.map((_, i) => `[v${i}]`).join('')}concat=n=${files.length}:v=1:a=0[out]`;
    }

    const output = path.join(workDir, 'stitched.mp4');
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y',
      ...files.flatMap(f => ['-i', f]),
      '-filter_complex', normalize + chain,
      '-map', '[out]',
      '-an',
      // xfade 会把像素格式提到 yuv444p，浏览器和手机大多播不了，输出前强制回 yuv420p
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-preset', 'veryfast', '-crf', '20',
      '-movflags', '+faststart',
      output
    ];
    const r = await runFfmpeg(args, 240_000);
    if (r.code !== 0) throw new Error(`拼接失败：${r.stderr.trim().split('\n').slice(-2).join(' ').slice(0, 300) || `ffmpeg 退出码 ${r.code}`}`);

    const buf = await fs.promises.readFile(output);
    const safeCanvas = String(req.canvasId || 'canvas').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    const objectPath = `videos/stitched/${safeCanvas}/stitch-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.mp4`;
    // Supabase 网络常 ECONNRESET / fetch failed，成片已经拼好，别因为一次上传失败就整个作废
    let uploadError: { message: string } | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { error } = await supabaseAdmin.storage.from(BUCKET).upload(objectPath, buf, { contentType: 'video/mp4', upsert: true });
        uploadError = error ? { message: error.message } : null;
      } catch (e: any) {
        uploadError = { message: e?.message || 'fetch failed' };
      }
      if (!uploadError) break;
      console.warn(`[videoStitch] upload attempt ${attempt}/3 failed: ${uploadError.message}`);
      if (attempt < 3) await new Promise(r => setTimeout(r, 1500 * attempt));
    }
    if (uploadError) throw new Error(`成片上传失败（已重试 3 次）：${uploadError.message}`);
    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(objectPath);
    if (!data?.publicUrl) throw new Error('成片上传后没有拿到播放地址');

    return {
      videoUrl: data.publicUrl,
      durationSeconds: Number(total.toFixed(1)),
      width,
      height,
      clipCount: files.length,
      sizeBytes: buf.length
    };
  } finally {
    fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
