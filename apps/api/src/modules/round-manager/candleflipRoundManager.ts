import crypto from 'node:crypto';
import { getDb } from '../../config/database.js';
import { candleflipRounds, candleflipRoundBets, users } from '@tradingarena/db';
import { eq, and, desc } from 'drizzle-orm';
import { getRedis } from '../../config/redis.js';
import { WalletService } from '../wallet/wallet.service.js';
import { generateCandleflipChart, type Candle } from '../../utils/chartGenerator.js';
import { auditLog } from '../../utils/auditLog.js';
import { recordFailedSettlement } from '../../utils/settlementRecovery.js';
import { createWorkerReporter, withWorkerRecovery } from '../../utils/workerHealth.js';
import { env } from '../../config/env.js';
import { recordOpsAlert } from '../../utils/opsAlert.js';

const WAITING_DURATION = 4000; // 4s
const FLIPPING_DURATION = 5000; // 5s
const RESOLVED_DURATION = 3000; // 3s
const TICK_INTERVAL = 1000; // 1s tick
const REDIS_KEY = 'candleflip:current';
const PAYOUT_MULTIPLIER = 1.9; // winners get 1.9x

interface RoundBet {
  userId: string;
  username: string;
  avatarUrl: string | null;
  pick: 'bullish' | 'bearish';
  betAmount: number;
  payout: number;
  status: 'pending' | 'won' | 'lost';
}

interface CandleflipState {
  roundId: string;
  roundNumber: number;
  status: 'waiting' | 'flipping' | 'resolved';
  seedHash: string;
  seed: string | null;
  result: 'bullish' | 'bearish' | null;
  resultMultiplier: number | null;
  candles: Candle[];
  bets: RoundBet[];
  waitEndsAt: number | null;
  flipStartedAt: number | null;
  flipEndsAt: number | null;
  resolvedAt: number | null;
}

let tickTimer: ReturnType<typeof setInterval> | null = null;
let state: CandleflipState | null = null;
const inFlightBets = new Set<string>();
let hiddenSeed = '';
let hiddenResult: 'bullish' | 'bearish' = 'bullish';
let hiddenMultiplier = 1.0;
let hiddenCandles: Candle[] = [];
let phaseStartedAt = 0;

const db = () => getDb();
const wallet = new WalletService();

import { generateBinaryResult } from '../../utils/provablyFair.js';

function generateResult(seed: string, roundId: string): { result: 'bullish' | 'bearish'; multiplier: number } {
  // Uses HMAC-SHA256(serverSeed, roundId:0) for deterministic, verifiable result
  return generateBinaryResult(seed, roundId, 0);
}

async function saveToRedis() {
  if (!state) return;
  const redis = getRedis();
  const publicState: CandleflipState = {
    ...state,
    seed: state.status === 'resolved' ? state.seed : null,
  };
  await redis.set(REDIS_KEY, JSON.stringify(publicState), 'EX', 60);
}

async function startNewRound() {
  const roundId = crypto.randomUUID();
  hiddenSeed = crypto.randomBytes(32).toString('hex');
  const seedHash = crypto.createHash('sha256').update(hiddenSeed).digest('hex');
  const { result, multiplier } = generateResult(hiddenSeed, roundId);
  hiddenResult = result;
  hiddenMultiplier = multiplier;
  hiddenCandles = generateCandleflipChart(hiddenMultiplier, 10);

  const [round] = await db().insert(candleflipRounds).values({
    id: roundId,
    status: 'waiting',
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
    result: null,
    resultMultiplier: null,
    candles: [],
    bets: [],
    waitEndsAt: phaseStartedAt + WAITING_DURATION,
    flipStartedAt: null,
    flipEndsAt: null,
    resolvedAt: null,
  };

  await saveToRedis();
}

async function transitionToFlipping() {
  if (!state) return;
  state.status = 'flipping';
  state.waitEndsAt = null;
  state.flipStartedAt = Date.now();
  state.flipEndsAt = Date.now() + FLIPPING_DURATION;
  // Reveal candles progressively — send all but mark how many should be shown
  state.candles = hiddenCandles;
  phaseStartedAt = Date.now();

  await db().update(candleflipRounds)
    .set({ status: 'flipping', flipStartedAt: new Date() })
    .where(eq(candleflipRounds.id, state.roundId));

  await saveToRedis();
}

async function transitionToResolved() {
  if (!state) return;
  state.status = 'resolved';
  state.seed = hiddenSeed;
  state.result = hiddenResult;
  state.resultMultiplier = hiddenMultiplier;
  state.resolvedAt = Date.now();
  phaseStartedAt = Date.now();

  // Settle all bets
  const database = db();
  const failedSettlements: { userId: string; betAmount: number; payout: number }[] = [];
  for (const bet of state.bets) {
    const won = bet.pick === hiddenResult;
    bet.status = won ? 'won' : 'lost';
    bet.payout = won ? Math.floor(bet.betAmount * PAYOUT_MULTIPLIER) : 0;

    await database.update(candleflipRoundBets)
      .set({ status: bet.status, payout: bet.payout, settledAt: new Date() })
      .where(and(
        eq(candleflipRoundBets.roundId, state.roundId),
        eq(candleflipRoundBets.userId, bet.userId)
      ));

    // Settle wallet
    const user = await database.query.users.findFirst({ where: eq(users.id, bet.userId) });
    if (user && user.role !== 'bot') {
      try {
        await wallet.settlePayout(bet.userId, bet.betAmount, 0, bet.payout, 'SOL', { type: 'candleflip_round', id: state.roundId });
        auditLog({ action: 'candleflip_round_settle', userId: bet.userId, game: 'candleflip_round', gameId: state.roundId, betAmount: bet.betAmount, payoutAmount: bet.payout, status: 'success' });
      } catch (err: any) {
        console.error('[CandleflipRound] settlePayout failed:', err, { userId: bet.userId, roundId: state.roundId, payout: bet.payout });
        await recordFailedSettlement({
          userId: bet.userId, game: 'candleflip_round', gameRefType: 'candleflip_round', gameRefId: state.roundId,
          betAmount: bet.betAmount, fee: 0, payoutAmount: bet.payout,
          errorMessage: err.message || 'Round settlement failed',
        });
        if (bet.payout > 0) {
          failedSettlements.push({ userId: bet.userId, betAmount: bet.betAmount, payout: bet.payout });
        }
      }
    }
  }

  if (failedSettlements.length > 0) {
    console.error('[CandleflipRound] Round has failed winner settlements, not marking as fully resolved:', { roundId: state.roundId, failedSettlements });
  }

  await database.update(candleflipRounds)
    .set({
      status: 'resolved',
      result: hiddenResult,
      resultMultiplier: hiddenMultiplier.toFixed(4),
      candleData: hiddenCandles,
      resolvedAt: new Date(),
      playerCount: state.bets.length,
      totalBullish: state.bets.filter(b => b.pick === 'bullish').length,
      totalBearish: state.bets.filter(b => b.pick === 'bearish').length,
    })
    .where(eq(candleflipRounds.id, state.roundId));

  // Retry failed settlements once
  for (const failed of failedSettlements) {
    try {
      await wallet.settlePayout(failed.userId, failed.betAmount, 0, failed.payout, 'SOL', { type: 'candleflip_round', id: state.roundId });
      console.log('[CandleflipRound] Retry succeeded for user:', failed.userId);
    } catch (retryErr: any) {
      console.error('[CandleflipRound] Retry also failed for user:', failed.userId, retryErr);
      await recordFailedSettlement({
        userId: failed.userId, game: 'candleflip_round', gameRefType: 'candleflip_round', gameRefId: state.roundId,
        betAmount: failed.betAmount, fee: 0, payoutAmount: failed.payout,
        errorMessage: retryErr.message || 'Retry settlement failed',
      });
    }
  }

  await saveToRedis();
}

async function tick() {
  if (!state) return;
  const elapsed = Date.now() - phaseStartedAt;

  if (state.status === 'waiting' && elapsed >= WAITING_DURATION) {
    await transitionToFlipping();
  } else if (state.status === 'flipping' && elapsed >= FLIPPING_DURATION) {
    await transitionToResolved();
  } else if (state.status === 'resolved' && elapsed >= RESOLVED_DURATION) {
    await startNewRound();
  }
}

// ─── Public API ────────────────────────────────────────────

export async function getCandleflipCurrentRound(): Promise<CandleflipState | null> {
  try {
    const redis = getRedis();
    const data = await redis.get(REDIS_KEY);
    if (data) return JSON.parse(data);
  } catch { /* fallback */ }
  return state ? { ...state, seed: state.status === 'resolved' ? state.seed : null } : null;
}

export async function betOnRound(userId: string, pick: 'bullish' | 'bearish', betAmount: number): Promise<{ success: boolean; message?: string }> {
  if (!state || state.status !== 'waiting') {
    return { success: false, message: 'No round in waiting phase.' };
  }

  // Max bet guardrail
  if (betAmount > env.CANDLEFLIP_MAX_BET_LAMPORTS) {
    recordOpsAlert({
      severity: 'warning', category: 'bet_cap_violation',
      message: `Candleflip round bet rejected: ${betAmount} > max ${env.CANDLEFLIP_MAX_BET_LAMPORTS}`,
      userId, game: 'candleflip', metadata: { betAmount, limit: env.CANDLEFLIP_MAX_BET_LAMPORTS },
    }).catch(() => {});
    return { success: false, message: `Maximum bet is ${(env.CANDLEFLIP_MAX_BET_LAMPORTS / 1e9).toFixed(2)} SOL during platform bootstrap phase.` };
  }

  if (state.bets.some(b => b.userId === userId)) {
    return { success: false, message: 'Already bet in this round.' };
  }

  // Prevent concurrent bets from the same user
  if (inFlightBets.has(userId)) {
    return { success: false, message: 'Bet already in progress.' };
  }
  inFlightBets.add(userId);
  try {
    const database = db();
    const user = await database.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) return { success: false, message: 'User not found.' };

    if (user.role !== 'bot') {
      await wallet.lockFunds(userId, betAmount, 'SOL', { type: 'candleflip_round', id: state.roundId });
    }

    try {
      await database.insert(candleflipRoundBets).values({
        roundId: state.roundId,
        userId,
        pick,
        betAmount,
        status: 'pending',
        isDemo: false,
      });
    } catch (err) {
      // DB insert failed — rollback the fund lock
      if (user.role !== 'bot') {
        try { await wallet.releaseFunds(userId, betAmount, 'SOL', { type: 'candleflip_round', id: state.roundId }); } catch {}
      }
      throw err;
    }

    state.bets.push({
      userId,
      username: user.username || 'Player',
      avatarUrl: user.avatarUrl || null,
      pick,
      betAmount,
      payout: 0,
      status: 'pending',
    });

    await saveToRedis();
    return { success: true };
  } finally {
    inFlightBets.delete(userId);
  }
}

export async function getRecentCandleflipRounds(limit: number = 10) {
  return db().select({
    id: candleflipRounds.id,
    roundNumber: candleflipRounds.roundNumber,
    result: candleflipRounds.result,
    resultMultiplier: candleflipRounds.resultMultiplier,
    playerCount: candleflipRounds.playerCount,
    resolvedAt: candleflipRounds.resolvedAt,
  })
  .from(candleflipRounds)
  .where(eq(candleflipRounds.status, 'resolved'))
  .orderBy(desc(candleflipRounds.resolvedAt))
  .limit(limit);
}

const cfReporter = createWorkerReporter('candleflip-round-manager');

export async function startCandleflipRoundManager() {
  console.log('[CandleflipRoundManager] Starting...');
  await startNewRound();
  const wrappedTick = withWorkerRecovery('candleflip-round-manager', tick, cfReporter);
  tickTimer = setInterval(wrappedTick, TICK_INTERVAL);
}

export function stopCandleflipRoundManager() {
  cfReporter.stop();
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}
