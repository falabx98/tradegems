/**
 * Solana RPC Circuit Breaker
 *
 * Protects against cascading failures when Solana RPC is unavailable.
 *
 * States:
 *   CLOSED  — normal operation, all calls pass through
 *   OPEN    — RPC is down, calls rejected immediately (fast-fail)
 *   HALF_OPEN — testing if RPC recovered, limited calls allowed
 *
 * Transitions:
 *   CLOSED → OPEN: after `failureThreshold` consecutive failures
 *   OPEN → HALF_OPEN: after `resetTimeout` ms
 *   HALF_OPEN → CLOSED: after `halfOpenSuccesses` consecutive successes
 *   HALF_OPEN → OPEN: on any failure
 *
 * Every call has a configurable timeout (default 10s).
 * State changes are logged for observability.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitOpenError extends Error {
  constructor(message: string = 'Circuit breaker is OPEN — Solana RPC unavailable') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening circuit */
  failureThreshold?: number;
  /** Time in ms before transitioning OPEN → HALF_OPEN */
  resetTimeout?: number;
  /** Number of successes in HALF_OPEN before closing circuit */
  halfOpenSuccesses?: number;
  /** Timeout per RPC call in ms */
  callTimeout?: number;
  /** Name for logging */
  name?: string;
}

export class SolanaCircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private lastFailureAt: number | null = null;
  private halfOpenSuccessCount = 0;
  private totalCalls = 0;
  private totalFailures = 0;
  private lastStateChange = Date.now();

  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly halfOpenSuccesses: number;
  private readonly callTimeout: number;
  private readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 60_000; // 1 minute
    this.halfOpenSuccesses = options.halfOpenSuccesses ?? 2;
    this.callTimeout = options.callTimeout ?? 10_000; // 10 seconds
    this.name = options.name ?? 'SolanaRPC';
  }

  /**
   * Execute an RPC call through the circuit breaker.
   * Applies timeout and tracks failures for circuit state management.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;

    // Check if circuit should transition from OPEN → HALF_OPEN
    if (this.state === 'OPEN') {
      if (this.lastFailureAt && Date.now() - this.lastFailureAt > this.resetTimeout) {
        this.transitionTo('HALF_OPEN');
      } else {
        throw new CircuitOpenError(
          `${this.name} circuit is OPEN (${this.failures} failures, resets in ${Math.ceil((this.resetTimeout - (Date.now() - (this.lastFailureAt || 0))) / 1000)}s)`
        );
      }
    }

    try {
      // Execute with timeout
      const result = await this.withTimeout(fn(), this.callTimeout);
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  private onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.halfOpenSuccessCount++;
      if (this.halfOpenSuccessCount >= this.halfOpenSuccesses) {
        this.transitionTo('CLOSED');
      }
    } else {
      // Reset failure counter on success in CLOSED state
      this.failures = 0;
    }
  }

  private onFailure(err: unknown) {
    this.totalFailures++;
    this.failures++;
    this.lastFailureAt = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Any failure in HALF_OPEN → back to OPEN
      this.transitionTo('OPEN');
    } else if (this.state === 'CLOSED' && this.failures >= this.failureThreshold) {
      this.transitionTo('OPEN');
    }

    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[${this.name}] RPC call failed (${this.failures}/${this.failureThreshold}): ${errMsg.slice(0, 120)}`);
  }

  private transitionTo(newState: CircuitState) {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();

    if (newState === 'CLOSED') {
      this.failures = 0;
      this.halfOpenSuccessCount = 0;
    }
    if (newState === 'HALF_OPEN') {
      this.halfOpenSuccessCount = 0;
    }

    const level = newState === 'OPEN' ? 'error' : newState === 'HALF_OPEN' ? 'warn' : 'info';
    const msg = `[${this.name}] Circuit breaker: ${oldState} → ${newState}`;
    if (level === 'error') console.error(msg);
    else if (level === 'warn') console.warn(msg);
    else console.log(msg);
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`RPC call timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => { clearTimeout(timer); resolve(result); })
        .catch((err) => { clearTimeout(timer); reject(err); });
    });
  }

  /** Get current circuit state for monitoring */
  getStatus() {
    return {
      state: this.state,
      consecutiveFailures: this.failures,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      lastFailureAt: this.lastFailureAt ? new Date(this.lastFailureAt).toISOString() : null,
      lastStateChange: new Date(this.lastStateChange).toISOString(),
      failureThreshold: this.failureThreshold,
      resetTimeoutMs: this.resetTimeout,
    };
  }

  /** Check if circuit is allowing calls */
  isAvailable(): boolean {
    if (this.state === 'CLOSED' || this.state === 'HALF_OPEN') return true;
    if (this.state === 'OPEN' && this.lastFailureAt && Date.now() - this.lastFailureAt > this.resetTimeout) return true;
    return false;
  }
}

// ─── Singleton instance ─────────────────────────────────────

let instance: SolanaCircuitBreaker | null = null;

export function getSolanaCircuitBreaker(): SolanaCircuitBreaker {
  if (!instance) {
    instance = new SolanaCircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60_000,
      halfOpenSuccesses: 2,
      callTimeout: 10_000,
      name: 'SolanaRPC',
    });
  }
  return instance;
}
