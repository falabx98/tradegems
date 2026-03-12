import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { requireAuth, getAuthUser, optionalAuth } from '../middleware/auth.js';
import { env } from '../config/env.js';
import {
  DEFAULT_ENGINE_CONFIG,
  generateRound,
} from '@tradingarena/game-engine';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Valid buy-in tiers in lamports */
const BUYIN_TIERS = [
  100_000_000,    // 0.1 SOL
  250_000_000,    // 0.25 SOL
  500_000_000,    // 0.5 SOL
  1_000_000_000,  // 1 SOL
  2_000_000_000,  // 2 SOL
];

const FEE_RATE = env.PLATFORM_FEE_RATE; // Unified fee rate from env (default 5%)
const MIN_PLAYERS = 2;            // Lowered: real players only (no bots)
const MAX_PLAYERS = 8;
const ROUNDS_PER_TOURNAMENT = 3;
const WAITING_COUNTDOWN = 15_000; // 15s after min players
const ROUND_DURATION = 15_000;    // 15s per round
const RESULTS_DURATION = 5_000;   // 5s between rounds
const FINAL_DURATION = 10_000;    // 10s final results
const TICK_INTERVAL = 250;        // 250ms

// ─── Types ───────────────────────────────────────────────────────────────────

type RoomPhase = 'waiting' | 'round_active' | 'round_results' | 'final_results' | 'closed';

interface TournamentPlayer {
  id: string;
  username: string;
  level: number;
  vipTier: string;
  joinedAt: number;
  /** Per-round multipliers: index 0 = round 1, etc. null = not yet reported */
  roundMultipliers: (number | null)[];
}

interface TournamentRoom {
  id: string;
  buyIn: number;          // lamports
  fee: number;            // lamports (buyIn * FEE_RATE)
  players: TournamentPlayer[];
  state: RoomPhase;
  currentRound: number;   // 1-based, 0 = not started
  roundConfigs: any[];    // one RoundConfig per round (generated at round start)
  createdAt: number;
  countdownStartedAt: number | null;
  phaseStartedAt: number;
  phaseEndsAt: number;
  grossPool: number;
  netPool: number;
  settledAt: number | null;
}

// ─── In-Memory State ─────────────────────────────────────────────────────────

const rooms = new Map<string, TournamentRoom>();
let loopTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateFallbackMultiplier(): number {
  // Random fallback for players who didn't report a multiplier
  const r = Math.random();
  if (r < 0.30) return 0.3 + Math.random() * 0.4;   // 0.3-0.7  (bust)
  if (r < 0.60) return 0.7 + Math.random() * 0.5;    // 0.7-1.2  (breakeven)
  if (r < 0.85) return 1.0 + Math.random() * 0.6;    // 1.0-1.6  (small win)
  return 1.3 + Math.random() * 0.7;                   // 1.3-2.0  (medium win)
}

function getCumulativeScore(player: TournamentPlayer): number {
  return player.roundMultipliers.reduce((sum: number, m) => sum + (m ?? 0), 0);
}

function createRoom(buyIn: number): TournamentRoom {
  const now = Date.now();
  const fee = Math.floor(buyIn * FEE_RATE);
  return {
    id: `t-${crypto.randomUUID().slice(0, 8)}`,
    buyIn,
    fee,
    players: [],
    state: 'waiting',
    currentRound: 0,
    roundConfigs: [],
    createdAt: now,
    countdownStartedAt: null,
    phaseStartedAt: now,
    phaseEndsAt: now + 300_000, // 5 min max wait
    grossPool: 0,
    netPool: 0,
    settledAt: null,
  };
}

// ─── Room Phase Transitions ──────────────────────────────────────────────────

function startRound(room: TournamentRoom) {
  const now = Date.now();
  room.currentRound += 1;

  // Generate round config
  const seed = `tournament-${room.id}-r${room.currentRound}-${now}`;
  const roundConfig = generateRound(seed, DEFAULT_ENGINE_CONFIG);
  room.roundConfigs.push(roundConfig);

  // Initialize multiplier slots for all players (null = not reported yet)
  for (const p of room.players) {
    while (p.roundMultipliers.length < room.currentRound - 1) {
      p.roundMultipliers.push(0);
    }
    p.roundMultipliers.push(null);
  }

  room.state = 'round_active';
  room.phaseStartedAt = now;
  room.phaseEndsAt = now + ROUND_DURATION;

  // Compute pool on first round
  if (room.currentRound === 1) {
    room.grossPool = room.players.length * room.buyIn;
    room.netPool = Math.floor(room.grossPool * (1 - FEE_RATE));
  }

  console.log(`[Tournament] Room ${room.id} — Round ${room.currentRound} ACTIVE (${room.players.length} players)`);
}

function endRound(room: TournamentRoom) {
  const now = Date.now();
  const roundIdx = room.currentRound - 1;

  // Assign fallback multiplier to any player who didn't report
  for (const p of room.players) {
    if (p.roundMultipliers[roundIdx] === null || p.roundMultipliers[roundIdx] === undefined) {
      p.roundMultipliers[roundIdx] = generateFallbackMultiplier();
    }
  }

  if (room.currentRound >= ROUNDS_PER_TOURNAMENT) {
    // Final results
    room.state = 'final_results';
    room.phaseStartedAt = now;
    room.phaseEndsAt = now + FINAL_DURATION;
    console.log(`[Tournament] Room ${room.id} — FINAL RESULTS`);

    // Settle payouts
    settleTournament(room).catch(err => {
      console.error(`[Tournament] Settlement error for room ${room.id}:`, err);
    });
  } else {
    // Interim results
    room.state = 'round_results';
    room.phaseStartedAt = now;
    room.phaseEndsAt = now + RESULTS_DURATION;
    console.log(`[Tournament] Room ${room.id} — Round ${room.currentRound} RESULTS`);
  }
}

async function settleTournament(room: TournamentRoom) {
  if (room.settledAt) return; // Already settled
  room.settledAt = Date.now();

  // Compute final standings
  const standings = room.players
    .map(p => ({
      id: p.id,
      username: p.username,
      cumulative: getCumulativeScore(p),
    }))
    .sort((a, b) => b.cumulative - a.cumulative);

  if (standings.length === 0) return;

  // Find winner(s) — handle ties
  const topScore = standings[0].cumulative;
  const winners = standings.filter(s => s.cumulative === topScore);

  try {
    const { WalletService } = await import('../modules/wallet/wallet.service.js');
    const walletService = new WalletService();

    const winnerPayout = Math.floor(room.netPool / winners.length);

    for (const player of room.players) {
      const isWinner = winners.some(w => w.id === player.id);
      const payout = isWinner ? winnerPayout : 0;
      const ref = { type: 'battle' as const, id: `tournament-${room.id}` };

      try {
        await walletService.settlePayout(
          player.id,
          room.buyIn,
          room.fee,
          payout,
          'SOL',
          ref,
        );
      } catch (settleErr) {
        console.error(`[Tournament] Settlement failed for player ${player.id} in room ${room.id}:`, settleErr);
        // Continue settling other players
      }

      // Record referral commission
      try {
        const { ReferralService } = await import('../modules/referral/referral.service.js');
        await new ReferralService().recordCommission(
          player.id,
          `tournament-${room.id}`,
          room.buyIn,
          room.fee,
        );
      } catch {
        // Non-critical
      }
    }

    console.log(`[Tournament] Room ${room.id} settled — winner(s): ${winners.map(w => w.username).join(', ')} — payout: ${winnerPayout} lamports each`);

    // Persist tournament to database
    try {
      const { getDb } = await import('../config/database.js');
      const { tournaments, tournamentParticipants } = await import('@tradingarena/db');
      const tdb = getDb();

      const [saved] = await tdb.insert(tournaments).values({
        roomId: room.id,
        buyIn: room.buyIn,
        fee: room.fee,
        grossPool: room.grossPool,
        netPool: room.netPool,
        playerCount: room.players.length,
        winnerId: winners[0]?.id ?? null,
        winnerUsername: winners[0]?.username ?? null,
        winnerPayout,
        standings,
        roundData: room.roundConfigs.map((_, i) => ({
          round: i + 1,
          multipliers: room.players.map(p => ({
            playerId: p.id,
            username: p.username,
            multiplier: p.roundMultipliers[i] ?? 0,
          })),
        })),
        settledAt: new Date(),
      }).returning();

      // Save participants
      for (let rank = 0; rank < standings.length; rank++) {
        const s = standings[rank];
        const player = room.players.find(p => p.id === s.id);
        if (!player) continue;

        await tdb.insert(tournamentParticipants).values({
          tournamentId: saved.id,
          userId: s.id,
          username: s.username,
          finalRank: rank + 1,
          cumulativeScore: String(s.cumulative),
          payout: winners.some(w => w.id === s.id) ? winnerPayout : 0,
          roundMultipliers: player.roundMultipliers,
        });
      }
    } catch (persistErr) {
      console.error(`[Tournament] Failed to persist tournament ${room.id}:`, persistErr);
    }
  } catch (err) {
    console.error(`[Tournament] Failed to settle room ${room.id}:`, err);
  }
}

function closeRoom(room: TournamentRoom) {
  room.state = 'closed';
  // Schedule cleanup after a short delay (let final polls arrive)
  setTimeout(() => {
    rooms.delete(room.id);
    console.log(`[Tournament] Room ${room.id} destroyed`);
  }, 5_000);
}

// ─── Main Tick Loop ──────────────────────────────────────────────────────────

function startTournamentLoop() {
  const tick = () => {
    const now = Date.now();

    for (const room of rooms.values()) {
      if (room.state === 'closed') continue;

      if (now >= room.phaseEndsAt) {
        switch (room.state) {
          case 'waiting':
            // Countdown expired — start tournament if enough players
            if (room.players.length >= MIN_PLAYERS || room.countdownStartedAt !== null) {
              startRound(room);
            } else {
              // L2 fix: Stale room (waiting expired without enough players) — refund & cleanup
              console.log(`[Tournament] Room ${room.id} expired with ${room.players.length} players — refunding`);
              for (const player of room.players) {
                (async () => {
                  try {
                    const { WalletService } = await import('../modules/wallet/wallet.service.js');
                    await new WalletService().settlePayout(
                      player.id, room.buyIn, room.fee,
                      room.buyIn + room.fee, // Full refund
                      'SOL',
                      { type: 'battle' as const, id: `tournament-${room.id}-expired-refund` },
                    );
                  } catch (err) {
                    console.error(`[Tournament] Expired refund failed for ${player.id}:`, err);
                  }
                })();
              }
              room.state = 'closed';
              setTimeout(() => rooms.delete(room.id), 2_000);
            }
            break;

          case 'round_active':
            endRound(room);
            break;

          case 'round_results':
            startRound(room);
            break;

          case 'final_results':
            closeRoom(room);
            break;
        }
      }

      // Start countdown when 4+ players arrive
      if (room.state === 'waiting' && room.countdownStartedAt === null && room.players.length >= MIN_PLAYERS) {
        room.countdownStartedAt = now;
        room.phaseEndsAt = now + WAITING_COUNTDOWN;
        console.log(`[Tournament] Room ${room.id} — ${room.players.length} players, countdown started (15s)`);
      }

      // Auto-start at max capacity
      if (room.state === 'waiting' && room.players.length >= MAX_PLAYERS && room.countdownStartedAt !== null) {
        startRound(room);
      }
    }

    loopTimer = setTimeout(tick, TICK_INTERVAL);
  };

  console.log(`[Tournament] Loop started`);
  tick();
}

// ─── Build Room Summary ──────────────────────────────────────────────────────

function buildRoomState(room: TournamentRoom, userId?: string) {
  const now = Date.now();
  const roundIdx = room.currentRound > 0 ? room.currentRound - 1 : -1;
  const elapsed = room.state === 'round_active'
    ? Math.min(now - room.phaseStartedAt, ROUND_DURATION)
    : null;

  // Build player list
  const players = room.players.map((p) => {
    // L1 fix: During round_active, expose the current round's reported multiplier
    // (null = not yet reported, so frontend uses local multiplier for self)
    const currentRoundMultiplier = (room.state === 'round_active' && roundIdx >= 0)
      ? (p.roundMultipliers[roundIdx] ?? null)
      : null;

    return {
      id: p.id,
      username: p.username,
      level: p.level,
      vipTier: p.vipTier,
      joinedAt: p.joinedAt,
      roundMultipliers: (room.state === 'round_results' || room.state === 'final_results')
        ? p.roundMultipliers
        : p.roundMultipliers.slice(0, roundIdx >= 0 ? roundIdx : 0), // Previous rounds only
      currentRoundMultiplier, // L1 fix: reported multiplier for current active round
      cumulativeScore: getCumulativeScore(p),
    };
  });

  // Sort by cumulative score during results phases
  if (room.state === 'round_results' || room.state === 'final_results') {
    players.sort((a, b) => b.cumulativeScore - a.cumulativeScore);
  }

  // Determine the winner for final results
  let winner = null;
  if (room.state === 'final_results' || room.state === 'closed') {
    const sorted = [...room.players].sort((a, b) => getCumulativeScore(b) - getCumulativeScore(a));
    if (sorted.length > 0) {
      winner = {
        id: sorted[0].id,
        username: sorted[0].username,
        cumulativeScore: getCumulativeScore(sorted[0]),
        payout: room.netPool,
      };
    }
  }

  const myPlayer = userId ? room.players.find(p => p.id === userId) : null;

  return {
    roomId: room.id,
    buyIn: room.buyIn,
    fee: room.fee,
    state: room.state,
    currentRound: room.currentRound,
    totalRounds: ROUNDS_PER_TOURNAMENT,
    phaseStartedAt: room.phaseStartedAt,
    phaseEndsAt: room.phaseEndsAt,
    countdownStartedAt: room.countdownStartedAt,
    players,
    playerCount: room.players.length,
    maxPlayers: MAX_PLAYERS,
    minPlayers: MIN_PLAYERS,
    grossPool: room.grossPool,
    netPool: room.netPool,
    elapsed,
    myPlayerId: myPlayer ? myPlayer.id : null,
    roundConfig: room.state === 'round_active' && roundIdx >= 0
      ? room.roundConfigs[roundIdx]
      : null,
    winner,
  };
}

// ─── Graceful Shutdown: Refund all active tournament players ─────────────────

async function refundAllActiveRooms() {
  console.log(`[Tournament] Shutdown: refunding ${rooms.size} active rooms...`);
  for (const room of rooms.values()) {
    if (room.state === 'closed' || room.settledAt) continue;

    for (const player of room.players) {
      try {
        const { WalletService } = await import('../modules/wallet/wallet.service.js');
        const walletService = new WalletService();
        // Full refund: payout = buyIn + fee
        await walletService.settlePayout(
          player.id,
          room.buyIn,
          room.fee,
          room.buyIn + room.fee, // Full refund
          'SOL',
          { type: 'battle' as const, id: `tournament-${room.id}-shutdown-refund` },
        );
        console.log(`[Tournament] Refunded ${player.username} (${player.id}) from room ${room.id}`);
      } catch (err) {
        console.error(`[Tournament] Failed to refund ${player.id} in room ${room.id}:`, err);
      }
    }
  }
  rooms.clear();
  console.log(`[Tournament] Shutdown refunds complete`);
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function battleRoutes(server: FastifyInstance) {

  // Start the tournament tick loop
  startTournamentLoop();

  // Register graceful shutdown handler
  server.addHook('onClose', async () => {
    if (loopTimer) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }
    await refundAllActiveRooms();
  });

  // ─── List Open Rooms ─────────────────────────────────────
  server.get('/rooms', { preHandler: [optionalAuth] }, async () => {
    const openRooms: any[] = [];

    for (const room of rooms.values()) {
      if (room.state !== 'waiting') continue;
      openRooms.push({
        roomId: room.id,
        buyIn: room.buyIn,
        playerCount: room.players.length,
        maxPlayers: MAX_PLAYERS,
        countdownStartedAt: room.countdownStartedAt,
        phaseEndsAt: room.phaseEndsAt,
        createdAt: room.createdAt,
      });
    }

    // Group by buy-in tier
    const tiers = BUYIN_TIERS.map(tier => ({
      buyIn: tier,
      label: `${tier / 1_000_000_000} SOL`,
      rooms: openRooms.filter(r => r.buyIn === tier),
      openCount: openRooms.filter(r => r.buyIn === tier).length,
    }));

    return { tiers, buyInOptions: BUYIN_TIERS };
  });

  // ─── Join / Create Room ──────────────────────────────────
  server.post('/join', { preHandler: [requireAuth], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = getAuthUser(request);

    const body = z.object({
      buyIn: z.number().int().refine(v => BUYIN_TIERS.includes(v), {
        message: 'Invalid buy-in tier',
      }),
    }).parse(request.body);

    // Check if player is already in an active room
    for (const room of rooms.values()) {
      if (room.state === 'closed') continue;
      if (room.players.some(p => p.id === user.userId)) {
        return reply.status(400).send({
          error: 'Already in a tournament',
          roomId: room.id,
        });
      }
    }

    // Find an existing waiting room at this buy-in, or create one
    let targetRoom: TournamentRoom | null = null;
    for (const room of rooms.values()) {
      if (room.state === 'waiting' && room.buyIn === body.buyIn && room.players.length < MAX_PLAYERS) {
        targetRoom = room;
        break;
      }
    }

    if (!targetRoom) {
      targetRoom = createRoom(body.buyIn);
      rooms.set(targetRoom.id, targetRoom);
      console.log(`[Tournament] New room ${targetRoom.id} created (${body.buyIn / 1_000_000_000} SOL)`);
    }

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

    // Lock funds
    const totalCost = targetRoom.buyIn + targetRoom.fee;

    try {
      const { WalletService } = await import('../modules/wallet/wallet.service.js');
      const walletService = new WalletService();
      await walletService.lockFunds(
        user.userId,
        totalCost,
        'SOL',
        { type: 'battle' as const, id: `tournament-${targetRoom.id}` },
      );
    } catch (err: any) {
      return reply.status(400).send({
        error: err.message || 'Insufficient balance',
      });
    }

    // Add player
    const player: TournamentPlayer = {
      id: user.userId,
      username,
      level,
      vipTier,
      joinedAt: Date.now(),
      roundMultipliers: [],
    };

    targetRoom.players.push(player);

    // M2 fix: Update pool preview (definitive pool is locked at round 1 start in startRound())
    targetRoom.grossPool = targetRoom.players.length * targetRoom.buyIn;
    targetRoom.netPool = Math.floor(targetRoom.grossPool * (1 - FEE_RATE));

    console.log(`[Tournament] ${username} joined room ${targetRoom.id} (${targetRoom.players.length}/${MAX_PLAYERS})`);

    return {
      success: true,
      ...buildRoomState(targetRoom, user.userId),
    };
  });

  // ─── Get Room State (poll) ───────────────────────────────
  server.get('/:roomId', { preHandler: [optionalAuth] }, async (request, reply) => {
    const { roomId } = request.params as { roomId: string };
    const user = (request as any).authUser;

    const room = rooms.get(roomId);
    if (!room) {
      return reply.status(404).send({ error: 'Room not found or closed' });
    }

    return buildRoomState(room, user?.userId);
  });

  // ─── Report Round Multiplier ─────────────────────────────
  // C2 FIX: Validate client multiplier within config bounds instead of re-simulating
  // (simulateRound is deterministic — same inputs = same output for ALL players,
  //  but the game is interactive: each player hits/misses different nodes)
  server.post('/:roomId/report', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = getAuthUser(request);
    const { roomId } = request.params as { roomId: string };

    const room = rooms.get(roomId);
    if (!room) {
      return reply.status(404).send({ error: 'Room not found' });
    }

    if (room.state !== 'round_active') {
      return reply.status(400).send({ error: 'Can only report during active round' });
    }

    const body = z.object({
      round: z.number().int().min(1).max(ROUNDS_PER_TOURNAMENT),
      finalMultiplier: z.number().min(0).max(100),
      nodesHit: z.number().int().min(0).optional(),
      nodesTotal: z.number().int().min(0).optional(),
    }).parse(request.body);

    if (body.round !== room.currentRound) {
      return reply.status(400).send({ error: 'Round mismatch' });
    }

    const player = room.players.find(p => p.id === user.userId);
    if (!player) {
      return reply.status(400).send({ error: 'Not a participant in this tournament' });
    }

    // Prevent double-reporting for the same round
    const roundIdx = room.currentRound - 1;
    if (player.roundMultipliers[roundIdx] !== null && player.roundMultipliers[roundIdx] !== undefined) {
      return { success: true, serverMultiplier: player.roundMultipliers[roundIdx] };
    }

    const roundConfig = room.roundConfigs[roundIdx];

    // Validate multiplier is within the config's allowed range
    // The max is bounded by engineConfig.maxFinalMultiplier (default ~10x)
    // The min is 0 (total loss from dividers/bombs)
    const maxAllowed = roundConfig?.engineConfig?.maxFinalMultiplier ?? DEFAULT_ENGINE_CONFIG.maxFinalMultiplier ?? 10;
    const validatedMultiplier = Math.max(0, Math.min(maxAllowed, body.finalMultiplier));

    // Sanity check: if reported multiplier was drastically different, log it
    if (Math.abs(validatedMultiplier - body.finalMultiplier) > 0.01) {
      console.warn(`[Tournament] Clamped multiplier for ${user.userId} in room ${roomId}: reported=${body.finalMultiplier}, clamped=${validatedMultiplier}`);
    }

    player.roundMultipliers[roundIdx] = validatedMultiplier;

    return { success: true, serverMultiplier: validatedMultiplier };
  });

  // ─── Leave Room (waiting phase only) ─────────────────────
  server.post('/:roomId/leave', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = getAuthUser(request);
    const { roomId } = request.params as { roomId: string };

    const room = rooms.get(roomId);
    if (!room) {
      return reply.status(404).send({ error: 'Room not found' });
    }

    if (room.state !== 'waiting') {
      return reply.status(400).send({ error: 'Can only leave during waiting phase' });
    }

    const playerIdx = room.players.findIndex(p => p.id === user.userId);
    if (playerIdx === -1) {
      return reply.status(400).send({ error: 'Not in this room' });
    }

    // Refund locked funds
    try {
      const { WalletService } = await import('../modules/wallet/wallet.service.js');
      const walletService = new WalletService();
      // Unlock by settling with full refund (payout = buyIn + fee, so net zero)
      await walletService.settlePayout(
        user.userId,
        room.buyIn,
        room.fee,
        room.buyIn + room.fee, // Full refund
        'SOL',
        { type: 'battle' as const, id: `tournament-${room.id}-refund` },
      );
    } catch (err) {
      console.error(`[Tournament] Refund error for ${user.userId}:`, err);
    }

    room.players.splice(playerIdx, 1);

    // Recalculate pool
    room.grossPool = room.players.length * room.buyIn;
    room.netPool = Math.floor(room.grossPool * (1 - FEE_RATE));

    // Reset countdown if under threshold
    if (room.players.length < MIN_PLAYERS) {
      room.countdownStartedAt = null;
      room.phaseEndsAt = room.createdAt + 300_000;
    }

    // Remove empty rooms
    if (room.players.length === 0) {
      rooms.delete(room.id);
      console.log(`[Tournament] Room ${room.id} removed (empty)`);
    }

    return { success: true };
  });

  // ─── Legacy: GET /current → redirect to rooms list ──────
  server.get('/current', { preHandler: [optionalAuth] }, async (request) => {
    const user = (request as any).authUser;

    // If user is in an active room, return that room's state
    if (user) {
      for (const room of rooms.values()) {
        if (room.state === 'closed') continue;
        const player = room.players.find(p => p.id === user.userId);
        if (player) {
          return buildRoomState(room, user.userId);
        }
      }
    }

    // Otherwise return the rooms list for backwards compat
    const openRooms: any[] = [];
    for (const room of rooms.values()) {
      if (room.state !== 'waiting') continue;
      openRooms.push({
        roomId: room.id,
        buyIn: room.buyIn,
        playerCount: room.players.length,
        maxPlayers: MAX_PLAYERS,
      });
    }

    return {
      phase: 'lobby',
      tiers: BUYIN_TIERS.map(tier => ({
        buyIn: tier,
        label: `${tier / 1_000_000_000} SOL`,
        rooms: openRooms.filter(r => r.buyIn === tier),
        openCount: openRooms.filter(r => r.buyIn === tier).length,
      })),
      buyInOptions: BUYIN_TIERS,
    };
  });

  // ─── Tournament History ─────────────────────────────────
  server.get('/history', { preHandler: [requireAuth] }, async (request) => {
    const userId = getAuthUser(request).userId;
    const { limit } = request.query as { limit?: string };

    const { getDb } = await import('../config/database.js');
    const { tournamentParticipants, tournaments } = await import('@tradingarena/db');
    const { eq, desc } = await import('drizzle-orm');
    const tdb = getDb();

    const participations = await tdb
      .select({
        odId: tournamentParticipants.id,
        odTournamentId: tournamentParticipants.tournamentId,
        finalRank: tournamentParticipants.finalRank,
        cumulativeScore: tournamentParticipants.cumulativeScore,
        payout: tournamentParticipants.payout,
        roundMultipliers: tournamentParticipants.roundMultipliers,
        tRoomId: tournaments.roomId,
        tBuyIn: tournaments.buyIn,
        tPlayerCount: tournaments.playerCount,
        tWinnerUsername: tournaments.winnerUsername,
        tNetPool: tournaments.netPool,
        tCreatedAt: tournaments.createdAt,
      })
      .from(tournamentParticipants)
      .innerJoin(tournaments, eq(tournamentParticipants.tournamentId, tournaments.id))
      .where(eq(tournamentParticipants.userId, userId))
      .orderBy(desc(tournaments.createdAt))
      .limit(parseInt(limit || '20'));

    return { data: participations };
  });

  // ─── Spectate a room (no auth needed) ──────────────────
  server.get('/:roomId/spectate', { preHandler: [optionalAuth] }, async (request, reply) => {
    const { roomId } = request.params as { roomId: string };
    const room = rooms.get(roomId);
    if (!room) {
      return reply.status(404).send({ error: 'Room not found or closed' });
    }

    // Return room state without myPlayerId (spectator view)
    return {
      ...buildRoomState(room),
      isSpectating: true,
      spectatorCount: 0, // Could track this with Redis in the future
    };
  });
}
