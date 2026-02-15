import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getCache, setCache } from '@/lib/redis';

// ─── Types ───

/** The type of suggestion (used for UI grouping) */
export type SuggestionType = 'product' | 'brand' | 'category' | 'recent';

/** A single search suggestion item */
export interface SearchSuggestion {
  text: string;
  type: SuggestionType;
  /** Optional product/category ID for direct navigation */
  id?: string;
}

// ─── Constants ───

/** Maximum number of suggestions to return */
const MAX_SUGGESTIONS = 8;

/** Redis cache TTL for suggestions in seconds */
const SUGGESTIONS_CACHE_TTL = 60;

/** Maximum number of recent searches to consider */
const MAX_RECENT_SEARCHES = 50;

// ─── Public API ───

/**
 * Returns up to 8 search suggestions matching the given prefix query.
 *
 * Combines four sources, de-duplicated and ranked:
 *   1. Product names (prefix match)
 *   2. Brand names (prefix match)
 *   3. Category names (prefix match)
 *   4. Recent search terms (prefix match from SearchLog)
 *
 * Results are cached in Redis with a short TTL (60s) to ensure
 * fast response times (<100ms target).
 *
 * @param query - The partial text typed by the user (minimum 1 character)
 * @returns Array of up to 8 suggestions, de-duplicated
 */
export async function getSearchSuggestions(
  query: string,
): Promise<SearchSuggestion[]> {
  const startMs = Date.now();
  const normalised = query.trim().toLowerCase();

  if (normalised.length === 0) {
    return [];
  }

  // Check cache
  const cacheKey = `suggestions:${normalised}`;
  const cached = await getCache<SearchSuggestion[]>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // Run all four queries in parallel for speed
    const [productNames, brandNames, categoryNames, recentSearches] =
      await Promise.all([
        fetchProductNameSuggestions(normalised),
        fetchBrandSuggestions(normalised),
        fetchCategorySuggestions(normalised),
        fetchRecentSearchSuggestions(normalised),
      ]);

    // Merge results, de-duplicate by lowercase text, respecting priority order
    const seen = new Set<string>();
    const merged: SearchSuggestion[] = [];

    const addUnique = (items: SearchSuggestion[]) => {
      for (const item of items) {
        const key = item.text.toLowerCase();
        if (!seen.has(key) && merged.length < MAX_SUGGESTIONS) {
          seen.add(key);
          merged.push(item);
        }
      }
    };

    // Priority: products > brands > categories > recent
    addUnique(productNames);
    addUnique(brandNames);
    addUnique(categoryNames);
    addUnique(recentSearches);

    // Cache
    await setCache(cacheKey, merged, SUGGESTIONS_CACHE_TTL);

    const durationMs = Date.now() - startMs;
    logger.info({
      event: 'search_suggestions',
      query: normalised,
      resultCount: merged.length,
      durationMs,
    });

    return merged;
  } catch (error) {
    logger.error({
      event: 'search_suggestions_error',
      query: normalised,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startMs,
    });
    return [];
  }
}

// ─── Internal Query Functions ───

/**
 * Fetch product names that start with or contain the query prefix.
 * Returns up to 4 matches.
 */
async function fetchProductNameSuggestions(
  prefix: string,
): Promise<SearchSuggestion[]> {
  const products = await prisma.product.findMany({
    where: {
      status: 'ACTIVE',
      name: { contains: prefix, mode: 'insensitive' },
    },
    select: { id: true, name: true, productId: true },
    take: 4,
    orderBy: { name: 'asc' },
  });

  return products.map((p) => ({
    text: p.name,
    type: 'product' as const,
    id: p.productId,
  }));
}

/**
 * Fetch distinct brand names that start with or contain the query prefix.
 * Returns up to 3 matches.
 */
async function fetchBrandSuggestions(
  prefix: string,
): Promise<SearchSuggestion[]> {
  const brands = await prisma.product.findMany({
    where: {
      status: 'ACTIVE',
      brand: { contains: prefix, mode: 'insensitive' },
      NOT: { brand: null },
    },
    select: { brand: true },
    distinct: ['brand'],
    take: 3,
    orderBy: { brand: 'asc' },
  });

  return brands
    .filter((b): b is { brand: string } => b.brand !== null)
    .map((b) => ({
      text: b.brand,
      type: 'brand' as const,
    }));
}

/**
 * Fetch category names matching the query prefix.
 * Returns up to 3 matches.
 */
async function fetchCategorySuggestions(
  prefix: string,
): Promise<SearchSuggestion[]> {
  const categories = await prisma.category.findMany({
    where: {
      status: 'ACTIVE',
      name: { contains: prefix, mode: 'insensitive' },
    },
    select: { categoryId: true, name: true },
    take: 3,
    orderBy: { displayOrder: 'asc' },
  });

  return categories.map((c) => ({
    text: c.name,
    type: 'category' as const,
    id: c.categoryId,
  }));
}

/**
 * Fetch recent unique search terms from the SearchLog table that match
 * the query prefix. Returns up to 3 matches.
 */
async function fetchRecentSearchSuggestions(
  prefix: string,
): Promise<SearchSuggestion[]> {
  const recentLogs = await prisma.searchLog.findMany({
    where: {
      searchTerm: { contains: prefix, mode: 'insensitive' },
      resultsCount: { gt: 0 }, // Only suggest terms that yielded results
    },
    select: { searchTerm: true },
    orderBy: { searchedAt: 'desc' },
    take: MAX_RECENT_SEARCHES,
    distinct: ['searchTerm'],
  });

  // De-duplicate by case-insensitive value and return top 3
  const seen = new Set<string>();
  const unique: SearchSuggestion[] = [];
  for (const log of recentLogs) {
    const key = log.searchTerm.toLowerCase();
    if (!seen.has(key) && unique.length < 3) {
      seen.add(key);
      unique.push({
        text: log.searchTerm,
        type: 'recent' as const,
      });
    }
  }

  return unique;
}
