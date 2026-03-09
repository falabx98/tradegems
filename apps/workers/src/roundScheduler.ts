import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import { eq, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import type { Logger } from 'pino';
import { createDb, rounds, roundPools } from '@tradingarena/db';
import { generateRound, DEFAULT_ENGINE_CONFIG } from '@tradingarena/game-engine';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const ROUND_INTERVAL_MS = 30000; // New round every 30 seconds
const ENTRY_WINDOW_MS = 15000; // 15s entry window
const ROUND_DURATION_MS = 15000;

interface RoundJobData {
  roundId: string;
  phase: 'open_entry' | 'lock' | 'generate' | 'start' | 'freeze' | 'resolve';
}

export class RoundSchedulerWorker {
  private worker: Worker | null = null;
  private queue: Queue;
  private schedulerInterval: ReturnType<typeof setInterval> | null = null;
  private redis: Redis;
  private db: ReturnType<typeof createDb>;

  constructor(private logger: Logger) {
    this.redis = new Redis(REDIS_URL);
    this.db = createDb(process.env.DATABASE_URL!);
    this.queue = new Queue('round-lifecycle', {
      connection: { url: REDIS_URL },
    });
  }

  start() {
    this.worker = new Worker(
      'round-lifecycle',
      async (job) => {
        const { roundId, phase } = job.data as RoundJobData;
        this.logger.info({ roundId, phase }, 'Processing round lifecycle phase');

        switch (phase) {
          case 'open_entry':
            await this.openEntry(roundId);
            break;
          case 'lock':
            await this.lockEntries(roundId);
            break;
          case 'generate':
            await this.generatePayload(roundId);
            break;
          case 'start':
            await this.startRound(roundId);
            break;
          case 'freeze':
            await this.freezeRound(roundId);
            break;
          case 'resolve':
            await this.resolveRound(roundId);
            break;
        }
      },
      { connection: { url: REDIS_URL } },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error({ jobId: job?.id, error: error.message }, 'Round job failed');
    });

    // Auto-schedule rounds
    this.scheduleNextRound();
    this.schedulerInterval = setInterval(() => {
      this.scheduleNextRound();
    }, ROUND_INTERVAL_MS);

    this.logger.info('Round scheduler worker started');
  }

  private async scheduleNextRound() {
    try {
      const existing = await this.db.query.rounds.findFirst({
        where: sql`${rounds.status} IN ('scheduled', 'entry_open', 'locked')`,
      });
      if (existing) return;

      const seed = crypto.randomBytes(32).toString('hex');
      const seedCommitment = crypto.createHash('sha256').update(seed).digest('hex');
      const scheduledAt = new Date(Date.now() + 5000);

      const [round] = await this.db.insert(rounds).values({
        mode: 'solo',
        status: 'scheduled',
        scheduledAt,
        seed,
        seedCommitment,
        configSnapshot: DEFAULT_ENGINE_CONFIG as unknown as Record<string, unknown>,
        durationMs: ROUND_DURATION_MS,
      }).returning();

      await this.db.insert(roundPools).values({
        roundId: round.id,
        poolType: 'main',
        liquidityMode: 'p2p',
      });

      // Schedule lifecycle phases with delays
      const phases: { name: string; data: RoundJobData; delay: number }[] = [
        { name: 'open_entry', data: { roundId: round.id, phase: 'open_entry' }, delay: 5000 },
        { name: 'lock', data: { roundId: round.id, phase: 'lock' }, delay: 5000 + ENTRY_WINDOW_MS },
        { name: 'generate', data: { roundId: round.id, phase: 'generate' }, delay: 5000 + ENTRY_WINDOW_MS + 1000 },
        { name: 'start', data: { roundId: round.id, phase: 'start' }, delay: 5000 + ENTRY_WINDOW_MS + 2000 },
        { name: 'freeze', data: { roundId: round.id, phase: 'freeze' }, delay: 5000 + ENTRY_WINDOW_MS + 2000 + ROUND_DURATION_MS },
        { name: 'resolve', data: { roundId: round.id, phase: 'resolve' }, delay: 5000 + ENTRY_WINDOW_MS + 2000 + ROUND_DURATION_MS + 1000 },
      ];

      for (const p of phases) {
        await this.queue.add(p.name, p.data, { delay: p.delay });
      }

      this.logger.info({ roundId: round.id }, 'Scheduled new round');
    } catch (error) {
      this.logger.error({ error: (error as Error).message }, 'Failed to schedule round');
    }
  }

  private async openEntry(roundId: string) {
    await this.db.update(rounds).set({ status: 'entry_open' }).where(eq(rounds.id, roundId));
    await this.redis.publish(`round:${roundId}`, JSON.stringify({
      type: 'round.entry_open',
      roundId,
    }));
    await this.redis.publish('broadcast:round', JSON.stringify({
      type: 'round.available',
      roundId,
    }));
  }

  private async lockEntries(roundId: string) {
    await this.db.update(rounds).set({ status: 'locked' }).where(eq(rounds.id, roundId));
    await this.redis.publish(`round:${roundId}`, JSON.stringify({
      type: 'round.locked',
      roundId,
    }));
  }

  private async generatePayload(roundId: string) {
    const round = await this.db.query.rounds.findFirst({ where: eq(rounds.id, roundId) });
    if (!round?.seed) return;

    const config = generateRound(round.seed, DEFAULT_ENGINE_CONFIG);
    await this.db.update(rounds).set({
      status: 'generated',
      chartPath: config.chartPath as unknown as Record<string, unknown>,
    }).where(eq(rounds.id, roundId));
  }

  private async startRound(roundId: string) {
    await this.db.update(rounds).set({
      status: 'active',
      startedAt: new Date(),
    }).where(eq(rounds.id, roundId));

    const round = await this.db.query.rounds.findFirst({ where: eq(rounds.id, roundId) });
    await this.redis.publish(`round:${roundId}`, JSON.stringify({
      type: 'round.started',
      roundId,
      payload: {
        chartPath: round?.chartPath,
        duration: ROUND_DURATION_MS,
        seedCommitment: round?.seedCommitment,
      },
    }));
  }

  private async freezeRound(roundId: string) {
    await this.db.update(rounds).set({
      status: 'frozen',
      endedAt: new Date(),
    }).where(eq(rounds.id, roundId));

    await this.redis.publish(`round:${roundId}`, JSON.stringify({
      type: 'round.frozen',
      roundId,
    }));
  }

  private async resolveRound(roundId: string) {
    const settlementQueue = new Queue('settlement', {
      connection: { url: REDIS_URL },
    });
    await settlementQueue.add('settle-round', { roundId });
    await settlementQueue.close();
  }

  async stop() {
    if (this.schedulerInterval) clearInterval(this.schedulerInterval);
    await this.worker?.close();
    await this.queue.close();
    await this.redis.quit();
  }
}
