import { describe, expect, it } from 'vitest';
import { canvasImageFileBase } from '../downloadUtils';

const A = (extra: any = {}) => ({ screenTitle: '浮昼', templatePoster: { template: 'A', concept: { name: '浮昼' } }, ...extra });
describe('下载文件名：同一海报的各版本不重名', () => {
  it('原版、修改版、换细节版各不相同，带类型、名称和生成时间', () => {
    const names = [
      canvasImageFileBase('template-poster-a-1795057171560', A()),
      canvasImageFileBase('image-edit-1795058293826', A({ title: '浮昼 · 修改' })),
      canvasImageFileBase('image-edit-1795077346843', A({ title: '浮昼 · 换细节' })),
      canvasImageFileBase('image-edit-1795077999999', A({ title: '浮昼 · 换细节' }))
    ];
    expect(new Set(names).size).toBe(4);
    expect(names[0]).toMatch(/^MW_4-3海报_浮昼_\d{4}-\d{6}$/);
    expect(names[2]).toMatch(/^MW_4-3海报_浮昼-换细节_\d{4}-\d{6}$/);
  });
  it('没有时间戳的 id 用 id 尾部区分；文件名不含非法字符', () => {
    const n = canvasImageFileBase('gen-img-node-abc/xyz', { screenTitle: '第 1 屏: 主图?', sceneIndex: 2 });
    expect(n).toMatch(/^MW_分镜2_/);
    expect(n).not.toMatch(/[\s/\?%*:|"<>]/);
  });
});
