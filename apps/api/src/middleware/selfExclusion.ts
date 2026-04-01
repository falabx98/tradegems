/**
 * Self-Exclusion Middleware — blocks game access during active self-exclusion.
 * Attach to all game bet/start/join endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../config/database.js';
import { selfExclusions } from '@tradingarena/db';
import { getAuthUser } from './auth.js';
import { AppError } from './errorHandler.js';

export async function requireNotExcluded(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { userId } = getAuthUser(request);
    const db = getDb();

    // Check for active, non-expired exclusion
    const exclusion = await db.query.selfExclusions.findFirst({
      where: and(
        eq(selfExclusions.userId, userId),
        eq(selfExclusions.active, true),
      ),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    if (!exclusion) return; // No exclusion — proceed

    // Check if time-based exclusion has expired
    if (exclusion.endsAt && new Date() >= exclusion.endsAt) {
      // Auto-deactivate expired exclusion
      await db.update(selfExclusions).set({ active: false }).where(eq(selfExclusions.id, exclusion.id));
      return; // Expired — proceed
    }

    // Active exclusion — block
    const endsStr = exclusion.endsAt
      ? `Your self-exclusion is active until ${exclusion.endsAt.toISOString().split('T')[0]}.`
      : 'Your permanent self-exclusion is active. Contact support to lift it.';

    throw new AppError(403, 'SELF_EXCLUDED', `${endsStr} You can still withdraw your balance.`);
  } catch (err: any) {
    if (err?.code === 'SELF_EXCLUDED') throw err;
    // Don't block gameplay if exclusion check itself fails
    console.error('[SelfExclusion] Check failed, allowing through:', err.message);
  }
}
