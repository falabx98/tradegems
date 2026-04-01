/**
 * Worker Health Monitoring System
 *
 * Every worker reports heartbeats to Redis every 30s.
 * A supervisor checks all workers every 60s and logs alerts.
 * Admin endpoint returns real-time status of all workers.
 *
 * Redis keys: worker:health:{name} with TTL 90s
 * Status: 'healthy' (heartbeat < 60s) | 'degraded' (60-90s) | 'dead' (> 90s / key expired)
 */
import { getRedis } from '../config/redis.js';

const HEARTBEAT_INTERVAL = 30_000;  // 30s
const HEARTBEAT_TTL = 90;           // 90s — key expires if worker dies
const SUPERVISOR_INTERVAL = 60_000; // 60s
const DEGRADED_THRESHOLD = 60_000;  // 60s without heartbeat = degraded

// All known worker names — must match what workers register as
export const WORKER_NAMES = [
  'deposit-confirmation',
  'orphan-cleanup',
  'trading-sim-expiry',
  'lottery-draw',
  'sweep',
  'bot-engine',
  'rug-round-manager',
  'candleflip-round-manager',
  'weekly-race',
] as const;

export type WorkerName = typeof WORKER_NAMES[number];

interface WorkerHealthData {
  name: string;
  lastHeartbeat: string;        // ISO timestamp
  processedCount: number;
  errorCount: number;
  status: 'running' | 'error';
  consecutiveErrors: number;
  startedAt: string;
  pid: number;
}

export interface WorkerStatus {
  name: string;
  health: 'healthy' | 'degraded' | 'dead';
  lastHeartbeat: string | null;
  processedCount: number;
  errorCount: number;
  consecutiveErrors: number;
  msSinceHeartbeat: number | null;
}

/**
 * Worker heartbeat reporter.
 * Call createWorkerReporter(name) at worker startup.
 * Returns { heartbeat(), recordSuccess(), recordError(), stop() }
 */
export function createWorkerReporter(name: WorkerName) {
  let processedCount = 0;
  let errorCount = 0;
  let consecutiveErrors = 0;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  const startedAt = new Date().toISOString();

  const report = async () => {
    try {
      const redis = getRedis();
      const data: WorkerHealthData = {
        name,
        lastHeartbeat: new Date().toISOString(),
        processedCount,
        errorCount,
        status: consecutiveErrors >= 3 ? 'error' : 'running',
        consecutiveErrors,
        startedAt,
        pid: process.pid,
      };
      await redis.set(
        `worker:health:${name}`,
        JSON.stringify(data),
        'EX',
        HEARTBEAT_TTL,
      );
    } catch {
      // Health reporting itself should never crash the worker
    }
  };

  // Start automatic heartbeat
  intervalId = setInterval(report, HEARTBEAT_INTERVAL);
  // Initial heartbeat
  report();

  return {
    /** Call after successful job processing */
    recordSuccess() {
      processedCount++;
      consecutiveErrors = 0;
    },

    /** Call after job error */
    recordError() {
      errorCount++;
      consecutiveErrors++;
    },

    /** Get current consecutive error count (for backoff logic) */
    getConsecutiveErrors() {
      return consecutiveErrors;
    },

    /** Manual heartbeat (e.g. during long-running jobs) */
    heartbeat() {
      report();
    },

    /** Stop reporting (graceful shutdown) */
    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}

/**
 * Get health status of all workers.
 * Used by admin endpoint and supervisor.
 */
export async function getAllWorkerHealth(): Promise<WorkerStatus[]> {
  const redis = getRedis();
  const results: WorkerStatus[] = [];

  for (const name of WORKER_NAMES) {
    const raw = await redis.get(`worker:health:${name}`);

    if (!raw) {
      // Key expired or never set — worker is dead
      results.push({
        name,
        health: 'dead',
        lastHeartbeat: null,
        processedCount: 0,
        errorCount: 0,
        consecutiveErrors: 0,
        msSinceHeartbeat: null,
      });
      continue;
    }

    try {
      const data: WorkerHealthData = JSON.parse(raw);
      const msSince = Date.now() - new Date(data.lastHeartbeat).getTime();
      const health: 'healthy' | 'degraded' | 'dead' =
        msSince > HEARTBEAT_TTL * 1000 ? 'dead' :
        msSince > DEGRADED_THRESHOLD ? 'degraded' : 'healthy';

      results.push({
        name,
        health: data.consecutiveErrors >= 3 ? 'degraded' : health,
        lastHeartbeat: data.lastHeartbeat,
        processedCount: data.processedCount,
        errorCount: data.errorCount,
        consecutiveErrors: data.consecutiveErrors,
        msSinceHeartbeat: msSince,
      });
    } catch {
      results.push({
        name,
        health: 'dead',
        lastHeartbeat: null,
        processedCount: 0,
        errorCount: 0,
        consecutiveErrors: 0,
        msSinceHeartbeat: null,
      });
    }
  }

  return results;
}

/**
 * Start the supervisor that checks all workers periodically.
 * Logs CRITICAL alerts if any worker is dead.
 */
export function startWorkerSupervisor() {
  const check = async () => {
    try {
      const statuses = await getAllWorkerHealth();
      const dead = statuses.filter(s => s.health === 'dead');
      const degraded = statuses.filter(s => s.health === 'degraded');

      if (dead.length > 0) {
        console.error(`[CRITICAL] Dead workers: ${dead.map(d => d.name).join(', ')}`);
      }
      if (degraded.length > 0) {
        console.warn(`[WARNING] Degraded workers: ${degraded.map(d => `${d.name} (${d.consecutiveErrors} errors)`).join(', ')}`);
      }
    } catch (err) {
      console.error('[WorkerSupervisor] Health check failed:', err);
    }
  };

  // Initial check after 10s (let workers start up)
  setTimeout(check, 10_000);
  setInterval(check, SUPERVISOR_INTERVAL);
  console.log('[WorkerSupervisor] Started — checking all workers every 60s');
}

/**
 * Helper: wrap a worker's main loop with error recovery and backoff.
 * If the worker fails 3+ times consecutively, it waits 30s before retrying.
 */
export function withWorkerRecovery(
  name: WorkerName,
  fn: () => Promise<void>,
  reporter: ReturnType<typeof createWorkerReporter>,
): () => Promise<void> {
  return async () => {
    try {
      await fn();
      reporter.recordSuccess();
    } catch (err) {
      reporter.recordError();
      console.error(`[${name}] Error:`, err instanceof Error ? err.message : err);

      if (reporter.getConsecutiveErrors() >= 3) {
        console.warn(`[${name}] 3+ consecutive errors — backing off 30s`);
        await new Promise(r => setTimeout(r, 30_000));
      }
    }
  };
}
