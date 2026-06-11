# STATUS.md — Implementation & Verification Ledger

> **Purpose:** the single source of truth for what is built, wired, verified, and deployed —
> so work is never re-done or re-verified from scratch. Update this file **in the same commit**
> as the work it records. If STATUS.md and your memory disagree, STATUS.md wins.
>
> Companion docs: `CLAUDE.md` (conventions) · `docs/PRODUCTION-PLAN.md` (roadmap) ·
> `docs/DESIGN-BRIEF.md` (design system).

## How to read the ledger

Each feature moves through four gates. A gate is only checked here when it is **actually done**:

| Gate | Meaning |
|---|---|
| **Built** | Code exists on `main` |
| **Wired** | UI ↔ API ↔ DB connected end-to-end (no stub/sample data on the path) |
| **Verified** | Compiled by CI (typecheck+build green) AND flow exercised at least once |
| **Deployed** | Live on the production Vercel deployment |

**Verification policy (do not re-verify what's signed off):**
- CI (GitHub Actions: lint / typecheck / test / build) is the compile-level verifier. A green run on a commit verifies *every* file in that commit — no human re-reading needed for compile errors.
- Flow-level verification is recorded per feature below with the commit hash. Re-verify a flow **only** when a commit touches its files (git blame the row's paths).
- Multi-agent audit findings are logged in the "Audit log" section — a finding marked FIXED with a commit hash is closed; do not re-investigate.

---

## Feature ledger

_Last updated: 2026-05-06 · commits through `522802b`_

### Buyer (retailer) experience

| Feature | Built | Wired | Verified | Deployed | Notes / gaps |
|---|---|---|---|---|---|
| Notification preferences (`/settings/notifications`) | ✅ `e959d2f` | ✅ `522802b` | ⏳ CI pending | ⏳ | Schema migration + GET/PATCH API + matrix UI. |
| Buyer verification (`/settings/verification`) | ✅ `e959d2f` | ✅ `522802b` | ⏳ | ⏳ | Real upload→review→decision loop. **Gap: file bytes are metadata-only until blob storage (Vercel Blob) is wired.** |
| Multi-location ship-tos (`/settings/locations`) | ✅ `e959d2f` | ✅ `522802b` | ⏳ | ⏳ | Full CRUD, soft-delete, default promotion. **Gap: checkout doesn't offer the location selector yet.** |
| Reorder from order detail | ✅ `5f95adf` | ✅ | ⏳ | ⏳ | Button wired to pre-existing `POST /api/orders/[id]/reorder`. |
| Age-restricted checkout gate | ✅ `522802b` | ✅ | ⏳ | ⏳ | `POST /api/orders` returns 403 `VERIFICATION_REQUIRED` unless retailer is VERIFIED. The compliance core. |
| Product detail page (`/marketplace/[id]`) | ❌ | — | — | — | **Top gap — buyers can't open a product.** Claude Design prompt ready (see conversation log / PROMPT-TEMPLATE). |
| Cart/checkout redesign (multi-location + tier-aware) | ❌ | — | — | — | Designs specced, not built. |

### Wholesaler (seller) experience

| Feature | Built | Wired | Verified | Deployed | Notes / gaps |
|---|---|---|---|---|---|
| Catalog CSV import (`/products/import`) | ✅ `e959d2f` | ❌ demo mode | — | ⏳ | Wizard UI complete; **commits are simulated** — needs `/api/products/import` + job runner. |
| Tier pricing editor (`/products/[id]/pricing`) | ✅ `e959d2f` | ✅ `522802b` | ⏳ | ⏳ | Full-replace `PUT /tiers`, ladder validation, Decimal money. Checkout already re-prices on tiers (pre-existing). |
| Wholesaler onboarding wizard | ❌ | — | — | — | Designs specced (5-step). Not built. |
| Approved-buyer management | ❌ schema only | — | — | — | `WholesalerBuyerApproval` table shipped in `522802b`; no UI/routes yet. |

### Warehouse / operations

| Feature | Built | Wired | Verified | Deployed | Notes / gaps |
|---|---|---|---|---|---|
| Mobile barcode scanner (`/inventory/receive/[id]/scan`) | ✅ `e959d2f` | ✅ uses pre-existing `/api/inventory/scan` | ⏳ | ⏳ | **Gap: camera decode is a text-input shim — needs `@zxing/browser`.** Offline queue (localStorage FIFO) shipped. |
| Admin verification queue (`/admin/verification`) | ✅ `e959d2f` | 🟡 partial | — | ⏳ | **UI renders sample data; the real APIs (`GET /api/admin/verification`, decision POST) are live** — swap the hardcoded array next. |

### Auth & platform

| Feature | Built | Wired | Verified | Deployed | Notes / gaps |
|---|---|---|---|---|---|
| Email verification flow | ✅ `522802b` | ✅ | ⏳ | ⏳ | Hashed single-use tokens; register issues token; GET link target + resend. **Gap: mailer logs links (dev) — no SES/Resend transport. Seam: `src/lib/mailer.ts`.** |
| Password reset flow | ✅ `522802b` | ✅ | ⏳ | ⏳ | Enumeration-safe, rate-limited, single-use, clears lockout. **Gap: `signOutEverywhere` accepted but JWT revocation needs sessionVersion claim.** |
| Verify-email / reset-password screens | ✅ `e959d2f` | ✅ `522802b` | ⏳ | ⏳ | Split-canvas AuthShell shared component. |
| Migrations run on deploy | ✅ `522802b` | ✅ | ⏳ first deploy is the test | ⏳ | `vercel-build`: `prisma generate && prisma migrate deploy && next build`. **Before `522802b` no migrations ran on Vercel at all.** |
| Design gallery (`/design-gallery`) | ✅ `e959d2f` | n/a static | — | ⏳ | **Stale: status labels predate the build-out — update SCREENS array.** |

### Schema (all on `main`, additive-only migrations)

| Migration | Contents |
|---|---|
| `20260430120000_add_notification_preferences` | `users.notificationPreferences JSONB` |
| `20260506100000_add_verification_locations_approvals_auth_tokens` | `BuyerDocument`, `RetailerLocation`, `WholesalerBuyerApproval`, `AuthToken`, `retailers.verificationStatus`, `users.emailVerifiedAt` + 5 enums |

---

## Audit log

Multi-agent audits run against specific commits. Findings land here with a verdict; FIXED rows are **closed — do not re-investigate**.

| Date | Audit | Commit audited | Result |
|---|---|---|---|
| 2026-05-06 | 7-dimension demo-readiness audit (prisma fields, API contracts, component props, demo navigation, migration/deploy drift, auth funnel, business logic) + adversarial verification per finding | `522802b` | ⏳ IN FLIGHT — findings will be appended here with FIXED/OPEN status and fixing commit hashes |

Known-open items already identified (pre-audit, by inspection):
- **OPEN:** register → `/verify-email` funnel — page requires a session but registration doesn't sign in; suspected dead-end, audit confirming.
- **OPEN:** admin queue UI on sample data (API live).
- **OPEN:** design-gallery statuses stale.
- **OPEN:** no typecheck has run on `e959d2f`..`522802b` (no Node on the authoring machine) — **CI / first Vercel build is the verifier**; expect possible compile fixes.

## Decision log (so we don't re-litigate)

| Decision | Why | Date |
|---|---|---|
| Email verification tracked on `users.emailVerifiedAt`, NOT `UserStatus` | Login blocks any `status != ACTIVE`; using status would lock out new signups | 2026-05-06 |
| Document uploads are metadata-first | Blob storage not wired; review state machine works end-to-end now, bytes follow | 2026-05-06 |
| Big-bundle pushes direct to `main` | Owner's explicit standing instruction (overrides CLAUDE.md rule 10 for these pushes) | 2026-05-04 |
| Verification lives on Retailer (bill-to), not User | A chain's verification covers all its store accounts | 2026-05-06 |

## Next up (priority order)

1. Fix whatever the in-flight audit confirms (esp. compile errors + auth funnel).
2. Wire admin verification queue UI to its live API.
3. Product detail page + search results (unblocks the core buying loop).
4. Vercel Blob for document bytes; SES/Resend in `src/lib/mailer.ts`.
5. CSV import backend (`/api/products/import` + job).
6. State-legality rules engine (`restrictedStates` enforcement at checkout).
7. Roadmap expansion: **`docs/IDEAS-2026-05.md`** (landed 2026-05-06) — 6-lens ideation synthesis: top-8 build-next list, 3 demo-wow AI picks, gas-station persona shortlist. Promote ideas from there per its "How to promote" section.
