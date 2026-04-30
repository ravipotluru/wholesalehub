/**
 * Sentry edge (Vercel Edge runtime) initialization.
 *
 * Loaded by `@sentry/nextjs` for any route or middleware running on
 * the Edge runtime (`export const runtime = 'edge'`). No-ops when
 * `SENTRY_DSN` is unset. PII filter shared with the server/client
 * configs — see `src/lib/sentry-pii.ts`.
 */
import * as Sentry from '@sentry/nextjs';

import { scrubEvent } from '@/lib/sentry-pii';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE ?? 'wholesalehub@dev',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    beforeSend: (event) => scrubEvent(event),
  });
}
