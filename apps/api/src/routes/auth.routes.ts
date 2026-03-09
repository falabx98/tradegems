import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../modules/auth/auth.service.js';
import { requireAuth, getAuthUser } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const walletVerifySchema = z.object({
  address: z.string().min(32).max(64),
  signature: z.string(),
  nonce: z.string(),
});

export async function authRoutes(server: FastifyInstance) {
  const authService = new AuthService();

  // ─── Register ────────────────────────────────────────────
  server.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const { userId } = await authService.register(body);
    const { sessionId, refreshToken } = await authService.createSession(userId, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    const accessToken = server.jwt.sign(
      { sub: userId, role: 'player', sid: sessionId },
    );

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/v1/auth',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return reply.status(201).send({
      accessToken,
      expiresIn: 900, // 15 min
      userId,
    });
  });

  // ─── Login ───────────────────────────────────────────────
  server.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const { userId, role } = await authService.login(body);
    const { sessionId, refreshToken } = await authService.createSession(userId, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    const accessToken = server.jwt.sign(
      { sub: userId, role, sid: sessionId },
    );

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/v1/auth',
      maxAge: 7 * 24 * 60 * 60,
    });

    return { accessToken, expiresIn: 900, userId };
  });

  // ─── Refresh ─────────────────────────────────────────────
  server.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies.refreshToken;
    if (!refreshToken) {
      throw new AppError(401, 'NO_REFRESH_TOKEN', 'No refresh token provided');
    }

    const result = await authService.refreshSession(refreshToken);
    if (!result) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
    }

    const accessToken = server.jwt.sign(
      { sub: result.userId, role: result.role, sid: result.sessionId },
    );

    return { accessToken, expiresIn: 900 };
  });

  // ─── Logout ──────────────────────────────────────────────
  server.post('/logout', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = getAuthUser(request);
    await authService.revokeSession(user.sessionId);
    reply.clearCookie('refreshToken', { path: '/v1/auth' });
    return { success: true };
  });

  // ─── Wallet Auth ─────────────────────────────────────────
  server.get('/wallet/challenge', async (request) => {
    const { address } = request.query as { address: string };
    if (!address) throw new AppError(400, 'MISSING_ADDRESS', 'Wallet address required');
    return authService.createWalletChallenge(address);
  });

  server.post('/wallet/verify', async (request, reply) => {
    const body = walletVerifySchema.parse(request.body);
    const { userId, role, isNew } = await authService.verifyWalletSignature(
      body.address, body.signature, body.nonce,
    );

    const { sessionId, refreshToken } = await authService.createSession(userId, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    const accessToken = server.jwt.sign(
      { sub: userId, role, sid: sessionId },
    );

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/v1/auth',
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.status(isNew ? 201 : 200).send({
      accessToken,
      expiresIn: 900,
      userId,
      isNewAccount: isNew,
    });
  });
}
