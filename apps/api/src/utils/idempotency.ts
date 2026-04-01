/**
 * Settlement Idempotency Guard
 *
 * Prevents duplicate settlement execution using content-based Redis keys.
 * Key is derived from operation parameters (user + game + round + action + amount),
 * so the SAME operation always generates the SAME key.
 *
 * States:
 *   - Key doesn't exist → first attempt, proceed
 *   - Key = 'processing' → operation in progress, reject
 *   - Key = 'completed' → already settled, return cached result
 *
 * TTL: 300 seconds (5 minutes) — long enough for any retry scenario
 */
import { createHash } from 'crypto';
import { getRedis } from '../config/redis.js';

const DEFAULT_TTL = 300; // 5 minutes

interface IdempotencyParams {
  userId: string;
  gameType: string;
  gameId: string;
  action: string;        // 'settle' | 'cashout' | 'lock' | 'resolve'
  amount: number;
}

/**
 * Generate a deterministic idempotency key from settlement parameters.
 * Same operation always produces the same key.
 */
function generateKey(params: IdempotencyParams): string {
  const raw = `${params.userId}:${params.gameType}:${params.gameId}:${params.action}:${params.amount}`;
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 24);
  return `idem:${params.action}:${hash}`;
}

/**
 * Execute a settlement operation with idempotency protection.
 *
 * @param params - Operation parameters for key generation
 * @param fn - The actual settlement function to execute
 * @param ttl - Key TTL in seconds (default: 300)
 * @returns { duplicate: boolean, result: T }
 *
 * Behavior:
 * - First call: acquires key, executes fn, marks completed, returns result
 * - Duplicate call (completed): returns { duplicate: true } without re-executing
 * - Concurrent call (processing): throws 'SETTLEMENT_IN_PROGRESS'
 * - Failed call: deletes key so retry is allowed
 */
export async function withSettlementGuard<T>(
  params: IdempotencyParams,
  fn: () => Promise<T>,
  ttl: number = DEFAULT_TTL,
): Promise<{ duplicate: boolean; result: T | null }> {
  const redis = getRedis();
  const key = generateKey(params);

  // Try to acquire the key (NX = only if not exists)
  const acquired = await redis.set(key, 'processing', 'EX', ttl, 'NX');

  if (!acquired) {
    // Key already exists — check status
    const status = await redis.get(key);

    if (status === 'completed') {
      // Already settled successfully — return duplicate signal
      const cachedResult = await redis.get(`${key}:result`);
      return {
        duplicate: true,
        result: cachedResult ? JSON.parse(cachedResult) : null,
      };
    }

    if (status === 'processing') {
      // Another call is currently executing this settlement
      throw new Error('SETTLEMENT_IN_PROGRESS');
    }

    // Unknown status — treat as duplicate to be safe
    return { duplicate: true, result: null };
  }

  // We acquired the key — execute the settlement
  try {
    const result = await fn();

    // Mark as completed and cache result
    await redis.set(key, 'completed', 'EX', ttl);
    try {
      await redis.set(`${key}:result`, JSON.stringify(result), 'EX', ttl);
    } catch {
      // Result caching is non-critical
    }

    return { duplicate: false, result };
  } catch (err) {
    // Settlement failed — delete key so retry is allowed
    await redis.del(key).catch(() => {});
    throw err;
  }
}
