import 'dotenv/config';
import pino from 'pino';
import { RoundSchedulerWorker } from './roundScheduler.js';
import { SettlementWorker } from './settlement.js';
import { LeaderboardWorker } from './leaderboard.js';

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});

logger.info('Starting Trading Arena workers...');

const roundScheduler = new RoundSchedulerWorker(logger);
const settlement = new SettlementWorker(logger);
const leaderboard = new LeaderboardWorker(logger);

roundScheduler.start();
settlement.start();
leaderboard.start();

logger.info('All workers started');

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down workers...');
  await Promise.all([
    roundScheduler.stop(),
    settlement.stop(),
    leaderboard.stop(),
  ]);
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
