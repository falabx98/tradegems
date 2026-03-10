import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { eq, and, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import {
  createDb, rounds, bets, betResults, roundPools,
  balances, balanceLedgerEntries, userProfiles,
} from '@tradingarena/db';
import {
  generateRound, simulateRound,
  DEFAULT_ENGINE_CONFIG, getBetTier,
} from '@tradingarena/game-engine';
import type { RiskTier } from '@tradingarena/shared-types';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

interface SettlementJobData {
  roundId: string;
}

export class SettlementWorker {
  private worker: Worker | null = null;
  private redis: Redis;
  private db: ReturnType<typeof createDb>;

  constructor(private logger: Logger) {
    this.redis = new Redis(REDIS_URL);
    this.db = createDb(process.env.DATABASE_URL!);
  }

  start() {
    this.worker = new Worker(
      'settlement',
      async (job) => {
        const { roundId } = job.data as SettlementJobData;
        this.logger.info({ roundId }, 'Settling round');
        await this.settleRound(roundId);
      },
      {
        connection: { url: REDIS_URL },
        concurrency: 1,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.info({ roundId: (job.data as SettlementJobData).roundId }, 'Round settlement completed');
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error({ roundId: (job?.data as SettlementJobData)?.roundId, error: error.message }, 'Round settlement failed');
    });

    this.logger.info('Settlement worker started');
  }

  private async settleRound(roundId: string) {
    const round = await this.db.query.rounds.findFirst({
      where: eq(rounds.id, roundId),
    });
    if (!round?.seed) {
      this.logger.warn({ roundId }, 'Round not found or missing seed');
      return;
    }

    const config = generateRound(round.seed, DEFAULT_ENGINE_CONFIG);

    // Get only active (unsettled) bets — prevents double-settlement
    const allBets = await this.db.query.bets.findMany({
      where: and(eq(bets.roundId, roundId), eq(bets.status, 'active')),
    });

    if (allBets.length === 0) {
      // No bets, just mark resolved
      await this.db.update(rounds).set({
        status: 'resolved',
        resolvedAt: new Date(),
      }).where(eq(rounds.id, roundId));
      return;
    }

    // Simulate and settle each bet
    for (const bet of allBets) {
      try {
        const result = simulateRound(
          config,
          bet.amount, // lamports — simulateRound works with raw amounts
          bet.riskTier as RiskTier,
        );

        const payoutLamports = Math.floor(result.payout);
        const resultType = payoutLamports > bet.amount ? 'win'
          : payoutLamports < bet.amount ? 'loss'
          : 'breakeven';

        // Insert bet result
        await this.db.insert(betResults).values({
          betId: bet.id,
          userId: bet.userId,
          roundId,
          finalMultiplier: String(result.finalMultiplier),
          finalScore: String(result.payout),
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

        // Settle balance: unlock locked funds + credit payout
        // Guard: only update if locked_amount is sufficient (prevents double-settlement)
        const totalLocked = bet.amount + bet.fee;
        const updateResult = await this.db.execute(sql`
          UPDATE balances
          SET locked_amount = locked_amount - ${totalLocked},
              available_amount = available_amount + ${payoutLamports},
              updated_at = now()
          WHERE user_id = ${bet.userId} AND asset = 'SOL'
            AND locked_amount >= ${totalLocked}
        `);

        // If no row was updated, skip — already settled or insufficient locked funds
        const rowsAffected = (updateResult as any)?.rowCount ?? (updateResult as any)?.length ?? 1;
        if (rowsAffected === 0) {
          this.logger.warn({ betId: bet.id, userId: bet.userId }, 'Settlement skipped — insufficient locked funds (possible double-settlement)');
          continue;
        }

        // Query actual balance for ledger entries
        const bal = await this.db.query.balances.findFirst({
          where: eq(balances.userId, bet.userId),
        });
        const balAfter = bal?.availableAmount ?? 0;

        // Ledger entry: settle (unlock)
        await this.db.insert(balanceLedgerEntries).values({
          userId: bet.userId,
          asset: 'SOL',
          entryType: 'bet_settle',
          amount: -totalLocked,
          balanceAfter: balAfter,
          referenceType: 'round',
          referenceId: roundId,
        });

        // Ledger entry: payout credit
        if (payoutLamports > 0) {
          await this.db.insert(balanceLedgerEntries).values({
            userId: bet.userId,
            asset: 'SOL',
            entryType: 'payout_credit',
            amount: payoutLamports,
            balanceAfter: balAfter,
            referenceType: 'round',
            referenceId: roundId,
          });
        }

        // Update bet status
        await this.db.update(bets).set({
          status: 'settled',
          settledAt: new Date(),
        }).where(eq(bets.id, bet.id));

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
              xp = xp + ${result.xpGained},
              updated_at = now()
          WHERE user_id = ${bet.userId}
        `);

        // Send result to user via Redis
        await this.redis.publish(`user:${bet.userId}`, JSON.stringify({
          type: 'round.result',
          roundId,
          payload: {
            finalMultiplier: result.finalMultiplier,
            payout: payoutLamports,
            resultType,
            xpGained: result.xpGained,
            nodesHit: result.nodesHit.length,
          },
        }));

      } catch (error) {
        this.logger.error({
          betId: bet.id,
          userId: bet.userId,
          error: (error as Error).message,
        }, 'Failed to settle individual bet');
      }
    }

    // Mark pool as settled
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

    // Broadcast round resolved
    await this.redis.publish(`round:${roundId}`, JSON.stringify({
      type: 'round.resolved',
      roundId,
      seed: round.seed,
    }));
  }

  async stop() {
    await this.worker?.close();
    await this.redis.quit();
  }
}
