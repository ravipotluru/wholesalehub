/**
 * Admin Feedback API
 *
 * GET   /api/admin/feedback           — correction stats and threshold configs
 * POST  /api/admin/feedback           — record correction or FP/FN feedback
 * PATCH /api/admin/feedback           — adjust threshold
 *
 * Auth: ADMIN only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';

/** Allowed role set for this endpoint */
const ALLOWED_ROLES = new Set(['ADMIN']);

// ─── Mock Data ───

interface CorrectionStat {
  entityType: string;
  totalCorrections: number;
  last7Days: number;
  last30Days: number;
  topCorrectedFields: { field: string; count: number }[];
}

interface ThresholdConfig {
  metricName: string;
  currentValue: number;
  defaultValue: number;
  description: string;
  lastUpdated: string;
  updatedBy: string;
}

interface FeedbackEntry {
  id: string;
  type: 'correction' | 'false_positive' | 'false_negative';
  entityType: string;
  entityId: string;
  field: string | null;
  originalValue: unknown;
  correctedValue: unknown;
  reason: string;
  createdBy: string;
  createdAt: string;
}

function getMockCorrectionStats(): CorrectionStat[] {
  return [
    {
      entityType: 'EXTRACTION',
      totalCorrections: 247,
      last7Days: 18,
      last30Days: 62,
      topCorrectedFields: [
        { field: 'quantity', count: 89 },
        { field: 'unit_cost', count: 54 },
        { field: 'supplier_name', count: 38 },
        { field: 'line_total', count: 31 },
        { field: 'product_description', count: 25 },
      ],
    },
    {
      entityType: 'SEARCH',
      totalCorrections: 134,
      last7Days: 12,
      last30Days: 45,
      topCorrectedFields: [
        { field: 'relevance_ranking', count: 67 },
        { field: 'missing_result', count: 42 },
        { field: 'false_positive_result', count: 25 },
      ],
    },
    {
      entityType: 'ANOMALY',
      totalCorrections: 89,
      last7Days: 6,
      last30Days: 28,
      topCorrectedFields: [
        { field: 'false_positive_pricing', count: 45 },
        { field: 'false_positive_order', count: 22 },
        { field: 'missed_anomaly', count: 14 },
        { field: 'severity_override', count: 8 },
      ],
    },
  ];
}

function getMockThresholdConfigs(): ThresholdConfig[] {
  return [
    { metricName: 'pricing_zscore_low', currentValue: 2.0, defaultValue: 2.0, description: 'Z-score threshold for LOW severity pricing anomalies', lastUpdated: new Date(Date.now() - 86400000 * 10).toISOString(), updatedBy: 'admin@wholesalehub.com' },
    { metricName: 'pricing_zscore_medium', currentValue: 2.5, defaultValue: 2.5, description: 'Z-score threshold for MEDIUM severity pricing anomalies', lastUpdated: new Date(Date.now() - 86400000 * 10).toISOString(), updatedBy: 'admin@wholesalehub.com' },
    { metricName: 'pricing_zscore_high', currentValue: 3.0, defaultValue: 3.0, description: 'Z-score threshold for HIGH severity pricing anomalies', lastUpdated: new Date(Date.now() - 86400000 * 10).toISOString(), updatedBy: 'admin@wholesalehub.com' },
    { metricName: 'price_change_percent', currentValue: 20, defaultValue: 20, description: 'Percent change to trigger price spike/drop alert', lastUpdated: new Date(Date.now() - 86400000 * 7).toISOString(), updatedBy: 'admin@wholesalehub.com' },
    { metricName: 'order_large_zscore', currentValue: 2.0, defaultValue: 2.0, description: 'Z-score threshold for large order detection', lastUpdated: new Date(Date.now() - 86400000 * 15).toISOString(), updatedBy: 'system' },
    { metricName: 'order_freq_multiplier', currentValue: 3.0, defaultValue: 3.0, description: 'Multiplier for high frequency order detection', lastUpdated: new Date(Date.now() - 86400000 * 15).toISOString(), updatedBy: 'system' },
    { metricName: 'inventory_discrepancy_rate', currentValue: 10, defaultValue: 10, description: 'Discrepancy rate % threshold for inventory anomalies', lastUpdated: new Date(Date.now() - 86400000 * 20).toISOString(), updatedBy: 'system' },
    { metricName: 'inventory_stale_days', currentValue: 90, defaultValue: 90, description: 'Days without receipt to flag stale inventory', lastUpdated: new Date(Date.now() - 86400000 * 20).toISOString(), updatedBy: 'system' },
    { metricName: 'extraction_auto_accept_threshold', currentValue: 0.95, defaultValue: 0.95, description: 'Confidence threshold for auto-accepting extractions', lastUpdated: new Date(Date.now() - 86400000 * 5).toISOString(), updatedBy: 'admin@wholesalehub.com' },
    { metricName: 'search_min_relevance_score', currentValue: 0.3, defaultValue: 0.25, description: 'Minimum relevance score for search results', lastUpdated: new Date(Date.now() - 86400000 * 3).toISOString(), updatedBy: 'admin@wholesalehub.com' },
  ];
}

// ─── GET ───

export async function GET() {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = user.role;

    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const correctionStats = getMockCorrectionStats();
    const thresholdConfigs = getMockThresholdConfigs();

    logger.info({
      event: 'feedback_api_get',
      userId: user.id,
    });

    return NextResponse.json({
      correctionStats,
      thresholdConfigs,
      totalCorrections: correctionStats.reduce((sum, s) => sum + s.totalCorrections, 0),
      totalThresholds: thresholdConfigs.length,
    });
  } catch (error) {
    logger.error({
      event: 'feedback_api_get_error',
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Failed to fetch feedback data' },
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

    const body = await request.json() as {
      type?: string;
      entityId?: string;
      entityType?: string;
      field?: string;
      originalValue?: unknown;
      correctedValue?: unknown;
      reason?: string;
    };

    if (!body.type || !body.entityId) {
      return NextResponse.json(
        { error: 'Missing type or entityId' },
        { status: 400 },
      );
    }

    const validTypes = ['correction', 'false_positive', 'false_negative'];
    if (!validTypes.includes(body.type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 },
      );
    }

    const entry: FeedbackEntry = {
      id: `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type: body.type as FeedbackEntry['type'],
      entityType: body.entityType ?? 'UNKNOWN',
      entityId: body.entityId,
      field: body.field ?? null,
      originalValue: body.originalValue ?? null,
      correctedValue: body.correctedValue ?? null,
      reason: body.reason ?? '',
      createdBy: user.email ?? 'unknown',
      createdAt: new Date().toISOString(),
    };

    logger.info({
      event: 'feedback_recorded',
      userId: user.id,
      feedbackId: entry.id,
      type: entry.type,
      entityType: entry.entityType,
      entityId: entry.entityId,
    });

    return NextResponse.json({ success: true, feedback: entry }, { status: 201 });
  } catch (error) {
    logger.error({
      event: 'feedback_api_post_error',
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Failed to record feedback' },
      { status: 500 },
    );
  }
}

// ─── PATCH ───

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = user.role;

    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json() as {
      metricName?: string;
      newValue?: number;
    };

    if (!body.metricName || body.newValue === undefined) {
      return NextResponse.json(
        { error: 'Missing metricName or newValue' },
        { status: 400 },
      );
    }

    if (typeof body.newValue !== 'number' || isNaN(body.newValue)) {
      return NextResponse.json(
        { error: 'newValue must be a valid number' },
        { status: 400 },
      );
    }

    logger.info({
      event: 'threshold_adjusted',
      userId: user.id,
      metricName: body.metricName,
      newValue: body.newValue,
    });

    return NextResponse.json({
      success: true,
      threshold: {
        metricName: body.metricName,
        previousValue: 2.0,
        currentValue: body.newValue,
        updatedBy: user.email ?? 'unknown',
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error({
      event: 'feedback_api_patch_error',
      error: (error as Error).message,
    });
    return NextResponse.json(
      { error: 'Failed to adjust threshold' },
      { status: 500 },
    );
  }
}
