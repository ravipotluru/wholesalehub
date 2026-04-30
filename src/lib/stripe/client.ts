import Stripe from 'stripe';

/**
 * Stripe SDK wrapper. Reads `STRIPE_SECRET_KEY` from env on first use.
 *
 * Contract: fail-loud-in-prod, fail-soft-in-dev.
 * - If `STRIPE_SECRET_KEY` is set, `getStripeClient()` returns a configured
 *   `Stripe` instance. Same instance every call (module-level cache).
 * - If unset, `getStripeClient()` throws a `StripeNotConfiguredError`. CI
 *   and dev can run without a key as long as no Stripe paths are exercised;
 *   prod environments must set it (the API endpoints translate this error
 *   into a 503 with a deliberate "not configured" message).
 *
 * Why a getter instead of a top-level `new Stripe(...)`:
 * - Module evaluation order in Next.js means `process.env` may not be
 *   loaded by the time a module is first imported. Lazy resolution lets
 *   tests stub the env var per-test.
 * - Throwing a clear error from any method call (rather than silently
 *   constructing a no-op client) is the explicit fail-loud requirement.
 */
export class StripeNotConfiguredError extends Error {
  readonly code = 'STRIPE_NOT_CONFIGURED';

  constructor() {
    super(
      'Stripe is not configured for this environment. Set STRIPE_SECRET_KEY ' +
        'and (for webhooks) STRIPE_WEBHOOK_SECRET. See .env.example.',
    );
    this.name = 'StripeNotConfiguredError';
  }
}

/** Pinned API version. Bump together with the SDK major. */
export const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2024-09-30.acacia';

/** Module-level cache so we only construct the SDK once per process. */
let cachedClient: Stripe | null = null;

/** True when `STRIPE_SECRET_KEY` is non-empty. Cheap, no SDK instantiation. */
export function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY;
  return typeof key === 'string' && key.length > 0;
}

/**
 * Resolve the Stripe SDK instance. Throws `StripeNotConfiguredError` if the
 * secret key is unset — callers in API routes catch this and translate to
 * a 503 response.
 */
export function getStripeClient(): Stripe {
  if (cachedClient) return cachedClient;
  if (!isStripeConfigured()) {
    throw new StripeNotConfiguredError();
  }
  cachedClient = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: STRIPE_API_VERSION,
    // Identifying ourselves to Stripe support helps debugging via dashboard.
    appInfo: {
      name: 'WholesaleHub',
      version: '1.0.0',
      url: 'https://github.com/wholesalehub',
    },
    // The SDK auto-retries network errors; we keep the default. Idempotency
    // keys are added per-request by the call sites that need them.
    typescript: true,
  });
  return cachedClient;
}

/**
 * Test-only helper: clear the cached Stripe client. Production code never
 * needs to flush — `STRIPE_SECRET_KEY` is set once at boot.
 */
export function __resetStripeClientCacheForTests(): void {
  cachedClient = null;
}
