import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';

/**
 * GET /api/admin/verification — retailers awaiting verification review,
 * oldest first (SLA order), each with their latest document per type.
 * Powers the T&S queue at /admin/verification.
 */
export async function GET() {
  const user = await getAuthedUser();
  if (!user) {
    return apiError({ status: 401, code: 'UNAUTHORIZED', message: 'Sign in required.' });
  }
  if (user.role !== 'ADMIN') {
    return apiError({ status: 403, code: 'ADMIN_ONLY', message: 'Admin access required.' });
  }

  const retailers = await prisma.retailer.findMany({
    where: { verificationStatus: 'PENDING_REVIEW' },
    orderBy: { updatedAt: 'asc' },
    take: 100,
    select: {
      id: true,
      retailerId: true,
      businessName: true,
      contactEmail: true,
      city: true,
      state: true,
      updatedAt: true,
      documents: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          fileName: true,
          fileSizeBytes: true,
          status: true,
          rejectReason: true,
          createdAt: true,
        },
      },
      users: {
        take: 1,
        orderBy: { createdAt: 'asc' },
        select: { firstName: true, lastName: true, phone: true },
      },
    },
  });

  const queue = retailers.map((r) => {
    const latestByType = new Map<string, (typeof r.documents)[number]>();
    for (const doc of r.documents) {
      if (!latestByType.has(doc.type)) latestByType.set(doc.type, doc);
    }
    const contact = r.users[0];
    return {
      retailerId: r.id,
      humanId: r.retailerId,
      business: r.businessName,
      contactName: contact ? `${contact.firstName} ${contact.lastName}` : null,
      contactEmail: r.contactEmail,
      contactPhone: contact?.phone ?? null,
      city: r.city,
      state: r.state,
      submittedAt: r.updatedAt,
      documents: Array.from(latestByType.values()),
    };
  });

  return NextResponse.json({ queue, count: queue.length });
}
