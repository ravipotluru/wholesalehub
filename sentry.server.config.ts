/**
 * Sentry server (Node.js runtime) initialization.
 *
 * Runs on every server-rendered page and API route invocation. No-ops
 * when `SENTRY_DSN` is unset. The PII filter mirrors the logger
 * redaction config — emails are partially masked, passwords/tokens/
 * secrets are stripped entirely.
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
