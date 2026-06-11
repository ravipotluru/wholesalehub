import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';

/**
 * GET /api/buyer/verification-status — the caller-retailer's verification
 * state + latest document per type. Shape matches BuyerVerificationView.
 */
export async function GET() {
  const user = await getAuthedUser();
  if (!user) {
    return apiError({ status: 401, code: 'UNAUTHORIZED', message: 'Sign in required.' });
  }
  if (!user.retailerId) {
    return apiError({
      status: 403,
      code: 'RETAILER_ONLY',
      message: 'Only retailer accounts have buyer verification.',
    });
  }

  const retailer = await prisma.retailer.findUnique({
    where: { id: user.retailerId },
    select: {
      verificationStatus: true,
      documents: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          fileName: true,
          status: true,
          rejectReason: true,
          reviewedAt: true,
          createdAt: true,
        },
      },
    },
  });
  if (!retailer) {
    return apiError({ status: 404, code: 'RETAILER_NOT_FOUND', message: 'Retailer not found.' });
  }

  // Latest document per type wins — older rows are audit history.
  const latestByType = new Map<string, (typeof retailer.documents)[number]>();
  for (const doc of retailer.documents) {
    if (!latestByType.has(doc.type)) latestByType.set(doc.type, doc);
  }

  return NextResponse.json({
    status: retailer.verificationStatus,
    documents: Array.from(latestByType.values()),
    required: ['RESALE_CERTIFICATE', 'EIN_LETTER', 'TOBACCO_LICENSE'],
  });
}
