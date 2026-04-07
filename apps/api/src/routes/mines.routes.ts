import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, getAuthUser } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { MinesService } from '../modules/mines/mines.service.js';
import { requireGameEnabled } from '../utils/gameGates.js';
import { auditLog } from '../utils/auditLog.js';
import { validateBetLimits, validateGameBetLimits } from '../utils/betLimits.js';
import { recordOpsAlert } from '../utils/opsAlert.js';
import { VALID_MINE_COUNTS } from '../modules/mines/mines.types.js';
import { getMultiplier, getNextMultiplier } from '../modules/mines/mines.math.js';
import { requireNotExcluded } from '../middleware/selfExclusion.js';
import { env } from '../config/env.js';

export async function minesRoutes(server: FastifyInstance) {
  const service = new MinesService();

  // ─── Start Game (authenticated + not self-excluded) ─────

  server.post('/start', { preHandler: [requireAuth, requireNotExcluded] }, async (request, reply) => {
    const reqId = request.id;
    try {
      await requireGameEnabled('mines');
    } catch (err) {
      await recordOpsAlert({
        severity: 'warning',
        category: 'disabled_game_attempt',
        message: 'Mines start attempted while disabled',
        userId: getAuthUser(request).userId,
        game: 'mines',
        requestId: reqId,
      });
      throw err;
    }

    const userId = getAuthUser(request).userId;
    const body = z.object({
      betAmount: z.number().int().positive().min(1_000_000).max(env.MINES_MAX_BET_LAMPORTS),
      mineCount: z.number().int().refine(
        (v) => (VALID_MINE_COUNTS as readonly number[]).includes(v),
        { message: `Mine count must be one of: ${VALID_MINE_COUNTS.join(', ')}` },
      ),
    }).parse(request.body);

    // Game-specific bet + payout validation
    validateGameBetLimits('mines', userId, body.betAmount);

    try {
      await validateBetLimits(userId, body.betAmount);
    } catch (err: any) {
      await recordOpsAlert({
        severity: 'warning',
        category: err?.code === 'EXPOSURE_LIMIT' ? 'exposure_limit_violation' : 'bet_cap_violation',
        message: err.message,
        userId,
        game: 'mines',
        requestId: reqId,
        metadata: { betAmount: body.betAmount },
      });
      throw err;
    }

    const game = await service.startGame(userId, body.betAmount, body.mineCount);
    reply.header('X-Request-Id', reqId);
    return { success: true, game };
  });

  // ─── Reveal Tile (authenticated) ────────────────────────

  server.post('/reveal', { preHandler: requireAuth }, async (request, reply) => {
    const reqId = request.id;
    const userId = getAuthUser(request).userId;
    const body = z.object({
      gameId: z.string().uuid(),
      x: z.number().int().min(0).max(4),
      y: z.number().int().min(0).max(4),
    }).parse(request.body);

    const result = await service.revealTile(userId, body.gameId, body.x, body.y);
    reply.header('X-Request-Id', reqId);
    return { success: true, result };
  });

  // ─── Cash Out (authenticated) ───────────────────────────

  server.post('/cashout', { preHandler: requireAuth }, async (request, reply) => {
    const reqId = request.id;
    const userId = getAuthUser(request).userId;
    const body = z.object({
      gameId: z.string().uuid(),
    }).parse(request.body);

    const result = await service.cashOut(userId, body.gameId);
    reply.header('X-Request-Id', reqId);
    return { success: true, result };
  });

  // ─── Get Active Game (authenticated) ────────────────────

  server.get('/active', { preHandler: requireAuth }, async (request) => {
    const userId = getAuthUser(request).userId;
    const game = await service.getActiveGame(userId);
    return { game };
  });

  // ─── Game History (authenticated) ───────────────────────

  server.get('/history', { preHandler: requireAuth }, async (request) => {
    const userId = getAuthUser(request).userId;
    const { limit } = request.query as { limit?: string };
    const parsedLimit = Math.min(Math.max(parseInt(limit || '20', 10) || 20, 1), 100);
    const games = await service.getHistory(userId, parsedLimit);
    return { games };
  });

  // ─── Fairness Verification (public) ─────────────────────

  server.get('/verify/:gameId', async (request) => {
    const { gameId } = request.params as { gameId: string };
    if (!gameId || !/^[0-9a-f-]{36}$/i.test(gameId)) {
      throw new AppError(400, 'INVALID_GAME_ID', 'Invalid game ID format');
    }
    const game = await service.getGameForVerification(gameId);
    if (!game) {
      throw new AppError(404, 'GAME_NOT_FOUND', 'Game not found or still in progress');
    }
    return { game };
  });

  // ─── Multiplier Table (public) ──────────────────────────
  // Returns pre-computed multiplier tables for the UI

  server.get('/multipliers', async () => {
    const tables: Record<number, { picks: number; multiplier: number; nextMultiplier: number }[]> = {};
    for (const mines of VALID_MINE_COUNTS) {
      const safeTiles = 25 - mines;
      const rows: { picks: number; multiplier: number; nextMultiplier: number }[] = [];
      for (let k = 1; k <= safeTiles; k++) {
        rows.push({
          picks: k,
          multiplier: getMultiplier(k, mines),
          nextMultiplier: k < safeTiles ? getNextMultiplier(k, mines) : 0,
        });
      }
      tables[mines] = rows;
    }
    return { tables };
  });
}
