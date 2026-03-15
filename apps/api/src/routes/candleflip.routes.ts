import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, getAuthUser } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { CandleflipService } from '../modules/candleflip/candleflip.service.js';
import { getCandleflipCurrentRound, betOnRound, getRecentCandleflipRounds } from '../modules/round-manager/candleflipRoundManager.js';

export async function candleflipRoutes(server: FastifyInstance) {
  const service = new CandleflipService();

  // ── Public Round Routes ──────────────────────────────────────

  server.get('/round', async () => {
    const round = await getCandleflipCurrentRound();
    return { round };
  });

  server.get('/rounds/recent', async (request) => {
    const { limit } = request.query as { limit?: string };
    const parsedLimit = Math.min(Math.max(parseInt(limit || '20', 10) || 20, 1), 100);
    const rounds = await getRecentCandleflipRounds(parsedLimit);
    return { rounds };
  });

  server.post('/bet', { preHandler: requireAuth }, async (request) => {
    const userId = getAuthUser(request).userId;
    const body = z.object({
      pick: z.enum(['bullish', 'bearish']),
      betAmount: z.number().int().positive().min(1_000_000),
    }).parse(request.body);

    const result = await betOnRound(userId, body.pick, body.betAmount);
    if (!result.success) {
      throw new AppError(400, 'BET_FAILED', result.message || 'Cannot place bet');
    }
    return result;
  });

  // GET /lobbies — open lobbies (public)
  server.get('/lobbies', async () => {
    return { lobbies: await service.getOpenLobbies() };
  });

  // GET /recent — recent results (public)
  server.get('/recent', async (request) => {
    const { limit } = request.query as { limit?: string };
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50) : 20;
    return { results: await service.getRecentResults(parsedLimit) };
  });

  // GET /game/:id — single game (public)
  server.get('/game/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return { game: await service.getGame(id) };
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  // POST /create — create lobby (auth)
  server.post('/create', { preHandler: requireAuth }, async (request, reply) => {
    const user = getAuthUser(request);
    const body = z.object({
      betAmount: z.number().int().positive(),
      pick: z.enum(['bullish', 'bearish']),
    }).parse(request.body);
    try {
      const game = await service.createGame(user.userId, body.betAmount, body.pick);
      return { success: true, game };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /join — join & resolve (auth)
  server.post('/join', { preHandler: requireAuth }, async (request, reply) => {
    const user = getAuthUser(request);
    const body = z.object({ gameId: z.string().uuid() }).parse(request.body);
    try {
      const game = await service.joinGame(user.userId, body.gameId);
      return { success: true, game };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /cancel — cancel own open lobby (auth)
  server.post('/cancel', { preHandler: requireAuth }, async (request, reply) => {
    const user = getAuthUser(request);
    const body = z.object({ gameId: z.string().uuid() }).parse(request.body);
    try {
      return await service.cancelGame(user.userId, body.gameId);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // GET /history — user's game history (auth)
  server.get('/history', { preHandler: requireAuth }, async (request) => {
    const user = getAuthUser(request);
    const { limit } = request.query as { limit?: string };
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50) : 20;
    return { games: await service.getUserHistory(user.userId, parsedLimit) };
  });
}
