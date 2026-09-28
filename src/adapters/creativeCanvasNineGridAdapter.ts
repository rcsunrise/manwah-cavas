import { Node, Edge } from '@xyflow/react';
import { AgentRun, ProductVisualDNA, DetailPageScreenPlan } from '../types';
import { NineGridPlanNodeData, ScenePlanNodeData } from '../types/creativeCanvas';

export interface NineGridCanvasAdapterCallbacks {
  onViewFullPlan?: () => void;
  onRegenerateAll?: () => void;
  onViewSceneDetail?: (screenIndex: number) => void;
  onReplanScene?: (screenIndex: number) => void;
  onOpenPosterStudio?: (screenIndex: number) => void;
  onGenerateWithTextImage?: (screenIndex: number) => void;
  offsetY?: number;
}

export function mapExistingNineGridResultToCanvasNodes(
  agentRun: AgentRun,
  productDna: ProductVisualDNA | null,
  callbacks?: NineGridCanvasAdapterCallbacks
): { nodes: Node[]; edges: Edge[] } {
  if (!agentRun || !agentRun.plan) {
    throw new Error('缺失有效的九屏企划数据');
  }

  const plan = agentRun.plan;
  const screens = plan.screens || [];

  if (!screens || screens.length === 0) {
    throw new Error('企划数据异常：分镜数据为空');
  }

  const offsetY = callbacks?.offsetY || 0;
  const planNodeId = `plan-node-${agentRun.id}`;

  const nineGridNodeData: NineGridPlanNodeData = {
    runId: agentRun.id,
    themeTitle: plan.themeTitle || `意式极简家具 ${screens.length} 屏策划`,
    targetAudience: plan.targetAudience || '追求生活品质的新中产家庭',
    overallStyle: plan.overallStyle || '自然光影、高雅轻奢影棚',
    coreCreative: productDna?.subcategory ? `${productDna.subcategory} 爆款卖点突破` : '空间美学与质感演绎',
    colorDirection: productDna?.primaryColor || '按产品主色调调和',
    sceneDirection: '现代高端客厅场景',
    screenCount: screens.length,
    status: 'completed',
    generatedAt: plan.createdAt || new Date().toISOString(),
    onViewFullPlan: callbacks?.onViewFullPlan,
    onRegenerateAll: callbacks?.onRegenerateAll
  };

  const nineGridNode: Node = {
    id: planNodeId,
    type: 'nineGridPlanNode',
    position: { x: 800, y: 150 + offsetY },
    style: { width: 360 },
    data: nineGridNodeData
  };

  const dnaToPlanEdge: Edge = {
    id: `edge-dna-plan-${agentRun.id}`,
    source: 'dna-node-1',
    target: planNodeId,
    sourceHandle: 'source',
    targetHandle: 'target',
    label: 'DNA 驱动企划',
    labelStyle: { fill: '#8C6F43', fontSize: 10, fontWeight: 700 },
    labelBgStyle: { fill: '#F9F5EF', rx: 4, ry: 4 },
    animated: true,
    style: { stroke: '#B28C5A', strokeWidth: 2 }
  };

  const sceneNodes: Node[] = [];
  const sceneEdges: Edge[] = [];

  const startX = 800;
  const gapX = 380;
  const startY = 520;
  const gapY = 360;

  screens.forEach((screen: DetailPageScreenPlan, idx: number) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const posX = startX + col * gapX;
    const posY = startY + offsetY + row * gapY;
    const sceneNodeId = `scene-plan-${agentRun.id}-${screen.screenIndex}`;

    const sceneData: ScenePlanNodeData = {
      runId: agentRun.id,
      screenIndex: screen.screenIndex,
      screenTitle: screen.screenTitle,
      coreSellingPoint: screen.coreSellingPoint,
      sceneDescription: screen.lightingAndAtmosphere || '现代家居光影与场景展示',
      visualComposition: screen.visualComposition,
      lightingAndAtmosphere: screen.lightingAndAtmosphere,
      productFocus: screen.lockedRules?.join(', ') || productDna?.category || '产品主体',
      copySuggestion: screen.coreSellingPoint,
      promptSuggestion: screen.promptSuggestion,
      aspectRatio: screen.aspectRatio || '3:4',
      status: 'completed',
      onViewDetail: () => callbacks?.onViewSceneDetail?.(screen.screenIndex),
      onReplanScene: () => callbacks?.onReplanScene?.(screen.screenIndex),
      onGenerateImage: () => {
        if (callbacks?.onGenerateWithTextImage) {
          callbacks.onGenerateWithTextImage(screen.screenIndex);
        } else if (callbacks?.onOpenPosterStudio) {
          callbacks.onOpenPosterStudio(screen.screenIndex);
        }
      }
    };

    sceneNodes.push({
      id: sceneNodeId,
      type: 'scenePlanNode',
      position: { x: posX, y: posY },
      style: { width: 340 },
      data: sceneData
    });

    sceneEdges.push({
      id: `edge-plan-scene-${agentRun.id}-${screen.screenIndex}`,
      source: planNodeId,
      target: sceneNodeId,
      sourceHandle: 'source',
      targetHandle: 'target',
      label: '企划分镜',
      labelStyle: { fill: '#8C6F43', fontSize: 10, fontWeight: 700 },
      labelBgStyle: { fill: '#F9F5EF', rx: 4, ry: 4 },
      animated: false,
      style: { stroke: '#C8B293', strokeWidth: 1.5, strokeDasharray: '4,4' }
    });
  });

  return {
    nodes: [nineGridNode, ...sceneNodes],
    edges: [dnaToPlanEdge, ...sceneEdges]
  };
}
