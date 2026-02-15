import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { checkoutSchema } from '@/lib/validators';
import { logger } from '@/lib/logger';
import { generateOrderNumber } from '@/lib/utils';

/** GET /api/orders — List orders for current user */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as Record<string, unknown>;
    const role = user.role as string;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const where: Record<string, unknown> = {};

    // Role-based filtering
    if (role === 'RETAILER') {
      where.retailerId = user.retailerId;
    } else if (role === 'WHOLESALER') {
      where.wholesalerId = user.wholesalerId;
    }
    // ADMIN sees all

    if (status && status !== 'all') {
      where.orderStatus = status;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: where as never,
        include: {
          retailer: true,
          wholesaler: true,
          lines: { include: { product: true } },
        },
        orderBy: { orderDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where: where as never }),
    ]);

    const ordersWithTotals = orders.map((order) => ({
      ...order,
      subtotalAmount: Number(order.subtotalAmount),
      taxAmount: Number(order.taxAmount),
      shippingAmount: Number(order.shippingAmount),
      totalAmount: Number(order.totalAmount),
      lines: order.lines.map((line) => ({
        ...line,
        unitPrice: Number(line.unitPrice),
        lineSubtotal: Number(line.lineSubtotal),
        lineTotal: Number(line.lineTotal),
      })),
    }));

    return NextResponse.json({
      orders: ordersWithTotals,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error({ event: 'orders_fetch_error', error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}

/** POST /api/orders — Create orders from cart (splits per supplier) */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as Record<string, unknown>;
    const retailerId = user.retailerId as string;
    const userId = user.id as string;

    if (!retailerId) {
      return NextResponse.json({ error: 'Only retailers can place orders' }, { status: 403 });
    }

    const body = await request.json();
    const validation = checkoutSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { shippingAddress, shippingCity, shippingState, shippingZip, paymentMethod, orderNotes } = validation.data;

    // Get cart items
    const cartItems = await prisma.cartItem.findMany({
      where: { retailerId },
      include: { product: true },
    });

    if (cartItems.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }

    // Group cart items by supplier
    const supplierGroups: Record<string, typeof cartItems> = {};
    for (const item of cartItems) {
      if (!supplierGroups[item.wholesalerId]) {
        supplierGroups[item.wholesalerId] = [];
      }
      supplierGroups[item.wholesalerId].push(item);
    }

    // Validate MOQs
    for (const [wholesalerId, items] of Object.entries(supplierGroups)) {
      for (const item of items) {
        const pricing = await prisma.productPricing.findUnique({
          where: {
            productId_wholesalerId: {
              productId: item.productId,
              wholesalerId,
            },
          },
        });

        if (pricing && item.quantity < pricing.minimumOrderQty) {
          return NextResponse.json(
            {
              error: `Minimum order quantity not met for ${item.product.name}`,
              violations: [{
                policy: 'MINIMUM_ORDER_QTY',
                reason: `Minimum order is ${pricing.minimumOrderQty} units, you have ${item.quantity}`,
              }],
            },
            { status: 400 }
          );
        }
      }
    }

    // Create one order per supplier
    const createdOrders = [];

    for (const [wholesalerId, items] of Object.entries(supplierGroups)) {
      const subtotal = items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
      const tax = Math.round(subtotal * 0.0825 * 100) / 100; // 8.25% tax
      const shipping = 0; // Free shipping for now
      const total = Math.round((subtotal + tax + shipping) * 100) / 100;

      const order = await prisma.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          retailerId,
          wholesalerId,
          userId,
          paymentMethod,
          subtotalAmount: subtotal,
          taxAmount: tax,
          shippingAmount: shipping,
          totalAmount: total,
          shipToAddress: shippingAddress,
          shipToCity: shippingCity,
          shipToState: shippingState,
          shipToZip: shippingZip,
          orderNotes,
          totalItems: items.length,
          totalUnits: items.reduce((sum, item) => sum + item.quantity, 0),
          lines: {
            create: items.map((item, index) => {
              const lineSubtotal = Number(item.unitPrice) * item.quantity;
              const lineTax = Math.round(lineSubtotal * 0.0825 * 100) / 100;
              return {
                lineNumber: index + 1,
                productId: item.productId,
                sku: item.product.sku,
                productName: item.product.name,
                quantityOrdered: item.quantity,
                unitPrice: item.unitPrice,
                lineSubtotal,
                lineTax,
                lineTotal: Math.round((lineSubtotal + lineTax) * 100) / 100,
              };
            }),
          },
        },
        include: {
          wholesaler: true,
          lines: true,
        },
      });

      createdOrders.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        wholesalerName: order.wholesaler.name,
        total: Number(order.totalAmount),
        status: order.orderStatus,
        itemCount: order.totalItems,
      });
    }

    // Clear cart
    await prisma.cartItem.deleteMany({ where: { retailerId } });

    logger.info({
      event: 'orders_created',
      retailerId,
      orderCount: createdOrders.length,
      orderNumbers: createdOrders.map((o) => o.orderNumber),
    });

    return NextResponse.json({
      orders: createdOrders,
      cartCleared: true,
      message: `${createdOrders.length} order(s) placed successfully`,
    }, { status: 201 });
  } catch (error) {
    logger.error({ event: 'order_create_error', error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to create orders' }, { status: 500 });
  }
}
