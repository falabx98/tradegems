import { getDb } from '../config/database.js';
import { weeklyRaces } from '@tradingarena/db';
import { eq, and, lte } from 'drizzle-orm';
import { WeeklyRaceService } from '../modules/weekly-race/weeklyRace.service.js';
import { createWorkerReporter, withWorkerRecovery } from '../utils/workerHealth.js';

const POLL_INTERVAL_MS = 60_000; // 60 seconds

let workerTimer: ReturnType<typeof setInterval> | null = null;
const reporter = createWorkerReporter('weekly-race');

// ─── Worker Tick ─────────────────────────────────────────────

async function tick(): Promise<void> {
  const db = getDb();
  const now = new Date();

  // 1. Ensure an active race exists (creates one if needed)
  await WeeklyRaceService.ensureActiveRace();

  // 2. Check for expired active races (weekEnd has passed)
  const expiredRaces = await db
    .select({ id: weeklyRaces.id })
    .from(weeklyRaces)
    .where(and(
      eq(weeklyRaces.status, 'active'),
      lte(weeklyRaces.weekEnd, now),
    ));

  for (const race of expiredRaces) {
    console.log(`[WeeklyRaceWorker] Race ${race.id} has expired — completing...`);
    try {
      await WeeklyRaceService.completeRace(race.id);
      console.log(`[WeeklyRaceWorker] Race ${race.id} completed successfully`);

      // Auto-create the next week's race immediately
      await WeeklyRaceService.ensureActiveRace();
      console.log(`[WeeklyRaceWorker] Next week race ensured`);
    } catch (err) {
      console.error(`[WeeklyRaceWorker] Failed to complete race ${race.id}:`, err);
    }
  }
}

// ─── Public API ──────────────────────────────────────────────

export async function startWeeklyRaceWorker(): Promise<void> {
  console.log('[WeeklyRaceWorker] Starting weekly race worker...');

  const wrappedTick = withWorkerRecovery('weekly-race', tick, reporter);
  await wrappedTick();

  workerTimer = setInterval(wrappedTick, POLL_INTERVAL_MS);
  console.log('[WeeklyRaceWorker] Weekly race worker started successfully');
}

export function stopWeeklyRaceWorker(): void {
  reporter.stop();
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
    console.log('[WeeklyRaceWorker] Weekly race worker stopped');
  }
}
