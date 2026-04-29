import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getCache, setCache } from '@/lib/redis';
import { generateEmbedding } from '@/lib/embeddings';

// ─── Types ───

/** Supported search modes */
export type SearchMode = 'keyword' | 'semantic' | 'hybrid';

/** Sort options for search results */
export type SearchSort =
  | 'price_asc'
  | 'price_desc'
  | 'rating'
  | 'newest'
  | 'popular'
  | 'relevance';

/** Stock status filter */
export type StockStatusFilter =
  | 'IN_STOCK'
  | 'LOW_STOCK'
  | 'OUT_OF_STOCK'
  | 'BACKORDER';

/** Options accepted by all search functions */
export interface SearchOptions {
  query: string;
  mode?: SearchMode;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  stockStatus?: StockStatusFilter;
  minRating?: number;
  sort?: SearchSort;
  page?: number;
  limit?: number;
}

/** Supplier pricing summary for a product in search results */
export interface SupplierPricingSummary {
  name: string;
  price: number;
  city: string;
  state: string;
  wholesalerId: string;
}

/** A single product in the search results */
export interface SearchResultProduct {
  id: string;
  productId: string;
  name: string;
  brand: string | null;
  sku: string;
  description: string | null;
  category: string;
  categoryId: string | null;
  imageUrl: string | null;
  ageRestricted: boolean;
  lowestPrice: number;
  highestPrice: number;
  supplierCount: number;
  avgRating: number;
  stockStatus: string;
  bestSupplier: SupplierPricingSummary | null;
  /** Relevance score (higher = more relevant). Present in ranked results. */
  score?: number;
}

/** Metrics about how the search was executed */
export interface SearchMetrics {
  durationMs: number;
  keywordResults: number;
  semanticResults: number;
  mode: SearchMode;
}

/** Full search response shape */
export interface SearchResponse {
  products: SearchResultProduct[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  searchMode: SearchMode;
  searchMetrics: SearchMetrics;
}

/** Internal intermediate result from keyword or semantic search */
interface RawSearchHit {
  id: string;
  score: number;
}

// ─── Constants ───

/** Default Reciprocal Rank Fusion constant (controls rank-score curve) */
const RRF_K = 60;

/** Cache TTL for search results in seconds */
const SEARCH_CACHE_TTL = 180;

// ─── Keyword Search ───

/**
 * PostgreSQL full-text search using ts_rank and plainto_tsquery.
 * Searches across product name, brand, search_keywords, and description.
 *
 * @param query   - The raw text query from the user
 * @param options - Filter and pagination options
 * @returns Array of product IDs with relevance scores
 */
export async function keywordSearch(
  query: string,
  options: SearchOptions,
): Promise<RawSearchHit[]> {
  const startMs = Date.now();
  const limit = options.limit ?? 24;
  const page = options.page ?? 1;
  const offset = (page - 1) * limit;

  try {
    // Build category filter clause
    const categoryClause = options.category
      ? `AND c."categoryId" = $2`
      : '';

    // The parameter index for limit and offset shifts based on whether
    // we have a category filter
    const limitParamIdx = options.category ? 3 : 2;
    const offsetParamIdx = options.category ? 4 : 3;

    const sql = `
      SELECT
        p.id,
        ts_rank(
          to_tsvector('english',
            coalesce(p.name, '') || ' ' ||
            coalesce(p.brand, '') || ' ' ||
            coalesce(p."searchKeywords", '') || ' ' ||
            coalesce(p.description, '')
          ),
          plainto_tsquery('english', $1)
        ) AS score
      FROM products p
      LEFT JOIN categories c ON p."categoryId" = c.id
      WHERE p.status = 'ACTIVE'
        AND to_tsvector('english',
          coalesce(p.name, '') || ' ' ||
          coalesce(p.brand, '') || ' ' ||
          coalesce(p."searchKeywords", '') || ' ' ||
          coalesce(p.description, '')
        ) @@ plainto_tsquery('english', $1)
        ${categoryClause}
      ORDER BY score DESC
      LIMIT $${limitParamIdx}
      OFFSET $${offsetParamIdx}
    `;

    const params: Array<string | number> = [query];
    if (options.category) {
      params.push(options.category);
    }
    params.push(limit * 3); // Fetch extra for RRF merging
    params.push(offset);

    const results = await prisma.$queryRawUnsafe<Array<{ id: string; score: number }>>(
      sql,
      ...params,
    );

    const durationMs = Date.now() - startMs;
    logger.info({
      event: 'keyword_search',
      query,
      resultCount: results.length,
      durationMs,
    });

    return results.map((row) => ({
      id: row.id,
      score: Number(row.score),
    }));
  } catch (error) {
    logger.error({
      event: 'keyword_search_error',
      query,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startMs,
    });
    return [];
  }
}

// ─── Semantic Search ───

/**
 * pgvector cosine similarity search. Generates an embedding for the query,
 * then finds the nearest product vectors.
 *
 * @param query   - The raw text query from the user
 * @param options - Filter and pagination options
 * @returns Array of product IDs with cosine similarity scores
 */
export async function semanticSearch(
  query: string,
  options: SearchOptions,
): Promise<RawSearchHit[]> {
  const startMs = Date.now();
  const limit = options.limit ?? 24;

  try {
    const queryEmbedding = await generateEmbedding(query);
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // Build optional category filter
    const categoryClause = options.category
      ? `AND c."categoryId" = $2`
      : '';

    const limitParamIdx = options.category ? 3 : 2;

    const sql = `
      SELECT
        p.id,
        1 - (p.embedding <=> $1::vector) AS score
      FROM products p
      LEFT JOIN categories c ON p."categoryId" = c.id
      WHERE p.status = 'ACTIVE'
        AND p.embedding IS NOT NULL
        ${categoryClause}
      ORDER BY p.embedding <=> $1::vector ASC
      LIMIT $${limitParamIdx}
    `;

    const params: Array<string | number> = [embeddingStr];
    if (options.category) {
      params.push(options.category);
    }
    params.push(limit * 3); // Extra results for RRF merging

    const results = await prisma.$queryRawUnsafe<Array<{ id: string; score: number }>>(
      sql,
      ...params,
    );

    const durationMs = Date.now() - startMs;
    logger.info({
      event: 'semantic_search',
      query,
      resultCount: results.length,
      durationMs,
    });

    return results.map((row) => ({
      id: row.id,
      score: Number(row.score),
    }));
  } catch (error) {
    logger.error({
      event: 'semantic_search_error',
      query,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startMs,
    });
    return [];
  }
}

// ─── Reciprocal Rank Fusion ───

/**
 * Merge two ranked result lists using Reciprocal Rank Fusion (RRF).
 *
 * Each item's fused score = sum over lists of  1 / (k + rank_in_list).
 * Items appearing in both lists receive the sum of both contributions.
 *
 * @param listA - First ranked result list (e.g. keyword search)
 * @param listB - Second ranked result list (e.g. semantic search)
 * @param limit - Max number of results to return
 * @param k     - RRF constant (default 60) — controls how quickly
 *                rank-based scores decay
 * @returns Merged and re-ranked list of product IDs with fused scores
 */
export function reciprocalRankFusion(
  listA: RawSearchHit[],
  listB: RawSearchHit[],
  limit: number,
  k: number = RRF_K,
): RawSearchHit[] {
  const scoreMap = new Map<string, number>();

  // Score contributions from list A
  listA.forEach((hit, rank) => {
    const rrfScore = 1 / (k + rank + 1); // rank is 0-based, add 1
    const current = scoreMap.get(hit.id) ?? 0;
    scoreMap.set(hit.id, current + rrfScore);
  });

  // Score contributions from list B
  listB.forEach((hit, rank) => {
    const rrfScore = 1 / (k + rank + 1);
    const current = scoreMap.get(hit.id) ?? 0;
    scoreMap.set(hit.id, current + rrfScore);
  });

  // Sort by fused score descending and take top N
  const fused = Array.from(scoreMap.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return fused;
}

// ─── Product Enrichment ───

/**
 * Given a list of product IDs (with scores), fetch full product data
 * including supplier pricing, and return enriched SearchResultProduct[].
 */
async function enrichProductResults(
  hits: RawSearchHit[],
  options: SearchOptions,
): Promise<SearchResultProduct[]> {
  if (hits.length === 0) {
    return [];
  }

  const productIds = hits.map((h) => h.id);
  const scoreById = new Map(hits.map((h) => [h.id, h.score]));

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, status: 'ACTIVE' },
    include: {
      category: true,
      pricings: {
        where: { isActive: true },
        include: { wholesaler: true },
        orderBy: { wholesalePrice: 'asc' },
      },
    },
  });

  // Build result array preserving the score-based ordering
  let results: SearchResultProduct[] = products.map((product) => {
    // Apply price filters at the pricing level
    const activePricings = product.pricings.filter((p) => {
      let include = true;
      if (options.minPrice !== undefined) {
        include = include && Number(p.wholesalePrice) >= options.minPrice;
      }
      if (options.maxPrice !== undefined) {
        include = include && Number(p.wholesalePrice) <= options.maxPrice;
      }
      return include;
    });

    const prices = activePricings.map((p) => Number(p.wholesalePrice));
    const lowestPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const highestPrice = prices.length > 0 ? Math.max(...prices) : 0;
    const bestPricing = activePricings[0] ?? null;

    const stockStatus = activePricings.some((p) => p.stockStatus === 'IN_STOCK')
      ? 'IN_STOCK'
      : activePricings.some((p) => p.stockStatus === 'LOW_STOCK')
        ? 'LOW_STOCK'
        : activePricings.some((p) => p.stockStatus === 'BACKORDER')
          ? 'BACKORDER'
          : 'OUT_OF_STOCK';

    return {
      id: product.id,
      productId: product.productId,
      name: product.name,
      brand: product.brand,
      sku: product.sku,
      description: product.description,
      category: product.category?.name ?? 'Uncategorized',
      categoryId: product.category?.categoryId ?? null,
      imageUrl: product.imageUrl,
      ageRestricted: product.ageRestricted,
      lowestPrice,
      highestPrice,
      supplierCount: activePricings.length,
      avgRating: bestPricing?.wholesaler
        ? Number(bestPricing.wholesaler.ratingAvg) || 0
        : 0,
      stockStatus,
      bestSupplier: bestPricing
        ? {
            name: bestPricing.wholesaler.name,
            price: Number(bestPricing.wholesalePrice),
            city: bestPricing.wholesaler.city ?? '',
            state: bestPricing.wholesaler.state ?? '',
            wholesalerId: bestPricing.wholesaler.id,
          }
        : null,
      score: scoreById.get(product.id) ?? 0,
    };
  });

  // Apply product-level filters
  if (options.minPrice !== undefined) {
    results = results.filter((p) => p.lowestPrice >= (options.minPrice ?? 0));
  }
  if (options.maxPrice !== undefined) {
    results = results.filter(
      (p) => p.lowestPrice <= (options.maxPrice ?? Infinity),
    );
  }
  if (options.stockStatus) {
    results = results.filter((p) => p.stockStatus === options.stockStatus);
  }
  if (options.minRating !== undefined) {
    results = results.filter((p) => p.avgRating >= (options.minRating ?? 0));
  }

  // Sort
  switch (options.sort) {
    case 'price_asc':
      results.sort((a, b) => a.lowestPrice - b.lowestPrice);
      break;
    case 'price_desc':
      results.sort((a, b) => b.lowestPrice - a.lowestPrice);
      break;
    case 'rating':
      results.sort((a, b) => b.avgRating - a.avgRating);
      break;
    case 'popular':
      results.sort((a, b) => b.supplierCount - a.supplierCount);
      break;
    case 'newest':
      // Already in insertion order from DB; no additional sort
      break;
    case 'relevance':
    default:
      // Preserve score-based ordering from RRF/search
      results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      break;
  }

  return results;
}

// ─── Hybrid Search (main entry point) ───

/**
 * Execute a hybrid search combining keyword (full-text) and semantic
 * (vector similarity) search, merged via Reciprocal Rank Fusion.
 *
 * Falls back gracefully:
 * - If semantic search fails, returns keyword results only.
 * - If keyword search fails, returns semantic results only.
 * - Caches final results in Redis.
 *
 * @param options - Search options including query, filters, pagination
 * @returns Full search response with products, pagination, and metrics
 */
export async function hybridSearch(
  options: SearchOptions,
): Promise<SearchResponse> {
  const startMs = Date.now();
  const mode = options.mode ?? 'hybrid';
  const page = options.page ?? 1;
  const limit = options.limit ?? 24;

  // Check cache
  const cacheKey = `search:${mode}:${JSON.stringify(options)}`;
  const cached = await getCache<SearchResponse>(cacheKey);
  if (cached) {
    logger.info({
      event: 'search_cache_hit',
      query: options.query,
      mode,
    });
    return cached;
  }

  let keywordHits: RawSearchHit[] = [];
  let semanticHits: RawSearchHit[] = [];
  let mergedHits: RawSearchHit[];

  if (mode === 'keyword') {
    keywordHits = await keywordSearch(options.query, options);
    mergedHits = keywordHits;
  } else if (mode === 'semantic') {
    semanticHits = await semanticSearch(options.query, options);
    mergedHits = semanticHits;
  } else {
    // Hybrid: run both in parallel
    const [kw, sem] = await Promise.all([
      keywordSearch(options.query, options),
      semanticSearch(options.query, options),
    ]);
    keywordHits = kw;
    semanticHits = sem;

    // Merge with RRF
    mergedHits = reciprocalRankFusion(
      keywordHits,
      semanticHits,
      limit * 2, // Fetch extra so we can paginate
    );
  }

  // Paginate the merged hits
  const paginatedHits = mergedHits.slice((page - 1) * limit, page * limit);

  // Enrich with full product data and supplier pricing
  const products = await enrichProductResults(paginatedHits, options);

  const durationMs = Date.now() - startMs;

  const response: SearchResponse = {
    products,
    pagination: {
      page,
      limit,
      total: mergedHits.length,
      totalPages: Math.ceil(mergedHits.length / limit),
    },
    searchMode: mode,
    searchMetrics: {
      durationMs,
      keywordResults: keywordHits.length,
      semanticResults: semanticHits.length,
      mode,
    },
  };

  // Cache result
  await setCache(cacheKey, response, SEARCH_CACHE_TTL);

  logger.info({
    event: 'hybrid_search_complete',
    query: options.query,
    mode,
    keywordResults: keywordHits.length,
    semanticResults: semanticHits.length,
    mergedResults: mergedHits.length,
    returnedResults: products.length,
    durationMs,
  });

  return response;
}

// ─── Search Logging ───

/**
 * Log a search event to the SearchLog table for analytics and feedback loops.
 *
 * @param searchTerm - The user's query text
 * @param category   - Optional category filter applied
 * @param filters    - Additional filters used (serialised to JSON)
 * @param resultsCount - Number of results returned
 * @param userId     - Authenticated user ID, if available
 */
export async function logSearch(
  searchTerm: string,
  category: string | undefined,
  filters: Record<string, unknown>,
  resultsCount: number,
  userId?: string,
): Promise<void> {
  try {
    await prisma.searchLog.create({
      data: {
        userId: userId ?? null,
        searchTerm,
        category: category ?? null,
        filters,
        resultsCount,
      },
    });
  } catch (error) {
    // Search logging should never break the search flow
    logger.error({
      event: 'search_log_error',
      searchTerm,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
