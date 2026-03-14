import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { getDb } from '../config/database.js';
import { requireAuth, getAuthUser } from '../middleware/auth.js';

export async function leaderboardRoutes(server: FastifyInstance) {
  const db = getDb();

  server.get('/:type', async (request, reply) => {
    const { type } = request.params as { type: string };
    const { period, limit } = request.query as { period?: string; limit?: string };

    // Whitelist type to prevent SQL injection via sql.raw
    const allowedTypes = ['profit', 'multiplier', 'volume'];
    if (!allowedTypes.includes(type)) {
      return reply.status(400).send({ error: 'Invalid leaderboard type' });
    }

    // Period filter
    let periodFilterSolo = '';
    let periodFilterPred = '';
    if (period === 'daily') {
      periodFilterSolo = `AND br.created_at >= NOW() - INTERVAL '1 day'`;
      periodFilterPred = `AND pr.created_at >= NOW() - INTERVAL '1 day'`;
    } else if (period === 'weekly') {
      periodFilterSolo = `AND br.created_at >= NOW() - INTERVAL '7 days'`;
      periodFilterPred = `AND pr.created_at >= NOW() - INTERVAL '7 days'`;
    }

    let scoreExpr: string;
    let orderExpr: string;

    switch (type) {
      case 'multiplier':
        scoreExpr = 'MAX(g.multiplier)';
        orderExpr = 'MAX(g.multiplier)';
        break;
      case 'volume':
        scoreExpr = 'COUNT(*)';
        orderExpr = 'COUNT(*)';
        break;
      case 'profit':
      default:
        scoreExpr = 'COALESCE(SUM(g.payout), 0)';
        orderExpr = 'COALESCE(SUM(g.payout), 0)';
        break;
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit || '20') || 20, 1), 100);

    try {
      // UNION solo bet_results + prediction_rounds + tournament_participants into a single games set
      let periodFilterTournament = '';
      if (period === 'daily') {
        periodFilterTournament = `AND tp.created_at >= NOW() - INTERVAL '1 day'`;
      } else if (period === 'weekly') {
        periodFilterTournament = `AND tp.created_at >= NOW() - INTERVAL '7 days'`;
      }

      const results = await db.execute(sql.raw(`
        WITH all_games AS (
          SELECT br.user_id, CAST(br.final_multiplier AS DECIMAL) as multiplier, br.payout_amount as payout, br.created_at
          FROM bet_results br
          WHERE 1=1 ${periodFilterSolo}
          UNION ALL
          SELECT pr.user_id, CAST(pr.multiplier AS DECIMAL) as multiplier, pr.payout as payout, pr.created_at
          FROM prediction_rounds pr
          WHERE 1=1 ${periodFilterPred}
          UNION ALL
          SELECT tp.user_id, CAST(tp.cumulative_score AS DECIMAL) as multiplier, tp.payout as payout, tp.created_at
          FROM tournament_participants tp
          WHERE 1=1 ${periodFilterTournament}
        )
        SELECT
          u.id as user_id,
          u.username,
          u.level,
          u.vip_tier,
          COALESCE(up.avatar_url, u.avatar_url) as avatar_url,
          ${scoreExpr} as score,
          COUNT(*) as rounds
        FROM all_games g
        JOIN users u ON u.id = g.user_id
        LEFT JOIN user_profiles up ON u.id = up.user_id
        GROUP BY u.id, u.username, u.level, u.vip_tier, up.avatar_url, u.avatar_url
        ORDER BY ${orderExpr} DESC
        LIMIT ${parsedLimit}
      `));

      // drizzle execute returns { rows: [...] } or the array directly depending on driver
      const rows = (Array.isArray(results) ? results : (results as any).rows ?? []) as Array<Record<string, unknown>>;
      return {
        type,
        period: period || 'all',
        data: rows.map((row, i) => ({
          rank: i + 1,
          userId: row.user_id,
          username: row.username,
          level: row.level,
          vipTier: row.vip_tier,
          avatarUrl: row.avatar_url || null,
          score: String(row.score || 0),
        })),
      };
    } catch (err: any) {
      request.log.error({ err, type, period }, 'Leaderboard query failed');
      return { type, period: period || 'all', data: [] };
    }
  });

  server.get('/:type/me', { preHandler: [requireAuth] }, async (request, reply) => {
    const { type } = request.params as { type: string };
    const userId = getAuthUser(request).userId;

    // Whitelist type to prevent unexpected behavior
    const allowedTypes = ['profit', 'multiplier', 'volume'];
    if (!allowedTypes.includes(type)) {
      return reply.status(400).send({ error: 'Invalid leaderboard type' });
    }

    let scoreExpr: string;
    switch (type) {
      case 'multiplier':
        scoreExpr = 'MAX(g.multiplier)';
        break;
      case 'volume':
        scoreExpr = 'COUNT(*)';
        break;
      default:
        scoreExpr = 'COALESCE(SUM(g.payout), 0)';
        break;
    }

    try {
      const results = await db.execute(sql`
        WITH all_games AS (
          SELECT br.user_id, CAST(br.final_multiplier AS DECIMAL) as multiplier, br.payout_amount as payout
          FROM bet_results br
          UNION ALL
          SELECT pr.user_id, CAST(pr.multiplier AS DECIMAL) as multiplier, pr.payout as payout
          FROM prediction_rounds pr
          UNION ALL
          SELECT tp.user_id, CAST(tp.cumulative_score AS DECIMAL) as multiplier, tp.payout as payout
          FROM tournament_participants tp
        ),
        ranked AS (
          SELECT
            g.user_id,
            ${sql.raw(scoreExpr)} as score,
            RANK() OVER (ORDER BY ${sql.raw(scoreExpr)} DESC) as rank
          FROM all_games g
          GROUP BY g.user_id
        )
        SELECT rank, score FROM ranked WHERE user_id = ${userId}
      `);

      const rows = (Array.isArray(results) ? results : (results as any).rows ?? []) as Array<Record<string, unknown>>;
      if (rows.length === 0) {
        return { rank: null, score: '0' };
      }
      return { rank: Number(rows[0].rank), score: String(rows[0].score) };
    } catch (err: any) {
      request.log.error({ err, type, userId }, 'Leaderboard /me query failed');
      return { rank: null, score: '0' };
    }
  });
}
