import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireAdmin, requireRole, getAuthUser } from '../middleware/auth.js';
import { SponsoredService } from '../modules/sponsored/sponsored.service.js';

export async function sponsoredRoutes(server: FastifyInstance) {

  // ─── User endpoint: check own sponsored status ─────────────
  server.get('/sponsored-status', { preHandler: requireAuth }, async (request) => {
    const userId = getAuthUser(request).userId;
    const status = await SponsoredService.getStatus(userId);
    return { data: status };
  });
}

export async function sponsoredAdminRoutes(server: FastifyInstance) {
  server.addHook('preHandler', requireAdmin);

  // Grant sponsored balance
  server.post('/sponsored-balance/grant', { preHandler: [requireRole('superadmin')] }, async (request) => {
    const body = z.object({
      userId: z.string().uuid(),
      amount: z.number().positive(), // in SOL
      profitSharePercentage: z.number().int().min(1).max(100).default(20),
      notes: z.string().optional(),
      expiresAt: z.string().datetime().optional(),
    }).parse(request.body);

    const actor = getAuthUser(request);
    const amountLamports = Math.floor(body.amount * 1e9);

    const sponsored = await SponsoredService.grant({
      userId: body.userId,
      amountLamports,
      profitSharePercentage: body.profitSharePercentage,
      grantedBy: actor.userId,
      notes: body.notes,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });

    return { data: sponsored };
  });

  // Get sponsored status for a user
  server.get('/sponsored-balance/:userId', async (request) => {
    const { userId } = request.params as { userId: string };
    const status = await SponsoredService.getStatus(userId);
    return { data: status };
  });

  // List all sponsored accounts
  server.get('/sponsored-balance', async () => {
    const all = await SponsoredService.listAll();
    return { data: all };
  });

  // Settle sponsorship
  server.post('/sponsored-balance/:userId/settle', { preHandler: [requireRole('superadmin')] }, async (request) => {
    const { userId } = request.params as { userId: string };
    const actor = getAuthUser(request);
    const result = await SponsoredService.settle(userId, actor.userId);
    return { data: result };
  });
}
