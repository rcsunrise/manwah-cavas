import React from 'react';
import { HelpCircle, ClipboardList, CheckCircle2, XCircle, Loader2, Ban, ArrowRight, Crosshair } from 'lucide-react';
import {
  AgentActionOption,
  AgentClarifyCard,
  AgentMessage,
  AgentPlanCard,
  AgentTaskCard
} from '../../../types/creativeCanvas';

interface AgentMessageCardsProps {
  message: AgentMessage;
  /** 点击卡片中的选项 / 建议：执行动作或作为用户消息发出 */
  onChooseOption: (option: AgentActionOption, messageId: string) => void;
  onConfirmPlan: (messageId: string, card: AgentPlanCard) => void;
  onCancelPlan: (messageId: string) => void;
  /** 计划卡的“调整参数”入口 */
  onAdjustPlan: (card: AgentPlanCard) => void;
}

const ClarifyCardView: React.FC<{
  card: AgentClarifyCard;
  onChoose: (option: AgentActionOption) => void;
}> = ({ card, onChoose }) => (
  <div className="mt-2.5 rounded-xl border border-[#E5E0D8] bg-[#FAF8F5] overflow-hidden">
    <div className="px-3 py-2 flex items-center justify-between border-b border-[#E5E0D8]/70">
      <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#2C2A29]">
        <HelpCircle className="w-3.5 h-3.5 text-[#B28C5A]" />
        需要你确认
      </span>
      {card.answered && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-200/70 text-stone-600 font-bold">已回答</span>
      )}
    </div>
    <div className="p-3 space-y-2">
      <p className="text-xs text-[#2C2A29]">{card.question}</p>
      {card.answered ? (
        <p className="text-[11px] text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-2.5 py-1.5">已回答：{card.answered}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {card.options.map(option => (
            <button
              key={option.label}
              type="button"
              onClick={() => onChoose(option)}
              className="px-2.5 py-1 rounded-lg bg-white border border-[#E5E0D8] hover:border-[#B28C5A] hover:text-[#8C6F43] text-[11px] font-bold text-stone-700 transition-colors cursor-pointer"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  </div>
);

const PLAN_STATUS_LABEL: Record<AgentPlanCard['status'], string> = {
  pending: '待确认',
  confirmed: '已确认',
  cancelled: '已取消'
};

const PlanCardView: React.FC<{
  card: AgentPlanCard;
  onConfirm: () => void;
  onCancel: () => void;
  onAdjust: () => void;
}> = ({ card, onConfirm, onCancel, onAdjust }) => (
  <div className="mt-2.5 rounded-xl border border-[#E5E0D8] bg-white overflow-hidden">
    <div className="px-3 py-2 flex items-center justify-between bg-[#FAF8F5] border-b border-[#E5E0D8]/70">
      <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#2C2A29]">
        <ClipboardList className="w-3.5 h-3.5 text-[#B28C5A]" />
        {card.title}
      </span>
      <span
        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
          card.status === 'confirmed'
            ? 'bg-emerald-50 text-emerald-700'
            : card.status === 'cancelled'
            ? 'bg-stone-200/70 text-stone-500'
            : 'bg-amber-50 text-amber-700'
        }`}
      >
        {PLAN_STATUS_LABEL[card.status]}
      </span>
    </div>
    <dl className="px-3 py-2 space-y-1">
      {card.items.map(item => (
        <div key={item.label} className="flex items-start gap-2 text-[11px]">
          <dt className="w-14 shrink-0 text-stone-400">{item.label}</dt>
          <dd className="text-[#2C2A29] font-medium min-w-0 break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
    {card.status === 'pending' && (
      <div className="px-3 pb-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 py-1.5 rounded-lg bg-[#B28C5A] hover:bg-[#9E7A4A] text-white text-[11px] font-bold transition-colors cursor-pointer"
        >
          确认执行
        </button>
        <button
          type="button"
          onClick={onAdjust}
          className="px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-[11px] font-bold transition-colors cursor-pointer"
        >
          调整参数
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-2.5 py-1.5 rounded-lg text-stone-500 hover:bg-stone-100 text-[11px] font-bold transition-colors cursor-pointer"
        >
          取消
        </button>
      </div>
    )}
  </div>
);

const TaskCardView: React.FC<{ card: AgentTaskCard }> = ({ card }) => {
  const meta = {
    running: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B28C5A]" />, label: '执行中', tone: 'bg-amber-50 text-amber-700' },
    done: { icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />, label: '已完成', tone: 'bg-emerald-50 text-emerald-700' },
    failed: { icon: <XCircle className="w-3.5 h-3.5 text-rose-600" />, label: '失败', tone: 'bg-rose-50 text-rose-700' },
    cancelled: { icon: <Ban className="w-3.5 h-3.5 text-stone-500" />, label: '已终止', tone: 'bg-stone-200/70 text-stone-600' }
  }[card.status];
  return (
    <div className="mt-2.5 rounded-xl border border-[#E5E0D8] bg-[#FAF8F5] px-3 py-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#2C2A29] min-w-0">
          {meta.icon}
          <span className="truncate">{card.title}</span>
        </span>
        <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold ${meta.tone}`}>{meta.label}</span>
      </div>
      {card.detail && <p className="text-[10px] text-stone-500 leading-relaxed">{card.detail}</p>}
      {card.status === 'done' && card.resultImageUrl && (
        <a href={card.resultImageUrl} target="_blank" rel="noreferrer" className="block mt-1.5 rounded-lg overflow-hidden border border-[#E5E0D8] bg-white" title="查看大图">
          <img src={card.resultImageUrl} alt="结果图" className="w-full max-h-56 object-contain" />
        </a>
      )}
      {card.status === 'done' && card.locate && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('canvas:select-node', { detail: card.locate }))}
          className="mt-1 flex items-center gap-1 text-[10px] font-bold text-[#8C6F43] hover:text-[#B28C5A] cursor-pointer"
        >
          <Crosshair className="w-3 h-3" />
          在画布定位
        </button>
      )}
    </div>
  );
};

export const SuggestionChips: React.FC<{
  title?: string;
  options: AgentActionOption[];
  onChoose: (option: AgentActionOption) => void;
}> = ({ title = '下一步可做', options, onChoose }) => (
  <div className="mt-2.5 pt-2 border-t border-dashed border-[#E5E0D8] space-y-1.5">
    <span className="text-[10px] font-bold text-stone-400">{title}</span>
    <div className="flex flex-wrap gap-1.5">
      {options.map(option => (
        <button
          key={option.label}
          type="button"
          onClick={() => onChoose(option)}
          className="px-2.5 py-1 rounded-full bg-[#F9F5EF] hover:bg-[#F1E8DA] text-[#8C6F43] text-[11px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
        >
          {option.label}
          <ArrowRight className="w-3 h-3" />
        </button>
      ))}
    </div>
  </div>
);

/** 消息气泡内的结构化卡片：追问 / 计划 / 任务 / 下一步建议 */
export const AgentMessageCards: React.FC<AgentMessageCardsProps> = ({
  message,
  onChooseOption,
  onConfirmPlan,
  onCancelPlan,
  onAdjustPlan
}) => (
  <>
    {message.clarifyCard && (
      <ClarifyCardView card={message.clarifyCard} onChoose={option => onChooseOption(option, message.id)} />
    )}
    {message.planCard && (
      <PlanCardView
        card={message.planCard}
        onConfirm={() => onConfirmPlan(message.id, message.planCard!)}
        onCancel={() => onCancelPlan(message.id)}
        onAdjust={() => onAdjustPlan(message.planCard!)}
      />
    )}
    {message.taskCard && <TaskCardView card={message.taskCard} />}
    {message.suggestions && message.suggestions.length > 0 && (
      <SuggestionChips options={message.suggestions} onChoose={option => onChooseOption(option, message.id)} />
    )}
  </>
);
