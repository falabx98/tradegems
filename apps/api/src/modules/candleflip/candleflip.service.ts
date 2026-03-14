import crypto from 'node:crypto';
import { getDb } from '../../config/database.js';
import { candleflipGames, users } from '@tradingarena/db';
import { WalletService } from '../wallet/wallet.service.js';
import { eq, and, desc, sql, ne } from 'drizzle-orm';

const HOUSE_FEE_RATE = 0.05; // 5% rake

export class CandleflipService {
  private db = getDb();
  private wallet = new WalletService();

  // ─── Create Game (open lobby) ──────────────────────────────

  async createGame(userId: string, betAmount: number, pick: 'bullish' | 'bearish') {
    if (betAmount < 1_000_000) throw new Error('Minimum bet is 0.001 SOL');

    const gameId = crypto.randomUUID();

    // Lock bet funds
    await this.wallet.lockFunds(userId, betAmount, 'SOL', {
      type: 'candleflip',
      id: gameId,
    });

    // Generate provably fair seed
    const seed = crypto.randomBytes(32).toString('hex');
    const seedHash = crypto.createHash('sha256').update(seed).digest('hex');

    const [game] = await this.db
      .insert(candleflipGames)
      .values({
        id: gameId,
        creatorId: userId,
        betAmount,
        creatorPick: pick,
        status: 'open',
        seed,
        seedHash,
      })
      .returning();

    return { ...game, seed: undefined }; // Don't reveal seed yet
  }

  // ─── Join Game ─────────────────────────────────────────────

  async joinGame(userId: string, gameId: string) {
    const game = await this.db.query.candleflipGames.findFirst({
      where: eq(candleflipGames.id, gameId),
    });

    if (!game) throw new Error('Game not found');
    if (game.status !== 'open') throw new Error('Game is no longer open');
    if (game.creatorId === userId) throw new Error('Cannot join your own game');

    // Lock bet funds from opponent
    await this.wallet.lockFunds(userId, game.betAmount, 'SOL', {
      type: 'candleflip',
      id: gameId,
    });

    // Update game with opponent
    await this.db
      .update(candleflipGames)
      .set({ opponentId: userId, status: 'playing' })
      .where(eq(candleflipGames.id, gameId));

    // Resolve immediately
    return this.resolveGame(gameId);
  }

  // ─── Resolve Game ──────────────────────────────────────────

  private async resolveGame(gameId: string) {
    const game = await this.db.query.candleflipGames.findFirst({
      where: eq(candleflipGames.id, gameId),
    });

    if (!game || !game.opponentId || !game.seed) throw new Error('Invalid game state');

    // Generate result from seed: hash seed → first 8 hex chars → map to multiplier
    const resultHash = crypto.createHash('sha256')
      .update(game.seed + ':' + gameId)
      .digest('hex');
    const resultValue = parseInt(resultHash.slice(0, 8), 16);
    // Map to a multiplier around 1.00x (range 0.50 to 1.50)
    const multiplier = 0.50 + (resultValue / 0xFFFFFFFF);
    const result: 'bullish' | 'bearish' = multiplier >= 1.0 ? 'bullish' : 'bearish';

    // Determine winner
    const winnerId = game.creatorPick === result ? game.creatorId : game.opponentId;
    const loserId = winnerId === game.creatorId ? game.opponentId : game.creatorId;

    // Calculate payout: winner gets both bets minus house fee
    const totalPool = game.betAmount * 2;
    const houseFee = Math.floor(totalPool * HOUSE_FEE_RATE);
    const prizeAmount = totalPool - houseFee;

    // Check if participants are bots (skip wallet ops for bots)
    const [winnerUser] = await this.db.select({ role: users.role }).from(users).where(eq(users.id, winnerId));
    const [loserUser] = await this.db.select({ role: users.role }).from(users).where(eq(users.id, loserId));
    const winnerIsBot = winnerUser?.role === 'bot';
    const loserIsBot = loserUser?.role === 'bot';

    // Settle winner: unlock their bet + add winnings
    // fee=0: lockFunds only locked betAmount; house fee is taken from pool difference
    if (!winnerIsBot) {
      try {
        await this.wallet.settlePayout(
          winnerId,
          game.betAmount,
          0,
          prizeAmount,
          'SOL',
          { type: 'candleflip', id: gameId },
        );
      } catch { /* lock may already be released */ }
    }

    // Settle loser: unlock with zero payout (fee=0, betAmount is total locked)
    if (!loserIsBot) {
      try {
        await this.wallet.settlePayout(
          loserId,
          game.betAmount,
          0,
          0,
          'SOL',
          { type: 'candleflip', id: gameId },
        );
      } catch { /* lock may already be released */ }
    }

    // Update game record
    const [resolved] = await this.db
      .update(candleflipGames)
      .set({
        result,
        resultMultiplier: multiplier.toFixed(4),
        winnerId,
        prizeAmount,
        status: 'finished',
        resolvedAt: new Date(),
      })
      .where(eq(candleflipGames.id, gameId))
      .returning();

    return resolved;
  }

  // ─── Cancel Game ───────────────────────────────────────────

  async cancelGame(userId: string, gameId: string) {
    const game = await this.db.query.candleflipGames.findFirst({
      where: eq(candleflipGames.id, gameId),
    });

    if (!game) throw new Error('Game not found');
    if (game.creatorId !== userId) throw new Error('Only creator can cancel');
    if (game.status !== 'open') throw new Error('Can only cancel open games');

    // Refund: unlock with full payout back
    await this.wallet.settlePayout(
      userId,
      game.betAmount,
      0,
      game.betAmount,
      'SOL',
      { type: 'candleflip', id: gameId },
    );

    await this.db
      .update(candleflipGames)
      .set({ status: 'cancelled' })
      .where(eq(candleflipGames.id, gameId));

    return { success: true };
  }

  // ─── Get Open Lobbies ──────────────────────────────────────

  async getOpenLobbies() {
    const lobbies = await this.db
      .select({
        id: candleflipGames.id,
        creatorId: candleflipGames.creatorId,
        creatorUsername: users.username,
        creatorAvatar: users.avatarUrl,
        betAmount: candleflipGames.betAmount,
        creatorPick: candleflipGames.creatorPick,
        status: candleflipGames.status,
        seedHash: candleflipGames.seedHash,
        createdAt: candleflipGames.createdAt,
      })
      .from(candleflipGames)
      .innerJoin(users, eq(candleflipGames.creatorId, users.id))
      .where(eq(candleflipGames.status, 'open'))
      .orderBy(desc(candleflipGames.createdAt))
      .limit(50);

    return lobbies;
  }

  // ─── Get Recent Results ────────────────────────────────────

  async getRecentResults(limit = 20) {
    const results = await this.db
      .select({
        id: candleflipGames.id,
        creatorId: candleflipGames.creatorId,
        opponentId: candleflipGames.opponentId,
        betAmount: candleflipGames.betAmount,
        creatorPick: candleflipGames.creatorPick,
        result: candleflipGames.result,
        resultMultiplier: candleflipGames.resultMultiplier,
        winnerId: candleflipGames.winnerId,
        prizeAmount: candleflipGames.prizeAmount,
        resolvedAt: candleflipGames.resolvedAt,
      })
      .from(candleflipGames)
      .where(eq(candleflipGames.status, 'finished'))
      .orderBy(desc(candleflipGames.resolvedAt))
      .limit(limit);

    return results;
  }

  // ─── Get Game ──────────────────────────────────────────────

  async getGame(gameId: string) {
    const game = await this.db.query.candleflipGames.findFirst({
      where: eq(candleflipGames.id, gameId),
    });
    if (!game) throw new Error('Game not found');

    // Only reveal seed after game is finished
    if (game.status !== 'finished') {
      return { ...game, seed: undefined };
    }
    return game;
  }

  // ─── Get User History ──────────────────────────────────────

  async getUserHistory(userId: string, limit = 20) {
    const games = await this.db
      .select()
      .from(candleflipGames)
      .where(
        and(
          eq(candleflipGames.status, 'finished'),
          sql`(${candleflipGames.creatorId} = ${userId} OR ${candleflipGames.opponentId} = ${userId})`,
        ),
      )
      .orderBy(desc(candleflipGames.resolvedAt))
      .limit(limit);

    return games.map(g => ({
      ...g,
      seed: g.seed, // reveal for finished games
    }));
  }
}
