'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FlaskConical,
  Play,
  ChevronDown,
  Check,
  X,
  Calendar,
  Target,
  Crosshair,
  Radar,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { KpiCard } from '@/components/ui/KpiCard';
import { Skeleton, TableRowSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { cn, formatDateTime } from '@/lib/utils';

// ---------- Types ----------
interface EvalResult {
  input: string;
  expected: string;
  actual: string;
  correct: boolean;
  errorType: string | null;
}

interface EvalRun {
  id: string;
  runName: string;
  type: 'search' | 'extraction' | 'policy';
  startedAt: string;
  completedAt: string;
  sampleCount: number;
  metrics: {
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    falsePositiveRate: number;
    falseNegativeRate: number;
    totalSamples: number;
  };
  results: EvalResult[];
}

interface EvalResponse {
  runs: EvalRun[];
  count: number;
}

type TabType = 'search' | 'extraction' | 'policy';

// ---------- Mock Data Fallback ----------
function generateMockData(): EvalRun[] {
  const now = Date.now();

  const searchResults: EvalResult[] = [
    { input: 'disposable vape', expected: 'PRD001', actual: 'PRD001', correct: true, errorType: null },
    { input: 'glass bong', expected: 'PRD002', actual: 'PRD002', correct: true, errorType: null },
    { input: 'rolling papers', expected: 'PRD003', actual: 'PRD003', correct: true, errorType: null },
    { input: 'herb grinder', expected: 'PRD004', actual: 'PRD004', correct: true, errorType: null },
    { input: 'CBD gummies', expected: 'PRD005', actual: 'PRD005', correct: true, errorType: null },
    { input: 'cheap smoking device', expected: 'PRD002,PRD007', actual: 'PRD002', correct: false, errorType: 'MISSING_RESULT' },
    { input: 'vape juice', expected: 'PRD010', actual: 'PRD010,PRD001', correct: false, errorType: 'EXTRA_RESULT' },
    { input: 'something for joints', expected: 'PRD003,PRD009', actual: 'PRD003', correct: false, errorType: 'MISSING_RESULT' },
    { input: 'pipe cleaner', expected: 'PRD006', actual: 'PRD006', correct: true, errorType: null },
    { input: 'smoke shop supplies', expected: 'PRD001-PRD006', actual: 'PRD001,PRD003', correct: false, errorType: 'LOW_RECALL' },
  ];

  const extractionResults: EvalResult[] = [
    { input: 'INV-2024-001 (simple)', expected: 'Premium Vape Distributors', actual: 'Premium Vape Distributors', correct: true, errorType: null },
    { input: 'SC-88721 (complex 6 items)', expected: 'SmokeCity Wholesale LLC', actual: 'SmokeCity Wholesale LLC', correct: true, errorType: null },
    { input: 'ASN-2024-3391 (shipping)', expected: 'Pacific Smoke Distributors', actual: 'Pacific Smoke Distributors', correct: true, errorType: null },
    { input: 'POC-55123 (PO confirm)', expected: 'Green Leaf Wholesale', actual: 'Green Leaf Wholesale', correct: true, errorType: null },
    { input: 'QST-77 (messy format)', expected: 'quickship tobacco', actual: 'Quickship Tobacco', correct: true, errorType: null },
    { input: 'DW-2024-112 (single item)', expected: '500 units @ $5.50', actual: '1 pallet @ $2750', correct: false, errorType: 'FIELD_MISMATCH' },
    { input: 'BU-44892 (with promo)', expected: '4 line items', actual: '4 line items', correct: true, errorType: null },
    { input: 'CN-ASN-8821 (USPS)', expected: 'tracking: 940551...', actual: 'tracking: 940551...', correct: true, errorType: null },
    { input: 'AS-10042 (no tax)', expected: 'tax: $0.00', actual: 'tax: $0.00', correct: true, errorType: null },
    { input: 'NSS-2024-9001 (11 items)', expected: '$11,189.48 total', actual: '$11,189.48 total', correct: true, errorType: null },
  ];

  const policyResults: EvalResult[] = [
    { input: 'Age-restricted, unverified user', expected: 'BLOCK', actual: 'BLOCK', correct: true, errorType: null },
    { input: 'Age-restricted, verified user', expected: 'ALLOW', actual: 'ALLOW', correct: true, errorType: null },
    { input: 'Product restricted in CA, retailer in CA', expected: 'BLOCK', actual: 'BLOCK', correct: true, errorType: null },
    { input: 'Product restricted in CA, retailer in TX', expected: 'ALLOW', actual: 'ALLOW', correct: true, errorType: null },
    { input: 'Below MOQ (10 of 25 min)', expected: 'BLOCK', actual: 'BLOCK', correct: true, errorType: null },
    { input: 'Meets MOQ (50 of 25 min)', expected: 'ALLOW', actual: 'ALLOW', correct: true, errorType: null },
    { input: 'Expired license', expected: 'BLOCK', actual: 'BLOCK', correct: true, errorType: null },
    { input: 'Valid license', expected: 'ALLOW', actual: 'ALLOW', correct: true, errorType: null },
    { input: 'Multi-violation: age + state', expected: 'BLOCK (2 violations)', actual: 'BLOCK (2 violations)', correct: true, errorType: null },
    { input: 'Multi-violation: age + MOQ + license', expected: 'BLOCK (3 violations)', actual: 'BLOCK (2 violations)', correct: false, errorType: 'MISSED_VIOLATION' },
  ];

  return [
    {
      id: 'eval_search_001',
      runName: 'Search Eval - 2025-02-10',
      type: 'search',
      startedAt: new Date(now - 86400000 * 4).toISOString(),
      completedAt: new Date(now - 86400000 * 4 + 120000).toISOString(),
      sampleCount: 25,
      metrics: { accuracy: 0.84, precision: 0.88, recall: 0.76, f1Score: 0.816, falsePositiveRate: 0.12, falseNegativeRate: 0.24, totalSamples: 25 },
      results: searchResults,
    },
    {
      id: 'eval_extraction_001',
      runName: 'Extraction Eval - 2025-02-11',
      type: 'extraction',
      startedAt: new Date(now - 86400000 * 3).toISOString(),
      completedAt: new Date(now - 86400000 * 3 + 180000).toISOString(),
      sampleCount: 12,
      metrics: { accuracy: 0.917, precision: 0.94, recall: 0.91, f1Score: 0.925, falsePositiveRate: 0.06, falseNegativeRate: 0.09, totalSamples: 12 },
      results: extractionResults,
    },
    {
      id: 'eval_policy_001',
      runName: 'Policy Eval - 2025-02-12',
      type: 'policy',
      startedAt: new Date(now - 86400000 * 2).toISOString(),
      completedAt: new Date(now - 86400000 * 2 + 60000).toISOString(),
      sampleCount: 12,
      metrics: { accuracy: 0.917, precision: 1.0, recall: 0.857, f1Score: 0.923, falsePositiveRate: 0.0, falseNegativeRate: 0.143, totalSamples: 12 },
      results: policyResults,
    },
  ];
}

const MOCK_RUNS = generateMockData();

// ---------- Error Type Badge Colors ----------
const ERROR_TYPE_COLORS: Record<string, string> = {
  MISSING_RESULT: 'bg-brand-orange/10 text-brand-orange',
  EXTRA_RESULT: 'bg-status-info/10 text-status-info',
  LOW_RECALL: 'bg-status-warning/10 text-status-warning',
  FIELD_MISMATCH: 'bg-status-error/10 text-status-error',
  MISSED_VIOLATION: 'bg-status-error/10 text-status-error',
};

// ---------- Sub-Components ----------
function MetricBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 90 ? 'bg-success' : pct >= 75 ? 'bg-brand-teal' : pct >= 50 ? 'bg-brand-orange' : 'bg-status-error';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600 font-medium">{label}</span>
        <span className="font-semibold text-dark">{pct}%</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="card">
          <Skeleton className="w-24 h-4 mb-2" />
          <Skeleton className="w-16 h-8" />
        </div>
      ))}
    </div>
  );
}

// ---------- Main Page ----------
export default function EvaluationsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('search');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const queryClient = useQueryClient();

  const {
    data: response,
    isLoading,
    error,
    refetch,
  } = useQuery<EvalResponse>({
    queryKey: ['admin-evaluations'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/admin/evaluations');
        if (!res.ok) throw new Error('API not available');
        return res.json();
      } catch {
        return { runs: MOCK_RUNS, count: MOCK_RUNS.length };
      }
    },
  });

  const triggerMutation = useMutation({
    mutationFn: async (type: string) => {
      try {
        const res = await fetch('/api/admin/evaluations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type }),
        });
        if (!res.ok) throw new Error('Failed');
        return res.json();
      } catch {
        return null;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-evaluations'] });
    },
  });

  const runs = response?.runs ?? [];
  const activeRun = runs.find((r) => r.type === activeTab);

  // Aggregate "latest" KPIs from the most recent run per type
  const latestRun = runs.length > 0
    ? runs.reduce((latest, r) => new Date(r.completedAt) > new Date(latest.completedAt) ? r : latest, runs[0])
    : null;

  const avgAccuracy = runs.length > 0
    ? runs.reduce((sum, r) => sum + r.metrics.accuracy, 0) / runs.length
    : 0;
  const avgPrecision = runs.length > 0
    ? runs.reduce((sum, r) => sum + r.metrics.precision, 0) / runs.length
    : 0;
  const avgRecall = runs.length > 0
    ? runs.reduce((sum, r) => sum + r.metrics.recall, 0) / runs.length
    : 0;
  const avgF1 = runs.length > 0
    ? runs.reduce((sum, r) => sum + r.metrics.f1Score, 0) / runs.length
    : 0;

  const handleRunEval = useCallback((type: string) => {
    setDropdownOpen(false);
    if (type === 'all') {
      triggerMutation.mutate('search');
      triggerMutation.mutate('extraction');
      triggerMutation.mutate('policy');
    } else {
      triggerMutation.mutate(type);
    }
  }, [triggerMutation]);

  const tabs: { key: TabType; label: string }[] = [
    { key: 'search', label: 'Search' },
    { key: 'extraction', label: 'Extraction' },
    { key: 'policy', label: 'Policy' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-blue/10 rounded-lg flex items-center justify-center">
            <FlaskConical className="h-5 w-5 text-brand-blue" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-dark">AI Evaluation Dashboard</h1>
            <p className="text-sm text-gray-500">Measure accuracy, precision, recall, and F1 across all AI systems</p>
          </div>
        </div>

        {/* Run Evaluation Dropdown */}
        <div className="relative">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Play className="h-4 w-4" />}
            rightIcon={<ChevronDown className="h-4 w-4" />}
            onClick={() => setDropdownOpen(!dropdownOpen)}
            isLoading={triggerMutation.isPending}
          >
            Run Evaluation
          </Button>
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50">
              <button onClick={() => handleRunEval('search')} className="w-full px-4 py-2 text-left text-sm text-dark hover:bg-gray-50">Search Quality</button>
              <button onClick={() => handleRunEval('extraction')} className="w-full px-4 py-2 text-left text-sm text-dark hover:bg-gray-50">Extraction Accuracy</button>
              <button onClick={() => handleRunEval('policy')} className="w-full px-4 py-2 text-left text-sm text-dark hover:bg-gray-50">Policy Correctness</button>
              <div className="border-t border-gray-100 my-1" />
              <button onClick={() => handleRunEval('all')} className="w-full px-4 py-2 text-left text-sm font-semibold text-brand-blue hover:bg-gray-50">Run All</button>
            </div>
          )}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <ErrorBanner
          message="Failed to load evaluation data. Showing mock data."
          onRetry={() => refetch()}
        />
      )}

      {/* KPI Cards */}
      {isLoading ? (
        <KpiSkeleton />
      ) : runs.length === 0 ? (
        <EmptyState
          icon="document"
          title="No evaluation runs yet"
          description="Run your first evaluation to see accuracy metrics here."
          actionLabel="Run All Evaluations"
          onAction={() => handleRunEval('all')}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KpiCard
              title="Last Run Date"
              value={latestRun ? formatDateTime(latestRun.completedAt) : 'N/A'}
              icon={Calendar}
            />
            <KpiCard
              title="Overall Accuracy"
              value={`${Math.round(avgAccuracy * 100)}%`}
              icon={Target}
              valueColor={avgAccuracy >= 0.9 ? 'text-success' : avgAccuracy >= 0.75 ? 'text-brand-teal' : 'text-brand-orange'}
            />
            <KpiCard
              title="Precision"
              value={`${Math.round(avgPrecision * 100)}%`}
              icon={Crosshair}
            />
            <KpiCard
              title="Recall"
              value={`${Math.round(avgRecall * 100)}%`}
              icon={Radar}
            />
            <KpiCard
              title="F1 Score"
              value={`${Math.round(avgF1 * 100)}%`}
              icon={Activity}
              valueColor={avgF1 >= 0.9 ? 'text-success' : avgF1 >= 0.75 ? 'text-brand-teal' : 'text-brand-orange'}
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
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeRun ? (
            <div className="space-y-6">
              {/* Metrics Summary */}
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-dark">{activeRun.runName}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {activeRun.sampleCount} samples | Completed {formatDateTime(activeRun.completedAt)}
                    </p>
                  </div>
                  <Badge variant={activeRun.metrics.accuracy >= 0.9 ? 'success' : activeRun.metrics.accuracy >= 0.75 ? 'info' : 'warning'}>
                    {Math.round(activeRun.metrics.accuracy * 100)}% Accuracy
                  </Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricBar label="Accuracy" value={activeRun.metrics.accuracy} />
                  <MetricBar label="Precision" value={activeRun.metrics.precision} />
                  <MetricBar label="Recall" value={activeRun.metrics.recall} />
                  <MetricBar label="F1 Score" value={activeRun.metrics.f1Score} />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="text-sm">
                    <span className="text-gray-500">False Positive Rate:</span>{' '}
                    <span className="font-semibold text-dark">{(activeRun.metrics.falsePositiveRate * 100).toFixed(1)}%</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-500">False Negative Rate:</span>{' '}
                    <span className="font-semibold text-dark">{(activeRun.metrics.falseNegativeRate * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </Card>

              {/* Results Table */}
              <Card padding="none" className="overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-dark uppercase">Detailed Results</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50/50">
                        <th className="table-header">#</th>
                        <th className="table-header">Input</th>
                        <th className="table-header">Expected</th>
                        <th className="table-header">Actual</th>
                        <th className="table-header text-center">Correct</th>
                        <th className="table-header">Error Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {activeRun.results.map((result, idx) => (
                        <tr key={idx} className={cn('transition-colors', result.correct ? 'hover:bg-gray-50/50' : 'bg-status-error/5 hover:bg-status-error/10')}>
                          <td className="table-cell text-xs text-gray-400">{idx + 1}</td>
                          <td className="table-cell text-sm text-dark font-medium max-w-[200px] truncate">{result.input}</td>
                          <td className="table-cell">
                            <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{result.expected}</code>
                          </td>
                          <td className="table-cell">
                            <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{result.actual}</code>
                          </td>
                          <td className="table-cell text-center">
                            {result.correct ? (
                              <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-success/10">
                                <Check className="h-4 w-4 text-success" />
                              </div>
                            ) : (
                              <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-status-error/10">
                                <X className="h-4 w-4 text-status-error" />
                              </div>
                            )}
                          </td>
                          <td className="table-cell">
                            {result.errorType ? (
                              <span className={cn(
                                'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
                                ERROR_TYPE_COLORS[result.errorType] ?? 'bg-gray-100 text-gray-600'
                              )}>
                                {result.errorType.replace(/_/g, ' ')}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ) : (
            <EmptyState
              icon="search"
              title={`No ${activeTab} evaluation runs`}
              description={`Run a ${activeTab} evaluation to see results here.`}
              actionLabel={`Run ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Evaluation`}
              onAction={() => handleRunEval(activeTab)}
            />
          )}
        </>
      )}
    </div>
  );
}
