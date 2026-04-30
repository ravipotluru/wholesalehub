/**
 * Daily license expiry watcher (CLI entry point).
 *
 * - Auto-flips wholesalers whose `licenseExpiry` has passed to
 *   `PENDING_APPROVAL` (so they cannot keep selling on an expired license).
 * - Creates an in-app notification for warehouse/admin users at the supplier
 *   30, 14, and 7 days before expiry so the supplier has time to renew.
 *
 * Designed to be invoked by a cron (GitHub Actions schedule, Vercel Cron, or
 * a Kubernetes CronJob). Idempotent — safe to run multiple times per day; we
 * dedupe notifications by (userId, type, metadata.wholesalerId, day).
 *
 * Usage: `npx tsx scripts/cron/license-expiry-check.ts`
 *
 * The actual work lives in `src/lib/cron/license-expiry.ts` so the Vercel
 * Cron route at `src/app/api/cron/license-expiry-check/route.ts` and this
 * script stay in sync. Touch the shared module, not this wrapper.
 */

import { PrismaClient } from '@prisma/client';
import pino from 'pino';
// Use a relative import (rather than the `@/` alias) because tsx executes
// this script directly without the Next.js tsconfig-paths shim being loaded
// via a bundler. The `@/` alias resolves at build/test time but not under
// `npx tsx scripts/...`.
import { runLicenseExpiryCheck } from '../../src/lib/cron/license-expiry';

const prisma = new PrismaClient();
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

async function main() {
  logger.info({ event: 'license_expiry_check_start' });

  const { suspended, notified } = await runLicenseExpiryCheck(prisma, logger);

  logger.info({
    event: 'license_expiry_check_done',
    suspended,
    notified,
  });
}

main()
  .catch((err: unknown) => {
    logger.error({
      event: 'license_expiry_check_failed',
      error: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
