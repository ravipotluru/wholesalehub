import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { addToCartSchema } from '@/lib/validators';
import { logger } from '@/lib/logger';

/** GET /api/cart — Get current user's cart items grouped by supplier */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as Record<string, unknown>;
    const retailerId = user.retailerId as string;

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

    // Get supplier details and MOQ info for each item
    const enrichedItems = await Promise.all(
      cartItems.map(async (item) => {
        const pricing = await prisma.productPricing.findUnique({
          where: {
            productId_wholesalerId: {
              productId: item.productId,
              wholesalerId: item.wholesalerId,
            },
          },
          include: { wholesaler: true },
        });

        return {
          ...item,
          unitPrice: Number(item.unitPrice),
          wholesalerName: pricing?.wholesaler.name || 'Unknown',
          wholesalerCity: pricing?.wholesaler.city || '',
          wholesalerState: pricing?.wholesaler.state || '',
          moqRequired: pricing?.minimumOrderQty || 1,
          moqMet: item.quantity >= (pricing?.minimumOrderQty || 1),
          stockStatus: pricing?.stockStatus || 'OUT_OF_STOCK',
          subtotal: Number(item.unitPrice) * item.quantity,
        };
      })
    );

    // Group by supplier
    const grouped: Record<string, {
      wholesalerId: string;
      wholesalerName: string;
      city: string;
      state: string;
      items: typeof enrichedItems;
      subtotal: number;
      allMoqMet: boolean;
    }> = {};

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
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as Record<string, unknown>;
    const retailerId = user.retailerId as string;

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

    // Verify product and pricing exist
    const pricing = await prisma.productPricing.findUnique({
      where: {
        productId_wholesalerId: { productId, wholesalerId },
      },
      include: { product: true, wholesaler: true },
    });

    if (!pricing || !pricing.isActive) {
      return NextResponse.json({ error: 'Product pricing not found' }, { status: 404 });
    }

    if (pricing.stockStatus === 'OUT_OF_STOCK') {
      return NextResponse.json({ error: 'Product is out of stock' }, { status: 400 });
    }

    // Upsert cart item
    const cartItem = await prisma.cartItem.upsert({
      where: {
        retailerId_productId_wholesalerId: { retailerId, productId, wholesalerId },
      },
      update: {
        quantity,
        unitPrice: pricing.onPromotion && pricing.promoPrice ? pricing.promoPrice : pricing.wholesalePrice,
      },
      create: {
        retailerId,
        productId,
        wholesalerId,
        quantity,
        unitPrice: pricing.onPromotion && pricing.promoPrice ? pricing.promoPrice : pricing.wholesalePrice,
      },
    });

    logger.info({
      event: 'cart_item_added',
      retailerId,
      productId,
      wholesalerId,
      quantity,
    });

    return NextResponse.json({
      cartItem,
      message: `${pricing.product.name} added to cart`,
      moqWarning: quantity < pricing.minimumOrderQty
        ? `Minimum order is ${pricing.minimumOrderQty} units`
        : null,
    });
  } catch (error) {
    logger.error({ event: 'cart_add_error', error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to add to cart' }, { status: 500 });
  }
}

/** DELETE /api/cart — Remove item from cart */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('id');

    if (!itemId) {
      return NextResponse.json({ error: 'Item ID required' }, { status: 400 });
    }

    await prisma.cartItem.delete({ where: { id: itemId } });

    return NextResponse.json({ message: 'Item removed from cart' });
  } catch (error) {
    logger.error({ event: 'cart_delete_error', error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to remove item' }, { status: 500 });
  }
}
