import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { requireAuth, getAuthUser, optionalAuth } from '../middleware/auth.js';
import {
  DEFAULT_ENGINE_CONFIG,
  calculateP2PPayout,
  generateRound,
} from '@tradingarena/game-engine';
import type { P2PPlayerEntry } from '@tradingarena/game-engine';

// ─── Bot Names ───────────────────────────────────────────────────────────────

const BOT_NAMES = [
  'CryptoKing420', 'SolanaWhale', 'DegenTrader', 'MoonBoi99',
  'DiamondHands', 'PumpChaser', 'RektNoMore', 'LamboSoon',
  'WhaleAlert', 'FloorSweeper', 'AlphaLeaker', 'GigaBrain',
  'RugPullSurvivor', 'BullishAF', 'TokenSniper', 'YieldFarmer',
  'MEVBot_v2', 'ApeInOnly', 'PaperHandsNo', 'SatoshiJr',
];

const VIP_TIERS = ['bronze', 'silver', 'gold', 'platinum', 'titan'];
const RISK_TIERS = ['conservative', 'balanced', 'aggressive'] as const;

// ─── Timing Constants ────────────────────────────────────────────────────────

const BETTING_DURATION = 20_000;  // 20s betting/lobby phase
const ACTIVE_DURATION  = 15_000;  // 15s active round
const RESULTS_DURATION =  5_000;  // 5s results display

// ─── Types ───────────────────────────────────────────────────────────────────

interface BattleBot {
  id: string;
  username: string;
  level: number;
  vipTier: string;
  betAmount: number;
  riskTier: string;
  joinedAt: number;
  finalMultiplier: number;
}

interface BattlePlayer {
  id: string;
  username: string;
  level: number;
  vipTier: string;
  betAmount: number;
  fee: number;
  riskTier: string;
  joinedAt: number;
  finalMultiplier: number | null;
  isBot: false;
}

interface GlobalBattle {
  roundNumber: number;
  phase: 'betting' | 'active' | 'results';
  phaseStartedAt: number;
  phaseEndsAt: number;
  players: BattlePlayer[];
  bots: BattleBot[];
  roundConfig: any | null;
  results: any | null;
  botSpawnScheduled: boolean;
}

// ─── Global State ────────────────────────────────────────────────────────────

let currentBattle: GlobalBattle = createNewBettingPhase(1);
let loopTimer: ReturnType<typeof setTimeout> | null = null;

function createNewBettingPhase(roundNumber: number): GlobalBattle {
  const now = Date.now();
  return {
    roundNumber,
    phase: 'betting',
    phaseStartedAt: now,
    phaseEndsAt: now + BETTING_DURATION,
    players: [],
    bots: [],
    roundConfig: null,
    results: null,
    botSpawnScheduled: false,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateBotMultiplier(): number {
  const r = Math.random();
  if (r < 0.15) return 0.3 + Math.random() * 0.4;
  if (r < 0.50) return 0.7 + Math.random() * 0.5;
  if (r < 0.80) return 1.0 + Math.random() * 0.8;
  if (r < 0.95) return 1.5 + Math.random() * 1.5;
  return 2.5 + Math.random() * 4.0;
}

function createBot(baseBet: number, usedNames: Set<string>): BattleBot {
  let name: string;
  do {
    name = pickRandom(BOT_NAMES);
  } while (usedNames.has(name));
  usedNames.add(name);

  const betVariation = 0.8 + Math.random() * 0.4;

  return {
    id: `bot-${crypto.randomUUID().slice(0, 8)}`,
    username: name,
    level: Math.floor(Math.random() * 35) + 1,
    vipTier: pickRandom(VIP_TIERS),
    betAmount: Math.round(baseBet * betVariation),
    riskTier: pickRandom([...RISK_TIERS]),
    joinedAt: 0,
    finalMultiplier: generateBotMultiplier(),
  };
}

function getAnimatedMultiplier(bot: BattleBot, elapsed: number, index: number): number {
  const progress = Math.min(elapsed / 15000, 1);
  const eased = progress < 0.5
    ? 2 * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 2) / 2;
  const oscillation = Math.sin(elapsed / 1000 * (1.5 + index * 0.3)) * 0.05 * (1 - progress);
  return Math.max(0.1, 1.0 + (bot.finalMultiplier - 1.0) * eased + oscillation);
}

// ─── Bot Spawning ────────────────────────────────────────────────────────────

function scheduleBotSpawns() {
  if (currentBattle.botSpawnScheduled) return;
  currentBattle.botSpawnScheduled = true;

  const baseBet = 100_000_000; // 0.1 SOL
  const totalBots = 3 + Math.floor(Math.random() * 3); // 3-5 bots
  const usedNames = new Set(currentBattle.bots.map(b => b.username));
  const roundNum = currentBattle.roundNumber;

  for (let i = 0; i < totalBots; i++) {
    const delay = 2000 + Math.random() * 14000; // Spread across 2-16s of betting phase
    setTimeout(() => {
      if (currentBattle.roundNumber !== roundNum) return;
      if (currentBattle.phase !== 'betting') return;
      if (currentBattle.bots.length >= 5) return;
      const bot = createBot(baseBet, usedNames);
      bot.joinedAt = Date.now();
      currentBattle.bots.push(bot);
    }, delay);
  }
}

// ─── Phase Transitions ──────────────────────────────────────────────────────

function transitionToActive() {
  const now = Date.now();

  // Generate the RoundConfig (chart path + nodes) for all players to share
  const seed = `battle-r${currentBattle.roundNumber}-${now}`;
  const roundConfig = generateRound(seed, DEFAULT_ENGINE_CONFIG);

  // Ensure we have at least 3 bots
  const usedNames = new Set(currentBattle.bots.map(b => b.username));
  while (currentBattle.bots.length < 3) {
    const bot = createBot(100_000_000, usedNames);
    bot.joinedAt = now;
    currentBattle.bots.push(bot);
  }

  currentBattle.phase = 'active';
  currentBattle.phaseStartedAt = now;
  currentBattle.phaseEndsAt = now + ACTIVE_DURATION;
  currentBattle.roundConfig = roundConfig;

  console.log(`[Battle] Round ${currentBattle.roundNumber} ACTIVE — ${currentBattle.players.length} real + ${currentBattle.bots.length} bots`);
}

function transitionToResults() {
  const now = Date.now();
  currentBattle.phase = 'results';
  currentBattle.phaseStartedAt = now;
  currentBattle.phaseEndsAt = now + RESULTS_DURATION;

  // Assign fallback multiplier to any player who didn't report
  for (const player of currentBattle.players) {
    if (player.finalMultiplier === null) {
      player.finalMultiplier = generateBotMultiplier();
    }
  }

  // Build P2P payout entries
  const entries: P2PPlayerEntry[] = [];

  for (const player of currentBattle.players) {
    entries.push({
      playerId: player.id,
      betAmount: player.betAmount,
      finalMultiplier: player.finalMultiplier!,
    });
  }

  for (const bot of currentBattle.bots) {
    entries.push({
      playerId: bot.id,
      betAmount: bot.betAmount,
      finalMultiplier: bot.finalMultiplier,
    });
  }

  if (entries.length < 2) {
    // Not enough players for P2P — just show raw results
    currentBattle.results = {
      rankings: entries.map((e, i) => ({
        rank: i + 1,
        playerId: e.playerId,
        username: currentBattle.players.find(p => p.id === e.playerId)?.username
          || currentBattle.bots.find(b => b.id === e.playerId)?.username || 'Unknown',
        isBot: !currentBattle.players.some(p => p.id === e.playerId),
        betAmount: e.betAmount,
        finalMultiplier: e.finalMultiplier,
        payout: e.betAmount,
        band: 'breakeven',
        profitLoss: 0,
      })),
      pool: { grossPool: 0, platformFee: 0, netPool: 0, feeRate: 0.03, playerCount: entries.length },
    };
  } else {
    const payoutResult = calculateP2PPayout(entries, DEFAULT_ENGINE_CONFIG, 0.03);

    const rankings = payoutResult.playerPayouts.map((pp) => {
      const realPlayer = currentBattle.players.find(p => p.id === pp.playerId);
      const bot = currentBattle.bots.find(b => b.id === pp.playerId);
      const entry = entries.find(e => e.playerId === pp.playerId)!;

      return {
        rank: pp.rank,
        playerId: pp.playerId,
        username: realPlayer?.username || bot?.username || 'Unknown',
        isBot: !realPlayer,
        level: realPlayer?.level || bot?.level || 1,
        vipTier: realPlayer?.vipTier || bot?.vipTier || 'bronze',
        betAmount: entry.betAmount,
        finalMultiplier: entry.finalMultiplier,
        payout: pp.payout,
        band: pp.band,
        profitLoss: pp.payout - entry.betAmount,
      };
    });

    currentBattle.results = {
      rankings,
      pool: {
        grossPool: payoutResult.grossPool,
        platformFee: payoutResult.platformFee,
        netPool: payoutResult.netPool,
        feeRate: payoutResult.feeRate,
        playerCount: entries.length,
      },
    };
  }

  // Settle payouts for real players
  settleBattlePayouts(currentBattle).catch(err => {
    console.error('[Battle] Settlement error:', err);
  });

  console.log(`[Battle] Round ${currentBattle.roundNumber} RESULTS`);
}

async function settleBattlePayouts(battle: GlobalBattle) {
  if (!battle.results?.rankings) return;

  try {
    const { WalletService } = await import('../modules/wallet/wallet.service.js');
    const walletService = new WalletService();

    for (const ranking of battle.results.rankings) {
      // Only settle real players, not bots
      const realPlayer = battle.players.find(p => p.id === ranking.playerId);
      if (!realPlayer) continue;

      const payoutLamports = Math.floor(ranking.payout);
      const ref = { type: 'battle' as const, id: `battle-r${battle.roundNumber}` };

      await walletService.settlePayout(
        realPlayer.id,
        realPlayer.betAmount,
        realPlayer.fee,
        payoutLamports,
        'SOL',
        ref,
      );

      // Record referral commission
      try {
        const { ReferralService } = await import('../modules/referral/referral.service.js');
        await new ReferralService().recordCommission(
          realPlayer.id,
          `battle-r${battle.roundNumber}`,
          realPlayer.betAmount,
          realPlayer.fee,
        );
      } catch {
        // Non-critical
      }
    }
  } catch (err) {
    console.error('[Battle] Failed to settle payouts:', err);
  }
}

function transitionToBetting() {
  const nextRound = currentBattle.roundNumber + 1;
  currentBattle = createNewBettingPhase(nextRound);
  console.log(`[Battle] Round ${nextRound} BETTING — 20s to place bets`);
}

// ─── Main Loop ──────────────────────────────────────────────────────────────

function startBattleLoop() {
  const tick = () => {
    const now = Date.now();

    if (now >= currentBattle.phaseEndsAt) {
      switch (currentBattle.phase) {
        case 'betting':
          transitionToActive();
          break;
        case 'active':
          transitionToResults();
          break;
        case 'results':
          transitionToBetting();
          break;
      }
    }

    // Schedule bot spawns during betting phase
    if (currentBattle.phase === 'betting' && !currentBattle.botSpawnScheduled) {
      scheduleBotSpawns();
    }

    loopTimer = setTimeout(tick, 250);
  };

  console.log(`[Battle] Loop started — Round 1 BETTING`);
  scheduleBotSpawns();
  tick();
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function battleRoutes(server: FastifyInstance) {

  // Start the continuous battle loop
  startBattleLoop();

  // ─── Get Current Battle State ─────────────────────────────
  server.get('/current', { preHandler: [optionalAuth] }, async (request) => {
    const user = (request as any).authUser;
    const now = Date.now();
    const elapsed = currentBattle.phase === 'active'
      ? Math.min(now - currentBattle.phaseStartedAt, ACTIVE_DURATION)
      : null;

    // Build player list
    const allPlayers: any[] = [];

    // Real players
    for (const player of currentBattle.players) {
      allPlayers.push({
        id: player.id,
        username: player.username,
        level: player.level,
        vipTier: player.vipTier,
        betAmount: player.betAmount,
        riskTier: player.riskTier,
        isBot: false,
        joinedAt: player.joinedAt,
        currentMultiplier: 1.0, // Client tracks its own
        finalMultiplier: currentBattle.phase === 'results' ? player.finalMultiplier : null,
      });
    }

    // Bots
    currentBattle.bots.forEach((bot, i) => {
      const botData: any = {
        id: bot.id,
        username: bot.username,
        level: bot.level,
        vipTier: bot.vipTier,
        betAmount: bot.betAmount,
        riskTier: bot.riskTier,
        isBot: true,
        joinedAt: bot.joinedAt,
        currentMultiplier: elapsed !== null ? getAnimatedMultiplier(bot, elapsed, i) : 1.0,
        finalMultiplier: currentBattle.phase === 'results' ? bot.finalMultiplier : null,
      };
      allPlayers.push(botData);
    });

    // Sort by current multiplier during active phase
    if (currentBattle.phase === 'active' && elapsed !== null) {
      allPlayers.sort((a: any, b: any) => b.currentMultiplier - a.currentMultiplier);
    }

    const grossPool = allPlayers.reduce((s: number, p: any) => s + p.betAmount, 0);

    // Detect if the requesting user is a participant
    const myPlayerId = user ? currentBattle.players.find(p => p.id === user.userId)?.id || null : null;

    return {
      roundNumber: currentBattle.roundNumber,
      phase: currentBattle.phase,
      phaseStartedAt: currentBattle.phaseStartedAt,
      phaseEndsAt: currentBattle.phaseEndsAt,
      players: allPlayers,
      playerCount: allPlayers.length,
      grossPool,
      elapsed,
      myPlayerId,
      // Only send roundConfig during active phase (it's large ~50KB)
      roundConfig: currentBattle.phase === 'active' ? currentBattle.roundConfig : null,
      results: currentBattle.phase === 'results' ? currentBattle.results : null,
    };
  });

  // ─── Join Current Battle ──────────────────────────────────
  server.post('/join', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = getAuthUser(request);

    if (currentBattle.phase !== 'betting') {
      return reply.status(400).send({
        error: 'Can only join during betting phase',
        phase: currentBattle.phase,
        phaseEndsAt: currentBattle.phaseEndsAt,
      });
    }

    // Check if already joined this round
    if (currentBattle.players.some(p => p.id === user.userId)) {
      return reply.status(400).send({ error: 'Already joined this round' });
    }

    const body = z.object({
      betAmount: z.number().int().positive().min(1_000_000).max(10_000_000_000),
      riskTier: z.enum(['conservative', 'balanced', 'aggressive']),
    }).parse(request.body);

    // Get user info from DB
    let username = 'Player';
    let level = 1;
    let vipTier = 'bronze';

    try {
      const db = (await import('../config/database.js')).getDb();
      const { users } = await import('@tradingarena/db');
      const { eq } = await import('drizzle-orm');
      const dbUser = await db.select().from(users).where(eq(users.id, user.userId)).then((r: any[]) => r[0]);
      if (dbUser) {
        username = dbUser.username;
        level = dbUser.level || 1;
        vipTier = dbUser.vipTier || 'bronze';
      }
    } catch {
      // Fallback to defaults
    }

    // Lock funds from player's balance (bet + 5% fee)
    const feeRate = DEFAULT_ENGINE_CONFIG.platformFeeRate; // 0.05
    const fee = Math.floor(body.betAmount * feeRate);
    const totalCost = body.betAmount + fee;

    try {
      const { WalletService } = await import('../modules/wallet/wallet.service.js');
      const walletService = new WalletService();
      await walletService.lockFunds(
        user.userId,
        totalCost,
        'SOL',
        { type: 'battle', id: `battle-r${currentBattle.roundNumber}` },
      );
    } catch (err: any) {
      return reply.status(400).send({
        error: err.message || 'Insufficient balance',
      });
    }

    const player: BattlePlayer = {
      id: user.userId,
      username,
      level,
      vipTier,
      betAmount: body.betAmount,
      fee,
      riskTier: body.riskTier,
      joinedAt: Date.now(),
      finalMultiplier: null,
      isBot: false,
    };

    currentBattle.players.push(player);

    return {
      success: true,
      roundNumber: currentBattle.roundNumber,
      phase: currentBattle.phase,
      phaseEndsAt: currentBattle.phaseEndsAt,
    };
  });

  // ─── Report Multiplier ────────────────────────────────────
  server.post('/report', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = getAuthUser(request);

    if (currentBattle.phase !== 'active') {
      return reply.status(400).send({ error: 'Can only report during active phase' });
    }

    const body = z.object({
      finalMultiplier: z.number().min(0).max(100),
    }).parse(request.body);

    const player = currentBattle.players.find(p => p.id === user.userId);
    if (!player) {
      return reply.status(400).send({ error: 'Not a participant in this round' });
    }

    player.finalMultiplier = body.finalMultiplier;
    return { success: true };
  });
}
