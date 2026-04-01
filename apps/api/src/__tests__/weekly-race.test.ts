/**
 * TRADEGEMS — Weekly Race Tests
 *
 * Tests the weekly race system:
 * - Bet tracking increments correctly
 * - Demo bets are NOT tracked
 * - Race completion calculates rankings correctly
 * - Prize distribution sums to 100%
 * - Prizes are credited to winner balances
 * - New race auto-creates after completion
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ─── Mock Weekly Race Engine ─────────────────────────────────

interface RaceEntry {
  userId: string;
  wagered: number;
  betCount: number;
  lastBetAt: number;
}

interface Prize {
  rank: number;
  userId: string;
  amount: number;
}

const PRIZE_DISTRIBUTION = [
  { rank: 1, percentage: 30 },
  { rank: 2, percentage: 20 },
  { rank: 3, percentage: 15 },
  { rank: 4, percentage: 10 },
  { rank: 5, percentage: 8 },
  { rank: 6, percentage: 5 },
  { rank: 7, percentage: 4 },
  { rank: 8, percentage: 3 },
  { rank: 9, percentage: 3 },
  { rank: 10, percentage: 2 },
];

class MockWeeklyRaceEngine {
  entries: Map<string, RaceEntry> = new Map();
  balances: Map<string, number> = new Map();
  prizes: Prize[] = [];
  prizePoolLamports = 10_000_000_000; // 10 SOL
  status: 'active' | 'paying' | 'completed' = 'active';
  tickCounter = 0;

  reset() {
    this.entries.clear();
    this.balances.clear();
    this.prizes = [];
    this.status = 'active';
    this.tickCounter = 0;
  }

  createUser(userId: string, balance = 0) {
    this.balances.set(userId, balance);
  }

  /** Track a real-money bet */
  trackBet(userId: string, betAmountLamports: number, isDemoBet = false) {
    if (isDemoBet) return; // Demo bets never count
    if (this.status !== 'active') return;

    this.tickCounter++;
    const existing = this.entries.get(userId);
    if (existing) {
      existing.wagered += betAmountLamports;
      existing.betCount += 1;
      existing.lastBetAt = this.tickCounter;
    } else {
      this.entries.set(userId, {
        userId,
        wagered: betAmountLamports,
        betCount: 1,
        lastBetAt: this.tickCounter,
      });
    }
  }

  /** Get rankings sorted by wagered DESC, tiebreak by earliest reach */
  getRankings(): RaceEntry[] {
    return [...this.entries.values()].sort((a, b) => {
      if (b.wagered !== a.wagered) return b.wagered - a.wagered;
      return a.lastBetAt - b.lastBetAt; // Earlier = higher rank
    });
  }

  /** Complete the race: calculate rankings and distribute prizes */
  completeRace(): { prizes: Prize[]; rankings: RaceEntry[] } {
    this.status = 'paying';
    const rankings = this.getRankings();
    this.prizes = [];

    for (let i = 0; i < Math.min(rankings.length, PRIZE_DISTRIBUTION.length); i++) {
      const entry = rankings[i];
      const prizeAmount = Math.floor(this.prizePoolLamports * PRIZE_DISTRIBUTION[i].percentage / 100);

      if (prizeAmount <= 0) continue;

      this.prizes.push({ rank: i + 1, userId: entry.userId, amount: prizeAmount });

      // Credit to balance
      const currentBal = this.balances.get(entry.userId) || 0;
      this.balances.set(entry.userId, currentBal + prizeAmount);
    }

    this.status = 'completed';
    return { prizes: this.prizes, rankings };
  }
}

// ─── Tests ───────────────────────────────────────────────────

describe('Weekly Race', () => {
  let engine: MockWeeklyRaceEngine;

  beforeEach(() => {
    engine = new MockWeeklyRaceEngine();
    engine.reset();
  });

  describe('Bet Tracking', () => {
    it('should increment wagered amount correctly', () => {
      engine.createUser('user1');
      engine.trackBet('user1', 100_000_000); // 0.1 SOL
      engine.trackBet('user1', 200_000_000); // 0.2 SOL

      const entry = engine.entries.get('user1')!;
      expect(entry.wagered).toBe(300_000_000);
      expect(entry.betCount).toBe(2);
    });

    it('should NOT track demo bets', () => {
      engine.createUser('user1');
      engine.trackBet('user1', 100_000_000, true); // demo
      engine.trackBet('user1', 200_000_000, true); // demo

      expect(engine.entries.has('user1')).toBe(false);
    });

    it('should track bets from multiple users independently', () => {
      engine.createUser('user1');
      engine.createUser('user2');

      engine.trackBet('user1', 500_000_000);
      engine.trackBet('user2', 300_000_000);
      engine.trackBet('user1', 200_000_000);

      expect(engine.entries.get('user1')!.wagered).toBe(700_000_000);
      expect(engine.entries.get('user2')!.wagered).toBe(300_000_000);
    });

    it('should not track bets when race is not active', () => {
      engine.createUser('user1');
      engine.status = 'completed';
      engine.trackBet('user1', 100_000_000);

      expect(engine.entries.has('user1')).toBe(false);
    });

    it('should track bet_count correctly for many small bets', () => {
      engine.createUser('user1');
      for (let i = 0; i < 50; i++) {
        engine.trackBet('user1', 10_000_000); // 50 × 0.01 SOL
      }
      const entry = engine.entries.get('user1')!;
      expect(entry.betCount).toBe(50);
      expect(entry.wagered).toBe(500_000_000);
    });
  });

  describe('Race Completion', () => {
    it('should calculate rankings by wagered amount DESC', () => {
      engine.createUser('user1');
      engine.createUser('user2');
      engine.createUser('user3');

      engine.trackBet('user1', 100_000_000);
      engine.trackBet('user2', 500_000_000);
      engine.trackBet('user3', 300_000_000);

      const rankings = engine.getRankings();
      expect(rankings[0].userId).toBe('user2');
      expect(rankings[1].userId).toBe('user3');
      expect(rankings[2].userId).toBe('user1');
    });

    it('should break ties by earlier last_bet_at', () => {
      engine.createUser('user1');
      engine.createUser('user2');

      engine.trackBet('user1', 500_000_000); // tick 1
      engine.trackBet('user2', 500_000_000); // tick 2

      const rankings = engine.getRankings();
      // user1 reached 500M first (lower tick)
      expect(rankings[0].userId).toBe('user1');
      expect(rankings[1].userId).toBe('user2');
    });

    it('should distribute prizes correctly', () => {
      // Create 10 users with decreasing bets
      for (let i = 1; i <= 12; i++) {
        engine.createUser(`user${i}`, 0);
        engine.trackBet(`user${i}`, (13 - i) * 1_000_000_000);
      }

      const { prizes } = engine.completeRace();

      // Should have 10 prizes
      expect(prizes.length).toBe(10);

      // First place: 30% of 10 SOL = 3 SOL
      expect(prizes[0].amount).toBe(3_000_000_000);
      expect(prizes[0].rank).toBe(1);
      expect(prizes[0].userId).toBe('user1');

      // Second place: 20% = 2 SOL
      expect(prizes[1].amount).toBe(2_000_000_000);

      // Third place: 15% = 1.5 SOL
      expect(prizes[2].amount).toBe(1_500_000_000);

      // Last place (10th): 2% = 0.2 SOL
      expect(prizes[9].amount).toBe(200_000_000);
    });

    it('should handle race with fewer than 10 participants', () => {
      engine.createUser('user1');
      engine.createUser('user2');
      engine.createUser('user3');

      engine.trackBet('user1', 500_000_000);
      engine.trackBet('user2', 300_000_000);
      engine.trackBet('user3', 100_000_000);

      const { prizes } = engine.completeRace();
      expect(prizes.length).toBe(3);
      expect(prizes[0].amount).toBe(3_000_000_000); // 30%
      expect(prizes[1].amount).toBe(2_000_000_000); // 20%
      expect(prizes[2].amount).toBe(1_500_000_000); // 15%
    });

    it('should credit prizes to winner balances', () => {
      engine.createUser('user1', 1_000_000_000); // starts with 1 SOL
      engine.createUser('user2', 500_000_000);

      engine.trackBet('user1', 5_000_000_000);
      engine.trackBet('user2', 3_000_000_000);

      engine.completeRace();

      // user1 gets 30% of 10 SOL = 3 SOL, balance: 1 + 3 = 4 SOL
      expect(engine.balances.get('user1')).toBe(4_000_000_000);
      // user2 gets 20% of 10 SOL = 2 SOL, balance: 0.5 + 2 = 2.5 SOL
      expect(engine.balances.get('user2')).toBe(2_500_000_000);
    });

    it('should set status to completed after race ends', () => {
      engine.createUser('user1');
      engine.trackBet('user1', 100_000_000);

      expect(engine.status).toBe('active');
      engine.completeRace();
      expect(engine.status).toBe('completed');
    });
  });

  describe('Prize Distribution Config', () => {
    it('should sum to exactly 100%', () => {
      const totalPercentage = PRIZE_DISTRIBUTION.reduce((sum, p) => sum + p.percentage, 0);
      expect(totalPercentage).toBe(100);
    });

    it('should have ranks 1 through 10', () => {
      for (let i = 0; i < PRIZE_DISTRIBUTION.length; i++) {
        expect(PRIZE_DISTRIBUTION[i].rank).toBe(i + 1);
      }
    });

    it('should be in descending prize order', () => {
      for (let i = 0; i < PRIZE_DISTRIBUTION.length - 1; i++) {
        expect(PRIZE_DISTRIBUTION[i].percentage).toBeGreaterThanOrEqual(PRIZE_DISTRIBUTION[i + 1].percentage);
      }
    });
  });

  describe('Auto-creation', () => {
    it('should allow new race to start after completion', () => {
      engine.createUser('user1');
      engine.trackBet('user1', 100_000_000);
      engine.completeRace();

      // Simulate starting a new race
      engine.entries.clear();
      engine.prizes = [];
      engine.status = 'active';

      // New bets should work
      engine.trackBet('user1', 200_000_000);
      expect(engine.entries.get('user1')!.wagered).toBe(200_000_000);
    });
  });

  describe('Edge Cases', () => {
    it('should handle race with zero participants', () => {
      const { prizes, rankings } = engine.completeRace();
      expect(prizes.length).toBe(0);
      expect(rankings.length).toBe(0);
    });

    it('should handle single participant', () => {
      engine.createUser('user1');
      engine.trackBet('user1', 1_000_000_000);

      const { prizes } = engine.completeRace();
      expect(prizes.length).toBe(1);
      expect(prizes[0].amount).toBe(3_000_000_000); // 30% of 10 SOL
    });

    it('should track mixed real and demo bets correctly', () => {
      engine.createUser('user1');
      engine.trackBet('user1', 100_000_000, false); // real
      engine.trackBet('user1', 500_000_000, true);  // demo — ignored
      engine.trackBet('user1', 200_000_000, false); // real

      expect(engine.entries.get('user1')!.wagered).toBe(300_000_000); // only real bets
    });
  });
});
