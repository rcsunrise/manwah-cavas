/**
 * 按页面可见性轮询：页面在后台时不发请求，回到前台立即跑一次。
 * tick 返回下一次的间隔（毫秒）。返回停止函数。
 */
export function startVisibilityPoll(tick: () => Promise<number>, firstDelayMs = 0): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

  const schedule = (ms: number) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, ms);
  };

  const run = async () => {
    timer = null;
    if (stopped || running) return;
    if (isHidden()) return; // 后台不拉，等 visibilitychange 再继续
    running = true;
    let next = 60_000;
    try {
      next = await tick();
    } catch {
      // 调用方自己吞错；这里只保证继续调度
    } finally {
      running = false;
    }
    schedule(next);
  };

  const onVisible = () => {
    if (!isHidden() && !timer && !running) run();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);

  schedule(firstDelayMs);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
  };
}
