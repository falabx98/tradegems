import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { requireAuth, getAuthUser } from '../middleware/auth.js';
import { getDb } from '../config/database.js';
import { userLimits, selfExclusions } from '@tradingarena/db';

export async function responsibleGamblingRoutes(server: FastifyInstance) {
  server.addHook('preHandler', requireAuth);

  // ─── Get Limits ────────────────────────────────────────────
  server.get('/limits', async (request) => {
    const { userId } = getAuthUser(request);
    const db = getDb();
    const limits = await db.select().from(userLimits).where(eq(userLimits.userId, userId));
    return { limits };
  });

  // ─── Set/Update Limit ──────────────────────────────────────
  server.put('/limits', async (request) => {
    const { userId } = getAuthUser(request);
    const body = z.object({
      limitType: z.enum(['daily_deposit', 'weekly_deposit', 'monthly_deposit', 'daily_loss']),
      amount: z.number().int().positive(), // lamports
    }).parse(request.body);

    const db = getDb();

    // Check existing limit
    const existing = await db.query.userLimits.findFirst({
      where: and(eq(userLimits.userId, userId), eq(userLimits.limitType, body.limitType)),
    });

    if (!existing) {
      // No existing limit — set immediately
      await db.insert(userLimits).values({
        userId,
        limitType: body.limitType,
        amount: body.amount,
      });
      return { success: true, message: 'Limit set', effectiveNow: true };
    }

    if (body.amount <= existing.amount) {
      // Lowering limit — effective immediately (safer for user)
      await db.update(userLimits).set({
        amount: body.amount,
        pendingAmount: null,
        pendingEffectiveAt: null,
        effectiveFrom: new Date(),
      }).where(eq(userLimits.id, existing.id));
      return { success: true, message: 'Limit lowered immediately', effectiveNow: true };
    }

    // Raising limit — 24h cooling period
    const effectiveAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.update(userLimits).set({
      pendingAmount: body.amount,
      pendingEffectiveAt: effectiveAt,
    }).where(eq(userLimits.id, existing.id));
    return {
      success: true,
      message: 'Limit increase pending. Effective in 24 hours.',
      effectiveNow: false,
      effectiveAt: effectiveAt.toISOString(),
    };
  });

  // ─── Remove Limit ─────────────────────────────────────────
  server.delete('/limits/:limitType', async (request) => {
    const { userId } = getAuthUser(request);
    const { limitType } = request.params as { limitType: string };
    const db = getDb();
    await db.delete(userLimits).where(
      and(eq(userLimits.userId, userId), eq(userLimits.limitType, limitType))
    );
    return { success: true };
  });

  // ─── Get Self-Exclusion Status ─────────────────────────────
  server.get('/self-exclusion', async (request) => {
    const { userId } = getAuthUser(request);
    const db = getDb();
    const exclusion = await db.query.selfExclusions.findFirst({
      where: and(eq(selfExclusions.userId, userId), eq(selfExclusions.active, true)),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    if (!exclusion) return { active: false };

    // Auto-deactivate if expired
    if (exclusion.endsAt && new Date() >= exclusion.endsAt) {
      await db.update(selfExclusions).set({ active: false }).where(eq(selfExclusions.id, exclusion.id));
      return { active: false };
    }

    return {
      active: true,
      type: exclusion.exclusionType,
      startsAt: exclusion.startsAt.toISOString(),
      endsAt: exclusion.endsAt?.toISOString() ?? null,
    };
  });

  // ─── Self-Exclude ──────────────────────────────────────────
  server.post('/self-exclude', async (request) => {
    const { userId } = getAuthUser(request);
    const body = z.object({
      type: z.enum(['24h', '7d', '30d', 'permanent']),
      confirm: z.literal(true),
      confirmText: z.string().optional(), // Required for permanent
    }).parse(request.body);

    if (body.type === 'permanent' && body.confirmText !== 'I understand this is permanent') {
      return { success: false, message: 'Permanent exclusion requires confirmation text: "I understand this is permanent"' };
    }

    const db = getDb();

    // Deactivate any existing exclusion
    await db.update(selfExclusions)
      .set({ active: false })
      .where(and(eq(selfExclusions.userId, userId), eq(selfExclusions.active, true)));

    // Calculate end date
    let endsAt: Date | null = null;
    const now = new Date();
    if (body.type === '24h') endsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    else if (body.type === '7d') endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    else if (body.type === '30d') endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    // permanent = null endsAt

    await db.insert(selfExclusions).values({
      userId,
      exclusionType: body.type,
      startsAt: now,
      endsAt,
      active: true,
    });

    return {
      success: true,
      message: body.type === 'permanent'
        ? 'Permanent self-exclusion activated. Contact support to lift it.'
        : `Self-exclusion activated for ${body.type}. You can still withdraw your balance.`,
      endsAt: endsAt?.toISOString() ?? null,
    };
  });
}
