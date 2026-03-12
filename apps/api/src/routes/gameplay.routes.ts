import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { BetService } from '../modules/bet/bet.service.js';
import { RoundService } from '../modules/round/round.service.js';
import { requireAuth, requireAdmin, getAuthUser } from '../middleware/auth.js';

const placeBetSchema = z.object({
  amount: z.number().int().positive().min(1_000_000).max(10_000_000_000), // 0.001 SOL to 10 SOL in lamports
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

  // ─── Authenticated ───────────────────────────────────────

  server.get('/:id', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    return roundService.getRound(id);
  });

  server.get('/:id/result', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    return roundService.getRoundResult(id, getAuthUser(request).userId);
  });

  server.post('/:id/bet', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = placeBetSchema.parse(request.body);

    const result = await betService.placeBet({
      userId: getAuthUser(request).userId,
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

  server.get('/history', { preHandler: [requireAuth] }, async (request) => {
    const { limit } = request.query as { limit?: string };
    const results = await roundService.getUserHistory(
      getAuthUser(request).userId,
      limit ? parseInt(limit) : 20,
    );
    return { data: results };
  });

  // ─── Solo round lifecycle (any authenticated user) ──────
  server.post('/solo/start', { preHandler: [requireAuth], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
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
      return { error: 'NO_BET', message: 'You have no bet on this round' };
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
