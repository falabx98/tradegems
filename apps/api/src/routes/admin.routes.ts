import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, lte, sql, ilike, or, count, sum, avg } from 'drizzle-orm';
import {
  rounds, bets, betResults, users, userProfiles, featureFlags,
  engineConfigs, adminAuditLogs, balances, balanceLedgerEntries,
  deposits, withdrawals, roundPools, roundNodes, riskFlags,
  userDepositWallets, referralCodes, referrals, referralEarnings,
  chatMessages, bonusCodes, bonusCodeRedemptions, failedSettlements,
} from '@tradingarena/db';
import { getDb } from '../config/database.js';
import { requireAdmin, requireRole, getAuthUser } from '../middleware/auth.js';
import { getTreasuryAddress, getSolanaConnection } from '../modules/solana/treasury.js';
import { DepositWalletService } from '../modules/solana/depositWallet.service.js';
import { retrySettlement } from '../utils/settlementRecovery.js';
import { getObservedRTP } from '../utils/payoutMonitor.js';
import { getPerformanceStats, getMoneyRoutePerformance } from '../utils/perfMonitor.js';
import { getRedis } from '../config/redis.js';
import { z, ZodError } from 'zod';

// ─── Admin Zod Schemas ──────────────────────────────────────

const uuidParams = z.object({ id: z.string().uuid() });
const userIdParams = z.object({ userId: z.string().uuid() });
const keyParams = z.object({ key: z.string().min(1).max(100) });

const updateUserBody = z.object({
  status: z.enum(['active', 'suspended', 'banned']).optional(),
  role: z.enum(['user', 'admin', 'superadmin']).optional(),
}).refine(d => d.status || d.role, { message: 'At least one field required' });

const resetAllDataBody = z.object({
  confirm: z.literal('RESET_ALL_DATA'),
});

const resetCasinoDataBody = z.object({
  confirmation: z.literal('RESET_CASINO_DATA'),
  reason: z.string().min(5).max(500),
});

const resetStatsBody = z.object({
  confirmation: z.literal('RESET_STATS'),
  reason: z.string().min(5).max(500),
});

const balanceAdjustmentBody = z.object({
  amount: z.number().int(),
  reason: z.string().min(5).max(500),
  asset: z.string().optional(),
});

const withdrawalApprovalBody = z.object({
  status: z.enum(['approved', 'rejected']),
  reason: z.string().optional(),
});

const engineConfigBody = z.object({
  config: z.record(z.unknown()),
});

const featureFlagUpdateBody = z.object({
  enabled: z.boolean().optional(),
  config: z.unknown().optional(),
}).refine(d => d.enabled !== undefined || d.config !== undefined, { message: 'At least one field required' });

const featureFlagCreateBody = z.object({
  flagKey: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  enabled: z.boolean().optional(),
  config: z.unknown().optional(),
});

const riskFlagResolveBody = z.object({
  notes: z.string().min(1).max(1000),
});

const bonusCodeCreateBody = z.object({
  code: z.string().min(2).max(50),
  description: z.string().optional(),
  type: z.string().optional(),
  amountLamports: z.number().int().positive(),
  maxUses: z.number().int().positive().optional(),
  maxPerUser: z.number().int().positive().optional(),
  minLevel: z.number().int().min(0).optional(),
  expiresAt: z.string().optional(),
});

const bonusCodeUpdateBody = z.object({
  active: z.boolean().optional(),
  maxUses: z.number().int().positive().optional(),
  expiresAt: z.string().optional(),
  description: z.string().optional(),
});

/** Parse body with Zod — throws 400 on invalid input */
function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      const issues = err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      const error = new Error(`Invalid input: ${issues}`) as any;
      error.statusCode = 400;
      throw error;
    }
    throw err;
  }
}

function parseParams<T>(schema: z.ZodSchema<T>, params: unknown): T {
  try {
    return schema.parse(params);
  } catch (err) {
    if (err instanceof ZodError) {
      const error = new Error('Invalid parameters') as any;
      error.statusCode = 400;
      throw error;
    }
    throw err;
  }
}

// ─── Admin Rate Limit Tiers ─────────────────────────────────
// Tier 1 (READ): 60 req/min — all GET endpoints
// Tier 2 (WRITE): 10 req/min — POST/PATCH/DELETE (normal ops)
// Tier 3 (DANGEROUS): 1 req/hour — destructive operations
const RATE_LIMIT_READ = { max: 60, timeWindow: '1 minute' };
const RATE_LIMIT_WRITE = { max: 10, timeWindow: '1 minute' };
const RATE_LIMIT_DANGEROUS = { max: 1, timeWindow: '1 hour' };

export async function adminRoutes(server: FastifyInstance) {
  const db = getDb();

  server.addHook('preHandler', requireAdmin);

  // Apply Redis-based rate limiting for admin GET endpoints (read tier)
  // Write/dangerous tiers use Fastify per-route config above
  server.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'GET') return; // Write endpoints handled by per-route config

    const user = getAuthUser(request);
    const redis = getRedis();
    const windowMinute = Math.floor(Date.now() / 60000);
    const key = `ratelimit:admin:read:${user.userId}:${windowMinute}`;

    const current = await redis.incr(key);
    if (current === 1) await redis.expire(key, 65); // slightly longer than window

    const remaining = Math.max(0, RATE_LIMIT_READ.max - current);
    reply.header('X-RateLimit-Tier', 'read');
    reply.header('X-RateLimit-Limit', RATE_LIMIT_READ.max);
    reply.header('X-RateLimit-Remaining', remaining);

    if (current > RATE_LIMIT_READ.max) {
      const ttl = await redis.ttl(key);
      reply.header('Retry-After', ttl > 0 ? ttl : 60);
      reply.code(429);
      throw new Error('Admin read rate limit exceeded (60/min)');
    }
  });

  // ═══════════════════════════════════════════════════════════
  //  DASHBOARD
  // ═══════════════════════════════════════════════════════════

  server.get('/dashboard/stats', async () => {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [roundCount] = await db.select({ total: count() }).from(rounds).where(gte(rounds.createdAt, since24h));
    const [betVolume] = await db.select({ total: sum(bets.amount) }).from(bets).where(gte(bets.createdAt, since24h));
    const [feeTotal] = await db.select({ total: sum(bets.fee) }).from(bets).where(gte(bets.createdAt, since24h));
    const [activeUserCount] = await db.select({ total: count() }).from(users).where(eq(users.status, 'active'));
    const [totalUserCount] = await db.select({ total: count() }).from(users);

    return {
      roundsToday: Number(roundCount?.total ?? 0),
      betVolumeToday: Number(betVolume?.total ?? 0),
      revenue24h: Number(feeTotal?.total ?? 0),
      activeUsers: Number(activeUserCount?.total ?? 0),
      totalUsers: Number(totalUserCount?.total ?? 0),
      houseEdge: Number(betVolume?.total ?? 0) > 0
        ? Number(feeTotal?.total ?? 0) / Number(betVolume?.total ?? 1)
        : 0,
    };
  });

  server.get('/dashboard/kpis', async (request) => {
    const { period } = request.query as { period?: string };
    const hours = period === '7d' ? 168 : period === '30d' ? 720 : 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [roundCount] = await db.select({ total: count() }).from(rounds).where(gte(rounds.createdAt, since));
    const [betStats] = await db.select({ volume: sum(bets.amount), fees: sum(bets.fee), bets: count() }).from(bets).where(gte(bets.createdAt, since));
    const [userCount] = await db.select({ total: count() }).from(users);

    return {
      rounds: Number(roundCount?.total ?? 0),
      betVolume: Number(betStats?.volume ?? 0),
      revenue: Number(betStats?.fees ?? 0),
      betCount: Number(betStats?.bets ?? 0),
      totalUsers: Number(userCount?.total ?? 0),
    };
  });

  // ═══════════════════════════════════════════════════════════
  //  USERS
  // ═══════════════════════════════════════════════════════════

  server.get('/users', async (request) => {
    const { limit, offset, search } = request.query as { limit?: string; offset?: string; search?: string };
    const lim = Math.min(Math.max(parseInt(limit || '50') || 50, 1), 200);
    const off = Math.max(parseInt(offset || '0') || 0, 0);

    // Escape LIKE special characters to prevent injection
    const escapeLike = (s: string) => s.replace(/[%_\\]/g, '\\$&');
    const conditions = search
      ? or(ilike(users.username, `%${escapeLike(search)}%`), ilike(users.email, `%${escapeLike(search)}%`))
      : undefined;

    const data = await db
      .select()
      .from(users)
      .where(conditions)
      .orderBy(desc(users.createdAt))
      .limit(lim)
      .offset(off);

    const [totalCount] = await db.select({ total: count() }).from(users).where(conditions);

    return { data, total: Number(totalCount?.total ?? 0) };
  });

  server.get('/users/:id', async (request) => {
    const { id } = parseParams(uuidParams, request.params);

    const user = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!user) return { error: 'User not found' };

    const profile = await db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, id) });
    const [bal] = await db.select().from(balances).where(eq(balances.userId, id));
    const recentBets = await db.select().from(bets).where(eq(bets.userId, id)).orderBy(desc(bets.createdAt)).limit(20);

    // Get bet results with round mode for each bet
    const recentResults = await db.execute(sql`
      SELECT br.final_multiplier, br.payout_amount, br.result_type, br.xp_awarded, br.created_at,
             b.amount as bet_amount, r.mode as game_mode
      FROM bet_results br
      JOIN bets b ON b.id = br.bet_id
      JOIN rounds r ON r.id = br.round_id
      WHERE br.user_id = ${id}
      ORDER BY br.created_at DESC LIMIT 20
    `) as unknown as Array<Record<string, unknown>>;

    // Get prediction rounds
    const predictions = await db.execute(sql`
      SELECT direction, result, bet_amount, payout, multiplier, created_at
      FROM prediction_rounds
      WHERE user_id = ${id}
      ORDER BY created_at DESC LIMIT 20
    `) as unknown as Array<Record<string, unknown>>;

    // Get ledger entries (deposits, withdrawals, bonuses)
    const ledgerEntries = await db.execute(sql`
      SELECT entry_type, amount, balance_after, reference_type, created_at
      FROM balance_ledger_entries
      WHERE user_id = ${id}
      ORDER BY created_at DESC LIMIT 30
    `) as unknown as Array<Record<string, unknown>>;

    return {
      ...user,
      avatarUrl: profile?.avatarUrl ?? null,
      availableAmount: bal?.availableAmount ?? 0,
      lockedAmount: bal?.lockedAmount ?? 0,
      pendingAmount: bal?.pendingAmount ?? 0,
      totalWagered: profile?.totalWagered ?? 0,
      totalWon: profile?.totalWon ?? 0,
      roundsPlayed: profile?.roundsPlayed ?? 0,
      bestMultiplier: profile?.bestMultiplier ?? '1.0',
      winRate: profile?.winRate ?? '0.0',
      recentBets,
      recentResults,
      predictions,
      ledgerEntries,
    };
  });

  server.patch('/users/:id', { config: { rateLimit: RATE_LIMIT_WRITE }, preHandler: [requireRole('support', 'operator', 'admin', 'superadmin')] }, async (request) => {
    const { id } = parseParams(uuidParams, request.params);
    const { status, role } = parseBody(updateUserBody, request.body);
    const actor = getAuthUser(request);

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (status) update.status = status;
    if (role) update.role = role;

    await db.update(users).set(update).where(eq(users.id, id));

    await db.insert(adminAuditLogs).values({
      actorUserId: actor.userId,
      actionType: status ? 'user_status_change' : 'user_role_change',
      targetType: 'user',
      targetId: id,
      payload: { status, role },
      ipAddress: request.ip,
    });

    return { success: true };
  });

  // Reset user game stats (removes from leaderboards while keeping account)
  server.post('/users/:id/reset-stats', { config: { rateLimit: RATE_LIMIT_DANGEROUS }, preHandler: [requireRole('superadmin')] }, async (request) => {
    const { id } = parseParams(uuidParams, request.params);
    const { reason } = parseBody(resetStatsBody, request.body);
    const actor = getAuthUser(request);

    await db.execute(sql`
      UPDATE user_profiles
      SET total_wagered = 0,
          total_won = 0,
          rounds_played = 0,
          best_multiplier = '1.0',
          win_rate = '0.0',
          current_streak = 0,
          best_streak = 0,
          updated_at = now()
      WHERE user_id = ${id}
    `);

    await db.insert(adminAuditLogs).values({
      actorUserId: actor.userId,
      actionType: 'user_stats_reset',
      targetType: 'user',
      targetId: id,
      payload: { reason },
      ipAddress: request.ip,
    });

    return { success: true, message: 'User stats reset' };
  });

  // ── FULL CASINO RESET — wipe all game data, keep user accounts ──
  // BLOCKED in production — use CLI script instead
  server.post('/reset-all-data', { config: { rateLimit: RATE_LIMIT_DANGEROUS } }, async (request, reply) => {
    // Block in production
    if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
      reply.code(403);
      return { error: 'Reset is disabled in production. Use CLI: npx tradegems-reset' };
    }
    const actor = getAuthUser(request);
    // Only superadmin can reset
    if (actor.role !== 'superadmin') {
      reply.code(403);
      return { error: 'Only superadmin can perform full reset' };
    }
    parseBody(resetAllDataBody, request.body);

    // Order matters: delete children before parents (FK constraints)
    await db.execute(sql`
      -- Game results and bets
      DELETE FROM candleflip_round_bets;
      DELETE FROM candleflip_rounds;
      DELETE FROM rug_round_bets;
      DELETE FROM rug_rounds;
      DELETE FROM rug_games;
      DELETE FROM candleflip_games;
      DELETE FROM trading_sim_trades;
      DELETE FROM trading_sim_participants;
      DELETE FROM trading_sim_rooms;
      DELETE FROM lottery_winners;
      DELETE FROM lottery_tickets;
      DELETE FROM lottery_draws;
      DELETE FROM prediction_rounds;

      -- Solo/Battle game data
      DELETE FROM bet_results;
      DELETE FROM bets;
      DELETE FROM round_nodes;
      DELETE FROM round_events;
      DELETE FROM round_pools;
      DELETE FROM rounds;
      DELETE FROM tournament_participants;
      DELETE FROM tournaments;

      -- Activity and social
      DELETE FROM activity_feed_items;
      DELETE FROM leaderboard_snapshots;
      DELETE FROM chat_messages;

      -- Rewards and progression
      DELETE FROM daily_rewards;
      DELETE FROM user_mission_progress;
      DELETE FROM user_achievements;
      DELETE FROM season_pass_claims;
      DELETE FROM referral_earnings;
      DELETE FROM bonus_code_redemptions;

      -- Ledger (transaction history)
      DELETE FROM balance_ledger_entries;

      -- Reset all balances to 0
      UPDATE balances SET
        available_amount = 0,
        locked_amount = 0,
        pending_amount = 0,
        bonus_amount = 0,
        updated_at = now();

      -- Reset all user stats
      UPDATE user_profiles SET
        total_wagered = 0,
        total_won = 0,
        rounds_played = 0,
        best_multiplier = '1.0',
        win_rate = '0.0',
        current_streak = 0,
        best_streak = 0,
        updated_at = now();

      -- Reset user XP and level (fresh start)
      UPDATE users SET
        level = 1,
        xp_total = 0,
        xp_current = 0,
        xp_to_next = 100,
        bonus_claimed = false,
        vip_tier = 'bronze',
        updated_at = now();
    `);

    await db.insert(adminAuditLogs).values({
      actorUserId: actor.userId,
      actionType: 'full_casino_reset',
      targetType: 'system',
      targetId: 'all',
      payload: { timestamp: Date.now() },
      ipAddress: request.ip,
    });

    return { success: true, message: 'All game data wiped. Casino is fresh.' };
  });

  server.post('/users/:id/balance-adjustment', { config: { rateLimit: RATE_LIMIT_WRITE }, preHandler: [requireRole('operator', 'admin', 'superadmin')] }, async (request, reply) => {
    const { id } = parseParams(uuidParams, request.params);
    const { amount, reason, asset } = parseBody(balanceAdjustmentBody, request.body);
    const actor = getAuthUser(request);
    const assetType = asset || 'SOL';

    // Safeguard: max 1000 SOL per adjustment
    const MAX_ADJUSTMENT = 1_000_000_000_000;
    if (Math.abs(amount) > MAX_ADJUSTMENT) {
      reply.code(400);
      return { error: `Adjustment exceeds max of 1000 SOL. Contact superadmin for larger adjustments.` };
    }
    // Safeguard: large adjustments (>100 SOL) require detailed reason
    if (Math.abs(amount) > 100_000_000_000 && reason.length < 20) {
      reply.code(400);
      return { error: 'Adjustments > 10 SOL require a reason of at least 20 characters' };
    }

    // M7 fix: For negative adjustments, guard against driving balance below zero
    let updated;
    if (amount < 0) {
      updated = await db.update(balances).set({
        availableAmount: sql`${balances.availableAmount} + ${amount}`,
        updatedAt: new Date(),
      }).where(and(
        eq(balances.userId, id),
        eq(balances.asset, assetType),
        sql`${balances.availableAmount} >= ${Math.abs(amount)}`,
      )).returning({ newBalance: balances.availableAmount });

      if (updated.length === 0) {
        throw new Error('Insufficient balance for negative adjustment');
      }
    } else {
      updated = await db.update(balances).set({
        availableAmount: sql`${balances.availableAmount} + ${amount}`,
        updatedAt: new Date(),
      }).where(and(eq(balances.userId, id), eq(balances.asset, assetType)))
        .returning({ newBalance: balances.availableAmount });
    }

    let newBalance: number;
    if (updated.length === 0) {
      if (amount < 0) throw new Error('Cannot create balance with negative amount');
      const [ins] = await db.insert(balances).values({
        userId: id,
        asset: assetType,
        availableAmount: amount,
        updatedAt: new Date(),
      }).returning({ newBalance: balances.availableAmount });
      newBalance = ins.newBalance;
    } else {
      newBalance = updated[0].newBalance;
    }
    await db.insert(balanceLedgerEntries).values({
      userId: id,
      asset: assetType,
      entryType: 'admin_adjustment',
      amount,
      balanceAfter: newBalance,
      referenceType: 'admin',
      referenceId: `adj_${Date.now()}`,
      metadata: { reason, adjustedBy: actor.userId },
    });

    // Audit log
    await db.insert(adminAuditLogs).values({
      actorUserId: actor.userId,
      actionType: 'balance_adjustment',
      targetType: 'user',
      targetId: id,
      payload: { amount, reason, asset: assetType },
      ipAddress: request.ip,
    });

    return { success: true, newBalance };
  });

  // ═══════════════════════════════════════════════════════════
  //  TREASURY
  // ═══════════════════════════════════════════════════════════

  server.get('/treasury/overview', async () => {
    const address = getTreasuryAddress();

    let balanceSol = 0;
    try {
      const conn = getSolanaConnection();
      const { PublicKey } = await import('@solana/web3.js');
      const lamports = await conn.getBalance(new PublicKey(address));
      balanceSol = lamports / 1_000_000_000;
    } catch {
      // RPC may fail
    }

    const [depStats] = await db.select({ total: count(), amount: sum(deposits.amount) }).from(deposits).where(eq(deposits.status, 'confirmed'));
    const [withStats] = await db.select({ total: count(), amount: sum(withdrawals.amount) }).from(withdrawals).where(eq(withdrawals.status, 'completed'));
    const [pendingWith] = await db.select({ total: count() }).from(withdrawals).where(eq(withdrawals.status, 'pending_review'));

    return {
      address,
      balanceSol,
      totalDeposits: Number(depStats?.total ?? 0),
      totalDepositAmount: Number(depStats?.amount ?? 0),
      totalWithdrawals: Number(withStats?.total ?? 0),
      totalWithdrawalAmount: Number(withStats?.amount ?? 0),
      pendingWithdrawals: Number(pendingWith?.total ?? 0),
    };
  });

  // GET /v1/admin/treasury/status — full treasury status (admin only)
  server.get('/treasury/status', async () => {
    const { TreasuryService } = await import('../modules/treasury/treasury.service.js');
    const treasuryService = new TreasuryService();
    return treasuryService.getTreasuryStatus();
  });

  // GET /v1/admin/treasury/health — extended health + circuit breaker + RTP
  server.get('/treasury/health', async () => {
    const { evaluateTreasuryHealth } = await import('../utils/treasuryMonitor.js');
    const { getObservedRTP } = await import('../utils/payoutMonitor.js');
    const { env: envConfig } = await import('../config/env.js');

    let onChainBalance = 0;
    try {
      const conn = getSolanaConnection();
      const { PublicKey } = await import('@solana/web3.js');
      const address = getTreasuryAddress();
      onChainBalance = await conn.getBalance(new PublicKey(address));
    } catch { /* RPC may fail */ }

    const health = await evaluateTreasuryHealth(onChainBalance);

    let rtp: Awaited<ReturnType<typeof getObservedRTP>> = [];
    try { rtp = await getObservedRTP(24); } catch { /* skip */ }

    const withdrawalBreakdown = await db.execute(sql`
      SELECT status, COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total
      FROM withdrawals
      WHERE status IN ('pending', 'delayed', 'processing', 'completed', 'failed', 'cancelled')
        AND created_at >= ${new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()}
      GROUP BY status
    `) as any[];

    return {
      health,
      withdrawalBreakdown,
      rtp,
      config: {
        withdrawalDelayHours: envConfig.WITHDRAWAL_DELAY_HOURS,
        healthyThreshold: envConfig.TREASURY_LIQUIDITY_HEALTHY_LAMPORTS,
        warningThreshold: envConfig.TREASURY_LIQUIDITY_WARNING_LAMPORTS,
        criticalThreshold: envConfig.TREASURY_LIQUIDITY_CRITICAL_LAMPORTS,
        bufferPercent: envConfig.WITHDRAWAL_BUFFER_PERCENT,
        betReduction: envConfig.CIRCUIT_BREAKER_BET_REDUCTION,
      },
    };
  });

  server.get('/treasury/deposits', async (request) => {
    const { limit, status } = request.query as { limit?: string; status?: string };
    const conditions = status ? eq(deposits.status, status) : undefined;
    const data = await db.select().from(deposits).where(conditions).orderBy(desc(deposits.createdAt)).limit(parseInt(limit || '50'));
    return { data };
  });

  server.get('/treasury/withdrawals', async (request) => {
    const { limit, status } = request.query as { limit?: string; status?: string };
    const conditions = status ? eq(withdrawals.status, status) : undefined;
    const data = await db.select().from(withdrawals).where(conditions).orderBy(desc(withdrawals.createdAt)).limit(parseInt(limit || '50'));
    return { data };
  });

  server.patch('/treasury/withdrawals/:id', { config: { rateLimit: RATE_LIMIT_WRITE }, preHandler: [requireRole('operator', 'admin', 'superadmin')] }, async (request, reply) => {
    const { id } = parseParams(uuidParams, request.params);
    const { status, reason } = parseBody(withdrawalApprovalBody, request.body);
    const actor = getAuthUser(request);

    // Safeguard: large withdrawals (>50 SOL) require superadmin
    if (status === 'approved') {
      const [withdrawal] = await db.select().from(withdrawals).where(eq(withdrawals.id, id));
      if (withdrawal && Number(withdrawal.amount) > 500_000_000_000 && actor.role !== 'superadmin') {
        reply.code(403);
        return { error: 'Withdrawals > 500 SOL require superadmin approval' };
      }
    }

    await db.update(withdrawals).set({
      status,
      reviewedBy: actor.userId,
      reviewedAt: new Date(),
    }).where(eq(withdrawals.id, id));

    await db.insert(adminAuditLogs).values({
      actorUserId: actor.userId,
      actionType: `withdrawal_${status}`,
      targetType: 'withdrawal',
      targetId: id,
      payload: { status, reason },
      ipAddress: request.ip,
    });

    return { success: true };
  });

  // ═══════════════════════════════════════════════════════════
  //  ROUNDS
  // ═══════════════════════════════════════════════════════════

  server.get('/rounds', async (request) => {
    const { limit, status } = request.query as { limit?: string; status?: string };
    const conditions = status ? eq(rounds.status, status) : undefined;
    const data = await db.select().from(rounds).where(conditions).orderBy(desc(rounds.createdAt)).limit(parseInt(limit || '50'));
    return { data };
  });

  server.get('/rounds/:id', async (request) => {
    const { id } = parseParams(uuidParams, request.params);

    const round = await db.query.rounds.findFirst({ where: eq(rounds.id, id) });
    if (!round) return { error: 'Round not found' };

    const pool = await db.query.roundPools.findFirst({ where: eq(roundPools.roundId, id) });
    const nodes = await db.select().from(roundNodes).where(eq(roundNodes.roundId, id)).orderBy(roundNodes.spawnTimeMs);
    const roundBets = await db.select().from(bets).where(eq(bets.roundId, id));
    const results = await db.select().from(betResults).where(eq(betResults.roundId, id));

    return { ...round, pool, nodes, bets: roundBets, results };
  });

  // ═══════════════════════════════════════════════════════════
  //  FAIRNESS
  // ═══════════════════════════════════════════════════════════

  server.get('/fairness/metrics', async () => {
    const [totalRounds] = await db.select({ total: count() }).from(rounds).where(eq(rounds.status, 'resolved'));
    const [totalBets] = await db.select({ total: count() }).from(betResults);
    const [winCount] = await db.select({ total: count() }).from(betResults).where(eq(betResults.resultType, 'win'));

    // By risk tier
    const tierStats = await db
      .select({ tier: bets.riskTier, betCount: count(), avgMultiplier: avg(betResults.finalMultiplier) })
      .from(betResults)
      .innerJoin(bets, eq(betResults.betId, bets.id))
      .groupBy(bets.riskTier);

    const tierWins = await db
      .select({ tier: bets.riskTier, wins: count() })
      .from(betResults)
      .innerJoin(bets, eq(betResults.betId, bets.id))
      .where(eq(betResults.resultType, 'win'))
      .groupBy(bets.riskTier);

    const winsByTier = Object.fromEntries(tierWins.map((t) => [t.tier, Number(t.wins)]));

    const byRiskTier = tierStats.map((t) => ({
      tier: t.tier,
      betCount: Number(t.betCount),
      avgMultiplier: Number(t.avgMultiplier ?? 1),
      winRate: Number(t.betCount) > 0 ? (winsByTier[t.tier] || 0) / Number(t.betCount) : 0,
    }));

    // House edge
    const [volumeStats] = await db.select({ volume: sum(bets.amount), fees: sum(bets.fee) }).from(bets).where(eq(bets.status, 'settled'));

    // Node stats
    const nodeRows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE node_type = 'multiplier') as total_multipliers,
        COUNT(*) FILTER (WHERE node_type = 'divider') as total_dividers,
        COUNT(*) as total_nodes
      FROM round_nodes
    `) as unknown as { total_multipliers: string; total_dividers: string; total_nodes: string }[];
    const ns = nodeRows[0] || { total_multipliers: '0', total_dividers: '0', total_nodes: '0' };

    return {
      actualHouseEdge: Number(volumeStats?.volume ?? 0) > 0
        ? Number(volumeStats?.fees ?? 0) / Number(volumeStats?.volume ?? 1) : 0,
      targetHouseEdge: { min: 0.02, max: 0.08 },
      totalRoundsAnalyzed: Number(totalRounds?.total ?? 0),
      totalBetsAnalyzed: Number(totalBets?.total ?? 0),
      overallWinRate: Number(totalBets?.total ?? 0) > 0
        ? Number(winCount?.total ?? 0) / Number(totalBets?.total ?? 1) : 0,
      byRiskTier,
      nodeStats: {
        avgMultipliersPerRound: Number(totalRounds?.total ?? 0) > 0
          ? Number(ns.total_multipliers) / Number(totalRounds?.total ?? 1) : 0,
        avgDividersPerRound: Number(totalRounds?.total ?? 0) > 0
          ? Number(ns.total_dividers) / Number(totalRounds?.total ?? 1) : 0,
        hitRate: Number(ns.total_nodes) > 0
          ? Number(ns.total_multipliers) / Number(ns.total_nodes) : 0,
      },
    };
  });

  server.get('/fairness/round/:id', async (request) => {
    const { id } = parseParams(uuidParams, request.params);
    const round = await db.query.rounds.findFirst({ where: eq(rounds.id, id) });
    if (!round) return { error: 'Round not found' };

    const nodes = await db.select().from(roundNodes).where(eq(roundNodes.roundId, id)).orderBy(roundNodes.spawnTimeMs);
    const results = await db.select().from(betResults).where(eq(betResults.roundId, id));

    return { seed: round.seed, seedCommitment: round.seedCommitment, nodes, results };
  });

  // ═══════════════════════════════════════════════════════════
  //  ENGINE CONFIG
  // ═══════════════════════════════════════════════════════════

  server.get('/engine-config', async () => {
    const active = await db.query.engineConfigs.findFirst({ where: eq(engineConfigs.isActive, true) });
    return active ?? { message: 'No active config, using defaults' };
  });

  server.get('/engine-config/history', async () => {
    const data = await db.select().from(engineConfigs).orderBy(desc(engineConfigs.version));
    return { data };
  });

  server.post('/engine-config', { config: { rateLimit: RATE_LIMIT_WRITE }, preHandler: [requireRole('superadmin')] }, async (request) => {
    const { config } = parseBody(engineConfigBody, request.body);
    const actor = getAuthUser(request);

    const [latest] = await db.select({ maxVersion: sql<number>`COALESCE(MAX(${engineConfigs.version}), 0)` }).from(engineConfigs);
    const nextVersion = (latest?.maxVersion ?? 0) + 1;

    const [created] = await db.insert(engineConfigs).values({
      version: nextVersion,
      config,
      isActive: false,
      createdAt: new Date(),
    }).returning();

    await db.insert(adminAuditLogs).values({
      actorUserId: actor.userId,
      actionType: 'engine_config_create',
      targetType: 'engine_config',
      targetId: created.id,
      payload: { version: nextVersion },
      ipAddress: request.ip,
    });

    return created;
  });

  server.patch('/engine-config/:id/activate', { config: { rateLimit: RATE_LIMIT_WRITE }, preHandler: [requireRole('superadmin')] }, async (request) => {
    const { id } = parseParams(uuidParams, request.params);
    const actor = getAuthUser(request);

    await db.update(engineConfigs).set({ isActive: false });
    await db.update(engineConfigs).set({ isActive: true, activatedAt: new Date(), activatedBy: actor.userId }).where(eq(engineConfigs.id, id));

    await db.insert(adminAuditLogs).values({
      actorUserId: actor.userId,
      actionType: 'engine_config_activate',
      targetType: 'engine_config',
      targetId: id,
      payload: {},
      ipAddress: request.ip,
    });

    return { success: true };
  });

  // ═══════════════════════════════════════════════════════════
  //  FEATURE FLAGS
  // ═══════════════════════════════════════════════════════════

  server.get('/feature-flags', async () => {
    return db.query.featureFlags.findMany();
  });

  server.patch('/feature-flags/:key', { config: { rateLimit: RATE_LIMIT_WRITE }, preHandler: [requireRole('operator', 'admin', 'superadmin')] }, async (request) => {
    const { key } = parseParams(keyParams, request.params);
    const { enabled, config } = parseBody(featureFlagUpdateBody, request.body);
    const actor = getAuthUser(request);

    const update: Record<string, unknown> = { updatedAt: new Date(), updatedBy: actor.userId };
    if (enabled !== undefined) update.enabled = enabled;
    if (config !== undefined) update.config = config;

    await db.update(featureFlags).set(update).where(eq(featureFlags.flagKey, key));

    // Invalidate cached game gate so change takes effect immediately
    try {
      const { invalidateGameFlag } = await import('../utils/gameGates.js');
      await invalidateGameFlag(key);
    } catch { /* non-critical */ }

    await db.insert(adminAuditLogs).values({
      actorUserId: actor.userId,
      actionType: 'feature_flag_toggle',
      targetType: 'feature_flag',
      targetId: key,
      payload: { enabled, config },
      ipAddress: request.ip,
    });

    return { success: true };
  });

  server.post('/feature-flags', { config: { rateLimit: RATE_LIMIT_WRITE }, preHandler: [requireRole('operator', 'admin', 'superadmin')] }, async (request) => {
    const { flagKey, description, enabled, config } = parseBody(featureFlagCreateBody, request.body);
    const actor = getAuthUser(request);

    const [created] = await db.insert(featureFlags).values({
      flagKey,
      description,
      enabled: enabled ?? false,
      config: config ?? {},
      updatedBy: actor.userId,
      updatedAt: new Date(),
    }).returning();

    await db.insert(adminAuditLogs).values({
      actorUserId: actor.userId,
      actionType: 'feature_flag_create',
      targetType: 'feature_flag',
      targetId: flagKey,
      payload: { description },
      ipAddress: request.ip,
    });

    return created;
  });

  // ═══════════════════════════════════════════════════════════
  //  RISK FLAGS
  // ═══════════════════════════════════════════════════════════

  server.get('/risk-flags', async (request) => {
    const { severity, resolved, limit } = request.query as { severity?: string; resolved?: string; limit?: string };

    const conditions = [];
    if (severity) conditions.push(eq(riskFlags.severity, severity));
    if (resolved !== undefined) conditions.push(eq(riskFlags.resolved, resolved === 'true'));

    const data = await db
      .select()
      .from(riskFlags)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(riskFlags.createdAt))
      .limit(parseInt(limit || '50'));

    return { data };
  });

  server.patch('/risk-flags/:id/resolve', { config: { rateLimit: RATE_LIMIT_WRITE }, preHandler: [requireRole('operator', 'admin', 'superadmin')] }, async (request) => {
    const { id } = parseParams(uuidParams, request.params);
    const { notes } = parseBody(riskFlagResolveBody, request.body);
    const actor = getAuthUser(request);

    await db.update(riskFlags).set({
      resolved: true,
      resolvedBy: actor.userId,
      resolvedAt: new Date(),
    }).where(eq(riskFlags.id, id));

    await db.insert(adminAuditLogs).values({
      actorUserId: actor.userId,
      actionType: 'risk_flag_resolve',
      targetType: 'risk_flag',
      targetId: id,
      payload: { notes },
      ipAddress: request.ip,
    });

    return { success: true };
  });

  // ═══════════════════════════════════════════════════════════
  //  AUDIT LOGS
  // ═══════════════════════════════════════════════════════════

  server.get('/audit-logs', async (request) => {
    const { limit, actionType } = request.query as { limit?: string; actionType?: string };

    const conditions = actionType ? eq(adminAuditLogs.actionType, actionType) : undefined;

    const data = await db
      .select({
        id: adminAuditLogs.id,
        actorUserId: adminAuditLogs.actorUserId,
        actionType: adminAuditLogs.actionType,
        targetType: adminAuditLogs.targetType,
        targetId: adminAuditLogs.targetId,
        payload: adminAuditLogs.payload,
        ipAddress: adminAuditLogs.ipAddress,
        createdAt: adminAuditLogs.createdAt,
        actorUsername: users.username,
      })
      .from(adminAuditLogs)
      .leftJoin(users, eq(adminAuditLogs.actorUserId, users.id))
      .where(conditions)
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(parseInt(limit || '50'));

    return { data };
  });

  // ═══════════════════════════════════════════════════════════
  //  ANALYTICS
  // ═══════════════════════════════════════════════════════════

  server.get('/analytics/timeseries', async (request) => {
    const { metric, period } = request.query as { metric?: string; period?: string };
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let data: { date: string; value: number }[] = [];

    switch (metric) {
      case 'registrations': {
        const rows = await db.execute(sql`
          SELECT DATE(created_at) as date, COUNT(*) as value
          FROM users WHERE created_at >= ${since}
          GROUP BY DATE(created_at) ORDER BY date
        `);
        data = (rows as unknown as { date: string; value: string }[]).map((r) => ({ date: String(r.date), value: Number(r.value) }));
        break;
      }
      case 'volume': {
        const rows = await db.execute(sql`
          SELECT DATE(created_at) as date, COALESCE(SUM(amount), 0) as value
          FROM bets WHERE created_at >= ${since}
          GROUP BY DATE(created_at) ORDER BY date
        `);
        data = (rows as unknown as { date: string; value: string }[]).map((r) => ({ date: String(r.date), value: Number(r.value) }));
        break;
      }
      case 'revenue': {
        const rows = await db.execute(sql`
          SELECT DATE(created_at) as date, COALESCE(SUM(fee), 0) as value
          FROM bets WHERE created_at >= ${since}
          GROUP BY DATE(created_at) ORDER BY date
        `);
        data = (rows as unknown as { date: string; value: string }[]).map((r) => ({ date: String(r.date), value: Number(r.value) }));
        break;
      }
      case 'activeUsers': {
        const rows = await db.execute(sql`
          SELECT DATE(created_at) as date, COUNT(DISTINCT user_id) as value
          FROM bets WHERE created_at >= ${since}
          GROUP BY DATE(created_at) ORDER BY date
        `);
        data = (rows as unknown as { date: string; value: string }[]).map((r) => ({ date: String(r.date), value: Number(r.value) }));
        break;
      }
    }

    return { data };
  });

  server.get('/analytics/distributions', async () => {
    const vipTiers = await db.select({ tier: users.vipTier, count: count() }).from(users).groupBy(users.vipTier);
    const riskTiers = await db.select({ tier: bets.riskTier, count: count() }).from(bets).groupBy(bets.riskTier);

    const topPlayers = await db
      .select({ userId: userProfiles.userId, username: users.username, totalWagered: userProfiles.totalWagered })
      .from(userProfiles)
      .innerJoin(users, eq(userProfiles.userId, users.id))
      .orderBy(desc(userProfiles.totalWagered))
      .limit(10);

    return {
      vipTiers: vipTiers.map((t) => ({ tier: t.tier, count: Number(t.count) })),
      riskTiers: riskTiers.map((t) => ({ tier: t.tier, count: Number(t.count) })),
      topPlayers: topPlayers.map((p) => ({ userId: p.userId, username: p.username, totalWagered: Number(p.totalWagered) })),
    };
  });

  // ═══════════════════════════════════════════════════════════
  //  DEPOSIT WALLETS
  // ═══════════════════════════════════════════════════════════

  const depositWalletService = new DepositWalletService();

  server.get('/deposit-wallets', async (request) => {
    const { limit, offset } = request.query as { limit?: string; offset?: string };
    const lim = parseInt(limit || '50');
    const off = parseInt(offset || '0');

    const data = await db
      .select({
        id: userDepositWallets.id,
        userId: userDepositWallets.userId,
        address: userDepositWallets.address,
        isActive: userDepositWallets.isActive,
        lastSweptAt: userDepositWallets.lastSweptAt,
        createdAt: userDepositWallets.createdAt,
        username: users.username,
      })
      .from(userDepositWallets)
      .leftJoin(users, eq(userDepositWallets.userId, users.id))
      .orderBy(desc(userDepositWallets.createdAt))
      .limit(lim)
      .offset(off);

    const [totalCount] = await db.select({ total: count() }).from(userDepositWallets);

    return { data, total: Number(totalCount?.total ?? 0) };
  });

  server.get('/deposit-wallets/:userId/balance', async (request) => {
    const { userId } = parseParams(userIdParams, request.params);
    const address = await depositWalletService.getWalletAddress(userId);
    if (!address) return { error: 'No deposit wallet found for user' };

    const balance = await depositWalletService.getWalletBalance(address);
    return { address, balance, balanceSol: balance / 1_000_000_000 };
  });

  server.post('/deposit-wallets/:userId/sweep', { config: { rateLimit: RATE_LIMIT_WRITE }, preHandler: [requireRole('superadmin')] }, async (request) => {
    const { userId } = parseParams(userIdParams, request.params);
    const actor = getAuthUser(request);

    const txHash = await depositWalletService.sweepToTreasury(userId);

    await db.insert(adminAuditLogs).values({
      actorUserId: actor.userId,
      actionType: 'deposit_wallet_sweep',
      targetType: 'user',
      targetId: userId,
      payload: { txHash },
      ipAddress: request.ip,
    });

    return { success: true, txHash };
  });

  // ═══════════════════════════════════════════════════════════
  //  REFERRALS
  // ═══════════════════════════════════════════════════════════

  server.get('/referrals', async (request) => {
    const { limit = 50 } = request.query as { limit?: number };

    const data = await db
      .select({
        id: referralCodes.id,
        userId: referralCodes.userId,
        code: referralCodes.code,
        createdAt: referralCodes.createdAt,
        username: users.username,
      })
      .from(referralCodes)
      .leftJoin(users, eq(users.id, referralCodes.userId))
      .orderBy(desc(referralCodes.createdAt))
      .limit(Number(limit));

    // Enrich with referral count and earnings per code
    const enriched = await Promise.all(data.map(async (row) => {
      const [refCount] = await db
        .select({ total: count() })
        .from(referrals)
        .where(eq(referrals.referrerId, row.userId));

      const [earnings] = await db
        .select({ total: sql<string>`COALESCE(SUM(${referralEarnings.commissionAmount}), 0)` })
        .from(referralEarnings)
        .where(eq(referralEarnings.referrerId, row.userId));

      return {
        ...row,
        referralCount: refCount?.total ?? 0,
        totalEarnings: Number(earnings?.total ?? 0),
      };
    }));

    return { data: enriched };
  });

  server.get('/referrals/stats', async () => {
    const [codes] = await db.select({ total: count() }).from(referralCodes);
    const [refs] = await db.select({ total: count() }).from(referrals);
    const [earnings] = await db
      .select({ total: sql<string>`COALESCE(SUM(${referralEarnings.commissionAmount}), 0)` })
      .from(referralEarnings);
    const [claimed] = await db
      .select({ total: sql<string>`COALESCE(SUM(${referralEarnings.commissionAmount}), 0)` })
      .from(referralEarnings)
      .where(eq(referralEarnings.status, 'claimed'));

    return {
      totalCodes: codes?.total ?? 0,
      totalReferrals: refs?.total ?? 0,
      totalEarnings: Number(earnings?.total ?? 0),
      totalClaimed: Number(claimed?.total ?? 0),
    };
  });

  // ═══════════════════════════════════════════════════════════
  //  CHAT MODERATION
  // ═══════════════════════════════════════════════════════════

  server.get('/chat/messages', async (request) => {
    const { channel = 'global', limit = 100 } = request.query as { channel?: string; limit?: number };

    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.channel, channel))
      .orderBy(desc(chatMessages.createdAt))
      .limit(Number(limit));

    return { messages: messages.reverse() };
  });

  server.delete('/chat/messages/:id', { config: { rateLimit: RATE_LIMIT_WRITE }, preHandler: [requireRole('support', 'operator', 'admin', 'superadmin')] }, async (request) => {
    const { id } = parseParams(uuidParams, request.params);
    const actor = getAuthUser(request);

    await db.delete(chatMessages).where(eq(chatMessages.id, id));

    await db.insert(adminAuditLogs).values({
      actorUserId: actor.userId,
      actionType: 'chat_message_delete',
      targetType: 'chat_message',
      targetId: id,
      payload: {},
      ipAddress: request.ip,
    });

    return { success: true };
  });

  // ═══════════════════════════════════════════════════════════
  //  BONUS CODES
  // ═══════════════════════════════════════════════════════════

  server.get('/bonus-codes', async (request) => {
    const { active } = request.query as { active?: string };

    const conditions = active !== undefined ? eq(bonusCodes.active, active === 'true') : undefined;

    const data = await db
      .select()
      .from(bonusCodes)
      .where(conditions)
      .orderBy(desc(bonusCodes.createdAt))
      .limit(100);

    return { data };
  });

  server.post('/bonus-codes', { config: { rateLimit: RATE_LIMIT_WRITE }, preHandler: [requireRole('operator', 'admin', 'superadmin')] }, async (request) => {
    const { code, description, type, amountLamports, maxUses, maxPerUser, minLevel, expiresAt } = parseBody(bonusCodeCreateBody, request.body);
    const actor = getAuthUser(request);

    const [created] = await db.insert(bonusCodes).values({
      code: code.toUpperCase().trim(),
      description,
      type: type ?? 'fixed',
      amountLamports,
      maxUses: maxUses ?? 1,
      maxPerUser: maxPerUser ?? 1,
      minLevel: minLevel ?? 1,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      createdBy: actor.userId,
    }).returning();

    await db.insert(adminAuditLogs).values({
      actorUserId: actor.userId,
      actionType: 'bonus_code_create',
      targetType: 'bonus_code',
      targetId: created.id,
      payload: { code: code.toUpperCase().trim(), amountLamports },
      ipAddress: request.ip,
    });

    return created;
  });

  server.patch('/bonus-codes/:id', { config: { rateLimit: RATE_LIMIT_WRITE }, preHandler: [requireRole('operator', 'admin', 'superadmin')] }, async (request) => {
    const { id } = parseParams(uuidParams, request.params);
    const { active, maxUses, expiresAt, description } = parseBody(bonusCodeUpdateBody, request.body);
    const actor = getAuthUser(request);

    const update: Record<string, unknown> = {};
    if (active !== undefined) update.active = active;
    if (maxUses !== undefined) update.maxUses = maxUses;
    if (expiresAt !== undefined) update.expiresAt = new Date(expiresAt);
    if (description !== undefined) update.description = description;

    await db.update(bonusCodes).set(update).where(eq(bonusCodes.id, id));

    await db.insert(adminAuditLogs).values({
      actorUserId: actor.userId,
      actionType: 'bonus_code_update',
      targetType: 'bonus_code',
      targetId: id,
      payload: { active, maxUses, expiresAt, description },
      ipAddress: request.ip,
    });

    return { success: true };
  });

  server.delete('/bonus-codes/:id', { config: { rateLimit: RATE_LIMIT_WRITE }, preHandler: [requireRole('operator', 'admin', 'superadmin')] }, async (request) => {
    const { id } = parseParams(uuidParams, request.params);
    const actor = getAuthUser(request);

    await db.update(bonusCodes).set({ active: false }).where(eq(bonusCodes.id, id));

    await db.insert(adminAuditLogs).values({
      actorUserId: actor.userId,
      actionType: 'bonus_code_deactivate',
      targetType: 'bonus_code',
      targetId: id,
      payload: {},
      ipAddress: request.ip,
    });

    return { success: true };
  });

  server.get('/bonus-codes/:id/redemptions', async (request) => {
    const { id } = parseParams(uuidParams, request.params);

    const data = await db
      .select({
        id: bonusCodeRedemptions.id,
        userId: bonusCodeRedemptions.userId,
        amountLamports: bonusCodeRedemptions.amountLamports,
        redeemedAt: bonusCodeRedemptions.redeemedAt,
        username: users.username,
      })
      .from(bonusCodeRedemptions)
      .leftJoin(users, eq(bonusCodeRedemptions.userId, users.id))
      .where(eq(bonusCodeRedemptions.bonusCodeId, id))
      .orderBy(desc(bonusCodeRedemptions.redeemedAt))
      .limit(100);

    return { data };
  });

  // ═══════════════════════════════════════════════════════════
  //  FAILED SETTLEMENT RECOVERY
  // ═══════════════════════════════════════════════════════════

  // List failed settlements (filterable by status)
  server.get('/failed-settlements', async (request) => {
    const { status } = request.query as { status?: string };
    const query = status
      ? db.select().from(failedSettlements).where(eq(failedSettlements.status, status))
      : db.select().from(failedSettlements);
    const data = await query.orderBy(desc(failedSettlements.createdAt)).limit(100);
    return { data, count: data.length };
  });

  // Retry a specific failed settlement
  server.post('/failed-settlements/:id/retry', { config: { rateLimit: RATE_LIMIT_WRITE }, preHandler: [requireRole('operator', 'admin', 'superadmin')] }, async (request) => {
    const { id } = parseParams(uuidParams, request.params);
    const actor = getAuthUser(request);
    const result = await retrySettlement(id, actor.userId);

    await db.insert(adminAuditLogs).values({
      actorUserId: actor.userId,
      actionType: 'settlement_retry',
      targetType: 'failed_settlement',
      targetId: id,
      payload: { result },
      ipAddress: request.ip,
    });

    return result;
  });

  // Abandon a failed settlement (mark as unrecoverable)
  server.post('/failed-settlements/:id/abandon', { config: { rateLimit: RATE_LIMIT_WRITE }, preHandler: [requireRole('operator', 'admin', 'superadmin')] }, async (request) => {
    const { id } = parseParams(uuidParams, request.params);
    const actor = getAuthUser(request);

    await db.update(failedSettlements).set({
      status: 'abandoned',
      resolvedBy: actor.userId,
      resolvedAt: new Date(),
    }).where(eq(failedSettlements.id, id));

    await db.insert(adminAuditLogs).values({
      actorUserId: actor.userId,
      actionType: 'settlement_abandon',
      targetType: 'failed_settlement',
      targetId: id,
      payload: {},
      ipAddress: request.ip,
    });

    return { success: true };
  });

  // ═══════════════════════════════════════════════════════════
  //  OPS DASHBOARD — Live operational visibility
  // ═══════════════════════════════════════════════════════════

  // Ops health overview — single endpoint for operator dashboard
  server.get('/ops/health', async () => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Failed settlements
    const failedSettlementsData = await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE status = 'pending') as pending_count,
        count(*) FILTER (WHERE status = 'resolved') as resolved_count,
        count(*) FILTER (WHERE status = 'abandoned') as abandoned_count,
        count(*) FILTER (WHERE created_at >= ${oneDayAgo}) as last_24h_count
      FROM failed_settlements
    `);

    // Ops alerts (last 24h)
    const alertsData = await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE severity = 'critical') as critical_count,
        count(*) FILTER (WHERE severity = 'warning') as warning_count,
        count(*) FILTER (WHERE acknowledged = false) as unacked_count,
        count(*) FILTER (WHERE created_at >= ${oneHourAgo}) as last_hour_count
      FROM ops_alerts
      WHERE created_at >= ${oneDayAgo}
    `);

    // Game flags
    const flags = await db.query.featureFlags.findMany();
    const gameFlags = flags.filter(f => f.flagKey.startsWith('game_')).map(f => ({
      game: f.flagKey.replace('game_', '').replace('_enabled', ''),
      enabled: f.enabled,
    }));

    // Recent critical alerts (last 10)
    const recentAlerts = await db.execute(sql`
      SELECT id, severity, category, message, user_id, game, request_id, created_at, acknowledged
      FROM ops_alerts
      WHERE created_at >= ${oneDayAgo}
      ORDER BY created_at DESC
      LIMIT 10
    `);

    return {
      timestamp: now.toISOString(),
      settlements: (failedSettlementsData as any)[0] || { pending_count: 0, resolved_count: 0, abandoned_count: 0, last_24h_count: 0 },
      alerts: (alertsData as any)[0] || { critical_count: 0, warning_count: 0, unacked_count: 0, last_hour_count: 0 },
      gameFlags,
      recentAlerts: recentAlerts || [],
    };
  });

  // List ops alerts (filterable)
  server.get('/ops/alerts', async (request) => {
    const { severity, category, acknowledged, limit: lim } = request.query as { severity?: string; category?: string; acknowledged?: string; limit?: string };
    const parsedLimit = Math.min(Math.max(parseInt(lim || '50', 10) || 50, 1), 200);

    let query = sql`SELECT * FROM ops_alerts WHERE 1=1`;
    if (severity) query = sql`${query} AND severity = ${severity}`;
    if (category) query = sql`${query} AND category = ${category}`;
    if (acknowledged === 'false') query = sql`${query} AND acknowledged = false`;
    if (acknowledged === 'true') query = sql`${query} AND acknowledged = true`;
    query = sql`${query} ORDER BY created_at DESC LIMIT ${parsedLimit}`;

    const data = await db.execute(query);
    return { data, count: (data as any[]).length };
  });

  // Acknowledge an ops alert
  server.post('/ops/alerts/:id/acknowledge', { config: { rateLimit: RATE_LIMIT_WRITE }, preHandler: [requireRole('support', 'operator', 'admin', 'superadmin')] }, async (request) => {
    const { id } = parseParams(uuidParams, request.params);
    const actor = getAuthUser(request);

    await db.execute(sql`
      UPDATE ops_alerts SET acknowledged = true, acknowledged_by = ${actor.userId}, acknowledged_at = now()
      WHERE id = ${id}::uuid
    `);

    return { success: true };
  });

  // ═══════════════════════════════════════════════════════════
  //  ECONOMY MONITORING — Observed RTP vs Expected
  // ═══════════════════════════════════════════════════════════

  server.get('/ops/rtp', async (request) => {
    const { window } = request.query as { window?: string };
    const windowHours = Math.min(Math.max(parseInt(window || '24', 10) || 24, 1), 720); // max 30 days
    const data = await getObservedRTP(windowHours);
    return {
      windowHours,
      games: data,
      summary: {
        gamesWithData: data.filter(g => g.sampleSize > 0).length,
        totalGames: data.length,
        driftWarnings: data.filter(g => g.delta !== null && Math.abs(g.delta) > 0.05 && g.sampleSize >= 20).map(g => ({
          game: g.game,
          observedRtp: g.observedRtp,
          expectedRtp: g.expectedRtp,
          delta: g.delta,
          sampleSize: g.sampleSize,
        })),
      },
    };
  });

  // Payout outliers — list recent outlier alerts
  server.get('/ops/outliers', async (request) => {
    const { limit: lim } = request.query as { limit?: string };
    const parsedLimit = Math.min(Math.max(parseInt(lim || '50', 10) || 50, 1), 200);

    const data = await db.execute(sql`
      SELECT * FROM ops_alerts
      WHERE category = 'payout_outlier'
      ORDER BY created_at DESC
      LIMIT ${parsedLimit}
    `);

    return { data, count: (data as any[]).length };
  });

  // ═══════════════════════════════════════════════════════════
  //  PERFORMANCE MONITORING
  // ═══════════════════════════════════════════════════════════

  // Full performance stats — all routes
  server.get('/ops/perf', async (request) => {
    const { window } = request.query as { window?: string };
    const windowMinutes = Math.min(Math.max(parseInt(window || '60', 10) || 60, 1), 1440);
    return getPerformanceStats(windowMinutes);
  });

  // Money-critical routes only
  server.get('/ops/perf/money', async (request) => {
    const { window } = request.query as { window?: string };
    const windowMinutes = Math.min(Math.max(parseInt(window || '60', 10) || 60, 1), 1440);
    return getMoneyRoutePerformance(windowMinutes);
  });

  // ═══════════════════════════════════════════════════════════
  //  WORKER HEALTH
  // ═══════════════════════════════════════════════════════════

  server.get('/workers/health', async () => {
    const { getAllWorkerHealth } = await import('../utils/workerHealth.js');
    const { getSolanaCircuitBreaker } = await import('../utils/circuitBreaker.js');
    const statuses = await getAllWorkerHealth();
    const healthy = statuses.filter(s => s.health === 'healthy').length;
    const degraded = statuses.filter(s => s.health === 'degraded').length;
    const dead = statuses.filter(s => s.health === 'dead').length;
    const circuitBreaker = getSolanaCircuitBreaker().getStatus();
    return {
      summary: { total: statuses.length, healthy, degraded, dead },
      workers: statuses,
      solanaRpc: circuitBreaker,
    };
  });

  // ── NUCLEAR RESET — delete all non-admin users + all game data ──
  // Casino becomes brand new. Keeps admin accounts, config, bonus codes, audit logs.
  server.post('/reset-casino-data', { config: { rateLimit: RATE_LIMIT_DANGEROUS }, preHandler: [requireRole('superadmin')] }, async (request) => {
    const { reason } = parseBody(resetCasinoDataBody, request.body);
    const actor = getAuthUser(request);

    // Collect admin user IDs to preserve
    const adminUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.role, 'admin'), eq(users.role, 'superadmin'), eq(users.role, 'operator')));
    const adminIds = adminUsers.map(u => u.id);

    if (adminIds.length === 0) {
      return { error: 'No admin users found — aborting to prevent data loss' };
    }

    // Build exclusion clause for admin users
    const adminIdList = adminIds.map(id => `'${id}'`).join(',');

    // Execute deletes in FK-safe order: deepest children first, parents last
    // Each statement returns row count via a CTE trick
    const result = await db.execute(sql.raw(`
      -- Phase 1: Game-specific child tables (no user FK dependency issues)
      WITH
        d01 AS (DELETE FROM weekly_race_prizes RETURNING 1),
        d02 AS (DELETE FROM weekly_race_entries RETURNING 1),
        d03 AS (DELETE FROM weekly_races RETURNING 1),
        d04 AS (DELETE FROM candleflip_round_bets RETURNING 1),
        d05 AS (DELETE FROM candleflip_rounds RETURNING 1),
        d06 AS (DELETE FROM rug_round_bets RETURNING 1),
        d07 AS (DELETE FROM rug_rounds RETURNING 1),
        d08 AS (DELETE FROM rug_games RETURNING 1),
        d09 AS (DELETE FROM candleflip_games RETURNING 1),
        d10 AS (DELETE FROM mines_games RETURNING 1),
        d11 AS (DELETE FROM trading_sim_trades RETURNING 1),
        d12 AS (DELETE FROM trading_sim_participants RETURNING 1),
        d13 AS (DELETE FROM trading_sim_rooms RETURNING 1),
        d14 AS (DELETE FROM lottery_winners RETURNING 1),
        d15 AS (DELETE FROM lottery_tickets RETURNING 1),
        d16 AS (DELETE FROM lottery_draws RETURNING 1),
        d17 AS (DELETE FROM prediction_rounds RETURNING 1),
        d18 AS (DELETE FROM referral_earnings RETURNING 1),
        d19 AS (DELETE FROM bet_results RETURNING 1),
        d20 AS (DELETE FROM bets RETURNING 1),
        d21 AS (DELETE FROM round_nodes RETURNING 1),
        d22 AS (DELETE FROM round_events RETURNING 1),
        d23 AS (DELETE FROM round_pools RETURNING 1),
        d24 AS (DELETE FROM rounds RETURNING 1),
        d25 AS (DELETE FROM tournament_participants RETURNING 1),
        d26 AS (DELETE FROM tournaments RETURNING 1),
        d27 AS (DELETE FROM failed_settlements RETURNING 1),
        d28 AS (DELETE FROM activity_feed_items RETURNING 1),
        d29 AS (DELETE FROM leaderboard_snapshots RETURNING 1),
        d30 AS (DELETE FROM chat_messages RETURNING 1),
        d31 AS (DELETE FROM daily_rewards RETURNING 1),
        d32 AS (DELETE FROM user_mission_progress RETURNING 1),
        d33 AS (DELETE FROM user_achievements RETURNING 1),
        d34 AS (DELETE FROM season_pass_claims RETURNING 1),
        d35 AS (DELETE FROM bonus_code_redemptions RETURNING 1),
        d36 AS (DELETE FROM balance_ledger_entries RETURNING 1),
        d37 AS (DELETE FROM balances RETURNING 1),
        d38 AS (DELETE FROM deposits RETURNING 1),
        d39 AS (DELETE FROM withdrawals RETURNING 1),
        d40 AS (DELETE FROM risk_flags RETURNING 1),
        d41 AS (DELETE FROM self_exclusions RETURNING 1),
        d42 AS (DELETE FROM user_limits RETURNING 1),
        d43 AS (DELETE FROM outbox_events RETURNING 1),
        d44 AS (DELETE FROM analytics_events RETURNING 1),
        d45 AS (DELETE FROM referral_codes RETURNING 1),
        d46 AS (DELETE FROM referrals RETURNING 1),
        d47 AS (DELETE FROM user_deposit_wallets RETURNING 1),
        d48 AS (DELETE FROM linked_wallets RETURNING 1),
        d49 AS (DELETE FROM user_sessions WHERE user_id NOT IN (${adminIdList}) RETURNING 1),
        d50 AS (DELETE FROM user_profiles WHERE user_id NOT IN (${adminIdList}) RETURNING 1),
        d51 AS (DELETE FROM users WHERE role NOT IN ('admin', 'superadmin', 'operator') RETURNING 1)
      SELECT
        (SELECT count(*) FROM d01) AS weekly_race_prizes,
        (SELECT count(*) FROM d02) AS weekly_race_entries,
        (SELECT count(*) FROM d03) AS weekly_races,
        (SELECT count(*) FROM d04) AS candleflip_round_bets,
        (SELECT count(*) FROM d05) AS candleflip_rounds,
        (SELECT count(*) FROM d06) AS rug_round_bets,
        (SELECT count(*) FROM d07) AS rug_rounds,
        (SELECT count(*) FROM d08) AS rug_games,
        (SELECT count(*) FROM d09) AS candleflip_games,
        (SELECT count(*) FROM d10) AS mines_games,
        (SELECT count(*) FROM d11) AS trading_sim_trades,
        (SELECT count(*) FROM d12) AS trading_sim_participants,
        (SELECT count(*) FROM d13) AS trading_sim_rooms,
        (SELECT count(*) FROM d14) AS lottery_winners,
        (SELECT count(*) FROM d15) AS lottery_tickets,
        (SELECT count(*) FROM d16) AS lottery_draws,
        (SELECT count(*) FROM d17) AS prediction_rounds,
        (SELECT count(*) FROM d18) AS referral_earnings,
        (SELECT count(*) FROM d19) AS bet_results,
        (SELECT count(*) FROM d20) AS bets,
        (SELECT count(*) FROM d21) AS round_nodes,
        (SELECT count(*) FROM d22) AS round_events,
        (SELECT count(*) FROM d23) AS round_pools,
        (SELECT count(*) FROM d24) AS rounds,
        (SELECT count(*) FROM d25) AS tournament_participants,
        (SELECT count(*) FROM d26) AS tournaments,
        (SELECT count(*) FROM d27) AS failed_settlements,
        (SELECT count(*) FROM d28) AS activity_feed_items,
        (SELECT count(*) FROM d29) AS leaderboard_snapshots,
        (SELECT count(*) FROM d30) AS chat_messages,
        (SELECT count(*) FROM d31) AS daily_rewards,
        (SELECT count(*) FROM d32) AS user_mission_progress,
        (SELECT count(*) FROM d33) AS user_achievements,
        (SELECT count(*) FROM d34) AS season_pass_claims,
        (SELECT count(*) FROM d35) AS bonus_code_redemptions,
        (SELECT count(*) FROM d36) AS balance_ledger_entries,
        (SELECT count(*) FROM d37) AS balances,
        (SELECT count(*) FROM d38) AS deposits,
        (SELECT count(*) FROM d39) AS withdrawals,
        (SELECT count(*) FROM d40) AS risk_flags,
        (SELECT count(*) FROM d41) AS self_exclusions,
        (SELECT count(*) FROM d42) AS user_limits,
        (SELECT count(*) FROM d43) AS outbox_events,
        (SELECT count(*) FROM d44) AS analytics_events,
        (SELECT count(*) FROM d45) AS referral_codes,
        (SELECT count(*) FROM d46) AS referrals,
        (SELECT count(*) FROM d47) AS user_deposit_wallets,
        (SELECT count(*) FROM d48) AS linked_wallets,
        (SELECT count(*) FROM d49) AS user_sessions,
        (SELECT count(*) FROM d50) AS user_profiles,
        (SELECT count(*) FROM d51) AS users_deleted
    `)) as unknown as any[];

    const counts = result[0] || {};

    // Reset admin users' bonus/XP/stats (keep accounts but clean slate)
    await db.execute(sql`
      UPDATE users SET
        level = 1, xp_total = 0, xp_current = 0, xp_to_next = 100,
        bonus_claimed = false, vip_tier = 'bronze',
        updated_at = now()
      WHERE role IN ('admin', 'superadmin', 'operator')
    `);

    // Reset admin bonus code used_count back to 0
    await db.execute(sql`UPDATE bonus_codes SET used_count = 0`);

    // Create fresh weekly race for current week
    try {
      const { WeeklyRaceService } = await import('../modules/weekly-race/weeklyRace.service.js');
      await WeeklyRaceService.ensureActiveRace();
    } catch { /* non-critical */ }

    // Audit log
    await db.insert(adminAuditLogs).values({
      actorUserId: actor.userId,
      actionType: 'casino_data_reset',
      targetType: 'system',
      targetId: 'all',
      payload: { reason, counts, adminIdsPreserved: adminIds.length, timestamp: Date.now() },
      ipAddress: request.ip,
    });

    return {
      success: true,
      message: 'Casino reset complete. All non-admin users and game data deleted.',
      adminUsersPreserved: adminIds.length,
      deletedRows: counts,
    };
  });
}
