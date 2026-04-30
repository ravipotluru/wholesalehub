# WholesaleHub — Production Readiness Plan

> Comprehensive map of what's built, what's mock, what's missing, and the sequencing to ship a real B2B marketplace. Built from a fresh code review; updated whenever scope shifts.
>
> Companion to `CLAUDE.md` (project conventions). This doc is the **roadmap**; CLAUDE.md is the **manual**.

## TL;DR — current state

| Area | Score | One-line status |
|---|---|---|
| Auth & access control | 7 / 10 | Solid foundation, no MFA, no SSO, no password reset |
| Buyer experience | 6 / 10 | Browse + cart + checkout work; no recommendations, no multi-location |
| Seller experience | 5 / 10 | Onboarding + catalog mgmt work; no bulk ops, no tier UI |
| Catalog & search | 7 / 10 | Hybrid search live; no image upload, no auto-categorization |
| Order lifecycle | 6 / 10 | State machine + audit work; no payments, no real shipping |
| Inventory & receiving | 5 / 10 | Backend strong; **scanner UI is fake** — text input + hardcoded catalog |
| Compliance | 3 / 10 | Schema flags exist; no enforcement at checkout |
| Payments | 1 / 10 | Decimal math correct; no processor wired |
| Communications | 4 / 10 | In-app notifications real; no email/SMS transport |
| Analytics & BI | 5 / 10 | Real data dashboards; no cohorts, exports, alerts |
| AI/ML | 6 / 10 | Embeddings + extraction + anomaly real; admin UIs return mock data |
| Platform ops | 4 / 10 | CI hardened, headers set; no hosting, no error tracking, no WAF |
| Data & GDPR | 3 / 10 | Indexes + audit good; no retention, no export, no deletion |
| Mobile / PWA | 1 / 10 | Responsive UI only; no manifest, no offline, no install |

**Overall: ~5/10 — strong foundations, a long way from launchable to paying customers.**

---

## How to read this doc

Each domain section has:

- **Current state** — what's actually wired vs mocked vs missing
- **Gaps** — concrete items that block production
- **Best-in-class approach** — how mature B2B marketplaces solve this
- **AI opportunities** — places where LLMs/embeddings give real leverage
- **Recommended tools** — specific vendors/libraries
- **Effort** — S (≤1 day), M (1–3 days), L (1 week), XL (multi-week)
- **Priority** — P0 (must ship before launch), P1 (within 90 days), P2 (later)

A consolidated, ordered roadmap is at the bottom.

---

## 1. Identity & access control

**Current state.** NextAuth v5 (beta) JWT sessions, credentials provider, bcrypt password hashing, 5-strike lockout with 15-min cooldown, IP-level rate limit, per-email rate limit, structured audit on auth events. Role-based access via `session.user.role` (5 roles). Type augmentation in `src/types/next-auth.d.ts` and `getAuthedUser()` helper. No `Record<string, unknown>` casts in routes anymore.

**Gaps.**
- No multi-factor auth (TOTP / SMS / WebAuthn)
- No password reset flow
- No email verification on registration
- No session revocation (cannot kick a logged-in user)
- No SSO for enterprise buyers (SAML / OIDC)
- No passkeys
- `next-auth@5.0.0-beta.25` is beta — pinned exact, but the API may shift before stable

**Best-in-class.** Passkeys (WebAuthn) as the primary, password as fallback, optional TOTP, magic-link reset. SSO via SAML for enterprise tier. Session table with revocation.

**AI opportunities.** Behavioral risk scoring on login (unusual time / location / device → step-up auth). Today this can be a simple Redis-backed velocity check; LLM-based reasoning is overkill.

**Recommended tools.**
- Auth: stick with **NextAuth.js** + **@simplewebauthn/server** for passkeys; or migrate to **Clerk** if enterprise SSO becomes urgent (SOC2-ready, more $)
- MFA: **otplib** for TOTP, **Twilio Verify** for SMS
- Sessions: switch from JWT to DB sessions in `Session` table (NextAuth supports this) when revocation matters

| Feature | Effort | Priority |
|---|---|---|
| Email verification on register | S | **P0** |
| Password reset (email-link) | S | **P0** |
| TOTP MFA | M | P1 |
| Passkeys (WebAuthn) | M | P1 |
| Session revocation API | S | P1 |
| SAML SSO | L | P2 |
| Migrate to stable next-auth v5 | S | P2 |

---

## 2. Buyer (retailer) experience

**Current state.** Marketplace page, product detail, hybrid search with filters (category/price/stock/rating/sort), cart grouped by supplier with MOQ warnings, checkout that splits into one order per supplier with idempotency + credit-limit enforcement, order history with status timeline, reorder-from-history endpoint (PR #5), real per-user notifications.

**Gaps.**
- No buyer verification flow — every retailer can order age-restricted goods today
- No multi-location ship-to — chains have one bill-to + many stores
- No saved-list / favorites
- No "you may also like" / "frequently bought together"
- No cadence-based reorder reminders ("you ordered X every 18 days, time for X")
- No quick-order-by-SKU paste
- No dispute / RMA / return flow
- No saved payment methods
- No invoice download (PDF)
- No order documents (packing slip, BOL)

**Best-in-class.** Faire / Joor / Handshake do these well: deep filtering with facets, save-for-later, reorder reminders, prepaid credit, multi-location selector at checkout, real-time chat with seller, order tracking with carrier integration.

**AI opportunities.**
- **Personalized homepage** — order history → embedding → nearest products
- **Smart reorder reminders** — predict next reorder date from cadence, ping when due
- **Smart cart upsell** — "your saved suppliers also have X cheaper"
- **Conversational search** — "show me all sub-$10 disposables in stock at Premium Vape" → structured query
- **Quick-order parsing** — paste a competitor's order list (text/PDF), auto-match SKUs

**Recommended tools.**
- Embedding-based recos: existing **pgvector + Bedrock** (already wired in `src/lib/embeddings.ts`)
- Reorder cadence: simple SQL window functions over `Order.orderDate`
- Multi-location: new `RetailerLocation` model + selector at checkout
- PDF generation: **@react-pdf/renderer** for invoices

| Feature | Effort | Priority |
|---|---|---|
| Buyer verification (BuyerDocument upload + admin review + age gate) | L | **P0** |
| Multi-location ship-to (RetailerLocation model + checkout selector) | M | **P0** |
| Cadence-based reorder reminders | S | P1 |
| Quick-order-by-SKU paste | S | P1 |
| "You may also like" recos | M | P1 |
| Saved-list / favorites | S | P2 |
| Dispute / RMA flow | L | P2 |
| Invoice PDF download | S | P2 |

---

## 3. Seller (wholesaler) experience

**Current state.** Registration, product CRUD (single product at a time), pricing CRUD, incoming-orders page with status updates (with proper ownership check from PR #1), supplier directory.

**Gaps.**
- No CSV bulk catalog import (huge friction for onboarding sellers with 1000+ SKUs)
- No tier-pricing UI — schema is in (PR #2) but sellers can't add tiers via the app
- No promotional pricing UI
- No license upload + verification UI
- No bulk pricing update (e.g. raise all CBD prices 5%)
- No webhook setup UI for ASN integration
- No performance scorecard UI (data exists in `Wholesaler.ratingAvg`, no surface)
- No payout dashboard
- No catalog hygiene tools (find dupes, missing images)

**Best-in-class.** Faire's seller portal: bulk catalog upload, image bulk-upload, AI-suggested categories on upload, retroactive price changes, automated payout schedule, dispute workflow, GMV dashboards.

**AI opportunities.**
- **Auto-categorization on product upload** — name + description → category prediction (Bedrock Claude one-shot)
- **Auto-SEO descriptions** — generate marketing copy from product name + category + brand
- **Image moderation + classification** — flag wrong-looking product photos
- **Catalog deduplication** — embedding similarity to find duplicate listings
- **Price intelligence** — show seller "competitors' avg for similar SKU is $X"
- **Auto-fill from photo** — phone-camera shot of a product box → name, brand, category, UPC

**Recommended tools.**
- Bulk import: **papaparse** for CSV, custom validation pipeline
- Image storage: **Vercel Blob** or **Cloudinary** (latter has built-in moderation + transform)
- Image upload UI: **uploadthing** or **react-dropzone**
- Catalog AI: existing **Bedrock Claude** + structured-output JSON mode

| Feature | Effort | Priority |
|---|---|---|
| Catalog CSV bulk import (POST /api/wholesaler/products/import) | M | **P0** |
| Tier pricing UI | M | **P0** |
| Image upload + storage | M | **P0** |
| License upload + admin review | M | P1 |
| Bulk pricing update | S | P1 |
| AI auto-category on new product | S | P1 |
| AI auto-SEO description | S | P1 |
| Performance scorecard UI | S | P2 |
| Payout dashboard | M | P2 |

---

## 4. Catalog & pricing

**Current state.** 35+ Prisma models, products seeded, hybrid search (`src/lib/search.ts`) combining PostgreSQL FTS + pgvector cosine + Reciprocal Rank Fusion, autocomplete suggestions endpoint, price history table, tier pricing model (PR #2), visibility filter (PR #2).

**Gaps.**
- No category management UI (categories are seeded only)
- No image upload (URL field today)
- No image moderation
- No competitive price intelligence
- No PriceTier seed data — feature is wired into checkout but no demo data shows it working
- Search results page does not show tier pricing badges ("Save when you order 24+")
- No SEO descriptions per product
- No translations

**Best-in-class.** Algolia or Typesense for sub-100ms search at any scale. pgvector works fine to ~1M products; beyond that needs a dedicated vector store. Cloudinary for images with on-the-fly resizing + AI-driven auto-cropping.

**AI opportunities.**
- **Semantic search** — already live (Bedrock Titan embeddings)
- **Auto-categorization** — when a wholesaler creates a product without picking a category, Claude suggests one
- **Description rewrite** — "make this product description more persuasive for retail buyers"
- **Catalog cleanup** — flag duplicates via embedding similarity, suggest merges

| Feature | Effort | Priority |
|---|---|---|
| Image upload + storage + CDN | M | **P0** |
| PriceTier seed data | XS | **P0** |
| Tier badge on product card / detail | S | **P0** |
| Category management UI (admin) | S | P1 |
| AI auto-categorization | S | P1 |
| AI description rewrite | S | P1 |
| Catalog dedup tooling | M | P2 |

---

## 5. Order lifecycle

**Current state.** State machine: PENDING → CONFIRMED → PROCESSING → SHIPPED → PARTIALLY_SHIPPED → DELIVERED → CANCELLED → REJECTED. Status updates write `AuditEvent` rows in the same transaction (PR #1). Idempotency keys on POST (PR #2). Credit limit enforced (PR #2). Tier pricing applied at checkout (PR #2). Per-supplier split.

**Gaps.**
- No payment processor wired — `paymentMethod` is just a label
- No real shipping rate calculation — checkout hardcodes shipping = 0
- No carrier-side label generation
- No tracking-number webhook ingestion (today the wholesaler types it in)
- No automatic delivery confirmation
- No partial shipment ergonomics
- No backorder reservation with expected ship date
- No dispute / refund / RMA flow
- No store credit / refund-to-credit option
- No customer signature on receipt (for compliance)

**Best-in-class.** Shopify B2B / Stripe Connect / Spreedly Marketplace. Payment authorization at checkout, capture on ship. Carrier integrations via Shippo or EasyPost — generate label, get tracking number, get webhooks for events. Real refund flow with reason codes.

**AI opportunities.**
- **Anomaly detection on orders** — already partially built in `src/lib/anomaly/order-anomaly.ts`
- **Fraud risk scoring at checkout** — order velocity, address mismatch, value spike → score → either auto-approve, hold for review, or 3DS
- **Auto-routing of disputes** — chat content → category → assigned support owner

**Recommended tools.**
- Payments: **Stripe Connect** (marketplace pattern) — handles split payments to wholesalers automatically
- Shipping: **Shippo** for label gen + tracking webhooks (or **EasyPost**)
- Tax: **Stripe Tax** (cheapest, integrates) or **Avalara** (most accurate, expensive)
- Fraud: **Stripe Radar** (free with Stripe) or **Sift Science**

| Feature | Effort | Priority |
|---|---|---|
| Stripe Connect integration | XL | **P0** |
| Real shipping rate (Shippo) | L | **P0** |
| Sales tax by jurisdiction (Stripe Tax) | M | **P0** |
| Carrier tracking webhook | M | P1 |
| Dispute / RMA flow | L | P1 |
| Backorder reservation w/ ETA | S | P1 |
| Fraud scoring at checkout | M | P2 |
| Store credit | M | P2 |

---

## 6. Inventory & receiving

**Current state.** ASN webhook (`/api/webhooks/inventory`) — HMAC-verified, Zod-validated, transactional, idempotent. Barcode scan endpoint (`/api/inventory/scan`) — atomic increments fix lost updates, auto-creates `Discrepancy` rows on SHORT/OVER/DAMAGED. AI-powered document extraction pipeline for invoices/POs (`/api/inventory/extract`) using Bedrock Claude with validation loops (`src/lib/ai/validation-loop.ts`). Discrepancy resolution workflow exists in schema.

**The big gap: scanner UI is fake.** `src/components/inventory/ScannerModal.tsx` accepts text input from a USB hardware scanner, looks up barcodes in a hardcoded 8-product dictionary, and never calls the real API. Phone scanning doesn't work at all.

**Other gaps.**
- No PWA manifest — can't install on phone
- No camera-based scanning
- No offline scan queue (schema field `ReceiptScan.syncedFromOffline` exists, no client implementation)
- No lot / serial / expiration on `ReceiptLine` — required for tobacco recalls
- No bin / warehouse-zone tracking
- No cycle-count workflow
- No auto-reorder triggers (`InventoryOnHand.reorderPoint` exists, no logic uses it)

**Best-in-class.** ShipBob / 3PL portals: offline-first PWA, native camera barcode scan via WebRTC + ZXing, lot tracking with FIFO/FEFO picking, automatic reorder when on-hand drops below reorder_point.

**AI opportunities.**
- **Document extraction from photos of paperwork** — already built; needs production load testing
- **Anomaly detection on receipts** — repeated short-shipments from same supplier → flag (`src/lib/anomaly/inventory-anomaly.ts` is built, needs UI)
- **Damage classification from photo** — "is this box visibly damaged" → triage urgency
- **OCR fallback for unreadable barcodes** — phone reads SKU off the label when 1D code is damaged

**Recommended tools.**
- Camera scanning: **@zxing/browser** (gold standard, supports UPC/EAN/Code128/QR) or **html5-qrcode**
- Offline queue: **idb-keyval** for IndexedDB; sync on `online` event
- PWA: **next-pwa** for service worker scaffolding
- Image upload from phone: **HEIC support** via heic-convert; otherwise default browser

| Feature | Effort | Priority |
|---|---|---|
| Real camera-based mobile scanner (replace mock) | M | **P0** |
| PWA manifest + install prompt | S | **P0** |
| Wire scanner to real /api/inventory/scan | S | **P0** |
| Offline scan queue (IndexedDB) | M | P1 |
| Lot / serial / expiration on ReceiptLine | M | **P0** (compliance) |
| Auto-reorder triggers | M | P1 |
| Damage classification from photo (AI) | M | P2 |
| Bin / zone tracking | L | P2 |

---

## 7. Compliance

**Current state.** `Product.ageRestricted` flag, `User.ageVerified` boolean, `Wholesaler.licenseExpiry` field with daily cron that flips expired sellers to `PENDING_APPROVAL` and notifies admins (PR #2). Webhook signature verification with timing-safe equal (PR #1). Audit trail model populated by status changes.

**Gaps — this is the most under-built area.**
- No buyer verification (resale cert / EIN / state tobacco license)
- No age verification at checkout (3rd-party identity check)
- No state-shipping-restriction enforcement (`Product.restrictedStates` exists, no order-time check)
- No PACT Act monthly reporting (every tobacco shipment crossing state lines must be reported to states + ATF)
- No sales tax calculation by state (hardcoded 8.25% in checkout)
- No resale-certificate exemption handling
- No data retention policy (GDPR / CCPA)
- No user data export (GDPR right to portability)
- No user data deletion (GDPR right to erasure)
- AuditEvent table has no immutability — admin can technically UPDATE rows

**Best-in-class.** A PACT-compliant operator: every age-restricted shipment generates a row in a `RegulatoryShipmentReport` table; monthly cron exports per-state CSVs in the format each state requires. Age verification via AgeChecked / Veratad before any age-restricted SKU clears checkout.

**AI opportunities.** Limited — compliance is mostly mechanical. One real use: **auto-extract structured data from license documents** (e.g. read state, license number, expiry from a JPEG of a license).

**Recommended tools.**
- Age verification: **AgeChecked** (industry standard for tobacco/vape) or **Veratad**
- Tax: **Stripe Tax** (already in section 5)
- Document storage with retention policies: **Vercel Blob** or **S3 with lifecycle rules**
- License OCR: existing **Bedrock Claude** vision

| Feature | Effort | Priority |
|---|---|---|
| Buyer verification flow (BuyerDocument + admin review + checkout gate) | L | **P0** (regulatory blocker) |
| Age verification at checkout (3rd party) | M | **P0** (regulatory blocker) |
| State-shipping-restriction enforcement at checkout | S | **P0** (regulatory blocker) |
| Sales tax by jurisdiction (Stripe Tax) | M | **P0** |
| PACT Act monthly reporting | L | **P0** before tobacco shipments |
| GDPR data export endpoint | M | P1 |
| GDPR data deletion + redaction | M | P1 |
| AuditEvent immutability (DB constraint) | S | P1 |
| Resale-certificate exemption | M | P2 |

---

## 8. Payments & money

**Current state.** Currency math in `Prisma.Decimal` (PR #2 fix). `paymentMethod` string field on Order (NET30/CREDIT_CARD/ACH). `Wholesaler.paymentTerms` and `Retailer.creditLimit`. Credit-limit check at checkout (PR #2). No actual payment processor.

**Best-in-class.** Stripe Connect Express accounts for wholesalers; checkout creates a PaymentIntent that splits the charge between the platform fee and the wholesaler's connected account. Payouts handled by Stripe.

**Gaps.**
- No payment processor (huge — every order today is "trust the buyer pays Net30")
- No invoice PDF
- No automated AR aging report
- No payment reminder emails
- No retry on failed Net30 ACH
- No refund flow

**AI opportunities.**
- **Cash-flow forecasting per wholesaler** — "based on your AR pipeline, expect $X in next 30 days"
- **Risk scoring on Net30 extension** — buyer pattern → likelihood of pay-on-time

**Recommended tools.**
- **Stripe Connect** (marketplace pattern, Express accounts)
- **Plaid** for ACH (cheaper than Stripe ACH for high-volume)

| Feature | Effort | Priority |
|---|---|---|
| Stripe Connect integration | XL | **P0** |
| Invoice PDF generation | M | **P0** |
| AR aging report | S | P1 |
| Payment reminder emails | S | P1 |
| Refund flow with audit | M | P1 |
| Cash flow forecasting (AI) | M | P2 |

---

## 9. Communications

**Current state.** `Notification` Prisma model + per-user routes (PR #1). PII redaction in pino logs (PR #2). License expiry watcher creates Notification rows (PR #2).

**Gaps.** Notifications stay in-app only. No email, SMS, or push. No transactional templates. No notification preferences.

**Best-in-class.** Single notification dispatcher in `src/lib/notify.ts` that takes an event + user, looks up preferences, and fans out to channels. Templates managed in Knock or Resend's React Email.

**AI opportunities.**
- **Smart digest emails** — summarize a buyer's week of activity (orders placed, shipments arrived, price drops on saved items)
- **Auto-escalation** — repeated unresolved discrepancies → priority email to admin

**Recommended tools.**
- Email: **Resend** + **react-email** for templates (modern, cheap, great DX)
- SMS: **Twilio**
- Push (PWA): **web-push** library + VAPID
- Multi-channel orchestration: **Knock** (worth it once channels >2)

| Feature | Effort | Priority |
|---|---|---|
| Email transport (Resend + react-email templates) | M | **P0** |
| Notification preferences UI | S | **P0** |
| Order/shipment transactional emails | M | **P0** |
| SMS for price-drop and stock alerts | M | P1 |
| Web push notifications | M | P1 |
| Smart weekly digest (AI) | M | P2 |

---

## 10. Analytics & BI

**Current state.** `/api/analytics` returns real DB-backed dashboards (revenue, category breakdown, supplier scorecard via Recharts on the `(dashboard)/analytics` page). `SearchLog` table tracks every query. `AnomalyRecord` table populated by `src/lib/anomaly/*`.

**Gaps.**
- No cohort analysis (retailer retention by signup month)
- No funnel analytics (search → add-to-cart → checkout conversion)
- No exportable reports (CSV / PDF)
- No scheduled email reports
- No customer lifetime value calculation
- Supplier performance scorecard data exists but only basic dashboard
- No A/B test results UI (`ABTest` model exists, admin UI is mock)

**Best-in-class.** PostHog for product analytics (funnels, cohorts, feature flags). Dedicated BI tool for SQL-based reporting (Metabase, Hex, Looker). Internal dashboards for ops; PostHog for growth.

**AI opportunities.**
- **Natural-language queries over the warehouse** — "what % of new retailers from California reorder within 30 days" → SQL → result
- **Anomaly explanations** — "this week's shortage rate is 3× normal" → RCA over SearchLog + Order data

**Recommended tools.**
- **PostHog** (self-hostable, generous free tier)
- **Metabase** for SQL reporting (free OSS)

| Feature | Effort | Priority |
|---|---|---|
| PostHog integration (events for key actions) | S | **P0** |
| Funnel: search → cart → checkout | S | P1 |
| Customer LTV calculation | S | P1 |
| Scheduled email reports for sellers | M | P1 |
| Wire admin/anomalies UI to real AnomalyRecord data | S | P1 |
| Wire admin/llmops UI to real LLMInvocation data | S | P1 |
| Wire admin/audit UI to real AuditEvent data | S | P1 |
| NL queries over warehouse (AI) | L | P2 |

---

## 11. AI / ML

**Current state.** Bedrock integration via `src/lib/embeddings.ts` (Titan V2) and `src/lib/ai/orchestration.ts` (Claude 3 Sonnet). Hybrid search live in `src/lib/search.ts`. Document extraction with classifier → entity-resolver → validation-loop in `src/lib/ai/`. Anomaly detection in `src/lib/anomaly/`. Evaluation framework in `src/lib/evaluation/` with MRR/Recall/F1. Prompt registry + invocation tracker + A/B testing skeleton in `src/lib/llmops/`.

**Gaps.**
- Most admin UIs (`/admin/llmops`, `/admin/evaluations`, `/admin/audit`, `/admin/lineage`, `/admin/anomalies`) return synthetic in-memory mock data despite real DB tables existing
- No demand forecasting
- No personalization (recommendations)
- No customer support chatbot
- No image-based onboarding
- No translation
- Bedrock falls back to deterministic mocks when AWS creds are absent — fine for demo, but tests don't exercise the real path

**AI opportunity priority list (highest leverage first).**

1. **Wire admin UIs to real data** — quickest win; shows off the LLMOps observability story
2. **Smart reorder suggestions** — biggest UX delta for retailers
3. **Catalog auto-categorization** — biggest seller-onboarding friction reducer
4. **Customer support chatbot** — eats into ops cost as you scale
5. **Demand forecasting** — once you have 6 months of order data
6. **Image-based product onboarding** — upload photo → autopopulate
7. **Translation** — only if international expansion is on the roadmap

**Recommended tools.** Stick with **Bedrock** as primary; **Anthropic API** direct as fallback. **LangChain** is worth importing only for the eval framework — for routine work, plain SDK calls are simpler.

| Feature | Effort | Priority |
|---|---|---|
| Wire 6 admin UIs to real DB data | M | **P0** |
| Catalog auto-categorization | S | P1 |
| Smart reorder suggestions | M | P1 |
| Customer support chatbot | L | P1 |
| Demand forecasting | M | P2 |
| Image-based product onboarding | M | P2 |
| Translation pipeline | L | P2 |

---

## 12. Platform ops

**Current state.** 5 GH Actions workflows (CI nightly+CodeQL, Ops Dispatch, License Expiry Cron, Health Monitor, Claude Watcher). Security headers in `next.config.js`. PII redaction. Pino structured logging. Rate limiting. HMAC for webhooks. Prisma indexes added.

**Gaps — this is everything between "code on GitHub" and "production".**
- No deployment target (no Vercel project / no domain)
- No managed Postgres (Neon / RDS / Supabase) — currently `docker-compose` only
- No managed Redis (Upstash / ElastiCache)
- No CDN / edge caching strategy beyond Next defaults
- No WAF / DDoS protection
- No backup / disaster recovery plan
- No error tracking (Sentry)
- No real observability (logs only go to stdout)
- No on-call rotation / paging
- No status page
- No SLO definition
- No load tests
- No penetration test

**Best-in-class for a Next.js + Postgres B2B app.**
- **Vercel** for hosting (built-in CDN, edge functions, preview environments)
- **Neon** or **Supabase** for managed Postgres with branching + PITR
- **Upstash** for managed Redis (serverless, pay-per-request)
- **Cloudflare** in front for WAF + DDoS + DNS
- **Sentry** for error tracking
- **Better Stack** or **Datadog** for logs + uptime + status page
- **PagerDuty** for on-call

**AI opportunities.** Anomaly detection on operational metrics (latency spikes, error rates) — but Datadog's built-in anomaly detection is fine, no need for custom AI.

| Feature | Effort | Priority |
|---|---|---|
| Vercel deployment (preview + prod) | S | **P0** |
| Managed Postgres (Neon) + migration | S | **P0** |
| Managed Redis (Upstash) | S | **P0** |
| Cloudflare in front (WAF + DNS) | M | **P0** |
| Sentry error tracking | S | **P0** |
| Backup verification + DR runbook | M | **P0** |
| Better Stack logs + status page | M | P1 |
| PagerDuty on-call | S | P1 |
| Penetration test | L | **P0** before public launch |
| Load testing (k6) | M | P1 |

---

## 13. Mobile / PWA

**Current state.** Responsive Tailwind UI. **No PWA support at all** — no manifest, no service worker, no install prompt, no offline anything.

**The big miss: warehouse staff cannot use this on a phone for receiving. The scanner UI is fake (see Inventory section).**

**Best-in-class.** Next.js + `next-pwa` gets you a full PWA with offline support in ~1 day. For native features (camera, vibration, push) the PWA path covers ~95%; **Capacitor** wraps it as native iOS/Android only if you need app-store presence.

**Gaps.**
- No `public/manifest.json` (or `app/manifest.ts`)
- No service worker for offline page caching
- No install prompt
- No offline scan queue
- No background sync
- No web push (would feed price-drop / stock alerts)

| Feature | Effort | Priority |
|---|---|---|
| PWA manifest + icons | S | **P0** |
| Service worker for offline shell | S | **P0** |
| Install-prompt component | S | **P0** |
| Offline scan queue with sync | M | **P0** (warehouse blocker) |
| Web push (price + stock alerts) | M | P1 |
| Capacitor wrapper for iOS/Android | L | P2 |

---

## 14. Data, schema, GDPR

**Current state.** 35+ Prisma models, indexes added (PR #1), pgvector extension via `prisma/migrations/add_vector_extension.sql`. Audit trail + data lineage models exist. IdempotencyKey + PriceTier + PricingVisibility added (PR #2).

**Gaps.**
- No data retention policy (orders / receipts / audit events accrue forever)
- No archive strategy (old orders should move to cold storage after N years)
- No user data export endpoint (GDPR Article 20)
- No user data deletion endpoint with cascade rules (GDPR Article 17)
- No PII encryption beyond DB-level (TLS in transit + AES at rest at the DB layer)
- AuditEvent rows are mutable — should be append-only
- No "right-to-be-forgotten" tombstone strategy

| Feature | Effort | Priority |
|---|---|---|
| GDPR data export endpoint | M | P1 |
| GDPR data deletion + tombstone | M | P1 |
| AuditEvent append-only constraint | S | P1 |
| 7-year archive policy for orders + receipts | M | P2 |
| App-level field encryption for taxId / SSN | M | P2 |

---

## 15. Third-party integrations summary

Tools to add, by section:

| Tool | Purpose | Section | Priority |
|---|---|---|---|
| **Stripe Connect** | Marketplace payments | 5, 8 | **P0** |
| **Stripe Tax** | Sales tax calculation | 5, 7 | **P0** |
| **Resend** + **react-email** | Transactional email | 9 | **P0** |
| **Vercel Blob** or **Cloudinary** | Image storage | 3, 4 | **P0** |
| **AgeChecked** or **Veratad** | Age verification | 7 | **P0** |
| **Shippo** or **EasyPost** | Shipping labels + tracking | 5 | **P0** |
| **Sentry** | Error tracking | 12 | **P0** |
| **Cloudflare** | WAF + CDN + DNS | 12 | **P0** |
| **Neon** or **Supabase** | Managed Postgres | 12 | **P0** |
| **Upstash** | Managed Redis | 12 | **P0** |
| **PostHog** | Product analytics | 10 | **P0** |
| **@zxing/browser** | Camera barcode scanning | 6 | **P0** |
| **Twilio** | SMS notifications | 9 | P1 |
| **Better Stack** | Logs + status page | 12 | P1 |
| **PagerDuty** | On-call paging | 12 | P1 |

---

## Prioritized roadmap

### P0 — must ship before public launch (blockers)

Ordered roughly by leverage × dependency. Items that unblock other items go first.

1. **Vercel + Neon + Upstash + Cloudflare** — get hosted (XL combined, but each is S)
2. **Sentry error tracking** — visibility into prod
3. **PWA manifest + service worker + install prompt** — phone install
4. **Real camera-based mobile scanner + wire to API** — warehouse blocker, replaces the fake scanner
5. **Buyer verification flow** — regulatory blocker for tobacco
6. **Age verification at checkout** — regulatory blocker
7. **State-shipping-restriction enforcement** — regulatory blocker
8. **Stripe Connect** + invoice PDFs — money blocker
9. **Stripe Tax** — money blocker (currently 8.25% hardcoded)
10. **Real shipping rates (Shippo)** — money blocker (currently $0)
11. **PACT Act monthly reporting** — regulatory blocker for tobacco
12. **Catalog CSV bulk import** — seller-onboarding blocker
13. **Image upload + storage** — catalog completeness
14. **Tier pricing UI** — schema is in, sellers need to use it
15. **Email transport (Resend) + transactional templates** — every operational notification
16. **Notification preferences UI** — minimum to comply with anti-spam laws
17. **Lot / serial / expiration on ReceiptLine** — recall compliance
18. **Wire 6 admin UIs to real DB data** — show the LLMOps story
19. **Multi-location ship-to** — table-stakes for chain buyers
20. **Email verification + password reset** — basic auth hygiene
21. **Penetration test** — last gate before launch

### P1 — within 90 days of launch

- TOTP MFA + passkeys
- Cadence-based reorder reminders
- Quick-order-by-SKU paste
- "You may also like" recommendations
- AI auto-categorization on product upload
- AI auto-SEO descriptions
- Bulk pricing update for sellers
- Real shipping carrier tracking webhooks
- Backorder reservation with ETA
- Dispute / RMA flow
- AR aging + payment reminder emails
- SMS notifications for price/stock alerts
- Web push (PWA)
- Funnel + LTV analytics
- Scheduled seller email reports
- Smart reorder suggestions (AI)
- Customer support chatbot (AI)
- AuditEvent append-only constraint
- GDPR export + deletion
- Better Stack + PagerDuty
- Load testing
- Status page

### P2 — later

- SAML SSO
- Saved-list / favorites
- Store credit
- Fraud scoring at checkout
- Capacitor native wrapper
- Cash-flow forecasting (AI)
- Demand forecasting (AI)
- NL queries over warehouse (AI)
- Image-based product onboarding (AI)
- Translation pipeline
- 7-year archive policy
- App-level field encryption

---

## Risks & dependencies

1. **Tobacco regulatory load is the longest tail.** PACT Act + state-by-state licensing + age verification can take 8–12 weeks to wire fully and get legal sign-off. Start that now in parallel with all other P0 work.
2. **Stripe Connect onboarding takes time** for each wholesaler. Plan a phased rollout: pre-launch with 5–10 hand-onboarded sellers; broaden after.
3. **`next-auth@5.0.0-beta.25`** is beta. If a breaking change ships before our launch, plan a migration window.
4. **AWS Bedrock** access requires an AWS account + Claude model access approval. Falls back to deterministic mocks today; before P0 launch, get real Bedrock approved or wire OpenAI as fallback.
5. **Cost ceiling on the Claude Watcher GH Action** — ~$865–$2,600/month at 10-min Sonnet cadence. Either accept the spend, drop to hourly, or kill the schedule and use it on-demand only.

---

## How to use this doc

- **As input to "what's next"** — look at the P0 list, pick the next item that fits your bandwidth, branch + PR.
- **As a status mirror** — when an item ships, edit this file to mark it done in the same PR. Keep the table at the top in sync with reality.
- **As a stakeholder summary** — the TL;DR table is the snapshot to share with investors/board.
- **As a hiring brief** — when you bring on engineers, this is the onboarding doc.

Companion docs:
- `CLAUDE.md` — project conventions and architecture (read first)
- `README.md` — public-facing project overview
- `docs/claude-watcher.md` — scheduled review agent setup
