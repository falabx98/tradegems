/**
 * Data Retention Worker
 *
 * Periodically purges old rows from high-volume tables to prevent
 * disk exhaustion (WAL bloat). Runs every 5 minutes.
 *
 * Retention periods:
 *   activity_feed_items  — 24 hours
 *   chat_messages        — 48 hours
 *   round_events         — 48 hours
 *   outbox_events (done) — 24 hours
 *   analytics_events     — 7 days
 *   ops_alerts           — 7 days
 *   bot rounds/bets      — 72 hours
 */
import { createWorkerReporter, withWorkerRecovery } from '../utils/workerHealth.js';

let retentionInterval: ReturnType<typeof setInterval> | null = null;
const TICK_MS = 5 * 60_000; // every 5 minutes

interface PurgeResult {
  table: string;
  deleted: number;
}

async function purgeTable(
  db: any,
  sql: any,
  table: string,
  interval: string,
  extraWhere?: string,
): Promise<PurgeResult> {
  try {
    const where = extraWhere
      ? `created_at < NOW() - INTERVAL '${interval}' AND ${extraWhere}`
      : `created_at < NOW() - INTERVAL '${interval}'`;
    // Delete in batches to avoid long-running transactions / WAL spikes
    const result = await db.execute(
      sql.raw(`DELETE FROM ${table} WHERE ctid IN (SELECT ctid FROM ${table} WHERE ${where} LIMIT 5000)`),
    );
    const count = (result as any)?.rowCount ?? 0;
    return { table, deleted: count };
  } catch (err: any) {
    console.error(`[DataRetention] Failed to purge ${table}:`, err.message);
    return { table, deleted: 0 };
  }
}

async function tick(): Promise<void> {
  const { getDb } = await import('../config/database.js');
  const { sql } = await import('drizzle-orm');
  const db = getDb();

  const results = await Promise.all([
    purgeTable(db, sql, 'activity_feed_items', '24 hours'),
    purgeTable(db, sql, 'chat_messages', '48 hours'),
    purgeTable(db, sql, 'round_events', '48 hours'),
    purgeTable(db, sql, 'outbox_events', '24 hours', "status = 'published'"),
    purgeTable(db, sql, 'analytics_events', '7 days'),
    purgeTable(db, sql, 'ops_alerts', '7 days'),
  ]);

  const total = results.reduce((sum, r) => sum + r.deleted, 0);
  if (total > 0) {
    const details = results.filter(r => r.deleted > 0).map(r => `${r.table}=${r.deleted}`).join(', ');
    console.log(`[DataRetention] Purged ${total} rows: ${details}`);
  }
}

const reporter = createWorkerReporter('data-retention');

export function startDataRetentionWorker(): void {
  console.log(`[DataRetention] Starting data retention worker (interval: ${TICK_MS / 1000}s)`);

  const wrappedTick = withWorkerRecovery('data-retention', tick, reporter);

  // Run immediately on startup to free space ASAP
  wrappedTick();

  retentionInterval = setInterval(wrappedTick, TICK_MS);
}

export function stopDataRetentionWorker(): void {
  reporter.stop();
  if (retentionInterval) {
    clearInterval(retentionInterval);
    retentionInterval = null;
    console.log('[DataRetention] Stopped');
  }
}

/**
 * Emergency cleanup — run once at startup to aggressively free space.
 * Deletes more rows (50k limit) and runs VACUUM to reclaim disk.
 */
export async function emergencyCleanup(): Promise<void> {
  try {
    const { getDb } = await import('../config/database.js');
    const { sql } = await import('drizzle-orm');
    const db = getDb();

    console.log('[DataRetention] Running emergency cleanup...');

    // Aggressive purge with higher limits
    const tables = [
      { table: 'activity_feed_items', interval: '6 hours' },
      { table: 'chat_messages', interval: '12 hours' },
      { table: 'round_events', interval: '12 hours' },
      { table: 'analytics_events', interval: '3 days' },
      { table: 'outbox_events', interval: '6 hours' },
    ];

    let totalDeleted = 0;
    for (const { table, interval } of tables) {
      try {
        const result = await db.execute(
          sql.raw(`DELETE FROM ${table} WHERE created_at < NOW() - INTERVAL '${interval}'`),
        );
        const count = (result as any)?.rowCount ?? 0;
        totalDeleted += count;
        if (count > 0) console.log(`[DataRetention] Emergency: deleted ${count} from ${table}`);
      } catch (err: any) {
        console.error(`[DataRetention] Emergency purge ${table} failed:`, err.message);
      }
    }

    // Also purge bot-generated rounds that are settled and old
    try {
      const result = await db.execute(sql.raw(`
        DELETE FROM bet_results WHERE bet_id IN (
          SELECT b.id FROM bets b
          JOIN rounds r ON b.round_id = r.id
          WHERE r.mode = 'solo' AND r.status = 'settled'
          AND r.created_at < NOW() - INTERVAL '72 hours'
          AND b.user_id IN (SELECT id FROM users WHERE role = 'bot')
        ) LIMIT 10000
      `));
      const count = (result as any)?.rowCount ?? 0;
      if (count > 0) console.log(`[DataRetention] Emergency: deleted ${count} bot bet_results`);
      totalDeleted += count;
    } catch {
      // Non-critical
    }

    console.log(`[DataRetention] Emergency cleanup complete: ${totalDeleted} total rows deleted`);

    // Reclaim disk space
    try {
      await db.execute(sql.raw('VACUUM'));
      console.log('[DataRetention] VACUUM complete');
    } catch (err: any) {
      console.warn('[DataRetention] VACUUM failed (non-fatal):', err.message);
    }
  } catch (err: any) {
    console.error('[DataRetention] Emergency cleanup failed:', err.message);
  }
}
