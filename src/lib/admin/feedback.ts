/**
 * Admin feedback / threshold-tuning query helpers.
 *
 * Joins `CorrectionRecord` (per-entityType correction stats) with
 * `ThresholdConfig` (current detector thresholds) so the feedback page
 * can render both panels off one fetch.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export interface CorrectionStatDto {
  entityType: string;
  totalCorrections: number;
  last7Days: number;
  last30Days: number;
  topCorrectedFields: { field: string; count: number }[];
}

export interface ThresholdConfigDto {
  metricName: string;
  currentValue: number;
  defaultValue: number;
  description: string;
  lastUpdated: string;
  updatedBy: string;
  minValue: number;
  maxValue: number;
  falsePositiveCount: number;
  falseNegativeCount: number;
}

export interface FeedbackStateDto {
  correctionStats: CorrectionStatDto[];
  thresholdConfigs: ThresholdConfigDto[];
  totalCorrections: number;
  totalThresholds: number;
}

/** Map a `ThresholdConfig` row to the DTO. */
export function mapThresholdRow(row: {
  metricName: string;
  currentValue: number;
  minValue: number;
  maxValue: number;
  falsePositiveCount: number;
  falseNegativeCount: number;
  lastTunedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ThresholdConfigDto {
  return {
    metricName: row.metricName,
    currentValue: row.currentValue,
    // The schema doesn't store `defaultValue`/`description`/`updatedBy`
    // separately, so we derive sensible values from the config row.
    defaultValue: row.currentValue,
    description: `Threshold for ${row.metricName}`,
    lastUpdated: (row.lastTunedAt ?? row.updatedAt).toISOString(),
    updatedBy: 'system',
    minValue: row.minValue,
    maxValue: row.maxValue,
    falsePositiveCount: row.falsePositiveCount,
    falseNegativeCount: row.falseNegativeCount,
  };
}

/**
 * Aggregate correction counts by entityType. We compute per-window
 * counts (last 7d, last 30d) via groupBy + count to keep the math in
 * Postgres rather than loading rows into JS.
 *
 * `topCorrectedFields` requires a per-(entityType, fieldName) groupBy,
 * which is also a single round-trip.
 */
export async function getCorrectionStats(): Promise<CorrectionStatDto[]> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

  const [byEntity, byEntity7d, byEntity30d, byField] = await Promise.all([
    prisma.correctionRecord.groupBy({
      by: ['entityType'],
      _count: { _all: true },
    }),
    prisma.correctionRecord.groupBy({
      by: ['entityType'],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { _all: true },
    }),
    prisma.correctionRecord.groupBy({
      by: ['entityType'],
      where: { createdAt: { gte: thirtyDaysAgo } },
      _count: { _all: true },
    }),
    prisma.correctionRecord.groupBy({
      by: ['entityType', 'fieldName'],
      _count: { _all: true },
    }),
  ]);

  const sevenDaysMap = new Map(byEntity7d.map((g) => [g.entityType, g._count._all]));
  const thirtyDaysMap = new Map(byEntity30d.map((g) => [g.entityType, g._count._all]));

  // Group field counts by entityType, keep top 5.
  const fieldsByEntity = new Map<string, { field: string; count: number }[]>();
  for (const g of byField) {
    const arr = fieldsByEntity.get(g.entityType) ?? [];
    arr.push({ field: g.fieldName, count: g._count._all });
    fieldsByEntity.set(g.entityType, arr);
  }

  return byEntity.map((g) => ({
    entityType: g.entityType,
    totalCorrections: g._count._all,
    last7Days: sevenDaysMap.get(g.entityType) ?? 0,
    last30Days: thirtyDaysMap.get(g.entityType) ?? 0,
    topCorrectedFields: (fieldsByEntity.get(g.entityType) ?? [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  }));
}

/**
 * Top-level dashboard fetch — both correction stats and current
 * threshold configs in one call.
 */
export async function getFeedbackState(): Promise<FeedbackStateDto> {
  const [correctionStats, thresholdRows] = await Promise.all([
    getCorrectionStats(),
    prisma.thresholdConfig.findMany({ orderBy: { metricName: 'asc' } }),
  ]);

  const thresholdConfigs = thresholdRows.map(mapThresholdRow);

  return {
    correctionStats,
    thresholdConfigs,
    totalCorrections: correctionStats.reduce((s, c) => s + c.totalCorrections, 0),
    totalThresholds: thresholdConfigs.length,
  };
}

export interface RecordCorrectionInput {
  entityType: string;
  entityId: string;
  fieldName: string;
  originalValue: string;
  correctedValue: string;
  feedbackType: string;
  correctedBy: string;
}

/** Append a correction record. Used by the route's POST handler. */
export async function recordCorrection(
  input: RecordCorrectionInput,
): Promise<{ id: string; createdAt: string }> {
  const row = await prisma.correctionRecord.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      fieldName: input.fieldName,
      originalValue: input.originalValue,
      correctedValue: input.correctedValue,
      feedbackType: input.feedbackType,
      correctedBy: input.correctedBy,
    },
  });
  return { id: row.id, createdAt: row.createdAt.toISOString() };
}

export interface AdjustThresholdInput {
  metricName: string;
  newValue: number;
}

/** Adjust a threshold value and stamp `lastTunedAt`. */
export async function adjustThreshold(
  input: AdjustThresholdInput,
): Promise<{
  metricName: string;
  previousValue: number;
  currentValue: number;
  updatedAt: string;
} | null> {
  const where: Prisma.ThresholdConfigWhereUniqueInput = { metricName: input.metricName };
  const existing = await prisma.thresholdConfig.findUnique({ where });
  if (!existing) return null;

  // Hard-clamp to the configured min/max so we never drift outside the
  // tuner's allowed range.
  const clamped = Math.min(Math.max(input.newValue, existing.minValue), existing.maxValue);

  const updated = await prisma.thresholdConfig.update({
    where,
    data: {
      currentValue: clamped,
      lastTunedAt: new Date(),
    },
  });

  return {
    metricName: updated.metricName,
    previousValue: existing.currentValue,
    currentValue: updated.currentValue,
    updatedAt: updated.updatedAt.toISOString(),
  };
}
