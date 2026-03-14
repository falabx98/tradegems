import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { seasonPassClaims, balances, balanceLedgerEntries, users } from '@tradingarena/db';
import { getDb } from '../config/database.js';
import { requireAuth, getAuthUser } from '../middleware/auth.js';

const CURRENT_SEASON = 1;

const FREE_REWARDS: Record<number, number> = {
  1: 1_000_000, 3: 5_000_000, 5: 10_000_000, 8: 20_000_000,
  10: 50_000_000, 13: 20_000_000, 15: 100_000_000, 18: 50_000_000,
  20: 200_000_000, 25: 500_000_000, 30: 1_000_000_000,
};

const PREMIUM_REWARDS: Record<number, number> = {
  2: 5_000_000, 5: 20_000_000, 10: 100_000_000, 15: 250_000_000,
  20: 500_000_000, 25: 1_000_000_000, 30: 2_000_000_000,
};

export async function seasonRoutes(server: FastifyInstance) {
  const db = getDb();

  server.addHook('preHandler', requireAuth);

  // Get season status + claimed levels
  server.get('/status', async (request) => {
    const userId = getAuthUser(request).userId;

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    const claims = await db.select().from(seasonPassClaims)
      .where(and(eq(seasonPassClaims.userId, userId), eq(seasonPassClaims.seasonNumber, CURRENT_SEASON)));

    const claimedFree = claims.filter(c => c.track === 'free').map(c => c.level);
    const claimedPremium = claims.filter(c => c.track === 'premium').map(c => c.level);

    return {
      seasonNumber: CURRENT_SEASON,
      playerLevel: user?.level ?? 1,
      claimedFree,
      claimedPremium,
      hasPremium: false, // Future: check if user has premium pass
    };
  });

  // Claim a season reward
  server.post('/claim', async (request, reply) => {
    const userId = getAuthUser(request).userId;

    const body = z.object({
      level: z.number().int().min(1).max(30),
      track: z.enum(['free', 'premium']),
    }).parse(request.body);

    // Premium track gate: require premium pass (currently unavailable)
    if (body.track === 'premium') {
      return reply.status(400).send({ error: 'Premium season pass required. Coming soon!' });
    }

    const rewards = body.track === 'free' ? FREE_REWARDS : PREMIUM_REWARDS;
    const rewardAmount = rewards[body.level];
    if (!rewardAmount) {
      return reply.status(400).send({ error: 'No reward at this level for this track' });
    }

    // Check user level
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user || user.level < body.level) {
      return reply.status(400).send({ error: 'Level not reached yet' });
    }

    // Atomic claim guard: INSERT claim first, fail on duplicate (prevents race condition)
    try {
      await db.insert(seasonPassClaims).values({
        userId,
        seasonNumber: CURRENT_SEASON,
        level: body.level,
        track: body.track,
        amountLamports: rewardAmount,
      });
    } catch (err: any) {
      if (err?.code === '23505' || err?.message?.includes('duplicate')) {
        return reply.status(400).send({ error: 'Already claimed' });
      }
      throw err;
    }

    // Credit balance atomically
    const updated = await db.update(balances)
      .set({ availableAmount: sql`${balances.availableAmount} + ${rewardAmount}`, updatedAt: new Date() })
      .where(and(eq(balances.userId, userId), eq(balances.asset, 'SOL')))
      .returning({ newBalance: balances.availableAmount });

    let newBalance: number;
    if (updated.length === 0) {
      const [ins] = await db.insert(balances).values({ userId, asset: 'SOL', availableAmount: rewardAmount, updatedAt: new Date() }).returning({ newBalance: balances.availableAmount });
      newBalance = ins.newBalance;
    } else {
      newBalance = updated[0].newBalance;
    }

    // Ledger entry
    await db.insert(balanceLedgerEntries).values({
      userId,
      asset: 'SOL',
      entryType: 'season_reward',
      amount: rewardAmount,
      balanceAfter: newBalance,
      referenceType: 'season',
      referenceId: `season-${CURRENT_SEASON}-${body.track}-${body.level}`,
      metadata: { seasonNumber: CURRENT_SEASON, level: body.level, track: body.track },
    });

    return { success: true, amount: rewardAmount, newBalance };
  });
}
