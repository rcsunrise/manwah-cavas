/**
 * 省请求的轮询：
 * - 页面在后台标签页时不发请求，回到前台立即跑一次；
 * - 页面在前台但用户超过 IDLE_MS 没有任何操作（鼠标 / 键盘 / 触摸 / 滚动）也暂停，一有操作立即跑一次；
 * - tick 返回 { delay, evenIfIdle: true } 时（如视频任务进行中）用户闲置也继续轮询，等结果出来。
 * 返回停止函数。
 */
export const IDLE_MS = 2 * 60_000;

export type PollNext = number | { delay: number; evenIfIdle?: boolean };

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'focus'] as const;

let lastActivityAt = Date.now();
const activityListeners = new Set<() => void>();
let activityBound = false;
let lastMoveMark = 0;

function bindActivity() {
  if (activityBound || typeof window === 'undefined') return;
  activityBound = true;
  const mark = (e?: Event) => {
    const now = Date.now();
    // pointermove 很频繁：1 秒内只记一次
    if (e?.type === 'pointermove' && now - lastMoveMark < 1000) return;
    lastMoveMark = now;
    const wasIdle = now - lastActivityAt > IDLE_MS;
    lastActivityAt = now;
    if (wasIdle) activityListeners.forEach(fn => fn());
  };
  ACTIVITY_EVENTS.forEach(type => window.addEventListener(type, mark, { passive: true, capture: true }));
}

/** 测试用：模拟用户操作 / 重置 */
export function __markUserActivity(at = Date.now()) {
  const wasIdle = at - lastActivityAt > IDLE_MS;
  lastActivityAt = at;
  if (wasIdle) activityListeners.forEach(fn => fn());
}
export function __setLastActivity(at: number) {
  lastActivityAt = at;
}

export function isUserIdle(now = Date.now()): boolean {
  return now - lastActivityAt > IDLE_MS;
}

export function startVisibilityPoll(tick: () => Promise<PollNext>, firstDelayMs = 0): () => void {
  bindActivity();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let evenIfIdle = false;

  const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

  const schedule = (ms: number) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, ms);
  };

  const run = async () => {
    timer = null;
    if (stopped || running) return;
    if (isHidden()) return; // 后台不拉，等 visibilitychange
    if (!evenIfIdle && isUserIdle()) return; // 闲置不拉，等用户操作
    running = true;
    let next: PollNext = 60_000;
    try {
      next = await tick();
    } catch {
      // 调用方自己吞错；这里只保证继续调度
    } finally {
      running = false;
    }
    const delay = typeof next === 'number' ? next : next.delay;
    evenIfIdle = typeof next === 'object' && !!next.evenIfIdle;
    schedule(delay);
  };

  const wake = () => {
    if (!stopped && !isHidden() && !timer && !running) run();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', wake);
  activityListeners.add(wake);

  schedule(firstDelayMs);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', wake);
    activityListeners.delete(wake);
  };
}
