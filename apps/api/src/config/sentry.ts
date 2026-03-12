import * as Sentry from '@sentry/node';
import { env } from './env.js';

export function initSentry() {
  const dsn = process.env.SENTRY_DSN || '';

  if (!dsn) {
    console.log('[Sentry] No DSN configured, skipping initialization');
    return;
  }

  Sentry.init({
    dsn,
    environment: env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (env.NODE_ENV === 'development') return null;
      return event;
    },
  });

  console.log('[Sentry] Initialized for API');
}

export function captureError(error: Error, context?: Record<string, unknown>) {
  console.error('[Error]', error.message, context);
  Sentry.captureException(error, { extra: context });
}
