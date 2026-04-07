/**
 * TradeGems Mines — Game Service
 *
 * Lifecycle: startGame → revealTile (1..N) → cashOut | mine hit
 * One active game per user. Auto-loss after 24h.
 */

import crypto from 'node:crypto';
import { eq, and, sql, desc, lt } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { minesGames } from '@tradingarena/db';
import { WalletService } from '../wallet/wallet.service.js';
import { AppError } from '../../middleware/errorHandler.js';
import { auditLog } from '../../utils/auditLog.js';
import { recordFailedSettlement } from '../../utils/settlementRecovery.js';
import { UserService } from '../user/user.service.js';
import { MissionsService } from '../missions/missions.service.js';
import { checkPayoutOutlier } from '../../utils/payoutMonitor.js';
import { env } from '../../config/env.js';
import { recordOpsAlert } from '../../utils/opsAlert.js';
import { clampPayout as clampGamePayout } from '../../utils/betLimits.js';
import {
  generateBoard,
  generateServerSeed,
  generateClientSeed,
  hashSeed,
  isMine,
  coordToIndex,
  indexToCoord,
  getMinePositions,
  getMultiplier,
  getNextMultiplier,
  calculatePayout,
  getGemTier,
} from './mines.math.js';
import {
  GRID_SIZE,
  MAX_MULTIPLIER,
  VALID_MINE_COUNTS,
  GAME_TIMEOUT_MS,
  type RevealedCell,
  type MinesGamePublic,
  type MinesGameResult,
  type RevealResult,
  type CashoutResult,
} from './mines.types.js';

export class MinesService {
  private db = getDb();
  private wallet = new WalletService();
  private userService = new UserService();
  private missionsService = new MissionsService();

  // ─── Start Game ──────────────────────────────────────────

  async startGame(userId: string, betAmount: number, mineCount: number): Promise<MinesGamePublic> {
    // Validate mine count
    if (!(VALID_MINE_COUNTS as readonly number[]).includes(mineCount)) {
      throw new AppError(400, 'INVALID_MINE_COUNT', `Mine count must be one of: ${VALID_MINE_COUNTS.join(', ')}`);
    }

    // Max bet guardrail
    if (betAmount > env.MINES_MAX_BET_LAMPORTS) {
      recordOpsAlert({
        severity: 'warning', category: 'bet_cap_violation',
        message: `Mines bet rejected: ${betAmount} > max ${env.MINES_MAX_BET_LAMPORTS}`,
        userId, game: 'mines', metadata: { betAmount, limit: env.MINES_MAX_BET_LAMPORTS },
      }).catch(() => {});
      throw new AppError(400, 'BET_EXCEEDS_CAP', `Maximum bet is ${(env.MINES_MAX_BET_LAMPORTS / 1e9).toFixed(2)} SOL during platform bootstrap phase.`);
    }

    // Check for existing active game (auto-expire timed out ones)
    const existing = await this.getActiveGame(userId);
    if (existing) {
      throw new AppError(409, 'ACTIVE_GAME_EXISTS', 'You already have an active Mines game');
    }

    const gameId = crypto.randomUUID();

    // Lock bet funds (demo or real)
    await this.wallet.lockFunds(userId, betAmount, 'SOL', {
      type: 'mines',
      id: gameId,
    });

    // Generate provably fair seeds + board
    const serverSeed = generateServerSeed();
    const seedHash = hashSeed(serverSeed);
    const clientSeed = generateClientSeed(userId);
    const board = generateBoard(serverSeed, clientSeed, gameId, mineCount);

    let game;
    try {
      const [inserted] = await this.db
        .insert(minesGames)
        .values({
          id: gameId,
          userId,
          betAmount,
          mineCount,
          revealedCells: [],
          revealCount: 0,
          currentMultiplier: '1.0000',
          status: 'active',
          seed: serverSeed,
          seedHash,
          clientSeed,
          board: JSON.stringify(board),
          isDemo: false,
        })
        .returning();
      game = inserted;
    } catch (err: any) {
      // Unique constraint violation = race condition, another request already created a game
      if (err?.code === '23505' || err?.message?.includes('unique') || err?.message?.includes('duplicate')) {
        // Release the funds we just locked — the other request's game owns the lock
        await this.wallet.releaseFunds(userId, betAmount, 'SOL', { type: 'mines', id: gameId });
        throw new AppError(409, 'ACTIVE_GAME_EXISTS', 'You already have an active Mines game');
      }
      throw err;
    }

    auditLog({
      action: 'mines_start',
      userId,
      game: 'mines',
      gameId,
      betAmount,
      status: 'success',
      meta: { mineCount, seedHash },
    });

    return this.toPublic(game);
  }

  // ─── Reveal Tile ─────────────────────────────────────────

  async revealTile(userId: string, gameId: string, x: number, y: number): Promise<RevealResult> {
    // Validate coordinates
    if (x < 0 || x > 4 || y < 0 || y > 4) {
      throw new AppError(400, 'INVALID_POSITION', 'Position must be 0-4 for both x and y');
    }

    const game = await this.db.query.minesGames.findFirst({
      where: eq(minesGames.id, gameId),
    });

    if (!game) throw new AppError(404, 'GAME_NOT_FOUND', 'Game not found');
    if (game.userId !== userId) throw new AppError(403, 'NOT_YOUR_GAME', 'This is not your game');
    if (game.status !== 'active') throw new AppError(400, 'GAME_NOT_ACTIVE', 'Game is not active');

    // Check 24h timeout
    if (Date.now() - game.createdAt.getTime() > GAME_TIMEOUT_MS) {
      await this.settleAsLoss(game);
      throw new AppError(400, 'GAME_EXPIRED', 'Game expired after 24 hours');
    }

    const position = coordToIndex(x, y);
    const revealed = (game.revealedCells as RevealedCell[]) || [];

    // Idempotency: if position already revealed, return cached result
    const alreadyRevealed = revealed.find(c => c.x === x && c.y === y);
    if (alreadyRevealed) {
      return {
        safe: alreadyRevealed.safe,
        position: { x, y },
        multiplier: alreadyRevealed.multiplier,
        gemTier: alreadyRevealed.gemTier,
      };
    }

    const board: number[] = JSON.parse(game.board);
    const hitMine = isMine(board, position);
    const newPickCount = game.revealCount + 1;

    if (hitMine) {
      // ─── MINE HIT: settle as loss ───
      const cell: RevealedCell = {
        x, y, safe: false,
        multiplier: 0,
        gemTier: getGemTier(game.revealCount),
      };
      const newRevealed = [...revealed, cell];

      // Settle: payout = 0 (player loses bet)
      try {
        await this.wallet.settlePayout(userId, game.betAmount, 0, 0, 'SOL', {
          type: 'mines',
          id: gameId,
        });
      } catch (err: any) {
        await recordFailedSettlement({
          userId,
          game: 'mines',
          gameRefType: 'mines',
          gameRefId: gameId,
          betAmount: game.betAmount,
          fee: 0,
          payoutAmount: 0,
          errorMessage: err.message,
          metadata: { action: 'mine_hit', mineCount: game.mineCount, revealCount: newPickCount },
        });
      }

      await this.db.update(minesGames).set({
        revealedCells: newRevealed,
        revealCount: newPickCount,
        currentMultiplier: '0.0000',
        finalMultiplier: '0.0000',
        payout: 0,
        status: 'lost',
        resolvedAt: new Date(),
      }).where(and(eq(minesGames.id, gameId), eq(minesGames.status, 'active')));

      auditLog({
        action: 'mines_reveal',
        userId,
        game: 'mines',
        gameId,
        status: 'success',
        outcome: 'mine_hit',
        meta: { position: { x, y }, pickNumber: newPickCount, mineCount: game.mineCount },
      });

      // Award XP + track missions for mine hit (loss)
      this.userService.addXP(userId, 10, 'mines').catch(() => {});
      this.missionsService.trackProgress(userId, 'mines_result', false).catch(() => {});

      return {
        safe: false,
        position: { x, y },
        multiplier: 0,
        gemTier: cell.gemTier,
        gameOver: {
          seed: game.seed,
          clientSeed: game.clientSeed,
          minePositions: getMinePositions(board),
        },
      };
    }

    // ─── SAFE PICK ───
    const newMultiplier = getMultiplier(newPickCount, game.mineCount);
    const gemTier = getGemTier(game.revealCount);
    const safeTiles = GRID_SIZE - game.mineCount;

    const cell: RevealedCell = {
      x, y, safe: true,
      multiplier: newMultiplier,
      gemTier,
    };
    const newRevealed = [...revealed, cell];

    // ─── AUTO-CASHOUT: cap hit OR full clear ───
    // If multiplier reached MAX_MULTIPLIER or all safe tiles revealed,
    // the game ends immediately in this request. No further reveals allowed.
    if (newMultiplier >= MAX_MULTIPLIER || newPickCount >= safeTiles) {
      const reason = newMultiplier >= MAX_MULTIPLIER ? 'cap_hit' : 'full_clear';
      const result = await this.performCashout(game, newRevealed, newPickCount, newMultiplier, board, reason);
      // Return terminal response with gameOver payload so frontend knows game ended
      return {
        ...result,
        gameOver: {
          seed: game.seed,
          clientSeed: game.clientSeed,
          minePositions: getMinePositions(board),
        },
      };
    }

    // Update game state (optimistic concurrency: only if revealCount hasn't changed)
    const [updated] = await this.db.update(minesGames).set({
      revealedCells: newRevealed,
      revealCount: newPickCount,
      currentMultiplier: newMultiplier.toFixed(4),
    }).where(and(
      eq(minesGames.id, gameId),
      eq(minesGames.revealCount, game.revealCount), // guard against stale-read race
    )).returning();

    if (!updated) {
      // Another concurrent request already updated this game — re-read and return
      const fresh = await this.db.query.minesGames.findFirst({ where: eq(minesGames.id, gameId) });
      const freshRevealed = (fresh?.revealedCells as RevealedCell[]) || [];
      const existing = freshRevealed.find(c => c.x === x && c.y === y);
      if (existing) {
        return { safe: existing.safe, position: { x, y }, multiplier: existing.multiplier, gemTier: existing.gemTier };
      }
      throw new AppError(409, 'CONCURRENT_REVEAL', 'Concurrent reveal detected, please retry');
    }

    auditLog({
      action: 'mines_reveal',
      userId,
      game: 'mines',
      gameId,
      status: 'success',
      outcome: 'safe',
      multiplier: newMultiplier,
      meta: { position: { x, y }, pickNumber: newPickCount, mineCount: game.mineCount, gemTier },
    });

    return {
      safe: true,
      position: { x, y },
      multiplier: newMultiplier,
      gemTier,
    };
  }

  // ─── Cash Out ────────────────────────────────────────────

  async cashOut(userId: string, gameId: string): Promise<CashoutResult> {
    const game = await this.db.query.minesGames.findFirst({
      where: eq(minesGames.id, gameId),
    });

    if (!game) throw new AppError(404, 'GAME_NOT_FOUND', 'Game not found');
    if (game.userId !== userId) throw new AppError(403, 'NOT_YOUR_GAME', 'This is not your game');

    // Idempotency: if already cashed out, return existing result
    if (game.status === 'cashed_out') {
      const board: number[] = JSON.parse(game.board);
      return {
        payout: game.payout!,
        finalMultiplier: parseFloat(game.finalMultiplier!),
        seed: game.seed,
        clientSeed: game.clientSeed,
        minePositions: getMinePositions(board),
      };
    }

    if (game.status !== 'active') throw new AppError(400, 'GAME_NOT_ACTIVE', 'Game is not active');
    if (game.revealCount < 1) throw new AppError(400, 'NO_PICKS', 'Must reveal at least 1 tile before cashing out');

    // Check 24h timeout
    if (Date.now() - game.createdAt.getTime() > GAME_TIMEOUT_MS) {
      await this.settleAsLoss(game);
      throw new AppError(400, 'GAME_EXPIRED', 'Game expired after 24 hours');
    }

    const currentMultiplier = parseFloat(game.currentMultiplier);
    const revealed = (game.revealedCells as RevealedCell[]) || [];
    const board: number[] = JSON.parse(game.board);

    const result = await this.performCashout(game, revealed, game.revealCount, currentMultiplier, board, 'manual');

    return {
      payout: result.multiplier > 0 ? calculatePayout(game.betAmount, result.multiplier) : 0,
      finalMultiplier: result.multiplier,
      seed: game.seed,
      clientSeed: game.clientSeed,
      minePositions: getMinePositions(board),
    };
  }

  // ─── Get Active Game ─────────────────────────────────────

  async getActiveGame(userId: string): Promise<MinesGamePublic | null> {
    const game = await this.db.query.minesGames.findFirst({
      where: and(
        eq(minesGames.userId, userId),
        eq(minesGames.status, 'active'),
      ),
    });

    if (!game) return null;

    // Check 24h timeout
    if (Date.now() - game.createdAt.getTime() > GAME_TIMEOUT_MS) {
      await this.settleAsLoss(game);
      return null;
    }

    return this.toPublic(game);
  }

  // ─── Game History ────────────────────────────────────────

  async getHistory(userId: string, limit: number = 20): Promise<MinesGamePublic[]> {
    const games = await this.db.query.minesGames.findMany({
      where: eq(minesGames.userId, userId),
      orderBy: [desc(minesGames.createdAt)],
      limit: Math.min(limit, 100),
    });

    return games.map(g => this.toPublic(g));
  }

  // ─── Get Game for Fairness Verification ──────────────────

  async getGameForVerification(gameId: string): Promise<MinesGameResult | null> {
    const game = await this.db.query.minesGames.findFirst({
      where: eq(minesGames.id, gameId),
    });

    if (!game) return null;
    if (game.status === 'active') {
      // Don't reveal seed for active games
      return null;
    }

    const board: number[] = JSON.parse(game.board);

    return {
      ...this.toPublic(game),
      seed: game.seed,
      clientSeed: game.clientSeed,
      minePositions: getMinePositions(board),
      finalMultiplier: parseFloat(game.finalMultiplier || '0'),
      payout: game.payout || 0,
    };
  }

  // ─── Internal: Perform Cashout Settlement ────────────────

  private async performCashout(
    game: any,
    revealed: RevealedCell[],
    pickCount: number,
    multiplier: number,
    board: number[],
    reason: 'manual' | 'cap_hit' | 'full_clear' = 'manual',
  ): Promise<RevealResult> {
    let payout = calculatePayout(game.betAmount, multiplier);

    // Max payout cap (shared helper)
    const clamped = clampGamePayout('mines', game.userId, payout, { multiplier, betAmount: game.betAmount });
    payout = clamped.payout;

    try {
      await this.wallet.settlePayout(game.userId, game.betAmount, 0, payout, 'SOL', {
        type: 'mines',
        id: game.id,
      });
    } catch (err: any) {
      await recordFailedSettlement({
        userId: game.userId,
        game: 'mines',
        gameRefType: 'mines',
        gameRefId: game.id,
        betAmount: game.betAmount,
        fee: 0,
        payoutAmount: payout,
        errorMessage: err.message,
        metadata: { action: reason, multiplier, pickCount, mineCount: game.mineCount },
      });
      throw new AppError(500, 'SETTLEMENT_FAILED', 'Payout settlement failed. Our team has been notified.');
    }

    await this.db.update(minesGames).set({
      revealedCells: revealed,
      revealCount: pickCount,
      currentMultiplier: multiplier.toFixed(4),
      finalMultiplier: multiplier.toFixed(4),
      payout,
      status: 'cashed_out',
      resolvedAt: new Date(),
    }).where(eq(minesGames.id, game.id));

    auditLog({
      action: 'mines_cashout',
      userId: game.userId,
      game: 'mines',
      gameId: game.id,
      betAmount: game.betAmount,
      payoutAmount: payout,
      multiplier,
      status: 'success',
      outcome: reason,
      meta: { pickCount, mineCount: game.mineCount, reason },
    });

    // Non-blocking outlier check
    checkPayoutOutlier({
      game: 'mines',
      userId: game.userId,
      gameId: game.id,
      betAmount: game.betAmount,
      payoutAmount: payout,
      multiplier,
    }).catch(() => {});

    // Award XP + track missions for successful cashout (win)
    this.userService.addXP(game.userId, 25, 'mines').catch(() => {});
    this.missionsService.trackProgress(game.userId, 'mines_result', true).catch(() => {});

    const lastRevealed = revealed[revealed.length - 1];
    return {
      safe: true,
      position: { x: lastRevealed?.x ?? 0, y: lastRevealed?.y ?? 0 },
      multiplier,
      gemTier: lastRevealed?.gemTier ?? 'emerald',
    };
  }

  // ─── Internal: Settle Expired Game as Loss ───────────────

  private async settleAsLoss(game: any): Promise<void> {
    try {
      await this.wallet.settlePayout(game.userId, game.betAmount, 0, 0, 'SOL', {
        type: 'mines',
        id: game.id,
      });
    } catch (err: any) {
      await recordFailedSettlement({
        userId: game.userId,
        game: 'mines',
        gameRefType: 'mines',
        gameRefId: game.id,
        betAmount: game.betAmount,
        fee: 0,
        payoutAmount: 0,
        errorMessage: err.message,
        metadata: { action: 'timeout_loss' },
      });
    }

    await this.db.update(minesGames).set({
      finalMultiplier: '0.0000',
      payout: 0,
      status: 'lost',
      resolvedAt: new Date(),
    }).where(eq(minesGames.id, game.id));

    auditLog({
      action: 'mines_timeout',
      userId: game.userId,
      game: 'mines',
      gameId: game.id,
      betAmount: game.betAmount,
      status: 'success',
      outcome: 'timeout_loss',
    });
  }

  // ─── Internal: Convert DB row to public format ───────────

  private toPublic(game: any): MinesGamePublic {
    return {
      id: game.id,
      betAmount: game.betAmount,
      mineCount: game.mineCount,
      seedHash: game.seedHash,
      status: game.status,
      revealedCells: (game.revealedCells as RevealedCell[]) || [],
      revealCount: game.revealCount,
      currentMultiplier: parseFloat(game.currentMultiplier),
      createdAt: game.createdAt.toISOString(),
    };
  }
}
