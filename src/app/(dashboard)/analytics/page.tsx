'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  Users,
  Star,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import { KpiCard } from '@/components/ui/KpiCard';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

// ---------- Types ----------
interface AnalyticsKPIs {
  revenue30d: number;
  orders30d: number;
  avgOrderValue: number;
  activeProducts: number;
  activeSuppliers: number;
}

interface RevenueDataPoint {
  date: string;
  revenue: number;
}

interface CategoryData {
  name: string;
  value: number;
}

interface TopProduct {
  name: string;
  revenue: number;
}

interface SupplierScorecard {
  name: string;
  orders: number;
  revenue: number;
  rating: number;
}

// ---------- Chart Colors (brand palette) ----------
const CHART_COLORS = ['#1E4D8C', '#20A39E', '#FF6A00', '#00B894', '#3498DB', '#F39C12'];

// ---------- Mock Data Generators ----------
function generateRevenueData(days: number): RevenueDataPoint[] {
  const data: RevenueDataPoint[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const base = 4500 + Math.random() * 3000;
    const weekday = date.getDay();
    const weekdayMultiplier = weekday === 0 || weekday === 6 ? 0.6 : 1;
    data.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      revenue: Math.round(base * weekdayMultiplier),
    });
  }
  return data;
}

const MOCK_KPIS: AnalyticsKPIs = {
  revenue30d: 187432.5,
  orders30d: 324,
  avgOrderValue: 578.5,
  activeProducts: 1247,
  activeSuppliers: 38,
};

const MOCK_CATEGORY_DATA: CategoryData[] = [
  { name: 'Tobacco', value: 42500 },
  { name: 'Vape & E-Cig', value: 38200 },
  { name: 'Glass & Pipes', value: 28700 },
  { name: 'Accessories', value: 22100 },
  { name: 'Rolling Papers', value: 15800 },
  { name: 'Lighters', value: 11300 },
];

const MOCK_TOP_PRODUCTS: TopProduct[] = [
  { name: 'Elf Bar BC5000 Disposable', revenue: 12450 },
  { name: 'RAW Classic King Size', revenue: 9870 },
  { name: 'Juicy Jay Rolling Papers', revenue: 8340 },
  { name: 'Clipper Classic Lighter 48pk', revenue: 7920 },
  { name: 'Puff Bar Plus Disposable', revenue: 7410 },
  { name: 'BIC Classic Lighter 50pk', revenue: 6880 },
  { name: 'Swisher Sweets Cigarillos', revenue: 6540 },
  { name: 'Elements Ultra Thin Papers', revenue: 5970 },
  { name: 'SMOK Nord 5 Pod Kit', revenue: 5420 },
  { name: 'Glass Water Pipe 12in', revenue: 4890 },
];

const MOCK_SUPPLIER_SCORECARD: SupplierScorecard[] = [
  { name: 'Pacific Wholesale Distribution', orders: 87, revenue: 52340, rating: 4.8 },
  { name: 'National Tobacco Supply Co.', orders: 72, revenue: 41200, rating: 4.6 },
  { name: 'SmokeWave Distributors', orders: 56, revenue: 33100, rating: 4.5 },
  { name: 'Empire Glass & Accessories', orders: 45, revenue: 28700, rating: 4.3 },
  { name: 'Delta Vape Supply', orders: 38, revenue: 22400, rating: 4.7 },
];

// ---------- Range Toggle ----------
type RangeOption = '30d' | '60d' | '90d';

function RangeToggle({
  value,
  onChange,
}: {
  value: RangeOption;
  onChange: (range: RangeOption) => void;
}) {
  const options: { value: RangeOption; label: string }[] = [
    { value: '30d', label: '30 Days' },
    { value: '60d', label: '60 Days' },
    { value: '90d', label: '90 Days' },
  ];

  return (
    <div className="inline-flex bg-gray-100 rounded-lg p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors',
            value === opt.value
              ? 'bg-white text-brand-blue shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Star Rating ----------
function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            'h-3.5 w-3.5',
            i < Math.round(rating)
              ? 'fill-brand-orange text-brand-orange'
              : 'fill-gray-200 text-gray-200'
          )}
        />
      ))}
      <span className="ml-1 text-xs font-medium text-gray-500">{rating.toFixed(1)}</span>
    </div>
  );
}

// ---------- Custom Tooltip ----------
function RevenueTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-lg shadow-lg px-3 py-2">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-sm font-bold text-dark">{formatCurrency(payload[0].value)}</p>
    </div>
  );
}

// ---------- Loading Skeletons ----------
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

function ChartSkeleton() {
  return (
    <Card>
      <Skeleton className="w-40 h-5 mb-2" />
      <Skeleton className="w-64 h-3 mb-6" />
      <Skeleton variant="rectangular" className="w-full h-64 rounded-lg" />
    </Card>
  );
}

// ---------- Main Page ----------
export default function AnalyticsPage() {
  const [range, setRange] = useState<RangeOption>('30d');

  const rangeDays: Record<RangeOption, number> = { '30d': 30, '60d': 60, '90d': 90 };

  // Fetch KPIs (mock fallback)
  const {
    data: kpis,
    isLoading: kpisLoading,
    error: kpisError,
    refetch: refetchKpis,
  } = useQuery<AnalyticsKPIs>({
    queryKey: ['analytics-kpis'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/analytics');
        if (!res.ok) throw new Error('API not available');
        return res.json();
      } catch {
        return MOCK_KPIS;
      }
    },
  });

  // Revenue chart data
  const {
    data: revenueData,
    isLoading: revenueLoading,
  } = useQuery<RevenueDataPoint[]>({
    queryKey: ['analytics-revenue', range],
    queryFn: async () => {
      return generateRevenueData(rangeDays[range]);
    },
  });

  const isLoading = kpisLoading;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-dark">Analytics Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Business performance overview and insights</p>
      </div>

      {/* Error State */}
      {kpisError && (
        <ErrorBanner
          message="Failed to load analytics data. Showing cached data."
          onRetry={() => refetchKpis()}
        />
      )}

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
      ) : kpis ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard
            title="Revenue (30d)"
            value={formatCurrency(kpis.revenue30d)}
            icon={DollarSign}
            change={{ value: 14.2, label: 'vs prev period' }}
          />
          <KpiCard
            title="Orders (30d)"
            value={kpis.orders30d}
            icon={ShoppingCart}
            change={{ value: 8.5, label: 'vs prev period' }}
          />
          <KpiCard
            title="Avg Order Value"
            value={formatCurrency(kpis.avgOrderValue)}
            icon={TrendingUp}
            change={{ value: 5.3, label: 'vs prev period' }}
          />
          <KpiCard
            title="Active Products"
            value={kpis.activeProducts.toLocaleString()}
            icon={Package}
            change={{ value: 3.1, label: 'new this month' }}
          />
          <KpiCard
            title="Active Suppliers"
            value={kpis.activeSuppliers}
            icon={Users}
            change={{ value: 2, label: 'new this month' }}
          />
        </div>
      ) : null}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Line Chart */}
        {revenueLoading ? (
          <ChartSkeleton />
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Revenue Trend</CardTitle>
                  <CardDescription>Daily revenue over time</CardDescription>
                </div>
                <RangeToggle value={range} onChange={setRange} />
              </div>
            </CardHeader>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e5e7eb' }}
                    interval={Math.floor((revenueData?.length ?? 0) / 7)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip content={<RevenueTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#1E4D8C"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, fill: '#1E4D8C', stroke: '#fff', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* Category Pie Chart */}
        {isLoading ? (
          <ChartSkeleton />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Revenue by Category</CardTitle>
              <CardDescription>Distribution across product categories</CardDescription>
            </CardHeader>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={MOCK_CATEGORY_DATA}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }: { name: string; percent: number }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {MOCK_CATEGORY_DATA.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value: string) => (
                      <span className="text-xs text-gray-600">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* Top 10 Products Bar Chart */}
        {isLoading ? (
          <ChartSkeleton />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Products</CardTitle>
              <CardDescription>By revenue in last 30 days</CardDescription>
            </CardHeader>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={MOCK_TOP_PRODUCTS} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e5e7eb' }}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10, fill: '#6b7280' }}
                    tickLine={false}
                    axisLine={false}
                    width={150}
                    tickFormatter={(v: string) => (v.length > 22 ? v.slice(0, 22) + '...' : v)}
                  />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar
                    dataKey="revenue"
                    fill="#20A39E"
                    radius={[0, 4, 4, 0]}
                    barSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* Supplier Scorecard Table */}
        {isLoading ? (
          <ChartSkeleton />
        ) : (
          <Card padding="none" className="overflow-hidden">
            <div className="px-6 py-4">
              <CardHeader>
                <CardTitle>Supplier Scorecard</CardTitle>
                <CardDescription>Top suppliers by order volume</CardDescription>
              </CardHeader>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/50">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Supplier</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Orders</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Revenue</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {MOCK_SUPPLIER_SCORECARD.map((supplier, i) => (
                    <tr key={supplier.name} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-blue/10 flex items-center justify-center">
                            <span className="text-xs font-bold text-brand-blue">{i + 1}</span>
                          </div>
                          <span className="text-sm font-medium text-dark">{supplier.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-mono text-gray-600">{supplier.orders}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-mono font-medium text-dark">
                          {formatCurrency(supplier.revenue)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <StarRating rating={supplier.rating} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
