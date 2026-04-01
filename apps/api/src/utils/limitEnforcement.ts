/**
 * Responsible Gambling Limit Enforcement
 *
 * Checks deposit limits and loss limits against user_limits table.
 * Called from creditDeposit (deposit limits) and lockFunds (loss limits).
 */

import { eq, and, gte, sql } from 'drizzle-orm';
import { userLimits, deposits, balanceLedgerEntries } from '@tradingarena/db';
import { getDb } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

// ─── Time Window Helpers ────────────────────────────────────

function startOfDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1)); // Monday
  return d;
}

function startOfMonth(): Date {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ─── Deposit Limit Check ────────────────────────────────────

export async function checkDepositLimits(userId: string, depositAmount: number): Promise<void> {
  const db = getDb();

  // Get all deposit limits for this user
  const limits = await db
    .select()
    .from(userLimits)
    .where(eq(userLimits.userId, userId));

  if (limits.length === 0) return; // No limits set

  for (const limit of limits) {
    if (!['daily_deposit', 'weekly_deposit', 'monthly_deposit'].includes(limit.limitType)) continue;

    // Use the pending amount if a limit raise is scheduled and effective
    const effectiveAmount = (limit.pendingAmount && limit.pendingEffectiveAt && limit.pendingEffectiveAt <= new Date())
      ? limit.pendingAmount
      : limit.amount;

    // Determine time window
    let windowStart: Date;
    let periodLabel: string;
    if (limit.limitType === 'daily_deposit') {
      windowStart = startOfDay();
      periodLabel = 'daily';
    } else if (limit.limitType === 'weekly_deposit') {
      windowStart = startOfWeek();
      periodLabel = 'weekly';
    } else {
      windowStart = startOfMonth();
      periodLabel = 'monthly';
    }

    // Sum confirmed deposits in this window
    const [result] = await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM deposits
      WHERE user_id = ${userId}
        AND status = 'confirmed'
        AND confirmed_at >= ${windowStart}
    `) as unknown as [{ total: number }];

    const totalDeposited = Number(result?.total ?? 0);

    if (totalDeposited + depositAmount > effectiveAmount) {
      const remaining = Math.max(0, effectiveAmount - totalDeposited);
      const limitSol = (effectiveAmount / 1e9).toFixed(2);
      const remainingSol = (remaining / 1e9).toFixed(4);
      throw new AppError(400, 'DEPOSIT_LIMIT_EXCEEDED',
        `You've reached your ${periodLabel} deposit limit of ${limitSol} SOL. Remaining: ${remainingSol} SOL.`
      );
    }
  }
}

// ─── Loss Limit Check ───────────────────────────────────────

export async function checkLossLimit(userId: string, betAmount: number): Promise<void> {
  const db = getDb();

  // Check for daily_loss limit
  const [lossLimit] = await db
    .select()
    .from(userLimits)
    .where(and(eq(userLimits.userId, userId), eq(userLimits.limitType, 'daily_loss')));

  if (!lossLimit) return; // No loss limit set

  const effectiveAmount = (lossLimit.pendingAmount && lossLimit.pendingEffectiveAt && lossLimit.pendingEffectiveAt <= new Date())
    ? lossLimit.pendingAmount
    : lossLimit.amount;

  const today = startOfDay();

  // Calculate net losses today from ledger entries
  // Net loss = sum of negative entries (bets lost) - sum of positive entries (payouts won)
  // We look at bet_settle (negative = amount locked deducted) and payout_credit (positive = winnings)
  const [result] = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN entry_type = 'bet_settle' THEN ABS(amount) ELSE 0 END), 0) AS total_bet,
      COALESCE(SUM(CASE WHEN entry_type = 'payout_credit' THEN amount ELSE 0 END), 0) AS total_payout
    FROM balance_ledger_entries
    WHERE user_id = ${userId}
      AND created_at >= ${today}
      AND entry_type IN ('bet_settle', 'payout_credit')
  `) as unknown as [{ total_bet: number; total_payout: number }];

  const totalBet = Number(result?.total_bet ?? 0);
  const totalPayout = Number(result?.total_payout ?? 0);
  const netLoss = Math.max(0, totalBet - totalPayout);

  // Check if adding this bet would exceed the loss limit
  // We assume worst case: the bet is a total loss
  if (netLoss + betAmount > effectiveAmount) {
    const limitSol = (effectiveAmount / 1e9).toFixed(2);
    throw new AppError(403, 'LOSS_LIMIT_EXCEEDED',
      `Daily loss limit reached (${limitSol} SOL). Games will be available tomorrow.`
    );
  }
}
