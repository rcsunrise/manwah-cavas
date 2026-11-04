// 智能体动作协议：模型在回复末尾附加 <agent_actions>{...}</agent_actions>，前端解析为追问 / 计划 / 下一步卡片。
// 模型不直接执行任何操作；计划卡需用户确认后，由前端调用已有的画布能力执行。
import {
  AgentActionId,
  AgentActionOption,
  AgentActionParams,
  AgentClarifyCard,
  AgentMessage,
  AgentPlanCard
} from '../types/creativeCanvas';

const OPEN_TAG = '<agent_actions>';
const CLOSE_TAG = '</agent_actions>';

const ACTION_IDS: AgentActionId[] = [
  'upload_product',
  'generate_plan',
  'render_all',
  'search_market',
  'open_video',
  'open_poster',
  'goto_setup',
  'goto_render',
  'replan_screen',
  'render_screen'
];

const PLAN_TITLES: Partial<Record<AgentActionId, string>> = {
  generate_plan: '生成企划方案',
  replan_screen: '重新策划分镜',
  render_all: '批量渲染分镜',
  render_screen: '渲染单屏分镜',
  search_market: '联网检索竞品',
  open_video: '打开视频创作',
  open_poster: '打开全案海报'
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
  const screenCount = Number(raw.screenCount);
  if (Number.isInteger(screenCount) && screenCount >= 1 && screenCount <= 12) params.screenCount = screenCount;
  if (typeof raw.aspectRatio === 'string' && /^\d+:\d+$/.test(raw.aspectRatio)) params.aspectRatio = raw.aspectRatio;
  const screenIndex = Number(raw.screenIndex);
  if (Number.isInteger(screenIndex) && screenIndex >= 1) params.screenIndex = screenIndex;
  if (typeof raw.hint === 'string' && raw.hint.trim()) params.hint = raw.hint.trim().slice(0, 300);
  if (typeof raw.keywords === 'string' && raw.keywords.trim()) params.keywords = raw.keywords.trim().slice(0, 100);
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
  if (params?.hint) items.push({ label: '要求', value: params.hint });
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
}): string {
  const lines: string[] = [];
  const { dna, dnaReady, plan, planSettings, nodes, mentionedNodeIds, selectedSceneIndex } = input;

  if (dna) {
    const materials = Array.isArray(dna.materials) && dna.materials.length > 0 ? `，材质 ${dna.materials.slice(0, 3).join('/')}` : '';
    lines.push(`- 产品 DNA：已提取（品类 ${dna.category || '未知'}，主色 ${dna.primaryColor || '未知'}${materials}）`);
  } else if (dnaReady) {
    lines.push('- 产品 DNA：已提取');
  } else {
    const hasProductImage = nodes.some(n => n?.type === 'productImageNode');
    lines.push(`- 产品 DNA：未提取（${hasProductImage ? '画布上已有产品主图，可在企划配置中分析' : '画布上还没有产品主图'}）`);
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
    // 单屏操作必须指明是哪一屏
    if ((actionId === 'replan_screen' || actionId === 'render_screen') && !params?.screenIndex) {
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
