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
    const tw = Number(stats.total_wagered) / 100; // cents to dollars
    const bm = Number(stats.best_multiplier);

    // Generated missions based on user progress
    const missions = [
      { id: 'first-blood', title: 'First Blood', description: 'Complete your first round', progress: Math.min(rp, 1), target: 1, reward: 50, completed: rp >= 1 },
      { id: 'getting-started', title: 'Getting Started', description: 'Play 5 rounds', progress: Math.min(rp, 5), target: 5, reward: 100, completed: rp >= 5 },
      { id: 'high-roller', title: 'High Roller', description: 'Wager $500 total', progress: Math.min(Math.floor(tw), 500), target: 500, reward: 250, completed: tw >= 500 },
      { id: 'multiplier-hunter', title: 'Multiplier Hunter', description: 'Hit a 5x multiplier', progress: bm >= 5 ? 1 : 0, target: 1, reward: 500, completed: bm >= 5 },
      { id: 'marathon', title: 'Marathon', description: 'Play 50 rounds', progress: Math.min(rp, 50), target: 50, reward: 1000, completed: rp >= 50 },
      { id: 'whale', title: 'Whale Status', description: 'Wager $5,000 total', progress: Math.min(Math.floor(tw), 5000), target: 5000, reward: 2500, completed: tw >= 5000 },
    ];

    return { data: missions };
  });

  server.post('/missions/:id/claim', async (request) => {
    // Missions auto-reward, no manual claim needed for now
    return { success: true, message: 'Mission rewards are auto-applied' };
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

    // Calculate accumulated rakeback from total fees paid
    const feeResult = await db.execute(sql`
      SELECT COALESCE(SUM(fee), 0) as total_fees
      FROM bets WHERE user_id = ${userId} AND status = 'settled'
    `);
    const feeRows = feeResult as unknown as Array<Record<string, unknown>>;
    const totalFees = Number(feeRows[0]?.total_fees || 0);
    const accumulated = Math.floor(totalFees * rate);

    return {
      rate,
      tier: vipTier,
      accumulated,
      claimable: accumulated, // simplified: all accumulated is claimable
    };
  });

  server.post('/rakeback/claim', async (request) => {
    const userId = getAuthUser(request).userId;

    // Get claimable amount
    const userResult = await db.execute(sql`
      SELECT vip_tier FROM users WHERE id = ${userId}
    `);
    const userRows = userResult as unknown as Array<Record<string, unknown>>;
    const vipTier = String(userRows[0]?.vip_tier || 'bronze');
    const rate = RAKEBACK_RATES[vipTier] || 0.01;

    const feeResult = await db.execute(sql`
      SELECT COALESCE(SUM(fee), 0) as total_fees
      FROM bets WHERE user_id = ${userId} AND status = 'settled'
    `);
    const feeRows = feeResult as unknown as Array<Record<string, unknown>>;
    const totalFees = Number(feeRows[0]?.total_fees || 0);
    const claimable = Math.floor(totalFees * rate);

    if (claimable <= 0) {
      return { success: false, message: 'No rakeback to claim' };
    }

    // Credit to balance
    await db.execute(sql`
      UPDATE balances
      SET available_amount = available_amount + ${claimable}, updated_at = now()
      WHERE user_id = ${userId} AND asset = 'USDC'
    `);

    return { success: true, claimed: claimable };
  });
}
