// src/features/space-studio/engine/humanErgonomicsEngine.ts
// MANWAH Space Studio｜人体工程与物理就座冲突校验引擎 (Ergonomics Engine) V5.0
// 强制纪律：
// 1. 物理就座几何不变量：臀部承重面（Hips Contact）、背部贴合（Backrest Contact）、双腿承托（Legs Support）；
// 2. 敏华头等舱机械互锁：若姿态要求 requiresFootrest=true，脚托不可处于 retracted 状态；反之若闭合端坐态，不可强行零重力悬浮；
// 3. 座位物理容量：同个 seatId 只能承载 1 位成人（或 1 位成人加 1 位贴靠儿童）；
// 4. 严禁穿模与悬空漂浮。

import {
  SeatAssignment,
  HumanAsset,
  PosePreset,
  HumanErgonomicsReport,
  ErgonomicsCheckIssue,
  FootrestMechanicalState
} from '../../../types/spaceStudio';
import { STANDARD_HUMAN_ASSETS, STANDARD_POSE_PRESETS } from '../data/humanPresets';

export interface EvaluateErgonomicsInput {
  assignments: SeatAssignment[];
  humans?: HumanAsset[];
  poses?: PosePreset[];
}

export class HumanErgonomicsEngine {
  /**
   * 对多模特就座方案执行人体工程与穿模约束检查
   */
  public static evaluate(input: EvaluateErgonomicsInput): HumanErgonomicsReport {
    const { assignments } = input;
    const humans = input.humans || STANDARD_HUMAN_ASSETS;
    const poses = input.poses || STANDARD_POSE_PRESETS;

    const issues: ErgonomicsCheckIssue[] = [];

    if (!assignments || assignments.length === 0) {
      return {
        passed: true,
        score: 100,
        totalHumans: 0,
        hipsContactRatio: 1.0,
        backSupportScore: 100,
        footrestAlignmentScore: 100,
        issues: [],
        evaluatedAt: new Date().toISOString()
      };
    }

    // 1. 检查座位容量冲突 (同一个 seatId 是否被重复占用)
    const seatOccupancy = new Map<string, SeatAssignment[]>();
    for (const a of assignments) {
      const list = seatOccupancy.get(a.seatId) || [];
      list.push(a);
      seatOccupancy.set(a.seatId, list);
    }

    for (const [seatId, list] of seatOccupancy.entries()) {
      if (list.length > 1) {
        // 允许 parent-child cuddle 例外（一人是 adult，一人是 child）
        const hasChild = list.some((item) => {
          const h = humans.find((m) => m.id === item.humanAssetId);
          return h?.role === 'boy' || h?.role === 'girl';
        });

        if (list.length > 2 || !hasChild) {
          const names = list
            .map((item) => humans.find((m) => m.id === item.humanAssetId)?.name.split(' ')[0] || item.humanAssetId)
            .join(' 与 ');
          issues.push({
            type: 'seat_capacity_exceeded',
            severity: 'error',
            seatId,
            humanName: names,
            message: `座位 [${seatId}] 存在物理穿模重叠：${names} 同时被分配到同一物理座包。`
          });
        }
      }
    }

    // 2. 检查每个分配项的人机工程相容性
    let hipsContactCount = 0;
    let backSupportPoints = 0;
    let footrestAlignmentPoints = 0;

    for (const a of assignments) {
      const human = humans.find((h) => h.id === a.humanAssetId);
      const pose = poses.find((p) => p.id === a.poseId);
      const humanName = human?.name.split(' ')[0] || a.humanAssetId;

      if (!human || !pose) {
        continue;
      }

      // 臀部承重点计算
      if (pose.seatRule.hipsOnSeat) {
        hipsContactCount++;
      } else {
        issues.push({
          type: 'unsupported_weight',
          severity: 'warning',
          seatId: a.seatId,
          humanName,
          message: `${humanName} 处于非稳定就座姿态，重心偏离座垫承重中心。`
        });
      }

      // 靠背贴合度
      if (pose.seatRule.backSupported) {
        backSupportPoints += 100;
      } else {
        backSupportPoints += 70; // 侧身倾谈或前倾喝咖啡
      }

      // 功能位与电动脚托机械互锁校验
      const footrestState: FootrestMechanicalState = a.footrestState || (a.functionState === 'recline' ? 'fully_extended' : 'retracted');

      if (pose.seatRule.requiresFootrest) {
        // 姿态需要脚托支持
        if (footrestState === 'retracted') {
          issues.push({
            type: 'footrest_mismatch',
            severity: 'error',
            seatId: a.seatId,
            humanName,
            message: `${humanName} 处于深躺/平躺姿态，但功能脚托未升起处于闭合态，双腿悬空失去支撑。`
          });
          footrestAlignmentPoints += 30;
        } else {
          footrestAlignmentPoints += 100;
        }
      } else {
        // 常规端坐姿态
        if (footrestState === 'fully_extended' || footrestState === 'zero_gravity') {
          issues.push({
            type: 'footrest_mismatch',
            severity: 'warning',
            seatId: a.seatId,
            humanName,
            message: `${humanName} 处于自然端坐姿态，但电动脚托完全展开，存在膝部过度拉伸或脚托空载。`
          });
          footrestAlignmentPoints += 60;
        } else {
          footrestAlignmentPoints += 100;
        }
      }
    }

    const n = assignments.length;
    const hipsContactRatio = n > 0 ? hipsContactCount / n : 1.0;
    const backSupportScore = n > 0 ? Math.round(backSupportPoints / n) : 100;
    const footrestAlignmentScore = n > 0 ? Math.round(footrestAlignmentPoints / n) : 100;

    // 综合人体工程分
    let score = Math.round(
      hipsContactRatio * 40 +
      (backSupportScore / 100) * 30 +
      (footrestAlignmentScore / 100) * 30
    );

    const hasError = issues.some((i) => i.severity === 'error');
    if (hasError) {
      score = Math.min(score, 65);
    }

    const passed = !hasError && score >= 75;

    return {
      passed,
      score,
      totalHumans: n,
      hipsContactRatio,
      backSupportScore,
      footrestAlignmentScore,
      issues,
      evaluatedAt: new Date().toISOString()
    };
  }

  /**
   * 快速自动修正人机姿态冲突（例如深躺时自动将脚托置为 fully_extended）
   */
  public static autoCorrectFootrest(assignment: SeatAssignment, pose?: PosePreset): SeatAssignment {
    const p = pose || STANDARD_POSE_PRESETS.find((item) => item.id === assignment.poseId);
    if (!p) return assignment;

    if (p.seatRule.requiresFootrest && assignment.footrestState === 'retracted') {
      return {
        ...assignment,
        functionState: 'recline',
        footrestState: 'fully_extended'
      };
    }

    if (!p.seatRule.requiresFootrest && (assignment.footrestState === 'fully_extended' || assignment.footrestState === 'zero_gravity')) {
      return {
        ...assignment,
        functionState: 'closed',
        footrestState: 'retracted'
      };
    }

    return assignment;
  }
}
