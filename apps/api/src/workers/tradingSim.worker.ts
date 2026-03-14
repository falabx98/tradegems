import { getDb } from '../config/database.js';
import { tradingSimRooms, tradingSimParticipants, users } from '@tradingarena/db';
import { eq, and, lte, sql } from 'drizzle-orm';
import { TradingSimService } from '../modules/trading-sim/tradingSim.service.js';
import { WalletService } from '../modules/wallet/wallet.service.js';

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
    // Refund real players' locked entry fees before marking as finished
    const tenMinAgo = new Date(now - 10 * 60 * 1000);
    const staleRooms = await db
      .select({ id: tradingSimRooms.id, entryFee: tradingSimRooms.entryFee })
      .from(tradingSimRooms)
      .where(and(eq(tradingSimRooms.status, 'waiting'), lte(tradingSimRooms.createdAt, tenMinAgo)));

    const wallet = new WalletService();
    for (const staleRoom of staleRooms) {
      try {
        const participants = await db
          .select({ userId: tradingSimParticipants.userId, role: users.role })
          .from(tradingSimParticipants)
          .innerJoin(users, eq(users.id, tradingSimParticipants.userId))
          .where(eq(tradingSimParticipants.roomId, staleRoom.id));

        for (const p of participants) {
          if (p.role === 'bot') continue;
          try {
            await wallet.settlePayout(
              p.userId, staleRoom.entryFee, 0, staleRoom.entryFee, 'SOL',
              { type: 'trading_sim', id: staleRoom.id },
            );
          } catch { /* lock may already be released */ }
        }

        await db.update(tradingSimRooms)
          .set({ status: 'finished' })
          .where(eq(tradingSimRooms.id, staleRoom.id));
        console.log(`[TradingSimWorker] Stale room ${staleRoom.id} cleaned up with refunds`);
      } catch (err) {
        console.error(`[TradingSimWorker] Failed to clean stale room ${staleRoom.id}:`, err);
      }
    }
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
