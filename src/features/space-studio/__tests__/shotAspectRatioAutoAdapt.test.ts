import { describe, it, expect } from 'vitest';
import { STANDARD_SHOT_TEMPLATES, getShotTemplateByCode } from '../data/shotTemplates';
import { ShotInstance, ImageAspectRatio } from '../../../types/spaceStudio';

describe('Shot Aspect Ratio Auto-Adaptation by Composition Planning', () => {
  it('correctly maps all standard templates to their commercial lookbook aspect ratios', () => {
    // 影棚实拍商业对齐画幅规划矩阵：
    // A01: 16:9 (正大视角大平层建筑全景宽幅)
    // A02: 4:3 (45° 3+1 沙发组群成套全景)
    // A03: 4:3 (3人位主沙发功能位聚焦与茶几组合景)
    // A04: 2:3 (2/3主沙发亲子陪伴景，纵向构图)
    // A05: 2:3 (2/3主沙发私享休闲景，纵向构图)
    // A06: 16:9 (零靠墙功能展开景，宽屏侧身大透视)
    // A07: 16:9 (沙发茶几组群中景，宽屏)
    // A08: 16:9 (单椅五档多功能状态矩阵，宽屏固定机位)
    // A09: 16:9 (餐桌配套展示景，宽屏餐客一体全景)
    const expectedMap: Record<string, ImageAspectRatio> = {
      A01: '16:9',
      A02: '4:3',
      A03: '4:3',
      A04: '2:3',
      A05: '2:3',
      A06: '16:9',
      A07: '16:9',
      A08: '16:9',
      A09: '16:9'
    };

    for (const [code, expectedRatio] of Object.entries(expectedMap)) {
      const template = getShotTemplateByCode(code);
      expect(template, `Template ${code} should exist`).toBeDefined();
      expect(template?.recommendedAspectRatio, `Template ${code} recommendedAspectRatio`).toBe(expectedRatio);
    }
  });

  it('determines the planned aspect ratio accurately given shot instances', () => {
    const mockShots: Partial<ShotInstance>[] = [
      { id: 'shot-a00', templateCode: 'A00', aspectRatio: '4:3' },
      { id: 'shot-a01', templateCode: 'A01', aspectRatio: '16:9' },
      { id: 'shot-a02', templateCode: 'A02', aspectRatio: '3:4' },
      { id: 'shot-a07', templateCode: 'A07', aspectRatio: '16:9' },
      { id: 'shot-a08', templateCode: 'A08', aspectRatio: '3:4' },
      // Custom overridden shot
      { id: 'shot-a02-custom', templateCode: 'A02', aspectRatio: '1:1' }
    ];

    const resolvePlannedRatio = (shot: Partial<ShotInstance>): ImageAspectRatio => {
      const tpl = getShotTemplateByCode(shot.templateCode || '');
      return shot.aspectRatio || (tpl?.recommendedAspectRatio as ImageAspectRatio) || '4:3';
    };

    expect(resolvePlannedRatio(mockShots[0])).toBe('4:3');
    expect(resolvePlannedRatio(mockShots[1])).toBe('16:9');
    expect(resolvePlannedRatio(mockShots[2])).toBe('3:4');
    expect(resolvePlannedRatio(mockShots[3])).toBe('16:9');
    expect(resolvePlannedRatio(mockShots[4])).toBe('3:4');
    // User manual customization is respected
    expect(resolvePlannedRatio(mockShots[5])).toBe('1:1');
  });
});
