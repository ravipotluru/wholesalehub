/**
 * Admin LLMOps API
 *
 * GET  /api/admin/llmops                    — dashboard data (KPIs, prompts,
 *                                              daily invocations, cost breakdown)
 * GET  /api/admin/llmops?view=prompts       — prompt registry only
 * GET  /api/admin/llmops?view=invocations   — daily invocation chart only
 * GET  /api/admin/llmops?view=abtests       — A/B tests only
 * POST /api/admin/llmops                    — register prompt / manage A/B test
 *
 * Auth: ADMIN only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import { getLLMOpsDashboard } from '@/lib/admin/llmops';

const ALLOWED_ROLES = new Set(['ADMIN']);

const VALID_VIEWS = ['all', 'prompts', 'invocations', 'abtests'] as const;

const querySchema = z.object({
  view: z.enum(VALID_VIEWS).optional(),
  days: z.coerce.number().int().positive().max(365).optional(),
});

const postSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('register_prompt'),
    name: z.string().min(1),
    version: z.string().min(1),
  }),
  z.object({
    action: z.literal('start_ab_test'),
    testName: z.string().min(1),
  }),
  z.object({
    action: z.literal('stop_ab_test'),
    testId: z.string().min(1),
  }),
]);

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
        code: 'LLMOPS_INVALID_QUERY',
        message: 'Invalid query parameters',
        details: { issues: parsed.error.issues },
      });
    }

    const result = await getLLMOpsDashboard({
      view: parsed.data.view,
      days: parsed.data.days,
    });

    logger.info({
      event: 'llmops_api_get',
      userId: user.id,
      view: parsed.data.view ?? 'all',
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error({
      event: 'llmops_api_get_error',
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'LLMOPS_FETCH_FAILED',
      message: 'Failed to fetch LLMOps data',
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
        code: 'LLMOPS_INVALID_BODY',
        message: 'Invalid request body',
        details: { issues: parsed.error.issues },
      });
    }

    const action = parsed.data.action;
    logger.info({
      event: 'llmops_api_post',
      userId: user.id,
      action,
    });

    switch (parsed.data.action) {
      case 'register_prompt': {
        const { name, version } = parsed.data;
        return NextResponse.json(
          {
            success: true,
            prompt: {
              id: `prompt_${name.toLowerCase()}_v${version.replace(/\./g, '_')}`,
              name,
              version,
              status: 'draft',
              createdAt: new Date().toISOString(),
            },
          },
          { status: 201 },
        );
      }
      case 'start_ab_test': {
        const { testName } = parsed.data;
        return NextResponse.json(
          {
            success: true,
            abTest: {
              id: `ab_${Date.now().toString(36)}`,
              name: testName,
              status: 'running',
              startedAt: new Date().toISOString(),
            },
          },
          { status: 201 },
        );
      }
      case 'stop_ab_test': {
        const { testId } = parsed.data;
        return NextResponse.json({
          success: true,
          abTest: {
            id: testId,
            status: 'concluded',
            concludedAt: new Date().toISOString(),
          },
        });
      }
    }
  } catch (error) {
    logger.error({
      event: 'llmops_api_post_error',
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'LLMOPS_ACTION_FAILED',
      message: 'Failed to process LLMOps action',
    });
  }
}
