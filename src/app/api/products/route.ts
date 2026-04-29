import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { productSearchSchema } from '@/lib/validators';
import { logger } from '@/lib/logger';
import { getCache, setCache } from '@/lib/redis';

/** Pick a representative stockStatus for a product across its supplier pricings. */
function aggregateStockStatus(
  pricings: Array<{ stockStatus: string }>,
): 'IN_STOCK' | 'LOW_STOCK' | 'BACKORDER' | 'OUT_OF_STOCK' {
  if (pricings.some((p) => p.stockStatus === 'IN_STOCK')) return 'IN_STOCK';
  if (pricings.some((p) => p.stockStatus === 'LOW_STOCK')) return 'LOW_STOCK';
  if (pricings.some((p) => p.stockStatus === 'BACKORDER')) return 'BACKORDER';
  return 'OUT_OF_STOCK';
}

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

    const where: Prisma.ProductWhereInput = { status: 'ACTIVE' };

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
      where.category = {
        is: {
          OR: [
            { categoryId: category },
            { name: { equals: category, mode: 'insensitive' } },
          ],
        },
      };
    }

    // Visibility gate: every search/products query only surfaces PUBLIC
    // listings until we add the WholesalerBuyerApproval table. Existing
    // data defaults to PUBLIC at the column level so this is a no-op
    // post-migration.
    const visibilityFilter: Prisma.ProductPricingWhereInput = {
      isActive: true,
      visibility: 'PUBLIC',
    };

    if (stockStatus) {
      where.pricings = { some: { ...visibilityFilter, stockStatus } };
    }

    // Push min/max price into the SQL `where` so pagination total stays consistent
    // with the filtered set instead of overshooting.
    if (minPrice !== undefined || maxPrice !== undefined) {
      const priceFilter: Prisma.DecimalFilter = {};
      if (minPrice !== undefined) priceFilter.gte = minPrice;
      if (maxPrice !== undefined) priceFilter.lte = maxPrice;
      where.pricings = {
        some: {
          ...visibilityFilter,
          wholesalePrice: priceFilter,
          ...(stockStatus ? { stockStatus } : {}),
        },
      };
    }

    // Even when no price/stock filter is applied, ensure non-PUBLIC
    // listings don't make a product appear in search.
    if (!where.pricings) {
      where.pricings = { some: visibilityFilter };
    }

    const [total, products, categories] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: {
          category: true,
          pricings: {
            where: { isActive: true, visibility: 'PUBLIC' },
            include: { wholesaler: true },
            orderBy: { wholesalePrice: 'asc' },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.category.findMany({
        where: { status: 'ACTIVE', level: 1 },
        include: { _count: { select: { products: { where: { status: 'ACTIVE' } } } } },
        orderBy: { displayOrder: 'asc' },
      }),
    ]);

    let productResults = products.map((product) => {
      const activePricings = product.pricings.filter((p) => {
        if (minPrice !== undefined && Number(p.wholesalePrice) < minPrice) return false;
        if (maxPrice !== undefined && Number(p.wholesalePrice) > maxPrice) return false;
        return true;
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
        stockStatus: aggregateStockStatus(activePricings),
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

    // Rating filter is still in-memory — the rating is derived from the
    // best supplier, which we only know after enriching.
    if (minRating !== undefined) {
      productResults = productResults.filter((p) => p.avgRating >= minRating);
    }

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
      case 'relevance':
        // /api/products is keyword-only; relevance falls back to price asc.
        productResults.sort((a, b) => a.lowestPrice - b.lowestPrice);
        break;
    }

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
