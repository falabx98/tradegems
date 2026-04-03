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
import { startDepositMonitor } from './workers/depositMonitor.worker.js';
import { startBotEngine } from './workers/botEngine.worker.js';
import { startLotteryDrawWorker } from './workers/lotteryDraw.worker.js';
import { startTradingSimWorker } from './workers/tradingSim.worker.js';
import { activityRoutes } from './routes/activity.routes.js';
import { initSentry } from './config/sentry.js';
import { fairnessRoutes } from './routes/fairness.routes.js';
import { seasonRoutes } from './routes/season.routes.js';
import { predictionRoutes, predictionPublicRoutes } from './routes/prediction.routes.js';
import { lotteryRoutes } from './routes/lottery.routes.js';
import { tradingSimRoutes } from './routes/trading-sim.routes.js';
import { candleflipRoutes } from './routes/candleflip.routes.js';
import { rugGameRoutes } from './routes/rug-game.routes.js';
import { minesRoutes } from './routes/mines.routes.js';
import { missionsRoutes } from './routes/missions.routes.js';
import { startRugRoundManager } from './modules/round-manager/rugRoundManager.js';
import { startCandleflipRoundManager } from './modules/round-manager/candleflipRoundManager.js';
import { startSweepWorker } from './workers/sweepWorker.js';
import { startOrphanCleanupWorker } from './workers/orphanCleanup.worker.js';
import { startWeeklyRaceWorker } from './workers/weeklyRace.worker.js';
import { weeklyRaceRoutes, weeklyRaceAdminRoutes } from './routes/weeklyRace.routes.js';


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
  // CORS: production domains are always included; localhost only in dev/staging
  // env.CORS_ORIGINS can add extra domains but never removes the core set
  const coreOrigins = [
    'https://tradegems.gg',
    'https://www.tradegems.gg',
    ...(env.NODE_ENV !== 'production' ? [
      'http://localhost:5173',
      'http://localhost:3000',
    ] : []),
  ];
  const extraOrigins = env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const allOrigins = [...new Set([...coreOrigins, ...extraOrigins])];

  await server.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return cb(null, true);
      // Check exact match or Vercel preview pattern
      if (allOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
        return cb(null, true);
      }
      cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await server.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_EXPIRY },
  });

  await server.register(cookie, {
    secret: crypto.createHash('sha256').update('cookie:' + env.JWT_SECRET).digest('hex'),
    parseOptions: {},
  });

  await server.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis: getRedis(),
  });

  // ─── Request Performance Monitoring ─────────────────────
  const { recordRequestMetric } = await import('./utils/perfMonitor.js');
  server.addHook('onResponse', (request, reply, done) => {
    // Normalize route pattern (remove UUIDs for grouping)
    const route = (request.routeOptions?.url || request.url || 'unknown')
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id');
    recordRequestMetric(route, request.method, reply.statusCode, reply.elapsedTime, request.id);
    done();
  });

  // ─── Security Headers ───────────────────────────────────
  server.addHook('onSend', (request, reply, _payload, done) => {
    reply.header('X-Request-Id', request.id);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '0');
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    done();
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
    maxBetLamports: env.MAX_BET_LAMPORTS,
    buyInTiers: [100_000_000, 250_000_000, 500_000_000, 1_000_000_000, 2_000_000_000],
    tournamentRounds: 3,
    roundDurationMs: 15000,
  }));

  // ─── SOL Price Proxy (avoids CoinGecko CORS) ────────────
  let cachedSolPrice = { usd: 0, ts: 0 };
  let solPriceFetchPromise: Promise<any> | null = null;
  server.get('/v1/sol-price', async () => {
    const now = Date.now();
    if (now - cachedSolPrice.ts < 30_000 && cachedSolPrice.usd > 0) {
      return { solana: { usd: cachedSolPrice.usd } };
    }
    // Coalesce concurrent requests to avoid thundering herd
    if (!solPriceFetchPromise) {
      solPriceFetchPromise = (async () => {
        try {
          const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
          const data = await res.json() as { solana?: { usd?: number } };
          if (data?.solana?.usd) {
            cachedSolPrice = { usd: data.solana.usd, ts: Date.now() };
          }
          return data;
        } catch {
          return { solana: { usd: cachedSolPrice.usd || 0 } };
        } finally {
          solPriceFetchPromise = null;
        }
      })();
    }
    return solPriceFetchPromise;
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
  await server.register(predictionPublicRoutes, { prefix: '/v1/predictions' });
  await server.register(activityRoutes, { prefix: '/v1/activity' });
  await server.register(lotteryRoutes, { prefix: '/v1/lottery' });
  await server.register(tradingSimRoutes, { prefix: '/v1/trading-sim' });
  await server.register(candleflipRoutes, { prefix: '/v1/candleflip' });
  await server.register(rugGameRoutes, { prefix: '/v1/rug-game' });
  await server.register(minesRoutes, { prefix: '/v1/mines' });
  await server.register(missionsRoutes, { prefix: '/v1/missions' });
  await server.register(weeklyRaceRoutes, { prefix: '/v1/races' });
  await server.register(weeklyRaceAdminRoutes, { prefix: '/v1/admin' });

  // Sponsored balances (streamer accounts)
  const { sponsoredRoutes, sponsoredAdminRoutes } = await import('./routes/sponsored.routes.js');
  await server.register(sponsoredRoutes, { prefix: '/v1/wallet' });
  await server.register(sponsoredAdminRoutes, { prefix: '/v1/admin' });

  // Simulation / bot testing (admin only)
  const { simulationRoutes } = await import('./routes/simulation.routes.js');
  await server.register(simulationRoutes, { prefix: '/v1/admin/simulation' });

  // Return hooks / retention
  const { returnHooksRoutes } = await import('./routes/returnHooks.routes.js');
  await server.register(returnHooksRoutes, { prefix: '/v1/hooks' });

  // Responsible gambling
  const { responsibleGamblingRoutes } = await import('./routes/responsibleGambling.routes.js');
  await server.register(responsibleGamblingRoutes, { prefix: '/v1/settings' });

  // Analytics (no auth required — fire-and-forget from frontend)
  const { analyticsRoutes } = await import('./routes/analytics.routes.js');
  await server.register(analyticsRoutes, { prefix: '/v1/analytics' });

  // Run pending migrations (safe — uses IF NOT EXISTS)
  try {
    const { sql } = await import('drizzle-orm');
    const db = (await import('./config/database.js')).getDb();
    await db.execute(sql`ALTER TABLE user_mission_progress ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ops_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        severity TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        user_id UUID,
        game TEXT,
        request_id TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  } catch (e) { server.log.error(e, 'Migration failed (non-fatal)'); }

  // Verify critical config on startup
  try {
    const { getTreasuryKeypair, getSolanaConnection } = await import('./modules/solana/treasury.js');
    const treasury = getTreasuryKeypair();
    const conn = getSolanaConnection();
    const treasuryBal = await conn.getBalance(treasury.publicKey);
    server.log.info(`[Startup] Treasury: ${treasury.publicKey.toBase58()} (balance: ${treasuryBal} lamports)`);
    server.log.info(`[Startup] WALLET_ENCRYPTION_KEY set: ${!!process.env.WALLET_ENCRYPTION_KEY}`);
    server.log.info(`[Startup] NODE_ENV: ${process.env.NODE_ENV}`);
  } catch (e) { server.log.error(e, 'Startup config check failed'); }

  // Start round managers (with error handling)
  try { startRugRoundManager(); } catch (e) { server.log.error(e, 'Failed to start rug round manager'); }
  try { startCandleflipRoundManager(); } catch (e) { server.log.error(e, 'Failed to start candleflip round manager'); }

  // Start background workers (with error handling)
  try { startDepositWorker(); } catch (e) { server.log.error(e, 'Failed to start deposit worker'); }
  try { startDepositMonitor(); } catch (e) { server.log.error(e, 'Failed to start deposit monitor'); }
  try { startBotEngine(); } catch (e) { server.log.error(e, 'Failed to start bot engine'); }
  try { startLotteryDrawWorker(); } catch (e) { server.log.error(e, 'Failed to start lottery draw worker'); }
  try { startTradingSimWorker(); } catch (e) { server.log.error(e, 'Failed to start trading sim worker'); }
  try { startSweepWorker(); } catch (e) { server.log.error(e, 'Failed to start sweep worker'); }
  try { startOrphanCleanupWorker(); } catch (e) { server.log.error(e, 'Failed to start orphan cleanup worker'); }
  try { startWeeklyRaceWorker(); } catch (e) { server.log.error(e, 'Failed to start weekly race worker'); }

  // Start worker health supervisor
  try {
    const { startWorkerSupervisor } = await import('./utils/workerHealth.js');
    startWorkerSupervisor();
  } catch (e) { server.log.error(e, 'Failed to start worker supervisor'); }

  return server;
}
