import type { FastifyInstance } from 'fastify';
import { requireAuth, getAuthUser } from '../middleware/auth.js';
import { ReturnHooksService } from '../modules/retention/returnHooks.service.js';

export async function returnHooksRoutes(server: FastifyInstance) {
  const service = new ReturnHooksService();

  server.addHook('preHandler', requireAuth);

  // Get active return hooks for the current user
  server.get('/active', async (request) => {
    const { userId } = getAuthUser(request);
    const hooks = await service.getReturnHooks(userId);
    return { hooks };
  });

  // Get streak info
  server.get('/streak', async (request) => {
    const { userId } = getAuthUser(request);
    const { getDb } = await import('../config/database.js');
    const { userProfiles } = await import('@tradingarena/db');
    const { eq } = await import('drizzle-orm');
    const db = getDb();
    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
    });
    return {
      dailyStreak: profile?.dailyStreak ?? 0,
      longestStreak: profile?.longestDailyStreak ?? 0,
      lastPlayedDate: profile?.lastPlayedDate ?? null,
    };
  });
}
