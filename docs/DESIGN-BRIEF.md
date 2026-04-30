# WholesaleHub — Master Design Brief

> Comprehensive design context for Claude Design (claude.ai/design), Figma, or any designer working on this product. This is the **standing context** every design session should have. Per-screen prompts live in `docs/CLAUDE-DESIGN-PROMPT-TEMPLATE.md`.

## What we're designing

WholesaleHub is a **B2B wholesale marketplace** for smoke shops and gas stations to source inventory from regulated wholesale distributors. Five user roles use the platform:

| Role | What they do | Primary surfaces |
|---|---|---|
| **Retailer (buyer)** | Browse catalog, compare prices, place orders, track shipments | Marketplace, cart, checkout, orders, notifications |
| **Wholesaler (seller)** | List products, set pricing, fulfill orders, manage payouts | Catalog, pricing, incoming orders, payouts |
| **Warehouse staff** | Receive shipments, scan barcodes, log discrepancies | Receive, scanner, discrepancies — mobile-first |
| **Analyst** | Read-only dashboards | Analytics, reports |
| **Admin** | Compliance, audit, LLMOps, anomalies | Admin section |

The product is **operationally critical** for retailers — they run their store off this. A bad design wastes their time every single day. A good design saves them hours per week.

## Design philosophy

> **"Stripe Dashboard density meets Faire warmth meets Linear polish."**

Specifically:

- **Stripe Dashboard density** — tables and forms must hold a lot of information without feeling cluttered. Generous line-height, narrow borders, mute secondary text.
- **Faire warmth** — this is not Salesforce. Subtle warmth in copy, friendly empty states, illustrations where they help.
- **Linear polish** — every animation deliberate (150ms ease-out), every shadow restrained, every corner radius consistent.
- **NOT crypto-bro / consumer-flashy** — no gradients, no neon, no large rounded buttons. This is a tool for serious operators.
- **NOT corporate-sterile** — small flourishes (a colored badge, a friendly empty state, a subtle illustration) keep it human.

The benchmark feel: **Linear, Vercel Dashboard, Stripe Dashboard, Faire Seller Hub, Shopify B2B**. Not: HubSpot, SAP Concur, NetSuite, Coupa.

## Brand identity

- **Name**: WholesaleHub
- **Logo**: clean wordmark (existing logo TBD — can be regenerated in Claude Design)
- **Voice**: direct, confident, plainspoken. "Lowest price from 12 suppliers" not "Discover unbeatable prices from our extensive network."
- **Tone**: respects the user's time. No marketing fluff inside the app.

## Color system (Tailwind tokens — see `tailwind.config.ts`)

### Brand

| Token | Hex | Use |
|---|---|---|
| `brand-blue` | `#1E4D8C` | Primary brand. Header, primary buttons, active nav, links |
| `brand-blue-light` | `#2563A8` | Hover state on primary, subtle highlight backgrounds |
| `brand-blue-dark` | `#163A6B` | Pressed state, text on light-blue backgrounds |
| `brand-orange` | `#FF6A00` | Accent / CTA — use sparingly, only for "Add to cart", "Place order", "Confirm checkout" |
| `brand-orange-light` | `#FF8533` | Hover on orange CTAs |
| `brand-orange-dark` | `#CC5500` | Pressed orange |
| `brand-teal` | `#20A39E` | Secondary accent. Icons, supplier links, tertiary actions |
| `brand-teal-light` | `#28C4BE` | Hover |
| `brand-teal-dark` | `#187A76` | Pressed |

### Status

| Token | Hex | Use |
|---|---|---|
| `success` | `#00B894` | "BEST PRICE" badge, success toasts, healthy indicators, paid status |
| `status-warning` | `#F39C12` | Low stock, MOQ not met, license expiring soon, pending action |
| `status-error` | `#E74C3C` | Out of stock, validation errors, failed states |
| `status-info` | `#3498DB` | Informational badges, "in transit", BACKORDER |

### Neutrals

| Token | Hex | Use |
|---|---|---|
| `dark` | `#2D3436` | Primary body text, headings |
| `light` | `#F5F6FA` | Page background, card backgrounds in some layouts |
| `surface` | `#FFFFFF` | Card surfaces, modals, table rows |
| (Tailwind default) `gray-50..900` | | Borders, secondary text, dividers |

### Color rules

- Body text: `text-dark` (`#2D3436`) at 100% on white. For secondary text use `text-gray-500`. Never pure black, never pure white text on colored backgrounds — adjust contrast via Tailwind tints.
- Buttons:
  - **Primary action**: `bg-brand-blue text-white hover:bg-brand-blue-light`
  - **Critical CTA only** (1 per screen, e.g. "Place order"): `bg-brand-orange hover:bg-brand-orange-light text-white`
  - **Secondary**: `border border-gray-300 text-dark hover:bg-gray-50`
  - **Destructive**: `bg-status-error hover:bg-status-error/90 text-white`
- Links: `text-brand-teal hover:text-brand-teal-dark underline-offset-2 hover:underline`
- Status badges: tinted background + matched text (`bg-success/10 text-success`, etc.)

## Typography

- **Sans serif**: **Inter**, system fallback
- **Mono**: **JetBrains Mono** for SKUs, order numbers, tracking numbers, code/IDs

| Style | Tailwind | Use |
|---|---|---|
| Display | `text-4xl font-bold tracking-tight` | Page title (rare) |
| H1 | `text-3xl font-bold` | Page title |
| H2 | `text-2xl font-semibold` | Section heading |
| H3 | `text-xl font-semibold` | Card/group heading |
| H4 | `text-lg font-medium` | Subsection |
| Body | `text-base` | Default body text |
| Body-sm | `text-sm` | Secondary text, helper text |
| Caption | `text-xs uppercase tracking-wider text-gray-500 font-medium` | Labels above values |
| Mono-sm | `text-sm font-mono` | SKUs, IDs |

Line-height: trust Tailwind defaults (1.5 for body). Don't override unless there's a reason.

## Spacing & layout

- **Spacing scale**: Tailwind default (4px increments). Use `space-y-4` between form fields, `space-y-6` between sections, `space-y-8` between major page chunks.
- **Container max-width**: `max-w-7xl` (1280px) for marketplace + dashboards. Forms cap at `max-w-2xl` (672px).
- **Page padding**: `px-4 sm:px-6 lg:px-8 py-8`
- **Card padding**: `p-6` standard, `p-4` for compact tables
- **Border radius**: `rounded-lg` (8px) on cards, `rounded-md` (6px) on buttons/inputs, `rounded-full` on status pills, `rounded-xl` (12px) on hero modals
- **Border**: `border-gray-200` for dividers, `border-gray-300` for input borders
- **Shadows**:
  - `shadow-sm` for cards at rest
  - `shadow-md` for elevated cards (hover)
  - `shadow-lg` for modals, dropdowns
  - No `shadow-xl` or `shadow-2xl` — too heavy

## Layout patterns

### Authenticated dashboard

```
┌──────────────────────────────────────────────────────┐
│  Top bar (h-16)                                       │
│  Logo │ Search │ ...spacer... │ Notifications │ User │
├──────────┬───────────────────────────────────────────┤
│          │                                           │
│ Sidebar  │  Page header: Title + breadcrumb + CTA   │
│ (w-60)   │                                           │
│          │  Content (max-w-7xl mx-auto)              │
│ Nav      │                                           │
│ items    │  Cards / tables / forms                   │
│          │                                           │
│          │                                           │
└──────────┴───────────────────────────────────────────┘
```

- Sidebar collapses on `<lg` breakpoint to a slide-over drawer
- Mobile: top bar with hamburger, no sidebar by default

### Mobile (warehouse staff)

- Bottom-tab nav (Receive, Scan, Discrepancies, Account) — large touch targets (≥44px)
- Header reduces to logo + notification bell
- Pages full-width, generous vertical padding

### Auth screens

- Centered card on a tinted background (`bg-light`)
- Card max-w-md, single column, brand mark at top, form, submit, secondary link

## Component library (existing — reuse, don't recreate)

Located in `src/components/ui/` — extend variants, but don't reroll the primitives:

| Component | Variants | Purpose |
|---|---|---|
| `Button` | primary / secondary / ghost / destructive / link, sizes sm/md/lg | All clickable actions |
| `Input` | text / email / number / password / search | Single-line input |
| `Select` | native + searchable | Dropdown selection |
| `Card` | default / hoverable / clickable | Container |
| `Modal` | sm / md / lg / xl | Overlays |
| `Tabs` | underline / pill | Tabbed sections |
| `Badge` | success / warning / error / info / neutral | Status pills |
| `KpiCard` | with trend indicator | Dashboard metrics |
| `DataTable` | with sort / filter / pagination / bulk select | All tabular data |
| `Skeleton` | various shapes | Loading states |
| `EmptyState` | with icon + CTA | "No results" |
| `ErrorBanner` | dismissible / persistent | Errors above forms |
| `LoadingPage` | spinner + label | Full-page load |
| `ConfirmDialog` | normal / destructive | Confirm dangerous actions |
| `Breadcrumb` | with ellipsis on overflow | Page hierarchy |

Marketplace components (in `src/components/marketplace/`):
- `ProductCard` (grid view), `ProductDetailModal`, `SearchBar`, `FilterPanel`, `SortDropdown`, `CategorySidebar`, `PriceHistoryChart`

Cart components (in `src/components/cart/`):
- `CartItemRow`, `SupplierGroup`, `CartSummary`, `MoqWarning`

Inventory components (in `src/components/inventory/`):
- `ScannerModal` (currently a fake — replace), `ReceiptLineTable`, `DiscrepancyCard`, `ReceivingProgress`

Layout (in `src/components/layout/`):
- `Header`, `Sidebar`, `NotificationDropdown`

## Design tokens for animations

| Pattern | Spec |
|---|---|
| Hover transition | `transition-colors duration-150 ease-out` |
| Modal in/out | `transition-opacity duration-200` + slight scale |
| Toast in/out | slide from top-right, 250ms |
| Page transition | none — instant routing |
| Skeleton shimmer | 1.5s linear infinite |
| Chevron rotate (accordion) | `transition-transform duration-200` |

No bouncy easing. No long delays. Speed is part of the brand.

## Required screen states (apply to every screen)

For each page, design **all five states** before considering the screen done:

1. **Loading** — skeleton placeholders for the structure, shimmer animation
2. **Empty** — illustration + headline + description + CTA when there's no data
3. **Error** — `ErrorBanner` at top with action to retry, partial data still shown if possible
4. **Populated (default)** — the normal happy path
5. **Edge case** — long text truncation, lots of items, tiny screen

For forms specifically, also design:

6. **Validation error** (per-field + aggregate)
7. **Saving** (button shows spinner, form locks)
8. **Saved / success** (toast + return to view mode)

## Accessibility (non-negotiable)

- WCAG **AA** contrast ratios on all text. Verify with browser tools.
- Every interactive element keyboard-reachable. Visible `:focus` ring (Tailwind: `focus:ring-2 focus:ring-brand-blue focus:ring-offset-2`).
- Form labels always present (no placeholder-only labels).
- ARIA labels on icon-only buttons.
- Color-blind safe: never use color alone to convey state (always pair with icon or text).
- Touch targets ≥ 44×44px on mobile.
- Reduced-motion respect: `prefers-reduced-motion` disables shimmer + slide animations.

## Responsive breakpoints (Tailwind defaults)

| Breakpoint | Width | Primary device |
|---|---|---|
| `sm` | 640px | Phone landscape |
| `md` | 768px | Tablet portrait |
| `lg` | 1024px | Tablet landscape, small laptop |
| `xl` | 1280px | Desktop |
| `2xl` | 1536px | Large desktop |

Mobile-first. Marketplace + cart + checkout MUST be excellent on phones (retailers shop on phones). Admin screens are desktop-first (analysts work at desks).

## Screen inventory — comprehensive

### Public (unauthenticated)

| Screen | Route | Notes |
|---|---|---|
| Landing / marketing | `/` | Currently minimal; not a launch priority |
| Login | `/login` | Email + password, "forgot?" link, "register" link |
| Register (split: retailer / wholesaler) | `/register` | Role-picker first, then role-specific form. Long form — consider stepper |
| Email verification | `/verify` (new) | One-time link, "Resend" button |
| Password reset request | `/reset` (new) | Email entry, success message |
| Password reset confirm | `/reset/[token]` (new) | New password + confirm |

### Retailer (buyer) — primary

| Screen | Route | Notes |
|---|---|---|
| Marketplace home | `/marketplace` | Search hero, category tiles, recently viewed, recommended |
| Product detail | `/marketplace/[productId]` (modal or page) | Image, description, supplier price comparison table, **price tier badges** ("Save when you order 24+"), MOQ, related products |
| Cart | `/cart` | Grouped per-supplier, MOQ warnings, subtotal per supplier, total at bottom, checkout CTA. Shows tier savings inline. |
| Checkout | `/checkout` | Shipping address + **multi-location selector**, payment method, order notes, agree-to-terms, place-order button |
| Order history | `/orders` | Table with filters (status, date, supplier), each row = order, click → detail |
| Order detail | `/orders/[id]` | Status timeline, line items, totals, tracking link, reorder button, support contact |
| Reorder confirm | (modal) | Lists items being added back, flags any unavailable, confirm/cancel |
| Notifications inbox | `/notifications` | Grouped by type, unread badge, mark all read, click → contextual deep link |
| **Notification preferences** ⭐ (calibration screen) | `/settings/notifications` | Matrix of category × channel toggles |
| Saved lists / favorites | `/saved` (new) | Saved products, quick-reorder |
| Profile / account | `/settings/account` | Name, email, phone, password change, MFA |
| Buyer verification | `/settings/verification` (new) | Upload resale cert + EIN + tobacco license, status, rejection reason |
| Multi-location ship-tos | `/settings/locations` (new) | List, add, edit, delete; default-flag |

### Wholesaler (seller) — primary

| Screen | Route | Notes |
|---|---|---|
| Seller home / dashboard | `/dashboard` (per role) | Sales today, open orders, low-stock alerts, license expiry warning |
| Catalog | `/products` | Table, search/filter, bulk-actions, click → edit. **CSV import button.** |
| Product editor | `/products/[id]/edit` | Form: details, images, **tier pricing editor**, visibility toggle (PUBLIC / APPROVED_BUYERS_ONLY) |
| New product | `/products/new` | Same form, blank |
| **Catalog CSV import wizard** ⭐ | `/products/import` (new) | 1) drop CSV, 2) preview with errors, 3) commit, 4) result report |
| Pricing dashboard | `/pricing` | Cross-product price table, bulk-update workflow |
| Incoming orders | `/incoming-orders` | Table, statuses, click → detail |
| Order fulfillment | `/incoming-orders/[id]` | Confirm, mark shipped (tracking input), generate label, mark delivered |
| Suppliers / verification status | `/settings/license` | License upload, expiry, renewal reminder |
| Seller payouts | `/payouts` (new) | List of payouts, frequency, bank account |
| Seller analytics | `/analytics` (per role) | GMV, top products, repeat buyers, scorecard |
| Webhook setup | `/settings/integrations` (new) | Webhook URL, secret rotation, test-fire button |

### Warehouse (mobile-first)

| Screen | Route | Notes |
|---|---|---|
| Receive list | `/inventory` | Cards: each open receipt with progress bar |
| New receipt | `/inventory/receive/new` | PO number entry, supplier selector |
| **Camera-based scanner** ⭐ | `/inventory/receive/[id]` | Live camera viewfinder, scan history, last-scan-result, running total. Falls back to text input. |
| Receipt review | `/inventory/receive/[id]/review` | Line list, mark complete, flag discrepancies |
| Discrepancy detail | `/inventory/discrepancies/[id]` | Photo, type, qty variance, resolution dropdown |
| Discrepancy queue | `/inventory/review` | List of unresolved discrepancies |

### Admin (desktop-first, dense)

| Screen | Route | Notes |
|---|---|---|
| Audit trail | `/admin/audit` | Searchable table of every audit event, filter by entity/actor/action/time |
| Data lineage explorer | `/admin/lineage` | Search by entity → tree visualization of source → transforms → result |
| Anomaly dashboard | `/admin/anomalies` | Cards by type (pricing / order / inventory), severity heatmap, click → detail |
| LLMOps | `/admin/llmops` | Cost dashboard, prompt registry, A/B test results, latency histograms |
| Evaluations | `/admin/evaluations` | Run history, MRR / Recall / F1 charts, regression alerts |
| Feedback / corrections | `/admin/feedback` | List of human corrections, threshold tuning |
| User management | `/admin/users` (new) | Invite, role assignment, suspension |
| Buyer verification queue | `/admin/verification` (new) | Pending docs, approve/reject with reason |
| Compliance reporting | `/admin/compliance` (new) | PACT Act monthly export, state-restriction violations log |

### Settings (cross-role)

| Screen | Route | Notes |
|---|---|---|
| Account | `/settings/account` | Name, email, password, MFA |
| Security | `/settings/security` | Sessions, devices, MFA setup |
| Notification preferences | `/settings/notifications` | (calibration screen) |
| Team (org) | `/settings/team` (new) | Invite teammates, role management |
| Billing | `/settings/billing` (new) | Plan, payment method, invoices |
| Integrations | `/settings/integrations` (new) | Stripe, Twilio, Sentry, etc. |

## Data visualization standards

- **Library**: Recharts (already installed)
- **Colors**: brand palette only — `brand-blue` for primary series, `brand-teal` secondary, `brand-orange` highlight only when calling out one bar/point
- **Styles**: thin lines (`strokeWidth={2}`), generous padding, no 3D, no perspective
- **Tooltips**: white card with `shadow-md`, mono font for numbers
- **Empty chart**: replace with `EmptyState` component, not a "0" axis
- **Responsive**: charts use `ResponsiveContainer`, min-height 240px, max-height 480px

## Mobile-specific patterns

- **Bottom tab nav** for warehouse role (4–5 tabs, icons + labels)
- **Pull-to-refresh** on list pages (uses native gesture)
- **Sticky bottom bar** on long forms (save / cancel always visible)
- **Camera permissions** UX: request inline (not modal), explain why, show retry if denied
- **Offline banner** at top of every page when offline
- **Haptic feedback** on barcode scan (use `navigator.vibrate(50)`)

## What "lavish" means here

A B2B operator can smell when a product is built carefully. Lavish ≠ flashy. Lavish in this context means:

- **Generous whitespace** — never cram info to fill a page; if a page is sparse, that's fine
- **Refined typography** — Inter at the right weight for each context, never bold-bold-bold
- **Restrained color** — brand-blue + brand-orange + brand-teal carefully placed; not all three on one screen
- **Thoughtful empty states** — illustration + helpful copy + clear next step, not just "No data"
- **Loading states that match the destination** — skeleton in the same shape as the final content, not a spinner
- **Microcopy that respects the user** — "Last updated 3 minutes ago" not "Synchronization completed at 14:23:08 UTC"
- **Animations only where they help** — confirm a button press, fade in a toast, slide in a drawer; never animate for animation's sake
- **Brand mark used quietly** — small, in the header, not splashed across half the screen
- **Detail pages that read like a story** — chronological status timeline, related context surfaced, no dead-end empty fields

The benchmark for "rich and lavish" is **Linear's task detail view** — a perfect interaction of typography, spacing, motion, color, and information density.

## Things to NEVER do

- Gradients (anywhere)
- Drop shadows on text
- Background images on cards
- Multi-color icons (single-color line icons only — Lucide React)
- Pure black on pure white text (use `text-dark` on `bg-white`)
- More than one orange CTA per screen
- Animations longer than 300ms
- "Loading…" text — always show a skeleton or spinner instead
- "An error occurred" — always show what failed and how to recover
- Modal-on-modal stacking
- Disabled buttons without tooltip explaining why
- Dropdowns that scroll the page rather than open in place

## Things to ALWAYS do

- Show a count when listing things ("12 orders" not just a list)
- Show "Last updated: X" on data that can be stale
- Show currency symbol next to every price
- Show timezone next to every absolute time
- Show units next to every quantity ("12 units" not "12")
- Confirm destructive actions
- Persist filters in the URL so the page is shareable
- Auto-save form drafts to localStorage
- Render the page server-side first (Next.js App Router default), hydrate after

## How to use this brief in Claude Design

1. **Open https://claude.ai/design**
2. **In the first message of every new design session, paste the link to this file** (or the relevant section). Claude Design supports codebase reference; if it can read this file directly, use that.
3. **Reference the GitHub repo** so Claude Design auto-extracts tokens from `tailwind.config.ts`.
4. **Use the per-screen prompt template** in `docs/CLAUDE-DESIGN-PROMPT-TEMPLATE.md` for each screen.
5. **One screen per session** — don't try to design the whole app in one go.
6. **Iterate visually**, then **export the handoff bundle** and run `/wholesalehub-design-handoff` in Claude Code to scaffold the actual implementation.

## How to update this brief

Anything in this doc is a **decision**, not a suggestion. To change a token, a rule, or a pattern:

1. Open a PR titled `design: <change>`
2. Update this file in the same PR as any code that depends on the new value
3. Notify designers (post in your team chat) — design-system drift is the killer of consistency

## Companion docs

- `docs/CLAUDE-DESIGN-PROMPT-TEMPLATE.md` — paste-ready per-screen prompt
- `docs/PRODUCTION-PLAN.md` — what to build, in what order
- `CLAUDE.md` — engineering conventions
- `docs/claude-watcher.md` — automated review-agent setup
