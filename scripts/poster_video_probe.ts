// scripts/poster_video_probe.ts
// 验证「模板 A 海报 + 细节格裁切 → 一次生成 15 秒无字成片」。
// 默认走 tiantoken 的豆包 sd-2.5 多模态参考（references 放多张图），Key 按部门从 department_configs 读取。
// 独立脚本，不改 server/，不经过画布。会真实扣部门额度。
//
// 用法：
//   npx tsx --env-file=.env scripts/poster_video_probe.ts --poster <海报路径或URL> --details "宽厚扶手,分段靠背,侧背拉链,低脚承托" \
//     [--dept 研发中心] [--model sd-2.5] [--duration 15] [--resolution 1080p] [--out <目录>] [--dry-run]
//   --dry-run：只裁细节图、写出请求和提示词，不上传、不调用、不扣费。
//   --models：只列出该部门令牌可用的视频模型（免费）。
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { supabaseAdmin } from '../src/lib/supabase';
import { detailStripGeometry, TEMPLATE_A_SIZE, TEMPLATE_A_HERO_RATIO } from '../server/services/posterTemplate/templateA';
import { NormBox } from '../server/services/posterTemplate/detailCrop';
import { buildPosterFilmPrompt, cropFilmDetails } from '../server/services/posterTemplate/posterFilm';
import { buildMultiReferenceRequest } from '../server/services/video/providers/vectorEngineAdapter';

const BUCKET = 'creative-canvas-assets';
const POLL_MS = 10000;
const TIMEOUT_MS = 20 * 60 * 1000;
const SUCCEEDED = new Set(['succeeded', 'success', 'completed', 'done']);
const FAILED = new Set(['failed', 'failure', 'error', 'cancelled', 'expired']);

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const log = (...a: any[]) => console.log(`[${new Date().toLocaleTimeString()}]`, ...a);

async function deptConfig(deptName: string): Promise<{ apiKey: string; baseUrl: string }> {
  const { data, error } = await supabaseAdmin
    .from('department_configs')
    .select('dept_name, api_key, api_base_url')
    .eq('dept_name', deptName)
    .maybeSingle();
  if (error) throw new Error(`读取部门配置失败: ${error.message}`);
  if (!data?.api_key) throw new Error(`部门「${deptName}」没有配置 api_key`);
  return { apiKey: data.api_key, baseUrl: String(data.api_base_url || 'https://api.tiantoken.com').replace(/\/v1(beta)?\/?$/, '').replace(/\/+$/, '') };
}

async function loadImage(src: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`下载失败 ${res.status}: ${src}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return fs.readFileSync(src);
}

/** 按模板 A 细节栏几何，从成品海报里切出每个细节格的图片（向内收 3% 避开描边） */
async function cropDetailCells(poster: Buffer, count: number): Promise<Buffer[]> {
  const meta = await sharp(poster).metadata();
  const W = meta.width!, H = meta.height!;
  const k = W / TEMPLATE_A_SIZE.width;
  const g = detailStripGeometry(count, 1);
  const stripTop = Math.round(TEMPLATE_A_SIZE.height * TEMPLATE_A_HERO_RATIO);
  // 每格等宽，图片贴格子左上（innerPad 内缩）；上图下文与图左文右的图片起点一致
  const cellW = (TEMPLATE_A_SIZE.width - g.padX * 2) / g.n;
  const out: Buffer[] = [];
  for (let i = 0; i < g.n; i++) {
    const x = g.padX + i * cellW + g.innerPad;
    const y = stripTop + g.padY;
    const inset = 0.03;
    const left = Math.round((x + g.imgW * inset) * k);
    const top = Math.round((y + g.imgH * inset) * k);
    const width = Math.min(W - left, Math.round(g.imgW * (1 - inset * 2) * k));
    const height = Math.min(H - top, Math.round(g.imgH * (1 - inset * 2) * k));
    // 海报里的细节格只有两百多像素，sd-2.5 参考图要求 ≥ 9 万像素，放大到短边 640
    const scale = 640 / Math.min(width, height);
    out.push(await sharp(poster).extract({ left, top, width, height })
      .resize(Math.round(width * Math.max(1, scale)), Math.round(height * Math.max(1, scale)), { kernel: 'lanczos3' })
      .jpeg({ quality: 92 }).toBuffer());
  }
  return out;
}

/** 从画布里的模板 A 海报节点读取：不带字的主场景原图 + 细节框（与海报细节格同一套取景） */
async function loadPosterNode(canvasId: string, nodeId: string): Promise<{ hero: Buffer; boxes: NormBox[]; titles: string[]; name: string }> {
  const { data, error } = await supabaseAdmin.from('creative_canvases').select('nodes_draft').eq('id', canvasId).single();
  if (error) throw new Error(`读取画布失败: ${error.message}`);
  const node = ((data as any).nodes_draft || []).find((n: any) => n.id === nodeId);
  const heroUrl = node?.data?.heroImageUrl;
  if (!heroUrl) throw new Error(`节点 ${nodeId} 没有 heroImageUrl`);
  const tp = node.data.templatePoster || {};
  const boxes = (tp.details || []).map((d: any) => d.box).filter(Boolean);
  const titles = (tp.concept?.details || []).map((d: any) => String(d?.title || ''));
  return { hero: await loadImage(heroUrl), boxes, titles, name: String(tp.concept?.name || '') };
}

/** 上传到 Supabase 公共桶拿公网 URL（网关的 references 只收公网 URL）；网络常 ECONNRESET，重试 3 次 */
async function uploadPublic(buf: Buffer, objectPath: string): Promise<string> {
  let lastErr = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { error } = await supabaseAdmin.storage.from(BUCKET).upload(objectPath, buf, { contentType: 'image/jpeg', upsert: true });
      if (!error) return supabaseAdmin.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
      lastErr = error.message;
    } catch (e: any) {
      lastErr = e?.message || String(e);
    }
    log(`上传重试 ${attempt}/3: ${lastErr}`);
  }
  throw new Error(`上传失败: ${lastErr}`);
}

function buildPrompt(details: string[], duration: number, fromHero: boolean): string {
  const detailLines = details.map((d, i) => `图${i + 2}是「${d}」`).join('，');
  return [
    `根据参考图创作一段 ${duration} 秒的横屏 16:9 沙发产品广告片，环境 + 产品细节的展示方式。`,
    fromHero
      ? `图1是这款沙发的主场景照片：以它的场景、时段、光线、沙发、人物和道具作为整部片子的世界。`
      : `图1是这款沙发的企划海报：以海报主画面的场景、时段、光线、沙发、人物和道具作为整部片子的世界。`,
    details.length ? `其余参考图是同一张沙发的细节特写，只用来参考部件的造型和材质：${detailLines}。` : '',
    `所有特写镜头都发生在图1的同一个场景里，背景是同一片海边露台、同样的夕阳光线（虚化即可），不要出现白墙、室内或其他背景。`,
    `镜头结构：开场是整体场景的全景，镜头缓慢推近；然后按图2起的顺序，每个细节一个浅景深特写，运镜轻柔缓慢；接着中景，人物在沙发上放松，脚托缓缓展开；最后回到整体场景的全景收尾。`,
    `每个镜头的光线、色调和环境保持连续一致。沙发的造型、比例、皮面、颜色、缝线和部件与参考图完全一致，不要凭空添加新的沙发脚、底座或五金件。`,
    `画面中绝对不要出现任何文字：不要标题、字幕、标签、logo、水印；海报上印的中文文字不要出现在视频里。`
  ].filter(Boolean).join('');
}

function extractVideoUrl(r: any): string | undefined {
  if (!r || typeof r !== 'object') return undefined;
  const outputs = Array.isArray(r.outputs) ? r.outputs : [];
  return r.metadata?.url || r.video?.url || outputs.find((o: any) => o?.url)?.url || r.content?.video_url
    || r.output?.video_url || r.result?.video_url || r.result_url || r.video_url
    || (Array.isArray(r.videos) ? r.videos[0]?.url : undefined) || (r.data ? extractVideoUrl(r.data) : undefined);
}

async function main() {
  const deptName = arg('dept', '研发中心')!;
  const model = arg('model', 'sd-2.5')!;
  const { apiKey, baseUrl } = await deptConfig(deptName);
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  log(`部门 ${deptName}，key=***${apiKey.slice(-4)}，${baseUrl}`);

  if (flag('models')) {
    const res = await fetch(`${baseUrl}/v1/models`, { headers, signal: AbortSignal.timeout(20000) });
    const ids: string[] = ((await res.json().catch(() => ({}))).data || []).map((m: any) => String(m.id));
    log(`/v1/models ${res.status}，视频相关:`, ids.filter(id => /video|sd-|seedance|wan|kling|omni|veo|minimax|hailuo|grok-imagine/i.test(id)).sort().join(', '));
    return;
  }

  const posterSrc = arg('poster');
  if (!posterSrc && !arg('node')) throw new Error('缺少 --poster 或 --node');
  const details = (arg('details', '') || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
  const duration = Number(arg('duration', '15'));
  const resolution = arg('resolution', '1080p')!;
  const runId = `probe-${Date.now()}`;
  const outDir = path.resolve(arg('out', path.join('tmp', runId))!);
  fs.mkdirSync(outDir, { recursive: true });

  // --node <画布ID>:<节点ID>：用节点里不带字的主场景原图 + 细节框裁高清特写；否则从成品海报抠细节格
  const nodeRef = arg('node');
  let productName = '';
  let mainJpg: Buffer;
  let crops: Buffer[];
  if (nodeRef) {
    const [canvasId, nodeId] = nodeRef.split(':');
    const { hero, boxes, titles, name } = await loadPosterNode(canvasId, nodeId);
    if (!details.length) details.push(...titles.slice(0, boxes.length));
    productName = productName || name;
    mainJpg = await sharp(hero).rotate().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    // 与画布“生成成片”同一套裁切
    crops = await cropFilmDetails(hero, boxes.slice(0, details.length || boxes.length));
  } else {
    const poster = await loadImage(posterSrc!);
    mainJpg = await sharp(poster).rotate().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    crops = details.length ? await cropDetailCells(poster, details.length) : [];
  }
  fs.writeFileSync(path.join(outDir, 'ref-1-main.jpg'), mainJpg);
  crops.forEach((c, i) => fs.writeFileSync(path.join(outDir, `ref-${i + 2}-detail.jpg`), c));

  // --node 时与画布“生成成片”同一套提示词；--person 填主场景里的人物描述，不填 = 没有人物
  const prompt = nodeRef
    ? buildPosterFilmPrompt(details, duration, { productName, person: arg('person', '') })
    : buildPrompt(details, duration, false);
  log(`参考图 ${1 + crops.length} 张，${model}，${duration}s，${resolution}`);
  log(`提示词:\n${prompt}`);
  if (flag('dry-run')) {
    log('dry-run：未上传、未调用。输出目录', outDir);
    return;
  }

  const images = [mainJpg, ...crops];
  const urls: string[] = [];
  for (let i = 0; i < images.length; i++) {
    urls.push(await uploadPublic(images[i], `video-probe/${runId}/ref-${i + 1}.jpg`));
    log(`已上传 ref-${i + 1}`);
  }

  // 与画布“生成成片”同一个请求体（不带 output_format：sd-2.0 不认，只有 sd-2.5 支持）
  const body = buildMultiReferenceRequest(
    model,
    { modelKey: model, prompt, referenceMode: 'multi_reference', settings: { durationSeconds: duration, resolution, ratio: '16:9', audioMode: 'native' } as any },
    urls
  ).body;
  fs.writeFileSync(path.join(outDir, 'request.json'), JSON.stringify(body, null, 2));

  const started = Date.now();
  const submit = await fetch(`${baseUrl}/v1/video/generations`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const submitText = await submit.text();
  fs.writeFileSync(path.join(outDir, 'submit.json'), submitText);
  if (!submit.ok) throw new Error(`提交失败 ${submit.status}: ${submitText.slice(0, 800)}`);
  const sj = JSON.parse(submitText);
  const taskId = sj.task_id || sj.id || sj.data?.task_id || sj.data?.id;
  if (!taskId) throw new Error(`没有任务 ID: ${submitText.slice(0, 500)}`);
  log(`已提交 task_id=${taskId}`);

  let record: any;
  while (true) {
    if (Date.now() - started > TIMEOUT_MS) throw new Error(`等待超时，任务可能仍在跑：${taskId}`);
    await new Promise(r => setTimeout(r, POLL_MS));
    try {
      const res = await fetch(`${baseUrl}/v1/videos/${encodeURIComponent(taskId)}`, { headers, signal: AbortSignal.timeout(30000) });
      record = await res.json().catch(() => ({}));
    } catch (e: any) {
      log(`查询出错（继续轮询）: ${e?.message}`);
      continue;
    }
    const status = String(record.status || record.data?.status || record.state || '').toLowerCase();
    log(`${Math.round((Date.now() - started) / 1000)}s ${status} ${record.progress ?? record.data?.progress ?? ''}`);
    if (SUCCEEDED.has(status) || (!status && extractVideoUrl(record))) break;
    if (FAILED.has(status)) throw new Error(`生成失败: ${JSON.stringify(record).slice(0, 800)}`);
  }
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(record, null, 2));
  let videoUrl = extractVideoUrl(record);
  if (!videoUrl) {
    // 部分网关成功后要从 /content 下载
    videoUrl = `${baseUrl}/v1/videos/${encodeURIComponent(taskId)}/content`;
  }
  const vres = await fetch(videoUrl, { headers: videoUrl.startsWith(baseUrl) ? headers : {}, signal: AbortSignal.timeout(180000) });
  if (!vres.ok) throw new Error(`下载视频失败 ${vres.status}: ${videoUrl}`);
  const videoPath = path.join(outDir, 'video.mp4');
  fs.writeFileSync(videoPath, Buffer.from(await vres.arrayBuffer()));
  log(`完成，用时 ${Math.round((Date.now() - started) / 1000)}s，视频: ${videoPath}`);
}

main().then(() => process.exit(0)).catch(err => {
  console.error('失败:', err?.message || err);
  process.exit(1);
});
