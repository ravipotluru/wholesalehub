/**
 * Admin evaluation-run query helpers.
 *
 * Joins `EvaluationRun` to its `EvaluationResult` rows. Returns metric
 * summaries (accuracy, precision, recall, F1, MRR-style aggregates)
 * with the per-result detail the UI's drill-down expects.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export interface EvaluationFilters {
  /** Filter by evaluation type (search | extraction | policy). */
  type?: string;
  /** Optional single-run lookup. */
  runId?: string;
}

export interface EvaluationResultDto {
  input: string;
  expected: string;
  actual: string;
  correct: boolean;
  errorType: string | null;
}

export interface EvaluationMetricsDto {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  totalSamples: number;
  /** Mean Reciprocal Rank — pulled from the JSON `metrics` blob if present. */
  mrr?: number;
}

export interface EvaluationRunDto {
  id: string;
  runName: string;
  type: string;
  startedAt: string;
  completedAt: string;
  sampleCount: number;
  metrics: EvaluationMetricsDto;
  results: EvaluationResultDto[];
}

const VALID_TYPE_VALUES = ['search', 'extraction', 'policy'] as const;
export const VALID_EVAL_TYPES = new Set<string>(VALID_TYPE_VALUES);

/** Convert a `Decimal` (or null) to a JS number — used at the API edge. */
export function decimalOrZero(value: Prisma.Decimal | null | undefined): number {
  if (value == null) return 0;
  return Number(value.toString());
}

/** Stringify a JSON value down to a presentable form for the result table. */
function jsonToDisplay(value: Prisma.JsonValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** Map `EvaluationResult` row → DTO. */
export function mapResultRow(row: {
  inputData: Prisma.JsonValue;
  expectedOutput: Prisma.JsonValue;
  actualOutput: Prisma.JsonValue;
  isCorrect: boolean;
  errorType: string | null;
}): EvaluationResultDto {
  return {
    input: jsonToDisplay(row.inputData),
    expected: jsonToDisplay(row.expectedOutput),
    actual: jsonToDisplay(row.actualOutput),
    correct: row.isCorrect,
    errorType: row.errorType,
  };
}

interface RawRun {
  id: string;
  runName: string;
  evaluationType: string;
  startedAt: Date;
  completedAt: Date | null;
  totalSamples: number;
  accuracy: Prisma.Decimal | null;
  precision: Prisma.Decimal | null;
  recall: Prisma.Decimal | null;
  f1Score: Prisma.Decimal | null;
  metrics: Prisma.JsonValue;
  results?: Array<{
    inputData: Prisma.JsonValue;
    expectedOutput: Prisma.JsonValue;
    actualOutput: Prisma.JsonValue;
    isCorrect: boolean;
    errorType: string | null;
  }>;
}

export function mapRunRow(row: RawRun): EvaluationRunDto {
  const metricsJson =
    row.metrics && typeof row.metrics === 'object' && !Array.isArray(row.metrics)
      ? (row.metrics as Record<string, unknown>)
      : {};

  const fpRate = typeof metricsJson.falsePositiveRate === 'number'
    ? metricsJson.falsePositiveRate
    : 0;
  const fnRate = typeof metricsJson.falseNegativeRate === 'number'
    ? metricsJson.falseNegativeRate
    : 0;
  const mrr = typeof metricsJson.mrr === 'number' ? metricsJson.mrr : undefined;

  return {
    id: row.id,
    runName: row.runName,
    type: row.evaluationType,
    startedAt: row.startedAt.toISOString(),
    completedAt: (row.completedAt ?? row.startedAt).toISOString(),
    sampleCount: row.totalSamples,
    metrics: {
      accuracy: decimalOrZero(row.accuracy),
      precision: decimalOrZero(row.precision),
      recall: decimalOrZero(row.recall),
      f1Score: decimalOrZero(row.f1Score),
      falsePositiveRate: fpRate,
      falseNegativeRate: fnRate,
      totalSamples: row.totalSamples,
      ...(mrr !== undefined ? { mrr } : {}),
    },
    results: (row.results ?? []).map(mapResultRow),
  };
}

/** Look up a single run, including all of its results. */
export async function getEvaluationRun(runId: string): Promise<EvaluationRunDto | null> {
  const row = await prisma.evaluationRun.findUnique({
    where: { id: runId },
    include: { results: true },
  });
  if (!row) return null;
  return mapRunRow(row);
}

/** List runs, optionally filtered by type. Newest startedAt first. */
export async function listEvaluationRuns(
  filters: EvaluationFilters = {},
): Promise<{ runs: EvaluationRunDto[]; count: number }> {
  const where: Prisma.EvaluationRunWhereInput = {};
  if (filters.type) {
    where.evaluationType = filters.type;
  }

  // Result rows can be large — for the list view we include them so the
  // UI's drill-down works without a follow-up fetch (matches the mock).
  const runs = await prisma.evaluationRun.findMany({
    where,
    orderBy: { startedAt: 'desc' },
    include: { results: true },
  });

  return { runs: runs.map(mapRunRow), count: runs.length };
}
