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
    (request as any).authUser = {
      userId: payload.sub,
      role: payload.role,
      sessionId: payload.sid,
    } as AuthUser;
  } catch (err) {
    request.log.warn({ err }, 'JWT verification failed');
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired token');
  }
}

export function getAuthUser(request: FastifyRequest): AuthUser {
  return (request as any).authUser;
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  const user = getAuthUser(request);
  if (user.role !== 'admin' && user.role !== 'superadmin') {
    throw new AppError(403, 'FORBIDDEN', 'Admin access required');
  }
}
