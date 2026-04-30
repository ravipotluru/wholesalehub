/**
 * Admin Data Lineage API
 *
 * GET /api/admin/lineage — get lineage chain for an entity
 *
 * Query params:
 *   entityType  — RECEIPT | ORDER | PRODUCT | PRICING (case-insensitive)
 *   entityId    — the entity identifier
 *   sourceType  — optional filter by source type
 *
 * Response: `LineageChain` (entityType, entityId, entityName, nodes,
 * sourceDocument) — matches the existing lineage UI's `LineageChain`
 * type.
 *
 * Auth: ADMIN or ANALYST roles only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/session';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import {
  getLineageChain,
  VALID_LINEAGE_ENTITY_TYPES,
} from '@/lib/admin/lineage';

const ALLOWED_ROLES = new Set(['ADMIN', 'ANALYST']);

const querySchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  sourceType: z.string().min(1).max(64).optional(),
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
        code: 'LINEAGE_INVALID_QUERY',
        message: 'Missing entityType or entityId query parameter',
        details: { issues: parsed.error.issues },
      });
    }

    const entityType = parsed.data.entityType.toUpperCase();
    if (!VALID_LINEAGE_ENTITY_TYPES.has(entityType)) {
      return apiError({
        status: 400,
        code: 'LINEAGE_INVALID_ENTITY_TYPE',
        message: `Invalid entityType. Must be one of: ${[...VALID_LINEAGE_ENTITY_TYPES].join(', ')}`,
      });
    }

    const lineage = await getLineageChain({
      entityType,
      entityId: parsed.data.entityId,
      sourceType: parsed.data.sourceType,
    });

    logger.info({
      event: 'lineage_api_get',
      userId: user.id,
      entityType,
      entityId: parsed.data.entityId,
      sourceType: parsed.data.sourceType,
      nodeCount: lineage.nodes.length,
    });

    return NextResponse.json(lineage);
  } catch (error) {
    logger.error({
      event: 'lineage_api_get_error',
      error: (error as Error).message,
    });
    return apiError({
      status: 500,
      code: 'LINEAGE_FETCH_FAILED',
      message: 'Failed to fetch lineage data',
    });
  }
}
