import crypto from 'node:crypto';
import { getDb } from '../config/database.js';
import { users, userProfiles, chatMessages, activityFeedItems, rounds, bets, betResults, predictionRounds, candleflipGames, rugGames, tradingSimRooms, tradingSimParticipants, lotteryDraws, lotteryTickets } from '@tradingarena/db';
import { desc } from 'drizzle-orm';
import { eq, sql, and, inArray } from 'drizzle-orm';
import { trackOnline } from '../routes/chat.routes.js';
import { generateSimulatedChart } from '../utils/chartGenerator.js';
import { joinRound as rugJoinRound, getCurrentRound as getRugCurrentRound } from '../modules/round-manager/rugRoundManager.js';
import { betOnRound as candleflipBetOnRound, getCandleflipCurrentRound } from '../modules/round-manager/candleflipRoundManager.js';

// ─── Types ──────────────────────────────────────────────────
interface BotUser {
  id: string;
  username: string;
  level: number;
  vipTier: string;
  avatarUrl: string | null;
}

interface PendingSimJoin {
  roomId: string;
  botId: string;
  joinAt: number; // timestamp ms
}

interface PendingSimRoom {
  roomId: string;
  createdAt: number;
  autoStartAt: number; // auto-start if no real players after this time
}

// ─── State ──────────────────────────────────────────────────
let botUsers: BotUser[] = [];
let engineTimer: ReturnType<typeof setInterval> | null = null;

// Pending lifecycle arrays
const pendingSimJoins: PendingSimJoin[] = [];
const pendingSimRooms: PendingSimRoom[] = [];

// Last-run timestamps
let lastSoloPlayAt = 0;
let lastChatAt = 0;
let lastPredictionAt = 0;
let lastOnlineTrackAt = 0;
let lastCandleflipAt = 0;
let lastRugGameAt = 0;
let lastSimMaintenanceAt = 0;
let lastLotteryAt = 0;

// Randomized cooldowns (ms)
let soloCooldown = randomBetween(5000, 15000);
let chatCooldown = randomBetween(10000, 30000);
let predictionCooldown = randomBetween(15000, 45000);
const onlineCooldown = 60000;
let candleflipCooldown = randomBetween(15000, 30000);
let rugGameCooldown = randomBetween(10000, 20000);
let lotteryCooldown = randomBetween(30000, 90000);

// ─── Chat Messages Pool (120+ messages) ─────────────────────

const CHAT_MESSAGES = {
  hype: [
    'LFG',
    'WAGMI',
    'lets gooo',
    'bullish af',
    'we are so back',
    'pumping rn',
    'green candles only',
    'sending it',
    'moon time',
    'diamond hands activated',
    'this is huge',
    'chart looks insane',
    'massive pump incoming',
    'all in',
    'ape mode on',
    'cant stop wont stop',
    'momentum building',
    'breakout soon',
    'the flippening is near',
    'this is the way',
  ],
  reactions: [
    'GG',
    'nice hit',
    'what a play',
    'clean trade',
    'that multiplier tho',
    'rekt',
    'F',
    'ouch',
    'almost had it',
    'so close',
    'gg wp',
    'insane run',
    'who just hit that 5x',
    'how',
    'clutch play',
    'massive W',
    'fat L',
    'brutal',
    'legend',
    'absolute beast',
  ],
  questions: [
    'anyone winning today',
    'whats the best strat',
    'aggressive or conservative',
    'balanced gang',
    'how do tournaments work',
    'first time here',
    'just joined hi everyone',
    'GM everyone',
    'any alpha today',
    'which risk tier u running',
    'predictions or solo',
    'tournament lobbies open?',
    'who wants to battle',
    'solo grinding rn',
    'what VIP tier are you',
    'how do I level up faster',
    'any tips for beginners',
    'whats the meta',
    'tournaments paying well today',
    'wen next tourney',
  ],
  marketTalk: [
    'SOL looking strong',
    'BTC dominance dropping',
    'altseason loading',
    'dip before the rip',
    'buy the dip',
    'sell the news',
    'resistance at 200',
    'support holding',
    'volume picking up',
    'chart is coiling',
    'breakout any minute',
    'consolidation phase',
    'RSI oversold',
    'MACD crossing',
    'fibonacci retracement',
    'bullish divergence',
    'double bottom forming',
    'head and shoulders',
    'ascending triangle',
    'golden cross incoming',
  ],
  short: [
    'GM',
    'GN',
    'HODL',
    'yooo',
    'NGMI',
    'wgmi',
    'based',
    'bruh',
    'sheesh',
    'cope',
    'nah',
    'yep',
    'facts',
    'fr fr',
    'oof',
    'pog',
    'haha',
    'no way',
    'wow',
    'nice',
  ],
  gameSpecific: [
    'just hit 3x on solo',
    '4x on aggressive tier',
    'conservative is the way',
    'aggressive or nothing',
    'solo grind paying off',
    'tournament finals were close',
    'won my first tournament',
    '3 wins in a row',
    'streak broken smh',
    'prediction game is fire',
    'called that pump correctly',
    'predictions are rigged jk',
    'the chart was crazy',
    'nodes everywhere',
    'dodged all the traps',
    'hit every multiplier node',
    'best multiplier yet',
    'new personal record',
    'grinding to platinum',
    'silver tier gang',
  ],
};

// Flatten all messages into a single array
const ALL_CHAT_MESSAGES: string[] = [
  ...CHAT_MESSAGES.hype,
  ...CHAT_MESSAGES.reactions,
  ...CHAT_MESSAGES.questions,
  ...CHAT_MESSAGES.marketTalk,
  ...CHAT_MESSAGES.short,
  ...CHAT_MESSAGES.gameSpecific,
];

// ─── Helpers ────────────────────────────────────────────────

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

/**
 * Generate a multiplier using a weighted distribution:
 * - 40% chance: 0.0x (loss)
 * - 25% chance: 1.0x - 1.5x (small win)
 * - 15% chance: 1.5x - 2.0x (medium win)
 * - 10% chance: 2.0x - 3.0x (good win)
 * - 6% chance: 3.0x - 5.0x (great win)
 * - 3% chance: 5.0x - 8.0x (huge win)
 * - 1% chance: 8.0x - 15.0x (jackpot)
 */
function generateMultiplier(): number {
  const roll = Math.random() * 100;
  if (roll < 40) return 0;
  if (roll < 65) return randomFloat(1.0, 1.5);
  if (roll < 80) return randomFloat(1.5, 2.0);
  if (roll < 90) return randomFloat(2.0, 3.0);
  if (roll < 96) return randomFloat(3.0, 5.0);
  if (roll < 99) return randomFloat(5.0, 8.0);
  return randomFloat(8.0, 15.0);
}

// ─── Solo Play (unchanged — instant) ─────────────────────────

async function simulateSoloPlay(bot: BotUser): Promise<void> {
  try {
    const db = getDb();

    // Generate bet amount: 10M to 1B lamports (0.01 - 1 SOL)
    const betAmount = randomBetween(10_000_000, 1_000_000_000);
    const multiplier = generateMultiplier();
    const payout = multiplier > 0 ? Math.floor(betAmount * multiplier) : 0;
    const isWin = multiplier >= 1.0;
    const riskTiers = ['conservative', 'balanced', 'aggressive'];
    const riskTier = pickRandom(riskTiers);

    const now = new Date();

    // Insert synthetic round
    const [round] = await db.insert(rounds).values({
      mode: 'bot',
      status: 'resolved',
      scheduledAt: now,
      startedAt: now,
      endedAt: now,
      resolvedAt: now,
      seed: `bot-${bot.id}-${Date.now()}`,
      configSnapshot: { botSimulated: true, riskTier },
      durationMs: 15000,
      playerCount: 1,
    }).returning({ id: rounds.id });

    // Insert bet
    const [bet] = await db.insert(bets).values({
      userId: bot.id,
      roundId: round.id,
      amount: betAmount,
      fee: 0,
      riskTier,
      betSizeTier: betAmount >= 500_000_000 ? 'large' : betAmount >= 100_000_000 ? 'medium' : 'small',
      status: 'settled',
      lockedAt: now,
      settledAt: now,
    }).returning({ id: bets.id });

    // Insert bet result
    await db.insert(betResults).values({
      betId: bet.id,
      userId: bot.id,
      roundId: round.id,
      finalMultiplier: multiplier.toFixed(4),
      finalScore: (multiplier * 1000).toFixed(4),
      rankPosition: 1,
      payoutAmount: payout,
      rakebackAmount: 0,
      xpAwarded: randomBetween(5, 25),
      nodesHit: randomBetween(0, 8),
      nodesMissed: randomBetween(0, 5),
      nearMisses: randomBetween(0, 3),
      resultType: isWin ? 'win' : 'loss',
    });

    // Insert activity feed item
    await db.insert(activityFeedItems).values({
      feedType: 'solo_result',
      userId: bot.id,
      payload: {
        username: bot.username,
        level: bot.level,
        vipTier: bot.vipTier,
        betAmount,
        multiplier: parseFloat(multiplier.toFixed(4)),
        payout,
        riskTier,
        isWin,
      },
    });

    // Update user profile stats via raw SQL for efficiency
    await db.execute(sql`
      UPDATE user_profiles
      SET
        rounds_played = rounds_played + 1,
        total_wagered = total_wagered + ${betAmount},
        total_won = total_won + ${payout},
        win_rate = CASE
          WHEN rounds_played > 0
          THEN ((win_rate::numeric * rounds_played + ${isWin ? 1 : 0}) / (rounds_played + 1))::numeric(5,4)
          ELSE win_rate
        END,
        best_multiplier = GREATEST(best_multiplier::numeric, ${parseFloat(multiplier.toFixed(4))}),
        current_streak = CASE
          WHEN ${isWin} THEN current_streak + 1
          ELSE 0
        END,
        best_streak = CASE
          WHEN ${isWin} AND current_streak + 1 > best_streak THEN current_streak + 1
          ELSE best_streak
        END,
        updated_at = NOW()
      WHERE user_id = ${bot.id}
    `);
  } catch (err) {
    console.error(`[BotEngine] Solo play error for ${bot.username}:`, err);
  }
}

async function simulateChatMessage(bot: BotUser): Promise<void> {
  try {
    const db = getDb();
    const message = pickRandom(ALL_CHAT_MESSAGES);

    await db.insert(chatMessages).values({
      userId: bot.id,
      username: bot.username,
      message,
      channel: 'global',
      avatar: bot.avatarUrl,
      level: bot.level,
    });
  } catch (err) {
    console.error(`[BotEngine] Chat error for ${bot.username}:`, err);
  }
}

async function simulatePrediction(bot: BotUser): Promise<void> {
  try {
    const db = getDb();
    const direction = Math.random() > 0.5 ? 'up' : 'down';
    const betAmount = randomBetween(10_000_000, 500_000_000);

    // 48% win rate for predictions
    const isWin = Math.random() < 0.48;
    const multiplier = isWin ? randomFloat(1.5, 2.5) : 0;
    const payout = isWin ? Math.floor(betAmount * multiplier) : 0;

    await db.insert(predictionRounds).values({
      userId: bot.id,
      direction,
      betAmount,
      result: isWin ? 'win' : 'loss',
      payout,
      multiplier: multiplier.toFixed(4),
      pattern: pickRandom(['bullish_engulfing', 'bearish_reversal', 'doji', 'hammer', 'shooting_star', 'morning_star']),
      metadata: { botSimulated: true },
    });

    // Insert activity feed item for prediction
    await db.insert(activityFeedItems).values({
      feedType: 'prediction_result',
      userId: bot.id,
      payload: {
        username: bot.username,
        level: bot.level,
        vipTier: bot.vipTier,
        direction,
        betAmount,
        multiplier: parseFloat(multiplier.toFixed(4)),
        payout,
        isWin,
      },
    });
  } catch (err) {
    console.error(`[BotEngine] Prediction error for ${bot.username}:`, err);
  }
}

// ─── Rug Game — Join Public Round ──────────────────────────

async function botJoinRugRound(bot: BotUser): Promise<void> {
  try {
    const round = await getRugCurrentRound();
    if (!round || round.status !== 'waiting') return;

    const betAmounts = [10_000_000, 50_000_000, 100_000_000, 250_000_000, 500_000_000];
    const betAmount = pickRandom(betAmounts);

    const result = await rugJoinRound(bot.id, betAmount);
    if (result.success) {
      console.log(`[BotEngine] ${bot.username} joined rug round ${round.roundId.slice(0, 8)} (${(betAmount / 1e9).toFixed(2)} SOL)`);
    }
  } catch (err) {
    // Silently ignore join errors (already in round, etc)
  }
}

// ─── Candleflip — Join Public Round ──────────────────────────

async function botJoinCandleflipRound(bot: BotUser): Promise<void> {
  try {
    const round = await getCandleflipCurrentRound();
    if (!round || round.status !== 'waiting') return;

    const betAmounts = [10_000_000, 50_000_000, 100_000_000, 250_000_000, 500_000_000];
    const betAmount = pickRandom(betAmounts);
    const pick = Math.random() > 0.5 ? 'bullish' : 'bearish' as const;

    const result = await candleflipBetOnRound(bot.id, pick, betAmount);
    if (result.success) {
      console.log(`[BotEngine] ${bot.username} bet ${pick} on candleflip round ${round.roundId.slice(0, 8)}`);
    }
  } catch (err) {
    // Silently ignore bet errors
  }
}

// ─── Trading Sim — Room Maintenance ──────────────────────────

const MIN_WAITING_ROOMS = 3;
const SIM_ENTRY_FEES = [100_000_000, 250_000_000, 500_000_000]; // 0.1, 0.25, 0.5 SOL

async function maintainTradingSimRooms(): Promise<void> {
  try {
    const db = getDb();

    // Count current waiting rooms
    const waitingRooms = await db
      .select({ id: tradingSimRooms.id, currentPlayers: tradingSimRooms.currentPlayers, createdAt: tradingSimRooms.createdAt })
      .from(tradingSimRooms)
      .where(eq(tradingSimRooms.status, 'waiting'));

    const needed = MIN_WAITING_ROOMS - waitingRooms.length;

    // Create new bot rooms if needed
    for (let i = 0; i < needed; i++) {
      const bot = pickRandom(botUsers);
      const entryFee = pickRandom(SIM_ENTRY_FEES);
      const roomId = crypto.randomUUID();
      const maxPlayers = pickRandom([2, 3, 4]);

      await db.insert(tradingSimRooms).values({
        id: roomId,
        entryFee,
        maxPlayers,
        currentPlayers: 1,
        status: 'waiting',
        prizePool: 0, // Bot-created room: no real funds locked
        duration: 60,
      });

      // Add bot as first participant
      await db.insert(tradingSimParticipants).values({
        roomId,
        userId: bot.id,
        startBalance: 10_000,
      });

      // Schedule additional bot joins (staggered)
      const botJoinCount = randomBetween(1, maxPlayers - 1);
      const joinBots = pickRandomN(botUsers.filter(b => b.id !== bot.id), botJoinCount);
      for (let j = 0; j < joinBots.length; j++) {
        pendingSimJoins.push({
          roomId,
          botId: joinBots[j].id,
          joinAt: Date.now() + randomBetween(15000 + j * 10000, 45000 + j * 15000),
        });
      }

      // Track for auto-start
      pendingSimRooms.push({
        roomId,
        createdAt: Date.now(),
        autoStartAt: Date.now() + randomBetween(60000, 90000),
      });

      console.log(`[BotEngine] Trading sim room ${roomId} created (${(entryFee / 1e9).toFixed(2)} SOL, max ${maxPlayers}p)`);
    }
  } catch (err) {
    console.error(`[BotEngine] Trading sim maintenance error:`, err);
  }
}

async function processPendingSimJoins(): Promise<void> {
  const now = Date.now();
  const toJoin = pendingSimJoins.filter(j => now >= j.joinAt);

  for (const pending of toJoin) {
    try {
      const db = getDb();
      const { roomId, botId } = pending;

      // Check room is still waiting and not full
      const room = await db.query.tradingSimRooms.findFirst({
        where: eq(tradingSimRooms.id, roomId),
      });

      if (!room || room.status !== 'waiting' || room.currentPlayers >= room.maxPlayers) {
        // Room already started or full, skip
      } else {
        // Check if bot already joined
        const existing = await db.query.tradingSimParticipants.findFirst({
          where: and(
            eq(tradingSimParticipants.roomId, roomId),
            eq(tradingSimParticipants.userId, botId),
          ),
        });

        if (!existing) {
          await db.insert(tradingSimParticipants).values({
            roomId,
            userId: botId,
            startBalance: 10_000,
          });

          await db.update(tradingSimRooms)
            .set({
              currentPlayers: sql`${tradingSimRooms.currentPlayers} + 1`,
              // Don't add to prizePool — bots don't lock real funds
            })
            .where(eq(tradingSimRooms.id, roomId));

          console.log(`[BotEngine] Bot joined trading sim room ${roomId}`);
        }
      }
    } catch (err) {
      console.error(`[BotEngine] Trading sim join error:`, err);
    }

    // Remove from pending
    const idx = pendingSimJoins.indexOf(pending);
    if (idx >= 0) pendingSimJoins.splice(idx, 1);
  }
}

async function autoStartPendingSimRooms(): Promise<void> {
  const now = Date.now();
  const toStart = pendingSimRooms.filter(r => now >= r.autoStartAt);

  for (const pending of toStart) {
    try {
      const db = getDb();
      const { roomId } = pending;

      const room = await db.query.tradingSimRooms.findFirst({
        where: eq(tradingSimRooms.id, roomId),
      });

      if (room && room.status === 'waiting' && room.currentPlayers >= 2) {
        // Auto-start: generate chart and set active
        const chartData = generateSimulatedChart(room.duration, 1);

        await db.update(tradingSimRooms)
          .set({
            status: 'active',
            chartData,
            startedAt: new Date(),
          })
          .where(eq(tradingSimRooms.id, roomId));

        console.log(`[BotEngine] Trading sim room ${roomId} auto-started (${room.currentPlayers} players)`);
      }
    } catch (err) {
      console.error(`[BotEngine] Trading sim auto-start error:`, err);
    }

    // Remove from pending
    const idx = pendingSimRooms.indexOf(pending);
    if (idx >= 0) pendingSimRooms.splice(idx, 1);
  }
}

// ─── Lottery — Bot Ticket Purchases ─────────────────────────

const LOTTERY_STANDARD_PRICE = 100_000_000; // 0.10 SOL
const LOTTERY_POWER_PRICE = 500_000_000;    // 0.50 SOL
const LOTTERY_MAIN_MAX = 36;
const LOTTERY_GEMBALL_MAX = 9;

function generateLotteryNumbers(): number[] {
  const nums = new Set<number>();
  while (nums.size < 5) {
    nums.add(randomBetween(1, LOTTERY_MAIN_MAX));
  }
  return Array.from(nums).sort((a, b) => a - b);
}

async function botBuyLotteryTickets(bot: BotUser): Promise<void> {
  try {
    const db = getDb();

    // Get current open draw
    const draw = await db.query.lotteryDraws.findFirst({
      where: eq(lotteryDraws.status, 'open'),
      orderBy: [desc(lotteryDraws.drawDate)],
    });
    if (!draw) return;

    // Generate 1-3 random tickets
    const ticketCount = randomBetween(1, 3);
    const ticketValues: {
      drawId: string;
      userId: string;
      entryType: string;
      numbers: number[];
      gemBall: number;
      cost: number;
    }[] = [];

    let totalCost = 0;
    for (let i = 0; i < ticketCount; i++) {
      const isPower = Math.random() < 0.15; // 15% chance of power entry
      const cost = isPower ? LOTTERY_POWER_PRICE : LOTTERY_STANDARD_PRICE;
      totalCost += cost;

      ticketValues.push({
        drawId: draw.id,
        userId: bot.id,
        entryType: isPower ? 'power' : 'standard',
        numbers: generateLotteryNumbers(),
        gemBall: randomBetween(1, LOTTERY_GEMBALL_MAX),
        cost,
      });
    }

    // Insert tickets directly (bots don't use real balance)
    await db.insert(lotteryTickets).values(ticketValues);

    // Update draw counters
    await db
      .update(lotteryDraws)
      .set({
        totalTickets: sql`${lotteryDraws.totalTickets} + ${ticketCount}`,
        prizePool: sql`${lotteryDraws.prizePool} + ${totalCost}`,
      })
      .where(eq(lotteryDraws.id, draw.id));

    console.log(`[BotEngine] ${bot.username} bought ${ticketCount} lottery ticket(s) for draw #${draw.drawNumber}`);
  } catch (err) {
    // Silently ignore errors
  }
}

// ─── Main Engine Tick ───────────────────────────────────────

async function engineTick(): Promise<void> {
  if (botUsers.length === 0) return;

  const now = Date.now();

  // ── Process pending lifecycle events ──
  await processPendingSimJoins();
  await autoStartPendingSimRooms();

  // ── Create new games on cooldown ──

  // Solo plays (cooldown 5-15s)
  if (now - lastSoloPlayAt >= soloCooldown) {
    lastSoloPlayAt = now;
    soloCooldown = randomBetween(5000, 15000);

    const count = randomBetween(1, 3);
    const selectedBots = pickRandomN(botUsers, count);
    for (const bot of selectedBots) {
      simulateSoloPlay(bot).catch(() => {});
    }
  }

  // Predictions (cooldown 15-45s)
  if (now - lastPredictionAt >= predictionCooldown) {
    lastPredictionAt = now;
    predictionCooldown = randomBetween(15000, 45000);

    const bot = pickRandom(botUsers);
    simulatePrediction(bot).catch(() => {});
  }

  // Candleflip — bots join public rounds (cooldown 8-15s)
  if (now - lastCandleflipAt >= candleflipCooldown) {
    lastCandleflipAt = now;
    candleflipCooldown = randomBetween(8000, 15000);

    const count = randomBetween(1, 3);
    const selectedBots = pickRandomN(botUsers, count);
    for (const bot of selectedBots) {
      botJoinCandleflipRound(bot).catch(() => {});
    }
  }

  // Rug Game — bots join public rounds (cooldown 6-12s)
  if (now - lastRugGameAt >= rugGameCooldown) {
    lastRugGameAt = now;
    rugGameCooldown = randomBetween(6000, 12000);

    const count = randomBetween(1, 3);
    const selectedBots = pickRandomN(botUsers, count);
    for (const bot of selectedBots) {
      botJoinRugRound(bot).catch(() => {});
    }
  }

  // Lottery — bots buy tickets (cooldown 30-90s)
  if (now - lastLotteryAt >= lotteryCooldown) {
    lastLotteryAt = now;
    lotteryCooldown = randomBetween(30000, 90000);

    const count = randomBetween(1, 3);
    const selectedBots = pickRandomN(botUsers, count);
    for (const bot of selectedBots) {
      botBuyLotteryTickets(bot).catch(() => {});
    }
  }

  // Trading Sim room maintenance (every 30s)
  if (now - lastSimMaintenanceAt >= 30000) {
    lastSimMaintenanceAt = now;
    maintainTradingSimRooms().catch(() => {});
  }

  // Online presence tracking (cooldown 60s)
  if (now - lastOnlineTrackAt >= onlineCooldown) {
    lastOnlineTrackAt = now;

    const onlineCount = randomBetween(15, 40);
    const onlineBots = pickRandomN(botUsers, onlineCount);
    for (const bot of onlineBots) {
      trackOnline(bot.id);
    }
  }
}

// ─── Startup Recovery ───────────────────────────────────────

async function recoverOrphanedBotGames(): Promise<void> {
  if (botUsers.length === 0) return;
  const db = getDb();
  const botIds = botUsers.map(b => b.id);
  const thirtySecsAgo = new Date(Date.now() - 30_000);

  try {
    // Resolve orphaned active rug games
    const orphanedRug = await db
      .update(rugGames)
      .set({ status: 'rugged', resolvedAt: new Date() })
      .where(and(
        eq(rugGames.status, 'active'),
        inArray(rugGames.userId, botIds),
        sql`${rugGames.createdAt} < ${thirtySecsAgo}`,
      ))
      .returning({ id: rugGames.id });

    if (orphanedRug.length > 0) {
      console.log(`[BotEngine] Recovered ${orphanedRug.length} orphaned rug games`);
    }

    // Cancel orphaned open candleflip lobbies
    const orphanedFlip = await db
      .update(candleflipGames)
      .set({ status: 'cancelled' })
      .where(and(
        eq(candleflipGames.status, 'open'),
        inArray(candleflipGames.creatorId, botIds),
        sql`${candleflipGames.createdAt} < ${thirtySecsAgo}`,
      ))
      .returning({ id: candleflipGames.id });

    if (orphanedFlip.length > 0) {
      console.log(`[BotEngine] Cancelled ${orphanedFlip.length} orphaned candleflip lobbies`);
    }
  } catch (err) {
    console.error('[BotEngine] Recovery error:', err);
  }
}

// ─── Load bots from DB ──────────────────────────────────────

async function loadBotUsers(): Promise<void> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        level: users.level,
        vipTier: users.vipTier,
        avatarUrl: userProfiles.avatarUrl,
      })
      .from(users)
      .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
      .where(eq(users.role, 'bot'));

    botUsers = rows.map(r => ({
      id: r.id,
      username: r.username,
      level: r.level,
      vipTier: r.vipTier,
      avatarUrl: r.avatarUrl,
    }));
    console.log(`[BotEngine] Loaded ${botUsers.length} bot users from database`);
  } catch (err) {
    console.error('[BotEngine] Failed to load bot users:', err);
    botUsers = [];
  }
}

// ─── Public API ─────────────────────────────────────────────

export async function startBotEngine(): Promise<void> {
  console.log('[BotEngine] Starting bot engine...');

  await loadBotUsers();

  if (botUsers.length === 0) {
    console.log('[BotEngine] No bot users found. Run seed:bots first. Engine will not start.');
    return;
  }

  // Recover orphaned bot games from previous run
  await recoverOrphanedBotGames();

  // Initialize timestamps
  const now = Date.now();
  lastSoloPlayAt = now;
  lastChatAt = now;
  lastPredictionAt = now;
  lastOnlineTrackAt = now;
  lastCandleflipAt = now;
  lastRugGameAt = now;
  lastLotteryAt = now;
  lastSimMaintenanceAt = 0; // Run immediately on first tick

  // Track initial online bots immediately
  const initialOnline = pickRandomN(botUsers, randomBetween(15, 40));
  for (const bot of initialOnline) {
    trackOnline(bot.id);
  }

  // Run engine tick every 5 seconds
  engineTimer = setInterval(() => {
    engineTick().catch((err) => {
      console.error('[BotEngine] Tick error:', err);
    });
  }, 5000);

  // Cleanup stale rounds every 60 seconds (cancel entry_open rounds older than 10 min with no bets)
  setInterval(async () => {
    try {
      const { getDb } = await import('../config/database.js');
      const { sql } = await import('drizzle-orm');
      const cleanupDb = getDb();
      const result = await cleanupDb.execute(sql`
        UPDATE rounds SET status = 'cancelled'
        WHERE status = 'entry_open'
        AND created_at < NOW() - INTERVAL '10 minutes'
        AND id NOT IN (SELECT DISTINCT round_id FROM bets)
      `);
      const count = (result as any)?.rowCount || 0;
      if (count > 0) console.log(`[BotEngine] Cleaned up ${count} stale rounds`);
    } catch (err) {
      console.error('[BotEngine] Stale round cleanup error:', err);
    }
  }, 60_000);

  console.log('[BotEngine] Bot engine started successfully (lifecycle mode)');
}

export function stopBotEngine(): void {
  if (engineTimer) {
    clearInterval(engineTimer);
    engineTimer = null;
    console.log('[BotEngine] Bot engine stopped');
  }
}
