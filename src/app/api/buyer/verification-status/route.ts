import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import { REQUIRED_DOCUMENT_TYPES } from '@/lib/buyer-verification';

/**
 * GET /api/buyer/verification-status — Calling retailer's overall
 * verification status + per-required-document-type readiness.
 *
 * The response shape is designed for a UI checklist:
 *   - `verificationStatus`: the retailer-level enum
 *   - `requiredDocuments`: one entry per required type with its current
 *     state (NOT_UPLOADED / PENDING / APPROVED / REJECTED), the latest
 *     document id (if any), and the reject reason (if any)
 *   - `documents`: full list of uploads, newest first
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
        message: 'Only retailers can view verification status.',
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

    const retailer = await prisma.retailer.findUnique({
      where: { id: retailerId },
      select: {
        verificationStatus: true,
        verifiedAt: true,
        buyerDocuments: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            type: true,
            status: true,
            fileName: true,
            mimeType: true,
            fileSizeKb: true,
            storageUrl: true,
            rejectReason: true,
            reviewedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!retailer) {
      return apiError({
        status: 404,
        code: 'RETAILER_NOT_FOUND',
        message: 'Retailer not found.',
      });
    }

    type DocSummary = (typeof retailer.buyerDocuments)[number];

    // Per-required-type readiness. Use the latest doc per type.
    const requiredDocuments = REQUIRED_DOCUMENT_TYPES.map((type) => {
      const docsOfType = retailer.buyerDocuments.filter((d) => d.type === type);
      const latest: DocSummary | undefined = docsOfType[0]; // already ordered desc
      if (!latest) {
        return {
          type,
          state: 'NOT_UPLOADED' as const,
          latestDocumentId: null,
          rejectReason: null,
          uploadedAt: null,
        };
      }
      return {
        type,
        state: latest.status,
        latestDocumentId: latest.id,
        rejectReason: latest.status === 'REJECTED' ? latest.rejectReason : null,
        uploadedAt: latest.createdAt,
      };
    });

    return NextResponse.json({
      verificationStatus: retailer.verificationStatus,
      verifiedAt: retailer.verifiedAt,
      requiredDocuments,
      documents: retailer.buyerDocuments,
    });
  } catch (error) {
    logger.error({
      event: 'buyer_verification_status_error',
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Failed to fetch verification status.',
    });
  }
}
