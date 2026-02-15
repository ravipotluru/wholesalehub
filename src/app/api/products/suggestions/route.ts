import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getSearchSuggestions } from '@/lib/search-suggestions';

// ─── Request Validation ───

const suggestionsQuerySchema = z.object({
  q: z.string().min(1, 'Query is required').max(200),
});

// ─── GET /api/products/suggestions ───

/**
 * Fast autocomplete/suggestions endpoint for the search bar.
 * Target response time: <100ms.
 *
 * Query Parameters:
 *   q - Partial search text (minimum 1 character, required)
 *
 * Response:
 *   { suggestions: Array<{ text, type, id? }> }
 *
 * Suggestion types: product, brand, category, recent
 */
export async function GET(request: NextRequest) {
  const startMs = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());

    const validation = suggestionsQuerySchema.safeParse(params);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Invalid query parameter',
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { q } = validation.data;

    const suggestions = await getSearchSuggestions(q);

    const durationMs = Date.now() - startMs;

    logger.debug({
      event: 'suggestions_api_request',
      query: q,
      resultCount: suggestions.length,
      durationMs,
    });

    return NextResponse.json(
      { suggestions },
      {
        headers: {
          // Short cache for CDN/browser — suggestions change frequently
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        },
      },
    );
  } catch (error) {
    const durationMs = Date.now() - startMs;
    logger.error({
      event: 'suggestions_api_error',
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    });

    return NextResponse.json(
      { error: 'Failed to fetch suggestions' },
      { status: 500 },
    );
  }
}
