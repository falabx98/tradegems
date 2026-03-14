import { buildServer } from './server.js';
import { env } from './config/env.js';
import { startSweepWorker, stopSweepWorker } from './workers/sweepWorker.js';
import { stopBotEngine } from './workers/botEngine.worker.js';
import { stopRugRoundManager } from './modules/round-manager/rugRoundManager.js';
import { stopCandleflipRoundManager } from './modules/round-manager/candleflipRoundManager.js';

async function main() {
  const server = await buildServer();

  try {
    await server.listen({ port: env.API_PORT, host: '0.0.0.0' });
    server.log.info(`Trading Arena API running on port ${env.API_PORT}`);
  } catch (err) {
    server.log.fatal(err);
    process.exit(1);
  }

  // Start background sweep worker
  startSweepWorker();

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      server.log.info(`${signal} received, shutting down...`);
      stopSweepWorker();
      stopBotEngine();
      stopRugRoundManager();
      stopCandleflipRoundManager();
      await server.close();
      process.exit(0);
    });
  }
}

main();
