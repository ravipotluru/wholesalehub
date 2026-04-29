import { Prisma } from '@prisma/client';

/**
 * Pure tier-pricing selection. Given an ordered quantity, picks the tier
 * with the largest `minQty` that does not exceed the quantity. Returns the
 * cheapest of {base wholesale, matching tier, active promo} so the buyer
 * always gets the best deal.
 *
 * Inclusive minQty semantics: tiers `[{minQty:1, p:10}, {minQty:12, p:9},
 * {minQty:24, p:8}]` give:
 *   - qty  1..11 → 10
 *   - qty 12..23 → 9
 *   - qty 24+    → 8
 */
export interface TierLike {
  minQty: number;
  unitPrice: Prisma.Decimal | string | number;
}

export interface PricingLike {
  wholesalePrice: Prisma.Decimal | string | number;
  promoPrice: Prisma.Decimal | string | number | null;
  onPromotion: boolean;
  promoStartDate: Date | null;
  promoEndDate: Date | null;
}

export interface SelectedPrice {
  unitPrice: Prisma.Decimal;
  source: 'PROMO' | 'TIER' | 'BASE';
  appliedTierMinQty: number | null;
}

function toDecimal(v: Prisma.Decimal | string | number): Prisma.Decimal {
  return v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v.toString());
}

function isPromoActive(p: PricingLike, now: Date): boolean {
  if (!p.onPromotion || p.promoPrice === null) return false;
  if (p.promoStartDate && p.promoStartDate > now) return false;
  if (p.promoEndDate && p.promoEndDate < now) return false;
  return true;
}

export function selectUnitPrice(
  pricing: PricingLike,
  tiers: TierLike[],
  quantity: number,
  now: Date = new Date(),
): SelectedPrice {
  const base = toDecimal(pricing.wholesalePrice);

  // Find the cheapest applicable tier (largest minQty ≤ quantity wins on
  // price, but if two tiers are identical we still pick deterministically).
  const applicable = tiers.filter((t) => t.minQty <= quantity);
  let tierPrice: Prisma.Decimal | null = null;
  let tierMinQty: number | null = null;
  for (const t of applicable) {
    const p = toDecimal(t.unitPrice);
    if (tierPrice === null || p.lessThan(tierPrice)) {
      tierPrice = p;
      tierMinQty = t.minQty;
    }
  }

  const promoActive = isPromoActive(pricing, now);
  const promoPrice = promoActive && pricing.promoPrice !== null
    ? toDecimal(pricing.promoPrice)
    : null;

  const candidates: Array<{ price: Prisma.Decimal; source: SelectedPrice['source']; tier: number | null }> = [
    { price: base, source: 'BASE', tier: null },
  ];
  if (tierPrice !== null) candidates.push({ price: tierPrice, source: 'TIER', tier: tierMinQty });
  if (promoPrice !== null) candidates.push({ price: promoPrice, source: 'PROMO', tier: null });

  let best = candidates[0];
  for (const c of candidates) {
    if (c.price.lessThan(best.price)) best = c;
  }

  return {
    unitPrice: best.price,
    source: best.source,
    appliedTierMinQty: best.tier,
  };
}
