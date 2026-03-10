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
import { battleRoutes } from './routes/battle.routes.js';
import { referralRoutes } from './routes/referral.routes.js';
import { chatRoutes } from './routes/chat.routes.js';

export async function buildServer() {
  const server = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 1_048_576, // 1 MB for avatar uploads (base64)
  });

  // ─── Plugins ─────────────────────────────────────────────
  await server.register(cors, {
    origin: env.CORS_ORIGINS
      ? env.CORS_ORIGINS.split(',').map(s => s.trim())
      : env.NODE_ENV === 'production'
        ? false
        : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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

  // ─── SOL Price Proxy (avoids CoinGecko CORS) ────────────
  let cachedSolPrice = { usd: 0, ts: 0 };
  server.get('/v1/sol-price', async () => {
    const now = Date.now();
    if (now - cachedSolPrice.ts < 30_000 && cachedSolPrice.usd > 0) {
      return { solana: { usd: cachedSolPrice.usd } };
    }
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const data = await res.json() as { solana?: { usd?: number } };
      if (data?.solana?.usd) {
        cachedSolPrice = { usd: data.solana.usd, ts: now };
      }
      return data;
    } catch {
      return { solana: { usd: cachedSolPrice.usd || 0 } };
    }
  });

  // ─── Routes ──────────────────────────────────────────────
  await server.register(authRoutes, { prefix: '/v1/auth' });
  await server.register(userRoutes, { prefix: '/v1/users' });
  await server.register(walletRoutes, { prefix: '/v1/wallet' });
  await server.register(gameplayRoutes, { prefix: '/v1/rounds' });
  await server.register(rewardsRoutes, { prefix: '/v1/rewards' });
  await server.register(leaderboardRoutes, { prefix: '/v1/leaderboards' });
  await server.register(adminRoutes, { prefix: '/v1/admin' });
  await server.register(battleRoutes, { prefix: '/v1/battles' });
  await server.register(referralRoutes, { prefix: '/v1/referrals' });
  await server.register(chatRoutes, { prefix: '/v1/chat' });

  return server;
}
