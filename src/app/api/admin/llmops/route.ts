/**
 * Admin LLMOps API
 *
 * GET  /api/admin/llmops                    — dashboard data
 * GET  /api/admin/llmops?view=prompts       — prompt registry
 * GET  /api/admin/llmops?view=invocations   — invocation metrics
 * GET  /api/admin/llmops?view=abtests       — A/B tests
 * POST /api/admin/llmops                    — register prompt / manage A/B test
 *
 * Auth: ADMIN only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';

/** Allowed role set for this endpoint */
const ALLOWED_ROLES = new Set(['ADMIN']);

/** Valid view values */
const VALID_VIEWS = new Set(['prompts', 'invocations', 'abtests', 'all']);

// ─── Mock Data ───

interface MockPrompt {
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

interface MockDailyInvocation {
  date: string;
  count: number;
  avgLatencyMs: number;
  errorCount: number;
}

interface MockCostBreakdown {
  promptName: string;
  cost: number;
  invocations: number;
  percentage: number;
}

interface MockABTest {
  id: string;
  name: string;
  promptName: string;
  variantA: { version: string; trafficPercent: number; avgLatencyMs: number; accuracy: number };
  variantB: { version: string; trafficPercent: number; avgLatencyMs: number; accuracy: number };
  status: 'running' | 'concluded' | 'draft';
  startedAt: string;
  totalInvocations: number;
}

function generateMockPrompts(): MockPrompt[] {
  const now = Date.now();
  return [
    { id: 'prompt_doc_class_v1_0_0', name: 'DOCUMENT_CLASSIFICATION', version: '1.0.0', model: 'claude-3-sonnet', status: 'active', createdAt: new Date(now - 86400000 * 30).toISOString(), invocations30d: 4521, avgLatencyMs: 1240, cost30d: 45.21 },
    { id: 'prompt_receipt_ext_v1_0_0', name: 'RECEIPT_EXTRACTION', version: '1.0.0', model: 'claude-3-sonnet', status: 'active', createdAt: new Date(now - 86400000 * 28).toISOString(), invocations30d: 3890, avgLatencyMs: 2850, cost30d: 112.50 },
    { id: 'prompt_receipt_ext_v2_0_0', name: 'RECEIPT_EXTRACTION', version: '2.0.0', model: 'claude-3-sonnet', status: 'draft', createdAt: new Date(now - 86400000 * 2).toISOString(), invocations30d: 0, avgLatencyMs: 0, cost30d: 0 },
    { id: 'prompt_search_rw_v1_0_0', name: 'SEARCH_REWRITE', version: '1.0.0', model: 'claude-3-sonnet', status: 'active', createdAt: new Date(now - 86400000 * 25).toISOString(), invocations30d: 12340, avgLatencyMs: 680, cost30d: 61.70 },
    { id: 'prompt_anomaly_exp_v1_0_0', name: 'ANOMALY_EXPLANATION', version: '1.0.0', model: 'claude-3-sonnet', status: 'active', createdAt: new Date(now - 86400000 * 20).toISOString(), invocations30d: 892, avgLatencyMs: 1580, cost30d: 17.84 },
    { id: 'prompt_entity_res_v1_0_0', name: 'ENTITY_RESOLUTION', version: '1.0.0', model: 'claude-3-sonnet', status: 'inactive', createdAt: new Date(now - 86400000 * 15).toISOString(), invocations30d: 156, avgLatencyMs: 1120, cost30d: 3.12 },
  ];
}

function generateMockDailyInvocations(): MockDailyInvocation[] {
  const data: MockDailyInvocation[] = [];
  const now = Date.now();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now - i * 86400000);
    const base = 600 + Math.floor(Math.random() * 300);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const count = weekend ? Math.floor(base * 0.4) : base;
    data.push({
      date: date.toISOString().slice(0, 10),
      count,
      avgLatencyMs: 1200 + Math.floor(Math.random() * 600),
      errorCount: Math.floor(count * 0.02),
    });
  }
  return data;
}

function generateMockCostBreakdown(): MockCostBreakdown[] {
  const totalCost = 240.37;
  return [
    { promptName: 'RECEIPT_EXTRACTION', cost: 112.50, invocations: 3890, percentage: 46.8 },
    { promptName: 'SEARCH_REWRITE', cost: 61.70, invocations: 12340, percentage: 25.7 },
    { promptName: 'DOCUMENT_CLASSIFICATION', cost: 45.21, invocations: 4521, percentage: 18.8 },
    { promptName: 'ANOMALY_EXPLANATION', cost: 17.84, invocations: 892, percentage: 7.4 },
    { promptName: 'ENTITY_RESOLUTION', cost: 3.12, invocations: 156, percentage: 1.3 },
  ];
}

function generateMockABTests(): MockABTest[] {
  const now = Date.now();
  return [
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
}

// ─── GET ───

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = user.role;

    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') ?? 'all';

    if (!VALID_VIEWS.has(view)) {
      return NextResponse.json(
        { error: `Invalid view. Must be one of: ${Array.from(VALID_VIEWS).join(', ')}` },
        { status: 400 },
      );
    }

    const prompts = generateMockPrompts();
    const invocations = generateMockDailyInvocations();
    const costBreakdown = generateMockCostBreakdown();
    const abTests = generateMockABTests();

    // Aggregate KPIs
    const totalInvocations30d = prompts.reduce((sum, p) => sum + p.invocations30d, 0);
    const totalCost30d = prompts.reduce((sum, p) => sum + p.cost30d, 0);
    const avgLatency = Math.round(
      prompts.filter((p) => p.invocations30d > 0).reduce((sum, p) => sum + p.avgLatencyMs, 0) /
      prompts.filter((p) => p.invocations30d > 0).length
    );
    const totalErrors = invocations.reduce((sum, d) => sum + d.errorCount, 0);
    const totalInvTotal = invocations.reduce((sum, d) => sum + d.count, 0);
    const successRate = totalInvTotal > 0 ? ((totalInvTotal - totalErrors) / totalInvTotal) * 100 : 100;

    const result: Record<string, unknown> = {
      kpi: {
        totalInvocations30d,
        totalCost30d: Math.round(totalCost30d * 100) / 100,
        avgLatencyMs: avgLatency,
        successRate: Math.round(successRate * 100) / 100,
      },
    };

    if (view === 'all' || view === 'prompts') {
      result.prompts = prompts;
    }
    if (view === 'all' || view === 'invocations') {
      result.dailyInvocations = invocations;
    }
    if (view === 'all') {
      result.costBreakdown = costBreakdown;
    }
    if (view === 'all' || view === 'abtests') {
      result.abTests = abTests;
    }

    logger.info({
      event: 'llmops_api_get',
      userId: user.id,
      view,
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error({
      event: 'llmops_api_get_error',
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Failed to fetch LLMOps data' },
      { status: 500 },
    );
  }
}

// ─── POST ───

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = user.role;

    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json() as { action?: string; [key: string]: unknown };
    const action = body.action;

    if (!action) {
      return NextResponse.json(
        { error: 'Missing action field' },
        { status: 400 },
      );
    }

    logger.info({
      event: 'llmops_api_post',
      userId: user.id,
      action,
    });

    switch (action) {
      case 'register_prompt': {
        const name = body.name as string | undefined;
        const version = body.version as string | undefined;
        if (!name || !version) {
          return NextResponse.json(
            { error: 'Missing name or version for register_prompt' },
            { status: 400 },
          );
        }
        return NextResponse.json({
          success: true,
          prompt: {
            id: `prompt_${name.toLowerCase()}_v${version.replace(/\./g, '_')}`,
            name,
            version,
            status: 'draft',
            createdAt: new Date().toISOString(),
          },
        }, { status: 201 });
      }

      case 'start_ab_test': {
        const testName = body.testName as string | undefined;
        if (!testName) {
          return NextResponse.json(
            { error: 'Missing testName for start_ab_test' },
            { status: 400 },
          );
        }
        return NextResponse.json({
          success: true,
          abTest: {
            id: `ab_${Date.now().toString(36)}`,
            name: testName,
            status: 'running',
            startedAt: new Date().toISOString(),
          },
        }, { status: 201 });
      }

      case 'stop_ab_test': {
        const testId = body.testId as string | undefined;
        if (!testId) {
          return NextResponse.json(
            { error: 'Missing testId for stop_ab_test' },
            { status: 400 },
          );
        }
        return NextResponse.json({
          success: true,
          abTest: {
            id: testId,
            status: 'concluded',
            concludedAt: new Date().toISOString(),
          },
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (error) {
    logger.error({
      event: 'llmops_api_post_error',
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Failed to process LLMOps action' },
      { status: 500 },
    );
  }
}
