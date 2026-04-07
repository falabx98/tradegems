/**
 * Lightweight in-memory request performance monitor.
 * Stores last N request metrics in a ring buffer.
 * No DB writes — purely in-memory for near-zero overhead.
 *
 * Thresholds:
 * - SLOW_THRESHOLD_MS: 1000ms — anything above this is "slow"
 * - CRITICAL_THRESHOLD_MS: 3000ms — anything above this is critical
 */

const BUFFER_SIZE = 2000; // Keep last 2000 requests
const SLOW_THRESHOLD_MS = 1000;
const CRITICAL_THRESHOLD_MS = 3000;

// Route categories for grouping
const MONEY_ROUTES = new Set([
  '/v1/rug-game/join', '/v1/rug-game/round-cashout', '/v1/rug-game/cashout', '/v1/rug-game/start',
  '/v1/predictions/lock', '/v1/predictions/save',
  '/v1/candleflip/bet', '/v1/candleflip/join',
  '/v1/trading-sim/create', '/v1/trading-sim/join', '/v1/trading-sim/trade', '/v1/trading-sim/start',
  '/v1/gameplay/solo/start',
  '/v1/wallet/withdraw',
]);

interface RequestMetric {
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
  requestId: string;
  isMoneyCritical: boolean;
  isError: boolean;
  isSlow: boolean;
  ts: number; // Date.now() for windowing
}

// Ring buffer
const metrics: RequestMetric[] = [];
let writeIdx = 0;

/**
 * Record a completed request. Called from Fastify onResponse hook.
 */
export function recordRequestMetric(
  route: string,
  method: string,
  statusCode: number,
  durationMs: number,
  requestId: string,
): void {
  const entry: RequestMetric = {
    route,
    method,
    statusCode,
    durationMs: Math.round(durationMs * 100) / 100,
    requestId,
    isMoneyCritical: MONEY_ROUTES.has(route),
    isError: statusCode >= 400,
    isSlow: durationMs >= SLOW_THRESHOLD_MS,
    ts: Date.now(),
  };

  if (metrics.length < BUFFER_SIZE) {
    metrics.push(entry);
  } else {
    metrics[writeIdx % BUFFER_SIZE] = entry;
  }
  writeIdx++;
}

interface RouteStats {
  route: string;
  method: string;
  count: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  errorCount: number;
  slowCount: number;
  errorRate: number;
  isMoneyCritical: boolean;
}

/**
 * Get aggregated performance stats by route for a time window.
 */
export function getPerformanceStats(windowMinutes: number = 60): {
  window: string;
  totalRequests: number;
  totalErrors: number;
  totalSlow: number;
  routes: RouteStats[];
  slowestRequests: Array<{ route: string; durationMs: number; statusCode: number; requestId: string; ts: string }>;
  healthFlags: string[];
} {
  const cutoff = Date.now() - windowMinutes * 60 * 1000;
  const windowMetrics = metrics.filter(m => m.ts >= cutoff);

  // Aggregate by route+method
  const routeMap = new Map<string, RequestMetric[]>();
  for (const m of windowMetrics) {
    const key = `${m.method} ${m.route}`;
    if (!routeMap.has(key)) routeMap.set(key, []);
    routeMap.get(key)!.push(m);
  }

  const routes: RouteStats[] = [];
  for (const [key, entries] of routeMap) {
    const durations = entries.map(e => e.durationMs).sort((a, b) => a - b);
    const p95Idx = Math.floor(durations.length * 0.95);
    const errorCount = entries.filter(e => e.isError).length;

    routes.push({
      route: entries[0].route,
      method: entries[0].method,
      count: entries.length,
      avgMs: Math.round(durations.reduce((s, d) => s + d, 0) / durations.length),
      p95Ms: Math.round(durations[p95Idx] || durations[durations.length - 1] || 0),
      maxMs: Math.round(durations[durations.length - 1] || 0),
      errorCount,
      slowCount: entries.filter(e => e.isSlow).length,
      errorRate: entries.length > 0 ? parseFloat((errorCount / entries.length).toFixed(4)) : 0,
      isMoneyCritical: entries[0].isMoneyCritical,
    });
  }

  // Sort by p95 descending (slowest first)
  routes.sort((a, b) => b.p95Ms - a.p95Ms);

  // Top 10 slowest individual requests
  const slowest = [...windowMetrics]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10)
    .map(m => ({
      route: m.route,
      durationMs: m.durationMs,
      statusCode: m.statusCode,
      requestId: m.requestId,
      ts: new Date(m.ts).toISOString(),
    }));

  // Health flags
  const healthFlags: string[] = [];
  for (const r of routes) {
    if (r.isMoneyCritical && r.p95Ms >= CRITICAL_THRESHOLD_MS && r.count >= 5) {
      healthFlags.push(`CRITICAL: ${r.method} ${r.route} p95=${r.p95Ms}ms (${r.count} requests)`);
    } else if (r.isMoneyCritical && r.errorRate >= 0.1 && r.count >= 5) {
      healthFlags.push(`HIGH_ERROR_RATE: ${r.method} ${r.route} errorRate=${(r.errorRate * 100).toFixed(1)}% (${r.errorCount}/${r.count})`);
    } else if (r.p95Ms >= SLOW_THRESHOLD_MS && r.count >= 10) {
      healthFlags.push(`SLOW: ${r.method} ${r.route} p95=${r.p95Ms}ms (${r.count} requests)`);
    }
  }

  return {
    window: `${windowMinutes}m`,
    totalRequests: windowMetrics.length,
    totalErrors: windowMetrics.filter(m => m.isError).length,
    totalSlow: windowMetrics.filter(m => m.isSlow).length,
    routes: routes.slice(0, 30), // Top 30 routes
    slowestRequests: slowest,
    healthFlags,
  };
}

/**
 * Get money-critical route performance summary only.
 */
export function getMoneyRoutePerformance(windowMinutes: number = 60) {
  const stats = getPerformanceStats(windowMinutes);
  return {
    window: stats.window,
    moneyRoutes: stats.routes.filter(r => r.isMoneyCritical),
    healthFlags: stats.healthFlags,
    slowMoneyRequests: stats.slowestRequests.filter(r => MONEY_ROUTES.has(r.route)),
  };
}
