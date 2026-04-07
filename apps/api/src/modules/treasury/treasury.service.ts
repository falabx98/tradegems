/**
 * Treasury Service — centralized liquidity monitoring.
 *
 * Computes real-time treasury status using RESERVE RATIO (liquidity vs
 * pending withdrawals), not absolute balances. Result is cached for 30s.
 *
 * Status levels (Bootstrap Nivel 2 — deposits cover withdrawals):
 *  - healthy:     no pending withdrawals OR reserveRatio >= 2.0
 *  - warning:     reserveRatio 1.0–2.0 (can cover, but tight)
 *  - critical:    reserveRatio 0.5–1.0 (cannot fully cover pending)
 *  - maintenance: reserveRatio < 0.5 (grave situation)
 *
 * In bootstrap mode (ENABLE_CIRCUIT_BREAKER=false), status is still
 * computed for monitoring/alerting but does NOT trigger game pauses.
 */

import { sql } from 'drizzle-orm';
import { PublicKey } from '@solana/web3.js';
import { getDb } from '../../config/database.js';
import { getRedis } from '../../config/redis.js';
import { getSolanaConnection, getTreasuryAddress } from '../solana/treasury.js';
import { env } from '../../config/env.js';

// ─── Types ─────────────────────────────────────────────────

export type TreasuryStatus = 'healthy' | 'warning' | 'critical' | 'maintenance';

export interface TreasuryStatusResult {
  totalDeposited: number;
  totalWithdrawn: number;
  pendingWithdrawals: number;
  pendingWithdrawalCount: number;
  currentLiquidity: number;        // on-chain balance in lamports
  reserveRatio: number;            // currentLiquidity / pendingWithdrawals (-1 if no pending)
  status: TreasuryStatus;
  circuitBreakerEnabled: boolean;
  lastCheckedAt: string;
}

// ─── Cache ─────────────────────────────────────────────────

const CACHE_KEY = 'treasury:status:cached';
const CACHE_TTL = 30; // seconds

// ─── Service ───────────────────────────────────────────────

export class TreasuryService {
  private db = getDb();

  /**
   * Get full treasury status. Cached for 30s to avoid hammering DB/RPC.
   */
  async getTreasuryStatus(): Promise<TreasuryStatusResult> {
    const redis = getRedis();

    // Check cache first
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch { /* cache miss — compute fresh */ }

    // ── On-chain balance ──
    let currentLiquidity = 0;
    try {
      const conn = getSolanaConnection();
      const address = getTreasuryAddress();
      currentLiquidity = await conn.getBalance(new PublicKey(address));
    } catch {
      // RPC may fail — continue with 0
    }

    // ── Aggregate deposit/withdrawal totals ──
    const aggResult = await this.db.execute(sql`
      SELECT
        COALESCE((SELECT SUM(amount) FROM deposits WHERE status = 'confirmed'), 0) as total_deposited,
        COALESCE((SELECT SUM(amount) FROM withdrawals WHERE status IN ('confirmed', 'completed')), 0) as total_withdrawn,
        COALESCE((SELECT SUM(amount) FROM withdrawals WHERE status IN ('pending', 'processing', 'pending_review')), 0) as pending_withdrawals,
        COALESCE((SELECT COUNT(*) FROM withdrawals WHERE status IN ('pending', 'processing', 'pending_review')), 0) as pending_count
    `);
    const aggregates = (aggResult as any).rows?.[0] ?? (aggResult as any)[0] ?? {};

    const totalDeposited = Number(aggregates?.total_deposited ?? 0);
    const totalWithdrawn = Number(aggregates?.total_withdrawn ?? 0);
    const pendingWithdrawals = Number(aggregates?.pending_withdrawals ?? 0);
    const pendingWithdrawalCount = Number(aggregates?.pending_count ?? 0);

    // ── Reserve ratio ──
    const reserveRatio = pendingWithdrawals > 0
      ? currentLiquidity / pendingWithdrawals
      : Infinity;

    // ── Status determination (based on reserve ratio, not absolute balance) ──
    const status = this.computeStatus(currentLiquidity, pendingWithdrawals);

    const result: TreasuryStatusResult = {
      totalDeposited,
      totalWithdrawn,
      pendingWithdrawals,
      pendingWithdrawalCount,
      currentLiquidity,
      reserveRatio: reserveRatio === Infinity ? -1 : parseFloat(reserveRatio.toFixed(4)),
      status,
      circuitBreakerEnabled: env.ENABLE_CIRCUIT_BREAKER,
      lastCheckedAt: new Date().toISOString(),
    };

    // Cache result
    try {
      await redis.set(CACHE_KEY, JSON.stringify(result), 'EX', CACHE_TTL);
    } catch { /* non-critical */ }

    return result;
  }

  /**
   * Determine treasury status from reserve ratio.
   *
   * Bootstrap logic:
   *  - No pending withdrawals → always 'healthy' (nothing to pay)
   *  - reserveRatio >= 2.0 → 'healthy' (2x what we owe)
   *  - reserveRatio 1.0–2.0 → 'warning' (just enough)
   *  - reserveRatio 0.5–1.0 → 'critical' (less than we owe)
   *  - reserveRatio < 0.5 → 'maintenance' (grave)
   */
  computeStatus(currentLiquidityLamports: number, pendingWithdrawalsLamports: number): TreasuryStatus {
    // No pending withdrawals = nothing at risk
    if (pendingWithdrawalsLamports <= 0) return 'healthy';

    const ratio = currentLiquidityLamports / pendingWithdrawalsLamports;
    if (ratio >= 2.0) return 'healthy';
    if (ratio >= 1.0) return 'warning';
    if (ratio >= 0.5) return 'critical';
    return 'maintenance';
  }

  /**
   * Invalidate the cached status (call after significant balance change).
   */
  async invalidateCache(): Promise<void> {
    try {
      const redis = getRedis();
      await redis.del(CACHE_KEY);
    } catch { /* non-critical */ }
  }
}
