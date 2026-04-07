/**
 * Payout monitoring: observed RTP and outlier detection.
 *
 * RTP MODEL PER GAME:
 *
 * Predictions: additive fee model
 *   cost basis = betAmount + fee (5%)
 *   observed RTP = sum(payout) / sum(betAmount * 1.05)
 *   expected RTP: up/down ~91.4%, range ~90.9%
 *
 * Rug Game: embedded edge model (no separate fee)
 *   cost basis = betAmount
 *   observed RTP = sum(payout) / sum(betAmount)
 *   expected RTP: ~95% (5% house edge in crash distribution)
 *
 * Candleflip: pool rake model
 *   cost basis = betAmount per player
 *   observed RTP = sum(payout) / sum(betAmount)
 *   expected RTP: 95% (5% pool rake)
 *
 * Trading Sim: pool rake model
 *   cost basis = entry_fee per participant
 *   observed RTP = sum(winner_payout) / sum(entry_fees)
 *   expected RTP: 95% (5% pool rake)
 *
 * Solo: additive fee model
 *   cost basis = betAmount + fee (5%)
 *   observed RTP = sum(payout) / sum(betAmount * 1.05)
 *   expected RTP: ~90-95% (engine-dependent)
 *
 */

import { sql } from 'drizzle-orm';
import { getDb } from '../config/database.js';
import { recordOpsAlert } from './opsAlert.js';
import { auditLog } from './auditLog.js';

// Expected RTP references
const EXPECTED_RTP: Record<string, { rtp: number; label: string }> = {
  predictions:  { rtp: 0.914, label: 'Predictions (Up/Down ~91.4%)' },
  'rug-game':   { rtp: 0.950, label: 'Rug Game (~95%)' },
  candleflip:   { rtp: 0.950, label: 'Candleflip (~95%)' },
  'trading-sim':{ rtp: 0.950, label: 'Trading Sim (~95%)' },
  solo:         { rtp: 0.920, label: 'Solo (~92% est.)' },
};

// Outlier thresholds
const PAYOUT_ABSOLUTE_THRESHOLD = 100_000_000_000; // 100 SOL — any single payout above this
const PAYOUT_MULTIPLIER_THRESHOLD = 20; // any multiplier/ROI above 20x

interface GameRTP {
  game: string;
  expectedRtp: number;
  observedRtp: number | null;
  delta: number | null;
  totalWagered: number;
  totalPaidOut: number;
  sampleSize: number;
  window: string;
}

/**
 * Compute observed RTP for all games over a given time window.
 */
export async function getObservedRTP(windowHours: number = 24): Promise<GameRTP[]> {
  const db = getDb();
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const windowLabel = `${windowHours}h`;

  const results: GameRTP[] = [];

  // Predictions: cost = betAmount * 1.05 (additive fee)
  try {
    const pred = await db.execute(sql`
      SELECT count(*) as cnt,
             COALESCE(sum(bet_amount), 0) as total_bet,
             COALESCE(sum(payout), 0) as total_payout
      FROM prediction_rounds WHERE created_at >= ${since}
    `) as any;
    const row = pred[0] || { cnt: 0, total_bet: 0, total_payout: 0 };
    const totalCost = Number(row.total_bet) * 1.05;
    const totalPaid = Number(row.total_payout);
    const observed = totalCost > 0 ? totalPaid / totalCost : null;
    results.push({
      game: 'predictions', expectedRtp: EXPECTED_RTP.predictions.rtp,
      observedRtp: observed, delta: observed !== null ? observed - EXPECTED_RTP.predictions.rtp : null,
      totalWagered: totalCost, totalPaidOut: totalPaid, sampleSize: Number(row.cnt), window: windowLabel,
    });
  } catch { /* skip */ }

  // Rug Game: cost = betAmount (no separate fee)
  try {
    const rug = await db.execute(sql`
      SELECT count(*) as cnt,
             COALESCE(sum(bet_amount), 0) as total_bet,
             COALESCE(sum(payout), 0) as total_payout
      FROM rug_round_bets WHERE created_at >= ${since}
    `) as any;
    const row = rug[0] || { cnt: 0, total_bet: 0, total_payout: 0 };
    const totalBet = Number(row.total_bet);
    const totalPaid = Number(row.total_payout);
    const observed = totalBet > 0 ? totalPaid / totalBet : null;
    results.push({
      game: 'rug-game', expectedRtp: EXPECTED_RTP['rug-game'].rtp,
      observedRtp: observed, delta: observed !== null ? observed - EXPECTED_RTP['rug-game'].rtp : null,
      totalWagered: totalBet, totalPaidOut: totalPaid, sampleSize: Number(row.cnt), window: windowLabel,
    });
  } catch { /* skip */ }

  // Candleflip: cost = betAmount per player
  try {
    const cf = await db.execute(sql`
      SELECT count(*) as cnt,
             COALESCE(sum(bet_amount), 0) as total_bet,
             COALESCE(sum(payout), 0) as total_payout
      FROM candleflip_round_bets WHERE created_at >= ${since}
    `) as any;
    const row = cf[0] || { cnt: 0, total_bet: 0, total_payout: 0 };
    const totalBet = Number(row.total_bet);
    const totalPaid = Number(row.total_payout);
    const observed = totalBet > 0 ? totalPaid / totalBet : null;
    results.push({
      game: 'candleflip', expectedRtp: EXPECTED_RTP.candleflip.rtp,
      observedRtp: observed, delta: observed !== null ? observed - EXPECTED_RTP.candleflip.rtp : null,
      totalWagered: totalBet, totalPaidOut: totalPaid, sampleSize: Number(row.cnt), window: windowLabel,
    });
  } catch { /* skip */ }

  // Trading Sim: cost = entry_fee per participant in finished rooms
  try {
    const ts = await db.execute(sql`
      SELECT count(DISTINCT r.id) as room_cnt,
             count(p.id) as participant_cnt,
             COALESCE(sum(r.entry_fee), 0) as total_entry,
             COALESCE(sum(CASE WHEN r.winner_id = p.user_id THEN r.prize_pool * 0.95 ELSE 0 END), 0) as total_payout
      FROM trading_sim_rooms r
      JOIN trading_sim_participants p ON p.room_id = r.id
      WHERE r.status = 'finished' AND r.ended_at >= ${since}
    `) as any;
    const row = ts[0] || { room_cnt: 0, participant_cnt: 0, total_entry: 0, total_payout: 0 };
    const totalEntry = Number(row.total_entry);
    const totalPaid = Number(row.total_payout);
    const observed = totalEntry > 0 ? totalPaid / totalEntry : null;
    results.push({
      game: 'trading-sim', expectedRtp: EXPECTED_RTP['trading-sim'].rtp,
      observedRtp: observed, delta: observed !== null ? observed - EXPECTED_RTP['trading-sim'].rtp : null,
      totalWagered: totalEntry, totalPaidOut: totalPaid, sampleSize: Number(row.participant_cnt), window: windowLabel,
    });
  } catch { /* skip */ }

  // Solo: cost = amount + fee (5%)
  try {
    const solo = await db.execute(sql`
      SELECT count(*) as cnt,
             COALESCE(sum(b.amount), 0) as total_bet,
             COALESCE(sum(br.payout_amount), 0) as total_payout
      FROM bets b
      JOIN bet_results br ON br.bet_id = b.id
      WHERE b.created_at >= ${since} AND b.status = 'settled'
    `) as any;
    const row = solo[0] || { cnt: 0, total_bet: 0, total_payout: 0 };
    const totalCost = Number(row.total_bet) * 1.05;
    const totalPaid = Number(row.total_payout);
    const observed = totalCost > 0 ? totalPaid / totalCost : null;
    results.push({
      game: 'solo', expectedRtp: EXPECTED_RTP.solo.rtp,
      observedRtp: observed, delta: observed !== null ? observed - EXPECTED_RTP.solo.rtp : null,
      totalWagered: totalCost, totalPaidOut: totalPaid, sampleSize: Number(row.cnt), window: windowLabel,
    });
  } catch { /* skip */ }

  return results;
}

/**
 * Check a payout for outlier status and record alert if needed.
 * Call AFTER settlement succeeds (not before — don't block valid payouts).
 */
export async function checkPayoutOutlier(params: {
  game: string;
  userId: string;
  gameId: string;
  betAmount: number;
  payoutAmount: number;
  multiplier?: number;
  requestId?: string;
}): Promise<void> {
  const { game, userId, gameId, betAmount, payoutAmount, multiplier, requestId } = params;

  // Skip zero/loss payouts
  if (payoutAmount <= 0 || payoutAmount <= betAmount) return;

  const roi = betAmount > 0 ? payoutAmount / betAmount : 0;
  const isAbsoluteOutlier = payoutAmount >= PAYOUT_ABSOLUTE_THRESHOLD;
  const isMultiplierOutlier = roi >= PAYOUT_MULTIPLIER_THRESHOLD;

  if (isAbsoluteOutlier || isMultiplierOutlier) {
    const reason = isAbsoluteOutlier
      ? `Payout ${(payoutAmount / 1e9).toFixed(4)} SOL exceeds ${(PAYOUT_ABSOLUTE_THRESHOLD / 1e9).toFixed(0)} SOL threshold`
      : `Payout ROI ${roi.toFixed(2)}x exceeds ${PAYOUT_MULTIPLIER_THRESHOLD}x threshold`;

    await recordOpsAlert({
      severity: isAbsoluteOutlier ? 'critical' : 'warning',
      category: 'payout_outlier',
      message: reason,
      userId,
      game,
      requestId,
      metadata: { gameId, betAmount, payoutAmount, multiplier, roi: parseFloat(roi.toFixed(4)) },
    });

    auditLog({
      action: 'payout_outlier_detected',
      requestId,
      userId,
      game,
      gameId,
      betAmount,
      payoutAmount,
      multiplier,
      status: 'success', // the payout itself succeeded — this is informational
      meta: { roi, reason },
    });
  }
}
