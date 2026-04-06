/**
 * Sponsored Balance Service
 *
 * Manages streamer/influencer sponsored accounts.
 * Balance looks real in UI, plays real, but withdrawal is capped to profit share.
 */

import { eq, and, sql } from 'drizzle-orm';
import { sponsoredBalances, balances, balanceLedgerEntries, users, adminAuditLogs } from '@tradingarena/db';
import { getDb } from '../../config/database.js';
import { AppError } from '../../middleware/errorHandler.js';

export interface SponsoredStatus {
  isSponsored: boolean;
  grantedAmount: number;
  currentBalance: number;
  ownDeposits: number;
  totalWithdrawn: number;
  netProfit: number;
  profitSharePercentage: number;
  withdrawableProfit: number;
  nonWithdrawable: number;
  status: string;
  expiresAt: string | null;
}

export class SponsoredService {
  private static db = getDb();

  /** Calculate the sponsored status for a user */
  static async getStatus(userId: string): Promise<SponsoredStatus | null> {
    const db = this.db;

    const [sponsored] = await db
      .select()
      .from(sponsoredBalances)
      .where(and(eq(sponsoredBalances.userId, userId), eq(sponsoredBalances.status, 'active')));

    if (!sponsored) return null;

    // Get current real balance
    const [bal] = await db
      .select({ available: balances.availableAmount, locked: balances.lockedAmount })
      .from(balances)
      .where(and(eq(balances.userId, userId), eq(balances.asset, 'SOL')));

    const currentBalance = (bal?.available ?? 0) + (bal?.locked ?? 0);
    const grantedAmount = sponsored.grantedAmountLamports;
    const ownDeposits = sponsored.ownDepositsLamports;
    const totalWithdrawn = sponsored.totalWithdrawnLamports;

    // Net profit = current balance + already withdrawn - granted - own deposits
    const totalValue = currentBalance + totalWithdrawn;
    const totalInput = grantedAmount + ownDeposits;
    const netProfit = Math.max(0, totalValue - totalInput);

    // Withdrawable = own deposits (100% theirs) + profit share - already withdrawn
    const profitShare = Math.floor(netProfit * sponsored.profitSharePercentage / 100);
    const totalWithdrawable = ownDeposits + profitShare;
    const withdrawableProfit = Math.max(0, totalWithdrawable - totalWithdrawn);

    return {
      isSponsored: true,
      grantedAmount,
      currentBalance,
      ownDeposits,
      totalWithdrawn,
      netProfit,
      profitSharePercentage: sponsored.profitSharePercentage,
      withdrawableProfit,
      nonWithdrawable: Math.max(0, currentBalance - withdrawableProfit),
      status: sponsored.status,
      expiresAt: sponsored.expiresAt?.toISOString() || null,
    };
  }

  /** Check if a withdrawal amount is allowed */
  static async checkWithdrawalAllowed(userId: string, withdrawAmount: number): Promise<{ allowed: boolean; maxAllowed: number; message?: string }> {
    const status = await this.getStatus(userId);
    if (!status) return { allowed: true, maxAllowed: Infinity }; // Not sponsored, no restrictions

    if (withdrawAmount <= status.withdrawableProfit) {
      return { allowed: true, maxAllowed: status.withdrawableProfit };
    }

    const maxSol = (status.withdrawableProfit / 1e9).toFixed(4);
    const profitSol = (status.netProfit / 1e9).toFixed(4);
    return {
      allowed: false,
      maxAllowed: status.withdrawableProfit,
      message: `Sponsored account: you can withdraw up to ${maxSol} SOL (${status.profitSharePercentage}% of ${profitSol} SOL net profit).`,
    };
  }

  /** Record a withdrawal against the sponsored tracking */
  static async recordWithdrawal(userId: string, amount: number): Promise<void> {
    const db = this.db;
    await db.execute(sql`
      UPDATE sponsored_balances
      SET total_withdrawn_lamports = total_withdrawn_lamports + ${amount}
      WHERE user_id = ${userId} AND status = 'active'
    `);
  }

  /** Record an own deposit (not sponsored — user's real money) */
  static async recordOwnDeposit(userId: string, amount: number): Promise<void> {
    const db = this.db;
    await db.execute(sql`
      UPDATE sponsored_balances
      SET own_deposits_lamports = own_deposits_lamports + ${amount}
      WHERE user_id = ${userId} AND status = 'active'
    `);
  }

  /** Grant sponsored balance to a user (admin action) */
  static async grant(params: {
    userId: string;
    amountLamports: number;
    profitSharePercentage: number;
    grantedBy: string;
    notes?: string;
    expiresAt?: Date;
  }): Promise<typeof sponsoredBalances.$inferSelect> {
    const db = this.db;

    // Check if user already has active sponsorship
    const existing = await db.query.sponsoredBalances.findFirst({
      where: and(eq(sponsoredBalances.userId, params.userId), eq(sponsoredBalances.status, 'active')),
    });
    if (existing) throw new AppError(409, 'ALREADY_SPONSORED', 'User already has an active sponsorship');

    // Credit balance
    await db.execute(sql`
      INSERT INTO balances (user_id, asset, available_amount, locked_amount, pending_amount)
      VALUES (${params.userId}, 'SOL', ${params.amountLamports}, 0, 0)
      ON CONFLICT (user_id, asset)
      DO UPDATE SET available_amount = balances.available_amount + ${params.amountLamports}, updated_at = now()
    `);

    // Ledger entry
    const [balAfter] = await db.execute(sql`
      SELECT available_amount FROM balances WHERE user_id = ${params.userId} AND asset = 'SOL'
    `) as unknown as { available_amount: number }[];

    await db.insert(balanceLedgerEntries).values({
      userId: params.userId,
      asset: 'SOL',
      entryType: 'sponsored_grant',
      amount: params.amountLamports,
      balanceAfter: balAfter?.available_amount ?? params.amountLamports,
      referenceType: 'sponsored',
      referenceId: `grant_${Date.now()}`,
      metadata: { grantedBy: params.grantedBy, profitShare: params.profitSharePercentage, notes: params.notes },
    });

    // Create sponsorship record
    const [sponsored] = await db.insert(sponsoredBalances).values({
      userId: params.userId,
      grantedAmountLamports: params.amountLamports,
      profitSharePercentage: params.profitSharePercentage,
      grantedBy: params.grantedBy,
      notes: params.notes,
      expiresAt: params.expiresAt,
    }).returning();

    // Audit log
    await db.insert(adminAuditLogs).values({
      actorUserId: params.grantedBy,
      actionType: 'sponsored_grant',
      targetType: 'user',
      targetId: params.userId,
      payload: { amount: params.amountLamports, profitShare: params.profitSharePercentage, notes: params.notes },
    });

    return sponsored;
  }

  /** Settle a sponsorship — calculate final profit share, return rest to treasury */
  static async settle(userId: string, settledBy: string): Promise<{ profitShare: number; returnedToTreasury: number }> {
    const db = this.db;
    const status = await this.getStatus(userId);
    if (!status) throw new AppError(404, 'NOT_SPONSORED', 'No active sponsorship for this user');

    const profitShareAmount = status.withdrawableProfit;

    // Deduct non-withdrawable from user's balance (return to treasury)
    const returnAmount = Math.max(0, status.currentBalance - profitShareAmount);
    if (returnAmount > 0) {
      await db.execute(sql`
        UPDATE balances
        SET available_amount = GREATEST(0, available_amount - ${returnAmount}), updated_at = now()
        WHERE user_id = ${userId} AND asset = 'SOL'
      `);

      await db.insert(balanceLedgerEntries).values({
        userId,
        asset: 'SOL',
        entryType: 'sponsored_settle',
        amount: -returnAmount,
        balanceAfter: profitShareAmount,
        referenceType: 'sponsored',
        referenceId: `settle_${Date.now()}`,
        metadata: { returnedToTreasury: returnAmount, profitShareKept: profitShareAmount },
      });
    }

    // Mark sponsorship as settled
    await db.update(sponsoredBalances)
      .set({ status: 'settled', settledAt: new Date() })
      .where(eq(sponsoredBalances.userId, userId));

    // Audit log
    await db.insert(adminAuditLogs).values({
      actorUserId: settledBy,
      actionType: 'sponsored_settle',
      targetType: 'user',
      targetId: userId,
      payload: { profitShare: profitShareAmount, returnedToTreasury: returnAmount },
    });

    return { profitShare: profitShareAmount, returnedToTreasury: returnAmount };
  }

  /** List all sponsored accounts */
  static async listAll() {
    const db = this.db;
    const all = await db.execute(sql`
      SELECT
        sb.*,
        u.username,
        p.avatar_url,
        COALESCE(b.available_amount, 0) + COALESCE(b.locked_amount, 0) AS current_balance
      FROM sponsored_balances sb
      JOIN users u ON u.id = sb.user_id
      LEFT JOIN user_profiles p ON p.user_id = sb.user_id
      LEFT JOIN balances b ON b.user_id = sb.user_id AND b.asset = 'SOL'
      ORDER BY sb.created_at DESC
    `) as unknown as any[];

    return all.map(s => ({
      id: s.id,
      userId: s.user_id,
      username: s.username,
      avatarUrl: s.avatar_url,
      grantedAmount: Number(s.granted_amount_lamports),
      currentBalance: Number(s.current_balance),
      ownDeposits: Number(s.own_deposits_lamports),
      totalWithdrawn: Number(s.total_withdrawn_lamports),
      profitSharePercentage: s.profit_share_percentage,
      status: s.status,
      notes: s.notes,
      expiresAt: s.expires_at,
      createdAt: s.created_at,
    }));
  }
}
