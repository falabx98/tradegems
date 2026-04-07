/**
 * Treasury health monitoring and circuit breaker.
 *
 * Status is based on RESERVE RATIO (liquidity vs pending withdrawals):
 *  - "healthy"     : no pending withdrawals OR ratio >= 2.0
 *  - "warning"     : ratio 1.0–2.0
 *  - "critical"    : ratio 0.5–1.0
 *  - "maintenance" : ratio < 0.5
 *
 * Automatic game pausing is controlled by ENABLE_CIRCUIT_BREAKER (default false).
 * When disabled (bootstrap mode), status is computed for monitoring/alerts only.
 *
 * Manual kill switch:
 *  - Redis key 'treasury:kill_switch' = 'true' overrides everything
 *  - Toggled via POST /v1/admin/circuit-breaker/toggle
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
  circuitBreakerEnabled: boolean;
  killSwitchActive: boolean;
  lastCheckedAt: string;
}

// Redis keys
const CB_STATE_KEY = 'treasury:circuit_breaker:state';
const CB_HEALTH_KEY = 'treasury:health:latest';
const KILL_SWITCH_KEY = 'treasury:kill_switch';
const CB_STATE_TTL = 120; // seconds — re-evaluate every 2 min max

// ─── Kill switch ──────────────────────────────────────────

/**
 * Check if the manual kill switch is active.
 */
export async function isKillSwitchActive(): Promise<boolean> {
  try {
    const redis = getRedis();
    const val = await redis.get(KILL_SWITCH_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

/**
 * Toggle the manual kill switch. When active, all house games are paused
 * regardless of ENABLE_CIRCUIT_BREAKER or reserve ratio.
 */
export async function setKillSwitch(active: boolean): Promise<void> {
  const redis = getRedis();
  if (active) {
    await redis.set(KILL_SWITCH_KEY, 'true');
  } else {
    await redis.del(KILL_SWITCH_KEY);
  }
  // Immediately update game flags
  await setAllHouseGamesEnabled(!active);
  // Publish to WS gateway
  try {
    await redis.publish('treasury:status_change', JSON.stringify({
      type: 'treasury.kill_switch',
      active,
      timestamp: Date.now(),
    }));
  } catch { /* non-critical */ }
  await recordOpsAlert({
    severity: active ? 'critical' : 'warning',
    category: 'circuit_breaker',
    message: active
      ? 'Manual kill switch ACTIVATED — all house games paused by admin'
      : 'Manual kill switch DEACTIVATED — house games resumed by admin',
    metadata: { killSwitch: active },
  });
}

// ─── Circuit breaker state ─────────────────────────────────

/**
 * Get the effective circuit breaker state.
 * Kill switch overrides everything.
 * If ENABLE_CIRCUIT_BREAKER is false, always returns 'healthy'
 * (games are never auto-paused).
 */
export async function getCircuitBreakerState(): Promise<CircuitBreakerState> {
  try {
    // Kill switch takes priority
    if (await isKillSwitchActive()) return 'maintenance';

    // If auto circuit breaker is disabled, always healthy (no pausing)
    if (!env.ENABLE_CIRCUIT_BREAKER) return 'healthy';

    const redis = getRedis();
    const state = await redis.get(CB_STATE_KEY);
    if (state === 'warning' || state === 'critical' || state === 'maintenance') return state as CircuitBreakerState;
    return 'healthy';
  } catch {
    return 'healthy'; // fail-open
  }
}

/**
 * Compute treasury status from reserve ratio.
 * No pending withdrawals = healthy (nothing at risk).
 */
export function computeTreasuryStatus(liquidityLamports: number, pendingWithdrawalsLamports: number): CircuitBreakerState {
  if (pendingWithdrawalsLamports <= 0) return 'healthy';
  const ratio = liquidityLamports / pendingWithdrawalsLamports;
  if (ratio >= 2.0) return 'healthy';
  if (ratio >= 1.0) return 'warning';
  if (ratio >= 0.5) return 'critical';
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
  `);
  const row = (pendingResult as any).rows?.[0] ?? (pendingResult as any)[0] ?? { cnt: 0, total: 0 };
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

  // Determine state from reserve ratio
  const computedState = computeTreasuryStatus(onChainBalanceLamports, totalPendingWithdrawals);
  const killSwitchActive = await isKillSwitchActive();

  // Effective state: kill switch overrides, then auto circuit breaker
  let effectiveState = computedState;
  if (killSwitchActive) {
    effectiveState = 'maintenance';
  } else if (!env.ENABLE_CIRCUIT_BREAKER) {
    effectiveState = 'healthy'; // bootstrap mode: never auto-pause
  }

  // Get previous state for transition detection
  const prevState = await getCircuitBreakerState();

  // Update Redis with effective state
  await redis.set(CB_STATE_KEY, effectiveState, 'EX', CB_STATE_TTL);

  const health: TreasuryHealth = {
    onChainBalanceLamports,
    totalPendingWithdrawals,
    pendingWithdrawalCount,
    reserveRatio: reserveRatio === Infinity ? -1 : parseFloat(reserveRatio.toFixed(4)),
    availableLiquidity,
    circuitBreakerState: effectiveState,
    circuitBreakerEnabled: env.ENABLE_CIRCUIT_BREAKER,
    killSwitchActive,
    lastCheckedAt: new Date().toISOString(),
  };

  // Cache health snapshot
  await redis.set(CB_HEALTH_KEY, JSON.stringify(health), 'EX', CB_STATE_TTL);

  // Handle state transitions (only when circuit breaker is enabled or kill switch)
  if (effectiveState !== prevState && (env.ENABLE_CIRCUIT_BREAKER || killSwitchActive)) {
    await handleStateTransition(prevState, effectiveState, health);
  }

  // ── Informational alerts (always logged, regardless of circuit breaker) ──

  // Alert on low reserve ratio
  if (reserveRatio !== Infinity && reserveRatio < 1.5 && totalPendingWithdrawals > 0) {
    recordOpsAlert({
      severity: reserveRatio < 1.0 ? 'critical' : 'warning',
      category: 'low_reserve_ratio',
      message: `Treasury reserve ratio ${reserveRatio.toFixed(2)}x — on-chain: ${(onChainBalanceLamports / 1e9).toFixed(4)} SOL, pending: ${(totalPendingWithdrawals / 1e9).toFixed(4)} SOL`,
      metadata: { onChainBalanceLamports, totalPendingWithdrawals, reserveRatio, pendingWithdrawalCount },
    }).catch(() => {});
  }

  // Informational low-balance alerts (never triggers game pauses)
  if (onChainBalanceLamports < env.TREASURY_LIQUIDITY_CRITICAL_LAMPORTS && onChainBalanceLamports > 0) {
    recordOpsAlert({
      severity: 'warning',
      category: 'treasury',
      message: `Treasury balance low: ${(onChainBalanceLamports / 1e9).toFixed(4)} SOL (below ${(env.TREASURY_LIQUIDITY_CRITICAL_LAMPORTS / 1e9).toFixed(0)} SOL threshold). Informational only.`,
      metadata: { onChainBalanceLamports, threshold: env.TREASURY_LIQUIDITY_CRITICAL_LAMPORTS },
    }).catch(() => {});
  }

  // Alert on withdrawals delayed > 48 hours
  try {
    const staleResult = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM withdrawals
      WHERE status = 'delayed'
        AND created_at < ${new Date(Date.now() - 48 * 3600 * 1000).toISOString()}
    `);
    const staleCnt = Number((staleResult as any).rows?.[0]?.cnt ?? (staleResult as any)[0]?.cnt ?? 0);
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

  if (to === 'maintenance' || to === 'critical') {
    console.error(`[CircuitBreaker] ${to.toUpperCase()} — Treasury ${balSol} SOL. House games paused.`);
    await recordOpsAlert({
      severity: 'critical',
      category: 'circuit_breaker',
      message: `Circuit breaker ${to.toUpperCase()}: treasury ${balSol} SOL. Reserve ratio: ${health.reserveRatio}. Pending: ${health.pendingWithdrawalCount}`,
      metadata: { ...health, transition: `${from} → ${to}` },
    });
    await setAllHouseGamesEnabled(false);

  } else if (to === 'warning') {
    console.warn(`[CircuitBreaker] WARNING — Reserve ratio ${health.reserveRatio}. Max bets reduced to ${env.CIRCUIT_BREAKER_BET_REDUCTION * 100}%.`);
    await recordOpsAlert({
      severity: 'warning',
      category: 'circuit_breaker',
      message: `Circuit breaker WARNING: reserve ratio ${health.reserveRatio}. Max bets reduced to ${env.CIRCUIT_BREAKER_BET_REDUCTION * 100}%.`,
      metadata: { ...health, transition: `${from} → ${to}` },
    });
    if (from === 'critical' || from === 'maintenance') {
      await setAllHouseGamesEnabled(true);
    }

  } else if (to === 'healthy' && from !== 'healthy') {
    console.log(`[CircuitBreaker] HEALTHY — Reserve ratio restored. Full limits active.`);
    await recordOpsAlert({
      severity: 'warning',
      category: 'circuit_breaker',
      message: `Circuit breaker HEALTHY: reserve ratio restored. Full limits active.`,
      metadata: { ...health, transition: `${from} → ${to}` },
    });
    if (from === 'critical' || from === 'maintenance') {
      await setAllHouseGamesEnabled(true);
    }
  }
}

/**
 * Enable or disable all house games via feature flags + Redis cache.
 * NOTE: Trading Sim (game_trading_sim_enabled) is NEVER disabled by circuit breaker.
 */
export async function setAllHouseGamesEnabled(enabled: boolean): Promise<void> {
  const db = getDb();
  const redis = getRedis();
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

  return { allowed: true };
}
