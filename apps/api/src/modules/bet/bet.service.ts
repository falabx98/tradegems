import { eq, and, desc, sql } from 'drizzle-orm';
import { bets, rounds, roundPools } from '@tradingarena/db';
import { getBetTier, DEFAULT_ENGINE_CONFIG } from '@tradingarena/game-engine';
import { getDb } from '../../config/database.js';
import { getRedis } from '../../config/redis.js';
import { WalletService } from '../wallet/wallet.service.js';
import { AppError } from '../../middleware/errorHandler.js';
import { env } from '../../config/env.js';

interface PlaceBetInput {
  userId: string;
  roundId: string;
  amount: number;
  riskTier: string;
  idempotencyKey: string;
}

export class BetService {
  private db = getDb();
  private walletService = new WalletService();

  async placeBet(input: PlaceBetInput) {
    const redis = getRedis();

    // Idempotency check
    const idempKey = `idempotent:bet:${input.idempotencyKey}`;
    const existing = await redis.get(idempKey);
    if (existing) {
      const existingBet = await this.db.query.bets.findFirst({
        where: eq(bets.idempotencyKey, input.idempotencyKey),
      });
      if (existingBet) return this.formatBet(existingBet);
    }

    // Verify round is accepting bets
    const round = await this.db.query.rounds.findFirst({
      where: eq(rounds.id, input.roundId),
    });
    if (!round) throw new AppError(404, 'ROUND_NOT_FOUND', 'Round not found');
    if (round.status !== 'entry_open' && round.status !== 'scheduled') {
      throw new AppError(400, 'ROUND_CLOSED', 'Round is no longer accepting bets');
    }

    // Check duplicate bet
    const existingBetForRound = await this.db.query.bets.findFirst({
      where: and(eq(bets.userId, input.userId), eq(bets.roundId, input.roundId)),
    });
    if (existingBetForRound) {
      throw new AppError(409, 'BET_ALREADY_PLACED', 'You already have a bet on this round');
    }

    // Calculate fee
    const feeRate = env.PLATFORM_FEE_RATE;
    const fee = Math.floor(input.amount * feeRate);
    const totalCost = input.amount + fee;

    // Determine bet size tier
    const betTier = getBetTier(input.amount, DEFAULT_ENGINE_CONFIG); // lamports (tiers are in lamports)
    const betSizeTier = betTier.label.toLowerCase();

    // Lock funds
    const balanceResult = await this.walletService.lockFunds(
      input.userId,
      totalCost,
      'SOL',
      { type: 'bet', id: 'pending' },
    );

    // Get or create pool
    let pool = await this.db.query.roundPools.findFirst({
      where: eq(roundPools.roundId, input.roundId),
    });
    if (!pool) {
      [pool] = await this.db.insert(roundPools).values({
        roundId: input.roundId,
        poolType: 'main',
        liquidityMode: 'p2p',
        feeRate: String(feeRate),
      }).returning();
    }

    // Create bet
    const [bet] = await this.db.insert(bets).values({
      userId: input.userId,
      roundId: input.roundId,
      poolId: pool.id,
      amount: input.amount,
      fee,
      riskTier: input.riskTier,
      betSizeTier,
      status: 'locked',
      lockedAt: new Date(),
      idempotencyKey: input.idempotencyKey,
    }).returning();

    // Update pool totals
    await this.db.execute(sql`
      UPDATE round_pools
      SET gross_pool = gross_pool + ${totalCost},
          fee_amount = fee_amount + ${fee},
          net_pool = net_pool + ${input.amount},
          player_count = player_count + 1
      WHERE id = ${pool.id}
    `);

    // Set idempotency key
    await redis.set(idempKey, bet.id, 'EX', 300);

    return {
      bet: this.formatBet(bet),
      balance: {
        available: balanceResult.available,
        locked: balanceResult.locked,
      },
    };
  }

  async cancelBet(userId: string, roundId: string) {
    const bet = await this.db.query.bets.findFirst({
      where: and(eq(bets.userId, userId), eq(bets.roundId, roundId)),
    });
    if (!bet) throw new AppError(404, 'BET_NOT_FOUND', 'Bet not found');
    if (bet.status !== 'locked') {
      throw new AppError(400, 'BET_NOT_CANCELLABLE', 'Bet cannot be cancelled');
    }

    // Check round still allows cancellation
    const round = await this.db.query.rounds.findFirst({
      where: eq(rounds.id, roundId),
    });
    if (round && round.status !== 'entry_open' && round.status !== 'scheduled') {
      throw new AppError(400, 'ROUND_LOCKED', 'Round has already locked');
    }

    // Release funds
    const totalCost = bet.amount + bet.fee;
    await this.walletService.releaseFunds(userId, totalCost, 'SOL', { type: 'bet', id: bet.id });

    // Update bet status
    await this.db.update(bets)
      .set({ status: 'cancelled' })
      .where(eq(bets.id, bet.id));
  }

  async getBetsForRound(roundId: string) {
    return this.db.query.bets.findMany({
      where: and(eq(bets.roundId, roundId), eq(bets.status, 'locked')),
    });
  }

  async getUserHistory(userId: string, limit: number = 20) {
    return this.db.query.bets.findMany({
      where: eq(bets.userId, userId),
      orderBy: [desc(bets.createdAt)],
      limit,
    });
  }

  private formatBet(bet: typeof bets.$inferSelect) {
    return {
      id: bet.id,
      roundId: bet.roundId,
      amount: bet.amount,
      fee: bet.fee,
      riskTier: bet.riskTier,
      betSizeTier: bet.betSizeTier,
      status: bet.status,
      lockedAt: bet.lockedAt?.toISOString(),
      createdAt: bet.createdAt.toISOString(),
    };
  }
}
