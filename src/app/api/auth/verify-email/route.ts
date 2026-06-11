import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { verifyEmailSchema } from '@/lib/validators';
import { consumeToken, issueToken } from '@/lib/tokens';
import { sendActionEmail, appBaseUrl } from '@/lib/mailer';
import { getAuthedUser } from '@/lib/session';

/**
 * GET /api/auth/verify-email?token=… — the emailed link target. Consumes
 * the token, stamps emailVerifiedAt, redirects to the confirm page.
 * Redirect-with-status (not JSON) because the click comes from a mail client.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const confirmUrl = new URL('/verify-email/confirm', appBaseUrl());

  if (token.length >= 20) {
    const consumed = await consumeToken(token, 'EMAIL_VERIFICATION');
    if (consumed) {
      await prisma.user.update({
        where: { id: consumed.userId },
        data: { emailVerifiedAt: new Date() },
      });
      logger.info({ event: 'email_verified', userId: consumed.userId });
      confirmUrl.searchParams.set('verified', '1');
      return NextResponse.redirect(confirmUrl);
    }
  }

  confirmUrl.searchParams.set('verified', '0');
  return NextResponse.redirect(confirmUrl);
}

/**
 * POST /api/auth/verify-email — resend the verification email for the
 * signed-in user (the "Resend" button on /verify-email). Body optional;
 * accepts {token} too for SPA-style confirmation without the redirect.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const limit = await rateLimit({ key: `verify-email:${ip}`, limit: 5, windowSec: 600 });
  if (!limit.ok) {
    return apiError({
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Try again shortly.',
    });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // empty body = resend flow; fall through
  }

  const tokenParse = verifyEmailSchema.safeParse(body);
  if (tokenParse.success) {
    const consumed = await consumeToken(tokenParse.data.token, 'EMAIL_VERIFICATION');
    if (!consumed) {
      return apiError({
        status: 400,
        code: 'TOKEN_INVALID',
        message: 'Verification link is invalid or expired.',
      });
    }
    await prisma.user.update({
      where: { id: consumed.userId },
      data: { emailVerifiedAt: new Date() },
    });
    logger.info({ event: 'email_verified', userId: consumed.userId });
    return NextResponse.json({ ok: true });
  }

  // No token → resend for the signed-in user.
  const user = await getAuthedUser();
  if (!user) {
    return apiError({ status: 401, code: 'UNAUTHORIZED', message: 'Sign in required.' });
  }

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, emailVerifiedAt: true },
  });
  if (!row) {
    return apiError({ status: 404, code: 'USER_NOT_FOUND', message: 'User not found.' });
  }
  if (row.emailVerifiedAt) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const raw = await issueToken(user.id, 'EMAIL_VERIFICATION');
  await sendActionEmail({
    to: row.email,
    kind: 'email_verification',
    subject: 'Verify your WholesaleHub email',
    actionUrl: `${appBaseUrl()}/api/auth/verify-email?token=${raw}`,
  });

  logger.info({ event: 'email_verification_resent', userId: user.id });
  return NextResponse.json({ ok: true });
}
