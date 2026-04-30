import type Stripe from 'stripe';
import type { StripeAccountStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getStripeClient } from './client';

/**
 * Stripe Connect lifecycle helpers.
 *
 * Stripe Connect (Express) is the right pattern for a marketplace where the
 * platform takes a cut and sellers fulfill independently. Each wholesaler is
 * a Connected Account. The buyer's PaymentIntent uses
 * `transfer_data.destination` + `application_fee_amount` so funds settle to
 * the wholesaler with the platform fee retained — Stripe handles KYC,
 * payouts, 1099s, and dispute routing.
 *
 * This module is the seller-side surface only — PaymentIntent helpers live
 * in `./payments.ts`.
 */

/** Minimal wholesaler shape every helper here needs. Keeps the surface narrow. */
export interface WholesalerForConnect {
  id: string;
  contactEmail: string;
  contactName: string;
  businessName: string;
  state: string | null;
  stripeAccountId: string | null;
  stripeAccountStatus: StripeAccountStatus;
}

/**
 * Map Stripe's account state to our normalised `StripeAccountStatus` enum.
 *
 * Decision matrix (mirrors Stripe's docs):
 *   `details_submitted=false`             → ONBOARDING (or PENDING if untouched)
 *   `requirements.disabled_reason` set    → RESTRICTED (or REJECTED if `rejected.*`)
 *   `charges_enabled && payouts_enabled`  → ACTIVE
 *   anything else                         → RESTRICTED (Stripe is unhappy)
 *
 * Exported so tests can pin down the mapping without hitting the live SDK.
 */
export function mapStripeAccountStatus(
  account: Pick<
    Stripe.Account,
    'charges_enabled' | 'payouts_enabled' | 'details_submitted' | 'requirements'
  >,
): StripeAccountStatus {
  const disabled = account.requirements?.disabled_reason ?? null;

  // "rejected.*" disabled reasons are terminal — the account cannot accept
  // payments. Stripe returns reasons like `rejected.fraud`, `rejected.terms_of_service`.
  if (typeof disabled === 'string' && disabled.startsWith('rejected.')) {
    return 'REJECTED';
  }

  if (account.charges_enabled && account.payouts_enabled) {
    return 'ACTIVE';
  }

  // Any disabled_reason that isn't "rejected" means Stripe is asking for more
  // info — restricted. `requirements.past_due` is the classic one.
  if (disabled) {
    return 'RESTRICTED';
  }

  // No disabled_reason yet — they're either still onboarding or untouched.
  // `details_submitted` flips true the first time the user finishes the
  // hosted onboarding flow.
  return account.details_submitted ? 'RESTRICTED' : 'ONBOARDING';
}

/**
 * Create a Stripe Express Connected Account for a wholesaler.
 *
 * Idempotent: if the wholesaler already has a `stripeAccountId`, returns the
 * existing id without making a new SDK call. This matters because retrying
 * `createConnectedAccount` could otherwise produce orphaned Stripe accounts
 * we never use (and Stripe doesn't have an idempotent `accounts.create` —
 * the idempotency key only protects the request, not the resource).
 *
 * Throws `StripeNotConfiguredError` if `STRIPE_SECRET_KEY` is unset; callers
 * in API routes translate that to a 503.
 */
export async function createConnectedAccount(
  wholesaler: WholesalerForConnect,
): Promise<{ stripeAccountId: string; created: boolean }> {
  // Idempotency: skip the API call if we already have one.
  if (wholesaler.stripeAccountId) {
    logger.info({
      event: 'stripe_connect_account_exists',
      wholesalerId: wholesaler.id,
      stripeAccountId: wholesaler.stripeAccountId,
    });
    return { stripeAccountId: wholesaler.stripeAccountId, created: false };
  }

  const stripe = getStripeClient();

  const account = await stripe.accounts.create({
    type: 'express',
    country: 'US',
    email: wholesaler.contactEmail,
    business_type: 'company',
    business_profile: {
      name: wholesaler.businessName,
      // Pinned to the wholesale-distribution MCC. Stripe requires this for
      // age-restricted goods underwriting; can be tweaked per-merchant later.
      mcc: '5999',
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      wholesalehub_wholesaler_id: wholesaler.id,
    },
  });

  await prisma.wholesaler.update({
    where: { id: wholesaler.id },
    data: {
      stripeAccountId: account.id,
      stripeAccountStatus: 'PENDING',
    },
  });

  logger.info({
    event: 'stripe_connect_account_created',
    wholesalerId: wholesaler.id,
    stripeAccountId: account.id,
  });

  return { stripeAccountId: account.id, created: true };
}

/**
 * Create a Stripe Account Link for hosted onboarding. The returned `url` is
 * single-use, expires in ~5 minutes, and must be opened in the browser — the
 * caller redirects the wholesaler to it.
 *
 * The `account.updated` webhook fires when the wholesaler finishes the flow;
 * `syncAccountStatus` should be called from that handler.
 */
export async function createOnboardingLink(
  wholesalerId: string,
  returnUrl: string,
  refreshUrl: string,
): Promise<{ url: string; expiresAt: Date }> {
  const wholesaler = await prisma.wholesaler.findUnique({
    where: { id: wholesalerId },
    select: { id: true, stripeAccountId: true },
  });

  if (!wholesaler) {
    throw new Error(`Wholesaler ${wholesalerId} not found`);
  }
  if (!wholesaler.stripeAccountId) {
    throw new Error(
      `Wholesaler ${wholesalerId} has no Stripe Connect account; ` +
        'call createConnectedAccount first.',
    );
  }

  const stripe = getStripeClient();
  const link = await stripe.accountLinks.create({
    account: wholesaler.stripeAccountId,
    type: 'account_onboarding',
    return_url: returnUrl,
    refresh_url: refreshUrl,
  });

  // We optimistically flip status to ONBOARDING — the `account.updated`
  // webhook will overwrite once the wholesaler actually finishes.
  await prisma.wholesaler.update({
    where: { id: wholesaler.id },
    data: { stripeAccountStatus: 'ONBOARDING' },
  });

  logger.info({
    event: 'stripe_connect_onboarding_link_created',
    wholesalerId,
    stripeAccountId: wholesaler.stripeAccountId,
  });

  return {
    url: link.url,
    expiresAt: new Date(link.expires_at * 1000),
  };
}

/**
 * Pull the latest account state from Stripe and persist the normalised
 * status. Called by the `account.updated` webhook handler and by ad-hoc
 * "refresh" actions in the dashboard.
 *
 * Returns the new status so callers can short-circuit redirects if the
 * wholesaler is now ACTIVE.
 */
export async function syncAccountStatus(
  wholesalerId: string,
): Promise<StripeAccountStatus> {
  const wholesaler = await prisma.wholesaler.findUnique({
    where: { id: wholesalerId },
    select: {
      id: true,
      stripeAccountId: true,
      stripeAccountStatus: true,
      stripeOnboardedAt: true,
    },
  });

  if (!wholesaler) {
    throw new Error(`Wholesaler ${wholesalerId} not found`);
  }
  if (!wholesaler.stripeAccountId) {
    throw new Error(
      `Wholesaler ${wholesalerId} has no Stripe Connect account; nothing to sync.`,
    );
  }

  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(wholesaler.stripeAccountId);
  const newStatus = mapStripeAccountStatus(account);

  // Set `stripeOnboardedAt` only the first time we see ACTIVE.
  const onboardedAt =
    newStatus === 'ACTIVE' && !wholesaler.stripeOnboardedAt
      ? new Date()
      : wholesaler.stripeOnboardedAt;

  await prisma.wholesaler.update({
    where: { id: wholesaler.id },
    data: {
      stripeAccountStatus: newStatus,
      stripeOnboardedAt: onboardedAt,
    },
  });

  logger.info({
    event: 'stripe_connect_account_synced',
    wholesalerId,
    stripeAccountId: wholesaler.stripeAccountId,
    previousStatus: wholesaler.stripeAccountStatus,
    newStatus,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    disabledReason: account.requirements?.disabled_reason ?? null,
  });

  return newStatus;
}
