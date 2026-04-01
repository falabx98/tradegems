import { getDb } from '../../config/database.js';
import { tradingSimRooms, tradingSimParticipants, tradingSimTrades, users } from '@tradingarena/db';
import { WalletService } from '../wallet/wallet.service.js';
import { generateSimulatedChart } from '../../utils/chartGenerator.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { auditLog } from '../../utils/auditLog.js';
import { recordFailedSettlement } from '../../utils/settlementRecovery.js';
import { UserService } from '../user/user.service.js';
import { MissionsService } from '../missions/missions.service.js';

const PLATFORM_FEE_RATE = 0.05; // 5% rake
const SIM_START_BALANCE = 10_000; // virtual units each player starts with

export class TradingSimService {
  private db = getDb();
  private walletService = new WalletService();
  private userService = new UserService();
  private missionsService = new MissionsService();

  // ─── List Available Rooms ───────────────────────────────────

  async getAvailableRooms() {
    return this.db
      .select()
      .from(tradingSimRooms)
      .where(eq(tradingSimRooms.status, 'waiting'))
      .orderBy(desc(tradingSimRooms.createdAt));
  }

  // ─── Recent Finished Rooms ──────────────────────────────────

  async getRecentFinished(limit = 20) {
    return this.db
      .select({
        id: tradingSimRooms.id,
        entryFee: tradingSimRooms.entryFee,
        maxPlayers: tradingSimRooms.maxPlayers,
        currentPlayers: tradingSimRooms.currentPlayers,
        status: tradingSimRooms.status,
        prizePool: tradingSimRooms.prizePool,
        winnerId: tradingSimRooms.winnerId,
        winnerUsername: users.username,
        endedAt: tradingSimRooms.endedAt,
      })
      .from(tradingSimRooms)
      .leftJoin(users, eq(tradingSimRooms.winnerId, users.id))
      .where(eq(tradingSimRooms.status, 'finished'))
      .orderBy(desc(tradingSimRooms.endedAt))
      .limit(limit);
  }

  // ─── Create Room ────────────────────────────────────────────

  async createRoom(userId: string, entryFee: number, maxPlayers: number) {
    // Lock entry fee from creator's wallet
    const roomId = crypto.randomUUID();

    await this.walletService.lockFunds(userId, entryFee, 'SOL', {
      type: 'trading_sim',
      id: roomId,
    });
    auditLog({ action: 'trading_sim_join', userId, game: 'trading-sim', gameId: roomId, betAmount: entryFee, status: 'success' });

    // Insert room
    const [room] = await this.db
      .insert(tradingSimRooms)
      .values({
        id: roomId,
        entryFee,
        maxPlayers,
        currentPlayers: 1,
        status: 'waiting',
        prizePool: entryFee,
        duration: 60,
      })
      .returning();

    // Add creator as first participant
    await this.db.insert(tradingSimParticipants).values({
      roomId: room.id,
      userId,
      startBalance: SIM_START_BALANCE,
    });

    return room;
  }

  // ─── Join Room ──────────────────────────────────────────────

  async joinRoom(userId: string, roomId: string, isDemoBet = false) {
    const room = await this.db.query.tradingSimRooms.findFirst({
      where: eq(tradingSimRooms.id, roomId),
    });

    if (!room) throw new Error('Room not found');
    if (room.status !== 'waiting') throw new Error('Room is not accepting players');
    if (room.currentPlayers >= room.maxPlayers) throw new Error('Room is full');

    // Check if user already joined
    const existing = await this.db.query.tradingSimParticipants.findFirst({
      where: and(
        eq(tradingSimParticipants.roomId, roomId),
        eq(tradingSimParticipants.userId, userId),
      ),
    });
    if (existing) throw new Error('Already in this room');

    // Lock entry fee
    await this.walletService.lockFunds(userId, room.entryFee, 'SOL', {
      type: 'trading_sim',
      id: roomId,
    }, isDemoBet);
    auditLog({ action: 'trading_sim_join', userId, game: 'trading-sim', gameId: roomId, betAmount: room.entryFee, status: 'success' });

    // Add participant
    await this.db.insert(tradingSimParticipants).values({
      roomId,
      userId,
      startBalance: SIM_START_BALANCE,
    });

    // Increment player count and prize pool
    const [updated] = await this.db
      .update(tradingSimRooms)
      .set({
        currentPlayers: sql`${tradingSimRooms.currentPlayers} + 1`,
        prizePool: sql`${tradingSimRooms.prizePool} + ${room.entryFee}`,
      })
      .where(eq(tradingSimRooms.id, roomId))
      .returning();

    // Auto-start if room is now full
    if (updated.currentPlayers >= updated.maxPlayers) {
      return this.startRoom(roomId);
    }

    return updated;
  }

  // ─── Start Room By Creator (early start) ───────────────────

  async startRoomByCreator(userId: string, roomId: string) {
    const room = await this.db.query.tradingSimRooms.findFirst({
      where: eq(tradingSimRooms.id, roomId),
    });
    if (!room) throw new Error('Room not found');
    if (room.status !== 'waiting') throw new Error('Room already started');

    // Verify the creator is the first participant
    const participants = await this.db
      .select()
      .from(tradingSimParticipants)
      .where(eq(tradingSimParticipants.roomId, roomId))
      .orderBy(tradingSimParticipants.joinedAt);
    if (participants.length === 0 || participants[0].userId !== userId) {
      throw new Error('Only the room creator can force-start');
    }

    return this.startRoom(roomId);
  }

  // ─── Start Room ─────────────────────────────────────────────

  async startRoom(roomId: string) {
    const room = await this.db.query.tradingSimRooms.findFirst({
      where: eq(tradingSimRooms.id, roomId),
    });

    if (!room) throw new Error('Room not found');
    if (room.status !== 'waiting') throw new Error('Room already started');

    // Generate chart data for this session
    const chartData = generateSimulatedChart(room.duration, 1);

    const [updated] = await this.db
      .update(tradingSimRooms)
      .set({
        status: 'active',
        chartData,
        startedAt: new Date(),
      })
      .where(eq(tradingSimRooms.id, roomId))
      .returning();

    return updated;
  }

  // ─── Execute Trade ──────────────────────────────────────────

  async executeTrade(
    userId: string,
    roomId: string,
    tradeType: string,
    quantity: number,
    price: number,
    timestamp: number,
  ) {
    // Verify room is active
    const room = await this.db.query.tradingSimRooms.findFirst({
      where: eq(tradingSimRooms.id, roomId),
    });

    if (!room) throw new Error('Room not found');
    if (room.status !== 'active') throw new Error('Room is not active');
    if (!room.startedAt) throw new Error('Room has not started');

    // Verify user is a participant
    const participant = await this.db.query.tradingSimParticipants.findFirst({
      where: and(
        eq(tradingSimParticipants.roomId, roomId),
        eq(tradingSimParticipants.userId, userId),
      ),
    });
    if (!participant) throw new Error('Not a participant in this room');

    // Validate sell quantity against current position to prevent short selling
    if (tradeType === 'sell') {
      const existingTrades = await this.db
        .select()
        .from(tradingSimTrades)
        .where(
          and(
            eq(tradingSimTrades.roomId, roomId),
            eq(tradingSimTrades.userId, userId),
          ),
        );
      let currentPosition = 0;
      for (const t of existingTrades) {
        if (t.tradeType === 'buy') currentPosition += t.quantity;
        else currentPosition -= t.quantity;
      }
      if (quantity > currentPosition) {
        throw new Error('Sell quantity exceeds current position');
      }
    }

    // H10 fix: Validate trade price against server chart data
    const chartData = room.chartData as { close: number }[];
    if (!chartData || chartData.length === 0) throw new Error('Chart data not available');

    // Find the candle at the given timestamp (index = seconds elapsed)
    const elapsedSec = Math.floor((timestamp - room.startedAt.getTime()) / 1000);
    const candleIdx = Math.max(0, Math.min(elapsedSec, chartData.length - 1));
    const expectedPrice = chartData[candleIdx]?.close;

    if (expectedPrice !== undefined) {
      // Allow 5% tolerance for latency/rounding (client may be 1-2 candles behind)
      const tolerance = expectedPrice * 0.05;
      if (Math.abs(price - expectedPrice) > tolerance) {
        throw new Error(`Trade price deviates too far from chart price`);
      }
    }

    // Validate timestamp is within room duration
    if (timestamp > Date.now() + 5000) throw new Error('Trade timestamp in the future');

    // Validate quantity is reasonable (max = 2x start balance worth)
    const maxQty = Math.ceil((SIM_START_BALANCE * 2) / Math.max(price, 0.01));
    if (quantity > maxQty) throw new Error(`Quantity exceeds maximum allowed`);

    // Record the trade (store elapsed seconds, not raw Date.now())
    const [trade] = await this.db
      .insert(tradingSimTrades)
      .values({
        roomId,
        userId,
        tradeType,
        price: price.toFixed(4),
        quantity,
        timestamp: elapsedSec,
      })
      .returning();

    return trade;
  }

  // ─── End Room ───────────────────────────────────────────────

  async endRoom(roomId: string) {
    const room = await this.db.query.tradingSimRooms.findFirst({
      where: eq(tradingSimRooms.id, roomId),
    });

    if (!room) throw new Error('Room not found');
    if (room.status !== 'active') throw new Error('Room is not active');

    const chartData = room.chartData as { close: number }[];
    if (!chartData || chartData.length === 0) throw new Error('No chart data available');

    const finalPrice = chartData[chartData.length - 1].close;

    // Get all participants
    const participants = await this.db
      .select()
      .from(tradingSimParticipants)
      .where(eq(tradingSimParticipants.roomId, roomId));

    // Calculate P&L for each participant
    const results: { userId: string; pnl: number; finalBalance: number }[] = [];

    for (const participant of participants) {
      const trades = await this.db
        .select()
        .from(tradingSimTrades)
        .where(
          and(
            eq(tradingSimTrades.roomId, roomId),
            eq(tradingSimTrades.userId, participant.userId),
          ),
        )
        .orderBy(tradingSimTrades.timestamp);

      // Calculate P&L: track net position and realized gains
      let cash = participant.startBalance;
      let position = 0; // net shares held

      for (const trade of trades) {
        const tradePrice = parseFloat(trade.price);
        const qty = trade.quantity;
        const cost = tradePrice * qty;

        if (trade.tradeType === 'buy') {
          cash -= cost;
          position += qty;
        } else {
          // sell
          cash += cost;
          position -= qty;
        }
      }

      // Mark remaining position to market at final price
      const finalBalance = cash + position * finalPrice;
      const pnl = finalBalance - participant.startBalance;

      results.push({
        userId: participant.userId,
        pnl,
        finalBalance,
      });
    }

    // Rank by P&L (highest first)
    results.sort((a, b) => b.pnl - a.pnl);

    // Update participant records with final results
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      await this.db
        .update(tradingSimParticipants)
        .set({
          finalBalance: Math.round(r.finalBalance),
          finalPnl: Math.round(r.pnl),
          rank: i + 1,
        })
        .where(
          and(
            eq(tradingSimParticipants.roomId, roomId),
            eq(tradingSimParticipants.userId, r.userId),
          ),
        );
    }

    // Winner gets 95% of prize pool
    const winner = results[0];
    const payoutAmount = Math.floor(room.prizePool * (1 - PLATFORM_FEE_RATE));

    // Get all participant roles to skip wallet ops for bots
    const participantRoles = new Map<string, string>();
    for (const r of results) {
      const [u] = await this.db.select({ role: users.role }).from(users).where(eq(users.id, r.userId));
      if (u) participantRoles.set(r.userId, u.role);
    }

    if (winner && participantRoles.get(winner.userId) !== 'bot') {
      // fee=0: lockFunds only locked entryFee; platform fee taken from pool difference
      // Critical: winner payout failure must prevent room from being marked as finished
      try {
        await this.walletService.settlePayout(
          winner.userId,
          room.entryFee,
          0,
          payoutAmount,
          'SOL',
          { type: 'trading_sim', id: roomId },
        );
        auditLog({ action: 'trading_sim_winner_settle', userId: winner.userId, game: 'trading-sim', gameId: roomId, betAmount: room.entryFee, payoutAmount, status: 'success' });
      } catch (settleErr: any) {
        await recordFailedSettlement({
          userId: winner.userId, game: 'trading-sim', gameRefType: 'trading_sim', gameRefId: roomId,
          betAmount: room.entryFee, fee: 0, payoutAmount,
          errorMessage: settleErr.message || 'Winner settlement failed',
        });
        throw settleErr;
      }
    }

    // Settle losers: unlock with zero payout
    for (const r of results.slice(1)) {
      if (participantRoles.get(r.userId) === 'bot') continue; // skip bots
      try {
        await this.walletService.settlePayout(
          r.userId,
          room.entryFee,
          0,
          0,
          'SOL',
          { type: 'trading_sim', id: roomId },
        );
        auditLog({ action: 'trading_sim_loser_settle', userId: r.userId, game: 'trading-sim', gameId: roomId, betAmount: room.entryFee, payoutAmount: 0, status: 'success' });
      } catch (err: any) {
        console.error('[TradingSim] non-critical loser settlement failed:', err, { userId: r.userId, roomId });
        await recordFailedSettlement({
          userId: r.userId, game: 'trading-sim', gameRefType: 'trading_sim', gameRefId: roomId,
          betAmount: room.entryFee, fee: 0, payoutAmount: 0,
          errorMessage: err.message || 'Loser settlement failed',
        });
      }
    }

    // Award XP to all participants (winner gets more)
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (participantRoles.get(r.userId) === 'bot') continue;
      const xp = i === 0 ? 30 : 15; // winner: 30 XP, others: 15 XP
      this.userService.addXP(r.userId, xp, 'trading_sim').catch(() => {});
      this.missionsService.trackProgress(r.userId, 'trading_sim_result', i === 0).catch(() => {});
    }

    // Mark room as finished
    const [finished] = await this.db
      .update(tradingSimRooms)
      .set({
        status: 'finished',
        endedAt: new Date(),
        winnerId: winner?.userId ?? null,
      })
      .where(eq(tradingSimRooms.id, roomId))
      .returning();

    return {
      room: finished,
      standings: results.map((r, i) => ({ ...r, rank: i + 1 })),
    };
  }

  // ─── Get Room State ─────────────────────────────────────────

  async getRoomState(roomId: string) {
    const room = await this.db.query.tradingSimRooms.findFirst({
      where: eq(tradingSimRooms.id, roomId),
    });

    if (!room) throw new Error('Room not found');

    const participants = await this.db
      .select({
        id: tradingSimParticipants.id,
        userId: tradingSimParticipants.userId,
        username: users.username,
        startBalance: tradingSimParticipants.startBalance,
        finalBalance: tradingSimParticipants.finalBalance,
        finalPnl: tradingSimParticipants.finalPnl,
        rank: tradingSimParticipants.rank,
        joinedAt: tradingSimParticipants.joinedAt,
      })
      .from(tradingSimParticipants)
      .innerJoin(users, eq(tradingSimParticipants.userId, users.id))
      .where(eq(tradingSimParticipants.roomId, roomId));

    // Strip future chart candles to prevent clients from seeing the entire chart
    let visibleChartData = room.chartData as any[] | null;
    if (room.status === 'active' && room.startedAt && visibleChartData) {
      const now = Date.now();
      const elapsed = Math.floor((now - room.startedAt.getTime()) / 1000);
      const candleDuration = room.duration / visibleChartData.length;
      const visibleCount = Math.min(visibleChartData.length, Math.ceil(elapsed / candleDuration) + 1);
      visibleChartData = visibleChartData.slice(0, visibleCount);
    }

    return {
      ...room,
      chartData: visibleChartData,
      participants,
    };
  }
}
