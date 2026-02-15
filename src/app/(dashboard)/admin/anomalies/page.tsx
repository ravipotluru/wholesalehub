'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Flag,
  ShieldAlert,
  TrendingUp,
  Package,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton, TableRowSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { cn, formatDateTime, formatCurrency } from '@/lib/utils';

// ---------- Types ----------
type TabType = 'pricing' | 'orders' | 'inventory';

interface PricingRow {
  id: string;
  product: string;
  supplier: string;
  price: number;
  mean: number;
  zScore: number;
  direction: 'ABOVE' | 'BELOW';
  deviationPercent: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  falsePositive: boolean;
}

interface OrderRow {
  id: string;
  orderNumber: string;
  retailer: string;
  type: string;
  value: number;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  falsePositive: boolean;
}

interface InventoryRow {
  id: string;
  product: string;
  issueType: string;
  stock: number;
  reorderPoint: number;
  daysSince: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  falsePositive: boolean;
}

interface AnomalyData {
  summary: {
    total: number;
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
  lastRunAt: string;
  pricing: PricingRow[];
  orders: OrderRow[];
  inventory: InventoryRow[];
}

// ---------- Mock Data ----------
function generateMockAnomalies(): AnomalyData {
  const now = new Date();

  const pricing: PricingRow[] = [
    { id: 'pa_01', product: 'Disposable Vape Pen 5000', supplier: 'SmokeCity Wholesale', price: 12.99, mean: 7.85, zScore: 3.28, direction: 'ABOVE', deviationPercent: 65.5, severity: 'CRITICAL', falsePositive: false },
    { id: 'pa_02', product: 'Glass Beaker Bong 12"', supplier: 'Pacific Smoke Dist.', price: 2.99, mean: 24.50, zScore: -3.15, direction: 'BELOW', deviationPercent: 87.8, severity: 'CRITICAL', falsePositive: false },
    { id: 'pa_03', product: 'Rolling Papers King Size', supplier: 'Green Leaf Wholesale', price: 2.10, mean: 1.25, zScore: 2.72, direction: 'ABOVE', deviationPercent: 68.0, severity: 'HIGH', falsePositive: false },
    { id: 'pa_04', product: 'CBD Gummies 30ct', supplier: 'Delta Wholesale Corp', price: 8.50, mean: 12.50, zScore: -2.56, direction: 'BELOW', deviationPercent: 32.0, severity: 'HIGH', falsePositive: false },
    { id: 'pa_05', product: 'Herb Grinder 4-piece', supplier: 'BlazeUp Distributors', price: 9.99, mean: 6.50, zScore: 2.31, direction: 'ABOVE', deviationPercent: 53.7, severity: 'MEDIUM', falsePositive: false },
    { id: 'pa_06', product: 'E-Liquid Strawberry 30ml', supplier: 'CloudNine Wholesale', price: 2.10, mean: 3.25, zScore: -2.15, direction: 'BELOW', deviationPercent: 35.4, severity: 'MEDIUM', falsePositive: false },
  ];

  const orders: OrderRow[] = [
    { id: 'oa_01', orderNumber: 'ORD-X92K1-AB3F', retailer: 'QuickStop Gas & Smoke', type: 'LARGE_ORDER', value: 28450.00, description: 'Order value 4.2x above average ($6,750)', severity: 'CRITICAL', falsePositive: false },
    { id: 'oa_02', orderNumber: 'ORD-M8P3R-CD7E', retailer: 'Corner Mart Tobacco', type: 'HIGH_FREQUENCY', value: 3200.00, description: '8 orders in 24 hours (avg: 2/week)', severity: 'HIGH', falsePositive: false },
    { id: 'oa_03', orderNumber: 'ORD-K5N2T-FG1H', retailer: 'SmokeZone Express', type: 'UNUSUAL_HOUR', value: 5100.00, description: 'Order placed at 3:22 AM (normal hours: 8AM-6PM)', severity: 'MEDIUM', falsePositive: false },
    { id: 'oa_04', orderNumber: 'ORD-L7Q4V-IJ9K', retailer: 'QuickStop Gas & Smoke', type: 'DUPLICATE_ORDER', value: 6750.00, description: 'Same items, same quantities as ORD-X92K1 within 2 hours', severity: 'HIGH', falsePositive: false },
    { id: 'oa_05', orderNumber: 'ORD-R1S6W-LM2N', retailer: 'Metro Smoke Shop', type: 'LARGE_ORDER', value: 15800.00, description: 'Order value 2.8x above average ($5,640)', severity: 'HIGH', falsePositive: false },
  ];

  const inventory: InventoryRow[] = [
    { id: 'ia_01', product: 'Disposable Vape Pen 5000', issueType: 'LOW_STOCK', stock: 12, reorderPoint: 100, daysSince: 0, severity: 'CRITICAL', falsePositive: false },
    { id: 'ia_02', product: 'Glass Pipe 4-inch', issueType: 'NEGATIVE_QUANTITY', stock: -5, reorderPoint: 50, daysSince: 0, severity: 'CRITICAL', falsePositive: false },
    { id: 'ia_03', product: 'Blunt Wraps Variety', issueType: 'HIGH_DISCREPANCY', stock: 340, reorderPoint: 200, daysSince: 3, severity: 'HIGH', falsePositive: false },
    { id: 'ia_04', product: 'Incense Sticks 20pk', issueType: 'STALE_INVENTORY', stock: 890, reorderPoint: 100, daysSince: 127, severity: 'MEDIUM', falsePositive: false },
    { id: 'ia_05', product: 'Pre-rolled Cones 6pk', issueType: 'RECEIPT_QTY_ANOMALY', stock: 480, reorderPoint: 200, daysSince: 1, severity: 'MEDIUM', falsePositive: false },
    { id: 'ia_06', product: 'CBD Tincture 500mg', issueType: 'LOW_STOCK', stock: 8, reorderPoint: 40, daysSince: 0, severity: 'HIGH', falsePositive: false },
  ];

  return {
    summary: {
      total: pricing.length + orders.length + inventory.length,
      CRITICAL: 4,
      HIGH: 6,
      MEDIUM: 5,
      LOW: 2,
    },
    lastRunAt: new Date(now.getTime() - 1800000).toISOString(),
    pricing,
    orders,
    inventory,
  };
}

// ---------- Severity Config ----------
const SEVERITY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  CRITICAL: { bg: 'bg-status-error/10', text: 'text-status-error', dot: 'bg-status-error' },
  HIGH: { bg: 'bg-brand-orange/10', text: 'text-brand-orange', dot: 'bg-brand-orange' },
  MEDIUM: { bg: 'bg-status-warning/10', text: 'text-status-warning', dot: 'bg-status-warning' },
  LOW: { bg: 'bg-brand-blue/10', text: 'text-brand-blue', dot: 'bg-brand-blue' },
};

const ORDER_TYPE_BADGE: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  LARGE_ORDER: 'error',
  HIGH_FREQUENCY: 'warning',
  UNUSUAL_HOUR: 'info',
  DUPLICATE_ORDER: 'error',
};

const INVENTORY_ISSUE_BADGE: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  LOW_STOCK: 'error',
  NEGATIVE_QUANTITY: 'error',
  HIGH_DISCREPANCY: 'warning',
  STALE_INVENTORY: 'info',
  RECEIPT_QTY_ANOMALY: 'warning',
};

// ---------- Helper Components ----------
function SeverityBadge({ severity }: { severity: string }) {
  const config = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.LOW;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', config.bg, config.text)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dot)} />
      {severity}
    </span>
  );
}

function SummaryCard({ label, count, color, icon: Icon }: { label: string; count: number; color: string; icon: typeof AlertTriangle }) {
  return (
    <div className={cn('rounded-xl p-4 border', color)}>
      <div className="flex items-center justify-between mb-2">
        <Icon className="h-5 w-5 opacity-70" />
        <span className="text-2xl font-bold">{count}</span>
      </div>
      <p className="text-xs font-medium opacity-80">{label}</p>
    </div>
  );
}

function AnomaliesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card">
            <Skeleton className="w-full h-16" />
          </div>
        ))}
      </div>
      <Card padding="none">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/50">
              {Array.from({ length: 7 }).map((_, i) => (
                <th key={i} className="table-header"><Skeleton className="w-16 h-4" /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <TableRowSkeleton key={i} cols={7} />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ---------- Main Page ----------
export default function AnomaliesPage() {
  const [activeTab, setActiveTab] = useState<TabType>('pricing');
  const queryClient = useQueryClient();

  // Track false positives locally
  const [fpIds, setFpIds] = useState<Set<string>>(new Set());

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<AnomalyData>({
    queryKey: ['admin-anomalies'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/admin/anomalies');
        if (!res.ok) throw new Error('API not available');
        const report = await res.json();
        // Normalize API response to our page shape
        return {
          summary: report.summary ?? { total: 0, CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
          lastRunAt: report.generatedAt ?? new Date().toISOString(),
          pricing: (report.pricingAnomalies ?? []).map((a: Record<string, unknown>, i: number) => ({
            id: (a.id as string) ?? `pa_${i}`,
            product: (a.productName as string) ?? 'Unknown',
            supplier: (a.wholesalerName as string) ?? 'Unknown',
            price: (a.currentPrice as number) ?? 0,
            mean: (a.meanPrice as number) ?? 0,
            zScore: (a.zScore as number) ?? 0,
            direction: (a.direction as string) ?? 'ABOVE',
            deviationPercent: (a.percentDeviation as number) ?? 0,
            severity: (a.severity as string) ?? 'LOW',
            falsePositive: false,
          })),
          orders: (report.orderAnomalies ?? []).map((a: Record<string, unknown>, i: number) => ({
            id: (a.id as string) ?? `oa_${i}`,
            orderNumber: (a.entityId as string) ?? 'N/A',
            retailer: ((a.metadata as Record<string, unknown>)?.retailerName as string) ?? 'Unknown',
            type: (a.type as string) ?? 'LARGE_ORDER',
            value: ((a.metadata as Record<string, unknown>)?.orderValue as number) ?? 0,
            description: (a.description as string) ?? '',
            severity: (a.severity as string) ?? 'LOW',
            falsePositive: false,
          })),
          inventory: (report.inventoryAnomalies ?? []).map((a: Record<string, unknown>, i: number) => ({
            id: (a.id as string) ?? `ia_${i}`,
            product: ((a.metadata as Record<string, unknown>)?.productName as string) ?? 'Unknown',
            issueType: (a.type as string) ?? 'LOW_STOCK',
            stock: ((a.metadata as Record<string, unknown>)?.currentStock as number) ?? 0,
            reorderPoint: ((a.metadata as Record<string, unknown>)?.reorderPoint as number) ?? 0,
            daysSince: ((a.metadata as Record<string, unknown>)?.daysSince as number) ?? 0,
            severity: (a.severity as string) ?? 'LOW',
            falsePositive: false,
          })),
        } as AnomalyData;
      } catch {
        return generateMockAnomalies();
      }
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/anomalies', { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-anomalies'] });
    },
  });

  const markFP = useCallback((id: string) => {
    setFpIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const tabs: { key: TabType; label: string }[] = [
    { key: 'pricing', label: 'Pricing' },
    { key: 'orders', label: 'Orders' },
    { key: 'inventory', label: 'Inventory' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-orange/10 rounded-lg flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-brand-orange" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-dark">Anomaly Detection</h1>
            <p className="text-sm text-gray-500">
              Z-score pricing, order pattern, and inventory shortage analysis
              {data && (
                <span className="ml-2 text-gray-400">
                  | Last run: {formatDateTime(data.lastRunAt)}
                </span>
              )}
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<RefreshCw className="h-4 w-4" />}
          onClick={() => runMutation.mutate()}
          isLoading={runMutation.isPending}
        >
          Run Detection
        </Button>
      </div>

      {/* Error Banner */}
      {error && (
        <ErrorBanner
          message="Failed to load anomaly data. Showing mock data."
          onRetry={() => refetch()}
        />
      )}

      {/* Loading */}
      {isLoading && <AnomaliesSkeleton />}

      {/* Content */}
      {data && !isLoading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <SummaryCard
              label="Total Anomalies"
              count={data.summary.total}
              color="bg-gray-50 border-gray-200 text-dark"
              icon={AlertTriangle}
            />
            <SummaryCard
              label="Critical"
              count={data.summary.CRITICAL}
              color="bg-status-error/5 border-status-error/20 text-status-error"
              icon={ShieldAlert}
            />
            <SummaryCard
              label="High"
              count={data.summary.HIGH}
              color="bg-brand-orange/5 border-brand-orange/20 text-brand-orange"
              icon={TrendingUp}
            />
            <SummaryCard
              label="Medium"
              count={data.summary.MEDIUM}
              color="bg-status-warning/5 border-status-warning/20 text-status-warning"
              icon={Flag}
            />
            <SummaryCard
              label="Low"
              count={data.summary.LOW}
              color="bg-brand-blue/5 border-brand-blue/20 text-brand-blue"
              icon={Package}
            />
          </div>

          {/* Tab Bar */}
          <div className="flex items-center gap-0 border-b border-gray-200">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'px-6 py-3 text-sm font-medium border-b-2 transition-colors duration-200',
                  activeTab === tab.key
                    ? 'border-brand-blue text-brand-blue'
                    : 'border-transparent text-gray-500 hover:text-brand-blue hover:border-gray-300'
                )}
              >
                {tab.label}
                <span className={cn(
                  'ml-2 text-xs rounded-full px-2 py-0.5',
                  activeTab === tab.key ? 'bg-brand-blue/10 text-brand-blue' : 'bg-gray-100 text-gray-500'
                )}>
                  {tab.key === 'pricing' ? data.pricing.length : tab.key === 'orders' ? data.orders.length : data.inventory.length}
                </span>
              </button>
            ))}
          </div>

          {/* Pricing Tab */}
          {activeTab === 'pricing' && (
            data.pricing.length === 0 ? (
              <EmptyState icon="search" title="No pricing anomalies" description="No pricing anomalies detected in the current scan." />
            ) : (
              <Card padding="none" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50/50">
                        <th className="table-header">Product</th>
                        <th className="table-header">Supplier</th>
                        <th className="table-header text-right">Price</th>
                        <th className="table-header text-right">Mean</th>
                        <th className="table-header text-right">Z-Score</th>
                        <th className="table-header text-center">Direction</th>
                        <th className="table-header text-right">Deviation</th>
                        <th className="table-header">Severity</th>
                        <th className="table-header w-28">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.pricing.map((row) => {
                        const isFp = fpIds.has(row.id);
                        return (
                          <tr key={row.id} className={cn('transition-colors', isFp ? 'opacity-50 bg-gray-50' : 'hover:bg-gray-50/50')}>
                            <td className="table-cell text-sm font-medium text-dark">{row.product}</td>
                            <td className="table-cell text-sm text-gray-600">{row.supplier}</td>
                            <td className="table-cell text-right font-mono text-sm text-dark">{formatCurrency(row.price)}</td>
                            <td className="table-cell text-right font-mono text-sm text-gray-500">{formatCurrency(row.mean)}</td>
                            <td className="table-cell text-right">
                              <span className={cn(
                                'font-mono text-sm font-semibold',
                                Math.abs(row.zScore) >= 3 ? 'text-status-error' : Math.abs(row.zScore) >= 2.5 ? 'text-brand-orange' : 'text-status-warning'
                              )}>
                                {row.zScore > 0 ? '+' : ''}{row.zScore.toFixed(2)}
                              </span>
                            </td>
                            <td className="table-cell text-center">
                              {row.direction === 'ABOVE' ? (
                                <ArrowUpRight className="h-4 w-4 text-status-error inline" />
                              ) : (
                                <ArrowDownRight className="h-4 w-4 text-success inline" />
                              )}
                            </td>
                            <td className="table-cell text-right text-sm font-semibold text-dark">{row.deviationPercent.toFixed(1)}%</td>
                            <td className="table-cell"><SeverityBadge severity={row.severity} /></td>
                            <td className="table-cell">
                              {isFp ? (
                                <span className="text-xs text-gray-400 italic">Marked FP</span>
                              ) : (
                                <button
                                  onClick={() => markFP(row.id)}
                                  className="text-xs font-medium text-brand-teal hover:underline"
                                >
                                  Mark False Positive
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )
          )}

          {/* Orders Tab */}
          {activeTab === 'orders' && (
            data.orders.length === 0 ? (
              <EmptyState icon="search" title="No order anomalies" description="No order pattern anomalies detected in the current scan." />
            ) : (
              <Card padding="none" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50/50">
                        <th className="table-header">Order #</th>
                        <th className="table-header">Retailer</th>
                        <th className="table-header">Type</th>
                        <th className="table-header text-right">Value</th>
                        <th className="table-header">Description</th>
                        <th className="table-header">Severity</th>
                        <th className="table-header w-28">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.orders.map((row) => {
                        const isFp = fpIds.has(row.id);
                        return (
                          <tr key={row.id} className={cn('transition-colors', isFp ? 'opacity-50 bg-gray-50' : 'hover:bg-gray-50/50')}>
                            <td className="table-cell">
                              <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{row.orderNumber}</code>
                            </td>
                            <td className="table-cell text-sm text-dark">{row.retailer}</td>
                            <td className="table-cell">
                              <Badge variant={ORDER_TYPE_BADGE[row.type] ?? 'default'}>
                                {row.type.replace(/_/g, ' ')}
                              </Badge>
                            </td>
                            <td className="table-cell text-right font-mono text-sm text-dark">{formatCurrency(row.value)}</td>
                            <td className="table-cell text-xs text-gray-600 max-w-[240px]">{row.description}</td>
                            <td className="table-cell"><SeverityBadge severity={row.severity} /></td>
                            <td className="table-cell">
                              {isFp ? (
                                <span className="text-xs text-gray-400 italic">Marked FP</span>
                              ) : (
                                <button
                                  onClick={() => markFP(row.id)}
                                  className="text-xs font-medium text-brand-teal hover:underline"
                                >
                                  Mark False Positive
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )
          )}

          {/* Inventory Tab */}
          {activeTab === 'inventory' && (
            data.inventory.length === 0 ? (
              <EmptyState icon="search" title="No inventory anomalies" description="No inventory anomalies detected in the current scan." />
            ) : (
              <Card padding="none" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50/50">
                        <th className="table-header">Product</th>
                        <th className="table-header">Issue Type</th>
                        <th className="table-header text-right">Stock</th>
                        <th className="table-header text-right">Reorder Pt</th>
                        <th className="table-header text-right">Days Since</th>
                        <th className="table-header">Severity</th>
                        <th className="table-header w-28">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.inventory.map((row) => {
                        const isFp = fpIds.has(row.id);
                        return (
                          <tr key={row.id} className={cn('transition-colors', isFp ? 'opacity-50 bg-gray-50' : 'hover:bg-gray-50/50')}>
                            <td className="table-cell text-sm font-medium text-dark">{row.product}</td>
                            <td className="table-cell">
                              <Badge variant={INVENTORY_ISSUE_BADGE[row.issueType] ?? 'default'}>
                                {row.issueType.replace(/_/g, ' ')}
                              </Badge>
                            </td>
                            <td className="table-cell text-right">
                              <span className={cn(
                                'font-mono text-sm font-semibold',
                                row.stock < 0 ? 'text-status-error' : row.stock <= row.reorderPoint ? 'text-brand-orange' : 'text-dark'
                              )}>
                                {row.stock.toLocaleString()}
                              </span>
                            </td>
                            <td className="table-cell text-right font-mono text-sm text-gray-500">{row.reorderPoint.toLocaleString()}</td>
                            <td className="table-cell text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Clock className="h-3 w-3 text-gray-400" />
                                <span className="text-sm text-dark">{row.daysSince}d</span>
                              </div>
                            </td>
                            <td className="table-cell"><SeverityBadge severity={row.severity} /></td>
                            <td className="table-cell">
                              {isFp ? (
                                <span className="text-xs text-gray-400 italic">Marked FP</span>
                              ) : (
                                <button
                                  onClick={() => markFP(row.id)}
                                  className="text-xs font-medium text-brand-teal hover:underline"
                                >
                                  Mark False Positive
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )
          )}
        </>
      )}

      {/* Overall Empty State */}
      {!isLoading && data && data.summary.total === 0 && (
        <EmptyState
          icon="search"
          title="No anomalies detected"
          description="All metrics are within normal ranges. Run detection again to scan for new anomalies."
          actionLabel="Run Detection"
          onAction={() => runMutation.mutate()}
        />
      )}
    </div>
  );
}
