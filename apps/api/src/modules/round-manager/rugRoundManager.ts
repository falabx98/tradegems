import crypto from 'node:crypto';
import { getDb } from '../../config/database.js';
import { rugRounds, rugRoundBets, users } from '@tradingarena/db';
import { eq, and, desc } from 'drizzle-orm';
import { getRedis } from '../../config/redis.js';
import { WalletService } from '../wallet/wallet.service.js';
import { generateRugCandle, generateCrashCandles, estimateRoundTicks, type Candle } from '../../utils/chartGenerator.js';
import { recordFailedSettlement } from '../../utils/settlementRecovery.js';
import { createWorkerReporter, withWorkerRecovery } from '../../utils/workerHealth.js';

const HOUSE_EDGE = 0.05;
const WAITING_DURATION = 5000; // 5s
const RESOLVED_DURATION = 4000; // 4s pause after rug
const TICK_INTERVAL = 250; // 250ms per candle
const REDIS_KEY = 'rug:current';
const MAX_DISPLAY_RATIO = 0.995; // Multiplier display never exceeds 99.5% of crash point

interface RoundBet {
  userId: string;
  username: string;
  avatarUrl: string | null;
  betAmount: number;
  cashOutMultiplier: number | null;
  status: 'active' | 'cashed_out' | 'rugged';
  isDemo: boolean;
}

interface RoundState {
  roundId: string;
  roundNumber: number;
  status: 'waiting' | 'active' | 'resolved';
  seedHash: string;
  seed: string | null; // only revealed when resolved
  rugMultiplier: number | null; // only revealed when resolved
  currentMultiplier: number;
  candles: Candle[];
  bets: RoundBet[];
  waitEndsAt: number | null; // epoch ms
  activeStartedAt: number | null;
  resolvedAt: number | null;
}

let tickTimer: ReturnType<typeof setInterval> | null = null;
let state: RoundState | null = null;
let hiddenRugMultiplier = 1.00;
let hiddenSeed = '';
let phaseStartedAt = 0;
const inFlightBets = new Set<string>();
let stateLock = false;

async function withStateLock<T>(fn: () => Promise<T>): Promise<T> {
  if (stateLock) throw new Error('State operation in progress');
  stateLock = true;
  try {
    return await fn();
  } finally {
    stateLock = false;
  }
}

const db = () => getDb();
const wallet = new WalletService();

// Client seed for multi-player rounds is the roundId itself (public, known before bets)
// This ensures the crash point depends on something players can verify
import { generateCrashPoint as pfCrashPoint } from '../../utils/provablyFair.js';

function generateCrashPoint(seed: string, roundId: string): number {
  return pfCrashPoint(seed, roundId, 0, HOUSE_EDGE);
}

async function saveToRedis() {
  if (!state) return;
  const redis = getRedis();
  // Return public state (hide seed and rugMultiplier unless resolved)
  const publicState: RoundState = {
    ...state,
    seed: state.status === 'resolved' ? state.seed : null,
    rugMultiplier: state.status === 'resolved' ? state.rugMultiplier : null,
  };
  await redis.set(REDIS_KEY, JSON.stringify(publicState), 'EX', 120);
}

async function startNewRound() {
  const roundId = crypto.randomUUID();
  hiddenSeed = crypto.randomBytes(32).toString('hex');
  const seedHash = crypto.createHash('sha256').update(hiddenSeed).digest('hex');
  hiddenRugMultiplier = generateCrashPoint(hiddenSeed, roundId);

  // Insert round to DB
  const [round] = await db().insert(rugRounds).values({
    id: roundId,
    status: 'waiting',
    rugMultiplier: hiddenRugMultiplier.toFixed(4),
    seed: hiddenSeed,
    seedHash,
  }).returning();

  phaseStartedAt = Date.now();

  state = {
    roundId,
    roundNumber: round.roundNumber,
    status: 'waiting',
    seedHash,
    seed: null,
    rugMultiplier: null,
    currentMultiplier: 1.00,
    candles: [],
    bets: [],
    waitEndsAt: phaseStartedAt + WAITING_DURATION,
    activeStartedAt: null,
    resolvedAt: null,
  };

  await saveToRedis();
}

async function transitionToActive() {
  if (!state) return;
  state.status = 'active';
  state.activeStartedAt = Date.now();
  state.waitEndsAt = null;
  phaseStartedAt = Date.now();

  await db().update(rugRounds)
    .set({ status: 'active', activeStartedAt: new Date() })
    .where(eq(rugRounds.id, state.roundId));

  await saveToRedis();
}

async function settleAllBets() {
  return withStateLock(async () => {
    if (!state) return;
    const database = db();

    for (const bet of state.bets) {
      if (bet.status === 'active') {
        // Not cashed out = rugged
        bet.status = 'rugged';
        await database.update(rugRoundBets)
          .set({ status: 'rugged', payout: 0, settledAt: new Date() })
          .where(and(
            eq(rugRoundBets.roundId, state.roundId),
            eq(rugRoundBets.userId, bet.userId)
          ));

        // Settle wallet: player loses bet
        const user = await database.query.users.findFirst({ where: eq(users.id, bet.userId) });
        if (user && user.role !== 'bot') {
          try {
            await wallet.settlePayout(bet.userId, bet.betAmount, 0, 0, 'SOL', { type: 'rug_round', id: state.roundId }, bet.isDemo);
          } catch (err) {
            console.error('[RugRound] settleAllBets settlement failed:', err, { userId: bet.userId, roundId: state.roundId });
          }
        }
      }
    }
  });
}

async function transitionToResolved() {
  if (!state) return;

  // Add crash candles
  const lastClose = state.candles.length > 0 ? state.candles[state.candles.length - 1].close : 1.0;
  const crashCandles = generateCrashCandles(lastClose);
  const baseTs = state.candles.length;
  crashCandles.forEach((c, i) => { c.timestamp = baseTs + i; });
  state.candles.push(...crashCandles);

  state.status = 'resolved';
  state.seed = hiddenSeed;
  state.rugMultiplier = hiddenRugMultiplier;
  state.resolvedAt = Date.now();
  phaseStartedAt = Date.now();

  // Settle all unsettled bets as rugged
  await settleAllBets();

  await db().update(rugRounds)
    .set({
      status: 'resolved',
      resolvedAt: new Date(),
      candleData: state.candles,
      playerCount: state.bets.length,
      totalBetAmount: state.bets.reduce((sum, b) => sum + b.betAmount, 0),
    })
    .where(eq(rugRounds.id, state.roundId));

  await saveToRedis();
}

async function tick() {
  if (!state) return;

  const now = Date.now();
  const elapsed = now - phaseStartedAt;

  if (state.status === 'waiting') {
    if (elapsed >= WAITING_DURATION) {
      await transitionToActive();
    }
  } else if (state.status === 'active') {
    // Generate new candle — TIME-BASED progress drives the crash curve
    const prevClose = state.candles.length > 0 ? state.candles[state.candles.length - 1].close : 1.0;
    const expectedTicks = estimateRoundTicks(hiddenRugMultiplier);
    const timeProgress = state.candles.length / expectedTicks;

    // CRITICAL FIX: If we've exceeded the expected round duration, force the rug.
    // The crash curve ceiling (crashPoint * 0.995) can never reach crashPoint,
    // so without this check the round would run forever for low crash points.
    // We add a small buffer (20% overtime) for visual smoothness, then force rug.
    if (timeProgress >= 1.2) {
      state.currentMultiplier = hiddenRugMultiplier;
      await transitionToResolved();
      return;
    }

    const clampedProgress = Math.min(timeProgress, 1.0);
    const candle = generateRugCandle(prevClose, hiddenRugMultiplier, clampedProgress);
    candle.timestamp = state.candles.length;

    // CRITICAL: Clamp candle values to NEVER exceed the crash point
    // This prevents the chart from showing impossible multipliers
    const maxAllowed = hiddenRugMultiplier * MAX_DISPLAY_RATIO;
    candle.close = Math.min(candle.close, maxAllowed);
    candle.high = Math.min(candle.high, hiddenRugMultiplier);
    candle.open = Math.min(candle.open, maxAllowed);

    state.candles.push(candle);
    state.currentMultiplier = parseFloat(candle.close.toFixed(4));

    // Check if we hit the rug point (uses >= so crash triggers reliably)
    if (state.currentMultiplier >= hiddenRugMultiplier) {
      state.currentMultiplier = hiddenRugMultiplier;
      await transitionToResolved();
    } else {
      await saveToRedis();
    }
  } else if (state.status === 'resolved') {
    if (elapsed >= RESOLVED_DURATION) {
      await startNewRound();
    }
  }
}

// ─── Public API ────────────────────────────────────────────

export async function getCurrentRound(): Promise<RoundState | null> {
  // Try Redis first for speed
  try {
    const redis = getRedis();
    const data = await redis.get(REDIS_KEY);
    if (data) return JSON.parse(data);
  } catch { /* fallback to state */ }
  return state ? {
    ...state,
    seed: state.status === 'resolved' ? state.seed : null,
    rugMultiplier: state.status === 'resolved' ? state.rugMultiplier : null,
  } : null;
}

export async function joinRound(userId: string, betAmount: number, isDemoBet = false): Promise<{ success: boolean; message?: string }> {
  if (!state || state.status !== 'waiting') {
    return { success: false, message: 'No round in waiting phase. Wait for next round.' };
  }

  // Check if already in this round
  if (state.bets.some(b => b.userId === userId)) {
    return { success: false, message: 'Already in this round.' };
  }

  // Prevent concurrent joins from the same user
  if (inFlightBets.has(userId)) {
    return { success: false, message: 'Bet already in progress.' };
  }
  inFlightBets.add(userId);
  try {
    return await withStateLock(async () => {
      // Check user role for wallet ops
      const database = db();
      const user = await database.query.users.findFirst({ where: eq(users.id, userId) });
      if (!user) return { success: false, message: 'User not found.' };

      // Lock funds (skip for bots)
      if (user.role !== 'bot') {
        await wallet.lockFunds(userId, betAmount, 'SOL', { type: 'rug_round', id: state!.roundId }, isDemoBet);
      }

      try {
        // Insert bet to DB
        await database.insert(rugRoundBets).values({
          roundId: state!.roundId,
          userId,
          betAmount,
          status: 'active',
          isDemo: isDemoBet,
        });
      } catch (err) {
        // DB insert failed — rollback the fund lock
        if (user.role !== 'bot') {
          try { await wallet.releaseFunds(userId, betAmount, 'SOL', { type: 'rug_round', id: state!.roundId }, isDemoBet); } catch {}
        }
        throw err;
      }

      // Add to state
      state!.bets.push({
        userId,
        username: user.username || 'Player',
        avatarUrl: user.avatarUrl || null,
        betAmount,
        cashOutMultiplier: null,
        status: 'active',
        isDemo: isDemoBet,
      });

      await saveToRedis();
      return { success: true };
    });
  } finally {
    inFlightBets.delete(userId);
  }
}

export async function cashOut(userId: string): Promise<{ success: boolean; multiplier?: number; payout?: number; message?: string }> {
  if (!state || state.status !== 'active') {
    return { success: false, message: 'Round is not active.' };
  }

  return withStateLock(async () => {
    const bet = state!.bets.find(b => b.userId === userId && b.status === 'active');
    if (!bet) {
      return { success: false, message: 'No active bet in this round.' };
    }

    // currentMultiplier is already clamped at MAX_DISPLAY_RATIO by tick()
    const multiplier = state!.currentMultiplier;

    // Already past rug? (race condition protection)
    if (multiplier >= hiddenRugMultiplier) {
      return { success: false, message: 'Too late — rugged!' };
    }

    // FINANCIAL SAFETY: payout can NEVER exceed betAmount × crashPoint
    const payout = Math.min(
      Math.floor(bet.betAmount * multiplier),
      Math.floor(bet.betAmount * hiddenRugMultiplier),
    );
    bet.cashOutMultiplier = parseFloat(multiplier.toFixed(4));
    bet.status = 'cashed_out';

    const database = db();

    // Update bet in DB
    await database.update(rugRoundBets)
      .set({
        cashOutMultiplier: multiplier.toFixed(4),
        payout,
        status: 'cashed_out',
        settledAt: new Date(),
      })
      .where(and(
        eq(rugRoundBets.roundId, state!.roundId),
        eq(rugRoundBets.userId, userId)
      ));

    // Settle wallet (skip for bots)
    const user = await database.query.users.findFirst({ where: eq(users.id, userId) });
    if (user && user.role !== 'bot') {
      try {
        await wallet.settlePayout(userId, bet.betAmount, 0, payout, 'SOL', { type: 'rug_round', id: state!.roundId }, bet.isDemo);
      } catch (settleErr: any) {
        await recordFailedSettlement({
          userId, game: 'rug-game', gameRefType: 'rug_round', gameRefId: state!.roundId,
          betAmount: bet.betAmount, fee: 0, payoutAmount: payout,
          errorMessage: settleErr.message || 'Settlement failed',
          metadata: { multiplier: bet.cashOutMultiplier },
        });
        throw settleErr;
      }
    }

    await saveToRedis();
    return { success: true, multiplier: bet.cashOutMultiplier, payout };
  });
}

export async function getRecentRounds(limit: number = 10) {
  return db().select({
    id: rugRounds.id,
    roundNumber: rugRounds.roundNumber,
    rugMultiplier: rugRounds.rugMultiplier,
    playerCount: rugRounds.playerCount,
    resolvedAt: rugRounds.resolvedAt,
  })
  .from(rugRounds)
  .where(eq(rugRounds.status, 'resolved'))
  .orderBy(desc(rugRounds.resolvedAt))
  .limit(limit);
}

const rugReporter = createWorkerReporter('rug-round-manager');

export async function startRugRoundManager() {
  console.log('[RugRoundManager] Starting...');
  await startNewRound();
  const wrappedTick = withWorkerRecovery('rug-round-manager', tick, rugReporter);
  tickTimer = setInterval(wrappedTick, TICK_INTERVAL);
}

export function stopRugRoundManager() {
  rugReporter.stop();
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}
