'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  Settings,
  Truck,
  Package,
  MapPin,
  CreditCard,
  FileText,
  XCircle,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { formatCurrency, formatDate, formatDateTime, getOrderStatusColor } from '@/lib/utils';
import { toast } from 'sonner';

const TIMELINE_STEPS = [
  { key: 'PENDING', label: 'Pending', icon: Clock },
  { key: 'CONFIRMED', label: 'Confirmed', icon: CheckCircle2 },
  { key: 'PROCESSING', label: 'Processing', icon: Settings },
  { key: 'SHIPPED', label: 'Shipped', icon: Truck },
  { key: 'DELIVERED', label: 'Delivered', icon: Package },
] as const;

function getStepIndex(status: string): number {
  const idx = TIMELINE_STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : -1;
}

interface OrderLine {
  id: string;
  lineNumber: number;
  productId: string;
  sku: string;
  productName: string;
  quantityOrdered: number;
  quantityShipped: number;
  quantityCancelled: number;
  unitPrice: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
  lineStatus: string;
  product: {
    id: string;
    name: string;
    sku: string;
    brand: string | null;
    imageUrl: string | null;
  };
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  orderDate: string;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string | null;
  subtotalAmount: number;
  taxAmount: number;
  shippingAmount: number;
  discountAmount: number;
  totalAmount: number;
  shipToAddress: string | null;
  shipToCity: string | null;
  shipToState: string | null;
  shipToZip: string | null;
  trackingNumber: string | null;
  shippingCarrier: string | null;
  orderNotes: string | null;
  cancellationReason: string | null;
  totalItems: number;
  totalUnits: number;
  retailer: {
    id: string;
    name: string;
    businessName: string;
    contactEmail: string;
    city: string | null;
    state: string | null;
  };
  wholesaler: {
    id: string;
    name: string;
    businessName: string;
    contactEmail: string;
    city: string | null;
    state: string | null;
  };
  user: {
    firstName: string;
    lastName: string;
    email: string;
  };
  lines: OrderLine[];
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userRole = (session?.user as Record<string, unknown>)?.role as string | undefined;
  const isWholesaler = userRole === 'WHOLESALER';
  const isRetailer = userRole === 'RETAILER';

  const orderId = params.id as string;
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const { data: order, isLoading, error, refetch } = useQuery<OrderDetail>({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('Order not found');
        throw new Error('Failed to fetch order');
      }
      return res.json();
    },
    enabled: !!orderId,
  });

  const handleStatusUpdate = async (status: string) => {
    setUpdatingStatus(status);
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
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update order');
    } finally {
      setUpdatingStatus(null);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="w-8 h-8" variant="circular" />
          <Skeleton className="w-64 h-8" />
        </div>
        <Card className="mb-6">
          <Skeleton className="w-full h-20" variant="rectangular" />
        </Card>
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <Card><Skeleton className="w-full h-40" variant="rectangular" /></Card>
          <Card><Skeleton className="w-full h-40" variant="rectangular" /></Card>
        </div>
        <Card>
          <Skeleton className="w-full h-48" variant="rectangular" />
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => router.push('/orders')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-dark mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Orders
        </button>
        <ErrorBanner
          message={error instanceof Error ? error.message : 'Failed to load order'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (!order) {
    return null;
  }

  const currentStepIndex = getStepIndex(order.orderStatus);
  const isCancelled = order.orderStatus === 'CANCELLED' || order.orderStatus === 'REJECTED';

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back button + Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.push('/orders')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-brand-blue">{order.orderNumber}</h1>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getOrderStatusColor(order.orderStatus)}`}
            >
              {order.orderStatus}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Placed on {formatDateTime(order.orderDate)}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Cancel: only when PENDING, available to retailer */}
          {order.orderStatus === 'PENDING' && (isRetailer || isWholesaler) && (
            <Button
              variant="danger"
              size="sm"
              isLoading={updatingStatus === 'CANCELLED'}
              onClick={() => handleStatusUpdate('CANCELLED')}
              leftIcon={<XCircle className="h-4 w-4" />}
            >
              Cancel Order
            </Button>
          )}

          {/* Confirm: wholesaler, when PENDING */}
          {isWholesaler && order.orderStatus === 'PENDING' && (
            <Button
              variant="secondary"
              size="sm"
              isLoading={updatingStatus === 'CONFIRMED'}
              onClick={() => handleStatusUpdate('CONFIRMED')}
              leftIcon={<CheckCircle2 className="h-4 w-4" />}
            >
              Confirm Order
            </Button>
          )}

          {/* Ship: wholesaler, when CONFIRMED or PROCESSING */}
          {isWholesaler && (order.orderStatus === 'CONFIRMED' || order.orderStatus === 'PROCESSING') && (
            <Button
              variant="primary"
              size="sm"
              isLoading={updatingStatus === 'SHIPPED'}
              onClick={() => handleStatusUpdate('SHIPPED')}
              leftIcon={<Send className="h-4 w-4" />}
            >
              Mark Shipped
            </Button>
          )}
        </div>
      </div>

      {/* Cancellation notice */}
      {isCancelled && order.cancellationReason && (
        <div className="bg-status-error/10 border border-status-error/20 rounded-lg p-4 mb-6">
          <p className="text-sm text-status-error font-medium">Cancellation Reason</p>
          <p className="text-sm text-status-error/80 mt-1">{order.cancellationReason}</p>
        </div>
      )}

      {/* Status Timeline */}
      {!isCancelled && (
        <Card className="mb-6">
          <div className="flex items-center justify-between px-2">
            {TIMELINE_STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = index <= currentStepIndex;
              const isCurrent = index === currentStepIndex;

              return (
                <div key={step.key} className="flex flex-col items-center flex-1 relative">
                  {/* Connector line */}
                  {index > 0 && (
                    <div
                      className={`absolute top-5 right-1/2 w-full h-0.5 -translate-y-1/2 ${
                        index <= currentStepIndex ? 'bg-brand-teal' : 'bg-gray-200'
                      }`}
                      style={{ zIndex: 0 }}
                    />
                  )}

                  {/* Step circle */}
                  <div
                    className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center ${
                      isCurrent
                        ? 'bg-brand-teal text-white ring-4 ring-brand-teal/20'
                        : isActive
                          ? 'bg-brand-teal text-white'
                          : 'bg-gray-200 text-gray-400'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  {/* Label */}
                  <p
                    className={`mt-2 text-xs font-medium ${
                      isActive ? 'text-brand-teal' : 'text-gray-400'
                    }`}
                  >
                    {step.label}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Order Info Cards */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Retailer & Wholesaler Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-5 w-5 text-brand-teal" />
              Order Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium mb-1">Retailer</p>
                <p className="text-sm font-medium text-dark">{order.retailer.businessName}</p>
                <p className="text-xs text-gray-500">{order.retailer.contactEmail}</p>
                {order.retailer.city && (
                  <p className="text-xs text-gray-500">
                    {order.retailer.city}, {order.retailer.state}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium mb-1">Wholesaler</p>
                <p className="text-sm font-medium text-dark">{order.wholesaler.name}</p>
                <p className="text-xs text-gray-500">{order.wholesaler.contactEmail}</p>
                {order.wholesaler.city && (
                  <p className="text-xs text-gray-500">
                    {order.wholesaler.city}, {order.wholesaler.state}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium mb-1">
                  <CreditCard className="h-3 w-3 inline mr-1" />
                  Payment Method
                </p>
                <p className="text-sm font-medium text-dark">
                  {order.paymentMethod || 'Not specified'}
                </p>
              </div>
              {order.trackingNumber && (
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium mb-1">
                    <Truck className="h-3 w-3 inline mr-1" />
                    Tracking
                  </p>
                  <p className="text-sm font-medium text-dark">
                    {order.shippingCarrier && <span className="text-gray-500">{order.shippingCarrier}: </span>}
                    {order.trackingNumber}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Shipping Address + Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-5 w-5 text-brand-teal" />
              Shipping Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium mb-1">Ship To</p>
                {order.shipToAddress ? (
                  <>
                    <p className="text-sm text-dark">{order.shipToAddress}</p>
                    <p className="text-sm text-dark">
                      {order.shipToCity}, {order.shipToState} {order.shipToZip}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">No shipping address provided</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium mb-1">Placed By</p>
                <p className="text-sm text-dark">
                  {order.user.firstName} {order.user.lastName}
                </p>
                <p className="text-xs text-gray-500">{order.user.email}</p>
              </div>
              {order.orderNotes && (
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium mb-1">
                    <FileText className="h-3 w-3 inline mr-1" />
                    Notes
                  </p>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{order.orderNotes}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Line Items Table */}
      <Card padding="none" className="mb-6">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-dark">Line Items</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SKU
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Qty Ordered
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Qty Shipped
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Unit Price
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Line Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {order.lines.map((line) => (
                <tr key={line.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-gray-400 text-sm font-bold">
                          {line.productName?.[0] || '?'}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-dark">{line.productName}</p>
                        {line.product.brand && (
                          <p className="text-xs text-gray-500">{line.product.brand}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm text-gray-600 font-mono">{line.sku}</p>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <p className="text-sm font-medium text-dark">{line.quantityOrdered}</p>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <p
                      className={`text-sm font-medium ${
                        line.quantityShipped >= line.quantityOrdered
                          ? 'text-success'
                          : line.quantityShipped > 0
                            ? 'text-status-warning'
                            : 'text-gray-400'
                      }`}
                    >
                      {line.quantityShipped}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <p className="text-sm font-mono text-gray-600">{formatCurrency(line.unitPrice)}</p>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <p className="text-sm font-semibold font-mono text-dark">
                      {formatCurrency(line.lineTotal)}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Order Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs ml-auto space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-mono">{formatCurrency(order.subtotalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Tax</span>
              <span className="font-mono">{formatCurrency(order.taxAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Shipping</span>
              {order.shippingAmount > 0 ? (
                <span className="font-mono">{formatCurrency(order.shippingAmount)}</span>
              ) : (
                <span className="text-success font-medium">Free</span>
              )}
            </div>
            {order.discountAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Discount</span>
                <span className="font-mono text-success">-{formatCurrency(order.discountAmount)}</span>
              </div>
            )}
            <hr />
            <div className="flex justify-between text-base">
              <span className="font-semibold text-dark">Total</span>
              <span className="font-bold font-mono text-dark">{formatCurrency(order.totalAmount)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
