/**
 * License-expiry cron logic — shared between two callers:
 *
 *   1. `scripts/cron/license-expiry-check.ts` — invoked by GitHub Actions
 *      and on-demand from the Ops Dispatch workflow.
 *   2. `src/app/api/cron/license-expiry-check/route.ts` — invoked by Vercel
 *      Cron (or a manual `curl` with the `CRON_SECRET` bearer token).
 *
 * Both entry points are kept around because:
 *   - the GH Actions path is the historical source of truth and lets us run
 *     the cron from an environment that already has Postgres reachable;
 *   - the Vercel path runs inside the same Next.js deployment as the API and
 *     is the lowest-friction option once the app is hosted on Vercel.
 *
 * The two MUST stay behaviorally identical, so the suspension + notification
 * logic lives here and both wrappers just call `runLicenseExpiryCheck()`.
 *
 * Behavior:
 *   - Auto-flips wholesalers whose `licenseExpiry` has passed to
 *     `PENDING_APPROVAL` (so they cannot keep selling on an expired license).
 *   - Creates an in-app notification for warehouse/admin users at the
 *     supplier 30, 14, and 7 days before expiry.
 *   - Idempotent — safe to run multiple times per day; we dedupe
 *     notifications by (userId, type, metadata.wholesalerId, day).
 */

import type { PrismaClient } from '@prisma/client';
import type pino from 'pino';

/** Notification thresholds in days before expiry. */
export const WARNING_THRESHOLDS = [30, 14, 7] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfUtcDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

export interface LicenseExpiryResult {
  suspended: number;
  notified: number;
}

/** Logger surface we need — accepts the project pino logger or a vanilla pino. */
type LoggerLike = Pick<pino.Logger, 'info' | 'warn'>;

/**
 * Run the daily license expiry check. Returns counts so callers can include
 * them in their response / log line.
 *
 * Caller owns the Prisma client lifecycle — we do not call `$disconnect()`
 * here because the API route reuses the long-lived global client.
 */
export async function runLicenseExpiryCheck(
  prisma: PrismaClient,
  logger: LoggerLike,
): Promise<LicenseExpiryResult> {
  const suspended = await suspendExpired(prisma, logger);
  const notified = await notifyApproachingExpiry(prisma);
  return { suspended, notified };
}

async function suspendExpired(prisma: PrismaClient, logger: LoggerLike): Promise<number> {
  const now = new Date();
  const expired = await prisma.wholesaler.findMany({
    where: {
      licenseExpiry: { lt: now, not: null },
      status: 'ACTIVE',
    },
    select: { id: true, name: true, licenseExpiry: true, licenseNumber: true },
  });

  if (expired.length === 0) return 0;

  await prisma.wholesaler.updateMany({
    where: { id: { in: expired.map((w) => w.id) } },
    data: { status: 'PENDING_APPROVAL' },
  });

  for (const w of expired) {
    logger.warn({
      event: 'wholesaler_license_expired',
      wholesalerId: w.id,
      name: w.name,
      licenseNumber: w.licenseNumber,
      licenseExpiry: w.licenseExpiry,
    });
  }

  return expired.length;
}

async function notifyApproachingExpiry(prisma: PrismaClient): Promise<number> {
  let totalNotified = 0;
  const today = startOfUtcDay(new Date());

  for (const days of WARNING_THRESHOLDS) {
    const target = new Date(today.getTime() + days * MS_PER_DAY);
    const targetEnd = new Date(target.getTime() + MS_PER_DAY);

    const wholesalers = await prisma.wholesaler.findMany({
      where: {
        status: 'ACTIVE',
        licenseExpiry: { gte: target, lt: targetEnd },
      },
      select: { id: true, name: true, licenseExpiry: true },
    });

    if (wholesalers.length === 0) continue;

    for (const w of wholesalers) {
      const recipients = await prisma.user.findMany({
        where: { wholesalerId: w.id, status: 'ACTIVE' },
        select: { id: true },
      });

      // Also notify admins so platform ops sees it.
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', status: 'ACTIVE' },
        select: { id: true },
      });

      const allRecipients = [...recipients, ...admins];
      if (allRecipients.length === 0) continue;

      const dayKey = startOfUtcDay(new Date()).toISOString().slice(0, 10);

      for (const u of allRecipients) {
        // Idempotency: dedupe per (user, wholesaler, threshold, day).
        // We can't use a unique constraint without a schema change, so we
        // do a findFirst gate. Acceptable for low-volume daily cron.
        const exists = await prisma.notification.findFirst({
          where: {
            userId: u.id,
            type: 'LICENSE_EXPIRY',
            metadata: {
              path: ['wholesalerId'],
              equals: w.id,
            },
            createdAt: { gte: today, lt: new Date(today.getTime() + MS_PER_DAY) },
          },
        });
        if (exists) continue;

        await prisma.notification.create({
          data: {
            userId: u.id,
            type: 'LICENSE_EXPIRY',
            title: `License expires in ${days} day${Number(days) === 1 ? '' : 's'}`,
            message:
              `${w.name} license expires on ${w.licenseExpiry?.toISOString().slice(0, 10)}. ` +
              `Renew before then to avoid an automatic suspension.`,
            actionUrl: `/admin/suppliers/${w.id}`,
            metadata: {
              wholesalerId: w.id,
              daysUntilExpiry: days,
              dayKey,
            },
          },
        });
        totalNotified++;
      }
    }
  }

  return totalNotified;
}
