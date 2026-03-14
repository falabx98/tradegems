import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { UserService } from '../modules/user/user.service.js';
import { requireAuth, getAuthUser } from '../middleware/auth.js';

const updateProfileSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/).optional(),
  displayName: z.string().max(50).optional(),
  avatarUrl: z.string().max(200_000).optional(), // base64 data URL or http URL
});

export async function userRoutes(server: FastifyInstance) {
  const userService = new UserService();

  server.addHook('preHandler', requireAuth);

  server.get('/me', async (request) => {
    return userService.getProfile(getAuthUser(request).userId);
  });

  server.patch('/me', async (request) => {
    const body = updateProfileSchema.parse(request.body);
    return userService.updateProfile(getAuthUser(request).userId, body);
  });

  server.get('/me/stats', async (request) => {
    return userService.getStats(getAuthUser(request).userId);
  });

  server.get('/me/progression', async (request) => {
    return userService.getProgression(getAuthUser(request).userId);
  });

  server.get('/:id/profile', async (request) => {
    const { id } = request.params as { id: string };
    const profile = await userService.getProfile(id);

    // Get stats
    let stats: any = {};
    try {
      stats = await userService.getStats(id);
    } catch { /* New user, no stats */ }

    return {
      id: profile.id,
      username: profile.username,
      level: profile.level,
      vipTier: profile.vipTier,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      totalWagered: stats.totalWagered ?? 0,
      totalWon: stats.totalWon ?? 0,
      roundsPlayed: stats.roundsPlayed ?? 0,
      bestMultiplier: stats.bestMultiplier ?? '1.0',
      winRate: stats.winRate ?? '0.0',
      currentStreak: stats.currentStreak ?? 0,
      bestStreak: stats.bestStreak ?? 0,
    };
  });

  // Search users by username
  server.get('/search', async (request) => {
    const { q, limit } = request.query as { q?: string; limit?: string };
    if (!q || q.length < 2) return { data: [] };

    const { ilike } = await import('drizzle-orm');
    const { getDb } = await import('../config/database.js');
    const { users, userProfiles } = await import('@tradingarena/db');

    const db = getDb();
    // Escape LIKE special characters to prevent wildcard abuse
    const escapeLike = (s: string) => s.replace(/[%_\\]/g, '\\$&');
    const parsedLimit = Math.min(Math.max(parseInt(limit || '10') || 10, 1), 50);
    const results = await db
      .select({
        id: users.id,
        username: users.username,
        level: users.level,
        vipTier: users.vipTier,
        avatarUrl: userProfiles.avatarUrl,
        roundsPlayed: userProfiles.roundsPlayed,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(ilike(users.username, `%${escapeLike(q)}%`))
      .limit(parsedLimit);

    return { data: results };
  });
}
