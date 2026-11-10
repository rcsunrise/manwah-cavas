// 人物编排结果与角色库的对应：按家庭角色（father、son 等）补齐没有关联模特的槽位
import { HumanLayoutConfig, HumanSlotAssignment, ModelAsset } from '../../../types/spaceAssetLibrary';

const ROLE_ALIASES: Record<string, string> = {
  grandpa: 'grandfather',
  grandma: 'grandmother',
  dad: 'father',
  husband: 'father',
  male_host: 'father',
  mom: 'mother',
  wife: 'mother',
  female_host: 'mother',
  boy: 'son',
  girl: 'daughter'
};

const normalizeRole = (role?: string) => {
  const key = (role || '').trim().toLowerCase();
  return ROLE_ALIASES[key] || key;
};

interface MatchableSlot {
  targetRole?: string;
  matchedModelId?: string;
  matchedModelName?: string;
}

/** 已关联且仍在角色库里的保持不变；其余按角色类型挑一个没被占用的模特，找不到就留空让用户手选 */
export function fillMissingModelMatches<T extends MatchableSlot>(slots: T[], models: ModelAsset[]): Array<T & MatchableSlot> {
  const modelIds = new Set(models.map((m) => m.id));
  const used = new Set(slots.map((s) => s.matchedModelId).filter((id): id is string => Boolean(id && modelIds.has(id))));
  return slots.map((slot) => {
    if (slot.matchedModelId && modelIds.has(slot.matchedModelId)) return slot;
    const role = normalizeRole(slot.targetRole);
    const match = role ? models.find((m) => !used.has(m.id) && normalizeRole(m.roleType) === role) : undefined;
    if (!match) return { ...slot, matchedModelId: undefined };
    used.add(match.id);
    return { ...slot, matchedModelId: match.id, matchedModelName: match.nameZh || match.name };
  });
}

export const countMatchedSlots = (slots: MatchableSlot[], models: ModelAsset[]) =>
  slots.filter((s) => s.matchedModelId && models.some((m) => m.id === s.matchedModelId)).length;

/** 模板角标的主名称："160°深度睡眠 · 羊绒盖毯" → "160°深度睡眠" */
export const templateActionLabel = (template: { badge: string }) => template.badge.split('·')[0].trim();

export const layoutActionSignature = (slots: Array<Pick<HumanSlotAssignment, 'positionDesc' | 'actionDesc'>>) =>
  slots.map((s) => `${s.positionDesc}|${s.actionDesc}`).join('||');

/** 给一组槽位配上动作名称，连同签名一起写入编排 */
export function labelLayoutAction(slots: HumanSlotAssignment[], label?: string): Pick<HumanLayoutConfig, 'actionLabel' | 'actionLabelFor'> {
  const text = (label || '').trim();
  return text ? { actionLabel: text, actionLabelFor: layoutActionSignature(slots) } : { actionLabel: undefined, actionLabelFor: undefined };
}

/**
 * 出图时记录到版本上的动作名称：动作没被改过就用模板名或 AI 主题；
 * 否则取第一位人物动作描述的第一句，多人时带上人数。
 */
export function resolveActionLabel(layout?: Pick<HumanLayoutConfig, 'slots' | 'actionLabel' | 'actionLabelFor'> | null): string | undefined {
  const slots = layout?.slots || [];
  if (slots.length === 0) return undefined;
  if (layout?.actionLabel && layout.actionLabelFor === layoutActionSignature(slots)) return layout.actionLabel;
  const firstClause = (slots[0].actionDesc || '').split(/[，,；;。.！!]/)[0].trim().slice(0, 14);
  if (!firstClause) return undefined;
  return slots.length > 1 ? `${slots.length}人-${firstClause}` : firstClause;
}
