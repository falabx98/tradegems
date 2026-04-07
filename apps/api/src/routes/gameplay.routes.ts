import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { betResults, bets, users } from '@tradingarena/db';
import { getDb } from '../config/database.js';
import { BetService } from '../modules/bet/bet.service.js';
import { RoundService } from '../modules/round/round.service.js';
import { requireAuth, requireAdmin, getAuthUser } from '../middleware/auth.js';
import { requireNotExcluded } from '../middleware/selfExclusion.js';
import { AppError } from '../middleware/errorHandler.js';
import { requireGameEnabled } from '../utils/gameGates.js';
import { validateBetLimits, validateGameBetLimits } from '../utils/betLimits.js';
import { env } from '../config/env.js';

// Note: env is already imported below — placeBetSchema is created inside the route handler
// to access env.SOLO_MAX_BET_LAMPORTS at runtime
const placeBetSchemaBase = z.object({
  amount: z.number().int().positive().min(1_000_000),
  riskTier: z.enum(['conservative', 'balanced', 'aggressive']),
  idempotencyKey: z.string().min(1).max(128),
});

export async function gameplayRoutes(server: FastifyInstance) {
  const betService = new BetService();
  const roundService = new RoundService();

  // ─── Public ──────────────────────────────────────────────

  server.get('/lobby', async () => {
    const nextRound = await roundService.getNextRound();
    return {
      nextRound: nextRound ? {
        id: nextRound.id,
        mode: nextRound.mode,
        status: nextRound.status,
        scheduledAt: nextRound.scheduledAt.toISOString(),
        playerCount: nextRound.playerCount,
      } : null,
    };
  });

  server.get('/next', async () => {
    const round = await roundService.getNextRound();
    return round ?? { message: 'No rounds available' };
  });

  // Global recent solo games (public, all users)
  server.get('/recent', async (request) => {
    const { limit } = request.query as { limit?: string };
    const parsedLimit = Math.min(Math.max(parseInt(limit || '20', 10) || 20, 1), 100);
    const db = getDb();
    const results = await db.select({
      id: betResults.id,
      username: users.username,
      finalMultiplier: betResults.finalMultiplier,
      amount: bets.amount,
      payoutAmount: betResults.payoutAmount,
      resultType: betResults.resultType,
      createdAt: betResults.createdAt,
    })
      .from(betResults)
      .innerJoin(users, eq(betResults.userId, users.id))
      .innerJoin(bets, eq(betResults.betId, bets.id))
      .orderBy(desc(betResults.createdAt))
      .limit(parsedLimit);
    return { data: results };
  });

  server.get('/history', { preHandler: [requireAuth] }, async (request) => {
    const { limit } = request.query as { limit?: string };
    const results = await roundService.getUserHistory(
      getAuthUser(request).userId,
      limit ? parseInt(limit) : 20,
    );
    return { data: results };
  });

  // ─── Authenticated ───────────────────────────────────────

  server.get('/:id', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    return roundService.getRound(id);
  });

  server.get('/:id/result', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    return roundService.getRoundResult(id, getAuthUser(request).userId);
  });

  server.post('/:id/bet', { preHandler: [requireAuth, requireNotExcluded] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = placeBetSchemaBase.refine(b => b.amount <= env.SOLO_MAX_BET_LAMPORTS, {
      message: `Maximum bet is ${(env.SOLO_MAX_BET_LAMPORTS / 1e9).toFixed(2)} SOL during platform bootstrap phase.`,
      path: ['amount'],
    }).parse(request.body);

    const userId = getAuthUser(request).userId;

    // Game-specific bet validation
    validateGameBetLimits('solo', userId, body.amount);

    await validateBetLimits(userId, body.amount, Math.floor(body.amount * env.PLATFORM_FEE_RATE));
    const result = await betService.placeBet({
      userId,
      roundId: id,
      amount: body.amount,
      riskTier: body.riskTier,
      idempotencyKey: body.idempotencyKey,
    });

    return reply.status(201).send(result);
  });

  server.delete('/:id/bet', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    await betService.cancelBet(getAuthUser(request).userId, id);
    return { success: true };
  });

  // ─── Solo round lifecycle (any authenticated user) ──────
  server.post('/solo/start', { preHandler: [requireAuth, requireNotExcluded], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
    await requireGameEnabled('solo');
    const userId = getAuthUser(request).userId;
    const round = await roundService.scheduleRound('solo', 10000);
    await roundService.openEntry(round.id);
    return { id: round.id, status: round.status, scheduledAt: round.scheduledAt, userId };
  });

  server.post('/solo/resolve/:id', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    const userId = getAuthUser(request).userId;

    // Verify user has an active bet on this round
    const bets = await betService.getBetsForRound(id);
    const userBet = bets.find((b: any) => b.userId === userId);
    if (!userBet) {
      throw new AppError(400, 'NO_BET', 'You have no bet on this round');
    }

    await roundService.generateRoundPayload(id);
    await roundService.startRound(id);
    await roundService.freezeRound(id);
    await roundService.resolveRound(id);
    return { message: 'Round resolved', roundId: id };
  });

  // ─── Admin-only dev endpoints (kept for admin tools) ───
  server.post('/dev/schedule', { preHandler: [requireAdmin] }, async () => {
    const round = await roundService.scheduleRound('solo', 10000);
    await roundService.openEntry(round.id);
    return round;
  });

  server.post('/dev/resolve/:id', { preHandler: [requireAdmin] }, async (request) => {
    const { id } = request.params as { id: string };
    await roundService.generateRoundPayload(id);
    await roundService.startRound(id);
    await roundService.freezeRound(id);
    await roundService.resolveRound(id);
    return { message: 'Round resolved', roundId: id };
  });
}
