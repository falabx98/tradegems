import { eq } from 'drizzle-orm';
import { userDepositWallets, deposits } from '@tradingarena/db';
import { getDb } from '../config/database.js';
import { getRedis } from '../config/redis.js';
import { WalletService } from '../modules/wallet/wallet.service.js';
import { DepositWalletService } from '../modules/solana/depositWallet.service.js';
import { SolanaService } from '../modules/solana/solana.service.js';
import { getSolanaConnection } from '../modules/solana/treasury.js';
import { getSolanaCircuitBreaker } from '../utils/circuitBreaker.js';
import { PublicKey } from '@solana/web3.js';
import { env } from '../config/env.js';
import { createWorkerReporter, withWorkerRecovery } from '../utils/workerHealth.js';

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const WORKER_LOCK_KEY = 'lock:deposit-monitor-worker';
const WORKER_LOCK_TTL = 25;

let pollInterval: ReturnType<typeof setInterval> | null = null;
const reporter = createWorkerReporter('deposit-monitor');

export function startDepositMonitor(intervalMs: number = POLL_INTERVAL_MS) {
  console.log(`[DepositMonitor] Starting deposit monitor (interval: ${intervalMs}ms)`);

  const wrappedProcess = withWorkerRecovery('deposit-monitor', scanForNewDeposits, reporter);

  // Run once immediately, then on interval
  wrappedProcess();
  pollInterval = setInterval(wrappedProcess, intervalMs);
}

export function stopDepositMonitor() {
  reporter.stop();
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log('[DepositMonitor] Stopped');
  }
}

async function scanForNewDeposits() {
  const redis = getRedis();

  const acquired = await redis.set(WORKER_LOCK_KEY, '1', 'EX', WORKER_LOCK_TTL, 'NX');
  if (!acquired) return;

  try {
    const db = getDb();
    const connection = getSolanaConnection();
    const cb = getSolanaCircuitBreaker();
    const solanaService = new SolanaService();
    const walletService = new WalletService();
    const depositWalletService = new DepositWalletService();

    // Get all active deposit wallets
    const wallets = await db
      .select({ userId: userDepositWallets.userId, address: userDepositWallets.address })
      .from(userDepositWallets)
      .where(eq(userDepositWallets.isActive, true));

    if (wallets.length === 0) return;

    for (const wallet of wallets) {
      try {
        // Get recent signatures for this deposit wallet
        const pubkey = new PublicKey(wallet.address);
        const signatures = await cb.execute(() =>
          connection.getSignaturesForAddress(pubkey, { limit: 5 }, 'confirmed')
        );

        if (signatures.length === 0) continue;

        // Get existing txHashes for this user to skip duplicates
        const existingDeposits = await db
          .select({ txHash: deposits.txHash })
          .from(deposits)
          .where(eq(deposits.userId, wallet.userId));
        const existingTxHashes = new Set(existingDeposits.map(d => d.txHash));

        for (const sig of signatures) {
          if (sig.err) continue; // Skip failed transactions
          if (existingTxHashes.has(sig.signature)) continue; // Already processed

          // Prevent concurrent processing
          const lockKey = `lock:deposit:${sig.signature}`;
          const lockAcquired = await redis.set(lockKey, '1', 'EX', 30, 'NX');
          if (!lockAcquired) continue;

          try {
            // Verify this is actually a deposit TO this wallet
            const verification = await solanaService.verifyDepositTransaction(
              sig.signature,
              wallet.address,
            );

            if (!verification.valid || verification.amount <= 0) continue;

            const requiredConfirmations = env.SOLANA_REQUIRED_CONFIRMATIONS;
            const status = verification.confirmations >= requiredConfirmations ? 'confirmed' : 'confirming';

            // Insert deposit record
            const [deposit] = await db.insert(deposits).values({
              userId: wallet.userId,
              asset: 'SOL',
              amount: verification.amount,
              txHash: sig.signature,
              fromAddress: verification.from,
              toAddress: verification.to,
              status,
              confirmations: verification.confirmations,
              requiredConfirmations,
              confirmedAt: status === 'confirmed' ? new Date() : undefined,
            }).onConflictDoNothing({ target: deposits.txHash }).returning();

            if (!deposit) continue; // Already existed (race condition)

            console.log(
              `[DepositMonitor] Detected deposit ${deposit.id}: ${verification.amount} lamports from ${verification.from} → ${wallet.address} (${status})`,
            );

            if (status === 'confirmed') {
              await walletService.creditDeposit(wallet.userId, verification.amount, 'SOL', deposit.id);

              // Sweep to treasury (fire-and-forget)
              depositWalletService.sweepToTreasury(wallet.userId).catch((err) => {
                console.error(`[DepositMonitor] Sweep failed for user ${wallet.userId}:`, err.message);
              });

              // Notify via WebSocket
              const event = JSON.stringify({
                type: 'deposit_confirmed',
                depositId: deposit.id,
                amount: String(deposit.amount),
                asset: deposit.asset,
                txHash: sig.signature,
              });
              await redis.publish(`user:${wallet.userId}`, event);
              console.log(`[DepositMonitor] Auto-credited ${verification.amount} lamports for user ${wallet.userId}`);
            }
          } finally {
            await redis.del(lockKey);
          }
        }
      } catch (err: any) {
        console.error(`[DepositMonitor] Error scanning wallet ${wallet.address}:`, err.message);
      }
    }
  } finally {
    await redis.del(WORKER_LOCK_KEY);
  }
}
