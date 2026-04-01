/**
 * Structured audit logger for money-critical actions.
 * All financial actions go through here so they can be traced.
 */

export interface AuditEntry {
  action: string;
  requestId?: string;      // Fastify request.id for end-to-end tracing
  userId?: string;
  gameId?: string;         // roundId, roomId, drawId, etc.
  game?: string;           // 'rug-game', 'predictions', 'candleflip', etc.
  betAmount?: number;
  fee?: number;
  payoutAmount?: number;
  multiplier?: number;
  outcome?: string;        // 'win', 'loss', 'cashed_out', 'rugged', etc.
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  meta?: Record<string, unknown>;
}

/**
 * Log a financial audit event with structured JSON.
 * Captured by Railway log aggregation / Pino.
 */
export function auditLog(entry: AuditEntry): void {
  const log = {
    level: entry.status === 'failed' ? 'error' : 'info',
    type: 'AUDIT',
    ts: new Date().toISOString(),
    ...entry,
  };
  if (entry.status === 'failed') {
    console.error(JSON.stringify(log));
  } else {
    console.log(JSON.stringify(log));
  }
}
