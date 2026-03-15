import crypto from 'node:crypto';
import { getDb } from '../../config/database.js';
import { rugRounds, rugRoundBets, users } from '@tradingarena/db';
import { eq, and, desc } from 'drizzle-orm';
import { getRedis } from '../../config/redis.js';
import { WalletService } from '../wallet/wallet.service.js';
import { generateRugCandle, generateCrashCandles, type Candle } from '../../utils/chartGenerator.js';

const HOUSE_EDGE = 0.04;
const WAITING_DURATION = 5000; // 5s
const RESOLVED_DURATION = 4000; // 4s pause after rug
const TICK_INTERVAL = 250; // 250ms per candle
const REDIS_KEY = 'rug:current';

interface RoundBet {
  userId: string;
  username: string;
  avatarUrl: string | null;
  betAmount: number;
  cashOutMultiplier: number | null;
  status: 'active' | 'cashed_out' | 'rugged';
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

function generateCrashPoint(seed: string, gameId: string): number {
  const hash = crypto.createHash('sha256').update(seed + ':' + gameId).digest('hex');
  const h = parseInt(hash.slice(0, 13), 16);
  if (h % 25 === 0) return 1.00;
  const e = Math.pow(2, 52);
  const raw = e / (e - (h % e));
  const result = Math.max(1.00, raw * (1 - HOUSE_EDGE));
  return Math.min(parseFloat(result.toFixed(2)), 100.00);
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
            await wallet.settlePayout(bet.userId, bet.betAmount, 0, 0, 'SOL', { type: 'rug_round', id: state.roundId });
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
    // Generate new candle
    const prevClose = state.candles.length > 0 ? state.candles[state.candles.length - 1].close : 1.0;
    const progress = Math.min(1.0, state.currentMultiplier / hiddenRugMultiplier);
    const candle = generateRugCandle(prevClose, hiddenRugMultiplier, progress);
    candle.timestamp = state.candles.length;
    state.candles.push(candle);
    state.currentMultiplier = candle.close;

    // Check if we hit the rug point
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

export async function joinRound(userId: string, betAmount: number): Promise<{ success: boolean; message?: string }> {
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
        await wallet.lockFunds(userId, betAmount, 'SOL', { type: 'rug_round', id: state!.roundId });
      }

      try {
        // Insert bet to DB
        await database.insert(rugRoundBets).values({
          roundId: state!.roundId,
          userId,
          betAmount,
          status: 'active',
        });
      } catch (err) {
        // DB insert failed — rollback the fund lock
        if (user.role !== 'bot') {
          try { await wallet.releaseFunds(userId, betAmount, 'SOL', { type: 'rug_round', id: state!.roundId }); } catch {}
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

    const multiplier = state!.currentMultiplier;

    // Already past rug? (race condition protection)
    if (multiplier >= hiddenRugMultiplier) {
      return { success: false, message: 'Too late — rugged!' };
    }

    const payout = Math.floor(bet.betAmount * multiplier);
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
      // fee=0 because house edge is embedded in the crash point algorithm; lockFunds only locked betAmount
      await wallet.settlePayout(userId, bet.betAmount, 0, payout, 'SOL', { type: 'rug_round', id: state!.roundId });
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

export async function startRugRoundManager() {
  console.log('[RugRoundManager] Starting...');
  await startNewRound();
  tickTimer = setInterval(() => tick().catch(err => console.error('[RugRoundManager] tick error:', err)), TICK_INTERVAL);
}

export function stopRugRoundManager() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}
