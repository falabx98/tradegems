import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';

export function initSentry() {
  if (!SENTRY_DSN) {
    console.log('[Sentry] No DSN configured, skipping initialization');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE || 'development',
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.5,
    beforeSend(event) {
      // Don't send in development
      if (import.meta.env.DEV) return null;
      return event;
    },
  });

  console.log('[Sentry] Initialized for web');
}

export function captureError(error: Error, context?: Record<string, unknown>) {
  console.error('[Error]', error.message, context);
  if (SENTRY_DSN) {
    Sentry.captureException(error, { extra: context });
  }
}

export function setUser(userId: string, username: string) {
  Sentry.setUser({ id: userId, username });
}

export function clearUser() {
  Sentry.setUser(null);
}
