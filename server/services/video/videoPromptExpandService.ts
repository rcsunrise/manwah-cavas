// server/services/video/videoPromptExpandService.ts
// 「AI扩写融合重点」：看产品图 + 用户原始描述 + 所选展示重点，由多模态大模型改写成可直接使用的视频提示词，
// 同时按图片推荐该产品真正具备的展示重点（替代固定的预设卖点列表）。
import { resolveApiConfig } from '../../ai/providerConfig';
import { VideoSourceImageResolver } from './videoSourceImageResolver';

const EXPAND_TIMEOUT_MS = 60_000;
const DEFAULT_MODEL = 'gemini-3.6-flash';
// 平台没开通 3.7/3.8/luna：选了它们的按 DEFAULT_MODEL（gemini-3.6-flash）走
const ALLOWED_MODELS = new Set(['gemini-3.6-flash', 'gpt-6.1-sol', 'gpt-6-astra', 'gpt-5.6-sol', 'gemini-4-argon']);

export interface VideoPromptExpandRequest {
  /** generate_video：直接作为单镜头视频提示词；product_showcase：作为交给 AI 导演的创意要求 */
  mode: 'generate_video' | 'product_showcase';
  userPrompt?: string;
  productTitle?: string;
  focusPoints?: string[];
  imageUrl?: string;
  durationSeconds?: number;
  videoModelName?: string;
  supportsLastFrame?: boolean;
  directorModelKey?: string;
}

export interface VideoPromptExpandResult {
  prompt: string;
  suggestedFocusPoints: string[];
  model: string;
  usedImage: boolean;
}

export async function expandVideoPrompt(req: VideoPromptExpandRequest): Promise<VideoPromptExpandResult> {
  const model = ALLOWED_MODELS.has(req.directorModelKey || '') ? req.directorModelKey! : DEFAULT_MODEL;
  const duration = Number(req.durationSeconds) > 0 ? Math.round(Number(req.durationSeconds)) : 5;
  const focus = (req.focusPoints || []).filter(Boolean);

  let visionImage: string | null = null;
  if (req.imageUrl) {
    try {
      visionImage = await VideoSourceImageResolver.toVisionDataUrl(req.imageUrl);
    } catch (err: any) {
      console.warn('[VideoPromptExpand] Failed to prepare product image:', err?.message || err);
    }
  }

  const isDirect = req.mode === 'generate_video';
  const task = isDirect
    ? `把用户的想法改写成一条可以直接交给图生视频模型的中文提示词（参考图就是视频首帧）。
要求：
1. 先用一句话钉住产品：颜色 + 材质 + 品类 + 1~2 个可见结构特征（按图片识别，图片与用户文字矛盾时以图片为准）。
2. 视频时长 ${duration} 秒，只安排一种运动：要么镜头缓慢移动（横移/弧线不超过 15°、推近不超过画幅 10%），要么机位锁定只让产品机构动作，二者不能同时发生。${duration >= 10 ? '时长较长，运镜速度要更慢，不要为了填满时长叠加第二个动作。' : ''}
3. 不要从全景推到微距，不要换背景、换场景，光线和色调与首帧一致。
4. ${req.supportsLastFrame ? '所选模型支持尾帧；若演示功能动作（如躺平、伸展），机位锁定，写明动作从首帧状态平滑过渡到尾帧状态。' : '所选模型不支持尾帧：不要安排电动伸展、躺平、开合等大幅机构动作，这类动作没有尾帧约束极易变形，改为静态展示。'}
5. 结尾加上保真约束：产品形状、比例、材质、颜色全程与首帧一致，不变形，无文字无水印。
6. 用户已经写的具体要求（运镜方向、光线、氛围）要保留；空泛的形容词（如“4K电影质感”“高级”）删掉或换成具体的光线/画面描述。
7. 总长度 80~160 字，一段话，不要分点。`
    : `把用户的想法改写成交给“AI 导演”的创意要求（导演随后会据此规划多个分镜并自己写英文提示词）。
要求：
1. 用中文写 2~4 句：想要的整体氛围与光线、希望重点表现哪些卖点及先后顺序、节奏（每个镜头 ${duration} 秒）。
2. 卖点只写图片中确实可见或用户明确提到的；图片与用户文字矛盾时以图片为准，并点明。
3. 不要写具体的运镜参数和英文提示词，不要堆砌空泛形容词。
4. 总长度 60~140 字。`;

  const prompt = `你是家具电商视频的创意策划。${task}

【输入】
- 产品名（仅供参考）：${req.productTitle?.trim() || '未提供'}
- 用户原始描述：${req.userPrompt?.trim() || '未填写'}
- 用户选择的展示重点：${focus.length > 0 ? focus.join('、') : '未选择'}
- 视频模型：${req.videoModelName || '未指定'}
- 单镜头时长：${duration} 秒
${visionImage ? '- 附图是产品实拍图，是材质、颜色、结构的唯一事实来源。' : '- 本次没有产品图片，只能依据文字，不要编造部件。'}

另外，请根据图片推荐 4~6 个这件产品真正值得展示的卖点（每个 4~12 个中文字符，具体可见，例如“方格绗缝靠背”“金属弧形底座”），不要推荐图中看不出的功能。

只输出 JSON（不要 Markdown 包裹）：
{"prompt": "改写结果", "suggestedFocusPoints": ["卖点1", "卖点2"]}`;

  const config = await resolveApiConfig();
  if (!config.apiKey) throw new Error('未配置大模型 API Key，无法扩写');
  const baseUrl = config.baseUrl.replace(/\/+$/, '').replace(/\/(v1beta|v1)$/, '');
  const content: any = visionImage
    ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: visionImage } }]
    : prompt;

  let response: globalThis.Response | null = null;
  let lastError: any = null;
  for (let attempt = 1; attempt <= 2 && !response; attempt++) {
    try {
      response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'You write prompts for furniture e-commerce product videos. Output strictly valid JSON without markdown wrapping.' },
            { role: 'user', content }
          ],
          temperature: 0.5
        }),
        signal: AbortSignal.timeout(EXPAND_TIMEOUT_MS)
      });
    } catch (err: any) {
      lastError = err;
      console.warn(`[VideoPromptExpand] attempt ${attempt} failed:`, err?.cause?.code || err?.message);
      if (err?.name === 'TimeoutError') break; // 超时不重试，避免让用户等两倍时间
    }
  }
  if (!response) throw new Error(lastError?.name === 'TimeoutError' ? '扩写超时，请稍后重试' : '扩写请求失败，请检查网络后重试');
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`扩写模型返回错误 ${response.status}：${text.slice(0, 200)}`);
  }
  const data: any = await response.json();
  const raw: string = data?.choices?.[0]?.message?.content || '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('扩写模型没有返回可用结果');
  const parsed = JSON.parse(match[0]);
  const expanded = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : '';
  if (!expanded) throw new Error('扩写模型没有返回可用结果');
  const suggested: string[] = Array.isArray(parsed.suggestedFocusPoints)
    ? parsed.suggestedFocusPoints
        .map((p: any) => String(p || '').trim())
        .filter((p: string) => p.length >= 2 && p.length <= 20)
        .slice(0, 6)
    : [];
  return { prompt: expanded, suggestedFocusPoints: suggested, model, usedImage: Boolean(visionImage) };
}
