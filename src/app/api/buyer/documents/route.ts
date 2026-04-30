import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { buyerDocumentUploadSchema } from '@/lib/validators';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import { shouldFlipToPendingOnUpload } from '@/lib/buyer-verification';

/**
 * GET /api/buyer/documents — List the calling retailer's verification
 * documents (most recent first). Read-only; no admin metadata leaks.
 */
export async function GET() {
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
        message: 'Only retailers can access verification documents.',
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

    const where: Prisma.BuyerDocumentWhereInput = { retailerId };

    const documents = await prisma.buyerDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        status: true,
        fileName: true,
        mimeType: true,
        fileSizeKb: true,
        storageUrl: true,
        notes: true,
        rejectReason: true,
        // Intentionally omit `reviewedBy` — that's an admin user id.
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ documents });
  } catch (error) {
    logger.error({
      event: 'buyer_documents_get_error',
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Failed to fetch documents.',
    });
  }
}

/**
 * POST /api/buyer/documents — Record metadata for a freshly-uploaded
 * verification document. The file itself was uploaded directly to the
 * storage layer (signed URL); we just persist the metadata + flip the
 * retailer to PENDING_REVIEW if this is their first document.
 *
 * This is a multi-write path (insert document + maybe update retailer)
 * so it runs in a transaction.
 */
export async function POST(request: NextRequest) {
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
        message: 'Only retailers can upload verification documents.',
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

    const body = await request.json();
    const validation = buyerDocumentUploadSchema.safeParse(body);
    if (!validation.success) {
      return apiError({
        status: 400,
        code: 'VALIDATION_FAILED',
        message: 'Invalid document metadata.',
        details: { fieldErrors: validation.error.flatten().fieldErrors },
      });
    }

    const { type, fileName, mimeType, fileSizeKb, storageUrl, notes } = validation.data;

    const result = await prisma.$transaction(async (tx) => {
      const retailer = await tx.retailer.findUnique({
        where: { id: retailerId },
        select: { verificationStatus: true },
      });
      if (!retailer) {
        return { ok: false as const, status: 404, code: 'RETAILER_NOT_FOUND' };
      }

      const document = await tx.buyerDocument.create({
        data: {
          retailerId,
          type,
          fileName,
          mimeType,
          fileSizeKb,
          storageUrl,
          notes,
        },
      });

      let newStatus = retailer.verificationStatus;
      if (shouldFlipToPendingOnUpload(retailer.verificationStatus)) {
        const updated = await tx.retailer.update({
          where: { id: retailerId },
          data: { verificationStatus: 'PENDING_REVIEW' },
          select: { verificationStatus: true },
        });
        newStatus = updated.verificationStatus;

        await tx.auditEvent.create({
          data: {
            actorId: user.id,
            actorType: 'USER',
            action: 'STATUS_CHANGE',
            entityType: 'RETAILER',
            entityId: retailerId,
            previousState: { verificationStatus: 'UNVERIFIED' },
            newState: { verificationStatus: 'PENDING_REVIEW' },
            changedFields: ['verificationStatus'],
            reason: `First verification document uploaded (${type}).`,
          },
        });
      }

      return {
        ok: true as const,
        document,
        verificationStatus: newStatus,
      };
    });

    if (!result.ok) {
      return apiError({
        status: result.status,
        code: result.code,
        message: 'Retailer not found.',
      });
    }

    logger.info({
      event: 'buyer_document_uploaded',
      retailerId,
      documentId: result.document.id,
      type,
      verificationStatus: result.verificationStatus,
    });

    return NextResponse.json(
      {
        document: {
          id: result.document.id,
          type: result.document.type,
          status: result.document.status,
          fileName: result.document.fileName,
          mimeType: result.document.mimeType,
          fileSizeKb: result.document.fileSizeKb,
          storageUrl: result.document.storageUrl,
          notes: result.document.notes,
          createdAt: result.document.createdAt,
          updatedAt: result.document.updatedAt,
        },
        verificationStatus: result.verificationStatus,
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error({
      event: 'buyer_document_upload_error',
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Failed to record document.',
    });
  }
}
