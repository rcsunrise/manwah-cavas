import { Node, Edge } from '@xyflow/react';
import { WorkflowStage, SerializableNode } from '../types/creativeCanvas';

export const STAGE_IDS = {
  planning: 'stage-planning',
  generation: 'stage-generation',
  results: 'stage-results'
} as const;

export const STAGE_CONFIGS: Record<WorkflowStage, { title: string; subtitle: string; color: string; borderColor: string; bg: string }> = {
  planning: {
    title: '九屏企划规划区',
    subtitle: 'Planning · 策划文案与构图建议',
    color: '#8C6F43',
    borderColor: '#C8B293',
    bg: 'rgba(249, 245, 239, 0.6)'
  },
  generation: {
    title: '场景生成任务区',
    subtitle: 'Generation · AI 渲染任务与日志',
    color: '#B28C5A',
    borderColor: '#D8C7B0',
    bg: 'rgba(250, 248, 245, 0.6)'
  },
  results: {
    title: '生成结果展现区',
    subtitle: 'Results · 真实图片与一致性审核',
    color: '#2D6A4F',
    borderColor: '#95D5B2',
    bg: 'rgba(244, 249, 246, 0.6)'
  }
};

export const DEFAULT_NODE_SIZES = {
  scenePlanNode: { width: 340, height: 320, minWidth: 300, minHeight: 200, maxWidth: 600, maxHeight: 720 },
  imageGenerationNode: { width: 300, height: 260, minWidth: 260, minHeight: 160, maxWidth: 500, maxHeight: 600 },
  generatedImageNode: { width: 340, height: 460, minWidth: 280, minHeight: 240, maxWidth: 640, maxHeight: 800 },
  videoCreationNode: { width: 320, height: 360, minWidth: 300, minHeight: 200, maxWidth: 600, maxHeight: 720 },
  videoGenerationNode: { width: 300, height: 260, minWidth: 260, minHeight: 160, maxWidth: 500, maxHeight: 600 },
  videoResultNode: { width: 340, height: 420, minWidth: 280, minHeight: 240, maxWidth: 640, maxHeight: 800 },
  defaultNode: { width: 320, height: 240, minWidth: 280, minHeight: 160, maxWidth: 800, maxHeight: 1000 }
};

export function getNodeTypeStage(type?: string): WorkflowStage | null {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t.includes('sceneplan') || t.includes('videocreation')) return 'planning';
  if (t.includes('imagegeneration') || t.includes('videogeneration')) return 'generation';
  if (t.includes('generatedimage') || t.includes('videoresult')) return 'results';
  return null;
}

export function getNodeDimensions(node: Node): { width: number; height: number } {
  const nodeData = (node.data || {}) as Record<string, any>;
  const isCollapsed = Boolean(nodeData.ui?.collapsed);
  if (isCollapsed) {
    const w = node.measured?.width || node.width || (node.style?.width as number) || 300;
    return { width: Number(w), height: 60 };
  }

  const type = node.type || '';
  const defaultSize = (DEFAULT_NODE_SIZES as any)[type] || DEFAULT_NODE_SIZES.defaultNode;

  let w = nodeData.ui?.expandedWidth || (node.style?.width as number) || node.width || defaultSize.width;
  if ((type === 'scenePlanNode' || node.id.startsWith('scene-plan-node-')) && !nodeData.ui?.expandedWidth && Number(w) > 420) {
    w = defaultSize.width;
  }
  const h = nodeData.ui?.expandedHeight || node.measured?.height || node.height || (node.style?.height as number) || defaultSize.height;

  return { width: Number(w), height: Number(h) };
}

/**
 * Clean & arrange canvas nodes into 3 stage groups without rectangular collisions
 */
export function arrangeCanvasLayout(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const newNodes: Node[] = [];
  const processedNodeIds = new Set<string>();

  // 1. Position main top workflow pipeline nodes
  const pipelineNodePositions: Record<string, { x: number; y: number }> = {
    'welcome-1': { x: 100, y: 120 },
    'product-image-node-1': { x: 480, y: 120 },
    'dna-node-1': { x: 820, y: 120 },
    'nine-grid-plan-node': { x: 1220, y: 120 }
  };

  for (const node of nodes) {
    if (pipelineNodePositions[node.id]) {
      newNodes.push({
        ...node,
        position: pipelineNodePositions[node.id],
        parentId: undefined,
        data: {
          ...node.data,
          ui: {
            ...((node.data?.ui as object) || {}),
            layoutVersion: 2
          }
        }
      });
      processedNodeIds.add(node.id);
    }
  }

  // Group business nodes by stage
  const stages: Record<WorkflowStage, Node[]> = {
    planning: [],
    generation: [],
    results: []
  };

  const otherNodes: Node[] = [];

  for (const node of nodes) {
    if (processedNodeIds.has(node.id)) continue;

    const nodeData = (node.data || {}) as Record<string, any>;
    // Check stage node type or existing stage tag
    const stage = (nodeData.ui?.stage as WorkflowStage) || getNodeTypeStage(node.type);
    if (stage) {
      stages[stage].push(node);
      processedNodeIds.add(node.id);
    } else if (node.type !== 'workflowStageGroupNode' && node.type !== 'stageGroupNode') {
      otherNodes.push(node);
      processedNodeIds.add(node.id);
    }
  }

  // Sort each stage array by sceneIndex or screenIndex if available
  const getIndex = (n: Node) => {
    const data = (n.data || {}) as Record<string, any>;
    return Number(data.sceneIndex || data.screenIndex || 0);
  };
  stages.planning.sort((a, b) => getIndex(a) - getIndex(b));
  stages.generation.sort((a, b) => getIndex(a) - getIndex(b));
  stages.results.sort((a, b) => getIndex(a) - getIndex(b));

  // 2. Layout stages sequentially from left to right
  let currentStageX = 800;
  const stageY = 520;
  const STAGE_GAP = 80;
  const PADDING_LEFT = 32;
  const PADDING_RIGHT = 32;
  const PADDING_TOP = 72;
  const PADDING_BOTTOM = 32;
  const COLUMN_GAP = 36;
  const ROW_GAP = 32;

  const stageKeys: WorkflowStage[] = ['planning', 'generation', 'results'];

  for (const stageKey of stageKeys) {
    const stageNodes = stages[stageKey];
    const stageGroupId = STAGE_IDS[stageKey];
    const stageConfig = STAGE_CONFIGS[stageKey];

    // Find existing stage group node if present
    const existingGroup = nodes.find(n => n.id === stageGroupId);
    const isGroupCollapsed = Boolean(existingGroup?.data?.collapsed || false);

    // Calculate positions for items in 3 columns
    let maxRowWidth = 0;
    let currentY = PADDING_TOP;
    let currentRowMaxHeight = 0;
    const itemsInRow: { node: Node; dim: { width: number; height: number }; relX: number; relY: number }[] = [];

    const placedItems: Node[] = [];

    for (let i = 0; i < stageNodes.length; i++) {
      const node = stageNodes[i];
      const col = i % 3;
      const dim = getNodeDimensions(node);

      if (col === 0 && i > 0) {
        currentY += currentRowMaxHeight + ROW_GAP;
        currentRowMaxHeight = 0;
      }

      currentRowMaxHeight = Math.max(currentRowMaxHeight, dim.height);

      // Estimate relX for col
      // Width of previous columns
      let colX = PADDING_LEFT;
      if (col === 1) {
        const prevColDim = itemsInRow[itemsInRow.length - 1]?.dim.width || 300;
        colX = PADDING_LEFT + prevColDim + COLUMN_GAP;
      } else if (col === 2) {
        const c0Dim = itemsInRow[itemsInRow.length - 2]?.dim.width || 300;
        const c1Dim = itemsInRow[itemsInRow.length - 1]?.dim.width || 300;
        colX = PADDING_LEFT + c0Dim + COLUMN_GAP + c1Dim + COLUMN_GAP;
      }

      const itemInfo = { node, dim, relX: colX, relY: currentY };
      itemsInRow.push(itemInfo);

      const itemRight = colX + dim.width;
      if (itemRight > maxRowWidth) maxRowWidth = itemRight;

      const nodeData = (node.data || {}) as Record<string, any>;
      // Create updated node with parentId and relative position
      const updatedNode: Node = {
        ...node,
        parentId: stageGroupId,
        extent: 'parent',
        expandParent: true,
        position: { x: colX, y: currentY },
        style: {
          ...(node.style || {}),
          width: dim.width,
          ...(nodeData.ui?.collapsed ? { height: 60 } : {})
        },
        data: {
          ...node.data,
          ui: {
            ...((nodeData.ui as object) || {}),
            stage: stageKey,
            layoutVersion: 2
          }
        }
      };

      placedItems.push(updatedNode);
    }

    const contentHeight = stageNodes.length > 0 ? (currentY + currentRowMaxHeight) : 200;
    const groupWidth = Math.max(760, maxRowWidth + PADDING_RIGHT);
    const groupHeight = isGroupCollapsed ? 68 : contentHeight + PADDING_BOTTOM;

    // Create stage group node
    const groupNode: Node = {
      id: stageGroupId,
      type: 'workflowStageGroupNode',
      position: { x: currentStageX, y: stageY },
      style: {
        width: groupWidth,
        height: groupHeight,
        zIndex: -10
      },
      data: {
        stage: stageKey,
        title: stageConfig.title,
        subtitle: stageConfig.subtitle,
        color: stageConfig.color,
        borderColor: stageConfig.borderColor,
        bg: stageConfig.bg,
        count: stageNodes.length,
        collapsed: isGroupCollapsed,
        ui: { layoutVersion: 2 }
      }
    };

    newNodes.push(groupNode);
    if (!isGroupCollapsed) {
      newNodes.push(...placedItems);
    }

    currentStageX += groupWidth + STAGE_GAP;
  }

  // 3. Keep remaining custom notes or user nodes
  let otherX = currentStageX;
  for (const node of otherNodes) {
    newNodes.push({
      ...node,
      position: node.position || { x: otherX, y: stageY },
      data: {
        ...node.data,
        ui: { ...((node.data?.ui as object) || {}), layoutVersion: 2 }
      }
    });
    otherX += 360;
  }

  return { nodes: newNodes, edges };
}

/**
 * Idempotently migrate legacy canvas nodes (layoutVersion < 2 or missing stage group parentId)
 */
export function migrateLegacyCanvasNodes(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[]; migrated: boolean } {
  const needsMigration = nodes.some(n => {
    if (n.type === 'scenePlanNode' || n.type === 'imageGenerationNode' || n.type === 'generatedImageNode') {
      const data = (n.data || {}) as Record<string, any>;
      return !n.parentId || !data.ui?.layoutVersion || (data.ui?.layoutVersion as number) < 2;
    }
    return false;
  });

  if (!needsMigration) {
    return { nodes, edges, migrated: false };
  }

  const result = arrangeCanvasLayout(nodes, edges);
  return { nodes: result.nodes, edges: result.edges, migrated: true };
}

/**
 * Bounding box overlap test between nodes in canvas
 */
export function detectNodeCollisions(nodes: Node[]): { collisionCount: number; details: string[] } {
  const details: string[] = [];
  let collisionCount = 0;

  // Build absolute bounding boxes for all non-group nodes
  const groupMap = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    if (n.type === 'workflowStageGroupNode' || n.type === 'stageGroupNode') {
      groupMap.set(n.id, { x: n.position.x, y: n.position.y });
    }
  }

  const bboxes: { id: string; stage?: string; left: number; top: number; right: number; bottom: number }[] = [];

  for (const n of nodes) {
    if (n.type === 'workflowStageGroupNode' || n.type === 'stageGroupNode') continue;

    const dim = getNodeDimensions(n);
    let absX = n.position.x;
    let absY = n.position.y;

    if (n.parentId && groupMap.has(n.parentId)) {
      const parentPos = groupMap.get(n.parentId)!;
      absX += parentPos.x;
      absY += parentPos.y;
    }

    const nData = (n.data || {}) as Record<string, any>;
    bboxes.push({
      id: n.id,
      stage: nData.ui?.stage as string,
      left: absX,
      top: absY,
      right: absX + dim.width,
      bottom: absY + dim.height
    });
  }

  // Check overlap pairwise
  for (let i = 0; i < bboxes.length; i++) {
    for (let j = i + 1; j < bboxes.length; j++) {
      const a = bboxes[i];
      const b = bboxes[j];

      // Only check if they share the same stage or parent group
      if (a.stage && b.stage && a.stage === b.stage) {
        const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

        if (overlapX > 2 && overlapY > 2) {
          collisionCount++;
          details.push(`Collision between ${a.id} and ${b.id} in stage ${a.stage} (overlap ${overlapX}x${overlapY})`);
        }
      }
    }
  }

  return { collisionCount, details };
}

/**
 * 一键整理（自动对齐）：
 * - 按连线深度从左到右分列（来源 → 企划 → 场景/任务 → 成图），列内按节点真实高度从上到下排，不会再叠成一条长竖线；
 * - 一列放不下（太高）时自动换到右边相邻的子列；
 * - 视频的“任务节点 + 成果节点”是同一个镜头的两个视图，并排成一组放在最右侧，
 *   同一镜头的多次重试聚在一起（新的在上），镜头按 shot-1、shot-2… 排序。
 */
const TREE_LAYOUT = { originX: 50, originY: 100, colGap: 120, subColGap: 40, rowGap: 40, pairGap: 40, maxColHeight: 3000 };

interface LayoutUnit {
  nodes: Node[];
  width: number;
  height: number;
}

function layoutUnitsInColumns(units: LayoutUnit[], startX: number, positions: Map<string, { x: number; y: number }>): number {
  let x = startX;
  let y = TREE_LAYOUT.originY;
  let colMaxW = 0;
  let colCount = 0;
  for (const unit of units) {
    if (colCount > 0 && y + unit.height > TREE_LAYOUT.originY + TREE_LAYOUT.maxColHeight) {
      x += colMaxW + TREE_LAYOUT.subColGap;
      y = TREE_LAYOUT.originY;
      colMaxW = 0;
      colCount = 0;
    }
    let nx = x;
    for (const n of unit.nodes) {
      positions.set(n.id, { x: nx, y });
      nx += getNodeDimensions(n).width + TREE_LAYOUT.pairGap;
    }
    y += unit.height + TREE_LAYOUT.rowGap;
    colMaxW = Math.max(colMaxW, unit.width);
    colCount += 1;
  }
  return x + colMaxW;
}

export function arrangeCleanTreeLayout(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const data = (n: Node) => (n.data || {}) as Record<string, any>;
  const layoutNodes = nodes.filter(n => n.type !== 'workflowStageGroupNode');
  const isVideoNode = (n: Node) => n.type === 'videoGenerationNode' || n.type === 'videoResultNode';

  const typeRank = (n: Node): number => {
    if (n.type === 'productImageNode' || n.id === 'img-node-1' || n.id === 'product-image-node-1') return 0;
    if (n.type === 'productDnaNode' || n.id === 'dna-node-1') return 1;
    if (n.type === 'welcomeNode' || n.id === 'welcome-1') return 2;
    if (n.type === 'nineGridPlanNode' || n.id.startsWith('plan-node-') || n.id.startsWith('nine-grid-plan-node')) return 3;
    if (n.type === 'scenePlanNode') return 4;
    if (n.type === 'imageGenerationNode') return 5;
    if (data(n).templatePoster) return 6;
    if (n.type === 'generatedImageNode') return 7;
    return 8;
  };
  const sceneOf = (n: Node) => Number(data(n).sceneIndex || data(n).screenIndex || 0);

  // ---------- 非视频节点：按连线深度分列 ----------
  const general = layoutNodes.filter(n => !isVideoNode(n));
  const generalIds = new Set(general.map(n => n.id));
  const depth = new Map<string, number>(general.map(n => [n.id, 0]));
  const relevantEdges = edges.filter(e => generalIds.has(e.source) && generalIds.has(e.target) && e.source !== e.target);
  for (let pass = 0; pass < general.length; pass++) {
    let changed = false;
    for (const e of relevantEdges) {
      const next = (depth.get(e.source) || 0) + 1;
      if (next > (depth.get(e.target) || 0) && next <= general.length) {
        depth.set(e.target, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const positions = new Map<string, { x: number; y: number }>();
  const byDepth = new Map<number, Node[]>();
  for (const n of general) {
    const d = depth.get(n.id) || 0;
    byDepth.set(d, [...(byDepth.get(d) || []), n]);
  }
  let cursorX = TREE_LAYOUT.originX;
  Array.from(byDepth.keys())
    .sort((a, b) => a - b)
    .forEach(d => {
      const items = (byDepth.get(d) || [])
        .slice()
        .sort((a, b) => typeRank(a) - typeRank(b) || sceneOf(a) - sceneOf(b) || a.position.y - b.position.y || a.position.x - b.position.x);
      const units: LayoutUnit[] = items.map(n => {
        const dims = getNodeDimensions(n);
        return { nodes: [n], width: dims.width, height: dims.height };
      });
      const endX = layoutUnitsInColumns(units, cursorX, positions);
      cursorX = endX + TREE_LAYOUT.colGap;
    });

  // ---------- 视频节点：任务 + 成果并排成一组 ----------
  const videoNodes = layoutNodes.filter(isVideoNode);
  if (videoNodes.length > 0) {
    const groups = new Map<string, Node[]>();
    for (const n of videoNodes) {
      const job = data(n).job || {};
      const key = String(job.id || data(n).assetVersionId || data(n).jobId || n.id);
      groups.set(key, [...(groups.get(key) || []), n]);
    }
    const shotNo = (ns: Node[]) => {
      const shotId = String((data(ns[0]).job || {}).shotId || '');
      const m = shotId.match(/^shot-(\d+)/);
      return m ? Number(m[1]) : 999;
    };
    const createdAt = (ns: Node[]) => Date.parse(String((data(ns[0]).job || {}).createdAt || '')) || 0;
    const videoUnits: LayoutUnit[] = Array.from(groups.values())
      .map(ns => ns.slice().sort((a, b) => (a.type === 'videoGenerationNode' ? -1 : 1) - (b.type === 'videoGenerationNode' ? -1 : 1)))
      .sort((a, b) => shotNo(a) - shotNo(b) || createdAt(b) - createdAt(a))
      .map(ns => {
        const dims = ns.map(getNodeDimensions);
        return {
          nodes: ns,
          width: dims.reduce((s, d) => s + d.width, 0) + TREE_LAYOUT.pairGap * (ns.length - 1),
          height: Math.max(...dims.map(d => d.height))
        };
      });
    layoutUnitsInColumns(videoUnits, cursorX, positions);
  }

  const updatedNodes = nodes.map(n => {
    const p = positions.get(n.id);
    return p ? { ...n, position: p } : n;
  });
  return { nodes: updatedNodes, edges };
}

/**
 * Arrange target generated image nodes (or selected nodes) into a clean 3x3 Grid matrix
 */
export function arrangeGrid3x3Layout(nodes: Node[], selectedOnly: boolean = false): { nodes: Node[] } {
  // Determine target nodes
  let targetNodes = selectedOnly
    ? nodes.filter(n => n.selected)
    : nodes.filter(n => n.type === 'generatedImageNode' || n.type === 'scenePlanNode');

  if (targetNodes.length === 0) {
    // Fallback: arrange all generatedImageNodes if no nodes are selected
    targetNodes = nodes.filter(n => n.type === 'generatedImageNode');
  }

  if (targetNodes.length === 0) return { nodes };

  // Sort by sceneIndex / screenIndex or version or initial position
  targetNodes.sort((a, b) => {
    const sceneA = (a.data as any)?.sceneIndex || (a.data as any)?.screenIndex || 0;
    const sceneB = (b.data as any)?.sceneIndex || (b.data as any)?.screenIndex || 0;
    if (sceneA !== sceneB) return sceneA - sceneB;
    return (a.position?.y || 0) - (b.position?.y || 0);
  });

  // Calculate anchor start position
  const minX = Math.min(...targetNodes.map(n => n.position.x));
  const minY = Math.min(...targetNodes.map(n => n.position.y));
  const startX = isFinite(minX) ? minX : 1620;
  const startY = isFinite(minY) ? minY : 120;

  const COL_COUNT = 3;
  const COL_GAP = 30;
  const ROW_GAP = 30;

  const targetIds = new Set(targetNodes.map(n => n.id));

  // Determine standard item dimension
  const nodeWidth = 320;
  const nodeHeight = 460;

  const updatedNodes = nodes.map(node => {
    if (!targetIds.has(node.id)) return node;

    const idx = targetNodes.findIndex(n => n.id === node.id);
    const col = idx % COL_COUNT;
    const row = Math.floor(idx / COL_COUNT);

    const targetX = startX + col * (nodeWidth + COL_GAP);
    const targetY = startY + row * (nodeHeight + ROW_GAP);

    return {
      ...node,
      position: { x: targetX, y: targetY },
      style: { ...(node.style || {}), width: nodeWidth }
    };
  });

  return { nodes: updatedNodes };
}

/**
 * Arrange target nodes into a single end-to-end seamless vertical poster layout (Long Canvas)
 */
export function arrangeSeamlessVerticalLayout(nodes: Node[], selectedOnly: boolean = false): { nodes: Node[] } {
  let targetNodes = selectedOnly
    ? nodes.filter(n => n.selected)
    : nodes.filter(n => n.type === 'generatedImageNode' || n.type === 'scenePlanNode');

  if (targetNodes.length === 0) {
    targetNodes = nodes.filter(n => n.type === 'generatedImageNode');
  }

  if (targetNodes.length === 0) return { nodes };

  // Sort strictly by sceneIndex / screenIndex ascending
  targetNodes.sort((a, b) => {
    const sceneA = (a.data as any)?.sceneIndex || (a.data as any)?.screenIndex || 0;
    const sceneB = (b.data as any)?.sceneIndex || (b.data as any)?.screenIndex || 0;
    if (sceneA !== sceneB) return sceneA - sceneB;
    return (a.position?.y || 0) - (b.position?.y || 0);
  });

  const minX = Math.min(...targetNodes.map(n => n.position.x));
  const minY = Math.min(...targetNodes.map(n => n.position.y));
  const startX = isFinite(minX) ? minX : 1620;
  let currentY = isFinite(minY) ? minY : 120;

  const targetIds = new Set(targetNodes.map(n => n.id));
  const nodeWidth = 340;
  const VERTICAL_GAP = 6; // Seamless gap for long-scroll poster review

  const positionMap = new Map<string, { x: number; y: number }>();

  for (const node of targetNodes) {
    const dims = getNodeDimensions(node);
    const h = Math.max(dims.height || 460, 420);

    positionMap.set(node.id, { x: startX, y: currentY });
    currentY += h + VERTICAL_GAP;
  }

  const updatedNodes = nodes.map(node => {
    if (!targetIds.has(node.id)) return node;
    const pos = positionMap.get(node.id);
    if (!pos) return node;

    return {
      ...node,
      position: pos,
      style: { ...(node.style || {}), width: nodeWidth }
    };
  });

  return { nodes: updatedNodes };
}

