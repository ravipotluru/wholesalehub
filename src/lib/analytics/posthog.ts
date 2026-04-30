/**
 * Server-side PostHog wrapper.
 *
 * Design goals.
 * 1. Never block the API request. All capture/identify calls are
 *    fire-and-forget. The route should compose its response, then call
 *    capture() (typically not even awaited).
 * 2. Never fail dev/CI when the key is unset. If `POSTHOG_API_KEY` is
 *    absent, we export no-op `capture()` and `identify()` so a missing
 *    secret doesn't break tests or local development.
 * 3. Never leak PII. Property keys matching the same patterns the pino
 *    logger redacts (email, phone, password, token, secret, passwordHash)
 *    are stripped at any depth before the SDK is invoked.
 * 4. Type-safe event names. The registry in `./events` enumerates the
 *    canonical event names + Zod schemas; the `capture()` overload here
 *    rejects unknown names at the type level.
 *
 * Trade-off: serverless flush settings.
 *   `flushAt: 1` and `flushInterval: 0` mean every event is flushed
 *   immediately, with no batching. In a long-lived server this would be
 *   wasteful — batching of e.g. 20 events per flush is the default. But
 *   our deployment target is Vercel/serverless: the Node runtime exits
 *   shortly after the response is sent, so any batched-but-not-flushed
 *   events are lost on cold-start handoff. Flushing per event trades
 *   throughput for delivery reliability. If we move to a long-lived
 *   server we should bump these defaults.
 */

import { PostHog } from 'posthog-node';
import { logger } from '@/lib/logger';
import {
  EVENTS,
  type EventName,
  type EventProperties,
  validateEventProperties,
} from './events';

/**
 * PII keys redacted from property objects at any depth. Mirrors the redact
 * paths in `src/lib/logger.ts` so the analytics surface and the log surface
 * have a single privacy contract.
 */
const PII_KEYS = new Set([
  'email',
  'phone',
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'token',
  'secret',
  'webhookSecret',
  'authorization',
  'cookie',
  'creditCard',
  'apiKey',
]);

type Json = string | number | boolean | null | JsonObject | Json[];
interface JsonObject {
  [key: string]: Json | undefined;
}

/**
 * Recursively strip PII keys from a property object. Returns a new object
 * (does not mutate). Non-objects pass through unchanged. Arrays are walked.
 *
 * Exported for testing — see `analytics.test.ts`.
 */
export function stripPII(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => stripPII(v));
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (PII_KEYS.has(key)) continue;
    out[key] = stripPII(v);
  }
  return out;
}

/**
 * Lazy singleton client. We do NOT initialize at module load time — that
 * would force the SDK import in tests and make the no-op path harder to
 * verify. Instead, the first call to `getClient()` constructs the client
 * if `POSTHOG_API_KEY` is set, and caches it.
 */
let cachedClient: PostHog | null = null;
let cachedClientResolved = false;

function getClient(): PostHog | null {
  if (cachedClientResolved) return cachedClient;
  cachedClientResolved = true;
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) {
    cachedClient = null;
    return null;
  }
  const host = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';
  cachedClient = new PostHog(apiKey, {
    host,
    // See module-level comment for rationale.
    flushAt: 1,
    flushInterval: 0,
  });
  return cachedClient;
}

/**
 * Reset the cached client. Test-only — production code never calls this.
 */
export function __resetClientForTests(): void {
  cachedClient = null;
  cachedClientResolved = false;
}

export interface CaptureArgs<E extends EventName> {
  /** Canonical event name from the registry. */
  event: E;
  /** Pseudonymous user ID (we use `User.id` cuids — never email). */
  distinctId: string;
  /** Event-specific properties; validated against the registry schema. */
  properties: EventProperties<E>;
}

export interface IdentifyArgs {
  distinctId: string;
  properties: Record<string, unknown>;
}

/**
 * Capture an analytics event. Fire-and-forget — never `await` this from a
 * route handler. Returns void; errors are caught and logged.
 *
 * Validation behavior:
 * - In `development` and `test` we throw on Zod schema mismatch so a
 *   property typo fails CI loudly.
 * - In `production` we log and drop — analytics must never break a request.
 */
export function capture<E extends EventName>(args: CaptureArgs<E>): void {
  const { event, distinctId, properties } = args;

  // Validate against the registry schema. Throws ZodError if shape is wrong.
  let validated: EventProperties<E>;
  try {
    validated = validateEventProperties(event, properties);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      // Re-throw so the dev sees the error in their console / CI fails.
      throw error;
    }
    logger.warn({
      event: 'analytics_validation_failed',
      analyticsEvent: event,
      error: (error as Error).message,
    });
    return;
  }

  // Strip PII at any depth before handing off to the SDK.
  const safeProperties = stripPII(validated) as Record<string, unknown>;

  const client = getClient();
  if (!client) {
    // No-op when API key is unset — does not log per call to avoid spam.
    return;
  }

  try {
    client.capture({
      distinctId,
      event: EVENTS[event].name,
      properties: safeProperties,
    });
  } catch (error) {
    // Catch synchronous errors. The SDK swallows network errors itself
    // (it's queue-based); this only catches malformed-input crashes.
    logger.warn({
      event: 'analytics_capture_failed',
      analyticsEvent: event,
      error: (error as Error).message,
    });
  }
}

/**
 * Associate persistent user properties with a distinctId. Same fire-and-
 * forget contract as `capture()`. PII is stripped from properties.
 */
export function identify(args: IdentifyArgs): void {
  const { distinctId, properties } = args;
  const safeProperties = stripPII(properties) as Record<string, unknown>;

  const client = getClient();
  if (!client) return;

  try {
    client.identify({ distinctId, properties: safeProperties });
  } catch (error) {
    logger.warn({
      event: 'analytics_identify_failed',
      error: (error as Error).message,
    });
  }
}

/**
 * Force-flush queued events. Useful at the end of a long-lived process or
 * before serverless function exit. Most route handlers should NOT call this
 * because we already use `flushAt: 1`.
 */
export async function flush(): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.flush();
  } catch (error) {
    logger.warn({
      event: 'analytics_flush_failed',
      error: (error as Error).message,
    });
  }
}

/**
 * Gracefully shut down the client. Call this from process exit hooks if
 * you have any (we don't, on Vercel).
 */
export async function shutdown(): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.shutdown();
  } catch (error) {
    logger.warn({
      event: 'analytics_shutdown_failed',
      error: (error as Error).message,
    });
  }
}
