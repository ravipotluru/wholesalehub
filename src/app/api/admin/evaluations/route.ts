/**
 * Admin Evaluation API
 *
 * GET  /api/admin/evaluations              — list evaluation runs
 * GET  /api/admin/evaluations?type=search  — filter by type
 * GET  /api/admin/evaluations?runId=x      — get a specific run
 * POST /api/admin/evaluations              — trigger new evaluation
 *
 * Auth: ADMIN or ANALYST roles only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

/** Allowed role set for this endpoint */
const ALLOWED_ROLES = new Set(['ADMIN', 'ANALYST']);

/** Valid evaluation types */
const VALID_TYPES = new Set(['search', 'extraction', 'policy']);

// ─── Mock Data ───

interface MockEvalResult {
  input: string;
  expected: string;
  actual: string;
  correct: boolean;
  errorType: string | null;
}

interface MockEvalRun {
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
  results: MockEvalResult[];
}

function generateMockRuns(): MockEvalRun[] {
  const now = Date.now();

  const searchResults: MockEvalResult[] = [
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

  const extractionResults: MockEvalResult[] = [
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

  const policyResults: MockEvalResult[] = [
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
      metrics: {
        accuracy: 0.84,
        precision: 0.88,
        recall: 0.76,
        f1Score: 0.816,
        falsePositiveRate: 0.12,
        falseNegativeRate: 0.24,
        totalSamples: 25,
      },
      results: searchResults,
    },
    {
      id: 'eval_extraction_001',
      runName: 'Extraction Eval - 2025-02-11',
      type: 'extraction',
      startedAt: new Date(now - 86400000 * 3).toISOString(),
      completedAt: new Date(now - 86400000 * 3 + 180000).toISOString(),
      sampleCount: 12,
      metrics: {
        accuracy: 0.917,
        precision: 0.94,
        recall: 0.91,
        f1Score: 0.925,
        falsePositiveRate: 0.06,
        falseNegativeRate: 0.09,
        totalSamples: 12,
      },
      results: extractionResults,
    },
    {
      id: 'eval_policy_001',
      runName: 'Policy Eval - 2025-02-12',
      type: 'policy',
      startedAt: new Date(now - 86400000 * 2).toISOString(),
      completedAt: new Date(now - 86400000 * 2 + 60000).toISOString(),
      sampleCount: 12,
      metrics: {
        accuracy: 0.917,
        precision: 1.0,
        recall: 0.857,
        f1Score: 0.923,
        falsePositiveRate: 0.0,
        falseNegativeRate: 0.143,
        totalSamples: 12,
      },
      results: policyResults,
    },
  ];
}

const MOCK_RUNS = generateMockRuns();

// ─── GET ───

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as Record<string, unknown>;
    const role = user.role as string;

    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get('type');
    const runId = searchParams.get('runId');

    // Validate type filter
    if (typeFilter && !VALID_TYPES.has(typeFilter)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${[...VALID_TYPES].join(', ')}` },
        { status: 400 },
      );
    }

    // Single run lookup
    if (runId) {
      const run = MOCK_RUNS.find((r) => r.id === runId);
      if (!run) {
        return NextResponse.json({ error: 'Run not found' }, { status: 404 });
      }
      return NextResponse.json(run);
    }

    // List runs with optional type filter
    let runs = [...MOCK_RUNS];
    if (typeFilter) {
      runs = runs.filter((r) => r.type === typeFilter);
    }

    logger.info({
      event: 'evaluations_api_list',
      userId: user.id,
      typeFilter,
      count: runs.length,
    });

    return NextResponse.json({ runs, count: runs.length });
  } catch (error) {
    logger.error({
      event: 'evaluations_api_get_error',
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Failed to fetch evaluations' },
      { status: 500 },
    );
  }
}

// ─── POST ───

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as Record<string, unknown>;
    const role = user.role as string;

    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json() as { type?: string };
    const evalType = body.type;

    if (!evalType || !VALID_TYPES.has(evalType)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${[...VALID_TYPES].join(', ')}` },
        { status: 400 },
      );
    }

    logger.info({
      event: 'evaluations_api_trigger',
      userId: user.id,
      type: evalType,
    });

    // Return mock result for the triggered evaluation
    const mockResult = MOCK_RUNS.find((r) => r.type === evalType);
    if (!mockResult) {
      return NextResponse.json(
        { error: 'Evaluation type not found' },
        { status: 404 },
      );
    }

    // Return a "new" run based on the mock template
    const newRun: MockEvalRun = {
      ...mockResult,
      id: `eval_${evalType}_${Date.now().toString(36)}`,
      runName: `${evalType.charAt(0).toUpperCase() + evalType.slice(1)} Eval - ${new Date().toISOString().slice(0, 10)}`,
      startedAt: new Date().toISOString(),
      completedAt: new Date(Date.now() + 30000).toISOString(),
    };

    return NextResponse.json(newRun, { status: 201 });
  } catch (error) {
    logger.error({
      event: 'evaluations_api_post_error',
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Failed to trigger evaluation' },
      { status: 500 },
    );
  }
}
