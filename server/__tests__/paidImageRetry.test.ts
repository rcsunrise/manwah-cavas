import { describe, expect, it } from 'vitest';
import { PAID_RETRY_MAX_ELAPSED_MS, shouldRetryPaidRequest } from '../lib/transientNetwork';
import { looksLikeEditInstruction } from '../services/imageTextEditService';
import { buildCanvasSummary, describePlanParams, extractAgentActions } from '../../src/utils/agentActionProtocol';

const socketDrop = () => {
  const e: any = new TypeError('fetch failed');
  e.cause = { code: 'UND_ERR_SOCKET', message: 'other side closed' };
  return e;
};

describe('收费生图请求断连后要不要重发', () => {
  it('很快就断（连不上/坏连接）：重发', () => {
    expect(shouldRetryPaidRequest(socketDrop(), 300)).toBe(true);
    expect(shouldRetryPaidRequest({ message: 'connect ECONNREFUSED' }, 50)).toBe(true);
  });

  it('等了很久才断（对方多半已在出图计费）：不重发', () => {
    // 2026-11-17 实例：Sunburst 跑了 62–86 秒，本机约 60 秒断开，重发 3 次被扣 3 次
    expect(shouldRetryPaidRequest(socketDrop(), 60_000)).toBe(false);
    expect(shouldRetryPaidRequest(socketDrop(), PAID_RETRY_MAX_ELAPSED_MS)).toBe(false);
  });

  it('不是网络断连的错误不重发', () => {
    expect(shouldRetryPaidRequest(new Error('HTTP 400: invalid size'), 100)).toBe(false);
  });
});

describe('改字的 newText 不能是整句要求', () => {
  it('拦下 2026-11-17 那句要求', () => {
    expect(
      looksLikeEditInstruction('底部三格细节图描述从左到右分别替换为：弧线轻拥，安放倦意；细处有韵，触见质感；柔软相伴，静享片刻。仅替换底部三处描述，保')
    ).toBe(true);
    expect(looksLikeEditInstruction('把标题改成栖境')).toBe(true);
    expect(looksLikeEditInstruction('弧线轻拥；安放倦意；细处有韵，触见质感')).toBe(true);
  });

  it('正常的海报文案放行', () => {
    for (const t of ['栖境', '弧线轻拥，安放倦意', '圆润包覆 · 分割缝线', '岩抱 · 山岩环抱，柔软在侧', '静享片刻']) {
      expect(looksLikeEditInstruction(t)).toBe(false);
    }
  });
});

describe('edit_image_text 一次改多处', () => {
  it('textEdits 解析成计划卡，每处单独列出', () => {
    const block =
      '{"plan":{"actionId":"edit_image_text","params":{"nodeId":"template-poster-a-1","textEdits":[{"oldText":"圆润包覆 · 分割缝线","newText":"弧线轻拥，安放倦意"},{"oldText":"细节二","newText":"细处有韵，触见质感"},{"newText":""}]}}}';
    const r = extractAgentActions(`好的，逐处修改。\n<agent_actions>${block}</agent_actions>`);
    expect(r.planCard?.actionId).toBe('edit_image_text');
    expect(r.planCard?.params?.textEdits).toEqual([
      { oldText: '圆润包覆 · 分割缝线', newText: '弧线轻拥，安放倦意' },
      { oldText: '细节二', newText: '细处有韵，触见质感' }
    ]);
    const items = describePlanParams('edit_image_text', r.planCard?.params);
    expect(items.map(i => i.label)).toEqual(['第 1 处', '第 2 处']);
  });

  it('画布摘要列出 4/3 产品海报的标题和底部三格文案', () => {
    const summary = buildCanvasSummary({
      planSettings: {},
      nodes: [
        {
          id: 'template-poster-a-1',
          type: 'generatedImageNode',
          data: {
            imageUrl: 'https://x/y.png',
            templatePoster: {
              template: 'A',
              concept: {
                name: '岩抱',
                subtitle: '山岩环抱，柔软在侧',
                details: [
                  { title: '弧面扶手', desc: '圆润包覆 · 分割缝线' },
                  { title: '缝线', desc: '双针明线 · 工整' },
                  { title: '坐垫', desc: '高回弹 · 久坐不塌' }
                ]
              }
            }
          }
        }
      ]
    });
    expect(summary).toContain('template-poster-a-1');
    expect(summary).toContain('主标题「岩抱」');
    expect(summary).toContain('第1格标题「弧面扶手」描述「圆润包覆 · 分割缝线」');
    expect(summary).toContain('第3格标题「坐垫」');
  });
});

describe('OCR 返回的 JSON 宽松解析', () => {
  it('字符串里带原始换行/制表符也能解析（2026-11-17 线上 Bad control character）', async () => {
    const { extractOcrLines, parseLooseJson } = await import('../services/imageTextEditService');
    const bad = '```json\n{"lines":[{"text":"饱满弧面\t柔和收边\n","left":200,"top":896,"right":318,"bottom":915}]}\n```';
    expect(() => JSON.parse(bad.slice(bad.indexOf('{'), bad.lastIndexOf('}') + 1))).toThrow();
    const lines = extractOcrLines(bad);
    expect(lines).toHaveLength(1);
    expect(lines[0].text.replace(/\s/g, '')).toBe('饱满弧面柔和收边');
    expect(parseLooseJson('{"a":1}')).toEqual({ a: 1 });
    expect(() => parseLooseJson('not json')).toThrow();
  });

  it('没有 JSON 或没有 lines 时返回空数组', async () => {
    const { extractOcrLines } = await import('../services/imageTextEditService');
    expect(extractOcrLines('图里没有文字')).toEqual([]);
    expect(extractOcrLines('{"foo":1}')).toEqual([]);
  });
});

describe('OCR 输出被硬换行（2026-11-17 线上 Expected , or } at position 261）', () => {
  it('换行插在数字和文字中间时，删掉换行即可还原', async () => {
    const { extractOcrLines } = await import('../services/imageTextEditService');
    // 实际抓到的返回片段：换行把 201 折成 20⏎1，把文案折成两段
    const wrapped =
      '{"lines":[{"text":"灵感源于圆弧扶手与峡谷岩壁\n的环抱姿态","left": 69, "top": 236, "right": \n353, "bottom": 257},{"text":"圆弧扶手","left": 20\n1, "top": 846, "right": 283, "bottom": 878},{"text":"饱\n满弧面 • 柔和收边","left": 200, "top": 896, "right": 318, "bottom": 915}]}';
    const lines = extractOcrLines(wrapped);
    expect(lines.map((l: any) => l.text)).toEqual(['灵感源于圆弧扶手与峡谷岩壁的环抱姿态', '圆弧扶手', '饱满弧面 • 柔和收边']);
    expect(lines[1].left).toBe(201);
    expect(lines[0].right).toBe(353);
  });
});
