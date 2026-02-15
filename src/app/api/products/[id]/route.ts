import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { id: params.id },
          { productId: params.id },
        ],
      },
      include: {
        category: true,
        pricings: {
          where: { isActive: true },
          include: { wholesaler: true },
          orderBy: { wholesalePrice: 'asc' },
        },
        priceHistory: {
          orderBy: { effectiveDate: 'desc' },
          take: 90,
          include: { wholesaler: true },
        },
        barcodes: true,
      },
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const prices = product.pricings.map((p) => Number(p.wholesalePrice));
    const highestPrice = prices.length > 0 ? Math.max(...prices) : 0;

    const suppliers = product.pricings.map((pricing, index) => ({
      wholesalerId: pricing.wholesaler.id,
      wholesalerName: pricing.wholesaler.name,
      city: pricing.wholesaler.city || '',
      state: pricing.wholesaler.state || '',
      ratingAvg: Number(pricing.wholesaler.ratingAvg) || 0,
      ratingCount: pricing.wholesaler.ratingCount,
      wholesalePrice: Number(pricing.wholesalePrice),
      msrp: pricing.msrp ? Number(pricing.msrp) : null,
      minimumOrderQty: pricing.minimumOrderQty,
      stockQuantity: pricing.stockQuantity,
      stockStatus: pricing.stockStatus,
      leadTimeDays: pricing.leadTimeDays,
      onPromotion: pricing.onPromotion,
      promoPrice: pricing.promoPrice ? Number(pricing.promoPrice) : null,
      isBestPrice: index === 0,
      savingsVsHighest: Math.round((highestPrice - Number(pricing.wholesalePrice)) * 100) / 100,
    }));

    const priceHistory = product.priceHistory.map((ph) => ({
      date: ph.effectiveDate,
      price: Number(ph.wholesalePrice),
      previousPrice: ph.previousPrice ? Number(ph.previousPrice) : null,
      wholesalerName: ph.wholesaler.name,
      wholesalerId: ph.wholesaler.id,
      changeReason: ph.changeReason,
    }));

    return NextResponse.json({
      ...product,
      pricings: undefined,
      priceHistory: undefined,
      suppliers,
      priceHistoryData: priceHistory,
    });
  } catch (error) {
    logger.error({ event: 'product_detail_error', productId: params.id, error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}
