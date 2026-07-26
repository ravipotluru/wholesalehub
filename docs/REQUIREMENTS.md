# WholesaleHub — Product Requirements

> The canonical requirements document. Each requirement carries an ID, a priority, and a
> status that mirrors the implementation ledger (`docs/STATUS.md` — which wins on any
> disagreement about *implementation* state; this doc wins on *intent*).
>
> Related: `docs/PRODUCTION-PLAN.md` (14-domain roadmap) · `docs/IDEAS-2026-05.md`
> (researched expansion backlog) · `docs/DESIGN-BRIEF.md` (design system).

## 1. Problem statement

Smoke shops, vape shops, and gas stations source age-restricted inventory (vapes,
e-liquids, glass, tobacco accessories) from 5–15 regulated wholesale distributors via
phone/text/email. Owners lose hours weekly to price-shopping and overpay on most orders
because prices are opaque and per-rep. Receiving is paper-based: boxes are miscounted,
claims windows (48h–7d) expire unfiled, and license compliance (PACT Act, state flavor
registries, 21+ rules) is handled ad hoc under threat of fines up to $1,000/day/SKU.

**WholesaleHub** is the marketplace that fixes this: one comparable catalog, one cart
that splits per supplier, mobile barcode receiving, and compliance built in as a feature
rather than a burden.

## 2. Personas

| Persona | Role in system | Defining constraint |
|---|---|---|
| **Retailer — smoke/vape shop owner** | Buyer | SKU churn from flavor bans; price volatility; per-distributor credit limits |
| **Retailer — gas station / c-store owner** | Buyer | Fuel EFTs in 3 days vs Net-30 inventory; 1–3 staff/shift do receiving; tobacco ≈35% of inside sales; state OTP excise tax |
| **Wholesaler / distributor** | Seller (pays listing + take-rate) | Reps re-key phone orders 4–6 h/day; stale catalogs; allocation of hot SKUs |
| **Warehouse staff** | Receiver | One-handed phone use on a dock, spotty WiFi, interrupted mid-truck |
| **Platform admin (Trust & Safety)** | Operator | 4-hour verification SLA; audit-ready decisions |

## 3. Functional requirements

Status legend: ✅ shipped · 🟡 partial · 📋 planned (researched + specced) · 💭 backlog idea

### 3.1 Identity & access (AUTH)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| AUTH-1 | Credential login with lockout (5 strikes / 15 min), per-IP + per-email rate limits | P0 | ✅ |
| AUTH-2 | Role-based access: ADMIN / RETAILER / WHOLESALER / WAREHOUSE_STAFF / ANALYST enforced in middleware + every route | P0 | ✅ |
| AUTH-3 | Email verification: single-use hashed 24h tokens, issued at registration, resendable, public confirm page | P0 | ✅ |
| AUTH-4 | Password reset: enumeration-safe request, 30-min single-use token, lockout cleared on success | P0 | ✅ |
| AUTH-5 | Session revocation ("sign out everywhere") via JWT sessionVersion claim | P1 | 📋 |
| AUTH-6 | TOTP 2FA + backup codes; security activity timeline (`/settings/security`) | P1 | 📋 designed |
| AUTH-7 | SSO (SAML/OIDC) for enterprise chains | P2 | 💭 |

### 3.2 Catalog & discovery (CAT)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| CAT-1 | One product → many supplier listings; search results sorted by price ascending; cheapest carries BEST PRICE badge | P0 | ✅ |
| CAT-2 | Hybrid search (keyword + pgvector semantic) with category/price/stock/rating filters | P0 | ✅ |
| CAT-3 | Product detail page: supplier comparison, tier ladder, quantity-aware pricing, age-restriction gate | P0 | 🟡 in build (workflow `wf_ff30cf23`) |
| CAT-4 | Bulk CSV import for sellers: parse → map → dry-run preview → transactional commit with per-row errors | P0 | 🟡 in build (same workflow; UI shipped earlier) |
| CAT-5 | Seller price-sheet ingestion from emailed PDF/Excel via extraction pipeline | P1 | 📋 researched (IDEAS #4) |
| CAT-6 | True Landed Cost: per-state OTP/vape excise in price sort — BEST PRICE must rank landed cost, not raw wholesale | P1 | 📋 researched (IDEAS #6) — **known correctness issue in percent-of-wholesale states** |

### 3.3 Pricing (PRICE)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| PRICE-1 | Volume tier ladders per listing; checkout re-prices at final quantity (cheapest of base/tier/promo) | P0 | ✅ |
| PRICE-2 | Seller tier editor with ladder validation (ascending qty, descending price) | P0 | ✅ |
| PRICE-3 | Buyer price-watch: anomaly engine routes price spikes/drops on purchased SKUs to buyer notifications with switch suggestions | P1 | 📋 researched (IDEAS #2) |
| PRICE-4 | Customer-group ladders (VIP/verified/public) | P2 | 💭 designed |

### 3.4 Cart, checkout & orders (ORD)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| ORD-1 | Single cart auto-splitting into one order per supplier at checkout, atomically, idempotency-keyed | P0 | ✅ |
| ORD-2 | MOQ enforcement; credit-limit check vs open AR; Net-30 default terms | P0 | ✅ |
| ORD-3 | **Age-restricted SKUs blocked at checkout unless retailer is VERIFIED** (403 VERIFICATION_REQUIRED) | P0 | ✅ |
| ORD-4 | Reorder: clone any past order to cart, skipping dead lines with reasons | P0 | ✅ |
| ORD-5 | Smart Reorder: rebuild 90-day basket; OOS lines substitute to cheapest in-stock supplier; state-banned SKUs skipped with reason | P0 | ✅ |
| ORD-6 | Multi-location ship-to selection per supplier at checkout | P1 | 🟡 CRUD shipped; checkout selector pending |
| ORD-7 | State-legality engine: `restrictedStates` enforced at checkout per ship-to state | P1 | 🟡 enforced in Smart Reorder; checkout enforcement pending |
| ORD-8 | Payments: ACH via processor, platform take-rate collection, payout schedule | P0 for GA | 📋 **largest gap to real-world money movement** |
| ORD-9 | Order disputes/claims (RMA) with photo evidence, 3-step wizard | P1 | 📋 designed |

### 3.5 Compliance & verification (COMP)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| COMP-1 | Buyer verification: resale cert + EIN + tobacco license upload → T&S review → VERIFIED/REJECTED with reasons + in-app notification | P0 | ✅ (file bytes metadata-only until blob storage) |
| COMP-2 | Admin verification queue: oldest-first SLA ordering, approve/reject in one transaction | P0 | ✅ |
| COMP-3 | Document blob storage (Vercel Blob signed upload) + preview in admin queue | P0 for GA | 📋 |
| COMP-4 | License OCR: auto-extract number/expiry on upload; renewal reminders (buyer-side clone of wholesaler expiry cron) | P1 | 📋 researched (IDEAS #7) |
| COMP-5 | PACT Act monthly report: deterministic export per period/state, zero-report support, filing log | P0 for tobacco GA | 📋 designed |
| COMP-6 | State registry (PMTA/flavor-ban) matcher + change alerts ("MI ban affects 14 of your SKUs") | P1 | 📋 researched (IDEAS #5) |
| COMP-7 | Wholesaler license expiry watcher flips expired sellers to PENDING_APPROVAL | P0 | ✅ (pre-existing cron) |

### 3.6 Receiving & inventory (RCV)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| RCV-1 | ASN webhook ingest (HMAC, idempotent by supplier+PO) creating receipts + expected lines | P0 | ✅ |
| RCV-2 | Mobile barcode scan: atomic increments, line status recompute, auto-discrepancy, receipt totals | P0 | ✅ |
| RCV-3 | Offline scan queue: localStorage FIFO, drains on reconnect, terminal-4xx reported (not silently lost) | P0 | ✅ |
| RCV-4 | Real camera decode via @zxing/browser | P1 | 📋 (text-input shim today; camera Permissions-Policy already opened) |
| RCV-5 | AI invoice extraction → human review → line backfill | P0 | ✅ (pre-existing) |
| RCV-6 | Three-way match (PO vs extraction vs scan) with confidence-gated auto-accept + AI claim packets | P1 | 📋 researched (IDEAS #3) |

### 3.7 Seller operations (SELL)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| SELL-1 | Wholesaler onboarding wizard (profile → licenses → Plaid payouts → logistics → first import) | P0 for seller GA | 📋 designed |
| SELL-2 | Approved-buyer management gating APPROVED_BUYERS_ONLY listings + per-buyer terms | P1 | 🟡 schema shipped; UI/routes pending |
| SELL-3 | Demand-gap radar: cluster SearchLog misses into stocking reports | P1 | 📋 researched (IDEAS #8) |
| SELL-4 | Pick list + ASN generation from incoming orders | P1 | 📋 designed |

### 3.8 Notifications & engagement (NOTIF)

| ID | Requirement | Priority | Status |
|---|---|---|---|
| NOTIF-1 | In-app notifications (DB-backed, per-user) | P0 | ✅ |
| NOTIF-2 | Per-category × per-channel preference matrix with locked system rows | P0 | ✅ |
| NOTIF-3 | Email transport (env-gated provider; log fallback in dev) | P0 for GA | ✅ this commit — Resend REST, zero new deps |
| NOTIF-4 | SMS transport (Twilio) honoring the same preference matrix | P1 | 📋 |

### 3.9 AI features (AI) — all buildable on wired Bedrock + pgvector

| ID | Requirement | Priority | Status |
|---|---|---|---|
| AI-1 | Order Concierge: "build my usual order, swap anything banned or OOS" → reviewable draft cart (layers on ORD-5's deterministic engine) | P1 | 📋 researched — demo-wow #1 |
| AI-2 | Rep Cockpit: paste voicemail/text → resolved, tier-priced order lines with ambiguity flags | P1 | 📋 researched |
| AI-3 | Price-sheet photo → catalog diff with per-field confidence (extends CAT-5) | P1 | 📋 researched |
| AI-4 | Verification pre-screen: Claude-vision reads uploaded licenses before human review | P1 | 📋 researched (with COMP-4) |

## 4. Non-functional requirements

| ID | Requirement | Status |
|---|---|---|
| NFR-1 | Money = `Prisma.Decimal` end-to-end; JS numbers only at JSON boundary | ✅ enforced by rules + audit |
| NFR-2 | Every multi-write path transactional; atomic increments for concurrent scans | ✅ |
| NFR-3 | Auth on every route; IDOR-scoped queries; 404-over-403 for probeable resources | ✅ |
| NFR-4 | Idempotency keys on state-changing money paths | ✅ orders; extend to imports |
| NFR-5 | Structured PII-redacted logging (pino); no tokens/secrets in logs | ✅ |
| NFR-6 | Security headers (CSP, HSTS, frame-ancestors, Permissions-Policy w/ camera=self) | ✅ |
| NFR-7 | Rate limits on auth-adjacent + token endpoints, fail-open on Redis outage | ✅ |
| NFR-8 | WCAG AA, ≥44px touch targets, mobile-first on all operational surfaces | 🟡 designed-in; needs a11y audit pass |
| NFR-9 | Migrations run automatically on deploy | ✅ (`db push` interim; baseline-migration follow-up in STATUS.md decision log) |
| NFR-10 | Error tracking (Sentry), uptime monitoring, WAF | 📋 |

## 5. Environment & configuration

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | Postgres | prod |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | Sessions | prod |
| `REDIS_URL` | Rate limits + cache | prod (fail-open) |
| `NEXT_PUBLIC_APP_URL` | Absolute links in emails | prod |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email transport (NOTIF-3); logs links when absent | GA |
| `AWS_*` (Bedrock) | Embeddings + extraction; deterministic mocks when absent | optional |
| `WEBHOOK_SECRET` | ASN HMAC (demo literal rejected in prod) | prod |
| `BLOB_READ_WRITE_TOKEN` | Document bytes (COMP-3) | GA |

## 6. Explicitly out of scope (v1)

Native mobile apps (PWA-first) · wholesaler-to-wholesaler resale · real-time chat ·
international/tax-jurisdictions beyond US states · EDI X12 (adapter planned, P2).

## 7. Release gates

1. **Demo-ready** — ✅ reached 2026-05-06 (`290251d`): all 9 P0 screens wired, seeded, audited (30 findings fixed), full verification→checkout compliance loop.
2. **Pilot (design partners)** — requires: CAT-3/CAT-4 (in build), NOTIF-3 (this commit), COMP-3 blob storage, green CI on Vercel.
3. **GA** — adds: ORD-8 payments, COMP-5 PACT export, SELL-1 onboarding, NFR-10 observability.
