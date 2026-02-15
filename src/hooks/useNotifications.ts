'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface Notification {
  id: string;
  type: 'ORDER' | 'PRICE' | 'STOCK' | 'SYSTEM';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  href?: string;
}

interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface NotificationsOptions {
  unreadOnly?: boolean;
  type?: string;
  page?: number;
  limit?: number;
}

/** Fetch notifications list with optional filters */
export function useNotifications(options?: NotificationsOptions) {
  const params = new URLSearchParams();
  if (options?.unreadOnly) params.set('unreadOnly', 'true');
  if (options?.type && options.type !== 'all') params.set('type', options.type);
  if (options?.page) params.set('page', String(options.page));
  if (options?.limit) params.set('limit', String(options.limit));

  return useQuery<NotificationsResponse>({
    queryKey: ['notifications', options?.unreadOnly, options?.type, options?.page, options?.limit],
    queryFn: async () => {
      const res = await fetch(`/api/notifications?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch notifications');
      return res.json();
    },
  });
}

/** Fetch just the unread count, refetching every 30 seconds */
export function useUnreadCount() {
  return useQuery<number>({
    queryKey: ['notifications', 'unreadCount'],
    queryFn: async () => {
      const res = await fetch('/api/notifications?limit=1');
      if (!res.ok) throw new Error('Failed to fetch unread count');
      const data: NotificationsResponse = await res.json();
      return data.unreadCount;
    },
    refetchInterval: 30 * 1000,
  });
}

/** Mark specific notifications as read */
export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationIds: string[]) => {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to mark as read');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/** Mark all notifications as read */
export function useMarkAllRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to mark all as read');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('All notifications marked as read');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
