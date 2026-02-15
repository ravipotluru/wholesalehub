'use client';

import { useState } from 'react';
import {
  Bell,
  BellOff,
  ShoppingCart,
  DollarSign,
  Package,
  AlertTriangle,
  Info,
  Check,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useNotifications, useMarkAsRead, useMarkAllRead } from '@/hooks/useNotifications';

const filterTabs = [
  { label: 'All', value: 'all' },
  { label: 'Orders', value: 'ORDER', icon: <ShoppingCart className="h-4 w-4" /> },
  { label: 'Prices', value: 'PRICE', icon: <DollarSign className="h-4 w-4" /> },
  { label: 'Stock', value: 'STOCK', icon: <Package className="h-4 w-4" /> },
  { label: 'System', value: 'SYSTEM', icon: <Info className="h-4 w-4" /> },
];

function getNotificationIcon(type: string) {
  switch (type) {
    case 'ORDER':
      return (
        <div className="w-10 h-10 bg-brand-blue/10 rounded-full flex items-center justify-center flex-shrink-0">
          <ShoppingCart className="h-5 w-5 text-brand-blue" />
        </div>
      );
    case 'PRICE':
      return (
        <div className="w-10 h-10 bg-success/10 rounded-full flex items-center justify-center flex-shrink-0">
          <DollarSign className="h-5 w-5 text-success" />
        </div>
      );
    case 'STOCK':
      return (
        <div className="w-10 h-10 bg-brand-orange/10 rounded-full flex items-center justify-center flex-shrink-0">
          <Package className="h-5 w-5 text-brand-orange" />
        </div>
      );
    case 'SYSTEM':
      return (
        <div className="w-10 h-10 bg-brand-teal/10 rounded-full flex items-center justify-center flex-shrink-0">
          <Info className="h-5 w-5 text-brand-teal" />
        </div>
      );
    default:
      return (
        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="h-5 w-5 text-gray-400" />
        </div>
      );
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useNotifications({
    type: activeTab,
    page,
    limit: 10,
  });
  const markAsRead = useMarkAsRead();
  const markAllRead = useMarkAllRead();

  function handleTabChange(value: string) {
    setActiveTab(value);
    setPage(1);
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertTriangle className="h-12 w-12 text-status-error mb-4" />
        <h3 className="text-lg font-semibold text-dark mb-1">Failed to load notifications</h3>
        <p className="text-sm text-gray-500">Please try refreshing the page.</p>
      </div>
    );
  }

  const notifications = data?.notifications ?? [];
  const pagination = data?.pagination;
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-blue/10 rounded-lg flex items-center justify-center">
            <Bell className="h-5 w-5 text-brand-blue" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-dark">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-sm text-gray-500">{unreadCount} unread</p>
            )}
          </div>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllRead.mutate()}
            isLoading={markAllRead.isPending}
            leftIcon={<Check className="h-4 w-4" />}
          >
            Mark All Read
          </Button>
        )}
      </div>

      {/* Filter Tabs */}
      <Tabs tabs={filterTabs} activeTab={activeTab} onChange={handleTabChange} />

      {/* Notifications List */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} padding="md">
              <div className="flex items-start gap-4">
                <Skeleton variant="circular" className="w-10 h-10" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="w-48 h-5" />
                  <Skeleton className="w-full h-4" />
                  <Skeleton className="w-32 h-3" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <Card padding="lg">
          <div className="flex flex-col items-center justify-center py-12">
            <BellOff className="h-12 w-12 text-gray-300 mb-3" />
            <h3 className="text-lg font-semibold text-dark mb-1">No notifications</h3>
            <p className="text-sm text-gray-500">
              {activeTab === 'all'
                ? 'You are all caught up!'
                : `No ${activeTab.toLowerCase()} notifications found.`}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <Card
              key={notification.id}
              padding="md"
              className={cn(
                'transition-colors',
                !notification.isRead && 'border-l-4 border-l-brand-teal bg-brand-teal/5'
              )}
            >
              <div className="flex items-start gap-4">
                {getNotificationIcon(notification.type)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3
                      className={cn(
                        'text-sm text-dark',
                        !notification.isRead ? 'font-semibold' : 'font-medium'
                      )}
                    >
                      {notification.title}
                    </h3>
                    {!notification.isRead && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markAsRead.mutate([notification.id])}
                        className="flex-shrink-0 text-xs"
                      >
                        Mark Read
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {formatDate(notification.createdAt)}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              leftIcon={<ChevronLeft className="h-4 w-4" />}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
              rightIcon={<ChevronRight className="h-4 w-4" />}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
