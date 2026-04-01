import type { FastifyInstance } from 'fastify';
import { desc, gt, eq, and } from 'drizzle-orm';
import { getDb } from '../config/database.js';
import { activityFeedItems } from '@tradingarena/db';
import { getAuthUser, requireAuth } from '../middleware/auth.js';

export async function activityRoutes(server: FastifyInstance) {
  const db = getDb();

  // Public feed — all recent activity
  server.get('/feed', async (request) => {
    const { limit, after } = request.query as { limit?: string; after?: string };
    const maxLimit = Math.min(parseInt(limit || '20'), 50);

    let items;
    if (after) {
      items = await db
        .select()
        .from(activityFeedItems)
        .where(gt(activityFeedItems.id, parseInt(after)))
        .orderBy(desc(activityFeedItems.createdAt))
        .limit(maxLimit);
    } else {
      items = await db
        .select()
        .from(activityFeedItems)
        .orderBy(desc(activityFeedItems.createdAt))
        .limit(maxLimit);
    }

    return { data: items.reverse() };
  });

  // My Bets — authenticated user's own activity
  server.get('/feed/me', { preHandler: requireAuth }, async (request) => {
    const { userId } = getAuthUser(request);
    const { limit, game } = request.query as { limit?: string; game?: string };
    const maxLimit = Math.min(parseInt(limit || '30'), 100);

    const conditions = [eq(activityFeedItems.userId, userId)];
    if (game) {
      conditions.push(eq(activityFeedItems.feedType, game));
    }

    const items = await db
      .select()
      .from(activityFeedItems)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(activityFeedItems.createdAt))
      .limit(maxLimit);

    return { data: items };
  });
}
