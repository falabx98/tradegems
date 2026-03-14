import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, getAuthUser } from '../middleware/auth.js';
import { ReferralService } from '../modules/referral/referral.service.js';

export async function referralRoutes(server: FastifyInstance) {
  const referralService = new ReferralService();
  server.addHook('preHandler', requireAuth);

  // GET /code — Get or generate referral code
  server.get('/code', async (request) => {
    const userId = getAuthUser(request).userId;
    const code = await referralService.getOrCreateCode(userId);
    return { code };
  });

  // PATCH /code — Update referral code to a custom one
  server.patch('/code', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request) => {
    const userId = getAuthUser(request).userId;
    const body = z.object({
      code: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/, 'Code can only contain letters, numbers, hyphens and underscores'),
    }).parse(request.body);
    const result = await referralService.updateCode(userId, body.code.toUpperCase());
    return result;
  });

  // GET /stats — Get referral stats + referred users list
  server.get('/stats', async (request) => {
    const userId = getAuthUser(request).userId;
    const stats = await referralService.getStats(userId);
    const referredUsers = await referralService.getReferredUsers(userId);
    return { ...stats, referredUsers };
  });

  // POST /claim — Claim pending earnings
  server.post('/claim', async (request) => {
    const userId = getAuthUser(request).userId;
    const result = await referralService.claimEarnings(userId);
    if (result.claimed <= 0) {
      return { success: false, message: 'No earnings to claim' };
    }
    return { success: true, claimed: result.claimed };
  });
}
