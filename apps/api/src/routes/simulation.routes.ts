import type { FastifyInstance } from 'fastify';
import { requireAdmin, requireRole, getAuthUser } from '../middleware/auth.js';
import { SimulationService } from '../modules/simulation/simulation.service.js';
import { z } from 'zod';

export async function simulationRoutes(server: FastifyInstance) {
  // All simulation routes require superadmin
  server.addHook('preHandler', requireAdmin);

  server.post('/start', { preHandler: [requireRole('superadmin')] }, async (request) => {
    const body = z.object({
      botCount: z.number().int().min(1).max(100).default(20),
      gamesPerMinute: z.number().int().min(1).max(100).default(10),
      durationMinutes: z.number().int().min(1).max(1440).default(60),
    }).parse(request.body);

    const result = await SimulationService.start(body);
    return { data: result };
  });

  server.post('/stop', { preHandler: [requireRole('superadmin')] }, async () => {
    const result = SimulationService.stop();
    return { data: result };
  });

  server.get('/status', async () => {
    const status = SimulationService.getStatus();
    return { data: status };
  });

  server.post('/cleanup', { preHandler: [requireRole('superadmin')] }, async (request) => {
    const body = z.object({
      confirmation: z.literal('CLEANUP_BOTS'),
    }).parse(request.body);

    const result = await SimulationService.cleanup();
    return { data: result };
  });
}
