import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, getAuthUser } from '../middleware/auth.js';
import { RugGameService } from '../modules/rug-game/rugGame.service.js';

export async function rugGameRoutes(server: FastifyInstance) {
  const service = new RugGameService();

  // POST /start — start a new rug game (auth)
  server.post('/start', { preHandler: requireAuth }, async (request, reply) => {
    const user = getAuthUser(request);
    const body = z.object({
      betAmount: z.number().int().positive(),
    }).parse(request.body);
    try {
      const game = await service.startGame(user.userId, body.betAmount);
      return { success: true, game };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /cashout — cash out at current multiplier (auth)
  server.post('/cashout', { preHandler: requireAuth }, async (request, reply) => {
    const user = getAuthUser(request);
    const body = z.object({
      gameId: z.string().uuid(),
      multiplier: z.number().min(1.0),
    }).parse(request.body);
    try {
      const game = await service.cashOut(user.userId, body.gameId, body.multiplier);
      return { success: true, game };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /rug — report that chart rugged (auth)
  server.post('/rug', { preHandler: requireAuth }, async (request, reply) => {
    const user = getAuthUser(request);
    const body = z.object({ gameId: z.string().uuid() }).parse(request.body);
    try {
      const game = await service.rug(user.userId, body.gameId);
      return { success: true, game };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // GET /live — active games (live rounds visible to spectators)
  server.get('/live', async (request) => {
    const { limit } = request.query as { limit?: string };
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 10, 1), 20) : 10;
    return { games: await service.getLiveGames(parsedLimit) };
  });

  // GET /recent — recent public results (public)
  server.get('/recent', async (request) => {
    const { limit } = request.query as { limit?: string };
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50) : 20;
    return { games: await service.getRecentPublicGames(parsedLimit) };
  });

  // GET /game/:id — get game state (public)
  server.get('/game/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return { game: await service.getGame(id) };
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  // GET /active — get user's active game (auth)
  server.get('/active', { preHandler: requireAuth }, async (request) => {
    const user = getAuthUser(request);
    const game = await service.getActiveGame(user.userId);
    return { game };
  });

  // GET /history — user's game history (auth)
  server.get('/history', { preHandler: requireAuth }, async (request) => {
    const user = getAuthUser(request);
    const { limit } = request.query as { limit?: string };
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50) : 20;
    return { games: await service.getUserHistory(user.userId, parsedLimit) };
  });
}
