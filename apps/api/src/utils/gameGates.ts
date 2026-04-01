import { eq } from 'drizzle-orm';
import { featureFlags } from '@tradingarena/db';
import { getDb } from '../config/database.js';
import { getRedis } from '../config/redis.js';
import { AppError } from '../middleware/errorHandler.js';

// Cache flag state in Redis for 30s to avoid DB queries on every bet
const CACHE_TTL = 30; // seconds
const CACHE_PREFIX = 'game:enabled:';

/**
 * Game flag keys — stored in feature_flags table.
 * When flag.enabled = false, the game rejects new bets/joins.
 */
const GAME_FLAG_KEYS: Record<string, string> = {
  'rug-game': 'game_rug_enabled',
  'solo': 'game_solo_enabled',
  'predictions': 'game_predictions_enabled',
  'candleflip': 'game_candleflip_enabled',
  'trading-sim': 'game_trading_sim_enabled',
  'lottery': 'game_lottery_enabled',
};

/**
 * Check if a game is enabled. Throws AppError 503 if disabled.
 * Uses Redis cache to avoid DB hit on every request.
 * If flag doesn't exist in DB, game is assumed enabled (safe default).
 */
export async function requireGameEnabled(gameId: string): Promise<void> {
  const flagKey = GAME_FLAG_KEYS[gameId];
  if (!flagKey) return; // Unknown game ID — allow (don't block on misconfiguration)

  try {
    const redis = getRedis();
    const cacheKey = CACHE_PREFIX + flagKey;

    // Check Redis cache first
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      if (cached === '0') {
        throw new AppError(503, 'GAME_DISABLED', `${gameId} is currently under maintenance. Please try again later.`);
      }
      return; // cached === '1' means enabled
    }

    // Cache miss — check DB
    const db = getDb();
    const flag = await db.query.featureFlags.findFirst({
      where: eq(featureFlags.flagKey, flagKey),
    });

    // If flag doesn't exist, game is enabled by default
    const isEnabled = flag ? flag.enabled : true;

    // Cache the result
    await redis.set(cacheKey, isEnabled ? '1' : '0', 'EX', CACHE_TTL);

    if (!isEnabled) {
      throw new AppError(503, 'GAME_DISABLED', `${gameId} is currently under maintenance. Please try again later.`);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    // If Redis/DB fails, allow the game (fail-open is safer than blocking all bets)
    console.warn(`[GameGates] Failed to check flag for ${gameId}:`, err);
  }
}

/**
 * Invalidate the cached flag for a game (call after admin toggles a flag).
 */
export async function invalidateGameFlag(flagKey: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(CACHE_PREFIX + flagKey);
  } catch { /* ignore */ }
}
