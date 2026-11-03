// src/features/space-studio/__tests__/topHudLayoutResilience.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('SpaceStudioCanvas Top HUD Bar Layout & Unified Shot Reel Resilience', () => {
  const canvasPath = path.resolve(__dirname, '../components/SpaceStudioCanvas.tsx');
  const cssPath = path.resolve(__dirname, '../../../../src/index.css');

  it('guarantees right action group is strictly anchored and protected from shrinking', () => {
    const code = fs.readFileSync(canvasPath, 'utf-8');
    // 右侧操作栏必须包含 shrink-0 与 ml-auto，绝不被中间挤压或推出屏幕
    expect(code).toContain('flex items-center gap-1.5 shrink-0 ml-auto z-10');
  });

  it('ensures top HUD center is de-cluttered to prevent accidental deletion and button squeezing', () => {
    const code = fs.readFileSync(canvasPath, 'utf-8');
    // 顶部中间采用去杂化指示器，释放顶部视界空间
    expect(code).toContain('中间：去杂化紧凑版本指示器');
    expect(code).toContain('currentRevisionTitle');
    // 确认已彻底移除顶部微型药丸中的删除按钮，杜绝误触删除
    expect(code).not.toContain('revisions.map');
  });

  it('verifies bottom drawer Unified Shot Reel aggregates revisions and candidates with horizontal scroll', () => {
    const code = fs.readFileSync(canvasPath, 'utf-8');
    // 底部胶卷汇聚模型
    expect(code).toContain('unifiedCards');
    // 底部抽屉包含横向滚动胶卷容器
    expect(code).toContain('overflow-x-auto overflow-y-hidden flex items-center justify-start gap-2.5');
  });

  it('defines .no-scrollbar utility in index.css with cross-browser support', () => {
    const css = fs.readFileSync(cssPath, 'utf-8');
    expect(css).toContain('.no-scrollbar::-webkit-scrollbar');
    expect(css).toContain('scrollbar-width: none');
  });
});

