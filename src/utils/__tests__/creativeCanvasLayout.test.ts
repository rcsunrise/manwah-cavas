import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { arrangeCleanTreeLayout, getNodeDimensions } from '../creativeCanvasLayout';

const node = (id: string, type: string, extra: Record<string, any> = {}, h = 420): Node => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: extra,
  measured: { width: 320, height: h }
} as any);

function overlaps(a: Node, b: Node): boolean {
  const da = getNodeDimensions(a);
  const db = getNodeDimensions(b);
  return a.position.x < b.position.x + db.width && b.position.x < a.position.x + da.width && a.position.y < b.position.y + db.height && b.position.y < a.position.y + da.height;
}

describe('arrangeCleanTreeLayout', () => {
  const product = node('img-node-1', 'productImageNode');
  const posters = Array.from({ length: 6 }, (_, i) => node(`template-poster-a-${i}`, 'generatedImageNode', { templatePoster: { template: 'A' } }, 520));
  const jobs = ['shot-1-a', 'shot-1-a', 'shot-2-b', 'shot-3-c'].map((shot, i) => ({ id: `vjob-${i}`, shotId: shot, createdAt: `2026-11-13T02:0${i}:00Z` }));
  const videoNodes = jobs.flatMap(job => [
    node(`node-video-gen-${job.id}`, 'videoGenerationNode', { job }, 300),
    node(`node-video-result-${job.id}`, 'videoResultNode', { job, assetVersionId: job.id }, 360)
  ]);
  const nodes = [product, ...posters, ...videoNodes];
  const edges: Edge[] = [
    ...posters.map(p => ({ id: `e-${p.id}`, source: 'img-node-1', target: p.id })),
    ...videoNodes.filter(n => n.type === 'videoGenerationNode').map(n => ({ id: `e-${n.id}`, source: 'img-node-1', target: n.id }))
  ] as Edge[];

  const { nodes: out } = arrangeCleanTreeLayout(nodes, edges);
  const byId = new Map(out.map(n => [n.id, n]));

  it('keeps every node and never overlaps two nodes', () => {
    expect(out).toHaveLength(nodes.length);
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) expect(overlaps(out[i], out[j])).toBe(false);
  });

  it('puts the source on the left and the results to its right', () => {
    const px = byId.get('img-node-1')!.position.x;
    posters.forEach(p => expect(byId.get(p.id)!.position.x).toBeGreaterThan(px));
  });

  it('lays a video task node and its result node side by side on one row', () => {
    for (const job of jobs) {
      const task = byId.get(`node-video-gen-${job.id}`)!;
      const result = byId.get(`node-video-result-${job.id}`)!;
      expect(result.position.y).toBe(task.position.y);
      expect(result.position.x).toBeGreaterThan(task.position.x);
    }
  });

  it('orders videos by shot number and keeps retries of one shot together (newest first)', () => {
    const y = (id: string) => byId.get(`node-video-gen-${id}`)!.position.y;
    const x = (id: string) => byId.get(`node-video-gen-${id}`)!.position.x;
    // shot-1 有两次重试（vjob-0 / vjob-1），新的 vjob-1 在上
    const shot1 = [y('vjob-0'), y('vjob-1')];
    expect(y('vjob-1')).toBeLessThan(y('vjob-0'));
    // 之后是 shot-2、shot-3（同一列内自上而下，或换到右边的子列）
    expect(x('vjob-2') > x('vjob-1') || y('vjob-2') > Math.max(...shot1)).toBe(true);
    expect(x('vjob-3') > x('vjob-2') || y('vjob-3') > y('vjob-2')).toBe(true);
  });

  it('wraps tall columns instead of making one endless vertical strip', () => {
    const maxY = Math.max(...out.map(n => n.position.y + getNodeDimensions(n).height));
    expect(maxY).toBeLessThan(4200);
  });
});
