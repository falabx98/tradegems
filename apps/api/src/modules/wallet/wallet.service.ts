import { eq, and, sql, desc } from 'drizzle-orm';
import { balances, balanceLedgerEntries, deposits, withdrawals, linkedWallets, users, userProfiles } from '@tradingarena/db';
import { getDb } from '../../config/database.js';
import { getRedis } from '../../config/redis.js';
import { AppError } from '../../middleware/errorHandler.js';

const BONUS_PROFIT_THRESHOLD = 1_000_000_000; // Must profit 1 SOL to unlock withdrawal

interface LedgerRef {
  type: string;
  id: string;
}

export class WalletService {
  private db = getDb();

  // ─── Balance Queries ─────────────────────────────────────

  async getBalances(userId: string) {
    const rows = await this.db.query.balances.findMany({
      where: eq(balances.userId, userId),
    });

    if (rows.length === 0) {
      // Create default balance
      await this.db.insert(balances).values({
        userId,
        asset: 'SOL',
        availableAmount: 0,
        lockedAmount: 0,
        pendingAmount: 0,
      }).onConflictDoNothing();

      return {
        balances: [{
          asset: 'SOL' as const,
          available: '0',
          locked: '0',
          pending: '0',
        }],
      };
    }

    return {
      balances: rows.map(r => ({
        asset: r.asset,
        available: String(r.availableAmount),
        locked: String(r.lockedAmount),
        pending: String(r.pendingAmount),
        bonus: String(r.bonusAmount ?? 0),
      })),
    };
  }

  // ─── Lock Funds (for bet placement) ──────────────────────

  async lockFunds(userId: string, amount: number, asset: string, ref: LedgerRef) {
    const redis = getRedis();
    const lockKey = `lock:balance:${userId}:${asset}`;
    const acquired = await redis.set(lockKey, '1', 'EX', 5, 'NX');
    if (!acquired) throw new AppError(409, 'BALANCE_LOCKED', 'Balance operation in progress');

    try {
      // Use raw SQL for atomic update with check
      const result = await this.db.execute(sql`
        UPDATE balances
        SET available_amount = available_amount - ${amount},
            locked_amount = locked_amount + ${amount},
            updated_at = now()
        WHERE user_id = ${userId}
          AND asset = ${asset}
          AND available_amount >= ${amount}
        RETURNING available_amount, locked_amount
      `) as unknown as { available_amount: number; locked_amount: number }[];

      if (!result || result.length === 0) {
        throw new AppError(400, 'INSUFFICIENT_BALANCE', 'Insufficient available balance');
      }

      const row = result[0];

      // Record ledger entry
      await this.db.insert(balanceLedgerEntries).values({
        userId,
        asset,
        entryType: 'bet_lock',
        amount: -amount,
        balanceAfter: row.available_amount,
        referenceType: ref.type,
        referenceId: ref.id,
      });

      return {
        available: row.available_amount,
        locked: row.locked_amount,
      };
    } finally {
      await redis.del(lockKey);
    }
  }

  // ─── Release Funds (bet cancel / refund) ─────────────────

  async releaseFunds(userId: string, amount: number, asset: string, ref: LedgerRef) {
    await this.db.execute(sql`
      UPDATE balances
      SET available_amount = available_amount + ${amount},
          locked_amount = locked_amount - ${amount},
          updated_at = now()
      WHERE user_id = ${userId}
        AND asset = ${asset}
        AND locked_amount >= ${amount}
    `);

    const bal = await this.db.query.balances.findFirst({
      where: and(eq(balances.userId, userId), eq(balances.asset, asset)),
    });

    await this.db.insert(balanceLedgerEntries).values({
      userId,
      asset,
      entryType: 'bet_unlock',
      amount: amount,
      balanceAfter: bal?.availableAmount ?? 0,
      referenceType: ref.type,
      referenceId: ref.id,
    });
  }

  // ─── Settle Payout ───────────────────────────────────────

  async settlePayout(
    userId: string,
    betAmount: number,
    fee: number,
    payoutAmount: number,
    asset: string,
    ref: LedgerRef,
  ) {
    const totalLocked = betAmount + fee;

    // Unlock bet + credit payout in one go
    // Guard: only update if locked_amount is sufficient (prevents double-settlement)
    const result = await this.db.execute(sql`
      UPDATE balances
      SET locked_amount = locked_amount - ${totalLocked},
          available_amount = available_amount + ${payoutAmount},
          updated_at = now()
      WHERE user_id = ${userId}
        AND asset = ${asset}
        AND locked_amount >= ${totalLocked}
      RETURNING available_amount, locked_amount
    `) as unknown as { available_amount: number; locked_amount: number }[];

    // If no row was returned, the settlement failed (already processed or insufficient locked funds)
    if (!result || result.length === 0) {
      throw new AppError(409, 'SETTLEMENT_FAILED', `Settlement skipped — insufficient locked funds for user ${userId}, ref ${ref.type}:${ref.id}`);
    }

    const bal = await this.db.query.balances.findFirst({
      where: and(eq(balances.userId, userId), eq(balances.asset, asset)),
    });

    // Ledger: unlock
    await this.db.insert(balanceLedgerEntries).values({
      userId,
      asset,
      entryType: 'bet_settle',
      amount: -totalLocked,
      balanceAfter: bal?.availableAmount ?? 0,
      referenceType: ref.type,
      referenceId: ref.id,
    });

    // Ledger: payout credit
    if (payoutAmount > 0) {
      await this.db.insert(balanceLedgerEntries).values({
        userId,
        asset,
        entryType: 'payout_credit',
        amount: payoutAmount,
        balanceAfter: bal?.availableAmount ?? 0,
        referenceType: ref.type,
        referenceId: ref.id,
      });
    }
  }

  // ─── Credit Deposit ──────────────────────────────────────

  async creditDeposit(userId: string, amount: number, asset: string, depositId: string) {
    // L3 fix: Upsert balance row to handle missing balance rows
    const result = await this.db.execute(sql`
      INSERT INTO balances (user_id, asset, available_amount, locked_amount, pending_amount)
      VALUES (${userId}, ${asset}, ${amount}, 0, 0)
      ON CONFLICT (user_id, asset)
      DO UPDATE SET available_amount = balances.available_amount + ${amount},
                    updated_at = now()
      RETURNING available_amount
    `) as unknown as { available_amount: number }[];

    const balanceAfter = result?.[0]?.available_amount ?? amount;

    await this.db.insert(balanceLedgerEntries).values({
      userId,
      asset,
      entryType: 'deposit_confirmed',
      amount,
      balanceAfter,
      referenceType: 'deposit',
      referenceId: depositId,
    });

    // ── 100% First Deposit Bonus ──
    // If user hasn't received deposit bonus yet, match 100% of this deposit
    try {
      const user = await this.db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (user && !user.bonusClaimed) {
        // Apply 100% bonus (same amount as deposit)
        const bonusAmount = amount;

        await this.db.execute(sql`
          UPDATE balances
          SET available_amount = available_amount + ${bonusAmount},
              bonus_amount = COALESCE(bonus_amount, 0) + ${bonusAmount},
              updated_at = now()
          WHERE user_id = ${userId} AND asset = ${asset}
        `);

        // Mark bonus as used
        await this.db.execute(sql`
          UPDATE users SET bonus_claimed = true, updated_at = now()
          WHERE id = ${userId}
        `);

        // Get updated balance for ledger
        const updatedBal = await this.db.query.balances.findFirst({
          where: and(eq(balances.userId, userId), eq(balances.asset, asset)),
        });

        // Record bonus ledger entry
        await this.db.insert(balanceLedgerEntries).values({
          userId,
          asset,
          entryType: 'signup_bonus',
          amount: bonusAmount,
          balanceAfter: updatedBal?.availableAmount ?? balanceAfter + bonusAmount,
          referenceType: 'bonus',
          referenceId: `deposit-bonus-${depositId}`,
          metadata: { bonusType: 'first_deposit_100pct', depositAmount: amount, bonusAmount },
        });

        console.log(`[DepositBonus] Applied 100% bonus of ${bonusAmount} lamports to user ${userId}`);
      }
    } catch (err) {
      // Don't fail the deposit if bonus fails
      console.error(`[DepositBonus] Failed to apply bonus for user ${userId}:`, err);
    }
  }

  // ─── Transactions ────────────────────────────────────────

  async getTransactions(userId: string, limit: number = 20, cursor?: string) {
    const entries = await this.db.query.balanceLedgerEntries.findMany({
      where: eq(balanceLedgerEntries.userId, userId),
      orderBy: [desc(balanceLedgerEntries.createdAt)],
      limit: limit + 1,
    });

    const hasMore = entries.length > limit;
    const data = entries.slice(0, limit);

    return {
      data: data.map(e => ({
        id: String(e.id),
        type: e.entryType,
        asset: e.asset,
        amount: String(e.amount),
        balanceAfter: String(e.balanceAfter),
        referenceType: e.referenceType,
        referenceId: e.referenceId,
        createdAt: e.createdAt.toISOString(),
      })),
      hasMore,
      cursor: hasMore ? String(data[data.length - 1].id) : undefined,
    };
  }

  // ─── Linked Wallets ──────────────────────────────────────

  async getLinkedWallets(userId: string) {
    return this.db.query.linkedWallets.findMany({
      where: eq(linkedWallets.userId, userId),
    });
  }

  // ─── Settle Withdrawal ──────────────────────────────────

  async settleWithdrawal(userId: string, totalAmount: number, asset: string, withdrawalId: string) {
    await this.db.execute(sql`
      UPDATE balances
      SET locked_amount = locked_amount - ${totalAmount},
          updated_at = now()
      WHERE user_id = ${userId}
        AND asset = ${asset}
        AND locked_amount >= ${totalAmount}
    `);

    const bal = await this.db.query.balances.findFirst({
      where: and(eq(balances.userId, userId), eq(balances.asset, asset)),
    });

    await this.db.insert(balanceLedgerEntries).values({
      userId,
      asset,
      entryType: 'withdraw_complete',
      amount: -totalAmount,
      balanceAfter: bal?.availableAmount ?? 0,
      referenceType: 'withdrawal',
      referenceId: withdrawalId,
    });
  }

  // ─── Bonus: Get bonus status ────────────────────────────

  async getBonusStatus(userId: string): Promise<{
    claimed: boolean;
    bonusAmount: number;
    profitRequired: number;
    currentProfit: number;
    withdrawalUnlocked: boolean;
  }> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    const bal = await this.db.query.balances.findFirst({
      where: and(eq(balances.userId, userId), eq(balances.asset, 'SOL')),
    });

    const profile = await this.db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
    });

    const totalWagered = profile?.totalWagered ?? 0;
    const totalWon = profile?.totalWon ?? 0;
    const currentProfit = totalWon - totalWagered;
    const bonusAmount = bal?.bonusAmount ?? 0;
    const withdrawalUnlocked = bonusAmount === 0 || currentProfit >= BONUS_PROFIT_THRESHOLD;

    return {
      claimed: user?.bonusClaimed ?? false,
      bonusAmount,
      profitRequired: BONUS_PROFIT_THRESHOLD,
      currentProfit,
      withdrawalUnlocked,
    };
  }

  // ─── Bonus: Check withdrawal eligibility ────────────────

  async checkWithdrawalEligibility(userId: string, requestedAmount: number): Promise<{
    eligible: boolean;
    maxWithdrawable: number;
    reason?: string;
  }> {
    const bal = await this.db.query.balances.findFirst({
      where: and(eq(balances.userId, userId), eq(balances.asset, 'SOL')),
    });

    if (!bal) {
      return { eligible: false, maxWithdrawable: 0, reason: 'No balance found' };
    }

    const bonusAmount = bal.bonusAmount ?? 0;
    const availableAmount = bal.availableAmount;

    // If no bonus, full balance is withdrawable
    if (bonusAmount === 0) {
      return { eligible: requestedAmount <= availableAmount, maxWithdrawable: availableAmount };
    }

    // Check profit threshold
    const profile = await this.db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
    });

    const totalWagered = profile?.totalWagered ?? 0;
    const totalWon = profile?.totalWon ?? 0;
    const currentProfit = totalWon - totalWagered;

    if (currentProfit >= BONUS_PROFIT_THRESHOLD) {
      // Profit threshold met! Unlock bonus — clear it from balance tracking
      await this.db.execute(sql`
        UPDATE balances SET bonus_amount = 0, updated_at = now()
        WHERE user_id = ${userId} AND asset = 'SOL'
      `);
      return { eligible: requestedAmount <= availableAmount, maxWithdrawable: availableAmount };
    }

    // Profit threshold not met — only allow withdrawal of non-bonus funds
    const withdrawable = Math.max(0, availableAmount - bonusAmount);
    if (requestedAmount > withdrawable) {
      return {
        eligible: false,
        maxWithdrawable: withdrawable,
        reason: `Your deposit bonus is locked until you earn 1 SOL in profit. Current profit: ${(currentProfit / 1_000_000_000).toFixed(4)} SOL`,
      };
    }

    return { eligible: true, maxWithdrawable: withdrawable };
  }

}
