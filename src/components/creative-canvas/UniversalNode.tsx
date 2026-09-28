import React from 'react';
import { NodeProps, Handle, Position } from '@xyflow/react';
import { WelcomeNode } from './WelcomeNode';
import { ProductImageNode } from './ProductImageNode';
import { ProductDnaNode } from './ProductDnaNode';
import { NineGridPlanNode } from './NineGridPlanNode';
import { ScenePlanNode } from './ScenePlanNode';
import { ImageGenerationNode } from './ImageGenerationNode';
import { GeneratedImageNode } from './GeneratedImageNode';
import { NoteNode } from './NoteNode';
import { WorkflowStageGroupNode } from './WorkflowStageGroupNode';
import { Sparkles, Trash2, Copy } from 'lucide-react';

/**
 * UniversalNode is an adaptive fallback & role-based dispatcher component.
 * It automatically inspects node data and delegates to the appropriate specialized node
 * component, preventing any React Flow error #003 (unregistered node type warnings).
 */
export const UniversalNode: React.FC<NodeProps> = (props) => {
  const data = (props.data || {}) as Record<string, any>;
  const type = String(props.type || '').toLowerCase();

  // 1. Check if node is a workflow stage group
  if (data.stage || type.includes('stage') || type.includes('group')) {
    return <WorkflowStageGroupNode {...(props as any)} />;
  }

  // 2. Check if node is product DNA
  if (data.dna || data.dnaCode || data.productDnaId || type.includes('dna')) {
    return <ProductDnaNode {...(props as any)} />;
  }

  // 3. Check if node is nine grid overall plan
  if (data.runId || data.themeTitle || (data.screens && Array.isArray(data.screens)) || type.includes('ninegrid') || type.includes('plan')) {
    if (!data.screenIndex && !data.screenTitle) {
      return <NineGridPlanNode {...(props as any)} />;
    }
  }

  // 4. Check if node is a generated image or generated image result
  if (data.imageUrl && (data.assetVersionId || data.score || data.version || data.screenRole || type.includes('generated') || type.includes('result'))) {
    return <GeneratedImageNode {...(props as any)} />;
  }

  // 5. Check if node is an image generation task
  if (data.taskId || data.promptSuggestion || type.includes('imagegeneration') || type.includes('generation')) {
    if (data.status === 'generating' || data.status === 'queued' || data.taskId) {
      return <ImageGenerationNode {...(props as any)} />;
    }
  }

  // 6. Check if node is a product image reference / uploaded main image
  if (
    props.id === 'img-node-1' ||
    type.includes('productimage') ||
    type.includes('product_image') ||
    (data.imageUrl && (data.fileName || data.uploadedAt || type.includes('image') || type.includes('hero')))
  ) {
    return <ProductImageNode {...(props as any)} />;
  }

  // 7. Check if node is a scene plan (such as productHero, lifestyle, feature, detailCallout, etc.)
  if (
    data.screenIndex !== undefined ||
    data.screenTitle ||
    data.coreSellingPoint ||
    type.includes('scene') ||
    type.includes('hero') ||
    type.includes('lifestyle') ||
    type.includes('feature') ||
    type.includes('detail') ||
    type.includes('material') ||
    type.includes('inspiration')
  ) {
    return <ScenePlanNode {...(props as any)} />;
  }

  // 8. Check if node is a note or text prompt
  if (data.text || data.content || type.includes('note') || type.includes('prompt')) {
    return <NoteNode {...(props as any)} />;
  }

  // 9. Check if node is welcome card
  if (type.includes('welcome')) {
    return <WelcomeNode {...(props as any)} />;
  }

  // 10. Fallback: Render a polished default card with standard handles and actions
  const title = String(data.title || data.name || data.label || props.id || '画布节点');
  const description = String(data.description || data.text || data.content || '自定义画布元素');

  return (
    <div
      className={`relative min-w-[260px] max-w-[340px] bg-white rounded-2xl p-4 shadow-lg border transition-all duration-200 ${
        props.selected
          ? 'border-[#B28C5A] ring-2 ring-[#B28C5A]/30 shadow-xl'
          : 'border-[#E5E0D8] hover:border-[#B28C5A]/60'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        className="w-3 h-3 bg-[#B28C5A] border-2 border-white -ml-1.5"
      />

      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-stone-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#FAF8F5] border border-[#E5E0D8] flex items-center justify-center text-[#8C6F43]">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <h3 className="font-serif font-bold text-sm text-[#2C2622] truncate max-w-[180px]">
            {title}
          </h3>
        </div>

        <div className="flex items-center gap-1">
          {data.onDuplicate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                data.onDuplicate?.();
              }}
              className="p-1 text-stone-400 hover:text-stone-700 rounded hover:bg-stone-100 transition-colors"
              title="复制节点"
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
              className="p-1 text-stone-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
              title="删除节点"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-stone-600 leading-relaxed break-words">
        {description}
      </p>

      <Handle
        type="source"
        position={Position.Right}
        id="source"
        className="w-3 h-3 bg-[#B28C5A] border-2 border-white -mr-1.5"
      />
    </div>
  );
};
