'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';

/** Single price history data point */
interface PriceHistoryDataPoint {
  date: string;
  supplierId: string;
  supplierName: string;
  price: number;
}

/** Props for the PriceHistoryChart component */
interface PriceHistoryChartProps {
  /** Array of price history records */
  priceHistory: PriceHistoryDataPoint[];
  /** Chart height in pixels (defaults to 300) */
  height?: number;
}

/** Brand palette colours used for supplier lines */
const LINE_COLORS: string[] = [
  '#1E4D8C', // brand-blue
  '#FF6A00', // brand-orange
  '#20A39E', // brand-teal
  '#00B894', // success green
  '#6C5CE7', // purple
  '#E17055', // coral
  '#FDCB6E', // yellow
  '#0984E3', // light blue
];

/**
 * Format a date string to "MMM DD" format (e.g. "Jan 15").
 */
function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
  }).format(date);
}

/**
 * Custom tooltip component for the price history chart.
 */
function PriceTooltip({
  active,
  payload,
  label,
}: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
      <p className="text-sm font-medium text-dark mb-2">
        {formatShortDate(label as string)}
      </p>
      {payload.map((entry) => (
        <div
          key={entry.dataKey}
          className="flex items-center justify-between gap-4 text-sm"
        >
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-600">{entry.name}</span>
          </div>
          <span className="font-mono font-medium text-dark">
            {formatCurrency(entry.value as number)}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * 90-day price history line chart.
 * Displays one line per supplier using the brand colour palette.
 */
export function PriceHistoryChart({
  priceHistory,
  height = 300,
}: PriceHistoryChartProps) {
  /** Extract unique suppliers */
  const suppliers = useMemo(() => {
    const map = new Map<string, string>();
    for (const dp of priceHistory) {
      if (!map.has(dp.supplierId)) {
        map.set(dp.supplierId, dp.supplierName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [priceHistory]);

  /** Pivot data: one row per date with supplier prices as columns */
  const chartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number | string>>();

    for (const dp of priceHistory) {
      if (!dateMap.has(dp.date)) {
        dateMap.set(dp.date, { date: dp.date });
      }
      const row = dateMap.get(dp.date)!;
      row[dp.supplierId] = dp.price;
    }

    return Array.from(dateMap.values()).sort((a, b) =>
      (a.date as string).localeCompare(b.date as string)
    );
  }, [priceHistory]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-gray-400 text-sm">
        No price history available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis
          dataKey="date"
          tickFormatter={formatShortDate}
          tick={{ fontSize: 12, fill: '#6B7280' }}
          tickLine={false}
          axisLine={{ stroke: '#E5E7EB' }}
        />
        <YAxis
          tickFormatter={(val: number) => formatCurrency(val)}
          tick={{ fontSize: 12, fill: '#6B7280' }}
          tickLine={false}
          axisLine={false}
          width={80}
        />
        <Tooltip content={<PriceTooltip />} />
        <Legend
          verticalAlign="bottom"
          height={36}
          iconType="circle"
          iconSize={8}
          formatter={(value: string) => (
            <span className="text-sm text-gray-600">{value}</span>
          )}
        />
        {suppliers.map((supplier, index) => (
          <Line
            key={supplier.id}
            type="monotone"
            dataKey={supplier.id}
            name={supplier.name}
            stroke={LINE_COLORS[index % LINE_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
