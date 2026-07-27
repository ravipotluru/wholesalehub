# DEPLOY.md — Launch runbook (Vercel)

> Goal: go from the GitHub repo to a **live, seeded, usable application**.
> Time: ~10 minutes of clicking. As of 2026-07-26 there is **no Vercel project
> yet** — step 1 creates it. After setup, every push to `main` auto-deploys.

## 1. Create the Vercel project

1. Go to <https://vercel.com/new> logged in as the account that owns
   `ravipotluru/wholesalehub`.
2. Import **`ravipotluru/wholesalehub`**. Framework preset: **Next.js**
   (auto-detected). Root directory: `/` (default). Change nothing else.
3. Click **Deploy** — *no env vars needed yet*. The build's DB steps
   self-skip when `DATABASE_URL` is absent (`scripts/vercel-db-prepare.mjs`),
   so this first build is purely the **compile gate** for the codebase.
   - If it fails, the log shows a TypeScript/build error to fix in code —
     it is not a configuration problem.

## 2. Attach a Postgres database

1. Project → **Storage** tab → **Create Database** → **Neon** (Postgres,
   free tier) → accept defaults → **Connect** to this project.
2. Check **Settings → Environment Variables**: Prisma's `db push` needs a
   **direct (non-pooled)** connection. If `DATABASE_URL` points at a pooled
   host (hostname contains `-pooler`), copy the value of
   `DATABASE_URL_UNPOOLED` (or `POSTGRES_URL_NON_POOLING`) into
   `DATABASE_URL`.

## 3. Set the remaining env vars (Settings → Environment Variables, all environments)

| Variable | Value | Required? |
|---|---|---|
| `AUTH_SECRET` | random 32+ bytes, base64 (command below) | ✅ |
| `NEXTAUTH_SECRET` | **same value** as `AUTH_SECRET` | ✅ (covers both env names next-auth v5 beta reads) |
| `WEBHOOK_SECRET` | a **different** random value | ✅ (the webhook route rejects the demo literal in production) |
| `NEXT_PUBLIC_APP_URL` | `https://<project>.vercel.app` — update once you know the URL / add a domain | recommended (used in email links) |
| `RESEND_API_KEY` | from <https://resend.com> (free tier) | optional — makes verification/reset emails actually send |
| `EMAIL_FROM` | `WholesaleHub <noreply@yourdomain.com>` (domain must be verified in Resend) | optional |
| `REDIS_URL` | Storage tab → Upstash Redis (free) | optional — rate limiting fails open without it |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | IAM user with Bedrock access | optional — AI features fall back to deterministic mocks |
| `BLOB_READ_WRITE_TOKEN` | Storage tab → Blob | optional — verification document bytes (COMP-3, not yet wired) |

Generate a secret — PowerShell:

```powershell
$b = [byte[]]::new(32); (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b); [Convert]::ToBase64String($b)
```

or bash: `openssl rand -base64 32`

## 4. Redeploy

**Deployments → ⋯ (latest) → Redeploy.** With `DATABASE_URL` set, the build
now runs: `prisma generate` → `prisma db push` (creates all 40+ tables) →
`prisma db seed` (demo data — **skips itself if the DB already has users**) →
`next build`.

## 5. Log in — demo accounts (all password `Password123!`)

| Email | Role | What you'll see |
|---|---|---|
| `admin@test.com` | Admin | Verification queue (one retailer PENDING_REVIEW), admin dashboards |
| `retailer@test.com` | Buyer | **VERIFIED** retailer — full buying loop incl. age-restricted checkout |
| `wholesaler@test.com` | Seller | Catalog, tier-pricing editor, CSV import |
| `warehouse@test.com` | Warehouse | Receiving + barcode scan screens |
| `analyst@test.com` | Analyst | Read-mostly dashboards |

## 6. Five-minute smoke test (in order)

1. `retailer@test.com` → Marketplace → click a product → **product detail**
   page (supplier comparison, BEST PRICE, tier ladder) → Add to cart.
2. Cart → Checkout → succeeds (this retailer is VERIFIED). Order lands under
   Orders; **Smart Reorder** button is on the Orders page.
3. `admin@test.com` → Admin → Verification queue → approve or reject the
   pending retailer (reason required on reject).
4. `wholesaler@test.com` → Products → Import Catalog → upload a CSV →
   map → preview (dry-run) → import.
5. Settings → Notifications / Locations / Verification all load and save.

## Ongoing operations

- **Auto-deploy:** every push to `main` triggers a production build.
- **Schema changes:** land in `prisma/schema.prisma`; `db push` applies them
  on the next deploy (see the decision log in `docs/STATUS.md` for why
  `db push` instead of `migrate deploy`, and the owed baseline follow-up).
- **Semantic search upgrade (optional):** Neon dashboard → SQL editor → run
  `prisma/migrations/add_vector_extension.sql` (starts with
  `CREATE EXTENSION IF NOT EXISTS vector`). Until then search is
  keyword-only — the vector path fails soft by design.
- **Re-seed from scratch:** wipe the database (Neon → SQL editor →
  `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`) and redeploy.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Build fails in `prisma db push` | `DATABASE_URL` is pooled — use the unpooled value (step 2.2) |
| 500 or redirect loop on login | `AUTH_SECRET`/`NEXTAUTH_SECRET` missing |
| Verification/reset emails never arrive | `RESEND_API_KEY` not set — links are logged instead (Deployments → Functions → logs, event `email_send_dev`/`email_send_skipped`) |
| Webhook ingest 401s | `WEBHOOK_SECRET` unset or still the demo literal |
| Empty marketplace | Seed skipped because DB wasn't empty — see "Re-seed from scratch" |
