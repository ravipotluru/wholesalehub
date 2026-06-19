/**
 * Admin anomaly-record query helpers.
 *
 * Reads persisted `AnomalyRecord` rows. Distinct from `src/lib/anomaly/*`,
 * which runs detection live on every call. The admin page expects a
 * "report"-shaped response (bucketed by category) plus a flat list with
 * pagination — we return both so the UI keeps working while the new
 * filter knobs are exposed.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  normalizePagination,
} from './audit';

const SEVERITY_VALUES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Severity = typeof SEVERITY_VALUES[number];

const VALID_CATEGORY_VALUES = ['pricing', 'orders', 'inventory'] as const;
export type AnomalyCategory = typeof VALID_CATEGORY_VALUES[number];

export const VALID_SEVERITIES = new Set<string>(SEVERITY_VALUES);
export const VALID_CATEGORIES = new Set<string>(VALID_CATEGORY_VALUES);

/**
 * Map a category bucket to the prefixes its `type` column uses. The
 * lib/anomaly/types module is the source of truth for these values;
 * we mirror them here so the route can filter without importing the
 * detection runtime.
 */
const CATEGORY_TYPE_PREFIXES: Record<AnomalyCategory, string[]> = {
  pricing: ['PRICING_', 'PRICE_'],
  orders: ['LARGE_ORDER', 'HIGH_FREQUENCY', 'UNUSUAL_HOUR', 'DUPLICATE_ORDER'],
  inventory: [
    'LOW_STOCK',
    'NEGATIVE_QUANTITY',
    'HIGH_DISCREPANCY',
    'STALE_INVENTORY',
    'RECEIPT_QTY_ANOMALY',
  ],
};

export interface AnomalyFilters {
  /** Category bucket: pricing | orders | inventory. */
  type?: string;
  /** Comma-separated severity list. */
  severity?: string;
  /** Filter by exact entity type (e.g. PRODUCT_PRICING). */
  entityType?: string;
  /** 1-based page index. */
  page?: number;
  /** Items per page (capped at {@link MAX_PAGE_SIZE}). */
  limit?: number;
}

export interface AnomalyDto {
  id: string;
  type: string;
  severity: string;
  entityType: string;
  entityId: string;
  description: string;
  metadata: Record<string, unknown> | null;
  isFalsePositive: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface AnomalyReportDto {
  generatedAt: string;
  summary: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    CRITICAL: number;
    total: number;
  };
  pricingAnomalies: AnomalyDto[];
  orderAnomalies: AnomalyDto[];
  inventoryAnomalies: AnomalyDto[];
  data: AnomalyDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** Decide which category an anomaly falls into based on its `type` field. */
export function categorise(type: string): AnomalyCategory | null {
  for (const [category, prefixes] of Object.entries(CATEGORY_TYPE_PREFIXES) as [
    AnomalyCategory,
    string[],
  ][]) {
    if (prefixes.some((p) => type.startsWith(p))) {
      return category;
    }
  }
  return null;
}

/** Map a Prisma row to the API DTO. */
export function mapAnomalyRow(row: {
  id: string;
  type: string;
  severity: string;
  entityType: string;
  entityId: string;
  description: string;
  metadata: Prisma.JsonValue | null;
  isFalsePositive: boolean;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}): AnomalyDto {
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    entityType: row.entityType,
    entityId: row.entityId,
    description: row.description,
    metadata:
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : null,
    isFalsePositive: row.isFalsePositive,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Build the Prisma where clause from filter input. The category filter
 * resolves to a `type startsWith` `OR` since the table doesn't have a
 * dedicated `category` column — the existing
 * `@@index([type, entityType])` covers it.
 */
export function buildAnomalyWhere(filters: AnomalyFilters): Prisma.AnomalyRecordWhereInput {
  const where: Prisma.AnomalyRecordWhereInput = {};

  if (filters.entityType) {
    where.entityType = filters.entityType.toUpperCase();
  }

  if (filters.severity) {
    const sevs = filters.severity
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s): s is Severity => VALID_SEVERITIES.has(s));
    if (sevs.length === 1) {
      where.severity = sevs[0];
    } else if (sevs.length > 1) {
      where.severity = { in: sevs };
    }
  }

  if (filters.type && VALID_CATEGORIES.has(filters.type)) {
    const prefixes = CATEGORY_TYPE_PREFIXES[filters.type as AnomalyCategory];
    where.OR = prefixes.map((p) => ({ type: { startsWith: p } }));
  }

  return where;
}

/**
 * Aggregate severity counts via `groupBy` so the count math runs in
 * Postgres, not in JS.
 */
export async function countBySeverity(
  where: Prisma.AnomalyRecordWhereInput,
): Promise<{ LOW: number; MEDIUM: number; HIGH: number; CRITICAL: number; total: number }> {
  const grouped = await prisma.anomalyRecord.groupBy({
    by: ['severity'],
    where,
    _count: { _all: true },
  });

  const summary = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0, total: 0 };
  for (const g of grouped) {
    const sev = g.severity.toUpperCase() as Severity;
    if (sev in summary) {
      summary[sev] = g._count._all;
    }
    summary.total += g._count._all;
  }
  return summary;
}

/**
 * List anomaly records with filters and bucket them by category for the
 * existing UI.
 *
 * The `data` + `pagination` fields satisfy the new flat-list contract,
 * while `pricingAnomalies` / `orderAnomalies` / `inventoryAnomalies` keep
 * the existing dashboard rendering.
 */
export async function listAnomalyRecords(
  filters: AnomalyFilters,
): Promise<AnomalyReportDto> {
  const { page, limit } = normalizePagination(filters.page, filters.limit);
  const where = buildAnomalyWhere(filters);

  const [total, rows, sevSummary] = await Promise.all([
    prisma.anomalyRecord.count({ where }),
    prisma.anomalyRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    countBySeverity(where),
  ]);

  const data = rows.map(mapAnomalyRow);

  const buckets: { pricing: AnomalyDto[]; orders: AnomalyDto[]; inventory: AnomalyDto[] } = {
    pricing: [],
    orders: [],
    inventory: [],
  };
  for (const a of data) {
    const cat = categorise(a.type);
    if (cat) buckets[cat].push(a);
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: sevSummary,
    pricingAnomalies: buckets.pricing,
    orderAnomalies: buckets.orders,
    inventoryAnomalies: buckets.inventory,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}

export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
