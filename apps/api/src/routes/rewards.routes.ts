import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { requireAuth, getAuthUser } from '../middleware/auth.js';
import { getDb } from '../config/database.js';

// VIP rakeback rates
const RAKEBACK_RATES: Record<string, number> = {
  bronze: 0.01,
  silver: 0.02,
  gold: 0.03,
  platinum: 0.05,
  titan: 0.08,
};

// Mystery box reward configuration per VIP tier
// Each entry: { probability, amountLamports }
const MYSTERY_BOX_REWARDS: Record<string, Record<string, { probability: number; amountLamports: number }>> = {
  bronze: {
    common:    { probability: 0.60,  amountLamports: 1_000_000 },       // 0.001 SOL
    uncommon:  { probability: 0.25,  amountLamports: 5_000_000 },       // 0.005 SOL
    rare:      { probability: 0.12,  amountLamports: 10_000_000 },      // 0.01 SOL
    epic:      { probability: 0.025, amountLamports: 50_000_000 },      // 0.05 SOL
    legendary: { probability: 0.005, amountLamports: 100_000_000 },     // 0.1 SOL
  },
  silver: {
    common:    { probability: 0.50,  amountLamports: 2_000_000 },       // 0.002 SOL
    uncommon:  { probability: 0.28,  amountLamports: 10_000_000 },      // 0.01 SOL
    rare:      { probability: 0.16,  amountLamports: 25_000_000 },      // 0.025 SOL
    epic:      { probability: 0.05,  amountLamports: 100_000_000 },     // 0.1 SOL
    legendary: { probability: 0.01,  amountLamports: 250_000_000 },     // 0.25 SOL
  },
  gold: {
    common:    { probability: 0.45,  amountLamports: 5_000_000 },       // 0.005 SOL
    uncommon:  { probability: 0.28,  amountLamports: 20_000_000 },      // 0.02 SOL
    rare:      { probability: 0.18,  amountLamports: 50_000_000 },      // 0.05 SOL
    epic:      { probability: 0.07,  amountLamports: 200_000_000 },     // 0.2 SOL
    legendary: { probability: 0.02,  amountLamports: 500_000_000 },     // 0.5 SOL
  },
  platinum: {
    common:    { probability: 0.40,  amountLamports: 10_000_000 },      // 0.01 SOL
    uncommon:  { probability: 0.28,  amountLamports: 40_000_000 },      // 0.04 SOL
    rare:      { probability: 0.20,  amountLamports: 100_000_000 },     // 0.1 SOL
    epic:      { probability: 0.09,  amountLamports: 400_000_000 },     // 0.4 SOL
    legendary: { probability: 0.03,  amountLamports: 1_000_000_000 },   // 1.0 SOL
  },
  titan: {
    common:    { probability: 0.35,  amountLamports: 20_000_000 },      // 0.02 SOL
    uncommon:  { probability: 0.28,  amountLamports: 80_000_000 },      // 0.08 SOL
    rare:      { probability: 0.22,  amountLamports: 200_000_000 },     // 0.2 SOL
    epic:      { probability: 0.10,  amountLamports: 500_000_000 },     // 0.5 SOL
    legendary: { probability: 0.05,  amountLamports: 2_000_000_000 },   // 2.0 SOL
  },
};

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

function rollMysteryBox(vipTier: string): { rarity: string; amountLamports: number } {
  const rewards = MYSTERY_BOX_REWARDS[vipTier] || MYSTERY_BOX_REWARDS.bronze;
  const roll = crypto.randomInt(1_000_000) / 1_000_000; // cryptographically secure
  let cumulative = 0;

  for (const rarity of RARITY_ORDER) {
    cumulative += rewards[rarity].probability;
    if (roll < cumulative) {
      return { rarity, amountLamports: rewards[rarity].amountLamports };
    }
  }

  // Fallback
  return { rarity: 'common', amountLamports: rewards.common.amountLamports };
}

export async function rewardsRoutes(server: FastifyInstance) {
  const db = getDb();

  server.addHook('preHandler', requireAuth);

  server.get('/missions', async (request) => {
    const userId = getAuthUser(request).userId;

    // Fetch user stats to compute mission progress
    const statsResult = await db.execute(sql`
      SELECT
        COALESCE(rounds_played, 0) as rounds_played,
        COALESCE(total_wagered, 0) as total_wagered,
        COALESCE(total_won, 0) as total_won,
        COALESCE(best_multiplier, 0) as best_multiplier
      FROM user_profiles
      WHERE user_id = ${userId}
    `);

    const rows = statsResult as unknown as Array<Record<string, unknown>>;
    const stats = rows[0] || { rounds_played: 0, total_wagered: 0, total_won: 0, best_multiplier: 0 };
    const rp = Number(stats.rounds_played);
    const tw = Number(stats.total_wagered) / 1_000_000_000; // lamports to SOL
    const bm = Number(stats.best_multiplier);

    // Check which missions have already been claimed
    const claimedResult = await db.execute(sql`
      SELECT reference_id FROM balance_ledger_entries
      WHERE user_id = ${userId} AND entry_type = 'mission_claim'
    `);
    const claimedRows = claimedResult as unknown as Array<Record<string, unknown>>;
    const claimedIds = new Set(claimedRows.map(r => String(r.reference_id)));

    // Generated missions based on user progress
    const missions = [
      { id: 'first-blood', title: 'First Blood', description: 'Complete your first round', progress: Math.min(rp, 1), target: 1, reward: 50, completed: rp >= 1 },
      { id: 'getting-started', title: 'Getting Started', description: 'Play 5 rounds', progress: Math.min(rp, 5), target: 5, reward: 100, completed: rp >= 5 },
      { id: 'high-roller', title: 'High Roller', description: 'Wager 500 SOL total', progress: Math.min(Math.floor(tw), 500), target: 500, reward: 250, completed: tw >= 500 },
      { id: 'multiplier-hunter', title: 'Multiplier Hunter', description: 'Hit a 5x multiplier', progress: bm >= 5 ? 1 : 0, target: 1, reward: 500, completed: bm >= 5 },
      { id: 'marathon', title: 'Marathon', description: 'Play 50 rounds', progress: Math.min(rp, 50), target: 50, reward: 1000, completed: rp >= 50 },
      { id: 'whale', title: 'Whale Status', description: 'Wager 5,000 SOL total', progress: Math.min(Math.floor(tw), 5000), target: 5000, reward: 2500, completed: tw >= 5000 },
    ].map(m => ({ ...m, claimed: claimedIds.has(m.id) }));

    return { data: missions };
  });

  // Mission rewards in lamports (reward field is display-only XP-like value, actual SOL credit here)
  const MISSION_REWARDS_LAMPORTS: Record<string, number> = {
    'first-blood': 50_000_000,      // 0.05 SOL
    'getting-started': 100_000_000, // 0.1 SOL
    'high-roller': 250_000_000,     // 0.25 SOL
    'multiplier-hunter': 500_000_000, // 0.5 SOL
    'marathon': 1_000_000_000,      // 1 SOL
    'whale': 2_500_000_000,         // 2.5 SOL
  };

  server.post('/missions/:id/claim', async (request) => {
    const userId = getAuthUser(request).userId;
    const { id } = request.params as { id: string };

    // Validate mission ID upfront
    const rewardLamports = MISSION_REWARDS_LAMPORTS[id];
    if (!rewardLamports) {
      return { success: false, message: 'Unknown mission' };
    }

    // Verify mission is actually completed
    const statsResult = await db.execute(sql`
      SELECT
        COALESCE(rounds_played, 0) as rounds_played,
        COALESCE(total_wagered, 0) as total_wagered,
        COALESCE(best_multiplier, 0) as best_multiplier
      FROM user_profiles
      WHERE user_id = ${userId}
    `);
    const rows = statsResult as unknown as Array<Record<string, unknown>>;
    const stats = rows[0] || { rounds_played: 0, total_wagered: 0, best_multiplier: 0 };
    const rp = Number(stats.rounds_played);
    const tw = Number(stats.total_wagered) / 1_000_000_000; // lamports to SOL
    const bm = Number(stats.best_multiplier);

    const completionMap: Record<string, boolean> = {
      'first-blood': rp >= 1,
      'getting-started': rp >= 5,
      'high-roller': tw >= 500,
      'multiplier-hunter': bm >= 5,
      'marathon': rp >= 50,
      'whale': tw >= 5000,
    };

    if (!completionMap[id]) {
      return { success: false, message: 'Mission not yet completed' };
    }

    // Atomic claim guard: INSERT ledger entry with ON CONFLICT to prevent double-claim race condition
    const claimResult = await db.execute(sql`
      INSERT INTO balance_ledger_entries
        (user_id, asset, entry_type, amount, balance_after, reference_type, reference_id)
      SELECT ${userId}, 'SOL', 'mission_claim', ${rewardLamports}, 0, 'mission', ${id}
      WHERE NOT EXISTS (
        SELECT 1 FROM balance_ledger_entries
        WHERE user_id = ${userId} AND entry_type = 'mission_claim' AND reference_id = ${id}
      )
      RETURNING id
    `);
    const claimRows = claimResult as unknown as Array<Record<string, unknown>>;
    if (claimRows.length === 0) {
      return { success: false, message: 'Mission already claimed' };
    }

    // Credit reward to balance
    await db.execute(sql`
      UPDATE balances
      SET available_amount = available_amount + ${rewardLamports}, updated_at = now()
      WHERE user_id = ${userId} AND asset = 'SOL'
    `);

    // Update ledger entry with correct balance_after
    const balResult = await db.execute(sql`
      SELECT available_amount FROM balances
      WHERE user_id = ${userId} AND asset = 'SOL'
    `);
    const balAfter = Number((balResult as unknown as Array<Record<string, unknown>>)[0]?.available_amount || 0);
    await db.execute(sql`
      UPDATE balance_ledger_entries SET balance_after = ${balAfter}
      WHERE id = ${claimRows[0].id}
    `);

    return { success: true, message: `Claimed ${(rewardLamports / 1e9).toFixed(2)} SOL!`, amount: rewardLamports };
  });

  server.get('/achievements', async (request) => {
    const userId = getAuthUser(request).userId;

    const statsResult = await db.execute(sql`
      SELECT
        COALESCE(rounds_played, 0) as rounds_played,
        COALESCE(best_multiplier, 0) as best_multiplier
      FROM user_profiles
      WHERE user_id = ${userId}
    `);

    const userResult = await db.execute(sql`
      SELECT level FROM users WHERE id = ${userId}
    `);

    const rows = statsResult as unknown as Array<Record<string, unknown>>;
    const userRows = userResult as unknown as Array<Record<string, unknown>>;
    const stats = rows[0] || { rounds_played: 0, best_multiplier: 0 };
    const level = Number(userRows[0]?.level || 1);
    const rp = Number(stats.rounds_played);
    const bm = Number(stats.best_multiplier);

    const achievements = [
      { id: 'arena-entrant', title: 'Arena Entrant', description: 'Enter the trading arena', unlockedAt: rp > 0 ? new Date().toISOString() : null },
      { id: 'moon-shot', title: 'Moon Shot', description: 'Hit a 10x+ multiplier', unlockedAt: bm >= 10 ? new Date().toISOString() : null },
      { id: 'veteran', title: 'Veteran', description: 'Reach level 10', unlockedAt: level >= 10 ? new Date().toISOString() : null },
      { id: 'centurion', title: 'Centurion', description: 'Play 100 rounds', unlockedAt: rp >= 100 ? new Date().toISOString() : null },
      { id: 'legend', title: 'Legend', description: 'Hit a 25x+ multiplier', unlockedAt: bm >= 25 ? new Date().toISOString() : null },
    ];

    return { data: achievements };
  });

  server.get('/rakeback', async (request) => {
    const userId = getAuthUser(request).userId;

    const userResult = await db.execute(sql`
      SELECT vip_tier FROM users WHERE id = ${userId}
    `);
    const userRows = userResult as unknown as Array<Record<string, unknown>>;
    const vipTier = String(userRows[0]?.vip_tier || 'bronze');
    const rate = RAKEBACK_RATES[vipTier] || 0.01;

    // Calculate accumulated rakeback from total fees paid (solo + prediction + tournament)
    const feeResult = await db.execute(sql`
      SELECT COALESCE(SUM(fee), 0) as total_fees FROM (
        SELECT fee FROM bets WHERE user_id = ${userId} AND status = 'settled'
        UNION ALL
        SELECT (metadata->>'fee')::bigint as fee FROM prediction_rounds WHERE user_id = ${userId} AND metadata->>'fee' IS NOT NULL
        UNION ALL
        SELECT fee FROM tournament_participants tp JOIN tournaments t ON t.id = tp.tournament_id WHERE tp.user_id = ${userId}
      ) all_fees
    `);
    const feeRows = feeResult as unknown as Array<Record<string, unknown>>;
    const totalFees = Number(feeRows[0]?.total_fees || 0);
    const accumulated = Math.floor(totalFees * rate);

    // Subtract what has already been claimed (tracked via ledger entries)
    const claimedResult = await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0) as total_claimed
      FROM balance_ledger_entries
      WHERE user_id = ${userId} AND asset = 'SOL' AND entry_type = 'rakeback_claim'
    `);
    const claimedRows = claimedResult as unknown as Array<Record<string, unknown>>;
    const totalClaimed = Number(claimedRows[0]?.total_claimed || 0);
    const claimable = Math.max(0, accumulated - totalClaimed);

    return {
      rate,
      tier: vipTier,
      accumulated,
      claimable,
    };
  });

  server.post('/rakeback/claim', async (request) => {
    const userId = getAuthUser(request).userId;
    const { getRedis } = await import('../config/redis.js');
    const redis = getRedis();

    // Distributed lock to prevent double-claim race condition
    const lockKey = `rakeback_claim:${userId}`;
    const locked = await redis.set(lockKey, '1', 'EX', 10, 'NX');
    if (!locked) {
      return { success: false, message: 'Claim already in progress' };
    }

    try {
      // Get claimable amount
      const userResult = await db.execute(sql`
        SELECT vip_tier FROM users WHERE id = ${userId}
      `);
      const userRows = userResult as unknown as Array<Record<string, unknown>>;
      const vipTier = String(userRows[0]?.vip_tier || 'bronze');
      const rate = RAKEBACK_RATES[vipTier] || 0.01;

      const feeResult2 = await db.execute(sql`
        SELECT COALESCE(SUM(fee), 0) as total_fees FROM (
          SELECT fee FROM bets WHERE user_id = ${userId} AND status = 'settled'
          UNION ALL
          SELECT (metadata->>'fee')::bigint as fee FROM prediction_rounds WHERE user_id = ${userId} AND metadata->>'fee' IS NOT NULL
          UNION ALL
          SELECT fee FROM tournament_participants tp JOIN tournaments t ON t.id = tp.tournament_id WHERE tp.user_id = ${userId}
        ) all_fees
      `);
      const feeRows2 = feeResult2 as unknown as Array<Record<string, unknown>>;
      const totalFees2 = Number(feeRows2[0]?.total_fees || 0);
      const accumulated2 = Math.floor(totalFees2 * rate);

      const claimedResult2 = await db.execute(sql`
        SELECT COALESCE(SUM(amount), 0) as total_claimed
        FROM balance_ledger_entries
        WHERE user_id = ${userId} AND asset = 'SOL' AND entry_type = 'rakeback_claim'
      `);
      const claimedRows2 = claimedResult2 as unknown as Array<Record<string, unknown>>;
      const totalClaimed2 = Number(claimedRows2[0]?.total_claimed || 0);
      const claimable = Math.max(0, accumulated2 - totalClaimed2);

      if (claimable <= 0) {
        return { success: false, message: 'No rakeback to claim' };
      }

      // Credit to balance
      await db.execute(sql`
        UPDATE balances
        SET available_amount = available_amount + ${claimable}, updated_at = now()
        WHERE user_id = ${userId} AND asset = 'SOL'
      `);

      // Record ledger entry
      const balResult = await db.execute(sql`
        SELECT available_amount FROM balances WHERE user_id = ${userId} AND asset = 'SOL'
      `);
      const balAfter = Number((balResult as unknown as Array<Record<string, unknown>>)[0]?.available_amount || 0);

      await db.execute(sql`
        INSERT INTO balance_ledger_entries
          (user_id, asset, entry_type, amount, balance_after, reference_type, reference_id)
        VALUES (${userId}, 'SOL', 'rakeback_claim', ${claimable}, ${balAfter}, 'rakeback', ${userId})
      `);

      return { success: true, claimed: claimable };
    } finally {
      await redis.del(lockKey);
    }
  });

  // ---- Daily Mystery Box ----

  server.get('/daily-box', async (request) => {
    const userId = getAuthUser(request).userId;

    const userResult = await db.execute(sql`
      SELECT level, vip_tier FROM users WHERE id = ${userId}
    `);
    const userRows = userResult as unknown as Array<Record<string, unknown>>;
    const level = Number(userRows[0]?.level || 1);
    const vipTier = String(userRows[0]?.vip_tier || 'bronze');

    // Find most recent claim
    const lastClaimResult = await db.execute(sql`
      SELECT claimed_at FROM daily_rewards
      WHERE user_id = ${userId}
      ORDER BY claimed_at DESC
      LIMIT 1
    `);
    const claimRows = lastClaimResult as unknown as Array<Record<string, unknown>>;
    const lastClaimed = claimRows[0]?.claimed_at
      ? new Date(claimRows[0].claimed_at as string)
      : null;

    const now = new Date();
    const cooldownMs = 24 * 60 * 60 * 1000;
    const nextAvailableAt = lastClaimed
      ? new Date(lastClaimed.getTime() + cooldownMs)
      : null;
    const available = !lastClaimed || now >= nextAvailableAt!;

    // Build reward table for current tier
    const tierRewards = MYSTERY_BOX_REWARDS[vipTier] || MYSTERY_BOX_REWARDS.bronze;
    const rewardTable = RARITY_ORDER.map((rarity) => ({
      rarity,
      probability: tierRewards[rarity].probability,
      amountLamports: tierRewards[rarity].amountLamports,
    }));

    // Next tier preview
    const tierOrder = ['bronze', 'silver', 'gold', 'platinum', 'titan'];
    const currentIdx = tierOrder.indexOf(vipTier);
    const nextTier = currentIdx < tierOrder.length - 1 ? tierOrder[currentIdx + 1] : null;
    let nextTierRewards = null;
    if (nextTier) {
      const nr = MYSTERY_BOX_REWARDS[nextTier];
      nextTierRewards = {
        tier: nextTier,
        rewards: RARITY_ORDER.map((rarity) => ({
          rarity,
          probability: nr[rarity].probability,
          amountLamports: nr[rarity].amountLamports,
        })),
      };
    }

    // Claim history (last 10)
    const historyResult = await db.execute(sql`
      SELECT id, claimed_at, rarity, amount_lamports, user_level, vip_tier
      FROM daily_rewards
      WHERE user_id = ${userId}
      ORDER BY claimed_at DESC
      LIMIT 10
    `);
    const history = (historyResult as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: r.id,
      claimedAt: r.claimed_at,
      rarity: r.rarity,
      amountLamports: Number(r.amount_lamports),
      userLevel: Number(r.user_level),
      vipTier: r.vip_tier,
    }));

    return { available, nextAvailableAt: nextAvailableAt?.toISOString() || null, level, vipTier, rewardTable, nextTierRewards, history };
  });

  server.post('/daily-box/claim', async (request) => {
    const userId = getAuthUser(request).userId;

    const userResult = await db.execute(sql`
      SELECT level, vip_tier FROM users WHERE id = ${userId}
    `);
    const userRows = userResult as unknown as Array<Record<string, unknown>>;
    const level = Number(userRows[0]?.level || 1);
    const vipTier = String(userRows[0]?.vip_tier || 'bronze');

    // Roll the mystery box (before cooldown check so we can insert atomically)
    const { rarity, amountLamports } = rollMysteryBox(vipTier);

    // Atomic: Insert daily_rewards only if 24h cooldown has passed (prevents race condition)
    const cooldownMs = 24 * 60 * 60 * 1000;
    const insertResult = await db.execute(sql`
      INSERT INTO daily_rewards (user_id, rarity, amount_lamports, user_level, vip_tier)
      SELECT ${userId}, ${rarity}, ${amountLamports}, ${level}, ${vipTier}
      WHERE NOT EXISTS (
        SELECT 1 FROM daily_rewards
        WHERE user_id = ${userId}
          AND claimed_at > NOW() - INTERVAL '24 hours'
      )
      RETURNING id
    `);
    const insertRows = insertResult as unknown as Array<Record<string, unknown>>;
    if (insertRows.length === 0) {
      return { success: false, message: 'Daily box already claimed', nextAvailableAt: null };
    }
    const rewardId = insertRows[0].id as string;

    // Credit balance
    await db.execute(sql`
      UPDATE balances
      SET available_amount = available_amount + ${amountLamports}, updated_at = now()
      WHERE user_id = ${userId} AND asset = 'SOL'
    `);

    // Record ledger entry
    const balResult = await db.execute(sql`
      SELECT available_amount FROM balances
      WHERE user_id = ${userId} AND asset = 'SOL'
    `);
    const balAfter = Number((balResult as unknown as Array<Record<string, unknown>>)[0]?.available_amount || 0);

    await db.execute(sql`
      INSERT INTO balance_ledger_entries
        (user_id, asset, entry_type, amount, balance_after, reference_type, reference_id)
      VALUES (${userId}, 'SOL', 'daily_box_reward', ${amountLamports}, ${balAfter}, 'daily_reward', ${rewardId})
    `);

    return {
      success: true,
      reward: { id: rewardId, rarity, amountLamports, level, vipTier },
    };
  });
}
