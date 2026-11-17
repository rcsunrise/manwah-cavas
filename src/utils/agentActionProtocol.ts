// 智能体动作协议：模型在回复末尾附加 <agent_actions>{...}</agent_actions>，前端解析为追问 / 计划 / 下一步卡片。
// 模型不直接执行任何操作；计划卡需用户确认后，由前端调用已有的画布能力执行。
import {
  AgentActionId,
  AgentActionOption,
  AgentActionParams,
  AgentClarifyCard,
  AgentMessage,
  AgentPlanCard,
  AgentVideoNodeRef
} from '../types/creativeCanvas';

/**
 * 收集画布上已生成的视频（最新在前，最多 5 条）：视频成果节点优先，其次是已出片的视频生成节点。
 * 发给智能体后，用户问视频效果时服务端会据此抽帧给模型看。
 */
export function collectVideoNodeRefs(nodes: any[]): AgentVideoNodeRef[] {
  const refs: (AgentVideoNodeRef & { at: number; order: number })[] = [];
  const seenJobs = new Set<string>();
  const ordered = [
    ...nodes.filter(n => n?.type === 'videoResultNode'),
    ...nodes.filter(n => n?.type === 'videoGenerationNode')
  ];
  for (const n of ordered) {
    const d = n.data || {};
    const job = d.job || {};
    const videoUrl = d.videoUrl || job.videoUrl || job.supabaseVideoUrl || undefined;
    const assetVersionId = d.assetVersionId || job.assetVersionId || undefined;
    const ready = Boolean(videoUrl) || job.status === 'ready' || n.type === 'videoResultNode';
    if (!ready || (!videoUrl && !assetVersionId)) continue;
    // 同一个任务既有生成节点又有成果节点时只保留一条
    const jobKey = job.id || assetVersionId || n.id;
    if (seenJobs.has(jobKey)) continue;
    seenJobs.add(jobKey);
    refs.push({
      at: Date.parse(job.readyAt || job.updatedAt || job.createdAt || '') || 0,
      order: refs.length,
      nodeId: n.id,
      jobId: job.id || undefined,
      title: d.title || (job.shotId ? `${job.shotId} 视频` : '视频'),
      videoUrl: typeof videoUrl === 'string' && !videoUrl.startsWith('blob:') ? videoUrl : undefined,
      assetVersionId,
      prompt: typeof job.prompt === 'string' ? job.prompt.slice(0, 600) : undefined,
      modelKey: d.modelKey || job.modelKey,
      durationSeconds: d.durationSeconds || job.videoSettings?.durationSeconds,
      resolution: job.videoSettings?.resolution
    });
  }
  // 按任务完成时间倒序（最新在前）；没有时间的按节点添加顺序，越后越新
  return refs
    .sort((a, b) => (b.at - a.at) || (b.order - a.order))
    .slice(0, 5)
    .map(({ at: _at, order: _order, ...ref }) => ref);
}

const OPEN_TAG = '<agent_actions>';
const CLOSE_TAG = '</agent_actions>';

const ACTION_IDS: AgentActionId[] = [
  'upload_product',
  'generate_plan',
  'render_all',
  'search_market',
  'open_video',
  'open_poster',
  'template_poster',
  'goto_setup',
  'goto_render',
  'replan_screen',
  'render_screen',
  'edit_image_text',
  'set_product_image',
  'edit_image',
  'stitch_video',
  'fabric_poster',
  'fabric_edit',
  'textile_poster',
  'textile_edit'
];

const PLAN_TITLES: Partial<Record<AgentActionId, string>> = {
  generate_plan: '生成详情页企划',
  replan_screen: '重新策划分镜',
  render_all: '批量渲染分镜',
  render_screen: '渲染单屏分镜',
  edit_image_text: '修改图中文字',
  search_market: '联网检索竞品',
  open_video: '生成视频分镜',
  set_product_image: '设为产品主图并提取 DNA',
  edit_image: '修改海报画面',
  open_poster: '打开全案海报',
  template_poster: '生成4/3 产品海报',
  stitch_video: '拼接成片',
  fabric_poster: '生成氛围海报',
  fabric_edit: '修改氛围海报',
  textile_poster: '生成面料色卡海报',
  textile_edit: '修改面料色卡海报'
};

/** 面料色卡海报的三种版式：对话里用户说的是“斜切/六边形/圆形”，内部是 slant/hex/circle */
export const TEXTILE_LAYOUT_LABELS: Record<'slant' | 'hex' | 'circle', string> = {
  slant: '斜切版（右侧大面料被斜线切开，左下 2×3 色卡）',
  hex: '六边形版（右侧大面料六边形加白描边，右下一排色卡）',
  circle: '圆形版（左侧大圆形面料，右下圆形色卡）'
};

/** 去掉动作块（含流式输出中尚未闭合的部分），得到给用户看的正文 */
export function stripAgentActions(text: string): string {
  const start = text.indexOf(OPEN_TAG);
  if (start >= 0) return text.slice(0, start).trimEnd();
  // 流式输出时标签可能只吐出了一半，如 "<agent_ac"
  for (let len = OPEN_TAG.length - 1; len > 0; len--) {
    if (text.endsWith(OPEN_TAG.slice(0, len))) return text.slice(0, -len).trimEnd();
  }
  return text;
}

function isActionId(value: unknown): value is AgentActionId {
  return typeof value === 'string' && (ACTION_IDS as string[]).includes(value);
}

function normalizeParams(raw: any): AgentActionParams | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const params: AgentActionParams = {};
  if (raw.stitchTransition === 'cut' || raw.stitchTransition === 'fade') params.stitchTransition = raw.stitchTransition;
  if (raw.fabricLayout === 'collage4' || raw.fabricLayout === 'hero3') params.fabricLayout = raw.fabricLayout;
  // 空字符串有意义：表示“不要这个编号”，要保留
  if (typeof raw.fabricCode === 'string') params.fabricCode = raw.fabricCode.trim().slice(0, 24);
  if (typeof raw.fabricLabel === 'string') params.fabricLabel = raw.fabricLabel.trim().slice(0, 24);
  if (typeof raw.fabricPillow === 'string' && raw.fabricPillow.trim()) params.fabricPillow = raw.fabricPillow.trim().slice(0, 120);
  if (raw.fabricNoPillow === true) params.fabricNoPillow = true;
  const pillowScale = Number(raw.fabricPillowScale);
  if (Number.isFinite(pillowScale) && pillowScale >= 0.5 && pillowScale <= 1.8) params.fabricPillowScale = Math.round(pillowScale * 100) / 100;
  if (Array.isArray(raw.fabricMoods)) {
    const moods = raw.fabricMoods
      .map((m: any) => ({ slot: Number(m?.slot), prompt: typeof m?.prompt === 'string' ? m.prompt.trim().slice(0, 200) : '' }))
      .filter((m: { slot: number; prompt: string }) => Number.isInteger(m.slot) && m.slot >= 1 && m.slot <= 4 && m.prompt)
      .slice(0, 4);
    if (moods.length) params.fabricMoods = moods;
  }
  if (raw.textileLayout === 'slant' || raw.textileLayout === 'hex' || raw.textileLayout === 'circle') params.textileLayout = raw.textileLayout;
  const mv = Number(raw.textileMoodVariant);
  if (raw.textileMoodVariant !== undefined && raw.textileMoodVariant !== null && Number.isInteger(mv) && mv >= 0 && mv <= 99) params.textileMoodVariant = mv;
  if (raw.textileMoodVariation === true) params.textileMoodVariation = true;
  if (raw.textileMoodStyle === 'cutout' || raw.textileMoodStyle === 'collage') params.textileMoodStyle = raw.textileMoodStyle;
  if (raw.textileCutoutAi === true) params.textileCutoutAi = true;
  if (typeof raw.textileMain === 'string' && raw.textileMain.trim()) params.textileMain = raw.textileMain.trim().slice(0, 120);
  if (typeof raw.textileMainColor === 'string' && raw.textileMainColor.trim()) params.textileMainColor = raw.textileMainColor.trim().slice(0, 12);
  if (Array.isArray(raw.textileSwatches)) {
    const list = raw.textileSwatches.map((s: any) => String(s || '').trim().slice(0, 120)).filter(Boolean).slice(0, 5);
    if (list.length) params.textileSwatches = list;
  }
  const swatchCount = Number(raw.textileSwatchCount);
  if (Number.isInteger(swatchCount) && swatchCount >= 2 && swatchCount <= 6) params.textileSwatchCount = swatchCount;
  if (typeof raw.textileName === 'string' && raw.textileName.trim()) params.textileName = raw.textileName.trim().slice(0, 8);
  if (typeof raw.textileDesc === 'string' && raw.textileDesc.trim()) params.textileDesc = raw.textileDesc.trim().slice(0, 160);
  // 型号空字符串有意义：表示“不显示型号”
  if (typeof raw.textileCode === 'string') params.textileCode = raw.textileCode.trim().slice(0, 24);
  if (typeof raw.textileBg === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.textileBg.trim())) params.textileBg = raw.textileBg.trim().toUpperCase();
  const moodCount = Number(raw.textileMoods);
  if (raw.textileMoods !== undefined && raw.textileMoods !== null && Number.isInteger(moodCount) && moodCount >= 0 && moodCount <= 4) params.textileMoods = moodCount;
  if (Array.isArray(raw.textileMoodUrls)) {
    const urls = raw.textileMoodUrls
      .map((u: any) => String(u || '').trim())
      .filter((u: string) => /^(https:\/\/|\/api\/canvases\/assets\/)/.test(u))
      .map((u: string) => u.slice(0, 2000))
      .slice(0, 4);
    if (urls.length) params.textileMoodUrls = urls;
  }
  const screenCount = Number(raw.screenCount);
  if (Number.isInteger(screenCount) && screenCount >= 1 && screenCount <= 12) params.screenCount = screenCount;
  if (typeof raw.aspectRatio === 'string' && /^\d+:\d+$/.test(raw.aspectRatio)) params.aspectRatio = raw.aspectRatio;
  const screenIndex = Number(raw.screenIndex);
  if (Number.isInteger(screenIndex) && screenIndex >= 1) params.screenIndex = screenIndex;
  if (typeof raw.hint === 'string' && raw.hint.trim()) params.hint = raw.hint.trim().slice(0, 300);
  if (typeof raw.keywords === 'string' && raw.keywords.trim()) params.keywords = raw.keywords.trim().slice(0, 100);
  if (typeof raw.newText === 'string' && raw.newText.trim()) params.newText = raw.newText.trim().slice(0, 60);
  if (typeof raw.oldText === 'string' && raw.oldText.trim()) params.oldText = raw.oldText.trim().slice(0, 60);
  if (typeof raw.nodeId === 'string' && raw.nodeId.trim()) params.nodeId = raw.nodeId.trim().slice(0, 120);
  if (typeof raw.imageUrl === 'string' && /^(https:\/\/|\/api\/canvases\/assets\/)/.test(raw.imageUrl.trim())) params.imageUrl = raw.imageUrl.trim().slice(0, 2000);
  if (typeof raw.instruction === 'string' && raw.instruction.trim()) params.instruction = raw.instruction.trim().slice(0, 300);
  if (typeof raw.videoBrief === 'string' && raw.videoBrief.trim()) params.videoBrief = raw.videoBrief.trim().slice(0, 800);
  if (Array.isArray(raw.focusPoints)) {
    const points = raw.focusPoints.map((p: any) => String(p || '').trim()).filter((p: string) => p.length >= 2 && p.length <= 20).slice(0, 6);
    if (points.length > 0) params.focusPoints = points;
  }
  if (raw.videoMode === 'product_showcase' || raw.videoMode === 'generate_video') params.videoMode = raw.videoMode;
  if (raw.videoStyle === 'smart_mix' || raw.videoStyle === 'single_take' || raw.videoStyle === 'outline') params.videoStyle = raw.videoStyle;
  if (Array.isArray(raw.videoShots)) {
    const shots = raw.videoShots
      .map((s: any) => {
        const title = String(s?.title || '').trim().slice(0, 30);
        const content = String(s?.content || '').trim().slice(0, 200);
        const duration = Math.round(Number(s?.durationSeconds));
        const camera = String(s?.camera || '').trim().slice(0, 60);
        if (!title || !content || !Number.isFinite(duration) || duration < 2 || duration > 15) return null;
        return { title, content, durationSeconds: duration, ...(camera ? { camera } : {}) };
      })
      .filter(Boolean)
      .slice(0, 8);
    if (shots.length > 0) {
      params.videoShots = shots;
      // 给了镜头清单就是按构思分镜
      if (params.videoStyle !== 'single_take') params.videoStyle = 'outline';
    }
  }
  if (typeof raw.videoRatio === 'string' && /^(16:9|9:16|1:1|4:3|3:4)$/.test(raw.videoRatio.trim())) params.videoRatio = raw.videoRatio.trim();
  if (typeof raw.referenceImageUrl === 'string' && /^(https:\/\/|\/api\/canvases\/assets\/)/.test(raw.referenceImageUrl.trim())) {
    params.referenceImageUrl = raw.referenceImageUrl.trim().slice(0, 2000);
  }
  return Object.keys(params).length > 0 ? params : undefined;
}

function normalizeOption(raw: any): AgentActionOption | null {
  if (!raw || typeof raw.label !== 'string' || !raw.label.trim()) return null;
  const option: AgentActionOption = { label: raw.label.trim().slice(0, 30) };
  if (isActionId(raw.actionId)) {
    option.actionId = raw.actionId;
    option.params = normalizeParams(raw.params);
  } else if (typeof raw.prompt === 'string' && raw.prompt.trim()) {
    option.prompt = raw.prompt.trim();
  } else {
    // 既不是动作也没有可发送的话术，点了没反应，丢弃
    return null;
  }
  return option;
}

/** 计划卡里展示给用户确认的参数行 */
export function describePlanParams(actionId: AgentActionId, params?: AgentActionParams): AgentPlanCard['items'] {
  const items: AgentPlanCard['items'] = [];
  if (params?.screenIndex) items.push({ label: '分镜', value: `第 ${params.screenIndex} 屏` });
  if (params?.screenCount) items.push({ label: '屏数', value: `${params.screenCount} 屏` });
  if (params?.aspectRatio) items.push({ label: '画面比例', value: params.aspectRatio });
  if (params?.keywords) items.push({ label: '关键词', value: params.keywords });
  if (params?.oldText) items.push({ label: '原文', value: `「${params.oldText}」` });
  if (params?.newText) items.push({ label: '改为', value: `「${params.newText}」` });
  if (params?.hint) items.push({ label: '要求', value: params.hint });
  if (params?.videoBrief) items.push({ label: '视频创意', value: params.videoBrief });
  if (params?.focusPoints?.length) items.push({ label: '展示重点', value: params.focusPoints.join('、') });
  if (params?.videoShots?.length) {
    const total = params.videoShots.reduce((acc, s) => acc + s.durationSeconds, 0);
    items.push({ label: '分镜', value: `${params.videoShots.length} 个镜头，共约 ${total} 秒` });
    params.videoShots.forEach((s, i) => {
      items.push({ label: `镜头${i + 1} · ${s.durationSeconds}s`, value: `${s.title}：${s.camera ? `${s.camera}，` : ''}${s.content}` });
    });
  }
  if (params?.videoRatio) items.push({ label: '画面比例', value: params.videoRatio });
  if (actionId === 'fabric_poster') {
    items.push({ label: '版式', value: params?.fabricLayout === 'hero3' ? '1 张大竖图 + 2 张小图（参考图 2）' : '4 张氛围照拼贴（参考图 1）' });
    if (params?.fabricCode) items.push({ label: '型号', value: params.fabricCode });
    if (params?.fabricLabel) items.push({ label: '色卡编号', value: params.fabricLabel });
    items.push({ label: '出图', value: '沙发改白底 1 张 + 抱枕 1 张 + 氛围照 3~4 张，共 5~6 张，每张约 3000 点，约 3~6 分钟' });
    items.push({ label: '排版', value: '圆形细节、面料色卡取自你的沙发图，文字用真实字体' });
  }
  if (actionId === 'fabric_edit') {
    if (params?.fabricLayout) items.push({ label: '换版式', value: params.fabricLayout === 'hero3' ? '1 张大竖图 + 2 张小图（参考图 2）' : '4 张氛围照拼贴（参考图 1）' });
    if (params?.fabricPillow) items.push({ label: '抱枕', value: `重出：${params.fabricPillow}` });
    if (params?.fabricNoPillow) items.push({ label: '抱枕', value: '去掉抱枕' });
    if (params?.fabricPillowScale) items.push({ label: '抱枕大小', value: `${params.fabricPillowScale} 倍（1 为基准，默认 0.8）` });
    (params?.fabricMoods || []).forEach(m => items.push({ label: `第 ${m.slot} 格氛围图`, value: `重出：${m.prompt}` }));
    if (params?.fabricCode !== undefined) items.push({ label: '型号', value: params.fabricCode || '不显示' });
    if (params?.fabricLabel !== undefined) items.push({ label: '色卡编号', value: params.fabricLabel || '不显示' });
    const regen = (params?.fabricPillow ? 1 : 0) + (params?.fabricMoods?.length || 0);
    items.push({
      label: '出图',
      value: regen ? `重出 ${regen} 张（每张约 3000 点），其余沿用已有素材重新排版` : '不重新出图，沿用已有素材重新排版，不扣点'
    });
    items.push({ label: '结果', value: '作为新版本节点加入画布，旧版保留' });
  }
  if (actionId === 'textile_poster' || actionId === 'textile_edit') {
    const edit = actionId === 'textile_edit';
    if (params?.textileLayout) items.push({ label: edit ? '换版式' : '版式', value: TEXTILE_LAYOUT_LABELS[params.textileLayout] });
    else if (!edit) items.push({ label: '版式', value: '斜切版（可随时在对话里换成六边形版、圆形版）' });
    if (params?.textileMoodVariant !== undefined) items.push({ label: '氛围图排布', value: '换一种拼贴组合（只重新排版）' });
    if (params?.textileMoodStyle === 'cutout') items.push({ label: '氛围图风格', value: params.textileCutoutAi ? '人物抠图加白边压在拼贴上：AI 新出 1 张白底全身人物再抠图，约 3000 点' : '人物抠图加白边压在拼贴上：从现有氛围图里抠人物，不扣点（背景太杂会抠不出来）' });
    else if (params?.textileMoodStyle === 'collage') items.push({ label: '氛围图风格', value: '恢复普通拼贴' });
    if (params?.textileMain) items.push({ label: '主面料', value: params.textileMain });
    else if (params?.textileMainColor) items.push({ label: '主面料', value: `文件夹里最接近「${params.textileMainColor}」的一款` });
    if (params?.textileSwatches?.length) items.push({ label: '配色面料', value: params.textileSwatches.join('、') });
    else if (!edit) items.push({ label: '配色面料', value: '按主色从同一文件夹自动挑选（颜色拉开、彼此协调）' });
    if (params?.textileSwatchCount) items.push({ label: '色卡数量', value: `${params.textileSwatchCount} 块（含主面料）` });
    if (params?.textileName) items.push({ label: '面料名', value: params.textileName });
    if (params?.textileDesc) items.push({ label: '说明', value: params.textileDesc });
    if (params?.textileCode !== undefined) items.push({ label: '型号', value: params.textileCode || '不显示' });
    if (params?.textileBg) items.push({ label: '底色', value: params.textileBg });
    // 生成时默认 AI 出 3 张氛围图（参考图左侧那块时装/生活方式拼贴）；修改时只有点名才重出
    const moodCount = params?.textileMoodUrls?.length ? 0 : params?.textileMoods ?? (edit ? 0 : 3);
    if (params?.textileMoodUrls?.length) items.push({ label: '氛围图', value: `用你发的 ${params.textileMoodUrls.length} 张图拼贴，不扣点` });
    else if (moodCount > 0) items.push({ label: '氛围图', value: `AI 生成 ${moodCount} 张（时装大片、软装静物、氛围静物），每张约 3000 点，约 2~5 分钟` });
    else if (!edit) items.push({ label: '氛围图', value: '不生成，左侧用面料特写代替' });
    items.push({
      label: edit ? '出图' : '方式',
      value: moodCount > 0
        ? `氛围图共约 ${moodCount * 3000} 点；面料取自你的本地素材、文字用真实字体`
        : '面料取自你的本地素材、文字用真实字体，不出图、不扣点，约 10~30 秒'
    });
    if (edit) items.push({ label: '结果', value: '作为新版本节点加入画布，旧版保留' });
  }
  if (actionId === 'stitch_video') {
    items.push({ label: '镜头', value: '画布上每个镜头序号取最新一条已完成的视频，按序号顺序拼接' });
    items.push({ label: '转场', value: params?.stitchTransition === 'cut' ? '硬切' : '淡入淡出' });
    items.push({ label: '方式', value: '本地 ffmpeg 合成，不消耗生成点数，约 20 秒~2 分钟' });
  }
  if (params?.referenceImageUrl) items.push({ label: '参考图', value: '使用对话里发的图片' });
  if (params?.instruction) items.push({ label: '修改要求', value: params.instruction });
  if (actionId === 'edit_image') items.push({ label: '方式', value: '在原图上按要求修改，产品造型与材质保持不变，结果作为新版本节点' });
  if (actionId === 'set_product_image') items.push({ label: '执行后', value: '替换画布上的产品主图，并重新提取造型、材质与色彩 DNA' });
  if (actionId === 'open_video') {
    items.push({
      label: '方式',
      value: params?.videoMode === 'generate_video'
        ? '直接生成单条视频'
        : params?.videoStyle === 'single_take'
        ? 'AI 导演规划 · 一镜到底'
        : params?.videoStyle === 'outline'
        ? '按构思分镜 · 镜头数与时长照上面执行，自动匹配视频模型'
        : 'AI 导演规划 · 多镜头分镜'
    });
    if (params?.videoBrief || params?.videoShots?.length) {
      items.push({
        label: '执行后',
        value: params.videoMode === 'generate_video'
          ? '创意填入视频面板，可再调整后生成视频'
          : '创意填入视频面板，AI 导演按分镜补全提示词，可一键生成全部镜头'
      });
    }
  }
  if (items.length === 0 && actionId === 'render_all') items.push({ label: '范围', value: '全部未渲染的分镜' });
  if (actionId === 'generate_plan') items.push({ label: '其他', value: '未提及的参数沿用企划配置' });
  return items;
}

/**
 * 画布状态摘要：让智能体知道 DNA 是否就绪、企划有哪些屏、用户引用了什么，
 * 从而判断能提出哪些动作、屏号是否存在。只给事实，不含任何 ID 以外的内部数据。
 */
export function buildCanvasSummary(input: {
  dna?: { category?: string; primaryColor?: string; materials?: string[] } | null;
  /** DNA 已就绪（可能只有画布 DNA 节点而没有加载完整 DNA 数据） */
  dnaReady?: boolean;
  plan?: { screens?: Array<{ screenIndex: number; screenTitle?: string }> } | null;
  planSettings: { screenCount?: number; aspectRatio?: string; model?: string };
  nodes: any[];
  mentionedNodeIds?: string[];
  selectedSceneIndex?: number | null;
  /** 已授权的本地素材文件夹（让智能体知道有哪些面料文件可以指定） */
  localFolder?: { dirName: string; imageCount: number; names: string[] } | null;
}): string {
  const lines: string[] = [];
  const { dna, dnaReady, plan, planSettings, nodes, mentionedNodeIds, selectedSceneIndex, localFolder } = input;

  if (dna) {
    const materials = Array.isArray(dna.materials) && dna.materials.length > 0 ? `，材质 ${dna.materials.slice(0, 3).join('/')}` : '';
    lines.push(`- 产品 DNA：已提取（品类 ${dna.category || '未知'}，主色 ${dna.primaryColor || '未知'}${materials}）`);
  } else if (dnaReady) {
    lines.push('- 产品 DNA：已提取');
  } else {
    const hasProductImage = nodes.some(n => n?.type === 'productImageNode');
    lines.push(`- 产品 DNA：未提取（${hasProductImage ? '画布上已有产品主图，可在企划配置中分析' : '画布上还没有产品主图'}）`);
  }

  const fabrics = nodes.filter(n => n?.data?.templatePoster?.template === 'B').slice(-4);
  if (fabrics.length > 0) {
    const desc = fabrics.map(n => {
      const tp = n.data.templatePoster;
      const slots = (tp.layout === 'hero3' ? [0, 2, 3] : [0, 1, 2, 3]).map((idx: number, k: number) => {
        const key = tp.concept?.moodShots?.[idx]?.key;
        const tag = key === 'tall' ? tp.concept?.tags?.portrait?.label : key === 'ambient' ? tp.concept?.tags?.scene?.label : key === 'street' ? tp.concept?.tags?.street?.label : '';
        return `第${k + 1}格${key === 'tall' ? '大人像' : key === 'closeup' ? '人像特写' : key === 'ambient' ? '场景图' : '街拍'}${tag ? `(${tag})` : ''}`;
      });
      return `${n.id}（版式${tp.layout === 'hero3' ? '2' : '1'}；${slots.join('、')}；${tp.assets?.pillow ? '有抱枕' : '无抱枕'}；型号${tp.code || '无'}）`;
    });
    lines.push(`- 画布上的氛围海报（可用 fabric_edit 修改，nodeId 用前面的 id）：${desc.join('；')}`);
  }

  if (localFolder && localFolder.imageCount > 0) {
    const more = localFolder.imageCount > localFolder.names.length ? `……共 ${localFolder.imageCount} 张` : '';
    lines.push(`- 已授权本地素材文件夹「${localFolder.dirName}」：${localFolder.imageCount} 张图片，文件名如 ${localFolder.names.join('、')}${more}（可用 textile_poster 以其中一款为主色做面料色卡海报，textileMain 填文件名）`);
  }
  const textiles = nodes.filter(n => n?.data?.templatePoster?.template === 'C').slice(-4);
  if (textiles.length > 0) {
    const desc = textiles.map(n => {
      const tp = n.data.templatePoster;
      return `${n.id}（${tp.layout === 'hex' ? '六边形版' : tp.layout === 'circle' ? '圆形版' : '斜切版'}；主面料 ${tp.mainName || '未知'}；${(tp.swatchNames?.length || 0) + 1} 块色卡；名称「${tp.name || ''}」；型号${tp.code || '无'}；底色 ${tp.bgColor || '自动'}；${tp.moods?.length ? `${tp.moods.length} 张氛围图` : '无氛围图'}）`;
    });
    lines.push(`- 画布上的面料色卡海报（可用 textile_edit 修改，nodeId 用前面的 id）：${desc.join('；')}`);
  }

  const screens = plan?.screens || [];
  if (screens.length > 0) {
    const list = screens
      .slice(0, 12)
      .map(sc => `第${sc.screenIndex}屏「${sc.screenTitle || '未命名'}」`)
      .join('；');
    lines.push(`- 企划方案：已生成 ${screens.length} 屏：${list}`);
    const renderedIndexes = Array.from(
      new Set(
        nodes
          .filter(n => (n?.data?.imageUrl || n?.data?.rendered_image_url) && Number.isInteger(n?.data?.screenIndex) && n?.type !== 'productImageNode')
          .map(n => n.data.screenIndex as number)
      )
    ).sort((a, b) => a - b);
    lines.push(`- 已渲染分镜：${renderedIndexes.length > 0 ? renderedIndexes.map(i => `第${i}屏`).join('、') : '暂无'}`);
  } else {
    lines.push('- 企划方案：尚未生成');
  }

  lines.push(
    `- 当前企划参数：${planSettings.screenCount ?? '默认'} 屏，比例 ${planSettings.aspectRatio || '默认'}，企划生成模型 ${planSettings.model || '默认'}（生成企划方案用，不是当前对话模型）`
  );
  if (selectedSceneIndex) lines.push(`- 当前选中分镜：第 ${selectedSceneIndex} 屏`);

  const imageNodes = nodes
    .filter(n => typeof n?.data?.imageUrl === 'string' && n.data.imageUrl && ['generatedImageNode', 'productImageNode', 'imageGenerationNode'].includes(n?.type))
    .slice(-8);
  if (imageNodes.length > 0) {
    const desc = imageNodes.map(n => {
      const d = n.data || {};
      const title = d.title || d.screenTitle || d.label || '图片';
      const flags = [d.withText ? '含文字' : '', Number.isInteger(d.sceneIndex) ? `第${d.sceneIndex}屏` : ''].filter(Boolean).join('/');
      return `${n.id}「${title}」${flags ? `(${flags})` : ''}`;
    });
    lines.push(`- 画布图片节点（可作为改字等操作的目标，nodeId 用前面的 id）：${desc.join('；')}`);
  }

  const videos = collectVideoNodeRefs(nodes);
  if (videos.length > 0) {
    const desc = videos.map(v => {
      const meta = [v.modelKey, v.durationSeconds ? `${v.durationSeconds}秒` : '', v.resolution].filter(Boolean).join('/');
      return `${v.nodeId}「${v.title}」${meta ? `(${meta})` : ''}`;
    });
    lines.push(`- 画布视频（最新在前；用户问视频效果时会附上抽帧画面）：${desc.join('；')}`);
  }

  if (mentionedNodeIds && mentionedNodeIds.length > 0) {
    const titles = mentionedNodeIds
      .map(id => nodes.find(n => n?.id === id))
      .filter(Boolean)
      .map(n => {
        const d = n.data || {};
        const title = d.title || d.label || d.screenTitle || n.id;
        return Number.isInteger(d.screenIndex) ? `${title}（第${d.screenIndex}屏）` : title;
      });
    if (titles.length > 0) lines.push(`- 用户本条消息引用的画布素材：${titles.join('、')}`);
  }

  return lines.join('\n');
}

/**
 * 从完整回复中解析动作块，返回正文与卡片字段（可直接合并进 AgentMessage）。
 * 动作块缺失或格式不对时只返回正文，不影响普通对话。
 */
export function extractAgentActions(text: string): Pick<AgentMessage, 'text' | 'clarifyCard' | 'planCard' | 'suggestions'> {
  const result = extractAgentActionsRaw(text);
  // 模型写了“确认后将……”却没给出可用的计划卡（漏写或参数不全被丢弃）：给一个按钮让它补发，避免用户面对不存在的卡片
  if (!result.planCard && !result.clarifyCard && /确认后(将|会)/.test(result.text)) {
    const retry: AgentActionOption = { label: '生成确认卡片', prompt: '请把上面的方案整理成可执行的确认卡片（带完整参数）' };
    result.suggestions = [retry, ...(result.suggestions || [])].slice(0, 4);
  }
  return result;
}

function extractAgentActionsRaw(text: string): Pick<AgentMessage, 'text' | 'clarifyCard' | 'planCard' | 'suggestions'> {
  const start = text.indexOf(OPEN_TAG);
  if (start < 0) return { text };
  const end = text.indexOf(CLOSE_TAG, start);
  const visible = text.slice(0, start).trimEnd();
  if (end < 0) return { text: visible };

  let payload: any;
  try {
    // 只取块内第一个 { 到最后一个 } 之间：模型偶尔会带 ```json 围栏或多吐一个 ">" 之类的杂字符
    const inner = text.slice(start + OPEN_TAG.length, end);
    const jsonStart = inner.indexOf('{');
    const jsonEnd = inner.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd <= jsonStart) return { text: visible };
    payload = JSON.parse(inner.slice(jsonStart, jsonEnd + 1));
  } catch {
    return { text: visible };
  }

  const result: Pick<AgentMessage, 'text' | 'clarifyCard' | 'planCard' | 'suggestions'> = { text: visible };

  if (payload?.clarify && typeof payload.clarify.question === 'string') {
    const options = (Array.isArray(payload.clarify.options) ? payload.clarify.options : [])
      .map(normalizeOption)
      .filter((o: AgentActionOption | null): o is AgentActionOption => o !== null)
      .slice(0, 4);
    if (options.length > 0) {
      const clarifyCard: AgentClarifyCard = { question: payload.clarify.question.trim(), options };
      result.clarifyCard = clarifyCard;
    }
  }

  if (!result.clarifyCard && payload?.plan && isActionId(payload.plan.actionId)) {
    const actionId: AgentActionId = payload.plan.actionId;
    const params = normalizeParams(payload.plan.params);
    // 单屏操作必须指明是哪一屏；改字必须给出新文字
    if (((actionId === 'replan_screen' || actionId === 'render_screen') && !params?.screenIndex) || (actionId === 'edit_image_text' && !params?.newText) || (actionId === 'set_product_image' && !params?.imageUrl) || (actionId === 'edit_image' && !params?.instruction)) {
      // 缺少关键参数时不出计划卡，正文里模型通常已说明
    } else {
      result.planCard = {
        title: typeof payload.plan.title === 'string' && payload.plan.title.trim() ? payload.plan.title.trim().slice(0, 30) : PLAN_TITLES[actionId] || '执行操作',
        actionId,
        params,
        status: 'pending',
        items: describePlanParams(actionId, params)
      };
    }
  }

  if (Array.isArray(payload?.suggestions)) {
    const suggestions = payload.suggestions
      .map(normalizeOption)
      .filter((o: AgentActionOption | null): o is AgentActionOption => o !== null)
      .slice(0, 4);
    if (suggestions.length > 0) result.suggestions = suggestions;
  }

  return result;
}
