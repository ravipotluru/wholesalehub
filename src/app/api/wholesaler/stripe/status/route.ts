import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';

/**
 * GET /api/wholesaler/stripe/status
 *
 * Auth: WHOLESALER. Returns the current `stripeAccountStatus` plus a few
 * derived flags useful for the dashboard:
 *   - `canAcceptPayments` — true iff status is ACTIVE (i.e. KYC done,
 *     `charges_enabled` and `payouts_enabled` both true)
 *   - `needsOnboarding`   — convenience flag for the UI to show the
 *     "Start onboarding" CTA
 *
 * This endpoint never calls Stripe directly — it reads our cached state.
 * The freshness of that state is maintained by the `account.updated`
 * webhook handler (and an admin-triggered "refresh" path in a follow-up).
 */
export async function GET() {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return apiError({
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'Authentication required.',
      });
    }
    if (user.role !== 'WHOLESALER') {
      return apiError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Only wholesalers can view payout status.',
      });
    }
    if (!user.wholesalerId) {
      return apiError({
        status: 403,
        code: 'NO_WHOLESALER_LINKED',
        message: 'No wholesaler linked to this account.',
      });
    }

    const wholesaler = await prisma.wholesaler.findUnique({
      where: { id: user.wholesalerId },
      select: {
        id: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
        stripeOnboardedAt: true,
      },
    });

    if (!wholesaler) {
      return apiError({
        status: 404,
        code: 'WHOLESALER_NOT_FOUND',
        message: 'Wholesaler record not found.',
      });
    }

    const canAcceptPayments = wholesaler.stripeAccountStatus === 'ACTIVE';
    const needsOnboarding =
      !wholesaler.stripeAccountId ||
      wholesaler.stripeAccountStatus === 'PENDING' ||
      wholesaler.stripeAccountStatus === 'ONBOARDING';

    logger.info({
      event: 'stripe_status_read',
      wholesalerId: wholesaler.id,
      status: wholesaler.stripeAccountStatus,
    });

    return NextResponse.json({
      stripeAccountStatus: wholesaler.stripeAccountStatus,
      // Don't leak the raw Stripe account id to the client — it's not a
      // secret (Stripe ids aren't), but there's no use for it in the UI and
      // surfacing it invites copy-paste mistakes in support tickets.
      hasStripeAccount: !!wholesaler.stripeAccountId,
      stripeOnboardedAt: wholesaler.stripeOnboardedAt?.toISOString() ?? null,
      canAcceptPayments,
      needsOnboarding,
    });
  } catch (error) {
    logger.error({
      event: 'stripe_status_error',
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'STRIPE_STATUS_FAILED',
      message: 'Could not read Stripe status.',
    });
  }
}
