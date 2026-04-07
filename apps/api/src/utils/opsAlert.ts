/**
 * Operational alerting for dangerous events.
 * Records high-severity events to DB for operator visibility.
 * Never throws — this is a safety net, not a critical path.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '../config/database.js';

export type AlertSeverity = 'warning' | 'critical';
export type AlertCategory =
  | 'settlement_failure'
  | 'settlement_retry_failure'
  | 'duplicate_blocked'
  | 'bet_cap_violation'
  | 'exposure_limit_violation'
  | 'disabled_game_attempt'
  | 'payout_outlier'
  | 'endpoint_failure'
  | 'treasury'
  | 'circuit_breaker'
  | 'withdrawal_delayed'
  | 'withdrawal_failed'
  | 'low_reserve_ratio';

interface OpsAlertInput {
  severity: AlertSeverity;
  category: AlertCategory;
  message: string;
  userId?: string;
  game?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Record an operational alert. Never throws.
 */
export async function recordOpsAlert(input: OpsAlertInput): Promise<void> {
  try {
    const db = getDb();
    await db.execute(sql`
      INSERT INTO ops_alerts (id, severity, category, message, user_id, game, request_id, metadata, created_at)
      VALUES (gen_random_uuid(), ${input.severity}, ${input.category}, ${input.message},
              ${input.userId || null}, ${input.game || null}, ${input.requestId || null},
              ${JSON.stringify(input.metadata || {})}::jsonb, now())
    `);
  } catch (err) {
    // Last resort — at least log it
    console.error(JSON.stringify({
      type: 'OPS_ALERT_RECORD_FAILED',
      ts: new Date().toISOString(),
      ...input,
      recordError: String(err),
    }));
  }
}
