import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  getStripeClient,
  isStripeConfigured,
  StripeNotConfiguredError,
} from '@/lib/stripe/client';
import { syncAccountStatus } from '@/lib/stripe/connect';
import { mapPaymentIntentStatus } from '@/lib/stripe/payments';

/**
 * POST /api/webhooks/stripe — Stripe webhook receiver.
 *
 * Auth: HMAC via Stripe's `stripe.webhooks.constructEvent` using
 * `STRIPE_WEBHOOK_SECRET`. We do NOT roll our own HMAC compare here —
 * Stripe's verifier handles signature parsing, timestamp tolerance, and
 * timing-safe compare. (Hand-rolled compare is a footgun the project
 * already documents in `.claude/rules/api-routes.md`.)
 *
 * Scaffolding scope: this PR handles a small set of events as no-ops with
 * structured logging + a few cheap DB updates. The follow-up PR fills in
 * real handlers (capture-on-ship, retailer notifications, dispute routing).
 *
 * Events handled today:
 *   - `account.updated`              → re-sync wholesaler's account status
 *   - `payment_intent.succeeded`     → log + update StripePaymentIntent row
 *   - `payment_intent.payment_failed`→ log + update row + (TODO) email retailer
 *   - `charge.refunded`              → log
 *   - everything else                → log `stripe_webhook_unhandled` + 200
 *
 * The webhook URL must be registered in the Stripe dashboard:
 *   https://dashboard.stripe.com/webhooks → Add endpoint → /api/webhooks/stripe
 */
export async function POST(request: NextRequest) {
  // 1. Misconfiguration guard — if Stripe isn't set up, the endpoint should
  //    return 503 so an operator notices rather than silently 200-ing.
  if (!isStripeConfigured()) {
    logger.error({ event: 'stripe_webhook_not_configured' });
    return new NextResponse(null, { status: 503 });
  }
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error({ event: 'stripe_webhook_secret_missing' });
    return new NextResponse(null, { status: 503 });
  }

  // 2. Read raw body — Stripe signature is computed over bytes, not parsed
  //    JSON. `request.text()` preserves whitespace and ordering.
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    logger.warn({ event: 'stripe_webhook_missing_signature' });
    return new NextResponse(null, { status: 400 });
  }

  // 3. Verify signature via Stripe SDK. NEVER replace with a hand-rolled
  //    HMAC compare — Stripe's verifier handles timestamp tolerance and
  //    timing-safe compare in one call.
  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    if (error instanceof StripeNotConfiguredError) {
      return new NextResponse(null, { status: 503 });
    }
    logger.warn({
      event: 'stripe_webhook_signature_invalid',
      error: (error as Error).message,
    });
    return new NextResponse(null, { status: 400 });
  }

  // 4. Dispatch on event.type. Each branch is a small async fn so the
  //    top-level try/catch can return a generic 500 without leaking detail.
  try {
    switch (event.type) {
      case 'account.updated':
        await handleAccountUpdated(event);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event);
        break;
      default:
        logger.info({
          event: 'stripe_webhook_unhandled',
          type: event.type,
          id: event.id,
        });
        break;
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error({
      event: 'stripe_webhook_handler_error',
      type: event.type,
      eventId: event.id,
      error: (error as Error).message,
    });
    // Returning 500 makes Stripe retry — desired behaviour for transient
    // DB failures. Returning 200 would mark the event delivered.
    return new NextResponse(null, { status: 500 });
  }
}

// ─── Handlers ──────────────────────────────────────────────────────────

/**
 * `account.updated` — a connected account's state changed (KYC done, more
 * info requested, charges enabled flipped, etc.). Look up the wholesaler
 * by `stripeAccountId` and resync via the SDK.
 */
async function handleAccountUpdated(event: Stripe.Event): Promise<void> {
  const account = event.data.object as Stripe.Account;
  const wholesaler = await prisma.wholesaler.findUnique({
    where: { stripeAccountId: account.id },
    select: { id: true },
  });

  if (!wholesaler) {
    logger.warn({
      event: 'stripe_webhook_account_updated_unknown_account',
      stripeAccountId: account.id,
      eventId: event.id,
    });
    return;
  }

  await syncAccountStatus(wholesaler.id);
  logger.info({
    event: 'stripe_webhook_account_updated_synced',
    wholesalerId: wholesaler.id,
    stripeAccountId: account.id,
    eventId: event.id,
  });
}

/**
 * `payment_intent.succeeded` — buyer's charge captured. Mark the matching
 * `StripePaymentIntent` row SUCCEEDED. The follow-up PR will also flip the
 * Order to PROCESSING here.
 */
async function handlePaymentIntentSucceeded(event: Stripe.Event): Promise<void> {
  const intent = event.data.object as Stripe.PaymentIntent;
  await prisma.stripePaymentIntent.updateMany({
    where: { stripeIntentId: intent.id },
    data: {
      status: mapPaymentIntentStatus(intent.status),
      capturedAt: new Date(),
      lastError: null,
    },
  });
  logger.info({
    event: 'stripe_webhook_payment_intent_succeeded',
    paymentIntentId: intent.id,
    amount: intent.amount,
    eventId: event.id,
  });
}

/**
 * `payment_intent.payment_failed` — buyer's payment method was declined or
 * 3DS auth failed. Mark the row FAILED, copy the error message, and (in the
 * follow-up PR) email the retailer through the email transport.
 */
async function handlePaymentIntentFailed(event: Stripe.Event): Promise<void> {
  const intent = event.data.object as Stripe.PaymentIntent;
  const errorMessage = intent.last_payment_error?.message ?? null;

  await prisma.stripePaymentIntent.updateMany({
    where: { stripeIntentId: intent.id },
    data: {
      status: 'FAILED',
      lastError: errorMessage,
    },
  });

  // TODO(follow-up): email the retailer. The notification + email transport
  // wiring is one of the gaps called out in PRODUCTION-PLAN.md ("Communications:
  // 4/10"); rather than build the transport here, log + leave the handler
  // ready for the follow-up.
  logger.warn({
    event: 'stripe_webhook_payment_intent_failed',
    paymentIntentId: intent.id,
    error: errorMessage,
    eventId: event.id,
  });
}

/**
 * `charge.refunded` — a refund landed. Logged-only for now; the follow-up
 * PR ties this into the dispute / RMA flow.
 */
async function handleChargeRefunded(event: Stripe.Event): Promise<void> {
  const charge = event.data.object as Stripe.Charge;
  logger.info({
    event: 'stripe_webhook_charge_refunded',
    chargeId: charge.id,
    paymentIntentId:
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id ?? null,
    amountRefunded: charge.amount_refunded,
    eventId: event.id,
  });
}
