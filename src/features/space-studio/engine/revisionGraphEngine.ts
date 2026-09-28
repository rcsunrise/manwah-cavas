// src/features/space-studio/engine/revisionGraphEngine.ts
// MANWAH Space Studio｜Revision Graph 版本有向图谱与溯源演进引擎 V4.0
// 强制纪律：
// 1. 真实版本 DAG 图谱，任何派生镜头均明确其 parentRevisionId 与分叉路径；
// 2. 严禁生产真值漂移，AI 估算/候选必须明确 provenance = 'AI_ESTIMATED' 且 productionTruth = false；
// 3. 只有通过 L2 裁判门禁并被人工签发确认后，方可升级为 'MANUAL_CONFIRMED'，允许并入生产资产库。

import {
  ShotInstance,
  ShotRevision,
  MultimodalValidationReport,
  ProvenanceLevel
} from '../../../types/spaceStudio';

export interface GraphNode {
  id: string;
  revisionNumber: number;
  parentRevisionId?: string;
  status: 'candidate' | 'current' | 'approved' | 'rejected';
  score?: number;
  gateLevel?: 'L0' | 'L1' | 'L2';
  provenance: ProvenanceLevel;
  productionTruth: boolean;
  createdAt: string;
  isHead: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
}

export interface RevisionGraphTopology {
  shotCode: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  headRevisionId?: string;
  approvedRevisionCount: number;
}

export class RevisionGraphEngine {
  /**
   * 构造单个镜头的版本分支 DAG 拓扑
   */
  public static buildTopology(shot: ShotInstance): RevisionGraphTopology {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    let approvedCount = 0;

    const currentHeadId = shot.currentRevisionId || (shot.revisions.length > 0 ? shot.revisions[0].id : undefined);

    for (const rev of shot.revisions) {
      if (rev.status === 'approved') {
        approvedCount++;
      }

      nodes.push({
        id: rev.id,
        revisionNumber: rev.revisionNumber,
        parentRevisionId: rev.parentRevisionId,
        status: rev.status,
        score: rev.score?.overall,
        gateLevel: rev.validationReport?.gateLevel,
        provenance: rev.provenance,
        productionTruth: rev.productionTruth,
        createdAt: rev.createdAt,
        isHead: rev.id === currentHeadId
      });

      if (rev.parentRevisionId) {
        edges.push({
          from: rev.parentRevisionId,
          to: rev.id,
          label: `v${rev.revisionNumber}`
        });
      }
    }

    return {
      shotCode: shot.templateCode,
      nodes,
      edges,
      headRevisionId: currentHeadId,
      approvedRevisionCount: approvedCount
    };
  }

  /**
   * 派生或创建新修订版本
   */
  public static createRevision(params: {
    shot: ShotInstance;
    parentRevisionId?: string;
    objectKey: string;
    promptSnapshotId: string;
    validationReport?: MultimodalValidationReport;
    manualConfirmed?: boolean;
  }): ShotRevision {
    const { shot, parentRevisionId, objectKey, promptSnapshotId, validationReport, manualConfirmed = false } = params;
    const nextRevisionNumber = shot.revisions.length + 1;
    const revId = `rev-${shot.templateCode.toLowerCase()}-${nextRevisionNumber}-${Date.now().toString(36)}`;

    const isApproved = validationReport ? validationReport.pass : false;
    const provenance: ProvenanceLevel = manualConfirmed
      ? 'MANUAL_CONFIRMED'
      : isApproved
      ? 'DERIVED'
      : 'AI_ESTIMATED';

    const productionTruth = manualConfirmed;

    const revision: ShotRevision = {
      id: revId,
      shotId: shot.id,
      revisionNumber: nextRevisionNumber,
      parentRevisionId,
      objectKey,
      promptSnapshotId,
      status: isApproved ? 'approved' : 'candidate',
      score: validationReport?.score,
      validationReport,
      provenance,
      productionTruth,
      createdAt: new Date().toISOString()
    };

    return revision;
  }

  /**
   * 生产门禁批准：人工确权将通过 L2 裁判的 Revision 设为 Production Truth
   */
  public static promoteToProductionTruth(revision: ShotRevision): ShotRevision {
    if (!revision.validationReport || !revision.validationReport.pass) {
      throw new Error('[RevisionGraphEngine] 无法提升未通过 L2 裁判门禁的版本为生产真值');
    }

    return {
      ...revision,
      status: 'approved',
      provenance: 'MANUAL_CONFIRMED',
      productionTruth: true
    };
  }
}
