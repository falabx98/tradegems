/**
 * Settlement failure recording and recovery.
 * When a payout settlement fails, record it here so it can be retried by admin.
 */

import { eq, sql } from 'drizzle-orm';
import { failedSettlements } from '@tradingarena/db';
import { getDb } from '../config/database.js';
import { WalletService } from '../modules/wallet/wallet.service.js';
import { auditLog } from './auditLog.js';
import { recordOpsAlert } from './opsAlert.js';

interface SettlementFailure {
  userId: string;
  game: string;
  gameRefType: string;
  gameRefId: string;
  betAmount: number;
  fee: number;
  payoutAmount: number;
  errorMessage: string;
  metadata?: Record<string, unknown>;
}

/**
 * Record a failed settlement for later recovery.
 * This NEVER throws — it's a safety net, not a critical path.
 */
export async function recordFailedSettlement(failure: SettlementFailure): Promise<void> {
  try {
    const db = getDb();
    await db.insert(failedSettlements).values({
      userId: failure.userId,
      game: failure.game,
      gameRefType: failure.gameRefType,
      gameRefId: failure.gameRefId,
      betAmount: failure.betAmount,
      fee: failure.fee,
      payoutAmount: failure.payoutAmount,
      errorMessage: failure.errorMessage,
      metadata: failure.metadata ?? {},
    });
    // Fire ops alert for operator visibility
    await recordOpsAlert({
      severity: 'critical',
      category: 'settlement_failure',
      message: `Settlement failed: ${failure.errorMessage}`,
      userId: failure.userId,
      game: failure.game,
      metadata: { gameRefId: failure.gameRefId, betAmount: failure.betAmount, payoutAmount: failure.payoutAmount },
    });

    auditLog({
      action: 'settlement_failure_recorded',
      userId: failure.userId,
      game: failure.game,
      gameId: failure.gameRefId,
      betAmount: failure.betAmount,
      payoutAmount: failure.payoutAmount,
      status: 'failed',
      error: failure.errorMessage,
    });
  } catch (err) {
    // Last resort — log to console so it's at least in Railway logs
    console.error('[CRITICAL] Failed to record settlement failure:', JSON.stringify(failure), err);
  }
}

/**
 * Retry a pending failed settlement. Called by admin.
 * Returns the result of the retry attempt.
 */
export async function retrySettlement(failedId: string, adminUserId: string): Promise<{ success: boolean; error?: string }> {
  const db = getDb();

  const [record] = await db
    .select()
    .from(failedSettlements)
    .where(eq(failedSettlements.id, failedId))
    .limit(1);

  if (!record) return { success: false, error: 'Record not found' };
  if (record.status !== 'pending') return { success: false, error: `Status is ${record.status}, not pending` };

  const walletService = new WalletService();
  const ref = { type: record.gameRefType, id: record.gameRefId };

  // Track retry count
  const currentRetries = ((record.metadata as any)?.retryCount ?? 0) as number;
  const newRetryCount = currentRetries + 1;

  try {
    await walletService.settlePayout(
      record.userId,
      record.betAmount,
      record.fee,
      record.payoutAmount,
      'SOL',
      ref,
    );

    // Mark as resolved
    await db.update(failedSettlements).set({
      status: 'resolved',
      resolvedBy: adminUserId,
      resolvedAt: new Date(),
      metadata: sql`jsonb_set(COALESCE(metadata, '{}'), '{retryCount}', ${String(newRetryCount)}::jsonb)`,
    }).where(eq(failedSettlements.id, failedId));

    auditLog({
      action: 'settlement_retry_success',
      userId: record.userId,
      game: record.game,
      gameId: record.gameRefId,
      payoutAmount: record.payoutAmount,
      status: 'success',
      meta: { retryBy: adminUserId, retryCount: newRetryCount },
    });

    return { success: true };
  } catch (err: any) {
    // Update retry count and last error, keep pending
    await db.update(failedSettlements).set({
      status: 'pending',
      metadata: sql`jsonb_set(jsonb_set(COALESCE(metadata, '{}'), '{retryCount}', ${String(newRetryCount)}::jsonb), '{lastRetryError}', ${JSON.stringify(err.message)}::jsonb)`,
    }).where(eq(failedSettlements.id, failedId));

    auditLog({
      action: 'settlement_retry_failed',
      userId: record.userId,
      game: record.game,
      gameId: record.gameRefId,
      status: 'failed',
      error: err.message,
      meta: { retryBy: adminUserId, retryCount: newRetryCount },
    });

    // Alert if retry keeps failing (3+ failures)
    if (newRetryCount >= 3) {
      await recordOpsAlert({
        severity: 'critical',
        category: 'settlement_retry_failure',
        message: `Settlement retry failed ${newRetryCount} times for ${record.game} ref=${record.gameRefId}`,
        userId: record.userId,
        game: record.game,
        metadata: { failedSettlementId: failedId, retryCount: newRetryCount, lastError: err.message },
      });
    }

    return { success: false, error: err.message };
  }
}
