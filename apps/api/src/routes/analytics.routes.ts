import type { FastifyInstance } from 'fastify';
import { analyticsEvents } from '@tradingarena/db';
import { getDb } from '../config/database.js';
import { desc, eq, sql, gte, lte, and, count } from 'drizzle-orm';

/**
 * Analytics Routes — receives events from frontend, stores in DB.
 * No auth required for event ingestion (fire-and-forget from frontend).
 * Admin endpoints require auth.
 */
export async function analyticsRoutes(server: FastifyInstance) {
  const db = getDb();

  // ─── Event Ingestion (no auth — must be lightweight) ────────

  server.post('/events', async (request, reply) => {
    try {
      const body = request.body as any;
      const events = body?.events;

      if (!Array.isArray(events) || events.length === 0) {
        return reply.status(200).send({ ok: true }); // Don't error on empty
      }

      // Extract userId from JWT if available (optional)
      let userId: string | null = null;
      try {
        const token = request.headers.authorization?.replace('Bearer ', '');
        if (token) {
          const decoded = server.jwt.decode(token) as any;
          userId = decoded?.userId || null;
        }
      } catch { /* no auth = anonymous events */ }

      // Batch insert (max 50 events per request for safety)
      const rows = events.slice(0, 50).map((e: any) => ({
        userId,
        sessionId: e.properties?.sessionId || null,
        event: String(e.event || 'unknown').slice(0, 100),
        properties: e.properties || {},
        device: e.properties?.device || null,
        page: e.properties?.url || null,
      }));

      // Non-blocking insert — analytics should never slow down the product
      db.insert(analyticsEvents).values(rows).catch((err) => {
        console.error('[Analytics] Insert error:', err instanceof Error ? err.message : err);
      });

      return reply.status(200).send({ ok: true, count: rows.length });
    } catch {
      return reply.status(200).send({ ok: true }); // Never fail
    }
  });
}
