import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { requestResetSchema } from '@/lib/validators';
import { issueToken } from '@/lib/tokens';
import { sendActionEmail, appBaseUrl } from '@/lib/mailer';

/**
 * POST /api/auth/request-reset — start the forgot-password flow.
 *
 * ALWAYS returns 200 whether or not the email matches an account — a
 * distinguishable response would let attackers enumerate registered emails.
 * Same reason the work happens after the response shape is fixed.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const limit = await rateLimit({ key: `reset-request:${ip}`, limit: 5, windowSec: 900 });
  if (!limit.ok) {
    return apiError({
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Too many reset requests. Try again in a few minutes.',
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError({ status: 400, code: 'INVALID_JSON', message: 'Body must be JSON.' });
  }

  const validation = requestResetSchema.safeParse(body);
  if (!validation.success) {
    return apiError({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'A valid email is required.',
    });
  }
  const email = validation.data.email.toLowerCase();

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    });

    if (user && user.status === 'ACTIVE') {
      const raw = await issueToken(user.id, 'PASSWORD_RESET');
      await sendActionEmail({
        to: email,
        kind: 'password_reset',
        subject: 'Reset your WholesaleHub password',
        actionUrl: `${appBaseUrl()}/reset-password/new?token=${raw}`,
      });
      logger.info({ event: 'password_reset_requested', userId: user.id });
    } else {
      // Log for ops; the caller sees the identical success body either way.
      logger.info({ event: 'password_reset_requested_unknown_email', email });
    }
  } catch (error) {
    // Still return 200 — failing loudly here would leak which branch ran.
    logger.error({ event: 'password_reset_request_failed', error: (error as Error).message });
  }

  return NextResponse.json({
    ok: true,
    message: 'If that email matches an account, a reset link is on its way.',
  });
}
