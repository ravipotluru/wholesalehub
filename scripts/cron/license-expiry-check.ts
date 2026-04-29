/**
 * Daily license expiry watcher.
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
 */

import { PrismaClient } from '@prisma/client';
import pino from 'pino';

const prisma = new PrismaClient();
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

/** Notification thresholds in days before expiry. */
const WARNING_THRESHOLDS = [30, 14, 7] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfUtcDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

async function suspendExpired(): Promise<number> {
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

async function notifyApproachingExpiry(): Promise<number> {
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

    // Notify users belonging to this wholesaler (the contact + warehouse staff).
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
            title: `License expires in ${days} day${days === 1 ? '' : 's'}`,
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

async function main() {
  logger.info({ event: 'license_expiry_check_start' });

  const suspended = await suspendExpired();
  const notified = await notifyApproachingExpiry();

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
