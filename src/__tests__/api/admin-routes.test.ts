/**
 * Admin route lib tests.
 *
 * The route handlers in `src/app/api/admin/*` are thin shells over
 * helpers in `src/lib/admin/*`. We test the helpers directly with a
 * mocked Prisma client — same pattern the existing
 * `src/__tests__/lib/anomaly/pricing-anomaly.test.ts` uses.
 *
 * One test per route covers:
 *   1. shape of the result the route returns
 *   2. that filters narrow the result set / forward to Prisma where-clauses
 */

// ─── Mocks ───────────────────────────────────────────────────────────────────

const transactionImpl = jest.fn(async (queries: unknown[]) =>
  Promise.all(queries as Promise<unknown>[]),
);

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: transactionImpl,
    $queryRaw: jest.fn(),
    auditEvent: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    dataLineage: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    anomalyRecord: {
      count: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    lLMInvocation: {
      aggregate: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    promptTemplate: {
      findMany: jest.fn(),
    },
    evaluationRun: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    correctionRecord: {
      groupBy: jest.fn(),
      create: jest.fn(),
    },
    thresholdConfig: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  buildAuditWhere,
  listAuditEvents,
  normalizePagination,
  MAX_PAGE_SIZE,
} from '@/lib/admin/audit';
import {
  getLineageChain,
  buildEntityName,
  deriveSourceDocument,
} from '@/lib/admin/lineage';
import {
  buildAnomalyWhere,
  categorise,
  listAnomalyRecords,
} from '@/lib/admin/anomaly-records';
import { getLLMOpsDashboard } from '@/lib/admin/llmops';
import { listEvaluationRuns, getEvaluationRun } from '@/lib/admin/evaluations';
import {
  getFeedbackState,
  recordCorrection,
  adjustThreshold,
} from '@/lib/admin/feedback';

// Convenience accessors with the right Jest types.
const m = {
  auditCount: prisma.auditEvent.count as jest.Mock,
  auditFindMany: prisma.auditEvent.findMany as jest.Mock,
  lineageFindMany: prisma.dataLineage.findMany as jest.Mock,
  lineageFindFirst: prisma.dataLineage.findFirst as jest.Mock,
  anomalyCount: prisma.anomalyRecord.count as jest.Mock,
  anomalyFindMany: prisma.anomalyRecord.findMany as jest.Mock,
  anomalyGroupBy: prisma.anomalyRecord.groupBy as jest.Mock,
  llmAggregate: prisma.lLMInvocation.aggregate as jest.Mock,
  llmCount: prisma.lLMInvocation.count as jest.Mock,
  llmGroupBy: prisma.lLMInvocation.groupBy as jest.Mock,
  promptFindMany: prisma.promptTemplate.findMany as jest.Mock,
  evalFindMany: prisma.evaluationRun.findMany as jest.Mock,
  evalFindUnique: prisma.evaluationRun.findUnique as jest.Mock,
  correctionGroupBy: prisma.correctionRecord.groupBy as jest.Mock,
  correctionCreate: prisma.correctionRecord.create as jest.Mock,
  thresholdFindMany: prisma.thresholdConfig.findMany as jest.Mock,
  thresholdFindUnique: prisma.thresholdConfig.findUnique as jest.Mock,
  thresholdUpdate: prisma.thresholdConfig.update as jest.Mock,
  queryRaw: prisma.$queryRaw as jest.Mock,
};

beforeEach(() => {
  jest.clearAllMocks();
  transactionImpl.mockImplementation(async (queries: unknown[]) =>
    Promise.all(queries as Promise<unknown>[]),
  );
});

// ─── Audit ──────────────────────────────────────────────────────────────────

describe('admin/audit', () => {
  it('paginates results and maps Prisma rows to API DTOs', async () => {
    const sampleRow = {
      id: 'aud_1',
      timestamp: new Date('2026-04-29T10:00:00Z'),
      actorId: 'admin@wholesalehub.com',
      actorType: 'USER',
      action: 'CREATE',
      entityType: 'ORDER',
      entityId: 'ord_001',
      traceId: 'trc_x',
      changedFields: ['status'],
      previousState: null,
      newState: { status: 'NEW' },
    };

    m.auditCount.mockResolvedValue(1);
    m.auditFindMany.mockResolvedValue([sampleRow]);

    const result = await listAuditEvents({ page: 1, limit: 10 });

    expect(result.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'aud_1',
      actor: 'admin@wholesalehub.com',
      action: 'CREATE',
      entityType: 'ORDER',
      traceId: 'trc_x',
      after: { status: 'NEW' },
    });
  });

  it('builds a Prisma where-clause that narrows by entityType, action, and traceId', () => {
    const where = buildAuditWhere({
      entityType: 'order',
      action: 'create',
      traceId: 'trc_xyz',
      from: '2026-04-01',
      to: '2026-04-30',
    });

    expect(where.entityType).toBe('ORDER');
    expect(where.action).toBe('CREATE');
    expect(where.traceId).toBe('trc_xyz');
    expect(where.timestamp).toBeDefined();
    const range = where.timestamp as { gte?: Date; lt?: Date };
    expect(range.gte).toBeInstanceOf(Date);
    expect(range.lt).toBeInstanceOf(Date);
  });

  it('clamps oversized limit to the page size cap', () => {
    expect(normalizePagination(2, 9999)).toEqual({ page: 2, limit: MAX_PAGE_SIZE });
    expect(normalizePagination(undefined, undefined)).toEqual({ page: 1, limit: 25 });
    expect(normalizePagination(-5, 0)).toEqual({ page: 1, limit: 25 });
  });
});

// ─── Lineage ────────────────────────────────────────────────────────────────

describe('admin/lineage', () => {
  it('returns ordered chain nodes plus a derived source document', async () => {
    m.lineageFindMany.mockResolvedValue([
      {
        id: 'ln_1',
        sourceType: 'DOCUMENT',
        sourceUrl: '/u/invoice.pdf',
        transformationType: 'CREATED',
        transformationDetails: { mimeType: 'application/pdf' },
        evidenceUrl: '/u/invoice.pdf',
        evidenceHash: 'sha256:abc',
        createdBy: 'sarah@wh.com',
        createdAt: new Date('2026-04-01T00:00:00Z'),
      },
      {
        id: 'ln_2',
        sourceType: 'AI_EXTRACTION',
        sourceUrl: null,
        transformationType: 'EXTRACTED',
        transformationDetails: { model: 'claude-3-sonnet' },
        evidenceUrl: null,
        evidenceHash: null,
        createdBy: 'SYSTEM',
        createdAt: new Date('2026-04-01T00:01:00Z'),
      },
    ]);

    const chain = await getLineageChain({
      entityType: 'receipt',
      entityId: '0042',
    });

    expect(chain.entityType).toBe('RECEIPT');
    expect(chain.entityName).toBe('Receipt #0042');
    expect(chain.nodes).toHaveLength(2);
    expect(chain.nodes[0].transformationType).toBe('CREATED');
    expect(chain.sourceDocument?.hash).toBe('sha256:abc');
    expect(chain.sourceDocument?.name).toBe('invoice.pdf');
  });

  it('forwards the sourceType filter to the Prisma where-clause', async () => {
    m.lineageFindMany.mockResolvedValue([]);
    m.lineageFindFirst.mockResolvedValue(null);

    await getLineageChain({
      entityType: 'RECEIPT',
      entityId: 'x',
      sourceType: 'AI_EXTRACTION',
    });

    expect(m.lineageFindMany).toHaveBeenCalledWith({
      where: {
        entityType: 'RECEIPT',
        entityId: 'x',
        sourceType: 'AI_EXTRACTION',
      },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('builds entityName for known and unknown entity types', () => {
    expect(buildEntityName('ORDER', 'abc')).toBe('Order #abc');
    expect(buildEntityName('FOO', 'abc')).toBe('Entity abc');
  });

  it('returns null source document when the root has no urls', () => {
    expect(
      deriveSourceDocument({
        sourceType: 'X',
        sourceUrl: null,
        evidenceUrl: null,
        evidenceHash: null,
        transformationDetails: null,
        createdAt: new Date(),
      }),
    ).toBeNull();
  });
});

// ─── Anomaly records ────────────────────────────────────────────────────────

describe('admin/anomaly-records', () => {
  it('buckets records by category and pages results', async () => {
    const rows = [
      {
        id: 'a1',
        type: 'PRICING_ZSCORE',
        severity: 'HIGH',
        entityType: 'PRODUCT_PRICING',
        entityId: 'p1',
        description: 'price too high',
        metadata: { x: 1 },
        isFalsePositive: false,
        resolvedBy: null,
        resolvedAt: null,
        createdAt: new Date('2026-04-29T00:00:00Z'),
      },
      {
        id: 'a2',
        type: 'LARGE_ORDER',
        severity: 'CRITICAL',
        entityType: 'ORDER',
        entityId: 'o1',
        description: 'big order',
        metadata: null,
        isFalsePositive: false,
        resolvedBy: null,
        resolvedAt: null,
        createdAt: new Date('2026-04-28T00:00:00Z'),
      },
    ];

    m.anomalyCount.mockResolvedValue(rows.length);
    m.anomalyFindMany.mockResolvedValue(rows);
    m.anomalyGroupBy.mockResolvedValue([
      { severity: 'HIGH', _count: { _all: 1 } },
      { severity: 'CRITICAL', _count: { _all: 1 } },
    ]);

    const report = await listAnomalyRecords({});

    expect(report.pagination.total).toBe(2);
    expect(report.summary.HIGH).toBe(1);
    expect(report.summary.CRITICAL).toBe(1);
    expect(report.summary.total).toBe(2);
    expect(report.pricingAnomalies).toHaveLength(1);
    expect(report.orderAnomalies).toHaveLength(1);
    expect(report.inventoryAnomalies).toHaveLength(0);
  });

  it('builds a where-clause from severity (multi-value) and category prefixes', () => {
    const where = buildAnomalyWhere({
      severity: 'HIGH,CRITICAL',
      type: 'pricing',
      entityType: 'PRODUCT_PRICING',
    });

    expect(where.entityType).toBe('PRODUCT_PRICING');
    expect(where.severity).toEqual({ in: ['HIGH', 'CRITICAL'] });
    expect(Array.isArray(where.OR)).toBe(true);
    expect(where.OR).toHaveLength(2); // PRICING_ + PRICE_ prefixes
  });

  it('categorises types by prefix', () => {
    expect(categorise('PRICING_ZSCORE')).toBe('pricing');
    expect(categorise('PRICE_SPIKE')).toBe('pricing');
    expect(categorise('LARGE_ORDER')).toBe('orders');
    expect(categorise('LOW_STOCK')).toBe('inventory');
    expect(categorise('UNKNOWN_TYPE')).toBeNull();
  });
});

// ─── LLMOps ─────────────────────────────────────────────────────────────────

describe('admin/llmops', () => {
  it('aggregates KPIs in the DB and converts Decimal cost to a Number', async () => {
    m.llmAggregate.mockResolvedValue({
      _count: { _all: 100 },
      _avg: { latencyMs: 1234 },
      _sum: { cost: new Prisma.Decimal('25.7891') },
    });
    m.llmCount.mockResolvedValue(2); // failures
    m.llmGroupBy.mockResolvedValue([
      {
        promptName: 'RECEIPT_EXTRACTION',
        _count: { _all: 60 },
        _avg: { latencyMs: 2000 },
        _sum: { cost: new Prisma.Decimal('20.0') },
      },
      {
        promptName: 'SEARCH_REWRITE',
        _count: { _all: 40 },
        _avg: { latencyMs: 500 },
        _sum: { cost: new Prisma.Decimal('5.0') },
      },
    ]);
    m.promptFindMany.mockResolvedValue([
      {
        id: 'pt_1',
        name: 'RECEIPT_EXTRACTION',
        version: '1.0.0',
        model: 'claude-3-sonnet',
        isActive: true,
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
      {
        id: 'pt_2',
        name: 'NEVER_INVOKED',
        version: '0.1.0',
        model: 'claude-3-sonnet',
        isActive: true,
        createdAt: new Date('2026-04-15T00:00:00Z'),
      },
    ]);
    m.queryRaw.mockResolvedValue([]);

    const result = await getLLMOpsDashboard({ days: 30 });

    expect(result.kpi.totalInvocations30d).toBe(100);
    expect(typeof result.kpi.totalCost30d).toBe('number');
    expect(result.kpi.totalCost30d).toBeCloseTo(25.79, 2);
    expect(result.kpi.successRate).toBeCloseTo(98, 1);

    expect(result.prompts).toHaveLength(2);
    const receipt = result.prompts!.find((p) => p.name === 'RECEIPT_EXTRACTION');
    expect(receipt?.invocations30d).toBe(60);
    expect(receipt?.cost30d).toBe(20);
    expect(receipt?.status).toBe('active');

    const idle = result.prompts!.find((p) => p.name === 'NEVER_INVOKED');
    expect(idle?.invocations30d).toBe(0);
    expect(idle?.status).toBe('draft');

    expect(result.costBreakdown).toBeDefined();
    expect(result.costBreakdown![0].promptName).toBe('RECEIPT_EXTRACTION');
  });

  it('filters output to the prompts view when view=prompts', async () => {
    m.llmAggregate.mockResolvedValue({
      _count: { _all: 0 },
      _avg: { latencyMs: 0 },
      _sum: { cost: null },
    });
    m.llmCount.mockResolvedValue(0);
    m.llmGroupBy.mockResolvedValue([]);
    m.promptFindMany.mockResolvedValue([]);
    m.queryRaw.mockResolvedValue([]);

    const result = await getLLMOpsDashboard({ view: 'prompts' });

    expect(result.prompts).toEqual([]);
    expect(result.dailyInvocations).toBeUndefined();
    expect(result.costBreakdown).toBeUndefined();
    expect(result.abTests).toBeUndefined();
  });
});

// ─── Evaluations ────────────────────────────────────────────────────────────

describe('admin/evaluations', () => {
  it('returns runs with their result summary', async () => {
    m.evalFindMany.mockResolvedValue([
      {
        id: 'er_1',
        runName: 'Search Eval',
        evaluationType: 'search',
        startedAt: new Date('2026-04-01T00:00:00Z'),
        completedAt: new Date('2026-04-01T00:02:00Z'),
        totalSamples: 10,
        accuracy: new Prisma.Decimal('0.84'),
        precision: new Prisma.Decimal('0.88'),
        recall: new Prisma.Decimal('0.76'),
        f1Score: new Prisma.Decimal('0.8157'),
        metrics: { mrr: 0.92, falsePositiveRate: 0.12, falseNegativeRate: 0.24 },
        results: [
          {
            inputData: 'disposable vape',
            expectedOutput: 'PRD001',
            actualOutput: 'PRD001',
            isCorrect: true,
            errorType: null,
          },
        ],
      },
    ]);

    const result = await listEvaluationRuns({});

    expect(result.count).toBe(1);
    expect(result.runs[0].metrics.f1Score).toBeCloseTo(0.8157, 4);
    expect(result.runs[0].metrics.recall).toBeCloseTo(0.76, 2);
    expect(result.runs[0].metrics.mrr).toBeCloseTo(0.92, 2);
    expect(result.runs[0].results).toHaveLength(1);
  });

  it('forwards type filter to Prisma where-clause', async () => {
    m.evalFindMany.mockResolvedValue([]);

    await listEvaluationRuns({ type: 'extraction' });

    expect(m.evalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { evaluationType: 'extraction' },
      }),
    );
  });

  it('returns null for an unknown runId', async () => {
    m.evalFindUnique.mockResolvedValue(null);
    expect(await getEvaluationRun('nope')).toBeNull();
  });
});

// ─── Feedback ───────────────────────────────────────────────────────────────

describe('admin/feedback', () => {
  it('returns correction stats and threshold configs', async () => {
    m.correctionGroupBy.mockImplementation(
      async (args: { by: string[]; where?: unknown }) => {
        if (args.by.includes('fieldName')) {
          return [
            { entityType: 'EXTRACTION', fieldName: 'quantity', _count: { _all: 5 } },
            { entityType: 'EXTRACTION', fieldName: 'unit_cost', _count: { _all: 3 } },
          ];
        }
        // entityType groupings: total / 7d / 30d
        return [{ entityType: 'EXTRACTION', _count: { _all: 12 } }];
      },
    );

    m.thresholdFindMany.mockResolvedValue([
      {
        metricName: 'pricing_zscore_high',
        currentValue: 3,
        minValue: 1,
        maxValue: 5,
        falsePositiveCount: 0,
        falseNegativeCount: 0,
        lastTunedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-04-01T00:00:00Z'),
      },
    ]);

    const state = await getFeedbackState();

    expect(state.correctionStats).toHaveLength(1);
    expect(state.correctionStats[0].totalCorrections).toBe(12);
    expect(state.correctionStats[0].topCorrectedFields[0]).toEqual({
      field: 'quantity',
      count: 5,
    });
    expect(state.thresholdConfigs).toHaveLength(1);
    expect(state.thresholdConfigs[0].metricName).toBe('pricing_zscore_high');
    expect(state.totalCorrections).toBe(12);
    expect(state.totalThresholds).toBe(1);
  });

  it('records a correction via Prisma create', async () => {
    m.correctionCreate.mockResolvedValue({
      id: 'cr_1',
      createdAt: new Date('2026-04-30T00:00:00Z'),
    });

    const result = await recordCorrection({
      entityType: 'EXTRACTION',
      entityId: 'rcp_1',
      fieldName: 'quantity',
      originalValue: '500',
      correctedValue: '480',
      feedbackType: 'WRONG_VALUE',
      correctedBy: 'mike@wh.com',
    });

    expect(result.id).toBe('cr_1');
    expect(m.correctionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: 'EXTRACTION',
        entityId: 'rcp_1',
        feedbackType: 'WRONG_VALUE',
      }),
    });
  });

  it('clamps adjusted threshold values to the configured min/max', async () => {
    m.thresholdFindUnique.mockResolvedValue({
      metricName: 'pricing_zscore_high',
      currentValue: 3,
      minValue: 1,
      maxValue: 5,
      falsePositiveCount: 0,
      falseNegativeCount: 0,
      lastTunedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    m.thresholdUpdate.mockImplementation(
      async (args: { data: { currentValue: number } }) => ({
        metricName: 'pricing_zscore_high',
        currentValue: args.data.currentValue,
        updatedAt: new Date('2026-04-30T00:00:00Z'),
      }),
    );

    const out = await adjustThreshold({
      metricName: 'pricing_zscore_high',
      newValue: 99, // overflows max 5
    });

    expect(out?.currentValue).toBe(5);
    expect(out?.previousValue).toBe(3);
  });

  it('returns null when the threshold does not exist', async () => {
    m.thresholdFindUnique.mockResolvedValue(null);
    const out = await adjustThreshold({ metricName: 'no_such_metric', newValue: 1 });
    expect(out).toBeNull();
  });
});
