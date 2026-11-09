// server/services/spaceLayoutAgentService.ts
// 摄影画册｜AI 户型智能体：联网检索 + 参考图理解，生成可直接出图的户型原型，并按户型推荐/新建美学风格
import sharp from 'sharp';
import { z } from 'zod';
import { createServerGenAI } from '../utils/aiClient';
import { resolveApiConfig } from '../ai/providerConfig';
import { buildResponsesEndpoint } from '../ai/agentResponses';
import { DEFAULT_LAYOUT_AGENT_MODEL, LAYOUT_AGENT_MODELS } from '../../src/shared/layoutAgentModels';

const MAX_IMAGES = 4;
const modelField = z
  .string()
  .optional()
  .transform((v) => (LAYOUT_AGENT_MODELS.some((m) => m.id === v) ? (v as string) : DEFAULT_LAYOUT_AGENT_MODEL));

const str = (fallback = '') => z.preprocess((v) => (v == null ? fallback : String(v)), z.string());
const strList = z.preprocess(
  (v) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : []),
  z.array(z.string())
);

const TopologySchema = z.object({
  topologyDirective: str(),
  architecturalFocalWall: str(),
  flooringTopology: str(),
  ceilingStructure: str(),
  windowAndOutdoorView: str(),
  negativeConstraints: strList
});

const ArchitectureSchema = z.object({
  styleWallMoldingDirective: str(),
  styleMaterialPalette: str(),
  styleAtmosphericLighting: str(),
  styleNegativeRules: strList
});

const LayoutSchema = z.object({
  name: str(),
  nameEn: str(),
  propertyType: z.preprocess((v) => (['penthouse', 'villa', 'duplex', 'flat'].includes(String(v)) ? v : 'flat'), z.enum(['penthouse', 'villa', 'duplex', 'flat'])),
  layoutType: z.preprocess(
    (v) => (['horizontal', 'vertical', 'split_level', 'sunken', 'double_living'].includes(String(v)) ? v : 'horizontal'),
    z.enum(['horizontal', 'vertical', 'split_level', 'sunken', 'double_living'])
  ),
  ceilingHeight: z.preprocess((v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 2.2 && n <= 12 ? n : 3;
  }, z.number()),
  zones: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z.array(
      z.object({
        name: str(),
        primaryAxis: z.preprocess((a) => (a === 'y' ? 'y' : 'x'), z.enum(['x', 'y'])),
        coveragePercentage: z.preprocess((n) => {
          const p = Number(n);
          return Number.isFinite(p) ? Math.max(1, Math.min(100, Math.round(p))) : 30;
        }, z.number())
      })
    )
  ),
  signatureFeatures: strList,
  promptFragments: strList,
  topology: TopologySchema,
  basis: str()
});

const StyleSchema = z.object({
  name: str(),
  nameEn: str(),
  category: z.preprocess((v) => (['欧美住宅', '国际现代', '东方住宅'].includes(String(v)) ? v : '国际现代'), z.string()),
  cityCharacter: str(),
  colorPalette: z.preprocess(
    (v) => (Array.isArray(v) ? v.map(String).filter((c) => /^#[0-9a-f]{6}$/i.test(c)) : []),
    z.array(z.string())
  ),
  materialSystem: strList,
  lifestyleTags: strList,
  typicalLayout: str(),
  promptFragments: strList,
  negativeRules: strList,
  architecture: ArchitectureSchema,
  reason: str()
});

export type AgentLayout = z.infer<typeof LayoutSchema>;
export type AgentStyle = z.infer<typeof StyleSchema>;
export interface AgentSource {
  title: string;
  url: string;
}

export const LayoutSearchRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(8000) }))
    .min(1)
    .max(30),
  images: z.array(z.string().min(1)).max(MAX_IMAGES).optional(),
  model: modelField
});

export const StyleRecommendRequestSchema = z.object({
  layout: z.object({
    name: z.string(),
    propertyType: z.string().optional(),
    layoutType: z.string().optional(),
    ceilingHeight: z.number().optional(),
    signatureFeatures: z.array(z.string()).optional()
  }),
  existingStyles: z
    .array(
      z.object({
        code: z.string(),
        name: z.string(),
        category: z.string().optional(),
        typicalLayout: z.string().optional(),
        lifestyleTags: z.array(z.string()).optional()
      })
    )
    .max(80),
  product: z
    .object({
      name: z.string().optional(),
      colors: z.array(z.string()).optional(),
      materials: z.array(z.string()).optional()
    })
    .optional(),
  note: z.string().max(2000).optional(),
  model: modelField
});

/** 从模型文本里取出 JSON：兼容 ```json 代码块和前后的说明文字 */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型没有返回结构化结果');
  return JSON.parse(candidate.slice(start, end + 1));
}

function collectSources(response: any): AgentSource[] {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const seen = new Set<string>();
  const sources: AgentSource[] = [];
  for (const chunk of chunks) {
    const url = chunk?.web?.uri;
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    sources.push({ title: String(chunk?.web?.title || url), url });
  }
  return sources.slice(0, 8);
}

async function normalizeImage(dataUrl: string): Promise<{ mimeType: string; data: string }> {
  const match = dataUrl.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
  if (!match) throw new Error('参考图格式无效，请上传 JPG、PNG 或 WebP 图片');
  const output = await sharp(Buffer.from(match[1], 'base64'))
    .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { mimeType: 'image/jpeg', data: output.toString('base64') };
}

type InlineImage = { mimeType: string; data: string };

/** 网关偶发断连（fetch failed / 502~504）时重试一次 */
async function withNetworkRetry<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err: any) {
    const message = String(err?.message || err);
    if (!/fetch failed|ECONNRESET|ETIMEDOUT|socket|\b50[234]\b/i.test(message)) throw err;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return call();
  }
}

/**
 * Gemini 分两步：先专门联网检索，再基于检索结果输出 JSON。
 * 实测把搜索工具和“只输出 JSON”的长提示放在一次调用里时，模型会跳过搜索、凭记忆写楼盘名。
 */
async function callGeminiWithSearch(userId: string, model: string, prompt: string, research: string, images: InlineImage[]) {
  const { ai, isValidKey } = await createServerGenAI(userId);
  if (!ai || !isValidKey) throw new Error('当前未配置可用的 AI 模型或 API Key 无效');
  const imageParts = images.map((inlineData) => ({ inlineData }));
  const searchOnce = (text: string): Promise<any> =>
    withNetworkRetry(() =>
      ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text }, ...imageParts] }],
        config: { tools: [{ googleSearch: {} }] }
      })
    );
  let searched: any = await searchOnce(research);
  // 模型有时不触发搜索，这时明确要求再查一次
  if (collectSources(searched).length === 0) {
    searched = await searchOnce(`必须使用 Google 搜索工具后再回答，不要凭记忆回答。\n\n${research}`);
  }
  const findings = String(searched?.text || '').trim();
  const sources = collectSources(searched);
  const evidence =
    sources.length > 0
      ? `\n\n联网检索结果（已完成搜索，直接使用）：\n${findings}\n\n具体楼盘名只能来自上面的检索结果。`
      : '\n\n这次联网检索没有得到可靠来源：不要写具体楼盘名，basis 按户型类型或参考图说明。';
  const response: any = await withNetworkRetry(() =>
    ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt + evidence }, ...imageParts] }],
      config: { responseMimeType: 'application/json' }
    })
  );
  return { text: String(response?.text || '').trim(), sources };
}

async function callResponsesWithSearch(userId: string, model: string, prompt: string, images: InlineImage[]) {
  const config = await resolveApiConfig(userId);
  if (!config.apiKey) throw new Error('当前未配置可用的 AI 模型或 API Key 无效');
  const res = await withNetworkRetry(() =>
    fetch(buildResponsesEndpoint(config.baseUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        tools: [{ type: 'web_search' }],
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
              ...images.map((img) => ({ type: 'input_image', image_url: `data:${img.mimeType};base64,${img.data}` }))
            ]
          }
        ]
      }),
      signal: AbortSignal.timeout(300000)
    })
  );
  const raw: any = await res.json().catch(() => null);
  if (!res.ok) throw new Error(raw?.error?.message || `模型请求失败（${res.status}）`);
  const content = (Array.isArray(raw?.output) ? raw.output : [])
    .filter((item: any) => item?.type === 'message')
    .flatMap((item: any) => item?.content || []);
  const seen = new Set<string>();
  const sources: AgentSource[] = [];
  for (const annotation of content.flatMap((c: any) => c?.annotations || [])) {
    const url = annotation?.url;
    if (annotation?.type === 'url_citation' && typeof url === 'string' && /^https?:\/\//i.test(url) && !seen.has(url)) {
      seen.add(url);
      sources.push({ title: String(annotation?.title || url), url });
    }
  }
  return {
    // 去掉模型写进正文的引用链接，来源单独展示
    text: content.map((c: any) => c?.text || '').join('').replace(/\s*\(\[[^\]]*\]\([^)]*\)\)/g, '').trim(),
    sources: sources.slice(0, 8)
  };
}

/** 调用所选模型（开启联网检索）并解析 JSON；格式不对时用 Gemini 再整理一次 */
async function runAgentJson(userId: string, model: string, prompt: string, research: string, images: InlineImage[] = []): Promise<{ json: unknown; sources: AgentSource[] }> {
  const transport = LAYOUT_AGENT_MODELS.find((m) => m.id === model)?.transport;
  const { text, sources } =
    transport === 'openai_responses'
      ? await callResponsesWithSearch(userId, model, prompt, images)
      : await callGeminiWithSearch(userId, model, prompt, research, images);
  try {
    return { json: extractJsonObject(text), sources };
  } catch {
    const { ai } = await createServerGenAI(userId);
    if (!ai) throw new Error('模型没有返回结构化结果');
    const repaired: any = await ai.models.generateContent({
      model: DEFAULT_LAYOUT_AGENT_MODEL,
      contents: [{ role: 'user', parts: [{ text: `把下面内容整理成一个合法 JSON 对象，字段和内容保持不变，只输出 JSON：\n\n${text.slice(0, 30000)}` }] }],
      config: { responseMimeType: 'application/json' }
    });
    return { json: extractJsonObject(String(repaired?.text || '')), sources };
  }
}

const TOPOLOGY_GUIDE = `"topology": {
  "topologyDirective": "英文，一段强约束的空间结构描述：开间/进深、动线、分区关系、标志性结构",
  "architecturalFocalWall": "英文，主背景墙的位置、尺度和结构（不写具体装修风格）",
  "flooringTopology": "英文，地面结构（高差、铺装方向等）",
  "ceilingStructure": "英文，层高与天花结构",
  "windowAndOutdoorView": "英文，窗的位置、尺度与窗外关系",
  "negativeConstraints": ["英文，3~6 条这个户型绝不能出现的结构错误"]
}`;

export async function searchLayouts(
  userId: string,
  input: z.infer<typeof LayoutSearchRequestSchema>
): Promise<{ reply: string; layouts: AgentLayout[]; sources: AgentSource[] }> {
  const images = await Promise.all((input.images || []).map(normalizeImage));
  const history = input.messages.map((m) => `${m.role === 'user' ? '用户' : '智能体'}：${m.text}`).join('\n');
  const prompt = `你是高端家具摄影画册的室内建筑顾问。需要根据用户需求，给画册找到真实可信的客厅户型原型，用于 AI 出图。

对话记录：
${history}
${images.length > 0 ? `\n用户上传了 ${images.length} 张参考图（户型图或空间照片）。先读懂其中的开间、进深、窗位、墙体、分区和层高，方案必须忠于参考图。\n` : ''}
要求：
1. 必须先调用联网搜索，查询相关地区或楼盘类型的真实户型信息（开间、层高、常见格局），不要编造具体楼盘数据。
2. 给出 2~3 个差异明显的户型方案。如果用户只想改已有方案，就给 1 个修改后的方案。
3. 户型只描述建筑结构，不写具体装修风格和颜色，风格之后单独选择。
4. 每个方案都要适合摆放一组大型沙发并拍摄客厅画册。

只输出一个 JSON 对象，不要其他文字：
{
  "reply": "中文，2~3 句话说明你的判断和这几个方案的区别",
  "layouts": [{
    "name": "中文户型名，8~12 字",
    "nameEn": "English name",
    "propertyType": "penthouse | villa | duplex | flat",
    "layoutType": "horizontal | vertical | split_level | sunken | double_living",
    "ceilingHeight": 3.2,
    "zones": [{ "name": "中文功能区", "primaryAxis": "x 或 y", "coveragePercentage": 60 }],
    "signatureFeatures": ["中文，3~4 条这个户型的标志性特征"],
    "promptFragments": ["英文，4~5 条描述该空间结构的出图短句"],
    ${TOPOLOGY_GUIDE},
    "basis": "中文，一句话说明依据（来自参考图或哪类真实户型）"
  }]
}`;

  const research = `请联网搜索并用要点总结下面需求涉及的真实户型信息：开间、进深、层高、常见客厅格局，注明楼盘或资料来源，查不到的如实说明。${images.length > 0 ? '同时读懂参考图里的空间结构。' : ''}\n\n${history}`;
  const { json, sources } = await runAgentJson(userId, input.model, prompt, research, images);
  const parsed = z
    .object({ reply: str(), layouts: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(LayoutSchema)) })
    .parse(json);
  const layouts = parsed.layouts.filter((l) => l.name && l.promptFragments.length > 0 && l.topology.topologyDirective).slice(0, 3);
  return { reply: parsed.reply, layouts, sources };
}

export async function recommendStylesForLayout(
  userId: string,
  input: z.infer<typeof StyleRecommendRequestSchema>
): Promise<{
  reply: string;
  recommendations: Array<{ code: string; score: number; reason: string }>;
  newStyles: AgentStyle[];
  sources: AgentSource[];
}> {
  const prompt = `你是高端家具摄影画册的美学总监。户型已经确定，必须先调用联网搜索了解这类户型当下的高端住宅设计趋势，再给出美学方案。

户型：${JSON.stringify(input.layout)}
${input.product ? `主打产品：${JSON.stringify(input.product)}` : ''}
${input.note ? `用户补充：${input.note}` : ''}

现有美学库：
${JSON.stringify(input.existingStyles)}

要求：
1. 从现有美学库挑选最适合的 3 个，score 为 0~100，reason 说明为什么适合这个户型和产品。
2. 再新建 2 个现有库里没有的美学风格，要和这个户型的结构、层高、采光相匹配，也要能衬托主打产品。

只输出一个 JSON 对象，不要其他文字：
{
  "reply": "中文，1~2 句话总结推荐思路",
  "recommendations": [{ "code": "现有美学的 code", "score": 90, "reason": "中文，一句话" }],
  "newStyles": [{
    "name": "中文风格名，5~10 字",
    "nameEn": "English name",
    "category": "欧美住宅 | 国际现代 | 东方住宅",
    "cityCharacter": "中文，代表城市 ｜ 气质",
    "colorPalette": ["#RRGGBB，4~5 个"],
    "materialSystem": ["中文，4~5 种材质"],
    "lifestyleTags": ["中文，3~4 个"],
    "typicalLayout": "中文，适合的户型",
    "promptFragments": ["英文，3~4 条风格出图短句"],
    "negativeRules": ["英文，3~5 条"],
    "architecture": {
      "styleWallMoldingDirective": "英文，强约束的墙面与线脚做法",
      "styleMaterialPalette": "英文，硬装材质与配色，可带色值",
      "styleAtmosphericLighting": "英文，光线氛围",
      "styleNegativeRules": ["英文，3~6 条"]
    },
    "reason": "中文，一句话说明为什么适合这个户型"
  }]
}`;

  const research = `请联网搜索并用要点总结：「${input.layout.name}」这类住宅当下的高端室内设计趋势，包括墙面做法、材质、配色和灯光，注明资料来源。`;
  const { json, sources } = await runAgentJson(userId, input.model, prompt, research);
  const parsed = z
    .object({
      reply: str(),
      recommendations: z.preprocess(
        (v) => (Array.isArray(v) ? v : []),
        z.array(
          z.object({
            code: str(),
            score: z.preprocess((n) => {
              const s = Number(n);
              return Number.isFinite(s) ? Math.max(0, Math.min(100, Math.round(s))) : 0;
            }, z.number()),
            reason: str()
          })
        )
      ),
      newStyles: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(StyleSchema))
    })
    .parse(json);
  const knownCodes = new Set(input.existingStyles.map((s) => s.code));
  return {
    reply: parsed.reply,
    recommendations: (parsed.recommendations as Array<{ code: string; score: number; reason: string }>).filter((r) => knownCodes.has(r.code)).slice(0, 3),
    newStyles: parsed.newStyles
      .filter((s) => s.name && s.promptFragments.length > 0 && s.architecture.styleWallMoldingDirective)
      .slice(0, 2),
    sources
  };
}
