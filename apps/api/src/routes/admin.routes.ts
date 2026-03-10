import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, sql, ilike, or, count, sum, avg } from 'drizzle-orm';
import {
  rounds, bets, betResults, users, userProfiles, featureFlags,
  engineConfigs, adminAuditLogs, balances, balanceLedgerEntries,
  deposits, withdrawals, roundPools, roundNodes, riskFlags,
  userDepositWallets, referralCodes, referrals, referralEarnings,
  chatMessages,
} from '@tradingarena/db';
import { getDb } from '../config/database.js';
import { requireAdmin, getAuthUser } from '../middleware/auth.js';
import { getTreasuryAddress, getSolanaConnection } from '../modules/solana/treasury.js';
import { DepositWalletService } from '../modules/solana/depositWallet.service.js';

export async function adminRoutes(server: FastifyInstance) {
  const db = getDb();

  server.addHook('preHandler', requireAdmin);

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
    const lim = parseInt(limit || '50');
    const off = parseInt(offset || '0');

    const conditions = search
      ? or(ilike(users.username, `%${search}%`), ilike(users.email, `%${search}%`))
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
    const { id } = request.params as { id: string };

    const user = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!user) return { error: 'User not found' };

    const profile = await db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, id) });
    const [bal] = await db.select().from(balances).where(eq(balances.userId, id));
    const recentBets = await db.select().from(bets).where(eq(bets.userId, id)).orderBy(desc(bets.createdAt)).limit(10);

    return {
      ...user,
      availableAmount: bal?.availableAmount ?? 0,
      lockedAmount: bal?.lockedAmount ?? 0,
      pendingAmount: bal?.pendingAmount ?? 0,
      totalWagered: profile?.totalWagered ?? 0,
      totalWon: profile?.totalWon ?? 0,
      roundsPlayed: profile?.roundsPlayed ?? 0,
      bestMultiplier: profile?.bestMultiplier ?? '1.0',
      winRate: profile?.winRate ?? '0.0',
      recentBets,
    };
  });

  server.patch('/users/:id', async (request) => {
    const { id } = request.params as { id: string };
    const { status, role } = request.body as { status?: string; role?: string };
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

  server.post('/users/:id/balance-adjustment', async (request) => {
    const { id } = request.params as { id: string };
    const { amount, reason, asset } = request.body as { amount: number; reason: string; asset?: string };
    const actor = getAuthUser(request);
    const assetType = asset || 'SOL';

    // Upsert balance
    const [existing] = await db.select().from(balances).where(and(eq(balances.userId, id), eq(balances.asset, assetType)));

    if (existing) {
      await db.update(balances).set({
        availableAmount: existing.availableAmount + amount,
        updatedAt: new Date(),
      }).where(and(eq(balances.userId, id), eq(balances.asset, assetType)));
    } else {
      await db.insert(balances).values({
        userId: id,
        asset: assetType,
        availableAmount: amount,
        updatedAt: new Date(),
      });
    }

    // Ledger entry
    const newBalance = (existing?.availableAmount ?? 0) + amount;
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

  server.patch('/treasury/withdrawals/:id', async (request) => {
    const { id } = request.params as { id: string };
    const { status, reason } = request.body as { status: 'approved' | 'rejected'; reason?: string };
    const actor = getAuthUser(request);

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
    const { id } = request.params as { id: string };

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
    const { id } = request.params as { id: string };
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

  server.post('/engine-config', async (request) => {
    const { config } = request.body as { config: unknown };
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

  server.patch('/engine-config/:id/activate', async (request) => {
    const { id } = request.params as { id: string };
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

  server.patch('/feature-flags/:key', async (request) => {
    const { key } = request.params as { key: string };
    const { enabled, config } = request.body as { enabled?: boolean; config?: unknown };
    const actor = getAuthUser(request);

    const update: Record<string, unknown> = { updatedAt: new Date(), updatedBy: actor.userId };
    if (enabled !== undefined) update.enabled = enabled;
    if (config !== undefined) update.config = config;

    await db.update(featureFlags).set(update).where(eq(featureFlags.flagKey, key));

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

  server.post('/feature-flags', async (request) => {
    const { flagKey, description, enabled, config } = request.body as {
      flagKey: string; description: string; enabled?: boolean; config?: unknown;
    };
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

  server.patch('/risk-flags/:id/resolve', async (request) => {
    const { id } = request.params as { id: string };
    const { notes } = request.body as { notes: string };
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
    const { userId } = request.params as { userId: string };
    const address = await depositWalletService.getWalletAddress(userId);
    if (!address) return { error: 'No deposit wallet found for user' };

    const balance = await depositWalletService.getWalletBalance(address);
    return { address, balance, balanceSol: balance / 1_000_000_000 };
  });

  server.post('/deposit-wallets/:userId/sweep', async (request) => {
    const { userId } = request.params as { userId: string };
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

  server.delete('/chat/messages/:id', async (request) => {
    const { id } = request.params as { id: string };
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
}
