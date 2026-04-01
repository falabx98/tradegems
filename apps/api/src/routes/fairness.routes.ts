import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { rounds, roundNodes, betResults, bets } from '@tradingarena/db';
import { getDb } from '../config/database.js';
import { requireAuth, getAuthUser } from '../middleware/auth.js';

export async function fairnessRoutes(server: FastifyInstance) {
  const db = getDb();

  // Public: Verify a specific round's fairness data
  server.get('/:roundId', { preHandler: [requireAuth] }, async (request, reply) => {
    const { roundId } = request.params as { roundId: string };
    const userId = getAuthUser(request).userId;

    const round = await db.query.rounds.findFirst({ where: eq(rounds.id, roundId) });
    if (!round) {
      return reply.status(404).send({ error: 'Round not found' });
    }

    // Only reveal seed data for resolved rounds
    if (round.status !== 'resolved') {
      return {
        id: round.id,
        status: round.status,
        seedCommitment: round.seedCommitment,
        message: 'Round has not been resolved yet. Seed will be revealed after resolution.',
      };
    }

    // Get the user's bet result for this round (if any) — filter by userId to prevent privacy leak
    const userResult = await db.query.betResults.findFirst({
      where: and(eq(betResults.roundId, roundId), eq(betResults.userId, userId)),
    });

    // Get nodes for the round
    const nodes = await db.select().from(roundNodes).where(eq(roundNodes.roundId, roundId)).orderBy(roundNodes.spawnTimeMs);

    return {
      id: round.id,
      status: round.status,
      mode: round.mode,
      // Seed data (revealed after resolution)
      serverSeed: round.seed,
      serverSeedHash: round.seedCommitment,
      clientSeed: await (async () => {
        try {
          const { getUserSeedState } = await import('../utils/provablyFair.js');
          const state = await getUserSeedState(userId);
          return state.clientSeed;
        } catch { return `player-${userId}`; }
      })(),
      roundSeed: round.seed,
      nonce: await (async () => {
        try {
          const { getUserSeedState } = await import('../utils/provablyFair.js');
          const state = await getUserSeedState(userId);
          return state.nonce;
        } catch { return 0; }
      })(),
      resultHash: round.seedCommitment,
      // Round metadata
      configSnapshot: round.configSnapshot,
      durationMs: round.durationMs,
      chartPath: round.chartPath,
      nodeCount: nodes.length,
      // User's result
      finalMultiplier: userResult ? Number(userResult.finalMultiplier) : null,
      payoutAmount: userResult ? Number(userResult.payoutAmount) : null,
      nodesHit: userResult?.nodesHit ?? null,
      // Timestamps
      createdAt: round.createdAt?.toISOString(),
      resolvedAt: round.resolvedAt?.toISOString(),
    };
  });

  // ─── User Seed State (view + rotate) ──────────────────────

  server.get('/seed-state', { preHandler: [requireAuth] }, async (request) => {
    const userId = getAuthUser(request).userId;
    const { getUserSeedState } = await import('../utils/provablyFair.js');
    const state = await getUserSeedState(userId);
    return { data: state };
  });

  server.post('/rotate-seed', { preHandler: [requireAuth] }, async (request) => {
    const userId = getAuthUser(request).userId;
    const { z } = await import('zod');
    const body = z.object({ newSeed: z.string().min(1).max(64).optional() }).safeParse(request.body);
    const newSeed = body.success ? body.data.newSeed : undefined;
    const { rotateClientSeed } = await import('../utils/provablyFair.js');
    const state = await rotateClientSeed(userId, newSeed);
    return { data: state, message: 'Client seed rotated. Nonce reset to 0.' };
  });
}
