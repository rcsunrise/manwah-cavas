import { describe, it, expect } from 'vitest';
import {
  computeLayoutTransform,
  validateNineScreenLayoutManifest,
  simplifyAspectRatio
} from '../src/lib/layoutGeometry';
import { NineScreenLayoutManifest, LayoutSlotSpec } from '../src/types/layoutManifest';

describe('C4B-4-R2: Layout Geometry Engine Tests', () => {
  it('should compute contain mode without cropping or stretching for 16:9 source in 2100x2800 slot', () => {
    const result = computeLayoutTransform({
      slotWidth: 2100,
      slotHeight: 2800,
      sourceWidth: 1920,
      sourceHeight: 1080, // 16:9
      fitMode: 'contain',
      focalPoint: { x: 0.5, y: 0.5 }
    });

    expect(result.scale).toBeCloseTo(2100 / 1920, 3);
    expect(result.displayWidth).toBe(2100);
    expect(result.displayHeight).toBeCloseTo(1181.25, 1);
    expect(result.offsetX).toBe(0);
    expect(result.offsetY).toBeCloseTo((2800 - 1181.25) / 2, 1);
    expect(result.isCropped).toBe(false);
    expect(result.cropRect).toBeNull();
  });

  it('should compute cover mode with focalPoint crop for 16:9 source in 2100x2800 slot', () => {
    const result = computeLayoutTransform({
      slotWidth: 2100,
      slotHeight: 2800,
      sourceWidth: 1920,
      sourceHeight: 1080,
      fitMode: 'cover',
      focalPoint: { x: 0.5, y: 0.5 }
    });

    // Scale is governed by height (2800 / 1080)
    expect(result.scale).toBeCloseTo(2800 / 1080, 3);
    expect(result.displayHeight).toBe(2800);
    expect(result.displayWidth).toBeCloseTo(1920 * (2800 / 1080), 1);
    expect(result.isCropped).toBe(true);
    expect(result.cropRect).not.toBeNull();
  });

  it('should simplify aspect ratios correctly', () => {
    expect(simplifyAspectRatio(1920, 1080)).toBe('16:9');
    expect(simplifyAspectRatio(1080, 1440)).toBe('3:4');
    expect(simplifyAspectRatio(1080, 1080)).toBe('1:1');
    expect(simplifyAspectRatio(2100, 2800)).toBe('3:4');
  });

  it('should validate a valid 9-screen layout manifest matching 9 standard posters', () => {
    const slots: LayoutSlotSpec[] = Array.from({ length: 9 }).map((_, idx) => ({
      sceneKey: `scene-${String(idx + 1).padStart(2, '0')}` as any,
      assetVersionId: `asset-ver-${idx + 1}-v001`,
      sourceWidth: 1920,
      sourceHeight: 1080,
      sourceAspectRatio: '16:9',
      targetWidth: 2100,
      slotHeight: 2800,
      layoutSlotRatio: '3:4',
      fitMode: 'contain',
      focalPoint: { x: 0.5, y: 0.5 },
      safeArea: { top: 0.08, right: 0.08, bottom: 0.08, left: 0.08 },
      reservedZones: [],
      subjectBounds: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
      backgroundColor: '#F7F4EF',
      validationStatus: 'valid',
      warnings: []
    }));

    const manifest: NineScreenLayoutManifest = {
      schemaVersion: 'layout-manifest/v1',
      manifestId: 'manifest_test_01',
      projectId: 'proj_test',
      canvasId: 'canvas_test',
      versionNumber: 1,
      versionCode: 'V001',
      widthPx: 2100,
      slots,
      status: 'draft',
      checksum: 'test_chk',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const val = validateNineScreenLayoutManifest(manifest);
    expect(val.valid).toBe(true);
    expect(val.canApprove).toBe(true);
    expect(val.globalErrors).toHaveLength(0);
  });
});
