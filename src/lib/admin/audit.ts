/**
 * Admin audit-event query helpers.
 *
 * Wraps Prisma `AuditEvent` queries behind a function the route handler
 * can call. Pure logic so it's unit-testable with a mocked prisma client.
 *
 * The shape we return matches what the existing audit UI consumes
 * (`{ data, pagination }`) so swapping the route from mock to DB doesn't
 * break the page.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/** Maximum page size enforced for every paginated admin list. */
export const MAX_PAGE_SIZE = 100;

/** Default page size when the caller doesn't specify one. */
export const DEFAULT_PAGE_SIZE = 25;

export interface AuditFilters {
  /** Filter by entity type (case-insensitive). */
  entityType?: string;
  /** Filter by action verb (case-insensitive). */
  action?: string;
  /** Substring match against actorId; case-insensitive. */
  actorId?: string;
  /** Inclusive lower bound for `timestamp`. ISO date string. */
  from?: string;
  /** Exclusive upper bound for `timestamp`. ISO date string; treated as
   *  "end of that day" so a date-only filter is inclusive of the day. */
  to?: string;
  /** Filter by exact `traceId`. */
  traceId?: string;
  /** 1-based page index. */
  page?: number;
  /** Items per page (capped at {@link MAX_PAGE_SIZE}). */
  limit?: number;
}

/** Single audit event in the API response. */
export interface AuditEventDto {
  id: string;
  timestamp: string;
  actor: string;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string;
  traceId: string;
  changedFields: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface PaginationDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AuditListResult {
  data: AuditEventDto[];
  pagination: PaginationDto;
}

/**
 * Coerce raw query input into a pagination tuple. Negative / zero / NaN
 * collapses to defaults; oversized `limit` is clamped.
 */
export function normalizePagination(
  rawPage: number | undefined,
  rawLimit: number | undefined,
): { page: number; limit: number } {
  const page = Number.isFinite(rawPage) && (rawPage as number) > 0
    ? Math.floor(rawPage as number)
    : 1;
  const limit = Number.isFinite(rawLimit) && (rawLimit as number) > 0
    ? Math.min(Math.floor(rawLimit as number), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  return { page, limit };
}

/**
 * Build a Prisma `where` clause from the parsed filters. Exported so
 * tests can verify the where-shape directly without hitting the DB
 * layer.
 */
export function buildAuditWhere(filters: AuditFilters): Prisma.AuditEventWhereInput {
  const where: Prisma.AuditEventWhereInput = {};

  if (filters.entityType) {
    where.entityType = filters.entityType.toUpperCase();
  }
  if (filters.action) {
    where.action = filters.action.toUpperCase();
  }
  if (filters.traceId) {
    where.traceId = filters.traceId;
  }
  if (filters.actorId) {
    where.actorId = { contains: filters.actorId, mode: 'insensitive' };
  }

  if (filters.from || filters.to) {
    const range: Prisma.DateTimeFilter = {};
    if (filters.from) {
      const fromDate = new Date(filters.from);
      if (!Number.isNaN(fromDate.getTime())) {
        range.gte = fromDate;
      }
    }
    if (filters.to) {
      const toDate = new Date(filters.to);
      if (!Number.isNaN(toDate.getTime())) {
        // Treat `to` as inclusive of the day — the UI's date input
        // gives us a YYYY-MM-DD value, so add 24h and use exclusive lt.
        range.lt = new Date(toDate.getTime() + 86_400_000);
      }
    }
    if (range.gte || range.lt) {
      where.timestamp = range;
    }
  }

  return where;
}

/** Map a Prisma row to the API DTO. Centralised so route + tests agree. */
export function mapAuditRow(row: {
  id: string;
  timestamp: Date;
  actorId: string | null;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string;
  traceId: string | null;
  changedFields: string[];
  previousState: Prisma.JsonValue | null;
  newState: Prisma.JsonValue | null;
}): AuditEventDto {
  return {
    id: row.id,
    timestamp: row.timestamp.toISOString(),
    actor: row.actorId ?? 'SYSTEM',
    actorType: row.actorType,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    traceId: row.traceId ?? '',
    changedFields: row.changedFields,
    before: row.previousState as Record<string, unknown> | null,
    after: row.newState as Record<string, unknown> | null,
  };
}

/**
 * Run the paginated audit query.
 *
 * Returns events ordered newest-first. Uses `prisma.$transaction` to
 * issue the count + page query in a single round-trip, which keeps the
 * total count consistent with the rows we ship.
 */
export async function listAuditEvents(filters: AuditFilters): Promise<AuditListResult> {
  const { page, limit } = normalizePagination(filters.page, filters.limit);
  const where = buildAuditWhere(filters);

  const [total, rows] = await prisma.$transaction([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    data: rows.map(mapAuditRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}
