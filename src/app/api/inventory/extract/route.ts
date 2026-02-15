import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { processDocument } from '@/lib/ai/orchestration';

// ─── Request Schema ───

const extractRequestSchema = z.object({
  documentText: z
    .string()
    .min(10, 'Document text must be at least 10 characters')
    .max(100_000, 'Document text exceeds maximum length of 100,000 characters'),
  documentUrl: z.string().url().optional(),
});

// ─── POST /api/inventory/extract ───

/**
 * Document extraction endpoint.
 *
 * Accepts raw document text and runs the full AI orchestration pipeline:
 * classify -> extract -> resolve entities -> validate -> route.
 *
 * Requires authentication with ADMIN or WAREHOUSE_STAFF role.
 *
 * Request body:
 * - documentText (string, required): Raw text content of the document
 * - documentUrl (string, optional): URL of the source document for reference
 *
 * Response:
 * - traceId: Pipeline trace ID for debugging
 * - success: Whether the pipeline completed successfully
 * - classification: Document type and confidence
 * - extraction: Structured extraction data with validation results
 * - entityResolution: Supplier and product match results
 * - routing: Whether the extraction was auto-created or sent to review
 * - steps: Detailed step-by-step pipeline execution log
 * - totalDurationMs: Total pipeline execution time
 */
export async function POST(request: NextRequest) {
  try {
    // ── Auth Check ──
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as Record<string, unknown>;
    const role = user.role as string;

    if (role !== 'ADMIN' && role !== 'WAREHOUSE_STAFF') {
      logger.warn({
        event: 'extract_forbidden',
        userId: user.id,
        role,
      });
      return NextResponse.json(
        { error: 'Forbidden — requires ADMIN or WAREHOUSE_STAFF role' },
        { status: 403 },
      );
    }

    // ── Parse & Validate Request ──
    const body = await request.json();
    const validation = extractRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { documentText, documentUrl } = validation.data;

    logger.info({
      event: 'extract_request',
      userId: user.id,
      documentLength: documentText.length,
      hasDocumentUrl: !!documentUrl,
    });

    // ── Run Orchestration Pipeline ──
    const result = await processDocument({
      documentText,
      documentUrl,
      sourceChannel: 'API',
      actorId: user.id as string,
      actorIp:
        request.headers.get('x-forwarded-for') ??
        request.headers.get('x-real-ip') ??
        undefined,
    });

    // ── Build Response ──
    const statusCode = result.success ? 200 : 422;

    return NextResponse.json(
      {
        traceId: result.traceId,
        success: result.success,
        classification: result.classification
          ? {
              documentType: result.classification.type,
              confidence: result.classification.confidence,
            }
          : undefined,
        extraction: result.extraction
          ? {
              success: result.extraction.success,
              data: result.extraction.data,
              attempts: result.extraction.attempts,
              corrections: result.extraction.corrections,
              errors: result.extraction.errors,
            }
          : undefined,
        entityResolution: result.entityResolution
          ? {
              supplier: {
                matched: result.entityResolution.supplier.matched,
                matchedName: result.entityResolution.supplier.matchedName,
                wholesalerId: result.entityResolution.supplier.wholesalerId,
                confidence: result.entityResolution.supplier.confidence,
              },
              lineItems: result.entityResolution.lineItems.map((li) => ({
                productDescription: li.productDescription,
                sku: li.sku,
                upc: li.upc,
                matched: li.matched,
                matchMethod: li.matchMethod,
                matchedName: li.matchedName,
                productId: li.productId,
                confidence: li.confidence,
              })),
              overallConfidence: result.entityResolution.overallConfidence,
            }
          : undefined,
        routing: result.routing
          ? {
              decision: result.routing.decision,
              reason: result.routing.reason,
              receiptId: result.routing.receiptId,
              receiptNumber: result.routing.receiptNumber,
            }
          : undefined,
        steps: result.steps.map((step) => ({
          step: step.step,
          status: step.status,
          durationMs: step.durationMs,
          error: step.error,
        })),
        error: result.error,
        totalDurationMs: result.totalDurationMs,
      },
      { status: statusCode },
    );
  } catch (error) {
    logger.error({
      event: 'extract_endpoint_error',
      error: (error as Error).message,
      stack: (error as Error).stack,
    });

    return NextResponse.json(
      { error: 'Internal server error during document extraction' },
      { status: 500 },
    );
  }
}
