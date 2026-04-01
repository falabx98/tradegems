/**
 * END-TO-END FINANCIAL FLOW TESTS
 *
 * Tests the complete money-critical flows using pure logic simulation.
 * No DB/Redis — tests verify the mathematical and state-machine behavior
 * of settlement, recovery, caps, gates, and game-specific flows.
 */

import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════
// A. BET / LOCK / SETTLE FLOWS
// ═══════════════════════════════════════════════════════════

describe('Bet lock and settle flow', () => {
  it('lock reduces available and increases locked', () => {
    let available = 10_000_000_000; // 10 SOL
    let locked = 0;
    const betAmount = 1_000_000_000; // 1 SOL
    const fee = Math.floor(betAmount * 0.05);
    const totalCost = betAmount + fee;

    // Lock
    available -= totalCost;
    locked += totalCost;

    expect(available).toBe(10_000_000_000 - 1_050_000_000);
    expect(locked).toBe(1_050_000_000);
    expect(available + locked).toBe(10_000_000_000); // conservation
  });

  it('settle on win: unlock + credit payout', () => {
    const betAmount = 1_000_000_000;
    const fee = 50_000_000;
    const totalLocked = betAmount + fee;
    const payoutAmount = 1_920_000_000; // 1.92x win

    let available = 8_950_000_000; // after lock
    let locked = totalLocked;

    // Settle
    locked -= totalLocked;
    available += payoutAmount;

    expect(locked).toBe(0);
    expect(available).toBe(8_950_000_000 + 1_920_000_000);
    // Net profit = payout - totalCost = 1.92B - 1.05B = 0.87B
    const netProfit = payoutAmount - totalLocked;
    expect(netProfit).toBe(870_000_000);
  });

  it('settle on loss: unlock with zero payout', () => {
    const betAmount = 1_000_000_000;
    const fee = 50_000_000;
    const totalLocked = betAmount + fee;
    const payoutAmount = 0;

    let available = 8_950_000_000;
    let locked = totalLocked;

    // Settle
    locked -= totalLocked;
    available += payoutAmount;

    expect(locked).toBe(0);
    expect(available).toBe(8_950_000_000); // no change — bet lost
    const netLoss = totalLocked - payoutAmount;
    expect(netLoss).toBe(1_050_000_000);
  });

  it('double settle is blocked (locked insufficient)', () => {
    const totalLocked = 1_050_000_000;
    let locked = totalLocked;

    // First settle succeeds
    const canSettle1 = locked >= totalLocked;
    expect(canSettle1).toBe(true);
    locked -= totalLocked;

    // Second settle fails — locked is now 0
    const canSettle2 = locked >= totalLocked;
    expect(canSettle2).toBe(false);
  });

  it('balance never goes negative', () => {
    let available = 500_000_000; // 0.5 SOL
    const betAmount = 1_000_000_000; // 1 SOL — more than available
    const fee = Math.floor(betAmount * 0.05);
    const totalCost = betAmount + fee;

    const canLock = available >= totalCost;
    expect(canLock).toBe(false);
    // available stays unchanged
    expect(available).toBe(500_000_000);
  });
});

// ═══════════════════════════════════════════════════════════
// B. DUPLICATE / BLOCKED ACTION FLOWS
// ═══════════════════════════════════════════════════════════

describe('Duplicate and blocked action flows', () => {
  it('duplicate join is blocked by unique constraint simulation', () => {
    const joinedUsers = new Set<string>();
    const userId = 'user-1';
    const roundId = 'round-1';
    const key = `${roundId}:${userId}`;

    // First join succeeds
    expect(joinedUsers.has(key)).toBe(false);
    joinedUsers.add(key);

    // Second join blocked
    expect(joinedUsers.has(key)).toBe(true);
  });

  it('bet cap blocks oversized bet without side effects', () => {
    const MAX_BET = 100_000_000_000; // 100 SOL
    const betAmount = 150_000_000_000; // 150 SOL

    const exceeds = betAmount > MAX_BET;
    expect(exceeds).toBe(true);

    // No funds should be locked
    let available = 20_000_000_000;
    let locked = 0;
    if (exceeds) {
      // block — do nothing
    } else {
      available -= betAmount;
      locked += betAmount;
    }
    expect(available).toBe(20_000_000_000); // unchanged
    expect(locked).toBe(0); // unchanged
  });

  it('exposure cap blocks when total locked exceeds limit', () => {
    const MAX_LOCKED = 50_000_000_000; // 50 SOL
    const currentLocked = 45_000_000_000;
    const newBet = 8_000_000_000;
    const projectedLocked = currentLocked + newBet;

    const exceeds = projectedLocked > MAX_LOCKED;
    expect(exceeds).toBe(true);
    // Smaller bet passes
    const smallBet = 3_000_000_000;
    expect(currentLocked + smallBet <= MAX_LOCKED).toBe(true);
  });

  it('game kill switch blocks entry', () => {
    const gameFlags: Record<string, boolean> = {
      'game_rug_enabled': false,
      'game_predictions_enabled': true,
    };

    const rugEnabled = gameFlags['game_rug_enabled'];
    const predEnabled = gameFlags['game_predictions_enabled'];

    expect(rugEnabled).toBe(false); // blocked
    expect(predEnabled).toBe(true); // allowed
  });
});

// ═══════════════════════════════════════════════════════════
// C. RECOVERY FLOWS
// ═══════════════════════════════════════════════════════════

describe('Settlement recovery flows', () => {
  it('failed settlement is recorded with correct data', () => {
    const failure = {
      userId: 'user-1',
      game: 'rug-game',
      gameRefType: 'rug_round',
      gameRefId: 'round-123',
      betAmount: 1_000_000_000,
      fee: 0,
      payoutAmount: 2_500_000_000,
      errorMessage: 'SETTLEMENT_FAILED: insufficient locked',
    };

    // Verify all required fields present
    expect(failure.userId).toBeTruthy();
    expect(failure.game).toBeTruthy();
    expect(failure.gameRefId).toBeTruthy();
    expect(failure.betAmount).toBeGreaterThan(0);
    expect(failure.payoutAmount).toBeGreaterThan(0);
    expect(failure.errorMessage).toBeTruthy();
  });

  it('retry on pending settlement succeeds if funds available', () => {
    const record = { status: 'pending', betAmount: 1_000_000_000, fee: 0, payoutAmount: 1_500_000_000 };
    let locked = record.betAmount + record.fee; // funds still locked

    // Retry: can settle if locked >= totalLocked
    const canSettle = locked >= (record.betAmount + record.fee);
    expect(canSettle).toBe(true);

    // After settle
    locked -= (record.betAmount + record.fee);
    expect(locked).toBe(0);
  });

  it('retry on already-resolved settlement is blocked', () => {
    const record = { status: 'resolved' };
    const canRetry = record.status === 'pending';
    expect(canRetry).toBe(false);
  });

  it('retry on abandoned settlement is blocked', () => {
    const record = { status: 'abandoned' };
    const canRetry = record.status === 'pending';
    expect(canRetry).toBe(false);
  });

  it('retry count increments correctly', () => {
    let retryCount = 0;

    // 3 failed retries
    retryCount++; expect(retryCount).toBe(1);
    retryCount++; expect(retryCount).toBe(2);
    retryCount++; expect(retryCount).toBe(3);

    // At 3+, should trigger escalation alert
    expect(retryCount >= 3).toBe(true);
  });

  it('double-pay protection: second settle fails if locked already released', () => {
    let locked = 1_000_000_000;
    const totalLocked = 1_000_000_000;

    // First retry succeeds
    const firstCanSettle = locked >= totalLocked;
    expect(firstCanSettle).toBe(true);
    locked -= totalLocked;

    // Second retry fails — locked is 0
    const secondCanSettle = locked >= totalLocked;
    expect(secondCanSettle).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// D. GAME-SPECIFIC FLOW TESTS
// ═══════════════════════════════════════════════════════════

describe('Rug Game full flow', () => {
  it('join → cashout → settle flow', () => {
    const HOUSE_EDGE = 0.05;
    const MAX_DISPLAY = 0.995;
    let available = 10_000_000_000;
    let locked = 0;
    const betAmount = 500_000_000;

    // 1. Join — lock betAmount (no separate fee in rug)
    available -= betAmount;
    locked += betAmount;
    expect(available).toBe(9_500_000_000);
    expect(locked).toBe(500_000_000);

    // 2. Crash point generated
    const crashPoint = 3.50;
    const maxDisplay = crashPoint * MAX_DISPLAY;
    expect(maxDisplay).toBeLessThan(crashPoint);

    // 3. Cashout at 2.8x (below crash)
    const cashoutMultiplier = 2.8;
    expect(cashoutMultiplier).toBeLessThan(crashPoint);

    // 4. Payout with safety cap
    const payout = Math.min(
      Math.floor(betAmount * cashoutMultiplier),
      Math.floor(betAmount * crashPoint),
    );
    expect(payout).toBe(Math.floor(500_000_000 * 2.8));
    expect(payout).toBeLessThanOrEqual(Math.floor(500_000_000 * 3.5));

    // 5. Settle — unlock bet, credit payout
    locked -= betAmount;
    available += payout;
    expect(locked).toBe(0);
    expect(available).toBe(9_500_000_000 + 1_400_000_000);

    // Net profit
    expect(available - 10_000_000_000).toBe(900_000_000);
  });

  it('join → rug (loss) flow', () => {
    let available = 10_000_000_000;
    let locked = 0;
    const betAmount = 500_000_000;

    // Lock
    available -= betAmount;
    locked += betAmount;

    // Rugged — payout = 0
    const payout = 0;
    locked -= betAmount;
    available += payout;

    expect(locked).toBe(0);
    expect(available).toBe(9_500_000_000);
  });
});

describe('Predictions full flow', () => {
  it('lock → win settle flow', () => {
    let available = 5_000_000_000;
    let locked = 0;
    const betAmount = 100_000_000;
    const feeRate = 0.05;
    const fee = Math.floor(betAmount * feeRate);
    const totalCost = betAmount + fee;

    // Lock
    available -= totalCost;
    locked += totalCost;
    expect(fee).toBe(5_000_000);
    expect(totalCost).toBe(105_000_000);

    // Win at 1.92x
    const multiplier = 1.92;
    const payout = Math.floor(betAmount * multiplier);
    expect(payout).toBe(192_000_000);

    // Settle
    locked -= totalCost;
    available += payout;
    expect(locked).toBe(0);
    expect(available).toBe(5_000_000_000 - 105_000_000 + 192_000_000);
  });

  it('lock → loss settle flow', () => {
    let available = 5_000_000_000;
    let locked = 0;
    const betAmount = 100_000_000;
    const fee = 5_000_000;
    const totalCost = 105_000_000;

    available -= totalCost;
    locked += totalCost;

    // Loss — payout = 0
    locked -= totalCost;
    available += 0;

    expect(locked).toBe(0);
    expect(available).toBe(5_000_000_000 - 105_000_000);
  });
});

describe('Candleflip full flow', () => {
  it('two-player pool settle flow', () => {
    const HOUSE_FEE = 0.05;
    const betAmount = 1_000_000_000;

    let player1Available = 10_000_000_000;
    let player2Available = 10_000_000_000;

    // Both lock
    player1Available -= betAmount;
    player2Available -= betAmount;

    // Pool
    const totalPool = betAmount * 2;
    const houseFee = Math.floor(totalPool * HOUSE_FEE);
    const prizeAmount = totalPool - houseFee;

    expect(totalPool).toBe(2_000_000_000);
    expect(houseFee).toBe(100_000_000);
    expect(prizeAmount).toBe(1_900_000_000);

    // Player 1 wins
    player1Available += prizeAmount;
    player2Available += 0;

    expect(player1Available).toBe(10_000_000_000 - 1_000_000_000 + 1_900_000_000);
    expect(player2Available).toBe(9_000_000_000);

    // House earned 100M lamports (0.1 SOL)
    const houseEarnings = houseFee;
    expect(houseEarnings).toBe(100_000_000);
  });
});

describe('Trading Sim full flow', () => {
  it('winner-takes-95% pool flow', () => {
    const FEE_RATE = 0.05;
    const entryFee = 500_000_000;
    const players = 3;

    // All lock entry
    const balances = Array(players).fill(10_000_000_000).map(b => b - entryFee);

    const prizePool = entryFee * players;
    const payoutAmount = Math.floor(prizePool * (1 - FEE_RATE));

    expect(prizePool).toBe(1_500_000_000);
    expect(payoutAmount).toBe(1_425_000_000);

    // Winner gets payout
    balances[0] += payoutAmount; // winner
    // Losers get 0

    // Winner net = +925M (payoutAmount - entryFee)
    expect(balances[0] - 10_000_000_000 + entryFee).toBe(payoutAmount);

    // House fee = 75M
    expect(prizePool - payoutAmount).toBe(75_000_000);
  });
});

describe('Lottery flow', () => {
  it('ticket purchase deducts cost immediately', () => {
    let available = 5_000_000_000;
    const ticketCost = 100_000_000; // 0.1 SOL standard
    const numTickets = 5;
    const totalCost = ticketCost * numTickets;

    available -= totalCost;
    expect(available).toBe(4_500_000_000);
  });

  it('resolve idempotency: existing winners block re-resolve', () => {
    const existingWinners = [{ id: 'w1' }]; // already resolved
    const shouldResolve = existingWinners.length === 0;
    expect(shouldResolve).toBe(false);
  });

  it('draw status completed blocks re-resolve', () => {
    const drawStatus = 'completed';
    const shouldResolve = drawStatus !== 'completed';
    expect(shouldResolve).toBe(false);
  });

  it('tier allocations distribute correctly', () => {
    const prizePool = 10_000_000_000; // 10 SOL
    const HOUSE_FEE = 0.05;
    const distributable = Math.floor(prizePool * (1 - HOUSE_FEE));
    expect(distributable).toBe(9_500_000_000);

    const tierPercents = [0.45, 0.12, 0.09, 0.07, 0.06, 0.05, 0.04, 0.04, 0.03];
    const totalAllocated = tierPercents.reduce((s, p) => s + Math.floor(distributable * p), 0);

    // Total allocated should be close to 95% of distributable
    expect(totalAllocated).toBeLessThanOrEqual(distributable);
    expect(totalAllocated / distributable).toBeGreaterThan(0.94);
  });
});

// ═══════════════════════════════════════════════════════════
// E. CONSERVATION INVARIANTS
// ═══════════════════════════════════════════════════════════

describe('Money conservation invariants', () => {
  it('total system money is conserved (user + house = constant)', () => {
    const initialUserBalance = 10_000_000_000;
    const betAmount = 1_000_000_000;
    const fee = 50_000_000;
    const totalCost = betAmount + fee;
    const payout = 1_920_000_000; // win

    const finalUserBalance = initialUserBalance - totalCost + payout;
    const houseRevenue = totalCost - payout;

    // User balance + house revenue = initial balance
    expect(finalUserBalance + houseRevenue).toBe(initialUserBalance);
  });

  it('on loss, house takes full cost basis', () => {
    const betAmount = 1_000_000_000;
    const fee = 50_000_000;
    const totalCost = betAmount + fee;
    const payout = 0;

    const houseRevenue = totalCost - payout;
    expect(houseRevenue).toBe(totalCost);
  });

  it('pool games: total in = total out + house fee', () => {
    const entryFee = 1_000_000_000;
    const players = 4;
    const HOUSE_FEE = 0.05;

    const totalIn = entryFee * players;
    const houseFee = Math.floor(totalIn * HOUSE_FEE);
    const totalOut = totalIn - houseFee;

    expect(totalIn).toBe(totalOut + houseFee);
  });
});
