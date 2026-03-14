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
import { referralRoutes } from './routes/referral.routes.js';
import { chatRoutes } from './routes/chat.routes.js';
import { tipRoutes } from './routes/tip.routes.js';
import { startDepositWorker } from './workers/depositConfirmation.worker.js';
import { startBotEngine } from './workers/botEngine.worker.js';
import { startLotteryDrawWorker } from './workers/lotteryDraw.worker.js';
import { startTradingSimWorker } from './workers/tradingSim.worker.js';
import { activityRoutes } from './routes/activity.routes.js';
import { initSentry } from './config/sentry.js';
import { fairnessRoutes } from './routes/fairness.routes.js';
import { seasonRoutes } from './routes/season.routes.js';
import { predictionRoutes } from './routes/prediction.routes.js';
import { lotteryRoutes } from './routes/lottery.routes.js';
import { tradingSimRoutes } from './routes/trading-sim.routes.js';
import { candleflipRoutes } from './routes/candleflip.routes.js';
import { rugGameRoutes } from './routes/rug-game.routes.js';
import { startRugRoundManager } from './modules/round-manager/rugRoundManager.js';
import { startCandleflipRoundManager } from './modules/round-manager/candleflipRoundManager.js';


export async function buildServer() {
  // Initialize Sentry error tracking
  initSentry();

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
      : ['https://tradegems.app', 'https://tradesol-web.vercel.app', 'http://localhost:5173'],
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

  // ─── Public Config ──────────────────────────────────────
  server.get('/v1/config', async () => ({
    feeRate: env.PLATFORM_FEE_RATE,
    minBetLamports: 1_000_000,
    maxBetLamports: 10_000_000_000,
    buyInTiers: [100_000_000, 250_000_000, 500_000_000, 1_000_000_000, 2_000_000_000],
    tournamentRounds: 3,
    roundDurationMs: 15000,
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
  await server.register(referralRoutes, { prefix: '/v1/referrals' });
  await server.register(chatRoutes, { prefix: '/v1/chat' });
  await server.register(tipRoutes, { prefix: '/v1/tips' });
  await server.register(fairnessRoutes, { prefix: '/v1/fairness' });
  await server.register(seasonRoutes, { prefix: '/v1/season' });
  await server.register(predictionRoutes, { prefix: '/v1/predictions' });
  await server.register(activityRoutes, { prefix: '/v1/activity' });
  await server.register(lotteryRoutes, { prefix: '/v1/lottery' });
  await server.register(tradingSimRoutes, { prefix: '/v1/trading-sim' });
  await server.register(candleflipRoutes, { prefix: '/v1/candleflip' });
  await server.register(rugGameRoutes, { prefix: '/v1/rug-game' });

  // Start round managers
  startRugRoundManager();
  startCandleflipRoundManager();

  // Start background workers
  startDepositWorker();
  startBotEngine();
  startLotteryDrawWorker();
  startTradingSimWorker();

  return server;
}
