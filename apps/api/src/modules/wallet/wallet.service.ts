import { eq, and, sql, desc } from 'drizzle-orm';
import { balances, balanceLedgerEntries, deposits, withdrawals, linkedWallets, users, userProfiles } from '@tradingarena/db';
import { getDb } from '../../config/database.js';
import { getRedis } from '../../config/redis.js';
import { AppError } from '../../middleware/errorHandler.js';
import { auditLog } from '../../utils/auditLog.js';
import { withSettlementGuard } from '../../utils/idempotency.js';

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

      return [{ asset: 'SOL', available: 0, locked: 0, pending: 0, total: 0 }];
    }

    return rows.map(r => ({
      asset: r.asset,
      available: r.availableAmount,
      locked: r.lockedAmount,
      pending: r.pendingAmount ?? 0,
      total: r.availableAmount + r.lockedAmount,
    }));
  }

  async getBalance(userId: string, asset: string = 'SOL') {
    const row = await this.db.query.balances.findFirst({
      where: and(eq(balances.userId, userId), eq(balances.asset, asset)),
    });
    return row?.availableAmount ?? 0;
  }

  // ─── Lock Funds (for bet placement) ──────────────────────
  // ATOMIC: Redis lock + DB transaction (balance update + ledger) in one commit

  async lockFunds(userId: string, amount: number, asset: string, ref: LedgerRef) {
    // Enforce loss limits (fire-and-forget on error, never block for non-limit failures)
    try {
      const { checkLossLimit } = await import('../../utils/limitEnforcement.js');
      await checkLossLimit(userId, amount);
    } catch (err) {
      if (err instanceof AppError && err.code === 'LOSS_LIMIT_EXCEEDED') throw err;
      // Non-limit errors: log but don't block
      console.error('[LossLimit] Check failed:', err);
    }
    const redis = getRedis();
    const lockKey = `lock:balance:${userId}:${asset}`;
    const acquired = await redis.set(lockKey, '1', 'EX', 5, 'NX');
    if (!acquired) {
      auditLog({ action: 'lock_funds', userId, betAmount: amount, status: 'failed', error: 'BALANCE_LOCKED', meta: { ref: `${ref.type}:${ref.id}` } });
      throw new AppError(409, 'BALANCE_LOCKED', 'Balance operation in progress');
    }

    try {
      return await this.db.transaction(async (tx) => {
        // 1. Atomically update balance with guard
        const result = await tx.execute(sql`
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
          auditLog({ action: 'lock_funds', userId, betAmount: amount, status: 'failed', error: 'INSUFFICIENT_BALANCE', meta: { ref: `${ref.type}:${ref.id}` } });
          throw new AppError(400, 'INSUFFICIENT_BALANCE', 'Insufficient available balance');
        }

        const row = result[0];

        // 2. Ledger entry in same transaction
        await tx.insert(balanceLedgerEntries).values({
          userId,
          asset,
          entryType: 'bet_lock',
          amount: -amount,
          balanceAfter: row.available_amount,
          referenceType: ref.type,
          referenceId: ref.id,
        });

        auditLog({ action: 'lock_funds', userId, betAmount: amount, status: 'success', meta: { ref: `${ref.type}:${ref.id}` } });

        return {
          available: row.available_amount,
          locked: row.locked_amount,
        };
      });
    } finally {
      await redis.del(lockKey);
    }
  }

  // ─── Release Funds (bet cancel / refund) ─────────────────
  // ATOMIC: balance update + ledger in one transaction

  async releaseFunds(userId: string, amount: number, asset: string, ref: LedgerRef) {
    await this.db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        UPDATE balances
        SET available_amount = available_amount + ${amount},
            locked_amount = locked_amount - ${amount},
            updated_at = now()
        WHERE user_id = ${userId}
          AND asset = ${asset}
          AND locked_amount >= ${amount}
        RETURNING available_amount
      `) as unknown as { available_amount: number }[];

      if (!result || result.length === 0) {
        throw new AppError(409, 'RELEASE_FAILED', `Release failed — insufficient locked funds for user ${userId}, ref ${ref.type}:${ref.id}`);
      }

      await tx.insert(balanceLedgerEntries).values({
        userId,
        asset,
        entryType: 'bet_unlock',
        amount: amount,
        balanceAfter: result[0].available_amount,
        referenceType: ref.type,
        referenceId: ref.id,
      });
    });
  }

  // ─── Settle Payout ───────────────────────────────────────
  // ATOMIC: balance update + all ledger entries in one transaction
  // Guard: WHERE locked_amount >= totalLocked prevents double-settlement

  async settlePayout(
    userId: string,
    betAmount: number,
    fee: number,
    payoutAmount: number,
    asset: string,
    ref: LedgerRef,
  ) {
    const totalLocked = betAmount + fee;

    // Idempotency guard: same user + game + round + amount = same key
    const { duplicate } = await withSettlementGuard(
      {
        userId,
        gameType: ref.type,
        gameId: ref.id,
        action: 'settle',
        amount: payoutAmount,
      },
      async () => {
    await this.db.transaction(async (tx) => {
      // 1. Unlock bet + credit payout atomically with guard
      const result = await tx.execute(sql`
        UPDATE balances
        SET locked_amount = locked_amount - ${totalLocked},
            available_amount = available_amount + ${payoutAmount},
            updated_at = now()
        WHERE user_id = ${userId}
          AND asset = ${asset}
          AND locked_amount >= ${totalLocked}
        RETURNING available_amount, locked_amount
      `) as unknown as { available_amount: number; locked_amount: number }[];

      if (!result || result.length === 0) {
        auditLog({ action: 'settle_payout', userId, betAmount, fee, payoutAmount, status: 'failed', error: 'INSUFFICIENT_LOCKED', meta: { ref: `${ref.type}:${ref.id}` } });
        throw new AppError(409, 'SETTLEMENT_FAILED', `Settlement skipped — insufficient locked funds for user ${userId}, ref ${ref.type}:${ref.id}`);
      }

      const bal = result[0];

      // 2. Ledger: unlock entry
      await tx.insert(balanceLedgerEntries).values({
        userId,
        asset,
        entryType: 'bet_settle',
        amount: -totalLocked,
        balanceAfter: bal.available_amount,
        referenceType: ref.type,
        referenceId: ref.id,
      });

      // 3. Ledger: payout credit entry
      if (payoutAmount > 0) {
        await tx.insert(balanceLedgerEntries).values({
          userId,
          asset,
          entryType: 'payout_credit',
          amount: payoutAmount,
          balanceAfter: bal.available_amount,
          referenceType: ref.type,
          referenceId: ref.id,
        });
      }

      auditLog({ action: 'settle_payout', userId, betAmount, fee, payoutAmount, status: 'success', meta: { ref: `${ref.type}:${ref.id}` } });
    });
    return { settled: true };
      }, // end withSettlementGuard fn
    ); // end withSettlementGuard

    if (duplicate) {
      auditLog({ action: 'settle_payout', userId, betAmount, fee, payoutAmount, status: 'skipped', meta: { ref: `${ref.type}:${ref.id}`, reason: 'idempotency_duplicate' } });
    } else {
      // Track bet for weekly race (fire-and-forget, never block settlement)
      try {
        const { WeeklyRaceService } = await import('../weekly-race/weeklyRace.service.js');
        await WeeklyRaceService.trackBet(userId, betAmount);
      } catch { /* weekly race tracking should never break settlement */ }

      // Track wager progress for bonus requirements (fire-and-forget)
      try {
        const { bonusWagerProgress } = await import('@tradingarena/db');
        const { eq, and, sql: sqlTag } = await import('drizzle-orm');
        const unfulfilled = await this.db.select({ id: bonusWagerProgress.id })
          .from(bonusWagerProgress)
          .where(and(eq(bonusWagerProgress.userId, userId), eq(bonusWagerProgress.fulfilled, false)));
        for (const entry of unfulfilled) {
          await this.db.execute(sqlTag`
            UPDATE bonus_wager_progress
            SET wager_completed_lamports = wager_completed_lamports + ${betAmount},
                fulfilled = CASE WHEN wager_completed_lamports + ${betAmount} >= wager_required_lamports THEN true ELSE false END,
                fulfilled_at = CASE WHEN wager_completed_lamports + ${betAmount} >= wager_required_lamports THEN now() ELSE NULL END
            WHERE id = ${entry.id}
          `);
        }
      } catch { /* wager tracking should never break settlement */ }
    }
  }

  // ─── Credit Deposit ──────────────────────────────────────
  // ATOMIC: upsert balance + ledger + optional bonus in one transaction

  async creditDeposit(userId: string, amount: number, asset: string, depositId: string) {
    // Enforce deposit limits (before crediting)
    try {
      const { checkDepositLimits } = await import('../../utils/limitEnforcement.js');
      await checkDepositLimits(userId, amount);
    } catch (err) {
      if (err instanceof AppError && err.code === 'DEPOSIT_LIMIT_EXCEEDED') {
        console.warn(`[DepositLimit] User ${userId} exceeded deposit limit: ${err.message}`);
        throw err; // Propagate to caller — deposit will not be credited
      }
      // Non-limit errors: log but don't block deposit
      console.error('[DepositLimit] Check failed:', err);
    }

    await this.db.transaction(async (tx) => {
      // 1. Upsert balance
      const result = await tx.execute(sql`
        INSERT INTO balances (user_id, asset, available_amount, locked_amount, pending_amount)
        VALUES (${userId}, ${asset}, ${amount}, 0, 0)
        ON CONFLICT (user_id, asset)
        DO UPDATE SET available_amount = balances.available_amount + ${amount},
                      updated_at = now()
        RETURNING available_amount
      `) as unknown as { available_amount: number }[];

      const balanceAfter = result?.[0]?.available_amount ?? amount;

      // 2. Ledger entry
      await tx.insert(balanceLedgerEntries).values({
        userId,
        asset,
        entryType: 'deposit_confirmed',
        amount,
        balanceAfter,
        referenceType: 'deposit',
        referenceId: depositId,
      });

      // 3. First deposit bonus (atomic CAS within same transaction)
      try {
        const bonusClaim = await tx.execute(sql`
          UPDATE users SET bonus_claimed = true, updated_at = now()
          WHERE id = ${userId} AND bonus_claimed = false
          RETURNING id
        `) as unknown as { id: string }[];

        if (bonusClaim && bonusClaim.length > 0) {
          const bonusAmount = amount;

          // Bonus balance update in same transaction
          const bonusResult = await tx.execute(sql`
            UPDATE balances
            SET available_amount = available_amount + ${bonusAmount},
                bonus_amount = COALESCE(bonus_amount, 0) + ${bonusAmount},
                updated_at = now()
            WHERE user_id = ${userId} AND asset = ${asset}
            RETURNING available_amount
          `) as unknown as { available_amount: number }[];

          const bonusBalanceAfter = bonusResult?.[0]?.available_amount ?? balanceAfter + bonusAmount;

          // Bonus ledger entry in same transaction
          await tx.insert(balanceLedgerEntries).values({
            userId,
            asset,
            entryType: 'signup_bonus',
            amount: bonusAmount,
            balanceAfter: bonusBalanceAfter,
            referenceType: 'bonus',
            referenceId: `deposit-bonus-${depositId}`,
            metadata: { bonusType: 'first_deposit_100pct', depositAmount: amount, bonusAmount },
          });

          console.log(`[DepositBonus] Applied 100% bonus of ${bonusAmount} lamports to user ${userId}`);
        }
      } catch (err) {
        // Don't fail the deposit if bonus fails — but since we're in a transaction,
        // we need to handle this carefully. Log but don't re-throw.
        console.error(`[DepositBonus] Failed to apply bonus for user ${userId}:`, err);
      }

      // ─── Process pending deposit matches (from bonus codes) ───
      try {
        const { pendingDepositMatches, bonusWagerProgress, bonusCodes: bonusCodesTable } = await import('@tradingarena/db');
        const pendingMatches = await tx.select()
          .from(pendingDepositMatches)
          .where(and(eq(pendingDepositMatches.userId, userId), eq(pendingDepositMatches.used, false)));

        for (const match of pendingMatches) {
          const matchAmount = Math.min(
            Math.floor(amount * match.matchPercentage / 100),
            match.maxMatchLamports > 0 ? match.maxMatchLamports : Infinity,
          );
          if (matchAmount <= 0) continue;

          // Credit match to balance
          const matchResult = await tx.execute(sql`
            UPDATE balances
            SET available_amount = available_amount + ${matchAmount},
                bonus_amount = COALESCE(bonus_amount, 0) + ${matchAmount},
                updated_at = now()
            WHERE user_id = ${userId} AND asset = ${asset}
            RETURNING available_amount
          `) as unknown as { available_amount: number }[];

          const matchBalanceAfter = matchResult?.[0]?.available_amount ?? matchAmount;

          // Ledger entry
          await tx.insert(balanceLedgerEntries).values({
            userId,
            asset,
            entryType: 'deposit_match_bonus',
            amount: matchAmount,
            balanceAfter: matchBalanceAfter,
            referenceType: 'deposit_match',
            referenceId: match.bonusCodeId,
            metadata: { matchPercentage: match.matchPercentage, depositAmount: amount, matchAmount },
          });

          // Mark match as used
          await tx.update(pendingDepositMatches).set({ used: true, usedAt: new Date() }).where(eq(pendingDepositMatches.id, match.id));

          // Create wager requirement if the bonus code has one
          const [bonusCode] = await tx.select({ wagerMultiplier: bonusCodesTable.wagerMultiplier }).from(bonusCodesTable).where(eq(bonusCodesTable.id, match.bonusCodeId));
          if (bonusCode?.wagerMultiplier && bonusCode.wagerMultiplier > 0) {
            await tx.insert(bonusWagerProgress).values({
              userId,
              bonusCodeId: match.bonusCodeId,
              bonusAmountLamports: matchAmount,
              wagerRequiredLamports: matchAmount * bonusCode.wagerMultiplier,
            });
          }

          console.log(`[DepositMatch] Applied ${match.matchPercentage}% match: ${matchAmount} lamports to user ${userId}`);
        }
      } catch (err) {
        console.error(`[DepositMatch] Failed for user ${userId}:`, err);
      }

      // Track own deposits for sponsored accounts (fire-and-forget within transaction)
      try {
        const { SponsoredService } = await import('../sponsored/sponsored.service.js');
        await SponsoredService.recordOwnDeposit(userId, amount);
      } catch { /* not sponsored or tracking failed — ok */ }
    });
  }

  // ─── Transactions (Ledger Query) ──────────────────────────

  async getTransactions(userId: string, limit: number = 20, cursor?: string) {
    const conditions = [eq(balanceLedgerEntries.userId, userId)];
    if (cursor) {
      const cursorId = parseInt(cursor, 10);
      if (!isNaN(cursorId) && cursorId > 0) {
        conditions.push(sql`${balanceLedgerEntries.id} < ${cursorId}`);
      }
    }
    const entries = await this.db.query.balanceLedgerEntries.findMany({
      where: and(...conditions),
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
  // ATOMIC: balance update + ledger in one transaction

  async settleWithdrawal(userId: string, totalAmount: number, asset: string, withdrawalId: string) {
    await this.db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        UPDATE balances
        SET locked_amount = locked_amount - ${totalAmount},
            updated_at = now()
        WHERE user_id = ${userId}
          AND asset = ${asset}
          AND locked_amount >= ${totalAmount}
        RETURNING available_amount
      `) as unknown as { available_amount: number }[];

      if (!result || result.length === 0) {
        throw new AppError(409, 'WITHDRAWAL_SETTLE_FAILED', `Withdrawal settlement failed — insufficient locked funds for user ${userId}`);
      }

      await tx.insert(balanceLedgerEntries).values({
        userId,
        asset,
        entryType: 'withdraw_complete',
        amount: -totalAmount,
        balanceAfter: result[0].available_amount,
        referenceType: 'withdrawal',
        referenceId: withdrawalId,
      });
    });
  }

  // ─── Bonus: Get bonus status ────────────────────────────

  async getBonusStatus(userId: string): Promise<{
    claimed: boolean;
    bonusAmount: number;
    withdrawalEligible: boolean;
    profitNeeded: number;
  }> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    const bal = await this.db.query.balances.findFirst({
      where: and(eq(balances.userId, userId), eq(balances.asset, 'SOL')),
    });

    const claimed = user?.bonusClaimed ?? false;
    const bonusAmount = (bal as any)?.bonusAmount ?? 0;
    const totalBalance = (bal?.availableAmount ?? 0) + (bal?.lockedAmount ?? 0);

    // Only apply bonus lock if user actually received a bonus amount
    // If bonusAmount is 0, no lock applies regardless of claimed flag
    const profitNeeded = bonusAmount > 0
      ? Math.max(0, BONUS_PROFIT_THRESHOLD - (totalBalance - bonusAmount))
      : 0;
    const withdrawalEligible = profitNeeded <= 0 || !claimed || bonusAmount <= 0;

    return {
      claimed,
      bonusAmount,
      withdrawalEligible,
      profitNeeded,
    };
  }

  // ─── Withdrawal Eligibility ───────────────────────────────

  async checkWithdrawalEligibility(userId: string, asset: string = 'SOL'): Promise<{
    eligible: boolean;
    reason?: string;
    availableToWithdraw: number;
  }> {
    const bal = await this.db.query.balances.findFirst({
      where: and(eq(balances.userId, userId), eq(balances.asset, asset)),
    });

    if (!bal || bal.availableAmount <= 0) {
      return { eligible: false, reason: 'NO_BALANCE', availableToWithdraw: 0 };
    }

    const bonusStatus = await this.getBonusStatus(userId);
    if (bonusStatus.claimed && !bonusStatus.withdrawalEligible) {
      return {
        eligible: false,
        reason: 'BONUS_LOCK',
        availableToWithdraw: 0,
      };
    }

    return { eligible: true, availableToWithdraw: bal.availableAmount };
  }
}
