import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  ReactFlowInstance
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { WelcomeNode } from './WelcomeNode';
import { ProductImageNode } from './ProductImageNode';
import { ProductDnaNode } from './ProductDnaNode';
import { NineGridPlanNode } from './NineGridPlanNode';
import { ScenePlanNode } from './ScenePlanNode';
import { ImageGenerationNode } from './ImageGenerationNode';
import { GeneratedImageNode } from './GeneratedImageNode';
import { NoteNode } from './NoteNode';
import { WorkflowStageGroupNode } from './WorkflowStageGroupNode';
import { UniversalNode } from './UniversalNode';
import { VideoCreationNode } from './video/VideoCreationNode';
import { VideoGenerationNode } from './video/VideoGenerationNode';
import { VideoResultNode } from './video/VideoResultNode';
import { CanvasToolbar } from './CanvasToolbar';
import { CheckSquare, Square, Trash2, Copy, X, Upload, Sparkles, Film, Type } from 'lucide-react';

interface CanvasWorkspaceProps {
  workspaceId?: string;
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onNodeClick?: (event: React.MouseEvent, node: Node) => void;
  selectedNodeId?: string | null;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onDeleteSelected?: () => void;
  onDuplicateSelected?: () => void;
  onAddCustomNode?: (kind: 'note' | 'scene' | 'prompt' | 'image') => void;
  onUploadFile?: (file: File) => void;
  onAutoLayoutNodes?: () => void;
  onGrid3x3Layout?: (selectedOnly?: boolean) => void;
  onSeamlessLayout?: (selectedOnly?: boolean) => void;
  onGenerateSceneImage?: (
    screenIndex: number,
    reviewFeedback?: string,
    overrideModel?: string,
    overrideResolution?: '1K' | '2K' | '4K',
    withText?: boolean
  ) => void;
  onOpenVideoPanel?: (node: Node) => void;
  selectedModel?: string;
  setSelectedModel?: (model: string) => void;
  selectedResolution?: '1K' | '2K' | '4K';
  setSelectedResolution?: (res: '1K' | '2K' | '4K') => void;
}

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNodeClick,
  selectedNodeId,
  onSelectAll,
  onClearSelection,
  onDeleteSelected,
  onDuplicateSelected,
  onAddCustomNode,
  onUploadFile,
  onAutoLayoutNodes,
  onGrid3x3Layout,
  onSeamlessLayout,
  onGenerateSceneImage,
  onOpenVideoPanel,
  selectedModel,
  setSelectedModel,
  selectedResolution,
  setSelectedResolution
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isCanvasDragging, setIsCanvasDragging] = useState<boolean>(false);
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);
  const [isMouseDown, setIsMouseDown] = useState<boolean>(false);
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);

  const [renderModel, setRenderModel] = useState<string>(selectedModel || 'openai/gpt-image-2-c');
  const [renderRes, setRenderRes] = useState<'1K' | '2K' | '4K'>(selectedResolution || '2K');
  const [renderWithText, setRenderWithText] = useState<boolean>(true);

  useEffect(() => {
    if (selectedModel) setRenderModel(selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    if (selectedResolution) setRenderRes(selectedResolution);
  }, [selectedResolution]);

  const selectedCount = useMemo(() => nodes.filter(n => n.selected).length, [nodes]);
  const totalNodesCount = nodes.length;

  const selectedTargetNode = useMemo(() => {
    return nodes.find(n => n.selected || n.id === selectedNodeId);
  }, [nodes, selectedNodeId]);

  const targetSceneIdx = useMemo(() => {
    if (!selectedTargetNode) return null;
    const d = selectedTargetNode.data as any;
    if (!d) return null;
    const idx = d.sceneIndex || d.screenIndex;
    return idx ? Number(idx) : null;
  }, [selectedTargetNode]);

  const toolbarStyle = useMemo<React.CSSProperties>(() => {
    if (selectedCount === 0 || !selectedTargetNode) {
      return {
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)'
      };
    }

    try {
      const vp = rfInstanceRef.current ? rfInstanceRef.current.getViewport() : { x: 0, y: 0, zoom: zoomLevel || 1 };
      const nodeX = selectedTargetNode.position?.x ?? 0;
      const nodeY = selectedTargetNode.position?.y ?? 0;
      const nodeWidth = (selectedTargetNode.measured?.width || (selectedTargetNode as any).width || 340);

      // Node center-top position in viewport screen coordinates
      const screenX = nodeX * vp.zoom + vp.x + (nodeWidth * vp.zoom) / 2;
      const screenY = nodeY * vp.zoom + vp.y - 14;

      const minX = 260;
      const maxX = (typeof window !== 'undefined' ? window.innerWidth : 1200) - 260;
      const safeX = Math.max(minX, Math.min(maxX, screenX));
      const safeY = Math.max(64, screenY);

      return {
        top: `${safeY}px`,
        left: `${safeX}px`,
        transform: 'translate(-50%, -100%)'
      };
    } catch {
      return {
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)'
      };
    }
  }, [selectedCount, selectedTargetNode, zoomLevel]);

  const [isToolbarVisible, setIsToolbarVisible] = useState(false);
  const floatingToolbarRef = useRef<HTMLDivElement>(null);
  const toolbarTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startHideTimer = useCallback((delayMs: number = 3000) => {
    if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current);
    toolbarTimerRef.current = setTimeout(() => {
      setIsToolbarVisible(false);
    }, delayMs);
  }, []);

  const handleMouseEnterToolbar = useCallback(() => {
    setIsToolbarVisible(true);
    if (toolbarTimerRef.current) {
      clearTimeout(toolbarTimerRef.current);
      toolbarTimerRef.current = null;
    }
  }, []);

  const handleMouseLeaveToolbar = useCallback(() => {
    startHideTimer(3000);
  }, [startHideTimer]);

  useEffect(() => {
    if (selectedCount > 0) {
      setIsToolbarVisible(true);
      startHideTimer(3000);
    } else {
      setIsToolbarVisible(false);
      if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current);
    }
    return () => {
      if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current);
    };
  }, [selectedCount, selectedNodeId, startHideTimer]);

  useEffect(() => {
    const handleGlobalMouseDown = (event: MouseEvent) => {
      if (floatingToolbarRef.current && !floatingToolbarRef.current.contains(event.target as unknown as HTMLElement)) {
        setIsToolbarVisible(false);
      }
    };
    document.addEventListener('mousedown', handleGlobalMouseDown, true);
    return () => {
      document.removeEventListener('mousedown', handleGlobalMouseDown, true);
    };
  }, []);

  const handleConnect = useCallback((params: any) => {
    const newEdge: Edge = {
      id: `edge-manual-${Date.now()}`,
      source: params.source,
      target: params.target,
      sourceHandle: params.sourceHandle || 'source',
      targetHandle: params.targetHandle || 'target',
      animated: true,
      label: '信息关联',
      labelStyle: { fill: '#8C6F43', fontSize: 10, fontWeight: 700 },
      labelBgStyle: { fill: '#F9F5EF', rx: 4, ry: 4 },
      style: { stroke: '#B28C5A', strokeWidth: 2 }
    };
    onEdgesChange([{ type: 'add', item: newEdge } as any]);
  }, [onEdgesChange]);

  // Space key listener for Photoshop/Figma style canvas panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInput =
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.getAttribute('contenteditable') === 'true');

      if (isInput) return;

      if (e.code === 'Space' || e.key === ' ') {
        if (!e.repeat) {
          setIsSpacePressed(true);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Notice: Selection does not auto-jump viewport camera to maintain smooth user interaction
  // (fitView is reserved for explicit user actions such as reset or full overview)

  // Global clipboard paste event listener (Ctrl+V) for uploading master image
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const activeElement = document.activeElement;
      const isInput =
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.getAttribute('contenteditable') === 'true');

      if (isInput) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file && onUploadFile) {
            e.preventDefault();
            onUploadFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onUploadFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      setIsCanvasDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsCanvasDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsCanvasDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/') && onUploadFile) {
      onUploadFile(file);
    }
  };

  const nodeTypes = useMemo(
    () => ({
      // Primary registered nodes
      welcomeNode: WelcomeNode,
      productImageNode: ProductImageNode,
      productDnaNode: ProductDnaNode,
      nineGridPlanNode: NineGridPlanNode,
      scenePlanNode: ScenePlanNode,
      imageGenerationNode: ImageGenerationNode,
      generatedImageNode: GeneratedImageNode,
      videoCreationNode: VideoCreationNode,
      videoGenerationNode: VideoGenerationNode,
      videoResultNode: VideoResultNode,
      noteNode: NoteNode,
      workflowStageGroupNode: WorkflowStageGroupNode,
      workflowStageGroup: WorkflowStageGroupNode,
      stageGroupNode: WorkflowStageGroupNode,
      stageGroup: WorkflowStageGroupNode,
      stage: WorkflowStageGroupNode,
      group: WorkflowStageGroupNode,

      // CamelCase & lowercase aliases
      videoCreation: VideoCreationNode,
      video_creation: VideoCreationNode,
      videoGeneration: VideoGenerationNode,
      video_generation: VideoGenerationNode,
      videoResult: VideoResultNode,
      video_result: VideoResultNode,
      video: VideoResultNode,
      welcome: WelcomeNode,
      productImage: ProductImageNode,
      product_image: ProductImageNode,
      imageNode: ProductImageNode,
      image: ProductImageNode,
      productDna: ProductDnaNode,
      product_dna: ProductDnaNode,
      dnaNode: ProductDnaNode,
      dna: ProductDnaNode,
      nineGridPlan: NineGridPlanNode,
      nine_grid_plan: NineGridPlanNode,
      planNode: NineGridPlanNode,
      plan: NineGridPlanNode,
      scenePlan: ScenePlanNode,
      scene_plan: ScenePlanNode,
      sceneNode: ScenePlanNode,
      scene: ScenePlanNode,
      imageGeneration: ImageGenerationNode,
      image_generation: ImageGenerationNode,
      generationNode: ImageGenerationNode,
      generation: ImageGenerationNode,
      generatedImage: GeneratedImageNode,
      generated_image: GeneratedImageNode,
      resultNode: GeneratedImageNode,
      result: GeneratedImageNode,
      note: NoteNode,
      promptNode: NoteNode,
      prompt: NoteNode,

      // Scene Role Node types (Manwah 9-Screen System)
      productHero: UniversalNode,
      productHeroNode: UniversalNode,
      product_hero: UniversalNode,
      hero: UniversalNode,
      heroNode: UniversalNode,
      PRODUCT_HERO: UniversalNode,

      lifestyle: UniversalNode,
      lifestyleNode: UniversalNode,
      lifestyle_scene: UniversalNode,
      lifestyleScene: UniversalNode,
      LIFESTYLE_SCENE: UniversalNode,

      feature: UniversalNode,
      featureNode: UniversalNode,
      feature_callout: UniversalNode,
      featureCallout: UniversalNode,
      FEATURE_CALLOUT: UniversalNode,

      detailCallout: UniversalNode,
      detailCalloutNode: UniversalNode,
      detail_callout: UniversalNode,
      detail: UniversalNode,
      detailNode: UniversalNode,
      DETAIL_CALLOUT: UniversalNode,

      material: UniversalNode,
      materialNode: UniversalNode,
      material_only: UniversalNode,
      materialOnly: UniversalNode,
      MATERIAL_ONLY: UniversalNode,

      inspiration: UniversalNode,
      inspirationNode: UniversalNode,
      inspiration_only: UniversalNode,
      inspirationOnly: UniversalNode,
      INSPIRATION_ONLY: UniversalNode,

      // Fallback default node (handles any unknown node types without error #003)
      default: UniversalNode
    }),
    []
  );

  // Keyboard shortcut listener for Ctrl+A and Delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside an input, textarea, or contentEditable element
      const activeElement = document.activeElement;
      const isInput =
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.getAttribute('contenteditable') === 'true');

      if (isInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        onSelectAll?.();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedCount > 0) {
          e.preventDefault();
          onDeleteSelected?.();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSelectAll, onDeleteSelected, selectedCount]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onMouseDown={() => setIsMouseDown(true)}
      onMouseUp={() => setIsMouseDown(false)}
      style={{
        cursor: isSpacePressed ? (isMouseDown ? 'grabbing' : 'grab') : undefined
      }}
      className={`relative w-full h-full bg-[#FAF8F5] overflow-hidden select-none transition-colors ${
        isCanvasDragging ? 'bg-[#F4EFE6]' : ''
      }`}
    >
      {/* Drag Over Overlay Banner */}
      {isCanvasDragging && (
        <div className="absolute inset-0 z-40 bg-[#B28C5A]/15 backdrop-blur-xs border-4 border-dashed border-[#B28C5A] flex flex-col items-center justify-center text-[#2C2A29] p-6 animate-fadeIn pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-white shadow-2xl border border-[#B28C5A] text-[#B28C5A] flex items-center justify-center mb-3 animate-bounce">
            <Upload className="w-8 h-8" />
          </div>
          <h2 className="font-serif font-bold text-xl mb-1">释放文件即可上传产品主图</h2>
          <p className="text-xs text-stone-600 bg-white/90 px-3 py-1 rounded-full shadow-xs">
            支持直接将 PNG, JPG, WEBP 文件拖拽放至画布任意位置
          </p>
        </div>
      )}
      {/* Floating Selection Inspector Bar following the selected component panel */}
      {selectedCount > 0 && (
        <div
          ref={floatingToolbarRef}
          onMouseEnter={handleMouseEnterToolbar}
          onMouseLeave={handleMouseLeaveToolbar}
          style={toolbarStyle}
          className={`fixed z-50 flex flex-row items-center gap-2 bg-[#1E1B18]/95 backdrop-blur-xl text-white px-3 py-1.5 rounded-2xl shadow-2xl border border-[#B28C5A]/40 text-xs whitespace-nowrap flex-nowrap max-w-[95vw] transition-all duration-200 ${
            isToolbarVisible ? 'opacity-100 pointer-events-auto scale-100' : 'opacity-0 pointer-events-none scale-95'
          }`}
        >
          <span className="font-mono text-[11px] font-bold text-[#D4AF37] bg-[#B28C5A]/20 px-2 py-0.5 rounded-md border border-[#B28C5A]/30 whitespace-nowrap shrink-0">
            {selectedCount} 个节点已选
          </span>

          <div className="w-[1px] h-4 bg-stone-700/60 shrink-0" />

          <button
            onClick={selectedCount === totalNodesCount ? onClearSelection : onSelectAll}
            className="flex items-center gap-1 text-stone-300 hover:text-white hover:bg-white/10 transition-colors py-1 px-2 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            title="全选 / 反选 (Ctrl+A)"
          >
            {selectedCount === totalNodesCount ? <CheckSquare className="w-3.5 h-3.5 shrink-0" /> : <Square className="w-3.5 h-3.5 shrink-0" />}
            <span className="whitespace-nowrap">{selectedCount === totalNodesCount ? '反选' : '全选'}</span>
          </button>

          {onDuplicateSelected && (
            <button
              onClick={onDuplicateSelected}
              className="flex items-center gap-1 text-stone-300 hover:text-white hover:bg-white/10 transition-colors py-1 px-2 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              title="复制选中节点"
            >
              <Copy className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">复制</span>
            </button>
          )}

          {onDeleteSelected && (
            <button
              onClick={onDeleteSelected}
              className="flex items-center gap-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors font-bold py-1 px-2 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              title="删除选中节点 (Delete)"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">删除</span>
            </button>
          )}

          {/* Layout buttons for selected nodes */}
          {selectedCount > 1 && (
            <>
              <div className="w-[1px] h-4 bg-stone-700/60 shrink-0" />
              {onGrid3x3Layout && (
                <button
                  onClick={() => onGrid3x3Layout(true)}
                  className="flex items-center gap-1 text-[#D4AF37] hover:text-amber-200 hover:bg-amber-500/20 transition-colors font-medium py-1 px-2.5 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                  title="将选中的多屏节点平铺排列为 3x3 九宫格"
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-300" />
                  <span>3×3九宫格</span>
                </button>
              )}
              {onSeamlessLayout && (
                <button
                  onClick={() => onSeamlessLayout(true)}
                  className="flex items-center gap-1 text-[#D4AF37] hover:text-amber-200 hover:bg-amber-500/20 transition-colors font-medium py-1 px-2.5 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                  title="将选中的多屏节点首尾无缝相接自动拼接长图"
                >
                  <Film className="w-3.5 h-3.5 shrink-0 text-amber-300" />
                  <span>首尾相接拼接</span>
                </button>
              )}
            </>
          )}

          {/* Quick Render Toolset for Selected Scene/Result Node */}
          {targetSceneIdx !== null && onGenerateSceneImage && (
            <>
              <div className="w-[1px] h-4 bg-stone-700/60 shrink-0" />

              <div className="flex flex-row items-center gap-2 whitespace-nowrap shrink-0">
                <div className="flex items-center gap-1 text-[11px] font-bold text-[#D4AF37] whitespace-nowrap shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-[#B28C5A] shrink-0" />
                  <span className="whitespace-nowrap">分镜 #{targetSceneIdx} 快捷渲染:</span>
                </div>

                <select
                  value={renderModel}
                  onChange={(e) => {
                    setRenderModel(e.target.value);
                    if (setSelectedModel) setSelectedModel(e.target.value);
                  }}
                  className="bg-[#2A2420] text-amber-100 border border-[#B28C5A]/40 rounded-lg px-2.5 py-1 text-xs font-semibold outline-none hover:border-[#D4AF37] focus:border-[#D4AF37] shrink-0 cursor-pointer shadow-inner"
                >
                  <option value="openai/gpt-image-2-c">GPT image-2-c (默认)</option>
                  <option value="openai/gpt-image-2">GPT image-2</option>
                  <option value="google/gemini-3.1-flash-image">Gemini 3.1 Flash</option>
                  <option value="google/gemini-3-pro-image-preview">Gemini 3.0 Pro</option>
                </select>

                <div className="flex items-center gap-0.5 bg-[#25201C] rounded-lg p-0.5 border border-[#B28C5A]/30 text-[11px] font-bold shrink-0">
                  {(['1K', '2K', '4K'] as const).map(res => (
                    <button
                      key={res}
                      onClick={() => {
                        setRenderRes(res);
                        if (setSelectedResolution) setSelectedResolution(res);
                      }}
                      className={`px-2 py-0.5 rounded transition-all shrink-0 cursor-pointer ${renderRes === res ? 'bg-[#B28C5A] text-white shadow-xs' : 'text-stone-400 hover:text-white'}`}
                    >
                      {res}
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-amber-200 hover:text-amber-100 whitespace-nowrap shrink-0 select-none">
                  <input
                    type="checkbox"
                    checked={renderWithText}
                    onChange={(e) => setRenderWithText(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#B28C5A] rounded cursor-pointer shrink-0"
                  />
                  <span className="whitespace-nowrap">包含文案海报</span>
                </label>

                <button
                  onClick={() => {
                    onGenerateSceneImage(targetSceneIdx, undefined, renderModel, renderRes, renderWithText);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-[#B28C5A] to-[#8C6F43] hover:from-[#C49B64] hover:to-[#9E7A4A] text-white rounded-lg font-bold text-xs shadow-md transition-all active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
                  title="执行渲染设定并提交生成（在右侧并列新增独立节点）"
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span className="whitespace-nowrap">提交渲染</span>
                </button>
              </div>
            </>
          )}

          {onOpenVideoPanel && selectedTargetNode && (
            <>
              <div className="w-[1px] h-4 bg-stone-700/60 shrink-0" />
              <button
                onClick={() => onOpenVideoPanel(selectedTargetNode)}
                className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 transition-colors font-medium py-1 px-2.5 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                title="以该选定图片为基准，展开生成视频策划面板"
              >
                <Film className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                <span>生成视频</span>
              </button>
            </>
          )}

          <div className="w-[1px] h-4 bg-stone-700/60 shrink-0" />

          <button
            onClick={() => {
              setIsToolbarVisible(false);
              onClearSelection?.();
            }}
            className="p-1 text-stone-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors shrink-0 cursor-pointer"
            title="关闭浮动工具栏"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        nodeTypes={nodeTypes}
        onInit={(instance) => {
          rfInstanceRef.current = instance;
        }}
        onMove={(_evt, viewport) => {
          if (viewport?.zoom) {
            setZoomLevel(viewport.zoom);
          }
        }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.05}
        maxZoom={2.5}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        panOnDrag={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
        onNodeClick={onNodeClick}
        onPaneClick={() => {
          setIsToolbarVisible(false);
          onClearSelection?.();
        }}
        className="w-full h-full"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.5}
          color="#E5E0D8"
          className="bg-[#FAF8F5]"
        />
        <CanvasToolbar
          zoomLevel={zoomLevel}
          selectedCount={selectedCount}
          totalNodesCount={totalNodesCount}
          onSelectAll={onSelectAll}
          onClearSelection={onClearSelection}
          onDeleteSelected={onDeleteSelected}
          onDuplicateSelected={onDuplicateSelected}
          onAddCustomNode={onAddCustomNode}
          onAutoLayoutNodes={onAutoLayoutNodes}
          onGrid3x3Layout={onGrid3x3Layout}
          onSeamlessLayout={onSeamlessLayout}
        />
      </ReactFlow>
    </div>
  );
};
