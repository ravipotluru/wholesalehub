import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { addToCartSchema } from '@/lib/validators';
import { logger } from '@/lib/logger';
import { capture } from '@/lib/analytics/posthog';

/** GET /api/cart — Get current user's cart items grouped by supplier */
export async function GET() {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const retailerId = user.retailerId;
    if (!retailerId) {
      return NextResponse.json({ error: 'Only retailers can have a cart' }, { status: 403 });
    }

    const cartItems = await prisma.cartItem.findMany({
      where: { retailerId },
      include: {
        product: {
          include: { category: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (cartItems.length === 0) {
      return NextResponse.json({
        groups: [],
        summary: { totalItems: 0, totalAmount: 0, allMoqMet: true },
      });
    }

    // Single batched lookup instead of N+1.
    const pricingPairs = cartItems.map((i) => ({
      productId: i.productId,
      wholesalerId: i.wholesalerId,
    }));

    const pricings = await prisma.productPricing.findMany({
      where: { OR: pricingPairs },
      include: { wholesaler: true },
    });

    const pricingByKey = new Map(
      pricings.map((p) => [`${p.productId}:${p.wholesalerId}`, p]),
    );

    const enrichedItems = cartItems.map((item) => {
      const pricing = pricingByKey.get(`${item.productId}:${item.wholesalerId}`);
      const moqRequired = pricing?.minimumOrderQty ?? 1;
      return {
        ...item,
        unitPrice: Number(item.unitPrice),
        wholesalerName: pricing?.wholesaler.name ?? 'Unknown',
        wholesalerCity: pricing?.wholesaler.city ?? '',
        wholesalerState: pricing?.wholesaler.state ?? '',
        moqRequired,
        moqMet: item.quantity >= moqRequired,
        stockStatus: pricing?.stockStatus ?? 'OUT_OF_STOCK',
        subtotal: Number(item.unitPrice) * item.quantity,
      };
    });

    type EnrichedItem = (typeof enrichedItems)[number];
    type Group = {
      wholesalerId: string;
      wholesalerName: string;
      city: string;
      state: string;
      items: EnrichedItem[];
      subtotal: number;
      allMoqMet: boolean;
    };

    const grouped: Record<string, Group> = {};

    for (const item of enrichedItems) {
      if (!grouped[item.wholesalerId]) {
        grouped[item.wholesalerId] = {
          wholesalerId: item.wholesalerId,
          wholesalerName: item.wholesalerName,
          city: item.wholesalerCity,
          state: item.wholesalerState,
          items: [],
          subtotal: 0,
          allMoqMet: true,
        };
      }
      grouped[item.wholesalerId].items.push(item);
      grouped[item.wholesalerId].subtotal += item.subtotal;
      if (!item.moqMet) {
        grouped[item.wholesalerId].allMoqMet = false;
      }
    }

    const groups = Object.values(grouped);
    const totalAmount = groups.reduce((sum, g) => sum + g.subtotal, 0);
    const allMoqMet = groups.every((g) => g.allMoqMet);

    return NextResponse.json({
      groups,
      summary: {
        totalItems: cartItems.length,
        totalAmount,
        allMoqMet,
      },
    });
  } catch (error) {
    logger.error({ event: 'cart_fetch_error', error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to fetch cart' }, { status: 500 });
  }
}

/** POST /api/cart — Add item to cart */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const retailerId = user.retailerId;
    if (!retailerId) {
      return NextResponse.json({ error: 'Only retailers can add to cart' }, { status: 403 });
    }

    const body = await request.json();
    const validation = addToCartSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { productId, wholesalerId, quantity } = validation.data;

    // Pricing fetch + stock + MOQ check + upsert in one transaction so
    // stock state cannot drift between the validation read and the write.
    const result = await prisma.$transaction(async (tx) => {
      const pricing = await tx.productPricing.findUnique({
        where: {
          productId_wholesalerId: { productId, wholesalerId },
        },
        include: { product: true, wholesaler: true },
      });

      if (!pricing || !pricing.isActive) {
        return { ok: false as const, status: 404, body: { error: 'Product pricing not found' } };
      }

      if (pricing.stockStatus === 'OUT_OF_STOCK') {
        return { ok: false as const, status: 400, body: { error: 'Product is out of stock' } };
      }

      if (quantity < pricing.minimumOrderQty) {
        return {
          ok: false as const,
          status: 400,
          body: {
            error: `Minimum order is ${pricing.minimumOrderQty} units`,
            minimumOrderQty: pricing.minimumOrderQty,
          },
        };
      }

      const unitPrice =
        pricing.onPromotion && pricing.promoPrice ? pricing.promoPrice : pricing.wholesalePrice;

      const cartItem = await tx.cartItem.upsert({
        where: {
          retailerId_productId_wholesalerId: { retailerId, productId, wholesalerId },
        },
        update: { quantity, unitPrice },
        create: { retailerId, productId, wholesalerId, quantity, unitPrice },
      });

      return {
        ok: true as const,
        cartItem,
        productName: pricing.product.name,
      };
    });

    if (!result.ok) {
      return NextResponse.json(result.body, { status: result.status });
    }

    logger.info({
      event: 'cart_item_added',
      retailerId,
      productId,
      wholesalerId,
      quantity,
    });

    // Fire-and-forget analytics.
    capture({
      event: 'cart_item_added',
      distinctId: user.id,
      properties: { productId, wholesalerId, quantity },
    });

    return NextResponse.json({
      cartItem: result.cartItem,
      message: `${result.productName} added to cart`,
    });
  } catch (error) {
    logger.error({ event: 'cart_add_error', error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to add to cart' }, { status: 500 });
  }
}

/** DELETE /api/cart — Remove item from cart */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const retailerId = user.retailerId;
    if (!retailerId) {
      return NextResponse.json({ error: 'Only retailers can modify a cart' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('id');

    if (!itemId) {
      return NextResponse.json({ error: 'Item ID required' }, { status: 400 });
    }

    // deleteMany with retailerId scoped — ensures a user cannot delete
    // another retailer's cart item by guessing/iterating IDs.
    const deleted = await prisma.cartItem.deleteMany({
      where: { id: itemId, retailerId },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: 'Cart item not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Item removed from cart' });
  } catch (error) {
    logger.error({ event: 'cart_delete_error', error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to remove item' }, { status: 500 });
  }
}
