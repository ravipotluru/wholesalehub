import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import { buyerDocumentSchema } from '@/lib/validators';

/**
 * POST /api/buyer/documents — record an uploaded verification document and
 * flip the retailer to PENDING_REVIEW.
 *
 * v1 is metadata-first: the client sends fileName/size (and fileUrl once
 * blob storage is wired — Vercel Blob signed upload is the planned
 * follow-up). The review state machine is fully real; only the bytes-at-rest
 * part is pending. A re-upload of the same type creates a NEW row; the
 * latest row per type is what verification-status reports.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthedUser();
  if (!user) {
    return apiError({ status: 401, code: 'UNAUTHORIZED', message: 'Sign in required.' });
  }
  if (!user.retailerId) {
    return apiError({
      status: 403,
      code: 'RETAILER_ONLY',
      message: 'Only retailer accounts upload verification documents.',
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError({ status: 400, code: 'INVALID_JSON', message: 'Body must be JSON.' });
  }

  const validation = buyerDocumentSchema.safeParse(body);
  if (!validation.success) {
    return apiError({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'Document is invalid.',
      details: { fieldErrors: validation.error.flatten().fieldErrors },
    });
  }
  const data = validation.data;
  const retailerId = user.retailerId;

  const document = await prisma.$transaction(async (tx) => {
    const doc = await tx.buyerDocument.create({
      data: {
        retailerId,
        uploadedByUserId: user.id,
        type: data.type,
        fileName: data.fileName,
        fileUrl: data.fileUrl ?? null,
        fileSizeBytes: data.fileSizeBytes ?? null,
      },
    });

    // Any fresh upload puts the retailer (back) into the review queue,
    // unless they're already VERIFIED (replacing an approved doc keeps
    // VERIFIED until an admin says otherwise).
    await tx.retailer.updateMany({
      where: { id: retailerId, verificationStatus: { in: ['UNVERIFIED', 'REJECTED'] } },
      data: { verificationStatus: 'PENDING_REVIEW' },
    });

    return doc;
  });

  logger.info({
    event: 'buyer_document_uploaded',
    retailerId,
    documentId: document.id,
    type: data.type,
  });

  return NextResponse.json(
    {
      document: {
        id: document.id,
        type: document.type,
        fileName: document.fileName,
        status: document.status,
        createdAt: document.createdAt,
      },
    },
    { status: 201 },
  );
}
