import { getDb } from '../config/database.js';
import { getRedis } from '../config/redis.js';
import { bets, candleflipGames, balances, balanceLedgerEntries, predictionRounds } from '@tradingarena/db';
import { eq, and, sql, lt } from 'drizzle-orm';
import { WalletService } from '../modules/wallet/wallet.service.js';

let cleanupInterval: ReturnType<typeof setInterval> | null = null;
const TICK_MS = 60_000; // Run every 60 seconds

// ─── Stale Solo Bets (active bets older than 5 min) ────────

async function cleanupStaleSoloBets(): Promise<number> {
  const db = getDb();
  const wallet = new WalletService();
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

  const staleBets = await db
    .select({
      id: bets.id,
      userId: bets.userId,
      amount: bets.amount,
      fee: bets.fee,
      roundId: bets.roundId,
    })
    .from(bets)
    .where(
      and(
        eq(bets.status, 'active'),
        lt(bets.lockedAt, fiveMinAgo),
      ),
    );

  let cleaned = 0;
  for (const bet of staleBets) {
    try {
      const totalLocked = bet.amount + bet.fee;
      await wallet.releaseFunds(bet.userId, totalLocked, 'SOL', {
        type: 'orphan_cleanup',
        id: `refund-${bet.id}`,
      });
      await db
        .update(bets)
        .set({ status: 'refunded', settledAt: new Date() })
        .where(eq(bets.id, bet.id));
      cleaned++;
    } catch {
      // releaseFunds failed (insufficient locked) — mark cancelled to prevent retry loop
      try {
        await db
          .update(bets)
          .set({ status: 'cancelled', settledAt: new Date() })
          .where(eq(bets.id, bet.id));
        cleaned++;
      } catch {
        // ignore
      }
    }
  }
  return cleaned;
}

// ─── Stale Candleflip Lobbies (open > 10 min) ──────────────

async function cleanupStaleCandleflipLobbies(): Promise<number> {
  const db = getDb();
  const wallet = new WalletService();
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);

  const staleGames = await db
    .select({
      id: candleflipGames.id,
      creatorId: candleflipGames.creatorId,
      betAmount: candleflipGames.betAmount,
    })
    .from(candleflipGames)
    .where(
      and(
        eq(candleflipGames.status, 'open'),
        lt(candleflipGames.createdAt, tenMinAgo),
      ),
    );

  let cleaned = 0;
  for (const game of staleGames) {
    try {
      // Refund creator: unlock bet and return full amount
      await wallet.settlePayout(
        game.creatorId,
        game.betAmount,
        0,
        game.betAmount,
        'SOL',
        { type: 'orphan_cleanup', id: `candleflip-${game.id}` },
      );
      await db
        .update(candleflipGames)
        .set({ status: 'cancelled' })
        .where(eq(candleflipGames.id, game.id));
      cleaned++;
    } catch {
      // Settlement failed — just cancel the game record
      try {
        await db
          .update(candleflipGames)
          .set({ status: 'cancelled' })
          .where(eq(candleflipGames.id, game.id));
        cleaned++;
      } catch {
        // ignore
      }
    }
  }
  return cleaned;
}

// ─── Stale Prediction Locks (>30s in Redis) ─────────────────
// Instead of refunding, we settle as the predetermined outcome so users can't
// exploit disconnects to avoid losses.

const PREDICTION_MULTIPLIERS: Record<string, number> = { up: 1.9, down: 1.9, sideways: 3.0 };

async function cleanupStalePredictionLocks(): Promise<number> {
  const redis = getRedis();
  const db = getDb();
  const wallet = new WalletService();
  const STALE_THRESHOLD_MS = 30_000; // 30 seconds
  const now = Date.now();

  let cleaned = 0;
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'prediction:lock:*', 'COUNT', 100);
    cursor = nextCursor;

    for (const key of keys) {
      try {
        const lockJson = await redis.get(key);
        if (!lockJson) continue;

        const lock = JSON.parse(lockJson) as {
          userId: string;
          betAmount: number;
          fee: number;
          totalCost: number;
          refId: string;
          direction: 'up' | 'down' | 'sideways';
          serverOutcome: 'win' | 'loss';
          createdAt?: number;
        };

        // Skip locks without createdAt (legacy) or that are still fresh
        if (!lock.createdAt || now - lock.createdAt < STALE_THRESHOLD_MS) continue;

        const ref = { type: 'orphan_cleanup', id: `prediction-${lock.refId}` };
        const multiplier = PREDICTION_MULTIPLIERS[lock.direction] ?? 1.9;

        // Apply the predetermined outcome (NOT a refund)
        if (lock.serverOutcome === 'win') {
          const payout = Math.floor(lock.betAmount * multiplier);
          await wallet.settlePayout(lock.userId, lock.betAmount, lock.fee, payout, 'SOL', ref);
        } else {
          // Loss: payout is 0 — house keeps the bet
          await wallet.settlePayout(lock.userId, lock.betAmount, lock.fee, 0, 'SOL', ref);
        }

        // Log the prediction round to DB so the game is recorded
        try {
          const safeMultiplier = lock.serverOutcome === 'win' ? multiplier : 0;
          const actualPayout = lock.serverOutcome === 'win' ? Math.floor(lock.betAmount * multiplier) : 0;
          await db.insert(predictionRounds).values({
            userId: lock.userId,
            direction: lock.direction,
            betAmount: lock.betAmount,
            result: lock.serverOutcome,
            payout: actualPayout,
            multiplier: String(safeMultiplier),
            pattern: null,
            metadata: { settledBy: 'orphan_cleanup', fee: lock.fee, ref: lock.refId },
          });
        } catch {
          // Non-critical — settlement already happened
        }

        // Delete the Redis key after settlement
        await redis.del(key);
        cleaned++;
      } catch {
        // Settlement failed for this lock — will retry next tick
      }
    }
  } while (cursor !== '0');

  return cleaned;
}

// ─── Orphaned Locked Balances (no active games for 3+ min) ──

async function cleanupOrphanedLockedBalances(): Promise<number> {
  const db = getDb();
  const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000);

  // Find users with locked funds that haven't been updated recently
  const lockedUsers = await db
    .select({
      userId: balances.userId,
      lockedAmount: balances.lockedAmount,
      updatedAt: balances.updatedAt,
    })
    .from(balances)
    .where(
      and(
        sql`${balances.lockedAmount} > 0`,
        eq(balances.asset, 'SOL'),
        lt(balances.updatedAt, threeMinAgo),
      ),
    );

  let cleaned = 0;
  for (const user of lockedUsers) {
    // Check if user has ANY active bets
    const activeBets = await db
      .select({ id: bets.id })
      .from(bets)
      .where(and(eq(bets.userId, user.userId), eq(bets.status, 'active')))
      .limit(1);

    if (activeBets.length > 0) continue; // Has active bets — skip

    // Check if user has any open candleflip games
    const openGames = await db
      .select({ id: candleflipGames.id })
      .from(candleflipGames)
      .where(and(eq(candleflipGames.creatorId, user.userId), eq(candleflipGames.status, 'open')))
      .limit(1);

    if (openGames.length > 0) continue; // Has open games — skip

    // No active games found — release orphaned locked funds
    try {
      const amount = user.lockedAmount;
      const result = await db.execute(sql`
        UPDATE balances
        SET available_amount = available_amount + locked_amount,
            locked_amount = 0,
            updated_at = now()
        WHERE user_id = ${user.userId}
          AND asset = 'SOL'
          AND locked_amount = ${amount}
          AND locked_amount > 0
        RETURNING available_amount
      `) as unknown as { available_amount: number }[];

      if (result && result.length > 0) {
        await db.insert(balanceLedgerEntries).values({
          userId: user.userId,
          asset: 'SOL',
          entryType: 'orphan_cleanup' as any,
          amount,
          balanceAfter: result[0].available_amount,
          referenceType: 'orphan_cleanup',
          referenceId: `locked-release-${user.userId}-${Date.now()}`,
        });
        cleaned++;
      }
    } catch {
      // ignore — will retry next tick
    }
  }
  return cleaned;
}

// ─── Main Tick ──────────────────────────────────────────────

async function tick(): Promise<void> {
  try {
    const [soloBets, candleflipLobbies, predictionLocks, orphanedLocks] = await Promise.all([
      cleanupStaleSoloBets(),
      cleanupStaleCandleflipLobbies(),
      cleanupStalePredictionLocks(),
      cleanupOrphanedLockedBalances(),
    ]);

    const total = soloBets + candleflipLobbies + predictionLocks + orphanedLocks;
    if (total > 0) {
      console.log(
        `[OrphanCleanup] Cleaned: ${soloBets} stale bets, ${candleflipLobbies} candleflip lobbies, ${predictionLocks} prediction locks, ${orphanedLocks} orphaned locks`,
      );
    }
  } catch (err: any) {
    console.error('[OrphanCleanup] Tick error:', err.message);
  }
}

// ─── Public API ─────────────────────────────────────────────

export function startOrphanCleanupWorker(): void {
  console.log(`[OrphanCleanup] Starting orphan cleanup worker (interval: ${TICK_MS}ms)`);

  // Run initial cleanup on startup
  tick().catch((err) => console.error('[OrphanCleanup] Initial tick error:', err));

  cleanupInterval = setInterval(() => {
    tick().catch((err) => console.error('[OrphanCleanup] Tick error:', err));
  }, TICK_MS);
}

export function stopOrphanCleanupWorker(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('[OrphanCleanup] Stopped');
  }
}
