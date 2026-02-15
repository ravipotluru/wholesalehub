import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { createAuditEvent } from '@/lib/audit';
import { generateReceiptNumber } from '@/lib/utils';
import { classifyDocument } from './document-classifier';
import type { ClassificationResult } from './document-classifier';
import {
  extractWithValidation,
  type ReceiptExtraction,
  type ValidationResult,
  type ConfidenceLevel,
} from './validation-loop';
import {
  resolveSupplier,
  resolveProducts,
  type SupplierResolution,
  type ResolvedLineItem,
  type EntityResolutionResult,
} from './entity-resolver';

// ─── Types ───

/** Pipeline step names */
export type PipelineStep =
  | 'CLASSIFY'
  | 'EXTRACT'
  | 'RESOLVE_ENTITIES'
  | 'VALIDATE'
  | 'ROUTE';

/** Status of an individual pipeline step */
export type StepStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';

/** Record of a single pipeline step's execution */
export interface StepRecord {
  step: PipelineStep;
  status: StepStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
}

/** Input context to the orchestration pipeline */
export interface OrchestrationContext {
  documentText: string;
  documentUrl?: string;
  sourceChannel?: string;
  actorId: string;
  actorIp?: string;
}

/** Routing decision after pipeline completes */
export type RoutingDecision = 'AUTO_CREATE' | 'REVIEW_QUEUE';

/** Routing result with decision rationale */
export interface RoutingResult {
  decision: RoutingDecision;
  reason: string;
  receiptId?: string;
  receiptNumber?: string;
}

/** Complete result of the orchestration pipeline */
export interface OrchestrationResult {
  traceId: string;
  success: boolean;
  steps: StepRecord[];
  classification?: ClassificationResult;
  extraction?: ValidationResult;
  entityResolution?: EntityResolutionResult;
  routing?: RoutingResult;
  error?: string;
  totalDurationMs: number;
}

// ─── Step Helpers ───

/**
 * Creates a step record marking the start of a pipeline step.
 */
function startStep(step: PipelineStep): StepRecord {
  return {
    step,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
  };
}

/**
 * Completes a step record with timing and status.
 */
function completeStep(
  record: StepRecord,
  status: 'SUCCESS' | 'FAILED',
  error?: string,
): StepRecord {
  const completedAt = new Date().toISOString();
  const durationMs =
    new Date(completedAt).getTime() - new Date(record.startedAt).getTime();

  return {
    ...record,
    status,
    completedAt,
    durationMs,
    error,
  };
}

// ─── Routing Logic ───

/**
 * Determines whether an extraction should be auto-created as a receipt
 * or routed to the human review queue.
 *
 * Auto-create criteria (all must be true):
 * - All confidence fields are HIGH
 * - Supplier was successfully resolved
 * - At least 80% of line items were resolved
 *
 * @param extraction - The validated extraction data
 * @param resolution - Entity resolution results
 * @returns Routing decision with rationale
 */
function determineRoute(
  extraction: ReceiptExtraction,
  resolution: EntityResolutionResult,
): { decision: RoutingDecision; reason: string } {
  const reasons: string[] = [];

  // Check confidence levels
  const confidenceFields: (keyof typeof extraction.confidence)[] = [
    'header',
    'line_items',
    'totals',
  ];
  const lowConfidence = confidenceFields.filter(
    (field) => extraction.confidence[field] !== 'HIGH',
  );

  if (lowConfidence.length > 0) {
    reasons.push(
      `Non-HIGH confidence on: ${lowConfidence.join(', ')} ` +
      `(${lowConfidence.map((f) => `${f}=${extraction.confidence[f]}`).join(', ')})`,
    );
  }

  // Check supplier resolution
  if (!resolution.supplier.matched) {
    reasons.push(
      `Supplier "${extraction.supplier_name}" could not be resolved to a known wholesaler`,
    );
  }

  // Check line item resolution rate
  const matchedItems = resolution.lineItems.filter((li) => li.matched).length;
  const totalItems = resolution.lineItems.length;
  const matchRate = totalItems > 0 ? matchedItems / totalItems : 0;

  if (matchRate < 0.8) {
    reasons.push(
      `Only ${matchedItems}/${totalItems} (${Math.round(matchRate * 100)}%) ` +
      `line items resolved — minimum is 80%`,
    );
  }

  if (reasons.length === 0) {
    return {
      decision: 'AUTO_CREATE',
      reason: 'All confidence levels HIGH, supplier resolved, 80%+ line items matched',
    };
  }

  return {
    decision: 'REVIEW_QUEUE',
    reason: reasons.join('; '),
  };
}

/**
 * Auto-creates an inventory receipt from validated extraction and resolution data.
 *
 * @param extraction - Validated extraction data
 * @param resolution - Entity resolution results
 * @param traceId - Pipeline trace ID for audit correlation
 * @param actorId - The user or system that initiated the extraction
 * @returns The created receipt ID and receipt number
 */
async function autoCreateReceipt(
  extraction: ReceiptExtraction,
  resolution: EntityResolutionResult,
  traceId: string,
  actorId: string,
): Promise<{ receiptId: string; receiptNumber: string }> {
  const receiptNumber = generateReceiptNumber();

  const receipt = await prisma.inventoryReceipt.create({
    data: {
      receiptNumber,
      supplierId: resolution.supplier.wholesalerId ?? null,
      poNumber: extraction.po_reference ?? null,
      documentType: extraction.document_type,
      sourceChannel: 'AI_EXTRACTION',
      carrier: extraction.carrier ?? null,
      trackingNumber: extraction.tracking_number ?? null,
      shipDate: extraction.ship_date ? new Date(extraction.ship_date) : null,
      status: 'AWAITING_ARRIVAL',
      totalLinesExpected: extraction.line_items.length,
      totalQtyExpected: extraction.line_items.reduce(
        (sum, item) => sum + item.quantity,
        0,
      ),
      lines: {
        create: extraction.line_items.map((item, index) => {
          const resolved = resolution.lineItems[index];
          return {
            lineNumber: index + 1,
            productId: resolved?.productId ?? null,
            sku: item.sku ?? resolved?.matchedSku ?? null,
            upc: item.upc ?? null,
            productName: item.product_description,
            qtyExpected: item.quantity,
            unitCost: item.unit_cost,
          };
        }),
      },
    },
  });

  // Audit the auto-creation
  await createAuditEvent(
    {
      actorId,
      actorType: 'SYSTEM',
      traceId,
      reason: 'AI document extraction — auto-created receipt',
    },
    'CREATE',
    'RECEIPT',
    receipt.id,
    null,
    {
      receiptNumber,
      documentType: extraction.document_type,
      documentNumber: extraction.document_number,
      supplierName: extraction.supplier_name,
      resolvedWholesalerId: resolution.supplier.wholesalerId,
      lineCount: extraction.line_items.length,
      total: extraction.total,
    },
  );

  return { receiptId: receipt.id, receiptNumber };
}

/**
 * Stores extraction data in a pending review state for human review.
 *
 * Creates a receipt with PENDING_DOCUMENT status and stores the extraction
 * metadata in the notes field for later review.
 *
 * @param extraction - Validated extraction data
 * @param resolution - Entity resolution results
 * @param reason - Why this extraction was routed to review
 * @param traceId - Pipeline trace ID for audit correlation
 * @param actorId - The user or system that initiated the extraction
 * @returns The created receipt ID and receipt number
 */
async function routeToReview(
  extraction: ReceiptExtraction,
  resolution: EntityResolutionResult,
  reason: string,
  traceId: string,
  actorId: string,
): Promise<{ receiptId: string; receiptNumber: string }> {
  const receiptNumber = generateReceiptNumber();

  const reviewMetadata = {
    extractionData: extraction,
    entityResolution: {
      supplier: resolution.supplier,
      lineItemMatchRate:
        resolution.lineItems.filter((li) => li.matched).length +
        '/' +
        resolution.lineItems.length,
      resolvedItems: resolution.lineItems.map((li) => ({
        description: li.productDescription,
        matched: li.matched,
        matchMethod: li.matchMethod,
        matchedName: li.matchedName,
        confidence: li.confidence,
      })),
    },
    reviewReason: reason,
    traceId,
  };

  const receipt = await prisma.inventoryReceipt.create({
    data: {
      receiptNumber,
      supplierId: resolution.supplier.wholesalerId ?? null,
      poNumber: extraction.po_reference ?? null,
      documentType: extraction.document_type,
      sourceChannel: 'AI_EXTRACTION',
      carrier: extraction.carrier ?? null,
      trackingNumber: extraction.tracking_number ?? null,
      shipDate: extraction.ship_date ? new Date(extraction.ship_date) : null,
      status: 'PENDING_DOCUMENT',
      totalLinesExpected: extraction.line_items.length,
      totalQtyExpected: extraction.line_items.reduce(
        (sum, item) => sum + item.quantity,
        0,
      ),
      notes: JSON.stringify(reviewMetadata),
      lines: {
        create: extraction.line_items.map((item, index) => {
          const resolved = resolution.lineItems[index];
          return {
            lineNumber: index + 1,
            productId: resolved?.productId ?? null,
            sku: item.sku ?? resolved?.matchedSku ?? null,
            upc: item.upc ?? null,
            productName: item.product_description,
            qtyExpected: item.quantity,
            unitCost: item.unit_cost,
          };
        }),
      },
    },
  });

  // Audit the review routing
  await createAuditEvent(
    {
      actorId,
      actorType: 'SYSTEM',
      traceId,
      reason: `AI extraction routed to review: ${reason}`,
    },
    'CREATE',
    'RECEIPT',
    receipt.id,
    null,
    {
      receiptNumber,
      status: 'PENDING_DOCUMENT',
      reviewReason: reason,
      documentType: extraction.document_type,
      documentNumber: extraction.document_number,
    },
  );

  return { receiptId: receipt.id, receiptNumber };
}

// ─── Main Orchestration Pipeline ───

/**
 * Multi-step AI orchestration pipeline for processing wholesale documents.
 *
 * Pipeline steps:
 * 1. **CLASSIFY** — AI determines document type (INVOICE, ASN, PO_CONFIRMATION)
 * 2. **EXTRACT** — Extracts structured data with validation loop (up to 3 attempts)
 * 3. **RESOLVE_ENTITIES** — Fuzzy-matches supplier and products against the database
 * 4. **VALIDATE** — (Integrated into step 2 via extractWithValidation)
 * 5. **ROUTE** — Routes to auto-create or human review queue based on confidence
 *
 * Each step is logged with a shared traceId for correlation. Audit events
 * are created at each significant state change. Errors at any step cause
 * graceful degradation with detailed error reporting.
 *
 * @param context - Input context with document text, actor info, and metadata
 * @returns Complete pipeline result with step records, extraction data, and routing decision
 */
export async function processDocument(
  context: OrchestrationContext,
): Promise<OrchestrationResult> {
  const traceId = randomUUID();
  const pipelineStart = Date.now();
  const steps: StepRecord[] = [];

  let classification: ClassificationResult | undefined;
  let extraction: ValidationResult | undefined;
  let entityResolution: EntityResolutionResult | undefined;
  let routing: RoutingResult | undefined;

  logger.info({
    event: 'orchestration_pipeline_start',
    traceId,
    actorId: context.actorId,
    documentLength: context.documentText.length,
    sourceChannel: context.sourceChannel,
  });

  // ── Step 1: CLASSIFY ──
  const classifyStep = startStep('CLASSIFY');
  steps.push(classifyStep);

  try {
    classification = await classifyDocument(context.documentText);

    steps[steps.length - 1] = completeStep(classifyStep, 'SUCCESS');

    await createAuditEvent(
      {
        actorId: context.actorId,
        actorType: 'SYSTEM',
        actorIp: context.actorIp,
        traceId,
      },
      'AI_CLASSIFY',
      'DOCUMENT',
      traceId,
      null,
      {
        documentType: classification.type,
        confidence: classification.confidence,
      },
    );

    logger.info({
      event: 'orchestration_classify_complete',
      traceId,
      documentType: classification.type,
      confidence: classification.confidence,
    });
  } catch (error) {
    steps[steps.length - 1] = completeStep(
      classifyStep,
      'FAILED',
      (error as Error).message,
    );

    logger.error({
      event: 'orchestration_classify_failed',
      traceId,
      error: (error as Error).message,
    });

    return {
      traceId,
      success: false,
      steps,
      error: `Classification failed: ${(error as Error).message}`,
      totalDurationMs: Date.now() - pipelineStart,
    };
  }

  // ── Step 2: EXTRACT ──
  const extractStep = startStep('EXTRACT');
  steps.push(extractStep);

  try {
    extraction = await extractWithValidation(context.documentText, 3);

    if (!extraction.success || !extraction.data) {
      steps[steps.length - 1] = completeStep(
        extractStep,
        'FAILED',
        `Extraction failed after ${extraction.attempts} attempts: ${(extraction.errors ?? []).join('; ')}`,
      );

      logger.error({
        event: 'orchestration_extract_failed',
        traceId,
        attempts: extraction.attempts,
        errors: extraction.errors,
      });

      return {
        traceId,
        success: false,
        steps,
        classification,
        extraction,
        error: `Extraction failed after ${extraction.attempts} attempts`,
        totalDurationMs: Date.now() - pipelineStart,
      };
    }

    steps[steps.length - 1] = completeStep(extractStep, 'SUCCESS');

    await createAuditEvent(
      {
        actorId: context.actorId,
        actorType: 'SYSTEM',
        traceId,
      },
      'AI_EXTRACT',
      'DOCUMENT',
      traceId,
      null,
      {
        documentNumber: extraction.data.document_number,
        supplierName: extraction.data.supplier_name,
        lineItemCount: extraction.data.line_items.length,
        total: extraction.data.total,
        attempts: extraction.attempts,
        corrections: extraction.corrections.length,
      },
    );

    logger.info({
      event: 'orchestration_extract_complete',
      traceId,
      attempts: extraction.attempts,
      lineItems: extraction.data.line_items.length,
      total: extraction.data.total,
    });
  } catch (error) {
    steps[steps.length - 1] = completeStep(
      extractStep,
      'FAILED',
      (error as Error).message,
    );

    logger.error({
      event: 'orchestration_extract_error',
      traceId,
      error: (error as Error).message,
    });

    return {
      traceId,
      success: false,
      steps,
      classification,
      error: `Extraction error: ${(error as Error).message}`,
      totalDurationMs: Date.now() - pipelineStart,
    };
  }

  // ── Step 3: RESOLVE ENTITIES ──
  const resolveStep = startStep('RESOLVE_ENTITIES');
  steps.push(resolveStep);

  try {
    const extractionData = extraction.data;

    const [supplierResult, productResults] = await Promise.all([
      resolveSupplier(extractionData.supplier_name),
      resolveProducts(extractionData.line_items),
    ]);

    // Calculate overall confidence
    const matchedProducts = productResults.filter((p) => p.matched).length;
    const productMatchRate =
      productResults.length > 0 ? matchedProducts / productResults.length : 0;

    const confidenceValues: Record<ConfidenceLevel, number> = {
      HIGH: 1.0,
      MEDIUM: 0.6,
      LOW: 0.3,
    };

    const extractionConfidenceAvg =
      (confidenceValues[extractionData.confidence.header] +
        confidenceValues[extractionData.confidence.line_items] +
        confidenceValues[extractionData.confidence.totals]) /
      3;

    const overallConfidence =
      Math.round(
        ((supplierResult.confidence * 0.3 +
          productMatchRate * 0.3 +
          extractionConfidenceAvg * 0.4) *
          100),
      ) / 100;

    entityResolution = {
      supplier: supplierResult,
      lineItems: productResults,
      overallConfidence,
    };

    steps[steps.length - 1] = completeStep(resolveStep, 'SUCCESS');

    await createAuditEvent(
      {
        actorId: context.actorId,
        actorType: 'SYSTEM',
        traceId,
      },
      'AI_RESOLVE',
      'DOCUMENT',
      traceId,
      null,
      {
        supplierMatched: supplierResult.matched,
        supplierConfidence: supplierResult.confidence,
        resolvedWholesalerId: supplierResult.wholesalerId,
        productsMatched: matchedProducts,
        productsTotal: productResults.length,
        productMatchRate: Math.round(productMatchRate * 100),
        overallConfidence,
      },
    );

    logger.info({
      event: 'orchestration_resolve_complete',
      traceId,
      supplierMatched: supplierResult.matched,
      productsMatched: matchedProducts,
      productsTotal: productResults.length,
      overallConfidence,
    });
  } catch (error) {
    steps[steps.length - 1] = completeStep(
      resolveStep,
      'FAILED',
      (error as Error).message,
    );

    logger.error({
      event: 'orchestration_resolve_error',
      traceId,
      error: (error as Error).message,
    });

    // Graceful degradation: continue to routing with empty resolution
    entityResolution = {
      supplier: { confidence: 0, matched: false },
      lineItems: extraction.data.line_items.map((item, i) => ({
        originalIndex: i,
        sku: item.sku,
        upc: item.upc,
        productDescription: item.product_description,
        quantity: item.quantity,
        unitCost: item.unit_cost,
        lineTotal: item.line_total,
        confidence: 0,
        matched: false,
      })),
      overallConfidence: 0,
    };
  }

  // ── Step 4: VALIDATE (already done in EXTRACT step — mark as skipped) ──
  const validateStep = startStep('VALIDATE');
  steps.push(completeStep({ ...validateStep, status: 'SKIPPED' }, 'SUCCESS'));

  // ── Step 5: ROUTE ──
  const routeStep = startStep('ROUTE');
  steps.push(routeStep);

  try {
    const extractionData = extraction.data;
    const { decision, reason } = determineRoute(extractionData, entityResolution);

    if (decision === 'AUTO_CREATE') {
      const { receiptId, receiptNumber } = await autoCreateReceipt(
        extractionData,
        entityResolution,
        traceId,
        context.actorId,
      );

      routing = {
        decision: 'AUTO_CREATE',
        reason,
        receiptId,
        receiptNumber,
      };
    } else {
      const { receiptId, receiptNumber } = await routeToReview(
        extractionData,
        entityResolution,
        reason,
        traceId,
        context.actorId,
      );

      routing = {
        decision: 'REVIEW_QUEUE',
        reason,
        receiptId,
        receiptNumber,
      };
    }

    steps[steps.length - 1] = completeStep(routeStep, 'SUCCESS');

    logger.info({
      event: 'orchestration_route_complete',
      traceId,
      decision: routing.decision,
      reason: routing.reason,
      receiptId: routing.receiptId,
      receiptNumber: routing.receiptNumber,
    });
  } catch (error) {
    steps[steps.length - 1] = completeStep(
      routeStep,
      'FAILED',
      (error as Error).message,
    );

    logger.error({
      event: 'orchestration_route_error',
      traceId,
      error: (error as Error).message,
    });

    return {
      traceId,
      success: false,
      steps,
      classification,
      extraction,
      entityResolution,
      error: `Routing failed: ${(error as Error).message}`,
      totalDurationMs: Date.now() - pipelineStart,
    };
  }

  // ── Pipeline Complete ──
  const totalDurationMs = Date.now() - pipelineStart;

  logger.info({
    event: 'orchestration_pipeline_complete',
    traceId,
    success: true,
    totalDurationMs,
    routingDecision: routing.decision,
    receiptId: routing.receiptId,
  });

  return {
    traceId,
    success: true,
    steps,
    classification,
    extraction,
    entityResolution,
    routing,
    totalDurationMs,
  };
}
