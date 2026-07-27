'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Package,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  ChevronRight,
  Check,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { TableRowSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { formatCurrency, formatDate, getOrderStatusColor } from '@/lib/utils';
import { toast } from 'sonner';

const ORDER_TABS = [
  { key: 'all', label: 'All', icon: Package },
  { key: 'PENDING', label: 'Pending', icon: Clock },
  { key: 'CONFIRMED', label: 'Confirmed', icon: CheckCircle2 },
  { key: 'SHIPPED', label: 'Shipped', icon: Truck },
  { key: 'DELIVERED', label: 'Delivered', icon: Check },
  { key: 'CANCELLED', label: 'Cancelled', icon: XCircle },
] as const;

type TabKey = (typeof ORDER_TABS)[number]['key'];

interface OrderItem {
  id: string;
  orderNumber: string;
  orderDate: string;
  orderStatus: string;
  totalAmount: number;
  totalItems: number;
  totalUnits: number;
  paymentMethod: string | null;
  retailer: {
    id: string;
    name: string;
    businessName: string;
    city: string | null;
    state: string | null;
  };
  wholesaler: {
    id: string;
    name: string;
    businessName: string;
    city: string | null;
    state: string | null;
  };
  lines: {
    id: string;
    productName: string;
    quantityOrdered: number;
    unitPrice: number;
    lineTotal: number;
  }[];
}

export default function OrdersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userRole = session?.user?.role;
  const isWholesaler = userRole === 'WHOLESALER';

  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [page, setPage] = useState(1);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['orders', activeTab, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeTab !== 'all') params.set('status', activeTab);
      params.set('page', String(page));
      params.set('limit', '20');

      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
  });

  const handleStatusUpdate = async (orderId: string, status: string) => {
    setUpdatingOrderId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update order');
      }

      toast.success(`Order ${status.toLowerCase()} successfully`);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update order');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setPage(1);
  };

  const [smartReordering, setSmartReordering] = useState(false);

  /**
   * Rebuild the usual basket from the last 90 days of orders. Out-of-stock
   * lines auto-substitute to the cheapest in-stock supplier; state-banned
   * SKUs are skipped with the reason. See /api/orders/smart-reorder.
   */
  const handleSmartReorder = async () => {
    setSmartReordering(true);
    try {
      const res = await fetch('/api/orders/smart-reorder', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error?.message ?? 'Smart reorder failed');
      }
      if (body.added === 0) {
        toast.info(body.message ?? 'Nothing to reorder yet — place an order first.');
        return;
      }
      const parts = [`${body.added} item${body.added === 1 ? '' : 's'} added to cart`];
      if (body.substituted?.length) {
        parts.push(`${body.substituted.length} swapped to a better supplier`);
      }
      if (body.skipped?.length) {
        parts.push(`${body.skipped.length} skipped (out of stock or restricted)`);
      }
      toast.success(parts.join(' · '));
      router.push('/cart');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Smart reorder failed');
    } finally {
      setSmartReordering(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-brand-blue">Orders</h1>
        {!isWholesaler && (
          <Button
            variant="primary"
            size="sm"
            isLoading={smartReordering}
            onClick={handleSmartReorder}
          >
            Smart Reorder
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {ORDER_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-brand-blue text-white'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-dark'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Error state */}
      {error && (
        <ErrorBanner
          message="Failed to load orders. Please try again."
          onRetry={() => refetch()}
        />
      )}

      {/* Loading state */}
      {isLoading && (
        <Card padding="none">
          <div className="p-4 border-b border-gray-100">
            <Skeleton className="w-32 h-5" />
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{isWholesaler ? 'Retailer' : 'Supplier'}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                {isWholesaler && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>}
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRowSkeleton key={i} cols={isWholesaler ? 8 : 7} />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && !error && data?.orders?.length === 0 && (
        <EmptyState
          icon="package"
          title="No orders found"
          description={
            activeTab !== 'all'
              ? `No ${activeTab.toLowerCase()} orders. Try switching to a different tab.`
              : 'You have no orders yet. Browse products and place your first order.'
          }
          actionLabel={activeTab !== 'all' ? 'View All Orders' : 'Browse Products'}
          onAction={() => {
            if (activeTab !== 'all') {
              handleTabChange('all');
            } else {
              router.push('/marketplace');
            }
          }}
        />
      )}

      {/* Orders table */}
      {!isLoading && !error && data?.orders?.length > 0 && (
        <>
          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Order #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {isWholesaler ? 'Retailer' : 'Supplier'}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Items
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    {isWholesaler && (
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    )}
                    <th className="px-4 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.orders.map((order: OrderItem) => (
                    <tr
                      key={order.id}
                      onClick={() => router.push(`/orders/${order.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-4">
                        <p className="font-semibold text-dark text-sm">{order.orderNumber}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm text-gray-600">{formatDate(order.orderDate)}</p>
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <p className="text-sm font-medium text-dark">
                            {isWholesaler ? order.retailer.businessName : order.wholesaler.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {isWholesaler
                              ? `${order.retailer.city || ''}, ${order.retailer.state || ''}`
                              : `${order.wholesaler.city || ''}, ${order.wholesaler.state || ''}`}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm text-gray-600">
                          {order.totalItems} item{order.totalItems !== 1 ? 's' : ''}
                        </p>
                        <p className="text-xs text-gray-400">
                          {order.totalUnits} unit{order.totalUnits !== 1 ? 's' : ''}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <p className="font-semibold font-mono text-dark text-sm">
                          {formatCurrency(order.totalAmount)}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getOrderStatusColor(order.orderStatus)}`}
                        >
                          {order.orderStatus}
                        </span>
                      </td>
                      {isWholesaler && (
                        <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            {order.orderStatus === 'PENDING' && (
                              <Button
                                variant="secondary"
                                size="sm"
                                isLoading={updatingOrderId === order.id}
                                onClick={() => handleStatusUpdate(order.id, 'CONFIRMED')}
                                leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
                              >
                                Confirm
                              </Button>
                            )}
                            {(order.orderStatus === 'CONFIRMED' || order.orderStatus === 'PROCESSING') && (
                              <Button
                                variant="primary"
                                size="sm"
                                isLoading={updatingOrderId === order.id}
                                onClick={() => handleStatusUpdate(order.id, 'SHIPPED')}
                                leftIcon={<Send className="h-3.5 w-3.5" />}
                              >
                                Mark Shipped
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-4">
                        <ChevronRight className="h-4 w-4 text-gray-300" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-gray-500">
                Showing {(page - 1) * data.pagination.limit + 1} to{' '}
                {Math.min(page * data.pagination.limit, data.pagination.total)} of{' '}
                {data.pagination.total} orders
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 border rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50"
                >
                  Previous
                </button>
                {Array.from({ length: Math.min(5, data.pagination.totalPages) }).map((_, i) => {
                  // Show pages around current page
                  let pageNum: number;
                  const totalPages = data.pagination.totalPages;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`px-4 py-2 border rounded-lg text-sm ${
                        page === pageNum
                          ? 'bg-brand-blue text-white border-brand-blue'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(Math.min(data.pagination.totalPages, page + 1))}
                  disabled={page === data.pagination.totalPages}
                  className="px-4 py-2 border rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
