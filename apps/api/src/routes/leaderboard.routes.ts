import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { getDb } from '../config/database.js';
import { requireAuth, getAuthUser } from '../middleware/auth.js';

export async function leaderboardRoutes(server: FastifyInstance) {
  const db = getDb();

  server.get('/:type', async (request) => {
    const { type } = request.params as { type: string };
    const { period, limit } = request.query as { period?: string; limit?: string };

    let orderColumn: string;
    let scoreExpr: string;

    switch (type) {
      case 'multiplier':
        orderColumn = 'MAX(CAST(br.final_multiplier AS DECIMAL))';
        scoreExpr = 'MAX(CAST(br.final_multiplier AS DECIMAL))';
        break;
      case 'volume':
        orderColumn = 'COUNT(*)';
        scoreExpr = 'COUNT(*)';
        break;
      case 'profit':
      default:
        orderColumn = 'COALESCE(SUM(br.payout_amount), 0)';
        scoreExpr = 'COALESCE(SUM(br.payout_amount), 0)';
        break;
    }

    // Period filter
    let periodFilter = '';
    if (period === 'daily') {
      periodFilter = `AND br.created_at >= NOW() - INTERVAL '1 day'`;
    } else if (period === 'weekly') {
      periodFilter = `AND br.created_at >= NOW() - INTERVAL '7 days'`;
    }

    const results = await db.execute(sql.raw(`
      SELECT
        u.id as user_id,
        u.username,
        u.level,
        u.vip_tier,
        ${scoreExpr} as score,
        COUNT(*) as rounds
      FROM bet_results br
      JOIN users u ON u.id = br.user_id
      WHERE 1=1 ${periodFilter}
      GROUP BY u.id, u.username, u.level, u.vip_tier
      ORDER BY ${orderColumn} DESC
      LIMIT ${parseInt(limit || '20')}
    `));

    const rows = results as unknown as Array<Record<string, unknown>>;
    return {
      type,
      period: period || 'all',
      data: rows.map((row, i) => ({
        rank: i + 1,
        userId: row.user_id,
        username: row.username,
        level: row.level,
        vipTier: row.vip_tier,
        score: String(row.score || 0),
      })),
    };
  });

  server.get('/:type/me', { preHandler: [requireAuth] }, async (request) => {
    const { type } = request.params as { type: string };
    const userId = getAuthUser(request).userId;

    let scoreExpr: string;
    switch (type) {
      case 'multiplier':
        scoreExpr = 'MAX(CAST(br.final_multiplier AS DECIMAL))';
        break;
      case 'volume':
        scoreExpr = 'COUNT(*)';
        break;
      default:
        scoreExpr = 'COALESCE(SUM(br.payout_amount), 0)';
        break;
    }

    const results = await db.execute(sql.raw(`
      WITH ranked AS (
        SELECT
          br.user_id,
          ${scoreExpr} as score,
          RANK() OVER (ORDER BY ${scoreExpr} DESC) as rank
        FROM bet_results br
        GROUP BY br.user_id
      )
      SELECT rank, score FROM ranked WHERE user_id = '${userId}'
    `));

    const rows = results as unknown as Array<Record<string, unknown>>;
    if (rows.length === 0) {
      return { rank: null, score: '0' };
    }
    return { rank: Number(rows[0].rank), score: String(rows[0].score) };
  });
}
