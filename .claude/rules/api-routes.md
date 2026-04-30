---
paths:
  - src/app/api/**/route.ts
description: Conventions enforced for every Next.js API route handler.
---

# Rules — API routes (`src/app/api/**/route.ts`)

These rules apply to every change inside a route handler file. Failing
any of these is a real bug, not a style nit.

## Auth

- **Every route imports and uses `getAuthedUser()` from `@/lib/session`** for
  session resolution. Never call `auth()` directly; never cast
  `session.user as Record<string, unknown>`. Exceptions: `/api/health`
  and `/api/webhooks/*` (HMAC-gated, no session).
- For order/cart/receipt access, route through the authorization helper
  in `@/lib/order-access` (`canAccessOrder`) — don't reinvent the role
  check.

## Authorization (IDOR)

- **Never `findUnique({ where: { id } })` followed by returning the
  resource without an ownership check.** Either scope the query
  (`findFirst({ where: { id, retailerId } })`) or fetch then check via
  `canAccessOrder` / equivalent helper.
- `delete({ where: { id } })` is forbidden for any user-owned table. Use
  `deleteMany({ where: { id, retailerId } })` so the scope is enforced
  at the SQL level, not "we hope the caller is authorized."
- On access denial, prefer **404 over 403** for resources the attacker
  shouldn't be able to confirm exist (orders, cart items, receipts).

## Input validation

- **Every POST/PATCH/PUT body parses through a Zod schema** before it
  touches Prisma. Schemas live in `@/lib/validators` (or route-local for
  one-offs).
- Query params parse through Zod too (`z.coerce.number().int().positive()`
  for paginations etc.) — don't trust `parseInt(searchParams.get(...))`
  to hold the line.
- Never trust string enums from the client — use `z.enum([...])`.

## Transactions

- **Multi-write paths must wrap in `prisma.$transaction(async (tx) => …)`.**
  This includes: status updates that also write `auditEvent`, order creation
  with line items + cart clear, scan flow that updates receiptLine + creates
  discrepancy, anything else that does ≥ 2 writes.
- Inside the transaction, all writes go through `tx`, not the global `prisma`.
  Mixing the two defeats the transaction.
- Atomic increments: `{ increment: 1 }` instead of read-then-write
  arithmetic. The inventory scan route is the canonical example.

## Money

- **All currency math uses `Prisma.Decimal`** — never `Number(...)` for
  price/tax/total. Use `.add()`, `.mul()`, `.toDecimalPlaces(2)`.
- Convert to JS Number only at the JSON-encoding boundary (the response
  body), not internally.

## Idempotency

- State-changing endpoints accept `Idempotency-Key: <UUIDv4>` per the
  helper in `@/lib/idempotency`. Pattern: read the key, look up cached
  response, replay if hash matches, conflict if hash mismatches, else
  proceed and persist.

## Rate limiting

- Auth-adjacent endpoints (`register`, `login`, `health`) use the
  Redis-backed limiter in `@/lib/rate-limit`. Per-IP and (where useful)
  per-user keying. Fail-open if Redis is unavailable.

## Logging

- Use the pino logger from `@/lib/logger`, never `console.log/error`.
- Structured: `logger.info({ event: 'verb_noun', ...context })`. Don't
  pass error objects directly — `error: (e as Error).message`.
- The `email` serializer auto-masks emails. Don't log raw passwords,
  tokens, or webhook secrets (the redact config catches most of these
  but new field names slip through).

## Error responses

- Use the structured envelope in `@/lib/api-error` for new routes.
  Stable `code`, human `message`, optional `details`, `requestId`
  surfaced as `X-Request-Id` header.
- Don't expose Prisma error messages or stack traces in 500 responses.

## Webhooks

- HMAC verification uses `timingSafeEqualHex` from `@/lib/hmac`.
  Never `===` for signature compare.
- Refuse to start in production with the demo `WEBHOOK_SECRET` value.
- Validate the post-HMAC payload with Zod before any DB write.
- Webhook DB writes go in a `prisma.$transaction` (receipt + audit row
  must land together).

## What this rule file covers vs. CLAUDE.md

- This file is *the rule book* — narrow, enforced, lint-style.
- `CLAUDE.md` is *the manual* — broader context, the why, the how.
- If the two ever drift, this file wins for API routes.
