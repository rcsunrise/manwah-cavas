import { describe, expect, it } from 'vitest';
import { planCompression, UPLOAD_MAX_EDGE } from '../src/utils/imageCompress';

const MB = 1024 * 1024;

describe('上传压缩规则', () => {
  it('手机原图（4032×3024、6MB）缩到长边 2560，保持比例', () => {
    const p = planCompression({ width: 4032, height: 3024, size: 6 * MB, type: 'image/jpeg' });
    expect(p.action).toBe('compress');
    expect(p.targetWidth).toBe(UPLOAD_MAX_EDGE);
    expect(p.targetHeight).toBe(1920);
  });

  it('竖图按长边（高）算', () => {
    const p = planCompression({ width: 3000, height: 6000, size: 3 * MB, type: 'image/png' });
    expect(p).toEqual({ action: 'compress', targetWidth: 1280, targetHeight: 2560 });
  });

  it('尺寸不超限但文件大（无损 PNG）只重新编码不缩尺寸', () => {
    const p = planCompression({ width: 2048, height: 1536, size: 5 * MB, type: 'image/png' });
    expect(p).toEqual({ action: 'compress', targetWidth: 2048, targetHeight: 1536 });
  });

  it('小图不动，避免二次压缩损失', () => {
    expect(planCompression({ width: 1200, height: 900, size: 400 * 1024, type: 'image/jpeg' }).action).toBe('keep');
    expect(planCompression({ width: 2560, height: 1440, size: 1.5 * MB, type: 'image/webp' }).action).toBe('keep');
  });

  it('GIF/SVG/HEIC 等不处理，尺寸读不到也不处理', () => {
    expect(planCompression({ width: 5000, height: 5000, size: 9 * MB, type: 'image/gif' }).action).toBe('keep');
    expect(planCompression({ width: 5000, height: 5000, size: 9 * MB, type: 'image/svg+xml' }).action).toBe('keep');
    expect(planCompression({ width: 0, height: 0, size: 9 * MB, type: 'image/jpeg' }).action).toBe('keep');
  });
});
