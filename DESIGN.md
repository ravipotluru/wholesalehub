# DESIGN.md — WholesaleHub

> Design system source of truth in the [Claude Design](https://claude.ai/design)-compatible 9-section format. Connect this repo to a Claude Design "design system" and this file is auto-detected and used as the brand brief.
>
> Companion (longer-form, less structured): `docs/DESIGN-BRIEF.md`. If they conflict, this file wins for Claude Design ingestion; the brief is for humans.

---

## 1. Visual Theme & Atmosphere

WholesaleHub is a **B2B wholesale marketplace** for smoke shops and gas stations to source inventory from regulated wholesale distributors. It's an **operationally critical SaaS web app** — retailers run their store off this. A bad design wastes their time every single day.

**Reference feel:** *Stripe Dashboard density × Faire warmth × Linear polish.*

- **Stripe Dashboard density** — tables, forms, and detail views must hold a lot of information without feeling cluttered. Generous line-height, narrow borders, muted secondary text.
- **Faire warmth** — not Salesforce. Subtle warmth in copy, friendly empty states, illustration where it helps a confused user.
- **Linear polish** — every animation deliberate (150–250ms ease-out), every shadow restrained, every corner radius consistent.

**Personality:** professional but not stuffy, direct but not cold, confident, plainspoken. *"Lowest price from 12 suppliers"* — not *"Discover unbeatable prices from our network."*

**Anti-patterns** (NEVER look like): crypto-bro flashy, gradient-heavy SaaS marketing, brutalism, NetSuite/SAP enterprise corporate, consumer-app-bouncy.

---

## 2. Color Palette & Roles

CSS variables (these mirror `tailwind.config.ts` exactly):

```css
:root {
  /* Brand — primary identity, navigation, emphasis */
  --brand-blue: #1E4D8C;          /* primary actions, header, links, active nav */
  --brand-blue-light: #2563A8;    /* hover on primary */
  --brand-blue-dark: #163A6B;     /* pressed state */

  /* Brand — critical CTA only (max 1 per screen) */
  --brand-orange: #FF6A00;        /* "Place order", "Add to cart" — hero actions only */
  --brand-orange-light: #FF8533;
  --brand-orange-dark: #CC5500;

  /* Brand — secondary accent (icons, supplier links) */
  --brand-teal: #20A39E;
  --brand-teal-light: #28C4BE;
  --brand-teal-dark: #187A76;

  /* Status */
  --success: #00B894;             /* "BEST PRICE" badge, paid status, success toasts */
  --status-warning: #F39C12;      /* low stock, MOQ not met, license expiring */
  --status-error: #E74C3C;        /* out of stock, validation errors, failed states */
  --status-info: #3498DB;         /* informational badges, "in transit", BACKORDER */

  /* Neutrals */
  --dark: #2D3436;                /* primary body text, headings */
  --light: #F5F6FA;               /* page background */
  --surface: #FFFFFF;             /* cards, modals, table rows */
  --gray-50:  #F9FAFB;
  --gray-100: #F3F4F6;
  --gray-200: #E5E7EB;            /* borders */
  --gray-300: #D1D5DB;            /* input borders */
  --gray-400: #9CA3AF;
  --gray-500: #6B7280;            /* secondary text */
  --gray-600: #4B5563;
  --gray-900: #111827;
}
```

**Role rules:**

- **Body text** uses `--dark` on `--surface`. **Never** pure black on pure white.
- **Secondary text** uses `--gray-500`.
- **Primary button**: `bg: --brand-blue, text: white, hover: --brand-blue-light`.
- **Critical CTA** (one per screen, e.g. "Place order"): `bg: --brand-orange`. If you find yourself adding two orange CTAs to a screen, one is wrong.
- **Secondary button**: `border: --gray-300, text: --dark, hover: bg --gray-50`.
- **Destructive**: `bg: --status-error, hover: --status-error/90`.
- **Links**: `--brand-teal`, hover `--brand-teal-dark`, with `underline-offset-2` and underline on hover only.
- **Status badges**: tinted background + matched text — e.g. `bg-success/10 text-success`, `bg-status-error/10 text-status-error`.
- **Color is never alone** for state. Pair with an icon or text label. Color-blind safe.

---

## 3. Typography Rules

```css
:root {
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```

| Style | Size / Weight / Tracking | Use |
|---|---|---|
| Display | 36 / 700 / -0.02em | Page hero (rare) |
| H1 | 30 / 700 / 0 | Page title |
| H2 | 24 / 600 / 0 | Section heading |
| H3 | 20 / 600 / 0 | Card / group heading |
| H4 | 18 / 500 / 0 | Subsection |
| Body | 16 / 400 / 0, line-height 1.5 | Default |
| Body-sm | 14 / 400 / 0 | Secondary text, helper text |
| Caption | 12 / 500 / 0.05em uppercase, color `--gray-500` | Labels above values |
| Mono-sm | 14 / 400 / 0, `--font-mono` | SKUs, order numbers, IDs |

Google Fonts fallback: load Inter (weights 400/500/600/700) and JetBrains Mono (400). Never bold-bold-bold; use weight to direct attention, not to compete for it.

---

## 4. Component Stylings

These primitives already exist in `src/components/ui/`. **Reuse them — do NOT roll new ones.** Variants and rest/hover/active/disabled states defined per primitive.

### Button
- Variants: `primary` (brand-blue) / `secondary` (border + ghost text) / `ghost` (text only) / `destructive` (status-error) / `link` (underline-on-hover)
- Sizes: `sm` (32px height) / `md` (40px) / `lg` (48px)
- States: rest, `hover:opacity-95 + bg shift`, `active:scale-[0.98]`, `disabled:opacity-50 cursor-not-allowed + tooltip explaining why`, `loading:spinner replaces text + maintains width`
- Focus ring: `ring-2 ring-brand-blue ring-offset-2`
- Min touch: 44×44px on mobile

### Input / Select / Textarea
- Border: `--gray-300`, focus `--brand-blue`, error `--status-error`
- Background: `--surface`, disabled `--gray-100`
- Helper text below in `--gray-500` Body-sm; error text in `--status-error`
- Always paired with a real `<label>` (no placeholder-only labels)

### Card
- Background `--surface`, border `--gray-200`, radius 8px (rounded-lg), shadow-sm
- Hoverable variant: `hover:shadow-md transition`
- Clickable variant: same hover + cursor-pointer + outer border `--brand-blue` on focus
- Padding: 24px standard (`p-6`), 16px compact (`p-4`)

### Modal
- Sizes: `sm` (400px) / `md` (560px) / `lg` (720px) / `xl` (960px)
- Backdrop: `bg-black/40 backdrop-blur-sm`
- Surface: `--surface`, radius 12px (rounded-xl), shadow-lg
- Open animation: 200ms fade + scale 0.96→1
- Close: ESC key + clickable backdrop
- `role="dialog"` + `aria-labelledby` + focus trap

### Tabs
- Underline variant (default): 2px bottom border in `--brand-blue` on active; rest tabs in `--gray-500`
- Pill variant: `rounded-full px-3 py-1`, active `bg-brand-blue/10 text-brand-blue`
- Keyboard: arrow-keys navigate, Tab moves to panel

### Badge
- Pill (`rounded-full px-2 py-0.5 text-xs font-medium`)
- Tone variants: `success`, `warning`, `error`, `info`, `neutral`. Tinted bg + matched text (e.g. `bg-success/10 text-success`)

### DataTable
- Header row: `bg-gray-50 text-gray-500 text-xs uppercase tracking-wider font-medium`
- Body rows: `--surface`, `border-b border-gray-100`, `hover:bg-gray-50`
- Sort indicators: `↑ ↓` icons in header
- Pagination: cursor-style "Showing 1-25 of 127" + prev/next + page numbers
- Bulk select: leftmost column with checkbox; selection bar appears at top with action buttons
- Empty state: render `EmptyState` component in the table body, not a "no data" cell

### KpiCard
- Number: 30px / weight 600
- Label: caption style above the number
- Trend: small arrow + percent change in `--success` (up) or `--status-error` (down), with arrow icon
- Optional sparkline: 1px stroke `--brand-blue`, 32px tall, no axes

### Skeleton
- Background: `bg-gray-200` with shimmer animation
- Shimmer: linear-gradient sweeping at 1.5s linear infinite
- `prefers-reduced-motion`: shimmer disabled, static gray block

### EmptyState
- Centered illustration (line art, single color from brand-teal) at 96–128px
- H3 headline + Body description in gray-500
- Single CTA button (primary)

### ErrorBanner
- Tone: `bg-status-error/10 border border-status-error/20 text-dark`
- Icon: `AlertCircle` from Lucide in `--status-error`
- Dismissible variant with X button

### LoadingPage
- Centered spinner (24px, `--brand-blue`) + Body label "Loading {context}…"

### ConfirmDialog
- Modal-sm
- Destructive variant: title in `--status-error`, "Confirm" button is destructive button
- Always 2 buttons: "Cancel" (ghost) + "Confirm" (primary or destructive)

---

## 5. Layout Principles

```css
:root {
  --container-max: 1280px;        /* max-w-7xl, dashboards */
  --container-form: 672px;        /* max-w-2xl, forms */
  --container-prose: 768px;       /* max-w-3xl, long-form pages */

  --space-px: 4px;                /* base unit */
  --page-x-mobile: 16px;
  --page-x-tablet: 24px;
  --page-x-desktop: 32px;
  --page-y: 32px;
}
```

**Spacing scale (Tailwind defaults — 4px increments):**

- 4 (`space-1`): hairline gap
- 8 (`space-2`): icon + label
- 12 (`space-3`): inline-related elements
- 16 (`space-4`): default form-field gap
- 24 (`space-6`): default section gap
- 32 (`space-8`): major page chunks
- 48 (`space-12`): top-level page sections

**Whitespace rhythm:** generous, never crammed. If a page is sparse, that is fine. Density is achieved through information per row in tables, not through reducing whitespace between sections.

**Page layout (authenticated dashboard):**

```
┌──────────────────────────────────────────────────────┐
│  Top bar (h-16, px-6, bg-surface, border-b gray-200)  │
│  Logo │ Search │ ─spacer─ │ Notifications │ User     │
├──────────┬───────────────────────────────────────────┤
│ Sidebar  │  Page header: H1 + breadcrumb + CTA       │
│ (w-60,   │                                           │
│ bg-light)│  max-w-7xl content, mx-auto                │
│          │                                           │
│          │  Cards / tables / forms                   │
└──────────┴───────────────────────────────────────────┘
```

Sidebar collapses to slide-over drawer on `<lg` (1024px). Mobile: top bar + hamburger, no sidebar by default.

**Auth screens:** centered card on `--light` background, max-w-md, single column, brand mark at top.

**Mobile (warehouse staff):** bottom-tab nav (4–5 tabs, 64px tall, icons + labels), no sidebar.

---

## 6. Depth & Elevation

```css
:root {
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.10), 0 2px 4px -2px rgb(0 0 0 / 0.10);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.10), 0 4px 6px -4px rgb(0 0 0 / 0.10);
}
```

**Surface hierarchy:**

| Layer | Surface | Shadow | Use |
|---|---|---|---|
| 0 | `--light` | none | Page background |
| 1 | `--surface` | `--shadow-sm` | Cards at rest |
| 2 | `--surface` | `--shadow-md` | Hovered / elevated cards, dropdowns, popovers |
| 3 | `--surface` | `--shadow-lg` | Modals, full overlays, drawers |

**Never use `shadow-xl` or `shadow-2xl`** — too heavy for this product.

**No drop shadows on text.** No background images on cards. No insets.

---

## 7. Do's and Don'ts

### Do
- **Show a count** when listing things ("12 orders" not just a list)
- **Show "Last updated: X"** on data that can be stale
- **Show currency symbol** next to every price (`$12.50` not `12.50`)
- **Show timezone** next to every absolute timestamp (`Mar 15 2026, 3:42pm EST`)
- **Show units** next to every quantity (`12 units` not `12`)
- **Confirm destructive actions** with a `ConfirmDialog`
- **Persist filter state** in the URL so the page is shareable
- **Auto-save form drafts** to localStorage when the form is long
- **Render server-side first** (Next.js App Router default), hydrate after
- **Use Lucide React** for icons — single-color line icons only, stroke 1.75
- **Use generous whitespace** — never cram to fill a page
- **Respect `prefers-reduced-motion`** — disable shimmer + slide animations

### Don't
- **No gradients** anywhere
- **No drop shadows on text**
- **No background images on cards**
- **No multi-color icons** — line icons only
- **No pure black text on pure white** — use `--dark` on `--surface`
- **No more than one orange CTA** per screen
- **No animations longer than 300ms**
- **No bouncy easing** (cubic-bezier with overshoot) — ease-out only
- **No "Loading…" text** — always show a skeleton or spinner
- **No "An error occurred"** — always say what failed and how to recover
- **No modal-on-modal stacking**
- **No disabled buttons without tooltip** explaining why
- **No dropdowns that scroll the page** instead of opening in place
- **No new components** when an existing primitive in `src/components/ui/` does the job

---

## 8. Responsive Behavior

Mobile-first. Tailwind breakpoints (px = device width):

| Breakpoint | px | Primary device |
|---|---|---|
| (default) | <640 | Phone portrait |
| `sm` | 640+ | Phone landscape, small tablet |
| `md` | 768+ | Tablet portrait |
| `lg` | 1024+ | Tablet landscape, small laptop |
| `xl` | 1280+ | Desktop |
| `2xl` | 1536+ | Large desktop |

**Per-area priority:**

- **Marketplace + cart + checkout**: mobile-first. Retailers shop on phones.
- **Warehouse / receiving / scanner**: mobile-only (warehouse staff are on phones in the dock).
- **Seller catalog / pricing / payouts**: desktop-first. Sellers work at desks.
- **Admin (audit, llmops, evaluations)**: desktop-first. Tables-heavy.
- **Auth, settings, notifications**: equal — work well on both.

**Collapse behavior:**

- Sidebar nav → slide-over drawer at `<lg`
- Wide tables → vertically stacked cards at `<md`
- Two-column forms → single-column at `<sm`
- Dashboard 4-column KPI grid → 2-column at `md`, 1-column at `<sm`
- Modal at `xl` width caps at viewport-32px on `<md`, slides up from bottom

**Touch targets ≥ 44×44px** on mobile (warehouse staff wear gloves in cold loading docks).

**High-contrast mode + bright sunlight:** scanner viewfinder + bottom-tab nav must be readable in direct sun.

---

## 9. Agent Prompt Guide

Reusable prompt snippets for any Claude Code or Claude Design session working on this product.

### When designing a new screen

```
Design the [SCREEN NAME] screen for WholesaleHub.

Audience: [retailer / wholesaler / warehouse / admin / analyst]
Route: [/path]
Goal: [1-3 sentences of user outcome, not "manage X"]

Information shown: [bullet list of what's on the page]
Actions: [primary CTA, secondary actions, destructive actions]
Layout type: [single-column form / two-column / data table / card grid /
              hero + sections / mobile bottom-tab page]
Mobile vs desktop: [mobile-first / desktop-first / equal]

Reuse from src/components/ui/: [Button / Card / DataTable / Modal / etc.]

Show ALL FIVE states stacked:
1. Loading (skeleton in same shape as final content)
2. Empty (illustration + headline + helpful copy + CTA)
3. Error (recoverable, partial data still shown)
4. Populated (the happy path)
5. Edge case (long text, many items, narrow viewport)

For forms also show: validation error, saving, saved/success.

Apply this DESIGN.md's tokens, colors, typography, and component
primitives. No hex literals — use Tailwind tokens. Lucide icons only.
WCAG AA. 44px touch targets on mobile. Animations <= 300ms ease-out.
```

### When implementing a Claude Design handoff in code

```
Apply the wholesalehub-design-handoff skill (.claude/skills/
wholesalehub-design-handoff/SKILL.md) to convert this Claude Design
handoff bundle into a Next.js page + Client Component(s) + matching
API route + React Query hook + tests.

Use:
- Server Component shell at the right Next.js App Router route
- src/components/ui/ primitives (do not roll new ones)
- Tailwind tokens from tailwind.config.ts (no hex literals)
- getAuthedUser() from src/lib/session.ts for auth
- Zod schema in src/lib/validators.ts
- prisma.$transaction for any multi-write
- pino logger for structured logging
- structured error envelope from src/lib/api-error.ts

Open a draft PR (never auto-merge — UI needs human eyes).
```

### When wiring real data into a mock screen

```
Replace the in-memory mock data in [route] with real Prisma queries
against [model]. Preserve the existing response shape so the UI page
does not break. Use Prisma typed where-clauses (no `any`). Aggregate
money / counts in Postgres via Prisma aggregate / groupBy. Convert
Decimal to Number only at the JSON boundary.
```

### When adding a new state to an existing screen

```
Add the [STATE NAME] state to [screen]. Match the existing visual
language: same Tailwind tokens, same component primitives, same
spacing rhythm. Do not introduce new colors, fonts, or shadows.
```

---

## Companion files

- `docs/DESIGN-BRIEF.md` — longer-form design narrative for human reviewers
- `docs/CLAUDE-DESIGN-PROMPT-TEMPLATE.md` — paste-ready per-screen prompts (6 P0 screens pre-filled)
- `docs/PRODUCTION-PLAN.md` — what to build, in what order
- `CLAUDE.md` — engineering conventions (project root)
- `tailwind.config.ts` — concrete token definitions

If any of those drift from this file, **this file wins for Claude Design ingestion** — update the others to match. PRs that change a token must update both this file and `tailwind.config.ts` in the same commit.
