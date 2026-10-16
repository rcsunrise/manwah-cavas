import { describe, it, expect } from 'vitest';
import type { ShotInstance, ShotRevision } from '../../../types/spaceStudio';
import type { ShotCandidateBatch } from '../../../types/spaceAssetLibrary';

describe('SpaceStudio - 版本图片优先级与底部候选卡片联动校验', () => {
  const basePureSpaceRevision: ShotRevision = {
    id: 'rev-a01-base-1001',
    shotId: 'shot-a01',
    revisionNumber: 1,
    revisionType: 'scene',
    label: '纯空间 (v1)',
    metaSummary: '空间架构与家具基准 · 纯场景母版底图',
    objectKey: 'shots/a01/pure_space_master.webp',
    imageUrl: 'https://storage.googleapis.com/manwah/pure_space_ground_truth.webp',
    thumbnailUrl: 'https://storage.googleapis.com/manwah/pure_space_ground_truth.webp',
    promptSnapshotId: 'pure-spatial-snapshot-1',
    status: 'approved',
    score: {
      productIdentity: 98,
      placement: 98,
      sceneContinuity: 98,
      shotIntent: 98,
      overall: 98
    },
    provenance: 'DERIVED',
    productionTruth: true,
    createdAt: '2026-10-08T10:00:00.000Z'
  };

  const humanPassRevision: ShotRevision = {
    id: 'rev-a01-human-2002',
    shotId: 'shot-a01',
    revisionNumber: 2,
    revisionType: 'human',
    label: 'v2 · 4人模特入座方案',
    metaSummary: '模特自然落座 · 零形变商用精修',
    objectKey: 'shots/a01/human_pass_v2.webp',
    imageUrl: 'https://storage.googleapis.com/manwah/human_pass_final.webp',
    thumbnailUrl: 'https://storage.googleapis.com/manwah/human_pass_final.webp',
    promptSnapshotId: 'cand-human-v1-batch',
    status: 'approved',
    score: {
      productIdentity: 96,
      placement: 97,
      sceneContinuity: 95,
      shotIntent: 97,
      overall: 96
    },
    provenance: 'DERIVED',
    productionTruth: false,
    createdAt: '2026-10-08T10:05:00.000Z'
  };

  const humanCandidateBatch: ShotCandidateBatch = {
    shotId: 'shot-a01',
    batchId: 'batch-human-888',
    activeCandidateId: 'cand-human-01',
    createdAt: '2026-10-08T10:04:00.000Z',
    candidates: [
      {
        id: 'cand-human-01',
        variantIndex: 1,
        imageUrl: 'https://storage.googleapis.com/manwah/cand_human_01.webp',
        summaryTag: '现代意式极简 · 人物入座 · 黄金视觉金字塔',
        promptFragment: 'balanced family seating geometry',
        isFavorite: false,
        createdAt: '2026-10-08T10:04:00.000Z'
      },
      {
        id: 'cand-human-02',
        variantIndex: 2,
        imageUrl: 'https://storage.googleapis.com/manwah/cand_human_02.webp',
        summaryTag: '现代意式极简 · 人物入座 · 惬意生活特写',
        promptFragment: 'lifestyle portrait',
        isFavorite: false,
        createdAt: '2026-10-08T10:04:00.000Z'
      }
    ]
  };

  const pureSpaceCandidateBatch: ShotCandidateBatch = {
    shotId: 'shot-a01',
    batchId: 'batch-pure-777',
    activeCandidateId: 'cand-pure-01',
    createdAt: '2026-10-08T09:59:00.000Z',
    candidates: [
      {
        id: 'cand-pure-01',
        variantIndex: 1,
        imageUrl: 'https://storage.googleapis.com/manwah/cand_pure_01.webp',
        summaryTag: '现代意式极简 · 客厅 · 天然通透漫射光',
        promptFragment: 'clear architectural reflections',
        isFavorite: false,
        createdAt: '2026-10-08T09:59:00.000Z'
      }
    ]
  };

  it('1. 严格同构校验：当当前选中的版本为纯空间 (v1) 时，异构的人物候选批次被精确判定为不匹配', () => {
    const currentRevision = basePureSpaceRevision;
    const isRevisionHuman = Boolean(
      currentRevision.revisionType === 'human' ||
      currentRevision.id.includes('human') ||
      currentRevision.label?.includes('模特') ||
      currentRevision.label?.includes('人物')
    );

    const isBatchHuman = Boolean(
      humanCandidateBatch.candidates.some((c) =>
        Boolean(
          c.summaryTag?.includes('人物') ||
          c.summaryTag?.includes('模特') ||
          c.summaryTag?.toLowerCase().includes('human') ||
          c.id?.includes('human')
        )
      )
    );

    const isMatch = Boolean(
      currentRevision &&
      isRevisionHuman === isBatchHuman &&
      (
        humanCandidateBatch.candidates.some((c) => c.id === currentRevision.promptSnapshotId) ||
        (!isBatchHuman && !isRevisionHuman) ||
        (isBatchHuman && isRevisionHuman)
      )
    );

    expect(isRevisionHuman).toBe(false);
    expect(isBatchHuman).toBe(true);
    expect(isMatch).toBe(false); // 异构批次拦截生效
  });

  it('2. 画布取图优先级：当切换至纯空间 (v1) 且候选批次异构时，强制优先渲染纯空间 currentRevision.imageUrl', () => {
    const currentRevision = basePureSpaceRevision;
    const candidateBatch = humanCandidateBatch;
    const selectedCandidateId = 'cand-human-01'; // 残留的人物卡片

    const isRevisionHuman = Boolean(
      currentRevision.revisionType === 'human' ||
      currentRevision.id.includes('human') ||
      currentRevision.label?.includes('模特') ||
      currentRevision.label?.includes('人物')
    );

    const isBatchHuman = Boolean(
      candidateBatch.candidates.some((c) =>
        Boolean(
          c.summaryTag?.includes('人物') ||
          c.summaryTag?.includes('模特') ||
          c.summaryTag?.toLowerCase().includes('human') ||
          c.id?.includes('human')
        )
      )
    );

    const isCandidateBatchMatchingCurrentRevision = Boolean(
      candidateBatch &&
      currentRevision &&
      isRevisionHuman === isBatchHuman &&
      (
        candidateBatch.candidates.some((c) => c.id === currentRevision.promptSnapshotId) ||
        (!isBatchHuman && !isRevisionHuman) ||
        (isBatchHuman && isRevisionHuman)
      )
    );

    const activeCandidate = isCandidateBatchMatchingCurrentRevision
      ? (candidateBatch.candidates.find((c) => c.id === selectedCandidateId) || candidateBatch.candidates[0])
      : undefined;

    const revisionFinalUrl = currentRevision.imageUrl;

    const isExplicitCandidateSelected = Boolean(
      selectedCandidateId &&
      isCandidateBatchMatchingCurrentRevision &&
      candidateBatch.candidates.some((c) => c.id === selectedCandidateId)
    );

    const rawCandidateUrl =
      (isExplicitCandidateSelected ? activeCandidate?.imageUrl : undefined) ||
      revisionFinalUrl ||
      (isCandidateBatchMatchingCurrentRevision ? activeCandidate?.imageUrl : undefined);

    // 核心断言：画布展示纯空间真值大图，绝不被人物卡片遮蔽
    expect(isCandidateBatchMatchingCurrentRevision).toBe(false);
    expect(activeCandidate).toBeUndefined();
    expect(rawCandidateUrl).toBe(basePureSpaceRevision.imageUrl);
  });

  it('3. 底部抽屉联动：当切换回纯空间且通用批次为人物版时，candidateBatch 自动隔离为 null（收起人物抽屉）', () => {
    const activeShot: ShotInstance = {
      id: 'shot-a01',
      templateCode: 'A01',
      name: '空间主大全景',
      camera: {
        lensMm: 28,
        heightCm: 140,
        yawDeg: 0,
        pitchDeg: -3,
        rollDeg: 0,
        target: { type: 'zone', id: 'living_room' },
        framing: 'wide',
        mustInclude: ['all_living_zone'],
        mustExclude: []
      },
      intent: {
        intentCode: 'SI-01',
        name: '全案通透视野',
        productDominancePct: 45,
        backgroundSuppression: 'low',
        maxOcclusionPct: 5,
        description: '大气空间'
      },
      status: 'passed',
      currentRevisionId: basePureSpaceRevision.id,
      revisions: [basePureSpaceRevision, humanPassRevision],
      hasHumanPass: false
    };

    const revisionCandidateBatches: Record<string, ShotCandidateBatch> = {
      [humanPassRevision.id]: humanCandidateBatch
      // 纯空间版本无额外候选批次
    };
    const candidateBatches: Record<string, ShotCandidateBatch> = {
      [activeShot.id]: humanCandidateBatch // 通用批次残存人物版
    };

    // 模拟 SpaceStudioShell 底部抽屉 candidateBatch 计算
    const resolvedBatch = (() => {
      const currentRev = activeShot.revisions.find((r) => r.id === activeShot.currentRevisionId) || activeShot.revisions[0];
      const currentRevId = currentRev?.id;
      const isHumanRev = Boolean(
        currentRev?.revisionType === 'human' ||
        currentRev?.id?.includes('human') ||
        currentRev?.label?.includes('模特') ||
        currentRev?.label?.includes('人物')
      );

      if (currentRevId && revisionCandidateBatches[currentRevId]) {
        const revBatch = revisionCandidateBatches[currentRevId];
        const isBatchHuman = Boolean(
          revBatch.candidates?.some((c) =>
            c.summaryTag?.includes('人物') ||
            c.summaryTag?.includes('模特') ||
            c.summaryTag?.toLowerCase().includes('human') ||
            c.id?.includes('human')
          )
        );
        if (isHumanRev === isBatchHuman) {
          return revBatch;
        }
      }

      const rawBatch = candidateBatches[activeShot.id];
      if (!rawBatch || !currentRev) return null;

      const isRawBatchHuman = Boolean(
        rawBatch.candidates?.some((c) =>
          c.summaryTag?.includes('人物') ||
          c.summaryTag?.includes('模特') ||
          c.summaryTag?.toLowerCase().includes('human') ||
          c.id?.includes('human')
        )
      );

      if (isHumanRev !== isRawBatchHuman) {
        return null;
      }

      return rawBatch;
    })();

    // 核心断言：因为纯空间与人物批次异构，resolvedBatch 精确返回 null，人物候选抽屉暂时收起！
    expect(resolvedBatch).toBeNull();
  });

  it('4. 底部抽屉联动：当纯空间版本拥有其专属历史候选批次时，自动切回纯空间候选方案', () => {
    const activeShot: ShotInstance = {
      id: 'shot-a01',
      templateCode: 'A01',
      name: '空间主大全景',
      camera: {
        lensMm: 28,
        heightCm: 140,
        yawDeg: 0,
        pitchDeg: -3,
        rollDeg: 0,
        target: { type: 'zone', id: 'living_room' },
        framing: 'wide',
        mustInclude: ['all_living_zone'],
        mustExclude: []
      },
      intent: {
        intentCode: 'SI-01',
        name: '全案通透视野',
        productDominancePct: 45,
        backgroundSuppression: 'low',
        maxOcclusionPct: 5,
        description: '大气空间'
      },
      status: 'passed',
      currentRevisionId: basePureSpaceRevision.id,
      revisions: [basePureSpaceRevision, humanPassRevision],
      hasHumanPass: false
    };

    const revisionCandidateBatches: Record<string, ShotCandidateBatch> = {
      [basePureSpaceRevision.id]: pureSpaceCandidateBatch,
      [humanPassRevision.id]: humanCandidateBatch
    };

    const resolvedBatch = (() => {
      const currentRev = activeShot.revisions.find((r) => r.id === activeShot.currentRevisionId) || activeShot.revisions[0];
      const currentRevId = currentRev?.id;
      const isHumanRev = Boolean(
        currentRev?.revisionType === 'human' ||
        currentRev?.id?.includes('human') ||
        currentRev?.label?.includes('模特') ||
        currentRev?.label?.includes('人物')
      );

      if (currentRevId && revisionCandidateBatches[currentRevId]) {
        const revBatch = revisionCandidateBatches[currentRevId];
        const isBatchHuman = Boolean(
          revBatch.candidates?.some((c) =>
            c.summaryTag?.includes('人物') ||
            c.summaryTag?.includes('模特') ||
            c.summaryTag?.toLowerCase().includes('human') ||
            c.id?.includes('human')
          )
        );
        if (isHumanRev === isBatchHuman) {
          return revBatch;
        }
      }
      return null;
    })();

    // 核心断言：自动切换回纯空间专属方案
    expect(resolvedBatch).toBe(pureSpaceCandidateBatch);
    expect(resolvedBatch?.candidates[0].summaryTag).toContain('天然通透漫射光');
  });
});
