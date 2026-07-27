import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';

/** GET /api/analytics — Dashboard analytics data */
export async function GET() {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = user.role;

    if (!['ADMIN', 'ANALYST'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      orders30d,
      allOrders30d,
      activeProducts,
      activeSuppliers,
      categoryBreakdown,
      topProducts,
      supplierScorecard,
    ] = await Promise.all([
      // Order count in last 30 days
      prisma.order.count({
        where: { orderDate: { gte: thirtyDaysAgo } },
      }),
      // All orders for revenue calc
      prisma.order.findMany({
        where: { orderDate: { gte: thirtyDaysAgo } },
        select: { totalAmount: true, orderDate: true },
      }),
      // Active products
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      // Active suppliers
      prisma.wholesaler.count({ where: { status: 'ACTIVE' } }),
      // Category breakdown
      prisma.category.findMany({
        where: { status: 'ACTIVE', level: 1 },
        include: {
          _count: { select: { products: { where: { status: 'ACTIVE' } } } },
        },
        orderBy: { displayOrder: 'asc' },
      }),
      // Top products by order frequency
      prisma.orderLine.groupBy({
        by: ['productId'],
        _sum: { quantityOrdered: true, lineTotal: true },
        _count: { id: true },
        orderBy: { _sum: { lineTotal: 'desc' } },
        take: 10,
      }),
      // Supplier scorecard
      prisma.wholesaler.findMany({
        where: { status: 'ACTIVE' },
        include: {
          _count: { select: { orders: true } },
          orders: {
            select: { totalAmount: true },
            where: { orderDate: { gte: thirtyDaysAgo } },
          },
        },
        orderBy: { ratingAvg: 'desc' },
        take: 10,
      }),
    ]);

    const revenue30d = allOrders30d.reduce(
      (sum, order) => sum + Number(order.totalAmount),
      0
    );
    const avgOrderValue = orders30d > 0 ? revenue30d / orders30d : 0;

    // Resolve top product names
    const topProductIds = topProducts.map((p) => p.productId);
    const productDetails = await prisma.product.findMany({
      where: { id: { in: topProductIds } },
      select: { id: true, name: true, brand: true },
    });
    const productMap = new Map(productDetails.map((p) => [p.id, p]));

    // Build daily revenue for chart
    const dailyRevenue: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = date.toISOString().split('T')[0];
      dailyRevenue[key] = 0;
    }
    for (const order of allOrders30d) {
      const key = order.orderDate.toISOString().split('T')[0];
      if (dailyRevenue[key] !== undefined) {
        dailyRevenue[key] += Number(order.totalAmount);
      }
    }

    const response = {
      kpis: {
        revenue30d: Math.round(revenue30d * 100) / 100,
        orders30d,
        avgOrderValue: Math.round(avgOrderValue * 100) / 100,
        activeProducts,
        activeSuppliers,
      },
      revenueChart: Object.entries(dailyRevenue).map(([date, amount]) => ({
        date,
        revenue: Math.round(amount * 100) / 100,
      })),
      categoryBreakdown: categoryBreakdown.map((c) => ({
        name: c.name,
        value: c._count.products,
      })),
      topProducts: topProducts.map((p) => {
        const details = productMap.get(p.productId);
        return {
          productId: p.productId,
          name: details?.name || 'Unknown',
          brand: details?.brand || '',
          totalRevenue: Number(p._sum.lineTotal) || 0,
          totalUnits: p._sum.quantityOrdered || 0,
          orderCount: p._count.id,
        };
      }),
      supplierScorecard: supplierScorecard.map((s) => ({
        id: s.id,
        name: s.name,
        businessName: s.businessName,
        city: s.city,
        state: s.state,
        rating: Number(s.ratingAvg) || 0,
        orderCount: s._count.orders,
        revenue30d: s.orders.reduce((sum, o) => sum + Number(o.totalAmount), 0),
      })),
    };

    logger.info({ event: 'analytics_fetched', userId: user.id });

    return NextResponse.json(response);
  } catch (error) {
    logger.error({ event: 'analytics_error', error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
