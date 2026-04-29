import { Prisma } from '@prisma/client';

/**
 * Reorder-from-history core logic.
 *
 * Given an original order's lines and the *current* `ProductPricing` rows
 * for those (productId, wholesalerId) pairs, decides which lines can be
 * cloned back into the cart and which must be skipped (and why).
 *
 * Pure / sync — kept here so the route handler in
 * `src/app/api/orders/[id]/route.ts` stays a thin transaction wrapper and
 * the rules below are unit-testable without a Next.js request mock.
 *
 * Skip reasons, in priority order:
 *   1. PRODUCT_NOT_FOUND  — no `ProductPricing` row for the original
 *                            (productId, wholesalerId). The wholesaler
 *                            stopped carrying the SKU.
 *   2. PRICING_INACTIVE   — pricing exists but `isActive === false`.
 *   3. OUT_OF_STOCK       — pricing is active but `stockStatus` is OUT_OF_STOCK.
 *
 * Pricing snapshot: cart rows store a `unitPrice` snapshot for display;
 * checkout always re-prices via `selectUnitPrice`. We snapshot the cheaper
 * of {current wholesalePrice, active promoPrice} — the same shape the cart
 * POST handler uses today (see `src/app/api/cart/route.ts`). Tier discounts
 * are applied at checkout, not at cart-add, so we don't compute them here.
 */

export type ReorderSkipReason =
  | 'PRODUCT_NOT_FOUND'
  | 'PRICING_INACTIVE'
  | 'OUT_OF_STOCK';

export interface OriginalLineLike {
  productId: string;
  productName: string;
  quantityOrdered: number;
  wholesalerId: string;
}

/**
 * Minimal shape of a `ProductPricing` row this function needs. Anything the
 * Prisma model has that isn't listed here is intentionally ignored — keeps
 * test fixtures small and the contract obvious.
 */
export interface CurrentPricingLike {
  productId: string;
  wholesalerId: string;
  isActive: boolean;
  stockStatus: string;
  wholesalePrice: Prisma.Decimal | string | number;
  promoPrice: Prisma.Decimal | string | number | null;
  onPromotion: boolean;
}

export interface ReorderOptions {
  /** When true the caller will clear existing cart items before adding. */
  replaceCart?: boolean;
}

export interface ReorderAction {
  productId: string;
  wholesalerId: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  productName: string;
}

export interface ReorderSkippedItem {
  productId: string;
  wholesalerId: string;
  productName: string;
  reason: ReorderSkipReason;
}

export interface ReorderPlan {
  toAdd: ReorderAction[];
  skipped: ReorderSkippedItem[];
  /** Echo of `options.replaceCart`. The caller uses it to decide whether to
   *  `cartItem.deleteMany` before upserting. Returned here so tests can
   *  assert the flag without spinning up the route handler. */
  cartReplaced: boolean;
}

function toDecimal(v: Prisma.Decimal | string | number): Prisma.Decimal {
  return v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v.toString());
}

/**
 * Snapshot price for the cart row. Mirrors the cart POST handler:
 * `pricing.onPromotion && pricing.promoPrice ? promoPrice : wholesalePrice`.
 * Re-pricing for tiers happens at checkout via `selectUnitPrice`.
 */
function snapshotUnitPrice(pricing: CurrentPricingLike): Prisma.Decimal {
  if (pricing.onPromotion && pricing.promoPrice !== null) {
    return toDecimal(pricing.promoPrice);
  }
  return toDecimal(pricing.wholesalePrice);
}

export function buildReorderActions(
  originalLines: OriginalLineLike[],
  currentPricings: CurrentPricingLike[],
  options: ReorderOptions = {},
): ReorderPlan {
  const pricingByKey = new Map<string, CurrentPricingLike>();
  for (const p of currentPricings) {
    pricingByKey.set(`${p.productId}:${p.wholesalerId}`, p);
  }

  const toAdd: ReorderAction[] = [];
  const skipped: ReorderSkippedItem[] = [];

  for (const line of originalLines) {
    const key = `${line.productId}:${line.wholesalerId}`;
    const pricing = pricingByKey.get(key);

    if (!pricing) {
      skipped.push({
        productId: line.productId,
        wholesalerId: line.wholesalerId,
        productName: line.productName,
        reason: 'PRODUCT_NOT_FOUND',
      });
      continue;
    }

    if (!pricing.isActive) {
      skipped.push({
        productId: line.productId,
        wholesalerId: line.wholesalerId,
        productName: line.productName,
        reason: 'PRICING_INACTIVE',
      });
      continue;
    }

    if (pricing.stockStatus === 'OUT_OF_STOCK') {
      skipped.push({
        productId: line.productId,
        wholesalerId: line.wholesalerId,
        productName: line.productName,
        reason: 'OUT_OF_STOCK',
      });
      continue;
    }

    toAdd.push({
      productId: line.productId,
      wholesalerId: line.wholesalerId,
      quantity: line.quantityOrdered,
      unitPrice: snapshotUnitPrice(pricing),
      productName: line.productName,
    });
  }

  return {
    toAdd,
    skipped,
    cartReplaced: options.replaceCart === true,
  };
}
