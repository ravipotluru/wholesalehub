import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { buyerDocumentReviewSchema } from '@/lib/validators';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import { deriveRetailerVerification } from '@/lib/buyer-verification';

/**
 * PATCH /api/admin/verification/[retailerId]/documents/[id] — Approve or
 * reject a single document. Recomputes the retailer-level
 * `verificationStatus` from the (now-updated) document set inside the
 * same transaction so the retailer status never lags reality.
 *
 * Body: { action: 'APPROVE' | 'REJECT', rejectReason?: string }.
 * `rejectReason` is required when action is REJECT (Zod refine).
 *
 * Status transitions handled here:
 *   - All required types APPROVED → retailer flips to VERIFIED.
 *     Sets `verifiedAt` + `verifiedBy` on the retailer.
 *   - Any required type REJECTED → retailer flips to REJECTED. The
 *     reject reason from this document is surfaced as the retailer-level
 *     reason via the audit event metadata.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { retailerId: string; id: string } },
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

    if (user.role !== 'ADMIN') {
      return apiError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Admin access required.',
        logContext: { userId: user.id, role: user.role },
      });
    }

    const body = await request.json();
    const validation = buyerDocumentReviewSchema.safeParse(body);
    if (!validation.success) {
      return apiError({
        status: 400,
        code: 'VALIDATION_FAILED',
        message: 'Invalid review payload.',
        details: { fieldErrors: validation.error.flatten().fieldErrors },
      });
    }

    const { action, rejectReason } = validation.data;

    // All writes (document update + retailer update + audit) live in one
    // transaction. Without this, an admin could see an APPROVED document
    // attached to a retailer still showing PENDING_REVIEW.
    const result = await prisma.$transaction(async (tx) => {
      const document = await tx.buyerDocument.findFirst({
        where: { id: params.id, retailerId: params.retailerId },
        select: { id: true, status: true, type: true },
      });
      if (!document) {
        return { kind: 'not_found' as const };
      }

      if (document.status !== 'PENDING') {
        return {
          kind: 'not_pending' as const,
          currentStatus: document.status,
        };
      }

      const newDocStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      const reviewedAt = new Date();

      const updatedDoc = await tx.buyerDocument.update({
        where: { id: document.id },
        data: {
          status: newDocStatus,
          reviewedBy: user.id,
          reviewedAt,
          rejectReason: action === 'REJECT' ? rejectReason ?? null : null,
        },
      });

      // Re-derive the retailer's overall status from the full document set.
      const allDocs = await tx.buyerDocument.findMany({
        where: { retailerId: params.retailerId },
        select: { type: true, status: true, rejectReason: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });

      const derived = deriveRetailerVerification(allDocs);

      const retailerBefore = await tx.retailer.findUnique({
        where: { id: params.retailerId },
        select: { verificationStatus: true },
      });
      if (!retailerBefore) {
        return { kind: 'retailer_not_found' as const };
      }

      const previousStatus = retailerBefore.verificationStatus;
      const willVerify = derived.status === 'VERIFIED' && previousStatus !== 'VERIFIED';
      const willReject = derived.status === 'REJECTED' && previousStatus !== 'REJECTED';
      const willUnverify =
        derived.status !== 'VERIFIED' &&
        previousStatus === 'VERIFIED'; // e.g. doc rejected after a prior VERIFIED state

      const updatedRetailer = await tx.retailer.update({
        where: { id: params.retailerId },
        data: {
          verificationStatus: derived.status,
          // Stamp on transitions only — keep prior values otherwise.
          verifiedAt: willVerify ? new Date() : willUnverify ? null : undefined,
          verifiedBy: willVerify ? user.id : willUnverify ? null : undefined,
        },
        select: { verificationStatus: true, verifiedAt: true, verifiedBy: true },
      });

      // Audit per material change.
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          actorType: 'USER',
          action: action === 'APPROVE' ? 'STATUS_CHANGE' : 'STATUS_CHANGE',
          entityType: 'BUYER_DOCUMENT',
          entityId: document.id,
          previousState: { status: 'PENDING' },
          newState: { status: newDocStatus, rejectReason: rejectReason ?? null },
          changedFields: action === 'APPROVE' ? ['status'] : ['status', 'rejectReason'],
          reason:
            action === 'APPROVE'
              ? `Document ${document.type} approved.`
              : `Document ${document.type} rejected: ${rejectReason ?? ''}`,
          metadata: { retailerId: params.retailerId, documentType: document.type },
        },
      });

      if (previousStatus !== derived.status) {
        await tx.auditEvent.create({
          data: {
            actorId: user.id,
            actorType: 'USER',
            action: 'STATUS_CHANGE',
            entityType: 'RETAILER',
            entityId: params.retailerId,
            previousState: { verificationStatus: previousStatus },
            newState: { verificationStatus: derived.status },
            changedFields: ['verificationStatus'],
            reason: derived.rejectReason ?? `Retailer status → ${derived.status}.`,
            metadata: {
              triggeringDocumentId: document.id,
              triggeringDocumentType: document.type,
            },
          },
        });
      }

      return {
        kind: 'ok' as const,
        document: updatedDoc,
        retailer: updatedRetailer,
        derived,
        previousStatus,
      };
    });

    if (result.kind === 'not_found') {
      return apiError({
        status: 404,
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Document not found for this retailer.',
        logContext: {
          adminId: user.id,
          retailerId: params.retailerId,
          documentId: params.id,
        },
      });
    }

    if (result.kind === 'retailer_not_found') {
      return apiError({
        status: 404,
        code: 'RETAILER_NOT_FOUND',
        message: 'Retailer not found.',
      });
    }

    if (result.kind === 'not_pending') {
      return apiError({
        status: 409,
        code: 'DOCUMENT_NOT_PENDING',
        message: 'Document has already been reviewed.',
        details: { currentStatus: result.currentStatus },
      });
    }

    logger.info({
      event: 'buyer_document_reviewed',
      adminId: user.id,
      retailerId: params.retailerId,
      documentId: params.id,
      action,
      newDocStatus: result.document.status,
      previousRetailerStatus: result.previousStatus,
      newRetailerStatus: result.retailer.verificationStatus,
    });

    return NextResponse.json({
      document: {
        id: result.document.id,
        type: result.document.type,
        status: result.document.status,
        rejectReason: result.document.rejectReason,
        reviewedAt: result.document.reviewedAt,
      },
      retailer: {
        verificationStatus: result.retailer.verificationStatus,
        verifiedAt: result.retailer.verifiedAt,
        rejectReason: result.derived.rejectReason,
      },
    });
  } catch (error) {
    logger.error({
      event: 'buyer_document_review_error',
      retailerId: params.retailerId,
      documentId: params.id,
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Failed to review document.',
    });
  }
}
