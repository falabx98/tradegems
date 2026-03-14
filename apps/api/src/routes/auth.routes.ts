import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, or } from 'drizzle-orm';
import { AuthService } from '../modules/auth/auth.service.js';
import { ReferralService } from '../modules/referral/referral.service.js';
import { requireAuth, getAuthUser } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { env } from '../config/env.js';

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(128),
  referralCode: z.string().max(20).optional(),
});

const loginSchema = z.object({
  email: z.string().min(1), // Can be email or username
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
  server.post('/register', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const { userId } = await authService.register(body);

    // Link referral if code provided
    if (body.referralCode) {
      try {
        const referralService = new ReferralService();
        await referralService.linkReferral(userId, body.referralCode);
      } catch {
        // Don't fail registration if referral code is invalid
      }
    }

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
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return reply.status(201).send({
      accessToken,
      expiresIn: 3600, // 15 min
      userId,
    });
  });

  // ─── Login ───────────────────────────────────────────────
  server.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
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
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return { accessToken, expiresIn: 3600, userId };
  });

  // ─── Refresh ─────────────────────────────────────────────
  server.post('/refresh', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
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

    // Set rotated refresh token cookie (M5 fix)
    reply.setCookie('refreshToken', result.newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return { accessToken, expiresIn: 3600 };
  });

  // ─── Logout ──────────────────────────────────────────────
  server.post('/logout', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = getAuthUser(request);
    await authService.revokeSession(user.sessionId);
    reply.clearCookie('refreshToken', { path: '/' });
    return { success: true };
  });

  // ─── Set Password (for wallet-only users) ───────────────
  server.post('/set-password', { preHandler: [requireAuth], config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request) => {
    const userId = getAuthUser(request).userId;
    const body = z.object({
      email: z.string().email().optional(),
      password: z.string().min(8).max(128),
    }).parse(request.body);
    return authService.setPassword(userId, body);
  });

  // ─── Secret Admin Setup (one-time) ──────────────────────
  server.post('/setup-admin', { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = z.object({
      setupKey: z.string(),
      username: z.string().min(3).max(20),
      email: z.string().email(),
      password: z.string().min(8),
    }).parse(request.body);

    // Setup key from env — refuses if not configured
    const validKey = env.ADMIN_SETUP_KEY;
    if (!validKey || body.setupKey !== validKey) {
      throw new AppError(403, 'FORBIDDEN', 'Invalid setup key');
    }

    const db = (await import('../config/database.js')).getDb();
    const { users, userProfiles, balances } = await import('@tradingarena/db');
    const argon2 = await import('argon2');

    // Check if user already exists
    let user = await db.query.users.findFirst({
      where: or(
        eq(users.username, body.username),
        eq(users.email, body.email),
      ),
    });

    if (user) {
      // Promote existing user to superadmin + set password
      const passwordHash = await argon2.hash(body.password);
      await db.update(users)
        .set({ role: 'superadmin', passwordHash, email: body.email })
        .where(eq(users.id, user.id));
    } else {
      // Create new superadmin account
      const passwordHash = await argon2.hash(body.password);
      const [newUser] = await db.insert(users).values({
        email: body.email,
        username: body.username,
        passwordHash,
        role: 'superadmin',
      }).returning();
      user = newUser;

      await db.insert(userProfiles).values({ userId: user.id, avatarUrl: '/avatars/pepe_01_emerald.png' });
      await db.insert(balances).values({ userId: user.id, asset: 'SOL', availableAmount: 0, lockedAmount: 0, pendingAmount: 0 });
    }

    return { success: true, username: body.username, role: 'superadmin' };
  });

  // ─── Wallet Auth ─────────────────────────────────────────
  server.get('/wallet/challenge', async (request) => {
    const { address } = request.query as { address: string };
    if (!address) throw new AppError(400, 'MISSING_ADDRESS', 'Wallet address required');
    return authService.createWalletChallenge(address);
  });

  server.post('/wallet/verify', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
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
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.status(isNew ? 201 : 200).send({
      accessToken,
      expiresIn: 3600,
      userId,
      isNewAccount: isNew,
    });
  });
}
