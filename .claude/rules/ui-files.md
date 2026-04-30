---
paths:
  - src/app/(dashboard)/**
  - src/app/(auth)/**
  - src/components/**
description: Rules for changes to UI files. Most importantly, this codifies that Claude Code (running headlessly) should NOT touch these files unless it can route the work through Claude Design.
---

# Rules — UI files

UI changes need browser validation. Claude Code in CI / headless mode
cannot render or visually verify a screen, so the safe default is:

> **Don't touch UI files from Claude Code unless the change is a
> trivial textual fix or comes from a Claude Design handoff.**

## Trivial UI changes that are safe

These are OK to do in regular Claude Code sessions:

- Fix a typo in user-facing text
- Update a placeholder or label string
- Fix an obvious accessibility bug (missing `aria-*`, missing `alt`)
- Update an import path after a file move
- Remove dead/unused code that's clearly not rendered
- Update copy in an empty state or error message

## Non-trivial UI changes — go through Claude Design

For anything that adds, removes, or restructures elements on a page,
the workflow is:

1. Open https://claude.ai/design
2. Describe the screen, referencing the project's design system
3. Iterate visually until it looks right
4. Export the handoff bundle
5. Hand it to Claude Code via the **`wholesalehub-design-handoff`** skill
   (`.claude/skills/wholesalehub-design-handoff/`)

This applies to:
- New pages or modals
- Layout restructuring
- Adding new component variants
- Form field additions / restructuring
- Anything that changes the visible UI in a non-cosmetic way

## Design system to preserve

When a UI change does ship, it must use the project's design system:

- **Tailwind tokens only.** No hex literals in JSX (`text-[#1E4D8C]` is
  almost always wrong; use `text-brand-blue`). Tokens live in
  `tailwind.config.ts`.
- **Brand colors:**
  - Primary blue `#1E4D8C` → `brand-blue`
  - Action orange `#FF6A00` → `action-orange`
  - Accent teal `#20A39E` → `accent-teal`
  - Success green `#00B894` → `success`
  - Status warning / error / info per the existing tokens
- **Existing UI primitives.** Use what's in `src/components/ui/`:
  Button, Card, Modal, DataTable, Badge, KpiCard, Skeleton, Tabs,
  Input, Select, Breadcrumb, ConfirmDialog, EmptyState, ErrorBanner,
  LoadingPage. Don't recreate these.

## Code-level rules (still enforced)

Even for UI files:

- TypeScript strict, no `any`
- No `Record<string, unknown>` casts on session/user
- Server Components by default; mark Client Components with `'use client'`
  only when they need browser-only APIs (state, refs, effects)
- Data fetching: prefer Server Components calling `prisma` directly OR
  React Query hooks (`useProducts`, `useCart`, etc.) — don't roll new
  fetch patterns
- For state, use Zustand stores in `src/store/` (cart + UI exist; reuse them)
- For forms, use React Hook Form + Zod resolver — don't roll your own

## Mobile / PWA

- Every interactive surface should work on a phone
- Touch targets ≥ 44×44px
- For barcode scanning specifically, use `@zxing/browser` against
  `navigator.mediaDevices.getUserMedia` — see the Inventory section
  in `docs/PRODUCTION-PLAN.md`

## When in doubt

- Open a draft PR, not ready-for-review
- Tag the PR with `needs-visual-review`
- Note in the PR description that the UI was generated/modified
  without browser validation
