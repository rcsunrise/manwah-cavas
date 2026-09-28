/**
 * Exponential Backoff with Jitter
 * Prevents thundering herds by adding randomized jitter to exponential delay intervals.
 */

export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
  attempt: number;
  jitterRatio?: number;
}

export function getBackoffDelay({
  baseMs,
  maxMs,
  attempt,
  jitterRatio = 0.25,
}: BackoffOptions): number {
  // Clamped exponential delay
  const exponential = Math.min(maxMs, baseMs * Math.pow(2, Math.min(attempt, 6)));
  // Random jitter
  const jitter = exponential * jitterRatio * Math.random();
  return Math.round(exponential + jitter);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
