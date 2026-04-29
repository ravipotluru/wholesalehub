import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { canAccessOrder } from '@/lib/order-access';
import { buildReorderActions } from '@/lib/reorder';

const reorderBodySchema = z
  .object({
    replaceCart: z.boolean().optional(),
  })
  .strict();

/**
 * POST /api/orders/[id]/reorder — Clone an order's lines back into the cart.
 *
 * Only the original retailer (or ADMIN/ANALYST via `canAccessOrder`) may
 * reorder. We re-read the *current* `ProductPricing` for each historical
 * line and skip lines whose pricing has been deactivated, gone out of
 * stock, or whose wholesaler stopped carrying the SKU. Skipped lines come
 * back in the response so the UI can surface them to the buyer.
 *
 * The cart row's `unitPrice` is a snapshot — checkout always re-prices via
 * `selectUnitPrice` (tier discounts apply at the final quantity, not at
 * cart-add). See `src/lib/reorder.ts` for the pure rule logic.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'RETAILER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const retailerId = user.retailerId;
    if (!retailerId) {
      return NextResponse.json(
        { error: 'No retailer linked to this account' },
        { status: 403 },
      );
    }

    // Body is optional — POST with no body should still work.
    let replaceCart = false;
    const text = await request.text();
    if (text.length > 0) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
      const validation = reorderBodySchema.safeParse(parsed);
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: validation.error.flatten().fieldErrors },
          { status: 400 },
        );
      }
      replaceCart = validation.data.replaceCart === true;
    }

    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id: params.id }, { orderNumber: params.id }],
      },
      include: {
        lines: { orderBy: { lineNumber: 'asc' } },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (!canAccessOrder(user, order)) {
      logger.warn({
        event: 'order_reorder_denied',
        userId: user.id,
        role: user.role,
        orderId: order.id,
      });
      // Match the GET handler — return 404, not 403, so we don't confirm the
      // existence of the order to a probing attacker.
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Lookup pricings for every (productId, wholesalerId) pair on the
    // original order. Orders are single-supplier so wholesalerId is just
    // `order.wholesalerId`.
    const productIds = order.lines.map((l) => l.productId);
    const currentPricings = await prisma.productPricing.findMany({
      where: {
        wholesalerId: order.wholesalerId,
        productId: { in: productIds },
      },
    });

    // Decide what to add / skip — pure logic, separately tested.
    const plan = buildReorderActions(
      order.lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        quantityOrdered: l.quantityOrdered,
        wholesalerId: order.wholesalerId,
      })),
      currentPricings,
      { replaceCart },
    );

    // Cart writes inside one transaction so the optional clear + every
    // upsert land together. If any single upsert blows up we want the
    // cart untouched, not partly mutated.
    try {
      await prisma.$transaction(async (tx) => {
        if (plan.cartReplaced) {
          await tx.cartItem.deleteMany({ where: { retailerId } });
        }
        for (const a of plan.toAdd) {
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
    } catch (txError) {
      logger.error({
        event: 'order_reorder_cart_failed',
        orderId: order.id,
        retailerId,
        error: (txError as Error).message,
      });
      return NextResponse.json(
        { error: 'Failed to update cart' },
        { status: 400 },
      );
    }

    const responseSkipped = plan.skipped.map((s) => ({
      productName: s.productName,
      reason: s.reason,
    }));

    logger.info({
      event: 'order_reorder',
      orderId: order.id,
      retailerId,
      added: plan.toAdd.length,
      skipped: responseSkipped,
    });

    return NextResponse.json({
      added: plan.toAdd.length,
      skipped: responseSkipped,
      cartReplaced: plan.cartReplaced,
    });
  } catch (error) {
    logger.error({
      event: 'order_reorder_error',
      orderId: params.id,
      error: (error as Error).message,
    });
    return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 });
  }
}
