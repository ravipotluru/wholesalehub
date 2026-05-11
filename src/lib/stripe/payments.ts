import { Prisma, type PaymentIntentStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getStripeClient } from './client';

/**
 * PaymentIntent helpers — buyer-side payment lifecycle.
 *
 * Pattern: each PaymentIntent has `application_fee_amount` (the platform's
 * cut) and `transfer_data.destination` (the wholesaler's connected account).
 * Stripe routes funds end-to-end with the platform fee retained.
 *
 * Money discipline:
 * - All in-memory math is `Prisma.Decimal`.
 * - Conversion to integer cents happens ONLY at the Stripe API boundary
 *   (`amountInCents` below). Stripe expects amounts in the smallest
 *   currency unit (cents for USD).
 */

/** Default basis-point fee when STRIPE_APPLICATION_FEE_BPS is unset. */
const DEFAULT_APPLICATION_FEE_BPS = 200; // 2.00%

/** 10000 bps = 100% — denominator for basis-point math. */
const BPS_DENOMINATOR = new Prisma.Decimal(10000);

/**
 * Read the application fee in basis points from env, with a safe default.
 * Exported for test visibility; route code should call
 * `createPaymentIntentForOrder` rather than reading env directly.
 */
export function getApplicationFeeBps(): number {
  const raw = process.env.STRIPE_APPLICATION_FEE_BPS;
  if (!raw) return DEFAULT_APPLICATION_FEE_BPS;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10000) {
    logger.warn({
      event: 'stripe_application_fee_bps_invalid',
      raw,
      fallback: DEFAULT_APPLICATION_FEE_BPS,
    });
    return DEFAULT_APPLICATION_FEE_BPS;
  }
  return parsed;
}

/**
 * Compute platform fee from total + bps. Pure function; no side effects.
 *
 * Formula: `applicationFee = total * (bps / 10000)`, rounded to 2 decimal
 * places (decimal.js default rounding mode is HALF_UP). Exported for test
 * visibility.
 */
export function computeApplicationFee(
  total: Prisma.Decimal,
  bps: number,
): Prisma.Decimal {
  return total
    .mul(new Prisma.Decimal(bps))
    .div(BPS_DENOMINATOR)
    .toDecimalPlaces(2);
}

/**
 * Convert a `Prisma.Decimal` USD amount to integer cents for the Stripe API.
 * Stripe expects amounts in the smallest currency unit; for USD that's cents.
 * This is the ONE place we cross from Decimal → JS Number.
 */
export function amountInCents(amount: Prisma.Decimal): number {
  // Multiply by 100 in Decimal-space, then convert. `.toFixed(0)` rounds away
  // any sub-cent residue, which shouldn't exist if upstream code respects the
  // 2-dp money invariant — but defensive anyway.
  const cents = amount.mul(100).toFixed(0);
  const n = Number(cents);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Invalid amount for Stripe API: ${amount.toString()}`);
  }
  return n;
}

/** Order shape required by `createPaymentIntentForOrder`. */
export interface OrderForPaymentIntent {
  id: string;
  orderNumber: string;
  totalAmount: Prisma.Decimal;
  retailerId: string;
  wholesalerId: string;
  wholesaler: {
    stripeAccountId: string | null;
  };
}

/**
 * Create a Stripe PaymentIntent for an order and persist a
 * `StripePaymentIntent` row.
 *
 * Returns the `clientSecret` which the buyer's checkout uses with Stripe.js
 * (Elements / Payment Element). Returns `null` for the secret when the
 * intent is in a status that doesn't have one — defensive only; on the happy
 * path Stripe always returns a secret for `requires_payment_method`.
 *
 * Throws if the wholesaler doesn't have an `stripeAccountId` yet — the
 * marketplace MUST refuse to take an order from a non-onboarded wholesaler.
 */
export async function createPaymentIntentForOrder(
  order: OrderForPaymentIntent,
  applicationFeeBps: number = getApplicationFeeBps(),
): Promise<{
  paymentIntentId: string;
  clientSecret: string | null;
  applicationFee: Prisma.Decimal;
}> {
  if (!order.wholesaler.stripeAccountId) {
    throw new Error(
      `Wholesaler ${order.wholesalerId} has no Stripe Connect account; ` +
        'cannot create PaymentIntent.',
    );
  }

  const stripe = getStripeClient();
  const applicationFee = computeApplicationFee(order.totalAmount, applicationFeeBps);

  const intent = await stripe.paymentIntents.create(
    {
      amount: amountInCents(order.totalAmount),
      currency: 'usd',
      application_fee_amount: amountInCents(applicationFee),
      transfer_data: {
        destination: order.wholesaler.stripeAccountId,
      },
      // Use manual capture so the marketplace can hold funds until the
      // wholesaler ships. The follow-up PR moves the auto-capture to a
      // shipment-confirmed webhook. For now we stick to automatic so the
      // scaffold doesn't accidentally orphan PENDING captures.
      capture_method: 'automatic',
      metadata: {
        wholesalehub_order_id: order.id,
        wholesalehub_order_number: order.orderNumber,
        wholesalehub_retailer_id: order.retailerId,
        wholesalehub_wholesaler_id: order.wholesalerId,
        application_fee_bps: String(applicationFeeBps),
      },
      description: `Order ${order.orderNumber}`,
    },
    {
      // Stripe SDK idempotency: retrying this call with the same key returns
      // the original PaymentIntent rather than creating a second one.
      idempotencyKey: `pi_create_${order.id}`,
    },
  );

  await prisma.stripePaymentIntent.create({
    data: {
      orderId: order.id,
      stripeIntentId: intent.id,
      amount: order.totalAmount,
      applicationFee,
      currency: intent.currency,
      status: mapPaymentIntentStatus(intent.status),
      clientSecret: intent.client_secret,
    },
  });

  logger.info({
    event: 'stripe_payment_intent_created',
    orderId: order.id,
    orderNumber: order.orderNumber,
    paymentIntentId: intent.id,
    amountCents: amountInCents(order.totalAmount),
    applicationFeeCents: amountInCents(applicationFee),
    applicationFeeBps,
  });

  return {
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
    applicationFee,
  };
}

/**
 * Map Stripe's status (snake_case wire value) to our enum (SCREAMING_SNAKE).
 * The values are identical aside from case, but typing the conversion keeps
 * the wire format from leaking into the DB if Stripe ever introduces a new
 * status we don't recognise.
 */
export function mapPaymentIntentStatus(
  stripeStatus: string,
): PaymentIntentStatus {
  const normalised = stripeStatus.toUpperCase();
  switch (normalised) {
    case 'REQUIRES_PAYMENT_METHOD':
    case 'REQUIRES_CONFIRMATION':
    case 'REQUIRES_ACTION':
    case 'PROCESSING':
    case 'SUCCEEDED':
    case 'REQUIRES_CAPTURE':
    case 'CANCELED':
      return normalised;
    default:
      // Stripe doesn't currently emit "FAILED" on PaymentIntent.status — it
      // surfaces failures via `payment_intent.payment_failed` event +
      // `last_payment_error`. We use FAILED in our DB when we observe that
      // event. Unknown statuses fall through to FAILED so the row is visible
      // for review rather than silently dropped.
      logger.warn({
        event: 'stripe_payment_intent_status_unknown',
        stripeStatus,
      });
      return 'FAILED';
  }
}

/**
 * Capture a previously-authorized PaymentIntent. Placeholder for the
 * "auth at checkout, capture on ship" flow — the real wire-up happens in
 * the follow-up PR that turns scaffolding into the production checkout path.
 */
export async function confirmCapture(paymentIntentId: string): Promise<void> {
  // Surface the not-yet-implemented signal at the call site rather than at
  // import time so this module stays cheap to load in environments where
  // capture isn't exercised.
  logger.warn({
    event: 'stripe_confirm_capture_not_implemented',
    paymentIntentId,
  });
  throw new Error(
    'confirmCapture is not yet implemented — wired in the follow-up PR.',
  );
}

/**
 * Refund a PaymentIntent. Placeholder; the real refund flow lands in the
 * follow-up PR alongside the dispute / RMA work.
 */
export async function refundPaymentIntent(
  paymentIntentId: string,
  reason: string,
): Promise<void> {
  logger.warn({
    event: 'stripe_refund_payment_intent_not_implemented',
    paymentIntentId,
    reason,
  });
  throw new Error(
    'refundPaymentIntent is not yet implemented — wired in the follow-up PR.',
  );
}
