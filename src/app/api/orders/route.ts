import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { checkoutSchema } from '@/lib/validators';
import { logger } from '@/lib/logger';
import { generateOrderNumber } from '@/lib/utils';

const TAX_RATE = new Prisma.Decimal('0.0825');
const ZERO = new Prisma.Decimal(0);

/** GET /api/orders — List orders for current user */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = Math.max(parseInt(searchParams.get('page') || '1') || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get('limit') || '20') || 20, 1),
      100,
    );

    const where: Prisma.OrderWhereInput = {};

    // Role-based filtering. Reject if the relevant *Id is missing — otherwise
    // Prisma drops `undefined` from the filter and the user sees ALL orders.
    if (user.role === 'RETAILER') {
      if (!user.retailerId) {
        return NextResponse.json({ error: 'No retailer linked to this account' }, { status: 403 });
      }
      where.retailerId = user.retailerId;
    } else if (user.role === 'WHOLESALER') {
      if (!user.wholesalerId) {
        return NextResponse.json({ error: 'No wholesaler linked to this account' }, { status: 403 });
      }
      where.wholesalerId = user.wholesalerId;
    } else if (user.role !== 'ADMIN' && user.role !== 'ANALYST') {
      // Warehouse staff and any future role get no orders by default.
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (status && status !== 'all') {
      where.orderStatus = status as Prisma.OrderWhereInput['orderStatus'];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          retailer: true,
          wholesaler: true,
          lines: { include: { product: true } },
        },
        orderBy: { orderDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where }),
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

/**
 * Compute money for a single line, doing all arithmetic in Decimal so we
 * never lose pennies the way `0.1 + 0.2` does in JS.
 */
function computeLineTotals(unitPrice: Prisma.Decimal, quantity: number) {
  const lineSubtotal = unitPrice.mul(quantity);
  const lineTax = lineSubtotal.mul(TAX_RATE).toDecimalPlaces(2);
  const lineTotal = lineSubtotal.add(lineTax);
  return { lineSubtotal, lineTax, lineTotal };
}

/** POST /api/orders — Create orders from cart (splits per supplier) */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const retailerId = user.retailerId;
    const userId = user.id;

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

    // Whole flow in one transaction: read cart, validate MOQ via batched
    // pricing fetch, create per-supplier orders with lines, clear cart.
    // Either all succeed or none persist.
    const result = await prisma.$transaction(async (tx) => {
      const cartItems = await tx.cartItem.findMany({
        where: { retailerId },
        include: { product: true },
      });

      if (cartItems.length === 0) {
        return { ok: false as const, status: 400, body: { error: 'Cart is empty' } };
      }

      // Group cart items by supplier
      const supplierGroups: Record<string, typeof cartItems> = {};
      for (const item of cartItems) {
        if (!supplierGroups[item.wholesalerId]) supplierGroups[item.wholesalerId] = [];
        supplierGroups[item.wholesalerId].push(item);
      }

      // Single batched pricing lookup instead of N+1 inside a nested loop.
      const pricingPairs = cartItems.map((i) => ({
        productId: i.productId,
        wholesalerId: i.wholesalerId,
      }));
      const pricings = await tx.productPricing.findMany({
        where: { OR: pricingPairs },
        select: {
          productId: true,
          wholesalerId: true,
          minimumOrderQty: true,
          stockStatus: true,
          isActive: true,
        },
      });
      const pricingByKey = new Map(
        pricings.map((p) => [`${p.productId}:${p.wholesalerId}`, p]),
      );

      // Validate MOQ + stock for every line up-front
      for (const item of cartItems) {
        const pricing = pricingByKey.get(`${item.productId}:${item.wholesalerId}`);
        if (!pricing || !pricing.isActive) {
          return {
            ok: false as const,
            status: 400,
            body: { error: `Product no longer available: ${item.product.name}` },
          };
        }
        if (pricing.stockStatus === 'OUT_OF_STOCK') {
          return {
            ok: false as const,
            status: 400,
            body: { error: `Out of stock: ${item.product.name}` },
          };
        }
        if (item.quantity < pricing.minimumOrderQty) {
          return {
            ok: false as const,
            status: 400,
            body: {
              error: `Minimum order quantity not met for ${item.product.name}`,
              violations: [{
                policy: 'MINIMUM_ORDER_QTY',
                reason: `Minimum order is ${pricing.minimumOrderQty} units, you have ${item.quantity}`,
              }],
            },
          };
        }
      }

      // Create one order per supplier
      const createdOrders: Array<{
        orderId: string;
        orderNumber: string;
        wholesalerName: string;
        total: number;
        status: string;
        itemCount: number;
      }> = [];

      for (const [wholesalerId, items] of Object.entries(supplierGroups)) {
        let subtotal = ZERO;
        let totalTax = ZERO;
        const lineData = items.map((item, index) => {
          const unitPrice = new Prisma.Decimal(item.unitPrice.toString());
          const { lineSubtotal, lineTax, lineTotal } = computeLineTotals(unitPrice, item.quantity);
          subtotal = subtotal.add(lineSubtotal);
          totalTax = totalTax.add(lineTax);
          return {
            lineNumber: index + 1,
            productId: item.productId,
            sku: item.product.sku,
            productName: item.product.name,
            quantityOrdered: item.quantity,
            unitPrice,
            lineSubtotal,
            lineTax,
            lineTotal,
          };
        });

        const shipping = ZERO; // Free shipping for now
        const total = subtotal.add(totalTax).add(shipping);

        const order = await tx.order.create({
          data: {
            orderNumber: generateOrderNumber(),
            retailerId,
            wholesalerId,
            userId,
            paymentMethod,
            subtotalAmount: subtotal,
            taxAmount: totalTax,
            shippingAmount: shipping,
            totalAmount: total,
            shipToAddress: shippingAddress,
            shipToCity: shippingCity,
            shipToState: shippingState,
            shipToZip: shippingZip,
            orderNotes,
            totalItems: items.length,
            totalUnits: items.reduce((sum, item) => sum + item.quantity, 0),
            lines: { create: lineData },
          },
          include: { wholesaler: true, lines: true },
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

      // Clear cart inside the same transaction
      await tx.cartItem.deleteMany({ where: { retailerId } });

      return { ok: true as const, createdOrders };
    });

    if (!result.ok) {
      return NextResponse.json(result.body, { status: result.status });
    }

    logger.info({
      event: 'orders_created',
      retailerId,
      orderCount: result.createdOrders.length,
      orderNumbers: result.createdOrders.map((o) => o.orderNumber),
    });

    return NextResponse.json({
      orders: result.createdOrders,
      cartCleared: true,
      message: `${result.createdOrders.length} order(s) placed successfully`,
    }, { status: 201 });
  } catch (error) {
    logger.error({ event: 'order_create_error', error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to create orders' }, { status: 500 });
  }
}
