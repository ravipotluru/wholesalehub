import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import {
  readPreferences,
  notificationPreferencesSchema,
  enforceLocks,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '@/lib/notification-prefs';

/** GET /api/users/me/notification-prefs — caller's prefs (or defaults). */
export async function GET() {
  const user = await getAuthedUser();
  if (!user) {
    return apiError({ status: 401, code: 'UNAUTHORIZED', message: 'Sign in required.' });
  }

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { notificationPreferences: true, email: true, phone: true },
  });

  if (!row) {
    return apiError({ status: 404, code: 'USER_NOT_FOUND', message: 'User not found.' });
  }

  const preferences = readPreferences(row.notificationPreferences);
  return NextResponse.json({
    preferences,
    contact: { email: row.email, phone: row.phone ?? null },
    defaults: DEFAULT_NOTIFICATION_PREFERENCES,
  });
}

/** PATCH /api/users/me/notification-prefs — replace prefs in full. */
export async function PATCH(request: NextRequest) {
  const user = await getAuthedUser();
  if (!user) {
    return apiError({ status: 401, code: 'UNAUTHORIZED', message: 'Sign in required.' });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError({ status: 400, code: 'INVALID_JSON', message: 'Body must be JSON.' });
  }

  const validation = notificationPreferencesSchema.safeParse(body);
  if (!validation.success) {
    return apiError({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'Notification preference shape is invalid.',
      details: { fieldErrors: validation.error.flatten().fieldErrors },
    });
  }

  const preferences = enforceLocks(validation.data);

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { notificationPreferences: preferences },
    });
  } catch (error) {
    logger.error({
      event: 'notification_prefs_update_failed',
      userId: user.id,
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'NOTIFICATION_PREFS_UPDATE_FAILED',
      message: 'Failed to save preferences. Please retry.',
    });
  }

  logger.info({ event: 'notification_prefs_updated', userId: user.id });
  return NextResponse.json({ preferences, savedAt: new Date().toISOString() });
}
