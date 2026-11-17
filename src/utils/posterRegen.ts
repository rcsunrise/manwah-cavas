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

export const POSTER_KIND_NAME: Record<string, string> = { A: '4/3 产品海报', B: '沙发面料海报', C: '面料色卡海报' };

/**
 * 模板海报的“再次生成”候选。模板海报不是企划屏的出图结果，不能走“纯净底图”那条再生成。
 * C（面料色卡）：换排版 / 换氛围图组合只重排版不扣点；重出氛围图才扣点。
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
  if (tp.template === 'C') {
    const cur: string = tp.layout || 'slant';
    const mv = Number(tp.moodVariant) || 0;
    const LAYOUTS: Array<{ id: 'slant' | 'hex' | 'circle'; name: string }> = [
      { id: 'slant', name: '斜切' },
      { id: 'hex', name: '六边形' },
      { id: 'circle', name: '圆形' }
    ];
    const opts: PosterRegenOption[] = LAYOUTS.filter(l => l.id !== cur).map(l => ({
      label: `换成${l.name}排版`,
      hint: '沿用面料和氛围图重新排版，不扣点，几秒完成',
      actionId: 'textile_edit' as AgentActionId,
      params: { textileLayout: l.id }
    }));
    if (tp.moods?.length) {
      opts.push({
        label: '氛围图换一种组合',
        hint: '同样的氛围图换拼贴摆法（大图/小图位置、格子比例），不扣点',
        actionId: 'textile_edit',
        params: { textileMoodVariant: mv + 1 }
      });
    }
    if (tp.moodStyle === 'cutout') {
      opts.push({ label: '恢复普通拼贴', hint: '去掉人物抠图，氛围图回到普通拼贴，不扣点', actionId: 'textile_edit', params: { textileMoodStyle: 'collage' } });
      opts.push({ label: '换一个抠图人物（AI，约 3000 点）', hint: 'AI 新出一张白底全身人物，抠图加白边压在拼贴上', actionId: 'textile_edit', params: { textileMoodStyle: 'cutout', textileCutoutAi: true } });
    } else {
      opts.push({ label: '人物抠图叠压（用现有氛围图）', hint: '从氛围图里抠出人物，加白边压在拼贴上，不扣点；背景太杂会抠不出来', actionId: 'textile_edit', params: { textileMoodStyle: 'cutout' } });
      opts.push({ label: '人物抠图叠压（AI 新出人物）', hint: 'AI 出 1 张白底全身人物再抠图，加白边压在拼贴上（约 3000 点）', actionId: 'textile_edit', params: { textileMoodStyle: 'cutout', textileCutoutAi: true } });
    }
    opts.push({
      label: '重出氛围图（换人物场景）',
      hint: 'AI 重新生成 3 张氛围图，换不同的人物、场景与机位（约 9000 点）',
      actionId: 'textile_edit',
      params: { textileMoods: 3, textileMoodVariation: true, textileMoodVariant: mv + 1 }
    });
    return opts;
  }
  return [];
}
