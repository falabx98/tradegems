import { eq } from 'drizzle-orm';
import { userDepositWallets } from '@tradingarena/db';
import { getDb } from '../config/database.js';
import { DepositWalletService } from '../modules/solana/depositWallet.service.js';
import { getSolanaConnection, getTreasuryAddress } from '../modules/solana/treasury.js';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { env } from '../config/env.js';
import { createWorkerReporter, withWorkerRecovery } from '../utils/workerHealth.js';
import { recordOpsAlert } from '../utils/opsAlert.js';

// Treasury alert thresholds (in SOL)
const TREASURY_LOW = Number(process.env.TREASURY_LOW_THRESHOLD || 10);
const TREASURY_CRITICAL = Number(process.env.TREASURY_CRITICAL_THRESHOLD || 2);
const TREASURY_HIGH = Number(process.env.TREASURY_HIGH_THRESHOLD || 1000);

let sweepInterval: ReturnType<typeof setInterval> | null = null;
let lastTreasuryAlertState: 'normal' | 'low' | 'critical' | 'high' = 'normal';
const reporter = createWorkerReporter('sweep');

export function startSweepWorker() {
  const intervalMs = env.DEPOSIT_SWEEP_INTERVAL_MS;
  console.log(`[SweepWorker] Starting sweep worker (interval: ${intervalMs}ms)`);

  const wrappedWork = withWorkerRecovery('sweep', async () => {
    await sweepAllWallets();
    await checkTreasuryBalance();
  }, reporter);
  sweepInterval = setInterval(wrappedWork, intervalMs);
}

export function stopSweepWorker() {
  reporter.stop();
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
    console.log('[SweepWorker] Stopped');
  }
}

async function checkTreasuryBalance() {
  try {
    const connection = getSolanaConnection();
    const address = getTreasuryAddress();
    const balanceLamports = await connection.getBalance(new PublicKey(address));
    const balanceSol = balanceLamports / LAMPORTS_PER_SOL;

    let newState: typeof lastTreasuryAlertState = 'normal';
    if (balanceSol <= TREASURY_CRITICAL) newState = 'critical';
    else if (balanceSol <= TREASURY_LOW) newState = 'low';
    else if (balanceSol >= TREASURY_HIGH) newState = 'high';

    // Only alert on state transitions (don't spam on every check)
    if (newState !== lastTreasuryAlertState && newState !== 'normal') {
      const severity = newState === 'critical' ? 'critical' as const : 'warning' as const;
      const message = newState === 'critical'
        ? `Treasury balance critically low: ${balanceSol.toFixed(4)} SOL (threshold: ${TREASURY_CRITICAL} SOL)`
        : newState === 'low'
        ? `Treasury balance low: ${balanceSol.toFixed(4)} SOL (threshold: ${TREASURY_LOW} SOL)`
        : `Treasury balance unusually high: ${balanceSol.toFixed(4)} SOL (threshold: ${TREASURY_HIGH} SOL)`;

      await recordOpsAlert({
        severity,
        category: 'treasury',
        message,
        metadata: { balanceSol, threshold: newState === 'critical' ? TREASURY_CRITICAL : newState === 'low' ? TREASURY_LOW : TREASURY_HIGH },
      });
      console.warn(`[SweepWorker] TREASURY ALERT (${severity}): ${message}`);
    }
    lastTreasuryAlertState = newState;
  } catch (err: any) {
    console.error('[SweepWorker] Treasury balance check failed:', err.message);
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
