import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UserService } from '../modules/user/user.service.js';
import { requireAuth, getAuthUser } from '../middleware/auth.js';

const updateProfileSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/).optional(),
  displayName: z.string().max(50).optional(),
  avatarUrl: z.string().url().optional(),
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
    return {
      id: profile.id,
      username: profile.username,
      level: profile.level,
      vipTier: profile.vipTier,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    };
  });
}
