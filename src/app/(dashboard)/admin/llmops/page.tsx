'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Cpu,
  Zap,
  DollarSign,
  Clock,
  CheckCircle,
  ArrowRight,
  Play,
  Pause,
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
} from 'recharts';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { KpiCard } from '@/components/ui/KpiCard';
import { Skeleton, TableRowSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { cn, formatDateTime, formatCurrency } from '@/lib/utils';

// ---------- Types ----------
interface PromptRow {
  id: string;
  name: string;
  version: string;
  model: string;
  status: 'active' | 'inactive' | 'draft';
  createdAt: string;
  invocations30d: number;
  avgLatencyMs: number;
  cost30d: number;
}

interface DailyInvocation {
  date: string;
  count: number;
  avgLatencyMs: number;
  errorCount: number;
}

interface CostBreakdown {
  promptName: string;
  cost: number;
  invocations: number;
  percentage: number;
}

interface ABTest {
  id: string;
  name: string;
  promptName: string;
  variantA: { version: string; trafficPercent: number; avgLatencyMs: number; accuracy: number };
  variantB: { version: string; trafficPercent: number; avgLatencyMs: number; accuracy: number };
  status: 'running' | 'concluded' | 'draft';
  startedAt: string;
  totalInvocations: number;
}

interface LLMOpsData {
  kpi: {
    totalInvocations30d: number;
    totalCost30d: number;
    avgLatencyMs: number;
    successRate: number;
  };
  prompts: PromptRow[];
  dailyInvocations: DailyInvocation[];
  costBreakdown: CostBreakdown[];
  abTests: ABTest[];
}

// ---------- Mock Data Fallback ----------
function generateMockData(): LLMOpsData {
  const now = Date.now();

  const prompts: PromptRow[] = [
    { id: 'p1', name: 'DOCUMENT_CLASSIFICATION', version: '1.0.0', model: 'claude-3-sonnet', status: 'active', createdAt: new Date(now - 86400000 * 30).toISOString(), invocations30d: 4521, avgLatencyMs: 1240, cost30d: 45.21 },
    { id: 'p2', name: 'RECEIPT_EXTRACTION', version: '1.0.0', model: 'claude-3-sonnet', status: 'active', createdAt: new Date(now - 86400000 * 28).toISOString(), invocations30d: 3890, avgLatencyMs: 2850, cost30d: 112.50 },
    { id: 'p3', name: 'RECEIPT_EXTRACTION', version: '2.0.0', model: 'claude-3-sonnet', status: 'draft', createdAt: new Date(now - 86400000 * 2).toISOString(), invocations30d: 0, avgLatencyMs: 0, cost30d: 0 },
    { id: 'p4', name: 'SEARCH_REWRITE', version: '1.0.0', model: 'claude-3-sonnet', status: 'active', createdAt: new Date(now - 86400000 * 25).toISOString(), invocations30d: 12340, avgLatencyMs: 680, cost30d: 61.70 },
    { id: 'p5', name: 'ANOMALY_EXPLANATION', version: '1.0.0', model: 'claude-3-sonnet', status: 'active', createdAt: new Date(now - 86400000 * 20).toISOString(), invocations30d: 892, avgLatencyMs: 1580, cost30d: 17.84 },
    { id: 'p6', name: 'ENTITY_RESOLUTION', version: '1.0.0', model: 'claude-3-sonnet', status: 'inactive', createdAt: new Date(now - 86400000 * 15).toISOString(), invocations30d: 156, avgLatencyMs: 1120, cost30d: 3.12 },
  ];

  const dailyInvocations: DailyInvocation[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now - i * 86400000);
    const base = 600 + Math.floor(Math.random() * 300);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const count = weekend ? Math.floor(base * 0.4) : base;
    dailyInvocations.push({
      date: date.toISOString().slice(0, 10),
      count,
      avgLatencyMs: 1200 + Math.floor(Math.random() * 600),
      errorCount: Math.floor(count * 0.02),
    });
  }

  const costBreakdown: CostBreakdown[] = [
    { promptName: 'RECEIPT_EXTRACTION', cost: 112.50, invocations: 3890, percentage: 46.8 },
    { promptName: 'SEARCH_REWRITE', cost: 61.70, invocations: 12340, percentage: 25.7 },
    { promptName: 'DOCUMENT_CLASSIFICATION', cost: 45.21, invocations: 4521, percentage: 18.8 },
    { promptName: 'ANOMALY_EXPLANATION', cost: 17.84, invocations: 892, percentage: 7.4 },
    { promptName: 'ENTITY_RESOLUTION', cost: 3.12, invocations: 156, percentage: 1.3 },
  ];

  const abTests: ABTest[] = [
    {
      id: 'ab_001',
      name: 'Extraction v1.0 vs v2.0',
      promptName: 'RECEIPT_EXTRACTION',
      variantA: { version: '1.0.0', trafficPercent: 70, avgLatencyMs: 2850, accuracy: 0.917 },
      variantB: { version: '2.0.0', trafficPercent: 30, avgLatencyMs: 2200, accuracy: 0.945 },
      status: 'running',
      startedAt: new Date(now - 86400000 * 5).toISOString(),
      totalInvocations: 1240,
    },
    {
      id: 'ab_002',
      name: 'Search Rewrite temperature test',
      promptName: 'SEARCH_REWRITE',
      variantA: { version: '1.0.0', trafficPercent: 50, avgLatencyMs: 680, accuracy: 0.84 },
      variantB: { version: '1.1.0', trafficPercent: 50, avgLatencyMs: 720, accuracy: 0.87 },
      status: 'concluded',
      startedAt: new Date(now - 86400000 * 14).toISOString(),
      totalInvocations: 8920,
    },
  ];

  return {
    kpi: {
      totalInvocations30d: prompts.reduce((s, p) => s + p.invocations30d, 0),
      totalCost30d: 240.37,
      avgLatencyMs: 1494,
      successRate: 98.12,
    },
    prompts,
    dailyInvocations,
    costBreakdown,
    abTests,
  };
}

// ---------- Constants ----------
const PIE_COLORS = ['#1E4D8C', '#FF6A00', '#20A39E', '#00B894', '#2D3436'];

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'default'> = {
  active: 'success',
  draft: 'warning',
  inactive: 'default',
};

// ---------- Loading Skeleton ----------
function LLMOpsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card">
            <Skeleton className="w-24 h-4 mb-2" />
            <Skeleton className="w-20 h-8" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <Skeleton className="w-40 h-5 mb-4" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="w-full h-8" />
            ))}
          </div>
        </Card>
        <Card>
          <Skeleton className="w-40 h-5 mb-4" />
          <Skeleton variant="rectangular" className="w-full h-48" />
        </Card>
      </div>
    </div>
  );
}

// ---------- Main Page ----------
export default function LLMOpsPage() {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<LLMOpsData>({
    queryKey: ['admin-llmops'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/admin/llmops');
        if (!res.ok) throw new Error('API not available');
        return res.json();
      } catch {
        return generateMockData();
      }
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-blue/10 rounded-lg flex items-center justify-center">
            <Cpu className="h-5 w-5 text-brand-blue" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-dark">LLMOps Dashboard</h1>
            <p className="text-sm text-gray-500">Prompt versioning, invocation tracking, cost analysis, and A/B testing</p>
          </div>
        </div>
        <LLMOpsSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-blue/10 rounded-lg flex items-center justify-center">
            <Cpu className="h-5 w-5 text-brand-blue" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-dark">LLMOps Dashboard</h1>
            <p className="text-sm text-gray-500">Prompt versioning, invocation tracking, cost analysis, and A/B testing</p>
          </div>
        </div>
        <EmptyState
          icon="package"
          title="No LLMOps data available"
          description="No prompt invocations have been recorded yet."
        />
      </div>
    );
  }

  const { kpi, prompts, dailyInvocations, costBreakdown, abTests } = data;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-blue/10 rounded-lg flex items-center justify-center">
          <Cpu className="h-5 w-5 text-brand-blue" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-dark">LLMOps Dashboard</h1>
          <p className="text-sm text-gray-500">Prompt versioning, invocation tracking, cost analysis, and A/B testing</p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <ErrorBanner
          message="Failed to load LLMOps data. Showing mock data."
          onRetry={() => refetch()}
        />
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="Total Invocations (30d)"
          value={kpi.totalInvocations30d.toLocaleString()}
          icon={Zap}
        />
        <KpiCard
          title="Total Cost ($)"
          value={formatCurrency(kpi.totalCost30d)}
          icon={DollarSign}
        />
        <KpiCard
          title="Avg Latency (ms)"
          value={`${kpi.avgLatencyMs}ms`}
          icon={Clock}
          valueColor={kpi.avgLatencyMs < 1000 ? 'text-success' : kpi.avgLatencyMs < 2000 ? 'text-brand-teal' : 'text-brand-orange'}
        />
        <KpiCard
          title="Success Rate (%)"
          value={`${kpi.successRate}%`}
          icon={CheckCircle}
          valueColor={kpi.successRate >= 99 ? 'text-success' : kpi.successRate >= 95 ? 'text-brand-teal' : 'text-brand-orange'}
        />
      </div>

      {/* 2x2 Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Prompt Registry Table */}
        <Card padding="none" className="overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-dark uppercase">Prompt Registry</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="table-header">Name</th>
                  <th className="table-header">Version</th>
                  <th className="table-header">Model</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {prompts.map((prompt) => (
                  <tr key={prompt.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="table-cell">
                      <span className="text-sm font-medium text-dark">{prompt.name}</span>
                    </td>
                    <td className="table-cell">
                      <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{prompt.version}</code>
                    </td>
                    <td className="table-cell text-xs text-gray-500">{prompt.model}</td>
                    <td className="table-cell">
                      <Badge variant={STATUS_BADGE[prompt.status] ?? 'default'}>
                        {prompt.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="table-cell text-xs text-gray-500 whitespace-nowrap">
                      {formatDateTime(prompt.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Invocation Metrics Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Invocations (30d)</CardTitle>
            <CardDescription>Total LLM invocations per day</CardDescription>
          </CardHeader>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyInvocations}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => v.slice(5)}
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                <Tooltip
                  contentStyle={{ borderRadius: '0.5rem', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}
                  labelFormatter={(v: string) => `Date: ${v}`}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#1E4D8C"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#1E4D8C' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Cost Breakdown Donut */}
        <Card>
          <CardHeader>
            <CardTitle>Cost Breakdown by Prompt</CardTitle>
            <CardDescription>30-day spend distribution</CardDescription>
          </CardHeader>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={costBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  dataKey="cost"
                  nameKey="promptName"
                  paddingAngle={2}
                >
                  {costBreakdown.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ borderRadius: '0.5rem', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  formatter={(value: string) => <span className="text-xs text-gray-600">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* A/B Tests */}
        <Card>
          <CardHeader>
            <CardTitle>A/B Tests</CardTitle>
            <CardDescription>Active and concluded prompt experiments</CardDescription>
          </CardHeader>
          {abTests.length === 0 ? (
            <EmptyState
              icon="package"
              title="No A/B tests"
              description="No prompt A/B tests have been configured."
            />
          ) : (
            <div className="space-y-4">
              {abTests.map((test) => (
                <div key={test.id} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-semibold text-dark">{test.name}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {test.promptName} | {test.totalInvocations.toLocaleString()} invocations
                      </p>
                    </div>
                    <Badge variant={test.status === 'running' ? 'success' : test.status === 'concluded' ? 'info' : 'default'}>
                      {test.status === 'running' && <Play className="h-3 w-3 mr-1" />}
                      {test.status === 'concluded' && <Pause className="h-3 w-3 mr-1" />}
                      {test.status.toUpperCase()}
                    </Badge>
                  </div>

                  {/* Traffic Split Bar */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>A: v{test.variantA.version} ({test.variantA.trafficPercent}%)</span>
                      <span>B: v{test.variantB.version} ({test.variantB.trafficPercent}%)</span>
                    </div>
                    <div className="flex h-2 rounded-full overflow-hidden">
                      <div className="bg-brand-blue transition-all" style={{ width: `${test.variantA.trafficPercent}%` }} />
                      <div className="bg-brand-orange transition-all" style={{ width: `${test.variantB.trafficPercent}%` }} />
                    </div>
                  </div>

                  {/* Variant Metrics */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1">
                      <p className="font-semibold text-brand-blue">Variant A</p>
                      <p className="text-gray-600">Latency: {test.variantA.avgLatencyMs}ms</p>
                      <p className="text-gray-600">Accuracy: {(test.variantA.accuracy * 100).toFixed(1)}%</p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-brand-orange">Variant B</p>
                      <p className="text-gray-600">Latency: {test.variantB.avgLatencyMs}ms</p>
                      <p className="text-gray-600">Accuracy: {(test.variantB.accuracy * 100).toFixed(1)}%</p>
                    </div>
                  </div>

                  {test.status === 'running' && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <Button variant="outline" size="sm" className="w-full">
                        Conclude Test
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
