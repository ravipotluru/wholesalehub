import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';

/**
 * DELETE /api/buyer/documents/[id] — Remove a verification document the
 * caller owns, only while it's still PENDING. Once an admin has
 * APPROVED or REJECTED a document, the retailer cannot withdraw it
 * (the audit trail must be preserved).
 *
 * IDOR guard: scope the delete by `(id, retailerId, status: PENDING)`
 * so a caller cannot remove another retailer's document by guessing
 * the id, and so a retailer cannot quietly withdraw a rejection.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return apiError({
        status: 401,
        code: 'AUTH_REQUIRED',
        message: 'Authentication required.',
      });
    }

    if (user.role !== 'RETAILER') {
      return apiError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Only retailers can delete their verification documents.',
        logContext: { userId: user.id, role: user.role },
      });
    }

    const retailerId = user.retailerId;
    if (!retailerId) {
      return apiError({
        status: 403,
        code: 'NO_RETAILER_LINKED',
        message: 'No retailer linked to this account.',
        logContext: { userId: user.id },
      });
    }

    // Two-step inside a transaction so we can return a precise error if the
    // doc exists but is no longer PENDING — versus 404 for a non-existent
    // doc or one belonging to another retailer (don't leak existence).
    const outcome = await prisma.$transaction(async (tx) => {
      const doc = await tx.buyerDocument.findFirst({
        where: { id: params.id, retailerId },
        select: { id: true, status: true },
      });
      if (!doc) {
        return { kind: 'not_found' as const };
      }
      if (doc.status !== 'PENDING') {
        return { kind: 'not_pending' as const, status: doc.status };
      }
      await tx.buyerDocument.delete({ where: { id: doc.id } });
      return { kind: 'deleted' as const };
    });

    if (outcome.kind === 'not_found') {
      return apiError({
        status: 404,
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Document not found.',
        logContext: { userId: user.id, documentId: params.id },
      });
    }

    if (outcome.kind === 'not_pending') {
      return apiError({
        status: 409,
        code: 'DOCUMENT_NOT_PENDING',
        message: 'Only PENDING documents can be deleted.',
        details: { currentStatus: outcome.status },
      });
    }

    logger.info({
      event: 'buyer_document_deleted',
      retailerId,
      documentId: params.id,
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    logger.error({
      event: 'buyer_document_delete_error',
      documentId: params.id,
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Failed to delete document.',
    });
  }
}
