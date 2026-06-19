/**
 * Canonical event taxonomy for product analytics.
 *
 * Why a typed registry. PostHog's `capture(...)` API itself takes any string
 * for event name and any object for properties. That's flexible but brittle:
 * if a route calls `capture('cart_item_added', { producutId: ... })` (typo),
 * PostHog accepts it and the funnel report is silently broken. We add a
 * developer-ergonomics layer: every canonical event is registered here with
 * a Zod schema, and the typed `capture()` wrapper validates against it
 * before sending. Validation failures throw in development (so the typo is
 * caught in CI), and log + drop in production (analytics must never block
 * the request flow).
 *
 * Naming convention. `<noun>_<verb_past_tense>` snake_case. Use IDs only —
 * never raw email/phone/free-text-search-with-PII (the search query is
 * borderline; we accept it because retailers search by SKU/brand, not PII,
 * and PostHog's redaction can be tuned downstream if needed).
 */

import { z } from 'zod';

// ─── Property schemas ──────────────────────────────────────────────────

const userRegisteredProps = z
  .object({
    role: z.enum(['RETAILER', 'WHOLESALER', 'ADMIN', 'ANALYST', 'WAREHOUSE_STAFF']),
    retailerId: z.string().optional(),
    wholesalerId: z.string().optional(),
  })
  .strict();

const userLoggedInProps = z
  .object({
    role: z.enum(['RETAILER', 'WHOLESALER', 'ADMIN', 'ANALYST', 'WAREHOUSE_STAFF']),
  })
  .strict();

const productSearchedProps = z
  .object({
    query: z.string(),
    category: z.string().optional(),
    resultCount: z.number().int().nonnegative(),
    mode: z.enum(['keyword', 'semantic', 'hybrid']),
  })
  .strict();

const productViewedProps = z
  .object({
    productId: z.string(),
    category: z.string(),
  })
  .strict();

const cartItemAddedProps = z
  .object({
    productId: z.string(),
    wholesalerId: z.string(),
    quantity: z.number().int().positive(),
  })
  .strict();

const cartItemRemovedProps = z
  .object({
    productId: z.string(),
  })
  .strict();

const checkoutStartedProps = z
  .object({
    itemCount: z.number().int().nonnegative(),
    totalCents: z.number().int().nonnegative(),
  })
  .strict();

const orderPlacedProps = z
  .object({
    orderCount: z.number().int().nonnegative(),
    totalCents: z.number().int().nonnegative(),
    idempotent: z.boolean(),
  })
  .strict();

const orderStatusUpdatedProps = z
  .object({
    orderId: z.string(),
    fromStatus: z.string(),
    toStatus: z.string(),
    role: z.enum(['RETAILER', 'WHOLESALER', 'ADMIN', 'ANALYST', 'WAREHOUSE_STAFF']),
  })
  .strict();

const barcodeScannedProps = z
  .object({
    matched: z.boolean(),
    lineStatus: z
      .enum(['PENDING', 'RECEIVED', 'SHORT', 'OVER', 'DAMAGED', 'NOT_ON_RECEIPT'])
      .optional(),
    receiptId: z.string(),
  })
  .strict();

const discrepancyCreatedProps = z
  .object({
    type: z.enum(['SHORT', 'OVER', 'DAMAGED']),
    receiptId: z.string(),
  })
  .strict();

const webhookReceivedProps = z
  .object({
    source: z.string(),
    supplierId: z.string(),
    lineCount: z.number().int().nonnegative(),
  })
  .strict();

// `apiKey` here is a hashed/truncated identifier of the failing key, not the
// raw secret — the PII filter would drop the property anyway because it
// matches the `apiKey` redact path; the registry intentionally documents
// what the route would attempt to send.
const webhookHmacFailedProps = z
  .object({
    apiKey: z.string(),
    ip: z.string(),
  })
  .strict();

// ─── Registry ──────────────────────────────────────────────────────────

/**
 * Registry of canonical events. Add new events here BEFORE referencing them
 * in routes — the typed `capture()` API will only accept names from this
 * registry.
 */
export const EVENTS = {
  user_registered: { name: 'user_registered', schema: userRegisteredProps },
  user_logged_in: { name: 'user_logged_in', schema: userLoggedInProps },
  product_searched: { name: 'product_searched', schema: productSearchedProps },
  product_viewed: { name: 'product_viewed', schema: productViewedProps },
  cart_item_added: { name: 'cart_item_added', schema: cartItemAddedProps },
  cart_item_removed: { name: 'cart_item_removed', schema: cartItemRemovedProps },
  checkout_started: { name: 'checkout_started', schema: checkoutStartedProps },
  order_placed: { name: 'order_placed', schema: orderPlacedProps },
  order_status_updated: {
    name: 'order_status_updated',
    schema: orderStatusUpdatedProps,
  },
  barcode_scanned: { name: 'barcode_scanned', schema: barcodeScannedProps },
  discrepancy_created: {
    name: 'discrepancy_created',
    schema: discrepancyCreatedProps,
  },
  webhook_received: { name: 'webhook_received', schema: webhookReceivedProps },
  webhook_hmac_failed: {
    name: 'webhook_hmac_failed',
    schema: webhookHmacFailedProps,
  },
} as const;

/** Union of canonical event names. */
export type EventName = keyof typeof EVENTS;

/** Inferred property shape for a given event name. */
export type EventProperties<E extends EventName> = z.infer<(typeof EVENTS)[E]['schema']>;

/**
 * Validate properties against the registered schema. Throws `ZodError` on
 * failure — callers (the analytics wrapper) decide whether to rethrow
 * (dev/test) or log-and-drop (production).
 */
export function validateEventProperties<E extends EventName>(
  event: E,
  properties: unknown,
): EventProperties<E> {
  const entry = EVENTS[event];
  return entry.schema.parse(properties) as EventProperties<E>;
}
