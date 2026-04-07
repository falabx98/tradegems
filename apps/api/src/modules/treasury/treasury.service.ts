/**
 * Treasury Service — centralized liquidity monitoring.
 *
 * Computes real-time treasury status using on-chain balance and pending
 * withdrawal obligations. Result is cached for 30 seconds.
 *
 * Status levels (Bootstrap Nivel 2):
 *  - healthy:     currentLiquidity > 20 SOL
 *  - warning:     currentLiquidity 5–20 SOL  → max bets reduced 50%
 *  - critical:    currentLiquidity 1–5 SOL   → house games paused, Trading Sim only
 *  - maintenance: currentLiquidity < 1 SOL   → everything paused except Trading Sim
 */

import { sql } from 'drizzle-orm';
import { PublicKey } from '@solana/web3.js';
import { getDb } from '../../config/database.js';
import { getRedis } from '../../config/redis.js';
import { getSolanaConnection, getTreasuryAddress } from '../solana/treasury.js';
import { env } from '../../config/env.js';
import { recordOpsAlert } from '../../utils/opsAlert.js';

// ─── Types ─────────────────────────────────────────────────

export type TreasuryStatus = 'healthy' | 'warning' | 'critical' | 'maintenance';

export interface TreasuryStatusResult {
  totalDeposited: number;
  totalWithdrawn: number;
  pendingWithdrawals: number;
  pendingWithdrawalCount: number;
  currentLiquidity: number;        // on-chain balance in lamports
  reserveRatio: number;            // currentLiquidity / pendingWithdrawals (Infinity if no pending)
  status: TreasuryStatus;
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
      // RPC may fail — continue with 0 (will trigger maintenance)
    }

    // ── Aggregate deposit/withdrawal totals ──
    const [aggregates] = await this.db.execute(sql`
      SELECT
        COALESCE((SELECT SUM(amount) FROM deposits WHERE status = 'confirmed'), 0) as total_deposited,
        COALESCE((SELECT SUM(amount) FROM withdrawals WHERE status IN ('confirmed', 'completed')), 0) as total_withdrawn,
        COALESCE((SELECT SUM(amount) FROM withdrawals WHERE status IN ('pending', 'processing', 'pending_review')), 0) as pending_withdrawals,
        COALESCE((SELECT COUNT(*) FROM withdrawals WHERE status IN ('pending', 'processing', 'pending_review')), 0) as pending_count
    `) as any[];

    const totalDeposited = Number(aggregates?.total_deposited ?? 0);
    const totalWithdrawn = Number(aggregates?.total_withdrawn ?? 0);
    const pendingWithdrawals = Number(aggregates?.pending_withdrawals ?? 0);
    const pendingWithdrawalCount = Number(aggregates?.pending_count ?? 0);

    // ── Reserve ratio ──
    const reserveRatio = pendingWithdrawals > 0
      ? currentLiquidity / pendingWithdrawals
      : Infinity;

    // ── Status determination ──
    const status = this.computeStatus(currentLiquidity);

    const result: TreasuryStatusResult = {
      totalDeposited,
      totalWithdrawn,
      pendingWithdrawals,
      pendingWithdrawalCount,
      currentLiquidity,
      reserveRatio: reserveRatio === Infinity ? -1 : parseFloat(reserveRatio.toFixed(4)),
      status,
      lastCheckedAt: new Date().toISOString(),
    };

    // Cache result
    try {
      await redis.set(CACHE_KEY, JSON.stringify(result), 'EX', CACHE_TTL);
    } catch { /* non-critical */ }

    return result;
  }

  /**
   * Determine treasury status from on-chain liquidity.
   *
   * Thresholds (env-configurable):
   *  > HEALTHY  (20 SOL) → 'healthy'
   *  > WARNING  ( 5 SOL) → 'warning'
   *  > CRITICAL ( 1 SOL) → 'critical'
   *  ≤ CRITICAL ( 1 SOL) → 'maintenance'
   */
  computeStatus(currentLiquidityLamports: number): TreasuryStatus {
    if (currentLiquidityLamports > env.TREASURY_LIQUIDITY_HEALTHY_LAMPORTS) return 'healthy';
    if (currentLiquidityLamports > env.TREASURY_LIQUIDITY_WARNING_LAMPORTS) return 'warning';
    if (currentLiquidityLamports > env.TREASURY_LIQUIDITY_CRITICAL_LAMPORTS) return 'critical';
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
