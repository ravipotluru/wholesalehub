'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ClipboardList,
  Package,
  AlertTriangle,
  TrendingUp,
  Plus,
  ScanBarcode,
  Eye,
  ChevronRight,
  Truck,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { KpiCard } from '@/components/ui/KpiCard';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton, TableRowSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { formatDate } from '@/lib/utils';

// ---------- Types ----------
interface ReceiptLine {
  received: number;
  total: number;
}

interface InventoryReceipt {
  id: string;
  receiptNumber: string;
  supplierName: string;
  poNumber: string;
  expectedDate: string;
  status: 'AWAITING_ARRIVAL' | 'PARTIAL_RECEIVED' | 'FULLY_RECEIVED';
  lines: ReceiptLine;
  completedAt?: string;
}

interface ReceivingKPIs {
  receiptsToday: number;
  itemsReceived: number;
  openDiscrepancies: number;
  onTimePercent: number;
}

// ---------- Mock Data ----------
const MOCK_KPIS: ReceivingKPIs = {
  receiptsToday: 12,
  itemsReceived: 347,
  openDiscrepancies: 3,
  onTimePercent: 94.2,
};

const MOCK_RECEIPTS: InventoryReceipt[] = [
  {
    id: '1',
    receiptNumber: 'RCP-A1B2C3',
    supplierName: 'Pacific Wholesale Distribution',
    poNumber: 'PO-2026-0041',
    expectedDate: '2026-02-15',
    status: 'AWAITING_ARRIVAL',
    lines: { received: 0, total: 8 },
  },
  {
    id: '2',
    receiptNumber: 'RCP-D4E5F6',
    supplierName: 'National Tobacco Supply Co.',
    poNumber: 'PO-2026-0038',
    expectedDate: '2026-02-14',
    status: 'AWAITING_ARRIVAL',
    lines: { received: 0, total: 5 },
  },
  {
    id: '3',
    receiptNumber: 'RCP-G7H8I9',
    supplierName: 'SmokeWave Distributors',
    poNumber: 'PO-2026-0035',
    expectedDate: '2026-02-14',
    status: 'PARTIAL_RECEIVED',
    lines: { received: 6, total: 10 },
  },
  {
    id: '4',
    receiptNumber: 'RCP-J0K1L2',
    supplierName: 'Empire Glass & Accessories',
    poNumber: 'PO-2026-0032',
    expectedDate: '2026-02-13',
    status: 'PARTIAL_RECEIVED',
    lines: { received: 3, total: 7 },
  },
  {
    id: '5',
    receiptNumber: 'RCP-M3N4O5',
    supplierName: 'Pacific Wholesale Distribution',
    poNumber: 'PO-2026-0028',
    expectedDate: '2026-02-12',
    status: 'FULLY_RECEIVED',
    lines: { received: 12, total: 12 },
    completedAt: '2026-02-12T14:30:00Z',
  },
  {
    id: '6',
    receiptNumber: 'RCP-P6Q7R8',
    supplierName: 'Delta Vape Supply',
    poNumber: 'PO-2026-0025',
    expectedDate: '2026-02-11',
    status: 'FULLY_RECEIVED',
    lines: { received: 4, total: 4 },
    completedAt: '2026-02-11T09:15:00Z',
  },
];

// ---------- Helper Components ----------
function StatusBadge({ status }: { status: InventoryReceipt['status'] }) {
  const config: Record<InventoryReceipt['status'], { variant: 'info' | 'warning' | 'success'; label: string }> = {
    AWAITING_ARRIVAL: { variant: 'info', label: 'Awaiting Arrival' },
    PARTIAL_RECEIVED: { variant: 'warning', label: 'In Progress' },
    FULLY_RECEIVED: { variant: 'success', label: 'Completed' },
  };
  const { variant, label } = config[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function ProgressBar({ received, total }: { received: number; total: number }) {
  const percent = total > 0 ? Math.round((received / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-teal rounded-full transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-500 w-10 text-right">{percent}%</span>
    </div>
  );
}

function ReceiptTableRow({
  receipt,
  showProgress,
  onView,
}: {
  receipt: InventoryReceipt;
  showProgress?: boolean;
  onView: (id: string) => void;
}) {
  return (
    <tr className="hover:bg-gray-50/50 transition-colors">
      <td className="px-4 py-3">
        <span className="font-mono text-sm font-medium text-brand-blue">{receipt.receiptNumber}</span>
      </td>
      <td className="px-4 py-3 text-sm text-dark">{receipt.supplierName}</td>
      <td className="px-4 py-3">
        <span className="font-mono text-sm text-gray-600">{receipt.poNumber}</span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(receipt.expectedDate)}</td>
      <td className="px-4 py-3">
        <StatusBadge status={receipt.status} />
      </td>
      <td className="px-4 py-3">
        {showProgress ? (
          <ProgressBar received={receipt.lines.received} total={receipt.lines.total} />
        ) : (
          <span className="text-sm text-gray-600">
            {receipt.lines.received}/{receipt.lines.total}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => onView(receipt.id)}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-teal hover:text-brand-teal-dark transition-colors"
        >
          <Eye className="h-4 w-4" />
          View
        </button>
      </td>
    </tr>
  );
}

// ---------- Section Table ----------
function ReceiptSection({
  title,
  icon: Icon,
  receipts,
  isLoading,
  showProgress,
  onView,
  emptyMessage,
}: {
  title: string;
  icon: React.ElementType;
  receipts: InventoryReceipt[];
  isLoading: boolean;
  showProgress?: boolean;
  onView: (id: string) => void;
  emptyMessage: string;
}) {
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-brand-teal" />
          <h2 className="text-lg font-semibold text-dark">{title}</h2>
          <Badge variant="default">{receipts.length}</Badge>
        </div>
      </div>

      {isLoading ? (
        <table className="w-full">
          <tbody>
            {Array.from({ length: 3 }).map((_, i) => (
              <TableRowSkeleton key={i} cols={7} />
            ))}
          </tbody>
        </table>
      ) : receipts.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-400">{emptyMessage}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Receipt #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Supplier</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">PO #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Expected Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {showProgress ? 'Progress' : 'Lines'}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {receipts.map((receipt) => (
                <ReceiptTableRow
                  key={receipt.id}
                  receipt={receipt}
                  showProgress={showProgress}
                  onView={onView}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------- Loading Skeleton ----------
function KpiSkeleton() {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <Skeleton className="w-24 h-4" />
        <Skeleton variant="rectangular" className="w-10 h-10 rounded-lg" />
      </div>
      <Skeleton className="w-16 h-8 mt-1" />
      <Skeleton className="w-20 h-3 mt-2" />
    </div>
  );
}

// ---------- Main Page ----------
export default function InventoryReceivingPage() {
  const router = useRouter();
  const [kpis] = useState<ReceivingKPIs>(MOCK_KPIS);

  // Fetch receipts (uses mock data until API route exists)
  const { data: receipts, isLoading, error, refetch } = useQuery<InventoryReceipt[]>({
    queryKey: ['inventory-receipts'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/inventory/receipts');
        if (!res.ok) throw new Error('API not available');
        return res.json();
      } catch {
        // Fallback to mock data until the API exists
        return MOCK_RECEIPTS;
      }
    },
  });

  const expected = (receipts ?? []).filter((r) => r.status === 'AWAITING_ARRIVAL');
  const inProgress = (receipts ?? []).filter((r) => r.status === 'PARTIAL_RECEIVED');
  const completed = (receipts ?? []).filter((r) => r.status === 'FULLY_RECEIVED');

  const handleView = (id: string) => {
    router.push(`/inventory/receive/${id}`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark">Inventory Receiving</h1>
          <p className="text-sm text-gray-500 mt-1">Track and manage incoming shipments</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            leftIcon={<ScanBarcode className="h-4 w-4" />}
            onClick={() => router.push('/inventory/receive')}
          >
            Quick Scan
          </Button>
          <Button
            variant="primary"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => router.push('/inventory/receive')}
          >
            Start New Receipt
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Receipts Today"
            value={kpis.receiptsToday}
            icon={ClipboardList}
            change={{ value: 8, label: 'vs yesterday' }}
          />
          <KpiCard
            title="Items Received"
            value={kpis.itemsReceived}
            icon={Package}
            change={{ value: 12, label: 'vs yesterday' }}
          />
          <KpiCard
            title="Open Discrepancies"
            value={kpis.openDiscrepancies}
            icon={AlertTriangle}
            valueColor={kpis.openDiscrepancies > 0 ? 'text-status-error' : undefined}
            change={
              kpis.openDiscrepancies > 0
                ? { value: -2, label: 'vs last week' }
                : undefined
            }
          />
          <KpiCard
            title="On-Time %"
            value={`${kpis.onTimePercent}%`}
            icon={TrendingUp}
            change={{ value: 1.5, label: 'vs last month' }}
          />
        </div>
      )}

      {/* Error State */}
      {error && (
        <ErrorBanner
          message="Failed to load inventory receipts. Please try again."
          onRetry={() => refetch()}
        />
      )}

      {/* Expected Shipments */}
      <ReceiptSection
        title="Expected Shipments"
        icon={Truck}
        receipts={expected}
        isLoading={isLoading}
        onView={handleView}
        emptyMessage="No shipments awaiting arrival"
      />

      {/* In Progress */}
      <ReceiptSection
        title="In Progress"
        icon={Clock}
        receipts={inProgress}
        isLoading={isLoading}
        showProgress
        onView={handleView}
        emptyMessage="No receipts currently in progress"
      />

      {/* Recent Completed */}
      <ReceiptSection
        title="Recently Completed"
        icon={CheckCircle2}
        receipts={completed}
        isLoading={isLoading}
        onView={handleView}
        emptyMessage="No completed receipts yet"
      />
    </div>
  );
}
