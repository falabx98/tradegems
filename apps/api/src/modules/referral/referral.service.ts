import { eq, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { referralCodes, referrals, referralEarnings, users } from '@tradingarena/db';
import { getDb } from '../../config/database.js';
import { getRedis } from '../../config/redis.js';

const REFERRAL_COMMISSION_RATE = 0.20; // 20% of platform fee goes to referrer

export class ReferralService {
  private db = getDb();

  // ─── Get or generate referral code ────────────────────────

  async getOrCreateCode(userId: string): Promise<string> {
    // Check existing
    const existing = await this.db.query.referralCodes.findFirst({
      where: eq(referralCodes.userId, userId),
    });
    if (existing) return existing.code;

    // Generate unique code
    const code = nanoid(8).toUpperCase();
    await this.db.insert(referralCodes).values({ userId, code });
    return code;
  }

  // ─── Link referred user to referrer ───────────────────────

  async linkReferral(referredUserId: string, code: string): Promise<void> {
    // Look up the code
    const refCode = await this.db.query.referralCodes.findFirst({
      where: eq(referralCodes.code, code),
    });
    if (!refCode) return; // Invalid code — silently ignore

    // Prevent self-referral
    if (refCode.userId === referredUserId) return;

    // Check not already referred
    const existing = await this.db.query.referrals.findFirst({
      where: eq(referrals.referredUserId, referredUserId),
    });
    if (existing) return; // Already referred

    await this.db.insert(referrals).values({
      referrerId: refCode.userId,
      referredUserId,
    });
  }

  // ─── Record commission on bet settlement ──────────────────

  async recordCommission(
    referredUserId: string,
    betId: string,
    betAmount: number,
    feeAmount: number,
  ): Promise<void> {
    // Check if user has a referrer
    const ref = await this.db.query.referrals.findFirst({
      where: eq(referrals.referredUserId, referredUserId),
    });
    if (!ref) return; // Not a referred user

    // Check no duplicate for this bet
    const existingEarning = await this.db.query.referralEarnings.findFirst({
      where: eq(referralEarnings.betId, betId),
    });
    if (existingEarning) return;

    const commissionAmount = Math.floor(feeAmount * REFERRAL_COMMISSION_RATE);
    if (commissionAmount <= 0) return;

    await this.db.insert(referralEarnings).values({
      referrerId: ref.referrerId,
      referredUserId,
      betId,
      betAmount,
      feeAmount,
      commissionAmount,
      status: 'pending',
    });
  }

  // ─── Get referral stats ───────────────────────────────────

  async getStats(userId: string): Promise<{
    referralCode: string;
    referredCount: number;
    totalWagered: number;
    totalEarned: number;
    claimable: number;
  }> {
    const code = await this.getOrCreateCode(userId);

    // Count referred users
    const countResult = await this.db.execute(sql`
      SELECT COUNT(*)::int as count FROM referrals WHERE referrer_id = ${userId}
    `);
    const countRows = countResult as unknown as Array<Record<string, unknown>>;
    const referredCount = Number(countRows[0]?.count || 0);

    // Earnings aggregation
    const earningsResult = await this.db.execute(sql`
      SELECT
        COALESCE(SUM(bet_amount), 0)::bigint as total_wagered,
        COALESCE(SUM(commission_amount), 0)::bigint as total_earned,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_amount ELSE 0 END), 0)::bigint as claimable
      FROM referral_earnings
      WHERE referrer_id = ${userId}
    `);
    const earningsRows = earningsResult as unknown as Array<Record<string, unknown>>;
    const row = earningsRows[0] || {};

    return {
      referralCode: code,
      referredCount,
      totalWagered: Number(row.total_wagered || 0),
      totalEarned: Number(row.total_earned || 0),
      claimable: Number(row.claimable || 0),
    };
  }

  // ─── Get referred users list ──────────────────────────────

  async getReferredUsers(userId: string): Promise<Array<{
    username: string;
    joinedAt: string;
    totalWagered: number;
    yourEarnings: number;
  }>> {
    const result = await this.db.execute(sql`
      SELECT
        u.username,
        r.created_at as joined_at,
        COALESCE(SUM(re.bet_amount), 0)::bigint as total_wagered,
        COALESCE(SUM(re.commission_amount), 0)::bigint as your_earnings
      FROM referrals r
      JOIN users u ON u.id = r.referred_user_id
      LEFT JOIN referral_earnings re ON re.referred_user_id = r.referred_user_id AND re.referrer_id = ${userId}
      WHERE r.referrer_id = ${userId}
      GROUP BY u.username, r.created_at
      ORDER BY r.created_at DESC
    `);
    const rows = result as unknown as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      username: String(row.username || 'unknown'),
      joinedAt: row.joined_at ? new Date(row.joined_at as string).toISOString() : '',
      totalWagered: Number(row.total_wagered || 0),
      yourEarnings: Number(row.your_earnings || 0),
    }));
  }

  // ─── Claim pending earnings ───────────────────────────────

  async claimEarnings(userId: string): Promise<{ claimed: number }> {
    const redis = getRedis();
    const lockKey = `lock:referral-claim:${userId}`;
    const locked = await redis.set(lockKey, '1', 'EX', 10, 'NX');
    if (!locked) {
      return { claimed: 0 };
    }

    try {
      // Sum pending earnings
      const sumResult = await this.db.execute(sql`
        SELECT COALESCE(SUM(commission_amount), 0)::bigint as total
        FROM referral_earnings
        WHERE referrer_id = ${userId} AND status = 'pending'
      `);
      const sumRows = sumResult as unknown as Array<Record<string, unknown>>;
      const total = Number(sumRows[0]?.total || 0);

      if (total <= 0) {
        return { claimed: 0 };
      }

      // Mark all pending as claimed
      await this.db.execute(sql`
        UPDATE referral_earnings
        SET status = 'claimed', claimed_at = now()
        WHERE referrer_id = ${userId} AND status = 'pending'
      `);

      // Credit to balance
      await this.db.execute(sql`
        UPDATE balances
        SET available_amount = available_amount + ${total}, updated_at = now()
        WHERE user_id = ${userId} AND asset = 'SOL'
      `);

      // Insert ledger entry
      await this.db.execute(sql`
        INSERT INTO balance_ledger_entries (user_id, asset, entry_type, amount, balance_after, reference_type, reference_id, metadata)
        SELECT
          ${userId},
          'SOL',
          'referral_commission',
          ${total},
          b.available_amount,
          'referral',
          ${userId},
          ${JSON.stringify({ type: 'referral_commission_claim' })}::jsonb
        FROM balances b
        WHERE b.user_id = ${userId} AND b.asset = 'SOL'
      `);

      return { claimed: total };
    } finally {
      await redis.del(lockKey);
    }
  }
}
