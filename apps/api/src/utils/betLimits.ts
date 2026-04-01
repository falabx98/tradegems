/**
 * Server-side bet caps and exposure limits.
 * Prevents unreasonable financial exposure from a single bet or user.
 */

import { eq, and } from 'drizzle-orm';
import { balances } from '@tradingarena/db';
import { getDb } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Validate that a bet amount is within server-side limits.
 * Call this BEFORE lockFunds.
 *
 * Checks:
 * 1. betAmount does not exceed per-bet cap
 * 2. User's total locked funds after this bet don't exceed per-user cap
 */
export async function validateBetLimits(
  userId: string,
  betAmount: number,
  fee: number = 0,
): Promise<void> {
  const totalCost = betAmount + fee;

  // 1. Per-bet cap
  if (betAmount > env.MAX_BET_LAMPORTS) {
    throw new AppError(
      400,
      'BET_EXCEEDS_CAP',
      `Maximum bet is ${(env.MAX_BET_LAMPORTS / 1e9).toFixed(2)} SOL. You tried to bet ${(betAmount / 1e9).toFixed(4)} SOL.`,
    );
  }

  // 2. Per-user exposure cap — check current locked amount
  const db = getDb();
  const bal = await db.query.balances.findFirst({
    where: and(eq(balances.userId, userId), eq(balances.asset, 'SOL')),
  });

  const currentLocked = bal?.lockedAmount ?? 0;
  const projectedLocked = currentLocked + totalCost;

  if (projectedLocked > env.MAX_USER_LOCKED_LAMPORTS) {
    throw new AppError(
      400,
      'EXPOSURE_LIMIT',
      `This bet would exceed your maximum exposure limit. You have ${(currentLocked / 1e9).toFixed(4)} SOL locked. Maximum allowed: ${(env.MAX_USER_LOCKED_LAMPORTS / 1e9).toFixed(2)} SOL.`,
    );
  }
}
