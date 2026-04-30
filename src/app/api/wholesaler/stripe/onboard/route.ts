import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import { isStripeConfigured, StripeNotConfiguredError } from '@/lib/stripe/client';
import {
  createConnectedAccount,
  createOnboardingLink,
} from '@/lib/stripe/connect';

/**
 * Optional body — clients can override the return / refresh URLs (e.g. for
 * deep-linking back to a specific dashboard tab). When absent we fall back
 * to sensible defaults built from `NEXT_PUBLIC_APP_URL`.
 */
const onboardSchema = z.object({
  returnUrl: z.string().url().optional(),
  refreshUrl: z.string().url().optional(),
});

function defaultAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

/**
 * POST /api/wholesaler/stripe/onboard
 *
 * Auth: WHOLESALER. Creates the Stripe Connect (Express) account if missing
 * and returns a single-use onboarding link the client redirects to.
 *
 * Returns 503 with `STRIPE_NOT_CONFIGURED` when `STRIPE_SECRET_KEY` is unset.
 * That's the deliberate fail-loud-in-prod / fail-soft-in-dev contract: dev
 * + CI can run without a Stripe key as long as nobody hits this endpoint.
 */
export async function POST(request: NextRequest) {
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
        message: 'Only wholesalers can onboard a payout account.',
      });
    }
    if (!user.wholesalerId) {
      return apiError({
        status: 403,
        code: 'NO_WHOLESALER_LINKED',
        message: 'No wholesaler linked to this account.',
      });
    }

    if (!isStripeConfigured()) {
      // Deliberate: fail-LOUD in prod, fail-soft in dev. This 503 prevents a
      // misconfigured prod from silently no-op'ing onboarding.
      return apiError({
        status: 503,
        code: 'STRIPE_NOT_CONFIGURED',
        message: 'Payment processing not yet configured for this environment.',
      });
    }

    const rawBody = await request.json().catch(() => ({}));
    const validation = onboardSchema.safeParse(rawBody);
    if (!validation.success) {
      return apiError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body.',
        details: { fieldErrors: validation.error.flatten().fieldErrors },
      });
    }

    const wholesaler = await prisma.wholesaler.findUnique({
      where: { id: user.wholesalerId },
      select: {
        id: true,
        contactEmail: true,
        contactName: true,
        businessName: true,
        state: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
      },
    });

    if (!wholesaler) {
      return apiError({
        status: 404,
        code: 'WHOLESALER_NOT_FOUND',
        message: 'Wholesaler record not found.',
      });
    }

    // Idempotent — no-op if already created.
    const { stripeAccountId, created } = await createConnectedAccount(wholesaler);

    const returnUrl =
      validation.data.returnUrl ||
      `${defaultAppUrl()}/settings?stripe=onboarding-complete`;
    const refreshUrl =
      validation.data.refreshUrl ||
      `${defaultAppUrl()}/settings?stripe=onboarding-refresh`;

    const link = await createOnboardingLink(wholesaler.id, returnUrl, refreshUrl);

    logger.info({
      event: 'stripe_onboard_link_returned',
      wholesalerId: wholesaler.id,
      stripeAccountId,
      accountCreatedThisCall: created,
    });

    return NextResponse.json({
      url: link.url,
      expiresAt: link.expiresAt.toISOString(),
      stripeAccountId,
      accountCreated: created,
    });
  } catch (error) {
    if (error instanceof StripeNotConfiguredError) {
      // Defensive — `isStripeConfigured()` already gated this above, but if
      // env flips between the check and the call we still want the same UX.
      return apiError({
        status: 503,
        code: 'STRIPE_NOT_CONFIGURED',
        message: 'Payment processing not yet configured for this environment.',
      });
    }
    logger.error({
      event: 'stripe_onboard_error',
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'STRIPE_ONBOARD_FAILED',
      message: 'Could not start Stripe onboarding. Please try again.',
    });
  }
}
