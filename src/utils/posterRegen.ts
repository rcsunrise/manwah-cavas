import type { AgentActionId, AgentActionParams } from '../types/creativeCanvas';

/** 画布节点 / 对话卡片通知智能体面板去执行一个动作（走确认卡片，不直接扣点） */
export const AGENT_RUN_ACTION_EVENT = 'agent:run-action';
/** 画布节点 / 对话卡片把“关于这张图：”填进输入框，并选中该节点，方便引用修改 */
export const AGENT_COMPOSE_EVENT = 'agent:compose';

export interface PosterRegenOption {
  label: string;
  hint: string;
  actionId: AgentActionId;
  params: AgentActionParams;
}

export const POSTER_KIND_NAME: Record<string, string> = { A: '模板 A 海报', B: '沙发面料海报', C: '面料色卡海报' };

/**
 * 模板海报的“再次生成”候选。模板海报不是企划屏的出图结果，不能走“纯净底图”那条再生成。
 * C（面料色卡）出图不扣点、只重排版，没有“整套重出”，只留引用修改。
 */
export function posterRegenOptions(tp: any): PosterRegenOption[] {
  if (!tp?.template) return [];
  const nodeId = tp.productNodeId as string | undefined;
  if (tp.template === 'A') {
    return [{ label: '再出一版', hint: '换一个没用过的场景方向，重出主图（约 3000 点）', actionId: 'template_poster', params: nodeId ? { nodeId } : {} }];
  }
  if (tp.template === 'B') {
    const layout: 'collage4' | 'hero3' = tp.layout === 'hero3' ? 'hero3' : 'collage4';
    const other = layout === 'hero3' ? 'collage4' : 'hero3';
    const base: AgentActionParams = { ...(nodeId ? { nodeId } : {}), fabricCode: tp.code || '', fabricLabel: tp.label || '' };
    return [
      { label: '同版式再出一套', hint: '换新的氛围方向，重出沙发/抱枕/氛围图', actionId: 'fabric_poster', params: { ...base, fabricLayout: layout } },
      {
        label: other === 'hero3' ? '换成 1 大 2 小版式再出' : '换成 4 张拼贴版式再出',
        hint: '另一种版式，同样重出一套',
        actionId: 'fabric_poster',
        params: { ...base, fabricLayout: other }
      }
    ];
  }
  return [];
}
