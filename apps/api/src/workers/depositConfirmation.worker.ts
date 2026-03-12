import { eq } from 'drizzle-orm';
import { deposits } from '@tradingarena/db';
import { getDb } from '../config/database.js';
import { getRedis } from '../config/redis.js';
import { WalletService } from '../modules/wallet/wallet.service.js';
import { DepositWalletService } from '../modules/solana/depositWallet.service.js';
import { SolanaService } from '../modules/solana/solana.service.js';

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const STALE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const WORKER_LOCK_KEY = 'lock:deposit-confirmation-worker';
const WORKER_LOCK_TTL = 25; // seconds — shorter than poll interval to avoid stale locks

let pollInterval: ReturnType<typeof setInterval> | null = null;

export function startDepositWorker(intervalMs: number = POLL_INTERVAL_MS) {
  console.log(`[DepositWorker] Starting deposit confirmation worker (interval: ${intervalMs}ms)`);

  // Run once immediately, then on interval
  processConfirmingDeposits().catch((err) => {
    console.error('[DepositWorker] Initial cycle error:', err.message);
  });

  pollInterval = setInterval(async () => {
    try {
      await processConfirmingDeposits();
    } catch (err: any) {
      console.error('[DepositWorker] Cycle error:', err.message);
    }
  }, intervalMs);
}

export function stopDepositWorker() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log('[DepositWorker] Stopped');
  }
}

async function processConfirmingDeposits() {
  const redis = getRedis();

  // Acquire distributed lock to prevent concurrent workers
  const acquired = await redis.set(WORKER_LOCK_KEY, '1', 'EX', WORKER_LOCK_TTL, 'NX');
  if (!acquired) {
    console.log('[DepositWorker] Another worker is running, skipping cycle');
    return;
  }

  try {
    const db = getDb();
    const solanaService = new SolanaService();
    const walletService = new WalletService();
    const depositWalletService = new DepositWalletService();

    // Query all deposits with status = 'confirming'
    const pendingDeposits = await db
      .select()
      .from(deposits)
      .where(eq(deposits.status, 'confirming'));

    if (pendingDeposits.length === 0) return;

    console.log(`[DepositWorker] Processing ${pendingDeposits.length} confirming deposit(s)`);

    for (const deposit of pendingDeposits) {
      try {
        await processDeposit(deposit, {
          db,
          redis,
          solanaService,
          walletService,
          depositWalletService,
        });
      } catch (err: any) {
        console.error(
          `[DepositWorker] Error processing deposit ${deposit.id}:`,
          err.message,
        );
      }
    }
  } finally {
    await redis.del(WORKER_LOCK_KEY);
  }
}

interface WorkerServices {
  db: ReturnType<typeof getDb>;
  redis: ReturnType<typeof getRedis>;
  solanaService: SolanaService;
  walletService: WalletService;
  depositWalletService: DepositWalletService;
}

async function processDeposit(
  deposit: typeof deposits.$inferSelect,
  services: WorkerServices,
) {
  const { db, redis, solanaService, walletService, depositWalletService } = services;

  const txHash = deposit.txHash;
  if (!txHash) {
    console.warn(`[DepositWorker] Deposit ${deposit.id} has no txHash, skipping`);
    return;
  }

  // Re-verify the transaction on-chain
  const verification = await solanaService.verifyDepositTransaction(
    txHash,
    deposit.toAddress,
  );

  // If transaction failed or not found, check if it's been too long
  if (!verification.valid) {
    const ageMs = Date.now() - deposit.createdAt.getTime();
    if (ageMs > STALE_TIMEOUT_MS) {
      console.log(
        `[DepositWorker] Deposit ${deposit.id} failed after ${Math.round(ageMs / 1000)}s: ${verification.error}`,
      );
      await db
        .update(deposits)
        .set({ status: 'failed' })
        .where(eq(deposits.id, deposit.id));
    } else {
      console.log(
        `[DepositWorker] Deposit ${deposit.id} not yet valid (${verification.error}), will retry`,
      );
    }
    return;
  }

  // Update confirmation count
  await db
    .update(deposits)
    .set({ confirmations: verification.confirmations })
    .where(eq(deposits.id, deposit.id));

  // Check if we have enough confirmations
  if (verification.confirmations < deposit.requiredConfirmations) {
    console.log(
      `[DepositWorker] Deposit ${deposit.id}: ${verification.confirmations}/${deposit.requiredConfirmations} confirmations`,
    );
    return;
  }

  // --- Deposit is confirmed ---
  console.log(
    `[DepositWorker] Deposit ${deposit.id} confirmed (${verification.confirmations} confirmations, ${deposit.amount} lamports)`,
  );

  // Update deposit status to confirmed
  await db
    .update(deposits)
    .set({
      status: 'confirmed',
      confirmations: verification.confirmations,
      confirmedAt: new Date(),
    })
    .where(eq(deposits.id, deposit.id));

  // Credit user balance
  await walletService.creditDeposit(
    deposit.userId,
    deposit.amount,
    deposit.asset,
    deposit.id,
  );

  // Trigger sweep from deposit wallet to treasury (fire-and-forget)
  depositWalletService.sweepToTreasury(deposit.userId).catch((err) => {
    console.error(
      `[DepositWorker] Sweep failed for user ${deposit.userId}:`,
      err.message,
    );
  });

  // Publish Redis event for WebSocket notification
  const event = JSON.stringify({
    type: 'deposit_confirmed',
    depositId: deposit.id,
    amount: String(deposit.amount),
    asset: deposit.asset,
    txHash,
  });
  await redis.publish(`user:${deposit.userId}`, event);
  console.log(`[DepositWorker] Published deposit_confirmed event for user ${deposit.userId}`);
}
