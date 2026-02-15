import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { hybridSearch, logSearch } from '@/lib/search';
import type { SearchMode, SearchSort, StockStatusFilter } from '@/lib/search';

// ─── Request Validation ───

const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required'),
  mode: z
    .enum(['keyword', 'semantic', 'hybrid'])
    .default('hybrid'),
  category: z.string().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  stockStatus: z
    .enum(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'BACKORDER'])
    .optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  sort: z
    .enum(['price_asc', 'price_desc', 'rating', 'newest', 'popular', 'relevance'])
    .default('relevance'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(24),
});

// ─── GET /api/products/search ───

/**
 * Enhanced product search endpoint supporting keyword, semantic, and hybrid
 * search modes with Reciprocal Rank Fusion ranking.
 *
 * Query Parameters:
 *   q          - Search query text (required)
 *   mode       - Search mode: keyword | semantic | hybrid (default: hybrid)
 *   category   - Category ID filter
 *   minPrice   - Minimum price filter
 *   maxPrice   - Maximum price filter
 *   stockStatus - Stock status filter
 *   minRating  - Minimum supplier rating filter (0-5)
 *   sort       - Sort order (default: relevance)
 *   page       - Page number (default: 1)
 *   limit      - Results per page (default: 24, max: 100)
 *
 * Response shape matches the existing /api/products endpoint but adds
 * searchMode and searchMetrics fields.
 */
export async function GET(request: NextRequest) {
  const startMs = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());

    // Validate input
    const validation = searchQuerySchema.safeParse(params);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Invalid search parameters',
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const {
      q,
      mode,
      category,
      minPrice,
      maxPrice,
      stockStatus,
      minRating,
      sort,
      page,
      limit,
    } = validation.data;

    // Execute hybrid search
    const searchResponse = await hybridSearch({
      query: q,
      mode: mode as SearchMode,
      category,
      minPrice,
      maxPrice,
      stockStatus: stockStatus as StockStatusFilter | undefined,
      minRating,
      sort: sort as SearchSort,
      page,
      limit,
    });

    // Log search asynchronously (fire-and-forget)
    const filters: Record<string, unknown> = {};
    if (category) filters.category = category;
    if (minPrice !== undefined) filters.minPrice = minPrice;
    if (maxPrice !== undefined) filters.maxPrice = maxPrice;
    if (stockStatus) filters.stockStatus = stockStatus;
    if (minRating !== undefined) filters.minRating = minRating;

    logSearch(q, category, filters, searchResponse.products.length).catch(
      () => {
        // Swallow — logging should not block the response
      },
    );

    const durationMs = Date.now() - startMs;

    logger.info({
      event: 'search_api_request',
      query: q,
      mode,
      resultsCount: searchResponse.products.length,
      durationMs,
    });

    return NextResponse.json(searchResponse);
  } catch (error) {
    const durationMs = Date.now() - startMs;
    logger.error({
      event: 'search_api_error',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      durationMs,
    });

    return NextResponse.json(
      { error: 'Search failed. Please try again.' },
      { status: 500 },
    );
  }
}
