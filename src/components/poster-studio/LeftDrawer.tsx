// src/components/poster-studio/LeftDrawer.tsx
import React, { useState } from 'react';
import {
  Package,
  LayoutTemplate,
  FileText,
  Image as ImageIcon,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Upload,
  Plus,
  Check,
  Sparkles
} from 'lucide-react';
import { POSTER_TEMPLATES } from '../../config/posterTemplates';
import { TemplateId, PosterCompositionSnapshot } from '../../types/posterTemplate';
import { PlanScreenItem } from '../../services/posterStudioService';

interface LeftDrawerProps {
  activeScreen: PlanScreenItem;
  activeComposition: PosterCompositionSnapshot;
  onUpdateComposition: (updated: PosterCompositionSnapshot) => void;
  onUpdatePlan: (updates: Partial<PlanScreenItem>) => void;
  onUploadProductPhoto: (file: File) => void;
  onSwitchTemplate: (templateId: TemplateId) => void;
}

type TabKey = 'product' | 'template' | 'copy' | 'assets' | 'layout';

export const LeftDrawer: React.FC<LeftDrawerProps> = ({
  activeScreen,
  activeComposition,
  onUpdateComposition,
  onUpdatePlan,
  onUploadProductPhoto,
  onSwitchTemplate
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<TabKey>('template');

  const navButtons = [
    { key: 'template' as TabKey, label: '模板库', icon: LayoutTemplate },
    { key: 'product' as TabKey, label: '商品', icon: Package },
    { key: 'copy' as TabKey, label: '文案', icon: FileText },
    { key: 'assets' as TabKey, label: '素材', icon: ImageIcon },
    { key: 'layout' as TabKey, label: '版面', icon: Sliders }
  ];

  return (
    <div className="relative flex h-full select-none z-30">
      {/* Icon Dock */}
      <div className="w-14 bg-stone-950 border-r border-stone-800 flex flex-col items-center py-4 gap-4 shrink-0">
        {navButtons.map((btn) => {
          const Icon = btn.icon;
          const isActive = activeTab === btn.key && isOpen;
          return (
            <button
              key={btn.key}
              onClick={() => {
                if (activeTab === btn.key && isOpen) {
                  setIsOpen(false);
                } else {
                  setActiveTab(btn.key);
                  setIsOpen(true);
                }
              }}
              className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center gap-1 transition ${
                isActive
                  ? 'bg-amber-600/30 text-amber-400 border border-amber-500/50'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
              }`}
              title={btn.label}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[9px] scale-90">{btn.label}</span>
            </button>
          );
        })}
      </div>

      {/* Expandable Content Panel */}
      {isOpen && (
        <div className="w-80 bg-stone-900 border-r border-stone-800 flex flex-col h-full overflow-hidden animate-in slide-in-from-left duration-200">
          {/* Header */}
          <div className="px-4 py-3 border-b border-stone-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
              {navButtons.find((b) => b.key === activeTab)?.label}
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-stone-400 hover:text-stone-200 rounded"
              title="收起面板"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Panel Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {/* 1. TEMPLATES TAB */}
            {activeTab === 'template' && (
              <div className="space-y-3">
                <p className="text-stone-400">
                  当前屏：<span className="text-amber-400 font-semibold">{activeScreen.screenTitle}</span>
                </p>
                <div className="space-y-2">
                  {Object.values(POSTER_TEMPLATES).map((tmpl) => {
                    const isCurrent = activeComposition.templateId === tmpl.templateId;
                    return (
                      <div
                        key={tmpl.templateId}
                        onClick={() => onSwitchTemplate(tmpl.templateId)}
                        className={`p-3 rounded-xl cursor-pointer border transition ${
                          isCurrent
                            ? 'bg-stone-800 border-amber-500 ring-1 ring-amber-500/40 text-white'
                            : 'bg-stone-950/60 border-stone-800 hover:border-stone-700 text-stone-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-sm text-stone-200">{tmpl.name}</span>
                          {isCurrent && <Check className="w-4 h-4 text-amber-400" />}
                        </div>
                        <p className="text-[11px] text-stone-400 line-clamp-2">{tmpl.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. PRODUCT TAB */}
            {activeTab === 'product' && (
              <div className="space-y-4 text-stone-300">
                <div>
                  <label className="block text-stone-400 mb-1 font-semibold">产品名称</label>
                  <input
                    type="text"
                    defaultValue="MANWAH 智能电动功能沙发"
                    className="w-full bg-stone-950 border border-stone-700 rounded px-2.5 py-1.5 text-white outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-stone-400 mb-1 font-semibold">上传产品实拍/白底图</label>
                  <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-stone-700 hover:border-amber-500 rounded-xl cursor-pointer bg-stone-950/50 transition">
                    <Upload className="w-6 h-6 text-amber-500 mb-1" />
                    <span className="text-[11px] text-stone-300 font-medium">点击或拖拽上传</span>
                    <span className="text-[9px] text-stone-500 mt-0.5">保持原图真实宽高比，绝不拉伸</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onUploadProductPhoto(f);
                      }}
                    />
                  </label>
                </div>
              </div>
            )}

            {/* 3. COPY TAB */}
            {activeTab === 'copy' && (
              <div className="space-y-4 text-stone-300">
                <div>
                  <label className="block text-stone-400 mb-1 font-semibold">主标题 (Headline)</label>
                  <textarea
                    value={activeScreen.headline}
                    onChange={(e) => onUpdatePlan({ headline: e.target.value })}
                    rows={2}
                    className="w-full bg-stone-950 border border-stone-700 rounded px-2.5 py-1.5 text-white outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-stone-400 mb-1 font-semibold">副标题 (Subheadline)</label>
                  <textarea
                    value={activeScreen.subheadline}
                    onChange={(e) => onUpdatePlan({ subheadline: e.target.value })}
                    rows={2}
                    className="w-full bg-stone-950 border border-stone-700 rounded px-2.5 py-1.5 text-white outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-stone-400 mb-1 font-semibold">正文详情 (Body)</label>
                  <textarea
                    value={activeScreen.body}
                    onChange={(e) => onUpdatePlan({ body: e.target.value })}
                    rows={4}
                    className="w-full bg-stone-950 border border-stone-700 rounded px-2.5 py-1.5 text-white outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            )}

            {/* 4. ASSETS TAB */}
            {activeTab === 'assets' && (
              <div className="space-y-3">
                <p className="text-stone-400">已关联素材图库</p>
                {activeComposition.imageLayers.map((layer, idx) => (
                  <div key={layer.id} className="bg-stone-950 p-2 rounded border border-stone-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-stone-300">图层 #{idx + 1}</span>
                      <span className="text-[10px] text-amber-400 uppercase">{layer.fitMode}</span>
                    </div>
                    {layer.imageUrl && (
                      <div className="w-full h-24 bg-stone-900 rounded overflow-hidden">
                        <img
                          src={layer.imageUrl}
                          alt="Asset"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 5. LAYOUT TAB */}
            {activeTab === 'layout' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-stone-400 mb-2 font-semibold">海报背景底色</label>
                  <div className="flex items-center gap-2">
                    {['#F7F4EF', '#FFFFFF', '#F0EDE6', '#1A1817'].map((c) => (
                      <button
                        key={c}
                        onClick={() => onUpdateComposition({ ...activeComposition, backgroundColor: c })}
                        className={`w-8 h-8 rounded-lg border-2 ${
                          activeComposition.backgroundColor === c
                            ? 'border-amber-500 scale-110'
                            : 'border-stone-700'
                        }`}
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
