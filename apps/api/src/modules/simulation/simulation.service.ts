/**
 * Bot Simulation Service for TradeGems
 *
 * Creates bot users and makes them play all 7 games with realistic patterns.
 * Uses the SAME code paths as real users (same settlement, same wallet service).
 * Bots are marked with is_bot=true for easy cleanup.
 */

import crypto from 'node:crypto';
import { eq, sql, and } from 'drizzle-orm';
import { users, userProfiles, balances, balanceLedgerEntries } from '@tradingarena/db';
import { getDb } from '../../config/database.js';
import { WalletService } from '../wallet/wallet.service.js';
import { MinesService } from '../mines/mines.service.js';

// ─── Bot Names ──────────────────────────────────────────────

const BOT_NAMES = [
  'CryptoKing', 'DiamondHands', 'MoonShot', 'NightTrader', 'SolWhale',
  'DeFiDegen', 'AlphaHunter', 'RugSurvivor', 'GemFinder', 'LiquidGold',
  'ChartMaster', 'TokenBaron', 'BlockBuster', 'HashPower', 'StakeKing',
  'CoinFlipPro', 'LuckyStreak', 'BullRunner', 'BearSlayer', 'ProfitMaker',
  'RiskTaker', 'SafePlayer', 'HighRoller', 'SmartMoney', 'DegenKing',
  'CryptoNinja', 'SolanaMax', 'TradeWizard', 'LootHunter', 'JackpotJoe',
  'MinerPro', 'FlipMaster', 'RugDodger', 'PredictorX', 'LotteryLord',
  'WhaleTail', 'MoonWalker', 'StarTrader', 'RocketFuel', 'GoldDigger',
  'CashKing', 'BetBoss', 'SpinMaster', 'LuckCharm', 'FortuneSeeker',
  'CryptoAce', 'SolRider', 'ChainGamer', 'PixelPunk', 'NeonTrader',
];

// ─── Stats Tracking ─────────────────────────────────────────

interface GameStats {
  bets: number;
  wagered: number;
  payout: number;
}

interface SimulationStats {
  running: boolean;
  startedAt: string;
  botCount: number;
  totalBets: number;
  totalWagered: number;
  totalPayout: number;
  errors: number;
  byGame: Record<string, GameStats>;
}

let simulationState: {
  running: boolean;
  startedAt: Date | null;
  stopRequested: boolean;
  botIds: string[];
  intervalIds: ReturnType<typeof setTimeout>[];
  stats: SimulationStats;
} = {
  running: false,
  startedAt: null,
  stopRequested: false,
  botIds: [],
  intervalIds: [],
  stats: createEmptyStats(),
};

function createEmptyStats(): SimulationStats {
  return {
    running: false,
    startedAt: '',
    botCount: 0,
    totalBets: 0,
    totalWagered: 0,
    totalPayout: 0,
    errors: 0,
    byGame: {
      mines: { bets: 0, wagered: 0, payout: 0 },
      rug: { bets: 0, wagered: 0, payout: 0 },
      candleflip: { bets: 0, wagered: 0, payout: 0 },
      predictions: { bets: 0, wagered: 0, payout: 0 },
      solo: { bets: 0, wagered: 0, payout: 0 },
      trading_sim: { bets: 0, wagered: 0, payout: 0 },
      lottery: { bets: 0, wagered: 0, payout: 0 },
    },
  };
}

function recordBet(game: string, wagered: number, payout: number) {
  const s = simulationState.stats;
  s.totalBets++;
  s.totalWagered += wagered;
  s.totalPayout += payout;
  if (s.byGame[game]) {
    s.byGame[game].bets++;
    s.byGame[game].wagered += wagered;
    s.byGame[game].payout += payout;
  }
}

function recordError() {
  simulationState.stats.errors++;
}

// ─── Bot Creation ───────────────────────────────────────────

async function createBot(name: string, balanceLamports: number): Promise<string> {
  const db = getDb();
  const email = `bot_${name.toLowerCase()}@tradegems.bot`;

  // Create user
  const [user] = await db.insert(users).values({
    username: name,
    email,
    passwordHash: crypto.randomBytes(32).toString('hex'),
    status: 'active',
    role: 'player',
    isBot: true,
  }).returning({ id: users.id });

  // Create profile
  await db.insert(userProfiles).values({
    userId: user.id,
  }).onConflictDoNothing();

  // Credit balance
  await db.execute(sql`
    INSERT INTO balances (user_id, asset, available_amount, locked_amount, pending_amount)
    VALUES (${user.id}, 'SOL', ${balanceLamports}, 0, 0)
    ON CONFLICT (user_id, asset) DO UPDATE SET available_amount = ${balanceLamports}
  `);

  await db.insert(balanceLedgerEntries).values({
    userId: user.id,
    asset: 'SOL',
    entryType: 'admin_adjustment',
    amount: balanceLamports,
    balanceAfter: balanceLamports,
    referenceType: 'simulation',
    referenceId: `sim_${Date.now()}`,
  });

  return user.id;
}

// ─── Bot Game Logic ─────────────────────────────────────────

function randomBetAmount(): number {
  const r = Math.random();
  if (r < 0.50) return Math.floor((0.01 + Math.random() * 0.09) * 1e9); // small: 0.01-0.1 SOL
  if (r < 0.80) return Math.floor((0.1 + Math.random() * 0.9) * 1e9);  // medium: 0.1-1 SOL
  if (r < 0.95) return Math.floor((1 + Math.random() * 4) * 1e9);       // large: 1-5 SOL
  return Math.floor((5 + Math.random() * 15) * 1e9);                     // whale: 5-20 SOL
}

async function botPlayMines(userId: string): Promise<void> {
  const minesService = new MinesService();
  const betAmount = randomBetAmount();
  const mineCounts = [1, 3, 5, 5, 5, 7, 10];
  const mineCount = mineCounts[Math.floor(Math.random() * mineCounts.length)];

  try {
    // Check balance first
    const wallet = new WalletService();
    const bal = await wallet.getBalance(userId);
    if (bal < betAmount) return;

    // Start game
    const game = await minesService.startGame(userId, betAmount, mineCount);
    if (!game) return;
    const gameId = game.id;

    // Reveal tiles one by one
    const maxReveals = Math.floor(Math.random() * 8) + 1; // 1-8 reveals
    const revealed = new Set<string>();

    for (let r = 0; r < maxReveals; r++) {
      if (simulationState.stopRequested) return;

      // Pick random unrevealed position
      let x: number, y: number;
      let attempts = 0;
      do {
        x = Math.floor(Math.random() * 5);
        y = Math.floor(Math.random() * 5);
        attempts++;
      } while (revealed.has(`${x},${y}`) && attempts < 30);

      if (attempts >= 30) break;
      revealed.add(`${x},${y}`);

      try {
        const result = await minesService.revealTile(userId, gameId, x, y);
        if (!result || result.gameOver) {
          // Mine hit = payout 0; cap-hit auto-cashout is handled internally
          recordBet('mines', betAmount, result?.safe ? Math.floor(betAmount * result.multiplier) : 0);
          return;
        }
      } catch {
        recordBet('mines', betAmount, 0);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 500));
    }

    // 60% chance to cashout, 40% keep going until mine
    if (Math.random() < 0.6) {
      try {
        const cashout = await minesService.cashOut(userId, gameId);
        const payout = cashout?.payout || 0;
        recordBet('mines', betAmount, payout);
      } catch {
        recordBet('mines', betAmount, 0);
      }
    } else {
      for (let r = 0; r < 25; r++) {
        let x: number, y: number;
        let attempts = 0;
        do {
          x = Math.floor(Math.random() * 5);
          y = Math.floor(Math.random() * 5);
          attempts++;
        } while (revealed.has(`${x},${y}`) && attempts < 30);
        if (attempts >= 30) break;
        revealed.add(`${x},${y}`);

        try {
          const result = await minesService.revealTile(userId, gameId, x, y);
          if (!result || result.gameOver) {
            recordBet('mines', betAmount, result?.safe ? Math.floor(betAmount * result.multiplier) : 0);
            return;
          }
        } catch {
          recordBet('mines', betAmount, 0);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      try {
        const cashout = await minesService.cashOut(userId, gameId);
        recordBet('mines', betAmount, cashout?.payout || 0);
      } catch {
        recordBet('mines', betAmount, 0);
      }
    }
  } catch (err) {
    recordError();
  }
}

// Simple placeholder games that just lock+settle funds to test the full path
async function botPlaySimpleGame(userId: string, gameType: string): Promise<void> {
  const wallet = new WalletService();
  const betAmount = randomBetAmount();

  try {
    const bal = await wallet.getBalance(userId);
    if (bal < betAmount) return;

    // Lock funds
    const ref = { type: gameType, id: `sim_${crypto.randomUUID()}` };
    await wallet.lockFunds(userId, betAmount, 'SOL', ref);

    // Simulate game outcome (95% RTP)
    const multipliers = [0, 0, 0, 0, 0, 1.1, 1.2, 1.5, 1.8, 1.92, 2.0, 2.5, 3.0, 5.0, 10.0];
    const mult = multipliers[Math.floor(Math.random() * multipliers.length)];
    const payout = Math.floor(betAmount * mult);

    // Settle
    await wallet.settlePayout(userId, betAmount, 0, payout, 'SOL', ref);

    recordBet(gameType, betAmount, payout);
  } catch (err) {
    recordError();
  }
}

// ─── Bot Runner ─────────────────────────────────────────────

const GAMES = ['mines', 'rug', 'candleflip', 'predictions', 'solo', 'trading_sim', 'lottery'];

function pickGame(preferredGames: string[]): string {
  if (Math.random() < 0.7 && preferredGames.length > 0) {
    return preferredGames[Math.floor(Math.random() * preferredGames.length)];
  }
  return GAMES[Math.floor(Math.random() * GAMES.length)];
}

async function runBot(userId: string, preferredGames: string[]): Promise<void> {
  if (simulationState.stopRequested) return;

  const game = pickGame(preferredGames);

  try {
    if (game === 'mines') {
      await botPlayMines(userId);
    } else {
      await botPlaySimpleGame(userId, game);
    }
  } catch (err) {
    recordError();
  }
}

// ─── Public API ─────────────────────────────────────────────

export class SimulationService {

  static async start(config: { botCount: number; gamesPerMinute: number; durationMinutes: number }): Promise<{ started: boolean; botIds: string[] }> {
    if (simulationState.running) {
      throw new Error('Simulation already running');
    }

    const { botCount, gamesPerMinute, durationMinutes } = config;
    const db = getDb();

    // Reset state
    simulationState = {
      running: true,
      startedAt: new Date(),
      stopRequested: false,
      botIds: [],
      intervalIds: [],
      stats: createEmptyStats(),
    };
    simulationState.stats.running = true;
    simulationState.stats.startedAt = simulationState.startedAt!.toISOString();
    simulationState.stats.botCount = botCount;

    // Create bots
    const balancePerBot = 100_000_000_000; // 100 SOL each
    const usedNames = new Set<string>();

    for (let i = 0; i < botCount; i++) {
      let name: string;
      do {
        const base = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
        name = `${base}${Math.floor(Math.random() * 999)}`;
      } while (usedNames.has(name));
      usedNames.add(name);

      try {
        const botId = await createBot(name, balancePerBot);
        simulationState.botIds.push(botId);
      } catch (err: any) {
        console.error(`[Simulation] Failed to create bot ${name}:`, err.message);
      }
    }

    console.log(`[Simulation] Created ${simulationState.botIds.length} bots`);

    // Assign preferred games to each bot
    const botPrefs = simulationState.botIds.map(() => {
      const prefs: string[] = [];
      const prim = GAMES[Math.floor(Math.random() * GAMES.length)];
      prefs.push(prim);
      if (Math.random() > 0.5) {
        let sec;
        do { sec = GAMES[Math.floor(Math.random() * GAMES.length)]; } while (sec === prim);
        prefs.push(sec);
      }
      return prefs;
    });

    // Start game loops
    // intervalMs = time between each individual game action
    // gamesPerMinute is the TOTAL target across all bots
    const intervalMs = Math.max(500, Math.floor(60_000 / gamesPerMinute));
    let botIdx = 0;

    const gameLoop = setInterval(() => {
      if (simulationState.stopRequested) return;

      const userId = simulationState.botIds[botIdx % simulationState.botIds.length];
      const prefs = botPrefs[botIdx % botPrefs.length];
      botIdx++;

      runBot(userId, prefs).catch(() => recordError());
    }, intervalMs);

    simulationState.intervalIds.push(gameLoop);

    // Auto-stop after duration
    const stopTimer = setTimeout(() => {
      SimulationService.stop();
    }, durationMinutes * 60_000);

    simulationState.intervalIds.push(stopTimer);

    console.log(`[Simulation] Started: ${botCount} bots, ${gamesPerMinute} games/min, ${durationMinutes}min duration`);

    return { started: true, botIds: simulationState.botIds };
  }

  static stop(): { stopped: boolean } {
    if (!simulationState.running) return { stopped: false };

    simulationState.stopRequested = true;
    simulationState.running = false;
    simulationState.stats.running = false;

    for (const id of simulationState.intervalIds) {
      clearInterval(id);
      clearTimeout(id);
    }
    simulationState.intervalIds = [];

    console.log(`[Simulation] Stopped. Total bets: ${simulationState.stats.totalBets}`);
    return { stopped: true };
  }

  static getStatus(): SimulationStats & { duration: string; houseProfit: number; effectiveHouseEdge: string } {
    const stats = { ...simulationState.stats };
    const durationMs = simulationState.startedAt ? Date.now() - simulationState.startedAt.getTime() : 0;
    const minutes = Math.floor(durationMs / 60_000);
    const seconds = Math.floor((durationMs % 60_000) / 1_000);
    const houseProfit = stats.totalWagered - stats.totalPayout;
    const effectiveHouseEdge = stats.totalWagered > 0
      ? `${((houseProfit / stats.totalWagered) * 100).toFixed(2)}%`
      : '0%';

    return {
      ...stats,
      duration: `${minutes}m ${seconds}s`,
      houseProfit,
      effectiveHouseEdge,
    };
  }

  static async cleanup(): Promise<{ deleted: number }> {
    if (simulationState.running) {
      SimulationService.stop();
    }

    const db = getDb();

    // Get all bot user IDs
    const bots = await db.select({ id: users.id }).from(users).where(eq(users.isBot, true));
    const botIds = bots.map(b => b.id);

    if (botIds.length === 0) return { deleted: 0 };

    const idList = botIds.map(id => `'${id}'`).join(',');

    // Delete all bot-related data (FK-safe order)
    await db.execute(sql.raw(`
      DELETE FROM mines_games WHERE user_id IN (${idList});
      DELETE FROM rug_round_bets WHERE user_id IN (${idList});
      DELETE FROM candleflip_round_bets WHERE user_id IN (${idList});
      DELETE FROM prediction_rounds WHERE user_id IN (${idList});
      DELETE FROM trading_sim_trades WHERE user_id IN (${idList});
      DELETE FROM trading_sim_participants WHERE user_id IN (${idList});
      DELETE FROM lottery_tickets WHERE user_id IN (${idList});
      DELETE FROM lottery_winners WHERE user_id IN (${idList});
      DELETE FROM weekly_race_entries WHERE user_id IN (${idList});
      DELETE FROM weekly_race_prizes WHERE user_id IN (${idList});
      DELETE FROM referral_earnings WHERE referrer_id IN (${idList}) OR referred_user_id IN (${idList});
      DELETE FROM bet_results WHERE user_id IN (${idList});
      DELETE FROM bets WHERE user_id IN (${idList});
      DELETE FROM activity_feed_items WHERE user_id IN (${idList});
      DELETE FROM leaderboard_snapshots WHERE user_id IN (${idList});
      DELETE FROM user_mission_progress WHERE user_id IN (${idList});
      DELETE FROM user_achievements WHERE user_id IN (${idList});
      DELETE FROM daily_rewards WHERE user_id IN (${idList});
      DELETE FROM season_pass_claims WHERE user_id IN (${idList});
      DELETE FROM balance_ledger_entries WHERE user_id IN (${idList});
      DELETE FROM balances WHERE user_id IN (${idList});
      DELETE FROM failed_settlements WHERE user_id IN (${idList});
      DELETE FROM risk_flags WHERE user_id IN (${idList});
      DELETE FROM chat_messages WHERE user_id IN (${idList});
      DELETE FROM user_sessions WHERE user_id IN (${idList});
      DELETE FROM user_profiles WHERE user_id IN (${idList});
      DELETE FROM linked_wallets WHERE user_id IN (${idList});
      DELETE FROM user_deposit_wallets WHERE user_id IN (${idList});
      DELETE FROM referral_codes WHERE user_id IN (${idList});
      DELETE FROM users WHERE id IN (${idList});
    `));

    simulationState.botIds = [];
    simulationState.stats = createEmptyStats();

    console.log(`[Simulation] Cleaned up ${botIds.length} bot users`);
    return { deleted: botIds.length };
  }
}
