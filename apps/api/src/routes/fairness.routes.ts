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
      clientSeed: `player-${userId}`,
      roundSeed: round.seed,
      nonce: 0,
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
}
