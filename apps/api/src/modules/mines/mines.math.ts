/**
 * TradeGems Mines — Economy math + board generation
 *
 * RTP: 95% | House Edge: 5% (embedded)
 * Grid: 5x5 (25 tiles)
 * Mine counts: 1, 3, 5, 7, 10
 *
 * Multiplier formula:
 *   houseMultiplier(k, m) = 0.95 × ∏(i=0..k-1) [(25-i) / (25-m-i)]
 *   Floored to 2 decimal places (always round in house's favor)
 *   Clamped: min 1.00 on first pick, max 50.00
 */

import crypto from 'node:crypto';
import { GRID_SIZE, HOUSE_EDGE, MAX_MULTIPLIER, type GemTier } from './mines.types.js';

// ─── Multiplier Calculation ──────────────────────────────────

/**
 * Calculate house-adjusted multiplier for k safe picks with m mines.
 * Returns value floored to 2 decimal places.
 */
export function getMultiplier(picks: number, mines: number): number {
  if (picks <= 0) return 1.00;

  const n = GRID_SIZE; // 25
  let fair = 1;
  for (let i = 0; i < picks; i++) {
    fair *= (n - i) / (n - mines - i);
  }

  const adjusted = fair * (1 - HOUSE_EDGE);

  // Floor to 2 decimals (house-favorable rounding)
  let result = Math.floor(adjusted * 100) / 100;

  // Minimum 1.00x on first pick (avoids paying less than bet)
  if (picks === 1 && result < 1.00) result = 1.00;

  // Cap at MAX_MULTIPLIER
  return Math.min(result, MAX_MULTIPLIER);
}

/**
 * Get the multiplier the player would reach on their NEXT pick.
 * Used for UI preview ("Next: X.XXx").
 */
export function getNextMultiplier(currentPicks: number, mines: number): number {
  return getMultiplier(currentPicks + 1, mines);
}

/**
 * Calculate payout in lamports.
 * Always floors — never overpay.
 */
export function calculatePayout(betAmount: number, multiplier: number): number {
  return Math.floor(betAmount * multiplier);
}

// ─── Board Generation (Provably Fair) ────────────────────────

/**
 * Generate mine positions from seeds using Fisher-Yates shuffle.
 * Deterministic: same (serverSeed, clientSeed, gameId) → same board.
 *
 * Returns sorted array of mine position indices (0-24).
 */
export function generateBoard(
  serverSeed: string,
  clientSeed: string,
  gameId: string,
  mineCount: number,
): number[] {
  const combined = `${serverSeed}:${clientSeed}:${gameId}`;

  // Create array [0, 1, 2, ..., 24]
  const positions = Array.from({ length: GRID_SIZE }, (_, i) => i);

  // Fisher-Yates shuffle using iterative HMAC for unlimited entropy
  // Each swap gets its own hash derivation — no bias from reusing bytes
  for (let i = GRID_SIZE - 1; i > 0; i--) {
    const iterHash = crypto.createHmac('sha256', combined)
      .update(String(i))
      .digest('hex');
    const value = parseInt(iterHash.slice(0, 8), 16); // 4 bytes = 32 bits
    const j = value % (i + 1);
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }

  // First mineCount positions in shuffled array are mines
  return positions.slice(0, mineCount).sort((a, b) => a - b);
}

/**
 * Check if a position (0-24) is a mine on the given board.
 */
export function isMine(board: number[], position: number): boolean {
  return board.includes(position);
}

/**
 * Convert flat index (0-24) to {x, y} coordinates.
 */
export function indexToCoord(index: number): { x: number; y: number } {
  return { x: index % 5, y: Math.floor(index / 5) };
}

/**
 * Convert {x, y} coordinates to flat index (0-24).
 */
export function coordToIndex(x: number, y: number): number {
  return y * 5 + x;
}

/**
 * Get all mine positions as {x, y} coordinates.
 */
export function getMinePositions(board: number[]): { x: number; y: number }[] {
  return board.map(indexToCoord);
}

// ─── Gem Tier ────────────────────────────────────────────────

/**
 * Cosmetic gem tier based on pick number (0-indexed).
 */
export function getGemTier(pickNumber: number): GemTier {
  if (pickNumber < 3) return 'emerald';
  if (pickNumber < 7) return 'sapphire';
  if (pickNumber < 12) return 'amethyst';
  return 'diamond';
}

// ─── Seed Generation ─────────────────────────────────────────

export function generateServerSeed(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashSeed(seed: string): string {
  return crypto.createHash('sha256').update(seed).digest('hex');
}

export function generateClientSeed(userId: string): string {
  return `player-${userId}-${Date.now()}`;
}

// ─── Verification ────────────────────────────────────────────

/**
 * Verify that a seed matches its hash. Used for provably fair verification.
 */
export function verifySeed(seed: string, seedHash: string): boolean {
  return hashSeed(seed) === seedHash;
}
