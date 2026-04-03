import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, getAuthUser } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { requireNotExcluded } from '../middleware/selfExclusion.js';
import { RugGameService } from '../modules/rug-game/rugGame.service.js';
import { getCurrentRound, joinRound, cashOut as roundCashOut, getRecentRounds } from '../modules/round-manager/rugRoundManager.js';
import { requireGameEnabled } from '../utils/gameGates.js';
import { auditLog } from '../utils/auditLog.js';
import { validateBetLimits } from '../utils/betLimits.js';
import { recordOpsAlert } from '../utils/opsAlert.js';
import { checkPayoutOutlier } from '../utils/payoutMonitor.js';

export async function rugGameRoutes(server: FastifyInstance) {
  const service = new RugGameService();

  // Get current round state (public, no auth)
  server.get('/round', async () => {
    const round = await getCurrentRound();
    if (!round) return { round: null };
    return { round };
  });

  server.get('/rounds/recent', async (request) => {
    const { limit } = request.query as { limit?: string };
    const parsedLimit = Math.min(Math.max(parseInt(limit || '20', 10) || 20, 1), 100);
    const rounds = await getRecentRounds(parsedLimit);
    return { rounds };
  });

  // Join current round
  server.post('/join', { preHandler: [requireAuth, requireNotExcluded] }, async (request, reply) => {
    const reqId = request.id;
    try {
      await requireGameEnabled('rug-game');
    } catch (err) {
      await recordOpsAlert({ severity: 'warning', category: 'disabled_game_attempt', message: 'Rug Game join attempted while disabled', userId: getAuthUser(request).userId, game: 'rug-game', requestId: reqId });
      throw err;
    }
    const userId = getAuthUser(request).userId;
    const body = z.object({
      betAmount: z.number().int().positive().min(1_000_000),
    }).parse(request.body);

    try {
      await validateBetLimits(userId, body.betAmount);
    } catch (err: any) {
      await recordOpsAlert({ severity: 'warning', category: err?.code === 'EXPOSURE_LIMIT' ? 'exposure_limit_violation' : 'bet_cap_violation', message: err.message, userId, game: 'rug-game', requestId: reqId, metadata: { betAmount: body.betAmount } });
      throw err;
    }

    const result = await joinRound(userId, body.betAmount);
    if (!result.success) {
      auditLog({ action: 'rug_join', requestId: reqId, userId, game: 'rug-game', betAmount: body.betAmount, status: 'failed', error: result.message });
      throw new AppError(400, 'JOIN_FAILED', result.message || 'Cannot join round');
    }
    auditLog({ action: 'rug_join', requestId: reqId, userId, game: 'rug-game', betAmount: body.betAmount, status: 'success' });
    reply.header('X-Request-Id', reqId);
    return result;
  });

  // Cash out
  server.post('/round-cashout', { preHandler: requireAuth }, async (request, reply) => {
    const reqId = request.id;
    const userId = getAuthUser(request).userId;
    const result = await roundCashOut(userId);
    if (!result.success) {
      auditLog({ action: 'rug_cashout', requestId: reqId, userId, game: 'rug-game', status: 'failed', error: result.message });
      throw new AppError(400, 'CASHOUT_FAILED', result.message || 'Cannot cash out');
    }
    auditLog({ action: 'rug_cashout', requestId: reqId, userId, game: 'rug-game', multiplier: result.multiplier, payoutAmount: result.payout, status: 'success' });
    // Outlier check (non-blocking)
    checkPayoutOutlier({ game: 'rug-game', userId, gameId: 'round', betAmount: 0, payoutAmount: result.payout || 0, multiplier: result.multiplier, requestId: reqId }).catch(() => {});
    reply.header('X-Request-Id', reqId);
    return result;
  });

  // Legacy routes (kept for compatibility)
  server.post('/start', { preHandler: requireAuth }, async (request, reply) => {
    const user = getAuthUser(request);
    const body = z.object({ betAmount: z.number().int().positive() }).parse(request.body);
    try {
      const game = await service.startGame(user.userId, body.betAmount);
      return { success: true, game };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  server.post('/cashout', { preHandler: requireAuth }, async (request, reply) => {
    const user = getAuthUser(request);
    const body = z.object({ gameId: z.string().uuid(), multiplier: z.number().min(1.0) }).parse(request.body);
    try {
      const game = await service.cashOut(user.userId, body.gameId, body.multiplier);
      return { success: true, game };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

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

  server.get('/live', async (request) => {
    const { limit } = request.query as { limit?: string };
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 10, 1), 20) : 10;
    return { games: await service.getLiveGames(parsedLimit) };
  });

  server.get('/recent', async (request) => {
    const { limit } = request.query as { limit?: string };
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50) : 20;
    return { games: await service.getRecentPublicGames(parsedLimit) };
  });

  server.get('/game/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return { game: await service.getGame(id) };
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  server.get('/active', { preHandler: requireAuth }, async (request) => {
    const user = getAuthUser(request);
    const game = await service.getActiveGame(user.userId);
    return { game };
  });

  server.get('/history', { preHandler: requireAuth }, async (request) => {
    const user = getAuthUser(request);
    const { limit } = request.query as { limit?: string };
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50) : 20;
    return { games: await service.getUserHistory(user.userId, parsedLimit) };
  });
}
