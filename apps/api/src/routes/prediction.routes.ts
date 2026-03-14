import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { predictionRounds, activityFeedItems, users } from '@tradingarena/db';
import { getDb } from '../config/database.js';
import { requireAuth, getAuthUser } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { WalletService } from '../modules/wallet/wallet.service.js';
import { UserService } from '../modules/user/user.service.js';
import { env } from '../config/env.js';
import { getRedis } from '../config/redis.js';

// In-memory store for prediction locks (maps lockRef → { userId, betAmount, fee, totalCost, ref })
// Entries expire after 60s via Redis TTL
interface PredictionLock {
  userId: string;
  betAmount: number;
  fee: number;
  totalCost: number;
  refId: string;
}

export async function predictionRoutes(server: FastifyInstance) {
  const db = getDb();
  const walletService = new WalletService();
  const userService = new UserService();

  server.addHook('preHandler', requireAuth);

  // Step 1: Pre-lock funds before prediction game starts
  server.post('/lock', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const userId = getAuthUser(request).userId;

    const body = z.object({
      betAmount: z.number().int().positive(),
    }).parse(request.body);

    const feeRate = env.PLATFORM_FEE_RATE;
    const fee = Math.floor(body.betAmount * feeRate);
    const totalCost = body.betAmount + fee;

    const refId = nanoid();
    const ref = { type: 'prediction', id: refId };

    // Lock funds now (before game starts)
    await walletService.lockFunds(userId, totalCost, 'SOL', ref);

    // Store lock info in Redis with 120s TTL (game takes ~20s + buffer)
    const redis = getRedis();
    const lockData: PredictionLock = { userId, betAmount: body.betAmount, fee, totalCost, refId };
    await redis.set(`prediction:lock:${refId}`, JSON.stringify(lockData), 'EX', 120);

    return { success: true, lockRef: refId, fee };
  });

  // Step 2: Settle prediction after game resolves (uses pre-locked funds)
  server.post('/save', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const userId = getAuthUser(request).userId;

    const ALLOWED_MULTIPLIERS: Record<string, number> = { up: 1.9, down: 1.9, sideways: 3.0 };

    const body = z.object({
      lockRef: z.string().min(1),
      direction: z.enum(['up', 'down', 'sideways']),
      result: z.enum(['win', 'loss']),
      pattern: z.string().optional(),
    }).parse(request.body);

    // Retrieve and validate the pre-lock from Redis
    const redis = getRedis();
    const lockJson = await redis.get(`prediction:lock:${body.lockRef}`);
    if (!lockJson) {
      throw new AppError(410, 'LOCK_EXPIRED', 'Prediction lock expired or not found. Please try again.');
    }
    const lock: PredictionLock = JSON.parse(lockJson);

    // Security: ensure the lock belongs to this user
    if (lock.userId !== userId) {
      throw new AppError(403, 'LOCK_MISMATCH', 'Lock does not belong to this user');
    }

    // Delete the lock so it can't be reused
    await redis.del(`prediction:lock:${body.lockRef}`);

    const ref = { type: 'prediction', id: lock.refId };

    // Server-side validation: multiplier must match allowed value for direction
    const expectedMultiplier = ALLOWED_MULTIPLIERS[body.direction];
    const safeMultiplier = body.result === 'win' ? expectedMultiplier : 0;

    // Calculate actual payout using server-validated multiplier
    const actualPayout = body.result === 'win'
      ? Math.floor(lock.betAmount * safeMultiplier)
      : 0;

    // Settle: unlock locked funds and credit payout (funds were already locked in /lock)
    await walletService.settlePayout(userId, lock.betAmount, lock.fee, actualPayout, 'SOL', ref);

    // Save prediction record to DB
    const [saved] = await db.insert(predictionRounds).values({
      userId,
      direction: body.direction,
      betAmount: lock.betAmount,
      result: body.result,
      payout: actualPayout,
      multiplier: String(safeMultiplier),
      pattern: body.pattern ?? null,
      metadata: { savedAt: Date.now(), fee: lock.fee, ref: lock.refId },
    }).returning();

    // Update user_profiles stats (rounds_played, total_wagered, total_won, win_rate, best_multiplier, streaks)
    try {
      await db.execute(sql`
        UPDATE user_profiles
        SET rounds_played = rounds_played + 1,
            total_wagered = total_wagered + ${lock.betAmount},
            total_won = total_won + ${actualPayout},
            win_rate = CASE
              WHEN (total_wagered + ${lock.betAmount}) > 0
              THEN (total_won + ${actualPayout})::numeric / (total_wagered + ${lock.betAmount})::numeric
              ELSE 0
            END,
            best_multiplier = GREATEST(best_multiplier, ${safeMultiplier}),
            current_streak = CASE
              WHEN ${actualPayout} > ${lock.betAmount} THEN current_streak + 1
              ELSE 0
            END,
            best_streak = GREATEST(best_streak, CASE
              WHEN ${actualPayout} > ${lock.betAmount} THEN current_streak + 1
              ELSE 0
            END),
            updated_at = now()
        WHERE user_id = ${userId}
      `);
    } catch (err) {
      request.log.warn({ err, userId }, 'Failed to update prediction stats');
    }

    // Record referral commission for predictions
    try {
      const { ReferralService } = await import('../modules/referral/referral.service.js');
      await new ReferralService().recordCommission(userId, saved.id, lock.betAmount, lock.fee);
    } catch {
      // Non-critical
    }

    // Award XP
    const xpGained = body.result === 'win' ? 25 : 15;
    try {
      await userService.addXP(userId, xpGained, 'prediction');
    } catch (err) {
      request.log.warn({ err, userId, xpGained }, 'Failed to award prediction XP');
    }

    // Insert activity feed item for real players
    try {
      const player = await db.query.users.findFirst({ where: eq(users.id, userId) });
      if (player) {
        await db.insert(activityFeedItems).values({
          feedType: 'prediction_result',
          userId,
          payload: {
            username: player.username,
            level: player.level,
            vipTier: player.vipTier,
            direction: body.direction,
            betAmount: lock.betAmount,
            multiplier: safeMultiplier,
            payout: actualPayout,
            isWin: body.result === 'win',
          },
        });
      }
    } catch {
      // Non-critical
    }

    return { success: true, id: saved.id, payout: actualPayout, xpGained };
  });

  // Get prediction history
  server.get('/history', async (request) => {
    const userId = getAuthUser(request).userId;
    const { limit } = request.query as { limit?: string };

    const data = await db.select().from(predictionRounds)
      .where(eq(predictionRounds.userId, userId))
      .orderBy(desc(predictionRounds.createdAt))
      .limit(parseInt(limit || '20'));

    return { data };
  });
}
