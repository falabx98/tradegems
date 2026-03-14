import { getDb } from '../../config/database.js';
import { lotteryDraws, lotteryTickets, lotteryWinners, balanceLedgerEntries, balances, users } from '@tradingarena/db';
import { WalletService } from '../wallet/wallet.service.js';
import { AppError } from '../../middleware/errorHandler.js';
import { eq, and, desc, sql, lte } from 'drizzle-orm';

// ─── Constants ───────────────────────────────────────────────
const STANDARD_PRICE = 100_000_000;   // 0.10 SOL in lamports
const POWER_PRICE    = 500_000_000;   // 0.50 SOL in lamports

const MAIN_NUMBER_MAX = 36;
const MAIN_NUMBER_COUNT = 5;
const GEMBALL_MAX = 9;

const HOUSE_FEE_RATE = 0.05;

// ─── Prize Tiers ─────────────────────────────────────────────
// tier: prize tier number
// mainMatch: how many main numbers must match
// gemBallMatch: whether gemBall must match
// poolPercent: fraction of distributable pool allocated to this tier

const PRIZE_TIERS = [
  { tier: 1, label: 'Jackpot (5 + GB)',   mainMatch: 5, gemBallMatch: true,  poolPercent: 0.40 },
  { tier: 2, label: '5 Numbers',          mainMatch: 5, gemBallMatch: false, poolPercent: 0.10 },
  { tier: 3, label: '4 + GB',             mainMatch: 4, gemBallMatch: true,  poolPercent: 0.08 },
  { tier: 4, label: '4 Numbers',          mainMatch: 4, gemBallMatch: false, poolPercent: 0.07 },
  { tier: 5, label: '3 + GB',             mainMatch: 3, gemBallMatch: true,  poolPercent: 0.06 },
  { tier: 6, label: '3 Numbers',          mainMatch: 3, gemBallMatch: false, poolPercent: 0.05 },
  { tier: 7, label: '2 + GB',             mainMatch: 2, gemBallMatch: true,  poolPercent: 0.04 },
  { tier: 8, label: '1 + GB',             mainMatch: 1, gemBallMatch: true,  poolPercent: 0.03 },
  { tier: 9, label: 'GB Only',            mainMatch: 0, gemBallMatch: true,  poolPercent: 0.02 },
] as const;

// ─── Helpers ─────────────────────────────────────────────────

function getNextFriday(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 5=Fri
  let daysUntilFriday = (5 - day + 7) % 7;
  if (daysUntilFriday === 0) {
    // If it's already Friday, check if we passed 01:00 UTC
    const fridayCutoff = new Date(now);
    fridayCutoff.setUTCHours(1, 0, 0, 0);
    if (now >= fridayCutoff) {
      daysUntilFriday = 7; // next Friday
    }
  }
  const target = new Date(now);
  target.setUTCDate(target.getUTCDate() + daysUntilFriday);
  target.setUTCHours(1, 0, 0, 0);
  return target;
}

function generateUniqueNumbers(count: number, max: number): number[] {
  const nums = new Set<number>();
  while (nums.size < count) {
    nums.add(Math.floor(Math.random() * max) + 1);
  }
  return Array.from(nums).sort((a, b) => a - b);
}

function validateTicketNumbers(numbers: number[], gemBall: number): void {
  if (!Array.isArray(numbers) || numbers.length !== MAIN_NUMBER_COUNT) {
    throw new AppError(400, 'INVALID_NUMBERS', `Must provide exactly ${MAIN_NUMBER_COUNT} numbers`);
  }

  const uniqueNums = new Set(numbers);
  if (uniqueNums.size !== MAIN_NUMBER_COUNT) {
    throw new AppError(400, 'DUPLICATE_NUMBERS', 'All 5 numbers must be unique');
  }

  for (const n of numbers) {
    if (!Number.isInteger(n) || n < 1 || n > MAIN_NUMBER_MAX) {
      throw new AppError(400, 'NUMBER_OUT_OF_RANGE', `Each number must be an integer between 1 and ${MAIN_NUMBER_MAX}`);
    }
  }

  if (!Number.isInteger(gemBall) || gemBall < 1 || gemBall > GEMBALL_MAX) {
    throw new AppError(400, 'GEMBALL_OUT_OF_RANGE', `GemBall must be an integer between 1 and ${GEMBALL_MAX}`);
  }
}

/**
 * Determine which prize tier a ticket falls into.
 * Returns the tier number (1-9) or null if no prize.
 */
function determineTier(
  mainMatched: number,
  gemBallMatched: boolean,
): number | null {
  for (const t of PRIZE_TIERS) {
    if (t.mainMatch === mainMatched && t.gemBallMatch === gemBallMatched) {
      return t.tier;
    }
  }
  // Check tiers where gemBallMatch is false (only main numbers matter)
  // Already handled above since PRIZE_TIERS has both true and false entries
  return null;
}

// ─── Service ─────────────────────────────────────────────────

export class LotteryService {
  private static walletService = new WalletService();

  // ─── Get Current Draw ──────────────────────────────────────

  static async getCurrentDraw() {
    const db = getDb();
    const draw = await db.query.lotteryDraws.findFirst({
      where: eq(lotteryDraws.status, 'open'),
      orderBy: [desc(lotteryDraws.drawDate)],
    });

    if (draw) {
      return LotteryService.formatDraw(draw);
    }

    // No open draw — create one
    return LotteryService.ensureCurrentDrawExists();
  }

  // ─── Get Draw By ID ────────────────────────────────────────

  static async getDrawById(id: string) {
    const db = getDb();
    const draw = await db.query.lotteryDraws.findFirst({
      where: eq(lotteryDraws.id, id),
    });
    if (!draw) {
      throw new AppError(404, 'DRAW_NOT_FOUND', 'Lottery draw not found');
    }
    return LotteryService.formatDraw(draw);
  }

  // ─── Get Draw By Number ────────────────────────────────────

  static async getDrawByNumber(num: number) {
    const db = getDb();
    const draw = await db.query.lotteryDraws.findFirst({
      where: eq(lotteryDraws.drawNumber, num),
    });
    if (!draw) {
      throw new AppError(404, 'DRAW_NOT_FOUND', 'Lottery draw not found');
    }
    return LotteryService.formatDraw(draw);
  }

  // ─── Buy Tickets ───────────────────────────────────────────

  static async buyTickets(
    userId: string,
    drawId: string,
    tickets: { entryType: 'standard' | 'power'; numbers: number[]; gemBall: number }[],
  ) {
    const db = getDb();

    if (!tickets.length) {
      throw new AppError(400, 'NO_TICKETS', 'Must provide at least one ticket');
    }
    if (tickets.length > 50) {
      throw new AppError(400, 'TOO_MANY_TICKETS', 'Maximum 50 tickets per purchase');
    }

    // 1. Validate draw is open
    const draw = await db.query.lotteryDraws.findFirst({
      where: and(eq(lotteryDraws.id, drawId), eq(lotteryDraws.status, 'open')),
    });
    if (!draw) {
      throw new AppError(400, 'DRAW_NOT_OPEN', 'Draw is not open for ticket purchases');
    }

    // 2. Validate each ticket and calculate total cost
    let totalCost = 0;
    const ticketValues: {
      drawId: string;
      userId: string;
      entryType: string;
      numbers: number[];
      gemBall: number;
      cost: number;
    }[] = [];

    for (const t of tickets) {
      validateTicketNumbers(t.numbers, t.gemBall);

      const sortedNumbers = [...t.numbers].sort((a, b) => a - b);
      const cost = t.entryType === 'power' ? POWER_PRICE : STANDARD_PRICE;
      totalCost += cost;

      ticketValues.push({
        drawId,
        userId,
        entryType: t.entryType,
        numbers: sortedNumbers,
        gemBall: t.gemBall,
        cost,
      });
    }

    // 3. Lock funds then immediately settle (deduct from balance)
    await LotteryService.walletService.lockFunds(userId, totalCost, 'SOL', {
      type: 'lottery_ticket',
      id: drawId,
    });

    await LotteryService.walletService.settlePayout(
      userId,
      totalCost, // betAmount = totalCost (what was locked)
      0,         // fee = 0
      0,         // payoutAmount = 0 (no payout, just deduction)
      'SOL',
      { type: 'lottery_purchase', id: drawId },
    );

    // 4. Insert ticket rows
    const createdTickets = await db.insert(lotteryTickets).values(ticketValues).returning();

    // 5. Update draw counters
    await db
      .update(lotteryDraws)
      .set({
        totalTickets: sql`${lotteryDraws.totalTickets} + ${tickets.length}`,
        prizePool: sql`${lotteryDraws.prizePool} + ${totalCost}`,
      })
      .where(eq(lotteryDraws.id, drawId));

    return {
      tickets: createdTickets.map((t) => ({
        id: t.id,
        entryType: t.entryType,
        numbers: t.numbers,
        gemBall: t.gemBall,
        cost: String(t.cost),
        purchasedAt: t.purchasedAt.toISOString(),
      })),
      totalCost: String(totalCost),
      ticketCount: createdTickets.length,
    };
  }

  // ─── Get User Tickets ──────────────────────────────────────

  static async getUserTickets(userId: string, drawId: string) {
    const db = getDb();
    const tickets = await db
      .select()
      .from(lotteryTickets)
      .where(and(eq(lotteryTickets.userId, userId), eq(lotteryTickets.drawId, drawId)))
      .orderBy(desc(lotteryTickets.purchasedAt));

    return tickets.map((t) => ({
      id: t.id,
      entryType: t.entryType,
      numbers: t.numbers,
      gemBall: t.gemBall,
      cost: String(t.cost),
      purchasedAt: t.purchasedAt.toISOString(),
    }));
  }

  // ─── Execute Draw ──────────────────────────────────────────

  static async executeDraw(drawId: string) {
    const db = getDb();

    // 1. Mark as drawing (prevent further purchases)
    const [draw] = await db
      .update(lotteryDraws)
      .set({ status: 'drawing' })
      .where(and(eq(lotteryDraws.id, drawId), eq(lotteryDraws.status, 'open')))
      .returning();

    if (!draw) {
      throw new AppError(409, 'DRAW_NOT_OPEN', 'Draw is not open or already in progress');
    }

    // 2. Generate winning numbers
    const winningNumbers = generateUniqueNumbers(MAIN_NUMBER_COUNT, MAIN_NUMBER_MAX);
    const winningGemBall = Math.floor(Math.random() * GEMBALL_MAX) + 1;

    // 3. Store winning numbers
    await db
      .update(lotteryDraws)
      .set({
        winningNumbers,
        winningGemBall,
      })
      .where(eq(lotteryDraws.id, drawId));

    // 4. Resolve winners
    await LotteryService.resolveWinners(drawId);

    // 5. Mark as completed
    await db
      .update(lotteryDraws)
      .set({
        status: 'completed',
        drawnAt: new Date(),
      })
      .where(eq(lotteryDraws.id, drawId));

    // 6. Ensure next draw exists
    await LotteryService.ensureCurrentDrawExists();

    console.log(
      `[LotteryService] Draw ${draw.drawNumber} completed. Winning: ${winningNumbers.join(',')} + GB ${winningGemBall}`,
    );

    return { drawId, winningNumbers, winningGemBall };
  }

  // ─── Resolve Winners ───────────────────────────────────────

  static async resolveWinners(drawId: string) {
    const db = getDb();

    // 1. Get the draw
    const draw = await db.query.lotteryDraws.findFirst({
      where: eq(lotteryDraws.id, drawId),
    });
    if (!draw || !draw.winningNumbers || draw.winningGemBall == null) {
      throw new AppError(400, 'DRAW_NOT_DRAWN', 'Draw has not been drawn yet');
    }

    const winningNums = new Set(draw.winningNumbers as number[]);
    const winningGB = draw.winningGemBall;

    // 2. Get all tickets for this draw
    const allTickets = await db
      .select()
      .from(lotteryTickets)
      .where(eq(lotteryTickets.drawId, drawId));

    if (allTickets.length === 0) {
      // No tickets sold — everything rolls over
      const nextDraw = await db.query.lotteryDraws.findFirst({
        where: eq(lotteryDraws.status, 'open'),
        orderBy: [desc(lotteryDraws.drawDate)],
      });
      if (nextDraw) {
        await db
          .update(lotteryDraws)
          .set({ rolloverPool: sql`${lotteryDraws.rolloverPool} + ${draw.prizePool + draw.rolloverPool}` })
          .where(eq(lotteryDraws.id, nextDraw.id));
      }
      return;
    }

    // 3. For each ticket, determine tier
    const tierBuckets: Map<number, { ticketId: string; userId: string }[]> = new Map();
    for (let i = 1; i <= 9; i++) tierBuckets.set(i, []);

    for (const ticket of allTickets) {
      const ticketNums = ticket.numbers as number[];
      const matchedCount = ticketNums.filter((n) => winningNums.has(n)).length;

      // Power entries always match GemBall
      const gemBallMatched = ticket.entryType === 'power' ? true : ticket.gemBall === winningGB;

      const tier = determineTier(matchedCount, gemBallMatched);
      if (tier != null) {
        tierBuckets.get(tier)!.push({ ticketId: ticket.id, userId: ticket.userId });
      }

      // Also check: if gemBall doesn't match but main numbers do, check the non-GB tier
      // This is already handled because determineTier checks both true/false entries
      // But we need to also check the gemBallMatch=false case when gemBall DID match
      // because a ticket that matches 5+GB should win tier 1, not tier 2.
      // The logic above gives priority to the first matching tier (which is the higher one).
      // However, we should NOT double-award. The first match in PRIZE_TIERS is correct
      // since it's ordered by tier (1 first).

      // Edge case: if gemBall matched but we also qualify for a non-GB tier,
      // the GB tier is always better (lower number = higher priority), so first match is correct.
    }

    // 4. Calculate distributable pool
    const distributablePool = Math.floor(draw.prizePool * (1 - HOUSE_FEE_RATE)) + draw.rolloverPool;

    // 5. Calculate prizes and determine rollover
    let totalPaidOut = 0;
    let rollover = 0;
    const winnerInserts: {
      drawId: string;
      ticketId: string;
      userId: string;
      tier: number;
      matchedNumbers: number;
      matchedGemBall: boolean;
      prizeAmount: number;
    }[] = [];

    for (const tierConfig of PRIZE_TIERS) {
      const winners = tierBuckets.get(tierConfig.tier)!;
      const tierAllocation = Math.floor(distributablePool * tierConfig.poolPercent);

      if (winners.length === 0) {
        // No winners for this tier — rolls over
        rollover += tierAllocation;
        continue;
      }

      const prizePerWinner = Math.floor(tierAllocation / winners.length);
      if (prizePerWinner <= 0) continue;

      for (const winner of winners) {
        winnerInserts.push({
          drawId,
          ticketId: winner.ticketId,
          userId: winner.userId,
          tier: tierConfig.tier,
          matchedNumbers: tierConfig.mainMatch,
          matchedGemBall: tierConfig.gemBallMatch,
          prizeAmount: prizePerWinner,
        });
        totalPaidOut += prizePerWinner;
      }
    }

    // 6. Insert winner records
    if (winnerInserts.length > 0) {
      await db.insert(lotteryWinners).values(winnerInserts);
    }

    // 7. Credit each winner's balance
    const payoutsByUser = new Map<string, number>();
    for (const w of winnerInserts) {
      payoutsByUser.set(w.userId, (payoutsByUser.get(w.userId) ?? 0) + w.prizeAmount);
    }

    for (const [winnerId, amount] of payoutsByUser) {
      // Credit balance directly via SQL upsert + ledger entry
      await db.execute(sql`
        INSERT INTO balances (user_id, asset, available_amount, locked_amount, pending_amount)
        VALUES (${winnerId}, 'SOL', ${amount}, 0, 0)
        ON CONFLICT (user_id, asset)
        DO UPDATE SET available_amount = balances.available_amount + ${amount},
                      updated_at = now()
      `);

      // Get updated balance for ledger
      const bal = await db.query.balances.findFirst({
        where: and(eq(balances.userId, winnerId), eq(balances.asset, 'SOL')),
      });

      await db.insert(balanceLedgerEntries).values({
        userId: winnerId,
        asset: 'SOL',
        entryType: 'lottery_win',
        amount,
        balanceAfter: bal?.availableAmount ?? amount,
        referenceType: 'lottery_draw',
        referenceId: drawId,
      });
    }

    // 8. Rollover unclaimed amounts to the next open draw
    if (rollover > 0) {
      // Ensure next draw exists first
      await LotteryService.ensureCurrentDrawExists();

      const nextDraw = await db.query.lotteryDraws.findFirst({
        where: eq(lotteryDraws.status, 'open'),
        orderBy: [desc(lotteryDraws.drawDate)],
      });
      if (nextDraw) {
        await db
          .update(lotteryDraws)
          .set({ rolloverPool: sql`${lotteryDraws.rolloverPool} + ${rollover}` })
          .where(eq(lotteryDraws.id, nextDraw.id));
      }
    }

    console.log(
      `[LotteryService] Draw ${drawId}: ${winnerInserts.length} winners, ${String(totalPaidOut)} lamports paid, ${String(rollover)} lamports rolled over`,
    );
  }

  // ─── Get Prize Table ───────────────────────────────────────

  static async getPrizeTable(drawId: string) {
    const db = getDb();

    const draw = await db.query.lotteryDraws.findFirst({
      where: eq(lotteryDraws.id, drawId),
    });
    if (!draw) {
      throw new AppError(404, 'DRAW_NOT_FOUND', 'Lottery draw not found');
    }

    const distributablePool = Math.floor(draw.prizePool * (1 - HOUSE_FEE_RATE)) + draw.rolloverPool;

    // Get winner counts per tier if draw is completed
    let winnerCounts = new Map<number, { count: number; totalPaid: number }>();
    if (draw.status === 'completed') {
      const winners = await db
        .select({
          tier: lotteryWinners.tier,
          count: sql<number>`count(*)::int`,
          totalPaid: sql<number>`sum(${lotteryWinners.prizeAmount})::bigint`,
        })
        .from(lotteryWinners)
        .where(eq(lotteryWinners.drawId, drawId))
        .groupBy(lotteryWinners.tier);

      for (const w of winners) {
        winnerCounts.set(w.tier, { count: w.count, totalPaid: Number(w.totalPaid) });
      }
    }

    return {
      drawId,
      drawNumber: draw.drawNumber,
      status: draw.status,
      prizePool: String(draw.prizePool),
      rolloverPool: String(draw.rolloverPool),
      distributablePool: String(distributablePool),
      houseFeeRate: HOUSE_FEE_RATE,
      tiers: PRIZE_TIERS.map((t) => {
        const tierAllocation = Math.floor(distributablePool * t.poolPercent);
        const winnerInfo = winnerCounts.get(t.tier);
        return {
          tier: t.tier,
          label: t.label,
          mainMatch: t.mainMatch,
          gemBallMatch: t.gemBallMatch,
          poolPercent: t.poolPercent,
          estimatedPrize: String(tierAllocation),
          winners: winnerInfo?.count ?? 0,
          totalPaid: winnerInfo ? String(winnerInfo.totalPaid) : '0',
        };
      }),
    };
  }

  // ─── Draw History ──────────────────────────────────────────

  static async getDrawHistory(limit: number = 20) {
    const db = getDb();

    const draws = await db
      .select()
      .from(lotteryDraws)
      .where(eq(lotteryDraws.status, 'completed'))
      .orderBy(desc(lotteryDraws.drawnAt))
      .limit(limit);

    return draws.map((d) => LotteryService.formatDraw(d));
  }

  // ─── Auto Fill Numbers ─────────────────────────────────────

  static autoFillNumbers(count: number) {
    if (count < 1 || count > 50) {
      throw new AppError(400, 'INVALID_COUNT', 'Count must be between 1 and 50');
    }

    const results: { numbers: number[]; gemBall: number }[] = [];
    for (let i = 0; i < count; i++) {
      results.push({
        numbers: generateUniqueNumbers(MAIN_NUMBER_COUNT, MAIN_NUMBER_MAX),
        gemBall: Math.floor(Math.random() * GEMBALL_MAX) + 1,
      });
    }
    return results;
  }

  // ─── Ensure Current Draw Exists ────────────────────────────

  static async ensureCurrentDrawExists() {
    const db = getDb();

    const existing = await db.query.lotteryDraws.findFirst({
      where: eq(lotteryDraws.status, 'open'),
      orderBy: [desc(lotteryDraws.drawDate)],
    });

    if (existing) {
      return LotteryService.formatDraw(existing);
    }

    // Create next Friday draw
    const drawDate = getNextFriday();

    const [newDraw] = await db
      .insert(lotteryDraws)
      .values({
        status: 'open',
        drawDate,
        standardPrice: STANDARD_PRICE,
        powerPrice: POWER_PRICE,
        totalTickets: 0,
        prizePool: 0,
        rolloverPool: 0,
      })
      .returning();

    console.log(`[LotteryService] Created new draw #${newDraw.drawNumber} for ${drawDate.toISOString()}`);
    return LotteryService.formatDraw(newDraw);
  }

  // ─── Format Draw (internal helper) ─────────────────────────

  private static formatDraw(draw: typeof lotteryDraws.$inferSelect) {
    return {
      id: draw.id,
      drawNumber: draw.drawNumber,
      status: draw.status,
      drawDate: draw.drawDate.toISOString(),
      standardPrice: String(draw.standardPrice),
      powerPrice: String(draw.powerPrice),
      totalTickets: draw.totalTickets,
      prizePool: String(draw.prizePool),
      rolloverPool: String(draw.rolloverPool),
      winningNumbers: draw.winningNumbers ?? null,
      winningGemBall: draw.winningGemBall ?? null,
      createdAt: draw.createdAt.toISOString(),
      drawnAt: draw.drawnAt?.toISOString() ?? null,
    };
  }
}
