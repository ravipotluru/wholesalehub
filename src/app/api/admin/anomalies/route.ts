/**
 * Admin Anomaly Records API
 *
 * GET  /api/admin/anomalies              — list persisted anomaly records
 * GET  /api/admin/anomalies?type=pricing — filter by category bucket
 * GET  /api/admin/anomalies?severity=HIGH,CRITICAL — filter by severity
 * GET  /api/admin/anomalies?history=true — historical detection runs from cache
 * POST /api/admin/anomalies              — force re-run anomaly detection
 *
 * Auth: ADMIN or ANALYST roles only.
 *
 * The GET response keeps the legacy "report" shape — `summary`,
 * `pricingAnomalies`, `orderAnomalies`, `inventoryAnomalies` — so the
 * existing dashboard renders. It also exposes `data` + `pagination`
 * for the new flat-list contract.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import {
  listAnomalyRecords,
  VALID_CATEGORIES,
  VALID_SEVERITIES,
} from '@/lib/admin/anomaly-records';
import { runAllAnomalyDetection, getAnomalyHistory } from '@/lib/anomaly';

const ALLOWED_ROLES = new Set(['ADMIN', 'ANALYST']);

const listQuerySchema = z.object({
  type: z.string().optional(),
  severity: z.string().optional(),
  entityType: z.string().min(1).max(64).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  history: z.string().optional(),
  days: z.coerce.number().int().positive().max(30).optional(),
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
    const parsed = listQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return apiError({
        status: 400,
        code: 'ANOMALIES_INVALID_QUERY',
        message: 'Invalid query parameters',
        details: { issues: parsed.error.issues },
      });
    }
    const q = parsed.data;

    if (q.type && !VALID_CATEGORIES.has(q.type)) {
      return apiError({
        status: 400,
        code: 'ANOMALIES_INVALID_TYPE',
        message: `Invalid type filter. Must be one of: ${[...VALID_CATEGORIES].join(', ')}`,
      });
    }

    if (q.severity) {
      const parts = q.severity.split(',').map((s) => s.trim().toUpperCase());
      const bad = parts.find((p) => !VALID_SEVERITIES.has(p));
      if (bad) {
        return apiError({
          status: 400,
          code: 'ANOMALIES_INVALID_SEVERITY',
          message: `Invalid severity filter "${bad}". Must be one of: ${[...VALID_SEVERITIES].join(', ')}`,
        });
      }
    }

    // History mode reads cached run snapshots from `runAllAnomalyDetection`,
    // not the persisted record table. Keeps backward compatibility.
    if (q.history === 'true') {
      const days = q.days ?? 7;
      const history = await getAnomalyHistory(days);
      logger.info({
        event: 'anomaly_history_fetched',
        userId: user.id,
        days,
        reportCount: history.length,
      });
      return NextResponse.json({ history, count: history.length });
    }

    const report = await listAnomalyRecords({
      type: q.type,
      severity: q.severity,
      entityType: q.entityType,
      page: q.page,
      limit: q.limit,
    });

    logger.info({
      event: 'anomaly_records_listed',
      userId: user.id,
      filters: {
        type: q.type,
        severity: q.severity,
        entityType: q.entityType,
      },
      page: report.pagination.page,
      limit: report.pagination.limit,
      total: report.pagination.total,
    });

    return NextResponse.json(report);
  } catch (error) {
    logger.error({
      event: 'anomaly_api_get_error',
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'ANOMALIES_FETCH_FAILED',
      message: 'Failed to fetch anomaly records',
    });
  }
}

/**
 * POST /api/admin/anomalies
 *
 * Forces a fresh anomaly detection run regardless of cache age. The
 * detection logic still lives in `src/lib/anomaly/*` and writes nothing
 * to the persisted `AnomalyRecord` table — see the lib for details.
 */
export async function POST() {
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

    logger.info({
      event: 'anomaly_detection_force_run',
      userId: user.id,
      role: user.role,
    });

    const report = await runAllAnomalyDetection(undefined, true);

    logger.info({
      event: 'anomaly_detection_force_run_complete',
      userId: user.id,
      reportId: report.id,
      totalAnomalies: report.summary.total,
      durationMs: report.durationMs,
    });

    return NextResponse.json(report);
  } catch (error) {
    logger.error({
      event: 'anomaly_api_post_error',
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'ANOMALY_DETECTION_FAILED',
      message: 'Failed to run anomaly detection',
    });
  }
}
