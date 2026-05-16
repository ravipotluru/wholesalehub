import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';

/**
 * GET /api/admin/verification-queue — Retailers with at least one
 * PENDING document, sorted by oldest-pending-first by default so
 * admins clear the backlog FIFO.
 *
 * Query parameters:
 *   - sort: 'oldest' | 'newest' | 'business_name' (default 'oldest')
 *   - status: 'PENDING_REVIEW' | 'REJECTED' | 'VERIFIED' (filter retailer
 *             status; default lists every retailer that has any pending
 *             docs regardless of retailer-level status)
 *   - page, limit: paginate
 */

const querySchema = z.object({
  sort: z.enum(['oldest', 'newest', 'business_name']).default('oldest'),
  status: z.enum(['PENDING_REVIEW', 'REJECTED', 'VERIFIED', 'UNVERIFIED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) {
      return apiError({
        status: 400,
        code: 'VALIDATION_FAILED',
        message: 'Invalid query parameters.',
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
    }

    const { sort, status, page, limit } = parsed.data;

    // Default: any retailer with at least one PENDING document. When
    // `status` is provided, restrict to retailers in that overall status.
    const where: Prisma.RetailerWhereInput = {
      buyerDocuments: { some: { status: 'PENDING' } },
    };
    if (status) {
      where.verificationStatus = status;
    }

    // For 'business_name' / 'newest' we let Postgres do the work via
    // `orderBy`. For 'oldest' (the default) we want to surface retailers
    // whose oldest PENDING document is the most stale, which Prisma can't
    // express directly. We over-fetch (ordered by createdAt asc as a stand-in)
    // and re-sort in memory after we know each retailer's oldest-pending-at.
    let orderBy: Prisma.RetailerOrderByWithRelationInput;
    if (sort === 'newest') {
      orderBy = { updatedAt: 'desc' };
    } else if (sort === 'business_name') {
      orderBy = { businessName: 'asc' };
    } else {
      orderBy = { createdAt: 'asc' };
    }

    const [retailers, total] = await Promise.all([
      prisma.retailer.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          retailerId: true,
          businessName: true,
          contactEmail: true,
          state: true,
          verificationStatus: true,
          verifiedAt: true,
          updatedAt: true,
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
              reviewedBy: true,
              reviewedAt: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      }),
      prisma.retailer.count({ where }),
    ]);

    const queue = retailers.map((r) => {
      const pendingCount = r.buyerDocuments.filter((d) => d.status === 'PENDING').length;
      const oldestPending = r.buyerDocuments
        .filter((d) => d.status === 'PENDING')
        .reduce<Date | null>(
          (oldest, d) => (oldest === null || d.createdAt < oldest ? d.createdAt : oldest),
          null,
        );
      return {
        retailerId: r.id,
        retailerCode: r.retailerId,
        businessName: r.businessName,
        contactEmail: r.contactEmail,
        state: r.state,
        verificationStatus: r.verificationStatus,
        verifiedAt: r.verifiedAt,
        pendingDocumentCount: pendingCount,
        oldestPendingAt: oldestPending,
        documents: r.buyerDocuments,
      };
    });

    // For the default `oldest` sort, re-order by oldest-pending-at within
    // the page (Postgres couldn't compute this from a relation aggregate).
    if (sort === 'oldest') {
      queue.sort((a, b) => {
        if (a.oldestPendingAt === null && b.oldestPendingAt === null) return 0;
        if (a.oldestPendingAt === null) return 1;
        if (b.oldestPendingAt === null) return -1;
        return a.oldestPendingAt.getTime() - b.oldestPendingAt.getTime();
      });
    }

    logger.info({
      event: 'verification_queue_listed',
      adminId: user.id,
      total,
      page,
      sort,
      statusFilter: status ?? null,
    });

    return NextResponse.json({
      queue,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({
      event: 'verification_queue_error',
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Failed to fetch verification queue.',
    });
  }
}
