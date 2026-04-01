import type { FastifyInstance } from 'fastify';
import { requireAuth, getAuthUser } from '../middleware/auth.js';
import { MissionsService } from '../modules/missions/missions.service.js';

export async function missionsRoutes(server: FastifyInstance) {
  const missionsService = new MissionsService();

  // GET /daily — get today's missions with progress
  server.get('/daily', { preHandler: requireAuth }, async (request) => {
    const { userId } = getAuthUser(request);
    const missions = await missionsService.getDailyMissions(userId);
    return { missions };
  });

  // POST /claim/:missionId — claim reward for completed mission
  server.post('/claim/:missionId', { preHandler: requireAuth }, async (request) => {
    const { userId } = getAuthUser(request);
    const { missionId } = request.params as { missionId: string };
    const result = await missionsService.claimMission(userId, missionId);
    return { success: true, ...result };
  });
}
