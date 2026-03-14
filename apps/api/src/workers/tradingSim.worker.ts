import { getDb } from '../config/database.js';
import { tradingSimRooms } from '@tradingarena/db';
import { eq, and, lte, sql } from 'drizzle-orm';
import { TradingSimService } from '../modules/trading-sim/tradingSim.service.js';

const POLL_INTERVAL_MS = 5_000; // 5 seconds — games are short

let workerTimer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  try {
    const db = getDb();
    const service = new TradingSimService();

    // Find all active rooms whose startedAt + duration has passed
    const expiredRooms = await db
      .select({ id: tradingSimRooms.id, startedAt: tradingSimRooms.startedAt, duration: tradingSimRooms.duration })
      .from(tradingSimRooms)
      .where(eq(tradingSimRooms.status, 'active'));

    const now = Date.now();

    for (const room of expiredRooms) {
      if (!room.startedAt) continue;
      const endTime = new Date(room.startedAt).getTime() + room.duration * 1000;
      if (now >= endTime) {
        console.log(`[TradingSimWorker] Room ${room.id} expired — ending...`);
        try {
          await service.endRoom(room.id);
          console.log(`[TradingSimWorker] Room ${room.id} ended successfully`);
        } catch (err) {
          console.error(`[TradingSimWorker] Failed to end room ${room.id}:`, err);
        }
      }
    }

    // Clean up old waiting rooms (> 10 minutes old, never started)
    const tenMinAgo = new Date(now - 10 * 60 * 1000);
    await db
      .update(tradingSimRooms)
      .set({ status: 'finished' })
      .where(and(eq(tradingSimRooms.status, 'waiting'), lte(tradingSimRooms.createdAt, tenMinAgo)));
  } catch (err) {
    console.error('[TradingSimWorker] Tick error:', err);
  }
}

export async function startTradingSimWorker(): Promise<void> {
  console.log('[TradingSimWorker] Starting trading sim worker...');
  await tick();
  workerTimer = setInterval(() => {
    tick().catch((err) => console.error('[TradingSimWorker] Tick error:', err));
  }, POLL_INTERVAL_MS);
  console.log('[TradingSimWorker] Worker started successfully');
}

export function stopTradingSimWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
    console.log('[TradingSimWorker] Worker stopped');
  }
}
