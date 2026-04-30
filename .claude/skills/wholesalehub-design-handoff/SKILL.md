---
description: Convert a Claude Design (claude.ai/design) handoff bundle into a feature branch with the screen wired into the Next.js app. Use after designing a UI screen in Claude Design — paste the bundle and this skill scaffolds the route, page component, types, and tests.
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, PowerShell]
paths:
  - src/app/(dashboard)/**
  - src/components/**
---

# wholesalehub-design-handoff

Bridges Claude Design (claude.ai/design) → Claude Code → shipped PR.

## The problem this solves

Claude Code (this assistant) refuses to touch UI files for changes it
can't visually validate. Claude Design generates UI from a description
into live HTML and produces a "handoff bundle" Claude Code can
implement against. This skill is the glue.

## Workflow

1. **You** open https://claude.ai/design (Claude Pro / Max / Team / Enterprise)
2. **You** describe the screen, referencing this project's design system:
   - Tailwind tokens from `tailwind.config.ts` (brand-blue `#1E4D8C`,
     action-orange `#FF6A00`, accent-teal `#20A39E`, success `#00B894`)
   - Existing components under `src/components/ui/` (Button, Card,
     Modal, DataTable, etc.) and brand patterns from `README.md`
   - Connect the GitHub repo if Claude Design supports it for your
     subscription, so it ingests the design system automatically
3. **You** refine in Claude Design via voice/sliders/comments until it looks right
4. **You** export the handoff bundle (standalone HTML or the dedicated
   "send to Claude Code" option)
5. **You** invoke this skill with the bundle path or pasted content
6. **The skill** scaffolds the corresponding files in the right place

## What the skill produces

For a Claude Design screen called e.g. "Tier Pricing Editor for Sellers":

- `src/app/(dashboard)/products/[id]/pricing/page.tsx` — Server Component shell
- `src/app/(dashboard)/products/[id]/pricing/PricingEditor.tsx` — Client Component
- `src/components/pricing/PriceTierTable.tsx` — extracted shared component
- `src/__tests__/components/pricing/PriceTierTable.test.tsx` — render test
- (optional) `src/app/api/products/[id]/tiers/route.ts` — API stub if the
  design implies a new endpoint, with `getAuthedUser`, Zod, and
  transactions per CLAUDE.md conventions

## Args

- `<bundle-path>` — path to a downloaded Claude Design bundle (HTML, ZIP, or .design.json)
- `--screen <name>` — friendly name for the screen, used to derive filenames
- `--route <path>` — Next.js route path (e.g. `/products/[id]/pricing`)
- `--api` — also scaffold a matching API route stub
- `--no-test` — skip the test file scaffolding

## Hard rules

The skill MUST:
- Use existing `src/components/ui/*` building blocks, not roll new ones
- Use `getAuthedUser()` from `src/lib/session.ts` for auth, not raw NextAuth
- Use Tailwind tokens from `tailwind.config.ts`, never hex literals
- Wrap any state-changing API call in `prisma.$transaction` per CLAUDE.md rule 6
- Validate every API input with Zod (in `src/lib/validators.ts` or route-local)
- Add a structured pino log line for every meaningful action
- Open a draft PR, not a ready-for-review PR — UI needs human eyes

The skill MUST NOT:
- Push to main
- Run `npm install` for new dependencies without flagging in the PR
- Add inline `<style>` blocks or `style={{...}}` — Tailwind only
- Use `any` types or `as any` casts
- Touch `prisma/schema.prisma` (those changes go via migration PRs)

## Why this is a skill not a one-off

Without this codified, every UI feature becomes a re-explanation of
the conventions to Claude Code. Worse, a fresh session may forget
about `getAuthedUser`, the Tailwind tokens, the transaction rule, etc.
This skill encodes the conventions and the file layout so a Claude
Design handoff lands consistently.

## Roadmap of UI screens this unblocks

From `docs/PRODUCTION-PLAN.md`, the P0 UI screens that should run
through this workflow:

1. **Real camera-based barcode scanner** (replace mock in `src/components/inventory/ScannerModal.tsx`)
2. **Tier pricing badges + editor** (product card, product detail, seller pricing page)
3. **Catalog CSV import wizard** (drag-drop + preview + commit, for sellers)
4. **Buyer verification document upload + admin review queue**
5. **Multi-location ship-to selector** at checkout
6. **Notification preferences UI**
7. **Image upload UI** with thumbnail grid
8. **Real admin dashboards** for audit / llmops / evaluations / lineage / anomalies
   (currently return mock data despite real DB tables)

Each of these is a separate Claude Design session → handoff → this skill
→ PR. Don't try to design the whole app in one bundle; do one screen at
a time.
