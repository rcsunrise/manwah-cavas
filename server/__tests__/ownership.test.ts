import { describe, expect, it } from 'vitest';
import { canAccessOwner } from '../routes/projectRoutes';

const req = (user?: any) => ({ user } as any);

describe('项目归属', () => {
  it('归属测试身份（0000…0001）的数据不再对所有人开放', () => {
    expect(canAccessOwner(req({ id: 'u-1', role: 'user' }), '00000000-0000-0000-0000-000000000001')).toBe(false);
  });

  it('本人和管理员可以访问，别人不行', () => {
    expect(canAccessOwner(req({ id: 'u-1', role: 'user' }), 'u-1')).toBe(true);
    expect(canAccessOwner(req({ id: 'admin', role: 'admin' }), 'u-1')).toBe(false);
    expect(canAccessOwner(req({ id: 'u-2', role: 'user' }), 'u-1')).toBe(false);
    expect(canAccessOwner(req(undefined), 'u-1')).toBe(false);
  });

  it('没有归属的旧数据照常可访问', () => {
    expect(canAccessOwner(req({ id: 'u-2', role: 'user' }), null)).toBe(true);
  });
});
