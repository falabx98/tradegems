import { PublicKey } from '@solana/web3.js';
import { eq, and, sql } from 'drizzle-orm';
import { withdrawals } from '@tradingarena/db';
import { getDb } from '../../config/database.js';
import { getRedis } from '../../config/redis.js';
import { WalletService } from '../wallet/wallet.service.js';
import { SolanaService } from './solana.service.js';
import { AppError } from '../../middleware/errorHandler.js';
import { env } from '../../config/env.js';
import { recordOpsAlert } from '../../utils/opsAlert.js';

export class WithdrawalService {
  private db = getDb();
  private solanaService = new SolanaService();
  private walletService = new WalletService();

  /**
   * Queue a withdrawal request. Funds are locked immediately,
   * but on-chain transfer is delayed by WITHDRAWAL_DELAY_HOURS.
   *
   * Status flow: pending → processing → completed | delayed | failed
   *
   * Returns an immediate response to the user with queue confirmation.
   */
  async queueWithdrawal(userId: string, amountLamports: number, destination: string) {
    // Validate destination address
    try {
      new PublicKey(destination);
    } catch {
      throw new AppError(400, 'INVALID_ADDRESS', 'Invalid Solana destination address');
    }

    const fee = env.WITHDRAWAL_FEE_LAMPORTS;
    const totalDeduction = amountLamports + fee;

    if (amountLamports < 10_000_000) { // 0.01 SOL minimum
      throw new AppError(400, 'AMOUNT_TOO_LOW', 'Minimum withdrawal is 0.01 SOL');
    }

    const redis = getRedis();
    const lockKey = `lock:withdrawal:${userId}`;
    const acquired = await redis.set(lockKey, '1', 'EX', 60, 'NX');
    if (!acquired) {
      throw new AppError(409, 'WITHDRAWAL_IN_PROGRESS', 'A withdrawal is already being processed');
    }

    try {
      // Lock funds (amount + fee) — prevents user from spending during delay
      await this.walletService.lockFunds(userId, totalDeduction, 'SOL', {
        type: 'withdrawal',
        id: 'pending',
      });

      // Insert withdrawal with status 'pending'
      const [withdrawal] = await this.db.insert(withdrawals).values({
        userId,
        asset: 'SOL',
        amount: amountLamports,
        fee,
        destination,
        status: 'pending',
      }).returning();

      // Store process_after timestamp in Redis
      const delayHours = env.WITHDRAWAL_DELAY_HOURS;
      const processAfter = new Date(Date.now() + delayHours * 60 * 60 * 1000);
      await redis.set(
        `withdrawal:process_after:${withdrawal.id}`,
        processAfter.toISOString(),
        'EX', Math.max(delayHours * 3600 + 7200, 86400), // TTL = delay + 2h buffer
      );

      // Publish queued notification for user
      await this.publishNotification(userId, withdrawal.id, 'pending', {
        amount: amountLamports,
        estimatedCompletionHours: delayHours,
      });

      const solAmount = (amountLamports / 1e9).toFixed(4);
      return {
        id: withdrawal.id,
        status: 'pending',
        amount: String(amountLamports),
        fee: String(fee),
        asset: 'SOL',
        processAfter: processAfter.toISOString(),
        estimatedCompletion: processAfter.toISOString(),
        message: `Your withdrawal of ${solAmount} SOL has been queued. Processing typically takes ${delayHours} hours. You'll receive a confirmation when complete.`,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      try {
        await this.walletService.releaseFunds(userId, totalDeduction, 'SOL', {
          type: 'withdrawal',
          id: 'queue-failed',
        });
      } catch { /* best effort */ }
      throw err;
    } finally {
      await redis.del(lockKey);
    }
  }

  /**
   * Process a single pending withdrawal (called by worker).
   * Sends SOL on-chain and settles the withdrawal.
   */
  async processPendingWithdrawal(withdrawalId: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const [withdrawal] = await this.db.select().from(withdrawals).where(eq(withdrawals.id, withdrawalId));
    if (!withdrawal) return { success: false, error: 'Withdrawal not found' };
    if (withdrawal.status !== 'pending') return { success: false, error: `Invalid status: ${withdrawal.status}` };

    const totalDeduction = withdrawal.amount + withdrawal.fee;

    // Mark as processing
    await this.db.update(withdrawals)
      .set({ status: 'processing' })
      .where(eq(withdrawals.id, withdrawalId));

    await this.publishNotification(withdrawal.userId, withdrawalId, 'processing');

    try {
      // Send SOL on-chain
      const result = await this.solanaService.sendSol(withdrawal.destination, withdrawal.amount);

      if (result.success) {
        await this.db.update(withdrawals)
          .set({
            txHash: result.txHash,
            status: 'completed',
            completedAt: new Date(),
          })
          .where(eq(withdrawals.id, withdrawalId));

        await this.walletService.settleWithdrawal(
          withdrawal.userId,
          totalDeduction,
          'SOL',
          withdrawalId,
        );

        await this.publishNotification(withdrawal.userId, withdrawalId, 'completed', {
          txHash: result.txHash,
          amount: withdrawal.amount,
        });

        return { success: true, txHash: result.txHash };
      } else {
        // On-chain failed — revert to pending for retry
        await this.db.update(withdrawals)
          .set({ status: 'pending' })
          .where(eq(withdrawals.id, withdrawalId));

        recordOpsAlert({
          severity: 'warning',
          category: 'withdrawal_failed',
          message: `Withdrawal ${withdrawalId} failed on-chain: ${result.error}. Reverted to pending for retry.`,
          userId: withdrawal.userId,
          metadata: { withdrawalId, amount: withdrawal.amount, destination: withdrawal.destination, error: result.error },
        }).catch(() => {});

        await this.publishNotification(withdrawal.userId, withdrawalId, 'failed', {
          error: 'On-chain transfer failed. Your withdrawal has been re-queued for retry.',
        });

        return { success: false, error: result.error };
      }
    } catch (err: any) {
      await this.db.update(withdrawals)
        .set({ status: 'pending' })
        .where(eq(withdrawals.id, withdrawalId));

      recordOpsAlert({
        severity: 'critical',
        category: 'withdrawal_failed',
        message: `Withdrawal ${withdrawalId} threw unexpected error: ${err.message}`,
        userId: withdrawal.userId,
        metadata: { withdrawalId, error: err.message },
      }).catch(() => {});

      return { success: false, error: err.message };
    }
  }

  /**
   * Mark a pending withdrawal as delayed (insufficient liquidity).
   * Sets status to 'delayed' and schedules retry in 1 hour.
   */
  async markDelayed(withdrawalId: string, reason: string): Promise<void> {
    await this.db.update(withdrawals)
      .set({ status: 'delayed' })
      .where(eq(withdrawals.id, withdrawalId));

    // Schedule retry: 1 hour from now
    const redis = getRedis();
    const retryAt = new Date(Date.now() + 3600 * 1000);
    await redis.set(
      `withdrawal:process_after:${withdrawalId}`,
      retryAt.toISOString(),
      'EX', 7200,
    );
  }

  /**
   * Cancel a pending withdrawal (user-initiated, before processing).
   * Releases locked funds back to user's available balance.
   */
  async cancelPendingWithdrawal(userId: string, withdrawalId: string): Promise<void> {
    const [withdrawal] = await this.db.select().from(withdrawals)
      .where(and(eq(withdrawals.id, withdrawalId), eq(withdrawals.userId, userId)));

    if (!withdrawal) {
      throw new AppError(404, 'NOT_FOUND', 'Withdrawal not found');
    }

    if (withdrawal.status !== 'pending' && withdrawal.status !== 'delayed') {
      throw new AppError(400, 'CANNOT_CANCEL', `Cannot cancel withdrawal with status '${withdrawal.status}'. Only pending or delayed withdrawals can be cancelled.`);
    }

    const totalDeduction = withdrawal.amount + withdrawal.fee;

    await this.walletService.releaseFunds(userId, totalDeduction, 'SOL', {
      type: 'withdrawal',
      id: `cancel-${withdrawalId}`,
    });

    await this.db.update(withdrawals)
      .set({ status: 'cancelled' })
      .where(eq(withdrawals.id, withdrawalId));

    try {
      const redis = getRedis();
      await redis.del(`withdrawal:process_after:${withdrawalId}`);
    } catch { /* best effort */ }

    await this.publishNotification(userId, withdrawalId, 'cancelled');
  }

  /**
   * Get pending/delayed withdrawals ready for processing (delay expired).
   */
  async getReadyWithdrawals(limit: number = 10): Promise<Array<{ id: string; userId: string; amount: number; fee: number; destination: string; createdAt: Date }>> {
    const redis = getRedis();
    const now = new Date();

    // Get all pending + delayed withdrawals
    const pending = await this.db.select()
      .from(withdrawals)
      .where(sql`status IN ('pending', 'delayed')`)
      .limit(50);

    const ready: typeof pending = [];

    for (const w of pending) {
      const processAfterStr = await redis.get(`withdrawal:process_after:${w.id}`);
      if (processAfterStr) {
        const processAfter = new Date(processAfterStr);
        if (processAfter <= now) {
          ready.push(w);
        }
      } else {
        // No Redis key — check creation time + delay as fallback
        const createdAt = new Date(w.createdAt);
        const processAfter = new Date(createdAt.getTime() + env.WITHDRAWAL_DELAY_HOURS * 3600 * 1000);
        if (processAfter <= now) {
          ready.push(w);
        }
      }

      if (ready.length >= limit) break;
    }

    return ready.map(w => ({
      id: w.id,
      userId: w.userId,
      amount: w.amount,
      fee: w.fee,
      destination: w.destination,
      createdAt: w.createdAt,
    }));
  }

  /**
   * Get a single withdrawal by ID for the given user.
   */
  async getWithdrawalById(userId: string, withdrawalId: string) {
    const [w] = await this.db.select().from(withdrawals)
      .where(and(eq(withdrawals.id, withdrawalId), eq(withdrawals.userId, userId)));

    if (!w) throw new AppError(404, 'NOT_FOUND', 'Withdrawal not found');

    // Compute estimated completion
    let estimatedCompletion: string | null = null;
    if (w.status === 'pending' || w.status === 'delayed') {
      try {
        const redis = getRedis();
        const processAfterStr = await redis.get(`withdrawal:process_after:${w.id}`);
        estimatedCompletion = processAfterStr ?? new Date(new Date(w.createdAt).getTime() + env.WITHDRAWAL_DELAY_HOURS * 3600 * 1000).toISOString();
      } catch {
        estimatedCompletion = new Date(new Date(w.createdAt).getTime() + env.WITHDRAWAL_DELAY_HOURS * 3600 * 1000).toISOString();
      }
    }

    return {
      id: w.id,
      amount: w.amount,
      fee: w.fee,
      status: w.status,
      destination: w.destination,
      txHash: w.txHash,
      createdAt: w.createdAt,
      processedAt: w.completedAt,
      estimatedCompletion,
    };
  }

  /**
   * Get withdrawal history for a user.
   */
  async getUserWithdrawals(userId: string, limit: number = 10) {
    return this.db.select()
      .from(withdrawals)
      .where(eq(withdrawals.userId, userId))
      .orderBy(sql`created_at DESC`)
      .limit(limit);
  }

  // ─── Notifications ──────────────────────────────────────────

  private async publishNotification(
    userId: string,
    withdrawalId: string,
    status: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const redis = getRedis();
      const notification = {
        type: 'withdrawal.status',
        withdrawalId,
        status,
        timestamp: Date.now(),
        ...data,
      };
      // Publish for real-time WS listeners
      await redis.publish(`withdrawal:notifications:${userId}`, JSON.stringify(notification));
      // Store in list for polling
      const listKey = `withdrawal:history:${userId}`;
      await redis.lpush(listKey, JSON.stringify(notification));
      await redis.ltrim(listKey, 0, 49);
      await redis.expire(listKey, 172_800); // 48h
    } catch { /* non-critical */ }
  }

  // ─── Legacy: Immediate withdrawal (kept for admin override) ──

  async requestWithdrawal(userId: string, amountLamports: number, destination: string) {
    try { new PublicKey(destination); } catch {
      throw new AppError(400, 'INVALID_ADDRESS', 'Invalid Solana destination address');
    }

    const fee = env.WITHDRAWAL_FEE_LAMPORTS;
    const totalDeduction = amountLamports + fee;

    if (amountLamports < 10_000_000) {
      throw new AppError(400, 'AMOUNT_TOO_LOW', 'Minimum withdrawal is 0.01 SOL');
    }

    const redis = getRedis();
    const lockKey = `lock:withdrawal:${userId}`;
    const acquired = await redis.set(lockKey, '1', 'EX', 60, 'NX');
    if (!acquired) {
      throw new AppError(409, 'WITHDRAWAL_IN_PROGRESS', 'A withdrawal is already being processed');
    }

    try {
      await this.walletService.lockFunds(userId, totalDeduction, 'SOL', {
        type: 'withdrawal', id: 'pending',
      });

      const [withdrawal] = await this.db.insert(withdrawals).values({
        userId, asset: 'SOL', amount: amountLamports, fee, destination, status: 'processing',
      }).returning();

      const result = await this.solanaService.sendSol(destination, amountLamports);

      if (result.success) {
        await this.db.update(withdrawals)
          .set({ txHash: result.txHash, status: 'completed', completedAt: new Date() })
          .where(eq(withdrawals.id, withdrawal.id));
        await this.walletService.settleWithdrawal(userId, totalDeduction, 'SOL', withdrawal.id);
        return { id: withdrawal.id, status: 'completed', amount: String(amountLamports), fee: String(fee), txHash: result.txHash, asset: 'SOL' };
      } else {
        await this.walletService.releaseFunds(userId, totalDeduction, 'SOL', { type: 'withdrawal', id: withdrawal.id });
        await this.db.update(withdrawals).set({ status: 'failed' }).where(eq(withdrawals.id, withdrawal.id));
        throw new AppError(500, 'WITHDRAWAL_FAILED', result.error || 'Failed to send SOL');
      }
    } finally {
      await redis.del(lockKey);
    }
  }
}
