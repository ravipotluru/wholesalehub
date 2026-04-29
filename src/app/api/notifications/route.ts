import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';

const patchSchema = z.union([
  z.object({ markAllRead: z.literal(true) }),
  z.object({
    notificationIds: z.array(z.string().min(1)).min(1).max(500),
    markAllRead: z.literal(false).optional(),
  }),
]);

/** GET /api/notifications — List notifications for current user */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const type = searchParams.get('type');
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1),
      100,
    );

    const where: Prisma.NotificationWhereInput = { userId: user.id };
    if (unreadOnly) where.isRead = false;
    if (type && type !== 'all') where.type = type;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: user.id, isRead: false } }),
    ]);

    return NextResponse.json({
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ event: 'notifications_get_error', error: (error as Error).message });
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

/** PATCH /api/notifications — Mark notifications as read */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = patchSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Provide notificationIds or markAllRead' },
        { status: 400 }
      );
    }

    if ('markAllRead' in validation.data && validation.data.markAllRead === true) {
      const result = await prisma.notification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true },
      });
      return NextResponse.json({
        message: 'All notifications marked as read',
        updatedCount: result.count,
      });
    }

    const ids = (validation.data as { notificationIds: string[] }).notificationIds;
    // Scope by userId to prevent marking other users' notifications.
    const result = await prisma.notification.updateMany({
      where: { id: { in: ids }, userId: user.id },
      data: { isRead: true },
    });

    return NextResponse.json({
      message: `${result.count} notification(s) marked as read`,
      updatedCount: result.count,
    });
  } catch (error) {
    logger.error({ event: 'notifications_patch_error', error: (error as Error).message });
    return NextResponse.json(
      { error: 'Failed to update notifications' },
      { status: 500 }
    );
  }
}
