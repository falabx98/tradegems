import { eq, and, desc, sql, lte, gte } from 'drizzle-orm';
import { weeklyRaces, weeklyRaceEntries, weeklyRacePrizes, users, balances, balanceLedgerEntries } from '@tradingarena/db';
import { getDb } from '../../config/database.js';

// ─── Prize Distribution Config ──────────────────────────────

const DEFAULT_PRIZE_POOL_LAMPORTS = 10_000_000_000; // 10 SOL

const PRIZE_DISTRIBUTION = [
  { rank: 1, percentage: 30 },
  { rank: 2, percentage: 20 },
  { rank: 3, percentage: 15 },
  { rank: 4, percentage: 10 },
  { rank: 5, percentage: 8 },
  { rank: 6, percentage: 5 },
  { rank: 7, percentage: 4 },
  { rank: 8, percentage: 3 },
  { rank: 9, percentage: 3 },
  { rank: 10, percentage: 2 },
];

// ─── Helpers ────────────────────────────────────────────────

function getWeekBounds(now = new Date()): { weekStart: Date; weekEnd: Date } {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  // Monday = 1, shift to Monday 00:00 UTC
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // Sunday → -6, else 1-day
  d.setUTCDate(d.getUTCDate() + diff);
  const weekStart = new Date(d);
  const weekEnd = new Date(d);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

function getNextWeekBounds(now = new Date()): { weekStart: Date; weekEnd: Date } {
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 7);
  return getWeekBounds(next);
}

// ─── Service ────────────────────────────────────────────────

export class WeeklyRaceService {
  private static db = getDb();

  /** Get or create the active race for the current week */
  static async ensureActiveRace(): Promise<typeof weeklyRaces.$inferSelect> {
    const db = this.db;
    const { weekStart, weekEnd } = getWeekBounds();

    // Check for existing active race this week
    const existing = await db
      .select()
      .from(weeklyRaces)
      .where(and(
        eq(weeklyRaces.status, 'active'),
        lte(weeklyRaces.weekStart, weekEnd),
        gte(weeklyRaces.weekEnd, weekStart),
      ))
      .limit(1);

    if (existing.length > 0) return existing[0];

    // Create new race
    const [race] = await db
      .insert(weeklyRaces)
      .values({
        weekStart,
        weekEnd,
        status: 'active',
        prizePoolLamports: DEFAULT_PRIZE_POOL_LAMPORTS,
        prizeSource: 'fixed',
        fixedPrizeLamports: DEFAULT_PRIZE_POOL_LAMPORTS,
      })
      .returning();

    console.log(`[WeeklyRace] Created new race ${race.id} for ${weekStart.toISOString()} — ${weekEnd.toISOString()}`);
    return race;
  }

  /** Track a bet — called after every real-money settlement */
  static async trackBet(userId: string, betAmountLamports: number): Promise<void> {
    const db = this.db;

    // Find active race
    const now = new Date();
    const [race] = await db
      .select({ id: weeklyRaces.id })
      .from(weeklyRaces)
      .where(and(
        eq(weeklyRaces.status, 'active'),
        lte(weeklyRaces.weekStart, now),
        gte(weeklyRaces.weekEnd, now),
      ))
      .limit(1);

    if (!race) return; // No active race

    // Upsert entry — atomic increment
    await db.execute(sql`
      INSERT INTO weekly_race_entries (id, race_id, user_id, total_wagered_lamports, bet_count, last_bet_at)
      VALUES (gen_random_uuid(), ${race.id}, ${userId}, ${betAmountLamports}, 1, now())
      ON CONFLICT (race_id, user_id)
      DO UPDATE SET
        total_wagered_lamports = weekly_race_entries.total_wagered_lamports + ${betAmountLamports},
        bet_count = weekly_race_entries.bet_count + 1,
        last_bet_at = now()
    `);

    // Also increment total race volume
    await db.execute(sql`
      UPDATE weekly_races
      SET total_volume_lamports = total_volume_lamports + ${betAmountLamports}
      WHERE id = ${race.id}
    `);
  }

  /** Get the current active race with leaderboard */
  static async getCurrentRace(limit = 50) {
    const db = this.db;
    const now = new Date();

    const [race] = await db
      .select()
      .from(weeklyRaces)
      .where(and(
        eq(weeklyRaces.status, 'active'),
        lte(weeklyRaces.weekStart, now),
        gte(weeklyRaces.weekEnd, now),
      ))
      .limit(1);

    if (!race) return null;

    // Get leaderboard
    const leaderboard = await db.execute(sql`
      SELECT
        e.user_id,
        u.username,
        u.avatar_url,
        e.total_wagered_lamports,
        e.bet_count,
        e.last_bet_at
      FROM weekly_race_entries e
      JOIN users u ON u.id = e.user_id
      WHERE e.race_id = ${race.id}
      ORDER BY e.total_wagered_lamports DESC, e.last_bet_at ASC
      LIMIT ${limit}
    `) as unknown as Array<{
      user_id: string;
      username: string;
      avatar_url: string | null;
      total_wagered_lamports: number;
      bet_count: number;
      last_bet_at: string;
    }>;

    const timeRemainingMs = Math.max(0, new Date(race.weekEnd).getTime() - now.getTime());

    return {
      raceId: race.id,
      weekStart: race.weekStart,
      weekEnd: race.weekEnd,
      prizePool: race.prizePoolLamports,
      totalVolume: race.totalVolumeLamports,
      timeRemainingMs,
      prizeDistribution: PRIZE_DISTRIBUTION,
      leaderboard: leaderboard.map((e, i) => ({
        rank: i + 1,
        userId: e.user_id,
        username: e.username,
        avatarUrl: e.avatar_url,
        wagered: Number(e.total_wagered_lamports),
        betCount: Number(e.bet_count),
        prize: i < PRIZE_DISTRIBUTION.length
          ? Math.floor(race.prizePoolLamports * PRIZE_DISTRIBUTION[i].percentage / 100)
          : 0,
      })),
    };
  }

  /** Get the current user's rank in the active race */
  static async getMyRank(userId: string) {
    const db = this.db;
    const now = new Date();

    const [race] = await db
      .select({ id: weeklyRaces.id })
      .from(weeklyRaces)
      .where(and(
        eq(weeklyRaces.status, 'active'),
        lte(weeklyRaces.weekStart, now),
        gte(weeklyRaces.weekEnd, now),
      ))
      .limit(1);

    if (!race) return null;

    // Get user's entry
    const [entry] = await db
      .select()
      .from(weeklyRaceEntries)
      .where(and(
        eq(weeklyRaceEntries.raceId, race.id),
        eq(weeklyRaceEntries.userId, userId),
      ))
      .limit(1);

    if (!entry) return { rank: null, wagered: 0, betCount: 0 };

    // Count how many users have more wagered (or same wagered but earlier last_bet)
    const rankResult = await db.execute(sql`
      SELECT COUNT(*) + 1 AS rank
      FROM weekly_race_entries
      WHERE race_id = ${race.id}
        AND (total_wagered_lamports > ${entry.totalWageredLamports}
          OR (total_wagered_lamports = ${entry.totalWageredLamports} AND last_bet_at < ${entry.lastBetAt}))
    `) as unknown as Array<{ rank: number }>;

    return {
      rank: Number(rankResult[0]?.rank ?? 1),
      wagered: entry.totalWageredLamports,
      betCount: entry.betCount,
    };
  }

  /** Complete a race: calculate rankings, distribute prizes */
  static async completeRace(raceId: string): Promise<void> {
    const db = this.db;

    // 1. Set status to 'paying'
    await db
      .update(weeklyRaces)
      .set({ status: 'paying' })
      .where(eq(weeklyRaces.id, raceId));

    // 2. Get race details
    const [race] = await db
      .select()
      .from(weeklyRaces)
      .where(eq(weeklyRaces.id, raceId));

    if (!race) throw new Error(`Race ${raceId} not found`);

    // Calculate actual prize pool
    let prizePool = race.prizePoolLamports;
    if (race.prizeSource === 'percentage_of_volume') {
      const pct = Number(race.volumePercentage || '0.01');
      prizePool = Math.floor(race.totalVolumeLamports * pct);
    }

    // 3. Get top entries (ORDER BY wagered DESC, first to reach that amount wins tiebreak)
    const topEntries = await db.execute(sql`
      SELECT user_id, total_wagered_lamports
      FROM weekly_race_entries
      WHERE race_id = ${raceId}
      ORDER BY total_wagered_lamports DESC, last_bet_at ASC
      LIMIT 10
    `) as unknown as Array<{ user_id: string; total_wagered_lamports: number }>;

    // 4. Distribute prizes
    for (let i = 0; i < Math.min(topEntries.length, PRIZE_DISTRIBUTION.length); i++) {
      const entry = topEntries[i];
      const prizeAmount = Math.floor(prizePool * PRIZE_DISTRIBUTION[i].percentage / 100);

      if (prizeAmount <= 0) continue;

      // Insert prize record
      await db.insert(weeklyRacePrizes).values({
        raceId,
        rank: i + 1,
        userId: entry.user_id,
        prizeLamports: prizeAmount,
        claimed: true,
        claimedAt: new Date(),
      });

      // Credit prize to user balance (atomic upsert + ledger)
      await db.transaction(async (tx) => {
        const result = await tx.execute(sql`
          INSERT INTO balances (user_id, asset, available_amount, locked_amount, pending_amount)
          VALUES (${entry.user_id}, 'SOL', ${prizeAmount}, 0, 0)
          ON CONFLICT (user_id, asset)
          DO UPDATE SET available_amount = balances.available_amount + ${prizeAmount},
                        updated_at = now()
          RETURNING available_amount
        `) as unknown as { available_amount: number }[];

        const balanceAfter = result?.[0]?.available_amount ?? prizeAmount;

        await tx.insert(balanceLedgerEntries).values({
          userId: entry.user_id,
          asset: 'SOL',
          entryType: 'weekly_race_prize',
          amount: prizeAmount,
          balanceAfter,
          referenceType: 'weekly_race',
          referenceId: raceId,
        });
      });

      console.log(`[WeeklyRace] Credited ${prizeAmount} lamports to user ${entry.user_id} (rank #${i + 1})`);
    }

    // 5. Mark race as completed
    await db
      .update(weeklyRaces)
      .set({ status: 'completed' })
      .where(eq(weeklyRaces.id, raceId));

    console.log(`[WeeklyRace] Race ${raceId} completed. ${topEntries.length} winners paid.`);
  }

  /** Get race history (last N completed races with winners) */
  static async getHistory(limit = 4) {
    const db = this.db;

    const races = await db
      .select()
      .from(weeklyRaces)
      .where(eq(weeklyRaces.status, 'completed'))
      .orderBy(desc(weeklyRaces.weekEnd))
      .limit(limit);

    const result = [];
    for (const race of races) {
      const prizes = await db
        .select({
          rank: weeklyRacePrizes.rank,
          userId: weeklyRacePrizes.userId,
          prizeLamports: weeklyRacePrizes.prizeLamports,
          username: users.username,
          avatarUrl: users.avatarUrl,
        })
        .from(weeklyRacePrizes)
        .innerJoin(users, eq(users.id, weeklyRacePrizes.userId))
        .where(eq(weeklyRacePrizes.raceId, race.id))
        .orderBy(weeklyRacePrizes.rank);

      result.push({
        raceId: race.id,
        weekStart: race.weekStart,
        weekEnd: race.weekEnd,
        prizePool: race.prizePoolLamports,
        totalVolume: race.totalVolumeLamports,
        winners: prizes.map(p => ({
          rank: p.rank,
          userId: p.userId,
          username: p.username,
          avatarUrl: p.avatarUrl,
          prize: p.prizeLamports,
        })),
      });
    }

    return result;
  }

  /** Get a specific race by ID */
  static async getRaceById(raceId: string) {
    const db = this.db;

    const [race] = await db
      .select()
      .from(weeklyRaces)
      .where(eq(weeklyRaces.id, raceId));

    if (!race) return null;

    const entries = await db.execute(sql`
      SELECT
        e.user_id,
        u.username,
        u.avatar_url,
        e.total_wagered_lamports,
        e.bet_count
      FROM weekly_race_entries e
      JOIN users u ON u.id = e.user_id
      WHERE e.race_id = ${raceId}
      ORDER BY e.total_wagered_lamports DESC, e.last_bet_at ASC
      LIMIT 50
    `) as unknown as Array<{
      user_id: string;
      username: string;
      avatar_url: string | null;
      total_wagered_lamports: number;
      bet_count: number;
    }>;

    const prizes = await db
      .select()
      .from(weeklyRacePrizes)
      .where(eq(weeklyRacePrizes.raceId, raceId))
      .orderBy(weeklyRacePrizes.rank);

    return {
      ...race,
      leaderboard: entries.map((e, i) => ({
        rank: i + 1,
        userId: e.user_id,
        username: e.username,
        avatarUrl: e.avatar_url,
        wagered: Number(e.total_wagered_lamports),
        betCount: Number(e.bet_count),
        prize: prizes.find(p => p.userId === e.user_id)?.prizeLamports ?? 0,
      })),
    };
  }

  /** Admin: list all races */
  static async listAllRaces() {
    const db = this.db;
    return db
      .select()
      .from(weeklyRaces)
      .orderBy(desc(weeklyRaces.weekStart))
      .limit(20);
  }

  /** Admin: force-create a new race */
  static async forceCreate(prizePoolLamports = DEFAULT_PRIZE_POOL_LAMPORTS) {
    const db = this.db;
    const { weekStart, weekEnd } = getWeekBounds();

    const [race] = await db
      .insert(weeklyRaces)
      .values({
        weekStart,
        weekEnd,
        status: 'active',
        prizePoolLamports,
        prizeSource: 'fixed',
        fixedPrizeLamports: prizePoolLamports,
      })
      .returning();

    return race;
  }

  /** Admin: force-complete a specific race */
  static async forceComplete(raceId: string) {
    await this.completeRace(raceId);
  }

  /** Admin: update config for the active race */
  static async updateConfig(config: { prizePoolLamports?: number; prizeSource?: string; volumePercentage?: string }) {
    const db = this.db;
    const now = new Date();

    const [race] = await db
      .select({ id: weeklyRaces.id })
      .from(weeklyRaces)
      .where(eq(weeklyRaces.status, 'active'))
      .limit(1);

    if (!race) throw new Error('No active race found');

    const updates: Record<string, any> = {};
    if (config.prizePoolLamports !== undefined) {
      updates.prizePoolLamports = config.prizePoolLamports;
      updates.fixedPrizeLamports = config.prizePoolLamports;
    }
    if (config.prizeSource !== undefined) updates.prizeSource = config.prizeSource;
    if (config.volumePercentage !== undefined) updates.volumePercentage = config.volumePercentage;

    await db
      .update(weeklyRaces)
      .set(updates)
      .where(eq(weeklyRaces.id, race.id));

    return { updated: true, raceId: race.id };
  }
}
