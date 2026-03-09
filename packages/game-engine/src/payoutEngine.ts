// ─── P2P Payout Engine ───────────────────────────────────────────────────────
// Calculates pool-based payouts for battle mode rounds.

import type { EngineConfig } from './engineConfig.js';

export interface P2PPlayerEntry {
  playerId: string;
  betAmount: number;
  finalMultiplier: number;
}

export interface P2PPlayerPayout {
  playerId: string;
  payout: number;
  band: 'top' | 'medium' | 'breakeven' | 'loss';
  rank: number;
}

export interface P2PPoolResult {
  grossPool: number;
  platformFee: number;
  netPool: number;
  feeRate: number;
  playerPayouts: P2PPlayerPayout[];
}

/**
 * Calculate P2P payouts for a battle round.
 * Players are ranked by finalMultiplier, then paid from the net pool
 * according to configurable band percentages.
 */
export function calculateP2PPayout(
  players: P2PPlayerEntry[],
  config: EngineConfig,
  fixedFeeRate?: number,
): P2PPoolResult {
  const { p2pPayout } = config;

  // Pool
  const grossPool = players.reduce((sum, p) => sum + p.betAmount, 0);
  const feeRate = fixedFeeRate ?? (p2pPayout.feeRate.min + p2pPayout.feeRate.max) / 2;
  const platformFee = grossPool * feeRate;
  const netPool = grossPool - platformFee;

  // Rank players by finalMultiplier descending
  const ranked = [...players].sort((a, b) => b.finalMultiplier - a.finalMultiplier);
  const n = ranked.length;

  if (n === 0) {
    return { grossPool: 0, platformFee: 0, netPool: 0, feeRate, playerPayouts: [] };
  }

  // Calculate band boundaries
  const { bands } = p2pPayout;
  const topCutoff = Math.max(1, Math.ceil(n * bands.topPercent));
  const medCutoff = topCutoff + Math.max(0, Math.ceil(n * bands.mediumPercent));
  const breakCutoff = medCutoff + Math.max(0, Math.ceil(n * bands.breakEvenPercent));

  // Allocate pool shares to bands
  // Top band gets 50% of net pool, medium gets 30%, breakeven gets their bet back, loss gets nothing
  const topPoolShare = netPool * 0.50;
  const medPoolShare = netPool * 0.30;
  const breakPoolShare = netPool * 0.20; // Used to refund break-even players

  const payouts: P2PPlayerPayout[] = [];

  for (let i = 0; i < n; i++) {
    const player = ranked[i];
    let payout: number;
    let band: P2PPlayerPayout['band'];

    if (i < topCutoff) {
      // Top band: split top pool share proportionally by bet
      const bandBets = ranked.slice(0, topCutoff).reduce((s, p) => s + p.betAmount, 0);
      payout = bandBets > 0 ? (player.betAmount / bandBets) * topPoolShare : 0;
      band = 'top';
    } else if (i < medCutoff) {
      // Medium band: split medium pool share proportionally by bet
      const bandBets = ranked.slice(topCutoff, medCutoff).reduce((s, p) => s + p.betAmount, 0);
      payout = bandBets > 0 ? (player.betAmount / bandBets) * medPoolShare : 0;
      band = 'medium';
    } else if (i < breakCutoff) {
      // Break-even band: get their bet back (from breakPoolShare)
      const bandBets = ranked.slice(medCutoff, breakCutoff).reduce((s, p) => s + p.betAmount, 0);
      payout = bandBets > 0 ? (player.betAmount / bandBets) * breakPoolShare : 0;
      band = 'breakeven';
    } else {
      // Loss band: nothing
      payout = 0;
      band = 'loss';
    }

    payouts.push({
      playerId: player.playerId,
      payout: Math.round(payout * 100) / 100,
      band,
      rank: i + 1,
    });
  }

  return { grossPool, platformFee, netPool, feeRate, playerPayouts: payouts };
}
