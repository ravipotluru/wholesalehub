'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  Settings,
  Truck,
  Package,
  Send,
  XCircle,
  MapPin,
  Store,
  FileText,
  User,
  Phone,
  Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { cn, formatCurrency, formatDate, formatDateTime, getOrderStatusColor } from '@/lib/utils';
import { toast } from 'sonner';

// ---------- Types ----------

type OrderStatus = 'NEW' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

interface OrderLineItem {
  id: string;
  productName: string;
  sku: string;
  qtyOrdered: number;
  qtyShipped: number;
  unitPrice: number;
  lineTotal: number;
  lineStatus: string;
}

interface RetailerInfo {
  name: string;
  businessName: string;
  storeType: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

interface IncomingOrderDetail {
  id: string;
  orderNumber: string;
  orderDate: string;
  status: OrderStatus;
  retailer: RetailerInfo;
  lines: OrderLineItem[];
  subtotal: number;
  taxAmount: number;
  shippingAmount: number;
  totalAmount: number;
  trackingNumber: string | null;
  shippingCarrier: string | null;
  orderNotes: string | null;
}

// ---------- Timeline ----------

const TIMELINE_STEPS = [
  { key: 'NEW', label: 'New', icon: Clock },
  { key: 'CONFIRMED', label: 'Confirmed', icon: CheckCircle2 },
  { key: 'PROCESSING', label: 'Processing', icon: Settings },
  { key: 'SHIPPED', label: 'Shipped', icon: Truck },
  { key: 'DELIVERED', label: 'Delivered', icon: Package },
] as const;

function getStepIndex(status: string): number {
  const idx = TIMELINE_STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : -1;
}

// ---------- Mock Data ----------

function getMockOrder(id: string): IncomingOrderDetail {
  return {
    id,
    orderNumber: 'ORD-L7K3M-9XQ2',
    orderDate: '2026-02-14T08:15:00Z',
    status: 'CONFIRMED',
    retailer: {
      name: 'John Rodriguez',
      businessName: 'Quick Stop Smoke Shop',
      storeType: 'SMOKE_SHOP',
      contactEmail: 'john@quickstopsmoke.com',
      contactPhone: '(555) 123-4567',
      address: '1234 Main Street',
      city: 'Brooklyn',
      state: 'NY',
      zip: '11201',
    },
    lines: [
      { id: 'ol-1', productName: 'RAZ CA6000 Disposable Vape - Blue Razz', sku: 'RAZ-CA6K-BR', qtyOrdered: 50, qtyShipped: 0, unitPrice: 8.99, lineTotal: 449.50, lineStatus: 'PENDING' },
      { id: 'ol-2', productName: 'Fume Infinity Disposable - Strawberry Banana', sku: 'FUME-INF-SB', qtyOrdered: 40, qtyShipped: 0, unitPrice: 7.50, lineTotal: 300.00, lineStatus: 'PENDING' },
      { id: 'ol-3', productName: 'ZYN Nicotine Pouches 6mg - Wintergreen', sku: 'ZYN-6MG-WG', qtyOrdered: 100, qtyShipped: 0, unitPrice: 3.25, lineTotal: 325.00, lineStatus: 'PENDING' },
      { id: 'ol-4', productName: 'BIC Classic Lighter - Assorted 50pk', sku: 'BIC-CL-50PK', qtyOrdered: 5, qtyShipped: 0, unitPrice: 32.00, lineTotal: 160.00, lineStatus: 'PENDING' },
      { id: 'ol-5', productName: 'RAW Classic Rolling Papers King Size', sku: 'RAW-CL-KS', qtyOrdered: 15, qtyShipped: 0, unitPrice: 1.15, lineTotal: 17.25, lineStatus: 'PENDING' },
    ],
    subtotal: 1251.75,
    taxAmount: 106.40,
    shippingAmount: 0,
    totalAmount: 1358.15,
    trackingNumber: null,
    shippingCarrier: null,
    orderNotes: 'Please ship by Feb 16 if possible. Separate vape products from tobacco.',
  };
}

const CARRIER_OPTIONS = [
  { value: '', label: 'Select carrier...' },
  { value: 'UPS', label: 'UPS' },
  { value: 'FedEx', label: 'FedEx' },
  { value: 'USPS', label: 'USPS' },
  { value: 'DHL', label: 'DHL' },
  { value: 'Other', label: 'Other' },
];

// ---------- Loading Skeleton ----------

function PageSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="w-8 h-8" variant="circular" />
        <Skeleton className="w-64 h-8" />
      </div>
      <Card>
        <Skeleton className="w-full h-20" variant="rectangular" />
      </Card>
      <div className="grid lg:grid-cols-2 gap-6">
        <Card><Skeleton className="w-full h-48" variant="rectangular" /></Card>
        <Card><Skeleton className="w-full h-48" variant="rectangular" /></Card>
      </div>
      <Card>
        <Skeleton className="w-full h-64" variant="rectangular" />
      </Card>
    </div>
  );
}

// ---------- Main Page ----------

export default function IncomingOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);
  const [order, setOrder] = useState<IncomingOrderDetail>(() => getMockOrder(orderId));
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [showTrackingForm, setShowTrackingForm] = useState(false);
  const [trackingCarrier, setTrackingCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');

  const currentStepIndex = getStepIndex(order.status);
  const isCancelled = order.status === 'CANCELLED';

  const handleStatusUpdate = (newStatus: OrderStatus) => {
    setUpdatingStatus(newStatus);
    setTimeout(() => {
      setOrder((prev) => ({ ...prev, status: newStatus }));
      setUpdatingStatus(null);
      toast.success(`Order ${newStatus.toLowerCase()} successfully`);
    }, 500);
  };

  const handleAddTracking = () => {
    if (!trackingNumber.trim()) return;
    setOrder((prev) => ({
      ...prev,
      status: 'SHIPPED' as OrderStatus,
      trackingNumber,
      shippingCarrier: trackingCarrier,
    }));
    setShowTrackingForm(false);
    toast.success(`Order shipped with tracking ${trackingNumber}`);
  };

  if (isLoading) return <PageSkeleton />;

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => router.push('/incoming-orders')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-dark mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Incoming Orders
        </button>
        <ErrorBanner message={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (!order) {
    return (
      <EmptyState
        icon="package"
        title="Order not found"
        description="This order does not exist."
        actionLabel="Back to Incoming Orders"
        onAction={() => router.push('/incoming-orders')}
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <button
            onClick={() => router.push('/incoming-orders')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors mt-1"
          >
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-brand-blue">{order.orderNumber}</h1>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
                  getOrderStatusColor(order.status),
                )}
              >
                {order.status}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              Placed on {formatDateTime(order.orderDate)}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {order.status === 'NEW' && (
            <>
              <Button
                variant="danger"
                size="sm"
                leftIcon={<XCircle className="h-4 w-4" />}
                isLoading={updatingStatus === 'CANCELLED'}
                onClick={() => handleStatusUpdate('CANCELLED')}
              >
                Reject
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="bg-success text-white hover:bg-success/90"
                leftIcon={<CheckCircle2 className="h-4 w-4" />}
                isLoading={updatingStatus === 'CONFIRMED'}
                onClick={() => handleStatusUpdate('CONFIRMED')}
              >
                Confirm Order
              </Button>
            </>
          )}
          {order.status === 'CONFIRMED' && (
            <Button
              variant="ghost"
              size="sm"
              className="text-brand-teal bg-brand-teal/10 hover:bg-brand-teal/20"
              leftIcon={<Settings className="h-4 w-4" />}
              onClick={() => handleStatusUpdate('PROCESSING')}
            >
              Start Processing
            </Button>
          )}
          {order.status === 'PROCESSING' && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Truck className="h-4 w-4" />}
              onClick={() => setShowTrackingForm(true)}
            >
              Mark Shipped
            </Button>
          )}
        </div>
      </div>

      {/* Status Timeline */}
      {!isCancelled && (
        <Card>
          <div className="flex items-center justify-between px-2">
            {TIMELINE_STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = index <= currentStepIndex;
              const isCurrent = index === currentStepIndex;

              return (
                <div key={step.key} className="flex flex-col items-center flex-1 relative">
                  {index > 0 && (
                    <div
                      className={cn(
                        'absolute top-5 right-1/2 w-full h-0.5 -translate-y-1/2',
                        index <= currentStepIndex ? 'bg-brand-teal' : 'bg-gray-200',
                      )}
                      style={{ zIndex: 0 }}
                    />
                  )}
                  <div
                    className={cn(
                      'relative z-10 w-10 h-10 rounded-full flex items-center justify-center',
                      isCurrent
                        ? 'bg-brand-teal text-white ring-4 ring-brand-teal/20'
                        : isActive
                          ? 'bg-brand-teal text-white'
                          : 'bg-gray-200 text-gray-400',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <p
                    className={cn(
                      'mt-2 text-xs font-medium',
                      isActive ? 'text-brand-teal' : 'text-gray-400',
                    )}
                  >
                    {step.label}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Cancelled Notice */}
      {isCancelled && (
        <div className="bg-status-error/10 border border-status-error/20 rounded-lg p-4">
          <p className="text-sm text-status-error font-medium">This order has been cancelled.</p>
        </div>
      )}

      {/* Info Cards */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Retailer Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Store className="h-5 w-5 text-brand-teal" />
              Retailer Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium mb-1">Business</p>
                <p className="text-sm font-medium text-dark">{order.retailer.businessName}</p>
                <Badge variant="default" className="mt-1">
                  {order.retailer.storeType.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium mb-1">
                  <User className="h-3 w-3 inline mr-1" />
                  Contact
                </p>
                <p className="text-sm text-dark">{order.retailer.name}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-gray-400" />
                <p className="text-sm text-gray-600">{order.retailer.contactEmail}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-gray-400" />
                <p className="text-sm text-gray-600">{order.retailer.contactPhone}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium mb-1">
                  <MapPin className="h-3 w-3 inline mr-1" />
                  Shipping Address
                </p>
                <p className="text-sm text-dark">{order.retailer.address}</p>
                <p className="text-sm text-dark">
                  {order.retailer.city}, {order.retailer.state} {order.retailer.zip}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Order Notes + Tracking */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5 text-brand-teal" />
              Order Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {order.orderNotes && (
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium mb-1">Notes</p>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                    {order.orderNotes}
                  </p>
                </div>
              )}

              {order.trackingNumber && (
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium mb-1">
                    <Truck className="h-3 w-3 inline mr-1" />
                    Tracking
                  </p>
                  <p className="text-sm font-medium text-dark">
                    {order.shippingCarrier && (
                      <span className="text-gray-500">{order.shippingCarrier}: </span>
                    )}
                    <span className="font-mono">{order.trackingNumber}</span>
                  </p>
                </div>
              )}

              {/* Add Tracking Form */}
              {showTrackingForm && !order.trackingNumber && (
                <div className="border border-brand-teal/30 rounded-lg p-4 bg-brand-teal/5">
                  <h4 className="text-sm font-semibold text-dark mb-3">Add Tracking Information</h4>
                  <div className="space-y-3">
                    <Select
                      id="carrier"
                      label="Carrier"
                      options={CARRIER_OPTIONS}
                      value={trackingCarrier}
                      onChange={(e) => setTrackingCarrier(e.target.value)}
                    />
                    <Input
                      id="trackingNumber"
                      label="Tracking Number"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder="Enter tracking number"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowTrackingForm(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<Send className="h-3.5 w-3.5" />}
                        onClick={handleAddTracking}
                        disabled={!trackingNumber.trim()}
                      >
                        Ship & Add Tracking
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Order Summary */}
              <div className="pt-2">
                <p className="text-xs text-gray-500 uppercase font-medium mb-2">Summary</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Items</span>
                    <span className="text-dark">
                      {order.lines.length} products, {order.lines.reduce((s, l) => s + l.qtyOrdered, 0)} units
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Order Date</span>
                    <span className="text-dark">{formatDateTime(order.orderDate)}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Line Items Table */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-dark">Line Items</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">SKU</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Qty Ordered</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Qty Shipped</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Price</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {order.lines.map((line) => (
                <tr key={line.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-4">
                    <p className="text-sm font-medium text-dark">{line.productName}</p>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm font-mono text-gray-600">{line.sku}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="text-sm font-medium text-dark">{line.qtyOrdered}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span
                      className={cn(
                        'text-sm font-medium',
                        line.qtyShipped >= line.qtyOrdered
                          ? 'text-success'
                          : line.qtyShipped > 0
                            ? 'text-status-warning'
                            : 'text-gray-400',
                      )}
                    >
                      {line.qtyShipped}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="text-sm font-mono text-gray-600">{formatCurrency(line.unitPrice)}</span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="text-sm font-semibold font-mono text-dark">
                      {formatCurrency(line.lineTotal)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        line.lineStatus === 'SHIPPED'
                          ? 'bg-success/10 text-success'
                          : line.lineStatus === 'PARTIAL'
                            ? 'bg-status-warning/10 text-status-warning'
                            : 'bg-gray-100 text-gray-500',
                      )}
                    >
                      {line.lineStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Order Summary Totals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs ml-auto space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-mono">{formatCurrency(order.subtotal)}</span>
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
