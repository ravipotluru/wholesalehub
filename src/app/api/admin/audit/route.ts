/**
 * Admin Audit Trail API
 *
 * GET /api/admin/audit — list audit events with filtering and pagination
 *
 * Query params:
 *   entityType — ORDER | PRODUCT | RECEIPT | USER | PRICING
 *   action     — CREATE | UPDATE | DELETE | STATUS_CHANGE | LOGIN
 *   actorId    — filter by actorId substring (case-insensitive)
 *   actor      — alias for `actorId` (matches the field the audit page sends)
 *   from       — ISO date string (start of range, inclusive)
 *   to         — ISO date string (end of range, treated as inclusive of the day)
 *   dateFrom   — alias for `from`
 *   dateTo     — alias for `to`
 *   traceId    — filter by trace ID
 *   page       — page number (default 1)
 *   limit      — items per page (default 25, max 100)
 *
 * Auth: ADMIN or ANALYST roles only.
 *
 * Response shape: `{ data: AuditEvent[], pagination }` — matches the
 * existing UI's `AuditResponse` type.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import { listAuditEvents } from '@/lib/admin/audit';

/** Allowed role set for this endpoint */
const ALLOWED_ROLES = new Set(['ADMIN', 'ANALYST']);

/**
 * Query-param schema. Aliases (`actor`, `dateFrom`, `dateTo`) are
 * accepted because the existing audit page already sends those names —
 * preserving them keeps the UI working.
 */
const querySchema = z.object({
  entityType: z.string().min(1).max(64).optional(),
  action: z.string().min(1).max(64).optional(),
  actorId: z.string().min(1).max(256).optional(),
  actor: z.string().min(1).max(256).optional(),
  from: z.string().min(1).max(64).optional(),
  to: z.string().min(1).max(64).optional(),
  dateFrom: z.string().min(1).max(64).optional(),
  dateTo: z.string().min(1).max(64).optional(),
  traceId: z.string().min(1).max(128).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return apiError({
        status: 401,
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      });
    }

    if (!ALLOWED_ROLES.has(user.role)) {
      return apiError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Forbidden',
        logContext: { userId: user.id, role: user.role },
      });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return apiError({
        status: 400,
        code: 'AUDIT_INVALID_QUERY',
        message: 'Invalid query parameters',
        details: { issues: parsed.error.issues },
      });
    }

    const q = parsed.data;
    const result = await listAuditEvents({
      entityType: q.entityType,
      action: q.action,
      actorId: q.actorId ?? q.actor,
      from: q.from ?? q.dateFrom,
      to: q.to ?? q.dateTo,
      traceId: q.traceId,
      page: q.page,
      limit: q.limit,
    });

    logger.info({
      event: 'audit_api_list',
      userId: user.id,
      filters: {
        entityType: q.entityType,
        action: q.action,
        actorId: q.actorId ?? q.actor,
        traceId: q.traceId,
        from: q.from ?? q.dateFrom,
        to: q.to ?? q.dateTo,
      },
      page: result.pagination.page,
      limit: result.pagination.limit,
      total: result.pagination.total,
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error({
      event: 'audit_api_get_error',
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'AUDIT_LIST_FAILED',
      message: 'Failed to fetch audit events',
    });
  }
}
