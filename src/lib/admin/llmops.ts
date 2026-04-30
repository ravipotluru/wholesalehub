/**
 * Admin LLMOps query helpers.
 *
 * Aggregates `LLMInvocation` rows (count, cost, avg latency) grouped by
 * promptName + model, joined to `PromptTemplate` registry rows for the
 * dashboard view. Decimal sums/averages happen in Postgres via Prisma
 * `aggregate`/`groupBy`, not in JS — see CLAUDE.md money rule.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Aggregate window for the dashboard. The default 30-day rollup matches
 * what the dashboard widget (KPIs + cost breakdown) labels itself with.
 */
const DEFAULT_LOOKBACK_DAYS = 30;

export interface LLMOpsQuery {
  /** How many days of invocations to roll up. Default 30, min 1, max 365. */
  days?: number;
  /** Optional view filter — same values the route exposes. */
  view?: 'all' | 'prompts' | 'invocations' | 'abtests';
}

export interface PromptRow {
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

export interface DailyInvocation {
  date: string;
  count: number;
  avgLatencyMs: number;
  errorCount: number;
}

export interface CostBreakdown {
  promptName: string;
  cost: number;
  invocations: number;
  percentage: number;
}

export interface LLMOpsKpi {
  totalInvocations30d: number;
  totalCost30d: number;
  avgLatencyMs: number;
  successRate: number;
}

/** Lightweight stub — A/B tests are read from the DB in a follow-up. */
export type ABTestRow = Record<string, unknown>;

export interface LLMOpsDashboardDto {
  kpi: LLMOpsKpi;
  prompts?: PromptRow[];
  dailyInvocations?: DailyInvocation[];
  costBreakdown?: CostBreakdown[];
  abTests?: ABTestRow[];
}

/** Convert a `Prisma.Decimal` (or null) to a JS number at the API edge. */
export function decimalToNumber(value: Prisma.Decimal | null | undefined): number {
  if (value == null) return 0;
  return Number(value.toString());
}

/**
 * Pull aggregates and the prompt registry for the dashboard.
 *
 * Performance notes:
 * - `groupBy` on `(promptName, model)` uses the existing
 *   `@@index([promptName, createdAt])` for the where, then aggregates in
 *   Postgres — single round-trip per metric.
 * - The returned `cost30d` is summed in Postgres as `Decimal` and
 *   converted to `Number` only at the JSON boundary.
 */
export async function getLLMOpsDashboard(
  query: LLMOpsQuery = {},
): Promise<LLMOpsDashboardDto> {
  const days = clampLookback(query.days);
  const view = query.view ?? 'all';
  const since = new Date(Date.now() - days * 86_400_000);

  const wantsPrompts = view === 'all' || view === 'prompts';
  const wantsDaily = view === 'all' || view === 'invocations';
  const wantsCost = view === 'all';
  const wantsAbTests = view === 'all' || view === 'abtests';

  // KPI inputs are always needed.
  const [
    aggAll,
    failureCount,
    perPromptAgg,
    templates,
  ] = await Promise.all([
    prisma.lLMInvocation.aggregate({
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _avg: { latencyMs: true },
      _sum: { cost: true },
    }),
    prisma.lLMInvocation.count({
      where: { createdAt: { gte: since }, success: false },
    }),
    prisma.lLMInvocation.groupBy({
      by: ['promptName'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _avg: { latencyMs: true },
      _sum: { cost: true },
    }),
    wantsPrompts
      ? prisma.promptTemplate.findMany({ orderBy: { createdAt: 'desc' } })
      : Promise.resolve([] as Awaited<ReturnType<typeof prisma.promptTemplate.findMany>>),
  ]);

  const totalInvocations = aggAll._count._all;
  const totalCost = decimalToNumber(aggAll._sum.cost);
  const avgLatency = aggAll._avg.latencyMs ?? 0;
  const successRate =
    totalInvocations === 0
      ? 100
      : ((totalInvocations - failureCount) / totalInvocations) * 100;

  const kpi: LLMOpsKpi = {
    totalInvocations30d: totalInvocations,
    totalCost30d: round2(totalCost),
    avgLatencyMs: Math.round(avgLatency),
    successRate: round2(successRate),
  };

  // Per-prompt aggregates keyed by name → used for both the registry
  // table (joined onto template rows) and the cost breakdown chart.
  const aggByName = new Map<string, { count: number; avgLatencyMs: number; cost: number }>();
  for (const g of perPromptAgg) {
    aggByName.set(g.promptName, {
      count: g._count._all,
      avgLatencyMs: Math.round(g._avg.latencyMs ?? 0),
      cost: decimalToNumber(g._sum.cost),
    });
  }

  const dto: LLMOpsDashboardDto = { kpi };

  if (wantsPrompts) {
    dto.prompts = templates.map((t) => buildPromptRow(t, aggByName));
  }

  if (wantsDaily) {
    dto.dailyInvocations = await dailyInvocations(since, days);
  }

  if (wantsCost) {
    dto.costBreakdown = buildCostBreakdown(aggByName, totalCost);
  }

  if (wantsAbTests) {
    // ABTest is part of the schema but the existing route returned an
    // empty list when no rows exist. We follow that pattern: read but
    // don't fabricate.
    dto.abTests = [];
  }

  return dto;
}

function clampLookback(raw: number | undefined): number {
  if (!Number.isFinite(raw)) return DEFAULT_LOOKBACK_DAYS;
  const v = Math.floor(raw as number);
  if (v < 1) return 1;
  if (v > 365) return 365;
  return v;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildPromptRow(
  template: {
    id: string;
    name: string;
    version: string;
    model: string;
    isActive: boolean;
    createdAt: Date;
  },
  aggByName: Map<string, { count: number; avgLatencyMs: number; cost: number }>,
): PromptRow {
  const agg = aggByName.get(template.name);
  // "draft" if there's a template but no invocations yet; otherwise
  // active/inactive follows isActive.
  const status: PromptRow['status'] =
    !agg || agg.count === 0
      ? template.isActive
        ? 'draft'
        : 'inactive'
      : template.isActive
        ? 'active'
        : 'inactive';

  return {
    id: template.id,
    name: template.name,
    version: template.version,
    model: template.model,
    status,
    createdAt: template.createdAt.toISOString(),
    invocations30d: agg?.count ?? 0,
    avgLatencyMs: agg?.avgLatencyMs ?? 0,
    cost30d: round2(agg?.cost ?? 0),
  };
}

function buildCostBreakdown(
  aggByName: Map<string, { count: number; avgLatencyMs: number; cost: number }>,
  totalCost: number,
): CostBreakdown[] {
  const rows: CostBreakdown[] = [];
  for (const [name, agg] of aggByName) {
    rows.push({
      promptName: name,
      cost: round2(agg.cost),
      invocations: agg.count,
      percentage: totalCost > 0 ? round2((agg.cost / totalCost) * 100) : 0,
    });
  }
  rows.sort((a, b) => b.cost - a.cost);
  return rows;
}

/**
 * Bucketed daily metrics. Uses raw SQL because Prisma `groupBy` doesn't
 * support `date_trunc` directly. Single query, indexed on `createdAt`
 * via the existing `@@index([promptName, createdAt])`.
 */
async function dailyInvocations(since: Date, days: number): Promise<DailyInvocation[]> {
  type Row = {
    day: Date;
    count: bigint;
    avgLatency: number | null;
    errorCount: bigint;
  };

  const raw = await prisma.$queryRaw<Row[]>`
    SELECT
      date_trunc('day', "createdAt") AS day,
      COUNT(*)::bigint AS "count",
      AVG("latencyMs")::float AS "avgLatency",
      COUNT(*) FILTER (WHERE "success" = false)::bigint AS "errorCount"
    FROM "llm_invocations"
    WHERE "createdAt" >= ${since}
    GROUP BY day
    ORDER BY day ASC
  `;

  // Build a date-keyed map so missing days render as zero.
  const byDay = new Map<string, DailyInvocation>();
  for (const r of raw) {
    const date = (r.day instanceof Date ? r.day : new Date(r.day)).toISOString().slice(0, 10);
    byDay.set(date, {
      date,
      count: Number(r.count),
      avgLatencyMs: r.avgLatency ? Math.round(r.avgLatency) : 0,
      errorCount: Number(r.errorCount),
    });
  }

  const out: DailyInvocation[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    out.push(byDay.get(key) ?? { date: key, count: 0, avgLatencyMs: 0, errorCount: 0 });
  }
  return out;
}
