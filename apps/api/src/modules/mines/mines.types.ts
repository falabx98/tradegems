/**
 * TradeGems Mines — Type definitions
 */

export interface RevealedCell {
  x: number;       // column 0-4
  y: number;       // row 0-4
  safe: boolean;
  multiplier: number; // multiplier at time of reveal
  gemTier: GemTier;
}

export type GemTier = 'emerald' | 'sapphire' | 'amethyst' | 'diamond';

export type MinesGameStatus = 'active' | 'cashed_out' | 'lost';

export interface MinesGame {
  id: string;
  userId: string;
  betAmount: number;
  mineCount: number;
  revealedCells: RevealedCell[];
  revealCount: number;
  currentMultiplier: number;
  finalMultiplier: number | null;
  payout: number | null;
  status: MinesGameStatus;
  seed: string;
  seedHash: string;
  clientSeed: string;
  board: number[];     // flat array of mine position indices (0-24)
  createdAt: Date;
  resolvedAt: Date | null;
}

/** Returned to client on game start — never includes seed or board */
export interface MinesGamePublic {
  id: string;
  betAmount: number;
  mineCount: number;
  seedHash: string;
  status: MinesGameStatus;
  revealedCells: RevealedCell[];
  revealCount: number;
  currentMultiplier: number;
  createdAt: string;
}

/** Returned after game ends — includes seed + mine positions for verification */
export interface MinesGameResult extends MinesGamePublic {
  seed: string;
  clientSeed: string;
  minePositions: { x: number; y: number }[];
  finalMultiplier: number;
  payout: number;
}

export interface RevealResult {
  safe: boolean;
  position: { x: number; y: number };
  multiplier: number;
  gemTier: GemTier;
  /** Only populated when mine is hit (game over) */
  gameOver?: {
    seed: string;
    clientSeed: string;
    minePositions: { x: number; y: number }[];
  };
}

export interface CashoutResult {
  payout: number;
  finalMultiplier: number;
  seed: string;
  clientSeed: string;
  minePositions: { x: number; y: number }[];
}

export const GRID_SIZE = 25;
export const GRID_COLS = 5;
export const HOUSE_EDGE = 0.05;
export const MAX_MULTIPLIER = 50;
export const VALID_MINE_COUNTS = [1, 3, 5, 7, 10] as const;
export const GAME_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
