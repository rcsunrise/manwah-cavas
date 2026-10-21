import { describe, it, expect } from 'vitest';
import { STANDARD_SHOT_TEMPLATES, getShotTemplateByCode } from '../data/shotTemplates';
import { ShotInstance, ImageAspectRatio } from '../../../types/spaceStudio';

describe('Shot Aspect Ratio Auto-Adaptation by Composition Planning', () => {
  it('correctly maps all standard templates to their commercial lookbook aspect ratios', () => {
    // 影棚实拍商业对齐画幅规划矩阵（最新真值标准）：
    // 7个横构图（4:3） + 2个竖构图（3:4）
    // A01: 4:3 (空间主大场景)
    // A02: 4:3 (45° 3+1 组合大全景)
    // A03: 4:3 (三人位主沙发场景)
    // A04: 3:4 (三分之二主沙亲子陪伴场景)
    // A05: 3:4 (三分之二主沙私享休闲景)
    // A06: 4:3 (零靠墙功能闭合侧景)
    // A07: 4:3 (沙发茶几组群中景)
    // A08: 4:3 (单椅五档功能状态景)
    // A09: 4:3 (餐厅配套展示组)
    const expectedMap: Record<string, ImageAspectRatio> = {
      A01: '4:3',
      A02: '4:3',
      A03: '4:3',
      A04: '3:4',
      A05: '3:4',
      A06: '4:3',
      A07: '4:3',
      A08: '4:3',
      A09: '4:3'
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
      return (tpl?.recommendedAspectRatio as ImageAspectRatio) || shot.aspectRatio || '4:3';
    };

    expect(resolvePlannedRatio(mockShots[0])).toBe('4:3');
    expect(resolvePlannedRatio(mockShots[1])).toBe('4:3');
    expect(resolvePlannedRatio(mockShots[2])).toBe('4:3');
    expect(resolvePlannedRatio(mockShots[3])).toBe('4:3');
    expect(resolvePlannedRatio(mockShots[4])).toBe('4:3');
    // Non-template shot falls back
    expect(resolvePlannedRatio({ templateCode: 'CUSTOM', aspectRatio: '1:1' })).toBe('1:1');
  });

  it('auto-heals polluted legacy snapshot aspect ratios to commercial lookbook standards', () => {
    // 模拟从历史快照中恢复出的带有错乱画幅的镜头列表（如用户截图中出现的 A01: 16:9, A04: 2:3, A06: 16:9 等）
    const legacyPollutedShots: Partial<ShotInstance>[] = [
      { id: 'shot-a01', templateCode: 'A01', name: '旧名称', aspectRatio: '16:9' as any },
      { id: 'shot-a02', templateCode: 'A02', name: '旧名称', aspectRatio: '2:3' as any },
      { id: 'shot-a03', templateCode: 'A03', name: '旧名称', aspectRatio: '2:3' as any },
      { id: 'shot-a04', templateCode: 'A04', name: '旧名称', aspectRatio: '2:3' as any },
      { id: 'shot-a05', templateCode: 'A05', name: '旧名称', aspectRatio: '2:3' as any },
      { id: 'shot-a06', templateCode: 'A06', name: '旧名称', aspectRatio: '16:9' as any },
      { id: 'shot-a07', templateCode: 'A07', name: '旧名称', aspectRatio: '16:9' as any },
      { id: 'shot-a08', templateCode: 'A08', name: '旧名称', aspectRatio: '16:9' as any },
      { id: 'shot-a09', templateCode: 'A09', name: '旧名称', aspectRatio: '16:9' as any },
    ];

    const healedShots = legacyPollutedShots.map((s) => {
      const tpl = getShotTemplateByCode(s.templateCode || '');
      if (!tpl) return s;
      const standardAspect = tpl.recommendedAspectRatio as ImageAspectRatio | undefined;
      return {
        ...s,
        name: tpl.name,
        aspectRatio: standardAspect || s.aspectRatio
      };
    });

    expect(healedShots.find(s => s.templateCode === 'A01')?.aspectRatio).toBe('4:3');
    expect(healedShots.find(s => s.templateCode === 'A02')?.aspectRatio).toBe('4:3');
    expect(healedShots.find(s => s.templateCode === 'A03')?.aspectRatio).toBe('4:3');
    expect(healedShots.find(s => s.templateCode === 'A04')?.aspectRatio).toBe('3:4');
    expect(healedShots.find(s => s.templateCode === 'A05')?.aspectRatio).toBe('3:4');
    expect(healedShots.find(s => s.templateCode === 'A06')?.aspectRatio).toBe('4:3');
    expect(healedShots.find(s => s.templateCode === 'A07')?.aspectRatio).toBe('4:3');
    expect(healedShots.find(s => s.templateCode === 'A08')?.aspectRatio).toBe('4:3');
    expect(healedShots.find(s => s.templateCode === 'A09')?.aspectRatio).toBe('4:3');
  });
});
