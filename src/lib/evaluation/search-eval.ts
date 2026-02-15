/**
 * Search Quality Evaluation Module
 *
 * Evaluates the WholesaleHub search system using information retrieval
 * metrics: MRR, Recall@10, Precision, Recall, F1, FPR, and FNR.
 *
 * Runs test queries against the product search API and compares
 * returned product IDs against expected ground-truth results.
 *
 * @module evaluation/search-eval
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type {
  SearchEvalCase,
  SearchEvalMetrics,
  SearchQueryResult,
} from './types';

// ─── Search Function Abstraction ───

/**
 * Search result item returned from the search function.
 * Contains at minimum the product identifier.
 */
interface SearchResultItem {
  productId: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * Performs a product search by keyword.
 * Queries the product table with text matching on name, brand, SKU,
 * searchKeywords, and description. This mirrors the logic used in
 * the /api/products endpoint but operates directly against Prisma
 * for evaluation purposes (no HTTP overhead, no caching).
 *
 * @param query - The search query string
 * @param limit - Maximum number of results to return (default 20)
 * @returns Array of matching product results with productId
 */
async function performSearch(
  query: string,
  limit: number = 20,
): Promise<SearchResultItem[]> {
  try {
    const products = await prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { brand: { contains: query, mode: 'insensitive' } },
          { sku: { contains: query, mode: 'insensitive' } },
          { searchKeywords: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: {
        pricings: {
          where: { isActive: true },
          orderBy: { wholesalePrice: 'asc' },
          take: 1,
        },
      },
      take: limit,
    });

    return products.map((p) => ({
      productId: p.productId,
      name: p.name,
    }));
  } catch (error) {
    logger.error({
      event: 'search_eval_query_error',
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

// ─── Metric Calculations ───

/**
 * Calculates the reciprocal rank for a single query result.
 * The reciprocal rank is 1/position of the first relevant result.
 *
 * @param actualIds - Product IDs returned by the search, in rank order
 * @param expectedIds - Product IDs expected in the results
 * @returns The reciprocal rank (0 if no expected result appears)
 */
function calculateReciprocalRank(
  actualIds: string[],
  expectedIds: string[],
): number {
  const expectedSet = new Set(expectedIds);
  for (let i = 0; i < actualIds.length; i++) {
    if (expectedSet.has(actualIds[i])) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

/**
 * Calculates recall at K for a single query result.
 * Recall@K = (# of expected results in top K) / (# of expected results)
 *
 * @param actualIds - Product IDs returned by the search, in rank order
 * @param expectedIds - Product IDs expected in the results
 * @param k - The cutoff position (default 10)
 * @returns Recall at K value between 0 and 1
 */
function calculateRecallAtK(
  actualIds: string[],
  expectedIds: string[],
  k: number = 10,
): number {
  if (expectedIds.length === 0) return 1;
  const topK = new Set(actualIds.slice(0, k));
  let hits = 0;
  for (const id of expectedIds) {
    if (topK.has(id)) {
      hits++;
    }
  }
  return hits / expectedIds.length;
}

/**
 * Evaluates a single search query against its expected results.
 *
 * @param testCase - The search test case with query and expected results
 * @param actualIds - The product IDs actually returned by search
 * @returns Detailed result for this query
 */
function evaluateSingleQuery(
  testCase: SearchEvalCase,
  actualIds: string[],
): SearchQueryResult {
  const expectedSet = new Set(testCase.expectedProductIds);
  const actualSet = new Set(actualIds);

  let hits = 0;
  let misses = 0;
  for (const expectedId of testCase.expectedProductIds) {
    if (actualSet.has(expectedId)) {
      hits++;
    } else {
      misses++;
    }
  }

  let falsePositives = 0;
  for (const actualId of actualIds) {
    if (!expectedSet.has(actualId)) {
      falsePositives++;
    }
  }

  const topResultCorrect = testCase.expectedTopResult
    ? actualIds.length > 0 && actualIds[0] === testCase.expectedTopResult
    : true;

  return {
    query: testCase.query,
    expectedProductIds: testCase.expectedProductIds,
    actualProductIds: actualIds,
    reciprocalRank: calculateReciprocalRank(actualIds, testCase.expectedProductIds),
    hits,
    misses,
    falsePositives,
    topResultCorrect,
  };
}

// ─── Main Evaluation Function ───

/**
 * Runs the full search quality evaluation across all test cases.
 *
 * For each test case, executes a search query and compares the returned
 * product IDs against the expected ground truth. Aggregates results into
 * standard IR metrics (MRR, Recall@10, Precision, Recall, F1, FPR, FNR).
 *
 * @param testCases - Array of search evaluation test cases
 * @returns Aggregated search evaluation metrics
 */
export async function evaluateSearch(
  testCases: SearchEvalCase[],
): Promise<SearchEvalMetrics> {
  logger.info({
    event: 'search_eval_start',
    totalCases: testCases.length,
  });

  const perQueryResults: SearchQueryResult[] = [];

  let totalReciprocalRank = 0;
  let totalRecallAt10 = 0;
  let totalTruePositives = 0;
  let totalFalsePositives = 0;
  let totalFalseNegatives = 0;
  let totalCorrect = 0;

  for (const testCase of testCases) {
    const results = await performSearch(testCase.query);
    const actualIds = results.map((r) => r.productId);

    const queryResult = evaluateSingleQuery(testCase, actualIds);
    perQueryResults.push(queryResult);

    totalReciprocalRank += queryResult.reciprocalRank;
    totalRecallAt10 += calculateRecallAtK(
      actualIds,
      testCase.expectedProductIds,
      10,
    );
    totalTruePositives += queryResult.hits;
    totalFalsePositives += queryResult.falsePositives;
    totalFalseNegatives += queryResult.misses;

    // A query is "correct" if all expected results appear in actual results
    if (queryResult.misses === 0) {
      totalCorrect++;
    }
  }

  const totalSamples = testCases.length;
  const mrr = totalSamples > 0 ? totalReciprocalRank / totalSamples : 0;
  const recallAt10 = totalSamples > 0 ? totalRecallAt10 / totalSamples : 0;

  const precision =
    totalTruePositives + totalFalsePositives > 0
      ? totalTruePositives / (totalTruePositives + totalFalsePositives)
      : 0;

  const recall =
    totalTruePositives + totalFalseNegatives > 0
      ? totalTruePositives / (totalTruePositives + totalFalseNegatives)
      : 0;

  const f1Score =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

  const accuracy = totalSamples > 0 ? totalCorrect / totalSamples : 0;

  // For FPR we need true negatives. In search, "true negatives" are
  // all products NOT expected that also were NOT returned. We approximate
  // TN as a large number (all products minus expected), making FPR meaningful.
  // We use totalFalsePositives / (totalFalsePositives + estimated TN).
  // Simplified: FPR = FP / total returned that are not TP
  const totalReturned = perQueryResults.reduce(
    (sum, r) => sum + r.actualProductIds.length,
    0,
  );
  const falsePositiveRate =
    totalReturned > 0 ? totalFalsePositives / totalReturned : 0;

  const totalExpected = perQueryResults.reduce(
    (sum, r) => sum + r.expectedProductIds.length,
    0,
  );
  const falseNegativeRate =
    totalExpected > 0 ? totalFalseNegatives / totalExpected : 0;

  const metrics: SearchEvalMetrics = {
    accuracy,
    precision,
    recall,
    f1Score,
    falsePositiveRate,
    falseNegativeRate,
    totalSamples,
    mrr,
    recallAt10,
    perQueryResults,
  };

  logger.info({
    event: 'search_eval_complete',
    totalSamples,
    accuracy: Math.round(accuracy * 10000) / 10000,
    mrr: Math.round(mrr * 10000) / 10000,
    recallAt10: Math.round(recallAt10 * 10000) / 10000,
    precision: Math.round(precision * 10000) / 10000,
    recall: Math.round(recall * 10000) / 10000,
    f1Score: Math.round(f1Score * 10000) / 10000,
  });

  return metrics;
}

// ─── Default Test Cases ───

/**
 * Returns 25 hardcoded search test cases against the WholesaleHub seed data.
 *
 * Covers:
 * - Exact keyword matches (product names, brands)
 * - Partial keyword matches (category terms)
 * - Semantic / natural language queries
 * - Multi-word queries
 * - Edge cases (misspellings, slang)
 *
 * Product IDs reference the seed data:
 * - PRD001: Disposable Vape (Vape Products)
 * - PRD002: Glass Bong (Glassware)
 * - PRD003: Rolling Papers (Rolling Supplies)
 * - PRD004: Herb Grinder (Accessories)
 * - PRD005: CBD Gummies (CBD Products)
 * - PRD006: Pipe Cleaner (Maintenance)
 * - PRD007: Dab Rig (Glassware)
 * - PRD008: Lighter (Accessories)
 * - PRD009: Blunt Wraps (Rolling Supplies)
 * - PRD010: E-Liquid (Vape Products)
 *
 * @returns Array of 25 search evaluation test cases
 */
export function getDefaultSearchTestCases(): SearchEvalCase[] {
  return [
    // ── Exact keyword matches ──
    {
      query: 'disposable vape',
      expectedProductIds: ['PRD001'],
      expectedTopResult: 'PRD001',
    },
    {
      query: 'glass bong',
      expectedProductIds: ['PRD002'],
      expectedTopResult: 'PRD002',
    },
    {
      query: 'rolling papers',
      expectedProductIds: ['PRD003'],
      expectedTopResult: 'PRD003',
    },
    {
      query: 'herb grinder',
      expectedProductIds: ['PRD004'],
      expectedTopResult: 'PRD004',
    },
    {
      query: 'CBD gummies',
      expectedProductIds: ['PRD005'],
      expectedTopResult: 'PRD005',
    },
    {
      query: 'pipe cleaner',
      expectedProductIds: ['PRD006'],
      expectedTopResult: 'PRD006',
    },
    {
      query: 'dab rig',
      expectedProductIds: ['PRD007'],
      expectedTopResult: 'PRD007',
    },
    {
      query: 'lighter',
      expectedProductIds: ['PRD008'],
      expectedTopResult: 'PRD008',
    },
    {
      query: 'blunt wraps',
      expectedProductIds: ['PRD009'],
      expectedTopResult: 'PRD009',
    },
    {
      query: 'e-liquid',
      expectedProductIds: ['PRD010'],
      expectedTopResult: 'PRD010',
    },

    // ── Category-level keyword matches ──
    {
      query: 'vape',
      expectedProductIds: ['PRD001', 'PRD010'],
    },
    {
      query: 'glass',
      expectedProductIds: ['PRD002', 'PRD007'],
    },
    {
      query: 'rolling',
      expectedProductIds: ['PRD003', 'PRD009'],
    },
    {
      query: 'CBD',
      expectedProductIds: ['PRD005'],
    },
    {
      query: 'cleaning',
      expectedProductIds: ['PRD006'],
    },

    // ── Semantic / natural language queries ──
    {
      query: 'something for rolling joints',
      expectedProductIds: ['PRD003', 'PRD009'],
    },
    {
      query: 'display for vapes',
      expectedProductIds: ['PRD001', 'PRD010'],
    },
    {
      query: 'cheap smoking device',
      expectedProductIds: ['PRD002', 'PRD007'],
    },
    {
      query: 'edible cannabis product',
      expectedProductIds: ['PRD005'],
    },
    {
      query: 'how to clean a pipe',
      expectedProductIds: ['PRD006'],
    },

    // ── Multi-word / compound queries ──
    {
      query: 'glass water pipe bong',
      expectedProductIds: ['PRD002', 'PRD007'],
    },
    {
      query: 'nicotine vape juice',
      expectedProductIds: ['PRD010'],
    },
    {
      query: 'grinder metal herb',
      expectedProductIds: ['PRD004'],
    },

    // ── Brand / SKU queries ──
    {
      query: 'PRD001',
      expectedProductIds: ['PRD001'],
      expectedTopResult: 'PRD001',
    },

    // ── Edge case: very broad query ──
    {
      query: 'smoke shop supplies',
      expectedProductIds: ['PRD001', 'PRD002', 'PRD003', 'PRD004', 'PRD005', 'PRD006'],
    },
  ];
}
