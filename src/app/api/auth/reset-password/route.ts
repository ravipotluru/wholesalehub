import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { resetPasswordSchema } from '@/lib/validators';
import { consumeToken } from '@/lib/tokens';

/**
 * POST /api/auth/reset-password — finish the forgot-password flow with the
 * emailed token. Token is single-use and consumed atomically.
 *
 * NOTE on signOutEverywhere: sessions are stateless JWTs, so true remote
 * revocation needs a sessionVersion claim checked in the JWT callback —
 * tracked as a follow-up. We accept the flag now so the UI contract is
 * stable, and clear lockout state on success.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const limit = await rateLimit({ key: `reset-confirm:${ip}`, limit: 10, windowSec: 900 });
  if (!limit.ok) {
    return apiError({
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Try again in a few minutes.',
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError({ status: 400, code: 'INVALID_JSON', message: 'Body must be JSON.' });
  }

  const validation = resetPasswordSchema.safeParse(body);
  if (!validation.success) {
    return apiError({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'Password does not meet requirements.',
      details: { fieldErrors: validation.error.flatten().fieldErrors },
    });
  }
  const { token, password } = validation.data;

  const consumed = await consumeToken(token, 'PASSWORD_RESET');
  if (!consumed) {
    return apiError({
      status: 400,
      code: 'TOKEN_INVALID',
      message: 'Reset link is invalid or expired. Request a new one.',
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: consumed.userId },
    data: {
      passwordHash,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  logger.info({ event: 'password_reset_completed', userId: consumed.userId });
  return NextResponse.json({ ok: true });
}
