import type { FastifyInstance } from 'fastify';
import { desc, eq, sql } from 'drizzle-orm';
import { rounds, bets, betResults, users, featureFlags, engineConfigs, adminAuditLogs } from '@tradingarena/db';
import { getDb } from '../config/database.js';
import { requireAdmin, getAuthUser } from '../middleware/auth.js';

export async function adminRoutes(server: FastifyInstance) {
  const db = getDb();

  server.addHook('preHandler', requireAdmin);

  // ─── Dashboard ───────────────────────────────────────────

  server.get('/dashboard/stats', async () => {
    const [roundCount] = await db.execute(sql`
      SELECT COUNT(*) as total FROM rounds WHERE created_at > now() - interval '24 hours'
    `) as unknown as { total: number }[];

    const [betVolume] = await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0) as total FROM bets WHERE created_at > now() - interval '24 hours'
    `) as unknown as { total: number }[];

    const [userCount] = await db.execute(sql`
      SELECT COUNT(*) as total FROM users WHERE status = 'active'
    `) as unknown as { total: number }[];

    return {
      roundsToday: Number(roundCount?.total ?? 0),
      betVolumeToday: Number(betVolume?.total ?? 0),
      activeUsers: Number(userCount?.total ?? 0),
    };
  });

  // ─── Rounds ──────────────────────────────────────────────

  server.get('/rounds', async (request) => {
    const { limit } = request.query as { limit?: string };
    const data = await db.query.rounds.findMany({
      orderBy: [desc(rounds.createdAt)],
      limit: parseInt(limit || '50'),
    });
    return { data };
  });

  // ─── Engine Config ───────────────────────────────────────

  server.get('/engine-config', async () => {
    const active = await db.query.engineConfigs.findFirst({
      where: eq(engineConfigs.isActive, true),
    });
    return active ?? { message: 'No active config, using defaults' };
  });

  // ─── Users ───────────────────────────────────────────────

  server.get('/users', async (request) => {
    const { limit, search } = request.query as { limit?: string; search?: string };
    const data = await db.query.users.findMany({
      orderBy: [desc(users.createdAt)],
      limit: parseInt(limit || '50'),
    });
    return { data };
  });

  // ─── Feature Flags ───────────────────────────────────────

  server.get('/feature-flags', async () => {
    return db.query.featureFlags.findMany();
  });

  server.patch('/feature-flags/:key', async (request) => {
    const { key } = request.params as { key: string };
    const { enabled, config } = request.body as { enabled?: boolean; config?: unknown };

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (enabled !== undefined) update.enabled = enabled;
    if (config !== undefined) update.config = config;

    await db.update(featureFlags)
      .set(update)
      .where(eq(featureFlags.flagKey, key));

    // Audit log
    const user = getAuthUser(request);
    await db.insert(adminAuditLogs).values({
      actorUserId: user.userId,
      actionType: 'feature_flag_toggle',
      targetType: 'feature_flag',
      targetId: key,
      payload: { enabled, config },
      ipAddress: request.ip,
    });

    return { success: true };
  });

  // ─── Audit Logs ──────────────────────────────────────────

  server.get('/audit-logs', async (request) => {
    const { limit } = request.query as { limit?: string };
    return db.query.adminAuditLogs.findMany({
      orderBy: [desc(adminAuditLogs.createdAt)],
      limit: parseInt(limit || '50'),
    });
  });
}
