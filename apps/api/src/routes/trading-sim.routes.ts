import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, getAuthUser } from '../middleware/auth.js';
import { TradingSimService } from '../modules/trading-sim/tradingSim.service.js';

export async function tradingSimRoutes(server: FastifyInstance) {
  const tradingSimService = new TradingSimService();

  // ─── List Available Rooms (no auth) ──────────────────────────

  server.get('/rooms', async () => {
    const rooms = await tradingSimService.getAvailableRooms();
    return { rooms };
  });

  // ─── Recent Finished Rooms (no auth) ───────────────────────

  server.get('/recent', async (request) => {
    const { limit } = request.query as { limit?: string };
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50) : 20;
    const rooms = await tradingSimService.getRecentFinished(parsedLimit);
    return { rooms };
  });

  // ─── Create Room (auth) ──────────────────────────────────────

  server.post('/create', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = getAuthUser(request);

    const body = z.object({
      entryFee: z.number().int().positive().max(10_000_000_000), // Max 10 SOL
      maxPlayers: z.number().int().min(2).max(8),
    }).parse(request.body);

    try {
      const room = await tradingSimService.createRoom(
        user.userId,
        body.entryFee,
        body.maxPlayers,
      );
      return { success: true, room };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── Join Room (auth) ────────────────────────────────────────

  server.post('/join', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = getAuthUser(request);

    const body = z.object({
      roomId: z.string().uuid(),
    }).parse(request.body);

    try {
      const room = await tradingSimService.joinRoom(user.userId, body.roomId);
      return { success: true, room };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── Execute Trade (auth) ───────────────────────────────────

  server.post('/trade', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = getAuthUser(request);

    const body = z.object({
      roomId: z.string().uuid(),
      tradeType: z.enum(['buy', 'sell']),
      quantity: z.number().int().positive(),
      price: z.number().positive(),
      timestamp: z.number().int().min(0),
    }).parse(request.body);

    try {
      const trade = await tradingSimService.executeTrade(
        user.userId,
        body.roomId,
        body.tradeType,
        body.quantity,
        body.price,
        body.timestamp,
      );
      return { success: true, trade };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── Start Room Now (auth — creator can start early) ────────

  server.post('/start', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = getAuthUser(request);
    const body = z.object({ roomId: z.string().uuid() }).parse(request.body);
    try {
      const room = await tradingSimService.startRoomByCreator(user.userId, body.roomId);
      return { success: true, room };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── Get Room State (no auth) ───────────────────────────────

  server.get('/room/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const roomState = await tradingSimService.getRoomState(id);
      return { room: roomState };
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });
}
