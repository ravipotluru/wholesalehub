import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';

const bodySchema = z
  .object({
    /** How far back to look for "the usual". Default 90 days. */
    lookbackDays: z.number().int().min(7).max(365).default(90),
    replaceCart: z.boolean().default(false),
  })
  .strict();

interface SubstitutionNote {
  productName: string;
  fromWholesaler: string;
  toWholesaler: string;
  unitPrice: string;
}

interface SkipNote {
  productName: string;
  reason: 'OUT_OF_STOCK_EVERYWHERE' | 'RESTRICTED_IN_STATE' | 'NO_ACTIVE_LISTING';
}

/**
 * POST /api/orders/smart-reorder — rebuild the buyer's recurring basket from
 * order history, substituting dead lines with the best alternative supplier.
 *
 * This is the cross-supplier feature no single distributor can offer:
 *  - every product ordered in the lookback window goes back in the cart at
 *    its most recent quantity, from its most recent supplier when possible;
 *  - lines whose listing is gone / out of stock are SWAPPED to the cheapest
 *    in-stock PUBLIC listing from any other wholesaler (substitution noted);
 *  - products restricted in the retailer's state are skipped with the reason
 *    (flavor bans change month to month — silently re-adding a banned SKU
 *    would hand the buyer a compliance violation).
 *
 * Deterministic by design: no LLM in the loop, so behavior is identical with
 * or without AWS credentials. The conversational layer (Order Concierge) can
 * sit on top of this endpoint later.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthedUser();
  if (!user) {
    return apiError({ status: 401, code: 'UNAUTHORIZED', message: 'Sign in required.' });
  }
  if (user.role !== 'RETAILER' || !user.retailerId) {
    return apiError({
      status: 403,
      code: 'RETAILER_ONLY',
      message: 'Smart reorder is for retailer accounts.',
    });
  }
  const retailerId = user.retailerId;

  let lookbackDays = 90;
  let replaceCart = false;
  const text = await request.text();
  if (text.length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return apiError({ status: 400, code: 'INVALID_JSON', message: 'Body must be JSON.' });
    }
    const validation = bodySchema.safeParse(parsed);
    if (!validation.success) {
      return apiError({
        status: 400,
        code: 'VALIDATION_FAILED',
        message: 'Invalid options.',
        details: { fieldErrors: validation.error.flatten().fieldErrors },
      });
    }
    lookbackDays = validation.data.lookbackDays;
    replaceCart = validation.data.replaceCart;
  }

  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const [retailer, recentOrders] = await Promise.all([
    prisma.retailer.findUnique({
      where: { id: retailerId },
      select: { state: true },
    }),
    prisma.order.findMany({
      where: {
        retailerId,
        orderDate: { gte: since },
        orderStatus: { notIn: ['CANCELLED', 'REJECTED'] },
      },
      orderBy: { orderDate: 'desc' },
      select: {
        wholesalerId: true,
        orderDate: true,
        lines: {
          select: { productId: true, productName: true, quantityOrdered: true },
        },
      },
    }),
  ]);

  if (recentOrders.length === 0) {
    return NextResponse.json({
      added: 0,
      substituted: [],
      skipped: [],
      message: `No orders in the last ${lookbackDays} days to rebuild from.`,
    });
  }

  // Most-recent-first aggregation: the newest order's qty + supplier win.
  const usual = new Map<
    string,
    { productName: string; quantity: number; lastWholesalerId: string }
  >();
  for (const order of recentOrders) {
    for (const line of order.lines) {
      if (!usual.has(line.productId)) {
        usual.set(line.productId, {
          productName: line.productName,
          quantity: line.quantityOrdered,
          lastWholesalerId: order.wholesalerId,
        });
      }
    }
  }

  const productIds = Array.from(usual.keys());
  const pricings = await prisma.productPricing.findMany({
    where: {
      productId: { in: productIds },
      isActive: true,
      visibility: 'PUBLIC',
    },
    select: {
      productId: true,
      wholesalerId: true,
      wholesalePrice: true,
      stockStatus: true,
      wholesaler: { select: { name: true, status: true } },
      product: { select: { restrictedStates: true } },
    },
  });

  const byProduct = new Map<string, typeof pricings>();
  for (const p of pricings) {
    const list = byProduct.get(p.productId) ?? [];
    list.push(p);
    byProduct.set(p.productId, list);
  }

  const retailerState = retailer?.state ?? null;
  const toAdd: Array<{
    productId: string;
    wholesalerId: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
  }> = [];
  const substituted: SubstitutionNote[] = [];
  const skipped: SkipNote[] = [];

  for (const [productId, want] of usual) {
    const candidates = (byProduct.get(productId) ?? []).filter(
      (p) => p.wholesaler.status === 'ACTIVE',
    );
    if (candidates.length === 0) {
      skipped.push({ productName: want.productName, reason: 'NO_ACTIVE_LISTING' });
      continue;
    }

    // State legality first — a banned SKU must never silently re-enter a cart.
    const restricted = candidates[0].product.restrictedStates;
    if (
      retailerState &&
      Array.isArray(restricted) &&
      (restricted as unknown[]).includes(retailerState)
    ) {
      skipped.push({ productName: want.productName, reason: 'RESTRICTED_IN_STATE' });
      continue;
    }

    const inStock = candidates.filter((p) => p.stockStatus !== 'OUT_OF_STOCK');
    if (inStock.length === 0) {
      skipped.push({ productName: want.productName, reason: 'OUT_OF_STOCK_EVERYWHERE' });
      continue;
    }

    const preferred = inStock.find((p) => p.wholesalerId === want.lastWholesalerId);
    if (preferred) {
      toAdd.push({
        productId,
        wholesalerId: preferred.wholesalerId,
        quantity: want.quantity,
        unitPrice: preferred.wholesalePrice,
      });
      continue;
    }

    // Substitute: cheapest in-stock listing from any other supplier.
    const cheapest = inStock.reduce((best, p) =>
      p.wholesalePrice.lessThan(best.wholesalePrice) ? p : best,
    );
    const previous = candidates.find((p) => p.wholesalerId === want.lastWholesalerId);
    toAdd.push({
      productId,
      wholesalerId: cheapest.wholesalerId,
      quantity: want.quantity,
      unitPrice: cheapest.wholesalePrice,
    });
    substituted.push({
      productName: want.productName,
      fromWholesaler: previous?.wholesaler.name ?? 'previous supplier',
      toWholesaler: cheapest.wholesaler.name,
      unitPrice: cheapest.wholesalePrice.toFixed(2),
    });
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (replaceCart) {
        await tx.cartItem.deleteMany({ where: { retailerId } });
      }
      for (const a of toAdd) {
        await tx.cartItem.upsert({
          where: {
            retailerId_productId_wholesalerId: {
              retailerId,
              productId: a.productId,
              wholesalerId: a.wholesalerId,
            },
          },
          update: { quantity: a.quantity, unitPrice: a.unitPrice },
          create: {
            retailerId,
            productId: a.productId,
            wholesalerId: a.wholesalerId,
            quantity: a.quantity,
            unitPrice: a.unitPrice,
          },
        });
      }
    });
  } catch (error) {
    logger.error({
      event: 'smart_reorder_cart_failed',
      retailerId,
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'SMART_REORDER_FAILED',
      message: 'Could not update the cart. Try again.',
    });
  }

  logger.info({
    event: 'smart_reorder',
    retailerId,
    lookbackDays,
    added: toAdd.length,
    substitutions: substituted.length,
    skipped: skipped.length,
  });

  return NextResponse.json({
    added: toAdd.length,
    substituted,
    skipped,
  });
}
