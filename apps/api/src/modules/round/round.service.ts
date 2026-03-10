import { eq, and, desc, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import { rounds, roundNodes, roundEvents, roundPools, bets, betResults, userProfiles } from '@tradingarena/db';
import {
  generateRound,
  simulateRound,
  DEFAULT_ENGINE_CONFIG,
  getBetTier,
} from '@tradingarena/game-engine';
import type { RiskTier } from '@tradingarena/shared-types';
import { getDb } from '../../config/database.js';
import { getRedis } from '../../config/redis.js';
import { WalletService } from '../wallet/wallet.service.js';
import { UserService } from '../user/user.service.js';

export class RoundService {
  private db = getDb();
  private walletService = new WalletService();
  private userService = new UserService();

  // ─── Schedule a new round ────────────────────────────────

  async scheduleRound(mode: string = 'solo', delayMs: number = 15000) {
    const scheduledAt = new Date(Date.now() + delayMs);

    // Generate seed + commitment
    const seed = crypto.randomBytes(32).toString('hex');
    const seedCommitment = crypto.createHash('sha256').update(seed).digest('hex');

    const [round] = await this.db.insert(rounds).values({
      mode,
      status: 'scheduled',
      scheduledAt,
      seed,
      seedCommitment,
      configSnapshot: DEFAULT_ENGINE_CONFIG as unknown as Record<string, unknown>,
      durationMs: 15000,
    }).returning();

    // Create pool
    await this.db.insert(roundPools).values({
      roundId: round.id,
      poolType: 'main',
      liquidityMode: 'p2p',
    });

    return round;
  }

  // ─── Open entry ──────────────────────────────────────────

  async openEntry(roundId: string) {
    await this.db.update(rounds)
      .set({ status: 'entry_open' })
      .where(eq(rounds.id, roundId));

    // Publish via Redis
    const redis = getRedis();
    await redis.publish(`round:${roundId}`, JSON.stringify({
      type: 'round.entry_open',
      roundId,
    }));
  }

  // ─── Lock entries ────────────────────────────────────────

  async lockEntries(roundId: string) {
    await this.db.update(rounds)
      .set({ status: 'locked' })
      .where(eq(rounds.id, roundId));
  }

  // ─── Generate round payload ──────────────────────────────

  async generateRoundPayload(roundId: string) {
    const round = await this.db.query.rounds.findFirst({
      where: eq(rounds.id, roundId),
    });
    if (!round || !round.seed) return null;

    // Generate deterministic round from seed
    const config = generateRound(round.seed, DEFAULT_ENGINE_CONFIG);

    // Store chart path
    await this.db.update(rounds).set({
      status: 'generated',
      chartPath: config.chartPath as unknown as Record<string, unknown>,
    }).where(eq(rounds.id, roundId));

    // Store nodes
    for (const node of config.nodes) {
      await this.db.insert(roundNodes).values({
        roundId,
        nodeType: node.type,
        nodeValue: String(node.value),
        spawnTimeMs: Math.floor(node.timePosition * 1000),
        pathY: String(node.pathY),
        activationRadius: String(node.activationRadius),
        nearMissRadius: node.nearMissRadius ? String(node.nearMissRadius) : null,
        rarity: node.rarity,
      });
    }

    return config;
  }

  // ─── Start round ─────────────────────────────────────────

  async startRound(roundId: string) {
    const now = new Date();
    await this.db.update(rounds).set({
      status: 'active',
      startedAt: now,
    }).where(eq(rounds.id, roundId));

    // Update player count
    const betCount = await this.db.execute(sql`
      SELECT COUNT(*) as count FROM bets
      WHERE round_id = ${roundId} AND status = 'locked'
    `);
    const playerCount = Number(((betCount as unknown as { count: number }[])[0])?.count ?? 0);

    await this.db.update(rounds).set({ playerCount }).where(eq(rounds.id, roundId));

    // Mark bets as active
    await this.db.execute(sql`
      UPDATE bets SET status = 'active' WHERE round_id = ${roundId} AND status = 'locked'
    `);

    const redis = getRedis();
    const round = await this.db.query.rounds.findFirst({
      where: eq(rounds.id, roundId),
    });

    await redis.publish(`round:${roundId}`, JSON.stringify({
      type: 'round.started',
      roundId,
      payload: {
        chartPath: round?.chartPath,
        duration: 15000,
        seedCommitment: round?.seedCommitment,
      },
    }));
  }

  // ─── Freeze round ───────────────────────────────────────

  async freezeRound(roundId: string) {
    await this.db.update(rounds).set({
      status: 'frozen',
      endedAt: new Date(),
    }).where(eq(rounds.id, roundId));
  }

  // ─── Resolve round (settlement) ─────────────────────────

  async resolveRound(roundId: string) {
    const round = await this.db.query.rounds.findFirst({
      where: eq(rounds.id, roundId),
    });
    if (!round || !round.seed) return;

    const config = generateRound(round.seed, DEFAULT_ENGINE_CONFIG);

    // Get only active (unsettled) bets — prevents double-settlement
    const activeBets = await this.db.query.bets.findMany({
      where: and(eq(bets.roundId, roundId), eq(bets.status, 'active')),
    });

    // Simulate each player's outcome
    for (const bet of activeBets) {
      const result = simulateRound(
        config,
        bet.amount, // lamports
        bet.riskTier as RiskTier,
      );

      const payoutLamports = Math.floor(result.payout);
      const resultType = payoutLamports > bet.amount ? 'win' : payoutLamports < bet.amount ? 'loss' : 'breakeven';

      // Create bet result
      await this.db.insert(betResults).values({
        betId: bet.id,
        userId: bet.userId,
        roundId,
        finalMultiplier: String(result.finalMultiplier),
        finalScore: String(result.payout / 1e9), // Convert lamports to SOL for numeric(12,4) column
        payoutAmount: payoutLamports,
        xpAwarded: result.xpGained,
        nodesHit: result.nodesHit.length,
        nodesMissed: result.nodesMissed.length,
        nearMisses: result.nodesNearMissed?.length ?? 0,
        resultType,
        resultDetail: {
          nodesHit: result.nodesHit.map(n => ({ id: n.id, type: n.type, value: n.value })),
          nodesMissed: result.nodesMissed.map(n => ({ id: n.id, type: n.type, value: n.value })),
        },
      });

      // Settle balance
      await this.walletService.settlePayout(
        bet.userId,
        bet.amount,
        bet.fee,
        payoutLamports,
        'SOL',
        { type: 'round', id: roundId },
      );

      // Record referral commission
      try {
        const { ReferralService } = await import('../referral/referral.service.js');
        await new ReferralService().recordCommission(bet.userId, bet.id, bet.amount, bet.fee);
      } catch {
        // Non-critical — don't fail settlement
      }

      // Update bet status
      await this.db.update(bets).set({
        status: 'settled',
        settledAt: new Date(),
      }).where(eq(bets.id, bet.id));

      // Award XP
      await this.userService.addXP(bet.userId, result.xpGained, 'round');

      // Update user stats
      await this.db.execute(sql`
        UPDATE user_profiles
        SET rounds_played = rounds_played + 1,
            total_wagered = total_wagered + ${bet.amount},
            total_won = total_won + ${payoutLamports},
            best_multiplier = GREATEST(best_multiplier, ${result.finalMultiplier}),
            current_streak = CASE
              WHEN ${payoutLamports} > ${bet.amount} THEN current_streak + 1
              ELSE 0
            END,
            best_streak = GREATEST(best_streak, CASE
              WHEN ${payoutLamports} > ${bet.amount} THEN current_streak + 1
              ELSE 0
            END),
            updated_at = now()
        WHERE user_id = ${bet.userId}
      `);
    }

    // Update pool
    const pool = await this.db.query.roundPools.findFirst({
      where: eq(roundPools.roundId, roundId),
    });
    if (pool) {
      await this.db.update(roundPools).set({ settled: true }).where(eq(roundPools.id, pool.id));
    }

    // Mark round resolved
    await this.db.update(rounds).set({
      status: 'resolved',
      resolvedAt: new Date(),
    }).where(eq(rounds.id, roundId));

    // Publish result
    const redis = getRedis();
    await redis.publish(`round:${roundId}`, JSON.stringify({
      type: 'round.resolved',
      roundId,
      seed: round.seed,
    }));
  }

  // ─── Queries ─────────────────────────────────────────────

  async getNextRound() {
    return this.db.query.rounds.findFirst({
      where: eq(rounds.status, 'entry_open'),
      orderBy: [rounds.scheduledAt],
    });
  }

  async getRound(roundId: string) {
    return this.db.query.rounds.findFirst({
      where: eq(rounds.id, roundId),
    });
  }

  async getRoundResult(roundId: string, userId: string) {
    return this.db.query.betResults.findFirst({
      where: sql`${betResults.roundId} = ${roundId} AND ${betResults.userId} = ${userId}`,
    });
  }

  async getUserHistory(userId: string, limit: number = 20) {
    return this.db.query.betResults.findMany({
      where: eq(betResults.userId, userId),
      orderBy: [desc(betResults.createdAt)],
      limit,
    });
  }
}
