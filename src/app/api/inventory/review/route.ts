import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { createAuditEvent } from '@/lib/audit';

// â”€â”€â”€ Request Schemas â”€â”€â”€

/** Schema for approving/correcting an extraction (POST) */
const reviewApproveSchema = z.object({
  receiptId: z.string().min(1, 'Receipt ID is required'),
  action: z.enum(['APPROVE', 'CORRECT_AND_APPROVE', 'REJECT']),
  /** Corrected extraction data â€” required when action is CORRECT_AND_APPROVE */
  corrections: z
    .object({
      supplier_name: z.string().optional(),
      document_number: z.string().optional(),
      po_reference: z.string().optional().nullable(),
      carrier: z.string().optional().nullable(),
      tracking_number: z.string().optional().nullable(),
      ship_date: z.string().optional().nullable(),
      line_items: z
        .array(
          z.object({
            lineNumber: z.number().int().positive(),
            sku: z.string().optional().nullable(),
            upc: z.string().optional().nullable(),
            productName: z.string().optional(),
            qtyExpected: z.number().int().positive().optional(),
            unitCost: z.number().nonnegative().optional(),
            productId: z.string().optional().nullable(),
          }),
        )
        .optional(),
    })
    .optional(),
  /** Human reviewer's notes */
  reviewNotes: z.string().optional(),
});

/** Schema for updating individual fields (PATCH) */
const reviewPatchSchema = z.object({
  receiptId: z.string().min(1, 'Receipt ID is required'),
  updates: z.object({
    supplierId: z.string().optional().nullable(),
    poNumber: z.string().optional().nullable(),
    carrier: z.string().optional().nullable(),
    trackingNumber: z.string().optional().nullable(),
    shipDate: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    lines: z
      .array(
        z.object({
          lineId: z.string().min(1),
          productId: z.string().optional().nullable(),
          sku: z.string().optional().nullable(),
          upc: z.string().optional().nullable(),
          productName: z.string().optional(),
          qtyExpected: z.number().int().positive().optional(),
          unitCost: z.number().nonnegative().optional(),
        }),
      )
      .optional(),
  }),
});

// â”€â”€â”€ Auth Helper â”€â”€â”€

interface AuthenticatedUser {
  id: string;
  role: string;
}

/**
 * Validates auth session and role for review endpoints.
 * Returns the user or a NextResponse error.
 */
async function authenticateReviewUser(
  request: NextRequest,
): Promise<AuthenticatedUser | NextResponse> {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = user.role;

  if (role !== 'ADMIN' && role !== 'WAREHOUSE_STAFF') {
    logger.warn({
      event: 'review_forbidden',
      userId: user.id,
      role,
      path: request.nextUrl.pathname,
    });
    return NextResponse.json(
      { error: 'Forbidden â€” requires ADMIN or WAREHOUSE_STAFF role' },
      { status: 403 },
    );
  }

  return { id: user.id, role };
}

// â”€â”€â”€ GET /api/inventory/review â”€â”€â”€

/**
 * Lists pending review items â€” receipts with PENDING_DOCUMENT status
 * that were routed to the human review queue by the AI pipeline.
 *
 * Query parameters:
 * - page (number, default 1): Page number
 * - limit (number, default 20): Items per page
 * - sort (string, default "createdAt"): Sort field
 * - order (string, default "desc"): Sort direction
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateReviewUser(request);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
    const order = searchParams.get('order') === 'asc' ? 'asc' as const : 'desc' as const;
    const skip = (page - 1) * limit;

    // Query receipts in PENDING_DOCUMENT status (review queue)
    const [receipts, total] = await Promise.all([
      prisma.inventoryReceipt.findMany({
        where: { status: 'PENDING_DOCUMENT' },
        include: {
          lines: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  upcCode: true,
                  brand: true,
                },
              },
            },
            orderBy: { lineNumber: 'asc' },
          },
        },
        orderBy: { createdAt: order },
        skip,
        take: limit,
      }),
      prisma.inventoryReceipt.count({
        where: { status: 'PENDING_DOCUMENT' },
      }),
    ]);

    // Parse review metadata from notes field
    const reviewItems = receipts.map((receipt) => {
      let reviewMetadata: Record<string, unknown> | null = null;
      if (receipt.notes) {
        try {
          reviewMetadata = JSON.parse(receipt.notes) as Record<string, unknown>;
        } catch {
          // Notes is plain text, not JSON metadata
        }
      }

      return {
        id: receipt.id,
        receiptNumber: receipt.receiptNumber,
        supplierId: receipt.supplierId,
        poNumber: receipt.poNumber,
        documentType: receipt.documentType,
        sourceChannel: receipt.sourceChannel,
        carrier: receipt.carrier,
        trackingNumber: receipt.trackingNumber,
        shipDate: receipt.shipDate,
        status: receipt.status,
        totalLinesExpected: receipt.totalLinesExpected,
        totalQtyExpected: receipt.totalQtyExpected,
        createdAt: receipt.createdAt,
        lines: receipt.lines.map((line) => ({
          id: line.id,
          lineNumber: line.lineNumber,
          productId: line.productId,
          sku: line.sku,
          upc: line.upc,
          productName: line.productName,
          qtyExpected: line.qtyExpected,
          unitCost: line.unitCost ? Number(line.unitCost) : null,
          matchedProduct: line.product
            ? {
                id: line.product.id,
                name: line.product.name,
                sku: line.product.sku,
                upcCode: line.product.upcCode,
                brand: line.product.brand,
              }
            : null,
        })),
        reviewMetadata: reviewMetadata
          ? {
              extractionData: reviewMetadata.extractionData ?? null,
              entityResolution: reviewMetadata.entityResolution ?? null,
              reviewReason: reviewMetadata.reviewReason ?? null,
              traceId: reviewMetadata.traceId ?? null,
            }
          : null,
      };
    });

    return NextResponse.json({
      data: reviewItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({
      event: 'review_list_error',
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Failed to fetch review queue' },
      { status: 500 },
    );
  }
}

// â”€â”€â”€ POST /api/inventory/review â”€â”€â”€

/**
 * Approve, correct+approve, or reject a pending extraction.
 *
 * Actions:
 * - APPROVE: Accept the extraction as-is, move receipt to AWAITING_ARRIVAL
 * - CORRECT_AND_APPROVE: Apply corrections then approve
 * - REJECT: Mark receipt as CANCELLED
 *
 * Request body:
 * - receiptId (string, required)
 * - action (enum: APPROVE | CORRECT_AND_APPROVE | REJECT)
 * - corrections (object, optional): Field corrections to apply
 * - reviewNotes (string, optional): Human reviewer's notes
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateReviewUser(request);
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;

    const body = await request.json();
    const validation = reviewApproveSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { receiptId, action, corrections, reviewNotes } = validation.data;

    // Fetch the receipt
    const receipt = await prisma.inventoryReceipt.findUnique({
      where: { id: receiptId },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    });

    if (!receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    if (receipt.status !== 'PENDING_DOCUMENT') {
      return NextResponse.json(
        {
          error: `Receipt is not in review queue â€” current status: ${receipt.status}`,
        },
        { status: 400 },
      );
    }

    const previousState = {
      status: receipt.status,
      supplierId: receipt.supplierId,
      poNumber: receipt.poNumber,
      carrier: receipt.carrier,
      trackingNumber: receipt.trackingNumber,
    };

    // â”€â”€ REJECT â”€â”€
    if (action === 'REJECT') {
      await prisma.inventoryReceipt.update({
        where: { id: receiptId },
        data: {
          status: 'CANCELLED',
          notes: reviewNotes
            ? `[REJECTED] ${reviewNotes}\n\n${receipt.notes ?? ''}`
            : receipt.notes,
          completedBy: user.id,
          completedAt: new Date(),
        },
      });

      await createAuditEvent(
        {
          actorId: user.id,
          actorType: 'USER',
          reason: reviewNotes ?? 'Extraction rejected by reviewer',
        },
        'STATUS_CHANGE',
        'RECEIPT',
        receiptId,
        previousState,
        { status: 'CANCELLED', reviewAction: 'REJECT' },
      );

      logger.info({
        event: 'review_rejected',
        receiptId,
        reviewerId: user.id,
      });

      return NextResponse.json({
        message: 'Extraction rejected',
        receiptId,
        status: 'CANCELLED',
      });
    }

    // â”€â”€ CORRECT_AND_APPROVE â”€â”€
    if (action === 'CORRECT_AND_APPROVE' && corrections) {
      // Apply header-level corrections
      const headerUpdates: Record<string, unknown> = {};

      if (corrections.supplier_name !== undefined) {
        // Note: supplier_name correction would need supplier resolution
        // For now, store in notes
        headerUpdates.notes = `[CORRECTED] supplier_name: ${corrections.supplier_name}\n${receipt.notes ?? ''}`;
      }
      if (corrections.po_reference !== undefined) {
        headerUpdates.poNumber = corrections.po_reference;
      }
      if (corrections.carrier !== undefined) {
        headerUpdates.carrier = corrections.carrier;
      }
      if (corrections.tracking_number !== undefined) {
        headerUpdates.trackingNumber = corrections.tracking_number;
      }
      if (corrections.ship_date !== undefined) {
        headerUpdates.shipDate = corrections.ship_date
          ? new Date(corrections.ship_date)
          : null;
      }

      // Apply line-level corrections
      if (corrections.line_items && corrections.line_items.length > 0) {
        for (const lineCorrection of corrections.line_items) {
          const existingLine = receipt.lines.find(
            (l) => l.lineNumber === lineCorrection.lineNumber,
          );

          if (existingLine) {
            const lineUpdates: Record<string, unknown> = {};

            if (lineCorrection.sku !== undefined) {
              lineUpdates.sku = lineCorrection.sku;
            }
            if (lineCorrection.upc !== undefined) {
              lineUpdates.upc = lineCorrection.upc;
            }
            if (lineCorrection.productName !== undefined) {
              lineUpdates.productName = lineCorrection.productName;
            }
            if (lineCorrection.qtyExpected !== undefined) {
              lineUpdates.qtyExpected = lineCorrection.qtyExpected;
            }
            if (lineCorrection.unitCost !== undefined) {
              lineUpdates.unitCost = lineCorrection.unitCost;
            }
            if (lineCorrection.productId !== undefined) {
              lineUpdates.productId = lineCorrection.productId;
            }

            if (Object.keys(lineUpdates).length > 0) {
              await prisma.receiptLine.update({
                where: { id: existingLine.id },
                data: lineUpdates,
              });
            }
          }
        }

        // Recalculate totals after line corrections
        const updatedLines = await prisma.receiptLine.findMany({
          where: { receiptId },
        });
        headerUpdates.totalLinesExpected = updatedLines.length;
        headerUpdates.totalQtyExpected = updatedLines.reduce(
          (sum, l) => sum + l.qtyExpected,
          0,
        );
      }

      // Move to AWAITING_ARRIVAL
      await prisma.inventoryReceipt.update({
        where: { id: receiptId },
        data: {
          ...headerUpdates,
          status: 'AWAITING_ARRIVAL',
          completedBy: user.id,
          completedAt: new Date(),
        },
      });

      await createAuditEvent(
        {
          actorId: user.id,
          actorType: 'USER',
          reason: reviewNotes ?? 'Extraction corrected and approved by reviewer',
        },
        'STATUS_CHANGE',
        'RECEIPT',
        receiptId,
        previousState,
        {
          status: 'AWAITING_ARRIVAL',
          reviewAction: 'CORRECT_AND_APPROVE',
          corrections,
        },
      );

      logger.info({
        event: 'review_corrected_and_approved',
        receiptId,
        reviewerId: user.id,
        correctionFields: Object.keys(corrections),
      });

      return NextResponse.json({
        message: 'Extraction corrected and approved',
        receiptId,
        status: 'AWAITING_ARRIVAL',
      });
    }

    // â”€â”€ APPROVE (as-is) â”€â”€
    await prisma.inventoryReceipt.update({
      where: { id: receiptId },
      data: {
        status: 'AWAITING_ARRIVAL',
        completedBy: user.id,
        completedAt: new Date(),
        notes: reviewNotes
          ? `[APPROVED] ${reviewNotes}\n\n${receipt.notes ?? ''}`
          : receipt.notes,
      },
    });

    await createAuditEvent(
      {
        actorId: user.id,
        actorType: 'USER',
        reason: reviewNotes ?? 'Extraction approved by reviewer',
      },
      'STATUS_CHANGE',
      'RECEIPT',
      receiptId,
      previousState,
      { status: 'AWAITING_ARRIVAL', reviewAction: 'APPROVE' },
    );

    logger.info({
      event: 'review_approved',
      receiptId,
      reviewerId: user.id,
    });

    return NextResponse.json({
      message: 'Extraction approved',
      receiptId,
      status: 'AWAITING_ARRIVAL',
    });
  } catch (error) {
    logger.error({
      event: 'review_approve_error',
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Failed to process review action' },
      { status: 500 },
    );
  }
}

// â”€â”€â”€ PATCH /api/inventory/review â”€â”€â”€

/**
 * Update individual fields of a pending extraction.
 *
 * Allows granular field-level updates without approving or rejecting
 * the extraction. Useful for incremental corrections in the review UI.
 *
 * Request body:
 * - receiptId (string, required)
 * - updates (object): Fields to update at header and line level
 */
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await authenticateReviewUser(request);
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;

    const body = await request.json();
    const validation = reviewPatchSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { receiptId, updates } = validation.data;

    // Fetch the receipt
    const receipt = await prisma.inventoryReceipt.findUnique({
      where: { id: receiptId },
    });

    if (!receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    if (receipt.status !== 'PENDING_DOCUMENT') {
      return NextResponse.json(
        {
          error: `Receipt is not in review queue â€” current status: ${receipt.status}`,
        },
        { status: 400 },
      );
    }

    const previousState: Record<string, unknown> = {};
    const newState: Record<string, unknown> = {};

    // Apply header-level updates
    const headerUpdates: Record<string, unknown> = {};

    if (updates.supplierId !== undefined) {
      previousState.supplierId = receipt.supplierId;
      headerUpdates.supplierId = updates.supplierId;
      newState.supplierId = updates.supplierId;
    }
    if (updates.poNumber !== undefined) {
      previousState.poNumber = receipt.poNumber;
      headerUpdates.poNumber = updates.poNumber;
      newState.poNumber = updates.poNumber;
    }
    if (updates.carrier !== undefined) {
      previousState.carrier = receipt.carrier;
      headerUpdates.carrier = updates.carrier;
      newState.carrier = updates.carrier;
    }
    if (updates.trackingNumber !== undefined) {
      previousState.trackingNumber = receipt.trackingNumber;
      headerUpdates.trackingNumber = updates.trackingNumber;
      newState.trackingNumber = updates.trackingNumber;
    }
    if (updates.shipDate !== undefined) {
      previousState.shipDate = receipt.shipDate;
      headerUpdates.shipDate = updates.shipDate
        ? new Date(updates.shipDate)
        : null;
      newState.shipDate = updates.shipDate;
    }
    if (updates.notes !== undefined) {
      previousState.notes = receipt.notes;
      headerUpdates.notes = updates.notes;
      newState.notes = updates.notes;
    }

    if (Object.keys(headerUpdates).length > 0) {
      await prisma.inventoryReceipt.update({
        where: { id: receiptId },
        data: headerUpdates,
      });
    }

    // Apply line-level updates
    const lineUpdateResults: { lineId: string; updated: boolean; error?: string }[] = [];

    if (updates.lines && updates.lines.length > 0) {
      for (const lineUpdate of updates.lines) {
        try {
          const line = await prisma.receiptLine.findFirst({
            where: { id: lineUpdate.lineId, receiptId },
          });

          if (!line) {
            lineUpdateResults.push({
              lineId: lineUpdate.lineId,
              updated: false,
              error: 'Line not found on this receipt',
            });
            continue;
          }

          const lineData: Record<string, unknown> = {};

          if (lineUpdate.productId !== undefined) {
            lineData.productId = lineUpdate.productId;
          }
          if (lineUpdate.sku !== undefined) {
            lineData.sku = lineUpdate.sku;
          }
          if (lineUpdate.upc !== undefined) {
            lineData.upc = lineUpdate.upc;
          }
          if (lineUpdate.productName !== undefined) {
            lineData.productName = lineUpdate.productName;
          }
          if (lineUpdate.qtyExpected !== undefined) {
            lineData.qtyExpected = lineUpdate.qtyExpected;
          }
          if (lineUpdate.unitCost !== undefined) {
            lineData.unitCost = lineUpdate.unitCost;
          }

          if (Object.keys(lineData).length > 0) {
            await prisma.receiptLine.update({
              where: { id: lineUpdate.lineId },
              data: lineData,
            });
            lineUpdateResults.push({ lineId: lineUpdate.lineId, updated: true });
          } else {
            lineUpdateResults.push({
              lineId: lineUpdate.lineId,
              updated: false,
              error: 'No fields to update',
            });
          }
        } catch (lineError) {
          lineUpdateResults.push({
            lineId: lineUpdate.lineId,
            updated: false,
            error: (lineError as Error).message,
          });
        }
      }

      // Recalculate receipt totals
      const allLines = await prisma.receiptLine.findMany({
        where: { receiptId },
      });
      await prisma.inventoryReceipt.update({
        where: { id: receiptId },
        data: {
          totalLinesExpected: allLines.length,
          totalQtyExpected: allLines.reduce((sum, l) => sum + l.qtyExpected, 0),
        },
      });
    }

    // Audit the update
    if (Object.keys(newState).length > 0 || lineUpdateResults.some((r) => r.updated)) {
      await createAuditEvent(
        {
          actorId: user.id,
          actorType: 'USER',
          reason: 'Review queue field update',
        },
        'UPDATE',
        'RECEIPT',
        receiptId,
        Object.keys(previousState).length > 0 ? previousState : null,
        Object.keys(newState).length > 0 ? newState : null,
      );
    }

    logger.info({
      event: 'review_patch',
      receiptId,
      reviewerId: user.id,
      headerFieldsUpdated: Object.keys(headerUpdates).length,
      linesUpdated: lineUpdateResults.filter((r) => r.updated).length,
    });

    return NextResponse.json({
      message: 'Review item updated',
      receiptId,
      headerFieldsUpdated: Object.keys(headerUpdates),
      lineResults: lineUpdateResults,
    });
  } catch (error) {
    logger.error({
      event: 'review_patch_error',
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Failed to update review item' },
      { status: 500 },
    );
  }
}
