import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { predictionRounds } from '@tradingarena/db';
import { getDb } from '../config/database.js';
import { requireAuth, getAuthUser } from '../middleware/auth.js';

export async function predictionRoutes(server: FastifyInstance) {
  const db = getDb();

  server.addHook('preHandler', requireAuth);

  // Save a prediction round result
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

    const [saved] = await db.insert(predictionRounds).values({
      userId,
      direction: body.direction,
      betAmount: body.betAmount,
      result: body.result,
      payout: body.payout,
      multiplier: String(body.multiplier),
      pattern: body.pattern ?? null,
      metadata: { savedAt: Date.now() },
    }).returning();

    return { success: true, id: saved.id };
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
