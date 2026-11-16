// server/services/video/videoDirectorService.ts
import crypto from 'crypto';
import {
  VideoDirectorPlan,
  VideoShotPlan,
  VideoShotType,
  VideoProductFacts,
  VideoDirectorBriefRequest
} from '../../../src/types/creativeCanvasVideo';
import { resolveApiConfig } from '../../ai/providerConfig';
import { VideoSourceImageResolver } from './videoSourceImageResolver';

const GENERIC_NODE_TITLES = new Set(['产品主图', '主图', '产品图', '参考图', '参考原图', '商品图', '产品图片', 'product_photo']);

const DIRECTOR_TIMEOUT_MS = 90_000;
const MAX_VISION_IMAGES = 2;
const SHOT_TYPES: VideoShotType[] = ['hero', 'function', 'detail', 'closing'];

// 卖点中出现这些词即视为功能演示需求（电动躺平、脚托、旋转、开合等）
const FUNCTION_KEYWORDS = /电动|伸展|躺|零重力|旋转|开合|摇摆|升降|脚托|recline|swivel|rock/i;

// 每个镜头统一的产品与环境保真约束（拼在提示词末尾，不依赖导演模型是否记得写）
const LOCKED_RULES = [
  '产品形状、比例、面料材质与颜色全程与首帧一致',
  '一个镜头只动一样：产品在动则机位锁定，镜头在动则产品静止',
  '镜头内不换背景、不推到微距；换场景在首帧图片阶段完成'
];

// 导演 LLM 调用：超时保护；仅在请求未送达（连接被重置等）时重试，超时不重试以免让用户等两倍时间
async function fetchDirectorWithRetry(url: string, init: RequestInit): Promise<globalThis.Response> {
  let lastError: any;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(DIRECTOR_TIMEOUT_MS) });
    } catch (err: any) {
      lastError = err;
      console.warn(`[VideoDirectorService] chat/completions attempt ${attempt} failed:`, err?.cause?.code || err?.message);
      if (err?.name === 'TimeoutError') break;
    }
  }
  throw lastError;
}

interface ShotDraft {
  shotType: VideoShotType;
  title: string;
  composition: string;
  cameraMotion: string;
  subjectMotion: string;
  cameraLocked: boolean;
  needsEndFrame: boolean;
  firstFrameHint?: string;
  endFrameHint?: string;
  prompt: string;
}

/**
 * 在导演给出的镜头描述后拼上保真约束：机位锁定、功能动作只在首尾帧之间发生、产品与环境不变
 */
function composeShotPrompt(draft: ShotDraft): string {
  const parts = [draft.prompt.trim().replace(/[.。]?$/, '.')];
  if (draft.cameraLocked) {
    parts.push('Static locked-off camera on a tripod; the camera does not move at all.');
  }
  if (draft.shotType === 'function') {
    parts.push(
      draft.needsEndFrame
        ? 'Only the mechanism moves, smoothly and continuously, from the state in the first frame to the state in the last frame.'
        : 'Only the mechanism moves, slowly and in a mechanically plausible way.'
    );
  }
  parts.push(
    // 提示词开头已有产品锚定短语，这里用 the product 指代，避免重复
    'The product keeps exactly the same shape, proportions, cushion layout, upholstery material and color as in the first frame throughout the shot; no morphing, no added or missing parts.',
    'Background, lighting and color grading stay consistent with the first frame. Photorealistic, no text, no watermark.'
  );
  return parts.join(' ');
}

function toShotPlan(draft: ShotDraft, idx: number, durationSeconds: number, sourceAssetVersionId?: string | null): VideoShotPlan {
  return {
    shotId: `shot-${idx + 1}-${crypto.randomBytes(3).toString('hex')}`,
    order: idx + 1,
    title: draft.title,
    composition: draft.composition,
    cameraMotion: draft.cameraMotion,
    subjectMotion: draft.subjectMotion,
    durationSeconds,
    prompt: composeShotPrompt(draft),
    negativeConstraints: ['morphing', 'deformation', 'background change', 'text', 'watermark'],
    referenceAssetVersionIds: sourceAssetVersionId ? [sourceAssetVersionId] : [],
    shotType: draft.shotType,
    cameraLocked: draft.cameraLocked,
    needsEndFrame: draft.needsEndFrame,
    firstFrameHint: draft.firstFrameHint,
    endFrameHint: draft.endFrameHint
  };
}

/** 直接由一条分镜大纲生成镜头（导演漏镜头或不可用时兜底），不写材质颜色断言，保真靠首帧 */
function outlineDraft(s: { title: string; content: string; camera?: string }, anchor: string): ShotDraft {
  const camera = s.camera || '极慢运镜';
  const locked = /锁定|固定|静止机位/.test(camera);
  return {
    shotType: /细节|纹理|特写|材质|缝线/.test(s.title + s.content) ? 'detail' : /收尾|结尾|拉远/.test(s.title + camera) ? 'closing' : 'hero',
    title: s.title,
    composition: s.content,
    cameraMotion: camera,
    subjectMotion: locked ? '产品按画面描述动作' : '产品静止',
    cameraLocked: locked,
    needsEndFrame: false,
    prompt: `${anchor ? `The ${anchor}` : 'The product shown in the first frame'}. ${s.content}. Camera: ${camera}, slow and steady; the product keeps its shape, color and material.`
  };
}

function normalizeDraft(raw: any, allowEndFrame: boolean): ShotDraft | null {
  if (!raw || typeof raw.prompt !== 'string' || !raw.prompt.trim()) return null;
  const shotType: VideoShotType = SHOT_TYPES.includes(raw.shotType) ? raw.shotType : 'hero';
  const isFunction = shotType === 'function';
  return {
    shotType,
    title: String(raw.title || '镜头'),
    composition: String(raw.composition || '产品居中'),
    cameraMotion: String(raw.cameraMotion || (isFunction ? '机位锁定' : '缓慢横移')),
    subjectMotion: String(raw.subjectMotion || (isFunction ? '功能机构动作' : '产品静止')),
    // 功能镜头强制锁机位：产品和镜头同时运动是变形的主要来源
    cameraLocked: isFunction || raw.cameraLocked === true,
    // 所选视频模型不支持尾帧时，尾帧要求没有意义，不再让界面提示用户补图
    needsEndFrame: allowEndFrame && (isFunction || raw.needsEndFrame === true),
    firstFrameHint: raw.firstFrameHint ? String(raw.firstFrameHint) : undefined,
    endFrameHint: allowEndFrame && raw.endFrameHint ? String(raw.endFrameHint) : undefined,
    prompt: raw.prompt
  };
}

export class VideoDirectorService {
  /**
   * Generates a structured director brief and shot list
   */
  public static async generateDirectorBrief(
    request: VideoDirectorBriefRequest
  ): Promise<VideoDirectorPlan> {
    const {
      mode,
      style,
      userPrompt,
      focusPoint,
      focusPoints,
      dnaSummary,
      sourceAssetVersionId,
      sourceImageUrl,
      directorModelKey,
      referenceImages,
      productTitle,
      productCategory,
      productDetails,
      targetDurationSeconds,
      videoModelName,
      supportsLastFrame,
      shotOutline
    } = request;
    // 按构思分镜：对话里定好的镜头大纲，镜头数、顺序、每镜时长都以它为准
    const outline = (Array.isArray(shotOutline) ? shotOutline : [])
      .filter(s => s && typeof s.title === 'string' && typeof s.content === 'string' && Number(s.durationSeconds) > 0)
      .slice(0, 8)
      .map(s => ({
        title: s.title.trim().slice(0, 30),
        content: s.content.trim().slice(0, 200),
        camera: typeof s.camera === 'string' ? s.camera.trim().slice(0, 60) : '',
        durationSeconds: Math.round(Number(s.durationSeconds))
      }));
    const isOutline = style === 'outline' && outline.length > 0;
    // 未告知时按支持处理（与旧行为一致）
    const allowEndFrame = supportsLastFrame !== false;

    const planVersionId = `plan-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const isSingleTake = style === 'single_take' && !isOutline;
    // 面板所选时长是唯一真值：每个镜头都按该时长提交生成，方案中的镜头时长与之保持一致
    const shotDurationSeconds = Number(targetDurationSeconds) > 0 ? Math.round(Number(targetDurationSeconds)) : 5;

    // Sanitize productTitle to ensure no image-node ID leaks into prompts
    let cleanedProductTitle = (productTitle || '').trim();
    const isNodePlaceholder =
      cleanedProductTitle.startsWith('node-') ||
      cleanedProductTitle.startsWith('img-node-') ||
      cleanedProductTitle.startsWith('asset-') ||
      cleanedProductTitle.startsWith('ref-') ||
      cleanedProductTitle.match(/^[a-z0-9-_]{8,}$/i) ||
      // 画布节点的通用标题不是产品名，直接写进提示词会让模型生成“产品主图”这类无意义描述
      GENERIC_NODE_TITLES.has(cleanedProductTitle) ||
      /\.(jpe?g|png|webp|gif)$/i.test(cleanedProductTitle);

    const hasRealProductTitle = Boolean(cleanedProductTitle) && !isNodePlaceholder;
    if (!hasRealProductTitle) {
      cleanedProductTitle = '';
    }

    // Resolve model name
    const modelMap: Record<string, string> = {
      'gemini-3.7-flash': 'gemini-3.6-flash',
      'gemini-3.8-flash': 'gemini-3.6-flash',
      'gpt-6': 'gpt-6-astra',
      'gpt-6-astra': 'gpt-6-astra',
      'gpt-5.6': 'gpt-5.6-sol',
      'gpt-5.6-sol': 'gpt-5.6-sol',
      'gpt-5.6-luna': 'gpt-6.1-sol',
      'gemini-3.6-flash': 'gemini-3.6-flash',
      'gpt-6.1-sol': 'gpt-6.1-sol'
    };
    const targetModel = modelMap[directorModelKey || ''] || 'gemini-3.6-flash';

    // Aggregate focus points
    const activeFocusList: string[] = [];
    if (Array.isArray(focusPoints) && focusPoints.length > 0) {
      activeFocusList.push(...focusPoints);
    } else if (focusPoint && focusPoint.trim()) {
      activeFocusList.push(...focusPoint.split('、').map(p => p.trim()).filter(Boolean));
    }
    const focusString = activeFocusList.join('、') || '整体造型与材质质感';
    const functionFocus = activeFocusList.filter(p => FUNCTION_KEYWORDS.test(p));

    // 参考图缩成小图内联给多模态导演：材质、颜色、结构以图片为准（data URL / 本地资源也能看到）
    const imageSources = [sourceImageUrl, ...(referenceImages || []).map(img => img?.url)]
      .filter((url, idx, arr): url is string => Boolean(url) && arr.indexOf(url) === idx)
      .slice(0, MAX_VISION_IMAGES);
    const visionImages: string[] = [];
    for (const url of imageSources) {
      try {
        visionImages.push(await VideoSourceImageResolver.toVisionDataUrl(url));
      } catch (err: any) {
        console.warn('[VideoDirectorService] Failed to prepare reference image for director:', err?.message || err);
      }
    }

    const prompt = `你是专做家具电商视频的广告导演，需要为图生视频模型（以参考图为首帧）规划分镜。图生视频模型的弱点：一个镜头里变化越多（换背景、推到微距、产品动作叠加运镜），越容易把产品画变形。你的方案必须规避这些风险。

【事实来源】
${visionImages.length > 0 ? '- 附带的图片是产品实拍图，是材质、颜色、结构的唯一事实来源。' : '- 本次未能附带产品图片，只能依据下方文字信息，不要编造图片中可能不存在的部件。'}
- 用户填写的产品名与卖点仅供参考；若与图片矛盾（例如写“真皮”但图中是布艺），以图片为准，并在 summary 中指出。

【输入信息】
- 产品名（仅供参考）: ${cleanedProductTitle || '未提供'}
- 品类: ${productCategory || '家具'}
- 展示重点: ${focusString}
- 产品DNA: ${dnaSummary || productDetails || '未提供'}
- 用户创意要求: ${userPrompt || '未提供'}
- 创作模式: ${mode === 'product_showcase' ? '产品展示' : '自由生成'}
- 视频生成模型: ${videoModelName || '未指定'}（${allowEndFrame ? '支持首尾帧' : '不支持尾帧，只能以首帧图生视频'}）
${isOutline
  ? '- 每个镜头时长: 见下方分镜大纲（各镜头不同；运镜速度按各自时长放慢，10 秒以上的镜头宁可更慢也不要叠加第二个动作）'
  : `- 每个镜头时长: ${shotDurationSeconds} 秒（每个镜头都按这个时长生成；运镜速度据此放慢，${shotDurationSeconds >= 10 ? '时长较长，宁可更慢也不要在一个镜头里叠加第二个动作' : '动作要在时长内自然完成'}）`}

【分镜结构】
${isOutline
  ? `- 按构思分镜：用户已在对话里定好分镜大纲，必须严格输出 ${outline.length} 个镜头，顺序、镜头标题与大纲一一对应，不得增删或合并镜头。你的工作是把每条大纲落成可执行的构图、运镜与英文提示词，shotType 按镜头内容判断。
- 大纲若与下方硬性规则冲突（如 360° 环绕、从全景推到微距、镜头内换场景），保留该镜头的意图但改成符合规则的做法（如改为小幅弧线、改用原图局部作为首帧），并在 summary 里说明改了哪些镜头、为什么。
${outline.map((s, i) => `  ${i + 1}. ${s.title}（${s.durationSeconds} 秒）${s.camera ? `｜运镜：${s.camera}` : ''}｜画面：${s.content}`).join('\n')}`
  : isSingleTake
  ? '- 一镜到底：只输出 1 个镜头。默认 shotType=hero；仅当用户创意要求明确要演示某个功能时才用 function。'
  : '- 多镜头：输出 3~5 个镜头，顺序为 hero（全景亮相）→ function（每个确实存在的功能一个镜头，可没有）→ detail（材质/工艺细节）→ closing（可选收尾）。'}

【硬性规则】
1. 一个镜头只允许一种运动：产品在动（功能演示）则 cameraLocked=true；镜头在动则产品完全静止。
2. 镜头内禁止换背景、换场景、大幅改变光照或色调；首帧是什么环境就保持什么环境。
3. 禁止从全景推到微距。detail 镜头应使用原图局部裁切作为首帧（在 firstFrameHint 写明裁哪个部位），镜头只做横向平移或极小幅度推近。
4. 运镜幅度要小：横移或弧线不超过 15°，推拉不超过画幅的 10%；禁止 360° 环绕和快速运动。
${allowEndFrame
  ? '5. function 镜头只演示图片或卖点中确实存在的功能（电动躺平、脚托伸出、旋转、开合等），needsEndFrame=true，并在 endFrameHint 写明需要用户补充的“动作完成态”实拍图及机位（如：躺平状态的正侧面 90° 实拍图，与首帧同机位）。功能镜头首选正侧面或 3/4 侧面机位。'
  : '5. 所选视频模型不支持尾帧：没有尾帧约束的大幅机构动作（电动躺平、脚托伸出、开合）极易变形，默认不安排 function 镜头，在 summary 中说明建议换用支持首尾帧的模型来演示功能；仅当用户创意要求明确要求演示功能时，才安排一个机位锁定、动作幅度很小的 function 镜头，needsEndFrame=false。'}
6. prompt 用英文，必须以 productFacts.anchorEn 开头，只描述本镜头的构图、运镜与主体运动，不要堆砌空泛形容词，不要描述图片中不存在的部件或场景。
7. 任何字段都不得出现节点 ID（如 img-node-1、asset-xxx）或文件名。

请只输出 JSON（不要 Markdown 包裹）：
{
  "productFacts": {
    "category": "品类（中文，如：单人电动旋转功能椅）",
    "material": "面料/材质（中文，按图识别）",
    "color": "主色（中文）",
    "keyFeatures": ["可见的结构特征，如：方格绗缝靠背、侧面控制面板、圆形旋转底盘"],
    "functions": ["图片或卖点中确实存在的功能"],
    "anchorEn": "one English noun phrase that pins color + material + category + 1-2 key features, e.g. 'brown woven chenille power swivel recliner armchair with channel-tufted cushions'"
  },
  "summary": "方案构想（中文，2~3 句；如材质与用户填写不一致需指出）",
  "shots": [
    {
      "shotType": "hero | function | detail | closing",
      "title": "镜头名称（中文）",
      "composition": "构图与机位（中文）",
      "cameraMotion": "运镜（中文；锁机位写“机位锁定”）",
      "subjectMotion": "主体运动（中文；静止写“产品静止”）",
      "cameraLocked": true,
      "needsEndFrame": false,
      "firstFrameHint": "首帧素材建议（中文，可空字符串）",
      "endFrameHint": "尾帧素材建议（中文，可空字符串）",
      "prompt": "English prompt starting with anchorEn"
    }
  ]
}`;

    try {
      const config = await resolveApiConfig();
      // tiantoken / vectorengine / routerhub 均提供 OpenAI 兼容的 /v1/chat/completions
      if (config.apiKey) {
        const cleanBaseUrl = config.baseUrl.replace(/\/+$/, '').replace(/\/(v1beta|v1)$/, '');
        const targetUrl = `${cleanBaseUrl}/v1/chat/completions`;

        const userMessageContent: any = visionImages.length > 0
          ? [
              { type: 'text', text: prompt },
              ...visionImages.map(url => ({ type: 'image_url', image_url: { url } }))
            ]
          : prompt;

        const startedAt = Date.now();
        const response = await fetchDirectorWithRetry(targetUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: targetModel,
            messages: [
              {
                role: 'system',
                content: 'You are a commercial director for furniture e-commerce videos. Output strictly valid JSON without markdown wrapping.'
              },
              {
                role: 'user',
                content: userMessageContent
              }
            ],
            temperature: 0.3
          })
        });

        if (response.ok) {
          const data = await response.json();
          const content = data?.choices?.[0]?.message?.content || '';
          const match = content.match(/\{[\s\S]*\}/);
          console.log(`[VideoDirectorService] ${targetModel} responded in ${Date.now() - startedAt}ms (images: ${visionImages.length})`);
          if (match) {
            const parsed = JSON.parse(match[0]);
            const facts: VideoProductFacts | undefined = parsed.productFacts
              ? {
                  category: String(parsed.productFacts.category || ''),
                  material: String(parsed.productFacts.material || ''),
                  color: String(parsed.productFacts.color || ''),
                  keyFeatures: Array.isArray(parsed.productFacts.keyFeatures) ? parsed.productFacts.keyFeatures.map(String) : [],
                  functions: Array.isArray(parsed.productFacts.functions) ? parsed.productFacts.functions.map(String) : [],
                  anchorEn: parsed.productFacts.anchorEn ? String(parsed.productFacts.anchorEn) : undefined
                }
              : undefined;
            const anchor = facts?.anchorEn || cleanedProductTitle;
            const drafts = (Array.isArray(parsed.shots) ? parsed.shots : [])
              .map((raw: any) => normalizeDraft(raw, allowEndFrame))
              .filter((d: ShotDraft | null): d is ShotDraft => d !== null)
              .slice(0, isOutline ? outline.length : isSingleTake ? 1 : 5)
              // 导演偶尔漏写锚定短语，补在开头，保证每条提示词都钉住颜色与材质
              .map((d: ShotDraft) =>
                anchor && !d.prompt.toLowerCase().includes(anchor.toLowerCase()) ? { ...d, prompt: `${anchor}, ${d.prompt}` } : d
              );

            if (isOutline && drafts.length < outline.length) {
              // 导演漏了镜头：缺的按大纲直接补，保证镜头数与大纲一致
              for (let i = drafts.length; i < outline.length; i++) drafts.push(outlineDraft(outline[i], anchor));
            }
            if (drafts.length > 0) {
              const shots = drafts.map((draft: ShotDraft, idx: number) =>
                toShotPlan(
                  isOutline ? { ...draft, title: outline[idx].title } : draft,
                  idx,
                  isOutline ? outline[idx].durationSeconds : shotDurationSeconds,
                  sourceAssetVersionId
                )
              );
              return {
                planVersionId,
                summary: parsed.summary || `围绕【${focusString}】的分镜方案`,
                lockedRules: LOCKED_RULES,
                shots,
                estimatedDurationSeconds: shots.reduce((acc: number, cur: VideoShotPlan) => acc + cur.durationSeconds, 0),
                directorModel: targetModel,
                createdAt: new Date().toISOString(),
                productFacts: facts
              };
            }
          }
          console.warn(`[VideoDirectorService] Model ${targetModel} returned no usable shots:`, content.slice(0, 500));
        } else {
          const errText = await response.text();
          console.warn(`[VideoDirectorService] Model ${targetModel} returned status ${response.status}:`, errText);
        }
      }
    } catch (err) {
      console.warn('[VideoDirectorService] LLM director call failed, falling back to deterministic plan:', err);
    }

    // 模板兜底：不认识图片，因此不写任何材质/颜色断言，只用“首帧中的产品”指代，保真全靠首帧
    const anchor = cleanedProductTitle ? `${cleanedProductTitle} (the product shown in the first frame)` : 'product shown in the first frame';
    const heroDraft: ShotDraft = {
      shotType: 'hero',
      title: '全景亮相：整体造型',
      composition: '3/4 前侧机位，产品居中完整入画',
      cameraMotion: '极慢横向平移，幅度不超过 10°',
      subjectMotion: '产品静止',
      cameraLocked: false,
      needsEndFrame: false,
      prompt: isSingleTake && userPrompt
        ? `The ${anchor}, full product in frame. ${userPrompt}`
        : `The ${anchor}, full product centered in frame, three-quarter front view. Very slow, gentle lateral camera slide of less than 10 degrees; the product stays completely still.`
    };
    if (isOutline) {
      // 导演不可用时直接按大纲出镜头，保证镜头数、顺序、时长与对话一致
      const outlineShots = outline.map((s, idx) => toShotPlan(outlineDraft(s, anchor), idx, s.durationSeconds, sourceAssetVersionId));
      return {
        planVersionId,
        summary: `按对话分镜：${outline.length} 个镜头，共 ${outlineShots.reduce((acc, cur) => acc + cur.durationSeconds, 0)} 秒。导演模型暂不可用，提示词按大纲直接生成，可逐镜微调。`,
        lockedRules: LOCKED_RULES,
        shots: outlineShots,
        estimatedDurationSeconds: outlineShots.reduce((acc, cur) => acc + cur.durationSeconds, 0),
        directorModel: `${targetModel} 不可用 · 按大纲生成`,
        createdAt: new Date().toISOString()
      };
    }
    const drafts: ShotDraft[] = [heroDraft];
    if (!isSingleTake) {
      // 不支持尾帧的模型不做功能演示镜头（没有尾帧约束极易变形）
      for (const fn of allowEndFrame ? functionFocus.slice(0, 2) : []) {
        drafts.push({
          shotType: 'function',
          title: `功能演示：${fn}`,
          composition: '正侧面或 3/4 侧面机位，完整呈现机构动作范围',
          cameraMotion: '机位锁定',
          subjectMotion: fn,
          cameraLocked: true,
          needsEndFrame: true,
          endFrameHint: `请上传“${fn}”动作完成后的实拍图，与首帧同机位（建议正侧面）`,
          prompt: `The ${anchor}, side view, demonstrating: ${fn}.`
        });
      }
      drafts.push({
        shotType: 'detail',
        title: '材质细节',
        composition: '原图局部特写',
        cameraMotion: '极慢横向平移，不推近',
        subjectMotion: '产品静止，柔光缓慢扫过表面',
        cameraLocked: false,
        needsEndFrame: false,
        firstFrameHint: '用原图裁出最能体现面料/工艺的局部作为首帧，不要用全景图推近',
        prompt: `Close-up of the upholstery surface of the ${anchor}, very slow lateral camera slide, soft light gently grazing across the texture.`
      });
    }
    const shots = drafts.map((draft, idx) => toShotPlan(draft, idx, shotDurationSeconds, sourceAssetVersionId));

    return {
      planVersionId,
      summary: `模板方案：${isSingleTake ? '单镜头全景亮相' : '全景亮相 → 功能演示 → 材质细节'}，围绕【${focusString}】。功能镜头请补充动作完成态实拍图作为尾帧，细节镜头请用原图局部作为首帧。`,
      lockedRules: LOCKED_RULES,
      shots,
      estimatedDurationSeconds: shots.reduce((acc, cur) => acc + cur.durationSeconds, 0),
      // 导演模型不可用时走模板兜底，如实标注，避免界面误显示为模型生成
      directorModel: `${targetModel} 不可用 · 模板方案`,
      createdAt: new Date().toISOString()
    };
  }
}
