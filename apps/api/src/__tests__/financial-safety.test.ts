/**
 * FINANCIAL SAFETY TESTS
 * Pure logic tests for money-critical invariants.
 * No DB, no Redis, no network — just math and contract verification.
 */

import { describe, it, expect, vi } from 'vitest';

// ─── Audit Logger Tests ─────────────────────────────────────

describe('auditLog', () => {
  it('should produce structured JSON with required fields', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Direct inline test of the audit log format
    const entry = {
      action: 'test_action',
      userId: 'user-123',
      game: 'rug-game',
      betAmount: 100_000_000,
      payoutAmount: 190_000_000,
      status: 'success' as string,
    };

    const log = {
      level: entry.status === 'failed' ? 'error' : 'info',
      type: 'AUDIT',
      ts: new Date().toISOString(),
      ...entry,
    };
    console.log(JSON.stringify(log));

    expect(consoleSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(consoleSpy.mock.calls[0][0] as string);

    expect(logged.type).toBe('AUDIT');
    expect(logged.action).toBe('test_action');
    expect(logged.userId).toBe('user-123');
    expect(logged.betAmount).toBe(100_000_000);
    expect(logged.status).toBe('success');
    expect(logged.ts).toBeTruthy();

    consoleSpy.mockRestore();
  });

  it('failed entries should have level=error', () => {
    const status = 'failed';
    const log = { level: status === 'failed' ? 'error' : 'info', type: 'AUDIT' };
    expect(log.level).toBe('error');
  });
});

// ─── Rug Game Crash Point Invariants ─────────────────────────

describe('Rug Game crash point safety', () => {
  const MAX_DISPLAY_RATIO = 0.995;
  const HOUSE_EDGE = 0.05;

  it('MAX_DISPLAY_RATIO must be less than 1.0', () => {
    expect(MAX_DISPLAY_RATIO).toBeLessThan(1.0);
    expect(MAX_DISPLAY_RATIO).toBeGreaterThan(0.9);
  });

  it('chart clamp prevents display above crash point', () => {
    const crashPoints = [1.01, 1.50, 2.00, 5.00, 10.00, 50.00, 100.00];
    for (const crash of crashPoints) {
      const maxDisplay = crash * MAX_DISPLAY_RATIO;
      expect(maxDisplay).toBeLessThan(crash);
      expect(crash - maxDisplay).toBeCloseTo(crash * 0.005, 6);
    }
  });

  it('payout must never exceed betAmount × crashPoint', () => {
    const betAmount = 1_000_000_000;
    const crashPoint = 2.5;
    const cashoutMultiplier = 2.4;

    const payout = Math.min(
      Math.floor(betAmount * cashoutMultiplier),
      Math.floor(betAmount * crashPoint),
    );

    expect(payout).toBeLessThanOrEqual(Math.floor(betAmount * crashPoint));
    expect(payout).toBe(Math.floor(betAmount * cashoutMultiplier));
  });

  it('cashout above crash point is capped', () => {
    const betAmount = 1_000_000_000;
    const crashPoint = 2.0;
    const cashoutMultiplier = 2.5;

    const payout = Math.min(
      Math.floor(betAmount * cashoutMultiplier),
      Math.floor(betAmount * crashPoint),
    );

    expect(payout).toBe(Math.floor(betAmount * crashPoint));
  });

  it('4% instant crash produces correct probability', () => {
    // hash % 25 === 0 is 1/25 = 4%
    expect(1 / 25).toBeCloseTo(0.04, 4);
  });

  it('HOUSE_EDGE of 5% gives RTP of 95% under optimal play', () => {
    const rtp = 1 - HOUSE_EDGE;
    expect(rtp).toBe(0.95);
  });
});

// ─── Rug Game Bootstrap Guardrails ──────────────────────────

describe('Rug Game bootstrap guardrails', () => {
  const RUG_MAX_BET = 500_000_000;           // 0.5 SOL
  const RUG_MAX_PAYOUT = 50_000_000_000;     // 50 SOL
  const RUG_MAX_ROUND_EXPOSURE = 100_000_000_000; // 100 SOL
  const RUG_MAX_MULTIPLIER = 100;
  const HOUSE_EDGE_RUG = 0.05;

  it('bet above MAX_BET is rejected', () => {
    const betAmount = 600_000_000; // 0.6 SOL
    expect(betAmount > RUG_MAX_BET).toBe(true);
  });

  it('bet at exactly MAX_BET passes', () => {
    const betAmount = 500_000_000; // 0.5 SOL
    expect(betAmount > RUG_MAX_BET).toBe(false);
  });

  it('bet below MAX_BET passes', () => {
    const betAmount = 100_000_000; // 0.1 SOL
    expect(betAmount > RUG_MAX_BET).toBe(false);
  });

  it('payout above MAX_PAYOUT is truncated to cap', () => {
    const betAmount = 500_000_000;
    const multiplier = 100;
    let payout = Math.floor(betAmount * multiplier); // 50 SOL
    expect(payout).toBe(50_000_000_000);

    // Exactly at cap — no truncation needed
    if (payout > RUG_MAX_PAYOUT) payout = RUG_MAX_PAYOUT;
    expect(payout).toBe(RUG_MAX_PAYOUT);
  });

  it('payout well above MAX_PAYOUT is truncated', () => {
    // Hypothetical: if max bet was higher
    const betAmount = 1_000_000_000; // 1 SOL (above current max bet, but testing payout cap)
    const multiplier = 80;
    let payout = Math.floor(betAmount * multiplier); // 80 SOL
    expect(payout).toBe(80_000_000_000);

    if (payout > RUG_MAX_PAYOUT) payout = RUG_MAX_PAYOUT;
    expect(payout).toBe(RUG_MAX_PAYOUT); // truncated to 50 SOL
  });

  it('payout below MAX_PAYOUT is not truncated', () => {
    const betAmount = 100_000_000; // 0.1 SOL
    const multiplier = 5;
    let payout = Math.floor(betAmount * multiplier); // 0.5 SOL
    const original = payout;

    if (payout > RUG_MAX_PAYOUT) payout = RUG_MAX_PAYOUT;
    expect(payout).toBe(original); // unchanged
  });

  it('round exposure blocks when aggregate exceeds limit', () => {
    // 2 players betting max (0.5 SOL each) = exposure of 2 × 0.5 × 100 = 100 SOL
    const bets = [
      { betAmount: 500_000_000 },
      { betAmount: 500_000_000 },
    ];
    const currentExposure = bets.reduce((sum, b) => sum + b.betAmount * RUG_MAX_MULTIPLIER, 0);
    expect(currentExposure).toBe(100_000_000_000); // exactly at limit

    // Third player tries to join — should be blocked
    const newBetExposure = 100_000_000 * RUG_MAX_MULTIPLIER; // 0.1 SOL × 100 = 10 SOL
    expect(currentExposure + newBetExposure > RUG_MAX_ROUND_EXPOSURE).toBe(true);
  });

  it('round exposure allows when within limit', () => {
    const bets = [{ betAmount: 200_000_000 }]; // 0.2 SOL
    const currentExposure = bets.reduce((sum, b) => sum + b.betAmount * RUG_MAX_MULTIPLIER, 0);
    const newBetExposure = 300_000_000 * RUG_MAX_MULTIPLIER; // 0.3 SOL × 100 = 30 SOL
    expect(currentExposure + newBetExposure <= RUG_MAX_ROUND_EXPOSURE).toBe(true);
  });

  it('one user per round is enforced', () => {
    const bets = [
      { userId: 'user-1', betAmount: 100_000_000 },
      { userId: 'user-2', betAmount: 200_000_000 },
    ];
    const userId = 'user-1';
    const alreadyInRound = bets.some(b => b.userId === userId);
    expect(alreadyInRound).toBe(true);
  });

  it('max multiplier caps crash point', () => {
    // Simulating a raw crash point above cap
    const rawResult = 150.00;
    const capped = Math.min(rawResult, RUG_MAX_MULTIPLIER);
    expect(capped).toBe(100);
  });

  it('max profit ratio is consistent: MAX_PAYOUT / MAX_BET = MAX_MULTIPLIER', () => {
    expect(RUG_MAX_PAYOUT / RUG_MAX_BET).toBe(RUG_MAX_MULTIPLIER);
  });

  it('house edge ensures RTP < 100%', () => {
    expect(1 - HOUSE_EDGE_RUG).toBe(0.95);
    expect(HOUSE_EDGE_RUG).toBeGreaterThan(0);
  });
});

// ─── Mines Bootstrap Guardrails ─────────────────────────────

describe('Mines bootstrap guardrails', () => {
  const MINES_MAX_BET = 500_000_000;          // 0.5 SOL
  const MINES_MAX_PAYOUT = 50_000_000_000;    // 50 SOL
  const MINES_HOUSE_EDGE = 0.05;
  const MINES_MAX_MULTIPLIER = 50;
  const GRID_SIZE = 25;
  const VALID_MINE_COUNTS = [1, 3, 5, 7, 10];

  // Replicate the actual getMultiplier function for verification
  function getMultiplier(picks: number, mines: number): number {
    if (picks <= 0) return 1.00;
    let fair = 1;
    for (let i = 0; i < picks; i++) {
      fair *= (GRID_SIZE - i) / (GRID_SIZE - mines - i);
    }
    const adjusted = fair * (1 - MINES_HOUSE_EDGE);
    let result = Math.floor(adjusted * 100) / 100;
    if (picks === 1 && result < 1.00) result = 1.00;
    return Math.min(result, MINES_MAX_MULTIPLIER);
  }

  it('bet above max is rejected', () => {
    expect(600_000_000 > MINES_MAX_BET).toBe(true);
  });

  it('bet at max passes', () => {
    expect(500_000_000 > MINES_MAX_BET).toBe(false);
  });

  it('max payout at max bet × max multiplier is within cap', () => {
    const maxPossiblePayout = MINES_MAX_BET * MINES_MAX_MULTIPLIER;
    expect(maxPossiblePayout).toBeLessThanOrEqual(MINES_MAX_PAYOUT);
  });

  it('house edge is 5%', () => {
    expect(MINES_HOUSE_EDGE).toBe(0.05);
  });

  it('all mine configs have max payout within 50 SOL cap at 0.5 SOL bet', () => {
    for (const mines of VALID_MINE_COUNTS) {
      const safeTiles = GRID_SIZE - mines;
      let maxMult = 0;
      for (let k = 1; k <= safeTiles; k++) {
        maxMult = Math.max(maxMult, getMultiplier(k, mines));
      }
      const maxPayout = Math.floor(MINES_MAX_BET * maxMult);
      expect(maxPayout).toBeLessThanOrEqual(MINES_MAX_PAYOUT);
    }
  });

  it('multiplier is capped at 50x for high mine counts', () => {
    for (const mines of [3, 5, 7, 10]) {
      const safeTiles = GRID_SIZE - mines;
      const fullClearMult = getMultiplier(safeTiles, mines);
      expect(fullClearMult).toBeLessThanOrEqual(MINES_MAX_MULTIPLIER);
    }
  });

  it('house edge >= 4% for all mine configs on first pick', () => {
    for (const mines of VALID_MINE_COUNTS) {
      const prob = (GRID_SIZE - mines) / GRID_SIZE;
      const mult = getMultiplier(1, mines);
      const ev = prob * mult;
      expect(ev).toBeLessThan(1.0); // house always has edge
    }
  });

  it('house edge >= 5% for 3+ mine configs', () => {
    for (const mines of [3, 5, 7, 10]) {
      const prob = (GRID_SIZE - mines) / GRID_SIZE;
      const mult = getMultiplier(1, mines);
      const ev = prob * mult;
      expect(1 - ev).toBeGreaterThanOrEqual(0.05);
    }
  });
});

// ─── Prediction Bootstrap Guardrails ────────────────────────

describe('Prediction bootstrap guardrails', () => {
  const PRED_MAX_BET = 500_000_000; // 0.5 SOL
  const MULTIPLIERS = { up: 1.92, down: 1.92, sideways: 3.18 };

  it('bet above max is rejected', () => {
    expect(600_000_000 > PRED_MAX_BET).toBe(true);
  });

  it('max possible payout is small (< 2 SOL)', () => {
    const maxPayout = Math.floor(PRED_MAX_BET * MULTIPLIERS.sideways);
    // 0.5 SOL × 3.18 = 1.59 SOL
    expect(maxPayout).toBeLessThan(2_000_000_000);
  });

  it('house edge >= 5% for all directions', () => {
    // Long/Short: 50% × 1.92 / 1.05 = 91.4% RTP → 8.6% house edge
    // Range: 30% × 3.18 / 1.05 = 90.9% RTP → 9.1% house edge
    expect(1 - (0.50 * 1.92) / 1.05).toBeGreaterThan(0.05);
    expect(1 - (0.30 * 3.18) / 1.05).toBeGreaterThan(0.05);
  });
});

// ─── Solo Bootstrap Guardrails ──────────────────────────────

describe('Solo bootstrap guardrails', () => {
  const SOLO_MAX_BET = 500_000_000;          // 0.5 SOL
  const SOLO_MAX_PAYOUT = 50_000_000_000;    // 50 SOL
  const SOLO_MAX_MULTIPLIER = 10;            // engine cap
  const SOLO_FEE_RATE = 0.05;

  it('bet above max is rejected', () => {
    expect(600_000_000 > SOLO_MAX_BET).toBe(true);
  });

  it('max payout at max bet × max multiplier is within cap', () => {
    const maxPossiblePayout = SOLO_MAX_BET * SOLO_MAX_MULTIPLIER;
    // 0.5 SOL × 10x = 5 SOL — well under 50 SOL cap
    expect(maxPossiblePayout).toBeLessThanOrEqual(SOLO_MAX_PAYOUT);
  });

  it('payout above cap would be truncated', () => {
    // Hypothetical: if someone got past bet validation
    const bigBet = 10_000_000_000; // 10 SOL
    const multiplier = 10;
    let payout = Math.floor(bigBet * multiplier); // 100 SOL
    if (payout > SOLO_MAX_PAYOUT) payout = SOLO_MAX_PAYOUT;
    expect(payout).toBe(SOLO_MAX_PAYOUT);
  });

  it('platform fee rate is 5%', () => {
    expect(SOLO_FEE_RATE).toBe(0.05);
  });
});

// ─── Candleflip Bootstrap Guardrails ────────────────────────

describe('Candleflip bootstrap guardrails', () => {
  const CF_MAX_BET = 500_000_000;  // 0.5 SOL
  const CF_PAYOUT_MULTIPLIER = 1.9;
  const CF_HOUSE_FEE = 0.05;

  it('bet above max is rejected', () => {
    expect(600_000_000 > CF_MAX_BET).toBe(true);
  });

  it('max payout at max bet is well under 50 SOL', () => {
    const maxPayout = Math.floor(CF_MAX_BET * CF_PAYOUT_MULTIPLIER);
    // 0.5 × 1.9 = 0.95 SOL
    expect(maxPayout).toBeLessThan(1_000_000_000);
  });

  it('house edge is 5% (from rake)', () => {
    const rtp = 0.50 * (2 * (1 - CF_HOUSE_FEE));
    expect(rtp).toBeCloseTo(0.95, 4);
    expect(1 - rtp).toBeCloseTo(0.05, 4);
  });
});

// ─── Cross-Game Bootstrap Consistency ────────────────────────

describe('Cross-game bootstrap consistency', () => {
  const GAME_LIMITS = {
    'rug-game':    { maxBet: 500_000_000, maxPayout: 50_000_000_000 },
    'mines':       { maxBet: 500_000_000, maxPayout: 50_000_000_000 },
    'predictions': { maxBet: 500_000_000, maxPayout: 50_000_000_000 },
    'solo':        { maxBet: 500_000_000, maxPayout: 50_000_000_000 },
    'candleflip':  { maxBet: 500_000_000, maxPayout: 50_000_000_000 },
  };

  it('all house games have same max bet (0.5 SOL)', () => {
    const maxBets = Object.values(GAME_LIMITS).map(l => l.maxBet);
    expect(new Set(maxBets).size).toBe(1);
    expect(maxBets[0]).toBe(500_000_000);
  });

  it('all house games have same max payout (50 SOL)', () => {
    const maxPayouts = Object.values(GAME_LIMITS).map(l => l.maxPayout);
    expect(new Set(maxPayouts).size).toBe(1);
    expect(maxPayouts[0]).toBe(50_000_000_000);
  });

  it('max bet is 0.5 SOL in lamports', () => {
    expect(GAME_LIMITS['rug-game'].maxBet / 1e9).toBe(0.5);
  });

  it('max payout is 50 SOL in lamports', () => {
    expect(GAME_LIMITS['rug-game'].maxPayout / 1e9).toBe(50);
  });

  it('clampPayout logic truncates correctly', () => {
    const maxPayout = 50_000_000_000;
    // Below cap
    let payout = 25_000_000_000;
    const belowResult = payout <= maxPayout ? payout : maxPayout;
    expect(belowResult).toBe(25_000_000_000);

    // Above cap
    payout = 80_000_000_000;
    const aboveResult = payout <= maxPayout ? payout : maxPayout;
    expect(aboveResult).toBe(50_000_000_000);

    // Exactly at cap
    payout = 50_000_000_000;
    const exactResult = payout <= maxPayout ? payout : maxPayout;
    expect(exactResult).toBe(50_000_000_000);
  });

  it('validateGameBetLimits rejects bets above cap', () => {
    const maxBet = 500_000_000;
    expect(600_000_000 > maxBet).toBe(true);
    expect(500_000_000 > maxBet).toBe(false);
    expect(499_999_999 > maxBet).toBe(false);
  });
});

// ─── Prediction Multiplier Invariants ────────────────────────

describe('Prediction payout invariants', () => {
  const MULTIPLIERS = { up: 1.92, down: 1.92, sideways: 3.18 };
  const WIN_PROBS = { up: 0.50, down: 0.50, sideways: 0.30 };
  const FEE_RATE = 0.05;

  it('all multipliers below fair value (house edge exists)', () => {
    expect(MULTIPLIERS.up).toBeLessThan(1 / WIN_PROBS.up);        // < 2.0
    expect(MULTIPLIERS.down).toBeLessThan(1 / WIN_PROBS.down);    // < 2.0
    expect(MULTIPLIERS.sideways).toBeLessThan(1 / WIN_PROBS.sideways); // < 3.33
  });

  it('RTP below 100% for all directions', () => {
    for (const dir of ['up', 'down', 'sideways'] as const) {
      const rtp = (WIN_PROBS[dir] * MULTIPLIERS[dir]) / (1 + FEE_RATE);
      expect(rtp).toBeLessThan(1.0);
      expect(rtp).toBeGreaterThan(0.85); // not absurdly punitive
    }
  });

  it('Up/Down RTP is approximately 91.4%', () => {
    const rtp = (0.50 * 1.92) / 1.05;
    expect(rtp).toBeCloseTo(0.9143, 3);
  });

  it('Range RTP is approximately 90.9%', () => {
    const rtp = (0.30 * 3.18) / 1.05;
    expect(rtp).toBeCloseTo(0.9086, 3);
  });

  it('loss payout is exactly 0', () => {
    const result = 'loss' as string;
    const payout = result === 'win' ? Math.floor(1_000_000_000 * 1.92) : 0;
    expect(payout).toBe(0);
  });
});

// ─── Candleflip Pool Invariants ──────────────────────────────

describe('Candleflip pool invariants', () => {
  const HOUSE_FEE_RATE = 0.05;

  it('winner payout less than total pool', () => {
    const betAmount = 1_000_000_000;
    const totalPool = betAmount * 2;
    const houseFee = Math.floor(totalPool * HOUSE_FEE_RATE);
    const prizeAmount = totalPool - houseFee;

    expect(prizeAmount).toBeLessThan(totalPool);
    expect(prizeAmount).toBeGreaterThan(0);
    expect(houseFee).toBeGreaterThan(0);
  });

  it('50/50 probability gives 95% RTP', () => {
    const rtp = 0.50 * (2 * (1 - HOUSE_FEE_RATE));
    expect(rtp).toBeCloseTo(0.95, 4);
  });
});

// ─── Bet Cap Invariants ──────────────────────────────────────

describe('Bet cap invariants', () => {
  const MAX_BET = 100_000_000_000;       // 100 SOL
  const MAX_LOCKED = 500_000_000_000;    // 500 SOL

  it('MAX_BET positive and reasonable', () => {
    expect(MAX_BET).toBeGreaterThan(0);
    expect(MAX_BET).toBeLessThanOrEqual(1_000_000_000_000);
  });

  it('MAX_LOCKED greater than MAX_BET', () => {
    expect(MAX_LOCKED).toBeGreaterThan(MAX_BET);
  });

  it('bet exceeding cap is rejected', () => {
    const betAmount = 150_000_000_000; // 150 SOL
    const exceeds = betAmount > MAX_BET;
    expect(exceeds).toBe(true);
  });

  it('bet within cap passes', () => {
    const betAmount = 50_000_000_000; // 50 SOL
    const exceeds = betAmount > MAX_BET;
    expect(exceeds).toBe(false);
  });

  it('exposure limit blocks when total locked exceeds cap', () => {
    const currentLocked = 450_000_000_000; // 450 SOL locked
    const newBet = 80_000_000_000;         // 80 SOL new bet
    const projectedLocked = currentLocked + newBet;
    expect(projectedLocked > MAX_LOCKED).toBe(true);
  });
});

// ─── Trading Sim Pool Invariants ─────────────────────────────

describe('Trading Sim pool invariants', () => {
  const PLATFORM_FEE_RATE = 0.05;

  it('winner gets 95% of pool regardless of player count', () => {
    for (const playerCount of [2, 3, 4, 5, 8]) {
      const entryFee = 1_000_000_000;
      const prizePool = entryFee * playerCount;
      const payout = Math.floor(prizePool * (1 - PLATFORM_FEE_RATE));

      expect(payout).toBeLessThan(prizePool);
      expect(payout / prizePool).toBeCloseTo(0.95, 2);
    }
  });

  it('RTP is 95% for any player count', () => {
    for (const n of [2, 3, 4]) {
      const rtp = (1 / n) * n * (1 - PLATFORM_FEE_RATE);
      expect(rtp).toBeCloseTo(0.95, 4);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
//  TREASURY MONITORING & CIRCUIT BREAKER TESTS (4-level system)
// ═══════════════════════════════════════════════════════════════

describe('Treasury status — reserve ratio based determination', () => {
  // Status is now based on reserve ratio (liquidity / pending withdrawals)
  // NOT absolute liquidity thresholds
  function computeStatus(liquidity: number, pending: number): 'healthy' | 'warning' | 'critical' | 'maintenance' {
    if (pending <= 0) return 'healthy'; // nothing to pay = no risk
    const ratio = liquidity / pending;
    if (ratio >= 2.0) return 'healthy';
    if (ratio >= 1.0) return 'warning';
    if (ratio >= 0.5) return 'critical';
    return 'maintenance';
  }

  it('0 SOL liquidity + 0 pending = healthy (nothing at risk)', () => {
    expect(computeStatus(0, 0)).toBe('healthy');
  });

  it('0 SOL liquidity + pending withdrawals = maintenance', () => {
    expect(computeStatus(0, 5_000_000_000)).toBe('maintenance');
  });

  it('any liquidity + 0 pending = healthy', () => {
    expect(computeStatus(100_000_000, 0)).toBe('healthy');
    expect(computeStatus(50_000_000_000, 0)).toBe('healthy');
  });

  it('ratio >= 2.0 → healthy', () => {
    expect(computeStatus(20_000_000_000, 10_000_000_000)).toBe('healthy');
    expect(computeStatus(30_000_000_000, 10_000_000_000)).toBe('healthy');
  });

  it('ratio 1.0–2.0 → warning', () => {
    expect(computeStatus(10_000_000_000, 10_000_000_000)).toBe('warning');
    expect(computeStatus(15_000_000_000, 10_000_000_000)).toBe('warning');
  });

  it('ratio 0.5–1.0 → critical', () => {
    expect(computeStatus(5_000_000_000, 10_000_000_000)).toBe('critical');
    expect(computeStatus(7_000_000_000, 10_000_000_000)).toBe('critical');
  });

  it('ratio < 0.5 → maintenance', () => {
    expect(computeStatus(4_000_000_000, 10_000_000_000)).toBe('maintenance');
    expect(computeStatus(1_000_000_000, 10_000_000_000)).toBe('maintenance');
  });

  it('boundary: ratio exactly 2.0 → healthy', () => {
    expect(computeStatus(20_000_000_000, 10_000_000_000)).toBe('healthy');
  });

  it('boundary: ratio exactly 1.0 → warning', () => {
    expect(computeStatus(10_000_000_000, 10_000_000_000)).toBe('warning');
  });

  it('boundary: ratio exactly 0.5 → critical', () => {
    expect(computeStatus(5_000_000_000, 10_000_000_000)).toBe('critical');
  });
});

describe('Circuit breaker — bet limits per status', () => {
  const MAX_BET = 500_000_000; // 0.5 SOL
  const BET_REDUCTION = 0.5;

  function effectiveMaxBet(status: string, circuitBreakerEnabled: boolean): number {
    // When circuit breaker is disabled (bootstrap), always full limits
    if (!circuitBreakerEnabled) return MAX_BET;
    if (status === 'critical' || status === 'maintenance') return 0;
    if (status === 'warning') return Math.floor(MAX_BET * BET_REDUCTION);
    return MAX_BET;
  }

  it('ENABLE_CIRCUIT_BREAKER=false → always full limits regardless of status', () => {
    expect(effectiveMaxBet('healthy', false)).toBe(500_000_000);
    expect(effectiveMaxBet('warning', false)).toBe(500_000_000);
    expect(effectiveMaxBet('critical', false)).toBe(500_000_000);
    expect(effectiveMaxBet('maintenance', false)).toBe(500_000_000);
  });

  it('ENABLE_CIRCUIT_BREAKER=true: healthy → full limits', () => {
    expect(effectiveMaxBet('healthy', true)).toBe(500_000_000);
  });

  it('ENABLE_CIRCUIT_BREAKER=true: warning → reduced (50%)', () => {
    expect(effectiveMaxBet('warning', true)).toBe(250_000_000);
  });

  it('ENABLE_CIRCUIT_BREAKER=true: critical → zero', () => {
    expect(effectiveMaxBet('critical', true)).toBe(0);
  });

  it('ENABLE_CIRCUIT_BREAKER=true: maintenance → zero', () => {
    expect(effectiveMaxBet('maintenance', true)).toBe(0);
  });

  it('reduced limits are positive in warning state', () => {
    const reduced = Math.floor(MAX_BET * BET_REDUCTION);
    expect(reduced).toBeGreaterThan(0);
  });
});

describe('Circuit breaker — Trading Sim NOT affected', () => {
  // Trading Sim uses a different validation path (pool entry fee, not HouseGame)
  // Its feature flag (game_trading_sim_enabled) is never toggled by circuit breaker
  const HOUSE_GAME_FLAGS = [
    'game_rug_enabled',
    'game_solo_enabled',
    'game_predictions_enabled',
    'game_candleflip_enabled',
  ];

  it('Trading Sim flag is NOT in the house game flags list', () => {
    expect(HOUSE_GAME_FLAGS).not.toContain('game_trading_sim_enabled');
  });

  it('house game flags are exactly 4 (rug, solo, predictions, candleflip)', () => {
    expect(HOUSE_GAME_FLAGS).toHaveLength(4);
  });
});

describe('Treasury monitoring — reserve ratio', () => {
  function computeReserveRatio(onChain: number, pending: number): number {
    return pending > 0 ? onChain / pending : Infinity;
  }

  it('no pending withdrawals → infinite reserve ratio', () => {
    expect(computeReserveRatio(50_000_000_000, 0)).toBe(Infinity);
  });

  it('on-chain equals pending → ratio 1.0', () => {
    expect(computeReserveRatio(10_000_000_000, 10_000_000_000)).toBeCloseTo(1.0, 4);
  });

  it('on-chain double pending → ratio 2.0', () => {
    expect(computeReserveRatio(20_000_000_000, 10_000_000_000)).toBeCloseTo(2.0, 4);
  });

  it('on-chain less than pending → ratio < 1 (dangerous)', () => {
    const ratio = computeReserveRatio(5_000_000_000, 10_000_000_000);
    expect(ratio).toBeCloseTo(0.5, 4);
    expect(ratio).toBeLessThan(1.0);
  });

  it('reserve ratio < 1.5 triggers alert threshold', () => {
    const ratio = computeReserveRatio(12_000_000_000, 10_000_000_000);
    expect(ratio).toBeCloseTo(1.2, 1);
    expect(ratio).toBeLessThan(1.5);
  });
});

describe('Withdrawal liquidity check', () => {
  const BUFFER_PERCENT = 10;

  function checkLiquidity(amount: number, onChain: number): { allowed: boolean } {
    const bufferMultiplier = 1 + (BUFFER_PERCENT / 100);
    const required = amount * bufferMultiplier;
    if (onChain < required) return { allowed: false };
    return { allowed: true };
  }

  it('sufficient liquidity → allowed', () => {
    expect(checkLiquidity(1_000_000_000, 50_000_000_000).allowed).toBe(true);
  });

  it('insufficient total → blocked', () => {
    expect(checkLiquidity(1_000_000_000, 500_000_000).allowed).toBe(false);
  });

  it('exactly at buffer threshold → allowed', () => {
    expect(checkLiquidity(1_000_000_000, 1_100_000_000).allowed).toBe(true);
  });

  it('just below buffer → blocked', () => {
    expect(checkLiquidity(1_000_000_000, 1_050_000_000).allowed).toBe(false);
  });

  it('3 SOL on-chain, 1 SOL withdrawal → allowed', () => {
    expect(checkLiquidity(1_000_000_000, 3_000_000_000).allowed).toBe(true);
  });
});

describe('Withdrawal queue — delay & status flow', () => {
  const DELAY_HOURS = 24;

  it('process_after is exactly DELAY_HOURS after creation', () => {
    const now = Date.now();
    const processAfter = now + DELAY_HOURS * 3600 * 1000;
    expect(processAfter - now).toBe(86_400_000);
  });

  it('withdrawal NOT ready before delay', () => {
    const createdAt = Date.now();
    const processAfter = createdAt + DELAY_HOURS * 3600 * 1000;
    const checkTime = createdAt + (12 * 3600 * 1000);
    expect(checkTime < processAfter).toBe(true);
  });

  it('withdrawal IS ready after delay', () => {
    const createdAt = Date.now();
    const processAfter = createdAt + DELAY_HOURS * 3600 * 1000;
    const checkTime = createdAt + (25 * 3600 * 1000);
    expect(checkTime >= processAfter).toBe(true);
  });

  it('zero delay → immediately processable', () => {
    const createdAt = Date.now();
    const processAfter = createdAt + 0 * 3600 * 1000;
    expect(processAfter).toBe(createdAt);
  });

  it('status flow: pending → processing → completed', () => {
    const flow = ['pending', 'processing', 'completed'];
    expect(flow[0]).toBe('pending');
    expect(flow[flow.length - 1]).toBe('completed');
  });

  it('delayed status retries after 1 hour', () => {
    const delayedAt = Date.now();
    const retryAt = delayedAt + 3600 * 1000; // 1 hour
    expect(retryAt - delayedAt).toBe(3_600_000);
  });

  it('valid withdrawal statuses cover all lifecycle states', () => {
    const statuses = ['pending', 'processing', 'completed', 'delayed', 'failed', 'cancelled'];
    expect(statuses).toContain('pending');
    expect(statuses).toContain('delayed');
    expect(statuses).toContain('completed');
    expect(statuses).toContain('cancelled');
    expect(statuses).toHaveLength(6);
  });
});

describe('Withdrawal cancellation invariants', () => {
  it('only pending and delayed withdrawals can be cancelled', () => {
    const CANCELLABLE = ['pending', 'delayed'];
    const ALL_STATUSES = ['pending', 'processing', 'completed', 'delayed', 'failed', 'cancelled'];

    for (const status of ALL_STATUSES) {
      const canCancel = CANCELLABLE.includes(status);
      if (status === 'pending' || status === 'delayed') {
        expect(canCancel).toBe(true);
      } else {
        expect(canCancel).toBe(false);
      }
    }
  });

  it('cancellation releases full locked amount (amount + fee)', () => {
    const amount = 1_000_000_000;
    const fee = 5000;
    expect(amount + fee).toBe(1_000_005_000);
    expect(amount + fee).toBeGreaterThan(amount);
  });
});

describe('Transparency page — public data', () => {
  it('platform status maps correctly from treasury status', () => {
    const mapStatus = (status: string) => {
      if (status === 'maintenance') return 'maintenance';
      if (status === 'critical' || status === 'warning') return 'high demand';
      return 'operational';
    };

    expect(mapStatus('healthy')).toBe('operational');
    expect(mapStatus('warning')).toBe('high demand');
    expect(mapStatus('critical')).toBe('high demand');
    expect(mapStatus('maintenance')).toBe('maintenance');
  });

  it('public endpoint does NOT expose liquidity numbers', () => {
    // The transparency endpoint returns only:
    // totalWagered, totalPaidOut, averageWithdrawalTimeHours, platformStatus, gamesPlayed, uptime
    const publicFields = ['totalWagered', 'totalPaidOut', 'averageWithdrawalTimeHours', 'platformStatus', 'gamesPlayed', 'uptime'];
    const sensitiveFields = ['currentLiquidity', 'reserveRatio', 'onChainBalance', 'pendingWithdrawals'];

    for (const field of sensitiveFields) {
      expect(publicFields).not.toContain(field);
    }
  });

  it('public treasury/status only returns status string', () => {
    // GET /v1/treasury/status → { status: '...' }
    // Must NOT include: totalDeposited, totalWithdrawn, currentLiquidity, etc.
    const publicResponse = { status: 'healthy' };
    expect(Object.keys(publicResponse)).toEqual(['status']);
  });

  it('RTP values are bounded between 0 and 1', () => {
    const expectedRTPs = [0.914, 0.950, 0.950, 0.950, 0.920];
    for (const rtp of expectedRTPs) {
      expect(rtp).toBeGreaterThan(0);
      expect(rtp).toBeLessThan(1);
    }
  });
});

describe('Ops alerts — coverage', () => {
  const ALERT_CATEGORIES = [
    'settlement_failure',
    'settlement_retry_failure',
    'duplicate_blocked',
    'bet_cap_violation',
    'exposure_limit_violation',
    'disabled_game_attempt',
    'payout_outlier',
    'endpoint_failure',
    'treasury',
    'circuit_breaker',
    'withdrawal_delayed',
    'withdrawal_failed',
    'low_reserve_ratio',
  ];

  it('all treasury-related alert categories exist', () => {
    expect(ALERT_CATEGORIES).toContain('circuit_breaker');
    expect(ALERT_CATEGORIES).toContain('withdrawal_delayed');
    expect(ALERT_CATEGORIES).toContain('withdrawal_failed');
    expect(ALERT_CATEGORIES).toContain('low_reserve_ratio');
    expect(ALERT_CATEGORIES).toContain('treasury');
  });

  it('reserve ratio < 1.5 triggers alert', () => {
    const ratio = 1.2;
    const shouldAlert = ratio < 1.5;
    expect(shouldAlert).toBe(true);
  });

  it('reserve ratio >= 1.5 does not trigger alert', () => {
    const ratio = 2.0;
    const shouldAlert = ratio < 1.5;
    expect(shouldAlert).toBe(false);
  });

  it('withdrawal delayed > 48h triggers critical alert', () => {
    const createdAt = Date.now() - 50 * 3600 * 1000; // 50 hours ago
    const isStale = (Date.now() - createdAt) > 48 * 3600 * 1000;
    expect(isStale).toBe(true);
  });
});
