import crypto from 'node:crypto';
import { getDb } from '../../config/database.js';
import { rugGames, users } from '@tradingarena/db';
import { WalletService } from '../wallet/wallet.service.js';
import { eq, and, desc, sql } from 'drizzle-orm';

const HOUSE_EDGE = 0.04; // 4% house edge applied to crash point

export class RugGameService {
  private db = getDb();
  private wallet = new WalletService();

  // ─── Generate crash point using provably fair seed ─────────
  private generateCrashPoint(seed: string, gameId: string): number {
    const hash = crypto.createHash('sha256')
      .update(seed + ':' + gameId)
      .digest('hex');

    // Convert first 13 hex chars to number, map to crash point
    const h = parseInt(hash.slice(0, 13), 16);
    // House edge: 4% of the time insta-crash at 1.00x
    if (h % 25 === 0) return 1.00;

    // Crash distribution: e = 2^52 / (2^52 - h % 2^52) * (1 - HOUSE_EDGE)
    const e = Math.pow(2, 52);
    const raw = e / (e - (h % e));
    const result = Math.max(1.00, raw * (1 - HOUSE_EDGE));

    // Cap at 100x for sanity
    return Math.min(parseFloat(result.toFixed(2)), 100.00);
  }

  // ─── Start New Game ────────────────────────────────────────

  async startGame(userId: string, betAmount: number) {
    if (betAmount < 1_000_000) throw new Error('Minimum bet is 0.001 SOL');

    const gameId = crypto.randomUUID();

    // Lock bet funds
    await this.wallet.lockFunds(userId, betAmount, 'SOL', {
      type: 'rug_game',
      id: gameId,
    });

    // Generate provably fair seed
    const seed = crypto.randomBytes(32).toString('hex');
    const seedHash = crypto.createHash('sha256').update(seed).digest('hex');

    // Generate the hidden crash/rug multiplier
    const rugMultiplier = this.generateCrashPoint(seed, gameId);

    const [game] = await this.db
      .insert(rugGames)
      .values({
        id: gameId,
        userId,
        betAmount,
        status: 'active',
        rugMultiplier: rugMultiplier.toFixed(4),
        seed,
        seedHash,
      })
      .returning();

    return {
      id: game.id,
      betAmount: game.betAmount,
      status: game.status,
      seedHash: game.seedHash,
      createdAt: game.createdAt,
    };
  }

  // ─── Cash Out ──────────────────────────────────────────────

  // Multiplier growth function: starts at 1.00x and grows exponentially over time
  // This must match the client-side growth curve so the server can cap the max achievable multiplier
  private getMaxMultiplierForElapsed(elapsedMs: number): number {
    // Growth: multiplier = e^(speed * t), speed tuned so 10x is reached in ~23s
    const GROWTH_SPEED = 0.0001; // ~e^(0.0001 * ms)
    return Math.exp(GROWTH_SPEED * elapsedMs);
  }

  async cashOut(userId: string, gameId: string, currentMultiplier: number) {
    const game = await this.db.query.rugGames.findFirst({
      where: eq(rugGames.id, gameId),
    });

    if (!game) throw new Error('Game not found');
    if (game.userId !== userId) throw new Error('Not your game');
    if (game.status !== 'active') throw new Error('Game is not active');

    const rugMultiplier = parseFloat(game.rugMultiplier);

    // Server-side time check: cap multiplier based on elapsed time since game start
    const elapsedMs = Date.now() - game.createdAt.getTime();
    const maxAllowedByTime = this.getMaxMultiplierForElapsed(elapsedMs);
    // Clamp to what's achievable in the elapsed time (+ 10% tolerance for latency)
    const clampedMultiplier = Math.min(currentMultiplier, maxAllowedByTime * 1.10);

    // Check if the player is trying to cash out past the rug point
    if (clampedMultiplier >= rugMultiplier) {
      // Got rugged! They lose
      return this.resolveRug(gameId, game);
    }

    // Successful cash out — fee=0 because house edge is in the crash point; lockFunds only locked betAmount
    const payout = Math.floor(game.betAmount * clampedMultiplier);

    await this.wallet.settlePayout(
      userId,
      game.betAmount,
      0,
      payout,
      'SOL',
      { type: 'rug_game', id: gameId },
    );

    const [resolved] = await this.db
      .update(rugGames)
      .set({
        status: 'cashed_out',
        cashOutMultiplier: currentMultiplier.toFixed(4),
        payout,
        resolvedAt: new Date(),
      })
      .where(eq(rugGames.id, gameId))
      .returning();

    return {
      ...resolved,
      rugMultiplier: resolved.rugMultiplier, // reveal after game ends
    };
  }

  // ─── Rug (crash) ───────────────────────────────────────────

  async rug(userId: string, gameId: string) {
    const game = await this.db.query.rugGames.findFirst({
      where: eq(rugGames.id, gameId),
    });

    if (!game) throw new Error('Game not found');
    if (game.userId !== userId) throw new Error('Not your game');
    if (game.status !== 'active') throw new Error('Game is not active');

    return this.resolveRug(gameId, game);
  }

  private async resolveRug(gameId: string, game: any) {
    // Player got rugged — lose bet (payout=0, non-critical but log errors)
    try {
      await this.wallet.settlePayout(
        game.userId,
        game.betAmount,
        0,
        0,
        'SOL',
        { type: 'rug_game', id: gameId },
      );
    } catch (err) {
      console.error('[RugGame] resolveRug settlement failed:', err, { userId: game.userId, gameId });
    }

    const [resolved] = await this.db
      .update(rugGames)
      .set({
        status: 'rugged',
        payout: 0,
        resolvedAt: new Date(),
      })
      .where(eq(rugGames.id, gameId))
      .returning();

    return {
      ...resolved,
      rugMultiplier: resolved.rugMultiplier, // reveal after game ends
    };
  }

  // ─── Get Game ──────────────────────────────────────────────

  async getGame(gameId: string) {
    const game = await this.db.query.rugGames.findFirst({
      where: eq(rugGames.id, gameId),
    });
    if (!game) throw new Error('Game not found');

    // Only reveal seed/rugMultiplier after game ends
    if (game.status === 'active') {
      return {
        id: game.id,
        betAmount: game.betAmount,
        status: game.status,
        seedHash: game.seedHash,
        createdAt: game.createdAt,
      };
    }
    return game;
  }

  // ─── Get User History ──────────────────────────────────────

  async getUserHistory(userId: string, limit = 20) {
    return this.db
      .select()
      .from(rugGames)
      .where(
        and(
          eq(rugGames.userId, userId),
          sql`${rugGames.status} != 'active'`,
        ),
      )
      .orderBy(desc(rugGames.resolvedAt))
      .limit(limit);
  }

  // ─── Get Recent Public Games ────────────────────────────────

  async getRecentPublicGames(limit = 20) {
    return this.db
      .select({
        id: rugGames.id,
        betAmount: rugGames.betAmount,
        status: rugGames.status,
        rugMultiplier: rugGames.rugMultiplier,
        cashOutMultiplier: rugGames.cashOutMultiplier,
        payout: rugGames.payout,
        resolvedAt: rugGames.resolvedAt,
        username: users.username,
      })
      .from(rugGames)
      .innerJoin(users, eq(rugGames.userId, users.id))
      .where(sql`${rugGames.status} != 'active'`)
      .orderBy(desc(rugGames.resolvedAt))
      .limit(limit);
  }

  // ─── Get Live Games (active bot rounds visible to all) ──────

  async getLiveGames(limit = 10) {
    return this.db
      .select({
        id: rugGames.id,
        betAmount: rugGames.betAmount,
        status: rugGames.status,
        seedHash: rugGames.seedHash,
        createdAt: rugGames.createdAt,
        username: users.username,
        avatarUrl: users.avatarUrl,
      })
      .from(rugGames)
      .innerJoin(users, eq(rugGames.userId, users.id))
      .where(eq(rugGames.status, 'active'))
      .orderBy(desc(rugGames.createdAt))
      .limit(limit);
  }

  // ─── Get Active Game ───────────────────────────────────────

  async getActiveGame(userId: string) {
    const game = await this.db.query.rugGames.findFirst({
      where: and(eq(rugGames.userId, userId), eq(rugGames.status, 'active')),
    });
    if (!game) return null;
    return {
      id: game.id,
      betAmount: game.betAmount,
      status: game.status,
      seedHash: game.seedHash,
      createdAt: game.createdAt,
    };
  }
}
