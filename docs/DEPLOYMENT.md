# WholesaleHub — Production Deployment Runbook

> Step-by-step setup for a real production deployment on Vercel with Neon
> Postgres, Upstash Redis, Cloudflare DNS/WAF, Sentry, and Resend. Each step
> is a single concrete action; do them in order. Skipping is fine for items
> marked optional, but the "Required" steps gate the launch.

This is the operator-facing companion to `vercel.json` and
`.env.production.template`. If a value goes into Vercel, it should also be
documented in `.env.production.template`.

## Prerequisites

- A GitHub repository owner account with admin rights on this repo.
- A custom domain you control (e.g. `app.wholesalehub.com`).
- A payment method on file with Vercel, Neon, Upstash, Sentry, Resend, and
  Cloudflare. All offer free tiers that cover the early launch — expect to
  hit paid tiers within a few thousand orders/month.
- `openssl` available locally for generating secrets.

## 1. Provision Neon Postgres (required)

1. Sign up at <https://neon.tech>.
2. Create a project named `wholesalehub`. Choose region `AWS US East
   (N. Virginia) — us-east-1` to colocate with the Vercel `iad1` region.
3. In the project, create a branch `main` and a database `wholesalehub`.
4. Open **Connection Details → Pooled connection**. Copy the URL — it will
   look like `postgresql://USER:PASS@HOST/wholesalehub?sslmode=require`.
   This is your `DATABASE_URL`.
5. Apply the Prisma schema. From a local checkout of this repo, with
   `DATABASE_URL` exported:
   ```bash
   npx prisma migrate deploy
   ```
   `migrate deploy` runs the pending migrations without prompting; this is
   the production-safe version of `migrate dev`.
6. Apply the manual pgvector migration (one-time):
   ```bash
   psql "$DATABASE_URL" -f prisma/migrations/add_vector_extension.sql
   ```
   Adjust the path if the migration file lives elsewhere — search for the
   `CREATE EXTENSION IF NOT EXISTS vector` line.
7. Verify the schema landed:
   ```bash
   npx prisma db pull --print | head -50
   ```

> Neon includes Point-in-Time Recovery (PITR) on paid tiers. Confirm your
> retention window in **Project → Settings → Branches**; 7 days is the
> minimum for a launchable production system.

## 2. Provision Upstash Redis (required)

1. Sign up at <https://upstash.com>.
2. Create a Redis database named `wholesalehub-prod`. Region: `us-east-1`.
3. Enable **TLS** and **Eviction**. Default eviction policy `noeviction` is
   fine — we use Redis only for rate-limit buckets and caches that already
   set TTLs.
4. Copy the **TLS connection string** (`rediss://...`). This is `REDIS_URL`.

## 3. Create the Vercel project (required)

1. Sign in at <https://vercel.com> with your GitHub account.
2. Click **Add New → Project** and import this repository.
3. Vercel auto-detects Next.js. Leave the build settings on defaults — the
   `framework: "nextjs"` and `regions: ["iad1"]` settings live in
   `vercel.json` at the repo root.
4. Do **not** deploy yet. Click **Environment Variables** first.

## 4. Paste environment variables (required)

Open `.env.production.template` at the repo root. For each variable in that
file:

1. Decide which environment scope applies (most are Production-only;
   `NEXTAUTH_URL` and `NEXT_PUBLIC_*` differ per environment).
2. Generate the value. Where the template comment says
   `openssl rand -hex 32`, run that locally and paste the output.
3. Add it via Vercel's UI (**Settings → Environment Variables**) or via:
   ```bash
   vercel env add DATABASE_URL production
   ```

Critical values to generate fresh, not reuse:

- `NEXTAUTH_SECRET` — `openssl rand -base64 32`
- `WEBHOOK_SECRET` — `openssl rand -hex 32`
- `CRON_SECRET` — `openssl rand -hex 32`

Do not reuse any of these between `Preview` and `Production` — Vercel scopes
support per-environment values for exactly this reason.

## 5. Cloudflare in front (required)

Cloudflare provides DNS, WAF, DDoS protection, and a CDN layer in front of
Vercel. The official guide is at
<https://vercel.com/guides/using-cloudflare-with-vercel>.

1. Add your domain to Cloudflare. Update the registrar to point to the
   Cloudflare nameservers.
2. In Cloudflare DNS, add a CNAME `app` pointing to `cname.vercel-dns.com`
   (or follow Vercel's domain setup wizard which gives you the exact
   target).
3. In Cloudflare **SSL/TLS**, set the encryption mode to **Full (strict)**.
4. In **Security → WAF**, enable the **Cloudflare Managed Ruleset** and
   the **OWASP Core Ruleset**. Start in "Log" mode for 24 hours, review
   false positives, then flip to "Block".
5. In **Speed → Optimization**, leave Brotli on; Vercel already gzips so
   double-compression is fine.

## 6. Sentry project (required)

1. Sign up at <https://sentry.io>. Create a project for the **Next.js**
   framework. Name it `wholesalehub`.
2. Copy the **DSN** from **Settings → Client Keys (DSN)**. Set both
   `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` in Vercel — same value unless
   you've split client and server into two Sentry projects.
3. Create an auth token at <https://sentry.io/settings/account/api/auth-tokens/>
   with scopes `project:releases` and `project:write`. Set it as
   `SENTRY_AUTH_TOKEN` in Vercel. This unlocks source-map upload during
   the Vercel build so stack traces deminify in the Sentry UI.
4. Set `SENTRY_ORG` and `SENTRY_PROJECT` to your slug values from the URL.

## 7. Resend account (required for transactional email)

1. Sign up at <https://resend.com>.
2. **Domains → Add Domain** for the domain you'll send from
   (e.g. `wholesalehub.com`). Add the DKIM, SPF, and DMARC records to
   Cloudflare DNS. Wait for verification (usually < 15 minutes).
3. **API Keys → Create API Key** with **Sending access**. Copy and paste
   into Vercel as `RESEND_API_KEY`.
4. Set `RESEND_FROM_EMAIL` to a verified address on your domain
   (e.g. `no-reply@wholesalehub.com`).
5. Set `RESEND_REPLY_TO` to a real shared inbox so replies don't bounce.

## 8. First deploy

Once env vars are in place:

1. Push to `main` to trigger a **Production** deploy.
2. Push to any other branch (or open a PR) to trigger a **Preview**
   deploy. Each PR gets its own URL — link it from the PR description.

Watch the build in **Vercel → Deployments**. The Sentry build plugin
(if configured in `next.config.js`) will upload source maps and create a
release. Confirm at <https://sentry.io/organizations/YOUR_ORG/releases/>.

## 9. Post-deploy — wire health monitoring

1. Note the production URL (e.g. `https://app.wholesalehub.com`).
2. In GitHub, **Settings → Secrets and variables → Actions**, set:
   - `PROD_HEALTH_URL` = `https://app.wholesalehub.com/api/health`
   - `ALERT_WEBHOOK_URL` = your Slack/Teams/Discord webhook (optional)
3. Open the **Actions** tab and run the **Health Monitor** workflow
   manually. It should return 200 with `database: connected` and
   `redis: connected`.
4. The workflow now runs on a 10-minute schedule. Failures post to the
   alert webhook and surface in the GH Actions UI.

## 10. Cron verification

1. In Vercel, go to your project's **Settings → Cron Jobs** tab.
2. Confirm `/api/cron/license-expiry-check` is listed with schedule
   `0 4 * * *` (daily at 04:00 UTC).
3. Click **Run Now** to trigger an out-of-band invocation. The response
   should be `{ "suspended": N, "notified": N }` (both 0 in a fresh DB).
4. The route requires the `CRON_SECRET` bearer token. Vercel injects it
   automatically for cron-initiated runs; if you want to invoke it
   manually:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" \
     https://app.wholesalehub.com/api/cron/license-expiry-check
   ```

> **Caveat — anomaly digest cron.** `vercel.json` also schedules
> `/api/cron/anomaly-digest` for Mondays at 12:00 UTC. The route does not
> exist yet — it's a placeholder until the anomaly-digest writer ships.
> Until then, Vercel will log a 404 on each Monday run; you can safely
> ignore those, or remove the entry from `vercel.json` and re-add it when
> the route lands. Track this with the next-PR work in the
> "Wire 6 admin UIs to real DB data" P0 item.

You can now retire the `License Expiry Watcher` GitHub Actions workflow
(`.github/workflows/license-expiry-cron.yml`) if you'd like — Vercel Cron
covers the same job. We recommend keeping it running for a week or two as a
belt-and-suspenders failsafe; the script and the route both call the same
shared logic in `src/lib/cron/license-expiry.ts`, and the notification
creation is deduped by (user, wholesaler, day), so running both is safe.

## 11. DNS cutover

1. In Vercel **Settings → Domains**, add `app.wholesalehub.com`. Vercel
   will issue an SSL certificate via Let's Encrypt automatically.
2. Verify the CNAME at Cloudflare points to `cname.vercel-dns.com`.
3. In Cloudflare DNS, ensure the proxy (orange cloud) is **on** for the
   `app` record so traffic routes through the Cloudflare WAF.
4. Hit `https://app.wholesalehub.com/api/health` — expect 200 + JSON.
5. Update `NEXTAUTH_URL` in Vercel env to the new domain and redeploy.

## 12. Backup verification (required before launch)

A backup you've never restored is not a backup. Before flipping the public
launch switch:

1. In Neon, open **Branches** for the `wholesalehub` project. Confirm PITR
   is enabled and note the retention window (paid tier: 7+ days).
2. Create a test branch from a point in time 1 hour ago: **Branches →
   Create branch → From timestamp**.
3. Connect to the test branch with a separate `DATABASE_URL` and run a
   read-only sanity check:
   ```bash
   psql "$TEST_DATABASE_URL" -c "SELECT COUNT(*) FROM wholesalers;"
   ```
4. Delete the test branch — keeping it costs storage.
5. Document the restore procedure in your team's incident runbook.

> **Vercel build caching for the monorepo case.** WholesaleHub today is a
> single-package repo, so Vercel's default Next.js build cache covers it.
> If you ever split into a Turborepo / Nx monorepo, set
> `installCommand` and `buildCommand` in `vercel.json` to use Turbo's
> remote cache (`npx turbo run build --token=...`) before re-deploying.

## Done

You should now have:

- Production URL serving `https://app.wholesalehub.com`
- Health endpoint green; GH Actions monitor pinging every 10 minutes
- License-expiry cron scheduled for 04:00 UTC daily
- Sentry receiving errors with deminified stack traces
- Resend verified for transactional sending
- Cloudflare WAF in block mode
- Neon PITR backup verified by test restore

For ongoing runbook operations (rerunning audits, kicking the license
cron manually, on-call playbook), see `.github/workflows/ops-dispatch.yml`
and the **Actions → Run workflow** UI.
