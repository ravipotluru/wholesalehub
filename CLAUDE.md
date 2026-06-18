# CLAUDE.md

> Project context for Claude Code. Read this first in any new session.
> Update it whenever a non-obvious convention, decision, or roadmap item changes.

## What this project is

**WholesaleHub** is a B2B wholesale marketplace for **smoke shops, vape shops, and gas stations** (the "retailers") to source inventory from regulated wholesale distributors (the "wholesalers"). The product space is dominated by **age-restricted SKUs** (vapes, e-liquids, glass, accessories) and a few non-restricted adjacent categories.

**Why it exists.** Today, smoke-shop owners price-shop across 5–15 wholesaler reps over phone/text/email. They lose hours per week and money on every order. WholesaleHub gives them:

1. **One catalog** with every supplier's price for the same SKU, sorted ascending. Cheapest gets a `BEST PRICE` badge.
2. **One cart** that auto-splits into one order per supplier at checkout (because every wholesaler ships separately).
3. **Inventory receiving** with barcode scan, AI-extracted invoice data, discrepancy tracking — so the "open the box, count it, file the claim" loop is faster than paper.

**Who pays.** Wholesalers — listing fee + per-order take-rate. Retailers see the platform free. Pricing/payment terms (Net30, ACH, etc.) are negotiated per relationship, not per platform.

**Compliance reality.** This is a regulated category. PACT Act, state-by-state license requirements, age verification (21+), and state shipping restrictions all apply to age-restricted SKUs. None of this is fully wired yet — see "Roadmap" below — but every change must keep these guardrails in mind.

## Tech stack snapshot

- **Next.js 14** App Router + Server Components, **TypeScript 5.7** strict
- **PostgreSQL 16** + **pgvector** (semantic search on product embeddings)
- **Prisma 5.22** — 35+ models, single source of schema truth
- **Redis 7** (ioredis) — search cache, rate-limit buckets
- **NextAuth.js v5 (beta)** — credentials provider, JWT sessions
- **AWS Bedrock** (Titan embeddings + Claude 3 Sonnet) — falls back to deterministic mocks when AWS creds are absent
- **Zod 3** — every API boundary has a schema
- **Pino** logger — structured JSON, PII-redacted (see `src/lib/logger.ts`)
- **Sentry** (`@sentry/nextjs`) — error tracking; PII-scrubbed in `beforeSend`. No-ops when `SENTRY_DSN` is unset (see `src/lib/sentry.ts`)
- **Jest** — unit + integration; `next/jest` config in `jest.config.js`
- **GitHub Actions** — lint/typecheck/test/build, plus nightly cron + CodeQL + dependency review

## Architecture mental model

```
Browser  →  Next.js (App Router)  →  /app/api/* route handlers
                                  ↘  /lib/* (logic, no HTTP)
                                  ↘  Prisma  →  PostgreSQL
                                  ↘  Redis (cache + rate limit)
                                  ↘  Bedrock (embeddings + LLM)
```

**Layering rule.** Route handlers under `src/app/api/` should be thin — they parse Zod, check auth, call helpers in `src/lib/`, and return JSON. Business logic that's worth testing belongs in `src/lib/`. Today most routes follow this; a few don't (notably `inventory/review/route.ts` — see "Known issues").

**Auth identity.** Sessions are JWTs. The shape of `session.user` is augmented in `src/types/next-auth.d.ts`. Route handlers should call `getAuthedUser()` from `src/lib/session.ts` instead of casting to `Record<string, unknown>`.

**Authorization helpers.**
- Order access → `canAccessOrder(user, order)` in `src/lib/order-access.ts`
- Cart ownership → handled inline by scoping `where: { id, retailerId }` on every cart mutation. Never `delete({ where: { id } })`.

**Idempotency.** State-changing endpoints accept `Idempotency-Key: <UUIDv4>`. Cache lives in `IdempotencyKey` table, scoped by `(POST /api/orders + retailerId)` + body hash. See `src/lib/idempotency.ts`.

**Rate limiting.** Redis fixed-window via `rateLimit({ key, limit, windowSec })` in `src/lib/rate-limit.ts`. Fail-open if Redis is down. Already wired on register, login, and health.

**Logging.** Always `import { logger } from '@/lib/logger'`. Never `console.log/error` in route handlers — pino is structured and PII-redacted. The `email` serializer masks user emails in logs to `a***@domain.com`.

## Domain-model quick map

| Area | Key models | Notes |
|---|---|---|
| **Catalog** | Product, ProductPricing, PriceTier, Category, ProductBarcode, PriceHistory | One Product → many ProductPricings (one per wholesaler). Tier pricing applied at checkout. `visibility` field on ProductPricing gates APPROVED_BUYERS_ONLY listings (filter in search/products routes). |
| **Buyers** | Retailer, User (role=RETAILER), CartItem, Order, OrderLine | Retailer is the "bill-to" entity. `creditLimit` enforced at checkout against open AR. Cart upserts on `(retailerId, productId, wholesalerId)`. |
| **Sellers** | Wholesaler, User (role=WHOLESALER), ProductPricing | License + expiry tracked on Wholesaler. Daily cron in `scripts/cron/license-expiry-check.ts` flips expired wholesalers to `PENDING_APPROVAL` and notifies admins. |
| **Receiving / 3PL** | InventoryReceipt, ReceiptLine, ReceiptScan, Discrepancy, InventoryOnHand, InventoryTransaction | Webhook ingest at `/api/webhooks/inventory` (HMAC-SHA256). Barcode scan path in `/api/inventory/scan` uses atomic `{ increment }` to avoid lost updates. |
| **Compliance / observability** | AuditEvent, DataLineage, EvaluationRun, EvaluationResult, AnomalyRecord, CorrectionRecord, ThresholdConfig | Mostly demo/mock today — most admin routes return synthetic data; conversion to real DB queries is intentional next-PR work. |
| **AI / LLMOps** | PromptTemplate, LLMInvocation, ABTest, ABTestResult, DocumentExtraction | Used by anomaly detection + receiving extraction pipeline. |
| **Misc** | Notification, SearchLog, IdempotencyKey | Notifications wire to real DB (per-user). SearchLog informs feedback loops. |

**Conventions you must preserve.**
- `Prisma.Decimal` for money. Never `Number(...)` arithmetic on a Decimal — use `.add()`, `.mul()`, `.toDecimalPlaces(2)`.
- Cuids for primary keys (`@default(cuid())`), human IDs as a separate unique column (`retailerId`, `wholesalerId`, `productId`, etc.).
- Snake-case for table names via `@@map`, camel-case for fields. Don't break this — there's a manual SQL migration for pgvector that assumes the snake-case names.
- Multi-write API paths must be wrapped in `prisma.$transaction(async (tx) => …)`.

## Inventory receiving — the workflow

This is the part that's actually complex and the most production-shaped part of the codebase.

```
Wholesaler ships → ASN webhook  →  InventoryReceipt (status=AWAITING_ARRIVAL)
                                  + ReceiptLine[] (qtyExpected per SKU)

Truck arrives → Warehouse staff opens app → /inventory/receive/[id]
   Scan barcode → /api/inventory/scan
                  - matches barcode → product, finds matching ReceiptLine
                  - atomic { increment: 1 } on qtyReceived
                  - recomputes lineStatus: PENDING|RECEIVED|SHORT|OVER|DAMAGED
                  - recomputes receipt totals
                  - auto-creates Discrepancy if SHORT/OVER/DAMAGED

When all lines resolved → status flips to FULLY_RECEIVED
   - Discrepancies route to a review queue
   - Admin can resolve: ACCEPT_AS_IS | RETURN | CREDIT_REQUEST | DESTROY | CREATE_BACKORDER
   - Approved discrepancies generate ClaimAmount on the original order
```

**AI extraction** (when ASN is missing or differs from physical receipt):
```
Upload PDF/photo → /api/inventory/extract
                   - Bedrock Claude reads document
                   - structured output into DocumentExtraction
                   - human reviewer validates → /api/inventory/review (PATCH)
                   - on APPROVE: ReceiptLine[] backfilled
```

**Failure modes to be careful about.**
- Concurrent scans on the same line — must use atomic increments (already fixed)
- Webhook replay — idempotency check in webhook route uses `(supplierId, poNumber)` pair
- Partial transactions — every multi-write path now uses `prisma.$transaction`. The exception is `/api/inventory/review/route.ts` which is still partly non-transactional (>600 LOC; needs careful split)

## Tier pricing — how it works at checkout

`ProductPricing` carries the base `wholesalePrice`, optional `promoPrice` window, and **N `PriceTier` rows** with `(minQty, unitPrice)`. At **checkout** (not cart-add), `selectUnitPrice(pricing, tiers, quantity)` picks the cheapest of `{base, matching tier, active promo}`.

This means the cart's stored `unitPrice` is a snapshot only — checkout always re-prices. Buyers always get the best price for their final quantity, even if they bumped quantity after adding.

UI is not yet wired: cart and product detail still show base+promo. Adding a `PRICE BREAKS` badge with the tier table is the next obvious feature.

## Roadmap — where this is going

> **⚠ Implementation/verification state lives in `docs/STATUS.md` — read it before
> assuming anything below is or isn't built.** STATUS.md is the per-feature ledger
> (Built / Wired / Verified / Deployed gates, audit log, decision log) and is updated
> in the same commit as the work it records. This section is the strategic summary only.

**Done (recent — see STATUS.md for gates + commit hashes):**
- ✅ Audit-driven security/correctness pass: IDOR fix, transactions, HMAC timing-safe, rate limits, Prisma indexes, CI hardening, type augmentation
- ✅ Idempotency keys on orders POST · credit-limit enforcement · PII-redacted logging · security headers
- ✅ Tier-pricing schema + selection helper wired into checkout; **tier-pricing editor UI** (`/products/[id]/pricing` + `PUT /tiers`)
- ✅ **All 9 Claude Design P0 screens** scaffolded and merged (notifications, buyer verification, locations, CSV import UI, tier editor, scanner, admin queue, auth screens, design gallery)
- ✅ **Buyer verification flow** — `BuyerDocument` + `Retailer.verificationStatus`, upload→review→decision APIs, **age-restricted checkout gate** (403 `VERIFICATION_REQUIRED`)
- ✅ **Multi-location ship-tos** — `RetailerLocation` CRUD (checkout selector still pending)
- ✅ **Auth tokens** — email verification + password reset (hashed, single-use, rate-limited)
- ✅ **`WholesalerBuyerApproval` table** (schema only — UI/routes pending)
- ✅ Reorder button wired to `POST /api/orders/[id]/reorder`
- ✅ **Migrations now run on Vercel deploys** (`vercel-build` script — they previously never ran)

**Next, ordered by leverage:**
1. **Fix audit findings** — multi-agent demo-readiness audit of `522802b` in flight; findings + fixes land in STATUS.md's audit log.
2. **Product detail page + search results** — buyers can't open a product; blocks the core buying loop.
3. **Admin verification queue UI → live API** (API shipped; UI still renders sample data).
4. **Blob storage for document bytes** (Vercel Blob) + **email transport** (seam: `src/lib/mailer.ts`).
5. **CSV import backend** — `/api/products/import` + job runner behind the finished wizard UI.
6. **State-legality rules engine** — enforce `Product.restrictedStates` at checkout (compliance hole today).
7. **Wholesaler onboarding wizard** + approved-buyer management UI.
8. **EDI 856 ASN parsing** — X12 adapter in front of the webhook.
9. **PACT Act reporting** — `RegulatoryShipmentReport` schema + monthly export.
10. **Lot/serial/expiration on receipt lines**; **inventory `review/route.ts` transaction wrap**.

**Intentionally NOT a priority:**
- Real-time notifications (in-app DB-backed is enough for now; transport via email/SMS later)
- Mobile app (PWA-first; the current web app already responsive)
- Wholesaler-to-wholesaler resale features (out of scope; not where the money is)

## Conventions for any change you make

1. **Always read before you write.** Schema, route, helper — read the current state before edits. Prisma field names drift over time.
2. **Use Prisma types, not `any`.** `Prisma.OrderWhereInput`, `Prisma.ProductWhereInput`, etc. The audit-fixes PR ripped out the `as any` casts; don't reintroduce them.
3. **Money math is `Decimal`.** Period. If you must convert to JS Number, do it at the API boundary only.
4. **Auth in every route.** Even read endpoints — except `/api/health`, `/api/webhooks/*` (HMAC-gated), and the public homepage. Use `getAuthedUser()`.
5. **Validate at the boundary.** Every POST/PATCH body goes through Zod. New routes get a schema in `src/lib/validators.ts` (or a route-local one).
6. **Wrap multi-write paths in `$transaction`.** If a route does ≥2 writes that need to land together, use a transaction. No exceptions.
7. **Log structured.** `logger.info({ event: 'verb_noun', ...context })`. Don't pass error objects directly — `(error as Error).message`.
8. **Never bypass HMAC compare with `===`.** Use `timingSafeEqualHex` from `src/lib/hmac.ts`.
9. **Never commit secrets.** `.env.example` carries placeholders only. The `WEBHOOK_SECRET=whsec_demo_secret_key` literal is rejected in production by the webhook route.
10. **Branch + PR for sweeping changes.** No direct pushes to `main` for >5 file changes. Audit fixes went via PR #1; future big bundles should too.

## How to run things

```bash
# First-time setup
npm install
docker-compose up -d              # Postgres + Redis
cp .env.example .env.local        # fill in NEXTAUTH_SECRET; AWS optional
npx prisma generate
npx prisma migrate dev            # creates DB schema
npx prisma db seed                # demo users + products + orders

# Day-to-day
npm run dev                       # http://localhost:3000
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build

# DB
npm run db:studio                 # visual browser at localhost:5555
npm run db:reset                  # drop + recreate + seed (DEV ONLY)
```

## How to use Claude on this project effectively

### Project skills (live in `.claude/skills/`)

These are project-shared, version-controlled skills that any Claude Code session in this repo can invoke:

- **`/wholesalehub-asn-fixture`** — generate a properly HMAC-signed test ASN webhook for `/api/webhooks/inventory`. Takes args like `--lines 10 --send` or `--invalid quantity`. Saves the "find the secret, compute the HMAC, build the payload" detour every QA round.
- **`/wholesalehub-checks`** — run the full pre-PR check suite locally (install + prisma generate + lint + typecheck + test + build) with one PASS/FAIL summary. Faster than waiting for CI to fail.
- **`/wholesalehub-design-handoff`** — bridge from Claude Design (claude.ai/design) to a Claude Code branch. Paste the handoff bundle, the skill scaffolds the page, components, types, and tests in the right place using the project conventions.

### Project rules (live in `.claude/rules/`)

These are path-specific rules that Claude Code applies automatically when editing files matching the path glob:

- **`api-routes.md`** — `src/app/api/**/route.ts`. Auth, IDOR, validation, transactions, money, idempotency, rate limiting, logging, error envelope, webhooks. Stricter than CLAUDE.md.
- **`schema.md`** — `prisma/schema.prisma` + migrations. Two-step rules for column drops/renames/type changes. Migration-naming standards. Append-only tables.
- **`ui-files.md`** — `src/app/(dashboard|auth)/**`, `src/components/**`. Default: don't touch UI from headless Claude Code. Use Claude Design (claude.ai/design) for any non-trivial UI change, then route through the design-handoff skill.

### Claude Design integration (claude.ai/design)

For any UI change beyond a typo:

1. Open https://claude.ai/design (Claude Pro / Max / Team / Enterprise required)
2. Describe the screen; reference our design system (`tailwind.config.ts` brand colors + components in `src/components/ui/`). If your subscription supports it, connect the GitHub repo so Claude Design auto-extracts the design tokens.
3. Iterate visually with voice / sliders / inline comments
4. Export the handoff bundle
5. Run `/wholesalehub-design-handoff <bundle-path>` — Claude Code scaffolds the page + components + types + tests using our conventions
6. Review the draft PR, then mark ready

P0 UI screens to run through this workflow are listed in `docs/PRODUCTION-PLAN.md` under the "Mobile / PWA" and "Buyer / Seller experience" sections.

### General workflow

- **Start a session in the repo root.** Claude Code reads `CLAUDE.md` and applies the rules in `.claude/rules/` automatically.
- **For audits / refactors**, ask for a static review first, then explicitly approve which to apply. Don't ask for "fix everything" without scope.
- **For features**, scope to one PR-sized chunk. Past PRs: #1 = security audit, #2 = order safety + scaffolding, #3 = health monitor, #4 = Claude watcher, #5 = reorder, #6 = production plan. Keep that cadence.
- **For ops tasks** (rerun audit, test on a branch, ping prod, kick license cron), use the **Ops Dispatch** GH Action — runnable from the GitHub mobile app's "Run workflow" button.
- **Don't push directly to `main`.** Push to a branch, open a PR via REST API, squash-merge after CI is green. Use short-lived PATs and revoke after.

### Useful Claude Code slash commands for this project

- `/init` — already done (created CLAUDE.md)
- `/simplify [focus]` — code review with 3 parallel agents; useful for refactor passes
- `/ultrareview [PR#]` — cloud code review on a specific PR (use before merging large PRs)
- `/security-review` — scan the current diff for vulnerabilities
- `/batch` — auto-creates worktrees for parallel feature work (5-30 worktrees)
- `/loop [interval] [prompt]` — recurring local task (different from the GH Actions watcher)
- `/usage` — token usage and cost breakdown
- `/insights` — analyze your sessions report

### Companion docs

- `docs/PRODUCTION-PLAN.md` — full roadmap with P0/P1/P2 prioritization across 14 domains
- `docs/claude-watcher.md` — scheduled review-agent setup (the GH Actions one)

## Known sharp edges

- **`src/lib/mailer.ts` logs instead of sending** — dev logs include the action link; production logs the attempt only. SES/Resend plugs into this one file.
- **Buyer-document uploads are metadata-only** — review state machine is real; file bytes need Vercel Blob (signed upload) wired into `/api/buyer/documents` + `BuyerVerificationView`.
- `next-auth@5.0.0-beta.25` — pinned to exact version because beta APIs shift. Schedule a migration to stable v5 once it ships.
- `/api/admin/{audit,evaluations,llmops,lineage,feedback,anomalies}` return mock data despite real DB models existing. Conversion is intentional next work, not a bug.
- `inventory/review/route.ts` is large (~600 LOC) and partly non-transactional. Rewrite carefully with full test coverage.
- `cart` page and other dashboard UI haven't been touched in the recent backend audit — there may be follow-on UI inconsistencies (e.g. when MOQ enforcement now hard-rejects from POST cart, the UI still expects soft warnings).
- Sentry error tracking is wired (`@sentry/nextjs` + `src/lib/sentry.ts`) but only emits when `SENTRY_DSN` is set. Without a DSN — and `SENTRY_AUTH_TOKEN` for source-map upload — both the runtime hooks and the `withSentryConfig` wrapper silently no-op. Only `src/app/api/orders/[id]/route.ts` calls `captureApiError` today; the other ~22 routes still need the same wiring.
