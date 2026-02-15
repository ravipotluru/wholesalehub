'use client';

import { useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import {
  Inbox,
  DollarSign,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Settings,
  Truck,
  Package,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { KpiCard } from '@/components/ui/KpiCard';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton, TableRowSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { cn, formatCurrency, formatDate, getOrderStatusColor } from '@/lib/utils';
import { toast } from 'sonner';

// ---------- Types ----------

type OrderStatus = 'NEW' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
type StoreType = 'SMOKE_SHOP' | 'GAS_STATION' | 'CONVENIENCE' | 'VAPE_SHOP' | 'LIQUOR';
type TabKey = 'new' | 'confirmed' | 'processing' | 'shipped' | 'all';

interface OrderLineItem {
  id: string;
  productName: string;
  sku: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

interface IncomingOrder {
  id: string;
  orderNumber: string;
  orderDate: string;
  retailerName: string;
  storeType: StoreType;
  items: number;
  total: number;
  status: OrderStatus;
  lines: OrderLineItem[];
}

// ---------- Mock Data ----------

const MOCK_ORDERS: IncomingOrder[] = [
  { id: 'io-1', orderNumber: 'ORD-L7K3M-9XQ2', orderDate: '2026-02-14T08:15:00Z', retailerName: 'Quick Stop Smoke Shop', storeType: 'SMOKE_SHOP', items: 4, total: 1247.50, status: 'NEW', lines: [{ id: 'il-1', productName: 'RAZ CA6000 - Blue Razz', sku: 'RAZ-CA6K-BR', qty: 50, unitPrice: 8.99, lineTotal: 449.50 }, { id: 'il-2', productName: 'Fume Infinity - Strawberry', sku: 'FUME-INF-SB', qty: 40, unitPrice: 7.50, lineTotal: 300.00 }, { id: 'il-3', productName: 'ZYN 6mg - Wintergreen', sku: 'ZYN-6MG-WG', qty: 100, unitPrice: 3.25, lineTotal: 325.00 }, { id: 'il-4', productName: 'BIC Lighter 50pk', sku: 'BIC-CL-50PK', qty: 5, unitPrice: 32.00, lineTotal: 160.00 }] },
  { id: 'io-2', orderNumber: 'ORD-P8R4N-2WZ5', orderDate: '2026-02-14T07:30:00Z', retailerName: 'Main Street Gas & Go', storeType: 'GAS_STATION', items: 2, total: 567.00, status: 'NEW', lines: [{ id: 'il-5', productName: 'Swisher Sweets - Grape 20/5pk', sku: 'SS-GR-20PK', qty: 10, unitPrice: 28.50, lineTotal: 285.00 }, { id: 'il-6', productName: 'Backwoods - Honey Berry', sku: 'BW-HB-8PK', qty: 6, unitPrice: 42.00, lineTotal: 252.00 }] },
  { id: 'io-3', orderNumber: 'ORD-Q5S1T-6YJ8', orderDate: '2026-02-14T06:00:00Z', retailerName: 'VapeWorld NYC', storeType: 'VAPE_SHOP', items: 3, total: 2156.25, status: 'NEW', lines: [{ id: 'il-7', productName: 'Elf Bar BC5000 - Mango Peach', sku: 'ELF-BC5K-MP', qty: 100, unitPrice: 8.75, lineTotal: 875.00 }, { id: 'il-8', productName: 'Lost Mary OS5000 - Watermelon', sku: 'LM-OS5K-WM', qty: 80, unitPrice: 9.25, lineTotal: 740.00 }, { id: 'il-9', productName: 'RAZ CA6000 - Blue Razz', sku: 'RAZ-CA6K-BR', qty: 60, unitPrice: 8.99, lineTotal: 541.25 }] },
  { id: 'io-4', orderNumber: 'ORD-V2U6W-4HG1', orderDate: '2026-02-13T14:20:00Z', retailerName: 'Corner Convenience Plus', storeType: 'CONVENIENCE', items: 5, total: 892.75, status: 'CONFIRMED', lines: [{ id: 'il-10', productName: 'RAW Rolling Papers KS', sku: 'RAW-CL-KS', qty: 200, unitPrice: 1.15, lineTotal: 230.00 }, { id: 'il-11', productName: 'Clipper Hemp Leaves 48ct', sku: 'CLIP-HEMP-48', qty: 6, unitPrice: 45.60, lineTotal: 273.60 }, { id: 'il-12', productName: 'BIC Lighter 50pk', sku: 'BIC-CL-50PK', qty: 8, unitPrice: 32.00, lineTotal: 256.00 }, { id: 'il-13', productName: 'ZYN 6mg - Wintergreen', sku: 'ZYN-6MG-WG', qty: 30, unitPrice: 3.25, lineTotal: 97.50 }, { id: 'il-14', productName: 'RAZ CA6000 - Blue Razz', sku: 'RAZ-CA6K-BR', qty: 4, unitPrice: 8.99, lineTotal: 35.96 }] },
  { id: 'io-5', orderNumber: 'ORD-X9Y7Z-3KD0', orderDate: '2026-02-13T10:45:00Z', retailerName: 'Paradise Smoke Lounge', storeType: 'SMOKE_SHOP', items: 2, total: 1387.50, status: 'CONFIRMED', lines: [{ id: 'il-15', productName: 'Elf Bar BC5000 - Mango Peach', sku: 'ELF-BC5K-MP', qty: 100, unitPrice: 8.75, lineTotal: 875.00 }, { id: 'il-16', productName: 'Fume Infinity - Strawberry', sku: 'FUME-INF-SB', qty: 68, unitPrice: 7.50, lineTotal: 510.00 }] },
  { id: 'io-6', orderNumber: 'ORD-A3B1C-8FE2', orderDate: '2026-02-12T16:30:00Z', retailerName: 'Uptown Spirits & Tobacco', storeType: 'LIQUOR', items: 3, total: 724.50, status: 'PROCESSING', lines: [{ id: 'il-17', productName: 'Backwoods - Honey Berry', sku: 'BW-HB-8PK', qty: 10, unitPrice: 42.00, lineTotal: 420.00 }, { id: 'il-18', productName: 'Swisher Sweets - Grape', sku: 'SS-GR-20PK', qty: 8, unitPrice: 28.50, lineTotal: 228.00 }, { id: 'il-19', productName: 'RAW Rolling Papers KS', sku: 'RAW-CL-KS', qty: 67, unitPrice: 1.15, lineTotal: 77.05 }] },
  { id: 'io-7', orderNumber: 'ORD-D4E5F-1GH6', orderDate: '2026-02-12T12:00:00Z', retailerName: 'Cloud 9 Vapes', storeType: 'VAPE_SHOP', items: 2, total: 1641.75, status: 'PROCESSING', lines: [{ id: 'il-20', productName: 'Lost Mary OS5000 - Watermelon', sku: 'LM-OS5K-WM', qty: 100, unitPrice: 9.25, lineTotal: 925.00 }, { id: 'il-21', productName: 'RAZ CA6000 - Blue Razz', sku: 'RAZ-CA6K-BR', qty: 80, unitPrice: 8.99, lineTotal: 716.75 }] },
  { id: 'io-8', orderNumber: 'ORD-I7J8K-9LM0', orderDate: '2026-02-11T08:00:00Z', retailerName: 'Express Gas Station', storeType: 'GAS_STATION', items: 1, total: 456.00, status: 'SHIPPED', lines: [{ id: 'il-22', productName: 'Clipper Hemp Leaves 48ct', sku: 'CLIP-HEMP-48', qty: 10, unitPrice: 45.60, lineTotal: 456.00 }] },
  { id: 'io-9', orderNumber: 'ORD-N1O2P-3QR4', orderDate: '2026-02-11T06:30:00Z', retailerName: 'Quick Stop Smoke Shop', storeType: 'SMOKE_SHOP', items: 3, total: 987.25, status: 'SHIPPED', lines: [{ id: 'il-23', productName: 'Fume Infinity - Strawberry', sku: 'FUME-INF-SB', qty: 60, unitPrice: 7.50, lineTotal: 450.00 }, { id: 'il-24', productName: 'ZYN 6mg - Wintergreen', sku: 'ZYN-6MG-WG', qty: 120, unitPrice: 3.25, lineTotal: 390.00 }, { id: 'il-25', productName: 'RAW Rolling Papers KS', sku: 'RAW-CL-KS', qty: 128, unitPrice: 1.15, lineTotal: 147.25 }] },
  { id: 'io-10', orderNumber: 'ORD-S5T6U-7VW8', orderDate: '2026-02-10T15:00:00Z', retailerName: 'Downtown Deli & Smoke', storeType: 'CONVENIENCE', items: 4, total: 1523.00, status: 'SHIPPED', lines: [{ id: 'il-26', productName: 'Elf Bar BC5000', sku: 'ELF-BC5K-MP', qty: 80, unitPrice: 8.75, lineTotal: 700.00 }, { id: 'il-27', productName: 'Lost Mary OS5000', sku: 'LM-OS5K-WM', qty: 50, unitPrice: 9.25, lineTotal: 462.50 }, { id: 'il-28', productName: 'BIC Lighter 50pk', sku: 'BIC-CL-50PK', qty: 5, unitPrice: 32.00, lineTotal: 160.00 }, { id: 'il-29', productName: 'Backwoods - Honey Berry', sku: 'BW-HB-8PK', qty: 5, unitPrice: 42.00, lineTotal: 200.00 }] },
  { id: 'io-11', orderNumber: 'ORD-X9Y0Z-1AB2', orderDate: '2026-02-10T11:00:00Z', retailerName: 'VapeWorld NYC', storeType: 'VAPE_SHOP', items: 2, total: 2187.50, status: 'SHIPPED', lines: [{ id: 'il-30', productName: 'RAZ CA6000 - Blue Razz', sku: 'RAZ-CA6K-BR', qty: 150, unitPrice: 8.99, lineTotal: 1348.50 }, { id: 'il-31', productName: 'Elf Bar BC5000 - Mango Peach', sku: 'ELF-BC5K-MP', qty: 96, unitPrice: 8.75, lineTotal: 840.00 }] },
  { id: 'io-12', orderNumber: 'ORD-C3D4E-5FG6', orderDate: '2026-02-09T09:00:00Z', retailerName: 'Paradise Smoke Lounge', storeType: 'SMOKE_SHOP', items: 1, total: 325.00, status: 'SHIPPED', lines: [{ id: 'il-32', productName: 'ZYN 6mg - Wintergreen', sku: 'ZYN-6MG-WG', qty: 100, unitPrice: 3.25, lineTotal: 325.00 }] },
  { id: 'io-13', orderNumber: 'ORD-H7I8J-9KL0', orderDate: '2026-02-14T09:00:00Z', retailerName: 'SunRise Mart', storeType: 'CONVENIENCE', items: 2, total: 178.00, status: 'NEW', lines: [{ id: 'il-33', productName: 'BIC Lighter 50pk', sku: 'BIC-CL-50PK', qty: 3, unitPrice: 32.00, lineTotal: 96.00 }, { id: 'il-34', productName: 'RAW Rolling Papers KS', sku: 'RAW-CL-KS', qty: 71, unitPrice: 1.15, lineTotal: 82.00 }] },
  { id: 'io-14', orderNumber: 'ORD-M1N2O-3PQ4', orderDate: '2026-02-13T17:00:00Z', retailerName: 'Discount Tobacco Outlet', storeType: 'SMOKE_SHOP', items: 6, total: 3245.00, status: 'CONFIRMED', lines: [{ id: 'il-35', productName: 'RAZ CA6000', sku: 'RAZ-CA6K-BR', qty: 200, unitPrice: 8.99, lineTotal: 1798.00 }, { id: 'il-36', productName: 'Fume Infinity', sku: 'FUME-INF-SB', qty: 100, unitPrice: 7.50, lineTotal: 750.00 }, { id: 'il-37', productName: 'ZYN 6mg', sku: 'ZYN-6MG-WG', qty: 50, unitPrice: 3.25, lineTotal: 162.50 }, { id: 'il-38', productName: 'Lost Mary', sku: 'LM-OS5K-WM', qty: 30, unitPrice: 9.25, lineTotal: 277.50 }, { id: 'il-39', productName: 'BIC Lighter', sku: 'BIC-CL-50PK', qty: 5, unitPrice: 32.00, lineTotal: 160.00 }, { id: 'il-40', productName: 'RAW Papers', sku: 'RAW-CL-KS', qty: 85, unitPrice: 1.15, lineTotal: 97.75 }] },
  { id: 'io-15', orderNumber: 'ORD-R5S6T-7UV8', orderDate: '2026-02-12T14:00:00Z', retailerName: 'Metro Fuel & Tobacco', storeType: 'GAS_STATION', items: 3, total: 654.50, status: 'PROCESSING', lines: [{ id: 'il-41', productName: 'Swisher Sweets - Grape', sku: 'SS-GR-20PK', qty: 12, unitPrice: 28.50, lineTotal: 342.00 }, { id: 'il-42', productName: 'Clipper Hemp 48ct', sku: 'CLIP-HEMP-48', qty: 4, unitPrice: 45.60, lineTotal: 182.40 }, { id: 'il-43', productName: 'RAW Rolling Papers', sku: 'RAW-CL-KS', qty: 113, unitPrice: 1.15, lineTotal: 130.10 }] },
];

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'new', label: 'New', icon: Inbox },
  { key: 'confirmed', label: 'Confirmed', icon: CheckCircle2 },
  { key: 'processing', label: 'Processing', icon: Settings },
  { key: 'shipped', label: 'Shipped', icon: Truck },
  { key: 'all', label: 'All', icon: Package },
];

const STATUS_MAP: Record<TabKey, OrderStatus | null> = {
  new: 'NEW',
  confirmed: 'CONFIRMED',
  processing: 'PROCESSING',
  shipped: 'SHIPPED',
  all: null,
};

const STORE_TYPE_LABELS: Record<StoreType, string> = {
  SMOKE_SHOP: 'Smoke Shop',
  GAS_STATION: 'Gas Station',
  CONVENIENCE: 'Convenience',
  VAPE_SHOP: 'Vape Shop',
  LIQUOR: 'Liquor',
};

const CARRIER_OPTIONS = [
  { value: '', label: 'Select carrier...' },
  { value: 'UPS', label: 'UPS' },
  { value: 'FedEx', label: 'FedEx' },
  { value: 'USPS', label: 'USPS' },
  { value: 'DHL', label: 'DHL' },
  { value: 'Other', label: 'Other' },
];

function getStoreTypeBadge(type: StoreType) {
  const colors: Record<StoreType, string> = {
    SMOKE_SHOP: 'bg-brand-blue/10 text-brand-blue',
    GAS_STATION: 'bg-brand-orange/10 text-brand-orange',
    CONVENIENCE: 'bg-brand-teal/10 text-brand-teal',
    VAPE_SHOP: 'bg-purple-100 text-purple-700',
    LIQUOR: 'bg-amber-100 text-amber-700',
  };
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', colors[type])}>
      {STORE_TYPE_LABELS[type]}
    </span>
  );
}

// ---------- Main Page ----------

export default function IncomingOrdersPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('new');
  const [orders, setOrders] = useState<IncomingOrder[]>(MOCK_ORDERS);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [shippingModalOrderId, setShippingModalOrderId] = useState<string | null>(null);
  const [trackingCarrier, setTrackingCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');

  // Filter by tab
  const statusFilter = STATUS_MAP[activeTab];
  const filteredOrders = statusFilter
    ? orders.filter((o) => o.status === statusFilter)
    : orders;

  // KPIs
  const newOrdersToday = orders.filter(
    (o) => o.status === 'NEW' && o.orderDate.startsWith('2026-02-14'),
  ).length;
  const revenue30d = orders.reduce((s, o) => s + o.total, 0);
  const pendingCount = orders.filter((o) => o.status === 'NEW' || o.status === 'CONFIRMED').length;

  const handleStatusUpdate = (orderId: string, newStatus: OrderStatus) => {
    setUpdatingId(orderId);
    setTimeout(() => {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)),
      );
      setUpdatingId(null);
      toast.success(`Order ${newStatus.toLowerCase()} successfully`);
    }, 500);
  };

  const handleShipOrder = () => {
    if (!shippingModalOrderId || !trackingNumber.trim()) return;
    setOrders((prev) =>
      prev.map((o) => (o.id === shippingModalOrderId ? { ...o, status: 'SHIPPED' as OrderStatus } : o)),
    );
    toast.success(`Order marked as shipped. Tracking: ${trackingNumber}`);
    setShippingModalOrderId(null);
    setTrackingCarrier('');
    setTrackingNumber('');
  };

  const toggleExpanded = (id: string) => {
    setExpandedOrderId((prev) => (prev === id ? null : id));
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <Skeleton className="w-64 h-8" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" variant="rectangular" />
          ))}
        </div>
        <Skeleton className="h-96" variant="rectangular" />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-blue/10 rounded-lg flex items-center justify-center">
          <Inbox className="h-5 w-5 text-brand-blue" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-dark">Incoming Orders</h1>
          <p className="text-sm text-gray-500">Manage orders from your retail customers</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="New Orders (Today)"
          value={newOrdersToday}
          icon={Inbox}
          valueColor="text-brand-orange"
          change={{ value: 2, label: 'vs yesterday' }}
        />
        <KpiCard
          title="Revenue (30d)"
          value={formatCurrency(revenue30d)}
          icon={DollarSign}
          change={{ value: 14, label: 'vs prior 30d' }}
        />
        <KpiCard
          title="Avg Fulfillment Time"
          value="1.8d"
          icon={Clock}
          change={{ value: -0.3, label: 'faster' }}
        />
        <KpiCard
          title="Pending"
          value={pendingCount}
          icon={AlertCircle}
          valueColor={pendingCount > 5 ? 'text-status-warning' : undefined}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          const count = tab.key === 'all'
            ? orders.length
            : orders.filter((o) => o.status === STATUS_MAP[tab.key]).length;

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                isActive
                  ? 'bg-brand-blue text-white'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-dark',
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              <span
                className={cn(
                  'text-xs rounded-full px-1.5 py-0.5',
                  isActive ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600',
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Orders Table */}
      {filteredOrders.length === 0 ? (
        <EmptyState
          icon="package"
          title="No orders found"
          description={`No ${activeTab === 'all' ? '' : activeTab} orders at this time.`}
          actionLabel={activeTab !== 'all' ? 'View All Orders' : undefined}
          onAction={activeTab !== 'all' ? () => setActiveTab('all') : undefined}
        />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="px-4 py-3 w-8" />
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Order #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Retailer</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Store Type</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Items</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredOrders.map((order) => {
                  const isExpanded = expandedOrderId === order.id;

                  return (
                    <Fragment key={order.id}>
                      <tr className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleExpanded(order.id)}
                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-gray-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-gray-400" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="font-mono text-sm font-medium text-brand-blue cursor-pointer hover:underline"
                            onClick={() => router.push(`/incoming-orders/${order.id}`)}
                          >
                            {order.orderNumber}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatDate(order.orderDate)}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-dark">
                          {order.retailerName}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {getStoreTypeBadge(order.storeType)}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-600">
                          {order.items}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-mono font-bold text-dark">
                            {formatCurrency(order.total)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
                              getOrderStatusColor(order.status),
                            )}
                          >
                            {order.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {order.status === 'NEW' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs bg-success/10 text-success hover:bg-success/20"
                                  isLoading={updatingId === order.id}
                                  onClick={() => handleStatusUpdate(order.id, 'CONFIRMED')}
                                >
                                  Confirm
                                </Button>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  className="text-xs"
                                  onClick={() => handleStatusUpdate(order.id, 'CANCELLED')}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                            {order.status === 'CONFIRMED' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-brand-teal hover:bg-brand-teal/10"
                                onClick={() => handleStatusUpdate(order.id, 'PROCESSING')}
                              >
                                Start Processing
                              </Button>
                            )}
                            {order.status === 'PROCESSING' && (
                              <Button
                                variant="secondary"
                                size="sm"
                                className="text-xs"
                                leftIcon={<Truck className="h-3.5 w-3.5" />}
                                onClick={() => setShippingModalOrderId(order.id)}
                              >
                                Mark Shipped
                              </Button>
                            )}
                            {order.status === 'SHIPPED' && (
                              <span className="text-xs text-gray-400">In Transit</span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded line items */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} className="bg-gray-50 px-8 py-3">
                            <table className="w-full">
                              <thead>
                                <tr>
                                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">Product</th>
                                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">SKU</th>
                                  <th className="px-3 py-1.5 text-center text-xs font-medium text-gray-500">Qty</th>
                                  <th className="px-3 py-1.5 text-right text-xs font-medium text-gray-500">Unit Price</th>
                                  <th className="px-3 py-1.5 text-right text-xs font-medium text-gray-500">Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {order.lines.map((line) => (
                                  <tr key={line.id}>
                                    <td className="px-3 py-2 text-sm text-dark">{line.productName}</td>
                                    <td className="px-3 py-2 text-sm font-mono text-gray-500">{line.sku}</td>
                                    <td className="px-3 py-2 text-sm text-center">{line.qty}</td>
                                    <td className="px-3 py-2 text-sm font-mono text-right">{formatCurrency(line.unitPrice)}</td>
                                    <td className="px-3 py-2 text-sm font-mono font-semibold text-right">{formatCurrency(line.lineTotal)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Shipping Modal */}
      <Modal
        isOpen={!!shippingModalOrderId}
        onClose={() => setShippingModalOrderId(null)}
        title="Add Tracking Information"
        size="sm"
      >
        <div className="space-y-4">
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
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShippingModalOrderId(null)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              leftIcon={<Send className="h-4 w-4" />}
              onClick={handleShipOrder}
              disabled={!trackingNumber.trim()}
            >
              Mark Shipped
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
