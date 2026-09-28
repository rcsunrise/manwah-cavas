import React, { useState } from 'react';
import { Handle, Position, NodeProps, NodeResizer } from '@xyflow/react';
import { ScenePlanNodeData } from '../../types/creativeCanvas';
import { Film, RefreshCw, ChevronRight, CheckCircle2, Trash2, Edit2, Check, Copy, ChevronUp, ChevronDown, Type, Maximize2, Minimize2 } from 'lucide-react';

export const ScenePlanNode: React.FC<NodeProps> = (props) => {
  const data = props.data as unknown as ScenePlanNodeData & {
    onDelete?: () => void;
    onDuplicate?: () => void;
    onUpdate?: (updated: Partial<ScenePlanNodeData>) => void;
    onToggleCollapse?: () => void;
  };
  const selected = props.selected;

  const [isEditing, setIsEditing] = useState(false);
  const [isFullExpanded, setIsFullExpanded] = useState(false);
  const [title, setTitle] = useState(data.screenTitle || '');
  const [sellingPoint, setSellingPoint] = useState(data.coreSellingPoint || '');
  const [composition, setComposition] = useState(data.visualComposition || '');
  const [lighting, setLighting] = useState(data.lightingAndAtmosphere || '');
  const [prompt, setPrompt] = useState(data.promptSuggestion || '');

  React.useEffect(() => {
    if (!isEditing) {
      setTitle(data.screenTitle || '');
      setSellingPoint(data.coreSellingPoint || '');
      setComposition(data.visualComposition || '');
      setLighting(data.lightingAndAtmosphere || '');
      setPrompt(data.promptSuggestion || '');
    }
  }, [data.screenTitle, data.coreSellingPoint, data.visualComposition, data.lightingAndAtmosphere, data.promptSuggestion, isEditing]);

  const isCollapsed = Boolean((data as any).ui?.collapsed);
  const formattedIndex = String(data.screenIndex || 1).padStart(2, '0');

  const handleSaveEdit = () => {
    setIsEditing(false);
    data.onUpdate?.({
      screenTitle: title,
      coreSellingPoint: sellingPoint,
      visualComposition: composition,
      lightingAndAtmosphere: lighting,
      promptSuggestion: prompt
    });
  };

  const toggleCollapse = () => {
    if (data.onToggleCollapse) {
      data.onToggleCollapse();
    } else {
      const currentUi = (data.ui as object) || {};
      data.onUpdate?.({
        ui: { ...currentUi, collapsed: !isCollapsed }
      } as any);
    }
  };

  return (
    <div
      style={(props as any).style}
      className={`relative ${isFullExpanded ? 'w-[460px]' : 'w-[340px]'} max-w-full bg-white rounded-2xl p-4 shadow-lg border transition-all duration-200 ${
        selected
          ? 'border-[#B28C5A] ring-2 ring-[#B28C5A]/30 shadow-xl'
          : 'border-[#E5E0D8] hover:border-[#B28C5A]/60'
      }`}
    >
      {selected && !isCollapsed && (
        <NodeResizer
          color="#B28C5A"
          isVisible={selected}
          minWidth={300}
          minHeight={180}
          maxWidth={720}
          maxHeight={900}
          handleStyle={{ width: 8, height: 8, borderRadius: 2 }}
        />
      )}

      <Handle
        type="target"
        position={Position.Top}
        id="target"
        className="!w-2.5 !h-2.5 !bg-[#B28C5A] !border-2 !border-white"
      />

      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[#E5E0D8]/60">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="w-6 h-6 rounded-md bg-[#B28C5A]/10 text-[#8C6F43] font-mono text-xs font-bold flex items-center justify-center shrink-0">
            {formattedIndex}
          </span>
          {isEditing ? (
            <input
              type="text"
              value={title}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => setTitle(e.target.value)}
              className="nodrag nopan w-full text-xs font-bold bg-[#FAF8F5] border border-[#B28C5A]/50 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-[#B28C5A]"
              placeholder="分镜标题..."
              autoFocus
            />
          ) : (
            <span
              onDoubleClick={() => setIsEditing(true)}
              className="font-semibold text-xs text-[#2C2622] truncate max-w-[150px] cursor-pointer hover:text-[#B28C5A]"
              title="双击快速编辑标题"
            >
              {title || data.screenTitle}
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded bg-[#FAF8F5] border border-[#E5E0D8] text-[10px] font-mono font-bold text-[#8C6F43] shrink-0">
            {data.aspectRatio || '4:3'}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsFullExpanded(!isFullExpanded);
            }}
            className={`p-1 rounded transition-colors ${
              isFullExpanded ? 'bg-[#B28C5A]/10 text-[#B28C5A]' : 'hover:bg-[#FAF8F5] text-stone-500 hover:text-[#B28C5A]'
            }`}
            title={isFullExpanded ? '恢复紧凑视图' : '全面展开企划内容'}
          >
            {isFullExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {isEditing ? (
            <button
              onClick={handleSaveEdit}
              className="p-1 rounded bg-[#B28C5A] text-white hover:bg-[#8C6F43] transition-colors"
              title="保存编辑"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="p-1 rounded hover:bg-[#FAF8F5] text-stone-500 hover:text-[#B28C5A] transition-colors"
              title="编辑分镜"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}

          {data.onDuplicate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onDuplicate?.();
              }}
              className="p-1 rounded hover:bg-[#FAF8F5] text-stone-500 hover:text-[#B28C5A] transition-colors"
              title="复制分镜"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}

          {data.onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onDelete?.();
              }}
              className="p-1 rounded hover:bg-rose-50 text-stone-400 hover:text-rose-600 transition-colors"
              title="删除分镜"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse();
            }}
            className="p-1 rounded hover:bg-stone-100 text-stone-500 hover:text-[#B28C5A] transition-colors"
            title={isCollapsed ? '展开节点' : '收起节点'}
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* C4A Version Bar */}
          <div className="flex items-center justify-between gap-1 text-[10px] font-mono mb-2 pb-1.5 border-b border-[#E5E0D8]/40">
            <span className="text-[#B28C5A] font-bold bg-[#FAF8F5] px-1.5 py-0.5 rounded border border-[#E5E0D8]/50">
              {data.assetSkuCode || `SKU-SCENE-${formattedIndex}`}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-stone-600 font-bold bg-stone-100 px-1.5 py-0.5 rounded">
                {data.assetVersionCode || 'V001'}
              </span>
              {data.productDnaVersionCode && (
                <span className="text-[#8C6F43] bg-[#B28C5A]/10 px-1.5 py-0.5 rounded border border-[#B28C5A]/20 font-bold" title={`Bound DNA Version: ${data.productDnaVersionId || ''}`}>
                  {data.productDnaVersionCode}
                </span>
              )}
              {data.parentVersionId && (
                <span className="text-amber-700 bg-amber-50 px-1 py-0.5 rounded border border-amber-200" title={`Parent Version ID: ${data.parentVersionId}`}>
                  P: {data.parentVersionId.slice(-4)}
                </span>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="space-y-2 text-xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-[#8C827A] uppercase block">画面目的 / 核心卖点</span>
                <button
                  type="button"
                  onClick={() => setIsFullExpanded(!isFullExpanded)}
                  className="text-[10px] text-[#B28C5A] hover:underline"
                >
                  {isFullExpanded ? '折叠' : '全面展开'}
                </button>
              </div>
              {isEditing ? (
                <textarea
                  value={sellingPoint}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => setSellingPoint(e.target.value)}
                  rows={isFullExpanded ? 5 : 3}
                  className="nodrag nopan w-full text-xs font-medium text-[#2C2622] bg-[#FAF8F5] border border-[#B28C5A]/50 rounded p-2 mt-0.5 outline-none focus:ring-1 focus:ring-[#B28C5A]"
                  placeholder="核心卖点..."
                />
              ) : (
                <p
                  onDoubleClick={() => setIsEditing(true)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`nodrag nopan text-[#2C2622] font-medium leading-relaxed mt-0.5 cursor-pointer hover:text-[#B28C5A] select-text ${
                    isFullExpanded ? 'whitespace-pre-wrap' : 'line-clamp-3'
                  }`}
                  title="双击编辑核心卖点，按住选择文字不触发拖拽"
                >
                  {sellingPoint || data.coreSellingPoint}
                </p>
              )}
            </div>

            <div className="bg-[#FAF8F5] p-2.5 rounded-lg border border-[#E5E0D8]/40 space-y-2">
              <div className="flex flex-col gap-0.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#8C827A] font-bold">构图视角：</span>
                  {isEditing && (
                    <div className="flex items-center gap-1">
                      {['45° 黄金视角', '正视图全景', '微距特写'].map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setComposition(p)}
                          className="px-1.5 py-0.5 rounded text-[9px] bg-white border border-[#E5E0D8] hover:border-[#B28C5A] text-[#8C827A] hover:text-[#B28C5A]"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <input
                    type="text"
                    value={composition}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => setComposition(e.target.value)}
                    className="nodrag nopan w-full text-[11px] bg-white border border-[#B28C5A]/50 rounded px-2 py-1 outline-none text-[#2C2622]"
                    placeholder="例如：45° 黄金视角，半身特写..."
                  />
                ) : (
                  <span
                    onDoubleClick={() => setIsEditing(true)}
                    className={`text-[#2C2622] font-medium cursor-pointer hover:text-[#B28C5A] ${isFullExpanded ? 'whitespace-pre-wrap' : 'truncate'}`}
                    title="双击直接编辑"
                  >
                    {composition || data.visualComposition || '未设置构图视角'}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-0.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#8C827A] font-bold">光影氛围：</span>
                  {isEditing && (
                    <div className="flex items-center gap-1">
                      {['落地窗柔光', '暮色温暖', '影棚高光'].map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setLighting(p)}
                          className="px-1.5 py-0.5 rounded text-[9px] bg-white border border-[#E5E0D8] hover:border-[#B28C5A] text-[#8C827A] hover:text-[#B28C5A]"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <input
                    type="text"
                    value={lighting}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => setLighting(e.target.value)}
                    className="nodrag nopan w-full text-[11px] bg-white border border-[#B28C5A]/50 rounded px-2 py-1 outline-none text-[#2C2622]"
                    placeholder="例如：清晨落地窗漫反射，柔和丁达尔光线..."
                  />
                ) : (
                  <span
                    onDoubleClick={() => setIsEditing(true)}
                    className={`text-[#2C2622] font-medium cursor-pointer hover:text-[#B28C5A] ${isFullExpanded ? 'whitespace-pre-wrap' : 'truncate'}`}
                    title="双击直接编辑"
                  >
                    {lighting || data.lightingAndAtmosphere || '未设置光影氛围'}
                  </span>
                )}
              </div>
            </div>

            <div>
              <span className="text-[10px] text-[#8C827A] block font-bold">生成提示词 (Prompt) 策划</span>
              {isEditing ? (
                <textarea
                  value={prompt}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={isFullExpanded ? 6 : 3}
                  className="nodrag nopan w-full font-mono text-[11px] bg-[#F9F5EF] border border-[#B28C5A]/50 rounded p-2 mt-0.5 outline-none focus:ring-1 focus:ring-[#B28C5A]"
                  placeholder="生成提示词..."
                />
              ) : (
                <p
                  onDoubleClick={() => setIsEditing(true)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`nodrag nopan text-[#625B54] font-mono text-[11px] bg-[#F9F5EF] p-2 rounded border border-[#E5E0D8]/50 mt-0.5 cursor-pointer hover:text-[#B28C5A] select-text leading-relaxed ${
                    isFullExpanded ? 'whitespace-pre-wrap break-words' : 'line-clamp-3'
                  }`}
                  title="双击编辑提示词，按住选择文字不触发拖拽"
                >
                  {prompt || data.promptSuggestion}
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-3 pt-2 border-t border-[#E5E0D8]/60 flex items-center justify-between text-xs">
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onReplanScene?.();
              }}
              className="flex items-center gap-1 text-[#8C827A] hover:text-[#B28C5A] transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>重新策划</span>
            </button>

            <div className="flex items-center gap-1.5">
              {data.onGenerateImage && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onGenerateImage?.();
                  }}
                  className="flex items-center gap-1 px-1.5 py-1 bg-[#FAF8F5] hover:bg-[#F2EDE4] text-[#8C6F43] border border-[#B28C5A]/30 rounded-md font-bold text-[10px] transition-all"
                  title="生成纯净底图 (无文字排版)"
                >
                  <Film className="w-3 h-3 text-[#B28C5A]" />
                  <span>生成底图</span>
                </button>
              )}

              {data.onGeneratePoster && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onGeneratePoster?.();
                  }}
                  className="flex items-center gap-1 px-2 py-1 bg-[#2C2A29] hover:bg-[#1A1818] text-white rounded-md font-bold text-[10px] transition-all shadow-xs"
                  title="生成带有文案排版的带字海报"
                >
                  <Type className="w-3 h-3 text-[#B28C5A]" />
                  <span>生成带字海报</span>
                </button>
              )}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onViewDetail?.();
              }}
              className="flex items-center gap-0.5 font-medium text-[#B28C5A] hover:text-[#8C6F43] transition-colors"
            >
              <span>详情</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id="source"
        className="!w-2.5 !h-2.5 !bg-[#B28C5A] !border-2 !border-white"
      />
    </div>
  );
};
