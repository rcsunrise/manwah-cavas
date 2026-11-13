import { describe, expect, it } from 'vitest';
import { VIDEO_REVIEW_ALL, VIDEO_REVIEW_INTENT } from '../routes/agentConversationRoutes';

describe('agent · video review intent', () => {
  it.each([
    '检查一下视频跟构思的是否匹配',
    '看看这两段视频有没有问题',
    '视频里沙发有没有变形',
    '核对成片和分镜是否一致',
    '这条视频效果怎么样',
    '镜头需要调整吗'
  ])('triggers frame sampling for: %s', text => {
    expect(VIDEO_REVIEW_INTENT.test(text)).toBe(true);
  });

  it.each(['做视频分镜', '生成一张海报', '把背景换成客厅'])('does not trigger for: %s', text => {
    expect(VIDEO_REVIEW_INTENT.test(text)).toBe(false);
  });

  it('reviews both videos when the user says "两段/全部"', () => {
    expect(VIDEO_REVIEW_ALL.test('检查这两段视频')).toBe(true);
    expect(VIDEO_REVIEW_ALL.test('检查这条视频')).toBe(false);
  });
});
