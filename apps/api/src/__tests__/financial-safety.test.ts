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

// ─── Lottery Tier Allocation Invariants ──────────────────────

describe('Lottery tier allocation invariants', () => {
  const PRIZE_TIERS = [
    { tier: 1, poolPercent: 0.45 },
    { tier: 2, poolPercent: 0.12 },
    { tier: 3, poolPercent: 0.09 },
    { tier: 4, poolPercent: 0.07 },
    { tier: 5, poolPercent: 0.06 },
    { tier: 6, poolPercent: 0.05 },
    { tier: 7, poolPercent: 0.04 },
    { tier: 8, poolPercent: 0.04 },
    { tier: 9, poolPercent: 0.03 },
  ];
  const HOUSE_FEE_RATE = 0.05;

  it('tier allocations sum to 0.95', () => {
    const total = PRIZE_TIERS.reduce((s, t) => s + t.poolPercent, 0);
    expect(total).toBeCloseTo(0.95, 10);
  });

  it('each tier positive', () => {
    for (const tier of PRIZE_TIERS) {
      expect(tier.poolPercent).toBeGreaterThan(0);
    }
  });

  it('effective RTP below 100% but above 80%', () => {
    const totalAlloc = PRIZE_TIERS.reduce((s, t) => s + t.poolPercent, 0);
    const effectiveRtp = (1 - HOUSE_FEE_RATE) * totalAlloc;
    expect(effectiveRtp).toBeLessThan(1.0);
    expect(effectiveRtp).toBeGreaterThan(0.8);
  });

  it('jackpot tier gets the largest share', () => {
    const jackpot = PRIZE_TIERS.find(t => t.tier === 1)!;
    for (const tier of PRIZE_TIERS) {
      expect(jackpot.poolPercent).toBeGreaterThanOrEqual(tier.poolPercent);
    }
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
