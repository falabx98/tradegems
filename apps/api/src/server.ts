import crypto from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { getRedis } from './config/redis.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRoutes } from './routes/auth.routes.js';
import { userRoutes } from './routes/user.routes.js';
import { walletRoutes } from './routes/wallet.routes.js';
import { gameplayRoutes } from './routes/gameplay.routes.js';
import { rewardsRoutes } from './routes/rewards.routes.js';
import { leaderboardRoutes } from './routes/leaderboard.routes.js';
import { adminRoutes } from './routes/admin.routes.js';

export async function buildServer() {
  const server = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
    genReqId: () => crypto.randomUUID(),
  });

  // ─── Plugins ─────────────────────────────────────────────
  await server.register(cors, {
    origin: env.NODE_ENV === 'production'
      ? ['https://tradingarena.gg']
      : true,
    credentials: true,
  });

  await server.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_EXPIRY },
  });

  await server.register(cookie, {
    secret: env.JWT_SECRET,
    parseOptions: {},
  });

  await server.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis: getRedis(),
  });

  // ─── Error Handler ───────────────────────────────────────
  server.setErrorHandler(errorHandler as any);

  // ─── Health Check ────────────────────────────────────────
  server.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.0.1',
  }));

  // ─── Routes ──────────────────────────────────────────────
  await server.register(authRoutes, { prefix: '/v1/auth' });
  await server.register(userRoutes, { prefix: '/v1/users' });
  await server.register(walletRoutes, { prefix: '/v1/wallet' });
  await server.register(gameplayRoutes, { prefix: '/v1/rounds' });
  await server.register(rewardsRoutes, { prefix: '/v1/rewards' });
  await server.register(leaderboardRoutes, { prefix: '/v1/leaderboards' });
  await server.register(adminRoutes, { prefix: '/v1/admin' });

  return server;
}
