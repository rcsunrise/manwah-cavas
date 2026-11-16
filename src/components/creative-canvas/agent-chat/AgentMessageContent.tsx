import React from 'react';
import Markdown from 'react-markdown';

const MODEL_LABELS: Record<string, string> = {
  'gpt-6': 'GPT-6 Astra',
  'gpt-6-astra': 'GPT-6 Astra',
  'gpt-5.6-sol': 'GPT-5.6 Sol',
  'gpt-6.1-sol': 'GPT-6.1 Sol',
  'gemini-3.6-flash': 'Gemini 3.6 Flash',
  'gemini-4-argon': 'Gemini 4 Argon',
  // 旧会话里记录的模型名：平台没开通，实际跑的是 3.6 / 6.1 Sol
  'gpt-5.5': 'GPT-6.1 Sol',
  'gpt-5.6-luna': 'GPT-6.1 Sol',
  'gemini-2.5-flash': 'Gemini 3.6 Flash',
  'gemini-3.7-flash': 'Gemini 3.6 Flash',
  'gemini-3.8-flash': 'Gemini 3.6 Flash'
};

/** 与服务端 LOCAL_TEMPLATE_MODEL 保持一致 */
const LOCAL_TEMPLATE_MODEL = 'agent-g-local-template';

export function formatChatModelLabel(modelId?: string): string {
  if (!modelId) return '';
  return MODEL_LABELS[modelId] || modelId;
}

/** 智能体回复正文：按 Markdown 渲染（粗体、列表、标题、代码），不渲染原始 HTML */
export const AgentMarkdown: React.FC<{ text: string }> = ({ text }) => (
  <div
    className={[
      'break-words',
      '[&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
      '[&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-1.5 [&_li]:my-0.5',
      '[&_strong]:font-bold [&_strong]:text-[#2C2A29]',
      '[&_h1]:text-sm [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-1 [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:mt-2 [&_h3]:mb-1',
      '[&_code]:bg-stone-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-[11px] [&_code]:font-mono',
      '[&_pre]:bg-stone-100 [&_pre]:p-2 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:my-1.5',
      '[&_blockquote]:border-l-2 [&_blockquote]:border-[#E5E0D8] [&_blockquote]:pl-2 [&_blockquote]:text-stone-500',
      '[&_a]:text-[#8C6F43] [&_a]:underline [&_hr]:my-2 [&_hr]:border-[#E5E0D8]'
    ].join(' ')}
  >
    <Markdown>{text}</Markdown>
  </div>
);

/** 回复下方的作答模型标注；与所选模型不一致（自动切换或本地兜底）时如实说明 */
export const AgentModelTag: React.FC<{ model?: string; requestedModel?: string }> = ({ model, requestedModel }) => {
  if (!model) return null;
  if (model === LOCAL_TEMPLATE_MODEL) {
    return <span className="text-amber-600">模型暂不可用 · 本地模板回复</span>;
  }
  const used = formatChatModelLabel(model);
  const requested = formatChatModelLabel(requestedModel);
  const switched = Boolean(requested) && requested !== used;
  return (
    <span className={switched ? 'text-amber-600' : undefined} title={switched ? `所选 ${requested} 不可用，已自动切换` : undefined}>
      {used}
      {switched && ` · 所选 ${requested} 不可用，已自动切换`}
    </span>
  );
};
