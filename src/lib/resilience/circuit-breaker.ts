/**
 * Circuit Breaker implementation for isolated service domains
 * (e.g. Database/PostgREST, Auth, Storage, Render Worker)
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  domain?: string;
  failureThreshold?: number;
  cooldownMs?: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private openedAt = 0;
  private probeInFlight = false;
  public readonly domain: string;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  constructor(config?: CircuitBreakerConfig) {
    this.domain = config?.domain || 'default';
    this.failureThreshold = config?.failureThreshold ?? 5;
    this.cooldownMs = config?.cooldownMs ?? 60_000;
  }

  canRequest(): boolean {
    if (this.state === 'closed') return true;

    if (
      this.state === 'open' &&
      Date.now() - this.openedAt >= this.cooldownMs
    ) {
      this.state = 'half-open';
      this.probeInFlight = false;
    }

    if (this.state === 'half-open' && !this.probeInFlight) {
      this.probeInFlight = true;
      return true;
    }

    return false;
  }

  recordSuccess(): void {
    if (this.state !== 'closed') {
      console.log(`[CircuitBreaker:${this.domain}] Circuit closed (recovered).`);
    }
    this.state = 'closed';
    this.failures = 0;
    this.probeInFlight = false;
  }

  recordFailure(): void {
    this.probeInFlight = false;
    this.failures += 1;

    if (
      this.state === 'half-open' ||
      this.failures >= this.failureThreshold
    ) {
      this.state = 'open';
      this.openedAt = Date.now();
      console.warn(`[CircuitBreaker:${this.domain}] Circuit OPENED. Cooldown: ${this.cooldownMs}ms. Consecutive failures: ${this.failures}`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.openedAt = 0;
    this.probeInFlight = false;
  }
}

// Global registry of domain breakers
export const circuitBreakers = {
  database: new CircuitBreaker({ domain: 'database', failureThreshold: 5, cooldownMs: 30_000 }),
  storage: new CircuitBreaker({ domain: 'storage', failureThreshold: 4, cooldownMs: 30_000 }),
  renderJob: new CircuitBreaker({ domain: 'renderJob', failureThreshold: 5, cooldownMs: 30_000 }),
  auth: new CircuitBreaker({ domain: 'auth', failureThreshold: 4, cooldownMs: 30_000 }),
};
