/**
 * Project-side Sentry helpers.
 *
 * Two thin wrappers over the Sentry SDK that
 *
 * 1. correlate Sentry events with our request-id / log lines, and
 * 2. silently no-op when the SDK isn't configured (no DSN set).
 *
 * Routes should call these IN ADDITION to `logger.error(...)`, never
 * instead of it. Sentry is for paging an on-call human; structured logs
 * are for after-the-fact incident review.
 *
 * The SDK auto-detects whether it was initialized — if `Sentry.init({...})`
 * never ran (because `SENTRY_DSN` was unset), `captureException` becomes
 * a no-op internally. We add an extra `isInitialized()` guard so we don't
 * even build the scope object in the no-DSN case.
 */
import * as Sentry from '@sentry/nextjs';

/**
 * Context attached to a captured exception. `route` is the logical name
 * of the API route (e.g. `'orders.id'`) so events can be filtered by
 * endpoint in the Sentry UI. `userId` and other identifiers are safe to
 * send; raw PII (email, phone) MUST NOT appear here — the global
 * `beforeSend` filter would strip it anyway, but better to never include
 * it in the first place.
 */
export interface ApiErrorContext {
  /** Short logical route name, e.g. `"orders.id"`, `"cart.item"`. */
  route: string;
  /** Internal user id (cuid). NOT email. */
  userId?: string;
  /** Request id from `newRequestId()` in `@/lib/api-error`. */
  requestId?: string;
  /** Free-form non-PII context (entity id, action, etc.). */
  extra?: Record<string, unknown>;
}

/**
 * `true` when `Sentry.init({...})` has been called for this runtime.
 * The SDK's `getClient()` returns `undefined` before init.
 */
function isInitialized(): boolean {
  return Boolean(Sentry.getClient?.());
}

/**
 * Capture an API-route exception with our standard tag set. No-ops when
 * the SDK isn't configured. Returns the Sentry event id (or `undefined`
 * when no-op) — we don't currently surface this in the API response,
 * but it's there for logging if a route wants to include it.
 */
export function captureApiError(
  error: unknown,
  context: ApiErrorContext,
): string | undefined {
  if (!isInitialized()) return undefined;

  return Sentry.withScope((scope) => {
    scope.setTag('route', context.route);
    if (context.userId) scope.setTag('userId', context.userId);
    if (context.requestId) scope.setTag('requestId', context.requestId);
    if (context.extra) scope.setContext('extra', context.extra);
    return Sentry.captureException(error);
  });
}

/**
 * Identify the current user on the Sentry scope. We send `id` and
 * `role` only — never email, even though the SDK's `User` type allows
 * it. The PII filter in `sentry.{client,server,edge}.config.ts` would
 * scrub email anyway, but being explicit at the call site means a
 * future refactor can't accidentally widen the surface.
 *
 * Pass `null` to clear the user (e.g. on logout).
 */
export interface SentryUser {
  id: string;
  role: string;
}

export function setUserContext(user: SentryUser | null): void {
  if (!isInitialized()) return;

  if (user === null) {
    Sentry.setUser(null);
    return;
  }

  Sentry.setUser({
    id: user.id,
    // `role` is a Sentry-supported custom field on the user object.
    role: user.role,
  });
}
