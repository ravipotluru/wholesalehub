import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { productSearchSchema } from '@/lib/validators';
import { logger } from '@/lib/logger';
import { getCache, setCache } from '@/lib/redis';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const validation = productSearchSchema.safeParse(params);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid search parameters', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { q, category, minPrice, maxPrice, stockStatus, minRating, sort, page, limit } = validation.data;

    // Try cache first
    const cacheKey = `products:${JSON.stringify(validation.data)}`;
    const cached = await getCache(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Build where clause
    const where: Record<string, unknown> = { status: 'ACTIVE' };

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { searchKeywords: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (category) {
      where.category = { OR: [{ categoryId: category }, { name: { equals: category, mode: 'insensitive' } }] };
    }

    if (stockStatus) {
      where.pricings = { some: { stockStatus: stockStatus, isActive: true } };
    }

    // Get total count
    const total = await prisma.product.count({ where: where as any });

    // Get products with pricings
    const products = await prisma.product.findMany({
      where: where as any,
      include: {
        category: true,
        pricings: {
          where: { isActive: true },
          include: { wholesaler: true },
          orderBy: { wholesalePrice: 'asc' },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Transform products with pricing aggregates
    let productResults = products.map((product) => {
      const activePricings = product.pricings.filter((p) => {
        let include = true;
        if (minPrice !== undefined) include = include && Number(p.wholesalePrice) >= minPrice;
        if (maxPrice !== undefined) include = include && Number(p.wholesalePrice) <= maxPrice;
        return include;
      });

      const prices = activePricings.map((p) => Number(p.wholesalePrice));
      const lowestPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const highestPrice = prices.length > 0 ? Math.max(...prices) : 0;
      const bestPricing = activePricings[0];

      return {
        id: product.id,
        productId: product.productId,
        name: product.name,
        brand: product.brand,
        sku: product.sku,
        description: product.description,
        category: product.category?.name || 'Uncategorized',
        categoryId: product.category?.categoryId,
        imageUrl: product.imageUrl,
        ageRestricted: product.ageRestricted,
        lowestPrice,
        highestPrice,
        supplierCount: activePricings.length,
        avgRating: bestPricing?.wholesaler ? Number(bestPricing.wholesaler.ratingAvg) || 0 : 0,
        stockStatus: activePricings.some((p) => p.stockStatus === 'IN_STOCK')
          ? 'IN_STOCK'
          : activePricings.some((p) => p.stockStatus === 'LOW_STOCK')
            ? 'LOW_STOCK'
            : 'OUT_OF_STOCK',
        bestSupplier: bestPricing
          ? {
              name: bestPricing.wholesaler.name,
              price: Number(bestPricing.wholesalePrice),
              city: bestPricing.wholesaler.city || '',
              state: bestPricing.wholesaler.state || '',
              wholesalerId: bestPricing.wholesaler.id,
            }
          : null,
      };
    });

    // Filter by min price / max price at product level
    if (minPrice !== undefined) {
      productResults = productResults.filter((p) => p.lowestPrice >= minPrice);
    }
    if (maxPrice !== undefined) {
      productResults = productResults.filter((p) => p.lowestPrice <= maxPrice);
    }

    // Filter by rating
    if (minRating !== undefined) {
      productResults = productResults.filter((p) => p.avgRating >= minRating);
    }

    // Sort
    switch (sort) {
      case 'price_asc':
        productResults.sort((a, b) => a.lowestPrice - b.lowestPrice);
        break;
      case 'price_desc':
        productResults.sort((a, b) => b.lowestPrice - a.lowestPrice);
        break;
      case 'rating':
        productResults.sort((a, b) => b.avgRating - a.avgRating);
        break;
      case 'newest':
        break; // Already sorted by creation
      case 'popular':
        productResults.sort((a, b) => b.supplierCount - a.supplierCount);
        break;
    }

    // Get category counts
    const categories = await prisma.category.findMany({
      where: { status: 'ACTIVE', level: 1 },
      include: { _count: { select: { products: { where: { status: 'ACTIVE' } } } } },
      orderBy: { displayOrder: 'asc' },
    });

    const response = {
      products: productResults,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      categories: categories.map((c) => ({
        id: c.categoryId,
        name: c.name,
        count: c._count.products,
      })),
    };

    // Cache for 5 minutes
    await setCache(cacheKey, response, 300);

    logger.info({
      event: 'product_search',
      query: q,
      resultsCount: productResults.length,
      page,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error({ event: 'product_search_error', error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to search products' }, { status: 500 });
  }
}
