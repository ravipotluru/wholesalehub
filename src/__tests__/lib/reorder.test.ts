import { Prisma } from '@prisma/client';
import {
  buildReorderActions,
  type CurrentPricingLike,
  type OriginalLineLike,
} from '@/lib/reorder';
import { canAccessOrder } from '@/lib/order-access';

// ─── Fixtures ───

function makeLine(overrides: Partial<OriginalLineLike> = {}): OriginalLineLike {
  return {
    productId: 'prod-1',
    productName: 'Test Vape Pen',
    quantityOrdered: 5,
    wholesalerId: 'ws-1',
    ...overrides,
  };
}

function makePricing(
  overrides: Partial<CurrentPricingLike> = {},
): CurrentPricingLike {
  return {
    productId: 'prod-1',
    wholesalerId: 'ws-1',
    isActive: true,
    stockStatus: 'IN_STOCK',
    wholesalePrice: '10.00',
    promoPrice: null,
    onPromotion: false,
    ...overrides,
  };
}

// ─── Authorization (delegates to canAccessOrder) ───

describe('reorder authorization', () => {
  const order = { retailerId: 'rt-owner', wholesalerId: 'ws-owner' };

  it('allows the owning retailer to reorder', () => {
    expect(
      canAccessOrder(
        { role: 'RETAILER', retailerId: 'rt-owner', wholesalerId: null },
        order,
      ),
    ).toBe(true);
  });

  it('blocks a non-owner retailer (IDOR guard)', () => {
    expect(
      canAccessOrder(
        { role: 'RETAILER', retailerId: 'rt-other', wholesalerId: null },
        order,
      ),
    ).toBe(false);
  });

  it('canAccessOrder still allows the wholesaler — but the route additionally rejects role !== RETAILER', () => {
    // Documenting the contract: canAccessOrder is shared with GET /orders/[id]
    // and intentionally lets a wholesaler read their order. The reorder POST
    // adds a second check (`role === 'RETAILER'`) on top of canAccessOrder.
    expect(
      canAccessOrder(
        { role: 'WHOLESALER', retailerId: null, wholesalerId: 'ws-owner' },
        order,
      ),
    ).toBe(true);
  });
});

// ─── Pure-function: skip reasons ───

describe('buildReorderActions — skipping logic', () => {
  it('keeps a healthy line', () => {
    const plan = buildReorderActions([makeLine()], [makePricing()]);
    expect(plan.toAdd).toHaveLength(1);
    expect(plan.toAdd[0].productId).toBe('prod-1');
    expect(plan.toAdd[0].quantity).toBe(5);
    expect(plan.skipped).toHaveLength(0);
  });

  it('skips a line whose pricing is missing → PRODUCT_NOT_FOUND', () => {
    const plan = buildReorderActions(
      [makeLine({ productId: 'prod-gone' })],
      [makePricing()],
    );
    expect(plan.toAdd).toHaveLength(0);
    expect(plan.skipped).toEqual([
      {
        productId: 'prod-gone',
        wholesalerId: 'ws-1',
        productName: 'Test Vape Pen',
        reason: 'PRODUCT_NOT_FOUND',
      },
    ]);
  });

  it('skips a line whose pricing is inactive → PRICING_INACTIVE', () => {
    const plan = buildReorderActions(
      [makeLine()],
      [makePricing({ isActive: false })],
    );
    expect(plan.toAdd).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe('PRICING_INACTIVE');
  });

  it('skips a line whose stock is OUT_OF_STOCK', () => {
    const plan = buildReorderActions(
      [makeLine()],
      [makePricing({ stockStatus: 'OUT_OF_STOCK' })],
    );
    expect(plan.toAdd).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe('OUT_OF_STOCK');
  });

  it('PRICING_INACTIVE wins over OUT_OF_STOCK when both apply', () => {
    // A pricing row that's both inactive AND OOS reports the inactive
    // reason — that's the more actionable signal for the buyer (the
    // wholesaler intentionally retired the listing).
    const plan = buildReorderActions(
      [makeLine()],
      [makePricing({ isActive: false, stockStatus: 'OUT_OF_STOCK' })],
    );
    expect(plan.skipped[0].reason).toBe('PRICING_INACTIVE');
  });

  it('mixes kept + skipped lines correctly', () => {
    const lines: OriginalLineLike[] = [
      makeLine({ productId: 'p-a', productName: 'A' }),
      makeLine({ productId: 'p-b', productName: 'B' }),
      makeLine({ productId: 'p-c', productName: 'C' }),
      makeLine({ productId: 'p-d', productName: 'D' }),
    ];
    const pricings: CurrentPricingLike[] = [
      makePricing({ productId: 'p-a' }),
      makePricing({ productId: 'p-b', stockStatus: 'OUT_OF_STOCK' }),
      makePricing({ productId: 'p-c', isActive: false }),
      // p-d intentionally absent → PRODUCT_NOT_FOUND
    ];

    const plan = buildReorderActions(lines, pricings);
    expect(plan.toAdd.map((a) => a.productId)).toEqual(['p-a']);
    const reasonsByProduct = Object.fromEntries(
      plan.skipped.map((s) => [s.productId, s.reason]),
    );
    expect(reasonsByProduct).toEqual({
      'p-b': 'OUT_OF_STOCK',
      'p-c': 'PRICING_INACTIVE',
      'p-d': 'PRODUCT_NOT_FOUND',
    });
  });

  it('returns added: 0 when every line skips', () => {
    const lines: OriginalLineLike[] = [
      makeLine({ productId: 'p-a', productName: 'A' }),
      makeLine({ productId: 'p-b', productName: 'B' }),
    ];
    const pricings: CurrentPricingLike[] = [
      makePricing({ productId: 'p-a', isActive: false }),
      makePricing({ productId: 'p-b', stockStatus: 'OUT_OF_STOCK' }),
    ];

    const plan = buildReorderActions(lines, pricings);
    expect(plan.toAdd).toHaveLength(0);
    expect(plan.skipped).toHaveLength(2);
    // The route handler turns this directly into a 200 with `added: 0` —
    // the all-skipped case is informational, not an error.
  });
});

// ─── replaceCart flag ───

describe('buildReorderActions — replaceCart flag', () => {
  it('defaults to false', () => {
    const plan = buildReorderActions([], []);
    expect(plan.cartReplaced).toBe(false);
  });

  it('echoes replaceCart: true when set', () => {
    const plan = buildReorderActions([makeLine()], [makePricing()], {
      replaceCart: true,
    });
    expect(plan.cartReplaced).toBe(true);
    expect(plan.toAdd).toHaveLength(1);
  });

  it('still produces an action list even when replacing the cart', () => {
    // The flag does not change which lines are kept — it only signals to
    // the caller whether to clear the cart before upserting.
    const plan = buildReorderActions(
      [
        makeLine({ productId: 'p-keep' }),
        makeLine({ productId: 'p-skip' }),
      ],
      [
        makePricing({ productId: 'p-keep' }),
        makePricing({ productId: 'p-skip', isActive: false }),
      ],
      { replaceCart: true },
    );
    expect(plan.cartReplaced).toBe(true);
    expect(plan.toAdd).toHaveLength(1);
    expect(plan.skipped).toHaveLength(1);
  });
});

// ─── Pricing snapshot ───

describe('buildReorderActions — unitPrice snapshot', () => {
  it('uses the current wholesalePrice when no promo is active', () => {
    const plan = buildReorderActions(
      [makeLine()],
      [makePricing({ wholesalePrice: '12.50' })],
    );
    expect(plan.toAdd[0].unitPrice).toBeInstanceOf(Prisma.Decimal);
    expect(plan.toAdd[0].unitPrice.toString()).toBe('12.5');
  });

  it('uses the promoPrice when onPromotion + promoPrice present', () => {
    const plan = buildReorderActions(
      [makeLine()],
      [
        makePricing({
          wholesalePrice: '12.50',
          promoPrice: '8.99',
          onPromotion: true,
        }),
      ],
    );
    expect(plan.toAdd[0].unitPrice.toString()).toBe('8.99');
  });

  it('falls back to wholesalePrice when onPromotion is true but promoPrice is null', () => {
    const plan = buildReorderActions(
      [makeLine()],
      [
        makePricing({
          wholesalePrice: '12.50',
          promoPrice: null,
          onPromotion: true,
        }),
      ],
    );
    expect(plan.toAdd[0].unitPrice.toString()).toBe('12.5');
  });

  it('uses the *current* price, not the original line’s historical price', () => {
    // Critical: a buyer's original order may have been billed at $20, but
    // if the current wholesalePrice is $15 we snapshot $15. Re-pricing
    // happens at checkout regardless, but the snapshot drives the cart UI.
    const plan = buildReorderActions(
      [makeLine()],
      [makePricing({ wholesalePrice: '15.00' })],
    );
    expect(plan.toAdd[0].unitPrice.toString()).toBe('15');
  });

  it('preserves the original quantityOrdered as the cart quantity', () => {
    const plan = buildReorderActions(
      [makeLine({ quantityOrdered: 144 })],
      [makePricing()],
    );
    expect(plan.toAdd[0].quantity).toBe(144);
  });
});

// ─── Empty inputs ───

describe('buildReorderActions — edge cases', () => {
  it('returns empty plan for an empty order', () => {
    const plan = buildReorderActions([], []);
    expect(plan).toEqual({ toAdd: [], skipped: [], cartReplaced: false });
  });

  it('does not match a pricing with the same productId but different wholesalerId', () => {
    // An order is single-supplier; if the productId exists under another
    // wholesaler we must NOT silently substitute it.
    const plan = buildReorderActions(
      [makeLine({ wholesalerId: 'ws-1' })],
      [makePricing({ wholesalerId: 'ws-2' })],
    );
    expect(plan.toAdd).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe('PRODUCT_NOT_FOUND');
  });
});
