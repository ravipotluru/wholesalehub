import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

interface MockNotification {
  id: string;
  type: 'ORDER' | 'PRICE' | 'STOCK' | 'SYSTEM';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  href?: string;
}

const mockNotifications: MockNotification[] = [
  {
    id: 'notif-1',
    type: 'ORDER',
    title: 'Order Confirmed',
    message: 'Your order ORD-2024-001 with Smoky Mountain Wholesale has been confirmed and is being processed.',
    isRead: false,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    href: '/orders',
  },
  {
    id: 'notif-2',
    type: 'PRICE',
    title: 'Price Drop Alert',
    message: 'RAZ CA6000 Disposable price dropped by 15% from Patriot Wholesale. New price: $8.50/unit.',
    isRead: false,
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    href: '/marketplace',
  },
  {
    id: 'notif-3',
    type: 'STOCK',
    title: 'Low Stock Warning',
    message: 'Elf Bar BC5000 from Delta Distributors is running low (12 units remaining). Reorder soon.',
    isRead: false,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    href: '/marketplace',
  },
  {
    id: 'notif-4',
    type: 'ORDER',
    title: 'Order Shipped',
    message: 'Your order ORD-2024-002 has been shipped via FedEx. Tracking: 7891234567890.',
    isRead: true,
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    href: '/orders',
  },
  {
    id: 'notif-5',
    type: 'SYSTEM',
    title: 'Maintenance Scheduled',
    message: 'System maintenance is scheduled for Saturday 2:00 AM - 4:00 AM EST. Brief downtime expected.',
    isRead: true,
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'notif-6',
    type: 'PRICE',
    title: 'New Supplier Pricing',
    message: 'Gulf Coast Wholesale has added competitive pricing for 45 products in the Glass category.',
    isRead: false,
    createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    href: '/marketplace',
  },
  {
    id: 'notif-7',
    type: 'STOCK',
    title: 'Back in Stock',
    message: 'Lost Mary OS5000 is back in stock at Smoky Mountain Wholesale. 500 units available.',
    isRead: true,
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    href: '/marketplace',
  },
  {
    id: 'notif-8',
    type: 'ORDER',
    title: 'Order Delivered',
    message: 'Your order ORD-2024-003 has been delivered. Please confirm receipt in your order dashboard.',
    isRead: true,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    href: '/orders',
  },
  {
    id: 'notif-9',
    type: 'SYSTEM',
    title: 'New Feature: Barcode Scanner',
    message: 'We have launched barcode scanning for inventory receiving. Download the mobile app to get started.',
    isRead: true,
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'notif-10',
    type: 'PRICE',
    title: 'Weekly Price Report',
    message: 'Your weekly price comparison report is ready. 8 products have better prices from alternative suppliers.',
    isRead: false,
    createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    href: '/marketplace',
  },
];

/** GET /api/notifications — List notifications for current user */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const type = searchParams.get('type');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    let filtered = [...mockNotifications];

    if (unreadOnly) {
      filtered = filtered.filter((n) => !n.isRead);
    }

    if (type && type !== 'all') {
      filtered = filtered.filter((n) => n.type === type.toUpperCase());
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const paginated = filtered.slice(start, start + limit);
    const unreadCount = mockNotifications.filter((n) => !n.isRead).length;

    return NextResponse.json({
      notifications: paginated,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Notifications GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

/** PATCH /api/notifications — Mark notifications as read */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as {
      notificationIds?: string[];
      markAllRead?: boolean;
    };

    if (body.markAllRead) {
      mockNotifications.forEach((n) => {
        n.isRead = true;
      });
      return NextResponse.json({
        message: 'All notifications marked as read',
        updatedCount: mockNotifications.length,
      });
    }

    if (body.notificationIds && body.notificationIds.length > 0) {
      let updatedCount = 0;
      mockNotifications.forEach((n) => {
        if (body.notificationIds!.includes(n.id)) {
          n.isRead = true;
          updatedCount++;
        }
      });
      return NextResponse.json({
        message: `${updatedCount} notification(s) marked as read`,
        updatedCount,
      });
    }

    return NextResponse.json(
      { error: 'Provide notificationIds or markAllRead' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Notifications PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update notifications' },
      { status: 500 }
    );
  }
}
