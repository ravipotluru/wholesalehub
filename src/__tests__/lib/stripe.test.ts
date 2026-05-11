/**
 * Tests for the Stripe Connect scaffolding helpers + webhook handler.
 *
 * The `stripe` package is mocked at the top so the test suite runs in an
 * environment where the real SDK is not installed (this PR only adds the
 * dependency to package.json — `npm install` runs in a follow-up).
 *
 * Coverage:
 *   - `createConnectedAccount` is idempotent
 *   - `mapStripeAccountStatus` maps charges/payouts/disabled_reason correctly
 *   - `computeApplicationFee` and `amountInCents` (the integer-cents boundary)
 *   - `createPaymentIntentForOrder` passes the right amounts to Stripe
 *   - Webhook signature verification passes with valid sig, fails with invalid
 */

// ─── Mocks (must come BEFORE any import of source-under-test) ─────────────

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Mock prisma. The factory must initialise the mock object inside it
// because jest.mock factories are hoisted above all `const` declarations.
jest.mock('@/lib/prisma', () => ({
  prisma: {
    wholesaler: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    stripePaymentIntent: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

// Mock the `stripe` package — the real SDK isn't installed yet (this PR
// adds it to package.json only). The factory builds its own instance and
// attaches the constructor + the instance to a `globalThis` key so the
// test code can grab them after evaluation. This pattern sidesteps the
// `jest.mock` factory hoisting / TDZ issue with module-level `const`s.
jest.mock('stripe', () => {
  const instance = {
    accounts: {
      create: jest.fn(),
      retrieve: jest.fn(),
    },
    accountLinks: { create: jest.fn() },
    paymentIntents: { create: jest.fn() },
    webhooks: { constructEvent: jest.fn() },
  };
  const ctor = jest.fn(() => instance);
  // Stash on globalThis so the test body can access without TDZ issues.
  (globalThis as unknown as Record<string, unknown>).__stripeMock = {
    instance,
    ctor,
  };
  return { __esModule: true, default: ctor };
});

interface StripeMockGlobals {
  instance: {
    accounts: { create: jest.Mock; retrieve: jest.Mock };
    accountLinks: { create: jest.Mock };
    paymentIntents: { create: jest.Mock };
    webhooks: { constructEvent: jest.Mock };
  };
  ctor: jest.Mock;
}

function getStripeMock(): StripeMockGlobals {
  return (globalThis as unknown as { __stripeMock: StripeMockGlobals })
    .__stripeMock;
}

// After the mocks are in place, pull out shared references the test body uses.
const mockStripeInstance = (() => getStripeMock().instance)();
const StripeMockCtor = (() => getStripeMock().ctor)();
const mockPrismaModule = jest.requireMock('@/lib/prisma') as {
  prisma: {
    wholesaler: { findUnique: jest.Mock; update: jest.Mock };
    stripePaymentIntent: { create: jest.Mock; updateMany: jest.Mock };
  };
};
const mockPrisma = mockPrismaModule.prisma;

// ─── Imports of source-under-test (after mocks) ────────────────────────────

import { Prisma } from '@prisma/client';
import {
  __resetStripeClientCacheForTests,
  isStripeConfigured,
  StripeNotConfiguredError,
  getStripeClient,
} from '@/lib/stripe/client';
import {
  mapStripeAccountStatus,
  createConnectedAccount,
} from '@/lib/stripe/connect';
import {
  computeApplicationFee,
  amountInCents,
  getApplicationFeeBps,
  createPaymentIntentForOrder,
  mapPaymentIntentStatus,
} from '@/lib/stripe/payments';

// ─── Shared setup helpers ──────────────────────────────────────────────────

function setStripeKey(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.STRIPE_SECRET_KEY;
  } else {
    process.env.STRIPE_SECRET_KEY = value;
  }
  __resetStripeClientCacheForTests();
}

beforeEach(() => {
  jest.clearAllMocks();
  setStripeKey('sk_test_dummy');
  delete process.env.STRIPE_APPLICATION_FEE_BPS;
});

// ─── client.ts ─────────────────────────────────────────────────────────────

describe('isStripeConfigured / getStripeClient', () => {
  it('returns true when STRIPE_SECRET_KEY is set', () => {
    setStripeKey('sk_test_x');
    expect(isStripeConfigured()).toBe(true);
  });

  it('returns false when STRIPE_SECRET_KEY is unset', () => {
    setStripeKey(undefined);
    expect(isStripeConfigured()).toBe(false);
  });

  it('returns false when STRIPE_SECRET_KEY is empty string', () => {
    setStripeKey('');
    expect(isStripeConfigured()).toBe(false);
  });

  it('throws StripeNotConfiguredError when key is unset', () => {
    setStripeKey(undefined);
    expect(() => getStripeClient()).toThrow(StripeNotConfiguredError);
  });

  it('caches the SDK instance across calls (single construction)', () => {
    setStripeKey('sk_test_x');
    StripeMockCtor.mockClear();
    const a = getStripeClient();
    const b = getStripeClient();
    expect(a).toBe(b);
    expect(StripeMockCtor).toHaveBeenCalledTimes(1);
  });
});

// ─── connect.ts: mapStripeAccountStatus ────────────────────────────────────

describe('mapStripeAccountStatus', () => {
  type MinAccount = Parameters<typeof mapStripeAccountStatus>[0];

  function acct(over: Partial<MinAccount> = {}): MinAccount {
    return {
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      requirements: { disabled_reason: null } as MinAccount['requirements'],
      ...over,
    };
  }

  it('returns ACTIVE when charges + payouts both enabled', () => {
    expect(
      mapStripeAccountStatus(
        acct({ charges_enabled: true, payouts_enabled: true }),
      ),
    ).toBe('ACTIVE');
  });

  it('returns ONBOARDING when charges enabled but payouts not (no disabled_reason, not yet submitted)', () => {
    // When charges flip on first but payouts still pending, with no
    // requirements problem, the wholesaler is still mid-flow.
    expect(
      mapStripeAccountStatus(
        acct({ charges_enabled: true, payouts_enabled: false }),
      ),
    ).toBe('ONBOARDING');
  });

  it('returns RESTRICTED when there is a non-rejected disabled_reason', () => {
    expect(
      mapStripeAccountStatus(
        acct({
          requirements: {
            disabled_reason: 'requirements.past_due',
          } as MinAccount['requirements'],
        }),
      ),
    ).toBe('RESTRICTED');
  });

  it('returns REJECTED when disabled_reason starts with rejected.', () => {
    expect(
      mapStripeAccountStatus(
        acct({
          requirements: {
            disabled_reason: 'rejected.fraud',
          } as MinAccount['requirements'],
        }),
      ),
    ).toBe('REJECTED');

    expect(
      mapStripeAccountStatus(
        acct({
          requirements: {
            disabled_reason: 'rejected.terms_of_service',
          } as MinAccount['requirements'],
        }),
      ),
    ).toBe('REJECTED');
  });

  it('returns ONBOARDING when no requirements problem and not yet submitted', () => {
    expect(
      mapStripeAccountStatus(acct({ details_submitted: false })),
    ).toBe('ONBOARDING');
  });

  it('returns RESTRICTED when details submitted but not yet active', () => {
    // details_submitted=true, no charges/payouts, no disabled_reason → in
    // an in-flight review state. We map it to RESTRICTED so the dashboard
    // shows "Stripe is reviewing" rather than "still onboarding".
    expect(
      mapStripeAccountStatus(
        acct({ details_submitted: true }),
      ),
    ).toBe('RESTRICTED');
  });
});

// ─── connect.ts: createConnectedAccount idempotency ────────────────────────

describe('createConnectedAccount', () => {
  it('skips the SDK call when wholesaler already has stripeAccountId', async () => {
    const result = await createConnectedAccount({
      id: 'whs_1',
      contactEmail: 'a@b.co',
      contactName: 'Alice',
      businessName: 'Acme Wholesale',
      state: 'CA',
      stripeAccountId: 'acct_existing',
      stripeAccountStatus: 'ACTIVE',
    });

    expect(result).toEqual({
      stripeAccountId: 'acct_existing',
      created: false,
    });
    expect(mockStripeInstance.accounts.create).not.toHaveBeenCalled();
    expect(mockPrisma.wholesaler.update).not.toHaveBeenCalled();
  });

  it('creates an account + persists the id when one does not exist', async () => {
    mockStripeInstance.accounts.create.mockResolvedValueOnce({
      id: 'acct_new',
      object: 'account',
    });

    const result = await createConnectedAccount({
      id: 'whs_2',
      contactEmail: 'b@c.co',
      contactName: 'Bob',
      businessName: 'Beta Distribution',
      state: 'NY',
      stripeAccountId: null,
      stripeAccountStatus: 'PENDING',
    });

    expect(result).toEqual({ stripeAccountId: 'acct_new', created: true });
    expect(mockStripeInstance.accounts.create).toHaveBeenCalledTimes(1);
    expect(mockStripeInstance.accounts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'express',
        country: 'US',
        email: 'b@c.co',
        metadata: { wholesalehub_wholesaler_id: 'whs_2' },
      }),
    );
    expect(mockPrisma.wholesaler.update).toHaveBeenCalledWith({
      where: { id: 'whs_2' },
      data: {
        stripeAccountId: 'acct_new',
        stripeAccountStatus: 'PENDING',
      },
    });
  });

  it('is idempotent across two consecutive calls (no double-create)', async () => {
    mockStripeInstance.accounts.create.mockResolvedValueOnce({
      id: 'acct_idem',
      object: 'account',
    });

    // First call creates
    const first = await createConnectedAccount({
      id: 'whs_3',
      contactEmail: 'c@d.co',
      contactName: 'Carol',
      businessName: 'Gamma Goods',
      state: 'TX',
      stripeAccountId: null,
      stripeAccountStatus: 'PENDING',
    });
    expect(first.created).toBe(true);

    // Second call — wholesaler now has an id; SDK must NOT be called again.
    const second = await createConnectedAccount({
      id: 'whs_3',
      contactEmail: 'c@d.co',
      contactName: 'Carol',
      businessName: 'Gamma Goods',
      state: 'TX',
      stripeAccountId: 'acct_idem',
      stripeAccountStatus: 'PENDING',
    });
    expect(second.created).toBe(false);
    expect(second.stripeAccountId).toBe('acct_idem');

    // Critical: only ONE Stripe API call across the two invocations.
    expect(mockStripeInstance.accounts.create).toHaveBeenCalledTimes(1);
  });
});

// ─── payments.ts: pure money math ──────────────────────────────────────────

describe('computeApplicationFee', () => {
  it('computes 2% of $100 as $2.00', () => {
    const fee = computeApplicationFee(new Prisma.Decimal('100.00'), 200);
    expect(fee.toString()).toBe('2');
  });

  it('computes 1.50% of $200 as $3.00', () => {
    const fee = computeApplicationFee(new Prisma.Decimal('200.00'), 150);
    expect(fee.toString()).toBe('3');
  });

  it('rounds half-up to 2 decimal places', () => {
    // 2% of 12.345 = 0.2469 → rounds to 0.25
    const fee = computeApplicationFee(new Prisma.Decimal('12.345'), 200);
    expect(fee.toString()).toBe('0.25');
  });

  it('returns 0 when bps is 0', () => {
    expect(
      computeApplicationFee(new Prisma.Decimal('99.99'), 0).toString(),
    ).toBe('0');
  });

  it('handles fractional cent results correctly', () => {
    // 2.5% of 0.10 = 0.0025 → rounds to 0.00 (HALF_UP at 2dp)
    const fee = computeApplicationFee(new Prisma.Decimal('0.10'), 250);
    expect(fee.toString()).toBe('0');
  });
});

describe('amountInCents', () => {
  it('converts $100.00 to 10000 cents', () => {
    expect(amountInCents(new Prisma.Decimal('100.00'))).toBe(10000);
  });

  it('converts $0.99 to 99 cents', () => {
    expect(amountInCents(new Prisma.Decimal('0.99'))).toBe(99);
  });

  it('converts $12.34 to 1234 cents', () => {
    expect(amountInCents(new Prisma.Decimal('12.34'))).toBe(1234);
  });

  it('throws on negative amounts', () => {
    expect(() => amountInCents(new Prisma.Decimal('-1.00'))).toThrow();
  });
});

describe('getApplicationFeeBps', () => {
  it('returns 200 (default) when env var unset', () => {
    delete process.env.STRIPE_APPLICATION_FEE_BPS;
    expect(getApplicationFeeBps()).toBe(200);
  });

  it('returns the env value when valid', () => {
    process.env.STRIPE_APPLICATION_FEE_BPS = '500';
    expect(getApplicationFeeBps()).toBe(500);
  });

  it('falls back to default on garbage env value', () => {
    process.env.STRIPE_APPLICATION_FEE_BPS = 'not-a-number';
    expect(getApplicationFeeBps()).toBe(200);
  });

  it('falls back to default on out-of-range value', () => {
    process.env.STRIPE_APPLICATION_FEE_BPS = '20000'; // > 100%
    expect(getApplicationFeeBps()).toBe(200);
  });

  it('falls back to default on negative value', () => {
    process.env.STRIPE_APPLICATION_FEE_BPS = '-50';
    expect(getApplicationFeeBps()).toBe(200);
  });
});

// ─── payments.ts: createPaymentIntentForOrder ──────────────────────────────

describe('createPaymentIntentForOrder', () => {
  it('passes amount + application_fee_amount + transfer_data to Stripe', async () => {
    process.env.STRIPE_APPLICATION_FEE_BPS = '200'; // 2%
    mockStripeInstance.paymentIntents.create.mockResolvedValueOnce({
      id: 'pi_test_1',
      client_secret: 'pi_test_1_secret_x',
      currency: 'usd',
      status: 'requires_payment_method',
    });

    const result = await createPaymentIntentForOrder({
      id: 'ord_1',
      orderNumber: 'ORD-0001',
      totalAmount: new Prisma.Decimal('123.45'),
      retailerId: 'rt_1',
      wholesalerId: 'whs_1',
      wholesaler: { stripeAccountId: 'acct_seller' },
    });

    expect(mockStripeInstance.paymentIntents.create).toHaveBeenCalledTimes(1);
    const [params, options] =
      mockStripeInstance.paymentIntents.create.mock.calls[0];

    expect(params).toEqual(
      expect.objectContaining({
        amount: 12345, // 123.45 → 12345 cents
        currency: 'usd',
        application_fee_amount: 247, // 2% of 12345 = 246.9 → rounded HALF_UP to 247
        transfer_data: { destination: 'acct_seller' },
        metadata: expect.objectContaining({
          wholesalehub_order_id: 'ord_1',
          wholesalehub_order_number: 'ORD-0001',
          wholesalehub_retailer_id: 'rt_1',
          wholesalehub_wholesaler_id: 'whs_1',
          application_fee_bps: '200',
        }),
      }),
    );

    // Stripe SDK idempotency key keyed by order id.
    expect(options).toEqual({ idempotencyKey: 'pi_create_ord_1' });

    expect(result).toEqual({
      paymentIntentId: 'pi_test_1',
      clientSecret: 'pi_test_1_secret_x',
      applicationFee: expect.any(Object), // Prisma.Decimal
    });
    expect(result.applicationFee.toString()).toBe('2.47');

    expect(mockPrisma.stripePaymentIntent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'ord_1',
        stripeIntentId: 'pi_test_1',
        currency: 'usd',
        status: 'REQUIRES_PAYMENT_METHOD',
        clientSecret: 'pi_test_1_secret_x',
      }),
    });
  });

  it('uses STRIPE_APPLICATION_FEE_BPS env value when set', async () => {
    process.env.STRIPE_APPLICATION_FEE_BPS = '500'; // 5%
    mockStripeInstance.paymentIntents.create.mockResolvedValueOnce({
      id: 'pi_test_2',
      client_secret: 'sec_2',
      currency: 'usd',
      status: 'requires_payment_method',
    });

    await createPaymentIntentForOrder({
      id: 'ord_2',
      orderNumber: 'ORD-0002',
      totalAmount: new Prisma.Decimal('100.00'),
      retailerId: 'rt_2',
      wholesalerId: 'whs_2',
      wholesaler: { stripeAccountId: 'acct_seller_2' },
    });

    const [params] = mockStripeInstance.paymentIntents.create.mock.calls[0];
    // 5% of 10000 cents = 500 cents
    expect(params.application_fee_amount).toBe(500);
    expect(params.metadata.application_fee_bps).toBe('500');
  });

  it('throws when wholesaler has no stripeAccountId', async () => {
    await expect(
      createPaymentIntentForOrder({
        id: 'ord_3',
        orderNumber: 'ORD-0003',
        totalAmount: new Prisma.Decimal('50.00'),
        retailerId: 'rt_3',
        wholesalerId: 'whs_3',
        wholesaler: { stripeAccountId: null },
      }),
    ).rejects.toThrow(/no Stripe Connect account/);
    expect(mockStripeInstance.paymentIntents.create).not.toHaveBeenCalled();
  });
});

// ─── payments.ts: status mapping ───────────────────────────────────────────

describe('mapPaymentIntentStatus', () => {
  it('maps known Stripe statuses (snake_case) to our enum (SCREAMING_SNAKE)', () => {
    expect(mapPaymentIntentStatus('requires_payment_method')).toBe(
      'REQUIRES_PAYMENT_METHOD',
    );
    expect(mapPaymentIntentStatus('succeeded')).toBe('SUCCEEDED');
    expect(mapPaymentIntentStatus('processing')).toBe('PROCESSING');
    expect(mapPaymentIntentStatus('canceled')).toBe('CANCELED');
    expect(mapPaymentIntentStatus('requires_capture')).toBe('REQUIRES_CAPTURE');
  });

  it('falls back to FAILED on unrecognised statuses', () => {
    expect(mapPaymentIntentStatus('some_future_status')).toBe('FAILED');
  });
});

// ─── webhook signature verification ────────────────────────────────────────
//
// We test the webhook handler's interaction with the Stripe SDK's
// `webhooks.constructEvent` rather than the SDK's signature math itself —
// the SDK is the authority on signature verification. The tests pin the
// contract: invalid sigs → 400, valid sigs → 200 + handler dispatch.

describe('webhook handler signature verification', () => {
  // Lazily import after env is ready and mocks are in place.
  let webhookRoute: typeof import('@/app/api/webhooks/stripe/route');

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';
    webhookRoute = await import('@/app/api/webhooks/stripe/route');
  });

  function makeRequest(body: string, signature: string | null): Request {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (signature !== null) headers['stripe-signature'] = signature;
    return new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers,
      body,
    });
  }

  it('returns 400 when Stripe signature header is missing', async () => {
    const req = makeRequest('{"id":"evt_1"}', null);
    const res = await webhookRoute.POST(req as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when signature verification fails', async () => {
    mockStripeInstance.webhooks.constructEvent.mockImplementationOnce(() => {
      throw new Error('No signatures found matching the expected signature');
    });

    const req = makeRequest('{"id":"evt_x"}', 't=123,v1=bad');
    const res = await webhookRoute.POST(req as never);
    expect(res.status).toBe(400);
  });

  it('returns 200 + dispatches when signature is valid (account.updated)', async () => {
    mockStripeInstance.webhooks.constructEvent.mockReturnValueOnce({
      id: 'evt_valid',
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_xyz',
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
          requirements: { disabled_reason: null },
        },
      },
    });
    mockPrisma.wholesaler.findUnique.mockResolvedValueOnce(null); // unknown account → log and continue

    const req = makeRequest('{"id":"evt_valid"}', 't=123,v1=ok');
    const res = await webhookRoute.POST(req as never);

    expect(res.status).toBe(200);
    expect(mockStripeInstance.webhooks.constructEvent).toHaveBeenCalledTimes(1);
    expect(mockStripeInstance.webhooks.constructEvent).toHaveBeenCalledWith(
      '{"id":"evt_valid"}',
      't=123,v1=ok',
      'whsec_test_dummy',
    );
  });

  it('returns 200 + logs unhandled event types as no-ops', async () => {
    mockStripeInstance.webhooks.constructEvent.mockReturnValueOnce({
      id: 'evt_unhandled',
      type: 'customer.subscription.created',
      data: { object: {} },
    });

    const req = makeRequest('{"id":"evt_unhandled"}', 't=1,v1=ok');
    const res = await webhookRoute.POST(req as never);

    expect(res.status).toBe(200);
  });

  it('updates StripePaymentIntent row on payment_intent.succeeded', async () => {
    mockStripeInstance.webhooks.constructEvent.mockReturnValueOnce({
      id: 'evt_pi_ok',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_ok',
          status: 'succeeded',
          amount: 10000,
        },
      },
    });

    const req = makeRequest('{}', 't=1,v1=ok');
    const res = await webhookRoute.POST(req as never);

    expect(res.status).toBe(200);
    expect(mockPrisma.stripePaymentIntent.updateMany).toHaveBeenCalledWith({
      where: { stripeIntentId: 'pi_ok' },
      data: expect.objectContaining({
        status: 'SUCCEEDED',
        capturedAt: expect.any(Date),
        lastError: null,
      }),
    });
  });

  it('updates StripePaymentIntent row + lastError on payment_intent.payment_failed', async () => {
    mockStripeInstance.webhooks.constructEvent.mockReturnValueOnce({
      id: 'evt_pi_fail',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_fail',
          status: 'requires_payment_method',
          last_payment_error: { message: 'Your card was declined.' },
        },
      },
    });

    const req = makeRequest('{}', 't=1,v1=ok');
    const res = await webhookRoute.POST(req as never);

    expect(res.status).toBe(200);
    expect(mockPrisma.stripePaymentIntent.updateMany).toHaveBeenCalledWith({
      where: { stripeIntentId: 'pi_fail' },
      data: expect.objectContaining({
        status: 'FAILED',
        lastError: 'Your card was declined.',
      }),
    });
  });
});

// ─── webhook handler — config gating ──────────────────────────────────────

describe('webhook handler — Stripe config gating', () => {
  it('returns 503 when STRIPE_SECRET_KEY is unset', async () => {
    setStripeKey(undefined);
    // Re-import to pick up the env change for `isStripeConfigured`.
    jest.resetModules();
    const route = await import('@/app/api/webhooks/stripe/route');

    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
    const res = await route.POST(req as never);
    expect(res.status).toBe(503);
  });
});
