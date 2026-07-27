/**
 * Admin Anomaly Detection API
 *
 * GET  /api/admin/anomalies              — returns anomaly report (cached if <1h)
 * GET  /api/admin/anomalies?type=pricing — filter by anomaly category
 * GET  /api/admin/anomalies?severity=HIGH,CRITICAL — filter by severity
 * POST /api/admin/anomalies              — force re-run anomaly detection
 *
 * Auth: ADMIN or ANALYST roles only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import {
  runAllAnomalyDetection,
  AnomalySeverity,
  type AnomalyReport,
  type AnyAnomaly,
} from '@/lib/anomaly';

/** Allowed role set for this endpoint */
const ALLOWED_ROLES = new Set(['ADMIN', 'ANALYST']);

/** Valid anomaly category filter values */
const VALID_TYPES = new Set(['pricing', 'orders', 'inventory']);

/** Valid severity filter values */
const VALID_SEVERITIES = new Set<string>(Object.values(AnomalySeverity));

/**
 * GET /api/admin/anomalies
 *
 * Returns the latest anomaly report. If a cached report exists that is
 * less than 1 hour old it is returned immediately; otherwise a fresh
 * detection run is triggered.
 *
 * Query Parameters:
 * - `type`     — Filter results to a single category: "pricing", "orders", or "inventory"
 * - `severity` — Comma-separated severity levels to include: "LOW", "MEDIUM", "HIGH", "CRITICAL"
 * - `history`  — If "true", returns historical reports instead of the latest
 * - `days`     — Number of days of history (default 7, max 30). Only used with history=true
 */
export async function GET(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = user.role;

    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Parse query parameters ────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get('type');
    const severityFilter = searchParams.get('severity');
    const isHistory = searchParams.get('history') === 'true';
    const daysParam = searchParams.get('days');

    // Validate type filter
    if (typeFilter && !VALID_TYPES.has(typeFilter)) {
      return NextResponse.json(
        { error: `Invalid type filter. Must be one of: ${Array.from(VALID_TYPES).join(', ')}` },
        { status: 400 },
      );
    }

    // Validate severity filter
    const severitySet = new Set<string>();
    if (severityFilter) {
      const parts = severityFilter.split(',').map((s) => s.trim().toUpperCase());
      for (const part of parts) {
        if (!VALID_SEVERITIES.has(part)) {
          return NextResponse.json(
            {
              error: `Invalid severity filter "${part}". Must be one of: ${Array.from(VALID_SEVERITIES).join(', ')}`,
            },
            { status: 400 },
          );
        }
        severitySet.add(part);
      }
    }

    // ── History mode ──────────────────────────────────────────────────────
    if (isHistory) {
      const { getAnomalyHistory } = await import('@/lib/anomaly');
      const days = Math.min(Math.max(parseInt(daysParam ?? '7', 10) || 7, 1), 30);
      const history = await getAnomalyHistory(days);

      logger.info({
        event: 'anomaly_history_fetched',
        userId: user.id,
        days,
        reportCount: history.length,
      });

      return NextResponse.json({ history, count: history.length });
    }

    // ── Run detection (uses cache by default) ─────────────────────────────
    const report = await runAllAnomalyDetection();

    // ── Apply filters ─────────────────────────────────────────────────────
    const filtered = applyFilters(report, typeFilter, severitySet);

    logger.info({
      event: 'anomaly_report_fetched',
      userId: user.id,
      reportId: report.id,
      filters: { type: typeFilter, severity: severityFilter },
      totalAnomalies: filtered.summary.total,
    });

    return NextResponse.json(filtered);
  } catch (error) {
    logger.error({
      event: 'anomaly_api_get_error',
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    return NextResponse.json(
      { error: 'Failed to fetch anomaly report' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/anomalies
 *
 * Forces a fresh anomaly detection run regardless of cache age.
 * Only accessible to ADMIN and ANALYST roles.
 */
export async function POST() {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = user.role;

    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    logger.info({
      event: 'anomaly_detection_force_run',
      userId: user.id,
      role,
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
      stack: (error as Error).stack,
    });
    return NextResponse.json(
      { error: 'Failed to run anomaly detection' },
      { status: 500 },
    );
  }
}

// ─── HELPERS ───────────────────────────────────────────────────────────────────

/**
 * Apply optional type and severity filters to an anomaly report.
 *
 * @param report      - The full anomaly report
 * @param typeFilter  - Optional category: "pricing", "orders", or "inventory"
 * @param severitySet - Optional set of severity levels to include
 * @returns A new report with filtered anomaly arrays and recalculated summary
 */
function applyFilters(
  report: AnomalyReport,
  typeFilter: string | null,
  severitySet: Set<string>,
): AnomalyReport {
  const hasSeverityFilter = severitySet.size > 0;
  const hasTypeFilter = typeFilter !== null;

  // If no filters, return as-is
  if (!hasTypeFilter && !hasSeverityFilter) return report;

  // Helper: check severity
  const matchesSeverity = (a: AnyAnomaly): boolean =>
    !hasSeverityFilter || severitySet.has(a.severity);

  // Filter each category
  let pricingAnomalies = report.pricingAnomalies;
  let orderAnomalies = report.orderAnomalies;
  let inventoryAnomalies = report.inventoryAnomalies;

  if (hasTypeFilter) {
    if (typeFilter !== 'pricing') pricingAnomalies = [];
    if (typeFilter !== 'orders') orderAnomalies = [];
    if (typeFilter !== 'inventory') inventoryAnomalies = [];
  }

  if (hasSeverityFilter) {
    pricingAnomalies = pricingAnomalies.filter(matchesSeverity);
    orderAnomalies = orderAnomalies.filter(matchesSeverity);
    inventoryAnomalies = inventoryAnomalies.filter(matchesSeverity);
  }

  // Recalculate summary
  const all: AnyAnomaly[] = [
    ...pricingAnomalies,
    ...orderAnomalies,
    ...inventoryAnomalies,
  ];

  const summary = {
    [AnomalySeverity.LOW]: 0,
    [AnomalySeverity.MEDIUM]: 0,
    [AnomalySeverity.HIGH]: 0,
    [AnomalySeverity.CRITICAL]: 0,
    total: all.length,
  };

  for (const a of all) {
    summary[a.severity] += 1;
  }

  return {
    ...report,
    summary,
    pricingAnomalies,
    orderAnomalies,
    inventoryAnomalies,
  };
}
