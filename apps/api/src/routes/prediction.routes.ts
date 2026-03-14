import crypto from 'node:crypto';
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

// In-memory store for prediction locks (maps lockRef → { userId, betAmount, fee, totalCost, ref, serverOutcome })
// Entries expire after 120s via Redis TTL
interface PredictionLock {
  userId: string;
  betAmount: number;
  fee: number;
  totalCost: number;
  refId: string;
  direction: 'up' | 'down' | 'sideways'; // locked at bet time — client cannot change
  serverOutcome: 'win' | 'loss'; // Server-determined result — client cannot override
}

// ── Win probabilities per direction (house edge ~8-10% after 3% fee) ──
// Long: 50% win × 1.9x = 0.95 EV → 5% loss before fee → ~8% total house edge
// Short: 50% win × 1.9x = 0.95 EV → 5% loss before fee → ~8% total house edge
// Range: 30% win × 3.0x = 0.90 EV → 10% loss before fee → ~12.7% total house edge
const WIN_PROBABILITIES: Record<string, number> = {
  up: 0.50,
  down: 0.50,
  sideways: 0.30,
};

export async function predictionRoutes(server: FastifyInstance) {
  const db = getDb();
  const walletService = new WalletService();
  const userService = new UserService();

  server.addHook('preHandler', requireAuth);

  // Step 1: Pre-lock funds before prediction game starts
  // Direction is sent at lock time so the server can pre-determine the outcome
  server.post('/lock', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const userId = getAuthUser(request).userId;

    const body = z.object({
      betAmount: z.number().int().positive(),
      direction: z.enum(['up', 'down', 'sideways']),
    }).parse(request.body);

    const feeRate = env.PLATFORM_FEE_RATE;
    const fee = Math.floor(body.betAmount * feeRate);
    const totalCost = body.betAmount + fee;

    const refId = nanoid();
    const ref = { type: 'prediction', id: refId };

    // Lock funds now (before game starts)
    await walletService.lockFunds(userId, totalCost, 'SOL', ref);

    // ── Server determines outcome using crypto-safe RNG ──
    const winProb = WIN_PROBABILITIES[body.direction] ?? 0.50;
    const roll = crypto.randomInt(10000) / 10000; // 0.0000 - 0.9999
    const serverOutcome: 'win' | 'loss' = roll < winProb ? 'win' : 'loss';

    // Store lock info in Redis with 120s TTL (game takes ~20s + buffer)
    const redis = getRedis();
    const lockData: PredictionLock = {
      userId,
      betAmount: body.betAmount,
      fee,
      totalCost,
      refId,
      direction: body.direction,
      serverOutcome,
    };
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
      result: z.enum(['win', 'loss']), // Client sends this but server OVERRIDES it
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

    // H9 fix: Enforce direction matches what was locked — client cannot change direction after locking
    if (body.direction !== lock.direction) {
      throw new AppError(400, 'DIRECTION_MISMATCH', 'Direction must match the one used when locking funds');
    }

    const ref = { type: 'prediction', id: lock.refId };

    // ── SERVER DETERMINES OUTCOME — client result is IGNORED ──
    const serverResult = lock.serverOutcome; // 'win' or 'loss' — set at lock time
    const expectedMultiplier = ALLOWED_MULTIPLIERS[lock.direction];
    const safeMultiplier = serverResult === 'win' ? expectedMultiplier : 0;

    // Calculate actual payout using server-determined outcome
    const actualPayout = serverResult === 'win'
      ? Math.floor(lock.betAmount * safeMultiplier)
      : 0;

    // Settle: unlock locked funds and credit payout (funds were already locked in /lock)
    await walletService.settlePayout(userId, lock.betAmount, lock.fee, actualPayout, 'SOL', ref);

    // Save prediction record to DB
    const [saved] = await db.insert(predictionRounds).values({
      userId,
      direction: lock.direction,
      betAmount: lock.betAmount,
      result: serverResult,
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
    const xpGained = serverResult === 'win' ? 25 : 15;
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
            isWin: serverResult === 'win',
          },
        });
      }
    } catch {
      // Non-critical
    }

    return { success: true, id: saved.id, payout: actualPayout, xpGained, result: serverResult };
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
