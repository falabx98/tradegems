import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, getAuthUser } from '../middleware/auth.js';
import { LotteryService } from '../modules/lottery/lottery.service.js';
import { AppError } from '../middleware/errorHandler.js';

// ─── Validation Schemas ──────────────────────────────────────

const ticketSchema = z.object({
  entryType: z.enum(['standard', 'power']),
  numbers: z.array(z.number().int().min(1).max(36)).length(5),
  gemBall: z.number().int().min(1).max(9),
});

const buySchema = z.object({
  drawId: z.string().uuid(),
  tickets: z.array(ticketSchema).min(1).max(50),
});

const autoFillSchema = z.object({
  count: z.number().int().min(1).max(50).default(1),
});

// ─── Routes ──────────────────────────────────────────────────

export async function lotteryRoutes(server: FastifyInstance) {
  // Seed initial draw on registration
  await LotteryService.ensureCurrentDrawExists();

  // ─── GET /current — current open draw (public) ─────────────
  server.get('/current', async () => {
    return LotteryService.getCurrentDraw();
  });

  // ─── GET /draw/:id — specific draw (public) ────────────────
  server.get('/draw/:id', async (request) => {
    const { id } = request.params as { id: string };
    return LotteryService.getDrawById(id);
  });

  // ─── GET /draw/number/:num — draw by number (public) ───────
  server.get('/draw/number/:num', async (request) => {
    const { num } = request.params as { num: string };
    const parsed = parseInt(num, 10);
    if (isNaN(parsed) || parsed < 1) {
      throw new AppError(400, 'INVALID_DRAW_NUMBER', 'Invalid draw number');
    }
    return LotteryService.getDrawByNumber(parsed);
  });

  // ─── GET /history — past completed draws (public) ──────────
  server.get('/history', async (request) => {
    const { limit } = request.query as { limit?: string };
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100) : 20;
    return LotteryService.getDrawHistory(parsedLimit);
  });

  // ─── GET /prizes/:drawId — prize table for a draw (public) ─
  server.get('/prizes/:drawId', async (request) => {
    const { drawId } = request.params as { drawId: string };
    return LotteryService.getPrizeTable(drawId);
  });

  // ─── POST /buy — purchase tickets (auth required) ──────────
  server.post('/buy', { preHandler: requireAuth }, async (request) => {
    const { drawId, tickets } = buySchema.parse(request.body);
    const userId = getAuthUser(request).userId;
    return LotteryService.buyTickets(userId, drawId, tickets);
  });

  // ─── GET /my-tickets — user's tickets for current draw (auth) ─
  server.get('/my-tickets', { preHandler: requireAuth }, async (request) => {
    const userId = getAuthUser(request).userId;
    const currentDraw = await LotteryService.getCurrentDraw();
    return LotteryService.getUserTickets(userId, currentDraw.id);
  });

  // ─── GET /my-tickets/:drawId — user's tickets for specific draw (auth) ─
  server.get('/my-tickets/:drawId', { preHandler: requireAuth }, async (request) => {
    const { drawId } = request.params as { drawId: string };
    const userId = getAuthUser(request).userId;
    return LotteryService.getUserTickets(userId, drawId);
  });

  // ─── POST /auto-fill — generate random number sets (public) ─
  server.post('/auto-fill', async (request) => {
    const { count } = autoFillSchema.parse(request.body);
    return LotteryService.autoFillNumbers(count);
  });
}
