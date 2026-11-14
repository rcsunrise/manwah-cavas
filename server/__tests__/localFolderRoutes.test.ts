import { afterEach, describe, expect, it } from 'vitest';
import path from 'path';
import { isLocalFolderAllowed, resolveInside } from '../routes/localFolderRoutes';

const req = (addr: string) => ({ socket: { remoteAddress: addr } }) as any;

describe('本机文件夹读取的访问限制', () => {
  const env = process.env.NODE_ENV;
  const flag = process.env.LOCAL_FOLDER_ENABLED;
  afterEach(() => {
    process.env.NODE_ENV = env;
    if (flag === undefined) delete process.env.LOCAL_FOLDER_ENABLED;
    else process.env.LOCAL_FOLDER_ENABLED = flag;
  });

  it('开发环境 + 回环地址才放行', () => {
    process.env.NODE_ENV = 'development';
    expect(isLocalFolderAllowed(req('127.0.0.1'))).toBe(true);
    expect(isLocalFolderAllowed(req('::1'))).toBe(true);
    expect(isLocalFolderAllowed(req('::ffff:127.0.0.1'))).toBe(true);
    expect(isLocalFolderAllowed(req('192.168.1.8'))).toBe(false);
    expect(isLocalFolderAllowed(req('10.0.0.5'))).toBe(false);
  });

  it('生产环境一律关闭（云端部署不开放读服务器磁盘）', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.LOCAL_FOLDER_ENABLED;
    expect(isLocalFolderAllowed(req('127.0.0.1'))).toBe(false);
  });
});

describe('resolveInside', () => {
  const root = path.resolve('/tmp/fabric-root');
  it('只允许根目录之内的路径，挡住 .. 与绝对路径', () => {
    expect(resolveInside(root, 'a/b.jpg')).toBe(path.join(root, 'a', 'b.jpg'));
    expect(resolveInside(root, '../secret.jpg')).toBeNull();
    expect(resolveInside(root, 'a/../../secret.jpg')).toBeNull();
    expect(resolveInside(root, path.resolve('/etc/passwd'))).toBeNull();
  });
});
