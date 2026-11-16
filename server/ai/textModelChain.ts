/**
 * 文本 / 识图模型统一兜底链（所有服务共用，改这里即可）。
 *
 * 路由平台（TianToken）实测 2026-11：gemini-3.7-flash / 3.8-flash / 2.5-flash 都是 model_not_found，
 * 代码里写死这些名字时每次都要先白失败一轮。这里把它们统一映射到可用模型，按顺序兜底：
 *   gemini-3.6-flash（最快，约 1.8 秒）→ gpt-6.1-sol → gemini-4-argon
 */
export const TEXT_MODEL_CHAIN = ['gemini-3.6-flash', 'gpt-6.1-sol', 'gemini-4-argon'] as const;

/** 单个模型最长等待，超时就换下一个，避免一个模型卡住拖垮整条请求（Cloud Run 300 秒上限） */
export const TEXT_MODEL_TIMEOUT_MS = 75_000;

/** 会被改写成兜底链的模型名（文本 / 识图类；生图模型不在此列） */
const CHAIN_MODEL_RE = /^(google\/)?gemini-(2\.5|3\.5|3\.6|3\.7|3\.8)-flash(-thinking)?$/i;

export function isChainModel(model: unknown): boolean {
  return typeof model === 'string' && CHAIN_MODEL_RE.test(model.trim());
}

/** 前端传来的模型名：空或属于平台没开通的 gemini flash 系列 → gemini-3.6-flash；其他原样 */
export function normalizeTextModel(model: unknown): string {
  const m = typeof model === 'string' ? model.trim() : '';
  return !m || isChainModel(m) ? TEXT_MODEL_CHAIN[0] : m;
}

/** 请求的模型若属于文本/识图类，返回兜底链；否则原样只试这一个 */
export function modelsToTry(model: string): string[] {
  return isChainModel(model) ? [...TEXT_MODEL_CHAIN] : [model];
}
