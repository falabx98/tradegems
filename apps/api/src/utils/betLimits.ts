/**
 * Server-side bet caps and exposure limits.
 * Prevents unreasonable financial exposure from a single bet or user.
 */

import { eq, and } from 'drizzle-orm';
import { balances } from '@tradingarena/db';
import { getDb } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { recordOpsAlert } from './opsAlert.js';
import { getCircuitBreakerState } from './treasuryMonitor.js';

// ─── Game-specific limits lookup ────────────────────────────

export type HouseGame = 'rug-game' | 'mines' | 'predictions' | 'solo' | 'candleflip';

interface GameLimits {
  maxBet: number;
  maxPayout: number;
}

function getGameLimits(game: HouseGame): GameLimits {
  switch (game) {
    case 'rug-game':
      return { maxBet: env.RUG_MAX_BET_LAMPORTS, maxPayout: env.RUG_MAX_PAYOUT_LAMPORTS };
    case 'mines':
      return { maxBet: env.MINES_MAX_BET_LAMPORTS, maxPayout: env.MINES_MAX_PAYOUT_LAMPORTS };
    case 'predictions':
      return { maxBet: env.PREDICTIONS_MAX_BET_LAMPORTS, maxPayout: env.PREDICTIONS_MAX_PAYOUT_LAMPORTS };
    case 'solo':
      return { maxBet: env.SOLO_MAX_BET_LAMPORTS, maxPayout: env.SOLO_MAX_PAYOUT_LAMPORTS };
    case 'candleflip':
      return { maxBet: env.CANDLEFLIP_MAX_BET_LAMPORTS, maxPayout: env.CANDLEFLIP_MAX_PAYOUT_LAMPORTS };
  }
}

// ─── Shared game-specific bet validation ────────────────────

/**
 * Validate bet amount and potential payout against game-specific limits.
 * Call this in every house-game route BEFORE lockFunds.
 *
 * Checks:
 * 0. Circuit breaker — reject all bets if critical, reduce limits if warning
 * 1. betAmount does not exceed the game's max bet (adjusted by circuit breaker)
 * 2. potentialMaxPayout does not exceed the game's max payout (if provided)
 *
 * Logs rejected bets to ops_alerts for monitoring.
 * Throws AppError on violation.
 */
export function validateGameBetLimits(
  game: HouseGame,
  userId: string,
  betAmount: number,
  potentialMaxPayout?: number,
): void {
  const limits = getGameLimits(game);

  // 0. Circuit breaker check (sync — reads from cached state)
  // Note: actual state update is async via treasuryMonitor, but the cached
  // value in Redis is read synchronously by getCircuitBreakerState().
  // We do this check non-blocking — if Redis fails, limits are unchanged.
  checkCircuitBreakerSync(game, userId, betAmount, limits);

  // 1. Max bet check
  if (betAmount > limits.maxBet) {
    recordOpsAlert({
      severity: 'warning',
      category: 'bet_cap_violation',
      message: `${game} bet rejected: ${betAmount} lamports > max ${limits.maxBet}`,
      userId,
      game,
      metadata: { betAmount, limit: limits.maxBet },
    }).catch(() => {});

    throw new AppError(
      400,
      'BET_EXCEEDS_GAME_CAP',
      `Maximum bet for this game is ${(limits.maxBet / 1e9).toFixed(2)} SOL during platform bootstrap phase.`,
    );
  }

  // 2. Max payout check (when caller can compute worst-case payout)
  if (potentialMaxPayout !== undefined && potentialMaxPayout > limits.maxPayout) {
    recordOpsAlert({
      severity: 'warning',
      category: 'bet_cap_violation',
      message: `${game} bet rejected: potential payout ${potentialMaxPayout} > max ${limits.maxPayout}`,
      userId,
      game,
      metadata: { betAmount, potentialMaxPayout, limit: limits.maxPayout },
    }).catch(() => {});

    throw new AppError(
      400,
      'PAYOUT_EXCEEDS_GAME_CAP',
      `This bet could exceed the maximum payout of ${(limits.maxPayout / 1e9).toFixed(0)} SOL. Please reduce your bet.`,
    );
  }
}

/**
 * Clamp a computed payout to the game's max payout cap.
 * Returns { payout, wasCapped }. Logs to ops_alerts if truncated.
 */
export function clampPayout(
  game: HouseGame,
  userId: string,
  payout: number,
  metadata?: Record<string, unknown>,
): { payout: number; wasCapped: boolean } {
  const limits = getGameLimits(game);

  if (payout <= limits.maxPayout) {
    return { payout, wasCapped: false };
  }

  recordOpsAlert({
    severity: 'warning',
    category: 'payout_outlier',
    message: `${game} payout truncated: ${payout} → ${limits.maxPayout}`,
    userId,
    game,
    metadata: { originalPayout: payout, cap: limits.maxPayout, ...metadata },
  }).catch(() => {});

  return { payout: limits.maxPayout, wasCapped: true };
}

// ─── Global per-user exposure validation ────────────────────

/**
 * Validate that a bet amount is within server-side limits.
 * Call this BEFORE lockFunds.
 *
 * Checks:
 * 1. betAmount does not exceed per-bet cap (global)
 * 2. User's total locked funds after this bet don't exceed per-user cap
 */
export async function validateBetLimits(
  userId: string,
  betAmount: number,
  fee: number = 0,
): Promise<void> {
  const totalCost = betAmount + fee;

  // 1. Per-bet cap (global)
  if (betAmount > env.MAX_BET_LAMPORTS) {
    throw new AppError(
      400,
      'BET_EXCEEDS_CAP',
      `Maximum bet is ${(env.MAX_BET_LAMPORTS / 1e9).toFixed(2)} SOL. You tried to bet ${(betAmount / 1e9).toFixed(4)} SOL.`,
    );
  }

  // 2. Per-user exposure cap — check current locked amount
  const db = getDb();
  const bal = await db.query.balances.findFirst({
    where: and(eq(balances.userId, userId), eq(balances.asset, 'SOL')),
  });

  const currentLocked = bal?.lockedAmount ?? 0;
  const projectedLocked = currentLocked + totalCost;

  if (projectedLocked > env.MAX_USER_LOCKED_LAMPORTS) {
    throw new AppError(
      400,
      'EXPOSURE_LIMIT',
      `This bet would exceed your maximum exposure limit. You have ${(currentLocked / 1e9).toFixed(4)} SOL locked. Maximum allowed: ${(env.MAX_USER_LOCKED_LAMPORTS / 1e9).toFixed(2)} SOL.`,
    );
  }
}

// ─── Circuit breaker integration ───────────────────────────

/**
 * Cached circuit breaker state — updated every ~2 min by treasuryMonitor.
 * Local in-memory mirror to avoid Redis call on every bet validation.
 *
 * States: 'healthy' | 'warning' | 'critical' | 'maintenance'
 *  - healthy:     full limits
 *  - warning:     max bets reduced by CIRCUIT_BREAKER_BET_REDUCTION (50%)
 *  - critical:    house games paused, only Trading Sim allowed
 *  - maintenance: ALL paused except Trading Sim
 */
let _cbStateCache: { state: string; updatedAt: number } = { state: 'healthy', updatedAt: 0 };
const CB_CACHE_TTL_MS = 10_000; // Refresh from Redis every 10s

function checkCircuitBreakerSync(
  game: HouseGame,
  userId: string,
  betAmount: number,
  limits: GameLimits,
): void {
  const now = Date.now();

  // Refresh from Redis in background if stale
  if (now - _cbStateCache.updatedAt > CB_CACHE_TTL_MS) {
    getCircuitBreakerState().then(state => {
      _cbStateCache = { state, updatedAt: Date.now() };
    }).catch(() => {});
  }

  const state = _cbStateCache.state;

  // Critical or Maintenance: block all house-game bets
  // (Trading Sim is NOT a HouseGame — it uses a different validation path)
  if (state === 'critical' || state === 'maintenance') {
    recordOpsAlert({
      severity: 'critical',
      category: 'circuit_breaker',
      message: `${game} bet rejected: circuit breaker ${state.toUpperCase()}`,
      userId,
      game,
      metadata: { betAmount },
    }).catch(() => {});

    const msg = state === 'maintenance'
      ? 'Platform is in maintenance mode. Only Trading Sim is available. Your balance is safe.'
      : 'Limited capacity — only Trading Sim is available right now. Please try again later.';

    throw new AppError(503, 'GAMES_PAUSED', msg);
  }

  // Warning: enforce reduced limits
  if (state === 'warning') {
    const reducedMaxBet = Math.floor(limits.maxBet * env.CIRCUIT_BREAKER_BET_REDUCTION);
    if (betAmount > reducedMaxBet) {
      throw new AppError(
        400,
        'BET_EXCEEDS_REDUCED_CAP',
        `High demand — maximum bet is temporarily reduced to ${(reducedMaxBet / 1e9).toFixed(2)} SOL. Please reduce your bet amount.`,
      );
    }
  }
}

/**
 * Get the effective max bet for a game (accounting for circuit breaker).
 * Used by frontend to show current limits.
 */
export function getEffectiveGameLimits(game: HouseGame): GameLimits & { circuitBreakerState: string } {
  const limits = getGameLimits(game);
  const state = _cbStateCache.state;

  if (state === 'warning') {
    return {
      maxBet: Math.floor(limits.maxBet * env.CIRCUIT_BREAKER_BET_REDUCTION),
      maxPayout: limits.maxPayout,
      circuitBreakerState: state,
    };
  }

  if (state === 'critical' || state === 'maintenance') {
    return { maxBet: 0, maxPayout: 0, circuitBreakerState: state };
  }

  return { ...limits, circuitBreakerState: state };
}
