import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { getDb } from '../config/database.js';

// Cache platform stats for 60 seconds to avoid hammering the DB
let cachedStats: { totalWagered: number; totalPaidOut: number; gamesPlayed: number } | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

export async function statsRoutes(server: FastifyInstance) {
  /**
   * GET /v1/stats/platform
   * Public endpoint — no auth required.
   * Returns aggregate platform metrics from userProfiles.
   */
  server.get('/platform', async (_request, reply) => {
    const now = Date.now();

    if (cachedStats && now - cachedAt < CACHE_TTL_MS) {
      return reply.send(cachedStats);
    }

    try {
      const db = getDb();
      const result = await db.execute(sql`
        SELECT
          COALESCE(SUM(total_wagered), 0)::bigint  AS "totalWagered",
          COALESCE(SUM(total_won), 0)::bigint       AS "totalPaidOut",
          COALESCE(SUM(rounds_played), 0)::bigint    AS "gamesPlayed"
        FROM user_profiles
      `);

      const row = (result as any).rows?.[0] ?? (result as any)[0] ?? {};
      cachedStats = {
        totalWagered: Number(row.totalWagered ?? 0),
        totalPaidOut: Number(row.totalPaidOut ?? 0),
        gamesPlayed: Number(row.gamesPlayed ?? 0),
      };
      cachedAt = now;

      return reply.send(cachedStats);
    } catch (err) {
      server.log.error(err, 'Failed to fetch platform stats');
      // Return zeros rather than error — non-critical endpoint
      return reply.send({ totalWagered: 0, totalPaidOut: 0, gamesPlayed: 0 });
    }
  });
}
