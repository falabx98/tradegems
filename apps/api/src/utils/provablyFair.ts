/**
 * TradeGems Provably Fair System
 *
 * Standard pattern across all games:
 * 1. BEFORE game: generate serverSeed, compute seedHash = sha256(serverSeed)
 * 2. Player provides clientSeed (or gets a random one)
 * 3. Result = HMAC-SHA256(serverSeed, clientSeed + ":" + nonce)
 * 4. AFTER game: reveal serverSeed for verification
 *
 * Reference implementation: Mines (mines.service.ts)
 */

import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../config/database.js';

// ─── Core Cryptographic Functions ───────────────────────────

/** Generate a 32-byte server seed */
export function generateServerSeed(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Generate a random client seed (16 bytes) */
export function generateClientSeed(): string {
  return crypto.randomBytes(16).toString('hex');
}

/** Hash a seed with SHA-256 (commitment) */
export function hashSeed(seed: string): string {
  return crypto.createHash('sha256').update(seed).digest('hex');
}

/** Verify a seed matches its hash */
export function verifySeed(seed: string, expectedHash: string): boolean {
  return hashSeed(seed) === expectedHash;
}

/**
 * Generate a deterministic result using HMAC-SHA256.
 * This is the core fairness function — given the same inputs, always produces the same output.
 *
 * @param serverSeed - Server's secret seed (revealed after game)
 * @param clientSeed - Player's seed (known before game)
 * @param nonce - Incrementing counter per user (prevents replay)
 * @returns hex string of HMAC result
 */
export function generateHmacResult(serverSeed: string, clientSeed: string, nonce: number | string): string {
  return crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest('hex');
}

/**
 * Convert HMAC hex to a float between 0 and 1 (inclusive).
 * Uses first 8 hex chars (32 bits) for uniform distribution.
 */
export function hmacToFloat(hmacHex: string): number {
  return parseInt(hmacHex.substring(0, 8), 16) / 0xFFFFFFFF;
}

/**
 * Convert HMAC hex to an integer in range [min, max] (inclusive).
 */
export function hmacToInt(hmacHex: string, min: number, max: number, offset = 0): number {
  // Use different portions of the hash for different numbers
  const slice = hmacHex.substring(offset * 8, offset * 8 + 8);
  const value = parseInt(slice || hmacHex.substring(0, 8), 16);
  return min + (value % (max - min + 1));
}

/**
 * Generate a crash point (for Rug Game style games).
 * House edge is embedded in the calculation.
 */
export function generateCrashPoint(serverSeed: string, clientSeed: string, nonce: number | string, houseEdge = 0.05): number {
  const hmac = generateHmacResult(serverSeed, clientSeed, nonce);
  const h = parseInt(hmac.substring(0, 13), 16);

  // 1 in 25 chance of instant crash (1.00x)
  if (h % 25 === 0) return 1.00;

  const e = Math.pow(2, 52);
  const raw = e / (e - (h % e));
  const result = Math.max(1.00, raw * (1 - houseEdge));
  return Math.min(parseFloat(result.toFixed(2)), 100.00);
}

/**
 * Generate a binary outcome (bull/bear for Candleflip).
 * Returns { result, multiplier } deterministically.
 */
export function generateBinaryResult(
  serverSeed: string,
  clientSeed: string,
  nonce: number | string,
): { result: 'bullish' | 'bearish'; multiplier: number } {
  const hmac = generateHmacResult(serverSeed, clientSeed, nonce);
  const value = parseInt(hmac.substring(0, 8), 16);
  const multiplier = parseFloat((0.50 + (value / 0xFFFFFFFF)).toFixed(4));
  return {
    result: multiplier >= 1.0 ? 'bullish' : 'bearish',
    multiplier,
  };
}

/**
 * Generate a win/loss outcome (for Predictions).
 * @param winProbability - probability of winning (0 to 1)
 */
export function generatePredictionOutcome(
  serverSeed: string,
  clientSeed: string,
  nonce: number | string,
  winProbability: number,
): { outcome: 'win' | 'loss'; roll: number } {
  const hmac = generateHmacResult(serverSeed, clientSeed, nonce);
  const roll = hmacToFloat(hmac);
  return {
    outcome: roll < winProbability ? 'win' : 'loss',
    roll,
  };
}

/**
 * Generate lottery numbers deterministically.
 * @param count - how many numbers to pick
 * @param max - maximum number (inclusive)
 */
export function generateLotteryNumbers(
  serverSeed: string,
  clientSeed: string,
  count: number,
  max: number,
): number[] {
  const numbers: number[] = [];
  let attempt = 0;

  while (numbers.length < count && attempt < 1000) {
    const hmac = generateHmacResult(serverSeed, clientSeed, `lottery:${attempt}`);
    const num = hmacToInt(hmac, 1, max);
    if (!numbers.includes(num)) {
      numbers.push(num);
    }
    attempt++;
  }

  return numbers.sort((a, b) => a - b);
}

// ─── User Seed State (Nonce Management) ─────────────────────

/**
 * Get or create the user's current client seed and nonce.
 */
export async function getUserSeedState(userId: string): Promise<{ clientSeed: string; nonce: number }> {
  const db = getDb();

  // Try to get existing state
  const result = await db.execute(sql`
    SELECT client_seed, nonce FROM user_seed_state WHERE user_id = ${userId}
  `) as unknown as { client_seed: string; nonce: number }[];

  if (result && result.length > 0) {
    return { clientSeed: result[0].client_seed, nonce: result[0].nonce };
  }

  // Create new state with random client seed
  const clientSeed = generateClientSeed();
  await db.execute(sql`
    INSERT INTO user_seed_state (user_id, client_seed, nonce)
    VALUES (${userId}, ${clientSeed}, 0)
    ON CONFLICT (user_id) DO NOTHING
  `);

  return { clientSeed, nonce: 0 };
}

/**
 * Increment nonce after each bet.
 * Returns the nonce that was used (pre-increment value).
 */
export async function useNonce(userId: string): Promise<{ clientSeed: string; nonce: number }> {
  const db = getDb();

  // Atomic: get current nonce and increment in one operation
  const result = await db.execute(sql`
    INSERT INTO user_seed_state (user_id, client_seed, nonce)
    VALUES (${userId}, ${generateClientSeed()}, 1)
    ON CONFLICT (user_id) DO UPDATE
    SET nonce = user_seed_state.nonce + 1, updated_at = now()
    RETURNING client_seed, nonce - 1 AS used_nonce
  `) as unknown as { client_seed: string; used_nonce: number }[];

  return {
    clientSeed: result[0].client_seed,
    nonce: result[0].used_nonce,
  };
}

/**
 * Rotate the user's client seed (resets nonce to 0).
 */
export async function rotateClientSeed(userId: string, newSeed?: string): Promise<{ clientSeed: string; nonce: number }> {
  const db = getDb();
  const clientSeed = newSeed || generateClientSeed();

  await db.execute(sql`
    INSERT INTO user_seed_state (user_id, client_seed, nonce)
    VALUES (${userId}, ${clientSeed}, 0)
    ON CONFLICT (user_id) DO UPDATE
    SET client_seed = ${clientSeed}, nonce = 0, updated_at = now()
  `);

  return { clientSeed, nonce: 0 };
}
