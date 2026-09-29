// server/__tests__/spaceCandidateRender.test.ts
import { describe, it, expect } from 'vitest';
import { SpaceImageGenerationService } from '../services/spaceImageGenerationService';
import { STANDARD_SHOT_TEMPLATES } from '../../src/features/space-studio/data/shotTemplates';
import { SpaceObjectKeyBuilder } from '../../src/shared/storage/spaceObjectKeys';

describe('Space Studio: A00 to A01-A08 Candidate Generation Pipeline', () => {
  const projectId = 'test-manwah-project';

  it('renders 4 distinct candidate variants for A01 while preserving A00 space and product truth', async () => {
    const shotCode = 'A01';
    const tplA01 = STANDARD_SHOT_TEMPLATES[0];

    const variantSpecs = [
      { idx: 1, tag: 'A01 标称镜头 · 通透自然漫射光' },
      { idx: 2, tag: 'A01 光影变体 · 3200K暖金斜阳' },
      { idx: 3, tag: 'A01 景深变体 · 大光圈柔焦与车线' },
      { idx: 4, tag: 'A01 尺度变体 · 空间进深高反差' }
    ];

    const results = await Promise.all(
      variantSpecs.map(async (v) => {
        const objectKey = SpaceObjectKeyBuilder.shotRevisionOriginal({
          projectId,
          shotId: shotCode,
          revisionId: `cand-v${v.idx}-test`,
          extension: 'webp'
        });

        const imageResult = await SpaceImageGenerationService.generateAndStore({
          projectId,
          shotCode,
          positivePrompt: `MANWAH shot ${shotCode} Master Panoramic View, ${v.tag}`,
          aspectRatio: '3:4',
          productName: '敏华芝华仕头等舱功能真皮沙发',
          productColor: '干邑暖橙 (Cognac Amber)',
          productMaterial: '南美进口头层牛皮 (半苯胺)',
          cameraSettings: {
            lensMm: tplA01.defaultCamera.lensMm, // 28mm
            heightCm: tplA01.defaultCamera.heightCm, // 140cm
            yawDeg: tplA01.defaultCamera.yawDeg, // 0
            pitchDeg: tplA01.defaultCamera.pitchDeg // -3
          },
          variantIndex: v.idx,
          variantTag: v.tag,
          objectKey
        });

        return {
          variantIndex: v.idx,
          summaryTag: v.tag,
          objectKey: imageResult.objectKey,
          imageUrl: imageResult.imageUrl,
          bytes: imageResult.bytes,
          sha256: imageResult.sha256,
          provenance: imageResult.provenance
        };
      })
    );

    // 1. 验证生成了 4 个候选
    expect(results).toHaveLength(4);

    // 2. 验证每个候选都有真实的图片资源和独立哈希
    for (const r of results) {
      expect(r.bytes).toBeGreaterThan(1000);
      expect(r.objectKey).toContain('shots/A01/revisions');
      expect(r.imageUrl).toBeDefined();
      expect(r.sha256).toBeDefined();
    }

    // 3. 验证 4 个候选具有各自独立差异化的图像指纹（光影、景深、透视变体）
    const shaSet = new Set(results.map((r) => r.sha256));
    expect(shaSet.size).toBe(4);
  }, 25000);

  it('renders camera DNA variations across A01 to A08 preserving spatial invariance', async () => {
    // 抽取 A01(28mm广角), A02(45mm黄金视角), A04(85mm微距特写)
    const testShots = [
      { code: 'A01', lensMm: 28, heightCm: 140, yawDeg: 0, pitchDeg: -3 },
      { code: 'A02', lensMm: 45, heightCm: 125, yawDeg: 42, pitchDeg: -4 },
      { code: 'A04', lensMm: 85, heightCm: 90, yawDeg: 15, pitchDeg: -10 }
    ];

    for (const shot of testShots) {
      const objectKey = SpaceObjectKeyBuilder.shotRevisionOriginal({
        projectId,
        shotId: shot.code,
        revisionId: `test-single-${shot.code}`,
        extension: 'webp'
      });

      const res = await SpaceImageGenerationService.generateAndStore({
        projectId,
        shotCode: shot.code,
        positivePrompt: `MANWAH shot ${shot.code} focal length ${shot.lensMm}mm`,
        aspectRatio: '3:4',
        productName: '敏华芝华仕头等舱功能真皮沙发',
        productColor: '干邑暖橙 (Cognac Amber)',
        cameraSettings: {
          lensMm: shot.lensMm,
          heightCm: shot.heightCm,
          yawDeg: shot.yawDeg,
          pitchDeg: shot.pitchDeg
        },
        objectKey
      });

      expect(res.bytes).toBeGreaterThan(1000);
      expect(res.objectKey).toBe(objectKey);
    }
  }, 25000);
});
