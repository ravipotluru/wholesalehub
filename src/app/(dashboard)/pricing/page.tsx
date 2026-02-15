'use client';

import { useState, useMemo } from 'react';
import {
  DollarSign,
  Tag,
  TrendingUp,
  BarChart3,
  ArrowDown,
  ArrowUp,
  Minus,
  Upload,
  Clock,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { KpiCard } from '@/components/ui/KpiCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

// ---------- Types ----------

interface PriceComparisonRow {
  id: string;
  productName: string;
  sku: string;
  yourPrice: number;
  marketAvg: number;
  lowestCompetitor: number;
  yourRank: number;
  totalSuppliers: number;
  gapPercent: number;
}

interface ActivePromotion {
  id: string;
  productName: string;
  originalPrice: number;
  promoPrice: number;
  startDate: string;
  endDate: string;
  daysRemaining: number;
}

// ---------- Mock Data ----------

const MOCK_COMPARISONS: PriceComparisonRow[] = [
  { id: '1', productName: 'RAZ CA6000 Disposable Vape - Blue Razz', sku: 'RAZ-CA6K-BR', yourPrice: 8.99, marketAvg: 9.45, lowestCompetitor: 8.25, yourRank: 3, totalSuppliers: 12, gapPercent: 8.97 },
  { id: '2', productName: 'Fume Infinity Disposable - Strawberry Banana', sku: 'FUME-INF-SB', yourPrice: 7.50, marketAvg: 8.10, lowestCompetitor: 7.50, yourRank: 1, totalSuppliers: 9, gapPercent: 0 },
  { id: '3', productName: 'ZYN Nicotine Pouches 6mg - Wintergreen', sku: 'ZYN-6MG-WG', yourPrice: 3.25, marketAvg: 3.40, lowestCompetitor: 3.10, yourRank: 2, totalSuppliers: 15, gapPercent: 4.84 },
  { id: '4', productName: 'BIC Classic Lighter - Assorted 50pk', sku: 'BIC-CL-50PK', yourPrice: 32.00, marketAvg: 30.50, lowestCompetitor: 28.75, yourRank: 7, totalSuppliers: 8, gapPercent: 11.30 },
  { id: '5', productName: 'RAW Classic Rolling Papers King Size', sku: 'RAW-CL-KS', yourPrice: 1.15, marketAvg: 1.20, lowestCompetitor: 1.05, yourRank: 2, totalSuppliers: 11, gapPercent: 9.52 },
  { id: '6', productName: 'Lost Mary OS5000 - Watermelon', sku: 'LM-OS5K-WM', yourPrice: 9.25, marketAvg: 9.25, lowestCompetitor: 8.80, yourRank: 4, totalSuppliers: 10, gapPercent: 5.11 },
  { id: '7', productName: 'Elf Bar BC5000 - Mango Peach', sku: 'ELF-BC5K-MP', yourPrice: 8.75, marketAvg: 9.00, lowestCompetitor: 8.75, yourRank: 1, totalSuppliers: 13, gapPercent: 0 },
  { id: '8', productName: 'Clipper Lighter - Hemp Leaves 48ct', sku: 'CLIP-HEMP-48', yourPrice: 45.60, marketAvg: 44.00, lowestCompetitor: 42.50, yourRank: 5, totalSuppliers: 6, gapPercent: 7.29 },
  { id: '9', productName: 'Backwoods Cigars - Honey Berry 8/5pk', sku: 'BW-HB-8PK', yourPrice: 42.00, marketAvg: 43.50, lowestCompetitor: 40.00, yourRank: 2, totalSuppliers: 7, gapPercent: 5.00 },
  { id: '10', productName: 'Swisher Sweets Cigarillos - Grape 20/5pk', sku: 'SS-GR-20PK', yourPrice: 28.50, marketAvg: 29.00, lowestCompetitor: 27.00, yourRank: 3, totalSuppliers: 9, gapPercent: 5.56 },
];

const MOCK_PROMOTIONS: ActivePromotion[] = [
  { id: 'p1', productName: 'RAZ CA6000 Disposable Vape - Blue Razz', originalPrice: 8.99, promoPrice: 7.99, startDate: '2026-02-10', endDate: '2026-02-28', daysRemaining: 14 },
  { id: 'p2', productName: 'ZYN Nicotine Pouches 6mg - Wintergreen', originalPrice: 3.25, promoPrice: 2.99, startDate: '2026-02-01', endDate: '2026-02-20', daysRemaining: 6 },
  { id: 'p3', productName: 'Elf Bar BC5000 - Mango Peach', originalPrice: 8.75, promoPrice: 7.50, startDate: '2026-02-12', endDate: '2026-03-12', daysRemaining: 26 },
];

// ---------- Helpers ----------

function getCompetitivenessColor(gapPercent: number, rank: number): string {
  if (rank === 1 || gapPercent === 0) return 'bg-success/5';
  if (gapPercent <= 5) return 'bg-status-warning/5';
  return 'bg-status-error/5';
}

function getRankBadge(rank: number, total: number) {
  if (rank === 1) return <Badge variant="bestPrice">#{rank}</Badge>;
  if (rank <= Math.ceil(total / 3)) return <Badge variant="success">#{rank}</Badge>;
  if (rank <= Math.ceil((total * 2) / 3)) return <Badge variant="warning">#{rank}</Badge>;
  return <Badge variant="error">#{rank}</Badge>;
}

// ---------- Main Page ----------

export default function PricingDashboardPage() {
  const [comparisons] = useState<PriceComparisonRow[]>(MOCK_COMPARISONS);
  const [promotions] = useState<ActivePromotion[]>(MOCK_PROMOTIONS);
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  // KPI calculations
  const stats = useMemo(() => {
    const avgPrice =
      comparisons.reduce((sum, c) => sum + c.yourPrice, 0) / comparisons.length;
    const onPromotion = promotions.length;
    const priceChanges30d = 7; // mock
    const bestPriceCount = comparisons.filter((c) => c.yourRank === 1).length;
    const competitivePosition = `${bestPriceCount}/${comparisons.length} best`;
    return { avgPrice, onPromotion, priceChanges30d, competitivePosition };
  }, [comparisons, promotions]);

  const handleMatchPrice = (compId: string) => {
    const comp = comparisons.find((c) => c.id === compId);
    if (comp) {
      toast.success(`Price matched to ${formatCurrency(comp.lowestCompetitor)} for ${comp.productName}`);
    }
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
          <DollarSign className="h-5 w-5 text-brand-blue" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-dark">Pricing Dashboard</h1>
          <p className="text-sm text-gray-500">Monitor competitive pricing and manage promotions</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Avg Price"
          value={formatCurrency(stats.avgPrice)}
          icon={DollarSign}
          change={{ value: -2.1, label: 'vs last month' }}
        />
        <KpiCard
          title="On Promotion"
          value={stats.onPromotion}
          icon={Tag}
          valueColor="text-brand-orange"
          change={{ value: 1, label: 'more than last week' }}
        />
        <KpiCard
          title="Price Changes (30d)"
          value={stats.priceChanges30d}
          icon={TrendingUp}
          change={{ value: 3, label: 'vs prior 30d' }}
        />
        <KpiCard
          title="Competitive Position"
          value={stats.competitivePosition}
          icon={Target}
          change={{ value: 8, label: 'improved' }}
        />
      </div>

      {/* Price Comparison Table */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-brand-teal" />
            <h2 className="text-lg font-semibold text-dark">Price Comparison</h2>
          </div>
        </div>

        {comparisons.length === 0 ? (
          <EmptyState
            icon="package"
            title="No pricing data"
            description="Add products to see competitive pricing analysis."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Your Price</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Market Avg</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Lowest</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Your Rank</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Gap %</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {comparisons.map((comp) => {
                  const vsAvg = comp.yourPrice - comp.marketAvg;
                  return (
                    <tr
                      key={comp.id}
                      className={cn('transition-colors', getCompetitivenessColor(comp.gapPercent, comp.yourRank))}
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-dark">{comp.productName}</p>
                        <p className="text-xs font-mono text-gray-400">{comp.sku}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-mono font-bold text-dark">
                          {formatCurrency(comp.yourPrice)}
                        </span>
                        <div className="flex items-center justify-end gap-1 mt-0.5">
                          {vsAvg < 0 ? (
                            <ArrowDown className="h-3 w-3 text-success" />
                          ) : vsAvg > 0 ? (
                            <ArrowUp className="h-3 w-3 text-status-error" />
                          ) : (
                            <Minus className="h-3 w-3 text-gray-400" />
                          )}
                          <span
                            className={cn(
                              'text-xs',
                              vsAvg < 0 ? 'text-success' : vsAvg > 0 ? 'text-status-error' : 'text-gray-400',
                            )}
                          >
                            {vsAvg >= 0 ? '+' : ''}{formatCurrency(vsAvg)} vs avg
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-mono text-gray-600">
                          {formatCurrency(comp.marketAvg)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-mono text-success font-semibold">
                          {formatCurrency(comp.lowestCompetitor)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {getRankBadge(comp.yourRank, comp.totalSuppliers)}
                        <p className="text-xs text-gray-400 mt-0.5">of {comp.totalSuppliers}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            'text-sm font-semibold',
                            comp.gapPercent === 0
                              ? 'text-success'
                              : comp.gapPercent <= 5
                                ? 'text-status-warning'
                                : 'text-status-error',
                          )}
                        >
                          {comp.gapPercent === 0 ? 'BEST' : `${comp.gapPercent.toFixed(1)}%`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {comp.yourRank !== 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMatchPrice(comp.id)}
                            className="text-xs text-brand-teal hover:bg-brand-teal/10"
                          >
                            Match Price
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Bulk Price Update */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-brand-teal" />
            Bulk Price Update
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-brand-teal/50 transition-colors">
            <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-dark mb-1">
              Upload price CSV
            </p>
            <p className="text-xs text-gray-500 mb-4">
              CSV format: SKU, New Price. Prices will be previewed before applying.
            </p>
            <Button variant="outline" size="sm">
              Choose CSV File
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Promotions */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Tag className="h-5 w-5 text-brand-orange" />
          <h2 className="text-lg font-semibold text-dark">Active Promotions</h2>
          <Badge variant="warning">{promotions.length}</Badge>
        </div>

        {promotions.length === 0 ? (
          <EmptyState
            icon="package"
            title="No active promotions"
            description="Create a promotion from the product edit page."
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {promotions.map((promo) => {
              const savings = promo.originalPrice - promo.promoPrice;
              const savingsPercent = ((savings / promo.originalPrice) * 100).toFixed(1);

              return (
                <div key={promo.id} className="px-6 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-dark">{promo.productName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-mono line-through text-gray-400">
                        {formatCurrency(promo.originalPrice)}
                      </span>
                      <span className="text-sm font-mono font-bold text-brand-orange">
                        {formatCurrency(promo.promoPrice)}
                      </span>
                      <Badge variant="success">-{savingsPercent}%</Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-gray-400" />
                      <span
                        className={cn(
                          'text-sm font-medium',
                          promo.daysRemaining <= 7
                            ? 'text-status-error'
                            : 'text-gray-600',
                        )}
                      >
                        {promo.daysRemaining} days left
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {promo.startDate} - {promo.endDate}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
