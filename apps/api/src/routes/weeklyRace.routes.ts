import type { FastifyInstance } from 'fastify';
import { requireAuth, requireAdmin, getAuthUser, optionalAuth } from '../middleware/auth.js';
import { WeeklyRaceService } from '../modules/weekly-race/weeklyRace.service.js';
import { z } from 'zod';

export async function weeklyRaceRoutes(server: FastifyInstance) {

  // ─── Public Endpoints ──────────────────────────────────────

  /** GET /v1/races/current — active race + leaderboard */
  server.get('/current', async (request) => {
    const { limit } = request.query as { limit?: string };
    const race = await WeeklyRaceService.getCurrentRace(
      Math.min(parseInt(limit || '50'), 100),
    );
    if (!race) return { data: null, message: 'No active race' };
    return { data: race };
  });

  /** GET /v1/races/current/my-rank — user's rank in active race */
  server.get('/current/my-rank', { preHandler: requireAuth }, async (request) => {
    const { userId } = getAuthUser(request);
    const rank = await WeeklyRaceService.getMyRank(userId);
    return { data: rank };
  });

  /** GET /v1/races/history — last 4 completed races */
  server.get('/history', async (request) => {
    const { limit } = request.query as { limit?: string };
    const history = await WeeklyRaceService.getHistory(
      Math.min(parseInt(limit || '4'), 10),
    );
    return { data: history };
  });

  /** GET /v1/races/:id — specific race details */
  server.get('/:id', async (request) => {
    const { id } = request.params as { id: string };
    const race = await WeeklyRaceService.getRaceById(id);
    if (!race) return { error: 'Race not found' };
    return { data: race };
  });
}

export async function weeklyRaceAdminRoutes(server: FastifyInstance) {

  // ─── Admin Endpoints ───────────────────────────────────────

  /** GET /v1/admin/races — list all races */
  server.get('/races', { preHandler: requireAdmin }, async () => {
    const races = await WeeklyRaceService.listAllRaces();
    return { data: races };
  });

  /** PUT /v1/admin/races/config — update active race config */
  server.put('/races/config', { preHandler: requireAdmin }, async (request) => {
    const body = z.object({
      prizePoolLamports: z.number().optional(),
      prizeSource: z.enum(['fixed', 'percentage_of_volume']).optional(),
      volumePercentage: z.string().optional(),
    }).parse(request.body);

    const result = await WeeklyRaceService.updateConfig(body);
    return { data: result };
  });

  /** POST /v1/admin/races/force-create — create race manually */
  server.post('/races/force-create', { preHandler: requireAdmin }, async (request) => {
    const body = z.object({
      prizePoolLamports: z.number().optional(),
    }).safeParse(request.body);

    const prize = body.success ? body.data.prizePoolLamports : undefined;
    const race = await WeeklyRaceService.forceCreate(prize);
    return { data: race };
  });

  /** POST /v1/admin/races/:id/force-complete — complete race manually */
  server.post('/races/:id/force-complete', { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    await WeeklyRaceService.forceComplete(id);
    return { data: { completed: true, raceId: id } };
  });
}
