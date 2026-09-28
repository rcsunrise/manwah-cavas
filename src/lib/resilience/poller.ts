/**
 * Resilient Poller with Circuit Breaker, Exponential Backoff + Jitter,
 * Tab Visibility change handling, and Fatal Error detection.
 */

import { CircuitBreaker } from './circuit-breaker';
import { classifySupabaseError, ClassifiedFailure } from './errors';
import { getBackoffDelay } from './backoff';
import { maintenanceManager } from './maintenance';

export type PollerState = 'idle' | 'running' | 'backoff' | 'paused' | 'circuit-open' | 'stopped';

export interface PollerOptions<T> {
  task: (signal: AbortSignal) => Promise<T>;
  baseIntervalMs?: number;
  maxIntervalMs?: number;
  maxFailures?: number;
  breaker?: CircuitBreaker;
  isTerminal?: (data: T) => boolean;
  shouldPause?: () => boolean;
  onData?: (data: T) => void;
  onFatalError?: (error: unknown, failure: ClassifiedFailure) => void;
  onStateChange?: (state: PollerState) => void;
}

export function createPoller<T>(options: PollerOptions<T>) {
  const baseIntervalMs = options.baseIntervalMs ?? 3000;
  const maxIntervalMs = options.maxIntervalMs ?? 60000;
  const maxFailures = options.maxFailures ?? 5;
  const breaker = options.breaker || new CircuitBreaker();

  let stopped = false;
  let timer: any = null;
  let controller: AbortController | null = null;
  let failureCount = 0;
  let inFlight = false;

  const schedule = (delayMs: number) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void run();
    }, delayMs);
  };

  const handleVisibilityOrMode = () => {
    if (stopped) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return true;
    }
    if (!maintenanceManager.isReadAllowed()) {
      return true;
    }
    if (options.shouldPause?.()) {
      return true;
    }
    return false;
  };

  const run = async (): Promise<void> => {
    if (stopped || inFlight) return;

    if (handleVisibilityOrMode()) {
      options.onStateChange?.('paused');
      schedule(Math.min(maxIntervalMs, 20_000));
      return;
    }

    if (!breaker.canRequest()) {
      options.onStateChange?.('circuit-open');
      schedule(maxIntervalMs);
      return;
    }

    inFlight = true;
    controller = new AbortController();

    try {
      options.onStateChange?.('running');
      const data = await options.task(controller.signal);

      if (stopped) return;

      failureCount = 0;
      breaker.recordSuccess();
      options.onData?.(data);

      if (options.isTerminal?.(data)) {
        stopped = true;
        options.onStateChange?.('stopped');
        return;
      }

      schedule(baseIntervalMs);
    } catch (error: any) {
      if (stopped || controller?.signal.aborted) return;

      const failure = classifySupabaseError(error);

      // Non-retryable error (e.g. 42703 schema drift, 401/403 auth, 404 not found)
      if (!failure.retryable) {
        stopped = true;
        options.onStateChange?.('stopped');
        console.error(`[Poller] Non-retryable fatal error encountered (${failure.kind}):`, failure.message);
        options.onFatalError?.(error, failure);
        return;
      }

      failureCount += 1;
      breaker.recordFailure();

      if (failureCount >= maxFailures) {
        options.onStateChange?.('circuit-open');
        schedule(maxIntervalMs);
        return;
      }

      options.onStateChange?.('backoff');
      const delay = getBackoffDelay({
        baseMs: baseIntervalMs,
        maxMs: maxIntervalMs,
        attempt: failureCount - 1,
      });
      schedule(delay);
    } finally {
      inFlight = false;
      controller = null;
    }
  };

  // Visibility change listener on client
  let visibilityListener: any = null;
  if (typeof document !== 'undefined') {
    visibilityListener = () => {
      if (document.visibilityState === 'visible' && !stopped && !inFlight) {
        schedule(100);
      }
    };
    document.addEventListener('visibilitychange', visibilityListener);
  }

  return {
    start() {
      if (stopped) stopped = false;
      schedule(0);
    },

    stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (controller) {
        controller.abort();
        controller = null;
      }
      if (typeof document !== 'undefined' && visibilityListener) {
        document.removeEventListener('visibilitychange', visibilityListener);
      }
      options.onStateChange?.('stopped');
    },

    isStopped() {
      return stopped;
    }
  };
}
