import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import { verificationDecisionSchema } from '@/lib/validators';

interface RouteParams {
  params: { retailerId: string };
}

/**
 * POST /api/admin/verification/[retailerId] — approve or reject a buyer's
 * verification. One transaction: retailer status + per-document decisions +
 * in-app notification to every user on the retailer account.
 *
 * APPROVE → retailer VERIFIED, all PENDING docs APPROVED.
 * REJECT  → retailer REJECTED, all PENDING docs REJECTED with the reason
 *           (the buyer re-uploads, which flips them back to PENDING_REVIEW).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthedUser();
  if (!user) {
    return apiError({ status: 401, code: 'UNAUTHORIZED', message: 'Sign in required.' });
  }
  if (user.role !== 'ADMIN') {
    return apiError({ status: 403, code: 'ADMIN_ONLY', message: 'Admin access required.' });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError({ status: 400, code: 'INVALID_JSON', message: 'Body must be JSON.' });
  }

  const validation = verificationDecisionSchema.safeParse(body);
  if (!validation.success) {
    return apiError({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'Decision is invalid.',
      details: { fieldErrors: validation.error.flatten().fieldErrors },
    });
  }
  const { action, reason } = validation.data;

  const retailer = await prisma.retailer.findUnique({
    where: { id: params.retailerId },
    select: {
      id: true,
      businessName: true,
      verificationStatus: true,
      users: { select: { id: true } },
    },
  });
  if (!retailer) {
    return apiError({ status: 404, code: 'RETAILER_NOT_FOUND', message: 'Retailer not found.' });
  }
  if (retailer.verificationStatus !== 'PENDING_REVIEW') {
    return apiError({
      status: 409,
      code: 'NOT_IN_REVIEW',
      message: `Retailer is ${retailer.verificationStatus}, not PENDING_REVIEW.`,
    });
  }

  const now = new Date();
  const approved = action === 'APPROVE';

  await prisma.$transaction(async (tx) => {
    await tx.retailer.update({
      where: { id: retailer.id },
      data: { verificationStatus: approved ? 'VERIFIED' : 'REJECTED' },
    });

    await tx.buyerDocument.updateMany({
      where: { retailerId: retailer.id, status: 'PENDING' },
      data: {
        status: approved ? 'APPROVED' : 'REJECTED',
        rejectReason: approved ? null : reason,
        reviewedByUserId: user.id,
        reviewedAt: now,
      },
    });

    if (retailer.users.length > 0) {
      await tx.notification.createMany({
        data: retailer.users.map((u) => ({
          userId: u.id,
          type: 'SYSTEM',
          title: approved ? 'Verification approved' : 'Verification needs attention',
          message: approved
            ? `${retailer.businessName} is verified. Age-restricted SKUs are now available at checkout.`
            : `Your verification was not approved: ${reason}. Re-upload the corrected document to resubmit.`,
          actionUrl: '/settings/verification',
        })),
      });
    }
  });

  logger.info({
    event: approved ? 'buyer_verification_approved' : 'buyer_verification_rejected',
    retailerId: retailer.id,
    decidedBy: user.id,
  });

  return NextResponse.json({ ok: true, status: approved ? 'VERIFIED' : 'REJECTED' });
}
