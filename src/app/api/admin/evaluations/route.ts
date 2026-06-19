/**
 * Admin Evaluation API
 *
 * GET  /api/admin/evaluations              — list evaluation runs
 * GET  /api/admin/evaluations?type=search  — filter by type
 * GET  /api/admin/evaluations?runId=x      — get a specific run
 * POST /api/admin/evaluations              — trigger a new evaluation (stub)
 *
 * Response shape: `{ runs: EvaluationRun[], count: number }` — matches
 * the existing UI's `EvalResponse` type. Each run includes its
 * `metrics` summary (accuracy, precision, recall, F1, MRR if present).
 *
 * Auth: ADMIN or ANALYST roles only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import {
  getEvaluationRun,
  listEvaluationRuns,
  VALID_EVAL_TYPES,
} from '@/lib/admin/evaluations';

const ALLOWED_ROLES = new Set(['ADMIN', 'ANALYST']);

const getQuerySchema = z.object({
  type: z.string().optional(),
  runId: z.string().min(1).optional(),
});

const postBodySchema = z.object({
  type: z.string().min(1),
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
    const parsed = getQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return apiError({
        status: 400,
        code: 'EVALUATIONS_INVALID_QUERY',
        message: 'Invalid query parameters',
        details: { issues: parsed.error.issues },
      });
    }

    const { type, runId } = parsed.data;

    if (type && !VALID_EVAL_TYPES.has(type)) {
      return apiError({
        status: 400,
        code: 'EVALUATIONS_INVALID_TYPE',
        message: `Invalid type. Must be one of: ${[...VALID_EVAL_TYPES].join(', ')}`,
      });
    }

    if (runId) {
      const run = await getEvaluationRun(runId);
      if (!run) {
        return apiError({
          status: 404,
          code: 'EVALUATIONS_RUN_NOT_FOUND',
          message: 'Run not found',
        });
      }
      return NextResponse.json(run);
    }

    const result = await listEvaluationRuns({ type });

    logger.info({
      event: 'evaluations_api_list',
      userId: user.id,
      typeFilter: type ?? null,
      count: result.count,
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error({
      event: 'evaluations_api_get_error',
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'EVALUATIONS_FETCH_FAILED',
      message: 'Failed to fetch evaluations',
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
    const parsed = postBodySchema.safeParse(body);
    if (!parsed.success || !VALID_EVAL_TYPES.has(parsed.data.type)) {
      return apiError({
        status: 400,
        code: 'EVALUATIONS_INVALID_BODY',
        message: `Invalid type. Must be one of: ${[...VALID_EVAL_TYPES].join(', ')}`,
      });
    }

    const evalType = parsed.data.type;

    logger.info({
      event: 'evaluations_api_trigger',
      userId: user.id,
      type: evalType,
    });

    // Triggering an actual run would dispatch a background job. We don't
    // own that scheduler here, so we return a stub run that mirrors what
    // the listing would surface once the run completes. This keeps the
    // route usable from the UI without coupling to the scheduler.
    const stub = {
      id: `eval_${evalType}_${Date.now().toString(36)}`,
      runName: `${evalType.charAt(0).toUpperCase() + evalType.slice(1)} Eval - ${new Date().toISOString().slice(0, 10)}`,
      type: evalType,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      sampleCount: 0,
      metrics: {
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        falsePositiveRate: 0,
        falseNegativeRate: 0,
        totalSamples: 0,
      },
      results: [],
    };

    return NextResponse.json(stub, { status: 201 });
  } catch (error) {
    logger.error({
      event: 'evaluations_api_post_error',
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'EVALUATIONS_TRIGGER_FAILED',
      message: 'Failed to trigger evaluation',
    });
  }
}
