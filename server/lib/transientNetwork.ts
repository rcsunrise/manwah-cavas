/**
 * 判断是不是“网络断连”这类偶发错误（连接被代理 / 对端掐断、复用了失效的长连接）。
 * 这类错误换一个新连接重试同一个模型通常就好了，不应当算作“模型不可用”。
 * 本机经代理（Clash TUN / 127.0.0.1:7897）上网时，长时间运行的服务常复用到已被断开的连接，
 * 表现为一连串 fetch failed / UND_ERR_SOCKET，三个模型都被误判失败，海报一直“生成中”。
 */
const TRANSIENT_RE =
  /fetch failed|UND_ERR_SOCKET|UND_ERR_CLOSED|ECONNRESET|ECONNREFUSED|EPIPE|other side closed|socket hang up|terminated|network socket disconnected|Client network socket/i;

export function isTransientNetworkError(err: unknown): boolean {
  const e: any = err;
  const parts = [e?.message, e?.code, e?.cause?.code, e?.cause?.message, e?.cause?.cause?.code].filter(Boolean).join(' ');
  return TRANSIENT_RE.test(parts || String(err));
}

/** 重试前稍等一下，让代理把坏连接清掉 */
export function transientBackoff(attempt: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 600 * (attempt + 1)));
}
