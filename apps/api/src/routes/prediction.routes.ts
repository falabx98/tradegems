import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { predictionRounds, activityFeedItems, users } from '@tradingarena/db';
import { getDb } from '../config/database.js';
import { requireAuth, getAuthUser } from '../middleware/auth.js';
import { requireNotExcluded } from '../middleware/selfExclusion.js';
import { AppError } from '../middleware/errorHandler.js';
import { WalletService } from '../modules/wallet/wallet.service.js';
import { UserService } from '../modules/user/user.service.js';
import { env } from '../config/env.js';
import { getRedis } from '../config/redis.js';
import { requireGameEnabled } from '../utils/gameGates.js';
import { auditLog } from '../utils/auditLog.js';
import { validateBetLimits, validateGameBetLimits } from '../utils/betLimits.js';
import { checkPayoutOutlier } from '../utils/payoutMonitor.js';

// In-memory store for prediction locks (maps lockRef → { userId, betAmount, fee, totalCost, ref, serverOutcome })
// Entries expire after 120s via Redis TTL
interface PredictionLock {
  userId: string;
  betAmount: number;
  fee: number;
  totalCost: number;
  refId: string;
  direction: 'up' | 'down' | 'sideways';
  serverOutcome: 'win' | 'loss';
  createdAt: number;
  // Provably fair fields
  serverSeed: string;
  seedHash: string;
  clientSeed: string;
  nonce: number;
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
  server.post('/lock', { preHandler: [requireAuth, requireNotExcluded], config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    await requireGameEnabled('predictions');
    const userId = getAuthUser(request).userId;

    const body = z.object({
      betAmount: z.number().int().positive().min(1_000_000).max(env.PREDICTIONS_MAX_BET_LAMPORTS),
      direction: z.enum(['up', 'down', 'sideways']),
    }).parse(request.body);

    // Game-specific bet validation
    validateGameBetLimits('predictions', userId, body.betAmount);

    const feeRate = env.PLATFORM_FEE_RATE;
    const fee = Math.floor(body.betAmount * feeRate);
    await validateBetLimits(userId, body.betAmount, fee);
    const totalCost = body.betAmount + fee;

    const refId = nanoid();
    const ref = { type: 'prediction', id: refId };

    // Lock funds now (before game starts)
    await walletService.lockFunds(userId, totalCost, 'SOL', ref);

    // ── Provably Fair outcome determination ──
    const { generateServerSeed, hashSeed, generatePredictionOutcome, useNonce } = await import('../utils/provablyFair.js');

    const serverSeed = generateServerSeed();
    const seedHash = hashSeed(serverSeed);
    const { clientSeed, nonce } = await useNonce(userId);

    const winProb = WIN_PROBABILITIES[body.direction] ?? 0.50;
    const { outcome: serverOutcome } = generatePredictionOutcome(serverSeed, clientSeed, nonce, winProb);

    // Store lock info in Redis with 120s TTL
    const redis = getRedis();
    const lockData: PredictionLock = {
      userId,
      betAmount: body.betAmount,
      fee,
      totalCost,
      refId,
      direction: body.direction,
      serverOutcome,
      createdAt: Date.now(),
      serverSeed,
      seedHash,
      clientSeed,
      nonce,
    };
    await redis.set(`prediction:lock:${refId}`, JSON.stringify(lockData), 'EX', 120);

    // Return chart direction (don't reveal outcome yet)
    const chartDirection: 'up' | 'down' | 'sideways' = serverOutcome === 'win'
      ? body.direction
      : (['up', 'down', 'sideways'] as const).filter(d => d !== body.direction)[Math.floor(Math.random() * 2)];

    auditLog({ action: 'prediction_lock', requestId: request.id, userId, game: 'predictions', betAmount: body.betAmount, fee, status: 'success', meta: { direction: body.direction, lockRef: refId, seedHash } });
    return { success: true, lockRef: refId, fee, chartDirection, seedHash };
  });

  // Step 2: Settle prediction after game resolves (uses pre-locked funds)
  server.post('/save', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const userId = getAuthUser(request).userId;

    const ALLOWED_MULTIPLIERS: Record<string, number> = { up: 1.92, down: 1.92, sideways: 3.18 };

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
    auditLog({ action: 'prediction_settle', requestId: request.id, userId, game: 'predictions', betAmount: lock.betAmount, fee: lock.fee, payoutAmount: actualPayout, multiplier: safeMultiplier, outcome: serverResult, status: 'success', meta: { lockRef: lock.refId, direction: lock.direction } });
    // Outlier check (non-blocking)
    checkPayoutOutlier({ game: 'predictions', userId, gameId: lock.refId, betAmount: lock.betAmount, payoutAmount: actualPayout, multiplier: safeMultiplier, requestId: request.id }).catch(() => {});

    // Save prediction record to DB (with provably fair data)
    const [saved] = await db.insert(predictionRounds).values({
      userId,
      direction: lock.direction,
      betAmount: lock.betAmount,
      result: serverResult,
      payout: actualPayout,
      multiplier: String(safeMultiplier),
      pattern: body.pattern ?? null,
      serverSeed: lock.serverSeed,
      seedHash: lock.seedHash,
      clientSeed: lock.clientSeed,
      nonce: lock.nonce,
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

    // Award XP + track missions
    const xpGained = serverResult === 'win' ? 25 : 15;
    try {
      await userService.addXP(userId, xpGained, 'prediction');
    } catch (err) {
      request.log.warn({ err, userId, xpGained }, 'Failed to award prediction XP');
    }
    try {
      const { MissionsService } = await import('../modules/missions/missions.service.js');
      await new MissionsService().trackProgress(userId, 'prediction_result', serverResult === 'win');
    } catch {}


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

  // Get prediction history (per user)
  server.get('/history', async (request) => {
    const userId = getAuthUser(request).userId;
    const { limit } = request.query as { limit?: string };
    const parsedLimit = Math.min(Math.max(parseInt(limit || '20', 10) || 20, 1), 100);

    const data = await db.select().from(predictionRounds)
      .where(eq(predictionRounds.userId, userId))
      .orderBy(desc(predictionRounds.createdAt))
      .limit(parsedLimit);

    return { data };
  });

}

// Public route (no auth) - registered separately
export async function predictionPublicRoutes(server: FastifyInstance) {
  const db = getDb();

  server.get('/recent', async (request) => {
    const { limit } = request.query as { limit?: string };
    const parsedLimit = Math.min(Math.max(parseInt(limit || '20', 10) || 20, 1), 100);

    const data = await db.select({
      id: predictionRounds.id,
      username: users.username,
      direction: predictionRounds.direction,
      betAmount: predictionRounds.betAmount,
      result: predictionRounds.result,
      payout: predictionRounds.payout,
      multiplier: predictionRounds.multiplier,
      createdAt: predictionRounds.createdAt,
    })
      .from(predictionRounds)
      .innerJoin(users, eq(predictionRounds.userId, users.id))
      .orderBy(desc(predictionRounds.createdAt))
      .limit(parsedLimit);

    return { data };
  });
}
