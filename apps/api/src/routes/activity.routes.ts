import type { FastifyInstance } from 'fastify';
import { desc, gt } from 'drizzle-orm';
import { getDb } from '../config/database.js';
import { activityFeedItems } from '@tradingarena/db';

export async function activityRoutes(server: FastifyInstance) {
  const db = getDb();

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
}
