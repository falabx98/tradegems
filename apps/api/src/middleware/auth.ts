import type { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from './errorHandler.js';

export interface AuthUser {
  userId: string;
  role: string;
  sessionId: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: string; sid: string };
    user: AuthUser;
  }
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  try {
    await request.jwtVerify();
    const payload = request.user as unknown as { sub: string; role: string; sid: string };
    const authUser: AuthUser = {
      userId: payload.sub,
      role: payload.role,
      sessionId: payload.sid,
    };
    (request as any).authUser = authUser;

    // M7+H2: Check session revocation via Redis cache (falls back to DB)
    // Redis key `revoked:session:{id}` is set when session is revoked (see auth.service.ts)
    // Cache miss → check DB → cache result for 60s
    try {
      const { getRedis } = await import('../config/redis.js');
      const redis = getRedis();
      const cacheKey = `revoked:session:${authUser.sessionId}`;
      const cached = await redis.get(cacheKey);

      if (cached === '1') {
        throw new AppError(401, 'SESSION_REVOKED', 'Session has been revoked');
      }

      if (cached === null) {
        // Cache miss — check DB and cache the result
        const { getDb } = await import('../config/database.js');
        const { userSessions } = await import('@tradingarena/db');
        const { eq } = await import('drizzle-orm');
        const db = getDb();
        const session = await db.query.userSessions.findFirst({
          where: eq(userSessions.id, authUser.sessionId),
          columns: { revokedAt: true },
        });
        if (session?.revokedAt) {
          await redis.set(cacheKey, '1', 'EX', 300); // Cache revoked for 5 min
          throw new AppError(401, 'SESSION_REVOKED', 'Session has been revoked');
        }
        // Cache "not revoked" for 60s to reduce DB hits
        await redis.set(cacheKey, '0', 'EX', 60);
      }
      // cached === '0' means valid session (cached), do nothing
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Fail closed: reject request if session validation is unavailable
      request.log.error({ err }, 'Session revocation check failed — blocking request');
      throw new AppError(503, 'AUTH_UNAVAILABLE', 'Authentication service temporarily unavailable');
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    request.log.warn({ err }, 'JWT verification failed');
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired token');
  }
}

export function getAuthUser(request: FastifyRequest): AuthUser {
  return (request as any).authUser;
}

export async function optionalAuth(request: FastifyRequest, _reply: FastifyReply) {
  try {
    await request.jwtVerify();
    const payload = request.user as unknown as { sub: string; role: string; sid: string };
    const authUser: AuthUser = {
      userId: payload.sub,
      role: payload.role,
      sessionId: payload.sid,
    };

    // M9 fix: Check session revocation (on failure, clear identity instead of blocking)
    try {
      const { getRedis } = await import('../config/redis.js');
      const redis = getRedis();
      const cacheKey = `revoked:session:${authUser.sessionId}`;
      const cached = await redis.get(cacheKey);
      if (cached === '1') {
        (request as any).authUser = null;
        return;
      }
      if (cached === null) {
        const { getDb } = await import('../config/database.js');
        const { userSessions } = await import('@tradingarena/db');
        const { eq } = await import('drizzle-orm');
        const db = getDb();
        const session = await db.query.userSessions.findFirst({
          where: eq(userSessions.id, authUser.sessionId),
          columns: { revokedAt: true },
        });
        if (session?.revokedAt) {
          await redis.set(cacheKey, '1', 'EX', 300);
          (request as any).authUser = null;
          return;
        }
        await redis.set(cacheKey, '0', 'EX', 60);
      }
    } catch {
      // On error, still allow optionalAuth to pass (degrade gracefully)
    }

    (request as any).authUser = authUser;
  } catch {
    // No valid token — that's fine for optional auth
    (request as any).authUser = null;
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  const user = getAuthUser(request);
  if (user.role !== 'admin' && user.role !== 'superadmin') {
    throw new AppError(403, 'FORBIDDEN', 'Admin access required');
  }
}
