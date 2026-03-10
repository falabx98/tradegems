import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { desc, eq, and, gt, sql } from 'drizzle-orm';
import { requireAuth, getAuthUser, optionalAuth } from '../middleware/auth.js';
import { getDb } from '../config/database.js';
import { chatMessages, users, userProfiles } from '@tradingarena/db';

// Simple in-memory rate limiter: userId → last send timestamp
const rateLimitMap = new Map<string, number>();

// ─── Online Tracking ────────────────────────────────────────
// Track users who have polled chat recently (userId → lastSeenMs)
const onlineUsers = new Map<string, number>();
const ONLINE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function trackOnline(userId: string | null) {
  if (!userId) return;
  onlineUsers.set(userId, Date.now());
}

function getOnlineCount(): number {
  const cutoff = Date.now() - ONLINE_WINDOW_MS;
  let count = 0;
  for (const [uid, ts] of onlineUsers) {
    if (ts >= cutoff) {
      count++;
    } else {
      onlineUsers.delete(uid); // Clean up stale entries
    }
  }
  return count;
}

export async function chatRoutes(server: FastifyInstance) {
  const db = getDb();

  // ─── GET /messages — Fetch recent messages ──────────────────

  server.get('/messages', { preHandler: [optionalAuth] }, async (request) => {
    const query = z.object({
      channel: z.string().optional().default('global'),
      after: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    }).parse(request.query);

    // Track the requesting user as online
    try {
      const authUser = getAuthUser(request);
      trackOnline(authUser.userId);
    } catch {
      // Not authenticated, skip tracking
    }

    let msgs;
    if (query.after) {
      msgs = await db
        .select({
          id: chatMessages.id,
          userId: chatMessages.userId,
          username: chatMessages.username,
          message: chatMessages.message,
          channel: chatMessages.channel,
          createdAt: chatMessages.createdAt,
          avatar: chatMessages.avatar,
          level: chatMessages.level,
        })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.channel, query.channel),
            gt(chatMessages.createdAt, new Date(query.after)),
          ),
        )
        .orderBy(desc(chatMessages.createdAt))
        .limit(query.limit);
    } else {
      msgs = await db
        .select({
          id: chatMessages.id,
          userId: chatMessages.userId,
          username: chatMessages.username,
          message: chatMessages.message,
          channel: chatMessages.channel,
          createdAt: chatMessages.createdAt,
          avatar: chatMessages.avatar,
          level: chatMessages.level,
        })
        .from(chatMessages)
        .where(eq(chatMessages.channel, query.channel))
        .orderBy(desc(chatMessages.createdAt))
        .limit(query.limit);
    }

    // Return in chronological order (oldest first)
    return {
      messages: msgs.reverse(),
      onlineCount: getOnlineCount(),
    };
  });

  // ─── POST /messages — Send a message ────────────────────────

  server.post('/messages', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = getAuthUser(request);
    const body = z.object({
      message: z.string().trim().min(1).max(200),
      channel: z.string().optional().default('global'),
    }).parse(request.body);

    // Track as online
    trackOnline(user.userId);

    // Rate limit: 1 message per second
    const now = Date.now();
    const lastSend = rateLimitMap.get(user.userId) || 0;
    if (now - lastSend < 1000) {
      return reply.status(429).send({ error: { code: 'RATE_LIMITED', message: 'Too fast! Wait a moment before sending.' } });
    }
    rateLimitMap.set(user.userId, now);

    // Anti-spam: reject if last 3 messages from this user are identical
    const recentOwn = await db
      .select({ message: chatMessages.message })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.userId, user.userId),
          eq(chatMessages.channel, body.channel),
        ),
      )
      .orderBy(desc(chatMessages.createdAt))
      .limit(3);

    if (recentOwn.length >= 3 && recentOwn.every(m => m.message === body.message)) {
      return reply.status(400).send({ error: { code: 'SPAM_DETECTED', message: 'Please don\'t spam the same message.' } });
    }

    // Get username, level, and avatar from DB
    let username = 'Anonymous';
    let avatar: string | null = null;
    let level = 1;
    try {
      const dbUser = await db
        .select({
          username: users.username,
          level: users.level,
        })
        .from(users)
        .where(eq(users.id, user.userId))
        .then(r => r[0]);
      if (dbUser) {
        username = dbUser.username;
        level = dbUser.level;
      }

      const profile = await db
        .select({ avatarUrl: userProfiles.avatarUrl })
        .from(userProfiles)
        .where(eq(userProfiles.userId, user.userId))
        .then(r => r[0]);
      if (profile?.avatarUrl) {
        avatar = profile.avatarUrl;
      }
    } catch {}

    // Insert message with avatar and level
    const [msg] = await db.insert(chatMessages).values({
      userId: user.userId,
      username,
      message: body.message,
      channel: body.channel,
      avatar,
      level,
    }).returning();

    return msg;
  });

  // ─── GET /online — Get online count only ─────────────────────

  server.get('/online', async () => {
    return { onlineCount: getOnlineCount() };
  });
}
