/**
 * Sentry client (browser) initialization.
 *
 * Loaded automatically by `@sentry/nextjs` on every page. No-ops when
 * `NEXT_PUBLIC_SENTRY_DSN` is unset, so dev/CI never need a Sentry
 * project. The DSN must be `NEXT_PUBLIC_*` because the bundle ships to
 * the browser; the server-side `SENTRY_DSN` is the equivalent on the
 * Node and Edge runtimes.
 *
 * The `beforeSend` hook strips PII matching the redact list in
 * `src/lib/logger.ts` — buyer/seller emails, passwords, tokens,
 * secrets, webhook secrets. See `src/lib/sentry-pii.ts`.
 */
import * as Sentry from '@sentry/nextjs';

import { scrubEvent } from '@/lib/sentry-pii';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE ?? 'wholesalehub@dev',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    beforeSend: (event) => scrubEvent(event),
  });
}
