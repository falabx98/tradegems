/**
 * Withdrawal Processor Worker
 *
 * Processes pending/delayed withdrawals after the delay period has elapsed.
 * Runs every WITHDRAWAL_WORKER_INTERVAL_MS (default: 5 minutes).
 *
 * For each ready withdrawal:
 *  1. Verify >= WITHDRAWAL_DELAY_HOURS have passed since created_at
 *  2. Check liquidity: currentLiquidity >= amount × 1.10 (10% buffer)?
 *     - YES → process on-chain, mark as 'completed'
 *     - NO  → mark as 'delayed', notify admin via ops_alert, retry in 1 hour
 *  3. Log everything to ops_alerts
 */

import { getSolanaConnection, getTreasuryAddress } from '../modules/solana/treasury.js';
import { WithdrawalService } from '../modules/solana/withdrawal.service.js';
import { PublicKey } from '@solana/web3.js';
import { env } from '../config/env.js';
import { getRedis } from '../config/redis.js';
import { createWorkerReporter, withWorkerRecovery } from '../utils/workerHealth.js';
import { recordOpsAlert } from '../utils/opsAlert.js';
import { evaluateTreasuryHealth, checkWithdrawalLiquidity } from '../utils/treasuryMonitor.js';

let workerInterval: ReturnType<typeof setInterval> | null = null;
const reporter = createWorkerReporter('withdrawal-queue');

export function startWithdrawalProcessorWorker() {
  const intervalMs = env.WITHDRAWAL_WORKER_INTERVAL_MS;
  console.log(`[WithdrawalProcessor] Starting (interval: ${intervalMs}ms, delay: ${env.WITHDRAWAL_DELAY_HOURS}h)`);

  const wrappedWork = withWorkerRecovery('withdrawal-queue', processWithdrawalQueue, reporter);

  // Run immediately on startup to process any stale pending withdrawals
  wrappedWork();
  workerInterval = setInterval(wrappedWork, intervalMs);
}

export function stopWithdrawalProcessorWorker() {
  reporter.stop();
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log('[WithdrawalProcessor] Stopped');
  }
}

async function processWithdrawalQueue() {
  const withdrawalService = new WithdrawalService();
  const redis = getRedis();

  // Acquire distributed lock to prevent concurrent processing
  const lockKey = 'lock:withdrawal-processor-worker';
  const acquired = await redis.set(lockKey, '1', 'EX', 300, 'NX'); // 5 min TTL
  if (!acquired) {
    return; // Another instance is processing
  }

  try {
    // Check treasury balance
    let onChainBalance: number;
    try {
      const connection = getSolanaConnection();
      const address = getTreasuryAddress();
      onChainBalance = await connection.getBalance(new PublicKey(address));
    } catch (err: any) {
      console.error('[WithdrawalProcessor] Failed to get treasury balance:', err.message);
      return;
    }

    // Evaluate treasury health (updates circuit breaker state)
    const health = await evaluateTreasuryHealth(onChainBalance);

    // If maintenance state, skip processing entirely
    if (health.circuitBreakerState === 'maintenance') {
      console.warn('[WithdrawalProcessor] Treasury in MAINTENANCE — skipping withdrawal processing');
      return;
    }

    // Get ready withdrawals (delay expired)
    const ready = await withdrawalService.getReadyWithdrawals(10);

    if (ready.length === 0) return;

    console.log(`[WithdrawalProcessor] Processing ${ready.length} pending withdrawal(s)`);

    let processed = 0;
    let failed = 0;
    let delayed = 0;

    for (const withdrawal of ready) {
      // Verify delay has passed (double-check)
      const createdAt = new Date(withdrawal.createdAt);
      const minProcessTime = new Date(createdAt.getTime() + env.WITHDRAWAL_DELAY_HOURS * 3600 * 1000);
      if (new Date() < minProcessTime) {
        continue; // Not ready yet
      }

      // Check liquidity: currentLiquidity >= amount × 1.10
      const liquidityCheck = await checkWithdrawalLiquidity(withdrawal.amount, onChainBalance);

      if (!liquidityCheck.allowed) {
        delayed++;
        console.warn(`[WithdrawalProcessor] Delayed withdrawal ${withdrawal.id}: ${liquidityCheck.reason}`);

        // Mark as 'delayed', schedule retry in 1 hour
        await withdrawalService.markDelayed(withdrawal.id, liquidityCheck.reason!);

        recordOpsAlert({
          severity: 'warning',
          category: 'withdrawal_delayed',
          message: `Withdrawal ${withdrawal.id} delayed: ${liquidityCheck.reason}`,
          userId: withdrawal.userId,
          metadata: {
            withdrawalId: withdrawal.id,
            amount: withdrawal.amount,
            onChainBalance,
            reason: liquidityCheck.reason,
          },
        }).catch(() => {});

        continue;
      }

      // Process the withdrawal on-chain
      const result = await withdrawalService.processPendingWithdrawal(withdrawal.id);

      if (result.success) {
        processed++;
        onChainBalance -= withdrawal.amount; // Update local balance tracker

        recordOpsAlert({
          severity: 'warning',
          category: 'treasury',
          message: `Withdrawal ${withdrawal.id} completed: ${(withdrawal.amount / 1e9).toFixed(4)} SOL sent`,
          userId: withdrawal.userId,
          metadata: { withdrawalId: withdrawal.id, amount: withdrawal.amount, txHash: result.txHash },
        }).catch(() => {});
      } else {
        failed++;
      }
    }

    if (processed > 0 || failed > 0 || delayed > 0) {
      console.log(`[WithdrawalProcessor] Cycle complete: ${processed} processed, ${failed} failed, ${delayed} delayed`);
    }

  } finally {
    await redis.del(lockKey);
  }
}
