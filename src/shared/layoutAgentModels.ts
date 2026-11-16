// AI 户型智能体可选模型：只列出当前网关实测支持「联网 + 看图」的模型
export interface LayoutAgentModel {
  id: string;
  label: string;
  hint: string;
  transport: 'gemini_native' | 'openai_responses';
}

export const LAYOUT_AGENT_MODELS: LayoutAgentModel[] = [
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', hint: '推荐 · 最快', transport: 'gemini_native' },
  { id: 'gpt-5.6-sol', label: 'GPT 5.6 Sol', hint: 'OpenAI 通道 · 来源较少', transport: 'openai_responses' }
];

export const DEFAULT_LAYOUT_AGENT_MODEL = LAYOUT_AGENT_MODELS[0].id;
