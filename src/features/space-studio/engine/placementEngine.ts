// src/features/space-studio/engine/placementEngine.ts
// MANWAH Space Studio｜摆位蓝图引擎 (Placement Blueprint Engine V3.0)
// 核心纪律：KEEP FURNITURE FIXED. CHANGE CAMERA ONLY.
import { PlacementBlueprint, PlacementItem, ProductAsset, SpacePreset } from '../../../types/spaceStudio';

export interface GeneratePlacementInput {
  spacePreset: SpacePreset;
  products: ProductAsset[];
}

export class PlacementEngine {
  /**
   * 基于空间原型及产品组合，生成确定性的黄金比例摆位蓝图
   */
  public static generateStandardBlueprint(input: GeneratePlacementInput): PlacementBlueprint {
    const { spacePreset, products } = input;
    const items: PlacementItem[] = [];

    const primarySofa = products.find((p) => p.role === 'sofa_3seat') || products[0];
    const recliner = products.find((p) => p.role === 'recliner_1seat');
    const coffeeTable = products.find((p) => p.role === 'coffee_table');
    const sideTable = products.find((p) => p.role === 'side_table');

    const livingZoneId = spacePreset.zones[0]?.id || 'living_zone';

    // 1. 核心主沙发 (Primary Sofa: 居中微偏后，面向观景区与主视角)
    if (primarySofa) {
      items.push({
        assetId: primarySofa.id,
        assetName: primarySofa.name,
        role: primarySofa.role,
        x: 0.5,
        y: 0.42,
        rotationDeg: 0, // 正对摄影机原点
        scale: 1.0,
        zoneId: livingZoneId
      });
    }

    // 2. 天然奢石茶几 (Coffee Table: 位于主沙发正前方 800mm~1200mm 规范开敞区间)
    if (coffeeTable) {
      items.push({
        assetId: coffeeTable.id,
        assetName: coffeeTable.name,
        role: coffeeTable.role,
        x: 0.5,
        y: 0.58,
        rotationDeg: 0,
        scale: 1.0,
        zoneId: livingZoneId
      });
    }

    // 3. 芝华仕功能单椅 (Recliner: 位于主沙发侧翼 40°~45° 黄金围合夹角，留足展开行程)
    if (recliner) {
      items.push({
        assetId: recliner.id,
        assetName: recliner.name,
        role: recliner.role,
        x: 0.28,
        y: 0.52,
        rotationDeg: 35, // 优雅朝向茶几与主客区
        scale: 1.0,
        zoneId: livingZoneId
      });
    }

    // 4. 边几 (Side Table: 位于主沙发右侧端头)
    if (sideTable) {
      items.push({
        assetId: sideTable.id,
        assetName: sideTable.name,
        role: sideTable.role,
        x: 0.74,
        y: 0.44,
        rotationDeg: -10,
        scale: 1.0,
        zoneId: livingZoneId
      });
    }

    return {
      id: `bp-${spacePreset.code.toLowerCase()}-${Date.now().toString(36)}`,
      spacePresetId: spacePreset.id,
      items,
      isLocked: true // 摆位默认锁定，确保后续镜头群组决不发生物理坐标漂移
    };
  }

  /**
   * 校验任意后续镜头是否违反“家具物理位置固定”原则
   */
  public static validatePlacementInvariance(
    baselineBlueprint: PlacementBlueprint,
    candidateItems: PlacementItem[]
  ): { pass: boolean; violations: string[] } {
    const violations: string[] = [];

    for (const baseItem of baselineBlueprint.items) {
      const match = candidateItems.find((c) => c.assetId === baseItem.assetId);
      if (!match) {
        violations.push(`缺失核心基准产品: ${baseItem.assetName} (${baseItem.assetId})`);
        continue;
      }

      // 允许微小的浮点舍入误差（0.01 归一化坐标 ≈ 空间 10cm 误差以内）
      const dx = Math.abs(match.x - baseItem.x);
      const dy = Math.abs(match.y - baseItem.y);
      const drot = Math.abs(match.rotationDeg - baseItem.rotationDeg);

      if (dx > 0.02 || dy > 0.02 || drot > 3) {
        violations.push(
          `产品 [${baseItem.assetName}] 发生违规物理位移漂移 (dx: ${(dx * 100).toFixed(1)}%, dy: ${(dy * 100).toFixed(1)}%, drot: ${drot.toFixed(1)}°)`
        );
      }
    }

    return {
      pass: violations.length === 0,
      violations
    };
  }
}
