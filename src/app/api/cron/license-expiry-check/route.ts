import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { timingSafeEqualHex, hmacSha256Hex } from '@/lib/hmac';
import { runLicenseExpiryCheck } from '@/lib/cron/license-expiry';

/**
 * Vercel Cron entry point for the daily license-expiry watcher.
 *
 * Schedule is wired in `vercel.json` (`/api/cron/license-expiry-check` daily
 * at 04:00 UTC, matching the existing GitHub Actions cron in
 * `.github/workflows/license-expiry-cron.yml`). Either path can run on its
 * own; running both is harmless because the notification creation is
 * deduped by (user, wholesaler, day).
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. We accept
 * that header and verify it via the same constant-time hex compare we use
 * for webhook HMACs (`timingSafeEqualHex`) so a length-leak doesn't reveal
 * the secret. The header value is hex'd on both sides before comparison,
 * giving us identical-length inputs even if the configured secret length
 * shifts between deploys.
 *
 * The actual work lives in `@/lib/cron/license-expiry`. Do not duplicate
 * suspension/notification logic here — touch the shared module and both the
 * GH Action script and this route pick it up.
 */

// Force Node runtime — Prisma needs Node, not Edge.
export const runtime = 'nodejs';
// Don't try to cache cron responses.
export const dynamic = 'force-dynamic';

function verifyCronSecret(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length === 0) return false;

  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  const presented = header.slice('Bearer '.length).trim();
  if (presented.length === 0) return false;

  // Hash both sides to a fixed-length hex digest before comparison so the
  // timing-safe path is operating on equal-length inputs regardless of the
  // configured secret length. This also avoids leaking the secret length
  // through the early-return-on-length-mismatch in `timingSafeEqualHex`.
  const expectedHash = hmacSha256Hex('cron-auth', expected);
  const presentedHash = hmacSha256Hex('cron-auth', presented);
  return timingSafeEqualHex(expectedHash, presentedHash);
}

/** GET /api/cron/license-expiry-check — Vercel Cron handler. */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    logger.warn({ event: 'cron_license_expiry_unauthorized' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info({ event: 'cron_license_expiry_start' });

  try {
    const { suspended, notified } = await runLicenseExpiryCheck(prisma, logger);
    logger.info({
      event: 'cron_license_expiry_done',
      suspended,
      notified,
    });
    return NextResponse.json({ suspended, notified }, { status: 200 });
  } catch (error) {
    logger.error({
      event: 'cron_license_expiry_failed',
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'License expiry check failed' },
      { status: 500 },
    );
  }
}
