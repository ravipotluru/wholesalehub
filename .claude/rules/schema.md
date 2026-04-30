---
paths:
  - prisma/schema.prisma
  - prisma/migrations/**
description: Conventions for changes to the Prisma schema and migrations. Schema changes are special — they ship with a migration the operator must apply, so the rules are stricter than normal code changes.
---

# Rules — Prisma schema & migrations

Schema changes are different from normal code changes:

- They modify a shared resource (the production DB) when applied
- They require a migration the operator must run with elevated privilege
- They can fail mid-way and leave the DB in a partial state
- They're hard to roll back

Treat every change here as a **production database change** even when it's
in a feature branch.

## When you change `schema.prisma`

1. **Generate the migration in the same PR.**
   - Locally: `npx prisma migrate dev --name <descriptive_snake_case>`
   - Commit the new `prisma/migrations/<timestamp>_<name>/migration.sql`
   - Don't commit a schema change without its migration file
2. **Migration name must describe intent.** Bad: `update_schema`. Good:
   `add_idempotency_key_table`, `add_pricing_visibility`, `add_order_indexes`.
3. **Add the migration step to the PR description's "Test plan" section**
   so the reviewer remembers to run it post-merge.

## What's allowed in a schema PR

- Add a new `model`
- Add a new field with a `?` (nullable) or a `@default(...)` value
- Add an `@@index([...])` or `@@unique([...])`
- Add an enum or extend an enum (Postgres requires care — see below)
- Add a relation (Prisma generates the FK)

## What's NOT allowed without coordination

- **Drop a column** — break legacy clients still reading it. Two-step:
  stop reading, ship, then drop in a follow-up.
- **Rename a column** — same as drop. Add new name, dual-write, switch
  reads, drop old name.
- **Change a column's type** — never works as an in-place migration on a
  populated DB. Add new column, backfill, switch reads, drop old.
- **Make a nullable column required** without a default — fails if any
  rows are NULL. Two-step: backfill, then `NOT NULL`.
- **Drop a table** — needs a separate cleanup PR after a deprecation window.
- **Remove an enum value** — Postgres tolerates adding values but not
  removing them; it's a multi-step migration.

## What's NEVER allowed

- Editing an existing migration file in `prisma/migrations/<old>/migration.sql`.
  Migrations are immutable once committed. If you need to fix a mistake,
  ship a follow-up migration.
- Calling `prisma db push` instead of `prisma migrate dev` for anything
  that ships. `db push` is a dev convenience that skips migration history.
- Committing a schema change without running `npx prisma generate` and
  verifying the new types are reflected in the codebase.

## Indexes

- Add `@@index([col])` on every column used in a `where` clause that
  isn't already covered by a primary key or `@@unique`.
- For multi-column filters (`where: { retailerId, orderDate: { gte } }`),
  use a composite index `@@index([retailerId, orderDate])` — the order
  must match the prefix of the most selective filter.
- Don't over-index — every index slows writes. Audit periodically.

## Money columns

- All money is `Decimal @db.Decimal(10, 2)` for prices, `Decimal @db.Decimal(12, 2)`
  for totals/balances. Never `Float`. Never `Int` (cents-as-int is a footgun
  given Prisma's Decimal support).

## Audit + transaction semantics

- New tables that store user-attributable state changes (audit trails,
  receipts, orders) get a `createdAt DateTime @default(now())` minimum;
  prefer also `updatedAt DateTime @updatedAt`.
- For tables that should be append-only (e.g. `AuditEvent`), enforce in
  the application layer; consider a Postgres trigger as belt-and-braces.

## Naming

- camelCase fields, snake_case via `@@map("snake_case_table_name")`.
- Plural table names (`orders`, `products`), singular Prisma model
  (`Order`, `Product`).
- Foreign keys: `<entity>Id` (e.g. `retailerId`, `wholesalerId`). Don't
  use `<entity>_id`.
- Cuids for primary keys (`@id @default(cuid())`), human-friendly IDs
  as a separate `@unique` column when needed (`retailerId String @unique`
  for `RT001`, etc.)
