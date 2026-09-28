// src/features/space-studio/components/DesignPhasePanel.tsx
// MANWAH Space Studio ➔ Poster Studio 营销海报排版集成面板 V6.0
// 职责：
// 1. 衔接 03 HUMAN 阶段生成的精修镜头，支持一键转化为电商海报套件 (NineScreenPlan 与 PosterComposition)。
// 2. 提供文案调优、主副标定制、海报模板快速切换 (Editorial, Feature Cards, Function Demo, Lifestyle)。
// 3. 支持无缝一键载入到 Poster Studio 编辑画布，继续使用文字自由拖拽、排版调整与打样导出。

import React, { useState } from 'react';
import { ShotInstance, ProductAsset, SpacePreset } from '../../../types/spaceStudio';
import { SpaceToPosterAdapter } from '../adapters/spaceToPosterAdapter';
import { POSTER_TEMPLATES } from '../../../config/posterTemplates';
import { TemplateId } from '../../../types/posterTemplate';
import {
  Palette,
  Sparkles,
  ArrowRight,
  LayoutTemplate,
  FileText,
  CheckCircle2,
  Image as ImageIcon,
  ShieldCheck,
  Zap,
  Sliders,
  AlertTriangle
} from 'lucide-react';

interface DesignPhasePanelProps {
  activeShot: ShotInstance;
  product: ProductAsset;
  spacePreset: SpacePreset;
  onHandoffToPoster: (screenIndex?: number, customTemplateId?: TemplateId) => void;
}

export const DesignPhasePanel: React.FC<DesignPhasePanelProps> = ({
  activeShot,
  product,
  spacePreset,
  onHandoffToPoster
}) => {
  const { role, templateId: defaultTemplateId, defaultIndex } = SpaceToPosterAdapter.mapShotToPosterRole(activeShot);
  const [selectedTemplateId, setSelectedTemplateId] = useState<TemplateId>(defaultTemplateId);
  const [targetScreenIndex, setTargetScreenIndex] = useState<number>(defaultIndex);

  // 获得适配好的单屏草案预览
  const draftScreen = SpaceToPosterAdapter.convertShotToScreenItem({
    shot: activeShot,
    product,
    spacePreset,
    screenIndex: targetScreenIndex
  });

  const availableTemplates = Object.entries(POSTER_TEMPLATES).map(([id, t]) => ({
    id: id as TemplateId,
    name: t.name,
    description: t.description
  }));

  // 严格 Gate 门禁校验：Human / Shot Revision 未通过，禁止进入正式 Poster 输出
  const hasApprovedAsset =
    (activeShot.status === 'passed' && (activeShot.revisions?.[0]?.imageUrl || draftScreen.sourceImageUrl)) ||
    activeShot.revisions?.some((r) => r.status === 'approved' && !!r.imageUrl);

  return (
    <div className="flex flex-col h-full bg-white select-none">
      {/* 顶部标题栏 */}
      <div className="p-4 border-b border-[#EBE7E0] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-amber-600" />
          <span className="text-xs font-bold text-stone-800 tracking-wider">
            04 DESIGN 营销海报排版
          </span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-amber-50 text-amber-800 border border-amber-200">
          Poster Studio 互通
        </span>
      </div>

      {/* 主体滚动区 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* 镜头来源与状态卡片 */}
        <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#E5E0D8] space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-stone-800 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-stone-500" />
              <span>当前输入镜头</span>
            </span>
            <span className="font-mono text-amber-800 font-bold px-1.5 py-0.5 rounded bg-amber-100 text-[10px]">
              {activeShot.templateCode}
            </span>
          </div>
          <p className="text-[11px] text-stone-600">
            {activeShot.name} · {activeShot.hasHumanPass ? '模特/家庭植入就绪' : '空间空景基准'}
          </p>
          <div className="flex items-center gap-2 text-[10px] text-stone-500 font-mono">
            <span>分辨率: 2100×2800 (3:4)</span>
            <span>•</span>
            <span>过审状态: {activeShot.status === 'passed' ? '已过审' : '审核通过'}</span>
          </div>
        </div>

        {/* 目标海报屏位与角色映射 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-stone-800">目标海报屏位</span>
            <span className="text-[10px] text-stone-400 font-mono">1~9 SCREEN PLAN</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((idx) => {
              const isSelected = targetScreenIndex === idx;
              const isRecommended = defaultIndex === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setTargetScreenIndex(idx)}
                  className={`p-2 rounded-lg text-left border transition relative ${
                    isSelected
                      ? 'bg-amber-500 text-stone-950 border-amber-600 font-bold shadow-xs'
                      : 'bg-[#FAF8F5] hover:bg-stone-100 text-stone-700 border-stone-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span>第 0{idx} 屏</span>
                    {isRecommended && (
                      <span className={`text-[8px] px-1 py-0.2 rounded ${isSelected ? 'bg-stone-900 text-amber-300' : 'bg-amber-100 text-amber-800'}`}>
                        推荐
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 海报模版快速切换 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-stone-800 flex items-center gap-1.5">
              <LayoutTemplate className="w-3.5 h-3.5 text-stone-500" />
              <span>排版布局模版</span>
            </span>
          </div>
          <div className="space-y-1.5">
            {availableTemplates.slice(0, 4).map((tmpl) => {
              const isSel = selectedTemplateId === tmpl.id;
              return (
                <button
                  key={tmpl.id}
                  onClick={() => setSelectedTemplateId(tmpl.id)}
                  className={`w-full p-2.5 rounded-xl text-left border transition flex items-center justify-between ${
                    isSel
                      ? 'bg-amber-50/80 border-amber-500 ring-1 ring-amber-500/20 text-stone-900'
                      : 'bg-[#FAF8F5] border-stone-200 hover:border-stone-300 text-stone-700'
                  }`}
                >
                  <div>
                    <div className="font-medium text-xs">{tmpl.name}</div>
                    <div className="text-[10px] text-stone-400 line-clamp-1">{tmpl.description}</div>
                  </div>
                  {isSel && <CheckCircle2 className="w-4 h-4 text-amber-600" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 自动文案预览 */}
        <div className="space-y-2">
          <span className="font-semibold text-stone-800 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-stone-500" />
            <span>智能适配文案</span>
          </span>
          <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2 text-[11px]">
            <div>
              <div className="text-[10px] text-stone-400">主标题 (Headline)</div>
              <div className="font-bold text-stone-800 text-xs mt-0.5">{draftScreen.headline}</div>
            </div>
            <div>
              <div className="text-[10px] text-stone-400">副标题 (Subheadline)</div>
              <div className="text-stone-700 mt-0.5">{draftScreen.subheadline}</div>
            </div>
            <div>
              <div className="text-[10px] text-stone-400">核心卖点点阵 (Key Points)</div>
              <ul className="list-disc list-inside text-stone-600 mt-1 space-y-0.5 text-[10px]">
                {draftScreen.points?.map((pt, i) => (
                  <li key={i}>{pt}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 底部一键转送动作栏 */}
      <div className="p-4 border-t border-[#EBE7E0] bg-[#FAF8F5] space-y-2 shrink-0">
        {!hasApprovedAsset && (
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 text-[10px] leading-relaxed flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
            <span>
              门禁拦截：当前镜头尚未通过审核或尚未生成有效视觉资产。按第一性原理，禁止空载或未过审资产导入海报工作台。
            </span>
          </div>
        )}

        <button
          onClick={() => onHandoffToPoster(targetScreenIndex, selectedTemplateId)}
          disabled={!hasApprovedAsset}
          className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 disabled:cursor-not-allowed text-amber-300 font-medium rounded-xl text-xs shadow-md transition flex items-center justify-center gap-2 active:scale-98"
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>一键载入 Poster Studio 进行排版</span>
          <ArrowRight className="w-3.5 h-3.5 text-amber-300" />
        </button>
        <p className="text-[10px] text-stone-500 text-center leading-relaxed">
          将携带高质量空间渲染图、人体工学文案与分层图层无缝进入海报工作台。
        </p>
      </div>
    </div>
  );
};
