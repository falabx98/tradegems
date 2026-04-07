/**
 * Public transparency & treasury status endpoints.
 * No authentication required.
 */

import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { getDb } from '../config/database.js';
import { TreasuryService } from '../modules/treasury/treasury.service.js';

export async function transparencyRoutes(server: FastifyInstance) {
  const db = getDb();
  const treasuryService = new TreasuryService();

  /**
   * GET /v1/transparency
   *
   * Public platform transparency page. Exposes aggregated metrics only:
   *  - totalWagered, totalPaidOut
   *  - averageWithdrawalTimeHours
   *  - platformStatus: 'operational' | 'high demand' | 'maintenance'
   *  - gamesPlayed
   *  - uptime (percentage)
   *
   * Does NOT expose: liquidity numbers, internal thresholds, reserve ratios.
   */
  server.get('/', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async () => {
    // Aggregate platform-wide stats
    const statsResult = await db.execute(sql`
      SELECT
        COALESCE(SUM(total_wagered), 0) as total_wagered,
        COALESCE(SUM(total_won), 0) as total_paid_out,
        COALESCE(SUM(rounds_played), 0) as games_played
      FROM user_profiles
    `);
    const stats = (statsResult as any).rows?.[0] ?? (statsResult as any)[0] ?? {};

    // Average withdrawal processing time (last 30 days, completed only)
    const wdResult = await db.execute(sql`
      SELECT
        COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600), 0) as avg_hours
      FROM withdrawals
      WHERE status IN ('completed', 'confirmed')
        AND completed_at >= ${new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()}
    `);
    const withdrawalStats = (wdResult as any).rows?.[0] ?? (wdResult as any)[0] ?? {};

    // Platform status from treasury (just the status string)
    const treasuryStatus = await treasuryService.getTreasuryStatus();
    let platformStatus: 'operational' | 'high demand' | 'maintenance' = 'operational';
    if (treasuryStatus.status === 'maintenance') {
      platformStatus = 'maintenance';
    } else if (treasuryStatus.status === 'critical' || treasuryStatus.status === 'warning') {
      platformStatus = 'high demand';
    }

    // Uptime: % of time platform has been 'healthy' in last 7 days
    // Approximated from ops_alerts — if no circuit_breaker alerts, uptime ~100%
    let uptime = 99.9;
    try {
      const alertResult = await db.execute(sql`
        SELECT COUNT(*) as cnt FROM ops_alerts
        WHERE category = 'circuit_breaker'
          AND created_at >= ${new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()}
      `);
      const alertCount = (alertResult as any).rows?.[0] ?? (alertResult as any)[0] ?? {};
      const alerts = Number(alertCount?.cnt ?? 0);
      // Each alert ~= 5 min of degraded service (rough estimate)
      const degradedMinutes = alerts * 5;
      const totalMinutes = 7 * 24 * 60;
      uptime = Math.max(0, parseFloat(((1 - degradedMinutes / totalMinutes) * 100).toFixed(1)));
    } catch { /* non-critical */ }

    return {
      totalWagered: Number(stats?.total_wagered ?? 0),
      totalPaidOut: Number(stats?.total_paid_out ?? 0),
      averageWithdrawalTimeHours: parseFloat(Number(withdrawalStats?.avg_hours ?? 0).toFixed(1)),
      platformStatus,
      gamesPlayed: Number(stats?.games_played ?? 0),
      uptime,
    };
  });
}

/**
 * Public treasury status endpoint (separate registration).
 * Returns only the status string — no internal numbers.
 */
export async function treasuryPublicRoutes(server: FastifyInstance) {
  const treasuryService = new TreasuryService();

  /**
   * GET /v1/treasury/status
   *
   * Returns: { status: 'healthy' | 'warning' | 'critical' | 'maintenance' }
   * Frontend polls this every 1 minute for banner display.
   */
  server.get('/status', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async () => {
    const result = await treasuryService.getTreasuryStatus();
    return { status: result.status };
  });
}
