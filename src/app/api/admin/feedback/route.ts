/**
 * Admin Feedback API
 *
 * GET   /api/admin/feedback           — correction stats and threshold configs
 * POST  /api/admin/feedback           — record correction or FP/FN feedback
 * PATCH /api/admin/feedback           — adjust threshold value
 *
 * Auth: ADMIN only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import {
  adjustThreshold,
  getFeedbackState,
  recordCorrection,
} from '@/lib/admin/feedback';

const ALLOWED_ROLES = new Set(['ADMIN']);

const FEEDBACK_TYPES = [
  'correction',
  'false_positive',
  'false_negative',
] as const;

/**
 * Map between the wire-level feedback types (`correction`,
 * `false_positive`, `false_negative`) and the DB's `feedbackType` enum
 * (`WRONG_VALUE`, `FALSE_POSITIVE`, `FALSE_NEGATIVE`).
 */
const WIRE_TO_DB_FEEDBACK: Record<typeof FEEDBACK_TYPES[number], string> = {
  correction: 'WRONG_VALUE',
  false_positive: 'FALSE_POSITIVE',
  false_negative: 'FALSE_NEGATIVE',
};

const postSchema = z.object({
  type: z.enum(FEEDBACK_TYPES),
  entityId: z.string().min(1),
  entityType: z.string().min(1).default('UNKNOWN'),
  field: z.string().nullable().optional(),
  originalValue: z.unknown().optional(),
  correctedValue: z.unknown().optional(),
  reason: z.string().optional(),
});

const patchSchema = z.object({
  metricName: z.string().min(1),
  newValue: z.number().finite(),
});

export async function GET() {
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

    const state = await getFeedbackState();

    logger.info({
      event: 'feedback_api_get',
      userId: user.id,
      totalCorrections: state.totalCorrections,
      totalThresholds: state.totalThresholds,
    });

    return NextResponse.json(state);
  } catch (error) {
    logger.error({
      event: 'feedback_api_get_error',
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'FEEDBACK_FETCH_FAILED',
      message: 'Failed to fetch feedback data',
    });
  }
}

export async function POST(request: NextRequest) {
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

    const body = (await request.json()) as unknown;
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return apiError({
        status: 400,
        code: 'FEEDBACK_INVALID_BODY',
        message: 'Invalid feedback body',
        details: { issues: parsed.error.issues },
      });
    }
    const data = parsed.data;

    const dbFeedbackType = WIRE_TO_DB_FEEDBACK[data.type];

    const persisted = await recordCorrection({
      entityType: data.entityType,
      entityId: data.entityId,
      fieldName: data.field ?? '',
      originalValue: stringify(data.originalValue),
      correctedValue: stringify(data.correctedValue),
      feedbackType: dbFeedbackType,
      correctedBy: user.email ?? user.id,
    });

    logger.info({
      event: 'feedback_recorded',
      userId: user.id,
      feedbackId: persisted.id,
      type: data.type,
      entityType: data.entityType,
      entityId: data.entityId,
    });

    return NextResponse.json(
      {
        success: true,
        feedback: {
          id: persisted.id,
          type: data.type,
          entityType: data.entityType,
          entityId: data.entityId,
          field: data.field ?? null,
          originalValue: data.originalValue ?? null,
          correctedValue: data.correctedValue ?? null,
          reason: data.reason ?? '',
          createdBy: user.email ?? user.id,
          createdAt: persisted.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error({
      event: 'feedback_api_post_error',
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'FEEDBACK_RECORD_FAILED',
      message: 'Failed to record feedback',
    });
  }
}

export async function PATCH(request: NextRequest) {
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

    const body = (await request.json()) as unknown;
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError({
        status: 400,
        code: 'FEEDBACK_INVALID_PATCH',
        message: 'Invalid threshold update',
        details: { issues: parsed.error.issues },
      });
    }

    const adjusted = await adjustThreshold(parsed.data);
    if (!adjusted) {
      return apiError({
        status: 404,
        code: 'FEEDBACK_THRESHOLD_NOT_FOUND',
        message: `Threshold "${parsed.data.metricName}" not found`,
      });
    }

    logger.info({
      event: 'threshold_adjusted',
      userId: user.id,
      metricName: parsed.data.metricName,
      previousValue: adjusted.previousValue,
      newValue: adjusted.currentValue,
    });

    return NextResponse.json({
      success: true,
      threshold: {
        metricName: adjusted.metricName,
        previousValue: adjusted.previousValue,
        currentValue: adjusted.currentValue,
        updatedBy: user.email ?? user.id,
        updatedAt: adjusted.updatedAt,
      },
    });
  } catch (error) {
    logger.error({
      event: 'feedback_api_patch_error',
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'FEEDBACK_PATCH_FAILED',
      message: 'Failed to adjust threshold',
    });
  }
}

/** Persist arbitrary client-supplied values as a string for the DB row. */
function stringify(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}
