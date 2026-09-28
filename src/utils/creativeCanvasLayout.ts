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
 * One-click neat layout arrangement: Organizes canvas into neat rows/columns by scene hierarchy & run swimlanes
 */
export function arrangeCleanTreeLayout(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const updatedNodes: Node[] = [];
  const processed = new Set<string>();

  // Helper getters
  const getRunId = (n: Node): string => {
    const data = (n.data || {}) as Record<string, any>;
    return (data.runId as string) || (data.agentRunId as string) || 'default_run';
  };

  const getSceneIdx = (n: Node): number => {
    const data = (n.data || {}) as Record<string, any>;
    return Number(data.sceneIndex || data.screenIndex || 0);
  };

  // 1. Column 0 (X = 50): Static Source Pipeline Nodes (Product Image, DNA, Welcome)
  const productImgNode = nodes.find(n => n.id === 'product-image-node-1' || n.id === 'img-node-1' || n.type === 'productImageNode');
  if (productImgNode) {
    updatedNodes.push({ ...productImgNode, position: { x: 50, y: 100 } });
    processed.add(productImgNode.id);
  }

  const dnaNode = nodes.find(n => n.id === 'dna-node-1' || n.type === 'productDnaNode');
  if (dnaNode) {
    updatedNodes.push({ ...dnaNode, position: { x: 50, y: 550 } });
    processed.add(dnaNode.id);
  }

  const welcomeNode = nodes.find(n => n.id === 'welcome-1' || n.type === 'welcomeNode');
  if (welcomeNode) {
    updatedNodes.push({ ...welcomeNode, position: { x: 50, y: 980 } });
    processed.add(welcomeNode.id);
  }

  // 2. Identify all Plan runs (NineGridPlanNode)
  const planNodes = nodes.filter(n => !processed.has(n.id) && (n.type === 'nineGridPlanNode' || n.id.startsWith('plan-node-') || n.id.startsWith('nine-grid-plan-node')));

  // Group all scene plan nodes by runId
  const scenePlanNodes = nodes.filter(n => !processed.has(n.id) && (n.type === 'scenePlanNode' || n.id.startsWith('scene-plan-')));
  const runGroupMap = new Map<string, { planNode?: Node; scenes: Node[] }>();

  // Register plan nodes
  planNodes.forEach(pNode => {
    const rId = getRunId(pNode) || pNode.id;
    if (!runGroupMap.has(rId)) {
      runGroupMap.set(rId, { planNode: pNode, scenes: [] });
    } else {
      runGroupMap.get(rId)!.planNode = pNode;
    }
  });

  // Register scene nodes into their run groups
  scenePlanNodes.forEach(sNode => {
    const rId = getRunId(sNode);
    if (!runGroupMap.has(rId)) {
      runGroupMap.set(rId, { scenes: [sNode] });
    } else {
      runGroupMap.get(rId)!.scenes.push(sNode);
    }
  });

  // Handle unassigned scene plan nodes (if runId missing)
  const orphanScenes = scenePlanNodes.filter(s => !processed.has(s.id) && !Array.from(runGroupMap.values()).some(g => g.scenes.includes(s)));
  if (orphanScenes.length > 0) {
    runGroupMap.set('orphan_run', { scenes: orphanScenes });
  }

  let currentRunY = 100;
  const Y_ROW_STEP = 460;
  const RUN_GAP_Y = 120;

  // Process each run swimlane sequentially
  Array.from(runGroupMap.entries()).forEach(([runId, group]) => {
    const pNode = group.planNode;
    const scenes = group.scenes;
    scenes.sort((a, b) => getSceneIdx(a) - getSceneIdx(b));

    // Column 1 (X = 440): Nine Grid Plan Master Node for this run
    if (pNode) {
      updatedNodes.push({ ...pNode, position: { x: 440, y: currentRunY } });
      processed.add(pNode.id);
    }

    // Column 2 (X = 840): Scene Plan Nodes for this run
    scenes.forEach((spNode, idx) => {
      const sceneNum = getSceneIdx(spNode) || (idx + 1);
      const rowY = currentRunY + idx * Y_ROW_STEP;

      updatedNodes.push({ ...spNode, position: { x: 840, y: rowY } });
      processed.add(spNode.id);

      // Column 3 (X = 1240): Image Generation Task Nodes belonging strictly to this scene & run
      const genTaskNodes = nodes.filter(n => {
        if (processed.has(n.id) || n.type !== 'imageGenerationNode') return false;
        const nScene = getSceneIdx(n);
        const nRun = getRunId(n);
        const isExactScene = nScene === sceneNum || nScene === Number(sceneNum);
        const isTargetTask = n.id.includes(spNode.id) || n.id === `img-gen-task-${spNode.id}` || n.id === `img-gen-task-${sceneNum}`;
        const isRunMatch = !runId || runId === 'default_run' || !nRun || nRun === 'default_run' || nRun === runId || n.id.includes(runId);
        return (isExactScene || isTargetTask) && isRunMatch;
      });

      genTaskNodes.forEach((taskNode, tIdx) => {
        updatedNodes.push({ ...taskNode, position: { x: 1240 + tIdx * 340, y: rowY } });
        processed.add(taskNode.id);
      });

      // Column 4+ (X = 1620+): All Generated Result Images belonging strictly to this scene & run (arranged horizontally side-by-side)
      const genImgNodes = nodes.filter(n => {
        if (processed.has(n.id) || n.type !== 'generatedImageNode') return false;
        const nScene = getSceneIdx(n);
        const nRun = getRunId(n);
        const isExactScene = nScene === sceneNum || nScene === Number(sceneNum);
        const isRunMatch = !runId || runId === 'default_run' || !nRun || nRun === 'default_run' || nRun === runId || n.id.includes(runId);
        return isExactScene && isRunMatch;
      });

      genImgNodes.forEach((imgNode, imgIdx) => {
        updatedNodes.push({ ...imgNode, position: { x: 1620 + imgIdx * 380, y: rowY } });
        processed.add(imgNode.id);
      });
    });

    const runOccupiedRows = Math.max(scenes.length, 1);
    currentRunY += runOccupiedRows * Y_ROW_STEP + RUN_GAP_Y;
  });

  // 3. Place any remaining unplaced nodes (notes, custom user nodes)
  let extraY = 100;
  nodes.forEach(n => {
    if (!processed.has(n.id) && n.type !== 'workflowStageGroupNode') {
      updatedNodes.push({ ...n, position: { x: 2000, y: extraY } });
      processed.add(n.id);
      extraY += 360;
    }
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

