import { describe, expect, it } from 'vitest';
import {
  capEmptyPlateResolution,
  getEmptyPlateModelChain,
  runEmptyPlateModelChain
} from '../../../../server/routes/spaceShootRoutes';
import { describeGatewayFailure } from '../../../../server/services/spaceImageGenerationService';

const timeoutError = () => Object.assign(new Error('aborted'), { name: 'TimeoutError' });

describe('empty plate generation reliability', () => {
  it('caps 4K at 2K and leaves other resolutions alone', () => {
    expect(capEmptyPlateResolution('4K')).toBe('2K');
    expect(capEmptyPlateResolution('2K')).toBe('2K');
    expect(capEmptyPlateResolution('1K')).toBe('1K');
    expect(capEmptyPlateResolution(undefined)).toBe('2K');
  });

  it('uses only the selected model when auto fallback is off', () => {
    expect(getEmptyPlateModelChain('openai/gpt-image-2.6-sunburst-c', false)).toEqual(['openai/gpt-image-2.6-sunburst-c']);
  });

  it('adds up to two backup models when auto fallback is on', () => {
    const chain = getEmptyPlateModelChain('gemini-3.1-flash-image-preview', true);
    expect(chain[0]).toBe('gemini-3.1-flash-image-preview');
    expect(chain).toHaveLength(3);
    expect(new Set(chain).size).toBe(3);
  });

  it('moves to the next model after a timeout', async () => {
    const tried: string[] = [];
    const result = await runEmptyPlateModelChain(['a', 'b'], async (model) => {
      tried.push(model);
      if (model === 'a') throw timeoutError();
      return model;
    });
    expect(result).toBe('b');
    expect(tried).toEqual(['a', 'b']);
  });

  it('reports every model when all attempts fail', async () => {
    await expect(
      runEmptyPlateModelChain(['a', 'b'], async (model) => {
        throw model === 'a' ? timeoutError() : new Error('bad gateway');
      })
    ).rejects.toThrow('[a] 等待出图结果超过 330 秒，已停止等待（上游不一定失败）；[b] bad gateway');
  });

  it('tells rate limits and channel failures apart from other gateway errors', () => {
    expect(describeGatewayFailure({ category: 'rate_limited', message: 'quota' })).toBe('上游限流或额度不足（HTTP 429）：quota');
    expect(describeGatewayFailure({ category: 'upstream_unavailable', upstreamStatus: 503, message: 'busy' })).toBe('上游通道暂不可用（HTTP 503）：busy');
    expect(describeGatewayFailure({ category: 'timeout', message: '上游请求在 300 秒后超时。' })).toBe('上游请求在 300 秒后超时。');
    expect(describeGatewayFailure('plain error')).toBe('plain error');
    expect(describeGatewayFailure(undefined)).toBe('上游接口未返回有效图像数据');
  });
});
