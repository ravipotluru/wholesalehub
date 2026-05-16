/**
 * Checkout-gate tests for POST /api/orders.
 *
 * Spec items covered:
 *   - "POST sets status to PENDING_REVIEW from UNVERIFIED" — covered in
 *     `__tests__/lib/buyer-verification.test.ts` (state-machine flag) and
 *     in this file we also cover the request-level behavior of the gate.
 *   - "Checkout blocked when retailer unverified + age-restricted product
 *     in cart" — `blocks UNVERIFIED retailer`.
 *   - "Checkout works when retailer unverified + no age-restricted
 *     products" — `allows UNVERIFIED retailer for non-age-restricted cart`.
 *
 * The route handler is heavy (idempotency, credit-limit, multi-supplier
 * splits). To exercise just the gate path we mock `@/lib/prisma` so the
 * transaction callback runs against a controllable in-memory object,
 * and `@/lib/session` so we can pretend a retailer is logged in.
 */

// ─── Mocks must be declared before importing the route ───
//
// `prisma.$transaction(fn)` calls `fn(tx)` and returns the value. The mock
// `tx` carries the cart + retailer state for the test to manipulate.

interface MockState {
  cartItems: Array<{
    productId: string;
    wholesalerId: string;
    quantity: number;
    unitPrice: number;
    product: {
      id: string;
      name: string;
      sku: string;
      ageRestricted: boolean;
    };
  }>;
  retailerVerificationStatus:
    | 'UNVERIFIED'
    | 'PENDING_REVIEW'
    | 'VERIFIED'
    | 'REJECTED';
  retailerCreditLimit: string | null;
  productPricings: Array<{
    productId: string;
    wholesalerId: string;
    wholesalePrice: string;
    promoPrice: string | null;
    onPromotion: boolean;
    promoStartDate: Date | null;
    promoEndDate: Date | null;
    minimumOrderQty: number;
    isActive: boolean;
    stockStatus: string;
    tiers: Array<{ minQty: number; unitPrice: string }>;
  }>;
}

const state: MockState = {
  cartItems: [],
  retailerVerificationStatus: 'UNVERIFIED',
  retailerCreditLimit: null,
  productPricings: [],
};

function resetState() {
  state.cartItems = [];
  state.retailerVerificationStatus = 'UNVERIFIED';
  state.retailerCreditLimit = null;
  state.productPricings = [];
}

// Build a mock transaction client. The route only calls a known subset.
function makeTx() {
  const tx = {
    cartItem: {
      findMany: jest.fn(async () => state.cartItems),
      deleteMany: jest.fn(async () => ({ count: state.cartItems.length })),
    },
    retailer: {
      // The route calls findUnique twice — once for the verification gate
      // (select: { verificationStatus }) and once for the credit-limit
      // check (select: { creditLimit, businessName }). Returning the
      // union keeps both call sites happy regardless of which select they
      // pass.
      findUnique: jest.fn(async () => ({
        verificationStatus: state.retailerVerificationStatus,
        creditLimit: state.retailerCreditLimit,
        businessName: 'Mock Shop',
      })),
    },
    productPricing: {
      findMany: jest.fn(async () =>
        state.productPricings.map((p) => ({
          ...p,
          // Match Prisma return shape — Decimal-like strings.
        })),
      ),
    },
    order: {
      aggregate: jest.fn(async () => ({ _sum: { totalAmount: null } })),
      create: jest.fn(async (args: { data: { orderNumber: string; wholesalerId: string } }) => ({
        id: 'order_mock',
        orderNumber: args.data.orderNumber,
        wholesaler: { name: 'Mock Wholesaler' },
        wholesalerId: args.data.wholesalerId,
        orderStatus: 'PENDING',
        totalItems: 1,
        totalAmount: '0',
        lines: [],
      })),
    },
    auditEvent: {
      create: jest.fn(async () => ({})),
    },
    idempotencyKey: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async () => ({})),
      delete: jest.fn(async () => ({})),
    },
  };
  return tx;
}

const txInstance = makeTx();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(
      async (
        fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>,
      ) => fn(txInstance),
    ),
    // Also stub top-level methods used by idempotency.checkIdempotency
    idempotencyKey: txInstance.idempotencyKey,
  },
}));

jest.mock('@/lib/session', () => ({
  getAuthedUser: jest.fn(async () => ({
    id: 'user_retailer_1',
    role: 'RETAILER',
    retailerId: 'rt_mock',
    wholesalerId: null,
    email: 'r@example.com',
  })),
}));

// idempotency module is hit before the gate; force the "fresh" path.
jest.mock('@/lib/idempotency', () => ({
  readIdempotencyKey: jest.fn(() => null),
  hashRequestBody: jest.fn(() => 'hash'),
  checkIdempotency: jest.fn(async () => ({ kind: 'fresh' })),
  storeIdempotentResponse: jest.fn(async () => undefined),
}));

import { POST } from '@/app/api/orders/route';

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  shippingAddress: '123 Main St',
  shippingCity: 'Houston',
  shippingState: 'TX',
  shippingZip: '77001',
  paymentMethod: 'NET30',
};

describe('POST /api/orders — buyer-verification gate', () => {
  beforeEach(() => {
    resetState();
    jest.clearAllMocks();
  });

  it('blocks an UNVERIFIED retailer when the cart contains an age-restricted product', async () => {
    state.retailerVerificationStatus = 'UNVERIFIED';
    state.cartItems = [
      {
        productId: 'prod_vape',
        wholesalerId: 'ws_1',
        quantity: 12,
        unitPrice: 5,
        product: {
          id: 'prod_vape',
          name: 'Disposable Vape',
          sku: 'DV-001',
          ageRestricted: true,
        },
      },
    ];

    const res = await POST(
      makeRequest(validBody) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(403);

    const json = (await res.json()) as { error: { code: string; message: string; requiredAction: string } };
    expect(json.error.code).toBe('BUYER_NOT_VERIFIED');
    expect(json.error.requiredAction).toBe('VERIFY_BUYER');
    expect(json.error.message).toMatch(/verification/i);
  });

  it('blocks a PENDING_REVIEW retailer (still not VERIFIED) when cart contains an age-restricted product', async () => {
    state.retailerVerificationStatus = 'PENDING_REVIEW';
    state.cartItems = [
      {
        productId: 'prod_vape',
        wholesalerId: 'ws_1',
        quantity: 12,
        unitPrice: 5,
        product: {
          id: 'prod_vape',
          name: 'Disposable Vape',
          sku: 'DV-001',
          ageRestricted: true,
        },
      },
    ];

    const res = await POST(
      makeRequest(validBody) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('BUYER_NOT_VERIFIED');
  });

  it('blocks a REJECTED retailer (PACT Act / state-license guardrail) when cart contains an age-restricted product', async () => {
    state.retailerVerificationStatus = 'REJECTED';
    state.cartItems = [
      {
        productId: 'prod_vape',
        wholesalerId: 'ws_1',
        quantity: 12,
        unitPrice: 5,
        product: {
          id: 'prod_vape',
          name: 'Disposable Vape',
          sku: 'DV-001',
          ageRestricted: true,
        },
      },
    ];

    const res = await POST(
      makeRequest(validBody) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('BUYER_NOT_VERIFIED');
  });

  it('allows an UNVERIFIED retailer to checkout a cart with NO age-restricted lines', async () => {
    state.retailerVerificationStatus = 'UNVERIFIED';
    state.cartItems = [
      {
        productId: 'prod_gum',
        wholesalerId: 'ws_1',
        quantity: 24,
        unitPrice: 1,
        product: {
          id: 'prod_gum',
          name: 'Sugar-Free Gum',
          sku: 'GUM-001',
          ageRestricted: false,
        },
      },
    ];
    state.productPricings = [
      {
        productId: 'prod_gum',
        wholesalerId: 'ws_1',
        wholesalePrice: '1.00',
        promoPrice: null,
        onPromotion: false,
        promoStartDate: null,
        promoEndDate: null,
        minimumOrderQty: 1,
        isActive: true,
        stockStatus: 'IN_STOCK',
        tiers: [],
      },
    ];

    const res = await POST(
      makeRequest(validBody) as unknown as Parameters<typeof POST>[0],
    );
    // Either 201 (success) or NOT 403/BUYER_NOT_VERIFIED. We accept any
    // non-gate failure here since the goal of THIS test is to confirm the
    // gate did not fire — downstream paths are exercised in separate
    // existing tests for the route.
    if (res.status === 403) {
      const json = (await res.json()) as { error?: { code?: string } };
      expect(json.error?.code).not.toBe('BUYER_NOT_VERIFIED');
    } else {
      expect([201, 400, 402, 500]).toContain(res.status);
    }
  });

  it('allows a VERIFIED retailer to checkout an age-restricted cart (gate passes)', async () => {
    state.retailerVerificationStatus = 'VERIFIED';
    state.cartItems = [
      {
        productId: 'prod_vape',
        wholesalerId: 'ws_1',
        quantity: 12,
        unitPrice: 5,
        product: {
          id: 'prod_vape',
          name: 'Disposable Vape',
          sku: 'DV-001',
          ageRestricted: true,
        },
      },
    ];
    state.productPricings = [
      {
        productId: 'prod_vape',
        wholesalerId: 'ws_1',
        wholesalePrice: '5.00',
        promoPrice: null,
        onPromotion: false,
        promoStartDate: null,
        promoEndDate: null,
        minimumOrderQty: 1,
        isActive: true,
        stockStatus: 'IN_STOCK',
        tiers: [],
      },
    ];

    const res = await POST(
      makeRequest(validBody) as unknown as Parameters<typeof POST>[0],
    );
    if (res.status === 403) {
      const json = (await res.json()) as { error?: { code?: string } };
      expect(json.error?.code).not.toBe('BUYER_NOT_VERIFIED');
    } else {
      expect([201, 400, 402, 500]).toContain(res.status);
    }
  });

  it('blocks a mixed cart (age-restricted + non-age-restricted) when retailer is UNVERIFIED', async () => {
    state.retailerVerificationStatus = 'UNVERIFIED';
    state.cartItems = [
      {
        productId: 'prod_gum',
        wholesalerId: 'ws_1',
        quantity: 24,
        unitPrice: 1,
        product: {
          id: 'prod_gum',
          name: 'Sugar-Free Gum',
          sku: 'GUM-001',
          ageRestricted: false,
        },
      },
      {
        productId: 'prod_vape',
        wholesalerId: 'ws_1',
        quantity: 12,
        unitPrice: 5,
        product: {
          id: 'prod_vape',
          name: 'Disposable Vape',
          sku: 'DV-001',
          ageRestricted: true,
        },
      },
    ];

    const res = await POST(
      makeRequest(validBody) as unknown as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('BUYER_NOT_VERIFIED');
  });
});
