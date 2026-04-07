/**
 * Treasury health monitoring and circuit breaker.
 *
 * Uses TreasuryService for status determination (4 levels).
 * Updates circuit breaker state in Redis, auto-pauses/resumes games,
 * and publishes status changes to WS gateway for real-time frontend banners.
 *
 * Circuit breaker states (stored in Redis):
 *  - "healthy"     : full limits
 *  - "warning"     : max bets reduced by CIRCUIT_BREAKER_BET_REDUCTION (50%)
 *  - "critical"    : house games paused, only Trading Sim allowed
 *  - "maintenance" : ALL paused except Trading Sim, banner shown
 *
 * Thresholds (env-configurable):
 *  - TREASURY_LIQUIDITY_HEALTHY_LAMPORTS  (default 20 SOL)
 *  - TREASURY_LIQUIDITY_WARNING_LAMPORTS  (default  5 SOL)
 *  - TREASURY_LIQUIDITY_CRITICAL_LAMPORTS (default  1 SOL)
 */

import { sql } from 'drizzle-orm';
import { getDb } from '../config/database.js';
import { getRedis } from '../config/redis.js';
import { env } from '../config/env.js';
import { recordOpsAlert } from './opsAlert.js';
import type { TreasuryStatus } from '../modules/treasury/treasury.service.js';

// ─── Types ─────────────────────────────────────────────────

export type CircuitBreakerState = TreasuryStatus; // 'healthy' | 'warning' | 'critical' | 'maintenance'

export interface TreasuryHealth {
  onChainBalanceLamports: number;
  totalPendingWithdrawals: number;
  pendingWithdrawalCount: number;
  reserveRatio: number;
  availableLiquidity: number;
  circuitBreakerState: CircuitBreakerState;
  lastCheckedAt: string;
}

// Redis keys
const CB_STATE_KEY = 'treasury:circuit_breaker:state';
const CB_HEALTH_KEY = 'treasury:health:latest';
const CB_STATE_TTL = 120; // seconds — re-evaluate every 2 min max

// ─── Circuit breaker state ─────────────────────────────────

/**
 * Get current circuit breaker state from Redis cache.
 * Returns 'healthy' if Redis is unavailable (fail-open).
 */
export async function getCircuitBreakerState(): Promise<CircuitBreakerState> {
  try {
    const redis = getRedis();
    const state = await redis.get(CB_STATE_KEY);
    if (state === 'warning' || state === 'critical' || state === 'maintenance') return state as CircuitBreakerState;
    return 'healthy';
  } catch {
    return 'healthy'; // fail-open
  }
}

/**
 * Compute treasury status from on-chain balance.
 * Mirrors TreasuryService.computeStatus — pure function for use without service.
 */
export function computeTreasuryStatus(liquidityLamports: number): CircuitBreakerState {
  if (liquidityLamports > env.TREASURY_LIQUIDITY_HEALTHY_LAMPORTS) return 'healthy';
  if (liquidityLamports > env.TREASURY_LIQUIDITY_WARNING_LAMPORTS) return 'warning';
  if (liquidityLamports > env.TREASURY_LIQUIDITY_CRITICAL_LAMPORTS) return 'critical';
  return 'maintenance';
}

// ─── Treasury health evaluation ────────────────────────────

/**
 * Evaluate treasury health. Reads on-chain balance and pending withdrawals,
 * computes reserve ratio, and updates circuit breaker state.
 *
 * Called by:
 *  - sweepWorker (every 60s)
 *  - withdrawalProcessor worker (every 5min cycle)
 *  - admin treasury endpoint (on demand)
 */
export async function evaluateTreasuryHealth(
  onChainBalanceLamports: number,
): Promise<TreasuryHealth> {
  const db = getDb();
  const redis = getRedis();

  // Sum pending withdrawals
  const pendingResult = await db.execute(sql`
    SELECT COALESCE(COUNT(*), 0) as cnt,
           COALESCE(SUM(amount), 0) as total
    FROM withdrawals
    WHERE status IN ('pending', 'processing', 'pending_review')
  `) as any;
  const row = pendingResult[0] || { cnt: 0, total: 0 };
  const totalPendingWithdrawals = Number(row.total);
  const pendingWithdrawalCount = Number(row.cnt);

  // Reserve ratio
  const reserveRatio = totalPendingWithdrawals > 0
    ? onChainBalanceLamports / totalPendingWithdrawals
    : Infinity;

  // Available liquidity (after pending + buffer)
  const bufferMultiplier = 1 + (env.WITHDRAWAL_BUFFER_PERCENT / 100);
  const requiredReserve = totalPendingWithdrawals * bufferMultiplier;
  const availableLiquidity = onChainBalanceLamports - requiredReserve;

  // Determine state from 4-level system
  const newState = computeTreasuryStatus(onChainBalanceLamports);

  // Get previous state for transition detection
  const prevState = await getCircuitBreakerState();

  // Update Redis
  await redis.set(CB_STATE_KEY, newState, 'EX', CB_STATE_TTL);

  const health: TreasuryHealth = {
    onChainBalanceLamports,
    totalPendingWithdrawals,
    pendingWithdrawalCount,
    reserveRatio: reserveRatio === Infinity ? -1 : parseFloat(reserveRatio.toFixed(4)),
    availableLiquidity,
    circuitBreakerState: newState,
    lastCheckedAt: new Date().toISOString(),
  };

  // Cache health snapshot
  await redis.set(CB_HEALTH_KEY, JSON.stringify(health), 'EX', CB_STATE_TTL);

  // Handle state transitions
  if (newState !== prevState) {
    await handleStateTransition(prevState, newState, health);
  }

  // Alert on low reserve ratio (even within same state)
  if (reserveRatio !== Infinity && reserveRatio < 1.5 && totalPendingWithdrawals > 0) {
    recordOpsAlert({
      severity: reserveRatio < 1.0 ? 'critical' : 'warning',
      category: 'low_reserve_ratio',
      message: `Treasury reserve ratio ${reserveRatio.toFixed(2)}x — on-chain: ${(onChainBalanceLamports / 1e9).toFixed(4)} SOL, pending: ${(totalPendingWithdrawals / 1e9).toFixed(4)} SOL`,
      metadata: { onChainBalanceLamports, totalPendingWithdrawals, reserveRatio, pendingWithdrawalCount },
    }).catch(() => {});
  }

  // Alert on withdrawals delayed > 48 hours
  try {
    const staleResult = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM withdrawals
      WHERE status = 'delayed'
        AND created_at < ${new Date(Date.now() - 48 * 3600 * 1000).toISOString()}
    `) as any;
    const staleCnt = Number((staleResult as any).rows?.[0]?.cnt ?? staleResult[0]?.cnt ?? 0);
    if (staleCnt > 0) {
      recordOpsAlert({
        severity: 'critical',
        category: 'withdrawal_delayed',
        message: `${staleCnt} withdrawal(s) delayed > 48 hours — requires manual intervention`,
        metadata: { count: staleCnt },
      }).catch(() => {});
    }
  } catch { /* non-critical */ }

  return health;
}

/**
 * Get cached treasury health without re-evaluating.
 */
export async function getCachedTreasuryHealth(): Promise<TreasuryHealth | null> {
  try {
    const redis = getRedis();
    const cached = await redis.get(CB_HEALTH_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

// ─── State transition handling ─────────────────────────────

async function handleStateTransition(
  from: CircuitBreakerState,
  to: CircuitBreakerState,
  health: TreasuryHealth,
): Promise<void> {
  const balSol = (health.onChainBalanceLamports / 1e9).toFixed(4);
  const redis = getRedis();

  // Publish status change to WS gateway for real-time frontend banners
  try {
    await redis.publish('treasury:status_change', JSON.stringify({
      type: 'treasury.status_change',
      from,
      to,
      balanceSol: balSol,
      timestamp: Date.now(),
    }));
  } catch { /* non-critical */ }

  if (to === 'maintenance') {
    console.error(`[CircuitBreaker] MAINTENANCE — Treasury ${balSol} SOL below critical. ALL games paused except Trading Sim.`);
    await recordOpsAlert({
      severity: 'critical',
      category: 'circuit_breaker',
      message: `Circuit breaker MAINTENANCE: treasury ${balSol} SOL. All games paused except Trading Sim. Pending: ${health.pendingWithdrawalCount}`,
      metadata: { ...health, transition: `${from} → ${to}` },
    });
    await setAllHouseGamesEnabled(false);

  } else if (to === 'critical') {
    console.error(`[CircuitBreaker] CRITICAL — Treasury ${balSol} SOL. House games paused, Trading Sim only.`);
    await recordOpsAlert({
      severity: 'critical',
      category: 'circuit_breaker',
      message: `Circuit breaker CRITICAL: treasury ${balSol} SOL. House games paused, only Trading Sim available.`,
      metadata: { ...health, transition: `${from} → ${to}` },
    });
    await setAllHouseGamesEnabled(false);

  } else if (to === 'warning') {
    console.warn(`[CircuitBreaker] WARNING — Treasury ${balSol} SOL. Max bets reduced to ${env.CIRCUIT_BREAKER_BET_REDUCTION * 100}%.`);
    await recordOpsAlert({
      severity: 'warning',
      category: 'circuit_breaker',
      message: `Circuit breaker WARNING: treasury ${balSol} SOL. Max bets reduced to ${env.CIRCUIT_BREAKER_BET_REDUCTION * 100}%.`,
      metadata: { ...health, transition: `${from} → ${to}` },
    });
    // Re-enable house games if recovering from critical/maintenance
    if (from === 'critical' || from === 'maintenance') {
      await setAllHouseGamesEnabled(true);
    }

  } else if (to === 'healthy' && from !== 'healthy') {
    console.log(`[CircuitBreaker] HEALTHY — Treasury ${balSol} SOL. Full limits restored.`);
    await recordOpsAlert({
      severity: 'warning',
      category: 'circuit_breaker',
      message: `Circuit breaker HEALTHY: treasury ${balSol} SOL restored. Full limits active.`,
      metadata: { ...health, transition: `${from} → ${to}` },
    });
    // Re-enable house games if recovering from any degraded state
    if (from === 'critical' || from === 'maintenance') {
      await setAllHouseGamesEnabled(true);
    }
  }
}

/**
 * Enable or disable all house games via feature flags + Redis cache.
 * NOTE: Trading Sim (game_trading_sim_enabled) is NEVER disabled by circuit breaker.
 */
async function setAllHouseGamesEnabled(enabled: boolean): Promise<void> {
  const db = getDb();
  const redis = getRedis();
  // Trading Sim is intentionally excluded — it must always remain available
  const flagKeys = [
    'game_rug_enabled',
    'game_solo_enabled',
    'game_predictions_enabled',
    'game_candleflip_enabled',
  ];

  for (const flagKey of flagKeys) {
    try {
      await db.execute(sql`
        INSERT INTO feature_flags (flag_key, enabled, updated_at)
        VALUES (${flagKey}, ${enabled}, now())
        ON CONFLICT (flag_key)
        DO UPDATE SET enabled = ${enabled}, updated_at = now()
      `);
      await redis.del(`game:enabled:${flagKey}`);
    } catch (err) {
      console.error(`[CircuitBreaker] Failed to set ${flagKey} = ${enabled}:`, err);
    }
  }
}

/**
 * Check if treasury has sufficient liquidity for a withdrawal.
 * Returns { allowed, reason }.
 */
export async function checkWithdrawalLiquidity(
  amountLamports: number,
  onChainBalanceLamports: number,
): Promise<{ allowed: boolean; reason?: string }> {
  const bufferMultiplier = 1 + (env.WITHDRAWAL_BUFFER_PERCENT / 100);
  const requiredAfter = amountLamports * bufferMultiplier;

  if (onChainBalanceLamports < requiredAfter) {
    return {
      allowed: false,
      reason: `Insufficient treasury liquidity: on-chain ${(onChainBalanceLamports / 1e9).toFixed(4)} SOL, needed ${(requiredAfter / 1e9).toFixed(4)} SOL (including ${env.WITHDRAWAL_BUFFER_PERCENT}% buffer)`,
    };
  }

  // Don't process if it would drop below critical threshold
  if (onChainBalanceLamports - amountLamports < env.TREASURY_LIQUIDITY_CRITICAL_LAMPORTS) {
    return {
      allowed: false,
      reason: `Processing would drop treasury below critical threshold (${(env.TREASURY_LIQUIDITY_CRITICAL_LAMPORTS / 1e9).toFixed(2)} SOL)`,
    };
  }

  return { allowed: true };
}
