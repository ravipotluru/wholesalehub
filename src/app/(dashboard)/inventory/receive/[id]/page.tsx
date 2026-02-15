'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Camera,
  ClipboardCheck,
  Truck,
  Package,
  AlertTriangle,
  CheckCircle2,
  Clock,
  PenLine,
  Hash,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { KpiCard } from '@/components/ui/KpiCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Select } from '@/components/ui/Select';
import { ScannerModal } from '@/components/inventory/ScannerModal';
import { ReceivingProgress } from '@/components/inventory/ReceivingProgress';
import { cn, formatDate } from '@/lib/utils';
import { toast } from 'sonner';

// ---------- Types ----------

type LineStatus = 'PENDING' | 'RECEIVED' | 'PARTIAL' | 'SHORT';
type Condition = 'GOOD' | 'DAMAGED' | 'WRONG_ITEM';
type ReceiptStatus = 'AWAITING_ARRIVAL' | 'RECEIVING' | 'COMPLETED';
type DiscrepancyResolution = 'ACCEPT_AS_IS' | 'RETURN' | 'CREDIT_REQUEST' | 'DESTROY';

interface ReceiptLineItem {
  id: string;
  lineNumber: number;
  productName: string;
  sku: string;
  expectedQty: number;
  receivedQty: number;
  condition: Condition;
  status: LineStatus;
  notes: string;
}

interface ReceiptDiscrepancy {
  id: string;
  lineNumber: number;
  productName: string;
  type: 'SHORT' | 'OVER' | 'DAMAGED';
  expectedQty: number;
  receivedQty: number;
  variance: number;
  resolution: DiscrepancyResolution | null;
}

interface ReceiptDetail {
  id: string;
  receiptNumber: string;
  supplierName: string;
  poNumber: string;
  status: ReceiptStatus;
  carrier: string;
  trackingNumber: string;
  expectedDate: string;
  lines: ReceiptLineItem[];
  discrepancies: ReceiptDiscrepancy[];
}

// ---------- Mock Data ----------

function getMockReceipt(id: string): ReceiptDetail {
  return {
    id,
    receiptNumber: 'RCP-A1B2C3',
    supplierName: 'Pacific Wholesale Distribution',
    poNumber: 'PO-2026-0041',
    status: 'RECEIVING',
    carrier: 'FedEx Freight',
    trackingNumber: '7489201347856',
    expectedDate: '2026-02-15',
    lines: [
      { id: 'l1', lineNumber: 1, productName: 'RAZ CA6000 Disposable Vape - Blue Razz', sku: 'RAZ-CA6K-BR', expectedQty: 100, receivedQty: 100, condition: 'GOOD', status: 'RECEIVED', notes: '' },
      { id: 'l2', lineNumber: 2, productName: 'Fume Infinity Disposable - Strawberry Banana', sku: 'FUME-INF-SB', expectedQty: 80, receivedQty: 80, condition: 'GOOD', status: 'RECEIVED', notes: '' },
      { id: 'l3', lineNumber: 3, productName: 'ZYN Nicotine Pouches 6mg - Wintergreen', sku: 'ZYN-6MG-WG', expectedQty: 200, receivedQty: 150, condition: 'GOOD', status: 'PARTIAL', notes: 'Partial shipment, rest on backorder' },
      { id: 'l4', lineNumber: 4, productName: 'BIC Classic Lighter - Assorted 50pk', sku: 'BIC-CL-50PK', expectedQty: 30, receivedQty: 30, condition: 'GOOD', status: 'RECEIVED', notes: '' },
      { id: 'l5', lineNumber: 5, productName: 'RAW Classic Rolling Papers King Size', sku: 'RAW-CL-KS', expectedQty: 500, receivedQty: 480, condition: 'DAMAGED', status: 'SHORT', notes: '20 units water damaged' },
      { id: 'l6', lineNumber: 6, productName: 'Lost Mary OS5000 - Watermelon', sku: 'LM-OS5K-WM', expectedQty: 60, receivedQty: 60, condition: 'GOOD', status: 'RECEIVED', notes: '' },
      { id: 'l7', lineNumber: 7, productName: 'Elf Bar BC5000 - Mango Peach', sku: 'ELF-BC5K-MP', expectedQty: 75, receivedQty: 0, condition: 'GOOD', status: 'PENDING', notes: '' },
      { id: 'l8', lineNumber: 8, productName: 'Clipper Lighter - Hemp Leaves 48ct', sku: 'CLIP-HEMP-48', expectedQty: 20, receivedQty: 0, condition: 'GOOD', status: 'PENDING', notes: '' },
    ],
    discrepancies: [
      { id: 'd1', lineNumber: 3, productName: 'ZYN Nicotine Pouches 6mg - Wintergreen', type: 'SHORT', expectedQty: 200, receivedQty: 150, variance: -50, resolution: null },
      { id: 'd2', lineNumber: 5, productName: 'RAW Classic Rolling Papers King Size', type: 'DAMAGED', expectedQty: 500, receivedQty: 480, variance: -20, resolution: 'CREDIT_REQUEST' },
    ],
  };
}

// ---------- Helpers ----------

function getLineStatusBadge(status: LineStatus) {
  const config: Record<LineStatus, { variant: 'success' | 'warning' | 'error' | 'default'; label: string }> = {
    RECEIVED: { variant: 'success', label: 'Received' },
    PARTIAL: { variant: 'warning', label: 'Partial' },
    SHORT: { variant: 'error', label: 'Short' },
    PENDING: { variant: 'default', label: 'Pending' },
  };
  const { variant, label } = config[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function getRowBg(status: LineStatus): string {
  switch (status) {
    case 'RECEIVED': return 'bg-success/5';
    case 'PARTIAL': return 'bg-status-warning/5';
    case 'SHORT': return 'bg-status-error/5';
    case 'PENDING': return 'bg-gray-50/50';
  }
}

const CONDITION_OPTIONS = [
  { value: 'GOOD', label: 'Good' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'WRONG_ITEM', label: 'Wrong Item' },
];

const RESOLUTION_OPTIONS = [
  { value: '', label: 'Select resolution...' },
  { value: 'ACCEPT_AS_IS', label: 'Accept As-Is' },
  { value: 'RETURN', label: 'Return to Supplier' },
  { value: 'CREDIT_REQUEST', label: 'Request Credit' },
  { value: 'DESTROY', label: 'Destroy / Discard' },
];

// ---------- Loading Skeleton ----------

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="w-8 h-8" variant="circular" />
        <Skeleton className="w-64 h-8" />
      </div>
      <Skeleton className="w-full h-4" variant="rectangular" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" variant="rectangular" />
        ))}
      </div>
      <Skeleton className="w-full h-64" variant="rectangular" />
    </div>
  );
}

// ---------- Main Page ----------

export default function ReceiptDetailPage() {
  const params = useParams();
  const router = useRouter();
  const receiptId = params.id as string;

  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptDetail>(() => getMockReceipt(receiptId));
  const [scannerOpen, setScannerOpen] = useState(false);

  // Computed stats
  const stats = useMemo(() => {
    const total = receipt.lines.length;
    const received = receipt.lines.filter((l) => l.status === 'RECEIVED').length;
    const pending = receipt.lines.filter((l) => l.status === 'PENDING').length;
    const discrepancies = receipt.discrepancies.length;
    return { total, received, pending, discrepancies };
  }, [receipt]);

  const receivedLineCount = receipt.lines.filter(
    (l) => l.status === 'RECEIVED' || l.status === 'PARTIAL' || l.status === 'SHORT',
  ).length;

  const allLinesDone = receipt.lines.every((l) => l.status !== 'PENDING');

  // Handlers
  const handleReceivedQtyChange = (lineId: string, value: number) => {
    setReceipt((prev) => ({
      ...prev,
      lines: prev.lines.map((l) => {
        if (l.id !== lineId) return l;
        const newQty = Math.max(0, value);
        let newStatus: LineStatus = 'PENDING';
        if (newQty === 0) newStatus = 'PENDING';
        else if (newQty >= l.expectedQty) newStatus = 'RECEIVED';
        else newStatus = 'PARTIAL';
        return { ...l, receivedQty: newQty, status: newStatus };
      }),
    }));
  };

  const handleConditionChange = (lineId: string, condition: Condition) => {
    setReceipt((prev) => ({
      ...prev,
      lines: prev.lines.map((l) =>
        l.id === lineId ? { ...l, condition } : l,
      ),
    }));
  };

  const handleNotesChange = (lineId: string, notes: string) => {
    setReceipt((prev) => ({
      ...prev,
      lines: prev.lines.map((l) =>
        l.id === lineId ? { ...l, notes } : l,
      ),
    }));
  };

  const handleResolutionChange = (discrepancyId: string, resolution: string) => {
    setReceipt((prev) => ({
      ...prev,
      discrepancies: prev.discrepancies.map((d) =>
        d.id === discrepancyId
          ? { ...d, resolution: resolution as DiscrepancyResolution }
          : d,
      ),
    }));
  };

  const handleScanComplete = (barcode: string, productName: string) => {
    // Find line matching the barcode/product and mark received
    const matchingLine = receipt.lines.find(
      (l) => l.productName === productName && l.status === 'PENDING',
    );
    if (matchingLine) {
      handleReceivedQtyChange(matchingLine.id, matchingLine.expectedQty);
      toast.success(`Scanned: ${productName}`);
    }
  };

  const handleCompleteReceipt = () => {
    setReceipt((prev) => ({ ...prev, status: 'COMPLETED' }));
    toast.success('Receipt completed successfully!');
  };

  // States
  if (isLoading) return <PageSkeleton />;

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => router.push('/inventory')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-dark mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Inventory
        </button>
        <ErrorBanner message={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="max-w-6xl mx-auto">
        <EmptyState
          icon="package"
          title="Receipt not found"
          description="The receipt you are looking for does not exist."
          actionLabel="Back to Inventory"
          onAction={() => router.push('/inventory')}
        />
      </div>
    );
  }

  const statusBadge: Record<ReceiptStatus, { variant: 'info' | 'warning' | 'success'; label: string }> = {
    AWAITING_ARRIVAL: { variant: 'info', label: 'Awaiting Arrival' },
    RECEIVING: { variant: 'warning', label: 'Receiving' },
    COMPLETED: { variant: 'success', label: 'Completed' },
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <button
            onClick={() => router.push('/inventory')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors mt-1"
          >
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold font-mono text-brand-blue">
                {receipt.receiptNumber}
              </h1>
              <Badge variant={statusBadge[receipt.status].variant}>
                {statusBadge[receipt.status].label}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
              <span>
                <strong className="text-dark">Supplier:</strong> {receipt.supplierName}
              </span>
              <span>
                <strong className="text-dark">PO #:</strong>{' '}
                <span className="font-mono">{receipt.poNumber}</span>
              </span>
              <span>
                <strong className="text-dark">Expected:</strong> {formatDate(receipt.expectedDate)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 mt-1">
              <span>
                <Truck className="h-3.5 w-3.5 inline mr-1" />
                {receipt.carrier}
              </span>
              <span className="font-mono">{receipt.trackingNumber}</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            leftIcon={<Camera className="h-4 w-4" />}
            onClick={() => setScannerOpen(true)}
            disabled={receipt.status === 'COMPLETED'}
          >
            Start Scanning
          </Button>
          <Button
            variant="outline"
            leftIcon={<PenLine className="h-4 w-4" />}
            disabled={receipt.status === 'COMPLETED'}
          >
            Add Manual Entry
          </Button>
          <Button
            variant="ghost"
            className={cn(
              'bg-success text-white hover:bg-success/90',
              !allLinesDone && 'opacity-50 cursor-not-allowed',
            )}
            leftIcon={<ClipboardCheck className="h-4 w-4" />}
            disabled={!allLinesDone || receipt.status === 'COMPLETED'}
            onClick={handleCompleteReceipt}
          >
            Complete Receipt
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <ReceivingProgress
        totalLines={receipt.lines.length}
        receivedLines={receivedLineCount}
        discrepancyCount={receipt.discrepancies.length}
      />

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Lines" value={stats.total} icon={Package} />
        <KpiCard title="Received" value={stats.received} icon={CheckCircle2} valueColor="text-success" />
        <KpiCard title="Pending" value={stats.pending} icon={Clock} valueColor="text-status-warning" />
        <KpiCard
          title="Discrepancies"
          value={stats.discrepancies}
          icon={AlertTriangle}
          valueColor={stats.discrepancies > 0 ? 'text-status-error' : undefined}
        />
      </div>

      {/* Line Items Table */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <CardTitle>Line Items</CardTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Product / SKU</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Expected Qty</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Received Qty</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Condition</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {receipt.lines.map((line) => (
                <tr key={line.id} className={cn('transition-colors', getRowBg(line.status))}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-500">{line.lineNumber}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-dark">{line.productName}</p>
                    <p className="text-xs font-mono text-gray-400">{line.sku}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-mono font-semibold text-dark">{line.expectedQty}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="number"
                      min={0}
                      value={line.receivedQty}
                      onChange={(e) => handleReceivedQtyChange(line.id, parseInt(e.target.value, 10) || 0)}
                      disabled={receipt.status === 'COMPLETED'}
                      className="w-20 text-center text-sm font-mono font-semibold border border-gray-300 rounded-md py-1 focus:outline-none focus:ring-2 focus:ring-brand-teal/50 disabled:opacity-50 disabled:bg-gray-100"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <select
                      value={line.condition}
                      onChange={(e) => handleConditionChange(line.id, e.target.value as Condition)}
                      disabled={receipt.status === 'COMPLETED'}
                      className="text-xs border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-teal/50 disabled:opacity-50"
                    >
                      {CONDITION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {getLineStatusBadge(line.status)}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={line.notes}
                      onChange={(e) => handleNotesChange(line.id, e.target.value)}
                      placeholder="Add note..."
                      disabled={receipt.status === 'COMPLETED'}
                      className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-teal/50 disabled:opacity-50"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Discrepancies Section */}
      {receipt.discrepancies.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-status-error" />
            <CardTitle>Discrepancies</CardTitle>
            <Badge variant="error">{receipt.discrepancies.length}</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Line #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Expected</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Received</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Variance</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Resolution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {receipt.discrepancies.map((disc) => (
                  <tr key={disc.id} className="bg-status-error/5">
                    <td className="px-4 py-3 text-sm font-medium text-gray-500">{disc.lineNumber}</td>
                    <td className="px-4 py-3 text-sm text-dark">{disc.productName}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={disc.type === 'OVER' ? 'info' : 'error'}>
                        {disc.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-mono">{disc.expectedQty}</td>
                    <td className="px-4 py-3 text-center text-sm font-mono">{disc.receivedQty}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('text-sm font-bold font-mono', disc.variance < 0 ? 'text-status-error' : 'text-status-info')}>
                        {disc.variance > 0 ? '+' : ''}{disc.variance}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {disc.resolution ? (
                        <Badge variant="success">{disc.resolution.replace(/_/g, ' ')}</Badge>
                      ) : (
                        <select
                          value=""
                          onChange={(e) => handleResolutionChange(disc.id, e.target.value)}
                          className="text-xs border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-teal/50"
                        >
                          {RESOLUTION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Scanner Modal */}
      <ScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        receiptId={receipt.receiptNumber}
        onScanComplete={handleScanComplete}
      />
    </div>
  );
}
