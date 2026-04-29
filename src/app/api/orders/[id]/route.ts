import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { orderStatusUpdateSchema } from '@/lib/validators';
import { logger } from '@/lib/logger';
import { canAccessOrder } from '@/lib/order-access';

/** GET /api/orders/[id] — Get order detail */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id: params.id }, { orderNumber: params.id }],
      },
      include: {
        retailer: true,
        wholesaler: true,
        user: { select: { firstName: true, lastName: true, email: true } },
        lines: {
          include: { product: true },
          orderBy: { lineNumber: 'asc' },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (!canAccessOrder(user, order)) {
      logger.warn({
        event: 'order_access_denied',
        userId: user.id,
        role: user.role,
        orderId: order.id,
      });
      // Return 404 (not 403) so we don't confirm the order exists to a probing attacker.
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...order,
      subtotalAmount: Number(order.subtotalAmount),
      taxAmount: Number(order.taxAmount),
      shippingAmount: Number(order.shippingAmount),
      discountAmount: Number(order.discountAmount),
      totalAmount: Number(order.totalAmount),
      lines: order.lines.map((line) => ({
        ...line,
        unitPrice: Number(line.unitPrice),
        lineSubtotal: Number(line.lineSubtotal),
        lineTax: Number(line.lineTax),
        lineTotal: Number(line.lineTotal),
      })),
    });
  } catch (error) {
    logger.error({ event: 'order_detail_error', orderId: params.id, error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 });
  }
}

/** PATCH /api/orders/[id] — Update order status */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = orderStatusUpdateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { status, trackingNumber, shippingCarrier, cancellationReason } = validation.data;

    const order = await prisma.order.findUnique({ where: { id: params.id } });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (!canAccessOrder(user, order)) {
      logger.warn({
        event: 'order_update_denied',
        userId: user.id,
        role: user.role,
        orderId: order.id,
      });
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Validate status transitions
    if (status === 'CANCELLED' && !['PENDING', 'CONFIRMED'].includes(order.orderStatus)) {
      return NextResponse.json(
        { error: `Cannot cancel order — already ${order.orderStatus.toLowerCase()}` },
        { status: 400 }
      );
    }

    // Only wholesalers/admins can confirm/ship/deliver. Retailers can only cancel.
    if (['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(status)) {
      if (user.role !== 'WHOLESALER' && user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    if (status === 'REJECTED' && user.role !== 'WHOLESALER' && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const previousStatus = order.orderStatus;
    const updateData: {
      orderStatus: typeof status;
      trackingNumber?: string;
      shippingCarrier?: string;
      cancellationReason?: string;
    } = { orderStatus: status };

    if (trackingNumber) updateData.trackingNumber = trackingNumber;
    if (shippingCarrier) updateData.shippingCarrier = shippingCarrier;
    if (cancellationReason) updateData.cancellationReason = cancellationReason;

    // Update + audit must be atomic — we never want a status change without
    // its audit row, or vice versa.
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.order.update({
        where: { id: params.id },
        data: updateData,
      });

      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          actorType: 'USER',
          action: 'STATUS_CHANGE',
          entityType: 'ORDER',
          entityId: params.id,
          previousState: { status: previousStatus },
          newState: { status },
          changedFields: ['orderStatus'],
          reason: cancellationReason || `Status changed to ${status}`,
        },
      });

      return u;
    });

    logger.info({
      event: 'order_status_updated',
      orderId: params.id,
      previousStatus,
      newStatus: status,
      userId: user.id,
    });

    return NextResponse.json({
      order: updated,
      message: `Order status updated to ${status}`,
    });
  } catch (error) {
    logger.error({ event: 'order_update_error', orderId: params.id, error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}
