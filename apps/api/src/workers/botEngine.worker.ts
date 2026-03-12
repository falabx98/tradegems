import { getDb } from '../config/database.js';
import { users, userProfiles, chatMessages, activityFeedItems, rounds, bets, betResults, predictionRounds } from '@tradingarena/db';
import { eq, sql } from 'drizzle-orm';
import { trackOnline } from '../routes/chat.routes.js';

// ─── Types ──────────────────────────────────────────────────
interface BotUser {
  id: string;
  username: string;
  level: number;
  vipTier: string;
}

// ─── State ──────────────────────────────────────────────────
let botUsers: BotUser[] = [];
let engineTimer: ReturnType<typeof setInterval> | null = null;

// Last-run timestamps
let lastSoloPlayAt = 0;
let lastChatAt = 0;
let lastPredictionAt = 0;
let lastOnlineTrackAt = 0;

// Randomized cooldowns (ms)
let soloCooldown = randomBetween(5000, 15000);
let chatCooldown = randomBetween(10000, 30000);
let predictionCooldown = randomBetween(15000, 45000);
const onlineCooldown = 60000;

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

// ─── Simulation Functions ───────────────────────────────────

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
      avatar: null,
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

// ─── Main Engine Tick ───────────────────────────────────────

async function engineTick(): Promise<void> {
  if (botUsers.length === 0) return;

  const now = Date.now();

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

  // Chat messages (cooldown 10-30s)
  if (now - lastChatAt >= chatCooldown) {
    lastChatAt = now;
    chatCooldown = randomBetween(10000, 30000);

    const bot = pickRandom(botUsers);
    simulateChatMessage(bot).catch(() => {});
  }

  // Predictions (cooldown 15-45s)
  if (now - lastPredictionAt >= predictionCooldown) {
    lastPredictionAt = now;
    predictionCooldown = randomBetween(15000, 45000);

    const bot = pickRandom(botUsers);
    simulatePrediction(bot).catch(() => {});
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
      })
      .from(users)
      .where(eq(users.role, 'bot'));

    botUsers = rows;
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

  // Initialize timestamps
  const now = Date.now();
  lastSoloPlayAt = now;
  lastChatAt = now;
  lastPredictionAt = now;
  lastOnlineTrackAt = now;

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

  console.log('[BotEngine] Bot engine started successfully');
}

export function stopBotEngine(): void {
  if (engineTimer) {
    clearInterval(engineTimer);
    engineTimer = null;
    console.log('[BotEngine] Bot engine stopped');
  }
}
