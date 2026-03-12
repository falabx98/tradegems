import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { predictionRounds } from '@tradingarena/db';
import { getDb } from '../config/database.js';
import { requireAuth, getAuthUser } from '../middleware/auth.js';
import { WalletService } from '../modules/wallet/wallet.service.js';
import { env } from '../config/env.js';

export async function predictionRoutes(server: FastifyInstance) {
  const db = getDb();
  const walletService = new WalletService();

  server.addHook('preHandler', requireAuth);

  // Save a prediction round result (with wallet integration)
  server.post('/save', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const userId = getAuthUser(request).userId;

    const body = z.object({
      direction: z.enum(['up', 'down', 'sideways']),
      betAmount: z.number().int().positive(),
      result: z.enum(['win', 'loss']),
      payout: z.number().int().min(0),
      multiplier: z.number().min(0).max(10),
      pattern: z.string().optional(),
    }).parse(request.body);

    // Calculate fee using the platform fee rate (same as bet.service / battle routes)
    const feeRate = env.PLATFORM_FEE_RATE;
    const fee = Math.floor(body.betAmount * feeRate);
    const totalCost = body.betAmount + fee;

    // Unique reference for ledger entries
    const ref = { type: 'prediction', id: nanoid() };

    // 1. Lock funds (bet amount + fee) from user's available balance
    await walletService.lockFunds(userId, totalCost, 'SOL', ref);

    // 2. Calculate actual payout based on result
    const actualPayout = body.result === 'win'
      ? Math.floor(body.betAmount * body.multiplier)
      : 0;

    // 3. Settle: unlock locked funds and credit payout
    await walletService.settlePayout(userId, body.betAmount, fee, actualPayout, 'SOL', ref);

    // 4. Save prediction record to DB
    const [saved] = await db.insert(predictionRounds).values({
      userId,
      direction: body.direction,
      betAmount: body.betAmount,
      result: body.result,
      payout: actualPayout,
      multiplier: String(body.multiplier),
      pattern: body.pattern ?? null,
      metadata: { savedAt: Date.now(), fee, ref: ref.id },
    }).returning();

    return { success: true, id: saved.id, payout: actualPayout };
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
