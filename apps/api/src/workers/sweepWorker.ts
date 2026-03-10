import { eq } from 'drizzle-orm';
import { userDepositWallets } from '@tradingarena/db';
import { getDb } from '../config/database.js';
import { DepositWalletService } from '../modules/solana/depositWallet.service.js';
import { env } from '../config/env.js';

let sweepInterval: ReturnType<typeof setInterval> | null = null;

export function startSweepWorker() {
  const intervalMs = env.DEPOSIT_SWEEP_INTERVAL_MS;
  console.log(`[SweepWorker] Starting sweep worker (interval: ${intervalMs}ms)`);

  sweepInterval = setInterval(async () => {
    try {
      await sweepAllWallets();
    } catch (err: any) {
      console.error('[SweepWorker] Sweep cycle error:', err.message);
    }
  }, intervalMs);
}

export function stopSweepWorker() {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
    console.log('[SweepWorker] Stopped');
  }
}

async function sweepAllWallets() {
  const db = getDb();
  const depositWalletService = new DepositWalletService();
  const minSweep = env.DEPOSIT_MIN_SWEEP_LAMPORTS;

  // Get all active deposit wallets
  const wallets = await db
    .select({ userId: userDepositWallets.userId, address: userDepositWallets.address })
    .from(userDepositWallets)
    .where(eq(userDepositWallets.isActive, true));

  for (const wallet of wallets) {
    try {
      // Check on-chain balance before attempting sweep
      const balance = await depositWalletService.getWalletBalance(wallet.address);
      if (balance <= minSweep) continue;

      const txHash = await depositWalletService.sweepToTreasury(wallet.userId);
      if (txHash) {
        console.log(`[SweepWorker] Swept ${wallet.address} → treasury: ${txHash}`);
      }
    } catch (err: any) {
      console.error(`[SweepWorker] Failed to sweep ${wallet.address}:`, err.message);
    }
  }
}
