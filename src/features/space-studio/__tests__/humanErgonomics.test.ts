// src/features/space-studio/__tests__/humanErgonomics.test.ts
// MANWAH Space Studio｜G5 模特、家庭预设、脚托机械互锁与人体工程测试
import { describe, it, expect } from 'vitest';
import { HumanErgonomicsEngine } from '../engine/humanErgonomicsEngine';
import { STANDARD_FAMILY_PRESETS, STANDARD_HUMAN_ASSETS, STANDARD_POSE_PRESETS } from '../data/humanPresets';
import { SeatAssignment } from '../../../types/spaceStudio';

describe('G5: Human & Ergonomics Engine Suite', () => {
  it('Standard family presets pass ergonomics and capacity verification', () => {
    for (const fam of STANDARD_FAMILY_PRESETS) {
      const report = HumanErgonomicsEngine.evaluate({
        assignments: fam.defaultAssignments
      });
      expect(report.passed).toBe(true);
      expect(report.score).toBeGreaterThanOrEqual(80);
      expect(report.issues.filter((i) => i.severity === 'error').length).toBe(0);
    }
  });

  it('Detects footrest mismatch when human lounges with retracted footrest', () => {
    const invalidAssignment: SeatAssignment[] = [
      {
        humanAssetId: 'human-01',
        seatId: 'sofa_3s.left',
        poseId: 'pose-recline-lounge', // 需要脚托
        functionState: 'closed',
        footrestState: 'retracted'    // 错误闭合
      }
    ];

    const report = HumanErgonomicsEngine.evaluate({
      assignments: invalidAssignment
    });

    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.type === 'footrest_mismatch')).toBe(true);
  });

  it('Auto-correct resolves mechanical mismatch smoothly', () => {
    const invalid: SeatAssignment = {
      humanAssetId: 'human-01',
      seatId: 'sofa_3s.left',
      poseId: 'pose-recline-lounge',
      functionState: 'closed',
      footrestState: 'retracted'
    };

    const fixed = HumanErgonomicsEngine.autoCorrectFootrest(invalid);
    expect(fixed.functionState).toBe('recline');
    expect(fixed.footrestState).toBe('fully_extended');

    const report = HumanErgonomicsEngine.evaluate({
      assignments: [fixed]
    });
    expect(report.passed).toBe(true);
  });

  it('Detects seat capacity exceeded when multiple adults occupy same seat', () => {
    const crowded: SeatAssignment[] = [
      {
        humanAssetId: 'human-01',
        seatId: 'sofa_3s.left',
        poseId: 'pose-seated-relaxed',
        functionState: 'closed',
        footrestState: 'retracted'
      },
      {
        humanAssetId: 'human-02',
        seatId: 'sofa_3s.left', // 重复占据同一个座位
        poseId: 'pose-seated-relaxed',
        functionState: 'closed',
        footrestState: 'retracted'
      }
    ];

    const report = HumanErgonomicsEngine.evaluate({
      assignments: crowded
    });

    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.type === 'seat_capacity_exceeded')).toBe(true);
  });
});
