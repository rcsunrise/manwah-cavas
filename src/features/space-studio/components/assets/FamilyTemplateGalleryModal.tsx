import React, { useState, useEffect } from 'react';
import {
  X, Search, Sparkles, Layers, Users, Camera, Lock,
  Check, Copy, CheckCheck, Eye, Compass, ShieldCheck,
  Maximize2, ArrowRight, LayoutTemplate, Sliders, AlertTriangle
} from 'lucide-react';
import { FamilySceneTemplate, ModelAsset, FamilyRoleType } from '../../../../types/spaceAssetLibrary';
import { spaceAssetLibraryService } from '../../../../services/spaceAssetLibraryService';

interface FamilyTemplateGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTemplateId?: string;
  onApplyTemplate: (
    template: FamilySceneTemplate,
    compiledPrompt: { positivePrompt: string; negativePrompt: string }
  ) => void;
}

const ROLE_BADGES: Record<string, { label: string; color: string; border: string }> = {
  father: { label: '男主人', color: 'bg-blue-500/20 text-blue-300', border: 'border-blue-500/30' },
  mother: { label: '女主人', color: 'bg-rose-500/20 text-rose-300', border: 'border-rose-500/30' },
  grandfather: { label: '爷爷', color: 'bg-amber-500/20 text-amber-300', border: 'border-amber-500/30' },
  grandmother: { label: '奶奶', color: 'bg-purple-500/20 text-purple-300', border: 'border-purple-500/30' },
  daughter: { label: '混血女儿', color: 'bg-pink-500/20 text-pink-300', border: 'border-pink-500/30' },
  son: { label: '混血男孩', color: 'bg-emerald-500/20 text-emerald-300', border: 'border-emerald-500/30' },
};

export const FamilyTemplateGalleryModal: React.FC<FamilyTemplateGalleryModalProps> = ({
  isOpen,
  onClose,
  selectedTemplateId,
  onApplyTemplate,
}) => {
  const [templates, setTemplates] = useState<FamilySceneTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<FamilySceneTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | '贵族尊享' | '商企精英'>('all');
  const [activeWindowTab, setActiveWindowTab] = useState<'both' | 'win1' | 'win2'>('both');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  const loadTemplates = () => {
    const list = spaceAssetLibraryService.getFamilyTemplates();
    setTemplates(list);
    if (list.length > 0) {
      if (selectedTemplateId) {
        const found = list.find(t => t.templateId === selectedTemplateId);
        setSelectedTemplate(found || list[0]);
      } else if (!selectedTemplate) {
        setSelectedTemplate(list[0]);
      }
    }
  };

  if (!isOpen) return null;

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = 
      t.templateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.sceneCategory.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.spaceType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = typeFilter === 'all' || t.templateType === typeFilter;
    return matchesSearch && matchesType;
  });

  const compiledPromptData = selectedTemplate
    ? spaceAssetLibraryService.compileFamilyScenePrompt(selectedTemplate)
    : null;

  const handleCopyCompiledPrompt = () => {
    if (!compiledPromptData) return;
    const fullText = `=== 正向提示词 (Positive Prompt) ===\n${compiledPromptData.positivePrompt}\n\n=== 负向约束 (Negative Prompt) ===\n${compiledPromptData.negativePrompt}`;
    navigator.clipboard.writeText(fullText);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleConfirmApply = () => {
    if (selectedTemplate && compiledPromptData) {
      onApplyTemplate(selectedTemplate, {
        positivePrompt: compiledPromptData.positivePrompt,
        negativePrompt: compiledPromptData.negativePrompt
      });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-7xl h-[90vh] bg-[#12141d] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-neutral-200">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#161824]/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <LayoutTemplate className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  人物场景模板库 (Human Scene Template Library)
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                  双窗口参考 · 7 段结构化 Prompt 编译器
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                严禁保存大段随意 Prompt。窗口1基准场景 + 窗口2动态线稿与位置锁定 + 角色 Model DNA 强匹配。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Body Layout */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Panel: Template List */}
          <div className="w-[360px] shrink-0 flex flex-col border-r border-white/10 p-4 bg-[#141622] overflow-hidden">
            {/* Search & Tabs */}
            <div className="space-y-2 mb-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="搜索模板名称、场景类别或标签..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/60"
                />
              </div>

              <div className="flex items-center gap-1">
                {[
                  { id: 'all', label: '全部模板' },
                  { id: '贵族尊享', label: '贵族尊享' },
                  { id: '商企精英', label: '商企精英' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setTypeFilter(tab.id as any)}
                    className={`px-3 py-1 rounded-lg text-xs transition-all ${
                      typeFilter === tab.id
                        ? 'bg-amber-500 text-black font-bold shadow'
                        : 'bg-black/30 text-neutral-400 hover:text-white border border-white/5'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Template List Cards */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-3">
              {filteredTemplates.map(template => {
                const isActive = selectedTemplate?.templateId === template.templateId;
                const isCurrentSelected = selectedTemplateId === template.templateId;

                return (
                  <div
                    key={template.templateId}
                    onClick={() => setSelectedTemplate(template)}
                    className={`group relative rounded-2xl p-3 border cursor-pointer transition-all duration-200 flex flex-col gap-2.5 ${
                      isActive
                        ? 'bg-[#1e202f] border-amber-500 shadow-xl ring-1 ring-amber-500/40'
                        : isCurrentSelected
                        ? 'bg-[#181a26] border-amber-500/60'
                        : 'bg-[#161824] border-white/5 hover:border-white/20 hover:bg-[#1a1c2a]'
                    }`}
                  >
                    {/* Header Title & Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            {template.templateType}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 font-mono border border-purple-500/30">
                            {template.characterCount} 人阵容
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
                          {template.templateName}
                        </h4>
                      </div>
                      {isCurrentSelected && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500 text-black font-bold shrink-0">
                          已应用
                        </span>
                      )}
                    </div>

                    {/* Dual Thumbnail Mini Preview */}
                    <div className="grid grid-cols-2 gap-1.5 h-20 rounded-xl overflow-hidden bg-black/60 border border-white/10 p-1">
                      <div className="relative rounded-lg overflow-hidden h-full">
                        <img src={template.window1SceneRef.imageUrl} alt="win1" className="w-full h-full object-cover" />
                        <div className="absolute top-1 left-1 text-[8px] bg-black/70 px-1 py-0.2 rounded text-amber-300 font-bold">
                          窗口1 场景
                        </div>
                      </div>
                      <div className="relative rounded-lg overflow-hidden h-full">
                        <img src={template.window2WireframeRef.imageUrl} alt="win2" className="w-full h-full object-cover" />
                        <div className="absolute top-1 left-1 text-[8px] bg-black/70 px-1 py-0.2 rounded text-cyan-300 font-bold">
                          窗口2 线稿
                        </div>
                      </div>
                    </div>

                    {/* Role Bindings Pills */}
                    <div className="flex flex-wrap gap-1">
                      {template.roleBindings.map((role, idx) => {
                        const badge = ROLE_BADGES[role] || { label: role, color: 'bg-white/10 text-neutral-300', border: 'border-white/10' };
                        return (
                          <span key={idx} className={`text-[9px] px-1.5 py-0.2 rounded font-medium border ${badge.color} ${badge.border}`}>
                            {badge.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Template Deep Inspector & Dual Window Visualizer */}
          {selectedTemplate && compiledPromptData ? (
            <div className="flex-1 flex flex-col bg-[#12141c] overflow-hidden">
              
              {/* Template Header Spec Bar */}
              <div className="px-6 py-3.5 border-b border-white/10 bg-[#161824]/80 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">
                      {selectedTemplate.templateName}
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                      ID: {selectedTemplate.templateId}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-neutral-400 mt-1">
                    <span>空间: <strong className="text-neutral-200 font-normal">{selectedTemplate.spaceType}</strong></span>
                    <span>·</span>
                    <span>镜头: <strong className="text-neutral-200 font-normal">{selectedTemplate.cameraLens}</strong></span>
                    <span>·</span>
                    <span>人数: <strong className="text-amber-300 font-normal">{selectedTemplate.characterCount} 位家庭角色</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCopyCompiledPrompt}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-neutral-300 hover:text-white transition-all"
                  >
                    {copiedPrompt ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
                    <span>{copiedPrompt ? '已复制 Prompt' : '复制 7 段 Prompt'}</span>
                  </button>
                  <button
                    onClick={handleConfirmApply}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-xs font-bold shadow-lg shadow-amber-500/20 transition-all"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    <span>应用此人物场景模板</span>
                  </button>
                </div>
              </div>

              {/* Scrollable Inspector Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* 1. Dual-Window Visualizer Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Compass className="w-4 h-4 text-amber-400" />
                      <h4 className="text-xs font-bold text-white tracking-wide">
                        双窗口基准参考 (Window 1 vs Window 2)
                      </h4>
                    </div>

                    <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                      {[
                        { id: 'both', label: '双窗口并排' },
                        { id: 'win1', label: '仅窗口1 场景' },
                        { id: 'win2', label: '仅窗口2 线稿与位置' },
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveWindowTab(tab.id as any)}
                          className={`px-2.5 py-0.5 rounded text-[10px] font-medium transition-all ${
                            activeWindowTab === tab.id
                              ? 'bg-amber-500 text-black font-bold shadow'
                              : 'text-neutral-400 hover:text-white'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dual Window Grid */}
                  <div className={`grid gap-4 ${activeWindowTab === 'both' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    
                    {/* Window 1 */}
                    {(activeWindowTab === 'both' || activeWindowTab === 'win1') && (
                      <div className="rounded-2xl overflow-hidden bg-[#161824] border border-amber-500/30 shadow-xl flex flex-col">
                        <div className="px-3.5 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5" />
                            <span>{selectedTemplate.window1SceneRef.title}</span>
                          </span>
                          <span className="text-[10px] text-amber-400/80 font-mono">空间·家具·硬装真值</span>
                        </div>
                        <div className="relative aspect-[16/10] bg-black/80 overflow-hidden group">
                          <img
                            src={selectedTemplate.window1SceneRef.imageUrl}
                            alt="Window 1"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                          <div className="absolute bottom-2.5 left-2.5 right-2.5 text-[11px] text-neutral-300 bg-black/60 backdrop-blur-md p-2 rounded-lg border border-white/10">
                            {selectedTemplate.window1SceneRef.description}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Window 2 */}
                    {(activeWindowTab === 'both' || activeWindowTab === 'win2') && (
                      <div className="rounded-2xl overflow-hidden bg-[#161824] border border-cyan-500/30 shadow-xl flex flex-col">
                        <div className="px-3.5 py-2 bg-cyan-500/10 border-b border-cyan-500/20 flex items-center justify-between">
                          <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" />
                            <span>{selectedTemplate.window2WireframeRef.title}</span>
                          </span>
                          <span className="text-[10px] text-cyan-400/80 font-mono">线稿·坐标·姿态锁定</span>
                        </div>
                        <div className="relative aspect-[16/10] bg-black/80 overflow-hidden group">
                          <img
                            src={selectedTemplate.window2WireframeRef.imageUrl}
                            alt="Window 2"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                          <div className="absolute bottom-2.5 left-2.5 right-2.5 text-[11px] text-neutral-300 bg-black/60 backdrop-blur-md p-2 rounded-lg border border-white/10">
                            {selectedTemplate.window2WireframeRef.description}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Structured Character Positioning & Action Rules Table */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-purple-400" />
                      <h4 className="text-xs font-bold text-white tracking-wide">
                        家庭角色位置与姿态规则清单 (严格服从窗口2)
                      </h4>
                    </div>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="flex items-center gap-1 text-emerald-400 font-medium">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>禁止新增多余人物: 已强制锁定</span>
                      </span>
                      <span className="flex items-center gap-1 text-purple-400 font-medium">
                        <Lock className="w-3.5 h-3.5" />
                        <span>位置图坐标锁定: 100% 吻合</span>
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-[#161824] border border-white/10 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-black/40 border-b border-white/10 text-neutral-400 text-[11px]">
                        <tr>
                          <th className="p-3 font-semibold w-28">家庭角色</th>
                          <th className="p-3 font-semibold w-48">空间锚定位置</th>
                          <th className="p-3 font-semibold">姿态与动作规则</th>
                          <th className="p-3 font-semibold w-48">互动关系</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-[11px]">
                        {selectedTemplate.characterPositionRules.map((rule, idx) => {
                          const badge = ROLE_BADGES[rule.role] || { label: rule.roleName, color: 'bg-white/10 text-neutral-300', border: 'border-white/10' };
                          return (
                            <tr key={idx} className="hover:bg-white/5 transition-colors">
                              <td className="p-3">
                                <span className={`inline-block px-2 py-0.5 rounded font-bold border ${badge.color} ${badge.border}`}>
                                  {rule.roleName}
                                </span>
                              </td>
                              <td className="p-3 font-mono text-neutral-200">
                                {rule.position}
                              </td>
                              <td className="p-3 text-neutral-300 leading-relaxed">
                                {rule.action}
                              </td>
                              <td className="p-3 text-purple-300/90">
                                {rule.interaction || '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3. 7-Stage Structured Prompt Live Compiler */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <h4 className="text-xs font-bold text-white tracking-wide">
                        7 段式工业级提示词装配结构 (Compiled Prompt Blueprint)
                      </h4>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-[#171924] border border-white/10 space-y-1">
                      <span className="text-[10px] text-amber-400 font-mono font-bold block">
                        Stage 1: 基础场景与空间家具 (Base Scene & Space)
                      </span>
                      <p className="text-[11px] text-neutral-300 leading-relaxed font-mono">
                        {compiledPromptData.sections.baseScene}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-[#171924] border border-white/10 space-y-1">
                      <span className="text-[10px] text-purple-400 font-mono font-bold block">
                        Stage 2: 角色绑定与 Model DNA (Role Bindings)
                      </span>
                      <p className="text-[11px] text-neutral-300 leading-relaxed font-mono whitespace-pre-line">
                        {compiledPromptData.sections.roleBindings}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-[#171924] border border-white/10 space-y-1">
                      <span className="text-[10px] text-cyan-400 font-mono font-bold block">
                        Stage 3: 姿态与动作线稿 (Poses & Actions)
                      </span>
                      <p className="text-[11px] text-neutral-300 leading-relaxed font-mono">
                        {compiledPromptData.sections.posesAndActions}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-[#171924] border border-white/10 space-y-1">
                      <span className="text-[10px] text-emerald-400 font-mono font-bold block">
                        Stage 4: 人物位置约束与零漂移 (Spatial Coordinates)
                      </span>
                      <p className="text-[11px] text-neutral-300 leading-relaxed font-mono">
                        {compiledPromptData.sections.spatialConstraints}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-[#171924] border border-white/10 space-y-1">
                      <span className="text-[10px] text-amber-300 font-mono font-bold block">
                        Stage 5: 空间光线与道具 (Lighting & Props)
                      </span>
                      <p className="text-[11px] text-neutral-300 leading-relaxed font-mono">
                        {compiledPromptData.sections.lightingAndProps}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-[#171924] border border-white/10 space-y-1">
                      <span className="text-[10px] text-blue-400 font-mono font-bold block">
                        Stage 6: 输出摄影规格 (Master Photography Spec)
                      </span>
                      <p className="text-[11px] text-neutral-300 leading-relaxed font-mono">
                        {compiledPromptData.sections.renderStyle}
                      </p>
                    </div>
                  </div>

                  {/* Negative Constraints Full Box */}
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-1 text-xs">
                    <span className="text-[10px] text-rose-300 font-mono font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Stage 7: 严格负面约束 (Strict Negative Constraints)</span>
                    </span>
                    <p className="text-[11px] text-rose-200/90 leading-relaxed font-mono">
                      {compiledPromptData.negativePrompt}
                    </p>
                  </div>
                </div>

              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-neutral-500">
              <LayoutTemplate className="w-12 h-12 stroke-[1] mb-2 text-neutral-600" />
              <p className="text-sm">请从左侧选择一个人物场景模板</p>
            </div>
          )}
        </div>

        {/* Bottom Footer Toolbar */}
        <div className="px-6 py-3 border-t border-white/10 bg-[#171924] flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-4">
            <span className="text-amber-400 font-mono">
              ★ 3 大核心人物场景模板就绪 (4人客厅 / 6人三代同堂客厅 / 6人餐桌家宴)
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white transition-all font-medium"
            >
              取消
            </button>
            <button
              onClick={handleConfirmApply}
              className="px-5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold shadow-lg shadow-amber-500/20 transition-all flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>应用当前模板到摄影工程</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
