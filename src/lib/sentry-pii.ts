/**
 * PII filter shared by sentry.{client,server,edge}.config.ts.
 *
 * Mirrors the redact paths in `src/lib/logger.ts` — buyer/seller emails,
 * passwords, tokens, secrets, webhook secrets, and other auth/PII fields
 * MUST NOT ship to Sentry. Logger redaction protects logs; this protects
 * Sentry events. The two lists must stay in sync.
 *
 * The function walks the event payload and rewrites any matching field
 * name to a redaction marker. Email keeps the domain (so an incident
 * report can still grep by `@suppliercorp.com`); everything else is
 * fully removed.
 *
 * Sentry SDK type for `beforeSend` is `(event, hint) => Event | null`.
 * We use a structural `SentryEventLike` here so this module stays
 * importable from tests without pulling the SDK in.
 */

const REDACT_KEYS = new Set<string>([
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'authorization',
  'cookie',
  'token',
  'apikey',
  'secret',
  'webhooksecret',
  'phone',
  'creditcard',
]);

const EMAIL_KEYS = new Set<string>(['email']);

const REDACTED = '[redacted]';

function maskEmail(value: unknown): string {
  if (typeof value !== 'string') return REDACTED;
  const at = value.indexOf('@');
  if (at <= 0) return REDACTED;
  return value[0] + '***' + value.slice(at);
}

/**
 * Recursively redact PII from any JSON-shaped value. Returns a new
 * value (does not mutate the input). Cycle-safe via a WeakSet of seen
 * objects — Sentry events should never contain cycles, but a defensive
 * check is cheaper than a stack overflow.
 */
function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (seen.has(value as object)) return REDACTED;
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const lowered = key.toLowerCase();
    if (EMAIL_KEYS.has(lowered)) {
      out[key] = maskEmail(val);
    } else if (REDACT_KEYS.has(lowered)) {
      out[key] = REDACTED;
    } else {
      out[key] = redactValue(val, seen);
    }
  }
  return out;
}

/**
 * Minimal structural type so this module can be unit-tested without
 * pulling in `@sentry/nextjs`. The Sentry SDK's `Event` type is a strict
 * superset.
 */
export interface SentryEventLike {
  request?: {
    headers?: Record<string, string | string[] | undefined>;
    cookies?: Record<string, string | string[] | undefined>;
    data?: unknown;
    query_string?: unknown;
  };
  user?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  breadcrumbs?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * `beforeSend` hook for Sentry.init({ beforeSend: scrubEvent }).
 *
 * Returns the scrubbed event. Returning `null` would drop the event;
 * we never do that here — we strip and forward.
 */
export function scrubEvent<T extends SentryEventLike>(event: T): T {
  const seen = new WeakSet<object>();
  return redactValue(event, seen) as T;
}
