# Claude Design — per-screen prompt template

> Paste-ready prompts for designing each screen in [Claude Design](https://claude.ai/design). Pair with `docs/DESIGN-BRIEF.md` (the standing context).

## How to use this file

For every screen you want to design:

1. Open a fresh session at https://claude.ai/design
2. **Connect the GitHub repo** `ravipotluru/wholesalehub` (Settings → Codebase) so Claude Design auto-extracts tokens from `tailwind.config.ts` and reuses the components in `src/components/ui/`. If your subscription doesn't support repo connection, paste `docs/DESIGN-BRIEF.md` as your first message instead.
3. **Paste the standing-context prompt below** as your first message
4. **Paste the screen-specific prompt** as your second message
5. **Iterate visually** — voice / sliders / inline comments
6. **Export the handoff bundle** when satisfied
7. Drop the bundle path back into Claude Code and run `/wholesalehub-design-handoff <bundle>`

## Standing-context prompt (paste FIRST in every session)

```
You are designing screens for WholesaleHub — a B2B wholesale marketplace for
smoke shops and gas stations to source inventory from regulated wholesale
distributors.

The full design brief lives at docs/DESIGN-BRIEF.md in the repo. Apply
all of its rules: brand colors (brand-blue #1E4D8C primary, brand-orange
#FF6A00 only for the single critical CTA per screen, brand-teal #20A39E
secondary), Inter typography, Tailwind tokens only (no hex literals),
existing components from src/components/ui/, generous whitespace, single-
color Lucide icons, no gradients, no shadows on text, refined Linear/
Stripe-Dashboard-grade polish.

For every screen design ALL FIVE states:
1. Loading (skeleton matching final structure)
2. Empty (illustration + helpful copy + clear CTA)
3. Error (recoverable, partial data still shown)
4. Populated (the happy path)
5. Edge case (long text, many items, narrow viewport)

Mobile-first. WCAG AA contrast. Touch targets >= 44px on phone.
Animations <= 300ms ease-out. No bounce.

When I describe a screen, output live HTML using Tailwind tokens and the
existing component library. Show all states stacked vertically so I can
review them in one pass.
```

## Per-screen prompt template (paste SECOND, fill in the blanks)

```
Design the [SCREEN NAME] screen for WholesaleHub.

Audience: [ROLE — retailer / wholesaler / warehouse / admin / analyst]
Route: [/path/in/the/app]

What the user is trying to do:
[1-3 sentences. Specific outcome, not "manage X".]

Information shown on the page:
- [item 1]
- [item 2]
- ...

Actions the user can take:
- [primary CTA]
- [secondary actions]
- [destructive actions, if any]

Layout type: [single-column form / two-column with sidebar / data
table / grid of cards / hero + sections / mobile bottom-tab page]

Mobile vs desktop priority: [mobile-first / desktop-first / equal]

Reuse these existing components from src/components/ui/:
[Button / Card / Modal / DataTable / Badge / KpiCard / Skeleton /
EmptyState / Tabs / Input / Select / Breadcrumb / ConfirmDialog]

Specific constraints:
- [accessibility note]
- [data scale — "may have 0 to 5000 rows"]
- [time pressure — "user is on the warehouse floor on a phone"]
- [any technical constraint — "uses native camera"]

Save behavior: [single API call on submit / autosave per field / batch
"save changes" button at top]

Show all 5 states stacked vertically. Use realistic sample data, not
"Lorem ipsum" or "Item 1, Item 2".
```

---

## Pre-filled prompts for the P0 screens

Copy → paste → tweak as needed. Each is ready to drop into Claude Design after the standing context.

### 1. Notification preferences ⭐ (calibration screen — start here)

```
Design the Notification Preferences screen for WholesaleHub.

Audience: Retailer (smoke shop owner)
Route: /settings/notifications

What the user is trying to do:
Control how WholesaleHub contacts them. They want to see every notification
type, every channel (in-app / email / SMS), and toggle each combination.
They want to save once at the end, not per-row.

Information shown on the page:
- Header: "Notification preferences" + 1-line explainer
- Matrix: rows = notification categories, columns = channels (in-app /
  email / SMS), cells = toggle switches
- Categories to show:
  - Order updates (CONFIRMED / SHIPPED / DELIVERED)
  - Price drop alerts on saved products
  - Stock alerts on saved products
  - Discrepancy resolutions (warehouse staff)
  - Anomaly digests (weekly admin)
  - System announcements (always on for in-app, optional for email)
- Phone number + email shown next to their respective columns (so user
  knows where SMS will go); both have "Edit" link to /settings/account
- Sticky save bar at bottom of the form area: "Discard changes" + "Save
  preferences"

Actions the user can take:
- Toggle any cell on/off
- Discard / Save (only enabled when there are unsaved changes)
- Edit phone or email (link out)

Layout type: single-column form, max-w-3xl centered

Mobile vs desktop priority: equal — phone version stacks each category
as a card with channel toggles inside, desktop shows the matrix table

Reuse these components: Button (primary for Save, ghost for Discard),
Card, Badge (to mark "always on" for system announcements + in-app),
Skeleton (loading)

Specific constraints:
- WCAG AA: every toggle has a proper label readable to screen readers
- The grid must be readable on a 320px-wide phone — collapse to cards
- "System announcements + in-app" toggle is always on (locked) with a
  small lock icon and tooltip explaining why
- Show a green "Saved" toast for 3s after successful save

Save behavior: single API call to PATCH /api/users/me/notification-prefs
on Save click. Discard reverts to last-saved state.

Show all 5 states stacked vertically. Use realistic sample data.
```

### 2. Camera-based barcode scanner ⭐ (warehouse blocker)

```
Design the Mobile Barcode Scanner screen for WholesaleHub.

Audience: Warehouse staff (receiving inventory at a vendor location)
Route: /inventory/receive/[id] (replacing the current fake ScannerModal)

What the user is trying to do:
Receive a shipment by scanning every box. They open the page, point the
phone camera at a UPC, and the app records it. They scan dozens to
hundreds in a session. Many will scan in low light, with one hand free.

Information shown on the page:
- Top bar: "Receiving PO-2026-0042" + supplier name + close button (back
  to receipt list)
- Camera viewfinder taking ~60% of vertical space, with a centered
  scanning crosshair / reticle. Brand-blue corners, semi-transparent
  scrim outside the reticle.
- Below the viewfinder, a single "Last scan" panel showing:
  - Product name (or "Unknown SKU" if not in catalog)
  - SKU in mono font
  - Quantity counter (e.g. "Scanned 3 of 12 expected")
  - Match status badge: "MATCHED" (green), "OVER" (orange),
    "UNKNOWN" (red)
- Bottom: running totals — "Lines complete: 4 / 12 • Items received: 47"
- Persistent "Manual entry" button (text input fallback for when the
  camera can't read the code)
- Persistent "Done scanning" button to exit and review

Actions the user can take:
- Scan (passive — happens via camera)
- Tap to focus the camera
- Toggle flashlight (icon button top-right of viewfinder)
- Manual barcode entry (opens a small modal with a text input)
- Close / Done

Layout type: full-screen mobile-first. Desktop just centers the same
phone-shaped layout in the viewport (warehouse staff don't use desktop
for this).

Mobile vs desktop priority: mobile-first, mobile-only design

Reuse these components: Button (primary "Done", ghost "Manual entry"),
Badge (match status), Modal (manual entry fallback), Skeleton (camera
warming up)

Specific constraints:
- Camera permission UX: when not yet granted, show a card explaining
  why we need camera access + an "Allow camera" button. If denied,
  surface "Open settings" + the manual-entry fallback.
- Feedback on every scan: a subtle haptic vibration (50ms), a 300ms
  green border flash on match, red flash + sound on no-match
- Offline-friendly — show "Offline (5 pending sync)" badge at top right
  when network is dead. Sync indicator when reconnecting.
- Touch targets >= 44px (gloves on, in a cold warehouse)
- High contrast — must be readable in bright loading-dock sun

Save behavior: each scan POSTs to /api/inventory/scan immediately when
online; queues to IndexedDB and syncs on reconnect when offline.

Show all 5 states stacked vertically: pre-permission, populated mid-
scan, all-scans-complete (success), offline-with-queue, error-recoverable.
```

### 3. Catalog CSV Import Wizard

```
Design the Catalog CSV Import Wizard for WholesaleHub.

Audience: Wholesaler (seller listing 50-5000 products at once)
Route: /products/import

What the user is trying to do:
Upload a CSV of their entire product catalog and have it imported into
WholesaleHub. They want to see what will be created vs updated vs
errored BEFORE committing — they don't want a black-box import that
silently breaks half their listings.

Information shown on the page:
- Stepper at top: "1. Upload  ·  2. Preview  ·  3. Result"
- STEP 1 (Upload): drag-drop zone occupying most of the viewport,
  with secondary "Browse files" button. Helper text shows expected
  columns + a "Download sample CSV" link.
- STEP 2 (Preview):
  - Summary cards: "Will create: 234 new products" / "Will update:
    87 existing" / "Errors: 5 rows" (each in a Card with appropriate
    color)
  - DataTable: row 1 of CSV, then a "STATUS" column that shows
    [CREATE / UPDATE / ERROR with reason]. Errored rows highlighted
    red. Sortable + filterable.
  - "Download error report" button + "Cancel" + "Confirm import" CTA
- STEP 3 (Result):
  - Big success icon + "234 created, 87 updated, 5 skipped"
  - Link to view newly imported products
  - Link to "Try another import"
  - For errored rows, "Download report" link

Actions:
- Drop / browse to upload
- Cancel at any step
- Confirm at preview step
- Download error CSV
- Re-upload after fix

Layout type: full-page wizard, centered max-w-5xl. Stepper sticky at
top.

Mobile vs desktop priority: desktop-first (sellers do bulk uploads at
desks). On mobile, the table becomes vertically stacked cards.

Reuse: Button, Card, KpiCard (for summary numbers), DataTable, Badge,
Tabs (no), Skeleton.

Specific constraints:
- File size limit: 10 MB. Show inline error if exceeded.
- Row limit: 5000. Show inline error if exceeded.
- The preview must paginate at 100 rows; "Showing 1-100 of 326".
- Show a 1-line warning if any product images are missing URLs (not
  blocking, just heads-up)
- Keyboard accessible: stepper navigable, table sort + filter via keys
- Confirm button shows loading spinner during the actual import POST,
  disable other actions

Save behavior: STEP 2 commits via POST /api/wholesaler/products/import
with the parsed rows. Idempotency-Key header sent automatically.

Show all 5 states stacked: empty step-1, populated step-2 with mixed
create/update/error rows, all-error step-2, success step-3, network-
error mid-commit.
```

### 4. Buyer Verification (retailer side)

```
Design the Buyer Verification screen for WholesaleHub.

Audience: Retailer (smoke shop owner who needs to prove they can
legally buy regulated products)
Route: /settings/verification

What the user is trying to do:
Upload the documents we need to verify them for age-restricted SKUs:
resale certificate, EIN letter, state tobacco license. They want to
see what's required, what they've uploaded, and what status each is
in. If something is rejected, they need to know why and re-upload.

Information shown:
- Header with overall verification status badge: UNVERIFIED / PENDING /
  VERIFIED / REJECTED
- For each required document type (Resale Certificate, EIN Letter,
  State Tobacco License) a Card showing:
  - Title + 1-line explainer + link to "What is this?" help article
  - Drop-zone or "View uploaded" preview thumbnail
  - Upload status (Uploaded, Pending review, Approved, Rejected with
    reason)
  - "Replace" or "Upload" button
- Optional: a 4th "Other supporting documents" card for cases where
  one of the standard types doesn't apply
- Bottom info banner: "We typically review within 24 hours. You'll
  get an email when each document is approved."
- If status is REJECTED: top of page banner with rejection reason + CTA
  "Upload corrected document"

Actions:
- Upload / replace each document type
- View uploaded
- Delete (only if still PENDING)

Layout type: single-column, max-w-3xl

Reuse: Card, Badge, Button (primary "Upload" / secondary "Replace" /
ghost "View"), ErrorBanner (for rejection), EmptyState

Specific constraints:
- Accepted file types: PDF, JPG, PNG. Max size 10 MB each.
- HEIC accepted on iOS (auto-convert client-side or note "iPhone
  HEIC files are auto-converted")
- Show file thumbnail + filename + size after upload
- All sensitive data — file is uploaded via signed URL to S3/Vercel
  Blob, not via our server
- Form must be re-orderable in case of layout change

Save behavior: each upload POSTs to /api/buyer/documents independently
(no submit button — uploads commit immediately).

Show all 5 states stacked: nothing-uploaded (empty), one-pending +
one-rejected (mid-flow), all-approved (verified), upload-failed (error
recoverable), edge-case where all 3 types are rejected.
```

### 5. Multi-location ship-to selector at checkout

```
Design the Ship-To Selector for the WholesaleHub checkout.

Audience: Retailer with a chain of 2+ stores (one bill-to, many
ship-tos)
Route: /checkout (existing screen, modify ship-to step)

What the user is trying to do:
At checkout, pick which of their store locations should receive this
order. They might have 2 stores or 50.

Show:
- Section header "Ship to" with subhead "Where should this order be
  delivered?"
- If only 1 location: read-only display of that address
- If 2-3 locations: radio-card selector — each card shows label,
  address, "Default" badge if applicable
- If 4+ locations: searchable dropdown that opens to a list, with
  the selected option above
- "Add a new location" button (opens a modal with the address form)
- "Manage locations" link out to /settings/locations

Reuse: Card, Input, Select, Modal (for new location form), Button,
Badge

Constraints:
- Default location preselected by default
- Searchable dropdown supports keyboard navigation
- Adding a new location does NOT leave checkout — modal-flow only
- Once added, the new location is auto-selected

Save: integrates into the existing checkout state — when the user
hits "Place order", the selected ship-to-location-id is included.

Show all 5 states stacked: 1-location (read-only), 3-locations (radio),
20-locations (searchable dropdown), add-new-location modal open, error-
saving-new-location.
```

### 6. Tier Pricing Editor (for sellers)

```
Design the Tier Pricing Editor for WholesaleHub.

Audience: Wholesaler setting volume-discount tiers on a product
Where: Inside /products/[id]/edit, as one section of the larger
product editor form

What the user is trying to do:
Set per-quantity price breaks for a product they sell. They want
"buy 1-11 = $10, 12-23 = $9, 24+ = $8" expressible quickly.

Show:
- Section header "Volume pricing" with sub-header explaining how tier
  pricing applies at checkout
- Always 1 row visible: base price (read-only — sourced from the
  ProductPricing.wholesalePrice field above)
- Below it, a list of "Add tier" rows. Each row has:
  - "When buyer orders X+" (number input for minQty)
  - "Charge per unit:" (currency input)
  - "Discount vs base" auto-computed and shown (e.g. "10% off")
  - Trash icon to remove the tier
- "Add tier" button at bottom
- Live preview to the right: a small table showing
  | Quantity range | Unit price | Total |
  with 4 sample quantities (1, 12, 24, 100)

Reuse: Card, Input, Button, Badge

Constraints:
- minQty must be >= 2 (tier 1 = base price)
- Each tier's minQty must be > the previous tier's minQty
- Each tier's price should be < the previous tier's price (warn but
  don't block — edge cases like premium-grade pricing exist)
- Mobile: preview table collapses to inline rows below the form

Save: part of the larger product-edit form save (single API call to
PATCH /api/products/[id] with tiers as a nested array)

Show 5 states: empty (no tiers), 1-tier, 3-tiers (typical), validation
error (overlapping minQty), saving.
```

---

## What to do AFTER you export from Claude Design

When Claude Design's "Export → Handoff to Claude Code" finishes, you get a bundle (HTML + assets, possibly a JSON spec, possibly a paste-able prompt — the format depends on Claude Design's current export options).

In Claude Code, run:

```
/wholesalehub-design-handoff <path-to-bundle>
```

That skill (defined in `.claude/skills/wholesalehub-design-handoff/`) scaffolds:

- The Server Component shell at the right Next.js route
- The Client Component(s) for interactivity
- Any new shared components, placed in `src/components/<area>/`
- The matching API route stub (with `getAuthedUser` + Zod + transactions)
- A React Query hook in `src/hooks/`
- A Zod schema in `src/lib/validators.ts`
- Render tests for any new shared component

It opens a draft PR — never auto-merges. Review the diff, run `/wholesalehub-checks` to confirm lint/typecheck/test pass, mark the PR ready for review.

## Common gotchas (from real handoffs)

- **Hex literals in the export.** If the bundle uses `text-[#1E4D8C]` instead of `text-brand-blue`, the design-handoff skill rewrites them to tokens. If you see hex literals in the resulting PR, it's a bug — file an issue.
- **New components instead of reused primitives.** Claude Design sometimes generates a button from scratch instead of using our `Button` component. The handoff skill detects this and replaces with the project primitive when it finds a match.
- **Inline `<style>` tags.** Same — the handoff strips these and converts to Tailwind classes.
- **Missing accessibility attributes.** The handoff adds `aria-label` to icon-only buttons and `htmlFor` on form labels.
- **Animations using arbitrary durations.** Snapped to our token scale (150 / 200 / 250 / 300 ms only).

## When NOT to use Claude Design

- Trivial text-only changes (typo fixes, label updates) — just edit the file
- Changes to existing screens that touch only logic, not layout
- Anything requiring real backend data to render meaningfully (use seed data + Storybook for those)
- The barcode scanner viewfinder camera integration — Claude Design generates the layout, but the camera+ZXing code is hand-written

## Resources

- Claude Design home: https://claude.ai/design
- Claude Design announcement: https://www.anthropic.com/news/claude-design-anthropic-labs
- Project design brief: `docs/DESIGN-BRIEF.md`
- Engineering conventions: `CLAUDE.md`
- Roadmap of P0 screens to design: `docs/PRODUCTION-PLAN.md` § Mobile / PWA + § Buyer / Seller experience
