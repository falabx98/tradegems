/**
 * TradeGems Analytics — Lightweight event tracking utility.
 *
 * Fires structured events for product measurement.
 * Currently logs to console + sends to backend activity endpoint.
 * Can be wired to PostHog / Mixpanel / Amplitude later.
 *
 * Event taxonomy:
 *   {category}.{action}
 *   e.g. "lobby.category_click", "funnel.first_bet", "game.start"
 */

const IS_DEV = import.meta.env.DEV;

interface TrackEvent {
  event: string;
  properties?: Record<string, string | number | boolean | null | undefined>;
}

const eventQueue: TrackEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Track a product analytics event.
 * Lightweight — no external dependencies.
 */
export function track(event: string, properties?: Record<string, string | number | boolean | null | undefined>) {
  const payload: TrackEvent = {
    event,
    properties: {
      ...properties,
      timestamp: Date.now(),
      url: window.location.pathname,
    },
  };

  if (IS_DEV) {
    console.log(`[analytics] ${event}`, properties || '');
  }

  eventQueue.push(payload);

  // Batch flush every 5 seconds to avoid spamming
  if (!flushTimer) {
    flushTimer = setTimeout(flushEvents, 5000);
  }
}

async function flushEvents() {
  flushTimer = null;
  if (eventQueue.length === 0) return;

  const batch = eventQueue.splice(0, eventQueue.length);

  try {
    // Send to backend analytics endpoint if it exists
    const apiBase = import.meta.env.VITE_API_URL || 'https://api-production-85a0.up.railway.app';
    await fetch(`${apiBase}/v1/analytics/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
      credentials: 'include',
    }).catch(() => {
      // Silently fail — analytics should never break the product
    });
  } catch {
    // Never let analytics errors affect UX
  }
}

// Flush remaining events before page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (eventQueue.length > 0) {
      const apiBase = import.meta.env.VITE_API_URL || 'https://api-production-85a0.up.railway.app';
      const blob = new Blob([JSON.stringify({ events: eventQueue })], { type: 'application/json' });
      navigator.sendBeacon(`${apiBase}/v1/analytics/events`, blob);
    }
  });
}

// ─── Convenience helpers ────────────────────────────────────

/** Lobby events */
export const lobbyTrack = {
  categoryClick: (category: string) => track('lobby.category_click', { category }),
  gameCardClick: (gameId: string, source: string) => track('lobby.game_click', { gameId, source }),
  railScroll: (railName: string) => track('lobby.rail_scroll', { railName }),
  heroCta: () => track('lobby.hero_cta'),
  welcomeBannerClick: () => track('lobby.welcome_click'),
  startHereClick: (gameId: string) => track('lobby.start_here_click', { gameId }),
};

/** Funnel events */
export const funnelTrack = {
  sessionStart: () => track('funnel.session_start'),
  authStart: () => track('funnel.auth_start'),
  authComplete: () => track('funnel.auth_complete'),
  depositStart: () => track('funnel.deposit_start'),
  depositComplete: (amount: number) => track('funnel.deposit_complete', { amount }),
  firstGameClick: (gameId: string) => track('funnel.first_game_click', { gameId }),
  firstBet: (gameId: string, amount: number) => track('funnel.first_bet', { gameId, amount }),
  secondBet: (gameId: string) => track('funnel.second_bet', { gameId }),
};

/** Game events */
export const gameTrack = {
  start: (gameId: string, betAmount: number) => track('game.start', { gameId, betAmount }),
  complete: (gameId: string, result: string, multiplier: number, payout: number) =>
    track('game.complete', { gameId, result, multiplier, payout }),
  cashout: (gameId: string, multiplier: number) => track('game.cashout', { gameId, multiplier }),
  replay: (gameId: string) => track('game.replay', { gameId }),
};

/** Retention events */
export const retentionTrack = {
  returnVisit: () => track('retention.return_visit'),
  levelUpCardSeen: (level: number) => track('retention.levelup_card_seen', { level }),
  levelUpCardClick: () => track('retention.levelup_card_click'),
  missionSeen: (missionId: string) => track('retention.mission_seen', { missionId }),
  missionComplete: (missionId: string) => track('retention.mission_complete', { missionId }),
  missionClaim: (missionId: string) => track('retention.mission_claim', { missionId }),
};

/** Session events */
export const sessionTrack = {
  start: (props: { returningUser: boolean; daysSinceLast: number }) =>
    track('session.start', props),
  end: (props: { durationMs: number; gamesPlayed: number }) =>
    track('session.end', { ...props, durationMin: Math.round(props.durationMs / 60000) }),
};

/** Wallet/trust events */
export const walletTrack = {
  open: () => track('wallet.open'),
  depositAddressCopy: () => track('wallet.deposit_copy'),
  depositView: () => track('wallet.deposit_view'),
};
