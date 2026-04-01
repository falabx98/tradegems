import { getDb } from '../config/database.js';
import { lotteryDraws } from '@tradingarena/db';
import { eq, and, lte, sql } from 'drizzle-orm';
import { LotteryService } from '../modules/lottery/lottery.service.js';
import { createWorkerReporter, withWorkerRecovery } from '../utils/workerHealth.js';

const POLL_INTERVAL_MS = 60_000; // 60 seconds

let workerTimer: ReturnType<typeof setInterval> | null = null;

// ─── Worker Tick ─────────────────────────────────────────────

async function tick(): Promise<void> {
  try {
    const db = getDb();
    const now = new Date();

    // Find all open draws whose drawDate has passed
    const expiredDraws = await db
      .select({ id: lotteryDraws.id, drawNumber: lotteryDraws.drawNumber })
      .from(lotteryDraws)
      .where(and(eq(lotteryDraws.status, 'open'), lte(lotteryDraws.drawDate, now)));

    for (const draw of expiredDraws) {
      console.log(`[LotteryWorker] Draw #${draw.drawNumber} (${draw.id}) has expired — executing draw...`);
      try {
        await LotteryService.executeDraw(draw.id);
        console.log(`[LotteryWorker] Draw #${draw.drawNumber} completed successfully`);
      } catch (err) {
        console.error(`[LotteryWorker] Failed to execute draw #${draw.drawNumber}:`, err);
      }
    }
  } catch (err) {
    console.error('[LotteryWorker] Tick error:', err);
  }
}

// ─── Public API ──────────────────────────────────────────────

export async function startLotteryDrawWorker(): Promise<void> {
  console.log('[LotteryWorker] Starting lottery draw worker...');

  // Ensure there is an open draw on startup
  try {
    await LotteryService.ensureCurrentDrawExists();
    console.log('[LotteryWorker] Current draw ensured');
  } catch (err) {
    console.error('[LotteryWorker] Failed to ensure current draw on startup:', err);
  }

  const wrappedTick = withWorkerRecovery('lottery-draw', tick, reporter);
  await wrappedTick();

  workerTimer = setInterval(wrappedTick, POLL_INTERVAL_MS);

  console.log('[LotteryWorker] Lottery draw worker started successfully');
}

const reporter = createWorkerReporter('lottery-draw');

export function stopLotteryDrawWorker(): void {
  reporter.stop();
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
    console.log('[LotteryWorker] Lottery draw worker stopped');
  }
}
