import { getDb } from '../config/database.js';
import { lotteryDraws } from '@tradingarena/db';
import { eq, and, lte, sql } from 'drizzle-orm';
import { LotteryService } from '../modules/lottery/lottery.service.js';

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

  // Run an initial tick immediately to catch any expired draws
  await tick();

  // Poll every 60 seconds
  workerTimer = setInterval(() => {
    tick().catch((err) => {
      console.error('[LotteryWorker] Tick error:', err);
    });
  }, POLL_INTERVAL_MS);

  console.log('[LotteryWorker] Lottery draw worker started successfully');
}

export function stopLotteryDrawWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
    console.log('[LotteryWorker] Lottery draw worker stopped');
  }
}
