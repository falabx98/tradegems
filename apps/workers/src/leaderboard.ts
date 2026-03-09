import Redis from 'ioredis';
import { sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import { createDb } from '@tradingarena/db';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REFRESH_INTERVAL_MS = 60000; // Refresh every 60 seconds

export class LeaderboardWorker {
  private redis: Redis;
  private db: ReturnType<typeof createDb>;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(private logger: Logger) {
    this.redis = new Redis(REDIS_URL);
    this.db = createDb(process.env.DATABASE_URL!);
  }

  start() {
    this.refreshLeaderboards();
    this.interval = setInterval(() => {
      this.refreshLeaderboards();
    }, REFRESH_INTERVAL_MS);

    this.logger.info('Leaderboard worker started');
  }

  private async refreshLeaderboards() {
    try {
      await Promise.all([
        this.refreshDaily(),
        this.refreshWeekly(),
        this.refreshAllTime(),
      ]);
    } catch (error) {
      this.logger.error({ error: (error as Error).message }, 'Failed to refresh leaderboards');
    }
  }

  private async refreshDaily() {
    const results = await this.db.execute(sql`
      SELECT
        u.id as user_id,
        u.username,
        up.level,
        u.vip_tier,
        COALESCE(SUM(br.payout_amount - b.amount), 0) as net_profit,
        COUNT(*) as rounds
      FROM bet_results br
      JOIN bets b ON b.id = br.bet_id
      JOIN users u ON u.id = br.user_id
      JOIN user_profiles up ON up.user_id = u.id
      WHERE br.created_at > now() - interval '24 hours'
      GROUP BY u.id, u.username, up.level, u.vip_tier
      ORDER BY net_profit DESC
      LIMIT 100
    `) as unknown as Array<Record<string, unknown>>;

    const pipeline = this.redis.pipeline();
    const key = 'leaderboard:daily';
    pipeline.del(key);

    for (let i = 0; i < results.length; i++) {
      const row = results[i];
      pipeline.zadd(key, Number(row.net_profit), JSON.stringify({
        userId: row.user_id,
        username: row.username,
        level: row.level,
        vipTier: row.vip_tier,
        netProfit: Number(row.net_profit),
        rounds: Number(row.rounds),
      }));
    }

    pipeline.expire(key, 120);
    await pipeline.exec();
  }

  private async refreshWeekly() {
    const results = await this.db.execute(sql`
      SELECT
        u.id as user_id,
        u.username,
        up.level,
        u.vip_tier,
        COALESCE(SUM(br.payout_amount - b.amount), 0) as net_profit,
        COUNT(*) as rounds
      FROM bet_results br
      JOIN bets b ON b.id = br.bet_id
      JOIN users u ON u.id = br.user_id
      JOIN user_profiles up ON up.user_id = u.id
      WHERE br.created_at > now() - interval '7 days'
      GROUP BY u.id, u.username, up.level, u.vip_tier
      ORDER BY net_profit DESC
      LIMIT 100
    `) as unknown as Array<Record<string, unknown>>;

    const pipeline = this.redis.pipeline();
    const key = 'leaderboard:weekly';
    pipeline.del(key);

    for (let i = 0; i < results.length; i++) {
      const row = results[i];
      pipeline.zadd(key, Number(row.net_profit), JSON.stringify({
        userId: row.user_id,
        username: row.username,
        level: row.level,
        vipTier: row.vip_tier,
        netProfit: Number(row.net_profit),
        rounds: Number(row.rounds),
      }));
    }

    pipeline.expire(key, 600);
    await pipeline.exec();
  }

  private async refreshAllTime() {
    const results = await this.db.execute(sql`
      SELECT
        u.id as user_id,
        u.username,
        up.level,
        u.vip_tier,
        COALESCE(up.total_won - up.total_wagered, 0) as net_profit,
        up.rounds_played as rounds
      FROM user_profiles up
      JOIN users u ON u.id = up.user_id
      WHERE up.rounds_played > 0
      ORDER BY net_profit DESC
      LIMIT 100
    `) as unknown as Array<Record<string, unknown>>;

    const pipeline = this.redis.pipeline();
    const key = 'leaderboard:alltime';
    pipeline.del(key);

    for (let i = 0; i < results.length; i++) {
      const row = results[i];
      pipeline.zadd(key, Number(row.net_profit), JSON.stringify({
        userId: row.user_id,
        username: row.username,
        level: row.level,
        vipTier: row.vip_tier,
        netProfit: Number(row.net_profit),
        rounds: Number(row.rounds),
      }));
    }

    pipeline.expire(key, 3600);
    await pipeline.exec();
  }

  async stop() {
    if (this.interval) clearInterval(this.interval);
    await this.redis.quit();
  }
}
